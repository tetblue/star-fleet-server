// ═══════════════════════ 艦長：執行任務目標的 AI（校正派出任務的成功率用） ═══════════════════════
// CAP.auto（AI 對 AI）且不是佔領戰時，我方的船照任務目標行動：capSquadAI 每 tick 問 capMisOrder 要「目標」與「要去的點」。
//   tgt＝要打的東西（覆蓋小隊平常挑的目標）；go＝要去的點；first＝邊打邊走（不停下來繞著目標打）。
// 戰法很單純：附近（threatR 內）有敵人就先打；否則直接衝任務目標；主要目標完成後脫離戰鬥就躍遷，不然飛回撤離點。
// 用途：tools 的 capOpDuel 批次測試 → 擬合 capcareer.js 的 ccOpP（成功率）與 ccOpSurv（存活率）。
const CAP_MAI = { threatR: 260, escortR: 520, every: 0.5 };
const _maiV = new THREE.Vector3();

// 敵艦（看得到的）離 (x,z) 最近的一艘：回傳 { k:'s', i, d }
function capMaiNearShip(x, y, z, R, seeOnly) {
  let best = null, bd = R;
  for (const s of CAP.foes) {
    if (s.dead || !ships.alive[s.i] || (seeOnly && !CAP.seeS[s.i])) continue;
    const d = Math.hypot(s.x - x, s.y - y, s.z - z); if (d < bd) { bd = d; best = { k: 's', i: s.i, d }; }
  }
  for (const P of CAP.pat) {   // 巡邏隊、運輸船隊等非特製戰艦
    if (!P.on) continue;
    for (const q of P.f.sqs) for (const i of q.list) {
      if (!ships.alive[i] || (seeOnly && !CAP.seeS[i])) continue;
      shipWorldCPU(i, _maiV); const d = Math.hypot(_maiV.x - x, _maiV.y - y, _maiV.z - z); if (d < bd) { bd = d; best = { k: 's', i, d }; }
    }
  }
  return best;
}
// 有武裝的地面單位（飛彈車、陣地、防空砲、軍艦）：看得到的、R 內最近的
function capMaiNearGt(x, y, z, R, seeOnly) {
  const es = 1 - CAP.side; let best = null, bd = R;
  for (const g of CAP.G.gts) {
    if (g.side !== es || gtDead(g) || !CAP_COMBAT[g.kind] || (seeOnly && !CAP.seeG[g.id])) continue;
    const d = Math.hypot(g.x - x, g.y - y, g.z - z); if (d < bd) { bd = d; best = { k: 'g', i: g.id, d }; }
  }
  return best;
}
function capMaiThreat(s) {
  const a = capMaiNearShip(s.x, s.y, s.z, CAP_MAI.threatR, true), b = capMaiNearGt(s.x, s.y, s.z, CAP_MAI.threatR * 0.8, true);
  return a && b ? (a.d < b.d ? a : b) : a || b;
}
const capMaiPt = (x, y, z) => ({ x, y: y == null ? 0 : y, z });

function capMisOrder(s, t) {
  const M = CAP.mis;
  if (s.foe || !CAP.auto || !M || M.type === 'capture' || GAME.result) return null;
  const O = CAP.mai || (CAP.mai = { t: -9, by: {} });
  if (t < O.t && O.by[s.k]) return O.by[s.k];
  if (t >= O.t) { O.t = t + CAP_MAI.every; O.by = {}; capMaiTick(t); }
  return (O.by[s.k] = capMaiFor(s, M, t));
}
// 每 0.5 秒一次（不分船）：親自駕駛的那艘沉了就換一艘（撤離點的判定看它）；目標完成、脫離戰鬥就躍遷
function capMaiTick(t) {
  const M = CAP.mis, c = capCur();
  if (!c || c.dead) { const k = CAP.own.find((o) => !o.dead); if (k) CAP.cur = k.k; }
  if ((M.done || M.type === 'run') && !CAP.warp && M.done && !capCalmWhy(t)) CAP.warp = { t0: t };
}
function capMaiFor(s, M, t) {
  const ext = capMaiPt(CAP.ext.x, s.y, CAP.ext.z), threat = capMaiThreat(s);
  if (M.type === 'run') return { go: ext, first: true, tgt: threat && threat.d < 160 ? threat : null };   // 突破封鎖：只打擋在面前的
  if (M.done) return { go: ext, first: true, tgt: threat };
  if (threat && M.type !== 'escort' && M.type !== 'rescue' && (M.type !== 'intercept' || threat.d < 140)) return { tgt: threat };   // 攔截：船隊優先，只打貼上來的
  switch (M.type) {
    case 'sabotage': case 'strike': {
      let best = null, bd = 1e9;
      for (const id of M.gts) { const g = CAP.G.gts[id]; if (!g || gtDead(g)) continue; const d = Math.hypot(g.x - s.x, g.z - s.z); if (d < bd) { bd = d; best = { k: 'g', i: id }; } }
      return best ? { tgt: best } : null;
    }
    case 'decap': return M.ship >= 0 && ships.alive[M.ship] ? { tgt: { k: 's', i: M.ship } } : null;
    case 'wipe': {   // 看不到的也去找（照地圖上已知的位置）
      const a = capMaiNearShip(s.x, s.y, s.z, 1e9, false), b = capMaiNearGt(s.x, s.y, s.z, 1e9, false);
      const T = a && b ? (a.d < b.d ? a : b) : a || b; return T ? { tgt: T } : null;
    }
    case 'intercept': {
      const V = CAP.pat.find((q) => q.role === 'convoy'); if (!V) return null;
      let best = null, bd = 1e9;
      for (const q of V.f.sqs) for (const i of q.list) { if (!ships.alive[i]) continue; shipWorldCPU(i, _maiV); const d = Math.hypot(_maiV.x - s.x, _maiV.z - s.z); if (d < bd) { bd = d; best = { k: 's', i }; } }
      return best ? { tgt: best } : null;
    }
    case 'escort': {   // 跟著運輸船隊；船隊附近有敵人就打
      const A = (CAP.ally || []).find((a) => a.on && a.c && capAllyAlive(a)); if (!A) return { go: ext, first: true };
      const T = capMaiNearShip(A.c.x, A.c.y, A.c.z, CAP_MAI.escortR, false) || capMaiNearGt(A.c.x, A.c.y, A.c.z, CAP_MAI.escortR * 0.7, false);
      return T ? { tgt: T } : { go: capMaiPt(A.c.x + (s.slot - 1) * 40, A.c.y + 10, A.c.z - 60) };
    }
    case 'rescue': {   // 先去接駁還沒接到的；都接到了就跟著撤離中的友艦
      const L = (CAP.ally || []).filter((a) => a.on && a.c && capAllyAlive(a));
      const wait = L.filter((a) => a.link < 1).sort((a, b) => Math.hypot(a.c.x - s.x, a.c.z - s.z) - Math.hypot(b.c.x - s.x, b.c.z - s.z))[0];
      if (wait) { const d = Math.hypot(wait.c.x - s.x, wait.c.z - s.z), H = capMaiNearShip(wait.c.x, wait.c.y, wait.c.z, CAP_MAI.escortR * 0.7, false); if (H && d < CAP_MAI.escortR) return { tgt: H };   // 獵殺隊在友艦附近：先打
      return { go: capMaiPt(wait.c.x, wait.c.y, wait.c.z), first: d > CAP_MIS2.linkR * 0.6, tgt: threat }; }
      const A = L[0]; if (!A) return { go: ext, first: true, tgt: threat };
      const T = capMaiNearShip(A.c.x, A.c.y, A.c.z, CAP_MAI.escortR, false);
      return T ? { tgt: T } : { go: capMaiPt(A.c.x, A.c.y + 10, A.c.z - 50) };
    }
    case 'scan': {
      const pt = (M.pts || []).filter((p) => p.p < 1).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
      return pt ? { go: capMaiPt(pt.x, pt.y, pt.z), first: true, tgt: threat } : { go: ext, first: true, tgt: threat };
    }
  }
  return null;
}

// ───── 批次測試：派出任務的實戰（AI 執行任務目標）─────
// cfg＝{ mis: 任務種類, slots: [艦種…], st: [{ hp, sh, msl }…], li: 任務難度, env: 0＝地面／太空場景的 env, seed, tgt }
function capOpDuel(cfg) {
  const p = { ...capLoad(), fac: 0, slots: cfg.slots.slice(), ally: '', diff: cfg.li, env: cfg.env || 0, mis: cfg.mis, seed: cfg.seed || randSeed(), tgt: cfg.tgt, space: cfg.env !== 0, auto: true };
  simEndMid(); overlay(null); CAP.duelRow = null;
  const m = capLayout(p); m.captain.auto = true; m.captain.opDuel = cfg;
  let k = 0; for (const fd of m.fleets) if (fd.capRole === 'player') { fd.capSt = (cfg.st || [])[k] || null; k++; }
  SIM.m = m; SIM.sel = null; camAnim = null;
  simStart();
}
function capOpRow() {
  const C = CAP.cfg, D = C && C.opDuel; if (!D) return null;
  const R = GAME.result || {};
  return { cfg: D, ok: !!R.capOk, why: R.why || '', t: Math.round(U.uTime.value), alive: CAP.own.map((s) => !s.dead), hp: CAP.own.map((s) => s.dead ? 0 : ships.hp[s.i] / maxHp(s.i)) };
}
Object.assign(window.__cap || (window.__cap = {}), { capOpDuel, capOpRow, CAP_SPACE_KEYS, nG: GROUND_KEYS.length });
