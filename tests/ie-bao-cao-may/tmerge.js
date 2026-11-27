// v7.13: all dates of the Machine Database are merged per machine (latest row of EACH machine wins; machines only on an older date are kept). Run: node tests/ie-bao-cao-may/tmerge.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { console, XLSX: {} }; vm.createContext(ctx);
vm.runInContext('var skey=function(s){return String(s==null?"":s).toUpperCase().replace(/\\s+/g,"");};var norm=function(v){return String(v==null?"":v).toLowerCase().replace(/\\s+/g,"");};var findCol=function(h,n){for(var i=0;i<h.length;i++) if(norm(h[i])===norm(n)) return i; return -1;};var dayKey=function(d){return d==null||d===""?null:(d instanceof Date?Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()):Date.parse(d));};', ctx);
const src = fs.readFileSync(path.join(__dirname, '../../src/ie-bao-cao-may/logic.js'), 'utf8');
const m = src.match(/function loadDb\(aoa\) \{[\s\S]*?\n\}\n/); assert(m, 'loadDb not found'); vm.runInContext(m[0], ctx);
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };
const D = (y, mo, d) => vm.runInContext(`new Date(${y},${mo - 1},${d})`, ctx);
const H = ['STYLE', 'MACHINE', 'QUANTITY', 'REMARK', 'MACHINE GROUP', 'DATE'];
const S = 'VSS26-00380-3301(XX)ln';
ok('older full set + newer partial entry: machines are merged', () => {
  const db = ctx.loadDb([H, [S, 'BT1M', 6, 'IETL', 'BT1M', D(2026, 10, 29)], [S, 'BT2M', 1, 'IETL', 'BT1M', D(2026, 10, 29)], [S, '1SLA', 1, 'IETL', '1SLM', D(2026, 10, 29)], [S, '1SLM', 9, 'IETL', '1SLM', D(2026, 11, 5)]]);
  const e = db.byKey[ctx.skey(S)]; assert.deepEqual(Object.assign({}, e.set), { BT1M: 6, BT2M: 1, '1SLA': 1, '1SLM': 9 }); assert.strictEqual(e.old.length, 0); assert.strictEqual(e.cur.length, 4);
  assert.strictEqual(new Date(e.date).getUTCDate() || new Date(e.date).getDate(), new Date(e.date).getDate());
});
ok('the same machine on two dates: the newer row replaces the older one (no double count)', () => {
  const db = ctx.loadDb([H, [S, 'BT1M', 6, 'IETL', 'BT1M', D(2026, 10, 29)], [S, 'BT1M', 7, 'IETL', 'BT1M', D(2026, 11, 5)], [S, 'OLM', 3, 'IETL', 'OLM', D(2026, 10, 29)]]);
  const e = db.byKey[ctx.skey(S)]; assert.deepEqual(Object.assign({}, e.set), { BT1M: 7, OLM: 3 }); assert.strictEqual(e.old.length, 1);
});
ok('single date: unchanged', () => {
  const db = ctx.loadDb([H, [S, 'BT1M', 6, 'IETL', 'BT1M', D(2026, 10, 29)], [S, 'OLM', 3, 'IETL', 'OLM', D(2026, 10, 29)]]);
  const e = db.byKey[ctx.skey(S)]; assert.deepEqual(Object.assign({}, e.set), { BT1M: 6, OLM: 3 }); assert.strictEqual(e.old.length, 0);
});
console.log(n + ' passed');
