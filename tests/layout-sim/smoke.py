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
import asyncio, json, os, pathlib, sys, tempfile
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
          ['isUnknown','isOut','isOverlap','isSeat','isSeat2','isAisle'].forEach(k=>used.push(k));
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
        await pg.select_option('#lang', 'en'); await pg.wait_for_timeout(150)
        check(await pg.inner_text('h1') == 'Line layout simulator', 'English UI'); await pg.select_option('#lang', 'vi')
        check(not errs, 'no page errors ' + str(errs))
        await b.close()
    print('RESULT %d/%d' % (sum(RES), len(RES)))
    sys.exit(0 if all(RES) else 1)

asyncio.run(main())
