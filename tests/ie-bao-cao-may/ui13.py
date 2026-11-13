from playwright.sync_api import sync_playwright
import os, base64, json
fs={}
for root,_,files in os.walk('/tmp/t3/lcdata'):
    for f in files:
        if '/prep/' in root+'/': continue
        p=os.path.join(root,f); fs['data/'+os.path.relpath(p,'/tmp/t3/lcdata')]=base64.b64encode(open(p,'rb').read()).decode()
init="window.__FS={};"+"".join(f"window.__FS[{json.dumps(k)}]=Uint8Array.from(atob('{v}'),c=>c.charCodeAt(0));" for k,v in fs.items())+open('fsmock.js').read()
Q=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1500,'height':1000}, accept_downloads=True); errs=[]; dlg=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def on_dialog(d):
        dlg.append(d.message[:90].replace('\n',' '))
        d.accept(Q.pop(0) if (d.type=='prompt' and Q) else '')
    pg.on('dialog', on_dialog); pg.add_init_script(init)
    pg.goto('file:///home/claude/v2/out/IE_BaoCaoMay.html')
    # ---- Consolidator sends prep for BT1M
    pg.set_input_files('#fFiles',['/mnt/user-data/uploads/MC_report.xlsx','/mnt/user-data/uploads/TransformedMasterPlan.xlsx']); pg.set_input_files('#fDir','/tmp/t3/lay'); pg.click('#bLc'); pg.fill('#uName','Tuan')
    pg.wait_for_function("!document.getElementById('go').disabled", timeout=120000); pg.click('#mainTabs [data-tab="db"]'); pg.click('#go'); pg.wait_for_selector('#step3:not([hidden])', timeout=90000); pg.click('#mainTabs [data-tab="prep"]'); pg.wait_for_timeout(1500); pg.wait_for_selector('#step4:not([hidden])', timeout=90000)
    print('notice card visible:', pg.is_visible('#noticeCard'))
    pg.fill('#pFrom','2026-11-09'); pg.dispatch_event('#pFrom','change'); pg.check('[data-pg="BT1M"]'); pg.dispatch_event('[data-pg="BT1M"]','change'); pg.click('#pOpen'); pg.wait_for_timeout(2000)
    pg.click('#pSend'); pg.wait_for_timeout(800); print('send:', pg.inner_text('#pMsg2'))
    # ---- IE Tech
    pg.click('#roleSeg [data-role="tech"]'); pg.wait_for_timeout(300)
    print('tech view:', pg.is_visible('#techView'), '| cons hidden:', not pg.is_visible('#consView'), '| savebar hidden:', not pg.is_visible('#savebar'))
    pg.fill('#tName','Hoa'); pg.dispatch_event('#tName','input'); pg.select_option('#tPU','PU2'); pg.click('#tConnect'); pg.wait_for_timeout(1500)
    print('conn:', pg.inner_text('#tConn'), '| KPI:', pg.inner_text('#tKpis').replace('\n',' '))
    first=pg.query_selector('#tBody .vcard'); print('card:', first.inner_text().replace('\n',' | ')[:230])
    key=pg.get_attribute('#tBody input.lq','data-lq'); qtyB=int(pg.get_attribute('#tBody input.lq','placeholder'))
    pg.fill(f'#tBody input.lq[data-lq="{key}"]', str(qtyB-2)); pg.dispatch_event(f'#tBody input.lq[data-lq="{key}"]','input')
    Q[:]=['Layout rev 3 shows fewer']; pg.click(f'#tBody [data-tk="{key}"]'); pg.wait_for_timeout(1200)
    k2=pg.get_attribute('#tBody [data-tr]','data-tr'); Q[:]=['2']; pg.click(f'#tBody [data-tr="{k2}"]'); pg.wait_for_timeout(800)
    pg.select_option('#tSt',''); pg.wait_for_timeout(300)
    rows=[r.inner_text().replace('\n',' ').replace('\t',' | ')[:150] for r in pg.query_selector_all('#tBody tr') if 'Đã giữ' in r.inner_text() or 'Đã bỏ' in r.inner_text()]
    print('tech decisions:', rows[:2])
    print('my notices:', pg.inner_text('#tNotices').replace('\n',' / ').replace('\t',' | ')[:220])
    # ---- Consolidator sees the notice and marks it
    pg.click('#roleSeg [data-role="cons"]'); pg.click('#mainTabs [data-tab="data"]'); pg.click('#bLc'); pg.wait_for_timeout(1500)
    pg.click('#mainTabs [data-tab="notice"]'); print('notices:', pg.inner_text('#nTable').replace('\n',' / ').replace('\t',' | ')[:330])
    Q[:]=['Checked layout rev 3, DB updated']; pg.click('#nTable [data-nf]'); pg.wait_for_timeout(800)
    print('after mark (open filter):', pg.inner_text('#nTable').replace('\n',' / ')[:120], '| count', pg.inner_text('#nCount'))
    pg.click('#mainTabs [data-tab="prep"]'); pg.click('#pOpen'); pg.wait_for_timeout(2000)
    print('grid kept row:', pg.evaluate("PS.rows.filter(x=>x.status!=='PENDING'&&x.status!=='AUTO_SKIP').map(x=>x.line+' '+x.to+' '+x.status+' prep '+x.prep+' eff '+x.eff+' '+x.flags.join(','))"))
    # ---- IE Tech sees the answer
    pg.click('#roleSeg [data-role="tech"]'); pg.click('#tConnect'); pg.wait_for_timeout(1200)
    print('my notices now:', pg.inner_text('#tNotices').replace('\n',' / ').replace('\t',' | ')[:260])
    pg.click('[data-lang="en"]'); pg.wait_for_timeout(300); print('EN title:', pg.inner_text('#techView h3'))
    print('dialogs:', dlg); print('ERR', errs); b.close()
