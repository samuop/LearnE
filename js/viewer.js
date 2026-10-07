/*
 * PDF viewer built on pdf.js: continuous scroll, lazy rendering of visible pages,
 * a selectable text layer, zoom and page navigation.
 */
LE.Viewer = (() => {
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

  const KEEP_RENDERED = 4; // pages kept rendered around the current one
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3;

  const scroller = document.getElementById('viewer');
  const container = document.getElementById('pages');

  let pdf = null;
  let docKey = '';
  let scale = 1.25;
  let pages = []; // { num, div, width, height, state: 'empty' | 'rendering' | 'done', generation }
  let generation = 0;
  let currentPage = 1;
  let observer = null;
  const pageListeners = new Set();

  document.addEventListener('mouseup', () => {
    container.querySelectorAll('.endOfContent.active').forEach((e) => e.classList.remove('active'));
  });

  function fitScale(pageWidth) {
    const available = scroller.clientWidth - 24;
    const fit = available / pageWidth;
    return Math.max(MIN_SCALE, Math.min(1.5, fit));
  }

  async function open(data, key) {
    close();
    pdf = await pdfjsLib.getDocument({ data }).promise;
    docKey = key;

    const first = await pdf.getPage(1);
    const base = first.getViewport({ scale: 1 });
    scale = LE.storage.get('learne.zoom', null) || fitScale(base.width);

    pages = [];
    for (let num = 1; num <= pdf.numPages; num++) {
      const div = LE.el('div', { class: 'page', 'data-page': num });
      div.append(LE.el('div', { class: 'page-label', text: 'Página ' + num }));
      container.append(div);
      pages.push({ num, div, width: base.width, height: base.height, state: 'empty', generation: 0 });
    }
    layout();
    observe();

    const saved = LE.storage.get('learne.pos.' + docKey, 1);
    goTo(saved);
    return pdf.numPages;
  }

  function close() {
    if (observer) observer.disconnect();
    if (pdf) pdf.destroy();
    pdf = null;
    pages = [];
    container.textContent = '';
    generation++;
  }

  function layout() {
    for (const p of pages) {
      p.div.style.width = Math.floor(p.width * scale) + 'px';
      p.div.style.height = Math.floor(p.height * scale) + 'px';
    }
  }

  function observe() {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = pages[Number(entry.target.dataset.page) - 1];
          if (page) render(page);
        }
        updateCurrentPage();
      },
      { root: scroller, rootMargin: '100% 0px' }
    );
    pages.forEach((p) => observer.observe(p.div));
    scroller.addEventListener('scroll', updateCurrentPage, { passive: true });
  }

  function updateCurrentPage() {
    if (!pages.length) return;
    const middle = scroller.scrollTop + scroller.clientHeight / 3;
    let found = pages[0];
    for (const p of pages) {
      if (p.div.offsetTop <= middle) found = p;
      else break;
    }
    if (found.num !== currentPage) {
      currentPage = found.num;
      LE.storage.set('learne.pos.' + docKey, currentPage);
      pageListeners.forEach((fn) => fn(currentPage, pages.length));
      evictFarPages();
    }
  }

  function evictFarPages() {
    for (const p of pages) {
      if (p.state !== 'empty' && Math.abs(p.num - currentPage) > KEEP_RENDERED) {
        p.div.textContent = '';
        p.div.append(LE.el('div', { class: 'page-label', text: 'Página ' + p.num }));
        p.state = 'empty';
      }
    }
  }

  async function render(p) {
    if (p.state !== 'empty' || Math.abs(p.num - currentPage) > KEEP_RENDERED + 2) return;
    p.state = 'rendering';
    const gen = generation;
    try {
      const page = await pdf.getPage(p.num);
      if (gen !== generation) return;
      const viewport = page.getViewport({ scale });
      p.width = viewport.width / scale;
      p.height = viewport.height / scale;

      const dpr = window.devicePixelRatio || 1;
      const canvas = LE.el('canvas');
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const textLayer = LE.el('div', { class: 'textLayer' });
      textLayer.style.setProperty('--scale-factor', viewport.scale);

      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      }).promise;
      if (gen !== generation || p.state !== 'rendering') return;

      p.div.textContent = '';
      p.div.style.width = Math.floor(viewport.width) + 'px';
      p.div.style.height = Math.floor(viewport.height) + 'px';
      p.div.append(canvas, textLayer);

      await pdfjsLib.renderTextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayer,
        viewport,
        textDivs: [],
      }).promise;

      // Helps selection behave when dragging past the end of the text (same trick as pdf.js viewer).
      const end = LE.el('div', { class: 'endOfContent' });
      textLayer.append(end);
      textLayer.addEventListener('mousedown', () => end.classList.add('active'));

      p.state = 'done';
      p.generation = gen;
    } catch (error) {
      if (p.state === 'rendering') p.state = 'empty';
      if (error && error.name !== 'RenderingCancelledException') console.error(error);
    }
  }

  function goTo(num) {
    if (!pages.length) return;
    const target = pages[Math.max(1, Math.min(pages.length, num)) - 1];
    scroller.scrollTop = target.div.offsetTop - 12;
    updateCurrentPage();
  }

  function setScale(next) {
    if (!pdf) return;
    next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(next * 100) / 100));
    if (next === scale) return;
    const keep = currentPage;
    scale = next;
    LE.storage.set('learne.zoom', scale);
    generation++;
    for (const p of pages) {
      p.div.textContent = '';
      p.div.append(LE.el('div', { class: 'page-label', text: 'Página ' + p.num }));
      p.state = 'empty';
    }
    layout();
    currentPage = 0;
    goTo(keep);
    // Re-trigger rendering of the pages now in view.
    observer.disconnect();
    pages.forEach((p) => observer.observe(p.div));
  }

  return {
    open,
    goTo,
    zoomIn: () => setScale(scale * 1.15),
    zoomOut: () => setScale(scale / 1.15),
    get scale() { return scale; },
    get currentPage() { return currentPage; },
    get docKey() { return docKey; },
    onPageChange: (fn) => pageListeners.add(fn),
  };
})();
