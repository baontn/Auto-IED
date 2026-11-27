#!/usr/bin/env python3
"""Layout Check V4.4.1: the on-computer cache of check files must follow added, edited and deleted files (turnkey, synthetic data)."""
import sys, os, shutil, pathlib
REPO = pathlib.Path('/home/user/Auto-IED'); sys.path.insert(0, str(REPO / 'tools/manual_shots'))
from lc_common import serve, put, put_tree, login, stub_idb, HERE
from playwright.sync_api import sync_playwright
import tempfile, subprocess
W = pathlib.Path(tempfile.mkdtemp()); subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(W / 'world')], check=True, stdout=subprocess.DEVNULL); DEMO = W / 'world'
stage = W / 'stage'; shutil.rmtree(stage, ignore_errors=True); stage.mkdir()
for f in ['LayoutCheck.html', 'xlsx.full.min.js']: shutil.copy(REPO / 'layout-check' / f, stage / f)
serve(stage)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox']); pg = br.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script((HERE / 'opfs.js').read_text()); pg.goto('http://127.0.0.1:8799/LayoutCheck.html'); pg.wait_for_timeout(600); stub_idb(pg)
    put(pg, 'data/Linemapping.xlsx', DEMO / 'Linemapping.xlsx'); put(pg, 'pick/MC_report.xlsx', DEMO / 'MC_report.xlsx'); put(pg, 'pick/plan.xlsx', DEMO / 'TransformedMasterPlan.xlsx'); put_tree(pg, DEMO / 'lay', 'lay')
    login(pg, 'Giam sat', 'Supervisor', 'PU1', first=True)
    w = lambda name, obj: pg.evaluate("""async ([n,o]) => { const d = await window.__dir('data/validations'); const fh = await d.getFileHandle(n,{create:true}); const w = await fh.createWritable(); await w.write(JSON.stringify(o)); await w.close(); }""", [name, obj])
    base = {'valId': 'v1', 'style': 'CACHE26-00001-0001(XX)', 'status': 'FAIL', 'pu': 'PU1', 'user': 'u', 'role': 'IE', 'savedAt': '2026-11-20T08:00:00Z', 'layoutFiles': [], 'layoutSheets': [], 'details': []}
    w('t1.json', base); pg.evaluate("reloadData()"); pg.wait_for_timeout(500)
    n1 = pg.evaluate("S.vals.length"); st1 = pg.evaluate("S.vals.find(v=>v.valId==='v1').status")
    w('t2.json', dict(base, valId='v2')); pg.evaluate("reloadData()"); pg.wait_for_timeout(500)
    n2 = pg.evaluate("S.vals.length")
    pg.wait_for_timeout(1100); w('t1.json', dict(base, status='PASS', comment='changed now')); pg.evaluate("reloadData()"); pg.wait_for_timeout(500)
    st3 = pg.evaluate("S.vals.find(v=>v.valId==='v1').status")
    pg.evaluate("(async()=>{const d=await window.__dir('data/validations'); await d.removeEntry('t2.json')})()"); pg.wait_for_timeout(200); pg.evaluate("reloadData()"); pg.wait_for_timeout(500)
    n4 = pg.evaluate("S.vals.length")
    print('after add', n1, st1, '| second file', n2, '| edited ->', st3, '| deleted ->', n4, errs)
    ok = n2 == n1 + 1 and st1 == 'FAIL' and st3 == 'PASS' and n4 == n1
    print('RESULT', 'ALL PASS' if ok else 'FAIL'); br.close()
