import {
  SCREENS, SEATS, LIGHTS, RECEIVED, VIEWERS, SCALES,
  USER_DISTANCE, CARD_SHORT_MM, CARD_LONG_MM, DEFAULT_PX_PER_MM,
  UI_TEXT_PX, MAX_SLIDE_WIDTH, MAX_SLIDES,
} from './presets.js';
import { simulate, resample, physical, makeCanvas } from './simulate.js';
import { analyze, minReadable, TOO_SMALL, TOO_FAINT } from './legibility.js';
import { drawSample } from './sample.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
const byId = (list, id) => list.find((x) => x.id === id);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('backrow:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('backrow:' + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  },
};

const LIGHT_LIST = Object.entries(LIGHTS).map(([id, v]) => ({ id, label: v.label }));

const state = {
  slides: [],
  idx: 0,
  mode: store.get('mode', 'room'),
  screen: store.get('screen', 'proj100'),
  distance: Number(store.get('distance', 9)),
  light: store.get('light', 'bright'),
  recv: store.get('recv', '720'),
  viewer: store.get('viewer', 'laptop'),
  scale: store.get('scale', 'auto'),
  overlay: store.get('overlay', true) !== false,
  fit: store.get('fit', false) === true,
  view: 'audience',
  split: 50,
  pxPerMm: store.get('pxPerMm', null),
};
if (state.mode !== 'room' && state.mode !== 'call') state.mode = 'room';
if (!byId(SCREENS, state.screen)) state.screen = 'proj100';
if (!LIGHTS[state.light]) state.light = 'bright';
if (!byId(RECEIVED, state.recv)) state.recv = '720';
if (!byId(VIEWERS, state.viewer)) state.viewer = 'laptop';
if (!byId(SCALES, state.scale)) state.scale = 'auto';
if (!(state.distance >= 1 && state.distance <= 20)) state.distance = 9;
if (!(typeof state.pxPerMm === 'number' && state.pxPerMm > 1 && state.pxPerMm < 20)) state.pxPerMm = null;

const el = {
  empty: $('empty'), work: $('work'), dropZone: $('dropZone'),
  fileInput: $('fileInput'), fileInput2: $('fileInput2'), sampleBtn: $('sampleBtn'), clearBtn: $('clearBtn'),
  modeSeg: $('modeSeg'), roomCtl: $('roomCtl'), callCtl: $('callCtl'),
  screenChips: $('screenChips'), seatChips: $('seatChips'), lightChips: $('lightChips'),
  distRange: $('distRange'), distOut: $('distOut'),
  recvChips: $('recvChips'), viewerChips: $('viewerChips'), scaleChips: $('scaleChips'),
  overlayChk: $('overlayChk'), fitChk: $('fitChk'),
  calibStatus: $('calibStatus'), calibBtn: $('calibBtn'), calibDlg: $('calibDlg'), card: $('card'), cardRange: $('cardRange'),
  verdict: $('verdict'), viewSeg: $('viewSeg'), legend: $('legend'),
  frame: $('frame'), wrap: $('wrap'), origCv: $('origCv'), audCv: $('audCv'), ovCv: $('ovCv'),
  divider: $('divider'), splitRange: $('splitRange'), tagL: $('tagL'), tagR: $('tagR'),
  busy: $('busy'), sizeNote: $('sizeNote'), thumbs: $('thumbs'),
  dropVeil: $('dropVeil'), toast: $('toast'), themeBtn: $('themeBtn'),
};

/* ---------- Config ---------- */

function cfg() {
  if (state.mode === 'room') {
    const screen = byId(SCREENS, state.screen);
    return {
      mode: 'room', screen, light: LIGHTS[state.light], distance: state.distance,
      key: `room|${screen.id}|${state.distance}|${state.light}`,
    };
  }
  const recv = byId(RECEIVED, state.recv);
  const viewer = byId(VIEWERS, state.viewer);
  return { mode: 'call', recv, viewer, key: `call|${recv.id}|${viewer.id}` };
}

function persist() {
  for (const k of ['mode', 'screen', 'distance', 'light', 'recv', 'viewer', 'scale', 'overlay', 'fit']) {
    store.set(k, state[k]);
  }
}

/* ---------- Controls ---------- */

function buildChips(container, items, onPick) {
  container.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = it.label;
    b.dataset.id = it.id;
    b.addEventListener('click', () => onPick(it));
    container.appendChild(b);
  }
}

function syncChips(container, currentId) {
  for (const b of container.children) b.setAttribute('aria-pressed', String(b.dataset.id === String(currentId)));
}

function syncSeg(container, attr, value) {
  for (const b of container.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
}

function changed({ recompute = true } = {}) {
  persist();
  syncUI();
  if (recompute) scheduleRender();
  else draw();
}

buildChips(el.screenChips, SCREENS, (it) => { state.screen = it.id; changed(); });
buildChips(el.seatChips, SEATS.map((s) => ({ ...s, label: `${s.label}, ${s.distance} m` })), (it) => { state.distance = it.distance; changed(); });
buildChips(el.lightChips, LIGHT_LIST, (it) => { state.light = it.id; changed(); });
buildChips(el.recvChips, RECEIVED, (it) => { state.recv = it.id; changed(); });
buildChips(el.viewerChips, VIEWERS, (it) => { state.viewer = it.id; changed(); });
buildChips(el.scaleChips, SCALES, (it) => { state.scale = it.id; changed({ recompute: false }); renderVerdict(); });

el.modeSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b || b.dataset.mode === state.mode) return;
  state.mode = b.dataset.mode;
  changed();
});
el.viewSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  state.view = b.dataset.view;
  syncUI();
  applyView();
});
el.distRange.addEventListener('input', () => {
  state.distance = Number(el.distRange.value);
  changed();
});
el.overlayChk.addEventListener('change', () => { state.overlay = el.overlayChk.checked; changed({ recompute: false }); });
el.fitChk.addEventListener('change', () => { state.fit = el.fitChk.checked; changed({ recompute: false }); });
el.splitRange.addEventListener('input', () => { state.split = Number(el.splitRange.value); applyView(); });

function syncUI() {
  syncSeg(el.modeSeg, 'mode', state.mode);
  syncSeg(el.viewSeg, 'view', state.view);
  el.roomCtl.hidden = state.mode !== 'room';
  el.callCtl.hidden = state.mode !== 'call';
  syncChips(el.screenChips, state.screen);
  const seat = SEATS.find((s) => s.distance === state.distance);
  syncChips(el.seatChips, seat ? seat.id : '');
  syncChips(el.lightChips, state.light);
  syncChips(el.recvChips, state.recv);
  syncChips(el.viewerChips, state.viewer);
  syncChips(el.scaleChips, state.scale);
  el.distRange.value = String(state.distance);
  el.distOut.textContent = `${state.distance} m`;
  el.overlayChk.checked = state.overlay;
  el.fitChk.checked = state.fit;
  el.legend.hidden = !state.overlay;
  el.calibStatus.textContent = state.pxPerMm ? 'Screen calibrated.' : 'Sizes assume a typical laptop screen.';
  el.calibBtn.textContent = state.pxPerMm ? 'Recalibrate' : 'Calibrate';
  for (const s of state.slides) updateBadge(s);
}

/* ---------- Theme ---------- */

el.themeBtn.addEventListener('click', () => {
  const root = document.documentElement;
  const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  store.set('theme', next);
});

/* ---------- Input ---------- */

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
}

function setBusy(on) {
  el.busy.hidden = !on;
}

async function loadBitmap(blob) {
  try {
    return await createImageBitmap(blob);
  } catch {
    // SVG and some formats only decode through an <img>.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toSlideCanvas(source) {
  let w = source.naturalWidth || source.width;
  let h = source.naturalHeight || source.height;
  if (!w || !h) throw new Error('empty image');
  if (w > MAX_SLIDE_WIDTH) {
    h = (h * MAX_SLIDE_WIDTH) / w;
    w = MAX_SLIDE_WIDTH;
  }
  let flat = source;
  if (!(source instanceof HTMLCanvasElement)) {
    flat = makeCanvas(source.naturalWidth || source.width, source.naturalHeight || source.height);
    flat.getContext('2d').drawImage(source, 0, 0);
  }
  const sized = flat.width === Math.round(w) ? flat : resample(flat, w, h);
  // Flatten transparency onto white, the way it would show on a slide.
  const out = makeCanvas(sized.width, sized.height);
  const x = out.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, out.width, out.height);
  x.drawImage(sized, 0, 0);
  return out;
}

function addSlide(name, canvas) {
  if (state.slides.length >= MAX_SLIDES) return false;
  const thumb = resample(canvas, 256, (256 * canvas.height) / canvas.width);
  state.slides.push({ name, canvas, thumb, verdict: null, el: null, badge: null });
  return true;
}

let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS;
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        const lib = window.pdfjsLib;
        if (!lib) return reject(new Error('pdf.js missing'));
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(lib);
      };
      s.onerror = () => { pdfjsPromise = null; reject(new Error('pdf.js failed to load')); };
      document.head.appendChild(s);
    });
  }
  return pdfjsPromise;
}

async function addPdf(file) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const base = file.name.replace(/\.pdf$/i, '');
  for (let p = 1; p <= doc.numPages; p++) {
    if (state.slides.length >= MAX_SLIDES) break;
    const page = await doc.getPage(p);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = 1920 / vp1.width;
    const vp = page.getViewport({ scale });
    const c = makeCanvas(vp.width, vp.height);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    addSlide(`${base}, page ${p}`, c);
    page.cleanup();
  }
  doc.destroy();
}

function isPdf(f) {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
}

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => isPdf(f) || (f.type || '').startsWith('image/'));
  if (!files.length) {
    toast('Add images (PNG, JPG, WebP, SVG) or a PDF.');
    return;
  }
  const firstNew = state.slides.length;
  setBusy(true);
  for (const f of files) {
    if (state.slides.length >= MAX_SLIDES) {
      toast(`Back Row holds up to ${MAX_SLIDES} slides at a time.`);
      break;
    }
    try {
      if (isPdf(f)) await addPdf(f);
      else addSlide(f.name || 'Pasted image', toSlideCanvas(await loadBitmap(f)));
    } catch (err) {
      console.warn(err);
      toast(`Couldn't read ${f.name || 'that file'}.`);
    }
  }
  setBusy(false);
  if (state.slides.length > firstNew) {
    state.idx = firstNew;
    showWork();
  }
}

el.fileInput.addEventListener('change', () => { addFiles(el.fileInput.files); el.fileInput.value = ''; });
el.fileInput2.addEventListener('change', () => { addFiles(el.fileInput2.files); el.fileInput2.value = ''; });
el.sampleBtn.addEventListener('click', () => {
  addSlide('Sample slide', drawSample());
  state.idx = state.slides.length - 1;
  showWork();
});
el.clearBtn.addEventListener('click', () => {
  state.slides = [];
  state.idx = 0;
  currentRes = null;
  bgRun++;
  renderToken++;
  el.thumbs.innerHTML = '';
  el.work.hidden = true;
  el.empty.hidden = false;
});

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  el.dropVeil.hidden = false;
});
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) el.dropVeil.hidden = true;
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  el.dropVeil.hidden = true;
  addFiles(e.dataTransfer.files);
});
window.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    addFiles(files);
  }
});

window.addEventListener('keydown', (e) => {
  if (el.work.hidden || e.target.closest('input, textarea, dialog')) return;
  if (e.key === 'ArrowRight' && state.idx < state.slides.length - 1) select(state.idx + 1);
  if (e.key === 'ArrowLeft' && state.idx > 0) select(state.idx - 1);
});

/* ---------- Thumbnails ---------- */

function paint(canvas, src) {
  canvas.width = src.width;
  canvas.height = src.height;
  canvas.getContext('2d').drawImage(src, 0, 0);
}

function buildThumbs() {
  el.thumbs.innerHTML = '';
  state.slides.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.title = s.name;
    b.setAttribute('aria-label', `Slide ${i + 1}: ${s.name}`);
    const cv = document.createElement('canvas');
    paint(cv, s.thumb);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    const badge = document.createElement('span');
    badge.className = 'badge';
    b.append(cv, num, badge);
    b.addEventListener('click', () => select(i));
    s.el = b;
    s.badge = badge;
    el.thumbs.appendChild(b);
    updateBadge(s);
  });
  el.thumbs.hidden = state.slides.length < 2;
  syncThumbs();
}

function syncThumbs() {
  state.slides.forEach((s, i) => s.el && s.el.setAttribute('aria-current', String(i === state.idx)));
  const cur = state.slides[state.idx];
  if (cur?.el) cur.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function updateBadge(s) {
  if (!s.badge) return;
  const v = s.verdict;
  if (v && v.key === cfg().key) {
    const n = v.small + v.faint;
    s.badge.textContent = n ? String(n) : '✓';
    s.badge.className = 'badge ' + (n ? 'bad' : 'ok');
    s.badge.title = n ? `${n} problem area${n === 1 ? '' : 's'}` : 'Reads fine';
  } else {
    s.badge.textContent = '';
    s.badge.className = 'badge';
  }
}

function select(i) {
  state.idx = i;
  syncThumbs();
  renderCurrent();
}

function showWork() {
  el.empty.hidden = true;
  el.work.hidden = false;
  buildThumbs();
  syncUI();
  renderCurrent();
}

/* ---------- Rendering ---------- */

let renderToken = 0;
let renderTimer = 0;
let currentRes = null;

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderCurrent, 60);
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function renderCurrent() {
  const slide = state.slides[state.idx];
  if (!slide) return;
  const c = cfg();
  const token = ++renderToken;
  setBusy(true);
  await nextFrame();
  try {
    const sim = await simulate(slide.canvas, c);
    if (token !== renderToken) return;
    const a = analyze(slide.canvas, sim);
    const v = minReadable(slide.canvas.width, slide.canvas.height, c);
    if (token !== renderToken) return;
    slide.verdict = { key: c.key, small: a.small, faint: a.faint };
    updateBadge(slide);
    currentRes = { slide, c, sim, a, v };
    draw();
    renderVerdict();
  } catch (err) {
    console.error(err);
    toast('Something went wrong drawing that slide.');
  } finally {
    if (token === renderToken) setBusy(false);
  }
  backgroundVerdicts();
}

function draw() {
  if (!currentRes) return;
  const { slide, c, sim, a } = currentRes;
  const w = slide.canvas.width;
  const h = slide.canvas.height;
  const { W, D } = physical(c, w, h);
  const ppm = state.pxPerMm || DEFAULT_PX_PER_MM;
  const lifeCss = USER_DISTANCE * (W / D) * 1000 * ppm;
  const available = Math.max(120, el.frame.clientWidth - 2 * parseFloat(getComputedStyle(el.frame).paddingLeft || '16'));
  let cssW = lifeCss;
  let scaled = false;
  if (state.fit && lifeCss > available) {
    cssW = available;
    scaled = true;
  }
  const cssH = (cssW * h) / w;
  el.wrap.style.width = `${cssW}px`;
  el.wrap.style.height = `${cssH}px`;

  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const pw = Math.max(1, Math.min(4096, Math.round(cssW * dpr)));
  const ph = Math.max(1, Math.round((pw * h) / w));
  paint(el.origCv, resample(slide.canvas, pw, ph));
  paint(el.audCv, resample(sim.degraded, pw, ph));
  drawOverlay(pw, ph, a);
  applyView();

  const notes = [];
  if (scaled) {
    notes.push(`Scaled down to fit, so this looks harder to read than it is. Life size is ${Math.round((lifeCss / cssW) * 100 - 100)}% larger.`);
  } else {
    notes.push('Drawn life size for viewing from about 60 cm, roughly an arm’s length.');
  }
  if (!state.pxPerMm) notes.push('Calibrate your screen for exact sizes.');
  el.sizeNote.textContent = notes.join(' ');
}

function drawOverlay(pw, ph, a) {
  const cv = el.ovCv;
  cv.width = pw;
  cv.height = ph;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, pw, ph);
  const sx = pw / a.w;
  const sy = ph / a.h;
  const styles = getComputedStyle(document.documentElement);
  const colors = {
    [TOO_SMALL]: styles.getPropertyValue('--small').trim() || '#ff3b30',
    [TOO_FAINT]: styles.getPropertyValue('--faint').trim() || '#ff9f0a',
  };
  x.globalAlpha = 0.42;
  for (let cy = 0; cy < a.rows; cy++) {
    for (let cx = 0; cx < a.cols; cx++) {
      const t = a.grid[cy * a.cols + cx];
      if (!t) continue;
      x.fillStyle = colors[t];
      const x0 = Math.floor(cx * a.cell * sx);
      const y0 = Math.floor(cy * a.cell * sy);
      const x1 = Math.ceil(Math.min(a.w, (cx + 1) * a.cell) * sx);
      const y1 = Math.ceil(Math.min(a.h, (cy + 1) * a.cell) * sy);
      x.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  x.globalAlpha = 1;
}

function applyView() {
  const v = state.view;
  el.origCv.hidden = v === 'audience';
  el.audCv.hidden = v === 'original';
  el.ovCv.hidden = !state.overlay;
  const split = v === 'split';
  el.splitRange.hidden = !split;
  el.divider.hidden = !split;
  el.tagL.hidden = !split;
  el.tagR.hidden = !split;
  el.audCv.style.clipPath = split ? `inset(0 0 0 ${state.split}%)` : '';
  el.divider.style.left = `${state.split}%`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function renderVerdict() {
  if (!currentRes) return;
  const { slide, c, a, v } = currentRes;
  const w = slide.canvas.width;
  const h = slide.canvas.height;
  let sub;
  let extra = '';
  if (c.mode === 'room') {
    const aspect = w / h;
    const pt = Math.round((v * 960) / w);
    sub = `Font size on this ${w}px-wide slide${aspect > 1.7 && aspect < 1.8 ? `, about ${pt}pt in a 16:9 PowerPoint deck` : ''}.`;
  } else {
    sub = `Font size in this ${w}px-wide screenshot.`;
    const s = state.scale === 'auto' ? (w >= 2400 ? 2 : 1) : Number(state.scale);
    const uiPx = UI_TEXT_PX * s;
    const zoom = Math.ceil(((v / uiPx) * 100) / 10) * 10;
    extra = zoom > 100
      ? `<p>Normal ${UI_TEXT_PX}px interface text is ${uiPx}px here, too small for this viewer. Zoom the window you share to at least <strong>${zoom}%</strong>.</p>`
      : `<p>Normal ${UI_TEXT_PX}px interface text reads fine at 100% zoom.</p>`;
  }
  let status;
  if (a.small + a.faint === 0) {
    status = `<p class="status-ok">Nothing on this slide gets lost from here.</p>`;
  } else {
    const parts = [];
    if (a.small) parts.push(`<i class="dot small"></i>${plural(a.small, 'area')} too small`);
    if (a.faint) parts.push(`<i class="dot faint"></i>${plural(a.faint, 'area')} too faint`);
    status = `<p class="status-bad">${parts.join('&ensp;')}</p>`;
  }
  el.verdict.innerHTML = `
    <div class="big">${v}<small>px</small></div>
    <div class="vtext">
      <strong>Smallest readable text</strong>
      <span class="sub">${sub}</span>
      ${extra}
      ${status}
    </div>`;
}

let bgRun = 0;
const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 500 }) : setTimeout(r, 30)));

async function backgroundVerdicts() {
  const run = ++bgRun;
  const c = cfg();
  for (const s of state.slides) {
    if (run !== bgRun) return;
    if (s.verdict && s.verdict.key === c.key) continue;
    await idle();
    if (run !== bgRun) return;
    try {
      const sim = await simulate(s.canvas, c);
      if (run !== bgRun) return;
      const a = analyze(s.canvas, sim);
      s.verdict = { key: c.key, small: a.small, faint: a.faint };
      updateBadge(s);
    } catch (err) {
      console.warn(err);
    }
  }
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(draw, 120);
});

/* ---------- Calibration ---------- */

function sizeCard() {
  const w = Number(el.cardRange.value);
  el.card.style.width = `${w}px`;
  el.card.style.height = `${(w * CARD_LONG_MM) / CARD_SHORT_MM}px`;
}
el.calibBtn.addEventListener('click', () => {
  el.cardRange.value = String(Math.round((state.pxPerMm || DEFAULT_PX_PER_MM) * CARD_SHORT_MM));
  sizeCard();
  el.calibDlg.returnValue = '';
  el.calibDlg.showModal();
});
el.cardRange.addEventListener('input', sizeCard);
el.calibDlg.addEventListener('close', () => {
  if (el.calibDlg.returnValue !== 'save') return;
  state.pxPerMm = Number(el.cardRange.value) / CARD_SHORT_MM;
  store.set('pxPerMm', state.pxPerMm);
  syncUI();
  draw();
});

syncUI();
