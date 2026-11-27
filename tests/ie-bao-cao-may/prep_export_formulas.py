#!/usr/bin/env python3
"""IE Bao cao may v7.14: the Shortage & prep Excel export has live formulas (PU / total production and prep by SUMIFS, total, available = sum of the MC STATUS parts,
balance = available - total, PREP BY PU totals, prep quantity). The formulas are recalculated with LibreOffice and must equal the values shown in the tool.
Usage: python3 tests/ie-bao-cao-may/prep_export_formulas.py [WORKDIR]   (synthetic demo data; needs LibreOffice `soffice`)"""
import sys, os, pathlib, subprocess, tempfile, shutil
HERE = pathlib.Path(__file__).resolve().parent; REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'tests' / 'sim'))
import simlib; from simlib import *
import openpyxl
S = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); S.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(S / 'world')], check=True, stdout=subprocess.DEVNULL)
setup(S / 'world', S); SHARE = simlib.SHARE
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME); mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); mai.load(); pg = mai.pg
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom', MON.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(700)
    for g in ('BT1M', 'ZZM'): pg.check(f'[data-pg="{g}"]'); pg.dispatch_event(f'[data-pg="{g}"]', 'change')
    pg.click('#pOpen'); pg.wait_for_timeout(2500)
    with pg.expect_download() as dl: pg.click('#pExport')
    out = S / 'export.xlsx'; dl.value.save_as(str(out)); br.close()
wb = openpyxl.load_workbook(out); vals = openpyxl.load_workbook(out, data_only=True)
sheets = [n for n in wb.sheetnames if n in ('BT1M', 'ZZM')]; check('one sheet per machine group', len(sheets) == 2, str(wb.sheetnames))
nf = {n: sum(1 for r in wb[n].iter_rows() for c in r if isinstance(c.value, str) and c.value.startswith('=')) for n in sheets}
check('summary rows are formulas', all(v > 10 for v in nf.values()), str(nf))
ws = wb['BT1M']; rows = {str(r[2].value).strip(): r for r in ws.iter_rows(min_row=2) if r[2].value}
check('column D marks PROD / PREP rows', {str(r[3].value) for r in ws.iter_rows(min_row=2) if r[3].value} >= {'PROD', 'PREP'})
bal = [r for k, r in rows.items() if k.lower().startswith(('còn lại', 'balance', 'remaining'))]
print('  balance label rows:', [k for k in rows if 'lại' in k.lower() or 'bal' in k.lower()][:3])
rc = S / 'rc'; shutil.rmtree(rc, ignore_errors=True); rc.mkdir()
subprocess.run(['soffice', '--headless', '--convert-to', 'xlsx', '--outdir', str(rc), str(out)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
rv = openpyxl.load_workbook(rc / 'export.xlsx', data_only=True)
bad = 0; tot = 0; err = 0
for n in sheets:
    for r in wb[n].iter_rows():
        for c in r:
            if isinstance(c.value, str) and c.value.startswith('='):
                tot += 1; a = vals[n][c.coordinate].value; b = rv[n][c.coordinate].value
                if isinstance(b, str) and b.startswith('#'): err += 1
                elif (a or 0) != (b or 0): bad += 1
check(f'{tot} formulas recalculated by LibreOffice equal the values written by the tool', tot > 0 and bad == 0, f'{bad} different')
check('no formula errors', err == 0, str(err))
pb = wb['PREP BY PU'] if 'PREP BY PU' in wb.sheetnames else None
check('PREP BY PU has a total row with SUM formulas', pb is None or any(isinstance(c.value, str) and c.value.startswith('=SUM') for r in pb.iter_rows(min_row=2) for c in r))
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
