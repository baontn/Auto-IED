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
    
    put(pg,'pick/MC.xlsx','db_g_b.xlsx'); put(pg,'pick/plan.xlsx','/mnt/user-data/uploads/TransformedMasterPlan.xlsx')
    put(pg,'lay/PU2/ANF26-00043-3908(H1).xlsx','layout_g.xlsx')
    login(pg,'Giam sat','Supervisor','PU2',first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(4000)
    login(pg,'Lan','IE','PU2'); pg.click('#btnLines'); pg.fill('#lineSearch','H06'); pg.click('#lnAll'); pg.click('#lnDone'); pg.wait_for_timeout(300)
    pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(800); pg.click('#suggList [data-sug="0"]'); pg.wait_for_timeout(1500)
    print('B banner:', pg.inner_text('.banner').split('\n')[0], '| groups:', pg.inner_text('ul.diffs').replace('\n',' / '), '| Pass enabled:', pg.is_enabled('#dPass'))
    pg.fill('#comment','OLC roller: layout 3, DB 2'); pg.click('#dFail'); pg.wait_for_timeout(800)
    login(pg,'Tuan','Consolidator','PU2'); pg.wait_for_timeout(500)
    print('B variations:', [r.inner_text().split('\t')[0] for r in pg.query_selector_all('#vBody tbody tr')])
    put(pg,'pick/MC.xlsx','db_g_c.xlsx')
    login(pg,'Tuan','Consolidator','PU2'); pg.wait_for_timeout(500)
    print('C after DB fix with 2OLC:', pg.inner_text('#vBody')[:80].replace('\n',' '))
    login(pg,'Lan','IE','PU2'); print('C IE list:', lst(pg)[:150])
    pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(2500)
    print('C banner:', pg.inner_text('.banner').split('\n')[0], '| code notes:', pg.inner_text('ul.diffs').replace('\n',' / ') if pg.query_selector('ul.diffs') else '-', '| Pass enabled:', pg.is_enabled('#dPass'))
    pg.click('#dPass'); pg.wait_for_timeout(800); print('C after Pass:', lst(pg)[:100], '| log:', pg.inner_text('#log')[:80].replace('\n',' | '))
    login(pg,'Tuan','Consolidator','PU2'); pg.wait_for_timeout(500); print('C variations after Pass:', pg.inner_text('#vBody')[:80].replace('\n',' '))
    print('ERRORS', errs); b.close()
