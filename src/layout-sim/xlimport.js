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
      if (!XLI.sheets.length) { st.className = 'small t-warn tagline'; st.textContent = t('xlNone', [f.name]); return; }
      document.getElementById('ocrView').innerHTML = '';
      var sel = document.getElementById('xlPick');
      sel.innerHTML = XLI.sheets.map(function (s, i) {
        return s.layouts.map(function (l, j) { return '<option value="' + i + ':' + j + '">' + esc(s.name + (s.hidden ? ' (' + t('xlHidden') + ')' : '') + ' · ' + t('xlLay', [j + 1, l.rows.length, l.n])) + '</option>'; }).join('');
      }).join('');
      document.getElementById('xlBox').style.display = '';
      // the visible sheet with the most machines first
      var bi = 0, bn = -1; [].forEach.call(sel.options, function (o, k) { var p = o.value.split(':'), s = XLI.sheets[+p[0]]; if (!s.hidden && s.layouts[+p[1]].n > bn) { bn = s.layouts[+p[1]].n; bi = k; } });
      sel.selectedIndex = bi; xlUse();
    } catch (e) { console.error(e); st.className = 'small t-bad tagline'; st.textContent = t('xlErr') + ': ' + e.message; }
  };
  rd.readAsArrayBuffer(f);
}
function xlUse() {
  var p = document.getElementById('xlPick').value.split(':'), sh = XLI.sheets[+p[0]], lay = sh.layouts[+p[1]];
  var rows = lay.rows.map(function (r) { return { side: r.side || 'top', sideFound: r.sideFound, cells: r.cells.map(function (c) { return Object.assign({}, c); }) }; });
  PASTE = { rows: rows, nCols: Math.max.apply(null, rows.map(function (r) { return r.cells.length; })), nMc: lay.n, fromXl: true, seq: sh.seqs };
  // the table text for reference (editing it switches back to the text grid)
  var lines = []; rows.forEach(function (r, i) { if (i) lines.push(''); var ops = r.cells.map(function (c) { return c.op; }).join('\t'), cs = r.cells.map(function (c) { return c.code; }).join('\t'); if (r.side === 'top') lines.push(ops, cs); else lines.push(cs, ops); });
  document.getElementById('pasteTxt').value = lines.join('\n') + '\n';
  var st = document.getElementById('ocrStatus'); st.className = 'small'; st.textContent = t('xlRead', [XLI.name, sh.name, lay.n, sh.seqs.length]);
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
