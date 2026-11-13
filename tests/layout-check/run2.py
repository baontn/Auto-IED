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
    
    put(pg,'pick/MC.xlsx','db_8.xlsx'); put(pg,'pick/plan.xlsx','/mnt/user-data/uploads/TransformedMasterPlan.xlsx')
    put(pg,'lay/PU2/ANF26-00043-3908(H1).xlsx','layout_v1.xlsx')
    put(pg,'data/approvals/ap-1.json','approval.json')
    login(pg,'Giam sat','Supervisor','PU2',first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(4000)
    login(pg,'Lan','IE','PU2')
    pg.click('#btnLines'); pg.fill('#lineSearch','H06'); pg.click('#lnAll'); pg.click('#lnDone'); pg.wait_for_timeout(300)
    print('A IE list (approval tag):', lst(pg)[:200])
    pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(800); pg.click('#suggList [data-sug="0"]'); pg.wait_for_timeout(1500)
    pg.fill('#comment','4OLM: layout 9, database 8'); pg.click('#dFail'); pg.wait_for_timeout(800)
    login(pg,'Tuan','Consolidator','PU2'); pg.click('[data-fixlayout]'); pg.wait_for_timeout(800)
    # IE Tech edits the layout file (4OLM 8) and confirms
    put(pg,'lay/PU2/ANF26-00043-3908(H1).xlsx','layout_v2.xlsx')
    login(pg,'Hoa','Tech','PU2'); pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(2500)
    print('B TECH result after edit:', pg.inner_text('.banner').split('\n')[0])
    pg.click('#tFixed'); pg.wait_for_timeout(800)
    print('B TECH log:', pg.inner_text('#log')[:160].replace('\n',' | '))
    login(pg,'Lan','IE','PU2'); print('C IE list:', lst(pg)[:200])
    pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(2500)
    print('C IE banner:', pg.inner_text('.banner').split('\n')[0], '| auto-opened toast:', 'Đã mở lại' in pg.inner_text('#log'))
    # IE still disagrees -> second Fail -> escalation
    pg.fill('#comment','BT1M should be 3'); pg.click('#dFail'); pg.wait_for_timeout(800)
    login(pg,'Giam sat','Supervisor','PU2')
    row=[x for x in pg.inner_text('#stTable').split('\n') if 'ANF26-00043-3908' in x]
    print('D SUP row:', row[:1]); print('D SUP kpi:', pg.inner_text('#kpis').split('\n')[-4:])
    pg.click('.tabs [data-tab="variation"]'); pg.wait_for_timeout(500)
    login(pg,'Hoa','Tech','PU2'); print('E TECH list:', lst(pg)[:160]); pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(2000); print('E TECH request:', [x for x in pg.inner_text('#work .card').split('\n') if 'Yêu cầu' in x])
    print('D SUP variation card:', pg.inner_text('#vBody')[:260].replace('\n',' | '))
    print('ERRORS', errs); b.close()
