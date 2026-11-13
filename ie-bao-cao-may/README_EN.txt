CONSOLIDATOR TOOL (IE BAO CAO MAY) v7.8 — MACHINE DATABASE UPDATE — GUIDE
=======================================================================

CONTENTS
  IE_BaoCaoMay.html          The tool (one file, offline, Chrome or Edge)
  PowerQuery\costing_query.pq          COSTING PROPOSAL query for the MC Report
  PowerQuery\machinedb_latest_query.pq Optional: read MACHINE DATABASE from the newest saved file
  The interface is in Vietnamese and English (switch at the top right).

A. ONE-TIME SETUP IN THE MC REPORT
1. MACHINE DATABASE stays as table Table1. Do not rename it.
2. Data > Get Data > From Other Sources > Blank Query > Advanced Editor > paste costing_query.pq
   > edit the 4 settings lines > Done > name the query COSTING PROPOSAL
   > Close & Load To... > Table > New worksheet > rename the sheet COSTING PROPOSAL
3. Data > Get Data > Query Options > CURRENT WORKBOOK > Privacy > "Ignore the Privacy Levels".
4. First refresh: enter the SQL login (Database), approve the native database query (Run).

B. WEEKLY
1. MC Report: Data > Refresh All > Save.
2. Open IE_BaoCaoMay.html in Chrome or Edge.
3. Step 1: "Choose Excel files..." - select MC Report, Master plan and last week's saved file together
   (recognised automatically). "Choose layout folder..." - pick the layout root folder.
4. Step 2: Start. Layouts are scanned first; styles without a layout use costing.
5. Step 3: review.
   To review      New or different data, sorted by loading date. Choose the source in the dropdown
                  (another layout, costing, or keep current). Machines: green = added,
                  amber = quantity changed (old -> new), red struck = removed. Tick rows or "Approve all shown".
   Still missing  Planned styles with no layout, no costing and no database data.
   Data issues    Fix at the source; duplicated database rows can be fixed here.
   No change      Layout matches the database.
   Scan log       Result per file.
6. "Save MACHINE DATABASE" (bottom bar) -> MACHINE_DATABASE_yyyymmdd_hhmm.xlsx
7. Paste its MACHINE DATABASE sheet into Table1 (replace all rows), or use machinedb_latest_query.pq.
8. MC Report: Refresh All. Keep the saved file for next week.

C. RULES
Source order: layout first, costing when there is no layout. Manual data (IETL, SMS, PDF, tt, E)
  is replaced only when the reviewer chooses it.
Special customer codes (SP..., S27..., F26..., DS...) are kept exactly as written, no suffix.
Scanning follows CheckMc rules. Costing factor 48 for 48HC styles, otherwise 24.


E. SCAN STATE, HASHES AND RE-CHECKS
Stored (when Layout Check is connected):
  data\machinedb\scanstate.json   hash per layout file (previous run: scanstate.bak.json)
  data\validations\*.json         each decision: who, when, layout file, sheets, machine list
  the Consolidator tool records also carry source = the Consolidator tool, layoutPath, layoutFp (machine:qty fingerprint).
File Hash = SHA-256 of the whole file (same -> skipped). Content Hash = SHA-256 of machines and quantities only
  (formatting, remarks, sheet names, style cell do not count).
Latest decision wins: the latest record's own file/sheets are re-read. Same machines and database = record ->
  Already checked (file-conflict warning if the Consolidator tool's best file differs). Different machines -> the file was
  edited after the check -> To review. the Consolidator tool record but not in the database -> reminder to paste into Table1.
First deployment only: also select CheckMc.xlsm; the Scan log shows files that differ from the last CheckMc scan.

F. LINK WITH LAYOUT CHECK (V4)
A style is DONE only when an IE officer saves Pass / Accepted in Layout Check.
- IE Pass/Accepted, same layout, database matches -> "Already checked", no second review.
- IE Fail, database not aligned -> To review, chip "From Layout Check", source defaults to the IE's file.
- IE Tech "layout correct, database wrong" -> same, with the IE Tech note.
- Consolidator asked for a layout fix -> "Layout to fix", database kept.
- Database matches after a Fail, or IE Tech fixed the layout -> note "waiting for the IE re-check".
On save, an "Approved" note goes to data\approvals (never counted as a check; Layout Check shows a tag and the
IE still checks). Duplicate notes are skipped. Existing Pass records in data\validations are unchanged.

G. STEP 4 — MACHINE GROUP ANALYSIS AND PREPARATION
Needs MACHINE BY LINE, MC STATUS, PU LIST in the MC Report. Risk ranking: available = MC STATUS "MC used for PDN"
summed per group; peak = daily production demand + flat add-on. Pick groups, set prep ratio % and days, open the
detail: horizontal day grid per line and style, prep rows in yellow, skipped prep struck through, totals with
balance. Prep = ROUNDUP(ratio x next style qty) on the N working days before loading (Sundays skipped); none when
both styles share a layout file or are in the "same layout" list. Send to IE Tech (IE Tech role in this tool, section H)
to keep / adjust / remove. Export: one coloured sheet per group, PREP BY PU in the TTL DEMAND BY PU layout,
and a sheet of rows not yet reviewed.


I. COMPARISON BY MACHINE GROUP (v5.1)
As in Layout Check V4.1: layout and database match when the total per MACHINE GROUP is equal (groups from the
MACHINE GROUP sheet). Different codes inside the same group create no change proposal and keep "Already checked".
A code without a group is compared on its own.

J. STEP 4: LATEST PLAN AND AVAILABLE-MACHINES DETAIL (v5.3)
Demand = plan (MasterPlan-Full) x MACHINE DATABASE per machine group, the same as MACHINE BY LINE. "Show changes" lists line, date range, old -> new style versus the MC
Report; "Show missing" lists planned styles without machine data. Available = MC STATUS "MC used for PDN", with each
column of its formula shown under it (+ added machines, - machines transferred or not usable). Sundays in the plan
are shown and counted; prep days still skip Sundays; one prep row per style change.

K. TABS (v6)
Consolidator: Data (inputs) / Update database (scan, review, save; the save bar shows only here) / Shortage & prep
(no scan needed: shared layouts come from the saved scan) / Variation notices. IE Tech sees only "Review prep".
IE Tech can change a style change's loading date ("Loading date" button, dd/mm/yyyy): prep days move to the N working
days before the new date (Sundays skipped). Pending rows count as kept; earlier decisions are preserved.

L. IE TECH SCREEN (v6.1)
Connect the shared data folder and the layout folder once (remembered by the browser). Click a machine group button (number = rows waiting) to see only that group;
filter lines by prefix ("K" = all K lines, "K,J" = K and J lines). The by-date grid shows line -> running styles, prep rows in yellow, totals per PU (production, prep, total), overall
total, available (MC STATUS detail) and balance. On each prep row: ✔ keep, ✖ remove (one click, no reason), ✎ or click
the row for the side panel: prep qty, qty per layout (prep recalculates and the Consolidator is notified when it
differs from the database), loading date (prep days move), Save / Remove / Same layout (remove and remember), and
"Open layout" (machine table by group from the layout file, plus a download to open it in Excel).
"Find layout" works like Layout Check: the layout folder's file list is kept 8 hours ("Rescan" to refresh); empty
search = suggestions by file name (exact style > style without size > same article); type part of a name to search.

M. NOTES v6.3
IE Tech sees only the LATEST proposal per machine group (older proposals no longer add duplicate prep rows).
Sheets named F T S C (any spacing or separators, also F-S-T-C) are not scanned.

N. CHANGES v7
Consolidator: MC Report, layout folder, data folder and name are remembered ("Reconnect"); only the new plan is chosen each
week. Review: one choice per layout file with its modified date and tick boxes for its sheets with machine tables (hidden and
F T S C sheets excluded; default as Layout Check: all Man-Machine sheets, else the first sheet naming the style); ticked sheets
are summed. Shortage grid and export: totals per PU. "IE Tech completed" line shows completions and rows not reviewed.
IE Tech: "Complete review" button with a warning when rows are not reviewed. Decisions carry over to next week when the line's
style sequence is unchanged (same line, previous style, next style, machine group), even if dates move. Layout viewer shows
one column per sheet.

O. IE TECH: CHOOSING FOLDERS AND OPENING LAYOUTS (v7.1)
"Choose data folder…" always opens the folder picker (starting in the last folder); "Use again" reconnects the remembered
folders in one click. The status shows the folder name, number of proposals, and the latest proposal's time and sender;
a red message appears when the folder has no proposals. To open a layout in Excel, enter the network path of the layout
folder once (e.g. \\server\IE\Layout or Z:\Layout): "Open in Excel" opens the original file, "Copy path" copies it,
"Download a copy" remains as a fallback.

P. IE TECH: LAYOUT MACHINE TABLE (v7.2)
Clicking a file in "Find layout" shows the machine table as in Layout Check: sheets with a machine table (hidden and F T S C
excluded) with tick boxes and counts, default ticks as Layout Check, one column per ticked sheet plus "Total ticked", and the
line "<group> in ticked sheets: X machines · database: Y" with "Use X as qty per layout" (fills the field, prep recalculates,
the Consolidator is notified on save). Open in Excel / Copy path / Download a copy remain available.

Q. NO SUNDAYS; EXCEL EXPORT (v7.3)
Grids, PU totals, risk ranking and the Excel export show working days only (no Sunday columns). Prep days are the N working
days before loading, Sundays skipped (Monday loading -> Thursday, Friday, Saturday). In the export, skipped or removed prep is
written as 0 (no strikethrough) so Excel sums never include it; the screen still shows the struck-through number.

R. LOADING DATE AND PREP DAYS (v7.4)
In IE Tech's side panel, a changed loading date also moves production on that line (both grids): earlier -> the new style runs
at full quantity from the new date and replaces the previous style; later -> the previous style continues until the day before.
Prep days, totals and balance follow. "Prep days" (default 3) sets the number of working days of prep before loading
(Sundays skipped) for styles that need longer or shorter preparation. Both are kept for later proposals.

S. SPLIT PUs (v7.5)
IE Tech's PU choices come from the data (MC Report PU LIST and sent proposals), not a fixed list. A split such as
PU2 SPORT / PU2 INTIMATE appears automatically once it is in PU LIST.

T. "SAME LAYOUT" BUTTON (v7.6)
The style pair (previous -> next style) is remembered in data\prep\shared. IE Tech's screen immediately skips every other machine
group and line with that pair; the Consolidator's "Open detail" re-reads the list, so later calculations skip it too. A pair
with several previous styles is remembered per previous style. A Keep / Adjust decision on a row overrides the memory.

U. CLOSE REPORT AND ACTIVITY TAB (v7.7)
"Close report..." (shortage & prep tab) shows per PU: prep rows, rows not reviewed, kept/adjusted/removed, IE Tech completion, open notices;
it warns but allows closing, records who/when in data\prep\closed, and flags changes made after closing. The Excel export gets a STATUS sheet and a
CHOT file name only when closed and unchanged. The Activity tab lists proposals, IE Tech decisions, notices, completions, same-layout memory, closings and
database approvals, filtered by machine group, line, person, action and date, with by-group and by-line summaries and an Excel export.

V. v7.8: NO JUMP TO TOP; END DATE OF THE RUNNING STYLE
IE Tech's grid keeps its scroll position after Keep / Remove / Save. The pencil next to "ends dd/mm" on a line's running style edits its end date:
the next style loads on the next working day (Sundays skipped), prep days move with it, and it applies to every machine group of that line
(records in data\prep\lineends). Empty = back to the plan.
