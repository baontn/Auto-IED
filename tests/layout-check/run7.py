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
    put(pg,'data/Linemapping.xlsx','/tmp/lct/Linemapping_split.xlsx')
    
    put(pg,'pick/MC.xlsx','db_8.xlsx'); put(pg,'pick/plan.xlsx','/mnt/user-data/uploads/TransformedMasterPlan.xlsx')
    put(pg,'lay/PU2/ANF26-00043-3908(H1).xlsx','layout_g.xlsx'); put(pg,'data/validations/old.json','v_oldpu.json')
    login(pg,'Giam sat','Supervisor','PU2',first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(4000)
    st=pg.evaluate("(()=>{const e=Object.values(S.sp.styles).find(r=>r.firstLines.some(l=>/^[KJB]/i.test(l))); return e&&e.style+'|'+e.firstLines[0];})()"); print('0 a style first loading on a Sport line:', st)
    import json as _j; _j.dump({'valId':'old2','style':st.split('|')[0],'status':'FAIL','pu':'PU2','user':'Lan','role':'IE','savedAt':'2026-11-05T04:00:00.000Z','week':'2026-11-02','weekNo':45,'layoutFiles':'x.xlsx','layoutSheets':'Layout','comment':'1SLM layout 5',
      'details':[{'machine':'1SLM','group':'1SLM','db':4,'lay':5,'diff':1,'result':'QTY DIFF'}]},open('/tmp/lct/v_sport.json','w'))
    put(pg,'data/validations/sport.json','v_sport.json')
    login(pg,'Tuan','Consolidator','PU2'); pg.wait_for_timeout(600)
    pg.click('.tabs [data-tab="variation"]'); pg.wait_for_timeout(1500)
    print('1 PU choices:', pg.evaluate("[...document.querySelectorAll('#vPU option')].map(o=>o.value)"))
    for pu in ['', 'PU2', 'PU2 INTIMATE', 'PU2 SPORT']:
        (pg.select_option('#vPU', index=0) if pu=='' else pg.select_option('#vPU', pu)); pg.wait_for_timeout(400)
        txt=pg.inner_text('#vBody').replace('\n',' ')
        print('2 filter', repr(pu), '-> Intimate record:', 'ANF26-00043' in txt, '| Sport record:', (st.split('|')[0][:12] in txt), '| cards:', len(pg.query_selector_all('#vBody .vcard')))
    pg.select_option('#vPU','PU2 INTIMATE'); pg.wait_for_timeout(300)
    print('3 PU tag on card:', [x.inner_text() for x in pg.query_selector_all('#vBody .vhead .tag')][:2])
    pg.click('.tabs [data-tab="status"]'); pg.wait_for_timeout(600); print('4 status KPI cards:', [x.inner_text().replace('\n',' ')[:90] for x in pg.query_selector_all('#kpis .kpi')][:4])
    print('ERRORS', errs); b.close()
