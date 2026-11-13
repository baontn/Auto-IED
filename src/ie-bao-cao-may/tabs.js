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

if (window.paintRemember) paintRemember();
