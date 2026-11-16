/* Parts model, materials and geometry maths. Units: mm, grams. Design axes: X right, Y away from the viewer, Z up. */
var MATS={acrylic:{dens:1.18,col:'#8ccdf0',op:0.5,met:0},abs:{dens:1.05,col:'#e4e4e4',op:1,met:0},alu:{dens:2.7,col:'#c0c8d0',op:1,met:0.3},
  steel:{dens:7.85,col:'#707883',op:1,met:0.35},wood:{dens:0.65,col:'#c9a36b',op:1,met:0},rubber:{dens:1.1,col:'#3a3e45',op:1,met:0}};
var MAT_ORDER=['acrylic','abs','alu','steel','wood','rubber'];
/* ready-made parts shown as big buttons; mk() gives the size/material/holes */
var PRESETS=[
 {id:'plate',kind:'plate',ico:'▭',mk:function(){return {w:150,d:100,h:3,r:5,mat:'acrylic',holes:[]};}},
 {id:'window',kind:'plate',ico:'▣',mk:function(){return {w:180,d:140,h:3,r:6,mat:'acrylic',holes:[{t:'rect',x:0,y:0,a:120,b:80,c:6}]};}},
 {id:'holes',kind:'plate',ico:'⁙',mk:function(){return {w:150,d:100,h:3,r:5,mat:'abs',holes:[{t:'round',x:-60,y:-35,a:6},{t:'round',x:60,y:-35,a:6},{t:'round',x:-60,y:35,a:6},{t:'round',x:60,y:35,a:6}]};}},
 {id:'slot',kind:'plate',ico:'⊟',mk:function(){return {w:150,d:100,h:3,r:5,mat:'abs',holes:[{t:'slot',x:0,y:0,a:80,b:8}]};}},
 {id:'rail',kind:'block',ico:'▬',mk:function(){return {w:150,d:5,h:10,r:0,mat:'alu',holes:[]};}},
 {id:'stop',kind:'block',ico:'▪',mk:function(){return {w:15,d:10,h:8,r:0,mat:'steel',holes:[]};}},
 {id:'block',kind:'block',ico:'■',mk:function(){return {w:50,d:50,h:20,r:0,mat:'abs',holes:[]};}},
 {id:'pin',kind:'pin',ico:'●',mk:function(){return {w:6,d:6,h:15,r:0,mat:'steel',holes:[]};}},
 {id:'wedge',kind:'wedge',ico:'◢',mk:function(){return {w:40,d:30,h:10,r:0,mat:'abs',holes:[]};}}
];
function presetById(id){for(var i=0;i<PRESETS.length;i++)if(PRESETS[i].id===id)return PRESETS[i];return null;}
function rad(d){return d*Math.PI/180;}
function num(v,def){v=parseFloat(v);return isFinite(v)?v:def;}
function round1(v){return Math.round(v*10)/10;}
/* footprint corners (rotated) and bounding box */
function corners(p){
  if(p.kind==='pin')return [[p.x-p.w/2,p.y-p.w/2],[p.x+p.w/2,p.y-p.w/2],[p.x+p.w/2,p.y+p.w/2],[p.x-p.w/2,p.y+p.w/2]];
  var c=Math.cos(rad(p.rot||0)),s=Math.sin(rad(p.rot||0)),hw=p.w/2,hd=p.d/2;
  return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(function(q){return [p.x+q[0]*c-q[1]*s,p.y+q[0]*s+q[1]*c];});
}
function fp(p){var c=corners(p),x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;c.forEach(function(q){x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1]);});return {x0:x0,x1:x1,y0:y0,y1:y1};}
function bboxAll(parts){
  if(!parts.length)return null;var b={x0:1e9,x1:-1e9,y0:1e9,y1:-1e9,z0:1e9,z1:-1e9};
  parts.forEach(function(p){var f=fp(p);b.x0=Math.min(b.x0,f.x0);b.x1=Math.max(b.x1,f.x1);b.y0=Math.min(b.y0,f.y0);b.y1=Math.max(b.y1,f.y1);b.z0=Math.min(b.z0,p.z);b.z1=Math.max(b.z1,p.z+p.h);});
  return b;
}
/* material volume (mm3), weight (g) */
function holeArea(h){
  if(h.t==='round')return Math.PI*h.a*h.a/4;
  if(h.t==='slot'){var b=Math.min(h.b,h.a);return (h.a-b)*b+Math.PI*b*b/4;}
  var c=Math.min(h.c||0,h.a/2,h.b/2);return h.a*h.b-(4-Math.PI)*c*c;
}
function areaOf(p){var r=Math.min(p.r||0,p.w/2,p.d/2),a=p.w*p.d-(4-Math.PI)*r*r;(p.holes||[]).forEach(function(h){a-=holeArea(h);});return Math.max(a,0);}
function volOf(p){
  if(p.kind==='plate')return areaOf(p)*p.h;
  if(p.kind==='pin')return Math.PI*p.w*p.w/4*p.h;
  if(p.kind==='wedge')return p.w*p.d*p.h/2;
  return p.w*p.d*p.h;
}
function weightOf(p){var m=MATS[p.mat]||MATS.abs;return volOf(p)/1000*m.dens;}
/* Z of the highest part under the footprint of p (to put p on top) */
function topUnder(parts,p){
  var f=fp(p),z=0;
  parts.forEach(function(q){if(q.id===p.id)return;var g=fp(q);if(g.x0<f.x1-0.01&&g.x1>f.x0+0.01&&g.y0<f.y1-0.01&&g.y1>f.y0+0.01)z=Math.max(z,q.z+q.h);});
  return z;
}
/* 3D vertices of a part (silhouettes in the front / side views) */
function vertsOf(p){
  var v=[],c=Math.cos(rad(p.rot||0)),s=Math.sin(rad(p.rot||0)),hw=p.w/2,hd=p.d/2;
  function put(lx,ly,lz){v.push([p.x+lx*c-ly*s,p.y+lx*s+ly*c,p.z+lz]);}
  if(p.kind==='pin'){var r=p.w/2;[[-r,-r],[r,-r],[r,r],[-r,r]].forEach(function(q){v.push([p.x+q[0],p.y+q[1],p.z],[p.x+q[0],p.y+q[1],p.z+p.h]);});return v;}
  if(p.kind==='wedge'){[[-hw,-hd,0],[hw,-hd,0],[hw,hd,0],[-hw,hd,0],[hw,-hd,p.h],[hw,hd,p.h]].forEach(function(q){put(q[0],q[1],q[2]);});return v;}
  [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].forEach(function(q){put(q[0],q[1],0);put(q[0],q[1],p.h);});return v;
}
function hull(pts){
  pts=pts.slice().sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});if(pts.length<3)return pts;
  function cr(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);}
  var lo=[],up=[],i;
  for(i=0;i<pts.length;i++){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],pts[i])<=0)lo.pop();lo.push(pts[i]);}
  for(i=pts.length-1;i>=0;i--){while(up.length>=2&&cr(up[up.length-2],up[up.length-1],pts[i])<=0)up.pop();up.push(pts[i]);}
  lo.pop();up.pop();return lo.concat(up);
}
/* clean numbers of a part read from a file or typed */
function cleanPart(p,id){
  var k=['plate','block','pin','wedge'].indexOf(p.kind)<0?'block':p.kind;
  var o={id:id,kind:k,name:String(p.name||'').slice(0,60),x:num(p.x,0),y:num(p.y,0),z:num(p.z,0),rot:num(p.rot,0),
    w:Math.max(0.5,num(p.w,50)),d:Math.max(0.5,num(p.d,50)),h:Math.max(0.5,num(p.h,10)),r:Math.max(0,num(p.r,0)),mat:MATS[p.mat]?p.mat:'abs',holes:[]};
  if(k==='pin')o.d=o.w;
  (p.holes||[]).forEach(function(h){if(['round','slot','rect'].indexOf(h.t)<0)return;o.holes.push({t:h.t,x:num(h.x,0),y:num(h.y,0),a:Math.max(0.5,num(h.a,6)),b:Math.max(0.5,num(h.b,6)),c:Math.max(0,num(h.c,0))});});
  return o;
}
