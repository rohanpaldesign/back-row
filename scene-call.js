// A device (laptop, monitor or phone) running a generic video-call window, drawn
// life size. The shared screen is a canvas placed exactly where `stageBox` says,
// so the verdict and the picture agree. No third-party logos or brand assets.

import { USER_DISTANCE, stageBox } from './presets.js';
import { resample, physical } from './simulate.js';
import { TOO_SMALL } from './legibility.js';
import { icon } from './icons.js';

const PEOPLE = [
  ['Priya', '#ffb3c7', '#b77bff'],
  ['Marcus', '#8fd8ff', '#4c79ff'],
  ['Ana', '#ffd59a', '#ff8a5c'],
  ['Kenji', '#a8f0c8', '#36b38a'],
  ['Sofia', '#d9ccff', '#8a74ff'],
  ['Dev', '#ffe39a', '#eaa43a'],
];

const BEZEL = { laptop: 0.022, monitor: 0.012, phone: 0.045 };

const pct = (v) => `${(v * 100).toFixed(3)}%`;

function tile([name, a, b], i, active) {
  const initials = name.slice(0, 2).toUpperCase();
  return `<div class="c-tile${active ? ' is-active' : ''}">
    <div class="c-av" style="background:linear-gradient(135deg,${a},${b})">${initials}</div>
    <span class="c-name">${i === 0 ? `${name} (Host)` : name}</span>
  </div>`;
}

function btn(name, label, cls = '') {
  return `<span class="c-btn ${cls}">${icon(name, 22)}${label ? `<em>${label}</em>` : ''}</span>`;
}

function zoomDesktop(box, layout) {
  const tiles = layout === 'side' ? PEOPLE : PEOPLE.slice(0, 5);
  return `
    <div class="c-top" style="height:${pct(box.top)}">
      <span class="c-title">${icon('shield', 14)} Weekly review</span>
      <span class="c-spacer"></span>
      <span class="c-time">24:10</span>
      <span class="c-view">${icon('grid', 14)} View</span>
    </div>
    ${box.strip ? `<div class="c-strip" style="top:${pct(box.strip.y)};height:${pct(box.strip.h)}">${tiles.map((p, i) => tile(p, i, i === 1)).join('')}</div>` : ''}
    ${box.side ? `<div class="c-side" style="left:${pct(box.side.x)};top:${pct(box.side.y)};width:${pct(box.side.w)};height:${pct(box.side.h)}">${tiles.map((p, i) => tile(p, i, i === 1)).join('')}</div>` : ''}
    <div class="c-bottom" style="height:${pct(box.bottom)}">
      <div class="c-group">${btn('mic', 'Mute')}${btn('cam', 'Stop Video')}</div>
      <div class="c-group">${btn('people', 'Participants')}${btn('chat', 'Chat')}${btn('share', 'Share', 'is-green')}${btn('react', 'React')}${btn('more', 'More')}</div>
      <div class="c-group"><span class="c-leave">Leave</span></div>
    </div>`;
}

function teamsDesktop(box, layout) {
  const tiles = layout === 'side' ? PEOPLE : PEOPLE.slice(0, 5);
  return `
    <div class="c-top" style="height:${pct(box.top)}">
      <span class="c-time">24:10</span>
      <span class="c-title">Weekly review</span>
      <span class="c-spacer"></span>
      ${btn('chat', 'Chat')}${btn('people', 'People')}${btn('hand', 'Raise')}${btn('react', 'React')}${btn('grid', 'View')}${btn('more', 'More')}
      <span class="c-sep"></span>
      ${btn('cam', 'Camera')}${btn('mic', 'Mic')}${btn('share', 'Share')}
      <span class="c-leave">${icon('hangup', 18)} Leave</span>
    </div>
    ${box.strip ? `<div class="c-strip" style="top:${pct(box.strip.y)};height:${pct(box.strip.h)}">${tiles.map((p, i) => tile(p, i, i === 1)).join('')}</div>` : ''}
    ${box.side ? `<div class="c-side" style="left:${pct(box.side.x)};top:${pct(box.side.y)};width:${pct(box.side.w)};height:${pct(box.side.h)}">${tiles.map((p, i) => tile(p, i, i === 1)).join('')}</div>` : ''}`;
}

function zoomPhone(box) {
  return `
    <div class="c-top" style="height:${pct(box.top)}">
      ${icon('speaker', 20)}<span class="c-title">Weekly review</span><span class="c-spacer"></span><span class="c-leave">Leave</span>
    </div>
    <div class="c-bottom" style="height:${pct(box.bottom)}">
      ${btn('mic', 'Mute')}${btn('cam', 'Video')}${btn('share', 'Share', 'is-green')}${btn('people', 'People')}${btn('more', 'More')}
    </div>`;
}

function teamsPhone(box) {
  return `
    <div class="c-top" style="height:${pct(box.top)}">
      <span class="c-time">24:10</span><span class="c-spacer"></span>${icon('people', 20)}${icon('more', 20)}
    </div>
    <div class="c-bottom" style="height:${pct(box.bottom)}">
      ${btn('cam', '')}${btn('mic', '')}${btn('speaker', '')}${btn('more', '')}<span class="c-hang">${icon('hangup', 24)}</span>
    </div>`;
}

/**
 * Builds the device and call window inside `host`, then paints the shared screen.
 * @returns {{cssW:number, cssH:number, focusX:number, focusY:number, scaled:boolean, lifeRatio:number}}
 */
export function renderCall({ host, slide, image, analysis, overlay, cfg, ppm, fit, viewW, viewH, colors }) {
  const dev = cfg.device;
  const app = cfg.app.id;
  const box = stageBox(app, dev.id, cfg.layout.id);
  const phone = dev.id === 'phone';
  const bezel = BEZEL[dev.id];

  const life = USER_DISTANCE * (dev.width / dev.distance) * 1000 * ppm;
  let devW = life;
  const frameW = (w) => w * (1 + 2 * bezel) * (dev.id === 'laptop' ? 1.14 : 1);
  const frameH = (w) => (w * dev.height) / dev.width + 2 * bezel * w + (dev.id === 'laptop' ? w * 0.045 : dev.id === 'monitor' ? w * 0.16 : 0);
  let scaled = false;
  if (fit) {
    const k = Math.min(1, (viewW - 64) / frameW(devW), (viewH - 64) / frameH(devW));
    if (k < 1) {
      devW *= k;
      scaled = true;
    }
  }
  const devH = (devW * dev.height) / dev.width;
  const u = devW / dev.cssWidth;
  const cssW = Math.ceil(Math.max(viewW, frameW(devW) + 96));
  const cssH = Math.ceil(Math.max(viewH, frameH(devW) + 96));

  const chrome = phone ? (app === 'zoom' ? zoomPhone(box) : teamsPhone(box)) : app === 'zoom' ? zoomDesktop(box, cfg.layout.id) : teamsDesktop(box, cfg.layout.id);
  const pill = app === 'zoom' ? 'You are viewing the shared screen' : 'Priya is presenting';

  host.style.width = `${cssW}px`;
  host.style.height = `${cssH}px`;
  host.innerHTML = `
    <div class="dev dev-${dev.id}" style="--bz:${(bezel * devW).toFixed(2)}px">
      <div class="dev-screen" style="width:${devW.toFixed(2)}px;height:${devH.toFixed(2)}px">
        <div class="call call-${app} ${phone ? 'is-phone' : ''}" style="--u:${u.toFixed(4)}px">
          ${chrome}
          <div class="c-stage" style="left:${pct(box.x)};top:${pct(box.y)};width:${pct(box.w)};height:${pct(box.h)}">
            <canvas></canvas>
            <span class="c-pill">${pill}</span>
          </div>
        </div>
      </div>
      ${dev.id === 'laptop' ? '<div class="dev-base"></div>' : ''}
      ${dev.id === 'monitor' ? '<div class="dev-neck"></div><div class="dev-foot"></div>' : ''}
    </div>`;

  // Paint the shared screen: slide letterboxed inside the stage.
  const stageW = devW * box.w;
  const stageH = devH * box.h;
  const { W } = physical(cfg, slide.width, slide.height);
  const sScale = devW / dev.width; // css px per metre on the device
  const rw = W * sScale;
  const rh = (rw * slide.height) / slide.width;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (stageW * stageH * dpr * dpr > 16e6) dpr = Math.sqrt(16e6 / (stageW * stageH));
  const canvas = host.querySelector('.c-stage canvas');
  canvas.width = Math.round(stageW * dpr);
  canvas.height = Math.round(stageH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = app === 'zoom' ? '#000000' : '#141414';
  ctx.fillRect(0, 0, stageW, stageH);
  const rx = (stageW - rw) / 2;
  const ry = (stageH - rh) / 2;
  ctx.drawImage(resample(image, Math.max(1, Math.round(rw * dpr)), Math.max(1, Math.round(rh * dpr))), rx, ry, rw, rh);
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
        ctx.fillRect(x0, y0, rx + Math.min(a.w, (cx + 1) * a.cell) * sx - x0, ry + Math.min(a.h, (cy + 1) * a.cell) * sy - y0);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Centre of the stage, for the initial pan position.
  const devLeft = (cssW - frameW(devW)) / 2 + bezel * devW;
  const devTop = (cssH - frameH(devW)) / 2 + bezel * devW;
  return {
    cssW,
    cssH,
    focusX: devLeft + (box.x + box.w / 2) * devW,
    focusY: devTop + (box.y + box.h / 2) * devH,
    scaled,
    lifeRatio: life / devW,
  };
}
