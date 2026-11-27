// IE Tech corrects the layout quantity of the next style: the loading line follows too (not only the prep). Run: node tests/ie-bao-cao-may/tlayqty.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext('var skey=function(s){return String(s==null?"":s).toUpperCase().replace(/\\s+/g,"");};var norm=function(v){return String(v==null?"":v).toLowerCase().replace(/\\s+/g,"");};var findCol=function(h,n){for(var i=0;i<h.length;i++)if(norm(h[i])===norm(n))return i;return -1;};', ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/ie-bao-cao-may/prep.js'), 'utf8'), ctx);
const { groupModel, applyReviews, groupGrid } = ctx;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };
const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16', '2026-11-17'];
const rng = (a, b, q) => { const o = {}; days.slice(a, b + 1).forEach(d => o[d] = q); return o; };
const G0 = () => ({ days: days.slice(), avail: 20, lines: { A: { pu: 'PU1', styles: { X: rng(0, 3, 2), Y: rng(4, 7, 4) } }, B: { pu: 'PU2', styles: { Z: rng(0, 7, 1) } } } });
const row = extra => Object.assign({ key: 'A|X|Y|G', line: 'A', pu: 'PU1', from: 'X', to: 'Y', group: 'G', load: '2026-11-13', qtyB: 4, ratio: 0.5, prep: 2, eff: 2, status: 'KEPT', days: [days[2], days[3]], flags: [] }, extra || {});
ok('layout quantity 6 instead of 4: the loading line uses 6 from the loading day', () => {
  const M = groupModel(G0(), [row({ qtyAct: 6, eff: 3 })], {});
  assert.deepEqual(days.map(d => M.prod[d]), [3, 3, 3, 3, 7, 7, 7, 7]);           // line A: X 2 then Y 6; line B: 1
  assert.deepEqual(days.map(d => M.prep[d] || 0), [0, 0, 3, 3, 0, 0, 0, 0]);
});
ok('no corrected quantity: unchanged', () => { const M = groupModel(G0(), [row()], {}); assert.deepEqual(days.map(d => M.prod[d]), [3, 3, 3, 3, 5, 5, 5, 5]); });
ok('works together with a later loading date (previous style continues, new quantity from the new date)', () => {
  const M = groupModel(G0(), [row({ qtyAct: 6, loadActual: '2026-11-16' })], {});
  assert.deepEqual(days.map(d => M.prod[d]), [3, 3, 3, 3, 3, 3, 7, 7]);
});
ok('applyReviews: KEEP with layout quantity sets qtyAct, prep follows, flag layoutQty', () => {
  const x = { key: 'A|X|Y|G', line: 'A', from: 'X', to: 'Y', group: 'G', load: 1, qtyB: 4, ratio: 0.5, prep: 2, days: [1], flags: [] };
  applyReviews([x], [{ key: x.key, decision: 'KEEP', qtyBActual: 6, at: '2026-11-10T00:00:00Z' }]);
  assert.strictEqual(x.qtyAct, 6); assert.strictEqual(x.eff, 3); assert.ok(x.flags.indexOf('layoutQty') >= 0);
});
ok('applyReviews: same quantity as the database or a removed row: no correction', () => {
  const a = { key: 'k1', load: 1, qtyB: 4, ratio: 0.5, prep: 2, days: [1], flags: [] }, b = { key: 'k2', load: 1, qtyB: 4, ratio: 0.5, prep: 2, days: [1], flags: [] };
  applyReviews([a, b], [{ key: 'k1', decision: 'KEEP', qtyBActual: 4, at: '1' }, { key: 'k2', decision: 'REMOVE', qtyBActual: 6, at: '1' }]);
  assert.strictEqual(a.qtyAct, undefined); assert.strictEqual(b.qtyAct, undefined);
});
ok('groupGrid (Consolidator grid): production follows qtyAct too', () => {
  const U = d => Date.parse(d + 'T00:00:00Z'), D = days.map(U), lines = { A: {} };
  D.forEach((d, i) => { lines.A[d] = i < 4 ? { X: { G: 2 } } : { Y: { G: 4 } }; });
  const r = row({ qtyAct: 6, eff: 3, load: U('2026-11-13'), days: [D[2], D[3]] });
  const G = groupGrid({ lines, byGroup: {}, dates: D }, 'G', [r], { G: 20 }, D[0], D[7], {}, null);
  assert.deepEqual(D.map(d => G.prod[d]), [2, 2, 2, 2, 6, 6, 6, 6]);
});
console.log(n + ' passed');
