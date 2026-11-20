#!/usr/bin/env python3
"""Turnkey smoke test of plan-compare/PlanCompare.html with SYNTHETIC data (no company files).
Needs: pip install playwright openpyxl. Usage: python3 tests/plan-compare/smoke.py [--shots DIR]"""
import sys, os, tempfile, datetime as dt, pathlib
import openpyxl
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
tmp = pathlib.Path(tempfile.mkdtemp())
D0 = dt.datetime(2026, 11, 23)  # Monday

# --- MC report: 4 styles, machines, groups
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'MACHINE DATABASE'
ws.append(['STYLE', 'MACHINE', 'QUANTITY', 'REMARK', 'DATE'])
styles = {'AAA26-00001-1101(XX)': {'DNLS': 10, 'BT1M': 2}, 'AAA26-00002-1102(XX)': {'DNLS': 6, 'FLAT': 4},
          'AAA26-00003-1103(XX)': {'FLAT': 8}, 'AAA26-00004-1104(XX)': {'DNLS': 3, 'BT1M': 6}}
for s, m in styles.items():
    for c, q in m.items(): ws.append([s, c, q, 'sx', dt.datetime(2026, 11, 1)])
g = wb.create_sheet('MACHINE GROUP'); g.append(['Code', 'Group'])
for c, gr in {'DNLS': 'LOCKSTITCH', 'FLAT': 'FLATLOCK', 'BT1M': 'BARTACK'}.items(): g.append([c, gr])
p = wb.create_sheet('PU LIST'); p.append(['Line', 'PU']); [p.append([l, 'PU1']) for l in 'ABC']
st_ = wb.create_sheet('MC STATUS'); st_.append(['Machine code', 'Machine in house', 'MC used for PDN'])
for c, v in {'DNLS': 20, 'FLAT': 12, 'BT1M': 8}.items(): st_.append([c, v, v])
wb.save(tmp / 'MC_report.xlsx')

# --- plan weeks: line -> list of (style, start offset days, length)
def plan(name, spec):
    w = openpyxl.Workbook(); s = w.active; s.title = 'MasterPlan-Full'; s.append(['Line', 'GOP', 'Style No', 'Date'])
    for line, seq in spec.items():
        for st, a, n in seq:
            for d in range(a, a + n):
                day = D0 + dt.timedelta(days=d)
                if day.weekday() != 6: s.append([line, 1, st, day])
    w.save(tmp / name)
S = list(styles)
plan('TransformedMasterPlan_20261116.xlsx', {'A': [(S[0], 0, 10), (S[1], 10, 10)], 'B': [(S[2], 0, 20)], 'C': [(S[3], 0, 14), (S[0], 14, 6)]})
plan('TransformedMasterPlan_20261123.xlsx', {'A': [(S[0], 0, 10), (S[1], 10, 10)], 'B': [(S[2], 0, 8), (S[3], 8, 12)], 'C': [(S[3], 0, 14), (S[0], 14, 6)]})
plan('TransformedMasterPlan_20261130.xlsx', {'A': [(S[0], 0, 6), (S[1], 6, 14)], 'B': [(S[2], 0, 11), (S[3], 11, 9)], 'C': [(S[3], 0, 14), (S[0], 14, 6)]})

shots = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium'), args=['--no-sandbox']); pg = b.new_page(viewport={'width': 1300, 'height': 900}, device_scale_factor=1)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + str(ROOT / 'plan-compare' / 'PlanCompare.html'))
    pg.set_input_files('#fMc', str(tmp / 'MC_report.xlsx')); pg.wait_for_timeout(500)
    pg.set_input_files('#fPlans', [str(tmp / n) for n in sorted(os.listdir(tmp)) if n.startswith('Transformed')]); pg.wait_for_timeout(800)
    st = pg.evaluate("(()=>{const s=PC.state();return {n:s.SN.length,stamps:s.SN.map(x=>new Date(x.f.stamp).toISOString().slice(0,10)),sel:Object.keys(s.SELG),tr:s.RES.tr.map(t=>({rows:t.rows.length,chg:t.chgLineDays,tot:t.totalLineDays,gs:Object.fromEntries(Object.entries(t.gs).map(([g,x])=>[g,x.swing]))})),styles:s.RES.styles.map(x=>[x.name,x.moves])}})()")
    print(st)
    assert st['n'] == 3 and st['stamps'] == ['2026-11-16', '2026-11-23', '2026-11-30']
    # window starts at newest stamp (2026-11-30): hand check below
    pg.fill('#iFrom', '2026-11-23'); pg.dispatch_event('#iFrom', 'change'); pg.wait_for_timeout(300)
    st = pg.evaluate("(()=>{const s=PC.state();return s.RES.tr.map(t=>({chg:t.chgLineDays,gs:Object.fromEntries(Object.entries(t.gs).map(([g,x])=>[g,x.swing]))}))})()")
    print(st)
    # transition 1 (16->23): B line style3->style4 from day 8 (23 Nov+8 = 1 Dec), 12 days minus Sundays; FLATLOCK -8, LOCKSTITCH +3, BARTACK +6 per day
    # window 23 Nov..21 Dec => days offset 8..19 (Sundays: offsets 6,13,20 are Sundays). offsets 8..19 minus 13 = 11 working days
    # plan A had style3 until offset 20 (non-Sunday days only listed) so changed days = 11
    assert st[0]['gs']['FLATLOCK'] == 8 * 11 and st[0]['gs']['LOCKSTITCH'] == 3 * 11 and st[0]['gs']['BARTACK'] == 6 * 11, st[0]
    assert st[0]['chg'] == 11
    # shortage: BARTACK available 8. Old plan (16/11->23/11 transition): demand 6 -> enough. New plan: line B style4 (+6) on offsets 8..12 while line C style4 (6) still runs = 12 for 5 days, peak 14 on offsets 8-9 (line A style1 adds BT1M 2) -> short 6
    sh = pg.evaluate("(()=>{const x=PC.state().RES.tr[0].gs.BARTACK;return [x.av,x.shA,x.shB,x.shDB]})()")
    print(sh); assert sh == [8, 0, 6, 5], sh
    for tab in ['over', 'dem', 'short', 'chg', 'freq']:
        pg.click('[data-tab=%s]' % tab); pg.wait_for_timeout(200)
        if shots: pg.screenshot(path=os.path.join(shots, 'pc-%s.png' % tab))
    html = pg.inner_text('#out'); assert 'Σ' in html or 'Σ' in pg.content()
    # export triggers a download
    with pg.expect_download() as dl: pg.click('#bExport')
    assert dl.value.suggested_filename == 'PlanCompare.xlsx'
    assert not errs, errs
    b.close()
print('OK')
