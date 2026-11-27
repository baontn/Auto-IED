#!/usr/bin/env python3
"""Layout Check login time with many check files and a big Machine Database (synthetic).
Usage: python3 tests/layout-check/login_speed.py [N_CHECKS=1500] [N_DB_ROWS=150000]   (COLD=1 clears the caches before the measured login)"""
import sys, os, shutil, pathlib, json, time, random, datetime as dt
REPO = pathlib.Path(__file__).resolve().parents[2]; sys.path.insert(0, str(REPO / 'tools/manual_shots'))
from lc_common import serve, put, put_tree, login, stub_idb, HERE
from playwright.sync_api import sync_playwright
import openpyxl
NVAL = int(sys.argv[1]) if len(sys.argv) > 1 else 2000; NDB = int(sys.argv[2]) if len(sys.argv) > 2 else 200000
import tempfile, subprocess
W = pathlib.Path(tempfile.mkdtemp()); subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(W / 'world')], check=True, stdout=subprocess.DEVNULL); DEMO = W / 'world'
# big DB
wb = openpyxl.load_workbook(DEMO / 'MC_report.xlsx'); ws = wb['MACHINE DATABASE']
base = [[c.value for c in r] for r in ws.iter_rows(min_row=2) if r[1].value]
macs = ['1NLS', '1NLB', '4OLS', '1SLM', 'BT1M', 'FLM', '2NLS']; d0 = dt.datetime(2026, 1, 5)
for i in range(NDB):
    ws.append([d0 + dt.timedelta(days=i % 300), f'BIG{i//7:06d}-{i%97:04d}(XX)', macs[i % 7], 'G' + macs[i % 7], (i % 9) + 1, 'sx'])
big = W / 'MC_big.xlsx'; wb.save(big); print('db size MB', big.stat().st_size / 1e6)
stage = W / 'stage'; shutil.rmtree(stage, ignore_errors=True); stage.mkdir()
for f in ['LayoutCheck.html', 'xlsx.full.min.js']: shutil.copy(REPO / 'layout-check' / f, stage / f)
serve(stage)
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME); pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script((HERE / 'opfs.js').read_text()); pg.goto('http://127.0.0.1:8799/LayoutCheck.html'); pg.wait_for_timeout(600); stub_idb(pg)
    put(pg, 'data/Linemapping.xlsx', DEMO / 'Linemapping.xlsx'); put(pg, 'pick/MC_report.xlsx', big); put(pg, 'pick/plan.xlsx', DEMO / 'TransformedMasterPlan.xlsx'); put_tree(pg, DEMO / 'lay', 'lay')
    login(pg, 'Giam sat', 'Supervisor', 'PU1', first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(2500)
    # inject many validation + variation + approval + activity files
    pg.evaluate("""async (n) => { const mk = async (dir, i, obj) => { const d = await window.__dir('data/' + dir); const fh = await d.getFileHandle('f' + i + '.json', {create:true}); const w = await fh.createWritable(); await w.write(JSON.stringify(obj)); await w.close(); };
      for (let i = 0; i < n; i++) { await mk('validations', i, {valId:'v'+i, style:'ST'+i+'-0001(XX)', status:i%5?'PASS':'FAIL', pu:'PU1', user:'u', role:'IE', savedAt:new Date(2026,0,1+i%300).toISOString(), layoutFiles:['a.xlsx'], layoutSheets:['s'], details: Array.from({length:25},(_,k)=>({machine:'M'+k,group:'G'+k,db:k,lay:k,diff:0,result:'MATCH'}))}); if (i % 3 == 0) await mk('variations', i, {id:'a'+i, keys:['ST'+i+'-0001(XX)'], action:'LAYOUT_TO_FIX', at:new Date().toISOString(), by:'x'}); } }""", NVAL)
    # instrument
    pg.evaluate("""() => { window.__T = []; const wrap = (n) => { const f = window[n]; window[n] = async function(...a){ const t0 = performance.now(); try { return await f.apply(this, a); } finally { window.__T.push([n, Math.round(performance.now()-t0)]); } }; };
      ['readJsonDir','loadDb','loadChecks','reloadData','connect','refreshPuList','initLayoutRoot','readSheetCI','scanLayouts','renderAll','readWb'].forEach(wrap); }""")
    if os.environ.get('COLD'): pg.evaluate("for (const k of Object.keys(window.__MEM)) if (k=='dbCache'||k.startsWith('jc1|')) delete window.__MEM[k]")
    pg.click('#btnLogout'); pg.wait_for_selector('#login:not([hidden])'); pg.wait_for_timeout(300)
    pg.fill('#lgName', 'Minh'); pg.click('[data-role="IE"]'); pg.select_option('#lgPU', 'PU1')
    pg.evaluate("window.__T0 = performance.now()")
    pg.click('#lgStart'); pg.wait_for_selector('#login[hidden]', state='attached', timeout=300000)
    tot = pg.evaluate("Math.round(performance.now() - window.__T0)")
    print('LOGIN total ms', tot)
    for r in pg.evaluate("window.__T"): print('  ', r)
    print('errors', errs); br.close()
