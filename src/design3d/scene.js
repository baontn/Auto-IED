/* 3D scene (three.js): build meshes from the parts, own orbit camera, picking and dragging, picture for the PDF.
   Everything inside G.root uses the DESIGN axes (z up); G.root is turned so that z points up in three.js. */
var G={ren:null,scene:null,cam:null,root:null,parts:null,refg:null,grid:null,ctl:{th:Math.PI/2-0.6,ph:1.0,r:600,tx:0,ty:0,tz:0},dirty:true,drag:null,ray:null,onPick:null,onDrag:null,onDragEnd:null,snap:5,meas:[],mode:null,pend:null,hover:null,snapPts:[],gridExt:250,onRuler:null,meshList:[],snapSegs:[],hoverSnap:null,hl:null,onFace:null,onFaceHover:null,faceKey:'',faceCache:null,keepSel:false};
function cssVar(n,d){try{var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||d;}catch(e){return d;}}
function glInit(canvas,ovCanvas){
  G.cv=canvas;G.ov=ovCanvas;
  G.ren=new THREE.WebGLRenderer({canvas:canvas,antialias:true});G.ren.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  G.scene=new THREE.Scene();G.cam=new THREE.PerspectiveCamera(35,1,1,50000);
  G.scene.add(new THREE.AmbientLight(0xffffff,0.7));
  var d1=new THREE.DirectionalLight(0xffffff,0.75);d1.position.set(300,700,500);G.scene.add(d1);
  var d2=new THREE.DirectionalLight(0xffffff,0.3);d2.position.set(-400,300,-300);G.scene.add(d2);
  G.root=new THREE.Group();G.root.rotation.x=-Math.PI/2;G.scene.add(G.root);
  G.parts=new THREE.Group();G.root.add(G.parts);G.refg=new THREE.Group();G.root.add(G.refg);
  G.ray=new THREE.Raycaster();
  bindGl();glResize();
}
function glTheme(){var bg=cssVar('--vbg','#eef1f5');G.ren.setClearColor(new THREE.Color(bg),1);G.dirty=true;}
function glResize(){
  var w=G.cv.clientWidth||300,h=G.cv.clientHeight||200;G.ren.setSize(w,h,false);G.ov.width=w;G.ov.height=h;G.cam.aspect=w/h;G.cam.updateProjectionMatrix();G.dirty=true;
}
function rrPath(path,x,y,w,h,r){
  r=Math.max(0,Math.min(r,w/2,h/2));
  if(r<=0.01){path.moveTo(x,y);path.lineTo(x+w,y);path.lineTo(x+w,y+h);path.lineTo(x,y+h);path.closePath();return;}
  path.moveTo(x+r,y);path.lineTo(x+w-r,y);path.absarc(x+w-r,y+r,r,-Math.PI/2,0,false);path.lineTo(x+w,y+h-r);path.absarc(x+w-r,y+h-r,r,0,Math.PI/2,false);
  path.lineTo(x+r,y+h);path.absarc(x+r,y+h-r,r,Math.PI/2,Math.PI,false);path.lineTo(x,y+r);path.absarc(x+r,y+r,r,Math.PI,Math.PI*1.5,false);path.closePath();
}
function shapeOf(q){
  var s=new THREE.Shape(q.o.map(function(a){return new THREE.Vector2(a[0],a[1]);}));
  q.h.forEach(function(h){s.holes.push(new THREE.Path(h.map(function(a){return new THREE.Vector2(a[0],a[1]);})));});return s;
}
function partGeometry(p){
  var g;
  if(p.kind==='poly'){return p.polys.map(function(q){return {geo:new THREE.ExtrudeGeometry(shapeOf(q),{depth:p.h,bevelEnabled:false})};});}
  if(p.kind==='table'){
    var ls=legSize(p),ins=Math.min(30,p.w/8),top=new THREE.BoxGeometry(p.w,p.d,p.tt),out=[];top.translate(0,0,p.h-p.tt/2);out.push({geo:top});
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(q){var l=new THREE.BoxGeometry(ls,ls,p.h-p.tt);l.translate(q[0]*(p.w/2-ins-ls/2),q[1]*(p.d/2-ins-ls/2),(p.h-p.tt)/2);out.push({geo:l,col:'#8a929c'});});
    return out;
  }
  if(p.kind==='wheel'){
    var tire=new THREE.CylinderGeometry(p.w/2,p.w/2,p.d,48),hub=new THREE.CylinderGeometry(p.w*0.28,p.w*0.28,p.d*1.12,32);
    tire.translate(0,0,p.w/2);hub.translate(0,0,p.w/2);   /* axis along local Y, centre p.w/2 above the bottom */
    return [{geo:tire},{geo:hub,col:'#9aa3ad'}];
  }
  if(p.kind==='handle'){
    var r=p.d/2,ph=Math.max(p.h-r,1),px=p.w/2-r,gp=new THREE.CylinderGeometry(r,r,p.w,24);gp.rotateZ(Math.PI/2);gp.translate(0,0,p.h-r);
    var out=[{geo:gp}];[-px,px].forEach(function(x){var c=new THREE.CylinderGeometry(r,r,ph,20);c.rotateX(Math.PI/2);c.translate(x,0,ph/2);out.push({geo:c});});return out;
  }
  if(p.kind==='plate'){
    var s=new THREE.Shape();rrPath(s,-p.w/2,-p.d/2,p.w,p.d,p.r||0);
    (p.holes||[]).forEach(function(h){
      var q=new THREE.Path();
      if(h.t==='round')q.absarc(h.x,h.y,h.a/2,0,Math.PI*2,false);
      else if(h.t==='slot'){var b=Math.min(h.b,h.a);rrPath(q,h.x-h.a/2,h.y-b/2,h.a,b,b/2);}
      else rrPath(q,h.x-h.a/2,h.y-h.b/2,h.a,h.b,h.c||0);
      s.holes.push(q);
    });
    g=new THREE.ExtrudeGeometry(s,{depth:p.h,bevelEnabled:false,curveSegments:24});
  }else if(p.kind==='pin'){
    g=new THREE.CylinderGeometry(p.w/2,p.w/2,p.h,40);g.rotateX(Math.PI/2);g.translate(0,0,p.h/2);
  }else if(p.kind==='wedge'){
    var t=new THREE.Shape();t.moveTo(-p.w/2,0);t.lineTo(p.w/2,0);t.lineTo(p.w/2,p.h);t.closePath();
    g=new THREE.ExtrudeGeometry(t,{depth:p.d,bevelEnabled:false});g.rotateX(Math.PI/2);g.translate(0,p.d/2,0);
  }else{g=new THREE.BoxGeometry(p.w,p.d,p.h);g.translate(0,0,p.h/2);}
  return [{geo:g}];
}
function selArr(s){return s==null?[]:(Array.isArray(s)?s:[s]);}
function buildPart(p,selected){
  var g=new THREE.Group(),m=MATS[p.mat]||MATS.abs;
  partGeometry(p).forEach(function(it){
    var mat=new THREE.MeshStandardMaterial({color:new THREE.Color(it.col||m.col),roughness:0.55,metalness:m.met,transparent:m.op<1,opacity:m.op,side:m.op<1?THREE.DoubleSide:THREE.FrontSide,depthWrite:m.op>=1});
    if(selected){mat.emissive=new THREE.Color(0x1f6feb);mat.emissiveIntensity=0.45;}
    g.add(new THREE.Mesh(it.geo,mat));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(it.geo,25),new THREE.LineBasicMaterial({color:selected?0x0b5cad:0x2b3340,transparent:true,opacity:selected?1:0.55})));
  });
  g.position.set(p.x,p.y,p.z);g.rotation.z=rad(p.rot||0);g.userData.id=p.id;
  return g;
}
function glSetParts(parts,sel,ref){
  var i,sa=selArr(sel);
  while(G.parts.children.length){var c=G.parts.children[0];G.parts.remove(c);c.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}
  for(i=0;i<parts.length;i++)G.parts.add(buildPart(parts[i],sa.indexOf(parts[i].id)>=0));
  while(G.refg.children.length){var r=G.refg.children[0];G.refg.remove(r);r.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}
  if(ref&&ref.on){
    var bed=new THREE.Mesh(new THREE.BoxGeometry(REF_BED.w,REF_BED.d,REF_BED.t),new THREE.MeshStandardMaterial({color:0x8a94a3,transparent:true,opacity:0.35,roughness:0.8}));
    bed.position.set(ref.nx,ref.ny,-REF_BED.t/2);G.refg.add(bed);
    var plate=new THREE.Mesh(new THREE.BoxGeometry(60,30,0.6),new THREE.MeshStandardMaterial({color:0xb7bec9,roughness:0.4,metalness:0.5}));plate.position.set(ref.nx,ref.ny,0.3);G.refg.add(plate);
    var nd=new THREE.Mesh(new THREE.CylinderGeometry(1,1,35,12),new THREE.MeshBasicMaterial({color:0xed1c24}));nd.rotateX(Math.PI/2);nd.position.set(ref.nx,ref.ny,17.5);G.refg.add(nd);
  }
  collectGeo();buildSnap(parts);glGrid(parts,ref);G.dirty=true;
}
var REF_BED={w:420,d:180,t:20};
function glGrid(parts,ref){
  if(G.grid){G.root.remove(G.grid);G.grid.geometry.dispose();G.grid.material.dispose();}
  var b=bboxAll(parts),ext=250;
  if(b)ext=Math.max(ext,Math.abs(b.x0),Math.abs(b.x1),Math.abs(b.y0),Math.abs(b.y1)+0);
  if(ref&&ref.on)ext=Math.max(ext,Math.abs(ref.nx)+REF_BED.w/2,Math.abs(ref.ny)+REF_BED.d/2);
  ext=Math.ceil((ext+60)/50)*50;G.gridExt=ext;
  var gh=new THREE.GridHelper(ext*2,ext/5,new THREE.Color(cssVar('--vgrid2','#b6bfcc')),new THREE.Color(cssVar('--vgrid','#d5dbe4')));
  gh.rotation.x=Math.PI/2;gh.position.z=-0.2;G.root.add(gh);G.grid=gh;
}
/* camera */
function glCamUpdate(){
  var c=G.ctl;G.cam.up.set(0,1,0);
  G.cam.position.set(c.tx+c.r*Math.sin(c.ph)*Math.cos(c.th),c.ty+c.r*Math.cos(c.ph),c.tz+c.r*Math.sin(c.ph)*Math.sin(c.th));
  G.cam.lookAt(c.tx,c.ty,c.tz);G.cam.updateMatrixWorld();
}
function glFit(parts,ref){
  var b=bboxAll(parts),cx=0,cy=0,cz=0,diag=300;
  if(b){cx=(b.x0+b.x1)/2;cy=(b.y0+b.y1)/2;cz=(b.z0+b.z1)/2;diag=Math.sqrt(Math.pow(b.x1-b.x0,2)+Math.pow(b.y1-b.y0,2)+Math.pow(b.z1-b.z0,2));}
  if(ref&&ref.on){diag=Math.max(diag,260);}
  diag=Math.max(diag,120);
  G.ctl.tx=cx;G.ctl.ty=cz;G.ctl.tz=-cy;G.ctl.r=diag*0.5/Math.tan(rad(35/2))*1.25;G.dirty=true;
}
function glView(name,parts,ref){
  var v={iso:[Math.PI/2-0.6,1.0],top:[Math.PI/2,0.001],front:[Math.PI/2,Math.PI/2],right:[0,Math.PI/2]}[name]||[Math.PI/2-0.6,1.0];
  G.ctl.th=v[0];G.ctl.ph=v[1];glFit(parts,ref);G.dirty=true;
}
/* projection helper: design point -> pixel */
function projPt(cam,w,h,x,y,z){var v=new THREE.Vector3(x,z,-y);v.project(cam);return {x:(v.x+1)/2*w,y:(1-v.y)/2*h,ok:v.z<1};}
/* labels (part numbers) and the X Y Z triad drawn over the 3D picture */
function drawMeas(ctx,cam,w,h,a,b,k,live){
  var p=projPt(cam,w,h,a[0],a[1],a[2]),q=projPt(cam,w,h,b[0],b[1],b[2]);if(!p.ok||!q.ok)return;
  var d=Math.sqrt(Math.pow(b[0]-a[0],2)+Math.pow(b[1]-a[1],2)+Math.pow(b[2]-a[2],2));
  ctx.save();ctx.strokeStyle='#e8590c';ctx.fillStyle='#e8590c';ctx.lineWidth=2*k;if(live)ctx.setLineDash([6*k,4*k]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([]);
  [p,q].forEach(function(e){ctx.beginPath();ctx.arc(e.x,e.y,4*k,0,Math.PI*2);ctx.fill();});
  var s1=fmt(d)+' mm',s2='ΔX '+fmt(Math.abs(b[0]-a[0]))+'  ΔY '+fmt(Math.abs(b[1]-a[1]))+'  ΔZ '+fmt(Math.abs(b[2]-a[2])),mx=(p.x+q.x)/2,my=(p.y+q.y)/2;
  ctx.font='bold '+Math.round(13*k)+'px Segoe UI,Arial';var w1=ctx.measureText(s1).width;ctx.font=Math.round(10*k)+'px Segoe UI,Arial';var w2=ctx.measureText(s2).width,bw=Math.max(w1,w2)+10*k;
  ctx.fillStyle='rgba(255,255,255,0.93)';ctx.fillRect(mx-bw/2,my-18*k,bw,34*k);ctx.strokeStyle='#e8590c';ctx.lineWidth=1*k;ctx.strokeRect(mx-bw/2,my-18*k,bw,34*k);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#b34000';ctx.font='bold '+Math.round(13*k)+'px Segoe UI,Arial';ctx.fillText(s1,mx,my-4*k);ctx.fillStyle='#555';ctx.font=Math.round(10*k)+'px Segoe UI,Arial';ctx.fillText(s2,mx,my+11*k);ctx.restore();
}
function drawOverlay(ctx,cam,w,h,parts,sel,k,live){
  var sa=selArr(sel);
  cam.updateMatrixWorld();cam.updateProjectionMatrix();
  var o=projPt(cam,w,h,0,0,0),ax=[['X',60,0,0,'#d03030'],['Y',0,60,0,'#2e9a3e'],['Z',0,0,60,'#2a62d6']];
  ctx.save();ctx.lineWidth=2*k;ctx.font='bold '+Math.round(12*k)+'px Segoe UI,Arial';ctx.textAlign='center';ctx.textBaseline='middle';
  ax.forEach(function(a){var e=projPt(cam,w,h,a[1],a[2],a[3]);if(!o.ok||!e.ok)return;ctx.strokeStyle=a[4];ctx.fillStyle=a[4];ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(e.x,e.y);ctx.stroke();ctx.fillText(a[0],e.x+(e.x-o.x)*0.18,e.y+(e.y-o.y)*0.18);});
  if(live){
    var step=G.ctl.r<250?10:G.ctl.r<600?50:G.ctl.r<1500?100:G.ctl.r<4000?200:500,ext=Math.min(G.gridExt||250,2500),v;
    ctx.fillStyle='#6b7280';ctx.font='10px Segoe UI,Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    for(v=-ext;v<=ext;v+=step){if(!v)continue;var qx=projPt(cam,w,h,v,0,0),qy=projPt(cam,w,h,0,v,0);if(qx.ok)ctx.fillText(String(v),qx.x,qx.y+9);if(qy.ok)ctx.fillText(String(v),qy.x-12,qy.y);}
  }
  parts.forEach(function(p,i){
    var q=projPt(cam,w,h,p.x,p.y,p.z+p.h);if(!q.ok)return;var sel=sa.indexOf(p.id)>=0,rr=(sel?12:10)*k;
    ctx.beginPath();ctx.arc(q.x,q.y-rr,rr,0,Math.PI*2);ctx.fillStyle=sel?'#1f6feb':'#ffffff';ctx.fill();ctx.lineWidth=1.5*k;ctx.strokeStyle=sel?'#0b3d91':'#1d2330';ctx.stroke();
    ctx.fillStyle=sel?'#ffffff':'#1d2330';ctx.font='bold '+Math.round(12*k)+'px Segoe UI,Arial';ctx.fillText(String(i+1),q.x,q.y-rr+0.5*k);
    if(live&&p.lock){ctx.font='11px Segoe UI,Arial';ctx.fillText('🔒',q.x+rr+6,q.y-rr);ctx.font='bold '+Math.round(12*k)+'px Segoe UI,Arial';}
  });
  ctx.restore();
  (G.meas||[]).forEach(function(m){drawMeas(ctx,cam,w,h,m.a,m.b,k,false);});
  if(live&&G.mode==='ruler'&&G.hoverSnap&&G.hoverSnap.snap){
    var hs=G.hoverSnap,hp=projPt(cam,w,h,hs.p[0],hs.p[1],hs.p[2]);ctx.save();ctx.lineCap='round';
    if(hs.a){var ea=projPt(cam,w,h,hs.a[0],hs.a[1],hs.a[2]),eb=projPt(cam,w,h,hs.b[0],hs.b[1],hs.b[2]);if(ea.ok&&eb.ok){ctx.strokeStyle=hs.type==='e'?'#ff8a00':'rgba(255,138,0,0.55)';ctx.lineWidth=(hs.type==='e'?5:3);ctx.beginPath();ctx.moveTo(ea.x,ea.y);ctx.lineTo(eb.x,eb.y);ctx.stroke();}}
    if(hp.ok){
      ctx.fillStyle='#ff8a00';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();
      if(hs.type==='m'){ctx.moveTo(hp.x,hp.y-8);ctx.lineTo(hp.x+7,hp.y+6);ctx.lineTo(hp.x-7,hp.y+6);ctx.closePath();}else ctx.arc(hp.x,hp.y,hs.type==='v'?7:5,0,Math.PI*2);
      ctx.fill();ctx.stroke();
      var tx=hs.type==='v'?t('rl_vertex'):hs.type==='m'?t('rl_mid')+' · '+t('rl_edge')+' '+fmt(hs.len)+' mm':t('rl_edge')+' '+fmt(hs.len)+' mm';
      ctx.font='bold 12px Segoe UI,Arial';var tw=ctx.measureText(tx).width+10;ctx.fillStyle='rgba(255,255,255,0.95)';ctx.fillRect(hp.x+12,hp.y-26,tw,20);ctx.strokeStyle='#ff8a00';ctx.lineWidth=1;ctx.strokeRect(hp.x+12,hp.y-26,tw,20);ctx.fillStyle='#b34000';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(tx,hp.x+17,hp.y-16);
    }
    ctx.restore();
  }
  if(live&&G.facePt){var fp=projPt(cam,w,h,G.facePt[0],G.facePt[1],G.facePt[2]);if(fp.ok){ctx.save();ctx.strokeStyle='#ff6a00';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(fp.x-10,fp.y);ctx.lineTo(fp.x+10,fp.y);ctx.moveTo(fp.x,fp.y-10);ctx.lineTo(fp.x,fp.y+10);ctx.stroke();ctx.beginPath();ctx.arc(fp.x,fp.y,6,0,Math.PI*2);ctx.stroke();ctx.restore();}}
  if(live&&G.pend){if(G.hover)drawMeas(ctx,cam,w,h,G.pend,G.hover,k,true);else{var pp=projPt(cam,w,h,G.pend[0],G.pend[1],G.pend[2]);ctx.fillStyle='#e8590c';ctx.beginPath();ctx.arc(pp.x,pp.y,5,0,Math.PI*2);ctx.fill();}}
}
function glRender(parts,selId){
  if(!G.dirty)return;G.dirty=false;
  glCamUpdate();G.ren.render(G.scene,G.cam);
  var c=G.ov.getContext('2d');c.clearRect(0,0,G.ov.width,G.ov.height);drawOverlay(c,G.cam,G.ov.width,G.ov.height,parts,selId,1,true);
}
/* picture for the PDF (own renderer, white background, no grid) */
function glShot(parts,selId,ref,w,h){
  var r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setPixelRatio(1);r.setSize(w,h,false);r.setClearColor(0xffffff,1);
  var cam=new THREE.PerspectiveCamera(30,w/h,1,50000);
  var b=bboxAll(parts),cx=0,cy=0,cz=0,rad0=150;
  if(b){cx=(b.x0+b.x1)/2;cy=(b.y0+b.y1)/2;cz=(b.z0+b.z1)/2;rad0=Math.max(40,0.5*Math.sqrt(Math.pow(b.x1-b.x0,2)+Math.pow(b.y1-b.y0,2)+Math.pow(b.z1-b.z0,2)));}
  if(ref&&ref.on)rad0=Math.max(rad0,200);
  var dist=rad0/Math.sin(rad(15))*1.12,dir=new THREE.Vector3(0.75,0.7,1).normalize();
  var T=new THREE.Vector3(cx,cz,-cy);cam.position.copy(T).addScaledVector(dir,dist);cam.lookAt(T);cam.updateMatrixWorld();
  var cs=[];if(b){[b.x0,b.x1].forEach(function(x){[b.y0,b.y1].forEach(function(y){[b.z0,b.z1].forEach(function(z){cs.push(new THREE.Vector3(x,z,-y));});});});}
  if(ref&&ref.on){cs.push(new THREE.Vector3(ref.nx,0,-ref.ny));}
  for(var it=0;it<4&&cs.length;it++){
    var mx=0;cs.forEach(function(v){var q=v.clone().project(cam);mx=Math.max(mx,Math.abs(q.x),Math.abs(q.y)*h/w*1);});
    if(mx<=0)break;dist*=Math.max(0.3,Math.min(2,mx/0.86));cam.position.copy(T).addScaledVector(dir,dist);cam.lookAt(T);cam.updateMatrixWorld();
  }
  var gv=G.grid.visible;G.grid.visible=false;
  r.render(G.scene,cam);G.grid.visible=gv;
  var cv=document.createElement('canvas');cv.width=w;cv.height=h;var c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,w,h);c.drawImage(r.domElement,0,0);
  drawOverlay(c,cam,w,h,parts,selId,w/1000*1.4);
  r.dispose();try{r.forceContextLoss();}catch(e){}
  G.dirty=true;return cv;
}
/* snap points for the ruler: part corners, hole centres, free-shape vertices */
function buildSnap(parts){
  var pts=[];
  parts.forEach(function(p){
    var c=corners(p),cs=Math.cos(rad(p.rot||0)),sn=Math.sin(rad(p.rot||0));
    function W(a){return [p.x+a[0]*cs-a[1]*sn,p.y+a[0]*sn+a[1]*cs];}
    [p.z,p.z+p.h].forEach(function(z){
      c.forEach(function(q){pts.push([q[0],q[1],z]);});
      if(p.kind==='plate')(p.holes||[]).forEach(function(h){var q=W([h.x,h.y]);pts.push([q[0],q[1],z]);});
      if(p.kind==='poly'&&pts.length<6000)p.polys.forEach(function(g){g.o.forEach(function(a){var q=W(a);pts.push([q[0],q[1],z]);});});
    });
  });
  G.snapPts=pts;
}
/* all meshes and all edges (segments) of the parts in design coordinates, for face picking and edge / vertex snapping */
function collectGeo(){
  G.meshList=[];G.snapSegs=[];G.faceCache=null;
  G.parts.children.forEach(function(g){
    g.updateMatrix();
    g.children.forEach(function(o){
      o.updateMatrix();var M=g.matrix.clone().multiply(o.matrix);o.userData.M=M;
      if(o.isMesh)G.meshList.push(o);
      else if(o.isLineSegments&&G.snapSegs.length<30000){
        var pos=o.geometry.attributes.position,v=new THREE.Vector3(),a,i;
        for(i=0;i+1<pos.count;i+=2){v.fromBufferAttribute(pos,i).applyMatrix4(M);a=[v.x,v.y,v.z];v.fromBufferAttribute(pos,i+1).applyMatrix4(M);G.snapSegs.push([a[0],a[1],a[2],v.x,v.y,v.z]);}
      }
    });
  });
}
function toThree(p){return new THREE.Vector3(p[0],p[2],-p[1]);}
function occluded(pt){
  var from=G.cam.position,to=toThree(pt),dir=to.clone().sub(from),dist=dir.length();dir.normalize();
  var rc=new THREE.Raycaster(from,dir,0.1,dist),hits=rc.intersectObjects(G.meshList,false);
  return hits.length>0&&hits[0].distance<dist-(0.4+dist*0.002);
}
/* closest point of the segment (design coords) to the mouse ray */
function segPointOnRay(sg){
  var A=toThree(sg.slice(0,3)),B=toThree(sg.slice(3,6)),u=B.clone().sub(A),o=G.ray.ray.origin,d=G.ray.ray.direction,w0=A.clone().sub(o);
  var a=u.dot(u),b=u.dot(d),d0=u.dot(w0),e=d.dot(w0),den=a-b*b,s=den>1e-9?(b*e-d0)/den:0.5;s=Math.max(0,Math.min(1,s));
  return [sg[0]+(sg[3]-sg[0])*s,sg[1]+(sg[4]-sg[1])*s,sg[2]+(sg[5]-sg[2])*s];
}
/* what is under the pointer for the ruler: vertex, edge middle, point on an edge (highlighted), else the surface */
function snapAt(e){
  var rc=G.cv.getBoundingClientRect(),mx=e.clientX-rc.left,my=e.clientY-rc.top,cands=[],i;
  G.ray.setFromCamera(new THREE.Vector2(mx/rc.width*2-1,-(my/rc.height)*2+1),G.cam);
  function P(x,y,z){return projPt(G.cam,rc.width,rc.height,x,y,z);}
  for(i=0;i<G.snapPts.length;i++){var s=G.snapPts[i],q=P(s[0],s[1],s[2]);if(!q.ok)continue;var d=Math.sqrt((q.x-mx)*(q.x-mx)+(q.y-my)*(q.y-my));if(d<12)cands.push({type:'v',p:s,d:d,pr:0});}
  for(i=0;i<G.snapSegs.length;i++){
    var sg=G.snapSegs[i],a=P(sg[0],sg[1],sg[2]),b=P(sg[3],sg[4],sg[5]);if(!a.ok||!b.ok)continue;
    var mid=[(sg[0]+sg[3])/2,(sg[1]+sg[4])/2,(sg[2]+sg[5])/2],m=P(mid[0],mid[1],mid[2]),dm=Math.sqrt((m.x-mx)*(m.x-mx)+(m.y-my)*(m.y-my));
    if(dm<10)cands.push({type:'m',p:mid,d:dm,pr:1,sg:sg});
    var dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy,t=l2>0?Math.max(0,Math.min(1,((mx-a.x)*dx+(my-a.y)*dy)/l2)):0,px=a.x+t*dx-mx,py=a.y+t*dy-my,de=Math.sqrt(px*px+py*py);
    if(de<7)cands.push({type:'e',d:de,pr:2,sg:sg});
  }
  cands.sort(function(x,y){return x.pr-y.pr||x.d-y.d;});
  for(i=0;i<Math.min(cands.length,8);i++){
    var c=cands[i],pt=c.type==='e'?segPointOnRay(c.sg):c.p;
    if(occluded(pt))continue;
    var out={p:pt.map(function(v){return Math.round(v*10)/10;}),snap:true,type:c.type};
    if(c.sg){out.a=c.sg.slice(0,3);out.b=c.sg.slice(3,6);out.len=Math.sqrt(Math.pow(c.sg[3]-c.sg[0],2)+Math.pow(c.sg[4]-c.sg[1],2)+Math.pow(c.sg[5]-c.sg[2],2));}
    return out;
  }
  var h=pickAt(e),o;
  if(h)o=[h.pt.x,-h.pt.z,h.pt.y];
  else{var pl=new THREE.Vector3();if(G.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),pl))o=[pl.x,-pl.z,0];else o=[0,0,0];}
  return {p:o.map(function(v){return Math.round(v*10)/10;}),snap:false,type:'f'};
}
function rulerPoint(e){return snapAt(e);}
/* the flat face under the pointer: all coplanar triangles of that mesh, in design coordinates */
function faceAt(e){
  var rc=G.cv.getBoundingClientRect();
  G.ray.setFromCamera(new THREE.Vector2((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1),G.cam);
  var hits=G.ray.intersectObjects(G.meshList,false);if(!hits.length)return null;
  var h=hits[0],mesh=h.object,g=mesh.parent,geo=mesh.geometry,pos=geo.attributes.position,ix=geo.index,M=mesh.userData.M,nt=ix?ix.count/3:pos.count/3;
  function tri(fi){var k=ix?[ix.getX(3*fi),ix.getX(3*fi+1),ix.getX(3*fi+2)]:[3*fi,3*fi+1,3*fi+2];return k.map(function(j){return new THREE.Vector3().fromBufferAttribute(pos,j).applyMatrix4(M);});}
  function nrm(t){return new THREE.Vector3().subVectors(t[1],t[0]).cross(new THREE.Vector3().subVectors(t[2],t[0]));}
  var t0=tri(h.faceIndex),n=nrm(t0);if(n.lengthSq()<1e-12)return null;n.normalize();var d=n.dot(t0[0]),key=mesh.uuid+'|'+n.x.toFixed(3)+','+n.y.toFixed(3)+','+n.z.toFixed(3)+'|'+d.toFixed(2);
  var f;
  if(G.faceCache&&G.faceCache.key===key)f=G.faceCache.f;
  else{
    var tris=[],i,cx=0,cy=0,cz=0,A=0;
    for(i=0;i<nt;i++){
      var t=tri(i),nn=nrm(t),ar=nn.length()/2;if(ar<1e-9)continue;nn.normalize();
      if(nn.dot(n)>0.9995&&Math.abs(n.dot(t[0])-d)<0.02&&Math.abs(n.dot(t[1])-d)<0.02&&Math.abs(n.dot(t[2])-d)<0.02){
        tris.push([t[0].x,t[0].y,t[0].z,t[1].x,t[1].y,t[1].z,t[2].x,t[2].y,t[2].z]);
        cx+=ar*(t[0].x+t[1].x+t[2].x)/3;cy+=ar*(t[0].y+t[1].y+t[2].y)/3;cz+=ar*(t[0].z+t[1].z+t[2].z)/3;A+=ar;
      }
    }
    var kind=n.z>0.9?'top':n.z<-0.9?'bottom':'side';
    f={key:key,pid:g.userData.id,n:[n.x,n.y,n.z],d:d,kind:kind,tris:tris,c:A>0?[cx/A,cy/A,cz/A]:[t0[0].x,t0[0].y,t0[0].z],z:(tris.length?tris[0][2]:t0[0].z)};
    G.faceCache={key:key,f:f};
  }
  var out=Object.assign({},f);out.pt=[h.point.x,-h.point.z,h.point.y];return out;
}
function glSetFaceHL(hover,sel){
  if(G.hl){G.root.remove(G.hl);G.hl.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}
  G.hl=new THREE.Group();
  function mk(tris,col,op){
    if(!tris||!tris.length)return;var arr=new Float32Array(tris.length*9);tris.forEach(function(t,i){arr.set(t,i*9);});
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(arr,3));
    var m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:op,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));m.renderOrder=5;G.hl.add(m);
  }
  mk(hover,0x4c8dff,0.35);mk(sel,0xff8a00,0.5);G.root.add(G.hl);G.dirty=true;
}
/* mouse / touch */
function pickAt(ev){
  var rc=G.cv.getBoundingClientRect(),m=new THREE.Vector2((ev.clientX-rc.left)/rc.width*2-1,-((ev.clientY-rc.top)/rc.height)*2+1);
  G.ray.setFromCamera(m,G.cam);
  var hits=G.ray.intersectObjects(G.parts.children,true);
  for(var i=0;i<hits.length;i++){var o=hits[i].object;while(o&&o.userData.id===undefined)o=o.parent;if(o&&o.userData.id!==undefined)return {id:o.userData.id,pt:hits[i].point};}
  return null;
}
function snapv(v,alt){return alt?Math.round(v*10)/10:Math.round(v/G.snap)*G.snap;}
function bindGl(){
  var cv=G.cv,mode=null,lx=0,ly=0,moved=false,sx=0,sy=0;
  cv.addEventListener('contextmenu',function(e){e.preventDefault();});
  cv.addEventListener('pointerdown',function(e){
    cv.setPointerCapture(e.pointerId);lx=e.clientX;ly=e.clientY;sx=lx;sy=ly;moved=false;
    G.keepSel=false;
    if(e.button===0&&(G.mode==='ruler'||G.mode==='face')){mode='orbit';G.rclick=true;}
    else if(e.button===0){G.rclick=false;
      var h=pickAt(e);G.add=e.shiftKey||e.ctrlKey||e.metaKey;
      if(h){
        mode='drag';if(G.onPick)G.onPick(h.id,G.add);var p=G.getPart(h.id);
        if(p&&p.lock){mode='orbit';G.keepSel=true;G.drag=null;}
        else if(p){var pl=new THREE.Plane(new THREE.Vector3(0,1,0),-h.pt.y),o=new THREE.Vector3();G.drag={id:h.id,plane:pl,dx:h.pt.x-p.x,dy:-h.pt.z-p.y,first:true};}
        else G.drag=null;
      }else{mode='orbit';}
    }else mode=e.button===1||e.button===2?'pan':null;
  });
  cv.addEventListener('pointermove',function(e){
    if(G.mode==='ruler'&&!mode){var sn=snapAt(e);G.hover=sn.p;G.hoverSnap=sn;G.dirty=true;}
    else if(G.mode==='face'&&!mode&&G.onFaceHover)G.onFaceHover(faceAt(e));
    if(!mode)return;var dx=e.clientX-lx,dy=e.clientY-ly;if(Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>4)moved=true;
    if(mode==='orbit'){G.ctl.th-=dx*0.008;G.ctl.ph=Math.max(0.03,Math.min(Math.PI-0.03,G.ctl.ph-dy*0.008));lx=e.clientX;ly=e.clientY;G.dirty=true;}
    else if(mode==='pan'){
      var k=2*G.ctl.r*Math.tan(rad(35/2))/G.cv.clientHeight,rt=new THREE.Vector3(),up=new THREE.Vector3();
      G.cam.matrixWorld.extractBasis(rt,up,new THREE.Vector3());
      G.ctl.tx+=(-dx*rt.x+dy*up.x)*k;G.ctl.ty+=(-dx*rt.y+dy*up.y)*k;G.ctl.tz+=(-dx*rt.z+dy*up.z)*k;lx=e.clientX;ly=e.clientY;G.dirty=true;
    }else if(mode==='drag'&&G.drag){
      var rc=cv.getBoundingClientRect(),m=new THREE.Vector2((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1),out=new THREE.Vector3();
      G.ray.setFromCamera(m,G.cam);
      if(G.ray.ray.intersectPlane(G.drag.plane,out)){
        var nx=snapv(out.x-G.drag.dx,e.altKey),ny=snapv(-out.z-G.drag.dy,e.altKey);
        if(G.onDrag)G.onDrag(G.drag.id,nx,ny,G.drag.first);G.drag.first=false;
      }
    }
  });
  function up(e){if(mode==='orbit'&&!moved&&G.rclick){if(G.mode==='face'){if(G.onFace)G.onFace(faceAt(e));}else if(G.onRuler)G.onRuler(snapAt(e).p);}else if(mode==='orbit'&&!moved&&G.onPick&&!G.keepSel)G.onPick(null,G.add);if(mode==='drag'&&G.onDragEnd)G.onDragEnd();mode=null;G.drag=null;}
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',function(e){e.preventDefault();G.ctl.r=Math.max(30,Math.min(20000,G.ctl.r*Math.exp(e.deltaY*0.001)));G.dirty=true;},{passive:false});
}
