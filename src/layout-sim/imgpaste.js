/* imgpaste.js: read a layout from a PICTURE (Excel shapes copied or a screenshot) with OCR, offline.
   The OCR engine (Tesseract.js 5 + LSTM core + English data) is in the sidecar file ocr-engine.js next to the HTML,
   loaded only when an image is pasted. Codes are corrected against the machine library (3 0 L M -> 3OLM). */
var OCR = { worker: null, loading: null, last: null };

function ocrEngine() {
  if (OCR.loading) return OCR.loading;
  OCR.loading = new Promise(function (res, rej) {
    if (window.Tesseract && window.LS_OCR_CODE) return res();
    var s = document.createElement('script'); s.src = 'ocr-engine.js';
    s.onload = function () { window.Tesseract && window.LS_OCR_CODE ? res() : rej(new Error('ocr-engine.js')); };
    s.onerror = function () { rej(new Error(t('ocrNoEngine'))); };
    document.head.appendChild(s);
  }).then(function () {
    // the worker reads eng.traineddata.gz with fetch(): answer it from the bundled data, so nothing goes to the network
    var pre = 'var __LS_ENG="' + window.LS_OCR_ENG + '";var __lsFetch=self.fetch;' +
      'self.fetch=function(u,o){if(String(u).indexOf("eng.traineddata")>=0){var b=atob(__LS_ENG),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);' +
      'return Promise.resolve(new Response(a,{status:200}));}return Promise.reject(new Error("offline: "+u));};\n';
    var url = URL.createObjectURL(new Blob([pre, window.LS_OCR_CODE], { type: 'application/javascript' }));
    return new Promise(function (res, rej) {
      Tesseract.createWorker('eng', 1, {
        workerPath: url, workerBlobURL: false, langPath: 'https://offline.invalid/tessdata', cacheMethod: 'none', gzip: true,
        errorHandler: function (e) { rej(new Error(String(e))); },
        logger: function (m) { if (m.status === 'recognizing text') ocrProgress(Math.round(m.progress * 100)); }
      }).then(res, rej);
    });
  }).then(function (w) {
    OCR.worker = w;
    return w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', tessedit_pageseg_mode: '11', preserve_interword_spaces: '0' }).then(function () { return w; });
  });
  OCR.loading.catch(function () { OCR.loading = null; });
  return OCR.loading;
}

/* image -> canvas scaled so that text is ~30 px high, grey, thresholded, long box lines removed */
function ocrPrepare(img) {
  var w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  var k = Math.max(1, Math.min(4, 2600 / Math.max(w0, 1))); if (w0 * k > 5000) k = 5000 / w0;
  var W = Math.round(w0 * k), H = Math.round(h0 * k), c = document.createElement('canvas'); c.width = W; c.height = H;
  var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, W, H);
  var d = x.getImageData(0, 0, W, H), p = d.data, g = new Uint8Array(W * H);
  for (var i = 0, j = 0; i < p.length; i += 4, j++) { g[j] = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0; }
  // Otsu threshold (global); cells with a grey fill are read again from the grey picture in the second pass
  var hist = new Array(256).fill(0); for (j = 0; j < W * H; j++) hist[g[j]]++;
  var tot = W * H, sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
  var sB = 0, wB = 0, best = 0, th = 128;
  for (i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; var wF = tot - wB; if (!wF) break; sB += i * hist[i]; var mB = sB / wB, mF = (sum - sB) / wF, bt = wB * wF * (mB - mF) * (mB - mF); if (bt > best) { best = bt; th = i; } }
  var dark = new Uint8Array(W * H); for (j = 0; j < W * H; j++) dark[j] = g[j] < th ? 1 : 0;
  var grey = document.createElement('canvas'); grey.width = W; grey.height = H; grey.getContext('2d').drawImage(c, 0, 0);
  // remove straight lines longer than ~ 2.2 x the expected text height (box borders, table grid)
  var minRun = Math.max(40, Math.round(H * 0.06), Math.round(W * 0.025)), kill = new Uint8Array(W * H);
  for (var y = 0; y < H; y++) { var run = 0; for (var xx = 0; xx <= W; xx++) { if (xx < W && dark[y * W + xx]) run++; else { if (run >= minRun * 2) for (var q = xx - run; q < xx; q++) kill[y * W + q] = 1; run = 0; } } }
  for (xx = 0; xx < W; xx++) { run = 0; for (y = 0; y <= H; y++) { if (y < H && dark[y * W + xx]) run++; else { if (run >= minRun) for (q = y - run; q < y; q++) kill[q * W + xx] = 1; run = 0; } } }
  for (j = 0, i = 0; j < W * H; j++, i += 4) { var on = dark[j] && !kill[j]; p[i] = p[i + 1] = p[i + 2] = on ? 0 : 255; p[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  return { canvas: c, grey: grey, k: k, lines: kill, W: W, H: H };
}

/* ---------- code correction against the library ---------- */
var CONF = { O: '0DQC', '0': 'ODQC', D: '0O', Q: '0O', I: '1LT', '1': 'ILT7', L: '1I', S: '586', '5': 'S6', B: '8', '8': 'BS', Z: '2', '2': 'Z', G: '6C', '6': 'GCS', A: '4', '4': 'A', T: '7I1', '7': 'T1', C: 'G0O6' };
function subCost(a, b) { if (a === b) return 0; return (CONF[a] && CONF[a].indexOf(b) >= 0) ? 0.3 : 1; }
/* OCR.seen = codes read exactly elsewhere in the same picture (preferred when two codes are equally close) */
function codeWeight(c) {
  var w = (OCR.seen && OCR.seen[c]) ? 1000 : 0;
  LIB.models.forEach(function (m) { if (m.code === c) w += m.qty; });
  return w;
}
function fixCode(raw) {
  var s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 4) return null;
  if (LIB.codes[s]) return { code: s, cost: 0 };
  var cand = [];
  Object.keys(LIB.codes).forEach(function (c) {
    if (c.length !== 4) return;
    var cost = 0; for (var i = 0; i < 4 && cost < 2; i++) cost += subCost(s[i], c[i]);
    if (cost < 2) cand.push({ c: c, cost: Math.round(cost * 10) / 10 });
  });
  cand.sort(function (x, y) { return x.cost - y.cost; });
  if (cand.length) {
    var best = cand[0].cost, tied = cand.filter(function (x) { return x.cost === best; }), second = cand.filter(function (x) { return x.cost > best; })[0];
    if (tied.length > 1) tied.sort(function (x, y) { return codeWeight(y.c) - codeWeight(x.c); });
    var clearTie = tied.length === 1 || codeWeight(tied[0].c) > codeWeight(tied[1].c);
    if (clearTie && (best <= 1 || (best <= 1.6 && (!second || second.cost - best >= 0.7)))) return { code: tied[0].c, cost: best };
  }
  if (/^[0-9A-Z]{4}$/.test(s) && /[A-Z]/.test(s)) return { code: s, cost: 2, unknown: true };
  return null;
}
/* 5-6 characters: a box edge read as an extra letter (e.g. I3OLM): best 4-character part, small extra cost */
function fixCodeLoose(raw) {
  var s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 4) return fixCode(s);
  if (s.length < 5 || s.length > 6) return null;
  var best = null;
  for (var i = 0; i + 4 <= s.length; i++) { var f = fixCode(s.substr(i, 4)); if (f && !f.unknown && (!best || f.cost < best.cost)) best = { code: f.code, cost: f.cost + 0.3 * (s.length - 4) }; }
  return best && best.cost <= 1.2 ? best : null;
}
function fixNum(raw) {
  var s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O|D|Q/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
  return /^\d{1,3}$/.test(s) ? s : null;
}

/* ---------- OCR words -> grid ---------- */
function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[b.length >> 1]; }
function ocrToGrid(words) {
  var codes = [], nums = [], other = [];
  OCR.seen = {};
  words.forEach(function (w) { var r = String(w.text || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (LIB.codes[r]) OCR.seen[r] = 1; });
  words.forEach(function (w) {
    var raw = String(w.text || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), b = w.bbox;
    if (!raw) return;
    var tok = { raw: raw, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, h: b.y1 - b.y0, conf: w.confidence };
    // several boxes read as one word (e.g. 3OLM1SLA): split in chunks of 4 when every chunk is a code
    if (raw.length > 4 && raw.length % 4 === 0) {
      var n = raw.length / 4, parts = [];
      for (var i = 0; i < n; i++) { var f = fixCode(raw.substr(i * 4, 4)); if (!f || f.unknown) { parts = null; break; } parts.push(f); }
      if (parts) { var cw = (b.x1 - b.x0) / n; parts.forEach(function (f, i) { codes.push(Object.assign({}, tok, { raw: raw.substr(i * 4, 4), code: f.code, cost: f.cost, x0: b.x0 + i * cw, x1: b.x0 + (i + 1) * cw, cx: b.x0 + (i + 0.5) * cw })); }); return; }
    }
    var fc = raw.length >= 4 && raw.length <= 6 ? fixCodeLoose(raw) : null, fn = fixNum(raw);
    if (w.reread) tok.reread = true;
    if (fc && !(fn && raw.length <= 3)) { tok.code = fc.code; tok.cost = fc.cost; tok.unknown = !!fc.unknown; codes.push(tok); }
    else if (fn) { tok.num = fn; tok.doubt = (w.confidence != null && w.confidence < 55); nums.push(tok); }
    else other.push(tok);
  });
  if (!codes.length) return { rows: [], tsv: '', codes: codes, nums: nums, other: other };
  var hMed = median(codes.map(function (c) { return c.h; })) || 10;
  codes.sort(function (a, b) { return a.cy - b.cy; });
  var rows = [];
  codes.forEach(function (c) {
    var r = rows[rows.length - 1];
    if (r && Math.abs(c.cy - r.cy) < hMed * 0.9) { r.items.push(c); r.cy = r.items.reduce(function (s, x) { return s + x.cy; }, 0) / r.items.length; }
    else rows.push({ cy: c.cy, items: [c] });
  });
  rows.forEach(function (r) { r.items.sort(function (a, b) { return a.cx - b.cx; }); });
  // cell pitch = median distance between neighbours in a row
  var gaps = []; rows.forEach(function (r) { for (var i = 1; i < r.items.length; i++) gaps.push(r.items[i].cx - r.items[i - 1].cx); });
  var pitch = median(gaps.filter(function (g) { return g > hMed; })) || median(codes.map(function (c) { return c.x1 - c.x0; })) * 1.4 || 50;
  var minX = Math.min.apply(null, codes.map(function (c) { return c.cx; }));
  // columns = clusters of machine x-centres (exact with boxes); a wide gap between clusters keeps empty columns
  var xs = codes.map(function (c) { return c.cx; }).sort(function (a, b) { return a - b; });
  var tol = Math.max(4, 0.45 * median(codes.map(function (c) { return c.x1 - c.x0; }))), cl = [];
  xs.forEach(function (x) { var l = cl[cl.length - 1]; if (l && x - l.max <= tol) { l.max = x; l.sum += x; l.n++; } else cl.push({ max: x, sum: x, n: 1 }); });
  var cen = cl.map(function (c) { return c.sum / c.n; }), diffs = [];
  for (var di = 1; di < cen.length; di++) diffs.push(cen[di] - cen[di - 1]);
  var step = median(diffs) || pitch, centers = [];
  cen.forEach(function (x, i) { if (i) { var gap = Math.round((x - cen[i - 1]) / step) - 1; for (var g2 = 1; g2 <= gap; g2++) centers.push(cen[i - 1] + g2 * (x - cen[i - 1]) / (gap + 1)); } centers.push(x); });
  pitch = step;
  function colOf(x) {
    var bi = 0, bd = Infinity; centers.forEach(function (c, i) { var d = Math.abs(x - c); if (d < bd) { bd = d; bi = i; } });
    if (x < centers[0] - step * 0.6) return -1;      // left of the first machine column: not a cell of the grid
    return bi;
  }
  codes.forEach(function (c) { c.col = colOf(c.cx); });
  // numbers: attach to the nearest code row (above or below) and the code in the same column
  var lens = nums.map(function (n) { return n.num.length; }), mainLen = median(lens);
  nums.forEach(function (n) { if (mainLen >= 2 && n.num.length === 1) n.doubt = true; });
  rows.forEach(function (r) { r.up = 0; r.dn = 0; r.ops = {}; r.dys = []; });
  nums.forEach(function (n) {
    var best = null, bd = Infinity;
    rows.forEach(function (r) { var d = Math.abs(n.cy - r.cy); if (d < bd) { bd = d; best = r; } });
    if (!best || bd > hMed * 4 || bd < hMed * 0.5) return;
    var col = colOf(n.cx), hit = best.items.filter(function (c) { return c.col === col; })[0];
    if (!hit) return;
    n.used = true; n.col = col;
    if (n.doubt) { if (n.cy < best.cy) best.up++; else best.dn++; best.dys.push(n.cy - best.cy); return; }
    if (best.ops[col] == null || n.reread) best.ops[col] = n.num;
    n.used = true;
    if (n.cy < best.cy) best.up++; else best.dn++;
    best.dys.push(n.cy - best.cy);
  });
  var nCols = Math.max.apply(null, codes.map(function (c) { return c.col; })) + 1, lines = [], chosen = [], nOps = 0;
  function line(arr) { var a = []; for (var i = 0; i < nCols; i++) a.push(arr[i] == null ? '' : arr[i]); return a.join('\t'); }
  rows.forEach(function (r, i) {
    var cm = {}, cc = {}, ct = {}; r.items.forEach(function (c) { var k = c.unknown ? 9 : (c.reread ? -1 : c.cost); if (cm[c.col] == null || k < cc[c.col]) { cm[c.col] = c.code; cc[c.col] = k; ct[c.col] = c; } });
    Object.keys(ct).forEach(function (k) { chosen.push(ct[k]); }); nOps += Object.keys(r.ops).length;
    var hasNum = Object.keys(r.ops).length > 0, top = hasNum ? r.up >= r.dn : i < rows.length / 2;
    if (i) lines.push('');
    if (top && hasNum) lines.push(line(r.ops));
    lines.push(line(cm));
    if (!top && hasNum) lines.push(line(r.ops));
  });
  // cells where a machine is expected but nothing was read: another row has a machine in that column, or a number is next to it
  var missing = [], colsUsed = {}; codes.forEach(function (c) { colsUsed[c.col] = 1; });
  rows.forEach(function (r) {
    var have = {}; r.items.forEach(function (c) { if (!c.unknown) have[c.col] = 1; });
    var lo = Math.min.apply(null, r.items.map(function (c) { return c.col; })), hi = Math.max.apply(null, r.items.map(function (c) { return c.col; }));
    for (var c = 0; c < nCols; c++) {
      if (have[c]) continue;
      var numNear = nums.some(function (n) { return colOf(n.cx) === c && Math.abs(n.cy - r.cy) < hMed * 4 && Math.abs(n.cy - r.cy) > hMed * 0.5; });
      if (!(numNear || (colsUsed[c] && c > lo && c < hi))) continue;
      // centre of the cell: same column in another row, else between the two neighbours, else from the pitch
      var same = codes.filter(function (o) { return o.col === c; })[0], L = r.items.filter(function (o) { return o.col === c - 1; })[0], R = r.items.filter(function (o) { return o.col === c + 1; })[0];
      var x = same ? same.cx : (L && R) ? (L.cx + R.cx) / 2 : L ? L.cx + pitch : R ? R.cx - pitch : (centers[c] != null ? centers[c] : minX + c * pitch);
      missing.push({ kind: 'code', x: x, y: r.cy, w: pitch * 1.0, h: hMed * 2.4, col: c });
    }
    // operation numbers not read next to a machine of this row
    if (r.dys.length) {
      var dy = median(r.dys);
      r.items.forEach(function (c) { if (r.ops[c.col] == null) missing.push({ kind: 'num', x: c.cx, y: r.cy + dy, w: pitch * 0.9, h: hMed * 2.2, col: c.col }); });
    }
  });
  return { rows: rows, tsv: lines.join('\n') + '\n', codes: codes, nums: nums, other: other, pitch: pitch, missing: missing, chosen: chosen, nOps: nOps };
}

/* ---------- UI ---------- */
function ocrProgress(p) { var e = document.getElementById('ocrStatus'); if (e) e.textContent = t('ocrRunning', [p]); }
function imageFromBlob(blob) {
  return new Promise(function (res, rej) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error(t('ocrBadImage'))); }; im.src = u; });
}
function ocrImage(blob) {
  var st = document.getElementById('ocrStatus'), box = document.getElementById('ocrView');
  st.className = 'small'; st.textContent = t('ocrLoading'); box.innerHTML = '';
  if (!codeList().length) { st.className = 'small t-warn tagline'; st.textContent = t('ocrNoLib'); }
  var img;
  return imageFromBlob(blob).then(function (im) {
    img = im; box.innerHTML = ''; box.appendChild(im);
    return ocrEngine();
  }).then(function (w) {
    ocrProgress(0);
    var prep = ocrPrepare(img);
    return w.recognize(prep.canvas).then(function (r) { return { r: r, k: prep.k, canvas: prep.canvas, grey: prep.grey, w: w, prep: prep }; });
  }).then(function (o) {
    var words = (o.r.data.words || []).map(function (w) { return { text: w.text, confidence: w.confidence, bbox: { x0: w.bbox.x0 / o.k, x1: w.bbox.x1 / o.k, y0: w.bbox.y0 / o.k, y1: w.bbox.y1 / o.k } }; });
    return ocrCells(o, words).then(function (ws) { return ocrReread(o, ws); });
  }).then(function (words) {
    var g = ocrToGrid(words); OCR.last = g;
    ocrDrawBoxes(img, g);
    var ch = g.chosen || [], fixed = ch.filter(function (c) { return (c.cost > 0 || c.reread) && !c.unknown; }).length, unk = ch.filter(function (c) { return c.unknown; }).length;
    st.className = 'small'; st.textContent = t('ocrDone', [ch.length, g.nOps || 0, fixed, unk]);
    var ta = document.getElementById('pasteTxt'); ta.value = g.tsv; pastePreview();
    return g;
  }).catch(function (e) { console.error(e); st.className = 'small t-bad tagline'; st.textContent = t('ocrErr') + ': ' + (e && e.message || e); });
}
/* boxes of the layout: areas closed by border lines (Excel shapes / cells); returned in prepared-canvas pixels */
function boxCells(prep) {
  var W = prep.W, H = prep.H, k = prep.k, L = prep.lines, r = Math.max(1, Math.round(k * 0.7)), wall = new Uint8Array(W * H), x, y, i;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (L[y * W + x]) {
    for (var dy = -r; dy <= r; dy++) { var yy = y + dy; if (yy < 0 || yy >= H) continue; for (var dx = -r; dx <= r; dx++) { var xx = x + dx; if (xx >= 0 && xx < W) wall[yy * W + xx] = 1; } }
  }
  var lab = new Int32Array(W * H), q = new Int32Array(W * H), cells = [], id = 0;
  for (var st = 0; st < W * H; st++) {
    if (wall[st] || lab[st]) continue;
    id++; var qh = 0, qt = 0; q[qt++] = st; lab[st] = id;
    var x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0, edge = false;
    while (qh < qt) {
      var v = q[qh++]; x = v % W; y = (v / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      if (x > 0 && !wall[v - 1] && !lab[v - 1]) { lab[v - 1] = id; q[qt++] = v - 1; }
      if (x < W - 1 && !wall[v + 1] && !lab[v + 1]) { lab[v + 1] = id; q[qt++] = v + 1; }
      if (y > 0 && !wall[v - W] && !lab[v - W]) { lab[v - W] = id; q[qt++] = v - W; }
      if (y < H - 1 && !wall[v + W] && !lab[v + W]) { lab[v + W] = id; q[qt++] = v + W; }
    }
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (!edge && bw >= 12 * k && bh >= 10 * k && bw <= W * 0.4 && bh <= H * 0.6 && n / (bw * bh) > 0.6) cells.push({ x0: x0, y0: y0, x1: x1, y1: y1 });
  }
  return cells;
}
/* one box copied to its own small picture with a fixed text size (zoom independent) and white margin:
   [grey, black-and-white thresholded inside the box (grey fills become white)] */
function cropNorm(src, rect, targetH) {
  targetH = targetH || 64; var s = targetH / rect.height, pad = 16;
  if (rect.width * s > 900) s = 900 / rect.width;
  var w = Math.round(rect.width * s) + 2 * pad, h = Math.round(rect.height * s) + 2 * pad;
  var a = document.createElement('canvas'); a.width = w; a.height = h;
  var x = a.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = 'high';
  x.drawImage(src, rect.left, rect.top, rect.width, rect.height, pad, pad, w - 2 * pad, h - 2 * pad);
  var b = document.createElement('canvas'); b.width = w; b.height = h; var y = b.getContext('2d'); y.drawImage(a, 0, 0);
  var d = y.getImageData(0, 0, w, h), p = d.data, hist = new Array(256).fill(0), n = w * h, i;
  for (i = 0; i < p.length; i += 4) hist[(p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0]++;
  var sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
  var sB = 0, wB = 0, best = 0, th = 128;
  for (i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; var wF = n - wB; if (!wF) break; sB += i * hist[i]; var mB = sB / wB, mF = (sum - sB) / wF, bt = wB * wF * (mB - mF) * (mB - mF); if (bt > best) { best = bt; th = i; } }
  for (i = 0; i < p.length; i += 4) { var v = ((p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0) < th ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; }
  y.putImageData(d, 0, 0);
  return [a, b];
}
function classifyText(txt) {
  var c = txt.length >= 4 && txt.length <= 6 ? fixCodeLoose(txt) : null;
  if (c && !c.unknown) return 3; if (/^\d{1,3}$/.test(txt)) return 2; if (fixNum(txt) && txt.length <= 3) return 1.5; if (c) return 1; return 0;
}
/* read each box alone (one line of text), so the result does not depend on the zoom of the picture */
function ocrCells(o, words) {
  var cells = boxCells(o.prep), w = o.w, k = o.k, out = [], inset = Math.max(2, Math.round(k * 1.2));
  if (cells.length < 4) return Promise.resolve(words);
  var n = 0;
  return w.setParameters({ tessedit_pageseg_mode: '7' }).then(function () {
    return cells.reduce(function (pr, c) {
      return pr.then(function () {
        ocrProgressCells(++n, cells.length);
        var rect = { left: c.x0 + inset, top: c.y0 + inset, width: Math.max(8, c.x1 - c.x0 - 2 * inset), height: Math.max(8, c.y1 - c.y0 - 2 * inset) }, best = null;
        function better(a, b) {   // valid code > number > unknown; a longer number wins (a lost first digit is the usual error); then confidence
          if (!b) return true; if (a.score !== b.score) return a.score > b.score;
          if (a.score === 2 && a.txt.length !== b.txt.length) return a.txt.length > b.txt.length;
          return a.conf > b.conf;
        }
        function readAll(vars) {
          return vars.reduce(function (p2, src) {
            return p2.then(function () {
              return w.recognize(src).then(function (r) {
                var txt = String(r.data.text || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), cand = { txt: txt, score: classifyText(txt) - ((r.data.confidence || 0) < 30 ? 0.6 : 0), conf: r.data.confidence || 0 };
                if (txt && better(cand, best)) best = cand;
              });
            });
          }, Promise.resolve());
        }
        return readAll(cropNorm(o.grey, rect, 64)).then(function () {
          if (!best || best.score < 2 || best.conf < 50 || (best.score === 2 && best.txt.length === 1)) return readAll(cropNorm(o.grey, rect, 40).concat(cropNorm(o.grey, rect, 96)));
        }).then(function () {
          c.read = best;
          if (best && best.score > 0.5) out.push({ text: best.txt, confidence: best.conf, cell: true, bbox: { x0: c.x0 / k, x1: c.x1 / k, y0: c.y0 / k, y1: c.y1 / k } });
        });
      });
    }, Promise.resolve());
  }).then(function () { return w.setParameters({ tessedit_pageseg_mode: '11' }); }).then(function () {
    // keep the words of the first pass that lie outside every box that was read (shapes without borders)
    var keep = words.filter(function (wd) {
      var cx = (wd.bbox.x0 + wd.bbox.x1) / 2 * k, cy = (wd.bbox.y0 + wd.bbox.y1) / 2 * k;
      return !cells.some(function (c) { return c.read && c.read.score > 0.5 && cx >= c.x0 && cx <= c.x1 && cy >= c.y0 && cy <= c.y1; });
    });
    return keep.concat(out);
  });
}
function ocrProgressCells(i, n) { var e = document.getElementById('ocrStatus'); if (e) e.textContent = t('ocrCells', [i, n]); }
/* second pass: read each expected-but-empty cell alone as one line of text */
function ocrReread(o, words) {
  var g = ocrToGrid(words), miss = (g.missing || []).slice(0, 40), W = o.canvas.width, H = o.canvas.height;
  if (!miss.length) return Promise.resolve(words);
  var w = o.w, extra = [];
  return w.setParameters({ tessedit_pageseg_mode: '7' }).then(function () {
    return miss.reduce(function (pr, m) {
      return pr.then(function () {
        // several tries per cell (grey / black-and-white picture, normal / wider crop) until one gives a valid value
        var tries = [[o.grey, 1], [o.canvas, 1], [o.grey, 1.25], [o.canvas, 1.25], [o.grey, 0.85]], found = false;
        return tries.reduce(function (p2, tr) {
          return p2.then(function () {
            if (found) return;
            var ww = m.w * tr[1], left = Math.max(0, Math.round((m.x - ww / 2) * o.k)), top = Math.max(0, Math.round((m.y - m.h / 2) * o.k));
            var rect = { left: left, top: top, width: Math.min(W - left, Math.round(ww * o.k)), height: Math.min(H - top, Math.round(m.h * o.k)) };
            if (rect.width < 8 || rect.height < 8) return;
            return w.recognize(tr[0], { rectangle: rect }).then(function (r) {
              var txt = String(r.data.text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              if (window.OCR_DEBUG) console.log('reread', m.kind, m.col, Math.round(m.x), Math.round(m.y), tr[1], txt);
              var ok = m.kind === 'num' ? !!fixNum(txt) : !!(txt && fixCodeLoose(txt));
              if (ok) { found = true; extra.push({ text: m.kind === 'num' ? fixNum(txt) : txt, confidence: r.data.confidence, reread: true, bbox: { x0: m.x - m.w * 0.3, x1: m.x + m.w * 0.3, y0: m.y - m.h * 0.2, y1: m.y + m.h * 0.2 } }); }
            });
          });
        }, Promise.resolve());
      });
    }, Promise.resolve());
  }).then(function () { return w.setParameters({ tessedit_pageseg_mode: '11' }); }).then(function () { return words.concat(extra); });
}
/* picture with the recognised boxes: green = code read as is, amber = corrected, red = not in library, blue = operation number, grey = ignored */
function ocrDrawBoxes(img, g) {
  var box = document.getElementById('ocrView'), W = img.naturalWidth, H = img.naturalHeight, svg = '';
  function r(o, col, tip, label) { svg += '<g><title>' + esc(tip) + '</title><rect x="' + o.x0 + '" y="' + o.y0 + '" width="' + (o.x1 - o.x0) + '" height="' + (o.y1 - o.y0) + '" fill="' + col + '" fill-opacity=".18" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke"/>' + (label ? '<text x="' + o.x0 + '" y="' + (o.y0 - 2) + '" font-size="' + Math.max(8, (o.y1 - o.y0) * 0.5) + '" fill="' + col + '" font-weight="700">' + esc(label) + '</text>' : '') + '</g>'; }
  g.codes.forEach(function (c) { var col = c.unknown ? '#d93636' : (c.cost > 0 || c.reread) ? '#d98c00' : '#1a9e4a'; r(c, col, c.raw + (c.code !== c.raw ? ' → ' + c.code : ''), c.code !== c.raw ? c.code : ''); });
  g.nums.forEach(function (n) { r(n, n.used ? '#1f6feb' : '#8a8f99', n.raw + (n.used ? '' : ' (' + t('ocrIgnored') + ')')); });
  g.other.forEach(function (o) { r(o, '#8a8f99', o.raw + ' (' + t('ocrIgnored') + ')'); });
  box.innerHTML = '<div class="ocrwrap"><img src="' + img.src + '" alt=""><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + svg + '</svg></div>' +
    '<div class="small muted">' + t('ocrLegend') + '</div>';
}
/* clipboard: prefer text that contains machine codes (copied cells), else the image (copied shapes / screenshot) */
function clipImage(e) {
  var cd = e.clipboardData; if (!cd) return null;
  var txt = cd.getData('text/plain') || '';
  if (txt && parsePaste(txt).nMc) return null;
  for (var i = 0; i < cd.items.length; i++) if (cd.items[i].kind === 'file' && /^image\//.test(cd.items[i].type)) return cd.items[i].getAsFile();
  return null;
}
function initImagePaste() {
  document.addEventListener('paste', function (e) {
    var dlg = document.getElementById('dlgPaste'), tg = e.target, tn = tg && tg.tagName;
    if (!dlg.open && (tn === 'INPUT' || tn === 'TEXTAREA' || TAB === 'lib')) return;
    var f = clipImage(e);
    if (!f) { if (!dlg.open) { var txt = e.clipboardData && e.clipboardData.getData('text/plain'); if (txt && parsePaste(txt).nMc) { e.preventDefault(); openPaste(); document.getElementById('pasteTxt').value = txt; pastePreview(); } } return; }
    e.preventDefault();
    if (!dlg.open) openPaste();
    ocrImage(f);
  });
  var dz = document.getElementById('ocrDrop');
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('on'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('on'); });
  dz.addEventListener('drop', function (e) { e.preventDefault(); dz.classList.remove('on'); var f = e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) ocrImage(f); });
  document.getElementById('bOcrFile').onclick = function () { var i = document.getElementById('fileImg'); i.value = ''; i.click(); };
  document.getElementById('fileImg').onchange = function () { if (this.files[0]) ocrImage(this.files[0]); };
}
