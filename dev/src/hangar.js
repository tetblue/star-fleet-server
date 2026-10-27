// ───── 王牌飛行員：3D 機庫（機庫畫面的全螢幕背景）─────
// 換機體：升降梯把現在的機體降到下層，換上新機體（武裝在下層先裝好）再升上來。
// 換武裝：機械手臂從後方的武器吊架拿新武裝、把掛架上的舊武裝拆下送回吊架，再把新的裝上去。
// 左臂負責左翼（武裝一、三）與機腹的纏鬥裝備，右臂負責右翼（武裝二、四）。
const HG = {
  wrap: null, cv: null, r: null, scene: null, cam: null, raf: 0, W: 0, H: 0, tPrev: 0, live: false,
  fac: -1, frame: -1, frameWant: 1, want: ['', '', '', '', ''], mount: [null, null, null, null, null], sel: 0,
  ftr: null, plat: null, hp: [], lift: { st: 'idle', t0: 0 }, arms: [], rack: {}, beacons: [], fx: [], glowTex: null, mats: null,
  orb: { yaw: 0.38, pitch: 0.48, base: 0.38, user: -99, fit: 1, dist: 34 }, drag: null, ring: null,
};
const HG_FL = 10;           // 機體長度（世界單位）
const HG_DEPTH = 24;        // 升降梯降下的深度
const HG_LIFT = 1.7;        // 升降各幾秒
const HG_HOLE = 22;         // 升降梯開口邊長
const HG_GEAR_H = 2.3;      // 機腹離升降台的高度（起落架）
const HG_DOOR = { w: 34, h: 24 };   // 彈射艙門（後牆中間）
const HG_LOOK = [{ s: 0.9, c: 0xc4d4ff }, { s: 1, c: 0xffffff }, { s: 1.12, c: 0xdfe6c4 }, { s: 1.18, c: 0xe4d4ff }];   // 依機體：大小、色調
const HG_RACK = ['pulse', 'homing', 'repair', 'heavy', 'rocket', 'torpedo', 'lance', 'ecm'];   // 吊架上的順序（上排四個、下排四個）
const HG_ARM = { L1: 14, L2: 14, SH: 4.2 };   // 上臂、前臂長度、肩膀高度
const HG_SLOT_ARM = [0, 1, 0, 1, 0];   // 哪支手臂負責：0 左、1 右（第 5 個＝纏鬥裝備）
const hgNow = () => performance.now() / 1000;

function hgTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function hgInit() {
  if (HG.wrap) return;
  const w = HG.wrap = document.createElement('div'); w.className = 'dock-bg hg-bg'; w.innerHTML = '<canvas></canvas>'; HG.cv = w.querySelector('canvas');
  document.body.appendChild(w);
  const r = HG.r = new THREE.WebGLRenderer({ canvas: HG.cv, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25;
  const S = HG.scene = new THREE.Scene(); S.background = new THREE.Color(0x05070c); S.fog = new THREE.Fog(0x05070c, 70, 190);
  HG.cam = new THREE.PerspectiveCamera(40, 2, 0.5, 600);
  HG.glowTex = typeof dockGlowTex === 'function' ? dockGlowTex() : null;
  // 燈光：天花板的探照燈打在機體上，兩側偏冷、偏暖的補光
  S.add(new THREE.HemisphereLight(0x9db4e0, 0x1a1612, 0.75), new THREE.AmbientLight(0x30343c, 0.6));
  const key = new THREE.SpotLight(0xfff0d8, 900, 120, 0.55, 0.5, 1.6); key.position.set(6, 42, 14); key.target.position.set(0, 0, 0); S.add(key, key.target);
  const fill = new THREE.PointLight(0x6fa8ff, 160, 90, 1.6); fill.position.set(-30, 18, 18); S.add(fill);
  const rim = new THREE.PointLight(0xffb070, 140, 90, 1.6); rim.position.set(28, 14, -26); S.add(rim);
  const M = HG.mats = {
    metal: new THREE.MeshStandardMaterial({ color: 0x8b939f, metalness: 0.75, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b3039, metalness: 0.6, roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 0.3, roughness: 0.45 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb8302a, metalness: 0.3, roughness: 0.5 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xd29a22, metalness: 0.45, roughness: 0.45 }),
    arm: new THREE.MeshStandardMaterial({ color: 0xd8a032, metalness: 0.5, roughness: 0.4 }),
    glow: (c, k = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 }),
  };
  hgBuildRoom(); hgBuildRacks(); hgBuildArms();
  // 選中的掛架：底下一圈光
  HG.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: 0xf2b35a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  HG.ring.rotation.x = -Math.PI / 2; S.add(HG.ring);
  // 拖曳轉視角
  HG.cv.addEventListener('pointerdown', (e) => { HG.drag = { x: e.clientX, y: e.clientY }; HG.cv.setPointerCapture(e.pointerId); });
  HG.cv.addEventListener('pointermove', (e) => {
    const d = HG.drag; if (!d) return;
    const O = HG.orb; O.base -= (e.clientX - d.x) * 0.006; O.yaw = O.base; O.pitch = Math.max(-0.05, Math.min(1.2, O.pitch + (e.clientY - d.y) * 0.005));
    d.x = e.clientX; d.y = e.clientY; O.user = hgNow();
  });
  const up = () => { HG.drag = null; }; HG.cv.addEventListener('pointerup', up); HG.cv.addEventListener('pointercancel', up);
  new ResizeObserver(() => hgSize()).observe(HG.cv);
}
function hgSize() {
  const b = HG.cv.getBoundingClientRect(); if (!b.width || !b.height) return;
  HG.W = b.width; HG.H = b.height; HG.r.setSize(b.width, b.height, false); HG.cam.aspect = b.width / b.height; HG.cam.updateProjectionMatrix();
}

// ── 機庫：甲板（中間是升降梯的開口）、下層井道、牆面、天花板燈條 ──
function hgBuildRoom() {
  const S = HG.scene, M = HG.mats, h = HG_HOLE / 2;
  const floorTex = hgTex(256, 256, (g, w) => {
    g.fillStyle = '#1b2029'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(150,170,200,.16)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, w - 2);
    g.strokeStyle = 'rgba(150,170,200,.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, w); g.moveTo(0, w / 2); g.lineTo(w, w / 2); g.stroke();
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * w, Math.random() * w, 2 + Math.random() * 18, 1 + Math.random() * 3); }
  }, [1, 1]);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, metalness: 0.55, roughness: 0.55 });
  const F = 200, piece = (x0, x1, z0, z1) => {
    const t = floorTex.clone(); t.needsUpdate = true; t.repeat.set((x1 - x0) / 8, (z1 - z0) / 8);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), floorMat.clone()); m.material.map = t;
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); S.add(m);
  };
  piece(-F, F, h, F); piece(-F, F, -F, -h); piece(-F, -h, -h, h); piece(h, F, -h, h);
  // 開口邊緣：黃黑警示條
  const hazard = hgTex(256, 32, (g, w, hh) => { g.fillStyle = '#d6a21e'; g.fillRect(0, 0, w, hh); g.fillStyle = '#15171b'; for (let x = -hh; x < w; x += 32) { g.beginPath(); g.moveTo(x, hh); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, hh); g.fill(); } }, [HG_HOLE / 6, 1]);
  const hzMat = new THREE.MeshStandardMaterial({ map: hazard, metalness: 0.3, roughness: 0.6 });
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(HG_HOLE + 2, 1), hzMat); m.rotation.x = -Math.PI / 2; m.rotation.z = k * Math.PI / 2;
    const a = k * Math.PI / 2; m.position.set(Math.sin(a) * (h + 0.5), 0.02, Math.cos(a) * (h + 0.5)); S.add(m);
  }
  // 井道（往下的四面牆＋底部燈）
  const shaftTex = hgTex(64, 256, (g, w, hh) => { g.fillStyle = '#12161d'; g.fillRect(0, 0, w, hh); g.fillStyle = 'rgba(120,170,255,.5)'; for (let y = 20; y < hh; y += 48) g.fillRect(4, y, w - 8, 3); }, [3, 1]);
  const shMat = new THREE.MeshStandardMaterial({ map: shaftTex, metalness: 0.4, roughness: 0.7, side: THREE.BackSide, emissive: 0xffffff, emissiveMap: shaftTex, emissiveIntensity: 0.25 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(HG_HOLE, HG_DEPTH + 6, HG_HOLE, 1, 1, 1), shMat); shaft.position.y = -(HG_DEPTH + 6) / 2; S.add(shaft);
  const pit = new THREE.PointLight(0x7fb0ff, 60, 40, 1.5); pit.position.set(0, -HG_DEPTH + 2, 0); S.add(pit);
  // 升降台
  const plat = HG.plat = new THREE.Group();
  const deckTex = hgTex(256, 256, (g, w) => {
    g.fillStyle = '#262c36'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#d6a21e'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, w - 28);
    g.strokeStyle = 'rgba(170,190,220,.25)'; g.lineWidth = 2; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(14 + i * (w - 28) / 6, 30); g.lineTo(14 + i * (w - 28) / 6, w - 30); g.stroke(); }
    g.fillStyle = 'rgba(214,162,30,.8)'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('LIFT 01', w / 2, w - 36);
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(HG_HOLE - 0.4, 1, HG_HOLE - 0.4), [M.dark, M.dark, new THREE.MeshStandardMaterial({ map: deckTex, metalness: 0.5, roughness: 0.5 }), M.dark, M.dark, M.dark]);
  top.position.y = -0.5; plat.add(top);
  S.add(plat);
  // 開口四角的警示燈（升降梯運作時閃）
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, x = Math.sin(a) * (h + 1.6) * Math.SQRT2 * 0.72, z = Math.cos(a) * (h + 1.6) * Math.SQRT2 * 0.72;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.1, 16), M.glow(0xffa21e, 0.3)); b.position.set(x, 0.55, z); S.add(b);
    const s = HG.glowTex ? new THREE.Sprite(new THREE.SpriteMaterial({ map: HG.glowTex, color: 0xffa21e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })) : null;
    if (s) { s.scale.setScalar(6); s.position.set(x, 1.3, z); S.add(s); }
    HG.beacons.push({ b, s });
  }
  // 牆面：後牆與兩側，嵌燈條；天花板燈條
  const wallTex = hgTex(512, 256, (g, w, hh) => {
    g.fillStyle = '#161b23'; g.fillRect(0, 0, w, hh);
    for (let x = 0; x < w; x += 64) for (let y = 0; y < hh; y += 64) { g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`; g.fillRect(x + 3, y + 3, 58, 58); }
    g.fillStyle = 'rgba(140,190,255,.9)'; g.fillRect(0, hh * 0.62, w, 4);
    g.fillStyle = 'rgba(255,170,80,.7)'; for (let x = 24; x < w; x += 128) g.fillRect(x, hh * 0.3, 30, 6);
  }, [4, 1]);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, metalness: 0.4, roughness: 0.7, emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 0.35 });
  const wall = (w, hh, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), wallMat); m.position.set(x, hh / 2, z); m.rotation.y = ry; S.add(m); };
  // 後牆中間留出彈射艙門的開口（寬 HG_DOOR.w、高 HG_DOOR.h）
  const DW = HG_DOOR.w / 2, DH = HG_DOOR.h, wallP = (x0, x1, y0, y1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wallMat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, -48); S.add(m); };
  wallP(-110, -DW, 0, 44); wallP(DW, 110, 0, 44); wallP(-DW, DW, DH, 44);
  wall(150, 44, -82, 20, Math.PI / 2); wall(150, 44, 82, 20, -Math.PI / 2);
  const strip = M.glow(0xdfe8ff, 1.6);
  for (let k = -2; k <= 2; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 90), strip); m.position.set(k * 16, 40, 0); S.add(m); }
  // 彈射艙門：左右兩扇，出擊時往兩邊滑開，外面是太空
  const doorTex = hgTex(256, 256, (g, w) => { g.fillStyle = '#20262f'; g.fillRect(0, 0, w, w); g.strokeStyle = 'rgba(160,180,210,.25)'; g.lineWidth = 3; for (let y = 32; y < w; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.fillStyle = '#d6a21e'; for (let y = 8; y < w; y += 64) g.fillRect(w - 18, y, 10, 28); });
  const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, metalness: 0.6, roughness: 0.5 });
  HG.door = [-1, 1].map((sd) => { const d = new THREE.Mesh(new THREE.BoxGeometry(DW, DH, 1.2), doorMat); d.position.set(sd * DW / 2, DH / 2, -47.6); d.scale.x = sd; S.add(d); return d; });
  HG.seam = new THREE.Mesh(new THREE.BoxGeometry(0.4, DH - 1, 1.4), M.glow(0x8fc4ff, 2.2)); HG.seam.position.set(0, DH / 2, -47.5); S.add(HG.seam);
  const frame = M.glow(0xffa21e, 0.8);
  for (const [w, h, x, y] of [[DW * 2 + 2, 1, 0, DH + 0.5], [1, DH, -DW - 0.5, DH / 2], [1, DH, DW + 0.5, DH / 2]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), frame); b.position.set(x, y, -47.8); S.add(b); }
  // 艙門外：星空與遠方的行星（不受霧影響）
  const spaceTex = hgTex(1024, 512, (g, w, hh) => {
    g.fillStyle = '#01020a'; g.fillRect(0, 0, w, hh);
    const neb = g.createRadialGradient(w * 0.7, hh * 0.3, 0, w * 0.7, hh * 0.3, w * 0.5); neb.addColorStop(0, 'rgba(90,60,160,.35)'); neb.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = neb; g.fillRect(0, 0, w, hh);
    for (let i = 0; i < 900; i++) { const b = Math.random(); g.fillStyle = `rgba(255,255,255,${0.25 + b * 0.75})`; const r = b > 0.97 ? 1.6 : 0.7; g.beginPath(); g.arc(Math.random() * w, Math.random() * hh, r, 0, 7); g.fill(); }
    const pl = g.createRadialGradient(w * 0.2, hh * 1.25, hh * 0.5, w * 0.2, hh * 1.25, hh * 0.78); pl.addColorStop(0, '#2b4a7a'); pl.addColorStop(0.9, '#3d6db8'); pl.addColorStop(1, 'rgba(80,140,255,0)'); g.fillStyle = pl; g.fillRect(0, 0, w, hh);
  });
  const space = new THREE.Mesh(new THREE.PlaneGeometry(420, 210), new THREE.MeshBasicMaterial({ map: spaceTex, fog: false })); space.position.set(0, 40, -170); S.add(space);
  // 彈射軌道：從升降梯延伸到艙門，出擊時燈號依序往前跑
  HG.track = [];
  for (let z = -HG_HOLE / 2 - 1.5; z > -46; z -= 2.6) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.4), M.glow(0x6fb8ff, 0.2)); l.position.set(0, 0.05, z); S.add(l); HG.track.push(l); }
  for (const x of [-1.6, 1.6]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 34), M.metal); rail.position.set(x, 0.06, -12 - HG_HOLE / 2 - 6); S.add(rail); }
  // 噴流擋板：平常收在甲板下，彈射前在機尾後方豎起
  const defl = HG.defl = new THREE.Group(); defl.position.set(0, 0, 9.5);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 0.4), new THREE.MeshStandardMaterial({ map: hazard.clone(), metalness: 0.4, roughness: 0.6 })); plate.position.y = 2; plate.material.map.repeat.set(3, 4); plate.material.map.needsUpdate = true; defl.add(plate);
  defl.rotation.x = Math.PI / 2; defl.visible = false; S.add(defl);
}

// ── 武器模型（程式產生，前方 +Z；userData.r＝中心到頂部的高度，掛架從頂部接上）──
function hgCylZ(r1, r2, L, mat, z = 0, seg = 18) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, L, seg), mat); m.rotation.x = Math.PI / 2; m.position.z = z; return m; }
function hgWeapon(id) {
  const M = HG.mats, g = new THREE.Group(), add = (m, x = 0, y = 0) => { m.position.x += x; m.position.y += y; g.add(m); return m; };
  let r = 0.35;
  if (id === 'pulse') {        // 脈衝機砲：機砲莢艙＋雙管
    add(hgCylZ(0.34, 0.34, 2.4, M.metal)); add(hgCylZ(0.34, 0.18, 0.5, M.metal, 1.45)); add(hgCylZ(0.3, 0.34, 0.3, M.dark, -1.3));
    for (const x of [-0.13, 0.13]) { add(hgCylZ(0.07, 0.07, 1.6, M.dark, 1.9), x); add(hgCylZ(0.075, 0.075, 0.12, M.glow(0xff9a3c, 2.4), 2.68), x); }
    r = 0.34;
  } else if (id === 'homing') {   // 追蹤飛彈：發射軌＋兩枚飛彈
    add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 2.6), M.dark), 0, 0.12);
    for (const x of [-0.24, 0.24]) {
      add(hgCylZ(0.13, 0.13, 2.0, M.white, 0), x, -0.14); add(hgCylZ(0.13, 0.01, 0.5, M.white, 1.25), x, -0.14); add(hgCylZ(0.135, 0.135, 0.16, M.red, 0.7), x, -0.14);
      for (let k = 0; k < 4; k++) { const f = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.35), M.dark), x, -0.14); f.position.z = -0.85; f.rotation.z = k * Math.PI / 2 + Math.PI / 4; f.translateY(0.16); }
    }
    r = 0.22;
  } else if (id === 'repair') {   // 維修光束：白色莢艙、綠色發射器
    add(hgCylZ(0.36, 0.36, 1.8, M.white)); add(new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10), M.white)).position.z = -0.9;
    for (const z of [-0.45, 0.25]) add(hgCylZ(0.37, 0.37, 0.16, M.glow(0x5dff9a, 1.6), z));
    add(hgCylZ(0.36, 0.26, 0.4, M.metal, 1.1)); add(hgCylZ(0.24, 0.24, 0.08, M.glow(0x5dff9a, 3), 1.33));
    r = 0.36;
  } else if (id === 'heavy') {    // 重粒子砲：砲尾＋長砲管＋藍色加速環
    add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 1.4), M.metal)).position.z = -0.7;
    add(hgCylZ(0.2, 0.15, 3.0, M.dark, 1.3));
    for (const z of [0.5, 1.15, 1.8]) add(hgCylZ(0.25, 0.25, 0.12, M.glow(0x5ab8ff, 2.2), z));
    add(hgCylZ(0.21, 0.21, 0.26, M.metal, 2.85));
    r = 0.3;
  } else if (id === 'rocket') {   // 火箭巢：六角莢艙，前面一排發射管
    add(hgCylZ(0.5, 0.5, 2.0, M.metal, 0, 6)); add(hgCylZ(0.5, 0.42, 0.25, M.dark, -1.1, 6));
    const tubes = [[0, 0], ...Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3) * 0.28, Math.sin(k * Math.PI / 3) * 0.28])];
    for (const [x, y] of tubes) add(hgCylZ(0.09, 0.09, 0.1, M.glow(0xff5a3c, 1.8), 1.02), x, y);
    r = 0.5;
  } else if (id === 'torpedo') {  // 重型魚雷：大型彈體、黃色彈帶、尾翼
    add(hgCylZ(0.38, 0.38, 3.0, M.dark)); add(hgCylZ(0.38, 0.06, 0.9, M.metal, 1.95)); add(hgCylZ(0.385, 0.385, 0.22, M.yellow, 0.9));
    add(hgCylZ(0.3, 0.38, 0.4, M.metal, -1.7));
    for (let k = 0; k < 4; k++) { const f = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.6), M.dark)); f.position.z = -1.55; f.rotation.z = k * Math.PI / 2 + Math.PI / 4; f.translateY(0.42); }
    r = 0.38;
  } else if (id === 'lance') {    // 光矛：細長發射桿、線圈、前端水晶
    add(hgCylZ(0.3, 0.2, 1.0, M.dark, -1.3)); add(hgCylZ(0.1, 0.1, 3.6, M.metal, 0.4));
    for (const z of [-0.5, 0.2, 0.9, 1.6]) add(hgCylZ(0.21, 0.21, 0.14, M.glow(0xb67bff, 2), z));
    const c = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.32), M.glow(0x7ff0ff, 3))); c.position.z = 2.45; c.scale.set(0.8, 0.8, 1.6);
    r = 0.3;
  } else if (id === 'ecm') {      // 電磁干擾：機腹的天線罩
    add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 1.6), M.dark), 0, 0.2);
    const d = add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.white)); d.rotation.x = Math.PI; d.scale.set(1, 0.7, 1.3);
    for (const x of [-0.35, 0.35]) { const a = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), M.metal), x, -0.1); a.position.z = -0.7; a.rotation.x = -1.1; }
    const l = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.glow(0xff4a4a, 3)), 0, -0.42); l.userData.blink = true;
    r = 0.3;
  }
  // 掛架接頭
  const py = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.9), M.dark), 0, r + 0.17); py.userData.pylon = true;
  g.userData = { id, r: r + 0.35 };
  return g;
}

// ── 武器吊架：後方兩側各一座，上下兩根橫桿，武器吊在橫桿下（機械臂從下方夾） ──
function hgRackPos(side, id) {   // side：-1 左、1 右；回傳吊著的武器中心
  const i = HG_RACK.indexOf(id), row = i < 4 ? 0 : 1, col = i % 4, x = side * (22 + col * 4.6);
  return new THREE.Vector3(x, row ? 5.6 : 11.2, -22);
}
function hgBuildRacks() {
  const S = HG.scene, M = HG.mats;
  for (const side of [-1, 1]) {
    for (const y of [12.2, 6.6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 0.6), M.dark); b.position.set(side * 28.9, y, -22); S.add(b); }
    for (const x of [19.6, 38.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 14, 0.7), M.metal); p.position.set(side * x, 7, -22); S.add(p); }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), new THREE.MeshStandardMaterial({ color: 0x10141b, metalness: 0.3, roughness: 0.8 })); plate.position.set(side * 28.9, 7, -23.2); S.add(plate);
    for (const id of HG_RACK) { const w = hgWeapon(id), P = hgRackPos(side, id); w.position.copy(P); w.position.y -= 0; S.add(w); HG.rack[side + id] = w; }
  }
}

// ── 機械手臂：底座（左右轉）、上臂、前臂、夾爪；兩節反向運動學 ──
function hgBuildArms() {
  const S = HG.scene, M = HG.mats, A = HG_ARM;
  for (const side of [-1, 1]) {
    const base = new THREE.Group(); base.position.set(side * 18, 0, -9); S.add(base);
    base.add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.8, 24), M.dark)).position.y = 0.4;
    const yawG = new THREE.Group(); base.add(yawG);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.3, A.SH, 18), M.arm); col.position.y = A.SH / 2 + 0.6; yawG.add(col);
    const sh = new THREE.Group(); sh.position.y = A.SH + 0.6; yawG.add(sh);
    sh.add(new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 12), M.dark));
    const up = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, A.L1), M.arm); up.position.z = A.L1 / 2; sh.add(up);
    const el = new THREE.Group(); el.position.z = A.L1; sh.add(el);
    el.add(new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 10), M.dark));
    const fo = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, A.L2), M.arm); fo.position.z = A.L2 / 2; el.add(fo);
    const wr = new THREE.Group(); wr.position.z = A.L2; el.add(wr);
    const grip = new THREE.Group(); wr.add(grip);   // 夾爪一直朝上（從下方托住武器）
    grip.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.6, 16), M.dark)).position.y = 0.1;
    const claws = [-1, 1].map((s) => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.7), M.metal); c.position.set(s * 0.55, 0.85, 0); grip.add(c); return c; });
    const lamp = HG.glowTex ? new THREE.Sprite(new THREE.SpriteMaterial({ map: HG.glowTex, color: 0x9fd0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })) : null;
    if (lamp) { lamp.scale.setScalar(1.6); lamp.position.y = 0.5; grip.add(lamp); }
    const home = new THREE.Vector3(side * 13, 9, -6);
    HG.arms.push({ side, base, yawG, sh, el, wr, grip, claws, tip: home.clone(), home, open: 1, openT: 1, steps: [], cur: null, held: null, queue: [] });
  }
}
const _hgQ = new THREE.Quaternion(), _hgV = new THREE.Vector3(), _hgW = new THREE.Vector3();
function hgArmIK(A) {
  const L1 = HG_ARM.L1, L2 = HG_ARM.L2, B = A.base.position, sy = HG_ARM.SH + 0.6;
  const dx = A.tip.x - B.x, dz = A.tip.z - B.z, yaw = Math.atan2(dx, dz);
  const rr = Math.hypot(dx, dz), hh = A.tip.y - sy, D = Math.max(Math.abs(L1 - L2) + 0.01, Math.min(L1 + L2 - 0.01, Math.hypot(rr, hh)));
  const a1 = Math.atan2(hh, rr) + Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));   // 手肘朝上
  const ex = L1 * Math.cos(a1), ey = L1 * Math.sin(a1), a2 = Math.atan2(hh - ey, rr - ex);
  A.yawG.rotation.y = yaw; A.sh.rotation.x = -a1; A.el.rotation.x = -(a2 - a1);
  // 夾爪：世界座標朝上、跟著底座轉
  A.wr.updateWorldMatrix(true, false); A.wr.getWorldQuaternion(_hgQ).invert();
  A.grip.quaternion.copy(_hgQ).multiply(new THREE.Quaternion().setFromAxisAngle(DOCK_UP_Y, yaw));
  A.open += (A.openT - A.open) * 0.25;
  A.claws.forEach((c, k) => { c.position.x = (k ? 1 : -1) * (0.42 + 0.3 * A.open); });
  if (A.held) { A.wr.getWorldPosition(_hgW); A.held.position.set(_hgW.x, _hgW.y + 1.05 + A.held.userData.r, _hgW.z); }
}
const DOCK_UP_Y = new THREE.Vector3(0, 1, 0);

// ── 機體：模型＋起落架；掛架位置從模型的下緣量出來 ──
function hgFighterKey(fac) { return (FAC_KEY[fac] || 'e') + 'f'; }
function hgBuildFighter(fac, frame) {
  const P = HG.plat;
  if (HG.ftr) { P.remove(HG.ftr); HG.ftr = null; }
  HG.mount = [null, null, null, null, null]; HG.hp = [];
  const M = getModel(hgFighterKey(fac)) || getModel('ef'); if (!M) return false;
  const look = HG_LOOK[frame] || HG_LOOK[1], S = HG_FL * look.s, geo = M.lods[0];
  geo.computeBoundingBox(); const bb = geo.boundingBox;
  const g = new THREE.Group(), mat = M.mat.clone(); mat.color = new THREE.Color(look.c);
  const body = new THREE.Mesh(geo, mat); body.scale.setScalar(S); g.add(body);
  g.position.y = HG_GEAR_H - bb.min.y * S;
  // 起落架
  for (const [x, z] of [[0, bb.max.z * 0.55], [-0.22, bb.min.z * 0.35], [0.22, bb.min.z * 0.35]]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, HG_GEAR_H + 0.4, 8), HG.mats.dark); st.position.set(x * S * 1.2, bb.min.y * S - HG_GEAR_H / 2 + 0.2, z * S); g.add(st);
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 14), HG.mats.dark); wh.rotation.z = Math.PI / 2; wh.position.set(st.position.x, bb.min.y * S - HG_GEAR_H + 0.35, st.position.z); g.add(wh);
  }
  // 掛架：左右翼各兩個（內、外），機腹一個；沿著翼下往上打射線找機身下緣
  const rc = new THREE.Raycaster(), up = new THREE.Vector3(0, 1, 0), mesh = new THREE.Mesh(geo), o = new THREE.Vector3();
  const halfW = Math.max(-bb.min.x, bb.max.x), zc = (bb.min.z + bb.max.z) / 2;
  const under = (x) => {
    let best = null;
    for (let k = 0; k <= 16; k++) {
      const z = bb.min.z + (bb.max.z - bb.min.z) * k / 16; o.set(x, bb.min.y - 1, z); rc.set(o, up);
      const h = rc.intersectObject(mesh)[0]; if (h && (!best || Math.abs(z - zc + 0.05) < Math.abs(best[0] - zc + 0.05))) best = [z, h.point.y];
    }
    return best;
  };
  const pick = (f) => { for (let s = f; s > 0.08; s *= 0.8) { const u = under(halfW * s); if (u) return [halfW * s, u]; } return [halfW * f * 0.5, [zc, bb.min.y + 0.05]]; };
  const inner = pick(0.34), outer = pick(0.66), belly = under(0) || [zc, bb.min.y];
  const L = (x, u) => new THREE.Vector3(x * S, u[1] * S - 0.06, u[0] * S);
  HG.hp = [L(-inner[0], inner[1]), L(inner[0], inner[1]), L(-outer[0], outer[1]), L(outer[0], outer[1]), L(0, belly)];   // 武裝一（左內）、二（右內）、三（左外）、四（右外）、纏鬥裝備（機腹）
  // 外側掛架太靠近內側就往外推一點
  for (const k of [2, 3]) if (Math.abs(HG.hp[k].x - HG.hp[k - 2].x) < 1.4) HG.hp[k].x = HG.hp[k - 2].x + Math.sign(HG.hp[k].x || (k === 2 ? -1 : 1)) * 1.4;
  if (Math.abs(HG.hp[4].x) < 0.01 && Math.abs(HG.hp[0].x) < 1.2) { HG.hp[0].x = -1.2; HG.hp[1].x = 1.2; }
  P.add(g); HG.ftr = g; HG.fac = fac; HG.frame = frame;
  return true;
}
function hgMountAt(k, w) {   // 把武器裝到掛架 k（機體座標）
  const p = HG.hp[k]; w.position.set(p.x, p.y - w.userData.r, p.z); w.quaternion.identity(); HG.ftr.add(w);
  HG.mount[k] = { id: w.userData.id, mesh: w };
}
function hgMountWorld(k, id, out) {   // 掛架 k 上的武器（id）中心的世界座標
  const p = HG.hp[k]; HG.ftr.updateWorldMatrix(true, false);
  return out.set(p.x, p.y - (hgWeaponR(id)), p.z).applyMatrix4(HG.ftr.matrixWorld);
}
const HG_R = {}; function hgWeaponR(id) { if (HG_R[id] == null) HG_R[id] = hgWeapon(id).userData.r; return HG_R[id]; }
function hgSnap() {   // 直接照設定裝好（剛進機庫、升降梯在下層時）
  for (let k = 0; k < 5; k++) { const m = HG.mount[k]; if (m) { m.mesh.parent && m.mesh.parent.remove(m.mesh); HG.mount[k] = null; } if (HG.want[k]) hgMountAt(k, hgWeapon(HG.want[k])); }
}

// ── 特效：裝上武器時的火花 ──
function hgSparks(P) {
  if (!HG.glowTex) return;
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: HG.glowTex, color: i % 3 ? 0xffc46a : 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(P); s.scale.setScalar(0.5); HG.scene.add(s);
    const a = Math.random() * Math.PI * 2, v = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 4), 1 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 4));
    HG.fx.push({ s, v, t0: hgNow(), life: 0.4 + Math.random() * 0.4 });
  }
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: HG.glowTex, color: 0xbfe0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  f.position.copy(P); f.scale.setScalar(4); HG.scene.add(f); HG.fx.push({ s: f, v: null, t0: hgNow(), life: 0.35, grow: 4 });
}
function hgFxTick(now, dt) {
  HG.fx = HG.fx.filter((f) => {
    const q = (now - f.t0) / f.life;
    if (q >= 1) { HG.scene.remove(f.s); f.s.material.dispose(); return false; }
    if (f.v) { f.v.y -= 14 * dt; f.s.position.addScaledVector(f.v, dt); f.s.material.opacity = 1 - q; }
    else { f.s.scale.setScalar(f.grow * (0.5 + q)); f.s.material.opacity = 1 - q; }
    return true;
  });
}

// ── 手臂的工作：一串步驟（移動、夾緊／放開、動作） ──
// 移動走三次貝茲曲線：先離開現在的位置，從外側下方接近目標（避開機翼與吊架）
function hgMove(A, to, dur) { A.steps.push({ k: 'm', to: to.clone(), dur }); }
function hgDo(A, fn) { A.steps.push({ k: 'f', fn }); }
function hgGrip(A, open) { A.steps.push({ k: 'g', open, dur: 0.3 }); }
function hgWristFor(Pw, id) { return Pw.clone().add(_hgV.set(0, -1.05 - hgWeaponR(id), 0)); }   // 夾住武器時手腕的位置
function hgPlan(A, k) {   // 掛架 k：拆掉舊的、裝上新的（開始做的時候才看現在的狀態）
  const cur = HG.mount[k], want = HG.want[k];
  if ((cur ? cur.id : '') === want) return false;
  const side = A.side, P = new THREE.Vector3();
  if (cur) {
    const id = cur.id;
    hgGrip(A, true); hgMove(A, hgWristFor(hgMountWorld(k, id, P), id), 1.0); hgGrip(A, false);
    hgDo(A, () => { const m = HG.mount[k]; if (!m) return; HG.ftr.remove(m.mesh); HG.scene.add(m.mesh); m.mesh.quaternion.identity(); A.held = m.mesh; HG.mount[k] = null; });
    hgMove(A, hgWristFor(hgRackPos(side, id), id), 1.1);
    hgDo(A, () => { if (A.held) { HG.scene.remove(A.held); A.held = null; } }); hgGrip(A, true);
  }
  if (want) {
    hgMove(A, hgWristFor(hgRackPos(side, want), want), 1.1); hgGrip(A, false);
    hgDo(A, () => { const w = hgWeapon(want); HG.scene.add(w); A.held = w; });
    hgMove(A, hgWristFor(hgMountWorld(k, want, P), want), 1.1);
    hgDo(A, () => { const w = A.held; if (!w) return; A.held = null; HG.scene.remove(w); if (HG.mount[k]) { HG.ftr.remove(HG.mount[k].mesh); } hgMountAt(k, w); hgMountWorld(k, want, P); hgSparks(P.add(_hgV.set(0, w.userData.r, 0))); });
    hgGrip(A, true);
  }
  hgMove(A, A.home, 0.9);
  return true;
}
function hgArmTick(A, now, dt) {
  if (!A.cur) {
    A.cur = A.steps.shift() || null;
    if (A.cur) { A.cur.t0 = now; if (A.cur.k === 'm') { A.cur.from = A.tip.clone(); const out = new THREE.Vector3(A.side * 3, -2.2, 2); A.cur.c1 = A.cur.from.clone().add(new THREE.Vector3(0, 2.5, 0)); A.cur.c2 = A.cur.to.clone().add(out); } }
  }
  const S = A.cur;
  if (S) {
    if (S.k === 'f') { S.fn(); A.cur = null; }
    else if (S.k === 'g') { A.openT = S.open ? 1 : 0; if (now - S.t0 >= S.dur) A.cur = null; }
    else {
      const q = Math.min(1, (now - S.t0) / S.dur), u = q * q * (3 - 2 * q);
      bez3(S.from, S.c1, S.c2, S.to, u, A.tip);
      if (q >= 1) A.cur = null;
    }
  }
  hgArmIK(A);
}
const hgArmsIdle = () => HG.arms.every((A) => !A.cur && !A.steps.length);

// ── 每一畫格：升降梯、手臂排程、鏡頭 ──
function hgStep() {
  const now = hgNow(), dt = Math.min(0.1, now - HG.tPrev); HG.tPrev = now;
  if (!HG.W) return;
  if (HG.cine) {   // 出擊動畫：手臂停在原位，鏡頭照劇本走
    for (const A of HG.arms) hgArmIK(A);
    hgFxTick(now, dt); HG.ring.visible = false;
    if (HG.cine) hgCineStep(now, dt);
    HG.r.render(HG.scene, HG.cam); return;
  }
  const L = HG.lift;
  if (!HG.ftr && getModel(hgFighterKey(HG.facWant))) { hgBuildFighter(HG.facWant, HG.frameWant); hgSnap(); }
  // 換機體：等手臂停下 → 降下 → 換機（武裝在下層裝好）→ 升上來
  if (HG.ftr && L.st === 'idle' && (HG.frame !== HG.frameWant || HG.fac !== HG.facWant) && hgArmsIdle()) { L.st = 'down'; L.t0 = now; }
  if (L.st === 'down') {
    const q = Math.min(1, (now - L.t0) / HG_LIFT); HG.plat.position.y = -HG_DEPTH * (q * q * (3 - 2 * q));
    if (q >= 1) { hgBuildFighter(HG.facWant, HG.frameWant); hgSnap(); L.st = 'hold'; L.t0 = now; }
  } else if (L.st === 'hold') { if (now - L.t0 > 0.35) { L.st = 'up'; L.t0 = now; } }
  else if (L.st === 'up') {
    const q = Math.min(1, (now - L.t0) / HG_LIFT); HG.plat.position.y = -HG_DEPTH * (1 - q * q * (3 - 2 * q));
    if (q >= 1) { L.st = 'idle'; HG.plat.position.y = 0; }
  }
  const moving = L.st !== 'idle';
  for (const b of HG.beacons) { const on = moving && Math.sin(now * 12) > 0; b.b.material.emissiveIntensity = on ? 3 : 0.3; if (b.s) b.s.material.opacity = on ? 0.9 : 0; }
  // 換武裝：升降梯停著、機體對了，才派手臂去做
  if (HG.ftr && L.st === 'idle' && HG.frame === HG.frameWant) {
    for (let k = 0; k < 5; k++) { const A = HG.arms[HG_SLOT_ARM[k]]; if (!A.cur && !A.steps.length && !A.queue.includes(k) && (HG.mount[k] ? HG.mount[k].id : '') !== HG.want[k]) A.queue.push(k); }
    for (const A of HG.arms) while (!A.cur && !A.steps.length && A.queue.length) { if (hgPlan(A, A.queue.shift())) break; }
  }
  for (const A of HG.arms) hgArmTick(A, now, dt);
  hgFxTick(now, dt);
  // 武器上的閃燈
  if (HG.ftr) HG.ftr.traverse((o) => { if (o.userData.blink) o.visible = Math.sin(now * 6) > -0.2; });
  // 選中的掛架底下的光圈
  const sel = HG.sel, ring = HG.ring;
  if (HG.ftr && HG.hp[sel]) { HG.ftr.updateWorldMatrix(true, false); ring.visible = true; ring.position.copy(HG.hp[sel]).applyMatrix4(HG.ftr.matrixWorld); ring.position.y = Math.max(0.05, HG.plat.position.y + 0.05); const s = 1.4 + 0.15 * Math.sin(now * 4); ring.scale.setScalar(s); ring.material.opacity = moving ? 0 : 0.75; }
  else ring.visible = false;
  // 鏡頭：繞著機體慢慢擺，拖曳後停一下再繼續；介面擋住的地方不算
  const O = HG.orb, idle = now - O.user > 5;
  O.yaw = idle ? O.base + 0.25 * Math.sin((now - O.user) * 0.08) : O.base;
  const V = dockVisible(HG.W, HG.H);
  O.fit += (V.fit - O.fit) * (1 - Math.exp(-dt * 3));
  const C = HG.cam, cp = Math.cos(O.pitch), dist = O.dist * O.fit, cy = 3.5 + Math.min(0, HG.plat.position.y) * 0.25;
  C.position.set(Math.sin(O.yaw) * cp * dist, cy + Math.sin(O.pitch) * dist, Math.cos(O.yaw) * cp * dist - 2);
  C.lookAt(0, cy, -2);
  C.setViewOffset(HG.W, HG.H, V.ox, V.oy, HG.W, HG.H); C.updateMatrixWorld();
  const cap = gEl('hg-cap'); if (cap) { const t = `${moving ? '升降梯運作中・' : !hgArmsIdle() ? '機械臂換裝中・' : ''}拖曳背景可轉動視角`; if (cap.textContent !== t) cap.textContent = t; }
  HG.r.render(HG.scene, C);
}
function hgFrame() {
  HG.raf = 0;
  if (!document.querySelector('.hg-screen')) { HG.live = false; if (HG.wrap) HG.wrap.hidden = true; document.body.classList.remove('hg-on'); return; }   // 離開機庫畫面就停
  HG.raf = requestAnimationFrame(hgFrame);
  hgStep();
}
// showPilot('hangar') 每次重畫後呼叫：記下要的機體與武裝，場景自己慢慢換過去
function hgAttach(p, sel) {
  hgInit();
  document.body.classList.add('hg-on'); HG.wrap.hidden = false;
  const fac = p.fac === 1 ? 1 : 0, want = [...p.slots.slice(0, 4), p.gear || ''];
  const fresh = !HG.live; HG.live = true;
  HG.facWant = fac; HG.frameWant = p.frame; HG.want = want; HG.sel = sel;
  ensureModels([hgFighterKey(fac)]);
  if (fresh) {   // 剛進機庫：直接擺好，不播動畫
    for (const A of HG.arms) { A.steps = []; A.cur = null; A.queue = []; if (A.held) { HG.scene.remove(A.held); A.held = null; } A.tip.copy(A.home); A.openT = A.open = 1; }
    HG.lift.st = 'idle'; HG.plat.position.y = 0; HG.cine = null; hgLaunchReset();
    if (getModel(hgFighterKey(fac))) { hgBuildFighter(fac, p.frame); hgSnap(); } else if (HG.ftr) { HG.plat.remove(HG.ftr); HG.ftr = null; }
  }
  hgSize();
  if (!HG.raf) { HG.tPrev = hgNow(); HG.raf = requestAnimationFrame(hgFrame); }
}

// ── 出擊：彈射動畫 ──
// 轉台把機首轉向後方的彈射艙門 → 艙門滑開、噴流擋板豎起、引擎充能、倒數 → 彈射出艙門，畫面淡出後開戰。點一下畫面略過
const HG_CINE = { rot: [0, 1.6], door: [1.1, 2.7], defl: [1.8, 2.6], spool: [2.2, 3.8], cnt: 2.6, go: 3.8, fade: [4.7, 5.5], end: 5.6 };
const HG_CAM = [   // 時間、鏡頭位置、看的點
  [0, [24, 10, 18], [0, 4, 0]], [1.8, [11, 11, 25], [0, 5, -20]], [3.8, [7, 11.5, 22], [0, 5.5, -34]], [5.4, [3, 9.5, 13], [0, 7.5, -80]],
];
const hgSpan = (q, r) => Math.max(0, Math.min(1, (q - r[0]) / (r[1] - r[0])));
const hgEase = (x) => x * x * (3 - 2 * x);
function hgLaunchReset() {   // 回到機庫平常的樣子（艙門關、轉台歸位、擋板收起）
  if (!HG.door) return;
  const DW = HG_DOOR.w / 2;
  HG.door.forEach((d, k) => { d.position.x = (k ? 1 : -1) * DW / 2; }); HG.seam.visible = true;
  HG.plat.rotation.y = 0; HG.defl.visible = false; HG.defl.rotation.x = Math.PI / 2;
  for (const l of HG.track) l.material.emissiveIntensity = 0.2;
  if (HG.eng) { HG.eng.parent && HG.eng.parent.remove(HG.eng); HG.eng = null; }
}
function hgLaunch(p, done) {
  setPhase('briefing');
  overlay(`<div class="hg-screen hg-cine" id="hg-cine"><div class="hg-cine-cap" id="hg-cine-cap"></div><div class="hg-cine-skip">點一下畫面略過</div><div class="hg-fade" id="hg-fade"></div></div>`);
  HG.live = false; hgAttach(p, -1);
  if (!HG.ftr) { done(); return; }   // 模型還沒好：直接開戰
  // 引擎噴口的光（機尾）
  const body = HG.ftr.children[0], bb = body.geometry.boundingBox, S = body.scale.x;
  if (HG.glowTex) {
    const e = HG.eng = new THREE.Sprite(new THREE.SpriteMaterial({ map: HG.glowTex, color: 0x9fd4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    e.position.set(0, (bb.min.y + bb.max.y) / 2 * S, bb.min.z * S - 0.3); HG.ftr.add(e);
  }
  HG.cine = { t0: hgNow() + 0.2, done, z0: HG.ftr.position.z, crossed: false };
  gEl('hg-cine').onclick = hgCineEnd;
}
function hgCineEnd() {
  const c = HG.cine; if (!c) return;
  HG.cine = null; hgLaunchReset(); c.done();
}
const _hgE = new THREE.Vector3(), _hgC = new THREE.Vector3(), _hgL = new THREE.Vector3();
function hgCineStep(now, dt) {
  const c = HG.cine, q = now - c.t0, C = HG.cam, R = HG_CINE, DW = HG_DOOR.w / 2;
  HG.plat.rotation.y = Math.PI * hgEase(hgSpan(q, R.rot));   // 轉台：機首轉向艙門（-Z）
  const kd = hgEase(hgSpan(q, R.door));
  HG.door.forEach((d, k) => { d.position.x = (k ? 1 : -1) * (DW / 2 + kd * (DW + 1.5)); }); HG.seam.visible = kd < 0.02;
  if (q > R.defl[0]) { HG.defl.visible = true; HG.defl.rotation.x = Math.PI / 2 * (1 - hgEase(hgSpan(q, R.defl))); }
  const alarm = q < R.go + 0.6 && Math.sin(now * 12) > 0;
  for (const b of HG.beacons) { b.b.material.emissiveIntensity = alarm ? 3 : 0.3; if (b.s) b.s.material.opacity = alarm ? 0.9 : 0; }
  // 軌道燈：開門後依序往艙門跑，彈射時全亮
  HG.track.forEach((l, i) => { l.material.emissiveIntensity = q > R.go ? 3 : q > R.door[0] ? 0.3 + 2.6 * Math.pow(Math.max(0, Math.sin(q * 9 - i * 0.55)), 4) : 0.2; });
  // 引擎：充能時越來越亮，彈射時最亮
  const ks = hgSpan(q, R.spool);
  if (HG.eng) { const k = q > R.go ? 1 : ks; HG.eng.scale.setScalar(1 + k * 4 + (q > R.go ? Math.random() * 0.8 : 0)); HG.eng.material.opacity = 0.2 + 0.8 * k; }
  // 彈射：沿軌道加速衝出艙門（轉台轉了 180°，機體座標的 +Z＝世界的 -Z）
  if (q > R.go) {
    const t = q - R.go; HG.ftr.position.z = c.z0 + 0.5 * 180 * t * t;
    if (HG.eng && HG.glowTex) {   // 尾焰
      HG.eng.getWorldPosition(_hgE);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: HG.glowTex, color: 0x8cc8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.copy(_hgE); s.scale.setScalar(2.4); HG.scene.add(s); HG.fx.push({ s, v: null, t0: now, life: 0.45, grow: 2.4 });
      if (!c.crossed && _hgE.z < -48) { c.crossed = true; hgSparks(_hgL.set(0, HG.ftr.position.y + 3, -48)); }
    }
  }
  // 鏡頭：照關鍵格內插；彈射那一下震動
  let k = 0; while (k < HG_CAM.length - 2 && q > HG_CAM[k + 1][0]) k++;
  const A = HG_CAM[k], B = HG_CAM[k + 1], u = hgEase(Math.max(0, Math.min(1, (q - A[0]) / (B[0] - A[0]))));
  _hgC.set(...A[1]).lerp(_hgL.set(...B[1]), u); const look = new THREE.Vector3(...A[2]).lerp(new THREE.Vector3(...B[2]), u);
  const sh = q > R.go - 0.15 && q < R.go + 0.9 ? 0.45 * (1 - (q - R.go + 0.15) / 1.05) : 0;
  if (sh > 0) _hgC.add(_hgE.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
  C.position.copy(_hgC); C.lookAt(look); C.clearViewOffset(); C.updateMatrixWorld();
  // 字幕、淡出
  const cap = gEl('hg-cine-cap');
  if (cap) {
    const t = q < R.rot[1] ? '轉台就位・機首對準彈射軌道' : q < R.cnt ? '彈射艙門開啟' : q < R.go ? `彈射器充能　${3 - Math.floor((q - R.cnt) / ((R.go - R.cnt) / 3))}` : q < R.fade[0] ? '彈射！' : '';
    if (cap.textContent !== t) { cap.textContent = t; cap.classList.toggle('go', q >= R.go); }
  }
  const fd = gEl('hg-fade'); if (fd) fd.style.opacity = hgSpan(q, R.fade).toFixed(3);
  if (q >= R.end) hgCineEnd();
}
