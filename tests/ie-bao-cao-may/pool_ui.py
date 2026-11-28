#!/usr/bin/env python3
"""IE Bao cao may v7.15: "Gop loai may" (pool of machine groups that can replace each other) in the Shortage & prep tab, the IE Tech grid and the Remaining shortage tab.
The pool is chosen by the user, shown only when switched on, every group keeps its own table, totals equal the sum of the groups' own balances.
Usage: python3 tests/ie-bao-cao-may/pool_ui.py [WORKDIR]   (synthetic demo data)"""
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
def make_pool(pg, host, members):
    pg.click(f'{host} [data-pool-new]'); pg.wait_for_selector('#poolDlg')
    for g in members: pg.check(f'#poolDlg [data-pd-g="{g}"]')
    pg.click('#pdSave'); pg.wait_for_timeout(600)
def pool_rows(pg, host):
    return pg.evaluate("h=>[...document.querySelectorAll(h+' .gblock table.pg tr')].map(tr=>[...tr.children].map(c=>c.textContent.trim()))", host)
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME); errs = []
    mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); mai.load(); pg = mai.pg; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom', MON.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(700)
    for g in ('BT1M', 'ZZM'): pg.check(f'[data-pg="{g}"]'); pg.dispatch_event(f'[data-pg="{g}"]', 'change')
    pg.click('#pOpen'); pg.wait_for_timeout(2500)
    check('Shortage & prep: the pool button is there, no pool is shown by itself', pg.is_visible('#pPool [data-pool-new]') and pg.query_selector('#pPool .gblock') is None)
    make_pool(pg, '#pPool', ['BT1M', 'ZZM'])
    rows = pool_rows(pg, '#pPool'); labels = [r[0] for r in rows]; print('  pool rows:', labels)
    check('the pool shows each group separately (demand, available, remaining) and the combined total', any('BT1M: nhu cầu' in l for l in labels) and any('ZZM: máy sẵn có' in l for l in labels) and any('Tổng còn lại' in l for l in labels))
    num = lambda c: int(c) if c.lstrip('-−').isdigit() else 0
    row = {r[0]: [num(c.replace('−', '-')) for c in r[1:]] for r in rows if r[0]}
    bA, bB = row['BT1M: còn lại'], row['ZZM: còn lại']; tot = row['Tổng còn lại (gộp)']
    check('total remaining = BT1M remaining + ZZM remaining on every day', tot == [a + b for a, b in zip(bA, bB)], f'{tot[:6]} vs {[a + b for a, b in zip(bA, bB)][:6]}')
    sa = row['Còn thiếu sau khi gộp']; check('still short after combining never exceeds the sum of the own shortages', all(s <= max(0, -a) + max(0, -b) for s, a, b in zip(sa, bA, bB)))
    own = pg.evaluate("[...document.querySelectorAll('#pDetail h3')].map(h=>h.textContent.trim().split(' ')[0])"); check('the groups keep their own tables', 'BT1M' in own and 'ZZM' in own, str(own))
    pg.click('#pPool [data-pool-toggle]'); pg.wait_for_timeout(300); check('clicking the chip hides the pool', pg.query_selector('#pPool .gblock') is None)
    pg.click('#pPool [data-pool-toggle]'); pg.wait_for_timeout(300); check('clicking again shows it', pg.query_selector('#pPool .gblock') is not None)
    pg.click('#pSend'); pg.wait_for_timeout(1500); mai.push()
    hoa = IBM(br, 'Hoa'); hoa.open(at(2, 9, 0)); hp = hoa.pg; hp.on('pageerror', lambda e: errs.append(str(e)))
    hp.click('#roleSeg [data-role="tech"]'); hp.fill('#tName', 'Hoa'); hp.dispatch_event('#tName', 'input'); hp.select_option('#tPU', ''); hp.click('#tConnect'); hp.wait_for_timeout(1800)
    hp.click('#tGroupChips [data-tg="BT1M"]'); hp.wait_for_timeout(600)
    check('IE Tech grid: pool button present, nothing shown by itself', hp.is_visible('#tPool [data-pool-new]') and hp.query_selector('#tPool .gblock') is None)
    make_pool(hp, '#tPool', ['BT1M', 'ZZM']); rr = pool_rows(hp, '#tPool')
    check('IE Tech grid: the pool shows both groups', any('BT1M: còn lại' in r[0] for r in rr) and any('ZZM: còn lại' in r[0] for r in rr))
    hp.click('#tComplete'); hp.wait_for_timeout(800); hoa.push()
    m2 = IBM(br, 'Mai'); m2.open(at(2, 10, 0)); m2.load(); mp = m2.pg; mp.on('pageerror', lambda e: errs.append(str(e)))
    mp.click('#mainTabs [data-tab="resid"]'); mp.wait_for_timeout(1800)
    check('Remaining shortage tab: pool button present', mp.is_visible('#rsCP [data-pool-new]'))
    make_pool(mp, '#rsCP', ['BT1M', 'ZZM']); r3 = pool_rows(mp, '#rsCP'); check('Remaining shortage tab: the pool is shown', any('Tổng còn lại' in r[0] for r in r3))
    tt = lambda R: [r for r in R if 'Tổng còn lại' in r[0]][0][1:]
    n = min(len(tt(rr)), len(tt(r3))); check('IE Tech grid and the Remaining shortage tab give the same combined total (same days)', n > 0 and tt(rr)[:n] == tt(r3)[:n], f'{tt(rr)[:6]} vs {tt(r3)[:6]}')
    check('no page errors', not errs, str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
