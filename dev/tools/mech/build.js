// 組裝：照 units.js 的規格把下半身、武器組成一個 Group（節點名稱留給之後的動畫用）
//   leg_<fl|fr|bl|br>_<thigh|shin|foot>：四足的腿（原點在關節）；wpn_<n>：武器（原點在掛點，轉向軸）
//   userData.mech：規格、掛點、大小，GLTFExporter 會寫進 extras
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PAL, GRIME } from './units.js';

const loader = new GLTFLoader(), cache = {};
const glb = async (url) => { if (!cache[url]) cache[url] = loader.loadAsync(url); return (await cache[url]).scene.clone(true); };
let J = null, MODELS = null;
const FWD = { '+z': 0, '-z': Math.PI, '-x': Math.PI / 2, '+x': -Math.PI / 2 };
const rc = new THREE.Raycaster();

export async function init() {
  J = await (await fetch('/parts/joints.json')).json();
  MODELS = (await (await fetch('/models/models.json')).json()).models;
}

// 下半身
async function chassis(ch) {
  const root = new THREE.Group(); root.name = 'chassis';
  if (ch === 'tk') { const b = await glb('/parts/l_tk/body.glb'); b.name = 'body'; root.add(b); return root; }
  const qd = '/parts/l_qd/';
  const b = await glb(qd + 'body.glb'); b.name = 'body'; root.add(b);
  for (const s of ['fl', 'fr', 'bl', 'br']) {
    const th = await glb(qd + s + '_thigh.glb'); th.name = `leg_${s}_thigh`; th.position.fromArray(J['legs/l_qd/body']['hip_' + s].p); root.add(th);
    const sh = await glb(qd + s + '_shin.glb'); sh.name = `leg_${s}_shin`; sh.position.fromArray(J[`legs/l_qd/${s}_thigh`].knee.p); th.add(sh);
    const ft = await glb(qd + s + '_foot.glb'); ft.name = `leg_${s}_foot`; ft.position.fromArray(J[`legs/l_qd/${s}_shin`].ankle.p); sh.add(ft);
  }
  return root;
}

// ───── 塗裝：把車體貼圖烘成跟武器同一種風格 ─────
// rubicon 零件的貼圖是白色（只有面板線、細節），材質名 main／sub／joint。
// 烘焙：白貼圖的明暗 × 陣營色（取自武器貼圖的色票）× 低頻髒污 × 同陣營武器貼圖的細部紋理（高通）＋ 磨損亮點
// 遊戲裡模型只用顏色貼圖（main.js 的 MeshStandardMaterial：金屬 0.35、粗糙 0.6），所以風格全部要烘在顏色裡
const WPN_PRE = ['ew', 'aw', 'mw', 'cw', 'rw', 'iw', 'bw'];
const GS = 512, TEX = 1024, BRIGHT = 0.85;   // BRIGHT：遊戲材質下武器看起來比色票亮（k-means 含了貼圖裡的陰影）
const grungeCache = {}, bakeCache = {}, imgId = new Map();
const imgData = (img, n) => { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, n, n); return g.getImageData(0, 0, n, n); };
function boxBlur(src, n, r) {   // 可分離的方框模糊（環繞）
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n), w = 2 * r + 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let k = -r; k <= r; k++) s += src[y * n + ((x + k + n) % n)]; tmp[y * n + x] = s / w; }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[((y + k + n) % n) * n + x]; out[y * n + x] = s / w; }
  return out;
}
// 陣營武器貼圖的細部紋理：亮度減掉模糊＝高通，標準化到標準差 1（兩張武器貼圖拼起來，減少重複感）
async function grunge(fac) {
  if (grungeCache[fac]) return grungeCache[fac];
  const L = new Float32Array(GS * GS);
  for (const i of [1, 0]) {
    const o = await glb('/models/' + MODELS[WPN_PRE[fac] + i].file); let img; o.traverse((m) => { if (m.isMesh && m.material.map) img = m.material.map.image; });
    const d = imgData(img, GS).data;
    for (let p = 0; p < GS * GS; p++) { const l = (d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 765; L[p] = i === 1 ? l : (L[p] + l) / 2; }
  }
  const b = boxBlur(L, GS, 4); let s2 = 0; const hp = new Float32Array(GS * GS);
  for (let p = 0; p < hp.length; p++) { hp[p] = L[p] - b[p]; s2 += hp[p] * hp[p]; }
  const sd = Math.sqrt(s2 / hp.length) || 1; for (let p = 0; p < hp.length; p++) hp[p] = Math.max(-3, Math.min(3, hp[p] / sd));
  return (grungeCache[fac] = hp);
}
// 值雜訊（環繞）：髒污、色斑
function vnoise(seed, cells) {
  const h = (x, y) => { let v = Math.imul((x % cells + cells) % cells, 374761393) ^ Math.imul((y % cells + cells) % cells, 668265263) ^ Math.imul(seed, 2246822519); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  return (u, v) => { const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
}
// 模型 UV 實際用到的像素（亮度校正只算這些，貼圖上的空白區不算）
function uvMask(geos) {
  const c = document.createElement('canvas'); c.width = c.height = TEX; const g = c.getContext('2d'); g.fillStyle = '#fff';
  for (const geo of geos) {
    const uv = geo.attributes.uv; if (!uv) continue; const idx = geo.index, n = idx ? idx.count : uv.count;
    g.beginPath();
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, d = idx ? idx.getX(i + 2) : i + 2;
      g.moveTo(uv.getX(a) * TEX, uv.getY(a) * TEX); g.lineTo(uv.getX(b) * TEX, uv.getY(b) * TEX); g.lineTo(uv.getX(d) * TEX, uv.getY(d) * TEX); g.closePath();
    }
    g.fill();
  }
  const d = g.getImageData(0, 0, TEX, TEX).data, m = new Uint8Array(TEX * TEX); for (let p = 0; p < m.length; p++) m[p] = d[p * 4] > 127 ? 1 : 0; return m;
}
async function bake(img, hex, fac, seed, geos) {
  if (!imgId.has(img)) imgId.set(img, imgId.size + 1);   // ImageBitmap 沒有 src，用物件本身編號
  const key = imgId.get(img) + '|' + hex + '|' + seed;
  if (bakeCache[key]) return bakeCache[key];
  const G = await grunge(fac), d = imgData(img, TEX), px = d.data;
  const n1 = vnoise(seed, 6), n2 = vnoise(seed + 7, 23), n3 = vnoise(seed + 13, 71), n4 = vnoise(seed + 29, 300);   // n4：細噪點
  const gr = GRIME[fac], hv = parseInt(hex.slice(1), 16), cr = hv >> 16, cg = (hv >> 8) & 255, cb = hv & 255;   // 直接用 sRGB（THREE.Color 會轉成線性，顏色會變暗變濃）
  // 先算一遍平均明暗，讓烘好的平均色剛好是色票
  const val = new Float32Array(TEX * TEX), mask = uvMask(geos); let sum = 0, cnt = 0;
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const p = y * TEX + x, u = x / TEX, v = y / TEX;
    const l = Math.pow((px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 765, 1.6);   // 面板線加深
    const dirt = 1 - gr * 0.38 * (1 - (0.55 * n1(u, v) + 0.3 * n2(u, v) + 0.15 * n3(u, v)));
    const g = G[((y * 2) % GS) * GS + ((x * 2) % GS)];   // 武器紋理在車體上鋪 4×4
    let k = l * dirt * (1 + 0.035 * gr * g) * (1 - gr * 0.04 + gr * 0.08 * n4(u, v));
    if (gr > 0.5 && g > 1.6 && n2(u, v) > 0.55) k += 0.12 * (g - 1.6);   // 磨損：邊角刮出亮點
    val[p] = k; if (mask[p]) { sum += k; cnt++; }
  }
  const norm = BRIGHT / (sum / Math.max(1, cnt));
  for (let p = 0; p < val.length; p++) { const k = val[p] * norm; px[p * 4] = Math.min(255, cr * k); px[p * 4 + 1] = Math.min(255, cg * k); px[p * 4 + 2] = Math.min(255, cb * k); px[p * 4 + 3] = 255; }
  const c = document.createElement('canvas'); c.width = c.height = TEX; c.getContext('2d').putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (bakeCache[key] = t);
}
async function paint(root, fac) {
  const mats = new Map(), list = [];
  root.traverse((m) => { if (m.isMesh) list.push(m); });
  for (const m of list) {
    const src = m.material, n = src.name, i = n === 'sub' ? 1 : n === 'joint' ? 2 : 0;
    if (!mats.has(src.uuid)) {
      const mat = new THREE.MeshStandardMaterial({ name: `mech_${n}`, metalness: 0.35, roughness: 0.6 });
      const geos = list.filter((o) => o.material === src || o.material.uuid === src.uuid).map((o) => o.geometry);
      mat.map = src.map ? await bake(src.map.image, PAL[fac][i], fac, 11 + i * 31 + fac * 7, geos) : null;
      if (!mat.map) mat.color.set(PAL[fac][i]);
      mats.set(src.uuid, mat);
    }
    m.material = mats.get(src.uuid);
  }
}

function surfY(obj, x, z) {
  obj.updateMatrixWorld(true);
  rc.set(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0));
  const h = rc.intersectObject(obj, true);
  return h.length ? h[0].point.y : null;
}

async function weapon(k) {
  if (k.startsWith('rb:')) { const o = await glb(`/parts/back/${k.slice(3)}/r.glb`); return o; }
  const v = MODELS[k]; const o = await glb('/models/' + v.file); o.rotation.y = FWD[v.forward];
  o.traverse((m) => { if (m.isMesh && !m.geometry.attributes.normal) { m.geometry = m.geometry.clone(); m.geometry.computeVertexNormals(); } });   // TRIPO 匯出的沒有法線
  return o;
}

// 掛一個武器（第 i 個）：已經有同名節點就換掉（編輯器改一個武器時只重建那一個）
export async function mountWeapon(root, U, i) {
  const W = U.w[i], body = root.getObjectByName('body');
  const old = root.getObjectByName(`wpn_${i}`); if (old) old.removeFromParent();
  const raw = await weapon(W.k);
  // 正規化：最長邊＝1，中心在原點
  const nb = new THREE.Box3().setFromObject(raw), sz = nb.getSize(new THREE.Vector3()), c = nb.getCenter(new THREE.Vector3());
  const norm = new THREE.Group(); norm.add(raw); raw.position.sub(c);
  norm.scale.setScalar(W.s * (U.ch === 'tk' ? 1.15 : 1) / Math.max(sz.x, sz.y, sz.z));   // 履帶車體較寬，武器放大一點
  const pitch = new THREE.Group(); pitch.name = `wpn_${i}_pitch`; pitch.add(norm); pitch.rotation.x = -(W.pitch || 0) * Math.PI / 180;
  const yaw = new THREE.Group(); yaw.name = `wpn_${i}`; yaw.add(pitch); yaw.rotation.y = (W.yaw || 0) * Math.PI / 180;
  // 底部貼在車體表面
  const [x, z] = W.at.length === 3 ? [W.at[0], W.at[2]] : W.at;
  const base = W.at.length === 3 ? W.at[1] : (surfY(body, x, z) ?? (U.ch === 'qd' ? 5.8 : 3.4));   // 沒打到車體＝用平台高度
  yaw.updateMatrixWorld(true);
  const minY = new THREE.Box3().setFromObject(yaw).min.y;
  pitch.position.y = -minY;   // 武器底部抬到 yaw 節點的 y=0
  const y = base - 0.15;   // 稍微嵌進車體（指定高度 [x, y, z] 也一樣，y＝表面高度）
  yaw.position.set(x, y, z); yaw.userData.wi = i;
  root.add(yaw);
  return { k: W.k, p: [x, +y.toFixed(3), z], s: W.s, yaw: W.yaw || 0 };
}
export function finish(root, U, mounts) {
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  root.userData.mech = { id: U.id, fac: U.fac, ch: U.ch, size: U.size, name: U.name, role: U.role, mounts,
    box: [bb.min.toArray().map((v) => +v.toFixed(2)), bb.max.toArray().map((v) => +v.toFixed(2))] };
  return root;
}
export async function build(U) {
  const root = new THREE.Group(); root.name = U.id;
  const ch = await chassis(U.ch); await paint(ch, U.fac); root.add(ch);
  const mounts = [];
  for (let i = 0; i < U.w.length; i++) mounts.push(await mountWeapon(root, U, i));
  return finish(root, U, mounts);
}
// 掛點上方的車體表面高度（編輯器的「貼合車體」用）
export function surfaceAt(root, x, z) { return surfY(root.getObjectByName('body'), x, z); }
export const weaponList = () => MODELS;

// 預覽用：換成遊戲裡的材質（main.js：只用顏色貼圖、金屬 0.35、粗糙 0.6、自發光＝貼圖 ×0.16）
export function gameLook(root) {
  const mats = new Map();
  root.traverse((m) => {
    if (!m.isMesh) return;
    const src = m.material;
    if (!mats.has(src.uuid)) mats.set(src.uuid, new THREE.MeshStandardMaterial({ map: src.map, color: src.map ? 0xffffff : src.color, metalness: 0.35, roughness: 0.6, emissiveMap: src.map, emissive: src.map ? 0xffffff : 0, emissiveIntensity: 0.16 }));
    m.material = mats.get(src.uuid);
  });
  return root;
}
