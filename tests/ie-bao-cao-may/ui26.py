from playwright.sync_api import sync_playwright
import os, base64, json
fs={}
for root,_,files in os.walk('/tmp/t3/lcdata'):
    for f in files:
        if '/prep' in root: continue
        p=os.path.join(root,f); fs['data/'+os.path.relpath(p,'/tmp/t3/lcdata')]=base64.b64encode(open(p,'rb').read()).decode()
for root,_,files in os.walk('/tmp/t3/lay'):
    for f in files: p=os.path.join(root,f); fs['lay/'+os.path.relpath(p,'/tmp/t3/lay')]=base64.b64encode(open(p,'rb').read()).decode()
init="window.__FS={};"+"".join(f"window.__FS[{json.dumps(k)}]=Uint8Array.from(atob('{v}'),c=>c.charCodeAt(0));" for k,v in fs.items())+open('fsmock2.js').read()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1450,'height':950}, accept_downloads=True); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept(''))
    pg.add_init_script(init); pg.goto('file:///home/claude/v2/out/IE_BaoCaoMay.html'); pg.evaluate("localStorage.clear()"); pg.reload()
    # Consolidator: load, scan (layout files known), send BT1M
    pg.set_input_files('#fFiles',['/mnt/user-data/uploads/MC_report.xlsx','/mnt/user-data/uploads/TransformedMasterPlan.xlsx']); pg.set_input_files('#fDir','/tmp/t3/lay'); pg.click('#bLc'); pg.fill('#uName','Tuan')
    pg.wait_for_function("!document.getElementById('go').disabled", timeout=120000)
    pg.click('#mainTabs [data-tab="db"]'); pg.click('#go'); pg.wait_for_selector('#step3:not([hidden])', timeout=90000)
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom','2026-11-09'); pg.dispatch_event('#pFrom','change')
    pg.fill('#pQ','BT1M'); pg.wait_for_timeout(300); pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]','change'); pg.fill('#pQ','ZZM'); pg.wait_for_timeout(300); pg.check('[data-pg="ZZM"]'); pg.dispatch_event('[data-pg="ZZM"]','change'); pg.fill('[data-pr="ZZM"]','100'); pg.dispatch_event('[data-pr="ZZM"]','change'); pg.fill('#pQ','')
    pg.click('#pOpen'); pg.wait_for_timeout(2500); pg.click('#pSend'); pg.wait_for_timeout(1200); print('1 sent:', pg.inner_text('#pMsg2'))
    withfile=pg.evaluate("PS.rows.filter(x=>(PS.styleFiles||{})[baseKey(x.to)]).map(x=>x.line+' '+x.to+' '+x.pu).slice(0,3)"); print('1 rows with a layout file:', withfile)
    pg.click('#roleSeg [data-role="tech"]'); pg.fill('#tName','Hoa'); pg.dispatch_event('#tName','input'); pg.select_option('#tPU','')
    pg.click('#tConnect'); pg.wait_for_timeout(1500)
    ks=pg.evaluate("TS.rows.filter(r=>r.group==='BT1M'&&r.status==='PENDING'&&r.pu==='PU1').slice(0,4).map(r=>r.key)")
    pair=pg.evaluate("""(()=>{const by={};TS.rows.forEach(r=>{if(!r.from)return;const k=r.line+'|'+r.from+'|'+r.to;(by[k]=by[k]||{})[r.group]=r.key;});const k=Object.keys(by).find(k=>by[k].BT1M&&by[k].ZZM);return by[k];})()""")
    pg.click(f'#tGrid [data-qk="{ks[0]}"]'); pg.wait_for_timeout(500)
    pg.click(f'#tGrid [data-qr="{ks[1]}"]'); pg.wait_for_timeout(500)
    pg.evaluate(f"openDrawer({json.dumps(ks[2])})"); pg.fill('#dLay','2'); pg.dispatch_event('#dLay','input'); pg.fill('#dDays','5'); pg.click('#dKeep'); pg.wait_for_timeout(800)
    pg.evaluate(f"openDrawer({json.dumps(pair['BT1M'])})"); pg.click('#dSame'); pg.wait_for_timeout(1000)
    pg.fill('#tLines','D'); pg.dispatch_event('#tLines','input'); pg.select_option('#tPU','PU1'); pg.wait_for_timeout(500)
    pg.click('#tComplete'); pg.wait_for_timeout(1000); print('A tech completion:', pg.inner_text('#tDoneInfo'))
    # ---- Consolidator
    pg.click('#roleSeg [data-role="cons"]'); pg.click('#mainTabs [data-tab="data"]'); pg.click('#bLc'); pg.wait_for_timeout(1500)
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500)
    print('B completion line (no reconnect needed):', pg.inner_text('#pDone')[:200])
    print('B closed info before:', repr(pg.inner_text('#pClosedInfo')))
    pg.click('#pCloseBtn'); pg.wait_for_timeout(1500)
    print('C close panel:', pg.inner_text('#closeBody').replace('\n',' | ').replace('\t',' ')[:420])
    pg.evaluate("document.getElementById('closePanel').scrollIntoView({block:'start'})"); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/close_panel.png')
    pg.fill('#pCloseNote','Tuần 46 chốt lần 1'); pg.click('#pCloseDo'); pg.wait_for_timeout(1200)
    print('D closed info:', pg.inner_text('#pClosedInfo'))
    pg.fill('#pFrom','2026-11-09'); pg.dispatch_event('#pFrom','change'); pg.click('#pOpen'); pg.wait_for_timeout(2500)
    with pg.expect_download() as dl: pg.click('#pExport')
    dl.value.save_as('/tmp/prep_closed.xlsx'); print('E export file:', dl.value.suggested_filename)
    # ---- IE Tech changes something after closing
    pg.click('#roleSeg [data-role="tech"]'); pg.click('#tConnect'); pg.wait_for_timeout(1200)
    k4=pg.evaluate("TS.rows.filter(r=>r.group==='BT1M'&&r.status==='PENDING'&&r.pu==='PU1')[0].key"); pg.click(f'#tGrid [data-qk="{k4}"]'); pg.wait_for_timeout(600)
    pg.click('#roleSeg [data-role="cons"]'); pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500)
    print('F info after a later change:', pg.inner_text('#pClosedInfo'))
    # ---- Activity tab
    pg.click('#mainTabs [data-tab="activity"]'); pg.wait_for_timeout(1500)
    print('G tab:', pg.inner_text('#mainTabs').replace('\n',' | '), '| count:', pg.inner_text('#actCount'))
    print('G groups chips:', pg.inner_text('#aGroups').replace('\n',' | '))
    print('G first rows:', [r.inner_text().replace('\t',' | ')[:150] for r in pg.query_selector_all('#aTable tr')][1:6])
    pg.screenshot(path='/tmp/activity_tab.png')
    pg.click('#aGroups [data-g="ZZM"]'); pg.wait_for_timeout(400); print('H ZZM only:', pg.inner_text('#actCount'), [r.inner_text().replace('\t',' | ')[:110] for r in pg.query_selector_all('#aTable tr')][1:3])
    pg.click('#aGroups [data-g=""]'); pg.fill('#aLines','D'); pg.wait_for_timeout(400); print('I lines D:', pg.inner_text('#actCount'))
    pg.click('[data-av="group"]'); pg.wait_for_timeout(400); print('J by group:', [r.inner_text().replace('\t',' | ')[:150] for r in pg.query_selector_all('#aTable tr')][:3])
    pg.click('[data-av="line"]'); pg.wait_for_timeout(400); print('K by line:', [r.inner_text().replace('\t',' | ')[:150] for r in pg.query_selector_all('#aTable tr')][:3])
    with pg.expect_download() as dl2: pg.click('#aExport')
    dl2.value.save_as('/tmp/nhatky.xlsx'); print('L activity export:', dl2.value.suggested_filename)
    pg.click('[data-lang="en"]'); pg.wait_for_timeout(500); print('M EN:', pg.inner_text('#mainTabs').replace('\n',' | '), '|', pg.inner_text('[data-av="group"]'))
    print('ERR', errs); b.close()
