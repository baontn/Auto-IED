/* 3D scene (three.js): build meshes from the parts, own orbit camera, picking and dragging, picture for the PDF.
   Everything inside G.root uses the DESIGN axes (z up); G.root is turned so that z points up in three.js. */
var G={ren:null,scene:null,cam:null,root:null,parts:null,refg:null,grid:null,ctl:{th:Math.PI/2-0.6,ph:1.0,r:600,tx:0,ty:0,tz:0},dirty:true,drag:null,ray:null,onPick:null,onDrag:null,onDragEnd:null,snap:5};
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
  glGrid(parts,ref);G.dirty=true;
}
var REF_BED={w:420,d:180,t:20};
function glGrid(parts,ref){
  if(G.grid){G.root.remove(G.grid);G.grid.geometry.dispose();G.grid.material.dispose();}
  var b=bboxAll(parts),ext=250;
  if(b)ext=Math.max(ext,Math.abs(b.x0),Math.abs(b.x1),Math.abs(b.y0),Math.abs(b.y1)+0);
  if(ref&&ref.on)ext=Math.max(ext,Math.abs(ref.nx)+REF_BED.w/2,Math.abs(ref.ny)+REF_BED.d/2);
  ext=Math.ceil((ext+60)/50)*50;
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
function drawOverlay(ctx,cam,w,h,parts,sel,k){
  var sa=selArr(sel);
  cam.updateMatrixWorld();cam.updateProjectionMatrix();
  var o=projPt(cam,w,h,0,0,0),ax=[['X',60,0,0,'#d03030'],['Y',0,60,0,'#2e9a3e'],['Z',0,0,60,'#2a62d6']];
  ctx.save();ctx.lineWidth=2*k;ctx.font='bold '+Math.round(12*k)+'px Segoe UI,Arial';ctx.textAlign='center';ctx.textBaseline='middle';
  ax.forEach(function(a){var e=projPt(cam,w,h,a[1],a[2],a[3]);if(!o.ok||!e.ok)return;ctx.strokeStyle=a[4];ctx.fillStyle=a[4];ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(e.x,e.y);ctx.stroke();ctx.fillText(a[0],e.x+(e.x-o.x)*0.18,e.y+(e.y-o.y)*0.18);});
  parts.forEach(function(p,i){
    var q=projPt(cam,w,h,p.x,p.y,p.z+p.h);if(!q.ok)return;var sel=sa.indexOf(p.id)>=0,rr=(sel?12:10)*k;
    ctx.beginPath();ctx.arc(q.x,q.y-rr,rr,0,Math.PI*2);ctx.fillStyle=sel?'#1f6feb':'#ffffff';ctx.fill();ctx.lineWidth=1.5*k;ctx.strokeStyle=sel?'#0b3d91':'#1d2330';ctx.stroke();
    ctx.fillStyle=sel?'#ffffff':'#1d2330';ctx.font='bold '+Math.round(12*k)+'px Segoe UI,Arial';ctx.fillText(String(i+1),q.x,q.y-rr+0.5*k);
  });
  ctx.restore();
}
function glRender(parts,selId){
  if(!G.dirty)return;G.dirty=false;
  glCamUpdate();G.ren.render(G.scene,G.cam);
  var c=G.ov.getContext('2d');c.clearRect(0,0,G.ov.width,G.ov.height);drawOverlay(c,G.cam,G.ov.width,G.ov.height,parts,selId,1);
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
  var cv=G.cv,mode=null,lx=0,ly=0,moved=false;
  cv.addEventListener('contextmenu',function(e){e.preventDefault();});
  cv.addEventListener('pointerdown',function(e){
    cv.setPointerCapture(e.pointerId);lx=e.clientX;ly=e.clientY;moved=false;
    if(e.button===0){
      var h=pickAt(e);G.add=e.shiftKey||e.ctrlKey||e.metaKey;
      if(h){
        mode='drag';if(G.onPick)G.onPick(h.id,G.add);var p=G.getPart(h.id);
        if(p&&!p.lock){var pl=new THREE.Plane(new THREE.Vector3(0,1,0),-h.pt.y),o=new THREE.Vector3();G.drag={id:h.id,plane:pl,dx:h.pt.x-p.x,dy:-h.pt.z-p.y,first:true};}
        else G.drag=null;
      }else{mode='orbit';}
    }else mode=e.button===1||e.button===2?'pan':null;
  });
  cv.addEventListener('pointermove',function(e){
    if(!mode)return;var dx=e.clientX-lx,dy=e.clientY-ly;if(Math.abs(dx)+Math.abs(dy)>0)moved=true;
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
  function up(e){if(mode==='orbit'&&!moved&&G.onPick)G.onPick(null,G.add);if(mode==='drag'&&G.onDragEnd)G.onDragEnd();mode=null;G.drag=null;}
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',function(e){e.preventDefault();G.ctl.r=Math.max(30,Math.min(20000,G.ctl.r*Math.exp(e.deltaY*0.001)));G.dirty=true;},{passive:false});
}
