/* app.js: tabs, side panel, dialogs, library tab, save/open, keyboard. */
var TAB = 'plan';
function $(id) { return document.getElementById(id); }
function num(v, d) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : d; }
function toast(msg, bad) { var e = $('toast'); e.textContent = msg; e.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(e._t); e._t = setTimeout(function () { e.className = 'toast'; }, 3200); }

function changed() { runChecks(); commit(); render2d(); renderSide(); if (TAB === '3d') rebuild3d(); }
function onSelChange() { renderSel(); placeSelTools(); if (TAB === '3d') rebuild3d(); }
function renderAll() { runChecks(); render2d(); renderSide(); if (TAB === '3d') rebuild3d(); if (TAB === 'lib') renderLib(); }

function setTab(tb) {
  TAB = tb;
  document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tb); });
  $('paneWork').style.display = tb === 'lib' ? 'none' : '';
  $('paneLib').style.display = tb === 'lib' ? '' : 'none';
  $('plan').style.display = tb === 'plan' ? '' : 'none'; $('tb2d').style.display = tb === 'plan' ? '' : 'none';
  $('v3').style.display = tb === '3d' ? '' : 'none'; $('tb3d').style.display = tb === '3d' ? '' : 'none';
  if (tb === 'plan') render2d();
  if (tb === '3d') {
    if (!init3d()) { toast(t('no3d'), true); return; }
    var first = !V3.built; V3.built = true;
    resize3d(); rebuild3d(); if (first) view3dReset(false);
  }
  if (tb === 'lib') renderLib();
  placeSelTools();
}

/* ---------- side panel ---------- */
function renderSide() {
  $('lnName').value = ST.line.name || ''; $('lnL').value = ST.line.length; $('lnW').value = ST.line.width;
  var b = bbox(ST.items);
  $('lnUsed').textContent = b ? t('lnUsed', [Math.round(b.x1 - Math.min(0, b.x0)), Math.round(b.y1 - Math.min(0, b.y0))]) : '';
  renderSel(); renderIssues(); renderSum();
}
function renderIssues() {
  var bad = ISSUES.filter(function (x) { return x.sev === 'bad'; }).length, warn = ISSUES.length - bad;
  $('issHead').innerHTML = esc(t('issTitle')) + ' ' + (bad ? '<span class="tag t-bad">' + bad + '</span> ' : '') + (warn ? '<span class="tag t-warn">' + warn + '</span>' : '') + (!ISSUES.length ? '<span class="tag t-ok">' + esc(t('issNone')) + '</span>' : '');
  $('issList').innerHTML = ISSUES.slice(0, 80).map(function (x, i) { return '<li class="' + x.sev + '" data-i="' + i + '">' + esc(t(x.k, x.a)) + '</li>'; }).join('') + (ISSUES.length > 80 ? '<li class="muted">… +' + (ISSUES.length - 80) + '</li>' : '');
}
function renderSum() {
  var cnt = {}, n = 0;
  ST.items.forEach(function (it) { if (it.kind === 'mc') { cnt[it.code] = (cnt[it.code] || 0) + 1; n++; } });
  var fp = flowPath(), nw = ST.items.filter(function (it) { return it.kind === 'mc' && !it.noOp; }).length;
  $('sumBody').innerHTML = '<div>' + esc(t('sumMc', [n, nw])) + (fp.n > 1 ? ' · ' + esc(t('sumFlow', [(fp.dist / 100).toFixed(1)])) : '') + '</div><div class="chips">' +
    Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || (a < b ? -1 : 1); }).map(function (c) { return '<span class="chip" data-code="' + esc(c) + '" title="' + esc(codeName(c)) + '"><i style="background:' + FAM_COL[famOf(c)] + '"></i>' + esc(c) + ' <b>' + cnt[c] + '</b></span>'; }).join('') + '</div>';
}
function fld(id, lab, val, attrs) { return '<label class="f"><span>' + esc(lab) + '</span><input id="' + id + '" value="' + esc(val) + '" ' + (attrs || '') + '></label>'; }
function renderSel() {
  var its = selItems(), h = '';
  if (!its.length) {
    h = '<div class="muted small">' + t('selNone') + '</div>';
  } else if (its.length === 1) {
    var it = its[0], d = itemDim(it);
    if (it.kind === 'mc') {
      var fam = famOf(it.code), ms = modelsOfCode(it.code).slice(0, 4);
      h += '<div class="grid2">' + fld('fCode', t('fCode'), it.code, 'list="codeList" autocomplete="off"') + fld('fOp', t('fOp'), it.op || '') + '</div>';
      h += '<div class="small">' + esc(codeName(it.code) || t('notInLib')) + '</div>';
      h += '<label class="ck" style="margin-top:4px"><input type="checkbox" id="fHasOp"' + (it.noOp ? '' : ' checked') + '> ' + esc(t('fHasOp')) + '</label>';
      h += '<div class="grid3">' + fld('fL', t('fLen'), d.L, 'type="number" step="0.5" title="' + esc(t('fDimTip')) + '"') + fld('fW', t('fWid'), d.W, 'type="number" step="0.5" title="' + esc(t('fDimTip')) + '"') +
        '<label class="f"><span>' + esc(t('fFam')) + '</span><select id="fFam">' + FAMS.map(function (f) { return '<option value="' + f + '"' + (f === fam ? ' selected' : '') + '>' + esc(t('fam_' + f)) + '</option>'; }).join('') + '</select></label></div>';
      h += '<div class="muted small">' + (d.known ? '' : '⚠ ' + esc(t('dimDefault')) + ' ') + esc(t('fDimTip')) + '</div>';
      if (ms.length) h += '<div class="small models"><b>' + esc(t('realModels')) + ':</b> ' + ms.map(function (m) { return esc(m.brand + ' ' + m.model) + ' <span class="muted">×' + m.qty + (m.ok ? ' ✓' : '') + '</span>'; }).join(' · ') + '</div>';
    } else {
      h += '<div class="grid2">' + fld('fName', t('fName'), it.name || '') + '<label class="f"><span>' + esc(t('fColor')) + '</span><input id="fColor" type="color" value="' + esc(it.color || '#c9ccd3') + '"></label></div>';
      h += '<div class="grid3">' + fld('fL', t('fLen'), it.L, 'type="number" step="1"') + fld('fW', t('fWid'), it.W, 'type="number" step="1"') + fld('fH', t('fHei'), it.H || 75, 'type="number" step="1"') + '</div>';
    }
    h += '<div class="grid3">' + fld('fX', 'X (cm)', it.x, 'type="number" step="1"') + fld('fY', 'Y (cm)', it.y, 'type="number" step="1"') + fld('fRot', t('fRot'), it.rot || 0, 'type="number" step="15"') + '</div>';
    h += '<div class="btns"><button data-cmd="rotL" title="Shift+R">⟲ 90°</button><button data-cmd="rotR" title="R">⟳ 90°</button><button data-cmd="flip" title="F">' + esc(t('bFlip')) + '</button><button data-cmd="dup" title="Ctrl+D">' + esc(t('bDup')) + '</button><button data-cmd="del" class="danger" title="Delete">' + esc(t('bDel')) + '</button></div>';
  } else {
    h += '<div><b>' + esc(t('selMany', [its.length])) + '</b></div>';
    h += '<div class="btns"><button data-cmd="rotL">⟲ 90°</button><button data-cmd="rotR">⟳ 90°</button><button data-cmd="flip">' + esc(t('bFlip')) + '</button><button data-cmd="op" title="W">👤 ' + esc(t('bOpToggle')) + '</button></div>';
    h += '<div class="btns"><button data-cmd="grpR" title="' + esc(t('bGrpTip')) + '">' + esc(t('bGrp90')) + '</button><button data-cmd="grp180" title="' + esc(t('bGrpTip')) + '">' + esc(t('bGrp180')) + '</button></div>';
    h += '<div class="btns"><button data-cmd="align" title="' + esc(t('bAlignTip')) + '">' + esc(t('bAlign')) + '</button><button data-cmd="pack" title="' + esc(t('bPackTip')) + '">' + esc(t('bPack')) + '</button><button data-cmd="dup">' + esc(t('bDup')) + '</button><button data-cmd="del" class="danger">' + esc(t('bDel')) + '</button></div>';
  }
  $('selBody').innerHTML = h;
}
function sideLive() { var its = selItems(); if (its.length === 1 && $('fX')) { $('fX').value = its[0].x; $('fY').value = its[0].y; } }
function onSelField(e) {
  var its = selItems(); if (its.length !== 1) return;
  var it = its[0], id = e.target.id, v = e.target.value;
  if (id === 'fCode') { var c = normCode(v); if (!c) return; it.code = c; }
  else if (id === 'fOp') it.op = v.trim();
  else if (id === 'fHasOp') { if (e.target.checked) delete it.noOp; else it.noOp = true; }
  else if (id === 'fName') it.name = v;
  else if (id === 'fColor') it.color = v;
  else if (id === 'fX') it.x = num(v, it.x);
  else if (id === 'fY') it.y = num(v, it.y);
  else if (id === 'fRot') it.rot = ((num(v, 0) % 360) + 360) % 360;
  else if (id === 'fH') it.H = Math.max(1, num(v, 75));
  else if ((id === 'fL' || id === 'fW') && it.kind === 'obj') it[id === 'fL' ? 'L' : 'W'] = Math.max(1, num(v, 50));
  else if ((id === 'fL' || id === 'fW' || id === 'fFam') && it.kind === 'mc') {      // applies to the code (every machine with this code), stored in the library
    var o = LIB.codes[it.code] || (LIB.codes[it.code] = { code: it.code, en: '', vn: '', L: 0, W: 0, custom: true });
    if (id === 'fFam') o.fam = v; else { var n = num(v, 0); if (n > 0) o[id === 'fL' ? 'Lo' : 'Wo'] = n; }
    libSave(); toast(t('dimSaved', [it.code]));
  }
  changed();
}
function cmd(c) {
  ({ rotL: function () { rotateSel(-90); }, rotR: function () { rotateSel(90); }, flip: function () { rotateSel(180); }, dup: duplicateSel, del: deleteSel,
    op: toggleOperator, grpR: function () { rotateGroup(90); }, grp180: function () { rotateGroup(180); }, align: alignSel, pack: packSel }[c] || function () {})();
  renderSel();
}

/* ---------- paste dialog ---------- */
var PASTE = null;
function openPaste() {
  $('pasteTxt').value = ''; $('pastePrev').innerHTML = ''; $('ocrStatus').textContent = ''; $('ocrView').innerHTML = '';
  $('pasteGo').disabled = true; $('pasteReplace').checked = true; $('pasteFit').checked = !ST.line.fixed;
  if (!$('dlgPaste').open) $('dlgPaste').showModal();
}
function pastePreview() {
  var txt = $('pasteTxt').value; PASTE = parsePaste(txt);
  var unk = {}; PASTE.rows.forEach(function (r) { r.cells.forEach(function (c) { if (!LIB.codes[c.code]) unk[c.code] = 1; }); });
  var h = '';
  if (!PASTE.nMc) h = '<div class="muted">' + esc(t('pasteNone')) + '</div>';
  else {
    h += '<div>' + esc(t('pasteFound', [PASTE.rows.length, PASTE.nMc])) + '</div><table class="mini"><tr><th>#</th><th>' + esc(t('pasteRowMc')) + '</th><th>' + esc(t('pasteSide')) + '</th></tr>';
    PASTE.rows.forEach(function (r, i) {
      h += '<tr><td>' + (i + 1) + '</td><td class="small">' + r.cells.map(function (c) { return esc(c.code) + (c.op ? '<sub>' + esc(c.op) + '</sub>' : ''); }).join(' ') + '</td><td><select data-row="' + i + '"><option value="top"' + (r.side === 'top' ? ' selected' : '') + '>' + esc(t('sideTop')) + '</option><option value="bottom"' + (r.side === 'bottom' ? ' selected' : '') + '>' + esc(t('sideBottom')) + '</option></select>' + (r.sideFound ? '' : ' <span class="muted small">' + esc(t('sideGuess')) + '</span>') + '</td></tr>';
    });
    h += '</table>';
    var u = Object.keys(unk); if (u.length) h += '<div class="t-warn tagline">⚠ ' + esc(t('pasteUnknown', [u.join(', '), DEF_DIM.L + '×' + DEF_DIM.W])) + '</div>';
  }
  $('pastePrev').innerHTML = h; $('pasteGo').disabled = !PASTE.nMc;
}
function pasteGo() {
  if (!PASTE || !PASTE.nMc) return;
  document.querySelectorAll('#pastePrev select[data-row]').forEach(function (s) { PASTE.rows[+s.dataset.row].side = s.value; });
  var replace = $('pasteReplace').checked, y0 = 60, ct = centerTable();
  if (!replace) { var b = bbox(ST.items); if (b) y0 = Math.round(b.y1 + 60); }
  var useCt = ct && (replace || ST.items.length === 1);
  var items = buildFromPaste(PASTE, { addInput: $('pasteInput').checked, x0: 60, y0: y0, center: useCt ? ct : null });
  if (replace) ST.items = (ct ? [ct] : []).concat(items); else ST.items = ST.items.concat(items);
  if ($('pasteFit').checked) { var bb = bbox(ST.items); ST.line.length = Math.ceil((bb.x1 + 60) / 10) * 10; ST.line.width = Math.ceil((bb.y1 + 60) / 10) * 10; }
  SEL = items.map(function (i) { return i.id; });
  $('dlgPaste').close(); changed(); fitView(); if (TAB === '3d') view3dReset(false);
  toast(t('pasteDone', [items.filter(function (i) { return i.kind === 'mc'; }).length]));
}

/* ---------- line set-up (standard machine units + central table) ---------- */
function lineVals() {
  var L = ST.line;
  return { name: $('lsName').value.trim(), units: Math.max(1, Math.round(num($('lsUnits').value, L.units || LINE_DEF.units))), unit: Math.max(10, num($('lsUnit').value, LINE_DEF.unit)),
    tableW: Math.max(0, num($('lsTable').value, LINE_DEF.tableW)), start: Math.max(0, num($('lsStart').value, LINE_DEF.start)), end: Math.max(0, num($('lsEnd').value, LINE_DEF.end)),
    width: num($('lsWidth').value, 0) };
}
function lineCalc() {
  var o = lineVals(), L = o.start + o.units * o.unit + o.end, W = o.width || lineAutoWidth(o.tableW);
  $('lsWidth').placeholder = lineAutoWidth(o.tableW);
  $('lsCalc').innerHTML = esc(t('lsCalc', [o.start, o.units, o.unit, o.end, Math.round(L), Math.round(o.units * o.unit), o.tableW, Math.round(W)]));
}
function openLineSetup() {
  var L = ST.line, ct = centerTable();
  $('lsName').value = L.name || ''; $('lsUnits').value = L.units || LINE_DEF.units; $('lsUnit').value = L.unit || LINE_DEF.unit;
  $('lsTable').value = ct ? ct.W : (L.tableW != null ? L.tableW : LINE_DEF.tableW); $('lsStart').value = L.start != null ? L.start : LINE_DEF.start; $('lsEnd').value = L.end != null ? L.end : LINE_DEF.end;
  $('lsWidth').value = L.units ? L.width : '';
  lineCalc(); $('dlgLine').showModal();
}
function applyLineSetup() { setupLine(lineVals()); $('dlgLine').close(); changed(); fitView(); if (TAB === '3d') view3dReset(false); }

/* ---------- ergonomics dialog ---------- */
var ERG_KEYS = ['opDepth', 'opW', 'chairGap', 'chairW', 'chairD', 'seatH', 'aisle', 'tableH', 'rowGap', 'colGap', 'emptyPitch', 'snap'];
function openErg() {
  $('ergBody').innerHTML = ERG_KEYS.map(function (k) { return '<label class="f row"><span>' + esc(t('erg_' + k)) + '<br><small class="muted">' + esc(t('ergh_' + k)) + '</small></span><input type="number" step="1" min="0" data-k="' + k + '" value="' + ST.erg[k] + '"> cm</label>'; }).join('');
  $('dlgErg').showModal();
}
function applyErg(reset) {
  if (reset) ST.erg = Object.assign({}, ERG_DEF);
  else document.querySelectorAll('#ergBody input').forEach(function (i) { ST.erg[i.dataset.k] = Math.max(0, num(i.value, ERG_DEF[i.dataset.k])); });
  ST.erg.snap = Math.max(1, ST.erg.snap);
  $('dlgErg').close(); changed();
}

/* ---------- library tab ---------- */
function libFile(f) {
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var wb = XLSX.read(new Uint8Array(rd.result), { type: 'array' });
      var r = libApply(libReadWorkbook(wb, f.name));
      if (!r.codes && !r.models) { toast(t('libNothing'), true); return; }
      fillCodeList(); renderAll(); toast(t('libLoaded', [r.codes, r.models]));
    } catch (e) { console.error(e); toast(t('libErr') + ': ' + e.message, true); }
  };
  rd.readAsArrayBuffer(f);
}
function fillCodeList() {
  $('codeList').innerHTML = codeList().map(function (c) { return '<option value="' + esc(c) + '">' + esc(codeName(c)) + '</option>'; }).join('');
  $('mapList').innerHTML = '<option value="#ATTACH">' + esc(t('mapAttach')) + '</option><option value="#NOLINE">' + esc(t('mapNoLine')) + '</option>' + $('codeList').innerHTML;
  $('libBanner').style.display = codeList().length ? 'none' : '';
}
function renderLib() {
  var codes = codeList(), used = {};
  ST.items.forEach(function (it) { if (it.kind === 'mc') used[it.code] = (used[it.code] || 0) + 1; });
  $('libInfo').textContent = codes.length ? t('libInfo', [LIB.file || '?', (LIB.loadedAt || '').slice(0, 10), codes.length, LIB.models.length, LIB.models.filter(function (m) { return m.ok; }).length]) : t('libEmpty');
  var q = ($('codeQ').value || '').toLowerCase();
  $('codeTb').innerHTML = codes.filter(function (c) { var o = LIB.codes[c]; return !q || (c + ' ' + o.en + ' ' + o.vn).toLowerCase().indexOf(q) >= 0; }).map(function (c) {
    var o = LIB.codes[c], f = famOf(c), ms = modelsOfCode(c).slice(0, 3);
    return '<tr data-c="' + esc(c) + '"><td><b>' + esc(c) + '</b>' + (o.custom ? ' <span class="tag t-info">' + esc(t('custom')) + '</span>' : '') + '</td><td class="small">' + esc(o.vn) + '<div class="muted">' + esc(o.en) + '</div></td>' +
      '<td class="n">' + esc(o.L ? o.L + ' × ' + o.W : '—') + '</td>' +
      '<td style="white-space:nowrap"><input class="w60" type="number" step="0.5" data-k="Lo" value="' + (o.Lo || '') + '" placeholder="' + (o.L || '') + '"> × <input class="w60" type="number" step="0.5" data-k="Wo" value="' + (o.Wo || '') + '" placeholder="' + (o.W || '') + '"></td>' +
      '<td><select data-k="fam">' + FAMS.map(function (x) { return '<option value="' + x + '"' + (x === f ? ' selected' : '') + '>' + esc(t('fam_' + x)) + '</option>'; }).join('') + '</select></td>' +
      '<td class="small">' + ms.map(function (m) { return esc(m.brand + ' ' + m.model) + ' <span class="muted">×' + m.qty + '</span>'; }).join('<br>') + '</td><td class="n">' + (used[c] || '') + '</td></tr>';
  }).join('');
  renderMap();
}
function renderMap() {
  var q = ($('mapQ').value || '').toLowerCase(), f = $('mapF').value, rows = LIB.models.map(function (m, i) { return { m: m, i: i }; }).filter(function (x) {
    var m = x.m;
    if (f === 'todo' && m.ok) return false; if (f === 'ok' && !m.ok) return false; if (f === 'none' && m.code) return false; if (f === 'line' && (!m.code || m.code[0] === '#')) return false;
    return !q || (m.name + ' ' + m.brand + ' ' + m.model + ' ' + m.code).toLowerCase().indexOf(q) >= 0;
  });
  var units = rows.reduce(function (s, x) { return s + x.m.qty; }, 0);
  $('mapCount').textContent = t('mapCount', [rows.length, units]);
  $('mapTb').innerHTML = rows.slice(0, 600).map(function (x) {
    var m = x.m, lab = m.code === '#ATTACH' ? t('mapAttach') : m.code === '#NOLINE' ? t('mapNoLine') : codeName(m.code);
    return '<tr data-i="' + x.i + '"' + (m.ok ? ' class="ok"' : '') + '><td class="small">' + esc(m.name) + '</td><td class="small">' + esc(m.brand) + '</td><td class="small">' + esc(m.model) + '</td><td class="n">' + m.qty + '</td>' +
      '<td class="small muted">' + esc(m.sug) + (m.alt && m.alt.length ? '<div>+ ' + esc(m.alt.join(', ')) + '</div>' : '') + '</td>' +
      '<td><input class="w80" list="mapList" data-k="code" value="' + esc(m.code) + '"><div class="small muted">' + esc(lab) + '</div></td>' +
      '<td><label class="ck"><input type="checkbox" data-k="ok"' + (m.ok ? ' checked' : '') + '> ' + esc(t('mapOk')) + '</label>' + (m.at ? '<div class="small muted">' + esc(m.at.slice(0, 10)) + '</div>' : '') + '</td></tr>';
  }).join('');
}
function onLibInput(e) {
  var tr = e.target.closest('tr'); if (!tr) return;
  var k = e.target.dataset.k;
  if (tr.dataset.c) {
    var o = LIB.codes[tr.dataset.c]; if (!o) return;
    if (k === 'fam') o.fam = e.target.value; else { var n = num(e.target.value, 0); if (n > 0) o[k] = n; else delete o[k]; }
    libSave(); renderAll();
  } else if (tr.dataset.i != null) {
    var m = LIB.models[+tr.dataset.i]; if (!m) return;
    if (k === 'code') { var v = String(e.target.value).trim(); m.code = v[0] === '#' ? v.toUpperCase() : normCode(v); }
    if (k === 'ok') { m.ok = e.target.checked; m.at = m.ok ? new Date().toISOString() : ''; }
    libSave(); renderMap();
  }
}
function exportMap() {
  var aoa = [['Sewing Name', 'Brand', 'Model', 'Qty', 'Suggested code', 'Alternative codes', 'Code', 'Code name', 'Confirmed', 'Confirmed at']];
  LIB.models.forEach(function (m) { aoa.push([m.name, m.brand, m.model, m.qty, m.sug, (m.alt || []).join(', '), m.code, m.code === '#ATTACH' ? 'attachment' : m.code === '#NOLINE' ? 'not on line' : codeName(m.code), m.ok ? 'x' : '', m.at ? m.at.slice(0, 10) : '']); });
  var ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 28 }, { wch: 6 }, { wch: 10 }, { wch: 30 }, { wch: 9 }, { wch: 36 }, { wch: 9 }, { wch: 12 }];
  ws['!autofilter'] = { ref: 'A1:J' + aoa.length };
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Model_to_Code');
  XLSX.writeFile(wb, 'Model_to_Code.xlsx');
}
function importMap(f) {
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var wb = XLSX.read(new Uint8Array(rd.result), { type: 'array' }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }), byKey = {}, n = 0, add = 0;
      LIB.models.forEach(function (m) { byKey[modelKey(m)] = m; });
      rows.forEach(function (r) {
        var m0 = { name: String(r['Sewing Name'] || '').trim(), brand: String(r['Brand'] || '').trim(), model: String(r['Model'] || '').trim() };
        if (!m0.name && !m0.model) return;
        var m = byKey[modelKey(m0)];
        if (!m) { var s = suggestCode(m0.name, m0.model); m = { name: m0.name, brand: m0.brand, model: m0.model, qty: +r['Qty'] || 0, sug: s.sug, alt: s.alt, code: s.sug, ok: false }; LIB.models.push(m); byKey[modelKey(m)] = m; add++; }
        var c = String(r['Code'] || '').trim(); if (c) m.code = c[0] === '#' ? c.toUpperCase() : normCode(c);
        var ok = /^(x|yes|y|1|true|ok|có|✓)$/i.test(String(r['Confirmed']).trim()); if (ok && !m.ok) m.at = new Date().toISOString(); m.ok = ok; n++;
      });
      libSave(); renderAll(); toast(t('mapImported', [n, add]));
    } catch (e) { toast(t('libErr') + ': ' + e.message, true); }
  };
  rd.readAsArrayBuffer(f);
}

/* ---------- save / open / export ---------- */
function fileBase() { return (ST.line.name || 'layout').replace(/[\\/:*?"<>|]+/g, '_'); }
function download(name, data, type) {
  var a = document.createElement('a'); a.download = name;
  a.href = typeof data === 'string' && data.indexOf('data:') === 0 ? data : URL.createObjectURL(new Blob([data], { type: type }));
  document.body.appendChild(a); a.click(); a.remove();
}
function saveFile() {
  var data = fileJson(), name = fileBase() + '.layout.json';
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Layout', accept: { 'application/json': ['.json'] } }] })
      .then(function (h) { return h.createWritable().then(function (w) { return w.write(data).then(function () { return w.close(); }); }); })
      .then(function () { toast(t('saved')); }).catch(function (e) { if (e && e.name !== 'AbortError') { download(name, data, 'application/json'); } });
  } else download(name, data, 'application/json');
}
function openFile(f) {
  if (!f) return;
  f.text().then(function (txt) {
    try { openJson(txt); fillCodeList(); LAST = null; commit(); UNDO = []; REDO = []; renderAll(); fitView(); if (TAB === '3d') view3dReset(false); toast(t('opened', [f.name])); }
    catch (e) { toast(t('openErr') + ': ' + e.message, true); }
  });
}
function exportImage() {
  if (TAB === '3d') { download(fileBase() + '_3D.png', png3d()); return; }
  exportPng(function (url) { download(fileBase() + '.png', url); });
}
function printPlan() {
  exportPng(function (url) {
    var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(f);
    var d = f.contentDocument; d.open();
    d.write('<!doctype html><title>' + esc(fileBase()) + '</title><style>@page{size:A3 landscape;margin:10mm}body{margin:0}img{width:100%;height:auto}</style><img src="' + url + '">'); d.close();
    f.contentWindow.onload = function () { setTimeout(function () { f.contentWindow.print(); setTimeout(function () { f.remove(); }, 1000); }, 100); };
    setTimeout(function () { if (document.body.contains(f)) { f.contentWindow.print(); setTimeout(function () { f.remove(); }, 1000); } }, 800);
  });
}

/* ---------- keyboard ---------- */
function onKey(e) {
  var tg = e.target, tn = tg && tg.tagName;
  if (tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT' || document.querySelector('dialog[open]')) return;
  if (TAB === 'lib') return;
  var k = e.key, ctl = e.ctrlKey || e.metaKey, st = e.shiftKey ? 10 : 1, done = true;
  if (ctl && (k === 'z' || k === 'Z') && !e.shiftKey) { if (undo()) { renderAll(); } }
  else if (ctl && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) { if (redo()) { renderAll(); } }
  else if (ctl && (k === 'd' || k === 'D')) duplicateSel();
  else if (ctl && (k === 'a' || k === 'A')) { SEL = ST.items.map(function (i) { return i.id; }); onSelChange(); render2d(); }
  else if (ctl && (k === 's' || k === 'S')) saveFile();
  else if (ctl) done = false;
  else if (k === 'r' || k === 'R') rotateSel(e.shiftKey ? -90 : 90);
  else if (k === 'f' || k === 'F') rotateSel(180);
  else if (k === 'w' || k === 'W') toggleOperator();
  else if (k === 'Delete' || k === 'Backspace') deleteSel();
  else if (k === 'ArrowLeft') nudgeSel(-st, 0); else if (k === 'ArrowRight') nudgeSel(st, 0);
  else if (k === 'ArrowUp') nudgeSel(0, -st); else if (k === 'ArrowDown') nudgeSel(0, st);
  else if (k === 'Escape') { SEL = []; onSelChange(); render2d(); }
  else done = false;
  if (done) { e.preventDefault(); renderSel(); }
}

/* ---------- start ---------- */
function startApp() {
  LANG = localStorage.getItem('ls_lang') || localStorage.getItem('ie_site_lang') || 'vi';
  libLoadCache();
  try { var w = localStorage.getItem('ls_work'); if (w) restore(w); } catch (e) { console.warn(e); }
  LAST = snap();
  applyI18n(); fillCodeList();
  document.querySelectorAll('.tabs button').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
  $('lang').value = LANG; $('lang').onchange = function () { LANG = this.value; localStorage.setItem('ls_lang', LANG); applyI18n(); fillCodeList(); renderAll(); };
  ['lnName', 'lnL', 'lnW'].forEach(function (id) { $(id).onchange = function () { ST.line.name = $('lnName').value.trim(); ST.line.length = Math.max(50, num($('lnL').value, ST.line.length)); ST.line.width = Math.max(50, num($('lnW').value, ST.line.width)); ST.line.fixed = true; changed(); }; });
  $('selBody').addEventListener('change', onSelField);
  $('selBody').addEventListener('click', function (e) { var b = e.target.closest('button[data-cmd]'); if (b) cmd(b.dataset.cmd); });
  $('issList').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-i]'); if (!li) return; var x = ISSUES[+li.dataset.i]; if (!x) return;
    SEL = x.ids.slice(); var it = itemById(x.ids[0]);
    if (it && TAB === 'plan') { var svg = svgEl(); V.x = it.x - svg.clientWidth / V.s / 2; V.y = it.y - svg.clientHeight / V.s / 2; }
    onSelChange(); render2d();
  });
  $('sumBody').addEventListener('click', function (e) { var c = e.target.closest('[data-code]'); if (!c) return; SEL = ST.items.filter(function (i) { return i.code === c.dataset.code; }).map(function (i) { return i.id; }); onSelChange(); render2d(); });
  $('bPaste').onclick = function () { openPaste(); setTimeout(function () { $('pasteTxt').focus(); }, 50); };
  initImagePaste();
  $('pasteTxt').addEventListener('input', pastePreview);
  $('pasteGo').onclick = pasteGo;
  $('bAddMc').onclick = function () { var c = $('addCode').value; if (!normCode(c)) { $('addCode').focus(); return; } addMachine(c); $('addCode').value = ''; };
  $('addCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('bAddMc').click(); });
  $('bAddObj').onclick = function () { addObject($('addObj').value); };
  $('bUndo').onclick = function () { if (undo()) renderAll(); };
  $('bRedo').onclick = function () { if (redo()) renderAll(); };
  $('bFit').onclick = fitView;
  $('optFlow').checked = OPT.flow; $('optFlow').onchange = function () { OPT.flow = this.checked; render2d(); };
  $('optSnap').checked = OPT.snap; $('optSnap').onchange = function () { OPT.snap = this.checked; };
  $('optAisle').checked = OPT.aisles; $('optAisle').onchange = function () { OPT.aisles = this.checked; render2d(); };
  $('bErg').onclick = openErg;
  $('bLineSetup').onclick = openLineSetup;
  ['lsUnits', 'lsUnit', 'lsTable', 'lsStart', 'lsEnd', 'lsWidth'].forEach(function (id) { $(id).oninput = lineCalc; });
  $('lsOk').onclick = applyLineSetup;
  $('selTools').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  $('selTools').addEventListener('click', function (e) { var b = e.target.closest('button[data-cmd]'); if (b) cmd(b.dataset.cmd); });
  $('bOpOff').onclick = function () { var n = setOperatorByOps($('opOps').value, false); changed(); toast(t('opDone', [n])); };
  $('bOpOn').onclick = function () { var n = setOperatorByOps($('opOps').value, true); changed(); toast(t('opDone', [n])); }; $('ergOk').onclick = function () { applyErg(false); }; $('ergReset').onclick = function () { applyErg(true); };
  document.querySelectorAll('dialog [data-close]').forEach(function (b) { b.onclick = function () { b.closest('dialog').close(); }; });
  $('bSave').onclick = saveFile;
  $('bOpen').onclick = function () { $('fileOpen').value = ''; $('fileOpen').click(); }; $('fileOpen').onchange = function () { openFile(this.files[0]); };
  $('bNew').onclick = function () { if (ST.items.length && !confirm(t('newConfirm'))) return; ST.items = []; SEL = []; changed(); fitView(); };
  $('bPng').onclick = exportImage; $('bPrint').onclick = printPlan;
  $('b3Reset').onclick = function () { view3dReset(false); }; $('b3Top').onclick = function () { view3dReset(true); };
  $('opt3People').checked = V3.people; $('opt3People').onchange = function () { V3.people = this.checked; rebuild3d(); };
  $('opt3Labels').checked = V3.labels; $('opt3Labels').onchange = function () { V3.labels = this.checked; rebuild3d(); };
  $('bLib').onclick = $('bLib2').onclick = function () { $('fileLib').value = ''; $('fileLib').click(); };
  $('fileLib').onchange = function () { libFile(this.files[0]); };
  $('codeQ').oninput = renderLib; $('mapQ').oninput = renderMap; $('mapF').onchange = renderMap;
  $('paneLib').addEventListener('change', onLibInput);
  $('bMapExp').onclick = exportMap;
  $('bMapImp').onclick = function () { $('fileMap').value = ''; $('fileMap').click(); }; $('fileMap').onchange = function () { importMap(this.files[0]); };
  document.addEventListener('keydown', onKey);
  init2d();
  runChecks(); renderSide();
  requestAnimationFrame(function () { fitView(); if (!ST.line.fixed && !ST.items.length) openLineSetup(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { render2d(); if (TAB === '3d') rebuild3d(); });
}
