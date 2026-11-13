#!/usr/bin/env python3
"""Create SYNTHETIC demo data (fake styles DMO26-..., fake lines) to take the manual screenshots.
No company data is used. Usage: python3 make_demo_data.py OUT_DIR
Writes OUT_DIR/{MC_report.xlsx, TransformedMasterPlan.xlsx, Linemapping.xlsx, lay/<PU>/<style>.xlsx}
"""
import sys, pathlib, datetime as dt
from openpyxl import Workbook

OUT = pathlib.Path(sys.argv[1]); (OUT / 'lay').mkdir(parents=True, exist_ok=True)
today = dt.date.today(); MON = today - dt.timedelta(days=today.weekday())          # Monday of the current week
D = lambda n: MON + dt.timedelta(days=n - 9)                                        # D(9) = Monday, D(13) = Friday ... (day-of-November style numbering)

# machine code -> machine group
GROUPS = {'1NLS': '1NLM', '1NLB': '1NLM', '4OLS': '4OLM', '4OLB': '4OLM', '1SLM': '1SLM', 'BT1M': 'BT1M', 'ZZM': 'ZZM', 'FLM': 'FLM'}
def mk(n1, n4, sl, bt, zz, fl):
    d = {'1NLS': n1 - n1 // 3, '1NLB': n1 // 3, '4OLS': n4 - n4 // 2, '4OLB': n4 // 2, '1SLM': sl, 'BT1M': bt, 'ZZM': zz, 'FLM': fl}
    return {k: v for k, v in d.items() if v}

PU = {'A': 'PU1', 'B': 'PU1', 'K': 'PU2 SPORT', 'J': 'PU2 SPORT', 'D': 'PU3', 'E': 'PU3'}
# line -> [(style, first day, last day)]
PLAN = {
 'A': [('DMO26-00101-1101(XX)', 9, 11), ('DMO26-00102-1201(XX)', 12, 17), ('DMO26-00103-1301(XX)', 18, 28)],
 'B': [('DMO26-00104-1101(XX)', 9, 13), ('DMO26-00105-1201(XX)', 14, 19), ('DMO26-00106-1301(XX)', 20, 28)],
 'K': [('DMO26-00201-2101(XX)', 9, 12), ('DMO26-00202-2201(XX)', 13, 20), ('DMO26-00203-2301(XX)', 21, 24), ('DMO26-00207-2401(XX)', 25, 28)],
 'J': [('DMO26-00204-2101(XX)', 9, 14), ('DMO26-00205-2201(XX)', 16, 21), ('DMO26-00206-2301(XX)', 23, 28)],
 'D': [('DMO26-00301-3101(XX)', 9, 13), ('DMO26-00302-3201(XX)', 14, 19), ('DMO26-00303-3301(XX)', 20, 28)],
 'E': [('DMO26-00304-3101(XX)', 9, 12), ('DMO26-00305-3201(XX)', 13, 18), ('DMO26-00306-3301(XX)', 19, 28)],
}
# machine database (code -> qty per style). Styles missing here have no data yet.
DB = {
 'DMO26-00101-1101(XX)': mk(12, 5, 3, 2, 0, 4), 'DMO26-00102-1201(XX)': mk(14, 6, 2, 3, 1, 4), 'DMO26-00103-1301(XX)': mk(10, 4, 2, 4, 0, 3),
 'DMO26-00104-1101(XX)': mk(11, 6, 2, 3, 0, 3), 'DMO26-00105-1201(XX)': mk(13, 5, 3, 2, 1, 4), 'DMO26-00106-1301(XX)': mk(9, 4, 2, 5, 0, 3),
 'DMO26-00201-2101(XX)': mk(15, 4, 4, 3, 1, 5), 'DMO26-00202-2201(XX)': mk(12, 6, 3, 4, 0, 4),
 'DMO26-00204-2101(XX)': mk(14, 5, 3, 3, 0, 4), 'DMO26-00206-2301(XX)': mk(10, 4, 2, 4, 1, 3),
 'DMO26-00301-3101(XX)': mk(12, 6, 2, 3, 0, 4), 'DMO26-00302-3201(XX)': mk(13, 5, 3, 4, 1, 3), 'DMO26-00303-3301(XX)': mk(11, 4, 2, 3, 0, 4),
 'DMO26-00304-3101(XX)': mk(10, 5, 3, 2, 0, 3), 'DMO26-00305-3201(XX)': mk(12, 6, 2, 5, 1, 4), 'DMO26-00306-3301(XX)': mk(9, 4, 2, 4, 0, 3),
}
# layouts (code -> qty). Default = same as database; overrides create the scenarios shown in the manuals.
LAY = {k: dict(v) for k, v in DB.items()}
LAY['DMO26-00102-1201(XX)'] = {**DB['DMO26-00102-1201(XX)'], '1NLS': 5, '1NLB': 9}                 # same group total, different codes
LAY['DMO26-00105-1201(XX)'] = {**DB['DMO26-00105-1201(XX)'], '4OLB': 3, 'BT1M': 3}                 # 4OLM +1, BT1M +1  -> differences
LAY['DMO26-00302-3201(XX)'] = {**DB['DMO26-00302-3201(XX)'], 'ZZM': 2, 'FLM': 5}                    # changed quantities
LAY['DMO26-00205-2201(XX)'] = mk(13, 4, 3, 4, 1, 4)                                                  # new style: layout, not in database yet
for s in ('DMO26-00202-2201(XX)', 'DMO26-00203-2301(XX)'): LAY.pop(s, None)                          # no layout file for these

def wb_save(wb, path): path.parent.mkdir(parents=True, exist_ok=True); wb.save(path)

# ---- layouts (+ a corrected copy of the failing layout, used by the "IE Tech fixes the layout" step)
FIXED = {'DMO26-00105-1201(XX)': DB['DMO26-00105-1201(XX)']}
def write_layout(path, s, mc):
    wb = Workbook(); ws = wb.active; ws.title = 'Layout'
    ws['A3'] = 'Style'; ws['B3'] = s; ws['A4'] = 'Demo layout (synthetic data)'
    ws['A6'] = 'M/C'; ws['B6'] = '1 Line'; ws['C6'] = 'Remark'
    r = 7
    for code, q in mc.items(): ws.cell(r, 1, code); ws.cell(r, 2, q); r += 1
    ws.cell(r, 1, 'TOTAL'); ws.cell(r, 2, sum(mc.values()))
    wb_save(wb, path)
for s, mc in FIXED.items():
    line = next(l for l, seq in PLAN.items() for x in seq if x[0] == s)
    write_layout(OUT / 'lay_fixed' / PU[line] / (s.replace('(XX)', '') + '.xlsx'), s, mc)
for s, mc in LAY.items():
    line = next(l for l, seq in PLAN.items() for x in seq if x[0] == s)
    write_layout(OUT / 'lay' / PU[line] / (s.replace('(XX)', '') + '.xlsx'), s, mc)

# ---- Linemapping + plan
wb = Workbook(); ws = wb.active; ws.title = 'Linemapping'; ws.append(['Line', 'PU'])
for l, p in PU.items(): ws.append([l, p])
wb_save(wb, OUT / 'Linemapping.xlsx')
wb = Workbook(); ws = wb.active; ws.title = 'MasterPlan-Full'; ws.append(['Line', 'GOP', 'Style No', 'Date'])
plan_rows = []
for l, seq in PLAN.items():
    for s, a, b in seq:
        for n in range(a, b + 1):
            d = D(n)
            if d.weekday() == 6: continue                                                            # Sundays off
            ws.append([l, 'GOP-' + l, s, dt.datetime(d.year, d.month, d.day)]); plan_rows.append((l, d, s))
wb_save(wb, OUT / 'TransformedMasterPlan.xlsx')

# ---- MC report
wb = Workbook(); ws = wb.active; ws.title = 'MACHINE DATABASE'; ws.append(['DATE', 'STYLE', 'MACHINE', 'MACHINE GROUP', 'QUANTITY', 'REMARK'])
dbd = dt.datetime(MON.year, MON.month, MON.day) - dt.timedelta(days=7)
for s, mc in DB.items():
    for code, q in mc.items(): ws.append([dbd, s, code, GROUPS[code], q, 'IETL'])
ws = wb.create_sheet('COSTING PROPOSAL'); ws.append(['STYLE', 'MACHINE', 'QUANTITY', 'Status', 'Factor', 'IEDDate'])      # costing only for the style that has no layout and no data
for code, q in mk(11, 4, 2, 3, 0, 3).items(): ws.append(['DMO26-00203-2301(XX)', code, q, 'OK', 24, dt.datetime(MON.year, MON.month, MON.day)])
ws = wb.create_sheet('MACHINE GROUP'); ws.append(['MACHINE', 'MACHINE GROUP'])
for c, g in GROUPS.items(): ws.append([c, g])
ws = wb.create_sheet('MACHINE BY LINE'); ws.append(['Line', 'Date', 'GOP', 'Style No', 'MACHINE GROUP', 'Qty'])
for l, d, s in plan_rows:
    if s not in DB: continue
    tot = {}
    for c, q in DB[s].items(): tot[GROUPS[c]] = tot.get(GROUPS[c], 0) + q
    for g, q in tot.items(): ws.append([l, dt.datetime(d.year, d.month, d.day), 'GOP-' + l, s, g, q])
ws = wb.create_sheet('MC STATUS'); ws.append(['MC STATUS (demo)']); ws.append([])
ws.append(['Machine code', 'Description', 'Machine in house', 'RENT', 'BORROW', 'BROKEN', 'LENDING', 'TRA', 'MC used for PDN'])
AV = {'1NLS': (60, 0, 2, 2, 0, 0), '1NLB': (30, 0, 0, 1, 0, 0), '4OLS': (26, 0, 0, 1, 0, 0), '4OLB': (14, 0, 0, 0, 0, 0), '1SLM': (20, 0, 0, 1, 0, 0),
      'BT1M': (21, 0, 2, 1, 1, 0), 'ZZM': (4, 0, 0, 1, 0, 0), 'FLM': (28, 0, 0, 2, 0, 0)}
for c, (ih, rent, bor, brk, lend, tra) in AV.items(): ws.append([c, 'demo', ih, rent, bor, brk, lend, tra, ih + rent + bor - brk - lend - tra])
ws = wb.create_sheet('PU LIST'); ws.append(['Line', 'PU'])
for l, p in PU.items(): ws.append([l, p])
wb_save(wb, OUT / 'MC_report.xlsx')
# ---- a tiny PDF (layout that exists only as PDF, for the "manual entry" screenshots)
pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
(OUT / 'pdf').mkdir(exist_ok=True); (OUT / 'pdf' / 'DMO26-00302-3201.pdf').write_bytes(pdf)
print('demo data written to', OUT)
