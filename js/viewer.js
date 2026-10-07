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
  let pages = []; // { num, div, width, height, state: 'empty' | 'rendering' | 'done' | 'stale', generation }
  let generation = 0;
  let currentPage = 1;
  let observer = null;
  const pageListeners = new Set();
  const zoomListeners = new Set();

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
    if ((p.state !== 'empty' && p.state !== 'stale') || Math.abs(p.num - currentPage) > KEEP_RENDERED + 2) return;
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

  /*
   * Changes the zoom keeping the point under (fx, fy) — coordinates relative to the
   * scroller — in place. Already rendered pages are stretched until they re-render,
   * so the page never goes blank while zooming.
   */
  function setScale(next, fx, fy) {
    if (!pdf) return;
    next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(next * 100) / 100));
    if (next === scale) return;
    if (fx == null) fx = scroller.clientWidth / 2;
    if (fy == null) fy = scroller.clientHeight / 2;

    // Remember which point of which page is under the focal point.
    const contentY = scroller.scrollTop + fy;
    const anchorPage = pages.find((p) => p.div.offsetTop + p.div.offsetHeight >= contentY) || pages[pages.length - 1];
    const relX = (scroller.scrollLeft + fx - anchorPage.div.offsetLeft) / anchorPage.div.offsetWidth;
    const relY = (contentY - anchorPage.div.offsetTop) / anchorPage.div.offsetHeight;

    scale = next;
    LE.storage.set('learne.zoom', scale);
    generation++;
    for (const p of pages) {
      if (p.state === 'empty') continue;
      const layer = p.div.querySelector('.textLayer');
      if (layer) layer.remove();
      const canvas = p.div.querySelector('canvas');
      if (canvas) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }
      p.state = 'stale';
    }
    layout();
    scroller.scrollLeft = anchorPage.div.offsetLeft + relX * anchorPage.div.offsetWidth - fx;
    scroller.scrollTop = anchorPage.div.offsetTop + relY * anchorPage.div.offsetHeight - fy;
    updateCurrentPage();

    // Re-trigger rendering of the pages now in view.
    observer.disconnect();
    pages.forEach((p) => observer.observe(p.div));
    zoomListeners.forEach((fn) => fn(scale));
  }

  /* ---------- Pinch to zoom (touch) and Ctrl + wheel / trackpad pinch (desktop) ---------- */

  let gesture = null; // { ratio, fx, fy }

  function previewGesture(ratio, fx, fy) {
    ratio = Math.max(MIN_SCALE / scale, Math.min(MAX_SCALE / scale, ratio));
    if (!gesture) gesture = { fx, fy };
    gesture.ratio = ratio;
    container.style.transformOrigin =
      `${scroller.scrollLeft + gesture.fx - container.offsetLeft}px ${scroller.scrollTop + gesture.fy - container.offsetTop}px`;
    container.style.transform = `scale(${ratio})`;
  }

  function commitGesture() {
    if (!gesture) return;
    const { ratio, fx, fy } = gesture;
    gesture = null;
    container.style.transform = '';
    container.style.transformOrigin = '';
    if (ratio) setScale(scale * ratio, fx, fy);
  }

  function touchInfo(touches) {
    const [a, b] = touches;
    const rect = scroller.getBoundingClientRect();
    return {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      fx: (a.clientX + b.clientX) / 2 - rect.left,
      fy: (a.clientY + b.clientY) / 2 - rect.top,
    };
  }

  let pinchStart = null;
  scroller.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2 && pdf) {
      pinchStart = touchInfo(e.touches);
      gesture = null;
    }
  }, { passive: true });

  scroller.addEventListener('touchmove', (e) => {
    if (!pinchStart || e.touches.length !== 2) return;
    e.preventDefault();
    const now = touchInfo(e.touches);
    previewGesture(now.dist / pinchStart.dist, pinchStart.fx, pinchStart.fy);
  }, { passive: false });

  const endPinch = (e) => {
    if (pinchStart && e.touches.length < 2) {
      pinchStart = null;
      commitGesture();
    }
  };
  scroller.addEventListener('touchend', endPinch);
  scroller.addEventListener('touchcancel', endPinch);

  // Safari fires its own gesture events for pinches; stop it from zooming the whole page.
  scroller.addEventListener('gesturestart', (e) => e.preventDefault());

  let wheelTimer = null;
  let wheelRatio = 1;
  scroller.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !pdf) return;
    e.preventDefault();
    const rect = scroller.getBoundingClientRect();
    wheelRatio *= Math.exp(-e.deltaY * 0.002);
    previewGesture(wheelRatio, e.clientX - rect.left, e.clientY - rect.top);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelRatio = 1;
      commitGesture();
    }, 200);
  }, { passive: false });

  return {
    open,
    goTo,
    zoomIn: () => setScale(scale * 1.15),
    zoomOut: () => setScale(scale / 1.15),
    onZoom: (fn) => zoomListeners.add(fn),
    get scale() { return scale; },
    get currentPage() { return currentPage; },
    get docKey() { return docKey; },
    onPageChange: (fn) => pageListeners.add(fn),
  };
})();
