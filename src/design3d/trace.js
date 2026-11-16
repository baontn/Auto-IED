/* Picture -> outline: threshold, trace the boundary of the shape (with holes), simplify, scale to real mm. All in the browser. */
var TR={gray:null,w:0,h:0,thr:128,inv:false,fill:false,tol:1.5,minA:0.5,rings:[],box:null,fg:0};
var TR_MAX=520;
function trSetImage(img){
  var nw=img.naturalWidth||img.width,nh=img.naturalHeight||img.height,s=Math.min(1,TR_MAX/Math.max(nw,nh)),w=Math.max(8,Math.round(nw*s)),h=Math.max(8,Math.round(nh*s));
  var cv=document.createElement('canvas');cv.width=w;cv.height=h;var c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,w,h);c.drawImage(img,0,0,w,h);
  var d=c.getImageData(0,0,w,h).data,g=new Float32Array(w*h),i;
  for(i=0;i<w*h;i++)g[i]=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2];
  var b=new Uint8ClampedArray(w*h),x,y;   /* one 3x3 blur pass to calm sensor noise */
  for(y=0;y<h;y++)for(x=0;x<w;x++){var sum=0,n=0;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h){sum+=g[yy*w+xx];n++;}}b[y*w+x]=sum/n;}
  TR.gray=b;TR.w=w;TR.h=h;TR.img=cv;TR.thr=trOtsu(b);TR.inv=false;
  if(trMask().frac>0.5){TR.inv=true;}
}
function trOtsu(g){
  var hist=new Array(256).fill(0),i,tot=g.length,sum=0;for(i=0;i<tot;i++){hist[g[i]]++;sum+=g[i];}
  var sb=0,wb=0,best=0,thr=128;
  for(i=0;i<256;i++){wb+=hist[i];if(!wb)continue;var wf=tot-wb;if(!wf)break;sb+=i*hist[i];var mb=sb/wb,mf=(sum-sb)/wf,v=wb*wf*(mb-mf)*(mb-mf);if(v>best){best=v;thr=i;}}
  return thr;
}
/* binary mask padded with one empty pixel all around */
function trMask(){
  var w=TR.w,h=TR.h,W=w+2,H=h+2,m=new Uint8Array(W*H),x,y,n=0;
  for(y=0;y<h;y++)for(x=0;x<w;x++){var v=TR.gray[y*w+x]<TR.thr;if(TR.inv)v=!v;if(v){m[(y+1)*W+x+1]=1;n++;}}
  if(TR.fill){
    var seen=new Uint8Array(W*H),st=[0];seen[0]=1;
    while(st.length){var k=st.pop(),kx=k%W,ky=(k-kx)/W,nb=[k-1,k+1,k-W,k+W],j;
      for(j=0;j<4;j++){var q=nb[j];if(q<0||q>=W*H)continue;if(j===0&&kx===0)continue;if(j===1&&kx===W-1)continue;if(seen[q]||m[q])continue;seen[q]=1;st.push(q);}}
    n=0;for(x=0;x<W*H;x++){if(!seen[x])m[x]=1;if(m[x])n++;}
  }
  return {m:m,W:W,H:H,frac:n/(w*h)};
}
function trLoops(M){
  var m=M.m,W=M.W,H=M.H,out={},x,y;
  function add(x1,y1,x2,y2){var k=x1+','+y1;(out[k]=out[k]||[]).push({x1:x1,y1:y1,x2:x2,y2:y2,u:false});}
  for(y=0;y<H;y++)for(x=0;x<W;x++){if(!m[y*W+x])continue;
    if(y===0||!m[(y-1)*W+x])add(x,y,x+1,y);
    if(x===W-1||!m[y*W+x+1])add(x+1,y,x+1,y+1);
    if(y===H-1||!m[(y+1)*W+x])add(x+1,y+1,x,y+1);
    if(x===0||!m[y*W+x-1])add(x,y+1,x,y);}
  var loops=[],key;
  for(key in out){out[key].forEach(function(e0){
    if(e0.u)return;var pts=[[e0.x1,e0.y1]],cur=e0,guard=0;
    while(guard++<2000000){
      cur.u=true;var nx=cur.x2,ny=cur.y2;
      if(nx===e0.x1&&ny===e0.y1)break;pts.push([nx,ny]);
      var cand=(out[nx+','+ny]||[]).filter(function(e){return !e.u;});if(!cand.length)break;
      var dx=cur.x2-cur.x1,dy=cur.y2-cur.y1,best=cand[0],bc=-9;
      cand.forEach(function(e){var cr=dx*(e.y2-e.y1)-dy*(e.x2-e.x1);if(cr>bc){bc=cr;best=e;}});cur=best;
    }
    if(pts.length>=4)loops.push(pts);
  });}
  return loops;
}
function dpMark(a,i0,i1,tol,keep){
  var st=[[i0,i1]];
  while(st.length){var s=st.pop(),a0=s[0],b0=s[1];if(b0<=a0+1)continue;
    var ax=a[a0][0],ay=a[a0][1],bx=a[b0][0],by=a[b0][1],dx=bx-ax,dy=by-ay,L=Math.sqrt(dx*dx+dy*dy)||1,md=-1,mi=-1,i;
    for(i=a0+1;i<b0;i++){var d=Math.abs((a[i][0]-ax)*dy-(a[i][1]-ay)*dx)/L;if(d>md){md=d;mi=i;}}
    if(md>tol){keep[mi]=1;st.push([a0,mi],[mi,b0]);}}
}
function simplifyClosed(pts,tol){
  var n=pts.length;if(n<8||tol<=0)return pts;
  var k=0,bd=0,i;for(i=1;i<n;i++){var d=Math.pow(pts[i][0]-pts[0][0],2)+Math.pow(pts[i][1]-pts[0][1],2);if(d>bd){bd=d;k=i;}}
  var a=pts.concat([pts[0]]),keep=new Uint8Array(n+1);keep[0]=1;keep[k]=1;keep[n]=1;dpMark(a,0,k,tol,keep);dpMark(a,k,n,tol,keep);
  var out=[];for(i=0;i<n;i++)if(keep[i])out.push(pts[i]);return out.length>=3?out:pts;
}
/* run the whole chain: rings in pixel units (y down), nested as outer / holes by Clipper */
function trRun(){
  if(!TR.gray)return;
  var M=trMask(),loops=trLoops(M).map(function(l){return simplifyClosed(l,TR.tol);});
  var maxA=0;loops.forEach(function(l){maxA=Math.max(maxA,Math.abs(ringArea(l)));});
  loops=loops.filter(function(l){return Math.abs(ringArea(l))>=maxA*TR.minA/100&&Math.abs(ringArea(l))>=4;});
  TR.fg=M.frac;
  var polys=loops.length?pathsToPolys(loops.map(toClip)):[];
  TR.rings=polys;
  var x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;polys.forEach(function(q){q.o.forEach(function(a){x0=Math.min(x0,a[0]);x1=Math.max(x1,a[0]);y0=Math.min(y0,a[1]);y1=Math.max(y1,a[1]);});});
  TR.box=polys.length?{x0:x0,x1:x1,y0:y0,y1:y1,w:x1-x0,h:y1-y0}:null;
}
/* real-size polygons: lenMm = real length of the shape's horizontal extent */
function trToMm(lenMm){
  if(!TR.box)return [];var s=lenMm/TR.box.w,cx=(TR.box.x0+TR.box.x1)/2,cy=(TR.box.y0+TR.box.y1)/2;
  function tf(r){return r.map(function(a){return [(a[0]-cx)*s,-(a[1]-cy)*s];});}
  return TR.rings.map(function(q){return {o:tf(q.o),h:q.h.map(tf)};});
}
