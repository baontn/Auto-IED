#!/usr/bin/env python3
"""Layout Check V4.4.0: any role can open a style of the Variation log in the check screen and re-check it (e.g. the wrong layout was chosen).
Usage: python3 tests/layout-check/recheck_from_variation.py [WORKDIR]   (synthetic data; Playwright + openpyxl; Chromium at $CHROME)"""
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
def result(pg): return ' '.join(pg.locator('.card:has(h3:has-text("Kết quả"))').first.inner_text().split())[:130]
STYLE = 'DMO26-00202-2201(XX)'
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME); pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script((HERE / 'opfs.js').read_text()); pg.goto('http://127.0.0.1:8799/LayoutCheck.html'); pg.wait_for_timeout(600); stub_idb(pg)
    put(pg, 'data/Linemapping.xlsx', DEMO / 'Linemapping.xlsx'); put(pg, 'pick/MC_report.xlsx', DEMO / 'MC_report.xlsx'); put(pg, 'pick/plan.xlsx', DEMO / 'TransformedMasterPlan.xlsx'); put_tree(pg, DEMO / 'lay', 'lay')
    login(pg, 'Giam sat', 'Supervisor', 'PU1', first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(2500)
    # a layout that differs from the old database (BT1M 5 instead of 4)
    wbl = openpyxl.Workbook(); wl = wbl.active; wl.title = 'Layout'; wl['A3'] = 'Style'; wl['B3'] = STYLE; wl['A6'] = 'M/C'; wl['B6'] = '1 Line'; wl['C6'] = 'Remark'
    mc = {'1NLS': 8, '1NLB': 4, '4OLS': 3, '4OLB': 3, '1SLM': 3, 'BT1M': 5, 'FLM': 4}; r = 7
    for c, q in mc.items(): wl.cell(r, 1, c); wl.cell(r, 2, q); r += 1
    wl.cell(r, 1, 'TOTAL'); wl.cell(r, 2, sum(mc.values())); wbl.save(W / 'lay202.xlsx'); put(pg, 'pick/lay202.xlsx', W / 'lay202.xlsx')
    print('--- Minh (IE) opens the wrong layout and saves Fail')
    login(pg, 'Minh', 'IE', 'PU2 SPORT')
    pg.click('#list >> text=DMO26-00202'); pg.wait_for_timeout(1200); pg.evaluate("window.__pick='lay202.xlsx'"); pg.click('#btnOpenLayout'); pg.wait_for_timeout(2500)
    pg.fill('#comment', 'wrong layout chosen'); pg.click('#dFail'); pg.wait_for_timeout(1500)
    print('--- Mai (Consolidator) opens the Variation log and re-checks the style')
    login(pg, 'Mai', 'Consolidator', 'PU2 SPORT'); pg.click('.tabs [data-tab="variation"]'); pg.wait_for_timeout(800)
    check('the Variation log card has an "Open and re-check" button for everyone', pg.locator('[data-recheck]').count() >= 1, str(pg.locator('[data-recheck]').count()))
    pg.locator('[data-recheck]').first.click(); pg.wait_for_timeout(1500)
    check('it switches to the check screen with the same UI (style card, steps 1 and 2)', pg.is_visible('#tab-check') and STYLE in pg.inner_text('#work') and 'Machine' in pg.inner_text('#work') or 'CSDL' in pg.inner_text('#work'))
    check('a note explains it was opened from the Variation log', 'Nhật ký sai lệch' in pg.inner_text('#work') and pg.is_visible('#btnBackVar'))
    pg.click('#btnBackVar'); pg.wait_for_timeout(500); check('"Về Nhật ký sai lệch" goes back without saving', pg.is_visible('#tab-variation') and not pg.is_visible('#tab-check'))
    pg.locator('[data-recheck]').first.click(); pg.wait_for_timeout(1200)
    put(pg, 'pick/MC_report.xlsx', W / 'MC_new.xlsx')                                  # the database is fixed meanwhile
    pg.evaluate("window.__pick='lay202.xlsx'"); pg.click('#btnOpenLayout'); pg.wait_for_timeout(2800)
    res = result(pg); print('  result:', res); check('the layout now matches', 'khớp' in res.lower(), res)
    check('the normal decision buttons (Pass / Accept / Fail) are shown once a layout is open, not only the IE Tech ones', pg.locator('#dPass').count() == 1 and pg.locator('#dFail').count() == 1 and pg.locator('#tFixed').count() == 0)
    pg.click('#dPass'); pg.wait_for_timeout(1800)
    check('after saving Pass the user is taken back to the Variation log', pg.is_visible('#tab-variation'))
    st = pg.evaluate("(S.stages[K('%s')] || {}).stage" % STYLE); check('the style is DONE (the new check replaced the old one)', st == 'DONE', str(st))
    rec = pg.evaluate("S.vals.filter(v => K(v.style) === K('%s')).slice(-1)[0]" % STYLE); check('the Pass is stored with the role and name of the person who saved it', rec['status'] == 'PASS' and rec['role'] == 'Consolidator' and rec['user'] == 'Mai', str({k: rec[k] for k in ('status', 'role', 'user')}))
    check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
