// in-memory File System Access mock fed from window.__FS (path -> base64 / text)
(function(){
  function mkFile(name, getBytes){ return { kind:'file', name, async getFile(){ const b=getBytes(); return new File([b], name); },
    async createWritable(opts){ const parts=[]; let keep = opts && opts.keepExistingData; let base = keep ? getBytes() : new Uint8Array(); return {
      async seek(){}, async write(x){ parts.push(typeof x==='string'? new TextEncoder().encode(x): x); },
      async close(){ const all=[base,...parts]; let n=all.reduce((s,a)=>s+a.length,0), out=new Uint8Array(n), o=0; all.forEach(a=>{out.set(a,o);o+=a.length;}); window.__FS[curPath(name)] = out; } }; } }; }
  let cur=''; function curPath(n){ return cur+n; }
  function mkDir(prefix){ return { kind:'directory', name: prefix.replace(/\/$/,'').split('/').pop(),
    async *values(){ const seen=new Set(); for (const k of Object.keys(window.__FS)) { if(!k.startsWith(prefix)) continue; const rest=k.slice(prefix.length); const parts=rest.split('/');
      if(parts.length===1){ yield fileH(prefix, parts[0]); } else if(!seen.has(parts[0])){ seen.add(parts[0]); yield mkDir(prefix+parts[0]+'/'); } } },
    async getDirectoryHandle(n,o){ const p=prefix+n+'/'; if(!Object.keys(window.__FS).some(k=>k.startsWith(p)) && !(o&&o.create)) throw new DOMException('nf','NotFoundError'); return mkDir(p); },
    async getFileHandle(n,o){ const p=prefix+n; if(!(p in window.__FS)){ if(o&&o.create) window.__FS[p]=new Uint8Array(); else throw new DOMException('nf','NotFoundError'); } return fileH(prefix,n); } }; }
  function fileH(prefix,n){ const h=mkFile(n, ()=>window.__FS[prefix+n]); const cw=h.createWritable; h.createWritable=async function(o){ cur=prefix; return cw.call(h,o); }; return h; }
  window.showDirectoryPicker = async function(o){ return mkDir(o && o.id === 'layroot' ? 'lay/' : 'data/'); };
})();
