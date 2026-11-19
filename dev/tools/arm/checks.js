// 機械臂的檢查與匯出（AnyMachine 的第 4 步「Check」和第 10 步「Export and verify」）：
//   runCheck  ：每個參數單獨掃過整個範圍、整段示範動作、三個關節的所有組合，找出「靜止姿勢沒有、動起來才有」的互穿；
//               另外量油壓缸有沒有脫出或頂到底、參數超出範圍有沒有夾住、反向運動學的誤差。
//   exportGlb ：整台匯出成 GLB，每個參數一段 1 秒的線性動作（seek 到 t＝參數值就是那個姿勢）。
//   verifyGlb ：把匯出的 GLB 重新讀進來，數一數裡面有什麼，再用動作擺幾個姿勢，跟原本的模型比位置。
import * as THREE from 'three';
import { JOINTS } from './machine.js';

const SHRINK = 0.012;   // 碰撞盒各邊縮一點：貼著的不算互穿

function colliders(M) {
  const C = [];
  for (const p of M.parts) for (const c of p.cols) C.push({ part: p.name, bone: M.bones[p.bone], m: c.m, h: c.h.map((v) => Math.max(v - SHRINK, 0.002)), c: new THREE.Vector3(), u: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], W: new THREE.Matrix4() });
  return C;
}
function place(M, C) {
  M.pose(); M.root.updateMatrixWorld(true);
  for (const c of C) { c.W.multiplyMatrices(c.bone.matrixWorld, c.m); c.c.setFromMatrixPosition(c.W); c.W.extractBasis(c.u[0], c.u[1], c.u[2]); c.r = Math.hypot(c.h[0], c.h[1], c.h[2]); }
}
// 兩個有向包圍盒有沒有重疊（分離軸定理，15 條軸）
const _t = new THREE.Vector3();
function obbHit(a, b) {
  _t.subVectors(b.c, a.c); if (_t.length() > a.r + b.r) return false;
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], AR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], T = [_t.dot(a.u[0]), _t.dot(a.u[1]), _t.dot(a.u[2])];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { R[i][j] = a.u[i].dot(b.u[j]); AR[i][j] = Math.abs(R[i][j]) + 1e-6; }
  for (let i = 0; i < 3; i++) if (Math.abs(T[i]) > a.h[i] + b.h[0] * AR[i][0] + b.h[1] * AR[i][1] + b.h[2] * AR[i][2]) return false;
  for (let j = 0; j < 3; j++) if (Math.abs(T[0] * R[0][j] + T[1] * R[1][j] + T[2] * R[2][j]) > a.h[0] * AR[0][j] + a.h[1] * AR[1][j] + a.h[2] * AR[2][j] + b.h[j]) return false;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const i1 = (i + 1) % 3, i2 = (i + 2) % 3, j1 = (j + 1) % 3, j2 = (j + 2) % 3;
    if (Math.abs(T[i2] * R[i1][j] - T[i1] * R[i2][j]) > a.h[i1] * AR[i2][j] + a.h[i2] * AR[i1][j] + b.h[j1] * AR[i][j2] + b.h[j2] * AR[i][j1]) return false;
  }
  return true;
}
function hits(C, skip) {
  const out = [];
  for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) {
    if (C[i].bone === C[j].bone) continue; const k = i * 4096 + j;
    if (skip && skip.has(k)) continue; if (obbHit(C[i], C[j])) out.push(k);
  }
  return out;
}
const pairName = (C, k) => `${C[Math.floor(k / 4096)].part} × ${C[k % 4096].part}`;

// demo：{ T, apply(t) }＝示範動作（apply 只擺姿勢，不動場景裡別的東西）
export function runCheck(M, demo) {
  const keep = { ...M.ang }, C = colliders(M), t0 = performance.now();
  M.rest(); place(M, C); const base = new Set(hits(C));   // 靜止姿勢本來就碰在一起的（銷、叉與舌、缸筒裡的活塞桿）不算
  const R = { colliders: C.length, contacts_at_rest: base.size };

  // 1. 每個參數單獨掃
  R.sweeps = JOINTS.map((j) => {
    let n = 0, first = null; M.rest();
    for (let i = 0; i <= 60; i++) { M.setParam(j.key, i / 60); place(M, C); const h = hits(C, base); if (h.length) { n++; first = first || { value: +(i / 60).toFixed(3), pair: pairName(C, h[0]) }; } }
    return { joint: j.key, steps: 61, clashing: n, first };
  });

  // 2. 油壓缸：整個行程裡活塞桿留在缸筒裡的長度、活塞桿尾端離缸底的距離
  R.actuators = {};
  for (const [k, jk] of [['sh', 'sh'], ['el', 'el']]) {
    const A = M.act[k]; let inside = 1e9, bottom = 1e9, lo = 1e9, hi = 0; M.rest();
    for (let i = 0; i <= 60; i++) { M.setParam(jk, i / 60).pose(); inside = Math.min(inside, A.Lc + A.Lr - A.len); bottom = Math.min(bottom, A.len - A.Lr - 0.24); lo = Math.min(lo, A.len); hi = Math.max(hi, A.len); }
    R.actuators[k] = { stroke: [+lo.toFixed(3), +hi.toFixed(3)], rod_inside_min: +inside.toFixed(3), rod_to_bottom_min: +bottom.toFixed(3), ok: inside >= 0.1 && bottom >= 0 };
  }

  // 3. 超出範圍要夾住
  M.rest(); R.clamp = JOINTS.every((j) => M.setParam(j.key, 1.4).ang[j.key] === j.max && M.setParam(j.key, -0.3).ang[j.key] === j.min);

  // 4. 反向運動學：到得了的目標，工具中心點要真的在那裡
  { let err = 0, n = 0; const P = new THREE.Vector3(); M.rest();
    for (let i = 0; i < 400; i++) {
      const yaw = -160 + 320 * ((i * 0.618) % 1), r = 3 + 5 * ((i * 0.377) % 1), y = 0.5 + 5 * ((i * 0.791) % 1), phi = -90 + 60 * ((i * 0.533) % 1);
      if (!M.ikPolar(yaw, r, y, phi)) continue; M.pose(); M.tcp(P); n++;
      err = Math.max(err, Math.hypot(P.x - r * Math.cos(yaw * Math.PI / 180), P.y - y, P.z + r * Math.sin(yaw * Math.PI / 180)));
    }
    R.ik = { targets: 400, reachable: n, max_err_mm: +(err * 1000).toFixed(4) }; }

  // 5. 示範動作：互穿，加上有沒有撞到地板
  if (demo) {
    let n = 0, floor = 0, first = null; const N = 400;
    for (let i = 0; i < N; i++) {
      demo.apply(demo.T * i / N); place(M, C); const h = hits(C, base);
      let low = false; for (const c of C) if (c.bone !== M.bones.Root && c.c.y - c.h[0] * Math.abs(c.u[0].y) - c.h[1] * Math.abs(c.u[1].y) - c.h[2] * Math.abs(c.u[2].y) < 0) { low = true; first = first || { t: +(demo.T * i / N).toFixed(2), pair: c.part + ' × 地板' }; }
      if (h.length) { n++; first = first || { t: +(demo.T * i / N).toFixed(2), pair: pairName(C, h[0]) }; } if (low) floor++;
    }
    R.demo = { samples: N, clashing: n, floor, first };
  }

  // 6. 肩 × 肘 × 腕 的所有組合（參考用：關節各自獨立時，手折回來會碰到自己；實際動作要避開這些組合）
  { let n = 0; const cnt = {}, G = 12; M.rest();
    for (let a = 0; a <= G; a++) for (let b = 0; b <= G; b++) for (let c = 0; c <= G; c++) {
      M.setParam('sh', a / G).setParam('el', b / G).setParam('wr', c / G); place(M, C); const h = hits(C, base);
      if (h.length) { n++; for (const k of h) { const s = pairName(C, k); cnt[s] = (cnt[s] || 0) + 1; } }
    }
    R.grid = { poses: (G + 1) ** 3, clashing: n, top: Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([pair, count]) => ({ pair, count })) }; }

  R.pass = R.sweeps.every((s) => !s.clashing) && Object.values(R.actuators).every((a) => a.ok) && R.clamp && R.ik.max_err_mm < 0.01 && (!R.demo || (!R.demo.clashing && !R.demo.floor));
  R.ms = Math.round(performance.now() - t0);
  Object.assign(M.ang, keep); M.pose();
  return R;
}

// 碰撞盒的線框（除錯用）：掛在各自的骨頭上
export function colliderHelpers(M) {
  const g = [], mat = new THREE.LineBasicMaterial({ color: 0xffb020 });
  for (const p of M.parts) for (const c of p.cols) {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(c.h[0] * 2, c.h[1] * 2, c.h[2] * 2)), mat);
    l.matrixAutoUpdate = false; l.matrix.copy(c.m); l.userData.helper = true; M.bones[p.bone].add(l); g.push(l);
  }
  return g;
}

// ───── 匯出 ─────
const CLIP_NODES = { yaw: ['Yaw'], sh: ['Upper', 'Act_Sh_Cyl', 'Act_Sh_Rod'], el: ['Fore', 'Act_El_Cyl', 'Act_El_Rod'], wr: ['Wrist'], roll: ['Hand'], grip: ['Claw_A', 'Claw_B', 'Claw_C'] };
export function paramClips(M) {
  const keep = { ...M.ang }, N = 32, clips = [];
  for (const j of JOINTS) {
    const nodes = CLIP_NODES[j.key], times = [], vals = nodes.map(() => []); M.rest();
    for (let i = 0; i <= N; i++) { M.setParam(j.key, i / N).pose(); times.push(i / N); nodes.forEach((n, k) => { M.bones[n].updateMatrix(); vals[k].push(...M.bones[n].quaternion.toArray()); }); }
    clips.push(new THREE.AnimationClip(j.key + '_param', 1, nodes.map((n, k) => new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, vals[k]))));
  }
  Object.assign(M.ang, keep); M.pose();
  return clips;
}
export async function exportGlb(M) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const keep = { ...M.ang }; M.rest().pose();
  const buf = await new GLTFExporter().parseAsync(M.root, { binary: true, animations: paramClips(M) });
  Object.assign(M.ang, keep); M.pose();
  return buf;
}
export async function verifyGlb(M, buf) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const g = await new GLTFLoader().parseAsync(buf.slice(0), ''), keep = { ...M.ang };
  let meshes = 0, tris = 0, nodes = 0; g.scene.traverse((o) => { nodes++; if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  const mixer = new THREE.AnimationMixer(g.scene), acts = {};
  for (const c of g.animations) { const a = mixer.clipAction(c); a.play(); a.paused = true; acts[c.name] = a; }
  const names = Object.keys(M.bones), a = new THREE.Vector3(), b = new THREE.Vector3(); let err = 0;
  for (let i = 0; i < 24; i++) {
    for (const [k, j] of JOINTS.entries()) { const p = 0.03 + 0.94 * ((i * 0.618 + k * 0.37) % 1); M.setParam(j.key, p); acts[j.key + '_param'].time = p; }
    M.pose(); M.root.updateMatrixWorld(true); mixer.update(0); g.scene.updateMatrixWorld(true);
    for (const n of names) { const o = g.scene.getObjectByName(n); if (!o) { err = 1e9; continue; } a.setFromMatrixPosition(M.bones[n].matrixWorld); b.setFromMatrixPosition(o.matrixWorld); err = Math.max(err, a.distanceTo(b)); }
  }
  Object.assign(M.ang, keep); M.pose();
  const want = M.info();
  const found = want.parts.filter((p) => g.scene.getObjectByName(p.name)).length;   // 多種材質的零件讀進來會變成一個群組包幾個網格，所以用名字數
  const R = { bytes: buf.byteLength, nodes, parts: found, meshes, tris, clips: g.animations.map((c) => ({ name: c.name, duration: +c.duration.toFixed(3), tracks: c.tracks.length })), extras: !!(g.scene.children[0] && g.scene.children[0].userData.arm) || !!g.scene.userData.arm, poses: 24, max_bone_err_mm: +(err * 1000).toFixed(4) };
  R.pass = R.clips.length === JOINTS.length && R.max_bone_err_mm < 0.5 && R.parts === want.parts.length && R.tris === want.tris;
  return R;
}
