#!/usr/bin/env python3
"""Layout Check V4.3.2: a Machine Database file replaced while the window is open is re-read automatically
(opening a style / a layout, or window focus) - no more false "Không đạt" from an old database.
Usage: python3 tests/layout-check/db_refresh.py [WORKDIR]   (synthetic data; Playwright + openpyxl; Chromium at $CHROME)"""
import sys, os, shutil, pathlib, subprocess, tempfile, datetime as dt
REPO = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'tools' / 'manual_shots'))
from lc_common import serve, put, put_tree, login, stub_idb, HERE
from playwright.sync_api import sync_playwright
import openpyxl
W = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); W.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(W / 'world')], check=True, stdout=subprocess.DEVNULL)
DEMO = W / 'world'
# the "new" database: style 00202 now has BT1M 5 (what the layout says)
wb = openpyxl.load_workbook(DEMO / 'MC_report.xlsx'); ws = wb['MACHINE DATABASE']
for row in ws.iter_rows(min_row=2):
    if row[1].value and '00202' in str(row[1].value) and row[2].value == 'BT1M': row[4].value = 5
wb.save(W / 'MC_new.xlsx')
stage = W / 'stage'; shutil.rmtree(stage, ignore_errors=True); stage.mkdir()
for f in ['LayoutCheck.html', 'xlsx.full.min.js']: shutil.copy(REPO / 'layout-check' / f, stage / f)
serve(stage)
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
def step1(pg): return ' '.join(pg.locator('.card:has(h3:has-text("CSDL máy"))').first.inner_text().split())[:110]
def result(pg): return ' '.join(pg.locator('.card:has(h3:has-text("Kết quả"))').first.inner_text().split())[:130]
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME); pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script((HERE / 'opfs.js').read_text()); pg.goto('http://127.0.0.1:8799/LayoutCheck.html'); pg.wait_for_timeout(600); stub_idb(pg)
    put(pg, 'data/Linemapping.xlsx', DEMO / 'Linemapping.xlsx'); put(pg, 'pick/MC_report.xlsx', DEMO / 'MC_report.xlsx'); put(pg, 'pick/plan.xlsx', DEMO / 'TransformedMasterPlan.xlsx'); put_tree(pg, DEMO / 'lay', 'lay')
    login(pg, 'Giam sat', 'Supervisor', 'PU1', first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(2500)
    login(pg, 'Minh', 'IE', 'PU2 SPORT')
    pg.click('#list >> text=DMO26-00202'); pg.wait_for_timeout(1200); a = step1(pg); print('old DB :', a)
    check('starts with the old database (29 machines)', '29 máy' in a)
    put(pg, 'pick/MC_report.xlsx', W / 'MC_new.xlsx')                 # Mai pasted Table1 and saved: the file on the share is replaced
    put(pg, 'pick/DMO26-00202-2201.xlsx', DEMO / 'lay/PU2 SPORT/DMO26-00202-2201.xlsx') if (DEMO / 'lay/PU2 SPORT/DMO26-00202-2201.xlsx').exists() else None
    # the demo world has no layout for 00202: write one with BT1M 5
    wbl = openpyxl.Workbook(); wl = wbl.active; wl.title = 'Layout'; wl['A3'] = 'Style'; wl['B3'] = 'DMO26-00202-2201(XX)'; wl['A6'] = 'M/C'; wl['B6'] = '1 Line'; wl['C6'] = 'Remark'
    mc = {'1NLS': 8, '1NLB': 4, '4OLS': 3, '4OLB': 3, '1SLM': 3, 'BT1M': 5, 'FLM': 4}; r = 7
    for c, q in mc.items(): wl.cell(r, 1, c); wl.cell(r, 2, q); r += 1
    wl.cell(r, 1, 'TOTAL'); wl.cell(r, 2, sum(mc.values())); wbl.save(W / 'lay202.xlsx')
    put(pg, 'pick/lay202.xlsx', W / 'lay202.xlsx'); pg.evaluate("window.__pick='lay202.xlsx'")
    pg.click('#btnOpenLayout'); pg.wait_for_timeout(2800)
    b = step1(pg); res = result(pg); print('after opening the layout:', b, '|', res)
    check('database re-read automatically when the layout is opened (30 machines)', '30 máy' in b, b)
    check('layout now matches (no false Fail)', 'Layout khớp' in res or 'Khớp' in res, res)
    check('a message told the user the file was reloaded', 'đã tải lại' in pg.inner_text('#log'), pg.inner_text('#log')[:120])
    check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
