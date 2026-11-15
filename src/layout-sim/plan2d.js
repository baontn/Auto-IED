/* plan2d.js: scaled top view (SVG, 1 unit = 1 cm). Drag to move, wheel to zoom, drag on empty floor to pan, Shift+drag to select a box. */
var V = { x: -50, y: -80, s: 0.5 };           // world point at the top-left corner, pixels per cm
var OPT = { flow: true, snap: true, aisles: false };
var DRAG = null, BOXR = null;

function pal(light) {
  if (light) return { bg: '#ffffff', floor: '#f7f7f5', grid: '#e3e3df', grid2: '#cfcfca', text: '#1d2330', muted: '#6b7280', accent: '#1f6feb', bad: '#c4202b', warn: '#c98a00', edge: '#3b4250', zone: 'rgba(31,111,235,.08)', zoneEdge: '#7aa3e6', chair: '#5b6474', aisle: 'rgba(201,138,0,.10)', flow: '#e0457b', tableEdge: '#1d2330', outFloor: '#ececea', walk: 'rgba(224,161,0,.12)', walkEdge: '#b07d00', standZone: 'rgba(22,160,133,.10)', standEdge: '#2a9d8f', mat: 'rgba(60,70,80,.18)' };
  var cs = getComputedStyle(document.documentElement), g = function (n) { return cs.getPropertyValue(n).trim(); };
  var dark = matchMedia('(prefers-color-scheme: dark)').matches;
  return { bg: g('--bg'), floor: dark ? '#141922' : '#fbfbfa', grid: dark ? '#222a36' : '#e7e7e3', grid2: dark ? '#2e3846' : '#d2d2cc', text: g('--text'), muted: g('--muted'), accent: g('--accent'),
    bad: g('--bad'), warn: g('--warn'), edge: dark ? '#cfd6e2' : '#3b4250', zone: dark ? 'rgba(76,141,255,.12)' : 'rgba(31,111,235,.08)', zoneEdge: dark ? '#4c78c0' : '#7aa3e6',
    chair: dark ? '#8a94a6' : '#5b6474', aisle: dark ? 'rgba(227,179,65,.12)' : 'rgba(201,138,0,.10)', flow: '#e0457b',
    tableEdge: dark ? '#e6e9ef' : '#1d2330', outFloor: dark ? '#0d1016' : '#ececea', walk: dark ? 'rgba(227,179,65,.14)' : 'rgba(224,161,0,.12)', walkEdge: dark ? '#e3b341' : '#b07d00',
    standZone: dark ? 'rgba(42,157,143,.16)' : 'rgba(22,160,133,.10)', standEdge: '#2a9d8f', mat: dark ? 'rgba(200,210,220,.14)' : 'rgba(60,70,80,.18)' };
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function n1(v) { return Math.round(v * 10) / 10; }

/* returns the inner SVG markup. o = {s: px per cm, P: palette, exp: true for export (no selection)} */
function planMarkup(o) {
  var P = o.P, s = o.s, L = ST.line.length, W = ST.line.width, e = ST.erg, h = [];
  var fs = o.fs || Math.max(5, Math.min(40, 12 / s)), sw = 1 / s;   // font size in cm, 1 px stroke in cm
  var zs = lineZones(), multi = zs.length > 1;
  h.push('<rect x="0" y="0" width="' + L + '" height="' + W + '" fill="' + (multi ? P.outFloor : P.floor) + '"/>');
  if (multi) zs.forEach(function (z) { if (z.id !== 'walk') h.push('<rect x="' + z.x + '" y="' + z.y + '" width="' + z.L + '" height="' + z.W + '" fill="' + P.floor + '"/>'); });
  var step = 50 * s < 10 ? 100 : 50;
  for (var x = 0; x <= L; x += step) h.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + W + '" stroke="' + (x % 100 ? P.grid : P.grid2) + '" stroke-width="' + sw + '"/>');
  for (var y = 0; y <= W; y += step) h.push('<line x1="0" y1="' + y + '" x2="' + L + '" y2="' + y + '" stroke="' + (y % 100 ? P.grid : P.grid2) + '" stroke-width="' + sw + '"/>');
  var rs = Math.max(100, Math.ceil(60 / s / 100) * 100);
  for (x = 0; x <= L; x += rs) h.push('<text x="' + x + '" y="' + (-fs * 0.5) + '" font-size="' + fs * 0.85 + '" fill="' + P.muted + '" text-anchor="middle">' + (x / 100) + ' m</text>');
  for (y = rs; y <= W; y += rs) h.push('<text x="' + (-fs * 0.4) + '" y="' + (y + fs * 0.3) + '" font-size="' + fs * 0.85 + '" fill="' + P.muted + '" text-anchor="end">' + (y / 100) + '</text>');
  if (!multi) h.push('<rect x="0" y="0" width="' + L + '" height="' + W + '" fill="none" stroke="' + P.edge + '" stroke-width="' + 2 * sw + '"/>');
  else zs.forEach(function (z) {
    if (z.id === 'walk') {   // walkway between the two lines: hatched, with its width
      h.push('<rect x="' + z.x + '" y="' + z.y + '" width="' + z.L + '" height="' + z.W + '" fill="' + P.walk + '" stroke="' + P.walkEdge + '" stroke-width="' + 1.5 * sw + '" stroke-dasharray="' + 8 * sw + ' ' + 5 * sw + '"/>');
      for (var hx = z.x; hx < z.x + z.L; hx += 60) h.push('<line x1="' + hx + '" y1="' + (z.y + z.W) + '" x2="' + Math.min(hx + z.W, z.x + z.L) + '" y2="' + (z.y + Math.max(0, z.W - (z.x + z.L - hx))) + '" stroke="' + P.walkEdge + '" stroke-opacity=".35" stroke-width="' + sw + '"/>');
      h.push('<text x="' + (z.x + z.L / 2) + '" y="' + (z.y + z.W / 2 + fs * 0.35) + '" font-size="' + fs * 0.9 + '" font-weight="700" fill="' + P.walkEdge + '" text-anchor="middle" stroke="' + P.floor + '" stroke-width="' + fs * 0.2 + '" paint-order="stroke">' + esc(t('walkLbl', [z.W])) + '</text>');
    } else {
      h.push('<rect x="' + z.x + '" y="' + z.y + '" width="' + z.L + '" height="' + z.W + '" fill="none" stroke="' + P.edge + '" stroke-width="' + 2 * sw + '"/>');
      h.push('<text x="' + (z.x + fs * 0.4) + '" y="' + (z.y + fs * 1.1) + '" font-size="' + fs * 0.85 + '" font-weight="700" fill="' + P.muted + '">' + esc(t(z.id === 'branch' ? 'zoneBranch' : 'zoneMain')) + '</text>');
    }
  });
  var bad = issueIds('bad'), warn = issueIds('warn'), labels = [];
  ST.items.forEach(function (it) {
    var S = shapes(it), d = { L: S.L, W: S.W }, sel = !o.exp && SEL.indexOf(it.id) >= 0;
    var stroke = sel ? P.accent : bad[it.id] ? P.bad : warn[it.id] ? P.warn : P.edge, wd = (sel || bad[it.id] || warn[it.id] ? 2.5 : 1) * sw;
    var g = ['<g data-id="' + it.id + '" transform="translate(' + n1(it.x) + ' ' + n1(it.y) + ') rotate(' + (it.rot || 0) + ')" style="cursor:move">'];
    if (it.kind === 'mc' && S.zone) {
      var sx = S.seatX;
      var zw = S.zw, zd = S.zd;
      if (OPT.aisles || sel) g.push('<rect x="' + (sx - zw / 2) + '" y="' + (d.W / 2 + zd) + '" width="' + zw + '" height="' + e.aisle + '" fill="' + P.aisle + '" stroke="' + P.warn + '" stroke-width="' + sw + '" stroke-dasharray="' + 3 * sw + ' ' + 3 * sw + '"/>');
      g.push('<rect x="' + (sx - zw / 2) + '" y="' + d.W / 2 + '" width="' + zw + '" height="' + zd + '" fill="' + (S.stand ? P.standZone : P.zone) + '" stroke="' + (S.stand ? P.standEdge : P.zoneEdge) + '" stroke-width="' + sw + '" stroke-dasharray="' + 4 * sw + ' ' + 3 * sw + '"/>');
      if (S.stand) {   // anti-fatigue mat and two footprints
        var my = d.W / 2 + 6, mh = Math.min(zd - 10, 60);
        g.push('<rect x="' + (sx - Math.min(zw, 90) / 2 + 3) + '" y="' + my + '" width="' + (Math.min(zw, 90) - 6) + '" height="' + mh + '" rx="4" fill="' + P.mat + '" stroke="none"/>');
        var fy = d.W / 2 + e.standGap;
        [-1, 1].forEach(function (k) { g.push('<ellipse cx="' + (sx + k * 9) + '" cy="' + fy + '" rx="5" ry="11" fill="' + P.chair + '" fill-opacity=".85"/>'); });
      } else {
        g.push('<rect x="' + (sx - e.chairW / 2) + '" y="' + (d.W / 2 + e.chairGap) + '" width="' + e.chairW + '" height="' + e.chairD + '" rx="' + e.chairW * 0.25 + '" fill="none" stroke="' + P.chair + '" stroke-width="' + 1.5 * sw + '"/>');
        g.push('<path d="M' + (sx - e.chairW * 0.38) + ' ' + (d.W / 2 + e.chairGap + e.chairD * 0.92) + ' h' + e.chairW * 0.76 + '" stroke="' + P.chair + '" stroke-width="' + 3 * sw + '"/>');
      }
    }
    var fam = it.kind === 'mc' ? famOf(it.code) : '';
    var ins = it.kind === 'mc' ? Math.min(1.5, d.L / 10) : 0, bw = Math.max(wd, 1.8 * sw);   // a visible gap and border between touching tables
    g.push('<rect x="' + (-d.L / 2 + ins) + '" y="' + (-d.W / 2 + ins) + '" width="' + (d.L - 2 * ins) + '" height="' + (d.W - 2 * ins) + '" rx="' + (ins ? 1.5 : 0) + '" fill="' + (it.kind === 'mc' ? FAM_COL[fam] : (it.color || '#c9ccd3')) + '" fill-opacity="' + (it.kind === 'mc' ? 0.55 : 0.45) + '" stroke="' + (stroke === P.edge ? P.tableEdge : stroke) + '" stroke-width="' + bw + '"/>');
    if (it.kind === 'mc') {
      var hd = headTop(fam, d, S.seatX);
      if (hd) g.push('<rect x="' + hd.x + '" y="' + hd.y + '" width="' + hd.w + '" height="' + hd.h + '" rx="2" fill="' + FAM_COL[fam] + '" fill-opacity=".95" stroke="' + P.edge + '" stroke-width="' + sw + '"/>');
      g.push('<circle cx="' + S.seatX + '" cy="' + (d.W / 2 - 6) + '" r="2.2" fill="' + P.bad + '"/>');   // needle / work point, operator side
    }
    g.push('</g>');
    h.push(g.join(''));
    labels.push({ it: it, fam: fam });
  });
  // one operator for several machines: thin link when next to each other, double arrow (walking distance) when apart
  opLinks().forEach(function (l) {
    // same curved arrow for neighbours and for machines apart (head on the machine run by the shared operator); distance shown when apart
    var col = '#7c3aed', c1 = l.c1, c2 = l.c2, mx0 = (c1.x + c2.x) / 2, my0 = (c1.y + c2.y) / 2, ddx = c2.x - c1.x, ddy = c2.y - c1.y, dl = Math.hypot(ddx, ddy) || 1;
    var nx = -ddy / dl, ny = ddx / dl; if (nx * l.back.x + ny * l.back.y < 0) { nx = -nx; ny = -ny; }   // bulge to the machines' back side
    var bulge = Math.max(25, Math.min(dl * 0.45, 140)), cx0 = mx0 + nx * bulge, cy0 = my0 + ny * bulge;
    var tx = c2.x - cx0, ty = c2.y - cy0, tl = Math.hypot(tx, ty) || 1, ux0 = tx / tl, uy0 = ty / tl, hs0 = Math.max(13 * sw, fs * 0.9), hw0 = hs0 * 0.6;
    var ex = c2.x - ux0 * hs0 * 0.9, ey = c2.y - uy0 * hs0 * 0.9;
    h.push('<path d="M' + n1(c1.x) + ' ' + n1(c1.y) + ' Q' + n1(cx0) + ' ' + n1(cy0) + ' ' + n1(ex) + ' ' + n1(ey) + '" fill="none" stroke="' + col + '" stroke-width="' + Math.max(3.5 * sw, fs * 0.22) + '" stroke-linecap="round" pointer-events="none"/>' +
      '<polygon points="' + n1(c2.x) + ',' + n1(c2.y) + ' ' + n1(c2.x - ux0 * hs0 - uy0 * hw0) + ',' + n1(c2.y - uy0 * hs0 + ux0 * hw0) + ' ' + n1(c2.x - ux0 * hs0 + uy0 * hw0) + ',' + n1(c2.y - uy0 * hs0 - ux0 * hw0) + '" fill="' + col + '" pointer-events="none"/>');
    if (l.far) {
      var f = fs * 0.85, ax = (mx0 + cx0) / 2, ay = (my0 + cy0) / 2;   // label on the curve
      h.push('<text x="' + n1(ax) + '" y="' + n1(ay + f * 0.35) + '" font-size="' + f + '" font-weight="700" fill="' + col + '" stroke="rgba(255,255,255,.9)" stroke-width="' + f * 0.22 + '" paint-order="stroke" text-anchor="middle" pointer-events="none">' + (l.dist / 100).toFixed(1) + ' m</text>');
    }
  });
  var fm = OPT.flow && !o.exp ? flowMarkup(o, fs, sw) : null;   // garment flow following the operation sequence
  if (fm !== null) h.push(fm);
  else if (OPT.flow && !o.exp) {   // the flow line is for IE on screen, not for the mechanics' print
    var fp = flowPath();
    if (fp.pts.length > 1) {
      h.push('<polyline points="' + fp.pts.map(function (p) { return n1(p.x) + ',' + n1(p.y); }).join(' ') + '" fill="none" stroke="' + P.flow + '" stroke-opacity=".75" stroke-width="' + 2 * sw + '" stroke-dasharray="' + 6 * sw + ' ' + 4 * sw + '" pointer-events="none"/>');
      fp.pts.forEach(function (p, i) { h.push('<circle cx="' + n1(p.x) + '" cy="' + n1(p.y) + '" r="' + (i ? 2.5 : 4) * sw + '" fill="' + P.flow + '" pointer-events="none"/>'); });
    }
  }
  // labels on top, never rotated
  labels.forEach(function (l) {
    var it = l.it, S = shapes(it), halo = '" fill="#14181f" stroke="rgba(255,255,255,.8)" paint-order="stroke" text-anchor="middle" font-weight="700" pointer-events="none"';
    if (it.kind !== 'mc') {
      var f0 = fs * 0.9;
      h.push('<text x="' + n1(it.x) + '" y="' + n1(it.y - f0 * 0.1) + '" font-size="' + f0 + '" stroke-width="' + f0 * 0.18 + halo + '>' + esc(it.name || '') + '</text>' +
        '<text x="' + n1(it.x) + '" y="' + n1(it.y + f0 * 0.85) + '" font-size="' + f0 * 0.75 + '" stroke-width="' + f0 * 0.15 + halo + '>' + esc(it.L + '×' + it.W) + '</text>');
      return;
    }
    // machine code on the table; the operation number (big) on the operator's seat, or on the table when the station has no operator
    var fc = fs * 1.05, fo = fs * 1.7, op = String(it.op || '');
    if (S.chair) {
      h.push('<text x="' + n1(it.x) + '" y="' + n1(it.y + fc * 0.35) + '" font-size="' + fc + '" stroke-width="' + fc * 0.18 + halo + '>' + esc(it.code) + '</text>');
      if (op) h.push('<text x="' + n1(S.chair.x) + '" y="' + n1(S.chair.y + fo * 0.36) + '" font-size="' + fo + '" stroke-width="' + fo * 0.16 + halo.replace('#14181f', '#0b3d91') + '>' + esc(op) + '</text>');
    } else {
      var fo2 = fs * 1.35;
      h.push('<text x="' + n1(it.x) + '" y="' + n1(it.y - fc * 0.25) + '" font-size="' + fc + '" stroke-width="' + fc * 0.18 + halo + '>' + esc(it.code) + '</text>');
      if (op) h.push('<text x="' + n1(it.x) + '" y="' + n1(it.y + fo2 * 0.85) + '" font-size="' + fo2 + '" stroke-width="' + fo2 * 0.16 + halo.replace('#14181f', '#0b3d91') + '>' + esc(op) + '</text>');
    }
  });
  if (BOXR && !o.exp) {
    var bx = Math.min(BOXR.a.x, BOXR.b.x), by = Math.min(BOXR.a.y, BOXR.b.y);
    h.push('<rect x="' + bx + '" y="' + by + '" width="' + Math.abs(BOXR.a.x - BOXR.b.x) + '" height="' + Math.abs(BOXR.a.y - BOXR.b.y) + '" fill="rgba(31,111,235,.08)" stroke="' + P.accent + '" stroke-width="' + sw + '" stroke-dasharray="' + 4 * sw + '"/>');
  }
  return h.join('');
}
/* top view of the machine head on the table, in local coordinates (operator at +y) */
function headTop(fam, d, sx) {
  var L = d.L, W = d.W, clamp = function (r) { r.x = Math.max(-L / 2 + 2, r.x); r.w = Math.min(L / 2 - 2 - r.x, r.w); return r; };
  switch (fam) {
    case 'lockstitch': case 'coverstitch': case 'bonding': return clamp({ x: sx - 10, y: -W * 0.12, w: Math.min(52, L * 0.5), h: W * 0.4 });
    case 'cylinder': return clamp({ x: sx - 12, y: -W * 0.18, w: Math.min(56, L * 0.52), h: W * 0.42 });
    case 'overlock': return clamp({ x: sx - 14, y: -W * 0.2, w: 34, h: W * 0.5 });
    case 'bartack': return clamp({ x: sx - 20, y: -W * 0.3, w: Math.min(60, L * 0.56), h: W * 0.62 });
    case 'pattern': return clamp({ x: -L * 0.36, y: -W * 0.36, w: L * 0.72, h: W * 0.72 });
    case 'ultrasonic': return clamp({ x: sx - 12, y: -W * 0.2, w: 30, h: W * 0.4 });
    case 'press': return { x: -L * 0.4, y: -W * 0.38, w: L * 0.8, h: W * 0.68 };
    case 'snap': return { x: -12, y: -W * 0.3, w: 24, h: W * 0.4 };
    default: return null;
  }
}

/* ---------- on-screen view ---------- */
function svgEl() { return document.getElementById('plan'); }
function render2d() {
  var svg = svgEl(), w = svg.clientWidth, h = svg.clientHeight;
  if (!w || !h) return;
  svg.setAttribute('viewBox', V.x + ' ' + V.y + ' ' + (w / V.s) + ' ' + (h / V.s));
  svg.innerHTML = planMarkup({ s: V.s, P: pal(false) });
  var z = document.getElementById('zoomTxt'); if (z) z.textContent = Math.round(V.s * 100) / 100 + ' px/cm';
  placeSelTools();
}
function toWorld(ev) { var r = svgEl().getBoundingClientRect(); return { x: V.x + (ev.clientX - r.left) / V.s, y: V.y + (ev.clientY - r.top) / V.s }; }
function fitView() {
  var svg = svgEl(), w = svg.clientWidth, h = svg.clientHeight; if (!w) return;
  var b = bbox(ST.items) || { x0: 0, y0: 0, x1: 0, y1: 0 };
  var x0 = Math.min(0, b.x0), y0 = Math.min(0, b.y0), x1 = Math.max(ST.line.length, b.x1), y1 = Math.max(ST.line.width, b.y1);
  var pad = 60;
  V.s = Math.min(w / (x1 - x0 + 2 * pad), h / (y1 - y0 + 2 * pad));
  V.x = x0 - pad - ((w / V.s) - (x1 - x0 + 2 * pad)) / 2; V.y = y0 - pad - ((h / V.s) - (y1 - y0 + 2 * pad)) / 2;
  render2d();
}
function snapV(v) { return OPT.snap ? Math.round(v / ST.erg.snap) * ST.erg.snap : Math.round(v * 10) / 10; }

function init2d() {
  var svg = svgEl();
  svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  svg.addEventListener('pointerdown', function (e) {
    svg.setPointerCapture(e.pointerId);
    var p = toWorld(e), g = e.target.closest ? e.target.closest('[data-id]') : null;
    if (g && e.button === 0 && OPMODE) {           // operator mode: a click toggles this machine's operator
      var ti = itemById(g.getAttribute('data-id'));
      if (ti && ti.kind === 'mc') { opToggleOne(ti); changed(); }
      DRAG = null; return;
    }
    if (g && e.button === 0) {
      var id = g.getAttribute('data-id');
      if (e.shiftKey || e.ctrlKey) { var k = SEL.indexOf(id); if (k >= 0) SEL.splice(k, 1); else SEL.push(id); }
      else if (SEL.indexOf(id) < 0) SEL = [id];
      DRAG = { mode: 'move', p0: p, orig: selItems().filter(function (it) { return !isLocked(it); }).map(function (it) { return { it: it, x: it.x, y: it.y }; }), moved: false, noSnap: e.altKey };
      onSelChange();
    } else if (e.button === 0 && e.shiftKey) { DRAG = { mode: 'box' }; BOXR = { a: p, b: p }; }
    else DRAG = { mode: 'pan', c0: { x: e.clientX, y: e.clientY }, v0: { x: V.x, y: V.y }, moved: false };
    render2d();
  });
  svg.addEventListener('pointermove', function (e) {
    if (!DRAG) return;
    if (DRAG.mode === 'move' && DRAG.orig.length) {
      var p = toWorld(e), dx = p.x - DRAG.p0.x, dy = p.y - DRAG.p0.y;
      if (!DRAG.moved && Math.hypot(dx, dy) * V.s < 3) return;
      DRAG.moved = true;
      var o0 = DRAG.orig[0], useSnap = OPT.snap && !e.altKey;
      var ddx = (useSnap ? Math.round((o0.x + dx) / ST.erg.snap) * ST.erg.snap : o0.x + dx) - o0.x, ddy = (useSnap ? Math.round((o0.y + dy) / ST.erg.snap) * ST.erg.snap : o0.y + dy) - o0.y;
      DRAG.orig.forEach(function (o) { o.it.x = n1(o.x + ddx); o.it.y = n1(o.y + ddy); });
      render2d(); sideLive();
    } else if (DRAG.mode === 'pan') {
      var mx = e.clientX - DRAG.c0.x, my = e.clientY - DRAG.c0.y;
      if (Math.abs(mx) + Math.abs(my) > 3) DRAG.moved = true;
      V.x = DRAG.v0.x - mx / V.s; V.y = DRAG.v0.y - my / V.s; render2d();
    } else if (DRAG.mode === 'box') { BOXR.b = toWorld(e); render2d(); }
  });
  svg.addEventListener('pointerup', function () {
    if (!DRAG) return;
    var d = DRAG; DRAG = null;
    if (d.mode === 'move' && d.moved) changed();
    else if (d.mode === 'pan' && !d.moved) { if (SEL.length) { SEL = []; onSelChange(); } render2d(); }
    else if (d.mode === 'box') {
      var x0 = Math.min(BOXR.a.x, BOXR.b.x), x1 = Math.max(BOXR.a.x, BOXR.b.x), y0 = Math.min(BOXR.a.y, BOXR.b.y), y1 = Math.max(BOXR.a.y, BOXR.b.y);
      ST.items.forEach(function (it) { if (it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1 && SEL.indexOf(it.id) < 0) SEL.push(it.id); });
      BOXR = null; onSelChange(); render2d();
    }
  });
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = toWorld(e), f = e.deltaY < 0 ? 1.15 : 1 / 1.15, ns = Math.max(0.05, Math.min(8, V.s * f));
    var r = svg.getBoundingClientRect();
    V.s = ns; V.x = p.x - (e.clientX - r.left) / V.s; V.y = p.y - (e.clientY - r.top) / V.s; render2d();
  }, { passive: false });
  svg.addEventListener('dblclick', function (e) {
    var g = e.target.closest ? e.target.closest('[data-id]') : null;
    if (g) { SEL = [g.getAttribute('data-id')]; onSelChange(); var f = document.getElementById('fCode') || document.getElementById('fName'); if (f) { f.focus(); f.select(); } }
  });
  window.addEventListener('resize', function () { render2d(); resize3d(); });
}

/* small buttons next to the selected machine(s): turn, turn around, operator on/off, delete */
function placeSelTools() {
  var tb = document.getElementById('selTools'); if (!tb) return;
  var its = selItems();
  if (!its.length || (DRAG && DRAG.moved) || (TAB !== 'plan' && TAB !== '3d')) { tb.style.display = 'none'; return; }
  var mc0 = its.filter(function (i) { return i.kind === 'mc'; });
  var bSt = tb.querySelector('[data-cmd="stand"]'); if (bSt) { bSt.style.display = mc0.length ? '' : 'none'; bSt.textContent = mc0.length && mc0.every(isStanding) ? '🪑' : '🧍'; }
  if (TAB === '3d') {
    if (!V3.ok) { tb.style.display = 'none'; return; }
    var cx3 = 0, cz3 = 0; its.forEach(function (it) { cx3 += it.x; cz3 += it.y; }); cx3 /= its.length; cz3 /= its.length;
    var sp = screenOf3d(cx3, 190, cz3), host3 = tb.parentNode, rh3 = host3.getBoundingClientRect();
    if (!sp.ok) { tb.style.display = 'none'; return; }
    var bOp3 = tb.querySelector('[data-cmd="op"]'); bOp3.style.display = mc0.length ? '' : 'none'; bOp3.classList.toggle('off', mc0.length > 0 && mc0.every(function (i) { return i.noOp; }));
    tb.style.display = 'flex';
    var w3 = tb.offsetWidth, h3 = tb.offsetHeight;
    tb.style.left = Math.max(4, Math.min(sp.r.width - w3 - 4, sp.x - w3 / 2)) + (sp.r.left - rh3.left) + 'px';
    tb.style.top = Math.max(4, sp.y - h3 - 6) + (sp.r.top - rh3.top) + 'px';
    return;
  }
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity;
  its.forEach(function (it) { corners(shapes(it).table).forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); }); });
  var svg = svgEl(), host = tb.parentNode, rs = svg.getBoundingClientRect(), rh = host.getBoundingClientRect();
  var sx = (x0 + x1) / 2 * 1, px = ((sx - V.x) * V.s) + rs.left - rh.left, py = ((y0 - V.y) * V.s) + rs.top - rh.top - 8;
  var mc = its.filter(function (i) { return i.kind === 'mc'; });
  var bOp = tb.querySelector('[data-cmd="op"]'); bOp.style.display = mc.length ? '' : 'none';
  bOp.classList.toggle('off', mc.length > 0 && mc.every(function (i) { return i.noOp; }));
  tb.style.display = 'flex';
  var w = tb.offsetWidth, h = tb.offsetHeight;
  px = Math.max(rs.left - rh.left + 4, Math.min(rs.right - rh.left - w - 4, px - w / 2));
  if (py - h < rs.top - rh.top + 4) py = ((Math.max.apply(null, its.map(function (it) { return Math.max.apply(null, corners(shapes(it).table).map(function (p) { return p.y; })); })) - V.y) * V.s) + rs.top - rh.top + h + 12;
  tb.style.left = px + 'px'; tb.style.top = (py - h) + 'px';
}
function toggleOperator() {
  // keep the click order: the first selected machine keeps the operator
  var mc = SEL.map(itemById).filter(function (i) { return i && i.kind === 'mc'; }); if (!mc.length) return;
  var r = opShare(mc); changed();
  if (r === 'share') toast(t('opShared', [mc.length, label(mc[0])])); else if (r === 'split') toast(t('opSplit', [mc.length]));
}
/* ---------- edit commands (2D and 3D share them) ---------- */
function rotateSel(deg) {
  selItems().forEach(function (it) { it.rot = (((it.rot || 0) + deg) % 360 + 360) % 360; });
  if (SEL.length) changed();
}
/* turn the whole selection as one block around its centre (keeps the arrangement, e.g. mirror a row) */
function rotateGroup(deg) {
  var its = selItems(); if (its.length < 2) return rotateSel(deg);
  var cx = 0, cy = 0; its.forEach(function (it) { cx += it.x; cy += it.y; }); cx /= its.length; cy /= its.length;
  var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  its.forEach(function (it) {
    var dx = it.x - cx, dy = it.y - cy;
    it.x = n1(cx + dx * c - dy * s); it.y = n1(cy + dx * s + dy * c); it.rot = (((it.rot || 0) + deg) % 360 + 360) % 360;
  });
  changed();
}
function deleteSel() { if (!SEL.length) return; ST.items = ST.items.filter(function (it) { return SEL.indexOf(it.id) < 0; }); ST.items.forEach(function (i) { if (i.by && !itemById(i.by)) delete i.by; }); SEL = []; changed(); onSelChange(); }
function duplicateSel() {
  var its = selItems(); if (!its.length) return;
  var b = bbox(its), dy = b ? (b.y1 - b.y0) + 20 : 100, ids = [];
  its.forEach(function (it) { var c = JSON.parse(JSON.stringify(it)); c.id = uid(); c.y = n1(c.y + dy); delete c.by; ST.items.push(c); ids.push(c.id); });
  SEL = ids; changed(); onSelChange();
}
function nudgeSel(dx, dy) { selItems().filter(function (it) { return !isLocked(it); }).forEach(function (it) { it.x = n1(it.x + dx); it.y = n1(it.y + dy); }); if (SEL.length) changed(); }
/* line up the selection on the first selected item's y */
function alignSel() { var its = selItems(); if (its.length < 2) return; var y = its[0].y; its.forEach(function (it) { it.y = y; }); changed(); }
/* place the selection side by side from left to right, edge to edge (+ gap) */
function packSel() {
  var its = selItems().slice().sort(function (a, b) { return a.x - b.x; }); if (its.length < 2) return;
  var acc = its[0].x - extentX(its[0]) / 2;
  its.forEach(function (it) { var w = extentX(it); it.x = n1(acc + w / 2); acc += w + ST.erg.colGap; });
  changed();
}
function addMachine(code) {
  code = normCode(code); if (!code) return;
  var d = dimOf(code), c = viewCenter();
  var it = { id: uid(), kind: 'mc', code: code, op: '', x: snapV(c.x), y: snapV(c.y), rot: 0 };
  ST.items.push(it); SEL = [it.id]; changed(); onSelChange();
}
function addObject(kind) {
  var preset = { input: ['Input', 60, 120, '#8fb3d9', 75], qc: ['QC', 120, 60, '#9fd3a8', 75], table: [t('obTable'), 120, 60, '#c9c2b4', 75], pillar: [t('obPillar'), 50, 50, '#7d8590', 300], trolley: [t('obTrolley'), 80, 50, '#d9c08f', 85], box: [t('obBox'), 100, 100, '#c9ccd3', 100] }[kind] || ['?', 100, 100, '#c9ccd3', 75];
  var c = viewCenter(), it = { id: uid(), kind: 'obj', name: preset[0], L: preset[1], W: preset[2], H: preset[4], x: snapV(c.x), y: snapV(c.y), rot: 0, color: preset[3] };
  ST.items.push(it); SEL = [it.id]; changed(); onSelChange();
}
function viewCenter() { var svg = svgEl(), w = svg.clientWidth || 800, h = svg.clientHeight || 500; return { x: V.x + w / V.s / 2, y: V.y + h / V.s / 2 }; }

/* ---------- export ---------- */
function exportPng(cb) {
  var b = bbox(ST.items) || { x0: 0, y0: 0, x1: 0, y1: 0 };
  var x0 = Math.min(0, b.x0) - 40, y0 = Math.min(0, b.y0) - 110, x1 = Math.max(ST.line.length, b.x1) + 40, y1 = Math.max(ST.line.width, b.y1) + 40;
  // printable: about 3 px per cm (a 20 m line gives ~6500 px), big labels (15 cm text, operation numbers ~26 cm)
  var px = Math.max(1.5, Math.min(3.5, 7000 / (x1 - x0))), w = Math.round((x1 - x0) * px), h = Math.round((y1 - y0) * px);
  var head = '<text x="' + (x0 + 40) + '" y="' + (y0 + 45) + '" font-size="34" font-weight="700" fill="#1d2330">' + esc([(ST.info || {}).style, ST.line.name || t('lineNoName'), ST.line.length + ' × ' + ST.line.width + ' cm'].filter(Boolean).join(' · ')) + '</text>' +
    '<text x="' + (x0 + 40) + '" y="' + (y0 + 82) + '" font-size="20" fill="#6b7280">' + esc(t('expSub', [ST.items.filter(function (i) { return i.kind === 'mc'; }).length, new Date().toLocaleString()])) + '</text>';
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="' + x0 + ' ' + y0 + ' ' + (x1 - x0) + ' ' + (y1 - y0) + '" font-family="Segoe UI,Roboto,Arial,sans-serif">' +
    '<rect x="' + x0 + '" y="' + y0 + '" width="' + (x1 - x0) + '" height="' + (y1 - y0) + '" fill="#fff"/>' + head + planMarkup({ s: 1.2, fs: 15, P: pal(true), exp: true }) + '</svg>';
  var img = new Image();
  img.onload = function () {
    var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0);
    cb(c.toDataURL('image/png'));
  };
  img.onerror = function () { toast(t('expErr'), true); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
