#!/usr/bin/env python3
"""Build layout-sim/LayoutSim.html (one offline file) from src/layout-sim + vendor libraries (SheetJS, three.js).

Usage:  python3 tools/build_layout_sim.py
Version is read from src/layout-sim/VERSION and shown in the page header.
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, VENDOR = ROOT / 'src' / 'layout-sim', ROOT / 'vendor'
OUT = ROOT / 'layout-sim' / 'LayoutSim.html'
PARTS = [('XLSX', VENDOR / 'xlsx.full.min.js'), ('THREE', VENDOR / 'three.min.js'), ('I18N', SRC / 'i18n.js'), ('LIB', SRC / 'lib.js'),
         ('MODEL', SRC / 'model.js'), ('PLAN2D', SRC / 'plan2d.js'), ('VIEW3D', SRC / 'view3d.js'), ('APP', SRC / 'app.js')]

def main():
    html = (SRC / 'tpl.html').read_text(encoding='utf-8')
    for name, path in PARTS:
        code = path.read_text(encoding='utf-8')
        if name in ('XLSX', 'THREE'):
            code = code.replace('<!--', '<\\!--')
        if '</script' in code.lower():
            sys.exit('ERROR: "</script" found in %s' % path.name)
        marker = '/*__%s__*/' % name
        if marker not in html:
            sys.exit('ERROR: placeholder %s missing in tpl.html' % marker)
        html = html.replace(marker, code)
    version = (SRC / 'VERSION').read_text(encoding='utf-8').strip()
    html = html.replace('{{VERSION}}', version)
    if '/*__' in html:
        sys.exit('ERROR: unreplaced placeholder left in the output')
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print('built %s (v%s, %d KB)' % (OUT.relative_to(ROOT), version, len(html) // 1024))

if __name__ == '__main__':
    main()
