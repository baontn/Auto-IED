// ===================== ROLE: IE Tech (prep review on the day grid + variation notices) =====================
var ROLE = 'cons'; try { ROLE = localStorage.getItem('mdb_role') || 'cons'; } catch (e) { }
var TS = { dir: null, lay: null, props: [], reviews: [], notices: [], res: [], rows: [], cur: null };
function setRole(r) {
  ROLE = r; try { localStorage.setItem('mdb_role', r); } catch (e) { }
  [].forEach.call(document.querySelectorAll('#roleSeg [data-role]'), function (b) { b.classList.toggle('on', b.dataset.role === r); });
  $('techView').hidden = r !== 'tech'; $('consView').hidden = r === 'tech'; $('consView2').hidden = r === 'tech';
  if (r !== 'tech') $('tDrawer').hidden = true;
  if (r === 'tech') techRender();
}
$('roleSeg').onclick = function (e) { var b = e.target.closest('[data-role]'); if (b) setRole(b.dataset.role); };
function tSave(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
function tLoad(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
$('tName').value = tLoad('mdb_name'); $('tPU').value = tLoad('mdb_tpu'); $('tLines').value = tLoad('mdb_tlines');
$('tName').oninput = function () { tSave('mdb_name', $('tName').value.trim()); };
$('tPU').onchange = function () { tSave('mdb_tpu', $('tPU').value); techRender(); };
var _tl = null; $('tLines').oninput = function () { clearTimeout(_tl); _tl = setTimeout(function () { tSave('mdb_tlines', $('tLines').value); techRender(); }, 350); };
$('tGroup').onchange = function () { tSave('mdb_tgroup', $('tGroup').value); techRender(); };
$('tOnlyPrep').onchange = techRender;
function isoToday() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function tStamp() { var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '_' + Math.random().toString(36).slice(2, 7); }
async function tWrite(root, path, name, obj) {
  var d = root; for (var p of path.split('/')) d = await d.getDirectoryHandle(p, { create: true });
  var h = await d.getFileHandle(name, { create: true }), w = await h.createWritable(); await w.write(JSON.stringify(obj, null, 1)); await w.close();
}
async function tLoadAll(root) {
  TS.props = await pReadDir(root, 'prep/proposals'); TS.reviews = await pReadDir(root, 'prep/reviews');
  TS.notices = await pReadDir(root, 'prep/notices'); TS.res = await pReadDir(root, 'prep/noticeres'); TS.done = await pReadDir(root, 'prep/complete');
  TS.shared = await pReadDir(root, 'prep/shared');      // style pairs that share a layout (remembered from "Cùng layout")
  TS.ends = await pReadDir(root, 'prep/lineends');      // end dates of the running styles
}
// a pair is remembered by style (not by line or machine group): previous style(s) and next style listed together in one entry
function tIsShared(from, to) {
  if (!from || !to) return false;
  var idx = {}; (TS.shared || []).forEach(function (m, i) { (m.styles || []).forEach(function (s) { (idx[baseKey(s)] = idx[baseKey(s)] || {})[i] = 1; }); });
  var b = idx[baseKey(to)]; if (!b) return false;
  return String(from).split(' + ').some(function (A) { var a = idx[baseKey(A)]; return a && Object.keys(a).some(function (k) { return b[k]; }); });
}
// folder handles are remembered in the browser (IndexedDB), so IE Tech connects once
var KV = { db: null,
  open: function () { var me = this; return me.db ? Promise.resolve(me.db) : new Promise(function (res, rej) { var q = indexedDB.open('iebaocaomay', 1); q.onupgradeneeded = function () { q.result.createObjectStore('kv'); }; q.onsuccess = function () { me.db = q.result; res(me.db); }; q.onerror = function () { rej(q.error); }; }); },
  get: function (k) { return this.open().then(function (db) { return new Promise(function (res) { var r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }); }).catch(function () { return null; }); },
  set: function (k, v) { return this.open().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; }); }).catch(function () { }); } };
// the person always chooses the folder (the picker opens in the remembered one); "Dùng lại" reconnects the remembered folder
async function chooseDir(key, id, mode) {
  if (!window.showDirectoryPicker) throw new Error(t('lcNoApi'));
  var old = await KV.get(key), opt = { id: id, mode: mode };
  if (old) opt.startIn = old;
  var h; try { h = await window.showDirectoryPicker(opt); } catch (e) { if (e.name === 'AbortError') throw e; delete opt.startIn; h = await window.showDirectoryPicker(opt); }
  await KV.set(key, h); return h;
}
async function reuseDir(key, mode) {
  var h = await KV.get(key); if (!h) return null;
  if ((await h.queryPermission({ mode: mode })) === 'granted' || (await h.requestPermission({ mode: mode })) === 'granted') return h;
  return null;
}
async function pickDir(key, id, mode) { return (await reuseDir(key, mode)) || chooseDir(key, id, mode); }      // used where a quiet reconnect is wanted
async function useDataDir(d) {
  TS.dir = d; await tLoadAll(d); techRender();
  var props = TS.props.slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }), p0 = props[0];
  $('tConn').className = 'small ' + (props.length ? 'st-ok' : 'st-bad');
  $('tConn').textContent = props.length ? t('tConnInfo', [d.name, props.length, String(p0.at).slice(0, 16).replace('T', ' '), p0.by || '', TS.reviews.length]) : t('tConnNone', [d.name]);
}
async function useLayDir(d) { TS.lay = d; $('tLayConn').textContent = t('tLayOk', [d.name]); $('tLayConn').className = 'st-ok small'; buildLayIndex(false); }
$('tConnect').onclick = async function () { try { await useDataDir(await chooseDir('tdata', 'lcdata', 'readwrite')); paintReuse(); } catch (e) { if (e.name !== 'AbortError') { $('tConn').className = 'small st-bad'; $('tConn').textContent = e.message; } } };
$('tLayConnect').onclick = async function () { try { await useLayDir(await chooseDir('tlay', 'layroot', 'read')); paintReuse(); } catch (e) { if (e.name !== 'AbortError') { $('tLayConn').className = 'small st-bad'; $('tLayConn').textContent = e.message; } } };
$('tReuse').onclick = async function () {
  try {
    var d = await reuseDir('tdata', 'readwrite'); if (d) await useDataDir(d);
    var l = await reuseDir('tlay', 'read'); if (l) await useLayDir(l);
    if (!d && !l) $('tConn').textContent = t('tReuseNone');
  } catch (e) { $('tConn').className = 'small st-bad'; $('tConn').textContent = e.message; }
};
async function paintReuse() {
  var d = await KV.get('tdata'), l = await KV.get('tlay'), n = [d && d.name, l && l.name].filter(Boolean);
  $('tReuse').hidden = !n.length; $('tReuse').textContent = t('tReuseBtn', [n.join(' + ')]);
}
paintReuse();
// network path of the layout folder, to open the original file in Excel
$('tLayPath').value = tLoad('mdb_laypath');
$('tLayPath').onchange = function () { tSave('mdb_laypath', $('tLayPath').value.trim()); if (TS.lastPreview) previewFiles(TS.lastPreview); };
function winPath(rel) {
  var raw = ($('tLayPath').value || '').trim().replace(/^"|"$/g, '').replace(/\//g, '\\'); if (!raw) return '';
  var unc = /^\\\\/.test(raw), base = raw.replace(/\\+/g, '\\').replace(/\\$/, '');      // tidy doubled slashes, keep the leading \\ of a network path
  if (unc) base = '\\' + base;
  var parts = String(rel).split('/'); if (TS.lay && parts[0] === TS.lay.name) parts.shift();
  return base + '\\' + parts.join('\\');
}
function excelUri(p) { var u = p.replace(/\\/g, '/'); u = /^\/\//.test(u) ? 'file:' + u : 'file:///' + u; return 'ms-excel:ofe|u|' + encodeURI(u).replace(/#/g, '%23'); }   // \\server\share -> file://server/share ; Z:\ -> file:///Z:/
function copyText(s) {
  var old = function () { var ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } finally { ta.remove(); } };
  if (navigator.clipboard && navigator.clipboard.writeText) return Promise.race([navigator.clipboard.writeText(s).catch(old), new Promise(function (r) { setTimeout(function () { old(); r(); }, 700); })]);
  old(); return Promise.resolve();
}
// latest proposal per key + latest decision per key
function techRows() {
  var rows = {}, last = {}, today = isoToday();
  var latestFor = {};                                                        // latest proposal per machine group: older proposals are replaced, not added
  TS.props.forEach(function (p) { (p.groups || []).forEach(function (g) { if (!latestFor[g] || String(p.at) > String(latestFor[g].at)) latestFor[g] = p; }); });
  TS.props.forEach(function (p) { (p.rows || []).forEach(function (r) { var L = latestFor[r.group]; if (!L || L === p) rows[r.key + '@' + r.load] = Object.assign({}, r); }); });
  TS.reviews.slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).forEach(function (r) { last[r.key] = r; });
  var list = Object.keys(rows).map(function (k) {
    var x = rows[k], r = last[x.key]; x.review = r || null; x.flags = []; x.ruleDays = (x.days || []).length;   // decision key = line|from|to|group (no date)
    if (!r) { var listed = x.same || (tIsShared(x.from, x.to) ? 'list' : null); if (listed && !x.same) x.same = listed; x.status = listed ? 'AUTO_SKIP' : 'PENDING'; x.eff = listed ? 0 : x.prep; }
    else {
      if (r.loadDate && r.loadDate !== x.load) x.flags.push('dateMoved');
      if (r.qtyB != null && r.qtyB !== x.qtyB) { x.status = 'PENDING'; x.eff = x.prep; x.flags.push('qtyChanged'); }
      else if (r.decision === 'REMOVE') { x.status = 'REMOVED'; x.eff = 0; }
      else if (r.decision === 'ADJUST') { x.status = 'ADJUSTED'; x.eff = +r.qty || 0; }
      else { x.status = 'KEPT'; x.eff = r.qtyBActual != null ? Math.ceil(x.ratio * r.qtyBActual - 1e-9) : x.prep; if (r.qtyBActual != null) x.flags.push('layoutQty'); }
      if (r.loadDateActual || r.prepDays) {                                     // IE Tech's loading date / number of prep days move the prep days
        var L = Date.parse((r.loadDateActual || x.load) + 'T00:00:00Z');
        x.days = prepDaysBefore(L, r.prepDays || (x.days || []).length).map(function (d) { return new Date(d).toISOString().slice(0, 10); });
        if (r.loadDateActual && r.loadDateActual !== x.load) { x.loadActual = r.loadDateActual; x.flags.push('dateSet'); }
        if (r.prepDays) x.flags.push('daysSet');
      }
    }
    x.overdue = x.status === 'PENDING' && (x.days || [])[0] <= today;
    return x;
  });
  applyEndsToRows(list, latestEnds(TS.ends), true);                           // end date of the running style moves the next loading date
  list.forEach(function (x) { x.overdue = x.status === 'PENDING' && (x.days || [])[0] <= today; });
  return list;
}
function myLines() { var s = $('tLines').value.split(/[,;\s]+/).map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean); return s.length ? s : null; }
function lineOk(l) { var ml = myLines(); if (!ml) return true; var L = String(l).toUpperCase(); return ml.some(function (p) { return L.indexOf(p) === 0; }); }
function latestGrid(g) {
  var ps = TS.props.filter(function (p) { return p.grid && p.grid[g]; }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  if (!ps.length) return null;
  var G = ps[0].grid[g], sun = function (d) { return new Date(typeof d === 'number' ? d : d + 'T00:00:00Z').getUTCDay() === 0; };
  return Object.assign({}, G, { days: (G.days || []).filter(function (d) { return !sun(d); }) });      // no Sundays (also in proposals sent before this version)
}
function noticeStatus(n) { var r = TS.res.concat(PS.noticeRes || []).filter(function (x) { return x.id === n.id; }).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).pop(); return r || null; }
function puSort(p) { return !p || p === '?' ? 1 : 0; }
function puName(p) { return !p || p === '?' ? t('noPu') : p; }
var d2 = function (iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; };
var dw = function (iso) { return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(iso + 'T00:00:00Z').getUTCDay()] + ' ' + d2(iso); };
// PU choices come from the data (PU LIST / proposals), so a new or split PU appears without a code change
function fillTechPus() {
  var pus = [], seen = {}, saved = []; try { saved = JSON.parse(localStorage.getItem('mdb_pus') || '[]'); } catch (e) { }
  saved.concat(TS.rows.map(function (x) { return x.pu; })).forEach(function (p) { if (p && p !== '?' && !seen[p]) { seen[p] = 1; pus.push(p); } });
  pus.sort(function (a, b) { return a.replace(/(\d+)/g, function (m) { return ('000000' + m).slice(-6); }).localeCompare(b.replace(/(\d+)/g, function (m) { return ('000000' + m).slice(-6); })); });
  var cur = $('tPU').value, sig = pus.join('|');
  if (sig === TS.puSig) return; TS.puSig = sig;
  $('tPU').innerHTML = '<option value="">—</option>' + pus.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('');
  $('tPU').value = pus.indexOf(cur) >= 0 ? cur : '';
}
function techRender() {
  if (ROLE !== 'tech') return;
  fillTechPus();
  $('tLines').placeholder = t('tLinesPh');
  if (!TS.dir) { $('tConn').textContent = ''; $('tGrid').innerHTML = '<div class="empty">' + esc(t('prNeedConn')) + '</div>'; $('tKpis').innerHTML = ''; $('tNotices').innerHTML = ''; return; }
  TS.rows = techRows();
  $('tConn').textContent = '✓ ' + t('tConnected', [TS.rows.length, TS.reviews.length]); $('tConn').className = 'st-ok small';
  var pu = $('tPU').value;
  var groups = {}; TS.props.forEach(function (p) { (p.groups || []).forEach(function (g) { groups[g] = 1; }); });
  var gl = Object.keys(groups).sort(), want = $('tGroup').value || tLoad('mdb_tgroup') || gl[0] || '';
  if (gl.indexOf(want) < 0) want = gl[0] || '';
  $('tGroup').innerHTML = gl.map(function (g) { return '<option' + (g === want ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('');
  var g = $('tGroup').value;
  $('tGroupChips').innerHTML = gl.map(function (x) {
    var n = TS.rows.filter(function (r) { return r.group === x && r.status === 'PENDING' && (!pu || r.pu === pu) && lineOk(r.line); }).length;
    return '<button data-tg="' + esc(x) + '" class="' + (x === g ? 'on' : '') + '">' + esc(x) + (n ? '<span class="cnt">' + n + '</span>' : '') + '</button>';
  }).join('');
  [].forEach.call($('tGroupChips').querySelectorAll('[data-tg]'), function (b) { b.onclick = function () { $('tGroup').value = b.dataset.tg; tSave('mdb_tgroup', b.dataset.tg); techRender(); }; });
  var mine = TS.rows.filter(function (x) { return x.group === g && (!pu || x.pu === pu) && lineOk(x.line); });
  var cnt = function (s) { return mine.filter(function (x) { return x.status === s; }).length; };
  $('tKpis').innerHTML = [['v-review', cnt('PENDING'), 'prKPend'], ['v-missing', mine.filter(function (x) { return x.overdue; }).length, 'prKOver'], ['v-same', cnt('KEPT'), 'prKKept'], ['v-checked', cnt('ADJUSTED'), 'prKAdj'], ['', cnt('REMOVED'), 'prKRem']]
    .map(function (k) { return '<button class="' + k[0] + '" disabled style="opacity:1;cursor:default"><b>' + k[1] + '</b>' + esc(t(k[2])) + '</button>'; }).join('');
  var G = latestGrid(g);
  if (!G) { $('tGrid').innerHTML = '<div class="empty">' + esc(t('tNoProposal')) + '</div>'; renderMyNotices(); return; }
  var days = G.days, allRows = TS.rows.filter(function (x) { return x.group === g; });
  var ms = function (d) { return Date.parse(d + 'T00:00:00Z'); }, iso = function (d) { return new Date(d).toISOString().slice(0, 10); }, dms = days.map(ms);
  G = Object.assign({}, G, { lines: {} }); var G0 = latestGrid(g);
  Object.keys(G0.lines).forEach(function (l) { var st = {}; Object.keys(G0.lines[l].styles).forEach(function (s) { st[s] = Object.assign({}, G0.lines[l].styles[s]); }); G.lines[l] = Object.assign({}, G0.lines[l], { styles: st }); });
  allRows.forEach(function (x) { if (x.loadActual && G.lines[x.line]) shiftProduction(G.lines[x.line].styles, x, ms(x.load), ms(x.loadActual), dms, iso); });
  var TE = latestEnds(TS.ends), runInfo = {};
  Object.keys(G0.lines).forEach(function (l) {                              // running style of each line (from the unadjusted plan), its planned and effective end
    var run = runningStyle(G0.lines[l].styles, days); if (!run) return;
    var pe = runEnd(G0.lines[l].styles, run, days), e = TE[l + '|' + run];
    runInfo[l] = { style: run, plan: pe, eff: e && e.endDate ? e.endDate : pe, edited: !!(e && e.endDate && e.endDate !== pe) };
    if (e && e.endDate) adjustRunningEnd(G.lines[l].styles, run, ms(e.endDate), days, ms);
  });
  var endTag = function (l, s) {
    var r = runInfo[l]; if (!r || r.style !== s || !r.eff) return '';
    return ' <span class="muted small">' + esc(t('eEnd', [d2(r.eff)])) + '</span>' + (r.edited ? ' <span class="tag t-info">' + esc(d2(r.plan)) + '→' + esc(d2(r.eff)) + '</span>' : '') +
      '<button class="qa" data-te="' + esc(l) + '" title="' + esc(t('eBtn')) + '">✎</button>';
  };
  var stCls = { PENDING: 't-warn', KEPT: 't-ok', ADJUSTED: 't-info', REMOVED: 't-bad', AUTO_SKIP: 't-ok' };
  var h = '<div class="tw" style="max-height:62vh"><table class="pg"><tr><th class="l s1">' + t('pgPU') + '</th><th class="l s2">' + t('pgLine') + '</th><th class="l s3">' + t('pgStyle') + '</th>' + days.map(function (d) { return '<th>' + dw(d) + '</th>'; }).join('') + '</tr>';
  var lines = Object.keys(G.lines).filter(function (l) { return (!pu || G.lines[l].pu === pu) && lineOk(l) && (!$('tOnlyPrep').checked || mine.some(function (x) { return x.line === l; })); })
    .sort(function (a, b) { return puSort(G.lines[a].pu) - puSort(G.lines[b].pu) || G.lines[a].pu.localeCompare(G.lines[b].pu) || a.localeCompare(b); });
  var lastPu = null;
  lines.forEach(function (l) {
    var L = G.lines[l], preps = mine.filter(function (x) { return x.line === l; });
    if (L.pu !== lastPu) { h += '<tr class="pu"><td class="l s1">' + esc(puName(L.pu)) + '</td><td class="s2"></td><td class="s3"></td><td colspan="' + days.length + '"></td></tr>'; lastPu = L.pu; }
    var first = function (s) { var k = Object.keys(L.styles[s] || {}).sort()[0]; return k || '9'; };
    var styles = Object.keys(L.styles).sort(function (a, b) { return first(a).localeCompare(first(b)); });
    preps.forEach(function (x) { if (styles.indexOf(x.to) < 0) styles.push(x.to); });
    if (runInfo[l] && styles.indexOf(runInfo[l].style) < 0) styles.unshift(runInfo[l].style);        // keep the running style row (to reset its end date)
    var shown = false;
    styles.forEach(function (s) {
      preps.filter(function (x) { return x.to === s; }).forEach(function (x) {
        var skip = x.status === 'REMOVED' || x.status === 'AUTO_SKIP';
        h += '<tr class="prow" data-k="' + esc(x.key) + '"><td class="s1"></td><td class="l s2">' + (shown ? '' : '<b>' + esc(l) + '</b>') + '</td><td class="l s3" style="color:var(--warn)">↳ ' + esc(t('pgPrepOf', [s]).replace('↳ ', '')) +
          ' <span class="muted small">' + esc(t('prLoad', [d2(x.loadActual || x.load)])) + '</span>' +
          ' <span class="tag ' + stCls[x.status] + '">' + esc(t('ps_' + x.status)) + (x.status === 'ADJUSTED' || (x.status === 'KEPT' && x.eff !== x.prep) ? ' ' + x.prep + '→' + x.eff : '') + '</span>' +
          (x.flags.indexOf('dateSet') >= 0 || x.flags.indexOf('endSet') >= 0 ? ' <span class="tag t-info">' + esc(d2(x.load)) + '→' + esc(d2(x.loadActual)) + '</span>' : '') + (x.overdue ? ' <span class="tag t-bad">' + esc(t('prOVERDUE')) + '</span>' : '') +
          '<button class="qa" data-qe="' + esc(x.key) + '" title="' + esc(t('dOpenEdit')) + '">✎</button><button class="qa" data-qk="' + esc(x.key) + '" title="' + esc(t('prKeep')) + '">✔</button><button class="qa" data-qr="' + esc(x.key) + '" title="' + esc(t('prRemove')) + '">✖</button></td>' +
          days.map(function (d) { return (x.days || []).indexOf(d) < 0 ? '<td></td>' : (skip ? '<td class="sk">' + x.prep + '</td>' : '<td class="pr">' + x.eff + '</td>'); }).join('') + '</tr>';
        shown = true;
      });
      if (!L.styles[s] && !(runInfo[l] && runInfo[l].style === s)) return;
      var Ls = L.styles[s] || {};
      h += '<tr><td class="s1"></td><td class="l s2">' + (shown ? '' : '<b>' + esc(l) + '</b>') + '</td><td class="l s3">' + esc(s) + endTag(l, s) + '</td>' + days.map(function (d) { return '<td>' + (Ls[d] || '') + '</td>'; }).join('') + '</tr>';
      shown = true;
    });
  });
  // totals per PU (all lines of the group), then total, available and balance
  var pus = {}; Object.keys(G.lines).forEach(function (l) { pus[G.lines[l].pu] = 1; });
  var prod = {}, prep = {}, totP = {}, totR = {};
  Object.keys(G.lines).forEach(function (l) { var L = G.lines[l]; Object.keys(L.styles).forEach(function (s) { Object.keys(L.styles[s]).forEach(function (d) { var k = L.pu + '|' + d; prod[k] = (prod[k] || 0) + L.styles[s][d]; totP[d] = (totP[d] || 0) + L.styles[s][d]; }); }); });
  allRows.forEach(function (x) { if (!x.eff) return; (x.days || []).forEach(function (d) { var k = x.pu + '|' + d; prep[k] = (prep[k] || 0) + x.eff; totR[d] = (totR[d] || 0) + x.eff; }); });
  var trow = function (label, f, cls, neg) { return '<tr class="' + cls + '"><td class="s1"></td><td class="s2"></td><td class="l s3">' + esc(label) + '</td>' + days.map(function (d) { var v = f(d); return '<td class="' + (neg && v != null && v < 0 ? 'neg' : '') + '">' + (v == null ? '' : v) + '</td>'; }).join('') + '</tr>'; };
  Object.keys(pus).sort(function (a, b) { return puSort(a) - puSort(b) || a.localeCompare(b); }).forEach(function (p) {
    h += trow(t('pgPuSum', [puName(p), t('pgProd')]), function (d) { return prod[p + '|' + d] || 0; }, 'pusum') + trow(t('pgPuSum', [puName(p), t('pgPrep')]), function (d) { return prep[p + '|' + d] || 0; }, 'pusum') +
      trow(t('pgPuSum', [puName(p), t('pgTotal')]), function (d) { return (prod[p + '|' + d] || 0) + (prep[p + '|' + d] || 0); }, 'tot');
  });
  h += trow(t('pgTotal'), function (d) { return (totP[d] || 0) + (totR[d] || 0); }, 'tot') + trow(t('pgAvail'), function () { return G.avail; }, 'tot');
  (G.parts || []).forEach(function (p) { h += trow((p.sign > 0 ? '+ ' : '− ') + p.name, function () { return p.sign * p.qty; }, 'part'); });
  h += trow(t('pgBal'), function (d) { return G.avail == null ? null : G.avail - (totP[d] || 0) - (totR[d] || 0); }, 'tot', true) + '</table></div>';
  var tw0 = $('tGrid').querySelector('.tw'), gk = g + '|' + pu + '|' + $('tLines').value, keep = TS.gridKey === gk && !!tw0;
  var sT = keep ? tw0.scrollTop : 0, sL = keep ? tw0.scrollLeft : 0, pY = window.scrollY, pX = window.scrollX;     // approving a row must not throw the user back to the top
  $('tGrid').innerHTML = h; TS.gridKey = gk;
  var tw1 = $('tGrid').querySelector('.tw'); if (tw1) { tw1.scrollTop = sT; tw1.scrollLeft = sL; }
  if (keep) window.scrollTo(pX, pY);
  [].forEach.call($('tGrid').querySelectorAll('[data-te]'), function (b) { b.onclick = function (e) { e.stopPropagation(); techSetEnd(b.dataset.te); }; });
  [].forEach.call($('tGrid').querySelectorAll('tr.prow'), function (tr) { tr.onclick = function () { openDrawer(tr.dataset.k); }; });
  var one = function (k) { return TS.rows.filter(function (x) { return x.key === k; })[0]; };
  [].forEach.call($('tGrid').querySelectorAll('[data-qe]'), function (b) { b.onclick = function (e) { e.stopPropagation(); openDrawer(b.dataset.qe); }; });
  [].forEach.call($('tGrid').querySelectorAll('[data-qk],[data-qr]'), function (b) {
    b.onclick = function (e) { e.stopPropagation(); var x = one(b.dataset.qk || b.dataset.qr); writeReview(x, b.dataset.qk ? { decision: x.review && x.review.decision === 'ADJUST' ? 'ADJUST' : 'KEEP' } : { decision: 'REMOVE', reason: '' }).then(techRender).catch(function (er) { alert(er.message); }); };
  });
  renderMyNotices(); renderComplete();
}
// ---------- IE Tech: complete the review for the current scope ----------
function scopeRows() { var pu = $('tPU').value; return TS.rows.filter(function (x) { return (!pu || x.pu === pu) && lineOk(x.line); }); }
function renderComplete() {
  if (!TS.dir) { $('tDoneInfo').textContent = ''; return; }
  var rows = scopeRows(), pend = rows.filter(function (x) { return x.status === 'PENDING'; }).length, me = $('tName').value.trim();
  var mine = (TS.done || []).filter(function (c) { return c.by === me && c.pu === $('tPU').value && c.lines === $('tLines').value.trim(); }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); })[0];
  $('tDoneInfo').innerHTML = esc(t('tDoneScope', [rows.length, pend])) + (mine ? ' · <span class="st-ok">' + esc(t('tDoneLast', [String(mine.at).slice(0, 16).replace('T', ' ')])) + '</span>' : '');
}
$('tComplete').onclick = async function () {
  try {
    var me = $('tName').value.trim(); if (!TS.dir || !me) throw new Error(t('prNeedConn'));
    var rows = scopeRows(), pend = rows.filter(function (x) { return x.status === 'PENDING'; });
    if (pend.length && !window.confirm(t('tDoneWarn', [pend.length, Object.keys(pend.reduce(function (a, x) { a[x.line] = 1; return a; }, {})).length]))) return;
    var groups = {}; rows.forEach(function (x) { var g = groups[x.group] = groups[x.group] || { group: x.group, rows: 0, pending: 0, kept: 0, adjusted: 0, removed: 0 }; g.rows++;
      g[{ PENDING: 'pending', KEPT: 'kept', ADJUSTED: 'adjusted', REMOVED: 'removed', AUTO_SKIP: 'removed' }[x.status]]++; });
    var rec = { by: me, at: new Date().toISOString(), pu: $('tPU').value, lines: $('tLines').value.trim(), groups: Object.keys(groups).map(function (k) { return groups[k]; }),
      pending: pend.length, pendingLines: Object.keys(pend.reduce(function (a, x) { a[x.line] = 1; return a; }, {})).sort() };
    await tWrite(TS.dir, 'prep/complete', tStamp() + '_' + me.replace(/[^\w\-]+/g, '_') + '.json', rec); (TS.done = TS.done || []).push(rec);
    renderComplete(); alert(t('tDoneSaved'));
  } catch (e) { alert(e.message); }
};
function renderMyNotices() {
  var me = $('tName').value.trim(), mine = TS.notices.filter(function (n) { return n.by === me; }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  $('tNotices').innerHTML = '<tr><th class="l">' + t('nThStyle') + '</th><th>' + t('nThLine') + '</th><th>' + t('nThGroup') + '</th><th>' + t('nThDb') + '</th><th>' + t('nThLay') + '</th><th class="l">' + t('nThSt') + '</th></tr>' +
    (mine.length ? mine.map(function (n) { var r = noticeStatus(n); return '<tr><td>' + esc(n.style) + '</td><td>' + esc(n.line) + '</td><td>' + esc(n.group) + '</td><td>' + n.dbQty + '</td><td><b>' + n.layoutQty + '</b></td><td>' +
      (r ? '<span class="tag ' + (r.action === 'FIXED' ? 't-ok' : 't-bad') + '">' + esc(t(r.action === 'FIXED' ? 'nFixed' : 'nRejected')) + '</span> <span class="muted small">' + esc(r.by) + (r.note ? ': ' + esc(r.note) : '') + '</span>' : '<span class="tag t-warn">' + esc(t('nWaiting')) + '</span>') + '</td></tr>'; }).join('') : '<tr><td class="empty" colspan="6">—</td></tr>');
}
// one decision record; fields not given are kept from the previous decision
// IE Tech edits the end date of the style running on a line (empty = back to the plan)
function techSetEnd(line) {
  var me = $('tName').value.trim(); if (!TS.dir || !me) { alert(t('prNeedConn')); return; }
  var g = $('tGroup').value, G0 = latestGrid(g), L = G0 && G0.lines[line]; if (!L) return;
  var days = G0.days, run = runningStyle(L.styles, days); if (!run) return;
  var plan = runEnd(L.styles, run, days), e = latestEnds(TS.ends)[line + '|' + run], cur = e && e.endDate ? e.endDate : plan;
  var fmt = function (iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; };
  var a = window.prompt(t('eAsk', [run, line, fmt(plan)]), fmt(cur)); if (a === null) return;
  var s = a.trim(), iso = '';
  if (s) {
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/); if (!m) { alert(t('prBadDate')); return; }
    var y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +plan.slice(0, 4);
    iso = y + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0'); if (isNaN(Date.parse(iso))) { alert(t('prBadDate')); return; }
  }
  if (iso === plan) iso = '';
  var rec = { line: line, style: run, endDate: iso, planEnd: plan, by: me, at: new Date().toISOString() };
  tWrite(TS.dir, 'prep/lineends', tStamp() + '_' + me.replace(/[^\w\-]+/g, '_') + '.json', rec).then(function () { (TS.ends = TS.ends || []).push(rec); techRender(); }).catch(function (er) { alert(er.message); });
}
async function writeReview(x, patch) {
  var me = $('tName').value.trim(); if (!TS.dir || !me) throw new Error(t('prNeedConn'));
  var p = x.review || {};
  var rec = Object.assign({ key: x.key, decision: 'KEEP', qty: p.qty != null ? p.qty : null, qtyBActual: p.qtyBActual != null ? p.qtyBActual : null, loadDateActual: p.loadDateActual || null, prepDays: p.prepDays || null,
    reason: '', by: me, role: 'Tech', at: new Date().toISOString(), loadDate: x.load, qtyB: x.qtyB, proposedQty: x.prep, line: x.line, group: x.group, to: x.to }, patch);
  await tWrite(TS.dir, 'prep/reviews', tStamp() + '_' + me.replace(/[^\w\-]+/g, '_') + '.json', rec); TS.reviews.push(rec);
  if (rec.qtyBActual != null && rec.qtyBActual !== x.qtyB) await techNotify(x, rec.qtyBActual);
  return rec;
}
async function techNotify(x, lq) {
  var me = $('tName').value.trim();
  if (TS.notices.some(function (n) { return n.style === x.to && n.group === x.group && n.layoutQty === lq && !noticeStatus(n); })) return;
  var n = { id: tStamp(), style: x.to, group: x.group, line: x.line, pu: x.pu, dbQty: x.qtyB, layoutQty: lq, note: '', by: me, at: new Date().toISOString() };
  await tWrite(TS.dir, 'prep/notices', n.id + '_' + me.replace(/[^\w\-]+/g, '_') + '.json', n); TS.notices.push(n);
}
// side panel for one prep row
function openDrawer(key) {
  var x = TS.rows.filter(function (r) { return r.key === key; })[0]; if (!x) return; TS.cur = x;
  $('dTitle').textContent = x.line + ' · ' + x.group;
  $('dInfo').textContent = t('dInfoTxt', [x.line, x.from || t('prEmpty'), x.to, d2(x.loadActual || x.load), x.group, x.qtyB, Math.round(x.ratio * 100), x.prep]);
  $('dQty').value = x.eff; $('dQty').dataset.touched = ''; $('dLay').value = x.review && x.review.qtyBActual != null ? x.review.qtyBActual : ''; $('dLay').placeholder = x.qtyB;
  $('dDate').value = x.loadActual || x.load; $('dDays').value = (x.days || []).length; $('dLayView').innerHTML = ''; $('dLayMsg').textContent = ''; $('dLayQ').value = '';
  $('tDrawer').hidden = false; renderLaySug();
}
$('dClose').onclick = function () { $('tDrawer').hidden = true; };
// prep follows the layout quantity until IE Tech types her own prep number
$('dQty').oninput = function () { $('dQty').dataset.touched = '1'; };
$('dLay').oninput = function () {
  var x = TS.cur, v = $('dLay').value; if ($('dQty').dataset.touched) return;
  $('dQty').value = v === '' || +v === x.qtyB ? x.prep : Math.ceil(x.ratio * Math.max(0, Math.round(+v)) - 1e-9);
};
function drawerSave(patch) { var x = TS.cur; writeReview(x, patch).then(function () { $('tDrawer').hidden = true; techRender(); }).catch(function (e) { alert(e.message); }); }
$('dKeep').onclick = function () {
  var x = TS.cur, lay0 = $('dLay').value, autoL = lay0 !== '' && +lay0 !== x.qtyB ? Math.ceil(x.ratio * Math.max(0, Math.round(+lay0)) - 1e-9) : x.prep;
  var q = $('dQty').value === '' || !$('dQty').dataset.touched ? autoL : Math.max(0, Math.round(+$('dQty').value)), lay = $('dLay').value === '' ? null : Math.max(0, Math.round(+$('dLay').value)), dt = $('dDate').value;
  var layAct = lay != null && lay !== x.qtyB ? lay : null, autoQ = layAct != null ? Math.ceil(x.ratio * layAct - 1e-9) : x.prep;
  var nd = Math.max(1, Math.min(30, Math.round(+$('dDays').value || x.ruleDays)));
  drawerSave({ decision: q !== autoQ ? 'ADJUST' : 'KEEP', qty: q !== autoQ ? q : null, qtyBActual: layAct, loadDateActual: dt && dt !== x.load ? dt : null, prepDays: nd !== x.ruleDays ? nd : null, reason: '' });
};
$('dRemove').onclick = function () { drawerSave({ decision: 'REMOVE', reason: '' }); };
$('dSame').onclick = function () {
  var x = TS.cur, me = $('tName').value.trim();
  writeReview(x, { decision: 'REMOVE', reason: t('prR1') }).then(async function () {
    if (x.from) for (const A of x.from.split(' + ')) {                // remember the pair; every machine group and line with it is skipped from now on
      const rec = { styles: [A, x.to], by: me, at: new Date().toISOString() };
      await tWrite(TS.dir, 'prep/shared', tStamp() + '.json', rec); (TS.shared = TS.shared || []).push(rec);
    }
    $('tDrawer').hidden = true; techRender();
    if (x.from) alert(t('prSameAdded', [x.from, x.to]));
  }).catch(function (e) { alert(e.message); });
};
// open the layout: machine table preview + download to open in Excel
$('dOpenLay').onclick = function () { previewFiles((TS.cur && TS.cur.files) || []); };
// layout viewer like Layout Check: sheets with a machine table to tick, machines of the ticked sheets, compared with the database
async function previewFiles(files) {
  var x = TS.cur, GM = {}; TS.lastPreview = files; TS.prevSel = TS.prevSel || {}; TS.prevData = TS.prevData || {};
  TS.props.slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).forEach(function (p) { if (p.groupMap) GM = p.groupMap; });
  var GG = REF.groups && Object.keys(REF.groups).length ? REF.groups : GM, grp = function (c) { return GG[c] || c; };
  if (!files.length) { $('dLayMsg').textContent = t('dNoFile'); return; }
  if (!TS.lay) { $('dLayMsg').textContent = t('dNeedLay'); return; }
  var html = '', base = baseKey(x.to);
  for (var i = 0; i < files.length; i++) {
    var path = files[i], P = TS.prevData[path];
    if (!P) {
      var parts = path.split('/'), d = TS.lay, fh = null;
      if (parts[0] === TS.lay.name) parts.shift();
      try { for (var j = 0; j < parts.length - 1; j++) d = await d.getDirectoryHandle(parts[j]); fh = await d.getFileHandle(parts[parts.length - 1]); }
      catch (e) { html += '<div class="st-bad small">' + esc(t('dNotFound', [path])) + '</div>'; continue; }
      var file = await fh.getFile(), buf = await file.arrayBuffer(), res = extractWorkbook(XLSX.read(new Uint8Array(buf), { type: 'array' }));
      var units = res.units.filter(function (u) { return u.rows.length; }).map(function (u, k) {
        var set = {}; u.rows.forEach(function (r) { set[r[0]] = (set[r[0]] || 0) + r[1]; });
        return { i: k, label: u.sheet + (res.mode === 'mm' ? ' · ' + u.section : ''), set: set, names: expandStyles(u.styleText).some(function (s2) { return baseKey(s2) === base; }) };
      });
      P = TS.prevData[path] = { name: file.name, mtime: file.lastModified, type: res.type, obd: res.obd, mode: res.mode, units: units, url: URL.createObjectURL(new Blob([buf])) };
      if (!TS.prevSel[path]) {                                   // default ticks as Layout Check: all Man-Machine blocks, else the sheet naming the style, else the first sheet
        var named = units.filter(function (u) { return u.names; });
        TS.prevSel[path] = res.mode === 'mm' ? units.map(function (u) { return u.i; }) : [(named[0] || units[0] || { i: -1 }).i];
      }
    }
    var sel = TS.prevSel[path], tick = P.units.filter(function (u) { return sel.indexOf(u.i) >= 0; }), tot = {};
    tick.forEach(function (u) { Object.keys(u.set).forEach(function (c) { tot[c] = (tot[c] || 0) + u.set[c]; }); });
    var codes = {}; P.units.forEach(function (u) { Object.keys(u.set).forEach(function (c) { codes[c] = 1; }); });
    var shown = Object.keys(codes).filter(function (c) { return TS.layAll || grp(c) === x.group; }).sort(function (a, b) { return grp(a).localeCompare(grp(b)) || a.localeCompare(b); });
    var gTot = Object.keys(tot).filter(function (c) { return grp(c) === x.group; }).reduce(function (s2, c) { return s2 + tot[c]; }, 0);
    var wp = winPath(path), sum = function (u) { return Object.keys(u.set).reduce(function (s2, c) { return s2 + u.set[c]; }, 0); };
    html += '<div class="vcard" style="margin-bottom:8px"><b>' + esc(P.name) + '</b> <span class="muted small">' + esc([P.type, P.obd ? 'OBD ' + P.obd : '', t('modShort', [new Date(P.mtime).toLocaleString()])].filter(Boolean).join(' · ')) + '</span>' +
      '<div class="sheets" style="margin:6px 0">' + P.units.map(function (u) {
        var gq = Object.keys(u.set).filter(function (c) { return grp(c) === x.group; }).reduce(function (s2, c) { return s2 + u.set[c]; }, 0);
        return '<label class="' + (u.names ? 'mt' : '') + '"><input type="checkbox" data-ps="' + esc(path) + '|' + u.i + '"' + (sel.indexOf(u.i) >= 0 ? ' checked' : '') + '> ' + esc(u.label) +
          ' <span class="muted">(' + esc(t('dSheetCnt', [sum(u), x.group, gq])) + ')</span></label>';
      }).join('') + '</div>' +
      '<div class="tw"><table><tr><th class="l">' + t('nThGroup') + '</th><th class="l">M/C</th>' + tick.map(function (u) { return '<th>' + esc(u.label) + '</th>'; }).join('') + '<th>' + t('dTotSel') + '</th></tr>' +
      (shown.length ? shown.map(function (c) {
        return '<tr' + (grp(c) === x.group ? ' style="background:var(--warnbg)"' : '') + '><td>' + esc(GG[c] || '') + '</td><td><b>' + esc(c) + '</b></td>' +
          tick.map(function (u) { return '<td>' + (u.set[c] || '') + '</td>'; }).join('') + '<td><b>' + (tot[c] || '') + '</b></td></tr>';
      }).join('') : '<tr><td colspan="' + (3 + tick.length) + '" class="muted">' + esc(t('dNoGroup', [x.group])) + '</td></tr>') + '</table></div>' +
      '<div class="row" style="margin-top:6px"><b>' + esc(t('dGrpSel', [x.group, gTot, x.qtyB])) + '</b>' +
      (tick.length && gTot !== x.qtyB ? ' <button class="primary" data-uselq="' + gTot + '">' + esc(t('dUseLay', [gTot])) + '</button>' : (tick.length ? ' <span class="st-ok small">' + esc(t('dSameDb')) + '</span>' : '')) + '</div>' +
      '<div class="row small" style="margin-top:4px">' + (wp ? '<a href="' + esc(excelUri(wp)) + '">' + esc(t('dOpenXl')) + '</a> <button data-cp="' + esc(wp) + '">' + esc(t('dCopyPath')) + '</button>' : '') +
      ' <a download="' + esc(P.name) + '" href="' + P.url + '">' + esc(t('dDownCopy')) + '</a></div></div>';
  }
  $('dLayView').innerHTML = html + '<label class="small"><input type="checkbox" id="dLayAll"' + (TS.layAll ? ' checked' : '') + '> ' + esc(t('dLayAll')) + '</label>';
  $('dLayAll').onchange = function (e) { TS.layAll = e.target.checked; previewFiles(TS.lastPreview || []); };
  [].forEach.call($('dLayView').querySelectorAll('[data-ps]'), function (c) {
    c.onchange = function () {
      var p = c.dataset.ps.split('|'), k = +p.pop(), path = p.join('|'), s2 = TS.prevSel[path] || [];
      TS.prevSel[path] = c.checked ? s2.concat([k]) : s2.filter(function (v) { return v !== k; }); previewFiles(TS.lastPreview || []);
    };
  });
  [].forEach.call($('dLayView').querySelectorAll('[data-uselq]'), function (b) { b.onclick = function () { $('dLay').value = b.dataset.uselq; $('dLay').dispatchEvent(new Event('input')); $('dLay').focus(); }; });
  [].forEach.call($('dLayView').querySelectorAll('[data-cp]'), function (b) { b.onclick = function () { copyText(b.dataset.cp).then(function () { b.textContent = t('dCopied'); }); }; });
}
// ---------- layout finder (same idea as Layout Check): file list of the layout folder, cached 8 h ----------
function alnum(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function suggestLayoutFiles(index, style, q) {
  if (q && alnum(q)) { var qq = alnum(q); return index.filter(function (f) { return alnum(f.name).indexOf(qq) >= 0; }).slice(0, 40).map(function (f) { return Object.assign({ score: 0 }, f); }); }
  var full = alnum(style), base = alnum(String(style).split('(')[0]), art = alnum(String(style).split('-').slice(0, 2).join('-'));
  return index.map(function (f) { var n = alnum(f.name); return Object.assign({ score: n.indexOf(full) >= 0 ? 3 : (base.length >= 8 && n.indexOf(base) >= 0) ? 2 : (art.length >= 6 && n.indexOf(art) >= 0) ? 1 : 0 }, f); })
    .filter(function (f) { return f.score; }).sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); }).slice(0, 15);
}
async function buildLayIndex(force) {
  if (!TS.lay) return;
  if (!force) {
    var c = await KV.get('tlayidx');
    if (c && c.root === TS.lay.name && Date.now() - Date.parse(c.at) < 8 * 3600e3) { TS.layIdx = c.items; TS.layIdxAt = c.at; renderLaySug(); return; }
  }
  var out = [], n = 0;
  async function walk(dir, path, depth) {
    if (depth > 10) return;
    try {
      for await (var e of dir.values()) {
        if (e.kind === 'directory') await walk(e, path + e.name + '/', depth + 1);
        else if (/\.xls[xmb]?$/i.test(e.name) && e.name.indexOf('~$') !== 0) { out.push({ name: e.name, path: path + e.name }); if (++n % 200 === 0) $('dLayIdx').textContent = t('dLayScanning', [n]); }
      }
    } catch (er) { }
  }
  $('dLayIdx').textContent = t('dLayScanning', [0]);
  await walk(TS.lay, '', 0);
  TS.layIdx = out; TS.layIdxAt = new Date().toISOString();
  await KV.set('tlayidx', { root: TS.lay.name, at: TS.layIdxAt, items: out });
  renderLaySug();
}
function renderLaySug() {
  var x = TS.cur; if (!x || $('tDrawer').hidden) return;
  $('dLayQ').placeholder = t('dLayQ');
  if (!TS.lay) { $('dLayIdx').textContent = ''; $('dLaySug').innerHTML = '<div class="muted small">' + esc(t('dNeedLay')) + '</div>'; return; }
  if (TS.layIdx) $('dLayIdx').textContent = t('dLayIdx', [TS.layIdx.length, String(TS.layIdxAt || '').slice(0, 16).replace('T', ' ')]);
  var q = $('dLayQ').value.trim(), list = suggestLayoutFiles(TS.layIdx || [], x.to, q), seen = {};
  if (!q) (x.files || []).forEach(function (p) { var nm = p.split('/').pop(); list.unshift({ name: nm, path: p, score: 4 }); });
  list = list.filter(function (f) { var k = f.name.toUpperCase(); if (seen[k]) return false; seen[k] = 1; return true; });
  $('dLaySug').innerHTML = list.length ? list.map(function (f, i) {
    var cls = { 4: 't-ok', 3: 't-ok', 2: 't-info', 1: 't-warn', 0: '' }[f.score];
    return '<button data-li="' + i + '"><span class="nm">' + esc(f.name) + '<span class="pth">' + esc(f.path.split('/').slice(0, -1).join(' / ')) + '</span></span><span class="tag ' + cls + '">' + esc(t('sc' + f.score)) + '</span></button>';
  }).join('') : '<div class="muted small">' + esc(t('dLayNone')) + '</div>';
  [].forEach.call($('dLaySug').querySelectorAll('[data-li]'), function (b) { b.onclick = function () { previewFiles([list[+b.dataset.li].path]); }; });
}
var _lq = null; $('dLayQ').oninput = function () { clearTimeout(_lq); _lq = setTimeout(renderLaySug, 250); };
$('dLayRescan').onclick = function () { buildLayIndex(true).catch(function (e) { $('dLayMsg').textContent = e.message; }); };

// ---------- Consolidator: notices from IE Tech ----------
var _prepLoadLc = window.prepLoadLc;
window.prepLoadLc = async function (root) {
  await _prepLoadLc(root);
  PS.ends = await pReadDir(root, 'prep/lineends'); PS.notices = await pReadDir(root, 'prep/notices'); PS.noticeRes = await pReadDir(root, 'prep/noticeres'); PS.done = await pReadDir(root, 'prep/complete');
  renderNotices();
};
function dbGroupQty(style, group) {
  if (!REF.db) return null;
  var e = REF.db.byKey[skey(style)];
  if (!e) { var b = baseKey(style), k = Object.keys(REF.db.byKey).filter(function (x) { return baseKey(x) === b; }); e = k.length === 1 ? REF.db.byKey[k[0]] : null; }
  if (!e) return null;
  var s = 0; Object.keys(e.set).forEach(function (c) { if ((REF.groups[c] || c) === group || c === group) s += e.set[c]; }); return s;
}
function renderNotices() {
  if (!LCDIR) { $('noticeCard').hidden = true; return; }
  $('noticeCard').hidden = false; $('noticeEmpty').hidden = true;
  var st = $('nSt').value, all = (PS.notices || []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  var resOf = function (n) { return (PS.noticeRes || []).filter(function (r) { return r.id === n.id; }).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).pop(); };
  var list = all.filter(function (n) { return st === '' || !resOf(n); });
  $('nCount').textContent = all.filter(function (n) { return !resOf(n); }).length; if (window.paintTabs) paintTabs();
  $('nTable').innerHTML = '<tr><th class="l">' + t('nThStyle') + '</th><th>' + t('nThLine') + '</th><th>' + t('nThGroup') + '</th><th>' + t('nThDb') + '</th><th>' + t('nThLay') + '</th><th>' + t('nThNow') + '</th><th class="l">' + t('nThBy') + '</th><th class="l">' + t('nThNote') + '</th><th class="l">' + t('nThSt') + '</th><th></th></tr>' +
    (list.length ? list.map(function (n) {
      var r = resOf(n), now = dbGroupQty(n.style, n.group), match = now != null && now === n.layoutQty;
      return '<tr><td><b>' + esc(n.style) + '</b></td><td>' + esc(n.line) + '</td><td>' + esc(n.group) + '</td><td>' + n.dbQty + '</td><td><b>' + n.layoutQty + '</b></td><td class="' + (match ? 'st-ok' : '') + '">' + (now == null ? '—' : now) + '</td>' +
        '<td>' + esc(n.by) + ' <span class="muted small">' + esc(String(n.at).slice(0, 16).replace('T', ' ')) + '</span></td><td>' + esc(n.note || '') + '</td><td>' +
        (r ? '<span class="tag ' + (r.action === 'FIXED' ? 't-ok' : 't-bad') + '">' + esc(t(r.action === 'FIXED' ? 'nFixed' : 'nRejected')) + '</span> <span class="muted small">' + esc(r.by) + (r.note ? ': ' + esc(r.note) : '') + '</span>'
          : (match ? '<span class="tag t-ok">' + esc(t('nMatch')) + '</span>' : '<span class="tag t-warn">' + esc(t('nWaiting')) + '</span>')) + '</td>' +
        '<td style="white-space:nowrap">' + (r ? '' : '<button data-nf="' + esc(n.id) + '">' + esc(t('nFixed')) + '</button> <button data-nr="' + esc(n.id) + '">' + esc(t('nRejected')) + '</button>') + '</td></tr>';
    }).join('') : '<tr><td class="empty" colspan="10">—</td></tr>');
  [].forEach.call($('nTable').querySelectorAll('[data-nf],[data-nr]'), function (b) {
    b.onclick = async function () {
      var fixed = !!b.dataset.nf, id = b.dataset.nf || b.dataset.nr, note = window.prompt(t(fixed ? 'nAskFixed' : 'nAskReject'), '');
      if (note === null || (!fixed && note.trim().length < 3)) return;
      var me = $('uName').value.trim() || 'IE Báo cáo máy', rec = { id: id, action: fixed ? 'FIXED' : 'REJECTED', note: note.trim(), by: me, at: new Date().toISOString() };
      await tWrite(LCDIR, 'prep/noticeres', tStamp() + '.json', rec); PS.noticeRes.push(rec); renderNotices();
    };
  });
}
$('nSt').onchange = renderNotices;
window.techRender = techRender; window.renderNotices = renderNotices;

