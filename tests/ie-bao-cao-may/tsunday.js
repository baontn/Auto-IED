// A style that starts on a Sunday starts on the Monday (never lost); prep is counted back from the Saturday before. Run: node tests/ie-bao-cao-may/tsunday.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext('var skey=function(s){return String(s==null?"":s).toUpperCase().replace(/\\s+/g,"");};var norm=function(v){return String(v==null?"":v).toLowerCase().replace(/\\s+/g,"");};var findCol=function(h,n){for(var i=0;i<h.length;i++) if(norm(h[i])===norm(n)) return i; return -1;};', ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/ie-bao-cao-may/prep.js'), 'utf8'), ctx);
const D = n => vm.runInContext('new Date(2026,10,' + n + ')', ctx), U = n => Date.UTC(2026, 10, n), iso = ms => new Date(ms).toISOString().slice(8, 10);
// 2026-11-14 Saturday, 15 Sunday, 16 Monday
function run(f) {
  const aoa = [['Line', 'Date', 'GOP', 'Style No', 'MACHINE GROUP', 'Qty']];
  for (let d = 9; d <= 19; d++) { const s = f(d); if (s) Object.keys(s).forEach(st => aoa.push(['L', D(d), '', st, 'BT1M', s[st]])); }
  const mbl = ctx.loadMbl(aoa), rows = ctx.buildPrep(mbl, ['BT1M'], { ratios: { BT1M: 0.5 }, days: 3 }, () => null, {}, U(1), U(30));
  return { mbl, rows, G: ctx.groupGrid(mbl, 'BT1M', rows, { BT1M: 99 }, U(1), U(30), {}, null) };
}
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };
ok('style starting on Sunday starts on Monday, prep Thu-Fri-Sat before', () => {
  const r = run(d => d <= 14 ? { A: 4 } : { B: 6 });
  assert.deepEqual(Object.keys(r.G.lines.L.styles.B).map(Number).map(iso), ['16', '17', '18', '19']);
  assert.strictEqual(r.rows.length, 1); assert.strictEqual(iso(r.rows[0].load), '16'); assert.deepEqual(r.rows[0].days.map(iso), ['12', '13', '14']);
  assert.ok(!r.mbl.dates.some(d => new Date(d).getUTCDay() === 0));
});
ok('a style planned only on a Sunday is not lost', () => {
  const r = run(d => d <= 14 ? { A: 4 } : d === 15 ? { B: 6 } : { C: 5 });
  assert.ok(r.G.lines.L.styles.B && r.G.lines.L.styles.C); assert.deepEqual(r.rows.map(x => x.to).sort(), ['B', 'C']);
});
ok('a running style that ends on Sunday: Sunday ignored, next style starts Monday', () => {
  const r = run(d => d <= 15 ? { A: 4 } : { B: 6 });
  assert.deepEqual(Object.keys(r.G.lines.L.styles.A).map(Number).map(iso), ['09', '10', '11', '12', '13', '14']); assert.strictEqual(r.rows.length, 1);
});
ok('Monday totals count the moved style once', () => {
  const r = run(d => d <= 14 ? { A: 4 } : { B: 6 }); assert.strictEqual(r.mbl.byGroup.BT1M[U(16)], 6); assert.strictEqual(r.mbl.byGroup.BT1M[U(15)], undefined);
});
console.log(n + ' passed');
