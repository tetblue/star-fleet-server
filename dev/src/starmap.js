// ───── 星海生涯（STAR CAREER）：回合制星圖的資料模型（不碰畫面；畫面在 starmap_ui.js）─────
// 規則見 dev/星海生涯企劃.md。這裡的程式也給 tools/starmap-run.mjs 在 node 裡跑（只用到 SHIP_TYPES 一個外部常數）。
// 一回合＝一週。流程：玩家下令 → smTurnMove（AI 下令、所有艦隊移動、途中攔截）→ smBattles 列出戰鬥 → 玩家選擇介入方式 →
//   smResolve 逐場計算 → smTurnEnd（圍城、強攻、經濟、事件、下一回合）。
const SM_STORE = 'fleet.career1';
const SM_A = 0, SM_E = 1, SM_P = 2, SM_N = 3;   // 勢力：聯盟、帝國、海盜、中立
const SM_FAC = [
  { name: '聯盟', col: '#4a8fe0', game: 1 },
  { name: '帝國', col: '#e05a4a', game: 0 },
  { name: '海盜', col: '#c9a227', game: 2 },
  { name: '中立', col: '#8a8f98', game: -1 },
];
const SM_RULE = {
  jump: 3,            // 一道命令最多跨幾個星系（一回合走完）
  moveCost: 0.03,     // 移動費用＝跨越數 × 艦隊造價 × 這個係數
  wave: [1500, 2500, 3500],   // 每波上限（每一方的艦數），依星系的戰鬥空間：小、中、大
  intercept: 0.3,     // 途中經過有敵方艦隊的星系：被攔下的機率 × 敵方規模係數（敵方艦數 ÷ 自己，最多 1）
  siegeT: 3,          // 控制軌道幾回合後投降
  assault: 1.2,       // AI 強攻：軌道上的戰力 > 地面 × 這個倍數
  retreat: 0.2,       // AI 艦隊預設在剩下多少 % 時躍遷撤退
  charge: 1 / 3,      // 躍遷充能時損失剩下艦數的比例
  retreatOk: 0.9,     // 撤退成功率（失敗＝全滅）
  aiGiveUp: 0.25,     // AI 估計勝率低於這個值就不讓下一波進場（整場撤退）
  salvage: 0.15,      // 戰場回收：擊沉的敵艦造價 × 這個比例＝資金
  repair: 0.25,       // 戰後維修：留在戰場的一方，修回自己損失的比例
  price: 1,           // 造艦：每點造價多少資金
  upkeep: 0.02,       // 艦隊每回合維持費＝造價 × 這個比例
  overExt: 12,        // 星系超過這個數量：每多一個，收入 −3%（最多 −50%），而且不滿的星系可能叛變
  rebel: 0.03,        // 每多一個星系，每回合叛變的機率
  incMul: 7,          // 星系收入倍率
  garCost: 0.5,       // 守軍每點的價格
};
// 戰力公式（tools/powerfit.mjs 擬合 tools/battlecal.mjs 的真實 AI 對 AI 戰鬥；改艦種數值會自動跟著變）
//   一方的優勢 x＝g·ln(攻擊比) ＋ d·ln(耐久比) ＋ lv·(指揮官等級差) ＋ fac·(陣營)；勝率＝1/(1+e^−x)
//   勝方損失＝lossA ＋ lossB ×（1 − 勝率）^lossK；敗方打到全滅，或在撤退門檻撤退
const SM_CAL = { w: { wA: 1, wM: 0, wF: 4, wS: 0.5, wR: 0 }, g: 3.22, d: 4.22, lv: 0.27, fac: 0.35, lossA: 0.05, lossB: 0.55, lossK: 1.2 };
const SM_TIER = ['荒地', '聚落', '城鎮', '都市', '巨型都市'];
const SM_TIER_CAP = [2, 4, 8, 14, 22];
const SM_MEGA = { dock: '大型船塢', elev: '軌道電梯', radar: '深空雷達', gate: '跳躍門', shield: '行星護盾' };
const SM_SIZE = ['小', '中', '大'];
const SM_NAMES = ['阿爾泰', '貝倫', '卡斯托', '德米亞', '埃里多', '法洛斯', '蓋亞斯', '赫利恩', '伊歐拉', '賈納斯', '凱倫', '莉薇拉', '摩頓', '諾瓦', '奧利昂', '佩拉', '奎林', '瑞亞', '賽洛斯', '塔倫', '烏爾', '薇恩', '韋斯塔', '澤菲爾', '亞特', '布蘭', '席恩', '多拉'];
const SM_CMDR = ['巴爾克', '霍斯特', '佩蕾', '格倫', '奧德', '薇拉', '卡蘭', '索恩', '伊格', '莫蘭', '黛菈', '雷文', '芙蕾', '戈爾', '尤里', '艾德', '娜塔', '羅森', '維克', '琳恩', '馬可', '希爾', '杜克', '艾莎'];
const SM_TAC = ['push', 'kite', 'flank', 'breakthrough'];
// 艦隊類型（各艦種比例：航母、戰列、巡洋、驅逐、護衛、補給）
const SM_ARCH = [
  { name: '主力艦隊', mix: [0.04, 0.12, 0.26, 0.3, 0.28, 0] },
  { name: '航母打擊群', mix: [0.12, 0.06, 0.2, 0.3, 0.32, 0] },
  { name: '快速艦隊', mix: [0, 0.04, 0.2, 0.4, 0.36, 0] },
  { name: '重裝艦隊', mix: [0.03, 0.22, 0.3, 0.25, 0.2, 0] },
];

/* ───── 亂數（狀態存在 S.r：複製狀態＝可重現）───── */
function smRnd(S) { let t = (S.r = (S.r + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const smPick = (S, a) => a[Math.floor(smRnd(S) * a.length)];
const smClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smR1 = (v) => Math.round(v * 10) / 10;

/* ───── 艦種戰力（從 SHIP_TYPES 的數值算，和 powerfit 一樣）───── */
let _smShipV = null;
function smShipV() {
  if (_smShipV) return _smShipV;
  const w = SM_CAL.w, dps = (g) => (g ? g.dmg / g.cd * g.acc : 0);
  _smShipV = SHIP_TYPES.slice(0, 6).map((t) => {
    const a = dps(t.guns.main) + dps(t.guns.sec) + w.wA * dps(t.guns.aa) + w.wM * (t.missile ? t.missile.dmg * t.missile.n : 0) + w.wF * (t.fighters ? t.fighters.n : 0);
    const d = t.hp + w.wS * t.sh + w.wR * (t.repair ? t.repair.n * t.repair.amount / t.repair.cd : 0) * 100;
    return { a, d, cost: t.cost, name: t.name };
  });
  const e = _smShipV[4], ev = Math.sqrt(e.a * e.d);
  for (const v of _smShipV) v.v = Math.sqrt(v.a * v.d) / ev;   // 戰力值：護衛艦＝1
  return _smShipV;
}
const smShips = (c) => c.reduce((a, n) => a + n, 0);
const smCost = (c) => c.reduce((a, n, t) => a + n * smShipV()[t].cost, 0);
const smVal = (c) => c.reduce((a, n, t) => a + n * smShipV()[t].v, 0);   // 戰力值（護衛艦＝1）
const smAtk = (c) => c.reduce((a, n, t) => a + n * smShipV()[t].a, 0);
const smDur = (c) => c.reduce((a, n, t) => a + n * smShipV()[t].d, 0);
const smAdd = (a, b, k = 1) => a.map((n, t) => n + b[t] * k);
const smScale = (c, k) => c.map((n) => Math.max(0, Math.round(n * k)));

/* ───── 地圖 ───── */
function smAdj(S, i) { return S.adj[i]; }
function smGenMap(S) {
  const pts = []; let minD = 12, tries = 0;
  while (pts.length < 26) { tries++; if (tries % 3000 === 0) minD -= 1; const x = 4 + smRnd(S) * 92, y = 4 + smRnd(S) * 52; if (pts.every((p) => Math.hypot(p.x - x, p.y - y) > minD)) pts.push({ x, y }); }
  pts.sort((a, b) => a.x - b.x);
  const E = [], has = (a, b) => E.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
  pts.forEach((p, i) => pts.map((q, j) => ({ j, d: Math.hypot(p.x - q.x, p.y - q.y) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2).forEach((o) => { if (!has(i, o.j)) E.push([i, o.j]); }));
  const adjOf = () => pts.map((_, i) => E.filter((e) => e[0] === i || e[1] === i).map((e) => (e[0] === i ? e[1] : e[0])));
  for (;;) {   // 保證連通
    const A = adjOf(), seen = new Set([0]), st = [0];
    while (st.length) { const i = st.pop(); for (const j of A[i]) if (!seen.has(j)) { seen.add(j); st.push(j); } }
    if (seen.size === pts.length) break;
    let best = null;
    for (const i of seen) for (let j = 0; j < pts.length; j++) if (!seen.has(j)) { const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y); if (!best || d < best.d) best = { i, j, d }; }
    E.push([best.i, best.j]);
  }
  S.edges = E; S.adj = adjOf();
  const n = pts.length, mid = Array.from({ length: n - 18 }, (_, k) => k + 9);   // 左 9 個聯盟、右 9 個帝國、中間海盜與中立
  for (let i = mid.length - 1; i > 0; i--) { const j = Math.floor(smRnd(S) * (i + 1)); [mid[i], mid[j]] = [mid[j], mid[i]]; }
  const names = SM_NAMES.slice();
  S.sys = pts.map((p, i) => {
    const owner = i < 9 ? SM_A : i >= n - 9 ? SM_E : mid.indexOf(i) < 4 ? SM_P : SM_N, cap = i === 0 || i === n - 1;
    const tier = cap ? 3 : owner === SM_N || owner === SM_P ? 1 : 1 + (smRnd(S) < 0.4 ? 1 : 0);
    const name = names.splice(Math.floor(smRnd(S) * names.length), 1)[0];
    const wx = { k: smPick(S, ['solar', 'ion', 'grav']), per: 6 + Math.floor(smRnd(S) * 7), len: 2, ph: Math.floor(smRnd(S) * 12) };   // 週期性天氣（第 5 階段才有效果）
    return { id: i, name, x: p.x, y: p.y, owner, cap, tier, pop: cap ? 12 : smR1(SM_TIER_CAP[tier] * (0.5 + smRnd(S) * 0.4)), prosp: cap ? 70 : 35 + Math.round(smRnd(S) * 20),
      def: cap ? 6 : owner === SM_N ? 1 : 2 + Math.floor(smRnd(S) * 3), gar: cap ? 400 : owner === SM_N ? 60 : 120, mega: cap ? { dock: 1, shield: 1 } : {},
      size: cap ? 2 : Math.floor(smRnd(S) * 3), sg: null, hit: -99, wx };
  });
  // 中間的大型星系有船塢（雙方各一個前線造艦點）
  for (const f of [SM_A, SM_E]) { const c = S.sys.filter((s) => s.owner === f && !s.cap && s.tier >= 2)[0] || S.sys.find((s) => s.owner === f && !s.cap); if (c) c.mega.dock = 1; }
}
// 最短路徑（跨越數）：can(s)＝能不能經過這個星系
function smPath(S, from, to, can) {
  if (from === to) return [from];
  const prev = new Map([[from, -1]]), q = [from];
  while (q.length) {
    const i = q.shift();
    for (const j of S.adj[i]) if (!prev.has(j) && (j === to || !can || can(S.sys[j]))) { prev.set(j, i); if (j === to) { const p = [to]; let k = i; while (k !== -1) { p.unshift(k); k = prev.get(k); } return p; } q.push(j); }
  }
  return null;
}

/* ───── 新局 ───── */
function smNewFleet(S, fac, sys, comp, o = {}) {
  const f = { id: S.nextId++, fac, sys, comp: comp.slice(), init: comp.slice(), name: o.name || `${SM_FAC[fac].name}第${S.nextId}艦隊`, arch: o.arch || 0,
    cmdr: o.cmdr || { name: smPick(S, SM_CMDR), lv: 1 + Math.floor(smRnd(S) * 3), tac: smPick(S, SM_TAC) }, pl: !!o.pl, retreat: o.retreat != null ? o.retreat : SM_RULE.retreat, path: null, lock: false, home: sys };
  S.fleets.push(f); return f;
}
function smArchComp(arch, ships) { return SM_ARCH[arch].mix.map((x) => Math.round(ships * x)); }
function smNewGame(o = {}) {
  const S = { v: 1, r: (o.seed >>> 0) || 1, turn: 1, diff: o.diff || 1, nextId: 1, sys: [], edges: [], adj: [], fleets: [], log: [], reports: [], pend: null,
    fac: [0, 1, 2, 3].map((f) => ({ money: f === SM_P ? 300 : 800, ww: 0 })), rel: [[0, -60, -100, 0], [-60, 0, -100, 0], [-100, -100, 0, 0], [0, 0, 0, 0]],
    pl: { fac: SM_A, money: 400, merit: 0, fleets: [], dead: 0, autoWatch: false }, st: { cap: [0, 0, 0, 0], battles: 0, plBattles: 0 } };
  smGenMap(S);
  // 開局艦隊：兩大勢力各 6 支（首都 2、其餘分散在前線），海盜 3 支
  for (const f of [SM_A, SM_E, SM_P]) {
    const my = S.sys.filter((s) => s.owner === f), cap = my.find((s) => s.cap) || my[0];
    const front = my.filter((s) => S.adj[s.id].some((j) => S.sys[j].owner !== f));
    const n = f === SM_P ? 3 : f === SM_A ? 4 : 6;   // 聯盟的 6 支裡有 2 支是玩家的
    for (let k = 0; k < n; k++) {
      const at = f === SM_P ? my[k % my.length] : k < 2 ? cap : front[k % Math.max(1, front.length)] || cap;
      const arch = f === SM_P ? 2 : Math.floor(smRnd(S) * SM_ARCH.length), ships = f === SM_P ? 220 + Math.floor(smRnd(S) * 80) : 380 + Math.floor(smRnd(S) * 120);
      smNewFleet(S, f, at.id, smArchComp(arch, ships), { arch, retreat: SM_RULE.retreat + (smRnd(S) - 0.5) * 0.1 });
    }
  }
  // 玩家：聯盟的艦隊指揮官，帶兩支艦隊從前線出發
  const front = S.sys.filter((s) => s.owner === SM_A && S.adj[s.id].some((j) => S.sys[j].owner !== SM_A)).sort((a, b) => b.x - a.x)[0] || S.sys[0];
  for (let k = 0; k < 2; k++) {
    const f = smNewFleet(S, SM_A, front.id, smArchComp(k ? 2 : 0, 400), { arch: k ? 2 : 0, pl: true, name: k ? '第二分艦隊' : '第一分艦隊', cmdr: { name: k ? '副官' : '你', lv: 2, tac: 'push' } });
    S.pl.fleets.push(f.id);
  }
  smLog(S, `你奉命指揮兩支分艦隊，駐守前線的 ${front.name}`, 'ev');
  return S;
}
function smLog(S, t, c) { S.log.push({ turn: S.turn, t, c: c || '' }); if (S.log.length > 400) S.log.splice(0, S.log.length - 400); }

/* ───── 查詢 ───── */
const smOwned = (S, f) => S.sys.filter((s) => s.owner === f);
const smAtWar = (S, a, b) => a !== b && a !== SM_N && b !== SM_N && S.rel[a][b] < 0;
const smHostileSys = (S, f, s) => s.owner !== f && (s.owner === SM_N || smAtWar(S, f, s.owner));   // 可以進攻的星系（中立可以被佔領）
const smFleetsAt = (S, sid) => S.fleets.filter((f) => f.sys === sid && smShips(f.comp) > 0);
const smPlFleets = (S) => S.fleets.filter((f) => f.pl && smShips(f.comp) > 0);
const smSysIncome = (s) => s.pop * (0.4 + s.prosp / 100) * 0.6 * (s.mega.elev ? 1.15 : 1) * (s.sg ? 0 : 1) * SM_RULE.incMul;
const smGround = (s) => (s.gar + s.def * 60) * (s.mega.shield ? 1.5 : 1);   // 地面戰力（戰力值單位）
const smFacVal = (S, f) => S.fleets.filter((o) => o.fac === f).reduce((a, o) => a + smVal(o.comp), 0);
const smFront = (S, s) => S.adj[s.id].some((j) => S.sys[j].owner !== s.owner);
function smEnemyAt(S, fac, sid) { return smFleetsAt(S, sid).filter((o) => smAtWar(S, fac, o.fac)); }

/* ───── 移動 ───── */
// 玩家：計算命令（路徑、費用、會不會引發戰鬥）；不改狀態
function smPlanMove(S, fl, to) {
  const path = smPath(S, fl.sys, to, null);
  if (!path) return { ok: false, why: '沒有航道可以到達' };
  const hops = path.length - 1;
  if (hops > SM_RULE.jump) return { ok: false, why: `太遠了：要跨 ${hops} 個星系（一道命令最多 ${SM_RULE.jump} 個）`, path, hops };
  const cost = Math.round(hops * smCost(fl.comp) * SM_RULE.moveCost);
  const mid = path.slice(1, -1).filter((i) => smEnemyAt(S, fl.fac, i).length);
  const dest = S.sys[to], fight = smEnemyAt(S, fl.fac, to).length > 0 || smHostileSys(S, fl.fac, dest);
  return { ok: true, path, hops, cost, mid, fight };
}
function smOrder(S, fl, to) {
  const P = smPlanMove(S, fl, to);
  if (!P.ok) return P;
  if (S.pl.money < P.cost) return { ok: false, why: `資金不足（要 ${P.cost}）` };
  S.pl.money -= P.cost; fl.path = P.path; fl.lock = P.fight || P.mid.length > 0;   // 會引發戰鬥的命令：不能撤銷
  return P;
}
function smCancel(S, fl) {
  if (!fl.path || fl.lock) return false;
  S.pl.money += Math.round((fl.path.length - 1) * smCost(fl.comp) * SM_RULE.moveCost); fl.path = null; return true;
}
// 所有艦隊同時移動；經過有敵方艦隊的星系時有機率被攔下
function smMoveAll(S) {
  for (const f of S.fleets) {
    if (!f.path || smShips(f.comp) <= 0) { f.path = null; continue; }
    const p = f.path; f.path = null; f.lock = false;
    for (let k = 1; k < p.length; k++) {
      f.sys = p[k];
      if (k === p.length - 1) break;
      const en = smEnemyAt(S, f.fac, p[k]); if (!en.length) continue;
      const ratio = Math.min(1, en.reduce((a, o) => a + smShips(o.comp), 0) / Math.max(1, smShips(f.comp)));
      if (smRnd(S) < SM_RULE.intercept * ratio) { f.icp = true; if (f.pl) smLog(S, `${f.name} 途經 ${S.sys[p[k]].name} 時被敵軍攔截`, 'bad'); break; }
    }
  }
}

/* ───── 戰鬥（計算）───── */
function smWinP(c0, c1, lv0, lv1, fac0, fac1) {
  const C = SM_CAL, A0 = smAtk(c0), A1 = smAtk(c1), D0 = smDur(c0), D1 = smDur(c1);
  if (A1 <= 0 || D1 <= 0) return 1; if (A0 <= 0 || D0 <= 0) return 0;
  const fx = (f) => (SM_FAC[f].game === 1 ? 1 : SM_FAC[f].game === 0 ? -1 : 0);
  const x = C.g * Math.log(A0 / A1) + C.d * Math.log(D0 / D1) + C.lv * (lv0 - lv1) + C.fac * (fx(fac0) - fx(fac1)) / 2;
  return 1 / (1 + Math.exp(-x));
}
const smLv = (fs) => { let n = 0, s = 0; for (const f of fs) { const k = smShips(f.comp); n += k; s += k * f.cmdr.lv; } return n ? s / n : 1; };
// 列出這回合的戰鬥：同一個星系裡有互相交戰的艦隊
function smBattles(S) {
  const out = [];
  for (const s of S.sys) {
    const fs = smFleetsAt(S, s.id); if (fs.length < 2) continue;
    const facs = [...new Set(fs.map((f) => f.fac))];
    if (!facs.some((a) => facs.some((b) => smAtWar(S, a, b)))) continue;
    out.push({ sys: s.id, facs, pl: fs.some((f) => f.pl) });
  }
  return out;
}
// 計算一場戰鬥（星系 sid 裡所有交戰的勢力；三方以上時先打最強的一對，打完再看還有沒有敵對）
function smResolve(S, sid, how) {
  const s = S.sys[sid], rep = { turn: S.turn, sys: sid, name: s.name, how: how || 'ai', fights: [] };
  for (let guard = 0; guard < 4; guard++) {
    const fs = smFleetsAt(S, sid), facs = [...new Set(fs.map((f) => f.fac))].sort((a, b) => smFacValAt(S, sid, b) - smFacValAt(S, sid, a));
    let pair = null;
    for (const a of facs) { for (const b of facs) if (smAtWar(S, a, b)) { pair = [a, b]; break; } if (pair) break; }
    if (!pair) break;
    // 守方＝星系的主人那一方（沒有就照強弱）：列為邊 1
    if (pair[0] === s.owner) pair.reverse();
    rep.fights.push(smFight(S, s, pair[0], pair[1]));
  }
  S.st.battles++; if (rep.fights.some((F) => F.pl)) S.st.plBattles++;
  S.reports.push(rep); if (S.reports.length > 60) S.reports.splice(0, S.reports.length - 60);
  return rep;
}
const smFacValAt = (S, sid, fac) => smFleetsAt(S, sid).filter((f) => f.fac === fac).reduce((a, f) => a + smVal(f.comp), 0);
// 兩個勢力的車輪戰：每一方場上最多 cap 艘，其餘待命；每一波打完，存活的留在場上，再從待命補滿
function smFight(S, s, fa, fb) {
  const cap = SM_RULE.wave[s.size], sides = [fa, fb].map((fac) => smFleetsAt(S, s.id).filter((f) => f.fac === fac).sort((a, b) => (b.pl ? 1 : 0) - (a.pl ? 1 : 0) || smVal(b.comp) - smVal(a.comp)));
  const F = { a: fa, b: fb, pl: sides.some((L) => L.some((f) => f.pl)), start: sides.map((L) => L.reduce((c, f) => smAdd(c, f.comp), [0, 0, 0, 0, 0, 0])), fleets: sides.map((L) => L.map((f) => ({ id: f.id, name: f.name, ships: smShips(f.comp) }))), waves: [], retreated: [[], []], lost: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]] };
  const field = [[], []], wait = [sides[0].slice(), sides[1].slice()], gone = [new Set(), new Set()];
  const fill = (k) => { let n = field[k].reduce((a, f) => a + smShips(f.comp), 0); while (wait[k].length && (n < cap || !field[k].length)) { const f = wait[k].shift(); field[k].push(f); n += smShips(f.comp); } };
  for (let w = 0; w < 30; w++) {
    fill(0); fill(1);
    if (!field[0].length || !field[1].length) break;
    const c = field.map((L) => L.reduce((acc, f) => smAdd(acc, f.comp), [0, 0, 0, 0, 0, 0]));
    const n = c.map(smShips);
    // 超過每波上限的部分（單支艦隊太大）：按比例只讓 cap 艘上場
    const k = n.map((x) => (x > cap ? cap / x : 1)), cf = c.map((cc, i) => smScale(cc, k[i]));
    const p0 = smWinP(cf[0], cf[1], smLv(field[0]), smLv(field[1]), fa, fb), win = smRnd(S) < p0 ? 0 : 1, pw = win ? 1 - p0 : p0;
    const lw = smClamp(SM_CAL.lossA + SM_CAL.lossB * Math.pow(1 - pw, SM_CAL.lossK) * (0.7 + 0.6 * smRnd(S)), 0, 0.95);
    const W = { n: n.slice(), p: Math.round(p0 * 100), win, lost: [0, 0], retreat: [[], []] };
    for (const side of [0, 1]) {
      const loss = side === win ? lw : 1;   // 敗方：打到全滅或撤退
      for (const f of field[side]) {
        const kk = k[side], before = f.comp.slice(), onField = smScale(before, kk);
        const th = f.retreat || 0;
        let after;
        if (side !== win && th > 0) {   // 撤退：撐到門檻再躍遷，充能時再損失三分之一；有一定機率失敗
          const ok = smRnd(S) < SM_RULE.retreatOk;
          after = ok ? smScale(onField, th * (1 - SM_RULE.charge)) : onField.map(() => 0);
          if (ok) { W.retreat[side].push(f.name); gone[side].add(f); }
        } else if (side === win && th > 0 && 1 - loss < th) {   // 勝方的艦隊損失太重也會撤
          after = smScale(onField, th * (1 - SM_RULE.charge)); W.retreat[side].push(f.name); gone[side].add(f);
        } else after = smScale(onField, 1 - loss);
        const lost = onField.map((x, t) => x - after[t]);
        f.comp = before.map((x, t) => Math.max(0, x - lost[t]));
        F.lost[side] = smAdd(F.lost[side], lost); W.lost[side] += smShips(lost);
      }
    }
    F.waves.push(W);
    for (const side of [0, 1]) field[side] = field[side].filter((f) => smShips(f.comp) > 0 && !gone[side].has(f));
    // AI 判斷要不要讓下一波進場：估計勝率太低就整場撤退（玩家的艦隊不會自己放棄）
    for (const side of [0, 1]) {
      if (field[side].length || !wait[side].length || wait[side].some((f) => f.pl)) continue;
      const other = [...field[1 - side], ...wait[1 - side]].reduce((acc, f) => smAdd(acc, f.comp), [0, 0, 0, 0, 0, 0]);
      const mine = wait[side].reduce((acc, f) => smAdd(acc, f.comp), [0, 0, 0, 0, 0, 0]);
      if (smWinP(mine, other, smLv(wait[side]), smLv([...field[1 - side], ...wait[1 - side]]), side ? fb : fa, side ? fa : fb) < SM_RULE.aiGiveUp && !(s.cap && s.owner === (side ? fb : fa))) {
        for (const f of wait[side]) { gone[side].add(f); W.retreat[side].push(f.name); }
        wait[side] = [];
      }
    }
  }
  // 撤退的艦隊：躍遷到相鄰的己方（或不敵對）星系
  for (const side of [0, 1]) for (const f of gone[side]) {
    if (smShips(f.comp) <= 0) continue;
    const to = S.adj[s.id].map((j) => S.sys[j]).filter((t) => !smEnemyAt(S, f.fac, t.id).length).sort((a, b) => (b.owner === f.fac ? 1 : 0) - (a.owner === f.fac ? 1 : 0))[0];
    if (to) { f.sys = to.id; F.retreated[side].push(f.name); } else { F.lost[side] = smAdd(F.lost[side], f.comp); f.comp = f.comp.map(() => 0); }
  }
  // 結果：區域裡還有船的一方獲勝
  const left = [0, 1].map((side) => sides[side].filter((f) => f.sys === s.id && smShips(f.comp) > 0));
  F.win = left[0].length && !left[1].length ? 0 : left[1].length && !left[0].length ? 1 : -1;
  F.end = sides.map((L) => L.reduce((c, f) => smAdd(c, f.comp), [0, 0, 0, 0, 0, 0]));
  // 戰鬥的收穫：留在戰場的一方回收殘骸（資金）、修回部分損失
  if (F.win >= 0) {
    const wf = F.win ? fb : fa, salv = Math.round(smCost(F.lost[1 - F.win]) * SM_RULE.salvage * SM_RULE.price);
    const winners = left[F.win], plShare = winners.some((f) => f.pl);
    if (plShare) S.pl.money += salv; else S.fac[wf].money += salv;
    let rep = [0, 0, 0, 0, 0, 0];
    for (const f of winners) { const lost = f.init.map((x, t) => Math.max(0, x - f.comp[t])), fix = smScale(lost, SM_RULE.repair); f.comp = smAdd(f.comp, fix); rep = smAdd(rep, fix); }
    F.salvage = salv; F.repaired = smShips(rep); F.end = sides.map((L) => L.reduce((c, f) => smAdd(c, f.comp), [0, 0, 0, 0, 0, 0]));
  }
  // 厭戰、日誌
  for (const [fac, k] of [[fa, 0], [fb, 1]]) S.fac[fac].ww += smShips(F.lost[k]) / 200;
  const nm = (k) => SM_FAC[k ? fb : fa].name;
  if (F.pl || s.owner === S.pl.fac) smLog(S, `${s.name}：${nm(0)} 對 ${nm(1)}，${F.win < 0 ? '雙方都離開了戰場' : `${nm(F.win)}獲勝`}（損失 ${smShips(F.lost[0])}／${smShips(F.lost[1])} 艘）`, F.pl ? (F.win >= 0 && (F.win ? fb : fa) === S.pl.fac ? 'good' : 'bad') : '');
  // 玩家的艦隊全滅：記下
  for (const f of sides.flat()) if (f.pl && smShips(f.comp) <= 0) { S.pl.dead++; smLog(S, `${f.name} 全軍覆沒`, 'bad'); }
  return F;
}

/* ───── 佔領：圍城與強攻 ───── */
function smCapture(S, s, fac, how) {
  const was = s.owner;
  s.owner = fac; s.sg = null; s.hit = S.turn; s.gar = Math.max(40, s.gar * 0.3); s.prosp = smClamp(s.prosp - (how === 'assault' ? 25 : 10), 0, 100);
  if (how === 'assault') { s.def = Math.max(0, s.def - 2); if (s.tier > 1 && smRnd(S) < 0.4) s.tier--; }
  S.st.cap[fac]++;
  smLog(S, `${SM_FAC[fac].name}${how === 'assault' ? '強攻' : '圍城'}佔領 ${s.name}（原屬${SM_FAC[was].name}）`, fac === S.pl.fac ? 'good' : was === S.pl.fac ? 'bad' : '');
}
function smSiegeTick(S) {
  for (const s of S.sys) {
    const fs = smFleetsAt(S, s.id), facs = [...new Set(fs.map((f) => f.fac))].filter((f) => smHostileSys(S, f, s));
    const holder = facs.length === 1 && !fs.some((f) => f.fac === s.owner) ? facs[0] : null;
    if (holder == null) { s.sg = null; continue; }
    if (!s.sg || s.sg.f !== holder) s.sg = { f: holder, t: 0 };
    const val = fs.filter((f) => f.fac === holder).reduce((a, f) => a + smVal(f.comp), 0), G = smGround(s);
    const plHere = fs.some((f) => f.pl);
    const doAssault = plHere ? s.assault === S.turn : val > G * SM_RULE.assault;   // 玩家的艦隊在場：玩家下令才強攻
    if (doAssault) {   // 強攻：損失和地面戰力成比例
      const win = smRnd(S) < 1 / (1 + Math.pow(G / Math.max(1, val), 3));
      const lossV = G * (win ? 0.35 : 0.6);
      smLoseVal(S, fs.filter((f) => f.fac === holder), lossV);
      if (win) smCapture(S, s, holder, 'assault'); else { s.gar *= 0.7; if (plHere) smLog(S, `強攻 ${s.name} 失敗`, 'bad'); }
      continue;
    }
    s.sg.t++;
    if (s.sg.t >= SM_RULE.siegeT) smCapture(S, s, holder, 'siege');
  }
}
// 按比例扣掉一組艦隊的戰力值
function smLoseVal(S, fs, v) {
  const tot = fs.reduce((a, f) => a + smVal(f.comp), 0); if (tot <= 0) return;
  const k = Math.max(0, 1 - v / tot);
  for (const f of fs) f.comp = smScale(f.comp, k);
}

/* ───── AI ───── */
function smAiTurn(S, fac) {
  const my = smOwned(S, fac); if (!my.length) return;
  const mine = S.fleets.filter((f) => f.fac === fac && !f.pl && smShips(f.comp) > 0);
  const free = new Set(mine.filter((f) => !f.path));
  // 1. 防守：敵方艦隊在相鄰星系、而且比這裡的守軍強 → 從附近調艦隊過來（首都優先）
  const threats = my.map((s) => {
    const near = S.adj[s.id].flatMap((j) => smEnemyAt(S, fac, j)).reduce((a, f) => a + smVal(f.comp), 0) + smEnemyAt(S, fac, s.id).reduce((a, f) => a + smVal(f.comp), 0);
    const here = mine.filter((f) => f.sys === s.id).reduce((a, f) => a + smVal(f.comp), 0);
    return { s, need: near * 0.9 - here - (s.sg ? 0 : smGround(s) * 0.3) };
  }).filter((o) => o.need > 0).sort((a, b) => (b.s.cap ? 1 : 0) - (a.s.cap ? 1 : 0) || b.need - a.need);
  for (const T of threats) {
    let need = T.need;
    for (const f of [...free].sort((a, b) => smHop(S, a.sys, T.s.id) - smHop(S, b.sys, T.s.id))) {
      if (need <= 0) break;
      if (f.sys === T.s.id) { free.delete(f); need -= smVal(f.comp); continue; }
      const p = smPath(S, f.sys, T.s.id, (x) => x.owner === fac || !smEnemyAt(S, fac, x.id).length);
      if (!p || p.length - 1 > SM_RULE.jump) continue;
      f.path = p; free.delete(f); need -= smVal(f.comp);
    }
  }
  // 2. 進攻：選一個相鄰的目標，湊足兵力再出兵
  const aggr = (fac === SM_P ? 0.5 : 0.35) * (fac === S.pl.fac ? 1 : [0.75, 1, 1.25, 1.6][S.diff] || 1);
  if (smRnd(S) < aggr) {
    const tg = [...new Set(my.flatMap((s) => S.adj[s.id]))].map((i) => S.sys[i]).filter((t) => smHostileSys(S, fac, t) && !(t.sg && t.sg.f !== fac));
    const est = (t) => smEnemyAt(S, fac, t.id).reduce((a, f) => a + smVal(f.comp), 0) + smGround(t) * 0.5 + 30;
    const val = (t) => (t.pop + 3) * (t.cap ? 1.5 : 1) * (t.owner === SM_N ? 0.8 : 1) / est(t);
    const t = tg.sort((a, b) => val(b) - val(a))[smRnd(S) < 0.7 ? 0 : Math.floor(smRnd(S) * tg.length)];
    if (t) {
      const need = est(t) * 1.4, pick = []; let got = 0;
      for (const f of [...free].sort((a, b) => smHop(S, a.sys, t.id) - smHop(S, b.sys, t.id))) {
        if (got >= need) break;
        const home = S.sys[f.sys];
        if (home.cap && mine.filter((o) => o.sys === home.id).length <= 1) continue;   // 首都至少留一支
        const p = smPath(S, f.sys, t.id, (x) => x.owner === fac || !smEnemyAt(S, fac, x.id).length);
        if (!p || p.length - 1 > SM_RULE.jump) continue;
        pick.push([f, p]); got += smVal(f.comp);
      }
      if (got >= need || (got > est(t) && smRnd(S) < 0.3)) for (const [f, p] of pick) { f.path = p; free.delete(f); }
    }
  }
  // 3. 閒置的艦隊：回到最近的前線星系（沒有前線就留在原地）
  for (const f of free) {
    const s = S.sys[f.sys];
    if (s.owner === fac && smFront(S, s)) continue;
    if (s.owner !== fac && smHostileSys(S, fac, s)) continue;   // 正在圍城
    const fr = my.filter((x) => smFront(S, x)).sort((a, b) => smHop(S, f.sys, a.id) - smHop(S, f.sys, b.id))[0];
    if (fr && fr.id !== f.sys) { const p = smPath(S, f.sys, fr.id, (x) => x.owner === fac); if (p && p.length - 1 <= SM_RULE.jump) f.path = p; }
  }
}
function smHop(S, a, b) { const p = smPath(S, a, b, null); return p ? p.length - 1 : 99; }
// 經濟：收入、維持費、守軍、造艦、建設
function smEconomy(S, fac) {
  const F = S.fac[fac], my = smOwned(S, fac); if (!my.length) return;
  const inc = my.reduce((a, s) => a + smSysIncome(s), 0) * (fac !== S.pl.fac ? [0.85, 1, 1.15, 1.3][S.diff] || 1 : 1) * Math.max(0.5, 1 - 0.03 * Math.max(0, my.length - SM_RULE.overExt));   // 過度擴張
  F.money += inc;
  const fls = S.fleets.filter((f) => f.fac === fac && !f.pl && smShips(f.comp) > 0);
  F.money -= fls.reduce((a, f) => a + smCost(f.comp), 0) * SM_RULE.upkeep;
  for (const s of my) { if (s.sg) continue; const tgt = (s.cap ? 400 : smFront(S, s) ? 160 : 90), need = Math.max(0, tgt - s.gar), pay = Math.min(need, Math.max(0, F.money) * 0.3 / SM_RULE.garCost); s.gar += pay; F.money -= pay * SM_RULE.garCost; }
  // 建設（錢多才蓋）：都市升級 → 前線防衛建築
  if (F.money > 900) {
    const city = my.filter((s) => s.tier < 4 && s.pop >= SM_TIER_CAP[s.tier] * 0.7 && !s.sg).sort((a, b) => b.pop - a.pop)[0];
    if (city && smRnd(S) < 0.5) { F.money -= 250 * (city.tier + 1); city.tier++; }
    else { const fr = my.filter((s) => smFront(S, s) && s.def < 6 && !s.sg).sort((a, b) => a.def - b.def)[0]; if (fr) { F.money -= 150; fr.def++; } }
  }
  // 造艦：在船塢（首都或大型船塢）補充停在那裡的艦隊，或編成新艦隊
  const yards = my.filter((s) => (s.cap || s.mega.dock) && !s.sg);
  if (!yards.length || F.money < 200) return;
  const spend = (F.money - 150) * 0.7;
  const yard = smPick(S, yards), docked = fls.filter((f) => f.sys === yard.id && smShips(f.comp) < smShips(f.init) * 0.85);
  if (docked.length) {
    const f = docked[0], miss = f.init.map((x, t) => Math.max(0, x - f.comp[t])), c = smCost(miss), k = Math.min(1, spend / Math.max(1, c * SM_RULE.price)), add = smScale(miss, k);
    f.comp = smAdd(f.comp, add); F.money -= smCost(add) * SM_RULE.price;
  } else if (spend > 400) {
    const arch = fac === SM_P ? 2 : Math.floor(smRnd(S) * SM_ARCH.length), per = smCost(smArchComp(arch, 100)) / 100;
    const ships = Math.min(500, Math.floor(spend / SM_RULE.price / per));
    if (ships >= 120) { const f = smNewFleet(S, fac, yard.id, smArchComp(arch, ships), { arch, retreat: SM_RULE.retreat + (smRnd(S) - 0.5) * 0.1 }); F.money -= smCost(f.comp) * SM_RULE.price; }
  }
}
// 玩家的艦隊：在船塢補充（扣玩家的資金）
function smResupplyCost(S, fl) { const miss = fl.init.map((x, t) => Math.max(0, x - fl.comp[t])); return { miss, cost: Math.round(smCost(miss) * SM_RULE.price) }; }
function smCanResupply(S, fl) { const s = S.sys[fl.sys]; return s.owner === S.pl.fac && (s.cap || s.mega.dock) && !s.sg; }
function smResupply(S, fl) {
  if (!smCanResupply(S, fl)) return false;
  const { miss, cost } = smResupplyCost(S, fl); if (cost <= 0) return false;
  const k = Math.min(1, S.pl.money / cost), add = smScale(miss, k);
  fl.comp = smAdd(fl.comp, add); S.pl.money -= Math.round(smCost(add) * SM_RULE.price);
  return smShips(add);
}

/* ───── 回合 ───── */
// 第一段：AI 下令、所有艦隊移動；回傳這回合的戰鬥
function smTurnMove(S) {
  for (const fac of [SM_A, SM_E, SM_P].sort(() => smRnd(S) - 0.5)) smAiTurn(S, fac);
  for (const f of S.fleets) f.icp = false;
  smMoveAll(S);
  S.pend = smBattles(S);
  return S.pend;
}
// 第二段：（戰鬥都算完之後）圍城、強攻、經濟、成長、事件
function smTurnEnd(S) {
  for (const b of S.pend || []) if (!b.done) { smResolve(S, b.sys, 'ai'); b.done = true; }
  S.pend = null;
  smSiegeTick(S);
  for (const f of [SM_A, SM_E, SM_P]) smEconomy(S, f);
  // 玩家：薪餉
  S.pl.money += 60;
  // 成長與繁榮
  for (const s of S.sys) {
    const cap = SM_TIER_CAP[s.tier];
    s.pop = smR1(Math.min(cap, Math.max(0.5, s.pop + Math.max(0.05, s.pop * 0.03 * (s.prosp / 100) * (1 - s.pop / cap)))));
    const tgt = 25 + s.tier * 12 + Math.min(s.def, 6) * 2 + (s.mega.elev ? 8 : 0) + (s.cap ? 10 : 0) - (S.turn - s.hit < 3 ? 20 : 0) - (s.sg ? 15 : 0);
    s.prosp = smClamp(Math.round(s.prosp + (tgt - s.prosp) * 0.15), 0, 100);
  }
  // 清掉全滅的艦隊（玩家的保留紀錄）
  S.fleets = S.fleets.filter((f) => smShips(f.comp) > 0 || (f.pl && S.turn - (f.deadT || (f.deadT = S.turn)) < 3));
  S.pl.fleets = S.pl.fleets.filter((id) => S.fleets.some((f) => f.id === id));
  // 玩家的艦隊都沒了：聯盟重新撥一支（之後的生涯階段改成懲處）
  if (!smPlFleets(S).length) {
    const cap = smOwned(S, S.pl.fac).find((s) => s.cap) || smOwned(S, S.pl.fac)[0];
    if (cap) { const f = smNewFleet(S, S.pl.fac, cap.id, smArchComp(0, 300), { pl: true, name: '重建分艦隊', cmdr: { name: '你', lv: 2, tac: 'push' } }); S.pl.fleets.push(f.id); smLog(S, `聯盟在 ${cap.name} 重新撥給你一支分艦隊`, 'bad'); }
  }
  smEvents(S);
  S.turn++;
}
function smEvents(S) {
  for (const f of [SM_A, SM_E, SM_P]) S.fac[f].ww = Math.max(0, S.fac[f].ww - 0.4);
  // 厭戰：聯盟與帝國都打累了就停戰；停戰一段時間後再開戰
  const ae = S.rel[SM_A][SM_E];
  if (ae < 0 && S.fac[SM_A].ww + S.fac[SM_E].ww > 40 && smRnd(S) < 0.12) { S.rel[SM_A][SM_E] = S.rel[SM_E][SM_A] = 25; S.fac[SM_A].ww = S.fac[SM_E].ww = 0; smLog(S, '聯盟與帝國都已厭戰，簽訂停戰協定', 'ev'); }
  else if (ae >= 0) { const v = ae - 2; S.rel[SM_A][SM_E] = S.rel[SM_E][SM_A] = v; if (v < 0) smLog(S, '停戰協定破裂，聯盟與帝國重新開戰', 'ev'); }
  // 叛亂：大勢力的不滿星系可能倒向海盜
  for (const f of [SM_A, SM_E]) {
    const my = smOwned(S, f); if (my.length <= SM_RULE.overExt + 2) continue;
    if (smRnd(S) < SM_RULE.rebel * (my.length - SM_RULE.overExt - 2)) {
      const c = my.filter((s) => !s.cap && !s.sg && s.prosp < 50 && !smFleetsAt(S, s.id).some((o) => o.fac === f)).sort((a, b) => a.prosp - b.prosp)[0];
      if (c) { c.owner = SM_P; c.gar = 120; smNewFleet(S, SM_P, c.id, smArchComp(2, 200 + Math.floor(smRnd(S) * 150)), { arch: 2 }); smLog(S, `${c.name}（${SM_FAC[f].name}）爆發叛亂，倒向海盜`, f === S.pl.fac ? 'bad' : ''); }
    }
  }
  // 海盜滅亡後捲土重來
  if (!smOwned(S, SM_P).length && smRnd(S) < 0.06) {
    const c = S.sys.filter((s) => !s.cap && !smFleetsAt(S, s.id).length).sort((a, b) => a.prosp - b.prosp)[0];
    if (c) { const was = c.owner; c.owner = SM_P; c.gar = 80; c.sg = null; smNewFleet(S, SM_P, c.id, smArchComp(2, 250), { arch: 2 }); smLog(S, `海盜在 ${c.name}（原屬${SM_FAC[was].name}）捲土重來`); }
  }
}
// 自動跑一整回合（測試、AI 代打用）：玩家的艦隊照 AI 的方式行動
function smAutoTurn(S) {
  for (const f of smPlFleets(S)) f.pl = false;
  const ids = S.pl.fleets.slice();
  smTurnMove(S);
  for (const b of S.pend) { smResolve(S, b.sys, 'ai'); b.done = true; }
  for (const f of S.fleets) if (ids.includes(f.id)) f.pl = true;
  smTurnEnd(S);
}
const smCounts = (S) => [SM_A, SM_E, SM_P, SM_N].map((f) => smOwned(S, f).length);
// 存檔
function smSave(S) { try { STORE.setItem(SM_STORE, JSON.stringify(S)); return true; } catch (e) { return false; } }
function smLoad() { try { const t = STORE.getItem(SM_STORE); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
