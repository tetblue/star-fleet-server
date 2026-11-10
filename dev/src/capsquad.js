// ═══════════════════════ 艦長：小隊對小隊（艦長生涯第 2 階段） ═══════════════════════
// 敵方也有特製戰艦（CAP_HULLS），由 AI 操控；玩家可以帶兩個小隊，按 cap_squad 切換親自指揮的小隊，另一隊交給 AI。
// 佔領戰（capture）：擊沉星系裡的敵方小隊（每方最多 2 隊）與軌道防禦。雙方一開始就知道彼此的位置（正面交戰）。
// 勝率與存活率公式（CAP_ODDS）：tools/capsquad-fit.mjs 擬合；capDuel＝AI 對 AI 實測，用來校正公式。

// 友軍小隊的編成（隨機任務的選單用；生涯模式會換成玩家自己的第二個小隊）
const CAP_ALLY = {
  '': { name: '無', hulls: [] },
  same: { name: '和你相同', hulls: null },
  aa: { name: '突擊艦 ×2', hulls: ['assault', 'assault'] },
  gs: { name: '重砲＋支援', hulls: ['gunship', 'support'] },
  ags: { name: '突擊＋重砲＋支援', hulls: ['assault', 'gunship', 'support'] },
};
Object.assign(CAP_UNIT, {
  orb: { kind: 'site', sub: 'orb', name: '軌道防禦站', hp: 1400, r: 5, hh: 0, sensor: 320, sh: 0, radar: true, intel: true, merit: 150, space: true,
    msl: { range: 300, n: 4, cd: 16, dmg: 34 }, gun: { range: 170, cd: 0.45, dmg: 2.5, acc: 0.5, ship: 2.6 } },
});
CAP_MIS.capture = { name: '佔領戰', at: 's', text: (M) => `擊沉敵方 ${M.nSq || 1} 個小隊（${M.nShips || 0} 艘）${M.defs && M.defs.length ? `、摧毀軌道防禦 ${M.defs.length} 座` : ''}，取得軌道控制` };

// ───── 勝率與存活率公式 ─────
// win：tools/capsquad-fit.mjs 用無頭模擬 12000 場擬合（2026-11-10）；拿遊戲裡 600 場 AI 對 AI 的佔領戰驗證，準確 90%，重新擬合也沒有更準，所以沿用
//   f＝艦種基本火力、alpha＝護盾的耐久價值、lambda＝飛彈齊射、gamma＝耐久的指數、delta＝分成兩隊的懲罰、k＝斜率；def＝軌道防禦每座的火力、耐久
// surv：用遊戲裡的實戰重新擬合（無頭模擬高估了突擊艦的存活）；b＝艦種基準、c1＝勝率、c2＝自己剩下的耐久、c3＝船數比
const CAP_ODDS = {
  win: { f: { assault: 1, gunship: 2.5208, support: 1.7546 }, alpha: 0.1229, gamma: 0.284, delta: 0.0893, k: 7.763, lambda: 0.0438, def: { orb: { F: 0, E: 4 }, plat: { F: 0, E: 1.5 } } },   // def：217 場有軌道防禦的實戰擬合（耐久≈每 100 點船體 0.28；火力的影響量不出來）
  surv: { b: { assault: -3.3628, gunship: -0.2404, support: -1.247 }, c1: 0.4301, c2: 0.8858, c3: 2.828 },
};
// sides＝[{ squads: [[{ key, hp, sh, msl }]], diff }, 對方]（hp、sh、msl＝剩下的比例）；回傳我方（sides[0]）的勝率與每艘船的存活率
function capOdds(sides, P = CAP_ODDS) {
  const W = P.win, sig = (z) => 1 / (1 + Math.exp(-z));
  const fem = (S) => {
    let F = 0, E = 0, Mm = 0; const D = CAP_DIFF[S.diff] || CAP_DIFF[1];
    for (const q of S.squads) for (const c of q) { const H = CAP_HULLS[c.key]; F += D.dmg * W.f[c.key]; E += D.hp * (H.hp * c.hp + W.alpha * H.sh * c.sh) / 100; if (H.msl) Mm += D.dmg * H.msl.n * c.msl * H.msl.dmg / 100; }
    // 軌道防禦：每座的火力、耐久（和船同一個單位）；d＝種類，或 { type, hp: 剩下的比例 }
    if (S.defs && W.def) for (const d of S.defs) { const k = d.type || d, h = d.hp != null ? d.hp : 1, V = W.def[k]; if (V && h > 0) { F += D.dmg * V.F; E += D.hp * V.E * h; } }
    return { F, E, M: Mm };
  };
  const a = fem(sides[0]), b = fem(sides[1]);
  const lnS = (x, y, S) => Math.log(Math.max(1e-6, x.F)) + W.gamma * Math.log(Math.max(1e-6, Math.max(x.E * 0.1, x.E - W.lambda * y.M))) - W.delta * Math.max(0, S.squads.length - 1);
  const pw = sig(W.k * (lnS(a, b, sides[0]) - lnS(b, a, sides[1])));
  const surv = sides.map((S, si) => {
    const p = si ? 1 - pw : pw, lp = Math.max(-8, Math.min(8, Math.log(Math.max(1e-9, p) / Math.max(1e-9, 1 - p))));
    const nOwn = S.squads.flat().length, nFoe = Math.max(1, sides[1 - si].squads.flat().length);
    return S.squads.map((q) => q.map((c) => {
      const H = CAP_HULLS[c.key], fr = (H.hp * c.hp + W.alpha * H.sh * c.sh) / (H.hp + W.alpha * H.sh);
      return sig(P.surv.b[c.key] + P.surv.c1 * lp + P.surv.c2 * Math.log(Math.max(0.05, fr)) + P.surv.c3 * Math.log(nOwn / nFoe));
    }));
  });
  return { win: pw, surv };
}
// 戰場上目前的狀況 → capOdds 的輸入（我方難度＝普通，敵方＝這場的難度）
function capOddsNow() {
  const side = (L, diff) => {
    const m = new Map();
    for (const s of L) { if (s.dead) continue; const r = { key: s.key, hp: ships.hp[s.i] / maxHp(s.i), sh: ships.shMax[s.i] ? ships.sh[s.i] / ships.shMax[s.i] : 0, msl: s.H.msl ? s.mslN / s.H.msl.n : 0 }; if (!m.has(s.sq)) m.set(s.sq, []); m.get(s.sq).push(r); }
    return { squads: [...m.values()], diff };
  };
  const A = side(CAP.own, 1), B = side(CAP.foes, CAP.li);
  B.defs = CAP.G.gts.filter((g) => g.def && !gtDead(g)).map((g) => ({ type: g.cu, hp: g.hp / g.max }));
  return A.squads.length && (B.squads.length || B.defs.length) ? capOdds([A, B]) : null;
}

// ───── 戰場：佔領戰（capLayoutSpace 呼叫；地形、出發點、據點 B 已經放好） ─────
function capLayoutCapture(p, key, o) {
  const { R, li, S, B, terrain, units, add, spot, near, hole } = o, D = p.duel || null;
  // 軌道防禦：防禦站（普通以上）＋防禦平台，圍著敵方據點
  if (!p.noDef) {
    if (li >= 1) add('orb', { x: B.x, z: B.z }, { def: true });   // B 已經在 used 裡，直接放在據點正中央
    for (let k = 0, n = [1, 1, 2, 2, 3][li]; k < n; k++) add('plat', spot(near(B, 140, 320), 160), { def: true });
  }
  const cmdr = { base: null, name: '', title: '', trait: 'shield', level: 1, mode: 'lv', tal: {}, skills: [] };
  const fleet = (x) => ({ cmdr, noCmdr: true, hangar: HANGAR_DEFAULT.slice(), formation: 'line', orderly: false, layers: 1, ai: null, reserve: false, at: 1e9, cap: true, ...x });
  const comp1 = (t) => { const c = new Array(SHIP_TYPES.length).fill(0); c[t] = 1; return c; };
  // 雙方的小隊
  const mine = p.slots.filter(Boolean), A = CAP_ALLY[p.ally] || CAP_ALLY[''];
  const ours = D ? D.a : [mine, ...((A.hulls || mine).length ? [(A.hulls || mine).slice(0, 5)] : [])];
  let theirs = D ? D.b : null;
  if (!theirs) {   // 敵方：總數照我方的船數與難度，多於 5 艘（或隨機）分成兩隊
    const n0 = ours.flat().length, n = Math.max(1, Math.min(10, Math.round(n0 * [0.6, 0.8, 1, 1.15, 1.3][li] + R() * 0.8 - 0.4)));
    const pk = () => { const r = R(); return r < 0.4 ? 'assault' : r < 0.7 ? 'gunship' : 'support'; };
    const two = n > 5 || (n >= 3 && R() < 0.4), n1 = two ? Math.ceil(n / 2) : n;
    theirs = [Array.from({ length: n1 }, pk)]; if (two) theirs.push(Array.from({ length: n - n1 }, pk));
  }
  // 有軌道防禦：守軍在防禦站前方待命，只迎擊進入防區（guard）的敵人；沒有防禦（AI 對 AI 的純小隊戰）：雙方在中間附近交戰
  const hasDef = units.some((u) => u.def), guard = hasDef ? { x: B.x, z: B.z, R: 420 } : null;
  const fleets = [], posA = D ? { x: 0, z: hasDef ? 300 : 260 } : { x: S.x, z: 760 }, posB = hasDef ? { x: B.x, z: B.z + 150 } : D ? { x: 0, z: -260 } : { x: Math.round(B.x * 0.5), z: -200 };
  const put = (side, list, pos) => list.forEach((q, qi) => q.forEach((hk, k) => {
    const H = CAP_HULLS[hk], off = k - (q.length - 1) / 2, dir = side ? 1 : -1, qx = (qi - (list.length - 1) / 2) * 110;
    const st = D && D.st ? (D.st[side] || [])[qi] && D.st[side][qi][k] : null;
    fleets.push(fleet({ side, name: side ? `敵${'AB'[qi]}隊・${H.name}` : `${qi ? 'B隊・' : ''}${'一二三四五'[k]}號艦・${H.name}`, capRole: side ? 'foe' : 'player', capSq: qi, capSlot: k, capHull: hk, capSt: st || null, capGuard: side ? guard : null,
      comp: comp1(H.look), x: pos.x + qx + off * 18, z: pos.z - dir * Math.abs(off) * 9, y: (side ? 10 : 0) + (qi ? 12 : 0), h: side ? 0 : Math.PI }));
  }));
  put(0, ours, posA); put(1, theirs, posB);
  const space = { key, R: CAP_EDGE.R, Ry: CAP_EDGE.Ry, hole };
  const mis = { type: 'capture', li, goal: 1, names: '' };
  const m = { name: '', fac: p.fac === 1 ? 1 : 0, victory: false, ctl: -1, timeLimit: CAP_RULE.time, seed: campHash(p.seed, 13) % 100000, fleets, terrain, sides: [{ lv: 0 }, { lv: li }],
    captain: { li, hulls: mine, mis, units, S: { x: posA.x, z: posA.z }, B: { x: B.x, z: B.z }, ext: { x: posA.x, z: posA.z + 120 }, waves: 0, ftr: 0, scene: null, space, open: true, auto: !!p.auto, duel: D } };
  m.name = `${CAP_MIS.capture.name}・${CAP_SPACE[key].name}・${CAP_DIFF[li].name}`;
  return m;
}

// ───── 任務：佔領戰 ─────
function capCaptureInit(M) {
  if (M.type !== 'capture') return;
  M.nShips = CAP.foes.length; M.nSq = new Set(CAP.foes.map((s) => s.sq)).size;
  M.defs = CAP.G.gts.filter((g) => g.def).map((g) => g.id);
  M.goal = M.nShips + M.defs.length; M.prog = 0;
  M.odds = capOddsNow();
}
// 回傳 true＝佔領戰（其他任務的判定跳過）
function capCaptureTick(M, t) {
  if (M.type !== 'capture') return false;
  const sunk = CAP.foes.filter((s) => s.dead).length, gone = M.defs.filter((i) => gtDead(CAP.G.gts[i])).length;
  M.prog = sunk + gone; M.sunk = sunk; M.gone = gone;
  if (M.prog >= M.goal) { M.done = true; capFinish(true, '取得軌道控制'); return true; }
  if (CAP.warp && !GAME.result) {   // 躍遷撤退（佔領戰隨時可以撤，算任務失敗，但船保住了）
    const w = capCalmWhy(t);
    if (w) { CAP.warp = null; capFeed(`躍遷充能中斷：${w}`, 'bad'); }
    else if (t - CAP.warp.t0 >= CAP_RULE.warpT) capFinish(false, '躍遷撤退', { retreat: true });
  }
  if (t > CAP_RULE.time) capFinish(false, '超過任務時限');
  return true;
}
function capCaptureProg(M) { return `敵艦 ${M.sunk || 0}／${M.nShips}${M.defs.length ? `・軌道防禦 ${M.gone || 0}／${M.defs.length}` : ''}`; }

// ───── 小隊 AI ─────
function capSqName(sq, foe) { return `${foe ? '敵' : ''}${'AB'[sq] || sq + 1}隊`; }
function capSquadLost(s) { if (!CAP.foes.some((o) => !o.dead && o.sq === s.sq)) { capFeed(`${capSqName(s.sq, true)}全滅！`, 'kill'); toast(`${capSqName(s.sq, true)}全滅`, 'pilot'); } }
// 切換小隊：接手另一隊的第一艘還在的船；原本的小隊交給 AI
function capSquadKey() {
  const c = capCur(); if (!c) return;
  const o = CAP.own.filter((s) => !s.dead && s.sq !== c.sq);
  if (!o.length) { capFeed(CAP.own.some((s) => s.sq !== c.sq) ? '另一個小隊已經全滅' : '這場戰鬥只有一個小隊', 'hint'); return; }
  CAP.tgt = null; for (const s of CAP.own) s.lockT = 0;
  capTake(o[0], `${capSqName(c.sq)}交給 AI・改指揮${capSqName(o[0].sq)}：`);
}
const _sqv = new THREE.Vector3(), _sqw = new THREE.Vector3();
// 小隊的目標（集火）：離小隊中心近、血少的敵艦優先；軌道防禦等武裝設施排在船後面
function capSquadTarget(s) {
  const es = 1 - s.side, t = U.uTime.value, team = capTeam(s).filter((o) => !o.dead && o.sq === s.sq);
  let cx = 0, cy = 0, cz = 0; for (const o of team) { cx += o.x; cy += o.y; cz += o.z; } const n = team.length || 1; cx /= n; cy /= n; cz /= n;
  let best = null, bs = 1e9;
  for (let i = 0; i < shipCount; i++) {
    const q = squadrons[ships.sq[i]];
    if (!ships.alive[i] || ships.side[i] !== es || q.hidden || q.bg || !capVis(s, i, t)) continue;
    shipWorldCPU(i, _sqv); const d = Math.hypot(_sqv.x - cx, _sqv.y - cy, _sqv.z - cz); if (d > 1600) continue;
    if (s.guard && Math.hypot(_sqv.x - s.guard.x, _sqv.z - s.guard.z) > s.guard.R + 150) continue;   // 守軍：防區外的不追
    const sc = d * (0.55 + 0.45 * ships.hp[i] / maxHp(i));
    if (sc < bs) { bs = sc; best = { k: 's', i }; }
  }
  for (const g of CAP.G.gts) {
    if (g.side !== es || gtDead(g) || !CAP_COMBAT[g.kind] || (!s.foe && !CAP.seeG[g.id])) continue;
    const sc = Math.hypot(g.x - cx, g.y - cy, g.z - cz) * 1.6 + 60;
    if (sc < bs) { bs = sc; best = { k: 'g', i: g.id }; }
  }
  return best;
}
// 每 tick：決定這艘船的輸入（s.inp）與要不要開火（aiFire、aiMsl、aimP）
// 戰法：小隊集火同一個目標；站在主砲射程的六～八成，船頭對準目標、橫移繞圈（每艘繞的方向錯開，偶爾換邊）
function capSquadAI(s, t, dt) {
  const I = s.inp, H = s.H, M = H.main;
  I.boost = false; I.turn = null; I.pitch = 0; s.aiFire = false; s.aiMsl = false; s.aimP = null; s.aiEng = false;
  const hpNow = ships.hp[s.i] + ships.sh[s.i]; if (s.lastHp != null && hpNow < s.lastHp - 0.5) s.hitT = t; s.lastHp = hpNow;   // 敵方的船不經過 capHurt
  const key = s.side * 4 + s.sq, Q = CAP.sqAI[key] || (CAP.sqAI[key] = { t: -9, tgt: null });
  if (t > Q.t) { Q.t = t + 1 + capRnd() * 0.3; Q.tgt = capSquadTarget(s); }
  let T = Q.tgt; if (T && !capTgtPos(T, _sqw)) { T = Q.tgt = capSquadTarget(s); Q.t = t + 1; }
  s.aiTgt = T;
  const tp = T ? capTgtPos(T, _sqw) : null;
  let gx, gy, gz, face = null;
  if (tp) {
    const tx = tp.x, ty = tp.y, tz = tp.z, dx = tx - s.x, dy = ty - s.y, dz = tz - s.z, d = Math.hypot(dx, dy, dz) || 1;
    s.aiEng = d < 450;
    if (t > (s.orbT || 0)) { s.orbT = t + 12 + capRnd() * 14; if (capRnd() < 0.4) s.orb = -s.orb; }
    const R = M.range * (s.key === 'gunship' ? 0.78 : s.key === 'support' ? 0.7 : 0.6), a = Math.atan2(s.x - tx, s.z - tz) + s.orb * 0.35;
    gx = tx + Math.sin(a) * R; gz = tz + Math.cos(a) * R; gy = ty + ((s.slot % 3) - 1) * 8;
    face = Math.atan2(dx, dz);
    s.aimP = { x: tx, y: ty, z: tz };
    s.aiFire = d < M.range;
    s.aiMsl = !!H.msl && s.mslN > 0 && t > s.aiMslT && T.k !== 'f' && d < H.msl.range;
    if (H.skill.key === 'burst' && d > 230 && s.skillCd <= 0) capSkill(s, t);
  } else if (!s.foe && !CAP.auto && capCur() && !capCur().dead) {   // 我方的另一隊沒有目標：跟在玩家後面
    const L = capCur(), side = s.sq ? 1 : -1, back = 50 + s.slot * 22;
    gx = L.x - Math.sin(L.yaw) * back + Math.cos(L.yaw) * 70 * side; gz = L.z - Math.cos(L.yaw) * back - Math.sin(L.yaw) * 70 * side; gy = L.y + 6;
  } else { gx = s.home0.x; gy = s.home0.y; gz = s.home0.z; }   // 守在原地（防禦點）
  // 別跑進粒子帶、黑洞附近；地面：保持離地
  if (CAP.sp) {
    const e = capEdgeE(gx, gy, gz); if (e > 0.82) { const k = 0.82 / e; gx *= k; gy *= k; gz *= k; }
    const h = CAP.sp.hole; if (h) { const hx = gx - h.x, hz = gz - h.z, hd = Math.hypot(hx, hz) || 1, mR = h.hurt * 1.4; if (hd < mR) { gx = h.x + hx / hd * mR; gz = h.z + hz / hd * mR; } }
  } else if (GRD) gy = Math.max(gy, capGroundH(gx, gz) + s.L * 0.13 + 4);
  const ddx = gx - s.x, ddz = gz - s.z, dH = Math.hypot(ddx, ddz);
  I.yaw = face != null ? face : dH > 8 ? Math.atan2(ddx, ddz) : s.yaw;
  const Fh = [Math.sin(s.yaw), Math.cos(s.yaw)], ahead = ddx * Fh[0] + ddz * Fh[1], lat = ddx * -Fh[1] + ddz * Fh[0];
  I.thr = Math.max(-0.3, Math.min(1, ahead * 0.5 / H.cruise)); I.boost = ahead > 150;
  I.strafe = Math.max(-1, Math.min(1, lat * 0.4 / H.strafe));
  I.vert = Math.max(-1, Math.min(1, (gy - s.y) * 0.6 / H.climb));
  if (GRD) { let need = -1e9; for (const k of [1, 2.5]) need = Math.max(need, capGroundH(s.x + s.vx * k, s.z + s.vz * k)); if (s.y < need + s.L * 0.13 + 1.5) I.vert = 1; }
  if (H.skill.key === 'shield' && s.skillCd <= 0 && ships.hp[s.i] < maxHp(s.i) * 0.5 && t - s.hitT < 2) capSkill(s, t);
}

// ───── AI 對 AI 實測（校正公式）─────
// cfg＝{ a: [[艦種…], [艦種…]]（我方 1～2 隊）, b: 敵方, st: [[[{ hp, sh, msl }…]…], …]（帶傷開戰，可省略）, li: 敵方難度, seed, def: 有沒有軌道防禦 }
function capDuel(cfg) {
  const p = { ...capLoad(), slots: cfg.a[0].slice(), ally: '', diff: cfg.li != null ? cfg.li : 1, env: GROUND_KEYS.length + 1 + (cfg.hole ? 1 : 0), mis: 'capture', seed: cfg.seed || randSeed(), noDef: !cfg.def, auto: true, duel: cfg };
  simEndMid(); overlay(null); CAP.duelRow = null;
  SIM.m = capLayout(p); SIM.sel = null; camAnim = null;
  simStart();
}
// 一場打完：轉成 capsquad-fit.mjs 的資料格式 { sides, r: { win, t, ships } }
function capDuelRow() {
  const C = CAP.cfg, D = C && C.duel; if (!D) return null;
  const st = (si, qi, k) => (D.st && D.st[si] && D.st[si][qi] && D.st[si][qi][k]) || { hp: 1, sh: 1, msl: 1 };
  const sides = [D.a, D.b].map((L, si) => ({ squads: L.map((q, qi) => q.map((key, k) => ({ key, ...st(si, qi, k) }))), diff: si ? (D.li != null ? D.li : 1) : 1 }));
  const defs = CAP.G.gts.filter((g) => g.def).map((g) => g.cu); if (defs.length) sides[1].defs = defs;   // 軌道防禦（公式的 def 參數）
  const R = GAME.result, own = CAP.own.some((s) => !s.dead), foe = CAP.foes.some((s) => !s.dead) || CAP.G.gts.some((g) => g.def && !gtDead(g));
  const win = !own ? 1 : !foe ? 0 : R && R.capOk ? 0 : -1;   // -1＝時間到、撤退
  return { sides, r: { win, t: Math.round(U.uTime.value), ships: CAP.ships.map((s) => ({ side: s.side, sq: s.side * 10 + s.sq, key: s.key, alive: !s.dead, hp: s.dead ? 0 : ships.hp[s.i] / maxHp(s.i) })) } };
}
Object.assign(window.__cap || (window.__cap = {}), { capDuel, capDuelRow, capOdds, capOddsNow, CAP_ODDS });
