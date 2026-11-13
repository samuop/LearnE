const DEFAULT_URL = 'http://localhost:8765';
const $ = (id) => document.getElementById(id);

async function getServer() {
  const { serverUrl } = await chrome.storage.local.get('serverUrl');
  return (serverUrl || DEFAULT_URL).replace(/\/+$/, '');
}

function showQr(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: false });
  $('qr').style.display = 'block';
}

async function refresh() {
  const base = await getServer();
  $('server').value = base;
  try {
    const r = await fetch(base + '/api/ext/info', { cache: 'no-store' });
    const info = await r.json();
    $('dot').classList.add('on');
    $('help').style.display = 'none';
    const tab = info.connected
      ? (info.state && info.state.title ? `Sonando: <b>${escapeHtml(info.state.title)}</b>` : 'YouTube Music conectado.')
      : 'Servidor OK. Abrí <b>music.youtube.com</b> en una pestaña.';
    $('status').innerHTML = tab;
    $('urls').innerHTML = '';
    if (info.urls.length) {
      showQr(info.urls[0]);
      const p = document.createElement('div');
      p.className = 'muted';
      p.textContent = 'Escaneá el código con el celular (mismo Wi-Fi) o abrí:';
      $('urls').append(p);
      for (const u of info.urls) {
        const d = document.createElement('div');
        d.className = 'url';
        d.textContent = u;
        $('urls').append(d);
      }
    } else {
      $('urls').innerHTML = '<div class="muted">La PC no parece estar conectada a una red local.</div>';
    }
  } catch {
    $('dot').classList.remove('on');
    $('status').textContent = 'No se encuentra el servidor en ' + base;
    $('qr').style.display = 'none';
    $('urls').innerHTML = '';
    $('help').style.display = 'block';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('save').addEventListener('click', async () => {
  const v = $('server').value.trim() || DEFAULT_URL;
  await chrome.storage.local.set({ serverUrl: v });
  refresh();
});

refresh();
setInterval(refresh, 3000);
