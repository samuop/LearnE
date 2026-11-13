// Service worker: habla con el servidor local (las páginas https no pueden llamar a localhost directamente).
const DEFAULT_URL = 'http://localhost:8765';

async function serverUrl() {
  const { serverUrl } = await chrome.storage.local.get('serverUrl');
  return (serverUrl || DEFAULT_URL).replace(/\/+$/, '');
}

let lastOk = null;
function setStatus(ok) {
  if (ok === lastOk) return;
  lastOk = ok;
  chrome.action.setBadgeText({ text: ok ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#1db954' });
}

async function post(body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch((await serverUrl()) + '/api/ext/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    setStatus(true);
    return { ok: true, commands: j.commands || [] };
  } catch {
    setStatus(false);
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const client = String(sender.tab ? sender.tab.id : 'default');
  if (msg.type === 'sync') {
    post({ client, state: msg.state }).then(sendResponse);
    return true; // respuesta asíncrona
  }
  if (msg.type === 'closing') {
    post({ client, closing: true });
  }
});

chrome.tabs?.onRemoved?.addListener((tabId) => post({ client: String(tabId), closing: true }));
