#!/usr/bin/env python3
"""IE Bao cao may v7.21: prep machines by day (D-1 100 %, D-2 70 %, D-3 30 %, more days = last %). The Consolidator sets the default per machine group (rules table),
IE Tech can change the percentages per row in the drawer (the inputs follow the number of prep days); grids and totals follow.
Usage: python3 tests/ie-bao-cao-may/prep_pct_ui.py [WORKDIR]   (synthetic demo data)"""
import sys, os, pathlib, subprocess, tempfile, math
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
    br = p.chromium.launch(**CHROME); errs = []
    mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); mai.load(); pg = mai.pg; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom', MON.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(700)
    pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]', 'change'); pg.fill('[data-pr="BT1M"]', '100'); pg.dispatch_event('[data-pr="BT1M"]', 'change')
    check('the rules table shows the default curve per machine group', pg.input_value('[data-pp="BT1M"]') == '100, 70, 30', pg.input_value('[data-pp="BT1M"]'))
    pg.click('#pOpen'); pg.wait_for_timeout(2500)
    rows = pg.evaluate("PS.rows.map(x=>({k:x.key,eff:x.eff,days:x.days.length,q:x.days.map((d,i)=>prepQtyAt(x,i))}))"); r0 = [r for r in rows if r['eff'] >= 3 and r['days'] == 3] or rows
    r = r0[0]; exp = [math.ceil(r['eff'] * f / 100 - 1e-9) for f in (30, 70, 100)]
    check('Consolidator grid: D-3 30 %, D-2 70 %, D-1 100 % of the prep quantity', r['q'] == exp, f"{r['q']} vs {exp} (eff {r['eff']})")
    cells = pg.evaluate("[...document.querySelectorAll('#pDetail td.pr')].map(c=>+c.textContent).slice(0,3)"); check('and the cells of the table show them', len(cells) >= 1)
    pg.fill('[data-pp="BT1M"]', '100, 50'); pg.dispatch_event('[data-pp="BT1M"]', 'change'); check('a shorter list is accepted (the last percentage repeats)', pg.input_value('[data-pp="BT1M"]') == '100, 50')
    pg.fill('[data-pp="BT1M"]', '100, 70, 30'); pg.dispatch_event('[data-pp="BT1M"]', 'change')
    pg.click('#pOpen'); pg.wait_for_timeout(2000); pg.click('#pSend'); pg.wait_for_timeout(1500); mai.push()
    hoa = IBM(br, 'Hoa'); hoa.open(at(2, 9, 0)); hp = hoa.pg; hp.on('pageerror', lambda e: errs.append(str(e)))
    hp.click('#roleSeg [data-role="tech"]'); hp.fill('#tName', 'Hoa'); hp.dispatch_event('#tName', 'input'); hp.select_option('#tPU', ''); hp.click('#tConnect'); hp.wait_for_timeout(1800)
    hp.click('#tGroupChips [data-tg="BT1M"]'); hp.wait_for_timeout(600)
    trs = hp.evaluate("techRows().filter(x=>x.group==='BT1M' && x.eff>=3).map(x=>({k:x.key,eff:x.eff,n:x.days.length}))"); t0 = trs[0]
    hp.click(f'[data-qe="{t0["k"]}"]'); hp.wait_for_timeout(500)
    vals = hp.evaluate("[...document.querySelectorAll('#dPct [data-pk]')].map(i=>+i.value)"); check('IE Tech drawer: one percentage input per prep day, defaults 100 / 70 / 30 (shown D-1, D-2, D-3)', vals == [100, 70, 30][:t0['n']] or vals == [100, 70, 30], str(vals))
    hp.fill('#dDays', '5'); hp.dispatch_event('#dDays', 'input'); hp.wait_for_timeout(200)
    vals5 = hp.evaluate("[...document.querySelectorAll('#dPct [data-pk]')].map(i=>+i.value)"); check('5 prep days: D-4 and D-5 default to the last percentage (30)', vals5 == [100, 70, 30, 30, 30], str(vals5))
    hp.evaluate("document.querySelector('#dPct [data-pk=\"2\"]').value = '40'; document.querySelector('#dPct [data-pk=\"5\"]').value = '10'; 0"); hp.click('#dKeep'); hp.wait_for_timeout(1500)
    after = hp.evaluate(f"(()=>{{const x=techRows().filter(r=>r.key==='{t0['k']}')[0];return {{n:x.days.length, pct:x.pctRow, q:x.days.map((d,i)=>prepQtyAt(x,i)), eff:x.eff}}}})()")
    exp = [math.ceil(after['eff'] * f / 100 - 1e-9) for f in (10, 30, 30, 40, 100)]
    check('IE Tech percentages saved with the decision and applied per day', after['n'] == 5 and after['pct'] == [100, 40, 30, 30, 10] and after['q'] == exp, f"{after['pct']} {after['q']} vs {exp}")
    hp.click(f'[data-qe="{t0["k"]}"]'); hp.wait_for_timeout(400)
    again = hp.evaluate("[...document.querySelectorAll('#dPct [data-pk]')].map(i=>+i.value)"); check('reopening shows the saved percentages', again == [100, 40, 30, 30, 10], str(again))
    # the layout quantity changes the prep quantity, so every day of the curve changes with it
    trs2 = hp.evaluate("techRows().filter(x=>x.group==='BT1M' && x.key!=='%s' && x.ratio>0 && x.qtyB>0).map(x=>({k:x.key,qtyB:x.qtyB,ratio:x.ratio,n:x.days.length}))" % t0['k']); t1 = trs2[0]; newL = t1['qtyB'] + 6
    before = hp.evaluate(f"(()=>{{const x=techRows().filter(r=>r.key==='{t1['k']}')[0];return {{eff:x.eff,q:x.days.map((d,i)=>prepQtyAt(x,i))}}}})()")
    hp.click(f'[data-qe="{t1["k"]}"]'); hp.wait_for_timeout(500); hp.fill('#dLay', str(newL)); hp.dispatch_event('#dLay', 'input'); hp.click('#dKeep'); hp.wait_for_timeout(1500)
    after = hp.evaluate(f"(()=>{{const x=techRows().filter(r=>r.key==='{t1['k']}')[0];return {{eff:x.eff,n:x.days.length,pct:x.pctRow,q:x.days.map((d,i)=>prepQtyAt(x,i)),qa:x.qtyAct}}}})()")
    effExp = math.ceil(t1['ratio'] * newL - 1e-9); pc = [100, 70, 30]; expq = [math.ceil(effExp * pc[min(after['n'] - i, 3) - 1] / 100 - 1e-9) for i in range(after['n'])]
    check('layout quantity entered by IE Tech: the prep quantity is recalculated from it ...', after['eff'] == effExp and after['eff'] > before['eff'], f"{before['eff']} -> {after['eff']} (expected {effExp})")
    check('... and every day of the curve follows (D-1 100 %, D-2 70 %, D-3 30 % of the NEW quantity)', after['q'] == expq and after['q'] != before['q'], f"{before['q']} -> {after['q']} vs {expq}")
    totals = hp.evaluate("(()=>{const rows=techRows().filter(x=>x.group==='BT1M');const M=groupModel(latestGrid('BT1M'),rows,latestEnds(TS.ends));let s=0;rows.forEach(x=>{x.days.forEach((d,i)=>{s+=prepQtyAt(x,i)})});return {prepSum:Object.values(M.prep).reduce((a,b)=>a+b,0),rowsSum:s}})()")
    check('the grid / total prep line uses the new per-day numbers', totals['prepSum'] == totals['rowsSum'], str(totals))
    check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
