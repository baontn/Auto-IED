/* App: state, undo, panels, export dialog. */
var $=function(i){return document.getElementById(i);};
var ST=blank(),SELS=[],hist=[],redoS=[],exported=false,OFF={d:2,what:'outer',copy:true};
function today(){var d=new Date(),p=function(v){return ('0'+v).slice(-2);};return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function blank(){return {v:1,name:'',style:'',purpose:'',notes:'',rev:'1',date:today(),ie:lsGet('d3_ie')||'',parts:[],ref:{on:false,nx:0,ny:0},meas:[],nid:1};}
function cleanMeas(a){return (a||[]).slice(0,60).filter(function(m){return m&&m.a&&m.b&&m.a.length===3&&m.b.length===3;}).map(function(m){return {a:m.a.map(function(v){return num(v,0);}),b:m.b.map(function(v){return num(v,0);})};});}
function measLen(m){return Math.sqrt(Math.pow(m.b[0]-m.a[0],2)+Math.pow(m.b[1]-m.a[1],2)+Math.pow(m.b[2]-m.a[2],2));}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function toast(msg){var e=$('toast');e.textContent=msg;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(function(){e.classList.remove('on');},2800);}
function getPart(id){for(var i=0;i<ST.parts.length;i++)if(ST.parts[i].id===id)return ST.parts[i];return null;}
function getSel(){return SELS.length===1?getPart(SELS[0]):null;}
function fitParts(){var r=realParts(ST.parts);return r.length?r:ST.parts;}
function numOf(p){return realParts(ST.parts).indexOf(p)+1;}
function selParts(){return SELS.map(getPart).filter(function(p){return p;});}
function isSel(id){return SELS.indexOf(id)>=0;}
/* ---------- history ---------- */
function snap(){return JSON.stringify(ST);}
function pushHist(){hist.push(snap());if(hist.length>80)hist.shift();redoS=[];updUndo();}
function updUndo(){$('bUndo').disabled=!hist.length;$('bRedo').disabled=!redoS.length;}
function restore(js){ST=JSON.parse(js);SELS=SELS.filter(function(i){return getPart(i);});changed(true);}
function undo(){if(!hist.length)return;redoS.push(snap());restore(hist.pop());updUndo();}
function redo(){if(!redoS.length)return;hist.push(snap());restore(redoS.pop());updUndo();}
function mut(fn,struct){pushHist();fn();changed(!!struct);}
/* ---------- refresh everything after a change ---------- */
function changed(struct){
  G.meas=ST.meas||[];
  glSetParts(ST.parts,SELS,ST.ref);renderList();
  if(struct)renderProps();else updateFields();
  updSteps();updStatus();$('dName').value=ST.name;
  lsSet('d3_work',snap());
}
function selectPart(id,add){
  if(id==null){if(!add)SELS=[];}
  else if(add){var k=SELS.indexOf(id);if(k>=0)SELS.splice(k,1);else SELS.push(id);}
  else if(SELS.indexOf(id)<0||SELS.length===1)SELS=[id];
  changed(true);
}
/* ---------- steps ribbon, status ---------- */
function updSteps(){
  var n=ST.parts.length,a=!n?1:2;
  ['s1','s2','s3'].forEach(function(k,i){$(k).className='step'+(i+1===a?' on':'')+(i+1<a?' done':'');});
  $('bPdf').classList.toggle('pulse',n>0&&!exported);
}
function updStatus(){
  var p=getSel(),e=$('status');
  if(G.mode==='ruler'){e.textContent=G.pend?t('rl_b'):t('rl_a');return;}
  if(SELS.length>1){e.textContent=SELS.length+' '+t('st_multi');return;}
  if(!p){e.textContent=ST.parts.length?t('st_none'):t('st_empty');return;}
  var i=p.ref?t('ref_word'):'#'+numOf(p);e.innerHTML='<b>'+i+' '+esc(p.name||t('k_'+p.kind))+'</b> · '+sizeText(p)+' mm · X '+fmt(p.x)+'  Y '+fmt(p.y)+'  Z '+fmt(p.z)+' · '+wtText(weightOf(p));
}
/* ---------- left: library and list ---------- */
function renderLib(){
  var h='',hT='';PRESETS.forEach(function(p){
    var b='<button class="lib" data-add="'+p.id+'"><span class="ico">'+p.ico+'</span><span class="lt"><b>'+esc(t('pr_'+p.id))+'</b><small>'+esc(t('prd_'+p.id))+'</small></span></button>';
    if(p.kind==='table')hT+=b;else h+=b;});
  $('lib').innerHTML=h;$('libT').innerHTML=hT;
}
function renderList(){
  var h='';ST.parts.forEach(function(p,i){h+='<div class="li'+(isSel(p.id)?' sel':'')+(p.ref?' refp':'')+'" data-id="'+p.id+'"><i>'+(p.ref?'▭':numOf(p))+'</i><span>'+esc(p.name||t('k_'+p.kind))+'</span><small>'+sizeText(p)+'</small></div>';});
  $('list').innerHTML=h||'<div class="muted pad">'+esc(t('list_empty'))+'</div>';
  var rr=realParts(ST.parts),g=totals(rr);$('sum').textContent=ST.parts.length?rr.length+' '+t('pdf_parts')+' · '+wtText(g)+(rr.length<ST.parts.length?' · '+(ST.parts.length-rr.length)+' '+t('ref_word'):''):'';
}
/* ---------- right: properties ---------- */
function fld(label,key,val,unit,tip,step){return '<label class="f" title="'+esc(tip||'')+'"><span>'+esc(label)+'</span><input type="number" data-f="'+key+'" value="'+val+'" step="'+(step||1)+'"><i>'+(unit||'mm')+'</i></label>';}
function renderProps(){
  var p=getSel(),h='',e=$('props');
  if(SELS.length>1){
    h+='<h3>'+SELS.length+' '+esc(t('st_multi'))+'</h3><div class="tip">'+esc(t('mg_tip'))+'</div><h4>'+esc(t('mg_title'))+'</h4>'+
      '<div class="btns col"><button data-bool="union">⊕ '+esc(t('mg_union'))+'</button><button data-bool="cut">⊖ '+esc(t('mg_cut'))+'</button><button data-bool="and">⊗ '+esc(t('mg_and'))+'</button></div>'+
      '<h4>'+esc(t('mg_join_t'))+'</h4><div class="tip">'+esc(t('mg_join_tip'))+'</div><div id="jnInfo" class="tipsm"></div>'+
      '<label class="f"><span>'+esc(t('mg_gap'))+'</span><input type="number" id="jnGap" min="1" step="1" value="'+JN.gap+'"><i>mm</i></label>'+
      '<div class="btns col"><button data-bool="join">🔗 '+esc(t('mg_join'))+'</button></div>'+
      '<div class="tip">'+esc(t('mg_order'))+'</div><div class="btns end"><button data-act="dup">⧉ '+esc(t('b_dup'))+'</button><button class="danger" data-act="del">🗑 '+esc(t('b_del'))+'</button></div>';
    e.innerHTML=h;joinInfo();return;
  }
  if(!p){
    var bb=bboxAll(realParts(ST.parts));
    h+='<h3>'+esc(t('pp_title'))+'</h3><div class="tip">'+esc(ST.parts.length?t('pp_pick'):t('pp_start'))+'</div>';
    if(bb)h+='<div class="kv"><span>'+esc(t('pdf_size'))+'</span><b>'+fmt(bb.x1-bb.x0)+' × '+fmt(bb.y1-bb.y0)+' × '+fmt(bb.z1-Math.min(0,bb.z0))+' mm</b></div><div class="kv"><span>'+esc(t('pdf_weight'))+'</span><b>'+wtText(totals(realParts(ST.parts)))+'</b></div>';
    h+='<h3>'+esc(t('rl_title'))+'</h3><div class="tip">'+esc(t('rl_tip'))+'</div>';
    (ST.meas||[]).forEach(function(m,k){h+='<div class="kv"><span>'+(k+1)+'. ΔX '+fmt(Math.abs(m.b[0]-m.a[0]))+' · ΔY '+fmt(Math.abs(m.b[1]-m.a[1]))+' · ΔZ '+fmt(Math.abs(m.b[2]-m.a[2]))+'</span><b>'+fmt(measLen(m))+' mm <button class="x" data-delm="'+k+'" title="'+esc(t('b_del'))+'">✕</button></b></div>';});
    if((ST.meas||[]).length)h+='<div class="btns"><button data-clrm="1">'+esc(t('rl_clear'))+'</button></div>';
    h+='<h3>'+esc(t('ref_title'))+'</h3><label class="chk"><input type="checkbox" data-ref="on"'+(ST.ref.on?' checked':'')+'> '+esc(t('ref_on'))+'</label><div class="tip">'+esc(t('ref_tip'))+'</div>';
    if(ST.ref.on)h+='<div class="row2"><label class="f"><span>'+esc(t('ref_x'))+'</span><input type="number" data-ref="nx" value="'+ST.ref.nx+'"><i>mm</i></label><label class="f"><span>'+esc(t('ref_y'))+'</span><input type="number" data-ref="ny" value="'+ST.ref.ny+'"><i>mm</i></label></div>';
    e.innerHTML=h;return;
  }
  var idx=p.ref?'▭':numOf(p),pin=p.kind==='pin',k=p.kind;
  h+='<h3><span class="badge">'+idx+'</span> '+esc(t('k_'+p.kind))+'</h3>';
  h+='<label class="f wide"><span>'+esc(t('f_name'))+'</span><input type="text" data-f="name" value="'+esc(p.name)+'" maxlength="60"></label>';
  h+='<label class="f wide"><span>'+esc(t('f_mat'))+'</span><select data-f="mat">'+MAT_ORDER.map(function(m){return '<option value="'+m+'"'+(m===p.mat?' selected':'')+'>'+esc(t('m_'+m))+'</option>';}).join('')+'</select></label>';
  h+='<h4>'+esc(t('f_size'))+'</h4><div class="grid3">';
  if(pin)h+=fld(t('f_dia'),'w',p.w,'mm',t('tt_dia'),0.5)+fld(t('f_h'),'h',p.h,'mm',t('tt_h'),0.5);
  else if(k==='wheel')h+=fld(t('f_dia'),'w',p.w,'mm',t('tt_dia'),0.5)+fld(t('f_wwid'),'d',p.d,'mm',t('tt_wwid'),0.5);
  else if(k==='table')h+=fld(t('f_w'),'w',p.w,'mm',t('tt_w'),10)+fld(t('f_d'),'d',p.d,'mm',t('tt_d'),10)+fld(t('f_h'),'h',p.h,'mm',t('tt_h'),10)+fld(t('f_tt'),'tt',p.tt,'mm',t('tt_tt'),1);
  else if(k==='handle')h+=fld(t('f_w'),'w',p.w,'mm',t('tt_w'),0.5)+fld(t('f_bar'),'d',p.d,'mm',t('tt_bar'),0.5)+fld(t('f_h'),'h',p.h,'mm',t('tt_h'),0.5);
  else h+=fld(t('f_w'),'w',p.w,'mm',t('tt_w'),0.5)+fld(t('f_d'),'d',p.d,'mm',t('tt_d'),0.5)+fld(p.kind==='plate'?t('f_thick'):t('f_h'),'h',p.h,'mm',t('tt_h'),0.5);
  if(p.kind==='plate')h+=fld(t('f_r'),'r',p.r||0,'mm',t('tt_r'),0.5);
  h+='</div><h4>'+esc(t('f_pos'))+'</h4><div class="grid3">'+fld('X','x',p.x,'mm',t('tt_x'))+fld('Y','y',p.y,'mm',t('tt_y'))+fld('Z','z',p.z,'mm',t('tt_z'))+'</div>';
  h+='<div class="btns"><button data-act="ontop" title="'+esc(t('tt_ontop'))+'">⬆ '+esc(t('b_ontop'))+'</button><button data-act="ground">⬇ '+esc(t('b_ground'))+'</button></div>';
  if(!pin)h+='<h4>'+esc(t('f_rot'))+'</h4><div class="btns"><button data-act="rotl">⟲ 90°</button><button data-act="rotr">⟳ 90°</button><label class="f inl"><input type="number" data-f="rot" value="'+(p.rot||0)+'" step="5"><i>°</i></label></div>';
  if(p.kind==='plate'){
    h+='<h4>'+esc(t('f_holes'))+'</h4><div class="tip">'+esc(t('tip_holes'))+'</div>';
    (p.holes||[]).forEach(function(o,i){
      h+='<div class="hole"><b>H'+(i+1)+'</b> <span>'+esc(t('h_'+o.t))+'</span><button class="x" data-del="'+i+'" title="'+esc(t('b_del'))+'">✕</button><div class="grid3">'+hf(i,'x',o.x,'X')+hf(i,'y',o.y,'Y')+
        (o.t==='round'?hf(i,'a',o.a,'Ø'):hf(i,'a',o.a,o.t==='slot'?t('f_len'):t('f_w')))+(o.t==='round'?'':hf(i,'b',o.b,o.t==='slot'?t('f_wid'):t('f_hh')))+(o.t==='rect'?hf(i,'c',o.c||0,'R'):'')+'</div></div>';
    });
    h+='<div class="btns"><button data-addh="round">+ '+esc(t('h_round'))+'</button><button data-addh="slot">+ '+esc(t('h_slot'))+'</button><button data-addh="rect">+ '+esc(t('h_rect'))+'</button></div>';
  }
  h+='<label class="chk" style="margin-top:10px"><input type="checkbox" data-reff="1"'+(p.ref?' checked':'')+'> '+esc(t('f_ref'))+'</label>';
  h+='<h4>'+esc(t('of_title'))+'</h4><div class="tip">'+esc(t('of_tip'))+'</div><div class="grid3"><label class="f"><span>'+esc(t('of_d'))+'</span><input type="number" id="offD" min="0" step="0.5" value="'+OFF.d+'"><i>mm</i></label>'+
    '<label class="f" style="grid-column:span 2"><span>'+esc(t('of_what'))+'</span><select id="offW"><option value="outer"'+(OFF.what==='outer'?' selected':'')+'>'+esc(t('of_outer'))+'</option><option value="holes"'+(OFF.what==='holes'?' selected':'')+'>'+esc(t('of_holes'))+'</option></select></label></div>'+
    '<label class="chk"><input type="checkbox" id="offC"'+(OFF.copy?' checked':'')+'> '+esc(t('of_copy'))+'</label><div class="btns"><button data-off="1">➕ '+esc(t('of_grow'))+'</button><button data-off="-1">➖ '+esc(t('of_shrink'))+'</button></div>';
  h+='<div class="btns end"><button data-act="dup">⧉ '+esc(t('b_dup'))+'</button><button class="danger" data-act="del">🗑 '+esc(t('b_del'))+'</button></div>';
  e.innerHTML=h;
}
function hf(i,k,v,lab){return '<label class="f"><span>'+esc(lab)+'</span><input type="number" data-hi="'+i+'" data-hf="'+k+'" value="'+v+'" step="0.5"></label>';}
function updateFields(){
  var p=getSel(),e=$('props');if(!p){if(!ST.parts.length||true)renderProps();return;}
  [].forEach.call(e.querySelectorAll('[data-f]'),function(inp){if(inp===document.activeElement)return;var k=inp.dataset.f;if(p[k]!==undefined)inp.value=k==='name'||k==='mat'?p[k]:(Math.round(p[k]*100)/100);});
}
/* ---------- actions ---------- */
function snapPos(v){return Math.round(v/G.snap)*G.snap;}
function addPreset(id){
  var pr=presetById(id);if(!pr)return;var base=pr.mk();base.kind=pr.kind;base.name=t('pr_'+id);
  var sel=getSel(),p=cleanPart(base,ST.nid);
  mut(function(){
    ST.nid++;
    if(pr.kind==='table'){var rb=bboxAll(realParts(ST.parts));p.x=rb?snapPos((rb.x0+rb.x1)/2):0;p.y=rb?snapPos((rb.y0+rb.y1)/2):0;p.z=(rb?Math.min(0,rb.z0):0)-p.h;}
    else if(sel&&pr.kind==='wheel'){var sf=fp(sel);p.x=snapPos(sf.x0+p.w/2+15);p.y=snapPos(sf.y0+p.d/2+10);p.z=sel.z-p.h;}
    else if(sel&&pr.kind!=='plate'){p.x=sel.x;p.y=sel.y;p.z=sel.z+sel.h;}
    else if(realParts(ST.parts).length){var b=bboxAll(realParts(ST.parts));p.x=snapPos(b.x1+15+p.w/2);p.y=snapPos((b.y0+b.y1)/2);p.z=0;}
    ST.parts.push(p);SELS=[p.id];
  },true);
  glFit(fitParts(),ST.ref);toast(t('t_added')+': '+(p.name));
}
function applyField(f,val){
  var p=getSel();if(!p)return;
  mut(function(){
    if(f==='name')p.name=String(val).slice(0,60);
    else if(f==='mat')p.mat=val;
    else{var v=num(val,p[f]);if(f==='w'||f==='d'||f==='h')v=Math.max(0.5,v);if(f==='r')v=Math.max(0,v);
      if(p.kind==='poly'&&(f==='w'||f==='d')){var k=v/p[f],ix=f==='w'?0:1;p.polys.forEach(function(q){[q.o].concat(q.h).forEach(function(r){r.forEach(function(a){a[ix]*=k;});});});}
      p[f]=v;if(p.kind==='pin'&&f==='w')p.d=v;if(p.kind==='wheel'&&f==='w')p.h=v;}
  },f==='mat'||f==='name'?false:false);
  if(f==='mat')renderProps();
}
function applyHole(i,k,val){var p=getSel();if(!p||!p.holes[i])return;mut(function(){var v=num(val,p.holes[i][k]);if(k==='a'||k==='b')v=Math.max(0.5,v);if(k==='c')v=Math.max(0,v);p.holes[i][k]=v;});}
function doAct(a){
  var ps=selParts();if(!ps.length)return;var p=ps[0];
  if(a==='rotl'||a==='rotr')mut(function(){ps.forEach(function(q){q.rot=((q.rot||0)+(a==='rotl'?90:-90)+360)%360;});});
  else if(a==='ontop'&&ps.length===1)mut(function(){p.z=topUnder(ST.parts,p);});
  else if(a==='ground'&&ps.length===1)mut(function(){p.z=0;});
  else if(a==='del')mut(function(){ST.parts=ST.parts.filter(function(q){return !isSel(q.id);});SELS=[];},true);
  else if(a==='dup')mut(function(){var ids=[];ps.forEach(function(q){var c=JSON.parse(JSON.stringify(q)),f=fp(q);c.id=ST.nid++;c.x=snapPos(q.x+(f.x1-f.x0)+10);ST.parts.push(c);ids.push(c.id);});SELS=ids;},true);
}
/* ---- merge (boolean) and offset ---- */
function polyPart(polys,base,name){
  var q={id:ST.nid++,kind:'poly',name:name,x:0,y:0,z:base.z,h:base.h,rot:0,mat:base.mat,r:0,holes:[],polys:polys,w:1,d:1};
  polyBox(q);q.x=q.cx;q.y=q.cy;delete q.cx;delete q.cy;return q;
}
var JN={gap:20};
function joinInfo(){
  var ps=selParts(),e=$('jnInfo');if(!e||ps.length<2)return;
  var base=ps[0];if(ps.some(function(q){return Math.abs(q.z-base.z)>0.01||Math.abs(q.h-base.h)>0.01;})){e.textContent=t('mg_same');return;}
  try{var r=joinWorld(ps,JN.gap);e.textContent=r?(r.gap?t('mg_gapfound')+' ≈ '+r.gap+' mm':t('mg_touch')):t('mg_gapnone')+' '+JN.gap+' mm';}catch(x){e.textContent='';}
}
function doBool(mode){
  var ps=SELS.map(getPart).filter(function(q){return q;});if(ps.length<2)return;
  var base=ps[0];
  if(mode==='union'){
    var bad=ps.some(function(q){return Math.abs(q.z-base.z)>0.01||Math.abs(q.h-base.h)>0.01;});
    if(bad){toast(t('mg_same'));return;}
  }
  var res;
  if(mode==='join'){
    var gv=Math.max(1,num(($('jnGap')||{}).value,JN.gap));JN.gap=gv;
    var bad2=ps.some(function(q){return Math.abs(q.z-base.z)>0.01||Math.abs(q.h-base.h)>0.01;});if(bad2){toast(t('mg_same'));return;}
    var jr=null;try{jr=joinWorld(ps,gv);}catch(e){}
    if(!jr){toast(t('mg_gapnone')+' '+gv+' mm');return;}res=jr.polys;
  }else{try{res=booleanWorld(ps,mode);}catch(e){toast(t('mg_fail'));return;}}
  if(!res.length){toast(t('mg_empty'));return;}
  var suffix={union:t('mg_sfx_u'),cut:t('mg_sfx_c'),and:t('mg_sfx_a'),join:t('mg_sfx_j')}[mode];
  mut(function(){
    var np=polyPart(res,base,(base.name||t('k_'+base.kind))+' ('+suffix+')');
    var at=ST.parts.indexOf(base);ST.parts=ST.parts.filter(function(q){return !isSel(q.id);});ST.parts.splice(Math.min(at,ST.parts.length),0,np);SELS=[np.id];
  },true);
  toast(t('mg_done'));
}
function doOffset(sign){
  var p=getSel();if(!p)return;var d=Math.abs(num($('offD').value,0))*sign;OFF.d=Math.abs(d);OFF.what=$('offW').value;OFF.copy=$('offC').checked;
  if(!d){toast(t('of_zero'));return;}
  var res;try{res=offsetLocal(p,d,OFF.what);}catch(e){res=null;}
  if(!res){toast(OFF.what==='holes'&&!(p.holes&&p.holes.length)&&p.kind!=='poly'?t('of_noholes'):t('of_empty'));return;}
  mut(function(){
    var q=polyPart(res,p,(p.name||t('k_'+p.kind))+' ('+t('of_sfx')+' '+(d>0?'+':'')+fmt(d)+')');
    var c=Math.cos(rad(p.rot||0)),sn=Math.sin(rad(p.rot||0)),lx=q.x,ly=q.y;   /* centre of the result is in the part's local coordinates */
    q.x=p.x+lx*c-ly*sn;q.y=p.y+lx*sn+ly*c;q.rot=p.rot||0;
    if(OFF.copy){ST.parts.push(q);}else{ST.parts[ST.parts.indexOf(p)]=q;}
    SELS=[q.id];
  },true);
  toast(t('of_done'));
}
function addHole(tp){
  var p=getSel();if(!p)return;var o={t:tp,x:0,y:0,a:tp==='round'?6:tp==='slot'?40:50,b:tp==='slot'?6:30,c:0};
  mut(function(){p.holes.push(o);},true);
}
function nudge(dx,dy){var ps=selParts();if(!ps.length)return;mut(function(){ps.forEach(function(p){p.x+=dx;p.y+=dy;});});}
/* ---------- examples ---------- */
function exParts(id){
  var P=[];function add(pid,o){var pr=presetById(pid),b=pr.mk();b.kind=pr.kind;b.name=t('pr_'+pid);for(var k in o)b[k]=o[k];P.push(b);}
  if(id==='pocket'){
    add('window',{w:200,d:170,h:3,r:6,mat:'acrylic',holes:[{t:'rect',x:0,y:8,a:130,b:90,c:8},{t:'round',x:-88,y:-72,a:6},{t:'round',x:88,y:-72,a:6}]});
    add('rail',{w:200,d:4,h:6,x:0,y:-81,z:3});add('stop',{w:12,d:12,h:5,x:-85,y:68,z:3});add('stop',{w:12,d:12,h:5,x:85,y:68,z:3});
  }else if(id==='seam'){
    add('slot',{w:160,d:70,h:2,r:3,mat:'alu',holes:[{t:'slot',x:0,y:-15,a:100,b:6}]});
    add('rail',{w:160,d:5,h:12,x:0,y:25,z:2});add('wedge',{w:30,d:20,h:8,x:-65,y:5,z:2});
  }else if(id==='label'){
    add('window',{w:120,d:90,h:3,r:4,mat:'abs',holes:[{t:'rect',x:0,y:0,a:62,b:32,c:3}]});
    add('stop',{w:6,d:40,h:6,x:-38,y:0,z:3});add('stop',{w:70,d:6,h:6,x:0,y:-22,z:3});
  }else{
    add('plate',{w:220,d:80,h:3,r:3,mat:'alu'});
    add('rail',{w:220,d:3,h:15,mat:'steel',x:0,y:38,z:3});add('wedge',{w:60,d:40,h:12,x:-80,y:0,z:3});add('pin',{w:5,d:5,h:10,x:60,y:-20,z:3});add('pin',{w:5,d:5,h:10,x:80,y:-20,z:3});
  }
  return P;
}
function loadExample(id){
  pushHist();ST=blank();ST.name=t('ex_'+id);SELS=[];
  exParts(id).forEach(function(b){ST.parts.push(cleanPart(b,ST.nid++));});
  changed(true);glView('iso',fitParts(),ST.ref);
}
/* ---------- save / open ---------- */
function download(blob,name){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);}
function safeName(s){return (String(s||'design').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^A-Za-z0-9_\-]+/g,'_').replace(/^_+|_+$/g,'')||'design').slice(0,50);}
function saveProject(){pjSave();}
function loadProject(txt){
  var o;try{o=JSON.parse(txt);}catch(e){toast(t('t_badfile'));return;}
  if(!o||!Array.isArray(o.parts)){toast(t('t_badfile'));return;}
  pushHist();var b=blank();b.name=String(o.name||'').slice(0,80);b.style=String(o.style||'');b.purpose=String(o.purpose||'');b.notes=String(o.notes||'');b.rev=String(o.rev||'1');b.date=String(o.date||today());b.ie=o.ie||b.ie;
  b.ref={on:!!(o.ref&&o.ref.on),nx:num(o.ref&&o.ref.nx,0),ny:num(o.ref&&o.ref.ny,0)};b.meas=cleanMeas(o.meas);
  o.parts.slice(0,300).forEach(function(p){b.parts.push(cleanPart(p,b.nid++));});ST=b;SELS=[];changed(true);glView('iso',fitParts(),ST.ref);toast(t('t_opened'));
}
/* ---------- export dialog ---------- */
var EX={key:'',shot:null,pages:[],idx:0,tm:null};
function exShot(){
  var key=JSON.stringify([ST.parts,ST.ref]);
  if(key!==EX.key||!EX.shot){glSetParts(ST.parts,[],ST.ref);try{EX.shot=glShot(realParts(ST.parts),[],ST.ref,1400,1200);}catch(e){EX.shot=null;}glSetParts(ST.parts,SELS,ST.ref);EX.key=key;}
}
function exOpts(){
  return {name:ST.name,ie:$('eIe').value.trim(),style:$('eStyle').value.trim(),purpose:$('ePurpose').value.trim(),notes:$('eNotes').value.trim(),rev:$('eRev').value.trim()||'1',date:$('eDate').value||today(),
    pages:{p3d:$('pg3d').checked,list:$('pgList').checked,views:$('pgViews').checked,plates:$('pgPlates').checked},shot:EX.shot};
}
function exRefresh(){
  var o=exOpts();ST.ie=o.ie;ST.style=o.style;ST.purpose=o.purpose;ST.notes=o.notes;ST.rev=o.rev;ST.date=o.date;if(o.ie)lsSet('d3_ie',o.ie);
  EX.pages=buildPages(ST,o);if(EX.idx>=EX.pages.length)EX.idx=EX.pages.length-1;if(EX.idx<0)EX.idx=0;
  var pv=$('pv'),pg=EX.pages[EX.idx];pv.width=pg.width;pv.height=pg.height;pv.getContext('2d').drawImage(pg,0,0);
  $('pvLab').textContent=(EX.idx+1)+' / '+EX.pages.length;$('pvPrev').disabled=EX.idx<=0;$('pvNext').disabled=EX.idx>=EX.pages.length-1;
  $('bDl').disabled=!o.ie;$('ieWarn').style.display=o.ie?'none':'block';$('eIe').classList.toggle('bad',!o.ie);
}
function exLater(){clearTimeout(EX.tm);EX.tm=setTimeout(exRefresh,200);}
function openExport(){
  if(!ST.parts.length){toast(t('t_noparts'));return;}
  $('eIe').value=ST.ie||lsGet('d3_ie')||'';$('eStyle').value=ST.style;$('ePurpose').value=ST.purpose;$('eNotes').value=ST.notes;$('eRev').value=ST.rev;$('eDate').value=ST.date||today();
  exShot();EX.idx=0;$('dlgExp').classList.add('on');exRefresh();setTimeout(function(){if(!$('eIe').value)$('eIe').focus();},50);
}
function doDownload(){
  var o=exOpts();if(!o.ie){$('eIe').focus();return;}exRefresh();
  var blob=makePdf(EX.pages,{title:(ST.name||t('untitled'))+' - '+t('pdf_doc'),author:o.ie,subject:'Crystal Martin Vietnam'});
  download(blob,safeName(ST.name)+'_'+o.date+'.pdf');exported=true;updSteps();lsSet('d3_work',snap());toast(t('t_pdfok')+' ('+EX.pages.length+' '+t('pdf_pages')+')');
}
/* ---------- picture -> 3D ---------- */
function trLoadFile(f){
  if(!f)return;var url=URL.createObjectURL(f),im=new Image();
  im.onload=function(){trSetImage(im);URL.revokeObjectURL(url);$('trThr').value=TR.thr;$('trInv').checked=TR.inv;$('trFill').checked=false;TR.fill=false;if(!$('trName').value)$('trName').value=(f.name||'').replace(/\.[^.]+$/,'').slice(0,40)||t('tr_name');trUpdate(true);};
  im.onerror=function(){URL.revokeObjectURL(url);toast(t('tr_bad'));};im.src=url;
}
function trSyncDims(fromWid){
  if(!TR.box)return;var len=num($('trLen').value,200),wid=num($('trWid').value,0);
  if(fromWid&&wid>0){len=wid*TR.box.w/TR.box.h;$('trLen').value=round1(len);}else{$('trWid').value=round1(len*TR.box.h/TR.box.w);}
}
function trUpdate(){
  if(!TR.gray)return;TR.thr=+$('trThr').value;TR.inv=$('trInv').checked;TR.fill=$('trFill').checked;TR.tol=+$('trTol').value;TR.minA=+$('trMin').value;
  trRun();trSyncDims(false);trDraw();
}
function trDraw(){
  var cv=$('trCv'),c=cv.getContext('2d'),W=cv.width,H=cv.height;c.clearRect(0,0,W,H);c.fillStyle='#fff';c.fillRect(0,0,W,H);
  if(!TR.img){c.fillStyle='#6b7280';c.font='16px Segoe UI,Arial';c.textAlign='center';c.fillText(t('tr_drop'),W/2,H/2);$('trInfo').textContent='';$('trMake').disabled=true;return;}
  var k=Math.min((W-20)/TR.w,(H-20)/TR.h),ox=(W-TR.w*k)/2,oy=(H-TR.h*k)/2;
  c.globalAlpha=0.55;c.drawImage(TR.img,ox,oy,TR.w*k,TR.h*k);c.globalAlpha=1;
  c.beginPath();var holes=0;
  TR.rings.forEach(function(q){[q.o].concat(q.h).forEach(function(r,j){if(j)holes++;r.forEach(function(a,i){var x=ox+(a[0]-1)*k,y=oy+(a[1]-1)*k;if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.closePath();});});
  c.fillStyle='rgba(232,89,12,0.35)';c.fill('evenodd');c.lineWidth=2;c.strokeStyle='#e8590c';c.stroke();
  $('trInfo').textContent=TR.rings.length?TR.rings.length+' '+t('tr_shapes')+', '+holes+' '+t('tr_holes'):t('tr_none');
  $('trMake').disabled=!TR.rings.length;
}
function trCreate(){
  if(!TR.box){toast(t('tr_none'));return;}
  var len=Math.max(1,num($('trLen').value,200)),th=Math.max(0.5,num($('trTh').value,3)),mat=$('trMat').value,nm=$('trName').value.trim()||t('tr_name'),polys=trToMm(len);
  mut(function(){
    var q=polyPart(polys,{z:0,h:th,mat:mat},nm),rb=realParts(ST.parts).length?bboxAll(realParts(ST.parts)):null;
    if(rb){q.x=snapPos(rb.x1+15+q.w/2);q.y=snapPos((rb.y0+rb.y1)/2);}else{q.x=0;q.y=0;}
    ST.parts.push(q);SELS=[q.id];
  },true);
  closeDlg();glFit(fitParts(),ST.ref);toast(t('tr_done'));
}
/* ---------- ruler ---------- */
function toggleRuler(on){
  G.mode=on?'ruler':null;G.pend=null;G.hover=null;$('bRuler').classList.toggle('on',!!on);$('gl').style.cursor=on?'crosshair':'';
  if(on){SELS=[];changed(true);}else{updStatus();}G.dirty=true;
}
function rulerPick(p){
  if(!G.pend){G.pend=p;G.dirty=true;updStatus();return;}
  var m={a:G.pend,b:p};if(measLen(m)<0.05){G.pend=null;updStatus();return;}
  pushHist();ST.meas.push(m);G.pend=null;changed(true);
}
/* ---------- CAD export ---------- */
function doCad(kind){
  var ie=$('cIe').value.trim();if(!ie){$('cIe').classList.add('bad');$('cIe').focus();return;}$('cIe').classList.remove('bad');ST.ie=ie;lsSet('d3_ie',ie);
  var nm=safeName(ST.name),blob,ext;
  if(kind==='stl'){blob=makeStl(meshData());ext='.stl';}
  else if(kind==='obj'){blob=makeObj(meshData());ext='.obj';}
  else if(kind==='dxf3d'){blob=makeDxf3d(meshData());ext='_3d.dxf';}
  else if(kind==='dxf2d'){blob=makeDxf2d(false);ext='_top.dxf';}
  else{blob=makeDxf2d(true);ext='_flat.dxf';}
  download(blob,nm+ext);toast(t('t_cadok')+': '+nm+ext);
}
/* ---------- language, theme, wiring ---------- */
function applyLang(){
  [].forEach.call(document.querySelectorAll('[data-t]'),function(e){e.innerHTML=t(e.dataset.t);});
  [].forEach.call(document.querySelectorAll('[data-ph]'),function(e){e.placeholder=t(e.dataset.ph);});
  [].forEach.call(document.querySelectorAll('[data-tt]'),function(e){e.title=t(e.dataset.tt);});
  document.documentElement.lang=LANG;document.title=t('appName');
  [].forEach.call(document.querySelectorAll('.lang button'),function(b){b.classList.toggle('on',b.dataset.lang===LANG);});
  renderLib();renderList();renderProps();updStatus();pjChip();
}
function setLang(l){LANG=l;lsSet('ie_site_lang',l);applyLang();if($('dlgExp').classList.contains('on'))exRefresh();}
function closeDlg(){[].forEach.call(document.querySelectorAll('.modal.on'),function(m){m.classList.remove('on');});}
function init(){
  var l=lsGet('ie_site_lang');LANG=(l==='en')?'en':'vi';
  LOGO_IMG=new Image();LOGO_IMG.onload=function(){if($('dlgExp').classList.contains('on'))exRefresh();};LOGO_IMG.src=LOGO_URI;
  glInit($('gl'),$('ov'));glTheme();
  G.getPart=getPart;
  G.onPick=function(id,add){selectPart(id,add);};
  G.onDrag=function(id,x,y,first){var p=getPart(id);if(!p)return;if(first)pushHist();var dx=x-p.x,dy=y-p.y,ids=isSel(id)?SELS:[id];
    ids.forEach(function(i){var q=getPart(i);if(!q)return;q.x=Math.round((q.x+dx)*100)/100;q.y=Math.round((q.y+dy)*100)/100;
      for(var k=0;k<G.parts.children.length;k++){var g=G.parts.children[k];if(g.userData.id===i){g.position.x=q.x;g.position.y=q.y;}}});
    G.dirty=true;updateFields();updStatus();};
  G.onRuler=rulerPick;
  G.onDragEnd=function(){renderList();lsSet('d3_work',snap());};
  window.addEventListener('resize',function(){glResize();});
  if(window.ResizeObserver)new ResizeObserver(function(){glResize();}).observe($('view'));
  try{window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(){glTheme();glSetParts(ST.parts,SELS,ST.ref);});}catch(e){}
  (function loop(){glRender(realParts(ST.parts),SELS);requestAnimationFrame(loop);})();
  var w=lsGet('d3_work');if(w){try{var o=JSON.parse(w);if(o&&o.parts&&o.parts.length){ST=blank();ST.name=o.name||'';ST.style=o.style||'';ST.purpose=o.purpose||'';ST.notes=o.notes||'';ST.rev=o.rev||'1';ST.date=o.date||today();ST.ie=o.ie||ST.ie;ST.ref=o.ref||ST.ref;ST.meas=cleanMeas(o.meas);o.parts.forEach(function(p){ST.parts.push(cleanPart(p,ST.nid++));});}}catch(e){}}
  applyLang();changed(true);glView('iso',fitParts(),ST.ref);pjInit();
  $('snap').value=String(G.snap);
  /* events */
  [$('lib'),$('libT')].forEach(function(box){box.addEventListener('click',function(e){var b=e.target.closest('[data-add]');if(b)addPreset(b.dataset.add);});});
  $('list').addEventListener('click',function(e){var r=e.target.closest('[data-id]');if(r)selectPart(+r.dataset.id,e.ctrlKey||e.shiftKey||e.metaKey);});
  $('props').addEventListener('change',function(e){
    var t0=e.target;
    if(t0.id==='jnGap'){JN.gap=Math.max(1,num(t0.value,20));joinInfo();return;}
    if(t0.dataset.f)applyField(t0.dataset.f,t0.value);
    else if(t0.dataset.hi!==undefined)applyHole(+t0.dataset.hi,t0.dataset.hf,t0.value);
    else if(t0.dataset.reff!==undefined){var pp=getSel();if(pp)mut(function(){pp.ref=t0.checked;},true);}
    else if(t0.dataset.ref){mut(function(){if(t0.dataset.ref==='on')ST.ref.on=t0.checked;else ST.ref[t0.dataset.ref]=num(t0.value,0);},true);}
  });
  $('props').addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;
    if(b.dataset.act)doAct(b.dataset.act);else if(b.dataset.addh)addHole(b.dataset.addh);
    else if(b.dataset.delm!==undefined){var mi=+b.dataset.delm;mut(function(){ST.meas.splice(mi,1);},true);}
    else if(b.dataset.clrm){mut(function(){ST.meas=[];},true);}
    else if(b.dataset.bool)doBool(b.dataset.bool);else if(b.dataset.off)doOffset(+b.dataset.off);
    else if(b.dataset.del!==undefined){var p=getSel(),i=+b.dataset.del;mut(function(){p.holes.splice(i,1);},true);}
  });
  $('vbtns').addEventListener('click',function(e){var b=e.target.closest('[data-view]');if(!b)return;if(b.dataset.view==='fit')glFit(fitParts(),ST.ref);else glView(b.dataset.view,fitParts(),ST.ref);});
  $('snap').addEventListener('change',function(){G.snap=+$('snap').value;});
  $('dName').addEventListener('change',function(){ST.name=$('dName').value.slice(0,80);lsSet('d3_work',snap());});
  $('trMat').innerHTML=MAT_ORDER.map(function(m){return '<option value="'+m+'">'+esc(t('m_'+m))+'</option>';}).join('');
  $('bTrace').onclick=function(){$('dlgTr').classList.add('on');trDraw();};
  $('trFile').addEventListener('change',function(){trLoadFile(this.files[0]);this.value='';});
  ['trThr','trInv','trFill','trTol','trMin'].forEach(function(k){$(k).addEventListener('input',trUpdate);$(k).addEventListener('change',trUpdate);});
  $('trAuto').onclick=function(){if(!TR.gray)return;$('trThr').value=trOtsu(TR.gray);trUpdate();};
  $('trLen').addEventListener('input',function(){trSyncDims(false);});$('trWid').addEventListener('input',function(){trSyncDims(true);});
  $('trMake').onclick=trCreate;
  var dz=$('dlgTr');dz.addEventListener('dragover',function(e){e.preventDefault();});dz.addEventListener('drop',function(e){e.preventDefault();var f=e.dataTransfer.files[0];if(f)trLoadFile(f);});
  document.addEventListener('paste',function(e){if(!dz.classList.contains('on'))return;var it=(e.clipboardData||{}).items||[];for(var i=0;i<it.length;i++)if(it[i].type.indexOf('image')===0){trLoadFile(it[i].getAsFile());e.preventDefault();return;}});
  $('bRuler').onclick=function(){toggleRuler(G.mode!=='ruler');};
  $('bUndo').onclick=undo;$('bRedo').onclick=redo;$('bPdf').onclick=openExport;$('bSave').onclick=saveProject;
  $('bOpen').onclick=pjOpenDialog;
  $('bDir').onclick=function(){if(!window.showDirectoryPicker){toast(t('pj_nofs'));return;}pjPick().catch(function(){});};
  $('pjOther').onclick=function(){$('fOpen').click();closeDlg();};
  $('pjChange').onclick=function(){pjPick().then(pjOpenDialog).catch(function(){});};
  $('fOpen').addEventListener('change',function(){var f=this.files[0];if(!f)return;var r=new FileReader();r.onload=function(){loadProject(String(r.result));};r.readAsText(f);this.value='';});
  $('bNew').onclick=function(){if(ST.parts.length&&!confirm(t('c_new')))return;pushHist();ST=blank();SELS=[];changed(true);glView('iso',fitParts(),ST.ref);};
  $('bHelp').onclick=function(){$('dlgHelp').classList.add('on');};
  [].forEach.call(document.querySelectorAll('.lang button'),function(b){b.onclick=function(){setLang(b.dataset.lang);};});
  [].forEach.call(document.querySelectorAll('[data-close]'),function(b){b.onclick=closeDlg;});
  [].forEach.call(document.querySelectorAll('[data-ex]'),function(b){b.onclick=function(){closeDlg();loadExample(b.dataset.ex);};});
  $('bStart').onclick=closeDlg;
  ['eIe','eStyle','ePurpose','eNotes','eRev','eDate','pg3d','pgList','pgViews','pgPlates'].forEach(function(k){$(k).addEventListener('input',exLater);$(k).addEventListener('change',exLater);});
  $('pvPrev').onclick=function(){EX.idx--;exRefresh();};$('pvNext').onclick=function(){EX.idx++;exRefresh();};
  $('bDl').onclick=doDownload;
  $('bCad').onclick=function(){if(!ST.parts.length){toast(t('t_noparts'));return;}$('cIe').value=ST.ie||lsGet('d3_ie')||'';$('dlgCad').classList.add('on');};
  [].forEach.call(document.querySelectorAll('[data-cad]'),function(b){b.onclick=function(){doCad(b.dataset.cad);};});
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){closeDlg();if(G.mode==='ruler')toggleRuler(false);return;}
    var tg=e.target&&e.target.tagName;if(tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT')return;
    if($('dlgExp').classList.contains('on'))return;
    var k=e.key.toLowerCase(),st=e.shiftKey?10:1,s=G.snap*st;
    if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();undo();}
    else if((e.ctrlKey||e.metaKey)&&k==='y'){e.preventDefault();redo();}
    else if((e.ctrlKey||e.metaKey)&&k==='d'){e.preventDefault();doAct('dup');}
    else if((e.ctrlKey||e.metaKey)&&k==='s'){e.preventDefault();saveProject();}
    else if(k==='m'){toggleRuler(G.mode!=='ruler');}
    else if(k==='delete'||k==='backspace'){doAct('del');}
    else if(k==='r'){doAct(e.shiftKey?'rotl':'rotr');}
    else if(k==='arrowleft'){e.preventDefault();nudge(-s,0);}else if(k==='arrowright'){e.preventDefault();nudge(s,0);}
    else if(k==='arrowup'){e.preventDefault();nudge(0,s);}else if(k==='arrowdown'){e.preventDefault();nudge(0,-s);}
  });
  if(!lsGet('d3_seen')&&!ST.parts.length){$('dlgHelp').classList.add('on');lsSet('d3_seen','1');}
}
window.addEventListener('load',init);
