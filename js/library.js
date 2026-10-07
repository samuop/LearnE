/*
 * Remembers the PDFs you opened, without copying them: only the name, the size and,
 * where the browser supports it (Chrome/Edge on a computer), a permission to read the
 * file where it already lives. Stored in IndexedDB.
 */
LE.Library = (() => {
  const DB_NAME = 'learne';
  const STORE = 'pdfs';
  const MAX_FILES = 12;
  let dbPromise = null;

  /* True when the browser can keep access to a file on disk (File System Access API). */
  const canKeepAccess = 'showOpenFilePicker' in window;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request && request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /* Recent PDFs, most recently opened first. */
  async function list() {
    try {
      const items = (await run('readonly', (s) => s.getAll())) || [];
      // Earlier versions kept a full copy of each PDF: drop it to free the space.
      for (const item of items.filter((i) => i.blob)) {
        delete item.blob;
        await run('readwrite', (s) => s.put(item));
      }
      return items.sort((a, b) => b.lastOpened - a.lastOpened);
    } catch {
      return [];
    }
  }

  async function save(key, { name, size, numPages }, handle) {
    try {
      const existing = (await list()).find((i) => i.key === key);
      await run('readwrite', (s) =>
        s.put({
          key,
          name,
          size,
          numPages,
          lastOpened: Date.now(),
          handle: handle || (existing && existing.handle) || null,
        })
      );
      for (const item of (await list()).slice(MAX_FILES)) await remove(item.key);
    } catch (error) {
      console.warn('No se pudo guardar el PDF en la lista de recientes:', error);
    }
  }

  async function remove(key) {
    try {
      await run('readwrite', (s) => s.delete(key));
    } catch {
      /* Nothing to do: it simply stays in the list. */
    }
  }

  /*
   * Gets the file back from a saved permission. `ask` may show the browser's
   * "allow access" prompt, so pass it only from a click. Returns null when there is
   * no permission (yet); throws when the file was moved, renamed or deleted.
   */
  async function fileFrom(item, ask) {
    if (!item.handle) return null;
    let state = await item.handle.queryPermission({ mode: 'read' });
    if (state !== 'granted' && ask) state = await item.handle.requestPermission({ mode: 'read' });
    if (state !== 'granted') return null;
    return item.handle.getFile();
  }

  /* Opens the system file picker; resolves { file, handle } or null if cancelled. */
  async function pick() {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      return { file: await handle.getFile(), handle };
    } catch (error) {
      if (error && error.name === 'AbortError') return null;
      throw error;
    }
  }

  return { canKeepAccess, list, save, remove, fileFrom, pick };
})();
