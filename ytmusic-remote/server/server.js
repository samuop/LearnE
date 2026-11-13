#!/usr/bin/env node
// Servidor puente de YT Music Remote.
// - La extensión (en la misma PC) se conecta por localhost.
// - El celular abre http://IP-DE-LA-PC:8765/?t=TOKEN en la misma red Wi-Fi.
// Sin dependencias: solo Node.js 18 o más nuevo.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8765;
const HOLD_MS = 1000; // cuánto espera la extensión por un comando antes de volver a sincronizar
const STALE_MS = 6000; // una pestaña que no sincroniza en este tiempo se da por cerrada

// El token se guarda en un archivo para que el enlace del celular siga funcionando entre reinicios.
const TOKEN_FILE = path.join(__dirname, '.token');
function loadToken() {
  if (process.env.TOKEN) return process.env.TOKEN;
  try {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t) return t;
  } catch {}
  const t = crypto.randomBytes(6).toString('hex');
  try { fs.writeFileSync(TOKEN_FILE, t); } catch {}
  return t;
}
const TOKEN = loadToken();

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// ---- Estado: cada pestaña de YouTube Music es un "cliente" ----
/** @type {Map<string, {state:any, lastSeen:number, lastActive:number, queue:any[], waiter:null|{res:http.ServerResponse,timer:NodeJS.Timeout}}>} */
const clients = new Map();
const sseClients = new Set();
let lastBroadcast = '';

function activeClient() {
  const now = Date.now();
  let best = null;
  for (const [id, c] of clients) {
    if (now - c.lastSeen > STALE_MS) { flush(c); clients.delete(id); continue; }
    if (!best || c.lastActive > best.lastActive || (c.lastActive === best.lastActive && c.lastSeen > best.lastSeen)) best = c;
  }
  return best;
}

function snapshot() {
  const c = activeClient();
  return { connected: !!c, tabs: clients.size, state: c ? c.state : null };
}

function broadcast(force = false) {
  const snap = snapshot();
  const { ts, ...cmp } = (snap.state || {});
  const key = JSON.stringify({ ...snap, state: cmp });
  if (!force && key === lastBroadcast) return;
  lastBroadcast = key;
  const data = `data: ${JSON.stringify({ ...snap, serverTime: Date.now() })}\n\n`;
  for (const res of sseClients) res.write(data);
}

function flush(c) {
  if (!c.waiter) return;
  clearTimeout(c.waiter.timer);
  const commands = c.queue.splice(0);
  sendJson(c.waiter.res, 200, { commands });
  c.waiter = null;
}

setInterval(() => broadcast(), 2000);

// ---- Utilidades HTTP ----
function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function isLoopback(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function tokenOk(req, url) {
  const t = url.searchParams.get('t') || req.headers['x-token'] || '';
  const a = Buffer.from(String(t)); const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) urls.push(`http://${i.address}:${PORT}/?t=${TOKEN}`);
    }
  }
  return urls;
}

const ACTIONS = new Set(['toggle', 'play', 'pause', 'next', 'prev', 'seek', 'volume', 'mute', 'like', 'dislike', 'shuffle', 'repeat']);

// ---- Rutas ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    // --- Extensión (solo desde esta misma PC) ---
    if (p === '/api/ext/sync' && req.method === 'POST') {
      if (!isLoopback(req)) return sendJson(res, 403, { error: 'solo localhost' });
      const body = await readBody(req);
      const id = String(body.client || 'default');
      let c = clients.get(id);
      if (!c) { c = { state: null, lastSeen: 0, lastActive: 0, queue: [], waiter: null }; clients.set(id, c); }
      if (body.closing) { flush(c); clients.delete(id); broadcast(); return sendJson(res, 200, { commands: [] }); }
      flush(c); // por si quedó una espera vieja
      c.state = body.state || null;
      c.lastSeen = Date.now();
      if (c.state && c.state.playing) c.lastActive = c.lastSeen;
      else if (c.state && c.state.hasTrack && !c.lastActive) c.lastActive = 1;
      broadcast();
      if (c.queue.length) return sendJson(res, 200, { commands: c.queue.splice(0) });
      const timer = setTimeout(() => flush(c), HOLD_MS);
      c.waiter = { res, timer };
      req.on('close', () => { if (c.waiter && c.waiter.res === res) { clearTimeout(timer); c.waiter = null; } });
      return;
    }

    if (p === '/api/ext/info' && req.method === 'GET') {
      if (!isLoopback(req)) return sendJson(res, 403, { error: 'solo localhost' });
      return sendJson(res, 200, { urls: lanUrls(), port: PORT, ...snapshot() });
    }

    // --- Celular (requiere token) ---
    if (p.startsWith('/api/')) {
      if (!tokenOk(req, url)) return sendJson(res, 401, { error: 'token inválido' });

      if (p === '/api/state' && req.method === 'GET') return sendJson(res, 200, snapshot());

      if (p === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write('retry: 2000\n\n');
        res.write(`data: ${JSON.stringify({ ...snapshot(), serverTime: Date.now() })}\n\n`);
        sseClients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
        return;
      }

      if (p === '/api/command' && req.method === 'POST') {
        const body = await readBody(req, 4096);
        if (!ACTIONS.has(body.action)) return sendJson(res, 400, { error: 'acción desconocida' });
        const c = activeClient();
        if (!c) return sendJson(res, 409, { error: 'No hay ninguna pestaña de YouTube Music conectada' });
        const value = body.value === undefined ? undefined : Number(body.value);
        c.queue.push({ action: body.action, value: Number.isFinite(value) ? value : undefined });
        flush(c);
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 404, { error: 'no encontrado' });
    }

    // --- Archivos estáticos (control remoto) ---
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'método no permitido' });
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'prohibido' });
    fs.readFile(file, (err, data) => {
      if (err) return sendJson(res, 404, { error: 'no encontrado' });
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    });
  } catch (e) {
    if (!res.headersSent) sendJson(res, 400, { error: String(e.message || e) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎵  YT Music Remote funcionando\n');
  const urls = lanUrls();
  if (urls.length) {
    console.log('Abrí esta dirección en el celular (conectado al mismo Wi-Fi):');
    for (const u of urls) console.log('   ' + u);
  } else {
    console.log('No se encontró una red local. ¿La PC está conectada al Wi-Fi?');
  }
  console.log('\nTambién podés escanear el código QR desde el ícono de la extensión.');
  console.log('Dejá esta ventana abierta mientras lo uses. Ctrl+C para salir.\n');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`El puerto ${PORT} ya está en uso. ¿Ya hay otro servidor abierto? Probá con PORT=8766 node server.js`);
  else console.error(e);
  process.exit(1);
});
