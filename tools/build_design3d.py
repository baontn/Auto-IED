#!/usr/bin/env python3
"""Build design3d/Design3D.html (one offline file) from src/design3d + vendor/three.min.js + vendor/clipper.js + logo.png (inlined as data URI).

Usage:  python3 tools/build_design3d.py
"""
import base64, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, VENDOR = ROOT / 'src' / 'design3d', ROOT / 'vendor'
OUT = ROOT / 'design3d' / 'Design3D.html'
PARTS = [('THREE', VENDOR / 'three.min.js'), ('CLIPPER', VENDOR / 'clipper.js'), ('I18N', SRC / 'i18n.js'), ('MODEL', SRC / 'model.js'), ('GEOM', SRC / 'geom.js'),
         ('SCENE', SRC / 'scene.js'), ('DRAW2D', SRC / 'draw2d.js'), ('PDF', SRC / 'pdf.js'), ('CAD', SRC / 'cad.js'), ('TRACE', SRC / 'trace.js'), ('PROJECT', SRC / 'project.js'), ('APP', SRC / 'app.js')]

def main():
    html = (SRC / 'tpl.html').read_text(encoding='utf-8')
    for name, path in PARTS:
        code = path.read_text(encoding='utf-8')
        if name in ('THREE', 'CLIPPER'):
            code = code.replace('<!--', '<\\!--')
        if '</script' in code.lower():
            sys.exit('ERROR: "</script" found in %s' % path.name)
        marker = '/*__%s__*/' % name
        if marker not in html:
            sys.exit('ERROR: placeholder %s missing in tpl.html' % marker)
        html = html.replace(marker, code)
    logo = 'data:image/png;base64,' + base64.b64encode((ROOT / 'logo.png').read_bytes()).decode('ascii')
    html = html.replace('{{LOGO}}', logo)
    version = (SRC / 'VERSION').read_text(encoding='utf-8').strip()
    html = html.replace('{{VERSION}}', version)
    if '/*__' in html:
        sys.exit('ERROR: unreplaced placeholder left in the output')
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print('built %s (v%s, %d KB)' % (OUT.relative_to(ROOT), version, len(html) // 1024))

if __name__ == '__main__':
    main()
