/* Side panel: translation result, vocabulary list and flashcard review. */
LE.Panel = (() => {
  const { el } = LE;
  const resultBox = document.getElementById('translate-result');
  const practiceToggle = document.getElementById('practice-mode');
  const vocabList = document.getElementById('vocab-list');
  const vocabSearch = document.getElementById('vocab-search');
  const vocabCount = document.getElementById('vocab-count');
  const reviewArea = document.getElementById('review-area');
  const reviewFilter = document.getElementById('review-filter');
  const vocabScope = document.getElementById('vocab-scope');
  const backupStatus = document.getElementById('backup-status');

  let lookupId = 0;
  let reviewMode = LE.storage.get('learne.reviewFilter', 'doc');
  let reviewCard = null;
  let reviewRevealed = false;
  let sessionStats = { right: 0, wrong: 0 };

  practiceToggle.checked = LE.storage.get('learne.practice', false);
  practiceToggle.addEventListener('change', () => LE.storage.set('learne.practice', practiceToggle.checked));

  /* ---------- Tabs ---------- */

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('[data-tab-body]').forEach((b) => (b.hidden = b.dataset.tabBody !== name));
    if (name === 'vocab') renderVocab();
    if (name === 'review') renderReview();
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  /* ---------- Shared pieces ---------- */

  function speakButtons(text) {
    return [
      el('button', { class: 'btn small', title: 'Escuchar', onclick: () => LE.speak(text) }, '🔊'),
      el('button', { class: 'btn small', title: 'Escuchar lento', onclick: () => LE.speak(text, 0.6) }, '🐢'),
    ];
  }

  /* Wraps content so that, in practice mode, it stays blurred until clicked. */
  function revealable(content, forceHidden) {
    const hidden = forceHidden != null ? forceHidden : practiceToggle.checked;
    const box = el('div', { class: 'reveal' + (hidden ? ' hidden-answer' : '') }, [
      content,
      el('div', { class: 'reveal-hint', text: 'Pensalo… y hacé clic para ver' }),
    ]);
    box.addEventListener('click', () => box.classList.remove('hidden-answer'));
    return box;
  }

  function highlighted(context, term) {
    const index = context.toLowerCase().indexOf(term.toLowerCase());
    if (index < 0) return [context];
    return [
      context.slice(0, index),
      el('mark', { text: context.slice(index, index + term.length) }),
      context.slice(index + term.length),
    ];
  }

  /* ---------- Translation ---------- */

  async function lookup({ text, context, page, source, docKey }) {
    const id = ++lookupId;
    showTab('translate');

    const isLong = text.length > 60;
    resultBox.textContent = '';

    const head = el('div', { class: 'term-row' }, [
      el('p', { class: 'term' + (isLong ? ' long' : ''), text }),
      ...speakButtons(text),
    ]);
    const trCard = el('div', { class: 'card' }, [
      el('h3', { text: 'Traducción' }),
      el('div', {}, [el('span', { class: 'spinner' }), 'Traduciendo…']),
    ]);
    resultBox.append(head, trCard);

    // The sentence around the selection is translated too: it shows what the word means here.
    let contextTranslation = '';
    if (context && context.length > text.length + 10) {
      const ctxTr = el('div', { class: 'context-tr' }, [el('span', { class: 'spinner' }), 'Traduciendo la oración…']);
      resultBox.append(
        el('div', { class: 'card' }, [
          el('h3', { text: 'En el texto' }),
          el('div', { class: 'context' }, highlighted(context, text)),
          el('div', { class: 'actions' }, speakButtons(context)),
          ctxTr,
        ])
      );
      LE.Translator.translate(context).then(
        (r) => {
          if (id !== lookupId) return;
          contextTranslation = r.text;
          ctxTr.textContent = '';
          ctxTr.append(revealable(el('div', { text: r.text })));
        },
        (error) => {
          if (id !== lookupId) return;
          ctxTr.className = 'context-tr error';
          ctxTr.textContent = error.message;
        }
      );
    }

    const actions = el('div', { class: 'actions' });
    const provider = el('div', { class: 'provider' });
    resultBox.append(actions, provider);

    let translation;
    try {
      translation = await LE.Translator.translate(text);
    } catch (error) {
      if (id !== lookupId) return;
      trCard.lastChild.replaceWith(el('div', { class: 'error', text: error.message }));
    }
    if (id !== lookupId) return;

    if (translation) {
      const body = el('div', {}, [
        el('div', { class: 'translation' + (isLong ? ' long' : ''), text: translation.text }),
        ...translation.alternatives.map((alt) =>
          el('div', { class: 'pos-group' }, [
            el('span', { class: 'pos', text: alt.pos + ': ' }),
            alt.terms.join(', '),
          ])
        ),
      ]);
      trCard.lastChild.replaceWith(revealable(body));
      provider.textContent = 'Traducido con ' + translation.provider;

      const saveBtn = el('button', { class: 'btn primary' });
      const refreshSave = () => {
        const saved = LE.Vocab.find(text, docKey);
        saveBtn.textContent = saved ? '★ Guardada en tu vocabulario' : '☆ Guardar en vocabulario';
        saveBtn.classList.toggle('primary', !saved);
      };
      saveBtn.addEventListener('click', () => {
        const saved = LE.Vocab.find(text, docKey);
        if (saved) LE.Vocab.remove(saved.id);
        else
          LE.Vocab.add({
            term: text,
            translation: translation.text,
            alternatives: translation.alternatives.map((a) => a.pos + ': ' + a.terms.slice(0, 3).join(', ')).join(' · '),
            context: context || '',
            contextTranslation,
            source,
            docKey,
            page,
          });
        refreshSave();
      });
      refreshSave();
      actions.append(saveBtn);
    }
  }

  /* ---------- Vocabulary list ---------- */

  /* Words of the open PDF; with no PDF open, every saved word. */
  function currentVocab() {
    const docKey = LE.Viewer && LE.Viewer.docKey;
    return docKey ? LE.Vocab.forDoc(docKey) : LE.Vocab.all();
  }

  function renderVocab() {
    const docKey = LE.Viewer.docKey;
    const all = currentVocab();
    vocabScope.textContent = '';
    vocabScope.append(
      docKey
        ? el('span', {}, ['Palabras de ', el('b', { text: LE.Viewer.docName }), ` (${all.length})`])
        : el('span', { text: 'Todas tus palabras. Abrí un PDF para ver solo las suyas.' })
    );

    const query = vocabSearch.value.trim().toLowerCase();
    const items = all.filter(
      (i) => !query || i.term.toLowerCase().includes(query) || (i.translation || '').toLowerCase().includes(query)
    );
    vocabList.textContent = '';
    if (!all.length) {
      vocabList.append(el('li', { class: 'hint', text: docKey
        ? 'Todavía no guardaste palabras de este PDF. Cuando traduzcas una que te cueste, tocá “☆ Guardar en vocabulario”.'
        : 'Todavía no guardaste palabras.' }));
      return;
    }
    for (const item of items) {
      const sameDoc = docKey && item.docKey === docKey;
      vocabList.append(
        el('li', { class: 'vocab-item' }, [
          el('span', { class: 'v-term', text: item.term }),
          el('span', { class: 'v-tr', text: item.translation }),
          el('div', { class: 'v-actions' }, [
            el('button', { class: 'btn small', title: 'Escuchar', onclick: () => LE.speak(item.term) }, '🔊'),
            el('button', { class: 'btn small', title: 'Borrar', onclick: () => LE.Vocab.remove(item.id) }, '✕'),
          ]),
          item.context ? el('span', { class: 'v-ctx' }, highlighted(item.context, item.term)) : null,
          el('span', { class: 'v-meta' }, [
            [sameDoc ? '' : item.source, item.page ? 'pág. ' + item.page : ''].filter(Boolean).join(' · '),
            sameDoc && item.page ? ' · ' : '',
            sameDoc && item.page ? el('button', { class: 'link', onclick: () => LE.Viewer.goTo(item.page) }, 'ir a la página') : null,
          ]),
        ])
      );
    }
  }
  vocabSearch.addEventListener('input', renderVocab);

  document.getElementById('vocab-export').addEventListener('click', () => {
    const name = LE.Viewer.docKey ? LE.Viewer.docName : 'todos';
    LE.download(`vocabulario-${name}.csv`, '\ufeff' + LE.Vocab.toCSV(currentVocab()), 'text/csv;charset=utf-8');
  });

  /* ---------- Backup ---------- */

  function positions() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('learne.pos.')) out[key.slice('learne.pos.'.length)] = LE.storage.get(key, 1);
      }
    } catch {
      /* No storage: the backup just won't carry reading positions. */
    }
    return out;
  }

  document.getElementById('backup-save').addEventListener('click', () => {
    const date = new Date().toISOString().slice(0, 10);
    LE.download(`learne-copia-${date}.json`, LE.Vocab.backup({ positions: positions() }), 'application/json');
    backupStatus.className = 'hint';
    backupStatus.textContent = `Copia descargada con ${LE.Vocab.all().length} palabras de todos tus PDFs.`;
  });

  document.getElementById('backup-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { added, updated, data } = LE.Vocab.restore(await file.text());
      for (const [key, page] of Object.entries(data.positions || {})) {
        if (LE.storage.get('learne.pos.' + key, null) == null) LE.storage.set('learne.pos.' + key, page);
      }
      backupStatus.className = 'hint';
      backupStatus.textContent = `Copia restaurada: ${added} palabras nuevas, ${updated} actualizadas.`;
    } catch (error) {
      backupStatus.className = 'error';
      backupStatus.textContent = error.message;
    }
  });

  /* ---------- Flashcards ---------- */

  function reviewFilterFn() {
    const docKey = LE.Viewer.docKey;
    if (reviewMode === 'doc') return (i) => !!docKey && i.docKey === docKey;
    if (reviewMode === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return (i) => !!docKey && i.docKey === docKey && i.addedAt >= start.getTime();
    }
    return () => true;
  }

  reviewFilter.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.filter === reviewMode);
    b.addEventListener('click', () => {
      reviewMode = b.dataset.filter;
      LE.storage.set('learne.reviewFilter', reviewMode);
      reviewFilter.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      reviewCard = null;
      sessionStats = { right: 0, wrong: 0 };
      renderReview();
    });
  });

  function renderReview() {
    const filter = reviewFilterFn();
    const total = LE.Vocab.all().filter(filter).length;
    reviewArea.textContent = '';

    if (!total) {
      const why = {
        doc: LE.Viewer.docKey ? 'No guardaste palabras de este PDF todavía.' : 'Abrí un PDF para repasar sus palabras, o elegí “Todos mis PDFs”.',
        today: LE.Viewer.docKey ? 'Hoy no guardaste palabras de este PDF.' : 'Abrí un PDF para repasar lo que guardaste hoy, o elegí “Todos mis PDFs”.',
        all: 'Todavía no guardaste palabras.',
      }[reviewMode];
      reviewArea.append(el('p', { class: 'hint', text: why }));
      return;
    }

    if (!reviewCard || !LE.Vocab.all().some((i) => i.id === reviewCard.id && filter(i))) {
      reviewCard = LE.Vocab.nextToReview(filter);
      reviewRevealed = false;
    }
    const card = reviewCard;

    const answer = el('div', { class: 'fc-answer' }, [
      el('div', { class: 'translation', text: card.translation }),
      card.alternatives ? el('div', { class: 'pos', text: card.alternatives }) : null,
      card.contextTranslation ? el('div', { class: 'fc-ctx-tr', text: card.contextTranslation }) : null,
    ]);
    const flashcard = el('div', { class: 'flashcard' }, [
      el('div', { class: 'fc-term', text: card.term }),
      el('div', { class: 'actions', style: 'justify-content:center' }, speakButtons(card.term)),
      card.context ? el('div', { class: 'fc-ctx' }, highlighted(card.context, card.term)) : null,
      reviewMode === 'all' && card.source ? el('div', { class: 'fc-source', text: card.source }) : null,
      reviewRevealed ? answer : null,
    ]);

    const actions = el('div', { class: 'actions' });
    if (!reviewRevealed) {
      actions.append(
        el('button', {
          class: 'btn primary',
          onclick: () => {
            reviewRevealed = true;
            renderReview();
          },
        }, 'Mostrar traducción')
      );
    } else {
      const next = (knew) => {
        LE.Vocab.grade(card.id, knew);
        sessionStats[knew ? 'right' : 'wrong']++;
        reviewCard = LE.Vocab.nextToReview(filter, card.id);
        reviewRevealed = false;
        renderReview();
      };
      actions.append(
        el('button', { class: 'btn bad', onclick: () => next(false) }, '✗ No la sabía'),
        el('button', { class: 'btn good', onclick: () => next(true) }, '✓ La sabía')
      );
    }

    const learned = LE.Vocab.all().filter((i) => filter(i) && i.box >= 3).length;
    reviewArea.append(
      el('p', {
        class: 'review-stats',
        text: `${total} ${total === 1 ? 'palabra' : 'palabras'} · ${learned} ya bastante aprendidas`,
      }),
      flashcard,
      actions
    );
    if (sessionStats.right + sessionStats.wrong) {
      reviewArea.append(
        el('p', { class: 'review-stats', text: `En este repaso: ${sessionStats.right} bien, ${sessionStats.wrong} para practicar más` })
      );
    }
  }

  /* ---------- Keep everything in sync ---------- */

  function refreshCount() {
    vocabCount.textContent = currentVocab().length;
  }
  LE.Vocab.onChange(() => {
    refreshCount();
    if (!document.querySelector('[data-tab-body="vocab"]').hidden) renderVocab();
  });
  refreshCount();

  /* Called when a PDF is opened or closed: everything in the panel is per PDF. */
  function onDocChange() {
    refreshCount();
    reviewCard = null;
    sessionStats = { right: 0, wrong: 0 };
    renderVocab();
    renderReview();
  }

  return { lookup, showTab, onDocChange };
})();
