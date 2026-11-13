global.XLSX=require('/home/claude/pkg/package/xlsx.js'); const fs=require('fs');
eval(['core.js','i18n.js','logic.js','prep.js'].map(f=>fs.readFileSync('/home/claude/v2/'+f,'utf8')).join(';\n')+';global.P={loadMbl,sharedIndex,buildPrep,loadPuList,sheetAoa}');
// MACHINE BY LINE rebuilt from the new plan for T14, with the BT1M quantities from your screenshot
const wb=XLSX.read(fs.readFileSync('/mnt/user-data/uploads/TransformedMasterPlan_1.xlsx'),{sheets:['MasterPlan-Full'],cellDates:true});
const plan=P.sheetAoa(wb.Sheets['MasterPlan-Full'],3); const h=plan[0];
const aoa=[['Line','Date','GOP','Style No','MACHINE GROUP','Qty']];
plan.slice(1).forEach(r=>{ if(String(r[0]).startsWith('T14')) aoa.push([r[0],r[3],r[1],r[2],'BT1M', String(r[2]).includes('00195')?5:4]); });
const mbl=P.loadMbl(aoa), from=Date.UTC(2026,10,9), to=from+40*864e5;
const rows=P.buildPrep(mbl,['BT1M'],{ratios:{BT1M:0.5},days:3},P.sharedIndex([],[]),{},from,to);
const d=k=>new Date(k).toISOString().slice(5,10);
rows.forEach(r=>console.log(r.line, r.from,'->',r.to,'load',d(r.load),'prep',r.prep,'on',r.days.map(d).join(',')));
// whole plan from the MC Report: any style with two prep rows for the same start?
const mc=XLSX.read(fs.readFileSync('/mnt/user-data/uploads/MC_report.xlsx'),{sheets:['MACHINE BY LINE'],cellDates:true});
const m2=P.loadMbl(P.sheetAoa(mc.Sheets['MACHINE BY LINE'],5)); const all=P.buildPrep(m2,['BT1M'],{ratios:{BT1M:0.5},days:3},P.sharedIndex([],[]),{},Date.UTC(2026,10,9),Date.UTC(2026,11,9));
const c={}; all.forEach(r=>{const k=r.key+'|'+r.days.join(',');c[k]=(c[k]||0)+1;}); console.log('MC Report plan, BT1M rows:',all.length,'| duplicated prep rows:',Object.values(c).filter(x=>x>1).length);
