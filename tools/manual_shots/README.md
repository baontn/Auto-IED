# Manual screenshots

The screenshots in `manual/img/` are taken from **synthetic demo data** (fake styles `DMO26-…`, fake lines). No company data is used.

```
pip install playwright openpyxl pillow          # Chromium: set CHROME in the scripts (default /opt/pw-browsers/chromium)
python3 tools/manual_shots/make_demo_data.py  /tmp/demo
python3 tools/manual_shots/shots_lc.py        /tmp/demo /tmp/shots_lc     # also exports /tmp/demo/lcdata (the data folder written during the run)
python3 tools/manual_shots/shots_ibm.py       /tmp/demo /tmp/shots_ibm    # re-uses /tmp/demo/lcdata; needs ie-bao-cao-may/IE_BaoCaoMay.html built
```
The scripts drive the real pages with Playwright (OPFS shim `opfs.js` for Layout Check, in-memory folder mock `fsmock.js` for IE Báo cáo máy).
Then pick/crop/compress the images you need into `manual/img/` (palette-quantised PNG, about 2 MB in total).
Demo dates follow the current week, so re-run everything together. Headless Chromium has no PDF viewer when it is the headless shell; the PDF pane of Layout Check may stay blank.
