// ===================== STEP 4 UI: machine group analysis + prep =====================
function SRC() { if (!REF.demand && REF.planRows && REF.db) REF.demand = buildDemand(REF.planRows, effDb(), REF.groups || {}); return REF.demand || REF.mbl; }
// Database used for the demand: the MC Report's MACHINE DATABASE plus the changes approved and saved in this session (not yet pasted into Table1 / refreshed in the MC Report).
function effDb() {
  var O = REF.dbOver; if (!O || !Object.keys(O.items).length) return REF.db;
  var by = Object.assign({}, REF.db.byKey);
  Object.keys(O.items).forEach(function (k) { by[k] = Object.assign({}, by[k] || { name: O.names[k] }, { set: O.items[k] }); });
  return Object.assign({}, REF.db, { byKey: by });
}
function addDbOverlay(items, user) {
  var O = REF.dbOver = REF.dbOver || { items: {}, names: {}, at: null, by: '' };
  items.forEach(function (it) { O.items[it.key] = Object.assign({}, it.opts[it.sel].set); O.names[it.key] = it.name; });
  O.at = new Date().toISOString(); O.by = user || '';
  REF.demand = null; PS.changes = null;
  if (PS.rows) { PS.rows = null; PS.open = []; $('pDetail').innerHTML = ''; $('pMsg').textContent = t('ovRecalc'); }
  if (window.prepRender && !$('step4').hidden) prepRender();
}
var PS = { rules: JSON.parse(JSON.stringify(PREP_DEFAULT)), shared: [], reviews: [], sel: {}, rows: null, onlyPrep: true, groups: [] };
function pDay(k, wd) { var d = new Date(k), p = function (x) { return String(x).padStart(2, '0'); }; return (wd ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getUTCDay()] + ' ' : '') + p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1); }
function pIso(k) { var d = new Date(k); return d.toISOString().slice(0, 10); }
async function pReadDir(root, path) {
  var d = root; try { for (var p of path.split('/')) d = await d.getDirectoryHandle(p); } catch (e) { return []; }
  return readJsonFiles(d);
}
window.prepLoadLc = async function (root) {
  PS.reviews = await pReadDir(root, 'prep/reviews'); PS.shared = await pReadDir(root, 'prep/shared');
  try { var f = await (await (await root.getDirectoryHandle('prep')).getFileHandle('rules.json')).getFile(); var r = JSON.parse(await f.text()); if (r && r.ratios) PS.rules = r; } catch (e) { }
};
function pRange() {
  var v = $('pFrom').value, f = v ? Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : SRC().dates[0];
  return { from: f, to: f + (7 * (+$('pWeeks').value || 4) - 1) * 864e5, flat: (+$('pFlat').value || 0) / 100 };
}
window.prepInit = function () {
  $('step4').hidden = false;
  if (!SRC()) { $('pRank').innerHTML = '<tr><td class="empty">' + esc(t('pNeedMbl')) + '</td></tr>'; $('pOpen').disabled = true; return; }
  $('pOpen').disabled = false;
  var now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  var start = SRC().dates.filter(function (d) { return d >= today; })[0] || SRC().dates[0];
  if (!$('pFrom').value) $('pFrom').value = pIso(start);
  prepRender();
};
function rankRows() {
  var r = pRange(), q = ($('pQ').value || '').trim().toUpperCase();
  var all = rankGroups(SRC(), REF.avail || {}, r.from, Math.round((r.to - r.from) / 864e5) + 1, r.flat);
  PS.groups = all.map(function (x) { return x.group; });
  return all.filter(function (x) { return (!q || x.group.toUpperCase().indexOf(q) >= 0) && ($('pAll').checked || q || PS.sel[x.group] || (x.bal != null && x.bal < 0)); });
}
window.prepRender = function () {
  if ($('step4').hidden || !SRC()) return;
  renderSource(); renderDoneC();
  $('pQ').placeholder = t('pcGroup');
  var M = SRC(), D = M.dates;
  $('pInfo').textContent = t('pInfo', [Object.keys(M.byGroup).length, Object.keys(M.lines).length, pDay(D[0]), pDay(D[D.length - 1])]);
  var rows = rankRows();
  $('pRank').innerHTML = '<tr><th>' + t('pcSel') + '</th><th class="l">' + t('pcGroup') + '</th><th>' + t('pcAvail') + '</th><th>' + t('pcPeak') + '</th><th>' + t('pcBal') + '</th><th>' + t('pcFirst') + '</th><th>' + t('pcRatio') + '</th><th>' + t('pcDays') + '</th></tr>' +
    rows.map(function (x) {
      var g = esc(x.group), ra = PS.rules.ratios[x.group], dy = (PS.rules.daysBy || {})[x.group] || PS.rules.days;
      return '<tr><td><input type="checkbox" data-pg="' + g + '"' + (PS.sel[x.group] ? ' checked' : '') + '></td><td><b>' + g + '</b></td><td>' + (x.avail == null ? '<span class="muted">' + t('pNoAvail') + '</span>' : x.avail) + '</td><td>' + x.peak + '</td>' +
        '<td class="' + (x.bal != null && x.bal < 0 ? 'st-bad' : '') + '"><b>' + (x.bal == null ? '' : x.bal) + '</b></td><td>' + (x.first ? pDay(x.first, true) : '') + '</td>' +
        '<td><input type="number" min="0" max="100" style="width:70px" data-pr="' + g + '" value="' + (ra != null ? Math.round(ra * 100) : '') + '"></td>' +
        '<td><input type="number" min="1" max="10" style="width:56px" data-pd="' + g + '" value="' + dy + '"></td></tr>';
    }).join('');
  if (PS.rows) renderDetail();
};
['pFrom', 'pWeeks', 'pFlat', 'pAll'].forEach(function (id) { $(id).onchange = function () { prepRender(); }; });
$('pQ').oninput = function () { prepRender(); };
$('pRank').onchange = function (e) {
  var el = e.target;
  if (el.dataset.pg) PS.sel[el.dataset.pg] = el.checked;
  if (el.dataset.pr) { var v = el.value === '' ? null : Math.max(0, Math.min(100, +el.value)) / 100; if (v == null) delete PS.rules.ratios[el.dataset.pr]; else PS.rules.ratios[el.dataset.pr] = v; }
  if (el.dataset.pd) { PS.rules.daysBy = PS.rules.daysBy || {}; PS.rules.daysBy[el.dataset.pd] = Math.max(1, +el.value || PS.rules.days); }
};
$('pSaveRules').onclick = async function () {
  if (!LCDIR) { $('pMsg').textContent = t('pRulesLocal'); return; }
  var d = await LCDIR.getDirectoryHandle('prep', { create: true }), h = await d.getFileHandle('rules.json', { create: true }), w = await h.createWritable();
  await w.write(JSON.stringify(Object.assign({}, PS.rules, { by: $('uName').value.trim(), at: new Date().toISOString() }), null, 1)); await w.close();
  $('pMsg').textContent = t('pRulesSaved');
};
$('pOpen').onclick = async function () {
  if (typeof LCDIR !== 'undefined' && LCDIR) { try { PS.shared = await pReadDir(LCDIR, 'prep/shared'); PS.reviews = await pReadDir(LCDIR, 'prep/reviews'); } catch (e) { } }   // latest "same layout" list and IE Tech decisions
  var groups = Object.keys(PS.sel).filter(function (g) { return PS.sel[g]; });
  if (!groups.length) { $('pMsg').textContent = t('pPickOne'); return; }
  var files = DONE.length ? DONE : Object.keys(PREV || {}).map(function (p) { return { path: p, name: p.split('/').pop(), status: PREV[p].status || 'OK', units: PREV[p].units || [] }; });
  var r = pRange(), share = sharedIndex(files, PS.shared);
  PS.styleFiles = {}; files.forEach(function (f) {
    if (f.status !== 'OK') return; var st = {};
    (f.units || []).forEach(function (u) { expandStyles(u.styleText).forEach(function (s) { st[baseKey(s)] = 1; }); });
    if (!Object.keys(st).length) expandStyles(f.name).forEach(function (s) { st[baseKey(s)] = 1; });
    Object.keys(st).forEach(function (k) { (PS.styleFiles[k] = PS.styleFiles[k] || []).push(f.path); });
  });
  if (typeof LCDIR !== 'undefined' && LCDIR) { try { PS.ends = await pReadDir(LCDIR, 'prep/lineends'); } catch (e) { } }
  PS.rows = applyReviews(buildPrep(SRC(), groups, PS.rules, share, REF.pu || {}, r.from, r.to + 3 * 864e5), PS.reviews);
  applyEndsToRows(PS.rows, latestEnds(PS.ends), false);
  PS.open = groups; $('pMsg').textContent = ''; renderDetail();
};
function prepCell(x, d) {
  if (x.days.indexOf(d) < 0) return '<td></td>';
  if (x.status === 'AUTO_SKIP' || x.status === 'REMOVED') return '<td class="sk">' + x.prep + '</td>';
  return '<td class="pr"' + (x.status === 'ADJUSTED' ? ' title="' + x.prep + ' → ' + x.eff + '"' : '') + '>' + x.eff + '</td>';
}
function statusTag(x) {
  var cls = psCls(x);
  return '<span class="tag ' + cls + '">' + esc(psLabel(x)) + (x.status === 'ADJUSTED' ? ' ' + x.prep + '→' + x.eff : '') + '</span>' +
    x.flags.map(function (f) { return ' <span class="tag t-warn">' + esc(t('pf_' + f)) + '</span>'; }).join('');
}
// totals per PU for one group grid: production and prep per day
function puTotals(G) {
  var out = {};
  G.order.forEach(function (l) {
    var p = puOf(REF.pu || {}, l), o = out[p] = out[p] || { prod: {}, prep: {} }, L = G.lines[l];
    Object.keys(L.styles).forEach(function (s) { Object.keys(L.styles[s]).forEach(function (d) { o.prod[d] = (o.prod[d] || 0) + L.styles[s][d]; }); });
    L.prep.forEach(function (x) { if (x.eff) x.days.forEach(function (d) { o.prep[d] = (o.prep[d] || 0) + x.eff; }); });
  });
  return out;
}
function puNameC(p) { return !p || p === '?' ? t('noPu') : p; }
function gridOf(g) { var r = pRange(); return groupGrid(SRC(), g, PS.rows, REF.avail || {}, r.from, r.to, REF.pu || {}, latestEnds(PS.ends)); }
function renderDetail() {
  var html = '<label class="small"><input type="checkbox" id="pOnly"' + (PS.onlyPrep ? ' checked' : '') + '> ' + esc(t('pgOnlyPrep')) + '</label>';
  PS.open.forEach(function (g) {
    var G = gridOf(g), mine = PS.rows.filter(function (x) { return x.group === g; });
    var shortDays = G.days.filter(function (d) { return G.bal[d] != null && G.bal[d] < 0; }).map(function (d) { return pDay(d); });
    html += '<div class="gblock"><h3 style="margin:8px 0">' + esc(g) + ' <span class="muted small" style="font-weight:400">' +
      esc(t('pgSummary', [g, mine.length, mine.filter(function (x) { return x.status === 'PENDING'; }).length, mine.filter(function (x) { return x.status === 'AUTO_SKIP'; }).length, shortDays.length ? shortDays.join(', ') : t('pNone')])) + '</span></h3>' +
      '<div class="tw" style="max-height:60vh"><table class="pg"><tr><th class="l s1">' + t('pgPU') + '</th><th class="l s2">' + t('pgLine') + '</th><th class="l s3">' + t('pgStyle') + '</th>' + G.days.map(function (d) { return '<th>' + pDay(d, true) + '</th>'; }).join('') + '</tr>';
    var lastPu = null;
    G.order.forEach(function (line) {
      var L = G.lines[line]; if (PS.onlyPrep && !L.prep.length) return;
      var pu = puOf(REF.pu || {}, line);
      if (pu !== lastPu) { html += '<tr class="pu"><td class="l s1" style="white-space:nowrap">' + esc(puNameC(pu)) + '</td><td class="s2"></td><td class="s3"></td><td colspan="' + G.days.length + '"></td></tr>'; lastPu = pu; }
      var styles = Object.keys(L.styles).sort(function (a, b) { return Math.min.apply(null, Object.keys(L.styles[a]).map(Number)) - Math.min.apply(null, Object.keys(L.styles[b]).map(Number)); });
      L.prep.forEach(function (x) { if (styles.indexOf(x.to) < 0) styles.push(x.to); });
      var first = true;
      styles.forEach(function (s) {
        L.prep.filter(function (x) { return x.to === s; }).forEach(function (x) {
          html += '<tr><td class="s1"></td><td class="l s2">' + (first ? '<b>' + esc(line) + '</b>' : '') + '</td><td class="l s3" style="color:var(--warn)">' + esc(t('pgPrepOf', [s])) + ' <span class="muted small">' + esc(t('prLoad', [pDay(x.loadActual || x.load)])) + '</span> ' + statusTag(x) + '</td>' + G.days.map(function (d) { return prepCell(x, d); }).join('') + '</tr>'; first = false;
        });
        if (!L.styles[s]) return;
        html += '<tr><td class="s1"></td><td class="l s2">' + (first ? '<b>' + esc(line) + '</b>' : '') + '</td><td class="l s3">' + esc(s) + '</td>' + G.days.map(function (d) { return '<td>' + (L.styles[s][d] || '') + '</td>'; }).join('') + '</tr>'; first = false;
      });
    });
    var tot = function (lbl, m, neg) { return '<tr class="tot"><td class="s1"></td><td class="s2"></td><td class="l s3">' + esc(lbl) + '</td>' + G.days.map(function (d) { var v = typeof m === 'function' ? m(d) : m[d]; return '<td class="' + (neg && v != null && v < 0 ? 'neg' : '') + '">' + (v == null ? '' : v) + '</td>'; }).join('') + '</tr>'; };
    var PT = puTotals(G);
    Object.keys(PT).sort(function (a, b) { return (a === '?') - (b === '?') || a.localeCompare(b); }).forEach(function (p) {
      var o = PT[p];
      html += '<tr class="pusum"><td class="s1"></td><td class="s2"></td><td class="l s3">' + esc(t('pgPuSum', [puNameC(p), t('pgProd')])) + '</td>' + G.days.map(function (d) { return '<td>' + (o.prod[d] || 0) + '</td>'; }).join('') + '</tr>' +
        '<tr class="pusum"><td class="s1"></td><td class="s2"></td><td class="l s3">' + esc(t('pgPuSum', [puNameC(p), t('pgPrep')])) + '</td>' + G.days.map(function (d) { return '<td>' + (o.prep[d] || 0) + '</td>'; }).join('') + '</tr>' +
        '<tr class="tot"><td class="s1"></td><td class="s2"></td><td class="l s3">' + esc(t('pgPuSum', [puNameC(p), t('pgTotal')])) + '</td>' + G.days.map(function (d) { return '<td>' + ((o.prod[d] || 0) + (o.prep[d] || 0)) + '</td>'; }).join('') + '</tr>';
    });
    html += tot(t('pgProd'), G.prod) + tot(t('pgPrep'), function (d) { return G.prep[d] || 0; }) + tot(t('pgTotal'), G.total) + tot(t('pgAvail'), function () { return G.avail; }) + partRows(g, G) + tot(t('pgBal'), G.bal, true);
    html += '</table></div></div>';
  });
  html += '<div class="row" style="margin-top:10px"><button class="primary" id="pSend">' + esc(t('pSend')) + '</button><button id="pExport">' + esc(t('pExport')) + '</button><span class="muted small" id="pMsg2"></span></div>';
  $('pDetail').innerHTML = html;
  $('pOnly').onchange = function (e) { PS.onlyPrep = e.target.checked; renderDetail(); };
  $('pSend').onclick = function () { prepSend().catch(function (e) { $('pMsg2').textContent = e.message; }); };
  $('pExport').onclick = function () { prepExport().catch(function (e) { $('pMsg2').textContent = e.message; }); };
}
async function prepSend() {
  if (!LCDIR) { $('pMsg2').textContent = t('pNeedLc'); return; }
  var user = $('uName').value.trim(); if (!user) { $('uName').focus(); $('pMsg2').textContent = t('lcNeedName'); return; }
  var now = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
  var st = now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate()) + '-' + p(now.getHours()) + p(now.getMinutes()) + p(now.getSeconds());
  var rows = PS.rows.map(function (x) { return { key: x.key, line: x.line, pu: x.pu, from: x.from, to: x.to, group: x.group, load: pIso(x.load), qtyB: x.qtyB, ratio: x.ratio, days: x.days.map(pIso), prep: x.prep, same: x.same,
    files: ((PS.styleFiles || {})[baseKey(x.to)] || []).slice(0, 3) }; });
  var grid = {};
  PS.open.forEach(function (g) {
    var G = gridOf(g), lines = {};
    Object.keys(G.lines).forEach(function (l) {
      var st = {}; Object.keys(G.lines[l].styles).forEach(function (s) { var m = {}; Object.keys(G.lines[l].styles[s]).forEach(function (d) { m[pIso(+d)] = G.lines[l].styles[s][d]; }); st[s] = m; });
      lines[l] = { pu: puOf(REF.pu || {}, l), styles: st };
    });
    grid[g] = { days: G.days.map(pIso), avail: G.avail == null ? null : G.avail, parts: availParts(g), lines: lines };
  });
  var d = await (await LCDIR.getDirectoryHandle('prep', { create: true })).getDirectoryHandle('proposals', { create: true });
  var h = await d.getFileHandle(st + '_' + user.replace(/[^\w\-]+/g, '_') + '.json', { create: true }), w = await h.createWritable();
  await w.write(JSON.stringify({ at: now.toISOString(), by: user, groups: PS.open, from: pIso(pRange().from), rows: rows, grid: grid, groupMap: REF.groups || {},
    dbBasis: REF.dbOver && Object.keys(REF.dbOver.items).length ? { overlay: Object.keys(REF.dbOver.items).length, at: REF.dbOver.at, by: REF.dbOver.by, styles: Object.keys(REF.dbOver.names).map(function (k) { return REF.dbOver.names[k]; }).slice(0, 40) } : null })); await w.close();
  $('pMsg2').textContent = t('pSent', [rows.filter(function (x) { return !x.same; }).length]);
}
async function prepExport() {
  var wb = new ExcelJS.Workbook(), Y = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF5D6' } }, R = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E8' } }, T = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  PS.open.forEach(function (g) {
    var G = gridOf(g), ws = wb.addWorksheet(g.replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 31));
    ws.addRow(['PU', t('pgLine'), t('pgStyle')].concat(G.days.map(function (d) { return pDay(d, true); }))).font = { bold: true };
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
    G.order.forEach(function (line) {
      var L = G.lines[line], pu = puOf(REF.pu || {}, line);
      Object.keys(L.styles).forEach(function (s) {
        L.prep.filter(function (x) { return x.to === s; }).forEach(function (x) { addPrep(ws, G, pu, line, x); });
        ws.addRow([pu, line, s].concat(G.days.map(function (d) { return L.styles[s][d] || null; })));
      });
      L.prep.filter(function (x) { return !L.styles[x.to]; }).forEach(function (x) { addPrep(ws, G, pu, line, x); });
    });
    var PT = puTotals(G), sumRows = [];
    Object.keys(PT).sort().forEach(function (p) { var o = PT[p];
      sumRows.push([t('pgPuSum', [puNameC(p), t('pgProd')]), function (d) { return o.prod[d] || 0; }, 'part'], [t('pgPuSum', [puNameC(p), t('pgPrep')]), function (d) { return o.prep[d] || 0; }, 'part'],
        [t('pgPuSum', [puNameC(p), t('pgTotal')]), function (d) { return (o.prod[d] || 0) + (o.prep[d] || 0); }]); });
    sumRows = sumRows.concat([[t('pgProd'), function (d) { return G.prod[d] || 0; }], [t('pgPrep'), function (d) { return G.prep[d] || 0; }], [t('pgTotal'), function (d) { return G.total[d]; }], [t('pgAvail'), function () { return G.avail; }]]);
    availParts(g).forEach(function (p) { sumRows.push(['   ' + (p.sign > 0 ? '+ ' : '− ') + p.name, function () { return p.sign * p.qty; }, 'part']); });
    sumRows.push([t('pgBal'), function (d) { return G.bal[d]; }, 'bal']);
    sumRows.forEach(function (x) {
      var row = ws.addRow(['', '', x[0]].concat(G.days.map(x[1]))); row.font = x[2] === 'part' ? { italic: true, color: { argb: 'FF6B7280' } } : { bold: true };
      row.eachCell(function (c, n) { c.fill = T; if (x[2] === 'bal' && n > 3 && c.value < 0) { c.fill = R; c.font = { bold: true, color: { argb: 'FFC4202B' } }; } });
    });
    ws.getColumn(3).width = 34; ws.getColumn(2).width = 9;
  });
  function addPrep(ws, G, pu, line, x) {
    var skip = x.status === 'AUTO_SKIP' || x.status === 'REMOVED';
    // skipped / removed prep = 0 in Excel (never a number that a SUM could pick up by mistake)
    var row = ws.addRow([pu, line, t('pgPrepOf', [x.to]) + ' — ' + psLabel(x)].concat(G.days.map(function (d) { return x.days.indexOf(d) >= 0 ? (skip ? 0 : x.eff) : null; })));
    row.eachCell(function (c, n) { if (n > 3 && c.value != null) { if (skip) c.font = { color: { argb: 'FF6B7280' } }; else { c.fill = Y; c.font = { bold: true, color: { argb: 'FF9A6700' } }; } } });
    row.getCell(3).font = { color: { argb: 'FF9A6700' } };
  }
  // PREP BY PU: same layout as TTL DEMAND BY PU (Combine.MACHINE | PU | dates)
  var allDays = {}, agg = {};
  PS.rows.forEach(function (x) { if (!x.eff) return; x.days.forEach(function (d) { allDays[d] = 1; var k = x.group + '|' + x.pu; (agg[k] = agg[k] || {})[d] = (agg[k][d] || 0) + x.eff; }); });
  var dl = Object.keys(allDays).map(Number).sort(function (a, b) { return a - b; }), pb = wb.addWorksheet('PREP BY PU');
  pb.addRow(['Combine.MACHINE ', 'PU'].concat(dl.map(function (d) { var x = new Date(d); return String(x.getUTCDate()).padStart(2, '0') + '/' + String(x.getUTCMonth() + 1).padStart(2, '0') + '/' + x.getUTCFullYear(); }))).font = { bold: true };
  Object.keys(agg).sort().forEach(function (k) { var p = k.split('|'); pb.addRow([p[0], p[1]].concat(dl.map(function (d) { return agg[k][d] || null; }))); });
  var nd = wb.addWorksheet('CHƯA DUYỆT');
  nd.addRow(['PU', 'Line', 'From', 'To', 'Group', 'Load date', 'Qty next style', 'Ratio', 'Prep', 'Prep days']).font = { bold: true };
  PS.rows.filter(function (x) { return x.status === 'PENDING'; }).forEach(function (x) { nd.addRow([x.pu, x.line, x.from || '(empty line)', x.to, x.group, pIso(x.load), x.qtyB, x.ratio, x.prep, x.days.map(function (d) { return pDay(d); }).join(', ')]); });
  var cs = await closedState(), st = wb.addWorksheet(t('cStatusSheet'));         // closing status goes with every export
  st.addRow([t('cStatus'), cs.rec ? (cs.final ? t('cStFinal') : t('cStChanged', [cs.changes])) : t('cNone')]).font = { bold: true };
  if (cs.rec) {
    st.addRow([t('cBy'), cs.rec.by]); st.addRow([t('cAt'), stamp16(cs.rec.at)]); st.addRow([t('cNoteLbl'), cs.rec.note || '']); st.addRow([]);
    st.addRow(['PU', t('cThRows'), t('cThPend'), t('cThDec'), t('cThDone'), t('cThNotice')]).font = { bold: true };
    (cs.rec.perPu || []).forEach(function (o) { st.addRow([puLbl(o.pu), o.rows, o.pending, o.kept + ' / ' + o.adjusted + ' / ' + o.removed, o.doneBy ? o.doneBy + ' ' + stamp16(o.doneAt) : '', o.openNotices]); });
  }
  st.getColumn(1).width = 22; st.getColumn(2).width = 26; st.getColumn(5).width = 28;
  var buf = await wb.xlsx.writeBuffer(), a = document.createElement('a'), d0 = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = 'PREP_DEMAND_' + (cs.rec && cs.final ? 'CHOT_' : '') + d0.getFullYear() + p(d0.getMonth() + 1) + p(d0.getDate()) + '_' + p(d0.getHours()) + p(d0.getMinutes()) + '.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
  $('pMsg2').textContent = t('pExported', [a.download]);
}

// MC STATUS columns behind "available" (+ adds machines, - removes machines from production)
function availParts(g) { var P = (REF.avail || {}).__parts; if (!P) return []; var e = P.byGroup[g] || {}; return P.cols.filter(function (c) { return e[c.idx]; }).map(function (c) { return { name: c.name, sign: c.sign, qty: e[c.idx] }; }); }
function partRows(g, G) {
  return availParts(g).map(function (p) {
    return '<tr class="part"><td class="s1"></td><td class="s2"></td><td class="l s3">' + (p.sign > 0 ? '+ ' : '− ') + esc(p.name) + '</td>' + G.days.map(function () { return '<td>' + (p.sign > 0 ? '' : '−') + p.qty + '</td>'; }).join('') + '</tr>';
  }).join('');
}
// demand source: latest plan x MACHINE DATABASE, compared with the MC Report
var SRCVIEW = null;
function renderSource() {
  var M = SRC(), info = REF.planRows && REF.db ? t('srcPlanTxt', [REF.planFile || '', REF.planAt ? REF.planAt.toLocaleString() : '']) : t('srcMblTxt');
  var nOv = REF.dbOver ? Object.keys(REF.dbOver.items).length : 0;
  $('srcInfo').textContent = info + (nOv ? t('srcOverlay', [nOv]) : '');
  var ch = [], miss = (M && M.missing) || [];
  if (REF.mbl && REF.demand) ch = PS.changes = PS.changes || planChanges(REF.mbl, REF.demand, pRange().from, function (s) { return !!effDb().byKey[skey(s)]; });
  var nl = Object.keys(ch.reduce(function (a, c) { a[c.line] = 1; return a; }, {})).length;
  $('srcDiff').textContent = REF.mbl && REF.demand ? (ch.length ? t('srcDiff', [ch.length, nl]) : t('srcSame')) : '';
  $('srcDiff').className = ch.length ? 'st-bad' : 'st-ok';
  $('srcShowDiff').hidden = !ch.length; $('srcMiss').textContent = miss.length ? t('srcMiss', [miss.length]) : ''; $('srcShowMiss').hidden = !miss.length;
  if (SRCVIEW === 'diff') $('srcTable').innerHTML = '<tr><th class="l">' + t('srcThLine') + '</th><th>' + t('srcThFrom') + '</th><th>' + t('srcThTo') + '</th><th class="l">' + t('srcThOld') + '</th><th class="l">' + t('srcThNew') + '</th></tr>' +
    ch.slice(0, 600).map(function (c) { return '<tr><td><b>' + esc(c.line) + '</b></td><td>' + pDay(c.from, true) + '</td><td>' + pDay(c.to, true) + '</td><td>' + esc(c.old || t('srcEmpty')) + '</td><td>' + esc(c.now || t('srcEmpty')) + '</td></tr>'; }).join('');
  if (SRCVIEW === 'miss') $('srcTable').innerHTML = '<tr><th class="l">' + t('pgStyle') + '</th><th>' + t('srcThFirst') + '</th><th class="l">' + t('srcThLines') + '</th></tr>' +
    miss.slice().sort(function (a, b) { return (a.first || 0) - (b.first || 0); }).map(function (m) { return '<tr><td><b>' + esc(m.style) + '</b></td><td>' + (m.first ? fmtDate(m.first) : '') + '</td><td>' + esc(m.lines.slice(0, 6).join(', ')) + '</td></tr>'; }).join('');
  $('srcBox').hidden = !SRCVIEW;
}
$('srcShowDiff').onclick = function () { SRCVIEW = SRCVIEW === 'diff' ? null : 'diff'; renderSource(); };
$('srcShowMiss').onclick = function () { SRCVIEW = SRCVIEW === 'miss' ? null : 'miss'; renderSource(); };

// which IE Tech completed their review (latest per person + scope)
function renderDoneC() {
  var all = (PS.done || []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }), seen = {}, out = [];
  all.forEach(function (c) { var k = c.by + '|' + c.pu + '|' + c.lines; if (!seen[k]) { seen[k] = 1; out.push(c); } });
  $('pDone').innerHTML = out.length ? '<b>' + esc(t('pDoneTitle')) + '</b> ' + out.map(function (c) {
    return '<span class="tag ' + (c.pending ? 't-warn' : 't-ok') + '" style="margin:2px">' + esc(c.by + ' · ' + (c.pu || t('tAll')) + (c.lines ? ' · ' + c.lines : '') + ' · ' + String(c.at).slice(5, 16).replace('T', ' ') +
      ' · ' + c.groups.map(function (g) { return g.group + ' ' + g.rows; }).join(', ') + (c.pending ? ' · ' + t('pDonePend', [c.pending]) : '')) + '</span>';
  }).join('') : '';
}
