// Inline SVG icons (24px grid, stroked with currentColor).

const P = {
  room: '<rect x="3" y="3.5" width="18" height="11" rx="1.5"/><circle cx="7" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>',
  call: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5 21 7.5v9l-5.5-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sample: '<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z"/><path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>',
  theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  left: '<path d="M14.5 6 8.5 12l6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  cam: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5 21 7.5v9l-5.5-3"/>',
  share: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 14V8.5M9.2 11.2 12 8.4l2.8 2.8M8 21h8"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.3 14.1c2.8.4 4.7 2.8 4.7 5.9"/>',
  chat: '<path d="M4 5h16v11H9.5L4 20z"/>',
  react: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.3c.9 1.2 2.1 1.9 3.5 1.9s2.6-.7 3.5-1.9"/><path d="M9 9.6h.01M15 9.6h.01" stroke-width="2.6"/>',
  hand: '<path d="M8 12.5V6.2a1.5 1.5 0 0 1 3 0V11M11 10.5V4.7a1.5 1.5 0 0 1 3 0v5.8M14 10.5V6.2a1.5 1.5 0 0 1 3 0V14c0 3.9-2.6 6.5-6 6.5-2.7 0-4.4-1.6-5.7-4L3.4 12a1.5 1.5 0 0 1 2.6-1.4L8 13"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  hangup: '<path d="M3 14.5c5-4.4 13-4.4 18 0l-2.4 2.6-3.6-1.4v-2.6c-2-.7-4-.7-6 0v2.6l-3.6 1.4z" fill="currentColor"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2 19h20"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z"/>',
};

export function icon(name, size = 20, extra = '') {
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[name] || ''}</svg>`;
}
