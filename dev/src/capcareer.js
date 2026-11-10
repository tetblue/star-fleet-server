// ═══════════════════════ 艦長生涯（第 3 階段：生涯骨架） ═══════════════════════
// 和星海生涯分開（不同入口、不同存檔）：星圖沿用 starmap.js 的產生器（smGenMap、smPath、勢力常數），
// 但所有勢力的兵力都是戰艦小隊（每隊 1～5 艘特製戰艦），沒有艦隊戰。
// 一回合＝一週：下令移動 → 結束這一週 → AI 下令 → 移動 → 交戰（玩家的小隊親自打，其他用 capOdds 算）→ 圍城 → 整修、收入、任務。
// 佔領兩步：①打贏星系裡的敵方小隊與軌道防禦（取得軌道）②圍城 CC_RULE.siegeT 週，或地面突襲成功，地面投降；地面太弱的直接投降。
// 輸：玩家的小隊全滅＝生涯結束。
const CC_STORE = 'fleet.capcareer';
const CC_ROLES = {
  emp: { name: '帝國艦長', fac: SM_E, hulls: ['gunship', 'assault'], tech: { hull: 1.1, shield: 1 }, techName: '強化裝甲：船體 +10%',
    desc: '帝國艦隊的重砲艦艦長，帶一艘突擊艦護衛。從帝國的前線出發。' },
  all: { name: '聯盟艦長', fac: SM_A, hulls: ['support', 'assault'], tech: { hull: 1, shield: 1.15 }, techName: '護盾調諧：護盾 +15%',
    desc: '聯盟的支援艦艦長，帶一艘突擊艦護衛。從聯盟的前線出發。' },
};
const CC_DIFF = [
  { name: '簡單', li: 0, aggr: 0.8, desc: '敵方的特製戰艦弱一級，AI 比較保守。' },
  { name: '普通', li: 1, aggr: 1, desc: '標準的局勢。' },
  { name: '困難', li: 2, aggr: 1.25, desc: '敵方的特製戰艦強一級，AI 積極進攻。' },
];
const CC_RULE = {
  siegeT: SM_RULE.siegeT,   // 圍城幾週地面投降（沿用星海生涯）
  maxSq: 2,                 // 一個星系每個勢力最多幾隊（一場戰鬥每方最多 2 隊）
  maxShips: 5,              // 每隊最多幾艘
  salary: 80,               // 玩家每週的薪餉
  repair: 1.2,              // 修理：每點缺少的船體多少資金（要在有維修船塢的己方星系）
  missile: 3,               // 補飛彈：每枚多少資金（有補給站、維修船塢或首都的己方星系）
  build: { assault: 500, gunship: 900, support: 700 },   // 新造艦（下週到）
  defEvery: 2,              // 己方星系每幾週補一座防禦（沒有敵人在場時）
  merit: { ship: 40, cap: 300, def: 30 },
};
const CC_HULL_LETTER = { assault: '突', gunship: '砲', support: '支' };

// ───── 新局 ─────
function ccNewGame(o) {
  const R = CC_ROLES[o.role] || CC_ROLES.emp;
  const S = { v: 1, r: (o.seed >>> 0) || 1, turn: 1, diff: o.diff != null ? o.diff : 1, role: o.role, fac: R.fac, nextId: 1, sys: [], edges: [], adj: [], sq: [], log: [], missions: [], fin: null, pendB: null,
    rel: [[0, -60, -100, 0], [-60, 0, -100, 0], [-100, -100, 0, 0], [0, 0, 0, 0]], money: [0, 0, 0, 0],
    pl: { money: 600, merit: 0, sq: 0, kills: 0, caps: 0, weekFought: 0, build: [] } };
  smGenMap(S);
  for (const s of S.sys) ccSysInit(S, s);
  // AI 的小隊：聯盟、帝國各 6 隊（首都 2、前線），海盜 3 隊
  for (const f of [SM_A, SM_E, SM_P]) {
    const my = S.sys.filter((s) => s.owner === f), cap = my.find((s) => s.cap) || my[0], front = my.filter((s) => smFront(S, s));
    for (let k = 0, n = f === SM_P ? 3 : 6; k < n; k++) {
      const at = f === SM_P ? my[k % my.length] : k < 2 ? cap : front[k % Math.max(1, front.length)] || cap;
      ccNewSquad(S, f, at.id, ccRandHulls(S, f === SM_P ? 2 : 2 + Math.floor(smRnd(S) * 3)));
    }
  }
  // 玩家：從前線最靠近敵方首都的星系出發
  const ef = R.fac === SM_A ? SM_E : SM_A, ecap = S.sys.find((s) => s.owner === ef && s.cap);
  const front = S.sys.filter((s) => s.owner === R.fac && smFront(S, s)).sort((a, b) => Math.hypot(a.x - ecap.x, a.y - ecap.y) - Math.hypot(b.x - ecap.x, b.y - ecap.y))[0] || S.sys.find((s) => s.owner === R.fac);
  const P = ccNewSquad(S, R.fac, front.id, R.hulls.slice(), { pl: true, name: '你的小隊' });
  S.pl.sq = P.id;
  // 起點附近不要有 AI 小隊把玩家擠掉（一個星系最多 2 隊）
  ccLog(S, `你是${R.name}，帶著小隊（${R.hulls.map((k) => CAP_HULLS[k].name).join('、')}）駐守前線的 ${front.name}。開局科技：${R.techName}`, 'ev');
  ccGenMissions(S);
  return S;
}
// 星系的軌道防禦與後勤設施（依擁有者、等級）
function ccSysInit(S, s) {
  const base = ccDefBase(s);
  s.defs = base.map((type) => ({ type, hp: 1 }));
  s.yard = !!(s.cap || s.mega.dock || (s.owner !== SM_N && s.tier >= 2 && smRnd(S) < 0.5));
  s.depot = !!(s.cap || s.yard || (s.owner !== SM_N && smRnd(S) < 0.4));
  s.sg = null; s.defT = 0;
}
function ccDefBase(s) {
  if (s.cap) return ['orb', 'plat', 'plat', 'plat'];
  if (s.owner === SM_N) return s.tier >= 2 ? ['plat', 'plat'] : ['plat'];
  if (s.owner === SM_P) return ['plat'];
  return s.tier >= 2 ? ['orb', 'plat', 'plat'] : ['plat', 'plat'];
}
function ccRandHulls(S, n) { return Array.from({ length: n }, () => { const r = smRnd(S); return r < 0.4 ? 'assault' : r < 0.7 ? 'gunship' : 'support'; }); }
function ccNewSquad(S, fac, sys, hulls, o = {}) {
  const q = { id: S.nextId++, fac, sys, prev: sys, to: null, name: o.name || `${SM_FAC[fac].name}第${S.nextId - 1}小隊`, pl: !!o.pl, ships: hulls.map((key) => ({ key, hp: 1, sh: 1, msl: 1 })) };
  S.sq.push(q); return q;
}
function ccLog(S, t, c) { S.log.push({ turn: S.turn, t, c: c || '' }); if (S.log.length > 300) S.log.splice(0, S.log.length - 300); }
const ccPl = (S) => S.sq.find((q) => q.id === S.pl.sq);
const ccAt = (S, sid, fac) => S.sq.filter((q) => q.sys === sid && q.ships.length && (fac == null || q.fac === fac));
const ccHostile = (S, a, b) => a !== b && (a === SM_N || b === SM_N ? true : S.rel[a][b] < 0);   // 中立星系：誰都可以佔
const ccDefsAlive = (s) => s.defs.filter((d) => d.hp > 0);
// capOdds 的一方：小隊（每隊一組船）＋防禦；diff＝難度（敵方用生涯難度，AI 對 AI 用普通）
function ccSide(S, squads, defs, diff) {
  return { squads: squads.map((q) => q.ships.map((c) => ({ key: c.key, hp: c.hp, sh: c.sh, msl: c.msl }))).filter((q) => q.length), defs: (defs || []).map((d) => ({ type: d.type, hp: d.hp })), diff };
}
function ccOdds(S, A, D, defs, plSide) {
  const li = CC_DIFF[S.diff].li, a = ccSide(S, A, null, plSide === 0 ? 1 : plSide === 1 ? li : 1), d = ccSide(S, D, defs, plSide === 1 ? 1 : plSide === 0 ? li : 1);
  if (!d.squads.length && !d.defs.length) return { win: 1, surv: [a.squads.map((q) => q.map(() => 1)), []] };
  if (!a.squads.length) return { win: 0, surv: [[], d.squads.map((q) => q.map(() => 1))] };
  return capOdds([a, d]);
}

// ───── 一週 ─────
// 第一段：AI 下令、移動、計算的交戰；玩家的小隊捲入的戰鬥留給 S.pendB（玩家決定親自打或撤退）
function ccWeekA(S) {
  S.rep = [];
  for (const f of [SM_A, SM_E, SM_P]) ccAi(S, f);
  ccMove(S);
  S.pendB = null;
  for (const s of S.sys) {
    const B = ccBattleAt(S, s); if (!B) continue;
    const P = ccPl(S);
    if (P && P.ships.length && (B.A.includes(P) || B.D.includes(P))) { S.pendB = { sys: s.id, A: B.A.map((q) => q.id), D: B.D.map((q) => q.id), owner: B.owner, att: B.A.includes(P) }; continue; }
    ccFightCalc(S, s, B);
  }
}
// 第二段（玩家的戰鬥處理完之後）：圍城、防禦重建、整修、收入、造艦、任務、下一週
function ccWeekB(S) {
  S.pendB = null;
  const P0 = ccPl(S); if (P0 && !P0.ships.length && !S.fin) { S.fin = { why: `你的小隊在 ${S.sys[P0.sys].name} 全滅`, turn: S.turn }; ccLog(S, S.fin.why, 'bad'); return; }   // 計算的戰鬥裡全滅（或無路可退）
  ccSiege(S);
  for (const s of S.sys) {   // 防禦重建：沒有敵人在場時，每 defEvery 週補一座
    const base = ccDefBase(s), live = s.defs.filter((d) => d.hp > 0);
    if (S.sq.some((q) => q.sys === s.id && q.ships.length && ccHostile(S, q.fac, s.owner))) { s.defT = 0; continue; }
    for (const d of live) d.hp = Math.min(1, d.hp + 0.2);
    if (live.length < base.length && ++s.defT >= CC_RULE.defEvery) { s.defT = 0; s.defs = live.concat([{ type: base[live.length], hp: 0.5 }]); }
    else s.defs = live.concat(s.defs.filter((d) => d.hp <= 0)).slice(0, Math.max(live.length, base.length));
  }
  // 整修：護盾一律充滿；AI 的小隊在己方有維修船塢的星系修船體（缺少的 60%）、有補給站補飛彈；玩家的要花錢（ccRepair）
  for (const q of S.sq) {
    const s = S.sys[q.sys];
    for (const c of q.ships) c.sh = 1;
    if (q.pl || s.owner !== q.fac) continue;
    if (s.yard) for (const c of q.ships) c.hp += (1 - c.hp) * CAP_REPAIR.yard;
    if (s.depot || s.yard) for (const c of q.ships) c.msl = 1;
  }
  ccEconomy(S);
  // 玩家新造的船到了
  const P = ccPl(S);
  for (const b of S.pl.build.splice(0)) if (P && P.ships.length < CC_RULE.maxShips) { P.ships.push({ key: b, hp: 1, sh: 1, msl: 1 }); ccLog(S, `新造的${CAP_HULLS[b].name}加入小隊`, 'ok'); }
  S.pl.money += CC_RULE.salary;
  ccMissionTick(S);
  S.sq = S.sq.filter((q) => q.ships.length || q.pl);
  S.turn++; S.pl.weekFought = 0;   // 新的一週：玩家的小隊又可以打一場
  if (S.turn % 3 === 1) ccGenMissions(S);
}
function ccMove(S) {
  for (const q of S.sq) {
    if (q.to == null || !q.ships.length) { q.prev = q.sys; continue; }
    q.prev = q.sys; q.sys = q.to; q.to = null;
  }
}
// 這個星系有沒有交戰：擁有者（小隊＋軌道防禦）對 敵對的入侵者；沒有擁有者的戰力時，兩個在場的敵對勢力互打
function ccBattleAt(S, s) {
  const here = ccAt(S, s.id), facs = [...new Set(here.map((q) => q.fac))];
  const own = here.filter((q) => q.fac === s.owner), defs = ccDefsAlive(s);
  const inv = facs.filter((f) => f !== s.owner && ccHostile(S, f, s.owner));
  if (inv.length && (own.length || defs.length)) {
    const f = inv.sort((a, b) => ccPow(here.filter((q) => q.fac === b)) - ccPow(here.filter((q) => q.fac === a)))[0];
    return { A: here.filter((q) => q.fac === f).slice(0, CC_RULE.maxSq), D: own.slice(0, CC_RULE.maxSq), defs, owner: s.owner };
  }
  const others = facs.filter((f) => f !== s.owner);
  for (const a of others) for (const b of others) if (a < b && ccHostile(S, a, b) && a !== SM_N && b !== SM_N) return { A: here.filter((q) => q.fac === a).slice(0, CC_RULE.maxSq), D: here.filter((q) => q.fac === b).slice(0, CC_RULE.maxSq), defs: [], owner: -1 };
  return null;
}
const ccPow = (L) => L.reduce((a, q) => a + q.ships.reduce((b, c) => b + CAP_ODDS.win.f[c.key] * (0.4 + 0.6 * c.hp), 0), 0);
// 計算的戰鬥：照 capOdds 擲勝負與每艘船的存活；活下來的船受傷；輸的一方撤到相鄰的己方星系（沒有就全滅）
function ccFightCalc(S, s, B) {
  const O = ccOdds(S, B.A, B.D, B.defs, B.A.some((q) => q.pl) ? 0 : B.D.some((q) => q.pl) ? 1 : -1), aWin = smRnd(S) < O.win;
  const nA = B.A.reduce((a, q) => a + q.ships.length, 0), nD = B.D.reduce((a, q) => a + q.ships.length, 0);
  const hurt = (L, surv, won) => L.forEach((q, qi) => { q.ships = q.ships.filter((c, k) => { const p = (surv[qi] || [])[k] ?? 0.5; if (smRnd(S) >= p) return false; c.hp = Math.max(0.05, c.hp * (won ? 0.5 + 0.5 * smRnd(S) : 0.3 + 0.5 * smRnd(S))); c.sh = 0.2; c.msl *= 0.3 + 0.4 * smRnd(S); return true; }); });
  hurt(B.A, O.surv[0], aWin); hurt(B.D, O.surv[1], !aWin);
  if (aWin) { for (const d of B.defs) d.hp = 0; }
  else for (const d of B.defs) d.hp = Math.max(0, d.hp * (0.4 + 0.5 * smRnd(S)));
  const lost = aWin ? B.D : B.A; for (const q of lost) ccFlee(S, q);
  const lA = nA - B.A.reduce((a, q) => a + q.ships.length, 0), lD = nD - B.D.reduce((a, q) => a + q.ships.length, 0);
  const fa = B.A[0] ? B.A[0].fac : -1, fd = B.D[0] ? B.D[0].fac : s.owner;
  const mine = fa === S.fac || fd === S.fac || s.owner === S.fac;
  ccLog(S, `${s.name}：${SM_FAC[fa].name}進攻${fd >= 0 ? SM_FAC[fd].name : ''}${B.defs.length ? `（軌道防禦 ${B.defs.length} 座）` : ''}，${aWin ? SM_FAC[fa].name : SM_FAC[fd].name}獲勝（預測勝率 ${Math.round(O.win * 100)}%）・損失 ${lA}／${lD} 艘`, mine ? (aWin === (fa === S.fac) ? 'ok' : 'bad') : '');
}
// 輸的小隊撤退到相鄰的己方星系（沒有就投降＝全滅）
function ccFlee(S, q) {
  if (!q.ships.length) return;
  const to = S.adj[q.sys].map((j) => S.sys[j]).filter((t) => t.owner === q.fac && ccAt(S, t.id, q.fac).length < CC_RULE.maxSq);
  if (to.length) { q.prev = q.sys; q.sys = (to.find((t) => t.id === q.prev) || to[0]).id; }
  else { ccLog(S, `${q.name}無路可退，全員投降`, q.fac === S.fac ? 'bad' : ''); q.ships = []; }
}
// 圍城：軌道上只有入侵者（擁有者沒有小隊、防禦也打光）＝圍城；滿 siegeT 週、地面突襲成功、地面太弱 → 投降
function ccSiege(S) {
  for (const s of S.sys) {
    const att = ccAt(S, s.id).filter((q) => q.fac !== s.owner && ccHostile(S, q.fac, s.owner));
    if (!att.length || ccAt(S, s.id, s.owner).length || ccDefsAlive(s).length) { if (!att.length) s.sg = null; continue; }
    const f = att[0].fac;
    if (!s.sg || s.sg.f !== f) { s.sg = { f, w: 0, raid: false }; ccLog(S, `${SM_FAC[f].name}取得 ${s.name} 的軌道，開始圍城`, f === S.fac ? 'ok' : s.owner === S.fac ? 'bad' : ''); }
    s.sg.w++;
    if (s.sg.raid || s.sg.w >= CC_RULE.siegeT || ccWeakGround(s)) ccCapture(S, s, f, s.sg.raid ? '地面突襲成功，守軍投降' : ccWeakGround(s) ? '地面防禦太弱，直接投降' : `圍城 ${s.sg.w} 週，地面投降`);
  }
}
// 地面太弱：直接投降（暫定：中立的小星系；綜合評分（聲望、艦隊戰力）實測後再定）
function ccWeakGround(s) { return s.owner === SM_N && s.tier <= 1 && s.def <= 2; }
function ccCapture(S, s, f, why) {
  const was = s.owner; s.owner = f; s.sg = null; s.defs = []; s.defT = 0;
  if (s.yard && smRnd(S) < 0.3) s.yard = false;   // 戰火中損毀
  ccLog(S, `${s.name}：${why}，歸${SM_FAC[f].name}所有（原本是${SM_FAC[was].name}）`, f === S.fac ? 'ok' : was === S.fac ? 'bad' : '');
  if (f === S.fac && ccAt(S, s.id).some((q) => q.pl)) { S.pl.caps++; S.pl.merit += CC_RULE.merit.cap; S.pl.money += 300; }
  const plHere = ccAt(S, s.id).some((q) => q.pl);   // 佔領任務：你的小隊要在場才算你的功勞
  for (const M of S.missions) if (M.state === 'open' && M.type === 'cap' && M.sys === s.id && f === S.fac) { if (plHere) ccMissionDone(S, M, true); else { M.state = 'gone'; ccLog(S, `${s.name} 被友軍佔領了：佔領任務取消`, ''); } }
}

// ───── AI ─────
// 每隊：受重傷就回有維修船塢的己方星系；否則找相鄰、打得贏（和同星系的另一隊一起）的敵方星系進攻；沒事做就補到沒有小隊的前線
function ccAi(S, f) {
  const aggr = f === S.fac ? 1 : CC_DIFF[S.diff].aggr, mine = S.sq.filter((q) => q.fac === f && !q.pl && q.ships.length);
  const goingTo = (sid) => S.sq.filter((q) => q.fac === f && (q.to != null ? q.to : q.sys) === sid && q.ships.length).length;
  for (const q of mine) {
    q.to = null;
    const s = S.sys[q.sys], hp = q.ships.reduce((a, c) => a + c.hp, 0) / q.ships.length;
    if (s.owner !== f && ccHostile(S, f, s.owner)) continue;   // 正在圍城：留下
    if (hp < 0.5 || q.ships.length <= 1) {
      if (s.owner === f && s.yard) continue;
      const yards = S.sys.filter((t) => t.owner === f && t.yard).map((t) => smPath(S, q.sys, t.id, (x) => x.owner === f)).filter(Boolean).sort((a, b) => a.length - b.length);
      if (yards[0] && yards[0].length > 1 && goingTo(yards[0][1]) < CC_RULE.maxSq) q.to = yards[0][1];
      continue;
    }
    const buddy = mine.find((o) => o !== q && o.sys === q.sys && o.to == null);
    let best = null, bp = 0.55 / aggr + smRnd(S) * 0.15;
    for (const j of S.adj[q.sys]) {
      const t = S.sys[j]; if (!ccHostile(S, f, t.owner) || t.owner === f) continue;
      if (goingTo(j) >= CC_RULE.maxSq) continue;
      const D = ccAt(S, j).filter((o) => o.fac === t.owner).slice(0, 2), p = ccOdds(S, buddy ? [q, buddy] : [q], D, ccDefsAlive(t), -1).win;
      if (p > bp) { bp = p; best = { j, buddy: buddy && p > ccOdds(S, [q], D, ccDefsAlive(t), -1).win + 0.05 ? buddy : null }; }
    }
    if (best) { q.to = best.j; if (best.buddy && goingTo(best.j) < CC_RULE.maxSq) best.buddy.to = best.j; continue; }
    if (!smFront(S, s) || ccAt(S, s.id, f).length > 1) {   // 前線上沒有小隊的己方星系
      const tgt = S.sys.filter((t) => t.owner === f && smFront(S, t) && !ccAt(S, t.id, f).length).map((t) => smPath(S, q.sys, t.id, (x) => x.owner === f)).filter(Boolean).sort((a, b) => a.length - b.length)[0];
      if (tgt && tgt.length > 1 && goingTo(tgt[1]) < CC_RULE.maxSq) q.to = tgt[1];
    }
  }
}
// 收入與造艦：星系收入（等級）→ 有維修船塢的星系補船（不滿 3 艘的隊先補）、小隊太少就成立新隊
function ccEconomy(S) {
  for (const f of [SM_A, SM_E, SM_P]) {
    const own = S.sys.filter((s) => s.owner === f); if (!own.length) continue;
    S.money[f] += own.reduce((a, s) => a + 30 + s.tier * 25, 0) * (f === S.fac ? 1 : CC_DIFF[S.diff].aggr);
    const yards = own.filter((s) => s.yard);
    for (let guard = 0; guard < 10 && yards.length; guard++) {
      const key = ccRandHulls(S, 1)[0], cost = CC_RULE.build[key]; if (S.money[f] < cost) break;
      const atYard = S.sq.filter((q) => q.fac === f && !q.pl && q.ships.length && q.ships.length < CC_RULE.maxShips && S.sys[q.sys].owner === f && S.sys[q.sys].yard).sort((a, b) => a.ships.length - b.ships.length);
      const weak = atYard.find((q) => q.ships.length < 3) || (S.money[f] > 1500 ? atYard[0] : null);   // 先補不到 3 艘的隊；錢多就補到 5 艘
      const nSq = S.sq.filter((q) => q.fac === f && q.ships.length).length;
      if (weak) { weak.ships.push({ key, hp: 1, sh: 1, msl: 1 }); S.money[f] -= cost; }
      else if (nSq < Math.max(4, Math.ceil(own.length * 0.7))) { const y = yards.find((s) => ccAt(S, s.id, f).length < CC_RULE.maxSq); if (!y) break; ccNewSquad(S, f, y.id, [key]); S.money[f] -= cost; }
      else break;
    }
  }
}

// ───── 玩家的指令 ─────
function ccCanMove(S, to) {
  const P = ccPl(S); if (!P || S.fin) return '生涯已結束';
  if (!S.adj[P.sys].includes(to)) return '只能移動到相鄰的星系（一週一個航道）';
  const n = S.sq.filter((q) => q.fac === S.fac && q !== P && (q.to != null ? q.to : q.sys) === to && q.ships.length).length;
  if (n >= CC_RULE.maxSq) return `那裡已經有 ${CC_RULE.maxSq} 個我方小隊`;
  return '';
}
function ccRepairCost(S, P) { return Math.round(P.ships.reduce((a, c) => a + (1 - c.hp) * CAP_HULLS[c.key].hp, 0) * CC_RULE.repair); }
function ccMissileCost(S, P) { return Math.round(P.ships.reduce((a, c) => a + (CAP_HULLS[c.key].msl ? (1 - c.msl) * CAP_HULLS[c.key].msl.n : 0), 0) * CC_RULE.missile); }
function ccCanService(S, kind) {
  const P = ccPl(S), s = S.sys[P.sys];
  if (s.owner !== S.fac) return '要在己方的星系';
  if (kind === 'repair' && !s.yard) return '這裡沒有維修船塢';
  if (kind === 'missile' && !(s.depot || s.yard || s.cap)) return '這裡沒有補給站';
  if (kind === 'build' && !s.yard) return '這裡沒有維修船塢';
  return '';
}
function ccRepair(S) { const P = ccPl(S), c = ccRepairCost(S, P); if (ccCanService(S, 'repair') || S.pl.money < c) return false; S.pl.money -= c; for (const x of P.ships) x.hp = 1; ccLog(S, `在 ${S.sys[P.sys].name} 修好小隊（${c} 資金）`, 'ok'); return true; }
function ccResupply(S) { const P = ccPl(S), c = ccMissileCost(S, P); if (ccCanService(S, 'missile') || S.pl.money < c) return false; S.pl.money -= c; for (const x of P.ships) x.msl = 1; ccLog(S, `補滿飛彈（${c} 資金）`, 'ok'); return true; }
function ccBuild(S, key) {
  const P = ccPl(S), cost = CC_RULE.build[key];
  if (ccCanService(S, 'build') || S.pl.money < cost || P.ships.length + S.pl.build.length >= CC_RULE.maxShips) return false;
  S.pl.money -= cost; S.pl.build.push(key); ccLog(S, `訂造一艘${CAP_HULLS[key].name}（${cost} 資金），下週加入小隊`, 'ok'); return true;
}

// ───── NPC 任務：上級交辦（時限、目標必填；獎勵資金與戰功） ─────
const CC_MIS = {
  cap: { name: '佔領', desc: (S, M) => `在第 ${M.due} 週前佔領 ${S.sys[M.sys].name}（打下軌道，再圍城或地面突襲讓地面投降）` },
  op: { name: '特戰', desc: (S, M) => `在第 ${M.due} 週前，到 ${S.sys[M.sys].name} 執行${CAP_MIS[M.op].name}任務（小隊要在那個星系）` },
};
function ccGenMissions(S) {
  if (S.fin || S.missions.filter((M) => M.state === 'open').length >= 3) return;
  const P = ccPl(S); if (!P) return;
  const near = (n) => S.sys.filter((s) => s.owner !== S.fac && ccHostile(S, S.fac, s.owner) && smHop(S, P.sys, s.id) <= n);
  const tc = near(3).filter((s) => !S.missions.some((M) => M.state === 'open' && M.sys === s.id)).sort((a, b) => smHop(S, P.sys, a.id) - smHop(S, P.sys, b.id))[0];
  if (tc) S.missions.push({ id: S.nextId++, type: 'cap', sys: tc.id, due: S.turn + 6 + smHop(S, P.sys, tc.id) * 2, state: 'open', reward: { money: 600 + tc.tier * 200, merit: 250 } });
  const to = near(2).filter((s) => s.owner !== SM_N)[Math.floor(smRnd(S) * 3)] || near(2)[0];
  if (to && smRnd(S) < 0.8) { const op = smPick(S, ['intercept', 'sabotage', 'decap', 'wipe']); S.missions.push({ id: S.nextId++, type: 'op', op, sys: to.id, due: S.turn + 4 + smHop(S, P.sys, to.id), state: 'open', reward: { money: 350, merit: 150 } }); }
  const L = S.missions.filter((M) => M.state === 'open' && M.t0 == null); for (const M of L) { M.t0 = S.turn; ccLog(S, `新任務：${CC_MIS[M.type].name}・${CC_MIS[M.type].desc(S, M)}`, 'ev'); }
}
function ccMissionTick(S) { for (const M of S.missions) if (M.state === 'open' && S.turn >= M.due) { M.state = 'fail'; ccLog(S, `任務失敗（時限已過）：${CC_MIS[M.type].desc(S, M)}`, 'bad'); } }
function ccMissionDone(S, M, ok) {
  M.state = ok ? 'done' : 'fail';
  if (ok) { S.pl.money += M.reward.money; S.pl.merit += M.reward.merit; ccLog(S, `任務完成：${CC_MIS[M.type].desc(S, M)}（資金 +${M.reward.money}、戰功 +${M.reward.merit}）`, 'ok'); }
}

function ccSave(S) { try { STORE.setItem(CC_STORE, JSON.stringify(S)); return true; } catch (e) { return false; } }
function ccLoad() { try { const t = STORE.getItem(CC_STORE); const S = t ? JSON.parse(t) : null; return S && S.v === 1 ? S : null; } catch (e) { return null; } }
