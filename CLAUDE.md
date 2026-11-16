# Back Row: project context

A small, static web app: drop slides (images or PDF) or a screenshot and see them the way the audience does, in a room (distance + washout) or on a video call (downscale + JPEG compression). Live on GitHub Pages from `main` at https://rohanpaldesign.github.io/back-row/.

## Rules
- Static only: plain HTML/CSS/ES modules, no build step, no package manager, no backend. Nothing the user adds may leave the browser.
- The only third-party code is pdf.js 3.11.174 from cdnjs, loaded lazily in `app.js` when a PDF is added. Pin exact versions for anything new.
- Copy: no em dashes.
- Light and dark themes via tokens in `styles.css` (`:root`, `prefers-color-scheme`, `[data-theme]`). Must work at 390px wide with no horizontal page scroll.

## Files
- `presets.js`: every physical constant (screen sizes, seats, light levels, call profiles, legibility thresholds). Tune the model here.
- `simulate.js`: `simulate(src, cfg)` returns `{degraded, sizeOnly, theta, eye}`; `physical()` gives the slide's physical width and viewing distance; `resample()` is the high-quality resize used everywhere.
- `legibility.js`: `analyze()` compares the slide with what the viewer perceives, cell by cell (total variation for "too small", luminance range for "too faint"); `minReadable()` gives the smallest readable font size from the viewing angle (capitals must cover `CAP_ARCMIN`).
- `app.js`: input (drop, paste, file, PDF), state (persisted in localStorage under `backrow:`), rendering, thumbnails, calibration.
- `sample.js`: the built-in test slide (text at 48/36/24/18/12px, hairlines, a light grey caption).

## The model
- The audience view is drawn life size for the user sitting `USER_DISTANCE` (60 cm) from their own screen: on-screen width = 0.6 x W / D, converted with px-per-mm from the credit-card calibration (default 4.2).
- Readable: capital letter (0.7 x font size) covers 10 arcmin, times the light factor in rooms. Calls also need about 10px font at the received resolution.

## Verify changes
Open the Pages URL (or `python -m http.server`), click "Try a sample": at Back, 9 m / 100" projector / Bright, the verdict is about 44px, so 48px passes and 36px fails. Moving to Front should drop it. Check call mode at 720p on a phone, a multi-page PDF, light and dark, and 390px width.
