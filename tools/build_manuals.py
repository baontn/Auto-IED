#!/usr/bin/env python3
"""Build readable HTML manuals (manual/*.html) from the plain-text guides.

Usage:  python3 tools/build_manuals.py
The .txt guides stay the source of truth; edit them, then re-run this script.
"""
import html, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'manual'
# (output name, source txt, page title, language, back-link text)
PAGES = [
    ('layout-check.html', 'layout-check/HUONG_DAN.txt', 'Layout Check: Hướng dẫn sử dụng', 'vi'),
    ('ie-bao-cao-may.html', 'ie-bao-cao-may/HUONG_DAN.txt', 'IE Báo cáo máy: Hướng dẫn sử dụng', 'vi'),
    ('ie-bao-cao-may-en.html', 'ie-bao-cao-may/README_EN.txt', 'IE Báo cáo máy: User guide (English)', 'en'),
    ('ie-bao-cao-may-changes.html', 'ie-bao-cao-may/CAP_NHAT_SO_VOI_v7.4.txt', 'IE Báo cáo máy: Các thay đổi so với v7.4', 'vi'),
]
CSS = """:root{--bg:#f1f1ef;--panel:#fff;--text:#091d36;--muted:#5f6670;--line:#e2e2e2;--accent:#0058a0;--red:#ed1c24}
@media (prefers-color-scheme:dark){:root{--bg:#06142a;--panel:#0d2140;--text:#e8edf3;--muted:#9fb0c4;--line:#1f3858;--accent:#5e9fe0;--red:#ff5a5f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 "Segoe UI",Roboto,Arial,sans-serif}
header{display:flex;gap:10px;align-items:center;padding:8px 16px;background:var(--panel);border-bottom:3px solid var(--accent);box-shadow:0 1px 0 var(--red);position:sticky;top:0}
header img{height:28px;width:auto}header b{flex:1;font-size:16px}header a{color:var(--accent);font-weight:600;text-decoration:none}
main{max-width:900px;margin:0 auto;padding:16px}
article{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 18px}
pre{margin:0;white-space:pre-wrap;word-wrap:break-word;font:inherit}
h2{font-size:16px;margin:18px 0 4px;color:var(--accent);border-bottom:1px solid var(--line);padding-bottom:3px}
h1{font-size:19px;margin:0 0 6px}.sub{color:var(--muted)}"""
H2 = re.compile(r'^(?:[IVX]+|[A-Z])\.\s+\S')       # "I. TITLE" / "A. TITLE"

def render(text):
    lines = text.replace('﻿', '').replace('\r\n', '\n').split('\n')
    out, buf, title_done = [], [], False
    def flush():
        if buf:
            out.append('<pre>' + html.escape('\n'.join(buf).strip('\n')) + '</pre>'); buf.clear()
    for i, ln in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else ''
        if re.fullmatch(r'[=\-─]{5,}\s*', ln):        # decorative rule lines
            continue
        if not title_done and ln.strip():
            flush(); out.append('<h1>' + html.escape(ln.strip()) + '</h1>'); title_done = True; continue
        if (H2.match(ln) and ln.strip() == ln and len(ln) < 90) or re.fullmatch(r'[=\-─]{5,}\s*', nxt) and ln.strip() and not ln.startswith(' '):
            flush(); out.append('<h2>' + html.escape(ln.strip()) + '</h2>'); continue
        buf.append(ln)
    flush()
    return '\n'.join(out)

def main():
    OUT.mkdir(exist_ok=True)
    for name, src, title, lang in PAGES:
        body = render((ROOT / src).read_text(encoding='utf-8'))
        back = 'Home' if lang == 'en' else 'Trang chủ'
        page = ('<!doctype html>\n<html lang="%s"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
                '<title>%s</title><link rel="icon" href="../icon.png"><style>%s</style></head><body>\n'
                '<header><img src="../logo.png" alt="Crystal" onerror="this.remove()"><b>%s</b><a href="../index.html">&larr; %s</a></header>\n'
                '<main><article>\n%s\n</article></main></body></html>\n') % (lang, html.escape(title), CSS, html.escape(title), back, body)
        (OUT / name).write_text(page, encoding='utf-8')
        print('built manual/%s (%d KB)' % (name, len(page) // 1024))

if __name__ == '__main__':
    main()
