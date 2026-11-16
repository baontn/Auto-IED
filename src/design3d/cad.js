/* CAD / 3D file export: STL, OBJ (3D mesh), DXF 3D faces, DXF 2D drawing (assembly top view or flat plates). All units mm, Z up. */
function asciiName(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^\x20-\x7e]/g,'');}
function f4(v){return (Math.round(v*10000)/10000).toString();}
/* triangles of every part in design coordinates: [{i, name, tris:[[x,y,z],...]}] (3 points per triangle) */
function meshData(){
  var out=[],v=new THREE.Vector3();
  G.parts.children.forEach(function(g){
    var id=g.userData.id,idx=-1,i;for(i=0;i<ST.parts.length;i++)if(ST.parts[i].id===id)idx=i;if(idx<0)return;
    g.updateMatrix();var tris=[];
    g.children.forEach(function(m){
      if(!m.isMesh)return;m.updateMatrix();var M=g.matrix.clone().multiply(m.matrix),pos=m.geometry.attributes.position,ix=m.geometry.index,n=ix?ix.count:pos.count;
      function P(k){v.fromBufferAttribute(pos,ix?ix.getX(k):k).applyMatrix4(M);return [v.x,v.y,v.z];}
      for(var k=0;k+2<n;k+=3){tris.push(P(k),P(k+1),P(k+2));}
    });
    out.push({i:idx,name:ST.parts[idx].name||t('k_'+ST.parts[idx].kind),tris:tris});
  });
  return out;
}
function makeStl(md){
  var n=0;md.forEach(function(m){n+=m.tris.length/3;});
  var buf=new ArrayBuffer(84+50*n),dv=new DataView(buf),hd='Crystal Martin Vietnam - '+asciiName(ST.name)+(ST.ie?' - IE '+asciiName(ST.ie):'');
  for(var i=0;i<80;i++)dv.setUint8(i,i<hd.length?hd.charCodeAt(i):32);
  dv.setUint32(80,n,true);var o=84;
  md.forEach(function(m){for(var k=0;k<m.tris.length;k+=3){
    var a=m.tris[k],b=m.tris[k+1],c=m.tris[k+2],ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
    [nx/l,ny/l,nz/l,a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]].forEach(function(x){dv.setFloat32(o,x,true);o+=4;});dv.setUint16(o,0,true);o+=2;}});
  return new Blob([buf],{type:'model/stl'});
}
function makeObj(md){
  var L=['# Crystal Martin Vietnam - '+asciiName(ST.name)+(ST.ie?' - IE '+asciiName(ST.ie):''),'# units: mm, Z up'],base=0;
  md.forEach(function(m){
    L.push('o part_'+(m.i+1)+'_'+layerName(m.name));var k;
    for(k=0;k<m.tris.length;k++)L.push('v '+f4(m.tris[k][0])+' '+f4(m.tris[k][1])+' '+f4(m.tris[k][2]));
    for(k=0;k<m.tris.length;k+=3)L.push('f '+(base+k+1)+' '+(base+k+2)+' '+(base+k+3));base+=m.tris.length;
  });
  return new Blob([L.join('\n')+'\n'],{type:'text/plain'});
}
function layerName(s){return asciiName(s).replace(/[^A-Za-z0-9_\-]+/g,'_').slice(0,30)||'PART';}
/* ---- DXF (R12 ASCII: opens in AutoCAD, BricsCAD, LibreCAD, Fusion, SolidWorks...) ---- */
function dxfWrap(layers,ents){
  var L=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1009','0','ENDSEC','0','SECTION','2','TABLES','0','TABLE','2','LTYPE','70','1','0','LTYPE','2','CONTINUOUS','70','0','3','Solid line','72','65','73','0','40','0.0','0','ENDTAB','0','TABLE','2','LAYER','70',String(layers.length)];
  layers.forEach(function(l){L.push('0','LAYER','2',l[0],'70','0','62',String(l[1]),'6','CONTINUOUS');});
  L.push('0','ENDTAB','0','ENDSEC','0','SECTION','2','ENTITIES');
  return L.concat(ents,['0','ENDSEC','0','EOF']).join('\n')+'\n';
}
function dxfFace(layer,a,b,c){
  var L=['0','3DFACE','8',layer];[a,b,c,c].forEach(function(p,i){L.push(String(10+i),f4(p[0]),String(20+i),f4(p[1]),String(30+i),f4(p[2]));});return L;
}
function makeDxf3d(md){
  var ents=[],layers=[],seen={};
  md.forEach(function(m){var ln='PART_'+(m.i+1)+'_'+layerName(m.name);if(!seen[ln]){seen[ln]=1;layers.push([ln,(m.i%7)+1]);}
    for(var k=0;k<m.tris.length;k+=3)ents=ents.concat(dxfFace(ln,m.tris[k],m.tris[k+1],m.tris[k+2]));});
  return new Blob([dxfWrap(layers,ents)],{type:'application/dxf'});
}
var BUL=Math.tan(Math.PI/8);
function rrVerts(w,h,r){
  r=Math.min(r||0,w/2,h/2);var x0=-w/2,x1=w/2,y0=-h/2,y1=h/2;
  if(r<0.01)return [[x0,y0,0],[x1,y0,0],[x1,y1,0],[x0,y1,0]];
  return [[x0+r,y0,0],[x1-r,y0,BUL],[x1,y0+r,0],[x1,y1-r,BUL],[x1-r,y1,0],[x0+r,y1,BUL],[x0,y1-r,0],[x0,y0+r,BUL]];
}
function dxfCircle(layer,x,y,r){return ['0','CIRCLE','8',layer,'10',f4(x),'20',f4(y),'30','0','40',f4(r)];}
function dxfPline(layer,verts,T){
  var L=['0','POLYLINE','8',layer,'66','1','70','1','10','0','20','0','30','0'];
  verts.forEach(function(v){var q=T(v[0],v[1]);L.push('0','VERTEX','8',layer,'10',f4(q[0]),'20',f4(q[1]),'30','0');if(v[2])L.push('42',f4(v[2]));});
  L.push('0','SEQEND','8',layer);return L;
}
function dxfText(layer,x,y,h,s){return ['0','TEXT','8',layer,'10',f4(x),'20',f4(y),'30','0','40',f4(h),'1',asciiName(s)];}
/* outline + holes of one part. T maps local (centre-origin) coords to drawing coords */
function dxfPart(p,T,ents){
  var O='OUTLINE',H='HOLES',c;
  if(p.kind==='pin'){c=T(0,0);ents.push.apply(ents,dxfCircle(O,c[0],c[1],p.w/2));return;}
  if(p.kind==='poly'){p.polys.forEach(function(q){ents.push.apply(ents,dxfPline(O,q.o.map(function(a){return [a[0],a[1],0];}),T));q.h.forEach(function(r){ents.push.apply(ents,dxfPline(H,r.map(function(a){return [a[0],a[1],0];}),T));});});return;}
  ents.push.apply(ents,dxfPline(O,rrVerts(p.w,p.d,p.kind==='plate'?(p.r||0):0),T));
  if(p.kind==='plate')(p.holes||[]).forEach(function(h){
    if(h.t==='round'){c=T(h.x,h.y);ents.push.apply(ents,dxfCircle(H,c[0],c[1],h.a/2));}
    else{var w=h.t==='slot'?h.a:h.a,hh=h.t==='slot'?Math.min(h.b,h.a):h.b,r=h.t==='slot'?hh/2:(h.c||0);
      ents.push.apply(ents,dxfPline(H,rrVerts(w,hh,r).map(function(v){return [v[0]+h.x,v[1]+h.y,v[2]];}),T));}
  });
}
function dxfInfo(ents,x,y){
  var lines=['Crystal Martin Vietnam',ST.name||'',(ST.ie?'IE: '+ST.ie:'')+'   '+fmtDate(ST.date)+(ST.style?'   '+ST.style:''),'units: mm'];
  lines.forEach(function(s,i){if(s.trim())ents.push.apply(ents,dxfText('INFO',x,y-i*8,5,s));});
}
var DXF_LAYERS=[['OUTLINE',1],['HOLES',5],['LABEL',3],['INFO',7]];
function makeDxf2d(flat){
  var ents=[],b=bboxAll(ST.parts);
  if(flat){
    var cur=0,maxd=0;
    ST.parts.forEach(function(p,i){
      if(p.kind!=='plate'&&p.kind!=='poly')return;var ox=cur+p.w/2,oy=p.d/2;
      dxfPart(p,function(x,y){return [ox+x,oy+y];},ents);
      ents.push.apply(ents,dxfText('LABEL',cur,-8,4,'#'+(i+1)+' '+(p.name||t('k_'+p.kind))+'  '+fmt(p.w)+'x'+fmt(p.d)+'x'+fmt(p.h)+' mm  '+t('m_'+p.mat)));
      cur+=p.w+20;maxd=Math.max(maxd,p.d);
    });
    dxfInfo(ents,0,-30);
  }else{
    ST.parts.forEach(function(p,i){
      var c=Math.cos(rad(p.rot||0)),s=Math.sin(rad(p.rot||0));
      dxfPart(p,function(x,y){return [p.x+x*c-y*s,p.y+x*s+y*c];},ents);
      ents.push.apply(ents,dxfText('LABEL',p.x,p.y,Math.max(3,Math.min(8,Math.min(p.w,p.d)/4)),String(i+1)));
    });
    dxfInfo(ents,b?b.x0:0,(b?b.y0:0)-20);
  }
  return new Blob([dxfWrap(DXF_LAYERS,ents)],{type:'application/dxf'});
}
