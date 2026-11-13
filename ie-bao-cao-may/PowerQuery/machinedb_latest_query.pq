// =============================================================================
// Optional query name: MachineDB_Latest
// Reads MACHINE DATABASE from the newest Builder export in a folder,
// so nobody has to paste the export back into the MC Report.
// =============================================================================
let
    ExportFolder = "\\server\share\MachineDB\",          // edit: folder where exports are saved
    Files  = Table.SelectRows(Folder.Files(ExportFolder),
               each Text.StartsWith([Name], "MACHINE_DATABASE_") and [Extension] = ".xlsx"),
    Latest = Table.First(Table.Sort(Files, {{"Name", Order.Descending}})),
    Sheet  = Excel.Workbook(Latest[Content], true){[Item = "MACHINE DATABASE", Kind = "Sheet"]}[Data],
    Typed  = Table.TransformColumnTypes(Sheet, {{"QUANTITY", type number}})
in
    Typed
