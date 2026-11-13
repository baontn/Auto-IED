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
    # 1. Supervisor loads the plan
    login(pg,'Giam sat','Supervisor','PU2',first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(4000)
    print('1 SUP tabs:', pg.inner_text('nav.tabs').replace('\n',' '))
    # 2. IE officer: style tagged as approved by Consolidator tool (legacy Đạt -> Đã duyệt), still to check
    login(pg,'Lan','IE','PU2')
    pg.click('#btnLines'); pg.fill('#lineSearch','H06'); pg.click('#lnAll'); pg.click('#lnDone'); pg.wait_for_timeout(300)
    print('2 IE list:', lst(pg)[:300])
    pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(800)
    pg.click('#suggList [data-sug="0"]'); pg.wait_for_timeout(1500)
    print('2 IE result:', pg.inner_text('.banner').split('\n')[0] if pg.query_selector('.banner') else '-')
    pg.fill('#comment','4OLM: layout 9, database 8'); pg.click('#dFail'); pg.wait_for_timeout(800)
    print('2 IE list after Fail:', lst(pg)[:200])
    # 3. Consolidator: sees it is with him, sends to IE Tech (layout must be fixed)
    login(pg,'Tuan','Consolidator','PU2'); pg.wait_for_timeout(500)
    print('3 CONS tabs:', pg.inner_text('nav.tabs').replace('\n',' '), '| card:', pg.inner_text('#vBody')[:220].replace('\n',' | '))
    pg.click('[data-fixlayout]'); pg.wait_for_timeout(800)
    print('3 CONS after send:', pg.inner_text('#vBody')[:160].replace('\n',' | '))
    # 4. IE Tech: list, auto-open, says layout is correct -> DB wrong
    login(pg,'Hoa','Tech','PU2'); pg.wait_for_timeout(500)
    print('4 TECH tabs:', pg.inner_text('nav.tabs').replace('\n',' '), '| list:', lst(pg)[:200])
    pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(2500)
    print('4 TECH notes:', pg.inner_text('#work .card').replace('\n',' | ')[:330])
    pg.fill('#comment','Layout 9 is right, line needs 9'); pg.click('#tDbWrong'); pg.wait_for_timeout(800)
    print('4 TECH list after:', lst(pg)[:120])
    # 5. Consolidator fixes DB to 9 and verifies -> re-check by IE
    put(pg,'pick/MC.xlsx','db_9.xlsx')
    login(pg,'Tuan','Consolidator','PU2'); pg.wait_for_timeout(500)
    print('5 CONS card:', pg.inner_text('#vBody')[:260].replace('\n',' | '))
    if pg.query_selector('[data-verify]'): pg.click('[data-verify]'); pg.wait_for_timeout(1500)
    # 6. IE re-check: top of list, same file auto-opened, previously wrong machine highlighted, Pass
    login(pg,'Lan','IE','PU2'); pg.wait_for_timeout(500)
    print('6 IE list:', lst(pg)[:200])
    pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(2500)
    print('6 IE banner:', pg.inner_text('.banner').split('\n')[0], '| highlighted:', len(pg.query_selector_all('tr.prevbad')), '| pass enabled:', pg.is_enabled('#dPass'))
    pg.click('#dPass'); pg.wait_for_timeout(800)
    print('6 IE list after Pass:', lst(pg)[:150])
    login(pg,'Giam sat','Supervisor','PU2'); pg.wait_for_timeout(500)
    row=[r for r in pg.inner_text('#stTable').split('\n') if 'ANF26-00043-3908' in r]; print('7 SUP row:', row[:1], '| kpi:', pg.inner_text('#kpis').split('\n')[-4:])
    print('ERRORS', errs[:5]); b.close()
