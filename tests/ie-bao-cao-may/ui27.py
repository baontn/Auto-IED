import sys
HTML=sys.argv[1] if len(sys.argv)>1 else '/home/claude/v2/out/IE_BaoCaoMay.html'
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
    pg.on('pageerror', lambda e: errs.append(str(e))); DLG=[]; pg.on('dialog', lambda d: d.accept(DLG.pop(0) if (d.type=='prompt' and DLG) else ''))
    pg.add_init_script(init); pg.goto('file://'+HTML+''); pg.evaluate("localStorage.clear()"); pg.reload()
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
    # ---------- A. scroll position ----------
    pg.evaluate("document.querySelector('#tGrid .tw').scrollTop=1400"); pg.wait_for_timeout(200)
    info=pg.evaluate("""(()=>{const tw=document.querySelector('#tGrid .tw'); const rows=[...tw.querySelectorAll('tr.prow')]; const r=rows.find(x=>x.offsetTop>tw.scrollTop+80&&x.offsetTop<tw.scrollTop+tw.clientHeight-80); return {top:tw.scrollTop,key:r&&r.dataset.k,max:tw.scrollHeight-tw.clientHeight};})()""")
    print('A scroll before:', info)
    pg.evaluate(f"document.querySelector('#tGrid tr.prow[data-k={json.dumps(info['key'])}] [data-qk]').click()"); pg.wait_for_timeout(1200)
    print('A scroll after approve:', pg.evaluate("document.querySelector('#tGrid .tw').scrollTop"))
    # ---------- B. end date of the running style ----------
    cand=pg.evaluate("""(()=>{const G=latestGrid('BT1M'),rows=TS.rows,out=[];
      Object.keys(G.lines).forEach(l=>{const run=runningStyle(G.lines[l].styles,G.days); if(!run) return;
        const bt=rows.find(r=>r.group==='BT1M'&&r.line===l&&r.from===run), zz=bt&&rows.find(r=>r.group==='ZZM'&&r.line===l&&r.from===run&&r.to===bt.to);
        const pe=runEnd(G.lines[l].styles,run,G.days);
        if(bt&&zz&&G.days.indexOf(pe)>=3&&G.days.indexOf(pe)<G.days.length-6) out.push({l:l,run:run,to:bt.to,load:bt.load,pe:pe,days:G.days});});
      return out[0];})()""")
    print('B candidate:', {k:v for k,v in cand.items() if k!='days'})
    days=cand['days']; i=days.index(cand['pe']); newEnd=days[i-2]; fmt=lambda s: s[8:10]+'/'+s[5:7]+'/'+s[0:4]
    pg.fill('#tLines',cand['l']); pg.dispatch_event('#tLines','input'); pg.wait_for_timeout(700)
    def block(group):
        pg.click(f'#tGroupChips [data-tg="{group}"]'); pg.wait_for_timeout(500)
        return pg.evaluate(f"""(()=>{{const hdr=[...document.querySelectorAll('#tGrid tr:first-child th')].slice(3).map(t=>t.textContent.trim());const out={{}};let on=false;
          [...document.querySelectorAll('#tGrid tr')].forEach(tr=>{{const td=[...tr.children]; if(td.length<4) return; const lab=td[1].textContent.trim(); if(lab) on=(lab==={json.dumps(cand['l'])}); if(!on) return;
            const name=td[2].textContent.trim().replace(/\\s+/g,' '); const vals=td.slice(3).map((c,k)=>c.textContent.trim()?hdr[k]+'='+c.textContent.trim():'').filter(Boolean); out[name.slice(0,60)]=vals.join(' ');}}); return out;}})()""")
    short=lambda b:{k[:44]:v[:150] for k,v in b.items() if cand['run'][:14] in k or cand['to'][:14] in k}
    print('B before (BT1M):', short(block('BT1M')))
    DLG.append(fmt(newEnd)); pg.click(f'#tGrid [data-te="{cand["l"]}"]'); pg.wait_for_timeout(1000)
    print('B new end date typed:', fmt(newEnd), '| plan was', fmt(cand['pe']))
    print('B after (BT1M):', short(block('BT1M')))
    rows=pg.evaluate(f"TS.rows.filter(r=>r.line==={json.dumps(cand['l'])}&&r.from==={json.dumps(cand['run'])}&&r.to==={json.dumps(cand['to'])}).map(r=>r.group+' load '+r.load+' -> '+(r.loadActual||'-')+' prep days '+r.days.join(',')+' '+r.flags.join(','))")
    print('B changeover rows (all machine groups):', rows)
    print('B after (ZZM):', short(block('ZZM')))
    # ---------- C. Consolidator side ----------
    pg.click('#roleSeg [data-role="cons"]'); pg.click('#mainTabs [data-tab="data"]'); pg.click('#bLc'); pg.wait_for_timeout(1500)
    pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(800); pg.fill('#pFrom','2026-11-09'); pg.dispatch_event('#pFrom','change'); pg.click('#pOpen'); pg.wait_for_timeout(3000)
    cons=pg.evaluate(f"""(()=>{{const G=gridOf('BT1M'),L=G.lines[{json.dumps(cand['l'])}],f=d=>new Date(d).toISOString().slice(0,10);const o={{}};
      Object.keys(L.styles).forEach(s=>{{o[s.slice(0,30)]=Object.keys(L.styles[s]).map(Number).sort().map(d=>f(d).slice(5)+'='+L.styles[s][d]).join(' ');}});
      return {{styles:o,prep:L.prep.filter(r=>r.to==={json.dumps(cand['to'])}).map(r=>r.status+' load '+f(r.loadActual||r.load)+' days '+r.days.map(f).map(x=>x.slice(5)).join(',')+' '+r.flags.join(','))}};}})()""")
    print('C consolidator grid:', {k:v[:150] for k,v in cons['styles'].items() if cand['run'][:14] in k or cand['to'][:14] in k}, '| prep:', cons['prep'])
    # ---------- D. reset to the plan ----------
    pg.click('#roleSeg [data-role="tech"]'); pg.click('#tConnect'); pg.wait_for_timeout(1200); pg.fill('#tLines',cand['l']); pg.dispatch_event('#tLines','input'); pg.wait_for_timeout(600)
    DLG.append(''); pg.click(f'#tGrid [data-te="{cand["l"]}"]'); pg.wait_for_timeout(1000)
    print('D after reset (BT1M):', short(block('BT1M')))
    print('D rows:', pg.evaluate(f"TS.rows.filter(r=>r.line==={json.dumps(cand['l'])}&&r.from==={json.dumps(cand['run'])}&&r.to==={json.dumps(cand['to'])}).map(r=>r.group+' '+(r.loadActual||'plan'))"))
    pg.click('#roleSeg [data-role="cons"]'); pg.click('#mainTabs [data-tab="activity"]'); pg.wait_for_timeout(1500)
    print('E activity (end date events):', [r.inner_text().replace('\t',' | ')[:140] for r in pg.query_selector_all('#aTable tr') if 'kết thúc' in r.inner_text() or 'Đổi ngày' in r.inner_text()][:3])
    print('ERR', errs); b.close()
