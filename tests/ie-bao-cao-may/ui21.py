from playwright.sync_api import sync_playwright
import os, base64, json
fs={}
def add(root, prefix, skip=None):
    for r,_,files in os.walk(root):
        for f in files:
            if skip and skip in r: continue
            p=os.path.join(r,f); fs[prefix+os.path.relpath(p,root)]=base64.b64encode(open(p,'rb').read()).decode()
add('/tmp/t3/lcdata','data/','/prep'); add('/tmp/t3/lay','lay/')
fs['pick/MC_report.xlsx']=base64.b64encode(open('/mnt/user-data/uploads/MC_report.xlsx','rb').read()).decode()
mock=open('fsmock3.js').read().replace("const d=mkDir(o && o.id === 'layroot' ? 'lay/' : 'data/'); d.name = o && o.id === 'layroot' ? 'lay' : 'data';",
  "window.__opts=(window.__opts||[]).concat([JSON.stringify({id:o&&o.id,startIn:!!(o&&o.startIn)})]); const pre=window.__pickData||'data/'; const d=mkDir(o && o.id === 'layroot' ? 'lay/' : pre); d.name = o && o.id === 'layroot' ? 'lay' : pre.replace('/','');")
init="window.__FS={};"+"".join(f"window.__FS[{json.dumps(k)}]=Uint8Array.from(atob('{v}'),c=>c.charCodeAt(0));" for k,v in fs.items())+mock
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1450,'height':950}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.add_init_script(init); pg.goto('file:///home/claude/v2/out/IE_BaoCaoMay.html'); pg.evaluate("localStorage.clear()"); pg.reload()
    pg.evaluate("window.__kv={}; KV.get=async k=>window.__kv[k]||null; KV.set=async (k,v)=>{window.__kv[k]=v;};")
    # Consolidator sends BT1M
    pg.click('#bMc'); pg.click('#bDir'); pg.click('#bLc'); pg.fill('#uName','Tuan'); pg.dispatch_event('#uName','input')
    pg.set_input_files('#fFiles',['/mnt/user-data/uploads/TransformedMasterPlan_1.xlsx']); pg.wait_for_function("!document.getElementById('go').disabled", timeout=180000)
    pg.click('#mainTabs [data-tab="db"]'); pg.click('#go'); pg.wait_for_selector('#step3:not([hidden])', timeout=120000)
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.fill('#pFrom','2026-11-09'); pg.dispatch_event('#pFrom','change')
    pg.fill('#pQ','BT1M'); pg.wait_for_timeout(300); pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]','change'); pg.fill('#pQ','')
    pg.click('#pOpen'); pg.wait_for_timeout(3000); pg.click('#pSend'); pg.wait_for_timeout(1200)
    # IE Tech: first a wrong folder (an empty one), then the right one
    pg.click('#roleSeg [data-role="tech"]'); pg.fill('#tName','Hoa'); pg.dispatch_event('#tName','input'); pg.select_option('#tPU','PU2')
    print('1 buttons:', pg.inner_text('#tConnect'), '|', pg.inner_text('#tLayConnect'), '| reuse visible:', pg.is_visible('#tReuse'))
    pg.evaluate("window.__pickData='wrong/'; window.__FS['wrong/readme.txt']=new Uint8Array([65])"); pg.click('#tConnect'); pg.wait_for_timeout(1200)
    print('2 wrong folder:', pg.inner_text('#tConn'))
    pg.evaluate("window.__pickData='data/'"); pg.click('#tConnect'); pg.wait_for_timeout(1500)
    print('3 right folder:', pg.inner_text('#tConn'), '| picker options:', pg.evaluate("window.__opts.slice(-2)"))
    pg.click('#tLayConnect'); pg.wait_for_timeout(500); print('4 reuse button:', pg.inner_text('#tReuse'))
    pg.click('#tReuse'); pg.wait_for_timeout(1500); print('5 after reuse:', pg.inner_text('#tConn'))
    # open a layout: without and with the network path
    key=pg.evaluate("(TS.rows.find(x=>x.files&&x.files.length)||TS.rows[0]).key"); pg.evaluate(f"openDrawer({json.dumps(key)})"); pg.wait_for_timeout(1200); pg.click('#dLaySug [data-li="0"]'); pg.wait_for_timeout(1500)
    print('6 no path:', pg.inner_text('#dLayView').split('\n')[0:3])
    pg.fill('#tLayPath','\\\\\\\\fs01\\\\IE\\\\Layout'); pg.dispatch_event('#tLayPath','change'); pg.wait_for_timeout(1500)
    a=pg.query_selector('#dLayView a.pick'); print('7 excel link:', a.get_attribute('href') if a else None)
    print('7 path shown:', [x for x in pg.inner_text('#dLayView').split('\n') if 'fs01' in x][:1])
    pg.click('#dLayView [data-cp]'); pg.wait_for_timeout(1200); print('8 copy button:', pg.inner_text('#dLayView [data-cp]'))
    print('8b copyText resolves:', pg.evaluate("Promise.race([copyText('x').then(()=>'resolved'), new Promise(r=>setTimeout(()=>r('timeout'),2000))])"))
    pg.evaluate("window.__n=0; const v=document.getElementById('dLayView'); new MutationObserver(()=>window.__n++).observe(v,{childList:true})")
    pg.click('#dLayView [data-cp]'); pg.wait_for_timeout(1500); print('8c redraws after click:', pg.evaluate('window.__n'), '| label now:', pg.inner_text('#dLayView [data-cp]'))
    print('ERR', errs); b.close()
