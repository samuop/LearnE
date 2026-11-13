// Puente entre la página (page.js) y el service worker (background.js).
// Envía el estado del reproductor al servidor y ejecuta los comandos que llegan del celular.
(() => {
  let state = null;
  let alive = true;

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.src === 'ytmr-page' && e.data.type === 'state') state = e.data.state;
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function loop() {
    window.postMessage({ src: 'ytmr-cs', type: 'ping' }, location.origin);
    await sleep(300);
    while (alive) {
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type: 'sync', state });
      } catch (err) {
        // La extensión se recargó o se desinstaló: este script quedó huérfano.
        if (String(err).includes('context invalidated')) { alive = false; return; }
        await sleep(3000);
        continue;
      }
      if (!res || !res.ok) { await sleep(3000); continue; }
      for (const c of res.commands || []) {
        window.postMessage({ src: 'ytmr-cs', type: 'cmd', action: c.action, value: c.value }, location.origin);
      }
      if (res.commands && res.commands.length) await sleep(200); // deja que la página actualice el estado
    }
  }

  window.addEventListener('pagehide', () => {
    alive = false;
    try { chrome.runtime.sendMessage({ type: 'closing' }); } catch {}
  });

  loop();
})();
