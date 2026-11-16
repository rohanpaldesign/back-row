// Physical presets. All lengths are in metres.

const INCH = 0.0254;
const width169 = (diagonalInches) => (diagonalInches * INCH * 16) / Math.hypot(16, 9);

export const SCREENS = [
  { id: 'tv55', label: '55" TV', kind: 'tv', width: width169(55) },
  { id: 'tv85', label: '85" TV', kind: 'tv', width: width169(85) },
  { id: 'proj100', label: '100" projector', kind: 'projector', width: width169(100) },
  { id: 'proj150', label: '150" projector', kind: 'projector', width: width169(150) },
];

export const SEATS = [
  { id: 'front', label: 'Front', distance: 2 },
  { id: 'middle', label: 'Middle', distance: 5 },
  { id: 'back', label: 'Back', distance: 9 },
];

// How the room light washes the picture out: pure black and pure white on the
// slide land on these levels (0-255). `factor` raises the size a viewer needs
// to read text, because lower contrast makes small text harder to read.
export const LIGHTS = {
  dark: { label: 'Dark', factor: 1.0, tv: { black: 8, white: 250 }, projector: { black: 15, white: 250 } },
  dim: { label: 'Dim', factor: 1.15, tv: { black: 25, white: 248 }, projector: { black: 45, white: 245 } },
  bright: { label: 'Bright', factor: 1.35, tv: { black: 55, white: 245 }, projector: { black: 100, white: 235 } },
};

// What a call viewer receives, and the JPEG quality used to approximate
// video compression at that resolution.
export const RECEIVED = [
  { id: '1080', label: '1080p', w: 1920, h: 1080, q: 0.72 },
  { id: '720', label: '720p', w: 1280, h: 720, q: 0.5 },
  { id: '480', label: '480p', w: 854, h: 480, q: 0.36 },
];

// Where the shared screen is shown, and how far the viewer sits from it.
export const VIEWERS = [
  { id: 'laptop', label: 'Laptop, full screen', width: 0.286, height: 0.179, distance: 0.55 },
  { id: 'gallery', label: 'Laptop, beside gallery', width: 0.2, height: 0.125, distance: 0.55 },
  { id: 'phone', label: 'Phone, upright', width: 0.068, height: 0.147, distance: 0.35 },
];

// The pixel scale of a screenshot: 2x for Retina and other high-DPI screens.
export const SCALES = [
  { id: 'auto', label: 'Auto' },
  { id: '1', label: '1x' },
  { id: '2', label: '2x' },
];

// Assumed distance between the user and their own screen, used to draw the audience view life size.
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
