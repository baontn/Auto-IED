/* Sketch on a flat horizontal face and extrude (add a new solid or cut into the part); round the corners of a free shape. */
var SK=null,RD={r:3};
function r2(v){return Math.round(v*100)/100;}
function skRing(s){
  if(s.t==='rect')return [[s.cx-s.w/2,s.cy-s.h/2],[s.cx+s.w/2,s.cy-s.h/2],[s.cx+s.w/2,s.cy+s.h/2],[s.cx-s.w/2,s.cy+s.h/2]];
  if(s.t==='circle')return circRing(s.d/2,64).map(function(a){return [a[0]+s.cx,a[1]+s.cy];});
  return s.pts;
}
function skPolys(){return unionAll(SK.shapes.map(function(s){return [{o:skRing(s),h:[]}];}));}
function skStart(){
  if(!FACE||!FACE.planar||(FACE.kind!=='top'&&FACE.kind!=='bottom')){toast(t('sk_need'));return;}
  var o=getPart(FACE.pid),x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  FACE.tris.forEach(function(q){for(var i=0;i<9;i+=3){x0=Math.min(x0,q[i]);x1=Math.max(x1,q[i]);y0=Math.min(y0,q[i+1]);y1=Math.max(y1,q[i+1]);}});
  SK={z:FACE.z,kind:FACE.kind,pid:FACE.pid,tool:'rect',shapes:[],pend:[],hover:null,mode:'add',depth:10,mat:o?o.mat:'abs',name:''};
  if(G.mode==='face')toggleFace(false);if(G.mode==='ruler')toggleRuler(false);
  G.sketch=SK;G.mode='sketch';$('gl').style.cursor='crosshair';
  G.ctl.th=Math.PI/2;G.ctl.ph=SK.kind==='top'?0.001:Math.PI-0.001;G.ctl.tx=(x0+x1)/2;G.ctl.ty=SK.z;G.ctl.tz=-(y0+y1)/2;G.ctl.r=Math.max(2.1*Math.max(x1-x0,y1-y0),120);
  SELS=[];G.dirty=true;renderProps();updStatus();
}
function skEnd(){SK=null;G.sketch=null;if(G.mode==='sketch')G.mode=null;$('gl').style.cursor='';G.dirty=true;renderProps();updStatus();}
function skHint(){
  if(!SK)return '';var n=SK.pend.length;
  if(SK.tool==='rect')return t(n?'sk_h_rect2':'sk_h_rect1');
  if(SK.tool==='circle')return t(n?'sk_h_circ2':'sk_h_circ1');
  return t(n?'sk_h_poly2':'sk_h_poly1');
}
function skPoint(p){
  if(!SK||!p)return;var a=SK.pend[0];
  if(SK.tool==='rect'){
    if(!a)SK.pend=[p];
    else{var w=Math.abs(p[0]-a[0]),h=Math.abs(p[1]-a[1]);if(w>0.05&&h>0.05)SK.shapes.push({t:'rect',cx:r2((a[0]+p[0])/2),cy:r2((a[1]+p[1])/2),w:r2(w),h:r2(h)});SK.pend=[];renderProps();}
  }else if(SK.tool==='circle'){
    if(!a)SK.pend=[p];
    else{var d=2*Math.sqrt(Math.pow(p[0]-a[0],2)+Math.pow(p[1]-a[1],2));if(d>0.1)SK.shapes.push({t:'circle',cx:r2(a[0]),cy:r2(a[1]),d:r2(d)});SK.pend=[];renderProps();}
  }else{
    if(SK.pend.length>=3&&Math.sqrt(Math.pow(p[0]-a[0],2)+Math.pow(p[1]-a[1],2))<0.5)skClosePoly();else SK.pend.push(p);
  }
  G.dirty=true;updStatus();
}
function skClosePoly(){if(!SK||SK.pend.length<3)return;SK.shapes.push({t:'poly',pts:SK.pend.map(function(a){return [a[0],a[1]];})});SK.pend=[];renderProps();G.dirty=true;updStatus();}
function skPanel(){
  var h='<h3>✏ '+esc(t('sk_title'))+'</h3><div class="tip">'+esc(faceName())+'<br>'+esc(t('sk_tip'))+'</div>';
  h+='<div class="btns">'+[['rect','▭ '+t('sk_rect')],['circle','◯ '+t('sk_circle')],['poly','⬠ '+t('sk_poly')]].map(function(b){return '<button data-skb="tool:'+b[0]+'" class="'+(SK.tool===b[0]?'on':'')+'">'+esc(b[1])+'</button>';}).join('')+'</div>';
  h+='<div class="tipsm">'+esc(skHint())+'</div>';
  if(SK.tool==='poly'&&SK.pend.length>=3)h+='<div class="btns"><button data-skb="close">'+esc(t('sk_close'))+'</button></div>';
  h+='<h4>'+esc(t('sk_shapes'))+' ('+SK.shapes.length+')</h4>';
  SK.shapes.forEach(function(s,i){
    var f=function(k,l){return '<label class="f"><span>'+esc(l)+'</span><input type="number" data-sk="'+i+':'+k+'" value="'+s[k]+'" step="0.5"></label>';};
    h+='<div class="hole"><b>'+(s.t==='rect'?'▭':s.t==='circle'?'◯':'⬠')+' '+(i+1)+'</b><button class="x" data-skb="del:'+i+'" title="'+esc(t('b_del'))+'">✕</button>'+
      (s.t==='rect'?'<div class="grid3">'+f('cx','X')+f('cy','Y')+f('w',t('f_w'))+f('h',t('f_hh'))+'</div>':s.t==='circle'?'<div class="grid3">'+f('cx','X')+f('cy','Y')+f('d','Ø')+'</div>':'<div class="tipsm">'+s.pts.length+' '+esc(t('sk_pts'))+'</div>')+'</div>';
  });
  h+='<h4>'+esc(t('sk_extrude'))+'</h4><label class="f wide"><span>'+esc(t('sk_mode'))+'</span><select data-sk="mode"><option value="add"'+(SK.mode==='add'?' selected':'')+'>'+esc(t('sk_add'))+'</option><option value="cut"'+(SK.mode==='cut'?' selected':'')+'>'+esc(t('sk_cut'))+'</option></select></label>';
  h+='<div class="grid3">'+'<label class="f"><span>'+esc(t('sk_depth'))+'</span><input type="number" data-sk="depth" value="'+SK.depth+'" min="0.1" step="0.5"><i>mm</i></label></div>';
  if(SK.mode==='add')h+='<label class="f wide"><span>'+esc(t('f_mat'))+'</span><select data-sk="mat">'+MAT_ORDER.map(function(m){return '<option value="'+m+'"'+(m===SK.mat?' selected':'')+'>'+esc(t('m_'+m))+'</option>';}).join('')+'</select></label>'+
    '<label class="f wide"><span>'+esc(t('f_name'))+'</span><input type="text" data-sk="name" value="'+esc(SK.name)+'" maxlength="60" placeholder="'+esc(t('sk_ext_name'))+'"></label>';
  else h+='<div class="tipsm">'+esc(t('sk_cuttip'))+'</div>';
  h+='<div class="btns end"><button class="primary" data-skb="apply"'+(SK.shapes.length?'':' disabled')+'>✔ '+esc(t('sk_apply'))+'</button><button data-skb="cancel">'+esc(t('sk_cancel'))+'</button></div>';
  return h;
}
function skChange(el){
  var k=el.dataset.sk;if(!SK)return;
  if(k==='mode'){SK.mode=el.value;renderProps();return;}
  if(k==='depth'){SK.depth=Math.max(0.1,num(el.value,10));return;}
  if(k==='mat'){SK.mat=el.value;return;}
  if(k==='name'){SK.name=el.value.slice(0,60);return;}
  var m=k.split(':'),s=SK.shapes[+m[0]];if(!s)return;var v=num(el.value,s[m[1]]);if(m[1]==='w'||m[1]==='h'||m[1]==='d')v=Math.max(0.1,v);s[m[1]]=v;G.dirty=true;
}
function skBtn(v){
  if(!SK)return;var m=v.split(':');
  if(m[0]==='tool'){SK.tool=m[1];SK.pend=[];renderProps();updStatus();G.dirty=true;}
  else if(m[0]==='del'){SK.shapes.splice(+m[1],1);renderProps();G.dirty=true;}
  else if(m[0]==='close')skClosePoly();
  else if(m[0]==='apply')skExtrude();
  else if(m[0]==='cancel')skEnd();
}
function skExtrude(){
  var polys=skPolys();if(!polys.length){toast(t('sk_empty'));return;}
  var o=getPart(SK.pid),d=Math.max(0.1,SK.depth),top=SK.kind==='top',made=[];
  if(SK.mode==='add'){
    mut(function(){var q=polyPart(polys,{z:top?SK.z:SK.z-d,h:d,mat:SK.mat},SK.name||t('sk_ext_name'));ST.parts.push(q);SELS=[q.id];},true);
  }else{
    if(!o||['plate','block','poly'].indexOf(o.kind)<0){toast(t('sk_cutkind'));return;}
    var own=polysWorld(o),H=o.h,cutp=cutPolys(own,polys),nm=o.name||t('k_'+o.kind);
    if(!cutp.length||Math.abs(polysArea(cutp)-polysArea(own))<1e-6){toast(t('sk_noeffect'));return;}
    var through=d>=H-0.01;
    mut(function(){
      var idx=ST.parts.indexOf(o),news=[];
      if(through)news.push(polyPart(cutp,{z:o.z,h:H,mat:o.mat},nm+' ('+t('sk_cut_sfx')+')'));
      else if(top){news.push(polyPart(polysWorld(o),{z:o.z,h:H-d,mat:o.mat},nm+' 1/2'));news.push(polyPart(cutp,{z:o.z+H-d,h:d,mat:o.mat},nm+' 2/2'));}
      else{news.push(polyPart(cutp,{z:o.z,h:d,mat:o.mat},nm+' 1/2'));news.push(polyPart(polysWorld(o),{z:o.z+d,h:H-d,mat:o.mat},nm+' 2/2'));}
      ST.parts.splice.apply(ST.parts,[idx,1].concat(news));SELS=news.map(function(q){return q.id;});
    },true);
  }
  FACE=null;skEnd();toast(t('sk_done'));
}
/* round the corners of a free shape */
function doRound(mode){
  var p=getSel();if(!p||p.kind!=='poly')return;var r=Math.max(0.2,Math.abs(num(($('rdR')||{}).value,RD.r)));RD.r=r;
  var res;try{res=roundPolys(p.polys,r,mode);}catch(e){res=null;}
  if(!res||!res.length){toast(t('rd_fail'));return;}
  mut(function(){
    p.polys=res;polyBox(p);var c=Math.cos(rad(p.rot||0)),s=Math.sin(rad(p.rot||0)),cx=p.cx,cy=p.cy;delete p.cx;delete p.cy;
    p.x+=cx*c-cy*s;p.y+=cx*s+cy*c;
  },true);toast(t('rd_done'));
}
