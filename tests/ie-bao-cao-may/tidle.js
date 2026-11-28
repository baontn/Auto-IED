// v7.22: empty line days ("Not Set up") and the Advance B estimate (hand-calculated). Run: node tests/ie-bao-cao-may/tidle.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext('var skey=function(s){return String(s==null?"":s).toUpperCase().replace(/\\s+/g,"");};var norm=function(v){return String(v==null?"":v).toLowerCase().replace(/\\s+/g,"");};var findCol=function(h,n){for(var i=0;i<h.length;i++) if(norm(h[i])===norm(n)) return i; return -1;};', ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/ie-bao-cao-may/prep.js'), 'utf8'), ctx);
const { idleInfo, withFill, buildPrep, groupGrid } = ctx; let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };
const U = d => Date.UTC(2026, 10, d), days = [9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24].map(U);      // 14 working days (Mon-Sat), Sundays left out
const mk = plan => { const lines = {}, byGroup = {}; Object.keys(plan).forEach(l => { lines[l] = {}; Object.keys(plan[l]).forEach(i => { const d = days[i]; lines[l][d] = {}; Object.keys(plan[l][i]).forEach(s => { lines[l][d][s] = plan[l][i][s]; }); }); }); return { lines, byGroup, dates: days.slice() }; };
const seq = (l, parts) => { const o = {}; parts.forEach(([s, a, b, g]) => { for (let i = a; i <= b; i++) o[i] = Object.assign({}, o[i], { [s]: g }); }); return o; };
// line K: A (4/day BT1M) day 0-3, EMPTY 4-6, B (7/day) 7-10, EMPTY 11-13 (end of plan)   line J: starts on day 2 (leading empty 0-1)
const M = () => mk({ K: seq('K', [['A', 0, 3, { BT1M: 4 }], ['B', 7, 10, { BT1M: 7 }]]), J: seq('J', [['C', 2, 13, { BT1M: 2 }]]) });
ok('finds the three kinds of empty days', () => {
  const I = idleInfo(M(), false, 14), k = I.list.filter(r => r.line === 'K'), j = I.list.filter(r => r.line === 'J');
  assert.deepEqual(k.map(r => [r.kind, r.n]), [['gap', 3], ['trail', 3]]); assert.deepEqual(j.map(r => [r.kind, r.n]), [['lead', 2]]);
  assert.deepEqual([...k[0].A], ['A']); assert.deepEqual([...k[0].B], ['B']); assert.ok(I.list.every(r => r.src === 'none'));
});
ok('Advance B: the gap takes the machines of the style AFTER it, the end of the plan drags the last style, leading days stay empty', () => {
  const m = withFill(M(), idleInfo(M(), true, 14)), K = m.lines.K;
  assert.deepEqual([4, 5, 6].map(i => K[days[i]].B && K[days[i]].B.BT1M), [7, 7, 7]); assert.deepEqual([11, 12, 13].map(i => K[days[i]].B.BT1M), [7, 7, 7]);
  assert.ok(m.lines.J[days[0]] === undefined && m.lines.J[days[1]] === undefined); assert.ok(m.est.K[days[5]] && !m.est.K[days[0]]);
  assert.strictEqual(m.byGroup.BT1M[days[5]], 7 + 2);                                         // K (B) + J (C)
});
ok('a gap longer than the cap is not filled', () => { const I = idleInfo(M(), true, 2), g = I.list.filter(r => r.kind === 'gap')[0]; assert.strictEqual(g.src, 'none'); const m = withFill(M(), I); assert.strictEqual(m.lines.K[days[5]], undefined); });
ok('style B without machine data: the style before (A) is dragged', () => {
  const m0 = mk({ K: seq('K', [['A', 0, 3, { BT1M: 4 }], ['B', 7, 10, {}]]) }), I = idleInfo(m0, true, 14), g = I.list.filter(r => r.kind === 'gap')[0]; assert.strictEqual(g.src, 'A');
  assert.strictEqual(withFill(m0, I).lines.K[days[5]].A.BT1M, 4);
});
ok('the next style now starts at the first empty day: its changeover (prep) moves there', () => {
  const m = withFill(M(), idleInfo(M(), true, 14)), rows = buildPrep(m, ['BT1M'], { ratios: { BT1M: 0.5 }, days: 3 }, () => null, {}, days[0], days[13]);
  const r = rows.filter(x => x.to === 'B')[0]; assert.strictEqual(r.load, days[4]);
  const m2 = M(), rows2 = buildPrep(m2, ['BT1M'], { ratios: { BT1M: 0.5 }, days: 3 }, () => null, {}, days[0], days[13]); assert.strictEqual(rows2.filter(x => x.to === 'B')[0].load, days[7]);
});
ok('the grid knows the empty and the estimated days of a line', () => {
  const m = withFill(M(), idleInfo(M(), true, 14)), G = groupGrid(m, 'BT1M', [], { BT1M: 99 }, days[0], days[13], {}, null);
  assert.strictEqual(G.lines.K.idle[days[5]].est, true); assert.strictEqual(G.lines.J.idle[days[0]].kind, 'lead'); assert.ok(G.lines.K.est[days[5]]);
});
console.log(n + ' passed');
