// ===================== RESIZABLE TABLE COLUMNS =====================
// Drag the right edge of any column header to change the width; the text of that table then wraps inside the cells.
// Widths are remembered per table (and column) while the page is open, also after the table is redrawn.
var RZ = { w: {}, drag: null };
function rzKey(tb) {
  var id = tb.id, p = tb.parentElement;
  while (!id && p) { id = p.id; p = p.parentElement; }
  var all = id ? [].slice.call(document.querySelectorAll('#' + id + ' table, table#' + id)) : [];
  return (id || 'page') + '#' + Math.max(0, all.indexOf(tb));
}
function rzHeadRow(tb) { return tb.querySelector('tr:has(th)') || null; }
function rzApply(tb) {
  var row = rzHeadRow(tb); if (!row) return;
  var key = rzKey(tb), ws = RZ.w[key]; if (!ws) return;
  var ths = [].slice.call(row.children);
  var set = false; ths.forEach(function (th, i) { if (ws[i]) { th.style.width = th.style.minWidth = th.style.maxWidth = ws[i] + 'px'; set = true; } });
  if (set) { tb.classList.add('rzw'); tb.style.tableLayout = 'fixed'; tb.style.width = ths.reduce(function (s, th, i) { return s + (ws[i] || th.offsetWidth); }, 0) + 'px'; }
}
function rzDecorate(tb) {
  if (tb.dataset.rz || tb.closest('[data-norz]')) return;
  var row = rzHeadRow(tb); if (!row) return;
  tb.dataset.rz = '1';
  [].forEach.call(row.children, function (th, i) {
    if (th.tagName !== 'TH') return;
    var h = document.createElement('span'); h.className = 'rzh'; h.title = t('rzHint'); h.dataset.i = i; th.appendChild(h);
  });
  rzApply(tb);
}
function rzScan() { [].forEach.call(document.querySelectorAll('table'), rzDecorate); }
document.addEventListener('mousedown', function (e) {
  var h = e.target.closest && e.target.closest('.rzh'); if (!h) return;
  var tb = h.closest('table'), row = rzHeadRow(tb), ths = [].slice.call(row.children), key = rzKey(tb);
  var ws = RZ.w[key] = RZ.w[key] || {};
  ths.forEach(function (th, i) { if (!ws[i]) ws[i] = th.offsetWidth; });          // freeze all columns at their present width, then change only this one
  tb.classList.add('rzw'); tb.style.tableLayout = 'fixed';
  ths.forEach(function (th, i) { th.style.width = th.style.minWidth = th.style.maxWidth = ws[i] + 'px'; });
  RZ.drag = { tb: tb, ths: ths, key: key, i: +h.dataset.i, x: e.clientX, w0: ws[+h.dataset.i] };
  document.body.classList.add('rzing'); e.preventDefault(); e.stopPropagation();
}, true);
document.addEventListener('mousemove', function (e) {
  var d = RZ.drag; if (!d) return;
  var w = Math.max(28, d.w0 + e.clientX - d.x), ws = RZ.w[d.key]; ws[d.i] = w;
  var th = d.ths[d.i]; th.style.width = th.style.minWidth = th.style.maxWidth = w + 'px';
  d.tb.style.width = d.ths.reduce(function (s, x, i) { return s + (ws[i] || x.offsetWidth); }, 0) + 'px';
});
document.addEventListener('mouseup', function () { if (RZ.drag) { RZ.drag = null; document.body.classList.remove('rzing'); } });
document.addEventListener('dblclick', function (e) {                                  // double-click the edge: back to automatic width for this table
  var h = e.target.closest && e.target.closest('.rzh'); if (!h) return;
  var tb = h.closest('table'); delete RZ.w[rzKey(tb)];
  tb.classList.remove('rzw'); tb.style.tableLayout = ''; tb.style.width = ''; [].forEach.call(tb.querySelectorAll('th'), function (th) { th.style.width = th.style.minWidth = th.style.maxWidth = ''; });
});
var rzTimer = 0;
new MutationObserver(function () { if (rzTimer) return; rzTimer = setTimeout(function () { rzTimer = 0; rzScan(); }, 30); }).observe(document.body, { childList: true, subtree: true });
rzScan();
