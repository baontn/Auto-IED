// test shim: pickers return real OPFS handles (cloneable into IndexedDB); permissions always granted
(function(){
  const P = FileSystemHandle.prototype;
  P.queryPermission = async () => 'granted'; P.requestPermission = async () => 'granted';
  async function dir(path){ let d = await navigator.storage.getDirectory(); for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, {create:true}); return d; }
  window.__dir = dir;
  window.showDirectoryPicker = async (o) => dir(o && o.id === 'lcLayRoot' ? 'lay' : 'data');
  window.showOpenFilePicker = async (o) => { const d = await dir('pick'); return [await d.getFileHandle(window.__pick)]; };
  window.prompt = () => (window.__prompts && window.__prompts.length ? window.__prompts.shift() : (window.__prompt || 'note'));
})();
