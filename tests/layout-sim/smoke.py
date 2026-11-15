#!/usr/bin/env python3
"""Turnkey smoke test of layout-sim/LayoutSim.html with SYNTHETIC data (no company files needed).

  pip install playwright openpyxl
  python3 tools/build_layout_sim.py
  python3 tests/layout-sim/smoke.py [--shots DIR]

Builds a small fake machine library (sheet Machine_Needle + machine list), pastes a 2-row layout,
then checks: picture paste (OCR, offline), placement, drag + snap, overlap / operator-zone checks, undo/redo, rotate, block rotate,
save/open round trip, PNG + Excel export, English UI, i18n key completeness, 3D view, no page errors.
--shots DIR also saves screenshots (used for the manual: manual/img/ls-*.png).
"""
import asyncio, json, os, pathlib, sys, tempfile, zipfile
from openpyxl import Workbook
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
HTML = (ROOT / 'layout-sim' / 'LayoutSim.html').as_uri()
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
# synthetic library: code, english name, vietnamese name, size
CODES = [('1SLA', 'single needle lockstitch', 'Máy 1 kim', '110*55'), ('3OLM', 'three thread overlock', 'Máy vắt sổ 3 chỉ', '105*55'),
         ('4OLB', 'four thread overlock with backlatch', 'Máy vắt sổ 4 chỉ giấu đầu', '110*55'), ('2CSM', 'twin needle flat bed coverstitch', 'Máy trần đè 2 kim', '120*55'),
         ('4CSM', 'four needle flat bed coverstitch', 'Máy trần đè 4 kim', '120*55'), ('2CCH', 'twin needle cylinder bed', 'Máy trần đè 2 kim cùi trỏ', '110*58'),
         ('BT1M', 'bartack', 'Máy đính bọ', '110*55'), ('MNHD', 'manual', 'Thủ công', '110*55'), ('CHPM', 'heat press', 'Máy ép nhiệt', '170*90'),
         ('SFAM', 'bonding', 'Máy tra keo', '110*55'), ('1510', 'pattern sewer', 'Máy lập trình', '120*75')]
MODELS = [('SLM-Single needle lockstitch machine', 'BRANDA', 'L-100', 12), ('4 Threads Overlocking machine', 'BRANDB', 'O-200', 9),
          ('Flat bed cover stitch machine', 'BRANDB', 'F-300', 7), ('Bartacking machine', 'BRANDA', 'B-400', 3), ('Racing tape feeder', 'BRANDC', 'T-1', 5),
          ('Trolley', 'X', 'T', 2), ('Mystery machine', 'Y', 'Q-1', 1)]
PASTE = ("\t31\t32\t33\t34\t36\t36\t37\t37\t38\t39\t40\t41\t97\n\t3OLM\t1SLA\t2CSM\t4CSM\t3OLM\t3OLM\t2CSM\t2CSM\t4OLB\t3OLM\t2CSM\t4OLB\tBT1M\n\n"
         "MNHD\t1SLA\t1SLA\t1SLA\t4CSM\t3OLM\t3OLM\t2CSM\t2CSM\t3OLM\t2CSM\t2CSM\t4OLB\tBT1M\n35\t32\t32\t32\t34\t36\t36\t37\t37\t39\t40\t40\t41\t97\n")
RES = []
NET = []

def check(c, msg):
    RES.append(bool(c)); print(('PASS ' if c else 'FAIL ') + msg)

def make_lib(path):
    wb = Workbook(); ws = wb.active; ws.title = 'Machine_Needle'
    ws.append(['Machine_Code', 'Machine_Name', 'Machine_Name_VN', 'Dimension'])
    for c in CODES: ws.append(list(c))
    s = wb.create_sheet('Sheet1'); s.append([]); s.append([]); s.append(['Sewing Name', 'Sewing  brand', 'Sewingmodel'])
    for n, b, m, q in MODELS:
        for _ in range(q): s.append([n, b, m])
    wb.save(path)

def make_layout_xlsx(path):
    """a minimal .xlsx whose sheet holds a layout drawn with shapes (as the IE layouts are), synthetic data"""
    E = 9525
    def sp(i, txt, x, y, w=86, h=50):
        return ('<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
                '<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="%d" name="R%d"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="%d" y="%d"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
                '<xdr:txBody><a:bodyPr/><a:p><a:r><a:t>%s</a:t></a:r></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>') % (i, i, x * E, y * E, w * E, h * E, txt)
    shapes, i = [], 2
    def add(t, x, y, w=86, h=50):
        nonlocal i; shapes.append(sp(i, t, x, y, w, h)); i += 1
    # branch rows: numbers above codes, then codes above numbers
    for k, (c, o) in enumerate([('SFAM', '41'), ('SFAM', '43'), ('2CSM', '45'), ('1SLA', '47')]): add(o, 100 + k * 86, 1000); add(c, 100 + k * 86, 1050)
    for k, (c, o) in enumerate([('3OLM', '52'), ('3OLM', '53'), ('4OLB', '55')]): add(c, 100 + k * 86, 1100); add(o, 100 + k * 86, 1150)
    # main rows (after a title row gap)
    for k, (c, o) in enumerate([('1SLA', '31'), ('2CSM', '33'), ('3OLM', '66'), ('1SLA', '67'), ('BT1M', '97')]): add(o, 100 + k * 86, 1300); add(c, 100 + k * 86, 1350)
    for k, (c, o) in enumerate([('4CSM', '35'), ('2CSM', '68'), ('CHPM', '70')]): add(c, 100 + k * 86, 1400, 86 if c != 'CHPM' else 130); add(o, 100 + k * 86, 1450, 86 if c != 'CHPM' else 130)
    add('SMNT', 600, 1290, 44, 23)
    # operation sequence boxes
    add('Cụm thân', 0, 600, 110, 36); add('31=>33=>35', 120, 600, 300, 36)
    add('Cụm bát', 0, 650, 110, 36); add('41=>43=>45=>47', 120, 650, 300, 36)
    add('Cụm cánh', 0, 700, 110, 36); add('52=>53=>55', 120, 700, 300, 36)
    add('Cụm lắp ráp', 500, 560, 150, 36); add('66=>67=>68=>70=>97=>QC=>PACKING', 500, 620, 500, 36)
    ns = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    files = {
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
        '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Layout 48" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><drawing r:id="rId1"/></worksheet>',
        'xl/worksheets/_rels/sheet1.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
        'xl/drawings/drawing1.xml': '<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr %s>%s</xdr:wsDr>' % (ns, ''.join(shapes)),
    }
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for k, v in files.items(): z.writestr(k, v)

async def launch(p):
    args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    try: return await p.chromium.launch(args=args)
    except Exception:
        exe = next((str(x) for x in pathlib.Path('/opt/pw-browsers').glob('chromium-*/chrome-linux64/chrome')), None)
        return await p.chromium.launch(executable_path=exe, args=args)

async def main():
    tmp = tempfile.mkdtemp(); lib = os.path.join(tmp, 'library.xlsx'); make_lib(lib)
    async with async_playwright() as p:
        b = await launch(p)
        ctx = await b.new_context(viewport={'width': 1500, 'height': 860}, accept_downloads=True, device_scale_factor=1)
        async def route(r):
            NET.append(r.request.url)
            if r.request.url.startswith(('file:', 'blob:', 'data:')): await r.continue_()
            else: await r.abort()
        await ctx.route('**/*', route)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
        await pg.goto(HTML); await pg.wait_for_timeout(300)
        check(await pg.evaluate("()=>document.getElementById('dlgLine').open"), 'line set-up dialog on first start')
        await pg.fill('#lsName', 'Line D3'); await pg.fill('#lsUnits', '17'); await pg.dispatch_event('#lsUnits', 'input'); await pg.click('#lsOk')
        check(await pg.evaluate('()=>{const c=centerTable();return [c.L,c.W,ST.line.length]}') == [1819, 30, 1969], 'central table 17 x 107 cm, width 30; line 120+1819+30')
        check(await pg.is_visible('#libBanner'), 'banner without library')
        await pg.set_input_files('#fileLib', lib); await pg.wait_for_timeout(800)
        check(await pg.evaluate('()=>[Object.keys(LIB.codes).length, LIB.models.length]') == [len(CODES), len(MODELS)], 'library read')
        sug = await pg.evaluate("()=>Object.fromEntries(LIB.models.map(m=>[m.model,m.code]))")
        check(sug['L-100'] == '1SLM' and sug['O-200'] == '4OLM' and sug['F-300'] == '2CSM' and sug['B-400'] == 'BT1M' and sug['T-1'] == '#ATTACH' and sug['T'] == '#NOLINE' and sug['Q-1'] == '', 'model -> code suggestions ' + json.dumps(sug))
        r = await pg.evaluate("""()=>{const v=Object.keys(I18N.vi),e=Object.keys(I18N.en);
          const used=[...document.querySelectorAll('[data-t],[data-tt],[data-tp]')].map(x=>x.dataset.t||x.dataset.tt||x.dataset.tp);
          FAMS.forEach(f=>used.push('fam_'+f)); ERG_KEYS.forEach(k=>{used.push('erg_'+k);used.push('ergh_'+k)});
          ['isUnknown','isOut','isOverlap','isSeat','isSeat2','isAisle','isWalk'].forEach(k=>used.push(k));
          return [v.filter(k=>!e.includes(k)), e.filter(k=>!v.includes(k)), used.filter(k=>!v.includes(k))]}""")
        check(r == [[], [], []], 'i18n complete ' + json.dumps(r))
        await pg.click('#bPaste'); await pg.fill('#pasteTxt', PASTE); await pg.dispatch_event('#pasteTxt', 'input')
        if SHOTS: await pg.locator('#dlgPaste').screenshot(path=SHOTS + '/ls-paste.png')
        await pg.check('#pasteFit'); await pg.click('#pasteGo'); await pg.wait_for_timeout(300)
        check(await pg.evaluate("()=>[ST.items.filter(i=>i.kind=='mc').length, ST.items.filter(i=>i.kind=='obj').length, ISSUES.length]") == [27, 2, 0], 'paste: 27 machines + input + central table, no issue')
        check(await pg.evaluate("()=>{const c=centerTable();const t=ST.items.filter(i=>i.kind=='mc'&&i.rot==180);return t.every(i=>Math.abs(i.y+dimOf(i.code).W/2-(c.y-c.W/2))<0.2)}"), 'first row backs against the central table')
        check((await pg.evaluate("()=>ST.items.filter(i=>i.rot==180).map(i=>i.code+':'+i.op).join(' ')")).startswith('3OLM:31 1SLA:32 2CSM:33'), 'numbers above the row -> operator above')
        await pg.evaluate("()=>{SEL=[];fitView()}")
        if SHOTS:
            await pg.evaluate("()=>{SEL=[ST.items[3].id];onSelChange();render2d()}"); await pg.screenshot(path=SHOTS + '/ls-2d.png')
            await pg.evaluate("()=>{SEL=[];onSelChange();render2d()}")
        id5, x0 = await pg.evaluate('()=>[ST.items[5].id, ST.items[5].x]')
        bb = await pg.locator('[data-id="%s"] rect' % id5).last.bounding_box(); cx, cy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
        await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + 60, cy + 300, steps=10); await pg.mouse.up(); await pg.wait_for_timeout(150)
        x1, y1 = await pg.evaluate('()=>[ST.items[5].x, ST.items[5].y]')
        check(x1 != x0 and x1 % 5 == 0 and y1 % 5 == 0, 'drag moves and snaps to 5 cm')
        await pg.evaluate('()=>{const a=ST.items[5],b=ST.items[6];a.x=b.x+20;a.y=b.y;a.rot=b.rot;changed();}')
        check('isOverlap' in await pg.evaluate('()=>ISSUES.map(x=>x.k)'), 'overlap flagged')
        if SHOTS:
            await pg.evaluate("()=>{SEL=[ST.items[5].id];onSelChange();const it=ST.items[5];V.s=1.1;const s=svgEl();V.x=it.x-s.clientWidth/V.s/2;V.y=it.y-s.clientHeight/V.s/2;render2d()}")
            await pg.screenshot(path=SHOTS + '/ls-check.png')
        await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+z')
        check(await pg.evaluate('()=>ISSUES.length') == 0 and await pg.evaluate('()=>ST.items[5].x') == x0, 'undo x2')
        await pg.keyboard.press('Control+y'); check(await pg.evaluate('()=>ST.items[5].x') == x1, 'redo'); await pg.keyboard.press('Control+z')
        # operator on/off per machine: operator mode, click machines (two machines with the same operation can differ)
        await pg.click('#bOpMode')
        ids = await pg.evaluate("()=>ST.items.filter(i=>i.kind=='mc'&&i.op=='36').map(i=>i.id)")
        for i in ids[:1]:
            bb = await pg.locator('[data-id="%s"] rect' % i).last.bounding_box(); await pg.mouse.click(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        check(await pg.evaluate("(ids)=>ids.map(i=>!!itemById(i).noOp)", ids) == [True] + [False] * (len(ids) - 1) and '26' in await pg.inner_text('#sumBody'), 'operator mode: one click removes the operator of that machine only (26 operators)')
        bb = await pg.locator('[data-id="%s"] rect' % ids[0]).last.bounding_box(); await pg.mouse.click(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        check(not await pg.evaluate("(i)=>!!itemById(i).noOp", ids[0]), 'second click gives it back')
        await pg.keyboard.press('Escape'); check(not await pg.evaluate('()=>OPMODE'), 'Esc leaves operator mode')
        # one operator for several machines: Shift+click two machines far apart, press W -> double arrow with distance; again -> split
        await pg.evaluate('()=>{SEL=[];onSelChange();fitView()}')
        a, b2 = await pg.evaluate("()=>{const m=ST.items.filter(i=>i.kind=='mc');return [m.find(i=>i.op=='31').id, m.find(i=>i.op=='97'&&i.rot==0).id]}")
        for k2, i in enumerate([a, b2]):
            bb = await pg.locator('[data-id="%s"] rect' % i).last.bounding_box()
            if k2: await pg.keyboard.down('Shift')
            await pg.mouse.click(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
            if k2: await pg.keyboard.up('Shift')
        await pg.keyboard.press('w')
        r = await pg.evaluate("([a,b])=>{const l=opLinks();return [!itemById(a).noOp, itemById(b).noOp, itemById(b).by===a, l.length, l[0]&&l[0].far, Math.round(l[0]?l[0].dist:0)]}", [a, b2])
        check(r[:5] == [True, True, True, 1, True] and r[5] > 1000, 'one operator for 2 far machines, linked with a double arrow (%d cm)' % r[5])
        check('26' in await pg.inner_text('#sumBody'), 'summary counts 26 operators')
        if SHOTS: await pg.screenshot(path=SHOTS + '/ls-share.png')
        await pg.keyboard.press('w'); check(await pg.evaluate("([a,b])=>!itemById(a).noOp&&!itemById(b).noOp&&!opLinks().length", [a, b2]), 'W again splits them')
        n1_, n2_ = await pg.evaluate("()=>{const m=ST.items.filter(i=>i.kind=='mc'&&i.op=='36'&&i.rot==0);return [m[0].id,m[1].id]}")
        await pg.evaluate("([a,b])=>{SEL=[a,b];toggleOperator()}", [n1_, n2_])
        check(await pg.evaluate("()=>{const l=opLinks();return l.length==1&&!l[0].far}"), 'two neighbouring machines: one operator, short link')
        await pg.evaluate("([a,b])=>{SEL=[a,b];toggleOperator();SEL=[];onSelChange()}", [n1_, n2_])
        # standing: default for heat press / ironing, switch all, per machine with S
        check(await pg.evaluate("()=>isStanding({kind:'mc',code:'CHPM'}) && !isStanding({kind:'mc',code:'1SLA'})"), 'heat press stands, lockstitch sits by default')
        await pg.click('#bStandAll'); check(await pg.evaluate("()=>ST.items.filter(i=>i.kind=='mc').every(isStanding)"), 'button: all operations standing')
        z = await pg.evaluate("()=>{const s=shapes(ST.items.find(i=>i.kind=='mc'));return [Math.round(s.zone.hy*2), Math.round(s.zone.hx*2)]}")
        check(z == [80, 90], 'standing area 80 x 90 cm %s' % z)
        await pg.click('#bStandAll'); check(await pg.evaluate("()=>!ST.items.filter(i=>i.kind=='mc').some(isStanding)"), 'button again: all sitting')
        await pg.click('#bStandDef')
        await pg.click('#bSide'); check(not await pg.is_visible('aside'), 'side panel can be hidden'); await pg.click('#bSide')
        check(await pg.evaluate("()=>isLocked(centerTable())"), 'central table locked by default')
        check(await pg.evaluate("()=>modelsOfCode('1SLM').length>0 && modelsOfCode('1SLA').some(m=>m.isAlt)"), 'real models also listed for codes they can be set up as (1SLA)')
        mid = await pg.evaluate("()=>ST.items.find(i=>i.kind=='mc'&&i.op=='33').id")
        bb = await pg.locator('[data-id="%s"] rect' % mid).last.bounding_box(); await pg.mouse.click(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        check(await pg.is_visible('#selTools'), 'click on a machine shows the turn buttons')
        r0 = await pg.evaluate('(id)=>itemById(id).rot', mid); await pg.click('#selTools [data-cmd="rotR"]')
        check((await pg.evaluate('(id)=>itemById(id).rot', mid) - r0) % 360 == 90, 'turn button rotates 90')
        await pg.click('#selTools [data-cmd="op"]'); check(await pg.evaluate('(id)=>!!itemById(id).noOp', mid), 'operator button removes the operator')
        await pg.keyboard.press('w'); await pg.keyboard.press('Shift+R'); check(await pg.evaluate('(id)=>[!!itemById(id).noOp,itemById(id).rot]', mid) == [False, r0], 'W and Shift+R undo it')
        await pg.evaluate('()=>{SEL=[ST.items[3].id]}'); await pg.keyboard.press('r')
        check(await pg.evaluate('()=>ST.items[3].rot') == 270 and await pg.evaluate("()=>ISSUES.some(x=>x.sev=='bad')"), 'R rotates 90, conflict flagged')
        await pg.keyboard.press('f'); check(await pg.evaluate('()=>ST.items[3].rot') == 90, 'F turns 180')
        await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+z')
        await pg.evaluate("()=>{SEL=ST.items.filter(i=>i.kind=='mc'&&i.rot==0).map(i=>i.id);rotateGroup(180)}")
        check(await pg.evaluate("()=>ST.items.filter(i=>i.kind=='mc'&&i.rot==180).length") == 27, 'block rotate 180'); await pg.keyboard.press('Control+z')
        fp = os.path.join(tmp, 'Line_D3.layout.json'); open(fp, 'w').write(await pg.evaluate('()=>fileJson()'))
        await pg.evaluate('()=>{ST.items=[];ST.line.name="";changed()}')
        await pg.set_input_files('#fileOpen', fp); await pg.wait_for_timeout(300)
        check(await pg.evaluate('()=>ST.items.length') == 29 and await pg.input_value('#lnName') == 'Line D3', 'save/open round trip')
        async with pg.expect_download() as dl: await pg.click('#bPng')
        d = await dl.value; pth = os.path.join(tmp, 'x.png'); await d.save_as(pth); check(os.path.getsize(pth) > 20000, 'PNG export')
        await pg.click('[data-tab="lib"]')
        if SHOTS: await pg.screenshot(path=SHOTS + '/ls-lib.png')
        async with pg.expect_download() as dl: await pg.click('#bMapExp')
        d = await dl.value; pth = os.path.join(tmp, 'map.xlsx'); await d.save_as(pth); check(os.path.getsize(pth) > 4000, 'mapping Excel export')
        await pg.click('[data-tab="3d"]'); await pg.wait_for_timeout(1500)
        check(await pg.evaluate('()=>V3.ok && V3.root.children.length>20'), '3D scene built')
        mid3 = await pg.evaluate("()=>ST.items.find(i=>i.kind=='mc'&&i.op=='33').id"); x30 = await pg.evaluate('(i)=>itemById(i).x', mid3)
        await pg.evaluate("()=>{const it=ST.items.find(i=>i.kind=='mc'&&i.op=='33');V3.tgt.set(it.x,60,it.y);V3.rad=600;V3.theta=0;V3.phi=0.6;draw3d()}")
        sp3 = await pg.evaluate("(i)=>{const it=itemById(i);const s=screenOf3d(it.x,80,it.y);return [s.x+s.r.left,s.y+s.r.top]}", mid3)
        await pg.mouse.move(sp3[0], sp3[1]); await pg.mouse.down(); await pg.mouse.move(sp3[0] + 40, sp3[1], steps=5); await pg.mouse.move(sp3[0] + 90, sp3[1], steps=5); await pg.mouse.up(); await pg.wait_for_timeout(200)
        check(await pg.evaluate('(i)=>itemById(i).x', mid3) != x30 and await pg.is_visible('#selTools'), 'drag a machine in 3D, turn buttons shown')
        await pg.keyboard.press('Control+z')
        if SHOTS:
            await pg.evaluate("()=>{SEL=[];rebuild3d();V3.tgt.set(ST.items[4].x,60,ST.items[4].y);V3.rad=900;V3.theta=-0.6;V3.phi=0.95;draw3d()}")
            await pg.wait_for_timeout(300); await pg.screenshot(path=SHOTS + '/ls-3d.png')
        # picture paste (OCR, offline): draw a boxed layout like the Excel shapes, with a grey cell, then read it back
        await pg.click('[data-tab="plan"]'); await pg.evaluate('()=>openPaste()')
        ok = await pg.evaluate("""async()=>{const top=[['31','3OLM'],['32','1SLA'],['33','2CSM'],['34','4CSM'],['36','3OLM'],['38','4OLB'],['97','BT1M']],
          bot=[['35','MNHD'],['32','1SLA'],['34','4CSM'],['36','3OLM'],['37','2CSM'],['41','4OLB'],['97','BT1M']];
          const cw=70,ch=40,c=document.createElement('canvas');c.width=40+8*cw;c.height=6*ch;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
          x.font='bold 17px Times New Roman, serif';x.textAlign='center';x.textBaseline='middle';x.strokeStyle='#000';
          function cell(i,j,t,g){const X=20+i*cw,Y=10+j*ch;if(g){x.fillStyle='#d0d0d0';x.fillRect(X,Y,cw,ch);}x.strokeRect(X,Y,cw,ch);x.fillStyle='#000';x.fillText(t,X+cw/2,Y+ch/2);}
          top.forEach((v,i)=>{cell(i+1,0,v[0]);cell(i+1,1,v[1],i==3);}); bot.forEach((v,i)=>{cell(i,3,v[1],i==2);cell(i,4,v[0]);});
          const blob=await new Promise(r=>c.toBlob(r,'image/png'));const g=await ocrImage(blob);
          const want=top.map(v=>v[1]+':'+v[0]).concat(bot.map(v=>v[1]+':'+v[0])).sort().join(' ');
          pastePreview(); const got=[];PASTE.rows.forEach(r=>r.cells.forEach(c=>got.push(c.code+':'+c.op)));
          return [want, got.sort().join(' '), PASTE.rows.map(r=>r.side).join(',')];}""")
        check(ok[0] == ok[1] and ok[2] == 'top,bottom', 'OCR of a layout picture: ' + ok[1] + ' / sides ' + ok[2])
        check(not [u for u in NET if not u.startswith(('file:', 'blob:', 'data:'))], 'no network request ' + str(NET[:3]))
        await pg.evaluate("()=>document.getElementById('dlgPaste').close()")
        # branch line + layout Excel file with shapes + operation sequence + flow suggestions
        xl = os.path.join(tmp, 'layout.xlsx'); make_layout_xlsx(xl)
        await pg.evaluate("()=>{ST.items=[];ST.seqText='';changed()}")
        await pg.click('#bLineSetup'); await pg.fill('#lsUnits', '8'); await pg.check('#lsBr'); await pg.fill('#lsBUnits', '6'); await pg.dispatch_event('#lsBUnits', 'input'); await pg.click('#lsOk')
        z = await pg.evaluate("()=>lineZones().map(z=>z.id+':'+z.y+':'+z.W)")
        check(len(z) == 3 and z[1].startswith('walk:') and z[1].endswith(':100'), 'branch line above, 1 m walkway ' + str(z))
        await pg.click('#bPaste'); await pg.set_input_files('#fileXl', xl); await pg.wait_for_timeout(600)
        r = await pg.evaluate("()=>[PASTE.nMc, PASTE.rows.length, PASTE.rows.map(r=>r.zone).join(','), (PASTE.seq||[]).length, PASTE.rows[0].cells.map(c=>c.code+':'+c.op).join(' ')]")
        check(r[:4] == [15, 4, 'branch,branch,main,main', 4] and r[4] == 'SFAM:41 SFAM:43 2CSM:45 1SLA:47', 'Excel shapes: 15 machines, 4 rows (2 branch + 2 main), 4 sequence lines ' + str(r))
        await pg.click('#pasteGo'); await pg.wait_for_timeout(200)
        r = await pg.evaluate("()=>[ST.items.filter(i=>i.zone=='branch'&&i.kind=='mc').length, ST.items.filter(i=>i.kind=='mc'&&!i.zone).length, seqParse(ST.seqText).lines.length, Math.round(flowCalc().total)]")
        check(r[0] == 7 and r[1] == 8 and r[2] == 4 and r[3] > 500, 'placed on branch (7) and main (8); flow from the sequence %d cm' % r[3])
        await pg.click('#bSug'); await pg.wait_for_timeout(1500)
        check(len(await pg.inner_text('#sugBody')) > 10, 'improvement suggestions listed')
        await pg.evaluate("()=>{const w=zoneById('walk');const it=ST.items.find(i=>i.kind=='mc'&&!i.zone);it.y=w.y+w.W/2;changed()}")
        check('isWalk' in await pg.evaluate('()=>ISSUES.map(x=>x.k)'), 'machine in the walkway flagged')
        if SHOTS: await pg.evaluate('()=>{SEL=[];onSelChange();fitView()}'); await pg.screenshot(path=SHOTS + '/ls-branch.png')
        await pg.keyboard.press('Control+z')
        # projects: style field, save (download fallback + recent list in the browser), new project, reopen from recent
        await pg.fill('#lnStyle', 'ABC26-00001-1101(XX)'); await pg.dispatch_event('#lnStyle', 'change')
        await pg.evaluate('()=>{window.showSaveFilePicker=undefined}')
        await pg.click('[data-tab="proj"]')
        async with pg.expect_download() as dl: await pg.click('#pjSave')
        await pg.wait_for_timeout(400)
        check('ABC26-00001-1101(XX)' in await pg.inner_text('#pjRecent'), 'saved project listed in recent projects')
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.click('#pjNew'); await pg.wait_for_timeout(200); await pg.evaluate("()=>document.getElementById('dlgLine').close()")
        await pg.click('[data-tab="proj"]'); await pg.wait_for_timeout(300); await pg.click('#pjRecent [data-open="r:0"]'); await pg.wait_for_timeout(300)
        check(await pg.evaluate("()=>[ST.items.filter(i=>i.kind=='mc').length, ST.info.style]") == [15, 'ABC26-00001-1101(XX)'], 'reopened from recent projects with its style')
        check(await pg.evaluate("()=>xlExpandStyles('Mã hàng ABC26-00115_116-3901.04(XX)').join(' ')") == 'ABC26-00115-3901(XX) ABC26-00115-3904(XX) ABC26-00116-3901(XX) ABC26-00116-3904(XX)', 'style names expanded like IE Báo cáo máy')
        await pg.select_option('#lang', 'en'); await pg.wait_for_timeout(150)
        check(await pg.inner_text('h1') == 'Line layout simulator', 'English UI'); await pg.select_option('#lang', 'vi')
        check(not errs, 'no page errors ' + str(errs))
        await b.close()
    print('RESULT %d/%d' % (sum(RES), len(RES)))
    sys.exit(0 if all(RES) else 1)

asyncio.run(main())
