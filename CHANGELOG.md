# Changelog

Dates are the build dates in the working sessions (Nov 2026). "LC" = Layout Check, "IBM" = IE Báo cáo máy (IE_BaoCaoMay.html).

## Docs
- **Manuals** New illustrated HTML manuals for both tools (`manual/`), screenshots taken from synthetic demo data (`tools/manual_shots/`); Crystal logo on the home page. Old text guides, slide deck (v7.7) and the English guide removed.

## IBM
- **v7.9** "Giữ dữ liệu hiện tại" in Cập nhật CSDL can now be confirmed (the ✓ box is no longer greyed out): button "Xác nhận giữ" (or tick + Lưu MACHINE DATABASE) moves the style to the new card "Đã xác nhận giữ"; it returns to "Cần duyệt" only when the layout content (machines/quantities) or the style's database data changes (the confirmation is then cleared), with a note who confirmed and when. "Hủy xác nhận" undoes it. Stored in `data\machinedb\keeps.json` (browser storage when the data folder is not connected).
- **v7.8** Grid of IE Tech keeps its scroll position after Keep/Remove/Save (was jumping to the top). IE Tech can edit the end date of the style running on a line; next style loads the next working day, prep days follow, applies to all machine groups; logged in Nhật ký (`prep/lineends`).
- **v7.7** "Chốt báo cáo" (per-PU check, warns but allows closing, flags changes after closing, `prep/closed`), Excel export gets STATUS sheet and `CHOT` file name; tab "Nhật ký" (by machine group and line, filters, Excel export); completion/notices refresh when the tab opens.
- **v7.6** "Cùng layout" remembered by style pair and applied at once to every machine group and line (IE Tech) and re-read by "Mở chi tiết".
- **v7.5** PU list of IE Tech comes from PU LIST / proposals (PU2 split into PU2 Sport / PU2 Intimate).
- **v7.4** IE Tech changing the loading date also moves production on the line; "Số ngày chuẩn bị" field.
- **v7.3** No Sunday columns anywhere; removed prep exported as 0 in Excel (no strikethrough).
- **v7.2** IE Tech layout viewer like Layout Check (sheet ticks, total of ticked sheets, "Dùng X làm SL theo layout").
- **v7.1** IE Tech always chooses the folders (reuse button), open layout in Excel via network path.
- **v7** Remembered connections (MC Report, layout folder, data folder), sheet ticks per layout file with file modified date, PU totals in grid, IE Tech "Hoàn tất duyệt", decisions carried to next week.
- **v6.x** Tabs (Dữ liệu / Cập nhật CSDL / Thiếu máy & chuẩn bị / Báo sai lệch), IE Tech by-day grid with machine group buttons and line filter, latest proposal per group, layout finder, `F T S C` sheets skipped.
- **v5.x** IE Tech module moved into IBM (LC stays rolled out unchanged), group-level comparison, Sunday fix for lines that work Sundays, demand computed from plan x MACHINE DATABASE, MC STATUS availability detail.
- **v4** Prep proposal (step 4), ratio per machine group (default BT1M 50 %).
- **v3 / v3.1** Renamed from MachineDB; writes "Đã duyệt" notes (`approvals`) instead of Đạt; theme identical to Layout Check.
- **v1 – v2.2 (MachineDB Builder)** Replacement of the VBA CollectMachineData scanner: layout scan, costing fallback, review cards, exports, Layout Check connection.

## LC
- **V4.3.1** Variation log, status KPI and export use the style's PU from the current Linemapping (records saved as "PU2" before the split now show under PU2 Sport / Intimate); "Tất cả PU" restored in PU filters.
- **V4.3** Layouts that exist only as PDF: docked PDF viewer, typed/pasted machine list, required confirmation before Đạt/Chấp nhận, PDF tag in Status.
- **V4.2** PU list read from Linemapping.xlsx (no fixed PU1/PU2/PU3).
- **V4.1** Pass/Accept decided by machine-group totals; layout self-check mismatch (split layouts) is a warning only.
- **V4** IE Tech role and screen, 4-stage loop with Supervisor view, "Đã duyệt" tag, auto re-open of the checked file.
