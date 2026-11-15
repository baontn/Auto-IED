/* model.js: layout state, geometry (cm, plan y points down), paste parser, ergonomic/clearance checks, undo, save/open. */
var ERG_DEF = {
  chairGap: 15,   // table front edge -> chair front edge
  chairW: 45, chairD: 45, seatH: 46,
  standDepth: 80, // standing operator area from the table edge (anti-fatigue mat + step back)
  standW: 90,     // standing area width (mat 90 cm)
  standGap: 30,   // table edge -> standing operator's body centre
  opDepth: 75,    // operator zone measured from the table front edge (chair + body + leg room)
  opW: 70,        // width of the operator zone (elbow room)
  aisle: 60,      // free passage behind the operator zone (warning when blocked)
  tableH: 75,     // work surface height (3D)
  rowGap: 20,     // gap between two rows created by "paste"
  colGap: 0,      // gap between two machines in a row created by "paste"
  emptyPitch: 107,// width of an empty cell in the pasted grid
  snap: 5
};
var LINE_DEF = { units: 17, unit: 107, tableW: 30, start: 90, gap: 30, end: 30 };   // start = length of the input area in front of the line
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
/* the central table is locked unless unlocked in the side panel (it.lock === false) */
function isLocked(it) { return it.lock != null ? !!it.lock : it.role === 'center'; }
/* standing operator: per machine (it.stand), default standing for heat presses and ironing */
var STAND_FAMS = { press: 1, iron: 1 };
function isStanding(it) { return it.stand != null ? !!it.stand : !!STAND_FAMS[famOf(it.code)]; }
/* all machines standing <-> sitting; returns the new state */
function standAll() {
  var mc = ST.items.filter(function (i) { return i.kind === 'mc'; }), toStand = mc.some(function (i) { return !isStanding(i); });
  mc.forEach(function (i) { i.stand = toStand; });
  return toStand;
}
function standDefault() { ST.items.forEach(function (i) { delete i.stand; }); }
/* shapes of an item: table (always), operator zone, chair and the aisle strip behind the operator (machines only) */
function shapes(it) {
  var d = itemDim(it), e = ST.erg, r = { table: obb(it, 0, 0, d.L / 2, d.W / 2), L: d.L, W: d.W };
  if (it.kind === 'mc') {
    var st = isStanding(it), zw = st ? e.standW : e.opW, zd = st ? e.standDepth : e.opDepth;
    var sx = seatOf(famOf(it.code)) * d.L;
    sx = Math.max(-d.L / 2 + zw / 2, Math.min(d.L / 2 - zw / 2, sx));
    if (d.L < zw) sx = 0;
    r.seatX = sx; r.stand = st; r.zw = zw; r.zd = zd;
    r.front = rotPt(it, sx, d.W / 2);
    if (it.noOp) return r;                    // station without its own operator (one worker runs two machines)
    r.zone = obb(it, sx, d.W / 2 + zd / 2, zw / 2, zd / 2);
    r.chair = rotPt(it, sx, d.W / 2 + (st ? e.standGap : e.chairGap + e.chairD / 2));   // operator position (seat centre or standing spot)
    r.aisle = e.aisle > 0 && (it.rot || 0) % 180 === 0 ? obb(it, sx, d.W / 2 + zd + e.aisle / 2, zw / 2, e.aisle / 2) : null;   // a machine turned across the row: the operator sits between machines, no aisle behind
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
function outside(o) {   // every corner must be inside the main line or the branch line (not in the walkway)
  var zs = lineZones().filter(function (z) { return z.id !== 'walk'; });
  return corners(o).some(function (p) { return !zs.some(function (z) { return p.x >= z.x - 0.5 && p.y >= z.y - 0.5 && p.x <= z.x + z.L + 0.5 && p.y <= z.y + z.W + 0.5; }); });
}
function walkObb() { var w = zoneById('walk'); return w ? { cx: w.x + w.L / 2, cy: w.y + w.W / 2, hx: w.L / 2, hy: w.W / 2, a: 0 } : null; }
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
    var wo = walkObb();
    if (wo && (overlap(wo, A.s.table) > TOL || (A.s.zone && overlap(wo, A.s.zone) > TOL))) out.push({ sev: 'bad', ids: [A.it.id], k: 'isWalk', a: [label(A.it), zoneById('walk').W] });
    else if (outside(A.s.table) || (A.s.zone && outside(A.s.zone))) out.push({ sev: 'bad', ids: [A.it.id], k: 'isOut', a: [label(A.it)] });
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
/* turn parsed rows into placed items.
   p.rows[i] = {cells:[{col, code, op, side?, x?}], side, zone?}: x (cm, centre, from a drawing) or col (text grid) gives the order/position along the row;
   rows of a line that has a central table go first above it, then below it (backs against the table), further rows below.
   opt: {addInput, x0, y0, centers: {main: item, branch: item}} */
function buildFromPaste(p, opt) {
  var e = ST.erg, items = [];
  // positions along the rows, per line: from the drawing (cells carry x) or from the text grid columns
  var groups = {};
  p.rows.forEach(function (r) { var z = r.zone || 'main'; (groups[z] = groups[z] || []).push(r); });
  Object.keys(groups).forEach(function (z) {
    var rows = groups[z];
    if (rows.some(function (r) { return r.cells.some(function (c) { return c.x != null; }); })) { rows.forEach(function (r) { r.cells.forEach(function (x) { x.rx = x.x != null ? x.x : x.col * DEF_DIM.L; }); }); return; }
    var nCols = 0; rows.forEach(function (r) { r.cells.forEach(function (x) { nCols = Math.max(nCols, x.col + 1); }); });
    var pitch = [];
    for (var c = 0; c < nCols; c++) {   // text grid: pitch = longest machine of the column (empty column = one standard cell)
      var m = 0; rows.forEach(function (r) { r.cells.forEach(function (x) { if (x.col === c) m = Math.max(m, dimOf(x.code).L); }); });
      pitch.push(m || e.emptyPitch);
    }
    var firstCol = Math.min.apply(null, rows.map(function (r) { return r.cells.length ? r.cells[0].col : Infinity; }).concat([nCols]));
    var xs = [], acc = 0;
    for (c = firstCol; c < nCols; c++) { xs[c] = acc + pitch[c] / 2; acc += pitch[c] + e.colGap; }
    rows.forEach(function (r) { r.cells.forEach(function (x) { x.rx = xs[x.col]; }); });
  });
  // real machine lengths: never overlap inside a row
  p.rows.forEach(function (r) {
    r.cells.sort(function (a, b) { return a.rx - b.rx; });
    // a turned machine (operator on its left / right) takes its width plus the operator's place along the row
    var zd = function (c) { return STAND_FAMS[famOf(c.code)] ? e.standDepth : e.opDepth; };
    var lo = function (c) { var d = dimOf(c.code); return c.dir ? d.W / 2 + (c.dir === 'left' ? zd(c) : 0) : d.L / 2; };
    var hi = function (c) { var d = dimOf(c.code); return c.dir ? d.W / 2 + (c.dir === 'right' ? zd(c) : 0) : d.L / 2; };
    for (var i = 1; i < r.cells.length; i++) { var pa = r.cells[i - 1], cu = r.cells[i], mn = pa.rx + hi(pa) + e.colGap + lo(cu); if (cu.rx < mn - 0.5) cu.rx = mn; }
  });
  var inputL = 60, zones = {}, order = [];
  p.rows.forEach(function (r) { var z = r.zone || 'main'; if (!zones[z]) { zones[z] = []; order.push(z); } zones[z].push(r); });
  var yCursor = opt.y0, mainSpan = null;
  order.forEach(function (zid) {
    var rows = zones[zid], ct = opt.centers && opt.centers[zid], x0, ys = [];
    function place(r, yOf, zoneId, yOfT) {
      r.cells.forEach(function (x) {
        if (x.dir) {   // turned 90°: its length across the row, the operator beside it (right: 270°, left: 90°)
          var D = dimOf(x.code).L, yt = yOfT(D);
          items.push({ id: uid(), kind: 'mc', code: x.code, op: x.op, x: n1(x0 + x.rx), y: n1(yt), rot: x.dir === 'right' ? 270 : 90, zone: zoneId === 'main' ? undefined : zoneId });
          ys.push(yt - D / 2, yt + D / 2); return;
        }
        var W = dimOf(x.code).W, top = (x.side || r.side) === 'top', yy = yOf(W, top);
        items.push({ id: uid(), kind: 'mc', code: x.code, op: x.op, x: n1(x0 + x.rx), y: n1(yy), rot: top ? 180 : 0, zone: zoneId === 'main' ? undefined : zoneId });
        ys.push(yy - W / 2 - (top ? e.opDepth : 0), yy + W / 2 + (top ? 0 : e.opDepth));
      });
    }
    function band(r, y) {   // a row without a table: operators on their side, machines lined up on the operator side
      var Wmax = 0, anyTop = false, anyBot = false;
      r.cells.forEach(function (x) { Wmax = Math.max(Wmax, x.dir ? dimOf(x.code).L : dimOf(x.code).W); if ((x.side || r.side) === 'top') anyTop = true; else anyBot = true; });
      var tt = y + (anyTop ? e.opDepth : 0);
      place(r, function (W, top) { return top ? tt + W / 2 : tt + Wmax - W / 2; }, zid, function (D) { return tt + D / 2; });
      return tt + Wmax + (anyBot ? e.opDepth : 0) + e.rowGap;
    }
    if (ct) {
      x0 = ct.x - ct.L / 2;
      var tTop = ct.y - ct.W / 2, tBot = ct.y + ct.W / 2;
      if (rows[0]) place(rows[0], function (W, top) { return top ? tTop - W / 2 : tTop - e.opDepth - W / 2; }, zid, function (D) { return tTop - D / 2; });
      if (rows[1]) place(rows[1], function (W, top) { return top ? tBot + e.opDepth + W / 2 : tBot + W / 2; }, zid, function (D) { return tBot + D / 2; });
      var yy = (ys.length ? Math.max.apply(null, ys) : tBot) + e.rowGap;
      rows.slice(2).forEach(function (r) { yy = band(r, yy); });
    } else {
      x0 = opt.x0 + (opt.addInput && zid === 'main' ? inputL + 40 : 0);
      rows.forEach(function (r) { yCursor = band(r, yCursor); });
    }
    if (zid === 'main' && ys.length) mainSpan = { y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys), x0: x0 };
  });
  if (opt.addInput && mainSpan) {
    var hh = mainSpan.y1 - mainSpan.y0;
    var inp = { id: uid(), kind: 'obj', name: 'Input', L: inputL, W: Math.round(hh), H: 75, x: mainSpan.x0 - 40 - inputL / 2, y: mainSpan.y0 + hh / 2, rot: 0, color: '#8fb3d9' };
    if (opt.centers && zoneById('input')) placeInput(inp, 'main');
    items.unshift(inp);
  }
  return items;
}

/* ---------- line set-up in standard machine units ---------- */
function centerOf(zid) { for (var i = 0; i < ST.items.length; i++) { var it = ST.items[i]; if (it.role === 'center' && (it.zone || 'main') === zid) return it; } return null; }
function centerTable() { return centerOf('main'); }
function lineAutoWidth(tableW) { var e = ST.erg; return Math.ceil(tableW + 2 * (DEF_DIM.W + 1 + e.opDepth + Math.max(e.aisle, 40))); }
/* floor areas: main line, optional branch line and the walkway between them */
function lineZones() { return ST.line.zones || [{ id: 'main', x: 0, y: 0, L: ST.line.length, W: ST.line.width }]; }
function zoneById(id) { return lineZones().filter(function (z) { return z.id === id; })[0] || null; }
/* o = {name, units, unit, tableW, start, gap, end, width, hc, branch: null | {units, unit, tableW, end, width, pos: 'top'|'bottom', walk}}
   0 m = left edge of the central table; line = units x unit + end; the input area (start cm long, same width as the line)
   lies in front of it, gap cm away; a branch line starts at the same 0 m, next to the main line with a walkway between */
function setupLine(o) {
  var inL = Math.max(0, Math.round(o.start != null ? o.start : LINE_DEF.start)), gap = Math.max(0, Math.round(o.gap != null ? o.gap : LINE_DEF.gap));
  var mL = Math.round(o.units * o.unit + o.end), mW = Math.round(o.width || lineAutoWidth(o.tableW)), br = o.branch, bL = 0, bW = 0, walk = 0;
  if (br) { bL = Math.round(br.units * br.unit + br.end); bW = Math.round(br.width || lineAutoWidth(br.tableW)); walk = Math.round(br.walk); }
  var mainY = br && br.pos === 'top' ? bW + walk : 0, brY = br ? (br.pos === 'top' ? 0 : mW + walk) : 0, inX = -(inL + gap);
  var zones = [{ id: 'main', x: 0, y: mainY, L: mL, W: mW }];
  if (inL > 0) zones.push({ id: 'input', x: inX, y: mainY, L: inL, W: mW });
  if (br) {
    var wx0 = inL > 0 ? inX : 0, wx1 = Math.max(mL, bL);
    zones.push({ id: 'walk', x: wx0, y: br.pos === 'top' ? bW : mW, L: wx1 - wx0, W: walk }, { id: 'branch', x: 0, y: brY, L: bL, W: bW });
    if (inL > 0) zones.push({ id: 'inputB', x: inX, y: brY, L: inL, W: bW });
  }
  ST.line = { name: o.name || '', length: Math.max(mL, bL), width: mW + (br ? walk + bW : 0), fixed: true, units: o.units, unit: o.unit, tableW: o.tableW, start: inL, gap: gap, end: o.end, hc: o.hc || 0,
    mainWidth: o.width || 0, zones: zones, branch: br || null, v: 2 };
  function center(zid, x, y, L, W) {
    var c = centerOf(zid), dx = 0, dy = 0;
    if (c) { dx = x - c.x; dy = y - c.y; ST.items.forEach(function (it) { if (it !== c && (it.zone || 'main') === zid && !isInputObj(it)) { it.x = n1(it.x + dx); it.y = n1(it.y + dy); } }); }
    else { c = { id: uid(), kind: 'obj', role: 'center', zone: zid === 'main' ? undefined : zid, name: zid === 'main' ? t('centerTable') : t('centerTableB'), H: 75, rot: 0, color: '#d9cdb0' }; ST.items.unshift(c); }
    c.L = L; c.W = W; c.x = n1(x); c.y = n1(y);
  }
  center('main', o.units * o.unit / 2, mainY + mW / 2, o.units * o.unit, o.tableW);
  if (br) center('branch', br.units * br.unit / 2, brY + bW / 2, br.units * br.unit, br.tableW);
  else { var cb = centerOf('branch'); if (cb) ST.items = ST.items.filter(function (it) { return it !== cb; }); }
  ST.items.filter(isInputObj).forEach(function (it) { placeInput(it, it.zone === 'branch' ? 'branch' : 'main'); });
}
function isInputObj(it) { return it.kind === 'obj' && it.role !== 'center' && /^input$/i.test(String(it.name || '').trim()); }
/* the input table: in the middle of the input area of its line (main / branch) */
function placeInput(it, line) {
  var z = zoneById(line === 'branch' ? 'inputB' : 'input'); if (!z) return false;
  it.L = Math.min(it.L || 60, Math.max(20, z.L - 20)); it.W = Math.min(it.W || 120, Math.max(20, z.W - 20));
  it.x = n1(z.x + z.L / 2); it.y = n1(z.y + z.W / 2); it.rot = 0;
  return true;
}
/* outer extent of all floor areas (the input area lies left of 0 m) */
function lineExtent() {
  var x0 = 0, y0 = 0, x1 = ST.line.length, y1 = ST.line.width;
  lineZones().forEach(function (z) { x0 = Math.min(x0, z.x); y0 = Math.min(y0, z.y); x1 = Math.max(x1, z.x + z.L); y1 = Math.max(y1, z.y + z.W); });
  return { x0: x0, y0: y0, x1: x1, y1: y1 };
}
/* ---------- shared operators: it.by = id of the machine whose operator also runs this one ---------- */
function homeOf(it) { var h = it && it.by ? itemById(it.by) : null; return h && !h.noOp ? h : null; }
function satellitesOf(home) { return ST.items.filter(function (i) { return i.by === home.id && i.noOp; }); }
function opToggleOne(it) { if (it.noOp) { delete it.noOp; delete it.by; } else { it.noOp = true; delete it.by; } ST.items.forEach(function (i) { if (i.by === it.id && it.noOp) delete i.by; }); }
/* one operator for all the given machines (the first one keeps the operator), or split them when they already share one */
/* side of a machine: its line (main / branch) and its side of that line's central table; one person never crosses the table or the walkway */
function sideKey(it) { var z = it.zone === 'branch' ? 'branch' : 'main', ct = centerOf(z); return z + (ct ? (it.y < ct.y ? '|T' : '|B') : ''); }
/* a machine run by a person who sits on the other side of the central table (or on the other line), e.g. after a drag
   or in a project saved before this rule: it gets its own operator back */
function splitCrossLinks() {
  var n = 0;
  ST.items.forEach(function (it) { if (it.kind === 'mc' && it.noOp && it.by) { var h = itemById(it.by); if (h && sideKey(h) !== sideKey(it)) { delete it.noOp; delete it.by; n++; } } });
  return n;
}
function opShare(list) {
  if (list.length < 2) { if (list[0]) opToggleOne(list[0]); return 'one'; }
  if (list.some(function (i) { return sideKey(i) !== sideKey(list[0]); })) return 'cross';
  var home = list.filter(function (i) { return !i.noOp; })[0] || list[0], ids = list.map(function (i) { return i.id; });
  var grouped = list.every(function (i) { return i === home ? !i.noOp : (i.noOp && i.by === home.id); });
  if (grouped) { list.forEach(function (i) { delete i.noOp; delete i.by; }); return 'split'; }
  delete home.noOp; delete home.by;
  list.forEach(function (i) { if (i !== home) { i.noOp = true; i.by = home.id; } });
  ST.items.forEach(function (i) { if (i.by && ids.indexOf(i.by) >= 0 && ids.indexOf(i.id) < 0) i.by = home.id; });
  return 'share';
}
/* operator links to draw: home seat <-> each machine it also runs; far = the tables are not next to each other */
function opLinks() {
  var out = [];
  ST.items.forEach(function (it) {
    var h = homeOf(it); if (!it.noOp || !h) return;
    var a = shapes(h), b = shapes(it), big = { cx: a.table.cx, cy: a.table.cy, hx: a.table.hx + 25, hy: a.table.hy + 25, a: a.table.a };
    var p1 = a.chair || a.front, p2 = b.front;
    // c1/c2: the curved arrow runs behind the operator's back (outer end of the operator zone), away from the central table; back = that side
    var c1 = rotPt(h, a.seatX || 0, a.W / 2 + (a.zd || 60) * 0.9), c2 = rotPt(it, b.seatX || 0, b.W / 2 + (b.zd || 60) * 0.9), ang = (h.rot || 0) * Math.PI / 180;
    out.push({ home: h, sat: it, p1: p1, p2: p2, c1: c1, c2: c2, back: { x: -Math.sin(ang), y: Math.cos(ang) }, far: !(overlap(big, b.table) > 0), dist: Math.hypot(p2.x - p1.x, p2.y - p1.y) });
  });
  return out;
}
/* ---------- undo / persistence ---------- */
function snap() { return JSON.stringify({ line: ST.line, erg: ST.erg, items: ST.items, seq: ST.seq, seqText: ST.seqText || '', info: ST.info || {}, ops: ST.ops || {}, base: ST.base || null, opsOff: ST.opsOff || [] }); }
function restore(s) { var o = JSON.parse(s); ST.line = o.line; ST.erg = Object.assign({}, ERG_DEF, o.erg || {}); ST.items = o.items || []; ST.seq = o.seq || 1; ST.seqText = o.seqText || ''; ST.info = o.info || {}; ST.ops = o.ops || {}; ST.base = o.base || null; ST.opsOff = o.opsOff || []; }
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
  return JSON.stringify({ app: 'layoutsim', version: 1, savedAt: new Date().toISOString(), line: ST.line, erg: ST.erg, items: ST.items, seqText: ST.seqText || '', info: ST.info || {}, ops: ST.ops || {}, base: ST.base || null, opsOff: ST.opsOff || [], codes: used }, null, 1);
}
function openJson(txt) {
  var o = JSON.parse(txt);
  if (o.app !== 'layoutsim') throw new Error('not a layout file');
  ST.line = Object.assign({ name: '', length: 2400, width: 600, fixed: true }, o.line); ST.erg = Object.assign({}, ERG_DEF, o.erg || {}); ST.items = o.items || []; ST.seqText = o.seqText || ''; ST.info = o.info || {}; ST.ops = o.ops || {}; ST.base = o.base || null; ST.opsOff = o.opsOff || [];
  ST.seq = 1; ST.items.forEach(function (it) { var n = parseInt(String(it.id).slice(1), 10); if (n >= ST.seq) ST.seq = n + 1; });
  var added = 0;   // codes unknown on this PC: take the size stored in the file
  Object.keys(o.codes || {}).forEach(function (c) { if (!LIB.codes[c]) { LIB.codes[c] = { code: c, en: '', vn: '', L: o.codes[c].L, W: o.codes[c].W, custom: true, fromFile: true }; added++; } });
  if (added) libSave();
  SEL = [];
}
