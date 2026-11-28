// v7.21: prep machines by day before loading: D-1 100 %, D-2 70 %, D-3 30 %, further days = last % (hand-calculated). Run: node tests/ie-bao-cao-may/tprepday.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/ie-bao-cao-may/prep.js'), 'utf8'), ctx);
const { prepQtyAt, prepQtyOn, groupModel, applyReviews, pctOfRules, buildPrep } = ctx; let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };
const mk = (eff, days, extra) => Object.assign({ eff, days: days.map((d, i) => 'd' + (i + 1)), prep: eff }, extra || {});
const qs = x => x.days.map((d, i) => prepQtyAt(x, i));
ok('default 100 / 70 / 30 on 3 prep days (D-3 first)', () => { assert.deepEqual([...qs(mk(10, [1, 2, 3]))], [3, 7, 10]); });
ok('more prep days: every extra day takes 30 %', () => { assert.deepEqual([...qs(mk(10, [1, 2, 3, 4, 5]))], [3, 3, 3, 7, 10]); });
ok('fewer days: D-1 stays 100 %, D-2 70 %', () => { assert.deepEqual([...qs(mk(10, [1, 2]))], [7, 10]); assert.deepEqual([...qs(mk(10, [1]))], [10]); });
ok('round up (ROUNDUP like the prep quantity): 3 machines -> 1, 3, 3', () => { assert.deepEqual([...qs(mk(3, [1, 2, 3]))], [1, 3, 3]); });
ok('IE Tech row percentages (pctRow) win; days beyond them use the last one', () => { assert.deepEqual([...qs(mk(10, [1, 2, 3, 4], { pctRow: [100, 50] }))], [5, 5, 5, 10]); });
ok('the Consolidator default per group (rules.pctBy) goes into the rows, else the global / built-in curve', () => {
  assert.deepEqual([...pctOfRules({ pctBy: { A: [100, 60, 20] } }, 'A')], [100, 60, 20]); assert.deepEqual([...pctOfRules({}, 'A')], [100, 70, 30]); assert.deepEqual([...pctOfRules({ pct: [100, 80] }, 'B')], [100, 80]);
});
ok('applyReviews: review.prepPct becomes pctRow; no review = default', () => {
  const x = { key: 'K|X|Y|G', load: 1, qtyB: 4, ratio: 0.5, prep: 2, days: [1], flags: [] }, y = { key: 'K|X|Z|G', load: 1, qtyB: 4, ratio: 0.5, prep: 2, days: [1], flags: [] };
  applyReviews([x, y], [{ key: x.key, decision: 'KEEP', prepPct: [100, 40, 10], at: '1' }]); assert.deepEqual([...x.pctRow], [100, 40, 10]); assert.strictEqual(y.pctRow, null);
});
ok('totals per day follow the curve (IE Tech grid / residual model)', () => {
  const days = ['d1', 'd2', 'd3', 'd4', 'd5'], G0 = { days, avail: 100, lines: { K: { pu: 'PU1', styles: { Y: { d4: 5, d5: 5 } } } } };
  const row = { key: 'K|X|Y|G', line: 'K', pu: 'PU1', from: 'X', to: 'Y', group: 'G', load: 'd4', qtyB: 20, eff: 10, status: 'KEPT', days: ['d1', 'd2', 'd3'] };
  const M = groupModel(G0, [row], {}); assert.deepEqual(days.map(d => M.prep[d] || 0), [3, 7, 10, 0, 0]);
});
console.log(n + ' passed');
