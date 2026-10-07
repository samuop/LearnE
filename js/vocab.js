/* Personal vocabulary saved in the browser (localStorage), with spaced-repetition boxes. */
LE.Vocab = (() => {
  const KEY = 'learne.vocab.v1';
  const listeners = new Set();
  let items = LE.storage.get(KEY, []);

  function save() {
    LE.storage.set(KEY, items);
    listeners.forEach((fn) => fn(items));
  }

  function find(term) {
    const t = term.toLowerCase();
    return items.find((i) => i.term.toLowerCase() === t);
  }

  function add(entry) {
    const existing = find(entry.term);
    if (existing) {
      Object.assign(existing, entry, { id: existing.id, box: existing.box });
    } else {
      items.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        box: 0,
        lastReview: 0,
        addedAt: Date.now(),
        ...entry,
      });
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

  function toCSV() {
    const quote = (v) => '"' + String(v || '').replace(/"/g, '""') + '"';
    const rows = [['ingles', 'espanol', 'contexto', 'fuente', 'pagina']].concat(
      items.map((i) => [i.term, i.translation, i.context, i.source, i.page])
    );
    return rows.map((r) => r.map(quote).join(',')).join('\n');
  }

  return {
    all: () => items,
    find,
    add,
    remove,
    nextToReview,
    grade,
    toCSV,
    onChange: (fn) => listeners.add(fn),
  };
})();
