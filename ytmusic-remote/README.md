# YT Music Remote

Controlá **YouTube Music** que suena en el navegador de tu PC desde el celular:
play/pausa, siguiente, anterior, barra de progreso, volumen, silenciar, me gusta / no me gusta,
aleatorio y repetir. Muestra la portada, el tema y el artista en vivo.

```
Celular (navegador) ──Wi-Fi──▶ servidor en tu PC ◀──localhost── extensión ──▶ pestaña de music.youtube.com
```

Una extensión sola no puede recibir conexiones desde el celular, por eso hay un pequeño
servidor (un solo archivo, sin dependencias) que hace de puente en tu misma red.

## Qué necesitás

- **Node.js 18 o más nuevo** en la PC → https://nodejs.org (versión LTS).
- **Chrome, Edge, Brave u Opera** (cualquier navegador basado en Chromium).
- El celular y la PC conectados **al mismo Wi-Fi**.

## Instalación (una sola vez)

1. **Instalar la extensión**
   1. Abrí `chrome://extensions` (en Edge: `edge://extensions`).
   2. Activá **Modo de desarrollador**.
   3. Clic en **Cargar descomprimida** y elegí la carpeta `extension`.
2. **Iniciar el servidor**
   - Windows: doble clic en `server/iniciar-servidor.bat`.
   - Mac / Linux: `node server/server.js` (o `server/iniciar-servidor.sh`).
   - Si Windows pregunta por el **Firewall**, permití el acceso en **redes privadas**
     (si no, el celular no va a poder conectarse).
3. **Conectar el celular**
   1. Abrí https://music.youtube.com en la PC.
   2. Tocá el ícono de la extensión: muestra un **código QR**.
   3. Escanealo con la cámara del celular. Listo 🎶

Tip: en el celular usá *"Agregar a pantalla de inicio"* para tenerlo como una app.
El enlace sigue funcionando aunque reinicies el servidor.

## Uso diario

Dejá el servidor abierto (la ventana negra) y YouTube Music en una pestaña. Si tenés varias
pestañas de YouTube Music, el control maneja la que esté sonando.

## Problemas comunes

| Problema | Solución |
| --- | --- |
| El celular no abre la página | Revisá que estén en el mismo Wi-Fi y que el Firewall permita Node.js en redes privadas. Algunas redes de invitados o públicas aíslan los dispositivos. |
| "Esperando a YouTube Music en la PC" | Recargá la pestaña de music.youtube.com (F5) después de instalar la extensión. |
| La extensión dice que no encuentra el servidor | El servidor no está abierto. Iniciá `iniciar-servidor.bat`. |
| "El puerto 8765 ya está en uso" | Ya hay un servidor abierto, o usá otro puerto: `set PORT=8766` (Windows) / `PORT=8766 node server.js`, y cambiá la dirección en **Ajustes** de la extensión. |
| "Código inválido" | Volvé a escanear el QR. Para generar un código nuevo, borrá `server/.token` y reiniciá el servidor. |

## Seguridad

- Solo responde a dispositivos de tu red local y pide un código secreto (va en el QR).
- La extensión solo funciona en `music.youtube.com` y solo se comunica con `localhost`.
- La conexión en tu red es HTTP (sin cifrar): usalo en redes de confianza, como la de tu casa.

## Archivos

- `extension/` – la extensión (Manifest V3).
  - `page.js` lee el reproductor y ejecuta los comandos dentro de YouTube Music.
  - `content.js` y `background.js` envían el estado y reciben comandos del servidor.
  - `popup.*` muestra el estado y el QR (generado con
    [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), licencia MIT).
- `server/server.js` – servidor puente.
- `server/public/index.html` – el control remoto que se abre en el celular.
