# CLAUDE.md: project handoff for Claude Code

Read this file first. It carries the context of a long design/build session (Claude chat) that produced everything in this repo.

## 1. What this is

Two **static, offline, single-file web tools** (Chrome/Edge only, File System Access API) for the Industrial Engineering (IE) team of a garment factory in Vietnam. The user (Max, IE) is not a professional developer; he rolls tools out to a team by sharing files, now moving to GitHub Pages.

| Tool | File | Version | Who uses it |
|---|---|---|---|
| **Layout Check** (LC) | `layout-check/LayoutCheck.html` (+ `xlsx.full.min.js` next to it) | V4.3.2 | IE officers check a style's layout machine list against the MACHINE DATABASE; IE Báo cáo máy (consolidator) fixes the database; IE Tech fixes layouts; Supervisor tracks |
| **IE Báo cáo máy** (IBM) | `ie-bao-cao-may/IE_BaoCaoMay.html` (built from `src/ie-bao-cao-may`) | v7.9 | (a) updates MACHINE DATABASE from scanned layouts + costing, (b) machine shortage analysis by day, (c) prep (changeover) machines: proposal -> IE Tech review -> close report, activity log |

Weekly process: layouts sit in share folders; `MC_report.xlsx` runs Power Query over `TransformedMasterPlan.xlsx` (sheet `MasterPlan-Full`) plus the MACHINE DATABASE (an Excel table that **must stay named `Table1`**) via MACHINE GROUP, producing MACHINE BY LINE and MISSING STYLES. Costing is used for styles with no layout. Only D lines run 48HC (the suffix is part of the style name).

**Privacy rule: no company data in this repo and no network calls in the tools.** Layouts, MC Report, plans, the shared `data` folder (check results) stay on the user's PCs/share. The tools only read/write local folders chosen by the user. Keep `.gitignore` as is. The only external URL is a CDN *fallback* for SheetJS in LC (local copy is first); keep `xlsx.full.min.js` next to `LayoutCheck.html`.

## 2. Repository map and commands

```
layout-check/            LayoutCheck.html is edited DIRECTLY (single file, no build)
ie-bao-cao-may/          IE_BaoCaoMay.html is GENERATED (do not hand-edit) + guides + PowerQuery/*.pq
src/ie-bao-cao-may/      sources: core.js i18n.js worker.js logic.js prep.js app.js prepui.js techui.js residui.js closeact.js tabs.js tpl.html VERSION
vendor/                  SheetJS (reads xlsx), ExcelJS (writes coloured xlsx) + licences
tools/build_ie_bao_cao_may.py   python3 tools/build_ie_bao_cao_may.py   -> regenerates the HTML (inlines libs, version tag)
tests/                   Playwright (python) harnesses, see section 7
index.html               landing page for GitHub Pages;  update.bat = `git pull` for the shared-folder option
logo.png icon.png         Crystal logo (copied from the Time Study app) used by index.html and manual/*.html
manual/                  User manuals (Vietnamese, HTML, hand-written) with screenshots in manual/img/ (taken from SYNTHETIC demo data by tools/manual_shots/, see its README); linked from index.html
```

Release routine for IBM: edit `src/...` -> bump `src/ie-bao-cao-may/VERSION` -> `python3 tools/build_ie_bao_cao_may.py` -> `node --check` each src JS -> run smoke/regression tests -> update `manual/ie-bao-cao-may.html` (and retake screenshots if the UI changed, `tools/manual_shots/README.md`), `CHANGELOG.md`, `index.html` version tag -> commit/push. For LC: edit the HTML, change the `#verTag` text, update `manual/layout-check.html`, `CHANGELOG.md` and `index.html`.

## 3. Style of work the user expects

- UI texts in Vietnamese (plain formal administrative prose) with an English dictionary too (both in the in-file i18n). Guides in Vietnamese.
- Concise, actionable replies; step-by-step instructions. State what was tested and what could not be tested.
- Always test in a real browser (Playwright) with mocked folder access; report honest limits (e.g. headless Chromium has no PDF viewer).
- Every new feature: both languages, guide update, no external requests, light/dark theme via the same CSS tokens as Layout Check (IBM copies LC's palette exactly).

## 4. Shared data folder protocol (the same `data` folder for both tools)

Written by LC: `validations/*.json` (one per check: `valId, style, status PASS|ACCEPTED|FAIL, pu, user, role, savedAt, layoutFiles, layoutSheets, layoutType, selfCheck, details[{machine,group,db,lay,diff,result}], groupDiffCount, comment, manualPdf, manualRows`), `variations/*.json` (actions such as `LAYOUT_TO_FIX, TECH_LAYOUT_FIXED, TECH_DB_WRONG`), `activity/*.jsonl` (daily lines), `stylePlan.json` (plan snapshot), `Linemapping.xlsx` (columns Line, PU; **the only source of PU names in LC**).
Written by IBM: `approvals/*.json` ("Đã duyệt" notes, `status:'APPROVED'`, never counted as an IE check) and everything under `prep/`:
`proposals` (`{at,by,groups,from,rows[],grid{group:{days,avail,parts,lines}},groupMap}`), `reviews` (IE Tech decisions; **key = `line|fromStyle|toStyle|group`**, no date; fields `decision KEEP|ADJUST|REMOVE, qty, qtyBActual, loadDateActual, prepDays, reason, loadDate, qtyB, proposedQty, by, at`), `shared` (style pairs sharing a layout `{styles:[A,B]}`), `notices` + `noticeres` (IE Tech variation notices and answers), `complete` (IE Tech "Hoàn tất duyệt"), `closed` (Consolidator close records), `lineends` (`{line,style,endDate,planEnd,by,at}`), `rules.json` (`{ratios,days,daysBy}`). `actions` (shortage actions of the Consolidator, **one file per change, latest per `id` wins**: `{id,group ('*' for DELAY),type RENT|BUY|BORROW|DELAY|OTHER,qty,from,to,pu,line,style,n,status PLANNED|CONFIRMED|CANCELLED,note,by,at}`; DELAY = line + style + n working days). `proposals` also carry `dbBasis` (`{overlay,at,by,styles[]}` when the demand included changes approved but not yet in the MC Report).
Also written by IBM: `machinedb/scanstate.json` (layout hashes) and `machinedb/keeps.json` (`{version:1, items:{styleKey:{name,by,at,fps[]}}}`: "keep current data" confirmations of the Cập nhật CSDL tab; `fps` = content fingerprints (`type:machine:qty;...`) of every scanned layout/costing option at confirmation time, `dbFp` = fingerprint of the style's database data; without the data folder the same JSON lives in localStorage `mdb_keeps`).
Browser-side state: IBM keeps folder/file handles in IndexedDB `iebaocaomay` (KV) and small settings in localStorage (`mdb_name, mdb_role, mdb_lang, mdb_tpu, mdb_tlines, mdb_tgroup, mdb_pus, mdb_laypath`). LC keeps handles in IndexedDB `layoutcheck`/`kv`. These are per browser origin (file:// vs github.io differ: users re-pick folders once).

## 5. Architecture notes

**IBM** is plain ES5-style global functions concatenated into one HTML by `tools/build_ie_bao_cao_may.py` (no bundler/modules). `tpl.html` has `/*__NAME__*/` placeholders; `core.js` is also embedded as text to build the Web Worker (`worker.js`) that scans layout files in parallel.
- `core.js` workbook extraction (layout machine tables, Man-Machine files, style name parsing, hidden sheets and sheets named like `F T S C`/`F-S-T-C` are skipped), `logic.js` review items/costing/Layout Check link (`loadLayoutCheck`, `applyLayoutCheck`, comparison **by machine group totals** `sameGroups`), `app.js` Data tab + scan + review UI + save/export + remembered connections, `prep.js` pure prep/demand logic (`buildDemand` = plan x MACHINE DATABASE per group, `rankGroups`, `buildPrep`, `applyReviews`, `groupGrid`, `shiftProduction`, line-end helpers), `prepui.js` Shortage & prep tab + Excel export (ExcelJS), `techui.js` IE Tech role (grid, drawer, layout viewer/finder, notices, completion), `residui.js` residual shortage after IE Tech's review (Consolidator tab "Thiếu máy còn lại" + read-only Supervisor role): summary per machine group, daily detail, action log, what-if delay (calculation = `groupModel`/`shortSummary`/`actionCover`/`delayModel` in `prep.js`, shared with the IE Tech grid), `closeact.js` close report + Activity tab, `tabs.js` tab controller, `i18n.js` dictionaries.
- Role switch (Consolidator / IE Tech) in the header; IE Tech sees only its screen.
- **i18n pitfall:** within a language block, a key defined later in the block overrides an earlier one; new keys were inserted at the top of the block, so never reuse an existing key name (grep first).
- **Script-order pitfall:** the main script runs before DOM that appears after it; elements must be above the script or be initialised after load.

**LC** is one HTML file (CSS+JS inline, own `I18N`). Key concepts: stages `CHECK / RECHECK / CONS / TECH / DONE` computed by `styleStages`; comparison by machine group (`grpKey`, `groupTotals`, `checkGroups`); variations built by `buildVariations`, PU of a variation = PU of the style's first lines in the *current* Linemapping (`varPUs`), not the PU saved in the record; PDF-only layouts via a manual entry card (`openPdfHandle`, `pdfCard`, docked `#pdfPane`); PU lists from Linemapping (`fillPuSelects`, `refreshPuList`).

## 6. Business rules decided with the user (do not change without asking)

- Style names: parsed from layout cells B3, D3, D4, B11 and file name; combined forms expanded (`3801.3802.3803`, `3901.04`, `00115_116_117`, line breaks). Variant (48HC/16HC/ln) from layout text, file name/folder, else the plan. Special customer codes (SP..., S2xxx, F2xxx, DS...) kept as written. Compare styles ignoring size suffix `(XX)` only where code says so (`baseKey`).
- Source priority: layout first (Bulk before Initial, higher OBD, newer file); costing only for styles with no layout and no data (48 / total SAM x operation SAM, operations 31-97, 100, 103, 116; rounding: decimal <= 0.20 down else up, min 1; 24 variant for non-48HC); manual data (REMARK other than `sx`: IETL, SMS, PDF, tt, E) is locked. **The REMARK `sx` = layout data assumption is not confirmed by the user.**
- Only the rows with the LATEST DATE per style in MACHINE DATABASE are used (both tools).
- "Giữ dữ liệu hiện tại" in Cập nhật CSDL can be **confirmed** (✓ then "Xác nhận giữ", or ticked when pressing Lưu): the style moves to the card "Đã xác nhận giữ" and comes back under "Cần duyệt" **only when the content (machines and quantities) of its layout/costing options changes, or its database data (`current` set) changes** (new modified time or formatting alone does not); the old confirmation is then cleared (also from keeps.json) and a note says who confirmed and when. "Hủy xác nhận" undoes it. Not possible for a style with no current data; not applied to Layout Check driven items (`fromLc`, hold).
- Layout vs database is decided **by machine group** (database lists groups, layouts list machine codes). Matching group totals may be saved Đạt. Layout whose bottom machine list differs from its operation table (big layout split into small ones) is a warning only.
- A style is confirmed only when an IE officer saves Đạt/Chấp nhận in LC. IBM never writes Đạt; it writes "Đã duyệt" notes. Fail loop: IE Fail -> IE Báo cáo máy (database or layout?) -> IE Tech (layout to fix) -> IE re-check; after 2 rounds flagged to Supervisor. Existing "Đạt" records are never rewritten.
- PDF-only layouts: typed/pasted list + mandatory tick "đã đối chiếu từng dòng" for Đạt/Chấp nhận.
- Prep (changeover) machines: only for machine groups the Consolidator picks as potentially short; prep = ROUNDUP(ratio x next style's machines of that group) on the N working days (default 3, Sundays skipped) before loading; default ratios BT1M 50 %, others 0; no prep when both styles share a layout file, the pair is in the "same layout" list, or IE Tech removes it; first plan day of a line = already running (no prep). Grids and totals show working days only (no Sundays); export writes removed prep as 0 (no strikethrough).
- After "Lưu MACHINE DATABASE" the shortage report **counts the approved changes at once** (overlay `REF.dbOver` / `effDb()`, not written anywhere; label "gồm N thay đổi vừa duyệt"); a proposal sent meanwhile records `dbBasis` and IE Tech sees a note. The overlay disappears when the MC Report (pasted Table1 + Refresh All) is loaded again.
- "Thiếu máy còn lại" (decided with the user): residual shortage per machine group after IE Tech's decisions, same numbers as the IE Tech grid footer (`groupModel`); horizontal tables like the IE Tech grid with chips for machine groups / PU and the buttons "Chỉ ngày thiếu" (first..last short day of each group, days with enough machines between two short periods stay) / "Cả kế hoạch"; negative cells light red + red text (also in the IE Tech grid). **Each machine group that is short has its own action panel under its table** (Thuê / Mua / Mượn / Khác(+/- machines) / **Dời kế hoạch**); anything typed in the panel shows its result **at once** as "Xem thử" rows in the table and a result line (worst gap and days short before -> after, other groups changed by a date move). The date move is in the same panel: choose line, style and a **new loading date** (snapped to a working day; n = working days between the current and the new loading day); it moves **the whole line** (that style and every style after it; the previous style keeps running; prep moves) in every machine group that uses the line. Actions are recorded by the **Consolidator** in `data\prep\actions`; Đã chốt and Dự kiến are separate rows; the Supervisor role is **read-only** (can try actions in the panels, cannot save). A confirmed date move counts **only while the plan still shows the style at its old date**; once the new plan shows it at/after the target date it is marked "Đã vào kế hoạch" and not counted again (`delayApplied`). When every action is confirmed a **summary card** is generated (KPI tiles, one card per machine group with before/after, progress bar and actions, one card per PU; groups/PUs without actions that are still short say "IE kiểm tra thêm"; Excel export).
- Layout Check re-reads the Machine Database file when its modified time/size changed (opening a style or layout, window focus): no false Fail from an old copy.
- Availability = MC STATUS column "MC used for PDN" summed per machine group; the formula's own signs (+ in house/rent/borrow, - broken/lend/TRA/PDC/strapline...) are read from the cell formula and shown as detail.
- IE Tech may keep/adjust/remove, change the loading date (production on the line moves with it), set prep days, set layout quantity (notifies the Consolidator), change the end date of the running style (applies to all groups of the line), mark "same layout" (remembered by style pair, applied to all groups/lines), and press "Hoàn tất duyệt". Decisions carry to next week when the line's style sequence is unchanged.
- PU2 was split into "PU2 Sport" (lines K, J, B) and "PU2 Intimate" (G, H); PU names must come from data (Linemapping / PU LIST), never hard-coded.

## 7. Tests

`tests/ie-bao-cao-may/*.py|js` and `tests/layout-check/*.py|js` are the Playwright (python) and node harnesses used during development. They are **reference harnesses, not turnkey**: they read company sample files (`MC_report.xlsx`, `TransformedMasterPlan*.xlsx`, a layout folder, `Linemapping.xlsx`, `CheckMc`) that are NOT in the repo, and paths point to the old sandbox (`/mnt/user-data/uploads`, `/tmp/t3`, `/tmp/lct`). Ask the user for anonymised samples and adapt paths.
- IBM tests mock the File System Access API with `fsmock*.js` (in-memory FS from base64) and run the page from `file://`.
- LC tests use an OPFS shim (`opfs.js`) and a small static server (`srv.py`); headless Chromium crashes when real OPFS handles are stored in IndexedDB, so tests replace the page's `idb` helper by an in-memory object.
- Some old LC scenarios assume a plan week that is "this week" and fail later because of the date, not because of the code.
- Headless Chromium has no PDF viewer: the docked PDF column stays blank in tests.
- `node tests/ie-bao-cao-may/tprep*.js` check the pure prep logic against the real MC Report.
- `node tests/ie-bao-cao-may/tresid.js` (pure shortage functions, hand-calculated), `python3 tests/ie-bao-cao-may/overlay_demand.py`, `python3 tests/ie-bao-cao-may/residual_shortage.py`, `python3 tests/layout-check/db_refresh.py` are **turnkey** (synthetic demo data, harness `tests/sim/simlib.py`).
- `python3 tests/ie-bao-cao-may/keep_confirm.py` is a **turnkey** test (synthetic demo data from `tools/manual_shots/make_demo_data.py`, harness `tests/sim/simlib.py`: shared "network drive" on disk, one browser per person, faked clock): checks the "Xác nhận giữ" flow of v7.9. Needs `pip install playwright openpyxl`, and the built `ie-bao-cao-may/IE_BaoCaoMay.html`.

## 8. Pitfalls learned (save yourself time)

- Patching HTML/JS by exact-string replacement: assert match counts; never append a `// comment` to a line that also holds code that follows on the same line; python `"\""` becomes `"` (anchors differ from the file's escaped text).
- Re-rendering by `innerHTML` resets scroll (fixed for IE Tech grid in `techRender`; keep the pattern for new grids).
- The 52-byte `Open LayoutCheck.bat` only opens the HTML; nothing needs a server.
- GitHub Pages sites are public even for private repos unless on Enterprise Cloud; the tools contain no data, but the logic is visible.

## 9. Open items / backlog

1. Confirm with the user: REMARK `sx` rule; costing Power Query and first-refresh settings were never tested against SQL Server (formula verified on 3 styles only).
2. Alias table for non-standard style names (83 files had no parsable style).
3. IE Tech loading-date edits are stored per row (machine group); end-date edits are per line/style. Consider making loading date per changeover. The planned end date shown comes from the machine group being viewed.
4. IBM re-reading a PDF-based LC check shows a "file not found" note when a scanned candidate exists for that style.
5. Manuals describe v7.9 / V4.3.2. After UI changes retake the screenshots (tools/manual_shots/README.md) and update the text in manual/*.html.
6. Consider backing up the shared `data` folder (check history lives only there).
7. Deferred by the user: consistency of IE Tech approvals after a mid-week plan change (Consolidator screen shows "Đã giữ, ngày thay đổi" while IE Tech's screen shows pending/overdue; "Hoàn tất duyệt" is not re-opened when a proposal is re-sent; close report counts differ). See the week simulation notes in the conversation history.
8. Optional: automated version display on `index.html` and a CI smoke test (page loads without errors, `node --check` on sources).

## 10. First steps in Claude Code

1. `python3 tools/build_ie_bao_cao_may.py` and confirm it reproduces `ie-bao-cao-may/IE_BaoCaoMay.html` without a diff.
2. Open both HTML files in Chrome (from the repo folder) and check the version tags (`v7.9`, `V4.3.2`).
3. Ask the user for the sample data and set up the test harness paths before changing behaviour.
