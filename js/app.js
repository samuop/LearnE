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

  let currentName = '';

  /* ---------- Opening PDFs ---------- */

  async function openFile(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      alert('Ese archivo no parece un PDF.');
      return;
    }
    docName.textContent = 'Abriendo ' + file.name + '…';
    try {
      const key = file.name + ':' + file.size;
      const data = new Uint8Array(await file.arrayBuffer());
      const count = await LE.Viewer.open(data, key);
      LE.storage.set('learne.lastOpen', key);
      LE.Library.save(key, file, count);
      currentName = file.name.replace(/\.pdf$/i, '');
      document.title = currentName + ' · LearnE';
      docName.textContent = file.name;
      emptyState.hidden = true;
      nav.hidden = false;
      libraryBtn.hidden = false;
      pageCount.textContent = count;
      pageInput.max = count;
      updateZoomLabel();
      LE.Panel.refreshReview();
    } catch (error) {
      console.error(error);
      docName.textContent = '';
      alert('No se pudo abrir el PDF: ' + error.message);
    }
  }

  /* ---------- Recent PDFs ("Seguir leyendo") ---------- */

  function formatDate(ms) {
    const days = Math.floor((Date.now() - ms) / 86400000);
    if (days < 1) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 7) return 'hace ' + days + ' días';
    return new Date(ms).toLocaleDateString('es');
  }

  async function renderRecent() {
    const items = await LE.Library.list();
    recentList.textContent = '';
    recentSection.hidden = !items.length;
    for (const item of items) {
      const page = LE.storage.get('learne.pos.' + item.key, 1);
      recentList.append(
        LE.el('li', { class: 'recent-item' }, [
          LE.el('button', { class: 'recent-open', onclick: () => openFile(new File([item.blob], item.name, { type: 'application/pdf' })) }, [
            LE.el('span', { class: 'recent-name', text: item.name.replace(/\.pdf$/i, '') }),
            LE.el('span', {
              class: 'recent-meta',
              text: `Página ${page}${item.numPages ? ' de ' + item.numPages : ''} · ${formatDate(item.lastOpened)}`,
            }),
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
    renderRecent();
  }
  libraryBtn.addEventListener('click', showLibrary);

  // Reopen the PDF that was open before a reload.
  renderRecent().then((items) => {
    const lastKey = LE.storage.get('learne.lastOpen', null);
    const last = lastKey && items.find((i) => i.key === lastKey);
    if (last && !LE.Viewer.docKey) openFile(new File([last.blob], last.name, { type: 'application/pdf' }));
  });

  fileInput.addEventListener('change', () => {
    openFile(fileInput.files[0]);
    fileInput.value = '';
  });

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
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    openFile(e.dataTransfer.files[0]);
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
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (full && !/\s$/.test(full)) full += ' ';
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

    let text = LE.cleanText(selection.toString());
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

  viewer.addEventListener('mouseup', () => setTimeout(handleSelection, 10));

  // Touch devices don't fire mouseup reliably after adjusting the selection handles.
  let mouseDown = false;
  let selectionTimer = null;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    if (!mouseDown) selectionTimer = setTimeout(handleSelection, 700);
  });
  viewer.addEventListener('mousedown', () => {
    mouseDown = true;
    lastText = '';
  });
  document.addEventListener('mouseup', () => {
    mouseDown = false;
  });

  // Left/right arrows change page when not typing.
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') LE.Viewer.goTo(LE.Viewer.currentPage + 1);
    if (e.key === 'ArrowLeft') LE.Viewer.goTo(LE.Viewer.currentPage - 1);
  });
})();
