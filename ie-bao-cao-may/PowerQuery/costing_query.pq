// =============================================================================
// Query name: COSTING PROPOSAL   (load to a sheet named "COSTING PROPOSAL")
// Estimated machines for planned styles that have no rows in MACHINE DATABASE.
// Same rules as Costing_48HC / Costing_24HC (Module2):
//   operations 31-97, 100, 103, 116
//   machines per operation = Factor / total SAM x operation SAM
//   rounding: decimal <= 0.20 down, otherwise up, minimum 1
//   Factor = 48 for styles ending in 48HC, otherwise 24
// =============================================================================
let
    // ---------- settings: edit these 4 lines ----------
    PlanFile    = "\\server\share\TransformedMasterPlan.xlsx",
    CostingFile = "\\server\share\Costing_48HC_until_opn_104_ver2_.xlsm",   // only Sheet2 (machine name -> code) is used
    Server      = "192.168.48.34",
    Database    = "CrystalMartinReport",

    Ws    = {" ", "#(lf)", "#(cr)", "#(tab)"},
    Key   = (t as any) as text => if t = null then "" else Text.Upper(Text.Remove(Text.From(t), Ws)),
    Clean = (t as any) as text =>
        let s = if t = null then "" else Text.From(t),
            a = Text.Combine(List.Transform(Text.ToList(s), each let n = Character.ToNumber(_) in if n >= 32 and n <= 126 then _ else "?"))
        in  Text.Upper(Text.Trim(a)),
    Rnd   = (x as number) as number =>
        if x <= 0 then 0 else
        let w = Number.RoundDown(x), d = x - w, r = if d <= 0.2 then w else w + 1
        in  if r < 1 then 1 else r,

    // ---------- 1. planned styles with no rows in MACHINE DATABASE ----------
    Plan      = Excel.Workbook(File.Contents(PlanFile), true){[Item = "MasterPlan-Full", Kind = "Sheet"]}[Data],
    PlanNames = List.Distinct(List.Select(
                    List.Transform(Plan[Style No], each if _ = null then "" else Text.Trim(Text.From(_))),
                    each _ <> "" and not Text.StartsWith(Text.Upper(_), "NOT SET"))),     // includes special codes (SP..., S27...)
    DbKeys    = List.Buffer(List.Distinct(List.Transform(Excel.CurrentWorkbook(){[Name = "Table1"]}[Content][STYLE], Key))),
    Missing   = List.Select(PlanNames, each not List.Contains(DbKeys, Key(_))),

    Cand0 = Table.FromColumns({Missing}, {"STYLE"}),
    Cand1 = Table.AddColumn(Cand0, "BaseStyle", each if Text.Contains([STYLE], ")")
              then Key(Text.BeforeDelimiter([STYLE], ")", {0, RelativePosition.FromEnd}) & ")") else Key([STYLE]), type text),
    Cand2 = Table.AddColumn(Cand1, "Factor", each if Text.Contains([STYLE], ")") and
              Key(Text.AfterDelimiter([STYLE], ")", {0, RelativePosition.FromEnd})) = "48HC" then 48 else 24, Int64.Type),
    Cand  = Table.Buffer(Cand2),
    Bases = List.Distinct(Cand[BaseStyle]),

    // ---------- 2. operations from STMS (latest IEDDate per style) ----------
    InList = Text.Combine(List.Transform(Bases, each "'" & Text.Replace(_, "'", "''") & "'"), ","),
    Sql    = "SELECT t2.StyleNo, t2.IEDDate, t3.OperationNo, t3.BaseSAM, t3.Machine " &
             "FROM (SELECT StyleNo, MAX(IEDDate) AS maxieddate FROM [192.168.36.79].[CMP].dbo.[STMS_Info] GROUP BY StyleNo) t1 " &
             "LEFT JOIN [192.168.36.79].[CMP].dbo.STMS_Info t2 ON t1.StyleNo = t2.StyleNo AND t1.maxieddate = t2.IEDDate " &
             "LEFT JOIN [192.168.36.79].[CMP].dbo.STMS_Item t3 ON t2.id = t3.InfoID " &
             "WHERE (t3.OperationNo BETWEEN 31 AND 104 OR t3.OperationNo = 116) AND t1.StyleNo IN (" & InList & ")",
    Ops0   = if List.IsEmpty(Bases)
             then #table({"StyleNo", "IEDDate", "OperationNo", "BaseSAM", "Machine"}, {})
             else Sql.Database(Server, Database, [Query = Sql]),
    Ops    = Table.Buffer(Table.TransformColumns(Ops0, {{"StyleNo", Key, type text}})),

    Elig = Table.SelectRows(Ops, each [OperationNo] <> null and
             (([OperationNo] >= 31 and [OperationNo] <= 97) or List.Contains({100, 103, 116}, [OperationNo]))),
    Tot  = Table.Group(Elig, {"StyleNo"}, {
             {"TotalSAM", each List.Sum(List.Transform([BaseSAM], each if _ = null then 0 else _)), type number}}),

    // ---------- 3. machine name -> machine code (costing workbook Sheet2) ----------
    MapSrc = Excel.Workbook(File.Contents(CostingFile), true){[Item = "Sheet2", Kind = "Sheet"]}[Data],
    Map    = Table.Buffer(Table.Distinct(Table.SelectRows(
               Table.AddColumn(Table.SelectColumns(MapSrc, {"Machine Code", "Machine Name"}), "MKey", each Clean([Machine Name]), type text),
               each [MKey] <> ""), {"MKey"})),

    E1 = Table.AddColumn(Elig, "MKey", each Clean([Machine]), type text),
    E2 = Table.NestedJoin(E1, {"MKey"}, Map, {"MKey"}, "Map", JoinKind.LeftOuter),
    E3 = Table.ExpandTableColumn(E2, "Map", {"Machine Code"}, {"MachineCode"}),
    E4 = Table.NestedJoin(E3, {"StyleNo"}, Tot, {"StyleNo"}, "Tot", JoinKind.LeftOuter),
    E5 = Table.ExpandTableColumn(E4, "Tot", {"TotalSAM"}, {"TotalSAM"}),

    // ---------- 4. machines per style + variant ----------
    C1 = Table.NestedJoin(Cand, {"BaseStyle"}, E5, {"StyleNo"}, "Ops", JoinKind.LeftOuter),
    C2 = Table.ExpandTableColumn(C1, "Ops", {"OperationNo", "BaseSAM", "Machine", "MachineCode", "TotalSAM", "IEDDate"}),
    C3 = Table.AddColumn(C2, "Machines", each
           if [OperationNo] = null or [TotalSAM] = null or [TotalSAM] = 0 or [BaseSAM] = null then 0
           else Rnd([Factor] / [TotalSAM] * [BaseSAM]), type number),

    // ---------- 5. controls: status per style ----------
    St = Table.Group(C3, {"STYLE"}, {
           {"Status", (t) =>
               let ops = Table.SelectRows(t, each [OperationNo] <> null),
                   un  = Table.SelectRows(ops, each [MachineCode] = null)
               in  if Table.RowCount(ops) = 0 then "No STMS data"
                   else if Table.RowCount(un) > 0 then "Unmapped machine: " &
                        Text.Combine(List.Distinct(List.Transform(un[Machine], each if _ = null then "(blank)" else Text.From(_))), " | ")
                   else if List.Max(ops[TotalSAM]) = 0 then "Total SAM = 0"
                   else "OK", type text},
           {"Factor", each List.Max([Factor]), Int64.Type},
           {"IEDDate", each List.Max([IEDDate]), type any}}),

    Ok  = Table.SelectRows(C3, each [MachineCode] <> null and [Machines] > 0),
    Sum = Table.Group(Ok, {"STYLE", "MachineCode"}, {{"QUANTITY", each List.Sum([Machines]), type number}}),
    R1  = Table.NestedJoin(St, {"STYLE"}, Sum, {"STYLE"}, "S", JoinKind.LeftOuter),
    R2  = Table.ExpandTableColumn(R1, "S", {"MachineCode", "QUANTITY"}, {"MACHINE", "QUANTITY"}),
    R3  = Table.AddColumn(R2, "REMARK", each "costing", type text),
    Result = Table.Sort(Table.SelectColumns(R3, {"STYLE", "MACHINE", "QUANTITY", "REMARK", "Status", "Factor", "IEDDate"}),
               {{"STYLE", Order.Ascending}, {"MACHINE", Order.Ascending}})
in
    Result
