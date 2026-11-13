#!/usr/bin/env python3
"""IE Bao cao may v7.9: "Giữ dữ liệu hiện tại" can be confirmed and is remembered until the layout CONTENT or the style's database data changes (then cleared).
Usage: python3 tests/ie-bao-cao-may/keep_confirm.py [WORKDIR]   (synthetic demo data; needs the built ie-bao-cao-may/IE_BaoCaoMay.html)"""
import sys, os, pathlib, subprocess, tempfile
HERE = pathlib.Path(__file__).resolve().parent; REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'tests' / 'sim'))
import simlib; from simlib import *
S = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); S.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(S / 'world')], check=True, stdout=subprocess.DEVNULL)
setup(S / 'world', S); SHARE = simlib.SHARE
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
ok = []
def check(name, cond, extra=''): ok.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name, extra)
def cards(pg): return [c.replace('\n', ' ') for c in pg.locator('#step3 .views > *').all_inner_texts()]
def write_layout(path, style, mc):
    wb = Workbook(); ws = wb.active; ws.title = 'Layout'; ws['A3'] = 'Style'; ws['B3'] = style; ws['A6'] = 'M/C'; ws['B6'] = '1 Line'; ws['C6'] = 'Remark'
    r = 7
    for c, q in mc.items(): ws.cell(r, 1, c); ws.cell(r, 2, q); r += 1
    ws.cell(r, 1, 'TOTAL'); ws.cell(r, 2, sum(mc.values())); wb.save(path)
def session(br, day, local=False):
    m = IBM(br, 'Mai'); m.pg.clock.set_system_time(at(day, 8, 30)); m.pg.goto('file://' + str(ROOT / 'ie-bao-cao-may/IE_BaoCaoMay.html'))
    if not local: m.pg.evaluate("localStorage.clear()"); m.pg.reload(); m.pg.wait_for_timeout(500)
    pg = m.pg
    pg.set_input_files('#fFiles', [str(SHARE / 'MC_report.xlsx'), str(SHARE / 'TransformedMasterPlan.xlsx')]); pg.fill('#uName', 'Mai'); pg.click('#bDir')
    if not local: pg.click('#bLc')
    pg.wait_for_function("!document.getElementById('go').disabled", timeout=120000); pg.wait_for_timeout(600)
    pg.click('#mainTabs [data-tab="db"]'); pg.click('#go'); pg.wait_for_selector('#step3:not([hidden])', timeout=90000); pg.wait_for_timeout(1000); return m
# ---- part 1: data folder connected (keeps.json) ----
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME)
    print('--- Day 1: Mai confirms "keep current" for two styles')
    m = session(br, 0); pg = m.pg; c = cards(pg); print('cards', c)
    check('4 items to review at the start', c[0].startswith('4 '))
    pg.click('.views >> text=Cần duyệt'); pg.wait_for_timeout(300)
    names = pg.evaluate("[...document.querySelectorAll('#tbl tr')].slice(1).map(tr=>tr.querySelector('b')&&tr.querySelector('b').textContent)"); print('rows', names)
    rows = pg.locator('#tbl tr')
    for i in range(1, rows.count()):
        nm = names[i - 1]
        if nm and ('00105' in nm or '00302' in nm):
            row = rows.nth(i); sel = row.locator('select[data-s]'); sel.select_option(index=sel.locator('option').count() - 1); pg.wait_for_timeout(250)
            row = pg.locator('#tbl tr').nth(i); box = row.locator('input[data-a]')
            check(f'{nm[:20]} keep: checkbox ENABLED', box.is_enabled()); box.check(); pg.wait_for_timeout(250)
    check('save bar counts 2 keep confirmations', '2 xác nhận giữ' in pg.inner_text('#smsg'), pg.inner_text('#smsg'))
    check('"Xác nhận giữ (2)" button visible', pg.is_visible('#keepBtn'), pg.inner_text('#keepBtn'))
    pg.click('#keepBtn'); pg.wait_for_timeout(1200); c = cards(pg); print('cards after confirm', c, '|', pg.inner_text('#smsg'))
    check('to-review drops to 2', c[0].startswith('2 ')); check('new card "Đã xác nhận giữ 2"', any(x.startswith('2 Đã xác nhận giữ') for x in c))
    m.push(); kp = SHARE / 'data/machinedb/keeps.json'; check('keeps.json written to the shared data folder', kp.exists())
    print('keeps.json:', kp.read_text()[:400] if kp.exists() else '-')
    print('--- Day 2: next morning, fresh session, same layouts')
    m2 = session(br, 1); c = cards(m2.pg); print('cards', c)
    check('still only 2 to review, 2 kept', c[0].startswith('2 ') and any(x.startswith('2 Đã xác nhận giữ') for x in c))
    print('--- Day 3: Hoa re-saves a layout WITHOUT changing machines (new modified time); Day 3b: changes 00105 quantities')
    write_layout(SHARE / 'lay/PU3/DMO26-00302-3201.xlsx', 'DMO26-00302-3201(XX)', {'1NLS': 9, '1NLB': 4, '4OLS': 3, '4OLB': 2, '1SLM': 3, 'BT1M': 4, 'FLM': 5, 'ZZM': 2})  # same machines as before
    m3 = session(br, 2); c = cards(m3.pg); check('touched-only layout (same content) stays kept', c[0].startswith('2 ') and any(x.startswith('2 Đã xác nhận giữ') for x in c), str(c))
    write_layout(SHARE / 'lay/PU1/DMO26-00105-1201.xlsx', 'DMO26-00105-1201(XX)', {'1NLS': 9, '1NLB': 4, '4OLS': 3, '4OLB': 3, '1SLM': 3, 'BT1M': 4, 'FLM': 4, 'ZZM': 1})   # BT1M 3 -> 4: content really changed
    m4 = session(br, 3); c = cards(m4.pg); print('cards', c)
    check('layout CONTENT changed -> style shows again (3 to review, 1 kept)', c[0].startswith('3 ') and any(x.startswith('1 Đã xác nhận giữ') for x in c))
    m4.pg.click('.views >> text=Cần duyệt'); m4.pg.wait_for_timeout(300)
    notes = m4.pg.evaluate("[...document.querySelectorAll('#tbl tr')].map(tr=>tr.textContent).filter(t=>/xác nhận giữ/.test(t)).map(t=>t.replace(/\\s+/g,' ').slice(-170))"); print('note:', notes)
    check('reappearing row explains why', any('Layout đã thay đổi sau khi Mai' in n for n in notes))
    m4.push(); check('layout changed: its confirmation is cleared from keeps.json', '00105' not in (SHARE / 'data/machinedb/keeps.json').read_text())
    print('--- Undo from the kept list')
    m4.pg.click('.views >> text=Đã xác nhận giữ'); m4.pg.wait_for_timeout(400); m4.pg.click('[data-ku]'); m4.pg.wait_for_timeout(900); c = cards(m4.pg)
    check('undo returns the style to review', c[0].startswith('4 '), str(c)); m4.push()
    check('keeps.json updated after undo', '00302' not in (SHARE / 'data/machinedb/keeps.json').read_text())
    print('--- Database change clears the confirmation')
    pg4 = m4.pg; pg4.click('.views >> text=Cần duyệt'); pg4.wait_for_timeout(300)
    nms = pg4.evaluate("[...document.querySelectorAll('#tbl tr')].slice(1).map(tr=>tr.querySelector('b')&&tr.querySelector('b').textContent)")
    i302 = [i for i, n in enumerate(nms) if n and '00302' in n][0] + 1
    sel = pg4.locator('#tbl tr').nth(i302).locator('select[data-s]'); sel.select_option(index=sel.locator('option').count() - 1); pg4.wait_for_timeout(250)
    pg4.locator('#tbl tr').nth(i302).locator('input[data-a]').check(); pg4.click('#keepBtn'); pg4.wait_for_timeout(1000); m4.push()
    check('00302 confirmed again', '00302' in (SHARE / 'data/machinedb/keeps.json').read_text())
    m5 = session(br, 4); c = cards(m5.pg); check('database unchanged: still kept', any(x.startswith('1 Đã xác nhận giữ') for x in c), str(c))
    wbk = openpyxl.load_workbook(SHARE / 'MC_report.xlsx'); wsk = wbk['MACHINE DATABASE']; changed = 0
    for row in wsk.iter_rows(min_row=2):
        if row[1].value and '00302' in str(row[1].value) and row[2].value == 'ZZM': row[4].value = (row[4].value or 0) + 1; changed += 1
    wbk.save(SHARE / 'MC_report.xlsx'); print('database rows edited for 00302:', changed)
    m6 = session(br, 5); c6 = cards(m6.pg); print('cards', c6)
    m6.pg.click('.views >> text=Cần duyệt'); m6.pg.wait_for_timeout(300)
    notes6 = m6.pg.evaluate("[...document.querySelectorAll('#tbl tr')].map(tr=>tr.textContent.replace(/\\s+/g,' ')).filter(t=>/00302/.test(t)).map(t=>t.slice(-200))"); print('note:', notes6)
    check('database changed -> style listed again with a note', any('Database đã thay đổi sau khi Mai' in n for n in notes6) and not any(x.endswith('Đã xác nhận giữ') for x in c6), str(c6))
    m6.push(); check('database changed: confirmation cleared from keeps.json', '00302' not in (SHARE / 'data/machinedb/keeps.json').read_text())
    print('--- No data folder connected: stored in this browser')
    m5 = session(br, 4, local=False)       # (fresh page)
    errs = [m.errs, m2.errs, m3.errs, m4.errs]; check('no page errors', not any(errs), str(errs))
    br.close()

# ---- part 2: browser storage, main Save, new style, English ----
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME)
    print('--- A. no data folder connected (browser storage), keep + normal approve + main Save together')
    m = session(br, 0, local=False)
    # reopen WITHOUT connecting the data folder: build a session that skips #bLc
    m = IBM(br, 'Mai'); m.pg.clock.set_system_time(at(0, 8, 30)); m.pg.goto('file://' + str(ROOT / 'ie-bao-cao-may/IE_BaoCaoMay.html')); m.pg.evaluate("localStorage.clear()"); m.pg.reload(); m.pg.wait_for_timeout(500); pg = m.pg
    def scan_local(m, first=True):
        pg = m.pg; pg.click('#mainTabs [data-tab="data"]'); pg.set_input_files('#fFiles', [str(SHARE / 'MC_report.xlsx'), str(SHARE / 'TransformedMasterPlan.xlsx')]); pg.fill('#uName', 'Mai'); pg.click('#bDir')
        pg.wait_for_function("!document.getElementById('go').disabled", timeout=120000); pg.wait_for_timeout(600)
        pg.click('#mainTabs [data-tab="db"]'); pg.click('#go'); pg.wait_for_selector('#step3:not([hidden])', timeout=90000); pg.wait_for_timeout(1000)
    scan_local(m); pg = m.pg; print('cards', cards(pg))
    pg.click('.views >> text=Cần duyệt'); pg.wait_for_timeout(300)
    names = pg.evaluate("[...document.querySelectorAll('#tbl tr')].slice(1).map(tr=>tr.querySelector('b')&&tr.querySelector('b').textContent)")
    rows = pg.locator('#tbl tr')
    for i in range(1, rows.count()):
        nm = names[i - 1]; row = rows.nth(i)
        if '00105' in nm:                      # keep
            s = row.locator('select[data-s]'); s.select_option(index=s.locator('option').count() - 1); pg.wait_for_timeout(200); pg.locator('#tbl tr').nth(i).locator('input[data-a]').check()
        elif '00302' in nm:                    # normal approve of the layout
            row.locator('input[data-a]').check()
        elif '00205' in nm:                    # brand-new style: keep has nothing to keep
            s = row.locator('select[data-s]'); s.select_option(index=s.locator('option').count() - 1); pg.wait_for_timeout(200)
            check('new style (no current data): keep checkbox stays DISABLED', pg.locator('#tbl tr').nth(i).locator('input[data-a]').is_disabled())
    print('save bar:', pg.inner_text('#smsg'))
    with pg.expect_download(timeout=20000) as dl: pg.click('#save')
    pg.wait_for_timeout(1500); msg = pg.inner_text('#smsg'); print('after save:', msg)
    check('main Save also stored the keep confirmation (and 1 DB change saved)', 'Đã xác nhận giữ 1' in msg and '1 thay đổi' in msg, msg[:160])
    check('stored in browser storage', pg.evaluate("!!localStorage.getItem('mdb_keeps')") and 'on this computer' not in msg)
    print('cards', cards(pg))
    # reload same browser (storage kept), rescan: 00105 stays kept
    pg.reload(); pg.wait_for_timeout(600); scan_local(m); c = cards(pg); print('cards after reload+rescan', c)
    check('after reload + rescan the keep is remembered (browser storage)', any(x.startswith('1 Đã xác nhận giữ') for x in c), str(c))
    print('--- B. English labels')
    pg.click('[data-lang="en"]'); pg.wait_for_timeout(400)
    check('EN labels', 'Confirmed to keep' in pg.inner_text('#views'), pg.inner_text('#views').replace('\n', ' ')[:200])
    check('no page errors', not m.errs, str(m.errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED')
sys.exit(0 if all(ok) else 1)
