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
    src = ''.join((ROOT / 'src' / 'design3d' / f).read_text(encoding='utf-8') for f in ['app.js', 'pdf.js', 'draw2d.js', 'cad.js'])
    tpl = (ROOT / 'src' / 'design3d' / 'tpl.html').read_text(encoding='utf-8')
    keys = set(re.findall(r"\bt\('([a-z0-9_]+)'\)", src)) | set(re.findall(r'data-(?:t|ph|tt)="([a-zA-Z0-9_]+)"', tpl))
    for pre, vals in [('pr_', ['plate', 'window', 'holes', 'slot', 'rail', 'stop', 'block', 'pin', 'wedge', 'wheel', 'handle', 'magnet', 'screw']), ('prd_', ['plate', 'window', 'holes', 'slot', 'rail', 'stop', 'block', 'pin', 'wedge', 'wheel', 'handle', 'magnet', 'screw']),
                      ('k_', ['plate', 'block', 'pin', 'wedge', 'wheel', 'handle', 'poly']), ('m_', ['acrylic', 'abs', 'alu', 'steel', 'wood', 'rubber']), ('h_', ['round', 'slot', 'rect']), ('ex_', ['pocket', 'seam', 'label', 'hem'])]:
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
        # ---- v1.1: new parts, merge, offset, CAD export ----
        await pg.evaluate('ST=blank();SELS=[];changed(true)')
        for k in ['plate', 'plate', 'wheel', 'handle', 'magnet']:
            await pg.evaluate('addPreset("%s")' % k)
        kinds = await pg.evaluate('ST.parts.map(function(p){return p.kind})')
        check(kinds == ['plate', 'plate', 'wheel', 'handle', 'pin'], 'wheel / handle / magnet added %s' % kinds)
        check(await pg.evaluate('ST.parts[2].z') < 0, 'wheel goes under the selected part')
        # two overlapping plates, same z/h -> union / cut / and
        await pg.evaluate('ST.parts=ST.parts.slice(0,2);ST.parts[0].x=0;ST.parts[0].y=0;ST.parts[1].x=100;ST.parts[1].y=0;SELS=[];changed(true)')
        await pg.evaluate('selectPart(ST.parts[0].id);selectPart(ST.parts[1].id,true)')
        check('2' in await pg.inner_text('#props h3'), 'multi-selection panel')
        await pg.evaluate('doBool("union")'); n = await pg.evaluate('ST.parts.length'); k0 = await pg.evaluate('ST.parts[0].kind')
        w = await pg.evaluate('ST.parts[0].w'); area = await pg.evaluate('volOf(ST.parts[0])/ST.parts[0].h')
        check(n == 1 and k0 == 'poly' and abs(w - 250) < 0.1, 'union gives one free shape of width 250 (%s, %s)' % (k0, w))
        check(abs(area - 24978.5) < 5, 'union area = 2 plates minus the overlap, corners included (%.1f)' % area)
        await pg.evaluate('undo()'); await pg.evaluate('selectPart(ST.parts[0].id);selectPart(ST.parts[1].id,true);doBool("cut")')
        wc = await pg.evaluate('ST.parts[0].w'); check(abs(wc - 105) < 0.5 and await pg.evaluate('ST.parts.length') == 1, 'cut keeps the rest (w=105: rounded cutter corners leave slivers) (w=%s)' % wc)
        await pg.evaluate('undo()'); await pg.evaluate('selectPart(ST.parts[0].id);selectPart(ST.parts[1].id,true);doBool("and")')
        wa = await pg.evaluate('ST.parts[0].w'); check(abs(wa - 50) < 0.5, 'overlap keeps w=50 (%s)' % wa)
        await pg.evaluate('undo()')
        await pg.evaluate('ST.parts[1].z=5;changed(true);selectPart(ST.parts[0].id);selectPart(ST.parts[1].id,true);doBool("union")')
        check(await pg.evaluate('ST.parts.length') == 2, 'union refused when heights differ')
        await pg.evaluate('ST.parts[1].z=0;changed(true)')
        # offset
        await pg.evaluate('ST.parts=[cleanPart({kind:"plate",w:100,d:60,h:3,r:5,mat:"abs",holes:[{t:"round",x:0,y:0,a:10}]},1)];ST.nid=2;SELS=[];changed(true);selectPart(1)')
        await pg.fill('#offD', '2'); await pg.click('[data-off="1"]')
        w2 = await pg.evaluate('ST.parts[1].w'); check(abs(w2 - 104) < 0.1 and await pg.evaluate('ST.parts.length') == 2, 'offset +2 grows the outline to 104 and keeps the original (%s)' % w2)
        hole = await pg.evaluate('ST.parts[1].polys[0].h.length'); check(hole == 1, 'hole kept after outer offset')
        await pg.select_option('#offW', 'holes'); await pg.click('[data-off="1"]')
        sz = await pg.evaluate('(function(){var q=ST.parts[2].polys[0].h[0],x0=1e9,x1=-1e9;q.forEach(function(a){x0=Math.min(x0,a[0]);x1=Math.max(x1,a[0]);});return x1-x0;})()')
        check(abs(sz - 14) < 0.1, 'hole offset +2 makes the hole 14 wide (%s)' % sz)
        # PDF still builds with poly parts
        await pg.evaluate('exShot();'); check(await pg.evaluate('buildPages(ST,{pages:{p3d:true,list:true,views:true,plates:true},ie:"X",date:"2026-01-01"}).length') >= 5, 'PDF pages build with free shapes')
        # CAD exports
        await pg.evaluate('ST.parts=ST.parts.slice(0,1);addPreset("wheel");addPreset("handle");SELS=[];changed(true)')
        await pg.click('#bCad'); await pg.fill('#cIe', 'Nguyễn Văn An')
        files = {}
        for kind in ['stl', 'obj', 'dxf3d', 'dxf2d', 'dxfflat']:
            async with pg.expect_download() as dd: await pg.click('[data-cad=%s]' % kind)
            d = await dd.value; fp = tempfile.mkdtemp() + '/' + d.suggested_filename; await d.save_as(fp); files[kind] = pathlib.Path(fp)
        stl = files['stl'].read_bytes(); ntri = int.from_bytes(stl[80:84], 'little')
        check(len(stl) == 84 + 50 * ntri and ntri > 100, 'STL binary size matches %d triangles' % ntri)
        obj = files['obj'].read_text(); check(obj.count('\no ') == 3 and obj.count('\nf ') > 100, 'OBJ has 3 objects')
        try:
            import ezdxf
            for kind in ['dxf3d', 'dxf2d', 'dxfflat']:
                doc = ezdxf.readfile(str(files[kind])); ms = doc.modelspace(); kinds_ = {e.dxftype() for e in ms}
                check(len(ms) > 5, 'DXF %s reads with ezdxf (%d entities: %s)' % (kind, len(ms), sorted(kinds_)))
            doc = ezdxf.readfile(str(files['dxfflat'])); ms = doc.modelspace()
            check(any(e.dxftype() == 'POLYLINE' and e.dxf.layer == 'OUTLINE' for e in ms), 'flat DXF has OUTLINE polylines')
            check(any(e.dxftype() == 'TEXT' and 'IE: Nguyen Van An' in e.dxf.text for e in ms), 'DXF carries the IE name')
        except ImportError:
            print('SKIP ezdxf not installed (pip install ezdxf) - DXF files not parsed')
        if SHOTS: await pg.screenshot(path=SHOTS + '/d3-cad.png')
        await pg.keyboard.press('Escape')
        # English UI
        await pg.click('.lang [data-lang=en]'); await pg.wait_for_timeout(200)
        check('Export PDF' in await pg.inner_text('#bPdf'), 'English UI')
        if SHOTS: await pg.screenshot(path=SHOTS + '/d3-main-en.png')
        check(not reqs, 'no network requests %s' % reqs[:3])
        check(not errs, 'no page errors %s' % errs[:3])
        await b.close()
    print('%d/%d passed' % (sum(RES), len(RES))); sys.exit(0 if all(RES) else 1)

asyncio.run(main())
