import sys; sys.path.insert(0,'/tmp/lct')
import srv; PORT=srv.start()
from playwright.sync_api import sync_playwright
import base64
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1300,'height':900}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(open('/tmp/lct/opfs.js').read())
    pg.goto(f'http://127.0.0.1:{PORT}/LayoutCheck_v42.html')
    print('before (fallback):', pg.evaluate("[...document.querySelectorAll('#lgPU option')].map(o=>o.value)"))
    # put the split line mapping in the data folder, remember that folder, and reload the page
    pg.evaluate("""async () => {
      const d = await window.__dir('data');
      const h = await d.getFileHandle('Linemapping.xlsx', {create:true}); const w = await h.createWritable();
      await w.write(Uint8Array.from(atob(window.__LM), c=>c.charCodeAt(0))); await w.close();
    }""", ) if False else None
    data=base64.b64encode(open('/tmp/lct/Linemapping_split.xlsx','rb').read()).decode()
    pg.evaluate("""async (b) => {
      const d = await window.__dir('data');
      const h = await d.getFileHandle('Linemapping.xlsx', {create:true}); const w = await h.createWritable();
      await w.write(Uint8Array.from(atob(b), c=>c.charCodeAt(0))); await w.close();
      window.__mem.dataDir = d;
    }""", data)
    pg.evaluate("refreshPuList()"); pg.wait_for_timeout(800)
    print('after reading Linemapping (login list):', pg.evaluate("[...document.querySelectorAll('#lgPU option')].map(o=>o.value)"))
    print('check / filter lists:', pg.evaluate("[...document.querySelectorAll('#pu option')].map(o=>o.value)"), pg.evaluate("[...document.querySelectorAll('#vPU option')].map(o=>o.value)"))
    print('ERR', errs); b.close()
