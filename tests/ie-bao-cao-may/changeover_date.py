#!/usr/bin/env python3
"""IE Bao cao may v7.17: the loading date IE Tech sets in one machine group (BT1M) applies to the same changeover in the other groups (ZZM) too: prep days and production move.
Usage: python3 tests/ie-bao-cao-may/changeover_date.py [WORKDIR]   (synthetic demo data)"""
import sys, os, pathlib, subprocess, tempfile, datetime as dt
HERE = pathlib.Path(__file__).resolve().parent; REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'tests' / 'sim'))
import simlib; from simlib import *
S = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); S.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(S / 'world')], check=True, stdout=subprocess.DEVNULL)
setup(S / 'world', S); SHARE = simlib.SHARE
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME); errs = []
    mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); mai.load(); pg = mai.pg
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom', MON.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(700)
    for g in ('BT1M', 'ZZM'): pg.check(f'[data-pg="{g}"]'); pg.dispatch_event(f'[data-pg="{g}"]', 'change')
    pg.fill('[data-pr="ZZM"]', '100'); pg.dispatch_event('[data-pr="ZZM"]', 'input')
    pg.click('#pOpen'); pg.wait_for_timeout(2500); pg.click('#pSend'); pg.wait_for_timeout(1500); mai.push()
    hoa = IBM(br, 'Hoa'); hoa.open(at(2, 9, 0)); hp = hoa.pg; hp.on('pageerror', lambda e: errs.append(str(e)))
    hp.click('#roleSeg [data-role="tech"]'); hp.fill('#tName', 'Hoa'); hp.dispatch_event('#tName', 'input'); hp.select_option('#tPU', ''); hp.click('#tConnect'); hp.wait_for_timeout(1800)
    hp.click('#tGroupChips [data-tg="BT1M"]'); hp.wait_for_timeout(600)
    rows = hp.evaluate("techRows().map(x=>({k:x.key,line:x.line,from:x.from,to:x.to,g:x.group,load:x.load}))")
    pairs = [(a, b) for a in rows if a['g'] == 'BT1M' for b in rows if b['g'] == 'ZZM' and (a['line'], a['from'], a['to'], a['load']) == (b['line'], b['from'], b['to'], b['load'])]
    check('a changeover exists in both BT1M and ZZM', bool(pairs)); a, b = pairs[0]; print('  changeover:', a['line'], a['from'][:14], '->', a['to'][:14], a['load'])
    hp.click(f'[data-qe="{a["k"]}"]'); hp.wait_for_timeout(500); cur = hp.input_value('#dDate'); new = (dt.date.fromisoformat(cur) + dt.timedelta(days=3)).isoformat()
    hp.fill('#dDate', new); hp.dispatch_event('#dDate', 'change'); hp.click('#dKeep'); hp.wait_for_timeout(1500)
    after = hp.evaluate("techRows().map(x=>({k:x.key,g:x.group,la:x.loadActual||null,status:x.status,days:x.days,flags:x.flags}))")
    ra = [r for r in after if r['k'] == a['k']][0]; rb = [r for r in after if r['k'] == b['k']][0]
    snap = lambda d: (dt.date.fromisoformat(d) + dt.timedelta(days=1 if dt.date.fromisoformat(d).weekday() == 6 else 0)).isoformat()
    check('BT1M row: loading date moved', ra['la'] in (new, snap(new)), str(ra['la']))
    check('ZZM row of the same changeover moved to the same date without its own review', rb['la'] == ra['la'] and 'dateSet' in rb['flags'], str(rb['la']))
    check('the ZZM row is still waiting for its own decision', rb['status'] == 'PENDING', rb['status'])
    check('ZZM prep days follow the new loading date', rb['days'] == ra['days'], f"{rb['days']} vs {ra['days']}")
    others = [r for r in after if r['g'] == 'ZZM' and r['k'] != b['k'] and r['la']]; check('other changeovers of ZZM are not moved', not others, str(others[:1]))
    check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
