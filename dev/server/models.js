// 模型資料夾：讀 models.json → 解析 GLB → 算轉向矩陣與遠景細節（LOD）→ 快取在 data/cache
// 原始 GLB 一律原封不動交給瀏覽器（近距離用的就是原檔）；這裡只額外產生遠景用的簡化網格
'use strict';
const fs = require('fs');
const path = require('path');
const _ms = require('meshoptimizer/meshopt_simplifier.js');
const MeshoptSimplifier = _ms.MeshoptSimplifier || _ms;

const ALGO = 2;   // 簡化演算法版本：改了就會重算快取
const LOD_TARGETS = { hull: [4000, 1000, 250], fighter: [4000, 1000, 250], weapon: [2500, 700, 160] };

// ───── GLB 解析（只取第一個網格的位置、UV、索引，以及它所在節點的世界矩陣）─────
const COMP = { 5120: [Int8Array, 127], 5121: [Uint8Array, 255], 5122: [Int16Array, 32767], 5123: [Uint16Array, 65535], 5125: [Uint32Array, 0], 5126: [Float32Array, 0] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function parseGLB(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB 檔');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB 沒有 JSON 區塊');
  return { json, bin };
}
function readAccessor(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView];
  if (a.sparse) throw new Error('不支援 sparse accessor');
  if (bv.buffer !== 0 || !g.bin) throw new Error('只支援內嵌在 GLB 裡的資料');
  const [T, norm] = COMP[a.componentType], n = NCOMP[a.type], size = T.BYTES_PER_ELEMENT;
  const stride = bv.byteStride || n * size, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(a.count * n);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    let v = dv[get](base + k * stride + c * size, true);
    if (a.normalized && norm) v = Math.max(v / norm, -1);
    out[k * n + c] = v;
  }
  return out;
}
function mul4(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function firstMesh(g) {   // 跟 three.js GLTFLoader 一樣深度優先，找第一個掛了網格的節點
  const j = g.json, scene = j.scenes ? j.scenes[j.scene || 0] : { nodes: j.nodes.map((_, i) => i) };
  const walk = (ni, parent) => {
    const n = j.nodes[ni], m = mul4(parent, nodeMatrix(n));
    if (n.mesh != null) return { mesh: j.meshes[n.mesh], world: m };
    for (const c of n.children || []) { const r = walk(c, m); if (r) return r; }
    return null;
  };
  for (const ni of scene.nodes) { const r = walk(ni, I4); if (r) return r; }
  throw new Error('GLB 裡找不到網格');
}
function apply4(m, P) {
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    P[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; P[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; P[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
}
function bounds(P) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); } return { mn, mx }; }
// 船頭朝向 → 轉到 ＋z 的旋轉矩陣（繞 y）
function forwardMatrix(f) {
  switch (f || '+z') {
    case '+x': return [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1];   // x' = -z, z' = x
    case '-x': return [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];   // x' = z, z' = -x
    case '-z': return [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
    case '+z': return I4.slice();
    default: throw new Error('forward 只能是 +z、-z、+x、-x');
  }
}

// ───── 簡化（與先前打包工具相同的做法）─────
function cluster(pos, uv, idx, nv, g, uvAware) {
  const { mn, mx } = bounds(pos);
  const size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / g;
  const map = new Map(), cid = new Int32Array(nv), acc = [];
  for (let v = 0; v < nv; v++) {
    let k = `${Math.floor((pos[v * 3] - mn[0]) / size)},${Math.floor((pos[v * 3 + 1] - mn[1]) / size)},${Math.floor((pos[v * 3 + 2] - mn[2]) / size)}`;
    if (uvAware) k += `|${Math.floor(uv[v * 2] * 12)},${Math.floor(uv[v * 2 + 1] * 12)}`;
    let c = map.get(k);
    if (c == null) { c = acc.length; map.set(k, c); acc.push([0, 0, 0, 0, 0, 0]); }
    const a = acc[c]; a[0] += pos[v * 3]; a[1] += pos[v * 3 + 1]; a[2] += pos[v * 3 + 2]; a[3] += uv[v * 2]; a[4] += uv[v * 2 + 1]; a[5]++;
    cid[v] = c;
  }
  const P = new Float32Array(acc.length * 3), U = new Float32Array(acc.length * 2);
  acc.forEach((a, c) => { P[c * 3] = a[0] / a[5]; P[c * 3 + 1] = a[1] / a[5]; P[c * 3 + 2] = a[2] / a[5]; U[c * 2] = a[3] / a[5]; U[c * 2 + 1] = a[4] / a[5]; });
  const seen = new Set(), out = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = cid[idx[t]], b = cid[idx[t + 1]], c = cid[idx[t + 2]];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(key)) continue; seen.add(key);
    out.push(a, b, c);
  }
  return { idx: Uint32Array.from(out), pos: P, uv: U, nv: acc.length };
}
function clusterToTarget(pos, uv, idx, nv, target, uvAware) {
  let lo = 4, hi = 256, best = null;
  for (let it = 0; it < 12; it++) {
    const g = Math.round((lo + hi) / 2), r = cluster(pos, uv, idx, nv, g, uvAware), tris = r.idx.length / 3;
    if (!best || Math.abs(tris - target) < Math.abs(best.idx.length / 3 - target)) best = r;
    if (tris > target) hi = g - 1; else lo = g + 1;
    if (lo > hi) break;
  }
  return best;
}
function makeLods(kind, pos, uv, idx) {
  const nv = pos.length / 3, out = [], weapon = kind === 'weapon';
  for (const target of LOD_TARGETS[kind] || LOD_TARGETS.hull) {
    const tc = target * 3;
    let [I] = MeshoptSimplifier.simplify(idx, pos, 3, tc, weapon ? 0.05 : 0.08, []), P = pos, UV = uv, NV = nv;
    if (I.length > tc * (weapon ? 1.5 : 1.5)) { const r = clusterToTarget(pos, uv, idx, nv, target, target >= (weapon ? 1000 : 2000)); I = r.idx; P = r.pos; UV = r.uv; NV = r.nv; }
    const remap = new Int32Array(NV).fill(-1); let n = 0;
    for (const v of I) if (remap[v] < 0) remap[v] = n++;
    const p = new Float32Array(n * 3), u = new Float32Array(n * 2);
    for (let v = 0; v < NV; v++) { const r = remap[v]; if (r < 0) continue; p[r * 3] = P[v * 3]; p[r * 3 + 1] = P[v * 3 + 1]; p[r * 3 + 2] = P[v * 3 + 2]; u[r * 2] = UV[v * 2]; u[r * 2 + 1] = UV[v * 2 + 1]; }
    const ix = n < 65536 ? Uint16Array.from(I, (v) => remap[v]) : Uint32Array.from(I, (v) => remap[v]);
    out.push({ p, u, ix, tris: I.length / 3, verts: n });
  }
  return out;
}

// 處理一個模型：回傳 { meta, bin }
function processModel(key, def, file) {
  const g = parseGLB(fs.readFileSync(file));
  const { mesh, world } = firstMesh(g);
  const prim = mesh.primitives[0];
  if (prim.attributes.POSITION == null) throw new Error('網格沒有頂點位置');
  const P0 = readAccessor(g, prim.attributes.POSITION);
  const uv = prim.attributes.TEXCOORD_0 != null ? Float32Array.from(readAccessor(g, prim.attributes.TEXCOORD_0)) : new Float32Array(P0.length / 3 * 2);
  const nv = P0.length / 3;
  const idx = prim.indices != null ? Uint32Array.from(readAccessor(g, prim.indices)) : Uint32Array.from({ length: nv }, (_, i) => i);
  // orient＝（武器底座歸零）×（縮放）×（轉向），套在節點世界座標之後
  let orient = forwardMatrix(def.forward);
  const P = Float64Array.from(P0); apply4(mul4(orient, world), P);
  let { mn, mx } = bounds(P);
  if (def.kind !== 'weapon') {   // 船體與艦載機：船長（z）不是 1 就縮放成 1（現有模型本來就是 1，不會動）
    const len = mx[2] - mn[2], s = def.scale || (Math.abs(len - 1) > 0.02 ? 1 / len : 1);
    if (s !== 1) { const S = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]; orient = mul4(S, orient); apply4(S, P); }
  } else {   // 武器：最低 20% 高度的頂點 xz 範圍中心當底座中心，底面 y＝0
    if (def.scale && def.scale !== 1) { const s = def.scale, S = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]; orient = mul4(S, orient); apply4(S, P); }
    ({ mn, mx } = bounds(P));
    const cut = mn[1] + (mx[1] - mn[1]) * 0.2; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < P.length; i += 3) if (P[i + 1] <= cut) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
    const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(x0 + x1) / 2, -mn[1], -(z0 + z1) / 2, 1];
    orient = mul4(T, orient); apply4(T, P);
  }
  ({ mn, mx } = bounds(P));
  const lods = makeLods(def.kind, Float32Array.from(P), uv, idx);
  // 二進位：各級依序放 位置(f32) UV(f32) 索引(u16/u32)，4 位元組對齊
  const parts = []; let off = 0; const meta = [];
  const push = (ta) => { const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; } const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength); const at = off; parts.push(b); off += b.length; return at; };
  for (const L of lods) meta.push({ verts: L.verts, tris: L.tris, pos: push(L.p), uv: push(L.u), idx: push(L.ix), idx32: L.ix instanceof Uint32Array, idxCount: L.ix.length });
  return { meta: { kind: def.kind, orient, min: mn, max: mx, tris0: idx.length / 3, lods: meta }, bin: Buffer.concat(parts) };
}

// 讀整個模型資料夾（有快取就用快取）
async function loadModels(modelsDir, cacheDir, log) {
  await MeshoptSimplifier.ready;
  const manFile = path.join(modelsDir, 'models.json');
  if (!fs.existsSync(manFile)) throw new Error(`找不到 ${manFile}`);
  const man = JSON.parse(fs.readFileSync(manFile, 'utf8'));
  fs.mkdirSync(cacheDir, { recursive: true });
  const out = {}, keys = Object.keys(man.models || {});
  let i = 0;
  for (const key of keys) {
    i++;
    const def = man.models[key], file = path.resolve(modelsDir, def.file);
    if (!file.startsWith(path.resolve(modelsDir))) { log(`  ✗ ${key}：路徑不能跑出模型資料夾`); continue; }
    if (!fs.existsSync(file)) { log(`  ✗ ${key}：找不到 ${def.file}`); continue; }
    const st = fs.statSync(file), sig = { size: st.size, mtime: Math.round(st.mtimeMs), algo: ALGO, forward: def.forward || '+z', scale: def.scale || 0, kind: def.kind };
    const cj = path.join(cacheDir, key + '.json'), cb = path.join(cacheDir, key + '.bin');
    let meta = null;
    try { const c = JSON.parse(fs.readFileSync(cj, 'utf8')); if (JSON.stringify(c.sig) === JSON.stringify(sig) && fs.existsSync(cb)) meta = c.meta; } catch (e) { /* 沒快取 */ }
    const t0 = Date.now();
    if (!meta) {
      try {
        const r = processModel(key, def, file);
        fs.writeFileSync(cb, r.bin); fs.writeFileSync(cj, JSON.stringify({ sig, meta: r.meta }));
        meta = r.meta;
      } catch (e) { log(`  ✗ ${key}（${def.file}）：${e.message}`); continue; }
      log(`  [${i}/${keys.length}] ${def.file}　${meta.tris0} 面 → 遠景 ${meta.lods.map((l) => l.tris).join('／')}　(${Date.now() - t0} ms)`);
    }
    out[key] = { ...meta, file: def.file, name: def.name || key, bytes: st.size, mtime: Math.round(st.mtimeMs), lodBytes: fs.statSync(cb).size };
    await new Promise((r) => setImmediate(r));
  }
  return out;
}
module.exports = { loadModels, parseGLB };
