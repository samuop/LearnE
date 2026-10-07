/*
 * Keeps the last opened PDFs in the browser (IndexedDB) so they survive a reload
 * and can be reopened from "Seguir leyendo" without picking the file again.
 */
LE.Library = (() => {
  const DB_NAME = 'learne';
  const STORE = 'pdfs';
  const MAX_FILES = 6;
  let dbPromise = null;

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

  /* All saved PDFs, most recently opened first (blobs are not read until used). */
  async function list() {
    try {
      const items = (await run('readonly', (s) => s.getAll())) || [];
      return items.sort((a, b) => b.lastOpened - a.lastOpened);
    } catch {
      return [];
    }
  }

  async function save(key, file, numPages) {
    try {
      const existing = (await list()).find((i) => i.key === key);
      await run('readwrite', (s) =>
        s.put({
          key,
          name: file.name,
          size: file.size,
          numPages,
          lastOpened: Date.now(),
          blob: existing ? existing.blob : file,
        })
      );
      const extra = (await list()).slice(MAX_FILES);
      for (const item of extra) await remove(item.key);
      // Ask the browser not to evict our data when space is low.
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (error) {
      console.warn('No se pudo guardar el PDF para la próxima vez:', error);
    }
  }

  async function remove(key) {
    try {
      await run('readwrite', (s) => s.delete(key));
    } catch {
      /* Nothing to do: it simply stays in the list. */
    }
  }

  return { list, save, remove };
})();
