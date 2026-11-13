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
    pg.fill('#pQ','BT1M'); pg.wait_for_timeout(300); pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]','change'); pg.fill('#pQ','')
    pg.click('#pOpen'); pg.wait_for_timeout(2500); pg.click('#pSend'); pg.wait_for_timeout(1200); print('1 sent:', pg.inner_text('#pMsg2'))
    withfile=pg.evaluate("PS.rows.filter(x=>(PS.styleFiles||{})[baseKey(x.to)]).map(x=>x.line+' '+x.to+' '+x.pu).slice(0,3)"); print('1 rows with a layout file:', withfile)
    # IE Tech
    pg.click('#roleSeg [data-role="tech"]'); pg.fill('#tName','Hoa'); pg.dispatch_event('#tName','input'); pg.select_option('#tPU','PU2')
    pg.click('#tConnect'); pg.wait_for_timeout(1500); pg.click('#tLayConnect'); pg.wait_for_timeout(500)
    print('2 conn:', pg.inner_text('#tConn'), '|', pg.inner_text('#tLayConn'), '| group:', pg.input_value('#tGroup'))
    print('2 KPI:', pg.inner_text('#tKpis').replace('\n',' '))
    hdr=pg.query_selector('#tGrid tr').inner_text().replace('\t',' ')[:120]; print('3 header:', hdr)
    sums=[r.inner_text().replace('\t',' ')[:90] for r in pg.query_selector_all('#tGrid tr.pusum, #tGrid tr.tot')]; print('3 totals:', sums[:7])
    rows=pg.query_selector_all('#tGrid tr.prow'); print('3 prep rows:', len(rows), '|', rows[0].inner_text().replace('\t',' ')[:120])
    k0=rows[0].get_attribute('data-k'); k1=rows[1].get_attribute('data-k'); k2=rows[2].get_attribute('data-k')
    pg.click(f'#tGrid [data-qk="{k0}"]'); pg.wait_for_timeout(600)          # keep: one click
    pg.click(f'#tGrid [data-qr="{k1}"]'); pg.wait_for_timeout(600)          # remove: one click
    pg.click(f'#tGrid tr.prow[data-k="{k2}"]'); pg.wait_for_timeout(300)    # side panel
    print('4 drawer:', pg.inner_text('#dInfo'))
    pg.fill('#dLay','2'); pg.dispatch_event('#dLay','input'); print('4 prep field after layout 2:', pg.input_value('#dQty')); pg.fill('#dDate','2026-11-20'); pg.click('#dKeep'); pg.wait_for_timeout(800)
    st=lambda k: pg.evaluate(f"(TS.rows.filter(x=>x.key==={json.dumps(k)})[0]||{{}}).status+' eff '+(TS.rows.filter(x=>x.key==={json.dumps(k)})[0]||{{}}).eff+' '+((TS.rows.filter(x=>x.key==={json.dumps(k)})[0]||{{}}).flags||[]).join(',')")
    print('5 results:', st(k0), '|', st(k1), '|', st(k2))
    print('5 notices sent:', pg.evaluate("TS.notices.map(n=>n.style+' '+n.group+' DB '+n.dbQty+' layout '+n.layoutQty)"))
    # open a layout from a row that has a file (any group/PU)
    key=pg.evaluate("(TS.rows.filter(x=>x.files&&x.files.length)[0]||{}).key")
    if key:
        pg.evaluate(f"openDrawer({json.dumps(key)})"); pg.click('#dOpenLay'); pg.wait_for_timeout(1500)
        print('6 layout view:', pg.inner_text('#dLayView').replace('\n',' | ')[:260], '| msg:', pg.inner_text('#dLayMsg'))
    else: print('6 no row with a layout file in this proposal')
    pg.click('#dClose'); pg.evaluate("document.querySelector('#tGrid tr.prow').scrollIntoView({block:'center'})"); pg.screenshot(path='/tmp/tech_grid.png')
    print('ERR', errs); b.close()
