// 戰艦組裝編輯器：用「戰艦建模」做出來的船身部件、零件（砲塔、砲座、推進器…）、細節元件拼裝新戰艦。
// 素材：models/戰艦組裝/library.json（dev/tools/shipyard/import.mjs 產生）。每艘船每個塗裝一個整艦 GLB，這裡依節點名稱拆成部件：
//   「部件.細節名」「部件_材質」都屬於那個部件（kit.py 的 PARTS，取最長的符合者）；名稱以 .R 結尾的是鏡像到另一舷的那一半，
//   只有部件本體也有 .R 的（新月戰艦的臂）才拆成兩個部件。零件與細節來自各船的 零件庫.glb（不含貼圖），材質依名稱換成所選塗裝的。
// 設計：{ name, pieces: [{ id, ship, v(塗裝), k: 'part'|'lib', n(名稱), p[3], r[3](度), s[3] }] }，存在伺服器 models/戰艦組裝/designs.json。
// 座標和素材一樣：+x 船首、+y 上、+z 右舷，單位公尺。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const D2R = Math.PI / 180;
const r1 = (x) => Math.round(x * 1000) / 1000;

const PART_NAMES = {
  hull: '船身', bow: '船首', stern: '船尾', engines: '引擎', citadel: '艦橋堡', pontoons: '浮筒', shields: '護盾', weapons: '武裝',
  superstructure: '上層建築', hangar: '機庫', mid: '中段', ring: '環段', arm_fore: '前臂', arm_mid: '中臂', arm_aft: '後臂',
  core_tower: '核心塔', core_mid: '核心中段', core_aft: '核心後段', engine_block: '引擎座', thrusters: '推進器組', bow_prong: '叉首',
  bow_centre: '船首中央', hull_fore: '前船身', hull_mid: '中船身', hull_aft: '後船身', bridge: '艦橋', crest: '紋章', crest_top: '頂部紋章', crest_side: '側面紋章',
};
const LIB_NAMES = {
  ball_mount: '球型砲座', casemate: '舷砲廓', dome: '圓頂', escape_pod: '逃生艙', gun_port: '砲門', gun_port_triple: '三聯砲門',
  hangar_door: '機庫門', launch_bay: '發射艙', low_turret: '低砲塔', main_turret: '主砲塔', shield_gun: '護盾砲', shield_gun_triple: '三聯護盾砲',
  stack: '煙囪', thruster: '推進器', triple_turret: '三聯砲塔', wing_turret: '側翼砲塔', twin_turret: '雙聯砲塔', missile_cell: '飛彈艙',
  antenna_whip: '鞭狀天線', bolt_strip: '螺栓條', dish_small: '小碟形天線', door: '艙門', hatch_round: '圓艙蓋', hatch_square: '方艙蓋',
  heatsink: '散熱片', panel_recess: '凹板', plate_dark: '深色裝甲板', plate_light: '淺色裝甲板', plate_mid: '中色裝甲板', seam: '接縫',
  vent_slat: '百葉通風口', vent_round: '圓通風口', window: '舷窗', window_lit: '亮舷窗', handrail: '扶手', junction_box: '接線盒',
  sensor_dome: '感測罩', nav_light: '航行燈', crate: '貨箱', pipe: '管線', pipe_clamp: '管夾', pipe_joint: '管接頭',
};
const partLabel = (key) => {
  const R = key.endsWith('.R'), b = key.replace(/\.R$/, '').replace(/^x:/, '');
  return (PART_NAMES[b] || b) + (R ? '（另一舷）' : '');
};
const libLabel = (n) => { const b = n.replace(/^(component|detail)_/, ''); return LIB_NAMES[b] || b; };
const varLabel = (v) => v.replace(/_/g, '・');

function authHeaders() {   // 和遊戲共用 localStorage 的 fleet.session
  try { const s = JSON.parse(localStorage.getItem('fleet.session') || 'null'); if (s && s.token) return { Authorization: 'Bearer ' + s.token }; } catch (e) { /* 沒登入 */ }
  return {};
}
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 無痕或停用 */ } };

let toastT = 0;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = 'on' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), bad ? 5000 : 2500); }
let busyN = 0;
function busy(on) { busyN += on ? 1 : -1; $('busy').classList.toggle('on', busyN > 0); }

// ───── 畫面 ─────
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1020);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x202430, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(0.6, 1, 0.4); scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 40000);
camera.position.set(900, 520, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };   // 左鍵拖空白處＝旋轉視角，點一下＝選取
controls.autoRotateSpeed = 1.5;
// 按在控制軸上時先關掉視角控制（capture 階段，比 OrbitControls 的監聽先跑），放開再打開
document.getElementById('view').addEventListener('pointerdown', () => { controls.enabled = !(tc.object && tc.axis); }, true);
window.addEventListener('pointerup', () => { if (!tc.dragging) controls.enabled = true; });
const grid = new THREE.GridHelper(3000, 60, 0x2b4466, 0x16243a); scene.add(grid);
const axes = new THREE.Group(); scene.add(axes);
axes.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 800, 0x5cc8ff, 60, 30));   // 船首
axes.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 250, 0xffd27a, 30, 15));
const world = new THREE.Group(); scene.add(world);
const selBoxes = new THREE.Group(); scene.add(selBoxes);
const tc = new TransformControls(camera, renderer.domElement);
tc.setSpace('world');
scene.add(tc);
const pivot = new THREE.Object3D(); scene.add(pivot);   // 選取多個時，拖曳的是這個

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
function loop() {   // 在檔尾（狀態都建好後）開始
  requestAnimationFrame(loop); controls.update();
  for (const b of selBoxes.children) { const o = OBJ.get(b.userData.pid); if (o) { o.updateMatrixWorld(); b.box.copy(o.userData.box).applyMatrix4(o.matrixWorld); } }
  renderer.render(scene, camera);
  $('stat').textContent = `${S.pieces.length} 個部件・${fmtK(triCount())} 面・繪製 ${renderer.info.render.calls} 次`;
}
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(n));

// ───── 素材 ─────
const loader = new GLTFLoader();
const glbCache = new Map();
const urlOf = (file) => '../models/戰艦組裝/' + file.split('/').map(encodeURIComponent).join('/');
function loadGLB(file) {
  if (!glbCache.has(file)) glbCache.set(file, new Promise((res, rej) => { busy(true); loader.load(urlOf(file), (g) => { busy(false); res(g); }, undefined, (e) => { busy(false); glbCache.delete(file); rej(new Error('讀不到 ' + file)); }); }));
  return glbCache.get(file);
}
const LIB = { ships: [], byId: {} };
const shipCache = new Map(), libCache = new Map();
const flipCache = new WeakMap();
function flipGeo(geo) {   // 鏡像的實例：三角形繞向反過來，InstancedMesh 不會像一般物件那樣自己處理
  let g = flipCache.get(geo); if (g) return g;
  g = geo.clone();
  const idx = g.index ? g.index.array.slice() : Uint32Array.from({ length: g.attributes.position.count }, (_, i) => i);
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  flipCache.set(geo, g); return g;
}
// glTF 節點 → three 物件。不能用 parser.associations 或 o.name：共用網格的複本共用同一個關聯（節點索引被最後一個蓋掉），
// 名稱又被 sanitize 拿掉了「.」。getDependency('node', i) 回傳的就是放進場景的那個物件；多個 primitive 時是 Group，網格在 children。
async function nodeMeshes(gl) {
  const json = gl.parser.json, out = [], objs = new Map();
  for (let i = 0; i < json.nodes.length; i++) if (json.nodes[i].mesh !== undefined) objs.set(i, await gl.parser.getDependency('node', i));
  const isNode = new Set(objs.values());
  for (const [i, o] of objs) {
    const meshes = o.isMesh ? [o] : o.children.filter((c) => c.isMesh && !isNode.has(c));
    out.push({ node: json.nodes[i].name || '', mesh: (json.meshes[json.nodes[i].mesh] || {}).name || '', meshes });
  }
  return out;
}
// 一組網格（世界矩陣）→ 依幾何＋材質＋是否鏡像分組；recenter 時移到外框中心
function makeAsset(entries, recenter) {
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  for (const e of entries) { if (!e.geo.boundingBox) e.geo.computeBoundingBox(); box.union(tmp.copy(e.geo.boundingBox).applyMatrix4(e.m)); }
  const center = recenter ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const sh = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
  const groups = new Map(); let tris = 0;
  for (const e of entries) {
    const flip = e.m.determinant() < 0, k = e.geo.uuid + '|' + e.mat.uuid + '|' + flip;
    let g = groups.get(k); if (!g) groups.set(k, (g = { geo: e.geo, mat: e.mat, flip, ms: [] }));
    g.ms.push(sh.clone().multiply(e.m));
    tris += (e.geo.index ? e.geo.index.count : e.geo.attributes.position.count) / 3;
  }
  return { center: center.toArray().map(r1), box: box.translate(center.clone().negate()), items: [...groups.values()], tris };
}
async function shipAssets(shipId, v) {
  const key = shipId + '|' + v;
  if (!shipCache.has(key)) shipCache.set(key, (async () => {
    const ship = LIB.byId[shipId], vv = ship.variants.find((x) => x.name === v) || ship.variants[0];
    const gl = await loadGLB(vv.file), nodes = await nodeMeshes(gl);
    gl.scene.updateMatrixWorld(true);
    const ents = [], mats = new Map(), scl = new Map();
    for (const { node, mesh, meshes } of nodes) {
      const base = node.split('.')[0];
      let part = null; for (const p of ship.parts) if ((base === p || base.startsWith(p + '_')) && (!part || p.length > part.length)) part = p;
      for (const o of meshes) {
        ents.push({ o, node, base, part, R: /\.R$/.test(node) });
        for (const m of [].concat(o.material)) if (m.name && !mats.has(m.name)) mats.set(m.name, m);
      }
      if (/^(component|detail)_/.test(mesh) && meshes[0]) {   // 零件在這艘船上的常用大小
        const s = r1(Math.cbrt(Math.abs(meshes[0].matrixWorld.determinant())));
        const c = scl.get(mesh) || new Map(); c.set(s, (c.get(s) || 0) + 1); scl.set(mesh, c);
      }
    }
    const split = new Set(ents.filter((e) => e.part && !e.node.replace(/\.R$/, '').includes('.') && e.R).map((e) => e.part));
    const byPart = new Map();
    for (const e of ents) {
      const k = e.part ? (split.has(e.part) && e.R ? e.part + '.R' : e.part) : 'x:' + e.base.replace(/_(left|right|top|bottom)$/, '');
      if (!byPart.has(k)) byPart.set(k, []);
      byPart.get(k).push({ geo: e.o.geometry, mat: e.o.material, m: e.o.matrixWorld.clone() });
    }
    const parts = new Map();
    const order = (k) => { const b = k.replace(/\.R$/, ''); const i = ship.parts.indexOf(b); return (i < 0 ? 99 : i) * 2 + (k.endsWith('.R') ? 1 : 0); };
    for (const k of [...byPart.keys()].sort((a, b) => order(a) - order(b))) parts.set(k, makeAsset(byPart.get(k), true));
    const compScale = new Map();
    for (const [n, c] of scl) compScale.set(n, [...c].sort((a, b) => b[1] - a[1])[0][0]);
    return { parts, mats, compScale };
  })());
  return shipCache.get(key);
}
const libStyle = (ship, v) => (v.startsWith('機戰風') && ship.libs['機戰風'] ? '機戰風' : '標準');
async function libAssets(shipId, style) {
  const key = shipId + '|' + style;
  if (!libCache.has(key)) libCache.set(key, (async () => {
    const ship = LIB.byId[shipId], file = ship.libs[style] || ship.libs['標準'];
    if (!file) return new Map();
    const gl = await loadGLB(file), nodes = await nodeMeshes(gl);
    gl.scene.updateMatrixWorld(true);
    const by = new Map();
    for (const { node, meshes } of nodes) {
      const n = node.split('.')[0];
      if (!by.has(n)) by.set(n, []);
      for (const o of meshes) by.get(n).push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() });
    }
    const out = new Map();
    for (const n of [...by.keys()].sort()) out.set(n, makeAsset(by.get(n), false));
    return out;
  })());
  return libCache.get(key);
}
async function assetOf(pc) {
  if (pc.k === 'slot') return { a: slotAsset(pc.kind, pc.arc || 0), gear: S.showGear ? await gearAsset(pc).catch(() => null) : null };
  const ship = LIB.byId[pc.ship]; if (!ship) throw new Error('素材庫沒有 ' + pc.ship);
  if (pc.k === 'part') { const a = (await shipAssets(pc.ship, pc.v)).parts.get(pc.n); if (!a) throw new Error(`${ship.name} 沒有部件 ${pc.n}`); return { a }; }
  const [lib, sa] = await Promise.all([libAssets(pc.ship, libStyle(ship, pc.v)), shipAssets(pc.ship, pc.v)]);
  const a = lib.get(pc.n); if (!a) throw new Error(`${ship.name} 的零件庫沒有 ${pc.n}`);
  return { a, mats: sa.mats };   // 零件庫沒有貼圖：材質依名稱換成這個塗裝的
}
function buildObject(a, mats) {
  const g = new THREE.Group();
  for (const it of a.items) {
    const mat = (mats && it.mat.name && mats.get(it.mat.name)) || it.mat;
    let o;
    if (it.ms.length === 1) { o = new THREE.Mesh(it.geo, mat); o.matrixAutoUpdate = false; o.matrix.copy(it.ms[0]); }
    else {
      o = new THREE.InstancedMesh(it.flip ? flipGeo(it.geo) : it.geo, mat, it.ms.length);
      it.ms.forEach((m, i) => o.setMatrixAt(i, m));
      o.computeBoundingSphere();
    }
    if (it.slot) o.renderOrder = 1000;   // 槽位標記：畫在船身上面
    o.userData.item = it; g.add(o);
  }
  g.userData.box = a.box; g.userData.tris = a.tris;
  return g;
}

// ───── 槽位標記（艦長模式的槽位制度，dev/艦長槽位企劃.md 第 2 步）─────
// 設計裡的一種部件：{ id, k: 'slot', kind: main|sec|aa|ftr|aux, n: 同類的序號（0 起）, arc: 射界左右各幾度, p, r, s }。
// 標記的 +x＝裝備朝向（砲口的正前方）、+y＝上；裝備的模型之後裝在這個位置與方向。同類的序號就是遊戲裡的槽位編號（main0、sec1…），升級時沿用。
const SLOT_KINDS = {
  main: { name: '主砲槽', short: '主', col: 0xff5a4a, size: 60, arc: 45 },
  sec: { name: '副砲槽', short: '副', col: 0xffb347, size: 40, arc: 120 },
  aa: { name: '防空槽', short: '防', col: 0x5cc8ff, size: 26, arc: 180 },
  ftr: { name: '艦載機槽', short: '機', col: 0x6fdc8c, size: 50, arc: 0 },
  aux: { name: '輔助槽', short: '輔', col: 0xc9a7ff, size: 36, arc: 0 },
};
const SLOT_ORDER = ['main', 'sec', 'aa', 'ftr', 'aux'];
const slotMatCache = new Map();
function slotMat(kind, op) {
  const k = kind + op; if (slotMatCache.has(k)) return slotMatCache.get(k);
  const m = new THREE.MeshBasicMaterial({ color: SLOT_KINDS[kind].col, transparent: true, opacity: op, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  slotMatCache.set(k, m); return m;
}
const slotAssetCache = new Map();
function slotAsset(kind, arc) {
  const key = kind + '|' + arc; if (slotAssetCache.has(key)) return slotAssetCache.get(key);
  const K = SLOT_KINDS[kind], sz = K.size, items = [], I = new THREE.Matrix4();
  const add = (geo, op, box) => { geo.computeBoundingBox(); items.push({ geo, mat: slotMat(kind, op), flip: false, ms: [I], slot: box ? 2 : 1 }); };
  add(new THREE.BoxGeometry(sz, sz * 0.5, sz), 0.45, true);   // 方塊（裝備預覽時藏起來，不擋住裝備）
  const cone = new THREE.ConeGeometry(sz * 0.22, sz * 0.8, 12); cone.rotateZ(-Math.PI / 2); cone.translate(sz * 0.9, 0, 0); add(cone, 0.95);
  if (arc > 0) { const fan = new THREE.CircleGeometry(sz * 2.4, 40, -arc * D2R, 2 * arc * D2R); fan.rotateX(-Math.PI / 2); add(fan, 0.14); }
  const box = new THREE.Box3(new THREE.Vector3(-sz / 2, -sz / 4, -sz / 2), new THREE.Vector3(sz * 1.3, sz / 4, sz / 2));
  const a = { center: [0, 0, 0], box, items, tris: 0 }; slotAssetCache.set(key, a); return a;
}
// 標記上的字（「主1」）：一直朝向鏡頭、不被船身擋住
function slotLabel(pc) {
  const K = SLOT_KINDS[pc.kind], cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const g = cv.getContext('2d'); g.font = 'bold 40px "Microsoft JhengHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(K.short + (pc.n + 1), 64, 34); g.fillStyle = '#' + K.col.toString(16).padStart(6, '0'); g.fillText(K.short + (pc.n + 1), 64, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }));
  sp.scale.set(0.07, 0.035, 1); sp.position.set(0, K.size * 0.75, 0); sp.renderOrder = 1001; return sp;   // 固定在畫面上的大小，拉遠也看得到
}
const isSlot = (pc) => pc && pc.k === 'slot';
// 標記隱藏時：有裝備預覽的只藏標記（方塊、箭頭、扇形、字），裝備照樣顯示
function slotVis(o) {
  const g = o.children.some((c) => c.userData.gear); o.visible = g || S.showSlots;
  for (const c of o.children) if (!c.userData.gear) c.visible = S.showSlots && !(g && c.userData.item && c.userData.item.slot === 2);
}
const slotName = (pc) => `${SLOT_KINDS[pc.kind].name} ${pc.n + 1}`;
// 同類裡沒用過的最小序號（skip＝這個部件自己不算）
function freeSlotN(kind, skip, also = []) {
  const used = new Set(S.pieces.filter((p) => isSlot(p) && p.kind === kind && p.id !== skip).map((p) => p.n).concat(also));
  let n = 0; while (used.has(n)) n++; return n;
}
// ───── 裝備外觀預覽：槽位上裝一件裝備看起來怎樣（使用者 2026-11-22）─────
// 裝備清單照遊戲的 CAP_GEAR（dev/src/caphulls.js）；外觀暫時用設計裡那艘船的零件庫（依序找第一個有的零件）。輔助裝備大中小照尺寸放大縮小。
// 之後遊戲裡的裝備外觀（槽位制度第 4 步）會照這張表。
const GEAR_LIST = [
  ['std', 'main', '原廠主砲', ['main_turret', 'triple_turret']], ['rail', 'main', '磁軌砲', ['main_turret']], ['heavy', 'main', '重粒子砲', ['triple_turret', 'main_turret']],
  ['rapid', 'main', '速射砲', ['main_turret']], ['beam', 'main', '光束砲', ['main_turret']],
  ['gun', 'sec', '標準砲塔', ['low_turret', 'casemate']], ['hgun', 'sec', '重型砲塔', ['triple_turret', 'main_turret']], ['agun', 'sec', '防空砲塔', ['ball_mount', 'low_turret']],
  ['pod', 'sec', '標準飛彈艙', ['launch_bay', 'gun_port_triple']], ['hpod', 'sec', '重飛彈艙', ['launch_bay', 'gun_port']], ['spod', 'sec', '蜂群飛彈艙', ['gun_port_triple', 'launch_bay']],
  ['pd', 'aa', '防空砲', ['ball_mount', 'low_turret']], ['lpd', 'aa', '遠程防空砲', ['ball_mount']],
  ['wing', 'ftr', '護航機中隊', ['hangar_door']], ['awing', 'ftr', '攔截機中隊', ['hangar_door']],
  ...[['armor', '實體裝甲', ['casemate', 'stack']], ['react', '反應裝甲', ['casemate']], ['shield', '能量護盾', ['shield_gun', 'dome', 'shield_gun_triple']],
    ['oc', '超頻引擎', ['thruster']], ['sprint', '衝刺超頻引擎', ['thruster']], ['agile', '機動超頻引擎', ['thruster']]]
    .flatMap(([f, nm, look]) => [['L', '大型'], ['M', '中型'], ['S', '小型']].map(([sz, sn]) => [f + sz, 'aux' + sz, sn + nm, look])),
];
const GEAR = Object.fromEntries(GEAR_LIST.map(([id, cls, name, look]) => [id, { id, cls, name, look }]));
// 能裝在哪一類槽位（和遊戲 CAP_KIND 一樣）：主砲槽＝主砲、副砲級、大型輔助；副砲槽＝副砲級、中型輔助；防空槽＝防空砲、小型輔助；艦載機槽＝艦載機；輔助槽＝大中小輔助
const SLOT_FITS = { main: ['main', 'sec', 'auxL'], sec: ['sec', 'auxM'], aa: ['aa', 'auxS'], ftr: ['ftr'], aux: ['auxL', 'auxM', 'auxS'] };
const gearFits = (kind, id) => GEAR[id] && SLOT_FITS[kind].includes(GEAR[id].cls);
const GEAR_DEF = { main: 'std', sec: 'gun', aa: 'pd', ftr: 'wing', aux: 'armorM' };
const AUX_SC = { auxL: 1.4, auxM: 1, auxS: 0.7 };
const slotLook = (pc) => (pc.look && gearFits(pc.kind, pc.look) ? pc.look : GEAR_DEF[pc.kind]);
// 預覽用哪艘船的零件庫：設計裡第一個部件的船與塗裝（沒有就用左邊素材庫選的）
const gearShip = () => { const p = S.pieces.find((x) => !isSlot(x) && x.ship); return p ? [p.ship, p.v] : [S.libShip, S.libVar]; };
async function gearAsset(pc) {
  const [sid, v] = gearShip(), ship = LIB.byId[sid]; if (!ship) return null;
  const G = GEAR[slotLook(pc)], [lib, sa] = await Promise.all([libAssets(sid, libStyle(ship, v)), shipAssets(sid, v)]);
  const name = G.look.map((n) => 'component_' + n).find((n) => lib.has(n)) || [...lib.keys()].find((n) => /turret/.test(n)); if (!name) return null;
  return { a: lib.get(name), mats: sa.mats, sc: (sa.compScale.get(name) || 1) * (AUX_SC[G.cls] || 1) };
}
const slotCounts = () => { const c = Object.fromEntries(SLOT_ORDER.map((k) => [k, 0])); for (const p of S.pieces) if (isSlot(p)) c[p.kind]++; return c; };

// ───── 狀態 ─────
const S = { designs: {}, hulls: {}, canEdit: false, curId: null, pieces: [], sel: [], undo: [], redo: [], dirty: false, nextId: 1, libShip: null, libVar: null, showSlots: true, showGear: false };
const OBJ = new Map();   // 部件 id → THREE.Group
const keyOf = (pc) => (pc.k === 'slot' ? `slot|${pc.kind}|${pc.n}|${pc.arc || 0}|${S.showGear ? slotLook(pc) + '@' + gearShip().join('|') : ''}` : `${pc.ship}|${pc.v}|${pc.k}|${pc.n}`);
const pieceOf = (id) => S.pieces.find((p) => p.id === id);
const triCount = () => { let n = 0; for (const o of OBJ.values()) n += o.userData.tris || 0; return n; };

function applyT(o, pc) {
  o.position.fromArray(pc.p); o.rotation.set(pc.r[0] * D2R, pc.r[1] * D2R, pc.r[2] * D2R); o.scale.fromArray(pc.s);
  o.updateMatrix(); o.updateMatrixWorld(true);
}
const FLIP_Q = { 1: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI), 2: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI) };
function readT(o, pc) {   // 從物件的矩陣讀回。鏡像時 decompose 把負號放在 x；原本負的是 y 或 z 就搬回那一軸（旋轉補 180°），數字才好讀
  o.updateMatrix();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  o.matrix.decompose(p, q, s);
  const k = pc.s && pc.s[0] >= 0 ? (pc.s[2] < 0 ? 2 : pc.s[1] < 0 ? 1 : 0) : 0;
  if (s.x < 0 && k) { q.multiply(FLIP_Q[k]); s.x = -s.x; s.setComponent(k, -s.getComponent(k)); }
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  pc.p = p.toArray().map(r1); pc.r = [e.x, e.y, e.z].map((x) => r1(x / D2R)); pc.s = s.toArray().map(r1);
}
let syncTok = 0;
async function sync() {   // 讓畫面上的物件和 S.pieces 一致（不同素材才重建）
  const tok = ++syncTok, alive = new Set(S.pieces.map((p) => p.id));
  for (const [id, o] of OBJ) if (!alive.has(id)) { world.remove(o); OBJ.delete(id); }
  const jobs = [];
  for (const pc of S.pieces) {
    const o = OBJ.get(pc.id);
    if (o && o.userData.key === keyOf(pc)) { applyT(o, pc); continue; }
    jobs.push(assetOf(pc).then(({ a, mats, gear }) => {
      if (tok !== syncTok && !pieceOf(pc.id)) return;
      const cur = pieceOf(pc.id); if (!cur || keyOf(cur) !== keyOf(pc)) return;
      const n = buildObject(a, mats); n.userData.pid = pc.id; n.userData.key = keyOf(pc);
      if (isSlot(cur)) {
        n.add(slotLabel(cur)); n.userData.slot = 1;
        if (gear) { const go = buildObject(gear.a, gear.mats); go.scale.setScalar(gear.sc); go.userData.gear = 1; n.add(go); }
        slotVis(n);
      }
      const old = OBJ.get(pc.id); if (old) world.remove(old);
      world.add(n); OBJ.set(pc.id, n); applyT(n, cur);
    }).catch((e) => toast(e.message, true)));
  }
  await Promise.all(jobs);
  if (tok === syncTok) refreshSel();
}

// ───── 復原 ─────
function snap() { return JSON.stringify(S.pieces); }
function pushUndo(prev) { S.undo.push(prev || snap()); if (S.undo.length > 150) S.undo.shift(); S.redo = []; markDirty(); }
function markDirty() { S.dirty = true; updHeader(); autosave(); }
function undo(redo) {
  const from = redo ? S.redo : S.undo, to = redo ? S.undo : S.redo;
  if (!from.length) return;
  to.push(snap()); S.pieces = JSON.parse(from.pop());
  S.sel = S.sel.filter((id) => pieceOf(id)); S.dirty = true; updHeader(); autosave(); sync(); renderPieces(); renderSlots();
}
function updHeader() {
  $('dirty').textContent = S.dirty ? '未儲存' : '';
  $('btnUndo').disabled = !S.undo.length; $('btnRedo').disabled = !S.redo.length;
}
let autoT = 0;
function autosave() { clearTimeout(autoT); autoT = setTimeout(() => lsSet('shipyard.work', JSON.stringify({ id: S.curId, name: $('dname').value, pieces: S.pieces, dirty: S.dirty })), 400); }

// ───── 選取與拖曳 ─────
function refreshSel() {
  S.sel = S.sel.filter((id) => OBJ.has(id) || pieceOf(id));
  selBoxes.clear();
  for (const id of S.sel) {
    const o = OBJ.get(id); if (!o) continue;
    const b = new THREE.Box3Helper(new THREE.Box3(), 0x5cc8ff); b.userData.pid = id; selBoxes.add(b);
  }
  tc.detach();
  const objs = S.sel.map((id) => OBJ.get(id)).filter(Boolean);
  if (objs.length === 1) tc.attach(objs[0]);
  else if (objs.length > 1) {
    const box = new THREE.Box3(); for (const o of objs) box.union(o.userData.box.clone().applyMatrix4(o.matrixWorld));
    pivot.position.copy(box.getCenter(new THREE.Vector3())); pivot.rotation.set(0, 0, 0); pivot.scale.set(1, 1, 1); pivot.updateMatrixWorld();
    tc.attach(pivot);
  }
  renderSel(); renderPieces();
}
function select(ids, add) {
  if (add) { for (const id of ids) { const i = S.sel.indexOf(id); if (i >= 0) S.sel.splice(i, 1); else S.sel.push(id); } }
  else S.sel = ids.slice();
  refreshSel();
}
let drag = null;
tc.addEventListener('dragging-changed', (e) => {
  controls.enabled = !e.value;
  if (e.value) {
    drag = { prev: snap(), pivotInv: pivot.matrix.clone().invert(), starts: S.sel.map((id) => [id, OBJ.get(id) && OBJ.get(id).matrix.clone()]) };
  } else if (drag) {
    if (snap() !== drag.prev) pushUndo(drag.prev);
    drag = null; if (S.sel.length > 1) refreshSel(); else renderSel();
  }
});
tc.addEventListener('objectChange', () => {
  if (tc.object === pivot && drag) {
    pivot.updateMatrix();
    const d = pivot.matrix.clone().multiply(drag.pivotInv);
    for (const [id, m0] of drag.starts) {
      const o = OBJ.get(id), pc = pieceOf(id); if (!o || !pc || !m0) continue;
      d.clone().multiply(m0).decompose(o.position, o.quaternion, o.scale); readT(o, pc);
    }
  } else if (tc.object) { const pc = pieceOf(tc.object.userData.pid); if (pc) readT(tc.object, pc); }
  renderSel(true);
});
function setMode(m) { tc.setMode(m); document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('sel', b.dataset.mode === m)); }
function toggleSpace() { tc.setSpace(tc.space === 'world' ? 'local' : 'world'); $('btnSpace').textContent = tc.space === 'world' ? '世界座標' : '本地座標'; }
function applySnap() {
  const on = $('snapOn').checked;
  tc.setTranslationSnap(on && +$('snapT').value > 0 ? +$('snapT').value : null);
  tc.setRotationSnap(on && +$('snapR').value > 0 ? +$('snapR').value * D2R : null);
  tc.setScaleSnap(on ? 0.05 : null);
}

// 左鍵點選（拖曳控制軸時不算）
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, axis: tc.axis }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4, onAxis = down.axis; down = null;
  if (moved || onAxis) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(world.children, true)[0];
  let pid = null; for (let x = hit && hit.object; x; x = x.parent) if (x.userData.pid) { pid = x.userData.pid; break; }
  if (pid) select([pid], e.shiftKey); else if (!e.shiftKey) select([]);
});

// ───── 編輯指令 ─────
const newId = () => 'p' + (S.nextId++);
function addPieces(list, sel = true) {
  if (!list.length) return;
  // 槽位標記：複製、鏡像出來的換成同類沒用過的序號
  const taken = {}; for (const pc of list) if (isSlot(pc)) { const t = taken[pc.kind] || (taken[pc.kind] = []); pc.n = freeSlotN(pc.kind, null, t); t.push(pc.n); }
  pushUndo(); S.pieces.push(...list); renderPieces(); renderSlots();
  return sync().then(() => { if (sel) select(list.map((p) => p.id)); });
}
async function addPart(shipId, v, key) {
  const a = (await shipAssets(shipId, v)).parts.get(key);
  addPieces([{ id: newId(), ship: shipId, v, k: 'part', n: key, p: a.center.slice(), r: [0, 0, 0], s: [1, 1, 1] }]);
}
async function addLib(shipId, v, n) {
  const sc = (await shipAssets(shipId, v)).compScale.get(n) || 1, t = controls.target;
  const st = +$('snapT').value || 1, q = (x) => Math.round(x / st) * st;
  addPieces([{ id: newId(), ship: shipId, v, k: 'lib', n, p: [q(t.x), q(t.y), q(t.z)], r: [0, 0, 0], s: [sc, sc, sc] }]);
}
// 加一個槽位標記：放在畫面中央（吸附格點），朝船首
function addSlot(kind) {
  const t = controls.target, st = +$('snapT').value || 1, q = (x) => Math.round(x / st) * st;
  S.showSlots = true; $('showSlots').checked = true;
  addPieces([{ id: newId(), k: 'slot', kind, n: 0, arc: SLOT_KINDS[kind].arc, p: [q(t.x), q(t.y), q(t.z)], r: [0, 0, 0], s: [1, 1, 1] }]);
}
async function addWhole(shipId, v) {
  const sa = await shipAssets(shipId, v);
  await addPieces([...sa.parts].map(([k, a]) => ({ id: newId(), ship: shipId, v, k: 'part', n: k, p: a.center.slice(), r: [0, 0, 0], s: [1, 1, 1] })));
  frame();
}
function cloneSel(fn) {
  const out = [];
  for (const id of S.sel) { const pc = pieceOf(id); if (!pc) continue; const c = { ...JSON.parse(JSON.stringify(pc)), id: newId() }; if (fn) fn(c); out.push(c); }
  return out;
}
const cmd = {
  dup() { addPieces(cloneSel()); },
  // 對 Z=0（船的中線）鏡像：Z·Rx(a)Ry(b)Rz(c)·S＝Rx(−a)Ry(−b)Rz(c)·Z·S，所以 z、rx、ry 反號，z 縮放反號
  mirror() { addPieces(cloneSel((c) => { c.p[2] = -c.p[2]; c.r[0] = -c.r[0]; c.r[1] = -c.r[1]; c.s[2] = -c.s[2]; })); },
  flip() {
    if (!S.sel.length) return; pushUndo();
    for (const id of S.sel) { const pc = pieceOf(id); if (pc) pc.s[2] = -pc.s[2]; }
    sync(); renderSel();
  },
  async reset() {
    if (!S.sel.length) return; pushUndo();
    for (const id of S.sel) {
      const pc = pieceOf(id); if (!pc) continue;
      if (isSlot(pc)) pc.s = [1, 1, 1];
      else if (pc.k === 'part') { const a = (await shipAssets(pc.ship, pc.v)).parts.get(pc.n); pc.p = a.center.slice(); pc.s = [1, 1, 1]; }
      else { const sc = (await shipAssets(pc.ship, pc.v)).compScale.get(pc.n) || 1; pc.s = [sc, sc, sc]; }
      pc.r = [0, 0, 0];
    }
    sync(); renderSel();
  },
  // 轉動模型本身：有選取就轉選取的部件，沒選就轉整艘；繞它們外框的中心、世界座標軸
  rotate(axis, deg) {
    const ids = S.sel.length ? S.sel.slice() : S.pieces.map((p) => p.id);
    const objs = ids.map((id) => [OBJ.get(id), pieceOf(id)]).filter(([o, pc]) => o && pc);
    if (!objs.length) return;
    pushUndo();
    const box = new THREE.Box3(); for (const [o] of objs) box.union(o.userData.box.clone().applyMatrix4(o.matrixWorld));
    const c = box.getCenter(new THREE.Vector3()), ax = new THREE.Vector3().setComponent(axis, 1);
    const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(ax, deg * D2R))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    for (const [o, pc] of objs) { o.updateMatrix(); m.clone().multiply(o.matrix).decompose(o.position, o.quaternion, o.scale); readT(o, pc); }
    sync(); refreshSel();
  },
  del() {
    if (!S.sel.length) return; pushUndo();
    const del = new Set(S.sel); S.pieces = S.pieces.filter((p) => !del.has(p.id)); S.sel = [];
    tc.detach(); sync(); renderPieces(); renderSlots();
  },
};
function frame() {
  const box = new THREE.Box3();
  const objs = S.sel.length ? S.sel.map((id) => OBJ.get(id)).filter(Boolean) : [...OBJ.values()];
  for (const o of objs) box.union(o.userData.box.clone().applyMatrix4(o.matrixWorld));
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1000, 300, 500));
  const c = box.getCenter(new THREE.Vector3()), r = Math.max(20, box.getSize(new THREE.Vector3()).length() / 2);
  const dir = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(c); camera.position.copy(c).addScaledVector(dir, r / Math.sin(camera.fov * D2R / 2) * 0.9);
}

// ───── 面板 ─────
function renderLib() {
  const ship = LIB.byId[S.libShip];
  $('libShip').innerHTML = LIB.ships.map((s) => `<option value="${esc(s.id)}"${s.id === S.libShip ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  $('libVar').innerHTML = ship ? ship.variants.map((v) => `<option value="${esc(v.name)}"${v.name === S.libVar ? ' selected' : ''}>${esc(varLabel(v.name))}</option>`).join('') : '';
  if (!ship) return;
  $('libParts').innerHTML = '載入中…';
  const sid = S.libShip, v = S.libVar;
  Promise.all([shipAssets(sid, v), libAssets(sid, libStyle(ship, v))]).then(([sa, lib]) => {
    if (sid !== S.libShip || v !== S.libVar) return;
    $('libParts').classList.remove('dim');
    $('libParts').innerHTML = [...sa.parts].map(([k, a]) => `<div class="it add" data-part="${esc(k)}"><span>${esc(partLabel(k))} <small>${esc(k.replace(/^x:/, ''))}・${fmtK(a.tris)} 面</small></span></div>`).join('');
    const li = (n) => `<div class="it add" data-lib="${esc(n)}"><span>${esc(libLabel(n))} <small>${esc(n.replace(/^(component|detail)_/, ''))}</small></span></div>`;
    const names = [...lib.keys()];
    $('libComps').innerHTML = names.filter((n) => n.startsWith('component_')).map(li).join('') || '<div class="dim small">沒有</div>';
    $('libDetails').innerHTML = names.filter((n) => n.startsWith('detail_')).map(li).join('') || '<div class="dim small">沒有</div>';
    document.querySelectorAll('[data-part]').forEach((el) => (el.onclick = () => addPart(sid, v, el.dataset.part)));
    document.querySelectorAll('[data-lib]').forEach((el) => (el.onclick = () => addLib(sid, v, el.dataset.lib)));
  }).catch((e) => { $('libParts').textContent = e.message; });
}
function pieceLabel(pc) { return isSlot(pc) ? slotName(pc) : pc.k === 'part' ? partLabel(pc.n) : libLabel(pc.n); }
const pieceSub = (pc) => (isSlot(pc) ? (SLOT_KINDS[pc.kind].arc ? `槽位・射界左右各 ${pc.arc || 0}°` : '槽位') : `${(LIB.byId[pc.ship] || {}).name || pc.ship}・${varLabel(pc.v)}`);
function renderPieces() {
  $('pcount').textContent = S.pieces.length ? S.pieces.length + ' 個' : '';
  $('pieces').innerHTML = S.pieces.map((pc) => `<div class="it${S.sel.includes(pc.id) ? ' on' : ''}${isSlot(pc) ? ' slot' : ''}" data-pid="${pc.id}"${isSlot(pc) ? ` style="--sc:#${SLOT_KINDS[pc.kind].col.toString(16).padStart(6, '0')}"` : ''}><span>${esc(pieceLabel(pc))}</span><small>${esc(pieceSub(pc))}</small></div>`).join('') || '<div class="dim">還沒有部件。從左邊素材庫加入，或按「整艦放入」。</div>';
  document.querySelectorAll('#pieces [data-pid]').forEach((el) => (el.onclick = (e) => select([el.dataset.pid], e.shiftKey)));
}
// 槽位面板：各類幾個、序號有沒有重複或跳號
function renderSlots() {
  const c = slotCounts(), warn = [];
  for (const k of SLOT_ORDER) {
    const ns = S.pieces.filter((p) => isSlot(p) && p.kind === k).map((p) => p.n).sort((a, b) => a - b);
    const dup = ns.filter((n, i) => i && ns[i - 1] === n), gap = ns.length && ns[ns.length - 1] !== ns.length - 1;
    if (dup.length) warn.push(`${SLOT_KINDS[k].name}序號重複：${[...new Set(dup)].map((n) => n + 1).join('、')}`);
    else if (gap) warn.push(`${SLOT_KINDS[k].name}序號跳號（應該是 1～${ns.length}）`);
  }
  $('slotCounts').innerHTML = SLOT_ORDER.map((k) => `<span class="sc" style="--sc:#${SLOT_KINDS[k].col.toString(16).padStart(6, '0')}">${SLOT_KINDS[k].name.replace('槽', '')} <b>${c[k]}</b></span>`).join('');
  $('slotWarn').innerHTML = warn.map(esc).join('<br>');
}
function renderSel(liveOnly) {
  const pcs = S.sel.map(pieceOf).filter(Boolean);
  $('selNone').hidden = !!pcs.length; $('selBox').hidden = !pcs.length;
  if (!pcs.length) return;
  const one = pcs.length === 1 ? pcs[0] : null;
  document.querySelectorAll('#selBox [data-f]').forEach((el) => {
    const [f, i] = [el.dataset.f[0], +el.dataset.f[1]];
    el.disabled = !one; if (document.activeElement !== el) el.value = one ? one[f][i] : '';
  });
  if (liveOnly) return;
  const so = isSlot(one) ? one : null;
  $('slotBox').hidden = !so; $('selVarRow').hidden = pcs.every(isSlot);
  if (so) {
    $('slotKind').innerHTML = SLOT_ORDER.map((k) => `<option value="${k}"${k === so.kind ? ' selected' : ''}>${SLOT_KINDS[k].name}</option>`).join('');
    $('slotN').value = so.n + 1; $('slotArc').value = so.arc || 0; $('slotArcRow').hidden = !SLOT_KINDS[so.kind].arc;
    const lk = slotLook(so);
    $('slotLook').innerHTML = GEAR_LIST.filter(([id]) => gearFits(so.kind, id)).map(([id, , nm]) => `<option value="${id}"${id === lk ? ' selected' : ''}>${esc(nm)}</option>`).join('');
  }
  $('selName').innerHTML = one ? (so ? `<b>${esc(slotName(so))}</b> <span class="dim">遊戲裡的槽位編號 ${so.kind}${so.n}</span>` : `<b>${esc(pieceLabel(one))}</b> <span class="dim">${esc(LIB.byId[one.ship] ? LIB.byId[one.ship].name : one.ship)}・${esc(one.n)}</span>`) : `<b>選取了 ${pcs.length} 個</b> <span class="dim">（拖曳控制軸一起移動）</span>`;
  const ships = new Set(pcs.filter((p) => !isSlot(p)).map((p) => p.ship)), vs = [...ships].map((s) => (LIB.byId[s] ? LIB.byId[s].variants.map((v) => v.name) : []));
  const common = vs.reduce((a, b) => a.filter((x) => b.includes(x)), vs[0] || []);
  const curV = new Set(pcs.filter((p) => !isSlot(p)).map((p) => p.v));
  $('selVar').innerHTML = (curV.size > 1 ? '<option value="">（不同）</option>' : '') + common.map((v) => `<option value="${esc(v)}"${curV.size === 1 && curV.has(v) ? ' selected' : ''}>${esc(varLabel(v))}</option>`).join('');
}
function renderAllVar() {
  const all = new Set(); for (const s of LIB.ships) for (const v of s.variants) all.add(v.name);
  $('allVar').innerHTML = '<option value="">選一個…</option>' + [...all].map((v) => `<option value="${esc(v)}">${esc(varLabel(v))}</option>`).join('');
}
function renderDesigns() {
  $('canEdit').textContent = S.canEdit ? '' : '（只能存在這台瀏覽器）';
  const ids = Object.keys(S.designs).sort((a, b) => (S.designs[b].updated || 0) - (S.designs[a].updated || 0));
  $('designs').innerHTML = ids.map((id) => { const d = S.designs[id]; return `<div class="it${id === S.curId ? ' on' : ''}" data-did="${esc(id)}"><span>${esc(d.name || '未命名')}</span><small>${(d.pieces || []).length} 個</small><button class="danger small" data-ddel="${esc(id)}" title="刪除這個設計">×</button></div>`; }).join('') || '<div class="dim">還沒有存過設計。</div>';
  document.querySelectorAll('[data-did]').forEach((el) => (el.onclick = (e) => { if (!e.target.dataset.ddel) openDesign(el.dataset.did); }));
  document.querySelectorAll('[data-ddel]').forEach((el) => (el.onclick = () => delDesign(el.dataset.ddel)));
}

// ───── 艦種（艦長模式的槽位制度，dev/艦長槽位企劃.md 第 3 步）─────
// hulls.json＝{ 艦種: { name, old?（現有的 5 種：只改槽位數，位置照勢力船體的武器掛點自動產生）, ship（模型用哪艘）, desc, look（還沒發佈前借用的外觀）,
//   skill, stats: { hp, sh, cruise…, main, tur, pd, msl, repair? }, slots: [Lv1～5 的 [主砲, 副砲, 防空, 艦載機, 輔助]], lv: [Lv1～5 的設計 id] } }
const SKILLS = { burst: '推進過載', shield: '護盾超載', repair: '維修光束', jam: '電子干擾', cloak: '匿蹤' };
const LOOKS = ['航母', '戰列艦', '巡洋艦', '驅逐艦', '護衛艦'];
const ST_FIELDS = [
  ['', [['hp', '船體'], ['sh', '護盾'], ['cruise', '巡航速度'], ['max', '最高速度'], ['acc', '加速'], ['strafe', '側移'], ['climb', '升降'], ['turn', '轉向°／秒'], ['boostT', '推進秒數']]],
  ['main', [['dmg', '原廠主砲傷害'], ['cd', '裝填秒'], ['range', '射程'], ['arc', '射界°'], ['trav', '轉速°／秒'], ['spd', '彈速']]],
  ['tur', [['dmg', '副砲每座傷害'], ['cd', '裝填秒'], ['range', '射程'], ['acc', '命中']]],
  ['pd', [['dmg', '防空每座傷害'], ['cd', '裝填秒'], ['far', '攔截距離'], ['acc', '命中']]],
  ['msl', [['n', '每個飛彈艙彈量'], ['dmg', '每枚傷害'], ['range', '射程'], ['lockT', '鎖定秒'], ['cd', '發射間隔']]],
];
const HS = { sel: null, dirty: false };
// 一個設計裡各類標記幾個、序號是不是 0～n−1
function designSlots(d) {
  const c = Object.fromEntries(SLOT_ORDER.map((k) => [k, []]));
  for (const p of (d && d.pieces) || []) if (isSlot(p)) c[p.kind].push(p.n);
  return c;
}
// 檢查一個艦種：每級的設計標記數量要和槽位表一致、序號連續；槽位數不能比上一級少（槽位編號升級時沿用）
function hullCheck(H) {
  const out = [];
  for (let l = 0; l < 5; l++) {
    const row = (H.slots || [])[l] || [0, 0, 0, 0, 0], msg = [];
    if (l && SLOT_ORDER.some((k, i) => row[i] < ((H.slots[l - 1] || [])[i] || 0))) msg.push('槽位比上一級少');
    if (!H.old) {
      const id = (H.lv || [])[l], d = id && S.designs[id];
      if (!id) msg.push('還沒指定設計');
      else if (!d) msg.push('設計不見了');
      else {
        const c = designSlots(d);
        SLOT_ORDER.forEach((k, i) => {
          const have = c[k].length, need = row[i] || 0, nm = SLOT_KINDS[k].name;
          if (have < need) msg.push(`還差 ${need - have} 個${nm}`); else if (have > need) msg.push(`多了 ${have - need} 個${nm}`);
          else if (c[k].slice().sort((a, b) => a - b).some((n, j) => n !== j)) msg.push(`${nm}序號要是 1～${need}`);
        });
      }
    }
    out.push(msg);
  }
  return out;
}
const hullOk = (H) => hullCheck(H).every((m) => !m.length);
function openHulls() { $('hullDlg').hidden = false; if (!HS.sel || !S.hulls[HS.sel]) HS.sel = Object.keys(S.hulls)[0] || null; renderHulls(); }
function hullDirty() { HS.dirty = true; $('hdDirty').textContent = '未儲存'; }
function renderHulls() {
  const keys = Object.keys(S.hulls);
  $('hdList').innerHTML = keys.map((k) => { const H = S.hulls[k], ok = hullOk(H); return `<div class="it${k === HS.sel ? ' on' : ''}" data-hk="${esc(k)}"><span>${esc(H.name || k)}</span><small>${H.old ? '現有' : ''}<span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '！'}</span></small></div>`; }).join('');
  document.querySelectorAll('[data-hk]').forEach((el) => (el.onclick = () => { HS.sel = el.dataset.hk; renderHulls(); }));
  const H = S.hulls[HS.sel], M = $('hdMain');
  if (!H) { M.innerHTML = '<div class="dim">還沒有艦種。</div>'; return; }
  const chk = hullCheck(H), dOpts = (cur) => `<option value="">（還沒指定）</option>` + Object.entries(S.designs).map(([id, d]) => `<option value="${esc(id)}"${id === cur ? ' selected' : ''}>${esc(d.name || '未命名')}</option>`).join('');
  const rows = [0, 1, 2, 3, 4].map((l) => { const r = (H.slots[l] = H.slots[l] || [0, 0, 0, 0, 0]);
    return `<tr><td>Lv${l + 1}</td>${SLOT_ORDER.map((k, i) => `<td><input type="number" min="0" max="12" step="1" value="${r[i] || 0}" data-hs="${l},${i}"></td>`).join('')}
      ${H.old ? '' : `<td><select data-hl="${l}">${dOpts((H.lv || [])[l])}</select> <button class="small" data-hopen="${l}" ${(H.lv || [])[l] && S.designs[H.lv[l]] ? '' : 'disabled'}>打開</button></td>`}
      <td class="chk">${chk[l].length ? `<span class="bad">${esc(chk[l].join('；'))}</span>` : '<span class="ok">✓</span>'}</td></tr>`; }).join('');
  const st = H.stats || {}, stg = H.old ? '' : ST_FIELDS.map(([g, F]) => `<div class="stgrid">${F.map(([f, nm]) => { const v = g ? (st[g] || {})[f] : st[f]; return `<label>${nm}<input type="number" step="any" value="${v ?? ''}" data-hst="${g}.${f}"></label>`; }).join('')}</div>`).join('<div style="height:6px"></div>');
  M.innerHTML = `
    <div class="row"><b style="font-size:15px">${esc(H.name || HS.sel)}</b><span class="dim small">代號 ${esc(HS.sel)}</span>${H.old ? '<span class="dim small">現有艦種：數值寫在遊戲程式裡；槽位位置照各勢力船體的武器掛點自動產生，這裡只改每級的槽位數</span>' : `<span class="sp" style="flex:1"></span><button class="danger small" id="hdDel">刪除這個艦種</button>`}</div>
    ${H.old ? '' : `<div class="row small">名稱 <input type="text" id="hdName" value="${esc(H.name || '')}" style="width:140px"> 模型 <select id="hdShip">${LIB.ships.map((s) => `<option value="${esc(s.id)}"${s.id === H.ship ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      技能 <select id="hdSkill">${Object.entries(SKILLS).map(([k, n]) => `<option value="${k}"${k === H.skill ? ' selected' : ''}>${n}</option>`).join('')}</select>
      發佈前借用外觀 <select id="hdLook">${LOOKS.map((n, i) => `<option value="${i}"${i === +H.look ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="row small">說明 <input type="text" id="hdDesc" value="${esc(H.desc || '')}" style="flex:1"></div>`}
    <h4>每個等級的槽位數${H.old ? '' : '與設計'}</h4>
    <div class="dim small">數字是各類槽位幾個；設計裡同類的標記要剛好這麼多、序號 1～N。槽位數不能比上一級少（槽位編號升級時沿用，裝好的裝備才不會掉）。</div>
    <table><tr><th></th>${SLOT_ORDER.map((k) => `<th style="color:#${SLOT_KINDS[k].col.toString(16).padStart(6, '0')}">${SLOT_KINDS[k].name}</th>`).join('')}${H.old ? '' : '<th>設計</th>'}<th>檢查</th></tr>${rows}</table>
    ${H.old ? '' : `<h4>數值（原廠裝備的數值；實際火力＝裝上的裝備加總）</h4>${stg}`}`;
  document.querySelectorAll('[data-hs]').forEach((el) => (el.onchange = () => { const [l, i] = el.dataset.hs.split(',').map(Number); H.slots[l][i] = Math.max(0, Math.round(+el.value || 0)); hullDirty(); renderHulls(); }));
  document.querySelectorAll('[data-hl]').forEach((el) => (el.onchange = () => { (H.lv = H.lv || [null, null, null, null, null])[+el.dataset.hl] = el.value || null; hullDirty(); renderHulls(); }));
  document.querySelectorAll('[data-hopen]').forEach((el) => (el.onclick = () => { const id = H.lv[+el.dataset.hopen]; $('hullDlg').hidden = true; openDesign(id); }));
  document.querySelectorAll('[data-hst]').forEach((el) => (el.onchange = () => {
    const [g, f] = el.dataset.hst.split('.'), v = el.value === '' ? undefined : +el.value; H.stats = H.stats || {};
    if (g) (H.stats[g] = H.stats[g] || {})[f] = v; else H.stats[f] = v; hullDirty();
  }));
  const bind = (id, fn) => { const el = $(id); if (el) el.onchange = () => { fn(el.value); hullDirty(); renderHulls(); }; };
  bind('hdName', (v) => (H.name = v.trim() || HS.sel)); bind('hdShip', (v) => (H.ship = v)); bind('hdSkill', (v) => (H.skill = v)); bind('hdLook', (v) => (H.look = +v)); bind('hdDesc', (v) => (H.desc = v));
  if ($('hdDel')) $('hdDel').onclick = () => { if (!confirm(`刪除艦種「${H.name}」？（存檔後才會寫進伺服器）`)) return; delete S.hulls[HS.sel]; HS.sel = Object.keys(S.hulls)[0] || null; hullDirty(); renderHulls(); };
}
function newHull() {
  const key = (prompt('新艦種的代號（英文字母、數字，例如 cruiser2；遊戲裡用這個當鍵）') || '').trim();
  if (!key) return; if (!/^[a-z][a-z0-9_]*$/i.test(key)) return toast('代號只能用英文字母、數字、底線，開頭要是字母', true);
  if (S.hulls[key]) return toast('已經有這個代號', true);
  const T = S.hulls.twin;
  S.hulls[key] = { name: '新艦種', ship: (LIB.ships[0] || {}).id, desc: '', look: 2, skill: 'burst', stats: JSON.parse(JSON.stringify((T && T.stats) || { hp: 400, sh: 220, cruise: 7, max: 11, acc: 2.6, strafe: 3.5, climb: 3, turn: 24, boostT: 5, main: { name: '主砲', dmg: 20, cd: 1.5, range: 230, spd: 260, arc: 60, trav: 60 }, tur: { dmg: 6, cd: 1.4, range: 160, acc: 0.85 }, pd: { dmg: 2, cd: 0.4, far: 70, acc: 0.75 }, msl: { n: 20, dmg: 40, range: 270, lockT: 1.1, cd: 0.45 } })),
    slots: [[1, 2, 2, 0, 1], [1, 2, 2, 0, 2], [1, 3, 3, 0, 2], [2, 3, 3, 0, 2], [2, 4, 3, 0, 3]], lv: [null, null, null, null, null] };
  HS.sel = key; hullDirty(); renderHulls();
}
async function saveHulls() {
  for (const [k, H] of Object.entries(S.hulls)) if (H.slots.some((r, l) => l && SLOT_ORDER.some((_, i) => r[i] < H.slots[l - 1][i]))) return toast(`${H.name}：槽位數不能比上一級少`, true);
  try {
    if (!S.canEdit) lsSet('shipyard.hulls', JSON.stringify(S.hulls));
    else { const r = await fetch('../api/shipyard', { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ hulls: S.hulls }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); }
  } catch (e) { return toast('存檔失敗：' + e.message, true); }
  HS.dirty = false; $('hdDirty').textContent = ''; toast(S.canEdit ? '艦種已存到伺服器（遊戲下次開啟時套用）' : '艦種只存在這台瀏覽器（伺服器只允許在伺服器那台電腦上存）');
}

// ───── 設計存取 ─────
function loadPieces(list) {
  S.pieces = (list || []).map((p) => ({ ...p })); S.sel = []; S.undo = []; S.redo = [];
  S.nextId = 1 + S.pieces.reduce((m, p) => Math.max(m, +String(p.id).replace(/\D/g, '') || 0), 0);
  for (const [id, o] of OBJ) { world.remove(o); OBJ.delete(id); }
  tc.detach(); sync().then(() => frame()); renderPieces(); renderSel(); renderSlots();
}
function openDesign(id) {
  if (S.dirty && id !== S.curId && !confirm('目前的設計還沒儲存，要放棄修改嗎？')) return;
  const d = S.designs[id]; if (!d) return;
  S.curId = id; $('dname').value = d.name || ''; loadPieces(d.pieces); S.dirty = false; updHeader(); autosave(); renderDesigns();
}
function newDesign() {
  if (S.dirty && !confirm('目前的設計還沒儲存，要放棄修改嗎？')) return;
  S.curId = null; $('dname').value = ''; loadPieces([]); S.dirty = false; updHeader(); autosave(); renderDesigns();
}
async function putDesigns() {
  if (!S.canEdit) { lsSet('shipyard.designs', JSON.stringify(S.designs)); return; }
  const r = await fetch('../api/shipyard', { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ designs: S.designs }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
}
async function saveDesign() {
  const name = $('dname').value.trim() || '未命名戰艦'; $('dname').value = name;
  const id = S.curId || 'd' + Date.now().toString(36);
  const prev = S.designs[id];
  S.designs[id] = { name, pieces: S.pieces, updated: Date.now() };
  try { await putDesigns(); } catch (e) { if (prev) S.designs[id] = prev; else delete S.designs[id]; return toast('存檔失敗：' + e.message, true); }
  S.curId = id; S.dirty = false; updHeader(); autosave(); renderDesigns();
  toast(S.canEdit ? `已存到伺服器：${name}` : `已存在這台瀏覽器：${name}（伺服器只允許在伺服器那台電腦上存）`);
}
async function delDesign(id) {
  const d = S.designs[id]; if (!d || !confirm(`刪除設計「${d.name || '未命名'}」？伺服器會留一份上一版（designs.json.bak）。`)) return;
  delete S.designs[id];
  try { await putDesigns(); } catch (e) { S.designs[id] = d; return toast('刪除失敗：' + e.message, true); }
  if (S.curId === id) { S.curId = null; S.dirty = true; updHeader(); }
  renderDesigns();
}

// ───── 匯出 GLB：實例展開成共用網格的節點（glTF 允許多個節點用同一個網格；鏡像的直接用負的矩陣）─────
async function exportGlb() {
  if (!S.pieces.length) return toast('設計是空的', true);
  busy(true);
  try {
    const root = new THREE.Group(); root.name = $('dname').value.trim() || 'ship';
    for (const pc of S.pieces) {
      const o = OBJ.get(pc.id); if (!o || isSlot(pc)) continue;   // 槽位標記不匯出
      const g = new THREE.Group(); g.name = pc.n; g.matrixAutoUpdate = false; g.matrix.copy(o.matrix); root.add(g);
      for (const c of o.children) {
        const it = c.userData.item;
        for (const m of it.ms) { const mesh = new THREE.Mesh(it.geo, c.material); mesh.matrixAutoUpdate = false; mesh.matrix.copy(m); g.add(mesh); }
      }
    }
    const buf = await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: 2048 });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    a.download = root.name + '.glb'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`已匯出 ${root.name}.glb（${(buf.byteLength / 1048576).toFixed(1)} MB）`);
  } catch (e) { console.error(e); toast('匯出失敗：' + e.message, true); } finally { busy(false); }
}

// ───── 事件 ─────
$('libShip').onchange = () => { S.libShip = $('libShip').value; const s = LIB.byId[S.libShip]; if (!s.variants.some((v) => v.name === S.libVar)) S.libVar = s.variants[0].name; lsSet('shipyard.lib', JSON.stringify([S.libShip, S.libVar])); renderLib(); };
$('libVar').onchange = () => { S.libVar = $('libVar').value; lsSet('shipyard.lib', JSON.stringify([S.libShip, S.libVar])); renderLib(); };
$('btnWhole').onclick = () => addWhole(S.libShip, S.libVar);
$('btnUndo').onclick = () => undo(false); $('btnRedo').onclick = () => undo(true);
$('btnNew').onclick = newDesign; $('btnSave').onclick = saveDesign; $('btnGlb').onclick = exportGlb;
$('btnHulls').onclick = openHulls; $('hdSave').onclick = saveHulls; $('hdNew').onclick = newHull;
$('hdClose').onclick = () => { $('hullDlg').hidden = true; };
$('dname').oninput = () => markDirty();
$('btnDup').onclick = cmd.dup; $('btnMirror').onclick = cmd.mirror; $('btnFlip').onclick = cmd.flip; $('btnReset').onclick = cmd.reset; $('btnDel').onclick = cmd.del;
document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$('btnSpace').onclick = toggleSpace;
['snapOn', 'snapT', 'snapR'].forEach((id) => ($(id).onchange = applySnap)); applySnap();
$('showGrid').onchange = () => (grid.visible = $('showGrid').checked);
$('showAxes').onchange = () => (axes.visible = $('showAxes').checked);
$('autoRot').onchange = () => (controls.autoRotate = $('autoRot').checked);
document.querySelectorAll('[data-rot]').forEach((b) => (b.onclick = () => {
  const [axis, sign] = b.dataset.rot.split(','), step = +$('rotStep').value || 90;
  cmd.rotate(+axis, +sign * step);
}));
$('selVar').onchange = () => {
  const v = $('selVar').value; if (!v) return;
  pushUndo(); for (const id of S.sel) { const pc = pieceOf(id); if (pc && !isSlot(pc)) pc.v = v; }
  sync(); renderPieces();
};
// 槽位標記的欄位：種類、序號（和同類的另一個對調）、射界
function slotEdit(fn) { const pc = S.sel.length === 1 && pieceOf(S.sel[0]); if (!isSlot(pc)) return; pushUndo(); fn(pc); sync(); renderPieces(); renderSel(); renderSlots(); }
$('slotKind').onchange = () => slotEdit((pc) => { pc.kind = $('slotKind').value; pc.n = freeSlotN(pc.kind, pc.id); if (!SLOT_KINDS[pc.kind].arc) pc.arc = 0; else if (!pc.arc) pc.arc = SLOT_KINDS[pc.kind].arc; });
$('slotN').onchange = () => slotEdit((pc) => {
  const n = Math.max(0, Math.round(+$('slotN').value || 1) - 1), o = S.pieces.find((p) => isSlot(p) && p !== pc && p.kind === pc.kind && p.n === n);
  if (o) o.n = pc.n; pc.n = n;
});
$('slotArc').onchange = () => slotEdit((pc) => { pc.arc = Math.max(0, Math.min(180, Math.round(+$('slotArc').value || 0))); });
document.querySelectorAll('[data-addslot]').forEach((b) => (b.onclick = () => addSlot(b.dataset.addslot)));
$('showSlots').onchange = () => { S.showSlots = $('showSlots').checked; for (const o of OBJ.values()) if (o.userData.slot) slotVis(o); };
$('showGear').onchange = () => { S.showGear = $('showGear').checked; lsSet('shipyard.showGear', S.showGear ? '1' : ''); sync(); };
// 預覽的裝備：選到一個槽位時改那一個；「全部換成」改所有能裝的槽位
$('slotLook').onchange = () => slotEdit((pc) => { pc.look = $('slotLook').value; if (!S.showGear) { S.showGear = true; $('showGear').checked = true; } });
$('allLook').onchange = () => {
  const id = $('allLook').value; if (!id) return; pushUndo(); let n = 0;
  for (const pc of S.pieces) if (isSlot(pc) && gearFits(pc.kind, id)) { pc.look = id; n++; }
  S.showGear = true; $('showGear').checked = true; $('allLook').value = ''; sync(); renderSel();
  toast(n ? `${n} 個槽位預覽「${GEAR[id].name}」` : '沒有能裝這件裝備的槽位', !n);
};
$('btnRenum').onclick = () => {   // 每一類照目前的順序重新編成 1、2、3…
  pushUndo(); for (const k of SLOT_ORDER) S.pieces.filter((p) => isSlot(p) && p.kind === k).sort((a, b) => a.n - b.n).forEach((p, i) => (p.n = i));
  sync(); renderPieces(); renderSel(); renderSlots();
};
$('allVar').onchange = () => {
  const v = $('allVar').value; if (!v || !S.pieces.length) return;
  pushUndo(); let skip = 0;
  for (const pc of S.pieces) { if (isSlot(pc)) continue; const s = LIB.byId[pc.ship]; if (s && s.variants.some((x) => x.name === v)) pc.v = v; else skip++; }
  $('allVar').value = ''; sync(); renderPieces(); renderSel();
  if (skip) toast(`${skip} 個部件的艦型沒有「${varLabel(v)}」塗裝，維持原樣`);
};
document.querySelectorAll('#selBox [data-f]').forEach((el) => (el.onchange = () => {
  const pc = S.sel.length === 1 && pieceOf(S.sel[0]); if (!pc || el.value === '' || !isFinite(+el.value)) return;
  pushUndo(); pc[el.dataset.f[0]][+el.dataset.f[1]] = +el.value; sync();
}));
addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || !$('hullDlg').hidden) return;
  const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
  if (c && k === 'z') { e.preventDefault(); undo(e.shiftKey); }
  else if (c && k === 'y') { e.preventDefault(); undo(true); }
  else if (c && k === 's') { e.preventDefault(); saveDesign(); }
  else if (c && k === 'd') { e.preventDefault(); cmd.dup(); }
  else if (c && k === 'a') { e.preventDefault(); select(S.pieces.map((p) => p.id)); }
  else if (c) return;
  else if (k === 'w') setMode('translate'); else if (k === 'e') setMode('rotate'); else if (k === 'r') setMode('scale');
  else if (k === 'q') toggleSpace(); else if (k === 'f') frame(); else if (k === 'm') cmd.mirror();
  else if (k === '[' || k === ']') cmd.rotate(1, (k === '[' ? 1 : -1) * (+$('rotStep').value || 90));   // 左右轉（繞 Y 軸）
  else if (k === 'delete' || k === 'backspace') cmd.del();
  else if (k === 'escape') select([]);
});
addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ───── 開始 ─────
loop();
(async () => {
  try {
    const [lib, ds] = await Promise.all([
      fetch(urlOf('library.json'), { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('找不到素材庫 models/戰艦組裝/library.json（在 dev 執行 node tools/shipyard/import.mjs）'); return r.json(); }),
      fetch('../api/shipyard', { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    LIB.ships = lib.ships || []; for (const s of LIB.ships) LIB.byId[s.id] = s;
    if (ds) { S.designs = ds.designs || {}; S.canEdit = !!ds.canEdit; S.hulls = ds.hulls || {}; }
    if (!ds || !Object.keys(S.hulls).length) S.hulls = await fetch(urlOf('hulls.json'), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => j.hulls || {}).catch(() => ({}));
    if (!S.canEdit) { try { Object.assign(S.hulls, JSON.parse(lsGet('shipyard.hulls') || '{}')); } catch (e) { /* 壞掉就算了 */ } }
    if (!S.canEdit) { try { Object.assign(S.designs, JSON.parse(lsGet('shipyard.designs') || '{}')); } catch (e) { /* 壞掉就算了 */ } }
    let pick = null; try { pick = JSON.parse(lsGet('shipyard.lib') || 'null'); } catch (e) { /* 沒有 */ }
    S.libShip = pick && LIB.byId[pick[0]] ? pick[0] : (LIB.ships[0] || {}).id;
    const ship = LIB.byId[S.libShip];
    S.libVar = ship && pick && ship.variants.some((v) => v.name === pick[1]) ? pick[1] : ship && ship.variants[0].name;
    S.showGear = !!lsGet('shipyard.showGear'); $('showGear').checked = S.showGear;
    $('allLook').innerHTML = '<option value="">全部換成…</option>' + GEAR_LIST.map(([id, , nm]) => `<option value="${id}">${esc(nm)}</option>`).join('');
    renderLib(); renderAllVar(); renderDesigns();
    let work = null; try { work = JSON.parse(lsGet('shipyard.work') || 'null'); } catch (e) { /* 沒有 */ }
    if (work && work.pieces && work.pieces.length) {   // 上次沒關掉的工作（重新整理後接著做）
      S.curId = work.id && S.designs[work.id] ? work.id : null; $('dname').value = work.name || '';
      loadPieces(work.pieces); S.dirty = !!work.dirty; updHeader(); renderDesigns();
    } else { renderPieces(); renderSel(); renderSlots(); }
    if (!ds) toast('沒有登入伺服器：設計只會存在這台瀏覽器', true);
  } catch (e) { console.error(e); toast(e.message, true); $('libParts').textContent = e.message; }
})();
window.__shipyard = { S, OBJ, LIB, shipAssets, libAssets, addWhole, frame, addSlot, select, cmd };
