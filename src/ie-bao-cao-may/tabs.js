// ===================== MAIN TABS (IE Báo cáo máy) =====================
var TAB = 'data';
try { TAB = localStorage.getItem('mdb_tab') || 'data'; } catch (e) { }
function setTab(tb) {
  TAB = tb; try { localStorage.setItem('mdb_tab', tb); } catch (e) { }
  [].forEach.call(document.querySelectorAll('[data-pane]'), function (p) { p.hidden = p.dataset.pane !== tb; });
  [].forEach.call(document.querySelectorAll('#mainTabs [data-tab]'), function (b) { b.classList.toggle('on', b.dataset.tab === tb); });
  $('savebar').hidden = !(tb === 'db' && RV && ROLE !== 'tech' && ROLE !== 'sup');
  if (tb === 'resid' && window.rsOpen) rsOpen();
  if (tb === 'prep') { ensurePrep(); if (window.refreshPrepData) refreshPrepData(); }
  if (tb === 'activity') { applyPh(); actLoad(); }
  if (tb === 'notice') { $('noticeEmpty').hidden = !!LCDIR; if (LCDIR) renderNotices(); }
  paintTabs();
}
function ensurePrep() {
  var ok = REF.db && (REF.planRows || REF.mbl);
  $('prepEmpty').hidden = !!ok;
  if (ok) { if ($('step4').hidden) prepInit(); else prepRender(); } else $('step4').hidden = true;
}
function paintTabs() {
  var lbl = function (tb, extra) { var b = document.querySelector('#mainTabs [data-tab="' + tb + '"]'); if (b) b.innerHTML = esc(t(b.dataset.t)) + (extra || ''); };
  var dataOk = REF.db && REF.plan;
  lbl('data', dataOk ? '<span class="ok">✓</span>' : '');
  var nRev = RV ? RV.items.filter(function (it) { return it.bucket === 'review'; }).length : 0;
  lbl('db', nRev ? '<span class="cnt">' + nRev + '</span>' : '');
  lbl('prep', '');
  var nS = window.rsShortCount && RS.root ? rsShortCount() : 0; lbl('resid', nS ? '<span class="cnt">' + nS + '</span>' : '');
  lbl('activity', '');
  var nN = (PS.notices || []).filter(function (n) { return !(PS.noticeRes || []).some(function (r) { return r.id === n.id; }); }).length;
  lbl('notice', nN ? '<span class="cnt">' + nN + '</span>' : '');
}
$('mainTabs').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); };
window.setTabMain = setTab; window.paintTabs = paintTabs;
// role switch: IE Tech sees only "Duyệt chuẩn bị"
var _setRole = setRole;
setRole = function (r) { _setRole(r); $('mainTabs').hidden = r === 'tech' || r === 'sup'; if (r !== 'tech' && r !== 'sup') setTab(TAB); };
setRole(ROLE);

// one button in the header: read again every remembered file (MC Report, Master plan, layout folder, data folder) without choosing anything again
$('bRefresh').onclick = async function () {
  var b = this, have = (await KV.get('cmc')) || (await KV.get('cfiles') || []).length || (await KV.get('cdata'));
  if (!have) { alert(t('hdrRefreshNone')); return; }
  b.disabled = true; var old = b.textContent; b.textContent = '⏳ …';
  try { await reconnect(true); REF.demand = null; setTab(TAB); } finally { b.disabled = false; b.textContent = old; }
  $('remMsg').textContent = t('hdrRefreshDone', [new Date().toLocaleTimeString()]);
};
// ===== busy indicator (corner pill + thin top bar): shown while a file is read, a folder scanned, data loaded or an Excel file is made =====
var BUSY = { c: {}, lab: {}, order: [], since: 0, until: 0 };
function busyActive() { return BUSY.order.filter(function (k) { return BUSY.c[k] > 0; }); }
function busyPaint() {
  var act = busyActive(), on = act.length > 0 || Date.now() < BUSY.until;
  if ($('busy')) { $('busy').hidden = !on; $('busyBar').hidden = !on; if (act.length) $('busyTx').textContent = BUSY.lab[act[act.length - 1]]; }
}
function busyOn(k, label) {
  if (!busyActive().length) BUSY.since = Date.now();
  BUSY.c[k] = (BUSY.c[k] || 0) + 1; BUSY.lab[k] = label; BUSY.order = BUSY.order.filter(function (x) { return x !== k; }).concat([k]); busyPaint();
}
function busyLabel(k, label) { if (BUSY.c[k] > 0) { BUSY.lab[k] = label; busyPaint(); } }
function busyOff(k) {
  BUSY.c[k] = Math.max(0, (BUSY.c[k] || 0) - 1);
  if (!busyActive().length) { BUSY.until = Date.now() - BUSY.since < 250 ? 0 : BUSY.since + 700; setTimeout(busyPaint, Math.max(0, BUSY.until - Date.now()) + 5); }       // quick tasks hide at once, a real wait stays visible at least 0.7 s
  busyPaint();
}
// wrap the functions that take time; "delay" lets the browser draw the indicator before heavy synchronous work starts
function busyWrap(name, key, delay) {
  var f = window[name]; if (typeof f !== 'function') return;
  window[name] = async function () {
    busyOn(name, t(key)); try { if (delay) await new Promise(function (r) { setTimeout(r, 30); }); return await f.apply(this, arguments); } finally { busyOff(name); }
  };
}
[['reconnect', 'busyData'], ['useMcHandle', 'busyExcel'], ['useFileHandle', 'busyExcel'], ['useLayoutDir', 'busyScan'], ['buildLayIndex', 'busyScan'], ['prepExport', 'busyXl'], ['srcExportXlsx', 'busyXl'], ['rsExportTable', 'busyXl'], ['poolExportXlsx', 'busyXl'],
 ['prepSend', 'busySend'], ['tLoadAll', 'busyData'], ['rsLoad', 'busyData'], ['connectLc', 'busyData'], ['useDataDir', 'busyData'], ['supUse', 'busyData'], ['refreshPrepData', 'busyData'], ['actLoad', 'busyData'], ['openClose', 'busyData'], ['closeCollect', 'busyData'], ['previewFiles', 'busyExcel']]
  .forEach(function (x) { busyWrap(x[0], x[1], true); });
// handlers: the long ones get the indicator too
[['pOpen', 'busyPrep', true], ['bFiles', 'busyExcel', false], ['bMc', 'busyExcel', false]].forEach(function (x) {
  var el = $(x[0]); if (!el || typeof el.onclick !== 'function') return; var h = el.onclick;
  el.onclick = async function (ev) { busyOn('h:' + x[0], t(x[1])); try { if (x[2]) await new Promise(function (r) { setTimeout(r, 30); }); return await h.call(this, ev); } finally { busyOff('h:' + x[0]); } };
});
// files read by processExcel (it counts PENDING itself)
var _ready = ready; ready = function () { _ready(); if (PENDING > 0 && !BUSY.c.xl) { BUSY.c.xl = 0; busyOn('xl', t('busyExcel')); } else if (PENDING <= 0 && BUSY.c.xl > 0) busyOff('xl'); };
if (window.paintRemember) paintRemember().then(function () { return reconnect(false); });

// any script error is shown in a red strip (so a failing export / save is never silent) and can be copied to the IE team
(function () {
  var shown = {};
  function show(msg) {
    msg = String(msg || '').slice(0, 300); if (!msg || shown[msg]) return; shown[msg] = 1;
    var b = document.getElementById('errBar');
    if (!b) { b = document.createElement('div'); b.id = 'errBar'; b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;background:#b91c1c;color:#fff;padding:6px 14px;font-size:13px;display:flex;gap:10px;align-items:center'; document.body.appendChild(b); }
    b.innerHTML = ''; var sp = document.createElement('span'); sp.textContent = '⚠ ' + t('errStrip') + ' ' + msg; sp.style.flex = '1'; b.appendChild(sp);
    var x = document.createElement('button'); x.textContent = '✕'; x.onclick = function () { b.remove(); shown = {}; }; b.appendChild(x);
  }
  window.addEventListener('error', function (e) { show(e.message); });
  window.addEventListener('unhandledrejection', function (e) { show(e.reason && e.reason.message ? e.reason.message : e.reason); });
})();
