#!/usr/bin/env python3
"""Take the IE Bao cao may manual screenshots from SYNTHETIC demo data.
Usage: python3 shots_ibm.py DEMO_DIR OUT_DIR   (run make_demo_data.py and shots_lc.py first: the LC data folder is re-used)
"""
import sys, os, json, base64, pathlib
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).resolve().parent; ROOT = HERE.parent.parent
DEMO, OUT = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
HTML = ROOT / 'ie-bao-cao-may' / 'IE_BaoCaoMay.html'
CHROME = dict(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])

fs = {}
for base, prefix in [(DEMO / 'lcdata', 'data/'), (DEMO / 'lay', 'lay/')]:
    for root, _, files in os.walk(base):
        for f in files:
            p = pathlib.Path(root) / f; fs[prefix + str(p.relative_to(base)).replace(os.sep, '/')] = base64.b64encode(p.read_bytes()).decode()
INIT = "window.__FS={};" + "".join(f"window.__FS[{json.dumps(k)}]=Uint8Array.from(atob('{v}'),c=>c.charCodeAt(0));" for k, v in fs.items()) + (HERE / 'fsmock.js').read_text()

def shot(pg, name, sel=None, hl=None, full=False):
    for h in ([hl] if isinstance(hl, str) else (hl or [])):
        pg.locator(h).evaluate_all("els=>els.forEach(e=>{e.dataset.o=e.style.outline;e.style.outline='3px solid #ed1c24';e.style.outlineOffset='2px'})")
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(250)
    path = str(OUT / f'{name}.png')
    if sel: pg.locator(sel).first.screenshot(path=path)
    else: pg.screenshot(path=path, full_page=full)
    for h in ([hl] if isinstance(hl, str) else (hl or [])):
        pg.locator(h).evaluate_all("els=>els.forEach(e=>{e.style.outline=e.dataset.o||'';})")
    print('shot', name)

with sync_playwright() as p:
    b = p.chromium.launch(**CHROME); pg = b.new_page(viewport={'width': 1450, 'height': 950}, accept_downloads=True); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); DLG = []; pg.on('dialog', lambda d: d.accept(DLG.pop(0) if (d.type == 'prompt' and DLG) else ''))
    pg.add_init_script(INIT); pg.goto('file://' + str(HTML)); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(500)
    import datetime as dt
    mon = dt.date.today() - dt.timedelta(days=dt.date.today().weekday())
    pg.set_input_files('#fFiles', [str(DEMO / 'MC_report.xlsx'), str(DEMO / 'TransformedMasterPlan.xlsx')]); pg.set_input_files('#fDir', str(DEMO / 'lay'))
    pg.click('#bLc'); pg.fill('#uName', 'Tuan')
    pg.wait_for_function("!document.getElementById('go').disabled", timeout=120000); pg.wait_for_timeout(800)
    # 1. Data tab
    shot(pg, 'ibm-01-data', hl=['#bMc', 'label.pick:has(#fFiles)', '#bDir', '#bLc', '#uName'])
    # 2. scan
    pg.click('#mainTabs [data-tab="db"]'); shot(pg, 'ibm-02-scan-start', hl='#go')
    pg.click('#go'); pg.wait_for_selector('#step3:not([hidden])', timeout=90000); pg.wait_for_timeout(1000)
    shot(pg, 'ibm-03-review', full=True)
    for label, name in [('Còn thiếu dữ liệu', 'ibm-04-missing'), ('Đã kiểm tra', 'ibm-05-checked'), ('Nhật ký quét', 'ibm-06-scanlog')]:
        pg.click(f'text="{label}"' if False else f'.views >> text={label}'); pg.wait_for_timeout(700); shot(pg, name, full=True)
    pg.click('.views >> text=Cần duyệt'); pg.wait_for_timeout(500)
    pg.click('text=Duyệt tất cả mục đang hiển thị'); pg.wait_for_timeout(500); shot(pg, 'ibm-07-approve-all', full=True, hl=['text=Lưu MACHINE DATABASE'])
    with pg.expect_download(timeout=20000) as dl: pg.click('text=Lưu MACHINE DATABASE')
    dl.value.save_as(str(OUT / '_saved_machine_database.xlsx')); pg.wait_for_timeout(1500); shot(pg, 'ibm-08-saved', full=True)
    # 3. Shortage & prep
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500)
    pg.fill('#pFrom', mon.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(500)
    pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]', 'change'); pg.check('[data-pg="ZZM"]'); pg.dispatch_event('[data-pg="ZZM"]', 'change')
    pg.fill('[data-pr="ZZM"]', '100'); pg.dispatch_event('[data-pr="ZZM"]', 'input'); pg.wait_for_timeout(300)
    shot(pg, 'ibm-09-rank', full=True, hl=['[data-pg]', '[data-pr]', '#pOpen'])
    pg.click('#pOpen'); pg.wait_for_timeout(2500); shot(pg, 'ibm-10-detail', full=True, hl='#pSend')
    pg.click('#pSend'); pg.wait_for_timeout(1500); shot(pg, 'ibm-11-sent', full=True)
    # 4. IE Tech
    pg.click('#roleSeg [data-role="tech"]'); pg.fill('#tName', 'Hoa'); pg.dispatch_event('#tName', 'input'); pg.select_option('#tPU', '')
    pg.click('#tConnect'); pg.wait_for_timeout(500); pg.click('#tLayConnect'); pg.wait_for_timeout(1500)
    pg.select_option('#tPU', 'PU1'); pg.wait_for_timeout(800)
    shot(pg, 'ibm-12-tech', full=True, hl=['#tConnect', '#tName', '#tPU', '#tLines'])
    K = lambda a, b, c, g='BT1M': f'{a}|DMO26-{b}(XX)|DMO26-{c}(XX)|{g}'
    k102 = K('A', '00101-1101', '00102-1201'); k105 = K('B', '00104-1101', '00105-1201'); k103 = K('A', '00102-1201', '00103-1301'); k106 = K('B', '00105-1201', '00106-1301')
    pg.click(f'[data-qe="{k105}"]'); pg.wait_for_timeout(800)
    pg.fill('#dQty', '2'); pg.fill('#dLay', '3'); pg.fill('#dLayQ', '00105'); pg.wait_for_timeout(1200)
    shot(pg, 'ibm-13-drawer', hl=['#dQty', '#dLay', '#dDate', '#dDays', '#dKeep', '#dRemove', '#dSame', '#dLayQ'])
    sug = pg.query_selector('#dLaySug [data-li]')
    if sug: sug.click(); pg.wait_for_timeout(2500); shot(pg, 'ibm-14-layout-viewer', hl='#dLayView')
    pg.click('#dKeep'); pg.wait_for_timeout(1000)
    pg.click(f'[data-qk="{k102}"]'); pg.wait_for_timeout(500); pg.click(f'[data-qr="{k106}"]'); pg.wait_for_timeout(500); pg.click(f'[data-qk="{k103}"]'); pg.wait_for_timeout(500)
    shot(pg, 'ibm-15-tech-decisions', full=True, hl=['[data-qk]', '[data-qr]'])
    pg.click('#tComplete'); pg.wait_for_timeout(1000); shot(pg, 'ibm-16-tech-done', full=True, hl='#tComplete')
    # 5. back as IE Bao cao may: decisions, close, activity, notices
    pg.click('#roleSeg [data-role="cons"]'); pg.wait_for_timeout(800)
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1000); pg.click('#pOpen'); pg.wait_for_timeout(2500); shot(pg, 'ibm-17-detail-approved', full=True)
    pg.click('#pCloseBtn'); pg.wait_for_timeout(800); shot(pg, 'ibm-18-close', full=True, hl=['#pCloseNote', '#pCloseDo'])
    pg.fill('#pCloseNote', 'Week closed'); pg.click('#pCloseDo'); pg.wait_for_timeout(1500); shot(pg, 'ibm-19-closed', full=True)
    pg.click('#mainTabs [data-tab="notices"]') if pg.query_selector('#mainTabs [data-tab="notices"]') else None
    print([e.get_attribute('data-tab') for e in pg.query_selector_all('#mainTabs button')])
    for tab, name in [('notice', 'ibm-20-notices'), ('activity', 'ibm-21-activity')]:
        el = pg.query_selector(f'#mainTabs [data-tab="{tab}"]')
        if el: el.click(); pg.wait_for_timeout(1200); shot(pg, name, full=True)
    # 6. "keep current data" can be confirmed (fresh session, same demo data)
    pg = b.new_page(viewport={'width': 1450, 'height': 950}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(INIT); pg.goto('file://' + str(HTML)); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(500)
    pg.set_input_files('#fFiles', [str(DEMO / 'MC_report.xlsx'), str(DEMO / 'TransformedMasterPlan.xlsx')]); pg.click('#bDir'); pg.click('#bLc'); pg.fill('#uName', 'Tuan')
    pg.wait_for_function("!document.getElementById('go').disabled", timeout=120000); pg.wait_for_timeout(600)
    pg.click('#mainTabs [data-tab="db"]'); pg.click('#go'); pg.wait_for_selector('#step3:not([hidden])', timeout=90000); pg.wait_for_timeout(800)
    pg.click('.views >> text=Cần duyệt'); pg.wait_for_timeout(400)
    sel = pg.locator('#tbl select[data-s]').first; sel.select_option(index=sel.locator('option').count() - 1); pg.wait_for_timeout(300)
    pg.locator('#tbl input[data-a]').first.check(); pg.wait_for_timeout(300)
    shot(pg, 'ibm-22-keep-select', hl=['#tbl select[data-s] >> nth=0', '#tbl input[data-a] >> nth=0', '#keepBtn'])
    pg.click('#keepBtn'); pg.wait_for_timeout(1200); pg.click('.views >> text=Đã xác nhận giữ'); pg.wait_for_timeout(600)
    shot(pg, 'ibm-23-keep-list', hl='[data-ku]')
    print('ERR', errs); b.close()
