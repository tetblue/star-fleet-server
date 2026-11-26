// ═══════════════════════ 艦長：躍遷的動畫（2026-11-21）═══════════════════════
// 使用者：星圖間移動、地面突襲結束離開、戰鬥中撤退、敵人躍入——只要跟躍遷有關，都要看到離開與進入的動畫。
// 離開（out）：船身充能發光 charge 秒 → 往前拉出一道光束、閃光 → 船消失（之後的事由呼叫的人接手）。
// 進入（in）：船後方一道光束收縮到抵達點 → 閃光 → 船出現。
// 用粒子系統（particles.js 的 PFX.sys：gl＝光暈、ln＝沿速度拉長的光條）畫，跟爆炸、命中同一套，3D 場景裡一定看得到。
const CAP_WARP = { charge: 1.1, streak: 0.4, in: 0.55, len: 30, outT: 0.9 };
const CW = { list: [], glowT: 0 };
// 船在 3D 場景裡的位置與長度（跟 capfx.js 一樣：shipWorldCPU、aScale × TYPE_LEN3）
const _wpos = new THREE.Vector3();
function capWarpPos(s) { shipWorldCPU(s.i, _wpos); return { x: _wpos.x, y: _wpos.y, z: _wpos.z }; }
const capWarpLen = (s) => Math.max(4, shipGeo.getAttribute('aScale').array[s.i] * TYPE_LEN3);
// 一律藍色（使用者 2026-11-26：帝國原本用橘色，配上白色閃光看起來像爆炸）
const capWarpCol = () => 0x7fd4ff;
const capWarpSys = () => (pfxInit() ? PFX.sys : null);
// 光束：沿著 F 從 a 到 b（距離＝船長的倍數）排一串光暈，加幾條往前飛的光條
function capWarpBeam(P, F, L, a, b, col, w, life) {
  const S = capWarpSys(); if (!S) return;
  for (let k = 0, n = 16; k <= n; k++) {
    const d = L * (a + (b - a) * k / n), f = 1 - Math.abs(k / n - 0.15);
    S.gl.emit({ x: P.x + F[0] * d, y: P.y + F[1] * d, z: P.z + F[2] * d, life, s0: L * w * (0.6 + 0.6 * f), s1: L * w * 0.25, c0: col, k: 1.6, a: 0.9, cell: PC.soft, fade: 1 });
  }
  for (let k = 0; k < 6; k++) { const v = L * (30 + k * 8); S.ln.emit({ x: P.x + F[0] * L * a, y: P.y + F[1] * L * a, z: P.z + F[2] * L * a, vx: F[0] * v, vy: F[1] * v, vz: F[2] * v, life: life * 0.8, s0: L * 0.12, c0: 0xffffff, k: 2, cell: PC.line, fade: 2, asp: 0.2 }); }
}
function capWarpFlash(P, L, col, big) {
  const S = capWarpSys(); if (!S) return;
  S.gl.emit({ x: P.x, y: P.y, z: P.z, life: 0.35, s0: L * (big ? 1.4 : 1.1), s1: L * (big ? 3 : 2.2), c0: 0xcfeeff, k: 2, a: 0.9, cell: PC.star, fade: 1 });   // 偏藍的白、不擴太大（太大像爆炸）
  S.gl.emit({ x: P.x, y: P.y, z: P.z, life: 0.45, s0: L * 0.8, s1: L * 3.2, c0: col, k: 1.4, a: 0.8, cell: PC.ring, fade: 1 });
}
// 一艘船的躍遷。o：{ charge＝充能秒數（out）, delay＝開始前等幾秒, F＝方向（預設船頭）, keep＝進入時不碰 hidden（呼叫的人自己顯示） }
function capWarpFx(s, kind, o = {}) {
  if (!s || s.dead) return null;
  const t = U.uTime.value, F = o.F || s.F || [0, 0, 1];
  const e = { s, kind, t0: t + (o.delay || 0), charge: kind === 'out' ? (o.charge != null ? o.charge : CAP_WARP.charge) : 0, F: [F[0], F[1], F[2]], L: capWarpLen(s), P: capWarpPos(s), col: capWarpCol(s), keep: !!o.keep, done: false, last: -9 };
  if (kind === 'in' && !e.keep) s.q.hidden = true;
  CW.list.push(e);
  return e;
}
// 每一幀（capCamera 呼叫）
function capWarpFrame() {
  if (!CAP.on) return;
  const t = U.uTime.value, S = capWarpSys(); if (!S) return;
  // 撤退的充能：我方每艘船身上的光越來越亮（capWarpKey 開始、capMisTick 結束）
  if (CAP.warp && !CAP.warp.go && t - CW.glowT > 0.09) {
    CW.glowT = t; const W = Math.min(1, (t - CAP.warp.t0) / CAP_RULE.warpT);
    for (const s of CAP.own) { if (s.dead || s.q.hidden) continue; const P = capWarpPos(s), L = capWarpLen(s); S.gl.emit({ x: P.x, y: P.y, z: P.z, life: 0.14, s0: L * (0.5 + W * 0.7), s1: L * (0.6 + W * 0.8), c0: capWarpCol(s), k: 1.4, a: 0.15 + W * 0.55, cell: PC.soft, fade: 1 }); }
  }
  for (const e of CW.list) {
    const u = t - e.t0, { s, P, F, L } = e; if (u < 0) continue;
    if (e.kind === 'out') {
      if (u < e.charge) {   // 充能：船還在，跟著船走；越來越亮，光點往船身聚
        Object.assign(P, capWarpPos(s)); if (s.F) { F[0] = s.F[0]; F[1] = s.F[1]; F[2] = s.F[2]; }
        if (t - e.last > 0.07) {
          e.last = t; const k = u / e.charge;
          S.gl.emit({ x: P.x, y: P.y, z: P.z, life: 0.12, s0: L * (0.4 + k * 0.9), s1: L * (0.5 + k), c0: e.col, k: 1.5, a: 0.25 + 0.6 * k, cell: PC.soft, fade: 1 });
          for (let j = 0; j < 3; j++) {
            const a = Math.random() * 6.283, r = L * (1.2 + Math.random()), x = P.x + Math.cos(a) * r, y = P.y + (Math.random() - 0.5) * L * 0.6, z = P.z + Math.sin(a) * r;
            S.ln.emit({ x, y, z, vx: (P.x - x) * 3, vy: (P.y - y) * 3, vz: (P.z - z) * 3, life: 0.3, s0: L * 0.05, c0: e.col, k: 1.8, cell: PC.line, fade: 2, asp: 0.25 });
          }
        }
        continue;
      }
      if (!e.gone) { e.gone = true; s.q.hidden = true; capWarpFlash(P, L, e.col, true); capWarpBeam(P, F, L, 0, CAP_WARP.len, e.col, 0.5, CAP_WARP.streak); }   // 船消失：閃光＋往前的光束
      if (u - e.charge > CAP_WARP.streak) e.done = true;
    } else {
      const k = Math.min(1, u / CAP_WARP.in);
      if (k < 1) {   // 光束從船後方往抵達點收縮
        if (t - e.last > 0.05) { e.last = t; capWarpBeam(P, F, L, -CAP_WARP.len * (1 - k), 0, e.col, 0.45, 0.14); }
        continue;
      }
      if (!e.shown) { e.shown = true; if (!e.keep && !s.dead) s.q.hidden = false; capWarpFlash(P, L, e.col, false); }
      e.done = true;
    }
  }
  for (let k = CW.list.length - 1; k >= 0; k--) if (CW.list[k].done) CW.list.splice(k, 1);
}
function capWarpClear() { CW.list = []; }
// 我方的船一起躍遷離開；回傳動畫要幾秒
function capWarpOutAll(charge) { for (const s of CAP.own) if (!s.dead && !s.q.hidden) capWarpFx(s, 'out', { charge }); return (charge || 0) + CAP_WARP.outT; }
// 剛躍遷進來：我方的船從後方的光束出現（開場稍等一下，讓鏡頭先就位）
function capWarpArrive() { for (const s of CAP.own) if (!s.dead) capWarpFx(s, 'in', { delay: 0.35 }); }
// 等動畫播完（照遊戲時間，不是真實時間：遊戲加速時一樣對得上）；最多等 6 秒真實時間
function capWarpWait(T, fn) {
  const t0 = U.uTime.value, r0 = performance.now();
  const tick = () => { if (!CAP.on || U.uTime.value - t0 >= T || performance.now() - r0 > 6000) fn(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
Object.assign(window.__cap || (window.__cap = {}), { CW, capWarpFx });   // 測試腳本用
