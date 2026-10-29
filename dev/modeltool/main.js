// 模型工坊：修正伺服器模型資料夾裡的 GLB（朝向、原點、合併成一個網格＋一張圖集、焊接、減面、刪除多邊形），存回遊戲。
// 概念取自 rubicon-protocol 的模型庫「GLB 編輯器」；刪除多邊形（facetool.js）與焊接／減面（optimize.js）直接移植自它（MIT）。
// 圖集合併取自 dev/tools/tripo/conv.html。
// 編輯中的模型一律「攤平」：每個網格的世界變換寫進頂點，content 底下只有一層網格，所有操作都換新的幾何（復原只要記參照）。
// 遊戲（伺服器的 models.js 和 main.js 的 loadOneModel）只讀第一個網格的第一個 primitive 和它的 map 貼圖，所以規格檢查以此為準。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FaceTool } from './facetool.js';
import { floatAttr, weldGeometry, simplifyGeometry, triCountOf } from './optimize.js';

const $ = (id) => document.getElementById(id);
const STYLES = [['e', '帝國軍'], ['a', '聯盟軍'], ['m', '傭兵'], ['c', '機械改造人類'], ['r', '機械智慧族'], ['i', '蟲族感染人類'], ['b', '蟲族']];
const KIND = { hull: '船體', weapon: '武器', fighter: '艦載機', station: '太空站' };
const KIND_ORDER = ['hull', 'station', 'fighter', 'weapon'];
const FWD = { '+z': [0, 0, 1], '-z': [0, 0, -1], '+x': [1, 0, 0], '-x': [-1, 0, 0] };
// 面數參考：現有模型大多 1.7～2 萬面，戰艦 4 萬；超過時遠景網格照樣會自動簡化，但近景與 3D 武器數量多時會吃效能
const BUDGET = { hull: 40000, station: 40000, fighter: 20000, weapon: 20000 };
const RIG_ATTRS = ['_part', '__part', '_piv', '__piv'];
const isPiv = (n) => /^_+piv$/.test(n);
// models.json 的 forward：清單只給 orient（伺服器套在模型上的矩陣，行優先），模型座標裡的船頭＝orient 第三列的方向
function fwdOf(m) {
  const o = m && m.orient; if (!o) return '+z';
  const v = [o[2], o[6], o[10]], i = Math.abs(v[0]) > Math.abs(v[2]) ? 0 : 2;
  return (v[i] < 0 ? '-' : '+') + (i ? 'z' : 'x');
}

// ───── 登入（和遊戲共用 localStorage 的 fleet.session）─────
function authHeaders() {
  try { const s = JSON.parse(localStorage.getItem('fleet.session') || 'null'); if (s && s.token) return { Authorization: 'Bearer ' + s.token }; } catch (e) { /* 沒登入 */ }
  return {};
}

// ───── 畫面 ─────
const view = $('edView');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1020);
const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x202430, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
const frame = new THREE.Group(); scene.add(frame);   // 模型的座標系（和遊戲一樣：+y 上）
let content = null;                                  // 編輯中的模型（frame 底下，一層網格）
const helpers = new THREE.Group(); scene.add(helpers);

const ED = {
  scene, camera, controls, renderer, frame,
  get canvas() { return renderer.domElement; },
  get content() { return content; },
  get w() { return view.clientWidth; }, get h() { return view.clientHeight; },
  mat: { setBox() {}, meshes: () => meshes() },
  split: { active: false, cutting: false },
  originMode: false, tc: null, sel: null, select() {},
  pushUndo, changed, toast,
};
const face = new FaceTool(ED);

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

// ───── 狀態 ─────
const S = { man: {}, key: null, def: null, canEdit: null, undo: [], redo: [], dirty: false, srcName: '' };
const meshes = () => { const out = []; if (content) content.traverse((o) => { if (o.isMesh && o.visible && !o.userData.edDeleted) out.push(o); }); return out; };

let toastT = 0;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = 'on' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), bad ? 5000 : 3000); }
async function busy(fn) { $('busy').classList.add('on'); await new Promise((r) => setTimeout(r, 30)); try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), true); } finally { $('busy').classList.remove('on'); } }

// ───── 復原：記下每個網格的幾何、材質、顯示 ─────
function snap() { return content ? content.children.map((m) => ({ m, g: m.geometry, mat: m.material, vis: m.visible, del: !!m.userData.edDeleted })) : []; }
function restore(s) {
  content.clear();
  for (const e of s) { e.m.geometry = e.g; e.m.material = e.mat; e.m.visible = e.vis; e.m.userData.edDeleted = e.del; content.add(e.m); }
  face.clear(true); changed();
}
function pushUndo() { S.undo.push(snap()); if (S.undo.length > 40) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return; S.redo.push(snap()); restore(S.undo.pop()); }
function redo() { if (!S.redo.length) return; S.undo.push(snap()); restore(S.redo.pop()); }
function changed() { S.dirty = true; refresh(); }

// ───── 模型清單 ─────
async function loadList() {
  const [man, ce] = await Promise.all([
    fetch('../api/models', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('../api/models/can-edit', { headers: authHeaders() }).then((r) => r.json()).catch(() => ({ ok: false })),
  ]);
  S.man = man.models || {}; S.canEdit = ce;
  renderList();
}
function renderList() {
  const rank = (k) => { const i = KIND_ORDER.indexOf(S.man[k].kind); return i < 0 ? 9 : i; };
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let h = '';
  for (const [p, n] of STYLES) {
    const keys = Object.keys(S.man).filter((k) => k[0] === p).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
    if (!keys.length) continue;
    h += `<div class="grp">${n}</div>`;
    for (const k of keys) {
      const m = S.man[k];
      h += `<div class="it${k === S.key ? ' on' : ''}" data-k="${k}"><span>${esc(m.name || k)}${m.painted ? ' <span class="tag">已改</span>' : ''}</span><small>${KIND[m.kind] || m.kind}・${k}</small></div>`;
    }
  }
  $('list').innerHTML = h;
  for (const el of $('list').querySelectorAll('.it')) el.onclick = () => openKey(el.dataset.k);
}

// ───── 載入與攤平 ─────
async function openKey(key) {
  if (S.dirty && !confirm('目前的修改還沒存回，要放棄嗎？')) return;
  const m = S.man[key]; if (!m) return;
  S.key = key; S.def = m; location.hash = key;
  renderList();
  await busy(async () => {
    const buf = await fetch('..' + m.glb, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
    await loadBuffer(buf, m.file.split(/[\\/]/).pop());
    S.dirty = false; refresh();
  });
}
async function loadBuffer(buf, name) {
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  gltf.scene.updateMatrixWorld(true);
  const root = new THREE.Group(); root.name = (S.def && S.def.name) || name;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();   // 屬性一律換成一般的 Float32（量化、交錯的都轉開），之後的運算才不用分情況
    for (const [n, a] of Object.entries(o.geometry.attributes)) g.setAttribute(n, floatAttr(a));
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    for (const gr of o.geometry.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
    bakeGeo(g, o.matrixWorld);
    const mesh = new THREE.Mesh(g, o.material); mesh.name = o.name || 'mesh';
    root.add(mesh);
  });
  if (content) { frame.remove(content); face.reset(); }
  content = root; frame.add(content);
  S.undo = []; S.redo = []; S.srcName = name; S.bytes = buf.byteLength;
  fitView();
}
// 把矩陣寫進頂點：位置、法線（three 處理），分件動畫的樞軸點（_piv）當成點一起變換；矩陣是鏡像時翻轉三角形繞向
function bakeGeo(g, m) {
  for (const n of Object.keys(g.attributes)) if (isPiv(n)) g.attributes[n] = g.attributes[n].clone().applyMatrix4(m);
  g.applyMatrix4(m);
  if (m.determinant() < 0) flipWinding(g);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
function flipWinding(g) {
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  const a = g.index.array.slice(); for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
  g.setIndex(new THREE.BufferAttribute(a, 1));
}
function box() { const b = new THREE.Box3(); for (const o of meshes()) b.expandByObject(o); return b; }
function fitView() {
  const b = box(); if (b.isEmpty()) return;
  const s = b.getSize(new THREE.Vector3()).length() || 1, c = b.getCenter(new THREE.Vector3());
  camera.near = s / 200; camera.far = s * 50; camera.updateProjectionMatrix();
  camera.position.copy(c).add(new THREE.Vector3(0.9, 0.55, 0.9).multiplyScalar(s * 1.1));
  controls.target.copy(c); controls.update();
}

// ───── 規格檢查與輔助線 ─────
function refresh() {
  $('btnUndo').disabled = !S.undo.length; $('btnRedo').disabled = !S.redo.length;
  face.render();   // 刪除多邊形的按鈕（有模型才能用）
  const m = S.def, list = meshes();
  $('cur').textContent = m ? `${m.name}（${S.key}・${KIND[m.kind] || m.kind}・${m.file}）${S.dirty ? ' ＊未存' : ''}` : '選一個模型';
  $('fwdName').textContent = fwdOf(m);
  for (const o of list) for (const mt of [].concat(o.material)) mt.wireframe = $('wire').checked;
  drawHelpers();
  if (!m || !content) return;
  const C = [], add = (cls, t) => C.push(`<div class="${cls}">${t}</div>`);
  const tris = list.reduce((n, o) => n + triCountOf(o.geometry), 0), verts = list.reduce((n, o) => n + o.geometry.attributes.position.count, 0);
  // 網格數：遊戲只用第一個
  if (!list.length) add('bad', '沒有網格');
  else if (list.length === 1) add('ok', '一個網格（遊戲會完整顯示）');
  else add('bad', `${list.length} 個網格：遊戲只顯示第一個（${triCountOf(list[0].geometry).toLocaleString()} 面），其他 ${list.length - 1} 個不會出現 → 「合併成一個網格」`);
  // 面數
  const bud = BUDGET[m.kind] || 20000;
  if (tris > bud * 2) add('bad', `${tris.toLocaleString()} 面：遠超過參考的 ${bud.toLocaleString()} 面，大艦隊時會拖慢畫面 → 「減面」`);
  else if (tris > bud) add('warn', `${tris.toLocaleString()} 面：超過參考的 ${bud.toLocaleString()} 面`);
  else add('ok', `${tris.toLocaleString()} 面（參考上限 ${bud.toLocaleString()}）`);
  // 貼圖
  const mt0 = list[0] && [].concat(list[0].material)[0], tex = mt0 && mt0.map, img = tex && tex.image;
  if (!tex) add('warn', '第一個網格沒有顏色貼圖：遊戲會畫成灰色');
  else {
    const w = img.width, h = img.height;
    if (Math.max(w, h) > 4096) add('warn', `貼圖 ${w}×${h}：太大，存檔時選「貼圖最大邊 2048」`);
    else add('ok', `貼圖 ${w}×${h}`);
  }
  const multiMat = list.some((o) => Array.isArray(o.material)) || new Set(list.map((o) => o.material)).size > 1;
  if (multiMat) add('warn', '有多個材質：遊戲只用第一個的貼圖');
  if (list.some((o) => !o.geometry.attributes.uv)) add('warn', '有網格沒有 UV：貼圖畫不上去');
  else {
    let out = false; for (const o of list) { const uv = o.geometry.attributes.uv; for (let i = 0; i < uv.count && !out; i++) { const u = uv.getX(i), v = uv.getY(i); if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) out = true; } }
    if (out) add('info', 'UV 超出 0～1（重複貼圖）：合併成圖集時會被夾住');
  }
  // 分件動畫
  const rig = list.some((o) => RIG_ATTRS.some((n) => o.geometry.attributes[n]));
  if (rig) add('info', '有武器分件動畫資料（_PART／_PIV）：轉向、合併、減面都會保留');
  // 尺寸與原點
  const b = box(), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const f = FWD[fwdOf(m)], len = Math.abs(f[0]) ? sz.x : sz.z, wid = Math.abs(f[0]) ? sz.z : sz.x;
  if (m.kind !== 'weapon') {
    if (wid > len * 1.25) add('warn', `船寬（${wid.toFixed(2)}）大於船長（${len.toFixed(2)}）：船頭可能沒對準青色箭頭`);
    if (sz.y > len * 1.25 && m.kind !== 'station') add('warn', '高度大於船長：可能躺著，試試繞 X 轉 90°');
    const off = c.length() / Math.max(1e-6, len);
    if (off > 0.08) add('warn', `外框中心離原點 ${(off * 100).toFixed(0)}% 船長：船會繞著偏掉的點轉 → 「外框中心 → 原點」`);
    else add('ok', '原點在船的中心附近');
  } else add('info', '武器的底座位置由伺服器自動對齊');
  $('checks').innerHTML = C.join('');
  $('stats').textContent = `${verts.toLocaleString()} 頂點・外框 ${sz.x.toFixed(2)} × ${sz.y.toFixed(2)} × ${sz.z.toFixed(2)}・原檔 ${(S.bytes / 1048576).toFixed(1)} MB`;
  $('simpTarget').placeholder = String(bud);
  const ce = S.canEdit && S.canEdit.ok;
  $('btnSave').disabled = !ce; $('btnRestore').disabled = !ce || !m.painted;
  $('saveNote').textContent = ce ? '存回時伺服器先把原檔備份到 models\\_原始\\（第一次），再覆蓋並重算遠景網格；遊戲重新整理後套用。'
    : S.canEdit && S.canEdit.mode === 'off' ? '伺服器設定不允許存回（config.json 的 modelEdit）。可以下載 .glb 自己替換。'
    : '只有在伺服器那台電腦上才能存回（config.json 的 modelEdit 改成 "all" 就能從別台存）。可以下載 .glb。';
}
function drawHelpers() {
  helpers.clear();
  if (!content || !S.def) return;
  const b = box(); if (b.isEmpty()) return;
  const sz = b.getSize(new THREE.Vector3()), s = Math.max(sz.x, sz.y, sz.z) || 1;
  const grid = new THREE.GridHelper(s * 2, 20, 0x2a3a5a, 0x18233a); grid.position.y = b.min.y; helpers.add(grid);
  const f = new THREE.Vector3(...FWD[fwdOf(S.def)]);
  helpers.add(new THREE.ArrowHelper(f, new THREE.Vector3(), s * 0.8, 0x33ddff, s * 0.12, s * 0.06));
  helpers.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), s * 0.45, 0xffcc33, s * 0.08, s * 0.04));
  const bh = new THREE.Box3Helper(b, 0x3a4f78); helpers.add(bh);
  for (const h of helpers.children) if (h.type === 'ArrowHelper') for (const p of [h.line, h.cone]) { p.material.depthTest = false; p.renderOrder = 25; }   // 箭頭穿過模型也看得到
  const dot = new THREE.Mesh(new THREE.SphereGeometry(s * 0.012), new THREE.MeshBasicMaterial({ color: 0xff8844, depthTest: false })); dot.renderOrder = 30; helpers.add(dot);
}

// ───── 變換 ─────
function applyAll(m) {
  if (!content) return;
  pushUndo();
  for (const o of content.children) o.geometry = bakeGeo(o.geometry.clone(), m);
  face.clear(true); changed();
}
for (const b of document.querySelectorAll('[data-rot]')) b.onclick = () => {
  const [ax, k] = b.dataset.rot.split(','), a = (Math.PI / 2) * +k;
  applyAll(new THREE.Matrix4()[{ x: 'makeRotationX', y: 'makeRotationY', z: 'makeRotationZ' }[ax]](a));
};
$('btnMirror').onclick = () => applyAll(new THREE.Matrix4().makeScale(-1, 1, 1));
$('btnCenter').onclick = () => { const c = box().getCenter(new THREE.Vector3()); applyAll(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)); };
$('btnBottom').onclick = () => { const b = box(), c = b.getCenter(new THREE.Vector3()); applyAll(new THREE.Matrix4().makeTranslation(-c.x, -b.min.y, -c.z)); };

// ───── 焊接、減面 ─────
$('btnWeld').onclick = () => busy(async () => {
  if (!content) return;
  const before = meshes().reduce((n, o) => n + o.geometry.attributes.position.count, 0);
  pushUndo();
  for (const o of meshes()) { const g = weldGeometry(o.geometry); g.computeBoundingBox(); g.computeBoundingSphere(); o.geometry = g; }
  const after = meshes().reduce((n, o) => n + o.geometry.attributes.position.count, 0);
  face.clear(true); changed(); toast(`頂點 ${before.toLocaleString()} → ${after.toLocaleString()}`);
});
$('btnSimp').onclick = () => busy(async () => {
  if (!content) return;
  const list = meshes(), tris = list.reduce((n, o) => n + triCountOf(o.geometry), 0);
  const target = parseInt($('simpTarget').value, 10) || BUDGET[S.def.kind] || 20000;
  if (target >= tris) return toast(`目前 ${tris.toLocaleString()} 面，已經不超過 ${target.toLocaleString()}`);
  pushUndo();
  const ratio = target / tris;
  for (const o of list) o.geometry = await simplifyGeometry(o.geometry, ratio);
  const after = meshes().reduce((n, o) => n + triCountOf(o.geometry), 0);
  face.clear(true); changed(); toast(`面數 ${tris.toLocaleString()} → ${after.toLocaleString()}`);
});

// ───── 合併成一個網格＋一張圖集（取自 dev/tools/tripo/conv.html）─────
function area(geo) {
  const p = geo.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let s = 0;
  for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); s += b.sub(a).cross(c.sub(a)).length() / 2; }
  return s;
}
function partImage(mat) {   // 這個材質畫進圖集的樣子：貼圖×顏色（沒有貼圖就是純色）
  const col = mat.color ? mat.color.clone() : new THREE.Color(1, 1, 1);
  return { img: mat.map && mat.map.image, color: col, white: col.r > 0.99 && col.g > 0.99 && col.b > 0.99 };
}
function drawTile(cx, p, x, y, s) {
  if (p.img) {
    cx.drawImage(p.img, x, y, s, s);
    if (!p.white) { cx.save(); cx.globalCompositeOperation = 'multiply'; cx.fillStyle = '#' + p.color.getHexString(THREE.SRGBColorSpace); cx.fillRect(x, y, s, s); cx.restore(); }
  } else { cx.fillStyle = '#' + p.color.getHexString(THREE.SRGBColorSpace); cx.fillRect(x, y, s, s); }
}
function atlas(parts, A) {
  if (parts.length === 1) {
    const p = parts[0], s = Math.min(A, Math.max(p.img ? Math.max(p.img.width, p.img.height) : 64, 64));
    const cv = document.createElement('canvas'); cv.width = cv.height = s; drawTile(cv.getContext('2d'), p, 0, 0, s); p.tile = [0, 0, s, s, 0]; return cv;
  }
  const ar = parts.map((p) => Math.max(area(p.geo), 1e-9)), tot = ar.reduce((a, b) => a + b, 0);
  for (let k = 1.0; k > 0.02; k *= 0.95) {   // 縮小比例直到排得下（貨架式排列）
    const sz = parts.map((p, i) => Math.max(8, Math.min(A / 2, Math.floor(Math.sqrt(ar[i] / tot) * A * k)))), ord = parts.map((_, i) => i).sort((a, b) => sz[b] - sz[a]);
    let x = 0, y = 0, rowH = 0, ok = true; const pos = [];
    for (const i of ord) { const s = sz[i]; if (x + s > A) { x = 0; y += rowH; rowH = 0; } if (y + s > A) { ok = false; break; } pos[i] = [x, y, s]; x += s; rowH = Math.max(rowH, s); }
    if (!ok) continue;
    const cv = document.createElement('canvas'); cv.width = cv.height = A; const cx = cv.getContext('2d'); cx.fillStyle = '#808080'; cx.fillRect(0, 0, A, A);
    parts.forEach((p, i) => {
      const [tx, ty, s] = pos[i], pad = Math.max(1, Math.min(4, Math.floor(s / 16)));
      drawTile(cx, p, tx, ty, s); drawTile(cx, p, tx + pad, ty + pad, s - pad * 2);   // 外圈先畫一層，避免取樣到格子外
      p.tile = [tx, ty, s, s, pad];
    });
    return cv;
  }
  throw new Error('圖集排不下：零件太多，試試 4096');
}
$('btnMerge').onclick = () => busy(async () => {
  if (!content) return;
  const list = meshes(); if (!list.length) return;
  // 每個（網格, 材質群組）當一個零件；攤成不共用頂點的三角形
  const parts = [];
  for (const o of list) {
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const mats = [].concat(o.material), groups = g.groups.length && Array.isArray(o.material) ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) {
      const sub = new THREE.BufferGeometry();
      for (const [n, a] of Object.entries(g.attributes)) {
        const arr = new Float32Array(gr.count * a.itemSize);
        for (let i = 0; i < gr.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(gr.start + i, c);
        sub.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize));
      }
      parts.push({ geo: sub, ...partImage(mats[gr.materialIndex] || mats[0]) });
    }
  }
  const A = +$('atlasSize').value, cv = atlas(parts, A), W = cv.width;
  // 共有的屬性才保留（位置一定有；法線、UV 沒有的補上；分件動畫的屬性沒有的補 0）
  const keep = new Set(['position', 'normal', 'uv']);
  for (const p of parts) for (const n of Object.keys(p.geo.attributes)) if (RIG_ATTRS.includes(n)) keep.add(n);
  let n = 0; for (const p of parts) n += p.geo.attributes.position.count;
  const out = {}; const size = { position: 3, normal: 3, uv: 2 };
  for (const k of keep) { const s = size[k] || (isPiv(k) ? 3 : 1); size[k] = s; out[k] = new Float32Array(n * s); }
  let o = 0;
  for (const p of parts) {
    if (!p.geo.attributes.normal) p.geo.computeVertexNormals();
    const cnt = p.geo.attributes.position.count, [tx, ty, tw, th, pad] = p.tile;
    for (const k of keep) {
      const a = p.geo.attributes[k], s = size[k];
      if (k === 'uv') {
        for (let i = 0; i < cnt; i++) {
          let u = a ? a.getX(i) : 0.5, v = a ? a.getY(i) : 0.5; u = Math.min(1, Math.max(0, u)); v = Math.min(1, Math.max(0, v));
          out.uv[(o + i) * 2] = (tx + pad + u * (tw - pad * 2)) / W; out.uv[(o + i) * 2 + 1] = (ty + pad + v * (th - pad * 2)) / W;
        }
      } else if (a) for (let i = 0; i < cnt; i++) for (let c = 0; c < s; c++) out[k][(o + i) * s + c] = a.getComponent(i, c);
    }
    o += cnt;
  }
  const g = new THREE.BufferGeometry();
  for (const k of keep) g.setAttribute(k, new THREE.BufferAttribute(out[k], size[k]));
  const merged = weldGeometry(g); merged.computeBoundingBox(); merged.computeBoundingSphere();
  const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  const m0 = [].concat(list[0].material)[0];
  const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: m0.metalness ?? 0.3, roughness: m0.roughness ?? 0.6 });
  pushUndo();
  const mesh = new THREE.Mesh(merged, mat); mesh.name = S.key || 'model';
  content.clear(); content.add(mesh);
  face.clear(true); changed(); toast(`已合併 ${parts.length} 個零件 → 1 個網格（${triCountOf(merged).toLocaleString()} 面、圖集 ${W}×${W}）`);
});

// ───── 匯出 ─────
async function exportBuffer() {
  const list = meshes(); if (!list.length) throw new Error('沒有網格可以存');
  const texMax = +$('texMax').value, jpeg = $('texFmt').value === 'jpeg';
  const root = new THREE.Group(); root.name = S.key || 'model';
  for (const o of list) {
    const g = o.geometry.clone();
    // 分件動畫的屬性：去掉前面的底線再匯出，GLTFExporter 會加回一個（_PART／_PIV），重存幾次都不會越加越多
    for (const n of Object.keys(g.attributes)) if (/^_+/.test(n)) { const a = g.attributes[n]; g.deleteAttribute(n); g.setAttribute(n.replace(/^_+/, ''), a); }
    const mats = [].concat(o.material).map((m) => { if (m.map) m.map.userData.mimeType = jpeg ? 'image/jpeg' : 'image/png'; return m; });
    for (const m of mats) m.wireframe = false;
    const mesh = new THREE.Mesh(g, Array.isArray(o.material) ? mats : mats[0]); mesh.name = o.name; root.add(mesh);
  }
  try { return await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: texMax || Infinity }); }
  finally { refresh(); }
}
$('btnDl').onclick = () => busy(async () => {
  const buf = await exportBuffer(), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' })); a.download = (S.srcName || 'model.glb').replace(/\.glb$/i, '') + '_edit.glb'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
$('btnSave').onclick = () => busy(async () => {
  if (!S.key) return;
  if (meshes().length > 1 && !confirm('還有好幾個網格，遊戲只會顯示第一個。仍然要存回嗎？')) return;
  const buf = await exportBuffer();
  const r = await fetch(`../api/models/${S.key}/glb`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'model/gltf-binary' }, body: buf });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  if (j.model) S.man[S.key] = S.def = j.model;
  S.dirty = false; S.bytes = buf.byteLength; renderList(); refresh();
  toast(`已存回「${S.def.name}」（${(buf.byteLength / 1048576).toFixed(1)} MB）。遊戲重新整理後套用。`);
});
$('btnRestore').onclick = () => busy(async () => {
  if (!S.key || !confirm(`把「${S.def.name}」換回原本的 GLB？`)) return;
  const r = await fetch(`../api/models/${S.key}/restore`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: '{}' });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  await loadList(); S.dirty = false; await openKey(S.key); toast('已還原原始檔');
});

// ───── 拖檔進來：取代目前的模型（存回前不影響遊戲）─────
view.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').classList.add('on'); });
view.addEventListener('dragleave', () => $('drop').classList.remove('on'));
view.addEventListener('drop', (e) => {
  e.preventDefault(); $('drop').classList.remove('on');
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (!S.key) return toast('先在左邊選要替換的模型', true);
  busy(async () => { const prev = snap(); await loadBuffer(await f.arrayBuffer(), f.name); S.undo = [prev]; changed(); toast(`已載入 ${f.name}：修正後按「存回遊戲」`); });
});

// ───── 按鍵 ─────
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
  else if (k === 'delete' && face.on) face.deleteSel();
  else if (k === 'escape' && face.on) face.clear();
  else if (k === 'f') fitView();
});
$('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
$('wire').onchange = refresh;
addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

face.setupUi();
resize();
loadList().then(() => { const k = decodeURIComponent(location.hash.slice(1)); if (S.man[k]) openKey(k); }).catch((e) => toast('讀不到模型清單：' + e.message, true));
addEventListener('hashchange', () => { const k = decodeURIComponent(location.hash.slice(1)); if (S.man[k] && k !== S.key) openKey(k); });   // 遊戲用同一個分頁開別的模型
window.__mt = { S, ED, face, meshes, refresh, exportBuffer, openKey };
