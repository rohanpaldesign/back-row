// First-person view from a seat in a real lecture room: a 3D box with a raked
// floor, side walls, a ceiling with recessed lights, the screen on the front wall,
// and rows of seats with people in them. Drawn as a pinhole camera whose focal
// length is the user's own viewing distance in screen pixels, so it is life size.

import { EYE_HEIGHT, ROW_GAP, RAKE, SEATS_PER_ROW, USER_DISTANCE, AISLE_X, seatOffset, seatTaken } from './presets.js';
import { resample, physical } from './simulate.js';
import { TOO_SMALL } from './legibility.js';

const ROOM_W = 22; // metres, wall to wall: a theater
const CEIL = 6.5; // ceiling height above the viewer's floor
const NEAR = 0.35; // nearest depth drawn
const HEAD_TOP = 1.28; // top of a seated head above that row's floor
const CHAIR_TOP = 0.86; // top of a seat back above the floor
const CHAIR_W = 0.5;

const LOOK = {
  bright: {
    front: ['#ebe7e0', '#d8d2c8'], side: '#d6d0c6', sideFar: '#e2ddd5', ceil: '#f3f1ec', floor: ['#5f5a53', '#4a4640'],
    lamp: '#fffdf4', lampGlow: 0.5, k: 1, chair: '#2f3647', base: '#4b463f', glow: 0, beam: 0,
  },
  dim: {
    front: ['#6a6a6e', '#55555a'], side: '#4d4d52', sideFar: '#5b5b60', ceil: '#5e5e62', floor: ['#2e2c29', '#252321'],
    lamp: '#cfc9b8', lampGlow: 0.18, k: 0.58, chair: '#1d212c', base: '#2a2826', glow: 0.1, beam: 0.035,
  },
  dark: {
    front: ['#1b1b20', '#121216'], side: '#111114', sideFar: '#16161a', ceil: '#0f0f12', floor: ['#0b0b0c', '#080809'],
    lamp: '#1e1e22', lampGlow: 0, k: 0.16, chair: '#0b0c10', base: '#0d0d0e', glow: 0.22, beam: 0.06,
  },
};
const HAIR = ['#2a211b', '#3b2a20', '#151515', '#5b4232', '#8d7a66', '#c9c2b8', '#4a3a2f', '#1f1a17', '#6e4b2f', '#a5714a'];
const SKIN = ['#e9c4a6', '#c99a76', '#8d5e3c', '#5c3a24', '#f1d3bd', '#a8774f', '#d8ad8b'];
const SHIRT = ['#3d4a5c', '#5a4a42', '#2f3a33', '#6b6f76', '#8a5a44', '#24324a', '#7a7f87', '#9a8f7f', '#4b3b5a', '#b9b3a8', '#2b2b30', '#6f2f2f', '#d9d4ca', '#355e5a'];

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

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Scale a colour by k (room light), with a little blue in the dark from the screen.
function lit(hex, k, mul = 1) {
  const [r, g, b] = rgb(hex);
  const m = k * mul;
  const cool = k < 0.3 ? 1.25 : 1;
  return `rgb(${Math.round(r * m)},${Math.round(g * m)},${Math.min(255, Math.round(b * m * cool))})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function poly(ctx, pts, fill) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// One seated person seen from behind. `s` is pixels per metre at their depth.
function person(ctx, cx, top, bottom, s, r, look, dark) {
  const k = look.k;
  const hw = (0.148 + r() * 0.022) * s;
  const hh = (0.2 + r() * 0.025) * s;
  const tilt = (r() - 0.5) * 0.16;
  const shW = (0.39 + r() * 0.09) * s;
  const hairC = pick(HAIR, r);
  const skinC = pick(SKIN, r);
  const shirtC = pick(SHIRT, r);
  const style = r();
  const hood = r() < 0.12;
  const headCy = top + hh / 2;
  const neckBottom = top + hh * 1.08;
  const shY = neckBottom + 0.035 * s;

  // Torso and arms.
  const torso = ctx.createLinearGradient(0, shY, 0, shY + 0.5 * s);
  torso.addColorStop(0, lit(shirtC, k, 1.08));
  torso.addColorStop(1, lit(shirtC, k, 0.82));
  ctx.fillStyle = torso;
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.34, neckBottom - 0.02 * s);
  ctx.quadraticCurveTo(cx - shW * 0.3, shY - 0.012 * s, cx - shW / 2, shY + 0.03 * s);
  ctx.quadraticCurveTo(cx - shW / 2 - 0.03 * s, shY + 0.1 * s, cx - shW / 2 - 0.02 * s, bottom);
  ctx.lineTo(cx + shW / 2 + 0.02 * s, bottom);
  ctx.quadraticCurveTo(cx + shW / 2 + 0.03 * s, shY + 0.1 * s, cx + shW / 2, shY + 0.03 * s);
  ctx.quadraticCurveTo(cx + shW * 0.3, shY - 0.012 * s, cx + hw * 0.34, neckBottom - 0.02 * s);
  ctx.closePath();
  ctx.fill();
  // Arm creases.
  ctx.strokeStyle = `rgba(0,0,0,${0.18 * Math.max(k, 0.4)})`;
  ctx.lineWidth = Math.max(0.6, 0.004 * s);
  ctx.beginPath();
  ctx.moveTo(cx - shW * 0.36, shY + 0.09 * s);
  ctx.lineTo(cx - shW * 0.37, bottom);
  ctx.moveTo(cx + shW * 0.36, shY + 0.09 * s);
  ctx.lineTo(cx + shW * 0.37, bottom);
  ctx.stroke();

  // Neck in the shadow of the head.
  ctx.fillStyle = lit(skinC, k, 0.78);
  ctx.fillRect(cx - hw * 0.3, headCy, hw * 0.6, neckBottom - headCy + 0.01 * s);
  // Collar or hood.
  ctx.fillStyle = lit(shirtC, k, hood ? 0.92 : 0.7);
  ctx.beginPath();
  if (hood) ctx.ellipse(cx, neckBottom + 0.005 * s, hw * 0.62, 0.05 * s, 0, Math.PI, 0);
  else ctx.ellipse(cx, neckBottom, hw * 0.36, 0.014 * s, 0, Math.PI, 0);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, headCy);
  ctx.rotate(tilt);
  // Ears.
  ctx.fillStyle = lit(skinC, k, 0.9);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * hw * 0.49, hh * 0.04, 0.017 * s, 0.031 * s, sx * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head.
  ctx.fillStyle = lit(skinC, k);
  ctx.beginPath();
  ctx.ellipse(0, 0, hw / 2, hh / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair.
  const hairFill = ctx.createLinearGradient(0, -hh / 2, 0, hh / 2);
  hairFill.addColorStop(0, lit(hairC, k, 1.12));
  hairFill.addColorStop(1, lit(hairC, k, 0.8));
  ctx.fillStyle = hairFill;
  const cap = (bottomY) => {
    ctx.beginPath();
    ctx.moveTo(-hw * 0.53, bottomY - hh * 0.08);
    ctx.ellipse(0, -hh * 0.02, hw * 0.53, hh * 0.52, 0, Math.PI, 0);
    ctx.lineTo(hw * 0.53, bottomY - hh * 0.08);
    ctx.quadraticCurveTo(0, bottomY + hh * 0.12, -hw * 0.53, bottomY - hh * 0.08);
    ctx.fill();
  };
  if (style < 0.36) {
    cap(hh * 0.28); // short
  } else if (style < 0.6) {
    // Long hair falling past the shoulders.
    ctx.beginPath();
    ctx.ellipse(0, -hh * 0.03, hw * 0.56, hh * 0.53, 0, Math.PI, 0);
    ctx.bezierCurveTo(hw * 0.62, hh * 0.3, hw * 0.66, hh * 0.85, hw * 0.5, hh * 1.25);
    ctx.quadraticCurveTo(0, hh * 1.36, -hw * 0.5, hh * 1.25);
    ctx.bezierCurveTo(-hw * 0.66, hh * 0.85, -hw * 0.62, hh * 0.3, -hw * 0.56, -hh * 0.03);
    ctx.fill();
  } else if (style < 0.72) {
    // Tied back: a bun or a ponytail.
    cap(hh * 0.36);
    ctx.beginPath();
    if (r() < 0.5) ctx.arc(0, -hh * 0.3, 0.042 * s, 0, Math.PI * 2);
    else ctx.ellipse(0, hh * 0.52, 0.03 * s, 0.09 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (style < 0.86) {
    // Very short or thinning.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, hw / 2, hh / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.6;
    cap(hh * 0.22);
    ctx.restore();
  } else {
    // Curly volume.
    ctx.beginPath();
    ctx.ellipse(0, -hh * 0.06, hw * 0.66, hh * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Light from the ceiling (or the screen's rim light in the dark).
  if (dark) {
    ctx.strokeStyle = 'rgba(170,190,255,0.28)';
    ctx.lineWidth = Math.max(0.8, 0.005 * s);
    ctx.beginPath();
    ctx.ellipse(0, -hh * 0.02, hw * 0.54, hh * 0.53, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  } else {
    const hl = ctx.createRadialGradient(-hw * 0.08, -hh * 0.4, 0, -hw * 0.08, -hh * 0.4, hw * 0.55);
    hl.addColorStop(0, `rgba(255,255,255,${0.2 * k})`);
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.ellipse(0, -hh * 0.02, hw * 0.5, hh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (dark) {
    ctx.strokeStyle = 'rgba(170,190,255,0.16)';
    ctx.lineWidth = Math.max(0.8, 0.004 * s);
    ctx.beginPath();
    ctx.moveTo(cx - shW / 2, shY + 0.03 * s);
    ctx.quadraticCurveTo(cx - shW * 0.3, shY - 0.012 * s, cx - hw * 0.34, neckBottom - 0.02 * s);
    ctx.moveTo(cx + shW / 2, shY + 0.03 * s);
    ctx.quadraticCurveTo(cx + shW * 0.3, shY - 0.012 * s, cx + hw * 0.34, neckBottom - 0.02 * s);
    ctx.stroke();
  }
}

// The back of an upholstered seat, seen from behind.
function chairBack(ctx, cx, top, bottom, s, look) {
  const w = CHAIR_W * s;
  const g = ctx.createLinearGradient(0, top, 0, top + 0.5 * s);
  g.addColorStop(0, lit(look.chair, 1, 1.35));
  g.addColorStop(0.12, lit(look.chair, 1, 1.05));
  g.addColorStop(1, lit(look.chair, 1, 0.72));
  ctx.fillStyle = g;
  roundRect(ctx, cx - w / 2, top, w, bottom - top + 2, [w * 0.16, w * 0.16, 0, 0]);
  ctx.fill();
  // Seam where the back panel meets the cushion.
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = Math.max(0.6, 0.004 * s);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, top + 0.07 * s);
  ctx.lineTo(cx + w * 0.42, top + 0.07 * s);
  ctx.stroke();
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
  const look = LOOK[cfg.lightId];
  const dark = cfg.lightId === 'dark';

  const life = USER_DISTANCE * 1000 * ppm;
  let f = life;
  let scaled = false;
  if (fit) {
    // Overview: show the whole front of the room.
    const k = Math.min(1, (viewW * 0.92) / ((f * ROOM_W) / D), (viewH * 0.5) / ((f * (CEIL + 0.5)) / D));
    if (k < 1) {
      f *= k;
      scaled = true;
    }
  }

  const sw = (f * SW) / D;
  const sh = (f * SH) / D;
  const roomPx = (f * ROOM_W) / D;
  const cssW = Math.ceil(Math.max(viewW, sw + 240, Math.min(roomPx * 1.2, viewW * 2.6)));
  const cssH = Math.ceil(Math.max(viewH, sh + 240));
  const scx = cssW / 2;
  const scy = Math.max(sh / 2 + 120, cssH * 0.32);
  const horizon = scy + (f * (screen.center - EYE_HEIGHT)) / D;
  const originX = scx + (f * Xv) / D;
  const X = (x, z) => originX + (f * (x - Xv)) / z;
  const Y = (h, z) => horizon - (f * (h - EYE_HEIGHT)) / z;
  const P = (x, h, z) => [X(x, z), Y(h, z)];
  // The floor rises a step per row towards the viewer; flat in front of the first row.
  const floorAt = (z) => -RAKE * Math.min(z / ROW_GAP, rowsAhead);

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cssW * cssH * dpr * dpr > 16e6) dpr = Math.sqrt(16e6 / (cssW * cssH));
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const L = -ROOM_W / 2;
  const R = ROOM_W / 2;
  const fD = floorAt(D);
  const zBend = Math.min(D, rowsAhead * ROW_GAP);

  // Ceiling.
  ctx.fillStyle = look.ceil;
  ctx.fillRect(0, 0, cssW, cssH);
  // Side walls.
  for (const [x, ex] of [[L, 0], [R, cssW]]) {
    const pts = [P(x, CEIL, D), P(x, CEIL, NEAR), P(x, floorAt(NEAR), NEAR)];
    if (zBend > NEAR) pts.push(P(x, floorAt(zBend), zBend));
    pts.push(P(x, fD, D));
    const g = ctx.createLinearGradient(X(x, D), 0, ex, 0);
    g.addColorStop(0, look.sideFar);
    g.addColorStop(1, look.side);
    poly(ctx, pts, g);
  }
  // Floor (carpet).
  {
    const pts = [P(L, fD, D), P(R, fD, D)];
    if (zBend > NEAR) pts.push(P(R, floorAt(zBend), zBend));
    pts.push(P(R, floorAt(NEAR), NEAR), P(L, floorAt(NEAR), NEAR));
    if (zBend > NEAR) pts.push(P(L, floorAt(zBend), zBend));
    const g = ctx.createLinearGradient(0, Y(fD, D), 0, cssH);
    g.addColorStop(0, look.floor[0]);
    g.addColorStop(1, look.floor[1]);
    poly(ctx, pts, g);
  }
  // Ceiling lights (2x2 ft recessed panels).
  for (let z = D - 1.5; z > 0.9; z -= 3) {
    for (const x of [-7.5, -2.5, 2.5, 7.5]) {
      const q = [P(x - 0.3, CEIL, z + 0.3), P(x + 0.3, CEIL, z + 0.3), P(x + 0.3, CEIL, z - 0.3), P(x - 0.3, CEIL, z - 0.3)];
      if (look.lampGlow) {
        const [gx, gy] = P(x, CEIL, z);
        const rad = (f * 0.9) / z;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
        g.addColorStop(0, `rgba(255,252,240,${look.lampGlow * 0.5})`);
        g.addColorStop(1, 'rgba(255,252,240,0)');
        ctx.fillStyle = g;
        ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
      }
      poly(ctx, q, look.lamp);
    }
  }

  // Front wall.
  const [fx0, fy0] = P(L, CEIL, D);
  const [fx1, fy1] = P(R, fD, D);
  const fw = ctx.createLinearGradient(0, fy0, 0, fy1);
  fw.addColorStop(0, look.front[0]);
  fw.addColorStop(1, look.front[1]);
  ctx.fillStyle = fw;
  ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  // Wall panel seams and the skirting board.
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let x = L + 1.25; x < R; x += 1.25) {
    const [px] = P(x, 0, D);
    ctx.fillRect(px, fy0, Math.max(1, f * 0.004 / D), fy1 - fy0);
  }
  const [, skirt] = P(0, fD + 0.1, D);
  ctx.fillStyle = look.base;
  ctx.fillRect(fx0, skirt, fx1 - fx0, fy1 - skirt);
  // Corners where the walls meet.
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(fx0 - 1, fy0, 2, fy1 - fy0);
  ctx.fillRect(fx1 - 1, fy0, 2, fy1 - fy0);
  ctx.fillRect(fx0, fy0 - 1, fx1 - fx0, 2);

  // A door with an exit sign, front right.
  {
    const dx0 = R - 1.7;
    const dx1 = R - 0.7;
    const [ax, ay] = P(dx0, fD + 2.1, D);
    const [bx, by] = P(dx1, fD, D);
    ctx.fillStyle = lit('#8a7b6a', look.k);
    ctx.fillRect(ax, ay, bx - ax, by - ay);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = Math.max(1, (f * 0.03) / D);
    ctx.strokeRect(ax, ay, bx - ax, by - ay);
    ctx.fillStyle = lit('#c9c4ba', Math.max(look.k, 0.4));
    ctx.fillRect(bx - (bx - ax) * 0.18, ay + (by - ay) * 0.5, (bx - ax) * 0.1, Math.max(1, (f * 0.02) / D));
    const [ex, ey] = P(dx0 + 0.32, fD + 2.42, D);
    const [ex1, ey1] = P(dx1 - 0.32, fD + 2.26, D);
    if (dark || cfg.lightId === 'dim') {
      const g = ctx.createRadialGradient((ex + ex1) / 2, (ey + ey1) / 2, 0, (ex + ex1) / 2, (ey + ey1) / 2, (ex1 - ex) * 1.4);
      g.addColorStop(0, 'rgba(40,200,110,0.35)');
      g.addColorStop(1, 'rgba(40,200,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ex - (ex1 - ex), ey - (ex1 - ex), (ex1 - ex) * 3, (ex1 - ex) * 3);
    }
    ctx.fillStyle = '#1aa457';
    ctx.fillRect(ex, ey, ex1 - ex, ey1 - ey);
    if (ey1 - ey > 7) {
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.round((ey1 - ey) * 0.7)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('EXIT', (ex + ex1) / 2, (ey + ey1) / 2 + 0.5);
    }
  }

  // Glow the screen throws on the wall.
  const sx0 = scx - sw / 2;
  const sy0 = scy - sh / 2;
  if (look.glow) {
    const g = ctx.createRadialGradient(scx, scy, sh * 0.2, scx, scy, Math.max(sw, sh) * 1.2);
    g.addColorStop(0, `rgba(185,200,255,${look.glow})`);
    g.addColorStop(1, 'rgba(185,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  // Screen.
  const tone = cfg.light[screen.kind];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = Math.max(6, sh * 0.05);
  ctx.shadowOffsetY = Math.max(2, sh * 0.015);
  if (screen.kind === 'tv') {
    const b = Math.max(2, (f * 0.012) / D);
    ctx.fillStyle = '#060606';
    roundRect(ctx, sx0 - b, sy0 - b, sw + 2 * b, sh + 2 * b, b * 1.4);
    ctx.fill();
  } else {
    // Pull-down screen: matte surface with a black border, hanging from a case.
    const b = Math.max(3, (f * 0.06) / D);
    const surface = Math.round(235 * (dark ? 0.55 : cfg.lightId === 'dim' ? 0.75 : 0.92));
    ctx.fillStyle = `rgb(${surface},${surface},${surface - 3})`;
    ctx.fillRect(sx0 - b, sy0 - b, sw + 2 * b, sh + 2 * b);
    ctx.shadowColor = 'transparent';
    const caseH = Math.max(4, (f * 0.09) / D);
    ctx.fillStyle = '#2b2b2e';
    roundRect(ctx, sx0 - b * 1.6, sy0 - b - caseH, sw + 3.2 * b, caseH, caseH / 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = `rgb(${tone.black},${tone.black},${tone.black})`;
  ctx.fillRect(sx0, sy0, sw, sh);

  // The slide, letterboxed on the screen.
  const { W } = physical(cfg, slide.width, slide.height);
  const rw = (f * W) / D;
  const rh = (rw * slide.height) / slide.width;
  const rx = scx - rw / 2;
  const ry = scy - rh / 2;
  ctx.drawImage(resample(image, Math.max(1, Math.round(rw * dpr)), Math.max(1, Math.round(rh * dpr))), rx, ry, rw, rh);
  if (overlay && analysis) {
    const a = analysis;
    const kx = rw / a.w;
    const ky = rh / a.h;
    ctx.globalAlpha = 0.45;
    for (let cy = 0; cy < a.rows; cy++) {
      for (let cx = 0; cx < a.cols; cx++) {
        const t = a.grid[cy * a.cols + cx];
        if (!t) continue;
        ctx.fillStyle = t === TOO_SMALL ? colors.small : colors.faint;
        const x0 = rx + cx * a.cell * kx;
        const y0 = ry + cy * a.cell * ky;
        ctx.fillRect(x0, y0, rx + Math.min(a.w, (cx + 1) * a.cell) * kx - x0, ry + Math.min(a.h, (cy + 1) * a.cell) * ky - y0);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Lectern, front left of the screen, with the presenter's laptop.
  {
    const lx = -SW / 2 - 0.85;
    const lz = D - 0.7;
    const [ax, ay] = P(lx - 0.3, fD + 1.08, lz);
    const [bx, by] = P(lx + 0.3, fD, lz);
    const g = ctx.createLinearGradient(ax, 0, bx, 0);
    g.addColorStop(0, lit('#5b4433', look.k, 0.85));
    g.addColorStop(1, lit('#7a5c45', look.k));
    ctx.fillStyle = g;
    ctx.fillRect(ax, ay, bx - ax, by - ay);
    const [tx, ty] = P(lx - 0.34, fD + 1.12, lz);
    ctx.fillStyle = lit('#8d6c52', look.k, 1.1);
    ctx.fillRect(tx, ty, (bx - ax) * 1.13, ay - ty + 1);
    const [qx, qy] = P(lx - 0.15, fD + 1.32, lz + 0.1);
    const [qx1, qy1] = P(lx + 0.15, fD + 1.12, lz + 0.1);
    ctx.fillStyle = dark ? '#7f93c9' : '#2a2b30';
    ctx.fillRect(qx, qy, qx1 - qx, qy1 - qy);
  }

  // Ceiling projector and its beam, visible in a dim or dark room.
  if (screen.kind === 'projector') {
    const zp = D - SW * 1.5;
    if (zp > 1.2) {
      const hp = CEIL - 0.32;
      if (look.beam) {
        const [lxp, lyp] = P(0, hp, zp);
        const g = ctx.createLinearGradient(lxp, lyp, scx, scy);
        g.addColorStop(0, `rgba(220,230,255,${look.beam * 2.5})`);
        g.addColorStop(1, `rgba(220,230,255,${look.beam * 0.4})`);
        poly(ctx, [[lxp, lyp], [sx0, sy0], [sx0 + sw, sy0], [sx0 + sw, sy0 + sh], [sx0, sy0 + sh]], g);
      }
      const [mx, my] = P(0, CEIL, zp);
      const [, mh] = P(0, hp + 0.08, zp);
      ctx.fillStyle = lit('#9b9ba0', Math.max(look.k, 0.3));
      ctx.fillRect(mx - Math.max(1, (f * 0.02) / zp), my, Math.max(2, (f * 0.04) / zp), mh - my);
      const [bx0, by0] = P(-0.2, hp + 0.08, zp);
      const [bx1, by1] = P(0.2, hp - 0.08, zp);
      ctx.fillStyle = lit('#d7d7da', Math.max(look.k, 0.25));
      roundRect(ctx, bx0, by0, bx1 - bx0, by1 - by0, (f * 0.02) / zp);
      ctx.fill();
    }
  }

  // Rows, far to near: aisle step lights, the people, then the seat backs in front of them.
  const aisles = [AISLE_X[0], AISLE_X[1], seatOffset(0, 0) - 0.7, seatOffset(0, SEATS_PER_ROW - 1) + 0.7];
  for (let kRow = rowsAhead; kRow >= 1; kRow--) {
    const z = kRow * ROW_GAP;
    const seatRow = cfg.row - kRow;
    const fl = floorAt(z);
    const s = f / z;
    const blur = z < 2.6 ? Math.min(5, s * 0.0016 * (2.6 - z)) : 0;
    if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`;
    if (!look.lampGlow || dark) {
      for (const ax of aisles) {
        const [px, py] = P(ax, fl + 0.05, z + 0.45);
        ctx.fillStyle = 'rgba(255,196,120,0.75)';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, (f * 0.025) / (z + 0.45)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const seats = [];
    for (let col = 0; col < SEATS_PER_ROW; col++) {
      const x = seatOffset(seatRow, col);
      const px = X(x, z);
      if (px < -0.6 * s || px > cssW + 0.6 * s) continue;
      seats.push({ col, x });
    }
    for (const { col, x } of seats) {
      if (!seatTaken(seatRow, col)) continue;
      const r = rng(seatRow * 131 + col * 17 + 7);
      const lean = (r() - 0.5) * 0.07;
      const top = fl + HEAD_TOP + (r() - 0.5) * 0.11;
      person(ctx, X(x + lean, z), Y(top, z), Y(fl, z), s, r, look, dark);
    }
    const zc = z - 0.16;
    for (const { x } of seats) chairBack(ctx, X(x, zc), Y(fl + CHAIR_TOP, zc), Y(fl, zc), f / zc, look);
    ctx.filter = 'none';
  }

  // Soft vignette.
  const v = ctx.createRadialGradient(scx, cssH * 0.45, Math.min(cssW, cssH) * 0.35, scx, cssH * 0.45, Math.max(cssW, cssH) * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.14)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, cssW, cssH);

  return { cssW, cssH, focusX: scx, focusY: scy + sh * 0.25, scaled, lifeRatio: life / f };
}
