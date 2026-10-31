# Sheet Nest

An offline nesting planner for laser cutters and CNC routers. Lay out rectangular parts on one or more sheets, see the reusable offcut, and export a 1:1 SVG for each sheet.

It is plain HTML and JavaScript with no build step, no dependencies and no tracking. Projects are saved in your browser.

## Features

- **Sheet sizes**: visual presets for A4, A3, A2, K40-class beds, desktop diode and CO₂ beds (500×300 up to 1300×900), and 2×4 ft / 4×8 ft stock, plus custom sizes. Mix as many sheet sizes as you like.
- **Per-sheet margin and spacing**: the margin keeps parts off the sheet edge, and spacing is the minimum gap between parts. You can apply defaults to every sheet at once.
- **Parts**: add with a quantity, then duplicate, rotate 90°, remove, rename, resize or move between sheets. You can lock a part's orientation to keep the grain direction for plywood.
- **Automatic sheets**: if a part doesn't fit, a new sheet (marked *auto-added*) is created, and it is removed again once it's empty.
- **Best-fit modes**:
  - *Reusable offcuts* (default): packs parts into one corner so the largest possible rectangle is left over.
  - *Even spread*: spaces parts evenly across each sheet.
  - *Min waste*: fills each sheet as fully as possible so you use the fewest sheets.
- **Exports**: an SVG per sheet in millimetres (sheet outline in blue, part bounds in red, labels on their own layer), JSON save/open, and print.
- **Works offline**: a service worker caches the app after the first visit, and it can be installed as an app.

Coordinates are in millimetres from the bottom-left corner of the sheet. Part sizes should be outer bounds, including finger-joint tabs.

## Deploy to GitHub Pages

1. Create a repository (for example `sheet-nest`) and add these files at its root:
   `index.html`, `app.js`, `nest.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `README.md`.
2. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, then choose `main` and `/ (root)`.
3. After a minute the app is live at `https://<user>.github.io/sheet-nest/`.

All paths are relative, so the app works from a project subpath.

**Updating:** after changing any file, bump `VERSION` in `sw.js` (for example `sheetnest-v2`) so returning visitors get the new version instead of the cached one.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly also works, but offline caching only works over http(s).

## How the packing works

`nest.js` is a standalone engine. It runs a MaxRects packer with four placement rules (bottom-left, best short side, best area, contact point) and six sort orders, then keeps the best of the 24 results for the chosen mode.

- **Spacing** is applied by enlarging each part by the spacing value and the usable area by the same amount. This guarantees the gap without adding it at the sheet edge.
- **Even spread** reuses the parts chosen by the packer, arranges them into shelves (rows), and spreads the leftover space evenly between parts and edges. It never goes below the minimum spacing.

This is a rectangle nester. It does not do true-shape nesting. Exported rectangles are placement guides: drop your real part outlines onto them in your CAM or vector software.

## License

MIT
