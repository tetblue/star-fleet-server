// ───── 編成畫面：3D 艦隊集結（太空港前的編隊）─────
// 玩家改艦種數量時，對應的船加入／離開編隊：大船（航母、戰列艦、補給艦）從超空間躍傳出現、躍傳離開；
// 其餘的船從背後的太空港出港、飛進編隊的位置，減少時飛回港內。每艘模型代表該艦隊 unit 單位（畫面下方寫幾艘）。
// 所有艦隊同時在場景裡（斜列排開），選哪支鏡頭就運鏡到哪支；每支艦隊中央是旗艦（★）
const DOCK = {
  wrap: null, cv: null, r: null, scene: null, cam: null, sc: null, lo: null, fac: -1, groups: [], focus: null, fresh: true, foc: null, Rc: 0, focTh: null,
  fx: [], raf: 0, W: 0, H: 0, tPrev: 0,
  orb: { yaw: -0.2, pitch: 0.34, dist: 120, base: -0.2, user: -99, fit: 1 }, drag: null, station: null, stKey: '', planet: null, sky: null, glowTex: null,
  center: null, bay: null, bayDir: null,
};
const dockNow = () => performance.now() / 1000;
const DOCK_NAME = ['帝國軍艦太空港', '聯盟艦隊修整站', '灰鴉傭兵泊港', '改造人類船塢', '機械智慧母港', '感染者巢港', '蟲族巢穴'];
const DOCK_WARP = [true, true, false, false, false, true];   // 依艦種：躍傳（true）或從太空港出港；旗艦（'F'）也是躍傳
DOCK_WARP.F = true;
const DOCK_MAX = 54;                                         // 畫面上最多幾艘模型（超過就讓每艘代表更多）
const DOCK_HEAD = new THREE.Vector3(1, 0, 0);                // 編隊朝向
const dockLen = (t) => (t === 'F' ? TYPE_W[1] * 2.2 : TYPE_W[t]) * 1.15;   // 旗艦：放大的戰列艦（戰場上是 2.4 倍）

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
  for (const gr of DOCK.groups) dockDropGroup(gr);
  for (const f of DOCK.fx) { DOCK.scene.remove(f.o); f.o.material.dispose(); }
  DOCK.groups = []; DOCK.fx = []; DOCK.focus = null;
}
function dockDropShips(gr) {
  for (const s of gr.ships) { if (s.g) DOCK.scene.remove(s.g); dockTrail(s, false); }
  gr.ships = []; gr.laySig = '';
}
function dockDropGroup(gr) { dockDropShips(gr); if (gr.tag) gr.tag.remove(); }

// showLoadout 每次重畫後呼叫。每支艦隊（含補給艦隊）在場景裡各有一組船，一直都在；
// 切換分頁只是鏡頭運鏡過去。只有艦數變了（增減、自動分配、新增／移除艦隊）才有船加入或離開的動畫
function dockAttach() {
  dockInit();
  const lo = GAME.loadout, SPS = supplyList(lo);
  // 換了關卡或整份編成：直接擺好，不播動畫
  if (DOCK.sc !== GAME.sc || DOCK.lo !== lo) { dockClear(); DOCK.sc = GAME.sc; DOCK.lo = lo; DOCK.fresh = true; }
  const items = [
    ...lo.fleets.map((f, k) => ({ key: String(k), f, sup: false, name: `第${'一二三四五六'[k]}艦隊` })),
    ...SPS.map((S, i) => ({ key: 's' + i, f: S, sup: true, name: supplyName(i) })),
  ];
  const live = [];
  for (const it of items) {
    let gr = DOCK.groups.find((g) => g.f === it.f && !g.leaving);
    const c = !it.sup && it.f.cmdr != null && COMMANDERS.find((o) => o.id === it.f.cmdr);
    const fac = ownFac(c, lo.faction || 0).fac ?? (lo.faction || 0);
    if (!gr) {
      gr = { f: it.f, sup: it.sup, types: it.sup ? [4, SUPPLY_T] : [0, 1, 2, 3, 4], fac, unit: 10, laySig: '', lay: null, ships: [],
        th: 0, thT: 0, anchor: new THREE.Vector3(), head: DOCK_HEAD.clone(), quat: new THREE.Quaternion(), bay: new THREE.Vector3(), bayDir: new THREE.Vector3(), snap: DOCK.fresh, placed: false, tag: null };
      const tg = gr.tag = document.createElement('button'); tg.className = 'dock-tag'; tg.type = 'button';
      tg.onclick = () => { if (GAME.ldSel !== gr.key) { GAME.ldSel = gr.key; showLoadout(); } };
      DOCK.wrap.appendChild(tg);
      DOCK.groups.push(gr);
    } else if (gr.fac !== fac) { gr.fac = fac; dockDropShips(gr); gr.snap = true; }   // 換了指揮官（陣營外觀不同）：直接換船，不算增減
    gr.key = it.key; gr.fac = fac; gr.name = it.name + (c ? '・' + c.name : '');
    live.push(gr);
  }
  for (const gr of DOCK.groups) if (!live.includes(gr) && !gr.leaving) { gr.leaving = true; gr.laySig = ''; if (gr.tag) { gr.tag.remove(); gr.tag = null; } }   // 移除的艦隊：全部離隊
  DOCK.groups.sort((a, b) => (a.leaving ? 1e3 : live.indexOf(a)) - (b.leaving ? 1e3 : live.indexOf(b)));
  DOCK.focus = live.find((g) => g.key === GAME.ldSel) || live[0] || null;
  DOCK.fresh = false;
  const sf = lo.faction || 0;
  if (sf !== DOCK.fac) { DOCK.fac = sf; dockStation(sf); }
  DOCK.wrap.hidden = false;
  dockSize();
  if (!DOCK.raf) { DOCK.tPrev = dockNow(); DOCK.raf = requestAnimationFrame(dockFrame); }
}
// 背景的太空港：玩家陣營的大型太空站（用到才下載）
function dockStation(fac) {
  const key = FAC_KEY[fac] + 's2'; DOCK.stKey = key;
  if (DOCK.station) { DOCK.scene.remove(DOCK.station); DOCK.station = null; }
  ensureModels([key]).then(() => {
    if (DOCK.stKey !== key || DOCK.station) return;
    const M = getModel(key) || getModel('es2'); if (!M) return;
    const g = new THREE.Group(), m = new THREE.Mesh(M.lods[0], M.mat);
    m.scale.setScalar(125); m.rotation.y = Math.PI / 2; g.add(m);
    for (let i = 0; i < 14; i++) {   // 港口的導航燈
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOCK.glowTex, color: FACTION[fac] ? FACTION[fac].glow : 0xffaa55, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const a = i / 14 * Math.PI * 2; s.position.set(Math.cos(a) * 40, (i % 2 ? 1 : -1) * 9, Math.sin(a) * 40); s.scale.setScalar(4); s.userData.ph = i; g.add(s);
    }
    g.position.copy(DOCK_ST);
    DOCK.station = g; DOCK.scene.add(g);
  });
}

// ── 編隊位置：每個艦種一個方塊，從前到後排；旗艦在中間 ──
function dockCounts(gr) {
  if (gr.leaving) return gr.types.map((t) => [t, 0]).concat(gr.sup ? [] : [['F', 0]]);
  const T = gr.types, comp = gr.f.comp, tot = T.reduce((a, t) => a + (comp[t] || 0), 0);
  // 每艘模型代表幾單位：超過上限才加大、少很多才減小（避免加一種船時別的船跟著離隊）
  const need = Math.max(10, 10 * Math.ceil(tot / 10 / DOCK_MAX)), low = Math.max(10, 10 * Math.ceil(tot / 10 / (DOCK_MAX * 0.55)));
  if (need > gr.unit) gr.unit = need; else if (low < gr.unit) gr.unit = low;
  const out = T.map((t) => [t, comp[t] > 0 ? Math.max(1, Math.round(comp[t] / gr.unit)) : 0]);
  if (!gr.sup) out.push(['F', 1]);   // 艦隊旗艦（戰場上本隊多的那艘大戰列艦）；補給艦隊沒有
  return out;
}
// 跟戰場同一套陣型產生器（genFormation／genOrderly）：照「起始陣型」與「排列」擺，
// 一樣分成幾支分艦隊、旗艦在本隊中央、前排小船後排大船；模型比戰場的圖示少，所以間距放大 DOCK_GAP 倍
const DOCK_GAP = 1.5;
function dockLayout(gr, counts) {
  const f = gr.f, kind = FORMATIONS[f.formation] ? f.formation : gr.sup ? 'ring' : 'line';
  const slots = {}, per = {}; let N = 0, hasF = false;
  for (const [t, n] of counts) { if (n) slots[t] = []; if (t === 'F') hasF = n > 0; else { per[t] = n; N += n; } }
  const P = N + (hasF ? 1 : 0);
  if (!P) return { slots, R: 30, hx: 20, hz: 20, back: 0 };
  const real = gr.types.reduce((x, t) => x + (f.comp[t] || 0), 0);
  const K = Math.max(1, Math.min(P, Math.max(gr.sup ? 1 : 2, Math.min(6, Math.round(real / 380)))));
  // 各艦種輪流分到每支分艦隊（每支至少一艘）；旗艦在本隊
  const sq = Array.from({ length: K }, () => ({})), cnt = new Array(K).fill(0), flagK = Math.floor((K - 1) / 2);
  let c = hasF ? 1 : 0; if (hasF) cnt[flagK]++;
  for (const t of SHIP_ORDER_FRONT_TO_BACK) for (let i = 0; i < (per[t] || 0); i++) { const k = (flagK + c++) % K; sq[k][t] = (sq[k][t] || 0) + 1; cnt[k]++; }
  const order = cnt.map((_, i) => i);
  const lay = f.orderly ? genOrderly(kind, cnt, order, f.layers || 1) : genFormation(kind, cnt, order, rand(4242));
  const raw = [];
  lay.forEach((Lq, k) => {
    if (!Lq) return;
    const pts = Lq.local.map((l) => ({ u: Lq.cu + l[0], y: (Lq.cw || 0) + l[1], v: Lq.cv + l[2], l }));
    if (k === flagK && hasF) {   // 旗艦：本隊中央偏後
      let bi = 0, bd = 1e9; pts.forEach((q, i) => { const d = Math.hypot(q.l[0], q.l[2] + 8); if (d < bd) { bd = d; bi = i; } });
      const fp = pts.splice(bi, 1)[0]; raw.push({ t: 'F', u: fp.u, y: f.orderly || kind === 'hcone' ? fp.y : 4, v: fp.v });
    }
    pts.sort((x, z) => z.v - x.v);   // 由前到後：護衛、驅逐、巡洋、戰列、補給、航母
    const seq = []; for (const t of SHIP_ORDER_FRONT_TO_BACK) for (let i = 0; i < (sq[k][t] || 0); i++) seq.push(t);
    pts.forEach((q, i) => { if (seq[i] != null) raw.push({ t: seq[i], u: q.u, y: q.y * (+seq[i] <= 1 && !f.orderly ? 0.6 : 1), v: q.v }); });
  });
  let minX = 1e9, maxX = -1e9, maxZ = 0;
  for (const q of raw) { const x = q.v * DOCK_GAP; minX = Math.min(minX, x); maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, Math.abs(q.u * DOCK_GAP)); }
  const cx = (minX + maxX) / 2;
  for (const q of raw) if (slots[q.t]) slots[q.t].push(new THREE.Vector3(q.v * DOCK_GAP - cx, q.y * DOCK_GAP * 0.8, -q.u * DOCK_GAP));
  for (const t in slots) slots[t].sort((m, n) => (n.x - m.x) || (m.z - n.z));   // 同艦種依前後排：變陣時每艘船滑到差不多對應的位置
  const halfX = (maxX - minX) / 2 + 8;
  return { slots, R: Math.max(30, Math.hypot(halfX, maxZ + 8)), hx: halfX, hz: maxZ + 8, back: minX - cx };
}

// 船數跟著 comp：多了加入編隊，少了從最後面離開（gr.snap＝直接擺好，不播動畫）
function dockSync(gr, now) {
  const counts = dockCounts(gr), f = gr.f, sig = counts.map((c) => c.join(':')).join(',') + '|' + f.formation + (f.orderly ? ':o' + (f.layers || 1) : '');
  if (sig === gr.laySig) return;
  gr.laySig = sig; gr.lay = dockLayout(gr, counts);   // 只換陣型：船數不變，各艦滑到新位置（dockShipTick 的 dock 狀態）
  const snap = gr.snap; gr.snap = false;
  const add = [], drop = [];
  for (const [t, n] of counts) {
    const live = gr.ships.filter((s) => s.t === t && s.st !== 'out' && s.st !== 'gone');
    for (let i = live.length; i < n; i++) add.push({ t, i });
    for (const s of live) if (s.i >= n) drop.push(s);
  }
  const first = !gr.ships.length, stag = Math.min(first ? 0.09 : 0.14, (first ? 2.6 : 1.8) / Math.max(1, add.length));
  add.forEach((a, k) => gr.ships.push({ ...a, gr, st: snap ? 'dock' : 'in', snap, t0: snap ? now - 9 : now + 0.15 + k * stag, g: null, pos: new THREE.Vector3(), ph: Math.random() * 6, fx0: false }));
  drop.sort((a, b) => b.i - a.i).forEach((s, k) => {
    if (s.st === 'in' && now < s.t0) { s.st = 'gone'; return; }   // 還沒出現就取消
    s.st = 'out'; s.t0 = now + k * Math.min(0.14, 1.5 / drop.length); s.from = s.pos.clone(); s.fx0 = false;
  });
}

// 一艘船：船體＋武器（跟戰場同一套掛點）＋尾焰光
const DOCK_SUPPLY_MAT = {};
function dockMakeShip(t, fac) {
  const mt = t === 'F' ? 1 : t, fk = FAC_KEY[fac] || 'e', key = fk + (mt === SUPPLY_T ? SHIP_TYPES[SUPPLY_T].look : mt);
  const M = getModel(key) || getModel('e' + (mt === SUPPLY_T ? 2 : mt)); if (!M) return null;
  let mat = M.mat;
  if (mt === SUPPLY_T) mat = DOCK_SUPPLY_MAT[key] || (DOCK_SUPPLY_MAT[key] = (() => { const m = M.mat.clone(); m.color = new THREE.Color(0x9fc49a); m.emissiveIntensity = 0.08; return m; })());   // 補給艦：借巡洋艦外觀、偏綠的灰
  const g = new THREE.Group(), body = new THREE.Group(), L = dockLen(t);
  body.add(new THREE.Mesh(M.lods[0], mat));
  if (mt !== SUPPLY_T) for (const m of mountsOf(key)) {
    const W = getModel(fk + 'w' + m.w); if (!W) continue;
    const o = new THREE.Mesh(W.lods[Math.min(1, W.lods.length - 1)], W.mat); setMountObj(o, m); body.add(o);
  }
  const F = FACTION[fac] || FACTION[0];
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
  const gr = s.gr, slot = gr.lay && gr.lay.slots[s.t] && gr.lay.slots[s.t][s.i];
  if (!s.g) { if (now < s.t0 && s.st === 'in') return; s.g = dockMakeShip(s.t, gr.fac); if (!s.g) return; if (s.st !== 'in') s.g.position.copy(s.pos); }
  const { body, glow, L } = s.g.userData, F = FACTION[gr.fac] || FACTION[0];
  const H = gr.head, T = slot ? _dT.copy(slot).applyQuaternion(gr.quat).add(gr.anchor) : _dT.copy(s.pos); T.y += Math.sin(now * 0.9 + s.ph) * L * 0.04;
  if (s.snap) { s.snap = false; s.pos.copy(T); }   // 一開始就在編隊裡
  let face = H, stretch = 1, scale = 1, gl = 0.55 + 0.1 * Math.sin(now * 9 + s.ph), vis = true;
  const p = now - s.t0, warp = DOCK_WARP[s.t];
  if (s.st === 'in') {
    if (p < 0) vis = false;
    else if (warp) {   // 躍傳進入：前方先閃光，船從超空間高速衝出、拉長的船身縮回原形，最後衝擊環
      if (!s.fx0) { s.fx0 = true; dockFx('flash', _dv.copy(T).addScaledVector(H, -L * 0.3), L * 3.2, 0.5, 0xbfdcff); }
      if (p < 0.22) vis = false;
      else {
        const q = Math.min(1, (p - 0.22) / 0.38), k = 1 - easeOutQ(q);
        if (!s.fx1) { s.fx1 = true; const st0 = _dv.copy(T).addScaledVector(H, -300); dockFx('streak', st0, L * 0.12, 0.55, F.glow); const f = DOCK.fx[DOCK.fx.length - 1]; f.o.userData.len = 600; }
        s.pos.copy(T).addScaledVector(H, -k * 520); stretch = 1 + 26 * k * k; gl = 2.5;
        if (q >= 1) { s.st = 'dock'; dockFx('ring', T, L * 1.4, 0.9, F.glow); dockFx('flash', T, L * 2.2, 0.45, 0xffffff); }
      }
    } else {           // 出港：從太空港的機庫口飛出，畫一道弧線進入編隊位置
      const dur = 2.6 + (s.ph % 1) * 0.6, q = Math.min(1, p / dur), u = smooth(q);
      _dP[0].copy(gr.bay); _dP[1].copy(gr.bay).addScaledVector(gr.bayDir, 60).add(_dw.set(0, 18 + s.ph * 3, 0));
      _dP[2].copy(T).addScaledVector(H, -70); _dP[3].copy(T);
      bez3(_dP[0], _dP[1], _dP[2], _dP[3], u, s.pos);
      bez3(_dP[0], _dP[1], _dP[2], _dP[3], Math.min(1, u + 0.01), _dv); face = _dw.copy(_dv).sub(s.pos); if (face.lengthSq() < 1e-6) face = H; else face.normalize();
      scale = Math.min(1, 0.15 + q * 5); gl = 1.8 - q;
      if (q >= 1) s.st = 'dock';
    }
  } else if (s.st === 'dock' || p < 0) {
    s.pos.lerp(T, 1 - Math.exp(-dt * 2.2));   // 編隊重排：慢慢滑到新位置
  } else if (s.st === 'out') {
    if (warp) {   // 躍傳離開：引擎充能，往前拉長衝進超空間
      if (p < 0.8) { gl = 0.6 + p * 3.5; s.pos.copy(s.from).addScaledVector(H, -p * L * 0.15); }
      else {
        const q = Math.min(1, (p - 0.8) / 0.3);
        if (!s.fx0) { s.fx0 = true; dockFx('flash', s.from, L * 2.6, 0.5, 0xffffff); dockFx('streak', _dv.copy(s.from).addScaledVector(H, 300), L * 0.1, 0.6, F.glow); DOCK.fx[DOCK.fx.length - 1].o.userData.len = 600; }
        s.pos.copy(s.from).addScaledVector(H, easeInQ(q) * 700); stretch = 1 + 30 * q * q; gl = 3;
        if (q >= 1) { s.st = 'gone'; dockFx('ring', s.from, L * 1.2, 0.8, F.glow); }
      }
    } else {      // 回港：脫離編隊、繞回太空港的機庫口
      const dur = 2.6, q = Math.min(1, p / dur), u = smooth(q);
      _dP[0].copy(s.from); _dP[1].copy(s.from).addScaledVector(H, 45).add(_dw.set(0, 22, 30));
      _dP[2].copy(gr.bay).addScaledVector(gr.bayDir, 70).add(_dw.set(0, 16, 0)); _dP[3].copy(gr.bay);
      bez3(_dP[0], _dP[1], _dP[2], _dP[3], u, s.pos);
      bez3(_dP[0], _dP[1], _dP[2], _dP[3], Math.min(1, u + 0.01), _dv); face = _dw.copy(_dv).sub(s.pos); if (face.lengthSq() < 1e-6) face = H; else face.normalize();
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
function dockVisible(W = DOCK.W, H = DOCK.H) {   // 機庫（hangar.js）也用
  const q = (sel) => { const e = document.querySelector(sel); return e && e.offsetParent ? e.getBoundingClientRect() : null; };
  let x0 = 0, x1 = W, y0 = 0, y1 = H, sheet = false;
  const top = q('.ld-top'), side = q('.ld-side'), tut = document.body.classList.contains('tut-side') && q('#tut-panel');
  if (top) y0 = Math.min(H * 0.4, top.bottom);
  if (side) { if (side.top > H * 0.35) { y1 = Math.max(y0 + 80, side.top); sheet = true; } else x0 = Math.min(W * 0.6, side.right); }
  if (tut && tut.left > W * 0.4) x1 = Math.max(x0 + 120, tut.left);
  const vw = x1 - x0, vh = y1 - y0;
  return { sheet, ox: W / 2 - (x0 + x1) / 2, oy: H / 2 - (y0 + y1) / 2, fit: Math.max(1, Math.min(2.2, 0.92 * Math.max(W / vw, (H / vh) * 0.8))) };
}
function dockFrame() {
  DOCK.raf = 0;
  if (!DOCK.cv || GAME.phase !== 'loadout') { if (DOCK.wrap) DOCK.wrap.hidden = true; return; }   // 離開編成畫面就停
  DOCK.raf = requestAnimationFrame(dockFrame);
  dockStep();
}
// 各艦隊繞著太空港排成一圈、艦首朝外（並排，看得出橫陣、凹形陣這些陣型的寬度）。鏡頭從圈外、艦隊斜前方看過去，
// 太空港和其他艦隊就在牠後面當背景；換艦隊＝鏡頭沿著圓周運鏡過去
const DOCK_UP = new THREE.Vector3(0, 1, 0), DOCK_ST = new THREE.Vector3(0, 50, 0);
function dockPlace(dt) {
  const L = DOCK.groups.filter((g) => !g.leaving && g.lay);
  // 平均排滿一圈：從任何一支看過去，對面（圈的另一邊）的艦隊都在背景裡
  const gap = L.map((g, k) => (k ? L[k - 1].lay.hz + g.lay.hz + 40 : 0)), arc = gap.reduce((x, y) => x + y, 0) + (L.length > 1 ? L[L.length - 1].lay.hz + L[0].lay.hz + 40 : 0);
  const RcT = Math.max(150, 100 + Math.max(0, ...L.map((g) => g.lay.hx)), arc / (Math.PI * 2)), k1 = 1 - Math.exp(-dt * 2);   // 圈要大到艦隊尾巴碰不到太空港
  DOCK.Rc = DOCK.Rc ? DOCK.Rc + (RcT - DOCK.Rc) * k1 : RcT;
  let th = 0;
  L.forEach((gr, k) => {
    th += arc ? gap[k] / arc * Math.PI * 2 : 0; gr.thT = th;
    if (!gr.placed) { gr.th = th; gr.placed = true; } else gr.th += (th - gr.th) * k1;
  });
  for (const gr of DOCK.groups) {
    if (gr.leaving) continue;   // 離開中的艦隊留在原地
    gr.anchor.set(Math.sin(gr.th) * DOCK.Rc, 0, Math.cos(gr.th) * DOCK.Rc);
    gr.quat.setFromAxisAngle(DOCK_UP, gr.th - Math.PI / 2); gr.head.copy(DOCK_HEAD).applyQuaternion(gr.quat);
    const out = _dTag.set(gr.anchor.x, 0, gr.anchor.z).normalize();   // 太空港 → 艦隊
    gr.bay.copy(DOCK_ST).addScaledVector(out, 55).y -= 35; gr.bayDir.copy(out);
  }
  if (DOCK.station) DOCK.station.position.copy(DOCK_ST);
}
const _dTag = new THREE.Vector3();
function dockTags() {
  const C = DOCK.cam;
  for (const gr of DOCK.groups) {
    const tg = gr.tag; if (!tg) continue;
    const fl = gr.ships.find((s) => s.t === 'F' && s.g);
    if (fl) _dTag.copy(fl.pos).y += fl.g.userData.L * 0.3; else if (gr.lay) _dTag.copy(gr.anchor).y += dockLen(SUPPLY_T) * 0.7; else { tg.hidden = true; continue; }
    _dTag.project(C);
    const on = gr === DOCK.focus, vis = _dTag.z < 1 && Math.abs(_dTag.x) < 1.05 && Math.abs(_dTag.y) < 1.05;
    tg.hidden = !vis; if (!vis) continue;
    tg.style.transform = `translate(${((_dTag.x + 1) / 2 * DOCK.W).toFixed(1)}px, ${((1 - _dTag.y) / 2 * DOCK.H).toFixed(1)}px) translate(-50%, -100%)`;
    const txt = (gr.sup ? '' : '★ ') + gr.name;
    if (tg.textContent !== txt) tg.textContent = txt;
    tg.classList.toggle('on', on); tg.title = on ? (gr.sup ? '' : '旗艦') : '點一下切換到這支艦隊';
  }
}
function dockStep() {
  const now = dockNow(), dt = Math.min(0.1, now - DOCK.tPrev); DOCK.tPrev = now;
  if (!DOCK.W) return;
  for (const gr of DOCK.groups) dockSync(gr, now);
  dockPlace(dt);
  for (const gr of DOCK.groups) {
    for (const s of gr.ships) dockShipTick(s, now, dt);
    gr.ships = gr.ships.filter((s) => { if (s.st === 'gone') { if (s.g) DOCK.scene.remove(s.g); dockTrail(s, false); return false; } return true; });
  }
  DOCK.groups = DOCK.groups.filter((g) => { if (g.leaving && !g.ships.length) { dockDropGroup(g); return false; } return true; });
  dockFxTick(now);
  if (DOCK.station) {
    DOCK.station.rotation.y = now * 0.02;
    for (const c of DOCK.station.children) if (c.isSprite) c.material.opacity = 0.35 + 0.65 * (Math.sin(now * 2.2 + c.userData.ph * 1.7) > 0.6 ? 1 : 0.2);
  }
  // 鏡頭：繞著目前選的艦隊慢慢左右擺，拖曳後停一下再繼續；換艦隊時運鏡過去
  const O = DOCK.orb, Fg = DOCK.focus && DOCK.focus.lay ? DOCK.focus : null, R = Fg ? Fg.lay.R : 40;
  const thT = Fg ? Fg.th : 0;
  DOCK.focTh = DOCK.focTh == null ? thT : DOCK.focTh + (thT - DOCK.focTh) * (1 - Math.exp(-dt * 2.4));
  const Fc = _dTag.set(Math.sin(DOCK.focTh) * DOCK.Rc, 0, Math.cos(DOCK.focTh) * DOCK.Rc), yaw = O.yaw + DOCK.focTh;
  const idle = now - O.user > 5;
  O.yaw = idle ? O.base + 0.16 * Math.sin((now - O.user) * 0.07) : O.base;
  O.dist += (Math.max(R * 1.2 + 18, DOCK.groups.length > 1 ? 85 : 0) - O.dist) * (1 - Math.exp(-dt * 2));   // 小艦隊也別貼太近，才看得到周圍
  const C = DOCK.cam, cp = Math.cos(O.pitch);
  // 介面擋住的地方不算：艦隊放在剩下可見區域的中間，區域越小鏡頭拉越遠
  const V = dockVisible();
  O.fit += (V.fit - O.fit) * (1 - Math.exp(-dt * 3));
  const dist = O.dist * O.fit, hy = O.dist * 0.1;
  C.position.set(Fc.x + Math.sin(yaw) * cp * dist, Fc.y + Math.sin(O.pitch) * dist + hy, Fc.z + Math.cos(yaw) * cp * dist);
  // 有其他艦隊時視線往圈內（太空港）偏一點：選到的艦隊在前景偏下，後面的太空港和其他艦隊進到畫面裡
  const lk = DOCK.groups.length > 1 ? Math.min(DOCK.Rc * 0.4, R * 0.45) * (V.sheet ? 0.3 : 1) : 0,   // 手機（下方面板）可見區太矮，少偏一點
    Ln = Math.hypot(Fc.x, Fc.z) || 1;
  C.lookAt(Fc.x - Fc.x / Ln * lk, Fc.y + hy, Fc.z - Fc.z / Ln * lk);
  C.setViewOffset(DOCK.W, DOCK.H, V.ox, V.oy, DOCK.W, DOCK.H);
  C.updateMatrixWorld();
  DOCK.sky.position.copy(C.position);
  dockTags();
  const cap = gEl('ld-cap'); if (cap) { const t = `${DOCK_NAME[DOCK.fac] || DOCK_NAME[0]}・每艘模型＝${fmtN((Fg ? Fg.unit : 10) * opts.rep)} 艘・★＝旗艦・拖曳背景可轉動視角`; if (cap.textContent !== t) cap.textContent = t; }
  DOCK.r.render(DOCK.scene, C);
}
