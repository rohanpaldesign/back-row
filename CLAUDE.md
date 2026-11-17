# Back Row: project context

A small, static web app: drop slides (images, PDF, a Google Slides link) or a screenshot and see them the way the audience does, in a room (distance, washout, heads in front) or on a video call (a Zoom-style or Teams-style window, downscale + JPEG compression). Live on GitHub Pages from `main` at https://rohanpaldesign.github.io/back-row/.

## Rules
- Static only: plain HTML/CSS/ES modules, no build step, no package manager, no backend. Nothing the user adds may leave the browser (fetching a link the user pasted, straight from its host, is fine).
- The only third-party code is pdf.js 3.11.174 from cdnjs, loaded lazily in `app.js` when a PDF is added. Fonts (Inter, Inter Tight, JetBrains Mono) come from Google Fonts. Pin exact versions for anything new.
- Call windows are generic look-alikes: never use Zoom or Microsoft logos, names in the UI chrome, or brand assets. Label them "Zoom-style" and "Teams-style".
- Copy: no em dashes.
- UI: horizontal top nav (wordmark, mode tabs, Add/Sample/Theme); one compact results card, not giant stat cards; every icon or unclear control has a `data-tip` tooltip (custom, not `title`). The work view is the scene plus one sticky side panel with four tabs (Result, Seat/Device, Room setup/Call setup, Slides; `backrow:tab`). The scene switch is Room/Call, What they see (the eye-blurred, washed-out slide enlarged via `perceivedImage()`), Your slide. Slide titles come from the largest text near the top of each PDF page (`pageTitle()`), the deck name from Content-Disposition or PDF metadata, images from the file name. The home page fills one screen on desktop; mode tabs only show once slides are loaded. Big numbers only where they earn it, 28px cards, light and dark themes via tokens in `styles.css` (`:root`, `prefers-color-scheme`, `[data-theme]`). Must work at 390px wide with no horizontal page scroll.

## Files
- `presets.js`: every physical constant: screens (with centre heights), room geometry (rows, seat spacing, rake, eye height), `seatTaken()` (the one fixed, nearly full seating chart shared by the seat map and the scene), light levels, call profiles, devices, and `stageBox()` (call window layout fractions used by both the CSS layout and `physical()`).
- `simulate.js`: `simulate(src, cfg)` returns `{degraded, sizeOnly, theta, eye}`; `physical()` gives the slide's physical width and viewing distance; `resample()` is the high-quality resize used everywhere.
- `legibility.js`: `analyze()` compares the slide with what the viewer perceives (Gaussian eye blur), cell by cell; `minReadable()` gives the smallest readable font size from the viewing angle.
- `scene-room.js`: `renderRoom()` draws the first-person pinhole view from the seat inside a 3D room box (side walls, ceiling lights, raked floor, door + exit sign, lectern, ceiling projector and beam, seat backs, people with depth of field), far to near.
- `scene-call.js`: `renderCall()` builds the device frame and call window DOM and paints the shared screen canvas.
- `icons.js`: inline SVG icons. `sample.js`: the built-in test slide.
- `app.js`: input (drop, paste, file, PDF, links + `#src=` hash), state (localStorage under `backrow:`), seat map, cards, drag-to-pan, thumbnails, calibration.

## The model
- Scenes are drawn life size for the user sitting `USER_DISTANCE` (60 cm) from their own screen, using px-per-mm from the credit-card calibration (default 4.2). Call mode fits the device in the card by default (Fit button toggles life size); room mode is life size by default.
- Readable: capital letter (0.7 x font size) covers 10 arcmin, times the light factor in rooms. Calls also need about 10px font at the received resolution.
- Google Slides links are fetched as `/export/pdf` without cookies; this works (CORS allowed) for decks shared with "Anyone with the link".

## Verify changes
Serve locally (`python -m http.server`) or use the Pages URL, click "Try a sample": row 8 (9 m) / 100" projector / Bright gives about 44px with heads in front. Front row / 55" TV: no heads, the view pans. Dark: silhouettes. Check the seat map dots and the heads agree; the Fit button shows the whole room. Hover controls for tooltips; pasting a link shows the loading pill. Call: Zoom-style laptop at 720p, Teams-style side-by-side, phone. Paste a public Google Slides link. Check light and dark, and 390px width (iframe check).

## Room view in 3D (v6)
- The camera sits at the seat and turns to face the screen centre (`renderRoom`: `cam()` yaw, `path3()`/`poly3()` clip polygons to the near plane). The slide is drawn in thin vertical strips so it takes the screen's perspective. Rows are painted far to near; within a row, seats are sorted far to near along the view.
- The verdict counts the side angle: distance = hypot(row distance, side offset) / sqrt(cos angle).
- Screens are mounted on the stage (`center` is above the front floor), and the floor rises `RAKE` 0.12 m a row. Rows are 0.9 m apart, starting 3 m from the screen; the default screen is 300". The row just ahead leans out of your sight line and the head two rows ahead sits in it. From the back rows, that head covers roughly the bottom 12-18% of the screen; nearer rows see it all. Check with a quick node script before changing RAKE or the screen heights.
- The front row is 3 m back (`FIRST_ROW`). The room view opens in the natural view (about 70 degrees across, `fitRoom`, default on). The expand button switches to life size.
- The seating plan is a map bigger than the panel: drag to pan (a drag never picks a seat), and it centres on your seat when the Seat tab opens.
