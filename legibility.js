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

// Counts problem areas, treating cells up to two apart as one area so a line of
// text counts once rather than once per gap between words.
function countRegions(grid, cols, rows, type) {
  const seen = new Uint8Array(grid.length);
  let regions = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== type || seen[i]) continue;
    regions++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % cols;
      const y = (j / cols) | 0;
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

/**
 * Compares the slide with what the audience perceives, cell by cell.
 * Detail is measured as total variation (sum of luminance steps). Blur keeps
 * that total for large shapes but loses it where strokes are too fine to resolve,
 * which is exactly what makes text unreadable.
 */
export function analyze(src, sim) {
  const w = Math.min(WORK_WIDTH, src.width);
  const h = Math.max(1, Math.round((w * src.height) / src.width));
  const eyeWidth = Math.max(8, sim.theta / RAD_PER_ARCMIN / sim.eye);

  const R = luminance(resample(src, w, h));
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
    small: countRegions(grid, cols, rows, TOO_SMALL),
    faint: countRegions(grid, cols, rows, TOO_FAINT),
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
