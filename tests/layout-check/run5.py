import srv; _s=srv.start()
from playwright.sync_api import sync_playwright
import base64, time
B='http://127.0.0.1:8799/LayoutCheck.html'
def put(pg, path, src):
    data=base64.b64encode(open(src,'rb').read()).decode()
    pg.evaluate("""async ([p,b]) => { const parts=p.split('/'); const name=parts.pop(); const d=await window.__dir(parts.join('/'));
      const fh=await d.getFileHandle(name,{create:true}); const w=await fh.createWritable(); await w.write(Uint8Array.from(atob(b),c=>c.charCodeAt(0))); await w.close(); }""",[path,data])
def login(pg, name, role, pu, first=False):
    if not first: pg.click('#btnLogout'); pg.wait_for_selector('#login:not([hidden])'); pg.wait_for_timeout(300)
    pg.fill('#lgName', name); pg.click(f'[data-role="{role}"]'); pg.select_option('#lgPU', pu)
    if first:
        pg.click('#lgDirBtn'); pg.evaluate("window.__pick='MC.xlsx'"); pg.click('#lgDbBtn'); pg.click('#lgLayBtn'); pg.wait_for_timeout(500)
    pg.click('#lgStart'); pg.wait_for_selector('#login[hidden]', state='attached', timeout=15000); pg.wait_for_timeout(1200)
def lst(pg): return pg.inner_text('#list').replace('\n',' | ')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':1000}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept('4OLM: check qty on layout'))
    pg.add_init_script(open('opfs.js').read())
    pg.goto(B); pg.wait_for_timeout(500)
    put(pg,'data/Linemapping.xlsx','/home/claude/lc/LayoutCheck/data/Linemapping.xlsx')
    
    put(pg,'pick/MC.xlsx','db_split.xlsx'); put(pg,'pick/plan.xlsx','/mnt/user-data/uploads/TransformedMasterPlan.xlsx')
    put(pg,'lay/PU2/ANF26-00043-3908(H1).xlsx','layout_split.xlsx')
    login(pg,'Giam sat','Supervisor','PU2',first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(4000)
    login(pg,'Lan','IE','PU2'); pg.click('#btnLines'); pg.fill('#lineSearch','H06'); pg.click('#lnAll'); pg.click('#lnDone'); pg.wait_for_timeout(300)
    pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(800); pg.click('#suggList [data-sug="0"]'); pg.wait_for_timeout(1500)
    txt=pg.inner_text('#work'); i=txt.find('Bảng máy cuối layout'); print('step 2 note:', txt[i:i+170].replace('\n',' / '))
    print('step 3 banners:', [b.inner_text()[:120] for b in pg.query_selector_all('.banner')])
    print('Pass enabled:', pg.is_enabled('#dPass')); pg.click('#dPass'); pg.wait_for_timeout(800)
    print('after Pass:', pg.inner_text('#log')[:70].replace('\n',' | '))
    rec=pg.evaluate("""async()=>{const d=await (await window.__dir('data')).getDirectoryHandle('validations');for await(const [n,h] of d.entries()){const j=JSON.parse(await (await h.getFile()).text()); if(j.status==='PASS') return j.status+' | selfCheck='+j.selfCheck;} return 'none';}""")
    print('saved record:', rec); print('ERRORS', errs); b.close()
