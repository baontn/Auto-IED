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
    pair=pg.evaluate("""(()=>{const by={};TS.rows.forEach(r=>{if(!r.from)return;const k=r.line+'|'+r.from+'|'+r.to;(by[k]=by[k]||{})[r.group]=r.key;});
      const k=Object.keys(by).find(k=>by[k].BT1M&&by[k].ZZM);return k?{k:k,bt:by[k].BT1M,zz:by[k].ZZM}:null;})()""")
    print('A pair with BT1M and ZZM rows:', pair)
    st=lambda key: pg.evaluate(f"(r=>r?r.status+' same='+r.same+' eff='+r.eff:'none')(TS.rows.find(x=>x.key==={json.dumps(key)}))")
    print('B before:', st(pair['bt']), '|', st(pair['zz']))
    pg.evaluate(f"openDrawer({json.dumps(pair['bt'])})"); pg.click('#dSame'); pg.wait_for_timeout(1200)
    print('C after "Cùng layout" on BT1M:', st(pair['bt']), '|', st(pair['zz']))
    files=pg.evaluate("Object.keys(window.__FS).filter(k=>k.indexOf('prep/shared')>0)"); print('D shared files:', files)
    pg.click('#roleSeg [data-role="cons"]'); pg.click('#mainTabs [data-tab="data"]'); pg.click('#bLc'); pg.wait_for_timeout(1500)
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(800); pg.click('#pOpen'); pg.wait_for_timeout(3000)
    fr,to=pair['k'].split('|')[1:3]
    print('E consolidator recalculation, same-layout status of the pair:', pg.evaluate(f"PS.rows.filter(x=>x.from==={json.dumps(fr)}&&x.to==={json.dumps(to)}).map(x=>x.group+' '+x.status+' same='+x.same)"))
    print('ERR', errs); b.close()
