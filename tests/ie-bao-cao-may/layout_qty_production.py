#!/usr/bin/env python3
"""IE Bao cao may v7.12: when IE Tech corrects the machines per layout of the next style (drawer "SL theo layout"), the loading line uses the corrected number
from the loading day too (not only the prep), the Consolidator is still notified, and the Consolidator's residual tab shows the same numbers.
Usage: python3 tests/ie-bao-cao-may/layout_qty_production.py [WORKDIR]   (synthetic demo data)"""
import sys, os, pathlib, subprocess, tempfile, json
HERE = pathlib.Path(__file__).resolve().parent; REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'tests' / 'sim'))
import simlib; from simlib import *
S = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); S.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(S / 'world')], check=True, stdout=subprocess.DEVNULL)
setup(S / 'world', S); SHARE = simlib.SHARE
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME)
    mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); mai.load(); pg = mai.pg
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom', MON.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(700)
    pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]', 'change'); pg.click('#pOpen'); pg.wait_for_timeout(2500); pg.click('#pSend'); pg.wait_for_timeout(1500); mai.push()
    hoa = IBM(br, 'Hoa'); hoa.open(at(2, 9, 0)); hp = hoa.pg
    hp.click('#roleSeg [data-role="tech"]'); hp.fill('#tName', 'Hoa'); hp.dispatch_event('#tName', 'input'); hp.select_option('#tPU', ''); hp.click('#tConnect'); hp.wait_for_timeout(1800)
    hp.click('#tGroupChips [data-tg="BT1M"]'); hp.wait_for_timeout(600)
    MODEL = "(()=>{const rows=techRows().filter(x=>x.group==='BT1M');const M=groupModel(latestGrid('BT1M'),rows,latestEnds(TS.ends));return {prod:M.prod,prep:M.prep,rows:rows.map(x=>({k:x.key,line:x.line,to:x.to,load:x.loadActual||x.load,qtyB:x.qtyB,qa:x.qtyAct==null?null:x.qtyAct,eff:x.eff}))}})()"
    before = hp.evaluate(MODEL)
    cand = [r for r in before['rows'] if r['qtyB'] > 0]; r0 = cand[0]; new_q = r0['qtyB'] + 3
    print('  row:', r0, '-> layout quantity', new_q)
    hp.click(f'[data-qe="{r0["k"]}"]'); hp.wait_for_timeout(500); hp.fill('#dLay', str(new_q)); hp.dispatch_event('#dLay', 'input'); hp.click('#dKeep'); hp.wait_for_timeout(1500)
    after = hp.evaluate(MODEL); r1 = [r for r in after['rows'] if r['k'] == r0['k']][0]
    check('the row carries the corrected quantity', r1['qa'] == new_q, str(r1))
    days = sorted(after['prod']); diff = {d: after['prod'][d] - before['prod'].get(d, 0) for d in days}
    pos = [d for d in days if diff[d]]; check('production changed only from the loading day on', pos and all(d >= r0['load'] for d in pos), f'{pos[:3]}.. load {r0["load"]}')
    check('every changed day is +3 (the corrected minus the database number)', set(diff[d] for d in pos) == {3}, str(sorted(set(diff.values()))))
    check('prep follows the corrected number too (as before)', r1['eff'] > r0['eff'] or r0['qtyB'] == 0, f'{r0["eff"]} -> {r1["eff"]}')
    notes = list((SHARE / 'data/prep/notices').glob('*.json')) if (SHARE / 'data/prep/notices').exists() else []
    hoa.push(); notes = list((SHARE / 'data/prep/notices').glob('*.json')) if (SHARE / 'data/prep/notices').exists() else []
    check('the Consolidator is still notified', any(json.loads(f.read_text()).get('layoutQty') == new_q for f in notes), f'{len(notes)} notice(s)')
    m2 = IBM(br, 'Mai'); m2.open(at(2, 10, 0)); m2.load(); mp = m2.pg
    mp.click('#mainTabs [data-tab="resid"]'); mp.wait_for_timeout(1800)
    res = mp.evaluate("(()=>{const X=RS.cache.filter(x=>x.g==='BT1M')[0];return X?X.M.prod:null})()")
    check('Consolidator residual tab: production equals IE Tech grid', res is not None and all(res.get(d, 0) == after['prod'].get(d, 0) for d in days), '')
    br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
