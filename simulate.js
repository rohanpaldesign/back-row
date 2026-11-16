// Turns a slide into what the audience actually gets: washed out by the room,
// or downscaled and compressed by the call. Pure canvas work, nothing leaves the device.

import { EYE_ARCMIN_PER_PX } from './presets.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(canvas, read = false) {
  return canvas.getContext('2d', read ? { willReadFrequently: true } : undefined);
}

// High-quality resize. Downscales in halving steps so small targets don't alias.
export function resample(src, w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let cur = src;
  let cw = src.width;
  let ch = src.height;
  while (cw >= w * 2 && ch >= h * 2) {
    const nw = Math.floor(cw / 2);
    const nh = Math.floor(ch / 2);
    const next = makeCanvas(nw, nh);
    const x = ctx2d(next);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, nw, nh);
    cur = next;
    cw = nw;
    ch = nh;
  }
  const out = makeCanvas(w, h);
  const x = ctx2d(out);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, w, h);
  return out;
}

// The physical width the slide fills (it may be letterboxed) and the viewing distance.
export function physical(c, w, h) {
  const aspect = w / h;
  if (c.mode === 'room') {
    const sw = c.screen.width;
    const sh = (sw * 9) / 16;
    return { W: Math.min(sw, sh * aspect), D: c.distance };
  }
  const { width: vw, height: vh, distance } = c.viewer;
  return { W: Math.min(vw, vh * aspect), D: distance };
}

export function viewAngle(W, D) {
  return 2 * Math.atan(W / (2 * D));
}

function copy(src) {
  const c = makeCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

function blurred(src, radius) {
  if (radius < 0.3) return src;
  const c = copy(src);
  const x = ctx2d(c);
  if (!('filter' in x)) return src;
  x.filter = `blur(${radius.toFixed(2)}px)`;
  x.drawImage(src, 0, 0);
  x.filter = 'none';
  return c;
}

// Projector or TV in a lit room: blacks lift, whites dim, colours fade.
function washout(src, black, white) {
  const c = copy(src);
  const x = ctx2d(c, true);
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const span = (white - black) / 255;
  const sat = 1 - (0.6 * black) / 255;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    d[i] = black + (l + (r - l) * sat) * span;
    d[i + 1] = black + (l + (g - l) * sat) * span;
    d[i + 2] = black + (l + (b - l) * sat) * span;
  }
  x.putImageData(img, 0, 0);
  return c;
}

async function jpegRoundTrip(src, quality) {
  const blob = await new Promise((resolve) => src.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return copy(src);
  const bmp = await createImageBitmap(blob);
  const c = makeCanvas(bmp.width, bmp.height);
  ctx2d(c).drawImage(bmp, 0, 0);
  if (bmp.close) bmp.close();
  return c;
}

/**
 * @returns {Promise<{degraded: HTMLCanvasElement, sizeOnly: HTMLCanvasElement, theta: number, eye: number}>}
 *   degraded: everything the audience gets (washout or compression).
 *   sizeOnly: the same without contrast loss, used to tell "too small" from "too faint".
 *   theta: the slide's width as a viewing angle, in radians.
 *   eye: arcminutes per resolvable eye pixel for this viewer.
 */
export async function simulate(src, c) {
  const { W, D } = physical(c, src.width, src.height);
  const theta = viewAngle(W, D);

  if (c.mode === 'room') {
    const focus = c.screen.kind === 'projector' ? (src.width / 1920) * 0.8 : 0;
    const sizeOnly = blurred(src, focus);
    const tone = c.light[c.screen.kind];
    const degraded = washout(sizeOnly, tone.black, tone.white);
    return { degraded, sizeOnly, theta, eye: EYE_ARCMIN_PER_PX * c.light.factor };
  }

  const s = Math.min(1, c.recv.w / src.width, c.recv.h / src.height);
  const received = s < 1 ? resample(src, src.width * s, src.height * s) : copy(src);
  const degraded = await jpegRoundTrip(received, c.recv.q);
  return { degraded, sizeOnly: degraded, theta, eye: EYE_ARCMIN_PER_PX };
}
