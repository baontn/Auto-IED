/* 2D technical drawings on a canvas (PDF pages, 150 dpi: 1 px = 0.1693 mm of paper). */
var MM_PX=25.4/150;
var INK='#1d2330',ACC='#0058a0',RED='#ed1c24',GREY='#6b7280';
function ctxRR(c,x,y,w,h,r){
  r=Math.max(0,Math.min(r,w/2,h/2));c.moveTo(x+r,y);c.lineTo(x+w-r,y);if(r)c.arc(x+w-r,y+r,r,-Math.PI/2,0);c.lineTo(x+w,y+h-r);if(r)c.arc(x+w-r,y+h-r,r,0,Math.PI/2);
  c.lineTo(x+r,y+h);if(r)c.arc(x+r,y+h-r,r,Math.PI/2,Math.PI);c.lineTo(x,y+r);if(r)c.arc(x+r,y+r,r,Math.PI,Math.PI*1.5);c.closePath();
}
function matFill(m,k){var mm=MATS[m]||MATS.abs;if(mm.op<1)return hex2rgba(mm.col,0.55);return mm.col;}
function hex2rgba(h,a){var n=parseInt(h.slice(1),16);return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')';}
function fmt(v){v=Math.round(v*10)/10;return String(v);}
function text(c,s,x,y,size,col,al,bold){c.font=(bold?'bold ':'')+size+'px "Segoe UI",Roboto,Arial,sans-serif';c.fillStyle=col||INK;c.textAlign=al||'left';c.textBaseline='alphabetic';c.fillText(s,x,y);}
function wrapText(c,s,x,y,w,size,lh,col,maxLines){
  c.font=size+'px "Segoe UI",Roboto,Arial,sans-serif';c.fillStyle=col||INK;c.textAlign='left';c.textBaseline='alphabetic';
  var lines=[];String(s||'').split(/\n/).forEach(function(par){var words=par.split(/\s+/),cur='';words.forEach(function(wd){var t=cur?cur+' '+wd:wd;if(c.measureText(t).width>w&&cur){lines.push(cur);cur=wd;}else cur=t;});lines.push(cur);});
  if(maxLines&&lines.length>maxLines){lines=lines.slice(0,maxLines);lines[maxLines-1]=lines[maxLines-1].replace(/.{0,2}$/,'…');}
  lines.forEach(function(l,i){c.fillText(l,x,y+i*lh);});return lines.length;
}
/* dimension line between two points with the value in the middle (side = which side the text goes) */
function dimLine(c,x0,y0,x1,y1,label){
  c.save();c.strokeStyle=ACC;c.fillStyle=ACC;c.lineWidth=2;c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();
  var a=Math.atan2(y1-y0,x1-x0);[[x0,y0,0],[x1,y1,Math.PI]].forEach(function(e){c.save();c.translate(e[0],e[1]);c.rotate(a+e[2]);c.beginPath();c.moveTo(0,0);c.lineTo(14,-4.5);c.lineTo(14,4.5);c.closePath();c.fill();c.restore();});
  c.translate((x0+x1)/2,(y0+y1)/2);c.rotate(Math.abs(a)>Math.PI/2?a+Math.PI:a);c.font='bold 22px "Segoe UI",Arial,sans-serif';c.textAlign='center';c.textBaseline='bottom';
  var w=c.measureText(label).width+10;c.fillStyle='rgba(255,255,255,0.9)';c.fillRect(-w/2,-27,w,26);c.fillStyle=ACC;c.fillText(label,0,-4);c.restore();
}
function scaleLabel(s){var r=1/(s*MM_PX);return '1 : '+(r>=10?Math.round(r):(Math.round(r*10)/10));}
function holePathLocal(c,h){
  if(h.t==='round'){c.moveTo(h.x+h.a/2,h.y);c.arc(h.x,h.y,h.a/2,0,Math.PI*2);}
  else if(h.t==='slot'){var b=Math.min(h.b,h.a);ctxRR(c,h.x-h.a/2,h.y-b/2,h.a,b,b/2);}
  else ctxRR(c,h.x-h.a/2,h.y-h.b/2,h.a,h.b,h.c||0);
}
function partOutlineLocal(c,p){
  if(p.kind==='pin'){c.moveTo(p.w/2,0);c.arc(0,0,p.w/2,0,Math.PI*2);}
  else if(p.kind==='poly'){p.polys.forEach(function(q){[q.o].concat(q.h).forEach(function(r){r.forEach(function(a,i){if(i)c.lineTo(a[0],a[1]);else c.moveTo(a[0],a[1]);});c.closePath();});});}
  else{ctxRR(c,-p.w/2,-p.d/2,p.w,p.d,(p.kind==='plate'||p.kind==='block')?(p.r||0):0);}
  if(p.kind==='plate')(p.holes||[]).forEach(function(h){holePathLocal(c,h);});
}
/* top view of everything; returns the mapping so the caller can add more */
function drawTop(c,bx,parts,ref){
  var b=bboxAll(parts);if(!b)return null;
  var minx=b.x0,maxx=b.x1,miny=b.y0,maxy=b.y1;
  if(ref&&ref.on){minx=Math.min(minx,ref.nx-3);maxx=Math.max(maxx,ref.nx+3);miny=Math.min(miny,ref.ny-3);maxy=Math.max(maxy,ref.ny+3);}
  var padL=60,padT=50,padR=90,padB=100,bw=Math.max(maxx-minx,1),bd=Math.max(maxy-miny,1);
  var s=Math.min((bx.w-padL-padR)/bw,(bx.h-padT-padB)/bd),ox=bx.x+padL+((bx.w-padL-padR)-bw*s)/2,oy=bx.y+padT+((bx.h-padT-padB)-bd*s)/2;
  function X(x){return ox+(x-minx)*s;}function Y(y){return oy+(maxy-y)*s;}
  c.save();c.beginPath();c.rect(bx.x,bx.y,bx.w,bx.h);c.clip();
  parts.slice().sort(function(a,z){return a.z-z.z;}).forEach(function(p){
    c.save();c.translate(X(p.x),Y(p.y));c.rotate(-rad(p.rot||0));c.scale(s,-s);
    c.beginPath();partOutlineLocal(c,p);c.fillStyle=matFill(p.mat);c.fill('evenodd');c.lineWidth=1.6/s;c.strokeStyle=INK;c.stroke();
    if(p.kind==='wedge'){c.beginPath();c.moveTo(p.w/2,-p.d/2);c.lineTo(p.w/2,p.d/2);c.lineWidth=3.2/s;c.strokeStyle=RED;c.stroke();}
    c.restore();
  });
  if(ref&&ref.on){var nx=X(ref.nx),ny=Y(ref.ny);c.strokeStyle=RED;c.lineWidth=2;c.beginPath();c.moveTo(nx-14,ny);c.lineTo(nx+14,ny);c.moveTo(nx,ny-14);c.lineTo(nx,ny+14);c.stroke();c.beginPath();c.arc(nx,ny,6,0,Math.PI*2);c.stroke();text(c,t('pdf_needle'),nx+12,ny-10,18,RED,'left',true);}
  parts.forEach(function(p,i){var f=fp(p),cx=X(p.x),cy=Y(p.y);c.beginPath();c.arc(cx,cy,13,0,Math.PI*2);c.fillStyle='#fff';c.fill();c.lineWidth=1.8;c.strokeStyle=INK;c.stroke();text(c,String(i+1),cx,cy+6,16,INK,'center',true);});
  c.restore();
  var L=X(b.x0),R=X(b.x1),T=Y(b.y1),B=Y(b.y0);
  dimLine(c,L,B+46,R,B+46,fmt(b.x1-b.x0)+' mm');dimLine(c,R+46,B,R+46,T,fmt(b.y1-b.y0)+' mm');
  c.strokeStyle=ACC;c.lineWidth=1;c.beginPath();c.moveTo(L,B+4);c.lineTo(L,B+54);c.moveTo(R,B+4);c.lineTo(R,B+54);c.moveTo(R+4,B);c.lineTo(R+54,B);c.moveTo(R+4,T);c.lineTo(R+54,T);c.stroke();
  return {s:s,X:X,Y:Y};
}
/* elevation: mode 'front' (look along +Y, horizontal = X) or 'side' (look from the right, horizontal = Y) */
function drawElev(c,bx,parts,ref,mode){
  var b=bboxAll(parts);if(!b)return null;
  var h0=mode==='front'?b.x0:b.y0,h1=mode==='front'?b.x1:b.y1,z0=Math.min(0,b.z0),z1=b.z1;
  var padL=60,padT=50,padR=100,padB=90,bw=Math.max(h1-h0,1),bh=Math.max(z1-z0,1);
  var s=Math.min((bx.w-padL-padR)/bw,(bx.h-padT-padB)/bh),ox=bx.x+padL+((bx.w-padL-padR)-bw*s)/2,oy=bx.y+padT+((bx.h-padT-padB)-bh*s)/2;
  function X(v){return ox+(v-h0)*s;}function Y(z){return oy+(z1-z)*s;}
  var items=parts.map(function(p,i){
    var pts=vertsOf(p).map(function(v){return mode==='front'?[v[0],v[2]]:[v[1],v[2]];}),dep=mode==='front'?-(fp(p).y0+fp(p).y1)/2:(fp(p).x0+fp(p).x1)/2;
    return {p:p,i:i,poly:hull(pts),dep:dep};
  }).sort(function(a,z){return a.dep-z.dep;});
  c.save();c.beginPath();c.rect(bx.x,bx.y,bx.w,bx.h);c.clip();
  c.strokeStyle=GREY;c.lineWidth=2;c.beginPath();c.moveTo(bx.x+20,Y(0));c.lineTo(bx.x+bx.w-20,Y(0));c.stroke();
  if(ref&&ref.on){var rv=mode==='front'?ref.nx:ref.ny;c.strokeStyle=RED;c.setLineDash([8,6]);c.beginPath();c.moveTo(X(rv),Y(z0)+4);c.lineTo(X(rv),Y(z1)-4);c.stroke();c.setLineDash([]);text(c,t('pdf_needle'),X(rv)+6,Y(z1)+16,18,RED,'left',true);}
  items.forEach(function(it){
    c.beginPath();it.poly.forEach(function(q,k){if(k)c.lineTo(X(q[0]),Y(q[1]));else c.moveTo(X(q[0]),Y(q[1]));});c.closePath();
    c.fillStyle=matFill(it.p.mat);c.fill();c.lineWidth=1.6;c.strokeStyle=INK;c.stroke();
  });
  c.restore();
  var L=X(h0),R=X(h1),T=Y(z1),B=Y(z0);
  dimLine(c,L,B+44,R,B+44,fmt(h1-h0)+' mm');dimLine(c,R+40,B,R+40,T,fmt(z1-Math.min(0,b.z0))+' mm');
  return {s:s};
}
/* one plate: outline, holes (numbered) and the dimensions */
function drawPlate(c,bx,p){
  var padL=70,padT=40,padR=100,padB=100,s=Math.min((bx.w-padL-padR)/p.w,(bx.h-padT-padB)/p.d),ox=bx.x+padL+((bx.w-padL-padR)-p.w*s)/2,oy=bx.y+padT+((bx.h-padT-padB)-p.d*s)/2;
  function X(x){return ox+(x+p.w/2)*s;}function Y(y){return oy+(p.d/2-y)*s;}
  c.save();c.translate(ox+p.w*s/2,oy+p.d*s/2);c.scale(s,-s);
  c.beginPath();partOutlineLocal(c,p);c.fillStyle=matFill(p.mat);c.fill('evenodd');c.lineWidth=2/s;c.strokeStyle=INK;c.stroke();c.restore();
  (p.holes||[]).forEach(function(h,i){
    var cx=X(h.x),cy=Y(h.y);c.strokeStyle=RED;c.lineWidth=1.4;c.beginPath();c.moveTo(cx-12,cy);c.lineTo(cx+12,cy);c.moveTo(cx,cy-12);c.lineTo(cx,cy+12);c.stroke();
    var rr=h.t==='round'?h.a*s/2:Math.min(h.a,h.b)*s/2;text(c,'H'+(i+1),cx-Math.max(rr,8)*0.7-4,cy-Math.max(rr,8)*0.7-2,20,RED,'right',true);
  });
  dimLine(c,X(-p.w/2),Y(-p.d/2)+46,X(p.w/2),Y(-p.d/2)+46,fmt(p.w)+' mm');dimLine(c,X(p.w/2)+46,Y(-p.d/2),X(p.w/2)+46,Y(p.d/2),fmt(p.d)+' mm');
  text(c,t('pdf_origin'),X(-p.w/2),Y(-p.d/2)+84,17,GREY);
  c.fillStyle=RED;c.beginPath();c.arc(X(-p.w/2),Y(-p.d/2),5,0,Math.PI*2);c.fill();
  return {s:s};
}
/* simple table: cols [{h:'title',w:px,al:'left'|'right'|'center'}], rows = arrays of strings */
function drawTable(c,x,y,cols,rows,rowH,opt){
  opt=opt||{};var tw=0;cols.forEach(function(k){tw+=k.w;});
  c.fillStyle=ACC;c.fillRect(x,y,tw,rowH);var cx=x;
  cols.forEach(function(k){text(c,k.h,k.al==='right'?cx+k.w-10:k.al==='center'?cx+k.w/2:cx+10,y+rowH*0.68,opt.fs||20,'#fff',k.al||'left',true);cx+=k.w;});
  rows.forEach(function(r,i){
    var yy=y+rowH*(i+1);if(i%2)  {c.fillStyle='#f0f4f9';c.fillRect(x,yy,tw,rowH);}
    c.strokeStyle='#d8dde5';c.lineWidth=1;c.beginPath();c.moveTo(x,yy+rowH);c.lineTo(x+tw,yy+rowH);c.stroke();
    var xx=x;cols.forEach(function(k,j){var s=String(r[j]==null?'':r[j]);c.save();c.beginPath();c.rect(xx+2,yy,k.w-4,rowH);c.clip();text(c,s,k.al==='right'?xx+k.w-10:k.al==='center'?xx+k.w/2:xx+10,yy+rowH*0.68,opt.fs||20,INK,k.al||'left',false);c.restore();xx+=k.w;});
  });
  c.strokeStyle='#b8c0cc';c.lineWidth=1.5;c.strokeRect(x,y,tw,rowH*(rows.length+1));
  return y+rowH*(rows.length+1);
}
