/* PDF pages (drawn on canvases at 150 dpi, A4 landscape) and a small PDF writer (one JPEG image per page, no library). */
var PW=1754,PH=1240,LOGO_IMG=null;
function newPage(o,n,total,title){
  var cv=document.createElement('canvas');cv.width=PW;cv.height=PH;var c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,PW,PH);
  if(LOGO_IMG&&LOGO_IMG.complete&&LOGO_IMG.naturalWidth){var lh=100,lw=lh*LOGO_IMG.naturalWidth/LOGO_IMG.naturalHeight;c.drawImage(LOGO_IMG,50,30,lw,lh);}
  text(c,'Crystal Martin Vietnam',205,76,38,ACC,'left',true);text(c,t('pdf_dept'),205,108,22,GREY,'left',false);
  text(c,o.doc||t('pdf_doc'),PW-50,52,22,GREY,'right',false);
  c.font='bold 38px "Segoe UI",Arial,sans-serif';var nm=o.name||t('untitled');while(c.measureText(nm).width>820&&nm.length>4)nm=nm.slice(0,-2);if(nm!==(o.name||t('untitled')))nm+='…';
  text(c,nm,PW-50,100,38,INK,'right',true);
  c.fillStyle=ACC;c.fillRect(50,146,PW-100,4);c.fillStyle=RED;c.fillRect(50,146,170,4);
  if(title)text(c,title,50,190,28,ACC,'left',true);
  c.fillStyle='#d8dde5';c.fillRect(50,PH-52,PW-100,1.5);
  text(c,'Crystal Martin Vietnam  ·  '+t('pdf_ie')+': '+(o.ie||'')+'  ·  '+fmtDate(o.date),50,PH-22,20,GREY,'left',false);
  text(c,n+' / '+total,PW-50,PH-22,20,GREY,'right',false);
  return {cv:cv,c:c};
}
function fmtDate(d){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(d||'');}
function kindName(p){return t('k_'+p.kind);}
function sizeText(p){return p.kind==='pin'?'Ø'+fmt(p.w)+' × '+fmt(p.h):fmt(p.w)+' × '+fmt(p.d)+' × '+fmt(p.h);}
function wtText(g){return g>=1000?(Math.round(g)/1000).toFixed(2)+' kg':(Math.round(g*10)/10)+' g';}
function totals(parts){var g=0;parts.forEach(function(p){g+=weightOf(p);});return g;}
function boxFrame(c,bx){c.strokeStyle='#b8c0cc';c.lineWidth=1.5;c.strokeRect(bx.x,bx.y,bx.w,bx.h);}
function buildPages(ST,o){
  var parts=realParts(ST.parts),pages=[],plates=parts.map(function(p,i){return {p:p,i:i};}).filter(function(e){return e.p.kind==='plate'||e.p.kind==='poly';});
  var want=o.pages||{p3d:true,list:true,views:true,plates:true},defs=[],ROWS=22;
  if(want.p3d)defs.push({k:'3d'});
  if(want.list){for(var i=0;i<Math.max(1,Math.ceil(parts.length/ROWS));i++)defs.push({k:'list',from:i*ROWS});}
  if(want.views&&parts.length)defs.push({k:'views'});
  if(want.plates)for(var j=0;j<plates.length;j+=2)defs.push({k:'plates',items:plates.slice(j,j+2)});
  if(!defs.length)defs.push({k:'3d'});
  var total=defs.length,bb=bboxAll(parts);
  defs.forEach(function(d,n){
    var pg;
    if(d.k==='3d'){
      pg=newPage(o,n+1,total,t('pdf_p3d'));var c=pg.c,bx={x:50,y:210,w:1080,h:970};boxFrame(c,bx);
      if(o.shot){var k=Math.min((bx.w-20)/o.shot.width,(bx.h-20)/o.shot.height),w=o.shot.width*k,h=o.shot.height*k;c.drawImage(o.shot,bx.x+(bx.w-w)/2,bx.y+(bx.h-h)/2,w,h);}
      var X=1160,Wd=PW-50-X,y=210;
      function row(lab,val,big,lines){
        text(c,lab,X,y+18,18,GREY,'left',false);y+=26;
        var nl=wrapText(c,val||'—',X,y+22,Wd,big?26:22,big?32:28,INK,lines||2);y+=Math.max(nl,1)*(big?32:28)+14;c.fillStyle='#e6e9ee';c.fillRect(X,y-6,Wd,1);y+=6;
      }
      c.fillStyle='#eaf2fb';c.fillRect(X-8,y-6,Wd+16,98);row(t('pdf_ie'),o.ie,true,1);
      row(t('pdf_style'),o.style,false,1);row(t('pdf_date'),fmtDate(o.date)+'     '+t('pdf_rev')+': '+(o.rev||'1'),false,1);
      row(t('pdf_purpose'),o.purpose,false,4);
      row(t('pdf_size'),bb?fmt(bb.x1-bb.x0)+' × '+fmt(bb.y1-bb.y0)+' × '+fmt(bb.z1-Math.min(0,bb.z0))+' mm':'—',false,1);
      row(t('pdf_weight'),wtText(totals(parts))+'   ('+parts.length+' '+t('pdf_parts')+')',false,1);
      row(t('pdf_notes'),o.notes,false,5);
      var sy=PH-52-130;[[t('pdf_sig_ie'),o.ie],[t('pdf_sig_chk'),''],[t('pdf_sig_ok'),'']].forEach(function(s,i){
        var w=(Wd-20)/3,x=X+i*(w+10);c.strokeStyle='#b8c0cc';c.lineWidth=1.5;c.strokeRect(x,sy,w,120);text(c,s[0],x+w/2,sy+24,16,GREY,'center',false);
        if(s[1]){c.save();c.beginPath();c.rect(x+4,sy+60,w-8,56);c.clip();text(c,s[1],x+w/2,sy+104,20,INK,'center',true);c.restore();}
      });
    }else if(d.k==='list'){
      pg=newPage(o,n+1,total,t('pdf_plist')+(d.from?' ('+t('pdf_cont')+')':''));var c2=pg.c;
      var rows=parts.slice(d.from,d.from+ROWS).map(function(p,i){return [d.from+i+1,p.name||kindName(p),kindName(p),sizeText(p),t('m_'+p.mat),p.kind==='plate'?(p.holes||[]).length:'',(Math.round(weightOf(p)*10)/10)];});
      var yEnd=drawTable(c2,50,210,[{h:'#',w:60,al:'center'},{h:t('pdf_c_name'),w:500},{h:t('pdf_c_kind'),w:200},{h:t('pdf_c_size'),w:330},{h:t('pdf_c_mat'),w:260},{h:t('pdf_c_holes'),w:110,al:'center'},{h:t('pdf_c_g'),w:190,al:'right'}],rows,40);
      if(d.from+ROWS>=parts.length){text(c2,t('pdf_total')+': '+parts.length+' '+t('pdf_parts')+'   ·   '+wtText(totals(parts)),PW-50,yEnd+44,24,INK,'right',true);}
    }else if(d.k==='views'){
      pg=newPage(o,n+1,total,t('pdf_views'));var c3=pg.c,bt={x:50,y:210,w:980,h:970},bf={x:1060,y:210,w:644,h:470},bs={x:1060,y:710,w:644,h:470};
      [bt,bf,bs].forEach(function(b){boxFrame(c3,b);});
      var a=drawTop(c3,bt,parts,ST.ref),b2=drawElev(c3,bf,parts,ST.ref,'front'),b3=drawElev(c3,bs,parts,ST.ref,'side');
      text(c3,t('pdf_top'),bt.x+14,bt.y+30,22,ACC,'left',true);text(c3,t('pdf_front'),bf.x+14,bf.y+30,22,ACC,'left',true);text(c3,t('pdf_side'),bs.x+14,bs.y+30,22,ACC,'left',true);
      if(a)text(c3,t('pdf_scale')+' '+scaleLabel(a.s),bt.x+bt.w-14,bt.y+30,20,GREY,'right',false);
      if(b2)text(c3,t('pdf_scale')+' '+scaleLabel(b2.s),bf.x+bf.w-14,bf.y+30,20,GREY,'right',false);
      if(b3)text(c3,t('pdf_scale')+' '+scaleLabel(b3.s),bs.x+bs.w-14,bs.y+30,20,GREY,'right',false);
    }else{
      pg=newPage(o,n+1,total,t('pdf_plates'));var c4=pg.c;
      d.items.forEach(function(e,k){
        var bx={x:50+k*834,y:210,w:820,h:970},p=e.p;boxFrame(c4,bx);
        text(c4,'#'+(e.i+1)+'  '+(p.name||kindName(p)),bx.x+14,bx.y+34,26,ACC,'left',true);
        text(c4,fmt(p.w)+' × '+fmt(p.d)+' × '+fmt(p.h)+' mm  ·  '+t('m_'+p.mat)+'  ·  '+wtText(weightOf(p)),bx.x+14,bx.y+66,20,GREY,'left',false);
        var dr=drawPlate(c4,{x:bx.x,y:bx.y+80,w:bx.w,h:540},p);
        text(c4,t('pdf_scale')+' '+scaleLabel(dr.s),bx.x+bx.w-14,bx.y+34,20,GREY,'right',false);
        var hs=p.holes||[],lim=11,hr=hs.slice(0,lim).map(function(h,i){
          var sz=h.t==='round'?'Ø'+fmt(h.a):h.t==='slot'?fmt(h.a)+' × '+fmt(h.b):fmt(h.a)+' × '+fmt(h.b)+(h.c?'  R'+fmt(h.c):'');
          return ['H'+(i+1),t('h_'+h.t),fmt(h.x+p.w/2),fmt(h.y+p.d/2),sz];
        });
        if(hs.length>lim)hr.push(['…','+'+(hs.length-lim),'','','']);
        if(hs.length)drawTable(c4,bx.x+10,bx.y+640,[{h:'#',w:70,al:'center'},{h:t('pdf_c_kind'),w:190},{h:'X (mm)',w:150,al:'right'},{h:'Y (mm)',w:150,al:'right'},{h:t('pdf_c_size'),w:230}],hr,sedH(hs.length));
        else text(c4,p.kind==='poly'?t('pdf_poly'):t('pdf_noholes'),bx.x+14,bx.y+670,22,GREY,'left',false);
        if(hs.length)text(c4,t('pdf_holenote'),bx.x+14,bx.y+bx.h-14,17,GREY,'left',false);
      });
    }
    pages.push(pg.cv);
  });
  return pages;
}
function sedH(n){return n>8?30:38;}
/* ---- PDF writer ---- */
function u8(str){var a=new Uint8Array(str.length);for(var i=0;i<str.length;i++)a[i]=str.charCodeAt(i)&255;return a;}
function hex16(s){var r='FEFF';for(var i=0;i<s.length;i++){var h=s.charCodeAt(i).toString(16);r+='0000'.slice(h.length)+h;}return '<'+r.toUpperCase()+'>';}
function dataUrlBytes(u){var b=atob(u.split(',')[1]),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
function makePdf(canvases,meta){
  var chunks=[],pos=0,offs=[];
  function put(x){var a=typeof x==='string'?u8(x):x;chunks.push(a);pos+=a.length;}
  function obj(n,body,stream){offs[n]=pos;put(n+' 0 obj\n'+body+'\n');if(stream){put('stream\n');put(stream);put('\nendstream\n');}put('endobj\n');}
  var N=canvases.length,kids=[],i;put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  for(i=0;i<N;i++)kids.push((4+3*i)+' 0 R');
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+N+' >>');
  var d=new Date(),p2=function(v){return ('0'+v).slice(-2);};
  obj(3,'<< /Title '+hex16(meta.title||'')+' /Author '+hex16(meta.author||'')+' /Subject '+hex16(meta.subject||'')+' /Creator (IE Tools 3D fixture design) /Producer (IE Tools) /CreationDate (D:'+d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+p2(d.getHours())+p2(d.getMinutes())+p2(d.getSeconds())+') >>');
  for(i=0;i<N;i++){
    var jpg=dataUrlBytes(canvases[i].toDataURL('image/jpeg',0.92)),b=4+3*i,cs='q 842 0 0 595 0 0 cm /Im0 Do Q';
    obj(b,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 '+(b+2)+' 0 R >> /ProcSet [/PDF /ImageC] >> /Contents '+(b+1)+' 0 R >>');
    obj(b+1,'<< /Length '+cs.length+' >>',u8(cs));
    obj(b+2,'<< /Type /XObject /Subtype /Image /Width '+canvases[i].width+' /Height '+canvases[i].height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>',jpg);
  }
  var total=3+3*N,xo=pos,x='xref\n0 '+(total+1)+'\n0000000000 65535 f \n';
  for(i=1;i<=total;i++)x+=('0000000000'+offs[i]).slice(-10)+' 00000 n \n';
  put(x+'trailer\n<< /Size '+(total+1)+' /Root 1 0 R /Info 3 0 R >>\nstartxref\n'+xo+'\n%%EOF\n');
  return new Blob(chunks,{type:'application/pdf'});
}
