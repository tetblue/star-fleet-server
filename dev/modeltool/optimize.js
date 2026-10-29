// 移植自 rubicon-protocol（MIT）src/library/editor-opt.js（焊接、減面）與 editor-cut.js（floatAttr）。改用 npm 的 three。
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js';

// 任何屬性（交錯、量化的整數）→ 一般的 Float32 屬性
export function floatAttr(a) {
  const k = 1;   // three r160 的 getX 已經把正規化的整數換回小數（r128 沒有，原本要自己乘）
  const out = new Float32Array(a.count * a.itemSize);
  const get = ['getX', 'getY', 'getZ', 'getW'];
  for (let i = 0; i < a.count; i++)
    for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a[get[c]](i) * k;
  return new THREE.BufferAttribute(out, a.itemSize);
}


// ---------- 焊接：屬性完全相同（量化後）的頂點合併成一個，回傳有索引的新幾何（保留 groups）----------
export function weldGeometry(g) {
  const names = Object.keys(g.attributes);
  const attrs = names.map((n) => floatAttr(g.attributes[n]));
  const q = names.map((n) => (n === 'position' ? 1e5 : 1e4));
  const count = g.attributes.position.count;
  const map = new Map();
  const remap = new Uint32Array(count);
  let uniq = 0;
  const first = [];
  for (let i = 0; i < count; i++) {
    let key = '';
    attrs.forEach((a, k) => {
      for (let c = 0; c < a.itemSize; c++) key += Math.round(a.array[i * a.itemSize + c] * q[k]) + ',';
    });
    let j = map.get(key);
    if (j === undefined) {
      j = uniq++;
      map.set(key, j);
      first.push(i);
    }
    remap[i] = j;
  }
  const out = new THREE.BufferGeometry();
  attrs.forEach((a, k) => {
    const arr = new Float32Array(uniq * a.itemSize);
    first.forEach((src, j) =>
      arr.set(a.array.subarray(src * a.itemSize, (src + 1) * a.itemSize), j * a.itemSize),
    );
    out.setAttribute(names[k], new THREE.BufferAttribute(arr, a.itemSize));
  });
  const src = g.index ? g.index.array : null;
  const n = src ? src.length : count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = remap[src ? src[i] : i];
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  return out;
}

// 只留下索引用到的頂點
function compact(g, idx, groups) {
  const used = new Int32Array(g.attributes.position.count).fill(-1);
  let n = 0;
  for (const i of idx) if (used[i] < 0) used[i] = n++;
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = new Float32Array(n * a.itemSize);
    for (let i = 0; i < used.length; i++)
      if (used[i] >= 0) arr.set(a.array.subarray(i * a.itemSize, (i + 1) * a.itemSize), used[i] * a.itemSize);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  const ni = n > 65535 ? new Uint32Array(idx.length) : new Uint16Array(idx.length);
  for (let i = 0; i < idx.length; i++) ni[i] = used[idx[i]];
  out.setIndex(new THREE.BufferAttribute(ni, 1));
  for (const gr of groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

export const triCountOf = (g) => Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);

// 減面到約 ratio 倍（每個材質群組各自減）：以法線與貼圖座標為屬性，避免貼圖拉扯；回傳新幾何
export async function simplifyGeometry(g, ratio) {
  await MeshoptSimplifier.ready;
  MeshoptSimplifier.useExperimentalFeatures = true;   // meshoptimizer 0.22 的 simplifyWithAttributes 還算實驗功能，要先打開
  const w = weldGeometry(g);
  if (ratio >= 1) return compact(w, w.index.array, w.groups);
  const pos = w.attributes.position.array;
  const nv = w.attributes.position.count;
  const extra = [];
  const weights = [];
  if (w.attributes.normal) {
    extra.push([w.attributes.normal, 3]);
    weights.push(0.5, 0.5, 0.5);
  }
  if (w.attributes.uv) {
    extra.push([w.attributes.uv, 2]);
    weights.push(1, 1);
  }
  const stride = weights.length;
  const attr = new Float32Array(nv * stride);
  for (let i = 0; i < nv; i++) {
    let o = i * stride;
    for (const [a, s] of extra) for (let c = 0; c < s; c++) attr[o++] = a.array[i * s + c];
  }
  const index = w.index.array;
  const groups = w.groups.length ? w.groups : [{ start: 0, count: index.length, materialIndex: 0 }];
  const parts = [];
  const outGroups = [];
  let start = 0;
  for (const gr of groups) {
    const sub = index.slice(gr.start, gr.start + gr.count);
    const target = Math.max(3, Math.floor((sub.length * ratio) / 3) * 3);
    let res;
    if (target >= sub.length) res = sub;
    else if (stride)
      res = MeshoptSimplifier.simplifyWithAttributes(
        sub,
        pos,
        3,
        attr,
        stride,
        weights,
        null,
        target,
        1,
        [],
      )[0];
    else res = MeshoptSimplifier.simplify(sub, pos, 3, target, 1, [])[0];
    parts.push(res);
    if (w.groups.length) outGroups.push({ start, count: res.length, materialIndex: gr.materialIndex });
    start += res.length;
  }
  const all = new Uint32Array(start);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return compact(w, all, outGroups);
}

// ---------- 匯出設定（存在這個瀏覽器）----------
