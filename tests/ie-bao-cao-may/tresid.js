// Unit tests of the residual-shortage functions in src/ie-bao-cao-may/prep.js (hand-calculated examples). Run: node tests/ie-bao-cao-may/tresid.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext('var skey=function(s){return String(s==null?"":s).toUpperCase().replace(/\\s+/g,"");};var norm=function(v){return String(v==null?"":v).toLowerCase().replace(/\\s+/g,"");};var findCol=function(h,n){for(var i=0;i<h.length;i++)if(norm(h[i])===norm(n))return i;return -1;};', ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/ie-bao-cao-may/prep.js'), 'utf8'), ctx);
const { groupModel, shortSummary, latestActions, actionCover, delayModel } = ctx;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };
// 8 working days d1..d8; machines available 5. Line A: X(2/day) d1-d4, Y(4/day) d5-d8. Line B: Z(1/day) d1-d8.
const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16', '2026-11-17'];
const rng = (a, b, q) => { const o = {}; days.slice(a, b + 1).forEach(d => o[d] = q); return o; };
const G0 = () => ({ days: days.slice(), avail: 5, lines: { A: { pu: 'PU1', styles: { X: rng(0, 3, 2), Y: rng(4, 7, 4) } }, B: { pu: 'PU2', styles: { Z: rng(0, 7, 1) } } } });
// one prep row: line A, X -> Y, 2 machines on d3,d4 (kept)
const rows = () => [{ key: 'A|X|Y|G', line: 'A', pu: 'PU1', from: 'X', to: 'Y', group: 'G', load: '2026-11-13', qtyB: 4, eff: 2, status: 'KEPT', days: [days[2], days[3]] }];
ok('totals: production + prep against availability', () => {
  const M = groupModel(G0(), rows(), {});
  assert.deepStrictEqual(days.map(d => M.prod[d]), [3, 3, 3, 3, 5, 5, 5, 5]);
  assert.deepStrictEqual(days.map(d => M.prep[d] || 0), [0, 0, 2, 2, 0, 0, 0, 0]);
  assert.deepStrictEqual(days.map(d => M.bal[d]), [2, 2, 0, 0, 0, 0, 0, 0]);
});
ok('shortSummary: days below zero, worst day, sum', () => {
  const g = G0(); g.avail = 4; const M = groupModel(g, rows(), {}), S = shortSummary(M.bal, M.days);
  assert.deepStrictEqual(M.days.map(d => M.bal[d]), [1, 1, -1, -1, -1, -1, -1, -1]);
  assert.strictEqual(S.n, 6); assert.strictEqual(S.gap, 1); assert.strictEqual(S.first, days[2]); assert.strictEqual(S.last, days[7]); assert.strictEqual(S.sum, 6);
});
ok('a removed prep row (eff 0) adds nothing', () => {
  const r = rows(); r[0].eff = 0; r[0].status = 'REMOVED'; const M = groupModel(G0(), r, {});
  assert.deepStrictEqual(days.map(d => M.prep[d] || 0), [0, 0, 0, 0, 0, 0, 0, 0]);
});
ok('IE Tech loading date later: Y starts 2 days later, X keeps running', () => {
  const r = rows(); r[0].loadActual = days[6]; r[0].days = [days[4], days[5]];                  // Y loads d7 instead of d5
  const M = groupModel(G0(), r, {});
  assert.deepStrictEqual(days.map(d => M.G.lines.A.styles.X[d] || 0), [2, 2, 2, 2, 2, 2, 0, 0]);
  assert.deepStrictEqual(days.map(d => M.G.lines.A.styles.Y[d] || 0), [0, 0, 0, 0, 0, 0, 4, 4]);
});
ok('end date of the running style cuts / extends it', () => {
  const M = groupModel(G0(), [], { 'A|X': { endDate: '2026-11-11' } });                          // X ends d3 instead of d4
  assert.deepStrictEqual(days.map(d => M.G.lines.A.styles.X[d] || 0), [2, 2, 2, 0, 0, 0, 0, 0]);
});
ok('actions: cover per day, cancelled / delay ignored, confirmed vs planned', () => {
  const acts = latestActions([
    { id: 'a1', group: 'G', type: 'RENT', qty: 2, from: days[2], to: days[4], status: 'PLANNED', at: '2026-11-09T01:00:00Z' },
    { id: 'a1', group: 'G', type: 'RENT', qty: 2, from: days[2], to: days[4], status: 'CONFIRMED', at: '2026-11-09T02:00:00Z' },        // later record of the same id wins
    { id: 'a2', group: 'G', type: 'BUY', qty: 1, from: days[3], to: days[3], status: 'PLANNED', at: '2026-11-09T03:00:00Z' },
    { id: 'a3', group: 'G', type: 'BORROW', qty: 9, from: days[0], to: days[7], status: 'CANCELLED', at: '2026-11-09T04:00:00Z' },
    { id: 'a4', group: 'G', type: 'DELAY', qty: null, from: '', to: '', status: 'PLANNED', note: 'K 3 days', at: '2026-11-09T05:00:00Z' },
    { id: 'a5', group: 'H', type: 'RENT', qty: 7, from: days[0], to: days[7], status: 'CONFIRMED', at: '2026-11-09T06:00:00Z' }]);
  assert.strictEqual(acts.length, 5);
  const c = actionCover(acts, 'G', days);
  assert.deepStrictEqual(days.map(d => c.confirmed[d]), [0, 0, 2, 2, 2, 0, 0, 0]);
  assert.deepStrictEqual(days.map(d => c.planned[d]), [0, 0, 0, 1, 0, 0, 0, 0]);
});
ok('what-if delay of Y by 2 working days (hand calculated)', () => {
  const g = G0(); g.avail = 4; const base = groupModel(g, [], {}), S = delayModel(g, [], {}, 'A', 'Y', 2);
  assert.deepStrictEqual(days.map(d => base.total[d]), [3, 3, 3, 3, 5, 5, 5, 5]);
  // X is extended through the gap (d5, d6), Y moves to d7..d8 (beyond the horizon it is dropped)
  assert.deepStrictEqual(days.map(d => S.G.lines.A.styles.X[d] || 0), [2, 2, 2, 2, 2, 2, 0, 0]);
  assert.deepStrictEqual(days.map(d => S.G.lines.A.styles.Y[d] || 0), [0, 0, 0, 0, 0, 0, 4, 4]);
  assert.deepStrictEqual(days.map(d => S.total[d]), [3, 3, 3, 3, 3, 3, 5, 5]);
  assert.strictEqual(shortSummary(base.bal, base.days).n, 4); assert.strictEqual(shortSummary(S.bal, S.days).n, 2);
});
ok('what-if: prep of the delayed style moves with it; the original grid is untouched', () => {
  const g = G0(), r = rows(), S = delayModel(g, r, {}, 'A', 'Y', 2);
  assert.deepStrictEqual(days.map(d => S.prep[d] || 0), [0, 0, 0, 0, 2, 2, 0, 0]);
  assert.deepStrictEqual(r[0].days, [days[2], days[3]]); assert.deepStrictEqual(Object.keys(g.lines.A.styles.Y), days.slice(4));
});
ok('what-if: unknown line or style returns null', () => { assert.strictEqual(delayModel(G0(), [], {}, 'Q', 'Y', 1), null); assert.strictEqual(delayModel(G0(), [], {}, 'A', 'NOPE', 1), null); });
console.log('ALL ' + n + ' PASS');
