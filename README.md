# 🎁 Amigo Secreto — App Full-Stack

Aplicación web para organizar una rifa de Amigo Secreto: creación de sala,
registro de participantes con lista de deseos, sorteo automatizado y envío
de correos privados con la persona y lista de deseos que le tocó a cada quien.

## Estructura del proyecto

```
amigo-secreto/
├── server.js           # Backend Express (API + envío de correos)
├── package.json
├── .env.example         # Variables de entorno de ejemplo
├── data/
│   └── rooms.json        # Se crea solo, guarda las salas (persistencia simple)
└── public/
    ├── index.html         # Interfaz (una sola página)
    ├── styles.css
    └── script.js          # Lógica de frontend (fetch a la API)
```

## 1. Requisitos

- Node.js 18 o superior instalado.
- Una cuenta de Gmail (para el envío de correos) — o adaptar a otro proveedor.

## 2. Instalación

```bash
cd amigo-secreto
npm install
```

## 3. Configurar el envío de correos

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
2. Activa la verificación en 2 pasos en tu cuenta de Google.
3. Genera una **contraseña de aplicación** en:
   https://myaccount.google.com/apppasswords
4. Abre `.env` y coloca:
   ```
   EMAIL_USER=tu_correo@gmail.com
   EMAIL_PASS=la_contraseña_de_aplicacion_generada
   ```

> ¿Prefieres no usar Gmail? El archivo `server.js` usa Nodemailer, así que
> puedes cambiar la configuración de `transporter` por cualquier SMTP
> (Outlook, un servidor propio, SendGrid SMTP, etc.) sin tocar el resto
> del código. Si en cambio quieres usar **EmailJS** (100% desde el
> navegador), tendrías que mover la llamada de envío de correo del
> backend al frontend justo después de calcular el sorteo — el archivo
> `server.js` ya deja el sorteo y la lista de asignaciones listos como
> referencia de qué datos enviarías a la plantilla de EmailJS.

## 4. Ejecutar la aplicación

```bash
npm start
```

Abre tu navegador en:

```
http://localhost:3000
```

## 5. Cómo probarla (flujo de evidencia)

1. **Crear sala:** desde la página de inicio, haz clic en "Crear sala",
   define el nombre del grupo y el presupuesto. Al terminar verás:
   - El **código de sala** para compartir con los participantes.
   - El **enlace de organizador** (guárdalo tú, es privado — permite
     ejecutar el sorteo).
2. **Inscribir participantes:** comparte el enlace normal (sin el token
   de organizador) o el código de sala. Cada persona ingresa su nombre,
   correo y lista de deseos (puede agregar/quitar ítems). Pueden volver
   a editar su lista mientras el sorteo no se haya hecho.
3. **Sorteo:** solo quien tenga el enlace de organizador ve el botón
   "Ejecutar sorteo y enviar correos". Se necesita un mínimo de 3
   participantes. El sorteo se hace con un algoritmo de "derangement"
   (nadie se saca a sí mismo).
4. **Correos:** al ejecutar el sorteo, el backend envía automáticamente
   un correo a cada participante con el nombre y la lista de deseos de
   la persona que le tocó regalar — de forma privada, nadie más lo ve.

## 6. Notas técnicas para tu documentación

- El **sorteo** se guarda en el servidor (`data/rooms.json`), pero nunca
  se expone por la API pública; solo se usa internamente para armar y
  enviar los correos.
- La sala se marca como `drawn: true` tras el sorteo para bloquear
  nuevas inscripciones y evitar sortear dos veces.
- Cada participante tiene un `editToken` propio (UUID) para poder
  modificar su lista de deseos sin necesidad de una cuenta de usuario.
- El organizador tiene un `organizerToken` (UUID) que actúa como
  "contraseña" del enlace de organizador; el backend siempre lo vuelve
  a validar antes de permitir el sorteo, sin importar lo que muestre
  la interfaz.
