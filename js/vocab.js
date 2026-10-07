/*
 * Personal vocabulary saved in the browser (localStorage), with spaced-repetition boxes.
 * Every word belongs to one PDF (its docKey): the same word saved in two PDFs is two
 * independent cards, each with its own sentence and progress.
 */
LE.Vocab = (() => {
  const KEY = 'learne.vocab.v1';
  const BACKUP_FORMAT = 'learne-backup';
  const listeners = new Set();
  let items = LE.storage.get(KEY, []);

  function save() {
    LE.storage.set(KEY, items);
    listeners.forEach((fn) => fn(items));
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function sameWord(a, b) {
    return a.toLowerCase() === b.toLowerCase();
  }

  function find(term, docKey) {
    return items.find((i) => sameWord(i.term, term) && (i.docKey || '') === (docKey || ''));
  }

  function forDoc(docKey) {
    return items.filter((i) => (i.docKey || '') === (docKey || ''));
  }

  function add(entry) {
    const existing = find(entry.term, entry.docKey);
    if (existing) {
      Object.assign(existing, entry, { id: existing.id, box: existing.box, lastReview: existing.lastReview });
    } else {
      items.unshift({ id: newId(), box: 0, lastReview: 0, addedAt: Date.now(), ...entry });
    }
    save();
  }

  function remove(id) {
    items = items.filter((i) => i.id !== id);
    save();
  }

  /* Leitner-style: the lowest box and the oldest review come first. */
  function nextToReview(filter, excludeId) {
    const candidates = items.filter(filter || (() => true));
    const pool = candidates.filter((i) => i.id !== excludeId);
    if (!pool.length) return candidates[0] || null;
    pool.sort((a, b) => a.box - b.box || a.lastReview - b.lastReview);
    const lowest = pool.filter((i) => i.box === pool[0].box).slice(0, 8);
    return lowest[Math.floor(Math.random() * lowest.length)];
  }

  function grade(id, knewIt) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.box = knewIt ? Math.min(item.box + 1, 5) : 0;
    item.lastReview = Date.now();
    save();
  }

  function toCSV(list) {
    const quote = (v) => '"' + String(v || '').replace(/"/g, '""') + '"';
    const rows = [['ingles', 'espanol', 'contexto', 'fuente', 'pagina']].concat(
      list.map((i) => [i.term, i.translation, i.context, i.source, i.page])
    );
    return rows.map((r) => r.map(quote).join(',')).join('\n');
  }

  /* ---------- Backup ---------- */

  /* Everything needed to restore the vocabulary on another browser or device. */
  function backup(extra) {
    return JSON.stringify(
      { format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(), vocab: items, ...extra },
      null,
      1
    );
  }

  /*
   * Merges a backup into the current vocabulary. A word already present in the same PDF
   * keeps whichever copy was reviewed most recently. Returns { added, updated, data }.
   */
  function restore(json) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error('El archivo no es una copia de seguridad de LearnE.');
    }
    if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.vocab)) {
      throw new Error('El archivo no es una copia de seguridad de LearnE.');
    }
    let added = 0;
    let updated = 0;
    for (const incoming of data.vocab) {
      if (!incoming || typeof incoming.term !== 'string' || !incoming.term) continue;
      const existing = find(incoming.term, incoming.docKey);
      if (!existing) {
        items.push({ box: 0, lastReview: 0, addedAt: Date.now(), ...incoming, id: newId() });
        added++;
      } else if ((incoming.lastReview || 0) > (existing.lastReview || 0)) {
        Object.assign(existing, incoming, { id: existing.id });
        updated++;
      }
    }
    items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    save();
    return { added, updated, data };
  }

  return {
    all: () => items,
    forDoc,
    find,
    add,
    remove,
    nextToReview,
    grade,
    toCSV,
    backup,
    restore,
    onChange: (fn) => listeners.add(fn),
  };
})();
