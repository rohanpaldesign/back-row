# Back Row

See your slides and screen share the way your audience does.

- **In the room:** pick your seat on a seat map (12 rows, 2 m to 13 m), the screen (55" TV to a 150" projector), the room light and how full the room is. Back Row draws the view from that seat life size: the screen on the far wall, washed out by the light, with the heads of the people sitting in front of you.
- **On a call:** a Zoom-style or Teams-style window (generic look-alikes, no logos) on a laptop, a 24" monitor or a phone, at 1080p, 720p or 480p. Back Row downscales and compresses your screenshot the way a video call does.

For every slide it tells you the **smallest font size that still reads** and highlights areas that are **too small** (red) or **too faint** (amber).

Add slides by dropping images or a PDF, pasting a screenshot, or pasting a link: a Google Slides deck shared with "Anyone with the link", or a direct PDF or image URL. A linked deck gets a shareable Back Row link (`#src=...&slide=3`) that reopens it at the same slide. Everything runs in your browser; nothing is uploaded.

**Live:** https://rohanpaldesign.github.io/back-row/

## Run locally

It's a static site with no build step:

```sh
python -m http.server 8080
```

Then open http://localhost:8080.
