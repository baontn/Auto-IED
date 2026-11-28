// ===================== POOL OF MACHINE GROUPS (v7.15): "Gộp loại máy" =====================
// Machine groups that can replace each other (e.g. a zigzag with trimmer by a normal zigzag) are combined in a pool the USER defines. Nothing is combined automatically:
// a pool is shown only when it is switched on. Every group keeps its own rows; the pool adds the spare machines of one group to the shortage of another (poolModel in prep.js).
// Definitions are personal (localStorage mdb_pools). The same bar and tables are used in the Shortage & prep tab, the IE Tech grid and the Remaining shortage tab.
// v7.15 (decided with the user): the pools are dictated by the CONSOLIDATOR (she defines them here and the ones switched on are sent with the proposal); IE Tech and the Supervisor follow them read-only (they can only hide / show a pool for their own view).
var POOL = { defs: [], on: {}, hide: {} };
try { POOL.defs = JSON.parse(localStorage.getItem('mdb_pools') || '[]'); POOL.on = JSON.parse(localStorage.getItem('mdb_pools_on') || '{}'); POOL.hide = JSON.parse(localStorage.getItem('mdb_pools_hide') || '{}'); } catch (e) { POOL.defs = []; POOL.on = {}; POOL.hide = {}; }
function poolStore() { try { localStorage.setItem('mdb_pools', JSON.stringify(POOL.defs)); localStorage.setItem('mdb_pools_on', JSON.stringify(POOL.on)); localStorage.setItem('mdb_pools_hide', JSON.stringify(POOL.hide)); } catch (e) { } }
// pools sent by the Consolidator: the ones in the latest proposal
function poolFromProposal() { var ps = (typeof TS !== 'undefined' && TS.props ? TS.props : []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }); return ps.length && Array.isArray(ps[0].pools) ? ps[0].pools : []; }
function poolToSend() { return POOL.defs.filter(function (d) { return POOL.on[d.id]; }).map(function (d) { return { id: d.id, members: d.members.slice(), cover: JSON.parse(JSON.stringify(d.cover)) }; }); }
function poolName(d) { return d.members.join(' + '); }
// ctx = { groups: function () -> [group], models: function (g) -> model or null, host: element }
function poolDayLabel(d) { return pDay(d, true); }
function poolBlock(def, ctx) {
  var miss = def.members.filter(function (g) { return !ctx.models(g); });
  if (miss.length) return '<div class="gblock"><h3 style="margin:8px 0">🔗 ' + esc(poolName(def)) + '</h3><div class="empty">' + esc(t('poolMissing', [miss.join(', ')])) + '</div></div>';
  var m0 = ctx.models(def.members[0]), days = m0.days, models = {}; def.members.forEach(function (g) { models[g] = ctx.models(g); });
  var R = poolModel(def, models, days), td = function (v, neg) { return '<td' + (neg && v < 0 ? ' class="neg"' : '') + '>' + (v === 0 ? '0' : v) + '</td>'; };
  var row = function (lbl, f, cls, neg) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="l" style="white-space:nowrap' + (cls === 'tot' ? ';font-weight:600' : '') + '">' + esc(lbl) + '</td>' + days.map(function (d) { return td(f(d), neg); }).join('') + '</tr>'; };
  var h = '<div class="gblock"><div class="row"><h3 style="margin:8px 0">🔗 ' + esc(poolName(def)) + '</h3><span class="muted small">' + esc(t('poolNote')) + '</span><span style="margin-left:auto"></span>' + (ctx.readonly ? '' : '<button data-pool-edit="' + esc(def.id) + '">' + esc(t('poolEdit')) + '</button>') + '</div>' +
    '<div class="tw" style="max-height:60vh"><table class="pg"><tr><th class="l">' + esc(t('poolRows')) + '</th>' + days.map(function (d) { return '<th>' + esc(poolDayLabel(d)) + '</th>'; }).join('') + '</tr>';
  def.members.forEach(function (g) {
    h += row(t('poolDem', [g]), function (d) { return models[g].total && models[g].total[d] != null ? models[g].total[d] : 0; }, '') +
      row(t('poolAvail', [g]), function () { return models[g].avail == null ? 0 : models[g].avail; }, '') + row(t('poolBal', [g]), function (d) { return R.bal[g][d]; }, 'tot', true);
  });
  R.pairs.forEach(function (pr) { var tk = R.take[pr[0] + '|' + pr[1]]; if (days.some(function (d) { return tk[d]; })) h += row(t('poolTake', [pr[0], pr[1]]), function (d) { return tk[d] || 0; }, 'pv'); });
  def.members.forEach(function (g) { h += row(t('poolAfter', [g]), function (d) { return R.after[g][d]; }, '', true); });
  h += row(t('poolTot'), function (d) { return R.tot[d]; }, 'tot', true) + row(t('poolShortAfter'), function (d) { return R.shortAfter[d]; }, 'tot');
  return h + '</table></div></div>';
}
function poolMount(host, ctx) {
  if (!host) return; ctx.host = host;
  var ro = !!ctx.readonly, defs = ro ? poolFromProposal() : POOL.defs, shown = function (d) { return ro ? !POOL.hide[d.id] : !!POOL.on[d.id]; };
  if (ro && !defs.length) { host.innerHTML = ''; host.onclick = null; return; }
  var h = '<div class="row" style="margin:10px 0 4px">' + (ro ? '<span class="muted small">' + esc(t('poolFollow')) + '</span>' : '<button data-pool-new="1">' + esc(t('poolBtn')) + '</button>') + '<div class="chips">' +
    defs.map(function (d) { return '<button data-pool-toggle="' + esc(d.id) + '" class="' + (shown(d) ? 'on' : '') + '" title="' + esc(t('poolToggleTip')) + '">🔗 ' + esc(poolName(d)) + '</button>'; }).join('') + '</div></div>';
  defs.forEach(function (d) { if (shown(d)) h += poolBlock(d, ctx); });
  host.innerHTML = h;
  host.onclick = function (e) {
    var b = e.target.closest('[data-pool-new],[data-pool-toggle],[data-pool-edit]'); if (!b) return; e.stopPropagation();
    if (b.dataset.poolNew && !ro) poolDialog(ctx, null);
    else if (b.dataset.poolToggle) { var id = b.dataset.poolToggle; if (ro) POOL.hide[id] = !POOL.hide[id]; else POOL.on[id] = !POOL.on[id]; poolStore(); poolMount(host, ctx); }
    else if (!ro) poolDialog(ctx, b.dataset.poolEdit);
  };
}
function poolDialog(ctx, id) {
  var groups = ctx.groups(), cur = id ? POOL.defs.filter(function (d) { return d.id === id; })[0] : null, old = document.getElementById('poolDlg'); if (old) old.remove();
  var mem = cur ? cur.members.slice() : [], cover = cur ? JSON.parse(JSON.stringify(cur.cover)) : {};
  var el = document.createElement('div'); el.id = 'poolDlg'; el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:60;display:flex;align-items:center;justify-content:center';
  function draw() {
    var h = '<div class="card" style="max-width:640px;width:92%;max-height:90vh;overflow:auto"><div class="row"><b>' + esc(t('poolTitle')) + '</b><button id="pdX" style="margin-left:auto">✕</button></div><p class="muted small">' + esc(t('poolIntro')) + '</p>' +
      '<div class="small"><b>' + esc(t('poolMembers')) + '</b></div><div class="chips" style="margin:6px 0">' + groups.map(function (g) { return '<label style="margin-right:10px"><input type="checkbox" data-pd-g="' + esc(g) + '"' + (mem.indexOf(g) >= 0 ? ' checked' : '') + '> ' + esc(g) + '</label>'; }).join('') + '</div>';
    if (mem.length >= 2) {
      h += '<div class="small" style="margin-top:8px"><b>' + esc(t('poolCoverCap')) + '</b></div><table class="pg" style="margin:6px 0"><tr><th class="l">' + esc(t('poolShort')) + '</th>' + mem.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>';
      mem.forEach(function (g) { h += '<tr><td class="l"><b>' + esc(g) + '</b></td>' + mem.map(function (c) { return c === g ? '<td>—</td>' : '<td><input type="checkbox" data-pd-c="' + esc(g) + '|' + esc(c) + '"' + ((cover[g] || []).indexOf(c) >= 0 ? ' checked' : '') + '></td>'; }).join('') + '</tr>'; });
      h += '</table>';
    }
    h += '<div class="row" style="margin-top:10px"><button class="primary" id="pdSave">' + esc(t('poolSave')) + '</button><button id="pdClose">' + esc(t('poolClose')) + '</button>' + (cur ? '<button id="pdDel" style="margin-left:auto">' + esc(t('poolDelete')) + '</button>' : '') + '<span class="muted small" id="pdMsg"></span></div></div>';
    el.innerHTML = h;
    el.querySelector('#pdX').onclick = el.querySelector('#pdClose').onclick = function () { el.remove(); };
    [].forEach.call(el.querySelectorAll('[data-pd-g]'), function (cb) {
      cb.onchange = function () {
        var g = cb.dataset.pdG; if (cb.checked) { if (mem.indexOf(g) < 0) { mem.push(g); mem.forEach(function (a) { cover[a] = cover[a] || []; mem.forEach(function (b) { if (a !== b && cover[a].indexOf(b) < 0 && (a === g || b === g)) cover[a].push(b); }); }); } }       // a new member can cover and be covered by default; the user unticks what is not allowed
        else { mem = mem.filter(function (x) { return x !== g; }); delete cover[g]; Object.keys(cover).forEach(function (a) { cover[a] = cover[a].filter(function (x) { return x !== g; }); }); }
        draw();
      };
    });
    [].forEach.call(el.querySelectorAll('[data-pd-c]'), function (cb) {
      cb.onchange = function () { var p = cb.dataset.pdC.split('|'); cover[p[0]] = (cover[p[0]] || []).filter(function (x) { return x !== p[1]; }); if (cb.checked) cover[p[0]].push(p[1]); };
    });
    el.querySelector('#pdSave').onclick = function () {
      if (mem.length < 2) { el.querySelector('#pdMsg').textContent = t('poolNeed2'); return; }
      var d = { id: cur ? cur.id : 'p' + Date.now().toString(36), members: mem.slice(), cover: {} }; mem.forEach(function (g) { d.cover[g] = (cover[g] || []).filter(function (x) { return mem.indexOf(x) >= 0; }); });
      if (cur) POOL.defs = POOL.defs.map(function (x) { return x.id === cur.id ? d : x; }); else POOL.defs.push(d);
      POOL.on[d.id] = true; poolStore(); el.remove(); poolMount(ctx.host, ctx);
    };
    var del = el.querySelector('#pdDel'); if (del) del.onclick = function () { POOL.defs = POOL.defs.filter(function (x) { return x.id !== cur.id; }); delete POOL.on[cur.id]; poolStore(); el.remove(); poolMount(ctx.host, ctx); };
  }
  draw(); document.body.appendChild(el);
}
// the three screens
function poolCtxPrep() { return { groups: function () { var S = SRC(); return S ? Object.keys(S.byGroup || {}).sort() : []; }, models: function (g) { try { return gridOf(g); } catch (e) { return null; } } }; }
function poolCtxTech() { return { readonly: true, groups: function () { var o = {}; TS.props.forEach(function (p) { (p.groups || []).forEach(function (g) { o[g] = 1; }); }); return Object.keys(o).sort(); },
  models: function (g) { var G0 = latestGrid(g); return G0 ? groupModel(G0, (TS.rows || []).filter(function (x) { return x.group === g; }), latestEnds(TS.ends)) : null; } }; }
function poolCtxResid(edit) { return { readonly: !edit, groups: function () { return RS.cache.map(function (x) { return x.g; }); }, models: function (g) { var X = RS.cache.filter(function (x) { return x.g === g; })[0]; return X ? X.M : null; } }; }
