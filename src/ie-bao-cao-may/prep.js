// ===================== MACHINE GROUP ANALYSIS + PREP (pure functions) =====================
var PREP_DEFAULT = { ratios: { BT1M: 0.5 }, days: 3 };
function baseKey(s) { return skey(s).replace(/\(.*$/, ''); }                // style without (size) and suffix
function dk(d) { return d instanceof Date ? Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) : null; }
function dFromKey(k) { var d = new Date(k); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
// MACHINE BY LINE: Line | Date | GOP | Style No | MACHINE GROUP | Qty
function loadMbl(aoa) {
  var h = aoa[0] || [], c = { l: findCol(h, 'Line'), d: findCol(h, 'Date'), s: findCol(h, 'Style No'), g: findCol(h, 'MACHINE GROUP'), q: findCol(h, 'Qty') };
  var lines = {}, byGroup = {}, dates = {};
  aoa.slice(1).forEach(function (r) {
    var d = dk(r[c.d]), l = String(r[c.l] || '').trim(), s = String(r[c.s] || '').trim(), g = String(r[c.g] || '').trim(), q = +r[c.q] || 0;
    if (d == null || !l || !s || /^(not\s*set\s*up|n\/a|-)$/i.test(s)) return;           // idle line, not a style
    dates[d] = 1;
    var L = lines[l] = lines[l] || {}, D = L[d] = L[d] || {}, S = D[s] = D[s] || {};
    if (g && q) { S[g] = (S[g] || 0) + q; var B = byGroup[g] = byGroup[g] || {}; B[d] = (B[d] || 0) + q; }
  });
  return { lines: lines, byGroup: byGroup, dates: Object.keys(dates).map(Number).sort(function (a, b) { return a - b; }) };
}
// MC STATUS: "MC used for PDN" per machine group, plus every column of its formula with its sign
// e.g. =(D3+F3+G3)-(E3+H3+...)  ->  + Machine in house, + RENT, + BORROW, - BROKEN, - LENDING, - TRA ...
function formulaSigns(f) {
  var out = {}, stack = [1], sign = 1, i = 0, src = String(f || '').replace(/^=/, '').replace(/\s+/g, '');
  while (i < src.length) {
    var ch = src[i];
    if (ch === '+') { sign = 1; i++; } else if (ch === '-') { sign = -1; i++; }
    else if (ch === '(') { stack.push(stack[stack.length - 1] * sign); sign = 1; i++; }
    else if (ch === ')') { stack.pop(); sign = 1; i++; }
    else { var m = src.slice(i).match(/^\$?([A-Z]{1,3})\$?\d+/); if (m) { out[m[1]] = stack[stack.length - 1] * sign; i += m[0].length; sign = 1; } else i++; }
  }
  return out;
}
function loadAvail(aoa, groups, ws) {
  var hi = aoa.findIndex(function (r) { return r.some(function (x) { return norm(x) === 'machinecode'; }); }); if (hi < 0) return {};
  var h = aoa[hi], ci = findCol(h, 'Machine code'), ui = h.findIndex(function (x) { return /^mcusedforpdn/.test(norm(x)); }), av = {}, comp = {};
  if (ui < 0) return av;
  // signs from the formula of the first data row; fallback: RENT / BORROW / in house add, the rest subtract
  var sign = {}, f = null;
  if (ws) for (var r = hi + 1; r < Math.min(aoa.length, hi + 30) && !f; r++) { var c = ws[XLSX.utils.encode_cell({ r: r, c: ui })]; if (c && c.f) f = c.f; }
  var bySign = f ? formulaSigns(f) : null;
  for (var c2 = 0; c2 < ui; c2++) {
    var name = String(h[c2] || '').trim(); if (!name || c2 <= ci + 1) continue;
    var col = XLSX.utils.encode_col(c2);
    if (bySign) { if (bySign[col]) sign[c2] = bySign[col]; }
    else sign[c2] = /in\s*house|^rent|^borrow/i.test(name) ? 1 : -1;
  }
  var cols = Object.keys(sign).map(Number);
  aoa.slice(hi + 1).forEach(function (row) {
    var code = skey(row[ci]); if (!code) return;
    var g = groups[code] || code, e = comp[g] = comp[g] || {};
    av[g] = (av[g] || 0) + (+row[ui] || 0);
    cols.forEach(function (k) { var v = +row[k] || 0; if (v) e[k] = (e[k] || 0) + v; });
  });
  av.__parts = { cols: cols.map(function (k) { return { idx: k, name: String(h[k]).trim(), sign: sign[k] }; }), byGroup: comp, formula: f || '' };
  return av;
}
function loadPuList(aoa) { var m = {}, h = aoa[0] || [], li = findCol(h, 'Line'), pi = findCol(h, 'PU'); aoa.slice(1).forEach(function (r) { var l = String(r[li] || '').trim().toUpperCase(); if (l) m[l] = String(r[pi] || '').trim(); }); return m; }
function puOf(m, line) { var k = String(line).trim().toUpperCase(); if (m[k]) return m[k]; var b = k.match(/^[^\-_ (]+/); return (b && m[b[0]]) || '?'; }
// demand from the latest plan x MACHINE DATABASE (latest date per style, totals per machine group) = MACHINE BY LINE
function buildDemand(planAoa, db, groups) {
  var h = planAoa[0] || [], li = findCol(h, 'Line'), di = findCol(h, 'Date'), si = findCol(h, 'Style No'), gi = findCol(h, 'GOP');
  var aoa = [['Line', 'Date', 'GOP', 'Style No', 'MACHINE GROUP', 'Qty']], missing = {}, cache = {};
  planAoa.slice(1).forEach(function (r) {
    var style = String(r[si] == null ? '' : r[si]).trim(); if (!style || /^(not\s*set\s*up|n\/a|-)$/i.test(style)) return;
    var k = skey(style), e = db.byKey[k];
    if (!e) { var m = missing[k] = missing[k] || { style: style, first: null, lines: {} }; var d = r[di]; if (d instanceof Date && (!m.first || d < m.first)) m.first = d; m.lines[String(r[li]).trim()] = 1;
      aoa.push([r[li], r[di], r[gi], style, '', 0]); return; }                 // keeps the line's style sequence right (no machines known)
    var gs = cache[k] = cache[k] || toGroups(e.set, groups);
    Object.keys(gs).forEach(function (g) { if (gs[g]) aoa.push([r[li], r[di], r[gi], style, g.indexOf('? ') === 0 ? g.slice(2) : g, gs[g]]); });
  });
  var out = loadMbl(aoa); out.missing = Object.keys(missing).map(function (k) { var m = missing[k]; return { style: m.style, first: m.first, lines: Object.keys(m.lines) }; });
  return out;
}
// what changed between the MC Report's MACHINE BY LINE and the latest plan (styles with machine data only), merged into date ranges
function planChanges(oldM, newM, fromKey, hasData) {
  var out = [], lines = {}; Object.keys(oldM.lines).concat(Object.keys(newM.lines)).forEach(function (l) { lines[l] = 1; });
  var pick = function (o) { return Object.keys(o || {}).filter(hasData).sort().join(' + '); };
  Object.keys(lines).sort().forEach(function (l) {
    var A = oldM.lines[l] || {}, B = newM.lines[l] || {}, days = {}, cur = null;
    Object.keys(A).concat(Object.keys(B)).forEach(function (d) { if (+d >= fromKey) days[d] = 1; });
    Object.keys(days).map(Number).sort(function (a, b) { return a - b; }).forEach(function (d) {
      var a = pick(A[d]), b = pick(B[d]);
      if (a === b) { cur = null; return; }
      if (cur && cur.old === a && cur.now === b) { cur.to = d; cur.days++; return; }
      cur = { line: l, from: d, to: d, days: 1, old: a, now: b }; out.push(cur);
    });
  });
  return out;
}
// risk ranking: available vs peak daily demand (+ flat %) over the next N days
function rankGroups(mbl, avail, fromKey, nDays, flat) {
  var to = fromKey + nDays * 864e5, out = [];
  Object.keys(mbl.byGroup).forEach(function (g) {
    var peak = 0, first = null, a = avail[g];
    mbl.dates.forEach(function (d) { if (d < fromKey || d > to || new Date(d).getUTCDay() === 0) return; var need = Math.ceil((mbl.byGroup[g][d] || 0) * (1 + flat)); if (need > peak) peak = need; if (a != null && need > a && first == null) first = d; });
    out.push({ group: g, avail: a, peak: peak, bal: a == null ? null : a - peak, first: first });
  });
  return out.sort(function (x, y) { return (x.bal == null) - (y.bal == null) || x.bal - y.bal || x.group.localeCompare(y.group); });
}
// which styles share a layout file (from the scan) + the manual "Dùng chung layout" list
function sharedIndex(files, manual) {
  var byStyle = {};
  (files || []).forEach(function (f) {
    if (f.status !== 'OK') return;
    var st = {}; (f.units || []).forEach(function (u) { expandStyles(u.styleText).forEach(function (s) { st[baseKey(s)] = 1; }); });
    if (!Object.keys(st).length) expandStyles(f.name).forEach(function (s) { st[baseKey(s)] = 1; });
    Object.keys(st).forEach(function (k) { (byStyle[k] = byStyle[k] || {})['F:' + f.path] = f.name; });
  });
  (manual || []).forEach(function (m, i) { (m.styles || []).forEach(function (s) { (byStyle[baseKey(s)] = byStyle[baseKey(s)] || {})['M:' + i] = 'list ' + (m.by || ''); }); });
  return function (a, b) {
    var x = byStyle[baseKey(a)], y = byStyle[baseKey(b)]; if (!x || !y || baseKey(a) === baseKey(b)) return baseKey(a) === baseKey(b) ? 'same style' : null;
    for (var k in x) if (y[k]) return k[0] === 'F' ? 'file' : 'list';
    return null;
  };
}
// prep rows for the chosen groups: every style that starts on a line (not running there the previous working day)
function buildPrep(mbl, groups, rules, share, puMap, fromKey, toKey) {
  var rows = [], seen = {}, D = mbl.dates;
  Object.keys(mbl.lines).forEach(function (line) {
    var L = mbl.lines[line], own = D.filter(function (d) { return L[d]; });   // the line's own scheduled days (Sundays included when planned)
    own.forEach(function (d, i) {
      if (i === 0 || d < fromKey || d > toKey) return;                       // first day of the line in the plan: already running, no prep
      var before = Object.keys(L[own[i - 1]]);
      Object.keys(L[d]).forEach(function (B) {
        if (before.indexOf(B) >= 0) return;
        var same = null; before.forEach(function (A) { if (!same) same = share(A, B); });
        groups.forEach(function (g) {
          var q = L[d][B][g] || 0, r = rules.ratios[g] != null ? rules.ratios[g] : 0; if (!q || !(r > 0)) return;
          var key = [line, before.join(' + '), B, g].join('|'); if (seen[key + '|' + d]) return; seen[key + '|' + d] = 1;
          var n = rules.daysBy && rules.daysBy[g] || rules.days, days = [];
          for (var t = d - 864e5, k = 0; days.length < n && k < 14; t -= 864e5, k++) if (new Date(t).getUTCDay() !== 0) days.unshift(t);   // prep on the N days before loading, Sundays skipped
          rows.push({ key: key, line: line, pu: puOf(puMap, line), from: before.join(' + '), to: B, group: g, load: d, qtyB: q, ratio: r, days: days, prep: Math.ceil(r * q - 1e-9), same: same });
        });
      });
    });
  });
  return rows.sort(function (a, b) { return a.days[0] - b.days[0] || a.line.localeCompare(b.line); });
}
// IE Tech decisions: KEEP / ADJUST / REMOVE, latest per key
function applyReviews(rows, reviews) {
  var last = {}; (reviews || []).slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).forEach(function (r) { last[r.key] = r; });
  rows.forEach(function (x) {
    var r = last[x.key]; x.review = r || null; x.flags = [];
    if (r && (r.loadDateActual || r.prepDays)) {                              // IE Tech set the real loading date and / or the number of prep days
      var L = r.loadDateActual ? Date.parse(r.loadDateActual + 'T00:00:00Z') : x.load;
      x.days = prepDaysBefore(L, r.prepDays || x.days.length);
      if (r.loadDateActual && L !== x.load) { x.loadActual = L; x.flags.push('dateSet'); }
      if (r.prepDays) x.flags.push('daysSet');
    }
    if (!r) { x.status = x.same ? 'AUTO_SKIP' : 'PENDING'; x.eff = x.same ? 0 : x.prep; return; }
    if (r.loadDate && r.loadDate !== new Date(x.load).toISOString().slice(0, 10)) x.flags.push('dateMoved');
    if (r.decision === 'REMOVE') { x.status = 'REMOVED'; x.eff = 0; return; }
    if (r.decision === 'ADJUST') {
      if (r.qtyB != null && r.qtyB !== x.qtyB) { x.status = 'PENDING'; x.eff = x.prep; x.flags.push('qtyChanged'); return; }
      x.status = 'ADJUSTED'; x.eff = +r.qty || 0; return;
    }
    x.status = 'KEPT'; x.eff = r.qtyBActual != null ? Math.ceil(x.ratio * r.qtyBActual - 1e-9) : x.prep;
    if (r.qtyBActual != null) x.flags.push('layoutQty');
  });
  return rows;
}
// ---- end date of the running style (set by IE Tech): record { line, style, endDate:'YYYY-MM-DD' | '', planEnd, by, at } ----
function nextWorkDayMs(ms) { var d = ms + 864e5; while (new Date(d).getUTCDay() === 0) d += 864e5; return d; }
function latestEnds(list) {
  var m = {}; (list || []).slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).forEach(function (r) { if (r && r.line && r.style) m[r.line + '|' + r.style] = r; });
  return m;
}
// the style running on the first scheduled day of the line
function runningStyle(styles, days) {
  var names = Object.keys(styles);
  for (var i = 0; i < days.length; i++) for (var k = 0; k < names.length; k++) if (styles[names[k]][days[i]] != null) return names[k];
  return null;
}
// last day of the first (currently running) run of style S: contiguous days from its first day
function runEnd(styles, S, days) {
  var q = styles[S]; if (!q) return null; var first = -1;
  for (var i = 0; i < days.length; i++) if (q[days[i]] != null) { first = i; break; }
  if (first < 0) return null; var last = first;
  for (var j = first + 1; j < days.length && q[days[j]] != null; j++) last = j;
  return days[last];
}
// the running style now ends on endMs: extended with its last quantity, or cut
function adjustRunningEnd(styles, S, endMs, days, msOf) {
  var q = styles[S]; if (!q) return; var last = runEnd(styles, S, days); if (last == null) return; var lastMs = msOf(last);
  if (endMs > lastMs) { var v = q[last]; days.forEach(function (d) { var m = msOf(d); if (m > lastMs && m <= endMs) q[d] = v; }); }
  else if (endMs < lastMs) days.forEach(function (d) { var m = msOf(d); if (m > endMs && m <= lastMs) delete q[d]; });
  if (!Object.keys(q).length) delete styles[S];
}
// first changeover after the running style (all machine groups): loading date = next working day after the end date
function applyEndsToRows(rows, ends, asIso) {
  var toMs = function (v) { return typeof v === 'number' ? v : Date.parse(v + 'T00:00:00Z'); };
  var out = function (ms) { return asIso ? new Date(ms).toISOString().slice(0, 10) : ms; };
  var firstLoad = {};
  rows.forEach(function (x) { if (!x.from) return; x.from.split(' + ').forEach(function (A) { var k = x.line + '|' + A, m = toMs(x.load); if (firstLoad[k] == null || m < firstLoad[k]) firstLoad[k] = m; }); });
  rows.forEach(function (x) {
    if (!x.from) return;
    x.from.split(' + ').forEach(function (A) {
      var k = x.line + '|' + A, e = ends[k]; if (!e || !e.endDate || toMs(x.load) !== firstLoad[k]) return;
      if (x.review && x.review.loadDateActual && String(x.review.at) > String(e.at)) return;      // a later explicit loading date wins
      var L = nextWorkDayMs(Date.parse(e.endDate + 'T00:00:00Z')); if (L === toMs(x.load)) return;
      x.days = prepDaysBefore(L, (x.days || []).length || 3).map(out); x.loadActual = out(L); x.flags = x.flags || []; if (x.flags.indexOf('endSet') < 0) x.flags.push('endSet');
    });
  });
}
// day grid for one group: production per line/style per day + prep rows + totals
// prep days: N working days before loading, Sundays skipped
function prepDaysBefore(loadMs, n) { var ds = []; for (var t = loadMs - 864e5, k = 0; ds.length < n && k < 40; t -= 864e5, k++) if (new Date(t).getUTCDay() !== 0) ds.unshift(t); return ds; }
// IE Tech moved the loading date: production on the line follows.
// earlier: the new style runs at its full quantity from the new date and replaces the previous style; later: the previous style continues until then
function shiftProduction(styles, x, loadMs, newMs, days, keyOf) {
  if (!newMs || newMs === loadMs || !x.to) return;
  var from = x.from ? x.from.split(' + ') : [], B = x.to;
  if (newMs < loadMs) days.forEach(function (d) {
    if (d < newMs || d >= loadMs) return; var k = keyOf(d);
    from.forEach(function (A) { if (styles[A]) { delete styles[A][k]; if (!Object.keys(styles[A]).length) delete styles[A]; } });
    (styles[B] = styles[B] || {})[k] = x.qtyB;
  });
  else {
    var A = from[0], aq = null;
    days.filter(function (d) { return d < loadMs; }).reverse().some(function (d) { var v = A && styles[A] && styles[A][keyOf(d)]; if (v) { aq = v; return true; } return false; });
    days.forEach(function (d) {
      if (d < loadMs || d >= newMs) return; var k = keyOf(d);
      if (styles[B]) { delete styles[B][k]; if (!Object.keys(styles[B]).length) delete styles[B]; }
      if (A && aq) (styles[A] = styles[A] || {})[k] = aq;
    });
  }
}
function groupGrid(mbl, group, prepRows, avail, fromKey, toKey, puMap, ends) {
  var days = mbl.dates.filter(function (d) { return d >= fromKey && d <= toKey && new Date(d).getUTCDay() !== 0; });   // working days only: Sundays are not shown or counted
  var lines = {}, prodTot = {}, prepTot = {};
  Object.keys(mbl.lines).forEach(function (line) {
    var L = mbl.lines[line], styles = {};
    days.forEach(function (d) { Object.keys(L[d] || {}).forEach(function (s) { var q = L[d][s][group] || 0; if (q) (styles[s] = styles[s] || {})[d] = q; }); });
    var run0 = ends ? runningStyle(styles, days) : null;
    prepRows.forEach(function (x) { if (x.group === group && x.line === line && x.loadActual) shiftProduction(styles, x, x.load, x.loadActual, days, function (d) { return d; }); });
    var e0 = run0 && ends[line + '|' + run0]; if (e0 && e0.endDate) adjustRunningEnd(styles, run0, Date.parse(e0.endDate + 'T00:00:00Z'), days, function (d) { return d; });
    if (Object.keys(styles).length) lines[line] = { styles: styles, prep: [] };
    Object.keys(styles).forEach(function (s) { Object.keys(styles[s]).forEach(function (d) { prodTot[d] = (prodTot[d] || 0) + styles[s][d]; }); });
  });
  prepRows.filter(function (x) { return x.group === group; }).forEach(function (x) {
    var L = lines[x.line] = lines[x.line] || { styles: {}, prep: [] }; L.prep.push(x);
    x.days.forEach(function (d) { if (x.eff) prepTot[d] = (prepTot[d] || 0) + x.eff; });
  });
  var order = Object.keys(lines).sort(function (a, b) { return puOf(puMap, a).localeCompare(puOf(puMap, b)) || a.localeCompare(b); });
  var a = avail[group], tot = {}, bal = {};
  days.forEach(function (d) { tot[d] = (prodTot[d] || 0) + (prepTot[d] || 0); bal[d] = a == null ? null : a - tot[d]; });
  return { days: days, lines: lines, order: order, prod: prodTot, prep: prepTot, total: tot, avail: a, bal: bal };
}

// ===================== RESIDUAL SHORTAGE after IE Tech's decisions, actions, what-if (pure functions) =====================
function isoMs(d) { return Date.parse(d + 'T00:00:00Z'); }
function msIso(ms) { return new Date(ms).toISOString().slice(0, 10); }
// Step 1: production per line/style after IE Tech's loading dates and end dates (the same adjustments as the IE Tech grid).
// G0 = latest proposal grid of the machine group (days as ISO strings), rows = prep rows of the group (decisions applied, dates as ISO), ends = latestEnds(...)
function adjustLines(G0, rows, ends) {
  var days = G0.days, dms = days.map(isoMs), G = { lines: {} }, runInfo = {};
  Object.keys(G0.lines).forEach(function (l) { var st = {}; Object.keys(G0.lines[l].styles).forEach(function (s) { st[s] = Object.assign({}, G0.lines[l].styles[s]); }); G.lines[l] = Object.assign({}, G0.lines[l], { styles: st }); });
  rows.forEach(function (x) { if (x.loadActual && G.lines[x.line]) shiftProduction(G.lines[x.line].styles, x, isoMs(x.load), isoMs(x.loadActual), dms, msIso); });
  Object.keys(G0.lines).forEach(function (l) {
    var run = runningStyle(G0.lines[l].styles, days); if (!run) return;
    var pe = runEnd(G0.lines[l].styles, run, days), e = ends && ends[l + '|' + run];
    runInfo[l] = { style: run, plan: pe, eff: e && e.endDate ? e.endDate : pe, edited: !!(e && e.endDate && e.endDate !== pe) };
    if (e && e.endDate) adjustRunningEnd(G.lines[l].styles, run, isoMs(e.endDate), days, isoMs);
  });
  return { G: G, runInfo: runInfo };
}
// Step 2: totals per day: production + prep (eff of the rows) against the machines available
function totalsOf(G, rows, days, avail) {
  var prodPu = {}, prepPu = {}, prod = {}, prep = {}, total = {}, bal = {};
  Object.keys(G.lines).forEach(function (l) { var L = G.lines[l]; Object.keys(L.styles).forEach(function (s) { Object.keys(L.styles[s]).forEach(function (d) { var k = L.pu + '|' + d; prodPu[k] = (prodPu[k] || 0) + L.styles[s][d]; prod[d] = (prod[d] || 0) + L.styles[s][d]; }); }); });
  rows.forEach(function (x) { if (!x.eff) return; (x.days || []).forEach(function (d) { var k = x.pu + '|' + d; prepPu[k] = (prepPu[k] || 0) + x.eff; prep[d] = (prep[d] || 0) + x.eff; }); });
  days.forEach(function (d) { total[d] = (prod[d] || 0) + (prep[d] || 0); bal[d] = avail == null ? null : avail - total[d]; });
  return { days: days, avail: avail, G: G, prodPu: prodPu, prepPu: prepPu, prod: prod, prep: prep, total: total, bal: bal };
}
function groupModel(G0, rows, ends) { var A = adjustLines(G0, rows, ends), M = totalsOf(A.G, rows, G0.days, G0.avail); M.runInfo = A.runInfo; return M; }
// shortage summary of a model: days below zero, the worst day, first and last short day
function shortSummary(bal, days) {
  var neg = days.filter(function (d) { return bal[d] != null && bal[d] < 0; }), worst = null;
  neg.forEach(function (d) { if (!worst || bal[d] < bal[worst]) worst = d; });
  return { n: neg.length, of: days.length, days: neg, worst: worst, gap: worst ? -bal[worst] : 0, first: neg[0] || null, last: neg[neg.length - 1] || null, sum: neg.reduce(function (s, d) { return s - bal[d]; }, 0) };
}
// actions of the Consolidator (one record per change, latest per id wins)
var ACTION_TYPES = ['RENT', 'BUY', 'BORROW', 'DELAY', 'OTHER'], ACTION_QTY = ['RENT', 'BUY', 'BORROW'];
function latestActions(list) {
  var m = {}; (list || []).slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).forEach(function (r) { if (r && r.id) m[r.id] = r; });
  return Object.keys(m).map(function (k) { return m[k]; });
}
// machines added per day by the actions of a group (cancelled ignored; delay / other carry no quantity): confirmed and still planned
function actionCover(actions, group, days) {
  var c = {}, p = {}; days.forEach(function (d) { c[d] = 0; p[d] = 0; });
  (actions || []).forEach(function (a) {
    if (a.group !== group || a.status === 'CANCELLED' || !(+a.qty > 0) || ACTION_QTY.indexOf(a.type) < 0) return;
    days.forEach(function (d) { if ((!a.from || d >= a.from) && (!a.to || d <= a.to)) { if (a.status === 'CONFIRMED') c[d] += +a.qty; else p[d] += +a.qty; } });
  });
  return { confirmed: c, planned: p };
}
// What-if: line `line` loads `style` n working days later. That style and every style after it on the line move, the style before it keeps running through the gap, their prep moves with them.
// Nothing is saved. Returns the totals of the scenario (same shape as groupModel) or null when the line / style is not in this group.
function delayModel(G0, rows, ends, line, style, n) {
  var A = adjustLines(G0, rows, ends), days = G0.days, idx = {}; days.forEach(function (d, i) { idx[d] = i; });
  var L = A.G.lines[line]; if (!L || !L.styles[style]) return null;
  var first = function (s) { var k = Object.keys(L.styles[s]).sort()[0]; return k || '9'; };
  var order = Object.keys(L.styles).sort(function (a, b) { return first(a).localeCompare(first(b)); }), at = order.indexOf(style), moved = order.slice(at), prev = at > 0 ? order[at - 1] : null;
  var old = {}; moved.forEach(function (s) { old[s] = L.styles[s]; });
  var gapStart = idx[first(style)];
  moved.forEach(function (s) {
    var q = {}; Object.keys(old[s]).forEach(function (d) { var j = idx[d] + n; if (idx[d] != null && j < days.length) q[days[j]] = old[s][d]; });
    if (Object.keys(q).length) L.styles[s] = q; else delete L.styles[s];
  });
  if (prev && L.styles[prev]) {
    var ks = Object.keys(L.styles[prev]).sort(), lastK = ks[ks.length - 1], v = L.styles[prev][lastK];
    for (var i = idx[lastK] + 1; i < gapStart + n && i < days.length; i++) L.styles[prev][days[i]] = v;
  }
  var rows2 = rows.map(function (x) {
    if (x.line !== line || moved.indexOf(x.to) < 0) return x;
    var y = Object.assign({}, x); y.days = (x.days || []).map(function (d) { return idx[d] != null && idx[d] + n < days.length ? days[idx[d] + n] : null; }).filter(Boolean); return y;
  });
  return totalsOf(A.G, rows2, days, G0.avail);
}
