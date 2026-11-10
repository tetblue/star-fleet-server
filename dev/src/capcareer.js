// ═══════════════════════ 艦長生涯（第 3 階段：生涯骨架） ═══════════════════════
// 和星海生涯分開（不同入口、不同存檔）：星圖沿用 starmap.js 的產生器（smGenMap、smPath、勢力常數），
// 但所有勢力的兵力都是戰艦小隊（每隊 1～5 艘特製戰艦），沒有艦隊戰。
// 一回合＝一週：下令移動 → 結束這一週 → AI 下令 → 移動 → 交戰（玩家的小隊親自打，其他用 capOdds 算）→ 圍城 → 整修、收入、任務。
// 佔領兩步：①打贏星系裡的敵方小隊與軌道防禦（取得軌道）②圍城 CC_RULE.siegeT 週，或地面突襲成功，地面投降；地面太弱的直接投降。
// 輸：玩家的小隊全滅＝生涯結束。
// 第 4 階段：特戰任務的結果寫回星圖（CC_OPFX）：補給線切斷、設施被毀、指揮中斷、地面守軍重創、滲透偵察（看得到敵軍的預定動向）。
// AI 的命令在每週開始時就決定（ccPlan），所以偵察看到的動向就是下週真的會發生的。
// 第 5 階段：玩家可以擁有多個小隊（q.pl），親自指揮的只有 S.pl.sq 那一隊（ccPl）。其他小隊用命令：移動、駐守／撤退、派出執行任務（ccTaskOdds 估計、週末擲出結果）。
// 同一個星系的我方小隊可以換船、分出新小隊（ccTransfer），也可以把親自指揮換到那一隊（ccTakeCommand）。輸＝親自指揮的小隊全滅。
// 第 6 階段：每個星系有固定的太空場景（s.scene：小行星帶、黑洞、深空、行星軌道、星雲、太空站周邊），太空戰都在那個場景打。
// 特戰任務多了摧毀設施（太空：船塢、補給站）、護送、救援撤離、偵察；破壞改成只炸軌道防禦的管制中心（地面）。地面、太空任務混著出。
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
  fx: { cut: 4, dis: 4, intel: 5, disHp: 0.7, defBack: 4 },   // 任務效果：補給切斷幾週、指揮中斷幾週（耐久當作 ×0.7）、偵察幾週、地面防禦每幾週回復 1
  maxMis: 4,
  sqMerit: [0, 800, 2000],   // 指揮權：戰功到了才能多帶一個小隊（暫定，第 7 階段改成升遷）
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
  const P = ccNewSquad(S, R.fac, front.id, R.hulls.slice(), { pl: true, name: '第1小隊' });
  S.pl.sq = P.id;
  // 起點附近不要有 AI 小隊把玩家擠掉（一個星系最多 2 隊）
  ccLog(S, `你是${R.name}，帶著小隊（${R.hulls.map((k) => CAP_HULLS[k].name).join('、')}）駐守前線的 ${front.name}。開局科技：${R.techName}`, 'ev');
  ccGenMissions(S);
  ccPlan(S);
  return S;
}
// 星系的軌道防禦與後勤設施（依擁有者、等級）
function ccSysInit(S, s) {
  const base = ccDefBase(s);
  s.defs = base.map((type) => ({ type, hp: 1 }));
  s.yard = !!(s.cap || s.mega.dock || (s.owner !== SM_N && s.tier >= 2 && smRnd(S) < 0.5));
  s.depot = !!(s.cap || s.yard || (s.owner !== SM_N && smRnd(S) < 0.4));
  s.sg = null; s.defT = 0; s.def0 = s.def; s.fx = {}; s.scene = ccSceneFor(S, s);
}
// 星系的太空場景：有維修船塢、首都的是太空站周邊；其他依星系固定（不用 smRnd，舊存檔補上也一樣）
const CC_SCENES = ['belt', 'belt', 'hole', 'deep', 'deep', 'orbit', 'orbit', 'nebula'];
function ccSceneFor(S, s) {
  if (s.cap || s.yard) return 'station';
  const h = Math.imul((s.id + 1) ^ (S.r & 0xffff), 2654435761) >>> 0;
  return CC_SCENES[h % CC_SCENES.length];
}
// capLayout 的地點編號（太空場景）
const ccSceneEnv = (s) => GROUND_KEYS.length + 1 + Math.max(0, CAP_SPACE_KEYS.indexOf(s.scene || 'belt'));
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
  return { squads: squads.map((q) => { const m = ccDis(S, q) ? CC_RULE.fx.disHp : 1; return q.ships.map((c) => ({ key: c.key, hp: c.hp * m, sh: c.sh * m, msl: c.msl })); }).filter((q) => q.length), defs: (defs || []).map((d) => ({ type: d.type, hp: d.hp })), diff };
}
const ccDis = (S, q) => (q.dis || 0) > S.turn;              // 斬首任務：指揮中斷
const ccCut = (S, s) => ((s.fx && s.fx.cut) || 0) > S.turn;  // 攔截任務：補給線切斷
const ccIntel = (S, s) => ((s.fx && s.fx.intel) || 0) > S.turn;   // 滲透偵察
// 看得到這個小隊的預定動向嗎：我方的小隊、你的小隊所在或相鄰的星系、偵察過的星系
function ccSeen(S, q) {
  if (q.fac === S.fac) return true;
  return ccOwn(S).some((P) => q.sys === P.sys || S.adj[P.sys].includes(q.sys)) || ccIntel(S, S.sys[q.sys]);
}
// 玩家的小隊（有船的）；指揮權（可以帶幾隊）
const ccOwn = (S) => S.sq.filter((q) => q.pl && q.ships.length);
const ccSlots = (S) => CC_RULE.sqMerit.filter((m) => S.pl.merit >= m).length;
const ccOwnCount = (S) => ccOwn(S).length + S.pl.build.filter((b) => b.sq === 'new').length;
function ccOwnName(S) { for (let n = 1; ; n++) if (!S.sq.some((q) => q.pl && q.ships.length && q.name === `第${n}小隊`)) return `第${n}小隊`; }
// 每週開始：AI 決定這週的命令（存在 q.to；玩家看得到的部分畫在星圖上）
function ccPlan(S) { for (const f of [SM_A, SM_E, SM_P]) ccAi(S, f); S.plan = S.turn; }
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
  if (S.plan !== S.turn) ccPlan(S);   // 舊存檔，或這週還沒決定
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
  ccRunTasks(S);
  ccSiege(S);
  for (const s of S.sys) {   // 防禦重建：沒有敵人在場時，每 defEvery 週補一座
    const base = ccDefBase(s), live = s.defs.filter((d) => d.hp > 0);
    if (S.sq.some((q) => q.sys === s.id && q.ships.length && ccHostile(S, q.fac, s.owner))) { s.defT = 0; continue; }
    if (s.def < s.def0 && S.turn - (s.fx.gT || 0) >= CC_RULE.fx.defBack) { s.def++; s.fx.gT = S.turn; }   // 地面防禦慢慢回復
    if (ccCut(S, s)) continue;   // 補給線切斷：防禦不重建、不整修
    for (const d of live) d.hp = Math.min(1, d.hp + 0.2);
    if (live.length < base.length && ++s.defT >= CC_RULE.defEvery) { s.defT = 0; s.defs = live.concat([{ type: base[live.length], hp: 0.5 }]); }
    else s.defs = live.concat(s.defs.filter((d) => d.hp <= 0)).slice(0, Math.max(live.length, base.length));
  }
  // 整修：護盾一律充滿；AI 的小隊在己方有維修船塢的星系修船體（缺少的 60%）、有補給站補飛彈；玩家的要花錢（ccRepair）
  for (const q of S.sq) {
    const s = S.sys[q.sys];
    for (const c of q.ships) c.sh = 1;
    if (q.pl || s.owner !== q.fac) continue;
    const cut = ccCut(S, s);   // 補給線切斷：只修一半、不補飛彈
    if (s.yard) for (const c of q.ships) c.hp += (1 - c.hp) * CAP_REPAIR.yard * (cut ? 0.5 : 1);
    if ((s.depot || s.yard) && !cut) for (const c of q.ships) c.msl = 1;
  }
  ccEconomy(S);
  // 玩家新造的船到了
  for (const b of S.pl.build.splice(0)) {   // 舊存檔：字串＝加入親自指揮的小隊
    const key = b.key || b, add = { key, hp: 1, sh: 1, msl: 1 };
    if (b.sq === 'new') { const q = ccNewSquad(S, S.fac, b.sys, [], { pl: true, name: ccOwnName(S) }); q.ships.push(add); ccLog(S, `新造的${CAP_HULLS[key].name}在 ${S.sys[b.sys].name} 成立${q.name}`, 'ok'); continue; }
    const q = S.sq.find((x) => x.id === b.sq && x.ships.length) || ccPl(S);
    if (q && q.ships.length < CC_RULE.maxShips) { q.ships.push(add); ccLog(S, `新造的${CAP_HULLS[key].name}加入${q.name}`, 'ok'); }
  }
  S.pl.money += CC_RULE.salary;
  ccMissionTick(S);
  S.sq = S.sq.filter((q) => q.ships.length || q.id === S.pl.sq);
  S.turn++; S.pl.weekFought = 0;   // 新的一週：玩家的小隊又可以打一場
  ccMissionTick(S, true);
  if (S.turn % 3 === 1) ccGenMissions(S);
  ccPlan(S);
}
function ccMove(S) {
  for (const q of S.sq) {
    if (q.to == null || !q.ships.length) { q.prev = q.sys; continue; }
    q.prev = q.sys; q.sys = q.to; q.to = null;
  }
}
// 這個星系有沒有交戰：擁有者（小隊＋軌道防禦）對 敵對的入侵者；沒有擁有者的戰力時，兩個在場的敵對勢力互打
function ccBattleAt(S, s) {
  const pri = (q) => q.id === S.pl.sq ? 0 : q.pl ? 1 : 2;   // 每方最多 2 隊：親自指揮的、你的其他小隊優先上場
  const here = ccAt(S, s.id).sort((a, b) => pri(a) - pri(b)), facs = [...new Set(here.map((q) => q.fac))];
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
  const own0 = [...B.A, ...B.D].filter((q) => q.pl).map((q) => [q, q.ships.length]);
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
  for (const [q, n] of own0) { const won = B.A.includes(q) === aWin; ccLog(S, `${q.name}（計算）：${won ? '打贏了' : '打輸了'}${n > q.ships.length ? `，損失 ${n - q.ships.length} 艘` : ''}${q.ships.length ? (won ? '' : `，撤到 ${S.sys[q.sys].name}`) : '（全滅）'}`, won && q.ships.length ? 'ok' : 'bad'); }
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
    if (s.sg.raid || s.sg.w >= ccSiegeNeed(s) || ccWeakGround(s)) ccCapture(S, s, f, s.sg.raid ? '地面突襲成功，守軍投降' : ccWeakGround(s) ? '地面防禦太弱，直接投降' : `圍城 ${s.sg.w} 週，地面投降`);
  }
}
// 圍城要幾週：地面防禦被打掉多少，就少幾週（全滅任務）
function ccSiegeNeed(s) { return Math.max(1, CC_RULE.siegeT - Math.max(0, (s.def0 || s.def) - s.def)); }
// 地面太弱：直接投降（暫定：中立的小星系；綜合評分（聲望、艦隊戰力）實測後再定）
function ccWeakGround(s) { return s.def <= 0 || (s.owner === SM_N && s.tier <= 1 && s.def <= 2); }
function ccCapture(S, s, f, why) {
  const was = s.owner; s.owner = f; s.sg = null; s.defs = []; s.defT = 0; s.fx.cut = 0;
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
    if (ccDis(S, q)) continue;   // 指揮中斷：原地待命
    const buddy = mine.find((o) => o !== q && o.sys === q.sys && o.to == null && !ccDis(S, o));
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
function ccCanMove(S, to, P = ccPl(S)) {
  if (!P || S.fin) return '生涯已結束';
  if (!S.adj[P.sys].includes(to)) return '只能移動到相鄰的星系（一週一個航道）';
  const n = S.sq.filter((q) => q.fac === S.fac && q !== P && (q.to != null ? q.to : q.sys) === to && q.ships.length).length;
  if (n >= CC_RULE.maxSq) return `那裡已經有 ${CC_RULE.maxSq} 個我方小隊`;
  return '';
}
function ccRepairCost(S, P) { return Math.round(P.ships.reduce((a, c) => a + (1 - c.hp) * CAP_HULLS[c.key].hp, 0) * CC_RULE.repair); }
function ccMissileCost(S, P) { return Math.round(P.ships.reduce((a, c) => a + (CAP_HULLS[c.key].msl ? (1 - c.msl) * CAP_HULLS[c.key].msl.n : 0), 0) * CC_RULE.missile); }
function ccCanService(S, kind, P = ccPl(S)) {
  const s = S.sys[P.sys];
  if (s.owner !== S.fac) return '要在己方的星系';
  if (kind === 'repair' && !s.yard) return '這裡沒有維修船塢';
  if (kind === 'missile' && !(s.depot || s.yard || s.cap)) return '這裡沒有補給站';
  if (kind === 'build' && !s.yard) return '這裡沒有維修船塢';
  return '';
}
function ccRepair(S, P = ccPl(S)) { const c = ccRepairCost(S, P); if (ccCanService(S, 'repair', P) || S.pl.money < c) return false; S.pl.money -= c; for (const x of P.ships) x.hp = 1; ccLog(S, `在 ${S.sys[P.sys].name} 修好${P.name}（${c} 資金）`, 'ok'); return true; }
function ccResupply(S, P = ccPl(S)) { const c = ccMissileCost(S, P); if (ccCanService(S, 'missile', P) || S.pl.money < c) return false; S.pl.money -= c; for (const x of P.ships) x.msl = 1; ccLog(S, `${P.name}補滿飛彈（${c} 資金）`, 'ok'); return true; }
const ccBuildsFor = (S, q) => S.pl.build.filter((b) => (b.sq || S.pl.sq) === q.id).length;
// 新造艦：加入小隊 P（滿 5 艘就不行），或 asNew＝下週在這裡成立新小隊（要有指揮權）
function ccBuild(S, key, P = ccPl(S), asNew) {
  const cost = CC_RULE.build[key];
  if (ccCanService(S, 'build', P) || S.pl.money < cost) return false;
  if (asNew ? ccOwnCount(S) >= ccSlots(S) : P.ships.length + ccBuildsFor(S, P) >= CC_RULE.maxShips) return false;
  S.pl.money -= cost; S.pl.build.push(asNew ? { key, sq: 'new', sys: P.sys } : { key, sq: P.id });
  ccLog(S, `訂造一艘${CAP_HULLS[key].name}（${cost} 資金），下週${asNew ? `在 ${S.sys[P.sys].name} 成立新的小隊` : `加入${P.name}`}`, 'ok'); return true;
}
// 換船：同一個星系的我方小隊之間，不花時間。to＝'new' 分出新小隊（要有指揮權）
function ccTransfer(S, a, k, to) {
  const c = a.ships[k]; if (!c) return '沒有這艘船';
  if (a.id === S.pl.sq && a.ships.length <= 1) return '親自指揮的小隊至少要留一艘';
  let b;
  if (to === 'new') { if (ccOwnCount(S) >= ccSlots(S)) return `指揮權不夠（戰功 ${CC_RULE.sqMerit[ccSlots(S)] || '—'} 可以多帶一隊）`; b = ccNewSquad(S, S.fac, a.sys, [], { pl: true, name: ccOwnName(S) }); }
  else { b = S.sq.find((q) => q.id === to); if (!b || !b.pl || b.sys !== a.sys) return '要在同一個星系'; if (b.ships.length >= CC_RULE.maxShips) return '那一隊已經滿了'; }
  b.ships.push(a.ships.splice(k, 1)[0]); b.to = b.to ?? null;
  if (!a.ships.length) { S.sq = S.sq.filter((q) => q !== a); for (const x of S.pl.build) if (x.sq === a.id) x.sq = b.id; }
  return '';
}
// 親自指揮換到另一隊：要和現在指揮的小隊在同一個星系（艦長換船）
function ccTakeCommand(S, q) {
  const P = ccPl(S); if (!q || !q.pl || !q.ships.length) return '沒有這個小隊';
  if (P && P.ships.length && P.sys !== q.sys) return '要和現在指揮的小隊在同一個星系';
  S.pl.sq = q.id; q.task = null; ccLog(S, `你改為親自指揮${q.name}`, 'ev'); return '';
}
// ───── 派出的小隊：任務、地面突襲用公式估計（暫定，還沒用實戰校正）─────
// 成功率：戰力（ccPow）＋平均耐久 − 地面防禦（太空任務當作 1）＋任務難易＋偵察；存活率：艦種基準 − 失敗的風險 + 這艘船的耐久
const CC_TASK_ADJ = { raid: -0.03, intercept: 0, sabotage: 0.04, decap: -0.08, wipe: -0.05, run: 0.08, strike: 0.04, escort: 0.02, rescue: 0, scan: 0.08 };
function ccTaskOdds(S, q, t) {
  const s = S.sys[t.sys], n = q.ships.length; if (!n) return { p: 0, surv: [] };
  const op = t.kind === 'raid' ? 'raid' : (S.missions.find((M) => M.id === t.mis) || {}).op, space = op && CAP_MIS[op] && (CAP_MIS[op].at || '').includes('s');
  const hp = q.ships.reduce((a, c) => a + c.hp, 0) / n, cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const p = cl(0.42 + 0.09 * ccPow([q]) - 0.07 * (space ? 1 : s.def) + 0.12 * (hp - 0.7) + (CC_TASK_ADJ[op] || 0) + (ccIntel(S, s) ? 0.08 : 0), 0.1, 0.92);
  const base = { assault: 0.8, gunship: 0.92, support: 0.87 };
  return { p, surv: q.ships.map((c) => cl(base[c.key] - (1 - p) * 0.35 + (c.hp - 0.7) * 0.2, 0.3, 0.99)) };
}
function ccTaskOk(S, q, t) {
  if (!q.ships.length || q.id === S.pl.sq) return false;
  if (t.kind === 'raid') { const s = S.sys[t.sys]; return q.sys === s.id && !!s.sg && s.sg.f === S.fac; }
  const M = S.missions.find((x) => x.id === t.mis); return !!M && ccCanOp(S, M, q);
}
function ccSetTask(S, q, t) { if (!ccTaskOk(S, q, t)) return false; q.task = t; q.to = null; return true; }
function ccRunTasks(S) {
  for (const q of ccOwn(S)) {
    const t = q.task; if (!t) continue; q.task = null;
    const s = S.sys[t.sys], M = t.kind === 'op' ? S.missions.find((x) => x.id === t.mis) : null, name = t.kind === 'raid' ? '地面突襲' : CC_OPFX[M.op].name;
    if (!ccTaskOk(S, q, t)) { ccLog(S, `${q.name}的${name}取消（情況改變了）`, ''); continue; }
    const O = ccTaskOdds(S, q, t), ok = smRnd(S) < O.p, n0 = q.ships.length;
    q.ships = q.ships.filter((c, k) => { if (smRnd(S) >= O.surv[k]) return false; c.hp = Math.max(0.05, c.hp * (0.65 + 0.3 * smRnd(S))); c.msl *= 0.5; return true; });
    ccLog(S, `${q.name}在 ${s.name} 執行${name}（計算，成功率 ${Math.round(O.p * 100)}%）：${ok ? '成功' : '失敗'}${n0 > q.ships.length ? `，損失 ${n0 - q.ships.length} 艘` : ''}${q.ships.length ? '' : '（全滅）'}`, ok ? 'ok' : 'bad');
    if (!ok) continue;
    S.pl.merit += 40;
    if (t.kind === 'raid') { if (s.sg) s.sg.raid = true; } else ccMissionDone(S, M, true);
  }
}

// ───── NPC 任務：上級交辦（時限、目標必填；獎勵資金與戰功） ─────
const CC_MIS = {
  cap: { name: '佔領', desc: (S, M) => `在第 ${M.due} 週前佔領 ${S.sys[M.sys].name}（打下軌道，再圍城或地面突襲讓地面投降）` },
  op: { name: '特戰', desc: (S, M) => `在第 ${M.due} 週前，${CC_OPFX[M.op].goal(S, M)}（小隊在 ${S.sys[M.sys].name} 或相鄰的星系就能出擊）` },
};
const CC_SAB = { yard: '維修船塢', depot: '補給站', defs: '軌道防禦的管制中心' };
// 特戰任務的效果（成功時寫回星圖）
const CC_OPFX = {
  intercept: { name: '攔截', goal: (S, M) => `在 ${S.sys[M.sys].name} 攔截${SM_FAC[M.f].name}的補給船隊`,
    fx: (S, M) => `${SM_FAC[M.f].name}在 ${S.sys[M.sys].name} 與相鄰星系的補給線切斷 ${CC_RULE.fx.cut} 週：那裡的小隊不補飛彈、只修一半，軌道防禦不重建；${SM_FAC[M.f].name}損失資金`,
    apply(S, M) { const s = S.sys[M.sys], L = [s, ...S.adj[s.id].map((j) => S.sys[j])].filter((t) => t.owner === M.f); for (const t of L) t.fx.cut = S.turn + CC_RULE.fx.cut; S.money[M.f] = Math.max(0, S.money[M.f] - 250 - 100 * s.tier); return `${SM_FAC[M.f].name}在 ${L.map((t) => t.name).join('、')} 的補給線切斷 ${CC_RULE.fx.cut} 週`; } },
  sabotage: { name: '破壞', goal: (S, M) => `炸掉 ${S.sys[M.sys].name} 的${CC_SAB[M.tgt]}`,
    fx: (S, M) => M.tgt === 'defs' ? `${S.sys[M.sys].name} 的軌道防禦剩三成耐久，${CC_RULE.fx.cut} 週不能重建` : `${S.sys[M.sys].name} 失去${CC_SAB[M.tgt]}（${M.tgt === 'yard' ? '敵方不能在這裡修船、造艦' : '敵方不能在這裡補飛彈'}）`,
    apply(S, M) { const s = S.sys[M.sys]; if (M.tgt === 'yard' && s.yard) { s.yard = false; return `${s.name} 的維修船塢被炸毀`; } if (M.tgt === 'depot' && s.depot) { s.depot = false; return `${s.name} 的補給站被炸毀`; }
      for (const d of s.defs) d.hp *= 0.3; s.fx.cut = Math.max(s.fx.cut || 0, S.turn + CC_RULE.fx.cut); return `${s.name} 的軌道防禦失去管制（剩三成耐久、${CC_RULE.fx.cut} 週不能重建）`; } },
  decap: { name: '斬首', goal: (S, M) => { const q = S.sq.find((x) => x.id === M.sq); return `斬首${q ? smuEsc(q.name) : '目標小隊'}的指揮官（目標現在在 ${S.sys[M.sys].name}）`; },
    fx: () => `目標小隊指揮中斷 ${CC_RULE.fx.dis} 週：不會進攻，戰力當作耐久 ×${CC_RULE.fx.disHp}；旗艦重創`,
    apply(S, M) { const q = S.sq.find((x) => x.id === M.sq); if (!q || !q.ships.length) return '目標小隊已經不在了'; q.dis = S.turn + CC_RULE.fx.dis; const c = q.ships.slice().sort((a, b) => CAP_HULLS[b.key].hp - CAP_HULLS[a.key].hp)[0]; c.hp = Math.max(0.1, c.hp * 0.5); q.to = null; return `${q.name}的指揮官陣亡，指揮中斷 ${CC_RULE.fx.dis} 週`; } },
  wipe: { name: '全滅', goal: (S, M) => `殲滅 ${S.sys[M.sys].name} 的地面守軍`,
    fx: (S, M) => `${S.sys[M.sys].name} 的地面防禦 −2（圍城少 2 週；降到 0 時一取得軌道就投降），每 ${CC_RULE.fx.defBack} 週回復 1`,
    apply(S, M) { const s = S.sys[M.sys]; s.def = Math.max(0, s.def - 2); s.fx.gT = S.turn; return `${s.name} 的地面防禦降到 ${s.def}（圍城 ${ccSiegeNeed(s)} 週${s.def <= 0 ? '，取得軌道就投降' : ''}）`; } },
  strike: { name: '摧毀設施', goal: (S, M) => `炸掉 ${S.sys[M.sys].name} 的${CC_SAB[M.tgt]}（太空）`,
    fx: (S, M) => `${S.sys[M.sys].name} 失去${CC_SAB[M.tgt]}（${M.tgt === 'yard' ? '敵方不能在這裡修船、造艦' : '敵方不能在這裡補飛彈'}）`,
    apply(S, M) { const s = S.sys[M.sys]; if (M.tgt === 'yard') { s.yard = false; return `${s.name} 的維修船塢被炸毀`; } s.depot = false; return `${s.name} 的補給站被炸毀`; } },
  escort: { name: '護送', goal: (S, M) => `護送運輸船隊到 ${S.sys[M.sys].name}`,
    fx: (S, M) => `${S.sys[M.sys].name} 的軌道防禦修好、多一座防禦平台（最多 5 座），地面防禦 +1，補給線恢復`,
    apply(S, M) { const s = S.sys[M.sys]; for (const d of s.defs) d.hp = 1; s.defs = s.defs.filter((d) => d.hp > 0); if (s.defs.length < 5) s.defs.push({ type: 'plat', hp: 1 }); s.def = Math.min((s.def0 || s.def) + 1, s.def + 1); s.fx.cut = 0; return `${s.name} 的軌道防禦整補完成（${s.defs.length} 座），地面防禦 ${s.def}`; } },
  rescue: { name: '救援撤離', goal: (S, M) => `救出在 ${S.sys[M.sys].name} 受困的友艦`,
    fx: (S) => `救出的友艦在最近的己方星系組成一支${SM_FAC[S.fac].name}小隊（2 艘，AI 指揮）`,
    apply(S, M) {
      const L = S.sys.filter((t) => t.owner === S.fac && ccAt(S, t.id, S.fac).length < CC_RULE.maxSq).sort((a, b) => smHop(S, M.sys, a.id) - smHop(S, M.sys, b.id));
      if (!L.length) return '附近的己方星系都滿了：友艦歸建後分散到各隊';
      const q = ccNewSquad(S, S.fac, L[0].id, ccRandHulls(S, 2)); for (const c of q.ships) c.hp = 0.6;
      return `救出的友艦在 ${L[0].name} 組成${q.name}（2 艘，帶傷）`;
    } },
  scan: { name: '偵察', goal: (S, M) => `偵察 ${S.sys[M.sys].name}`,
    fx: (S, M) => `${S.sys[M.sys].name} 周圍 2 個航道內 ${CC_RULE.fx.intel} 週：看得到敵方小隊的預定動向`,
    apply(S, M) { const L = S.sys.filter((t) => smHop(S, M.sys, t.id) <= 2); for (const t of L) t.fx.intel = S.turn + CC_RULE.fx.intel; return `取得 ${S.sys[M.sys].name} 周圍 ${L.length} 個星系的情報（${CC_RULE.fx.intel} 週）`; } },
  run: { name: '滲透偵察', goal: (S, M) => `穿過封鎖線，滲透偵察 ${S.sys[M.sys].name}`,
    fx: (S, M) => `${S.sys[M.sys].name} 周圍 2 個航道內 ${CC_RULE.fx.intel} 週：看得到敵方小隊的預定動向`,
    apply(S, M) { const L = S.sys.filter((t) => smHop(S, M.sys, t.id) <= 2); for (const t of L) t.fx.intel = S.turn + CC_RULE.fx.intel; return `取得 ${S.sys[M.sys].name} 周圍 ${L.length} 個星系的情報（${CC_RULE.fx.intel} 週）`; } },
};
const ccMisName = (M) => M.type === 'op' ? CC_OPFX[M.op].name : CC_MIS[M.type].name;
// 特戰任務：小隊要在目標星系或相鄰的星系（滲透出擊）
function ccCanOp(S, M, P = ccPl(S)) { return !!(P && P.ships.length && M.state === 'open' && M.type === 'op' && (P.sys === M.sys || S.adj[P.sys].includes(M.sys))); }
function ccGenMissions(S) {
  if (S.fin) return;
  const P = ccPl(S); if (!P) return;
  const open = () => S.missions.filter((M) => M.state === 'open');
  const near = (n) => S.sys.filter((s) => s.owner !== S.fac && ccHostile(S, S.fac, s.owner) && smHop(S, P.sys, s.id) <= n);
  const taken = (sid) => open().some((M) => M.sys === sid);
  const tc = near(3).filter((s) => !taken(s.id)).sort((a, b) => smHop(S, P.sys, a.id) - smHop(S, P.sys, b.id))[0];
  if (tc && open().length < CC_RULE.maxMis && !open().some((M) => M.type === 'cap')) S.missions.push({ id: S.nextId++, type: 'cap', sys: tc.id, due: S.turn + 6 + smHop(S, P.sys, tc.id) * 2, state: 'open', reward: { money: 600 + tc.tier * 200, merit: 250 } });
  // 特戰任務：1～2 個，每種找合適的目標
  const enemy = near(3).filter((s) => s.owner !== SM_N && !taken(s.id));
  const pick = {
    intercept: () => { const s = enemy.filter((t) => smHop(S, P.sys, t.id) <= 2).sort((a, b) => b.tier - a.tier)[0]; return s && { sys: s.id, f: s.owner }; },
    sabotage: () => { const s = enemy.filter((t) => ccDefsAlive(t).length >= 2).sort((a, b) => ccDefsAlive(b).length - ccDefsAlive(a).length)[0]; return s && { sys: s.id, tgt: 'defs' }; },   // 地面：軌道防禦的管制中心
    strike: () => { const s = enemy.filter((t) => t.yard || t.depot).sort((a, b) => (b.yard ? 2 : 1) - (a.yard ? 2 : 1))[0]; return s && { sys: s.id, tgt: s.yard ? 'yard' : 'depot' }; },   // 太空：船塢、補給站
    escort: () => { const s = S.sys.filter((t) => t.owner === S.fac && !taken(t.id) && smHop(S, P.sys, t.id) <= 2 && S.adj[t.id].some((j) => S.sys[j].owner !== SM_N && ccHostile(S, S.fac, S.sys[j].owner))).sort((a, b) => ccDefsAlive(a).length - ccDefsAlive(b).length || a.def - b.def)[0]; return s && { sys: s.id, f: S.fac }; },
    rescue: () => { const L = S.sys.filter((t) => t.owner !== S.fac && !taken(t.id) && smHop(S, P.sys, t.id) <= 3 && smHop(S, P.sys, t.id) >= 1); const s = L[Math.floor(smRnd(S) * L.length)]; return s && { sys: s.id }; },
    scan: () => { const L = enemy.filter((t) => smHop(S, P.sys, t.id) >= 2); const s = L[Math.floor(smRnd(S) * L.length)]; return s && { sys: s.id }; },
    decap: () => { const q = S.sq.filter((x) => x.fac !== S.fac && x.fac !== SM_N && x.ships.length >= 2 && !ccDis(S, x) && ccHostile(S, S.fac, x.fac) && smHop(S, P.sys, x.sys) <= 3 && !open().some((M) => M.sq === x.id)).sort((a, b) => ccPow([b]) - ccPow([a]))[0]; return q && { sys: q.sys, sq: q.id }; },
    wipe: () => { const s = enemy.filter((t) => t.def >= 2).sort((a, b) => (open().some((M) => M.type === 'cap' && M.sys === b.id) ? 1 : 0) - (open().some((M) => M.type === 'cap' && M.sys === a.id) ? 1 : 0) || b.def - a.def)[0]; return s && { sys: s.id }; },
  };
  const rew = { intercept: [400, 170], sabotage: [350, 150], decap: [450, 200], wipe: [350, 160], run: [250, 120], strike: [350, 150], escort: [300, 140], rescue: [350, 160], scan: [250, 120] };
  const nOp = 1 + (smRnd(S) < 0.6 ? 1 : 0), types = Object.keys(pick).sort(() => smRnd(S) - 0.5);
  for (let k = 0, made = 0; k < types.length && made < nOp && open().length < CC_RULE.maxMis; k++) {
    const op = types[k]; if (open().some((M) => M.op === op)) continue;
    const t = pick[op](); if (!t) continue;
    S.missions.push({ id: S.nextId++, type: 'op', op, ...t, due: S.turn + 4 + smHop(S, P.sys, t.sys), state: 'open', reward: { money: rew[op][0], merit: rew[op][1] } }); made++;
  }
  const L = S.missions.filter((M) => M.state === 'open' && M.t0 == null); for (const M of L) { M.t0 = S.turn; ccLog(S, `新任務：${ccMisName(M)}・${CC_MIS[M.type].desc(S, M)}`, 'ev'); }
}
// 每週：時限、斬首目標的位置（目標小隊會移動）
function ccMissionTick(S, track) {
  for (const M of S.missions) {
    if (M.state !== 'open') continue;
    if (M.type === 'op' && M.op === 'decap') { const q = S.sq.find((x) => x.id === M.sq); if (!q || !q.ships.length) { M.state = 'gone'; ccLog(S, '斬首的目標小隊已經被消滅：任務取消', ''); continue; } M.sys = q.sys; }
    if (M.type === 'op' && M.op !== 'decap' && M.f != null && S.sys[M.sys].owner !== M.f) { M.state = 'gone'; ccLog(S, `${S.sys[M.sys].name} 已經易主：${ccMisName(M)}任務取消`, ''); continue; }
    if (!track && S.turn >= M.due) { M.state = 'fail'; ccLog(S, `任務失敗（時限已過）：${CC_MIS[M.type].desc(S, M)}`, 'bad'); }
  }
}
function ccMissionDone(S, M, ok) {
  M.state = ok ? 'done' : 'fail';
  if (!ok) return;
  S.pl.money += M.reward.money; S.pl.merit += M.reward.merit;
  ccLog(S, `任務完成：${ccMisName(M)}・${M.type === 'op' ? CC_OPFX[M.op].goal(S, M) : CC_MIS[M.type].desc(S, M)}（資金 +${M.reward.money}、戰功 +${M.reward.merit}）`, 'ok');
  if (M.type === 'op') { const t = CC_OPFX[M.op].apply(S, M); M.res = t; ccLog(S, `任務的影響：${t}`, 'ok'); }
}

function ccSave(S) { try { STORE.setItem(CC_STORE, JSON.stringify(S)); return true; } catch (e) { return false; } }
function ccLoad() { try { const t = STORE.getItem(CC_STORE); const S = t ? JSON.parse(t) : null; if (!S || S.v !== 1) return null; for (const s of S.sys) { if (s.def0 == null) s.def0 = s.def; if (!s.fx) s.fx = {}; if (!s.scene) s.scene = ccSceneFor(S, s); } return S; } catch (e) { return null; } }
