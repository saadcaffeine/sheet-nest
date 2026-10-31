# Sheet Nest

**Plan how rectangular parts fit onto laser-cutter and CNC sheets, right in your browser.**

### 👉 [Open the live app: saadcaffeine.github.io/sheet-nest](https://saadcaffeine.github.io/sheet-nest/)

Nothing to install. It runs in any modern browser on desktop, tablet or phone.

Sheet Nest helps makers answer: *"How many sheets do I need, where does each panel go, and what offcut will I have left?"* You give it your sheet size and a list of part sizes. It nests the parts, adds more sheets when they won't fit, highlights the largest reusable offcut, and exports a 1:1 SVG layout for your laser or CNC software.

- **Free and open source.** No sign-up, no tracking, no server. Projects are saved in your browser.
- **Works offline.** After the first visit it runs with no connection, and it can be installed as an app.
- **No build step and no dependencies.** It's plain HTML and JavaScript.

---

## Using Sheet Nest

### 1. Choose your sheets

- **Pick a size** from the visual presets, or type a custom width and height in millimetres:

  | Group | Sizes |
  |---|---|
  | Paper sizes | A4 · A3 · A2 |
  | Laser beds | K40-class 300×200 · Diode 400×400 · Desktop 500×300 · CO₂ 600×400, 700×500, 900×600, 1300×900 |
  | Stock sheets | 2×4 ft (1220×610) · 4×8 ft (2440×1220) |

- **Add the sheet.** Press **Add sheet**. You can mix different sheet sizes in one project.
- **Set spacing for each sheet.** Every sheet has its own:
  - **Margin:** the distance kept clear from the sheet edge, for hold-downs, rough edges and homing error.
  - **Spacing:** the minimum gap between parts, to avoid heat build-up and scorched shared edges.

  **Default spacing** sets the values for new sheets and can apply them to every sheet at once.
- **Use the sheet header** to rename, resize, rotate, duplicate (with its parts), export or remove a sheet.

### 2. Add parts

- **Enter each part's outer bounds**, including finger-joint tabs, along with a quantity.
- **Choose where it goes.** Place it on a specific sheet, or let it go to the first sheet with space.
- **Lock orientation** when grain direction matters, such as with plywood or veneer. The optimiser will then never rotate that part.

If a part doesn't fit anywhere, Sheet Nest adds a new sheet automatically, marked **auto-added**. That sheet disappears again once it's empty. A part bigger than every sheet is flagged so you can add a larger one.

### 3. Edit parts

Click a part on a sheet, or its chip below the sheet, to open the edit bar. From there you can rename, resize, rotate 90°, lock, duplicate, remove, or move the part to another sheet.

| Shortcut | Action |
|---|---|
| <kbd>R</kbd> | Rotate 90° (and lock orientation) |
| <kbd>D</kbd> | Duplicate |
| <kbd>Delete</kbd> | Remove |
| <kbd>Esc</kbd> | Deselect |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Z</kbd> | Undo |

### 4. Optimise with Best fit

The **Best fit** buttons in the header re-nest every part across your sheets:

| Mode | Use it when | What it does |
|---|---|---|
| **Reusable offcuts** *(default)* | You want to keep leftover stock | Packs parts toward one corner so a large, clean rectangle is left. It accepts slightly less fill on a sheet only if that doesn't add an extra sheet. |
| **Even spread** | Thermal spacing or easy part removal matters | Arranges parts in rows and spreads the spare space evenly between parts and edges, never below your minimum spacing. |
| **Min waste** | Material is expensive | Fills each sheet as fully as possible so you use the fewest sheets. |

Each sheet shows its material use and its **largest offcut**, which is drawn hatched with its dimensions.

### 5. Export and save

- **SVG per sheet:** 1:1 in millimetres, with the sheet outline in blue, part bounds in red and labels on their own layer. Import it into LightBurn, Inkscape, LaserGRBL or your CAM tool, then drop your real part outlines onto the rectangles.
- **Save / Open .json:** keep or share a whole project.
- **Print:** prints a clean copy of the layouts for the shop floor.

Coordinates are in millimetres, measured from the **bottom-left** corner of each sheet. That corner is marked with a dot.

### Limitations

Sheet Nest nests **rectangles** (bounding boxes) only. It doesn't do true-shape nesting of irregular outlines, kerf compensation or toolpaths. For true-shape nesting, see [Deepnest](#similar-tools) below.

---

## Run or host it yourself

**Locally:**

```sh
git clone https://github.com/saadcaffeine/sheet-nest.git
cd sheet-nest
python3 -m http.server 8000      # then open http://localhost:8000
```

Opening `index.html` directly also works, but offline caching needs http(s).

**On GitHub Pages:** the official copy is at <https://saadcaffeine.github.io/sheet-nest/>. To host your own, fork the repo, then go to **Settings → Pages → Deploy from a branch → `main` / root**.

**After changing files:** bump `VERSION` in `sw.js` (for example `sheetnest-v2`) so returning visitors get the update instead of the cached copy.

### Project structure

| File | Purpose |
|---|---|
| `index.html` | Page layout and styles |
| `app.js` | User interface, state, undo, import/export |
| `nest.js` | Standalone packing engine (also usable in Node) |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest`, `icon.svg` | App install metadata and icon |

### How the packing engine works

`nest.js` runs a **MaxRects** packer with four placement rules (bottom-left, best short-side fit, best area fit and contact point) over six sort orders. It then keeps the best of the 24 results for the chosen mode.

Spacing is guaranteed by enlarging each part, and the usable area, by the spacing value. *Even spread* takes the parts that fit and arranges them into rows with distributed gaps. The largest offcut is found by subtracting each placed part, plus half the spacing, from the full sheet and measuring the biggest remaining rectangle.

---

## Credits and references

Sheet Nest has **no runtime dependencies or third-party packages**. It uses only the browser's built-in features (SVG, localStorage, Service Worker). The algorithms are original implementations based on published work:

- **Jukka Jylänki, *A Thousand Ways to Pack the Bin: A Practical Approach to Two-Dimensional Rectangle Bin Packing* (2010).** This paper is the source of the MaxRects free-rectangle method and the placement heuristics used in `nest.js`.
  - [Paper (PDF)](https://raw.githubusercontent.com/juj/RectangleBinPack/master/RectangleBinPack.pdf)
  - [Reference C++ implementation (public domain)](https://github.com/juj/RectangleBinPack)
- **Shelf / "first-fit decreasing height" packing:** the classic 2D strip-packing approach, adapted here for the *Even spread* mode.
- **Web platform docs:** [MDN, Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) and [MDN, Web app manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest).
- **Sheet presets:** typical working areas of common hobby laser classes and standard stock sizes. Always check your own machine's bed size.

Built by [@saadcaffeine](https://github.com/saadcaffeine) with the [Edible Makerspace](https://linktr.ee/ediblemakerspace) and SalvageGarden makerspace communities, with help from Claude (Anthropic).

---

## Similar tools

Sheet Nest is deliberately small. These tools go further in different directions. ⭐ marks **free and open-source** projects.

### Nesting (true-shape and rectangle)

- ⭐ **[Deepnest](https://github.com/deepnest-next/deepnest)**: a desktop app that nests irregular SVG/DXF shapes to save material. This link is the actively maintained community fork *deepnest-next*.
- ⭐ **[SVGnest](https://github.com/Jack000/SVGnest)**: the browser-based true-shape nester by Jack Qiao that Deepnest grew out of.
- ⭐ **[Inkscape Nest extension](https://github.com/Neon22/inkscape-nest)**: brings SVGnest-style nesting into Inkscape.
- **[LightBurn: Nest Selected](https://docs.lightburnsoftware.com/2.1/Reference/NestSelected/)**: built-in nesting in the popular commercial laser software.

### Box and finger-joint generators (make the parts to nest)

- ⭐ **[Boxes.py](https://festi.info/boxes.py/)** ([source](https://github.com/florianfesti/boxes)): a large library of parametric finger-joint boxes, trays and enclosures.
- ⭐ **[TabbedBoxMaker](https://github.com/paulh-rnd/TabbedBoxMaker)**: an Inkscape extension for finger-jointed boxes with dividers and kerf compensation.
- **[MakerCase](https://en.makercase.com/)**: a free web-based box designer.

### Woodworking cut lists

- ⭐ **[OpenCutList](https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension)**: a SketchUp extension for cut lists, cutting diagrams and cost estimates.
- ⭐ **[cutting-diagrams on GitHub](https://github.com/topics/cutting-diagrams)**: more open-source cut-list and sheet optimisers.

### Packing libraries (for developers)

- ⭐ **[RectangleBinPack](https://github.com/juj/RectangleBinPack)**: the reference implementations of MaxRects, Guillotine, Skyline and Shelf packing (C++).

---

## Contributing

Issues and pull requests are welcome. Ideas on the list:

- Import part sizes from SVG/DXF bounding boxes
- Inch units
- Kerf-aware offcut sizes
- Drag-to-place manual mode

## License

[MIT](LICENSE). Free to use, change and share.
