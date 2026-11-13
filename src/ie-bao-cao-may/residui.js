// ===================== RESIDUAL SHORTAGE (after IE Tech's decisions) + actions + what-if =====================
// Used by the Consolidator (tab "Thiếu máy còn lại": can record actions) and by the Supervisor role (read-only).
// Numbers come from the data folder only (latest proposal per machine group + IE Tech decisions): the same calculation as the IE Tech grid (groupModel).
var RS = { root: null, actions: [], sel: '', edit: null, wi: { line: '', style: '', n: 3 }, wiRes: null, cache: [], at: null };
async function rsLoad(root) {
  RS.root = root; await tLoadAll(root); RS.actions = latestActions(await pReadDir(root, 'prep/actions')); RS.at = new Date();
}
function rsCompute() {
  var rows = techRows(), ends = latestEnds(TS.ends), groups = {}, out = [];
  TS.props.forEach(function (p) { (p.groups || []).forEach(function (g) { groups[g] = 1; }); });
  Object.keys(groups).sort().forEach(function (g) {
    var G0 = latestGrid(g); if (!G0) return;
    var rg = rows.filter(function (x) { return x.group === g; }), M = groupModel(G0, rg, ends), cov = actionCover(RS.actions, g, M.days), b2 = {}, b3 = {};
    M.days.forEach(function (d) { b2[d] = M.bal[d] == null ? null : M.bal[d] + cov.confirmed[d]; b3[d] = b2[d] == null ? null : b2[d] + cov.planned[d]; });
    out.push({ g: g, G0: G0, rows: rg, M: M, s: shortSummary(M.bal, M.days), s2: shortSummary(b2, M.days), s3: shortSummary(b3, M.days), cov: cov, b2: b2, b3: b3, pending: rg.filter(function (x) { return x.status === 'PENDING'; }).length });
  });
  return out.sort(function (a, b) { return b.s.gap - a.s.gap || a.g.localeCompare(b.g); });
}
function rsShortCount() { try { return TS.props && TS.props.length ? rsCompute().filter(function (x) { return x.s.gap > 0; }).length : 0; } catch (e) { return 0; } }
function rsRange(s) { return s.first ? d2(s.first) + (s.last !== s.first ? ' – ' + d2(s.last) : '') : ''; }
function rsGapCell(s, ok) { return s.gap > 0 ? '<span class="st-bad"><b>−' + s.gap + '</b> (' + esc(d2(s.worst)) + ')</span>' : '<span class="st-ok">' + esc(ok || t('rsEnough')) + '</span>'; }
function rsHtml(edit) {
  var M = RS.cache = rsCompute();
  if (!M.length) return '<div class="empty">' + esc(t('rsNone')) + '</div>';
  if (!RS.sel || !M.some(function (x) { return x.g === RS.sel; })) RS.sel = M[0].g;
  var props = TS.props.slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }), p0 = props[0], h = '';
  var done = {}; (TS.done || []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }).forEach(function (c) { var k = c.by + '|' + c.pu + '|' + c.lines; if (!done[k]) done[k] = c; });
  var dl = Object.keys(done).map(function (k) { var c = done[k]; return c.by + ' · ' + (c.pu || t('tAll')) + ' · ' + String(c.at).slice(5, 16).replace('T', ' ') + (c.pending ? ' (' + t('pDonePend', [c.pending]) + ')' : ''); });
  h += '<div class="muted small" style="margin:4px 0 8px">' + esc(t('rsInfo', [p0.by || '-', String(p0.at).slice(0, 16).replace('T', ' ')])) + ' · ' + esc(dl.length ? t('rsDone', [dl.join('; ')]) : t('rsNoDone')) +
    (p0.dbBasis && p0.dbBasis.overlay ? ' · <span class="st-bad">' + esc(t('tBasis', [p0.dbBasis.overlay, String(p0.dbBasis.at || '').slice(0, 16).replace('T', ' '), p0.dbBasis.by || '-'])) + '</span>' : '') + '</div>';
  // summary per machine group
  h += '<div class="tw"><table class="pg"><tr><th class="l">' + t('rsThGroup') + '</th><th>' + t('rsThAvail') + '</th><th>' + t('rsThDays') + '</th><th>' + t('rsThWorst') + '</th><th>' + t('rsThRange') + '</th><th>' + t('rsThAfterConf') + '</th><th>' + t('rsThAfterPlan') + '</th><th>' + t('rsThPend') + '</th></tr>' +
    M.map(function (x) {
      return '<tr class="' + (x.g === RS.sel ? 'sel' : '') + '" data-rs-g="' + esc(x.g) + '" style="cursor:pointer"><td class="l"><b>' + esc(x.g) + '</b></td><td>' + (x.M.avail == null ? '' : x.M.avail) + '</td><td>' + x.s.n + ' / ' + x.s.of + '</td><td>' + rsGapCell(x.s) + '</td><td>' + esc(rsRange(x.s)) + '</td><td>' + rsGapCell(x.s2) + '</td><td>' + rsGapCell(x.s3) + '</td><td>' + (x.pending ? '<span class="st-bad">' + x.pending + '</span>' : '0') + '</td></tr>';
    }).join('') + '</table></div>';
  // detail of the selected group
  var X = M.filter(function (x) { return x.g === RS.sel; })[0], m = X.M;
  h += '<h4 style="margin:14px 0 4px">' + esc(t('rsDetail', [X.g])) + '</h4><div class="tw" style="max-height:46vh"><table class="pg"><tr><th class="l">' + t('rsThDay') + '</th><th>' + t('rsThProd') + '</th><th>' + t('rsThPrep') + '</th><th>' + t('rsThTotal') + '</th><th>' + t('rsThAvail') + '</th><th>' + t('rsThBal') + '</th><th>' + t('rsThAct') + '</th><th>' + t('rsThAfter') + '</th></tr>' +
    m.days.map(function (d) {
      var cc = X.cov.confirmed[d], pl = X.cov.planned[d], neg = m.bal[d] != null && m.bal[d] < 0, a3 = X.b3[d];
      return '<tr><td class="l">' + esc(dw(d)) + '</td><td>' + (m.prod[d] || 0) + '</td><td>' + (m.prep[d] || 0) + '</td><td>' + m.total[d] + '</td><td>' + (m.avail == null ? '' : m.avail) + '</td><td class="' + (neg ? 'neg' : '') + '">' + (m.bal[d] == null ? '' : m.bal[d]) + '</td><td>' + (cc || pl ? (cc ? '+' + cc : '') + (pl ? ' <span class="muted">(+' + pl + ')</span>' : '') : '') + '</td><td class="' + (a3 != null && a3 < 0 ? 'neg' : '') + '">' + (a3 == null ? '' : a3) + '</td></tr>';
    }).join('') + '</table></div>';
  if (X.s.worst) {                                                       // who uses the machines on the worst day
    var w = X.s.worst, per = {};
    Object.keys(m.G.lines).forEach(function (l) { var L = m.G.lines[l], e = per[l] = { pu: L.pu, prod: 0, prep: 0, styles: [] }; Object.keys(L.styles).forEach(function (s) { var q = L.styles[s][w]; if (q) { e.prod += q; e.styles.push(s + ' ' + q); } }); });
    X.rows.forEach(function (r) { if (r.eff && (r.days || []).indexOf(w) >= 0) { var e = per[r.line] = per[r.line] || { pu: r.pu, prod: 0, prep: 0, styles: [] }; e.prep += r.eff; e.styles.push('↳ ' + r.to + ' ' + r.eff); } });
    var top = Object.keys(per).map(function (l) { return { l: l, e: per[l], n: per[l].prod + per[l].prep }; }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    h += '<h4 style="margin:12px 0 4px">' + esc(t('rsDrivers', [d2(w), X.s.gap])) + '</h4><div class="tw"><table class="pg"><tr><th class="l">PU</th><th class="l">' + t('rsThLine') + '</th><th>' + t('rsThNeed') + '</th><th class="l">' + t('rsThStyles') + '</th></tr>' +
      top.map(function (x) { return '<tr><td class="l">' + esc(puName(x.e.pu)) + '</td><td class="l"><b>' + esc(x.l) + '</b></td><td>' + x.n + (x.e.prep ? ' <span class="muted">(' + t('rsThPrep').toLowerCase() + ' ' + x.e.prep + ')</span>' : '') + '</td><td class="l">' + esc(x.e.styles.join(' · ')) + '</td></tr>'; }).join('') + '</table></div>';
  }
  return h;
}
function rsActionsHtml(edit) {
  var gs = RS.cache.map(function (x) { return x.g; }), E = RS.edit ? RS.actions.filter(function (a) { return a.id === RS.edit; })[0] : null, X = RS.cache.filter(function (x) { return x.g === (E ? E.group : RS.sel); })[0];
  var h = '<h3 style="margin-top:0">' + esc(t('rsActTitle')) + '</h3><div class="muted small">' + esc(t('rsActHint')) + '</div>';
  var list = RS.actions.slice().sort(function (a, b) { return (a.status === 'CANCELLED') - (b.status === 'CANCELLED') || String(b.at).localeCompare(String(a.at)); });
  h += list.length ? '<div class="tw" style="margin-top:6px"><table class="pg"><tr><th class="l">' + t('rsThGroup') + '</th><th class="l">' + t('rsFType') + '</th><th>' + t('rsFQty') + '</th><th>' + t('rsThRange') + '</th><th class="l">' + t('rsFStatus') + '</th><th class="l">' + t('rsThBy') + '</th><th class="l">' + t('rsFNote') + '</th>' + (edit ? '<th></th>' : '') + '</tr>' +
    list.map(function (a) {
      var cx = a.status === 'CANCELLED';
      return '<tr style="' + (cx ? 'opacity:.55' : '') + '"><td class="l"><b>' + esc(a.group) + '</b></td><td class="l">' + esc(t('rsAt' + a.type)) + '</td><td>' + (a.qty || '') + '</td><td>' + esc(a.from ? d2(a.from) + (a.to && a.to !== a.from ? ' – ' + d2(a.to) : '') : '') + '</td><td class="l"><span class="tag ' + (a.status === 'CONFIRMED' ? 't-ok' : cx ? 't-bad' : 't-warn') + '">' + esc(t('rsSt' + a.status)) + '</span></td><td class="l">' + esc(a.by || '') + '<div class="muted small">' + esc(String(a.at).slice(5, 16).replace('T', ' ')) + '</div></td><td class="l">' + esc(a.note || '') + '</td>' +
        (edit ? '<td style="white-space:nowrap">' + (cx ? '' : '<button class="qa" data-rs-edit="' + esc(a.id) + '">' + esc(t('rsEditBtn')) + '</button>' + (a.status === 'PLANNED' ? '<button class="qa" data-rs-conf="' + esc(a.id) + '">' + esc(t('rsConfirmBtn')) + '</button>' : '') + '<button class="qa" data-rs-cancel="' + esc(a.id) + '">' + esc(t('rsCancelBtn')) + '</button>') + '</td>' : '') + '</tr>';
    }).join('') + '</table></div>' : '<div class="muted small" style="margin:6px 0">' + esc(t('rsActNone')) + '</div>';
  if (!edit) return h;
  var s = X ? X.s : null, from = E ? E.from : (s && s.first) || '', to = E ? E.to : (s && s.last) || '';
  var opt = function (arr, cur, lab) { return arr.map(function (v) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(lab ? lab(v) : v) + '</option>'; }).join(''); };
  h += '<div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:flex-end">' +
    '<label class="small">' + t('rsThGroup') + '<br><select data-f="group">' + opt(gs, E ? E.group : RS.sel) + '</select></label>' +
    '<label class="small">' + t('rsFType') + '<br><select data-f="type">' + opt(ACTION_TYPES, E ? E.type : 'RENT', function (v) { return t('rsAt' + v); }) + '</select></label>' +
    '<label class="small">' + t('rsFQty') + '<br><input data-f="qty" type="number" min="1" style="width:80px" value="' + (E && E.qty ? E.qty : (s && s.gap ? s.gap : '')) + '"></label>' +
    '<label class="small">' + t('rsFFrom') + '<br><input data-f="from" type="date" value="' + esc(from) + '"></label>' +
    '<label class="small">' + t('rsFTo') + '<br><input data-f="to" type="date" value="' + esc(to) + '"></label>' +
    '<label class="small">' + t('rsFStatus') + '<br><select data-f="status">' + opt(['PLANNED', 'CONFIRMED'], E && E.status !== 'CANCELLED' ? E.status : 'PLANNED', function (v) { return t('rsSt' + v); }) + '</select></label>' +
    '<label class="small" style="flex:1;min-width:200px">' + t('rsFNote') + '<br><input data-f="note" type="text" style="width:100%" value="' + esc(E ? E.note || '' : '') + '"></label>' +
    '<button class="primary" data-rs-save="1">' + esc(E ? t('rsFSave') : t('rsFAdd')) + '</button>' + (E ? '<button data-rs-canceledit="1">' + esc(t('rsFCancelEdit')) + '</button>' : '') + '<span class="small st-bad" data-rs-err></span></div>';
  return h;
}
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
        var cell = function (a, b, unit) { return a + ' → <b class="' + (b < a ? 'st-ok' : b > a ? 'st-bad' : '') + '">' + b + '</b>' + (unit || ''); };
        return '<tr><td class="l"><b>' + esc(r.g) + '</b></td><td>' + cell(r.a.n, r.b.n) + '</td><td>' + cell(r.a.gap, r.b.gap) + '</td><td>' + cell(r.a.sum, r.b.sum) + '</td></tr>';
      }).join('') + '</table></div>' : '<div class="muted small">' + esc(t('rsWiNone')) + '</div>');
  }
  return h;
}
function rsPaint(cid, edit) {
  var c = $(cid); if (!c) return;
  c.innerHTML = '<div class="card"><div class="row"><b>' + esc(t('rsTitle')) + '</b><button data-rs-refresh="1" style="margin-left:auto">' + esc(t('cRefresh')) + '</button><span class="muted small">' + esc(RS.at ? RS.at.toLocaleString() : '') + '</span></div><div class="muted small">' + esc(t('rsHint')) + '</div><div id="' + cid + 'A">' + rsHtml(edit) + '</div></div>' +
    (RS.cache.length ? '<div class="card" id="' + cid + 'B">' + rsActionsHtml(edit) + '</div><div class="card" id="' + cid + 'C">' + rsWhatIfHtml() + '</div>' : '');
  c.onclick = function (e) { rsClick(e, cid, edit); };
  c.onchange = function (e) {
    var w = e.target.dataset.wi; if (!w) return;
    if (w === 'line') { RS.wi.line = e.target.value; RS.wi.style = ''; RS.wiRes = null; } else if (w === 'style') { RS.wi.style = e.target.value; RS.wiRes = null; } else if (w === 'n') RS.wi.n = Math.max(1, Math.min(15, +e.target.value || 1));
    rsPaint(cid, edit);
  };
}
function rsRepaint() { if ($('rsC') && !$('rsC').closest('[data-pane]').hidden) rsPaint('rsC', true); if ($('rsS') && !$('supView').hidden) rsPaint('rsS', false); }
async function rsWrite(rec) {
  var user = rec.by, name = tStamp() + '_' + String(user).replace(/[^\w\-]+/g, '_') + '_' + String(rec.id).slice(-4) + '.json';
  await tWrite(RS.root, 'prep/actions', name, rec);
  RS.actions = latestActions(await pReadDir(RS.root, 'prep/actions'));
}
async function rsClick(e, cid, edit) {
  var b = e.target.closest('[data-rs-g],[data-rs-refresh],[data-rs-edit],[data-rs-conf],[data-rs-cancel],[data-rs-save],[data-rs-canceledit],[data-rs-wigo]'); if (!b) return;
  var c = $(cid), d = b.dataset, byId = function (id) { return RS.actions.filter(function (a) { return a.id === id; })[0]; };
  try {
    if (d.rsG != null) { RS.sel = d.rsG; rsPaint(cid, edit); return; }
    if (d.rsRefresh != null) { await rsLoad(RS.root); rsPaint(cid, edit); paintTabs(); return; }
    if (d.rsWigo != null) {
      var W = RS.wi, rows = [], ends = latestEnds(TS.ends);
      RS.cache.forEach(function (x) { var S2 = delayModel(x.G0, x.rows, ends, W.line, W.style, W.n); if (S2) rows.push({ g: x.g, a: x.s, b: shortSummary(S2.bal, S2.days) }); });
      RS.wiRes = { line: W.line, style: W.style, n: W.n, rows: rows }; rsPaint(cid, edit); return;
    }
    if (!edit) return;
    if (d.rsEdit != null) { RS.edit = d.rsEdit; rsPaint(cid, edit); return; }
    if (d.rsCanceledit != null) { RS.edit = null; rsPaint(cid, edit); return; }
    var user = $('uName').value.trim();
    if (d.rsConf != null || d.rsCancel != null) {
      var a = byId(d.rsConf != null ? d.rsConf : d.rsCancel); if (!a) return; if (!user) { alert(t('lcNeedName')); return; }
      await rsWrite(Object.assign({}, a, { status: d.rsConf != null ? 'CONFIRMED' : 'CANCELLED', by: user, at: new Date().toISOString() })); rsPaint(cid, edit); paintTabs(); return;
    }
    if (d.rsSave != null) {
      var f = function (n) { return c.querySelector('[data-f="' + n + '"]'); }, err = c.querySelector('[data-rs-err]'), type = f('type').value, qty = +f('qty').value, from = f('from').value, to = f('to').value, note = f('note').value.trim(), hasQty = ACTION_QTY.indexOf(type) >= 0;
      var bad = !f('group').value ? t('rsErrGroup') : (hasQty && !(qty > 0)) ? t('rsErrQty') : (hasQty && (!from || !to || from > to)) ? t('rsErrDates') : (!hasQty && !note) ? t('rsErrNote') : '';
      if (bad) { err.textContent = bad; return; }
      if (!user) { alert(t('lcNeedName')); return; }
      var rec = { id: RS.edit || (tStamp() + '-' + Math.random().toString(36).slice(2, 6)), group: f('group').value, type: type, qty: hasQty ? qty : null, from: from || '', to: to || '', status: f('status').value, note: note, by: user, at: new Date().toISOString() };
      await rsWrite(rec); RS.edit = null; RS.sel = rec.group; rsPaint(cid, edit); paintTabs();
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
