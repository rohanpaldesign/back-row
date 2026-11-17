// Finds where the audience loses detail, and the smallest font size that still reads.

import { resample, physical, makeCanvas } from './simulate.js';
import { CAP_ARCMIN } from './presets.js';

const RAD_PER_ARCMIN = Math.PI / 180 / 60;
const WORK_WIDTH = 1200;

// Cell status values in the analysis grid.
export const OK = 0;
export const TOO_SMALL = 1;
export const TOO_FAINT = 2;

function luminance(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0, p = 0; p < L.length; i += 4, p++) {
    L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  }
  return L;
}

// What the viewer's eye resolves: a Gaussian blur half an eye pixel wide.
// (A blur changes smoothly with distance; squeezing to the eye's resolution
// and back flickers as resize steps change.)
const BLUR_PER_EYE_PX = 0.5;
const SMALL_RATIO = 0.44;

function perceive(img, eyeWidth, w, h) {
  const base = resample(img, w, h);
  const sigma = (BLUR_PER_EYE_PX * w) / eyeWidth;
  if (sigma < 0.25) return base;
  const out = makeCanvas(w, h);
  const x = out.getContext('2d');
  if (!('filter' in x)) {
    // Older browsers without canvas filters: squeeze and stretch instead.
    const small = resample(img, eyeWidth, (eyeWidth * img.height) / img.width);
    return resample(small, w, h);
  }
  x.drawImage(base, 0, 0);
  x.filter = `blur(${sigma.toFixed(2)}px)`;
  x.drawImage(base, 0, 0);
  x.filter = 'none';
  return out;
}

// Joins areas on the same line of text (up to 5 cells apart across, touching
// up and down) so a line counts once.
export function mergeNear(list) {
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < list.length && !merged; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i];
        const q = list[j];
        if (q.x0 <= p.x1 + 5 && p.x0 <= q.x1 + 5 && q.y0 <= p.y1 && p.y0 <= q.y1) {
          p.x0 = Math.min(p.x0, q.x0);
          p.y0 = Math.min(p.y0, q.y0);
          p.x1 = Math.max(p.x1, q.x1);
          p.y1 = Math.max(p.y1, q.y1);
          p.cells += q.cells;
          list.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
  return list;
}

// Counts problem areas, treating cells up to two apart as one area so a line of
// text counts once rather than once per gap between words.
export function findRegions(grid, cols, rows, type) {
  const seen = new Uint8Array(grid.length);
  const regions = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== type || seen[i]) continue;
    const box = { type, x0: cols, y0: rows, x1: 0, y1: 0, cells: 0 };
    regions.push(box);
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % cols;
      const y = (j / cols) | 0;
      box.cells++;
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x + 1);
      box.y1 = Math.max(box.y1, y + 1);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const k = ny * cols + nx;
          if (grid[k] === type && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
    }
  }
  return regions;
}

// Cells that belong to a picture (emoji, coloured icons, photos) rather than
// text, so their fine detail isn't reported as unreadable text. A picture core
// is a cell with solid colour (fills thicker than text strokes) that doesn't
// fill the whole cell (so not a coloured background or banner), and is shaded
// or irregular (so not a flat chart bar). Colourful cells up to two cells
// around a core (an emoji's edges, confetti) join it.
const CHROMA = 40;
function pictureCells(canvas, w, h) {
  const cell = Math.max(8, Math.round(w / 48));
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const col = new Uint8Array(w * h);
  const lum = new Float32Array(w * h);
  for (let p = 0, i = 0; p < col.length; p++, i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]);
    const mn = Math.min(d[i], d[i + 1], d[i + 2]);
    col[p] = mx - mn > CHROMA ? 1 : 0;
    lum[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  }
  const R = 3;
  const solidAt = (x, y) => x >= R && y >= R && x < w - R && y < h - R &&
    col[y * w + x] && col[y * w + x - R] && col[y * w + x + R] && col[(y - R) * w + x] && col[(y + R) * w + x];
  const frac = new Float32Array(cols * rows);
  const core = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * cell;
      const y0 = cy * cell;
      const x1 = Math.min(w, x0 + cell);
      const y1 = Math.min(h, y0 + cell);
      let n = 0;
      let c = 0;
      let solid = 0;
      let sum = 0;
      let sum2 = 0;
      let bx0 = 1e9;
      let bx1 = -1;
      let by0 = 1e9;
      let by1 = -1;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          n++;
          const p = y * w + x;
          if (!col[p]) continue;
          c++;
          sum += lum[p];
          sum2 += lum[p] * lum[p];
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
          if (solidAt(x, y)) solid++;
        }
      }
      const k = cy * cols + cx;
      frac[k] = c / n;
      if (c < 5 || solid < n * 0.12) continue;
      const partial = bx0 > x0 || by0 > y0 || bx1 < x1 - 1 || by1 < y1 - 1;
      if (!partial) continue;
      const shaded = Math.sqrt(Math.max(0, sum2 / c - (sum / c) ** 2)) > 14;
      const irregular = c < (bx1 - bx0 + 1) * (by1 - by0 + 1) * 0.85;
      if (shaded || irregular) core[k] = 1;
    }
  }
  const dist = new Int8Array(cols * rows).fill(-1);
  const queue = [];
  for (let k = 0; k < core.length; k++) if (core[k]) { dist[k] = 0; queue.push(k); }
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    if (dist[k] >= 2) continue;
    const x = k % cols;
    const y = (k / cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (dist[j] < 0 && frac[j] >= 0.03) {
          dist[j] = dist[k] + 1;
          queue.push(j);
        }
      }
    }
  }
  return (cx, cy) => dist[cy * cols + cx] >= 0;
}

/**
 * Compares the slide with what the audience perceives, cell by cell.
 * Detail is measured as total variation (sum of luminance steps). Blur keeps
 * that total for large shapes but loses it where strokes are too fine to resolve,
 * which is exactly what makes text unreadable.
 */
// The slide as the audience takes it in: their eye's blur on top of the washout
// or compression, at w px wide. Used for the "What they see" close-up.
export function perceivedImage(src, sim, w) {
  const width = Math.round(Math.min(w, src.width));
  const h = Math.max(1, Math.round((width * src.height) / src.width));
  const eyeWidth = Math.max(8, sim.theta / RAD_PER_ARCMIN / sim.eye);
  return perceive(sim.degraded, eyeWidth, width, h);
}

export function analyze(src, sim) {
  const w = Math.min(WORK_WIDTH, src.width);
  const h = Math.max(1, Math.round((w * src.height) / src.width));
  const eyeWidth = Math.max(8, sim.theta / RAD_PER_ARCMIN / sim.eye);

  const base = resample(src, w, h);
  const R = luminance(base);
  const picture = pictureCells(base, w, h);
  const S = luminance(perceive(sim.sizeOnly, eyeWidth, w, h));
  const F = sim.sizeOnly === sim.degraded ? S : luminance(perceive(sim.degraded, eyeWidth, w, h));

  const cell = Math.max(8, Math.round(w / 48));
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const grid = new Uint8Array(cols * rows);

  for (let cy = 0; cy < rows; cy++) {
    const y0 = cy * cell;
    const y1 = Math.min(h, y0 + cell);
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * cell;
      const x1 = Math.min(w, x0 + cell);
      let tvR = 0;
      let tvS = 0;
      let minR = 255;
      let maxR = 0;
      let minF = 255;
      let maxF = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) {
          const i = row + x;
          const r = R[i];
          const f = F[i];
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (f < minF) minF = f;
          if (f > maxF) maxF = f;
          if (x + 1 < w) {
            tvR += Math.abs(R[i + 1] - r);
            tvS += Math.abs(S[i + 1] - S[i]);
          }
          if (y + 1 < h) {
            tvR += Math.abs(R[i + w] - r);
            tvS += Math.abs(S[i + w] - S[i]);
          }
        }
      }
      const area = (x1 - x0) * (y1 - y0);
      const hasDetail = tvR / area > 6 && maxR - minR > 24;
      if (!hasDetail) continue;
      const k = cy * cols + cx;
      if (picture(cx, cy)) continue; // emoji, icons, photos: not text
      if (tvS / tvR < SMALL_RATIO) grid[k] = TOO_SMALL;
      else if (maxF - minF < 45) grid[k] = TOO_FAINT;
    }
  }

  return {
    w,
    h,
    cell,
    cols,
    rows,
    grid,
    // Problem areas as boxes in grid cells, biggest first.
    areas: [...mergeNear(findRegions(grid, cols, rows, TOO_SMALL)), ...mergeNear(findRegions(grid, cols, rows, TOO_FAINT))].sort((p, q) => q.cells - p.cells),
    get small() { return this.areas.filter((r) => r.type === TOO_SMALL).length; },
    get faint() { return this.areas.filter((r) => r.type === TOO_FAINT).length; },
  };
}

// Smallest font size (in the slide's own pixels) whose capitals cover CAP_ARCMIN for this viewer.
// Cap height is taken as 0.7 of the font size.
export function minReadable(srcW, srcH, c) {
  const { W, D } = physical(c, srcW, srcH);
  const cap = CAP_ARCMIN * RAD_PER_ARCMIN;
  if (c.mode === 'room') {
    return Math.ceil((cap * c.light.factor * D * srcW) / (0.7 * W));
  }
  const byAngle = (cap * D * srcW) / (0.7 * W);
  // Compressed video needs about 10px text at the received resolution.
  const s = Math.min(1, c.recv.w / srcW, c.recv.h / srcH);
  const byResolution = 10 / s;
  return Math.ceil(Math.max(byAngle, byResolution));
}
