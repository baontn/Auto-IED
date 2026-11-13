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
    put(pg,'lay/PU2/ANF26-00043-3908(H1).pdf','ANF26-00043-3908(H1).pdf')
    login(pg,'Giam sat','Supervisor','PU2',first=True)
    pg.evaluate("window.__pick='plan.xlsx'"); pg.click('#btnPlan'); pg.wait_for_timeout(4000)
    login(pg,'Lan','IE','PU2'); pg.click('#btnLines'); pg.fill('#lineSearch','H06'); pg.click('#lnAll'); pg.click('#lnDone'); pg.wait_for_timeout(300)
    pg.click('#list .item[data-i="0"]'); pg.wait_for_timeout(900)
    print('1 suggestions:', pg.inner_text('#suggList').replace('\n',' / ')[:160])
    pg.click('#suggList [data-sug="0"]'); pg.wait_for_timeout(1500)
    print('2 PDF pane visible:', pg.is_visible('#pdfPane'), '| title:', pg.inner_text('#pdfTitle'), '| frame src set:', pg.get_attribute('#pdfFrame','src')[:20])
    print('2 step2:', pg.inner_text('#work .file').replace('\n',' | ')[:260])
    print('3 before typing, Step 3 present:', pg.query_selector('.banner') is not None)
    # paste a list copied from the PDF (one line wrong on purpose: 4OLM 7) and add one row by hand
    pg.evaluate("document.getElementById('pdfPaste').closest('details').open=true")
    pg.fill('#pdfPaste','1SLM   4\n4OLM   7\nTotal 13\n2   BT1M'); pg.click('[data-ppaste]'); pg.wait_for_timeout(700)
    print('4 rows:', [r.inner_text().replace('\n',' ').replace('\t',' ') for r in pg.query_selector_all('.pdfrows tbody tr')])
    print('4 toast:', pg.inner_text('#toast') if pg.query_selector('#toast') else pg.inner_text('#log')[:120])
    print('5 result:', [b.inner_text()[:110] for b in pg.query_selector_all('.banner')])
    print('5 Pass enabled (not confirmed, mismatch):', pg.is_enabled('#dPass'))
    # fix the quantity by typing 8 in the row, then add via the add-row form
    pg.fill('[data-pq$="|1"]','8'); pg.dispatch_event('[data-pq$="|1"]','change'); pg.wait_for_timeout(600)
    print('6 result after fixing 4OLM:', [b.inner_text()[:110] for b in pg.query_selector_all('.banner')])
    pg.screenshot(path='/tmp/lc43_pdf.png'); print('6 Pass enabled before confirm:', pg.is_enabled('#dPass'), '| title:', pg.get_attribute('#dPass','title'))
    pg.click('#dAcc'); pg.wait_for_timeout(500)
    pg.click('[data-pconf]'); pg.wait_for_timeout(500)
    print('7 Pass enabled after confirm:', pg.is_enabled('#dPass'))
    pg.click('#dPass'); pg.wait_for_timeout(900)
    print('8 saved:', pg.inner_text('#log')[:90].replace('\n',' | '), '| pane closed:', not pg.is_visible('#pdfPane'))
    rec=pg.evaluate("""async()=>{const d=await (await window.__dir('data')).getDirectoryHandle('validations');for await(const [n,h] of d.entries()){const j=JSON.parse(await (await h.getFile()).text()); return {status:j.status, files:j.layoutFiles, type:j.layoutType, sheets:j.layoutSheets, self:j.selfCheck, manualPdf:j.manualPdf, rows:j.manualRows, comment:j.comment, groupDiff:j.groupDiffCount};} return null;}""")
    print('9 record:', rec)
    login(pg,'Giam sat','Supervisor','PU2'); pg.wait_for_timeout(500)
    pg.click('.tabs [data-tab="status"]'); pg.evaluate("S.wkS -= 7; renderAll(); renderStatus()"); pg.wait_for_timeout(800)
    pg.select_option('#fPU','PU2'); pg.wait_for_timeout(600)
    t=pg.inner_text('#stTable'); print('10 status rows:', len(t.split('\n')), [x[:140] for x in t.split('\n') if 'ANF' in x][:2], '| PDF tag shown:', 'PDF' in t, '| header:', t.split('\n')[0][:100], '| week:', pg.inner_text('#weekLbl') if pg.query_selector('#weekLbl') else '')
    print('10b first rows:', [x[:80] for x in t.split('\n')[1:4]])
    print('ERRORS', errs); b.close()
