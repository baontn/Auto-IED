#!/usr/bin/env python3
"""Layout Check V4.5.1: a corner pill with a spinner + label (and a thin top bar) shows while an action takes time (login, reading a plan, Excel export, layout scan).
Usage: python3 tests/layout-check/busy_indicator.py [WORKDIR]   (synthetic data)"""
import sys, os, shutil, pathlib, subprocess, tempfile
REPO = pathlib.Path(__file__).resolve().parents[2]; sys.path.insert(0, str(REPO / 'tools' / 'manual_shots'))
from lc_common import serve, put, put_tree, login, stub_idb, HERE
from playwright.sync_api import sync_playwright
W = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); W.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(W / 'world')], check=True, stdout=subprocess.DEVNULL); DEMO = W / 'world'
stage = W / 'stage'; shutil.rmtree(stage, ignore_errors=True); stage.mkdir()
for f in ['LayoutCheck.html', 'xlsx.full.min.js']: shutil.copy(REPO / 'layout-check' / f, stage / f)
serve(stage); ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox']); pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script((HERE / 'opfs.js').read_text()); pg.goto('http://127.0.0.1:8799/LayoutCheck.html'); pg.wait_for_timeout(600); stub_idb(pg)
    put(pg, 'data/Linemapping.xlsx', DEMO / 'Linemapping.xlsx'); put(pg, 'pick/MC_report.xlsx', DEMO / 'MC_report.xlsx'); put_tree(pg, DEMO / 'lay', 'lay')
    check('hidden at the start', pg.evaluate("document.getElementById('busy').hidden && document.getElementById('busyBar').hidden"))
    pg.evaluate("guard(async function slowTask() { await new Promise(r => setTimeout(r, 900)); }); 0"); pg.wait_for_timeout(300)
    vis = pg.evaluate("({hid: document.getElementById('busy').hidden, bar: document.getElementById('busyBar').hidden, tx: document.getElementById('busyTx').textContent})"); print('  during:', vis)
    check('pill + top bar visible during a task, with a label', not vis['hid'] and not vis['bar'] and len(vis['tx']) > 3, vis['tx'])
    box = pg.evaluate("(()=>{const r=document.getElementById('busy').getBoundingClientRect();return {right:innerWidth-r.right,bottom:innerHeight-r.bottom}})()"); check('bottom-right corner', box['right'] < 40 and box['bottom'] < 40, str(box))
    pg.wait_for_timeout(1500); check('hidden again after the task', pg.evaluate("document.getElementById('busy').hidden"))
    login(pg, 'Giam sat', 'Supervisor', 'PU1', first=True); pg.wait_for_timeout(1500); check('hidden after the login finished', pg.evaluate("document.getElementById('busy').hidden"))
    pg.evaluate("guard(async function loadPlan() { await new Promise(r => setTimeout(r, 700)); }); 0"); pg.wait_for_timeout(250); check('a known action shows its own label (reading the plan)', 'kế hoạch' in pg.inner_text('#busyTx') or 'plan' in pg.inner_text('#busyTx'), pg.inner_text('#busyTx'))
    pg.wait_for_timeout(1500); check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
