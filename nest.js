/* Sheet Nest — packing engine (no dependencies, works offline).
 * Coordinates are millimetres with the origin at the sheet's bottom-left corner.
 * Item input:  { id, w, h, canRot }   (w/h = current footprint)
 * Placement:   { id, x, y, w, h, flip } (flip = rotated 90° relative to input footprint)
 */
(function (g) {
  'use strict';
  var EPS = 1e-6;
  var HEURS = ['bl', 'bssf', 'baf', 'cp'];
  var SORTS = {
    area: function (a, b) { return b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h); },
    maxside: function (a, b) { return Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h; },
    minside: function (a, b) { return Math.min(b.w, b.h) - Math.min(a.w, a.h) || b.w * b.h - a.w * a.h; },
    perim: function (a, b) { return (b.w + b.h) - (a.w + a.h); },
    width: function (a, b) { return b.w - a.w || b.h - a.h; },
    height: function (a, b) { return b.h - a.h || b.w - a.w; }
  };

  function cmp(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] < b[i] - EPS) return -1;
      if (a[i] > b[i] + EPS) return 1;
    }
    return 0;
  }
  function inside(a, b) {
    return a.x >= b.x - EPS && a.y >= b.y - EPS &&
      a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS;
  }
  function orientations(it) {
    var o = [{ w: it.w, h: it.h, flip: false }];
    if (it.canRot && Math.abs(it.w - it.h) > EPS) o.push({ w: it.h, h: it.w, flip: true });
    return o;
  }
  function overlap1(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }
  function contact(x, y, w, h, placed, W, H) {
    var c = 0;
    if (x < EPS) c += h;
    if (Math.abs(x + w - W) < EPS) c += h;
    if (y < EPS) c += w;
    if (Math.abs(y + h - H) < EPS) c += w;
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      if (Math.abs(p.x - (x + w)) < EPS || Math.abs(p.x + p.w - x) < EPS) c += overlap1(y, y + h, p.y, p.y + p.h);
      if (Math.abs(p.y - (y + h)) < EPS || Math.abs(p.y + p.h - y) < EPS) c += overlap1(x, x + w, p.x, p.x + p.w);
    }
    return c;
  }
  function score(heur, f, w, h, placed, W, H) {
    var dw = f.w - w, dh = f.h - h;
    switch (heur) {
      case 'bssf': return [Math.min(dw, dh), Math.max(dw, dh)];
      case 'baf': return [f.w * f.h - w * h, Math.min(dw, dh)];
      case 'cp': return [-contact(f.x, f.y, w, h, placed, W, H), f.y, f.x];
      default: return [f.y + h, f.x]; // bottom-left
    }
  }

  // Subtract rectangle r from a list of maximal free rectangles.
  function split(free, r) {
    var out = [];
    for (var i = 0; i < free.length; i++) {
      var f = free[i];
      if (r.x >= f.x + f.w - EPS || r.x + r.w <= f.x + EPS || r.y >= f.y + f.h - EPS || r.y + r.h <= f.y + EPS) {
        out.push(f); continue;
      }
      if (r.x > f.x + EPS) out.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w - EPS) out.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - (r.x + r.w), h: f.h });
      if (r.y > f.y + EPS) out.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h - EPS) out.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - (r.y + r.h) });
    }
    var res = [];
    for (var a = 0; a < out.length; a++) {
      var drop = false;
      for (var b = 0; b < out.length; b++) {
        if (a !== b && inside(out[a], out[b]) && (!inside(out[b], out[a]) || b < a)) { drop = true; break; }
      }
      if (!drop) res.push(out[a]);
    }
    return res;
  }

  function maxRects(W, H, items, heur) {
    var free = [{ x: 0, y: 0, w: W, h: H }], placed = [], unplaced = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], best = null, os = orientations(it);
      for (var k = 0; k < os.length; k++) {
        var o = os[k];
        for (var j = 0; j < free.length; j++) {
          var f = free[j];
          if (o.w <= f.w + EPS && o.h <= f.h + EPS) {
            var s = score(heur, f, o.w, o.h, placed, W, H);
            if (!best || cmp(s, best.s) < 0) best = { s: s, x: f.x, y: f.y, w: o.w, h: o.h, flip: o.flip };
          }
        }
      }
      if (!best) { unplaced.push(it); continue; }
      var r = { id: it.id, x: best.x, y: best.y, w: best.w, h: best.h, flip: best.flip };
      placed.push(r);
      free = split(free, r);
    }
    return { placed: placed, unplaced: unplaced, free: free };
  }

  function evaluate(r, mode, s) {
    var area = 0, bx = 0, by = 0, big = 0;
    r.placed.forEach(function (p) {
      area += Math.max(0, p.w - s) * Math.max(0, p.h - s);
      bx = Math.max(bx, p.x + p.w); by = Math.max(by, p.y + p.h);
    });
    r.free.forEach(function (f) { big = Math.max(big, f.w * f.h); });
    if (mode === 'waste') return [-area, bx * by, -big];
    return [-area, -big, bx * by]; // offcut + spread (spread re-arranges afterwards)
  }

  // Spacing helper: equal gaps everywhere when possible, otherwise keep the
  // minimum part gap and centre the group.
  function dist(free, n, s) {
    var g = free / (n + 1);
    if (g >= s - EPS) return { edge: g, gap: g };
    return { gap: s, edge: Math.max(0, (free - (n - 1) * s) / 2) };
  }

  function shelfSpread(sheet, items) {
    var m = +sheet.margin || 0, s = +sheet.spacing || 0;
    var AW = sheet.w - 2 * m, AH = sheet.h - 2 * m, best = null;
    ['asis', 'land', 'port'].forEach(function (strat) {
      var its = items.map(function (it) {
        var w = it.w, h = it.h, flip = false;
        if (it.canRot && ((strat === 'land' && h > w) || (strat === 'port' && w > h))) { w = it.h; h = it.w; flip = true; }
        return { id: it.id, w: w, h: h, flip: flip };
      });
      its.sort(function (a, b) { return b.h - a.h || b.w - a.w; });
      var rows = [];
      for (var i = 0; i < its.length; i++) {
        var it = its[i];
        if (it.w > AW + EPS || it.h > AH + EPS) return;
        var row = null;
        for (var r = 0; r < rows.length; r++) if (rows[r].used + s + it.w <= AW + EPS) { row = rows[r]; break; }
        if (row) { row.items.push(it); row.used += s + it.w; }
        else rows.push({ h: it.h, items: [it], used: it.w });
      }
      var sumH = rows.reduce(function (a, r) { return a + r.h; }, 0);
      if (sumH + (rows.length - 1) * s > AH + EPS) return;
      var dv = dist(AH - sumH, rows.length, s), y = m + dv.edge, minGap = Math.min(dv.gap, dv.edge + m), placed = [];
      rows.forEach(function (row) {
        var sw = row.items.reduce(function (a, it) { return a + it.w; }, 0);
        var dh = dist(AW - sw, row.items.length, s), x = m + dh.edge;
        minGap = Math.min(minGap, dh.gap);
        row.items.forEach(function (it) {
          placed.push({ id: it.id, x: x, y: y + (row.h - it.h) / 2, w: it.w, h: it.h, flip: it.flip });
          x += it.w + dh.gap;
        });
        y += row.h + dv.gap;
      });
      var sc = [-minGap, rows.length];
      if (!best || cmp(sc, best.sc) < 0) best = { sc: sc, placed: placed };
    });
    return best ? best.placed : null;
  }

  // Largest reusable rectangle left on the sheet (may run to the sheet edge).
  function largestOffcut(sheet, placed) {
    if (!placed.length) return null;
    var k = (+sheet.spacing || 0) / 2;
    var free = [{ x: 0, y: 0, w: sheet.w, h: sheet.h }];
    placed.forEach(function (p) {
      free = split(free, { x: p.x - k, y: p.y - k, w: p.w + 2 * k, h: p.h + 2 * k });
    });
    var best = null;
    free.forEach(function (f) {
      var x0 = Math.max(0, f.x), y0 = Math.max(0, f.y);
      var x1 = Math.min(sheet.w, f.x + f.w), y1 = Math.min(sheet.h, f.y + f.h);
      var r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      if (r.w > EPS && r.h > EPS && (!best || r.w * r.h > best.w * best.h)) best = r;
    });
    return best;
  }

  // opts.tol (offcut mode only): accept up to this fraction less filled area on
  // this sheet if it leaves a larger reusable offcut.
  function packSheet(sheet, items, mode, opts) {
    var m = +sheet.margin || 0, s = +sheet.spacing || 0, tol = (opts && opts.tol) || 0;
    var W = sheet.w - 2 * m + s, H = sheet.h - 2 * m + s;
    var res = { placed: [], overflow: items.slice(), offcut: null, spread: false };
    if (!items.length || W <= EPS || H <= EPS) return res;
    var infl = items.map(function (it) { return { id: it.id, w: it.w + s, h: it.h + s, canRot: it.canRot }; });
    var best = null, all = [];
    Object.keys(SORTS).forEach(function (k) {
      var arr = infl.slice().sort(SORTS[k]);
      HEURS.forEach(function (h) {
        var r = maxRects(W, H, arr, h), sc = evaluate(r, mode, s);
        all.push({ r: r, sc: sc });
        if (!best || cmp(sc, best.sc) < 0) best = { r: r, sc: sc };
      });
    });
    var toReal = function (r) {
      return r.placed.map(function (p) { return { id: p.id, x: m + p.x, y: m + p.y, w: p.w - s, h: p.h - s, flip: p.flip }; });
    };
    if (mode === 'offcut' && tol > 0) {
      var floor = -best.sc[0] * (1 - tol), pick = null;
      all.forEach(function (c) {
        if (-c.sc[0] < floor - EPS) return;
        var o = largestOffcut(sheet, toReal(c.r)), key = [-(o ? o.w * o.h : 0), c.sc[0]];
        if (!pick || cmp(key, pick.key) < 0) pick = { r: c.r, key: key };
      });
      if (pick) best = { r: pick.r };
    }
    var placed = toReal(best.r);
    var ids = {};
    placed.forEach(function (p) { ids[p.id] = 1; });
    res.overflow = items.filter(function (it) { return !ids[it.id]; });
    if (mode === 'spread' && placed.length) {
      var sp = shelfSpread(sheet, items.filter(function (it) { return ids[it.id]; }));
      if (sp) { placed = sp; res.spread = true; }
    }
    res.placed = placed;
    res.offcut = largestOffcut(sheet, placed);
    return res;
  }

  var Nest = { packSheet: packSheet, maxRects: maxRects, shelfSpread: shelfSpread, largestOffcut: largestOffcut };
  g.Nest = Nest;
  if (typeof module !== 'undefined' && module.exports) module.exports = Nest;
})(typeof self !== 'undefined' ? self : this);
