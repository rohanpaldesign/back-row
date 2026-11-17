// First-person view from a seat in a real lecture room: a 3D box with a raked
// floor, side walls, a ceiling with recessed lights, the screen on the front wall,
// and rows of seats with people in them. Drawn as a pinhole camera at the seat,
// turned to face the screen, whose focal length is the user's own viewing
// distance in screen pixels, so it is life size.

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
function chairBack(ctx, cx, top, bottom, s, look, wPx) {
  const w = wPx ?? CHAIR_W * s;
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
 * Draws the room into `canvas`. The camera sits at the chosen seat and turns to
 * face the screen, so a seat at the end of a row sees the screen at an angle:
 * narrower, with its near edge taller, and more of the far side wall.
 * @returns {{cssW:number, cssH:number, focusX:number, focusY:number, scaled:boolean, lifeRatio:number}}
 */
export function renderRoom({ canvas, slide, image, analysis, overlay, cfg, ppm, fit, viewW, viewH, colors }) {
  const D = cfg.distance;
  const Xv = cfg.offset;
  const rowsAhead = cfg.row;
  const screen = cfg.screen;
  const SW = screen.width;
  const SH = (SW * 9) / 16;
  const SC = screen.center - RAKE * rowsAhead; // mounted on the stage, which is lower than you
  const look = LOOK[cfg.lightId];
  const dark = cfg.lightId === 'dark';

  // Turn towards the centre of the screen.
  const Dc = Math.hypot(D, Xv);
  const cosY = D / Dc;
  const sinY = -Xv / Dc;

  const life = USER_DISTANCE * 1000 * ppm;
  let f = life;
  let scaled = false;
  if (fit) {
    // Natural view: about 70 degrees across, roughly what your eyes take in.
    const k = Math.min(1, viewW / 1.4 / f);
    if (k < 1) {
      f *= k;
      scaled = true;
    }
  }

  const sw = (f * SW * cosY) / Dc;
  const sh = (f * SH) / Dc;
  const roomPx = (f * ROOM_W) / Dc;
  const cssW = Math.ceil(Math.max(viewW, sw + 240, Math.min(roomPx * 1.2, viewW * 2.6)));
  const cssH = Math.ceil(Math.max(viewH, sh * 1.15 + 240));
  const scx = cssW / 2;
  const scy = Math.max(sh * 0.6 + 120, cssH * 0.32);
  const horizon = scy + (f * (SC - EYE_HEIGHT)) / Dc;

  // World (x across, h up, z towards the screen) to camera space.
  const cam = (x, h, z) => {
    const dx = x - Xv;
    return [dx * cosY - z * sinY, h - EYE_HEIGHT, dx * sinY + z * cosY];
  };
  const proj = ([cx, ch, cz]) => [scx + (f * cx) / cz, horizon - (f * ch) / cz];
  const depth = (x, z) => (x - Xv) * sinY + z * cosY;
  const P = (x, h, z) => {
    const c = cam(x, h, z);
    c[2] = Math.max(c[2], 0.05);
    return proj(c);
  };
  // A flat polygon in the room, clipped to what is in front of the camera.
  const NEARC = 0.08;
  const path3 = (pts) => {
    const cs = pts.map(([x, h, z]) => cam(x, h, z));
    const out = [];
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      const b = cs[(i + 1) % cs.length];
      const ina = a[2] >= NEARC;
      const inb = b[2] >= NEARC;
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = (NEARC - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEARC]);
      }
    }
    if (out.length < 3) return false;
    ctx.beginPath();
    out.map(proj).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    return true;
  };
  const poly3 = (pts, fill) => {
    if (!path3(pts)) return;
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const quad = (x0, h0, x1, h1, z, fill) => poly3([[x0, h1, z], [x1, h1, z], [x1, h0, z], [x0, h0, z]], fill);
  // The floor rises a step per row towards the viewer (and behind them); flat in front of the first row.
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
  const BACK = -10; // the walls run on behind the viewer
  const fD = floorAt(D);
  const zBend = Math.min(D, rowsAhead * ROW_GAP);

  // Ceiling.
  ctx.fillStyle = look.ceil;
  ctx.fillRect(0, 0, cssW, cssH);
  // Side walls.
  for (const x of [L, R]) {
    const [far] = P(x, EYE_HEIGHT, D);
    const g = ctx.createLinearGradient(far, 0, far < scx ? 0 : cssW, 0);
    g.addColorStop(0, look.sideFar);
    g.addColorStop(1, look.side);
    poly3([[x, CEIL, BACK], [x, CEIL, D], [x, fD, D], [x, floorAt(zBend), zBend], [x, floorAt(BACK), BACK]], g);
  }
  // Floor (carpet): the raked part and the flat part in front of the first row.
  {
    const g = ctx.createLinearGradient(0, P(0, fD, D)[1], 0, cssH);
    g.addColorStop(0, look.floor[0]);
    g.addColorStop(1, look.floor[1]);
    poly3([[L, floorAt(BACK), BACK], [R, floorAt(BACK), BACK], [R, floorAt(zBend), zBend], [L, floorAt(zBend), zBend]], g);
    poly3([[L, fD, zBend], [R, fD, zBend], [R, fD, D], [L, fD, D]], g);
  }
  // Ceiling lights (2x2 ft recessed panels).
  for (let z = D - 1.5; z > -4; z -= 3) {
    for (const x of [-7.5, -2.5, 2.5, 7.5]) {
      const dz = depth(x, z);
      if (dz < 0.4) continue;
      if (look.lampGlow) {
        const [gx, gy] = P(x, CEIL, z);
        const rad = (f * 0.9) / dz;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
        g.addColorStop(0, `rgba(255,252,240,${look.lampGlow * 0.5})`);
        g.addColorStop(1, 'rgba(255,252,240,0)');
        ctx.fillStyle = g;
        ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
      }
      poly3([[x - 0.3, CEIL, z + 0.3], [x + 0.3, CEIL, z + 0.3], [x + 0.3, CEIL, z - 0.3], [x - 0.3, CEIL, z - 0.3]], look.lamp);
    }
  }

  // Front wall.
  {
    const g = ctx.createLinearGradient(0, P(0, CEIL, D)[1], 0, P(0, fD, D)[1]);
    g.addColorStop(0, look.front[0]);
    g.addColorStop(1, look.front[1]);
    quad(L, fD, R, CEIL, D, g);
    // Wall panel seams, the skirting board and the corners.
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = Math.max(1, (f * 0.004) / Dc);
    ctx.beginPath();
    for (let x = L + 1.25; x < R; x += 1.25) {
      const a = P(x, CEIL, D);
      const b = P(x, fD, D);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    quad(L, fD, R, fD + 0.1, D, look.base);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of [[P(L, CEIL, D), P(L, fD, D)], [P(R, CEIL, D), P(R, fD, D)], [P(L, CEIL, D), P(R, CEIL, D)]]) {
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
  }

  // A door with an exit sign, front right.
  {
    const dx0 = R - 1.7;
    const dx1 = R - 0.7;
    if (path3([[dx0, fD + 2.1, D], [dx1, fD + 2.1, D], [dx1, fD, D], [dx0, fD, D]])) {
      ctx.fillStyle = lit('#8a7b6a', look.k);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = Math.max(1, (f * 0.03) / Dc);
      ctx.stroke();
    }
    quad(dx1 - 0.2, fD + 1.02, dx1 - 0.1, fD + 1.06, D, lit('#c9c4ba', Math.max(look.k, 0.4)));
    const ex0 = dx0 + 0.32;
    const ex1 = dx1 - 0.32;
    const [ecx, ecy] = P((ex0 + ex1) / 2, fD + 2.34, D);
    const ew = Math.abs(P(ex1, fD + 2.34, D)[0] - P(ex0, fD + 2.34, D)[0]);
    const eh = Math.abs(P((ex0 + ex1) / 2, fD + 2.26, D)[1] - P((ex0 + ex1) / 2, fD + 2.42, D)[1]);
    if (dark || cfg.lightId === 'dim') {
      const g = ctx.createRadialGradient(ecx, ecy, 0, ecx, ecy, ew * 1.4);
      g.addColorStop(0, 'rgba(40,200,110,0.35)');
      g.addColorStop(1, 'rgba(40,200,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ecx - ew * 1.5, ecy - ew * 1.5, ew * 3, ew * 3);
    }
    quad(ex0, fD + 2.26, ex1, fD + 2.42, D, '#1aa457');
    if (eh > 7 && ew > eh * 1.6) {
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.round(eh * 0.7)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('EXIT', ecx, ecy + 0.5, ew * 0.9);
    }
  }

  // Glow the screen throws on the wall.
  if (look.glow) {
    const g = ctx.createRadialGradient(scx, scy, sh * 0.2, scx, scy, Math.max(sw, sh) * 1.2);
    g.addColorStop(0, `rgba(185,200,255,${look.glow})`);
    g.addColorStop(1, 'rgba(185,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  // Screen.
  const sTop = SC + SH / 2;
  const sBot = SC - SH / 2;
  const tone = cfg.light[screen.kind];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = Math.max(6, sh * 0.05);
  ctx.shadowOffsetY = Math.max(2, sh * 0.015);
  if (screen.kind === 'tv') {
    const b = 0.012;
    quad(-SW / 2 - b, sBot - b, SW / 2 + b, sTop + b, D, '#060606');
  } else {
    // Pull-down screen: matte surface with a black border, hanging from a case.
    const b = 0.06;
    const surface = Math.round(235 * (dark ? 0.55 : cfg.lightId === 'dim' ? 0.75 : 0.92));
    quad(-SW / 2 - b, sBot - b, SW / 2 + b, sTop + b, D, `rgb(${surface},${surface},${surface - 3})`);
    ctx.shadowColor = 'transparent';
    quad(-SW / 2 - b * 1.6, sTop + b, SW / 2 + b * 1.6, sTop + b + 0.09, D, '#2b2b2e');
  }
  ctx.restore();
  quad(-SW / 2, sBot, SW / 2, sTop, D, `rgb(${tone.black},${tone.black},${tone.black})`);

  // The slide, letterboxed on the screen and drawn in thin vertical strips so it
  // takes the screen's perspective.
  const { W } = physical(cfg, slide.width, slide.height);
  const Hs = (W * slide.height) / slide.width;
  {
    const yt = SC + Hs / 2;
    const yb = SC - Hs / 2;
    const a = P(-W / 2, yt, D);
    const b = P(W / 2, yt, D);
    const pw = Math.abs(b[0] - a[0]);
    const ph = Math.max(P(-W / 2, yb, D)[1] - a[1], P(W / 2, yb, D)[1] - b[1]);
    const src = resample(image, Math.max(1, Math.round(pw * dpr)), Math.max(1, Math.round(ph * dpr)));
    const n = Math.abs(sinY) < 0.01 ? 1 : Math.max(1, Math.min(480, Math.ceil(pw / 1.5)));
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const t0 = P(-W / 2 + u0 * W, yt, D);
      const t1 = P(-W / 2 + u1 * W, yt, D);
      const b0 = P(-W / 2 + u0 * W, yb, D);
      const b1 = P(-W / 2 + u1 * W, yb, D);
      const top = (t0[1] + t1[1]) / 2;
      const bot = (b0[1] + b1[1]) / 2;
      ctx.drawImage(src, u0 * src.width, 0, Math.max(1, (u1 - u0) * src.width), src.height,
        t0[0], top, t1[0] - t0[0] + (n > 1 ? 0.6 : 0), bot - top);
    }
  }
  if (overlay && analysis) {
    const an = analysis;
    ctx.globalAlpha = 0.45;
    for (let cy = 0; cy < an.rows; cy++) {
      for (let cx = 0; cx < an.cols; cx++) {
        const t = an.grid[cy * an.cols + cx];
        if (!t) continue;
        const x0 = -W / 2 + (cx * an.cell * W) / an.w;
        const x1 = -W / 2 + (Math.min(an.w, (cx + 1) * an.cell) * W) / an.w;
        const h0 = SC + Hs / 2 - (cy * an.cell * Hs) / an.h;
        const h1 = SC + Hs / 2 - (Math.min(an.h, (cy + 1) * an.cell) * Hs) / an.h;
        quad(x0, h1, x1, h0, D, t === TOO_SMALL ? colors.small : colors.faint);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Lectern, front left of the screen, with the presenter's laptop.
  {
    const lx = -SW / 2 - 0.85;
    const zf = D - 0.95; // front face
    const zb = D - 0.45;
    const sideX = Xv > lx ? lx + 0.3 : lx - 0.3;
    poly3([[sideX, fD + 1.08, zf], [sideX, fD + 1.08, zb], [sideX, fD, zb], [sideX, fD, zf]], lit('#5b4433', look.k, 0.75));
    quad(lx - 0.3, fD, lx + 0.3, fD + 1.08, zf, lit('#7a5c45', look.k));
    poly3([[lx - 0.34, fD + 1.1, zf - 0.04], [lx + 0.34, fD + 1.1, zf - 0.04], [lx + 0.34, fD + 1.1, zb], [lx - 0.34, fD + 1.1, zb]], lit('#8d6c52', look.k, 1.1));
    quad(lx - 0.15, fD + 1.1, lx + 0.15, fD + 1.3, zf + 0.2, dark ? '#7f93c9' : '#2a2b30');
  }

  // Ceiling projector and its beam, visible in a dim or dark room.
  if (screen.kind === 'projector') {
    const zp = D - SW * 1.5;
    if (depth(0, zp) > 1.2) {
      const hp = CEIL - 0.32;
      if (look.beam) {
        const lens = P(0, hp, zp);
        const corners = [P(-SW / 2, sTop, D), P(SW / 2, sTop, D), P(SW / 2, sBot, D), P(-SW / 2, sBot, D)];
        const g = ctx.createLinearGradient(lens[0], lens[1], scx, scy);
        g.addColorStop(0, `rgba(220,230,255,${look.beam * 2.5})`);
        g.addColorStop(1, `rgba(220,230,255,${look.beam * 0.4})`);
        poly(ctx, [lens, ...corners], g);
      }
      const dz = depth(0, zp);
      const [mx, my] = P(0, CEIL, zp);
      const [, mh] = P(0, hp + 0.08, zp);
      ctx.fillStyle = lit('#9b9ba0', Math.max(look.k, 0.3));
      ctx.fillRect(mx - Math.max(1, (f * 0.02) / dz), my, Math.max(2, (f * 0.04) / dz), mh - my);
      poly3([[-0.2, hp + 0.08, zp - 0.15], [0.2, hp + 0.08, zp - 0.15], [0.2, hp - 0.08, zp - 0.15], [-0.2, hp - 0.08, zp - 0.15]], lit('#d7d7da', Math.max(look.k, 0.25)));
    }
  }

  // Rows, far to near: aisle step lights, then each person followed by the seat
  // back in front of them, far to near along the row (it is seen at an angle).
  const aisles = [AISLE_X[0], AISLE_X[1], seatOffset(0, 0) - 0.7, seatOffset(0, SEATS_PER_ROW - 1) + 0.7];
  for (let kRow = rowsAhead; kRow >= 1; kRow--) {
    const z = kRow * ROW_GAP;
    const seatRow = cfg.row - kRow;
    const fl = floorAt(z);
    if (!look.lampGlow || dark) {
      for (const ax of aisles) {
        const dz = depth(ax, z + 0.45);
        if (dz < 0.3) continue;
        const [px, py] = P(ax, fl + 0.05, z + 0.45);
        ctx.fillStyle = 'rgba(255,196,120,0.75)';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, (f * 0.025) / dz), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const seats = [];
    for (let col = 0; col < SEATS_PER_ROW; col++) {
      const x = seatOffset(seatRow, col);
      const dz = depth(x, z);
      if (dz < 0.45) continue;
      const s = f / dz;
      const [px] = P(x, fl, z);
      if (px < -0.6 * s || px > cssW + 0.6 * s) continue;
      seats.push({ col, x, dz, s });
    }
    seats.sort((p, q) => q.dz - p.dz);
    for (const { col, x, dz, s } of seats) {
      const blur = dz < 2.6 ? Math.min(5, s * 0.0016 * (2.6 - dz)) : 0;
      if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`;
      if (seatTaken(seatRow, col)) {
        const r = rng(seatRow * 131 + col * 17 + 7);
        let lean = (r() - 0.5) * 0.07;
        // People settle so you can see: the row just ahead leaves a gap for your
        // line of sight, and the head two rows ahead sits in it, just over the
        // bottom of the screen from the back of the room.
        const dx = x + lean - (Xv - (Xv * z) / D);
        if (kRow === 1 && Math.abs(dx) < 0.22) lean += Math.sign(dx || 1) * (0.22 - Math.abs(dx));
        const inLine = kRow === 2 && Math.abs(dx) < 0.3;
        if (inLine) lean -= dx * 0.9;
        const top = fl + HEAD_TOP + (r() - 0.5) * (inLine ? 0.02 : 0.08);
        const [hx, hy] = P(x + lean, top, z);
        person(ctx, hx, hy, P(x, fl, z)[1], s, r, look, dark);
      }
      const zc = z - 0.16;
      const left = P(x - CHAIR_W / 2, fl + CHAIR_TOP, zc);
      const right = P(x + CHAIR_W / 2, fl + CHAIR_TOP, zc);
      const [, cb] = P(x, fl, zc);
      chairBack(ctx, (left[0] + right[0]) / 2, (left[1] + right[1]) / 2, cb, f / depth(x, zc), look, Math.abs(right[0] - left[0]));
      ctx.filter = 'none';
    }
  }

  // Soft vignette.
  const v = ctx.createRadialGradient(scx, cssH * 0.45, Math.min(cssW, cssH) * 0.35, scx, cssH * 0.45, Math.max(cssW, cssH) * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.14)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, cssW, cssH);

  return { cssW, cssH, focusX: scx, focusY: scy + sh * 0.25, scaled, lifeRatio: life / f };
}
