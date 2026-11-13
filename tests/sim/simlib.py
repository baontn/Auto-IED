"""Simulation harness: a shared 'network drive' on disk + one browser context per person/tool.
Used by tests/ie-bao-cao-may/keep_confirm.py. Needs: pip install playwright openpyxl; Chromium at $CHROME (default /opt/pw-browsers/chromium)."""
import sys, os, json, base64, pathlib, shutil, datetime as dt, tempfile
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'manual_shots'))
from lc_common import serve, put as lc_put, put_tree, login as lc_login_raw, stub_idb, HERE
from playwright.sync_api import sync_playwright
import openpyxl
from openpyxl import Workbook

SHARE = None      # shared drive (disk truth): data/ lay/ MC_report.xlsx plan.xlsx Linemapping.xlsx
LOG = []          # observations
def say(who, what): print(f'  [{who}] {what}'); LOG.append((who, what))

def setup(world, out):
    global SHARE
    SHARE = pathlib.Path(out) / 'share'; shutil.rmtree(SHARE, ignore_errors=True); (SHARE / 'data').mkdir(parents=True)
    shutil.copytree(world / 'lay', SHARE / 'lay')
    for n in ('MC_report.xlsx', 'TransformedMasterPlan.xlsx', 'Linemapping.xlsx'): shutil.copy(world / n, SHARE / n)
    shutil.copy(world / 'Linemapping.xlsx', SHARE / 'data' / 'Linemapping.xlsx')
    stage = pathlib.Path(tempfile.mkdtemp())
    for f in ['LayoutCheck.html', 'xlsx.full.min.js']: shutil.copy(ROOT / 'layout-check' / f, stage / f)
    serve(stage)

def b64(p): return base64.b64encode(pathlib.Path(p).read_bytes()).decode()

# ---------------- Layout Check person ----------------
class LC:
    def __init__(self, br, name, role, pu):
        self.name, self.role, self.pu = name, role, pu
        self.pg = br.new_page(viewport={'width': 1400, 'height': 900}); self.errs = []
        self.pg.on('pageerror', lambda e: self.errs.append(str(e))); self.pg.on('dialog', lambda d: d.accept(getattr(self, 'prompt', 'ok')))
        self.pg.add_init_script((HERE / 'opfs.js').read_text()); self.pg.add_init_script("window.__prompt='';")
        self.first = True
    def goto(self, when):
        self.pg.clock.set_system_time(when)
        if self.first: self.pg.goto('http://127.0.0.1:8799/LayoutCheck.html'); self.pg.wait_for_timeout(500); stub_idb(self.pg)
    def pull(self):             # open the shared drive: copy truth into this PC's view (OPFS stands for the network drive)
        for rel in ['data', 'lay']:
            base = SHARE / rel
            for root, _, files in os.walk(base):
                for f in files: p = pathlib.Path(root) / f; lc_put(self.pg, rel + '/' + str(p.relative_to(base)).replace(os.sep, '/'), p)
        lc_put(self.pg, 'pick/MC_report.xlsx', SHARE / 'MC_report.xlsx'); lc_put(self.pg, 'pick/plan.xlsx', SHARE / 'TransformedMasterPlan.xlsx')
    def push(self):
        files = self.pg.evaluate("""async () => { const out=[]; async function walk(d, pre){ for await (const [n,h] of d.entries()){ if(h.kind==='directory') await walk(h, pre+n+'/');
            else { const b=new Uint8Array(await (await h.getFile()).arrayBuffer()); let s=''; for(let i=0;i<b.length;i+=8192) s+=String.fromCharCode.apply(null,b.subarray(i,i+8192)); out.push([pre+n, btoa(s)]); } } }
          await walk(await window.__dir('data'), ''); return out; }""")
        for rel, d in files:
            f = SHARE / 'data' / rel; f.parent.mkdir(parents=True, exist_ok=True)
            if not f.exists() or f.read_bytes() != base64.b64decode(d): f.write_bytes(base64.b64decode(d))
    def login(self):
        pg = self.pg
        if not self.first:
            if pg.query_selector('#btnLogout') and pg.is_visible('#btnLogout'): pg.click('#btnLogout'); pg.wait_for_selector('#login:not([hidden])'); pg.wait_for_timeout(300)
        pg.fill('#lgName', self.name); pg.click(f'[data-role="{self.role}"]')
        if self.first:
            pg.click('#lgDirBtn'); pg.wait_for_timeout(900); pg.evaluate("window.__pick='MC_report.xlsx'"); pg.click('#lgDbBtn'); pg.wait_for_timeout(600); pg.click('#lgLayBtn'); pg.wait_for_timeout(600); self.first = False
        pg.select_option('#lgPU', self.pu)
        pg.click('#lgStart'); pg.wait_for_selector('#login[hidden]', state='attached', timeout=15000); pg.wait_for_timeout(1200)
    def session(self, when):
        self.goto(when); self.pull()
        if self.first or not (self.pg.query_selector('#btnLogout') and self.pg.is_visible('#btnLogout')): self.login()
        else: self.login()
        return self
    def listing(self): return [x.inner_text().strip().split('\n')[0] for x in self.pg.query_selector_all('#list > *') if x.inner_text().strip()]
    def load_plan(self):
        self.pg.evaluate("window.__pick='plan.xlsx'"); self.pg.click('#btnPlan'); self.pg.wait_for_timeout(2500)
    def open_style(self, key):
        self.pg.click(f'#list >> text={key}'); self.pg.wait_for_timeout(1000)
    def open_layout(self, rel):
        lc_put(self.pg, 'pick/' + pathlib.Path(rel).name, SHARE / 'lay' / rel); self.pg.evaluate("n=>window.__pick=n", pathlib.Path(rel).name)
        self.pg.click('#btnOpenLayout'); self.pg.wait_for_timeout(2200)
    def result_text(self): return self.pg.inner_text('#step3, .card:has(h3:has-text("Kết quả"))')[:300].replace('\n', ' | ') if self.pg.query_selector('.card') else ''

# ---------------- IE Bao cao may person ----------------
class IBM:
    def __init__(self, br, name, role='cons'):
        self.name, self.role = name, role
        self.pg = br.new_page(viewport={'width': 1450, 'height': 950}, accept_downloads=True); self.errs = []
        self.pg.on('pageerror', lambda e: self.errs.append(str(e))); self.dlg = []
        self.pg.on('dialog', lambda d: d.accept(self.dlg.pop(0) if (d.type == 'prompt' and self.dlg) else ''))
        fs = {}
        for rel in ['data', 'lay']:
            base = SHARE / rel
            for root, _, files in os.walk(base):
                for f in files: p = pathlib.Path(root) / f; fs[rel + '/' + str(p.relative_to(base)).replace(os.sep, '/')] = b64(p)
        init = "window.__FS={};" + "".join(f"window.__FS[{json.dumps(k)}]=Uint8Array.from(atob('{v}'),c=>c.charCodeAt(0));" for k, v in fs.items()) + (HERE / 'fsmock.js').read_text()
        self.pg.add_init_script(init)
    def open(self, when, html=None):
        self.pg.clock.set_system_time(when); self.pg.goto('file://' + str(html or (ROOT / 'ie-bao-cao-may/IE_BaoCaoMay.html'))); self.pg.evaluate("localStorage.clear()"); self.pg.reload(); self.pg.wait_for_timeout(500)
        self.pg.clock.set_system_time(when)
    def push(self):             # whatever IBM wrote into the shared data folder goes back to the share
        files = self.pg.evaluate("Object.keys(window.__FS).filter(k=>k.startsWith('data/')).map(k=>{const b=window.__FS[k];let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return [k,btoa(s)]})")
        n = 0
        for k, d in files:
            f = SHARE / k; raw = base64.b64decode(d)
            if not f.exists() or f.read_bytes() != raw: f.parent.mkdir(parents=True, exist_ok=True); f.write_bytes(raw); n += 1
        return n
    def pull(self):             # a shared drive shows what the others saved: copy the share's data/ into this page's in-memory folder
        files = {}
        for root, _, fs_ in os.walk(SHARE / 'data'):
            for f in fs_: pp = pathlib.Path(root) / f; files['data/' + str(pp.relative_to(SHARE / 'data')).replace(os.sep, '/')] = b64(pp)
        self.pg.evaluate("fs=>{for(const k in fs) window.__FS[k]=Uint8Array.from(atob(fs[k]),c=>c.charCodeAt(0));}", files)
    def load(self):
        pg = self.pg
        pg.set_input_files('#fFiles', [str(SHARE / 'MC_report.xlsx'), str(SHARE / 'TransformedMasterPlan.xlsx')])
        pg.click('#bLc'); pg.fill('#uName', self.name); pg.click('#bDir')
        pg.wait_for_function("!document.getElementById('go').disabled", timeout=120000); pg.wait_for_timeout(800)
    def scan(self):
        pg = self.pg; pg.click('#mainTabs [data-tab="db"]'); pg.click('#go'); pg.wait_for_selector('#step3:not([hidden])', timeout=90000); pg.wait_for_timeout(1200)
        cards = pg.locator('#step3 .views > *') if pg.locator('#step3 .views > *').count() else pg.locator('.views').first.locator('> *')
        return {i: cards.nth(i).inner_text().replace('\n', ' ') for i in range(cards.count())}
    def approve_save(self, outdir):
        pg = self.pg; pg.click('.views >> text=Cần duyệt'); pg.wait_for_timeout(500)
        pg.click('text=Duyệt tất cả mục đang hiển thị'); pg.wait_for_timeout(500)
        with pg.expect_download(timeout=20000) as dl: pg.click('text=Lưu MACHINE DATABASE')
        p = pathlib.Path(outdir) / 'saved_db.xlsx'; dl.value.save_as(str(p)); pg.wait_for_timeout(1200); return p

# ---------------- "Power Query refresh" of the MC report (what Mai does in Excel) ----------------
def paste_into_table1(saved_db):
    """Paste the MACHINE DATABASE sheet of the saved file into Table1 and Refresh All (MACHINE BY LINE = plan x database)."""
    mc = openpyxl.load_workbook(SHARE / 'MC_report.xlsx'); sv = openpyxl.load_workbook(saved_db)
    ws = mc['MACHINE DATABASE']; ws.delete_rows(1, ws.max_row)
    for row in sv['MACHINE DATABASE'].iter_rows(values_only=True): ws.append(list(row))
    refresh_mbl(mc); mc.save(SHARE / 'MC_report.xlsx')
def refresh_mbl(mc):
    groups = {r[0]: r[1] for r in list(mc['MACHINE GROUP'].iter_rows(values_only=True))[1:]}
    rows = list(mc['MACHINE DATABASE'].iter_rows(values_only=True)); h = [str(x).upper() for x in rows[0]]
    iS, iM, iQ, iD = h.index('STYLE'), h.index('MACHINE'), h.index('QUANTITY'), h.index('DATE')
    latest = {}
    for r in rows[1:]:
        if r[iS] is None: continue
        latest[r[iS]] = max(latest.get(r[iS], r[iD]), r[iD])
    db = {}
    for r in rows[1:]:
        if r[iS] is None or r[iD] != latest[r[iS]]: continue
        g = groups.get(r[iM], r[iM]); db.setdefault(r[iS], {}); db[r[iS]][g] = db[r[iS]].get(g, 0) + (r[iQ] or 0)
    ws = mc['MACHINE BY LINE']; ws.delete_rows(1, ws.max_row); ws.append(['Line', 'Date', 'GOP', 'Style No', 'MACHINE GROUP', 'Qty'])
    plan = openpyxl.load_workbook(SHARE / 'TransformedMasterPlan.xlsx')['MasterPlan-Full']
    for r in list(plan.iter_rows(values_only=True))[1:]:
        for g, q in db.get(r[2], {}).items(): ws.append([r[0], r[3], r[1], r[2], g, q])
def write_plan(plan_by_line, name='TransformedMasterPlan.xlsx'):
    wb = Workbook(); ws = wb.active; ws.title = 'MasterPlan-Full'; ws.append(['Line', 'GOP', 'Style No', 'Date'])
    for l, seq in plan_by_line.items():
        for s, a, b in seq:
            for d in range(a, b + 1):
                day = MON + dt.timedelta(days=d - 9)
                if day.weekday() == 6: continue
                ws.append([l, 'GOP-' + l, s, dt.datetime(day.year, day.month, day.day)])
    wb.save(SHARE / name)
today = dt.date.today(); MON = today - dt.timedelta(days=today.weekday())
def at(day_offset, hh=8, mm=30): d = MON + dt.timedelta(days=day_offset); return dt.datetime(d.year, d.month, d.day, hh, mm)

def attach(out):
    global SHARE
    SHARE = pathlib.Path(out) / 'share'
    stage = pathlib.Path(tempfile.mkdtemp())
    for f in ['LayoutCheck.html', 'xlsx.full.min.js']: shutil.copy(ROOT / 'layout-check' / f, stage / f)
    serve(stage); return SHARE
