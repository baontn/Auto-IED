/* changes.js: changes against the imported layout file (machines per operation), add machines by operation,
   remove / restore operations, quick WIP simulation on the 2D plan. */
var KSEP = '\u0001';
function normOp(s) { return String(s == null ? '' : s).trim().replace(/^0+(?=\d)/, '').toUpperCase(); }
function opKey(it) { return opsOf(it).map(function (o) { return o.toUpperCase(); }).join('/'); }
function mcCount(items) {
  var m = {};
  (items || ST.items).forEach(function (it) { if (it.kind !== 'mc') return; var k = opKey(it) + KSEP + it.code; m[k] = (m[k] || 0) + 1; });
  return m;
}
/* the reference = machines per operation of the layout file just imported */
function setBase(src) { ST.base = { at: new Date().toISOString(), src: src || '', mc: mcCount() }; ST.opsOff = []; }
function addToBase(items) { if (!ST.base) return setBase(''); var m = mcCount(items); Object.keys(m).forEach(function (k) { ST.base.mc[k] = (ST.base.mc[k] || 0) + m[k]; }); }
function baseChanges() {
  if (!ST.base) return [];
  var a = ST.base.mc || {}, b = mcCount(), keys = {}, out = [];
  Object.keys(a).concat(Object.keys(b)).forEach(function (k) { keys[k] = 1; });
  Object.keys(keys).forEach(function (k) { var f = a[k] || 0, to = b[k] || 0; if (f !== to) { var p = k.split(KSEP); out.push({ op: p[0], code: p[1], from: f, to: to }); } });
  return out.sort(function (x, y) { return simNum(x.op) - simNum(y.op) || (x.op < y.op ? -1 : x.op > y.op ? 1 : 0) || (x.code < y.code ? -1 : 1); });
}
function chgText(c) { return t('chgLine', [c.op || t('chgNoOp'), c.code, c.from, c.to, (c.to > c.from ? '+' : '') + (c.to - c.from)]); }
function opIsOff(op) { var k = normOp(op); return (ST.opsOff || []).some(function (x) { return normOp(x.op) === k; }); }

/* ---------- machine of an operation ---------- */
function mcForOp(op) {
  var k = normOp(op); if (!k) return null;
  var exact = null, part = null, n = 0;
  ST.items.forEach(function (it) {
    if (it.kind !== 'mc') return;
    var ops = opsOf(it).map(function (o) { return o.toUpperCase(); });
    if (ops.indexOf(k) < 0) return; n++;
    if (ops.length === 1) { if (!exact) exact = it; } else if (!part) part = it;
  });
  var src = exact || part;
  if (src) return { op: k, code: src.code, src: src, n: n };
  // not on the plan any more: the machine of the layout file, or of a removed operation
  var off = (ST.opsOff || []).filter(function (x) { return normOp(x.op) === k; })[0];
  if (off && off.items.length) return { op: k, code: off.items[0].code, src: null, n: 0, fromBase: true };
  var code = null;
  Object.keys((ST.base || {}).mc || {}).forEach(function (key) { var p = key.split(KSEP); if (!code && p[0].split('/').indexOf(k) >= 0) code = p[1]; });
  return code ? { op: k, code: code, src: null, n: 0, fromBase: true } : null;
}
/* free place: no overlap of table / operator zone with anything, inside the line, not in the walkway */
function spotFree(it, anyPlace) {
  var s = shapes(it), wo = walkObb();
  if (!anyPlace && (outside(s.table) || (s.zone && outside(s.zone)))) return false;
  if (wo && (overlap(wo, s.table) > TOL || (s.zone && overlap(wo, s.zone) > TOL))) return false;
  return ST.items.every(function (o) {
    if (o === it) return true;
    var q = shapes(o);
    return !(overlap(s.table, q.table) > TOL || (s.zone && overlap(s.zone, q.table) > TOL) || (q.zone && overlap(q.zone, s.table) > TOL) || (s.zone && q.zone && overlap(s.zone, q.zone) > TOL));
  });
}
function placeNear(it, src) {
  if (src) {
    var step = Math.max(extentX(it), 20);
    for (var k = 1; k <= 60; k++) {
      for (var sg = 1; sg >= -1; sg -= 2) { it.x = n1(src.x + sg * k * step); it.y = src.y; if (spotFree(it)) return true; }
      if (k % 10 === 0) step = Math.max(10, step / 2);   // tables of other sizes leave smaller gaps
    }
  }
  var b = bbox(ST.items.filter(function (o) { return o !== it; })), c = viewCenter();   // no gap found: below the plan, to be dragged in place
  it.x = src ? src.x : snapV(c.x); it.y = b ? n1(b.y1 + 40 + dimOf(it.code).W / 2) : snapV(c.y);
  var x0 = it.x, st = Math.max(extentX(it), 20);
  for (var j = 0; j < 80 && !spotFree(it, true); j++) it.x = n1(x0 + (j % 2 ? -1 : 1) * Math.ceil((j + 1) / 2) * st);   // not on top of another machine
  return false;
}
function addByOp(op, n, code) {
  var m = mcForOp(op), k = normOp(op);
  code = normCode(code || (m && m.code)); if (!code || !k) return null;
  restoreOp(k, true);
  var ids = [], free = true;
  for (var i = 0; i < Math.max(1, n || 1); i++) {
    var src = m && m.src;
    var it = { id: uid(), kind: 'mc', code: code, op: k, x: 0, y: 0, rot: src ? src.rot || 0 : 0 };
    if (src && src.stand != null) it.stand = src.stand;
    if (src && src.zone) it.zone = src.zone;
    ST.items.push(it);
    if (!placeNear(it, src || (ids.length ? itemById(ids[ids.length - 1]) : null))) free = false;
    ids.push(it.id);
  }
  SEL = ids; changed(); onSelChange();
  toast(t(free ? 'opAdded' : 'opAddedNoSpot', [ids.length, code, k]));
  return ids;
}
/* remove an operation: its machines go, a combined machine ("37/42") keeps its other operation; kept for restore */
function removeOpPlan(op) {
  var k = normOp(op), del = [], rel = [];
  ST.items.forEach(function (it) {
    if (it.kind !== 'mc') return;
    var ops = opsOf(it); if (ops.map(function (o) { return o.toUpperCase(); }).indexOf(k) < 0) return;
    if (ops.length === 1) del.push(it); else rel.push(it);
  });
  return { op: k, del: del, rel: rel };
}
function removeOp(op, ask) {
  var r = removeOpPlan(op);
  if (!r.del.length && !r.rel.length) { toast(t('opNone', [r.op]), true); return false; }
  if (ask && !confirm(t('opRemoveAsk', [r.op, r.del.length, r.rel.length]))) return false;
  var rec = { op: r.op, at: new Date().toISOString(), items: r.del.map(function (it) { return JSON.parse(JSON.stringify(it)); }), rel: r.rel.map(function (it) { return { id: it.id, op: it.op }; }) };
  ST.items = ST.items.filter(function (it) { return r.del.indexOf(it) < 0; });
  r.rel.forEach(function (it) { it.op = opsOf(it).filter(function (o) { return o.toUpperCase() !== r.op; }).join('/'); });
  ST.items.forEach(function (i) { if (i.by && !itemById(i.by)) delete i.by; });
  ST.opsOff = (ST.opsOff || []).filter(function (x) { return normOp(x.op) !== r.op; }).concat([rec]);
  SEL = SEL.filter(itemById); SIMR = null;
  changed(); onSelChange();
  toast(t('opRemoved', [r.op, r.del.length, r.rel.length]));
  return true;
}
/* put a removed operation back (machines at their old place, combined labels back); quiet = only forget the record */
function restoreOp(op, quiet) {
  var k = normOp(op), rec = (ST.opsOff || []).filter(function (x) { return normOp(x.op) === k; })[0]; if (!rec) return false;
  ST.opsOff = ST.opsOff.filter(function (x) { return x !== rec; });
  if (quiet) return true;
  rec.items.forEach(function (c) { if (!itemById(c.id)) ST.items.push(c); else { var cp = JSON.parse(JSON.stringify(c)); cp.id = uid(); ST.items.push(cp); } });
  rec.rel.forEach(function (x) { var it = itemById(x.id); if (it) it.op = x.op; });
  SIMR = null; changed(); toast(t('chgRestored', [k]));
  return true;
}

/* ---------- card "Thay đổi so với file layout" + tag in the 2D toolbar ---------- */
function renderChanges() {
  var box = $('chgBody'); if (!box) return;
  var ch = baseChanges(), off = ST.opsOff || [], h = '';
  $('chgTag').style.display = ch.length ? '' : 'none';
  $('chgTag').textContent = t('chgTag', [ch.length]);
  if (!ST.base) {
    h = '<div class="muted">' + esc(t('chgNoBase')) + '</div>' + (ST.items.some(function (i) { return i.kind === 'mc'; }) ? '<div class="row" style="margin-top:6px"><button data-chg="base">' + esc(t('chgSetBase')) + '</button></div>' : '');
  } else {
    var b = ST.base, when = b.at ? new Date(b.at).toLocaleString() : '';
    h += '<div class="muted small">' + esc(t('chgBase', [b.src || '—', when])) + '</div>';
    if (!ch.length) h += '<div class="t-ok tagline">' + esc(t('chgNone')) + '</div>';
    else {
      h += '<div class="t-bad tagline"><b>⚠ ' + esc(t('chgWarn')) + '</b></div><table class="mini" style="width:100%;margin-top:6px"><tr><th>' + esc(t('chgOp')) + '</th><th>' + esc(t('chgMc')) + '</th><th class="n">' + esc(t('chgFile')) + '</th><th class="n">' + esc(t('chgNow')) + '</th><th class="n">±</th></tr>' +
        ch.map(function (c) { var d = c.to - c.from; return '<tr data-chgop="' + esc(c.op) + '" data-chgcode="' + esc(c.code) + '" style="cursor:pointer"><td><b>' + esc(c.op || t('chgNoOp')) + '</b></td><td title="' + esc(codeName(c.code)) + '">' + esc(c.code) + '</td><td class="n">' + c.from + '</td><td class="n">' + c.to + '</td><td class="n"><b class="' + (d > 0 ? 't-info' : 't-bad') + '" style="padding:0 4px;border-radius:4px">' + (d > 0 ? '+' : '') + d + '</b></td></tr>'; }).join('') + '</table>';
    }
    if (off.length) h += '<div style="margin-top:6px">' + esc(t('chgOff')) + ' ' + off.map(function (x) { return '<span class="chip">' + esc(x.op) + ' <button data-restore="' + esc(x.op) + '" title="' + esc(t('chgRestore')) + '" style="padding:0 5px;font-size:12px">↺</button></span>'; }).join(' ') + '</div>';
    if (ch.length) h += '<div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap"><button data-chg="copy">' + esc(t('chgCopy')) + '</button><button data-chg="accept">' + esc(t('chgAccept')) + '</button></div>';
  }
  box.innerHTML = h;
}
function chgClick(e) {
  var b = e.target.closest('[data-chg]'), rs = e.target.closest('[data-restore]'), tr = e.target.closest('tr[data-chgop]');
  if (rs) { restoreOp(rs.dataset.restore); return; }
  if (b && b.dataset.chg === 'base') { setBase(t('chgBaseNow')); changed(); return; }
  if (b && b.dataset.chg === 'accept') { if (confirm(t('chgAcceptAsk'))) { setBase(t('chgBaseFixed', [(ST.base || {}).src || ''])); changed(); } return; }
  if (b && b.dataset.chg === 'copy') {
    var txt = [t('chgTitle') + ((ST.info || {}).style ? ' · ' + ST.info.style : '') + (ST.line.name ? ' · ' + ST.line.name : '')].concat(baseChanges().map(chgText)).join('\n');
    var done = function () { toast(t('chgCopied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { prompt(t('chgCopy'), txt); }); else prompt(t('chgCopy'), txt);
    return;
  }
  if (tr) {
    var op = tr.dataset.chgop, code = tr.dataset.chgcode;
    SEL = ST.items.filter(function (it) { return it.kind === 'mc' && it.code === code && opKey(it) === op; }).map(function (it) { return it.id; });
    if (TAB !== 'plan') setTab('plan'); onSelChange(); render2d();
  }
}

/* ---------- dialog "thêm máy theo công đoạn / bỏ công đoạn" ---------- */
function openOpDlg(op) {
  var ops = {}; ST.items.forEach(function (it) { if (it.kind === 'mc') opsOf(it).forEach(function (o) { ops[o.toUpperCase()] = 1; }); });
  $('opList').innerHTML = Object.keys(ops).sort(function (a, b) { return simNum(a) - simNum(b); }).map(function (o) { return '<option value="' + esc(o) + '">'; }).join('');
  $('odOp').value = op || ''; $('odQty').value = 1; $('odCode').value = '';
  opDlgPrev();
  $('dlgOp').showModal(); setTimeout(function () { $('odOp').focus(); }, 30);
}
function opDlgPrev() {
  var op = $('odOp').value, m = mcForOp(op), k = normOp(op), r = k ? removeOpPlan(k) : null, h = '';
  if (!k) h = '<span class="muted">' + esc(t('opDlgHelp')) + '</span>';
  else if (m && m.src) h = esc(t('opFound', [k, m.code, codeName(m.code) || '—', m.n]));
  else if (m) h = esc(t('opFoundBase', [k, m.code, codeName(m.code) || '—']));
  else h = '<span class="t-warn">' + esc(t('opNotFound', [k])) + '</span>';
  $('odPrev').innerHTML = h;
  $('odCodeRow').style.display = k && !m ? '' : 'none';
  $('odAdd').disabled = !k || (!m && !normCode($('odCode').value));
  $('odDel').disabled = !r || (!r.del.length && !r.rel.length);
}
function initChanges() {
  $('chgBody').addEventListener('click', chgClick);
  $('chgTag').onclick = function () { if (document.body.classList.contains('noside')) setSide(false); setTimeout(function () { $('chgCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 50); };
  $('bAddOp').onclick = function () { openOpDlg(''); };
  ['odOp', 'odCode'].forEach(function (id) { $(id).addEventListener('input', opDlgPrev); });
  $('odOp').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !$('odAdd').disabled) $('odAdd').click(); });
  $('odAdd').onclick = function () { var op = $('odOp').value, n = Math.max(1, Math.min(20, Math.round(num($('odQty').value, 1)))); if (addByOp(op, n, $('odCode').value)) $('dlgOp').close(); };
  $('odDel').onclick = function () { if (removeOp($('odOp').value, true)) $('dlgOp').close(); };
  $('bWip2d').onclick = function () { WIPBAR.on = true; quickWip(); };
  $('wipBar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-wip]'); if (!b) return;
    if (b.dataset.wip === 'close') { WIPBAR.on = false; $('wipBar').style.display = 'none'; }
    else if (b.dataset.wip === 'more') setTab('sim');
    else if (b.dataset.wip === 'op') { SEL = ST.items.filter(function (it) { return it.kind === 'mc' && opsOf(it).indexOf(b.dataset.op) >= 0; }).map(function (it) { return it.id; }); onSelChange(); render2d(); }
  });
}

/* ---------- quick WIP simulation on the 2D plan (re-runs by itself after each change while the bar is open) ---------- */
var WIPBAR = { on: false, prev: null, timer: 0 };
function quickWip() {
  simDefaults();
  var p = simParams(), prev = SIMR ? SIMR.outH : WIPBAR.last;
  var B = simBalance(p.eff);
  if (!B.rows.some(function (r) { return r.sam > 0 && r.people > 0; })) { $('wipBar').style.display = TAB === 'plan' ? '' : 'none'; $('wipBar').innerHTML = '<span>' + esc(t('wipNoSam')) + '</span><button data-wip="more">' + esc(t('wipMore')) + '</button><button data-wip="close">✕</button>'; return; }
  simRun(p); OPT.wip = true; $('optWip').checked = true;
  var r = SIMR, top = r.rows.filter(function (x) { return (x.wipEnd || 0) + (x.feedEnd || 0) > 0; }).sort(function (a, b) { return ((b.wipEnd || 0) + (b.feedEnd || 0)) - ((a.wipEnd || 0) + (a.feedEnd || 0)); })[0];
  var tot = r.rows.reduce(function (a, x) { return a + (x.wipEnd || 0) + (x.feedEnd || 0); }, 0), out = Math.round(r.outH);
  var d = prev != null ? out - Math.round(prev) : 0;
  WIPBAR.last = r.outH;
  $('wipBar').style.display = TAB === 'plan' ? '' : 'none';
  $('wipBar').innerHTML = '<b>⏱ ' + esc(t('wipOut', [out])) + '</b>' + (prev != null && d ? ' <span class="tag ' + (d > 0 ? 't-ok' : 't-bad') + '">' + esc(t('wipPrev', [Math.round(prev), (d > 0 ? '+' : '') + d])) + '</span>' : '') +
    (r.bottleneck.length ? ' · ' + esc(t('wipBn')) + ' ' + r.bottleneck.map(function (o) { return '<button class="link" data-wip="op" data-op="' + esc(o) + '">' + esc(o) + '</button>'; }).join(', ') : '') +
    ' · ' + esc(t('wipEff', [Math.round(r.lineEff * 100), r.people])) + ' · ' + esc(t('wipTot', [tot])) +
    (top ? ' · ' + esc(t('wipTop')) + ' <button class="link" data-wip="op" data-op="' + esc(top.op) + '">' + esc(top.op) + '</button> (' + ((top.wipEnd || 0) + (top.feedEnd || 0)) + ')' : '') +
    (r.noOper.length ? ' · <span class="t-warn">' + esc(t('wipNoOp', [r.noOper.join(', ')])) + '</span>' : '') +
    ' <span class="muted small">' + esc(t('wipLive')) + '</span><span style="flex:1"></span><button data-wip="more">' + esc(t('wipMore')) + '</button><button data-wip="close" title="' + esc(t('wipClose')) + '">✕</button>';
  render2d();
}
function wipSoon() { if (!WIPBAR.on) return; clearTimeout(WIPBAR.timer); WIPBAR.timer = setTimeout(quickWip, 250); }
