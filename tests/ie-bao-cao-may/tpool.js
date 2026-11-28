// v7.15 pool of machine groups that can replace each other (hand-calculated). Run: node tests/ie-bao-cao-may/tpool.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/ie-bao-cao-may/prep.js'), 'utf8'), ctx);
const { poolModel } = ctx; let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };
const days = ['d1', 'd2', 'd3'], m = (b) => ({ bal: { d1: b[0], d2: b[1], d3: b[2] } });
const J = o => JSON.parse(JSON.stringify(o));
ok('a short group takes the spare machines of the group that may cover it', () => {
  const R = poolModel({ members: ['A', 'B'], cover: { A: ['B'], B: ['A'] } }, { A: m([-5, -2, 3]), B: m([8, 1, -4]) }, days);
  assert.deepEqual(J(R.take['A|B']), { d1: 5, d2: 1, d3: 0 }); assert.deepEqual(J(R.take['B|A']), { d1: 0, d2: 0, d3: 3 });
  assert.deepEqual(J(R.after.A), { d1: 0, d2: -1, d3: 0 }); assert.deepEqual(J(R.after.B), { d1: 3, d2: 0, d3: -1 });
  assert.deepEqual(J(R.tot), { d1: 3, d2: -1, d3: -1 }); assert.deepEqual(J(R.shortAfter), { d1: 0, d2: 1, d3: 1 });
});
ok('one way only: B may not use the spare of A', () => {
  const R = poolModel({ members: ['A', 'B'], cover: { A: ['B'], B: [] } }, { A: m([6, 6, 6]), B: m([-3, -3, -3]) }, days);
  assert.deepEqual(J(R.shortAfter), { d1: 3, d2: 3, d3: 3 }); assert.deepEqual(J(R.tot), { d1: 3, d2: 3, d3: 3 });
});
ok('three groups: order of the cover list decides who lends first, spare is never used twice', () => {
  const R = poolModel({ members: ['A', 'B', 'C'], cover: { A: ['B', 'C'], B: [], C: [] } }, { A: m([-6, -6, -6]), B: m([4, 0, 2]), C: m([5, 5, 5]) }, days);
  assert.deepEqual(J(R.take['A|B']), { d1: 4, d2: 0, d3: 2 }); assert.deepEqual(J(R.take['A|C']), { d1: 2, d2: 5, d3: 4 });
  assert.deepEqual(J(R.after.C), { d1: 3, d2: 0, d3: 1 }); assert.deepEqual(J(R.shortAfter), { d1: 0, d2: 1, d3: 0 });
});
ok('total remaining of the pool never changes (machines only move between members)', () => {
  const b = { A: m([-5, 2, 0]), B: m([3, -1, 4]), C: m([0, 0, -2]) };
  const R = poolModel({ members: ['A', 'B', 'C'], cover: { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] } }, b, days);
  days.forEach(d => assert.strictEqual(R.tot[d], b.A.bal[d] + b.B.bal[d] + b.C.bal[d]));
});
ok('a group that is not in the pool cannot lend', () => {
  const R = poolModel({ members: ['A', 'B'], cover: { A: ['B', 'Z'], B: [] } }, { A: m([-1, -1, -1]), B: m([0, 0, 0]) }, days);
  assert.strictEqual(R.pairs.length, 1);
});
console.log(n + ' passed');
