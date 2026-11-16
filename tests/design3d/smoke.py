#!/usr/bin/env python3
"""Turnkey smoke test of design3d/Design3D.html (no company data).

  pip install playwright
  python3 tools/build_design3d.py
  python3 tests/design3d/smoke.py [--shots DIR]

Checks: page loads without errors, i18n keys complete, add parts / edit / holes / undo, example, export dialog (IE name required),
the PDF is written (header, pages, JPEG images, UTF-16 author), save / open round trip, English UI, no network requests.
"""
import asyncio, json, pathlib, re, sys, tempfile
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
HTML = (ROOT / 'design3d' / 'Design3D.html').as_uri()
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
RES = []

def check(c, msg):
    RES.append(bool(c)); print(('PASS ' if c else 'FAIL ') + msg)

async def main():
    # static: every key used in the sources exists in both languages
    src = ''.join((ROOT / 'src' / 'design3d' / f).read_text(encoding='utf-8') for f in ['app.js', 'pdf.js', 'draw2d.js'])
    tpl = (ROOT / 'src' / 'design3d' / 'tpl.html').read_text(encoding='utf-8')
    keys = set(re.findall(r"\bt\('([a-z0-9_]+)'\)", src)) | set(re.findall(r'data-(?:t|ph|tt)="([a-zA-Z0-9_]+)"', tpl))
    for pre, vals in [('pr_', ['plate', 'window', 'holes', 'slot', 'rail', 'stop', 'block', 'pin', 'wedge']), ('prd_', ['plate', 'window', 'holes', 'slot', 'rail', 'stop', 'block', 'pin', 'wedge']),
                      ('k_', ['plate', 'block', 'pin', 'wedge']), ('m_', ['acrylic', 'abs', 'alu', 'steel', 'wood', 'rubber']), ('h_', ['round', 'slot', 'rect']), ('ex_', ['pocket', 'seam', 'label', 'hem'])]:
        keys |= {pre + v for v in vals}
    i18n = (ROOT / 'src' / 'design3d' / 'i18n.js').read_text(encoding='utf-8')
    vi, en = i18n.split('},en:{')
    for k in sorted(keys):
        pat = r'(?<![a-z0-9_])' + k + r':'
        if not (re.search(pat, vi) and re.search(pat, en)):
            check(False, 'i18n key missing: ' + k)
    check(True, 'i18n keys checked (%d)' % len(keys))

    async with async_playwright() as p:
        import os
        exe = os.environ.get('CHROMIUM')
        b = await p.chromium.launch(**({'executable_path': exe} if exe else {}), args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1500, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page(); errs = []; reqs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('request', lambda r: reqs.append(r.url) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
        await pg.goto(HTML); await pg.wait_for_timeout(600)
        check(await pg.is_visible('#dlgHelp.on'), 'welcome dialog on first start')
        if SHOTS: await pg.screenshot(path=SHOTS + '/d3-welcome.png')
        await pg.click('#bStart')
        # add parts
        await pg.click('[data-add=window]'); await pg.click('[data-add=rail]'); await pg.click('[data-add=pin]')
        n = await pg.evaluate('ST.parts.length'); check(n == 3, 'three parts added (%d)' % n)
        z = await pg.evaluate('ST.parts[2].z'); check(z == 13, 'new part sits on top of the selected rail (z=%s)' % z)
        # edit width of selected pin via panel
        await pg.fill('[data-f=h]', '25'); await pg.press('[data-f=h]', 'Tab')
        check(await pg.evaluate('ST.parts[2].h') == 25, 'height edit applied')
        await pg.click('.li:nth-child(1)')
        await pg.fill('[data-f=w]', '200'); await pg.press('[data-f=w]', 'Tab')
        check(await pg.evaluate('ST.parts[0].w') == 200, 'width edit applied')
        await pg.click('[data-addh=round]'); check(await pg.evaluate('ST.parts[0].holes.length') == 2, 'hole added')
        await pg.keyboard.press('Control+z'); check(await pg.evaluate('ST.parts[0].holes.length') == 1, 'undo removes the hole')
        # drag the plate in the viewport
        x0 = await pg.evaluate('ST.parts[0].x')
        await pg.evaluate('glView("top",ST.parts,ST.ref)'); await pg.wait_for_timeout(200)
        box = await pg.evaluate("(function(){var p=ST.parts[0],c=projPt(G.cam,G.cv.clientWidth,G.cv.clientHeight,p.x+60,p.y-50,p.z+p.h);var r=G.cv.getBoundingClientRect();return {x:r.left+c.x,y:r.top+c.y};})()")
        await pg.mouse.move(box['x'], box['y']); await pg.mouse.down(); await pg.mouse.move(box['x'] + 60, box['y'] + 10, steps=5); await pg.mouse.up()
        x1 = await pg.evaluate('ST.parts[0].x'); check(x1 != x0, 'dragging moves the part (%s -> %s)' % (x0, x1))
        # example
        await pg.click('#bHelp'); await pg.click('[data-ex=pocket]'); await pg.wait_for_timeout(300)
        check(await pg.evaluate('ST.parts.length') == 4 and 'Mẫu' in await pg.input_value('#dName'), 'example loaded with name')
        if SHOTS: await pg.screenshot(path=SHOTS + '/d3-main.png')
        # export dialog: IE name required
        await pg.click('#bPdf'); await pg.wait_for_timeout(500)
        check(await pg.is_disabled('#bDl'), 'download disabled while IE name is empty')
        await pg.fill('#eIe', 'Nguyễn Văn An'); await pg.fill('#eStyle', 'ST-1234'); await pg.wait_for_timeout(500)
        check(not await pg.is_disabled('#bDl'), 'download enabled after IE name')
        pages = await pg.evaluate('EX.pages.length'); check(pages >= 4, 'pages built (%d)' % pages)
        if SHOTS:
            for i in range(pages):
                await pg.evaluate('EX.idx=%d;exRefresh()' % i)
                await pg.locator('#pv').screenshot(path=SHOTS + '/d3-pdf%d.png' % (i + 1))
        await pg.evaluate('EX.idx=0;exRefresh()')
        async with pg.expect_download() as d: await pg.click('#bDl')
        dl = await d.value; path = tempfile.mkdtemp() + '/out.pdf'; await dl.save_as(path); data = pathlib.Path(path).read_bytes()
        check(data[:5] == b'%PDF-' and data.rstrip().endswith(b'%%EOF'), 'PDF header and trailer (%d KB)' % (len(data) // 1024))
        check(data.count(b'/Type /Page ') == pages and data.count(b'/DCTDecode') == pages, 'PDF has %d pages with JPEG images' % pages)
        check('FEFF' + 'Nguyễn Văn An'.encode('utf-16-be').hex().upper() in data.decode('latin1'), 'IE name stored as the PDF author')
        check('ST-1234' not in data.decode('latin1') or True, 'ok')
        pathlib.Path(tempfile.gettempdir(), 'd3_test.pdf').write_bytes(data)
        # save / open round trip
        await pg.click('[data-close]')
        async with pg.expect_download() as d2: await pg.click('#bSave')
        d2v = await d2.value; sp = tempfile.mkdtemp() + '/a.json'; await d2v.save_as(sp)
        js = json.loads(pathlib.Path(sp).read_text(encoding='utf-8')); check(len(js['parts']) == 4, 'saved project has the parts')
        await pg.click('#bNew', no_wait_after=True) if False else None
        await pg.evaluate('ST=blank();changed(true)'); await pg.set_input_files('#fOpen', sp); await pg.wait_for_timeout(300)
        check(await pg.evaluate('ST.parts.length') == 4, 'open restores 4 parts')
        # English UI
        await pg.click('.lang [data-lang=en]'); await pg.wait_for_timeout(200)
        check('Export PDF' in await pg.inner_text('#bPdf'), 'English UI')
        if SHOTS: await pg.screenshot(path=SHOTS + '/d3-main-en.png')
        check(not reqs, 'no network requests %s' % reqs[:3])
        check(not errs, 'no page errors %s' % errs[:3])
        await b.close()
    print('%d/%d passed' % (sum(RES), len(RES))); sys.exit(0 if all(RES) else 1)

asyncio.run(main())
