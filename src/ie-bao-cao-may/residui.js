// ===================== RESIDUAL SHORTAGE (after IE Tech's decisions) + actions + what-if =====================
// Consolidator tab "Thiếu máy còn lại" (records actions) and the Supervisor role (read-only). Numbers come from the data folder only
// (latest proposal per machine group + IE Tech decisions + actions): the same calculation as the IE Tech grid (groupModel in prep.js). Tables are horizontal (days in columns).
var RS = { root: null, actions: [], actionsRaw: [], selG: null, selPU: null, view: 'short', edit: null, form: null, wi: { line: '', style: '', n: 3 }, wiRes: null, cache: [], at: null };
function rsNewForm() { return { type: 'RENT', group: '', qty: '', from: '', to: '', pu: '', line: '', style: '', n: 3, status: 'PLANNED', note: '' }; }
RS.form = rsNewForm();
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
function rsActLabel(a, edit) {
  var tag = '<span class="tag ' + (a.status === 'CONFIRMED' ? 't-ok' : a.status === 'CANCELLED' ? 't-bad' : 't-warn') + '">' + esc(t('rsSt' + a.status)) + '</span>', cx = a.status === 'CANCELLED';
  var txt = a.type === 'DELAY' ? t('rsActDelayTxt', [a.style, a.line, a.n]) : t('rsAt' + a.type) + (a.qty ? ' ' + (a.qty > 0 ? '+' : '') + a.qty : '') + (a.from ? ' · ' + d2(a.from) + (a.to && a.to !== a.from ? '–' + d2(a.to) : '') : '') + (a.pu ? ' · ' + a.pu : '');
  var btn = edit && !cx ? '<button class="qa" data-rs-edit="' + esc(a.id) + '" title="' + esc(t('rsEditBtn')) + '">✎</button>' + (a.status === 'PLANNED' ? '<button class="qa" data-rs-conf="' + esc(a.id) + '" title="' + esc(t('rsConfirmBtn')) + '">✔</button>' : '') + '<button class="qa" data-rs-cancel="' + esc(a.id) + '" title="' + esc(t('rsCancelBtn')) + '">✖</button>' : '';
  return '<span style="' + (cx ? 'text-decoration:line-through;opacity:.6' : '') + '">↳ ' + esc(txt) + '</span> ' + tag + ' <span class="muted small">' + esc((a.by || '') + (a.note ? ' · ' + a.note : '')) + '</span>' + btn;
}
// horizontal table of one machine group: PU rows, totals, "left", actions (their real effect per day), balance after the actions
function rsBlock(X, days, edit) {
  var m = X.M, st = X.st, puSel = RS.selPU, pus = rsPUs([X]).filter(function (p) { return !puSel || puSel[p]; });
  var h = '<h4 style="margin:14px 0 4px">' + esc(X.g) + ' <span class="muted small">' + esc(t('rsRowAvail')) + ' ' + (m.avail == null ? '' : m.avail) + ' · ' + esc(t('rsThDays')) + ' ' + X.s.n + '/' + X.s.of + ' · ' + esc(t('rsThWorst')) + ' ' + (X.s.gap ? '−' + X.s.gap : '0') + '</span></h4>';
  h += '<div class="tw" style="max-height:60vh"><table class="pg" data-rs-block="' + esc(X.g) + '"><tr><th class="l s1">PU</th><th class="l s2"></th><th class="l s3">' + t('rsThDay') + '</th>' + days.map(function (d) { return '<th>' + esc(dw(d)) + '</th>'; }).join('') + '</tr>';
  pus.forEach(function (p) {
    var pv = {}, rv = {}, tv = {}; days.forEach(function (d) { pv[d] = m.prodPu[p + '|' + d] || 0; rv[d] = m.prepPu[p + '|' + d] || 0; tv[d] = pv[d] + rv[d]; });
    h += rsRow(esc(t('pgPuSum', [puName(p), t('rsRowProd')])), pv, days, { cls: 'pusum', attr: ' data-rs-pu="' + esc(p) + '"', c1: esc(puName(p)), l1: 1 }) + rsRow(esc(t('pgPuSum', [puName(p), t('rsRowPrep')])), rv, days, { cls: 'pusum' }) + rsRow(esc(t('pgPuSum', [puName(p), t('rsRowTot')])), tv, days, { cls: 'tot' });
  });
  var av = {}; days.forEach(function (d) { av[d] = m.avail; });
  h += rsRow(esc(t('rsRowUse')), m.total, days, { cls: 'tot', attr: ' data-rs-r="use"' }) + rsRow(esc(t('rsRowAvail')), av, days, { cls: 'tot', attr: ' data-rs-r="avail"' }) + rsRow(esc(t('rsRowBal')), m.bal, days, { cls: 'tot', attr: ' data-rs-r="bal"', neg: 1 });
  var acts = RS.actions.filter(function (a) { return a.type === 'DELAY' ? !!X.G0.lines[a.line] : a.group === X.g; });
  acts.forEach(function (a) {
    var e = st.eff[a.id] || {}, vals = {}; days.forEach(function (d) { var v = e[d] || 0; vals[d] = v ? (v > 0 ? '+' + v : v) : ''; });
    var shown = {}; days.forEach(function (d) { shown[d] = e[d] || 0; });
    h += '<tr data-rs-r="act" data-id="' + esc(a.id) + '"><td class="s1"></td><td class="l s2"></td><td class="l s3">' + rsActLabel(a, edit) + '</td>' + days.map(function (d) { var v = e[d] || 0; return '<td class="' + (v < 0 ? 'neg' : (v > 0 ? 'ok' : '')) + '">' + (v ? (v > 0 ? '+' + v : v) : '') + '</td>'; }).join('') + '</tr>';
  });
  if (st.mine.length) h += rsRow('<b>' + esc(t('rsRowBalC')) + '</b>', st.balC, days, { cls: 'tot', attr: ' data-rs-r="balC"', neg: 1 }) + rsRow('<b>' + esc(t('rsRowBalA')) + '</b>', st.balA, days, { cls: 'tot', attr: ' data-rs-r="balA"', neg: 1 });
  return h + '</table></div>';
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
// ----- action form with a live preview of the real change
function rsFormAction() {
  var f = RS.form, ty = f.type, qty = f.qty === '' ? 0 : +f.qty;
  if (ty === 'DELAY') return f.line && f.style && +f.n > 0 ? { id: RS.edit || '__new', type: 'DELAY', group: '*', line: f.line, style: f.style, n: +f.n, status: 'CONFIRMED', note: f.note } : null;
  if (!f.group) return null;
  if (ty !== 'OTHER' && !(qty > 0)) return null;
  if (qty && (!f.from || !f.to || f.from > f.to)) return null;
  return { id: RS.edit || '__new', type: ty, group: f.group, qty: qty || null, from: f.from, to: f.to, pu: f.pu, status: 'CONFIRMED', note: f.note };
}
function rsPreviewHtml() {
  var a = rsFormAction(); if (!a) return '<div class="muted small">' + esc(t('rsPrevFill')) + '</div>';
  var ends = latestEnds(TS.ends), others = RS.actions.filter(function (x) { return x.id !== RS.edit; }), withA = others.concat([a]), h = '', any = false;
  var targets = a.type === 'DELAY' ? RS.cache : RS.cache.filter(function (x) { return x.g === a.group; });
  targets.forEach(function (X) {
    var gd = rsGroupDays(X), dd = gd.length ? gd : X.M.days, s0 = actionStates(X.G0, X.rows, ends, X.M, others, X.g), s1 = actionStates(X.G0, X.rows, ends, X.M, withA, X.g), delta = {};
    X.M.days.forEach(function (d) { delta[d] = s0.balC[d] == null ? 0 : s1.balC[d] - s0.balC[d]; });
    var changed = X.M.days.some(function (d) { return delta[d]; }); if (!changed) return; any = true;
    var A = shortSummary(s0.balC, X.M.days), B = shortSummary(s1.balC, X.M.days);
    h += '<div class="small" style="margin:8px 0 2px"><b>' + esc(X.g) + '</b>: ' + esc(t('rsPrevSum', [A.gap ? '−' + A.gap : '0', B.gap ? '−' + B.gap : '0', A.n, B.n])) + '</div><div class="tw"><table class="pg"><tr><th class="l s1">' + esc(X.g) + '</th><th class="l s2"></th><th class="l s3"></th>' + dd.map(function (d) { return '<th>' + esc(dw(d)) + '</th>'; }).join('') + '</tr>' +
      rsRow(esc(t('rsPrevNow')), s0.balC, dd, { cls: 'tot', neg: 1 }) + '<tr><td class="s1"></td><td class="l s2"></td><td class="l s3"><b>' + esc(t('rsPrevDelta')) + '</b></td>' + dd.map(function (d) { var v = delta[d]; return '<td class="' + (v < 0 ? 'neg' : v > 0 ? 'ok' : '') + '">' + (v ? (v > 0 ? '+' + v : v) : '') + '</td>'; }).join('') + '</tr>' +
      rsRow('<b>' + esc(t('rsPrevAfter')) + '</b>', s1.balC, dd, { cls: 'tot', neg: 1 }) + '</table></div>';
  });
  return any ? h : '<div class="muted small">' + esc(t('rsPrevNone')) + '</div>';
}
function rsFormHtml(edit) {
  if (!edit) return '';
  var f = RS.form, gs = RS.cache.map(function (x) { return x.g; }), pus = rsPUs(RS.cache), lines = {};
  RS.cache.forEach(function (x) { Object.keys(x.G0.lines).forEach(function (l) { lines[l] = lines[l] || x.G0.lines[l]; }); });
  var ls = Object.keys(lines).sort();
  if (!f.group || gs.indexOf(f.group) < 0) f.group = (RS.cache[0] || {}).g || '';
  if (ls.indexOf(f.line) < 0) { f.line = ls[0] || ''; f.style = ''; }
  var st = f.line ? Object.keys(lines[f.line].styles).sort(function (a, b) { var k = function (s) { return Object.keys(lines[f.line].styles[s]).sort()[0] || '9'; }; return k(a).localeCompare(k(b)); }) : [];
  if (st.indexOf(f.style) < 0) f.style = st[1] || st[0] || '';
  var X0 = RS.cache.filter(function (x) { return x.g === f.group; })[0];
  if (!RS.edit && ['RENT', 'BUY', 'BORROW'].indexOf(f.type) >= 0 && X0 && f.qty === '' && !f.from && !f.to) { f.qty = X0.s.gap || ''; f.from = X0.s.first || ''; f.to = X0.s.last || ''; }          // default: cover the worst gap over the short period
  var opt = function (arr, cur, lab) { return arr.map(function (v) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(lab ? lab(v) : v) + '</option>'; }).join(''); };
  var lbl = function (k, inner, extra) { return '<label class="small"' + (extra || '') + '>' + esc(t(k)) + '<br>' + inner + '</label>'; };
  var h = '<h3 style="margin-top:0">' + esc(RS.edit ? t('rsFSave') : t('rsActTitle')) + '</h3><div class="muted small">' + esc(t('rsActHint')) + '</div><div class="row" style="margin-top:8px;flex-wrap:wrap;gap:8px;align-items:flex-end">' +
    lbl('rsFType', '<select data-f="type">' + opt(ACTION_TYPES, f.type, function (v) { return t('rsAt' + v); }) + '</select>');
  if (f.type === 'DELAY') h += lbl('rsThLine', '<select data-f="line">' + opt(ls, f.line) + '</select>') + lbl('rsWiStyle', '<select data-f="style">' + opt(st, f.style) + '</select>') + lbl('rsWiN', '<input data-f="n" type="number" min="1" max="15" style="width:70px" value="' + esc(f.n) + '">');
  else h += lbl('rsThGroup', '<select data-f="group">' + opt(gs, f.group) + '</select>') + lbl(f.type === 'OTHER' ? 'rsFQtyOpt' : 'rsFQty', '<input data-f="qty" type="number" style="width:90px" value="' + esc(f.qty) + '">') + lbl('rsFFrom', '<input data-f="from" type="date" value="' + esc(f.from) + '">') + lbl('rsFTo', '<input data-f="to" type="date" value="' + esc(f.to) + '">') +
    lbl('rsFPU', '<select data-f="pu"><option value="">' + esc(t('rsFPUany')) + '</option>' + opt(pus, f.pu, puName) + '</select>');
  h += lbl('rsFStatus', '<select data-f="status">' + opt(['PLANNED', 'CONFIRMED'], f.status, function (v) { return t('rsSt' + v); }) + '</select>') + lbl('rsFNote', '<input data-f="note" type="text" style="width:100%" value="' + esc(f.note) + '">', ' style="flex:1;min-width:200px"') +
    '<button class="primary" data-rs-save="1">' + esc(RS.edit ? t('rsFSave') : t('rsFAdd')) + '</button>' + (RS.edit ? '<button data-rs-canceledit="1">' + esc(t('rsFCancelEdit')) + '</button>' : '') + '<span class="small st-bad" data-rs-err></span></div>' +
    '<h4 style="margin:12px 0 2px">' + esc(t('rsPrevTitle')) + '</h4><div data-rs-prev="1">' + rsPreviewHtml() + '</div>';
  return h;
}
// ----- summary card once every action is confirmed: by machine group and by PU
function rsCardData() {
  var M = RS.cache, acts = RS.actions.filter(function (a) { return a.status !== 'CANCELLED'; }), planned = acts.filter(function (a) { return a.status === 'PLANNED'; }), conf = acts.filter(function (a) { return a.status === 'CONFIRMED'; });
  var rowsG = M.map(function (X) {
    var mine = conf.filter(function (a) { return a.type === 'DELAY' ? X.st.mine.indexOf(a) >= 0 && X.st.eff[a.id] && X.M.days.some(function (d) { return X.st.eff[a.id][d]; }) : a.group === X.g; });
    var left = X.s2, init = X.s;
    var concl = !init.gap && !mine.length ? t('rsConcNoNeed') : (left.gap > 0 ? t('rsConcMoreLeft', [left.gap]) : (mine.length ? t('rsConcEnough') : t('rsConcMore')));
    return { g: X.g, init: init, left: left, acts: mine, concl: concl, more: left.gap > 0 || (init.gap > 0 && !mine.length) };
  });
  var puMap = {}; rsPUs(M).forEach(function (p) { puMap[p] = { pu: p, acts: [], rel: [] }; });
  conf.forEach(function (a) { var pu = a.type === 'DELAY' ? ((M.map(function (X) { return X.G0.lines[a.line]; }).filter(Boolean)[0] || {}).pu) : a.pu; if (pu && puMap[pu]) puMap[pu].acts.push(a); });
  M.forEach(function (X) { if (!X.s.gap) return; var w = X.s.worst; Object.keys(puMap).forEach(function (p) { var n = (X.M.prodPu[p + '|' + w] || 0) + (X.M.prepPu[p + '|' + w] || 0); if (n) puMap[p].rel.push({ g: X.g, n: n, d: w, left: X.s2.gap }); }); });
  return { planned: planned.length, conf: conf.length, groups: rowsG, pus: Object.keys(puMap).map(function (k) { return puMap[k]; }) };
}
function rsActText(a) { return a.type === 'DELAY' ? t('rsActDelayTxt', [a.style, a.line, a.n]) : t('rsAt' + a.type) + (a.qty ? ' ' + (a.qty > 0 ? '+' : '') + a.qty : '') + (a.from ? ' (' + d2(a.from) + (a.to && a.to !== a.from ? '–' + d2(a.to) : '') + ')' : ''); }
function rsCardHtml() {
  var D = rsCardData(), h = '<h3 style="margin-top:0">' + esc(t('rsCardTitle')) + '</h3>';
  if (!D.conf) return h + '<div class="muted small">' + esc(t('rsCardNone')) + '</div>';
  if (D.planned) return h + '<div class="muted small">' + esc(t('rsCardWait', [D.planned])) + '</div>';
  h += '<div class="row" style="gap:8px"><span class="muted small">' + esc(t('rsCardHint')) + '</span><button data-rs-export="1" style="margin-left:auto">' + esc(t('rsExport')) + '</button></div>';
  h += '<h4 style="margin:10px 0 4px">' + esc(t('rsCardByG')) + '</h4><div class="tw"><table class="pg" data-rs-card="g"><tr><th class="l">' + t('rsThGroup') + '</th><th>' + t('rsCThInit') + '</th><th class="l">' + t('rsCThActs') + '</th><th>' + t('rsCThAfter') + '</th><th class="l">' + t('rsCThConc') + '</th></tr>' +
    D.groups.map(function (r) {
      return '<tr><td class="l"><b>' + esc(r.g) + '</b></td><td>' + rsGapCell(r.init) + '</td><td class="l">' + (r.acts.length ? r.acts.map(function (a) { return esc(rsActText(a)); }).join('<br>') : '<span class="muted">—</span>') + '</td><td>' + rsGapCell(r.left) + '</td><td class="l ' + (r.more ? 'st-bad' : 'st-ok') + '"><b>' + esc(r.concl) + '</b></td></tr>';
    }).join('') + '</table></div>';
  h += '<h4 style="margin:12px 0 4px">' + esc(t('rsCardByPU')) + '</h4><div class="tw"><table class="pg" data-rs-card="pu"><tr><th class="l">' + t('rsCThPU') + '</th><th class="l">' + t('rsCThActs') + '</th><th class="l">' + t('rsCThRel') + '</th><th class="l">' + t('rsCThConc') + '</th></tr>' +
    D.pus.map(function (x) {
      var stillShort = x.rel.some(function (r) { return r.left > 0; });
      var concl = x.acts.length ? t('rsConcActs') : (stillShort ? t('rsConcMore') : t('rsCNoActPU'));
      return '<tr><td class="l"><b>' + esc(puName(x.pu)) + '</b></td><td class="l">' + (x.acts.length ? x.acts.map(function (a) { return esc(rsActText(a)); }).join('<br>') : '<span class="muted">—</span>') + '</td><td class="l">' + (x.rel.length ? x.rel.map(function (r) { return esc(r.g + ' ' + r.n + ' (' + d2(r.d) + ')'); }).join(' · ') : '') + '</td><td class="l ' + (!x.acts.length && stillShort ? 'st-bad' : '') + '"><b>' + esc(concl) + '</b></td></tr>';
    }).join('') + '</table></div>';
  return h;
}
function rsExport() {
  var D = rsCardData(), a1 = [[t('rsCardTitle')], [], [t('rsCardByG')], [t('rsThGroup'), t('rsCThInit'), t('rsCThActs'), t('rsCThAfter'), t('rsCThConc')]], g = function (s) { return s.gap > 0 ? '-' + s.gap + ' (' + d2(s.worst) + ')' : t('rsEnough'); };
  D.groups.forEach(function (r) { a1.push([r.g, g(r.init), r.acts.map(rsActText).join('; '), g(r.left), r.concl]); });
  a1.push([], [t('rsCardByPU')], [t('rsCThPU'), t('rsCThActs'), t('rsCThRel'), t('rsCThConc')]);
  D.pus.forEach(function (x) { var still = x.rel.some(function (r) { return r.left > 0; }); a1.push([puName(x.pu), x.acts.map(rsActText).join('; '), x.rel.map(function (r) { return r.g + ' ' + r.n + ' (' + d2(r.d) + ')'; }).join(' · '), x.acts.length ? t('rsConcActs') : (still ? t('rsConcMore') : t('rsCNoActPU'))]); });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a1), 'ACTIONS');
  var n = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; XLSX.writeFile(wb, 'SHORTAGE_ACTIONS_' + n.getFullYear() + p(n.getMonth() + 1) + p(n.getDate()) + '.xlsx');
}
// ----- what-if (read-only helper, also for the Supervisor)
function rsWhatIfHtml() {
  var lines = {}, W = RS.wi; RS.cache.forEach(function (x) { Object.keys(x.G0.lines).forEach(function (l) { lines[l] = lines[l] || x.G0.lines[l]; }); });
  var ls = Object.keys(lines).sort(); if (!ls.length) return '';
  if (ls.indexOf(W.line) < 0) { W.line = ls[0]; W.style = ''; }
  var L = lines[W.line], first = function (s) { var k = Object.keys(L.styles[s]).sort()[0]; return k || '9'; }, st = Object.keys(L.styles).sort(function (a, b) { return first(a).localeCompare(first(b)); });
  if (st.indexOf(W.style) < 0) W.style = st[1] || st[0] || '';
  var h = '<h3 style="margin-top:0">' + esc(t('rsWiTitle')) + '</h3><div class="muted small">' + esc(t('rsWiHint')) + '</div>' +
    '<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:8px;align-items:flex-end">' +
    '<label class="small">' + t('rsThLine') + '<br><select data-wi="line">' + ls.map(function (l) { return '<option' + (l === W.line ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select></label>' +
    '<label class="small">' + t('rsWiStyle') + '<br><select data-wi="style">' + st.map(function (s) { return '<option' + (s === W.style ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
    '<label class="small">' + t('rsWiN') + '<br><input data-wi="n" type="number" min="1" max="15" style="width:70px" value="' + W.n + '"></label><button data-rs-wigo="1">' + esc(t('rsWiGo')) + '</button></div>';
  if (RS.wiRes) {
    var R = RS.wiRes;
    h += '<div class="muted small" style="margin-top:8px"><b>' + esc(t('rsWiResult', [R.style, R.line, R.n])) + '</b></div>' + (R.rows.length ? '<div class="tw"><table class="pg"><tr><th class="l">' + t('rsThGroup') + '</th><th>' + t('rsWiDays') + '</th><th>' + t('rsWiGap') + '</th><th>' + t('rsWiSum') + '</th></tr>' +
      R.rows.map(function (r) {
        var cell = function (a, b) { return a + ' → <b class="' + (b < a ? 'st-ok' : b > a ? 'st-bad' : '') + '">' + b + '</b>'; };
        return '<tr><td class="l"><b>' + esc(r.g) + '</b></td><td>' + cell(r.a.n, r.b.n) + '</td><td>' + cell(r.a.gap, r.b.gap) + '</td><td>' + cell(r.a.sum, r.b.sum) + '</td></tr>';
      }).join('') + '</table></div>' : '<div class="muted small">' + esc(t('rsWiNone')) + '</div>');
  }
  return h;
}
function rsPaint(cid, edit) {
  var c = $(cid); if (!c) return;
  c.innerHTML = '<div class="card"><div class="row"><b>' + esc(t('rsTitle')) + '</b><button data-rs-refresh="1" style="margin-left:auto">' + esc(t('cRefresh')) + '</button><span class="muted small">' + esc(RS.at ? RS.at.toLocaleString() : '') + '</span></div><div class="muted small">' + esc(t('rsHint')) + '</div><div id="' + cid + 'A">' + rsHtml(edit) + '</div></div>' +
    (RS.cache.length ? (edit ? '<div class="card" id="' + cid + 'B">' + rsFormHtml(edit) + '</div>' : '') + '<div class="card" id="' + cid + 'S">' + rsCardHtml() + '</div><div class="card" id="' + cid + 'C">' + rsWhatIfHtml() + '</div>' : '');
  c.onclick = function (e) { rsClick(e, cid, edit); };
  c.onchange = function (e) { rsInput(e, cid, edit, true); };
  c.oninput = function (e) { rsInput(e, cid, edit, false); };
}
function rsInput(e, cid, edit, commit) {
  var f = e.target.dataset.f, w = e.target.dataset.wi;
  if (f) {
    RS.form[f] = e.target.value;
    if (commit && (f === 'type' || f === 'line')) { if (f === 'line') RS.form.style = ''; rsPaint(cid, edit); return; }
    var pv = $(cid).querySelector('[data-rs-prev]'); if (pv) pv.innerHTML = rsPreviewHtml(); return;
  }
  if (!w || !commit) return;
  if (w === 'line') { RS.wi.line = e.target.value; RS.wi.style = ''; RS.wiRes = null; } else if (w === 'style') { RS.wi.style = e.target.value; RS.wiRes = null; } else if (w === 'n') RS.wi.n = Math.max(1, Math.min(15, +e.target.value || 1));
  rsPaint(cid, edit);
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
  var b = e.target.closest('[data-rs-g],[data-rs-refresh],[data-rs-edit],[data-rs-conf],[data-rs-cancel],[data-rs-save],[data-rs-canceledit],[data-rs-wigo],[data-rs-cg],[data-rs-cgall],[data-rs-cpu],[data-rs-cpuall],[data-rs-view],[data-rs-export]'); if (!b) return;
  var c = $(cid), d = b.dataset, byId = function (id) { return RS.actions.filter(function (a) { return a.id === id; })[0]; };
  try {
    if (d.rsG != null) { RS.selG = RS.cache.length > 1 ? (function () { var o = {}; o[d.rsG] = true; return o; })() : null; rsPaint(cid, edit); return; }
    if (d.rsCg != null) { RS.selG = rsToggle(RS.selG, d.rsCg, RS.cache.map(function (x) { return x.g; })); rsPaint(cid, edit); return; }
    if (d.rsCgall != null) { RS.selG = null; rsPaint(cid, edit); return; }
    if (d.rsCpu != null) { RS.selPU = rsToggle(RS.selPU, d.rsCpu, rsPUs(RS.cache)); rsPaint(cid, edit); return; }
    if (d.rsCpuall != null) { RS.selPU = null; rsPaint(cid, edit); return; }
    if (d.rsView != null) { RS.view = d.rsView; rsPaint(cid, edit); return; }
    if (d.rsExport != null) { rsExport(); return; }
    if (d.rsRefresh != null) { await rsLoad(RS.root); rsPaint(cid, edit); paintTabs(); return; }
    if (d.rsWigo != null) {
      var W = RS.wi, rows = [], ends = latestEnds(TS.ends);
      RS.cache.forEach(function (x) { var S2 = delayModel(x.G0, x.rows, ends, W.line, W.style, W.n); if (S2) rows.push({ g: x.g, a: x.s, b: shortSummary(S2.bal, S2.days) }); });
      RS.wiRes = { line: W.line, style: W.style, n: W.n, rows: rows }; rsPaint(cid, edit); return;
    }
    if (!edit) return;
    var user = $('uName').value.trim();
    if (d.rsEdit != null) {
      var a0 = byId(d.rsEdit); if (!a0) return; RS.edit = a0.id;
      RS.form = { type: a0.type, group: a0.group === '*' ? '' : a0.group, qty: a0.qty == null ? '' : a0.qty, from: a0.from || '', to: a0.to || '', pu: a0.pu || '', line: a0.line || '', style: a0.style || '', n: a0.n || 3, status: a0.status === 'CANCELLED' ? 'PLANNED' : a0.status, note: a0.note || '' };
      rsPaint(cid, edit); var fb = $(cid + 'B'); if (fb) fb.scrollIntoView({ block: 'center' }); return;
    }
    if (d.rsCanceledit != null) { RS.edit = null; RS.form = rsNewForm(); rsPaint(cid, edit); return; }
    if (d.rsConf != null || d.rsCancel != null) {
      var a = byId(d.rsConf != null ? d.rsConf : d.rsCancel); if (!a) return; if (!user) { alert(t('lcNeedName')); return; }
      await rsWrite(Object.assign({}, a, { status: d.rsConf != null ? 'CONFIRMED' : 'CANCELLED', by: user, at: new Date().toISOString() })); rsPaint(cid, edit); paintTabs(); return;
    }
    if (d.rsSave != null) {
      var f = RS.form, err = c.querySelector('[data-rs-err]'), ty = f.type, qty = f.qty === '' ? 0 : +f.qty, isDelay = ty === 'DELAY', needQty = !isDelay && ty !== 'OTHER';
      var bad = isDelay ? (!f.line || !f.style || !(+f.n > 0) ? t('rsErrDelay') : '') : (!f.group ? t('rsErrGroup') : (needQty && !(qty > 0)) ? t('rsErrQty') : (qty && (!f.from || !f.to || f.from > f.to)) ? t('rsErrDates') : (ty === 'OTHER' && !qty && !String(f.note).trim()) ? t('rsErrNote') : '');
      if (bad) { err.textContent = bad; return; }
      if (!user) { alert(t('lcNeedName')); return; }
      var rec = { id: RS.edit || (tStamp() + '-' + Math.random().toString(36).slice(2, 6)), type: ty, group: isDelay ? '*' : f.group, qty: isDelay ? null : (qty || null), from: isDelay ? '' : f.from, to: isDelay ? '' : f.to, pu: isDelay ? '' : f.pu, line: isDelay ? f.line : '', style: isDelay ? f.style : '', n: isDelay ? +f.n : null, status: f.status, note: String(f.note).trim(), by: user, at: new Date().toISOString() };
      await rsWrite(rec); RS.edit = null; RS.form = rsNewForm(); rsPaint(cid, edit); paintTabs();
    }
  } catch (er) { alert(er.message || String(er)); }
}
// ---- Consolidator tab
window.rsOpen = function () {
  var c = $('rsC'); if (!c) return;
  if (!LCDIR) { c.innerHTML = '<div class="card"><div class="empty">' + esc(t('rsNoData')) + '</div></div>'; return; }
  rsLoad(LCDIR).then(function () { rsPaint('rsC', true); paintTabs(); }).catch(function (e) { c.innerHTML = '<div class="card st-bad">' + esc(e.message) + '</div>'; });
};
// ---- Supervisor role (read-only)
async function supUse(d) {
  await rsLoad(d); $('sInfo').className = 'small st-ok'; $('sInfo').textContent = '✓ ' + t('rsConnected', [d.name]); rsPaint('rsS', false);
}
$('sConnect').onclick = async function () { try { await supUse(await chooseDir('tdata', 'lcdata', 'read')); paintSupReuse(); } catch (e) { if (e.name !== 'AbortError') { $('sInfo').className = 'small st-bad'; $('sInfo').textContent = e.message; } } };
$('sReuse').onclick = async function () { try { var d = await reuseDir('tdata', 'read'); if (d) await supUse(d); else $('sInfo').textContent = t('tReuseNone'); } catch (e) { $('sInfo').textContent = e.message; } };
async function paintSupReuse() { var d = await KV.get('tdata'); $('sReuse').hidden = !d; if (d) $('sReuse').textContent = t('tReuseBtn', [d.name]); }
paintSupReuse();
window.supRender = function () { if (RS.root && !$('supView').hidden) rsPaint('rsS', false); else if (!RS.root) $('rsS').innerHTML = '<div class="empty">' + esc(t('rsNeedConn')) + '</div>'; };
