/* 2D shape maths: outlines of parts, merge (union / cut / intersect) and offset with Clipper (integer maths, 0.001 mm). */
var CSC=1000;
function ringArea(r){var a=0;for(var i=0,n=r.length;i<n;i++){var q=r[(i+1)%n];a+=r[i][0]*q[1]-q[0]*r[i][1];}return a/2;}
function polysArea(polys){var a=0;polys.forEach(function(q){a+=Math.abs(ringArea(q.o));q.h.forEach(function(h){a-=Math.abs(ringArea(h));});});return Math.max(a,0);}
/* bounding box of a poly part, re-centred on the origin; sets w, d */
function polyBox(p){
  var x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  p.polys.forEach(function(q){q.o.forEach(function(a){x0=Math.min(x0,a[0]);x1=Math.max(x1,a[0]);y0=Math.min(y0,a[1]);y1=Math.max(y1,a[1]);});});
  if(x0>x1){p.w=1;p.d=1;return;}
  var cx=(x0+x1)/2,cy=(y0+y1)/2;
  p.polys.forEach(function(q){[q.o].concat(q.h).forEach(function(r){r.forEach(function(a){a[0]-=cx;a[1]-=cy;});});});
  p.w=Math.max(0.5,x1-x0);p.d=Math.max(0.5,y1-y0);p.cx=cx;p.cy=cy;
}
function rrRing(w,h,r){
  r=Math.min(r||0,w/2,h/2);if(r<0.01)return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
  var pts=[],cs=[[w/2-r,-h/2+r,-90],[w/2-r,h/2-r,0],[-w/2+r,h/2-r,90],[-w/2+r,-h/2+r,180]];
  cs.forEach(function(c){for(var i=0;i<=8;i++){var a=rad(c[2]+i*90/8);pts.push([c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)]);}});return pts;
}
function circRing(r,n){var pts=[];n=n||48;for(var i=0;i<n;i++){var a=i*Math.PI*2/n;pts.push([r*Math.cos(a),r*Math.sin(a)]);}return pts;}
function shiftRing(r,dx,dy){return r.map(function(a){return [a[0]+dx,a[1]+dy];});}
/* outline of a part in its own coordinates (centre at 0, no rotation): list of {o:ring, h:[rings]} */
function polysLocal(p){
  if(p.kind==='poly')return JSON.parse(JSON.stringify(p.polys||[]));
  if(p.kind==='pin')return [{o:circRing(p.w/2),h:[]}];
  if(p.kind==='plate'){
    var hs=(p.holes||[]).map(function(h){
      if(h.t==='round')return shiftRing(circRing(h.a/2),h.x,h.y);
      if(h.t==='slot'){var b=Math.min(h.b,h.a);return shiftRing(rrRing(h.a,b,b/2),h.x,h.y);}
      return shiftRing(rrRing(h.a,h.b,h.c||0),h.x,h.y);
    });
    return [{o:rrRing(p.w,p.d,p.r||0),h:hs}];
  }
  return [{o:rrRing(p.w,p.d,0),h:[]}];
}
function polysWorld(p){
  var c=Math.cos(rad(p.rot||0)),s=Math.sin(rad(p.rot||0));
  function tr(r){return r.map(function(a){return [p.x+a[0]*c-a[1]*s,p.y+a[0]*s+a[1]*c];});}
  return polysLocal(p).map(function(q){return {o:tr(q.o),h:q.h.map(tr)};});
}
/* Clipper helpers */
function toClip(r){return r.map(function(a){return {X:Math.round(a[0]*CSC),Y:Math.round(a[1]*CSC)};});}
function fromClip(r){return r.map(function(a){return [a.X/CSC,a.Y/CSC];});}
function ringsOf(polys){var out=[];polys.forEach(function(q){out.push(toClip(q.o));q.h.forEach(function(h){out.push(toClip(h));});});return out;}
function cexec(op,subj,clip){
  var c=new ClipperLib.Clipper();c.AddPaths(subj,ClipperLib.PolyType.ptSubject,true);if(clip&&clip.length)c.AddPaths(clip,ClipperLib.PolyType.ptClip,true);
  var sol=new ClipperLib.Paths();c.Execute(op,sol,ClipperLib.PolyFillType.pftEvenOdd,ClipperLib.PolyFillType.pftEvenOdd);return sol;
}
function region(polys){return cexec(ClipperLib.ClipType.ctUnion,ringsOf(polys),[]);}
function pathsToPolys(paths){
  var c=new ClipperLib.Clipper();c.AddPaths(paths,ClipperLib.PolyType.ptSubject,true);var tree=new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctUnion,tree,ClipperLib.PolyFillType.pftEvenOdd,ClipperLib.PolyFillType.pftEvenOdd);
  var out=[];
  (function walk(node){node.Childs().forEach(function(ch){
    if(ch.IsHole())return;var q={o:fromClip(ch.Contour()),h:[]};
    ch.Childs().forEach(function(hn){q.h.push(fromClip(hn.Contour()));walk(hn);});out.push(q);
  });})(tree);
  return out.filter(function(q){return Math.abs(ringArea(q.o))>0.01;});
}
/* merge: mode 'union' | 'cut' (first minus the others) | 'and'. parts: array of parts; the first is the base. Returns poly list in world coordinates */
function booleanWorld(parts,mode){
  var acc=region(polysWorld(parts[0]));
  for(var i=1;i<parts.length;i++){
    var r=region(polysWorld(parts[i]));
    acc=cexec(mode==='union'?ClipperLib.ClipType.ctUnion:mode==='cut'?ClipperLib.ClipType.ctDifference:ClipperLib.ClipType.ctIntersection,acc,r);
  }
  return pathsToPolys(acc);
}
function clipGrow(paths,d){
  var base=cexec(ClipperLib.ClipType.ctUnion,paths,[]);if(!d)return base;
  var co=new ClipperLib.ClipperOffset(2,0.05*CSC);co.AddPaths(base,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
  var sol=new ClipperLib.Paths();co.Execute(sol,d*CSC);return sol;
}
/* Join shapes that are close together into ONE shape: closing (grow by r, shrink by r) with the smallest r that
   connects them; the holes of the plain union are kept. Returns {polys, gap} (gap = distance bridged, mm) or null. */
function joinWorld(parts,maxGap){
  var u=booleanWorld(parts,'union');if(!u.length)return null;
  if(u.length===1)return {polys:u,gap:0};
  var solid=[],holes=[];u.forEach(function(q){solid.push(toClip(q.o));q.h.forEach(function(h){holes.push(toClip(h));});});
  var r=0.5,lim=Math.max(maxGap,1)/2+0.001;
  while(r<=lim){
    var closed=clipGrow(clipGrow(solid,r),-r);
    if(holes.length)closed=cexec(ClipperLib.ClipType.ctDifference,closed,cexec(ClipperLib.ClipType.ctUnion,holes,[]));
    var polys=pathsToPolys(closed);
    if(polys.length===1)return {polys:polys,gap:Math.round(2*r*10)/10};
    r+=Math.max(0.5,r*0.2);
  }
  return null;
}
/* offset of the outline (what='outer') or of the holes (what='holes') of one part by delta mm (+ grows the shape / the holes). Returns local polys */
function offsetLocal(p,delta,what){
  var polys=polysLocal(p),outs=[],holes=[];
  polys.forEach(function(q){outs.push(toClip(q.o));q.h.forEach(function(h){holes.push(toClip(h));});});
  var grow=clipGrow;
  var res;
  if(what==='holes'){
    if(!holes.length)return null;
    res=cexec(ClipperLib.ClipType.ctDifference,cexec(ClipperLib.ClipType.ctUnion,outs,[]),grow(holes,delta));
  }else{
    var o2=grow(outs,delta);
    res=holes.length?cexec(ClipperLib.ClipType.ctDifference,o2,cexec(ClipperLib.ClipType.ctUnion,holes,[])):o2;
  }
  var out=pathsToPolys(res);return out.length?out:null;
}
