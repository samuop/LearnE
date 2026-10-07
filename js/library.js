/*
 * Remembers the PDFs you opened: the name, the size and, where the browser supports it
 * (Chrome/Edge on a computer), a permission to read the file where it already lives.
 * Where it doesn't (phones), only the PDF that is open right now is also copied, so a
 * reload can reopen it; opening another PDF replaces that single copy. Stored in IndexedDB.
 */
LE.Library = (() => {
  const DB_NAME = 'learne';
  const STORE = 'pdfs';
  const COPY_STORE = 'copy'; // at most one record: { id: 'last', key, blob }
  const MAX_FILES = 12;
  let dbPromise = null;

  /* True when the browser can keep access to a file on disk (File System Access API). */
  const canKeepAccess = 'showOpenFilePicker' in window;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
          if (!db.objectStoreNames.contains(COPY_STORE)) db.createObjectStore(COPY_STORE, { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, fn, store = STORE) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = fn(tx.objectStore(store));
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
      const copy = await run('readonly', (s) => s.get('last'), COPY_STORE);
      if (copy && copy.key === key) await clearCopy();
    } catch {
      /* Nothing to do: it simply stays in the list. */
    }
  }

  /* ---------- The single copy of the open PDF ---------- */

  async function keepCopy(key, file) {
    try {
      const copy = await run('readonly', (s) => s.get('last'), COPY_STORE);
      if (copy && copy.key === key) return;
      await run('readwrite', (s) => s.put({ id: 'last', key, blob: file }), COPY_STORE);
    } catch (error) {
      console.warn('No se pudo guardar la copia del PDF abierto:', error);
    }
  }

  async function clearCopy() {
    try {
      await run('readwrite', (s) => s.delete('last'), COPY_STORE);
    } catch {
      /* Nothing stored. */
    }
  }

  /* Which PDF the copy is of (its key), or null. */
  async function copyKey() {
    try {
      const copy = await run('readonly', (s) => s.get('last'), COPY_STORE);
      return copy ? copy.key : null;
    } catch {
      return null;
    }
  }

  /* The copied file for this PDF, or null if the copy is of another one (or there is none). */
  async function copyOf(item) {
    try {
      const copy = await run('readonly', (s) => s.get('last'), COPY_STORE);
      return copy && copy.key === item.key ? new File([copy.blob], item.name, { type: 'application/pdf' }) : null;
    } catch {
      return null;
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

  return { canKeepAccess, list, save, remove, fileFrom, pick, keepCopy, clearCopy, copyOf, copyKey };
})();
