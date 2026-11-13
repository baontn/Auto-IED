// ===================== CLOSE REPORT + ACTIVITY (IE Báo cáo máy) =====================
function stamp16(iso) { return String(iso || '').slice(5, 16).replace('T', ' '); }
function safeName(s) { return String(s || '').replace(/[^\w\-]+/g, '_'); }
function puLbl(p) { return !p || p === '?' ? t('noPu') : p; }
function lineMatch(line, filter) {                           // "K" = all K lines, "K,J" = K and J, "K05" = K05
  var f = String(filter || '').split(/[,;\s]+/).map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean);
  if (!f.length) return true; var L = String(line || '').toUpperCase(); if (!L) return false;
  return f.some(function (p) { return L.indexOf(p) === 0; });
}
function sameReason(r) { return r === I18N.vi.prR1 || r === I18N.en.prR1; }
async function readDbApproved(root, sinceIso) {              // IE Báo cáo máy writes DB_APPROVED lines to data\activity (daily .jsonl files)
  var out = [];
  try {
    var d = await root.getDirectoryHandle('activity');
    for await (var e of d.values()) {
      if (e.kind !== 'file' || !/\.jsonl$/i.test(e.name)) continue;
      var day = (e.name.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1]; if (day && sinceIso && day < sinceIso.slice(0, 10)) continue;
      var txt = await (await e.getFile()).text();
      txt.split(/\r?\n/).forEach(function (l) { if (l.indexOf('DB_APPROVED') < 0) return; try { var o = JSON.parse(l); if (o.action === 'DB_APPROVED') out.push(o); } catch (x) { } });
    }
  } catch (e) { }
  return out;
}

// ---------- 1. CLOSE REPORT ----------
var CL = { data: null };
async function closeCollect() {
  if (!LCDIR) throw new Error(t('nNeedLc'));
  await tLoadAll(LCDIR); PS.closed = await pReadDir(LCDIR, 'prep/closed');
  var rows = techRows(), per = {};
  var mk = function (p) { return per[p] = per[p] || { pu: p, rows: 0, pending: 0, kept: 0, adjusted: 0, removed: 0, notices: 0, done: null }; };
  rows.forEach(function (x) {
    var o = mk(x.pu && x.pu !== '?' ? x.pu : '?'); o.rows++;
    if (x.status === 'PENDING') o.pending++; else if (x.status === 'KEPT') o.kept++; else if (x.status === 'ADJUSTED') o.adjusted++; else o.removed++;
  });
  (TS.done || []).forEach(function (c) {
    Object.keys(per).forEach(function (p) {
      if (c.pu && c.pu !== p) return;
      if (!per[p].done || String(c.at) > String(per[p].done.at)) per[p].done = { by: c.by, at: c.at, pending: c.pending, partial: !!c.lines };
    });
  });
  var openN = (TS.notices || []).filter(function (n) { return !noticeStatus(n); });
  openN.forEach(function (n) { mk(n.pu && per[n.pu] ? n.pu : (n.pu || '?')).notices++; });
  var list = Object.keys(per).sort(function (a, b) { return (a === '?') - (b === '?') || a.localeCompare(b); }).map(function (p) { return per[p]; });
  var tot = { rows: 0, pending: 0, notices: openN.length, notDone: list.filter(function (o) { return o.rows && !o.done; }).length };
  list.forEach(function (o) { tot.rows += o.rows; tot.pending += o.pending; });
  var groups = {}; rows.forEach(function (x) { groups[x.group] = 1; });
  return { per: list, totals: tot, groups: Object.keys(groups).sort(), nProps: (TS.props || []).length };
}
async function closedState() {
  if (!LCDIR) return { rec: null, changes: 0, final: false };
  PS.closed = await pReadDir(LCDIR, 'prep/closed');
  var rec = PS.closed.slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); })[0] || null;
  if (!rec) return { rec: null, changes: 0, final: false };
  var later = function (arr) { return arr.filter(function (x) { return String(x.at) > String(rec.at); }).length; };
  var ch = later(await pReadDir(LCDIR, 'prep/reviews')) + later(await pReadDir(LCDIR, 'prep/proposals')) + later(await pReadDir(LCDIR, 'prep/notices'));
  return { rec: rec, changes: ch, final: ch === 0 };
}
async function paintClosedInfo() {
  var el = $('pClosedInfo'); if (!el) return;
  var s = await closedState();
  if (!s.rec) { el.className = 'small muted'; el.textContent = LCDIR ? t('cNone') : ''; return; }
  el.className = 'small ' + (s.final ? 'st-ok' : 'st-bad');
  el.textContent = t('cClosedInfo', [s.rec.by, stamp16(s.rec.at), s.rec.totals ? s.rec.totals.pending : '?', s.rec.totals ? s.rec.totals.notices : '?']) + (s.changes ? t('cChanged', [s.changes]) : '');
}
function renderClose() {
  var d = CL.data, h = '';
  if (!d || !d.nProps) { $('closeBody').innerHTML = '<div class="empty">' + esc(t('cNoData')) + '</div>'; $('pCloseDo').disabled = true; return; }
  $('pCloseDo').disabled = false;
  h += '<div class="tw" style="max-height:320px"><table><tr><th class="l">' + t('cThPU') + '</th><th>' + t('cThRows') + '</th><th>' + t('cThPend') + '</th><th>' + t('cThDec') + '</th><th class="l">' + t('cThDone') + '</th><th>' + t('cThNotice') + '</th></tr>' +
    d.per.map(function (o) {
      var dn = o.done ? esc(o.done.by) + ' · ' + esc(stamp16(o.done.at)) + (o.done.partial ? ' ' + esc(t('cPartial')) : '') + (o.done.pending ? ' <span class="tag t-warn">' + esc(t('cLeft', [o.done.pending])) + '</span>' : ' <span class="tag t-ok">✓</span>')
        : (o.rows ? '<span class="tag t-bad">' + esc(t('cNoDone')) + '</span>' : '');
      return '<tr><td><b>' + esc(puLbl(o.pu)) + '</b></td><td>' + o.rows + '</td><td class="' + (o.pending ? 'st-bad' : '') + '"><b>' + o.pending + '</b></td><td>' + o.kept + ' / ' + o.adjusted + ' / ' + o.removed + '</td><td>' + dn + '</td><td class="' + (o.notices ? 'st-bad' : '') + '"><b>' + o.notices + '</b></td></tr>';
    }).join('') + '<tr class="tot"><td><b>' + esc(t('cTotal')) + '</b></td><td>' + d.totals.rows + '</td><td>' + d.totals.pending + '</td><td></td><td>' + (d.totals.notDone ? esc(t('cNotDoneN', [d.totals.notDone])) : '✓') + '</td><td>' + d.totals.notices + '</td></tr></table></div>';
  var ok = !d.totals.pending && !d.totals.notices && !d.totals.notDone;
  h += '<div class="small ' + (ok ? 'st-ok' : 'st-bad') + '" style="margin:8px 0">' + esc(ok ? t('cOk') : t('cIssues', [d.totals.pending, d.totals.notices, d.totals.notDone])) + '</div>';
  $('closeBody').innerHTML = h;
}
async function openClose() {
  $('closePanel').hidden = false; $('closeBody').innerHTML = '<div class="muted small">…</div>';
  try { CL.data = await closeCollect(); renderClose(); } catch (e) { $('closeBody').innerHTML = '<div class="st-bad small">' + esc(e.message) + '</div>'; $('pCloseDo').disabled = true; }
}
$('pCloseBtn').onclick = openClose;
$('pCloseRefresh').onclick = openClose;
$('pCloseHide').onclick = function () { $('closePanel').hidden = true; };
$('pCloseDo').onclick = async function () {
  try {
    var me = $('uName').value.trim(); if (!me) { $('uName').focus(); throw new Error(t('cNeedName')); }
    CL.data = await closeCollect(); renderClose(); var d = CL.data; if (!d.nProps) return;
    var warn = d.totals.pending || d.totals.notices || d.totals.notDone;
    if (warn && !window.confirm(t('cWarn', [d.totals.pending, d.totals.notices, d.totals.notDone]))) return;
    var rec = { by: me, at: new Date().toISOString(), note: $('pCloseNote').value.trim(), from: $('pFrom').value, weeks: +$('pWeeks').value || 4, groups: d.groups, totals: d.totals,
      perPu: d.per.map(function (o) { return { pu: o.pu, rows: o.rows, pending: o.pending, kept: o.kept, adjusted: o.adjusted, removed: o.removed, openNotices: o.notices, doneBy: o.done ? o.done.by : '', doneAt: o.done ? o.done.at : '' }; }) };
    await tWrite(LCDIR, 'prep/closed', tStamp() + '_' + safeName(me) + '.json', rec); (PS.closed = PS.closed || []).push(rec);
    $('pCloseNote').value = ''; $('closePanel').hidden = true; await paintClosedInfo(); $('pMsg').textContent = t('cSaved');
  } catch (e) { alert(e.message); }
};
// completions, notices and the close state are re-read whenever the shortage tab is opened (no reconnect needed)
async function refreshPrepData() {
  if (!LCDIR) return;
  try { PS.done = await pReadDir(LCDIR, 'prep/complete'); PS.notices = await pReadDir(LCDIR, 'prep/notices'); PS.noticeRes = await pReadDir(LCDIR, 'prep/noticeres'); } catch (e) { }
  if (window.renderDoneC) renderDoneC(); if (window.renderNotices) renderNotices(); await paintClosedInfo();
}
window.refreshPrepData = refreshPrepData; window.closedState = closedState;

// ---------- 2. ACTIVITY (per machine group and per line) ----------
var ACT = { ev: [], view: 'list', group: '', loaded: false };
function buildEvents(closed, dbap) {
  var ev = [], push = function (e) { ev.push(e); };
  var puOfLine = function (l) { return (REF.pu && l) ? puOf(REF.pu, l) : ''; };
  (TS.props || []).forEach(function (p) {
    var by = {}; (p.rows || []).forEach(function (r) { by[r.group] = (by[r.group] || 0) + 1; });
    (p.groups && p.groups.length ? p.groups : Object.keys(by)).forEach(function (g) { push({ at: p.at, by: p.by, kind: 'send', group: g, line: '', pu: '', style: '', text: t('aDetailRows', [by[g] || 0]) }); });
  });
  (RS.actionsRaw || []).forEach(function (a) {          // actions against the shortage (every save is one entry)
    push({ at: a.at, by: a.by, kind: 'action', group: a.group, line: '', pu: '', style: '', text: rsActText(a) + ' · ' + t('rsSt' + a.status) + (a.note ? ' · ' + a.note : '') });
  });
  (TS.reviews || []).forEach(function (r) {
    var k = String(r.key || '').split('|'), from = k[1] || '', parts = [];
    var kind = r.decision === 'REMOVE' ? (sameReason(r.reason) ? 'same' : 'remove') : (r.decision === 'ADJUST' ? 'adjust' : 'keep');
    if (r.decision === 'ADJUST') parts.push(t('aDetailQty', [r.proposedQty, r.qty]));
    if (r.qtyBActual != null) parts.push(t('aDetailLay', [r.qtyBActual, r.qtyB]));
    if (r.loadDateActual) parts.push(t('aDetailDate', [r.loadDate, r.loadDateActual]));
    if (r.prepDays) parts.push(t('aDetailDays', [r.prepDays]));
    if (r.reason && !sameReason(r.reason)) parts.push(r.reason);
    push({ at: r.at, by: r.by, kind: kind, group: r.group, line: r.line, pu: puOfLine(r.line), style: (from ? from + ' → ' : '') + (r.to || ''), text: parts.join(' · ') });
  });
  var nById = {}; (TS.notices || []).forEach(function (n) {
    nById[n.id] = n;
    push({ at: n.at, by: n.by, kind: 'notice', group: n.group, line: n.line, pu: n.pu || '', style: n.style, text: t('aDetailNotice', [n.dbQty, n.layoutQty]) + (n.note ? ' · ' + n.note : '') });
  });
  (TS.res || []).forEach(function (r) {
    var n = nById[r.id] || {};
    push({ at: r.at, by: r.by, kind: r.action === 'FIXED' ? 'noticeFix' : 'noticeRej', group: n.group || '', line: n.line || '', pu: n.pu || '', style: n.style || '', text: r.note || '' });
  });
  (TS.done || []).forEach(function (c) {
    var gs = c.groups && c.groups.length ? c.groups : [{ group: '', rows: 0, pending: c.pending }];
    gs.forEach(function (g) {
      push({ at: c.at, by: c.by, kind: 'complete', group: g.group, line: c.lines || '', pu: c.pu || '', style: '', text: t('aDetailDone', [g.rows, g.kept || 0, g.adjusted || 0, g.removed || 0, g.pending || 0]) });
    });
  });
  (TS.ends || []).forEach(function (e) {
    push({ at: e.at, by: e.by, kind: 'end', group: '', line: e.line, pu: puOfLine(e.line), style: e.style, text: e.endDate ? t('aDetailEnd', [e.planEnd || '', e.endDate]) : t('aDetailEndReset', [e.planEnd || '']) });
  });
  (TS.shared || []).forEach(function (s) { var st = s.styles || []; push({ at: s.at, by: s.by, kind: 'share', group: '', line: '', pu: '', style: st.join(' → '), text: '' }); });
  (closed || []).forEach(function (c) { push({ at: c.at, by: c.by, kind: 'close', group: '', line: '', pu: '', style: '', text: t('aDetailClose', [c.totals ? c.totals.rows : 0, c.totals ? c.totals.pending : 0, c.totals ? c.totals.notices : 0]) + (c.note ? ' · ' + c.note : '') }); });
  (dbap || []).forEach(function (a) { push({ at: a.time, by: a.name, kind: 'dbapprove', group: '', line: '', pu: a.pu || '', style: a.style || '', text: a.detail || '' }); });
  return ev.filter(function (e) { return e.at; }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
}
async function actLoad() {
  if (!LCDIR) { $('actEmpty').hidden = false; $('actCard').hidden = true; return; }
  $('actEmpty').hidden = true; $('actCard').hidden = false;
  var since = new Date(Date.now() - 90 * 864e5).toISOString();
  await tLoadAll(LCDIR); RS.actionsRaw = await pReadDir(LCDIR, 'prep/actions'); var closed = await pReadDir(LCDIR, 'prep/closed'), dbap = await readDbApproved(LCDIR, since);
  ACT.ev = buildEvents(closed, dbap); ACT.loaded = true;
  if (!$('aFrom').value) { var d0 = new Date(Date.now() - 30 * 864e5); $('aFrom').value = d0.toISOString().slice(0, 10); }
  fillActSelects(); renderActivity();
}
function fillActSelects() {
  var pus = {}, by = {}, kinds = {}; ACT.ev.forEach(function (e) { if (e.pu) pus[e.pu] = 1; if (e.by) by[e.by] = 1; kinds[e.kind] = 1; });
  var fill = function (id, first, list, lab) { var cur = $(id).value; $(id).innerHTML = '<option value="">' + esc(first) + '</option>' + list.map(function (x) { return '<option value="' + esc(x) + '">' + esc(lab ? lab(x) : x) + '</option>'; }).join(''); $(id).value = list.indexOf(cur) >= 0 ? cur : ''; };
  fill('aPU', t('aAllPU'), Object.keys(pus).sort()); fill('aBy', t('aAllBy'), Object.keys(by).sort()); fill('aKind', t('aAllKind'), Object.keys(kinds).sort(), function (k) { return t('ak_' + k); });
}
function actFiltered(skipGroup) {
  var f = $('aFrom').value, to = $('aTo').value, pu = $('aPU').value, by = $('aBy').value, kind = $('aKind').value, q = ($('aQ').value || '').trim().toUpperCase(), ln = $('aLines').value;
  return ACT.ev.filter(function (e) {
    var day = String(e.at).slice(0, 10);
    return (!f || day >= f) && (!to || day <= to) && (!pu || e.pu === pu) && (!by || e.by === by) && (!kind || e.kind === kind) && (!q || (e.style + ' ' + e.text).toUpperCase().indexOf(q) >= 0) &&
      lineMatch(e.line, ln) && (skipGroup || !ACT.group || e.group === ACT.group);
  });
}
var KINDCOL = ['keep', 'adjust', 'remove', 'same', 'notice', 'complete'];
function summarize(list, keyFn) {
  var m = {}; list.forEach(function (e) { var k = keyFn(e); if (k == null || k === '') return; var o = m[k] = m[k] || { key: k, n: 0, last: null, lastBy: '', pu: e.pu }; o.n++; o[e.kind] = (o[e.kind] || 0) + 1; if (!o.last || String(e.at) > String(o.last)) { o.last = e.at; o.lastBy = e.by; } });
  return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.n - a.n || String(a.key).localeCompare(String(b.key)); });
}
function renderActivity() {
  if (!ACT.loaded) return;
  var all = actFiltered(true), list = actFiltered(false), lim = 500;
  var gs = summarize(all, function (e) { return e.group; });
  $('aGroups').innerHTML = '<button data-g="" class="' + (!ACT.group ? 'on' : '') + '">' + esc(t('aAllGroups')) + '</button>' + gs.map(function (g) { return '<button data-g="' + esc(g.key) + '" class="' + (ACT.group === g.key ? 'on' : '') + '">' + esc(g.key) + ' <small>' + g.n + '</small></button>'; }).join('');
  [].forEach.call(document.querySelectorAll('[data-av]'), function (b) { b.classList.toggle('on', b.dataset.av === ACT.view); });
  $('actCount').textContent = list.length;
  var h = '';
  if (ACT.view === 'list') {
    h = '<tr><th class="l">' + t('aThTime') + '</th><th class="l">' + t('aThBy') + '</th><th class="l">' + t('aThAct') + '</th><th class="l">' + t('aThGroup') + '</th><th class="l">' + t('aThLine') + '</th><th class="l">' + t('aThStyle') + '</th><th class="l">' + t('aThDetail') + '</th></tr>' +
      list.slice(0, lim).map(function (e) {
        var cls = { end: 't-info', keep: 't-ok', adjust: 't-info', remove: 't-bad', same: 't-ok', notice: 't-warn', noticeFix: 't-ok', noticeRej: 't-bad', complete: 't-ok', send: 't-info', close: 't-ok', share: 't-info', dbapprove: 't-info' }[e.kind];
        return '<tr><td style="white-space:nowrap">' + esc(stamp16(e.at)) + '</td><td>' + esc(e.by) + '</td><td><span class="tag ' + cls + '">' + esc(t('ak_' + e.kind)) + '</span></td><td>' + esc(e.group) + '</td><td>' + esc(e.line) + '</td><td>' + esc(e.style) + '</td><td>' + esc(e.text) + '</td></tr>';
      }).join('');
    $('aNote').textContent = list.length > lim ? t('aShown', [lim, list.length]) : t('rows', [list.length]);
  } else {
    var rows = summarize(list, ACT.view === 'group' ? function (e) { return e.group; } : function (e) { return e.line; });
    h = '<tr><th class="l">' + t(ACT.view === 'group' ? 'aThGroup' : 'aThLine') + '</th>' + (ACT.view === 'line' ? '<th class="l">PU</th>' : '') + '<th>' + t('aThEvents') + '</th>' + KINDCOL.map(function (k) { return '<th>' + t('ak_' + k) + '</th>'; }).join('') + '<th class="l">' + t('aThLast') + '</th></tr>' +
      rows.slice(0, 300).map(function (o) {
        return '<tr data-sk="' + esc(o.key) + '" style="cursor:pointer"><td><b>' + esc(o.key) + '</b></td>' + (ACT.view === 'line' ? '<td>' + esc(o.pu || '') + '</td>' : '') + '<td>' + o.n + '</td>' + KINDCOL.map(function (k) { return '<td>' + (o[k] || '') + '</td>'; }).join('') + '<td>' + esc(stamp16(o.last)) + ' · ' + esc(o.lastBy) + '</td></tr>';
      }).join('');
    $('aNote').textContent = t('rows', [rows.length]);
  }
  $('aTable').innerHTML = list.length ? h : '<tr><td class="empty">' + esc(t('aNone')) + '</td></tr>';
  [].forEach.call($('aGroups').querySelectorAll('[data-g]'), function (b) { b.onclick = function () { ACT.group = b.dataset.g; renderActivity(); }; });
  [].forEach.call($('aTable').querySelectorAll('[data-sk]'), function (r) {      // click a machine group / line row: filter the detail list by it
    r.onclick = function () { if (ACT.view === 'group') ACT.group = r.dataset.sk; else $('aLines').value = r.dataset.sk; ACT.view = 'list'; renderActivity(); };
  });
}
['aFrom', 'aTo', 'aPU', 'aBy', 'aKind'].forEach(function (id) { $(id).onchange = renderActivity; });
['aLines', 'aQ'].forEach(function (id) { $(id).oninput = renderActivity; });
[].forEach.call(document.querySelectorAll('[data-av]'), function (b) { b.onclick = function () { ACT.view = b.dataset.av; renderActivity(); }; });
$('aRefresh').onclick = actLoad;
$('aExport').onclick = function () {
  var list = actFiltered(false), wb = XLSX.utils.book_new(), H = ['Thời gian', 'Người', 'Hành động', 'Loại máy', 'Chuyền', 'PU', 'Mã hàng', 'Chi tiết'];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H].concat(list.map(function (e) { return [stamp16(e.at), e.by, t('ak_' + e.kind), e.group, e.line, e.pu, e.style, e.text]; }))), 'NHẬT KÝ');
  [['THEO LOẠI MÁY', function (e) { return e.group; }, 'Loại máy'], ['THEO CHUYỀN', function (e) { return e.line; }, 'Chuyền']].forEach(function (s) {
    var rows = summarize(list, s[1]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[s[2], 'Sự kiện'].concat(KINDCOL.map(function (k) { return t('ak_' + k); })).concat(['Gần nhất', 'Người'])].concat(rows.map(function (o) { return [o.key, o.n].concat(KINDCOL.map(function (k) { return o[k] || 0; })).concat([stamp16(o.last), o.lastBy]); }))), s[0]);
  });
  var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
  XLSX.writeFile(wb, 'NHAT_KY_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.xlsx');
};
window.actLoad = actLoad;

function applyPh() { [].forEach.call(document.querySelectorAll('[data-ph]'), function (el) { el.placeholder = t(el.dataset.ph); }); }
applyPh();
