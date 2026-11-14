#!/usr/bin/env python3
"""Layout Check: style search bar in every tab + line search (J, K -> every line starting with J or K).
Usage: python3 tests/layout-check/search_bars.py [WORKDIR]   (synthetic data; Playwright + openpyxl; Chromium at $CHROME)"""
import sys, os, shutil, pathlib, subprocess, tempfile, datetime as dt
REPO = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'tools' / 'manual_shots'))
from lc_common import serve, put, put_tree, login, stub_idb, HERE
from playwright.sync_api import sync_playwright
import openpyxl
W = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); W.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(W / 'world')], check=True, stdout=subprocess.DEVNULL)
DEMO = W / 'world'
import re
stage = W / 'stage'; shutil.rmtree(stage, ignore_errors=True); stage.mkdir()
for f in ['LayoutCheck.html', 'xlsx.full.min.js']: shutil.copy(REPO / 'layout-check' / f, stage / f)
serve(stage)
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME); pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script((HERE / 'opfs.js').read_text()); pg.goto('http://127.0.0.1:8799/LayoutCheck.html'); pg.wait_for_timeout(600); stub_idb(pg)
    put(pg, 'data/Linemapping.xlsx', DEMO / 'Linemapping.xlsx'); put(pg, 'pick/MC_report.xlsx', DEMO / 'MC_report.xlsx'); put(pg, 'pick/plan.xlsx', DEMO / 'TransformedMasterPlan.xlsx'); put_tree(pg, DEMO / 'lay', 'lay')
    login(pg, 'Giam sat', 'Supervisor', 'PU1', first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(2500)
    login(pg, 'Minh', 'IE', 'PU2 SPORT')
    items = lambda: pg.eval_on_selector_all('#list .item .st', 'els=>els.map(e=>e.textContent)')
    all_ = items(); print('styles:', all_); check('list has styles', len(all_) >= 1)
    n0 = pg.inner_text('#listTitle'); tab0 = pg.inner_text('.tabs [data-tab="check"]')
    part = re.sub(r'[^0-9A-Za-z]', '', all_[0])[-8:].lower()          # part of a name, lower case, no dashes
    pg.fill('#stSearch', part); pg.wait_for_timeout(300); r = items()
    check('Check tab: style search (any case, no dashes) narrows the list', r and all(part.upper() in re.sub(r'[^0-9A-Z]', '', x.upper()) for x in r) and len(r) <= len(all_), f'{part} -> {r}')
    check('title/tab counts stay the total (search is only a view)', pg.inner_text('#listTitle') == n0 and pg.inner_text('.tabs [data-tab="check"]') == tab0)
    pg.fill('#stSearch', 'zzzz'); pg.wait_for_timeout(300); check('no match -> message', 'khớp' in pg.inner_text('#list'), pg.inner_text('#list')[:60])
    pg.fill('#stSearch', ''); pg.wait_for_timeout(300); check('clearing restores the list', items() == all_)
    # lines: J, K -> all lines starting with J or K
    pg.click('#btnLines'); pg.wait_for_timeout(300)
    lines = pg.eval_on_selector_all('#lineGrid input', 'els=>els.map(e=>e.value)'); print('lines:', lines); check('line grid lists lines', len(lines) >= 2)
    first = lines[0][0]; letters = sorted({l[0] for l in lines})
    pg.fill('#lineSearch', first); pg.wait_for_timeout(200); sh = pg.eval_on_selector_all('#lineGrid input', 'els=>els.map(e=>e.value)')
    check(f'search "{first}" shows every line starting with {first}', sh == [l for l in lines if l.startswith(first)], str(sh))
    q = ', '.join(letters[:2]).lower() if len(letters) > 1 else first.lower()
    pg.fill('#lineSearch', q); pg.wait_for_timeout(200); sh = pg.eval_on_selector_all('#lineGrid input', 'els=>els.map(e=>e.value)')
    check(f'search "{q}" (comma list, any case) shows lines of all those letters', sh == [l for l in lines if l[0] in [x.upper() for x in q.replace(",", " ").split()]], str(sh))
    pg.click('#lnAll'); pg.wait_for_timeout(200); btn = pg.inner_text('#btnLines'); check('"Select all" selects the shown lines', all(l in btn for l in sh) or str(len(sh)) in btn, btn)
    pg.click('#lnNone'); pg.click('#lnDone'); pg.wait_for_timeout(300)
    # other tabs
    pg.click('.tabs [data-tab="variation"]'); pg.wait_for_timeout(500); check('Variation tab has a style search', pg.is_visible('#vSearch'))
    pg.click('.tabs [data-tab="status"]'); pg.wait_for_timeout(700)
    rows = lambda: pg.eval_on_selector_all('#stTable tbody tr', 'els=>els.map(e=>e.children[1].textContent)')
    allS = rows(); check('Status tab has a style search and rows', pg.is_visible('#fSearch') and len(allS) >= 2, str(len(allS)))
    t = re.sub(r'[^0-9A-Za-z]', '', allS[0])[-8:].lower(); pg.fill('#fSearch', t); pg.wait_for_timeout(300); r = rows()
    check('Status search narrows rows', 1 <= len(r) <= len(allS) and all(t.upper() in re.sub(r'[^0-9A-Z]', '', x.upper()) for x in r), f'{t} -> {r}')
    pg.fill('#fSearch', ''); pg.click('.tabs [data-tab="activity"]'); pg.wait_for_timeout(900)
    arows = lambda: pg.eval_on_selector_all('#aTable tbody tr', 'els=>els.map(e=>e.children[4].textContent)')
    a0 = arows(); check('Activity tab has a style search', pg.is_visible('#aSearch'), str(len(a0)))
    sty = next((x for x in a0 if x), None)
    if sty:
        pg.fill('#aSearch', sty[-8:].lower()); pg.wait_for_timeout(500); ar = arows(); check('Activity search keeps only that style', ar and all(sty[-8:].upper() in re.sub(r'[^0-9A-Z]', '', x.upper()) or sty[-8:].upper() in x.upper() for x in ar), str(len(ar)))
    check('header has a Home link', pg.get_attribute('#btnHome', 'href') == '../index.html')
    pg.click('#btnLogout'); pg.wait_for_selector('#login:not([hidden])'); pg.wait_for_timeout(300)
    hs = pg.eval_on_selector_all('#login .toolnav a', 'els=>els.map(e=>e.getAttribute("href")+"|"+e.textContent)')
    check('after logout the login screen links to the home page and to IE Bao cao may', len(hs) == 2 and hs[0].startswith('../index.html') and 'IE_BaoCaoMay.html' in hs[1] and all(h.split('|')[1] for h in hs), str(hs))
    check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else 'FAILED'); sys.exit(0 if all(ok) else 1)
