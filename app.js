/* Sheet Nest — UI. All data stays in the browser (localStorage). Units: mm. */
(function () {
  'use strict';

  var PRESETS = [
    { k: 'a4', label: 'A4', w: 297, h: 210 },
    { k: 'a3', label: 'A3', w: 420, h: 297 },
    { k: 'a2', label: 'A2', w: 594, h: 420 },
    { k: 'k40', label: 'K40 bed', w: 300, h: 200 },
    { k: 'd400', label: 'Diode', w: 400, h: 400 },
    { k: 'd500', label: 'Desktop', w: 500, h: 300 },
    { k: 'c600', label: 'CO₂ small', w: 600, h: 400 },
    { k: 'c700', label: 'CO₂ mid', w: 700, h: 500 },
    { k: 'c900', label: 'CO₂ 9060', w: 900, h: 600 },
    { k: 'c1300', label: 'CO₂ 1390', w: 1300, h: 900 },
    { k: 'ft24', label: '2×4 ft', w: 1220, h: 610 },
    { k: 'ft48', label: '4×8 ft', w: 2440, h: 1220 }
  ];
  var PALETTE = ['#1D9E75', '#378ADD', '#D85A30', '#7F77DD', '#BA7517', '#D4537E', '#639922', '#888780'];
  var MODES = { offcut: 'Reusable offcuts', spread: 'Even spread', waste: 'Min waste' };
  var LS = 'sheetnest-v1';

  var S, undoStack = [], sel = null, toastT;
  var draft = { k: 'c700', w: 700, h: 500 };
  var form = { name: 'Part', w: 100, h: 60, qty: 1, target: 'auto', lock: false };

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var fmt = function (n) { return String(Math.round(n * 10) / 10); };
  var num = function (v, min) { var n = parseFloat(v); return isFinite(n) ? Math.max(min || 0, n) : (min || 0); };

  /* ---------- state ---------- */
  function blank() { return { v: 1, next: 1, mode: 'offcut', defaults: { margin: 15, spacing: 10 }, sheets: [], parts: [] }; }
  function uid() { return S.next++; }
  function mkSheet(w, h, o) {
    o = o || {};
    return { id: uid(), name: '', w: w, h: h,
      margin: o.margin != null ? o.margin : S.defaults.margin,
      spacing: o.spacing != null ? o.spacing : S.defaults.spacing, auto: !!o.auto };
  }
  function mkPart(name, w, h, o) {
    o = o || {};
    return { id: uid(), name: name, w: w, h: h, rot: false, lock: !!o.lock, sheetId: o.sheetId != null ? o.sheetId : null, x: null, y: null };
  }
  function example() {
    S = blank();
    var a = mkSheet(700, 500), b = mkSheet(700, 500);
    S.sheets.push(a, b);
    [['Base', 470, 270], ['Top', 470, 270], ['Front', 470, 150], ['Back', 470, 150], ['Left side', 270, 150], ['Right side', 270, 150]]
      .forEach(function (p) { S.parts.push(mkPart(p[0], p[1], p[2], { sheetId: a.id })); });
    layout();
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }
  function load() {
    try {
      var j = JSON.parse(localStorage.getItem(LS));
      if (valid(j)) { S = j; return true; }
    } catch (e) { /* ignore */ }
    return false;
  }
  function valid(j) { return j && j.v === 1 && Array.isArray(j.sheets) && Array.isArray(j.parts); }
  function pushUndo() { undoStack.push(JSON.stringify(S)); if (undoStack.length > 80) undoStack.shift(); }
  function undo() {
    if (!undoStack.length) return toast('Nothing to undo');
    S = JSON.parse(undoStack.pop());
    if (sel && !partById(sel)) sel = null;
    save(); render(); toast('Undone');
  }
  function mutate(fn, relayout) {
    pushUndo();
    fn();
    if (relayout !== false) layout();
    save(); render();
  }
  function partById(id) { for (var i = 0; i < S.parts.length; i++) if (S.parts[i].id === id) return S.parts[i]; return null; }
  function sheetById(id) { for (var i = 0; i < S.sheets.length; i++) if (S.sheets[i].id === id) return S.sheets[i]; return null; }
  function partsOn(sh) { return S.parts.filter(function (p) { return p.sheetId === sh.id; }); }
  function fw(p) { return p.rot ? p.h : p.w; }
  function fh(p) { return p.rot ? p.w : p.h; }
  function sheetName(sh) { return sh.name || ('Sheet ' + (S.sheets.indexOf(sh) + 1)); }
  function presetFor(w, h) {
    for (var i = 0; i < PRESETS.length; i++) {
      var p = PRESETS[i];
      if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) return p;
    }
    return null;
  }

  /* ---------- layout ---------- */
  var TOL = 0;
  function toItem(p) { return { id: p.id, w: fw(p), h: fh(p), canRot: !p.lock }; }
  function packInto(sh, parts) {
    var r = Nest.packSheet(sh, parts.map(toItem), S.mode, { tol: TOL }), map = {};
    parts.forEach(function (p) { map[p.id] = p; });
    r.placed.forEach(function (pl) {
      var p = map[pl.id];
      p.sheetId = sh.id; p.x = pl.x; p.y = pl.y;
      if (pl.flip) p.rot = !p.rot;
    });
    sh._off = r.offcut;
    return r.overflow.map(function (o) { return map[o.id]; });
  }
  // Offcut mode: try a few fill tolerances; keep the one that uses the fewest
  // sheets, then leaves the most reusable offcut area.
  function layout() {
    if (S.mode !== 'offcut') { TOL = 0; return layoutOnce(); }
    var start = JSON.stringify(S), best = null;
    [0, 0.08, 0.15, 0.25].forEach(function (t) {
      S = JSON.parse(start); TOL = t; layoutOnce();
      var used = S.sheets.filter(function (s) { return partsOn(s).length; });
      var off = used.reduce(function (a, s) { return a + (s._off ? s._off.w * s._off.h : 0); }, 0);
      var unplaced = S.parts.filter(function (p) { return p.sheetId == null; }).length;
      var key = [unplaced, S.sheets.length, -off];
      var better = !best;
      for (var i = 0; !better && i < 3; i++) { if (key[i] < best.key[i] - 1e-6) better = true; else if (key[i] > best.key[i] + 1e-6) break; }
      if (better) best = { key: key, json: JSON.stringify(S) };
    });
    S = JSON.parse(best.json); TOL = 0;
  }
  function layoutOnce() {
    var ids = {};
    S.sheets.forEach(function (s) { ids[s.id] = 1; });
    var carry = S.parts.filter(function (p) { return !ids[p.sheetId]; });
    S.sheets.forEach(function (sh) { carry = packInto(sh, partsOn(sh).concat(carry)); });
    var guard = 0;
    while (carry.length && guard++ < 500) {
      var tpls = [S.sheets[S.sheets.length - 1]].concat(S.sheets.slice().sort(function (a, b) { return b.w * b.h - a.w * a.h; })).filter(Boolean);
      var made = null;
      for (var i = 0; i < tpls.length && !made; i++) {
        var t = tpls[i];
        var ns = { id: -1, name: '', w: t.w, h: t.h, margin: t.margin, spacing: t.spacing, auto: true };
        if (Nest.packSheet(ns, carry.map(toItem), S.mode, { tol: TOL }).placed.length) { ns.id = uid(); made = ns; }
      }
      if (!made) {
        carry.forEach(function (p) { p.sheetId = null; p.x = p.y = null; });
        break;
      }
      S.sheets.push(made);
      carry = packInto(made, carry);
    }
    S.sheets = S.sheets.filter(function (sh) { return !sh.auto || partsOn(sh).length; });
  }
  function bestFit(mode) {
    var before = S.sheets.length;
    mutate(function () {
      S.mode = mode;
      S.sheets = S.sheets.filter(function (s) { return !s.auto; });
      if (!S.sheets.length) S.sheets.push(mkSheet(draft.w, draft.h));
      var first = S.sheets[0].id;
      S.parts.forEach(function (p) { p.sheetId = first; });
    });
    var used = S.sheets.filter(function (s) { return partsOn(s).length; }).length;
    toast(MODES[mode] + ' · ' + used + ' sheet' + (used === 1 ? '' : 's') + ' used' + (S.sheets.length > before ? ' (sheets added)' : ''));
  }

  /* ---------- render ---------- */
  function render() {
    document.querySelectorAll('[data-act=fit]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === S.mode);
      b.setAttribute('aria-pressed', b.getAttribute('data-mode') === S.mode);
    });
    renderSide(); renderSheets(); renderBar();
  }

  function miniRect(w, h) {
    var sc = Math.min(54 / w, 34 / h), rw = w * sc, rh = h * sc;
    return '<svg viewBox="0 0 58 38" aria-hidden="true"><rect x="' + (29 - rw / 2) + '" y="' + (19 - rh / 2) + '" width="' + rw + '" height="' + rh +
      '" rx="1.5" fill="var(--sheet)" stroke="var(--sheet-line)"/></svg>';
  }

  function renderSide() {
    var presetBtns = PRESETS.map(function (p) {
      var on = draft.k === p.k;
      return '<button class="preset' + (on ? ' on' : '') + '" data-act="preset" data-k="' + p.k + '" aria-pressed="' + on + '">' +
        miniRect(p.w, p.h) + '<b>' + esc(p.label) + '</b><span>' + p.w + '×' + p.h + '</span></button>';
    }).join('');
    var sheetOpts = '<option value="auto">First sheet with space</option>' + S.sheets.map(function (sh) {
      return '<option value="' + sh.id + '"' + (String(form.target) === String(sh.id) ? ' selected' : '') + '>' + esc(sheetName(sh)) + ' (' + sh.w + '×' + sh.h + ')</option>';
    }).join('');
    var unplaced = S.parts.filter(function (p) { return p.sheetId == null; });
    var html =
      '<div class="card"><h2>Sheet size</h2><div class="presets">' + presetBtns + '</div>' +
      '<div class="row"><label>Width (mm)<input type="number" min="1" step="any" data-draft="w" value="' + draft.w + '"></label>' +
      '<button data-act="draft-swap" title="Swap width and height" aria-label="Swap width and height">⇄</button>' +
      '<label>Height (mm)<input type="number" min="1" step="any" data-draft="h" value="' + draft.h + '"></label></div>' +
      '<button class="primary" data-act="add-sheet" style="width:100%">+ Add ' + draft.w + ' × ' + draft.h + ' sheet</button></div>' +

      '<div class="card"><h2>Add parts</h2>' +
      '<div class="row"><label>Name<input data-form="name" value="' + esc(form.name) + '"></label><label style="flex:0 0 70px">Qty<input type="number" min="1" max="500" step="1" data-form="qty" value="' + form.qty + '"></label></div>' +
      '<div class="row"><label>Width (mm)<input type="number" min="0.1" step="any" data-form="w" value="' + form.w + '"></label><label>Height (mm)<input type="number" min="0.1" step="any" data-form="h" value="' + form.h + '"></label></div>' +
      '<div class="row"><label>Place on<select data-form="target">' + sheetOpts + '</select></label></div>' +
      '<label class="check"><input type="checkbox" data-form="lock"' + (form.lock ? ' checked' : '') + '> Lock orientation (grain direction)</label>' +
      '<button class="primary" data-act="add-part" style="width:100%;margin-top:10px">+ Add part' + (form.qty > 1 ? 's' : '') + '</button>' +
      '<p class="hint">Use outer bounds including finger-joint tabs. If a part doesn’t fit, a new sheet is added automatically.</p></div>' +

      (unplaced.length ? '<div class="card warn"><h2>Doesn’t fit any sheet</h2>' + unplaced.map(function (p) {
        return '<div class="row"><span>' + esc(p.name) + ' · ' + fmt(p.w) + '×' + fmt(p.h) + '</span><button data-act="select" data-id="' + p.id + '">Edit</button></div>';
      }).join('') + '<p class="hint">Add a larger sheet, or reduce the margin or spacing.</p></div>' : '') +

      '<div class="card"><h2>Default spacing for new sheets</h2>' +
      '<div class="row"><label>Margin (mm)<input type="number" min="0" step="any" data-def="margin" value="' + S.defaults.margin + '"></label>' +
      '<label>Spacing (mm)<input type="number" min="0" step="any" data-def="spacing" value="' + S.defaults.spacing + '"></label></div>' +
      '<button data-act="apply-all" style="width:100%">Apply to all sheets</button>' +
      '<p class="hint">Margin keeps parts off the sheet edge. Spacing is the minimum gap between parts.</p></div>' +

      '<div class="card"><h2>Project</h2><div class="row">' +
      '<button data-act="export-json">Save .json</button><button data-act="import-json">Open .json</button></div>' +
      '<div class="row"><button data-act="export-all">Export all SVGs</button><button data-act="print">Print</button></div>' +
      '<div class="row"><button data-act="example">Load example</button><button class="danger" data-act="clear">Clear all</button></div>' +
      '<p class="hint">Shortcuts: <kbd>R</kbd> rotate · <kbd>D</kbd> duplicate · <kbd>Del</kbd> remove · <kbd>Esc</kbd> deselect · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</p></div>';
    $('#side').innerHTML = html;
  }

  function colorFor(name) {
    var h = 0, s = String(name).replace(/\s*\d+$/, '').toLowerCase();
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function sheetSVG(sh) {
    var W = sh.w, H = sh.h, m = sh.margin, parts = partsOn(sh), off = sh._off;
    var pad = Math.max(W, H) * 0.01, base = Math.max(W, H) / 55;
    var out = '<svg class="canvas" viewBox="' + (-pad) + ' ' + (-pad) + ' ' + (W + 2 * pad) + ' ' + (H + 2 * pad) +
      '" role="img" aria-label="' + esc(sheetName(sh)) + ' layout, ' + parts.length + ' parts">' +
      '<defs><pattern id="hatch' + sh.id + '" width="' + base + '" height="' + base + '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line x1="0" y1="0" x2="0" y2="' + base + '" stroke="var(--off)" stroke-width="' + (base * 0.1) + '" opacity=".55"/></pattern></defs>' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--sheet)" stroke="var(--sheet-line)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>';
    if (m > 0 && W > 2 * m && H > 2 * m) {
      out += '<rect x="' + m + '" y="' + m + '" width="' + (W - 2 * m) + '" height="' + (H - 2 * m) +
        '" fill="none" stroke="var(--margin)" stroke-dasharray="5 4" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    }
    if (off && parts.length) {
      var oy = H - off.y - off.h;
      out += '<rect x="' + off.x + '" y="' + oy + '" width="' + off.w + '" height="' + off.h + '" fill="url(#hatch' + sh.id +
        ')" stroke="var(--off)" stroke-dasharray="6 4" stroke-width="1" vector-effect="non-scaling-stroke"/>';
      var otxt = 'offcut ' + fmt(off.w) + '×' + fmt(off.h);
      var ofs = Math.min(base, off.h / 2.5, off.w / (otxt.length * 0.6));
      if (ofs > base * 0.4) {
        out += '<text x="' + (off.x + off.w / 2) + '" y="' + (oy + off.h / 2) + '" font-size="' + ofs +
          '" text-anchor="middle" dominant-baseline="central" fill="var(--off)" font-weight="600">' + otxt + '</text>';
      }
    }
    parts.forEach(function (p) {
      var w = fw(p), h = fh(p), x = p.x, y = H - p.y - h, c = colorFor(p.name), on = p.id === sel;
      var dims = fmt(w) + '×' + fmt(h);
      out += '<g class="part" data-act="select" data-id="' + p.id + '"><title>' + esc(p.name) + ' ' + dims + (p.lock ? ' (locked)' : '') + '</title>' +
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '" fill-opacity="' + (on ? 0.5 : 0.3) +
        '" stroke="' + (on ? 'var(--sel)' : c) + '" stroke-width="' + (on ? 3 : 1.2) + '" vector-effect="non-scaling-stroke"/>';
      var len = Math.max(p.name.length, dims.length);
      var fs = Math.min(base, h / 3.2, w / (len * 0.62));
      if (fs >= base * 0.4) {
        out += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 - fs * 0.6) + '" font-size="' + fs + '" text-anchor="middle" dominant-baseline="central" fill="var(--ink)" font-weight="600">' + esc(p.name) + (p.lock ? ' 🔒' : '') + '</text>' +
          '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + fs * 0.7) + '" font-size="' + (fs * 0.85) + '" text-anchor="middle" dominant-baseline="central" fill="var(--ink)" opacity=".75">' + dims + '</text>';
      } else {
        var fs2 = Math.min(base, h / 1.6, w / (dims.length * 0.62));
        if (fs2 >= base * 0.35) out += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2) + '" font-size="' + fs2 + '" text-anchor="middle" dominant-baseline="central" fill="var(--ink)">' + dims + '</text>';
      }
      out += '</g>';
    });
    out += '<circle cx="0" cy="' + H + '" r="' + (base * 0.28) + '" fill="var(--sel)"><title>Origin (0,0)</title></circle></svg>';
    return out;
  }

  function sheetCard(sh) {
    var parts = partsOn(sh), used = 0;
    parts.forEach(function (p) { used += p.w * p.h; });
    var util = sh.w * sh.h ? used / (sh.w * sh.h) * 100 : 0;
    var pre = presetFor(sh.w, sh.h);
    var opts = PRESETS.map(function (p) {
      return '<option value="' + p.k + '"' + (pre && pre.k === p.k ? ' selected' : '') + '>' + esc(p.label) + ' · ' + p.w + '×' + p.h + '</option>';
    }).join('') + '<option value="custom"' + (pre ? '' : ' selected') + '>Custom</option>';
    var chips = parts.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }).map(function (p) {
      return '<button class="chip' + (p.id === sel ? ' on' : '') + '" data-act="select" data-id="' + p.id + '"><span class="sw" style="background:' + colorFor(p.name) + '"></span>' +
        esc(p.name) + ' ' + fmt(fw(p)) + '×' + fmt(fh(p)) + (p.lock ? ' 🔒' : '') + '</button>';
    }).join('');
    return '<section class="card sheet" data-sheet="' + sh.id + '">' +
      '<div class="sheet-title"><strong>' + esc(sheetName(sh)) + '</strong>' + (sh.auto ? '<span class="badge">auto-added</span>' : '') +
      '<span class="spacer"></span>' +
      '<button class="ghost" data-act="sheet-swap" data-id="' + sh.id + '" title="Swap orientation">⇄ Rotate sheet</button>' +
      '<button class="ghost" data-act="sheet-dup" data-id="' + sh.id + '" title="Duplicate sheet with its parts">Duplicate</button>' +
      '<button class="ghost" data-act="sheet-svg" data-id="' + sh.id + '" title="Download SVG at 1:1 mm scale">SVG</button>' +
      '<button class="ghost danger" data-act="sheet-del" data-id="' + sh.id + '" title="Remove sheet (its parts move to other sheets)">Remove</button></div>' +
      '<div class="sheet-head">' +
      '<label>Name<input data-sf="name" data-id="' + sh.id + '" placeholder="' + esc(sheetName(sh)) + '" value="' + esc(sh.name) + '"></label>' +
      '<label>Size<select data-sf="preset" data-id="' + sh.id + '">' + opts + '</select></label>' +
      '<label>W (mm)<input type="number" min="1" step="any" data-sf="w" data-id="' + sh.id + '" value="' + sh.w + '"></label>' +
      '<label>H (mm)<input type="number" min="1" step="any" data-sf="h" data-id="' + sh.id + '" value="' + sh.h + '"></label>' +
      '<label>Margin<input type="number" min="0" step="any" data-sf="margin" data-id="' + sh.id + '" value="' + sh.margin + '"></label>' +
      '<label>Spacing<input type="number" min="0" step="any" data-sf="spacing" data-id="' + sh.id + '" value="' + sh.spacing + '"></label></div>' +
      sheetSVG(sh) +
      '<div class="stats"><span><b>' + parts.length + '</b> part' + (parts.length === 1 ? '' : 's') + '</span><span><b>' + fmt(util) + '%</b> used</span>' +
      (sh._off && parts.length ? '<span>Largest offcut <b>' + fmt(sh._off.w) + ' × ' + fmt(sh._off.h) + '</b></span>' : '') + '</div>' +
      (chips ? '<div class="chips">' + chips + '</div>' : '<p class="hint">Empty sheet. Add parts or press a best-fit button.</p>') +
      '</section>';
  }

  function renderSheets() {
    var totalSheet = 0, totalPart = 0, usedSheets = 0;
    S.sheets.forEach(function (sh) {
      var ps = partsOn(sh);
      if (ps.length) { usedSheets++; totalSheet += sh.w * sh.h; }
      ps.forEach(function (p) { totalPart += p.w * p.h; });
    });
    var head = '<div class="summary"><span><b>' + S.sheets.length + '</b> sheet' + (S.sheets.length === 1 ? '' : 's') + '</span>' +
      '<span><b>' + S.parts.length + '</b> parts</span>' +
      '<span><b>' + (totalSheet ? fmt(totalPart / totalSheet * 100) : 0) + '%</b> material used</span>' +
      '<span>Mode: <b>' + MODES[S.mode] + '</b></span></div>';
    $('#sheets').innerHTML = head + (S.sheets.length ? S.sheets.map(sheetCard).join('') :
      '<div class="card empty">No sheets yet. Pick a size on the left and press <b>Add sheet</b>.</div>');
  }

  function renderBar() {
    var p = sel != null ? partById(sel) : null, bar = $('#bar');
    if (!p) { bar.classList.remove('show'); bar.innerHTML = ''; return; }
    var opts = S.sheets.map(function (sh) {
      return '<option value="' + sh.id + '"' + (p.sheetId === sh.id ? ' selected' : '') + '>' + esc(sheetName(sh)) + '</option>';
    }).join('') + (p.sheetId == null ? '<option value="" selected>Not placed</option>' : '');
    bar.classList.add('show');
    bar.innerHTML =
      '<label>Name<input data-pf="name" value="' + esc(p.name) + '"></label>' +
      '<label>Width<input type="number" min="0.1" step="any" data-pf="w" value="' + p.w + '"></label>' +
      '<label>Height<input type="number" min="0.1" step="any" data-pf="h" value="' + p.h + '"></label>' +
      '<label>Sheet<select data-pf="sheet">' + opts + '</select></label>' +
      '<div class="acts"><button data-act="rot" title="Rotate 90° (R)">⟳ 90°</button>' +
      '<button data-act="lock" aria-pressed="' + p.lock + '" title="Keep this orientation when optimising">' + (p.lock ? '🔒 Locked' : 'Lock') + '</button>' +
      '<button data-act="dup" title="Duplicate (D)">Duplicate</button>' +
      '<button class="danger" data-act="del" title="Remove (Delete)">Remove</button>' +
      '<button class="ghost" data-act="desel" aria-label="Close">✕</button></div>' +
      '<div class="foot">Footprint ' + fmt(fw(p)) + ' × ' + fmt(fh(p)) + ' mm' + (p.rot ? ' (rotated)' : '') +
      (p.x != null ? ' · at X ' + fmt(p.x) + ', Y ' + fmt(p.y) + ' from bottom-left' : '') + '</div>';
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- export ---------- */
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function exportSVG(sh) {
    var H = sh.h, parts = partsOn(sh);
    var s = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + sh.w + 'mm" height="' + sh.h + 'mm" viewBox="0 0 ' + sh.w + ' ' + sh.h + '">\n' +
      '<!-- ' + esc(sheetName(sh)) + ': part rectangles are placement bounds. Replace them with your real part outlines. -->\n' +
      '<g id="sheet" fill="none" stroke="#0000ff" stroke-width="0.1"><rect x="0" y="0" width="' + sh.w + '" height="' + sh.h + '"/></g>\n' +
      '<g id="parts" fill="none" stroke="#ff0000" stroke-width="0.1">\n';
    parts.forEach(function (p) {
      s += '  <rect id="part-' + p.id + '" x="' + fmt(p.x) + '" y="' + fmt(H - p.y - fh(p)) + '" width="' + fmt(fw(p)) + '" height="' + fmt(fh(p)) + '"><title>' + esc(p.name) + '</title></rect>\n';
    });
    s += '</g>\n<g id="labels" fill="#000000" font-family="sans-serif" text-anchor="middle">\n';
    parts.forEach(function (p) {
      var fs = Math.max(3, Math.min(10, fh(p) / 6, fw(p) / Math.max(4, p.name.length * 0.7)));
      s += '  <text x="' + fmt(p.x + fw(p) / 2) + '" y="' + fmt(H - p.y - fh(p) / 2) + '" font-size="' + fmt(fs) + '">' + esc(p.name) + '</text>\n';
    });
    s += '</g>\n</svg>\n';
    var fname = (sheetName(sh) + '-' + sh.w + 'x' + sh.h).replace(/[^\w.-]+/g, '_') + '.svg';
    download(fname, s, 'image/svg+xml');
  }

  /* ---------- actions ---------- */
  function addParts() {
    var w = num(form.w, 0.1), h = num(form.h, 0.1), q = Math.min(500, Math.max(1, Math.round(num(form.qty, 1))));
    var name = (form.name || 'Part').trim() || 'Part', before = S.sheets.length;
    mutate(function () {
      if (!S.sheets.length) S.sheets.push(mkSheet(draft.w, draft.h));
      var target = form.target === 'auto' ? null : +form.target;
      if (target != null && !sheetById(target)) target = null;
      for (var i = 0; i < q; i++) S.parts.push(mkPart(q > 1 ? name + ' ' + (i + 1) : name, w, h, { lock: form.lock, sheetId: target }));
    });
    var added = S.sheets.length - before;
    toast('Added ' + q + ' × ' + name + (added > 0 ? ' · ' + added + ' sheet' + (added > 1 ? 's' : '') + ' added' : ''));
  }
  function act(a, el) {
    var id = el.getAttribute('data-id') != null ? +el.getAttribute('data-id') : null;
    var p = sel != null ? partById(sel) : null;
    switch (a) {
      case 'fit': return bestFit(el.getAttribute('data-mode'));
      case 'undo': return undo();
      case 'preset':
        var pr = PRESETS.filter(function (x) { return x.k === el.getAttribute('data-k'); })[0];
        var portrait = draft.h > draft.w;
        draft = { k: pr.k, w: portrait ? pr.h : pr.w, h: portrait ? pr.w : pr.h };
        return renderSide();
      case 'draft-swap': draft = { k: draft.k, w: draft.h, h: draft.w }; return renderSide();
      case 'add-sheet':
        mutate(function () { S.sheets.push(mkSheet(draft.w, draft.h)); });
        return toast('Sheet added');
      case 'add-part': return addParts();
      case 'apply-all':
        mutate(function () { S.sheets.forEach(function (s) { s.margin = S.defaults.margin; s.spacing = S.defaults.spacing; }); });
        return toast('Margin and spacing applied to all sheets');
      case 'select': sel = id; render(); return;
      case 'desel': sel = null; render(); return;
      case 'sheet-swap': return mutate(function () { var s = sheetById(id); var t = s.w; s.w = s.h; s.h = t; s.auto = false; });
      case 'sheet-dup':
        return mutate(function () {
          var s = sheetById(id), ns = mkSheet(s.w, s.h, { margin: s.margin, spacing: s.spacing });
          S.sheets.splice(S.sheets.indexOf(s) + 1, 0, ns);
          partsOn(s).forEach(function (q) { var c = mkPart(q.name, q.w, q.h, { lock: q.lock, sheetId: ns.id }); c.rot = q.rot; S.parts.push(c); });
        });
      case 'sheet-del':
        mutate(function () { S.sheets = S.sheets.filter(function (s) { return s.id !== id; }); });
        return toast('Sheet removed · Undo to restore');
      case 'sheet-svg': return exportSVG(sheetById(id));
      case 'export-all':
        S.sheets.filter(function (s) { return partsOn(s).length; }).forEach(function (s, i) { setTimeout(function () { exportSVG(s); }, i * 300); });
        return;
      case 'export-json': return download('sheet-nest-project.json', JSON.stringify(S, null, 2), 'application/json');
      case 'import-json': return $('#importFile').click();
      case 'print': return window.print();
      case 'example': pushUndo(); example(); save(); sel = null; render(); return toast('Example loaded');
      case 'clear':
        pushUndo(); var d = S.defaults; S = blank(); S.defaults = d; sel = null; save(); render();
        return toast('Cleared · Undo to restore');
      case 'rot': if (p) mutate(function () { p.rot = !p.rot; p.lock = true; }); return;
      case 'lock': if (p) mutate(function () { p.lock = !p.lock; }); return;
      case 'dup':
        if (p) mutate(function () {
          var c = mkPart(p.name, p.w, p.h, { lock: p.lock, sheetId: p.sheetId });
          c.rot = p.rot;
          S.parts.splice(S.parts.indexOf(p) + 1, 0, c);
          sel = c.id;
        });
        return;
      case 'del':
        if (p) { mutate(function () { S.parts = S.parts.filter(function (q) { return q !== p; }); sel = null; }); toast('Part removed · Undo to restore'); }
        return;
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el) act(el.getAttribute('data-act'), el);
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-form')) {
      var k = t.getAttribute('data-form');
      form[k] = t.type === 'checkbox' ? t.checked : t.value;
      if (k === 'qty') {
        var btn = document.querySelector('[data-act=add-part]');
        if (btn) btn.textContent = '+ Add part' + (num(t.value, 1) > 1 ? 's' : '');
      }
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target, v = t.value;
    if (t.hasAttribute('data-draft')) {
      draft[t.getAttribute('data-draft')] = num(v, 1);
      var pr = presetFor(draft.w, draft.h);
      draft.k = pr ? pr.k : 'custom';
      return renderSide();
    }
    if (t.hasAttribute('data-def')) {
      return mutate(function () { S.defaults[t.getAttribute('data-def')] = num(v, 0); }, false);
    }
    if (t.hasAttribute('data-sf')) {
      var sh = sheetById(+t.getAttribute('data-id')), f = t.getAttribute('data-sf');
      return mutate(function () {
        sh.auto = false;
        if (f === 'name') sh.name = v.trim();
        else if (f === 'preset') {
          var pr2 = PRESETS.filter(function (x) { return x.k === v; })[0];
          if (pr2) { var port = sh.h > sh.w; sh.w = port ? pr2.h : pr2.w; sh.h = port ? pr2.w : pr2.h; }
        } else if (f === 'w' || f === 'h') sh[f] = num(v, 1);
        else sh[f] = num(v, 0);
      });
    }
    if (t.hasAttribute('data-pf')) {
      var p = partById(sel), k = t.getAttribute('data-pf');
      if (!p) return;
      return mutate(function () {
        if (k === 'name') p.name = v.trim() || p.name;
        else if (k === 'sheet') p.sheetId = v === '' ? null : +v;
        else p[k] = num(v, 0.1);
      });
    }
    if (t.id === 'importFile' && t.files[0]) {
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var j = JSON.parse(rd.result);
          if (!valid(j)) throw new Error('bad');
          pushUndo(); S = j; sel = null; layout(); save(); render(); toast('Project opened');
        } catch (err) { toast('That file isn’t a Sheet Nest project'); }
        t.value = '';
      };
      rd.readAsText(t.files[0]);
    }
  });
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && tag !== 'input') { e.preventDefault(); return undo(); }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (e.key === 'Enter' && e.target.closest('#side') && e.target.hasAttribute('data-form')) { e.preventDefault(); addParts(); }
      return;
    }
    if (sel == null) return;
    var k = e.key.toLowerCase();
    if (k === 'r') act('rot', e.target);
    else if (k === 'd') act('dup', e.target);
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); act('del', e.target); }
    else if (k === 'escape') act('desel', e.target);
  });

  /* ---------- boot ---------- */
  if (!load()) example();
  render();

  function netStatus() { $('#net').textContent = navigator.onLine ? '' : '· offline'; }
  window.addEventListener('online', netStatus);
  window.addEventListener('offline', netStatus);
  netStatus();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache unavailable */ });
  }
})();
