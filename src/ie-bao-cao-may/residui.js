// ===================== RESIDUAL SHORTAGE (after IE Tech's decisions) + actions =====================
// Consolidator tab "Thiếu máy còn lại" (records actions) and the Supervisor role (read-only: can try actions, cannot save). Numbers come from the data folder only
// (latest proposal per machine group + IE Tech decisions + actions): the same calculation as the IE Tech grid (groupModel in prep.js). Tables are horizontal (days in columns).
// Every machine group that is short has its own action panel under its table; any action typed in the panel shows its result at once (preview rows in the table).
var RS = { openPU: {}, root: null, actions: [], actionsRaw: [], selG: null, selPU: null, view: 'short', edit: null, editG: '', forms: {}, cache: [], at: null };
function rsForm(g) { return RS.forms[g] || (RS.forms[g] = { type: 'RENT', area: '', qty: '', from: '', to: '', pu: '', line: '', style: '', date: '', status: 'PLANNED', note: '', touched: false, active: false }); }
async function rsLoad(root) {
  RS.root = root; await tLoadAll(root); RS.actionsRaw = await pReadDir(root, 'prep/actions'); RS.actions = latestActions(RS.actionsRaw); RS.at = new Date();
}
function rsCompute() {
  var rows = techRows(), ends = latestEnds(TS.ends), groups = {}, out = [];
  TS.props.forEach(function (p) { (p.groups || []).forEach(function (g) { groups[g] = 1; }); });
  Object.keys(groups).sort().forEach(function (g) {
    var G0 = latestGrid(g); if (!G0) return;
    var rg = rows.filter(function (x) { return x.group === g; }), M = groupModel(G0, rg, ends), st = actionStates(G0, rg, ends, M, RS.actions, g);
    out.push({ g: g, G0: G0, rows: rg, M: M, st: st, s: shortSummary(M.bal, M.days), s2: shortSummary(st.balC, M.days), s3: shortSummary(st.balA, M.days), pending: rg.filter(function (x) { return x.status === 'PENDING'; }).length });
  });
  return out.sort(function (a, b) { return b.s.gap - a.s.gap || a.g.localeCompare(b.g); });
}
function rsShortCount() { try { return TS.props && TS.props.length ? rsCompute().filter(function (x) { return x.s.gap > 0; }).length : 0; } catch (e) { return 0; } }
function rsRange(s) { return s.first ? d2(s.first) + (s.last !== s.first ? ' – ' + d2(s.last) : '') : ''; }
function rsGapCell(s, ok) { return s.gap > 0 ? '<span class="st-bad"><b>−' + s.gap + '</b> (' + esc(d2(s.worst)) + ')</span>' : '<span class="st-ok">' + esc(ok || t('rsEnough')) + '</span>'; }
function rsSelected() { return RS.cache.filter(function (x) { return !RS.selG || RS.selG[x.g]; }); }
function rsPUs(list) { var m = {}; list.forEach(function (x) { Object.keys(x.M.G.lines).forEach(function (l) { m[x.M.G.lines[l].pu] = 1; }); x.rows.forEach(function (r) { m[r.pu] = 1; }); }); return Object.keys(m).sort(function (a, b) { return puSort(a) - puSort(b) || a.localeCompare(b); }); }
// day columns of a group: the whole plan, or from its first to its last short day (days with enough machines between two short periods stay)
function rsGroupDays(X) {
  if (RS.view === 'all') return X.M.days;
  return X.s.first ? X.M.days.filter(function (d) { return d >= X.s.first && d <= X.s.last; }) : [];
}
function rsCell(v, neg, cls) { var n = v != null && v < 0; return '<td class="' + ((neg && n) ? 'neg' : (cls || '')) + '">' + (v == null || v === '' ? '' : v) + '</td>'; }
function rsRow(label, vals, days, o) {          // one horizontal row: sticky label (3 columns like the IE Tech grid) + one cell per day
  o = o || {};
  return '<tr class="' + (o.cls || '') + '"' + (o.attr || '') + '><td class="s1' + (o.l1 ? ' l' : '') + '">' + (o.c1 || '') + '</td><td class="l s2">' + (o.c2 || '') + '</td><td class="l s3">' + label + '</td>' + days.map(function (d) { return rsCell(vals ? vals[d] : '', o.neg, o.cellCls); }).join('') + '</tr>';
}
function rsSign(v) { return v ? (v > 0 ? '+' + v : '' + v) : ''; }
function rsAreas(X) { return (X.G0.parts || []).filter(function (p) { return p.sign < 0 && p.qty > 0; }); }      // MC STATUS columns that take machines away from production (lending, sample room, TRA, broken...)
function rsAreaLeft(X, name, d) {                                      // machines the area still holds on day d after the confirmed take-backs
  var p = rsAreas(X).filter(function (x) { return x.name === name; })[0], q = p ? p.qty : 0;
  RS.actions.forEach(function (a) { if (a.type === 'AREA' && a.status === 'CONFIRMED' && a.group === X.g && a.area === name && (!a.from || d >= a.from) && (!a.to || d <= a.to)) q -= +a.qty || 0; });
  return Math.max(0, q);
}
function rsActText(a) {
  if (a.type === 'DELAY') return a.from && a.to ? t('rsActDelayTxt2', [a.style, a.line, d2(a.from), d2(a.to), a.n]) : t('rsActDelayTxt', [a.style, a.line, a.n]);
  return t('rsAt' + a.type) + (a.area ? ' ' + a.area : '') + (a.qty ? ' ' + (a.qty > 0 ? '+' : '') + a.qty : '') + (a.from ? ' (' + d2(a.from) + (a.to && a.to !== a.from ? '–' + d2(a.to) : '') + ')' : '') + (a.pu ? ' · ' + a.pu : '');
}
function rsActLabel(a, edit, g, applied) {
  var tag = (applied ? '<span class="tag t-info">' + esc(t('rsApplied')) + '</span> ' : '') + '<span class="tag ' + (a.status === 'CONFIRMED' ? 't-ok' : a.status === 'CANCELLED' ? 't-bad' : 't-warn') + '">' + esc(t('rsSt' + a.status)) + '</span>', cx = a.status === 'CANCELLED';
  var btn = edit && !cx ? '<button class="qa" data-rs-edit="' + esc(a.id) + '" data-rsg="' + esc(g) + '" title="' + esc(t('rsEditBtn')) + '">✎</button>' + (a.status === 'PLANNED' ? '<button class="qa" data-rs-conf="' + esc(a.id) + '" title="' + esc(t('rsConfirmBtn')) + '">✔</button>' : '') + '<button class="qa" data-rs-cancel="' + esc(a.id) + '" title="' + esc(t('rsCancelBtn')) + '">✖</button>' : '';
  return '<span style="' + (cx ? 'text-decoration:line-through;opacity:.6' : '') + '">↳ ' + esc(rsActText(a)) + '</span> ' + tag + ' <span class="muted small">' + esc((a.by || '') + (a.note ? ' · ' + a.note : '')) + '</span>' + btn;
}
// ----- the action typed in a group's panel (hypothetical until saved)
function rsDelayInfo(X, f) {          // current loading day of the style on the line, the chosen day snapped to a working day, and the number of working days between them
  var L = X.M.G.lines[f.line]; if (!L || !L.styles[f.style]) return null;
  var cur = Object.keys(L.styles[f.style]).sort()[0], days = X.M.days, i0 = days.indexOf(cur);
  if (!f.date) return { cur: cur, to: null, n: 0 };
  var j = days.findIndex(function (d) { return d >= f.date; });
  return j < 0 ? { cur: cur, to: null, n: 0, out: true } : { cur: cur, to: days[j], n: j - i0 };
}
function rsStylesOf(X, line) {
  var L = X.M.G.lines[line]; if (!L) return [];
  var first = function (s) { return Object.keys(L.styles[s]).sort()[0] || '9'; };
  return Object.keys(L.styles).sort(function (a, b) { return first(a).localeCompare(first(b)); });
}
function rsDefaults(X, f) {
  var lines = Object.keys(X.M.G.lines).filter(function (l) { return rsStylesOf(X, l).length; }).sort();
  if (f.type === 'DELAY') {
    if (lines.indexOf(f.line) < 0) {                                    // default line: the one using most machines on the worst day
      var w = X.s.worst, best = null, bn = -1; lines.forEach(function (l) { var n = 0; Object.keys(X.M.G.lines[l].styles).forEach(function (s) { n += X.M.G.lines[l].styles[s][w] || 0; }); if (rsStylesOf(X, l).length > 1 && n > bn) { bn = n; best = l; } });
      f.line = best || lines[0] || ''; f.style = ''; f.date = '';
    }
    var st = rsStylesOf(X, f.line);
    if (st.indexOf(f.style) < 0) { f.style = st[1] || st[0] || ''; f.date = ''; }
    if (!f.date) { var inf = rsDelayInfo(X, f); if (inf) { var i = X.M.days.indexOf(inf.cur); f.date = X.M.days[i + 1] || inf.cur; } }
  } else if (f.type === 'AREA') {
    var ar = rsAreas(X); if (!ar.some(function (x) { return x.name === f.area; })) { f.area = ar[0] ? ar[0].name : ''; f.touched = false; }
    if (!f.touched && !(RS.edit && RS.editG === X.g)) { var aq = (ar.filter(function (x) { return x.name === f.area; })[0] || {}).qty || 0; f.qty = Math.min(X.s.gap || 0, aq) || ''; f.from = X.s.first || ''; f.to = X.s.last || ''; }
  } else if (['RENT', 'BUY', 'BORROW'].indexOf(f.type) >= 0 && !f.touched && !(RS.edit && RS.editG === X.g)) { f.qty = X.s.gap || ''; f.from = X.s.first || ''; f.to = X.s.last || ''; }    // default: cover the worst gap over the short period
  return lines;
}
function rsFormAction(X, f) {
  var ty = f.type, qty = f.qty === '' ? 0 : +f.qty;
  if (ty === 'DELAY') { var inf = rsDelayInfo(X, f); return inf && inf.to && inf.n > 0 ? { id: RS.edit || '__new', type: 'DELAY', group: '*', line: f.line, style: f.style, from: inf.cur, to: inf.to, n: inf.n, status: 'CONFIRMED', note: f.note } : null; }
  if (ty !== 'OTHER' && !(qty > 0)) return null;
  if (ty === 'AREA') { var pa = rsAreas(X).filter(function (x) { return x.name === f.area; })[0]; if (!pa || qty > pa.qty) return null; }
  if (qty && (!f.from || !f.to || f.from > f.to)) return null;
  return { id: RS.edit || '__new', type: ty, group: X.g, area: ty === 'AREA' ? f.area : '', qty: qty || null, from: f.from, to: f.to, pu: f.pu, status: 'CONFIRMED', note: f.note };
}
// instant result: the change of this action on the confirmed balance of the group (and, for a date move, on the other groups of the line)
function rsPreview(X, f) {
  var a = rsFormAction(X, f); if (!a) return null;
  var ends = latestEnds(TS.ends), others = RS.actions.filter(function (x) { return x.id !== RS.edit; }), withA = others.concat([a]), out = { a: a, rows: [] };
  (a.type === 'DELAY' ? RS.cache : [X]).forEach(function (Y) {
    var s0 = actionStates(Y.G0, Y.rows, ends, Y.M, others, Y.g), s1 = actionStates(Y.G0, Y.rows, ends, Y.M, withA, Y.g), delta = {};
    Y.M.days.forEach(function (d) { delta[d] = s0.balC[d] == null ? 0 : s1.balC[d] - s0.balC[d]; });
    out.rows.push({ g: Y.g, s1: s1, delta: delta, changed: Y.M.days.some(function (d) { return delta[d]; }), A: shortSummary(s0.balC, Y.M.days), B: shortSummary(s1.balC, Y.M.days) });
  });
  out.self = out.rows.filter(function (r) { return r.g === X.g; })[0]; return out;
}
function rsTableInner(X, days, edit, pv) {
  var m = X.M, st = X.st, puSel = RS.selPU, pus = rsPUs([X]).filter(function (p) { return !puSel || puSel[p]; });
  var h = '<table class="pg" data-rs-block="' + esc(X.g) + '"><tr><th class="l s1">PU</th><th class="l s2"></th><th class="l s3">' + t('rsThDay') + '</th>' + days.map(function (d) { return '<th>' + esc(dw(d)) + '</th>'; }).join('') + '</tr>';
  pus.forEach(function (p) {
    var pv_ = {}, rv = {}, tv = {}; days.forEach(function (d) { pv_[d] = m.prodPu[p + '|' + d] || 0; rv[d] = m.prepPu[p + '|' + d] || 0; tv[d] = pv_[d] + rv[d]; });
    h += rsRow(esc(t('pgPuSum', [puName(p), t('rsRowProd')])), pv_, days, { cls: 'pusum', attr: ' data-rs-pu="' + esc(p) + '"', c1: esc(puName(p)), l1: 1 }) + rsRow(esc(t('pgPuSum', [puName(p), t('rsRowPrep')])), rv, days, { cls: 'pusum' }) + rsRow(esc(t('pgPuSum', [puName(p), t('rsRowTot')])), tv, days, { cls: 'tot' });
  });
  var av = {}; days.forEach(function (d) { av[d] = m.avail; });
  h += rsRow(esc(t('rsRowUse')), m.total, days, { cls: 'tot', attr: ' data-rs-r="use"' }) + rsRow(esc(t('rsRowAvail')), av, days, { cls: 'tot', attr: ' data-rs-r="avail"' }) + rsRow(esc(t('rsRowBal')), m.bal, days, { cls: 'tot', attr: ' data-rs-r="bal"', neg: 1 });
  RS.actions.filter(function (a) { return a.type === 'DELAY' ? !!X.G0.lines[a.line] : a.group === X.g; }).forEach(function (a) {
    var e = st.eff[a.id] || {};
    h += '<tr data-rs-r="act" data-id="' + esc(a.id) + '"><td class="s1"></td><td class="l s2"></td><td class="l s3">' + rsActLabel(a, edit, X.g, st.applied[a.id]) + '</td>' + days.map(function (d) { var v = e[d] || 0; return '<td class="' + (v < 0 ? 'neg' : (v > 0 ? 'ok' : '')) + '">' + rsSign(v) + '</td>'; }).join('') + '</tr>';
  });
  var areas = rsAreas(X);
  if (areas.length) {
    h += '<tr class="part" data-rs-r="areahdr"><td class="s1"></td><td class="l s2"></td><td class="l s3" colspan="1"><b>' + esc(t('rsAreaHdr')) + '</b></td>' + days.map(function () { return '<td></td>'; }).join('') + '</tr>';
    areas.forEach(function (p) {
      var v = {}; days.forEach(function (d) { v[d] = rsAreaLeft(X, p.name, d); });
      h += rsRow('− ' + esc(p.name) + ' <button class="qa" data-rs-area="' + esc(X.g + '|' + p.name) + '" title="' + esc(t('rsAreaTake')) + '">↩ ' + esc(t('rsAreaTake')) + '</button>', v, days, { cls: 'part', attr: ' data-rs-r="area" data-area="' + esc(p.name) + '"' });
    });
  }
  if (st.all.length) h += rsRow('<b>' + esc(t('rsRowBalC')) + '</b>', st.balC, days, { cls: 'tot', attr: ' data-rs-r="balC"', neg: 1 }) + rsRow('<b>' + esc(t('rsRowBalA')) + '</b>', st.balA, days, { cls: 'tot', attr: ' data-rs-r="balA"', neg: 1 });
  if (pv && pv.self && pv.self.changed) {                        // the action being typed: its change and the result if confirmed
    var r = pv.self;
    h += '<tr class="pv" data-rs-r="pvDelta"><td class="s1"></td><td class="l s2"></td><td class="l s3"><b>' + esc(t('rsPvDelta')) + '</b></td>' + days.map(function (d) { var v = r.delta[d] || 0; return '<td class="' + (v < 0 ? 'neg' : v > 0 ? 'ok' : '') + '">' + rsSign(v) + '</td>'; }).join('') + '</tr>' + rsRow('<b>' + esc(t('rsPvAfter')) + '</b>', r.s1.balC, days, { cls: 'tot pv', attr: ' data-rs-r="pvAfter"', neg: 1 });
  }
  return h + '</table>';
}
function rsResultHtml(X, f, edit) {
  if (!f.active) return '<span class="muted small">' + esc(t('rsPrevIdle')) + '</span>';
  var pv = rsPreview(X, f);
  if (!pv) {
    if (f.type === 'DELAY') { var inf = rsDelayInfo(X, f); return '<span class="muted small">' + esc(inf && inf.out ? t('rsDelayOut') : (inf && inf.to && inf.n <= 0 ? t('rsDelayLater') : t('rsPrevFill'))) + '</span>'; }
    return '<span class="muted small">' + esc(t('rsPrevFill')) + '</span>';
  }
  var r = pv.self, h = '';
  if (pv.a.type === 'DELAY') h += '<div class="small">' + esc(t('rsDelayInfo', [d2(pv.a.from), d2(pv.a.to), pv.a.n])) + '</div>';
  h += r && r.changed ? '<div class="small"><b>' + esc(t('rsResNow')) + ':</b> ' + esc(t('rsPrevSum', [r.A.gap ? '−' + r.A.gap : '0', r.B.gap ? '−' + r.B.gap : '0', r.A.n, r.B.n])) + '</div>' : '<div class="muted small">' + esc(t('rsPrevNone')) + '</div>';
  var oth = pv.rows.filter(function (y) { return y.g !== X.g && y.changed; });
  if (oth.length) h += '<div class="small">' + esc(t('rsResOthers')) + ' ' + oth.map(function (y) { return '<b>' + esc(y.g) + '</b> ' + esc(t('rsPrevSum', [y.A.gap ? '−' + y.A.gap : '0', y.B.gap ? '−' + y.B.gap : '0', y.A.n, y.B.n])); }).join(' · ') + '</div>';
  return h;
}
function rsPanelHtml(X, edit) {
  var f = rsForm(X.g), lines = rsDefaults(X, f), pus = rsPUs([X]), inEdit = edit && RS.edit && RS.editG === X.g;
  var opt = function (arr, cur, lab) { return arr.map(function (v) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(lab ? lab(v) : v) + '</option>'; }).join(''); };
  var lbl = function (k, inner, extra) { return '<label class="small"' + (extra || '') + '>' + esc(t(k)) + '<br>' + inner + '</label>'; };
  var g = ' data-g="' + esc(X.g) + '"';
  var h = '<div class="row" style="gap:8px;align-items:center"><b>' + esc(inEdit ? t('rsFSave') + ' · ' + X.g : (edit ? t('rsPanelTitle', [X.g]) : t('rsPanelTry', [X.g]))) + '</b><span class="muted small">' + esc(edit ? t('rsPanelHint') : t('rsPanelHintRO')) + '</span></div><div class="row" style="margin-top:6px;flex-wrap:wrap;gap:8px;align-items:flex-end">' +
    lbl('rsFType', '<select data-f="type"' + g + '>' + opt(ACTION_TYPES, f.type, function (v) { return t('rsAt' + v); }) + '</select>');
  if (f.type === 'DELAY') {
    var st = rsStylesOf(X, f.line);
    h += lbl('rsThLine', '<select data-f="line"' + g + '>' + opt(lines, f.line) + '</select>') +
      lbl('rsWiStyle', '<select data-f="style"' + g + '>' + opt(st, f.style, function (s) { var L = X.M.G.lines[f.line], c = L && L.styles[s] ? Object.keys(L.styles[s]).sort()[0] : ''; return s + (c ? ' (' + d2(c) + ')' : ''); }) + '</select>') +
      lbl('rsDelayNew', '<input data-f="date" type="date"' + g + ' value="' + esc(f.date) + '">');
  } else {
    if (f.type === 'AREA') h += lbl('rsFArea', '<select data-f="area"' + g + '>' + opt(rsAreas(X).map(function (x) { return x.name; }), f.area, function (n) { var pa = rsAreas(X).filter(function (x) { return x.name === n; })[0]; return n + ' (' + (pa ? pa.qty : 0) + ')'; }) + '</select>');
    h += lbl(f.type === 'OTHER' ? 'rsFQtyOpt' : 'rsFQty', '<input data-f="qty" type="number"' + g + ' style="width:90px" value="' + esc(f.qty) + '">') + lbl('rsFFrom', '<input data-f="from" type="date"' + g + ' value="' + esc(f.from) + '">') + lbl('rsFTo', '<input data-f="to" type="date"' + g + ' value="' + esc(f.to) + '">') +
      lbl('rsFPU', '<select data-f="pu"' + g + '><option value="">' + esc(t('rsFPUany')) + '</option>' + opt(pus, f.pu, puName) + '</select>');
  }
  if (edit) h += lbl('rsFStatus', '<select data-f="status"' + g + '>' + opt(['PLANNED', 'CONFIRMED'], f.status, function (v) { return t('rsSt' + v); }) + '</select>') + lbl('rsFNote', '<input data-f="note" type="text"' + g + ' style="width:100%" value="' + esc(f.note) + '">', ' style="flex:1;min-width:180px"') +
    '<button class="primary" data-rs-save="1"' + g + '>' + esc(inEdit ? t('rsFSave') : t('rsFAdd')) + '</button>' + (inEdit ? '<button data-rs-canceledit="1"' + g + '>' + esc(t('rsFCancelEdit')) + '</button>' : '') + '<span class="small st-bad" data-rs-err="' + esc(X.g) + '"></span>';
  h += '</div>' + (f.type === 'DELAY' ? '<div class="muted small" style="margin-top:4px">' + esc(t('rsDelayWhole')) + '</div>' : '') + '<div style="margin-top:6px" data-rs-res="' + esc(X.g) + '">' + rsResultHtml(X, f, edit) + '</div>';
  return h;
}
// ----- one machine group: horizontal table (+ its action panel when it is short)
function rsBlock(X, days, edit) {
  var panel = X.s.gap > 0, f = rsForm(X.g); if (panel) rsDefaults(X, f);
  var pv = panel && f.active ? rsPreview(X, f) : null;                         // instant result appears as soon as the panel is used
  var h = '<div data-rs-blk="' + esc(X.g) + '"><h4 style="margin:14px 0 4px">' + esc(X.g) + ' <span class="muted small">' + esc(t('rsRowAvail')) + ' ' + (X.M.avail == null ? '' : X.M.avail) + ' · ' + esc(t('rsThDays')) + ' ' + X.s.n + '/' + X.s.of + ' · ' + esc(t('rsThWorst')) + ' ' + (X.s.gap ? '−' + X.s.gap : '0') + '</span></h4>';
  h += '<div class="tw" data-rs-tbl="' + esc(X.g) + '" style="max-height:60vh">' + rsTableInner(X, days, edit, pv) + '</div>';
  if (panel) h += '<div class="rsp" data-rs-panel="' + esc(X.g) + '">' + rsPanelHtml(X, edit) + '</div>';
  return h + '</div>';
}
function rsControls() {
  var M = RS.cache, chips = function (items, sel, attr, allAttr, allLabel) {
    return '<button class="' + (!sel ? 'on' : '') + '" ' + allAttr + '="1">' + esc(allLabel) + '</button>' + items.map(function (k) { return '<button class="' + (!sel || sel[k] ? 'on' : '') + '" ' + attr + '="' + esc(k) + '">' + esc(attr === 'data-rs-cpu' ? puName(k) : k) + '</button>'; }).join('');
  };
  return '<div class="row" style="margin:10px 0 4px;gap:6px;flex-wrap:wrap;align-items:center"><b class="small">' + esc(t('rsLblG')) + '</b><div class="chips">' + chips(M.map(function (x) { return x.g; }), RS.selG, 'data-rs-cg', 'data-rs-cgall', t('rsChipAllG')) + '</div></div>' +
    '<div class="row" style="margin:4px 0;gap:6px;flex-wrap:wrap;align-items:center"><b class="small">' + esc(t('rsLblPU')) + '</b><div class="chips">' + chips(rsPUs(rsSelected()), RS.selPU, 'data-rs-cpu', 'data-rs-cpuall', t('rsChipAllPU')) + '</div></div>' +
    '<div class="row" style="margin:4px 0 8px;gap:6px;align-items:center"><div class="chips"><button class="' + (RS.view === 'short' ? 'on' : '') + '" data-rs-view="short">' + esc(t('rsViewShort')) + '</button><button class="' + (RS.view === 'all' ? 'on' : '') + '" data-rs-view="all">' + esc(t('rsViewAll')) + '</button></div><span class="muted small">' + esc(t('rsGapNote')) + ' ' + esc(t('rsPuNote')) + '</span></div>';
}
function rsHtml(edit) {
  var M = RS.cache = rsCompute();
  if (!M.length) return '<div class="empty">' + esc(t('rsNone')) + '</div>';
  var props = TS.props.slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }), p0 = props[0], h = '';
  var done = {}; (TS.done || []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }).forEach(function (c) { var k = c.by + '|' + c.pu + '|' + c.lines; if (!done[k]) done[k] = c; });
  var dl = Object.keys(done).map(function (k) { var c = done[k]; return c.by + ' · ' + (c.pu || t('tAll')) + ' · ' + String(c.at).slice(5, 16).replace('T', ' ') + (c.pending ? ' (' + t('pDonePend', [c.pending]) + ')' : ''); });
  h += '<div class="muted small" style="margin:4px 0 8px">' + esc(t('rsInfo', [p0.by || '-', String(p0.at).slice(0, 16).replace('T', ' ')])) + ' · ' + esc(dl.length ? t('rsDone', [dl.join('; ')]) : t('rsNoDone')) +
    (p0.dbBasis && p0.dbBasis.overlay ? ' · <span class="st-bad">' + esc(t('tBasis', [p0.dbBasis.overlay, String(p0.dbBasis.at || '').slice(0, 16).replace('T', ' '), p0.dbBasis.by || '-'])) + '</span>' : '') + '</div>';
  h += '<div class="tw"><table class="pg" data-rs-summary="1"><tr><th class="l">' + t('rsThGroup') + '</th><th>' + t('rsThAvail') + '</th><th>' + t('rsThDays') + '</th><th>' + t('rsThWorst') + '</th><th>' + t('rsThRange') + '</th><th>' + t('rsThAfterConf') + '</th><th>' + t('rsThAfterPlan') + '</th><th>' + t('rsThPend') + '</th></tr>' +
    M.map(function (x) {
      return '<tr data-rs-g="' + esc(x.g) + '" style="cursor:pointer"><td class="l"><b>' + esc(x.g) + '</b></td><td>' + (x.M.avail == null ? '' : x.M.avail) + '</td><td>' + x.s.n + ' / ' + x.s.of + '</td><td>' + rsGapCell(x.s) + '</td><td>' + esc(rsRange(x.s)) + '</td><td>' + rsGapCell(x.s2) + '</td><td>' + rsGapCell(x.s3) + '</td><td>' + (x.pending ? '<span class="st-bad">' + x.pending + '</span>' : '0') + '</td></tr>';
    }).join('') + '</table></div>';
  h += rsControls();
  var sel = rsSelected(), shown = 0;
  sel.forEach(function (x) { var days = rsGroupDays(x); if (days.length) { h += rsBlock(x, days, edit); shown++; } });
  if (!shown) h += '<div class="muted" style="margin:10px 0">' + esc(t('rsNoShort')) + '</div>';
  return h;
}
// ----- summary card once every action is confirmed: by machine group and by PU
function rsCardData() {
  var M = RS.cache, acts = RS.actions.filter(function (a) { return a.status !== 'CANCELLED'; }), planned = acts.filter(function (a) { return a.status === 'PLANNED'; }), conf = acts.filter(function (a) { return a.status === 'CONFIRMED'; });
  var rowsG = M.map(function (X) {
    var mine = conf.filter(function (a) { return a.type === 'DELAY' ? !!X.G0.lines[a.line] : a.group === X.g; });
    var left = X.s2, init = X.s;
    var concl = !init.gap && !mine.length ? t('rsConcNoNeed') : (left.gap > 0 ? t('rsConcMoreLeft', [left.gap]) : (mine.length ? t('rsConcEnough') : t('rsConcMore')));
    return { g: X.g, init: init, left: left, acts: mine, concl: concl, more: left.gap > 0 || (init.gap > 0 && !mine.length), pus: rsPuRows(X, conf, left) };
  });
  var by = {}, last = ''; conf.forEach(function (a) { by[a.by] = 1; if (String(a.at) > last) last = String(a.at); });
  return { planned: planned.length, conf: conf.length, groups: rowsG, by: Object.keys(by), last: last };
}
// shortage by PU inside a machine group: who uses the machines on the worst day (and on every short day), their lines, and the actions that name the PU
function rsPuRows(X, conf, left) {
  var w = X.s.worst; if (!w) return [];
  var days = X.s.days.slice(0, 31), lines = Object.keys(X.M.G.lines), tot = (X.M.total && X.M.total[w]) || 0;
  return rsPUs([X]).map(function (p) {
    var use = function (d) { return (X.M.prodPu[p + '|' + d] || 0) + (X.M.prepPu[p + '|' + d] || 0); }, n = use(w);
    var acts = conf.filter(function (a) { return a.type === 'DELAY' ? (X.G0.lines[a.line] && X.G0.lines[a.line].pu === p) : (a.group === X.g && a.pu === p); });
    var ls = lines.filter(function (l) { return X.M.G.lines[l].pu === p; }).map(function (l) {
      var prod = 0, st = ''; Object.keys(X.M.G.lines[l].styles).forEach(function (s) { var q = X.M.G.lines[l].styles[s][w] || 0; if (q) { prod += q; st = s; } });
      var prep = 0; X.rows.forEach(function (x) { if (x.line === l && x.eff && x.days && x.days.indexOf(w) >= 0) prep += x.eff; });
      return { l: l, style: st, prod: prod, prep: prep };
    }).filter(function (r) { return r.prod || r.prep; });
    return { pu: p, n: n, pct: tot ? Math.round(100 * n / tot) : 0, acts: acts, lines: ls, days: days, series: days.map(use), w: w, more: left.gap > 0 && !acts.length };
  }).filter(function (r) { return r.n; });
}
function rsActDetail(a) { return a.type === 'DELAY' ? (a.from && a.to ? t('rsActDelayDet', [a.style, a.line, d2(a.from), d2(a.to), a.n]) : t('rsActDelayDet0', [a.style, a.line, a.n])) : (a.area ? a.area + ' ' : '') + (a.qty ? (a.qty > 0 ? '+' : '') + a.qty : '') + (a.from ? ' (' + d2(a.from) + (a.to && a.to !== a.from ? '–' + d2(a.to) : '') + ')' : '') + (a.pu ? ' · ' + a.pu : ''); }
function rsActPill(a) { var k = a.type === 'DELAY' ? 't-info' : (a.type === 'OTHER' ? 't-warn' : 't-ok'); return '<li><span class="tag ' + k + '">' + esc(t('rsAt' + a.type)) + '</span> ' + esc(rsActDetail(a)) + (a.note ? ' <span class="muted small">· ' + esc(a.note) + '</span>' : '') + '</li>'; }
function rsCardHtml() {
  var D = rsCardData(), h = '<div class="sc-head"><h3 style="margin:0">' + esc(t('rsCardTitle')) + '</h3>';
  if (!D.conf) return h + '</div><div class="muted small" style="margin-top:6px">' + esc(t('rsCardNone')) + '</div>';
  if (D.planned) return h + '</div><div class="muted small" style="margin-top:6px">' + esc(t('rsCardWait', [D.planned])) + '</div>';
  var okN = D.groups.filter(function (r) { return !r.more; }).length, moreN = D.groups.length - okN, before = D.groups.reduce(function (s, r) { return s + r.init.sum; }, 0), after = D.groups.reduce(function (s, r) { return s + r.left.sum; }, 0);
  h += '<span class="muted small">' + esc(t('rsCardMade', [String(D.last).slice(0, 16).replace('T', ' '), D.by.join(', ')])) + '</span><button data-rs-export="1" style="margin-left:auto">' + esc(t('rsExport')) + '</button></div>';
  var kpi = function (cls, big, lab) { return '<div class="sc-kpi ' + cls + '"><b>' + big + '</b><span>' + esc(lab) + '</span></div>'; };
  h += '<div class="sc-kpis">' + kpi('ok', okN + ' / ' + D.groups.length, t('rsKpiOk')) + kpi(moreN ? 'bad' : 'ok', moreN, t('rsKpiMore')) + kpi('', D.conf, t('rsKpiActs')) + kpi(after < before ? 'ok' : 'bad', before + ' → ' + after, t('rsKpiDays')) + '</div>';
  h += '<h4 class="sc-h">' + esc(t('rsCardByG')) + '</h4><div class="sc-grid" data-rs-card="g">' + D.groups.map(function (r) {
    var pct = r.init.sum ? Math.max(0, Math.min(100, Math.round(100 * (r.init.sum - r.left.sum) / r.init.sum))) : 100;
    return '<div class="sc-card ' + (r.more ? 'more' : 'ok') + '" data-rs-g2="' + esc(r.g) + '"><div class="sc-top"><b>' + esc(r.g) + '</b><span class="sc-badge ' + (r.more ? 'more' : 'ok') + '">' + esc(r.more ? t('rsConcMore') : t('rsEnough')) + '</span></div>' +
      '<div class="sc-nums"><div><small>' + esc(t('rsBefore')) + '</small><big class="' + (r.init.gap ? 'st-bad' : 'st-ok') + '">' + (r.init.gap ? '−' + r.init.gap : '0') + '</big><small>' + (r.init.n ? esc(t('rsDaysShort', [r.init.n, d2(r.init.worst)])) : '') + '</small></div><div class="sc-arrow">→</div>' +
      '<div><small>' + esc(t('rsAfter')) + '</small><big class="' + (r.left.gap ? 'st-bad' : 'st-ok') + '">' + (r.left.gap ? '−' + r.left.gap : '0') + '</big><small>' + (r.left.n ? esc(t('rsDaysShort', [r.left.n, d2(r.left.worst)])) : '') + '</small></div></div>' +
      '<div class="sc-bar" title="' + esc(t('rsKpiDays')) + '"><i style="width:' + pct + '%"></i></div><small class="muted">' + esc(t('rsKpiDays')) + ' ' + r.init.sum + ' → ' + r.left.sum + (r.init.sum ? ' (−' + pct + '%)' : '') + '</small>' +
      (r.acts.length ? '<ul class="sc-acts">' + r.acts.map(rsActPill).join('') + '</ul>' : '<div class="sc-none">' + esc(t('rsCardNoAct')) + '</div>') +
      rsPuHtml(r) +
      '<div class="sc-concl ' + (r.more ? 'st-bad' : 'st-ok') + '">' + esc(r.concl) + '</div></div>';
  }).join('') + '</div>';
  return h;
}
function rsPuHtml(r) {
  if (!r.pus.length) return '';
  var h = '<div class="sc-pus"><div class="small muted" style="margin:8px 0 3px">' + esc(t('rsCardPUs', [d2(r.pus[0].w)])) + '</div><table class="sc-put">';
  r.pus.forEach(function (x) {
    var key = r.g + '|' + x.pu, open = !!RS.openPU[key];
    h += '<tr class="sc-pu' + (open ? ' on' : '') + '" data-rs-pu2="' + esc(key) + '"><td><span class="sc-car">' + (open ? '▾' : '▸') + '</span> <b>' + esc(puName(x.pu)) + '</b></td><td class="n">' + x.n + ' <span class="muted">(' + x.pct + '%)</span></td><td>' +
      (x.acts.length ? '<span class="tag t-ok">' + esc(t('rsConcActs')) + '</span>' : (x.more ? '<span class="tag t-bad">' + esc(t('rsConcMore')) + '</span>' : '<span class="muted">' + esc(t('rsCNoActPU')) + '</span>')) + '</td></tr>';
    if (open) h += '<tr class="sc-pud"><td colspan="3">' + rsPuDetail(r, x) + '</td></tr>';
  });
  return h + '</table></div>';
}
function rsPuDetail(r, x) {
  var h = '<div class="small"><b>' + esc(t('rsPuLines', [d2(x.w)])) + '</b></div><table class="sc-put2"><tr><th class="l">' + esc(t('rsPuLine')) + '</th><th class="l">' + esc(t('thStyleLbl')) + '</th><th class="n">' + esc(t('rsRowProd')) + '</th><th class="n">' + esc(t('rsRowPrep')) + '</th></tr>' +
    x.lines.map(function (l) { return '<tr><td>' + esc(l.l) + '</td><td>' + esc(l.style) + '</td><td class="n">' + l.prod + '</td><td class="n">' + l.prep + '</td></tr>'; }).join('') + '</table>';
  h += '<div class="small" style="margin-top:6px"><b>' + esc(t('rsPuDays')) + '</b></div><div class="small">' + x.days.map(function (d, i) { return '<span class="tag t-info">' + esc(d2(d)) + ': ' + x.series[i] + '</span>'; }).join(' ') + '</div>';
  h += x.acts.length ? '<ul class="sc-acts" style="margin-top:6px">' + x.acts.map(rsActPill).join('') + '</ul>' : '<div class="sc-none">' + esc(t('rsCardNoAct')) + '</div>';
  return h;
}
function rsExport() {
  var D = rsCardData(), a1 = [[t('rsCardTitle')], [], [t('rsCardByG')], [t('rsThGroup'), t('rsCThInit'), t('rsCThActs'), t('rsCThAfter'), t('rsCThConc')]], g = function (s) { return s.gap > 0 ? '-' + s.gap + ' (' + d2(s.worst) + ')' : t('rsEnough'); };
  D.groups.forEach(function (r) { a1.push([r.g, g(r.init), r.acts.map(rsActText).join('; '), g(r.left), r.concl]); });
  a1.push([], [t('rsCardByPU')], [t('rsThGroup'), t('rsCThPU'), t('rsPuUse'), t('rsCThActs'), t('rsCThConc')]);
  D.groups.forEach(function (r) { r.pus.forEach(function (x) { a1.push([r.g, puName(x.pu), x.n + ' (' + x.pct + '%, ' + d2(x.w) + ')', x.acts.map(rsActText).join('; '), x.acts.length ? t('rsConcActs') : (x.more ? t('rsConcMore') : t('rsCNoActPU'))]); }); });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a1), 'ACTIONS');
  var n = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; XLSX.writeFile(wb, 'SHORTAGE_ACTIONS_' + n.getFullYear() + p(n.getMonth() + 1) + p(n.getDate()) + '.xlsx');
}
function rsPaint(cid, edit) {
  var c = $(cid); if (!c) return;
  c.innerHTML = '<div class="card"><div class="row"><b>' + esc(t('rsTitle')) + '</b><button data-rs-refresh="1" style="margin-left:auto">' + esc(t('cRefresh')) + '</button><span class="muted small">' + esc(RS.at ? RS.at.toLocaleString() : '') + '</span></div><div class="muted small">' + esc(t('rsHint')) + '</div><div id="' + cid + 'A">' + rsHtml(edit) + '</div></div>' +
    (RS.cache.length ? '<div class="card" id="' + cid + 'S">' + rsCardHtml() + '</div>' : '');
  c.onclick = function (e) { rsClick(e, cid, edit); };
  c.onchange = function (e) { rsInput(e, cid, edit, true); };
  c.oninput = function (e) { rsInput(e, cid, edit, false); };
}
function rsLive(cid, edit, g) {                // instant result: only the group's table and result line are redrawn (the form keeps the focus)
  var X = RS.cache.filter(function (x) { return x.g === g; })[0], c = $(cid); if (!X || !c) return;
  var tb = c.querySelector('[data-rs-tbl="' + g + '"]'), rs = c.querySelector('[data-rs-res="' + g + '"]'), f = rsForm(g), days = rsGroupDays(X);
  if (tb && days.length) { var s0 = tb.scrollLeft, s1 = tb.scrollTop; tb.innerHTML = rsTableInner(X, days, edit, rsPreview(X, f)); tb.scrollLeft = s0; tb.scrollTop = s1; }
  if (rs) rs.innerHTML = rsResultHtml(X, f, edit);
}
function rsInput(e, cid, edit, commit) {
  var el = e.target, f = el.dataset.f, g = el.dataset.g; if (!f || !g) return;
  var F = rsForm(g); F[f] = el.value; F.active = true; if (['qty', 'from', 'to'].indexOf(f) >= 0) F.touched = true;
  if (commit && (f === 'type' || f === 'line' || f === 'style' || f === 'area')) { if (f === 'area') F.touched = false; if (f === 'line') { F.style = ''; F.date = ''; } if (f === 'style') F.date = ''; if (f === 'type') { F.date = ''; } rsPaint(cid, edit); return; }
  rsLive(cid, edit, g);
}
function rsRepaint() { if ($('rsC') && !$('rsC').closest('[data-pane]').hidden) rsPaint('rsC', true); if ($('rsS') && !$('supView').hidden) rsPaint('rsS', false); }
async function rsWrite(rec) {
  var user = rec.by, name = tStamp() + '_' + String(user).replace(/[^\w\-]+/g, '_') + '_' + String(rec.id).slice(-4) + '.json';
  await tWrite(RS.root, 'prep/actions', name, rec);
  RS.actionsRaw = await pReadDir(RS.root, 'prep/actions'); RS.actions = latestActions(RS.actionsRaw);
}
function rsToggle(sel, k, all) {          // nothing filtered yet: the click selects only that item; afterwards clicks add / remove items; all items selected = no filter
  if (!sel) { var o = {}; o[k] = true; return all.length > 1 ? o : null; }
  var m = Object.assign({}, sel); if (m[k]) delete m[k]; else m[k] = true;
  return Object.keys(m).length && Object.keys(m).length < all.length ? m : null;
}
async function rsClick(e, cid, edit) {
  var b = e.target.closest('[data-rs-g],[data-rs-refresh],[data-rs-edit],[data-rs-conf],[data-rs-cancel],[data-rs-save],[data-rs-canceledit],[data-rs-cg],[data-rs-cgall],[data-rs-cpu],[data-rs-cpuall],[data-rs-view],[data-rs-export],[data-rs-pu2],[data-rs-area]'); if (!b) return;
  var c = $(cid), d = b.dataset, byId = function (id) { return RS.actions.filter(function (a) { return a.id === id; })[0]; };
  try {
    if (d.rsArea != null) { var ak = d.rsArea.split('|'), F2 = rsForm(ak[0]); F2.type = 'AREA'; F2.area = ak.slice(1).join('|'); F2.touched = false; F2.active = true; rsPaint(cid, edit); var pn2 = c.querySelector('[data-rs-panel="' + ak[0] + '"]'); if (pn2) pn2.scrollIntoView({ block: 'center' }); return; }
    if (d.rsPu2 != null) { RS.openPU[d.rsPu2] = !RS.openPU[d.rsPu2]; var cs = $(cid + 'S'); if (cs) cs.innerHTML = rsCardHtml(); return; }
    if (d.rsG != null) { RS.selG = RS.cache.length > 1 ? (function () { var o = {}; o[d.rsG] = true; return o; })() : null; rsPaint(cid, edit); return; }
    if (d.rsCg != null) { RS.selG = rsToggle(RS.selG, d.rsCg, RS.cache.map(function (x) { return x.g; })); rsPaint(cid, edit); return; }
    if (d.rsCgall != null) { RS.selG = null; rsPaint(cid, edit); return; }
    if (d.rsCpu != null) { RS.selPU = rsToggle(RS.selPU, d.rsCpu, rsPUs(RS.cache)); rsPaint(cid, edit); return; }
    if (d.rsCpuall != null) { RS.selPU = null; rsPaint(cid, edit); return; }
    if (d.rsView != null) { RS.view = d.rsView; rsPaint(cid, edit); return; }
    if (d.rsExport != null) { rsExport(); return; }
    if (d.rsRefresh != null) { await rsLoad(RS.root); rsPaint(cid, edit); paintTabs(); return; }
    if (!edit) return;
    var user = $('uName').value.trim();
    if (d.rsEdit != null) {
      var a0 = byId(d.rsEdit); if (!a0) return; var g0 = d.rsg || a0.group; RS.edit = a0.id; RS.editG = g0;
      RS.forms[g0] = { type: a0.type, qty: a0.qty == null ? '' : a0.qty, from: a0.type === 'DELAY' ? '' : (a0.from || ''), to: a0.type === 'DELAY' ? '' : (a0.to || ''), pu: a0.pu || '', line: a0.line || '', style: a0.style || '', date: a0.type === 'DELAY' ? (a0.to || '') : '', status: a0.status === 'CANCELLED' ? 'PLANNED' : a0.status, note: a0.note || '', area: a0.area || '', touched: true, active: true };
      rsPaint(cid, edit); var pn = c.querySelector('[data-rs-panel="' + g0 + '"]'); if (pn) pn.scrollIntoView({ block: 'center' }); return;
    }
    if (d.rsCanceledit != null) { RS.edit = null; RS.editG = ''; RS.forms[d.g] = null; rsPaint(cid, edit); return; }
    if (d.rsConf != null || d.rsCancel != null) {
      var a = byId(d.rsConf != null ? d.rsConf : d.rsCancel); if (!a) return; if (!user) { alert(t('lcNeedName')); return; }
      await rsWrite(Object.assign({}, a, { status: d.rsConf != null ? 'CONFIRMED' : 'CANCELLED', by: user, at: new Date().toISOString() })); rsPaint(cid, edit); paintTabs(); return;
    }
    if (d.rsSave != null) {
      var g = d.g, X = RS.cache.filter(function (x) { return x.g === g; })[0], f = rsForm(g), err = c.querySelector('[data-rs-err="' + g + '"]'), ty = f.type, qty = f.qty === '' ? 0 : +f.qty, isDelay = ty === 'DELAY', needQty = !isDelay && ty !== 'OTHER', inf = isDelay ? rsDelayInfo(X, f) : null, pa = ty === 'AREA' ? rsAreas(X).filter(function (x) { return x.name === f.area; })[0] : null;
      var bad = isDelay ? (!inf ? t('rsErrDelay') : inf.out ? t('rsDelayOut') : (!inf.to || inf.n <= 0) ? t('rsDelayLater') : '') : ((needQty && !(qty > 0)) ? t('rsErrQty') : (qty && (!f.from || !f.to || f.from > f.to)) ? t('rsErrDates') : (ty === 'OTHER' && !qty && !String(f.note).trim()) ? t('rsErrNote') : '');
      if (!bad && ty === 'AREA' && (!pa || qty > pa.qty)) bad = t('rsErrArea');
      if (bad) { err.textContent = bad; return; }
      if (!user) { alert(t('lcNeedName')); return; }
      var rec = { id: RS.edit || (tStamp() + '-' + Math.random().toString(36).slice(2, 6)), type: ty, group: isDelay ? '*' : g, area: ty === 'AREA' ? f.area : '', qty: isDelay ? null : (qty || null), from: isDelay ? inf.cur : f.from, to: isDelay ? inf.to : f.to, pu: isDelay ? '' : f.pu, line: isDelay ? f.line : '', style: isDelay ? f.style : '', n: isDelay ? inf.n : null, status: f.status, note: String(f.note).trim(), by: user, at: new Date().toISOString() };
      await rsWrite(rec); RS.edit = null; RS.editG = ''; RS.forms[g] = null; rsPaint(cid, edit); paintTabs();
    }
  } catch (er) { alert(er.message || String(er)); }
}
// ---- Consolidator tab
window.rsOpen = function () {
  var c = $('rsC'); if (!c) return;
  if (!LCDIR) { c.innerHTML = '<div class="card"><div class="empty">' + esc(t('rsNoData')) + '</div></div>'; return; }
  rsLoad(LCDIR).then(function () { rsPaint('rsC', true); paintTabs(); }).catch(function (e) { c.innerHTML = '<div class="card st-bad">' + esc(e.message) + '</div>'; });
};
// ---- Supervisor role (read-only: can try actions, cannot save)
async function supUse(d) {
  await rsLoad(d); $('sInfo').className = 'small st-ok'; $('sInfo').textContent = '✓ ' + t('rsConnected', [d.name]); rsPaint('rsS', false);
}
$('sConnect').onclick = async function () { try { await supUse(await chooseDir('tdata', 'lcdata', 'read')); paintSupReuse(); } catch (e) { if (e.name !== 'AbortError') { $('sInfo').className = 'small st-bad'; $('sInfo').textContent = e.message; } } };
$('sReuse').onclick = async function () { try { var d = await reuseDir('tdata', 'read'); if (d) await supUse(d); else $('sInfo').textContent = t('tReuseNone'); } catch (e) { $('sInfo').textContent = e.message; } };
async function paintSupReuse() { var d = await kvDir('tdata'); $('sReuse').hidden = !d; if (d) $('sReuse').textContent = t('tReuseBtn', [d.name]); }
paintSupReuse();
// IE Tech / Supervisor: connect the remembered folders without a click when the browser still allows it
window.quietRole = async function () {
  try {
    if (ROLE === 'tech') {
      var d = await kvDir('tdata'), l = await kvDir('tlay');
      if (d && !TS.dir && (await d.queryPermission({ mode: 'readwrite' })) === 'granted') await useDataDir(d);
      if (l && !TS.lay && (await l.queryPermission({ mode: 'read' })) === 'granted') await useLayDir(l);
    } else if (ROLE === 'sup') {
      var s = await kvDir('tdata'); if (s && !RS.root && (await s.queryPermission({ mode: 'read' })) === 'granted') await supUse(s);
    }
  } catch (e) { }
};
window.supRender = function () { if (RS.root && !$('supView').hidden) rsPaint('rsS', false); else if (!RS.root) $('rsS').innerHTML = '<div class="empty">' + esc(t('rsNeedConn')) + '</div>'; };
