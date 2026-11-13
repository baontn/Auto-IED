#!/usr/bin/env python3
"""IE Bao cao may v7.9: "Thiếu máy còn lại" (Consolidator tab + read-only Supervisor role), action log in the data folder, what-if delay.
Checks that the numbers equal IE Tech's own grid footer. Usage: python3 tests/ie-bao-cao-may/residual_shortage.py [WORKDIR]"""
import sys, os, re, pathlib, subprocess, tempfile, datetime as dt
HERE = pathlib.Path(__file__).resolve().parent; REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'tests' / 'sim'))
import simlib; from simlib import *
S = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()); S.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, str(REPO / 'tools/manual_shots/make_demo_data.py'), str(S / 'world')], check=True, stdout=subprocess.DEVNULL)
setup(S / 'world', S); SHARE = simlib.SHARE
CHROME = dict(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium'), args=['--no-sandbox'])
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
nums = lambda cells: [int(c) for c in cells if re.fullmatch(r'-?\d+', c.strip())]
def sup_open(br, when):
    s = IBM(br, 'Giam sat'); s.open(when); pg = s.pg; pg.click('#roleSeg [data-role="sup"]'); pg.click('#sConnect'); pg.wait_for_timeout(2000); return s
def summary(pg, root='#rsS'):
    out = {}
    for tr in pg.query_selector_all(f'{root} tr[data-rs-g]'):
        c = [x.inner_text().strip() for x in tr.query_selector_all('td')]; out[c[0]] = c
    return out
def gap_of(cell):                                                    # "−7 (13/11)" -> 7 ; "Đủ máy" -> 0
    m = re.search(r'[−-](\d+)', cell); return int(m.group(1)) if m else 0
with sync_playwright() as p:
    br = p.chromium.launch(**CHROME)
    print('--- Mai sends the proposal; Hoa (IE Tech) decides')
    mai = IBM(br, 'Mai'); mai.open(at(1, 8, 30)); mai.load(); pg = mai.pg
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom', MON.isoformat()); pg.dispatch_event('#pFrom', 'change'); pg.wait_for_timeout(700)
    for g in ('BT1M', 'ZZM'): pg.check(f'[data-pg="{g}"]'); pg.dispatch_event(f'[data-pg="{g}"]', 'change')
    pg.fill('[data-pr="ZZM"]', '100'); pg.dispatch_event('[data-pr="ZZM"]', 'input'); pg.click('#pOpen'); pg.wait_for_timeout(2500); pg.click('#pSend'); pg.wait_for_timeout(1500); mai.push()
    hoa = IBM(br, 'Hoa'); hoa.open(at(2, 9, 0)); hp = hoa.pg
    hp.click('#roleSeg [data-role="tech"]'); hp.fill('#tName', 'Hoa'); hp.dispatch_event('#tName', 'input'); hp.select_option('#tPU', ''); hp.click('#tConnect'); hp.wait_for_timeout(1800)
    foot = {}
    for g in ['BT1M', 'ZZM']:
        hp.click(f'#tGroupChips [data-tg="{g}"]'); hp.wait_for_timeout(600)
        keys = hp.evaluate("[...document.querySelectorAll('#tGrid [data-qk]')].map(b=>b.dataset.qk)")
        for i, k in enumerate(keys):
            if g == 'BT1M' and i == 2:                                     # IE Tech moves one loading date 3 days later
                hp.click(f'[data-qe="{k}"]'); hp.wait_for_timeout(500); cur = hp.input_value('#dDate'); hp.fill('#dDate', (dt.date.fromisoformat(cur) + dt.timedelta(days=3)).isoformat()); hp.dispatch_event('#dDate', 'change'); hp.click('#dKeep'); hp.wait_for_timeout(700); continue
            hp.click(f'[data-qr="{k}"]' if (g == 'ZZM' and i < 2) else f'[data-qk="{k}"]'); hp.wait_for_timeout(200)
        rows = hp.evaluate("[...document.querySelectorAll('#tGrid tr')].map(tr=>[...tr.children].map(c=>c.textContent.trim()))")
        foot[g] = nums([c for r in rows if r[:3].count('Còn lại') == 1 for c in r[3:]])
        print(f'  IE Tech footer {g}:', foot[g][:14])
    hp.click('#tComplete'); hp.wait_for_timeout(800); hoa.push()
    check('IE Tech footers read', all(foot[g] for g in foot))
    print('--- Supervisor (read-only) opens the same data folder')
    sup = sup_open(br, at(2, 11, 0)); sp = sup.pg; sm = summary(sp); print('  summary:', {g: sm[g][1:5] for g in sm})
    for g in foot:
        neg = [v for v in foot[g] if v < 0]
        check(f'{g}: days short = IE Tech footer ({len(neg)})', g in sm and sm[g][2].split('/')[0].strip() == str(len(neg)), sm.get(g, ['?'] * 3)[2])
        check(f'{g}: worst gap = IE Tech footer ({-min(foot[g]) if neg else 0})', g in sm and gap_of(sm[g][3]) == (-min(foot[g]) if neg else 0), sm.get(g, ['?'] * 4)[3])
    for g in foot:
        sp.click(f'#rsS tr[data-rs-g="{g}"]'); sp.wait_for_timeout(400)
        detail = sp.evaluate("[...document.querySelectorAll('#rsSA table')][1] ? [...[...document.querySelectorAll('#rsSA table')][1].querySelectorAll('tr')].slice(1).map(tr=>tr.children[5].textContent.trim()) : []")
        check(f'{g}: daily balance in the detail table = IE Tech footer', nums(detail) == foot[g], f'{nums(detail)[:8]} vs {foot[g][:8]}')
    check('Supervisor view is read-only (no form, no action buttons)', not sp.query_selector('#rsS [data-rs-save]') and not sp.query_selector('#rsS [data-rs-conf]'))
    print('--- Mai (Consolidator) records an action')
    m2 = IBM(br, 'Mai'); m2.open(at(2, 10, 0)); m2.load(); mp = m2.pg
    mp.click('#mainTabs [data-tab="resid"]'); mp.wait_for_timeout(1800); cm = summary(mp, '#rsC')
    check('Consolidator sees the same summary as the Supervisor', {g: cm[g][1:6] for g in cm} == {g: sm[g][1:6] for g in sm}, str({g: cm[g][1:4] for g in cm}))
    worst = max(cm, key=lambda g: gap_of(cm[g][3])); print('  largest gap in', worst, cm[worst][3])
    mp.click(f'#rsC tr[data-rs-g="{worst}"]'); mp.wait_for_timeout(300)
    mp.fill('#rsC [data-f="note"]', 'rent from vendor X'); mp.click('#rsC [data-rs-save]'); mp.wait_for_timeout(1200); cm = summary(mp, '#rsC')
    check('planned rent covers the gap: "incl. planned" says enough, "after confirmed" still short', 'Đủ máy' in cm[worst][6] and gap_of(cm[worst][5]) > 0, f'{cm[worst][5]} | {cm[worst][6]}')
    mp.click('#rsC [data-rs-conf]'); mp.wait_for_timeout(1000); cm = summary(mp, '#rsC')
    check('after "Chốt" the confirmed column is enough too', 'Đủ máy' in cm[worst][5], cm[worst][5])
    m2.push(); files = list((SHARE / 'data/prep/actions').glob('*.json')); check('actions are saved in data/prep/actions (one file per change)', len(files) == 2, str(len(files)))
    sup.pull(); sp.click('#rsS [data-rs-refresh]'); sp.wait_for_timeout(1500); sm2 = summary(sp)
    check('Supervisor refresh shows the confirmed action effect', 'Đủ máy' in sm2[worst][5], sm2[worst][5])
    check('Supervisor sees the action in the list', 'Thuê' in sp.inner_text('#rsSB') and 'rent from vendor X' in sp.inner_text('#rsSB'))
    mp.click('#rsC [data-rs-cancel]'); mp.wait_for_timeout(1000); cm = summary(mp, '#rsC')
    check('cancelling the action puts the gap back', gap_of(cm[worst][5]) > 0 and gap_of(cm[worst][6]) > 0, f'{cm[worst][5]} | {cm[worst][6]}')
    m2.push()
    print('--- What-if delay (Supervisor)')
    sup.pull(); sp.click('#rsS [data-rs-refresh]'); sp.wait_for_timeout(1200)
    lines = sp.evaluate("[...document.querySelectorAll('#rsS [data-wi=line] option')].map(o=>o.value)"); print('  lines:', lines)
    sp.select_option('#rsS [data-wi=line]', 'K'); sp.wait_for_timeout(300)
    styles = sp.evaluate("[...document.querySelectorAll('#rsS [data-wi=style] option')].map(o=>o.value)"); sp.select_option('#rsS [data-wi=style]', styles[1] if len(styles) > 1 else styles[0]); sp.wait_for_timeout(200)
    sp.fill('#rsS [data-wi=n]', '3'); sp.dispatch_event('#rsS [data-wi=n]', 'change'); sp.wait_for_timeout(300); sp.click('#rsS [data-rs-wigo]'); sp.wait_for_timeout(700)
    wi = sp.inner_text('#rsSC'); print('  what-if text:', ' '.join(wi.split())[-260:])
    check('what-if shows now → after for each group', wi.count('→') >= 3, str(wi.count('→')))
    expect = sp.evaluate("(()=>{const W=RS.wi,ends=latestEnds(TS.ends);return RS.cache.map(x=>{const S2=delayModel(x.G0,x.rows,ends,W.line,W.style,W.n);return S2?x.g+':'+x.s.n+'>'+shortSummary(S2.bal,S2.days).n:null}).filter(Boolean)})()")
    check('what-if numbers = the pure function', all(e.split(':')[0] in wi for e in expect) and '<b' in sp.inner_html('#rsSC'), str(expect))
    print('--- Activity log lists the actions')
    mp.click('#mainTabs [data-tab="activity"]'); mp.wait_for_timeout(1800); act = mp.inner_text('#actCard')
    check('Nhật ký shows "Hành động thiếu máy" entries (3 records)', act.count('Hành động thiếu máy') >= 3, str(act.count('Hành động thiếu máy')))
    errs = [mai.errs, hoa.errs, sup.errs, m2.errs]; check('no page errors', not any(errs), str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
