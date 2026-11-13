global.XLSX=require('/home/claude/pkg/package/xlsx.js'); const fs=require('fs');
eval(['core.js','i18n.js','logic.js','prep.js'].map(f=>fs.readFileSync('/home/claude/v2/'+f,'utf8')).join(';\n')+';global.P={loadMbl,loadAvail,loadPuList,sharedIndex,buildPrep,applyReviews,loadGroups,sheetAoa}');
const wb=XLSX.read(fs.readFileSync('/mnt/user-data/uploads/MC_report.xlsx'),{sheets:['MACHINE BY LINE','PU LIST'],cellDates:true});
const mbl=P.loadMbl(P.sheetAoa(wb.Sheets['MACHINE BY LINE'],5)), pu=P.loadPuList(P.sheetAoa(wb.Sheets['PU LIST'],2));
const from=Date.UTC(2026,10,9), to=from+27*864e5, iso=k=>new Date(k).toISOString().slice(0,10);
const rows=P.buildPrep(mbl,['BT1M'],{ratios:{BT1M:0.5},days:3},P.sharedIndex([],[]),pu,from,to).filter(r=>r.pu==='PU2').slice(0,6);
fs.writeFileSync('/tmp/lct/proposal.json', JSON.stringify({at:'2026-11-06T10:00:00Z',by:'Tuan',groups:['BT1M'],rows:rows.map(x=>({key:x.key,line:x.line,pu:x.pu,from:x.from,to:x.to,group:x.group,load:iso(x.load),qtyB:x.qtyB,ratio:x.ratio,days:x.days.map(iso),prep:x.prep,same:x.same}))}));
console.log(rows.map(r=>r.line+' '+r.from+' -> '+r.to+' prep '+r.prep).join('\n'));
