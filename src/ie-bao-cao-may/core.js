// ===================== CORE (shared: page, worker, tests) =====================
var CFG = {
  // --- layout table extraction (standard layouts)
  excludeWords: ['template', 'obd', 'sam', 'strap', 'sheet', 'summary'],   // same as CheckMc
  skipSheetKeys: ['FTSC', 'FSTC'],         // sheets named F T S C (any spaces / separators, also F-S-T-C) are never scanned
  keepDefaultSheetN: true,                 // keep Sheet1, Sheet2 ...
  mcHeaders: ['m/c', 'm/cname', 'm/ctype'],
  qtyHeaders: ['1line', 'qty'],
  remarkWord: 'remark',
  requireRemark: true,                     // CheckMc: table needs a Remark column
  maxRows: 5000, maxCols: 60, stopAfterBlank: 1, stopWord: 'total',   // CheckMc: stop at first blank
  // --- Man-Machine layouts (Ass/Prep summary blocks)
  // Man-Machine sheets (letters/digits only). The combined sheet has Prep rows, an "Ass M/C" sub-header, then Ass rows (as Layout Check)
  mmSheets: { MANMACHINEASS: 'Ass', MANMACHINEPREP: 'Prep', MANMACHINEPREPASS: 'Prep', MANMACHINEPREPANDASS: 'Prep' },
  mmHeader: /^(prep|asb|ass|assy|assembly)m\/c$/,   // "Prep M/C", "Asb M/C", "Ass M/C"
  // --- machine database
  layoutRemark: 'sx',                      // REMARK written for rows coming from layouts
  costingRemark: 'costing',
  layoutRemarks: ['sx'],                   // existing REMARKs that mean "from layout" (replaceable)
  allowedVariants: ['', '48HC', '16HC', 'LN'],
  // special customers: style code kept exactly as written (no variant), e.g. SP31679V01, S2750WTR197, DS271CSPW102
  specialStyle: /\b(SP\d{5}V\d{2}|DS\d{3}[A-Z0-9]{5,}|[SF]2\d{3}[A-Z0-9]{3,})\b/g,
  onlyRelevant: true,                      // propose only styles in plan or already in DB
  skipFolders: ['old layout', '/old/', 'backup']   // folders not scanned (superseded copies)
};

function norm(v) { return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ''); }
function skey(s) { return String(s == null ? '' : s).toUpperCase().replace(/\s+/g, ''); }

// ---------- style names ----------
var STYLE_RE = /([A-Z]{3}\d{2})-(\d{5}(?:[._\/&+]\d{2,5})*)-(\d{4}(?:\s*[._\/&+-]\s*\d{2,4})*)\s*[(_]\s*([A-Z0-9]{2})\s*[)_]?/gi;
function expandStyles(text) {
  var out = [], t = String(text == null ? '' : text).toUpperCase(), m;
  STYLE_RE.lastIndex = 0;
  while ((m = STYLE_RE.exec(t))) {
    var cust = m[1], mids = m[2].split(/[._\/&+]/), sp = m[3].split(/[._\/&+-]/).map(function (x) { return x.trim(); }).filter(Boolean), size = m[4];
    var base = mids[0], ml = [base];
    for (var i = 1; i < mids.length; i++) ml.push(base.slice(0, 5 - mids[i].length) + mids[i]);     // 00115_116 -> 00116
    var sl = [sp[0]];
    for (var j = 1; j < sp.length; j++) sl.push(sp[0].slice(0, 4 - sp[j].length) + sp[j]);           // 3901.04 -> 3904
    ml.forEach(function (a) { sl.forEach(function (b) { var s = cust + '-' + a + '-' + b + '(' + size + ')'; if (out.indexOf(s) < 0) out.push(s); }); });
  }
  CFG.specialStyle.lastIndex = 0;
  while ((m = CFG.specialStyle.exec(t))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}
function isSpecial(s) { CFG.specialStyle.lastIndex = 0; var m = CFG.specialStyle.exec(skey(s)); return !!m && m[1] === skey(s); }
function splitFull(full) {                 // "ABC26-00001-1101(XX)48HC" -> base + variant; special codes have no variant
  var s = String(full).trim(), i = s.lastIndexOf(')');
  if (isSpecial(s)) return { base: skey(s), variant: '' };
  if (i < 0) return { base: skey(s), variant: '' };
  return { base: skey(s.slice(0, i + 1)), variant: s.slice(i + 1).trim() };
}
function detectVariant(text) {
  var t = String(text || '');
  if (/48\s*HC/i.test(t)) return '48HC';
  if (/16\s*HC/i.test(t)) return '16HC';
  return null;
}

// ---------- workbook extraction (runs in worker) ----------
function cellV(ws, r, c) { var x = ws[XLSX.utils.encode_cell({ r: r, c: c })]; return x ? (x.v == null ? '' : x.v) : ''; }
function cellT(ws, a) { var x = ws[a]; return x ? String(x.w != null ? x.w : (x.v != null ? x.v : '')) : ''; }
function excluded(sn) {
  if (CFG.skipSheetKeys.some(function (k) { return String(sn).toUpperCase().replace(/[^A-Z0-9]/g, '').indexOf(k) >= 0; })) return true;
  if (CFG.keepDefaultSheetN && /^sheet\d+$/i.test(sn.trim())) return false;
  var n = sn.toLowerCase();
  return CFG.excludeWords.some(function (w) { return n.indexOf(w) >= 0; });
}
function rangeOf(ws) {
  if (!ws['!ref']) return null;
  var R = XLSX.utils.decode_range(ws['!ref']);
  return { r0: R.s.r, c0: R.s.c, r1: Math.min(R.e.r, CFG.maxRows), c1: Math.min(R.e.c, CFG.maxCols) };
}
function readBlock(ws, R, hdrEnd, mcC, qC, rmC, out, bad) {
  var blanks = 0, rr = hdrEnd + 1;
  for (; rr <= R.r1; rr++) {
    var mc = cellV(ws, rr, mcC), n = norm(mc);
    if (n === '') { if (++blanks >= CFG.stopAfterBlank) break; continue; }
    blanks = 0;
    if (n.indexOf(CFG.stopWord) >= 0) break;
    var q = qC >= 0 ? cellV(ws, rr, qC) : '';
    var qn = typeof q === 'number' ? q : parseFloat(String(q).replace(',', '.'));
    var rm = rmC >= 0 ? String(cellV(ws, rr, rmC)) : '';
    if (q === '' || qn === 0) continue;                                              // blank/zero: skip (as CheckMc totals)
    if (!(qn > 0)) { bad.push(String(mc).trim() + ' qty=' + q); continue; }       // C4: text or negative qty
    out.push([String(mc).trim().toUpperCase(), qn, rm]);
  }
  return rr;
}
function findHdr(ws, r, R, from, test) {
  for (var c = from; c <= R.c1; c++) if (test(norm(cellV(ws, r, c)))) return c;
  return -1;
}
function extractStd(ws) {
  var out = [], bad = [], R = rangeOf(ws); if (!R) return { rows: out, bad: bad };
  for (var r = R.r0; r <= R.r1; r++) {
    for (var c = R.c0; c <= R.c1; c++) {
      if (CFG.mcHeaders.indexOf(norm(cellV(ws, r, c))) < 0) continue;
      var qC = -1;
      for (var h = 0; h < CFG.qtyHeaders.length && qC < 0; h++) {
        var want = CFG.qtyHeaders[h], eq = function (n) { return n === want; };
        qC = findHdr(ws, r, R, c + 1, eq); if (qC < 0) qC = findHdr(ws, r, R, R.c0, eq);
      }
      var hasRm = function (n) { return n.indexOf(CFG.remarkWord) >= 0; };
      var rmC = findHdr(ws, r, R, c + 1, hasRm); if (rmC < 0) rmC = findHdr(ws, r, R, R.c0, hasRm);
      if (qC < 0 || (CFG.requireRemark && rmC < 0)) continue;     // not a machine table
      r = readBlock(ws, R, r, c, qC, rmC, out, bad); break;
    }
  }
  return { rows: out, bad: bad };
}
function mmSection(n, dflt) { return /^prep/.test(n) ? 'Prep' : (/^(asb|ass)/.test(n) ? 'Ass' : dflt); }
function extractMM(ws, dflt) {        // returns rows per section; sub-headers switch section; up to 6 blank rows before a sub-header/Total
  var out = { Prep: [], Ass: [] }, bad = [], R = rangeOf(ws); if (!R) return { sections: out, bad: bad };
  for (var r = R.r0; r <= R.r1; r++) for (var c = R.c0; c <= R.c1; c++) {
    var h = norm(cellV(ws, r, c)); if (!CFG.mmHeader.test(h)) continue;
    var qC = -1, sec = mmSection(h, dflt);
    for (var cc = c + 1; cc <= Math.min(R.c1, c + 4); cc++) if (/^(qty|quantity|1line)/.test(norm(cellV(ws, r, cc)))) { qC = cc; break; }
    if (qC < 0) continue;
    for (var rr = r + 1; rr <= R.r1; rr++) {
      var mc = cellV(ws, rr, c), n = norm(mc);
      if (n === '') {                                   // gap: continue only if a sub-header or Total follows
        var k = rr + 1, nx = '';
        while (k <= Math.min(R.r1, rr + 6) && (nx = norm(cellV(ws, k, c))) === '') k++;
        if (nx && (CFG.mmHeader.test(nx) || nx.indexOf('total') === 0)) { rr = k - 1; continue; }
        break;
      }
      if (n.indexOf('total') === 0) break;
      if (CFG.mmHeader.test(n)) { sec = mmSection(n, sec); continue; }
      var q = cellV(ws, rr, qC), qn = typeof q === 'number' ? q : parseFloat(String(q).replace(',', '.'));
      if (q === '' || qn === 0) continue;
      if (!(qn > 0)) { bad.push(String(mc).trim() + ' qty=' + q); continue; }
      out[sec].push([String(mc).trim().toUpperCase(), qn, '']);
    }
    return { sections: out, bad: bad };
  }
  return { sections: out, bad: bad };
}
function mmStyleText(ws) {
  var t = cellT(ws, 'B11'); if (t) return t;
  var R = rangeOf(ws); if (!R) return '';
  for (var r = R.r0; r <= Math.min(R.r1, 20); r++) for (var c = 0; c <= 6; c++)
    if (/^po\s*number/i.test(String(cellV(ws, r, c)).trim())) for (var cc = c + 1; cc <= c + 4; cc++) { var v = cellV(ws, r, cc); if (v !== '') return String(v); }
  return '';
}
function scanMeta(ws, meta) {                      // layout type + OBD version from the top of a sheet
  var R = rangeOf(ws); if (!R) return;
  for (var r = R.r0; r <= Math.min(R.r1, R.r0 + 10); r++) for (var c = R.c0; c <= Math.min(R.c1, 25); c++) {
    var v = cellV(ws, r, c); if (typeof v !== 'string' || !v) continue;
    var t = v.trim();
    if (!meta.obd) { var m = t.match(/OBD\s*V(?:er)?\.?\s*(\d+)/i); if (m) meta.obd = +m[1]; }
    if (!meta.type) {
      if (/^layout\s*type$/i.test(t)) {
        var below = String(cellV(ws, r + 1, c)).trim(), right = String(cellV(ws, r, c + 1)).trim();
        var tv = /^(bulk|final|initial)/i.test(below) ? below : (/^(bulk|final|initial)/i.test(right) ? right : '');
        if (tv) meta.type = /initial/i.test(tv) ? 'Initial' : 'Bulk';
      } else if (/^(bulk|final|initial)(\s*layout)?$/i.test(t)) meta.type = /initial/i.test(t) ? 'Initial' : 'Bulk';
    }
  }
}
function sheetKey(s) { return String(s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function hiddenSheets(wb) { var h = {}; ((wb.Workbook && wb.Workbook.Sheets) || []).forEach(function (s) { if (s.Hidden) h[s.name] = 1; }); return h; }
function extractWorkbook(wb) {
  var res = { mode: 'std', units: [], bad: [], notes: [], type: '', obd: 0 }, meta = {}, hid = hiddenSheets(wb);
  wb = { SheetNames: wb.SheetNames.filter(function (s) { return !hid[s]; }), Sheets: wb.Sheets, Workbook: wb.Workbook };   // hidden sheets are skipped (as Layout Check)
  var mm = wb.SheetNames.filter(function (s) { return CFG.mmSheets[sheetKey(s)]; });
  if (mm.length) {
    res.mode = 'mm';
    mm.forEach(function (sn) {
      var ws = wb.Sheets[sn], got = extractMM(ws, CFG.mmSheets[sheetKey(sn)]);
      scanMeta(ws, meta);
      got.bad.forEach(function (b) { res.bad.push(sn + ': ' + b); });
      ['Prep', 'Ass'].forEach(function (sec) {
        if (got.sections[sec].length || sheetKey(sn) === 'MANMACHINE' + sec.toUpperCase())
          res.units.push({ sheet: sn, section: sec, styleText: mmStyleText(ws), j6: cellT(ws, 'J6').trim(), b11: cellT(ws, 'B11').trim(), b3: '', d3: '', d4: '', rows: got.sections[sec] });
      });
    });
    var other = wb.SheetNames.filter(function (s) { return !CFG.mmSheets[sheetKey(s)] && !excluded(s) && extractStd(wb.Sheets[s]).rows.length; });
    if (other.length) res.notes.push(['mmIgnored', other.join(', ')]);
  } else {
    wb.SheetNames.forEach(function (sn) {
      if (excluded(sn)) return;
      var ws = wb.Sheets[sn], got = extractStd(ws);
      got.bad.forEach(function (b) { res.bad.push(sn + ': ' + b); });
      if (!got.rows.length) return;
      scanMeta(ws, meta);
      var b3 = cellT(ws, 'B3').trim(), d3 = cellT(ws, 'D3').trim(), d4 = cellT(ws, 'D4').trim();
      res.units.push({ sheet: sn, section: 'Std', styleText: [b3, d3, d4].join('\n'), b3: b3, d3: d3, d4: d4, j6: '', b11: '', rows: got.rows });
    });
  }
  res.type = meta.type || ''; res.obd = meta.obd || 0;
  return res;
}
function contentKey(units) {          // machine-only fingerprint: section + machine:qty (sheet names, style text, formatting ignored)
  return units.map(function (u) {
    var m = {}; u.rows.forEach(function (r) { m[r[0]] = (m[r[0]] || 0) + (+r[1] || 0); });
    return u.section + '|' + Object.keys(m).sort().map(function (k) { return k + ':' + (+m[k]).toFixed(4); }).join(',');
  }).sort().join('#');
}
