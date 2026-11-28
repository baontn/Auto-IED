#!/usr/bin/env python3
"""IE Bao cao may v7.19: a corner pill with a spinner + label (and a thin top bar) shows while the tool is loading / scanning / creating an Excel file.
Usage: python3 tests/ie-bao-cao-may/busy_indicator.py [WORKDIR]   (synthetic demo data)"""
import sys, os, pathlib, subprocess, tempfile
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
    mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); pg = mai.pg; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.wait_for_timeout(500)
    check('hidden when nothing is running', pg.evaluate("document.getElementById('busy').hidden && document.getElementById('busyBar').hidden"))
    pg.evaluate("""() => { window.__kv = {}; KV.get = async k => window.__kv[k]; KV.set = async (k, v) => { window.__kv[k] = v; };
      window.__release = null; const slow = { kind: 'file', name: 'MC_report.xlsx', async getFile() { await new Promise(r => window.__release = r); return new File([new Uint8Array(10)], 'x.xlsx'); }, async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; } };
      window.__kv.cmc = slow; }""")
    pg.evaluate("reconnect(false); 0"); pg.wait_for_timeout(250)
    vis = pg.evaluate("({hid: document.getElementById('busy').hidden, bar: document.getElementById('busyBar').hidden, tx: document.getElementById('busyTx').textContent})"); print('  while loading:', vis)
    check('the pill and the top bar are visible while a file is being read', not vis['hid'] and not vis['bar'] and len(vis['tx']) > 3, vis['tx'])
    box = pg.evaluate("(()=>{const r=document.getElementById('busy').getBoundingClientRect();return {right:innerWidth-r.right,bottom:innerHeight-r.bottom}})()")
    check('it sits in the bottom-right corner', box['right'] < 40 and box['bottom'] < 40, str(box))
    pg.screenshot(path=str(S / 'busy.png'))
    pg.evaluate("window.__release && window.__release()"); pg.wait_for_timeout(1200)
    check('it disappears when the work is done (after a real wait it stays at least 0.7 s)', pg.evaluate("document.getElementById('busy').hidden"))
    pg.evaluate("busyOn('a', 'A'); busyOn('b', 'B'); 0"); check('two tasks: shows the latest label', pg.inner_text('#busyTx') == 'B', pg.inner_text('#busyTx'))
    pg.evaluate("busyOff('a'); busyOff('b'); 0"); pg.wait_for_timeout(900); check('and hides after both end', pg.evaluate("document.getElementById('busy').hidden"))
    check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
