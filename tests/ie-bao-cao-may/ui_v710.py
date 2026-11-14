#!/usr/bin/env python3
"""IE Bao cao may v7.10: Home link, resizable table columns (text wraps), end-date calendar dialog (no browser prompt),
remembered Excel files + automatic reconnect (the browser handles are replaced by an in-memory store in this test).
Usage: python3 tests/ie-bao-cao-may/ui_v710.py [WORKDIR]"""
import sys, os, re, pathlib, subprocess, tempfile, base64, datetime as dt
HERE = pathlib.Path(__file__).resolve().parent; REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'tests' / 'sim'))
import simlib; from simlib import *
S = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); S.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(S / 'world')], check=True, stdout=subprocess.DEVNULL)
setup(S / 'world', S); SHARE = simlib.SHARE
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
b64f = lambda p: base64.b64encode(pathlib.Path(p).read_bytes()).decode()
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME)
    print('--- Mai: Home link, resizable columns, remembered files')
    mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); pg = mai.pg
    check('header has a Home link to ../index.html', pg.get_attribute('#btnHome', 'href') == '../index.html' and pg.inner_text('#btnHome').strip() == 'Trang chủ')
    # in-memory KV (real handles cannot be cloned from the mock) + pickers that return mock handles for MC report + plan
    pg.evaluate("""([mc, plan]) => {
      window.__kv = {}; KV.get = async k => window.__kv[k]; KV.set = async (k, v) => { window.__kv[k] = v; };
      const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
      window.__FS['pick/MC_report.xlsx'] = b(mc); window.__FS['pick/TransformedMasterPlan.xlsx'] = b(plan);
      window.__perm = 'granted'; window.__asked = 0;
      const mk = n => ({ kind: 'file', name: n, async getFile() { return new File([window.__FS['pick/' + n]], n); }, async queryPermission() { return window.__perm; }, async requestPermission() { window.__asked++; window.__perm = 'granted'; return 'granted'; } });
      window.showOpenFilePicker = async o => [mk('MC_report.xlsx'), mk('TransformedMasterPlan.xlsx')];
    }""", [b64f(SHARE / 'MC_report.xlsx'), b64f(SHARE / 'TransformedMasterPlan.xlsx')])
    pg.click('#bFiles'); pg.wait_for_timeout(2500)
    both = lambda: pg.evaluate("!!(REF.db && REF.plan)")
    check('one pick of two Excel files loads both (MC Report + plan)', both())
    check('the bar lists the remembered Excel files', 'TransformedMasterPlan.xlsx' in pg.inner_text('#remList'), pg.inner_text('#remList'))
    pg.evaluate("REF.db = null; REF.plan = null; REF.planRows = null")
    check('state cleared (simulates a new session)', not both())
    pg.evaluate("reconnect(false)"); pg.wait_for_timeout(2500)
    check('reconnect(false): files come back by themselves when permission is still granted', both() and pg.evaluate("window.__asked") == 0, pg.inner_text('#remMsg'))
    pg.evaluate("REF.db = null; REF.plan = null; window.__perm = 'prompt'; reconnect(false)"); pg.wait_for_timeout(1200)
    check('permission needs a click: nothing loaded yet, nothing asked', not both() and pg.evaluate("window.__asked") == 0)
    pg.click('header h1'); pg.wait_for_timeout(2500)
    check('first click on the page asks once and reconnects', both() and pg.evaluate("window.__asked") >= 1)
    # resizable columns: any table with a header
    pg.evaluate("document.body.insertAdjacentHTML('beforeend','<div id=\"rzT\"><table><thead><tr><th>Name</th><th>Note</th></tr></thead><tbody><tr><td>A</td><td>a long text that should wrap when the column is narrow, a long text that should wrap</td></tr></tbody></table></div>')"); pg.wait_for_timeout(300)
    check('table headers get resize handles', pg.locator('#rzT .rzh').count() == 2)
    w0 = pg.evaluate("document.querySelector('#rzT th:nth-child(2)').offsetWidth"); box = pg.locator('#rzT th:nth-child(2) .rzh').bounding_box()
    pg.mouse.move(box['x'] + 3, box['y'] + 5); pg.mouse.down(); pg.mouse.move(box['x'] - 77, box['y'] + 5, steps=6); pg.mouse.up(); pg.wait_for_timeout(200)
    w1 = pg.evaluate("document.querySelector('#rzT th:nth-child(2)').offsetWidth"); h0 = pg.evaluate("document.querySelector('#rzT td:nth-child(2)').offsetHeight")
    check('dragging the column edge changes the width', w1 < w0 - 40, f'{w0} -> {w1}')
    check('narrow column wraps its text (cell grows taller)', pg.evaluate("document.querySelector('#rzT table').classList.contains('rzw')") and h0 > 30, f'h={h0}')
    pg.evaluate("document.querySelector('#rzT').innerHTML = document.querySelector('#rzT').innerHTML"); pg.wait_for_timeout(300)
    # redraw keeps the chosen width (same container id + table index)
    check('width survives a redraw of the table', abs(pg.evaluate("document.querySelector('#rzT th:nth-child(2)').offsetWidth") - w1) <= 2, str(pg.evaluate("document.querySelector('#rzT th:nth-child(2)').offsetWidth")))
    mai.errs and print(mai.errs)
    check('no page errors (Mai)', not mai.errs, str(mai.errs))
    print('--- Mai sends a proposal; Hoa (IE Tech) sets the end date with the calendar dialog')
    pg.reload(); pg.wait_for_timeout(600); mai.open(at(1, 8, 30)); mai.load()
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom', MON.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(700)
    pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]', 'change'); pg.click('#pOpen'); pg.wait_for_timeout(2500); pg.click('#pSend'); pg.wait_for_timeout(1500); mai.push()
    hoa = IBM(br, 'Hoa'); hoa.open(at(2, 9, 0)); hp = hoa.pg; native = []; hp.on('dialog', lambda d: native.append(d.type))
    hp.click('#roleSeg [data-role="tech"]'); hp.fill('#tName', 'Hoa'); hp.dispatch_event('#tName', 'input'); hp.select_option('#tPU', ''); hp.click('#tConnect'); hp.wait_for_timeout(1800)
    hp.click('#tGroupChips [data-tg="BT1M"]'); hp.wait_for_timeout(600)
    btn = hp.locator('#tGrid [data-te]').first; check('the running line has an end-date edit button', btn.count() == 1)
    line = btn.get_attribute('data-te'); btn.click(); hp.wait_for_timeout(400)
    check('a calendar dialog opens (date input), no browser prompt', hp.is_visible('#eDlg') and hp.get_attribute('#eDate', 'type') == 'date' and 'prompt' not in native, str(native))
    cur = hp.input_value('#eDate'); new = (dt.date.fromisoformat(cur) + dt.timedelta(days=2)).isoformat()
    hp.fill('#eDate', new); hp.click('#eSave'); hp.wait_for_timeout(900)
    check('dialog closes after Save', not hp.is_visible('#eDlg'))
    n = len(list((hoa and (SHARE / 'data/prep/lineends').glob('*.json')) or [])) if (SHARE / 'data/prep/lineends').exists() else 0
    hoa.push(); recs = list((SHARE / 'data/prep/lineends').glob('*.json')); import json
    r = json.loads(recs[0].read_text(encoding='utf-8')) if recs else {}
    check('the new end date is saved in data/prep/lineends', r.get('endDate') == new and r.get('line') == line, str(r))
    hp.locator(f'#tGrid [data-te="{line}"]').first.click(); hp.wait_for_timeout(300); hp.click('#eCancel'); check('Cancel closes without saving', not hp.is_visible('#eDlg'))
    hp.locator(f'#tGrid [data-te="{line}"]').first.click(); hp.wait_for_timeout(300); hp.click('#ePlan'); hp.wait_for_timeout(900); hoa.push()
    rr = sorted((SHARE / 'data/prep/lineends').glob('*.json')); last = json.loads(rr[-1].read_text(encoding='utf-8'))
    check('"Theo kế hoạch" resets the end date', last.get('endDate') == '', str(last))
    check('no page errors (Hoa)', not hoa.errs, str(hoa.errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else 'FAILED'); sys.exit(0 if all(ok) else 1)
