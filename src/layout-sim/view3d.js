/* view3d.js: 3D view (three.js, bundled in the page, no network). 1 unit = 1 cm, plan (x, y) -> 3D (x, z), y is up.
   Machines are drawn from simple shapes per family, proportioned on the models in the register
   (Juki DDL-9000C, Yamato CZ6020 / VF2500 / VG2700, Juki LK-1900, Juki AMS-221, Precious PC8520, Oxima OS-390...). */
var V3 = { ruler: true, ok: false, scene: null, cam: null, ren: null, root: null, theta: -0.55, phi: 0.95, rad: 1500, tgt: null, people: true, labels: true, dirty: true };
var MAT = {}, GEO = {};

function mat(hex, o) {
  var k = hex + JSON.stringify(o || {});
  if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.6, metalness: 0.05 }, o || {}));
  return MAT[k];
}
var M = {};
function initMats() {
  M = { top: mat('#d8c9a9', { roughness: 0.8 }), leg: mat('#40464f', { metalness: 0.4, roughness: 0.5 }), head: mat('#eeede6', { roughness: 0.35 }),
    head2: mat('#e4dfcf', { roughness: 0.4 }), dark: mat('#2b3038', { roughness: 0.5 }), steel: mat('#b9c0c8', { metalness: 0.7, roughness: 0.3 }),
    panel: mat('#1d2a3a', { roughness: 0.3 }), screen: mat('#3d8be0', { emissive: '#1a4f8f', emissiveIntensity: 0.4 }), blue: mat('#2d6cc0'),
    red: mat('#c23b3b'), press: mat('#5b6068', { metalness: 0.3 }), board: mat('#e9e9e6', { roughness: 0.9 }), cone: [mat('#e0457b'), mat('#2f7de1'), mat('#f2c230'), mat('#3fae6a'), mat('#f5f5f5')],
    seat: mat('#36404d', { roughness: 0.8 }), shirt: mat('#3f7bd0', { roughness: 0.9 }), skin: mat('#d9a982', { roughness: 0.8 }), pants: mat('#2d3748', { roughness: 0.9 }),
    mat: mat('#3b4048', { roughness: 1 }), arc: mat('#7c3aed', { roughness: 0.5 }), obj: {}, floor: mat('#cfd3d8', { roughness: 1 }), lineFloor: mat('#f1efe9', { roughness: 1 }) };
}
function geoBox(w, h, d) { var k = 'b' + w + ',' + h + ',' + d; return GEO[k] || (GEO[k] = new THREE.BoxGeometry(w, h, d)); }
function geoCyl(rt, rb, h, seg) { var k = 'c' + rt + ',' + rb + ',' + h + ',' + (seg || 20); return GEO[k] || (GEO[k] = new THREE.CylinderGeometry(rt, rb, h, seg || 20)); }
function geoSph(r) { var k = 's' + r; return GEO[k] || (GEO[k] = new THREE.SphereGeometry(r, 18, 12)); }
/* add a box: size (w along x, h up, d along z), centre (x, y, z) */
function B(g, w, h, d, m, x, y, z) { var o = new THREE.Mesh(geoBox(+w.toFixed(1), +h.toFixed(1), +d.toFixed(1)), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; }
/* add a cylinder, axis 'y' (default), 'x' or 'z' */
function C(g, r, h, m, x, y, z, axis, r2) {
  var o = new THREE.Mesh(geoCyl(+r.toFixed(1), +(r2 == null ? r : r2).toFixed(1), +h.toFixed(1)), m); o.position.set(x, y, z);
  if (axis === 'x') o.rotation.z = Math.PI / 2; else if (axis === 'z') o.rotation.x = Math.PI / 2;
  o.castShadow = true; g.add(o); return o;
}

/* ---------- parts ---------- */
function partTable(g, L, W, H, opt) {
  opt = opt || {};
  B(g, L, 3, W, M.top, 0, H - 1.5, 0);
  var lx = L / 2 - 5, lz = W / 2 - 5;
  [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].forEach(function (p) { B(g, 3.5, H - 3, 3.5, M.leg, p[0], (H - 3) / 2, p[1]); });
  B(g, L - 10, 3, 3, M.leg, 0, 12, -lz); B(g, 3, 3, W - 10, M.leg, -lx, 12, 0); B(g, 3, 3, W - 10, M.leg, lx, 12, 0);
  if (!opt.noDrawer) B(g, 34, 11, W * 0.6, M.head2, -L / 2 + 22, H - 9, -W * 0.1);
  if (opt.pedal !== false) { B(g, 24, 2.5, 30, M.dark, opt.sx || 0, 6, W / 2 - 20).rotation.x = -0.18; }
  if (opt.ctrl) B(g, 26, 14, 18, M.dark, L / 2 - 26, H - 12, -W * 0.2);
}
function partStand(g, x, z, H, n) {
  B(g, 18, 1.5, 12, M.leg, x, H + 0.8, z);
  C(g, 0.7, 92, M.steel, x, H + 46, z);
  B(g, 22, 1, 2, M.steel, x, H + 92, z);
  for (var i = 0; i < n; i++) { var cx = x - (n - 1) * 3 + i * 6; C(g, 1.2, 9, M.cone[i % M.cone.length], cx, H + 6, z, 'y', 2.8); }
}
function partHandwheel(g, x, y, z) { C(g, 6.5, 3.5, M.dark, x, y, z, 'x'); C(g, 2, 5, M.steel, x - 2, y, z, 'x'); }
function partLockHead(g, sx, H, W, o) {   // DDL-9000C-like: bed, pillar, arm, head, handwheel; o.len = arm length
  o = o || {}; var z = W / 2 - 20, len = o.len || 40, ah = o.h || 30;
  B(g, len + 12, 1.2, 18, M.head2, sx + len / 2 - 2, H + 0.6, z);                       // bed plate (flush)
  B(g, 9, ah - 2, 14, M.head, sx + len, H + (ah - 2) / 2, z);                            // pillar
  B(g, len + 6, 9, 12, M.head, sx + len / 2, H + ah - 4.5, z);                            // arm
  B(g, 10, ah - 9, 12, M.head, sx - 1, H + 9 + (ah - 9) / 2 - 1, z);                      // head front
  C(g, 0.35, 8, M.steel, sx - 1, H + 6, z + 4.5);                                          // needle bar
  B(g, 3, 2, 3, M.steel, sx - 1, H + 2.2, z + 4.5);                                         // presser foot
  partHandwheel(g, sx + len + 6.5, H + ah - 9, z);
  B(g, 12, 3, 7, M.panel, sx + len * 0.55, H + ah + 1.5, z + 2);                           // operation panel
  return z;
}

/* ---------- machine builders, local frame: x along the table, operator at +z ---------- */
function buildMachine(fam, L, W, H, sx) {
  var g = new THREE.Group(), z;
  switch (fam) {
    case 'lockstitch':
      partTable(g, L, W, H, { sx: sx, ctrl: true }); partLockHead(g, sx, H, W); partStand(g, L / 2 - 12, -W / 2 + 9, H, 2); break;
    case 'coverstitch':
      partTable(g, L, W, H, { sx: sx, ctrl: true }); z = partLockHead(g, sx, H, W, { len: 36, h: 34 });
      B(g, 16, 3, 3, M.steel, sx - 2, H + 26, z + 7);                                       // top cover spreader
      partStand(g, L / 2 - 12, -W / 2 + 9, H, 4); break;
    case 'bonding':
      partTable(g, L, W, H, { sx: sx, ctrl: true }); z = partLockHead(g, sx, H, W, { len: 38, h: 30 });
      C(g, 9, 6, M.board, sx + 14, H + 39, z, 'z'); C(g, 2.5, 7, M.dark, sx + 14, H + 39, z, 'z');   // film / tape roll
      B(g, 14, 6, 8, M.red, sx + 2, H + 33, z + 4);                                         // heater
      break;
    case 'cylinder':
      partTable(g, L, W, H, { sx: sx, ctrl: true }); z = W / 2 - 20;
      B(g, 22, 14, 20, M.head2, sx + 30, H + 7, z);                                         // pedestal
      C(g, 4.2, 30, M.head, sx + 12, H + 16, z, 'x');                                        // cylinder bed
      B(g, 8, 18, 14, M.head, sx + 38, H + 23, z); B(g, 44, 9, 12, M.head, sx + 18, H + 36, z); B(g, 10, 14, 12, M.head, sx - 1, H + 28, z);
      C(g, 0.35, 6, M.steel, sx - 1, H + 22, z + 4.5); partHandwheel(g, sx + 44, H + 30, z); partStand(g, L / 2 - 12, -W / 2 + 9, H, 3); break;
    case 'overlock':
      partTable(g, L, W, H, { sx: sx, ctrl: true }); z = W / 2 - 18;
      B(g, 30, 20, 24, M.head2, sx + 6, H + 10, z - 2); B(g, 18, 9, 16, M.head, sx - 2, H + 24, z + 1);   // body + looper cover
      B(g, 6, 1, 8, M.steel, sx - 3, H + 1, z + 9);                                         // throat plate / foot
      partHandwheel(g, sx + 23, H + 15, z - 2);
      B(g, 10, 20, 12, M.dark, sx + 2, H - 13, z - 2);                                      // waste chute
      partStand(g, L / 2 - 12, -W / 2 + 9, H, 4); break;
    case 'bartack':
      partTable(g, L, W, H, { sx: sx, ctrl: true }); z = W / 2 - 22;
      B(g, 58, 7, 26, M.head2, sx + 22, H + 3.5, z - 2);                                    // flat bed
      B(g, 12, 28, 16, M.head, sx + 46, H + 21, z - 4); B(g, 52, 12, 16, M.head, sx + 22, H + 33, z - 4); B(g, 13, 16, 16, M.head, sx - 2, H + 21, z - 2);
      B(g, 16, 1.5, 12, M.dark, sx - 2, H + 8, z + 4);                                      // work clamp
      B(g, 14, 9, 4, M.panel, L / 2 - 14, H + 10, W / 2 - 6); B(g, 11, 6, 0.6, M.screen, L / 2 - 14, H + 11, W / 2 - 3.8);
      partStand(g, L / 2 - 12, -W / 2 + 9, H, 2); break;
    case 'pattern':
      partTable(g, L, W, H, { sx: 0, ctrl: true });
      B(g, L * 0.72, 8, W * 0.62, M.head2, 0, H + 4, 0);                                     // X-Y bed
      B(g, L * 0.5, 1.5, W * 0.4, M.dark, -L * 0.05, H + 9, W * 0.06);                        // clamp frame
      B(g, 16, 36, 20, M.head, L * 0.3, H + 26, -W * 0.18); B(g, L * 0.36, 13, 18, M.head, L * 0.13, H + 42, -W * 0.18); B(g, 14, 16, 18, M.head, -L * 0.04, H + 30, -W * 0.18);
      B(g, 18, 12, 4, M.panel, L * 0.36, H + 12, W * 0.42); partStand(g, -L / 2 + 14, -W / 2 + 9, H, 2); break;
    case 'ultrasonic':
      partTable(g, L, W, H, { sx: sx }); z = W / 2 - 20;
      B(g, 36, 22, 30, M.press, L / 2 - 24, H - 14, -W * 0.15);                              // generator under the table
      B(g, 12, 6, 14, M.dark, sx, H + 3, z - 10); C(g, 4.5, 34, M.steel, sx, H + 20, z - 10);  // column
      B(g, 10, 7, 18, M.head, sx, H + 33, z - 3); C(g, 2.8, 14, M.steel, sx, H + 23, z + 4, 'y', 1.6);   // horn
      C(g, 4, 3, M.steel, sx, H + 1.5, z + 4); break;
    case 'press':                                                                         // stand-alone heat press, footprint = machine
      B(g, L * 0.8, H + 10, W * 0.82, M.press, 0, (H + 10) / 2, 0);
      B(g, L * 0.72, 4, W * 0.6, M.steel, 0, H + 12, W * 0.06);                               // lower platen
      B(g, 16, 46, 18, M.press, 0, H + 33, -W * 0.33);                                       // back column
      B(g, L * 0.62, 11, W * 0.52, M.press, 0, H + 52, W * 0.02); B(g, L * 0.6, 2, W * 0.5, M.steel, 0, H + 46, W * 0.02);
      B(g, 16, 10, 3, M.panel, L * 0.3, H + 20, W * 0.42); B(g, 12, 6, 0.6, M.screen, L * 0.3, H + 21, W * 0.44);
      B(g, 6, 4, 6, M.red, -L * 0.32, H + 16, W * 0.38); B(g, 6, 4, 6, M.red, L * 0.12, H + 16, W * 0.38); break;
    case 'iron':
      B(g, L, 4, W, M.board, 0, H + 6, 0); B(g, L * 0.9, H, W * 0.8, M.press, 0, H / 2 + 2, -W * 0.02);  // vacuum table body
      B(g, 26, 5, 14, M.steel, sx, H + 10.5, W * 0.15); B(g, 14, 8, 4, M.dark, sx, H + 16, W * 0.15);  // iron
      C(g, 0.5, 70, M.dark, L / 2 - 10, H + 41, -W / 2 + 8); break;
    case 'stretch':
      partTable(g, L, W, H, { sx: sx });
      B(g, 4, 55, 4, M.leg, -L * 0.4, H + 27, -W * 0.3); B(g, 4, 55, 4, M.leg, L * 0.4, H + 27, -W * 0.3); B(g, L * 0.84, 4, 4, M.leg, 0, H + 55, -W * 0.3);
      C(g, 5, L * 0.7, M.steel, 0, H + 20, -W * 0.05, 'x'); C(g, 5, L * 0.7, M.steel, 0, H + 38, -W * 0.05, 'x'); break;
    case 'snap':
      partTable(g, L, W, H, { sx: sx }); B(g, 20, 4, 24, M.dark, 0, H + 2, -2);
      B(g, 10, 62, 10, M.blue, 0, H + 31, -W * 0.25); B(g, 14, 16, 26, M.blue, 0, H + 56, -W * 0.08); C(g, 2, 14, M.steel, 0, H + 42, W * 0.02); break;
    case 'suction':
      B(g, L * 0.8, 95, W * 0.8, M.press, 0, 47.5, 0); C(g, 12, 25, M.steel, 0, 107, -W * 0.1, 'y', 6); C(g, 3, 60, M.dark, L * 0.2, 80, W * 0.3, 'z'); break;
    case 'table':
      partTable(g, L, W, H, { sx: sx, pedal: false }); B(g, 30, 10, 22, M.blue, -L * 0.25, H + 5, -W * 0.15); B(g, 30, 10, 22, M.blue, L * 0.25, H + 5, -W * 0.15); break;
    default:
      partTable(g, L, W, H, { sx: sx }); B(g, Math.min(50, L * 0.5), 30, Math.min(30, W * 0.5), M.head, sx + 10, H + 15, 0);
  }
  return g;
}
function buildStanding(g, x, W, e, person) {
  var c = new THREE.Group(), z = W / 2 + e.standGap;
  B(c, Math.min(e.standW, 90) - 6, 1.2, Math.min(e.standDepth - 10, 60), M.mat, 0, 0.6, -(z - W / 2 - 6) + Math.min(e.standDepth - 10, 60) / 2);   // anti-fatigue mat
  if (person) {                                                                         // standing operator facing the table (-z)
    [-1, 1].forEach(function (k) { B(c, 12, 80, 15, M.pants, k * 9, 40, 0); B(c, 12, 4, 24, M.dark, k * 9, 2, -4); });
    B(c, 38, 56, 22, M.shirt, 0, 108, -2).rotation.x = 0.08;
    var hd = new THREE.Mesh(geoSph(10.5), M.skin); hd.position.set(0, 148, -3); hd.castShadow = true; c.add(hd);
    [-1, 1].forEach(function (k) { var a = B(c, 9, 9, 40, M.shirt, k * 20, 112, -18); a.rotation.x = 0.75; B(c, 7, 6, 8, M.skin, k * 18, 96, -34); });
  }
  c.position.set(x, 0, z); g.add(c);
}
function buildChair(g, x, z, e, person) {
  var c = new THREE.Group(), sh = e.seatH;
  for (var i = 0; i < 5; i++) { var a = B(c, 26, 2.5, 3, M.dark, 0, 5, 0); a.position.set(Math.cos(i * 1.2566) * 12, 5, Math.sin(i * 1.2566) * 12); a.rotation.y = -i * 1.2566; }
  C(c, 2, sh - 8, M.steel, 0, (sh - 8) / 2 + 4, 0);
  B(c, e.chairW * 0.9, 6, e.chairD * 0.85, M.seat, 0, sh - 3, 0);
  B(c, 4, 18, 4, M.steel, 0, sh + 8, e.chairD * 0.4); B(c, e.chairW * 0.8, 24, 5, M.seat, 0, sh + 24, e.chairD * 0.45);
  if (person) {                                                                         // seated operator facing the table (-z)
    B(c, 34, 14, 40, M.pants, 0, sh + 7, -6);                                             // thighs
    B(c, 30, sh - 6, 12, M.pants, 0, (sh - 6) / 2, -28);                                   // lower legs
    B(c, 30, 4, 22, M.dark, 0, 2, -33);                                                   // feet
    B(c, 38, 50, 22, M.shirt, 0, sh + 36, 6).rotation.x = 0.12;                            // torso, slightly forward
    var hd = new THREE.Mesh(geoSph(10.5), M.skin); hd.position.set(0, sh + 72, 1); hd.castShadow = true; c.add(hd);
    [-1, 1].forEach(function (s) { var a = B(c, 9, 9, 36, M.shirt, s * 16, sh + 34, -14); a.rotation.x = 0.35; B(c, 7, 6, 8, M.skin, s * 12, sh + 27, -33); });
  }
  c.position.set(x, 0, z); g.add(c);
}
function buildObject(it) {
  var g = new THREE.Group(), H = it.H || (/pillar|cột/i.test(it.name) ? 300 : 75), col = it.color || '#c9ccd3';
  var m = M.obj[col] || (M.obj[col] = mat(col, { roughness: 0.8 }));
  if (H > 120) B(g, it.L, H, it.W, m, 0, H / 2, 0);
  else { partTable(g, it.L, it.W, H, { pedal: false, noDrawer: true }); B(g, it.L - 2, 2, it.W - 2, m, 0, H + 1, 0); }
  return g;
}
/* big operation number above the operator (like the 2D seat label) */
function opSprite(op) {
  var cv = document.createElement('canvas'); cv.width = 160; cv.height = 128; var x = cv.getContext('2d');
  x.fillStyle = '#ffd36b'; x.strokeStyle = '#0b3d91'; x.lineWidth = 6; x.beginPath(); if (x.roundRect) x.roundRect(6, 6, 148, 116, 30); else x.rect(6, 6, 148, 116); x.fill(); x.stroke();
  x.fillStyle = '#0b3d91'; x.textAlign = 'center'; x.font = 'bold ' + (String(op).length > 3 ? 54 : 78) + 'px Segoe UI, Arial'; x.fillText(op, 80, String(op).length > 3 ? 82 : 92);
  var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false })); s.scale.set(40, 32, 1); s.renderOrder = 11; return s;
}
function smallSprite(txt, w) {
  var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; var x = cv.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,.88)'; x.beginPath(); if (x.roundRect) x.roundRect(4, 6, 248, 52, 12); else x.rect(4, 6, 248, 52); x.fill();
  x.fillStyle = '#1d2330'; x.textAlign = 'center'; x.font = 'bold 38px Segoe UI, Arial'; x.fillText(txt, 128, 46);
  var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false })); s.scale.set(w || 56, (w || 56) / 4, 1); s.renderOrder = 9; return s;
}
function textSprite(t1, t2) {
  var cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; var x = cv.getContext('2d');
  x.fillStyle = 'rgba(20,24,31,.78)'; x.beginPath(); if (x.roundRect) x.roundRect(8, 14, 240, 100, 18); else x.rect(8, 14, 240, 100); x.fill();
  x.textAlign = 'center';
  if (t2) { x.font = 'bold 60px Segoe UI, Arial'; x.fillStyle = '#ffd36b'; x.fillText(t2, 128, 66); x.font = '600 32px Segoe UI, Arial'; x.fillStyle = '#fff'; x.fillText(t1, 128, 104); }
  else { x.font = 'bold 50px Segoe UI, Arial'; x.fillStyle = '#fff'; x.fillText(t1, 128, 82); }
  var tx = new THREE.CanvasTexture(cv), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false }));
  s.scale.set(48, 24, 1); s.renderOrder = 10; return s;
}
function rectLoop(L, W, col, y) {
  var g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-L / 2, y, -W / 2), new THREE.Vector3(L / 2, y, -W / 2), new THREE.Vector3(L / 2, y, W / 2), new THREE.Vector3(-L / 2, y, W / 2)]);
  return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: col }));
}

/* ---------- scene ---------- */
function init3d() {
  if (V3.ok) return true;
  if (!window.THREE) return false;
  var host = document.getElementById('v3');
  V3.ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  V3.ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  V3.ren.shadowMap.enabled = true; V3.ren.shadowMap.type = THREE.PCFSoftShadowMap;
  V3.ren.outputEncoding = THREE.sRGBEncoding;
  host.appendChild(V3.ren.domElement);
  V3.scene = new THREE.Scene();
  V3.cam = new THREE.PerspectiveCamera(40, 1, 5, 40000);
  V3.tgt = new THREE.Vector3(0, 60, 0);
  V3.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.75));
  var sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
  V3.sun = sun; V3.scene.add(sun); V3.scene.add(sun.target);
  initMats();
  V3.root = new THREE.Group(); V3.scene.add(V3.root);
  var el = V3.ren.domElement, dr = null;
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  el.addEventListener('pointerdown', function (e) {
    el.setPointerCapture(e.pointerId);
    dr = { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey, moved: 0 };
    if (e.button !== 0 || e.shiftKey) return;
    var id = hitId(e);
    if (!id) return;
    if (OPMODE) { var ti = itemById(id); if (ti && ti.kind === 'mc') { opToggleOne(ti); changed(); } dr.done = true; return; }
    if (e.ctrlKey || e.metaKey) { var k = SEL.indexOf(id); if (k >= 0) SEL.splice(k, 1); else SEL.push(id); onSelChange(); dr.done = true; return; }
    if (SEL.indexOf(id) < 0) { SEL = [id]; onSelChange(); }
    var p0 = floorPt(e); if (!p0) return;
    var mv = selItems().filter(function (it) { return !isLocked(it); }); if (!mv.length) { dr.done = true; return; }
    dr.drag = { p0: p0, orig: mv.map(function (it) { return { it: it, x: it.x, y: it.y }; }) };
  });
  el.addEventListener('pointermove', function (e) {
    if (!dr) return; var dx = e.clientX - dr.x, dy = e.clientY - dr.y; dr.x = e.clientX; dr.y = e.clientY; dr.moved += Math.abs(dx) + Math.abs(dy);
    if (dr.done) return;
    if (dr.drag) {                                                                        // move the selected machines on the floor (snap like 2D)
      if (dr.moved < 4) return;
      var p = floorPt(e); if (!p) return;
      var o0 = dr.drag.orig[0], useSnap = OPT.snap && !e.altKey;
      var ddx = (useSnap ? Math.round((o0.x + p.x - dr.drag.p0.x) / ST.erg.snap) * ST.erg.snap : o0.x + p.x - dr.drag.p0.x) - o0.x, ddy = (useSnap ? Math.round((o0.y + p.z - dr.drag.p0.z) / ST.erg.snap) * ST.erg.snap : o0.y + p.z - dr.drag.p0.z) - o0.y;
      dr.drag.orig.forEach(function (o) { o.it.x = n1(o.x + ddx); o.it.y = n1(o.y + ddy); });
      V3.root.children.forEach(function (g) { var it = g.userData.id && itemById(g.userData.id); if (it && SEL.indexOf(it.id) >= 0) g.position.set(it.x, 0, it.y); });
      document.getElementById('selTools').style.display = 'none';
      draw3d(); sideLive(); return;
    }
    if (dr.b === 2 || dr.b === 1 || dr.sh) {                                              // pan on the floor plane
      var k = V3.rad * 0.0012, ct = Math.cos(V3.theta), st = Math.sin(V3.theta);
      V3.tgt.x += (-dx * ct - dy * st) * k; V3.tgt.z += (dx * st - dy * ct) * k;
    } else { V3.theta -= dx * 0.006; V3.phi = Math.max(0.08, Math.min(1.52, V3.phi - dy * 0.006)); }
    draw3d();
  });
  el.addEventListener('pointerup', function (e) {
    if (!dr) return; var d = dr; dr = null;
    if (d.drag && d.moved >= 4) { changed(); return; }
    if (d.done || d.drag) { placeSelTools(); return; }
    if (d.moved < 5 && d.b === 0 && !d.sh) { if (SEL.length) { SEL = []; onSelChange(); } }
  });
  el.addEventListener('wheel', function (e) { e.preventDefault(); V3.rad = Math.max(150, Math.min(20000, V3.rad * (e.deltaY < 0 ? 0.88 : 1.14))); draw3d(); }, { passive: false });
  V3.ok = true;
  return true;
}
function resize3d() {
  if (!V3.ok) return;
  var host = document.getElementById('v3'), w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
  V3.ren.setSize(w, h); V3.cam.aspect = w / h; V3.cam.updateProjectionMatrix(); draw3d();
}
function draw3d() {
  if (!V3.ok) return;
  var t = V3.tgt, r = V3.rad;
  V3.cam.position.set(t.x + r * Math.sin(V3.phi) * Math.sin(V3.theta), t.y + r * Math.cos(V3.phi), t.z + r * Math.sin(V3.phi) * Math.cos(V3.theta));
  V3.cam.lookAt(t); V3.ren.render(V3.scene, V3.cam);
  if (TAB === '3d') placeSelTools();
}
function view3dReset(top) {
  var L = ST.line.length, W = ST.line.width, b = bbox(ST.items);
  var cx = b ? (b.x0 + b.x1) / 2 : L / 2, cz = b ? (b.y0 + b.y1) / 2 : W / 2, span = Math.max(b ? b.x1 - b.x0 : L, b ? b.y1 - b.y0 : W, 300);
  V3.tgt.set(cx, 50, cz); V3.theta = top ? 0 : -0.5; V3.phi = top ? 0.02 : 0.9; V3.rad = span * (top ? 1.2 : 0.8) + 150; draw3d();
}
function rebuild3d() {
  if (!V3.ok) return;
  var root = V3.root, e = ST.erg, H = e.tableH;
  while (root.children.length) { var c = root.children.pop(); c.traverse(function (o) { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } if (o.isLine) { o.geometry.dispose(); o.material.dispose(); } if (o.userData && o.userData.own) o.geometry.dispose(); }); }
  var L = ST.line.length, W = ST.line.width, dark = matchMedia('(prefers-color-scheme: dark)').matches;
  V3.scene.background = new THREE.Color(dark ? '#0f1218' : '#e9ecf0');
  var big = new THREE.Mesh(geoBox(L + 4000, 1, W + 4000), M.floor); big.position.set(L / 2, -0.6, W / 2); big.receiveShadow = true; root.add(big);
  var fl = new THREE.Mesh(geoBox(L, 1, W), M.lineFloor); fl.position.set(L / 2, -0.4, W / 2); fl.receiveShadow = true; root.add(fl);
  var pts = [];
  for (var x = 0; x <= L; x += 100) pts.push(new THREE.Vector3(x, 0.3, 0), new THREE.Vector3(x, 0.3, W));
  for (var y = 0; y <= W; y += 100) pts.push(new THREE.Vector3(0, 0.3, y), new THREE.Vector3(L, 0.3, y));
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#b9bcc2' })));
  var edge = rectLoop(L, W, '#e0a100', 0.5); edge.position.set(L / 2, 0, W / 2); root.add(edge);
  if (V3.ruler) {   // metre marks along the front and left edges, total length and width
    var stp = L > 3000 ? 200 : 100, tk = [];
    for (x = 0; x <= L + 0.1; x += stp) { tk.push(new THREE.Vector3(x, 0.5, W), new THREE.Vector3(x, 0.5, W + 18)); var lb = smallSprite((x / 100) + ' m', 40); lb.position.set(x, 4, W + 40); root.add(lb); }
    for (y = 0; y <= W + 0.1; y += 100) { tk.push(new THREE.Vector3(0, 0.5, y), new THREE.Vector3(-18, 0.5, y)); var lb2 = smallSprite((y / 100) + ' m', 40); lb2.position.set(-50, 4, y); root.add(lb2); }
    tk.push(new THREE.Vector3(0, 0.5, -45), new THREE.Vector3(L, 0.5, -45), new THREE.Vector3(L + 45, 0.5, 0), new THREE.Vector3(L + 45, 0.5, W));
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tk), new THREE.LineBasicMaterial({ color: '#5b6474' })));
    var lt = smallSprite((L / 100).toFixed(2) + ' m', 90); lt.position.set(L / 2, 8, -70); root.add(lt);
    var wt = smallSprite((W / 100).toFixed(2) + ' m', 70); wt.position.set(L + 95, 8, W / 2); root.add(wt);
  }
  var bad = issueIds('bad'), warn = issueIds('warn');
  ST.items.forEach(function (it) {
    var d = itemDim(it), g;
    if (it.kind === 'mc') {
      var S = shapes(it), fam = famOf(it.code);
      g = buildMachine(fam, d.L, d.W, H, S.seatX);
      if (!it.noOp) { if (S.stand) buildStanding(g, S.seatX, d.W, e, V3.people); else buildChair(g, S.seatX, d.W / 2 + e.chairGap + e.chairD / 2, e, V3.people); }
      if (V3.labels) {   // like 2D: machine code above the machine, big operation number above the operator (on the machine when nobody sits there)
        var sp = it.noOp ? textSprite(it.code, it.op || '') : smallSprite(it.code, 44); sp.position.set(0, H + (it.noOp ? 85 : 62), -d.W * 0.1); g.add(sp);
        if (!it.noOp && it.op) { var os = opSprite(it.op), oz = d.W / 2 + (S.stand ? e.standGap : e.chairGap + e.chairD / 2); os.position.set(S.seatX, (S.stand ? 148 : e.seatH + 72) + (V3.people ? 34 : 10), oz); g.add(os); }
      }
    } else {
      g = buildObject(it);
      if (V3.labels && it.name) { var sp2 = textSprite(it.name, ''); sp2.position.set(0, (it.H || 75) + 40, 0); g.add(sp2); }
    }
    var sel = SEL.indexOf(it.id) >= 0;
    if (sel || bad[it.id] || warn[it.id]) g.add(rectLoop(d.L + 6, d.W + 6, sel ? '#1f6feb' : bad[it.id] ? '#e5484d' : '#e0a100', 1));
    g.position.set(it.x, 0, it.y); g.rotation.y = -(it.rot || 0) * Math.PI / 180;
    g.userData.id = it.id; root.add(g);
  });
  // shared operators: double arrow on the floor between the operator and the far machine
  opLinks().forEach(function (l) {
    if (!l.far) {
      var c1 = new THREE.Vector3(l.c1.x, H + 45, l.c1.y), c2 = new THREE.Vector3(l.c2.x, H + 45, l.c2.y), mid = c1.clone().add(c2).multiplyScalar(0.5), dl = c1.distanceTo(c2);
      var ctl = mid.clone().add(new THREE.Vector3(l.back.x * dl * 0.35, Math.max(45, dl * 0.45), l.back.y * dl * 0.35));
      var end = c2.clone().add(ctl.clone().sub(c2).normalize().multiplyScalar(12)), curve = new THREE.QuadraticBezierCurve3(c1, ctl, end);
      var tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 2.2, 8, false), M.arc); tube.userData.own = true; root.add(tube);
      var dir = c2.clone().sub(end).normalize(), cone = new THREE.Mesh(new THREE.ConeGeometry(6, 14, 16), M.arc); cone.userData.own = true;
      cone.position.copy(end.clone().add(dir.clone().multiplyScalar(5))); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); root.add(cone);
      return;
    }
    var a = new THREE.Vector3(l.p1.x, 4, l.p1.y), b = new THREE.Vector3(l.p2.x, 4, l.p2.y), mid = a.clone().add(b).multiplyScalar(0.5), half = a.distanceTo(b) / 2;
    [[b, a], [a, b]].forEach(function (pr) { var dir = pr[0].clone().sub(mid).normalize(); root.add(new THREE.ArrowHelper(dir, mid, half, 0x7c3aed, Math.min(30, half * 0.4), 18)); });
  });
  var s = V3.sun, m = Math.max(L, W) * 0.75 + 300;
  s.position.set(L / 2 - 600, 1800, W / 2 + 900); s.target.position.set(L / 2, 0, W / 2);
  s.shadow.camera.left = -m; s.shadow.camera.right = m; s.shadow.camera.top = m; s.shadow.camera.bottom = -m; s.shadow.camera.near = 100; s.shadow.camera.far = 6000; s.shadow.camera.updateProjectionMatrix();
  draw3d();
}
function rayFrom(e) {
  var r = V3.ren.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), V3.cam);
  return ray;
}
function hitId(e) {
  var hits = rayFrom(e).intersectObjects(V3.root.children, true);
  for (var i = 0; i < hits.length; i++) { var o = hits[i].object; if (o.isSprite) continue; while (o && !o.userData.id) o = o.parent; if (o) return o.userData.id; }   // labels are drawn on top: never pick them
  return null;
}
function floorPt(e) { var p = new THREE.Vector3(); return rayFrom(e).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null; }
/* screen position (in the stage box) of a floor point at height h, for the floating buttons */
function screenOf3d(x, h, z) {
  var v = new THREE.Vector3(x, h, z).project(V3.cam), r = V3.ren.domElement.getBoundingClientRect();
  return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height, r: r, ok: v.z < 1 };
}
function png3d() { draw3d(); return V3.ren.domElement.toDataURL('image/png'); }
