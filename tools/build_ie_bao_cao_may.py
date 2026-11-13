#!/usr/bin/env python3
"""Build ie-bao-cao-may/IE_BaoCaoMay.html (one offline file) from src/ie-bao-cao-may + vendor libraries.

Usage:  python3 tools/build_ie_bao_cao_may.py
Version is read from src/ie-bao-cao-may/VERSION and shown in the page header (tag "vX.Y").
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, VENDOR = ROOT / 'src' / 'ie-bao-cao-may', ROOT / 'vendor'
OUT = ROOT / 'ie-bao-cao-may' / 'IE_BaoCaoMay.html'
# placeholder in tpl.html (/*__NAME__*/) -> file. ORDER MATTERS only for readability: each placeholder sits in its own <script>.
PARTS = [('XLSX', VENDOR / 'xlsx.full.min.js'), ('EXCELJS', VENDOR / 'exceljs.min.js'), ('CORE', SRC / 'core.js'), ('I18N', SRC / 'i18n.js'),
         ('WORKER', SRC / 'worker.js'), ('LOGIC', SRC / 'logic.js'), ('PREP', SRC / 'prep.js'), ('APP', SRC / 'app.js'), ('PREPUI', SRC / 'prepui.js'),
         ('TECHUI', SRC / 'techui.js'), ('CLOSEACT', SRC / 'closeact.js'), ('TABS', SRC / 'tabs.js')]

def main():
    html = (SRC / 'tpl.html').read_text(encoding='utf-8')
    for name, path in PARTS:
        code = path.read_text(encoding='utf-8')
        if name == 'XLSX':
            code = code.replace('<!--', '<\\!--')                   # an HTML comment opener inside a <script> would break the page
        if '</script' in code.lower():
            sys.exit('ERROR: "</script" found in %s' % path.name)
        marker = '/*__%s__*/' % name
        if marker not in html:
            sys.exit('ERROR: placeholder %s missing in tpl.html' % marker)
        html = html.replace(marker, code)
    version = (SRC / 'VERSION').read_text(encoding='utf-8').strip()
    html = html.replace('{{VERSION}}', version)
    if '/*__' in html or '{{' in html.split('<body>')[1][:4000]:
        sys.exit('ERROR: unreplaced placeholder left in the output')
    OUT.write_text(html, encoding='utf-8')
    print('built %s (v%s, %d KB)' % (OUT.relative_to(ROOT), version, len(html) // 1024))

if __name__ == '__main__':
    main()
