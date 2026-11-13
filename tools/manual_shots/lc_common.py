"""Shared helpers for the Layout Check screenshot scripts (OPFS shim + local static server)."""
import base64, functools, http.server, os, pathlib, socketserver, threading

HERE = pathlib.Path(__file__).resolve().parent
def serve(root, port=8799):
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    s = socketserver.ThreadingTCPServer(('127.0.0.1', port), functools.partial(Q, directory=str(root))); s.daemon_threads = True
    threading.Thread(target=s.serve_forever, daemon=True).start(); return s
def put(pg, path, src):
    data = base64.b64encode(open(src, 'rb').read()).decode()
    pg.evaluate("""async ([p,b]) => { const parts=p.split('/'); const name=parts.pop(); const d=await window.__dir(parts.join('/'));
      const fh=await d.getFileHandle(name,{create:true}); const w=await fh.createWritable(); await w.write(Uint8Array.from(atob(b),c=>c.charCodeAt(0))); await w.close(); }""", [path, data])
def put_tree(pg, base, prefix):
    for root, _, files in os.walk(base):
        for f in files:
            p = pathlib.Path(root) / f; put(pg, prefix + '/' + str(p.relative_to(base)).replace(os.sep, '/'), p)
def login(pg, name, role, pu, first=False, snap=None):
    if not first: pg.click('#btnLogout'); pg.wait_for_selector('#login:not([hidden])'); pg.wait_for_timeout(300)
    pg.fill('#lgName', name); pg.click(f'[data-role="{role}"]'); pg.select_option('#lgPU', pu)
    if first:
        pg.click('#lgDirBtn'); pg.wait_for_timeout(700); pg.evaluate("window.__pick='MC_report.xlsx'"); pg.click('#lgDbBtn'); pg.wait_for_timeout(700); pg.click('#lgLayBtn'); pg.wait_for_timeout(700)
    if snap: snap()
    pg.click('#lgStart'); pg.wait_for_selector('#login[hidden]', state='attached', timeout=15000); pg.wait_for_timeout(1200)
def stub_idb(pg):
    """Headless Chromium crashes when OPFS handles are stored in IndexedDB: keep them in memory instead."""
    pg.evaluate("window.__MEM={}; idb.get=async k=>window.__MEM[k]; idb.set=async (k,v)=>{window.__MEM[k]=v;};")
