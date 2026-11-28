// ===================== POOL OF MACHINE GROUPS (v7.15+): "Gộp loại máy" =====================
// Machine groups that can replace each other (e.g. a zigzag with trimmer by a normal zigzag) are combined in a pool. Nothing is combined automatically: a pool is shown only when switched on.
// Every group keeps its own rows; the pool adds the spare machines of one group to the shortage of another (poolModel in prep.js).
// v7.16: the pools the CONSOLIDATOR switched on are sent with the proposal and followed (read-only) by IE Tech and the Supervisor.
// v7.18: IE Tech and the Supervisor can ALSO build pools of their own (saved on their computer); every pool table can be exported to Excel (formulas).
var POOL = { defs: [], on: {}, hide: {} };
try { POOL.defs = JSON.parse(localStorage.getItem('mdb_pools') || '[]'); POOL.on = JSON.parse(localStorage.getItem('mdb_pools_on') || '{}'); POOL.hide = JSON.parse(localStorage.getItem('mdb_pools_hide') || '{}'); } catch (e) { POOL.defs = []; POOL.on = {}; POOL.hide = {}; }
function poolStore() { try { localStorage.setItem('mdb_pools', JSON.stringify(POOL.defs)); localStorage.setItem('mdb_pools_on', JSON.stringify(POOL.on)); localStorage.setItem('mdb_pools_hide', JSON.stringify(POOL.hide)); } catch (e) { } }
function poolFromProposal() { var ps = (typeof TS !== 'undefined' && TS.props ? TS.props : []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }); return ps.length && Array.isArray(ps[0].pools) ? ps[0].pools : []; }
function poolToSend() { return POOL.defs.filter(function (d) { return POOL.on[d.id]; }).map(function (d) { return { id: d.id, members: d.members.slice(), cover: JSON.parse(JSON.stringify(d.cover)) }; }); }
function poolName(d) { return d.members.join(' + '); }
// ---- the table of one pool (every group stays visible)
function poolRowsOf(def, ctx) {
  var miss = def.members.filter(function (g) { return !ctx.models(g); }); if (miss.length) return { miss: miss };
  var models = {}; def.members.forEach(function (g) { models[g] = ctx.models(g); });
  var days = models[def.members[0]].days; return { models: models, days: days, R: poolModel(def, models, days) };
}
function poolBlock(e, ctx) {
  var def = e.def, P = poolRowsOf(def, ctx), tag = e.follow ? ' <span class="tag t-info">' + esc(t('poolFromCons')) + '</span>' : '';
  var head = '<div class="row"><h3 style="margin:8px 0">🔗 ' + esc(poolName(def)) + tag + '</h3><span class="muted small">' + esc(t('poolNote')) + '</span><span style="margin-left:auto"></span>' +
    (P.miss ? '' : '<button data-pool-xl="' + esc(e.sid) + '">' + esc(t('poolXl')) + '</button>') + (e.follow ? '' : '<button data-pool-edit="' + esc(def.id) + '">' + esc(t('poolEdit')) + '</button>') + '</div>';
  if (P.miss) return '<div class="gblock">' + head + '<div class="empty">' + esc(t('poolMissing', [P.miss.join(', ')])) + '</div></div>';
  var days = P.days, R = P.R, models = P.models, td = function (v, neg) { return '<td' + (neg && v < 0 ? ' class="neg"' : '') + '>' + v + '</td>'; };
  var row = function (lbl, f, cls, neg) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="l" style="white-space:nowrap' + (cls === 'tot' ? ';font-weight:600' : '') + '">' + esc(lbl) + '</td>' + days.map(function (d) { return td(f(d), neg); }).join('') + '</tr>'; };
  var h = '<div class="gblock">' + head + '<div class="tw" style="max-height:60vh"><table class="pg"><tr><th class="l">' + esc(t('poolRows')) + '</th>' + days.map(function (d) { return '<th>' + esc(pDay(d, true)) + '</th>'; }).join('') + '</tr>';
  def.members.forEach(function (g) {
    h += row(t('poolDem', [g]), function (d) { return models[g].total && models[g].total[d] != null ? models[g].total[d] : 0; }, '') +
      row(t('poolAvail', [g]), function () { return models[g].avail == null ? 0 : models[g].avail; }, '') + row(t('poolBal', [g]), function (d) { return R.bal[g][d]; }, 'tot', true);
  });
  R.pairs.forEach(function (pr) { var tk = R.take[pr[0] + '|' + pr[1]]; if (days.some(function (d) { return tk[d]; })) h += row(t('poolTake', [pr[0], pr[1]]), function (d) { return tk[d] || 0; }, 'pv'); });
  def.members.forEach(function (g) { h += row(t('poolAfter', [g]), function (d) { return R.after[g][d]; }, '', true); });
  h += row(t('poolTot'), function (d) { return R.tot[d]; }, 'tot', true) + row(t('poolShortAfter'), function (d) { return R.shortAfter[d]; }, 'tot');
  return h + '</table></div></div>';
}
// the pools a screen shows: followed ones (sent by the Consolidator) first, then the user's own
function poolEntries(ctx) {
  var out = [];
  if (ctx.follow) poolFromProposal().forEach(function (d) { out.push({ def: d, follow: true, sid: 'f:' + d.id, on: !POOL.hide['f:' + d.id] }); });
  POOL.defs.forEach(function (d) { out.push({ def: d, follow: false, sid: d.id, on: !!POOL.on[d.id] }); });
  return out;
}
function poolMount(host, ctx) {
  if (!host) return; ctx.host = host;
  var E = poolEntries(ctx);
  var h = '<div class="row" style="margin:10px 0 4px"><button data-pool-new="1">' + esc(t('poolBtn')) + '</button><div class="chips">' +
    E.map(function (e) { return '<button data-pool-toggle="' + esc(e.sid) + '" class="' + (e.on ? 'on' : '') + '" title="' + esc(t('poolToggleTip')) + '">🔗 ' + esc(poolName(e.def)) + (e.follow ? ' ★' : '') + '</button>'; }).join('') + '</div>' +
    (E.some(function (e) { return e.follow; }) ? '<span class="muted small">★ ' + esc(t('poolFollow')) + '</span>' : '') + '</div>';
  E.forEach(function (e) { if (e.on) h += poolBlock(e, ctx); });
  host.innerHTML = h;
  host.onclick = function (ev) {
    var b = ev.target.closest('[data-pool-new],[data-pool-toggle],[data-pool-edit],[data-pool-xl]'); if (!b) return; ev.stopPropagation();
    if (b.dataset.poolNew) poolDialog(ctx, null);
    else if (b.dataset.poolEdit) poolDialog(ctx, b.dataset.poolEdit);
    else if (b.dataset.poolXl) { var en = poolEntries(ctx).filter(function (x) { return x.sid === b.dataset.poolXl; })[0]; if (en) poolExportXlsx(en.def, ctx).catch(function (er) { alert(t('xlErr', [er.message])); }); }
    else { var id = b.dataset.poolToggle; if (id.indexOf('f:') === 0) POOL.hide[id] = !POOL.hide[id]; else POOL.on[id] = !POOL.on[id]; poolStore(); poolMount(host, ctx); }
  };
}
// ---- the picker: 1) tick the machine groups (numbered = borrowing order), 2) for each group say which others may lend it spare machines
function poolDialog(ctx, id) {
  var groups = ctx.groups(), cur = id ? POOL.defs.filter(function (d) { return d.id === id; })[0] : null, old = document.getElementById('poolDlg'); if (old) old.remove();
  var mem = cur ? cur.members.slice() : [], cover = cur ? JSON.parse(JSON.stringify(cur.cover)) : {}, q = '';
  var el = document.createElement('div'); el.id = 'poolDlg'; el.className = 'pdlg';
  var allPairs = function () { cover = {}; mem.forEach(function (a) { cover[a] = mem.filter(function (b) { return b !== a; }); }); };
  function draw() {
    var shown = groups.filter(function (g) { return !q || g.toUpperCase().indexOf(q.toUpperCase()) >= 0 || mem.indexOf(g) >= 0; });
    var h = '<div class="box"><div class="hd"><b style="font-size:16px">' + esc(t('poolTitle')) + '</b><button id="pdX" style="margin-left:auto">✕</button></div><div class="bd">' +
      '<p class="muted small" style="margin:0 0 4px">' + esc(t('poolIntro')) + '</p>' +
      '<h4>① ' + esc(t('poolStep1')) + '</h4><div class="row" style="margin-bottom:6px"><input type="text" id="pdQ" placeholder="' + esc(t('poolSearch')) + '" value="' + esc(q) + '" style="min-width:200px"><span class="muted small">' + esc(t('poolSelected')) + ': <b>' + (mem.length ? esc(mem.join(' → ')) : '—') + '</b></span></div>' +
      '<div class="scroll"><div class="pchips">' + shown.map(function (g) { var i = mem.indexOf(g); return '<button class="pchip' + (i >= 0 ? ' on' : '') + '" data-pd-g="' + esc(g) + '">' + (i >= 0 ? '<span class="n">' + (i + 1) + '</span>' : '') + esc(g) + '</button>'; }).join('') + '</div></div>';
    if (mem.length >= 2) {
      h += '<h4>② ' + esc(t('poolStep2')) + '</h4><div class="row" style="margin-bottom:4px"><button id="pdAll">' + esc(t('poolAllPairs')) + '</button><button id="pdNone">' + esc(t('poolNoPairs')) + '</button><span class="muted small">' + esc(t('poolOrderHint')) + '</span></div>';
      mem.forEach(function (g) {
        h += '<div class="lend"><b>' + esc(t('poolBorrow', [g])) + '</b><div class="pchips">' + mem.filter(function (c) { return c !== g; }).map(function (c) { return '<button class="pchip' + ((cover[g] || []).indexOf(c) >= 0 ? ' on' : '') + '" data-pd-c="' + esc(g) + '|' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div></div>';
      });
    }
    h += '</div><div class="ft"><button class="primary" id="pdSave">' + esc(t('poolSave')) + '</button><button id="pdClose">' + esc(t('poolClose')) + '</button>' + (cur ? '<button id="pdDel" style="margin-left:auto">' + esc(t('poolDelete')) + '</button>' : '') + '<span class="muted small" id="pdMsg" style="margin-left:8px"></span></div></div>';
    el.innerHTML = h;
    el.querySelector('#pdX').onclick = el.querySelector('#pdClose').onclick = function () { el.remove(); };
    var qi = el.querySelector('#pdQ'); qi.oninput = function () { q = qi.value; var pos = qi.selectionStart; draw(); var n = el.querySelector('#pdQ'); n.focus(); n.setSelectionRange(pos, pos); };
    [].forEach.call(el.querySelectorAll('[data-pd-g]'), function (b) {
      b.onclick = function () {
        var g = b.dataset.pdG;
        if (mem.indexOf(g) < 0) { mem.push(g); mem.forEach(function (a) { cover[a] = cover[a] || []; mem.forEach(function (c) { if (a !== c && cover[a].indexOf(c) < 0 && (a === g || c === g)) cover[a].push(c); }); }); }      // a new member may lend and borrow by default; untick what is not allowed
        else { mem = mem.filter(function (x) { return x !== g; }); delete cover[g]; Object.keys(cover).forEach(function (a) { cover[a] = cover[a].filter(function (x) { return x !== g; }); }); }
        draw();
      };
    });
    [].forEach.call(el.querySelectorAll('[data-pd-c]'), function (b) {
      b.onclick = function () { var p = b.dataset.pdC.split('|'), l = cover[p[0]] = cover[p[0]] || [], i = l.indexOf(p[1]); if (i >= 0) l.splice(i, 1); else l.push(p[1]); draw(); };
    });
    var all = el.querySelector('#pdAll'); if (all) { all.onclick = function () { allPairs(); draw(); }; el.querySelector('#pdNone').onclick = function () { cover = {}; mem.forEach(function (a) { cover[a] = []; }); draw(); }; }
    el.querySelector('#pdSave').onclick = function () {
      if (mem.length < 2) { el.querySelector('#pdMsg').textContent = t('poolNeed2'); return; }
      var d = { id: cur ? cur.id : 'p' + Date.now().toString(36), members: mem.slice(), cover: {} };
      mem.forEach(function (g) { d.cover[g] = mem.filter(function (x) { return x !== g && (cover[g] || []).indexOf(x) >= 0; }); });      // borrowing order = the order of the members
      if (cur) POOL.defs = POOL.defs.map(function (x) { return x.id === cur.id ? d : x; }); else POOL.defs.push(d);
      POOL.on[d.id] = true; poolStore(); el.remove(); poolMount(ctx.host, ctx);
    };
    var del = el.querySelector('#pdDel'); if (del) del.onclick = function () { POOL.defs = POOL.defs.filter(function (x) { return x.id !== cur.id; }); delete POOL.on[cur.id]; poolStore(); el.remove(); poolMount(ctx.host, ctx); };
  }
  draw(); document.body.appendChild(el);
}
// ---- Excel: the same sheet for the Shortage & prep export (linked to the group sheets) and for the single-pool export of every screen (values + formulas)
// link(g, kind, j) -> formula text of the group's total / avail / bal cell on another sheet, or null for plain values
function poolFillSheet(ws, def, models, days, link) {
  var R = poolModel(def, models, days), RW = {}, into = {}, from = {}, neg = [], cf = 0, red = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFDE8E8' } };
  ws.addRow([t('poolRows')].concat(days.map(function (d) { return pDay(d, true); }))).font = { bold: true }; ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]; ws.getColumn(1).width = 44;
  var L = function (j) { return ws.getColumn(2 + j).letter; };
  var add = function (name, label, f, v, style) {
    var row = ws.addRow([label].concat(days.map(function (d, j) { var fx = f(j, L(j)); return fx == null ? v(d) : { formula: fx, result: v(d) }; }))); RW[name] = row.number;
    row.font = style === 'part' ? { italic: true, color: { argb: 'FF6B7280' } } : (style === 'bold' ? { bold: true } : {}); return row.number;
  };
  def.members.forEach(function (g) {
    add('dem' + g, t('poolDem', [g]), function (j) { return link ? link(g, 'total', j) : null; }, function (d) { return models[g].total && models[g].total[d] != null ? models[g].total[d] : 0; });
    add('av' + g, t('poolAvail', [g]), function (j) { return link ? link(g, 'avail', j) : null; }, function () { return models[g].avail == null ? 0 : models[g].avail; });
    neg.push(add('bal' + g, t('poolBal', [g]), function (j, c) { return link ? link(g, 'bal', j) : c + RW['av' + g] + '-' + c + RW['dem' + g]; }, function (d) { return R.bal[g][d]; }, 'bold'));
  });
  def.members.forEach(function (g) {
    add('sh' + g, '   ' + g + ' — ' + t('poolShortRow'), function (j, c) { return 'MAX(0,-' + c + RW['bal' + g] + ')'; }, function (d) { return R.short[g][d]; }, 'part');
    add('sp' + g, '   ' + g + ' — ' + t('poolSpareRow'), function (j, c) { return 'MAX(0,' + c + RW['bal' + g] + ')'; }, function (d) { return Math.max(0, R.bal[g][d]); }, 'part');
  });
  R.pairs.forEach(function (pr, i) {
    var g = pr[0], h = pr[1], a = (into[g] = into[g] || []).slice(), b = (from[h] = from[h] || []).slice(), nm = 'tk' + i;
    var sum = function (c, rows) { return rows.length ? '(' + rows.map(function (r) { return c + r; }).join('+') + ')' : '0'; };
    add(nm, t('poolTake', [g, h]), function (j, c) { return 'MIN(' + c + RW['sh' + g] + '-' + sum(c, a) + ',' + c + RW['sp' + h] + '-' + sum(c, b) + ')'; }, function (d) { return R.take[g + '|' + h][d] || 0; });
    into[g].push(RW[nm]); from[h].push(RW[nm]);
  });
  var first = null, last = null;
  def.members.forEach(function (g) {
    var plus = function (c, rows) { return rows.length ? '+' + rows.map(function (r) { return c + r; }).join('+') : ''; }, minus = function (c, rows) { return rows.length ? '-' + rows.map(function (r) { return c + r; }).join('-') : ''; };
    var r = add('af' + g, t('poolAfter', [g]), function (j, c) { return c + RW['bal' + g] + plus(c, into[g] || []) + minus(c, from[g] || []); }, function (d) { return R.after[g][d]; }, 'bold');
    if (first == null) first = r; last = r; neg.push(r);
  });
  neg.push(add('tot', t('poolTot'), function (j, c) { return 'SUM(' + c + first + ':' + c + last + ')'; }, function (d) { return R.tot[d]; }, 'bold'));
  add('sa', t('poolShortAfter'), function (j, c) { return def.members.map(function (g) { return 'MAX(0,-' + c + RW['af' + g] + ')'; }).join('+'); }, function (d) { return R.shortAfter[d]; }, 'bold');
  if (days.length) neg.forEach(function (r) { ws.addConditionalFormatting({ ref: 'B' + r + ':' + L(days.length - 1) + r, rules: [{ type: 'cellIs', operator: 'lessThan', priority: ++cf, formulae: [0], style: { fill: red, font: { bold: true, color: { argb: 'FFC4202B' } } } }] }); });
}
async function poolExportXlsx(def, ctx) {
  var P = poolRowsOf(def, ctx); if (P.miss) throw new Error(t('poolMissing', [P.miss.join(', ')]));
  var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(('POOL ' + def.members.join('+')).replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 31));
  poolFillSheet(ws, def, P.models, P.days, null);
  var buf = await wb.xlsx.writeBuffer(), a = document.createElement('a'), d0 = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = 'POOL_' + def.members.join('+').replace(/[^\w+\-]/g, '_') + '_' + d0.getFullYear() + p(d0.getMonth() + 1) + p(d0.getDate()) + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
}
// the three screens
function poolCtxPrep() { return { follow: false, groups: function () { var S = SRC(); return S ? Object.keys(S.byGroup || {}).sort() : []; }, models: function (g) { try { return gridOf(g); } catch (e) { return null; } } }; }
function poolCtxTech() { return { follow: true, groups: function () { var o = {}; TS.props.forEach(function (p) { (p.groups || []).forEach(function (g) { o[g] = 1; }); }); return Object.keys(o).sort(); },
  models: function (g) { var G0 = latestGrid(g); return G0 ? groupModel(G0, (TS.rows || []).filter(function (x) { return x.group === g; }), latestEnds(TS.ends)) : null; } }; }
function poolCtxResid(edit) { return { follow: !edit, groups: function () { return RS.cache.map(function (x) { return x.g; }); }, models: function (g) { var X = RS.cache.filter(function (x) { return x.g === g; })[0]; return X ? X.M : null; } }; }
