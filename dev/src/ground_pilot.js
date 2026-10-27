// ═══════════════════════ 王牌飛行員 × 近地作戰：地面目標、對地攻擊任務、貼地飛行的碰撞 ═══════════════════════
// 只在駕駛模式的近地戰場（battleSetup.ground.pilot）生效：地面目標由地形種子決定（groundGen 裡的 groundTargetGen）
// 種類：aa 防空砲台（就是 GRD.tur，駕駛模式下也會打玩家）、unit 地面防衛部隊（戰車＋防空飛彈車）、plane 停在地面的戰機、
//       navy 港口的軍艦（有防空砲）、bldg 特定建築物（指揮中心、發電廠…）
// 玩家的武器：機砲、火箭、光矛直接打；重型魚雷可以鎖定地面目標；T 鍵可以指定。打到一般建築：重武器會把它炸毀
// 駕駛沒有回放：這裡的亂數用 plRnd（不動到模擬的亂數）

const GT_KIND = {
  aa: { name: '防空砲台', unit: '座', goal: [2, 2, 3, 3, 4], merit: 40 },
  unit: { name: '地面防衛部隊的車輛', unit: '輛', goal: [4, 5, 6, 8, 10], merit: 12 },
  plane: { name: '停在地面的戰機', unit: '架', goal: [5, 6, 8, 10, 12], merit: 10 },
  navy: { name: '港口的軍艦', unit: '艘', goal: [1, 2, 2, 3, 3], merit: 60 },
  bldg: { name: '指定的建築物', unit: '棟', goal: [1, 1, 2, 2, 3], merit: 50 },
};
const GT_SCENE = { city: ['aa', 'unit', 'bldg'], harbor: ['navy', 'aa', 'bldg'], base: ['plane', 'aa', 'unit', 'bldg'], elevator: ['aa', 'unit', 'bldg'], mountain: ['aa', 'unit', 'bldg'] };
// 對玩家開火的方式：flak＝防空砲（快、命中率中等）、sam＝防空飛彈（慢、準，可以靠機動閃掉）
const GT_AA = {
  turret: { type: 'flak', range: 260, cd: 0.9, dmg: 6, acc: 0.45, spd: 500 },
  sam: { type: 'sam', range: 180, cd: 5, dmg: 14, acc: 0.85, spd: 55 },
  navy: { type: 'flak', range: 220, cd: 0.6, dmg: 3.5, acc: 0.32, spd: 520 },
  hq: { type: 'flak', range: 200, cd: 0.9, dmg: 4, acc: 0.4, spd: 500 },
};
const GT_TURRET_MUL = 2.5;   // 玩家的武器打防空砲台：傷害倍率（砲台耐久是照艦隊戰設計的）
// 特定建築物的樣式：w／d／h（單位）、hp
const GT_BLDG = {
  hq: { name: '指揮中心', w: 3, d: 3, h: 2.6, hp: 260, aa: 'hq' },
  power: { name: '發電廠', w: 4.2, d: 2.6, h: 1.3, hp: 220 },
  comm: { name: '通訊塔', w: 1.4, d: 1.4, h: 7, hp: 160 },
  fuel: { name: '燃料庫', w: 4, d: 4, h: 1, hp: 180 },
  radar: { name: '雷達站', w: 2.4, d: 2.4, h: 1, hp: 200 },
  fort: { name: '山中要塞', w: 4, d: 4, h: 1.6, hp: 300, aa: 'hq' },
  ctrl: { name: '電梯控制中心', w: 4, d: 4, h: 3, hp: 280, aa: 'hq' },
  ammo: { name: '彈藥庫', w: 3.4, d: 2, h: 0.9, hp: 200 },
};
const GT_SCENE_BLDG = { city: ['hq', 'power', 'comm'], harbor: ['fuel', 'ammo', 'hq'], base: ['hq', 'radar', 'fuel'], elevator: ['ctrl', 'power', 'radar'], mountain: ['fort', 'radar', 'comm'] };

// ───── 生成（groundGen 呼叫；位置都在敵方半場 z＜0，另外做一份 z＞0 的給防守方是我方時用） ─────
function groundTargetGen(D, H) {
  const R = mulberry32(((D.seed ^ 0x9e3779b9) >>> 0) || 1), out = [], clear = [];
  const hAt = (x, z) => H[gIdx(x, z)];
  const ok = (x, z, r) => out.every((o) => Math.hypot(o.x - x, o.z - z) > r);
  const cf = D.extra.coastF, coast = cf ? (z) => -110 + cf[0] * Math.sin(z / cf[1]) + cf[2] * Math.sin(z / cf[3] + cf[4]) : null;
  const land = (x, z) => !coast || x < coast(z) - 25;
  const flat = (x, z) => !D.hf || hAt(x, z) - GROUND_Y < (D.extra.A || 40) * 0.3;
  for (const half of [-1, 1]) {
    const zr = () => half * (120 + R() * 680);
    // 地面防衛部隊：戰車縱隊＋一輛防空飛彈車
    const nG = D.scene === 'harbor' ? 4 : 6;
    for (let k = 0, tries = 0; k < nG && tries < 300; tries++) {
      const x = (R() - 0.5) * 1300, z = zr(); if (!land(x, z) || !flat(x, z) || !ok(x, z, 60)) continue;
      const hd = R() * TAU, n = 4 + Math.floor(R() * 3);
      for (let m = 0; m < n; m++) {
        const vx = x + Math.sin(hd) * m * 0.4 + (R() - 0.5) * 0.15, vz = z + Math.cos(hd) * m * 0.4 + (R() - 0.5) * 0.15, sam = m === n - 1;
        out.push({ kind: 'unit', sub: sam ? 'sam' : 'tank', name: sam ? '防空飛彈車' : '戰車', x: vx, y: hAt(vx, vz), z: vz, hd, hp: sam ? 14 : 18, r: 0.6, hh: 0.03, aa: sam ? 'sam' : null, half });
        clear.push({ x: vx, z: vz, r: 0.5 });
      }
      k++;
    }
    // 停在地面的戰機：基地的停機坪（兩排）
    if (D.scene === 'base') for (const [sx, sz] of (D.extra.sites || []).filter(([x, z]) => z * half > 60 && Math.abs(x) < 800).slice(0, 4)) {
      const hd = R() < 0.5 ? 0 : Math.PI / 2, ox = sx + 18, oz = sz + 18;
      for (let row = 0; row < 2; row++) for (let m = 0; m < 6; m++) {
        const px = ox + (hd ? row * 0.35 : m * 0.25), pz = oz + (hd ? m * 0.25 : row * 0.35);
        out.push({ kind: 'plane', sub: 'plane', name: '戰機', x: px, y: GROUND_Y, z: pz, hd: hd + Math.PI, hp: 8, r: 0.55, hh: 0.02, half });
        clear.push({ x: px, z: pz, r: 0.3 });
      }
    }
    // 港口的軍艦：停在岸邊的、在外海的
    if (coast) for (let k = 0, tries = 0; k < 8 && tries < 200; tries++) {
      const z = zr(), x = k < 4 ? coast(z) + 5 + R() * 8 : coast(z) + 60 + R() * 380; if (!ok(x, z, 20)) continue;
      out.push({ kind: 'navy', sub: 'ship', name: R() < 0.5 ? '驅逐艦' : '巡防艦', x, y: GROUND_Y, z, hd: k < 4 ? 0 : R() * TAU, hp: 160, r: 1.1, hh: 0.15, aa: 'navy', half });
      k++;
    }
    // 特定建築物
    const tps = GT_SCENE_BLDG[D.scene];
    for (let k = 0, tries = 0; k < tps.length && tries < 400; tries++) {
      const x = (R() - 0.5) * 1100, z = half * (200 + R() * 550); if (!land(x, z) || !ok(x, z, 140) || gZoneMask(x, z) > 0.5) continue;
      if (D.scene === 'mountain' && !flat(x, z)) continue;
      const T = GT_BLDG[tps[k]];
      out.push({ kind: 'bldg', sub: tps[k], name: T.name, x, y: hAt(x, z), z, hd: 0, hp: T.hp, r: Math.max(T.w, T.d) / 2 + 0.4, hh: T.h / 2, aa: T.aa || null, half });
      clear.push({ x, z, r: Math.max(T.w, T.d) / 2 + 1 });
      k++;
    }
  }
  D.gtDefs = out; D.clear = (D.clear || []).concat(clear);
}
// ───── 執行期 ─────
function gtDead(g) { return g.tu ? g.tu.hp <= 0 : g.hp <= 0; }
function gtHp(g) { return g.tu ? g.tu.hp / TURRET_RULE.hp : g.hp / g.max; }
// setGround 呼叫：照防守方建立這一場的地面目標（砲台也包進來，駕駛模式才有）
function groundTargetsInit(D, def) {
  if (def < 0) return [];
  const half = def === 1 ? -1 : 1;
  const L = D.gtDefs.filter((o) => o.half === half).map((o) => ({ ...o, side: def, max: o.hp, cd: 1 + Math.random() * 3, deadT: -1 }));
  for (const tu of GRD.tur) L.push({ kind: 'aa', sub: 'turret', name: '防空砲台', x: tu.x, y: tu.y, z: tu.z, hd: 0, r: 1.3, hh: 1.2, aa: 'turret', side: tu.side, tu, cd: 1 + tu.k * 0.3, deadT: -1 });
  L.forEach((g, i) => (g.id = i));
  return L;
}
// 玩家的武器打中地面目標（processHits 的 'gt'）
function groundTargetHit(e) {
  const g = GRD && GRD.gts && GRD.gts[e.gi]; if (!g || gtDead(g)) return;
  if (g.tu) { turretHit({ k: g.tu.k, dmg: e.dmg * GT_TURRET_MUL, x: e.x, y: e.y, z: e.z, side: e.side }); if (e.pl) groundTargetCredit(g, e.dmg, gtDead(g), e.pl); return; }
  g.hp -= e.dmg;
  if (plRnd() < 0.5) spawnFx(e.x, e.y, e.z, e.side, g.kind === 'navy' || g.kind === 'bldg' ? 1.2 : 0.5, 24);
  const kill = g.hp <= 0;
  if (kill) {
    g.hp = 0; g.deadT = U.uTime.value;
    const big = g.kind === 'navy' || g.kind === 'bldg';
    spawnFx(g.x, g.y + g.hh, g.z, g.side, big ? 3.5 : 1.2, 22);
    groundScar(g.x, g.y, g.z, big ? 2 : 0.5);
    if (big || plRnd() < 0.3) groundPlume(g.x, g.z, U.uTime.value, big ? 120 : 40, big ? 9 : 3, big ? 1.4 : 0.8);
  }
  if (e.pl) groundTargetCredit(g, e.dmg, kill, e.pl);
  if (CAP.on) capCreditG(g, e.dmg, kill);   // 艦長：戰果、任務進度
}
function groundTargetCredit(g, dmg, kill, wid) {
  const S = PL.stats; if (!S) return;
  if (PILOT_WEAPONS[wid]) S.wxp[wid] = (S.wxp[wid] || 0) + dmg * PILOT_PROF_XP.dmg + (kill ? 8 : 0);
  PL.hitT = U.uTime.value; S.hits++;
  const n = performance.now();
  if (kill) PL.pop = { t: n, txt: 'DESTROYED', sub: `摧毀 ${g.name}`, big: true };
  else if (!(PL.pop && PL.pop.big && n - PL.pop.t < 900)) PL.pop = { t: n, txt: 'HIT', sub: '', big: false };
  if (!kill) return;
  S.kg = (S.kg || 0) + 1; S.merit += GT_KIND[g.kind].merit;
  const M = PL.mis, mt = M && M.gts && M.gts.includes(g.id);
  pilotFeed(`摧毀${mt ? '指定目標・' : ''}${g.name}`, 'kill');
}
// 地面目標對玩家開火（每 tick；駕駛模式）
const _gq = new THREE.Vector3();
function groundPilotAA(dt) {
  if (!PL.on || PL.dead || PL.dock || PL.spec || !GRD.gts) return;
  const j = PL.j, px = fP[j * 3], py = fP[j * 3 + 1], pz = fP[j * 3 + 2], t = U.uTime.value;
  for (const g of GRD.gts) {
    if (!g.aa || g.side === PL.side || gtDead(g)) continue;
    g.cd -= dt; if (g.cd > 0) continue;
    const A = GT_AA[g.aa], mx = g.x, my = g.y + g.hh * 2 + 0.05, mz = g.z, d = Math.hypot(px - mx, py - my, pz - mz);
    if (d > A.range) { g.cd = 0.5 + plRnd() * 0.5; continue; }
    if (pilotEcmHides({ a: 1, i: j }, mx, my, mz) || rockBlock(mx, my, mz, px, py, pz) >= 0) { g.cd = 0.4; continue; }
    g.cd = A.cd * (0.8 + plRnd() * 0.4);
    const tf = d / A.spd, hit = plRnd() < A.acc;
    _gq.set(px + fV[j * 3] * tf, py + fV[j * 3 + 1] * tf, pz + fV[j * 3 + 2] * tf);   // 預測位置（玩家改變航向就閃得過）
    const ex = _gq.x + (hit ? 0 : (plRnd() - 0.5) * 12), ey = _gq.y + (hit ? 0 : (plRnd() - 0.3) * 8), ez = _gq.z + (hit ? 0 : (plRnd() - 0.5) * 12);
    const L = Math.hypot(ex - mx, ey - my, ez - mz);
    spawnBeam(mx, my, mz, ex, ey, ez, t, tf, g.side, A.type === 'sam' ? 1.1 : 0.55, A.type === 'sam' ? Math.min(1, 2.5 / L) : Math.min(0.3, 6 / L), SIDE_FAC[g.side]);
    if (hit) pending.push({ kind: 'ak', a: 1, t: t + tf, i: j, dmg: A.dmg, side: g.side, sx: mx, sy: my, sz: mz, px: _gq.x, py: _gq.y, pz: _gq.z });
    if (A.type === 'sam' && t - (PL.samT || -9) > 3) { PL.samT = t; pilotFeed('防空飛彈來襲！轉向閃避', 'bad'); }
  }
}
// ───── 射線：一般建築與地面（玩家的子彈、光矛） ─────
function bldHAt(B, i) { const h = B.iB[i * 4]; return B.ic.array[i * 4 + 1] >= 0 ? h * 0.12 : h; }
// 從 (ox, oy, oz) 沿 D 走到 maxS：先碰到地面（k＝'gr'）或一般建築（k＝'b'，i＝建築編號）就回傳；都沒有＝null
function groundRay(ox, oy, oz, D, maxS) {
  if (!GRD) return null;
  const top = Math.max(GRD.maxY, GV.bldTop || GROUND_Y) + 0.05;
  let t0 = 0, t1 = maxS;
  if (Math.abs(D[1]) > 1e-6) { const tc = (top - oy) / D[1]; if (oy > top) { if (D[1] >= 0) return null; t0 = tc; } else if (D[1] > 0) t1 = Math.min(t1, tc); }
  else if (oy > top) return null;
  if (t1 <= t0) return null;
  const B = GV.key === GRD.key ? GV.bld : null;
  let lastKey = null, cand = null;
  for (let s = t0; s <= t1; s += 0.2) {
    const x = ox + D[0] * s, y = oy + D[1] * s, z = oz + D[2] * s;
    if (y < terrainHAt(x, z)) return { s, k: 'gr', i: -1 };
    if (!B || y > GV.bldTop) continue;
    const key = Math.floor(x / 10) * 4099 + Math.floor(z / 10);
    if (key !== lastKey) { lastKey = key; cand = B.idx.get(key); }
    if (cand) for (const i of cand) {
      const h = bldHAt(B, i), y0 = B.ic.array[i * 4 + 2]; if (h <= 0 || y < y0 || y > y0 + h) continue;
      if (Math.abs(x - B.iA[i * 4]) <= B.iA[i * 4 + 2] / 2 && Math.abs(z - B.iA[i * 4 + 1]) <= B.iA[i * 4 + 3] / 2) return { s, k: 'b', i };
    }
  }
  return null;
}
// 射線：最先碰到的敵方地面目標（球形判定，判定半徑比模型大，好打一點）
function groundTargetRay(ox, oy, oz, D, best, es) {
  if (!GRD || !GRD.gts) return null;
  let hit = null;
  for (const g of GRD.gts) {
    if (g.side !== es || gtDead(g)) continue;
    const qx = g.x - ox, qy = g.y + g.hh - oy, qz = g.z - oz, s = qx * D[0] + qy * D[1] + qz * D[2];
    if (s <= 0 || s - g.r > best) continue;
    const p2 = qx * qx + qy * qy + qz * qz - s * s; if (p2 > g.r * g.r) continue;
    const sh = Math.max(0.01, s - Math.sqrt(g.r * g.r - p2)); if (sh < best) { best = sh; hit = { s: sh, k: 'g', i: g.id }; }
  }
  return hit;
}
// 玩家機體撞上地面、一般建築、巨型結構：回傳修正後的位置與傷害（沒撞＝null）
function groundPilotCollide(px, py, pz) {
  let dmg = 0;
  for (const p of GRD.pil) {
    const dx = px - p.x, dz = pz - p.z, d = Math.hypot(dx, dz), R = p.r + 0.3;
    if (d < R && py < p.top) { px = p.x + dx / (d || 1) * R; pz = p.z + dz / (d || 1) * R; dmg = 15; }
  }
  const gh = terrainHAt(px, pz) + 0.02;
  if (py < gh) { py = gh; dmg = 20; }
  const B = GV.key === GRD.key ? GV.bld : null;
  if (B && py < GV.bldTop) {
    const L = B.idx.get(Math.floor(px / 10) * 4099 + Math.floor(pz / 10));
    if (L) for (const i of L) {
      const h = bldHAt(B, i), y0 = B.ic.array[i * 4 + 2]; if (h <= 0 || py > y0 + h) continue;
      if (Math.abs(px - B.iA[i * 4]) <= B.iA[i * 4 + 2] / 2 && Math.abs(pz - B.iA[i * 4 + 1]) <= B.iA[i * 4 + 3] / 2) { py = y0 + h + 0.02; dmg = 20; break; }
    }
  }
  return dmg ? [px, py, pz, dmg] : null;
}
// 飛向地面目標的魚雷（PL.msl 的項目，m.gt＝目標編號）
function groundMissileStep(m, dt, t) {
  const g = GRD && GRD.gts && GRD.gts[m.gt], x0 = m.x, y0 = m.y, z0 = m.z;
  m.life -= dt;
  if (g && !gtDead(g)) {
    const ms = Math.hypot(m.vx, m.vy, m.vz), D = v3.norm([g.x - m.x, g.y + g.hh - m.y, g.z - m.z]), V = v3.norm([m.vx, m.vy, m.vz]);
    const ang = Math.acos(Math.max(-1, Math.min(1, v3.dot(V, D)))), tr = 2.5 * dt;
    const N = ang > tr ? v3.rot(V, v3.norm(v3.cross(V, D)), tr) : D;
    m.vx = N[0] * ms; m.vy = N[1] * ms; m.vz = N[2] * ms;
  }
  m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
  if ((m.n++ & 1) === 0) spawnBeam(x0, y0, z0, m.x, m.y, m.z, t, 0.18, PL.side, 0.9, 1.0, shipFac(PL.home >= 0 ? PL.home : 0));
  if (g && !gtDead(g) && Math.hypot(g.x - m.x, g.y + g.hh - m.y, g.z - m.z) < Math.max(0.8, g.r)) { pending.push({ kind: 'gt', t, gi: g.id, dmg: m.dmg, side: PL.side, pl: m.W.id, x: m.x, y: m.y, z: m.z }); spawnFx(m.x, m.y, m.z, PL.side, 2.4, 24); return true; }
  if (m.life <= 0 || m.y < terrainHAt(m.x, m.z)) { spawnFx(m.x, m.y, m.z, PL.side, 2, 24); groundScar(m.x, terrainHAt(m.x, m.z), m.z, 0.8); return true; }
  return false;
}
// ───── 任務 ─────
function groundStrikeInit(M) {
  const L = (GRD && GRD.gts || []).filter((g) => g.kind === M.kind && g.side !== PL.side && !gtDead(g));
  for (let k = L.length - 1; k > 0; k--) { const j = Math.floor(plRnd() * (k + 1)); [L[k], L[j]] = [L[j], L[k]]; }
  if (M.kind === 'unit') L.sort((a, b) => (b.aa ? 1 : 0) - (a.aa ? 1 : 0) || 0);   // 車隊：防空飛彈車也在名單裡
  M.gts = L.slice(0, M.goal).map((g) => g.id); M.goal = M.gts.length;
  return M.gts.length > 0;
}
function groundStrikeTick(M) { M.prog = M.gts.filter((i) => gtDead(GRD.gts[i])).length; }
// ───── 畫面：地面目標的模型、每幀的毀損與下沉 ─────
function groundTargetMesh(g) {
  const G = gbNew(), sc = new THREE.Color(FACTION[SIDE_FAC[g.side]].ui), ac = [sc.r * 1.2, sc.g * 1.2, sc.b * 1.2];
  const box = (x, z, w, d, h, y0, col, win = 0) => gbBox(G, { x, z, w, d, h, y0, col, win });
  if (g.sub === 'tank') { box(0, 0, 0.06, 0.11, 0.025, 0, [0.16, 0.18, 0.12]); box(0, -0.005, 0.042, 0.048, 0.02, 0.025, [0.18, 0.2, 0.13]); box(0, 0.045, 0.008, 0.06, 0.008, 0.032, [0.12, 0.13, 0.1]); box(0, -0.03, 0.062, 0.012, 0.004, 0.045, ac); }
  else if (g.sub === 'sam') { box(0, 0, 0.06, 0.12, 0.028, 0, [0.16, 0.18, 0.12]); box(-0.012, -0.01, 0.016, 0.08, 0.016, 0.034, [0.3, 0.3, 0.28]); box(0.012, -0.01, 0.016, 0.08, 0.016, 0.034, [0.3, 0.3, 0.28]); box(0, 0.045, 0.062, 0.012, 0.004, 0.028, ac); }
  else if (g.sub === 'plane') { box(0, 0, 0.012, 0.1, 0.012, 0.004, [0.42, 0.44, 0.47]); box(0, -0.005, 0.09, 0.028, 0.004, 0.008, [0.38, 0.4, 0.43]); box(0, -0.045, 0.035, 0.012, 0.004, 0.01, [0.38, 0.4, 0.43]); box(0, -0.045, 0.004, 0.012, 0.022, 0.01, ac); }
  else if (capTargetGeo(G, g, box, ac)) { /* 艦長模式的單位（captain.js） */ }
  else if (g.sub === 'ship') {
    box(0, 0, 0.2, 1.1, 0.1, -0.05, [0.24, 0.26, 0.29]); box(0, 0.48, 0.1, 0.14, 0.1, -0.05, [0.24, 0.26, 0.29]);
    box(0, -0.12, 0.13, 0.28, 0.12, 0.05, [0.33, 0.35, 0.38], 5); box(0, -0.12, 0.08, 0.12, 0.08, 0.17, [0.33, 0.35, 0.38]);
    gbCyl(G, 0, 0.25, -0.12, 0.012, 0.18, [0.4, 0.4, 0.42], 6);
    for (const z of [0.3, 0.16, -0.38]) { gbCyl(G, 0, 0.05, z, 0.035, 0.03, [0.3, 0.32, 0.35], 8); box(0, z + 0.05, 0.01, 0.07, 0.01, 0.065, [0.2, 0.2, 0.22]); }
    box(0, -0.02, 0.21, 0.04, 0.012, 0.05, ac);
  } else {
    const T = GT_BLDG[g.sub], W = T.w, Dd = T.d, Hh = T.h;
    if (g.sub === 'comm') { box(0, 0, 1.4, 1.4, 0.5, 0, [0.25, 0.25, 0.27]); gbCyl(G, 0, 0.5, 0, 0.25, Hh - 0.5, [0.45, 0.3, 0.25], 8); for (let y = 1.5; y < Hh; y += 1.6) gbCyl(G, 0, y, 0, 0.5, 0.15, [0.5, 0.5, 0.52], 10); }
    else if (g.sub === 'fuel') { for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gbCyl(G, x, 0, z, 0.8, Hh, [0.5, 0.5, 0.48], 14); }
    else if (g.sub === 'radar') { box(0, 0, W, Dd, Hh, 0, [0.28, 0.28, 0.3]); gbDome(G, 0, Hh, 0, 1.1, [0.65, 0.65, 0.63], 16, 6); }
    else if (g.sub === 'power') { box(0, 0, W, Dd, Hh, 0, [0.3, 0.29, 0.27], 9); gbCyl(G, -1.2, Hh, 0, 0.32, 2.4, [0.38, 0.36, 0.34], 10); gbCyl(G, 1.2, Hh, 0, 0.32, 2.4, [0.38, 0.36, 0.34], 10); }
    else { box(0, 0, W, Dd, Hh, 0, g.sub === 'fort' ? [0.2, 0.2, 0.19] : [0.3, 0.32, 0.36], 11); box(0, 0, W * 0.5, Dd * 0.5, Hh * 0.3, Hh, [0.28, 0.3, 0.34], 13); }
    box(0, 0, W + 0.06, Dd + 0.06, 0.05, Hh * 0.8, ac);   // 陣營色的標線
  }
  const m = gbMesh(G, GV.gtMat); m.position.set(g.x, g.y, g.z); m.rotation.y = g.hd || 0;
  return m;
}
function groundTargetsSync() {
  if (GV.gtMeshes) for (const m of GV.gtMeshes) if (m) { GV.group.remove(m); m.geometry.dispose(); }
  GV.gtMeshes = [];
  if (!GRD || !GRD.gts) return;
  if (!GV.gtMat || GV.gtMatKey !== GRD.key) { GV.gtMat = groundMat(GRD.S.pal); GV.gtMatKey = GRD.key; }
  for (const g of GRD.gts) { if (g.tu) { GV.gtMeshes.push(null); continue; } const m = groundTargetMesh(g); GV.group.add(m); GV.gtMeshes.push(m); }
}
function groundTargetsFrame() {
  if (!GRD || !GRD.gts || !GV.gtMeshes) return;
  const t = U.uTime.value;
  GRD.gts.forEach((g, i) => {
    const m = GV.gtMeshes[i]; if (!m) return;
    if (!gtDead(g)) { m.visible = true; if (g.mv) { m.position.set(g.x, g.y, g.z); m.rotation.y = g.hd || 0; } return; }
    if (g.kind === 'navy') { const a = Math.min(1, (t - g.deadT) / 25); m.visible = a < 1; m.position.y = g.y - a * 0.4; m.rotation.z = a * 0.35; return; }   // 軍艦：慢慢傾斜下沉
    m.visible = false;
  });
}
// ───── 儀表：附近的地面目標（橘色小三角）、任務指定的目標（菱形＋名稱＋距離）；雷達、羅盤 ─────
function groundPilotMarkers(g, sw, px, py, pz) {
  if (!GRD || !GRD.gts) return;
  const M = PL.mis, mt = M && M.gts ? M.gts : [];
  plFont(g, 10, false, true); g.textAlign = 'left';
  for (const G of GRD.gts) {
    if (G.side === PL.side || gtDead(G)) continue;
    const isT = mt.includes(G.id), d = Math.hypot(G.x - px, G.y + G.hh - py, G.z - pz);
    if (!isT && d > 260) continue;
    const s = sw(G.x, G.y + G.hh, G.z);
    if (isT) {
      _pb.set(G.x, G.y + G.hh, G.z);
      if (!s) { pilotEdgeArrow(g, _pb, '#ff9f40', `TGT ${Math.round(d)}`); continue; }
      g.strokeStyle = '#ff9f40'; g.lineWidth = 2; g.beginPath(); g.moveTo(s[0], s[1] - 12); g.lineTo(s[0] + 12, s[1]); g.lineTo(s[0], s[1] + 12); g.lineTo(s[0] - 12, s[1]); g.closePath(); g.stroke(); g.lineWidth = 1.5;
      plFont(g, 11, true); g.fillStyle = '#ff9f40'; g.fillText(`TGT 目標・${G.name}`, s[0] + 16, s[1] + 4); plFont(g, 10, false, true); g.fillText(String(Math.round(d)), s[0] + 16, s[1] + 17);
    } else if (s) {
      g.strokeStyle = G.aa ? 'rgba(255,90,80,.9)' : 'rgba(255,170,90,.8)'; g.beginPath(); g.moveTo(s[0] - 5, s[1] - 4); g.lineTo(s[0] + 5, s[1] - 4); g.lineTo(s[0], s[1] + 4); g.closePath(); g.stroke();
      if (d < 120) { g.fillStyle = 'rgba(255,180,120,.85)'; g.fillText(`${G.name} ${Math.round(d)}`, s[0] + 8, s[1] + 3); }
    }
  }
}
function groundPilotRadar(g, pt) {
  const M = PL.mis; if (!M || !M.gts || !GRD || !GRD.gts) return;
  for (const i of M.gts) { const G = GRD.gts[i]; if (gtDead(G)) continue; const p = pt(G.x, G.z); if (!p) continue; g.strokeStyle = '#ff9f40'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(p[0], p[1] - 5); g.lineTo(p[0] + 5, p[1]); g.lineTo(p[0], p[1] + 5); g.lineTo(p[0] - 5, p[1]); g.closePath(); g.stroke(); }
}
function groundPilotCompass(mk) {
  const M = PL.mis; if (!M || !M.gts || !GRD || !GRD.gts) return;
  for (const i of M.gts) { const G = GRD.gts[i]; if (!gtDead(G)) mk(G.x, G.z, '#ff9f40'); }
}
