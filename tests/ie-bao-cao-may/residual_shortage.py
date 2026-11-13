#!/usr/bin/env python3
"""IE Bao cao may v7.9: "Thiếu máy còn lại" (Consolidator tab + read-only Supervisor role): horizontal tables, machine-group / PU selectors, "short days only" with
gap-inclusive span, red cells, actions with a live preview of the real change (rent and delay), summary card by machine group and PU, Excel export. Numbers must equal IE Tech's grid.
Usage: python3 tests/ie-bao-cao-may/residual_shortage.py [WORKDIR]"""
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
num = lambda c: int(c) if re.fullmatch(r'[+−-]?\d+', c.strip().replace('−', '-').replace('+', '')) else 0
def nums(cells): return [num(c) for c in cells]
def row(pg, root, group, r, id_=None):
    sel = f'{root} table[data-rs-block="{group}"] tr[data-rs-r="{r}"]' + (f'[data-id="{id_}"]' if id_ else '')
    return pg.evaluate("s=>{const tr=document.querySelector(s);return tr?[...tr.children].slice(3).map(c=>c.textContent.trim()):null}", sel)
def ncols(pg, root, group): return pg.evaluate("s=>{const t=document.querySelector(s);return t?t.rows[0].cells.length-3:0}", f'{root} table[data-rs-block="{group}"]')
def summary(pg, root):
    out = {}
    for tr in pg.query_selector_all(f'{root} tr[data-rs-g]'):
        c = [x.inner_text().strip() for x in tr.query_selector_all('td')]; out[c[0]] = c
    return out
def gap_of(cell): m = re.search(r'[−-](\d+)', cell); return int(m.group(1)) if m else 0
def style_of(pg, sel): return pg.evaluate("s=>{const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);return {bg:c.backgroundColor,fg:c.color}}", sel)
def is_light_red(bg): m = re.findall(r'\d+', bg or ''); return len(m) >= 3 and int(m[0]) > 200 and int(m[0]) > int(m[1]) + 15 and int(m[0]) > int(m[2]) + 15
def is_red(fg): m = re.findall(r'\d+', fg or ''); return len(m) >= 3 and int(m[0]) > 150 and int(m[1]) < 110 and int(m[2]) < 110
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
            if g == 'BT1M' and i == 2:
                hp.click(f'[data-qe="{k}"]'); hp.wait_for_timeout(500); cur = hp.input_value('#dDate'); hp.fill('#dDate', (dt.date.fromisoformat(cur) + dt.timedelta(days=3)).isoformat()); hp.dispatch_event('#dDate', 'change'); hp.click('#dKeep'); hp.wait_for_timeout(700); continue
            hp.click(f'[data-qr="{k}"]' if (g == 'ZZM' and i < 2) else f'[data-qk="{k}"]'); hp.wait_for_timeout(200)
        rows = hp.evaluate("[...document.querySelectorAll('#tGrid tr')].map(tr=>[...tr.children].map(c=>c.textContent.trim()))")
        foot[g] = nums([c for r in rows if r[:3].count('Còn lại') == 1 for c in r[3:]])
        print(f'  IE Tech footer {g}:', foot[g][:14])
    neg_tot = style_of(hp, '#tGrid tr.tot td.neg'); check('IE Tech grid: negative "Còn lại" cells are light red with red text now', neg_tot and is_light_red(neg_tot['bg']) and is_red(neg_tot['fg']), str(neg_tot))
    hp.click('#tComplete'); hp.wait_for_timeout(800); hoa.push()
    print('--- Supervisor (read-only), horizontal tables')
    sup = IBM(br, 'Giam sat'); sup.open(at(2, 11, 0)); sp = sup.pg; sp.click('#roleSeg [data-role="sup"]'); sp.click('#sConnect'); sp.wait_for_timeout(2000)
    sm = summary(sp, '#rsS')
    for g in foot:
        neg = [i for i, v in enumerate(foot[g]) if v < 0]; lo, hi = neg[0], neg[-1]
        check(f'{g}: default view "short days only" = first..last short day, gap days included ({hi - lo + 1} columns)', ncols(sp, '#rsS', g) == hi - lo + 1, f'{ncols(sp, "#rsS", g)}')
        check(f'{g}: "Còn lại" row = IE Tech footer for those days', nums(row(sp, '#rsS', g, 'bal')) == foot[g][lo:hi + 1], f'{nums(row(sp, "#rsS", g, "bal"))} vs {foot[g][lo:hi + 1]}')
        check(f'{g}: summary worst gap = IE Tech footer', gap_of(sm[g][3]) == -min(foot[g]), sm[g][3])
    zi = [i for i, v in enumerate(foot['ZZM']) if v < 0]; inner = [foot['ZZM'][i] for i in range(zi[0], zi[-1] + 1) if foot['ZZM'][i] >= 0]
    check('ZZM: a not-lacking day between two lacking periods is shown', len(inner) >= 1 and all(v >= 0 for v in inner), str(inner))
    c0 = style_of(sp, '#rsS table[data-rs-block="BT1M"] tr[data-rs-r="bal"] td.neg'); check('negative cells: light red background and red text', c0 and is_light_red(c0['bg']) and is_red(c0['fg']), str(c0))
    sp.click('#rsS [data-rs-view="all"]'); sp.wait_for_timeout(300)
    check('"Whole plan": all days, still equal to IE Tech', nums(row(sp, '#rsS', 'BT1M', 'bal')) == foot['BT1M'], f'{ncols(sp, "#rsS", "BT1M")} cols')
    sp.click('#rsS [data-rs-view="short"]'); sp.click('#rsS [data-rs-cg="BT1M"]'); sp.wait_for_timeout(300)
    check('machine group chips: choosing BT1M shows only the BT1M table', sp.query_selector('#rsS table[data-rs-block="BT1M"]') and not sp.query_selector('#rsS table[data-rs-block="ZZM"]'))
    sp.click('#rsS [data-rs-cg="ZZM"]'); sp.wait_for_timeout(300)
    check('a second click adds the group (both tables)', sp.query_selector('#rsS table[data-rs-block="ZZM"]') is not None)
    sp.click('#rsS [data-rs-cgall]'); sp.wait_for_timeout(200)
    pus = sp.evaluate("[...document.querySelectorAll('#rsS [data-rs-cpu]')].map(b=>b.dataset.rsCpu)"); print('  PUs:', pus)
    sp.click(f'#rsS [data-rs-cpu="{pus[0]}"]'); sp.wait_for_timeout(300)
    shown = sp.evaluate("[...document.querySelectorAll('#rsS table[data-rs-block=BT1M] tr[data-rs-pu]')].map(r=>r.dataset.rsPu)")
    check('PU chips: only the chosen PU rows are shown (totals stay for the group)', shown == [pus[0]] and row(sp, '#rsS', 'BT1M', 'bal') is not None, str(shown))
    sp.click('#rsS [data-rs-cpuall]')
    check('Supervisor view is read-only (no form, no action buttons)', not sp.query_selector('#rsS [data-rs-save]') and not sp.query_selector('#rsS [data-rs-conf]'))
    print('--- Mai records actions with a live preview')
    m2 = IBM(br, 'Mai'); m2.open(at(2, 10, 0)); m2.load(); mp = m2.pg
    mp.click('#mainTabs [data-tab="resid"]'); mp.wait_for_timeout(1800)
    bal0 = nums(row(mp, '#rsC', 'BT1M', 'bal')); mp.select_option('#rsC [data-f="group"]', 'BT1M'); mp.wait_for_timeout(200)
    mp.fill('#rsC [data-f="qty"]', '3'); mp.dispatch_event('#rsC [data-f="qty"]', 'input'); mp.wait_for_timeout(300)
    prev = mp.evaluate("(()=>{const t=document.querySelector('#rsC [data-rs-prev] table');if(!t)return null;return [...t.rows].map(r=>[...r.cells].slice(3).map(c=>c.textContent.trim()))})()")
    check('preview shows now / change / after for RENT 3', prev and len(prev) == 4 and nums(prev[2]).count(3) >= 1 and all(a + 0 for a in [1]), str(prev)[:160] if prev else 'none')
    check('preview "after" = now + change', prev and all(nums(prev[3])[i] == nums(prev[1])[i] + nums(prev[2])[i] for i in range(len(prev[1]))))
    mp.fill('#rsC [data-f="note"]', 'rent from vendor X'); mp.click('#rsC [data-rs-save]'); mp.wait_for_timeout(1200)
    act = row(mp, '#rsC', 'BT1M', 'act'); check('PLANNED rent shows as a row with +3 on its days', act and any(c == '+3' for c in act), str(act)[:120])
    cols0 = ncols(mp, '#rsC', 'BT1M'); balA = nums(row(mp, '#rsC', 'BT1M', 'balA')); balC = nums(row(mp, '#rsC', 'BT1M', 'balC'))
    bal_now = nums(row(mp, '#rsC', 'BT1M', 'bal'))
    check('confirmed row unchanged while the rent is only planned; "incl. planned" +3', balC == bal_now and any(balA[i] == bal_now[i] + 3 for i in range(len(bal_now))), f'{balC[:6]} {balA[:6]} {bal_now[:6]}')
    mp.click('#rsC tr[data-rs-r="act"] [data-rs-conf]'); mp.wait_for_timeout(1000)
    balC2 = nums(row(mp, '#rsC', 'BT1M', 'balC')); check('after confirming, the confirmed row equals the former planned row', balC2 == balA, f'{balC2[:6]} vs {balA[:6]}')
    print('--- a delay is a real action: preview effect == effect after confirming')
    mp.select_option('#rsC [data-f="type"]', 'DELAY'); mp.wait_for_timeout(300); mp.select_option('#rsC [data-f="line"]', 'K'); mp.wait_for_timeout(300)
    sty = mp.evaluate("[...document.querySelectorAll('#rsC [data-f=style] option')].map(o=>o.value)"); mp.select_option('#rsC [data-f="style"]', sty[1] if len(sty) > 1 else sty[0]); mp.fill('#rsC [data-f="n"]', '3'); mp.dispatch_event('#rsC [data-f="n"]', 'input'); mp.wait_for_timeout(400)
    pv = mp.evaluate("(()=>{const out={};document.querySelectorAll('#rsC [data-rs-prev] .small b').forEach(b=>{const t=b.closest('.small').nextElementSibling;if(t&&t.querySelector('table'))out[b.textContent]=[...t.querySelector('table').rows].map(r=>[...r.cells].slice(3).map(c=>c.textContent.trim()))});return out})()")
    print('  preview groups:', list(pv))
    check('delay preview lists the groups it changes', 'BT1M' in pv, str(list(pv)))
    delta = nums(pv['BT1M'][2]); after = nums(pv['BT1M'][3]); before = nums(pv['BT1M'][1])
    mp.select_option('#rsC [data-f="status"]', 'CONFIRMED'); mp.fill('#rsC [data-f="note"]', 'PPC delays K'); mp.click('#rsC [data-rs-save]'); mp.wait_for_timeout(1200)
    did = mp.evaluate("[...document.querySelectorAll('#rsC table[data-rs-block=BT1M] tr[data-rs-r=act]')].map(r=>r.dataset.id)")
    dl = [i for i in did if 'DELAY' in (mp.inner_text(f'#rsC tr[data-id="{i}"]') or '') or 'Dời' in (mp.inner_text(f'#rsC tr[data-id="{i}"]') or '')]
    eff = nums(row(mp, '#rsC', 'BT1M', 'act', dl[0])) if dl else []
    balC3 = nums(row(mp, '#rsC', 'BT1M', 'balC'))
    check('after confirming the delay: its row shows the same change as the preview', eff == delta, f'{eff[:8]} vs {delta[:8]}')
    check('confirmed balance = the preview "after"', balC3 == after, f'{balC3[:8]} vs {after[:8]}')
    print('--- summary card')
    card_wait = mp.inner_text('#rsCS')
    all_conf = not mp.query_selector('#rsC [data-rs-conf]')
    check('no PLANNED action left -> the card is generated', all_conf and 'Theo nhóm máy' in card_wait, card_wait[:80].replace('\n', ' '))
    rows_g = mp.evaluate("[...document.querySelectorAll('#rsCS table[data-rs-card=g] tr')].slice(1).map(r=>[...r.cells].map(c=>c.textContent.trim()))")
    print('  card by group:', rows_g)
    bt = [r for r in rows_g if r[0] == 'BT1M'][0]; zz = [r for r in rows_g if r[0] == 'ZZM'][0]
    check('BT1M row lists its confirmed actions (Thuê + Dời)', 'Thuê' in bt[2] and 'Dời' in bt[2], bt[2])
    check('ZZM has no action and is still short -> "IE kiểm tra thêm"', zz[2] == '—' and 'IE kiểm tra thêm' in zz[4], str(zz))
    rows_pu = mp.evaluate("[...document.querySelectorAll('#rsCS table[data-rs-card=pu] tr')].slice(1).map(r=>[...r.cells].map(c=>c.textContent.trim()))"); print('  card by PU:', rows_pu)
    check('card by PU exists with a conclusion for every PU', len(rows_pu) >= 3 and all(r[3] for r in rows_pu))
    with mp.expect_download(timeout=20000) as dl_: mp.click('#rsCS [data-rs-export]')
    x = S / 'actions.xlsx'; dl_.value.save_as(str(x)); wbx = openpyxl.load_workbook(x); check('Excel export has the ACTIONS sheet with both tables', 'ACTIONS' in wbx.sheetnames and any('IE kiểm tra thêm' in str(c.value) for r_ in wbx['ACTIONS'].iter_rows() for c in r_))
    m2.push(); files = list((SHARE / 'data/prep/actions').glob('*.json')); check('actions saved in data/prep/actions (one file per change)', len(files) == 3, str(len(files)))
    sup.pull(); sp.click('#rsS [data-rs-refresh]'); sp.wait_for_timeout(1500)
    check('Supervisor sees the confirmed actions and the same card', 'Thuê' in sp.inner_text('#rsSS') and 'IE kiểm tra thêm' in sp.inner_text('#rsSS'))
    check('Supervisor: confirmed row equals Mai\'s', nums(row(sp, '#rsS', 'BT1M', 'balC')) == balC3)
    print('--- cancel puts the gap back; activity log')
    mp.click('#rsC tr[data-rs-r="act"] [data-rs-cancel] >> nth=0'); mp.wait_for_timeout(1000)
    mp.click('#mainTabs [data-tab="activity"]'); mp.wait_for_timeout(1800); act_t = mp.inner_text('#actCard'); check('Nhật ký lists "Hành động thiếu máy" entries incl. the delay text', act_t.count('Hành động thiếu máy') >= 4 and 'Dời' in act_t, str(act_t.count('Hành động thiếu máy')))
    errs = [mai.errs, hoa.errs, sup.errs, m2.errs]; check('no page errors', not any(errs), str(errs)); br.close()
print('RESULT', 'ALL PASS' if all(ok) else f'{ok.count(False)} FAILED'); sys.exit(0 if all(ok) else 1)
