// ═══════════════════════ 巨型結構倒塌：切成碎塊、依種類挑倒法（只是畫面）═══════════════════════
// 被摧毀的巨型結構（含自訂的 GLB 建築）在倒下的那一刻切成好幾塊（依三角形中心分格，共用原本的頂點資料，只新建索引），
//   每塊各自動：鉸鏈倒下、往下壓垮、被炸飛、側向推倒…… 全部用 Math.random，不碰模擬（回放時細節可能不同）
// 參考真實的倒塌方式：
//   高樓 tall    topple   整棟從底部倒下；細長的常在半空中折斷（上段轉得慢、跟下段分開），落地時摔成好幾截
//                pancake  上層壓垮下層、一層接一層往下（塵土從每一層往外噴、外牆一片片剝落），最後塌進自己的地基、只剩幾片殘牆
//                tiltdrop 被打的那一層斷掉，上段先往一邊傾斜，再往下壓垮整棟
//                behead   上段被打斷、傾斜後滑落到旁邊；下半截燒著站著
//                lean     低樓層被壓垮（軟弱層），整棟往下坐、歪一邊；有時撐一陣子後整棟倒下
//                implode  底部撐不住，整棟往下沉進自己的塵土裡（像爆破拆除）
//   鋼架 steel   rack     柱子往同一方向歪倒，一排排像骨牌一樣壓平（平行四邊形）
//                sag      火燒軟化：屋頂中間往下凹、牆被拉向內，撐不住時整個塌下
//                gutted   外殼一塊塊燒落、掉下來，只剩焦黑發紅的骨架站著
//   武器 weapon  cookoff  彈藥殉爆：一陣內部爆炸、砲塔頭被炸飛翻滾落地，底座像火炬一樣噴火
//                shatter  連環爆炸往上竄，整座炸成碎塊四散
//                meltdown 能源核心過載：整座燒紅、慢慢軟塌，閃光之後熔成一攤發紅的殘骸
//                behead   砲管／上段被打斷，先垂下再掉落
//   穹頂 dome    cavein   頂部先塌進去，四周的殼往內倒，剩一圈破邊
//                burst    能量外洩，殼板往外炸飛
//   長牆 wall    breach   打中的那一段崩開倒下，兩旁的歪斜
//   一般 low     partial  被打的那一側塌掉，另一半還站著（露出斷面）
//                crumble  由上往下一塊塊塌成一堆
//   軌道電梯：照舊往下沉
// 建築種類（建築編輯器）可以指定 fall＝種類或倒法的名字；沒有就依名稱與形狀判斷
const CL_G = 9;   // 碎塊的重力（單位／秒²；1 單位＝200 公尺，比真實的快很多，不然要倒好幾分鐘）
const CL_MODES = {
  tall: { topple: 3, pancake: 3, tiltdrop: 2, behead: 2, lean: 2, implode: 1.5 },
  steel: { rack: 3, sag: 3, gutted: 2 },
  weapon: { cookoff: 3, shatter: 2.5, meltdown: 2, behead: 1.5 },
  dome: { cavein: 3, burst: 2 },
  wall: { breach: 1 },
  low: { partial: 3, crumble: 3, pancake: 1.2, gutted: 1 },
};
const CL_KIND_NAME = { auto: '自動', tall: '高樓', steel: '鋼架', weapon: '武器', dome: '穹頂', wall: '長牆', low: '矮胖' };
const CL = { force: null };   // 除錯：指定下一次的倒法
const _clV = new THREE.Vector3(), _clV2 = new THREE.Vector3(), _clQ = new THREE.Quaternion(), _clM = new THREE.Matrix4();
const clR = (a, b) => a + Math.random() * (b - a);
const clSS = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function clPick(w) { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) if ((r -= w[k]) <= 0) return k; return Object.keys(w)[0]; }
GV.msFx = [];

// ───── 種類、倒法 ─────
function clKind(M, bb) {
  const n = M.name || '', h = bb.max.y, ex = bb.max.x - bb.min.x, ez = bb.max.z - bb.min.z, w = Math.max(ex, ez), d = Math.min(ex, ez);
  if (/砲|炮/.test(n)) return 'weapon';
  if (/護盾|穹頂/.test(n)) return 'dome';
  if (/堤|城牆|圍牆/.test(n) || (w > d * 4 && h < w * 0.5)) return 'wall';
  if (/船塢|龍門|機庫|廠房|倉庫|鋼架/.test(n)) return 'steel';
  return h > w * 1.5 ? 'tall' : 'low';
}
function clMode(M, bb, fh) {
  const f = CL.force || M.fall;
  if (f && !CL_MODES[f] && Object.values(CL_MODES).some((m) => m[f])) return f;
  const kind = CL_MODES[f] ? f : clKind(M, bb), w = { ...CL_MODES[kind] };
  if (kind === 'tall') {   // 打在高處：上段斷掉的多；打在低處：整棟倒、歪斜、往下沉的多
    if (fh > 0.55) { w.behead *= 2; w.tiltdrop *= 2; w.topple *= 0.5; w.lean *= 0.3; w.implode *= 0.5; }
    else if (fh < 0.3) { w.topple *= 1.5; w.lean *= 1.6; w.implode *= 1.5; w.behead *= 0.3; w.tiltdrop *= 0.5; }
  }
  return clPick(w);
}

// ───── 燒焦：材質換成這棟自己的副本，幾秒內慢慢變黑、燈熄掉；uHeat＝燒紅的餘燼 ─────
function clBurnMats(o, F) {
  const done = new Map(), ok = (m) => m && m.uniforms;
  const swap = (m) => {
    let n = done.get(m); if (n) return n;
    n = m.clone(); n.uniforms = { ...m.uniforms };
    const e = { n, dim: m.uniforms.uDim ? m.uniforms.uDim.value : null, lum: m.uniforms.uLum ? m.uniforms.uLum.value : null, em: m.uniforms.uEmC ? m.uniforms.uEmC.value.clone() : null };
    for (const k of ['uDim', 'uLum', 'uChar', 'uHeat']) if (m.uniforms[k]) n.uniforms[k] = { value: m.uniforms[k].value };
    if (e.em) n.uniforms.uEmC = { value: e.em.clone() };
    done.set(m, n); GV.mats.push(n); F.mats.push(e); return n;
  };
  o.traverse((c) => {
    if (!c.isMesh || !c.material) return;
    if (Array.isArray(c.material)) { if (!c.material.some(ok)) return; F.keep.push([c, c.material]); c.material = c.material.map((m) => (ok(m) ? swap(m) : m)); }
    else if (ok(c.material)) { F.keep.push([c, c.material]); c.material = swap(c.material); }
  });
}
function clBurnFrame(F, t) {
  const age = t - F.t0, b = clSS(0, F.burnT || 4, age), heat = Math.max(F.heat, 0.45 * clSS(0.3, 2, age) * Math.max(0, 1 - (age - 3) / 25));
  for (const e of F.mats) {
    const u = e.n.uniforms;
    if (e.dim != null) u.uDim.value = e.dim * (1 - 0.68 * b);
    if (e.lum != null) u.uLum.value = e.lum * (1 - 0.68 * b);
    if (u.uChar) u.uChar.value = b;
    if (e.em) u.uEmC.value.copy(e.em).multiplyScalar(Math.max(0, 1 - age * 1.5) * (Math.random() < 0.3 ? 0.2 : 1));   // 燈閃幾下熄掉
    if (u.uHeat) u.uHeat.value = heat;
  }
}

// ───── 切塊：cell(x, y, z)（W 座標的三角形中心）→ 格子編號；base＝支點在塊的底部（否則在中心）─────
// W＝取代原本群組的新群組（原點＝底部中心，地面 y＝0）；每塊＝W 底下的一個群組
function clFracture(F, cell, base = false) {
  const g = F.g, W = F.W; g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), C = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), geo = o.geometry, P = geo.attributes.position, I = geo.index;
    const nT = Math.floor((I ? I.count : P.count) / 3), mats = Array.isArray(o.material) ? o.material : null, grs = mats && geo.groups.length ? geo.groups : null;
    const parts = new Map();
    for (let k = 0; k < nT; k++) {
      const i0 = I ? I.getX(k * 3) : k * 3, i1 = I ? I.getX(k * 3 + 1) : k * 3 + 1, i2 = I ? I.getX(k * 3 + 2) : k * 3 + 2;
      a.fromBufferAttribute(P, i0).applyMatrix4(rel); b.fromBufferAttribute(P, i1).applyMatrix4(rel); c.fromBufferAttribute(P, i2).applyMatrix4(rel);
      const id = cell((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
      let mi = 0; if (grs) { for (let q = 0; q < grs.length; q++) if (k * 3 >= grs[q].start && k * 3 < grs[q].start + grs[q].count) { mi = grs[q].materialIndex; break; } }
      let ch = C.get(id); if (!ch) C.set(id, (ch = { id, lo: new THREE.Vector3(1e9, 1e9, 1e9), hi: new THREE.Vector3(-1e9, -1e9, -1e9), parts: [] }));
      ch.lo.min(a).min(b).min(c); ch.hi.max(a).max(b).max(c);
      const pk = id * 64 + mi; let p = parts.get(pk); if (!p) { parts.set(pk, (p = { ch, mi, idx: [] })); ch.parts.push({ o, rel, mat: mats ? mats[mi] : o.material, p }); }
      p.idx.push(i0, i1, i2);
    }
    if (!geo.boundingSphere) geo.computeBoundingSphere();
  });
  const out = [];
  for (const ch of C.values()) {
    const cx = (ch.lo.x + ch.hi.x) / 2, cz = (ch.lo.z + ch.hi.z) / 2, cy = base ? ch.lo.y : (ch.lo.y + ch.hi.y) / 2;
    const grp = new THREE.Group(); grp.position.set(cx, cy, cz); W.add(grp);
    const off = new THREE.Matrix4().makeTranslation(-cx, -cy, -cz);
    for (const { o, rel, mat, p } of ch.parts) {
      const sg = new THREE.BufferGeometry();
      for (const k in o.geometry.attributes) sg.setAttribute(k, o.geometry.attributes[k]);
      sg.setIndex(p.idx); sg.boundingSphere = o.geometry.boundingSphere; sg.boundingBox = o.geometry.boundingBox;
      const m = new THREE.Mesh(sg, mat); m.matrixAutoUpdate = false; m.matrix.multiplyMatrices(off, rel); grp.add(m);
    }
    const cn = []; for (let k = 0; k < 8; k++) cn.push(new THREE.Vector3(k & 1 ? ch.hi.x : ch.lo.x, k & 2 ? ch.hi.y : ch.lo.y, k & 4 ? ch.hi.z : ch.lo.z).sub(grp.position));
    out.push({ id: ch.id, grp, lo: ch.lo, hi: ch.hi, c: grp.position.clone(), cn, size: ch.hi.clone().sub(ch.lo).length() / 2, m: null, body: null });
  }
  g.visible = false;
  F.chunks = out;
  return out;
}
// 塊（或剛體）最低的一角（W 座標）
function clLow(list, out) {
  let lo = 1e9;
  for (const c of list) { c.grp.updateMatrixWorld(true); for (const k of c.cn) { _clV.copy(k).applyMatrix4(c.grp.matrixWorld); if (_clV.y < lo) { lo = _clV.y; out && out.copy(_clV); } } }
  return lo - GROUND_Y;
}

// ───── 單塊的動作：m＝{ at 開始時間, K 轉軸, th 角度, om 角速度, kap 角加速度（倒下）, end 最大角度,
//        fall 有沒有往下掉, v 下落速度, floor 落到多高, sq 壓扁到多少, sp 攤開多少, out 水平漂移, fx 落地要不要揚塵 } ─────
function clMove(c, t, o) {
  c.m = { at: t, K: new THREE.Vector3(1, 0, 0), th: 0, om: 0, kap: 0, end: 9, fall: false, v: 0, floor: 0, sq: 1, sp: 1, out: null, fx: true, ...o, q0: null, land: -1 };
  return c.m;
}
function clTipK(c, F, dir = 1) {   // 往外（dir＝1）或往中心（-1）倒的轉軸
  let x = c.c.x - F.cx, z = c.c.z - F.cz; const l = Math.hypot(x, z) || 1; if (l < 1e-3) { const a = Math.random() * TAU; x = Math.cos(a); z = Math.sin(a); }
  x = x / l * dir; z = z / l * dir;
  return new THREE.Vector3(z, 0, -x);
}
function clChunkStep(F, c, t, dt) {
  const m = c.m; if (!m || c.body || t < m.at) return;
  if (!m.q0) m.q0 = c.grp.quaternion.clone();
  if (m.om || m.kap) {
    m.om += m.kap * Math.sin(m.th + 0.04) * dt; m.th += m.om * dt;
    if (m.th >= m.end) { if (m.fx && m.kap && !m.fall) clChunkFx(F, c, t); m.th = m.end; m.om = 0; m.kap = 0; }   // 倒到底（只有倒、不掉的才在這裡揚塵）
    c.grp.quaternion.setFromAxisAngle(m.K, m.th).multiply(m.q0);
  }
  if (m.fall) {
    m.v += CL_G * dt; c.grp.position.y -= m.v * dt;
    if (m.out) c.grp.position.addScaledVector(m.out, dt);
    const low = clLow([c]);
    if (low <= m.floor) { c.grp.position.y += m.floor - low; m.fall = false; m.v = 0; m.out = null; if (m.land < 0) { m.land = t; if (m.fx) clChunkFx(F, c, t); } }
  }
  if (m.land >= 0 && !m.fall && (m.sq !== 1 || m.sp !== 1)) {   // 落地後壓扁、攤開，底部貼著落點
    const k = clSS(0, 0.4, t - m.land);
    c.grp.scale.set(1 + (m.sp - 1) * k, 1 + (m.sq - 1) * k, 1 + (m.sp - 1) * k);
    if (k < 1) { const low = clLow([c]); c.grp.position.y += m.floor - low; }
  }
}
function clChunkFx(F, c, t) {
  if (F.fxN-- <= 0) return;
  const s = Math.max(0.8, c.size), x = c.grp.position.x, z = c.grp.position.z;
  clDust(F, x, 0.3, z, s * 1.1, 0, 0, 10);
  if (Math.random() < 0.5) clDeb(F, x, 0.6, z, 3, Math.max(0.5, s * 0.15), 0, 0);
}

// ───── 剛體（一群塊一起飛、轉，落地彈一下停住） ─────
function clBody(F, list, px, py, pz, v, w) {
  const B = new THREE.Group(); B.position.set(px, py, pz); F.W.add(B); B.updateMatrixWorld(true);
  let size = 0;
  for (const c of list) { B.attach(c.grp); c.body = B; c.m = null; size = Math.max(size, c.size, c.grp.position.length() + c.size * 0.5); }
  const o = { grp: B, list, v: v || new THREE.Vector3(), w: w || new THREE.Vector3(), on: true, hits: 0, size, hinge: null };
  F.bodies.push(o); return o;
}
// 剛體掛在鉸鏈上：繞 K 轉，角加速度 kap·sin(θ)，轉到 end 落地
function clHinge(o, K, kap, end, om = 0.05, th = 0) { o.hinge = { K, kap, end, om, th, land: -1 }; o.grp.quaternion.setFromAxisAngle(K, th); return o.hinge; }
function clBodyStep(F, o, t, dt) {
  if (!o.on) return;
  const H = o.hinge;
  if (H) {
    if (H.land >= 0) return;
    H.om += H.kap * Math.sin(H.th + 0.03) * dt; H.th += H.om * dt;
    if (H.th >= H.end) { H.th = H.end; H.land = t; }
    o.grp.quaternion.setFromAxisAngle(H.K, H.th);
    return;
  }
  o.v.y -= CL_G * dt; o.grp.position.addScaledVector(o.v, dt);
  const wl = o.w.length(); if (wl > 1e-5) { _clQ.setFromAxisAngle(_clV2.copy(o.w).divideScalar(wl), wl * dt); o.grp.quaternion.premultiply(_clQ); }
  const P = new THREE.Vector3(), low = clLow(o.list, P), emb = -o.size * 0.06;
  if (low < emb) {
    o.grp.position.y += emb - low;
    const vy = -o.v.y;
    if (vy > 2.5 && o.hits++ < 3) clImpact(F, P.x - F.W.position.x, P.z - F.W.position.z, o.size, vy, t);
    o.v.y = vy * 0.2; o.v.x *= 0.45; o.v.z *= 0.45; o.w.multiplyScalar(0.35);
    if (o.v.lengthSq() < 2) o.on = false;
  }
}
// 剛體砸到地上：爆炸、塵土、碎塊、焦痕，壓垮落點附近的建築
function clImpact(F, x, z, size, vy, t) {
  const s = Math.max(1, size), k = Math.min(1, vy / 12);
  clBoom(F, x, s * 0.3, z, 3 + s * 0.35 * k);
  for (let p = 0; p < 4; p++) { const a = Math.random() * TAU; clDust(F, x + Math.cos(a) * s * 0.4, 0.3, z + Math.sin(a) * s * 0.4, s * 0.9, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 12); }
  clDeb(F, x, 1, z, 6, Math.max(0.6, s * 0.12), 0, 0);
  groundScar(F.ox + x, GROUND_Y, F.oz + z, s * 0.8);
  clCrushAt(F, x, z, s * 0.9 + 2, t, 0.3);
}

// ───── 畫面效果（座標都是 W 座標）─────
function clBoom(F, x, y, z, s) { spawnFx(F.ox + x, GROUND_Y + y, F.oz + z, F.side, s, 16 + Math.random() * 8); }
function clDust(F, x, y, z, s, vx, vz, life = 12) { smokePuff(F.ox + x, GROUND_Y + y, F.oz + z, U.uTime.value, life + Math.random() * 6, s * 0.35, s * (1.4 + Math.random() * 0.6), 0.6, WIND[0] * 0.4 + vx, WIND[1] * 0.4 + vz, 1.15); }
function clFire(F, x, y, z, s, rise = 1.5) { smokePuff(F.ox + x, GROUND_Y + y, F.oz + z, U.uTime.value, 1.6 + Math.random() * 1.6, s * 0.4, s * (0.9 + Math.random() * 0.5), rise, WIND[0] * 0.3, WIND[1] * 0.3, 2); }
function clSmoke(F, x, y, z, s) { smokePuff(F.ox + x, GROUND_Y + y, F.oz + z, U.uTime.value, 14 + Math.random() * 8, s * 0.5, s * 2.2, 1.6, WIND[0] * 0.8, WIND[1] * 0.8, 0.7); }
function clDeb(F, x, y, z, n, size, dx, dz) { msDebris(F.ox + x, GROUND_Y + y, F.oz + z, n, size, dx, dz, U.uTime.value); }
// 持續的火、煙（被打斷的塔頂、噴火的砲座）：{ x, y, z, s, t1 結束時間, fire 火的比例 }
function clEmit(F, x, y, z, s, dur, fire = 0.6) { F.em.push({ x, y, z, s, t1: U.uTime.value + dur, fire, next: 0 }); }
function clEmitStep(F, t) {
  for (const e of F.em) {
    if (t > e.t1 || t < e.next) continue;
    e.next = t + 0.12 + Math.random() * 0.12;
    const j = () => (Math.random() - 0.5) * e.s;
    if (Math.random() < e.fire) clFire(F, e.x + j(), e.y, e.z + j(), e.s, 1.5 + e.s * 0.2); else clSmoke(F, e.x + j(), e.y, e.z + j(), e.s);
  }
}
// 壓垮一般建築：(x, z) 半徑 R 內，t0 起 spread 秒內陸續倒（往外倒）
function clCrushAt(F, x, z, R, t0, spread) {
  if (typeof groundBldEach !== 'function') return;
  const wx = F.ox + x, wz = F.oz + z, B = GV.bld, Q = GV.bldQ || (GV.bldQ = []);
  if (!B || Q.length > 1500) return;
  groundBldEach(wx, wz, R, -1e9, 1e9, (j) => Q.push({ i: j, t: t0 + Math.random() * spread, a: Math.atan2(B.iA[j * 4 + 1] - wz, B.iA[j * 4] - wx) + (Math.random() - 0.5) * 0.6, depth: BLD_CHAIN_MAX, x: wx, z: wz }));
}
// 底部一圈塵土往外湧（像火山碎屑流）
function clSurge(F, R, n, s, sp) {
  for (let k = 0; k < n; k++) { const a = Math.random() * TAU, rr = R * (0.7 + Math.random() * 0.5); clDust(F, F.cx + Math.cos(a) * rr, 0.4, F.cz + Math.sin(a) * rr, s, Math.cos(a) * sp, Math.sin(a) * sp, 16); }
}

// ═════ 入口：groundMsKill 呼叫 ═════
function groundMsCollapse(M, side, sx, sz, sy = null) {
  const g = GV.ms && GV.ms[M.id]; if (!g) return;
  const t = U.uTime.value, top = M.top - GROUND_Y;
  if (top > 300) { GV.msFx[M.id] = { kind: 'sink', t0: t, g }; return; }   // 軌道電梯：照舊
  const bb = new THREE.Box3().setFromObject(g); bb.min.sub(g.position); bb.max.sub(g.position);
  if (bb.isEmpty() || bb.max.y < 0.5) bb.set(new THREE.Vector3(-M.r, 0, -M.r), new THREE.Vector3(M.r, Math.max(1, top), M.r));   // 模型還沒載入
  bb.min.y = Math.max(0, bb.min.y);
  const h = Math.max(1, bb.max.y), cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, ex = (bb.max.x - bb.min.x) / 2, ez = (bb.max.z - bb.min.z) / 2;
  // 倒向：離開打擊點（加一點亂數）；沒有打擊點就隨機
  let a = sx != null && Math.hypot(M.x - sx, M.z - sz) > 1 ? Math.atan2(M.z - sz, M.x - sx) : Math.random() * TAU;
  a += (Math.random() - 0.5) * 0.7;
  const fh = sy != null ? Math.max(0, Math.min(1, (sy - GROUND_Y) / h)) : Math.random();
  const W = new THREE.Group(); W.position.copy(g.position); g.parent.add(W);
  const F = { t0: t, last: t, g, W, M, side, bb, h, cx, cz, ex, ez, rr: Math.max(ex, ez), r: Math.max(1, M.r), a, dx: Math.cos(a), dz: Math.sin(a), fh,
    ox: g.position.x, oz: g.position.z, hit: sx != null ? { x: sx - g.position.x, z: sz - g.position.z } : null, keep: [], mats: [], chunks: [], bodies: [], em: [], heat: 0, fxN: 40, ev: [], done: false };
  F.mode = clMode(M, bb, fh); F.kind = 'cl';
  clBurnMats(g, F);
  (CL_INIT[F.mode] || CL_INIT.crumble)(F, t);
  GV.msFx[M.id] = F;
}
// 排程：t 秒時做 f（倒塌過程的分段）
function clAt(F, t, f) { F.ev.push({ t, f }); }
// 每幀
function msCollapseFrame(M, F, t) {
  if (F.kind !== 'cl') return;
  const dt = Math.max(0, Math.min(0.1, t - F.last)); F.last = t;
  if (dt <= 0) return;
  for (let k = F.ev.length - 1; k >= 0; k--) if (t >= F.ev[k].t) { const e = F.ev[k]; F.ev.splice(k, 1); e.f(t); }
  if (F.step) F.step(F, t, dt);
  for (const o of F.bodies) clBodyStep(F, o, t, dt);
  for (const c of F.chunks) clChunkStep(F, c, t, dt);
  clEmitStep(F, t);
  clBurnFrame(F, t);
}
// 新的一場：倒下的巨型結構恢復原狀
function msCollapseRestore() {
  for (const [id, F] of (GV.msFx || []).entries()) {
    if (!F) continue;
    for (const [c, m] of F.keep || []) c.material = m;
    if (F.W) {
      F.W.traverse((o) => { if (o.isMesh) { for (const k of Object.keys(o.geometry.attributes)) o.geometry.deleteAttribute(k); o.geometry.dispose(); } });   // 頂點資料是共用的，只丟索引
      if (F.W.parent) F.W.parent.remove(F.W);
    }
    F.g.visible = true; F.g.scale.set(1, 1, 1);
    GV.msFx[id] = null;
  }
  GV.msFx = [];
}
// 碎塊：從 (x, y, z)（世界座標）往外噴（dx, dz＝主要方向，0＝四散）
function msDebris(x, y, z, n, size, dx, dz, t) {
  if (typeof debOn !== 'function' || !debOn()) return;
  n = Math.max(1, Math.round(n * debMul()));
  for (let k = 0; k < n; k++) {
    const a = Math.random() * TAU, s = 2 + Math.random() * 6, v = 0.5 + Math.random() * 0.4;
    debPiece(x + (Math.random() - 0.5) * size * 3, y, z + (Math.random() - 0.5) * size * 3, Math.cos(a) * s + dx * 4, 3 + Math.random() * 7, Math.sin(a) * s + dz * 4, t,
      size * (0.4 + Math.random() * 0.9), [0.3 * v, 0.29 * v, 0.28 * v], 400, true, Math.random() < 0.3 ? 1 : 0, Math.random() < 0.5);
  }
}

// ═════ 各種倒法 ═════
// 分層：n 層（第 0 層最底），q＝每層再切成四等分
const clBand = (F, y, n) => Math.max(0, Math.min(n - 1, Math.floor(y / F.h * n)));
const clQuad = (F, x, z) => (x > F.cx ? 1 : 0) + (z > F.cz ? 2 : 0);
// 沿著倒向那一側底邊的支點；e＝外框在倒向上的半寬
function clEdge(F, dx, dz) { return Math.abs(dx) * F.ex + Math.abs(dz) * F.ez; }
// 倒下時掃過的一般建築：在塔身碰到它頂端的角度壓垮；兩側的被落地的衝擊波推倒
function clPathPlan(F, px, pz, py, L, body, dx, dz) {
  const B = GV.bld, out = []; if (!B || GV.key !== GRD.key) return out;
  const wx = F.ox + px, wz = F.oz + pz, seen = new Set(), shock = body * 1.8 + 4;
  for (let s = -F.rr; s <= L + F.rr * 0.5; s += 5) for (let o = -shock - 3; o <= shock + 3; o += 5) {
    const L2 = B.idx.get(Math.floor((wx + dx * s - dz * o) / 10) * 4099 + Math.floor((wz + dz * s + dx * o) / 10)); if (!L2) continue;
    for (const j of L2) {
      if (seen.has(j) || B.ic.array[j * 4 + 1] >= 0 || B.iB[j * 4] <= 0) continue; seen.add(j);
      const qx = B.iA[j * 4] - wx, qz = B.iA[j * 4 + 1] - wz, al = qx * dx + qz * dz, cr = qx * dz - qz * dx, pe = Math.abs(cr);
      if (al > L + F.rr * 0.5 || al < -F.rr) continue;
      if (pe <= body * (0.85 + 0.3 * Math.random())) out.push({ j, th: Math.min(1.45, Math.atan2(Math.max(0.5, al), B.ic.array[j * 4 + 2] + B.iB[j * 4] - GROUND_Y - py + 0.5)), a: Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.8, al });
      else if (pe <= shock && Math.random() < 1.15 - (pe - body) / (shock - body)) out.push({ j, th: 9, a: Math.atan2(cr > 0 ? -dx : dx, cr > 0 ? dz : -dz) + (Math.random() - 0.5) * 0.6, al, pe: pe - body });
    }
  }
  return out.sort((p, q) => p.th - q.th);
}
function clPathStep(F, list, th, t, landed, maxAl = 1e9) {
  const B = GV.bld, Q = GV.bldQ || (GV.bldQ = []);
  while (list.length && (list[0].th <= th || (landed && list[0].th < 9))) {
    const p = list.shift(); if (p.al > maxAl) continue;
    Q.push({ i: p.j, t, a: p.a, depth: BLD_CHAIN_MAX, x: B.iA[p.j * 4] - Math.cos(p.a) * 3, z: B.iA[p.j * 4 + 1] - Math.sin(p.a) * 3 });
  }
  if (landed) for (const p of list.splice(0)) if (p.th >= 9) Q.push({ i: p.j, t: t + p.pe / 25 + Math.random() * 0.3, a: p.a, depth: BLD_CHAIN_MAX, x: B.iA[p.j * 4] - Math.cos(p.a) * 5, z: B.iA[p.j * 4 + 1] - Math.sin(p.a) * 5 });
}
// 鉸鏈倒下的塔身落地：沿著長度爆炸、一長排塵土，摔成好幾截
function clLogLand(F, o, t) {
  const L = o.len, P = o.grp.position, n = Math.max(5, Math.round(L / 6));
  for (let m = 0; m < n; m++) {
    const s = L * (m + 0.5) / n, x = P.x + o.dx * s, z = P.z + o.dz * s, side = (Math.random() - 0.5) * F.rr * 1.6, ox = x - o.dz * side, oz = z + o.dx * side;
    if (m % 2 === 0) clBoom(F, ox, Math.random() * F.rr * 0.6, oz, 4 + Math.random() * 6);
    for (let p = 0; p < 2; p++) clDust(F, ox, 0.5, oz, F.rr * 1.1, -o.dz * (p ? 1 : -1) * 1.8, o.dx * (p ? 1 : -1) * 1.8, 14);
    clDeb(F, ox, 1, oz, 4, Math.max(0.7, F.rr * 0.1), -o.dz * (Math.random() < 0.5 ? 1 : -1), o.dx * (Math.random() < 0.5 ? 1 : -1));
    groundScar(F.ox + ox, GROUND_Y, F.oz + oz, F.rr * 0.5);
  }
  for (const s of [0.25, 0.6, 0.9]) groundPlume(F.ox + P.x + o.dx * L * s, F.oz + P.z + o.dz * L * s, t, 200, Math.max(10, F.rr * 1.1), 1.1);
  // 摔斷：每一截各自往下垮一點、扭一下
  for (const c of o.list.slice()) {
    F.W.attach(c.grp); c.body = null;
    const K = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    clMove(c, t + Math.random() * 0.25, { fall: true, floor: -c.size * 0.12, K, om: clR(-0.25, 0.25), end: 0.12, fx: false });
  }
  o.on = false;
}

const CL_INIT = {
  // ── 整棟倒下（細長的在半空中折斷）──
  topple(F, t, o0 = {}) {
    const n = Math.max(5, Math.min(9, Math.round(F.h / (F.rr * 0.9)))), yS = F.h * clR(0.06, 0.12);
    const ch = clFracture(F, (x, y) => (y < yS ? 0 : 1 + clBand(F, y - yS, n) ));
    const stump = ch.filter((c) => c.id === 0), body = ch.filter((c) => c.id > 0);
    for (const c of stump) clMove(c, t + 0.3, { K: clTipK(c, F), om: 0.04, end: clR(0.02, 0.08), fx: false });
    const e = clEdge(F, F.dx, F.dz), px = F.cx + F.dx * e, pz = F.cz + F.dz * e, L = F.h - yS;
    const o = clBody(F, body, px, yS, pz); o.dx = F.dx; o.dz = F.dz; o.len = L;
    const T = 2.4 + Math.sqrt(F.h) * 0.42, kap = 22 / (T * T), K = new THREE.Vector3(F.dz, 0, -F.dx);
    const end = Math.PI / 2 + Math.atan2(yS, L) * 0.9;
    clHinge(o, K, kap, end, o0.om || 0.06 * Math.sqrt(kap), o0.th || 0);
    F.path = clPathPlan(F, px, pz, yS, L * Math.sin(1.45), F.rr * 1.3 + 1.5, F.dx, F.dz);
    clBoom(F, px, yS, pz, 6); clDeb(F, px, yS, pz, 10, Math.max(0.7, F.rr * 0.1), F.dx, F.dz);
    for (let k = 0; k < 6; k++) clBoom(F, F.cx + clR(-1, 1) * F.ex, yS + Math.random() * 3, F.cz + clR(-1, 1) * F.ez, 3 + Math.random() * 3);
    // 細長的：轉到一半折斷（上段轉得慢，跟下段分開飛出去）
    const brk = o0.brk != null ? o0.brk : F.h > F.rr * 3 && Math.random() < 0.6;
    if (brk) {
      const kb = Math.round(n * clR(0.35, 0.65)), thb = clR(0.3, 0.75);
      F.brk = { kb, thb };
    }
    F.top = o; F.topT = t;
    clEmit(F, F.cx, yS, F.cz, F.rr * 0.8, 25, 0.5);
    F.step = (F, t, dt) => {
      const H = o.hinge; if (!H) return;
      if (F.brk && H.land < 0 && H.th >= F.brk.thb) {   // 折斷
        const up = o.list.filter((c) => c.id - 1 >= F.brk.kb);
        if (up.length && up.length < o.list.length) {
          o.list = o.list.filter((c) => c.id - 1 < F.brk.kb); o.len = L * F.brk.kb / n;
          H.kap *= n / F.brk.kb;
          const bp = new THREE.Vector3(); o.grp.updateMatrixWorld(true);
          bp.set(0, L * F.brk.kb / n, 0).applyMatrix4(o.grp.matrixWorld).sub(F.W.position);
          const wv = H.K.clone().multiplyScalar(H.om), r = bp.clone().sub(o.grp.position);
          const ub = clBody(F, up, bp.x, bp.y, bp.z, new THREE.Vector3().crossVectors(wv, r).add(new THREE.Vector3(F.dx, 0.2, F.dz).multiplyScalar(clR(0, 2))), wv.clone().multiplyScalar(clR(0.35, 1.3)));
          clBoom(F, bp.x, bp.y, bp.z, 6 + F.rr * 0.3); clDeb(F, bp.x, bp.y, bp.z, 12, Math.max(0.7, F.rr * 0.1), 0, 0);
          for (let k = 0; k < 4; k++) clDust(F, bp.x, bp.y, bp.z, F.rr * 0.8, clR(-2, 2), clR(-2, 2), 9);
          F.maxAl = o.len + F.rr; ub.len = 0;
        }
        F.brk = null;
      }
      clPathStep(F, F.path, H.th, t, H.land >= 0, F.maxAl);
      if (H.land >= 0 && o.on) clLogLand(F, o, t);
      if (H.land < 0 && t >= (F.nfx || 0)) {   // 倒下途中：折斷處、塔身零星爆炸、掉碎塊
        F.nfx = t + 0.15 + Math.random() * 0.2;
        const s = Math.random() * o.len, th = H.th, x = o.grp.position.x + F.dx * s * Math.sin(th), z = o.grp.position.z + F.dz * s * Math.sin(th), y = yS + s * Math.cos(th);
        clBoom(F, x, y, z, 2.5 + Math.random() * 3);
        if (Math.random() < 0.6) clDeb(F, x, y, z, 3, Math.max(0.6, F.rr * 0.08), F.dx, F.dz);
      }
    };
  },
  // ── 由上往下逐層壓垮（yF＝斷掉的那一層，tilt＝上段先傾斜）──
  pancake(F, t, o0 = {}) {
    const n = Math.max(7, Math.min(16, Math.round(F.h / Math.max(1, F.rr * 0.45)))), bh = F.h / n;
    const yF = o0.yF != null ? o0.yF : F.h * clR(0.55, 0.85), kF = clBand(F, yF, n);
    const ch = clFracture(F, (x, y, z) => clBand(F, y, n) * 4 + clQuad(F, x, z));
    const upper = ch.filter((c) => (c.id >> 2) >= kF), lower = ch.filter((c) => (c.id >> 2) < kF);
    const yb = kF * bh;
    // 上段：鉸鏈在斷掉那一層、倒向那一側的邊上（只先傾斜一點），之後整塊往下壓
    const e = clEdge(F, F.dx, F.dz), P = new THREE.Vector3(F.cx + F.dx * e, yb, F.cz + F.dz * e);
    const U = clBody(F, upper, P.x, P.y, P.z);
    const tilt = o0.tilt || 0, T1 = tilt ? clR(1.2, 2) : 0.5;
    U.on = false;   // 自己控制
    const S = { v: 0, drop: 0, pile: 0, tilt, T1, P, e, done: false, acc: CL_G * (o0.acc || clR(0.35, 0.55)) };
    for (const c of lower) if ((c.id >> 2) === 0 && Math.random() < 0.55) c.keep = true;   // 最底層留幾片殘牆
    for (let k = 0; k < 8; k++) clBoom(F, F.cx + clR(-1, 1) * F.ex, yb + Math.random() * bh, F.cz + clR(-1, 1) * F.ez, 3 + Math.random() * 4);
    clEmit(F, F.cx, yb, F.cz, F.rr * 0.7, T1 + 1, 0.8);
    const R0 = F.rr * 1.1 + 2;
    clCrushAt(F, F.cx, F.cz, R0 + F.rr * 0.6, t + T1 + 0.5, 4);
    const eat = (c, t, v) => {   // 被壓到的那一塊：碎成瓦礫落進堆裡；外牆有時往外剝落
      if (c.m) return;
      const out = new THREE.Vector3(c.c.x - F.cx, 0, c.c.z - F.cz); out.setLength(1);
      if (Math.random() < 0.28) {
        clMove(c, t, { fall: true, v, out: out.multiplyScalar(clR(3, 7)), K: clTipK(c, F), om: clR(0.5, 1.4), end: clR(1, 1.6), floor: 0, fx: true });
      } else {
        clMove(c, t, { fall: true, v, out: out.multiplyScalar(clR(0, 1.5)), K: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), om: clR(-0.5, 0.5), end: 0.4,
          floor: Math.random() * S.pile, sq: clR(0.12, 0.3), sp: clR(1.1, 1.5), fx: Math.random() < 0.3 });
      }
      S.pile = Math.min(F.h * 0.14, S.pile + bh * 0.04);
    };
    F.step = (F, t, dt) => {
      if (S.done) return;
      const age = t - F.t0;
      if (age < T1) {   // 上段傾斜
        if (tilt) U.grp.quaternion.setFromAxisAngle(new THREE.Vector3(F.dz, 0, -F.dx), tilt * clSS(0, T1, age));
        return;
      }
      S.v += S.acc * dt; S.drop += S.v * dt; U.grp.position.y = P.y - S.drop;
      if (tilt) U.grp.quaternion.setFromAxisAngle(new THREE.Vector3(F.dz, 0, -F.dx), tilt * (1 + S.drop / F.h * 0.6));
      const front = yb - S.drop;
      for (const c of lower) if (!c.keep && !c.m && c.hi.y > front + bh * 0.3) eat(c, t, S.v * 0.5);
      // 上段碰到瓦礫堆：從底部開始一層層壓碎
      for (const c of U.list.slice()) {
        const low = clLow([c]);
        if (low <= S.pile + bh * 0.2) { F.W.attach(c.grp); c.body = null; U.list.splice(U.list.indexOf(c), 1); eat(c, t, S.v * 0.6); }
      }
      if (t >= (S.nfx || 0)) {   // 壓垮的那一層：一圈塵土往外噴、碎塊
        S.nfx = t + 0.1;
        const y = Math.max(0.5, front), m = 5;
        for (let k = 0; k < m; k++) { const a = Math.random() * TAU; clDust(F, F.cx + Math.cos(a) * F.rr, y, F.cz + Math.sin(a) * F.rr, F.rr * 1.2, Math.cos(a) * 4, Math.sin(a) * 4, 12); }
        if (Math.random() < 0.5) clDeb(F, F.cx, y, F.cz, 4, Math.max(0.6, F.rr * 0.09), 0, 0);
        if (Math.random() < 0.35) clBoom(F, F.cx + clR(-1, 1) * F.ex, y, F.cz + clR(-1, 1) * F.ez, 2.5 + Math.random() * 3);
        clSurge(F, R0 + Math.min(F.rr * 2, S.drop * 0.4), 3, F.rr * 1.5, 3);
      }
      if (!U.list.length) {
        S.done = true;
        clSurge(F, R0, 18, F.rr * 2, 5);
        groundPlume(F.ox + F.cx, F.oz + F.cz, t, 260, Math.max(10, F.rr * 1.4), 1.4);
        groundScar(F.ox + F.cx, GROUND_Y, F.oz + F.cz, F.rr * 1.6);
        clEmit(F, F.cx, 1, F.cz, F.rr * 0.8, 30, 0.5);
      }
    };
  },
  tiltdrop(F, t) { CL_INIT.pancake(F, t, { yF: F.h * (F.fh > 0.35 ? Math.min(0.85, Math.max(0.45, F.fh)) : clR(0.5, 0.8)), tilt: clR(0.18, 0.4) }); },
  implode(F, t) { CL_INIT.pancake(F, t, { yF: F.h * clR(0.08, 0.2), acc: clR(0.6, 0.8) }); },
  // ── 上段被打斷：傾斜後滑落，下半截燒著站著 ──
  behead(F, t) {
    const n = 8, bh = F.h / n, yF = F.h * (F.fh > 0.3 ? Math.min(0.8, Math.max(0.4, F.fh)) : clR(0.45, 0.75)), kF = Math.max(2, clBand(F, yF, n)), yb = kF * bh;
    const ch = clFracture(F, (x, y, z) => clBand(F, y, n) * 4 + clQuad(F, x, z));
    const up = ch.filter((c) => (c.id >> 2) >= kF);
    const e = clEdge(F, F.dx, F.dz), P = new THREE.Vector3(F.cx + F.dx * e, yb, F.cz + F.dz * e);
    const U = clBody(F, up, P.x, P.y, P.z), K = new THREE.Vector3(F.dz, 0, -F.dx), L = F.h - yb;
    clHinge(U, K, 26 / (L + 8), clR(0.45, 0.8), 0.12);
    for (const c of ch) if ((c.id >> 2) === kF - 1 && Math.random() < 0.5) clMove(c, t + clR(0.2, 1.5), { fall: true, out: new THREE.Vector3(c.c.x - F.cx, 0, c.c.z - F.cz).setLength(clR(1, 4)), K: clTipK(c, F), om: clR(0.4, 1.2), end: 1.4, floor: 0 });   // 斷口的牆塊掉下去
    for (let k = 0; k < 8; k++) clBoom(F, F.cx + clR(-1, 1) * F.ex, yb + Math.random() * bh, F.cz + clR(-1, 1) * F.ez, 3 + Math.random() * 4);
    clDeb(F, P.x, yb, P.z, 12, Math.max(0.7, F.rr * 0.1), F.dx, F.dz);
    clEmit(F, F.cx, yb, F.cz, F.rr * 0.9, 40, 0.55);   // 斷口一直燒
    F.step = (F, t, dt) => {
      const H = U.hinge;
      if (H && H.land >= 0) {   // 傾斜到底：滑出去、往下掉
        U.grp.updateMatrixWorld(true);
        const wv = K.clone().multiplyScalar(H.om), c = new THREE.Vector3(0, L * 0.5, 0).applyQuaternion(U.grp.quaternion);
        U.v.crossVectors(wv, c).add(new THREE.Vector3(F.dx * clR(1.5, 3.5), 0, F.dz * clR(1.5, 3.5)));
        U.w.copy(wv).multiplyScalar(clR(0.6, 1.2)); U.hinge = null;
        clBoom(F, P.x, yb, P.z, 5);
      }
    };
  },
  // ── 低樓層壓垮：往下坐、歪一邊（之後可能整棟倒下）──
  lean(F, t) {
    const n = 8, bh = F.h / n, kf = Math.random() < 0.5 ? 1 : 2, yb = kf * bh;
    const ch = clFracture(F, (x, y, z) => clBand(F, y, n) * 4 + clQuad(F, x, z));
    const up = ch.filter((c) => (c.id >> 2) > kf), weak = ch.filter((c) => (c.id >> 2) === kf);
    const e = clEdge(F, F.dx, F.dz), P = new THREE.Vector3(F.cx + F.dx * e, yb + bh, F.cz + F.dz * e);
    const U = clBody(F, up, P.x, P.y, P.z), K = new THREE.Vector3(F.dz, 0, -F.dx), th1 = clR(0.06, 0.16), sit = bh * clR(0.55, 0.75), T1 = clR(1.2, 2);
    U.on = false;
    for (const c of weak) clMove(c, t + Math.random() * 0.4, { fall: true, floor: yb - bh * 0.05, sq: clR(0.2, 0.4), sp: clR(1.05, 1.25), fx: false });
    for (let k = 0; k < 10; k++) clBoom(F, F.cx + clR(-1, 1) * F.ex, yb + Math.random() * bh, F.cz + clR(-1, 1) * F.ez, 3 + Math.random() * 3);
    clEmit(F, F.cx, yb + bh * 0.5, F.cz, F.rr * 0.9, 35, 0.6);
    const later = Math.random() < 0.4 ? t + T1 + clR(2, 6) : 0;
    F.step = (F, t, dt) => {
      const k = clSS(0, T1, t - F.t0);
      U.grp.position.y = P.y - sit * k; U.grp.quaternion.setFromAxisAngle(K, th1 * k);
      if (t - F.t0 < T1 && t >= (F.nfx || 0)) { F.nfx = t + 0.12; for (let q = 0; q < 3; q++) { const a = Math.random() * TAU; clDust(F, F.cx + Math.cos(a) * F.rr, yb + bh * 0.3, F.cz + Math.sin(a) * F.rr, F.rr * 0.8, Math.cos(a) * 3.5, Math.sin(a) * 3.5, 10); } }
      if (later && t >= later && !U.hinge) {   // 撐不住了：整棟倒下
        U.on = true; clHinge(U, K, 22 / Math.pow(2.4 + Math.sqrt(F.h) * 0.42, 2) * 1.4, Math.PI / 2 + Math.atan2(U.grp.position.y, F.h - yb) * 0.9, 0.08, th1);
        U.dx = F.dx; U.dz = F.dz; U.len = F.h - yb - bh;
        F.path = clPathPlan(F, P.x, P.z, U.grp.position.y, U.len * Math.sin(1.45), F.rr * 1.3 + 1.5, F.dx, F.dz);
        clBoom(F, P.x, U.grp.position.y, P.z, 6);
      }
      if (U.hinge) { clPathStep(F, F.path, U.hinge.th, t, U.hinge.land >= 0); if (U.hinge.land >= 0 && U.on) clLogLand(F, U, t); }
    };
  },
  // ── 鋼架：柱子同向歪倒、一排排壓平（骨牌）──
  rack(F, t) {
    const ax = Math.abs(F.dx) > Math.abs(F.dz), sx = ax ? Math.sign(F.dx) : 0, sz = ax ? 0 : Math.sign(F.dz);   // 歪倒的方向（貼齊外框）
    const span = ax ? F.ez : F.ex, n = Math.max(3, Math.min(8, Math.round(span * 2 / 6)));
    const ch = clFracture(F, (x, y, z) => { const p = ax ? (z - F.bb.min.z) / (2 * F.ez) : (x - F.bb.min.x) / (2 * F.ex); return Math.max(0, Math.min(n - 1, Math.floor(p * n))); }, true);
    const first = Math.random() < 0.5 ? 0 : n - 1, end = clR(1.2, 1.42);
    for (const c of ch) {
      c.grp.matrixAutoUpdate = false; c.grp.updateMatrix();
      c.rk = { at: t + 0.4 + Math.abs(c.id - first) * clR(0.15, 0.35), ph: 0, om: 0.05, kap: 11 / Math.max(2, F.h), land: -1, tw: (Math.random() - 0.5) * 0.12 };
    }
    for (let k = 0; k < 8; k++) clBoom(F, F.cx + clR(-1, 1) * F.ex, Math.random() * F.h * 0.6, F.cz + clR(-1, 1) * F.ez, 2.5 + Math.random() * 3);
    clEmit(F, F.cx, 0.5, F.cz, F.rr * 0.6, 20, 0.6);
    F.step = (F, t, dt) => {
      for (const c of ch) {
        const r = c.rk; if (t < r.at || r.land >= 0) continue;
        r.om += r.kap * Math.sin(r.ph + 0.08) * dt; r.ph = Math.min(end, r.ph + r.om * dt);
        const s = Math.sin(r.ph), co = Math.cos(r.ph), tw = r.tw * r.ph;
        _clM.set(1, sx * s, 0, c.c.x, 0, co, 0, c.c.y, 0, sz * s, 1, c.c.z, 0, 0, 0, 1);
        c.grp.matrix.copy(_clM).multiply(new THREE.Matrix4().makeRotationY(tw)); c.grp.matrixWorldNeedsUpdate = true;
        if (r.ph >= end) {   // 壓平：沿著倒下的方向一排塵土、壓垮建築
          r.land = t;
          for (let q = 0; q < 4; q++) { const u = Math.random() * F.h * 0.9; clDust(F, c.c.x + sx * u + clR(-1, 1) * (ax ? 2 : 0), 0.4, c.c.z + sz * u + clR(-1, 1) * (ax ? 0 : 2), Math.max(2, F.h * 0.35), sx * 2, sz * 2, 12); }
          clDeb(F, c.c.x + sx * F.h * 0.5, 0.5, c.c.z + sz * F.h * 0.5, 4, Math.max(0.5, F.h * 0.04), sx, sz);
          clCrushAt(F, c.c.x + sx * (F.h * 0.5 + F.rr * 0.3), c.c.z + sz * (F.h * 0.5 + F.rr * 0.3), F.h * 0.6 + 2, t, 0.5);
        }
      }
    };
  },
  // ── 鋼架：屋頂火燒下凹、牆被拉向內，最後整個塌下 ──
  sag(F, t) {
    const nx = 4, ys = F.h * 0.55;
    const ch = clFracture(F, (x, y, z) => { const i = Math.max(0, Math.min(nx - 1, Math.floor((x - F.bb.min.x) / (2 * F.ex) * nx))), j = Math.max(0, Math.min(nx - 1, Math.floor((z - F.bb.min.z) / (2 * F.ez) * nx))); return (y > ys ? 100 : 0) + i * nx + j; }, true);
    const Ts = clR(3.5, 6), dm = F.h * clR(0.25, 0.4);
    for (const c of ch) { const rx = (c.c.x - F.cx) / Math.max(1, F.ex), rz = (c.c.z - F.cz) / Math.max(1, F.ez); c.rho = Math.min(1, Math.hypot(rx, rz) / 1.2); c.p0 = c.c.clone(); }
    F.heat = 0.4;
    clEmit(F, F.cx, F.h * 0.4, F.cz, F.rr * 0.7, Ts + 15, 0.85);
    for (let k = 0; k < 4; k++) clEmit(F, F.cx + clR(-0.7, 0.7) * F.ex, F.h * 0.3, F.cz + clR(-0.7, 0.7) * F.ez, F.rr * 0.35, Ts + 8, 0.9);
    clAt(F, t + Ts, (t) => {   // 撐不住：屋頂塌下、牆往內倒
      F.sagDone = true;
      for (const c of ch) {
        if (c.id >= 100) clMove(c, t + Math.random() * 0.5, { fall: true, floor: Math.random() * F.h * 0.06, K: clTipK(c, F, -1), om: clR(0.2, 0.6), end: 0.5, sq: clR(0.3, 0.6), sp: 1.1 });
        else if (c.rho > 0.55) clMove(c, t + 0.2 + Math.random() * 0.8, { K: clTipK(c, F, Math.random() < 0.7 ? -1 : 1), om: 0.05, kap: 6 / Math.max(2, F.h), end: clR(1.1, 1.45), fx: true });
        else clMove(c, t + Math.random() * 0.6, { fall: true, floor: 0, sq: clR(0.3, 0.5), sp: 1.15 });
      }
      for (let k = 0; k < 6; k++) clBoom(F, F.cx + clR(-1, 1) * F.ex, F.h * 0.3, F.cz + clR(-1, 1) * F.ez, 3 + Math.random() * 4);
      clSurge(F, F.rr * 1.1, 12, F.rr * 0.8, 4);
      clCrushAt(F, F.cx, F.cz, F.rr * 1.3 + 3, t, 2);
      groundPlume(F.ox + F.cx, F.oz + F.cz, t, 200, Math.max(8, F.rr * 1.2), 1.2);
      F.heat = 0.9;
    });
    F.step = (F, t, dt) => {
      if (F.sagDone) { F.heat = Math.max(0.3, F.heat - 0.05 * dt); return; }
      const k = clSS(0, Ts, t - F.t0), kk = k * k;
      F.heat = 0.4 + 0.8 * k;
      for (const c of ch) {
        if (c.id >= 100) { c.grp.position.y = c.p0.y - dm * (1 - c.rho * c.rho) * kk; c.grp.quaternion.setFromAxisAngle(clTipK(c, F, -1), 0.3 * c.rho * kk); }
        else if (c.rho > 0.55) c.grp.quaternion.setFromAxisAngle(clTipK(c, F, -1), 0.14 * kk);
      }
      if (t >= (F.nfx || 0)) { F.nfx = t + 0.4 + Math.random() * 0.4; clBoom(F, F.cx + clR(-0.8, 0.8) * F.ex, F.h * Math.random() * 0.8, F.cz + clR(-0.8, 0.8) * F.ez, 1.5 + Math.random() * 2); }
    };
  },
  // ── 外殼一塊塊燒落，只剩骨架 ──
  gutted(F, t) {
    const ny = Math.max(2, Math.min(5, Math.round(F.h / Math.max(2, F.rr * 0.5))));
    const ch = clFracture(F, (x, y, z) => { const i = Math.max(0, Math.min(3, Math.floor((x - F.bb.min.x) / (2 * F.ex) * 4))), j = Math.max(0, Math.min(3, Math.floor((z - F.bb.min.z) / (2 * F.ez) * 4))); return clBand(F, y, ny) * 16 + i * 4 + j; });
    const T = clR(5, 9);
    for (const c of ch) {
      const band = c.id >> 4, outer = Math.hypot((c.c.x - F.cx) / Math.max(1, F.ex), (c.c.z - F.cz) / Math.max(1, F.ez)) > 0.6;
      if (Math.random() < (outer ? 0.55 : 0.3) + band / ny * 0.2) {
        const out = new THREE.Vector3(c.c.x - F.cx, 0, c.c.z - F.cz).setLength(clR(0.5, 3));
        clMove(c, t + 0.3 + Math.random() * T, { fall: true, out, K: clTipK(c, F), om: clR(0.3, 1.5), end: clR(0.6, 1.6), floor: Math.random() * F.h * 0.05, sq: clR(0.4, 0.8), sp: 1.1 });
      } else if (Math.random() < 0.4) clMove(c, t + Math.random() * T, { K: clTipK(c, F, Math.random() < 0.5 ? 1 : -1), om: 0.05, kap: 0, end: 0.1 });
    }
    F.heat = 1; F.burnT = T * 0.6;
    for (let k = 0; k < 6; k++) clEmit(F, F.cx + clR(-0.8, 0.8) * F.ex, F.h * Math.random() * 0.7, F.cz + clR(-0.8, 0.8) * F.ez, Math.max(1, F.rr * 0.35), T + 10, 0.8);
    F.step = (F, t, dt) => { F.heat = Math.max(0.35, 1.2 - (t - F.t0) / (T * 2.5)); if (t >= (F.nfx || 0) && t - F.t0 < T) { F.nfx = t + 0.5 + Math.random() * 0.6; clBoom(F, F.cx + clR(-1, 1) * F.ex, F.h * Math.random(), F.cz + clR(-1, 1) * F.ez, 1.5 + Math.random() * 2.5); } };
  },
  // ── 武器：彈藥殉爆、砲塔頭被炸飛 ──
  cookoff(F, t) {
    const yh = F.h * (F.M.name === '行星防禦砲塔' ? 0.87 : clR(0.55, 0.7));
    const ch = clFracture(F, (x, y, z) => (y >= yh ? 99 : clBand(F, y, 3) * 4 + clQuad(F, x, z)));
    const head = ch.filter((c) => c.id === 99), base = ch.filter((c) => c.id !== 99), T1 = clR(1.2, 2.4);
    F.heat = 0.3;
    F.step = (F, t, dt) => {
      const age = t - F.t0;
      if (age < T1) {   // 內部一連串爆炸、頂上冒火
        F.heat = 0.3 + age / T1 * 1.2;
        if (t >= (F.nfx || 0)) { F.nfx = t + 0.08 + Math.random() * 0.18; clBoom(F, F.cx + clR(-0.7, 0.7) * F.ex, yh * clR(0.6, 1.05), F.cz + clR(-0.7, 0.7) * F.ez, 2 + Math.random() * 3.5); clFire(F, F.cx + clR(-0.5, 0.5) * F.ex, yh, F.cz + clR(-0.5, 0.5) * F.ez, F.rr * 0.5, 4); }
      } else F.heat = Math.max(0.5, F.heat - 0.25 * dt);
    };
    clAt(F, t + T1, (t) => {   // 殉爆：頭被炸飛
      const a = F.a + clR(-1, 1), hs = clR(2, 6);
      const b = clBody(F, head, F.cx, yh, F.cz, new THREE.Vector3(Math.cos(a) * hs, clR(13, 21), Math.sin(a) * hs), new THREE.Vector3(clR(-2.5, 2.5), clR(-1.5, 1.5), clR(-2.5, 2.5)));
      for (let k = 0; k < 10; k++) clBoom(F, F.cx + clR(-1, 1) * F.ex, yh + clR(-0.15, 0.2) * F.h, F.cz + clR(-1, 1) * F.ez, 6 + Math.random() * 7);
      for (let k = 0; k < 10; k++) clFire(F, F.cx + clR(-0.6, 0.6) * F.ex, yh, F.cz + clR(-0.6, 0.6) * F.ez, F.rr * 0.9, 8);
      clDeb(F, F.cx, yh, F.cz, 20, Math.max(0.6, F.rr * 0.08), 0, 0);
      clEmit(F, F.cx, yh, F.cz, F.rr * 0.55, 10, 0.95); clEmit(F, F.cx, yh, F.cz, F.rr * 0.7, 40, 0.3);   // 底座像火炬一樣噴火，之後冒煙
      for (const c of base) if ((c.id >> 2) === 2 && Math.random() < 0.5) clMove(c, t + Math.random() * 2, { fall: true, out: new THREE.Vector3(c.c.x - F.cx, 0, c.c.z - F.cz).setLength(clR(2, 5)), K: clTipK(c, F), om: clR(0.5, 1.5), end: 1.3, floor: 0 });
      F.heat = 1.6; b.size = Math.max(b.size, F.rr * 0.6);
    });
  },
  // ── 武器：連環爆炸、整座炸成碎塊 ──
  shatter(F, t) {
    const ny = 4, ch = clFracture(F, (x, y, z) => { const i = Math.max(0, Math.min(2, Math.floor((x - F.bb.min.x) / (2 * F.ex) * 3))), j = Math.max(0, Math.min(2, Math.floor((z - F.bb.min.z) / (2 * F.ez) * 3))); return clBand(F, y, ny) * 9 + i * 3 + j; });
    const T1 = clR(0.8, 1.6);
    F.step = (F, t, dt) => {
      const age = t - F.t0; if (age >= T1) { F.heat = Math.max(0.6, F.heat - 0.3 * dt); return; }
      F.heat = age / T1 * 2;
      if (t >= (F.nfx || 0)) { F.nfx = t + 0.06 + Math.random() * 0.1; clBoom(F, F.cx + clR(-0.8, 0.8) * F.ex, F.h * Math.min(1, age / T1 + Math.random() * 0.3), F.cz + clR(-0.8, 0.8) * F.ez, 2.5 + Math.random() * 4); }
    };
    clAt(F, t + T1, (t) => {
      const mid = F.h * 0.45;
      for (const c of ch) {
        if ((c.id / 9 | 0) === 0 && Math.random() < 0.7) { clMove(c, t, { K: clTipK(c, F), om: 0.3, end: clR(0.05, 0.3), fx: false }); continue; }   // 底座殘留
        const d = new THREE.Vector3(c.c.x - F.cx, c.c.y - mid, c.c.z - F.cz); if (d.lengthSq() < 1e-4) d.set(Math.random() - 0.5, 1, Math.random() - 0.5);
        d.normalize().multiplyScalar(clR(5, 13)); d.y = Math.abs(d.y) + clR(3, 9);
        clBody(F, [c], c.c.x, c.c.y, c.c.z, d, new THREE.Vector3(clR(-3, 3), clR(-3, 3), clR(-3, 3)));
      }
      for (let k = 0; k < 14; k++) clBoom(F, F.cx + clR(-1, 1) * F.ex, F.h * Math.random(), F.cz + clR(-1, 1) * F.ez, 6 + Math.random() * 8);
      clSurge(F, F.rr * 1.2, 14, F.rr, 6);
      clDeb(F, F.cx, mid, F.cz, 30, Math.max(0.6, F.rr * 0.08), 0, 0);
      groundScar(F.ox + F.cx, GROUND_Y, F.oz + F.cz, F.rr * 2);
      clCrushAt(F, F.cx, F.cz, F.rr * 2 + 4, t + 0.2, 1);
      clEmit(F, F.cx, 1, F.cz, F.rr * 0.8, 30, 0.6);
      F.heat = 1.5;
    });
  },
  // ── 武器：能源核心過載、燒紅熔塌 ──
  meltdown(F, t) {
    const ny = 5, ch = clFracture(F, (x, y, z) => { const i = Math.max(0, Math.min(2, Math.floor((x - F.bb.min.x) / (2 * F.ex) * 3))), j = Math.max(0, Math.min(2, Math.floor((z - F.bb.min.z) / (2 * F.ez) * 3))); return clBand(F, y, ny) * 9 + i * 3 + j; });
    for (const c of ch) c.p0 = c.c.clone();
    const T1 = clR(3, 4.5), lean = new THREE.Vector3(F.dz, 0, -F.dx), la = clR(0.02, 0.07);
    F.step = (F, t, dt) => {
      const age = t - F.t0;
      if (age < T1) {   // 越來越紅、脈動越來越快，慢慢軟塌
        const k = age / T1;
        F.heat = k * 2.6 * (0.75 + 0.25 * Math.sin(age * (4 + k * 18)));
        for (const c of ch) { c.grp.position.y = c.p0.y * (1 - 0.12 * k * k); c.grp.position.x = c.p0.x + F.dx * c.p0.y * la * k; c.grp.position.z = c.p0.z + F.dz * c.p0.y * la * k; }
        if (t >= (F.nfx || 0)) { F.nfx = t + 0.1 + Math.random() * 0.15; clFire(F, F.cx + clR(-1, 1) * F.ex, F.h * Math.random() * 0.9, F.cz + clR(-1, 1) * F.ez, F.rr * 0.4, 3); if (Math.random() < 0.3) clBoom(F, F.cx + clR(-0.8, 0.8) * F.ex, F.h * Math.random(), F.cz + clR(-0.8, 0.8) * F.ez, 1.5 + Math.random() * 2); }
      } else F.heat = Math.max(0.5, 2.6 - (age - T1) * 0.08);
    };
    clAt(F, t + T1, (t) => {   // 閃光、熔成一攤
      for (let k = 0; k < 16; k++) { const a = Math.random() * TAU, rr = Math.random() * F.rr; clBoom(F, F.cx + Math.cos(a) * rr, F.h * Math.random() * 0.7, F.cz + Math.sin(a) * rr, 8 + Math.random() * 10); }
      for (const c of ch) clMove(c, t + (c.id / 9 | 0) * 0.15 * Math.random(), { fall: true, floor: Math.random() * F.h * 0.06, sq: clR(0.08, 0.2), sp: clR(1.3, 1.8), K: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), om: clR(-0.4, 0.4), end: 0.4, fx: false });
      clSurge(F, F.rr * 1.4, 18, F.rr * 1.2, 7);
      groundScar(F.ox + F.cx, GROUND_Y, F.oz + F.cz, F.rr * 2.6);
      clCrushAt(F, F.cx, F.cz, F.rr * 2.8 + 6, t, 0.8);
      groundPlume(F.ox + F.cx, F.oz + F.cz, t, 300, Math.max(12, F.rr * 1.5), 1.6);
      clEmit(F, F.cx, 0.5, F.cz, F.rr * 0.9, 40, 0.5);
    });
  },
  // ── 穹頂：頂部塌進去、四周往內倒 ──
  cavein(F, t, burst = false) {
    const ch = clFracture(F, (x, y, z) => { const s = Math.floor(((Math.atan2(z - F.cz, x - F.cx) / TAU) + 1) % 1 * 8), r = y < F.h * 0.35 ? 0 : y < F.h * 0.7 ? 1 : 2; return r * 8 + s; }, true);
    const T1 = burst ? clR(1, 1.8) : 0.3;
    if (burst) F.step = (F, t, dt) => { const age = t - F.t0; if (age < T1) { F.heat = age / T1 * 2.4 * (0.7 + 0.3 * Math.sin(age * 25)); if (t >= (F.nfx || 0)) { F.nfx = t + 0.1; clBoom(F, F.cx + clR(-0.6, 0.6) * F.ex, F.h * Math.random(), F.cz + clR(-0.6, 0.6) * F.ez, 2 + Math.random() * 3); } } else F.heat = Math.max(0.4, F.heat - 0.35 * dt); };
    clAt(F, t + T1, (t) => {
      for (const c of ch) {
        const ring = c.id >> 3;
        if (burst) {
          if (ring === 0) { clMove(c, t, { K: clTipK(c, F), om: 0.4, end: clR(0.1, 0.4), fx: false }); continue; }
          const d = new THREE.Vector3(c.c.x - F.cx, 0, c.c.z - F.cz).setLength(clR(5, 12)); d.y = clR(4, 10) * ring;
          clBody(F, [c], c.c.x, c.c.y, c.c.z, d, new THREE.Vector3(clR(-2, 2), clR(-2, 2), clR(-2, 2)));
        } else if (ring === 2) clMove(c, t + Math.random() * 0.5, { fall: true, floor: Math.random() * F.h * 0.1, K: clTipK(c, F, -1), om: clR(0.3, 1), end: 1.2, sq: 0.6 });
        else if (ring === 1) clMove(c, t + 0.4 + Math.random() * 0.8, { K: clTipK(c, F, -1), om: 0.05, kap: 8 / Math.max(2, F.h), end: clR(1, 1.5) });
        else clMove(c, t + 0.8 + Math.random(), { K: clTipK(c, F, -1), om: 0.05, kap: 3 / Math.max(2, F.h), end: clR(0.08, 0.35), fx: false });
      }
      for (let k = 0; k < (burst ? 14 : 6); k++) clBoom(F, F.cx + clR(-0.8, 0.8) * F.ex, F.h * Math.random() * 0.8, F.cz + clR(-0.8, 0.8) * F.ez, burst ? 7 + Math.random() * 8 : 3 + Math.random() * 3);
      clSurge(F, F.rr * (burst ? 1.3 : 0.9), 14, F.rr * 0.7, burst ? 6 : 3);
      clCrushAt(F, F.cx, F.cz, F.rr * (burst ? 1.8 : 1.2) + 3, t + 0.3, 2);
      groundPlume(F.ox + F.cx, F.oz + F.cz, t, 220, Math.max(10, F.rr * 1.1), 1.2);
      clEmit(F, F.cx, F.h * 0.2, F.cz, F.rr * 0.5, 30, 0.6);
    });
  },
  burst(F, t) { CL_INIT.cavein(F, t, true); },
  // ── 長牆：打中的那一段崩開，兩旁歪斜 ──
  breach(F, t) {
    const ax = F.ex > F.ez, L = (ax ? F.ex : F.ez) * 2, n = Math.max(4, Math.min(40, Math.round(L / Math.max(4, (ax ? F.ez : F.ex) * 3))));
    const ch = clFracture(F, (x, y, z) => Math.max(0, Math.min(n - 1, Math.floor((ax ? (x - F.bb.min.x) : (z - F.bb.min.z)) / L * n))), true);
    const hu = F.hit ? Math.max(0, Math.min(n - 1, Math.floor(((ax ? F.hit.x - F.bb.min.x : F.hit.z - F.bb.min.z)) / L * n))) : Math.max(0, Math.min(n - 1, Math.round(n * (0.3 + Math.random() * 0.4)))), Rb = Math.min(n * 0.25, clR(1.2, 2.6));
    for (const c of ch) {
      const d = Math.abs(c.id - hu), sd = Math.random() < 0.5 ? 1 : -1, K = ax ? new THREE.Vector3(sd, 0, 0) : new THREE.Vector3(0, 0, sd);
      if (d <= Rb) clMove(c, t + d * 0.15 + Math.random() * 0.3, { K, om: 0.1, kap: 8 / Math.max(2, F.h), end: clR(1, 1.5), fall: true, floor: -F.h * clR(0.2, 0.5) });
      else if (d <= Rb * 2.5) clMove(c, t + d * 0.15, { K, om: 0.05, kap: 2 / Math.max(2, F.h), end: clR(0.05, 0.3), fx: false });
    }
    const hx = ax ? F.bb.min.x + (hu + 0.5) / n * L : F.cx, hz = ax ? F.cz : F.bb.min.z + (hu + 0.5) / n * L;
    for (let k = 0; k < 8; k++) clBoom(F, hx + clR(-1, 1) * Rb * L / n, F.h * Math.random(), hz + clR(-1, 1) * Rb * L / n, 3 + Math.random() * 4);
    clCrushAt(F, hx, hz, Rb * L / n + 6, t + 0.3, 1.5);
    clEmit(F, hx, 0.5, hz, 4, 20, 0.4);
  },
  // ── 一般：被打的那一側塌掉 ──
  partial(F, t) {
    const ny = 3, ch = clFracture(F, (x, y, z) => { const i = Math.max(0, Math.min(2, Math.floor((x - F.bb.min.x) / (2 * F.ex) * 3))), j = Math.max(0, Math.min(2, Math.floor((z - F.bb.min.z) / (2 * F.ez) * 3))); return clBand(F, y, ny) * 9 + i * 3 + j; });
    const hx = -F.dx, hz = -F.dz;   // 朝向打擊點
    let any = false;
    for (const c of ch) {
      const u = ((c.c.x - F.cx) * hx + (c.c.z - F.cz) * hz) / Math.max(1, F.rr);
      if (u > -0.15 + Math.random() * 0.2) {
        any = true;
        const out = new THREE.Vector3(hx, 0, hz).multiplyScalar(clR(0.5, 3));
        clMove(c, t + 0.2 + (1 - c.c.y / F.h) * 0.6 + Math.random() * 0.6, { fall: true, out, K: new THREE.Vector3(hz, 0, -hx), om: clR(0.3, 1.2), end: clR(0.4, 1.2), floor: Math.random() * F.h * 0.12, sq: clR(0.3, 0.6), sp: 1.15 });
      } else if (u > -0.6 && Math.random() < 0.5) clMove(c, t + 0.6, { K: new THREE.Vector3(hz, 0, -hx), om: 0.05, end: clR(0.03, 0.15), fx: false });
    }
    if (!any) return CL_INIT.crumble(F, t);
    for (let k = 0; k < 8; k++) clBoom(F, F.cx + hx * F.rr * 0.5 + clR(-0.6, 0.6) * F.ex, F.h * Math.random(), F.cz + hz * F.rr * 0.5 + clR(-0.6, 0.6) * F.ez, 3 + Math.random() * 4);
    clCrushAt(F, F.cx + hx * F.rr, F.cz + hz * F.rr, F.rr + 4, t + 0.5, 2);
    clEmit(F, F.cx + hx * F.rr * 0.3, F.h * 0.4, F.cz + hz * F.rr * 0.3, F.rr * 0.6, 35, 0.6);
    clAt(F, t + 1.5, () => { clSurge(F, F.rr, 8, F.rr * 0.7, 3); groundPlume(F.ox + F.cx, F.oz + F.cz, U.uTime.value, 200, Math.max(8, F.rr), 1.1); });
  },
  // ── 一般：由上往下一塊塊塌成一堆 ──
  crumble(F, t) {
    const ny = 3, ch = clFracture(F, (x, y, z) => { const i = Math.max(0, Math.min(2, Math.floor((x - F.bb.min.x) / (2 * F.ex) * 3))), j = Math.max(0, Math.min(2, Math.floor((z - F.bb.min.z) / (2 * F.ez) * 3))); return clBand(F, y, ny) * 9 + i * 3 + j; });
    for (const c of ch) {
      const band = c.id / 9 | 0, rho = Math.min(1, Math.hypot((c.c.x - F.cx) / Math.max(1, F.ex), (c.c.z - F.cz) / Math.max(1, F.ez)));
      const outer = rho > 0.5 && Math.random() < 0.5;
      clMove(c, t + 0.3 + (band === 0 ? 1.2 : (ny - band) * 0.4) + Math.random() * 1, outer
        ? { fall: true, out: new THREE.Vector3(c.c.x - F.cx, 0, c.c.z - F.cz).setLength(clR(1, 4)), K: clTipK(c, F), om: clR(0.4, 1.2), end: clR(0.8, 1.5), floor: 0 }
        : { fall: true, floor: (1 - rho) * F.h * 0.22 * Math.random(), sq: clR(0.25, 0.5), sp: clR(1.1, 1.4), K: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), om: clR(-0.4, 0.4), end: 0.35 });
    }
    for (let k = 0; k < 10; k++) clBoom(F, F.cx + clR(-1, 1) * F.ex, F.h * Math.random(), F.cz + clR(-1, 1) * F.ez, 3 + Math.random() * 4);
    clCrushAt(F, F.cx, F.cz, F.rr * 1.4 + 4, t + 0.3, 2.5);
    clAt(F, t + 2, () => { clSurge(F, F.rr, 12, F.rr * 0.8, 3.5); groundPlume(F.ox + F.cx, F.oz + F.cz, U.uTime.value, 220, Math.max(10, F.rr * 1.2), 1.3); });
    clEmit(F, F.cx, F.h * 0.2, F.cz, F.rr * 0.7, 30, 0.5);
  },
};
// 除錯：開一場近地戰（g＝battleSetup.ground）、用指定的倒法摧毀第 id 個巨型結構
window.__cl = { CL, CL_MODES, F: () => GV.msFx,
  setup(g) { const s = sandboxSetup(); s.ground = g; return s; },
  kill(id, mode = null, sx = null, sz = null, sy = null) { CL.force = mode; const M = GRD.ms[id], t0 = performance.now(); groundMsKill(M, 0, sx, sz, sy); CL.force = null; const F = GV.msFx[id]; return F ? { ms: Math.round(performance.now() - t0), mode: F.mode, chunks: (F.chunks || []).length, h: F.h, rr: F.rr } : null; } };
