from playwright.sync_api import sync_playwright
import os, base64, json, sys
MC, FSIN, FSOUT, EXTRA = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
fs = json.load(open(FSIN)) if os.path.exists(FSIN) else {}
if not fs:
    for root,_,files in os.walk('/tmp/t3/lcdata'):
        for f in files:
            p=os.path.join(root,f); fs['data/'+os.path.relpath(p,'/tmp/t3/lcdata')]=base64.b64encode(open(p,'rb').read()).decode()
for x in EXTRA:                       # inject Layout Check records: name=json
    k,v=x.split('=',1); fs['data/'+k]=base64.b64encode(open(v,'rb').read()).decode()
init="window.__FS={};"+"".join(f"window.__FS[{json.dumps(k)}]=Uint8Array.from(atob('{v}'),c=>c.charCodeAt(0));" for k,v in fs.items())+open('fsmock.js').read()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(accept_downloads=True); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.add_init_script(init)
    pg.goto('file:///home/claude/v2/out/IE_BaoCaoMay.html')
    files=[MC,'/mnt/user-data/uploads/TransformedMasterPlan.xlsx']+(['/mnt/user-data/uploads/CheckMc_-_Copy.xlsm'] if 'run1' in MC else [])
    pg.set_input_files('#fFiles',files); pg.set_input_files('#fDir','/tmp/t3/lay'); pg.click('#bLc'); pg.fill('#uName','Max')
    pg.wait_for_function("!document.getElementById('go').disabled", timeout=90000)
    print('prev:', pg.inner_text('#sPrev'), '| ck:', pg.inner_text('#sCk'))
    pg.click('#mainTabs [data-tab="db"]'); pg.click('#go'); pg.wait_for_selector('#step3:not([hidden])', timeout=90000)
    print('progress:', pg.inner_text('#pt')); print('views:', pg.inner_text('#views').replace('\n',' '))
    pg.click('#mainTabs [data-tab="db"]')
    for v in ['review','checked']:
        pg.click(f'#views [data-v="{v}"]')
        for r in pg.query_selector_all('#tbl tr')[1:]:
            c=r.query_selector_all('td'); 
            if len(c)<5: continue
            off=1 if v=='review' else 0
            sel=c[off+2].query_selector('select'); src=sel.eval_on_selector('option:checked','o=>o.textContent') if sel else ''
            print(f' [{v}]', c[off].inner_text().replace('\n',' | '), '|| source:', src[:70], '|| mc:', c[off+3].inner_text().replace('\n',' ')[:80], '||', c[off+4].inner_text()[:140])
    pg.click('#views [data-v="issues"]'); print(' ISSUES:', pg.inner_text('#tbl').replace('\n',' ')[:400])
    pg.click('#views [data-v="files"]'); print(' FILES:', pg.inner_text('#tbl').replace('\n',' ')[:300])
    pg.click('#views [data-v="review"]'); pg.click('#bAll')
    with pg.expect_download() as dl: pg.click('#save')
    pg.wait_for_timeout(1500); print('saved:', pg.inner_text('#smsg')[:200])
    out=pg.evaluate("(()=>{const o={};for(const k in window.__FS){let s='';const a=window.__FS[k];for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode.apply(null,a.subarray(i,i+8192));o[k]=btoa(s);}return o;})()")
    json.dump(out,open(FSOUT,'w')); print('files in data:', sorted(k for k in out if 'machinedb' in k or 'validations/2026' in k))
    print('ERR', errs); b.close()
