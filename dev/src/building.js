// ═══════════════════════ 建築編輯器：GLB 建築對位＋自訂近地地圖 ═══════════════════════
// 資料在伺服器 models/建築/buildings.json（GET／PUT api/buildings）；GLB 也放在 models/建築/（PUT api/buildings/glb?name=…）
//   types[id] ＝ 建築種類（模型對位）：{ name, file GLB 檔名, h 高度（單位，1 單位＝200 公尺）, rot 朝向修正（度）, oy 垂直位移（單位）, lum 亮度,
//                 hp 耐久, coll 碰撞 'pil' 柱體｜'box' 方塊｜'none' 裝飾, r 柱體半徑, top 碰撞高度（離地，單位）, fw／fd 模型底面的寬／深（依 h 自動量） }
//   maps[id]  ＝ 自訂地圖：{ id, name, scene 基底場景（GROUND_SCENES）, seed 地形種子, def 砲台屬於哪一方（-1 沒有）, keep 保留原本的巨型結構,
//                 items: [{ t 種類 id, x, z, rot 角度（度）, s 縮放 }] }
// 作戰：battleSetup.ground.cmap＝地圖的完整快照（種類的數值一起帶上，回放與多人不必再查伺服器）；groundGen 呼叫 bldApplyMap 放建築，
//   有碰撞的建築＝巨型結構（擋移動、擋射線、可以被打壞倒塌），沒有碰撞的＝裝飾
// 編輯器（主選單「建築編輯器」）：用遊戲本身的 3D 近地場景；右邊面板分「地圖擺放」與「建築種類」兩頁
const BLD = { data: { types: {}, maps: {} }, files: [], canEdit: false, loaded: false, err: '', cache: {} };
const BLD_DEG = Math.PI / 180;
const bldId = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
const bldKm = (u) => Math.round(u * GROUND_KM * 100) / 100;   // 單位 → 公里（顯示用）

async function bldLoad() {
  if (!window.API) { BLD.err = '沒有連上伺服器'; return; }
  try {
    const j = await API.get('api/buildings');
    BLD.data = { types: j.types || {}, maps: j.maps || {} }; BLD.files = j.files || []; BLD.canEdit = !!j.canEdit; BLD.loaded = true; BLD.err = '';
    bldEnvSync();
  } catch (e) { BLD.err = e.message; }
}
async function bldSave() {
  await API.put('api/buildings', { types: BLD.data.types, maps: BLD.data.maps });
  BE.dirty = false; bldEnvSync();
}
// 隨機戰役、王牌飛行員、模擬室的「戰場」選項：內建場景之後接著列出自訂地圖
function bldEnvSync() {
  for (let i = GROUND_ENV.length - 1; i >= 0; i--) if (String(GROUND_ENV[i].g).startsWith('map:')) GROUND_ENV.splice(i, 1);
  for (const M of bldMapList()) GROUND_ENV.push({ name: `自訂：${M.name}`, g: 'map:' + M.id });
}
function bldMapList() { return Object.values(BLD.data.maps).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant')); }
function bldMapOf(g) { return typeof g === 'string' && g.startsWith('map:') ? BLD.data.maps[g.slice(4)] || null : null; }
function bldFileV(file) { const f = BLD.files.find((o) => o.file === file); return f ? f.mtime : 0; }
// 地圖 → 作戰用的快照（每一棟帶著自己種類的數值）
function bldSnapshot(M) {
  return { id: M.id, name: M.name, keep: !!M.keep, items: (M.items || []).map((it) => {
    const T = BLD.data.types[it.t]; if (!T || !T.file) return null;
    return { name: T.name, file: T.file, v: bldFileV(T.file), h: T.h, rot: (T.rot || 0) + (it.rot || 0), oy: T.oy || 0, lum: T.lum || 1, hp: T.hp || 1000, coll: T.coll || 'pil', fall: T.fall || null,
      r: T.r, top: T.top, fw: T.fw, fd: T.fd, x: it.x, z: it.z, s: it.s || 1 };
  }).filter(Boolean) };
}
function bldHash(o) { const s = JSON.stringify(o); let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }

// ───── 套用到地形資料（groundGen 裡呼叫，必須是決定性的：只用快照裡的數字）─────
// 底面外框：模型底面（fw × fd）轉 rot 之後的軸向外框
function bldFoot(it) {
  const s = it.s || 1, a = (it.rot || 0) * BLD_DEG, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
  const fw = (it.fw || 2 * (it.r || 5)) * s, fd = (it.fd || 2 * (it.r || 5)) * s;
  return { w: fw * ca + fd * sa, d: fw * sa + fd * ca, r: (it.r || Math.max(fw, fd) / 2 / s) * s, top: (it.top || it.h) * s, h: it.h * s };
}
function bldApplyMap(D, C) {
  if (!C.keep) {   // 拿掉原本的巨型結構（零件、碰撞、電梯纜繩），也拿掉站在它們上面的砲台
    const free = (o) => o.ms == null;
    D.boxes = D.boxes.filter(free); D.cyl = D.cyl.filter(free); D.domes = D.domes.filter(free); D.pil = D.pil.filter(free); D.rocks = D.rocks.filter(free);
    D.ms = []; D.extra.tether = null; D.obst = '';
    if (!D.hf) { const low = (L) => L.filter((p) => p.y < GROUND_Y + 20).map((p) => ({ ...p, y: GROUND_Y })); D.spotsN = low(D.spotsN); D.spotsP = low(D.spotsP); }
  }
  const cnt = {};
  for (const it of C.items) {
    const F = bldFoot(it), y0 = GROUND_Y + (it.oy || 0) * (it.s || 1);
    let ms = null;
    if (it.coll !== 'none') {
      ms = gMs(D, { name: it.name, hp: Math.max(1, it.hp || 1000), fall: it.fall }, it.x, it.z, F.r, GROUND_Y + F.top);
      if (it.coll === 'box') D.boxes.push({ x: it.x, z: it.z, w: F.w, d: F.d, h: F.top, y0: GROUND_Y, col: [0, 0, 0], coll: true, hide: true, ms });
      else D.pil.push({ x: it.x, z: it.z, r: F.r, top: GROUND_Y + F.top, ms });
      cnt[it.name] = (cnt[it.name] || 0) + 1;
    }
    D.glb.push({ file: it.file, v: it.v, x: it.x, z: it.z, y0, rot: (it.rot || 0) * BLD_DEG, h: F.h, lum: it.lum || 1, ms });
    (D.clear || (D.clear = [])).push({ x: it.x, z: it.z, r: Math.max(F.w, F.d) / 2 });   // 底下的一般建築清掉
    const far = Math.max(F.w, F.d) / 2 + 4, away = (p) => Math.hypot(p.x - it.x, p.z - it.z) > far;
    D.spotsN = D.spotsN.filter(away); D.spotsP = D.spotsP.filter(away);
  }
  const names = Object.entries(cnt);
  if (names.length) D.obst = (D.obst ? D.obst + ' ' : '') + `${names.map(([n, k]) => `${n}${k > 1 ? ` ×${k}` : ''}`).join('、')}（自訂建築，可以擊毀）。`;
  if (C.name) D.title = `${C.name}（${GROUND_SCENES[D.scene].name}）`;
}

// ───── GLB 載入與畫面 ─────
// 同一個檔案只下載、解析一次；回傳 { scene, box（模型座標的外框）}
function bldModel(file, v) {
  const k = `${file}?${v || 0}`;
  if (BLD.cache[k]) return BLD.cache[k];
  return (BLD.cache[k] = (async () => {
    const r = await fetch(`models/${encodeURIComponent('建築')}/${encodeURIComponent(file)}?v=${v || 0}`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${file}：HTTP ${r.status}`);
    if (!MODEL_LOAD.loader) MODEL_LOAD.loader = new GLTFLoader();
    const gltf = await MODEL_LOAD.loader.parseAsync(await r.arrayBuffer(), '');
    const sc = gltf.scene; sc.updateMatrixWorld(true);
    sc.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const t of ['map', 'emissiveMap']) if (m && m[t]) { m[t].colorSpace = THREE.SRGBColorSpace; m[t].anisotropy = 4; }
    });
    return { scene: sc, box: new THREE.Box3().setFromObject(sc) };
  })().catch((e) => { delete BLD.cache[k]; throw e; }));
}
// 模型縮放到高度 h、底面中心在原點（旋轉、位置由外層決定）
function bldFit(src, h, matFn) {
  const b = src.box, sy = Math.max(1e-6, b.max.y - b.min.y), o = src.scene.clone(true), w = new THREE.Group();
  o.traverse((c) => { if (c.isMesh) c.material = Array.isArray(c.material) ? c.material.map(matFn) : matFn(c.material); });
  o.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  w.add(o); w.scale.setScalar(h / sy);
  return w;
}
// GLB 的材質 → 近地場景的光照與霧（同一個場景的配色）；cache：原材質 → 新材質
function bldMat(P, m, lum, cache) {
  const k = `${m.uuid}:${lum}`; let o = cache.get(k); if (o) return o;
  const c = m.color || new THREE.Color(1, 1, 1), e = m.emissive || new THREE.Color(0, 0, 0), ei = m.emissiveIntensity != null ? m.emissiveIntensity : 1;
  o = new THREE.ShaderMaterial({
    uniforms: gUni(P, { uMap: { value: m.map || null }, uHas: { value: m.map ? 1 : 0 }, uCol: { value: new THREE.Vector3(c.r, c.g, c.b) }, uEm: { value: m.emissiveMap || null }, uHasEm: { value: m.emissiveMap ? 1 : 0 },
      uEmC: { value: new THREE.Vector3(e.r * ei, e.g * ei, e.b * ei) }, uLum: { value: lum }, uChar: { value: 0 }, uHeat: { value: 0 } }),
    side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GROUND_FOG_GLSL + /* glsl */`
      uniform sampler2D uMap, uEm; uniform float uHas, uHasEm, uLum, uChar, uHeat, uTime; uniform vec3 uCol, uEmC; varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      void main(){
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        vec3 base = uCol * (uHas > .5 ? texture2D(uMap, vUv).rgb : vec3(1.));
        if (uChar > 0.) base = mix(base, vec3(dot(base, vec3(.3, .59, .11))) * vec3(.85, .72, .6) * (.55 + .45 * gn(vW.xz * .7 + vW.y)), uChar);   // 燒焦：褪色成焦黑
        vec3 col = base * (uAmb * (1.1 + .4 * N.y) + uLSun * max(dot(N, uSun), 0.) * 1.2) * uLum;
        if (uHasEm > .5) col += texture2D(uEm, vUv).rgb * uEmC; else col += uEmC * base;
        col += gHeat(vW, uHeat, uTime);
        gl_FragColor = vec4(fogMix(col, vW), 1.);
      }`,
  });
  cache.set(k, o); return o;
}
// 作戰場景（groundSync）：每一棟掛在自己的巨型結構群組上（倒塌時一起沉下去）；裝飾掛在獨立的群組
function bldGroundModels(P, D) {
  const key = GV.key, mats = new Map();
  for (const g of D.glb) {
    let grp = g.ms != null ? GV.ms[g.ms] : null;
    if (!grp) { const M = g.ms != null ? D.ms[g.ms] : g; grp = new THREE.Group(); grp.position.set(M.x, GROUND_Y, M.z); GV.group.add(grp); if (g.ms != null) GV.ms[g.ms] = grp; }
    const hold = new THREE.Group(); hold.position.set(g.x - grp.position.x, g.y0 - GROUND_Y, g.z - grp.position.z); hold.rotation.y = g.rot; grp.add(hold);
    bldModel(g.file, g.v).then((src) => {
      if (GV.key !== key || !GV.group) return;
      hold.add(bldFit(src, g.h, (m) => { const o = bldMat(P, m, g.lum, mats); if (!GV.mats.includes(o)) GV.mats.push(o); return o; }));
    }).catch((e) => console.warn('建築模型載入失敗', e.message));
  }
}

// ═════ 編輯器 ═════
// tab：'map' 地圖擺放｜'type' 建築種類；mapId／typeId：目前的地圖、種類；sel：選取中的建築（items 的序號）；brush：點地圖就放這個種類
const BE = { tab: 'map', mapId: null, typeId: null, sel: -1, brush: null, drag: null, group: null, objs: [], mats: new Map(), baseKey: '', showColl: true, dirty: false, hidden: [], busy: '', ring: null, plane: null };
const BE_SCENE_DEF = { city: 1, harbor: 1, base: 1, elevator: 1, mountain: 1 };
function bldCur() { return BLD.data.maps[BE.mapId] || null; }
function bldNewMap(scene = 'city') {
  const id = bldId('m'), n = Object.keys(BLD.data.maps).length + 1;
  BLD.data.maps[id] = { id, name: `自訂地圖 ${n}`, scene, seed: ((Math.random() * 1e6) | 0) + 1, def: BE_SCENE_DEF[scene], keep: false, items: [] };
  BE.mapId = id; BE.sel = -1; BE.dirty = true;
  return BLD.data.maps[id];
}
function bldNewType(file) {
  const id = bldId('t');
  BLD.data.types[id] = { name: file ? file.replace(/\.glb$/i, '').replace(/_?設計圖$/, '') : '新建築', file: file || '', h: 40, rot: 0, oy: 0, lum: 1, hp: 1400, coll: 'pil', r: 6, top: 40, fw: 12, fd: 12 };
  BE.typeId = id; BE.dirty = true;
  if (file) bldMeasure(BLD.data.types[id], true);
  return BLD.data.types[id];
}
// 依模型的外框量底面（fw／fd）；full＝連柱體半徑、碰撞高度一起重設
async function bldMeasure(T, full) {
  if (!T.file) return;
  try {
    const { box } = await bldModel(T.file, bldFileV(T.file)), sy = Math.max(1e-6, box.max.y - box.min.y), k = T.h / sy;
    T.fw = Math.round((box.max.x - box.min.x) * k * 100) / 100; T.fd = Math.round((box.max.z - box.min.z) * k * 100) / 100;
    if (full) { T.r = Math.round(Math.max(T.fw, T.fd) / 2 * 0.8 * 10) / 10; T.top = T.h; }
    bldSyncObjs(); bldRender();
  } catch (e) { toast('讀不到模型：' + e.message); }
}

async function showBldEditor() {
  overlay(null); setPhase('bldedit'); GAME.replaying = false; GAME.result = null; GAME.sc = null; GAME.playerSide = 0;
  if (!mode3D) { setRenderMode('3d', false); GAME.forced3D = true; }
  BE.busy = '讀取建築資料…'; bldRender();
  if (!BLD.loaded) await bldLoad();
  BE.busy = '';
  if (GAME.phase !== 'bldedit') return;
  if (!BLD.loaded) { bldRender(); return; }
  if (!bldCur()) BE.mapId = (bldMapList()[0] || {}).id || null;
  if (!bldCur()) { bldNewMap(); BE.dirty = false; }
  bldBase(true);
  camAnim = null; view.target.set(0, GROUND_Y, 0); view.height = 320; view.yaw = 0; view.pitch = 0.55; updateCamera();
  bldRender();
}
function bldLeave() {   // setPhase 離開編輯器時：還原被藏起來的一般建築、鏡頭回到艦隊平面
  bldUnhide();
  if (BE.group) BE.group.visible = false;
  BE.drag = null; BE.brush = null;
  view.target.y = 0;
}
// 基底場景：用正式的近地場景（沒有艦隊）；同一個場景＋種子＋保留設定只建一次
function bldBase(force) {
  const M = bldCur(); if (!M) return;
  const g = { scene: M.scene, seed: M.seed >>> 0, def: M.def, cmap: { keep: !!M.keep, items: [] } }, k = groundKey(g) + ':' + M.def;
  if (force || BE.baseKey !== k || !GRD) {
    bldUnhide(); BE.baseKey = k;
    BE.busy = '產生地形…'; bldRender();
    newBattle(1, { bg: false, scenario: 'bldedit', level: 1, factions: [0, 1], timeLimit: SIM_INF, noVictory: true, terrain: [], fleets: [], ground: g });
    paused = true; updateTimeUI(); BE.busy = '';
  }
  bldSyncObjs();
}
// 編輯器裡的建築：直接擺物件（移動時不必重新產生地形），碰撞範圍畫線框
function bldSyncObjs() {
  if (!BE.group) { BE.group = new THREE.Group(); scene.add(BE.group); }
  BE.group.visible = GAME.phase === 'bldedit';
  for (const o of BE.group.children.slice()) { BE.group.remove(o); o.traverse((c) => { if (c.isLineSegments || c.userData.own) { c.geometry.dispose(); c.material.dispose(); } }); }
  for (const m of BE.mats.values()) m.dispose(); BE.mats.clear();
  const M = bldCur(); BE.objs = [];
  if (!M || !GRD) return;
  const P = GRD.S.pal;
  M.items.forEach((it, i) => BE.objs.push(bldObj(it, i, P)));
  if (BE.tab === 'type' && BE.typeId && BLD.data.types[BE.typeId]) BE.objs.push(bldObj({ t: BE.typeId, x: BE.pv ? BE.pv.x : 0, z: BE.pv ? BE.pv.z : 0, rot: 0, s: 1 }, -2, P));   // 種類的預覽
  // 選取框、艦隊平面（10 公里高的參考圓盤）
  BE.ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, k) => new THREE.Vector3(Math.cos(k / 64 * TAU), 0, Math.sin(k / 64 * TAU)))), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
  BE.ring.userData.own = true; BE.ring.renderOrder = 10; BE.group.add(BE.ring);
  BE.plane = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  BE.plane.userData.own = true; BE.plane.renderOrder = 9; BE.group.add(BE.plane);
  bldMarkSel(); bldHideUnder();
}
function bldObj(it, i, P) {
  const T = BLD.data.types[it.t], root = new THREE.Group(); root.userData.i = i;
  BE.group.add(root);
  if (!T) return root;
  const s = it.s || 1, F = bldFoot({ ...T, rot: (T.rot || 0) + (it.rot || 0), s });
  root.position.set(it.x, GROUND_Y + (T.oy || 0) * s, it.z); root.rotation.y = ((T.rot || 0) + (it.rot || 0)) * BLD_DEG;
  // 載入中：先畫底面大小的線框
  const tmp = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry((T.fw || 10) * s, F.h, (T.fd || 10) * s).translate(0, F.h / 2, 0)), new THREE.LineBasicMaterial({ color: 0x9aa4b8, transparent: true, opacity: 0.6 }));
  root.add(tmp);
  if (T.file) bldModel(T.file, bldFileV(T.file)).then((src) => { if (root.parent !== BE.group) return; root.remove(tmp); tmp.geometry.dispose(); root.add(bldFit(src, F.h, (m) => bldMat(P, m, T.lum || 1, BE.mats))); })
    .catch(() => tmp.material.color.set(0xff6a5a));
  // 碰撞範圍（世界座標：柱體＝直立圓柱、方塊＝軸向外框）
  if (T.coll !== 'none') {
    const geo = T.coll === 'box' ? new THREE.BoxGeometry(F.w, F.top, F.d) : new THREE.CylinderGeometry(F.r, F.r, F.top, 32, 1, true);
    const c = new THREE.LineSegments(new THREE.EdgesGeometry(geo.translate(0, F.top / 2, 0), 1), new THREE.LineBasicMaterial({ color: 0xffc34d, transparent: true, opacity: 0.55, depthTest: false }));
    geo.dispose(); c.position.set(it.x, GROUND_Y, it.z); c.visible = BE.showColl; c.renderOrder = 8; BE.group.add(c); root.userData.coll = c;
  }
  return root;
}
function bldItemAt(i) { const M = bldCur(); return i === -2 ? (BE.pv || null) : M && M.items[i]; }
function bldMarkSel() {
  if (!BE.ring) return;
  const it = BE.sel >= 0 ? bldItemAt(BE.sel) : BE.tab === 'type' ? BE.pv : null, T = it && BLD.data.types[it.t || BE.typeId];
  BE.ring.visible = BE.plane.visible = !!(it && T);
  if (!it || !T) return;
  const F = bldFoot({ ...T, rot: (T.rot || 0) + (it.rot || 0), s: it.s || 1 }), r = Math.max(F.w, F.d) / 2 + 3;
  BE.ring.position.set(it.x, GROUND_Y + 0.4, it.z); BE.ring.scale.set(r, 1, r);
  BE.plane.position.set(it.x, 0, it.z); BE.plane.scale.setScalar(Math.max(30, r * 2.5));
}
// 移動中：只搬物件，不重建
function bldMoveObj(i) {
  const it = bldItemAt(i), o = BE.objs.find((r) => r.userData.i === i), T = it && BLD.data.types[it.t || BE.typeId]; if (!o || !T) return;
  const s = it.s || 1;
  o.position.set(it.x, GROUND_Y + (T.oy || 0) * s, it.z); o.rotation.y = ((T.rot || 0) + (it.rot || 0)) * BLD_DEG;
  if (o.userData.coll) o.userData.coll.position.set(it.x, GROUND_Y, it.z);
  bldMarkSel();
}
// 建築底下的一般大樓先藏起來（作戰時 groundGen 會真的清掉）
function bldUnhide() {
  const B = GV.bld;
  if (B && BE.hidden.length) { for (const [i, h] of BE.hidden) B.iB[i * 4] = h; B.mesh.geometry.attributes.iB.needsUpdate = true; }
  BE.hidden = [];
}
function bldHideUnder() {
  bldUnhide();
  const B = GV.bld, M = bldCur(); if (!B || !M) return;
  for (const it of M.items) {
    const T = BLD.data.types[it.t]; if (!T) continue;
    const F = bldFoot({ ...T, rot: (T.rot || 0) + (it.rot || 0), s: it.s || 1 });
    groundBldEach(it.x, it.z, Math.max(F.w, F.d) / 2, -1e9, 1e9, (i) => { BE.hidden.push([i, B.iB[i * 4]]); B.iB[i * 4] = 0; });
  }
  B.mesh.geometry.attributes.iB.needsUpdate = true;
}
function bldChanged(objs = true) { BE.dirty = true; if (objs) bldSyncObjs(); else { bldMarkSel(); bldHideUnder(); } bldRender(); }
function bldSelect(i) { BE.sel = i; bldMarkSel(); bldRender(); }
function bldPillars() { const M = bldCur(); return M ? M.items.filter((it) => BLD.data.types[it.t] && (BLD.data.types[it.t].coll || 'pil') === 'pil').length + (M.keep && GRD ? GRD.pil.length : 0) : 0; }

// ───── 面板 ─────
const bldN = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
function bldRender() {
  const el = gEl('bldbar'); if (!el) return;
  const head = `<div class="sim-head"><b>建築編輯器</b><span class="g-sp"></span>${BE.dirty ? '<span class="bld-dirty">未儲存</span>' : ''}
    <button class="g-btn sm" id="be-exit">離開</button><button class="g-btn sm pri" id="be-save" ${BLD.canEdit ? '' : 'disabled'}>儲存</button></div>
    ${BLD.loaded && !BLD.canEdit ? '<div class="sim-mid">這台電腦不能存建築（伺服器 config.json 的 modelEdit）。可以看、可以試擺，但不能儲存或匯入 GLB。</div>' : ''}`;
  if (BE.busy || !BLD.loaded) { el.innerHTML = head + `<div class="sim-sec g-dim">${BE.busy || '讀不到建築資料：' + escH(BLD.err)}</div>`; bldBind(el); return; }
  el.innerHTML = head + `<div class="wed-seg sim-tabs" id="be-tabs"><button data-tab="map" class="${BE.tab === 'map' ? 'on' : ''}">地圖擺放</button><button data-tab="type" class="${BE.tab === 'type' ? 'on' : ''}">建築種類（模型對位）</button></div>
    ${BE.tab === 'type' ? bldTypeHtml() : bldMapHtml()}`;
  bldBind(el);
}
function bldMapHtml() {
  const M = bldCur(), types = Object.entries(BLD.data.types), pil = bldPillars();
  if (!M) return '<div class="sim-sec g-dim">沒有地圖。</div>';
  const it = BE.sel >= 0 ? M.items[BE.sel] : null, T = it && BLD.data.types[it.t];
  return `<div class="sim-sec">
      <div class="sim-row"><span>地圖</span><select class="g-in g-sel" id="be-map" style="flex:1">${bldMapList().map((m) => `<option value="${m.id}" ${m.id === M.id ? 'selected' : ''}>${escH(m.name)}</option>`).join('')}</select>
        <button class="g-btn sm" id="be-mnew">新增</button><button class="g-btn sm" id="be-mdup">複製</button><button class="g-btn sm" id="be-mdel">刪除</button></div>
      <div class="sim-row"><span>名稱</span><input class="g-in" id="be-mname" maxlength="30" value="${escH(M.name)}"></div>
      <div class="sim-row"><span>基底場景</span><div class="wed-seg" id="be-scene">${GROUND_KEYS.map((k) => `<button data-v="${k}" class="${M.scene === k ? 'on' : ''}">${GROUND_SCENES[k].name}</button>`).join('')}</div></div>
      <div class="sim-row"><span>地形種子</span><input class="g-in" type="number" id="be-seed" value="${M.seed}" style="width:110px"><button class="g-btn sm" id="be-reseed">換一個</button></div>
      <div class="sim-row"><span>地面砲台</span><div class="wed-seg" id="be-def"><button data-v="-1" class="${M.def === -1 ? 'on' : ''}">沒有</button><button data-v="0" class="${M.def === 0 ? 'on' : ''}">我方</button><button data-v="1" class="${M.def === 1 ? 'on' : ''}">敵方</button></div></div>
      <div class="sim-row"><span>原有結構</span><label><input type="checkbox" id="be-keep" ${M.keep ? 'checked' : ''}> 保留場景原本的巨型結構（生態巨塔、船塢…）</label></div>
      <div class="g-dim sim-note">一般大樓、街道、山照種子自動產生；自訂建築底下的大樓會清掉。隨機戰役、模擬室、王牌飛行員的「戰場」選項會列出「自訂：${escH(M.name)}」（砲台照各模式的規則）。</div>
      <div class="sim-btns" style="margin-top:6px"><button class="g-btn sm" id="be-try">在模擬室試打</button></div></div>
    <div class="sim-sec"><div class="sim-h"><span>放置建築</span><span class="g-sp"></span><span class="${pil > PIL_MAX ? 'g-ec' : 'g-dim'}">柱體障礙 ${pil}／${PIL_MAX}</span></div>
      ${types.length ? `<div class="sim-btns">${types.map(([id, t]) => `<button class="g-btn sm ${BE.brush === id ? 'pri' : ''}" data-brush="${id}" title="點一下，再到地圖上點位置放置（右鍵取消）">${escH(t.name)}</button>`).join('')}</div>
        <div class="g-dim" style="font-size:calc(11.5px * var(--ui));margin-top:4px">${BE.brush ? `放置中：<b>${escH(BLD.data.types[BE.brush].name)}</b>，在地圖上左鍵點位置（可連續放），右鍵或 Esc 結束。` : '點一個種類，再到地圖上點位置。'}</div>`
        : '<div class="g-dim">還沒有建築種類：先到「建築種類」頁匯入 GLB、調整大小。</div>'}
      ${pil > PIL_MAX ? `<div class="g-ec" style="font-size:calc(11.5px * var(--ui))">柱體障礙超過 ${PIL_MAX} 個：多出來的在 3D 畫面上船會穿過去（碰撞計算還是有效）。可以把小建築的碰撞改成「方塊」。</div>` : ''}</div>
    <div class="sim-sec"><div class="sim-h"><span>這張地圖的建築</span><span class="g-dim">${M.items.length} 棟</span><span class="g-sp"></span><label class="g-dim"><input type="checkbox" id="be-coll" ${BE.showColl ? 'checked' : ''}> 顯示碰撞範圍</label></div>
      <div class="bld-list">${M.items.map((o, i) => { const t = BLD.data.types[o.t]; return `<button class="sim-it ${BE.sel === i ? 'on' : ''}" data-it="${i}"><b>${t ? escH(t.name) : '（種類已刪除）'}</b><small>(${Math.round(o.x)}, ${Math.round(o.z)})・${Math.round(o.rot || 0)}°${(o.s || 1) !== 1 ? `・×${o.s}` : ''}</small></button>`; }).join('') || '<span class="g-dim">（還沒有建築）</span>'}</div></div>
    ${it ? `<div class="sim-sec"><div class="sim-h"><b>${T ? escH(T.name) : '（種類已刪除）'}</b><span class="g-sp"></span><button class="g-btn sm" id="be-dup">複製</button><button class="g-btn sm" id="be-del">刪除</button></div>
      <div class="sim-row"><span>種類</span><select class="g-in g-sel" id="be-itype" style="flex:1">${types.map(([id, t]) => `<option value="${id}" ${id === it.t ? 'selected' : ''}>${escH(t.name)}</option>`).join('')}</select></div>
      <div class="sim-comp"><label>X<input class="g-in" type="number" step="5" data-ik="x" value="${Math.round(it.x)}"></label><label>Z<input class="g-in" type="number" step="5" data-ik="z" value="${Math.round(it.z)}"></label>
        <label>角度（度）<input class="g-in" type="number" step="15" data-ik="rot" value="${Math.round(it.rot || 0)}"></label><label>縮放<input class="g-in" type="number" step="0.1" min="0.1" max="10" data-ik="s" value="${it.s || 1}"></label></div>
      ${T ? `<div class="g-dim" style="font-size:calc(11.5px * var(--ui))">高 ${bldKm(T.h * (it.s || 1))} 公里・耐久 ${T.hp}・${{ pil: '柱體碰撞', box: '方塊碰撞', none: '裝飾（沒有碰撞、不會被打壞）' }[T.coll || 'pil']}</div>` : ''}</div>` : ''}
    <div class="sim-help g-dim">地圖：左鍵點建築＝選取、拖曳＝移動；右鍵點＝把選取的建築搬到那裡（按住拖曳＝朝向）；R／Shift+R＝轉 15°；Delete＝刪除；中鍵拖曳＝移動鏡頭、滾輪＝縮放、右鍵拖曳空地＝轉鏡頭</div>`;
}
function bldTypeHtml() {
  const types = Object.entries(BLD.data.types), T = BLD.data.types[BE.typeId];
  const files = BLD.files.slice().sort((a, b) => a.file.localeCompare(b.file, 'zh-Hant'));
  const used = T ? Object.values(BLD.data.maps).reduce((n, m) => n + m.items.filter((o) => o.t === BE.typeId).length, 0) : 0;
  const through = T ? GROUND_Y + T.h > 0 : false;
  return `<div class="sim-sec"><div class="sim-h"><span>建築種類</span><span class="g-sp"></span><button class="g-btn sm" id="be-tnew">＋ 新增種類</button></div>
      ${types.map(([id, t]) => `<button class="sim-it ${id === BE.typeId ? 'on' : ''}" data-ty="${id}"><b>${escH(t.name)}</b><small>${escH(t.file || '（沒有模型）')}・高 ${bldKm(t.h)} 公里・耐久 ${t.hp}</small></button>`).join('') || '<span class="g-dim">（還沒有建築種類）</span>'}</div>
    <div class="sim-sec"><div class="sim-h"><span>GLB 檔案</span><span class="g-dim">models/建築/</span><span class="g-sp"></span>
        <label class="g-btn sm ${BLD.canEdit ? '' : 'disabled'}" title="可以一次選好幾個">匯入 GLB…<input type="file" id="be-up" accept=".glb" multiple hidden ${BLD.canEdit ? '' : 'disabled'}></label></div>
      ${files.length ? files.map((f) => `<div class="sim-file"><b>${escH(f.file)}</b><small class="g-dim">${(f.bytes / 1048576).toFixed(1)} MB・${new Date(f.mtime).toLocaleString('zh-TW', { hour12: false })}</small><span class="g-sp"></span><button class="g-btn sm" data-fnew="${escH(f.file)}">用這個新增種類</button></div>`).join('') : '<div class="g-dim">資料夾裡還沒有 GLB。按「匯入 GLB…」上傳（例如 TRIPO 匯出的建築）。</div>'}</div>
    ${T ? `<div class="sim-sec"><div class="sim-h"><b>${escH(T.name)}</b><span class="g-dim">${used ? `用在 ${used} 棟` : '還沒用到'}</span><span class="g-sp"></span><button class="g-btn sm" id="be-tdel">刪除種類</button></div>
      <div class="sim-row"><span>名稱</span><input class="g-in" data-tk="name" maxlength="20" value="${escH(T.name)}"></div>
      <div class="sim-row"><span>模型</span><select class="g-in g-sel" data-tk="file" style="flex:1"><option value="">（沒有）</option>${files.map((f) => `<option value="${escH(f.file)}" ${f.file === T.file ? 'selected' : ''}>${escH(f.file)}</option>`).join('')}</select></div>
      <div class="sim-sub">大小與朝向</div>
      <div class="sim-comp"><label>高度（公里）<input class="g-in" type="number" step="0.5" min="0.1" data-tk="h" value="${bldKm(T.h)}"></label>
        <label>朝向修正（度）<input class="g-in" type="number" step="90" data-tk="rot" value="${Math.round(T.rot || 0)}"></label>
        <label>垂直位移（公里）<input class="g-in" type="number" step="0.1" data-tk="oy" value="${bldKm(T.oy || 0)}"></label>
        <label>亮度<input class="g-in" type="number" step="0.1" min="0.1" max="5" data-tk="lum" value="${T.lum || 1}"></label></div>
      <div class="g-dim" style="font-size:calc(11.5px * var(--ui))">底面約 ${bldKm(T.fw || 0)} × ${bldKm(T.fd || 0)} 公里。參考：戰列艦約 1 公里長；艦隊平面離地 ${bldKm(-GROUND_Y)} 公里（藍色圓盤）${through ? '——<b>這棟會穿過艦隊平面</b>' : '，這棟比艦隊平面低（只擋低空）'}。</div>
      <div class="sim-sub">碰撞與耐久</div>
      <div class="sim-row"><span>碰撞</span><div class="wed-seg" id="be-tcoll">${[['pil', '柱體'], ['box', '方塊'], ['none', '沒有（裝飾）']].map(([k, n]) => `<button data-v="${k}" class="${(T.coll || 'pil') === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="g-dim sim-note">柱體＝直立圓柱（細高的塔）；方塊＝底面外框壓進地形高度（矮胖的堡壘、船塢）；裝飾＝只是畫面。</div>
      ${(T.coll || 'pil') !== 'none' ? `<div class="sim-row"><span>倒塌方式</span><div class="wed-seg" id="be-tfall">${Object.entries(CL_KIND_NAME).map(([k, n]) => `<button data-v="${k}" class="${(T.fall || 'auto') === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="g-dim sim-note">被摧毀時怎麼倒：高樓＝整棟倒下／逐層壓垮／上段斷落／歪斜；鋼架＝骨牌式壓平／屋頂凹陷／燒成骨架；武器＝砲塔頭炸飛／炸成碎塊／熔毀；穹頂＝塌陷／炸開；長牆＝崩開缺口；矮胖＝半邊塌掉／塌成一堆。每次從該種類的幾種倒法裡隨機挑。自動＝依名稱與形狀判斷。</div>` : ''}
      ${(T.coll || 'pil') !== 'none' ? `<div class="sim-comp">${(T.coll || 'pil') === 'pil' ? `<label>柱體半徑（公里）<input class="g-in" type="number" step="0.1" min="0.1" data-tk="r" value="${bldKm(T.r || 5)}"></label>` : ''}
        <label>碰撞高度（公里）<input class="g-in" type="number" step="0.5" min="0.1" data-tk="top" value="${bldKm(T.top || T.h)}"></label>
        <label>耐久<input class="g-in" type="number" step="100" min="1" data-tk="hp" value="${T.hp}"></label></div>
        <div class="sim-btns"><button class="g-btn sm" id="be-fit">依模型自動量碰撞</button></div>
        <div class="g-dim" style="font-size:calc(11.5px * var(--ui));margin-top:4px">參考：生態巨塔耐久 1600、星艦船塢 1000、軌道電梯 2500。黃色線框＝碰撞範圍。</div>` : ''}</div>` : ''}
    <div class="sim-help g-dim">在「建築種類」頁，地圖上會在你目前看的位置放一棟預覽（左鍵拖曳可以搬）。改數值會即時反映到地圖上所有同種類的建築。</div>`;
}
function bldBind(el) {
  const q = (s) => el.querySelectorAll(s), on = (id, ev, fn) => { const e = el.querySelector('#' + id); if (e) e[ev] = fn; };
  on('be-exit', 'onclick', () => { if (BE.dirty && !confirm('有修改還沒儲存，離開編輯器？（重新整理網頁前，修改還會留著）')) return; showMenu(); });
  on('be-save', 'onclick', async () => { try { await bldSave(); toast('已儲存建築與地圖'); } catch (e) { toast('儲存失敗：' + e.message, 'bad'); } bldRender(); });
  if (!BLD.loaded) return;
  q('#be-tabs [data-tab]').forEach((b) => (b.onclick = () => { BE.tab = b.dataset.tab; BE.brush = null; BE.sel = -1; if (BE.tab === 'type') bldPreviewHere(); bldSyncObjs(); bldRender(); }));
  if (BE.tab === 'type') return bldBindType(el, q, on);
  const M = bldCur(); if (!M) return;
  on('be-map', 'onchange', (e) => { BE.mapId = e.target.value; BE.sel = -1; BE.brush = null; bldBase(); bldRender(); });
  on('be-mnew', 'onclick', () => { bldNewMap(M.scene); bldBase(); bldRender(); });
  on('be-mdup', 'onclick', () => { const id = bldId('m'); BLD.data.maps[id] = { ...JSON.parse(JSON.stringify(M)), id, name: M.name + '（複製）' }; BE.mapId = id; BE.dirty = true; bldRender(); });
  on('be-mdel', 'onclick', () => { if (!confirm(`刪除地圖「${M.name}」？（按儲存後才會從伺服器刪掉）`)) return; delete BLD.data.maps[M.id]; BE.dirty = true; BE.sel = -1; BE.mapId = (bldMapList()[0] || {}).id || null; if (!bldCur()) bldNewMap(); bldBase(); bldRender(); });
  on('be-mname', 'onchange', (e) => { M.name = e.target.value.trim() || M.name; BE.dirty = true; bldRender(); });
  q('#be-scene [data-v]').forEach((b) => (b.onclick = () => { M.scene = b.dataset.v; BE.dirty = true; bldBase(); bldRender(); }));
  on('be-seed', 'onchange', (e) => { M.seed = Math.max(1, bldN(e.target.value, 1) | 0); BE.dirty = true; bldBase(); bldRender(); });
  on('be-reseed', 'onclick', () => { M.seed = ((Math.random() * 1e6) | 0) + 1; BE.dirty = true; bldBase(); bldRender(); });
  q('#be-def [data-v]').forEach((b) => (b.onclick = () => { M.def = +b.dataset.v; BE.dirty = true; bldBase(); bldRender(); }));
  on('be-keep', 'onchange', (e) => { M.keep = e.target.checked; BE.dirty = true; bldBase(); bldRender(); });
  on('be-try', 'onclick', () => {
    const m = simLoadLast(); m.ground = { scene: M.scene, seed: M.seed >>> 0, def: M.def, cmap: bldSnapshot(M) }; m.terrain = [];
    if (BE.dirty) toast('地圖還沒儲存：模擬室用的是目前編輯中的版本', 'hint');
    showSim(m);
  });
  q('[data-brush]').forEach((b) => (b.onclick = () => { BE.brush = BE.brush === b.dataset.brush ? null : b.dataset.brush; bldRender(); }));
  on('be-coll', 'onchange', (e) => { BE.showColl = e.target.checked; for (const o of BE.objs) if (o.userData.coll) o.userData.coll.visible = BE.showColl; });
  q('[data-it]').forEach((b) => (b.onclick = () => { const i = +b.dataset.it, it = M.items[i]; bldSelect(i); if (it) { view.target.x = it.x; view.target.z = it.z; updateCamera(); } }));
  const it = BE.sel >= 0 ? M.items[BE.sel] : null; if (!it) return;
  on('be-del', 'onclick', () => bldDelSel());
  on('be-dup', 'onclick', () => { M.items.push({ ...it, x: it.x + 40 }); BE.sel = M.items.length - 1; bldChanged(); });
  on('be-itype', 'onchange', (e) => { it.t = e.target.value; bldChanged(); });
  q('[data-ik]').forEach((e) => (e.onchange = () => {
    const k = e.dataset.ik;
    if (k === 's') it.s = Math.max(0.1, Math.min(10, bldN(e.value, 1))); else if (k === 'rot') it.rot = ((bldN(e.value, 0) % 360) + 360) % 360; else it[k] = bldN(e.value, it[k]);
    bldChanged(k === 's');
    if (k !== 's') bldMoveObj(BE.sel);
  }));
}
function bldBindType(el, q, on) {
  q('[data-ty]').forEach((b) => (b.onclick = () => { BE.typeId = b.dataset.ty; bldPreviewHere(); bldSyncObjs(); bldRender(); }));
  on('be-tnew', 'onclick', () => { bldNewType(''); bldPreviewHere(); bldSyncObjs(); bldRender(); });
  q('[data-fnew]').forEach((b) => (b.onclick = () => { bldNewType(b.dataset.fnew); bldPreviewHere(); bldSyncObjs(); bldRender(); }));
  on('be-up', 'onchange', async (e) => {
    const fs = [...e.target.files]; if (!fs.length) return;
    for (const f of fs) {
      BE.busy = `上傳 ${f.name}（${(f.size / 1048576).toFixed(1)} MB）…`; bldRender();
      try {
        const r = await fetch('api/buildings/glb?name=' + encodeURIComponent(f.name), { method: 'PUT', headers: { ...API.headers(), 'Content-Type': 'model/gltf-binary' }, body: f });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
        BLD.files = BLD.files.filter((o) => o.file !== j.file).concat([{ file: j.file, bytes: j.bytes, mtime: j.mtime }]);
        if (!Object.values(BLD.data.types).some((t) => t.file === j.file)) bldNewType(j.file);   // 新的檔案：順便建一個種類
        toast(`已匯入 ${j.file}`);
      } catch (err) { toast(`${f.name} 匯入失敗：${err.message}`, 'bad'); }
    }
    BE.busy = ''; bldPreviewHere(); bldSyncObjs(); bldRender();
  });
  const T = BLD.data.types[BE.typeId]; if (!T) return;
  on('be-tdel', 'onclick', () => {
    const used = Object.values(BLD.data.maps).reduce((n, m) => n + m.items.filter((o) => o.t === BE.typeId).length, 0);
    if (!confirm(`刪除建築種類「${T.name}」？${used ? `地圖上 ${used} 棟這種建築也會一起拿掉。` : ''}（GLB 檔案不會刪）`)) return;
    for (const m of Object.values(BLD.data.maps)) m.items = m.items.filter((o) => o.t !== BE.typeId);
    delete BLD.data.types[BE.typeId]; BE.typeId = Object.keys(BLD.data.types)[0] || null; BE.dirty = true; bldSyncObjs(); bldRender();
  });
  q('#be-tcoll [data-v]').forEach((b) => (b.onclick = () => { T.coll = b.dataset.v; bldChanged(); }));
  q('#be-tfall [data-v]').forEach((b) => (b.onclick = () => { if (b.dataset.v === 'auto') delete T.fall; else T.fall = b.dataset.v; bldChanged(); }));
  on('be-fit', 'onclick', () => { bldMeasure(T, true); BE.dirty = true; });
  q('[data-tk]').forEach((e) => (e.onchange = () => {
    const k = e.dataset.tk, U = 1 / GROUND_KM;
    if (k === 'name') T.name = e.value.trim() || T.name;
    else if (k === 'file') { T.file = e.value; bldMeasure(T, true); }
    else if (k === 'h') { const h = Math.max(0.1, bldN(e.value, bldKm(T.h))) * U, f = h / T.h; T.r = (T.r || 5) * f; T.top = (T.top || T.h) * f; T.fw = (T.fw || 0) * f; T.fd = (T.fd || 0) * f; T.h = h; }
    else if (k === 'rot') T.rot = ((bldN(e.value, 0) % 360) + 360) % 360;
    else if (k === 'oy') T.oy = bldN(e.value, 0) * U;
    else if (k === 'lum') T.lum = Math.max(0.1, Math.min(5, bldN(e.value, 1)));
    else if (k === 'r') T.r = Math.max(0.1, bldN(e.value, 1)) * U;
    else if (k === 'top') T.top = Math.max(0.1, bldN(e.value, 1)) * U;
    else if (k === 'hp') T.hp = Math.max(1, Math.round(bldN(e.value, 1000)));
    bldChanged(k !== 'name' && k !== 'hp');
  }));
}
// 種類的預覽擺在目前鏡頭看的地方
function bldPreviewHere() {
  BE.pv = { t: BE.typeId, x: Math.round(view.target.x), z: Math.round(view.target.z), rot: 0, s: 1 };
  const T = BLD.data.types[BE.typeId]; if (T) { camAnim = null; view.height = Math.max(60, Math.min(900, Math.max(T.h, T.fw || 0, T.fd || 0) * 2.6)); updateCamera(); }
}
function bldDelSel() { const M = bldCur(); if (!M || BE.sel < 0) return; M.items.splice(BE.sel, 1); BE.sel = -1; bldChanged(); }

// ───── 地圖上的滑鼠 ─────
function bldGround(e) { return groundAt(e.clientX, e.clientY, GROUND_Y); }
function bldPick(e) {
  _ndc.set((e.clientX / VW) * 2 - 1, -(e.clientY / VH) * 2 + 1); raycaster.setFromCamera(_ndc, camera);
  const hit = raycaster.intersectObjects(BE.objs, true)[0];
  if (hit) { let o = hit.object; while (o && o.userData.i == null) o = o.parent; if (o) return o.userData.i; }
  const p = bldGround(e); if (!p) return null;   // 還沒載入完：用底面
  let best = null, bd = 1e9;
  for (const o of BE.objs) { const it = bldItemAt(o.userData.i), T = it && BLD.data.types[it.t || BE.typeId]; if (!T) continue; const d = Math.hypot(p.x - it.x, p.z - it.z), r = bldFoot({ ...T, s: it.s || 1 }).r + 2; if (d < r && d < bd) { bd = d; best = o.userData.i; } }
  return best;
}
function bldPointer(type, e) {
  if (e.pointerType === 'touch' || (e.button === 1 && type === 'down')) return false;
  const M = bldCur(); if (!M || BE.busy) return type === 'down' && e.button === 0;
  const d = BE.drag;
  if (type === 'down') {
    if (e.button === 0) {
      const i = bldPick(e), p = bldGround(e);
      if (i != null && !BE.brush) {
        if (i !== BE.sel) bldSelect(i);
        const it = bldItemAt(i); BE.drag = { mode: 'move', i, ox: p ? it.x - p.x : 0, oz: p ? it.z - p.z : 0, x0: e.clientX, y0: e.clientY };
        return true;
      }
      if (BE.brush && p && BE.tab === 'map') {   // 放一棟新的（放完可以接著拖）
        M.items.push({ t: BE.brush, x: Math.round(p.x), z: Math.round(p.z), rot: 0, s: 1 }); BE.sel = M.items.length - 1; bldChanged();
        BE.drag = { mode: 'move', i: BE.sel, ox: 0, oz: 0, x0: e.clientX, y0: e.clientY, moved: true };
        return true;
      }
      if (BE.sel >= 0) bldSelect(-1);
      return true;
    }
    if (e.button === 2) {
      if (BE.brush) { BE.brush = null; bldRender(); return true; }
      const i = BE.sel >= 0 ? BE.sel : BE.tab === 'type' ? -2 : null, p = bldGround(e);
      if (i == null || !p) return false;   // 沒選東西：照一般的右鍵（轉鏡頭）
      BE.drag = { mode: 'place', i, A: p, x0: e.clientX, y0: e.clientY };
      const it = bldItemAt(i); it.x = Math.round(p.x); it.z = Math.round(p.z); bldMoveObj(i);
      return true;
    }
    return false;
  }
  if (!d) return false;
  const p = bldGround(e), it = bldItemAt(d.i);
  if (type === 'move') {
    if (!p || !it) return true;
    if (d.mode === 'move' && (d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4)) { d.moved = true; it.x = Math.round(p.x + d.ox); it.z = Math.round(p.z + d.oz); bldMoveObj(d.i); }
    else if (d.mode === 'place' && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 10) { it.rot = Math.round(((Math.atan2(p.x - d.A.x, p.z - d.A.z) / BLD_DEG) % 360 + 360) % 360); bldMoveObj(d.i); }
    return true;
  }
  if (type === 'up') {
    BE.drag = null;
    if (d.i === -2) { bldSyncObjs(); return true; }   // 預覽：不算修改
    if (d.moved || d.mode === 'place') bldChanged(false);
    return true;
  }
  return false;
}
addEventListener('keydown', (e) => {
  if (typeof GAME === 'undefined' || GAME.phase !== 'bldedit' || (e.target.closest && e.target.closest('input, select, textarea'))) return;
  const M = bldCur(), it = M && BE.sel >= 0 ? M.items[BE.sel] : null;
  let used = true;
  if (e.code === 'Escape') { if (BE.brush) BE.brush = null; else BE.sel = -1; bldMarkSel(); bldRender(); }
  else if (e.code === 'Delete' && it) bldDelSel();
  else if (e.code === 'KeyR' && it) { it.rot = (((it.rot || 0) + (e.shiftKey ? -15 : 15)) % 360 + 360) % 360; bldMoveObj(BE.sel); bldChanged(false); }
  else used = false;
  if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
if (window.API) bldLoad();   // 開場就讀：各模式的「戰場」選項要列出自訂地圖
window.__bld = { BLD, BE, bldSnapshot, bldSyncObjs, bldBase, bldModel, grd: () => GRD, gv: () => GV, msKill: (id, sx, sz) => groundMsKill(GRD.ms[id], 0, sx, sz) };   // 除錯
