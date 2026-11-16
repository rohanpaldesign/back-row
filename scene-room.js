// First-person view from a seat: back wall, the screen with the simulated slide,
// and rows of people in front. Drawn as a pinhole camera whose focal length is the
// user's own viewing distance in screen pixels, so everything is life size.

import { EYE_HEIGHT, ROW_GAP, RAKE, SEATS_PER_ROW, USER_DISTANCE, seatOffset, seatTaken } from './presets.js';
import { resample, physical } from './simulate.js';
import { TOO_SMALL } from './legibility.js';

const ROOM = {
  dark: { wall: ['#1a1a1f', '#0c0c0f'], floor: '#08080a', ceil: '#111114', glow: 0.2 },
  dim: { wall: ['#55565d', '#3d3e44'], floor: '#2a2a2e', ceil: '#626369', glow: 0.09 },
  bright: { wall: ['#efebe4', '#dcd6cc'], floor: '#b7afa2', ceil: '#f7f5f1', glow: 0 },
};
const HAIR = ['#2a211b', '#3b2a20', '#151515', '#5b4232', '#8d7a66', '#c9c2b8', '#4a3a2f', '#1f1a17', '#6e4b2f'];
const SKIN = ['#e9c4a6', '#c99a76', '#8d5e3c', '#5c3a24', '#f1d3bd', '#a8774f'];
const SHIRT = ['#3d4a5c', '#5a4a42', '#2f3a33', '#6b6f76', '#8a5a44', '#24324a', '#7a7f87', '#9a8f7f', '#4b3b5a', '#b9b3a8', '#2b2b30'];

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// One seated person seen from behind. `s` is pixels per metre at their depth.
function person(ctx, cx, top, s, r, light, bottom) {
  const headW = 0.165 * s;
  const headH = 0.22 * s;
  const shoulderW = (0.42 + r() * 0.08) * s;
  const shoulderTop = top + headH * 0.95;
  const longHair = r() < 0.35;
  const dark = light === 'dark';
  const k = light === 'dim' ? 0.55 : 1;
  const hair = dark ? '#0b0b0d' : shade(pick(HAIR, r), k);
  const skin = dark ? '#0d0d0f' : shade(pick(SKIN, r), k);
  const shirt = dark ? '#0a0a0c' : shade(pick(SHIRT, r), k);

  ctx.fillStyle = shirt;
  roundRect(ctx, cx - shoulderW / 2, shoulderTop, shoulderW, bottom - shoulderTop + 4, shoulderW * 0.32);
  ctx.fill();

  ctx.fillStyle = skin;
  ctx.fillRect(cx - headW * 0.27, top + headH * 0.7, headW * 0.54, headH * 0.4);
  ctx.beginPath();
  ctx.ellipse(cx, top + headH / 2, headW / 2, headH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(cx, top + headH * 0.45, headW * 0.52, headH * 0.47, 0, 0, Math.PI * 2);
  ctx.fill();
  if (longHair) {
    roundRect(ctx, cx - headW * 0.5, top + headH * 0.45, headW, headH * 0.95, [0, 0, headW * 0.3, headW * 0.3]);
    ctx.fill();
  }

  if (dark) {
    // Faint rim light from the screen.
    ctx.strokeStyle = 'rgba(190,205,255,0.22)';
    ctx.lineWidth = Math.max(1, s * 0.006);
    ctx.beginPath();
    ctx.ellipse(cx, top + headH * 0.45, headW * 0.52, headH * 0.47, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
}

/**
 * Draws the room into `canvas`.
 * @returns {{cssW:number, cssH:number, focusX:number, focusY:number, scaled:boolean, lifeRatio:number}}
 */
export function renderRoom({ canvas, slide, image, analysis, overlay, cfg, ppm, fit, viewW, viewH, colors }) {
  const D = cfg.distance;
  const Xv = cfg.offset;
  const rowsAhead = cfg.row;
  const screen = cfg.screen;
  const SW = screen.width;
  const SH = (SW * 9) / 16;

  const life = USER_DISTANCE * 1000 * ppm;
  let f = life;
  let scaled = false;
  if (fit) {
    const k = Math.min(1, (viewW * 0.8) / ((f * SW) / D), (viewH * 0.6) / ((f * SH) / D));
    if (k < 1) {
      f *= k;
      scaled = true;
    }
  }

  const sw = (f * SW) / D;
  const sh = (f * SH) / D;
  const cssW = Math.ceil(Math.max(viewW, sw + 240));
  const cssH = Math.ceil(Math.max(viewH, sh + 220));
  const scx = cssW / 2;
  // Screen in the upper third, leaving room below for the people in front.
  const scy = Math.max(sh / 2 + 110, cssH * 0.3);
  const horizon = scy + (f * (screen.center - EYE_HEIGHT)) / D;
  const originX = scx + (f * Xv) / D;
  const X = (x, z) => originX + (f * (x - Xv)) / z;
  const Y = (h, z) => horizon - (f * (h - EYE_HEIGHT)) / z;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cssW * cssH * dpr * dpr > 16e6) dpr = Math.sqrt(16e6 / (cssW * cssH));
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const room = ROOM[cfg.lightId];
  const tone = cfg.light[screen.kind];

  // Back wall, ceiling and floor.
  const wall = ctx.createLinearGradient(0, 0, 0, cssH);
  wall.addColorStop(0, room.wall[0]);
  wall.addColorStop(1, room.wall[1]);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, cssW, cssH);
  const yCeil = Y(3.2, D);
  if (yCeil > 0) {
    ctx.fillStyle = room.ceil;
    ctx.fillRect(0, 0, cssW, yCeil);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, yCeil - 1, cssW, 2);
  }
  const yFloor = Y(-RAKE * rowsAhead, D);
  if (yFloor < cssH) {
    ctx.fillStyle = room.floor;
    ctx.fillRect(0, yFloor, cssW, cssH - yFloor);
  }
  if (room.glow) {
    const g = ctx.createRadialGradient(scx, scy, sh * 0.2, scx, scy, Math.max(sw, sh) * 1.1);
    g.addColorStop(0, `rgba(175,195,255,${room.glow})`);
    g.addColorStop(1, 'rgba(175,195,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  // Screen.
  const sx0 = scx - sw / 2;
  const sy0 = scy - sh / 2;
  const black = `rgb(${tone.black},${tone.black},${tone.black})`;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.max(6, sh * 0.06);
  ctx.shadowOffsetY = Math.max(2, sh * 0.02);
  if (screen.kind === 'tv') {
    const b = Math.max(2, (f * 0.012) / D);
    ctx.fillStyle = '#060606';
    roundRect(ctx, sx0 - b, sy0 - b, sw + 2 * b, sh + 2 * b, b * 1.4);
    ctx.fill();
  } else {
    // Pull-down screen: matte surface with a margin, hanging from a dark case.
    const b = Math.max(3, (f * 0.06) / D);
    const lift = cfg.lightId === 'dark' ? 0.55 : cfg.lightId === 'dim' ? 0.75 : 0.92;
    const surface = Math.round(235 * lift);
    ctx.fillStyle = `rgb(${surface},${surface},${surface - 3})`;
    ctx.fillRect(sx0 - b, sy0 - b, sw + 2 * b, sh + 2 * b);
    ctx.shadowColor = 'transparent';
    const caseH = Math.max(4, (f * 0.09) / D);
    ctx.fillStyle = '#2b2b2e';
    roundRect(ctx, sx0 - b * 1.6, sy0 - b - caseH, sw + 3.2 * b, caseH, caseH / 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = black;
  ctx.fillRect(sx0, sy0, sw, sh);

  // The slide, letterboxed on the screen.
  const { W } = physical(cfg, slide.width, slide.height);
  const rw = (f * W) / D;
  const rh = (rw * slide.height) / slide.width;
  const rx = scx - rw / 2;
  const ry = scy - rh / 2;
  const pw = Math.max(1, Math.round(rw * dpr));
  const ph = Math.max(1, Math.round(rh * dpr));
  ctx.drawImage(resample(image, pw, ph), rx, ry, rw, rh);

  if (overlay && analysis) {
    const a = analysis;
    const sx = rw / a.w;
    const sy = rh / a.h;
    ctx.globalAlpha = 0.45;
    for (let cy = 0; cy < a.rows; cy++) {
      for (let cx = 0; cx < a.cols; cx++) {
        const t = a.grid[cy * a.cols + cx];
        if (!t) continue;
        ctx.fillStyle = t === TOO_SMALL ? colors.small : colors.faint;
        const x0 = rx + cx * a.cell * sx;
        const y0 = ry + cy * a.cell * sy;
        const x1 = rx + Math.min(a.w, (cx + 1) * a.cell) * sx;
        const y1 = ry + Math.min(a.h, (cy + 1) * a.cell) * sy;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    ctx.globalAlpha = 1;
  }

  // People, from the front row back towards the viewer.
  for (let k = rowsAhead; k >= 1; k--) {
    const z = k * ROW_GAP;
    const seatRow = cfg.row - k;
    const floor = -RAKE * k;
    for (let col = 0; col < SEATS_PER_ROW + 2; col++) {
      // Two extra seats past each end keep the room from feeling cut off.
      const c = col - 1;
      if (!seatTaken(seatRow, c, cfg.crowd)) continue;
      const r = rng(seatRow * 131 + c * 17 + 7);
      r();
      const x = seatOffset(seatRow, c) + (r() - 0.5) * 0.08;
      const top = floor + 1.3 + (r() - 0.5) * 0.09;
      const px = X(x, z);
      const s = f / z;
      if (px < -0.5 * s || px > cssW + 0.5 * s) continue;
      person(ctx, px, Y(top, z), s, r, cfg.lightId, cssH);
    }
  }

  // Soft vignette.
  const v = ctx.createRadialGradient(cssW / 2, cssH * 0.45, Math.min(cssW, cssH) * 0.35, cssW / 2, cssH * 0.45, Math.max(cssW, cssH) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, cfg.lightId === 'bright' ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.4)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, cssW, cssH);

  return { cssW, cssH, focusX: scx, focusY: scy + sh * 0.2, scaled, lifeRatio: life / f };
}
