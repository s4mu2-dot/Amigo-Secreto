/**
 * AMIGO SECRETO - Backend
 * ------------------------------------------------------
 * Servidor Express que expone una API REST para:
 *  - Crear salas (grupo + presupuesto)
 *  - Registrar participantes con su lista de deseos
 *  - Editar la lista de deseos propia
 *  - Ejecutar el sorteo (solo el organizador)
 *  - Enviar un correo privado a cada participante con
 *    el nombre y la lista de deseos de la persona que le tocó
 *
 * Persistencia: un archivo JSON simple (data/rooms.json).
 * Esto es suficiente para una demo/evidencia de proyecto;
 * en producción se recomendaría una base de datos real.
 */

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'rooms.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================
// PERSISTENCIA SIMPLE EN ARCHIVO JSON
// =========================================================

function loadRooms() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    console.error('Error leyendo rooms.json, se inicia vacío:', e.message);
    return {};
  }
}

function saveRooms(rooms) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
}

// Estado en memoria, respaldado en disco en cada cambio
let rooms = loadRooms();

// =========================================================
// CONFIGURACIÓN DE CORREO (Nodemailer)
// =========================================================
// Para usar Gmail:
//  1. Activa la verificación en 2 pasos en tu cuenta de Google.
//  2. Genera una "Contraseña de aplicación" en
//     https://myaccount.google.com/apppasswords
//  3. Copia ese valor en EMAIL_PASS dentro del archivo .env
//
// Si prefieres otro proveedor (Outlook, SendGrid SMTP, etc.)
// solo cambia EMAIL_SERVICE o usa la config "host/port" de
// nodemailer en su lugar.
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendAssignmentEmail(participant, giftee, room) {
  const wishlistHtml = giftee.wishlist.length
    ? `<ul>${giftee.wishlist.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
    : '<p><em>(Todavía no dejó su lista de deseos)</em></p>';

  const mailOptions = {
    from: `"Amigo Secreto - ${room.name}" <${process.env.EMAIL_USER}>`,
    to: participant.email,
    subject: `🎁 ¡Ya tienes a tu Amigo Secreto en "${room.name}"!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
        <h2>¡Hola ${escapeHtml(participant.name)}! 🎄</h2>
        <p>El sorteo del grupo <strong>${escapeHtml(room.name)}</strong> ya se realizó.</p>
        <p>Presupuesto sugerido: <strong>${escapeHtml(String(room.budget))}</strong></p>
        <hr/>
        <p>Le debes regalar a:</p>
        <h3 style="color:#c0392b;">${escapeHtml(giftee.name)}</h3>
        <p>Su lista de deseos es:</p>
        ${wishlistHtml}
        <hr/>
        <p style="font-size: 0.9em; color: #555;">
          Este resultado es privado y solo tú lo puedes ver. ¡No lo compartas para que la sorpresa se mantenga! 🤫
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

// Evita inyección básica de HTML en los correos
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// =========================================================
// UTILIDADES
// =========================================================

// Código corto de sala, ej: "A1B2C3"
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Sorteo tipo "derangement": nadie se puede sacar a sí mismo.
// Se hace por fuerza bruta con barajado + validación, es rápido
// para el tamaño típico de un amigo secreto (decenas de personas).
function drawNames(participants) {
  const ids = participants.map((p) => p.id);
  let shuffled;
  let valid = false;
  let attempts = 0;

  while (!valid && attempts < 2000) {
    shuffled = [...ids].sort(() => Math.random() - 0.5);
    valid = shuffled.every((id, i) => id !== ids[i]);
    attempts++;
  }

  if (!valid) {
    throw new Error('No se pudo generar un sorteo válido, intenta de nuevo.');
  }

  const assignment = {};
  ids.forEach((id, i) => {
    assignment[id] = shuffled[i]; // id (regala a) -> shuffled[i] (recibe)
  });
  return assignment;
}

// =========================================================
// RUTAS API
// =========================================================

// --- Crear sala ---
app.post('/api/rooms', (req, res) => {
  const { name, budget, organizerName, organizerEmail } = req.body;

  if (!name || !budget) {
    return res.status(400).json({ error: 'El nombre del grupo y el presupuesto son obligatorios.' });
  }

  const roomId = generateRoomCode();
  const organizerToken = uuidv4();

  rooms[roomId] = {
    id: roomId,
    name,
    budget,
    organizerName: organizerName || '',
    organizerEmail: organizerEmail || '',
    organizerToken,
    participants: [],
    assignment: null,
    drawn: false,
    createdAt: new Date().toISOString(),
  };

  saveRooms(rooms);

  res.json({ roomId, organizerToken });
});

// --- Info pública de la sala (sin tokens ni asignaciones) ---
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Sala no encontrada.' });

  res.json({
    id: room.id,
    name: room.name,
    budget: room.budget,
    drawn: room.drawn,
    participantsCount: room.participants.length,
    participants: room.participants.map((p) => ({ id: p.id, name: p.name })),
  });
});

// --- Registrar participante ---
app.post('/api/rooms/:roomId/participants', (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Sala no encontrada.' });
  if (room.drawn) return res.status(400).json({ error: 'El sorteo ya se realizó, no se pueden agregar más personas.' });

  const { name, email, wishlist } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
  }

  const yaRegistrado = room.participants.some(
    (p) => p.email.toLowerCase() === email.toLowerCase()
  );
  if (yaRegistrado) {
    return res.status(400).json({ error: 'Este correo ya está registrado en esta sala.' });
  }

  const participant = {
    id: uuidv4(),
    editToken: uuidv4(),
    name,
    email,
    wishlist: Array.isArray(wishlist) ? wishlist.filter(Boolean) : [],
  };

  room.participants.push(participant);
  saveRooms(rooms);

  res.json({ participantId: participant.id, editToken: participant.editToken });
});

// --- Editar mi propia lista de deseos ---
app.put('/api/rooms/:roomId/participants/:participantId', (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Sala no encontrada.' });

  const participant = room.participants.find((p) => p.id === req.params.participantId);
  if (!participant) return res.status(404).json({ error: 'Participante no encontrado.' });

  const { editToken, wishlist } = req.body;
  if (editToken !== participant.editToken) {
    return res.status(403).json({ error: 'Token de edición inválido.' });
  }

  participant.wishlist = Array.isArray(wishlist) ? wishlist.filter(Boolean) : participant.wishlist;
  saveRooms(rooms);

  res.json({ success: true, wishlist: participant.wishlist });
});

// --- Ejecutar el sorteo (solo el organizador) ---
app.post('/api/rooms/:roomId/draw', async (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Sala no encontrada.' });

  const { organizerToken } = req.body;
  if (organizerToken !== room.organizerToken) {
    return res.status(403).json({ error: 'No autorizado. Token de organizador inválido.' });
  }

  if (room.drawn) {
    return res.status(400).json({ error: 'El sorteo ya se realizó anteriormente.' });
  }

  if (room.participants.length < 3) {
    return res.status(400).json({ error: 'Se necesitan al menos 3 participantes para poder sortear.' });
  }

  let assignment;
  try {
    assignment = drawNames(room.participants);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  room.assignment = assignment; // { giverId: gifteeId }
  room.drawn = true;
  saveRooms(rooms);

  // Enviamos los correos uno por uno. Si alguno falla, seguimos
  // con los demás y reportamos el detalle al organizador.
  const results = [];
  for (const participant of room.participants) {
    const gifteeId = assignment[participant.id];
    const giftee = room.participants.find((p) => p.id === gifteeId);
    try {
      await sendAssignmentEmail(participant, giftee, room);
      results.push({ email: participant.email, status: 'enviado' });
    } catch (e) {
      results.push({ email: participant.email, status: 'error', detail: e.message });
    }
  }

  res.json({ success: true, results });
});

app.listen(PORT, () => {
  console.log(`🎁 Servidor de Amigo Secreto corriendo en http://localhost:${PORT}`);
});
