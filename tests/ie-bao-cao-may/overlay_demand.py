#!/usr/bin/env python3
"""IE Bao cao may v7.9: after "Lưu MACHINE DATABASE" the shortage report counts the approved changes at once (labelled),
the numbers equal what a fresh session shows after the Excel paste + Refresh All, and IE Tech sees the basis of the proposal.
Usage: python3 tests/ie-bao-cao-may/overlay_demand.py [WORKDIR]"""
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
def write_layout(path, style, mc):
    wb = Workbook(); ws = wb.active; ws.title = 'Layout'; ws['A3'] = 'Style'; ws['B3'] = style; ws['A6'] = 'M/C'; ws['B6'] = '1 Line'; ws['C6'] = 'Remark'
    r = 7
    for c, q in mc.items(): ws.cell(r, 1, c); ws.cell(r, 2, q); r += 1
    ws.cell(r, 1, 'TOTAL'); ws.cell(r, 2, sum(mc.values())); pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True); wb.save(path)
def ranking(pg):
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom', MON.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(700)
    return [' '.join(r.inner_text().split()) for r in pg.query_selector_all('#pRank tbody tr')]
# Hoa pushed new layouts for the week (BT1M / ZZM / FLM go up)
write_layout(SHARE / 'lay/PU2 SPORT/DMO26-00202-2201.xlsx', 'DMO26-00202-2201(XX)', {'1NLS': 8, '1NLB': 4, '4OLS': 3, '4OLB': 3, '1SLM': 3, 'BT1M': 5, 'FLM': 4})
write_layout(SHARE / 'lay/PU3/DMO26-00306-3301.xlsx', 'DMO26-00306-3301(XX)', {'1NLS': 6, '1NLB': 3, '4OLS': 2, '4OLB': 2, '1SLM': 2, 'BT1M': 4, 'FLM': 5})
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME)
    mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); mai.load(); pg = mai.pg
    before = ranking(pg); print('before saving :', before[1:4])
    mai.scan(); saved = mai.approve_save(S); pg.wait_for_timeout(800)
    after = ranking(pg); print('right after   :', after[1:4])
    src = pg.locator('text=Nhu cầu tính từ').first.locator('xpath=..').inner_text().replace('\n', ' '); print('source line   :', src[:220])
    check('numbers change right after saving (no Excel round trip)', before != after)
    check('the source line says how many just-approved changes are included', 'vừa duyệt' in src, src[:160])
    # recompute from the pasted + refreshed MC report, in a fresh session
    paste_into_table1(saved)
    m2 = IBM(br, 'Mai'); m2.open(at(2, 8, 30)); m2.load(); fresh = ranking(m2.pg); print('after paste   :', fresh[1:4])
    check('right-after-save numbers == numbers after paste + refresh', after == fresh, f'{after[1:3]} vs {fresh[1:3]}')
    src2 = m2.pg.locator('text=Nhu cầu tính từ').first.locator('xpath=..').inner_text()
    check('no overlay label once the MC Report has the changes', 'vừa duyệt' not in src2)
    # a proposal sent while the overlay is active tells IE Tech
    pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]', 'change'); pg.click('#pOpen'); pg.wait_for_timeout(2500); pg.click('#pSend'); pg.wait_for_timeout(1500); mai.push()
    hoa = IBM(br, 'Hoa'); hoa.open(at(2, 9, 0)); hp = hoa.pg
    hp.click('#roleSeg [data-role="tech"]'); hp.fill('#tName', 'Hoa'); hp.dispatch_event('#tName', 'input'); hp.select_option('#tPU', ''); hp.click('#tConnect'); hp.wait_for_timeout(1800)
    note = hp.inner_text('#tGrid')[:260].replace('\n', ' '); print('IE Tech sees  :', note[:200])
    check('IE Tech sees the basis note (N changes not yet in the MC Report)', 'vừa duyệt' in note and 'chưa được dán' in note)
    check('no page errors', not (mai.errs or m2.errs or hoa.errs), str([mai.errs, m2.errs, hoa.errs])); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
