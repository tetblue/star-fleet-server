// ───── 艦長：戰艦庫（小隊的特製戰艦各停在一座整備機庫裡；畫面背景是全螢幕 3D，介面疊在上面）─────
// 參考圖：白色／深藍的開口式機庫（屋頂艙蓋掀起），船停在托架上、兩側機械臂；機庫右邊管制塔，左邊物料艙與儲槽，前方停機坪放砲塔、推進器艙、機械爪。
// 五座機庫沿 x 排開（1～5 號艦）；整備庫元件用 hangar.js 的 hgProp（models/機庫/）。
// 點機庫＝鏡頭移過去；換艦種＝機庫裡的船換掉（存檔與「隨機任務」的小隊編成同一份）
const CB = {
  wrap: null, cv: null, r: null, scene: null, cam: null, raf: 0, W: 0, H: 0, tPrev: 0, live: false, glowTex: null,
  ships: [null, null, null, null, null], keys: ['', '', '', '', ''], fac: -1, sel: 0, mark: null, tx: 0,
  orb: { yaw: -0.55, pitch: 0.5, base: -0.55, user: -99, fit: 1, dist: 100 }, drag: null,
  // 單艦視角：鏡頭進機庫、貼近地面往上看一艘船（yaw 繞船的方向、h 眼睛離地、d 離船殼的距離）
  focus: false, fo: { base: 0.8, h: 0.75, d: 3.5, user: -99 }, cp: null, cl: null, ox: 0, oy: 0,
};
const CB_GAP = 76;                                          // 機庫間距
const CB_LEN = { assault: 30, gunship: 40, support: 37, ew: 36, stealth: 27 };   // 船長（世界單位）
const CB_CRADLE = 1.4;                                      // 托架高度（船的最低點離地）
const CB_HALL = { hw: 19, z0: -30, z1: 16, h: 22 };         // 機庫內部：半寬、後牆、前緣、高度
const CB_SHIP_Z = -7;                                       // 船停的位置（機庫中間偏後）
const cbX = (k) => (k - 2) * CB_GAP;
const cbNow = () => performance.now() / 1000;

function cbInit() {
  if (CB.wrap) return;
  const w = CB.wrap = document.createElement('div'); w.className = 'dock-bg cb-bg'; w.innerHTML = '<canvas></canvas>'; CB.cv = w.querySelector('canvas');
  document.body.appendChild(w);
  const r = CB.r = new THREE.WebGLRenderer({ canvas: CB.cv, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
  const S = CB.scene = new THREE.Scene(); S.background = new THREE.Color(0x8e9db0); S.fog = new THREE.Fog(0x8e9db0, 180, 480);   // 白天的基地（參考圖是明亮的）
  CB.cam = new THREE.PerspectiveCamera(36, 2, 0.5, 900);
  CB.glowTex = typeof dockGlowTex === 'function' ? dockGlowTex() : null;
  S.add(new THREE.HemisphereLight(0xdfe8f6, 0x4a4640, 1.5), new THREE.AmbientLight(0x505868, 0.8));
  const sun = new THREE.DirectionalLight(0xfff4e4, 2.6); sun.position.set(60, 120, 90); S.add(sun);
  hgMats(); cbBuildSite(); for (let k = 0; k < 5; k++) cbBuildHangar(k); cbBuildProps();
  // 選中的機庫：停機坪外圍一圈橘色框
  const fr = CB.mark = new THREE.Group(), gm = new THREE.MeshBasicMaterial({ color: 0xf2b35a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [w2, d2, x, z] of [[52, 0.6, 0, -34], [52, 0.6, 0, 36], [0.6, 70, -26, 1], [0.6, 70, 26, 1]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.1, d2), gm); b.position.set(x, 0.7, z); fr.add(b); }
  S.add(fr);
  CB.cv.addEventListener('pointerdown', (e) => { CB.drag = { x: e.clientX, y: e.clientY }; CB.cv.setPointerCapture(e.pointerId); });
  CB.cv.addEventListener('pointermove', (e) => {
    const d = CB.drag; if (!d) return;
    if (CB.focus) { const F = CB.fo; F.base -= (e.clientX - d.x) * 0.005; F.h = Math.max(0.5, Math.min(CB_HALL.h - 3, F.h - (e.clientY - d.y) * 0.03)); F.user = cbNow(); }
    else { const O = CB.orb; O.base -= (e.clientX - d.x) * 0.006; O.yaw = O.base; O.pitch = Math.max(0.05, Math.min(1.2, O.pitch + (e.clientY - d.y) * 0.005)); O.user = cbNow(); }
    d.x = e.clientX; d.y = e.clientY;
  });
  CB.cv.addEventListener('wheel', (e) => { e.preventDefault(); if (CB.focus) { CB.fo.d = Math.max(2.5, Math.min(30, CB.fo.d * (e.deltaY > 0 ? 1.12 : 0.89))); CB.fo.user = cbNow(); return; } CB.orb.dist = Math.max(36, Math.min(220, CB.orb.dist * (e.deltaY > 0 ? 1.1 : 0.9))); CB.orb.user = cbNow(); }, { passive: false });
  const up = () => { CB.drag = null; }; CB.cv.addEventListener('pointerup', up); CB.cv.addEventListener('pointercancel', up);
  new ResizeObserver(() => cbSize()).observe(CB.cv);
}
function cbSize() {
  const b = CB.cv.getBoundingClientRect(); if (!b.width || !b.height) return;
  CB.W = b.width; CB.H = b.height; CB.r.setSize(b.width, b.height, false); CB.cam.aspect = b.width / b.height; CB.cam.updateProjectionMatrix();
}

// ── 基地地面：大片水泥停機坪 ──
function cbBuildSite() {
  const S = CB.scene;
  const tex = hgTex(256, 256, (g, w) => {
    g.fillStyle = '#6a717c'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(40,46,56,.45)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, w - 2);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * w, 4 + Math.random() * 30, 2 + Math.random() * 6); }
  }, [60, 30]);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(900, 450), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.15, roughness: 0.85 }));
  g.rotation.x = -Math.PI / 2; g.position.z = 40; S.add(g);
}
// ── 一座機庫 ──
function cbBuildHangar(k) {
  const S = CB.scene, M = HG.mats, H = CB_HALL, G = new THREE.Group(); G.position.x = cbX(k); S.add(G);
  const white = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.25, roughness: 0.55 }), navy = new THREE.MeshStandardMaterial({ color: 0x24375e, metalness: 0.3, roughness: 0.5 });
  const frameM = new THREE.MeshStandardMaterial({ color: 0x5d6675, metalness: 0.45, roughness: 0.45 }), floorM = new THREE.MeshStandardMaterial({ color: 0x4a515c, metalness: 0.3, roughness: 0.7 });
  const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); G.add(o); return o; };
  const plane = (w, h, x, y, z, ry, mat) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(x, y, z); o.rotation.y = ry; G.add(o); return o; };
  const L = H.z1 - H.z0, zc = (H.z0 + H.z1) / 2, T = 3, Y0 = 0.6;
  // 底座：比機庫大一圈的平台，前方是停機坪（黃框、警示條、V 標誌、編號）
  const pad = hgTex(512, 704, (g, w, h) => {
    g.fillStyle = '#4b525d'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2c323b'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.strokeStyle = 'rgba(30,34,42,.5)'; g.lineWidth = 2; for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = '#d6a21e'; g.lineWidth = 6; g.strokeRect(70, 470, w - 140, 190);
    g.fillStyle = '#d6a21e'; for (let i = 0; i < 6; i++) { g.save(); g.translate(30 + i * 22, 640); g.rotate(-0.6); g.fillRect(0, 0, 10, 40); g.restore(); }
    hgChevron(g, w / 2, 545, 40, '#e8ecf2');
    g.fillStyle = 'rgba(232,236,242,.85)'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText(`0${k + 1}`, w - 70, 455);
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(50, Y0, 70), [floorM, floorM, new THREE.MeshStandardMaterial({ map: pad, metalness: 0.25, roughness: 0.7 }), floorM, floorM, floorM]); base.position.set(0, Y0 / 2, 1); G.add(base);
  // 機庫內地板：深一點的鋼板＋托架區的白框
  const inner = hgTex(256, 512, (g, w, h) => { g.fillStyle = '#3c434d'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(232,236,242,.7)'; g.lineWidth = 4; g.strokeRect(40, 70, w - 80, h - 120); g.strokeStyle = '#d6a21e'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, h - 24); g.lineTo(w - 20, h - 24); g.stroke(); });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(H.hw * 2, L), new THREE.MeshStandardMaterial({ map: inner, metalness: 0.3, roughness: 0.6 })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, Y0 + 0.02, zc); G.add(fl);
  // 牆：兩側與後牆（實心白牆，外側與內側貼牆板）
  for (const sd of [-1, 1]) {
    box(T, H.h, L, sd * (H.hw + T / 2), H.h / 2 + Y0, zc, white);
    plane(L, H.h, sd * (H.hw + T + 0.03), H.h / 2 + Y0, zc, sd * Math.PI / 2, hgWallMat(L, H.h));
    plane(L, H.h, sd * (H.hw - 0.03), H.h / 2 + Y0, zc, -sd * Math.PI / 2, hgWallMat(L, H.h));
    for (let z = H.z0 + 6; z < H.z1; z += 8) box(1.2, H.h, 1.2, sd * (H.hw - 0.7), H.h / 2 + Y0, z, frameM);   // 內側骨架
    box(T + 0.4, 2.2, L, sd * (H.hw + T / 2), H.h * 0.3, zc, navy);                                           // 外側深藍腰帶
  }
  box(H.hw * 2 + T * 2, H.h, T, 0, H.h / 2 + Y0, H.z0 - T / 2, white);
  plane(H.hw * 2, H.h, 0, H.h / 2 + Y0, H.z0 + 0.03, 0, hgWallMat(H.hw * 2, H.h));
  for (let y = 5; y < H.h; y += 5) box(H.hw * 2, 0.8, 0.8, 0, y, H.z0 + 0.6, frameM);                        // 後牆的管線
  // 正面門框：厚的框（白＋深藍）
  for (const sd of [-1, 1]) { box(4, H.h + 3, 4, sd * (H.hw + 1.5), (H.h + 3) / 2 + Y0, H.z1, white); box(1.2, H.h + 3, 4.2, sd * (H.hw + 3.2), (H.h + 3) / 2 + Y0, H.z1, navy); }
  box(H.hw * 2 + 8, 4, 4.2, 0, H.h + 2.6, H.z1, white); box(H.hw * 2 + 8, 1.2, 4.4, 0, H.h + 0.9, H.z1, navy);
  // 屋頂：後段與前段固定，中間的大艙蓋往上掀開（鉸鏈在後）
  box(H.hw * 2 + T * 2, 2, 10, 0, H.h + 1.6, H.z0 + 5, white); box(H.hw * 2 + T * 2, 2, 6, 0, H.h + 1.6, H.z1 - 3, white);
  const hatch = hgTex(512, 512, (g, w) => { g.fillStyle = '#dfe4ea'; g.fillRect(0, 0, w, w); g.fillStyle = '#24375e'; g.fillRect(w * 0.36, 0, w * 0.28, w); hgChevron(g, w / 2, w * 0.42, 50, '#e8ecf2'); g.strokeStyle = 'rgba(60,70,90,.4)'; g.lineWidth = 4; for (let y = 128; y < w; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
  const hg = new THREE.Group(); hg.position.set(0, H.h + 2.6, H.z0 + 10); hg.rotation.x = -0.42; G.add(hg);
  const hm = new THREE.Mesh(new THREE.BoxGeometry(H.hw * 2 + 6, 1.6, L - 15), [white, white, new THREE.MeshStandardMaterial({ map: hatch, metalness: 0.25, roughness: 0.55 }), white, white, white]); hm.position.z = (L - 15) / 2; hg.add(hm);
  for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 10, 10), frameM); p.position.set(sd * (H.hw - 1), -3, 9); p.rotation.x = 0.55; hg.add(p); }   // 液壓桿
  // 機庫內的燈：屋頂下的燈條＋後方的藍光
  for (const z of [H.z0 + 6, zc + 4]) box(H.hw * 1.6, 0.4, 1, 0, H.h - 0.5, z, M.glow(0xdfe8ff, 1.4));
  const li = new THREE.PointLight(0xe8f0ff, 900, 70, 1.6); li.position.set(0, H.h - 3, zc); G.add(li);
  const blue = new THREE.PointLight(0x5aa8ff, 500, 40, 1.6); blue.position.set(0, 8, H.z0 + 6); G.add(blue);
  if (CB.glowTex) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: CB.glowTex, color: 0x5aa8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(16); s.position.set(0, 8, H.z0 + 4); G.add(s); }
  for (const sd of [-1, 1]) hgLamp(G, sd * (H.hw + 4), H.h + 5, H.z1 + 2, 0xff5a3a, 30, 20);   // 門口兩側的警示燈
  // 地勤人員：船旁邊站幾個人當比例尺（單艦視角時才看得出船有多大）
  for (const [x, z, ry, c] of [[2.6, -3, 2.6, 0], [3.4, -3.8, -2.2, 1], [-5, -14, 1.2, 0], [4, -19, -0.4, 2], [-2, 3, 0.3, 1], [-13, 7, 1.6, 2], [9, -24, 3.0, 0], [-9, 26, -2.4, 1]]) cbCrew(G, x, Y0, z, ry, c);
}
// 一個人（約 CB_MAN 高）：連身工作服＋安全帽
const CB_MAN = 0.9;
function cbCrew(G, x, y, z, ry, c) {
  const M = CB.crewM || (CB.crewM = { suit: [0xe8833a, 0xdfe4ea, 0x3d5a8c].map((col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })), hat: new THREE.MeshStandardMaterial({ color: 0xf2c12e, roughness: 0.5 }), skin: new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 }) });
  const h = CB_MAN, p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = ry; G.add(p);
  const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); p.add(o); };
  for (const sd of [-1, 1]) add(new THREE.BoxGeometry(h * 0.11, h * 0.46, h * 0.12), M.suit[c], sd * h * 0.07, h * 0.23, 0);   // 腿
  add(new THREE.BoxGeometry(h * 0.28, h * 0.34, h * 0.16), M.suit[c], 0, h * 0.62, 0);                                      // 身體
  for (const sd of [-1, 1]) add(new THREE.BoxGeometry(h * 0.08, h * 0.32, h * 0.09), M.suit[c], sd * h * 0.19, h * 0.6, 0);  // 手
  add(new THREE.SphereGeometry(h * 0.075, 10, 8), M.skin, 0, h * 0.86, 0);
  add(new THREE.SphereGeometry(h * 0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.hat, 0, h * 0.885, 0);
}
// ── 整備庫元件：機庫內（機械臂、氣瓶、工作台）、機庫外（管制塔、物料艙、儲槽）、停機坪（砲塔、推進器艙、機械爪）──
// [名稱, 相對機庫中心的 x, z, 轉向, 縮放, 離地]
const CB_PROP_SET = [
  ['06_機械臂A', -12.5, -16, Math.PI / 2, 95, 0.6], ['07_機械臂B', 12.5, -16, -Math.PI / 2, 95, 0.6], ['07_機械臂B', -12.5, 2, Math.PI / 2, 95, 0.6], ['06_機械臂A', 12.5, 2, -Math.PI / 2, 95, 0.6],
  ['15_氣瓶組', -16, 11, 0, 70, 0.6], ['11_加工站', -14.5, -25, 0, 60, 0.6],
  ['01_管制塔', 33, -14, -Math.PI / 2, 95], ['19_雙聯儲槽', 31, 9, 0, 85], ['18_物料艙', -32, -2, Math.PI / 2, 70], ['21_圓頂儲槽', -31, -20, 0, 85],
  ['16_雙管砲塔', 6, 26, 0.5, 65, 0.6], ['12_雙推進器艙', 15, 27, -0.4, 65, 0.6], ['20_小型機械爪', -6, 29, 0.3, 55, 0.6], ['08_軌道機械臂', -16, 25, 0.6, 55, 0.6], ['06_機械臂A', 21, 20, -1.2, 55, 0.6],
];
function cbBuildProps() {
  const S = CB.scene;
  for (let k = 0; k < 5; k++) for (const [name, x, z, ry, s, y = 0] of CB_PROP_SET) hgPlaceProps(S, [[name, cbX(k) + x, z, ry, 1, y]], s);
}

// ── 船：跟編成畫面同一套船體＋武器掛點；船頭朝鏡頭（+z）──
function cbMakeShip(hull, fac) {
  const H = CAP_HULLS[hull]; if (!H) return null;
  const fk = FAC_KEY[fac] || 'e', key = fk + H.look, M = getModel(key) || getModel('e' + H.look); if (!M) return null;
  const L = CB_LEN[hull] || 30, g = new THREE.Group(), body = new THREE.Group();
  body.add(new THREE.Mesh(M.lods[0], M.mat));
  for (const m of mountsOf(key)) { const W = getModel(fk + 'w' + m.w); if (!W) continue; const o = new THREE.Mesh(W.lods[Math.min(1, W.lods.length - 1)], W.mat); setMountObj(o, m); body.add(o); }
  const geo = M.lods[0]; geo.computeBoundingBox(); const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, y0 = 0.3 + CB_CRADLE;
  body.scale.setScalar(L); g.add(body);
  body.position.set(-cx * L, y0 - bb.min.y * L, -cz * L);   // 船體置中，最低點離船塢 CB_CRADLE
  // 托架：前、中、後三座，各自往上頂到正上方的船底（船底不平，龍骨以外的地方比較高）
  const pos = geo.attributes.position, hw = (bb.max.x - bb.min.x) / 2;
  for (const f of [-0.28, 0, 0.28]) {
    const zc = cz + f * (bb.max.z - bb.min.z); let lo = Infinity;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) - cx, z = pos.getZ(i); if (Math.abs(z - zc) < 0.04 && Math.abs(x) < hw * 0.25) lo = Math.min(lo, pos.getY(i)); }
    if (!isFinite(lo)) continue;
    const top = y0 + (lo - bb.min.y) * L, h = top - 0.3, w = Math.min(7, hw * L * 0.7);
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.2), HG.mats.metal); c.position.set(0, 0.3 + h / 2, (zc - cz) * L); g.add(c);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.5, 3), HG.mats.dark); pad.position.set(0, 0.55, (zc - cz) * L); g.add(pad);
  }
  g.userData = { hl: (bb.max.z - bb.min.z) / 2 * L, hw: hw * L, bot: y0, top: y0 + (bb.max.y - bb.min.y) * L };   // 單艦視角用：半長、半寬、船底、船頂
  return g;
}
function cbSync(p) {
  const fac = p.fac === 1 ? 1 : 0;
  for (let k = 0; k < 5; k++) {
    const key = p.slots[k] || '';
    if (CB.keys[k] === key && CB.fac === fac && (CB.ships[k] || !key)) continue;
    if (CB.ships[k]) { CB.scene.remove(CB.ships[k]); CB.ships[k] = null; }
    CB.keys[k] = key;
    if (key) { const g = cbMakeShip(key, fac); if (g) { g.position.set(cbX(k), 0.6, CB_SHIP_Z); CB.scene.add(g); CB.ships[k] = g; } }
  }
  CB.fac = fac;
}
const _cbP = new THREE.Vector3(), _cbL = new THREE.Vector3();
function cbStep() {
  const now = cbNow(), dt = Math.min(0.1, now - (CB.tPrev || now)); CB.tPrev = now;
  if (!CB.W) cbSize();
  const tx = cbX(CB.sel); CB.tx += (tx - CB.tx) * (1 - Math.exp(-dt * 3.5));
  CB.mark.visible = !CB.focus;
  CB.mark.position.x = tx; CB.mark.children.forEach((b) => (b.material.opacity = 0.6 + 0.3 * Math.sin(now * 3)));
  const C = CB.cam, P = _cbP, Lk = _cbL; let fov = 36, ox = 0, oy = 0;
  if (CB.focus) {
    // 單艦視角：站在機庫地上（人的高度）往上看船；鏡頭不出機庫（兩側牆、後牆、屋頂），前面可以退到停機坪
    const F = CB.fo, H = CB_HALL, sh = CB.ships[CB.sel], u = sh ? sh.userData : { hl: 15, hw: 6, bot: 2, top: 12 };
    const idle = now - F.user > 4, yaw = idle ? F.base + 0.5 * Math.sin((now - F.user - 4) * 0.05) : F.base;
    const sn = Math.sin(yaw), cs = Math.cos(yaw), r = Math.hypot(u.hw * sn, u.hl * cs) + F.d;
    P.set(Math.max(tx - H.hw + 1.4, Math.min(tx + H.hw - 1.4, CB.tx + sn * r)), 0.6 + F.h, Math.max(H.z0 + 2, Math.min(H.z1 + 34, CB_SHIP_Z + cs * r)));
    const mid = (u.bot + u.top) / 2;
    Lk.set(tx + sn * u.hw * 0.25, mid + (u.top - mid) * 0.4 + F.h * 0.25, CB_SHIP_Z + cs * u.hl * 0.25);
    fov = 70;
  } else {
    const O = CB.orb, idle = now - O.user > 5;
    O.yaw = idle ? O.base + 0.22 * Math.sin((now - O.user) * 0.07) : O.base;
    const V = dockVisible(CB.W, CB.H);
    O.fit += (V.fit - O.fit) * (1 - Math.exp(-dt * 3));
    const cp = Math.cos(O.pitch), dist = O.dist * O.fit, cy = 7, cz = -2;
    P.set(CB.tx + Math.sin(O.yaw) * cp * dist, cy + Math.sin(O.pitch) * dist, cz + Math.cos(O.yaw) * cp * dist);
    Lk.set(CB.tx, cy, cz); ox = V.ox; oy = V.oy;
  }
  // 兩種視角之間用飛的過去；拖曳時跟手
  const k = 1 - Math.exp(-dt * (CB.drag ? 14 : 3.2));
  if (!CB.cp) { CB.cp = P.clone(); CB.cl = Lk.clone(); CB.ox = ox; CB.oy = oy; C.fov = fov; }
  else { CB.cp.lerp(P, k); CB.cl.lerp(Lk, k); CB.ox += (ox - CB.ox) * k; CB.oy += (oy - CB.oy) * k; C.fov += (fov - C.fov) * k; }
  const near = CB.cp.y < 30 ? 0.12 : 0.5;
  if (C.near !== near) C.near = near;
  C.position.copy(CB.cp); C.lookAt(CB.cl);
  C.setViewOffset(CB.W, CB.H, CB.ox, CB.oy, CB.W, CB.H); C.updateProjectionMatrix(); C.updateMatrixWorld();
  CB.r.render(CB.scene, C);
}
function cbFrame() {
  CB.raf = 0;
  if (!document.querySelector('.cb-screen')) { CB.live = false; if (CB.wrap) CB.wrap.hidden = true; document.body.classList.remove('cb-on'); return; }   // 離開戰艦庫就停
  CB.raf = requestAnimationFrame(cbFrame);
  cbStep();
}
function cbAttach(p, sel) {
  cbInit();
  document.body.classList.add('cb-on'); CB.wrap.hidden = false;
  if (!CB.live || (CB.focus && sel !== CB.sel)) { CB.tx = cbX(sel); CB.cp = null; }   // 單艦視角換船＝直接切過去（不穿牆）
  CB.sel = sel; cbSync(p);
  if (!CB.live) { CB.live = true; CB.tPrev = 0; requestAnimationFrame(() => cbSize()); }
  if (!CB.raf) CB.raf = requestAnimationFrame(cbFrame);
}

// ── 畫面 ──
function showCapBay() {
  const p = capLoad();
  setPhase('briefing');
  const sel = GAME.capSel = Math.max(0, Math.min(4, GAME.capSel || 0));
  const only = p.slots.filter(Boolean).length === 1 && p.slots[sel];
  const slot = (k) => { const h = CAP_HULLS[p.slots[k]];
    return `<button class="hg-slot ${k === sel ? 'on' : ''}" data-cs="${k}"><span>${k + 1} 號船塢<small>${k === p.slots.findIndex(Boolean) ? '旗艦' : ''}</small></span><b>${h ? h.name : '（空）'}<small>${h ? ` ${h.en}` : ''}</small></b></button>`; };
  const picks = ['', ...CAP_HULL_ORDER].map((key) => { const h = CAP_HULLS[key], on = (p.slots[sel] || '') === key, dis = !key && only;
    return `<button class="hg-chip ${on ? 'on' : ''}" data-ch="${key}" ${dis ? 'disabled' : ''}><b>${h ? h.name : '不帶'}</b><small>${h ? h.en : '船塢空著'}</small></button>`; }).join('');
  const H = CAP_HULLS[p.slots[sel]];
  const hd = H ? `<b>${H.name}</b>　${H.desc}<br><span class="g-dim">耐久 ${H.hp}＋護盾 ${H.sh}・速度 ${H.cruise}～${H.max}・轉向 ${H.turn}°／秒<br>主砲：${H.main.name}（${H.main.dmg} 傷害、${H.main.cd} 秒、射程 ${H.main.range}）・砲塔 ${H.tur.n} 座・點防禦 ${H.pd.n} 座${H.msl ? `・飛彈 ${H.msl.n} 枚` : ''}${H.ftr ? `・護航機 ${H.ftr} 架` : ''}</span>` : '<span class="g-dim">這個船塢空著，出擊時不帶船。</span>';
  overlay(`<div class="ld-screen cb-screen ${CB.focus ? 'cb-focus' : ''}">
    <div class="ld-top">
      <button class="g-btn" id="cb-back">← 艦長</button>
      <div class="ld-title"><h2>戰艦庫</h2><span class="crumb">艦長・小隊的特製戰艦（1～5 艘）</span></div>
      <div class="hg-rec"><span class="g-dim">陣營 <b>${FACTION_NAME[p.fac]}</b></span><span class="g-dim">戰功 <b>${fmtN(p.merit)}</b></span><span class="g-dim">任務成功 <b>${p.wins}</b>／${p.sorties}</span></div>
      <span class="g-sp"></span>
      <button class="g-btn" id="cb-view">${CB.focus ? '回到總覽' : '單艦視角'}</button>
      <button class="g-btn pri" id="cb-go">前往出擊 →</button>
    </div>
    <div class="cb-fbar">
      <button class="g-btn" id="cb-prev" aria-label="上一艘">‹</button>
      <div class="cb-fname"><small>${sel + 1} 號船塢</small><b>${H ? H.name : '（空）'}</b><span>${H ? H.en : ''}</span></div>
      <button class="g-btn" id="cb-next" aria-label="下一艘">›</button>
    </div>
    <div class="ld-side g-card hg-side">
      <div class="hg-h">船塢<small>點一個船塢，再選要停的艦種</small></div>
      <div class="hg-slots">${[0, 1, 2, 3, 4].map(slot).join('')}</div>
      <div class="hg-pick">${picks}</div>
      <div class="hg-desc">${hd}</div>
    </div>
    <div class="ld-cap" id="cb-cap">${CB.focus ? '左右拖曳繞著船走・上下拖曳改變高度・滾輪靠近／退後' : '拖曳背景轉動視角・滾輪拉近拉遠'}</div>
  </div>`);
  gEl('cb-back').onclick = () => { GAME.spMode = 'captain'; showSingle(); };
  gEl('cb-go').onclick = () => showCaptain();
  gEl('cb-view').onclick = () => { CB.focus = !CB.focus; if (CB.focus) { CB.fo.user = -99; CB.fo.base = 0.8; CB.fo.h = 0.75; CB.fo.d = 3.5; } else CB.orb.user = -99; showCapBay(); };
  // 單艦視角換船：只在有船的船塢之間切換
  const step = (dir) => { const ks = [0, 1, 2, 3, 4].filter((k) => p.slots[k]); if (!ks.length) return; const i = ks.indexOf(sel); GAME.capSel = ks[((i < 0 ? 0 : i + dir) + ks.length) % ks.length]; showCapBay(); };
  gEl('cb-prev').onclick = () => step(-1); gEl('cb-next').onclick = () => step(1);
  const redo = () => { capSave(p); showCapBay(); };
  document.querySelectorAll('[data-cs]').forEach((b) => (b.onclick = () => { GAME.capSel = +b.dataset.cs; redo(); }));
  document.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { p.slots[sel] = b.dataset.ch; if (!p.slots.some(Boolean)) p.slots[sel] = 'assault'; redo(); }));
  cbAttach(p, sel);
}
