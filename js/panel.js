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
  let reviewQuestion = null; // the options for reviewCard (null: not enough words, plain card)
  let reviewChoice = null; // index of the option picked, null while unanswered
  let reviewRevealed = false; // plain card: translation shown · fill question: hint shown
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

  /* Cuts a long sentence down to the part around `term`, so it fits in a small space. */
  function excerpt(context, term, max = 110) {
    if (!context || context.length <= max) return context || '';
    const index = Math.max(0, context.toLowerCase().indexOf(term.toLowerCase()));
    let start = Math.max(0, index - Math.floor((max - term.length) / 2));
    let end = Math.min(context.length, start + max);
    start = Math.max(0, end - max);
    return (start > 0 ? '…' : '') + context.slice(start, end).trim() + (end < context.length ? '…' : '');
  }

  /* ---------- Look-alike words ---------- */

  /*
   * "Parecidas que ya guardaste": saved words spelled like the one being translated
   * (over, overhead, overlook…), each with its meaning and its sentence, to compare them.
   */
  function similarCard(term, docKey) {
    const list = LE.Vocab.similar(term);
    if (!list.length) return null;
    return el('div', { class: 'card similar' }, [
      el('h3', { text: 'Parecidas que ya guardaste' }),
      el('p', { class: 'similar-hint', text: 'Se escriben parecido pero no significan lo mismo. Comparalas:' }),
      el('ul', { class: 'similar-list' }, list.map((item) => el('li', {}, [
        el('div', { class: 'similar-row' }, [
          el('button', { class: 'btn small', title: 'Escuchar', onclick: () => LE.speak(item.term) }, '🔊'),
          el('b', { text: item.term }),
          el('span', { class: 'similar-tr', text: item.contextSpan || item.translation }),
        ]),
        item.context ? el('div', { class: 'similar-ctx' }, highlighted(excerpt(item.context, item.term), item.term)) : null,
        item.docKey !== docKey && item.source ? el('div', { class: 'similar-src', text: item.source }) : null,
      ]))),
    ]);
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
    let contextSpan = null;
    const wordTranslation = LE.Translator.translate(text);
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
      LE.Translator.translateInContext(context, text).then(
        async (r) => {
          if (id !== lookupId) return;
          contextTranslation = r.text;
          contextSpan = r.span;
          // No brackets came back: look for the word's own translation inside the sentence.
          if (!contextSpan) {
            const word = await wordTranslation.catch(() => null);
            if (id !== lookupId) return;
            if (word) {
              const candidates = [word.text, ...word.alternatives.flatMap((a) => a.terms)];
              contextSpan = LE.Translator.locate(r.text, candidates);
            }
          }
          ctxTr.textContent = '';
          ctxTr.append(revealable(el('div', {}, contextSpan ? highlighted(r.text, contextSpan) : [r.text])));
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
    resultBox.append(actions, similarCard(text, docKey), provider);

    let translation;
    try {
      translation = await wordTranslation;
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
            contextSpan,
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

  /*
   * Duolingo-style review: instead of showing the translation, each card is a question
   * with options to pick from. Two kinds:
   *   - meaning: "¿Qué significa overlook en esta oración?" → pick the Spanish meaning.
   *   - fill:    the sentence with a blank → pick the English word that goes there.
   * Wrong options come first from look-alike words (oversee, overhead…), because telling
   * those apart is the hard part; then from any other saved word.
   */

  const shuffle = (list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const plain = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  /* What the word means in its own sentence; the dictionary translation when that's unknown. */
  const meaningOf = (item) => item.contextSpan || item.translation || '';

  /* Saved words (any PDF) to take wrong options from: look-alikes first, then the rest at random. */
  function distractorPool(card) {
    const own = card.term.toLowerCase();
    const seen = new Set([own]);
    const single = LE.isSingleWord(card.term);
    const out = [];
    const take = (item) => {
      const key = item.term.toLowerCase();
      if (seen.has(key) || LE.isSingleWord(item.term) !== single) return;
      seen.add(key);
      out.push(item);
    };
    LE.Vocab.similar(card.term, 10).forEach(take);
    shuffle(LE.Vocab.all()).forEach(take);
    return out;
  }

  function blankIndex(card) {
    return card.context ? card.context.toLowerCase().indexOf(card.term.toLowerCase()) : -1;
  }

  function buildQuestion(card) {
    const pool = distractorPool(card);

    const meaning = () => {
      const answer = meaningOf(card);
      if (!answer) return null;
      const used = new Set([plain(answer)]);
      const wrong = [];
      for (const item of pool) {
        const text = meaningOf(item);
        if (!text || used.has(plain(text))) continue;
        used.add(plain(text));
        wrong.push({ text, item });
        if (wrong.length === 3) break;
      }
      if (!wrong.length) return null;
      return { type: 'meaning', options: shuffle([{ text: answer, correct: true }, ...wrong]) };
    };

    const fill = () => {
      const index = blankIndex(card);
      if (index < 0 || !LE.isSingleWord(card.term)) return null;
      const answer = card.context.slice(index, index + card.term.length);
      const wrong = pool.slice(0, 3).map((item) => ({ text: item.term, item }));
      if (!wrong.length) return null;
      return { type: 'fill', index, options: shuffle([{ text: answer, correct: true }, ...wrong]) };
    };

    // New words start with "what does it mean"; once you know them a bit, also "complete the sentence".
    const preferFill = card.box >= 1 && Math.random() < 0.5;
    return preferFill ? fill() || meaning() : meaning() || fill();
  }

  function nextCard(filter, excludeId) {
    reviewCard = LE.Vocab.nextToReview(filter, excludeId);
    reviewQuestion = reviewCard ? buildQuestion(reviewCard) : null;
    reviewChoice = null;
    reviewRevealed = false;
  }

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

    if (!reviewCard || !LE.Vocab.all().some((i) => i.id === reviewCard.id && filter(i))) nextCard(filter);

    const learned = LE.Vocab.all().filter((i) => filter(i) && i.box >= 3).length;
    reviewArea.append(
      el('p', {
        class: 'review-stats',
        text: `${total} ${total === 1 ? 'palabra' : 'palabras'} · ${learned} ya bastante aprendidas`,
      })
    );
    reviewArea.append(...(reviewQuestion ? questionView(filter) : flashcardView(filter)));

    if (sessionStats.right + sessionStats.wrong) {
      reviewArea.append(
        el('p', { class: 'review-stats', text: `En este repaso: ${sessionStats.right} bien, ${sessionStats.wrong} para practicar más` })
      );
    }
  }

  function continueReview(filter) {
    nextCard(filter, reviewCard.id);
    renderReview();
  }

  function choose(index) {
    if (!reviewQuestion || reviewChoice != null) return;
    const option = reviewQuestion.options[index];
    if (!option) return;
    reviewChoice = index;
    LE.Vocab.grade(reviewCard.id, option.correct);
    sessionStats[option.correct ? 'right' : 'wrong']++;
    renderReview();
    if (option.correct) LE.speak(reviewCard.term);
  }

  function questionView(filter) {
    const card = reviewCard;
    const q = reviewQuestion;
    const answered = reviewChoice != null;
    const picked = answered ? q.options[reviewChoice] : null;

    const prompt =
      q.type === 'meaning'
        ? el('div', { class: 'q-prompt' }, [
            '¿Qué significa ',
            el('b', { text: card.term }),
            card.context ? ' en esta oración?' : '?',
            ' ',
            ...speakButtons(card.term),
          ])
        : el('div', { class: 'q-prompt', text: 'Completá la oración con la palabra que falta' });

    let sentence = null;
    if (q.type === 'meaning' && card.context) {
      sentence = el('div', { class: 'q-sentence' }, highlighted(card.context, card.term));
    } else if (q.type === 'fill') {
      const before = card.context.slice(0, q.index);
      const after = card.context.slice(q.index + card.term.length);
      const gap = answered
        ? el('mark', { class: 'gap ok', text: card.context.slice(q.index, q.index + card.term.length) })
        : el('span', { class: 'gap', text: '\u00a0' });
      sentence = el('div', { class: 'q-sentence' }, [before, gap, after]);
    }

    // In "fill", the sentence in Spanish is an optional hint (it gives the meaning away).
    let hint = null;
    if (q.type === 'fill' && card.contextTranslation && !answered) {
      hint = reviewRevealed
        ? el('div', { class: 'q-hint' }, card.contextSpan ? highlighted(card.contextTranslation, card.contextSpan) : [card.contextTranslation])
        : el('button', { class: 'link q-hint-btn', onclick: () => { reviewRevealed = true; renderReview(); } }, 'Ver pista (la oración en español)');
    }

    const options = el('div', { class: 'choices' + (q.type === 'fill' ? ' en' : '') }, q.options.map((option, i) => {
      let state = '';
      if (answered && option.correct) state = ' correct';
      else if (answered && i === reviewChoice) state = ' wrong';
      return el('button', {
        class: 'choice' + state,
        disabled: answered,
        onclick: () => choose(i),
      }, [el('span', { class: 'choice-key', text: String(i + 1) }), el('span', { text: option.text })]);
    }));

    const parts = [
      el('div', { class: 'question' }, [
        prompt,
        sentence,
        hint,
        reviewMode === 'all' && card.source ? el('div', { class: 'fc-source', text: card.source }) : null,
      ]),
      options,
    ];

    if (answered) parts.push(feedbackView(card, q, picked), el('div', { class: 'actions' }, [
      el('button', { class: 'btn primary continue', onclick: () => continueReview(filter) }, 'Continuar'),
    ]));
    return parts;
  }

  function feedbackView(card, q, picked) {
    const correctText = q.options.find((o) => o.correct).text;
    const lines = [];
    if (picked.correct) {
      lines.push(el('div', { class: 'fb-title', text: '¡Bien!' }));
    } else {
      lines.push(el('div', { class: 'fb-title' }, ['La respuesta era: ', el('b', { text: correctText })]));
      // The point of the exercise: say whose meaning you picked, so the two don't blur together.
      if (picked.item && q.type === 'meaning') {
        lines.push(el('div', { class: 'fb-mix' }, [
          '«' + picked.text + '» es lo que significa ', el('b', { text: picked.item.term }), '.',
        ]));
      } else if (picked.item && q.type === 'fill') {
        lines.push(el('div', { class: 'fb-mix' }, [
          el('b', { text: picked.item.term }), ' significa «' + (picked.item.translation || meaningOf(picked.item)) + '».',
        ]));
      }
    }
    lines.push(el('div', { class: 'fb-word' }, [el('b', { text: card.term }), ' = ' + meaningOf(card)]));
    if (card.contextTranslation) {
      lines.push(el('div', { class: 'fb-ctx' }, card.contextSpan ? highlighted(card.contextTranslation, card.contextSpan) : [card.contextTranslation]));
    }
    if (card.context) lines.push(el('div', { class: 'actions fb-listen' }, speakButtons(card.context)));
    return el('div', { class: 'feedback ' + (picked.correct ? 'ok' : 'ko') }, lines);
  }

  /* Fallback when there aren't enough saved words to make options: the classic card. */
  function flashcardView(filter) {
    const card = reviewCard;
    const answer = el('div', { class: 'fc-answer' }, [
      el('div', { class: 'translation', text: card.translation }),
      card.alternatives ? el('div', { class: 'pos', text: card.alternatives }) : null,
      card.contextTranslation
        ? el('div', { class: 'fc-ctx-tr' }, card.contextSpan ? highlighted(card.contextTranslation, card.contextSpan) : [card.contextTranslation])
        : null,
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
        el('button', { class: 'btn primary', onclick: () => { reviewRevealed = true; renderReview(); } }, 'Mostrar traducción')
      );
    } else {
      const next = (knew) => {
        LE.Vocab.grade(card.id, knew);
        sessionStats[knew ? 'right' : 'wrong']++;
        continueReview(filter);
      };
      actions.append(
        el('button', { class: 'btn bad', onclick: () => next(false) }, '✗ No la sabía'),
        el('button', { class: 'btn good', onclick: () => next(true) }, '✓ La sabía')
      );
    }
    return [
      el('p', { class: 'hint', text: 'Para repasar con opciones, guardá al menos otra palabra: de ahí salen las opciones incorrectas.' }),
      flashcard,
      actions,
    ];
  }

  /* Keys 1–4 pick an option, Enter continues — only while the review tab is open. */
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('[data-tab-body="review"]').hidden || !reviewQuestion) return;
    if (/^[1-4]$/.test(e.key) && reviewChoice == null) {
      e.preventDefault();
      choose(Number(e.key) - 1);
    } else if (e.key === 'Enter' && reviewChoice != null) {
      e.preventDefault();
      continueReview(reviewFilterFn());
    }
  });

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
