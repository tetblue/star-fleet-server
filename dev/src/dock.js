// ───── 編成畫面：3D 艦隊集結（太空港前的編隊）─────
// 玩家改艦種數量時，對應的船加入／離開編隊：大船（航母、戰列艦、補給艦）從超空間躍傳出現、躍傳離開；
// 其餘的船從背後的太空港出港、飛進編隊的位置，減少時飛回港內。每艘模型代表 DOCK.unit 單位（畫面下方寫幾艘）
const DOCK = {
  wrap: null, cv: null, r: null, scene: null, cam: null, sc: null, key: '0', fac: -1, comp: null, types: [], last: {},
  ships: [], fx: [], raf: 0, W: 0, H: 0, unit: 10, tPrev: 0, lay: null, laySig: '',
  orb: { yaw: 0.42, pitch: 0.24, dist: 120, base: 0.42, user: -99, fit: 1 }, drag: null, station: null, stKey: '', planet: null, sky: null, glowTex: null,
  center: null, bay: null, bayDir: null,
};
const dockNow = () => performance.now() / 1000;
const DOCK_NAME = ['帝國軍艦太空港', '聯盟艦隊修整站', '灰鴉傭兵泊港', '改造人類船塢', '機械智慧母港', '感染者巢港', '蟲族巢穴'];
const DOCK_WARP = [true, true, false, false, false, true];   // 依艦種：躍傳（true）或從太空港出港
const DOCK_FRONT = [4, 3, 2, 1, 0, 5];                      // 編隊由前到後：護衛、驅逐、巡洋、戰列、航母、補給
const DOCK_MAX = 54;                                         // 畫面上最多幾艘模型（超過就讓每艘代表更多）
const DOCK_HEAD = new THREE.Vector3(1, 0, 0);                // 編隊朝向
const dockLen = (t) => TYPE_W[t] * 1.15;

function dockGlowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dockInit() {
  if (DOCK.wrap) return;
  const w = DOCK.wrap = document.createElement('div'); w.className = 'dock-bg';   // 全螢幕背景（編成介面疊在上面）
  w.innerHTML = '<canvas></canvas>'; DOCK.cv = w.querySelector('canvas');
  document.body.appendChild(w);
  // 3D
  const r = DOCK.r = new THREE.WebGLRenderer({ canvas: DOCK.cv, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.45;
  const S = DOCK.scene = new THREE.Scene(); S.background = new THREE.Color(0x02040a);
  DOCK.cam = new THREE.PerspectiveCamera(38, 2, 1, 9000);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0); sun.position.set(-0.5, 0.75, 0.45);
  S.add(sun, new THREE.HemisphereLight(0x8fb2ff, 0x1a1020, 0.9), new THREE.AmbientLight(0x404858, 0.9));
  DOCK.glowTex = dockGlowTex();
  DOCK.sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      float h31(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * n3(p); p *= 2.07; a *= .5; } return v; }
      float stars(vec3 d, float sc, float prob){ vec3 g = d * sc, id = floor(g), f = fract(g) - .5; float h = h31(id); if (h > prob) return 0.;
        vec3 o = vec3(h31(id + 3.1), h31(id + 7.7), h31(id + 1.3)) - .5; return smoothstep(.12, 0., length(f - o * .6)) * (.4 + .6 * h31(id + 9.1)); }
      void main(){
        vec3 d = normalize(vDir), col = vec3(.008, .011, .026);
        col += vec3(.16, .06, .22) * smoothstep(.5, .95, fbm(d * 2.2 + 4.1)) * .6;
        col += vec3(.03, .11, .17) * smoothstep(.52, .95, fbm(d * 3.7 + 11.)) * .5;
        col += vec3(.85, .9, 1.) * stars(d, 260., .045) * .8 + vec3(1., .95, .85) * stars(d, 90., .03) * 1.1;
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  S.add(DOCK.sky);
  // 遠方的行星（加一圈大氣光暈）
  const pl = DOCK.planet = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 32), new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.95, metalness: 0 }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOCK.glowTex, color: 0x5d8cff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(2100); halo.renderOrder = -1;
  pl.add(halo, ball); pl.position.set(1900, -1100, -3000); S.add(pl);
  // 拖曳轉視角
  DOCK.cv.addEventListener('pointerdown', (e) => { DOCK.drag = { x: e.clientX, y: e.clientY }; DOCK.cv.setPointerCapture(e.pointerId); });
  DOCK.cv.addEventListener('pointermove', (e) => {
    const d = DOCK.drag; if (!d) return;
    const O = DOCK.orb; O.base -= (e.clientX - d.x) * 0.006; O.yaw = O.base; O.pitch = Math.max(0.02, Math.min(1.25, O.pitch + (e.clientY - d.y) * 0.005));
    d.x = e.clientX; d.y = e.clientY; O.user = dockNow();
  });
  const up = () => { DOCK.drag = null; }; DOCK.cv.addEventListener('pointerup', up); DOCK.cv.addEventListener('pointercancel', up);
  new ResizeObserver(() => dockSize()).observe(DOCK.cv);
}
function dockSize() {
  const r = DOCK.cv.getBoundingClientRect(); if (!r.width || !r.height) return;
  DOCK.W = r.width; DOCK.H = r.height;
  DOCK.r.setSize(r.width, r.height, false); DOCK.cam.aspect = r.width / r.height; DOCK.cam.updateProjectionMatrix();
}
function dockClear() {
  for (const s of DOCK.ships) { if (s.g) DOCK.scene.remove(s.g); dockTrail(s, false); }
  for (const f of DOCK.fx) { DOCK.scene.remove(f.o); f.o.material.dispose(); }
  DOCK.ships = []; DOCK.fx = []; DOCK.laySig = ''; DOCK.unit = 10;
}

// showLoadout 每次重畫後呼叫：放回畫面、找出剛被修改的艦隊當焦點
function dockAttach() {
  dockInit();
  const sc = GAME.sc, lo = GAME.loadout, SPS = supplyList(lo);
  const items = [...lo.fleets.map((f, k) => ({ key: String(k), f, types: [0, 1, 2, 3, 4] })), ...SPS.map((S, i) => ({ key: 's' + i, f: S, types: [4, SUPPLY_T] }))];
  const prevKey = DOCK.key;
  if (DOCK.sc !== sc) { DOCK.sc = sc; DOCK.key = null; dockClear(); }
  const cur = items.find((it) => it.key === GAME.ldSel) || items[0];
  DOCK.wrap.hidden = false;
  if (!cur) { DOCK.comp = null; dockClear(); return; }
  const c = cur.f.cmdr != null && COMMANDERS.find((o) => o.id === cur.f.cmdr);
  const fac = ownFac(c, lo.faction || 0).fac ?? (lo.faction || 0);
  if (cur.key !== prevKey || fac !== DOCK.fac || cur.types.join() !== DOCK.types.join()) dockClear();   // 換了艦隊或外觀：重新集結
  if (fac !== DOCK.fac) dockStation(fac);
  DOCK.key = cur.key; DOCK.fac = fac; DOCK.comp = cur.f.comp; DOCK.types = cur.types;
  dockSize();
  if (!DOCK.raf) { DOCK.tPrev = dockNow(); DOCK.raf = requestAnimationFrame(dockFrame); }
}
// 背景的太空港：該陣營的大型太空站（用到才下載）
function dockStation(fac) {
  const key = FAC_KEY[fac] + 's2'; DOCK.stKey = key;
  if (DOCK.station) { DOCK.scene.remove(DOCK.station); DOCK.station = null; }
  ensureModels([key]).then(() => {
    if (DOCK.stKey !== key || DOCK.station) return;
    const M = getModel(key) || getModel('es2'); if (!M) return;
    const g = new THREE.Group(), m = new THREE.Mesh(M.lods[0], M.mat);
    m.scale.setScalar(150); m.rotation.y = Math.PI / 2; g.add(m);
    for (let i = 0; i < 14; i++) {   // 港口的導航燈
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOCK.glowTex, color: FACTION[fac] ? FACTION[fac].glow : 0xffaa55, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const a = i / 14 * Math.PI * 2; s.position.set(Math.cos(a) * 40, (i % 2 ? 1 : -1) * 9, Math.sin(a) * 40); s.scale.setScalar(4); s.userData.ph = i; g.add(s);
    }
    DOCK.station = g; DOCK.scene.add(g);
  });
}

// ── 編隊位置：每個艦種一個方塊，從前到後排；新增的船排在方塊最後面 ──
function dockCounts() {
  const T = DOCK.types, tot = T.reduce((a, t) => a + (DOCK.comp[t] || 0), 0);
  // 每艘模型代表幾單位：超過上限才加大、少很多才減小（避免加一種船時別的船跟著離隊）
  const need = Math.max(10, 10 * Math.ceil(tot / 10 / DOCK_MAX)), low = Math.max(10, 10 * Math.ceil(tot / 10 / (DOCK_MAX * 0.55)));
  if (need > DOCK.unit) DOCK.unit = need; else if (low < DOCK.unit) DOCK.unit = low;
  const unit = DOCK.unit;
  return T.map((t) => [t, DOCK.comp[t] > 0 ? Math.max(1, Math.round(DOCK.comp[t] / unit)) : 0]);
}
function dockLayout(counts) {
  const slots = {}; let front = 0, prevL = 0, minX = 0, maxX = 0, maxZ = 0;
  for (const t of DOCK_FRONT) {
    const e = counts.find((c) => c[0] === t); if (!e || !e[1]) continue;
    const n = e[1], L = dockLen(t), cols = Math.min(n, Math.max(2, Math.ceil(Math.sqrt(n * 2.4)))), rows = Math.ceil(n / cols);
    const sx = L * 1.1, sz = L * 0.72;
    if (prevL) front -= (prevL + L) * 0.6;
    const out = slots[t] = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - r * cols : cols, c = i - r * cols;
      const z = (c - (inRow - 1) / 2) * sz + (r % 2 ? sz * 0.25 : 0), x = front - r * sx, y = ((r + c) % 2 ? 1 : -1) * L * 0.16 + (c % 3 - 1) * L * 0.05;
      out.push(new THREE.Vector3(x, y, z)); minX = Math.min(minX, x); maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, Math.abs(z));
    }
    front -= (rows - 1) * sx; prevL = L;
  }
  const cx = (minX + maxX) / 2;
  for (const t in slots) for (const p of slots[t]) p.x -= cx;
  const halfX = (maxX - minX) / 2 + 8;
  return { slots, R: Math.max(30, Math.hypot(halfX, maxZ + 8)), back: minX - cx };
}

// 船數跟著 comp：多了加入編隊，少了從最後面離開
function dockSync(now) {
  const counts = dockCounts(), sig = counts.map((c) => c.join(':')).join(',');
  if (sig === DOCK.laySig) return;
  DOCK.laySig = sig; DOCK.lay = dockLayout(counts);
  const st = DOCK.lay;
  DOCK.bay = new THREE.Vector3(st.back - 60, 8, -165); DOCK.bayDir = new THREE.Vector3(1, 0, 0.8).normalize();
  
  const add = [], drop = [];
  for (const [t, n] of counts) {
    const live = DOCK.ships.filter((s) => s.t === t && s.st !== 'out' && s.st !== 'gone');
    for (let i = live.length; i < n; i++) add.push({ t, i });
    for (const s of live) if (s.i >= n) drop.push(s);
  }
  const first = !DOCK.ships.length, stag = Math.min(first ? 0.09 : 0.14, (first ? 2.6 : 1.8) / Math.max(1, add.length));
  add.forEach((a, k) => DOCK.ships.push({ ...a, st: 'in', t0: now + 0.15 + k * stag, g: null, pos: new THREE.Vector3(), ph: Math.random() * 6, fx0: false }));
  drop.sort((a, b) => b.i - a.i).forEach((s, k) => {
    if (s.st === 'in' && now < s.t0) { s.st = 'gone'; return; }   // 還沒出現就取消
    s.st = 'out'; s.t0 = now + k * Math.min(0.14, 1.5 / drop.length); s.from = s.pos.clone(); s.fx0 = false;
  });
}

// 一艘船：船體＋武器（跟戰場同一套掛點）＋尾焰光
const DOCK_SUPPLY_MAT = {};
function dockMakeShip(t) {
  const fk = FAC_KEY[DOCK.fac] || 'e', key = fk + (t === SUPPLY_T ? SHIP_TYPES[SUPPLY_T].look : t);
  const M = getModel(key) || getModel('e' + (t === SUPPLY_T ? 2 : t)); if (!M) return null;
  let mat = M.mat;
  if (t === SUPPLY_T) mat = DOCK_SUPPLY_MAT[key] || (DOCK_SUPPLY_MAT[key] = (() => { const m = M.mat.clone(); m.color = new THREE.Color(0x9fc49a); m.emissiveIntensity = 0.08; return m; })());   // 補給艦：借巡洋艦外觀、偏綠的灰
  const g = new THREE.Group(), body = new THREE.Group(), L = dockLen(t);
  body.add(new THREE.Mesh(M.lods[0], mat));
  if (t !== SUPPLY_T) for (const m of mountsOf(key)) {
    const W = getModel(fk + 'w' + m.w); if (!W) continue;
    const o = new THREE.Mesh(W.lods[Math.min(1, W.lods.length - 1)], W.mat); setMountObj(o, m); body.add(o);
  }
  const F = FACTION[DOCK.fac] || FACTION[0];
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOCK.glowTex, color: F.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.position.set(0, 0, -0.52); body.add(glow);
  body.scale.setScalar(L); g.add(body);
  g.userData = { body, glow, L };
  DOCK.scene.add(g);
  return g;
}
// 特效：閃光、衝擊環、躍傳光帶（各自有材質，淡出後丟掉）
function dockFx(kind, pos, size, life, color) {
  let o;
  if (kind === 'flash') o = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOCK.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  else if (kind === 'ring') { o = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide })); o.rotation.y = Math.PI / 2; }
  else { o = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); o.rotation.z = Math.PI / 2; }
  o.position.copy(pos); DOCK.scene.add(o);
  DOCK.fx.push({ o, kind, size, life, t0: dockNow() });
}
function dockFxTick(now) {
  DOCK.fx = DOCK.fx.filter((f) => {
    const q = (now - f.t0) / f.life;
    if (q >= 1) { DOCK.scene.remove(f.o); f.o.material.dispose(); if (f.o.geometry && f.kind !== 'flash') f.o.geometry.dispose(); return false; }
    if (f.kind === 'flash') { f.o.scale.setScalar(f.size * (0.4 + 1.2 * Math.sqrt(q))); f.o.material.opacity = Math.pow(1 - q, 1.6); }
    else if (f.kind === 'ring') { f.o.scale.setScalar(f.size * (0.3 + 1.3 * easeOutQ(q))); f.o.material.opacity = 0.3 * Math.pow(1 - q, 2); }
    else { f.o.scale.set(f.size * (1 - q * 0.8), f.o.userData.len || 600, f.size * (1 - q * 0.8)); f.o.material.opacity = 0.85 * (1 - q); }
    return true;
  });
}
const easeOutQ = (p) => 1 - Math.pow(1 - p, 3), easeInQ = (p) => p * p * p, smooth = (p) => p * p * (3 - 2 * p);
function bez3(a, b, c, d, u, out) {
  const v = 1 - u;
  return out.set(0, 0, 0).addScaledVector(a, v * v * v).addScaledVector(b, 3 * v * v * u).addScaledVector(c, 3 * v * u * u).addScaledVector(d, u * u * u);
}
const _dv = new THREE.Vector3(), _dw = new THREE.Vector3(), _dT = new THREE.Vector3(), _dP = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

function dockShipTick(s, now, dt) {
  const slot = DOCK.lay && DOCK.lay.slots[s.t] && DOCK.lay.slots[s.t][s.i];
  if (!s.g) { if (now < s.t0 && s.st === 'in') return; s.g = dockMakeShip(s.t); if (!s.g) return; if (s.st !== 'in') s.g.position.copy(s.pos); }
  const { body, glow, L } = s.g.userData, F = FACTION[DOCK.fac] || FACTION[0];
  const T = _dT.copy(slot || s.pos); T.y += Math.sin(now * 0.9 + s.ph) * L * 0.04;
  let face = DOCK_HEAD, stretch = 1, scale = 1, gl = 0.55 + 0.1 * Math.sin(now * 9 + s.ph), vis = true;
  const p = now - s.t0, warp = DOCK_WARP[s.t];
  if (s.st === 'in') {
    if (p < 0) vis = false;
    else if (warp) {   // 躍傳進入：前方先閃光，船從超空間高速衝出、拉長的船身縮回原形，最後衝擊環
      if (!s.fx0) { s.fx0 = true; dockFx('flash', _dv.copy(T).addScaledVector(DOCK_HEAD, -L * 0.3), L * 3.2, 0.5, 0xbfdcff); }
      if (p < 0.22) vis = false;
      else {
        const q = Math.min(1, (p - 0.22) / 0.38), k = 1 - easeOutQ(q);
        if (!s.fx1) { s.fx1 = true; const st0 = _dv.copy(T).addScaledVector(DOCK_HEAD, -300); dockFx('streak', st0, L * 0.12, 0.55, F.glow); const f = DOCK.fx[DOCK.fx.length - 1]; f.o.userData.len = 600; }
        s.pos.copy(T).addScaledVector(DOCK_HEAD, -k * 520); stretch = 1 + 26 * k * k; gl = 2.5;
        if (q >= 1) { s.st = 'dock'; dockFx('ring', T, L * 1.4, 0.9, F.glow); dockFx('flash', T, L * 2.2, 0.45, 0xffffff); }
      }
    } else {           // 出港：從太空港的機庫口飛出，畫一道弧線進入編隊位置
      const dur = 2.6 + (s.ph % 1) * 0.6, q = Math.min(1, p / dur), u = smooth(q);
      _dP[0].copy(DOCK.bay); _dP[1].copy(DOCK.bay).addScaledVector(DOCK.bayDir, 60).add(_dw.set(0, 18 + s.ph * 3, 0));
      _dP[2].copy(T).addScaledVector(DOCK_HEAD, -70); _dP[3].copy(T);
      bez3(_dP[0], _dP[1], _dP[2], _dP[3], u, s.pos);
      bez3(_dP[0], _dP[1], _dP[2], _dP[3], Math.min(1, u + 0.01), _dv); face = _dw.copy(_dv).sub(s.pos); if (face.lengthSq() < 1e-6) face = DOCK_HEAD; else face.normalize();
      scale = Math.min(1, 0.15 + q * 5); gl = 1.8 - q;
      if (q >= 1) s.st = 'dock';
    }
  } else if (s.st === 'dock' || p < 0) {
    s.pos.lerp(T, 1 - Math.exp(-dt * 2.2));   // 編隊重排：慢慢滑到新位置
  } else if (s.st === 'out') {
    if (warp) {   // 躍傳離開：引擎充能，往前拉長衝進超空間
      if (p < 0.8) { gl = 0.6 + p * 3.5; s.pos.copy(s.from).addScaledVector(DOCK_HEAD, -p * L * 0.15); }
      else {
        const q = Math.min(1, (p - 0.8) / 0.3);
        if (!s.fx0) { s.fx0 = true; dockFx('flash', s.from, L * 2.6, 0.5, 0xffffff); dockFx('streak', _dv.copy(s.from).addScaledVector(DOCK_HEAD, 300), L * 0.1, 0.6, F.glow); DOCK.fx[DOCK.fx.length - 1].o.userData.len = 600; }
        s.pos.copy(s.from).addScaledVector(DOCK_HEAD, easeInQ(q) * 700); stretch = 1 + 30 * q * q; gl = 3;
        if (q >= 1) { s.st = 'gone'; dockFx('ring', s.from, L * 1.2, 0.8, F.glow); }
      }
    } else {      // 回港：脫離編隊、繞回太空港的機庫口
      const dur = 2.6, q = Math.min(1, p / dur), u = smooth(q);
      _dP[0].copy(s.from); _dP[1].copy(s.from).addScaledVector(DOCK_HEAD, 45).add(_dw.set(0, 22, 30));
      _dP[2].copy(DOCK.bay).addScaledVector(DOCK.bayDir, 70).add(_dw.set(0, 16, 0)); _dP[3].copy(DOCK.bay);
      bez3(_dP[0], _dP[1], _dP[2], _dP[3], u, s.pos);
      bez3(_dP[0], _dP[1], _dP[2], _dP[3], Math.min(1, u + 0.01), _dv); face = _dw.copy(_dv).sub(s.pos); if (face.lengthSq() < 1e-6) face = DOCK_HEAD; else face.normalize();
      scale = Math.min(1, (1 - q) * 5 + 0.1); gl = 1.6;
      if (q >= 1) s.st = 'gone';
    }
  }
  s.g.visible = vis;
  dockTrail(s, vis && !warp && (s.st === 'in' || (s.st === 'out' && p > 0)), face, L, F.glow);
  s.g.position.copy(s.pos);
  s.g.lookAt(_dv.copy(s.pos).add(face));
  body.scale.set(L * scale, L * scale, L * scale * stretch);
  glow.scale.setScalar(0.34 * gl); glow.material.opacity = Math.min(1, 0.5 + gl * 0.3);
}

// 尾焰：移動中的船後面拖一串漸淡的光點
function dockTrail(s, on, face, L, col) {
  if (!on) { if (s.trail) { for (const o of s.trail) { DOCK.scene.remove(o); o.material.dispose(); } s.trail = null; s.hist = null; } return; }
  const N = 14;
  if (!s.trail) { s.hist = []; s.trail = Array.from({ length: N }, () => { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOCK.glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); DOCK.scene.add(o); return o; }); }
  s.hist.unshift(s.pos.clone().addScaledVector(face, -0.5 * L)); if (s.hist.length > N * 2) s.hist.pop();
  s.trail.forEach((o, k) => { const h = s.hist[Math.min(s.hist.length - 1, k * 2)]; o.position.copy(h); const f = 1 - k / N; o.scale.setScalar(L * 0.55 * f + 0.3); o.material.opacity = 0.75 * f * f; });
}
// 可見區域：扣掉上方工具列、左側（手機是下方）的編成面板、右側的教學面板
function dockVisible() {
  const W = DOCK.W, H = DOCK.H, q = (sel) => { const e = document.querySelector(sel); return e && e.offsetParent ? e.getBoundingClientRect() : null; };
  let x0 = 0, x1 = W, y0 = 0, y1 = H;
  const top = q('.ld-top'), side = q('.ld-side'), tut = document.body.classList.contains('tut-side') && q('#tut-panel');
  if (top) y0 = Math.min(H * 0.4, top.bottom);
  if (side) { if (side.top > H * 0.35) y1 = Math.max(y0 + 80, side.top); else x0 = Math.min(W * 0.6, side.right); }
  if (tut && tut.left > W * 0.4) x1 = Math.max(x0 + 120, tut.left);
  const vw = x1 - x0, vh = y1 - y0;
  return { ox: W / 2 - (x0 + x1) / 2, oy: H / 2 - (y0 + y1) / 2, fit: Math.max(1, Math.min(2.2, 0.92 * Math.max(W / vw, (H / vh) * 0.8))) };
}
function dockFrame() {
  DOCK.raf = 0;
  if (!DOCK.cv || GAME.phase !== 'loadout') { if (DOCK.wrap) DOCK.wrap.hidden = true; return; }   // 離開編成畫面就停
  DOCK.raf = requestAnimationFrame(dockFrame);
  dockStep();
}
function dockStep() {
  const now = dockNow(), dt = Math.min(0.1, now - DOCK.tPrev); DOCK.tPrev = now;
  if (!DOCK.W || !DOCK.comp) return;
  dockSync(now);
  if (DOCK.station && DOCK.lay) DOCK.station.position.set(DOCK.lay.back - 100, 30, -230);
  for (const s of DOCK.ships) dockShipTick(s, now, dt);
  DOCK.ships = DOCK.ships.filter((s) => { if (s.st === 'gone') { if (s.g) DOCK.scene.remove(s.g); dockTrail(s, false); return false; } return true; });
  dockFxTick(now);
  if (DOCK.station) {
    DOCK.station.rotation.y = now * 0.02;
    for (const c of DOCK.station.children) if (c.isSprite) c.material.opacity = 0.35 + 0.65 * (Math.sin(now * 2.2 + c.userData.ph * 1.7) > 0.6 ? 1 : 0.2);
  }
  // 鏡頭：慢慢左右擺，拖曳後停一下再繼續
  const O = DOCK.orb, R = DOCK.lay ? DOCK.lay.R : 40;
  const idle = now - O.user > 5;
  O.yaw = idle ? O.base + 0.22 * Math.sin((now - O.user) * 0.07) : O.base;
  O.dist += (R * 0.95 + 18 - O.dist) * (1 - Math.exp(-dt * 1.5));
  const C = DOCK.cam, cp = Math.cos(O.pitch);
  // 介面擋住的地方不算：艦隊放在剩下可見區域的中間，區域越小鏡頭拉越遠
  const V = dockVisible();
  O.fit += (V.fit - O.fit) * (1 - Math.exp(-dt * 3));
  const dist = O.dist * O.fit;
  C.position.set(Math.sin(O.yaw) * cp * dist, Math.sin(O.pitch) * dist + R * 0.12, Math.cos(O.yaw) * cp * dist);
  C.lookAt(0, R * 0.12, 0);
  C.setViewOffset(DOCK.W, DOCK.H, V.ox, V.oy, DOCK.W, DOCK.H);
  DOCK.sky.position.copy(C.position);
  const cap = gEl('ld-cap'); if (cap) { const t = `${DOCK_NAME[DOCK.fac] || DOCK_NAME[0]}・每艘模型＝${fmtN(DOCK.unit * opts.rep)} 艘・拖曳背景可轉動視角`; if (cap.textContent !== t) cap.textContent = t; }
  DOCK.r.render(DOCK.scene, C);
}
