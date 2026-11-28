#!/usr/bin/env python3
"""IE Bao cao may v7.22: empty line days ("Not Set up"): grey row in the grids (Consolidator and IE Tech), estimate by Advance B with a switch, list card with Excel export.
Usage: python3 tests/ie-bao-cao-may/idle_ui.py [WORKDIR]   (synthetic demo data)"""
import sys, os, pathlib, subprocess, tempfile, datetime as dt, shutil
HERE = pathlib.Path(__file__).resolve().parent; REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'tests' / 'sim'))
import simlib; from simlib import *
import openpyxl
S = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); S.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(S / 'world')], check=True, stdout=subprocess.DEVNULL)
setup(S / 'world', S); SHARE = simlib.SHARE
# make a gap: on line A remove the 3 working days right BEFORE the first style change (like "Not Set up" rows that the MC Report drops)
plan = SHARE / 'TransformedMasterPlan.xlsx'; wb = openpyxl.load_workbook(plan); ws = wb['MasterPlan-Full']; rows = list(ws.iter_rows(values_only=True)); hdr = rows[0]
A = sorted([r for r in rows[1:] if r[0] == 'A'], key=lambda r: r[3]); chgs = [i for i in range(1, len(A)) if A[i][2] != A[i - 1][2]]; chg = chgs[1]; drop = {(r[0], r[3]) for r in A[chg - 3:chg]}
ws.delete_rows(2, ws.max_row); [ws.append(list(r)) for r in rows[1:] if (r[0], r[3]) not in drop]; wb.save(plan)
GAP_FROM, GAP_TO = A[chg - 3][3], A[chg - 1][3]; B_STYLE = A[chg][2]; print('  gap on line A:', GAP_FROM.date(), '-', GAP_TO.date(), 'before', B_STYLE)
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME); errs = []
    mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); mai.load(); pg = mai.pg; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom', MON.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(700)
    pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]', 'change'); pg.click('#pOpen'); pg.wait_for_timeout(2500)
    check('the estimate switch is on by default', pg.is_checked('#pFillOn') and pg.input_value('#pFillCap') == '14')
    idle = pg.evaluate("[...document.querySelectorAll('#pDetail tr.idle')].length"); est = pg.evaluate("document.querySelectorAll('#pDetail td.idl.est').length")
    check('a grey "empty" row appears under line A, with 3 estimated days (≈)', idle >= 1 and est >= 3, f'{idle} rows, {est} est cells')
    nums = pg.evaluate("[...document.querySelectorAll('#pDetail td.idl.est')].map(x=>x.textContent.trim())")
    check('the estimated quantity is written in the same row as the label (numbers, not just a mark)', len(nums) >= 3 and all(x.isdigit() for x in nums), str(nums))
    cols = pg.evaluate("[getComputedStyle(document.querySelector('#pDetail tr.idle td.idlab')).color, getComputedStyle(document.querySelector('#pDetail tr.idle td.idlab')).fontWeight, document.querySelectorAll('#pDetail td.est:not(.idl)').length]")
    check('the label of the empty row is red (not the grey of the normal labels) and the style row has no estimated cells', cols[0] == pg.evaluate("(()=>{var e=document.createElement('i');e.style.color='var(--bad)';document.body.appendChild(e);var c=getComputedStyle(e).color;e.remove();return c})()") and cols[2] == 0, str(cols))
    check('a total row of the estimated quantity is in the grid and the card summary', pg.evaluate("document.querySelectorAll('#pDetail tr.estsum').length") >= 1 and 'máy-ngày' in pg.inner_text('#pDetail'), pg.evaluate("(document.querySelector('#pDetail tr.estsum')||{innerText:''}).innerText.slice(0,80)"))
    lst = pg.evaluate("[...document.querySelectorAll('#pDetail .gblock')].filter(b=>b.querySelector('#pIdleX'))[0].innerText")
    check('the list card names the gap with its length, styles before / after and the way it was counted', 'Advance B' in lst and ('Giữa hai mã' in lst), lst[:200].replace('\n', ' | '))
    r_on = pg.evaluate("PS.rows.filter(x=>x.line==='A').map(x=>({to:x.to,load:new Date(x.load).toISOString().slice(0,10)}))"); print('  prep rows line A (estimate on):', r_on[:3])
    pg.uncheck('#pFillOn'); pg.wait_for_timeout(2500)
    check('switch off: no estimated cells, the grey cells show "—"', pg.evaluate("document.querySelectorAll('#pDetail td.idl.est').length") == 0 and pg.evaluate("document.querySelectorAll('#pDetail td.idl:not(.est):not(.lead)').length") >= 3)
    r_off = pg.evaluate("PS.rows.filter(x=>x.line==='A').map(x=>({to:x.to,load:new Date(x.load).toISOString().slice(0,10)}))"); print('  prep rows line A (estimate off):', r_off[:3])
    first_on = [r for r in r_on if r['to'] == B_STYLE]; first_off = [r for r in r_off if r['to'] == B_STYLE]
    check('Advance B moves the changeover of style B to the first empty day', first_on and first_off and first_on[0]['load'] == GAP_FROM.date().isoformat() and first_off[0]['load'] == (GAP_TO.date() + dt.timedelta(days=1)).isoformat(), f'{first_on[:1]} vs {first_off[:1]}')
    pg.check('#pFillOn'); pg.wait_for_timeout(2500)
    with pg.expect_download() as dl: pg.click('#pIdleX')
    xl = S / 'idle.xlsx'; dl.value.save_as(str(xl)); wbx = openpyxl.load_workbook(xl); wsx = wbx['NOT SET UP']; data = list(wsx.iter_rows(values_only=True))
    check('Excel: sheet "NOT SET UP" with one row per empty period', len(data) >= 2 and data[0][1] and any(r[1] == 'A' for r in data[1:]), str(len(data)))
    pg.click('#pSend'); pg.wait_for_timeout(1500); mai.push()
    hoa = IBM(br, 'Hoa'); hoa.open(at(2, 9, 0)); hp = hoa.pg; hp.on('pageerror', lambda e: errs.append(str(e)))
    hp.click('#roleSeg [data-role="tech"]'); hp.fill('#tName', 'Hoa'); hp.dispatch_event('#tName', 'input'); hp.select_option('#tPU', ''); hp.click('#tConnect'); hp.wait_for_timeout(1800)
    hp.click('#tGroupChips [data-tg="BT1M"]'); hp.wait_for_timeout(700)
    check('IE Tech grid shows the same grey row and the estimated days', hp.evaluate("document.querySelectorAll('#tGrid td.idl.est').length") >= 3 and hp.evaluate("document.querySelectorAll('#tGrid tr.estsum').length") >= 1)
    check('IE Tech sees a note that the grid includes the estimate', 'Advance B' in hp.inner_text('#tGrid'))
    check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
