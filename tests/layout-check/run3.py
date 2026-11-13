import srv; _s=srv.start()
from playwright.sync_api import sync_playwright
import base64, time, json
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
    
    put(pg,'pick/MC.xlsx','db_8.xlsx'); put(pg,'pick/plan.xlsx','/mnt/user-data/uploads/TransformedMasterPlan.xlsx')
    put(pg,'lay/PU2/ANF26-00043-3908(H1).xlsx','layout_v1.xlsx')
    put(pg,'data/prep/proposals/p1.json','proposal.json')
    login(pg,'Giam sat','Supervisor','PU2',first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(4000)
    login(pg,'Hoa','Tech','PU2'); pg.wait_for_timeout(500)
    print('TECH tabs:', pg.inner_text('nav.tabs').replace('\n',' '))
    pg.click('.tabs [data-tab="prep"]'); pg.wait_for_timeout(500)
    print('KPI:', pg.inner_text('#pKpis').replace('\n',' ')); cards=pg.query_selector_all('#pBody .vcard'); print('cards', len(cards)); print('card1:', cards[0].inner_text().replace('\n',' | ')[:260])
    pg.click('#pBody [data-pk]')                                  # keep first row
    pg.wait_for_timeout(400); pg.evaluate("window.__prompts=['1','Line already has 3 BT1M']"); pg.click('#pBody [data-pa]'); pg.wait_for_timeout(400)   # adjust next
    pg.evaluate("window.__prompts=['1']"); pg.click('#pBody [data-pr]'); pg.wait_for_timeout(600)    # remove next: same layout
    print('log:', pg.inner_text('#log')[:300].replace('\n',' | '))
    pg.select_option('#pSt',''); pg.wait_for_timeout(300)
    print('statuses:', [r.inner_text().split('\t')[5][:40] for r in pg.query_selector_all('#pBody tbody tr')][:6])
    print('KPI after:', pg.inner_text('#pKpis').replace('\n',' '))
    login(pg,'Giam sat','Supervisor','PU2'); pg.click('.tabs [data-tab="status"]'); pg.wait_for_timeout(400)
    print('SUP KPI:', [x for x in pg.inner_text('#kpis').split('\n') if 'uẩn bị' in x])
    files=pg.evaluate("""async()=>{const out=[];const d=await window.__dir('data/prep');for await(const [n,h] of d.entries()){ if(h.kind==='directory'){ for await(const [m,f] of h.entries()) out.push(n+'/'+m+' '+(await (await f.getFile()).text())); } } return out;}""")
    open('/tmp/lct/prepfiles.json','w').write(json.dumps(files))
    print('ERRORS', errs); b.close()
