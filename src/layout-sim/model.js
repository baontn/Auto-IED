/* model.js: layout state, geometry (cm, plan y points down), paste parser, ergonomic/clearance checks, undo, save/open. */
var ERG_DEF = {
  chairGap: 15,   // table front edge -> chair front edge
  chairW: 45, chairD: 45, seatH: 46,
  opDepth: 75,    // operator zone measured from the table front edge (chair + body + leg room)
  opW: 70,        // width of the operator zone (elbow room)
  aisle: 60,      // free passage behind the operator zone (warning when blocked)
  tableH: 75,     // work surface height (3D)
  rowGap: 20,     // gap between two rows created by "paste"
  colGap: 0,      // gap between two machines in a row created by "paste"
  emptyPitch: 107,// width of an empty cell in the pasted grid
  snap: 5
};
var LINE_DEF = { units: 17, unit: 107, tableW: 30, start: 120, end: 30 };
var ST = { line: { name: '', length: 2400, width: 600, fixed: false }, erg: Object.assign({}, ERG_DEF), items: [], seq: 1 };
var SEL = [];            // selected ids (not saved)
var UNDO = [], REDO = [];
var ISSUES = [];         // last check result

function uid() { return 'i' + (ST.seq++); }
function itemById(id) { for (var i = 0; i < ST.items.length; i++) if (ST.items[i].id === id) return ST.items[i]; return null; }
function selItems() { return ST.items.filter(function (it) { return SEL.indexOf(it.id) >= 0; }); }
function itemDim(it) { return it.kind === 'mc' ? dimOf(it.code) : { L: it.L, W: it.W, known: true }; }

/* ---------- geometry ---------- */
function rotPt(it, lx, ly) {
  var a = (it.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: it.x + lx * c - ly * s, y: it.y + lx * s + ly * c };
}
function obb(it, lcx, lcy, hx, hy) { var p = rotPt(it, lcx, lcy); return { cx: p.x, cy: p.y, hx: hx, hy: hy, a: (it.rot || 0) * Math.PI / 180 }; }
/* shapes of an item: table (always), operator zone, chair and the aisle strip behind the operator (machines only) */
function shapes(it) {
  var d = itemDim(it), e = ST.erg, r = { table: obb(it, 0, 0, d.L / 2, d.W / 2), L: d.L, W: d.W };
  if (it.kind === 'mc') {
    var sx = seatOf(famOf(it.code)) * d.L;
    sx = Math.max(-d.L / 2 + e.opW / 2, Math.min(d.L / 2 - e.opW / 2, sx));
    if (d.L < e.opW) sx = 0;
    r.seatX = sx;
    r.front = rotPt(it, sx, d.W / 2);
    if (it.noOp) return r;                    // station without its own operator (one worker runs two machines)
    r.zone = obb(it, sx, d.W / 2 + e.opDepth / 2, e.opW / 2, e.opDepth / 2);
    r.chair = rotPt(it, sx, d.W / 2 + e.chairGap + e.chairD / 2);
    r.aisle = e.aisle > 0 ? obb(it, sx, d.W / 2 + e.opDepth + e.aisle / 2, e.opW / 2, e.aisle / 2) : null;
  }
  return r;
}
function corners(o) {
  var c = Math.cos(o.a), s = Math.sin(o.a), out = [];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (k) { var lx = k[0] * o.hx, ly = k[1] * o.hy; out.push({ x: o.cx + lx * c - ly * s, y: o.cy + lx * s + ly * c }); });
  return out;
}
/* penetration depth of two oriented boxes (separating axis test), 0 when apart */
function overlap(a, b) {
  var ca = corners(a), cb = corners(b), best = Infinity;
  var axes = [a.a, a.a + Math.PI / 2, b.a, b.a + Math.PI / 2];
  for (var i = 0; i < 4; i++) {
    var ax = Math.cos(axes[i]), ay = Math.sin(axes[i]);
    var pa = ca.map(function (p) { return p.x * ax + p.y * ay; }), pb = cb.map(function (p) { return p.x * ax + p.y * ay; });
    var d = Math.min(Math.max.apply(null, pa), Math.max.apply(null, pb)) - Math.max(Math.min.apply(null, pa), Math.min.apply(null, pb));
    if (d <= 0) return 0;
    best = Math.min(best, d);
  }
  return best;
}
function outside(o) {
  var L = ST.line.length, W = ST.line.width;
  return corners(o).some(function (p) { return p.x < -0.5 || p.y < -0.5 || p.x > L + 0.5 || p.y > W + 0.5; });
}
function extentX(it) { var d = itemDim(it), a = (it.rot || 0) * Math.PI / 180; return Math.abs(d.L * Math.cos(a)) + Math.abs(d.W * Math.sin(a)); }
function bbox(items) {
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  items.forEach(function (it) {
    var s = shapes(it);
    [s.table, s.zone].forEach(function (o) { if (!o) return; corners(o).forEach(function (p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }); });
  });
  return isFinite(x0) ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null;
}

/* ---------- checks ---------- */
var TOL = 0.5;  // cm, touching is allowed
function runChecks() {
  var out = [], S = ST.items.map(function (it) { return { it: it, s: shapes(it) }; });
  for (var i = 0; i < S.length; i++) {
    var A = S[i];
    if (A.it.kind === 'mc' && !dimOf(A.it.code).known) out.push({ sev: 'warn', ids: [A.it.id], k: 'isUnknown', a: [A.it.code] });
    if (outside(A.s.table) || (A.s.zone && outside(A.s.zone))) out.push({ sev: 'bad', ids: [A.it.id], k: 'isOut', a: [label(A.it)] });
    for (var j = i + 1; j < S.length; j++) {
      var B = S[j];
      if (overlap(A.s.table, B.s.table) > TOL) out.push({ sev: 'bad', ids: [A.it.id, B.it.id], k: 'isOverlap', a: [label(A.it), label(B.it)] });
      [[A, B], [B, A]].forEach(function (p) {
        var X = p[0], Y = p[1];
        if (X.s.zone && overlap(X.s.zone, Y.s.table) > TOL) out.push({ sev: 'bad', ids: [X.it.id, Y.it.id], k: 'isSeat', a: [label(X.it), label(Y.it)] });
        if (X.s.aisle && (overlap(X.s.aisle, Y.s.table) > TOL || (Y.s.zone && overlap(X.s.aisle, Y.s.zone) > TOL)))
          out.push({ sev: 'warn', ids: [X.it.id, Y.it.id], k: 'isAisle', a: [label(X.it), ST.erg.aisle, label(Y.it)] });
      });
      if (A.s.zone && B.s.zone && overlap(A.s.zone, B.s.zone) > TOL) out.push({ sev: 'bad', ids: [A.it.id, B.it.id], k: 'isSeat2', a: [label(A.it), label(B.it)] });
    }
  }
  ISSUES = out;
  return out;
}
function issueIds(sev) { var m = {}; ISSUES.forEach(function (x) { if (!sev || x.sev === sev) x.ids.forEach(function (id) { m[id] = 1; }); }); return m; }
function label(it) { return it.kind === 'mc' ? (it.code + (it.op ? ' (' + it.op + ')' : '')) : (it.name || '?'); }

/* ---------- flow (operation order) ---------- */
function flowPath() {
  var mc = ST.items.filter(function (it) { return it.kind === 'mc' && it.op !== '' && !isNaN(parseFloat(it.op)); });
  mc.sort(function (a, b) { return parseFloat(a.op) - parseFloat(b.op) || a.x - b.x; });
  var pts = mc.map(function (it) { var s = shapes(it); return s.chair || s.front; }), dist = 0;
  for (var i = 1; i < pts.length; i++) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts: pts, dist: dist, n: mc.length };
}

/* ---------- paste from Excel ---------- */
function cellKind(s) {
  if (!s) return '';
  if (LIB.codes[normCode(s)]) return 'code';
  if (/^\d+(\.\d+)?[a-z]?$/i.test(s) && s.length <= 5 && !/^\d{4}$/.test(s)) return 'num';
  if (isCode(s)) return 'code';
  return 'txt';
}
function parsePaste(text) {
  var rows = String(text || '').replace(/\r/g, '').split('\n').map(function (r) { return r.split('\t').map(function (c) { return c.replace(/\s+/g, ' ').trim(); }); });
  var info = rows.map(function (r) {
    var k = { code: 0, num: 0, txt: 0, n: 0 };
    r.forEach(function (c) { var t = cellKind(c); if (t) { k[t]++; k.n++; } });
    k.type = !k.n ? 'empty' : (k.code && k.code >= k.n / 2 ? 'code' : (k.num && k.num >= k.n / 2 ? 'num' : 'txt'));
    return k;
  });
  function near(i, dir) { for (var j = i + dir; j >= 0 && j < rows.length; j += dir) if (info[j].type !== 'empty') return j; return -1; }
  var out = [], nCols = 0, codeRows = [];
  info.forEach(function (k, i) { if (k.type === 'code') codeRows.push(i); });
  codeRows.forEach(function (i, idx) {
    var up = near(i, -1), dn = near(i, 1), lab = -1, side = null;
    var upOk = up >= 0 && info[up].type !== 'code', dnOk = dn >= 0 && info[dn].type !== 'code';
    if (upOk && dnOk) {   // both sides have numbers: the row nearer to another code row belongs to that row
      var upShared = near(up, -1) >= 0 && info[near(up, -1)].type === 'code', dnShared = near(dn, 1) >= 0 && info[near(dn, 1)].type === 'code';
      if (upShared && !dnShared) { lab = dn; side = 'bottom'; } else { lab = up; side = 'top'; }
    } else if (upOk) { lab = up; side = 'top'; } else if (dnOk) { lab = dn; side = 'bottom'; }
    var cells = [];
    rows[i].forEach(function (c, col) {
      if (cellKind(c) !== 'code') return;
      cells.push({ col: col, code: normCode(c), op: lab >= 0 ? (rows[lab][col] || '') : '' });
      nCols = Math.max(nCols, col + 1);
    });
    out.push({ cells: cells, side: side || (idx < codeRows.length / 2 ? 'top' : 'bottom'), sideFound: !!side });
  });
  return { rows: out, nCols: nCols, nMc: out.reduce(function (s, r) { return s + r.cells.length; }, 0) };
}
/* turn a parsed grid into placed items. opt: {addInput, x0, y0} */
function buildFromPaste(p, opt) {
  var e = ST.erg, items = [], pitch = [];
  for (var c = 0; c < p.nCols; c++) {
    var m = 0;
    p.rows.forEach(function (r) { r.cells.forEach(function (x) { if (x.col === c) m = Math.max(m, dimOf(x.code).L); }); });
    pitch.push(m || e.emptyPitch);
  }
  var firstCol = Math.min.apply(null, p.rows.map(function (r) { return r.cells.length ? r.cells[0].col : Infinity; }).concat([p.nCols]));
  // columns left of the first machine column (empty in every row, e.g. a label column) take no space
  var inputL = 60, x0 = opt.x0 + (opt.addInput ? inputL + 40 : 0), xs = [], acc = x0;
  for (c = firstCol; c < p.nCols; c++) { xs[c] = acc + pitch[c] / 2; acc += pitch[c] + e.colGap; }
  var y = opt.y0, ct = opt.center;
  if (ct) {   // a central table: columns start at its left end, first row above it, second row below it (backs against the table)
    var shift = (ct.x - ct.L / 2) - x0;
    for (c = firstCol; c < p.nCols; c++) xs[c] += shift;
    var tTop = ct.y - ct.W / 2, tBot = ct.y + ct.W / 2, ys = [];
    p.rows.forEach(function (r, k) {
      if (k > 1) return;
      r.cells.forEach(function (x) {
        var W = dimOf(x.code).W, top = r.side === 'top', yy;
        if (k === 0) yy = top ? tTop - W / 2 : tTop - e.opDepth - W / 2; else yy = top ? tBot + e.opDepth + W / 2 : tBot + W / 2;
        items.push({ id: uid(), kind: 'mc', code: x.code, op: x.op, x: n1(xs[x.col]), y: n1(yy), rot: top ? 180 : 0 });
        ys.push(yy - W / 2 - (top ? e.opDepth : 0), yy + W / 2 + (top ? 0 : e.opDepth));
      });
    });
    y = (ys.length ? Math.max.apply(null, ys) : tBot) + e.rowGap;
    if (opt.addInput && items.length) {
      var y0i = Math.min.apply(null, ys), hh = Math.max.apply(null, ys) - y0i;
      items.unshift({ id: uid(), kind: 'obj', name: 'Input', L: inputL, W: Math.round(hh), H: 75, x: ct.x - ct.L / 2 - 40 - inputL / 2, y: y0i + hh / 2, rot: 0, color: '#8fb3d9' });
    }
    p = { rows: p.rows.slice(2), nCols: p.nCols };
    opt = Object.assign({}, opt, { addInput: false });
  }
  p.rows.forEach(function (r) {
    var Wmax = 0; r.cells.forEach(function (x) { Wmax = Math.max(Wmax, dimOf(x.code).W); });
    if (!Wmax) return;
    var top = r.side === 'top', front = top ? y + e.opDepth : y + Wmax;
    r.cells.forEach(function (x) {
      var W = dimOf(x.code).W;
      items.push({ id: uid(), kind: 'mc', code: x.code, op: x.op, x: n1(xs[x.col]), y: top ? front + W / 2 : front - W / 2, rot: top ? 180 : 0 });
    });
    y = (top ? front + Wmax : front + e.opDepth) + e.rowGap;
  });
  if (opt.addInput && items.length) {
    var h = y - e.rowGap - opt.y0;
    if (h <= 0) return items;
    items.unshift({ id: uid(), kind: 'obj', name: 'Input', L: inputL, W: Math.round(h), H: 75, x: opt.x0 + inputL / 2, y: opt.y0 + h / 2, rot: 0, color: '#8fb3d9' });
  }
  return items;
}

/* ---------- line set-up in standard machine units ---------- */
function centerTable() { for (var i = 0; i < ST.items.length; i++) if (ST.items[i].role === 'center') return ST.items[i]; return null; }
function lineAutoWidth(tableW) { var e = ST.erg; return Math.ceil(tableW + 2 * (DEF_DIM.W + 1 + e.opDepth + Math.max(e.aisle, 40))); }
/* o = {name, units, unit, tableW, start, end, width}: line length = start + units x unit + end, central table units x unit long */
function setupLine(o) {
  var L = Math.round(o.start + o.units * o.unit + o.end), W = Math.round(o.width || lineAutoWidth(o.tableW));
  var dx = 0, dy = 0, c = centerTable(), nx = o.start + o.units * o.unit / 2, ny = W / 2;
  if (c) { dx = nx - c.x; dy = ny - c.y; }
  ST.line = { name: o.name || '', length: L, width: W, fixed: true, units: o.units, unit: o.unit, tableW: o.tableW, start: o.start, end: o.end };
  if (c) ST.items.forEach(function (it) { it.x = n1(it.x + dx); it.y = n1(it.y + dy); });   // keep machines placed around the table
  else { c = { id: uid(), kind: 'obj', role: 'center', name: t('centerTable'), H: 75, rot: 0, color: '#d9cdb0' }; ST.items.unshift(c); }
  c.L = o.units * o.unit; c.W = o.tableW; c.x = nx; c.y = ny;
}
/* operators on/off for the machines whose operation is in the list ("36, 37+38") */
function opList(txt) { return String(txt || '').split(/[\s,;+\/]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
function setOperatorByOps(txt, on) {
  var ops = opList(txt), n = 0;
  ST.items.forEach(function (it) { if (it.kind === 'mc' && ops.indexOf(String(it.op).trim()) >= 0) { if (on) delete it.noOp; else it.noOp = true; n++; } });
  return n;
}
/* ---------- undo / persistence ---------- */
function snap() { return JSON.stringify({ line: ST.line, erg: ST.erg, items: ST.items, seq: ST.seq }); }
function restore(s) { var o = JSON.parse(s); ST.line = o.line; ST.erg = Object.assign({}, ERG_DEF, o.erg || {}); ST.items = o.items || []; ST.seq = o.seq || 1; }
var LAST = null;
function commit() {         // call after every finished change
  var s = snap();
  if (LAST !== null && s !== LAST) { UNDO.push(LAST); if (UNDO.length > 150) UNDO.shift(); REDO = []; }
  LAST = s;
  try { localStorage.setItem('ls_work', s); } catch (e) {}
}
function undo() { if (!UNDO.length) return false; REDO.push(LAST); LAST = UNDO.pop(); restore(LAST); SEL = SEL.filter(itemById); try { localStorage.setItem('ls_work', LAST); } catch (e) {} return true; }
function redo() { if (!REDO.length) return false; UNDO.push(LAST); LAST = REDO.pop(); restore(LAST); SEL = SEL.filter(itemById); try { localStorage.setItem('ls_work', LAST); } catch (e) {} return true; }
function fileJson() {
  // the codes' sizes are written into the file so that it opens the same on a PC without the library
  var used = {}; ST.items.forEach(function (it) { if (it.kind === 'mc') { var d = dimOf(it.code); used[it.code] = { L: d.L, W: d.W, fam: famOf(it.code) }; } });
  return JSON.stringify({ app: 'layoutsim', version: 1, savedAt: new Date().toISOString(), line: ST.line, erg: ST.erg, items: ST.items, codes: used }, null, 1);
}
function openJson(txt) {
  var o = JSON.parse(txt);
  if (o.app !== 'layoutsim') throw new Error('not a layout file');
  ST.line = Object.assign({ name: '', length: 2400, width: 600, fixed: true }, o.line); ST.erg = Object.assign({}, ERG_DEF, o.erg || {}); ST.items = o.items || [];
  ST.seq = 1; ST.items.forEach(function (it) { var n = parseInt(String(it.id).slice(1), 10); if (n >= ST.seq) ST.seq = n + 1; });
  var added = 0;   // codes unknown on this PC: take the size stored in the file
  Object.keys(o.codes || {}).forEach(function (c) { if (!LIB.codes[c]) { LIB.codes[c] = { code: c, en: '', vn: '', L: o.codes[c].L, W: o.codes[c].W, custom: true, fromFile: true }; added++; } });
  if (added) libSave();
  SEL = [];
}
