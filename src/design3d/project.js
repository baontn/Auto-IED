/* Project folder: the user picks a folder once (File System Access API, remembered in IndexedDB); Save writes the project
   file straight into it, Open lists the projects of that folder. Without folder access (other browsers) Save downloads a file. */
var PJ={dir:null,name:''};
function pjKv(op,k,v){
  return new Promise(function(res,rej){
    var r=indexedDB.open('design3d',1);r.onupgradeneeded=function(){r.result.createObjectStore('kv');};r.onerror=function(){rej(r.error);};
    r.onsuccess=function(){try{var s=r.result.transaction('kv',op==='get'?'readonly':'readwrite').objectStore('kv'),q=op==='get'?s.get(k):s.put(v,k);q.onsuccess=function(){res(q.result);};q.onerror=function(){rej(q.error);};}catch(e){rej(e);}};
  });
}
function pjChip(){var e=$('dirName');if(e)e.textContent=window.showDirectoryPicker?(PJ.name||t('pj_none')):t('pj_dl');}
function pjInit(){
  if(!window.showDirectoryPicker){pjChip();return Promise.resolve();}
  return pjKv('get','dir').then(function(h){if(h){PJ.dir=h;PJ.name=h.name;}}).catch(function(){}).then(pjChip);
}
async function pjPick(){
  var h=await window.showDirectoryPicker({id:'design3d',mode:'readwrite'});
  PJ.dir=h;PJ.name=h.name;pjKv('set','dir',h).catch(function(){});pjChip();return h;
}
/* the project folder with write permission; asks for it when needed. null = cancelled / no access */
async function pjDir(){
  if(!window.showDirectoryPicker)return null;
  try{
    if(PJ.dir){
      var p=await PJ.dir.queryPermission({mode:'readwrite'});
      if(p!=='granted')p=await PJ.dir.requestPermission({mode:'readwrite'});
      if(p==='granted')return PJ.dir;
    }
    return await pjPick();
  }catch(e){return null;}
}
async function pjSave(){
  var text=JSON.stringify(ST,null,1),fn=safeName(ST.name)+'.fixture3d.json';
  if(!window.showDirectoryPicker){download(new Blob([text],{type:'application/json'}),fn);toast(t('t_saved'));return;}
  var dir=await pjDir();if(!dir){toast(t('pj_cancel'));return;}
  try{
    var fh=await dir.getFileHandle(fn,{create:true}),w=await fh.createWritable();await w.write(text);await w.close();
    toast(t('pj_saved')+': '+PJ.name+' / '+fn);
  }catch(e){toast(t('pj_err')+' '+(e&&e.message||e));}
}
async function pjOpenDialog(){
  if(!window.showDirectoryPicker){$('fOpen').click();return;}
  var dir=await pjDir();if(!dir)return;
  var items=[];
  try{for await(var e of dir.values()){if(e.kind==='file'&&/\.fixture3d\.json$/i.test(e.name)){var f=await e.getFile();items.push({name:e.name,h:e,mod:f.lastModified||0});}}}catch(x){}
  items.sort(function(a,b){return b.mod-a.mod;});
  var box=$('pjList');
  box.innerHTML=items.length?items.map(function(it,i){var d=it.mod?new Date(it.mod):null;return '<div class="li" data-pj="'+i+'"><span>'+esc(it.name.replace(/\.fixture3d\.json$/i,''))+'</span><small>'+(d?d.toLocaleDateString()+' '+d.toLocaleTimeString().slice(0,5):'')+'</small></div>';}).join(''):'<div class="muted pad">'+esc(t('pj_empty'))+'</div>';
  box.onclick=async function(ev){var r=ev.target.closest('[data-pj]');if(!r)return;var it=items[+r.dataset.pj];try{var f=await it.h.getFile();loadProject(await f.text());closeDlg();}catch(x){toast(t('pj_err'));}};
  $('pjDirName').textContent=PJ.name;$('dlgOpen').classList.add('on');
}
