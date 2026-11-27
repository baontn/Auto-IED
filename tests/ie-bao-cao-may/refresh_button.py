#!/usr/bin/env python3
"""IE Bao cao may v7.13: the header "Lam moi" button reads every remembered file again (no need to choose anything again) and redraws the open tab.
Usage: python3 tests/ie-bao-cao-may/refresh_button.py [WORKDIR]   (synthetic demo data)"""
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
import base64
b64f = lambda f: base64.b64encode(open(f, 'rb').read()).decode()
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME); mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); pg = mai.pg; errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.evaluate("""([mc, plan]) => {
      window.__kv = {}; KV.get = async k => window.__kv[k]; KV.set = async (k, v) => { window.__kv[k] = v; };
      const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
      window.__FS['pick/MC_report.xlsx'] = b(mc); window.__FS['pick/TransformedMasterPlan.xlsx'] = b(plan);
      window.__perm = 'granted'; window.__reads = {};
      const mk = n => ({ kind: 'file', name: n, async getFile() { window.__reads[n] = (window.__reads[n] || 0) + 1; return new File([window.__FS['pick/' + n]], n); }, async queryPermission() { return window.__perm; }, async requestPermission() { return 'granted'; } });
      window.showOpenFilePicker = async o => [mk('MC_report.xlsx'), mk('TransformedMasterPlan.xlsx')];
    }""", [b64f(SHARE / 'MC_report.xlsx'), b64f(SHARE / 'TransformedMasterPlan.xlsx')])
    check('header has the Refresh button', pg.is_visible('#bRefresh'))
    pg.click('#bFiles'); pg.wait_for_timeout(2500)
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1200)
    r0 = pg.evaluate("Object.assign({}, window.__reads)"); pg.evaluate("REF.demand = {stale: true}; 0")
    pg.click('#bRefresh'); pg.wait_for_timeout(3000)
    r1 = pg.evaluate("Object.assign({}, window.__reads)"); print('  file reads before / after:', r0, r1)
    check('the MC Report and the plan were read again from the remembered handles', all(r1.get(k, 0) > r0.get(k, 0) for k in ('MC_report.xlsx', 'TransformedMasterPlan.xlsx')))
    check('the cached demand was dropped (rebuilt from the new files)', pg.evaluate("!REF.demand || !REF.demand.stale"))
    check('a "read again" message is shown', 'lúc' in pg.inner_text('#remMsg'), pg.inner_text('#remMsg')[:90])
    check('the button is usable again afterwards', pg.is_enabled('#bRefresh'))
    pg.evaluate("localStorage.setItem('mdb_role','cons'); 0")
    check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
