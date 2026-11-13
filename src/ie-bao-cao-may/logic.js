// ===================== LOGIC (pure functions, testable) =====================
function setOf(rows) { var s = {}; rows.forEach(function (r) { s[r[0]] = (s[r[0]] || 0) + r[1]; }); return s; }
function sameSet(a, b) {
  if (!a || !b) return false;
  var ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
  return ka.every(function (k) { return Math.abs((a[k] || 0) - (b[k] || 0)) < 1e-9; });
}
// machine group is the key: compare totals per group (a code without group stays on its own)
function toGroups(set, G) { var g = {}; Object.keys(set || {}).forEach(function (c) { var k = (G && G[c]) || ('? ' + c); g[k] = (g[k] || 0) + (+set[c] || 0); }); return g; }
function sameGroups(a, b, G) { if (!a || !b) return false; return sameSet(toGroups(a, G), toGroups(b, G)); }
function setText(s) { return s ? Object.keys(s).sort().map(function (k) { return k + ' ' + (+s[k].toFixed(2)); }).join(', ') : ''; }
function findCol(header, name) { var n = norm(name); for (var i = 0; i < header.length; i++) if (norm(header[i]) === n) return i; return -1; }
function sheetAoa(ws, maxCol) {
  if (!ws || !ws['!ref']) return [];
  var maxR = 0; Object.keys(ws).forEach(function (k) { if (k[0] !== '!') { var r = XLSX.utils.decode_cell(k).r; if (r > maxR) maxR = r; } });
  var R = XLSX.utils.decode_range(ws['!ref']); R.e.r = maxR; if (maxCol != null) R.e.c = Math.min(R.e.c, maxCol);
  return XLSX.utils.sheet_to_json(ws, { header: 1, range: R, defval: '', raw: true, blankrows: false });
}
function fmtDate(d) { if (!(d instanceof Date)) return d ? String(d) : ''; var p = function (x) { return String(x).padStart(2, '0'); }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2); }

// ---------- reference data ----------
function loadGroups(aoa) { var m = {}; aoa.slice(1).forEach(function (r) { var c = skey(r[0]); if (c) m[c] = String(r[1] == null ? '' : r[1]).trim(); }); return m; }
function dayKey(v) { return v instanceof Date ? Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) : (typeof v === 'number' ? Math.round((v - 25569) * 864e5) : null); }
function loadDb(aoa) {               // per style only the rows of the LATEST date count (same rule as Layout Check)
  var header = aoa[0] || [], rows = aoa.slice(1).filter(function (r) { return String(r[0]).trim() !== ''; });
  var ix = { style: findCol(header, 'STYLE'), mc: findCol(header, 'MACHINE'), qty: findCol(header, 'QUANTITY'), rm: findCol(header, 'REMARK'), grp: findCol(header, 'MACHINE GROUP'), date: findCol(header, 'DATE') };
  var byKey = {};
  rows.forEach(function (r, i) {
    var k = skey(r[ix.style]); if (!byKey[k]) byKey[k] = { name: String(r[ix.style]).trim(), idx: [], remarks: {}, set: {}, latest: null, cur: [], old: [] };
    var e = byKey[k], d = ix.date >= 0 ? dayKey(r[ix.date]) : null; e.idx.push(i);
    if (d != null && (e.latest == null || d > e.latest)) e.latest = d;
  });
  Object.keys(byKey).forEach(function (k) {
    var e = byKey[k];
    e.idx.forEach(function (i) {
      var r = rows[i], d = ix.date >= 0 ? dayKey(r[ix.date]) : null;
      if (e.latest != null && d !== e.latest) { e.old.push(i); return; }
      e.cur.push(i); e.remarks[String(r[ix.rm]).trim().toLowerCase()] = 1;
      var q = +r[ix.qty] || 0, c = skey(r[ix.mc]); if (c) e.set[c] = (e.set[c] || 0) + q;
    });
    e.date = e.latest != null ? new Date(e.latest) : null;
  });
  return { header: header, rows: rows, ix: ix, byKey: byKey };
}
function loadPlan(aoa) {           // MasterPlan-Full: Line, GOP, Style No, Date
  var h = aoa[0] || [], si = findCol(h, 'Style No'), li = findCol(h, 'Line'), di = findCol(h, 'Date');
  var byBase = {}, names = {}, info = {}, today = new Date(); today.setHours(0, 0, 0, 0);
  aoa.slice(1).forEach(function (r) {
    var s = String(r[si] == null ? '' : r[si]).trim(); if (!s) return;
    if (s.indexOf(')') < 0 && !isSpecial(s)) return;                       // "Not Set up" etc.
    var p = splitFull(s), k = skey(s);
    (byBase[p.base] = byBase[p.base] || {})[skey(p.variant)] = 1; names[k] = s;
    var e = info[k] = info[k] || { first: null, any: null, lines: {}, lineFirst: {} }, d = r[di] instanceof Date ? r[di] : null;
    var ln = li >= 0 ? String(r[li]).trim() : '';
    if (d) { if (d >= today && (!e.first || d < e.first)) e.first = d; if (!e.any || d < e.any) e.any = d; }
    if (ln) { e.lines[ln] = 1; if (d && (!e.lineFirst[ln] || d < e.lineFirst[ln])) e.lineFirst[ln] = d; }
  });
  Object.keys(info).forEach(function (k) {
    var e = info[k]; if (!e.first) e.first = e.any; e.lines = Object.keys(e.lines).sort();
    e.firstLines = Object.keys(e.lineFirst).filter(function (l) { return e.any && +e.lineFirst[l] === +e.any; }).sort();
    delete e.lineFirst;
  });
  return { byBase: byBase, names: names, info: info };
}
function loadCosting(aoa) {        // COSTING PROPOSAL (Power Query output)
  if (!aoa.length) return {};
  var h = aoa[0], ix = { s: findCol(h, 'STYLE'), m: findCol(h, 'MACHINE'), q: findCol(h, 'QUANTITY'), st: findCol(h, 'Status'), f: findCol(h, 'Factor'), d: findCol(h, 'IEDDate') }, by = {};
  aoa.slice(1).forEach(function (r) {
    var k = skey(r[ix.s]); if (!k) return;
    var e = by[k] = by[k] || { name: String(r[ix.s]).trim(), set: {}, status: 'OK', factor: '', ied: '' };
    var st = String(r[ix.st] || 'OK').trim(); if (st !== 'OK') e.status = st;
    if (ix.f >= 0 && r[ix.f] !== '') e.factor = r[ix.f];
    if (ix.d >= 0 && r[ix.d] !== '') e.ied = r[ix.d];
    var c = skey(r[ix.m]), q = +r[ix.q] || 0; if (c && q > 0) e.set[c] = (e.set[c] || 0) + q;
  });
  return by;
}

// ---------- review model: scan first, costing only where no layout ----------
function optBlocked(o) { return !!(o && o.blocked); }
function tickSet(c, G) {
  var set = {}; c.units.forEach(function (u) { if (c.ticks.indexOf(u.i) >= 0) Object.keys(u.set).forEach(function (m) { set[m] = (set[m] || 0) + u.set[m]; }); });
  c.set = set; c.unit = c.units.filter(function (u) { return c.ticks.indexOf(u.i) >= 0; }).map(function (u) { return u.label; }).join(' + ');
  c.unknown = Object.keys(set).filter(function (m) { return !G[m]; });
  var sh = []; c.units.forEach(function (u) { if (c.ticks.indexOf(u.i) >= 0 && sh.indexOf(u.sheet) < 0) sh.push(u.sheet); });
  c.used = [{ file: c.file, sheets: sh }];
  return c;
}
function itemKind(it) {
  var o = it.opts[it.sel];
  if (o.type === 'keep') return 'keep';
  if (it.current && sameGroups(it.current, o.set, it.groups)) return 'same';
  if (o.type === 'costing') return 'costing';
  if (!it.current) return 'new';
  if (it.manual) return 'manual';
  if (it.costingOnly) return 'upgrade';
  return 'changed';
}
function buildReview(files, ref) {
  var G = ref.groups, db = ref.db, plan = ref.plan, costing = ref.costing || {};
  var cands = {}, issues = [];
  function inScope(k) { return !CFG.onlyRelevant || plan.names[k] || db.byKey[k]; }
  files.forEach(function (f) {
    if (f.status === 'Failed') { issues.push({ type: 'readFail', item: f.path, args: [notesText(f.notes, 'en')] }); return; }
    if (f.status !== 'OK') return;
    var fileStyles = expandStyles(f.name);
    // every sheet with a machine table is a choice; MM files: one entry per Prep / Ass block
    var units = f.units.filter(function (u) { return u.rows.length; }).map(function (u, i, arr) {
      var dup = arr.filter(function (x) { return x.sheet === u.sheet; }).length > 1;
      return { i: i, sheet: u.sheet, label: u.sheet + (dup || f.mode === 'mm' ? ' · ' + u.section : ''), set: setOf(u.rows), styleText: u.styleText };
    });
    var perStyle = {}, anyStyle = false;
    units.forEach(function (u) {
      var bases = expandStyles(u.styleText); if (!bases.length) bases = fileStyles;
      if (!bases.length) return;
      anyStyle = true;
      var det = detectVariant(u.styleText) || detectVariant(f.name) || detectVariant(f.path);
      bases.forEach(function (b) {
        var flags = [], v = det;
        if (isSpecial(b)) v = '';
        else if (!v) {
          var pv = plan.byBase[b] ? Object.keys(plan.byBase[b]) : [];
          if (!pv.length || pv.indexOf('') >= 0) { v = ''; if (pv.length > 1) flags.push(['alsoPlanned', pv.filter(Boolean).join('/')]); }
          else if (pv.length === 1) { v = pv[0]; flags.push(['varPlan', v]); }
          else { v = ''; flags.push(['checkVariant', pv.join('/')]); }
        }
        var k = skey(b + v); if (!inScope(k)) return;
        var e = perStyle[k] = perStyle[k] || { name: plan.names[k] || (db.byKey[k] && db.byKey[k].name) || (b + v), flags: flags, mention: [] };
        if (e.mention.indexOf(u.i) < 0) e.mention.push(u.i);
      });
    });
    Object.keys(perStyle).forEach(function (k) {
      var e = perStyle[k];
      // default ticks (Layout Check rule): all Man-Machine blocks, otherwise the first sheet that names this style
      var ticks = f.mode === 'mm' ? units.map(function (u) { return u.i; }) : [e.mention.slice().sort(function (a, b) { return a - b; })[0]];
      var c = { name: e.name, file: f, units: units.map(function (u) { return Object.assign({}, u, { mention: e.mention.indexOf(u.i) >= 0 }); }), ticks: ticks, flags: e.flags,
        rank: f.type === 'Bulk' ? 2 : (f.type === 'Initial' ? 1 : 0), obd: f.obd || 0, mtime: f.mtime || 0 };
      tickSet(c, G);
      (cands[k] = cands[k] || []).push(c);
    });
    if (!anyStyle) issues.push({ type: 'noStyle', item: f.path, args: [] });
    (f.bad || []).forEach(function (b) { issues.push({ type: 'badQty', item: f.path, args: [b] }); });
  });

  var keys = {}; Object.keys(cands).forEach(function (k) { keys[k] = 1; });
  Object.keys(costing).forEach(function (k) { if (!db.byKey[k] && inScope(k)) keys[k] = 1; });
  var items = [], missing = [];
  Object.keys(keys).forEach(function (k) {
    var list = (cands[k] || []).sort(function (a, b) { return b.rank - a.rank || b.obd - a.obd || b.mtime - a.mtime; });
    var e = db.byKey[k], c = costing[k], opts = [];
    list.forEach(function (x) {
      opts.push({ type: 'layout', file: x.file, units: x.units, ticks: x.ticks, used: x.used, unit: x.unit, set: x.set, flags: x.flags, notes: x.flags.concat(x.unknown.length ? [['unknownCode', x.unknown.join(', ')]] : []), blocked: x.unknown.length > 0 || !Object.keys(x.set).length });
    });
    if (c) {
      var unk = Object.keys(c.set).filter(function (x) { return !G[x]; });
      var cn = []; if (c.status !== 'OK') cn.push(['costingStatus', c.status]); if (unk.length) cn.push(['unknownCode', unk.join(', ')]);
      opts.push({ type: 'costing', set: c.set, factor: c.factor, ied: c.ied, notes: cn, blocked: c.status !== 'OK' || unk.length > 0 || !Object.keys(c.set).length });
    }
    opts.push({ type: 'keep', set: e ? e.set : null, notes: [], blocked: false });
    opts.forEach(function (o) { o.fp0 = o.type === 'keep' ? '' : o.type + ':' + fp(o.set); });          // content fingerprint of the proposal as scanned (for "keep" confirmations)
    var hasLayout = list.length > 0, costOk = c && !opts.filter(function (o) { return o.type === 'costing'; })[0].blocked;
    var info = plan.info[k];
    if (!hasLayout && !e && !costOk) {                    // nothing usable -> still missing
      if (info) missing.push({ key: k, name: plan.names[k], first: info.first, lines: info.lines, reason: c ? ['costingStatus', c.status !== 'OK' ? c.status : notesText(opts[opts.length - 2].notes, 'en')] : ['noCosting'], action: c ? 'a_costingErr' : 'a_noCosting' });
      return;
    }
    if (!hasLayout && !c) return;
    var remarks = e ? Object.keys(e.remarks) : [];
    var it = { key: k, name: (info && plan.names[k]) || (e && e.name) || (list[0] && list[0].name) || (c && c.name),
      first: info ? info.first : null, firstAny: info ? info.any : null, lines: info ? info.lines : [], firstLines: info ? info.firstLines : [], inPlan: !!info, groups: G,
      current: e ? e.set : null, currentRemark: remarks.join(', '),
      manual: remarks.some(function (r) { return CFG.layoutRemarks.indexOf(r) < 0 && r !== CFG.costingRemark; }),
      costingOnly: remarks.length > 0 && remarks.every(function (r) { return r === CFG.costingRemark; }),
      opts: opts, sel: 0, rec: 0, apply: false,
      conflict: list.length > 1 && list[1].rank === list[0].rank && list[1].obd === list[0].obd && !sameSet(list[0].set, list[1].set),
      notes: [] };
    if (list.length > 1) it.notes.push(['nFiles', list.length]);
    if (it.manual) it.notes.push(['manualData', it.currentRemark || '-']);
    it.rec = it.sel = 0;                                  // best layout, or costing when no layout
    it.kind0 = itemKind(it);
    it.bucket = it.kind0 === 'same' ? 'same' : 'review';
    if (it.opts[it.sel].blocked && it.opts[it.sel].notes.some(function (n) { return n[0] === 'unknownCode'; }))
      issues.push({ type: 'unknownCode', item: it.name, args: [it.opts[it.sel].notes.filter(function (n) { return n[0] === 'unknownCode'; })[0][1]] });
    items.push(it);
  });
  // planned styles with nothing at all (not in DB, no layout, no costing row)
  Object.keys(plan.names).forEach(function (k) {
    if (keys[k] || db.byKey[k]) return;
    var info = plan.info[k];
    missing.push({ key: k, name: plan.names[k], first: info.first, lines: info.lines, reason: ['noCosting'], action: 'a_noCosting' });
  });
  // database checks
  Object.keys(db.byKey).forEach(function (k) {
    var e = db.byKey[k], v = skey(splitFull(e.name).variant);
    if (CFG.allowedVariants.indexOf(v) < 0) issues.push({ type: 'variant', item: e.name, args: [splitFull(e.name).variant] });
    var n = e.cur.length;
    if (n >= 2 && n % 2 === 0) {
      var h = n / 2, same = true;
      for (var i = 0; i < h && same; i++) { var a = db.rows[e.cur[i]], b = db.rows[e.cur[i + h]]; same = skey(a[db.ix.mc]) === skey(b[db.ix.mc]) && +a[db.ix.qty] === +b[db.ix.qty]; }
      if (same) issues.push({ type: 'dup', item: e.name, key: k, args: [setText(e.set)], fix: true, apply: false, dropIdx: e.cur.slice(h) });
    }
    if (e.old.length) issues.push({ type: 'oldVer', item: e.name, key: k, args: [e.old.length + ' / ' + fmtDate(e.date)], fix: true, apply: false, dropIdx: e.old.slice() });
  });
  var byDate = function (a, b) { return (a.first ? +a.first : 9e15) - (b.first ? +b.first : 9e15) || String(a.name).localeCompare(String(b.name)); };
  items.sort(byDate); missing.sort(byDate);
  return { items: items, missing: missing, issues: issues };
}

// ---------- Layout Check link (data\\validations, data\\variations, data\\Linemapping.xlsx) ----------
function loadLayoutCheck(allVals, acts, lineRows, approvalFiles) {
  var latest = {}, lastAct = {}, lineMap = {}, approvals = {};
  var vals = allVals.filter(function (v) { return v.status !== 'APPROVED'; });     // existing "Đạt" records stay checks, unchanged
  allVals.filter(function (v) { return v.status === 'APPROVED'; }).concat(approvalFiles || []).sort(function (a, b) { return String(a.savedAt).localeCompare(String(b.savedAt)); })
    .forEach(function (a) { var lay = {}; (a.details || []).forEach(function (d) { if (+d.lay > 0) lay[skey(d.machine)] = +d.lay; }); approvals[skey(a.style)] = { user: a.user, at: a.savedAt, laySet: lay }; });
  vals.slice().sort(function (a, b) { return String(a.savedAt).localeCompare(String(b.savedAt)); }).forEach(function (v) {
    var lay = {}, dbs = {};
    (v.details || []).forEach(function (d) { var m = skey(d.machine); if (+d.lay > 0) lay[m] = +d.lay; if (+d.db > 0) dbs[m] = +d.db; });
    var src = v.source || (String(v.comment || '').indexOf('MachineDB') === 0 ? 'MachineDB' : 'LayoutCheck');
    latest[skey(v.style)] = { status: v.status, user: v.user, role: v.role, at: v.savedAt, comment: v.comment || '', valId: v.valId, laySet: lay, dbSet: dbs, source: src,
      files: splitList(v.layoutFiles, '|'), sheets: splitList(v.layoutSheets, '|').map(function (x) { return splitList(x, '+'); }), layoutPath: v.layoutPath || '' };
  });
  acts.slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).forEach(function (a) { lastAct[a.valId] = a; });
  if (lineRows && lineRows.length) {
    var h = lineRows[0], li = findCol(h, 'Line'), pi = findCol(h, 'PU');
    lineRows.slice(1).forEach(function (r) { var l = String(r[li] || '').trim().toUpperCase(), p = String(r[pi] || '').trim().toUpperCase(); if (l && p) lineMap[l] = p; });
  }
  return { latest: latest, lastAct: lastAct, lineMap: lineMap, approvals: approvals, nVals: vals.length, nActs: acts.length, nStyles: Object.keys(latest).length, nAppr: Object.keys(approvals).length };
}
function lcPU(lc, line) {                // same lookup as Layout Check: exact line, then base line (before - _ space ( )
  var k = String(line).trim().toUpperCase(); if (lc.lineMap[k]) return lc.lineMap[k];
  var m = k.match(/^[^\-_ (]+/); return (m && lc.lineMap[m[0]]) || 'UNMAPPED';
}
function isoDay(d) { return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }
function lcIsoWeek(d) { var t = isoDay(d), day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); var y = t.getUTCFullYear(), j4 = new Date(Date.UTC(y, 0, 4)); return 1 + Math.round(((t - j4) / 864e5 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7); }
function lcFmt(d) { var p = function (x) { return String(x).padStart(2, '0'); }; return d ? p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
function fp(set) { return Object.keys(set || {}).sort().map(function (k) { return k + ':' + (+set[k]); }).join(';'); }
function splitList(x, sep) { return String(x || '').split(sep).map(function (s) { return s.trim(); }).filter(Boolean); }
function unitsSet(f, sheets) {        // machines of the given sheets of a scanned file (all sheets if none given)
  var want = (sheets || []).map(function (s) { return s.toUpperCase(); }), set = {};
  (f.units || []).forEach(function (u) {
    if (want.length && want.indexOf(String(u.sheet).trim().toUpperCase()) < 0) return;
    u.rows.forEach(function (r) { set[r[0]] = (set[r[0]] || 0) + r[1]; });
  });
  return set;
}
// the layout the decision was based on, as it is NOW in the scanned folder
function decisionLayout(v, byName, byPath) {
  var names = v.files, sheets = v.sheets, set = {}, used = [], missing = [], paths = splitList(v.layoutPath, '|');
  names.forEach(function (n, i) {
    var f = paths[i] && byPath[paths[i]];
    if (!f) {
      var c = byName[n.toUpperCase()] || [];
      f = c.length === 1 ? c[0] : c.filter(function (x) { return sameSet(unitsSet(x, sheets[i]), v.laySet); })[0] || c[0];
    }
    if (!f) { missing.push(n); return; }
    var s = unitsSet(f, sheets[i]); if (!Object.keys(s).length) s = unitsSet(f, null);
    Object.keys(s).forEach(function (k) { set[k] = (set[k] || 0) + s[k]; }); used.push({ file: f, sheets: sheets[i] || [] });
  });
  return { set: set, used: used, missing: missing };
}
function applyLayoutCheck(rv, lc, files) {
  if (!lc) return;
  var byName = {}, byPath = {};
  (files || []).forEach(function (f) { var k = f.name.toUpperCase(); (byName[k] = byName[k] || []).push(f); byPath[f.path] = f; });
  var day = function (iso) { return String(iso || '').slice(0, 10).split('-').reverse().join('/'); };
  rv.items.forEach(function (it) {
    var v = lc.latest[it.key], ap = lc.approvals[it.key];
    // own "Đã duyệt" note: never counts as a check; reminds to paste when the database does not have it yet
    if (ap && (!v || String(ap.at) > String(v.at)) && !(it.current && sameGroups(it.current, ap.laySet, it.groups))) it.notes.push(['mdbNotPasted', ap.user, day(ap.at)]);
    if (!v) return;
    var act = lc.lastAct[v.valId], when = day(v.at);
    var toFix = act && act.action === 'LAYOUT_TO_FIX', techFixed = act && act.action === 'TECH_LAYOUT_FIXED', techDb = act && act.action === 'TECH_DB_WRONG';
    var dbOk = !!it.current && sameGroups(it.current, v.laySet, it.groups);
    var dec = v.files.length ? decisionLayout(v, byName, byPath) : null;
    var found = dec && dec.used.length && !dec.missing.length, edited = found && !sameGroups(dec.set, v.laySet, it.groups);
    it.lc = { status: v.status, user: v.user, at: v.at, source: v.source };
    var j = -1;                                                                 // the checked layout becomes a source option
    if (found) {
      j = it.opts.findIndex(function (o) { return o.type === 'layout' && dec.used.length === 1 && o.file === dec.used[0].file && sameSet(o.set, dec.set); });
      if (j < 0) {
        var unk = Object.keys(dec.set).filter(function (c) { return !it.groups[c]; }), u0 = dec.used[0].file;
        it.opts.splice(0, 0, { type: 'layout', ie: true, file: dec.used.length === 1 ? u0 : { name: dec.used.map(function (x) { return x.file.name; }).join(' + '), path: dec.used.map(function (x) { return x.file.path; }).join(' | '), type: u0.type, obd: u0.obd, mtime: u0.mtime, hash: '' },
          used: dec.used, unit: dec.used.map(function (x) { return x.sheets.join(' + '); }).join(' | '), set: dec.set, notes: unk.length ? [['unknownCode', unk.join(', ')]] : [], blocked: unk.length > 0 });
        j = 0;
      } else { it.opts[j].ie = true; it.opts[j].used = dec.used; }
    }
    var human = v.source !== 'MachineDB', best = it.opts.filter(function (o) { return o.type === 'layout' && !o.ie; })[0];
    var done = v.status === 'PASS' || v.status === 'ACCEPTED';
    if (dec && dec.missing.length) it.notes.push(['ieMissing', dec.missing.join(', ')]);
    if (toFix && !edited) {                                                     // with IE Tech: never push this layout
      it.notes.push(['lcLayoutFix', act.by, act.note || '']);
      it.sel = it.rec = it.opts.length - 1; it.apply = false; it.bucket = 'review'; it.kind0 = 'hold'; return;
    }
    if (found && !edited && done && dbOk) {                                     // IE confirmed, nothing changed: no second check
      it.bucket = 'checked'; it.notes.push(['lcDone', v.status, v.user, when]);
      if (human && best && !sameGroups(best.set, v.laySet, it.groups) && dec.used.every(function (x) { return x.file !== best.file; }))
        rv.issues.push({ type: 'fileConflict', item: it.name, args: [best.file.name, dec.used.map(function (x) { return x.file.name; }).join(' + ')] });
      if (j >= 0) it.sel = it.rec = j;
      return;
    }
    if (!found && done && dbOk && best && sameGroups(best.set, v.laySet, it.groups)) { it.bucket = 'checked'; it.notes.push(['lcDone', v.status, v.user, when]); return; }
    if (techFixed) { if (j >= 0) it.sel = it.rec = j; it.notes.push(['lcTechFixed', act.by, day(act.at)]); }
    else if (found && edited) { it.sel = it.rec = j; it.notes.push(['lcEdited', when]); }
    else if (done) { if (j >= 0) it.sel = it.rec = j; it.notes.push(human ? ['lcOk', v.status, v.user, when] : ['mdbNotPasted', v.user, when]); }
    else if (v.status === 'FAIL') {
      if (dbOk) it.notes.push(['waitRecheck', v.user, when]);                  // database already fixed: waiting for the IE re-check
      else {                                                                    // stage 2: database to fix, from Layout Check
        it.fromLc = true; if (j >= 0) it.sel = it.rec = j;
        it.notes.push(techDb ? ['lcTechDbWrong', act.by, act.note || ''] : ['lcFail', v.user, when, v.comment]);
      }
    }
    var o = it.opts[it.sel];
    it.bucket = o.type !== 'keep' && sameGroups(o.set, it.current, it.groups) ? 'same' : 'review';
    it.kind0 = itemKind(it);
  });
}
// ---------- "keep current data" confirmations: remembered by layout CONTENT (machines and quantities), shown again only when it changes ----------
function keepFps(it) { return it.opts.filter(function (o) { return o.type !== 'keep'; }).map(function (o) { return o.fp0; }); }
function keepRecord(it, user, now) { return { name: it.name, by: user || '', at: now.toISOString(), fps: keepFps(it), dbFp: fp(it.current) }; }
// A confirmation is valid only while BOTH the layout/costing content and the database data of the style are unchanged. Returns the keys of the confirmations that are no longer valid (the caller clears them).
function applyKeeps(rv, keeps) {
  var stale = [];
  rv.items.forEach(function (it) {
    var r = keeps && keeps[it.key]; if (!r || it.bucket !== 'review' || it.fromLc || it.kind0 === 'hold' || !it.current) return;
    var fps = keepFps(it), known = r.fps || [], when = r.at ? String(r.at).slice(0, 10) : '';
    var dbSame = r.dbFp === undefined || r.dbFp === fp(it.current);                      // records made before the database check existed stay valid
    if (!dbSame) { it.notes.push(['keepDbChanged', r.by || '-', when]); stale.push(it.key); return; }
    if (fps.length && fps.every(function (f) { return known.indexOf(f) >= 0; })) {      // nothing new or changed since the confirmation
      it.bucketBefore = it.bucket; it.bucket = 'kept'; it.keptRec = r; it.apply = false; it.sel = it.opts.length - 1;
    } else { it.notes.push(['keepChanged', r.by || '-', when]); stale.push(it.key); }
  });
  return stale;
}
// one Layout Check record per style (status PASS: database = layout), written by the Builder
function lcRecord(it, lc, user, now) {
  var o = it.opts[it.sel], set = o.set, p = function (x) { return String(x).padStart(2, '0'); };
  var used = o.used || [{ file: o.file, sheets: o.file.mode === 'mm' ? (o.file.units || []).map(function (u) { return u.sheet; }).filter(function (x, i, a) { return a.indexOf(x) === i; }) : [o.unit] }];
  var st = now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate()) + '-' + p(now.getHours()) + p(now.getMinutes()) + p(now.getSeconds());
  var mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  var fl = it.firstLines && it.firstLines.length ? it.firstLines : it.lines.slice(0, 1);
  var pu = fl.length ? lcPU(lc, fl[0]) : 'UNMAPPED';
  var details = Object.keys(set).sort().map(function (m) { return { machine: m, group: (it.groups && it.groups[m]) || '?', db: set[m], lay: set[m], diff: 0, result: 'MATCH' }; });
  var tot = details.reduce(function (s, d) { return s + d.lay; }, 0);
  var rec = { valId: st + '-' + Math.random().toString(36).slice(2, 6), week: lcFmt(mon), weekNo: lcIsoWeek(now), pu: pu,
    style: it.name, firstLines: fl.join(', '), firstDate: lcFmt(it.firstAny || it.first), status: 'APPROVED', user: user, role: 'Consolidator', savedAt: now.toISOString(),
    layoutFiles: used.map(function (x) { return x.file.name; }).join(' | '), layoutSheets: used.map(function (x) { return x.sheets.join(' + '); }).join(' | '),
    layoutPath: used.map(function (x) { return x.file.path; }).join(' | '), layoutFp: fp(set), source: 'MachineDB',
    layoutVersion: o.file && o.file.obd ? 'OBD ' + o.file.obd : '', layoutType: o.file ? (o.file.type || '') : '',
    selfCheck: 'N/A', dbFile: 'MachineDB Builder', dbDate: lcFmt(now), inDb: true, totalDB: tot, totalLayout: tot, diffCount: 0, groupDiffCount: 0,
    comment: 'IE Báo cáo máy: ' + (it.bucket === 'same' ? 'layout = database' : 'database updated from layout (' + itemKind(it) + ')'), details: details };
  var safe = function (x) { return String(x).replace(/[^\w\-]+/g, '_'); };
  return { name: st + '_APPROVED_' + safe(pu) + '_' + safe(it.name) + '_' + safe(user) + '.json', rec: rec };
}

// ---------- export ----------
var LAYOUT_H = ['WorkDate', 'Status', 'Customer', 'File Name', 'Source Type', 'Sheet Name', 'Machine', 'Qty', 'Ass', 'Prep', 'Remark', 'B3', 'D3', 'D4', 'J6', 'B11', 'File Path', 'Content Hash'];
function customerOf(path) { var p = String(path).split('/'); return p.length > 1 ? p[p.length - 2] : ''; }
function layoutRows(f) {
  var out = [], base = function () { return [f.workDate || '', f.change || '', customerOf(f.path), f.name]; };
  if (!f.units || !f.units.length) return out;
  if (f.mode === 'mm') {
    var m = {}, order = [], prep = f.units.filter(function (u) { return u.section === 'Prep'; })[0] || f.units[0];
    f.units.forEach(function (u) { u.rows.forEach(function (r) { if (!m[r[0]]) { m[r[0]] = { Ass: 0, Prep: 0 }; order.push(r[0]); } m[r[0]][u.section] += r[1]; }); });
    order.forEach(function (k) { out.push(base().concat(['PU1 48', '', k, m[k].Ass + m[k].Prep, m[k].Ass, m[k].Prep, '', '', '', '', prep.j6 || '', prep.b11 || '', f.path, f.content || ''])); });
  } else {
    f.units.forEach(function (u) { u.rows.forEach(function (r) { out.push(base().concat(['Standard', u.sheet, r[0], r[1], '', '', r[2] || '', u.b3 || '', u.d3 || '', u.d4 || '', '', '', f.path, f.content || ''])); }); });
  }
  return out;
}
function buildExport(rv, ref, files, today) {
  var db = ref.db, G = ref.groups, ix = db.ix, H = db.header;
  var approved = rv.items.filter(function (it) { var o = it.opts[it.sel]; return it.apply && o.type !== 'keep' && !o.blocked; });
  var replace = {}, drop = {};
  approved.forEach(function (it) { replace[it.key] = 1; });
  rv.issues.forEach(function (x) { if (x.fix && x.apply && !replace[x.key]) x.dropIdx.forEach(function (i) { drop[i] = 1; }); });
  var out = [H];
  db.rows.forEach(function (r, i) { if (!drop[i] && !replace[skey(r[ix.style])]) out.push(r); });
  var changes = [['Style', 'Reason', 'Source', 'File', 'Layout type', 'OBD', 'File hash / IED', 'Old machines', 'New machines', 'Old remark', 'Notes', 'Approved on']];
  approved.forEach(function (it) {
    var o = it.opts[it.sel], remark = o.type === 'costing' ? CFG.costingRemark : CFG.layoutRemark;
    Object.keys(o.set).sort().forEach(function (c) {
      var row = new Array(H.length).fill('');
      row[ix.style] = it.name; row[ix.mc] = c; row[ix.qty] = o.set[c]; row[ix.rm] = remark;
      if (ix.grp >= 0) row[ix.grp] = G[c] || ''; if (ix.date >= 0) row[ix.date] = today;
      out.push(row);
    });
    changes.push([it.name, t('k_' + itemKind(it), [], 'en'), o.type === 'costing' ? 'Costing' : 'Layout', o.file ? o.file.path : '', o.file ? o.file.type : '', o.file ? o.file.obd : '',
      o.file ? o.file.hash : (o.ied instanceof Date ? o.ied.toISOString().slice(0, 10) : (o.ied || '')),
      setText(it.current), setText(o.set), it.currentRemark, notesText(it.notes.concat(o.notes), 'en'), today]);
  });
  rv.issues.forEach(function (x) { if (x.fix && x.apply && !replace[x.key]) changes.push([x.item, x.type === 'dup' ? 'Duplicate rows removed' : 'Older dated rows removed', 'Database', '', '', '', '', x.args[0], '', '', '', today]); });
  var exc = [['Type', 'Item', 'Detail', 'What to do']];
  rv.issues.forEach(function (x) { exc.push([t('i_' + x.type, [], 'en'), x.item, x.args.join(' '), t('a_' + x.type, [], 'en')]); });
  rv.missing.forEach(function (m) { exc.push(['Still missing', m.name, noteText(m.reason, 'en'), t(m.action, [], 'en')]); });
  var lay = [LAYOUT_H], nc = [LAYOUT_H];
  var st = [['File Path', 'File Hash', 'Content Hash', 'Old Content Hash', 'WorkDate', 'Change', 'Mode', 'Layout Type', 'OBD', 'Size', 'Modified', 'Result', 'Note']];
  files.forEach(function (f) {
    layoutRows(f).forEach(function (r) { lay.push(r); if (f.change === 'Added' || f.change === 'Changed') nc.push(r); });
    st.push([f.path, f.hash, f.content || '', f.oldContent || '', f.workDate || '', f.change || '', f.mode || '', f.type || '', f.obd || '', f.size, f.mtime ? new Date(f.mtime) : '', f.status, notesText(f.notes, 'en')]);
  });
  return { db: out, changes: changes, exc: exc, layout: lay, newChanged: nc, scanState: st, nApproved: approved.length };
}
function scanStateJson(files, now) {
  var out = { version: 2, savedAt: now.toISOString(), files: {} };
  files.forEach(function (f) {
    out.files[f.path] = { hash: f.hash, content: f.content || '', oldContent: f.oldContent || '', workDate: f.workDate instanceof Date ? f.workDate.toISOString() : (f.workDate || ''),
      change: f.change || '', mode: f.mode || '', type: f.type || '', obd: f.obd || 0, status: f.status, note: notesText(f.notes, 'en'),
      units: (f.units || []).map(function (u) { return { sheet: u.sheet, section: u.section, styleText: u.styleText, b3: u.b3 || '', d3: u.d3 || '', d4: u.d4 || '', j6: u.j6 || '', b11: u.b11 || '', rows: u.rows }; }) };
  });
  return out;
}
function loadScanStateJson(obj) {
  var by = {}; Object.keys((obj && obj.files) || {}).forEach(function (p) {
    var x = obj.files[p]; by[p] = Object.assign({}, x, { workDate: x.workDate ? new Date(x.workDate) : '' });
  });
  return by;
}
// ---------- one-time comparison with CheckMc (first deployment only) ----------
function loadCheckMc(aoa) {
  var H = aoa[0] || [], rows = aoa.slice(1), c = {};
  var shifted = rows.length && /^(added|changed|unchanged)$/i.test(String(rows[0][1]).trim()) && norm(H[1]) !== 'status';
  LAYOUT_H.forEach(function (n, i) { c[n] = shifted ? i : findCol(H, n); });       // CheckMc Data header is one column short
  var latest = {}, by = {};
  rows.forEach(function (r) {
    var key = (String(r[c['Customer']]).trim() + '|' + String(r[c['File Name']]).trim()).toUpperCase(), d = dayKey(r[c['WorkDate']]) || 0;
    if (latest[key] == null || d > latest[key]) { latest[key] = d; by[key] = {}; }
    if (d < latest[key]) return;
    var m = skey(r[c['Machine']]), q = +r[c['Qty']] || 0; if (m && q > 0) by[key][m] = (by[key][m] || 0) + q;
  });
  return { sets: by, n: Object.keys(by).length };
}
function compareCheckMc(files, ck, issues) {
  files.forEach(function (f) {
    if (f.status !== 'OK') return;
    var key = (customerOf(f.path) + '|' + f.name).toUpperCase(), old = ck.sets[key], now = unitsSet(f, null);
    if (!old) { f.ck = 'new'; return; }
    f.ck = sameSet(old, now) ? 'same' : 'diff';
    if (f.ck === 'diff') issues.push({ type: 'ckDiff', item: f.path, args: ['CheckMc: ' + setText(old) + '  →  ' + setText(now)] });
  });
}
function loadIndex(wb) {
  var S = sheetAoa(wb.Sheets['SCAN STATE']), L = sheetAoa(wb.Sheets['LAYOUT DATA']), by = {};
  if (!S.length) throw new Error('SCAN STATE missing');
  var h = S[0], ix = function (n) { return findCol(h, n); };
  S.slice(1).forEach(function (r) {
    by[r[ix('File Path')]] = { hash: r[ix('File Hash')], content: r[ix('Content Hash')], workDate: r[ix('WorkDate')], mode: r[ix('Mode')],
      type: r[ix('Layout Type')], obd: +r[ix('OBD')] || 0, status: r[ix('Result')], note: r[ix('Note')], units: [] };
  });
  var H = L[0] || [], c = {}; LAYOUT_H.forEach(function (n) { c[n] = findCol(H, n); });
  var um = {};
  L.slice(1).forEach(function (r) {
    var f = by[r[c['File Path']]]; if (!f) return;
    var get = function (n) { var v = r[c[n]]; return v == null ? '' : v; };
    if (get('Source Type') === 'PU1 48') {
      ['Ass', 'Prep'].forEach(function (sec) {
        var k = r[c['File Path']] + '|' + sec, q = +get(sec) || 0;
        if (!um[k]) { um[k] = { sheet: 'Man-Machine-' + sec, section: sec, styleText: String(get('B11')), j6: String(get('J6')), b11: String(get('B11')), b3: '', d3: '', d4: '', rows: [] }; f.units.push(um[k]); }
        if (q > 0) um[k].rows.push([String(get('Machine')), q, '']);
      });
    } else {
      var k = r[c['File Path']] + '|' + get('Sheet Name');
      if (!um[k]) { um[k] = { sheet: String(get('Sheet Name')), section: 'Std', b3: String(get('B3')), d3: String(get('D3')), d4: String(get('D4')), j6: '', b11: '', rows: [] };
        um[k].styleText = [um[k].b3, um[k].d3, um[k].d4].join('\n'); f.units.push(um[k]); }
      um[k].rows.push([String(get('Machine')), +get('Qty') || 0, String(get('Remark'))]);
    }
  });
  return by;
}
