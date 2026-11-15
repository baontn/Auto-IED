/* flow.js: operation sequence (sub-assemblies feeding the assembly line), garment flow distance and improvement suggestions.
   Text, one line per group:  "Cụm tim: 31=>33=>34=>35"  /  "66=>67=>...=>97=>QC=>PACKING".
   Edges: consecutive operations of a line; the last operation of each other line feeds the first operation of the assembly line
   (the line with QC/PACKING or named "lắp ráp"); an "Input" table feeds the first operation of every line. */
var FLOW_COLS = ['#e0457b', '#2a9d8f', '#e09a2b', '#3a7bd5', '#8e5bd6', '#5aa02c'];

function seqParse(text) {
  var lines = [];
  String(text || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
    var l = raw.replace(/\t+/g, ' ').trim(); if (!l) return;
    var m = l.match(/^(.*?)(\b\d{1,3}[a-z]?\b\s*(=>|->|→|>|,|;)[\s\S]*)$/i);
    var name = '', body = l;
    if (m) { name = m[1].replace(/[:\-–\s]+$/, '').trim(); body = m[2]; }
    else if (!/(=>|->|→)/.test(l)) return;
    var ops = body.split(/=>|->|→|>|,|;/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (ops.length) lines.push({ name: name, ops: ops });
  });
  var asm = -1;
  lines.forEach(function (ln, i) { if (asm < 0 && (/lắp ráp|lap rap|assembly|ráp/i.test(ln.name) || ln.ops.some(function (o) { return /^(QC|PACK)/i.test(o); }))) asm = i; });
  if (asm < 0 && lines.length) { asm = 0; lines.forEach(function (ln, i) { if (ln.ops.length > lines[asm].ops.length) asm = i; }); }
  return { lines: lines, asm: asm };
}
function seqEdges(sq) {
  var out = [], A = sq.lines[sq.asm];
  sq.lines.forEach(function (ln, i) {
    for (var k = 1; k < ln.ops.length; k++) out.push({ a: ln.ops[k - 1], b: ln.ops[k], line: i });
    if (i !== sq.asm && A && ln.ops.length) out.push({ a: ln.ops[ln.ops.length - 1], b: A.ops[0], line: i, feed: true });
  });
  return out;
}
function opsOf(it) { return String(it.op || '').split(/[\/+,&]/).map(function (x) { return x.trim().replace(/^0+(?=\d)/, ''); }).filter(Boolean); }
/* stations (points) where an operation is done: machines with that operation, or a table named like it (QC, Packing, Input) */
function stationsOf(op) {
  var key = String(op).trim().replace(/^0+(?=\d)/, '').toUpperCase(), out = [];
  ST.items.forEach(function (it) {
    if (it.kind === 'mc') { if (opsOf(it).some(function (o) { return o.toUpperCase() === key; })) { var s = shapes(it); out.push({ it: it, p: s.chair || s.front }); } }
    else if (it.name && it.name.trim().toUpperCase().indexOf(key) === 0 && /[A-Z]/.test(key)) out.push({ it: it, p: { x: it.x, y: it.y } });
  });
  return out;
}
function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
/* garment flow: each piece goes from a station of A to the nearest station of B */
function flowCalc(sq) {
  sq = sq || seqParse(ST.seqText);
  var edges = seqEdges(sq), res = { edges: [], total: 0, perLine: sq.lines.map(function () { return 0; }), missing: {}, sq: sq };
  var inp = ST.items.filter(function (it) { return it.kind === 'obj' && /^input/i.test(it.name || ''); })[0];
  if (inp) sq.lines.forEach(function (ln, i) { if (i !== sq.asm || sq.lines.length === 1) edges.unshift({ a: '#INPUT', b: ln.ops[0], line: i, input: true }); });
  var cache = {};
  function st(op) { if (op === '#INPUT') return [{ it: inp, p: { x: inp.x, y: inp.y } }]; return cache[op] || (cache[op] = stationsOf(op)); }
  edges.forEach(function (e) {
    var A = st(e.a), B = st(e.b);
    if (!A.length || !B.length) { if (!A.length && !/^(QC|PACK)/i.test(e.a)) res.missing[e.a] = 1; if (!B.length && !/^(QC|PACK)/i.test(e.b)) res.missing[e.b] = 1; return; }
    var pairs = A.map(function (s) { var bb = B[0], bd = Infinity; B.forEach(function (q) { var d = dist(s.p, q.p); if (d < bd) { bd = d; bb = q; } }); return { from: s, to: bb, d: bd }; });
    var d = pairs.reduce(function (x, p) { return x + p.d; }, 0) / pairs.length;
    res.edges.push({ a: e.a, b: e.b, line: e.line, feed: !!e.feed, input: !!e.input, d: d, pairs: pairs });
    res.total += d; res.perLine[e.line] += d;
  });
  res.missing = Object.keys(res.missing);
  return res;
}
/* suggestions: long transports, long walks of a shared operator, and swaps of two machines of the same size that shorten the flow */
function flowSuggest() {
  var sq = seqParse(ST.seqText); if (!sq.lines.length) return null;
  var base = flowCalc(sq), sug = [];
  base.edges.filter(function (e) { return e.d > 300 && !e.input; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 5)
    .forEach(function (e) { sug.push({ kind: 'long', e: e, ids: e.pairs.map(function (p) { return p.from.it.id; }).concat(e.pairs.map(function (p) { return p.to.it.id; })) }); });
  opLinks().filter(function (l) { return l.far && l.dist > 250; }).forEach(function (l) { sug.push({ kind: 'walk', l: l, ids: [l.home.id, l.sat.id] }); });
  sug = sug.concat(flowSwaps(sq, base.total, 4));
  return { base: base, sug: sug };
}
function flowSwaps(sq, total, nMax) {
  var mc = ST.items.filter(function (it) { return it.kind === 'mc' && !it.by && !satellitesOf(it).length && it.op; }), out = [], cur = total, done = {};
  function sw(a, b) { var t = [a.x, a.y, a.rot]; a.x = b.x; a.y = b.y; a.rot = b.rot; b.x = t[0]; b.y = t[1]; b.rot = t[2]; }
  var applied = [];
  for (var round = 0; round < nMax; round++) {
    var best = null;
    for (var i = 0; i < mc.length; i++) for (var j = i + 1; j < mc.length; j++) {
      var a = mc[i], b = mc[j];
      if (done[a.id] || done[b.id] || (a.zone || 'main') !== (b.zone || 'main')) continue;
      var da = dimOf(a.code), db = dimOf(b.code);
      if (Math.abs(da.L - db.L) > 1 || Math.abs(da.W - db.W) > 1 || a.op === b.op) continue;
      sw(a, b); var t2 = flowCalc(sq).total; sw(a, b);
      if (t2 < cur - 50 && (!best || t2 < best.t)) best = { a: a, b: b, t: t2 };
    }
    if (!best) break;
    sw(best.a, best.b); applied.push(best);   // keep it while looking for the next one
    out.push({ kind: 'swap', a: best.a, b: best.b, gain: cur - best.t, ids: [best.a.id, best.b.id] });
    cur = best.t; done[best.a.id] = done[best.b.id] = 1;
  }
  for (var k = applied.length - 1; k >= 0; k--) sw(applied[k].a, applied[k].b);   // put everything back
  return out;
}
function applySwap(aId, bId) {
  var a = itemById(aId), b = itemById(bId); if (!a || !b) return;
  var t0 = [a.x, a.y, a.rot]; a.x = b.x; a.y = b.y; a.rot = b.rot; b.x = t0[0]; b.y = t0[1]; b.rot = t0[2];
}
/* 2D drawing of the flow: arrows from each station to the next one, one colour per group */
function flowMarkup(o, fs, sw) {
  var sq = seqParse(ST.seqText); if (!sq.lines.length) return null;
  var r = flowCalc(sq), h = [];
  r.edges.forEach(function (e) {
    var col = e.input ? '#8a8f99' : FLOW_COLS[e.line % FLOW_COLS.length];
    e.pairs.forEach(function (p) {
      var a = p.from.p, b = p.to.p, L0 = dist(a, b); if (L0 < 1) return;
      var ux = (b.x - a.x) / L0, uy = (b.y - a.y) / L0, hs = Math.min(L0 / 3, 10 * sw), hw = hs * 0.5;
      h.push('<line x1="' + n1(a.x) + '" y1="' + n1(a.y) + '" x2="' + n1(b.x - ux * hs) + '" y2="' + n1(b.y - uy * hs) + '" stroke="' + col + '" stroke-opacity=".8" stroke-width="' + 2 * sw + '"' + (e.feed || e.input ? ' stroke-dasharray="' + 6 * sw + ' ' + 4 * sw + '"' : '') + ' pointer-events="none"/>' +
        '<polygon points="' + n1(b.x) + ',' + n1(b.y) + ' ' + n1(b.x - ux * hs - uy * hw) + ',' + n1(b.y - uy * hs + ux * hw) + ' ' + n1(b.x - ux * hs + uy * hw) + ',' + n1(b.y - uy * hs - ux * hw) + '" fill="' + col + '" fill-opacity=".85" pointer-events="none"/>');
    });
  });
  return h.join('');
}
