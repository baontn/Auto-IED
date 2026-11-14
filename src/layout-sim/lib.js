/* lib.js: machine library (codes + footprint from the company Excel, model register -> code suggestions, 3D family per code).
   No company data is stored in this file: the Excel is read in the browser and cached in localStorage (ls_lib, ls_map). */
var LIB = { codes: {}, models: [], loadedAt: '', file: '' };   // codes[code] = {code,en,vn,L,W,dimTxt,fam?,Lo?,Wo?}; models = [{name,brand,model,qty,sug,alt[],code,ok}]
var DEF_DIM = { L: 107, W: 54 };

/* 3D/2D family by code. Order matters, first match wins. Based on the models in the register:
   lockstitch = Juki DDL-9000C / Brother S-7300A, overlock = Yamato CZ6020 / Juki MO-6714, flat bed coverstitch = Yamato VF2500,
   cylinder bed = Yamato VG/VC2700 / Pegasus W1662, bartack = Juki LK-1900, pattern sewer = Juki AMS-221 / Mitsubishi PLK,
   bonding = Precious PC8520 / PC9002, heat press = Oxima OS-390 / Martin Emprex. */
var FAM_RULES = [
  [/^(MNHD|ICKM|SHBD|ARTM|AOCM|HMCM|HSGM|AGTM|TCLM)$/, 'table'],
  [/^(GFIS|GFIR|PFMC)$/, 'iron'],
  [/^SCTM$/, 'suction'],
  [/^SSNM$/, 'snap'],
  [/^(2STC|SLST|EPOC|SPOM)$/, 'stretch'],
  [/^(CHP.|HPSM|N1PM|M1PM|NEP.|EPMS|3DHP|HSMC|HPPS|ABHM)$/, 'press'],
  [/^(US..|CUCM|CSUC|ZZUC|ZZAU|ALWM)$/, 'ultrasonic'],
  [/^(SFAM|SFHM|SNAM|SNHM|RDHM|RDRM|HFHM|SFSM|PURC|SNRM)$/, 'bonding'],
  [/^(1510|2516|2010|1306|BTSL|BTCM|BTSM|HKEM)$/, 'pattern'],
  [/^(BT..|BSSA|BSLM|BSTM|BHAM|BHLM|SAIB|SAIW)$/, 'bartack'],
  [/^(\dCC.|2CHH|1CHH|STCS|2CSR|\dOLC|SCOL|1ZZH|2CLC)$/, 'cylinder'],
  [/^(\dOL.|OLFH|BLMC|SPIM)$/, 'overlock'],
  [/^(\dCS.|\dIL.|4N6.|2CFS)$/, 'coverstitch'],
  [/^(\dSL.|2SLM|1SGM|\dZZ.|TZZM|ZZAC|2CHM|1CHM|1CHF)$/, 'lockstitch']
];
var FAMS = ['lockstitch', 'overlock', 'coverstitch', 'cylinder', 'bartack', 'pattern', 'bonding', 'ultrasonic', 'press', 'iron', 'stretch', 'snap', 'suction', 'table', 'box'];
/* where the operator sits along the table (fraction of L from the centre, + = right): the needle of a lockstitch is left of the arm */
var FAM_SEAT = { lockstitch: -0.14, coverstitch: -0.14, bonding: -0.14, cylinder: -0.16, overlock: -0.12, bartack: -0.05, pattern: 0 };
/* 2D fill colours (soft, readable in light and dark) */
var FAM_COL = { lockstitch: '#7aa7e0', overlock: '#e39a5b', coverstitch: '#76c4a5', cylinder: '#4fb3bf', bartack: '#c08bd6', pattern: '#a47fe0',
  bonding: '#e0c55b', ultrasonic: '#8fd16a', press: '#e07a7a', iron: '#d6a77a', stretch: '#9aa8b8', snap: '#b8b07a', suction: '#9cb9c9', table: '#c9c2b4', box: '#b0b6c2' };

function normCode(c) { return String(c == null ? '' : c).trim().toUpperCase(); }
function famOf(code) {
  code = normCode(code);
  var o = LIB.codes[code];
  if (o && o.fam) return o.fam;
  for (var i = 0; i < FAM_RULES.length; i++) if (FAM_RULES[i][0].test(code)) return FAM_RULES[i][1];
  return 'box';
}
function seatOf(fam) { return FAM_SEAT[fam] || 0; }
function parseDim(s) {
  var m = String(s == null ? '' : s).replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*[*x×X]\s*(\d+(?:\.\d+)?)/);
  return m ? { L: +m[1], W: +m[2] } : null;
}
/* footprint of a code in cm: user override > library > default (flag unknown) */
function dimOf(code) {
  var o = LIB.codes[normCode(code)];
  if (!o) return { L: DEF_DIM.L, W: DEF_DIM.W, known: false };
  var L = o.Lo || o.L || DEF_DIM.L, W = o.Wo || o.W || DEF_DIM.W;
  return { L: L, W: W, known: !!(o.Lo || o.L) };
}
function isCode(s) {
  s = normCode(s);
  if (!s) return false;
  if (LIB.codes[s]) return true;
  return /^[0-9A-Z]{4}$/.test(s) && /[A-Z]/.test(s);
}

/* ---------- model register -> code suggestions (keyword rules on "name model"; IE Tech confirms) ---------- */
var MODEL_RULES = [
  [/racing tape feeder|tape feeder|\baef\b|metering device/, '#ATTACH', ''],
  [/trolley|tool bag|screw|scissor|cabinet|barcode|plotter|cutting table|band ?knife|bank knife|spreader|spreading|laser|needle detector|smoke|air cond|voltage|power (source|regulator)|robot|sweeper|printer|pad print|screen print|fusing|die cut|winding|rewind|ink mixer|oven|dryer|deodor|temperature|cleaning|packing|hangtag|hanger|plastic hat|knife cutting|straight knife|auto cutter|strip cutter|relaxing|shrink|laminat|testing|inspection|mechanic|template|vacuum table|scanning|boiler|mould|molding/, '#NOLINE', ''],
  [/overlock blind/, 'OLFH', ''],
  [/5 threads? overlock/, '5OLM', '5OLS'],
  [/backlatch|\/bt43/, '4OLB', '3OLB'],
  [/4 thread cylinder/, '4OLC', '3OLC'],
  [/3 threads? overlock/, '3OLM', '3OLS,3OLE,3OLG,3OLP'],
  [/4 threads? overlock/, '4OLM', '4OLS,3OLM,4OLE,4OLG'],
  [/4 needles? 6 thread/, '4N6T', '4N6C'],
  [/small cylinder bed cover/, '2CCT', '3CCT'],
  [/cylinder bed cover.*left cutter/, '2CLC', ''],
  [/cylinder bed cover/, '2CCH', '3CCH,4CCH,1CCH,4CCF,2CSR'],
  [/cover stitch.*elastic/, '2CSR', ''],
  [/cover ?stitch with trimming/, '2CSC', '3CSC,4CSC,2ILC,3ILC,4ILC'],
  [/flat ?bed cover/, '2CSM', '3CSM,4CSM,2ILM,3ILM,4ILM,2CSF,3CSF,4CSF,2ILF,3ILF,4ILF'],
  [/twin needle chain/, '2CHM', '2CHH'],
  [/single needle chain/, '1CHM', '1CHF,1CHH'],
  [/twin needle/, '2SLM', ''],
  [/gathering/, '1SGM', ''],
  [/\bslc\b|lockstitch.*cutter|dlm-/, '1SLC', '1SLW'],
  [/sfhm|hemming/, 'SFHM', 'SNHM,RDHM,HFHM'],
  [/rdhm/, 'RDHM', ''],
  [/rdrm|r&d folding/, 'RDRM', ''],
  [/sfam|adhesive film/, 'SFAM', 'SNAM'],
  [/pur glue|dispensing/, 'PURC', ''],
  [/\bslm\b|lockstitch|ddl-?\d/, '1SLM', '1SLA,1SLN'],
  [/3 step zigzag/, '3ZZM', '2ZZM,1ZZM,3ZZF'],
  [/1 step zigzag/, '1ZZM', '1ZZF,2ZZM'],
  [/zigzag with trimming/, '1ZZC', 'ZZAC,ZZUC'],
  [/zigzag stitching with pattern|lz-?2290/, '1ZZM', '2ZZM,3ZZM'],
  [/1510/, '1510', ''], [/2516/, '2516', ''], [/3020|ams-?221/, 'BTSL', 'BTCM'],
  [/hook ?(&|and) ?eye/, 'HKEM', ''],
  [/bartack|lk-?19/, 'BT1M', 'BT2M,BTLM,BTNM,BTTM'],
  [/button ?hole/, 'BHLM', 'BHAM'], [/button attach|button sew/, 'BSLM', 'BSSA,BSTM'], [/spot tack/, 'BSTM', ''],
  [/bone insert/, 'SAIB', ''], [/bra-wire|steel ring/, 'SAIW', ''],
  [/portable ultrasonic|cutting pen/, 'USFM', 'USHD'], [/ultrasonic/, 'CUCM', 'USCM,USRD'],
  [/e-shape.*long/, 'NEPB', ''], [/e-shape/, 'NEPM', 'EPMS,NEPC'], [/line style heat/, 'N1PM', 'M1PM'],
  [/small size heat|medium size heat/, 'CHPT', 'CHPS'], [/heat ?seal/, 'HSMC', ''], [/heat press/, 'CHPM', 'HPSM,CHPB,3DHP'],
  [/stretching|seam expansion/, '2STC', 'SLST,EPOC,STCS'], [/vacuum ironing|iron/, 'GFIS', 'GFIR'],
  [/thread (suction|remov|scrap|trim)/, 'SCTM', '']
];
function suggestCode(name, model) {
  var t = (String(name || '') + ' ' + String(model || '')).toLowerCase();
  for (var i = 0; i < MODEL_RULES.length; i++) if (MODEL_RULES[i][0].test(t)) return { sug: MODEL_RULES[i][1], alt: MODEL_RULES[i][2] ? MODEL_RULES[i][2].split(',') : [] };
  return { sug: '', alt: [] };
}
function modelKey(m) { return (m.name + '|' + m.brand + '|' + m.model).toLowerCase(); }

/* ---------- read the Excel ---------- */
function libReadWorkbook(wb, fileName) {
  var codes = {}, models = [], cnt = {};
  wb.SheetNames.forEach(function (sn) {
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false });
    for (var h = 0; h < Math.min(rows.length, 15); h++) {
      var hdr = rows[h].map(function (x) { return String(x).trim().toLowerCase().replace(/\s+/g, ' '); });
      var ic = hdr.indexOf('machine_code'), isn = hdr.indexOf('sewing name');
      if (ic >= 0) {
        var ie = hdr.indexOf('machine_name'), iv = hdr.indexOf('machine_name_vn'), id = hdr.indexOf('dimension');
        for (var r = h + 1; r < rows.length; r++) {
          var c = normCode(rows[r][ic]); if (!c || codes[c]) continue;          // first row wins on duplicates (2OLM is listed twice)
          var d = parseDim(rows[r][id]) || {};
          codes[c] = { code: c, en: String(rows[r][ie] || '').trim(), vn: String(rows[r][iv] || '').trim(), L: d.L || 0, W: d.W || 0, dimTxt: String(rows[r][id] || '') };
        }
        break;
      }
      if (isn >= 0) {
        var ib = hdr.findIndex(function (x) { return /brand/.test(x); }), im = hdr.findIndex(function (x) { return /model/.test(x); });
        for (var r2 = h + 1; r2 < rows.length; r2++) {
          var n = String(rows[r2][isn] || '').trim(), b = String(ib >= 0 ? rows[r2][ib] : '').trim(), mo = String(im >= 0 ? rows[r2][im] : '').trim();
          if (!n && !mo) continue;
          if (/^(sewing name|machinename)$/i.test(n)) continue;
          var k = (n + '|' + b + '|' + mo).toLowerCase();
          if (!cnt[k]) { cnt[k] = { name: n, brand: b, model: mo, qty: 0 }; models.push(cnt[k]); }
          cnt[k].qty++;
        }
        break;
      }
    }
  });
  return { codes: codes, models: models, file: fileName };
}
function libApply(read) {
  var nCodes = Object.keys(read.codes).length;
  if (nCodes) {
    var old = LIB.codes;
    Object.keys(read.codes).forEach(function (c) { var o = old[c]; if (o) { read.codes[c].Lo = o.Lo; read.codes[c].Wo = o.Wo; read.codes[c].fam = o.fam; } });
    Object.keys(old).forEach(function (c) { if (!read.codes[c] && old[c].custom) read.codes[c] = old[c]; });
    LIB.codes = read.codes;
  }
  if (read.models.length) {
    var prev = {}; LIB.models.forEach(function (m) { prev[modelKey(m)] = m; });
    LIB.models = read.models.sort(function (a, b) { return b.qty - a.qty; }).map(function (m) {
      var s = suggestCode(m.name, m.model), p = prev[modelKey(m)];
      return { name: m.name, brand: m.brand, model: m.model, qty: m.qty, sug: s.sug, alt: s.alt, code: p ? p.code : s.sug, ok: p ? p.ok : false, by: p ? p.by : '', at: p ? p.at : '' };
    });
  }
  LIB.file = read.file; LIB.loadedAt = new Date().toISOString();
  libSave();
  return { codes: nCodes, models: read.models.length };
}
function libSave() {
  try {
    localStorage.setItem('ls_lib', JSON.stringify({ codes: LIB.codes, file: LIB.file, loadedAt: LIB.loadedAt }));
    localStorage.setItem('ls_map', JSON.stringify(LIB.models));
  } catch (e) { console.warn('save library', e); }
}
function libLoadCache() {
  try {
    var a = JSON.parse(localStorage.getItem('ls_lib') || 'null'); if (a) { LIB.codes = a.codes || {}; LIB.file = a.file || ''; LIB.loadedAt = a.loadedAt || ''; }
    var m = JSON.parse(localStorage.getItem('ls_map') || 'null'); if (m) LIB.models = m;
  } catch (e) { console.warn('load library', e); }
}
/* real models mapped to a code (confirmed or suggested), most units first */
function modelsOfCode(code) {
  code = normCode(code);
  return LIB.models.filter(function (m) { return m.code === code; }).sort(function (a, b) { return b.qty - a.qty; });
}
function codeList() { return Object.keys(LIB.codes).sort(); }
function codeName(code) { var o = LIB.codes[normCode(code)]; if (!o) return ''; return (LANG === 'vi' && o.vn) ? o.vn : (o.en || o.vn || ''); }
