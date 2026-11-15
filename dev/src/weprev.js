// ═════ 武器配置：表現預覽 ═════
// 在武器配置的 3D 畫面直接看：武器開火／轉向（用戰鬥的砲塔動畫：轉塔、仰角、砲管後座、飛彈艙蓋）、戰艦推進、躍傳、受損／破壞／修復。
// 預覽時把編輯用的船體與武器藏起來，另外蓋一份在 WP.root（同一份網格）；按「結束預覽」或改了掛點就回到編輯。
// 單位：船長 ≈ 1（跟武器配置的座標一樣）。特效全部自己做在 WE.scene 裡，不碰戰鬥的特效系統。
const WP_RULE = {
  tgt: { r: 0.95, y: 0.32, spin: 0.5, fixed: [0.6, 0.35, 0.9] },   // 靶機：繞船的半徑、高度、轉速；固定時的位置
  // 各類武器的光彈：速度（船長／秒）、長、寬、連發數、連發間隔、散布、命中閃光大小
  shot: { m: { spd: 2.6, len: 0.16, wid: 0.016, n: 1, gap: 0, spr: 0.01, hit: 0.16 }, s: { spd: 3.6, len: 0.1, wid: 0.009, n: 2, gap: 0.12, spr: 0.02, hit: 0.09 }, a: { spd: 6, len: 0.06, wid: 0.005, n: 7, gap: 0.055, spr: 0.05, hit: 0.04 } },
  msl: { n: 3, gap: 0.14, spd: 2.8, turn: 5, open: 0.45 },
  eng: [null, { len: 0.16, wid: 0.045, I: 0.75, spd: 2.2 }, { len: 0.34, wid: 0.06, I: 1.15, spd: 6 }],   // 推進：關、巡航、全速
  dmgStep: 0.25,
};
const WP = { on: false, built: '', root: null, t: 0, last: 0, list: [], bolts: [], msls: [], fx: null, eng: 0, turn: true, auto: false, autoT: 0,
  dmg: 0, hits: [], dead: false, boom: null, rep: null, warp: null, chunks: null, shake: 0, light: null, lightI: 0 };
const _wpv = new THREE.Vector3(), _wpw = new THREE.Vector3(), _wpq = new THREE.Quaternion(), _wpm = new THREE.Matrix4();

// ───── 粒子（加亮＝火光、火花；一般＝煙）─────
function wpPool(add, N) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), sz = new Float32Array(N);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 400 } }, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */`attribute vec4 aCol; attribute float aSize; uniform float uK; varying vec4 vC;
      void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uK / max(0.05, -mv.z); }`,
    fragmentShader: add ? /* glsl */`varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.; float a = pow(max(0., 1. - d), 1.6); gl_FragColor = vec4(vC.rgb * vC.a * a, 1.); }`
      : /* glsl */`varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.; float a = smoothstep(1., 0.35, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = add ? 6 : 5;
  return { pts, N, n: 0, p: new Float32Array(N * 3), v: new Float32Array(N * 3), age: new Float32Array(N), life: new Float32Array(N), s0: new Float32Array(N), s1: new Float32Array(N), c: new Float32Array(N * 3), a: new Float32Array(N), drag: new Float32Array(N), gr: new Float32Array(N) };
}
// 放一顆粒子：p 位置、v 速度、life 秒、s0→s1 大小（船長）、c 顏色、a 不透明、drag 阻力、gr 往上（煙）／往下
function wpEmit(P, p, v, life, s0, s1, c, a = 1, drag = 0, gr = 0) {
  if (P.n >= P.N) return; const i = P.n++;
  P.p[i * 3] = p.x; P.p[i * 3 + 1] = p.y; P.p[i * 3 + 2] = p.z; P.v[i * 3] = v ? v.x : 0; P.v[i * 3 + 1] = v ? v.y : 0; P.v[i * 3 + 2] = v ? v.z : 0;
  P.age[i] = 0; P.life[i] = life; P.s0[i] = s0; P.s1[i] = s1; P.c[i * 3] = c.r; P.c[i * 3 + 1] = c.g; P.c[i * 3 + 2] = c.b; P.a[i] = a; P.drag[i] = drag; P.gr[i] = gr;
}
function wpPoolStep(P, dt) {
  const pos = P.pts.geometry.attributes.position.array, col = P.pts.geometry.attributes.aCol.array, sz = P.pts.geometry.attributes.aSize.array;
  let j = 0;
  for (let i = 0; i < P.n; i++) {
    const age = P.age[i] + dt; if (age >= P.life[i]) continue;
    const k = Math.max(0, 1 - P.drag[i] * dt);
    for (let c = 0; c < 3; c++) { P.v[i * 3 + c] *= k; P.p[i * 3 + c] += P.v[i * 3 + c] * dt; }
    P.v[i * 3 + 1] += P.gr[i] * dt;
    if (j !== i) {   // 往前擠，活著的粒子保持在前面
      for (let c = 0; c < 3; c++) { P.p[j * 3 + c] = P.p[i * 3 + c]; P.v[j * 3 + c] = P.v[i * 3 + c]; P.c[j * 3 + c] = P.c[i * 3 + c]; }
      P.life[j] = P.life[i]; P.s0[j] = P.s0[i]; P.s1[j] = P.s1[i]; P.a[j] = P.a[i]; P.drag[j] = P.drag[i]; P.gr[j] = P.gr[i];
    }
    P.age[j] = age;
    const u = age / P.life[j], fade = u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9;
    pos[j * 3] = P.p[j * 3]; pos[j * 3 + 1] = P.p[j * 3 + 1]; pos[j * 3 + 2] = P.p[j * 3 + 2];
    col[j * 4] = P.c[j * 3]; col[j * 4 + 1] = P.c[j * 3 + 1]; col[j * 4 + 2] = P.c[j * 3 + 2]; col[j * 4 + 3] = P.a[j] * fade;
    sz[j] = P.s0[j] + (P.s1[j] - P.s0[j]) * u;
    j++;
  }
  P.n = j; P.pts.geometry.setDrawRange(0, j);
  for (const a of ['position', 'aCol', 'aSize']) P.pts.geometry.attributes[a].needsUpdate = true;
}
const WP_C = { fire: new THREE.Color(1, 0.55, 0.18), hot: new THREE.Color(1, 0.85, 0.55), white: new THREE.Color(1, 1, 1), smoke: new THREE.Color(0.16, 0.15, 0.15), dsmoke: new THREE.Color(0.07, 0.065, 0.06), spark: new THREE.Color(1, 0.75, 0.35), weld: new THREE.Color(0.6, 0.85, 1), dust: new THREE.Color(0.55, 0.65, 0.85) };
const wpRnd = (a = 1) => (Math.random() * 2 - 1) * a;
function wpRandDir(out = new THREE.Vector3()) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u); return out.set(s * Math.cos(a), u, s * Math.sin(a)); }
// 爆炸：閃光＋火球＋火花＋煙（s＝大小）
function wpBlast(p, s, sparks = 14, smoke = 4) {
  p = p.clone(); const F = WP.fx; wpEmit(F.add, p, null, 0.12, s * 1.6, s * 2.4, WP_C.white, 1);
  for (let k = 0; k < 6; k++) wpEmit(F.add, _wpw.copy(p).addScaledVector(wpRandDir(_wpv), s * 0.3), wpRandDir(_wpv).multiplyScalar(s * 0.8), 0.35 + Math.random() * 0.3, s * 0.7, s * 1.5, k < 2 ? WP_C.hot : WP_C.fire, 0.9, 3);
  for (let k = 0; k < sparks; k++) wpEmit(F.add, p, wpRandDir(_wpv).multiplyScalar(s * (3 + Math.random() * 5)), 0.3 + Math.random() * 0.5, s * 0.12, s * 0.04, WP_C.spark, 1, 2.5);
  for (let k = 0; k < smoke; k++) wpEmit(F.norm, _wpw.copy(p).addScaledVector(wpRandDir(_wpv), s * 0.4), wpRandDir(_wpv).multiplyScalar(s * 0.4), 1.6 + Math.random() * 1.4, s * 0.8, s * 2.6, WP_C.smoke, 0.55, 0.8, s * 0.2);
  WP.lightI = Math.max(WP.lightI, s * 18); WP.light.position.copy(p);
}
// 擴散的光環（躍傳、大爆炸）
function wpRing(p, r1, life, col, q = null) {
  const m = new THREE.Mesh(WP.fx.ringG, new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(p); if (q) m.quaternion.copy(q); else m.rotation.x = -Math.PI / 2; WE.scene.add(m);
  WP.fx.rings.push({ m, t0: WP.t, life, r1 });
}

// ───── 蓋預覽用的船 ─────
function wpRigGeo(key) {   // 同 main.js rigGeo，但自己一份（一個實例），不跟戰鬥共用 aRig
  const M = getModel(key), g = M.lods[0], geo = new THREE.BufferGeometry(); geo.setIndex(g.index);
  for (const a of ['position', 'normal', 'uv']) if (g.attributes[a]) geo.setAttribute(a, g.attributes[a]);
  const sp = rigSpec(key);
  if (g.attributes.aPart) { geo.setAttribute('aPart', g.attributes.aPart); geo.setAttribute('aPiv', g.attributes.aPiv); }
  else { const n = g.attributes.position.count; geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(sp.mode === 't' || sp.mode === 'f' ? 1 : 0), 1)); geo.setAttribute('aPiv', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); }
  geo.setAttribute('aRig', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 99, 0]), 4).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = g.boundingSphere;
  return geo;
}
// 船尾的噴口：最後面 6% 長度、朝後的頂點，依 (x, y) 分群
function wpNozzles(geo, bb) {
  const P = geo.attributes.position, N = geo.attributes.normal, L = bb.max.z - bb.min.z, cut = bb.min.z + L * 0.07, cell = L * 0.05, map = new Map();
  for (let i = 0; i < P.count; i++) {
    const z = P.getZ(i); if (z > cut || (N && N.getZ(i) > -0.3)) continue;
    const k = Math.round(P.getX(i) / cell) + ',' + Math.round(P.getY(i) / cell), o = map.get(k) || { x: 0, y: 0, z: 0, n: 0 };
    o.x += P.getX(i); o.y += P.getY(i); o.z = Math.min(o.z || z, z); o.n++; map.set(k, o);
  }
  let L2 = [...map.values()].sort((a, b) => b.n - a.n);
  const out = [];
  for (const o of L2) { const x = o.x / o.n, y = o.y / o.n; if (o.n < 3 || out.some((q) => Math.hypot(q.x - x, q.y - y) < cell * 1.6)) continue; out.push({ x, y, z: o.z, n: o.n }); if (out.length >= 6) break; }
  if (!out.length) { const c = bb.getCenter(new THREE.Vector3()); out.push({ x: c.x, y: c.y, z: bb.min.z, n: 1 }); }
  const top = out[0].n; return out.filter((o) => o.n > top * 0.25);
}
// 破壞用的碎塊：三角形照重心分到 z 四段 × 左右兩半，每塊一份幾何（原點在碎塊中心）
function wpFracture(key) {
  const M = getModel(key); if (M.wpChunks) return M.wpChunks;
  const g = M.lods[Math.min(1, M.lods.length - 1)], P = g.attributes.position, Uv = g.attributes.uv, I = g.index, bb = (g.computeBoundingBox(), g.boundingBox);
  const nz = 4, L = bb.max.z - bb.min.z, cells = Array.from({ length: nz * 2 }, () => ({ p: [], u: [] })), n = I ? I.count : P.count;
  for (let t = 0; t < n; t += 3) {
    const id = [0, 1, 2].map((k) => (I ? I.getX(t + k) : t + k));
    let cx = 0, cz = 0; for (const i of id) { cx += P.getX(i); cz += P.getZ(i); }
    cx /= 3; cz /= 3;
    const zi = Math.min(nz - 1, Math.max(0, Math.floor((cz - bb.min.z) / L * nz + Math.sin(cx * 40) * 0.25))), C = cells[zi * 2 + (cx < 0 ? 0 : 1)];
    for (const i of id) { C.p.push(P.getX(i), P.getY(i), P.getZ(i)); if (Uv) C.u.push(Uv.getX(i), Uv.getY(i)); }
  }
  return (M.wpChunks = cells.filter((c) => c.p.length).map((c) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3)); if (c.u.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(c.u, 2));
    geo.computeBoundingBox(); const ctr = geo.boundingBox.getCenter(new THREE.Vector3()); geo.translate(-ctr.x, -ctr.y, -ctr.z); geo.computeVertexNormals();
    return { geo, ctr };
  }));
}
function wpBuild() {
  wpClear();
  const hk = WE.hk, M = getModel(hk); if (!M || WE.loading) return false;
  const fx = WP.fx, root = WP.root = new THREE.Group(); WE.scene.add(root);
  const fi = Math.max(0, FAC_KEY.indexOf(hk[0])), F = FACTION[fi] || FACTION[0], gks = WEAPON_GK[facOfKey(hk)] || '';
  WP.col = F.beam.clone(); WP.glow = F.glow.clone();
  const geo = M.lods[0]; if (!geo.boundingBox) geo.computeBoundingBox(); const bb = WP.bb = geo.boundingBox.clone();
  WP.hull = new THREE.Mesh(geo, M.mat); root.add(WP.hull);
  // 燒焦痕跡：艦長的塗裝層，只開 uDmg
  const pm = capFxPaintMat(); pm.uniforms.uBmin.value.copy(bb.min); pm.uniforms.uBmax.value.copy(bb.max); pm.uniforms.uCol.value.set(F.ui); pm.uniforms.uDmg.value = 0;
  WP.paint = new THREE.Mesh(geo, pm); WP.paint.renderOrder = 3; root.add(WP.paint);
  // 武器：每座一個實例的砲塔動畫網格
  WP.list = weMounts().map((m) => {
    const key = hk[0] + 'w' + m.w; if (!getModel(key)) return null;
    if (!R3.models[key]) R3.models[key] = getModel(key);
    const g2 = wpRigGeo(key), mesh = new THREE.InstancedMesh(g2, rigMat(key), 1); mesh.setMatrixAt(0, _wpm.identity()); mesh.frustumCulled = false;
    setMountObj(mesh, m); root.add(mesh);
    return { m, key, mesh, rig: g2.attributes.aRig, sp: rigSpec(key), ax: mountMatrix({ ...m, hk }).ax, gk: gks[m.w] || 'm', T: capMuzLocal(key), yaw: 0, pit: 0, fireT: -99, open: 0, want: 0, home: { p: mesh.position.clone(), q: mesh.quaternion.clone() }, v: null, w: null };
  }).filter(Boolean);
  // 尾焰
  const fl = capFxGeo().flame; WP.noz = wpNozzles(geo, bb).map((o) => {
    const m = new THREE.Mesh(fl, capFxFlameMat()); m.material.uniforms.uCol.value.copy(F.glow); m.position.set(o.x, o.y, o.z); m.visible = false; root.add(m); return m;
  });
  WP.engL = new THREE.PointLight(F.glow.getHex(), 0, 1.2, 2); WP.engL.position.set(0, (bb.min.y + bb.max.y) / 2, bb.min.z - 0.05); root.add(WP.engL);
  // 靶機
  const tg = WP.tgt = new THREE.Group();
  tg.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.018), new THREE.MeshStandardMaterial({ color: 0x9aa4b4, metalness: 0.5, roughness: 0.4, emissive: 0x331111 })));
  tg.add(new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0015, 6, 32), new THREE.MeshBasicMaterial({ color: 0xff5a4a })));
  WE.scene.add(tg);
  WP.built = hk + JSON.stringify(weMounts());
  WP.dmg = 0; WP.hits = []; WP.dead = false; WP.boom = WP.rep = WP.warp = null; WP.chunks = null;
  return true;
}
function wpClear() {
  if (WP.root) { WE.scene.remove(WP.root); WP.list.forEach((o) => o.mesh.geometry.dispose()); WP.noz && WP.noz.forEach((m) => m.material.dispose()); if (WP.paint) WP.paint.material.dispose(); }
  if (WP.tgt) WE.scene.remove(WP.tgt);
  for (const b of WP.bolts) WE.scene.remove(b.m); WP.bolts = [];
  for (const m of WP.msls) WE.scene.remove(m.m); WP.msls = [];
  if (WP.chunks) for (const c of WP.chunks) WE.scene.remove(c.m); WP.chunks = null;
  if (WP.fx) { for (const r of WP.fx.rings) WE.scene.remove(r.m); WP.fx.rings = []; WP.fx.add.n = WP.fx.norm.n = 0; }
  WP.root = null; WP.tgt = null; WP.list = []; WP.built = '';
}

// ───── 開始／結束預覽 ─────
function wpInit() {
  if (WP.fx) return;
  const add = wpPool(true, 5000), norm = wpPool(false, 2500);
  WE.scene.add(add.pts, norm.pts);
  const boltG = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true); boltG.rotateX(Math.PI / 2);
  const mslG = new THREE.CylinderGeometry(0.0022, 0.0032, 0.028, 6); mslG.rotateX(Math.PI / 2);
  WP.fx = { add, norm, ringG: new THREE.RingGeometry(0.965, 1, 96), rings: [], boltG, mslG, mslM: new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.6, roughness: 0.4 }) };
  WP.light = new THREE.PointLight(0xffb070, 0, 3, 2); WE.scene.add(WP.light);
}
function wpStart() {
  wpInit();
  if (!WP.on || WP.built !== WE.hk + JSON.stringify(weMounts())) { if (!wpBuild()) return false; }
  if (!WP.on) { WP.on = true; WE.sel = -1; WE.place = -1; WE.ghost.visible = false; WE.box.visible = false; wpUI(); }
  WE.hullMesh.visible = false; WE.wGroup.visible = false;
  return true;
}
function wpStop() {
  if (!WP.on) return;
  WP.on = false; wpClear(); WP.eng = 0; WP.auto = false;
  WE.hullMesh.visible = true; WE.wGroup.visible = true; WE.grid.position.z = 0;
  if (WP.light) WP.light.intensity = 0;
  wpUI();
}
// 改了掛點或換船：預覽重蓋
function wpRefresh() { if (WP.on) { const e = WP.eng, a = WP.auto; wpBuild(); WP.eng = e; WP.auto = a; WE.hullMesh.visible = false; WE.wGroup.visible = false; } }

// ───── 指令 ─────
function wpFire(kind) {   // kind：m 主砲、s 副砲、a 防空、x 飛彈、all 齊射
  if (!wpStart() || WP.dead || WP.boom || WP.warp) return;
  let n = 0;
  WP.list.forEach((o, j) => { if (kind === 'all' || o.gk === kind) { o.want = WP.t + (kind === 'all' ? j * 0.05 : Math.random() * 0.12); o.wantT = WP.t; n++; } });
  if (!n) wpHint(`這艘船沒有${{ m: '主砲', s: '副砲', a: '防空砲', x: '飛彈' }[kind] || '武器'}`);
}
function wpEngine() { if (!wpStart()) return; WP.eng = (WP.eng + 1) % 3; wpUI(); }
function wpWarp() { if (!wpStart() || WP.dead || WP.boom || WP.warp) return; WP.warp = { t0: WP.t, out: false, inn: false }; }
function wpDamage() {
  if (!wpStart() || WP.dead || WP.boom) return;
  const n = 3 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) setTimeout(() => {
    if (!WP.on || WP.dead) return;
    const h = wpHullPt(); WP.root.localToWorld(_wpw.copy(h.p)); wpBlast(_wpw, 0.05 + Math.random() * 0.03, 18, 3);
    if (WP.hits.length < 14) WP.hits.push(h);
    WP.shake = Math.max(WP.shake, 0.6);
  }, k * 140 + Math.random() * 80);
  WP.dmg = Math.min(1, WP.dmg + WP_RULE.dmgStep); WP.rep = null;
}
function wpDestroy() { if (!wpStart() || WP.dead || WP.boom || WP.warp) return; WP.boom = { t0: WP.t, next: 0 }; WP.rep = null; WP.eng = 0; wpUI(); }
function wpRepair() { if (!wpStart() || WP.boom) return; if (!WP.dead && WP.dmg <= 0 && !WP.hits.length) { wpHint('船是完好的：先按「受損」或「破壞」'); return; } WP.rep = { t0: WP.t, dead: WP.dead, d0: WP.dead ? 1 : WP.dmg }; }
function wpReset() { if (!WP.on) return; const e = WP.eng; wpBuild(); WP.eng = e; WE.hullMesh.visible = false; WE.wGroup.visible = false; }
function wpHint(s) { const h = WE.el.querySelector('#wed-hint'); if (h) { h.textContent = s; clearTimeout(WP.hintT); WP.hintT = setTimeout(() => weUI(), 1800); } }
// 船身上隨機一點（偏向上面、側面）：模型座標的位置與法線
function wpHullPt() {
  const g = WP.hull.geometry, P = g.attributes.position, I = g.index, n = (I ? I.count : P.count) / 3, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let tries = 0; tries < 30; tries++) {
    const t = Math.floor(Math.random() * n) * 3, id = (k) => (I ? I.getX(t + k) : t + k);
    a.fromBufferAttribute(P, id(0)); b.fromBufferAttribute(P, id(1)); c.fromBufferAttribute(P, id(2));
    const nn = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)); if (nn.lengthSq() < 1e-12) continue; nn.normalize();
    if (nn.y < -0.2 && tries < 25) continue;
    let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    return { p: a.clone().addScaledVector(b.clone().sub(a), u).addScaledVector(c.clone().sub(a), v), n: nn, k: Math.random() };
  }
  return { p: new THREE.Vector3(0, WP.bb.max.y * 0.6, 0), n: new THREE.Vector3(0, 1, 0), k: 0.5 };
}

// ───── 每幀 ─────
function wpTgtPos(out) {
  const R = WP_RULE.tgt;
  if (!WP.turn) return out.set(...R.fixed);
  const a = WP.t * R.spin; return out.set(Math.sin(a) * R.r, R.y + Math.sin(WP.t * 0.9) * 0.18, Math.cos(a) * R.r * 0.9 + 0.15);
}
// 砲口的世界座標（第 b 根砲管）；同 capfx.js capMuzzleAt
function wpMuzzle(o, b, out) {
  const T = o.T, tip = T.tips[b % T.tips.length]; let x = tip.p[0], y = tip.p[1], z = tip.p[2];
  if (tip.piv && o.pit) { const [px, py, pz] = tip.piv, dy = y - py, dz = z - pz, c = Math.cos(o.pit), sn = Math.sin(o.pit); y = py + dy * c + dz * sn; z = pz - dy * sn + dz * c; }
  if (T.turn && o.yaw) { const [cx, cz] = T.yc, dx = x - cx, dz = z - cz, c = Math.cos(o.yaw), sn = Math.sin(o.yaw); x = cx + dx * c + dz * sn; z = cz - dx * sn + dz * c; }
  o.mesh.updateWorldMatrix(true, false); return out.set(x, y, z).applyMatrix4(o.mesh.matrixWorld);
}
function wpShot(o, b, T) {   // 一發光彈：從砲口飛向靶機
  const S = WP_RULE.shot[o.gk] || WP_RULE.shot.m, p = wpMuzzle(o, b, new THREE.Vector3()), d = T.clone().sub(p);
  d.x += wpRnd(S.spr); d.y += wpRnd(S.spr); d.z += wpRnd(S.spr); const dist = d.length(); d.normalize();
  const m = new THREE.Mesh(WP.fx.boltG, new THREE.MeshBasicMaterial({ color: WP.col.clone().multiplyScalar(o.gk === 'm' ? 1.3 : 1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.scale.set(S.wid, S.wid, S.len); m.quaternion.setFromUnitVectors(_wpv.set(0, 0, 1), d); m.position.copy(p); WE.scene.add(m);
  WP.bolts.push({ m, p, d, spd: S.spd, left: dist, S, hit: true });
  wpEmit(WP.fx.add, p, d.clone().multiplyScalar(0.3), 0.08, S.wid * 9, S.wid * 14, WP_C.hot, 1);   // 砲口閃光
  for (let k = 0; k < 3; k++) wpEmit(WP.fx.add, p, d.clone().multiplyScalar(0.6).add(wpRandDir(_wpv).multiplyScalar(0.25)), 0.15, S.wid * 3, S.wid, WP.col, 0.8, 4);
  if (o.gk === 'm') wpEmit(WP.fx.norm, p, d.clone().multiplyScalar(0.15), 1.2, S.wid * 4, S.wid * 12, WP_C.smoke, 0.35, 1.2, 0.02);
  if (o.gk === 'm') { WP.lightI = Math.max(WP.lightI, 2.5); WP.light.position.copy(p); }
}
function wpMissile(o, T) {
  const p = wpMuzzle(o, 0, new THREE.Vector3()), up = _wpv.set(0, 1, 0).applyQuaternion(o.mesh.getWorldQuaternion(_wpq)).normalize();
  const m = new THREE.Mesh(WP.fx.mslG, WP.fx.mslM); m.position.copy(p); WE.scene.add(m);
  WP.msls.push({ m, p, v: up.clone().multiplyScalar(0.9).add(wpRandDir(new THREE.Vector3()).multiplyScalar(0.25)), age: 0 });
  wpEmit(WP.fx.add, p, null, 0.1, 0.05, 0.08, WP_C.hot, 1);
}
function wpWeapons(dt, T) {
  const RR = RIG_RULE, aimOn = !WP.dead && !WP.warp;
  for (const o of WP.list) {
    const sp = o.sp, turn = sp.mode === 't' || sp.mode === 'f';
    let yD = 0, pD = 0;
    if (turn && aimOn) {   // 靶機在掛點座標的方向（同 main.js rigWrite）
      WP.root.worldToLocal(_wpw.copy(T)); const dx = _wpw.x - o.mesh.position.x, dy = _wpw.y - o.mesh.position.y, dz = _wpw.z - o.mesh.position.z, a = o.ax;
      const lx = dx * a[0] + dy * a[1] + dz * a[2], ly = dx * a[3] + dy * a[4] + dz * a[5], lz = dx * a[6] + dy * a[7] + dz * a[8];
      const lim = sp.mode === 't' ? RR.yawT : RR.yawF, pr = sp.mode === 't' ? RR.pitchT : RR.pitchF;
      yD = Math.max(-lim, Math.min(lim, Math.atan2(lx, lz))); pD = Math.max(pr[0], Math.min(pr[1], Math.atan2(ly, Math.hypot(lx, lz))));
    }
    const my = RR.yawRate * dt, mp = RR.pitchRate * dt;
    o.yaw += Math.max(-my, Math.min(my, yD - o.yaw)); o.pit += Math.max(-mp, Math.min(mp, pD - o.pit));
    // 開火：轉到位（或等超過 1 秒）
    if (o.want && WP.t >= o.want && (!turn || (Math.abs(yD - o.yaw) < 0.04 && Math.abs(pD - o.pit) < 0.04) || WP.t - o.wantT > 1)) {
      o.want = 0;
      if (o.gk === 'x' || sp.mode === 'l') { o.mslT = WP.t + WP_RULE.msl.open; o.fireT = o.mslT; }
      else {
        o.fireT = WP.t; const S = WP_RULE.shot[o.gk] || WP_RULE.shot.m, nb = o.T.tips.length;
        for (let r = 0; r < S.n; r++) for (let b = 0; b < nb; b++) o.q = (o.q || []).concat([{ t: WP.t + r * S.gap + b * 0.07, b }]);
      }
    }
    if (o.q && o.q.length) { o.q = o.q.filter((s) => { if (WP.t < s.t) return true; if (!WP.dead) wpShot(o, s.b, T); return false; }); }
    if (o.mslT && WP.t >= o.mslT - WP_RULE.msl.open) {   // 飛彈：先開艙蓋，再一枚一枚射出
      const k = Math.floor((WP.t - o.mslT) / WP_RULE.msl.gap);
      o.mslN = o.mslN || 0;
      while (WP.t >= o.mslT && o.mslN <= k && o.mslN < WP_RULE.msl.n) { wpMissile(o, T); o.mslN++; }
      if (o.mslN >= WP_RULE.msl.n && WP.t > o.mslT + 1) { o.mslT = 0; o.mslN = 0; }
    }
    const u = o.fireT > -90 ? (WP.t - (o.fireT - WP_RULE.msl.open)) / 0.35 : 0, v = (WP.t - (o.fireT + 0.9)) / 0.6;
    o.open = (o.gk === 'x' || sp.mode === 'l' || sp.g === 3) ? Math.max(0, Math.min(1, u)) * (1 - Math.max(0, Math.min(1, v))) : 0;
    const A = o.rig.array; A[0] = o.yaw; A[1] = o.pit; A[2] = o.fireT > -90 ? Math.min(99, WP.t - o.fireT) : 99; A[3] = o.open; o.rig.needsUpdate = true;
  }
}
function wpBolts(dt, T) {
  WP.bolts = WP.bolts.filter((b) => {
    const st = b.spd * dt; b.left -= st; b.p.addScaledVector(b.d, st); b.m.position.copy(b.p);
    if (b.left > 0) { if (Math.random() < 0.5) wpEmit(WP.fx.add, b.p, null, 0.06, b.S.wid * 4, b.S.wid * 2, WP.col, 0.6); return true; }
    WE.scene.remove(b.m); b.m.material.dispose();
    const s = b.S.hit; wpEmit(WP.fx.add, b.p, null, 0.1, s, s * 1.6, WP_C.white, 1);
    for (let k = 0; k < 6; k++) wpEmit(WP.fx.add, b.p, wpRandDir(_wpv).multiplyScalar(s * 6), 0.25, s * 0.2, s * 0.05, WP_C.spark, 1, 3);
    return false;
  });
  WP.msls = WP.msls.filter((m) => {
    m.age += dt; const R = WP_RULE.msl;
    if (m.age > 0.3) { const want = T.clone().sub(m.p).normalize().multiplyScalar(R.spd), k = Math.min(1, R.turn * dt); m.v.lerp(want, k); }
    else m.v.multiplyScalar(1 + dt * 2);
    m.p.addScaledVector(m.v, dt); m.m.position.copy(m.p); m.m.quaternion.setFromUnitVectors(_wpv.set(0, 0, 1), _wpw.copy(m.v).normalize());
    const back = _wpw.copy(m.v).normalize().multiplyScalar(-0.03).add(m.p);
    wpEmit(WP.fx.add, back, null, 0.07, 0.018, 0.008, WP_C.hot, 1);
    wpEmit(WP.fx.norm, back, null, 0.9, 0.012, 0.04, WP_C.smoke, 0.25, 0, 0.015);
    if (m.p.distanceTo(T) < 0.06 || m.age > 4) { wpBlast(m.p, 0.07, 10, 2); WE.scene.remove(m.m); return false; }
    return true;
  });
}
function wpEngines(dt) {
  const E = WP_RULE.eng[WP.dead ? 0 : WP.eng], warpK = WP.warp ? Math.min(1, (WP.t - WP.warp.t0) / 1.2) : 0, L = WP.bb.max.z - WP.bb.min.z;
  const on = !!E || warpK > 0, base = E || WP_RULE.eng[1];
  WP.noz.forEach((m, k) => {
    m.visible = on && WP.root.visible; if (!m.visible) return;
    const fl = 1 + Math.sin(WP.t * 37 + k * 2.1) * 0.08 + Math.sin(WP.t * 61 + k) * 0.05, len = (base.len + warpK * 0.35) * L * fl, wid = base.wid * L * (1 + warpK * 0.3);
    m.scale.set(wid, wid, len); m.material.uniforms.uI.value = base.I + warpK * 0.6;
    if (warpK) m.material.uniforms.uCol.value.copy(WP.glow).lerp(WP_C.weld, warpK);
    else m.material.uniforms.uCol.value.copy(WP.glow);
  });
  WP.engL.intensity = on ? (base.I + warpK) * 1.6 : 0;
  // 移動感：太空塵往後飛、格線往後捲
  const spd = E && !WP.warp ? E.spd : 0;
  WP.gridZ = ((WP.gridZ || 0) + spd * dt * 0.15) % 0.05; WE.grid.position.z = -WP.gridZ;
  if (spd) for (let k = 0; k < spd * 6 * dt * 60 / 10; k++) wpEmit(WP.fx.add, _wpw.set(wpRnd(1.4), wpRnd(0.7), 2.2), _wpv.set(0, 0, -spd), 4.4 / spd, 0.012, 0.012, WP_C.dust, 0.5);
  if (E && WP.eng === 2) WP.shake = Math.max(WP.shake, 0.12);
}
// 躍傳：充能（尾焰變藍、船頭聚光）→ 拉長衝出 → 消失 → 從後方拉長衝回來、光環
function wpWarpStep() {
  const W = WP.warp; if (!W) return;
  const t = WP.t - W.t0, r = WP.root, L = WP.bb.max.z - WP.bb.min.z, bow = new THREE.Vector3(0, (WP.bb.min.y + WP.bb.max.y) / 2, WP.bb.max.z + 0.1);
  if (t < 1.3) {
    const k = t / 1.3;
    for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2, R = 0.35 + Math.random() * 0.2; const p = r.localToWorld(_wpw.set(bow.x + Math.cos(a) * R, bow.y + Math.sin(a) * R, bow.z + 0.05)); wpEmit(WP.fx.add, p, r.localToWorld(_wpv.copy(bow)).sub(p).multiplyScalar(2.4), 0.4, 0.02, 0.008, WP_C.weld, 0.9); }
    wpEmit(WP.fx.add, r.localToWorld(_wpw.copy(bow)), null, 0.06, 0.1 + k * 0.25, 0.1 + k * 0.3, WP_C.weld, 0.7);
    WP.shake = Math.max(WP.shake, k * 0.25);
  } else if (t < 1.65) {
    const k = (t - 1.3) / 0.35;
    if (!W.out) { W.out = true; wpRing(r.localToWorld(bow.clone()), 0.55, 0.6, WP_C.weld, new THREE.Quaternion()); wpEmit(WP.fx.add, r.localToWorld(bow.clone()), null, 0.25, 0.6, 1.2, WP_C.white, 1); WP.lightI = 6; WP.light.position.copy(bow); }
    r.scale.set(1 - k * 0.7, 1 - k * 0.7, 1 + k * 9); r.position.z = k * k * 6;
    for (let i = 0; i < 6; i++) wpEmit(WP.fx.add, _wpw.set(wpRnd(0.15), bow.y + wpRnd(0.1), r.position.z - Math.random() * L * r.scale.z), _wpv.set(0, 0, -1.5), 0.35, 0.02, 0.005, WP_C.weld, 0.8);
  } else if (t < 2.7) {
    r.visible = false; r.scale.set(1, 1, 1); r.position.set(0, 0, 0);
  } else if (t < 3.05) {
    const k = (t - 2.7) / 0.35;
    r.visible = true; r.scale.set(0.3 + k * 0.7, 0.3 + k * 0.7, 10 - k * 9); r.position.z = -(1 - k) * (1 - k) * 6;
    if (!W.inn) { W.inn = true; wpEmit(WP.fx.add, _wpw.set(0, bow.y, -0.4), null, 0.3, 0.5, 1.4, WP_C.white, 1); }
  } else {
    if (r.scale.z !== 1) { r.scale.set(1, 1, 1); r.position.set(0, 0, 0); wpRing(new THREE.Vector3(0, bow.y, 0), 0.9, 0.8, WP_C.weld, new THREE.Quaternion()); WP.lightI = 4; WP.light.position.set(0, 0.2, 0); WP.shake = 0.5; }
    if (t > 3.6) WP.warp = null;
  }
}
// 受損的地方：冒煙、小火、偶爾火花（越傷越多）
function wpDamageFx(dt) {
  if (WP.dead || !WP.root.visible) return;
  const d = WP.dmg; WP.paint.material.uniforms.uDmg.value = d;
  for (const h of WP.hits) {
    const p = WP.root.localToWorld(_wpw.copy(h.p).addScaledVector(h.n, 0.006)), up = _wpv.copy(h.n).multiplyScalar(0.05).add(new THREE.Vector3(0, 0.05, 0));
    if (Math.random() < dt * (6 + d * 10)) wpEmit(WP.fx.norm, p, up, 1.8 + Math.random(), 0.02, 0.09 + d * 0.06, h.k < 0.5 ? WP_C.dsmoke : WP_C.smoke, 0.45 + d * 0.2, 0.3, 0.03);
    if (h.k > 0.35 && Math.random() < dt * 14 * d) wpEmit(WP.fx.add, p, up.clone().multiplyScalar(1.5), 0.3, 0.025, 0.01, Math.random() < 0.5 ? WP_C.fire : WP_C.hot, 0.9, 1);
    if (Math.random() < dt * 1.2 * d) for (let k = 0; k < 6; k++) wpEmit(WP.fx.add, p, wpRandDir(new THREE.Vector3()).multiplyScalar(0.4).add(h.n), 0.4, 0.008, 0.003, WP_C.spark, 1, 1, -0.6);
  }
}
// 破壞：連環小爆炸 → 大爆炸、船體裂成碎塊飛散，武器也飛出去；碎塊燒一陣子
function wpBoomStep(dt) {
  const B = WP.boom; if (!B) return;
  const t = WP.t - B.t0;
  if (t < 1.7) {
    if (WP.t >= B.next) { const h = wpHullPt(); wpBlast(WP.root.localToWorld(h.p.clone()), 0.06 + t * 0.03, 14, 3); WP.hits.push(h); B.next = WP.t + 0.12 + Math.random() * 0.16; WP.dmg = Math.min(1, WP.dmg + 0.08); }
    WP.shake = Math.max(WP.shake, 0.3 + t * 0.4);
  } else if (!WP.dead) {
    WP.dead = true; WP.hits = [];
    const c = WP.bb.getCenter(new THREE.Vector3()), cw = WP.root.localToWorld(c.clone());
    wpBlast(cw, 0.45, 60, 12); wpRing(cw, 1.3, 0.9, WP_C.fire, new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.3, 0, 0.2)));
    for (let k = 0; k < 6; k++) { const h = wpHullPt(); wpBlast(WP.root.localToWorld(h.p.clone()), 0.18, 10, 4); }
    WP.lightI = 14; WP.shake = 1.2;
    WP.hull.visible = false; WP.paint.visible = false;
    WP.chunks = wpFracture(WE.hk).map((ch) => {
      const m = new THREE.Mesh(ch.geo, WP.hull.material); m.position.copy(ch.ctr); WP.root.add(m);
      const out = ch.ctr.clone().sub(c); out.y += 0.05; out.normalize();
      return { m, home: ch.ctr.clone(), v: out.multiplyScalar(0.25 + Math.random() * 0.25).add(wpRandDir(new THREE.Vector3()).multiplyScalar(0.06)), w: wpRandDir(new THREE.Vector3()).multiplyScalar(0.6 + Math.random() * 1.2), fire: 3 + Math.random() * 2 };
    });
    for (const o of WP.list) { const out = o.mesh.position.clone().sub(c); out.y = Math.abs(out.y) + 0.05; out.normalize(); o.v = out.multiplyScalar(0.4 + Math.random() * 0.5); o.w = wpRandDir(new THREE.Vector3()).multiplyScalar(2 + Math.random() * 4); o.q = []; o.want = 0; o.mslT = 0; }
  }
  if (WP.dead) WP.boom = null;   // 裂開之後：碎塊交給 wpDebrisStep，可以按修復
}
function wpDebrisStep(dt) {
  if (!WP.dead || !WP.chunks || WP.rep) return;
  for (const c of WP.chunks) {
    c.m.position.addScaledVector(c.v, dt); c.v.multiplyScalar(1 - dt * 0.15);
    _wpq.setFromAxisAngle(_wpv.copy(c.w).normalize(), c.w.length() * dt); c.m.quaternion.premultiply(_wpq);
    c.fire -= dt;
    if (c.fire > 0 && Math.random() < dt * 30) { const p = WP.root.localToWorld(c.m.position.clone().add(wpRandDir(_wpv).multiplyScalar(0.05))); wpEmit(WP.fx.add, p, null, 0.35, 0.05, 0.02, Math.random() < 0.5 ? WP_C.fire : WP_C.hot, Math.min(1, c.fire)); wpEmit(WP.fx.norm, p, _wpv.set(0, 0.04, 0), 2.2, 0.04, 0.16, WP_C.dsmoke, 0.4 * Math.min(1, c.fire), 0.2); }
  }
  for (const o of WP.list) if (o.v) {
    o.mesh.position.addScaledVector(o.v, dt); o.v.multiplyScalar(1 - dt * 0.15);
    _wpq.setFromAxisAngle(_wpv.copy(o.w).normalize(), o.w.length() * dt); o.mesh.quaternion.premultiply(_wpq);
  }
}
// 修復：碎塊、武器倒帶回原位 → 焊接火花、燒焦痕跡退掉
function wpRepairStep(dt) {
  const R = WP.rep; if (!R) return;
  let t = WP.t - R.t0;
  if (R.dead) {
    if (!R.from) R.from = { c: WP.chunks.map((c) => ({ p: c.m.position.clone(), q: c.m.quaternion.clone() })), w: WP.list.map((o) => ({ p: o.mesh.position.clone(), q: o.mesh.quaternion.clone() })) };
    const k = Math.min(1, t / 1.6), e = k * k * (3 - 2 * k);
    WP.chunks.forEach((c, i) => { c.m.position.lerpVectors(R.from.c[i].p, c.home, e); c.m.quaternion.slerpQuaternions(R.from.c[i].q, _wpq.identity(), e); });
    WP.list.forEach((o, i) => { o.mesh.position.lerpVectors(R.from.w[i].p, o.home.p, e); o.mesh.quaternion.slerpQuaternions(R.from.w[i].q, o.home.q, e); });
    if (Math.random() < 0.6) { const c = WP.chunks[Math.floor(Math.random() * WP.chunks.length)]; wpEmit(WP.fx.add, WP.root.localToWorld(c.m.position.clone()), null, 0.25, 0.04, 0.01, WP_C.weld, 0.8); }
    if (k < 1) return;
    for (const c of WP.chunks) WP.root.remove(c.m); WP.chunks = null; WP.dead = false; R.dead = false; R.t0 = WP.t; t = 0;
    WP.hull.visible = true; WP.paint.visible = true; WP.list.forEach((o) => { o.v = o.w = null; o.mesh.position.copy(o.home.p); o.mesh.quaternion.copy(o.home.q); o.yaw = o.pit = 0; });
    WP.lightI = 3; WP.light.position.set(0, 0.2, 0);
  }
  const k = Math.min(1, t / 2.4);
  WP.dmg = Math.max(0, R.d0 * (1 - k));
  if (k < 1) for (let i = 0; i < 3; i++) {   // 焊接火花：受損的地方優先
    const h = WP.hits.length && Math.random() < 0.7 ? WP.hits[Math.floor(Math.random() * WP.hits.length)] : wpHullPt(), p = WP.root.localToWorld(h.p.clone());
    wpEmit(WP.fx.add, p, null, 0.06, 0.03, 0.05, WP_C.white, 1);
    for (let s = 0; s < 3; s++) wpEmit(WP.fx.add, p, wpRandDir(new THREE.Vector3()).multiplyScalar(0.25).addScaledVector(h.n, 0.3), 0.5, 0.008, 0.003, Math.random() < 0.5 ? WP_C.weld : WP_C.spark, 1, 1.5, -0.8);
  }
  else { WP.hits = []; WP.dmg = 0; WP.rep = null; }
}
// 武器配置畫面每幀呼叫（weapons.js weLoop）
function wpFrame() {
  const now = performance.now() / 1000, dt = Math.min(0.05, Math.max(0, now - (WP.last || now))); WP.last = now;
  if (!WP.on || !WP.root) return;
  WP.t += dt;
  const T = wpTgtPos(new THREE.Vector3()); WP.tgt.position.copy(T); WP.tgt.rotation.y += dt * 2; WP.tgt.visible = !WP.dead;
  if (WP.auto && !WP.dead && !WP.boom && !WP.warp && WP.t > WP.autoT) { WP.autoT = WP.t + 1.1; ['m', 's', 'a'].forEach((k) => WP.list.forEach((o) => { if (o.gk === k && !o.want) { o.want = WP.t + Math.random() * 0.4; o.wantT = WP.t; } })); if (Math.random() < 0.3) WP.list.forEach((o) => { if (o.gk === 'x' && !o.mslT) { o.want = WP.t; o.wantT = WP.t; } }); }
  wpWarpStep(); wpBoomStep(dt); wpDebrisStep(dt); wpRepairStep(dt);
  wpWeapons(dt, T); wpBolts(dt, T); wpEngines(dt); wpDamageFx(dt);
  // 船身晃動（被打、全速、躍傳）
  WP.shake = Math.max(0, WP.shake - dt * 1.6);
  if (!WP.warp || WP.root.scale.z === 1) { const s = WP.shake * 0.006; WP.root.position.set(wpRnd(s), wpRnd(s), WP.warp ? WP.root.position.z : wpRnd(s)); WP.root.rotation.z = Math.sin(WP.t * 0.7) * 0.01 * (WP.eng ? 1 : 0); }
  for (const r of WP.fx.rings) { const u = (WP.t - r.t0) / r.life; r.m.scale.setScalar(0.05 + r.r1 * Math.sqrt(Math.max(0, u))); r.m.material.opacity = 0.7 * Math.pow(Math.max(0, 1 - u), 1.5); }
  WP.fx.rings = WP.fx.rings.filter((r) => { if (WP.t - r.t0 < r.life) return true; WE.scene.remove(r.m); r.m.material.dispose(); return false; });
  WP.lightI *= Math.exp(-dt * 6); WP.light.intensity = WP.lightI;
  const k = WE.r.domElement.height * WE.cam.projectionMatrix.elements[5] * 0.5; WP.fx.add.pts.material.uniforms.uK.value = k; WP.fx.norm.pts.material.uniforms.uK.value = k;
  wpPoolStep(WP.fx.add, dt); wpPoolStep(WP.fx.norm, dt);
}

// ───── 介面（武器配置 3D 畫面右上角）─────
function wpBar() {
  return `<div class="wed-fx" id="wed-fx"><h4>表現預覽 <small>開火、推進、躍傳、受損時的樣子</small></h4>
    <div class="wed-fxr"><span>武器</span><button class="g-btn sm" data-fx="m">主砲</button><button class="g-btn sm" data-fx="s">副砲</button><button class="g-btn sm" data-fx="a">防空</button><button class="g-btn sm" data-fx="x">飛彈</button><button class="g-btn sm" data-fx="all">齊射</button></div>
    <div class="wed-fxr"><span></span><button class="g-btn sm" data-fx="auto" title="每秒自動開火">連續開火</button><button class="g-btn sm" data-fx="turn" title="靶機繞著船飛，砲塔跟著轉">靶機繞飛</button></div>
    <div class="wed-fxr"><span>航行</span><button class="g-btn sm" data-fx="eng" title="關 → 巡航 → 全速">推進</button><button class="g-btn sm" data-fx="warp">躍傳</button></div>
    <div class="wed-fxr"><span>損傷</span><button class="g-btn sm" data-fx="dmg" title="每按一次再傷一點">受損</button><button class="g-btn sm" data-fx="kill">破壞</button><button class="g-btn sm" data-fx="rep">修復</button></div>
    <div class="wed-fxr"><span></span><button class="g-btn sm" data-fx="reset">重置</button><button class="g-btn sm" data-fx="end">結束預覽</button></div></div>`;
}
function wpBind(el) {
  el.querySelector('#wed-fx').onclick = (e) => {
    const b = e.target.closest('[data-fx]'); if (!b) return; const k = b.dataset.fx;
    if ('m s a x all'.split(' ').includes(k)) wpFire(k);
    else if (k === 'auto') { if (wpStart()) { WP.auto = !WP.auto; WP.autoT = 0; } }
    else if (k === 'turn') { if (wpStart()) WP.turn = !WP.turn; }
    else if (k === 'eng') wpEngine();
    else if (k === 'warp') wpWarp();
    else if (k === 'dmg') wpDamage();
    else if (k === 'kill') wpDestroy();
    else if (k === 'rep') wpRepair();
    else if (k === 'reset') wpReset();
    else if (k === 'end') wpStop();
    wpUI();
  };
  wpUI();
}
function wpUI() {
  const el = WE.el && WE.el.querySelector('#wed-fx'); if (!el) return;
  const set = (k, on, txt) => { const b = el.querySelector(`[data-fx="${k}"]`); if (!b) return; b.classList.toggle('pri', !!on); if (txt) b.textContent = txt; };
  set('auto', WP.on && WP.auto); set('turn', WP.on && WP.turn); set('eng', WP.on && WP.eng, ['推進', '推進：巡航', '推進：全速'][WP.on ? WP.eng : 0]);
  el.querySelector('[data-fx="end"]').hidden = !WP.on; el.querySelector('[data-fx="reset"]').hidden = !WP.on;
  el.classList.toggle('on', WP.on);
}
Object.assign(window.__cap || (window.__cap = {}), { autoRig: () => MODEL_LOAD.auto, WE, openWeaponEditor, WP, wpFire, wpEngine, wpWarp, wpDamage, wpDestroy, wpRepair, wpStop, wpStart });
