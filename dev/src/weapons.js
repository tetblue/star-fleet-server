// ═══════════════════════ 武器：掛點資料、2D 疊圖、配置編輯器 ═══════════════════════
// 掛點用船體模型座標（船長＝1，船頭＋z、上＋y、右＋x）。3D 直接當實例畫在船上；
// 2D 則用同一套掛點，從與原始貼圖相同的鏡頭把武器算成一張疊圖（被船身擋住的部分會被遮掉）
const WEAPON_NAMES = [
  ['三聯裝巨砲塔', '雙聯裝砲塔', '舷砲砲座模組', '防空砲塔', '魚雷發射管組', '金色衝角砲'],
  ['三聯裝主砲塔', '雙聯裝副砲塔', '垂直飛彈發射模組', '防空砲塔', '魚雷發射管組', '貫穿式主砲'],
  ['拼裝三聯裝主砲塔', '臨時加裝軌道砲', '外掛飛彈箱', '雙管機砲塔', '纜帶綁掛魚雷管', '機械抓臂'],
  ['液壓三聯裝主砲塔', '機械頭顱雙聯裝砲塔', '機械臂飛彈發射架', '液壓驅動長管主砲', '魚雷發射管組', '防空雙管砲塔'],
  ['懸浮稜形激光砲塔', '裂頭式能量主砲', '能量矛主砲', '翼掛魚雷發射器', '防空激光節點', '三角攻擊無人機'],
  ['感染主砲塔', '甲殼包覆雙聯裝砲塔', '骨顎寄生主砲', '感染飛彈發射區', '膿囊魚雷管', '骨翼飛彈掛架'],
  ['生物砲囊', '毒刺尾砲', '生物刺槍口器', '酸液噴射孔群', '巨顎衝角', '生物戰機'],
];
// 武器配置可選的風格（模型鍵字首，順序＝陣營編號）：帝國、聯盟、傭兵，以及只當敵軍外觀的四個風格
const STYLES = [['e', '帝國軍'], ['a', '聯盟軍'], ['m', '傭兵'], ['c', '機械改造人類'], ['r', '機械智慧族'], ['i', '蟲族感染人類'], ['b', '蟲族']];
const STATION_NAMES = ['太空站・小', '太空站・中', '太空站・大'];   // 鍵＝風格＋s＋0～2（例如 es1）
const WEAPON_DEF_S = [0.2, 0.12, 0.08, 0.06, 0.09, 0.18];   // 新放上去的預設尺寸（船長的比例）
const HULL_NAMES = ['航空母艦', '戰列艦', '巡洋艦', '驅逐艦', '護衛艦'];
// 2D 貼圖的鏡頭校正（用船體輪廓對齊原圖求得，30° 俯角、正交）：每單位幾 px、垂直位移 px
const ATLAS_CAL = { e0: [244, -5.0], e1: [252, -12.3], e2: [248, -10.7], e3: [248, -14.5], e4: [248, -12.6], a0: [248, -6.6], a1: [248, -6.4], a2: [248, -10.0], a3: [248, -1.0], a4: [252, 4.3],
  m0: [250, -9.2], m1: [252, -13.2], m2: [248, -13.5], m3: [248, 0], m4: [249, 0.8],   // m3 的貼圖用修正船頭方向後的模型重畫過
  // 機械改造人類、機械智慧族、蟲族感染人類、蟲族：貼圖就是用這組校正從模型畫出來的
  c0: [248, 0], c1: [248, 0], c2: [248, 0], c3: [248, 0], c4: [248, 0], r0: [248, 0], r1: [248, 0], r2: [248, 0], r3: [248, 0], r4: [248, 0],
  i0: [248, 0], i1: [248, 0], i2: [248, -1.1], i3: [248, 0], i4: [248, 0], b0: [248, 0], b1: [248, 0], b2: [248, 0], b3: [248, 0], b4: [248, 0] };
const HULL_KEYS = 'eamcrib'.split('').flatMap((f) => [0, 1, 2, 3, 4].map((t) => f + t));
const STATION_KEYS = STYLES.flatMap(([f]) => [0, 1, 2].map((i) => f + 's' + i));
const MOUNT_KEYS = [...HULL_KEYS, ...STATION_KEYS];
const facOfKey = (hk) => Math.max(0, 'eamcrib'.indexOf(hk[0]));   // 模型鍵 → 陣營（0 帝國、1 聯盟、2 傭兵、3 機械改造人類、4 機械智慧族、5 蟲族感染人類、6 蟲族）
// 貼圖裡的格子（左上角，影像座標）：每 1024 px 一段，每段左右各一個陣營（8 方向 × 5 艦種）
const atlasXY = (fac, t, d) => [((fac % 2) * 8 + d) * 256, Math.floor(fac / 2) * 1024 + t * 192];
const D2R = Math.PI / 180;
const MOUNT_STORE = 'fleet.mounts';

function cloneMounts(o) { return JSON.parse(JSON.stringify(o)); }
function validMount(m) { return !!m && Number.isInteger(m.w) && m.w >= 0 && m.w < 6 && Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite) && Number.isFinite(m.s) && m.s > 0; }
function cleanMount(m) { return { w: m.w, p: m.p.map((v) => Math.round(v * 10000) / 10000), r: Math.round((+m.r || 0) * 10) / 10, t: Math.round((+m.t || 0) * 10) / 10, s: Math.round(m.s * 10000) / 10000 }; }
function readMounts(obj) {   // 不認得的鍵、壞掉的項目都略過；沒有的艦種用預設
  const d = cloneMounts(MOUNTS_DEFAULT), src = obj && (obj.m || obj);
  if (src && typeof src === 'object') for (const k of MOUNT_KEYS) if (Array.isArray(src[k])) d[k] = src[k].filter(validMount).map(cleanMount);
  // 第 1 版的傭兵驅逐艦（m3）模型船頭方向放反了：舊存檔的掛點換到船身上同一個位置（前後、左右對調；朝向不變，仍然朝船頭）
  if (src && typeof src === 'object' && obj.v === 1 && Array.isArray(src.m3)) d.m3 = d.m3.map((m) => ({ ...m, p: [-m.p[0] || 0, m.p[1], -m.p[2] || 0] }));
  // 第 3 版之前太空站沒有預設武器：只要打開過編輯器就會存成空的清單，這種空清單改用新的預設
  if (src && typeof src === 'object' && obj.m && !(obj.v >= 3)) for (const k of STATION_KEYS) if (Array.isArray(src[k]) && !src[k].length && MOUNTS_DEFAULT[k]) d[k] = cloneMounts(MOUNTS_DEFAULT[k]);
  return d;
}
let MOUNTS = (() => { try { return readMounts(JSON.parse(STORE.getItem(MOUNT_STORE) || 'null')); } catch (e) { return readMounts(null); } })();
function saveMounts() { try { STORE.setItem(MOUNT_STORE, JSON.stringify({ v: 3, m: MOUNTS })); } catch (e) { /* 只在本次有效 */ } }
function mountsOf(hk) { return (MOUNTS[hk] || []).map((m) => ({ ...m, hk })); }
function mountsChanged(hk) { saveMounts(); R3.version = -1; scheduleWeaponAtlas(hk); }

// ───── 主題色：每個風格一個顏色，船體、武器（3D 與 2D）一起換色（著色器在 main.js 的 THEME_GLSL）─────
const THEME_STORE = 'fleet.theme';
const THEME_SW = [['', '原色'], ['#d8413a', '紅'], ['#ee8a2a', '橙'], ['#e8c04a', '金'], ['#5cc45a', '綠'], ['#3ec8c0', '青'], ['#3f86e8', '藍'], ['#8a5ae0', '紫'], ['#e070b0', '粉'], ['#e8ecf2', '白'], ['#3a3f4a', '黑']];
const validHex = (h) => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
let THEME = (() => { try { const o = JSON.parse(STORE.getItem(THEME_STORE) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })();
function themeOf(f) { const h = THEME[FAC_KEY[f]]; return validHex(h) ? h.toLowerCase() : ''; }
function applyThemeU(f) { const h = themeOf(f), v = THEME_V[f]; if (!h) { v.set(0, 0, 0, 0); return; } const c = new THREE.Color(h); v.set(c.r, c.g, c.b, 1); }   // Color 會把 sRGB 轉成線性
for (let f = 0; f < FAC_N; f++) applyThemeU(f);
// save＝false：取色器拖曳中，只更新畫面
function setTheme(f, h, save = true) {
  if (validHex(h)) THEME[FAC_KEY[f]] = h.toLowerCase(); else delete THEME[FAC_KEY[f]];
  applyThemeU(f);
  if (!save) return;
  try { STORE.setItem(THEME_STORE, JSON.stringify(THEME)); } catch (e) { /* 只在本次有效 */ }
  HULL_KEYS.filter((k) => k[0] === FAC_KEY[f]).forEach((k) => scheduleWeaponAtlas(k));   // 2D 的武器疊圖是 3D 材質畫的：重畫
}
// 同一套換色給畫布用（2D 預覽）：d＝RGBA 位元組（sRGB），t＝THEME_V 的一項
const S2L = Array.from({ length: 256 }, (_, i) => { const v = i / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
const l2s = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
function themePixels(d, t) {
  if (t.w < 0.5) return;
  const tx = Math.max(t.x, t.y, t.z), tn = Math.min(t.x, t.y, t.z), ts = tx > 1e-4 ? (tx - tn) / tx : 0;
  const hue = tx - tn > 1e-4 ? [t.x, t.y, t.z].map((v) => (v - tn) / (tx - tn)) : [1, 1, 1];
  const ks = Math.min(1, ts * 1.6), kv = 1 + (Math.pow(tx, 0.4545) - 1) * 0.55;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = S2L[d[i]], g = S2L[d[i + 1]], b = S2L[d[i + 2]], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = mx > 1e-4 ? (mx - mn) / mx : 0, s2 = (s + (1 - s) * 0.18) * ks, v2 = mx * kv;
    for (let k = 0; k < 3; k++) d[i + k] = l2s(Math.min(1, v2 * (1 + (hue[k] - 1) * s2)));
  }
}

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
function atlasCells(hk) { const fac = facOfKey(hk), t = +hk[1]; return Array.from({ length: 8 }, (_, d) => { const [x, y] = atlasXY(fac, t, d); return { hk, d, x, y: 4096 - y - 192 }; }); }   // rt 的 y 從下往上
async function buildWeaponAtlas(only) {
  const keys = (only && only.length ? only : HULL_KEYS).filter((k) => getModel(k));   // 沒有模型的船體（素材還沒放）就不畫
  const need = new Set(); for (const hk of keys) { need.add(hk); for (const m of MOUNTS[hk] || []) need.add(hk[0] + 'w' + m.w); }
  await Promise.all([...need].map((k) => getModel(k) && getModel(k).ready));
  if (!WA.rt) {
    WA.rt = new THREE.WebGLRenderTarget(4096, 4096, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    WA.rt.texture.anisotropy = 4;
    renderWeaponCells(renderer, WA.rt, keys.flatMap(atlasCells));
  } else renderWeaponCells(renderer, WA.rt, keys.flatMap(atlasCells));
  applyWeapon2D();
}
function applyWeapon2D() { shipMat.uniforms.uWTex.value = WA.rt && SETTINGS.weapons2D !== false ? WA.rt.texture : NO_WTEX; }
function scheduleWeaponAtlas(hk) {
  if (hk && !ATLAS_CAL[hk]) return;   // 太空站沒有 2D 貼圖：不用畫疊圖
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
      <div class="wed-seg" id="wed-fac">${STYLES.map(([f, n]) => `<button data-f="${f}">${n}</button>`).join('')}</div>
      <div class="wed-seg" id="wed-type">${HULL_NAMES.map((n, i) => `<button data-t="${i}">${n}</button>`).join('')}</div>
      <div class="wed-seg" id="wed-st">${STATION_NAMES.map((n, i) => `<button data-t="s${i}">${n}</button>`).join('')}</div>
      <span class="g-sp"></span>
      <button class="g-btn sm" id="wed-undo" title="復原（Ctrl＋Z）">↶</button><button class="g-btn sm" id="wed-redo" title="重做（Ctrl＋Y）">↷</button>
      <button class="g-btn sm" id="wed-io">匯出／匯入</button><label class="wed-chk" title="編輯有對稱夥伴的武器時，另一側跟著動"><input type="checkbox" id="wed-sym" checked>左右對稱</label><button class="g-btn sm" id="wed-reset">此艦預設</button><button class="g-btn sm" id="wed-resetall">全部預設</button>
      <button class="g-btn sm pri" id="wed-done">完成</button></div>
    <div class="wed-body">
      <div class="wed-view" id="wed-view"><canvas id="wed-c"></canvas>
        <div class="wed-cams"><button class="g-btn sm" data-cam="iso">斜視</button><button class="g-btn sm" data-cam="top">俯視</button><button class="g-btn sm" data-cam="side">側視</button><button class="g-btn sm" data-cam="front">正面</button><button class="g-btn sm" data-cam="game">遊戲角度</button></div>
        <div class="wed-hint" id="wed-hint"></div></div>
      <div class="wed-side">
        <h4>主題色 <small id="wed-thn"></small></h4><div class="wed-theme" id="wed-theme"></div>
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
  $('wed-fac').onclick = (e) => { const f = e.target.dataset.f; if (f) { const it = WE.hk.slice(1); WE.hk = f + (weHas(f + it) ? it : 's0'); weLoadHull(); } };   // 這個風格沒有這種船：改看小型太空站
  const pickType = (e) => { const t = e.target.dataset.t; if (t != null && !e.target.disabled) { WE.hk = WE.hk[0] + t; weLoadHull(); } };
  $('wed-type').onclick = pickType; $('wed-st').onclick = pickType;
  $('wed-done').onclick = closeWeaponEditor;
  $('wed-undo').onclick = weUndo; $('wed-redo').onclick = weRedo;
  $('wed-reset').onclick = () => { weSnap(); MOUNTS[WE.hk] = cloneMounts(MOUNTS_DEFAULT[WE.hk] || []); WE.sel = -1; weChanged(); };
  $('wed-resetall').onclick = () => { weSnap(); MOUNTS = readMounts(null); WE.sel = -1; weChanged(true); };
  $('wed-io').onclick = () => { $('wed-json').value = JSON.stringify({ v: 3, m: MOUNTS }); $('wed-iomsg').textContent = ''; $('wed-modal').hidden = false; };
  $('wed-ioclose').onclick = () => { $('wed-modal').hidden = true; };
  $('wed-copy').onclick = () => { const t = $('wed-json'); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 無法複製 */ } if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(() => ($('wed-iomsg').textContent = '已複製'), () => {}); $('wed-iomsg').textContent = ok ? '已複製' : '已選取，請按 Ctrl＋C'; };
  $('wed-apply').onclick = () => {
    try { const o = JSON.parse($('wed-json').value); weSnap(); MOUNTS = readMounts(o); WE.sel = -1; weChanged(true); $('wed-iomsg').textContent = '已套用'; }
    catch (e) { $('wed-iomsg').textContent = '格式不對：' + e.message; }
  };
  el.querySelector('.wed-cams').onclick = (e) => { const c = e.target.dataset.cam; if (c) weCamPreset(c); };
  $('wed-theme').onclick = (e) => { const b = e.target.closest('[data-th]'); if (!b) return; setTheme(facOfKey(WE.hk), b.dataset.th); weThemeUI(); weDraw2DSoon(); };
  $('wed-theme').oninput = (e) => { if (e.target.type === 'color') { setTheme(facOfKey(WE.hk), e.target.value, false); weDraw2DSoon(); } };   // 拖曳中只換畫面
  $('wed-theme').onchange = (e) => { if (e.target.type === 'color') { setTheme(facOfKey(WE.hk), e.target.value); weThemeUI(); weDraw2DSoon(); } };
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
// 伺服器有沒有這個模型（太空站等晚載入的模型，還沒下載也算有）
function weHas(k) { return !!(MODEL_SRC[k] || (MODEL_LOAD.man && MODEL_LOAD.man.models[k])); }
function weLoadHull() {
  const hk = WE.hk, need = [hk, ...[0, 1, 2, 3, 4, 5].map((w) => hk[0] + 'w' + w)];
  WE.sel = -1; WE.place = -1; WE.ghost.visible = false;
  const has2D = !!ATLAS_CAL[hk], p2 = WE.el.querySelector('.wed-2d');
  if (p2.hidden === has2D) { p2.hidden = !has2D; weResize(); }   // 太空站沒有 2D 貼圖：收起 2D 預覽
  if (need.some((k) => !getModel(k) && weHas(k))) {   // 還沒下載：先清空畫面，載完再顯示
    WE.loading = true; WE.hullMesh.geometry = new THREE.BufferGeometry();
    weSync(); weUI(); if (!WE.raf) weLoop();
    ensureModels(need).then(() => { if (WE.open && WE.hk === hk) { WE.loading = false; weLoadHull(); } });
    return;
  }
  WE.loading = false;
  const M = getModel(hk);
  if (!M) { if (hk !== 'e1') { WE.hk = 'e1'; weLoadHull(); } return; }   // 這個模型沒放進 models/：退回帝國戰列艦
  WE.hullMesh.geometry = M.lods[0]; WE.hullMesh.material = M.mat;
  if (has2D) Promise.all(need.map((k) => getModel(k) && getModel(k).ready)).then(() => weDraw2D());
  weSync(); weUI(); if (!WE.raf) weLoop();
}
function weMounts() { return MOUNTS[WE.hk] || (MOUNTS[WE.hk] = []); }
// 3D 場景跟著資料重建
function weSync() {
  const list = weMounts(), g = WE.wGroup;
  while (g.children.length > list.length) g.remove(g.children[g.children.length - 1]);
  list.forEach((m, i) => {
    let o = g.children[i]; if (!o) { o = new THREE.Mesh(); g.add(o); }
    const W = !WE.loading && getModel(WE.hk[0] + 'w' + m.w); o.visible = !!W; o.userData.i = i;
    if (W) { o.geometry = W.lods[0]; o.material = W.mat; setMountObj(o, m); }
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
  const el = WE.el, fac = facOfKey(WE.hk), list = weMounts(), names = WEAPON_NAMES[fac], cls = FACTION_CLS[fac] || '';
  el.querySelectorAll('#wed-fac button').forEach((b) => b.className = b.dataset.f === WE.hk[0] ? 'on ' + cls : '');
  el.querySelectorAll('#wed-type button, #wed-st button').forEach((b) => { b.className = b.dataset.t === WE.hk.slice(1) ? 'on ' + cls : ''; b.disabled = !weHas(WE.hk[0] + b.dataset.t); });
  weThemeUI();
  el.querySelector('#wed-pal').innerHTML = names.map((n, w) => `<button class="g-btn sm ${WE.place === w ? 'pri' : ''}" data-w="${w}">${n}</button>`).join('');
  el.querySelector('#wed-n').textContent = `（${list.length}）`;
  el.querySelector('#wed-list').innerHTML = list.length ? list.map((m, i) => `<button class="wed-it ${i === WE.sel ? 'on' : ''}" data-i="${i}"><b>${i + 1}</b>${names[m.w]}<span>${m.p[0] < -0.01 ? '左' : m.p[0] > 0.01 ? '右' : '中'}・${m.p[2] > 0.15 ? '前' : m.p[2] < -0.15 ? '後' : '中段'}</span></button>`).join('') : '<p class="g-dim">還沒有武器，從上面挑一個放上去。</p>';
  el.querySelector('#wed-undo').disabled = !WE.undo.length; el.querySelector('#wed-redo').disabled = !WE.redo.length;
  const m = list[WE.sel], prop = el.querySelector('#wed-prop');
  WE.el.querySelector('#wed-hint').textContent = WE.loading ? '模型載入中…' : WE.place >= 0 ? `放置「${names[WE.place]}」：在船身上點一下（Esc 取消）` : '左鍵拖曳旋轉・右鍵拖曳平移・滾輪縮放・點武器選取、拖曳沿船身移動・Delete 刪除・M 鏡像複製・R 轉 15°';
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
// 主題色：目前風格的色票＋自訂取色器
function weThemeUI() {
  const f = facOfKey(WE.hk), cur = themeOf(f), el = WE.el.querySelector('#wed-theme'), sw = THEME_SW.some(([h]) => h === cur);
  WE.el.querySelector('#wed-thn').textContent = `${STYLES[f][1]}・船體與武器一起換色`;
  el.innerHTML = THEME_SW.map(([h, n]) => `<button class="wed-sw${h === cur ? ' on' : ''}${h ? '' : ' org'}" data-th="${h}" title="${n}" style="--c:${h || 'transparent'}"><i></i><span>${n}</span></button>`).join('')
    + `<label class="wed-sw pick${cur && !sw ? ' on' : ''}" title="自訂顏色"><input type="color" value="${cur || '#7fa8d8'}"><i style="--c:${cur && !sw ? cur : 'transparent'}"></i><span>自訂</span></label>`;
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
      const h = !WE.loading && weRayAt(e, [WE.hullMesh]); WE.ghost.visible = !!h;
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
  if (!WE.open || !WE.shipImg.complete || !ATLAS_CAL[WE.hk]) return;
  const hk = WE.hk, fac = facOfKey(hk), t = +hk[1], [sx, sy] = atlasXY(fac, t, 0);
  renderWeaponCells(WE.r, WE.rt2, Array.from({ length: 8 }, (_, d) => ({ hk, d, x: d * 256, y: 0 })));
  const px = new Uint8Array(2048 * 192 * 4); WE.r.readRenderTargetPixels(WE.rt2, 0, 0, 2048, 192, px);
  const img = new ImageData(2048, 192);
  for (let y = 0; y < 192; y++) for (let x = 0; x < 2048; x++) {   // 上下翻轉、去掉預乘
    const s = ((191 - y) * 2048 + x) * 4, d = (y * 2048 + x) * 4, a = px[s + 3];
    if (!a) continue;
    img.data[d] = Math.min(255, px[s] * 255 / a); img.data[d + 1] = Math.min(255, px[s + 1] * 255 / a); img.data[d + 2] = Math.min(255, px[s + 2] * 255 / a); img.data[d + 3] = a;
  }
  const c = WE.c2.getContext('2d'); c.clearRect(0, 0, 2048, 192);
  c.drawImage(WE.shipImg, sx, sy, 2048, 192, 0, 0, 2048, 192);
  if (THEME_V[fac].w > 0.5) { const sh = c.getImageData(0, 0, 2048, 192); themePixels(sh.data, THEME_V[fac]); c.putImageData(sh, 0, 0); }
  const tmp = document.createElement('canvas'); tmp.width = 2048; tmp.height = 192; tmp.getContext('2d').putImageData(img, 0, 0);
  c.drawImage(tmp, 0, 0);
}
