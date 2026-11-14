// ===================== APP =====================
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
var REF = { groups: null, db: null, plan: null, costing: {} }, PREV = {}, FILES = [], DONE = [], RV = null, cancel = false;
var LC = null, LCDIR = null;
var SLOT = { sMc: null, sPlan: null, sPrev: null, sCk: null, sDir: null, sLc: null }, UNKNOWN = [], PROG = null, SAVED = null;
var VIEW = 'review', CHIP = 'all', PENDING = 0;

function readWb(file, opts) { return file.arrayBuffer().then(function (b) { return XLSX.read(new Uint8Array(b), Object.assign({ type: 'array', cellDates: true }, opts || {})); }); }
function slot(id, key, args, cls) { SLOT[id] = { key: key, args: args || [], cls: cls }; renderSlots(); ready(); }
function renderSlots() {
  Object.keys(SLOT).forEach(function (id) {
    var s = SLOT[id], el = $(id);
    if (!s) { el.className = 'st-wait'; el.textContent = t('notLoaded'); return; }
    el.className = 'st-' + (s.cls || 'ok'); el.textContent = (s.cls === 'ok' ? '✓ ' : '') + t(s.key, s.args);
  });
  $('sUnknown').textContent = UNKNOWN.map(function (n) { return t('unknownFile', [n]); }).join(' · ');
}
function ready() {
  var ok = REF.db && REF.plan && FILES.length && !PENDING;
  $('go').disabled = !ok;
  if (!PROG) $('pt').textContent = ok ? '' : t('needInputs');
}

// ---- 1. inputs: files are recognised by their sheets ----
$('fFiles').onchange = function (e) { UNKNOWN = []; [].slice.call(e.target.files).forEach(processExcel); };
function processExcel(f) {
  {
    PENDING++; ready();
    readWb(f, { bookSheets: true }).then(function (w) {
      var n = w.SheetNames;
      if (n.indexOf('SCAN STATE') >= 0) {
        return readWb(f, { sheets: ['SCAN STATE', 'LAYOUT DATA'] }).then(function (wb) {
          PREV = loadIndex(wb); slot('sPrev', 'prevInfo', [Object.keys(PREV).length], 'ok');
        });
      }
      if (n.indexOf('ScanState') >= 0 && n.indexOf('Data') >= 0) {
        return readWb(f, { sheets: ['Data'] }).then(function (wb) { REF.ck = loadCheckMc(sheetAoa(wb.Sheets['Data'], 18)); slot('sCk', 'ckInfo', [REF.ck.n], 'ok'); });
      }
      if (n.indexOf('MACHINE GROUP') >= 0) {
        slot('sMc', 'reading', [], 'wait');
        return readWb(f, { sheets: ['MACHINE DATABASE', 'MACHINE GROUP', 'COSTING PROPOSAL', 'MACHINE BY LINE', 'MC STATUS', 'PU LIST'] }).then(function (wb) {
          if (!wb.Sheets['MACHINE DATABASE'] || !wb.Sheets['MACHINE GROUP']) return slot('sMc', 'mcMissing', [], 'bad');
          REF.groups = loadGroups(sheetAoa(wb.Sheets['MACHINE GROUP'], 1));
          REF.db = loadDb(sheetAoa(wb.Sheets['MACHINE DATABASE'], 15));
          var hasC = !!wb.Sheets['COSTING PROPOSAL'];
          REF.costing = hasC ? loadCosting(sheetAoa(wb.Sheets['COSTING PROPOSAL'], 10)) : {};
          REF.mbl = wb.Sheets['MACHINE BY LINE'] ? loadMbl(sheetAoa(wb.Sheets['MACHINE BY LINE'], 5)) : null;
          REF.avail = wb.Sheets['MC STATUS'] ? loadAvail(sheetAoa(wb.Sheets['MC STATUS'], 20), REF.groups, wb.Sheets['MC STATUS']) : {};
          REF.pu = wb.Sheets['PU LIST'] ? loadPuList(sheetAoa(wb.Sheets['PU LIST'], 2)) : {};
          try { localStorage.setItem('mdb_pus', JSON.stringify([...new Set(Object.values(REF.pu || {}).filter(Boolean))])); } catch (e) { }
          SLOT.sMc = { key: 'mcInfo', args: [Object.keys(REF.db.byKey).length, Object.keys(REF.groups).length, hasC ? t('costingN', [Object.keys(REF.costing).length]) : t('noCosting')], cls: hasC ? 'ok' : 'bad' };
          renderSlots(); ready();
        });
      }
      if (n.indexOf('MasterPlan-Full') >= 0) {
        slot('sPlan', 'reading', [], 'wait');
        return readWb(f, { sheets: ['MasterPlan-Full'] }).then(function (wb) {
          REF.planRows = sheetAoa(wb.Sheets['MasterPlan-Full'], 5); REF.plan = loadPlan(REF.planRows); REF.planFile = f.name; REF.planAt = new Date(); REF.demand = null;
          slot('sPlan', 'planInfo', [Object.keys(REF.plan.names).length], 'ok');
        });
      }
      UNKNOWN.push(f.name); renderSlots();
    }).catch(function (err) { UNKNOWN.push(f.name + ' (' + err.message + ')'); renderSlots(); })
      .then(function () { PENDING--; ready(); });
  }
}
$('fDir').onchange = function (e) {
  FILES = [].slice.call(e.target.files).filter(function (f) {
    var p = (f.webkitRelativePath || f.name).toLowerCase();
    return /\.xls[xmb]?$/i.test(f.name) && f.name.indexOf('~$') !== 0 && !CFG.skipFolders.some(function (w) { return p.indexOf(w) >= 0; });
  });
  slot('sDir', 'dirInfo', [FILES.length], FILES.length ? 'ok' : 'bad');
};
async function filesFromDir(dir) {
  var out = [], n = 0, skip = function (p) { p = '/' + p.toLowerCase() + '/'; return CFG.skipFolders.some(function (w) { return p.indexOf(w.indexOf('/') < 0 ? '/' + w + '/' : w) >= 0; }); };
  async function walk(d, path, depth) {
    for await (var e of d.values()) {
      if (e.kind === 'directory') { if (depth < 12 && !skip(path + e.name)) await walk(e, path + e.name + '/', depth + 1); continue; }
      if (!/\.xls[xmb]?$/i.test(e.name) || e.name.indexOf('~$') === 0) continue;
      var f = await e.getFile();
      out.push({ name: f.name, size: f.size, lastModified: f.lastModified, webkitRelativePath: dir.name + '/' + path + e.name, arrayBuffer: f.arrayBuffer.bind(f) });
      if (++n % 100 === 0) slot('sDir', 'dirListing', [n], 'wait');
    }
  }
  await walk(dir, '', 0); return out;
}
async function useLayoutDir(d) { slot('sDir', 'dirListing', [0], 'wait'); PENDING++; ready(); try { FILES = await filesFromDir(d); slot('sDir', 'dirInfo', [FILES.length], FILES.length ? 'ok' : 'bad'); } finally { PENDING--; ready(); } }
async function useMcHandle(h) { var f = await h.getFile(); UNKNOWN = []; processExcel(f); }
$('bMc').onclick = async function () {
  try { var h = (await window.showOpenFilePicker({ id: 'mcreport', types: [{ description: 'Excel', accept: { 'application/vnd.ms-excel': ['.xlsx', '.xlsm', '.xlsb'] } }] }))[0]; await KV.set('cmc', h); await useMcHandle(h); paintRemember(); }
  catch (e) { if (e.name !== 'AbortError') slot('sMc', 'lcErr', [e.message], 'bad'); }
};
$('bDir').onclick = async function () {
  try { var d = await window.showDirectoryPicker({ id: 'layroot', mode: 'read' }); await KV.set('cdir', d); await useLayoutDir(d); paintRemember(); }
  catch (e) { if (e.name !== 'AbortError') slot('sDir', 'lcErr', [e.message], 'bad'); }
};
// remembered connections: MC Report, the other Excel files (plan, last week, CheckMc), layout folder, Layout Check data folder
// They reconnect by themselves when the browser still allows it; otherwise the first click on the page (or the button) asks once.
var XL_TYPES = [{ description: 'Excel', accept: { 'application/vnd.ms-excel': ['.xlsx', '.xlsm', '.xlsb'] } }];
async function useFileHandle(h) { var f = await h.getFile(); processExcel(f); }
$('bFiles').onclick = async function () {
  if (!window.showOpenFilePicker) { $('fFiles').click(); return; }
  try {
    var hs = await window.showOpenFilePicker({ id: 'xlfiles', multiple: true, types: XL_TYPES });
    var cur = (await KV.get('cfiles')) || [], have = {}; hs.forEach(function (h) { have[h.name] = 1; });
    await KV.set('cfiles', cur.filter(function (h) { return !have[h.name]; }).concat(hs));       // newest picks last: they win when two plans are stored
    UNKNOWN = []; for (var i = 0; i < hs.length; i++) await useFileHandle(hs[i]);
    paintRemember();
  } catch (e) { if (e.name !== 'AbortError') slot('sPlan', 'lcErr', [e.message], 'bad'); }
};
async function paintRemember() {
  var h = { mc: await KV.get('cmc'), files: (await KV.get('cfiles')) || [], dir: await KV.get('cdir'), lc: await KV.get('cdata') }, names = [];
  if (h.mc) names.push(t('inMc') + ': ' + h.mc.name); if (h.files.length) names.push(t('remFiles') + ': ' + h.files.map(function (x) { return x.name; }).join(', '));
  if (h.dir) names.push(t('inDir') + ': ' + h.dir.name); if (h.lc) names.push(t('lcTitle') + ': ' + h.lc.name);
  $('remBar').hidden = !names.length; $('remList').textContent = names.join(' · ');
}
var RECON = false, RECON_ARMED = false;
async function reconnect(ask) {
  if (RECON) return; RECON = true;
  var steps = [['cmc', 'read', useMcHandle], ['cfiles', 'read', useFileHandle], ['cdir', 'read', useLayoutDir], ['cdata', 'readwrite', function (d) { return connectLc(d); }]], miss = [], done = 0, mcName = '';
  try {
    for (var i = 0; i < steps.length; i++) {
      var v = await KV.get(steps[i][0]); if (!v) continue;
      var list = Array.isArray(v) ? v : [v], keep = [];
      if (steps[i][0] === 'cmc') mcName = v.name;
      UNKNOWN = steps[i][0] === 'cfiles' ? [] : UNKNOWN;
      for (var j = 0; j < list.length; j++) {
        var h = list[j]; if (steps[i][0] === 'cfiles' && h.name === mcName) { keep.push(h); continue; }
        try {
          var p = await h.queryPermission({ mode: steps[i][1] });
          if (p !== 'granted' && ask) p = await h.requestPermission({ mode: steps[i][1] });
          if (p !== 'granted') { miss.push(h.name); keep.push(h); continue; }
          await steps[i][2](h); keep.push(h); done++;
        } catch (e) { if (!(steps[i][0] === 'cfiles' && e && e.name === 'NotFoundError')) keep.push(h); miss.push(h.name); }       // a moved/deleted file is forgotten
      }
      if (Array.isArray(v) && keep.length !== v.length) await KV.set(steps[i][0], keep);
    }
  } finally { RECON = false; }
  $('remMsg').textContent = miss.length ? (ask ? t('remAgain', [miss.join(', ')]) : '') : (done ? t('remOk') : '');
  if (miss.length && !ask && !RECON_ARMED) {                                         // ask once on the first click (a permission prompt needs a click)
    RECON_ARMED = true;
    document.addEventListener('pointerdown', function onFirst(ev) {
      if (ev.target.closest && ev.target.closest('.pick,#bReconnect,#bMc,#bDir,#bLc,#bFiles,#tConnect,#tLayConnect,#sConnect,input,select,textarea')) return;
      document.removeEventListener('pointerdown', onFirst, true); RECON_ARMED = false; reconnect(true);
    }, true);
  }
  if (window.quietRole) await quietRole();
  paintRemember();
}
$('bReconnect').onclick = function () { reconnect(true); };
// ---- Layout Check data folder (read + write) ----
function readJsonFiles(dir) {
  var out = [];
  return (async function () {
    for await (var entry of dir.values()) {
      if (entry.kind !== 'file' || !/\.json$/i.test(entry.name)) continue;
      try { out.push(JSON.parse(await (await entry.getFile()).text())); } catch (e) { }
    }
    return out;
  })();
}
// ---------- "keep current data" confirmations (data\\machinedb\\keeps.json, or this browser when the data folder is not connected) ----------
var KEEPS = {}, KEEPMSG = '';
async function loadKeeps(d) {
  KEEPS = {};
  try {
    if (d) { var md = await d.getDirectoryHandle('machinedb'); KEEPS = JSON.parse(await (await (await md.getFileHandle('keeps.json')).getFile()).text()).items || {}; }
    else { var s = localStorage.getItem('mdb_keeps'); if (s) KEEPS = JSON.parse(s).items || {}; }
  } catch (e) { }
}
async function persistKeeps() {
  var txt = JSON.stringify({ version: 1, items: KEEPS });
  if (LCDIR) { var md = await LCDIR.getDirectoryHandle('machinedb', { create: true }), fh = await md.getFileHandle('keeps.json', { create: true }), w = await fh.createWritable(); await w.write(txt); await w.close(); return 'data'; }
  localStorage.setItem('mdb_keeps', txt); return 'local';
}
function pendingKeeps() { return RV ? RV.items.filter(function (it) { var o = it.opts[it.sel]; return it.bucket === 'review' && it.apply && o.type === 'keep' && it.current; }) : []; }
async function confirmKeeps() {
  var list = pendingKeeps(); if (!list.length) return null;
  var user = $('uName').value.trim(), now = new Date(), before = {};
  list.forEach(function (it) { before[it.key] = KEEPS[it.key]; KEEPS[it.key] = keepRecord(it, user, now); });
  var where; try { where = await persistKeeps(); } catch (e) { list.forEach(function (it) { if (before[it.key]) KEEPS[it.key] = before[it.key]; else delete KEEPS[it.key]; }); alert(t('keepErr', [e.message])); return null; }
  list.forEach(function (it) { it.bucketBefore = it.bucket; it.bucket = 'kept'; it.keptRec = KEEPS[it.key]; it.apply = false; });
  return { n: list.length, where: where };
}
$('bLc').onclick = async function () {
  if (!window.showDirectoryPicker) { slot('sLc', 'lcNoApi', [], 'bad'); return; }
  try {
    var d = await window.showDirectoryPicker({ id: 'lcdata', mode: 'readwrite' }); await KV.set('cdata', d); await connectLc(d); paintRemember();
  } catch (e) { if (e.name !== 'AbortError') slot('sLc', 'lcErr', [e.message], 'bad'); }
};
async function connectLc(d) {
  try {
    PENDING++; slot('sLc', 'reading', [], 'wait');
    var sub = async function (n) { try { return await d.getDirectoryHandle(n); } catch (e) { return null; } };
    var vd = await sub('validations'), ad = await sub('variations'), pd = await sub('approvals');
    var vals = vd ? await readJsonFiles(vd) : [], acts = ad ? await readJsonFiles(ad) : [], apprs = pd ? await readJsonFiles(pd) : [];
    var actsFlat = []; acts.forEach(function (a) { (a.keys && a.keys.length ? [a] : [a]).forEach(function (x) { actsFlat.push(x); }); });
    var lines = [];
    try { var lf = await (await d.getFileHandle('Linemapping.xlsx')).getFile(); var lw = await readWb(lf); lines = sheetAoa(lw.Sheets[lw.SheetNames[0]], 3); } catch (e) { }
    LC = loadLayoutCheck(vals, actsFlat, lines, apprs); LCDIR = d; await loadKeeps(d);
    if (window.prepLoadLc) await prepLoadLc(d);
    try {
      var md = await d.getDirectoryHandle('machinedb'), js = JSON.parse(await (await (await md.getFileHandle('scanstate.json')).getFile()).text());
      PREV = loadScanStateJson(js); SLOT.sPrev = { key: 'prevLc', args: [Object.keys(PREV).length, fmtDate(new Date(js.savedAt))], cls: 'ok' };
    } catch (e) { }
    slot('sLc', 'lcInfo', [LC.nVals, LC.nStyles, LC.nActs], 'ok');
  } catch (e) { if (e.name !== 'AbortError') slot('sLc', 'lcErr', [e.message], 'bad'); }
  finally { if (PENDING) PENDING--; ready(); }
};
try { $('uName').value = localStorage.getItem('lcName') || localStorage.getItem('mdb_name') || ''; } catch (e) { }
$('uName').oninput = function () { try { localStorage.setItem('mdb_name', $('uName').value.trim()); } catch (e) { } };
$('nw').value = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1));

// ---- 2. scan, then costing for gaps ----
$('go').onclick = function () {
  cancel = false; SAVED = null; $('go').disabled = true; $('stop').disabled = false; $('step3').hidden = true; $('savebar').hidden = true;
  var t0 = performance.now(), src = $('xlsxlib').textContent + '\n;\n' + $('coresrc').textContent + '\n;\n' + $('wsrc').textContent;
  var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  var n = Math.max(1, Math.min(8, +$('nw').value || 1)), next = 0, done = 0, active = n, recs = new Array(FILES.length), reused = 0;
  var today = new Date(); today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  PROG = { done: 0, total: FILES.length, sec: 0, reused: 0 };
  function rec(i) { var f = FILES[i]; return { path: f.webkitRelativePath || f.name, name: f.name, size: f.size, mtime: f.lastModified, notes: [] }; }
  function tick() { PROG = { done: done, total: FILES.length, sec: (performance.now() - t0) / 1000, reused: reused }; renderProg(); }
  function make() {
    var w = new Worker(url);
    w.onmessage = function (e) {
      var r = e.data, x = rec(r.id), p = PREV[x.path];
      x.hash = r.hash; x.ms = r.ms;
      if (r.reused) { Object.assign(x, { mode: p.mode, type: p.type, obd: p.obd, status: p.status, units: p.units, bad: [], reused: true, content: p.content }); reused++; }
      else Object.assign(x, { mode: r.mode, type: r.type, obd: r.obd, status: r.status, notes: r.notes || [], units: r.units, bad: r.bad, content: r.content });
      if (!p) { x.change = 'Added'; x.workDate = today; }
      else if (x.status === 'OK' && p.content && p.content !== x.content) { x.change = 'Changed'; x.oldContent = p.content; x.workDate = today; }
      else { x.change = 'Unchanged'; x.workDate = p.workDate || today; x.oldContent = p.content || ''; if (!r.reused && p.hash && p.hash !== x.hash) x.notes.push(['resaved']); }
      recs[r.id] = x; done++; tick(); w.cur = null; feed(w);
    };
    w.onerror = function (ev) {
      ev.preventDefault(); if (w.cur == null) return;
      var x = rec(w.cur); x.status = 'Failed'; x.notes = [['readErr', ev.message || '']]; x.units = []; recs[w.cur] = x; done++; tick();
      w.terminate(); feed(make());
    };
    return w;
  }
  function feed(w) {
    if (cancel || next >= FILES.length) { w.terminate(); if (--active === 0) finish(); return; }
    var i = next++, f = FILES[i], p = PREV[f.webkitRelativePath || f.name];
    f.arrayBuffer().then(function (buf) { w.cur = i; w.postMessage({ id: i, buf: buf, knownHash: p && p.status !== 'Failed' ? p.hash : '' }, [buf]); })
      .catch(function (err) { var x = rec(i); x.status = 'Failed'; x.notes = [['readErr', err.message]]; x.units = []; recs[i] = x; done++; tick(); feed(w); });
  }
  for (var k = 0; k < n; k++) feed(make());
  function finish() {
    URL.revokeObjectURL(url);
    DONE = recs.filter(Boolean); PROG.end = cancel ? 'cancelled' : 'done'; renderProg();
    $('stop').disabled = true; $('go').disabled = false;
    RV = buildReview(DONE, REF); applyLayoutCheck(RV, LC, DONE);
    var staleKeeps = applyKeeps(RV, KEEPS);                                  // layout or database changed since the confirmation: clear it (the style is listed again)
    if (staleKeeps.length) { staleKeeps.forEach(function (k) { delete KEEPS[k]; }); persistKeeps().catch(function () { }); }
    if (REF.ck) compareCheckMc(DONE, REF.ck, RV.issues);
    VIEW = 'review'; CHIP = 'all'; $('step3').hidden = false; renderAll(); if (window.setTabMain) setTabMain('db');
  }
};
$('stop').onclick = function () { cancel = true; $('stop').disabled = true; };
function renderProg() {
  if (!PROG) return;
  $('pb').style.width = (PROG.total ? PROG.done / PROG.total * 100 : 0) + '%';
  var s = t('progress', [PROG.done, PROG.total, PROG.sec.toFixed(1)]);
  if (PROG.reused) s += ' · ' + t('skipped', [PROG.reused]);
  if (PROG.end) s += ' · ' + t(PROG.end);
  $('pt').textContent = s;
}

// ---- 3. review ----
function lineText(l) { return l.length ? esc(l.slice(0, 3).join(', ')) + (l.length > 3 ? ' +' + (l.length - 3) : '') : ''; }
function loadCell(x) { return x.first ? esc(fmtDate(x.first)) + '<br><small>' + lineText(x.lines) + '</small>' : '<small>' + t('notInPlan') + '</small>'; }
function chipsMc(set, cur) {
  if (!set) return '';
  var keys = Object.keys(set).concat(cur ? Object.keys(cur).filter(function (k) { return !(k in set); }) : []).sort(), h = [];
  keys.forEach(function (k) {
    var a = cur ? cur[k] : undefined, b = set[k], f = function (x) { return +(+x).toFixed(2); };
    if (b === undefined) h.push('<span class="mc del">' + esc(k + ' ' + f(a)) + '</span>');
    else if (!cur || a === undefined) h.push('<span class="mc ' + (cur ? 'add' : 'add') + '">' + (cur ? '+' : '') + esc(k + ' ' + f(b)) + '</span>');
    else if (Math.abs(a - b) > 1e-9) h.push('<span class="mc chg">' + esc(k + ' ' + f(a) + '→' + f(b)) + '</span>');
    else h.push('<span class="mc same">' + esc(k + ' ' + f(b)) + '</span>');
  });
  return h.join('');
}
function fmtDT(ms) { if (!ms) return '?'; var d = new Date(ms), p = function (x) { return String(x).padStart(2, '0'); }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
// sheets of the chosen layout file with a machine table: tick to include (summed)
function sheetTicks(i, o) {
  if (o.type !== 'layout' || !o.units || !o.units.length) return '';
  return '<div class="sheets">' + o.units.map(function (u) {
    var n = Object.keys(u.set).reduce(function (a, m) { return a + u.set[m]; }, 0);
    return '<label class="' + (u.mention ? 'mt' : '') + '"><input type="checkbox" data-ut="' + i + '|' + u.i + '"' + (o.ticks.indexOf(u.i) >= 0 ? ' checked' : '') + '> ' + esc(u.label) + ' <span class="muted">(' + t('nMc', [n]) + ')</span></label>';
  }).join('') + '</div>';
}
function optLabel(it, o) {
  if (o.type === 'layout') return (o.blocked ? t('blockedOpt') + ' ' : '') + [o.file.name, o.file.type || '', o.file.obd ? 'OBD ' + o.file.obd : '', t('modShort', [fmtDT(o.file.mtime)])].filter(Boolean).join(' · ');
  if (o.type === 'costing') return (o.blocked ? t('blockedOpt') + ' ' : '') + t('optCosting', [o.factor || '']) + (o.ied ? ' · IED ' + fmtDate(o.ied) : '');
  return it.current ? t('optKeep', [it.currentRemark || '-']) : t('optNone');
}
function reviewRows() {
  var q = $('q').value.trim().toUpperCase();
  return RV.items.filter(function (it) {
    if (it.bucket !== VIEW) return false;
    if (VIEW === 'review' && CHIP !== 'all' && !(CHIP === 'conflict' ? it.conflict : CHIP === 'lc' ? it.fromLc : it.kind0 === CHIP)) return false;
    if (!q) return true;
    var o = it.opts[it.sel];
    return (it.name + ' ' + (o.file ? o.file.path : '') + ' ' + it.lines.join(' ')).toUpperCase().indexOf(q) >= 0;
  });
}
function renderViews() {
  var c = { review: 0, same: 0, checked: 0, kept: 0 }; RV.items.forEach(function (it) { c[it.bucket]++; });
  var V = [['review', 'vReview', c.review], ['missing', 'vMissing', RV.missing.length], ['issues', 'vIssues', RV.issues.length], ['same', 'vSame', c.same]];
  if (c.kept) V.push(['kept', 'vKept', c.kept]);
  if (LC) V.push(['checked', 'vChecked', c.checked]);
  V.push(['files', 'vFiles', DONE.length]);
  $('views').innerHTML = V.map(function (v) { return '<button class="v-' + v[0] + (VIEW === v[0] ? ' on' : '') + '" data-v="' + v[0] + '"><b>' + v[2] + '</b>' + esc(t(v[1])) + '</button>'; }).join('');
  $('vhint').textContent = t({ review: 'vReviewHint', same: LC ? 'vSameHintLc' : 'vSameHint', checked: 'vCheckedHint', kept: 'vKeptHint', missing: 'vMissingHint', issues: 'vIssuesHint', files: 'vFilesHint' }[VIEW]);
  var chips = '';
  if (VIEW === 'review') {
    var kc = {}, nc = 0; RV.items.forEach(function (it) { if (it.bucket === 'review') { kc[it.kind0] = (kc[it.kind0] || 0) + 1; if (it.conflict) nc++; } });
    var nLc = RV.items.filter(function (it) { return it.bucket === 'review' && it.fromLc; }).length;
    var list = [['all', t('all'), c.review]].concat(nLc ? [['lc', t('k_lc'), nLc]] : []).concat(['new', 'changed', 'upgrade', 'costing', 'manual', 'hold'].filter(function (k) { return kc[k]; }).map(function (k) { return [k, t('k_' + k), kc[k]]; }));
    if (nc) list.push(['conflict', t('conflict').split('—')[0].trim(), nc]);
    chips = list.map(function (x) { return '<button class="' + (CHIP === x[0] ? 'on' : '') + '" data-c="' + x[0] + '">' + esc(x[1]) + ' ' + x[2] + '</button>'; }).join('');
  }
  $('chips').innerHTML = chips;
  $('bAll').hidden = !(VIEW === 'review' || VIEW === 'issues' || (VIEW === 'same' && LC)); $('bNone').hidden = $('bAll').hidden;
  $('bAll').textContent = VIEW === 'issues' ? t('fixAll') : (VIEW === 'same' ? t('confirmAll') : t('approveAll')); $('bNone').textContent = t('clearAll');
}
function renderTable() {
  var q = $('q').value.trim().toUpperCase(), h = '', lim = 600, total = 0;
  if (VIEW === 'review' || VIEW === 'same' || VIEW === 'checked') {
    var rows = reviewRows(), tick = VIEW === 'review' || (VIEW === 'same' && LC); total = rows.length;
    h = '<tr>' + (tick ? '<th>' + (VIEW === 'same' ? esc(t('colConfirm')) : '✓') + '</th>' : '') + '<th>' + t('colStyle') + '</th><th>' + t('colLoad') + '</th><th>' + t('colSource') + '</th><th>' + t('colMc') + '</th><th>' + t('colNote') + '</th></tr>';
    h += rows.slice(0, lim).map(function (it) {
      var i = RV.items.indexOf(it), o = it.opts[it.sel], kind = itemKind(it), dis = o.blocked || (o.type === 'keep' && !it.current);
      var sel = '<select data-s="' + i + '" aria-label="' + esc(t('colSource')) + '">' + it.opts.map(function (x, j) { return '<option value="' + j + '"' + (j === it.sel ? ' selected' : '') + '>' + esc(optLabel(it, x)) + '</option>'; }).join('') + '</select>';
      var sub = o.file ? '<br><small>' + esc(o.file.path) + ' · ' + esc(t('modShort', [fmtDT(o.file.mtime)])) + '</small>' + sheetTicks(i, o) : '';
      var box = VIEW === 'review' ? '<td><input type="checkbox" data-a="' + i + '"' + (it.apply && !dis ? ' checked' : '') + (dis ? ' disabled' : '') + (o.type === 'keep' && !dis ? ' title="' + esc(t('keepTip')) + '"' : '') + '></td>'
        : (VIEW === 'same' && LC ? '<td><input type="checkbox" data-k="' + i + '"' + (it.confirm ? ' checked' : '') + (o.type !== 'layout' ? ' disabled' : '') + '></td>' : '');
      return '<tr class="' + (o.blocked ? 'blk' : '') + '">' + box +
        '<td><b>' + esc(it.name) + '</b><div><span class="b k-' + kind + '">' + esc(t('k_' + kind)) + '</span>' + (it.conflict ? '<span class="b k-conflict">' + esc(t('conflict')) + '</span>' : '') + '</div></td>' +
        '<td>' + loadCell(it) + '</td><td>' + sel + sub + '</td><td>' + chipsMc(o.type === 'keep' ? it.current : o.set, o.type === 'keep' ? null : it.current) + '</td>' +
        '<td><small>' + esc(notesText(it.notes.concat(o.notes))) + '</small></td></tr>';
    }).join('');
  } else if (VIEW === 'kept') {
    var kr = reviewRows(); total = kr.length;
    h = '<tr><th>' + t('colStyle') + '</th><th>' + t('colLoad') + '</th><th>' + t('colKeptBy') + '</th><th>' + t('colMc') + '</th><th></th></tr>' + kr.slice(0, lim).map(function (it) {
      var r = it.keptRec || {};
      return '<tr><td><b>' + esc(it.name) + '</b></td><td>' + loadCell(it) + '</td><td>' + esc(r.by || '-') + '<br><small>' + esc(r.at ? fmtDT(new Date(r.at)) : '') + '</small></td><td>' + chipsMc(it.current, null) + '</td>' +
        '<td><button data-ku="' + RV.items.indexOf(it) + '">' + esc(t('keepUndo')) + '</button></td></tr>';
    }).join('');
  } else if (VIEW === 'missing') {
    var m = RV.missing.filter(function (x) { return !q || (x.name + ' ' + x.lines.join(' ')).toUpperCase().indexOf(q) >= 0; }); total = m.length;
    h = '<tr><th>' + t('colStyle') + '</th><th>' + t('colLoad') + '</th><th>' + t('colReason') + '</th><th>' + t('colAction') + '</th></tr>' + m.slice(0, lim).map(function (x) {
      return '<tr><td><b>' + esc(x.name) + '</b></td><td>' + loadCell(x) + '</td><td>' + esc(noteText(x.reason)) + '</td><td>' + esc(t(x.action)) + '</td></tr>';
    }).join('');
  } else if (VIEW === 'issues') {
    var order = ['fileConflict', 'dup', 'oldVer', 'unknownCode', 'variant', 'ckDiff', 'noStyle', 'badQty', 'readFail'];
    var is = RV.issues.filter(function (x) { return !q || (x.item + ' ' + x.args.join(' ')).toUpperCase().indexOf(q) >= 0; }); total = is.length;
    h = '<tr><th>' + t('colFix') + '</th><th>' + t('colItem') + '</th><th>' + t('colDetail') + '</th><th>' + t('colAction') + '</th></tr>';
    var shown = 0;
    order.forEach(function (ty) {
      var g = is.filter(function (x) { return x.type === ty; }); if (!g.length || shown >= lim) return;
      h += '<tr class="grp"><td colspan="4">' + esc(t('i_' + ty)) + ' (' + g.length + ')</td></tr>';
      g.slice(0, lim - shown).forEach(function (x) {
        var i = RV.issues.indexOf(x); shown++;
        h += '<tr><td>' + (x.fix ? '<input type="checkbox" data-f="' + i + '"' + (x.apply ? ' checked' : '') + '>' : '') + '</td><td>' + esc(x.item) + '</td><td>' + esc(x.args.join(' ')) + '</td><td>' + esc(t('a_' + x.type)) + '</td></tr>';
      });
    });
  } else {
    var fs = DONE.filter(function (f) { return !q || f.path.toUpperCase().indexOf(q) >= 0; }); total = fs.length;
    h = '<tr><th>' + t('colFile') + '</th><th>' + t('colResult') + '</th><th>' + t('colChange') + '</th>' + (REF.ck ? '<th>' + t('colCk') + '</th>' : '') + '<th>' + t('colLayout') + '</th><th>OBD</th><th>' + t('colStyles') + '</th><th>' + t('colNote') + '</th></tr>' + fs.slice(0, lim).map(function (f) {
      var st = []; (f.units || []).forEach(function (u) { expandStyles(u.styleText).forEach(function (s) { if (st.indexOf(s) < 0) st.push(s); }); });
      if (!st.length) st = expandStyles(f.name);
      return '<tr><td>' + esc(f.path) + '</td><td class="' + (f.status === 'OK' ? 'st-ok' : 'st-bad') + '">' + esc(t('r_' + f.status)) + '</td><td>' + esc(t('c_' + f.change)) + '</td>' + (REF.ck ? '<td class="' + (f.ck === 'diff' ? 'st-bad' : '') + '">' + esc(f.ck ? t('ck_' + f.ck) : '') + '</td>' : '') + '<td>' + esc(f.type) + '</td><td>' + esc(f.obd || '') + '</td><td>' + esc(st.join(', ')) + '</td><td><small>' + esc(notesText(f.notes)) + '</small></td></tr>';
    }).join('');
  }
  $('tbl').innerHTML = total ? h : '<tr><td class="empty">—</td></tr>';
  $('note').textContent = total > lim ? t('showing', [lim, total]) : t('rows', [total]);
}
function renderSave() {
  if (!RV) return;
  var n = RV.items.filter(function (it) { var o = it.opts[it.sel]; return it.apply && o.type !== 'keep' && !o.blocked; }).length;
  var f = RV.issues.filter(function (x) { return x.fix && x.apply; }).length;
  var nk = pendingKeeps().length; $('keepBtn').hidden = !nk; $('keepBtn').textContent = t('keepBtn', [nk]); $('keepBtn').title = t('keepTip');
  $('smsg').innerHTML = SAVED ? '<b class="st-ok">' + esc(t('saved', SAVED)) + '</b> ' + (SAVED[3] ? esc(SAVED[3]) + ' ' : '') + (SAVED.k ? esc(SAVED.k) + ' ' : '') + esc(t('nextSteps')) : '<b>' + esc(t('selected', [n])) + '</b>' + (f ? ' · ' + esc(t('fixes', [f])) : '') + (nk ? ' · ' + esc(t('keepsSel', [nk])) : '') + (KEEPMSG ? ' · <b class="st-ok">' + esc(KEEPMSG) + '</b>' : '');
}
function renderAll() {
  document.documentElement.lang = LANG;
  [].forEach.call(document.querySelectorAll('[data-t]'), function (el) { el.textContent = t(el.dataset.t); });
  [].forEach.call(document.querySelectorAll('[data-lang]'), function (b) { b.classList.toggle('on', b.dataset.lang === LANG); });
  $('q').placeholder = t('search'); $('uName').placeholder = t('userPh');
  renderSlots(); ready(); renderProg();
  if (RV) { renderViews(); renderTable(); renderSave(); }
  if (window.prepRender) prepRender();
  if (window.techRender) techRender();
  if (window.renderNotices && LCDIR) renderNotices();
  if (window.paintTabs) paintTabs();
  if (window.applyPh) applyPh(); if (window.ACT && ACT.loaded) { fillActSelects(); renderActivity(); } if (window.paintClosedInfo) paintClosedInfo();
}
document.querySelector('.lang').onclick = function (e) {
  var b = e.target.closest('[data-lang]'); if (!b) return;
  LANG = b.dataset.lang; try { localStorage.setItem('mdb_lang', LANG); } catch (x) {} renderAll();
};
$('views').onclick = function (e) { var b = e.target.closest('[data-v]'); if (!b) return; VIEW = b.dataset.v; CHIP = 'all'; $('q').value = ''; renderViews(); renderTable(); };
$('chips').onclick = function (e) { var b = e.target.closest('[data-c]'); if (!b) return; CHIP = b.dataset.c; renderViews(); renderTable(); };
$('q').oninput = renderTable;
$('tbl').onchange = function (e) {
  var el = e.target;
  if (el.dataset.a != null) { RV.items[+el.dataset.a].apply = el.checked; }
  else if (el.dataset.ut != null) {
    var pr = el.dataset.ut.split('|'), it2 = RV.items[+pr[0]], o2 = it2.opts[it2.sel], ui = +pr[1];
    if (el.checked) { if (o2.ticks.indexOf(ui) < 0) o2.ticks.push(ui); } else o2.ticks = o2.ticks.filter(function (x) { return x !== ui; });
    tickSet(o2, REF.groups);
    o2.notes = (o2.flags || []).concat(o2.unknown.length ? [['unknownCode', o2.unknown.join(', ')]] : []); o2.blocked = o2.unknown.length > 0 || !Object.keys(o2.set).length;
    if (o2.blocked) it2.apply = false; renderTable();
  }
  else if (el.dataset.s != null) { var it = RV.items[+el.dataset.s], wasKeep = it.opts[it.sel].type === 'keep'; it.sel = +el.value; var o = it.opts[it.sel]; if (o.type === 'keep' || wasKeep || o.blocked) it.apply = false; renderTable(); }
  else if (el.dataset.f != null) { RV.issues[+el.dataset.f].apply = el.checked; }
  else if (el.dataset.k != null) { RV.items[+el.dataset.k].confirm = el.checked; }
  SAVED = null; KEEPMSG = ''; renderSave();
};
$('bAll').onclick = function () {
  if (VIEW === 'issues') RV.issues.forEach(function (x) { if (x.fix) x.apply = true; });
  else if (VIEW === 'same') reviewRows().forEach(function (it) { if (it.opts[it.sel].type === 'layout') it.confirm = true; });
  else reviewRows().forEach(function (it) { var o = it.opts[it.sel]; if (o.type !== 'keep' && !o.blocked) it.apply = true; });
  SAVED = null; renderTable(); renderSave();
};
$('bNone').onclick = function () {
  if (VIEW === 'issues') RV.issues.forEach(function (x) { if (x.fix) x.apply = false; });
  else if (VIEW === 'same') reviewRows().forEach(function (it) { it.confirm = false; });
  else reviewRows().forEach(function (it) { it.apply = false; });
  SAVED = null; renderTable(); renderSave();
};
$('keepBtn').onclick = function () {
  confirmKeeps().then(function (r) { if (r) { SAVED = null; KEEPMSG = t('keepSaved', [r.n]) + (r.where === 'local' ? t('keepLocal') : ''); } renderAll(); });
};
$('tbl').addEventListener('click', function (e) {
  var b = e.target.closest('[data-ku]'); if (!b) return;
  var it = RV.items[+b.dataset.ku], old = KEEPS[it.key]; delete KEEPS[it.key];
  persistKeeps().then(function () { it.bucket = it.bucketBefore || 'review'; it.keptRec = null; KEEPMSG = ''; VIEW = it.bucket === 'kept' ? 'review' : (RV.items.some(function (x) { return x.bucket === 'kept'; }) ? 'kept' : 'review'); renderAll(); })
    .catch(function (err) { if (old) KEEPS[it.key] = old; alert(t('keepErr', [err.message])); });
});
$('save').onclick = function () {
  var d = new Date(), today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var ex = buildExport(RV, REF, DONE, today), wb = XLSX.utils.book_new();
  [['db', 'MACHINE DATABASE'], ['changes', 'CHANGES'], ['exc', 'EXCEPTIONS'], ['layout', 'LAYOUT DATA'], ['newChanged', 'NEW CHANGED'], ['scanState', 'SCAN STATE']].forEach(function (s) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ex[s[0]], { cellDates: true }), s[1]);
  });
  var p = function (x) { return String(x).padStart(2, '0'); };
  var name = 'MACHINE_DATABASE_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.xlsx';
  var lcItems = !LCDIR ? [] : RV.items.filter(function (it) {
    var o = it.opts[it.sel]; if (o.type !== 'layout' || o.blocked) return false;
    var last = LC && LC.approvals[it.key];
    if (last && sameSet(last.laySet, o.set)) return false;                                    // same "Đã duyệt" note already written
    return (it.bucket === 'review' && it.apply) || (it.bucket === 'same' && it.confirm);
  });
  var user = $('uName').value.trim();
  if (lcItems.length && !user) { $('uName').focus(); alert(t('lcNeedName')); return; }
  XLSX.writeFile(wb, name);
  var apprNow = RV.items.filter(function (it) { var o = it.opts[it.sel]; return it.apply && o.type !== 'keep' && !o.blocked; });
  if (apprNow.length) addDbOverlay(apprNow, user);                           // the shortage report counts the approved changes at once (labelled: not yet in the MC Report)
  SAVED = [name, ex.nApproved, ex.db.length - 1, '']; renderSave();
  confirmKeeps().then(function (r) { if (r && SAVED) SAVED.k = t('keepSaved', [r.n]) + (r.where === 'local' ? t('keepLocal') : ''); renderAll(); });
  if (!LCDIR) return;
  (async function () {
    try {
      var md = await LCDIR.getDirectoryHandle('machinedb', { create: true }), txt = JSON.stringify(scanStateJson(DONE, new Date()));
      try { var old = await (await (await md.getFileHandle('scanstate.json')).getFile()).text(); var bh = await md.getFileHandle('scanstate.bak.json', { create: true }), bw = await bh.createWritable(); await bw.write(old); await bw.close(); } catch (e) { }
      var sh = await md.getFileHandle('scanstate.json', { create: true }), sw = await sh.createWritable(); await sw.write(txt); await sw.close();
      SAVED[3] = t('stateSaved');
    } catch (e) { SAVED[3] = t('lcErr', [e.message]); }
    renderSave();
    if (!lcItems.length) return;
    try {
      var vd = await LCDIR.getDirectoryHandle('approvals', { create: true }), ad = await LCDIR.getDirectoryHandle('activity', { create: true });
      var now = new Date(), log = '';
      for (var i = 0; i < lcItems.length; i++) {
        var r = lcRecord(lcItems[i], LC, user, new Date(now.getTime() + i * 1000));
        var fh = await vd.getFileHandle(r.name, { create: true }), w = await fh.createWritable(); await w.write(JSON.stringify(r.rec, null, 1)); await w.close();
        LC.approvals[lcItems[i].key] = { user: user, at: r.rec.savedAt, laySet: lcItems[i].opts[lcItems[i].sel].set };
        log += JSON.stringify({ time: r.rec.savedAt, name: user, role: 'Consolidator', pu: r.rec.pu, action: 'DB_APPROVED', style: r.rec.style, detail: r.rec.comment }) + '\n';
      }
      var p2 = function (x) { return String(x).padStart(2, '0'); };
      var an = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()) + '_' + user.replace(/[^\w\-]+/g, '_') + '.jsonl';
      var afh = await ad.getFileHandle(an, { create: true }), size = (await afh.getFile()).size, aw = await afh.createWritable({ keepExistingData: true });
      await aw.seek(size); await aw.write(log); await aw.close();
      SAVED[3] = t('stateSaved') + ' ' + t('lcSaved', [lcItems.length]);
    } catch (e) { SAVED[3] = t('lcErr', [e.message]); }
    renderSave();
  })();
};
loadKeeps(null);
renderAll();
