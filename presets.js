// Physical presets. All lengths are in metres.

const INCH = 0.0254;
const width169 = (diagonalInches) => (diagonalInches * INCH * 16) / Math.hypot(16, 9);

// `center`: height of the screen's centre above the stage floor (the front of the room).
export const SCREENS = [
  { id: 'tv55', label: '55"', sub: 'TV', kind: 'tv', width: width169(55), center: 2.29 },
  { id: 'tv85', label: '85"', sub: 'TV', kind: 'tv', width: width169(85), center: 2.38 },
  { id: 'proj100', label: '100"', sub: 'Projector', kind: 'projector', width: width169(100), center: 2.47 },
  { id: 'proj150', label: '150"', sub: 'Projector', kind: 'projector', width: width169(150), center: 2.63 },
  { id: 'proj200', label: '200"', sub: 'Projector', kind: 'projector', width: width169(200), center: 2.75 },
  { id: 'proj240', label: '240"', sub: 'Theater', kind: 'projector', width: width169(240), center: 2.84 },
];

// The room: a theater of 30 rows, 28 seats a row in three blocks (7 | 14 | 7)
// split by two aisles, tiered so heads further forward sit lower.
export const ROWS = 30;
export const SEATS_PER_ROW = 28;
export const BLOCKS = [7, 14, 7];
export const AISLE = 1.0; // extra width of each aisle
export const FIRST_ROW = 3; // metres from the screen to the front row
export const ROW_GAP = 0.9;
export const SEAT_GAP = 0.55;
export const RAKE = 0.12; // each row sits this much higher: from the back, heads just cover the bottom of the screen
export const EYE_HEIGHT = 1.2; // seated eye height

// The room is nearly full. Occupancy is fixed per seat, so the seat map and the
// heads drawn in the scene always agree.
const CROWD_FILL = 0.9;
function seatHash(row, col) {
  let h = Math.imul(row + 101, 0x2c1b3c6d) ^ Math.imul(col + 37, 0x297a2d39);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
export const seatTaken = (row, col) => seatHash(row, col) < CROWD_FILL;

export const seatDistance = (row) => FIRST_ROW + row * ROW_GAP;
// Rows are staggered a quarter seat left and right so heads don't line up.
export const seatBlock = (col) => (col < BLOCKS[0] ? 0 : col < BLOCKS[0] + BLOCKS[1] ? 1 : 2);
const seatX = (col) => (col - (SEATS_PER_ROW - 1) / 2) * SEAT_GAP + (seatBlock(col) - 1) * AISLE;
export const seatOffset = (row, col) => seatX(col) + (row % 2 ? 0.12 : -0.12);
// Centre lines of the two aisles.
export const AISLE_X = [(seatX(BLOCKS[0] - 1) + seatX(BLOCKS[0])) / 2, (seatX(BLOCKS[0] + BLOCKS[1] - 1) + seatX(BLOCKS[0] + BLOCKS[1])) / 2];

// How the room light washes the picture out: pure black and pure white on the
// slide land on these levels (0-255). `factor` raises the size a viewer needs
// to read text, because lower contrast makes small text harder to read.
export const LIGHTS = {
  dark: { label: 'Dark', sub: 'Lights off', factor: 1.0, tv: { black: 8, white: 250 }, projector: { black: 15, white: 250 } },
  dim: { label: 'Dim', sub: 'Half lights', factor: 1.15, tv: { black: 25, white: 248 }, projector: { black: 45, white: 245 } },
  bright: { label: 'Bright', sub: 'Lights on', factor: 1.35, tv: { black: 55, white: 245 }, projector: { black: 100, white: 235 } },
};

// What a call viewer receives, and the JPEG quality used to approximate
// video compression at that resolution.
export const RECEIVED = [
  { id: '1080', label: '1080p', w: 1920, h: 1080, q: 0.72 },
  { id: '720', label: '720p', w: 1280, h: 720, q: 0.5 },
  { id: '480', label: '480p', w: 854, h: 480, q: 0.36 },
];

// Where the call is watched. `cssWidth` is the device's own CSS width, used to
// size the call window's text and buttons the way the app would.
export const DEVICES = [
  { id: 'laptop', label: 'Laptop', sub: '13 inch', width: 0.286, height: 0.179, distance: 0.55, cssWidth: 1440 },
  { id: 'monitor', label: 'Monitor', sub: '24 inch', width: 0.531, height: 0.299, distance: 0.65, cssWidth: 1920 },
  { id: 'phone', label: 'Phone', sub: 'Upright', width: 0.068, height: 0.147, distance: 0.35, cssWidth: 390 },
];

export const APPS = [
  { id: 'zoom', label: 'Zoom-style' },
  { id: 'teams', label: 'Teams-style' },
];

export const LAYOUTS = [
  { id: 'speaker', label: 'Speaker' },
  { id: 'side', label: 'Side-by-side' },
];

// Call window chrome as fractions of the device screen. The CSS lays the window
// out from these same numbers, so the verdict matches what is drawn.
const CHROME = {
  desktop: { zoom: { top: 0.045, bottom: 0.085 }, teams: { top: 0.075, bottom: 0 } },
  phone: { zoom: { top: 0.085, bottom: 0.1 }, teams: { top: 0.09, bottom: 0.11 } },
};
const STRIP = 0.15; // participant strip height (Speaker view)
const SIDE = 0.27; // participant panel width (Side-by-side view)

export function stageBox(appId, deviceId, layoutId) {
  const phone = deviceId === 'phone';
  const ch = CHROME[phone ? 'phone' : 'desktop'][appId];
  const box = { top: ch.top, bottom: ch.bottom, x: 0, y: ch.top, w: 1, h: 1 - ch.top - ch.bottom, strip: null, side: null };
  if (phone) return box;
  if (layoutId === 'speaker') {
    if (appId === 'zoom') {
      box.strip = { y: ch.top, h: STRIP };
      box.y += STRIP;
    } else {
      box.strip = { y: 1 - ch.bottom - STRIP, h: STRIP };
    }
    box.h -= STRIP;
  } else {
    box.side = { x: 1 - SIDE, w: SIDE, y: ch.top, h: 1 - ch.top - ch.bottom };
    box.w = 1 - SIDE;
  }
  return box;
}

// The pixel scale of a screenshot: 2x for Retina and other high-DPI screens.
export const SCALES = [
  { id: 'auto', label: 'Auto' },
  { id: '1', label: '1x' },
  { id: '2', label: '2x' },
];

// Assumed distance between the user and their own screen, used to draw scenes life size.
export const USER_DISTANCE = 0.6;

// ID-1 card (credit card): 85.6 x 53.98 mm. Calibration matches its short side.
export const CARD_SHORT_MM = 53.98;
export const CARD_LONG_MM = 85.6;

// CSS pixels per millimetre when the screen hasn't been calibrated (a typical laptop).
export const DEFAULT_PX_PER_MM = 4.2;

// A capital letter must cover this many arcminutes to read comfortably.
export const CAP_ARCMIN = 10;

// Arcminutes per "eye pixel" used to simulate what the viewer can resolve.
export const EYE_ARCMIN_PER_PX = 1.8;

// Typical UI text size (CSS px) for the call zoom suggestion.
export const UI_TEXT_PX = 14;

export const MAX_SLIDE_WIDTH = 2400;
export const MAX_SLIDES = 100;
