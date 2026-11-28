// v7.17: the loading date set by IE Tech in one machine group applies to every group of the changeover (line | from | to). Run: node tests/ie-bao-cao-may/tchangeover.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/ie-bao-cao-may/prep.js'), 'utf8'), ctx);
const { applyReviews, changeoverDates, groupModel } = ctx; let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };
const U = s => Date.parse(s + 'T00:00:00Z'), row = (g, extra) => Object.assign({ key: 'K|X|Y|' + g, line: 'K', from: 'X', to: 'Y', group: g, load: U('2026-11-13'), qtyB: 4, ratio: 0.5, prep: 2, days: [U('2026-11-10'), U('2026-11-11'), U('2026-11-12')], flags: [] }, extra || {});
const rev = (g, extra) => Object.assign({ key: 'K|X|Y|' + g, decision: 'KEEP', loadDate: '2026-11-13', at: '2026-11-09T10:00:00Z' }, extra || {});
ok('a date set in ZZM moves the ZZF row of the same changeover (even without its own review)', () => {
  const z = row('ZZM'), f = row('ZZF'); applyReviews([z, f], [rev('ZZM', { loadDateActual: '2026-11-16' })]);
  assert.strictEqual(z.loadActual, U('2026-11-16')); assert.strictEqual(f.loadActual, U('2026-11-16')); assert.ok(f.flags.indexOf('dateSet') >= 0); assert.strictEqual(f.status, 'PENDING');
  assert.strictEqual(new Date(f.days[2]).toISOString().slice(0, 10), '2026-11-14');      // prep ends on the Saturday before the Monday
});
ok('another changeover is not touched', () => {
  const other = row('ZZF', { key: 'K|Y|Z|ZZF', from: 'Y', to: 'Z', load: U('2026-11-20') }); applyReviews([other], [rev('ZZM', { loadDateActual: '2026-11-17' })]); assert.strictEqual(other.loadActual, undefined);
});
ok('the latest date wins; setting the planned date again cancels the move', () => {
  const f = row('ZZF'); applyReviews([f], [rev('ZZM', { loadDateActual: '2026-11-17' }), rev('ZZF', { loadDateActual: '2026-11-13', at: '2026-11-09T11:00:00Z' })]);
  assert.strictEqual(f.loadActual, undefined);
});
ok('a date set for an older plan is not inherited when the plan date changed (another group)', () => {
  const f = row('ZZF', { load: U('2026-11-20') }); applyReviews([f], [rev('ZZM', { loadDateActual: '2026-11-17' })]); assert.strictEqual(f.loadActual, undefined);
});
ok('a group WITHOUT prep rows (ratio 0): its production follows the changeover date too', () => {
  const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16', '2026-11-17'], rng = (a, b, q) => { const o = {}; days.slice(a, b + 1).forEach(d => o[d] = q); return o; };
  ctx.CHG_DATES = changeoverDates([rev('ZZM', { loadDateActual: '2026-11-16' })]);                         // X -> Y moves from Fri 13 Nov to Mon 16 Nov
  const G0 = { days, avail: 99, lines: { K: { pu: 'PU1', styles: { X: rng(0, 3, 2), Y: rng(4, 7, 4) } } } };
  const M = groupModel(G0, [], {});                                                                         // ZZF: no rows
  assert.deepEqual(days.map(d => M.prod[d]), [2, 2, 2, 2, 2, 2, 4, 4]);
  ctx.CHG_DATES = {};
});
console.log(n + ' passed');
