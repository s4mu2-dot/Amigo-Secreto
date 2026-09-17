/**
 * AMIGO SECRETO - Frontend
 * ------------------------------------------------------
 * Aplicación de una sola página (sin frameworks) que consume
 * la API REST del backend (server.js).
 *
 * Guarda en localStorage, por sala, el token de edición del
 * participante para que pueda volver a editar su lista de
 * deseos sin necesidad de iniciar sesión.
 */

const API = '/api';

// ---------- Utilidades de navegación entre "vistas" ----------
function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function localStorageKey(roomId) {
  return `amigo-secreto:${roomId}`;
}

function getMyParticipant(roomId) {
  const raw = localStorage.getItem(localStorageKey(roomId));
  return raw ? JSON.parse(raw) : null;
}

function saveMyParticipant(roomId, data) {
  localStorage.setItem(localStorageKey(roomId), JSON.stringify(data));
}

// ---------- Manejo de filas dinámicas de "lista de deseos" ----------
function addWishRow(container, value = '') {
  const row = document.createElement('div');
  row.className = 'wish-input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Ej: Una taza, un libro, audífonos...';
  input.value = value;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '✕';
  removeBtn.onclick = () => row.remove();

  row.appendChild(input);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function readWishRows(container) {
  return Array.from(container.querySelectorAll('input'))
    .map((i) => i.value.trim())
    .filter(Boolean);
}

// =========================================================
// VISTA: INICIO
// =========================================================
document.getElementById('btn-goto-create').addEventListener('click', () => {
  showView('view-create');
});

document.getElementById('btn-goto-join').addEventListener('click', () => {
  const code = document.getElementById('input-join-code').value.trim().toUpperCase();
  if (!code) return alert('Escribe el código de la sala.');
  window.location.search = `?room=${code}`;
});

document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.back));
});

// =========================================================
// VISTA: CREAR SALA
// =========================================================
document.getElementById('form-create-room').addEventListener('submit', async (e) => {
  e.preventDefault();

  const body = {
    name: document.getElementById('create-room-name').value.trim(),
    budget: document.getElementById('create-room-budget').value.trim(),
    organizerName: document.getElementById('create-organizer-name').value.trim(),
    organizerEmail: document.getElementById('create-organizer-email').value.trim(),
  };

  try {
    const res = await fetch(`${API}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear la sala.');

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    document.getElementById('created-room-code').textContent = data.roomId;
    document.getElementById('created-room-link').value = `${baseUrl}?room=${data.roomId}`;
    document.getElementById('created-organizer-link').value =
      `${baseUrl}?room=${data.roomId}&organizer=${data.organizerToken}`;

    // Guardamos el ir-a-sala con el token de organizador ya incluido
    document.getElementById('btn-go-to-room-from-create').onclick = () => {
      window.location.search = `?room=${data.roomId}&organizer=${data.organizerToken}`;
    };

    showView('view-created');
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('btn-copy-link').addEventListener('click', () => {
  const el = document.getElementById('created-room-link');
  el.select();
  document.execCommand('copy');
});

document.getElementById('btn-copy-organizer-link').addEventListener('click', () => {
  const el = document.getElementById('created-organizer-link');
  el.select();
  document.execCommand('copy');
});

// =========================================================
// VISTA: SALA
// =========================================================
const wishlistInputsContainer = document.getElementById('wishlist-inputs');
document.getElementById('btn-add-wish').addEventListener('click', () => addWishRow(wishlistInputsContainer));

const editWishlistContainer = document.getElementById('edit-wishlist-inputs');
document.getElementById('btn-add-edit-wish').addEventListener('click', () => addWishRow(editWishlistContainer));

async function loadRoom(roomId) {
  const res = await fetch(`${API}/rooms/${roomId}`);
  const data = await res.json();
  if (!res.ok) {
    document.getElementById('room-error').textContent = data.error;
    document.getElementById('room-error').classList.remove('hidden');
    return null;
  }
  return data;
}

function renderParticipants(room) {
  document.getElementById('participants-count').textContent = room.participantsCount;
  const list = document.getElementById('participants-list');
  list.innerHTML = '';
  room.participants.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p.name;
    list.appendChild(li);
  });
}

async function initRoomView() {
  const roomId = getQueryParam('room');
  const organizerToken = getQueryParam('organizer');
  if (!roomId) {
    showView('view-home');
    return;
  }

  const room = await loadRoom(roomId);
  if (!room) {
    showView('view-room');
    return;
  }

  document.getElementById('room-title').textContent = `Sala: ${room.name}`;
  document.getElementById('room-subtitle').textContent = `Código: ${room.id} · Presupuesto: ${room.budget}`;
  showView('view-room');

  if (room.drawn) {
    document.getElementById('room-not-drawn').classList.add('hidden');
    document.getElementById('room-drawn').classList.remove('hidden');
    return;
  }

  renderParticipants(room);

  // ¿Ya estoy registrado en esta sala? (guardado en localStorage)
  const mine = getMyParticipant(roomId);
  if (mine) {
    document.getElementById('register-card').classList.add('hidden');
    document.getElementById('edit-wishlist-card').classList.remove('hidden');
    editWishlistContainer.innerHTML = '';
    (mine.wishlist && mine.wishlist.length ? mine.wishlist : ['']).forEach((w) =>
      addWishRow(editWishlistContainer, w)
    );
  } else {
    // Si no tengo una fila de deseo aún, agrego una vacía por defecto
    if (!wishlistInputsContainer.children.length) addWishRow(wishlistInputsContainer);
  }

  // Panel de organizador visible solo si el token en la URL es válido
  // (la validación real y definitiva la hace siempre el backend)
  if (organizerToken) {
    document.getElementById('organizer-panel').classList.remove('hidden');
  }

  // --- Registro de nuevo participante ---
  document.getElementById('form-register').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const wishlist = readWishRows(wishlistInputsContainer);

    try {
      const res = await fetch(`${API}/rooms/${roomId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, wishlist }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      saveMyParticipant(roomId, {
        participantId: data.participantId,
        editToken: data.editToken,
        wishlist,
      });

      alert('¡Te has registrado con éxito!');
      window.location.reload();
    } catch (err) {
      alert(err.message);
    }
  };

  // --- Guardar cambios en mi lista de deseos ---
  document.getElementById('btn-save-wishlist').onclick = async () => {
    const wishlist = readWishRows(editWishlistContainer);
    try {
      const res = await fetch(`${API}/rooms/${roomId}/participants/${mine.participantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editToken: mine.editToken, wishlist }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      saveMyParticipant(roomId, { ...mine, wishlist });
      alert('Lista de deseos actualizada.');
    } catch (err) {
      alert(err.message);
    }
  };

  // --- Ejecutar sorteo (organizador) ---
  document.getElementById('btn-draw').onclick = async () => {
    if (!confirm('¿Seguro que quieres ejecutar el sorteo? Esta acción no se puede deshacer.')) return;

    try {
      const res = await fetch(`${API}/rooms/${roomId}/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizerToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const resultsBox = document.getElementById('draw-results');
      resultsBox.innerHTML = '<strong>Resultado del envío de correos:</strong><ul>' +
        data.results.map((r) => `<li>${r.email}: ${r.status}${r.detail ? ' (' + r.detail + ')' : ''}</li>`).join('') +
        '</ul>';

      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      alert(err.message);
    }
  };
}

// =========================================================
// PUNTO DE ENTRADA
// =========================================================
window.addEventListener('DOMContentLoaded', () => {
  const roomId = getQueryParam('room');
  if (roomId) {
    initRoomView();
  } else {
    showView('view-home');
  }
});
