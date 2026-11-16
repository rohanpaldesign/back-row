// A built-in test slide: text at known sizes, thin lines and a low-contrast caption.

import { makeCanvas } from './simulate.js';

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export function drawSample() {
  const c = makeCanvas(1920, 1080);
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 1920, 1080);

  x.fillStyle = '#111111';
  x.textBaseline = 'alphabetic';
  x.font = `700 72px ${FONT}`;
  x.fillText('Q3 roadmap review', 120, 170);

  const rows = [48, 36, 24, 18, 12];
  let y = 290;
  for (const size of rows) {
    x.fillStyle = '#111111';
    x.font = `500 ${size}px ${FONT}`;
    x.fillText(`${size}px  Ship the new onboarding flow`, 120, y);
    y += size * 1.9 + 24;
  }

  x.fillStyle = '#c4c4c4';
  x.font = `400 30px ${FONT}`;
  x.fillText('Light grey caption on white', 120, 930);

  // Bar chart with hairline gridlines and small axis labels.
  const left = 1180;
  const bottom = 860;
  const chartW = 620;
  const chartH = 520;
  x.strokeStyle = '#d0d0d0';
  x.lineWidth = 1;
  x.fillStyle = '#555555';
  x.font = `400 14px ${FONT}`;
  for (let i = 0; i <= 5; i++) {
    const gy = bottom - (chartH * i) / 5 + 0.5;
    x.beginPath();
    x.moveTo(left, gy);
    x.lineTo(left + chartW, gy);
    x.stroke();
    x.fillText(`${i * 20}`, left - 40, gy + 5);
  }
  const bars = [0.42, 0.58, 0.71, 0.9];
  const labels = ['Jul', 'Aug', 'Sep', 'Oct'];
  const bw = 96;
  bars.forEach((v, i) => {
    const bx = left + 40 + i * 150;
    x.fillStyle = i === 3 ? '#2f6bff' : '#9db7ff';
    x.fillRect(bx, bottom - chartH * v, bw, chartH * v);
    x.fillStyle = '#555555';
    x.fillText(labels[i], bx + 32, bottom + 26);
  });
  x.fillStyle = '#111111';
  x.font = `600 28px ${FONT}`;
  x.fillText('Weekly active teams', left, bottom - chartH - 30);

  x.fillStyle = '#8a8a8a';
  x.font = `400 16px ${FONT}`;
  x.fillText('Source: internal analytics, October 2026', 120, 1010);

  return c;
}
