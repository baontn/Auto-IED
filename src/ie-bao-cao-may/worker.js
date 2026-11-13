// ===================== WORKER: hash + parse + extract =====================
onmessage = async function (e) {
  var d = e.data, res = { id: d.id, status: 'OK', notes: [], note: '', hash: '', content: '', reused: false, units: [], bad: [], mode: '', type: '', obd: 0, ms: 0 };
  var t0 = performance.now();
  try {
    if (self.crypto && crypto.subtle) {
      var h = new Uint8Array(await crypto.subtle.digest('SHA-256', d.buf));
      res.hash = Array.from(h, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    if (d.knownHash && d.knownHash === res.hash) { res.reused = true; }
    else {
      var wb = XLSX.read(new Uint8Array(d.buf), { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
      var x = extractWorkbook(wb);
      res.units = x.units; res.bad = x.bad; res.mode = x.mode; res.type = x.type; res.obd = x.obd; res.notes = x.notes;
      var ck = new TextEncoder().encode(contentKey(x.units));
      var ch = new Uint8Array(await crypto.subtle.digest('SHA-256', ck));
      res.content = Array.from(ch, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      if (!x.units.some(function (u) { return u.rows.length; })) { res.status = 'NoMatch'; res.notes.push(['noTable']); }
    }
  } catch (err) { res.status = 'Failed'; res.notes.push(['readErr', String(err && err.message || err).slice(0, 200)]); }
  res.ms = Math.round(performance.now() - t0);
  postMessage(res);
};
