/* Wires the toolbar, file opening and text selection to the viewer and the panel. */
(() => {
  const fileInput = document.getElementById('file-input');
  const docName = document.getElementById('doc-name');
  const emptyState = document.getElementById('empty-state');
  const nav = document.getElementById('nav');
  const pageInput = document.getElementById('page-input');
  const pageCount = document.getElementById('page-count');
  const zoomLabel = document.getElementById('zoom-label');
  const viewer = document.getElementById('viewer');
  const dropOverlay = document.getElementById('drop-overlay');
  const libraryBtn = document.getElementById('library-btn');
  const recentSection = document.getElementById('recent');
  const recentList = document.getElementById('recent-list');

  const openBtn = document.getElementById('open-btn');
  const libraryHint = document.getElementById('library-hint');

  let currentName = '';

  /* ---------- Opening PDFs ---------- */

  async function openFile(file, handle) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      alert('Ese archivo no parece un PDF.');
      return;
    }
    docName.textContent = 'Abriendo ' + file.name + '…';
    try {
      const key = file.name + ':' + file.size;
      const data = new Uint8Array(await file.arrayBuffer());
      const count = await LE.Viewer.open(data, key, file.name.replace(/\.pdf$/i, ''));
      LE.storage.set('learne.lastOpen', key);
      LE.Library.save(key, { name: file.name, size: file.size, numPages: count }, handle);
      currentName = file.name.replace(/\.pdf$/i, '');
      document.title = currentName + ' · LearnE';
      docName.textContent = file.name;
      libraryHint.hidden = true;
      emptyState.hidden = true;
      nav.hidden = false;
      libraryBtn.hidden = false;
      pageCount.textContent = count;
      pageInput.max = count;
      updateZoomLabel();
      LE.Panel.onDocChange();
      LE.Highlight.refresh();
    } catch (error) {
      console.error(error);
      docName.textContent = '';
      alert('No se pudo abrir el PDF: ' + error.message);
    }
  }

  /* Where supported, open through the system picker so we can keep access to the file. */
  async function chooseFile() {
    if (!LE.Library.canKeepAccess) {
      fileInput.click();
      return;
    }
    try {
      const picked = await LE.Library.pick();
      if (picked) openFile(picked.file, picked.handle);
    } catch (error) {
      console.error(error);
      fileInput.click();
    }
  }

  openBtn.addEventListener('click', (e) => {
    if (e.target === fileInput || !LE.Library.canKeepAccess) return;
    e.preventDefault();
    chooseFile();
  });

  fileInput.addEventListener('change', () => {
    openFile(fileInput.files[0]);
    fileInput.value = '';
  });

  /* ---------- Recent PDFs ("Seguir leyendo") ---------- */

  function formatDate(ms) {
    const days = Math.floor((Date.now() - ms) / 86400000);
    if (days < 1) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 7) return 'hace ' + days + ' días';
    return new Date(ms).toLocaleDateString('es');
  }

  function showHint(text) {
    libraryHint.textContent = text;
    libraryHint.hidden = false;
  }

  async function reopen(item) {
    if (!item.handle) {
      // No saved access (phones, Firefox, Safari): pick the file again; the app recognizes it.
      showHint(`Elegí el archivo «${item.name}» para seguir donde quedaste.`);
      chooseFile();
      return;
    }
    try {
      const file = await LE.Library.fileFrom(item, true);
      if (file) return openFile(file, item.handle);
      showHint(`Para abrir «${item.name}» tenés que permitir el acceso al archivo.`);
    } catch {
      showHint(`No encontré «${item.name}» donde estaba (¿lo moviste o le cambiaste el nombre?). Elegilo de nuevo.`);
      chooseFile();
    }
  }

  async function renderRecent() {
    const items = await LE.Library.list();
    recentList.textContent = '';
    recentSection.hidden = !items.length;
    for (const item of items) {
      const page = LE.storage.get('learne.pos.' + item.key, 1);
      const words = LE.Vocab.forDoc(item.key).length;
      const meta = [
        `Página ${page}${item.numPages ? ' de ' + item.numPages : ''}`,
        words ? `${words} ${words === 1 ? 'palabra' : 'palabras'}` : '',
        formatDate(item.lastOpened),
      ].filter(Boolean).join(' · ');
      recentList.append(
        LE.el('li', { class: 'recent-item' }, [
          LE.el('button', { class: 'recent-open', onclick: () => reopen(item) }, [
            LE.el('span', { class: 'recent-name', text: item.name.replace(/\.pdf$/i, '') }),
            LE.el('span', { class: 'recent-meta', text: meta }),
          ]),
          LE.el('button', {
            class: 'btn small',
            title: 'Quitar de la lista (tu vocabulario no se borra)',
            onclick: async () => {
              await LE.Library.remove(item.key);
              renderRecent();
            },
          }, '✕'),
        ])
      );
    }
    return items;
  }

  function showLibrary() {
    LE.Viewer.close();
    LE.storage.set('learne.lastOpen', null);
    currentName = '';
    document.title = 'LearnE · Leer en inglés';
    docName.textContent = '';
    nav.hidden = true;
    libraryBtn.hidden = true;
    emptyState.hidden = false;
    LE.Panel.onDocChange();
    renderRecent();
  }
  libraryBtn.addEventListener('click', showLibrary);

  // After a reload, reopen the PDF that was open if the browser still lets us read it.
  renderRecent().then(async (items) => {
    const lastKey = LE.storage.get('learne.lastOpen', null);
    const last = lastKey && items.find((i) => i.key === lastKey);
    if (!last || LE.Viewer.docKey) return;
    try {
      const file = await LE.Library.fileFrom(last, false);
      if (file && !LE.Viewer.docKey) return openFile(file, last.handle);
    } catch {
      /* Moved or deleted: the list below explains it when tapped. */
    }
    showHint(`Tocá «${last.name.replace(/\.pdf$/i, '')}» para seguir leyendo.`);
  });

  /* ---------- Drag and drop ---------- */

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    dropOverlay.hidden = false;
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropOverlay.hidden = true;
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    const file = e.dataTransfer.files[0];
    const item = e.dataTransfer.items && e.dataTransfer.items[0];
    // Must be requested synchronously, while the drop event is still being handled.
    const handlePromise = item && item.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(() => null) : null;
    const handle = handlePromise ? await handlePromise : null;
    openFile(file, handle && handle.kind === 'file' ? handle : null);
  });

  /* ---------- Navigation and zoom ---------- */

  function updateZoomLabel() {
    zoomLabel.textContent = Math.round(LE.Viewer.scale * 100) + '%';
  }

  LE.Viewer.onPageChange((page) => {
    if (document.activeElement !== pageInput) pageInput.value = page;
  });
  pageInput.addEventListener('change', () => LE.Viewer.goTo(Number(pageInput.value) || 1));
  document.getElementById('prev-page').addEventListener('click', () => LE.Viewer.goTo(LE.Viewer.currentPage - 1));
  document.getElementById('next-page').addEventListener('click', () => LE.Viewer.goTo(LE.Viewer.currentPage + 1));
  LE.Viewer.onZoom(updateZoomLabel);
  document.getElementById('zoom-in').addEventListener('click', () => LE.Viewer.zoomIn());
  document.getElementById('zoom-out').addEventListener('click', () => LE.Viewer.zoomOut());
  document.getElementById('toggle-panel').addEventListener('click', () => {
    document.body.classList.toggle('panel-collapsed');
  });

  /* ---------- Selection -> translation ---------- */

  /* Rebuilds the plain text of a page's text layer and returns the sentence around the selection. */
  function sentenceAround(range) {
    const layer = range.startContainer.parentElement && range.startContainer.parentElement.closest('.textLayer');
    if (!layer) return '';

    let full = '';
    let start = -1;
    let end = -1;
    let lastOwner = null;
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // Each span of the text layer is a run of text; highlight marks split a span but not its words.
      const owner = node.parentElement.closest('.textLayer span') || node.parentElement;
      if (full && owner !== lastOwner && !/\s$/.test(full)) full += ' ';
      lastOwner = owner;
      if (node === range.startContainer) start = full.length + range.startOffset;
      if (node === range.endContainer) end = full.length + range.endOffset;
      full += node.textContent;
    }
    if (start < 0) return '';
    if (end < start) end = start;

    const before = full.slice(Math.max(0, start - 400), start);
    const boundary = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '));
    const from = boundary >= 0 ? start - before.length + boundary + 2 : Math.max(0, start - 400);

    const after = full.slice(end, end + 400);
    const stop = after.search(/[.?!](\s|$)/);
    const to = stop >= 0 ? end + stop + 1 : end + after.length;

    return LE.cleanText(full.slice(from, to));
  }

  let lastText = '';

  function handleSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const anchor = range.commonAncestorContainer;
    const node = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
    if (!node || !viewer.contains(node)) return;

    lookupRange(range, selection.toString(), node);
  }

  function lookupRange(range, rawText, node) {
    let text = LE.cleanText(rawText);
    if (!text) return;
    if (text.split(' ').length === 1) text = LE.trimPunctuation(text);
    if (!text || text === lastText) return;
    if (text.length > 1500) text = text.slice(0, 1500);
    lastText = text;

    const pageDiv = node.closest('.page');
    LE.Panel.lookup({
      text,
      context: sentenceAround(range),
      page: pageDiv ? Number(pageDiv.dataset.page) : null,
      source: currentName,
      docKey: LE.Viewer.docKey,
    });
    if (document.body.classList.contains('panel-collapsed')) document.body.classList.remove('panel-collapsed');
  }

  /*
   * Translate only once the selection stops changing, so dragging across a sentence
   * doesn't send a request for every word along the way.
   */
  const AFTER_MOUSE_MS = 300; // mouse released: the selection is final
  const AFTER_CHANGE_MS = 1000; // touch handles or keyboard: wait until it settles
  let selectionTimer = null;
  let mouseDown = false;
  let touching = false;

  function scheduleSelection(delay) {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(handleSelection, delay);
  }

  viewer.addEventListener('mouseup', () => scheduleSelection(AFTER_MOUSE_MS));

  // A tap or click on a highlighted (already saved) word shows it right away.
  viewer.addEventListener('click', (e) => {
    const mark = e.target.closest('mark.saved-word');
    const selection = window.getSelection();
    if (!mark || (selection && !selection.isCollapsed)) return;
    const range = document.createRange();
    range.setStart(mark.firstChild, 0);
    range.setEnd(mark.firstChild, mark.firstChild.length);
    lastText = '';
    lookupRange(range, mark.dataset.term || mark.textContent, mark);
  });

  // Touch devices don't fire mouseup reliably after adjusting the selection handles.
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    if (!mouseDown && !touching) scheduleSelection(AFTER_CHANGE_MS);
  });
  viewer.addEventListener('mousedown', () => {
    mouseDown = true;
    lastText = '';
  });
  document.addEventListener('mouseup', () => {
    mouseDown = false;
  });
  viewer.addEventListener('touchstart', () => {
    touching = true;
    clearTimeout(selectionTimer);
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (e.touches.length) return;
    touching = false;
    if (!window.getSelection().isCollapsed) scheduleSelection(AFTER_CHANGE_MS);
  }, { passive: true });

  // Left/right arrows change page when not typing.
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') LE.Viewer.goTo(LE.Viewer.currentPage + 1);
    if (e.key === 'ArrowLeft') LE.Viewer.goTo(LE.Viewer.currentPage - 1);
  });
})();
