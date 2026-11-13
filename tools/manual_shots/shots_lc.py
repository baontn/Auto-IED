#!/usr/bin/env python3
"""Take the Layout Check manual screenshots from SYNTHETIC demo data.
Usage: python3 shots_lc.py DEMO_DIR OUT_DIR      (DEMO_DIR from make_demo_data.py; needs: pip install playwright)
"""
import sys, shutil, tempfile, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lc_common import *
from playwright.sync_api import sync_playwright

DEMO, OUT = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
ROOT = HERE.parent.parent
stage = pathlib.Path(tempfile.mkdtemp())
for f in ['LayoutCheck.html', 'xlsx.full.min.js']: shutil.copy(ROOT / 'layout-check' / f, stage / f)
serve(stage)
CHROME = dict(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])

def shot(pg, name, sel=None, hl=None, full=False, clip=None):
    """Screenshot (optionally of one element); `hl` = selectors to outline in red first."""
    for h in ([hl] if isinstance(hl, str) else (hl or [])):
        pg.locator(h).evaluate_all("els=>els.forEach(e=>{e.dataset.o=e.style.outline;e.style.outline='3px solid #ed1c24';e.style.outlineOffset='2px'})")
    pg.wait_for_timeout(250)
    path = str(OUT / f'{name}.png')
    if sel: pg.locator(sel).first.screenshot(path=path)
    else: pg.screenshot(path=path, full_page=full, clip=clip)
    for h in ([hl] if isinstance(hl, str) else (hl or [])):
        pg.locator(h).evaluate_all("els=>els.forEach(e=>{e.style.outline=e.dataset.o||'';})")
    print('shot', name)

def open_layout(pg, rel):
    put(pg, 'pick/' + pathlib.Path(rel).name, DEMO / 'lay' / rel); pg.evaluate("n=>window.__pick=n", pathlib.Path(rel).name)

with sync_playwright() as p:
    b = p.chromium.launch(**CHROME); pg = b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept('Demo note'))
    pg.add_init_script((HERE / 'opfs.js').read_text()); pg.goto('http://127.0.0.1:8799/LayoutCheck.html'); pg.wait_for_timeout(600); stub_idb(pg)
    put(pg, 'data/Linemapping.xlsx', DEMO / 'Linemapping.xlsx'); put(pg, 'pick/MC_report.xlsx', DEMO / 'MC_report.xlsx'); put(pg, 'pick/plan.xlsx', DEMO / 'TransformedMasterPlan.xlsx')
    put_tree(pg, DEMO / 'lay', 'lay')
    # 1. login screen with the three files chosen
    login(pg, 'Giam sat', 'Supervisor', 'PU1', first=True, snap=lambda: shot(pg, 'lc-01-login', sel='#login .modal, #login > div', hl=['#lgName', '[data-role]', '#lgPU', '#lgDirBtn', '#lgDbBtn', '#lgLayBtn', '#lgStart']))
    # 2. supervisor loads the plan
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(2500)
    shot(pg, 'lc-02-supervisor-status', hl='#btnPlan')
    pg.add_style_tag(content='#log{display:none!important}')
    # 3. IE officer: list, line filter, then a style whose layout matches the database by machine group
    login(pg, 'Lan', 'IE', 'PU1'); pg.wait_for_timeout(800)
    shot(pg, 'lc-03-ie-list', hl='#list')
    pg.click('#btnLines'); pg.wait_for_timeout(400); shot(pg, 'lc-04-lines'); pg.click('button:text-is("Xong")'); pg.wait_for_timeout(300)
    pg.click('#list >> text=DMO26-00102'); pg.wait_for_timeout(1000)
    shot(pg, 'lc-05-style-step2', full=True, hl='button:text-is("Mở")')
    pg.click('button:text-is("Mở")'); pg.wait_for_timeout(2500)
    shot(pg, 'lc-06-pass-by-group', full=True, hl='#dPass')
    pg.click('#dPass'); pg.wait_for_timeout(1500)
    # 4. another style with real differences -> Fail
    pg.click('#list >> text=DMO26-00105'); pg.wait_for_timeout(1000)
    pg.click('button:text-is("Mở")'); pg.wait_for_timeout(2500)
    shot(pg, 'lc-07-fail-differences', full=True, hl='#dFail')
    pg.fill('#comment', 'Layout shows 4OLB 3 and BT1M 3; please confirm with IE Tech'); pg.click('#dFail'); pg.wait_for_timeout(1500)
    shot(pg, 'lc-08-after-save')
    # 5. IE Bao cao may (consolidator) decides
    login(pg, 'Tuan', 'Consolidator', 'PU1'); pg.wait_for_timeout(800)
    pg.click('.tabs [data-tab="variation"]'); pg.wait_for_timeout(1200)
    shot(pg, 'lc-09-variation-card', full=True, hl=['[data-copy]', '[data-verify]', '[data-fixlayout]'])
    pg.evaluate("window.__prompt='Layout shows one extra 4OLB and BT1M; please correct the layout'"); pg.click('[data-fixlayout]'); pg.wait_for_timeout(1500)
    shot(pg, 'lc-10-sent-to-tech', full=True)
    # 6. IE Tech
    login(pg, 'Hoa', 'Tech', 'PU1'); pg.wait_for_timeout(1000)
    shot(pg, 'lc-11-tech-list', full=True)
    pg.click('#list >> text=DMO26-00105'); pg.wait_for_timeout(1200)
    shot(pg, 'lc-12-tech-style', full=True)
    # IE Tech corrects the layout file in the shared folder, then opens it and asks for the check
    put(pg, 'lay/PU1/DMO26-00105-1201.xlsx', DEMO / 'lay_fixed/PU1/DMO26-00105-1201.xlsx')
    put(pg, 'pick/DMO26-00105-1201.xlsx', DEMO / 'lay_fixed/PU1/DMO26-00105-1201.xlsx'); pg.evaluate("window.__pick='DMO26-00105-1201.xlsx'")
    pg.click('button:text-is("Bỏ")'); pg.wait_for_timeout(500)                       # remove the old file first
    pg.click('#btnOpenLayout'); pg.wait_for_timeout(2500)
    shot(pg, 'lc-13-tech-fixed', full=True, hl='#tFixed')
    pg.click('#tFixed'); pg.wait_for_timeout(1500)
    # IE officer re-checks
    login(pg, 'Lan', 'IE', 'PU1'); pg.wait_for_timeout(1000)
    shot(pg, 'lc-14-recheck-list')
    pg.click('#list >> text=DMO26-00105'); pg.wait_for_timeout(2500)
    shot(pg, 'lc-15-recheck-pass', full=True, hl='#dPass')
    pg.click('#dPass'); pg.wait_for_timeout(1500)
    # supervisor overview + activity log
    login(pg, 'Giam sat', 'Supervisor', 'PU1'); pg.wait_for_timeout(1000)
    pg.click('.tabs [data-tab="status"]'); pg.wait_for_timeout(1000); shot(pg, 'lc-16-status', full=True)
    pg.click('.tabs [data-tab="activity"]'); pg.wait_for_timeout(1000); shot(pg, 'lc-17-activity', full=True)
    pg.click('.tabs [data-tab="variation"]'); pg.wait_for_timeout(1000); shot(pg, 'lc-18-variation-closed', full=True)
    # 7. layout that only exists as a PDF -> manual entry card
    put(pg, 'pick/DMO26-00302-3201.pdf', DEMO / 'pdf/DMO26-00302-3201.pdf')
    login(pg, 'Lan', 'IE', 'PU3'); pg.wait_for_timeout(1000)
    pg.click('#list >> text=DMO26-00302'); pg.wait_for_timeout(1000)
    pg.evaluate("window.__pick='DMO26-00302-3201.pdf'"); pg.click('#btnOpenLayout'); pg.wait_for_timeout(2000)
    shot(pg, 'lc-19-pdf-card', full=True, hl=['#pdfCode', '#pdfQty'])
    pg.click('summary:has-text("Dán danh sách")'); pg.fill('#pdfPaste', '\n'.join(f'{c}  {q}' for c, q in [('1NLS', 9), ('1NLB', 4), ('4OLS', 3), ('4OLB', 2), ('1SLM', 3), ('BT1M', 4), ('ZZM', 2), ('FLM', 5), ('Total', 32)]))
    pg.click('[data-ppaste]'); pg.wait_for_timeout(800); pg.check('input[type=checkbox] >> nth=-1') if False else None
    shot(pg, 'lc-20-pdf-entered', full=True, hl='[data-ppaste]')
    # export the "data" folder written during this session: IE Bao cao may re-uses it for its own screenshots
    files = pg.evaluate("""async () => { const out=[]; async function walk(d, pre){ for await (const [n,h] of d.entries()){ if(h.kind==='directory') await walk(h, pre+n+'/');
        else { const b=new Uint8Array(await (await h.getFile()).arrayBuffer()); let s=''; for(let i=0;i<b.length;i+=8192) s+=String.fromCharCode.apply(null,b.subarray(i,i+8192)); out.push([pre+n, btoa(s)]); } } }
      await walk(await window.__dir('data'), ''); return out; }""")
    import base64 as _b64
    for rel, b64 in files:
        f = DEMO / 'lcdata' / rel; f.parent.mkdir(parents=True, exist_ok=True); f.write_bytes(_b64.b64decode(b64))
    print('exported', len(files), 'data files')
    print('ERR', errs); b.close()
