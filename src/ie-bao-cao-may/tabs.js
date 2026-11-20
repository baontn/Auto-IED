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
