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

def make_layout_xlsx(path, combined=False):
    """a minimal .xlsx whose sheet holds a layout drawn with shapes (as the IE layouts are), synthetic data"""
    E = 9525
    def sp(i, txt, x, y, w=86, h=50):
        return ('<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
                '<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="%d" name="R%d"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="%d" y="%d"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
                '<xdr:txBody><a:bodyPr/><a:p><a:r><a:t>%s</a:t></a:r></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>') % (i, i, x * E, y * E, w * E, h * E, txt)
    shapes, i = [], 2
    def add(t, x, y, w=86, h=50):
        nonlocal i; shapes.append(sp(i, t, x, y, w, h)); i += 1
    def chair(x, y, w=30, h=60):   # a picture next to a machine box (the operator's chair)
        nonlocal i
        shapes.append(('<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
                       '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="%d" name="P%d"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill/><xdr:spPr><a:xfrm><a:off x="%d" y="%d"/><a:ext cx="%d" cy="%d"/></a:xfrm></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>') % (i, i, x * E, y * E, w * E, h * E)); i += 1
    if combined:   # one box per machine "31- 1SLA" (vertical boxes), a conveyor between the two rows, a manual table box
        for k, tx in enumerate(['31- 1SLA', '32 -3OLM', '33/34- 2CSM', '35-BT1M']): add(tx, 3000 + k * 100, 3000, 46, 110)
        for k in range(3): chair(3048 + k * 100, 3050)   # chairs on the right of the first three (the fourth has none: right, as usual above the conveyor)
        add('MNHD', 3420, 3060, 90, 50)
        add('Băng chuyền đôi 30cm', 3000, 3115, 600, 22)
        for k, tx in enumerate(['36- 1SLA', '37- 3OLM', '97- BT1M']): add(tx, 3040 + k * 100, 3140, 46, 110); chair(3006 + k * 100, 3150)
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

def make_cells_xlsx(path):
    """a layout written in cells (rows of codes with operation numbers above / below), plus a code table that is not a layout"""
    wb = Workbook(); ws = wb.active; ws.title = 'Initial layout'
    ws['A3'] = 'STYLE No /Mã hàng'; ws['E3'] = 'XYZ26-00002-1102XX'; ws['F3'] = 'TL OPTR /Tổng số công nhân:'; ws['H3'] = 6
    top = [('31', '1SLA'), ('32', '3OLM'), ('33/34', '2CSM'), ('35', 'BT1M')]; bot = [('1SLA', '36'), ('3OLM', '37'), ('BT1M', '97')]
    for k, (o, c) in enumerate(top): ws.cell(row=19, column=18 + k, value=o); ws.cell(row=20, column=18 + k, value=c)
    for k, (c, o) in enumerate(bot): ws.cell(row=22, column=19 + k, value=c); ws.cell(row=23, column=19 + k, value=o)
    # operation table with SAM and "Arrange. Optr / CN sắp xếp" (merged cell = shared operator, 0.5 + 0.5 = one operator)
    ws.append([]); r0 = 30
    for k, h in enumerate(['SQU', 'Op No.', 'Description', 'M/c Type', 'SAM/SMV', 'Calc.Optr', 'Arrange. Optr\nCN sắp xếp']): ws.cell(row=r0, column=1 + k, value=h)
    rows = [(31, '1SLA', 0.5, 1), (32, '3OLM', 0.4, None), (33, '2CSM', 0.3, 0.5), (34, '2CSM', 0.3, 0.5), (35, 'BT1M', 0.6, 1), (36, '1SLA', 0.5, 0.5), (37, '3OLM', 0.5, 0.5), (97, 'BT1M', 0.4, 1), (None, '2CSM', None, 0.5)]
    for k, (o, c, sam, ar) in enumerate(rows):
        for j, v in enumerate([o, o, 'op', c, sam, None, ar]): ws.cell(row=r0 + 1 + k, column=1 + j, value=v)
    ws.merge_cells(start_row=r0 + 1, start_column=7, end_row=r0 + 2, end_column=7)
    ws.cell(row=r0 + 1 + len(rows), column=1, value='Total Sew')
    m = wb.create_sheet('Machine')
    for k in range(10): m.append(['1SLA', '1SLM', '1SLM', 'note'])
    wb.save(path)

def make_auto_xlsx(path):
    """an operation table (machine type, SAM, people arranged) and the work flow, but no layout drawn: for the automatic layout"""
    wb = Workbook(); ws = wb.active; ws.title = 'Initial layout'
    ws['A3'] = 'STYLE No /Mã hàng'; ws['E3'] = 'XYZ26-00003-1103XX'
    for k, h in enumerate(['SQU', 'Op No.', 'Description', 'M/c Type', 'SAM/SMV', 'Calc.Optr', 'Arrange. Optr\nCN sắp xếp', 'Arrange. M/C\nThiết Bị', 'Target/optr', 'Target eff\n(M.tiêu Hiệu suất)']): ws.cell(row=5, column=1 + k, value=h)
    rows = [(31, '1SLA', 0.5, 1, 1, 0.75), (32, '3OLM', 0.4, 0.5, 1, 0.6), (33, '2CSM', 0.6, 0.5, 1, 0.7), (41, 'SFAM', 0.3, 0.5, 1, 0.8), (43, 'SFAM', 0.3, 0.5, 1, 0.8), (66, '4OLB', 0.9, 2, 2, 0.9), (67, '1SLA', 0.5, 1, 1, 1.2), (97, 'BT1M', 0.4, 1, 1, '#DIV/0!')]
    for k, (o, c, sam, ar, mcn, te) in enumerate(rows):
        for j, v in enumerate([o, o, 'op', c, sam, None, ar, mcn, None, te]): ws.cell(row=6 + k, column=1 + j, value=v)
    ws.cell(row=6 + len(rows), column=1, value='Total Sew')
    ws['A20'] = 'Work Flow'; ws['B21'] = 'Cụm tim'; ws['C21'] = '31=>32=>33'; ws['B22'] = 'Cụm bát'; ws['C22'] = '41=>43'; ws['B23'] = 'Lắp ráp'; ws['C23'] = '66=>67=>97=>QC'
    wb.save(path)

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
        await pg.goto(HTML); await pg.wait_for_timeout(500)
        check(await pg.evaluate("()=>document.getElementById('dlgDir').open"), 'first start asks where projects are saved')
        await pg.click('#dirLater'); await pg.wait_for_timeout(200)
        check(await pg.evaluate("()=>document.getElementById('dlgLine').open"), 'line set-up dialog on first start')
        await pg.fill('#lsName', 'Line D3'); await pg.fill('#lsUnits', '17'); await pg.dispatch_event('#lsUnits', 'input'); await pg.click('#lsOk')
        r = await pg.evaluate('()=>{const c=centerTable(),i=zoneById("input"),m=zoneById("main");return [c.L,c.W,ST.line.length,c.x-c.L/2,i.x,i.L,i.x+i.L,i.W==m.W]}')
        check(r == [1819, 30, 1849, 0, -120, 90, -30, True], 'central table 17 x 107 cm from 0 m, width 30; line 1819+30; input area 90 cm, 30 cm in front, as wide as the line ' + str(r))
        r = await pg.evaluate('''()=>{const f=zoneById("finish"),b=zoneById("boxes"),m=zoneById("main");const it=ST.items.filter(i=>isFinishObj(i));const q=it.find(i=>i.name=="QC"),p=it.filter(i=>/^PCK/.test(i.name)),bx=it.filter(i=>i.zone=="boxes");
          return [f.x==m.x+m.L+30, f.W==m.W && b.W==m.W, q.rot, q.L+"x"+q.W, p.map(i=>i.rot).join(), Math.abs(p[0].y-p[1].y)==75, bx.map(i=>i.color).join(), bx.every(i=>i.L==70), ISSUES.length,
          Math.round(p[0].x-p[0].L/2-(q.x+q.W/2)), Math.round(bx[0].x-bx[0].L/2-(p[0].x+p[0].L/2)), Math.round(bx[1].y-bx[0].y), Math.round(bx[2].y-bx[1].y), bx.every(i=>i.x==bx[0].x)]}''')
        check(r == [True, True, 90, '175x75', '0,0', True, '#f2c230,#e04848,#3fae6a', True, 0, 0, 0, 70, 70, True], 'finishing area (QC upright, 2 PCK face to face, touching QC) and boxes (yellow, red, green, 70 cm) stacked, touching each other and the PCK tables ' + str(r))
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
        check(await pg.evaluate("()=>[ST.items.filter(i=>i.kind=='mc').length, ST.items.filter(i=>i.kind=='obj').length, ISSUES.length]") == [27, 8, 0], 'paste: 27 machines + input + central table + finishing tables and boxes, no issue')
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
        a, b2, c3 = await pg.evaluate("()=>{const m=ST.items.filter(i=>i.kind=='mc');const a=m.find(i=>i.op=='31');const same=m.filter(i=>i!==a&&sideKey(i)==sideKey(a)).sort((x,y)=>Math.abs(y.x-a.x)-Math.abs(x.x-a.x));const other=m.find(i=>sideKey(i)!=sideKey(a));return [a.id, same[0].id, other.id]}")
        # across the central table: refused
        await pg.evaluate("([a,c])=>{SEL=[a,c];toggleOperator()}", [a, c3])
        check(await pg.evaluate("(c)=>!itemById(c).noOp", c3) and 'hai bên bàn giữa' in await pg.inner_text('#toast'), 'one operator cannot work on both sides of the central table')
        await pg.evaluate('()=>{SEL=[];onSelChange();render2d()}')
        for k2, i in enumerate([a, b2]):
            bb = await pg.locator('[data-id="%s"] rect' % i).last.bounding_box()
            if k2: await pg.keyboard.down('Shift')
            await pg.mouse.click(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
            if k2: await pg.keyboard.up('Shift')
        await pg.keyboard.press('w')
        r = await pg.evaluate("([a,b])=>{const l=opLinks();return [!itemById(a).noOp, itemById(b).noOp, itemById(b).by===a, l.length, l[0]&&l[0].far, Math.round(l[0]?l[0].dist:0)]}", [a, b2])
        check(r[:5] == [True, True, True, 1, True] and r[5] > 500, 'one operator for 2 far machines on the same side, linked with a double arrow (%d cm)' % r[5])
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
        check(await pg.evaluate('()=>ST.items.length') == 35 and await pg.input_value('#lnName') == 'Line D3', 'save/open round trip')
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
        await pg.click('#bLineSetup'); await pg.fill('#lsUnits', '8'); await pg.check('#lsBr'); await pg.fill('#lsBUnits', '6'); await pg.dispatch_event('#lsBUnits', 'input')
        if SHOTS: await pg.locator('#dlgLine').screenshot(path=SHOTS + '/ls-linesetup.png')
        await pg.click('#lsOk')
        z = await pg.evaluate("()=>lineZones().map(z=>z.id+':'+z.y+':'+z.W)")
        zw = await pg.evaluate("()=>{const w=zoneById('walk');return w.y+':'+w.W}")
        cx = await pg.evaluate("()=>[centerOf('main').x-centerOf('main').L/2, centerOf('branch').x-centerOf('branch').L/2]")
        check(zw.endswith(':100') and any(x.startswith('branch:0') for x in z) and cx == [0, 0] and any(x.startswith('inputB:') for x in z), 'branch line above, 1 m walkway, both central tables start at 0 m, input areas ' + str(z))
        await pg.click('#bPaste'); await pg.set_input_files('#fileXl', xl); await pg.wait_for_timeout(600)
        r = await pg.evaluate("()=>[PASTE.nMc, PASTE.rows.length, PASTE.rows.map(r=>r.zone).join(','), (PASTE.seq||[]).length, PASTE.rows[0].cells.map(c=>c.code+':'+c.op).join(' ')]")
        check(r[:4] == [15, 4, 'branch,branch,main,main', 4] and r[4] == 'SFAM:41 SFAM:43 2CSM:45 1SLA:47', 'Excel shapes: 15 machines, 4 rows (2 branch + 2 main), 4 sequence lines ' + str(r))
        await pg.click('#pasteGo'); await pg.wait_for_timeout(200)
        r = await pg.evaluate("()=>[ST.items.filter(i=>i.zone=='branch'&&i.kind=='mc').length, ST.items.filter(i=>i.kind=='mc'&&!i.zone).length, seqParse(ST.seqText).lines.length, Math.round(flowCalc().total)]")
        check(r[0] == 7 and r[1] == 8 and r[2] == 4 and r[3] > 500, 'placed on branch (7) and main (8); flow from the sequence %d cm' % r[3])
        # close up: machines of a row touch each other, the row touches the central table
        await pg.evaluate("()=>{const m=ST.items.filter(i=>i.kind=='mc'&&!i.zone);m.forEach((i,k)=>{i.x+=k*7;i.y+=(i.y<centerTable().y?-12:12)});SEL=m.map(i=>i.id);changed();onSelChange()}")
        await pg.click('#selTools [data-cmd="close"]'); await pg.wait_for_timeout(100)
        r = await pg.evaluate('''()=>{const ct=centerTable(),m=ST.items.filter(i=>i.kind=='mc'&&!i.zone),out=[];
          ['top','bot'].forEach(sd=>{const row=m.filter(i=>(i.y<ct.y)==(sd=='top')).map(i=>tableExt(i)).sort((a,b)=>a.x0-b.x0);if(!row.length)return;
            let gap=0;for(let k=1;k<row.length;k++)gap=Math.max(gap,Math.abs(row[k].x0-row[k-1].x1));
            const edge=sd=='top'?Math.max(...row.map(e=>e.y1))-(ct.y-ct.W/2):Math.min(...row.map(e=>e.y0))-(ct.y+ct.W/2);out.push([row.length,Math.round(gap*10)/10,Math.round(edge*10)/10]);});
          return [out, ISSUES.filter(x=>x.k=='isOverlap').length]}''')
        check(len(r[0]) == 2 and all(x[1] == 0 and x[2] == 0 for x in r[0]) and r[1] == 0, 'close up (⇥⇤): no gap between machines of a row, row edge on the central table ' + str(r))
        # the operator arrow (one person, two machines) runs behind the operator, not over the central table
        r = await pg.evaluate("()=>{const ct=centerTable(),m=ST.items.filter(i=>i.kind=='mc'&&!i.zone&&i.y>ct.y).sort((a,b)=>a.x-b.x);opShare([m[0],m[1]]);const l=opLinks().find(l=>l.home===m[0]||l.sat===m[0]);const e=tableExt(m[0]);const r=[l.c1.y>e.y1, l.back.y>0];delete m[1].noOp;delete m[1].by;return r}")
        check(r == [True, True], 'operator arrow drawn behind the operator\'s back ' + str(r))
        # flow / WIP simulation with SAM values: output equals the slowest operation's capacity
        await pg.evaluate("()=>{ST.ops={'41':{sam:0.5},'43':{sam:0.5},'45':{sam:1.6},'47':{sam:0.4},'52':{sam:0.3},'53':{sam:0.3},'55':{sam:0.3},'31':{sam:0.4},'33':{sam:0.5},'35':{sam:0.5},'66':{sam:0.6},'67':{sam:0.5},'68':{sam:0.5},'70':{sam:0.7},'97':{sam:0.3}};commit()}")
        r = await pg.evaluate("()=>{const R=simRun({hours:8,eff:0.8,bundle:5,rate:0,warm:true});return [R.bottleneck.join(','),Math.round(R.capMin),Math.round(R.outH),R.rows.find(x=>x.op=='45').wipEnd]}")
        check(r[0] == '45' and r[1] == 30 and abs(r[2] - r[1]) <= 3 and r[3] > 0, 'simulation: bottleneck 45 at 30 pcs/h, output %d, WIP before 45: %s' % (r[2], r[3]))
        await pg.click('[data-tab="sim"]'); await pg.click('#smRun'); await pg.wait_for_timeout(400)
        if SHOTS: await pg.screenshot(path=SHOTS + '/ls-sim.png', full_page=True)
        check('45' in await pg.inner_text('#smRes'), 'simulation tab shows the bottleneck')
        # efficiency per operation (table input), numbers on the capacity bars, headcount of the line
        await pg.fill('#smTable input[data-eff="45"]', '100'); await pg.press('#smTable input[data-eff="45"]', 'Tab'); await pg.wait_for_timeout(300)
        r = await pg.evaluate("()=>[ST.ops['45'].eff, Math.round(simBalance(0.8).capMin), document.querySelectorAll('#smTable .capc').length]")
        check(r[0] == 100 and r[1] > 30 and r[2] > 5, 'own efficiency of 45 = 100%%: bottleneck moves (%s pcs/h), bars show numbers' % r[1])
        n0 = await pg.evaluate("()=>simBalance(0.8).opers.length")
        await pg.evaluate("()=>{ST.line.hc=%d;commit()}" % (n0 + 3))
        r = await pg.evaluate("()=>{const B=simBalance(0.8);return [B.opers.length, B.rows.reduce((a,x)=>a+(x.adj||0),0)]}")
        check(r == [n0 + 3, 3], 'headcount of the line: 3 helpers added ' + str(r))
        # operations combined on one machine ("67/69", 69 not in the sequence) are simulated too
        await pg.evaluate("()=>{const it=ST.items.find(i=>i.kind=='mc'&&opsOf(i).join()=='67');it.op='67/69';ST.ops['69']={sam:0.2};ST.line.hc=0;delete ST.ops['45'].eff;commit()}")
        r = await pg.evaluate("()=>{const B=simBalance(0.8),R=simRun({hours:8,eff:0.8,bundle:5,rate:0,warm:true});const r69=R.rows.find(x=>x.op=='69');return [!!r69, r69&&r69.done>0, B.opers.some(p=>p.ops.join()=='67,69'), (B.L.added||[]).join()]}")
        check(r[0] and r[1] and r[2], 'combined operation 67/69: 69 simulated with the same operator ' + str(r))
        await pg.click('[data-tab="sim"]'); await pg.wait_for_timeout(200)
        check('⇄ 69' in await pg.inner_text('#smTable'), 'combined operations marked in the simulation table')
        # changes against the layout file, machines added by operation, operations removed / restored, WIP from the 2D page
        await pg.click('[data-tab="plan"]'); await pg.evaluate("()=>changed()")
        r = await pg.evaluate("()=>baseChanges().map(c=>c.op+':'+c.from+'>'+c.to)")
        check(sorted(r) == ['67/69:0>1', '67:1>0'], 'relabel 67 -> 67/69 listed as a change ' + str(r))
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.click('#chgBody [data-chg="accept"]'); await pg.wait_for_timeout(150)
        check(await pg.evaluate("()=>baseChanges().length") == 0 and not await pg.is_visible('#chgTag'), 'layout file edited: new reference, no change left')
        await pg.click('#bAddOp'); await pg.fill('#odQty', '2'); await pg.fill('#odOp', '45')
        if SHOTS: await pg.locator('#dlgOp').screenshot(path=SHOTS + '/ls-opdlg.png')
        check('2CSM' in await pg.inner_text('#odPrev'), 'operation 45 -> machine 2CSM found')
        await pg.click('#odAdd'); await pg.wait_for_timeout(150)
        r = await pg.evaluate("()=>{const m=ST.items.filter(i=>i.kind=='mc'&&opsOf(i).join()=='45');const bad=issueIds('bad');return [m.length, m.every(i=>i.code=='2CSM'), ISSUES.filter(x=>/isOverlap|isSeat/.test(x.k)&&x.ids.some(id=>m.some(i=>i.id==id))).length, baseChanges().map(chgText).join('|')]}")
        check(r[0] == 3 and r[1] and r[2] == 0 and '+2' in r[3], 'two 2CSM added for 45, not on top of other machines, change listed: ' + r[3])
        check(await pg.is_visible('#chgTag'), 'toolbar shows the number of changes')
        await pg.fill('#addCode', '47'); await pg.click('#bAddMc'); await pg.wait_for_timeout(100)
        check(await pg.evaluate("()=>ST.items.filter(i=>i.kind=='mc'&&opsOf(i).join()=='47'&&i.code=='1SLA').length") == 2, '"+ Máy" with an operation number adds that operation\'s machine')
        await pg.click('#bWip2d'); await pg.wait_for_timeout(300)
        w1 = await pg.inner_text('#wipBar')
        check(await pg.is_visible('#wipBar') and 'sp/giờ' in w1, 'WIP simulation from the 2D page: ' + w1[:80])
        await pg.click('#bAddOp'); await pg.fill('#odOp', '45')
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.click('#odDel'); await pg.wait_for_timeout(500)
        r = await pg.evaluate("()=>[ST.items.filter(i=>i.kind=='mc'&&opsOf(i).indexOf('45')>=0).length, seqParse(ST.seqText).lines.some(l=>l.ops.indexOf('45')>=0), (ST.opsOff||[]).map(x=>x.op).join(), simLines().lines.some(l=>l.ops.indexOf('45')>=0)]")
        w2 = await pg.inner_text('#wipBar')
        check(r == [0, False, '45', False] and w2 != w1, 'operation 45 removed (machines, sequence, simulation); WIP bar re-ran: ' + w2[:60])
        await pg.click('#chgBody [data-restore="45"]'); await pg.wait_for_timeout(100)
        check(await pg.evaluate("()=>[ST.items.filter(i=>i.kind=='mc'&&opsOf(i).join()=='45').length,(ST.opsOff||[]).length]") == [3, 0], 'operation 45 restored with its machines')
        r = await pg.evaluate("()=>{removeOp('69');return [ST.items.some(i=>i.op=='67'), ST.items.some(i=>/69/.test(i.op||''))]}")
        check(r == [True, False], 'removing 69 keeps the combined machine as 67')
        # an operation of the sequence without machine and without SAM can be removed too (from the simulation table)
        await pg.evaluate("()=>{ST.seqText=ST.seqText.replace('97','99=>97');changed()}")
        await pg.click('[data-tab="sim"]'); await pg.wait_for_timeout(200)
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.click('#smTable [data-rmop="99"]'); await pg.wait_for_timeout(300)
        r = await pg.evaluate("()=>[simLines().lines.some(l=>l.ops.indexOf('99')>=0), (ST.opsOff||[]).some(x=>x.op=='99'), !!document.querySelector('#smTable [data-rmop=\"99\"]')]")
        check(r == [False, True, False], 'operation without machine / SAM removed from the simulation ' + str(r))
        await pg.evaluate("()=>{restoreOp('99',true);ST.seqText=ST.seqText.replace('99=>','');changed()}")
        await pg.click('[data-tab="plan"]')
        check(await pg.get_attribute('#bHome', 'href') == '../index.html', 'button back to the IE Tools home page')
        if SHOTS: await pg.evaluate('()=>{SEL=[];onSelChange();fitView()}'); await pg.screenshot(path=SHOTS + '/ls-changes.png')
        await pg.click('#wipBar [data-wip="close"]')
        await pg.click('[data-tab="plan"]')
        await pg.click('#bSug'); await pg.wait_for_timeout(1500)
        check(len(await pg.inner_text('#sugBody')) > 10, 'improvement suggestions listed')
        await pg.evaluate("()=>{const w=zoneById('walk');const it=ST.items.find(i=>i.kind=='mc'&&!i.zone);it.y=w.y+w.W/2;changed()}")
        check('isWalk' in await pg.evaluate('()=>ISSUES.map(x=>x.k)'), 'machine in the walkway flagged')
        if SHOTS: await pg.evaluate('()=>{SEL=[];onSelChange();fitView()}'); await pg.screenshot(path=SHOTS + '/ls-branch.png')
        await pg.keyboard.press('Control+z')
        # layout written in cells (Excel without shapes)
        cx = os.path.join(tmp, 'cells.xlsx'); make_cells_xlsx(cx)
        await pg.evaluate("()=>{openPaste()}"); await pg.set_input_files('#fileXl', cx); await pg.wait_for_timeout(700)
        r = await pg.evaluate("()=>[document.querySelectorAll('#xlPick option').length, PASTE.nMc, PASTE.rows.map(r=>r.side+':'+r.cells.map(c=>c.code+'/'+c.op).join(',')).join(' | '), PASTE.meta.style, PASTE.meta.optr]")
        check(r == [2, 7, 'top:1SLA/31,3OLM/32,2CSM/33/34,BT1M/35 | bottom:1SLA/36,3OLM/37,BT1M/97', 'XYZ26-00002-1102(XX)', '6'], 'cell layout read (code table ignored; + automatic layout option), style and workers ' + str(r))
        # people arranged in the file: merged 31+32 = 1 person, 33/34 0.5+0.5, 36 + 37 0.5 + 0.5 = one person, 97 1 + 0.5 (extra machine row)
        r = await pg.evaluate("()=>[PASTE.ops['31'].ar, PASTE.ops['32'].ar, PASTE.ops['31'].ag==PASTE.ops['32'].ag, PASTE.ops['97'].ar, PASTE.ops['36'].ar]")
        check(r == [1, 1, True, 1.5, 0.5], '"Arrange. Optr / CN sắp xếp" read with merged cells and extra machine rows ' + str(r))
        await pg.click('#pasteGo'); await pg.wait_for_timeout(300)
        r = await pg.evaluate("()=>[arrUnits().map(u=>u.ops.join('·')+':'+u.p).join(' '), simOperators({31:1,32:1,33:1,34:1,35:1,36:1,37:1,97:1}).map(o=>o.ops.join('+')).sort().join(' ')]")
        check(r[0] == '31·32:1 33·34:1 35:1 36·37:1 97:2' and r[1] == '31+32 33+34 35 36+37 97', 'operators on the plan as arranged in the file (31+32 and 36+37 share one operator) ' + str(r))
        check('CN sắp xếp' in await pg.inner_text('#toast'), 'import message tells the arrangement was applied')
        await pg.click('#bOpAll'); await pg.click('#bArr'); await pg.wait_for_timeout(100)
        check(await pg.evaluate("()=>simOperators({31:1,32:1,33:1,34:1,35:1,36:1,37:1,97:1}).length") == 5, 'button "Theo CN sắp xếp trong file" applies it again')
        await pg.click('[data-tab="sim"]'); await pg.wait_for_timeout(200)
        check('⟨31·32⟩' in await pg.inner_text('#smTable'), 'simulation table shows the arranged people of the file')
        if SHOTS: await pg.screenshot(path=SHOTS + '/ls-arrange.png')
        await pg.click('[data-tab="plan"]')
        # one box per machine ("31- 1SLA"), rows above / below a conveyor
        cb = os.path.join(tmp, 'combined.xlsx'); make_layout_xlsx(cb, combined=True)
        await pg.evaluate("()=>{openPaste()}"); await pg.set_input_files('#fileXl', cb); await pg.wait_for_timeout(700)
        r = await pg.evaluate("()=>{const o=[...document.querySelectorAll('#xlPick option')].map(o=>o.value+' '+o.textContent);const i=o.findIndex(x=>/8 máy|8 machines/.test(x));return [o, i]}")
        if r[1] >= 0: await pg.select_option('#xlPick', index=r[1]); await pg.wait_for_timeout(200)
        r = await pg.evaluate("()=>PASTE.rows.map(r=>r.side+':'+r.cells.map(c=>c.code+'/'+c.op+(c.dir?'@'+c.dir:'')).join(',')).join(' | ')")
        check(r == 'top:1SLA/31@right,3OLM/32@right,2CSM/33/34@right,BT1M/35@right,MNHD/ | bottom:1SLA/36@left,3OLM/37@left,BT1M/97@left', 'boxes "31- 1SLA" read (operation + machine in one box), sides from the conveyor, upright boxes = turned machines, operator side from the chair ' + r)
        await pg.click('#pasteGo'); await pg.wait_for_timeout(300)
        r = await pg.evaluate("()=>{const m=ST.items.filter(i=>i.kind=='mc'&&i.op);const ct=centerTable();return [m.filter(i=>i.rot==270).length, m.filter(i=>i.rot==90).length, ISSUES.filter(x=>/isOverlap|isSeat|isAisle/.test(x.k)).length, m.filter(i=>i.rot%180).every(i=>Math.abs(Math.abs(i.y-ct.y)-ct.W/2-dimOf(i.code).L/2)<1)]}")
        check(r == [4, 3, 0, True], 'turned machines placed as drawn (4 operators on the right above, 3 on the left below), touching the central table, no conflict ' + str(r))
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(100)
        await pg.evaluate("()=>{openPaste()}")
        await pg.evaluate("()=>document.getElementById('dlgPaste').close()")
                # automatic layout: operation table + work flow, no layout drawn
        ax = os.path.join(tmp, 'auto.xlsx'); make_auto_xlsx(ax)
        await pg.evaluate("()=>{openPaste()}"); await pg.set_input_files('#fileXl', ax); await pg.wait_for_timeout(700)
        r = await pg.evaluate("()=>[document.querySelectorAll('#xlPick option').length, document.getElementById('xlPick').value, PASTE.auto, PASTE.nMc, PASTE.rows.map(r=>r.zone+':'+r.side+':'+r.cells.map(c=>c.code+'/'+c.op).join(',')).join(' | ')]")
        check(r[0] == 1 and r[1] == 'a:0' and r[2] and r[3] == 9 and r[4] == 'branch:top:1SLA/31,SFAM/41,SFAM/43 | branch:bottom:3OLM/32,2CSM/33 | main:top:4OLB/66,4OLB/66 | main:bottom:1SLA/67,BT1M/97', 'automatic layout offered and built from the table + flow (66 = 2 people -> 2 machines; operations sharing people on one side; sub-assemblies on the branch) ' + str(r))
        check('SAM đọc được cho 8/8' in await pg.inner_text('#pastePrev'), 'preview tells how many operations of the layout have SAM')
        r = await pg.evaluate("()=>['31','66','67','97'].map(o=>PASTE.ops[o].tef+'/'+PASTE.ops[o].mcn).join(' ')")
        check(r == '75/1 90/2 120/1 null/1', '"Target eff" and "Arrange. M/C" of each operation read from the file ' + r)
        await pg.click('#pasteGo'); await pg.wait_for_timeout(300)
        r = await pg.evaluate("()=>ST.items.filter(i=>i.kind=='mc'&&i.noOp&&i.by).every(i=>sideKey(i)==sideKey(itemById(i.by)))")
        check(r, 'shared operators stay on one side of the central table')
        r = await pg.evaluate("()=>{const s=ST.items.find(i=>i.kind=='mc'&&i.noOp&&i.by);const h=itemById(s.by),ct=centerOf(s.zone==='branch'?'branch':'main');const y0=s.y;s.y=2*ct.y-s.y;changed();const ok=!s.noOp&&!s.by;s.y=y0;opShare([h,s]);changed();return ok}")
        check(r, 'a machine dragged to the other side of the central table gets its own operator')
        r = await pg.evaluate('''()=>{const m=ST.items.filter(i=>i.kind=='mc');const col=o=>flowColOf(m.find(i=>opsOf(i)[0]==o));
          return [m.length, m.filter(i=>i.zone=='branch').length, col('31')==col('33'), col('31')!=col('41'), col('66')==col('97'), ISSUES.filter(x=>/isOverlap|isSeat/.test(x.k)).length]}''')
        check(r == [9, 5, True, True, True, 0], 'automatic layout placed (5 on the branch, 4 on the main line), machines coloured by flow, no overlap ' + str(r))
        f0 = await pg.evaluate("()=>parseFloat(document.querySelector('#plan text[font-size][stroke-width]:not([fill])')?.getAttribute('font-size')||0)")
        fa = await pg.evaluate("()=>{const t=[...document.querySelectorAll('#plan text')].find(e=>e.textContent=='4OLB');return parseFloat(t.getAttribute('font-size'))}")
        await pg.select_option('#lblMc', '1.5'); await pg.wait_for_timeout(100)
        fb = await pg.evaluate("()=>{const t=[...document.querySelectorAll('#plan text')].find(e=>e.textContent=='4OLB');return parseFloat(t.getAttribute('font-size'))}")
        check(abs(fb / fa - 1.5) < 0.01 and await pg.evaluate("()=>document.getElementById('lblMc3').value") == '1.5', 'machine-code label size adjustable (x1.5, 3D toolbar in step)')
        await pg.select_option('#lblMc', '1')
        if SHOTS: await pg.evaluate('()=>{SEL=[];onSelChange();fitView()}'); await pg.screenshot(path=SHOTS + '/ls-auto.png')
        await pg.click('[data-tab="sim"]'); await pg.click('#smRun'); await pg.wait_for_timeout(400)
        r = await pg.evaluate("()=>[effOf('31',0.8), effOf('97',0.8), document.querySelector('#smTable input[data-eff=\"31\"]').placeholder]")
        await pg.uncheck('#smTef'); r2 = await pg.evaluate("()=>effOf('31',0.8)"); await pg.check('#smTef'); await pg.click('#smRun'); await pg.wait_for_timeout(300)
        check(r == [0.75, 0.8, '75'] and r2 == 0.8, 'efficiency of each operation = file "Target eff" (general when missing or unticked) ' + str(r) + ' ' + str(r2))
        r = await pg.evaluate("()=>[document.querySelector('#smTable').innerText.includes('Mức bận'), SIMR.rows.every(x=>x.util==null||(x.util>=0&&x.util<=1.01)), document.querySelectorAll('#smRes .utils>div').length]")
        check(r[0] and r[1] and r[2] >= 6, 'WIP simulation shows utilisation per operation and per operator ' + str(r))
        r = await pg.evaluate("()=>[document.querySelector('#smTable tr[data-op=\"31\"] .opn')?.textContent, document.querySelector('#smTable tfoot').innerText.replace(/\\s+/g,' ')]")
        check(r[0] == 'op' and 'Tổng / TB' in r[1] and ' 3.9 9 7 ' in r[1] and 'cân bằng' in r[1], 'operation names and a totals row (SAM, machines, people, efficiency, output, balance) ' + str(r))
        await pg.click('[data-tab="plan"]')
        # projects: style field, save (download fallback + recent list in the browser), new project, reopen from recent
        await pg.fill('#lnStyle', 'ABC26-00001-1101(XX)'); await pg.dispatch_event('#lnStyle', 'change')
        # in-memory folder instead of the real folder picker (headless)
        await pg.evaluate('''()=>{window.__FS={};const mk=n=>({kind:'file',name:n,getFile:async()=>({text:async()=>window.__FS[n]||'',lastModified:Date.now()}),createWritable:async()=>{let b='';return {write:async d=>{b+=d},close:async()=>{window.__FS[n]=b}}}});
          window.showDirectoryPicker=async()=>({kind:'directory',name:'Projects',queryPermission:async()=>'granted',requestPermission:async()=>'granted',getFileHandle:async n=>mk(n),
            values:function(){const ks=Object.keys(window.__FS);let i=0;return {next:async()=>i<ks.length?{done:false,value:mk(ks[i++])}:{done:true}}}});}''')
        downloads = []; pg.on('download', lambda d: downloads.append(d))
        await pg.click('[data-tab="proj"]'); await pg.click('#pjSave'); await pg.wait_for_timeout(600)
        await pg.keyboard.press('Control+s'); await pg.wait_for_timeout(500)
        fsk = await pg.evaluate('()=>Object.keys(window.__FS)'); print('  folder:', fsk, 'downloads:', len(downloads))
        check(len(fsk) == 1 and fsk[0].startswith('ABC26-00001-1101(XX)') and not downloads, 'save asks the folder once, then saves into it (no download, same file)')
        check('ABC26-00001-1101(XX)' in await pg.inner_text('#pjRecent'), 'saved project listed in recent projects')
        if SHOTS: await pg.screenshot(path=SHOTS + '/ls-proj.png')
        nmc = await pg.evaluate("()=>ST.items.filter(i=>i.kind=='mc').length")
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.click('#pjNew'); await pg.wait_for_timeout(200); await pg.evaluate("()=>document.getElementById('dlgLine').close()")
        await pg.click('[data-tab="proj"]'); await pg.wait_for_timeout(300); await pg.click('#pjRecent [data-open="r:0"]'); await pg.wait_for_timeout(300)
        check(await pg.evaluate("()=>[ST.items.filter(i=>i.kind=='mc').length, ST.info.style]") == [nmc, 'ABC26-00001-1101(XX)'], 'reopened from recent projects with its style')
        check(await pg.evaluate("()=>xlExpandStyles('Mã hàng ABC26-00115_116-3901.04(XX)').join(' ')") == 'ABC26-00115-3901(XX) ABC26-00115-3904(XX) ABC26-00116-3901(XX) ABC26-00116-3904(XX)', 'style names expanded like IE Báo cáo máy')
        await pg.select_option('#lang', 'en'); await pg.wait_for_timeout(150)
        check(await pg.inner_text('h1') == 'Line layout simulator', 'English UI'); await pg.select_option('#lang', 'vi')
        check(not errs, 'no page errors ' + str(errs))
        await b.close()
    print('RESULT %d/%d' % (sum(RES), len(RES)))
    sys.exit(0 if all(RES) else 1)

asyncio.run(main())
