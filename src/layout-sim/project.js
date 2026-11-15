/* project.js: projects (one line layout of one style): new, save, save as, open a file, a project folder, recent projects kept in this browser.
   A project file is the .layout.json of fileJson(). Recent projects are copies kept in IndexedDB "layoutsim" (per browser, never sent anywhere). */
var PROJ = { handle: null, dir: null, dirFiles: [] };

/* ---------- IndexedDB ---------- */
var IDBP = null;
function idbOpen() {
  if (IDBP) return IDBP;
  IDBP = new Promise(function (res, rej) {
    var r = indexedDB.open('layoutsim', 1);
    r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' }); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
  IDBP.catch(function () { IDBP = null; });
  return IDBP;
}
function idbDo(store, mode, fn) {
  return idbOpen().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(store, mode), st = tx.objectStore(store), out = fn(st);
      tx.oncomplete = function () { res(out instanceof IDBRequest ? out.result : out); }; tx.onerror = function () { rej(tx.error); };   // an empty get gives undefined, not the request
    });
  });
}
function kvGet(k) { return idbDo('kv', 'readonly', function (s) { return s.get(k); }); }
function kvSet(k, v) { return idbDo('kv', 'readwrite', function (s) { s.put(v, k); }); }

/* ---------- names ---------- */
function projName() { var i = ST.info || {}; return [i.style, ST.line.name].filter(Boolean).join(' · ') || t('projUnnamed'); }
function projFileName() { return projName().replace(/[\\/:*?"<>|·]+/g, '_').replace(/\s+/g, ' ').trim() + '.layout.json'; }
function projSummary(o) {   // from a saved JSON object
  var items = o.items || [], info = o.info || {}, line = o.line || {};
  return { style: info.style || '', line: line.name || '', n: items.filter(function (i) { return i.kind === 'mc'; }).length, savedAt: o.savedAt || '', branch: !!line.branch };
}

/* ---------- recent projects (browser) ---------- */
function projRemember(json) {
  var o = JSON.parse(json), sm = projSummary(o);
  ST.info = ST.info || {}; if (!ST.info.projId) ST.info.projId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var rec = { id: ST.info.projId, name: projName(), style: sm.style, line: sm.line, n: sm.n, savedAt: new Date().toISOString(), json: json };
  return idbDo('projects', 'readwrite', function (s) { s.put(rec); }).then(function () {
    return idbDo('projects', 'readonly', function (s) { return s.getAll(); }).then(function (all) {   // keep the 30 most recent
      all.sort(function (a, b) { return b.savedAt < a.savedAt ? -1 : 1; });
      if (all.length > 30) return idbDo('projects', 'readwrite', function (s) { all.slice(30).forEach(function (r) { s.delete(r.id); }); });
    });
  }).catch(function (e) { console.warn('recent', e); });
}
function projRecent() { return idbDo('projects', 'readonly', function (s) { return s.getAll(); }).then(function (all) { return (all || []).sort(function (a, b) { return b.savedAt < a.savedAt ? -1 : 1; }); }).catch(function () { return []; }); }

/* ---------- save / open ---------- */
function writeHandle(h, data) { return h.createWritable().then(function (w) { return w.write(data).then(function () { return w.close(); }); }); }
function saveProject(asNew) {
  if (!PROJ.dir && window.showDirectoryPicker) return pickDir(function () { saveProject(asNew); });   // first time: choose where projects are saved
  if (asNew) {
    var nm = prompt(t('projAsName'), projFileName().replace(/\.layout\.json$/i, '') + ' (2)'); if (!nm) return;
    PROJ.saveName = nm.replace(/[\\/:*?"<>|]+/g, '_').trim() + '.layout.json'; ST.info = Object.assign({}, ST.info, { projId: null }); PROJ.handle = null;
  }
  var data = fileJson(), name = PROJ.saveName || projFileName(), p;
  if (PROJ.dir) p = dirPerm(true).then(function () { return PROJ.handle || PROJ.dir.getFileHandle(name, { create: true }); }).then(function (h) { PROJ.handle = h; return writeHandle(h, data); });
  else { download(name, data, 'application/json'); p = Promise.resolve(); }   // browser without folder access only
  return p.then(function () { return projRemember(fileJson()); }).then(function () {
    ST.info.savedAt = new Date().toISOString(); toast(t('projSaved', [(PROJ.dir ? PROJ.dir.name + ' / ' : '') + (PROJ.handle ? PROJ.handle.name : name)])); renderProj(); if (PROJ.dir) scanDir();
  }).catch(function (e) { if (e && e.name === 'AbortError') return; console.warn(e); toast(t('projSaveErr') + ': ' + (e && e.message || e), true); });
}
function loadProject(txt, handle, label) {
  try {
    openJson(txt); PROJ.handle = handle || null;
    fillCodeList(); LAST = null; commit(); UNDO = []; REDO = []; renderAll(); setTab('plan'); fitView();
    toast(t('opened', [label || projName()]));
    projRemember(fileJson()).then(renderProj);
  } catch (e) { toast(t('openErr') + ': ' + e.message, true); }
}
function newProject() {
  if (ST.items.some(function (i) { return i.kind === 'mc'; }) && !confirm(t('projNewConfirm'))) return;
  ST.items = []; ST.seqText = ''; ST.info = {}; ST.line = { name: '', length: 2400, width: 600, fixed: false }; SEL = []; PROJ.handle = null;
  LAST = null; commit(); UNDO = []; REDO = []; renderAll(); setTab('plan'); fitView(); openLineSetup();
}

/* ---------- project folder ---------- */
function dirPerm(write) {
  if (!PROJ.dir || !PROJ.dir.queryPermission) return Promise.resolve();
  var o = { mode: write ? 'readwrite' : 'read' };
  return PROJ.dir.queryPermission(o).then(function (s) { return s === 'granted' ? s : PROJ.dir.requestPermission(o); }).then(function (s) { if (s !== 'granted') throw new Error(t('projNoPerm')); });
}
function pickDir(then) {
  if (!window.showDirectoryPicker) { toast(t('projNoFs'), true); return; }
  window.showDirectoryPicker({ mode: 'readwrite', id: 'layoutsim' }).then(function (d) {
    PROJ.dir = d; PROJ.handle = null; kvSet('dir', d).catch(function () {}); toast(t('projDirSet', [d.name]));
    return scanDir().then(function () { if (typeof then === 'function') then(); });
  }).catch(function (e) { if (e && e.name !== 'AbortError') toast(e.message, true); });
}
/* first start: ask once where projects are saved (remembered), then the line set-up */
function firstRun() {
  var next = function () { if (!ST.line.fixed && !ST.items.length) openLineSetup(); };
  (PROJ.ready || Promise.resolve()).then(function () {
    if (PROJ.dir || !window.showDirectoryPicker) return next();
    $('dirName').textContent = ''; $('dlgDir').showModal();
    $('dlgDir').onclose = next;
  });
}
function scanDir() {
  if (!PROJ.dir) return Promise.resolve();
  var out = [];
  return dirPerm(false).then(function () {
    var it = PROJ.dir.values(), step = function () {
      return it.next().then(function (r) {
        if (r.done) return;
        var h = r.value;
        if (h.kind !== 'file' || !/\.layout\.json$/i.test(h.name)) return step();
        return h.getFile().then(function (f) { return f.text().then(function (txt) { var o = {}; try { o = JSON.parse(txt); } catch (e) {} out.push(Object.assign({ name: h.name, handle: h, mtime: f.lastModified }, projSummary(o))); }); }).then(step);
      });
    };
    return step();
  }).then(function () { out.sort(function (a, b) { return b.mtime - a.mtime; }); PROJ.dirFiles = out; renderProj(); })
    .catch(function (e) { PROJ.dirFiles = []; renderProj(e.message); });
}

/* ---------- the "Dự án" tab ---------- */
function fmtDate(s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? '' : d.toLocaleString(); }
function renderProj(err) {
  if (!$('paneProj')) return;
  var i = ST.info || {}, mc = ST.items.filter(function (x) { return x.kind === 'mc'; });
  $('pjStyle').value = i.style || ''; $('pjLine').value = ST.line.name || '';
  $('pjInfo').innerHTML = esc(t('projInfo', [mc.length, mc.filter(function (x) { return !x.noOp; }).length, ST.line.length, ST.line.width])) +
    (i.file ? '<br>' + esc(t('projSrc', [i.file, i.sheet || '', i.optr || '?', i.sam || '?', i.obd || '?'])) : '') +
    '<br>' + esc(PROJ.handle ? t('projFile', [PROJ.handle.name]) : t('projNotSaved'));
  $('pjDirName').textContent = PROJ.dir ? PROJ.dir.name : t('projNoDir');
  function row(o, kind, k) {
    return '<tr><td><b>' + esc(o.style || '—') + '</b><div class="small muted">' + esc(o.name || '') + '</div></td><td>' + esc(o.line || '') + '</td><td class="n">' + (o.n || 0) + '</td><td class="small">' + esc(fmtDate(o.savedAt || o.mtime)) + '</td>' +
      '<td style="white-space:nowrap"><button data-open="' + kind + ':' + k + '">' + esc(t('projOpen')) + '</button>' + (kind === 'r' ? ' <button class="danger" data-del="' + esc(o.id) + '">✕</button>' : '') + '</td></tr>';
  }
  var head = '<tr><th>' + esc(t('pjStyle')) + '</th><th>' + esc(t('lnName')) + '</th><th class="n">' + esc(t('projMc')) + '</th><th>' + esc(t('projDate')) + '</th><th></th></tr>';
  $('pjDirList').innerHTML = err ? '<div class="t-warn tagline">' + esc(err) + '</div>' : PROJ.dir ? (PROJ.dirFiles.length ? '<table>' + head + PROJ.dirFiles.map(function (o, k) { return row(o, 'd', k); }).join('') + '</table>' : '<div class="muted small">' + esc(t('projDirEmpty')) + '</div>') : '';
  projRecent().then(function (all) {
    PROJ.recent = all;
    $('pjRecent').innerHTML = all.length ? '<table>' + head + all.map(function (o, k) { return row(o, 'r', k); }).join('') + '</table>' : '<div class="muted small">' + esc(t('projNoRecent')) + '</div>';
  });
}
function initProj() {
  $('pjNew').onclick = newProject;
  $('pjSave').onclick = function () { saveProject(false); };
  $('pjSaveAs').onclick = function () { saveProject(true); };
  $('pjOpen').onclick = function () { $('fileOpen').value = ''; $('fileOpen').click(); };
  $('pjPaste').onclick = function () { setTab('plan'); openPaste(); };
  $('pjDir').onclick = function () { pickDir(); };
  $('dirPick').onclick = function () { pickDir(function () { $('dlgDir').close(); }); };
  $('dirLater').onclick = function () { $('dlgDir').close(); };
  $('pjRescan').onclick = scanDir;
  $('pjStyle').onchange = function () { ST.info = Object.assign({}, ST.info, { style: this.value.trim() }); changed(); renderProj(); };
  $('pjLine').onchange = function () { ST.line.name = this.value.trim(); changed(); renderProj(); };
  $('paneProj').addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
    if (d) { if (!confirm(t('projDelConfirm'))) return; idbDo('projects', 'readwrite', function (s) { s.delete(d.dataset.del); }).then(function () { renderProj(); }); return; }
    if (!o) return;
    var p = o.dataset.open.split(':'), k = +p[1];
    if (p[0] === 'r') { var rec = PROJ.recent[k]; ST.info = {}; loadProject(rec.json, null, rec.name); }
    else { var f = PROJ.dirFiles[k]; dirPerm(false).then(function () { return f.handle.getFile(); }).then(function (fl) { return fl.text(); }).then(function (txt) { loadProject(txt, f.handle, f.name); }).catch(function (er) { toast(er.message, true); }); }
  });
  PROJ.ready = kvGet('dir').then(function (d) { if (d) { PROJ.dir = d; if (d.queryPermission) d.queryPermission({ mode: 'read' }).then(function (s) { if (s === 'granted') scanDir(); else renderProj(); }); } }).catch(function () {});
}
