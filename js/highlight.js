/* Marks, in the PDF text, the words already saved in the open PDF's vocabulary. */
LE.Highlight = (() => {
  const toggle = document.getElementById('highlight-toggle');
  let enabled = LE.storage.get('learne.highlight', true);
  let pattern = null;
  let terms = new Map(); // lower-case form -> saved term

  toggle.checked = enabled;
  toggle.addEventListener('change', () => {
    enabled = toggle.checked;
    LE.storage.set('learne.highlight', enabled);
    refreshAll();
  });

  const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function build() {
    terms = new Map();
    const words = LE.Viewer.docKey ? LE.Vocab.forDoc(LE.Viewer.docKey).map((i) => i.term) : [];
    for (const w of words) terms.set(w.toLowerCase(), w);
    if (!enabled || !words.length) {
      pattern = null;
      return;
    }
    // Longest first so "linear regression" wins over "linear"; single words also match simple inflections.
    const alternatives = words
      .sort((a, b) => b.length - a.length)
      .map((w) => (LE.isSingleWord(w) ? escape(w) + '(?:s|es|ed|ing)?' : escape(w).replace(/ /g, '\\s+')));
    pattern = new RegExp('(^|[^A-Za-z])(' + alternatives.join('|') + ')(?=[^A-Za-z]|$)', 'gi');
  }

  /* The saved term a highlighted piece of text belongs to. */
  function termFor(text) {
    const lower = text.toLowerCase().replace(/\s+/g, ' ');
    if (terms.has(lower)) return terms.get(lower);
    for (const [form, term] of terms) {
      if (lower.startsWith(form) && /^(s|es|ed|ing)$/.test(lower.slice(form.length))) return term;
    }
    return text;
  }

  function clear(layer) {
    const marks = layer.querySelectorAll('mark.saved-word');
    marks.forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    if (marks.length) layer.normalize();
  }

  function apply(layer) {
    clear(layer);
    if (!pattern) return;
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    for (const node of nodes) {
      const text = node.textContent;
      pattern.lastIndex = 0;
      let match;
      let last = 0;
      const parts = [];
      while ((match = pattern.exec(text))) {
        const start = match.index + match[1].length;
        const end = start + match[2].length;
        if (start > last) parts.push(document.createTextNode(text.slice(last, start)));
        parts.push(LE.el('mark', { class: 'saved-word', 'data-term': termFor(match[2]), text: text.slice(start, end) }));
        last = end;
      }
      if (!parts.length) continue;
      if (last < text.length) parts.push(document.createTextNode(text.slice(last)));
      node.replaceWith(...parts);
    }
  }

  function refreshAll() {
    build();
    document.querySelectorAll('#pages .textLayer').forEach(apply);
  }

  LE.Viewer.onTextLayer(apply);
  LE.Vocab.onChange(refreshAll);

  return { refresh: refreshAll };
})();
