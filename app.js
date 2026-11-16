import {
  SCREENS, LIGHTS, RECEIVED, DEVICES, APPS, LAYOUTS, SCALES,
  ROWS, SEATS_PER_ROW, CROWDS, seatDistance, seatOffset, seatTaken,
  CARD_SHORT_MM, CARD_LONG_MM, DEFAULT_PX_PER_MM,
  UI_TEXT_PX, MAX_SLIDE_WIDTH, MAX_SLIDES,
} from './presets.js';
import { simulate, resample, makeCanvas } from './simulate.js';
import { analyze, minReadable } from './legibility.js';
import { drawSample } from './sample.js';
import { renderRoom } from './scene-room.js';
import { renderCall } from './scene-call.js';
import { icon } from './icons.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
const byId = (list, id) => list.find((x) => x.id === id);
const LIGHT_LIST = Object.entries(LIGHTS).map(([id, v]) => ({ id, ...v }));
const LIGHT_SWATCH = { dark: '#141417', dim: '#55565d', bright: '#efebe4' };
const RECV_SUB = { 1080: 'Great link', 720: 'Typical', 480: 'Weak link' };

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

const state = {
  slides: [],
  idx: 0,
  mode: store.get('mode', 'room'),
  screen: store.get('screen', 'proj100'),
  seatRow: Number(store.get('seatRow', 7)),
  seatCol: Number(store.get('seatCol', 3)),
  light: store.get('light', 'bright'),
  crowd: store.get('crowd', 'full'),
  app: store.get('app', 'zoom'),
  device: store.get('device', 'laptop'),
  layout: store.get('layout', 'speaker'),
  recv: store.get('recv', '720'),
  scale: store.get('scale', 'auto'),
  overlay: store.get('overlay', true) !== false,
  fit: store.get('fit', false) === true,
  fitCall: store.get('fitCall', true) !== false,
  view: 'audience',
  pxPerMm: store.get('pxPerMm', null),
  src: null,
};
if (state.mode !== 'room' && state.mode !== 'call') state.mode = 'room';
if (!byId(SCREENS, state.screen)) state.screen = 'proj100';
if (!LIGHTS[state.light]) state.light = 'bright';
if (!byId(CROWDS, state.crowd)) state.crowd = 'full';
if (!byId(APPS, state.app)) state.app = 'zoom';
if (!byId(DEVICES, state.device)) state.device = 'laptop';
if (!byId(LAYOUTS, state.layout)) state.layout = 'speaker';
if (!byId(RECEIVED, state.recv)) state.recv = '720';
if (!byId(SCALES, state.scale)) state.scale = 'auto';
if (!(Number.isInteger(state.seatRow) && state.seatRow >= 0 && state.seatRow < ROWS)) state.seatRow = 7;
if (!(Number.isInteger(state.seatCol) && state.seatCol >= 0 && state.seatCol < SEATS_PER_ROW)) state.seatCol = 3;
if (!(typeof state.pxPerMm === 'number' && state.pxPerMm > 1 && state.pxPerMm < 20)) state.pxPerMm = null;

const el = Object.fromEntries([
  'empty', 'work', 'fileInput', 'fileInput2', 'sampleBtn', 'railSample', 'railAdd', 'themeBtn', 'clearBtn',
  'crumb', 'slideNav', 'slideName', 'slideCount', 'prevBtn', 'nextBtn',
  'viewSeg', 'lifePill', 'viewport', 'scene', 'roomCv', 'callHost', 'panHint', 'overlayBtn', 'fitBtn', 'busy',
  'verdictCard', 'statSmall', 'statFaint', 'statThird',
  'seatDist', 'seatRows', 'seatRowsEl', 'crowdSeg', 'scenePrev', 'sceneNext', 'sceneCount', 'sceneNav',
  'linkForm', 'linkInput', 'linkForm2', 'linkInput2', 'copyLinkBtn', 'screenTiles', 'lightTiles',
  'appTiles', 'layoutHead', 'layoutSeg', 'deviceTiles', 'recvTiles', 'scaleSeg',
  'thumbs', 'calibStatus', 'calibBtn', 'calibDlg', 'card', 'cardRange', 'dropVeil', 'toast',
].map((id) => [id, $(id)]));
const railModeBtns = [...document.querySelectorAll('.rail-btn[data-mode]')];

/* ---------- Icons ---------- */

railModeBtns.forEach((b) => { b.innerHTML = icon(b.dataset.mode === 'room' ? 'room' : 'call', 21); });
el.railAdd.insertAdjacentHTML('afterbegin', icon('plus', 21));
el.railSample.innerHTML = icon('sample', 21);
el.themeBtn.innerHTML = icon('theme', 20);
el.prevBtn.innerHTML = icon('left', 18);
el.nextBtn.innerHTML = icon('right', 18);
el.scenePrev.innerHTML = icon('left', 20);
el.sceneNext.innerHTML = icon('right', 20);
el.overlayBtn.innerHTML = icon('eye', 19);
el.fitBtn.innerHTML = icon('expand', 18);

/* ---------- Config ---------- */

function cfg() {
  if (state.mode === 'room') {
    const screen = byId(SCREENS, state.screen);
    return {
      mode: 'room',
      screen,
      light: LIGHTS[state.light],
      lightId: state.light,
      crowd: byId(CROWDS, state.crowd).fill,
      row: state.seatRow,
      distance: seatDistance(state.seatRow),
      offset: seatOffset(state.seatRow, state.seatCol),
      key: `room|${screen.id}|${state.seatRow}|${state.light}`,
    };
  }
  const recv = byId(RECEIVED, state.recv);
  const device = byId(DEVICES, state.device);
  const app = byId(APPS, state.app);
  const layout = byId(LAYOUTS, state.layout);
  return {
    mode: 'call', recv, device, app, layout,
    key: `call|${recv.id}|${device.id}|${app.id}|${device.id === 'phone' ? '-' : layout.id}`,
  };
}

function persist() {
  for (const k of ['mode', 'screen', 'seatRow', 'seatCol', 'light', 'crowd', 'app', 'device', 'layout', 'recv', 'scale', 'overlay', 'fit', 'fitCall']) {
    store.set(k, state[k]);
  }
}

/* ---------- Controls ---------- */

function buildTiles(container, items, inner, onPick) {
  container.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile';
    b.dataset.id = it.id;
    b.innerHTML = inner(it);
    b.addEventListener('click', () => onPick(it));
    container.appendChild(b);
  }
}

function buildSeg(container, items, onPick) {
  container.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = it.id;
    b.textContent = it.label;
    b.addEventListener('click', () => onPick(it));
    container.appendChild(b);
  }
}

function syncPressed(container, currentId) {
  for (const b of container.querySelectorAll('[data-id]')) b.setAttribute('aria-pressed', String(b.dataset.id === String(currentId)));
}

function changed({ recompute = true } = {}) {
  persist();
  syncUI();
  if (recompute) scheduleRender();
  else {
    drawScene();
    renderVerdict();
  }
}

buildTiles(el.screenTiles, SCREENS, (s) => `<span class="t-sub">${s.sub}</span><span class="t-big">${s.label}</span>`, (s) => { state.screen = s.id; changed(); });
buildTiles(el.lightTiles, LIGHT_LIST, (l) => `<span class="t-sw" style="background:${LIGHT_SWATCH[l.id]}"></span><span class="t-big">${l.label}</span><span class="t-sub">${l.sub}</span>`, (l) => { state.light = l.id; changed(); });
buildTiles(el.appTiles, APPS, (a) => `<span class="t-sub">Layout like</span><span class="t-big">${a.label.replace('-style', '')}</span>`, (a) => { state.app = a.id; changed(); });
buildTiles(el.deviceTiles, DEVICES, (d) => `<span class="t-ic">${icon(d.id, 22)}</span><span class="t-big">${d.label}</span><span class="t-sub">${d.sub}</span>`, (d) => { state.device = d.id; changed(); });
buildTiles(el.recvTiles, RECEIVED, (r) => `<span class="t-sub">${RECV_SUB[r.id]}</span><span class="t-big">${r.label}</span>`, (r) => { state.recv = r.id; changed(); });
buildSeg(el.layoutSeg, LAYOUTS, (l) => { state.layout = l.id; changed(); });
buildSeg(el.crowdSeg, CROWDS, (c) => { state.crowd = c.id; changed({ recompute: false }); });
buildSeg(el.scaleSeg, SCALES, (s) => { state.scale = s.id; changed({ recompute: false }); renderStats(); });

function buildSeatMap() {
  el.seatRowsEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = `seat-row ${r % 2 ? 'odd' : 'even'}`;
    for (let c = 0; c < SEATS_PER_ROW; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seat';
      b.dataset.r = String(r);
      b.dataset.c = String(c);
      b.setAttribute('aria-label', `Row ${r + 1}, seat ${c + 1}, ${seatDistance(r)} metres from the screen`);
      b.addEventListener('click', () => {
        const rowChanged = state.seatRow !== r;
        state.seatRow = r;
        state.seatCol = c;
        changed({ recompute: rowChanged });
      });
      row.appendChild(b);
    }
    el.seatRowsEl.appendChild(row);
  }
}
buildSeatMap();

function peopleAhead() {
  const fill = byId(CROWDS, state.crowd).fill;
  let n = 0;
  for (let r = 0; r < state.seatRow; r++) for (let c = 0; c < SEATS_PER_ROW; c++) if (seatTaken(r, c, fill)) n++;
  return n;
}
const peopleText = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;

function syncSeatMap() {
  for (const b of el.seatRowsEl.querySelectorAll('.seat')) {
    const r = Number(b.dataset.r);
    const c = Number(b.dataset.c);
    const you = r === state.seatRow && c === state.seatCol;
    const taken = !you && seatTaken(r, c, byId(CROWDS, state.crowd).fill);
    b.classList.toggle('you', you);
    b.classList.toggle('taken', taken);
    b.classList.toggle('ahead', taken && r < state.seatRow);
    b.setAttribute('aria-pressed', String(you));
  }
  const ahead = state.seatRow;
  const people = peopleAhead();
  el.seatDist.textContent = `${seatDistance(state.seatRow)} m`;
  el.seatRows.textContent = ahead === 0
    ? 'Front row, nothing in the way'
    : `${ahead} row${ahead === 1 ? '' : 's'} ahead, ${peopleText(people)} seated in them`;
}

el.viewSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  state.view = b.dataset.view;
  syncUI();
  drawScene();
});
el.overlayBtn.addEventListener('click', () => { state.overlay = !state.overlay; changed({ recompute: false }); });
const fitOn = () => (state.mode === 'call' ? state.fitCall : state.fit);
el.fitBtn.addEventListener('click', () => {
  if (state.mode === 'call') state.fitCall = !state.fitCall;
  else state.fit = !state.fit;
  changed({ recompute: false });
});
railModeBtns.forEach((b) => b.addEventListener('click', () => {
  if (state.mode === b.dataset.mode) return;
  state.mode = b.dataset.mode;
  changed();
}));

function crumbText() {
  const c = cfg();
  if (c.mode === 'room') {
    return `Row ${c.row + 1}, ${c.distance} m from a ${c.screen.label} ${c.screen.sub.toLowerCase()}, ${c.light.label.toLowerCase()} room`;
  }
  const where = c.device.id === 'phone' ? 'a phone' : c.device.id === 'monitor' ? 'a 24" monitor' : 'a laptop';
  return `${c.app.label} call on ${where}, ${c.recv.label}`;
}

function syncUI() {
  railModeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  el.work.classList.toggle('mode-room', state.mode === 'room');
  el.work.classList.toggle('mode-call', state.mode === 'call');
  for (const b of el.viewSeg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
  syncPressed(el.screenTiles, state.screen);
  syncPressed(el.lightTiles, state.light);
  syncPressed(el.appTiles, state.app);
  syncPressed(el.deviceTiles, state.device);
  syncPressed(el.recvTiles, state.recv);
  syncPressed(el.layoutSeg, state.layout);
  syncPressed(el.scaleSeg, state.scale);
  syncPressed(el.crowdSeg, state.crowd);
  const phone = state.device === 'phone';
  el.layoutHead.hidden = phone;
  el.layoutSeg.hidden = phone;
  syncSeatMap();
  el.overlayBtn.setAttribute('aria-pressed', String(state.overlay));
  el.fitBtn.setAttribute('aria-pressed', String(fitOn()));
  el.crumb.textContent = state.slides.length ? crumbText() : 'Can they read it from there?';
  el.calibStatus.textContent = state.pxPerMm ? 'Screen calibrated' : 'Sizes assume a typical laptop';
  el.calibBtn.textContent = state.pxPerMm ? 'Recalibrate' : 'Calibrate';
  const n = state.slides.length;
  el.slideNav.hidden = n === 0;
  if (n) {
    el.slideName.textContent = state.slides[state.idx].name;
    el.slideCount.textContent = `${String(state.idx + 1).padStart(2, '0')}/${String(n).padStart(2, '0')}`;
    el.prevBtn.disabled = state.idx === 0;
    el.nextBtn.disabled = state.idx >= n - 1;
    el.sceneCount.textContent = el.slideCount.textContent;
    el.scenePrev.disabled = el.prevBtn.disabled;
    el.sceneNext.disabled = el.nextBtn.disabled;
    el.sceneNav.hidden = n < 2;
  }
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
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  if (!sw || !sh) throw new Error('empty image');
  let w = sw;
  let h = sh;
  if (w > MAX_SLIDE_WIDTH) {
    h = (h * MAX_SLIDE_WIDTH) / w;
    w = MAX_SLIDE_WIDTH;
  }
  let flat = source;
  if (!(source instanceof HTMLCanvasElement)) {
    flat = makeCanvas(sw, sh);
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
  const thumb = resample(canvas, 336, (336 * canvas.height) / canvas.width);
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

async function addPdf(file, name = file.name) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const base = (name || 'Slides').replace(/\.pdf$/i, '');
  for (let p = 1; p <= doc.numPages; p++) {
    if (state.slides.length >= MAX_SLIDES) break;
    const page = await doc.getPage(p);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 1920 / vp1.width });
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

const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');

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

function addSample() {
  addSlide('Sample slide', drawSample());
  state.idx = state.slides.length - 1;
  showWork();
}

el.fileInput.addEventListener('change', () => { addFiles(el.fileInput.files); el.fileInput.value = ''; });
el.fileInput2.addEventListener('change', () => { addFiles(el.fileInput2.files); el.fileInput2.value = ''; });
el.sampleBtn.addEventListener('click', addSample);
el.railSample.addEventListener('click', addSample);
el.clearBtn.addEventListener('click', () => {
  state.slides = [];
  state.idx = 0;
  state.src = null;
  writeHash();
  currentRes = null;
  bgRun++;
  renderToken++;
  el.thumbs.innerHTML = '';
  el.work.hidden = true;
  el.empty.hidden = false;
  syncUI();
});
el.scenePrev.addEventListener('click', () => { if (state.idx > 0) select(state.idx - 1); });
el.sceneNext.addEventListener('click', () => { if (state.idx < state.slides.length - 1) select(state.idx + 1); });
el.prevBtn.addEventListener('click', () => { if (state.idx > 0) select(state.idx - 1); });
el.nextBtn.addEventListener('click', () => { if (state.idx < state.slides.length - 1) select(state.idx + 1); });

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
  if (el.work.hidden || (e.target.closest && e.target.closest('input, textarea, dialog'))) return;
  if (e.key === 'ArrowRight' && state.idx < state.slides.length - 1) select(state.idx + 1);
  if (e.key === 'ArrowLeft' && state.idx > 0) select(state.idx - 1);
});

/* ---------- Drag to pan ---------- */

let drag = null;
el.viewport.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || el.viewport.classList.contains('static')) return;
  if (e.target.closest('button')) return;
  drag = { x: e.clientX, y: e.clientY, l: el.viewport.scrollLeft, t: el.viewport.scrollTop };
  el.viewport.setPointerCapture(e.pointerId);
  el.viewport.classList.add('dragging');
});
el.viewport.addEventListener('pointermove', (e) => {
  if (!drag) return;
  el.viewport.scrollLeft = drag.l - (e.clientX - drag.x);
  el.viewport.scrollTop = drag.t - (e.clientY - drag.y);
});
const endDrag = () => {
  drag = null;
  el.viewport.classList.remove('dragging');
};
el.viewport.addEventListener('pointerup', endDrag);
el.viewport.addEventListener('pointercancel', endDrag);

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
    num.className = 'num-tag';
    num.textContent = String(i + 1).padStart(2, '0');
    const badge = document.createElement('span');
    badge.className = 'badge';
    b.append(cv, num, badge);
    b.addEventListener('click', () => select(i));
    s.el = b;
    s.badge = badge;
    el.thumbs.appendChild(b);
    updateBadge(s);
  });
  syncThumbs();
}

function syncThumbs() {
  state.slides.forEach((s, i) => s.el && s.el.setAttribute('aria-current', String(i === state.idx)));
  // Scroll only the strip, never the page.
  const cur = state.slides[state.idx];
  if (cur?.el) {
    const strip = el.thumbs;
    const left = cur.el.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft) strip.scrollLeft = left - 12;
    else if (left + cur.el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + cur.el.offsetWidth - strip.clientWidth + 12;
  }
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
  writeHash();
  syncThumbs();
  syncUI();
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
let lastSceneKey = '';

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderCurrent, 40);
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
    drawScene();
    renderVerdict();
  } catch (err) {
    console.error(err);
    toast('Something went wrong drawing that slide.');
  } finally {
    if (token === renderToken) setBusy(false);
  }
  backgroundVerdicts();
}

function overlayColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    small: s.getPropertyValue('--small').trim() || '#ff3b30',
    faint: s.getPropertyValue('--faint').trim() || '#ff9f0a',
  };
}

function drawScene() {
  if (!currentRes) return;
  const { slide, sim, a } = currentRes;
  const c = cfg();
  const viewW = el.viewport.clientWidth;
  const viewH = el.viewport.clientHeight;
  if (!viewW || !viewH) return;
  const opts = {
    slide: slide.canvas,
    image: state.view === 'original' ? slide.canvas : sim.degraded,
    analysis: a,
    overlay: state.overlay,
    cfg: c,
    ppm: state.pxPerMm || DEFAULT_PX_PER_MM,
    fit: fitOn(),
    viewW,
    viewH,
    colors: overlayColors(),
  };
  let r;
  if (c.mode === 'room') {
    el.callHost.hidden = true;
    el.callHost.innerHTML = '';
    el.roomCv.hidden = false;
    r = renderRoom({ canvas: el.roomCv, ...opts });
  } else {
    el.roomCv.hidden = true;
    el.roomCv.width = 1;
    el.roomCv.height = 1;
    el.callHost.hidden = false;
    r = renderCall({ host: el.callHost, ...opts });
  }
  el.scene.style.width = `${r.cssW}px`;
  el.scene.style.height = `${r.cssH}px`;

  // Re-centre on the screen when the scene itself changes, not on every repaint.
  const sceneKey = `${c.key}|${c.mode === 'room' ? state.seatCol : ''}|${fitOn()}|${viewW}|${viewH}|${state.pxPerMm}`;
  if (sceneKey !== lastSceneKey) {
    el.viewport.scrollLeft = Math.max(0, r.focusX - viewW / 2);
    el.viewport.scrollTop = Math.max(0, r.focusY - viewH / 2);
    lastSceneKey = sceneKey;
  }
  const scrollable = r.cssW > viewW + 1 || r.cssH > viewH + 1;
  el.panHint.hidden = !scrollable;
  el.viewport.classList.toggle('static', !scrollable);
  if (r.scaled) {
    el.lifePill.textContent = `Fitted, ${Math.round(100 / r.lifeRatio)}% of life size`;
    el.lifePill.classList.remove('warn');
  } else {
    el.lifePill.textContent = state.pxPerMm ? 'Life size at 60 cm' : 'Life size at 60 cm, uncalibrated';
    el.lifePill.classList.remove('warn');
  }
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function zoomNeeded() {
  const { slide, v } = currentRes;
  const w = slide.canvas.width;
  const s = state.scale === 'auto' ? (w >= 2400 ? 2 : 1) : Number(state.scale);
  return { zoom: Math.max(100, Math.ceil(((v / (UI_TEXT_PX * s)) * 100) / 10) * 10), s };
}

function renderVerdict() {
  if (!currentRes) return;
  const { slide, c, a, v } = currentRes;
  const w = slide.canvas.width;
  const h = slide.canvas.height;
  let sub;
  let advice = '';
  if (c.mode === 'room') {
    const aspect = w / h;
    const pt = Math.round((v * 960) / w);
    sub = `Font size on this ${w}px-wide slide${aspect > 1.7 && aspect < 1.8 ? `, about ${pt}pt in a 16:9 PowerPoint deck` : ''}.`;
  } else {
    sub = `Font size in this ${w}px-wide screenshot.`;
    const { zoom } = zoomNeeded();
    advice = zoom > 100
      ? `<p class="advice">Zoom the window you share to at least <strong>${zoom}%</strong>.</p>`
      : '<p class="advice">Normal interface text reads fine at 100% zoom.</p>';
  }
  const n = a.small + a.faint;
  const status = n === 0
    ? '<span class="status ok"><i></i>Everything reads from here</span>'
    : `<span class="status bad"><i></i>${plural(n, 'problem area')}</span>`;
  el.verdictCard.innerHTML = `
    <span class="label">Smallest readable text</span>
    <div class="bignum">${v}<small>px</small></div>
    <p class="sub">${sub}</p>
    ${advice}
    ${status}`;
  renderStats();
}

function renderStats() {
  if (!currentRes) return;
  const { c, a } = currentRes;
  const colors = overlayColors();
  el.statSmall.innerHTML = `
    <span class="label"><i class="swatch" style="background:${colors.small}"></i>Too small</span>
    <div class="bignum">${a.small}</div>
    <span class="cap">${a.small === 1 ? 'area' : 'areas'} of text they can't make out</span>`;
  el.statFaint.innerHTML = `
    <span class="label"><i class="swatch" style="background:${colors.faint}"></i>Too faint</span>
    <div class="bignum">${a.faint}</div>
    <span class="cap">${a.faint === 1 ? 'area' : 'areas'} that wash out</span>`;
  if (c.mode === 'room') {
    el.statThird.innerHTML = `
      <span class="label">Rows in front</span>
      <div class="bignum">${c.row}</div>
      <span class="cap">${c.row === 0 ? 'Front row, a clear view' : `${peopleText(peopleAhead())} between you and the screen`}</span>`;
  } else {
    const { zoom, s } = zoomNeeded();
    el.statThird.innerHTML = `
      <span class="label">Zoom needed</span>
      <div class="bignum">${zoom}<small>%</small></div>
      <span class="cap">${zoom > 100 ? `so ${UI_TEXT_PX}px interface text${s === 2 ? ' (28px in this 2x screenshot)' : ''} survives` : 'Normal interface text survives as it is'}</span>`;
  }
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
  resizeTimer = setTimeout(drawScene, 120);
});

/* ---------- Links (Google Slides, PDF and image URLs) ---------- */

function googleSlidesId(url) {
  const m = url.match(/docs\.google\.com\/presentation\/d\/(e\/)?([\w-]{20,})/);
  return m ? { published: !!m[1], id: m[2] } : null;
}

function linkSources(url) {
  const g = googleSlidesId(url);
  if (!g) return { google: false, urls: [url] };
  const base = `https://docs.google.com/presentation/d/${g.published ? 'e/' : ''}${g.id}`;
  return { google: true, urls: [`${base}/export/pdf`, `${base}/export?format=pdf`] };
}

async function fetchFirst(urls) {
  for (const u of urls) {
    try {
      // No cookies: a deck has to be shared with "Anyone with the link".
      const r = await fetch(u, { credentials: 'omit' });
      if (!r.ok) continue;
      const b = await r.blob();
      if (!b.type.includes('html')) return b;
    } catch {
      /* blocked or offline: try the next form of the link */
    }
  }
  return null;
}

async function addLink(raw, slideIndex = 0) {
  let url;
  try {
    url = new URL(raw.trim()).href;
  } catch {
    toast('Paste a full link, starting with https://');
    return;
  }
  const { google, urls } = linkSources(url);
  setBusy(true);
  const blob = await fetchFirst(urls);
  if (!blob) {
    setBusy(false);
    toast(google
      ? 'Couldn’t open that deck. In Google Slides, set Share, General access to “Anyone with the link”.'
      : 'That site doesn’t let other pages load its files. Download it and drop it here instead.');
    return;
  }
  const name = google ? 'Google Slides' : decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Linked file');
  const firstNew = state.slides.length;
  try {
    if (blob.type === 'application/pdf' || /\.pdf$/i.test(name)) await addPdf(blob, name);
    else if (blob.type.startsWith('image/')) addSlide(name, toSlideCanvas(await loadBitmap(blob)));
    else throw new Error('unsupported ' + blob.type);
  } catch (err) {
    console.warn(err);
    toast('That link isn’t a PDF, an image or a Google Slides deck.');
  }
  setBusy(false);
  if (state.slides.length > firstNew) {
    state.src = url;
    state.idx = Math.min(firstNew + slideIndex, state.slides.length - 1);
    showWork();
    writeHash();
  }
}

for (const [form, input] of [[el.linkForm, el.linkInput], [el.linkForm2, el.linkInput2]]) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    addLink(input.value);
    input.value = '';
  });
}

// The address bar mirrors the linked deck and the slide on show, so a Back Row
// link opens the same deck at the same slide.
function writeHash() {
  const p = new URLSearchParams();
  if (state.src) {
    p.set('src', state.src);
    if (state.idx) p.set('slide', String(state.idx + 1));
  }
  const h = p.toString();
  history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  el.copyLinkBtn.hidden = !state.src;
}

el.copyLinkBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Link copied. It opens this deck at this slide.');
  } catch {
    toast('Copy the address bar to share this deck.');
  }
});

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const src = p.get('src');
  if (src) addLink(src, Math.max(0, (Number(p.get('slide')) || 1) - 1));
}

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
  drawScene();
});

syncUI();
readHash();
