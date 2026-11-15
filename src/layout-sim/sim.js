/* sim.js: line balance and product-flow simulation (WIP at each station).
   SAM per operation: ST.ops {op: {sam, mc, optr}} (read from the layout file, editable).
   Flow: the operation sequence (flow.js) or, without one, all operations in number order.
   Operators: every machine with its own operator; a shared operator also works the machines linked to it (it.by).
   Event simulation: bundles of N pieces, operator efficiency, input always available (push) or released at a target rate;
   the first operation of the assembly line needs one bundle from every sub-assembly line (join). */
var SIMR = null;   // last result

function simNum(op) { var n = parseFloat(op); return isFinite(n) ? n : 1e9; }
/* the flow lines used by the simulation (numeric operations only) */
function simLines() {
  var sq = seqParse(ST.seqText), all = {};
  ST.items.forEach(function (it) { if (it.kind === 'mc') opsOf(it).forEach(function (o) { if (/^\d/.test(o)) all[o] = 1; }); });
  if (sq.lines.length) {
    var lines = sq.lines.map(function (ln) { return { name: ln.name, ops: ln.ops.map(function (o) { return o.replace(/^0+(?=\d)/, ''); }).filter(function (o) { return /^\d/.test(o); }) }; }).filter(function (l) { return l.ops.length; });
    // operations combined on one machine (e.g. "37/42") but missing from the sequence: done right after their partner
    var inSeq = {}, added = [];
    lines.forEach(function (l) { l.ops.forEach(function (o) { inSeq[o] = 1; }); });
    ST.items.forEach(function (it) {
      if (it.kind !== 'mc') return;
      var ops = opsOf(it).filter(function (o) { return /^\d/.test(o); }); if (ops.length < 2) return;
      ops.forEach(function (o) {
        if (inSeq[o]) return;
        var prev = null; ops.forEach(function (q) { if (q !== o && inSeq[q]) prev = q; }); if (!prev) return;
        lines.some(function (l) { var k = l.ops.lastIndexOf(prev); if (k < 0) return false; l.ops.splice(k + 1, 0, o); return true; });
        inSeq[o] = 1; added.push(o);
      });
    });
    return { lines: lines, asm: Math.max(0, Math.min(sq.asm, lines.length - 1)), fromSeq: true, added: added };
  }
  return { lines: [{ name: t('simDefLine'), ops: Object.keys(all).sort(function (a, b) { return simNum(a) - simNum(b); }) }], asm: 0, fromSeq: false };
}
function samOf(op) { var o = (ST.ops || {})[op]; return o && o.sam > 0 ? o.sam : 0; }
/* operators and the operations each one does */
function simOperators(opsSet) {
  var out = [];
  ST.items.forEach(function (it) {
    if (it.kind !== 'mc' || it.noOp) return;
    var ops = opsOf(it).concat.apply(opsOf(it), satellitesOf(it).map(opsOf)).filter(function (o, i, a) { return opsSet[o] && a.indexOf(o) === i; });
    if (ops.length) out.push({ it: it, ops: ops });
  });
  return out;
}
/* static balance: share of each operator's time per operation (proportional to SAM), capacity in pieces / hour */
/* efficiency of one operation: its own value (%, edited in the table) or the general one */
function effOf(op, eff) { var o = (ST.ops || {})[op]; return o && o.eff > 0 ? o.eff / 100 : eff; }
/* headcount of the line: line set-up, else the workers of the layout file, else 0 (= operators as on the plan) */
function lineHC() { var h = parseFloat(ST.line.hc); if (h > 0) return Math.round(h); var f = parseFloat((ST.info || {}).optr); return f > 0 ? Math.round(f) : 0; }
/* static balance: share of each operator's time per operation (proportional to SAM), capacity in pieces / hour.
   With a headcount: extra people help the slowest operations, missing people are taken from the operations with most spare capacity */
function simBalance(eff) {
  var L = simLines(), set = {}, st = {};
  L.lines.forEach(function (l) { l.ops.forEach(function (o) { set[o] = 1; }); });
  ST.items.forEach(function (it) { if (it.kind === 'mc') opsOf(it).forEach(function (o) { if (set[o]) (st[o] = st[o] || []).push(it); }); });
  var opers = simOperators(set), onPlan = opers.length, adj = {};
  function calc() {
    var share = {}, cnt = {};
    opers.forEach(function (p) {
      var tot = p.ops.reduce(function (a, o) { return a + (samOf(o) || 0.0001); }, 0);
      p.ops.forEach(function (o) { share[o] = (share[o] || 0) + (samOf(o) || 0.0001) / tot; cnt[o] = (cnt[o] || 0) + 1; });
    });
    var rows = Object.keys(set).sort(function (a, b) { return simNum(a) - simNum(b); }).map(function (o) {
      var sam = samOf(o), sh = share[o] || 0, ef = effOf(o, eff);
      return { op: o, sam: sam, eff: ef, effOwn: !!(((ST.ops || {})[o] || {}).eff > 0), mc: ((ST.ops || {})[o] || {}).mc || (st[o] && st[o][0] ? st[o][0].code : ''), stations: (st[o] || []).length, its: st[o] || [],
        people: sh, nOper: cnt[o] || 0, adj: adj[o] || 0, cap: sam > 0 && sh > 0 ? sh * 60 * ef / sam : (sh > 0 ? Infinity : 0) };
    });
    return rows;
  }
  var hc = lineHC(), rows = calc(), guard = 0;
  while (hc > 0 && opers.length < hc && guard++ < 200) {   // helpers for the slowest operation
    var lo = rows.filter(function (r) { return r.sam > 0 && r.stations > 0; }).sort(function (a, b) { return a.cap - b.cap; })[0]; if (!lo) break;
    opers.push({ ops: [lo.op], it: lo.its[0], helper: true }); adj[lo.op] = (adj[lo.op] || 0) + 1; rows = calc();
  }
  while (hc > 0 && opers.length > hc && guard++ < 400) {   // fewer people: remove one where the most capacity is spare
    var byOp = {}; rows.forEach(function (r) { byOp[r.op] = r; });
    var cand = opers.map(function (p, k) { return { k: k, p: p }; }).filter(function (x) { return x.p.ops.length === 1 && byOp[x.p.ops[0]] && byOp[x.p.ops[0]].nOper > 1; })
      .sort(function (a, b) { var ca = byOp[a.p.ops[0]], cb = byOp[b.p.ops[0]]; return (cb.cap * (cb.nOper - 1) / cb.nOper) - (ca.cap * (ca.nOper - 1) / ca.nOper); })[0];
    if (!cand) break;
    var op0 = cand.p.ops[0]; opers.splice(cand.k, 1); adj[op0] = (adj[op0] || 0) - 1; rows = calc();
  }
  // operations without a machine / operator pass pieces straight through: not a bottleneck
  var finite = rows.filter(function (r) { return r.sam > 0 && r.people > 0; }), capMin = finite.length ? Math.min.apply(null, finite.map(function (r) { return r.cap; })) : 0;
  return { L: L, rows: rows, opers: opers, onPlan: onPlan, hc: hc, capMin: capMin, bottleneck: finite.filter(function (r) { return r.cap === capMin; }).map(function (r) { return r.op; }) };
}
/* event simulation. p = {hours, eff (0-1), bundle, rate (pcs/h, 0 = push)} */
function simRun(p) {
  var B = simBalance(p.eff), L = B.L, T = p.hours * 60, bundle = Math.max(1, p.bundle | 0);
  var W0 = p.warm ? T : 0, TT = W0 + T;   // warm-up: the line fills first, output and WIP are measured over the next p.hours
  var node = {}, starts = [], asmL = L.lines[L.asm], feeds = [];
  L.lines.forEach(function (l, li) {
    l.ops.forEach(function (o, k) {
      if (!node[o]) node[o] = { op: o, sam: samOf(o), next: null, line: li, q: 0, qSum: 0, qMax: 0, done: 0, oper: 0 };
      if (k < l.ops.length - 1) node[o].next = l.ops[k + 1];
    });
    if (li !== L.asm && asmL && l.ops.length) { var end = l.ops[l.ops.length - 1]; node[end].feed = true; feeds.push(end); }
    else if (l.ops.length) starts.push(l.ops[0]);
    if (li !== L.asm) starts.push(l.ops[0]);
  });
  starts = starts.filter(function (o, i, a) { return a.indexOf(o) === i; });
  // position in the flow: sub-assembly lines first, the assembly line last (used to pull work downstream first)
  var rank = {}; L.lines.forEach(function (l, li) { l.ops.forEach(function (o, k) { var rk = (li === L.asm ? 10000 : 0) + k * 10 + li; if (rank[o] == null || rk > rank[o]) rank[o] = rk; }); });
  var join = asmL && feeds.length ? asmL.ops[0] : null, fbuf = {}; feeds.forEach(function (f) { fbuf[f] = 0; });
  if (join) starts = starts.filter(function (o) { return o !== join; });
  var push = !(p.rate > 0), interval = push ? 0 : bundle * 60 / p.rate, nextArr = push ? Infinity : 0;
  var opers = B.opers.map(function (o) { o.ops.forEach(function (op) { node[op].oper++; }); return { ops: o.ops, it: o.it, busy: false, until: 0, job: null, busyT: 0 }; });
  var noOper = Object.keys(node).filter(function (o) { return !node[o].oper || !node[o].sam; });
  function avail(o) {
    if (o === join) return Math.min.apply(null, feeds.map(function (f) { return fbuf[f]; }));
    if (push && starts.indexOf(o) >= 0) return Infinity;
    return node[o].q;
  }
  function take(o) { if (o === join) feeds.forEach(function (f) { fbuf[f]--; }); else if (!(push && starts.indexOf(o) >= 0)) node[o].q--; }
  var finished = 0, t = 0, lastHourStart = Math.max(0, TT - 60), finishedLast = 0;
  function deliver(o, at) {   // a bundle finished operation o
    node[o].done++;
    var n = node[o].next;
    if (n) { node[n].q++; if (!node[n].oper || !node[n].sam) { node[n].q--; deliver(n, at); } return; }
    if (node[o].feed) { fbuf[o]++; return; }
    if (at >= W0) finished++; if (at >= lastHourStart) finishedLast++;
  }
  // operations without operator or SAM pass bundles straight through (reported)
  function stat(dt) { if (t < W0) { dt = Math.max(0, t + dt - W0); if (!dt) return; } Object.keys(node).forEach(function (o) { var q = o === join ? 0 : (push && starts.indexOf(o) >= 0 ? 0 : node[o].q); node[o].qSum += q * dt; if (q > node[o].qMax) node[o].qMax = q; }); feeds.forEach(function (f) { node[f].fSum = (node[f].fSum || 0) + fbuf[f] * dt; node[f].fMax = Math.max(node[f].fMax || 0, fbuf[f]); }); }
  var guard = 0;
  while (guard++ < 500000) {
    // idle operators (least busy first) take the furthest-downstream operation that has work waiting: pieces are pulled to the end, WIP stays low
    opers.slice().sort(function (a, b) { return a.busyT - b.busyT; }).forEach(function (w) {
      if (w.busy) return;
      var best = null;
      w.ops.forEach(function (o) { if (!node[o].sam || !(avail(o) > 0)) return; if (best === null || rank[o] > rank[best]) best = o; });
      if (best) { take(best); w.busy = true; w.job = best; var d = bundle * node[best].sam / effOf(best, p.eff); w.until = t + d; w.busyT += Math.max(0, Math.min(t + d, TT) - Math.max(t, W0)); }
    });
    var next = nextArr;
    opers.forEach(function (w) { if (w.busy && w.until < next) next = w.until; });
    if (!isFinite(next) || next > TT) { stat(TT - t); t = TT; break; }
    stat(next - t); t = next;
    opers.forEach(function (w) { if (w.busy && w.until <= t + 1e-9) { w.busy = false; deliver(w.job, t); w.job = null; } });
    if (t >= nextArr - 1e-9) { starts.forEach(function (o) { node[o].q++; }); nextArr += interval; }
  }
  var rows = B.rows.map(function (r) {
    var n = node[r.op] || {};
    var endQ = r.op === join ? 0 : (push && starts.indexOf(r.op) >= 0 ? null : n.q);
    return Object.assign({}, r, { wipEnd: endQ == null ? null : endQ * bundle, wipMax: (n.qMax || 0) * bundle, wipAvg: (n.qSum || 0) / T * bundle, done: (n.done || 0) * bundle,
      feedEnd: n.feed ? fbuf[r.op] * bundle : null, feedMax: n.feed ? (n.fMax || 0) * bundle : null, start: starts.indexOf(r.op) >= 0, join: r.op === join });
  });
  var people = opers.length, samTot = Object.keys(node).reduce(function (a, o) { return a + node[o].sam; }, 0);
  var outH = finished * bundle / (T / 60);
  SIMR = { p: p, rows: rows, opers: opers.map(function (w) { return { it: w.it, ops: w.ops, util: w.busyT / T }; }), out: finished * bundle, outH: outH, outLast: finishedLast * bundle,
    capMin: B.capMin, bottleneck: B.bottleneck, people: people, samTot: samTot, lineEff: people ? outH * samTot / (people * 60) : 0, noOper: noOper, L: L, push: push, at: new Date().toISOString() };
  return SIMR;
}
/* WIP shown at a station (pieces): the operation's waiting WIP shared by its stations */
function simWipOf(it) {
  if (!SIMR || it.kind !== 'mc') return null;
  var w = 0, any = false;
  opsOf(it).forEach(function (o) { SIMR.rows.forEach(function (r) { if (r.op === o) { var v = r.wipEnd != null ? r.wipEnd : 0; if (r.feedEnd != null) v += r.feedEnd; w += v / Math.max(1, r.stations); any = true; } }); });
  return any ? Math.round(w) : null;
}
/* ---------- tab "Mô phỏng WIP" ---------- */
function simParams() {
  return { hours: Math.max(0.5, num($('smHours').value, 8)), eff: Math.max(0.05, Math.min(1.5, num($('smEff').value, 80) / 100)), bundle: Math.max(1, Math.round(num($('smBundle').value, 10))),
    rate: $('smMode').value === 'rate' ? Math.max(1, num($('smRate').value, 60)) : 0, wipWarn: Math.max(1, num($('smWarn').value, 30)), warm: $('smWarm').checked };
}
/* defaults from the layout file: its efficiency and target output (input at the target rate), unless edited */
function simDefaults() {
  var i = ST.info || {};
  if (!$('smEff').dataset.touched && i.eff) $('smEff').value = i.eff;
  if (!$('smRate').dataset.touched && i.target) $('smRate').value = i.target;
  if (!$('smMode').dataset.touched) { $('smMode').value = i.target ? 'rate' : 'push'; $('smRate').disabled = !i.target; }   // follows the file: its target output, else input always available
}
function renderSim() {
  if (!$('paneSim')) return;
  var i = ST.info || {};
  simDefaults();
  var p = simParams(), B = simBalance(p.eff), r = SIMR, rowsBy = {};
  if (r) r.rows.forEach(function (x) { rowsBy[x.op] = x; });
  var takt = i.target ? 60 / i.target : 0, missing = B.rows.filter(function (x) { return !x.sam; }).map(function (x) { return x.op; });
  var comb = {};   // operations done on the same machine (layout label "37/42")
  ST.items.forEach(function (it) { if (it.kind !== 'mc') return; var ops = opsOf(it); if (ops.length > 1) ops.forEach(function (o) { ops.forEach(function (q) { if (q !== o) { comb[o] = comb[o] || []; if (comb[o].indexOf(q) < 0) comb[o].push(q); } }); }); });
  $('smSrc').innerHTML = esc(B.L.fromSeq ? t('simSrcSeq', [B.L.lines.length]) : t('simSrcDef')) + (B.L.added && B.L.added.length ? ' · ' + esc(t('simCombAdd', [B.L.added.join(', ')])) : '') + ((ST.opsOff || []).length ? ' · ' + esc(t('simOff', [ST.opsOff.map(function (x) { return x.op; }).join(', ')])) : '') + ' · ' + esc(B.hc ? t('simHC', [B.hc, B.onPlan]) : t('simOpers', [B.opers.length])) +
    (B.hc && B.hc !== B.onPlan ? ' · ' + esc(t(B.hc > B.onPlan ? 'simHCplus' : 'simHCminus', [B.rows.filter(function (x) { return x.adj; }).map(function (x) { return x.op + ' ' + (x.adj > 0 ? '+' : '') + x.adj; }).join(', ')])) : '') +
    (missing.length ? '<div class="t-warn tagline">⚠ ' + esc(t('simNoSam', [missing.join(', ')])) + '</div>' : '');
  var maxCap = Math.max.apply(null, B.rows.map(function (x) { return isFinite(x.cap) ? x.cap : 0; }).concat([1]));
  $('smTable').innerHTML = '<table><tr><th>' + esc(t('simOp')) + '</th><th>' + esc(t('simMc')) + '</th><th class="n">SAM</th><th class="n">' + esc(t('simSt')) + '</th><th class="n">' + esc(t('simPeople')) + '</th><th class="n">' + esc(t('simEffCol')) + '</th><th class="n">' + esc(t('simCap')) + '</th><th style="width:24%">' + esc(t('simLoad')) + '</th>' +
    (r ? '<th class="n">' + esc(t('simWipEnd')) + '</th><th class="n">' + esc(t('simWipMax')) + '</th>' : '') + '</tr>' +
    B.rows.map(function (x) {
      var bn = B.bottleneck.indexOf(x.op) >= 0, rr = rowsBy[x.op], wip = rr ? (rr.wipEnd != null ? rr.wipEnd : 0) + (rr.feedEnd || 0) : 0;
      var cls = bn ? ' class="bn"' : (rr && wip >= p.wipWarn ? ' class="wip"' : '');
      var w = isFinite(x.cap) ? Math.round(100 * x.cap / maxCap) : 100;
      // load = output needed (the target, else the slowest operation) / capacity of this operation
      var need = i.target || B.capMin, load = isFinite(x.cap) && x.cap > 0 && need ? Math.round(100 * need / x.cap) : null;
      return '<tr' + cls + ' data-op="' + esc(x.op) + '"><td><button class="rmop" data-rmop="' + esc(x.op) + '" title="' + esc(t('simRmOp')) + '">✕</button> <b>' + esc(x.op) + '</b>' + (comb[x.op] ? ' <span class="tag t-info" title="' + esc(t('simComb', [comb[x.op].join(', ')])) + '">⇄ ' + esc(comb[x.op].join(', ')) + '</span>' : '') + (bn ? ' <span class="tag t-bad">' + esc(t('simBn')) + '</span>' : '') + '</td><td>' + esc(x.mc) + '</td>' +
        '<td class="n"><input style="width:84px" type="number" step="0.0001" min="0" data-sam="' + esc(x.op) + '" value="' + (x.sam || '') + '"></td><td class="n">' + x.stations + '</td><td class="n">' + x.people.toFixed(2) + (x.adj ? ' <span class="tag ' + (x.adj > 0 ? 't-info' : 't-warn') + '">' + (x.adj > 0 ? '+' : '') + x.adj + '</span>' : '') + '</td>' +
        '<td class="n"><input style="width:62px" type="number" step="1" min="5" max="150" data-eff="' + esc(x.op) + '" value="' + (x.effOwn ? Math.round(x.eff * 100) : '') + '" placeholder="' + Math.round(p.eff * 100) + '"></td>' +
        '<td class="n">' + (isFinite(x.cap) ? Math.round(x.cap) : '∞') + '</td><td><div class="bar"><i style="width:' + w + '%;background:' + (bn || (load && load > 100) ? 'var(--bad)' : 'var(--accent)') + '"></i>' + (takt ? '<b style="left:' + Math.min(100, Math.round(100 * (i.target || 0) / maxCap)) + '%"></b>' : '') +
        '<span class="barT">' + (isFinite(x.cap) ? Math.round(x.cap) + ' ' + esc(t('simPcsH')) : '∞') + (load != null ? ' · ' + esc(t('simLoadPct', [load])) : '') + '</span></div></td>' +
        (r ? '<td class="n">' + (rr && rr.wipEnd == null ? '<span class="muted">∞</span>' : wip) + '</td><td class="n">' + (rr ? rr.wipMax + (rr.feedMax || 0) : '') + '</td>' : '') + '</tr>';
    }).join('') + '</table>';
  if (!r) { $('smRes').innerHTML = '<div class="muted">' + esc(t('simPress')) + '</div>'; return; }
  var hot = r.rows.map(function (x) { return { op: x.op, w: (x.wipEnd || 0) + (x.feedEnd || 0) }; }).filter(function (x) { return x.w >= p.wipWarn; }).sort(function (a, b) { return b.w - a.w; });
  var byOp = {}; r.opers.forEach(function (o) { o.ops.forEach(function (op) { (byOp[op] = byOp[op] || []).push(o.util); }); });
  var low = Object.keys(byOp).filter(function (op) { return samOf(op) > 0; }).map(function (op) { var u = byOp[op]; return { op: op, util: u.reduce(function (a, b) { return a + b; }, 0) / u.length }; }).filter(function (x) { return x.util < 0.6; }).sort(function (a, b) { return a.util - b.util; });
  var sug = [];
  if (r.bottleneck.length) sug.push(t('simSugBn', [r.bottleneck.join(', '), Math.round(r.capMin)]));
  if (hot.length) sug.push(t('simSugWip', [hot.slice(0, 4).map(function (x) { return x.op + ' (' + x.w + ')'; }).join(', ')]));
  if (low.length && r.bottleneck.length) sug.push(t('simSugLow', [low.slice(0, 4).map(function (o) { return o.op + ' ' + Math.round(o.util * 100) + '%'; }).join(', '), r.bottleneck[0]]));
  if (r.noOper.length) sug.push(t('simSugNo', [r.noOper.join(', ')]));
  $('smRes').innerHTML = '<div class="kpis">' +
    '<div><span>' + esc(t('simOut')) + '</span><b>' + Math.round(r.outH) + '</b><i>' + esc(t('simPcsH')) + '</i></div>' +
    '<div><span>' + esc(t('simCapMin')) + '</span><b>' + Math.round(r.capMin) + '</b><i>' + esc(t('simPcsH')) + '</i></div>' +
    (i.target ? '<div><span>' + esc(t('simTarget')) + '</span><b>' + i.target + '</b><i>' + esc(t('simPcsH')) + '</i></div>' : '') +
    '<div><span>' + esc(t('simLineEff')) + '</span><b>' + Math.round(r.lineEff * 100) + '%</b><i>' + esc(t('simPeopleN', [r.people])) + '</i></div>' +
    '<div><span>' + esc(t('simWipTot')) + '</span><b>' + r.rows.reduce(function (a, x) { return a + (x.wipEnd || 0) + (x.feedEnd || 0); }, 0) + '</b><i>' + esc(t('simPcs')) + '</i></div></div>' +
    '<ul class="sug">' + sug.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
    '<details><summary>' + esc(t('simUtil')) + '</summary><div class="small">' + r.opers.slice().sort(function (a, b) { return b.util - a.util; }).map(function (o) { return esc(label(o.it)) + ' ' + Math.round(o.util * 100) + '%'; }).join(' · ') + '</div></details>';
}
function initSim() {
  $('smRun').onclick = function () { var p = simParams(); simRun(p); OPT.wip = true; $('optWip').checked = true; renderSim(); render2d(); toast(t('simDone', [Math.round(SIMR.outH)])); };
  ['smEff', 'smRate'].forEach(function (id) { $(id).addEventListener('input', function () { this.dataset.touched = '1'; }); });
  $('smMode').onchange = function () { this.dataset.touched = '1'; $('smRate').disabled = this.value !== 'rate'; };
  $('smTable').addEventListener('change', function (e) {
    var op = e.target.dataset.sam || e.target.dataset.eff; if (!op) return;
    ST.ops = ST.ops || {};
    if (e.target.dataset.sam) ST.ops[op] = Object.assign({}, ST.ops[op], { sam: Math.max(0, num(e.target.value, 0)) });
    else { var ev = num(e.target.value, 0); ST.ops[op] = Object.assign({}, ST.ops[op], { eff: ev > 0 ? Math.min(150, ev) : 0 }); }   // empty = general efficiency
    SIMR = null; commit(); setTimeout(renderSim, 0);   // redraw after the input has lost focus
  });
  $('smTable').addEventListener('click', function (e) {
    var rm = e.target.closest('[data-rmop]'); if (rm) { if (removeOp(rm.dataset.rmop, true)) renderSim(); return; }
    var tr = e.target.closest('tr[data-op]'); if (!tr || e.target.tagName === 'INPUT') return;
    SEL = ST.items.filter(function (it) { return it.kind === 'mc' && opsOf(it).indexOf(tr.dataset.op) >= 0; }).map(function (it) { return it.id; });
    setTab('plan'); onSelChange(); render2d();
  });
  $('smToPlan').onclick = function () { OPT.wip = true; $('optWip').checked = true; setTab('plan'); };
}
