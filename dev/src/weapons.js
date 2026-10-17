// ═══════════════════════ 武器：掛點資料、2D 疊圖、配置編輯器 ═══════════════════════
// 掛點用船體模型座標（船長＝1，船頭＋z、上＋y、右＋x）。3D 直接當實例畫在船上；
// 2D 則用同一套掛點，從與原始貼圖相同的鏡頭把武器算成一張疊圖（被船身擋住的部分會被遮掉）
const WEAPON_NAMES = [
  ['三聯裝巨砲塔', '雙聯裝砲塔', '舷砲砲座模組', '防空砲塔', '魚雷發射管組', '金色衝角砲'],
  ['三聯裝主砲塔', '雙聯裝副砲塔', '垂直飛彈發射模組', '防空砲塔', '魚雷發射管組', '貫穿式主砲'],
];
const WEAPON_DEF_S = [0.2, 0.12, 0.08, 0.06, 0.09, 0.18];   // 新放上去的預設尺寸（船長的比例）
const HULL_NAMES = ['航空母艦', '戰列艦', '巡洋艦', '驅逐艦', '護衛艦'];
// 2D 貼圖的鏡頭校正（用船體輪廓對齊原圖求得，30° 俯角、正交）：每單位幾 px、垂直位移 px
const ATLAS_CAL = { e0: [244, -5.0], e1: [252, -12.3], e2: [248, -10.7], e3: [248, -14.5], e4: [248, -12.6], a0: [248, -6.6], a1: [248, -6.4], a2: [248, -10.0], a3: [248, -1.0], a4: [252, 4.3] };
const HULL_KEYS = ['e0', 'e1', 'e2', 'e3', 'e4', 'a0', 'a1', 'a2', 'a3', 'a4'];
const D2R = Math.PI / 180;
const MOUNT_STORE = 'fleet.mounts';

function cloneMounts(o) { return JSON.parse(JSON.stringify(o)); }
function validMount(m) { return !!m && Number.isInteger(m.w) && m.w >= 0 && m.w < 6 && Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite) && Number.isFinite(m.s) && m.s > 0; }
function cleanMount(m) { return { w: m.w, p: m.p.map((v) => Math.round(v * 10000) / 10000), r: Math.round((+m.r || 0) * 10) / 10, t: Math.round((+m.t || 0) * 10) / 10, s: Math.round(m.s * 10000) / 10000 }; }
function readMounts(obj) {   // 不認得的鍵、壞掉的項目都略過；沒有的艦種用預設
  const d = cloneMounts(MOUNTS_DEFAULT), src = obj && (obj.m || obj);
  if (src && typeof src === 'object') for (const k of HULL_KEYS) if (Array.isArray(src[k])) d[k] = src[k].filter(validMount).map(cleanMount);
  return d;
}
let MOUNTS = (() => { try { return readMounts(JSON.parse(STORE.getItem(MOUNT_STORE) || 'null')); } catch (e) { return readMounts(null); } })();
function saveMounts() { try { STORE.setItem(MOUNT_STORE, JSON.stringify({ v: 1, m: MOUNTS })); } catch (e) { /* 只在本次有效 */ } }
function mountsOf(hk) { return (MOUNTS[hk] || []).map((m) => ({ ...m, hk })); }
function mountsChanged(hk) { saveMounts(); R3.version = -1; scheduleWeaponAtlas(hk); }

// ───── 武器疊圖（2D）─────
const WA = { scene: null, cam: null, rt: null, pool: [], hull: null, ship: null, timer: 0, dirty: new Set(), busy: false };
function weaponScene() {
  if (WA.scene) return WA.scene;
  const sc = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.7); sun.position.set(-0.55, 0.85, 0.55);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 0.7); rim.position.set(0.6, 0.3, -0.7);
  sc.add(sun, rim, new THREE.HemisphereLight(0x9fb8ff, 0x221a24, 1.0), new THREE.AmbientLight(0x50586a, 0.55));
  WA.ship = new THREE.Group(); sc.add(WA.ship);
  WA.hull = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false }));   // 船身只寫深度：擋住後面的武器
  WA.hull.renderOrder = -1; WA.ship.add(WA.hull);
  WA.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
  WA.cam.position.copy(CAM_DIR).multiplyScalar(10); WA.cam.lookAt(0, 0, 0);
  return (WA.scene = sc);
}
function setMountObj(o, m) { o.position.set(m.p[0], m.p[1], m.p[2]); o.rotation.set(0, (m.r || 0) * D2R, (m.t || 0) * D2R, 'ZYX'); o.scale.setScalar(m.s); }
function poseWeaponShip(hk, list, lod) {
  WA.hull.geometry = getModel(hk).lods[0];
  let n = 0;
  for (const m of list) {
    const W = getModel(hk[0] + 'w' + m.w); if (!W) continue;
    let o = WA.pool[n]; if (!o) { o = new THREE.Mesh(); WA.ship.add(o); WA.pool[n] = o; }
    o.geometry = W.lods[Math.min(lod, W.lods.length - 1)]; o.material = W.mat; o.visible = true; setMountObj(o, m); n++;
  }
  for (let i = n; i < WA.pool.length; i++) WA.pool[i].visible = false;
}
// cells：[{ hk, d, x, y }]，x/y＝該格在 rt 裡的左下角（px）；每格 256×192
// 每格先畫進一張小的多重取樣暫存圖（抗鋸齒），再貼進 rt 的那一格（rt 本身不做多重取樣，才能只更新部分格子）
const WCOPY = { scene: null, cam: null, mat: null };
function renderWeaponCells(rdr, rt, cells, list) {
  weaponScene();
  if (!WCOPY.scene) {
    WCOPY.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: null } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = texture2D(map, vUv); }' });
    WCOPY.scene = new THREE.Scene(); WCOPY.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), WCOPY.mat)); WCOPY.cam = new THREE.Camera();
  }
  if (!rdr.__wcell) rdr.__wcell = new THREE.WebGLRenderTarget(256, 192, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const cell = rdr.__wcell; WCOPY.mat.uniforms.map.value = cell.texture;
  const prevRT = rdr.getRenderTarget(), prevAuto = rdr.autoClear, cc = rdr.getClearColor(new THREE.Color()), ca = rdr.getClearAlpha();
  rdr.setClearColor(0x000000, 0);
  const mips = rt.texture.generateMipmaps; rt.texture.generateMipmaps = false;
  for (const c of cells) {
    const [k, oy] = ATLAS_CAL[c.hk];
    WA.cam.left = -128 / k; WA.cam.right = 128 / k; WA.cam.top = (96 + oy) / k; WA.cam.bottom = (oy - 96) / k; WA.cam.updateProjectionMatrix();
    WA.ship.rotation.y = -c.d * Math.PI / 4;
    poseWeaponShip(c.hk, list ? list(c.hk) : (MOUNTS[c.hk] || []), 1);   // 2D 格子只有 256 px：武器用第 1 級就夠
    rdr.autoClear = true; rdr.setRenderTarget(cell); rdr.render(WA.scene, WA.cam);
    rdr.autoClear = false; rt.viewport.set(c.x, c.y, 256, 192); rt.scissor.set(c.x, c.y, 256, 192); rt.scissorTest = true;
    rdr.setRenderTarget(rt); rdr.render(WCOPY.scene, WCOPY.cam);   // 不混色：整格覆蓋（含透明處）
  }
  rt.viewport.set(0, 0, rt.width, rt.height); rt.scissor.set(0, 0, rt.width, rt.height); rt.scissorTest = false;
  if (mips) { rt.texture.generateMipmaps = true; rdr.setRenderTarget(rt); rdr.render(new THREE.Scene(), WCOPY.cam); }   // 最後一次才產生 mipmap
  rdr.setRenderTarget(prevRT); rdr.autoClear = prevAuto; rdr.setClearColor(cc, ca);
}
function atlasCells(hk) { const side = hk[0] === 'a' ? 1 : 0, t = +hk[1]; return Array.from({ length: 8 }, (_, d) => ({ hk, d, x: (side * 8 + d) * 256, y: 1024 - (t + 1) * 192 })); }
async function buildWeaponAtlas(only) {
  const keys = only && only.length ? only : HULL_KEYS;
  const need = new Set(); for (const hk of keys) { need.add(hk); for (const m of MOUNTS[hk] || []) need.add(hk[0] + 'w' + m.w); }
  await Promise.all([...need].map((k) => getModel(k) && getModel(k).ready));
  if (!WA.rt) {
    WA.rt = new THREE.WebGLRenderTarget(4096, 1024, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    WA.rt.texture.anisotropy = 4;
    renderWeaponCells(renderer, WA.rt, HULL_KEYS.flatMap(atlasCells));
  } else renderWeaponCells(renderer, WA.rt, keys.flatMap(atlasCells));
  applyWeapon2D();
}
function applyWeapon2D() { shipMat.uniforms.uWTex.value = WA.rt && SETTINGS.weapons2D !== false ? WA.rt.texture : NO_WTEX; }
function scheduleWeaponAtlas(hk) {
  if (hk) WA.dirty.add(hk); else HULL_KEYS.forEach((k) => WA.dirty.add(k));
  clearTimeout(WA.timer);
  WA.timer = setTimeout(async () => {
    if (WA.busy) { scheduleWeaponAtlas(); return; }
    WA.busy = true; const keys = [...WA.dirty]; WA.dirty.clear();
    try { await buildWeaponAtlas(WA.rt ? keys : null); } catch (e) { console.warn('weapon atlas', e); }
    WA.busy = false;
  }, WA.rt ? 120 : 30);
}

// ═════ 武器配置編輯器 ═════
const WE = { el: null, open: false, hk: 'e1', sel: -1, place: -1, undo: [], redo: [], back: null };
function weaponEditorOpen() { return WE.open; }
function openWeaponEditor(back) {
  WE.back = back || null; WE.open = true; WE.sel = -1; WE.place = -1; WE.undo = []; WE.redo = [];
  if (!WE.el) buildWeaponEditor();
  WE.el.hidden = false;
  weResize(); weLoadHull(); weCamPreset('iso');
}
function closeWeaponEditor() {
  if (!WE.open) return;
  WE.open = false; WE.el.hidden = true; cancelAnimationFrame(WE.raf); WE.raf = 0;
  scheduleWeaponAtlas();
  const b = WE.back; WE.back = null; if (b) b();
}
function buildWeaponEditor() {
  const el = WE.el = document.createElement('div'); el.id = 'wed'; el.hidden = true;
  el.innerHTML = `<div class="wed-top"><h2>武器配置</h2>
      <div class="wed-seg" id="wed-fac"><button data-f="e">帝國軍</button><button data-f="a">聯盟軍</button></div>
      <div class="wed-seg" id="wed-type">${HULL_NAMES.map((n, i) => `<button data-t="${i}">${n}</button>`).join('')}</div>
      <span class="g-sp"></span>
      <button class="g-btn sm" id="wed-undo" title="復原（Ctrl＋Z）">↶</button><button class="g-btn sm" id="wed-redo" title="重做（Ctrl＋Y）">↷</button>
      <button class="g-btn sm" id="wed-io">匯出／匯入</button><label class="wed-chk" title="編輯有對稱夥伴的武器時，另一側跟著動"><input type="checkbox" id="wed-sym" checked>左右對稱</label><button class="g-btn sm" id="wed-reset">此艦預設</button><button class="g-btn sm" id="wed-resetall">全部預設</button>
      <button class="g-btn sm pri" id="wed-done">完成</button></div>
    <div class="wed-body">
      <div class="wed-view" id="wed-view"><canvas id="wed-c"></canvas>
        <div class="wed-cams"><button class="g-btn sm" data-cam="iso">斜視</button><button class="g-btn sm" data-cam="top">俯視</button><button class="g-btn sm" data-cam="side">側視</button><button class="g-btn sm" data-cam="front">正面</button><button class="g-btn sm" data-cam="game">遊戲角度</button></div>
        <div class="wed-hint" id="wed-hint"></div></div>
      <div class="wed-side">
        <h4>新增武器 <small>點選後在船身上點一下放置；按住 Shift 可連續放</small></h4><div class="wed-pal" id="wed-pal"></div>
        <h4>掛點 <small id="wed-n"></small></h4><div class="wed-list" id="wed-list"></div>
        <h4>選取的掛點</h4><div id="wed-prop"></div>
      </div>
    </div>
    <div class="wed-2d"><div class="wed-2dh"><b>2D 八方向預覽</b><span class="g-dim">遊戲的 2D 畫面會用這個疊圖（被船身擋住的部分會自動遮掉）</span></div><canvas id="wed-2d" width="2048" height="192"></canvas></div>
    <div class="wed-modal" id="wed-modal" hidden><div class="g-card"><h3>匯出／匯入掛點</h3>
      <p class="g-dim">複製下面的文字就能保存或分享目前全部艦種的掛點；貼上別人的文字後按「套用」。</p>
      <textarea id="wed-json" spellcheck="false"></textarea>
      <div class="g-row"><span id="wed-iomsg" class="g-dim"></span><span class="g-sp"></span><button class="g-btn sm" id="wed-copy">複製</button><button class="g-btn sm" id="wed-apply">套用</button><button class="g-btn sm" id="wed-ioclose">關閉</button></div></div></div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector('#' + id);
  WE.cv = $('wed-c'); WE.c2 = $('wed-2d');
  WE.r = new THREE.WebGLRenderer({ canvas: WE.cv, antialias: true });
  WE.r.setPixelRatio(Math.min(devicePixelRatio, 2)); WE.r.outputColorSpace = THREE.SRGBColorSpace;
  WE.r.toneMapping = THREE.ACESFilmicToneMapping; WE.r.toneMappingExposure = 1.15;
  WE.scene = new THREE.Scene(); WE.scene.background = new THREE.Color(0x0a1020);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0); sun.position.set(-0.6, 0.8, 0.35);
  WE.scene.add(sun, new THREE.HemisphereLight(0x8fb2ff, 0x1a1020, 0.9), new THREE.AmbientLight(0x404858, 0.6));
  const grid = new THREE.GridHelper(1.4, 28, 0x34507a, 0x1c2a44); grid.material.transparent = true; grid.material.opacity = 0.5; WE.grid = grid; WE.scene.add(grid);
  const bow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0.56), 0.1, 0xf2b35a, 0.04, 0.03); WE.scene.add(bow);
  WE.hullMesh = new THREE.Mesh(); WE.scene.add(WE.hullMesh);
  WE.wGroup = new THREE.Group(); WE.scene.add(WE.wGroup);
  WE.box = new THREE.BoxHelper(undefined, 0xffd27a); WE.box.visible = false; WE.scene.add(WE.box);
  WE.ghost = new THREE.Mesh(); WE.ghost.visible = false; WE.scene.add(WE.ghost);
  WE.cam = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  WE.orb = { yaw: 0.8, pitch: 0.5, dist: 1.9, tx: 0, ty: 0, tz: 0 };
  WE.ray = new THREE.Raycaster(); WE.rt2 = new THREE.WebGLRenderTarget(2048, 192, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace });
  WE.shipImg = new Image(); WE.shipImg.src = SHIP_ATLAS; WE.shipImg.onload = () => weDraw2D();
  $('wed-fac').onclick = (e) => { const f = e.target.dataset.f; if (f) { WE.hk = f + WE.hk[1]; weLoadHull(); } };
  $('wed-type').onclick = (e) => { const t = e.target.dataset.t; if (t != null) { WE.hk = WE.hk[0] + t; weLoadHull(); } };
  $('wed-done').onclick = closeWeaponEditor;
  $('wed-undo').onclick = weUndo; $('wed-redo').onclick = weRedo;
  $('wed-reset').onclick = () => { weSnap(); MOUNTS[WE.hk] = cloneMounts(MOUNTS_DEFAULT[WE.hk]); WE.sel = -1; weChanged(); };
  $('wed-resetall').onclick = () => { weSnap(); MOUNTS = readMounts(null); WE.sel = -1; weChanged(true); };
  $('wed-io').onclick = () => { $('wed-json').value = JSON.stringify({ v: 1, m: MOUNTS }); $('wed-iomsg').textContent = ''; $('wed-modal').hidden = false; };
  $('wed-ioclose').onclick = () => { $('wed-modal').hidden = true; };
  $('wed-copy').onclick = () => { const t = $('wed-json'); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 無法複製 */ } if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(() => ($('wed-iomsg').textContent = '已複製'), () => {}); $('wed-iomsg').textContent = ok ? '已複製' : '已選取，請按 Ctrl＋C'; };
  $('wed-apply').onclick = () => {
    try { const o = JSON.parse($('wed-json').value); weSnap(); MOUNTS = readMounts(o); WE.sel = -1; weChanged(true); $('wed-iomsg').textContent = '已套用'; }
    catch (e) { $('wed-iomsg').textContent = '格式不對：' + e.message; }
  };
  el.querySelector('.wed-cams').onclick = (e) => { const c = e.target.dataset.cam; if (c) weCamPreset(c); };
  $('wed-pal').onclick = (e) => { const b = e.target.closest('[data-w]'); if (!b) return; const w = +b.dataset.w; WE.place = WE.place === w ? -1 : w; weUI(); };
  $('wed-list').onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; WE.sel = +b.dataset.i; WE.place = -1; weUI(); weSync(); };
  // 3D 視窗操作
  const cv = WE.cv;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', wePointerDown);
  cv.addEventListener('pointermove', wePointerMove);
  cv.addEventListener('pointerup', wePointerUp); cv.addEventListener('pointercancel', wePointerUp);
  cv.addEventListener('pointerleave', () => { WE.ghost.visible = false; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); WE.orb.dist = Math.min(6, Math.max(0.25, WE.orb.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  addEventListener('keydown', weKey);
  addEventListener('resize', () => { if (WE.open) weResize(); });
}
function weResize() {
  const v = WE.el.querySelector('#wed-view'), w = Math.max(50, v.clientWidth), h = Math.max(50, v.clientHeight);
  WE.r.setSize(w, h, false); WE.cam.aspect = w / h; WE.cam.updateProjectionMatrix();
}
function weCamPreset(c) {
  const o = WE.orb; o.tx = 0; o.ty = 0; o.tz = 0;
  if (c === 'top') { o.yaw = Math.PI; o.pitch = 1.5; o.dist = 2.1; }
  else if (c === 'side') { o.yaw = Math.PI / 2; o.pitch = 0.02; o.dist = 2.0; }
  else if (c === 'front') { o.yaw = 0; o.pitch = 0.1; o.dist = 1.5; }
  else if (c === 'game') { o.yaw = -Math.PI / 2; o.pitch = ELEV; o.dist = 2.0; }
  else { o.yaw = 0.75; o.pitch = 0.5; o.dist = 1.6; }
  if (!WE.raf) weLoop();
}
function weLoadHull() {
  const M = getModel(WE.hk);
  WE.hullMesh.geometry = M.lods[0]; WE.hullMesh.material = M.mat;
  WE.sel = -1; WE.place = -1;
  const need = [WE.hk, ...[0, 1, 2, 3, 4, 5].map((w) => WE.hk[0] + 'w' + w)];
  Promise.all(need.map((k) => getModel(k).ready)).then(() => weDraw2D());
  weSync(); weUI(); if (!WE.raf) weLoop();
}
function weMounts() { return MOUNTS[WE.hk] || (MOUNTS[WE.hk] = []); }
// 3D 場景跟著資料重建
function weSync() {
  const list = weMounts(), g = WE.wGroup;
  while (g.children.length > list.length) g.remove(g.children[g.children.length - 1]);
  list.forEach((m, i) => {
    let o = g.children[i]; if (!o) { o = new THREE.Mesh(); g.add(o); }
    const W = getModel(WE.hk[0] + 'w' + m.w); o.geometry = W.lods[0]; o.material = W.mat; o.userData.i = i; setMountObj(o, m);
  });
  const s = g.children[WE.sel];
  WE.box.visible = !!s; if (s) { s.updateMatrixWorld(true); WE.box.setFromObject(s); }
}
function weChanged(all) {
  weSync(); weUI(); weDraw2DSoon();
  saveMounts(); R3.version = -1; scheduleWeaponAtlas(all ? null : WE.hk);
}
function weSnap() { WE.undo.push(JSON.stringify(MOUNTS)); if (WE.undo.length > 80) WE.undo.shift(); WE.redo = []; }
function weUndo() { if (!WE.undo.length) return; WE.redo.push(JSON.stringify(MOUNTS)); MOUNTS = readMounts(JSON.parse(WE.undo.pop())); WE.sel = Math.min(WE.sel, weMounts().length - 1); weChanged(true); }
function weRedo() { if (!WE.redo.length) return; WE.undo.push(JSON.stringify(MOUNTS)); MOUNTS = readMounts(JSON.parse(WE.redo.pop())); WE.sel = Math.min(WE.sel, weMounts().length - 1); weChanged(true); }
function weUI() {
  const el = WE.el, fac = WE.hk[0] === 'a' ? 1 : 0, list = weMounts(), names = WEAPON_NAMES[fac];
  el.querySelectorAll('#wed-fac button').forEach((b) => b.className = b.dataset.f === WE.hk[0] ? 'on ' + (fac ? 'all' : 'emp') : '');
  el.querySelectorAll('#wed-type button').forEach((b) => b.className = +b.dataset.t === +WE.hk[1] ? 'on ' + (fac ? 'all' : 'emp') : '');
  el.querySelector('#wed-pal').innerHTML = names.map((n, w) => `<button class="g-btn sm ${WE.place === w ? 'pri' : ''}" data-w="${w}">${n}</button>`).join('');
  el.querySelector('#wed-n').textContent = `（${list.length}）`;
  el.querySelector('#wed-list').innerHTML = list.length ? list.map((m, i) => `<button class="wed-it ${i === WE.sel ? 'on' : ''}" data-i="${i}"><b>${i + 1}</b>${names[m.w]}<span>${m.p[0] < -0.01 ? '左' : m.p[0] > 0.01 ? '右' : '中'}・${m.p[2] > 0.15 ? '前' : m.p[2] < -0.15 ? '後' : '中段'}</span></button>`).join('') : '<p class="g-dim">還沒有武器，從上面挑一個放上去。</p>';
  el.querySelector('#wed-undo').disabled = !WE.undo.length; el.querySelector('#wed-redo').disabled = !WE.redo.length;
  const m = list[WE.sel], prop = el.querySelector('#wed-prop');
  WE.el.querySelector('#wed-hint').textContent = WE.place >= 0 ? `放置「${names[WE.place]}」：在船身上點一下（Esc 取消）` : '左鍵拖曳旋轉・右鍵拖曳平移・滾輪縮放・點武器選取、拖曳沿船身移動・Delete 刪除・M 鏡像複製・R 轉 15°';
  if (!m) { prop.innerHTML = '<p class="g-dim">點選 3D 畫面或上面清單裡的武器來調整。</p>'; return; }
  const num = (id, label, v, step, unit = '') => `<label class="wed-num"><span>${label}</span><input type="number" id="${id}" value="${v}" step="${step}"><i>${unit}</i></label>`;
  prop.innerHTML = `<label class="wed-num"><span>種類</span><select class="g-sel" id="wp-w">${names.map((n, w) => `<option value="${w}" ${w === m.w ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    ${num('wp-x', '左右 X', m.p[0], 0.002)}${num('wp-y', '高度 Y', m.p[1], 0.002)}${num('wp-z', '前後 Z', m.p[2], 0.002)}
    ${num('wp-r', '轉向', m.r || 0, 5, '°')}${num('wp-t', '側傾', m.t || 0, 5, '°')}${num('wp-s', '尺寸', m.s, 0.005)}
    <div class="wed-acts"><button class="g-btn sm" id="wp-snap" title="把高度貼到下方的船身表面">貼齊船身</button><button class="g-btn sm" id="wp-mir" title="M">鏡像複製到另一側</button><button class="g-btn sm" id="wp-dup">複製一個</button><button class="g-btn sm" id="wp-del" title="Delete">刪除</button></div>`;
  const upd = weEdit;
  prop.querySelector('#wp-w').onchange = (e) => upd((q) => (q.w = +e.target.value));
  for (const [id, k] of [['wp-x', 0], ['wp-y', 1], ['wp-z', 2]]) prop.querySelector('#' + id).onchange = (e) => { const v = +e.target.value; if (Number.isFinite(v)) upd((q) => (q.p[k] = v)); };
  for (const [id, k] of [['wp-r', 'r'], ['wp-t', 't'], ['wp-s', 's']]) prop.querySelector('#' + id).onchange = (e) => { const v = +e.target.value; if (Number.isFinite(v) && (k !== 's' || v > 0)) upd((q) => (q[k] = v)); };
  prop.querySelector('#wp-snap').onclick = () => upd((q) => { const h = weSurfaceBelow(q.p[0], q.p[2], q.s); if (h != null) q.p[1] = h; });
  prop.querySelector('#wp-mir').onclick = () => weMirror();
  prop.querySelector('#wp-dup').onclick = () => { weSnap(); const c = cloneMounts(m); c.p[2] -= 0.04; list.push(c); WE.sel = list.length - 1; weChanged(); };
  prop.querySelector('#wp-del').onclick = () => weDelete();
}
// 左右對稱編輯：找另一側的對應武器（同種類、同尺寸、位置鏡像）
function wePartner(i) {
  const cb = WE.el.querySelector('#wed-sym'); if (cb && !cb.checked) return -1;
  const list = weMounts(), m = list[i]; if (!m || Math.abs(m.p[0]) < 0.004) return -1;
  let best = -1, bd = 0.02;
  list.forEach((q, j) => { if (j === i || q.w !== m.w || Math.abs(q.s - m.s) > 0.01) return; const d = Math.hypot(q.p[0] + m.p[0], q.p[1] - m.p[1], q.p[2] - m.p[2]); if (d < bd) { bd = d; best = j; } });
  return best;
}
function weMirrorInto(m, q) { q.w = m.w; q.p = [-m.p[0], m.p[1], m.p[2]]; q.r = -(m.r || 0); q.t = -(m.t || 0); q.s = m.s; }
function weEdit(fn) { const list = weMounts(), m = list[WE.sel]; if (!m) return; const j = wePartner(WE.sel); weSnap(); fn(m); if (j >= 0) weMirrorInto(m, list[j]); weChanged(); }
function weMirror() {
  const list = weMounts(), m = list[WE.sel]; if (!m) return;
  weSnap(); const c = cloneMounts(m); c.p[0] = -c.p[0]; c.r = -(c.r || 0); c.t = -(c.t || 0);
  if (Math.abs(m.p[0]) < 0.004) c.p[0] = m.p[0] + 0.04;   // 在中線上：往右挪一點，免得疊在一起
  list.push(c); WE.sel = list.length - 1; weChanged();
}
function weDelete() {
  const list = weMounts(); if (!list[WE.sel]) return;
  const j = wePartner(WE.sel); weSnap();
  for (const i of [WE.sel, j].filter((v) => v >= 0).sort((a, b) => b - a)) list.splice(i, 1);
  WE.sel = -1; weChanged();
}
function weSurfaceBelow(x, z, s) {   // 往下打射線：底座範圍內最高的那一點
  const r = 0.12 * (s || 0.1); let best = null;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    WE.ray.set(new THREE.Vector3(x + dx, 2, z + dz), new THREE.Vector3(0, -1, 0));
    const h = WE.ray.intersectObject(WE.hullMesh)[0]; if (h && (best == null || h.point.y > best)) best = h.point.y;
  }
  return best == null ? null : Math.round(best * 10000) / 10000;
}
function weRayAt(e, objs) {
  const b = WE.cv.getBoundingClientRect();
  WE.ray.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), WE.cam);
  return WE.ray.intersectObjects(objs, false)[0] || null;
}
// 依表面法線決定側傾：朝上的面＝0，船側的牆＝±90
function tiltOf(hit) {
  if (!hit || !hit.face) return 0;
  const n = hit.face.normal; if (n.y > 0.5) return 0;
  const t = Math.round(Math.atan2(-n.x, n.y) / D2R / 15) * 15;
  return Math.abs(t) < 30 ? 0 : t;
}
function wePlaceAt(hit, w) {
  const list = weMounts(), same = list.filter((m) => m.w === w), fac = WE.hk[0];
  const s = same.length ? same.reduce((a, m) => a + m.s, 0) / same.length : WEAPON_DEF_S[w];
  const p = hit.point, t = tiltOf(hit);
  let r = 0; if (fac === 'e' && w === 2 && Math.abs(p.x) > 0.02) r = p.x > 0 ? 90 : -90;   // 舷砲朝外
  weSnap(); list.push({ w, p: [p.x, p.y, p.z].map((v) => Math.round(v * 10000) / 10000), r, t, s });
  WE.sel = list.length - 1; weChanged();
}
function wePointerDown(e) {
  WE.cv.setPointerCapture(e.pointerId);
  const d = WE.drag = { x: e.clientX, y: e.clientY, btn: e.button, moved: false, mode: 'orbit' };
  if (e.button === 2 || e.button === 1) { d.mode = 'pan'; return; }
  if (WE.place >= 0) { d.mode = 'place'; return; }
  const hw = weRayAt(e, WE.wGroup.children);
  if (hw) { WE.sel = hw.object.userData.i; d.mode = 'move'; d.snapped = false; d.partner = wePartner(WE.sel); weUI(); weSync(); }
}
function wePointerMove(e) {
  const d = WE.drag;
  if (!d) {   // 放置模式：游標下顯示預覽
    if (WE.place >= 0) {
      const h = weRayAt(e, [WE.hullMesh]); WE.ghost.visible = !!h;
      if (h) { const W = getModel(WE.hk[0] + 'w' + WE.place); WE.ghost.geometry = W.lods[1]; WE.ghost.material = W.mat; const same = weMounts().filter((m) => m.w === WE.place); setMountObj(WE.ghost, { p: [h.point.x, h.point.y, h.point.z], r: 0, t: tiltOf(h), s: same.length ? same[0].s : WEAPON_DEF_S[WE.place] }); }
    } else WE.cv.style.cursor = weRayAt(e, WE.wGroup.children) ? 'pointer' : 'grab';
    return;
  }
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (!d.moved && Math.hypot(dx, dy) < 3) return;
  d.moved = true;
  if (d.mode === 'orbit') { WE.orb.yaw -= dx * 0.008; WE.orb.pitch = Math.min(1.55, Math.max(-1.4, WE.orb.pitch + dy * 0.008)); d.x = e.clientX; d.y = e.clientY; }
  else if (d.mode === 'pan') {
    const k = WE.orb.dist * 0.0012, cy = Math.cos(WE.orb.yaw), sy = Math.sin(WE.orb.yaw);
    WE.orb.tx -= (dx * cy) * k; WE.orb.tz -= (-dx * sy) * k; WE.orb.ty += dy * k; d.x = e.clientX; d.y = e.clientY;
  } else if (d.mode === 'move') {   // 沿船身表面拖
    const m = weMounts()[WE.sel]; if (!m) return;
    const h = weRayAt(e, [WE.hullMesh]); if (!h) return;
    if (!d.snapped) { weSnap(); d.snapped = true; }
    m.p = [h.point.x, h.point.y, h.point.z].map((v) => Math.round(v * 10000) / 10000); m.t = tiltOf(h);
    if (d.partner >= 0 && weMounts()[d.partner]) weMirrorInto(m, weMounts()[d.partner]);
    weSync(); weUIValues(m);
  }
}
function weUIValues(m) { const set = (id, v) => { const i = WE.el.querySelector('#' + id); if (i) i.value = v; }; set('wp-x', m.p[0]); set('wp-y', m.p[1]); set('wp-z', m.p[2]); set('wp-t', m.t || 0); }
function wePointerUp(e) {
  const d = WE.drag; WE.drag = null; if (!d) return;
  if (d.mode === 'place' && !d.moved) {
    const h = weRayAt(e, [WE.hullMesh]);
    if (h) { const w = WE.place; if (!e.shiftKey) WE.place = -1; WE.ghost.visible = WE.place >= 0; wePlaceAt(h, w); }
  } else if (d.mode === 'place' && d.moved) { /* 放置模式下拖曳＝轉鏡頭 */ }
  else if (d.mode === 'orbit' && !d.moved) { if (WE.sel >= 0) { WE.sel = -1; weUI(); weSync(); } }
  else if (d.mode === 'move' && d.snapped) weChanged();
}
function weKey(e) {
  if (!WE.open) return;
  if (e.target.closest && e.target.closest('input, select, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.code, list = weMounts(), m = list[WE.sel];
  if (k === 'Escape') { e.preventDefault(); if (!WE.el.querySelector('#wed-modal').hidden) WE.el.querySelector('#wed-modal').hidden = true; else if (WE.place >= 0) { WE.place = -1; WE.ghost.visible = false; weUI(); } else if (WE.sel >= 0) { WE.sel = -1; weUI(); weSync(); } else closeWeaponEditor(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'KeyZ') { e.preventDefault(); if (e.shiftKey) weRedo(); else weUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'KeyY') { e.preventDefault(); weRedo(); return; }
  if (!m) return;
  const step = e.shiftKey ? 0.001 : 0.005;
  const edit = (fn) => { e.preventDefault(); weEdit(fn); };
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); weDelete(); }
  else if (k === 'KeyM') { e.preventDefault(); weMirror(); }
  else if (k === 'KeyR') edit((q) => (q.r = (((q.r || 0) + (e.shiftKey ? -15 : 15)) + 540) % 360 - 180));
  else if (k === 'Equal' || k === 'NumpadAdd') edit((q) => (q.s = Math.round(q.s * 1.05 * 10000) / 10000));
  else if (k === 'Minus' || k === 'NumpadSubtract') edit((q) => (q.s = Math.round(q.s / 1.05 * 10000) / 10000));
  else if (k === 'ArrowUp') edit((q) => (q.p[2] += step));
  else if (k === 'ArrowDown') edit((q) => (q.p[2] -= step));
  else if (k === 'ArrowLeft') edit((q) => (q.p[0] -= step));
  else if (k === 'ArrowRight') edit((q) => (q.p[0] += step));
  else if (k === 'PageUp') edit((q) => (q.p[1] += step));
  else if (k === 'PageDown') edit((q) => (q.p[1] -= step));
}
function weLoop() {
  if (!WE.open) { WE.raf = 0; return; }
  const o = WE.orb, cp = Math.cos(o.pitch);
  WE.cam.position.set(o.tx + Math.sin(o.yaw) * cp * o.dist, o.ty + Math.sin(o.pitch) * o.dist, o.tz + Math.cos(o.yaw) * cp * o.dist);
  WE.cam.lookAt(o.tx, o.ty, o.tz);
  const s = WE.wGroup.children[WE.sel]; if (s) { s.updateMatrixWorld(true); WE.box.setFromObject(s); }
  WE.r.render(WE.scene, WE.cam);
  WE.raf = requestAnimationFrame(weLoop);
}
// 2D 預覽：原本的船體貼圖＋這裡算出的武器疊圖
function weDraw2DSoon() { clearTimeout(WE.t2); WE.t2 = setTimeout(weDraw2D, 60); }
function weDraw2D() {
  if (!WE.open || !WE.shipImg.complete) return;
  const hk = WE.hk, side = hk[0] === 'a' ? 1 : 0, t = +hk[1];
  renderWeaponCells(WE.r, WE.rt2, Array.from({ length: 8 }, (_, d) => ({ hk, d, x: d * 256, y: 0 })));
  const px = new Uint8Array(2048 * 192 * 4); WE.r.readRenderTargetPixels(WE.rt2, 0, 0, 2048, 192, px);
  const img = new ImageData(2048, 192);
  for (let y = 0; y < 192; y++) for (let x = 0; x < 2048; x++) {   // 上下翻轉、去掉預乘
    const s = ((191 - y) * 2048 + x) * 4, d = (y * 2048 + x) * 4, a = px[s + 3];
    if (!a) continue;
    img.data[d] = Math.min(255, px[s] * 255 / a); img.data[d + 1] = Math.min(255, px[s + 1] * 255 / a); img.data[d + 2] = Math.min(255, px[s + 2] * 255 / a); img.data[d + 3] = a;
  }
  const c = WE.c2.getContext('2d'); c.clearRect(0, 0, 2048, 192);
  c.drawImage(WE.shipImg, side * 2048, t * 192, 2048, 192, 0, 0, 2048, 192);
  const tmp = document.createElement('canvas'); tmp.width = 2048; tmp.height = 192; tmp.getContext('2d').putImageData(img, 0, 0);
  c.drawImage(tmp, 0, 0);
}
