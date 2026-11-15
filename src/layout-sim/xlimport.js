/* xlimport.js: open a layout Excel file (.xlsx/.xlsm) and read the layout drawn with shapes (machine code box + operation number box),
   exactly, without OCR. Also reads the operation sequence text boxes ("41=>43=>45..."). Runs in the browser, nothing is sent anywhere. */
var XLI = null;   // {name, sheets: [{name, hidden, drawing}], sheet, layouts, seqs}

function xlFile(z, p) { var e = XLSX.CFB.find(z, '/' + p.replace(/^\/+/, '')); return e && e.content ? new TextDecoder().decode(e.content) : null; }
function xlDoc(s) { return s ? new DOMParser().parseFromString(s, 'application/xml') : null; }
function xlKids(el, name) { var out = []; for (var i = 0; i < el.childNodes.length; i++) { var c = el.childNodes[i]; if (c.nodeType === 1 && c.localName === name) out.push(c); } return out; }
function xlKid(el, name) { return el ? xlKids(el, name)[0] || null : null; }
function xlAll(el, name) { return el ? [].slice.call(el.getElementsByTagNameNS('*', name)) : []; }
function xlResolve(baseDir, target) {
  if (target.charAt(0) === '/') return target.slice(1);
  var parts = (baseDir + target).split('/'), out = [];
  parts.forEach(function (p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
  return out.join('/');
}
function xlRels(z, path) {   // relationships of a part: {rId: path}
  var dir = path.replace(/[^/]*$/, ''), file = path.slice(dir.length), d = xlDoc(xlFile(z, dir + '_rels/' + file + '.rels')), m = {};
  if (d) xlAll(d, 'Relationship').forEach(function (r) { m[r.getAttribute('Id')] = { path: xlResolve(dir, r.getAttribute('Target')), type: r.getAttribute('Type') || '' }; });
  return m;
}
/* sheets that have a drawing */
function xlSheets(z) {
  var wb = xlDoc(xlFile(z, 'xl/workbook.xml')), rels = xlRels(z, 'xl/workbook.xml'), out = [];
  if (!wb) throw new Error('workbook.xml');
  xlAll(wb, 'sheet').forEach(function (sh) {
    var rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'), r = rels[rid];
    if (!r) return;
    var srels = xlRels(z, r.path), dr = Object.keys(srels).map(function (k) { return srels[k]; }).filter(function (x) { return /\/drawing$/.test(x.type); })[0];
    if (dr) out.push({ name: sh.getAttribute('name'), hidden: (sh.getAttribute('state') || 'visible') !== 'visible', drawing: dr.path });
  });
  return out;
}
/* all shapes with text, in pixels on the sheet (group transforms applied, 90° rotations swap width/height) */
function xlShapes(xml) {
  var d = xlDoc(xml), out = [], E = 9525;
  if (!d) return out;
  function xf(el) { var p = xlKid(el, 'spPr') || xlKid(el, 'grpSpPr'); return p ? xlKid(p, 'xfrm') : null; }
  function num(el, a) { return el ? +el.getAttribute(a) || 0 : 0; }
  function walk(el, T) {
    xlKids(el, 'sp').concat(xlKids(el, 'cxnSp')).forEach(function (sp) {
      var x = xf(sp); if (!x) return;
      var o = xlKid(x, 'off'), e = xlKid(x, 'ext'), rot = num(x, 'rot');
      var p0 = T(num(o, 'x'), num(o, 'y')), p1 = T(num(o, 'x') + num(e, 'cx'), num(o, 'y') + num(e, 'cy'));
      var x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x), y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y);
      if (rot === 5400000 || rot === 16200000) { var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0; x0 = cx - h / 2; x1 = cx + h / 2; y0 = cy - w / 2; y1 = cy + w / 2; }
      var text = xlAll(sp, 'p').map(function (pp) { return xlAll(pp, 't').map(function (tt) { return tt.textContent; }).join(''); }).join(' ').replace(/\s+/g, ' ').trim();
      out.push({ kind: sp.localName, text: text, x0: x0 / E, y0: y0 / E, x1: x1 / E, y1: y1 / E });
    });
    xlKids(el, 'grpSp').forEach(function (g) {
      var x = xf(g); if (!x) return walk(g, T);
      var o = xlKid(x, 'off'), e = xlKid(x, 'ext'), co = xlKid(x, 'chOff'), ce = xlKid(x, 'chExt');
      var ox = num(o, 'x'), oy = num(o, 'y'), sx = num(ce, 'cx') ? num(e, 'cx') / num(ce, 'cx') : 1, sy = num(ce, 'cy') ? num(e, 'cy') / num(ce, 'cy') : 1, cx0 = num(co, 'x'), cy0 = num(co, 'y');
      walk(g, function (px, py) { return T(ox + (px - cx0) * sx, oy + (py - cy0) * sy); });
    });
  }
  xlKids(d.documentElement, 'twoCellAnchor').concat(xlKids(d.documentElement, 'oneCellAnchor'), xlKids(d.documentElement, 'absoluteAnchor'))
    .forEach(function (a) { walk(a, function (x, y) { return { x: x, y: y }; }); });
  return out;
}
/* a machine code: in the library; or, unknown, with letters and digits (e.g. 1SLX); 4 letters only when no library is loaded */
var XL_NOT_CODES = { SMNT: 1, SNOW: 1, NOTE: 1, LINE: 1, CODE: 1 };
function xlIsCode(cl) {
  if (LIB.codes[cl]) return true;
  if (XL_NOT_CODES[cl]) return false;
  if (/[A-Z]/.test(cl) && /\d/.test(cl)) return true;
  return !codeList().length && /^[A-Z]{4}$/.test(cl);
}
var OPS_RE = /^\d{1,3}[a-z]?(\s*[\/+,&]\s*\d{1,3}[a-z]?)*$/i;
/* machine boxes paired with the operation box touching them, grouped into layouts (blocks separated by empty space) and rows */
function xlLayouts(shapes) {
  var codes = [], nums = [];
  shapes.forEach(function (s) {
    if (s.kind !== 'sp' || !s.text) return;
    var t0 = s.text.trim(), cl = t0.toUpperCase().replace(/[^A-Z0-9]/g, '');
    s.cx = (s.x0 + s.x1) / 2; s.cy = (s.y0 + s.y1) / 2; s.w = s.x1 - s.x0; s.h = s.y1 - s.y0;
    if (OPS_RE.test(t0)) { s.op = t0.replace(/\s+/g, ''); nums.push(s); }
    else if (cl.length === 4 && t0.replace(/\s/g, '').length <= 5 && xlIsCode(cl)) { s.code = cl; codes.push(s); }
  });
  var st = [];
  codes.forEach(function (c) {
    var best = null, bd = Infinity;
    nums.forEach(function (n) {
      if (n.used) return;
      var ov = Math.min(c.x1, n.x1) - Math.max(c.x0, n.x0); if (ov < 0.5 * Math.min(c.w, n.w)) return;
      var gb = n.y0 - c.y1, ga = c.y0 - n.y1, g = Math.abs(gb) < Math.abs(ga) ? gb : ga;
      if (Math.abs(g) > 0.4 * Math.max(c.h, n.h)) return;
      var d = Math.abs(g) + Math.abs(n.cx - c.cx) * 0.1; if (d < bd) { bd = d; best = n; }
    });
    if (best) best.used = true;
    var y0 = best ? Math.min(c.y0, best.y0) : c.y0, y1 = best ? Math.max(c.y1, best.y1) : c.y1;
    st.push({ code: c.code, op: best ? best.op : '', side: best ? (best.cy < c.cy ? 'top' : 'bottom') : null, cx: c.cx, x0: c.x0, x1: c.x1, w: c.w, cy: (y0 + y1) / 2, y0: y0, y1: y1, h: y1 - y0 });
  });
  if (!st.length) return [];
  var medW = median(st.map(function (s) { return s.w; })), medH = median(st.map(function (s) { return s.h; }));
  // blocks: stations connected when close in both directions
  var par = st.map(function (s, i) { return i; });
  function f(i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }
  for (var i = 0; i < st.length; i++) for (var j = i + 1; j < st.length; j++) {
    var a = st[i], b = st[j], gx = Math.max(0, Math.abs(a.cx - b.cx) - (a.w + b.w) / 2), dy = Math.abs(a.cy - b.cy);
    if (gx <= 1.2 * medW && dy <= 2.4 * medH) par[f(i)] = f(j);   // rows of one layout (branch + main rows included)
  }
  var groups = {};
  st.forEach(function (s, i) { var r = f(i); (groups[r] = groups[r] || []).push(s); });
  var out = Object.keys(groups).map(function (k) { return groups[k]; }).filter(function (g) { return g.length >= 3; }).map(function (g) {
    g.sort(function (a, b) { return a.cy - b.cy; });
    var rows = [];
    g.forEach(function (s) { var r = rows[rows.length - 1]; if (r && Math.abs(s.cy - r.cy) < medH * 0.5) { r.items.push(s); r.cy = (r.cy * (r.items.length - 1) + s.cy) / r.items.length; } else rows.push({ cy: s.cy, items: [s] }); });
    var x0 = Math.min.apply(null, g.map(function (s) { return s.x0; })), k = 107 / (median(g.map(function (s) { return s.w; })) || 1);
    var prow = rows.map(function (r) {
      r.items.sort(function (a, b) { return a.cx - b.cx; });
      var up = r.items.filter(function (s) { return s.side === 'top'; }).length, dn = r.items.filter(function (s) { return s.side === 'bottom'; }).length;
      var side = up || dn ? (up >= dn ? 'top' : 'bottom') : null;
      return { cy: r.cy, side: side, sideFound: !!side, cells: r.items.map(function (s, ci) { return { col: ci, code: s.code, op: s.op, side: s.side || side || 'top', x: (s.cx - x0) * k }; }) };
    });
    return { rows: prow, n: g.length, x0: x0, y0: Math.min.apply(null, g.map(function (s) { return s.y0; })), x1: Math.max.apply(null, g.map(function (s) { return s.x1; })), y1: Math.max.apply(null, g.map(function (s) { return s.y1; })), stations: g };
  });
  out.sort(function (a, b) { return a.y0 - b.y0 || a.x0 - b.x0; });
  return out;
}
/* operation sequences written in text boxes: "41=>43=>45", with the name in the box on its left ("Cụm bát áo") */
function xlSeqs(shapes) {
  var seqs = [], seen = {};
  shapes.forEach(function (s) {
    if (!/(=>|->|→)/.test(s.text || '')) return;
    var txt = s.text.replace(/\s+/g, ''); if (seen[txt]) return; seen[txt] = 1;
    var cy = (s.y0 + s.y1) / 2, h = s.y1 - s.y0, name = '';
    shapes.forEach(function (o) {
      if (o === s || !o.text || /(=>|->|→)/.test(o.text)) return;
      var ocy = (o.y0 + o.y1) / 2;
      if (Math.abs(ocy - cy) < h * 0.8 && o.x1 <= s.x0 + 5 && s.x0 - o.x1 < 200 && !OPS_RE.test(o.text.trim())) name = o.text.trim();
    });
    seqs.push({ name: name, text: s.text.trim(), y: s.y0 });
  });
  // "Cụm lắp ráp" is often a title above the assembly sequence box
  seqs.forEach(function (q) { if (!q.name && /QC|PACK/i.test(q.text)) q.name = (shapes.filter(function (o) { return /lắp ráp|lap rap|assembly/i.test(o.text || ''); })[0] || {}).text || ''; });
  seqs.sort(function (a, b) { return a.y - b.y; });
  return seqs;
}

/* ---------- layouts written in cells: a row of machine codes with the operation numbers in the row above or below ---------- */
var XL_SKIP_SHEETS = /template|obd|\bsam\b|summary|type machine|needle|costing|calculation/i;
function xlCellLayouts(ws) {
  if (!ws || !ws['!ref']) return [];
  var R = XLSX.utils.decode_range(ws['!ref']), r1 = Math.min(R.e.r, 3000), c1 = Math.min(R.e.c, 120), segs = [];
  function txt(r, c) { var x = ws[XLSX.utils.encode_cell({ r: r, c: c })]; return x && x.v != null ? String(x.w != null ? x.w : x.v).trim() : ''; }
  function isC(v) { var cl = v.toUpperCase().replace(/[^A-Z0-9]/g, ''); return cl.length === 4 && v.replace(/\s/g, '').length <= 5 && xlIsCode(cl); }
  for (var r = R.s.r; r <= r1; r++) {           // runs of 3+ codes side by side (gaps of up to 4 empty columns)
    var run = [], last = -9;
    for (var c = R.s.c; c <= c1 + 5; c++) {
      var v = c <= c1 ? txt(r, c) : '';
      if (v && isC(v)) { if (c - last > 5 && run.length) { if (run.length >= 3) segs.push({ r: r, c0: run[0], c1: run[run.length - 1], n: run.length }); run = []; } run.push(c); last = c; }
      else if (c - last > 5 && run.length) { if (run.length >= 3) segs.push({ r: r, c0: run[0], c1: run[run.length - 1], n: run.length }); run = []; }
    }
    if (run.length >= 3) segs.push({ r: r, c0: run[0], c1: run[run.length - 1], n: run.length });   // a run that reaches the last columns
  }
  var blocks = [];   // segments on nearby rows that overlap in columns form one layout
  segs.forEach(function (sg) {
    var b = blocks.filter(function (x) { return sg.r - x.r1 <= 4 && sg.c0 <= x.c1 + 2 && sg.c1 >= x.c0 - 2; })[0];
    if (b) { b.r1 = sg.r; b.c0 = Math.min(b.c0, sg.c0); b.c1 = Math.max(b.c1, sg.c1); b.n += sg.n; } else blocks.push({ r0: sg.r, r1: sg.r, c0: sg.c0, c1: sg.c1, n: sg.n });
  });
  return blocks.map(function (b) {
    var lines = [];
    for (var rr = Math.max(R.s.r, b.r0 - 1); rr <= b.r1 + 1; rr++) { var cells = []; for (var cc = b.c0; cc <= b.c1; cc++) { var v = txt(rr, cc); cells.push(/^#/.test(v) ? '' : v); } lines.push(cells.join('\t')); }
    var tsv = lines.join('\n') + '\n', p = parsePaste(tsv);
    var withOp = 0; p.rows.forEach(function (r) { r.cells.forEach(function (c) { if (OPS_RE.test(String(c.op || '').trim())) withOp++; }); });
    return { cells: true, tsv: tsv, rows: p.rows, n: p.nMc, withOp: withOp, ref: XLSX.utils.encode_range({ s: { r: b.r0, c: b.c0 }, e: { r: b.r1, c: b.c1 } }) };
  }).filter(function (l) { return l.n >= 3 && l.withOp >= l.n * 0.6 && l.rows.length <= 8; });   // a real layout has operation numbers next to its machines (not a code / group table)
}
/* ---------- operation table of a layout / OBD sheet: operation number, machine type, SAM ----------
   header row with a "SAM" / "SMV" cell; the operation column is the numeric column left of it that matches the layout's numbers best */
function xlOpsTables(ws, layoutOps) {
  var out = {};
  if (!ws || !ws['!ref']) return out;
  var R = XLSX.utils.decode_range(ws['!ref']), r1 = Math.min(R.e.r, 1500), c1 = Math.min(R.e.c, 40);
  function v(r, c) { var x = ws[XLSX.utils.encode_cell({ r: r, c: c })]; return x && x.v != null ? String(x.w != null ? x.w : x.v).trim() : ''; }
  function num(r, c) { var x = ws[XLSX.utils.encode_cell({ r: r, c: c })]; if (!x || x.v == null || x.v === '') return NaN; return typeof x.v === 'number' ? x.v : parseFloat(String(x.v).replace(',', '.')); }
  var want = {}; (layoutOps || []).forEach(function (o) { want[String(o)] = 1; });
  for (var r = R.s.r; r <= r1; r++) {
    var samC = -1, mcC = -1, optrC = -1, mcnC = -1, opHdr = false;
    for (var c = 0; c <= c1; c++) {   // a header may take two rows ("Factory" / "SMV"); a "SAM:" label of the sheet header is not a column
      var h1 = v(r, c).toLowerCase(), h = (h1 + ' ' + v(r + 1, c).toLowerCase()).trim();
      if (samC < 0 && h1.indexOf(':') < 0 && (/^(sam|smv)(\s*\/\s*(sam|smv))?\b/.test(h1) || /sam\s*\/\s*smv|factory\s*smv/.test(h))) samC = c;
      if (mcC < 0 && /m\/c\s*type|machine\s*type|loại máy/.test(h)) mcC = c;
      if (optrC < 0 && /arrange\.?\s*optr/.test(h)) optrC = c;
      if (mcnC < 0 && /no\.?\s*(of\s*)?m\/?c\b|số\s*máy|qty\s*(of\s*)?m\/?c|m\/c\s*qty/.test(h)) mcnC = c;
      if (/^squ\b|op\.?\s*no|operation|công đoạn|op\s*code/.test(h1)) opHdr = true;
    }
    if (samC < 0 || !(opHdr || mcC >= 0)) continue;
    var best = -1, bs = -1;   // the operation column: best overlap with the layout numbers among numeric columns left of SAM
    for (c = 0; c < samC; c++) {
      var n = 0, hit = 0;
      for (var rr = r + 1; rr <= Math.min(r1, r + 120); rr++) { var x = num(rr, c); if (isFinite(x) && x > 0 && x < 1000 && Math.round(x) === x) { n++; if (want[String(x)]) hit++; } }
      var sc = hit * 10 + n; if (n >= 2 && sc > bs) { bs = sc; best = c; }
    }
    if (best < 0) continue;
    // "Arrange. Optr / CN sắp xếp": a cell merged over several operations = those operations done together by that many people
    var merges = ws['!merges'] || [], last = null, idx = 0;
    var mergeAt = function (row) { for (var i = 0; i < merges.length; i++) { var m = merges[i]; if (m.s.c <= optrC && m.e.c >= optrC && m.s.r <= row && m.e.r >= row && m.e.r > m.s.r) return m; } return null; };
    for (rr = r + 1; rr <= Math.min(r1, r + 200); rr++) {
      if (/total|tổng/i.test(v(rr, 0)) || /^total|^subtotal/i.test(v(rr, samC - 1))) break;
      var op = num(rr, best), sam = num(rr, samC);
      if (!isFinite(op) || !isFinite(sam) || sam <= 0) {
        // a row without operation number but with arranged people (an extra machine of the operation above): added to it
        if (!isFinite(op) && last && optrC >= 0 && !mergeAt(rr) && isFinite(num(rr, optrC)) && num(rr, optrC) > 0 && out[last] && out[last].ag === last) out[last].ar = Math.round((out[last].ar + num(rr, optrC)) * 1000) / 1000;
        continue;
      }
      var k = String(op);
      if (out[k]) continue;
      var arr = null, ag = k;
      if (optrC >= 0) {
        var mg = mergeAt(rr);
        if (mg) { ag = 'm' + XLSX.utils.encode_range(mg); arr = num(mg.s.r, optrC); }
        else arr = num(rr, optrC);
        if (!isFinite(arr)) arr = mg ? 0 : null;
      }
      out[k] = { sam: Math.round(sam * 10000) / 10000, mc: mcC >= 0 ? v(rr, mcC).split(/\s/)[0] : '', optr: arr, ar: arr, ag: ag, ai: idx++, mcn: mcnC >= 0 && isFinite(num(rr, mcnC)) ? num(rr, mcnC) : null };
      last = k;
    }
    r += 2;
  }
  return out;
}
/* sequences typed in cells ("Work Flow: 31=>32=>33=>97") */
function xlCellSeqs(ws) {
  var out = [];
  if (!ws || !ws['!ref']) return out;
  var R = XLSX.utils.decode_range(ws['!ref']);
  for (var r = R.s.r; r <= Math.min(R.e.r, 1500); r++) for (var c = R.s.c; c <= Math.min(R.e.c, 60); c++) {
    var x = ws[XLSX.utils.encode_cell({ r: r, c: c })]; if (!x || typeof x.v !== 'string' || !/(=>|->|→)/.test(x.v)) continue;
    if ((x.v.match(/\d{1,3}/g) || []).length < 2) continue;
    var name = '';
    for (var k = c - 1; k >= Math.max(0, c - 4) && !name; k--) { var y = ws[XLSX.utils.encode_cell({ r: r, c: k })]; if (y && y.v != null && String(y.v).trim() && !/(=>|->)/.test(String(y.v))) name = String(y.v).trim(); }
    out.push({ name: /work\s*flow|trình tự/i.test(name) ? '' : name, text: x.v.replace(/\s+/g, ' ').trim(), y: r });
  }
  return out;
}
/* ---------- style name and header info of the layout sheet (same rules as IE Báo cáo máy / Layout Check) ---------- */
var XL_STYLE_RE = /([A-Z]{3}\d{2})-(\d{5}(?:[._\/&+]\d{2,5})*)-(\d{4}(?:\s*[._\/&+-]\s*\d{2,4})*)\s*(?:[(_]\s*([A-Z0-9]{2})\s*[)_]?|([A-Z][A-Z0-9]|\d[A-Z])(?![A-Z0-9]))/gi;   // size in brackets, after _, or stuck to the number (3808XX)
var XL_SPECIAL_RE = /\b(SP\d{5}V\d{2}|DS\d{3}[A-Z0-9]{5,}|[SF]2\d{3}[A-Z0-9]{3,})\b/g;
/* "ABC25-00013-1103(MB)", combined forms expanded: 00115_116 -> 00115, 00116; 3901.04 -> 3901, 3904; special customer codes kept as written */
function xlExpandStyles(text) {
  var out = [], tt = String(text == null ? '' : text).toUpperCase(), m;
  XL_STYLE_RE.lastIndex = 0;
  while ((m = XL_STYLE_RE.exec(tt))) {
    var cust = m[1], mids = m[2].split(/[._\/&+]/), sp = m[3].split(/[._\/&+-]/).map(function (x) { return x.trim(); }).filter(Boolean), size = m[4] || m[5];
    var ml = [mids[0]]; for (var i = 1; i < mids.length; i++) ml.push(mids[0].slice(0, 5 - mids[i].length) + mids[i]);
    var sl = [sp[0]]; for (var j = 1; j < sp.length; j++) sl.push(sp[0].slice(0, 4 - sp[j].length) + sp[j]);
    ml.forEach(function (a) { sl.forEach(function (b) { var st = cust + '-' + a + '-' + b + '(' + size + ')'; if (out.indexOf(st) < 0) out.push(st); }); });
  }
  XL_SPECIAL_RE.lastIndex = 0;
  while ((m = XL_SPECIAL_RE.exec(tt))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}
function xlVariant(text) { var tt = String(text || ''); return /48\s*HC/i.test(tt) ? '48HC' : /16\s*HC/i.test(tt) ? '16HC' : ''; }
/* header of a layout sheet: the cells B3, D3, D4, B11 (as Layout Check) and the top rows; then the file name */
function xlSheetInfo(ws, sheetName, fileName) {
  var info = { styles: [], style: '', optr: '', sam: '', obd: '', line: '' };
  if (ws) {
    var cells = [], cv = function (r, c) { var x = ws[XLSX.utils.encode_cell({ r: r, c: c })]; return x ? String(x.w != null ? x.w : (x.v != null ? x.v : '')).trim() : ''; };
    ['B3', 'D3', 'D4', 'B11'].forEach(function (a) { var x = ws[a]; if (x) cells.push(String(x.w || x.v || '')); });
    for (var r = 0; r < 14; r++) for (var c = 0; c < 16; c++) {
      var v = cv(r, c); if (!v) continue; cells.push(v);
      var nx = ''; for (var k = c + 1; k < c + 6 && !nx; k++) nx = cv(r, k);
      if (/tổng số công nhân|tl\s*optr/i.test(v) && !info.optr) info.optr = nx;
      if (/^\s*sam\s*:?\s*$/i.test(v) && !info.sam) info.sam = nx;
      if (/ver\s*\/\s*phiên bản/i.test(v) && !info.obd) info.obd = (v.split(':')[1] || nx).trim();
      if (/line no|chuyền\s*:/i.test(v) && !info.line && nx && !/ver|phiên bản|sam/i.test(nx)) info.line = nx;
      if (/target\s*output|line target ou/i.test(v) && !info.target) info.target = parseFloat(nx) || '';
      if (/target\s*efficiency|line target ef/i.test(v) && !info.eff) info.eff = parseFloat(nx) || '';
    }
    info.styles = xlExpandStyles(cells.join(' \n '));
  }
  if (!info.styles.length) info.styles = xlExpandStyles(sheetName + ' ' + fileName);
  var vr = xlVariant(sheetName + ' ' + fileName);
  info.style = info.styles.length ? info.styles.join(' / ') + (vr && !/\d$/.test(info.styles[0]) ? vr : '') : '';
  return info;
}
/* ---------- UI (inside the paste window) ---------- */
function xlOpen(f) {
  var st = document.getElementById('ocrStatus');
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var z = XLSX.CFB.read(new Uint8Array(rd.result), { type: 'array' }), sheets = xlSheets(z);
      XLI = { name: f.name, z: z, sheets: [] };
      sheets.forEach(function (s) {
        var shapes = xlShapes(xlFile(z, s.drawing)), lays = xlLayouts(shapes);
        if (lays.length) XLI.sheets.push({ name: s.name, hidden: s.hidden, layouts: lays, seqs: xlSeqs(shapes) });
      });
      var wb = null;   // cells: layouts written in cells, style, workers, SAM, OBD version
      try { wb = XLSX.read(new Uint8Array(rd.result), { type: 'array' }); } catch (e2) { console.warn('cells', e2); }
      if (wb) wb.SheetNames.forEach(function (sn, k) {
        if (XL_SKIP_SHEETS.test(sn)) return;
        var cl = xlCellLayouts(wb.Sheets[sn]); if (!cl.length) return;
        var hid = !!(wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[k] && wb.Workbook.Sheets[k].Hidden);
        var ex = XLI.sheets.filter(function (s) { return s.name === sn; })[0];
        if (ex) ex.layouts = ex.layouts.concat(cl); else XLI.sheets.push({ name: sn, hidden: hid, layouts: cl, seqs: [] });
      });
      XLI.sheets.forEach(function (s) { s.info = xlSheetInfo(wb && wb.Sheets[s.name], s.name, f.name); });
      // SAM table: the layout's own sheet first, other sheets fill the missing operations; sequences typed in cells too
      if (wb) XLI.sheets.forEach(function (s) {
        var ops = []; s.layouts.forEach(function (l) { (l.cells ? parsePaste(l.tsv).rows : l.rows).forEach(function (r) { r.cells.forEach(function (c) { String(c.op || '').split(/[\/+,&]/).forEach(function (o) { if (o.trim()) ops.push(o.trim()); }); }); }); });
        s.ops = xlOpsTables(wb.Sheets[s.name], ops);
        wb.SheetNames.forEach(function (sn) { if (sn === s.name) return; var o2 = xlOpsTables(wb.Sheets[sn], ops); Object.keys(o2).forEach(function (k) { if (!s.ops[k] && ops.indexOf(k) >= 0) s.ops[k] = o2[k]; }); });
        var seen = {}; s.seqs.forEach(function (q) { seen[q.text.replace(/\s/g, '')] = 1; });
        xlCellSeqs(wb.Sheets[s.name]).forEach(function (q) { if (!seen[q.text.replace(/\s/g, '')]) { seen[q.text.replace(/\s/g, '')] = 1; s.seqs.push(q); } });
      });
      // operation tables (machine type per operation) + sequence without a drawn layout: candidates for an automatic layout
      XLI.auto = [];
      if (wb) wb.SheetNames.forEach(function (sn, k) {
        if (/template/i.test(sn)) return;
        var ops = xlOpsTables(wb.Sheets[sn], []), n = Object.keys(ops).filter(function (o) { return autoCode(ops[o].mc); }).length; if (n < 3) return;
        var hid = !!(wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[k] && wb.Workbook.Sheets[k].Hidden);
        var ex = XLI.sheets.filter(function (s) { return s.name === sn; })[0], dr = sheets.filter(function (s) { return s.name === sn; })[0];
        var seqs = ex ? ex.seqs.slice() : (dr ? xlSeqs(xlShapes(xlFile(z, dr.drawing))) : []), seen = {};
        seqs.forEach(function (q) { seen[q.text.replace(/\s/g, '')] = 1; });
        xlCellSeqs(wb.Sheets[sn]).forEach(function (q) { if (!seen[q.text.replace(/\s/g, '')]) { seen[q.text.replace(/\s/g, '')] = 1; seqs.push(q); } });
        XLI.auto.push({ name: sn, hidden: hid, ops: ops, seqs: seqs, info: xlSheetInfo(wb.Sheets[sn], sn, f.name) });
      });
      if (!XLI.sheets.length && !XLI.auto.length) { st.className = 'small t-warn tagline'; st.textContent = t('xlNone', [f.name]); return; }
      document.getElementById('ocrView').innerHTML = '';
      var sel = document.getElementById('xlPick');
      sel.innerHTML = XLI.sheets.map(function (s, i) {
        return s.layouts.map(function (l, j) { return '<option value="' + i + ':' + j + '">' + esc((s.info.style && s.name.toUpperCase().indexOf(s.info.style.toUpperCase()) < 0 ? s.info.style + ' · ' : '') + s.name + (s.hidden ? ' (' + t('xlHidden') + ')' : '') + ' · ' + t('xlLay', [j + 1, l.rows.length, l.n]) + (l.cells ? ' · ' + t('xlCells', [l.ref]) : '')) + '</option>'; }).join('');
      }).join('') + XLI.auto.map(function (a, k) {
        var r = autoRows(a.ops, a.seqs, false);
        return '<option value="a:' + k + '">' + esc('⚙ ' + t('xlAutoOpt', [a.name + (a.hidden ? ' (' + t('xlHidden') + ')' : ''), r.nOps, r.nMc, r.nLines])) + '</option>';
      }).join('');
      document.getElementById('xlBox').style.display = '';
      xlFillBranchPick();
      // the visible sheet with the most machines first
      var bi = 0, bn = -1; [].forEach.call(sel.options, function (o, k) { var p = o.value.split(':'); if (p[0] === 'a') { if (bn < 0 && !XLI.auto[+p[1]].hidden) { bn = 0; bi = k; } return; } var s = XLI.sheets[+p[0]]; if (!s.hidden && s.layouts[+p[1]].n > bn) { bn = s.layouts[+p[1]].n; bi = k; } });
      sel.selectedIndex = bi; xlUse();
    } catch (e) { console.error(e); st.className = 'small t-bad tagline'; st.textContent = t('xlErr') + ': ' + e.message; }
  };
  rd.readAsArrayBuffer(f);
}
/* the rows of a layout as paste rows (zone set by the caller) */
function xlRows(lay) {
  if (lay.cells) return parsePaste(lay.tsv).rows;
  return lay.rows.map(function (r) { return { side: r.side || 'top', sideFound: r.sideFound, cells: r.cells.map(function (c) { return Object.assign({}, c); }) }; });
}
function xlFillBranchPick() {
  var sel = document.getElementById('xlPickB'), on = !!centerOf('branch');
  document.getElementById('xlBranch').style.display = on ? '' : 'none';
  if (!on) { sel.value = ''; return; }
  sel.innerHTML = '<option value="">' + esc(t('xlBranchNone')) + '</option>' + [].filter.call(document.getElementById('xlPick').options, function (o) { return !/^a:/.test(o.value); }).map(function (o) { return o.outerHTML; }).join('');
}
function xlUse() {
  if (/^a:/.test(document.getElementById('xlPick').value)) { document.getElementById('xlPickB').value = ''; xlAuto(+document.getElementById('xlPick').value.slice(2)); return; }
  var pb = document.getElementById('xlPickB').value;
  if (pb) {   // two layouts: the one chosen for the main line + another one on the branch line
    var p1 = document.getElementById('xlPick').value.split(':'), p2 = pb.split(':'), s1 = XLI.sheets[+p1[0]], s2 = XLI.sheets[+p2[0]];
    var main = xlRows(s1.layouts[+p1[1]]).map(function (r) { r.zone = 'main'; return r; }), br = xlRows(s2.layouts[+p2[1]]).map(function (r) { r.zone = 'branch'; return r; });
    var rows = ((ST.line.branch || {}).pos === 'bottom' ? main.concat(br) : br.concat(main));
    PASTE = { rows: rows, nCols: 0, nMc: rows.reduce(function (a, r) { return a + r.cells.length; }, 0), fromXl: true, seq: s1.seqs.length ? s1.seqs : s2.seqs,
      meta: { style: s1.info.style, file: XLI.name, sheet: s1.name, optr: s1.info.optr, sam: s1.info.sam, obd: s1.info.obd, target: s1.info.target, eff: s1.info.eff }, ops: Object.assign({}, s2.ops, s1.ops) };
    var stb = document.getElementById('ocrStatus'); stb.className = 'small'; stb.textContent = t('xlTwo', [PASTE.nMc]);
    document.getElementById('ocrView').innerHTML = '';
    renderPastePreview(); return;
  }
  var p = document.getElementById('xlPick').value.split(':'), sh = XLI.sheets[+p[0]], lay = sh.layouts[+p[1]];
  var meta = { style: sh.info.style, file: XLI.name, sheet: sh.name, optr: sh.info.optr, sam: sh.info.sam, obd: sh.info.obd, target: sh.info.target, eff: sh.info.eff };
  var st0 = document.getElementById('ocrStatus'); st0.className = 'small';
  if (lay.cells) {   // a layout written in cells: the same reader as a paste from Excel
    document.getElementById('pasteTxt').value = lay.tsv;
    PASTE = parsePaste(lay.tsv); PASTE.seq = sh.seqs; PASTE.meta = meta; PASTE.ops = sh.ops;
    st0.textContent = t('xlRead', [XLI.name, sh.name, PASTE.nMc, sh.seqs.length]) + ' ' + t('xlCells', [lay.ref]) + '.' + (sh.info.style ? ' ' + t('xlStyle', [sh.info.style, sh.info.optr || '?', sh.info.sam || '?', sh.info.obd || '?']) : '');
    document.getElementById('ocrView').innerHTML = '';
    renderPastePreview(); return;
  }
  var rows = lay.rows.map(function (r) { return { side: r.side || 'top', sideFound: r.sideFound, cells: r.cells.map(function (c) { return Object.assign({}, c); }) }; });
  PASTE = { rows: rows, nCols: Math.max.apply(null, rows.map(function (r) { return r.cells.length; })), nMc: lay.n, fromXl: true, seq: sh.seqs,
    meta: meta, ops: sh.ops };
  // the table text for reference (editing it switches back to the text grid)
  var lines = []; rows.forEach(function (r, i) { if (i) lines.push(''); var ops = r.cells.map(function (c) { return c.op; }).join('\t'), cs = r.cells.map(function (c) { return c.code; }).join('\t'); if (r.side === 'top') lines.push(ops, cs); else lines.push(cs, ops); });
  document.getElementById('pasteTxt').value = lines.join('\n') + '\n';
  var st = document.getElementById('ocrStatus'); st.className = 'small'; st.textContent = t('xlRead', [XLI.name, sh.name, lay.n, sh.seqs.length]) + (sh.info.style ? ' ' + t('xlStyle', [sh.info.style, sh.info.optr || '?', sh.info.sam || '?', sh.info.obd || '?']) : '');
  xlPreviewSvg(lay);
  renderPastePreview();
}
function xlPreviewSvg(lay) {
  var w = lay.x1 - lay.x0, h = lay.y1 - lay.y0, svg = '';
  lay.stations.forEach(function (s) {
    var col = FAM_COL[famOf(s.code)] || '#ccc';
    svg += '<rect x="' + (s.x0 - lay.x0) + '" y="' + (s.y0 - lay.y0) + '" width="' + s.w + '" height="' + s.h + '" fill="' + col + '" fill-opacity=".6" stroke="#333" stroke-width="1"/>' +
      '<text x="' + (s.cx - lay.x0) + '" y="' + (s.cy - lay.y0 + 4) + '" font-size="' + Math.max(9, s.h * 0.22) + '" text-anchor="middle" font-weight="700">' + esc(s.code) + (s.op ? ' ' + esc(s.op) : '') + '</text>';
  });
  document.getElementById('ocrView').innerHTML = '<div class="ocrwrap"><svg viewBox="-5 -5 ' + (w + 10) + ' ' + (h + 10) + '" style="position:static;height:auto;width:100%">' + svg + '</svg></div>';
}

/* ---------- automatic layout: machines from the operation table, placed along the sequence ---------- */
function autoCode(mc) { var m = String(mc || '').toUpperCase().match(/^[A-Z0-9]+/); return m && m[0].length >= 3 ? m[0] : ''; }
/* machines of an operation: the machine-count column, else the people arranged in the file (a merged cell shared by SAM),
   rounded like the costing rule (decimal <= 0.20 down, else up), at least 1 */
function autoCount(ops, o) {
  var x = ops[o];
  if (x.mcn > 0) return Math.max(1, Math.round(x.mcn));
  if (x.ar == null || !isFinite(x.ar)) return 1;
  var v = x.ar, grp = Object.keys(ops).filter(function (k) { return ops[k].ag === x.ag; });
  if (grp.length > 1) { var tot = grp.reduce(function (a, k) { return a + (ops[k].sam || 0); }, 0); v = tot > 0 ? x.ar * (x.sam || 0) / tot : x.ar / grp.length; }
  var f = Math.floor(v), d = v - f;
  return Math.max(1, Math.min(8, d <= 0.2 + 1e-9 ? f : f + 1));
}
/* rows for buildFromPaste: the flow lines in sequence order, machines alternately on both sides of the central table
   (zig-zag, the side with less length first) so that the work moves forward along the table; with a branch line the
   sub-assembly flows go on the branch and the assembly flow on the main line */
function autoRows(ops, seqs, branchOn) {
  var norm = function (o) { return String(o).trim().replace(/^0+(?=\d)/, '').toUpperCase(); };
  var sq = seqParse((seqs || []).map(function (q) { return (q.name ? q.name + ': ' : '') + q.text; }).join('\n'));
  var lines = sq.lines.map(function (ln, i) { return { asm: i === sq.asm, ops: ln.ops.map(norm).filter(function (o, j, a) { return ops[o] && autoCode(ops[o].mc) && a.indexOf(o) === j; }) }; }).filter(function (l) { return l.ops.length; });
  var seen = {}; lines.forEach(function (l) { l.ops = l.ops.filter(function (o) { if (seen[o]) return false; seen[o] = 1; return true; }); });
  var rest = Object.keys(ops).filter(function (o) { return !seen[o] && autoCode(ops[o].mc); }).sort(function (a, b) { return simNum(a) - simNum(b); });
  if (!lines.length) lines = [{ asm: true, ops: rest }];
  else {   // operations of the table missing from the sequence: into the assembly flow by number
    var A = lines.filter(function (l) { return l.asm; })[0] || lines[lines.length - 1];
    rest.forEach(function (o) { var k = 0; while (k < A.ops.length && !(simNum(A.ops[k]) > simNum(o))) k++; A.ops.splice(k, 0, o); });
  }
  var useBr = branchOn && lines.length > 1, zones = {}, nMc = 0, nOps = 0;
  lines.forEach(function (l) {
    var zid = useBr && !l.asm ? 'branch' : 'main';
    var Z = zones[zid] || (zones[zid] = { cur: { top: 0, bottom: 0 }, rows: { top: [], bottom: [] } });
    l.ops.forEach(function (o) {
      var code = autoCode(ops[o].mc), n = autoCount(ops, o), L = dimOf(code).L; nOps++;
      for (var i = 0; i < n; i++) {
        var side = Z.cur.top <= Z.cur.bottom ? 'top' : 'bottom';
        Z.rows[side].push({ code: code, op: o, x: Z.cur[side] + L / 2, side: side }); Z.cur[side] += L; nMc++;
      }
    });
  });
  var rows = [], order = useBr && (ST.line.branch || {}).pos !== 'bottom' ? ['branch', 'main'] : ['main', 'branch'];
  order.forEach(function (zid) { var Z = zones[zid]; if (!Z) return; ['top', 'bottom'].forEach(function (sd) { if (Z.rows[sd].length) rows.push({ side: sd, sideFound: true, zone: zid, cells: Z.rows[sd] }); }); });
  // a zone with only one row: keep the row order (top row first) expected by buildFromPaste
  return { rows: rows, nMc: nMc, nOps: nOps, nLines: lines.length };
}
function xlAuto(k) {
  var a = XLI.auto[k], r = autoRows(a.ops, a.seqs, !!centerOf('branch'));
  var meta = { style: a.info.style, file: XLI.name, sheet: a.name, optr: a.info.optr, sam: a.info.sam, obd: a.info.obd, target: a.info.target, eff: a.info.eff };
  PASTE = { rows: r.rows, nCols: 0, nMc: r.nMc, fromXl: true, auto: true, seq: a.seqs, meta: meta, ops: a.ops };
  document.getElementById('pasteTxt').value = '';
  document.getElementById('ocrView').innerHTML = '';
  var st = document.getElementById('ocrStatus'); st.className = 'small t-info tagline'; st.textContent = t('xlAutoRead', [XLI.name, a.name, r.nOps, r.nMc, r.nLines]);
  renderPastePreview();
}
