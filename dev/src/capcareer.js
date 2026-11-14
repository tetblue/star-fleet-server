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
// 第 7 階段：升遷（CC_RANKS）。戰功到了上級發「升遷考核」（佔領任務），完成就一定升（有人出缺）。軍階決定能帶幾隊、能造的船型、任務數、據點。
// 周目（CC_META，跨局）：當上的最高軍階解鎖較高的開局身分、地獄難度。
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
  { name: '地獄', li: 3, aggr: 1.5, need: 3, desc: '敵方的特製戰艦強兩級，AI 非常積極、收入更多。' },
];
const CC_RULE = {
  siegeT: SM_RULE.siegeT,   // 圍城幾週地面投降（沿用星海生涯）
  maxSq: 2,                 // 一個星系每個勢力最多幾隊（一場戰鬥每方最多 2 隊）
  maxShips: 5,              // 每隊最多幾艘
  salary: 80,               // 玩家每週的薪餉
  repair: 1.2,              // 修理：每點缺少的船體多少資金（要在有維修船塢的己方星系）
  missile: 3,               // 補飛彈：每枚多少資金（有補給站、維修船塢或首都的己方星系）
  build: { assault: 500, gunship: 900, support: 700, ew: 800, stealth: 850 },   // 新造艦的價錢
  buildW: { assault: 1, gunship: 3, support: 2, ew: 2, stealth: 2 },   // 建造幾週（大船久）；一座船塢一次造一艘
  yardQ: 4,                 // 一座船塢最多排幾艘（造船、改裝一起算）
  fit: { base: 50, mod: { main: 300, tur: 150, msl: 200, def: 220, eng: 160 }, stock: 0.5, mk: [0, 0, 250, 450] },   // 改裝：工錢＋換模組（換回原廠半價）＋每升一級 Mk
  baseCost: 400,            // 把據點搬到另一個有維修船塢的己方星系
  defEvery: 2,              // 己方星系每幾週補一座防禦（沒有敵人在場時）
  merit: { ship: 40, cap: 300, def: 30 },
  fx: { cut: 4, dis: 4, intel: 5, disHp: 0.7, defBack: 4 },   // 任務效果：補給切斷幾週、指揮中斷幾週（耐久當作 ×0.7）、偵察幾週、地面防禦每幾週回復 1
  maxMis: 4,
  fame: { cap: 4, battle: 1, op: 2, neutral: 40, back: 0.05 },   // 勢力聲望：佔領、交戰、特戰的增減；中立固定 40；每週往 50 回 5%
  fav: { fail: 5, ok: 2 },  // 你和發出任務的勢力的好感度（0～100，開局 50）：任務失敗 −5、完成 +2；任務獎勵 ×(0.75 + 好感度/200)
  aiOp: 0.35,               // AI 勢力每週下達一次特戰的機率（×難度的積極度）
  sqMerit: [0, 800, 2000],   // 指揮權：戰功到了才能多帶一個小隊（暫定，第 7 階段改成升遷）
};
const CC_HULL_LETTER = { assault: '突', gunship: '砲', support: '支', ew: '電', stealth: '匿' };

// ───── 升遷（第 7 階段）─────
// merit＝發考核的戰功；sq＝能帶幾隊；hulls＝能造的船型；mis＝同時最多幾個任務；base＝據點（1＝有據點、2＝據點多一座軌道防禦站）
const CC_RANKS = [
  { name: '單艦艦長', merit: 0, sq: 1, hulls: ['assault', 'gunship', 'support'], mis: 3, base: 0, desc: '帶一個小隊' },
  { name: '小隊長', merit: 600, sq: 2, hulls: ['assault', 'gunship', 'support', 'ew'], mis: 4, base: 0, desc: '帶兩個小隊・可以建造電戰艦・任務多一個' },
  { name: '特戰隊長', merit: 1600, sq: 3, hulls: ['assault', 'gunship', 'support', 'ew', 'stealth'], mis: 5, base: 1, desc: '帶三個小隊・可以建造匿蹤艦・有自己的據點（修理、補飛彈半價，軌道防禦每週重建）' },
  { name: '特戰司令', merit: 3200, sq: 4, hulls: ['assault', 'gunship', 'support', 'ew', 'stealth'], mis: 6, base: 2, desc: '帶四個小隊・據點多一座軌道防禦站' },
];
const ccRankOf = (S) => CC_RANKS[S.pl.rank || 0];
const ccHullOk = (S, k) => ccRankOf(S).hulls.includes(k);
const ccMaxMis = (S) => ccRankOf(S).mis;
// 周目：跨局的紀錄（最高軍階、局數）；開局身分照最高軍階解鎖
const CC_META = 'fleet.capcareer.meta';
const CC_STARTS = [
  { name: '單艦艦長', rank: 0, need: 0, desc: '從一個小隊開始' },
  { name: '小隊長', rank: 1, need: 1, desc: '開局就帶兩個小隊、可以造電戰艦' },
  { name: '特戰隊長', rank: 2, need: 2, desc: '開局帶三個小隊、可以造匿蹤艦，有據點' },
];
function ccMetaLoad() { try { return Object.assign({ runs: 0, best: 0 }, JSON.parse(STORE.getItem(CC_META) || 'null') || {}); } catch (e) { return { runs: 0, best: 0 }; } }
function ccMetaSave(M) { try { STORE.setItem(CC_META, JSON.stringify(M)); } catch (e) { /* 只在本次 */ } }
// 升遷考核：戰功到了，上級交辦一個佔領任務（已經有佔領任務就把它當考核）；完成＝一定升遷
function ccExamTick(S) {
  const N = CC_RANKS[(S.pl.rank || 0) + 1], P = ccPl(S); if (!N || !P || S.fin) return;
  if (S.pl.merit < N.merit || (S.pl.examCd || 0) > S.turn || S.missions.some((M) => M.exam && M.state === 'open')) return;
  let M = S.missions.find((x) => x.state === 'open' && x.type === 'cap');
  if (!M) {
    const t = S.sys.filter((s) => s.owner !== S.fac && s.owner !== SM_N && ccHostile(S, S.fac, s.owner) && smHop(S, P.sys, s.id) <= 3).sort((a, b) => smHop(S, P.sys, a.id) - smHop(S, P.sys, b.id) || b.tier - a.tier)[0]
      || S.sys.filter((s) => s.owner !== S.fac && ccHostile(S, S.fac, s.owner)).sort((a, b) => smHop(S, P.sys, a.id) - smHop(S, P.sys, b.id))[0];
    if (!t) return;
    M = { id: S.nextId++, type: 'cap', sys: t.id, due: S.turn + 6 + smHop(S, P.sys, t.id) * 2, state: 'open', reward: { money: 600 + t.tier * 200, merit: 250 }, t0: S.turn };
    S.missions.push(M);
  } else M.due = Math.max(M.due, S.turn + 5);
  M.exam = N.name; M.reward.money += 400;
  ccLog(S, `升遷考核：${CC_MIS.cap.desc(S, M)}。完成就升任${N.name}（${N.desc}）`, 'ev');
}
function ccPromote(S) {
  const r = (S.pl.rank || 0) + 1, N = CC_RANKS[r]; if (!N) return;
  S.pl.rank = r;
  ccLog(S, `${smPick(S, SM_NPC)}（${N.name}）${smPick(S, SM_NPC_EXIT)}，職缺由你遞補：升任${N.name}（${N.desc}）`, 'ev');
  if (N.base) ccBaseTick(S, true);
  const M = ccMetaLoad(); if (r > M.best) { M.best = r; ccMetaSave(M); const u = CC_STARTS.find((x) => x.need === r), d = CC_DIFF.find((x) => x.need === r); if (u || d) ccLog(S, `周目解鎖：${[u ? `開局身分「${u.name}」` : '', d ? `「${d.name}」難度` : ''].filter(Boolean).join('、')}`, 'ok'); }
}
// 據點：特戰隊長以上。沒有據點（剛升遷或失守）就選親自指揮的小隊附近有維修船塢的己方星系
function ccBaseTick(S, force) {
  const R = ccRankOf(S); if (!R.base) return;
  const b = S.pl.base != null ? S.sys[S.pl.base] : null;
  if (b && b.owner !== S.fac) { b.plBase = 0; S.pl.base = null; ccLog(S, `你的據點 ${b.name} 失守`, 'bad'); }
  if (S.pl.base == null) {
    const P = ccPl(S), L = S.sys.filter((s) => s.owner === S.fac && s.yard).sort((a, c) => smHop(S, P.sys, a.id) - smHop(S, P.sys, c.id));
    const s = L[0] || S.sys.find((x) => x.owner === S.fac && x.cap); if (!s) return;
    ccSetBase(S, s); ccLog(S, `${s.name} 成為你的據點`, force ? 'ev' : 'ok');
  }
  const B = S.sys[S.pl.base]; if (B) B.plBase = R.base;
}
function ccSetBase(S, s) {
  if (S.pl.base != null && S.sys[S.pl.base]) S.sys[S.pl.base].plBase = 0;
  S.pl.base = s.id; s.plBase = ccRankOf(S).base;
}
function ccMoveBase(S, s) {
  if (!ccRankOf(S).base || s.owner !== S.fac || !s.yard || S.pl.base === s.id || S.pl.money < CC_RULE.baseCost) return false;
  S.pl.money -= CC_RULE.baseCost; ccSetBase(S, s); ccLog(S, `據點搬到 ${s.name}（${CC_RULE.baseCost} 資金）`, 'ok'); return true;
}

// ───── 新局 ─────
function ccNewGame(o) {
  const R = CC_ROLES[o.role] || CC_ROLES.emp, ST = CC_STARTS[o.start || 0] || CC_STARTS[0];
  const S = { v: 1, r: (o.seed >>> 0) || 1, turn: 1, diff: o.diff != null ? o.diff : 1, role: o.role, fac: R.fac, nextId: 1, sys: [], edges: [], adj: [], sq: [], log: [], missions: [], fin: null, pendB: null,
    rel: [[0, -60, -100, 0], [-60, 0, -100, 0], [-100, -100, 0, 0], [0, 0, 0, 0]], money: [0, 0, 0, 0], fame: [50, 50, 50, 50],
    pl: { money: 600, merit: CC_RANKS[ST.rank].merit, sq: 0, kills: 0, caps: 0, weekFought: 0, build: [], yq: [], res: [], rank: ST.rank, base: null, start: o.start || 0 } };
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
  // 較高的開局身分：多帶幾個小隊（每隊 2 艘）、據點
  for (let k = 1; k < CC_RANKS[ST.rank].sq; k++) ccNewSquad(S, R.fac, front.id, ccRandHulls(S, 2), { pl: true, name: `第${k + 1}小隊` });
  if (CC_RANKS[ST.rank].base) ccBaseTick(S, true);
  if (!o.noMeta) { const M = ccMetaLoad(); M.runs++; ccMetaSave(M); }
  // 起點附近不要有 AI 小隊把玩家擠掉（一個星系最多 2 隊）
  ccLog(S, `${ST.rank ? `開局身分：${CC_RANKS[ST.rank].name}。` : ''}你是${R.name}，帶著小隊（${R.hulls.map((k) => CAP_HULLS[k].name).join('、')}）駐守前線的 ${front.name}。開局科技：${R.techName}`, 'ev');
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
function ccDefBase(s) { const b = ccDefBase0(s); return s.plBase >= 2 ? b.concat(['orb']) : b; }   // 特戰司令的據點：多一座軌道防禦站
function ccDefBase0(s) {
  if (s.cap) return ['orb', 'plat', 'plat', 'plat'];
  if (s.owner === SM_N) return s.tier >= 2 ? ['plat', 'plat'] : ['plat'];
  if (s.owner === SM_P) return ['plat'];
  return s.tier >= 2 ? ['orb', 'plat', 'plat'] : ['plat', 'plat'];
}
function ccRandHulls(S, n) { return Array.from({ length: n }, () => { const r = smRnd(S); return r < 0.4 ? 'assault' : r < 0.7 ? 'gunship' : 'support'; }); }
function ccNewSquad(S, fac, sys, hulls, o = {}) {
  const q = { id: S.nextId++, fac, sys, prev: sys, to: null, name: o.name || `${SM_FAC[fac].name}第${S.nextId - 1}小隊`, pl: !!o.pl, ships: hulls.map(capNewShip) };
  S.sq.push(q); return q;
}
// 船的經驗（參戰、存活、擊沉）：升級時記在紀錄裡（只記你的小隊）
function ccXp(S, q, c, n) {
  capShipFix(c); c.xp += Math.round(n); const lv = capLvOf(c.xp);
  if (lv <= c.lv) return;
  const up = capMkCapLv(lv) > capMkCapLv(c.lv); c.lv = lv;
  if (q.pl) ccLog(S, `${q.name}的${CAP_HULLS[c.key].name}升到 Lv${lv}${up ? `（等級上限可以裝到 ${CAP_MK_NAME[capMkCapLv(lv)]}）` : ''}`, 'ok');
}
function ccLog(S, t, c) { S.log.push({ turn: S.turn, t, c: c || '' }); if (S.log.length > 300) S.log.splice(0, S.log.length - 300); }
const ccPl = (S) => S.sq.find((q) => q.id === S.pl.sq);
const ccAt = (S, sid, fac) => S.sq.filter((q) => q.sys === sid && q.ships.length && (fac == null || q.fac === fac));
const ccHostile = (S, a, b) => a !== b && (a === SM_N || b === SM_N ? true : S.rel[a][b] < 0);   // 中立星系：誰都可以佔
const ccDefsAlive = (s) => s.defs.filter((d) => d.hp > 0);
// ───── 星圖的戰爭迷霧（2026-11-11）─────
// 看得到（即時）：你的勢力擁有的星系、有你的勢力的小隊的星系、你的小隊相鄰的星系、偵察中的星系。
// 看不到的星系顯示最後一次看到的樣子（S.mem，標「N 週前」）；從沒看過的＝未知（擁有者也不知道）。
function ccVis(S, s) {
  if (s.owner === S.fac || ccIntel(S, s)) return true;
  return S.sq.some((q) => q.ships.length && ((q.fac === S.fac && q.sys === s.id) || (q.pl && S.adj[q.sys].includes(s.id))));
}
const ccSnapSq = (q) => ({ id: q.id, name: q.name, fac: q.fac, sys: q.sys, dis: q.dis, ships: q.ships.map((c) => ({ key: c.key, hp: c.hp, sh: c.sh, msl: c.msl, lv: c.lv })) });
function ccFogTick(S) {
  if (!S.mem) S.mem = {};
  for (const s of S.sys) if (ccVis(S, s)) S.mem[s.id] = { t: S.turn, owner: s.owner, def: s.def, defs: ccDefsAlive(s).map((d) => ({ type: d.type, hp: d.hp })), yard: !!s.yard, depot: !!s.depot, sg: s.sg ? { f: s.sg.f, w: s.sg.w } : null, sq: ccAt(S, s.id).map(ccSnapSq) };
}
// 星系「目前所知」的樣子：live＝即時；age＝幾週前的情報（null＝從沒看過，owner＝−1）
function ccSee(S, s) {
  if (ccVis(S, s)) return { live: true, age: 0, owner: s.owner, def: s.def, defs: ccDefsAlive(s), yard: s.yard, depot: s.depot, sg: s.sg, sq: ccAt(S, s.id) };
  const M = S.mem && S.mem[s.id];
  if (!M) return { live: false, age: null, owner: -1, def: null, defs: [], yard: false, depot: false, sg: null, sq: [] };
  return { live: false, age: S.turn - M.t, owner: M.owner, def: M.def, defs: M.defs, yard: M.yard, depot: M.depot, sg: M.sg, sq: M.sq };
}
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
const ccSlots = (S) => ccRankOf(S).sq;
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
    if (live.length < base.length && ++s.defT >= (s.id === S.pl.base ? 1 : CC_RULE.defEvery)) { s.defT = 0; s.defs = live.concat([{ type: base[live.length], hp: 0.5 }]); }
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
  ccAiOps(S);
  if (S.fame) for (const f of [SM_A, SM_E, SM_P]) S.fame[f] += (50 - S.fame[f]) * CC_RULE.fame.back;
  ccYardTick(S);
  // 舊存檔：以前訂造、下週直接到的船
  for (const b of S.pl.build.splice(0)) {   // 字串＝加入親自指揮的小隊
    const key = b.key || b, add = capNewShip(key);
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
  ccBaseTick(S); ccExamTick(S);
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
  if (B.A[0] && B.D[0]) { ccFame(S, (aWin ? B.A : B.D)[0].fac, CC_RULE.fame.battle); ccFame(S, (aWin ? B.D : B.A)[0].fac, -CC_RULE.fame.battle); }
  const lA = nA - B.A.reduce((a, q) => a + q.ships.length, 0), lD = nD - B.D.reduce((a, q) => a + q.ships.length, 0);
  // 經驗：活下來的船＝參戰＋存活，再平分對方的損失（計算的戰鬥不知道誰擊沉的）
  const xpSide = (L, foeLost) => { const live = L.flatMap((q) => q.ships.map((c) => [q, c])), kx = live.length ? foeLost * CAP_XP.calc / live.length : 0; for (const [q, c] of live) ccXp(S, q, c, CAP_XP.fight + CAP_XP.live + kx); };
  xpSide(B.A, lD); xpSide(B.D, lA);
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
    const weak = ccWeakGround(S, s);
    if (s.sg.raid || s.sg.w >= ccSiegeNeed(s) || weak) ccCapture(S, s, f, s.sg.raid ? '地面突襲成功，守軍投降' : weak ? `守軍評估無力抵抗（投降評分 ${ccGroundScore(S, s, f).v.toFixed(1)}），直接投降` : `圍城 ${s.sg.w} 週，地面投降`);
  }
}
// 圍城要幾週：地面防禦被打掉多少，就少幾週（全滅任務）
function ccSiegeNeed(s) { return Math.max(1, CC_RULE.siegeT - Math.max(0, (s.def0 || s.def) - s.def)); }
// 地面投降評分（取得軌道後每週算一次）：守方（擁有者）－攻方（圍城的勢力），負數就投降，0 或正數就抵抗到圍城期滿
//   聲望：(守方 − 攻方) / 25；艦隊戰力：全勢力的 ccPow，2(守−攻)/(守+攻+10)；地面防禦：這個星系的 − 攻方相鄰星系最高的 ×0.5；
//   鄰近星系艦隊戰力：這個星系與相鄰星系裡的小隊，2(守−攻)/(守+攻+5)
function ccGroundScore(S, s, f) {
  const o = s.owner, fame = (x) => x === SM_N ? CC_RULE.fame.neutral : ((S.fame || [])[x] ?? 50);
  const pw = (x) => ccPow(S.sq.filter((q) => q.fac === x && q.ships.length));
  const near = [s.id, ...S.adj[s.id]], np = (x) => ccPow(S.sq.filter((q) => q.fac === x && q.ships.length && near.includes(q.sys)));
  const gA = Math.max(0, ...S.adj[s.id].map((j) => S.sys[j]).filter((t) => t.owner === f).map((t) => t.def));
  const Po = pw(o), Pf = pw(f), No = np(o), Nf = np(f);
  const p = { fame: (fame(o) - fame(f)) / 25, fleet: 2 * (Po - Pf) / (Po + Pf + 10), ground: s.def - gA * 0.5, near: 2 * (No - Nf) / (No + Nf + 5) };
  return { v: p.fame + p.fleet + p.ground + p.near, p };
}
function ccWeakGround(S, s) { const f = s.sg ? s.sg.f : null; return f != null && ccGroundScore(S, s, f).v < 0; }
// 勢力聲望（0～100，開局 50）：佔領、計算的交戰、特戰的成敗都會改變；每週往 50 回一點
function ccFame(S, f, d) { if (f == null || f < 0 || f === SM_N) return; if (!S.fame) S.fame = [50, 50, 50, 50]; S.fame[f] = Math.max(0, Math.min(100, S.fame[f] + d)); }
function ccCapture(S, s, f, why) {
  const was = s.owner; s.owner = f; s.sg = null; ccFame(S, f, CC_RULE.fame.cap); ccFame(S, was, -CC_RULE.fame.cap); s.defs = []; s.defT = 0; s.fx.cut = 0;
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
      if (weak) { weak.ships.push(capNewShip(key)); S.money[f] -= cost; }
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
const ccBaseK = (S, P) => (P.sys === S.pl.base ? 0.5 : 1);   // 據點：半價
function ccRepairCost(S, P) { return Math.round(P.ships.reduce((a, c) => a + (1 - c.hp) * CAP_HULLS[c.key].hp, 0) * CC_RULE.repair * ccBaseK(S, P)); }
function ccMissileCost(S, P) { return Math.round(P.ships.reduce((a, c) => a + (CAP_HULLS[c.key].msl ? (1 - c.msl) * CAP_HULLS[c.key].msl.n : 0), 0) * CC_RULE.missile * ccBaseK(S, P)); }
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
// ───── 生產：船塢排隊（研發、生產、改裝的第 2 步，2026-11-15）─────
// 在有維修船塢的己方星系訂造：一座船塢一次造一艘，排在前面的先造；大船造得久（CC_RULE.buildW）。
// 造好的船：訂造時指定的小隊還在那個星系、沒滿 → 直接加入；不然停在那座船塢當預備艦（S.pl.res），之後再編進小隊或成立新小隊。
// 船塢的星系失守、船塢被打掉：排隊暫停（可以取消）；停在那裡的預備艦被俘。
// S.pl.yq＝[{ id, key, sys, left, tot, to, held }]；S.pl.res＝[{ id, sys, c }]（c＝船的記錄，等級、模組照樣保留）
const ccYq = (S, sid) => S.pl.yq.filter((o) => o.sys === sid);
const ccResAt = (S, sid) => S.pl.res.filter((r) => r.sys === sid);
// 能不能在這裡訂造：己方星系、有船塢、你有小隊在這裡（或是你的據點）
function ccCanOrder(S, s) {
  if (s.owner !== S.fac) return '要在己方的星系';
  if (!s.yard) return '這裡沒有維修船塢';
  if (!S.sq.some((q) => q.pl && q.ships.length && q.sys === s.id) && S.pl.base !== s.id) return '要有你的小隊在這裡（或是你的據點）';
  if (ccYq(S, s.id).length >= CC_RULE.yardQ) return `這座船塢已經排了 ${CC_RULE.yardQ} 艘`;
  return '';
}
// 這艘排隊的船還要幾週才好（前面的先造）
function ccYqEta(S, o) { let w = 0; for (const x of ccYq(S, o.sys)) { w += x.left; if (x === o) break; } return w; }
function ccOrder(S, key, s, to) {
  const cost = CC_RULE.build[key];
  if (!ccHullOk(S, key) || ccCanOrder(S, s) || S.pl.money < cost) return false;
  const w = CC_RULE.buildW[key] || 1;
  S.pl.money -= cost; S.pl.yid = (S.pl.yid || 0) + 1;
  const o = { id: S.pl.yid, key, sys: s.id, left: w, tot: w, to: to ?? null }; S.pl.yq.push(o);
  const q = to != null && ccSqById2(S, to);
  ccLog(S, `在 ${s.name} 訂造一艘${CAP_HULLS[key].name}（${cost} 資金，${ccYqEta(S, o)} 週後完成${q ? `，加入${q.name}` : '，停在船塢'}）`, 'ok'); return true;
}
// 取消：還沒開工全額退費，開工了退一半
const ccYqCost = (o) => (o.cost != null ? o.cost : CC_RULE.build[o.key]);
const ccYqBack = (o) => Math.round(ccYqCost(o) * (o.left === o.tot ? 1 : 0.5));
function ccOrderCancel(S, id) {
  const o = S.pl.yq.find((x) => x.id === id); if (!o) return false;
  const back = ccYqBack(o);
  S.pl.yq = S.pl.yq.filter((x) => x !== o); S.pl.money += back;
  if (o.kind === 'fit') { const q = ccFitBack(S, o, o.c); ccLog(S, `取消${CAP_HULLS[o.key].name}的改裝（退回 ${back} 資金），${q ? `船回到${q.name}` : '船停在船塢'}`, ''); return true; }
  ccLog(S, `取消在 ${S.sys[o.sys].name} 訂造的${CAP_HULLS[o.key].name}（退回 ${back} 資金）`, ''); return true;
}
const ccSqById2 = (S, id) => S.sq.find((q) => q.id === id);
// 每週結束：每座船塢造排第一的那艘；預備艦在船塢裡修好、補滿
function ccYardTick(S) {
  S.pl.yq = S.pl.yq.filter((o) => { if (o.kind !== 'fit' || S.sys[o.sys].owner === S.fac) return true; ccLog(S, `${S.sys[o.sys].name} 失守：在船塢改裝的${CAP_HULLS[o.key].name}被俘`, 'bad'); return false; });
  const seen = new Set();
  for (const o of S.pl.yq) {
    if (seen.has(o.sys)) continue; seen.add(o.sys);
    const s = S.sys[o.sys];
    if (s.owner !== S.fac || !s.yard) { if (!o.held) ccLog(S, `${s.name}${s.owner !== S.fac ? '失守' : '的船塢被摧毀'}：${CAP_HULLS[o.key].name}的${o.kind === 'fit' ? '改裝' : '建造'}暫停`, 'bad'); o.held = 1; continue; }
    o.held = 0; if (--o.left > 0) continue;
    o.fin = true;
    if (o.kind === 'fit') { const c = o.c; c.mod = { ...o.fit.mod }; c.mk = { ...o.fit.mk }; const q = ccFitBack(S, o, c); ccLog(S, `${s.name} 的船塢改裝好${CAP_HULLS[o.key].name}（${ccFitTx(o.fit, CAP_HULLS[o.key])}），${q ? `回到${q.name}` : '停在船塢當預備艦'}`, 'ok'); continue; }
    const c = capNewShip(o.key), q = o.to != null && S.sq.find((x) => x.id === o.to && x.pl && x.ships.length && x.sys === o.sys && x.ships.length < CC_RULE.maxShips);
    if (q) { q.ships.push(c); ccLog(S, `${s.name} 的船塢造好${CAP_HULLS[o.key].name}，加入${q.name}`, 'ok'); }
    else { S.pl.yid = (S.pl.yid || 0) + 1; S.pl.res.push({ id: S.pl.yid, sys: o.sys, c }); ccLog(S, `${s.name} 的船塢造好${CAP_HULLS[o.key].name}，停在船塢當預備艦`, 'ok'); }
  }
  S.pl.yq = S.pl.yq.filter((o) => !o.fin);
  S.pl.res = S.pl.res.filter((r) => {
    const s = S.sys[r.sys];
    if (s.owner !== S.fac) { ccLog(S, `${s.name} 失守：停在船塢的${CAP_HULLS[r.c.key].name}被俘`, 'bad'); return false; }
    if (s.yard) { r.c.hp += (1 - r.c.hp) * CAP_REPAIR.yard; r.c.sh = 1; r.c.msl = 1; }
    return true;
  });
}
// 預備艦編進小隊 to（同一個星系、沒滿）；to＝'new' 成立新小隊（要有指揮權）
function ccResJoin(S, rid, to) {
  const r = S.pl.res.find((x) => x.id === rid); if (!r) return '沒有這艘預備艦';
  let q;
  if (to === 'new') { if (ccOwnCount(S) >= ccSlots(S)) return `指揮權不夠（${ccRankOf(S).name}最多帶 ${ccSlots(S)} 隊）`; q = ccNewSquad(S, S.fac, r.sys, [], { pl: true, name: ccOwnName(S) }); }
  else { q = ccSqById2(S, to); if (!q || !q.pl || q.sys !== r.sys) return '要在同一個星系'; if (q.ships.length >= CC_RULE.maxShips) return '那一隊已經滿了'; }
  q.ships.push(r.c); S.pl.res = S.pl.res.filter((x) => x !== r);
  ccLog(S, `預備艦${CAP_HULLS[r.c.key].name}編進${q.name}`, 'ok'); return '';
}
// 小隊的船停進船塢當預備艦（己方有船塢的星系；親自指揮的小隊至少留一艘）
function ccResPut(S, q, k) {
  const s = S.sys[q.sys], c = q.ships[k]; if (!c) return '沒有這艘船';
  if (s.owner !== S.fac || !s.yard) return '要在己方有船塢的星系';
  if (q.id === S.pl.sq && q.ships.length <= 1) return '親自指揮的小隊至少要留一艘';
  q.ships.splice(k, 1); S.pl.yid = (S.pl.yid || 0) + 1; S.pl.res.push({ id: S.pl.yid, sys: q.sys, c });
  if (!q.ships.length) { S.sq = S.sq.filter((x) => x !== q); for (const o of S.pl.yq) if (o.to === q.id) o.to = null; }
  ccLog(S, `${q.name}的${CAP_HULLS[c.key].name}停進 ${s.name} 的船塢`, ''); return '';
}
// ───── 改裝、Mk 升級（研發、生產、改裝的第 3 步，2026-11-15）─────
// 在己方有船塢的星系，把船送進船塢換模組、升 Mk。一次改裝佔用船塢一週，跟造船排同一個隊（插在還沒開工的造船前面）。
// 改裝中的船離開小隊（不能出戰）；好了回到原本的小隊（還在那個星系、沒滿），不然停在船塢當預備艦。星系失守＝改裝中的船被俘。
// 換模組＝那個槽位回到 Mk I；Mk 不能降。Mk 上限＝船的等級（capMkCapLv；研發的上限第 4 步再加）。標「研發」的模組要等研發樹。
// 排隊的記錄：{ id, kind: 'fit', key, sys, left, tot, to, c, fit: { mod, mk }, cost }
function ccFitOk(H0, slot, id) {
  const M = id && CAP_MODS[slot][id]; if (!M) return '';
  if (M.res) return '要先研發（研發樹還沒開放）';
  if (slot === 'msl' && id === 'hangar' && H0.ftr) return '這個船型本來就有機庫';
  return '';
}
function ccFitCost(c, fit) {
  const R = CC_RULE.fit; let n = 0;
  for (const [slot] of CAP_SLOTS) {
    const a = c.mod[slot] || '', b = fit.mod[slot] || '', kb = fit.mk[slot] || 1, from = a !== b ? 1 : c.mk[slot] || 1;
    if (a !== b) n += Math.round(R.mod[slot] * (b ? 1 : R.stock));
    for (let k = from + 1; k <= kb; k++) n += R.mk[k];
  }
  return n ? n + R.base : 0;
}
// 改了什麼（給紀錄、排隊用）
function ccFitTx(fit, H0, c) {
  const a = [];
  for (const [slot, nm] of CAP_SLOTS) {
    const b = fit.mod[slot] || '', kb = fit.mk[slot] || 1, a0 = c ? c.mod[slot] || '' : null, k0 = c ? c.mk[slot] || 1 : 1;
    if (c && a0 === b && k0 === kb) continue;
    if (!c && !b && kb === 1) continue;
    a.push(`${nm}${capModName(H0, slot, b)}${kb > 1 ? ' ' + CAP_MK_NAME[kb] : ''}`);
  }
  return a.join('、') || '原廠';
}
// 這份改裝能不能裝：模組可用、Mk 不超過上限、沒換模組的槽位 Mk 不能降
function ccFitBad(c, fit) {
  const H0 = CAP_HULLS[c.key], cap = capMkCapLv(c.lv);
  for (const [slot, nm] of CAP_SLOTS) {
    const b = fit.mod[slot] || '', kb = fit.mk[slot] || 1, why = ccFitOk(H0, slot, b);
    if (why) return `${nm}：${why}`;
    if (kb > cap) return `${nm}：船的等級只能裝到 ${CAP_MK_NAME[cap]}`;
    if ((c.mod[slot] || '') === b && kb < (c.mk[slot] || 1)) return `${nm}：Mk 不能降`;
  }
  return '';
}
// 這座船塢能不能接改裝
function ccFitWhy(S, s) {
  if (s.owner !== S.fac) return '要在己方的星系';
  if (!s.yard) return '這裡沒有維修船塢';
  if (ccYq(S, s.id).length >= CC_RULE.yardQ) return `這座船塢已經排了 ${CC_RULE.yardQ} 件`;
  return '';
}
// 改裝插在哪裡：還沒開工的造船前面（已經開工的、排在前面的改裝照舊）
function ccFitAt(S, sid) { const k = S.pl.yq.findIndex((o) => o.sys === sid && o.kind !== 'fit' && o.left === o.tot); return k < 0 ? S.pl.yq.length : k; }
function ccFitEta(S, sid) { const at = ccFitAt(S, sid); return S.pl.yq.slice(0, at).filter((o) => o.sys === sid).reduce((a, o) => a + o.left, 0) + 1; }
// 改裝的船從哪裡來：src＝{ q: 小隊 id, k: 第幾艘 } 或 { rid: 預備艦 id }
function ccFitSrc(S, src) {
  if (src.rid != null) { const r = S.pl.res.find((x) => x.id === src.rid); return r ? { c: r.c, sys: r.sys, r } : null; }
  const q = ccSqById2(S, src.q), c = q && q.ships[src.k]; return c ? { c, sys: q.sys, q } : null;
}
function ccFitOrder(S, src, fit) {
  const F = ccFitSrc(S, src); if (!F) return '沒有這艘船';
  const c = capShipFix(F.c), s = S.sys[F.sys], why = ccFitWhy(S, s) || ccFitBad(c, fit); if (why) return why;
  const cost = ccFitCost(c, fit); if (!cost) return '沒有要改的地方';
  if (S.pl.money < cost) return `資金不夠（要 ${cost}）`;
  let to = null;
  if (F.q) {
    const q = F.q; if (q.id === S.pl.sq && q.ships.length <= 1) return '親自指揮的小隊至少要留一艘（先從別隊調一艘過來，或把預備艦編進來）';
    q.ships.splice(src.k, 1); to = q.id;
    if (!q.ships.length) { S.sq = S.sq.filter((x) => x !== q); for (const o of S.pl.yq) if (o.to === q.id) o.to = null; to = null; }
  } else S.pl.res = S.pl.res.filter((x) => x !== F.r);
  S.pl.money -= cost; S.pl.yid = (S.pl.yid || 0) + 1;
  const o = { id: S.pl.yid, kind: 'fit', key: c.key, sys: s.id, left: 1, tot: 1, to, c, fit: { mod: { ...fit.mod }, mk: { ...fit.mk } }, cost };
  S.pl.yq.splice(ccFitAt(S, s.id), 0, o);
  ccLog(S, `${CAP_HULLS[c.key].name}送進 ${s.name} 的船塢改裝：${ccFitTx(fit, CAP_HULLS[c.key], c)}（${cost} 資金，${ccYqEta(S, o)} 週後好）`, 'ok'); return '';
}
// 改裝好、取消：回到原本的小隊（還在那個星系、沒滿），不然停在船塢
function ccFitBack(S, o, c) {
  const q = o.to != null && S.sq.find((x) => x.id === o.to && x.pl && x.ships.length && x.sys === o.sys && x.ships.length < CC_RULE.maxShips);
  if (q) { q.ships.push(c); return q; }
  S.pl.yid = (S.pl.yid || 0) + 1; S.pl.res.push({ id: S.pl.yid, sys: o.sys, c }); return null;
}
// 換船：同一個星系的我方小隊之間，不花時間。to＝'new' 分出新小隊（要有指揮權）
function ccTransfer(S, a, k, to) {
  const c = a.ships[k]; if (!c) return '沒有這艘船';
  if (a.id === S.pl.sq && a.ships.length <= 1) return '親自指揮的小隊至少要留一艘';
  let b;
  if (to === 'new') { if (ccOwnCount(S) >= ccSlots(S)) return `指揮權不夠（${ccRankOf(S).name}最多帶 ${ccSlots(S)} 隊，升遷才能多帶）`; b = ccNewSquad(S, S.fac, a.sys, [], { pl: true, name: ccOwnName(S) }); }
  else { b = S.sq.find((q) => q.id === to); if (!b || !b.pl || b.sys !== a.sys) return '要在同一個星系'; if (b.ships.length >= CC_RULE.maxShips) return '那一隊已經滿了'; }
  b.ships.push(a.ships.splice(k, 1)[0]); b.to = b.to ?? null;
  if (!a.ships.length) { S.sq = S.sq.filter((q) => q !== a); for (const x of S.pl.build) if (x.sq === a.id) x.sq = b.id; for (const o of S.pl.yq) if (o.to === a.id) o.to = b.id; }
  return '';
}
// 親自指揮換到另一隊：要和現在指揮的小隊在同一個星系（艦長換船）
function ccTakeCommand(S, q) {
  const P = ccPl(S); if (!q || !q.pl || !q.ships.length) return '沒有這個小隊';
  if (P && P.ships.length && P.sys !== q.sys) return '要和現在指揮的小隊在同一個星系';
  S.pl.sq = q.id; q.task = null; ccLog(S, `你改為親自指揮${q.name}`, 'ev'); return '';
}
// ───── 派出的小隊（玩家與 AI 勢力共用）：任務、地面突襲的成功率與存活率 ─────
// 統一的加減公式，每一項都是百分點，讓玩家看得懂要提升哪一方面：
//   成功率 ＝ 90% ＋ 任務難易（易 +10／中 −10／難 −55）＋ 戰力（比敵方戰力基準每多 1 點 +3、少 1 點 −3，±20 封頂；基準照敵方難度 2／3／4／6／8，見 captain.js 的 CAP_DIFF）＋ 耐久（平均每高於 70% 10 點 +3）
//           − 敵方難度（每級 2）＋ 偵察 +8 − 目標星系每個敵方小隊 5，限制在 5%～95%
//   存活率 ＝ 90% ＋ 成功率 × 8% − 敵方難度 × 2% ＋（這艘船的耐久 − 70%）× 10% ＋ 艦種（匿蹤艦 −3），限制在 30%～99%
// 係數對齊 2026-11-10 任務 AI 實打的 393 場（capmisai.js）：易＝偵察、摧毀設施、突破封鎖、護航、斬首、全滅（實測 93～100%），
//   中＝破壞、地面突襲（77%），難＝攔截、救援撤離（32～44%）；難度 0→4 實測 89%→70%；存活率實測約 96%、匿蹤艦 93%。
//   實測裡小隊戰力幾乎不影響結果（任務的敵人跟著我方調整），但為了讓「派更強的小隊」有意義，公式保留一個溫和的戰力項。
const CC_OPF = {
  base: 90, tier: { easy: 10, mid: -10, hard: -55 }, pow: 3, powCap: 20, hp: 3, li: -2, intel: 8, guard: -5, lo: 5, hi: 95,
  sBase: 90, sP: 8, sLi: -2, sHp: 10, sHull: { stealth: -3 },
};
const CC_OP_TIER = { scan: 'easy', strike: 'easy', run: 'easy', escort: 'easy', decap: 'easy', wipe: 'easy', sabotage: 'mid', raid: 'mid', intercept: 'hard', rescue: 'hard' };
const CC_TIER_NAME = { easy: '易', mid: '中', hard: '難' };
// 敵方難度＝遊戲難度的 li ＋（地面防禦 ≥4 時 +1），上限 4（和親自出擊的 ccLaunch 一樣）；AI 勢力的特戰當作普通難度
function ccOpLi(S, s, f) { return Math.min(4, (f === S.fac ? CC_DIFF[S.diff].li : 1) + (s.def >= 4 ? 1 : 0)); }
// 回傳 { p, li, parts: [[名稱, 百分點]…] }
function ccOpCalc(S, q, op, s, f) {
  const n = q.ships.length; if (!n) return { p: 0, li: 0, parts: [] };
  const K = CC_OPF, tier = CC_OP_TIER[op] || 'mid', hp = q.ships.reduce((a, c) => a + c.hp, 0) / n, li = ccOpLi(S, s, f);
  const guard = (f === S.fac ? ccSee(S, s).sq : ccAt(S, s.id)).filter((x) => x.fac !== f && ccHostile(S, f, x.fac)).length;   // 目標星系裡有敵方的小隊（玩家照所知的情報）
  const intel = f === S.fac ? ccIntel(S, s) : false;
  const parts = [['基準', K.base], [`任務難易（${CC_TIER_NAME[tier]}）`, K.tier[tier]],
    [`戰力（${ccPow([q]).toFixed(1)}，敵方 ${CAP_DIFF[li].pow}）`, Math.round(Math.max(-K.powCap, Math.min(K.powCap, K.pow * (ccPow([q]) - CAP_DIFF[li].pow))))],
    ['耐久', Math.round(K.hp * (hp - 0.7) * 10)], ['敵方難度', K.li * li]];
  if (intel) parts.push(['偵察', K.intel]);
  if (guard) parts.push(['守備小隊', K.guard * guard]);
  const v = parts.reduce((a, x) => a + x[1], 0);
  return { p: Math.max(K.lo, Math.min(K.hi, v)) / 100, li, parts };
}
const ccOpP = (S, q, op, s, f) => ccOpCalc(S, q, op, s, f).p;
function ccOpSurv(c, p, li) {
  const K = CC_OPF;
  return Math.max(0.3, Math.min(0.99, (K.sBase + K.sP * p + K.sLi * (li || 0) + K.sHp * (c.hp - 0.7) + (K.sHull[c.key] || 0)) / 100));
}
function ccTaskOp(S, t) { return t.kind === 'raid' ? 'raid' : (S.missions.find((M) => M.id === t.mis) || {}).op; }
function ccTaskOdds(S, q, t) {
  const s = S.sys[t.sys]; if (!q.ships.length) return { p: 0, surv: [], parts: [] };
  const O = ccOpCalc(S, q, ccTaskOp(S, t), s, q.fac);
  return { p: O.p, parts: O.parts, surv: q.ships.map((c) => ccOpSurv(c, O.p, O.li)) };
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
    for (const c of q.ships) ccXp(S, q, c, CAP_XP.fight + CAP_XP.live);
    ccLog(S, `${q.name}在 ${s.name} 執行${name}（計算，成功率 ${Math.round(O.p * 100)}%）：${ok ? '成功' : '失敗'}${n0 > q.ships.length ? `，損失 ${n0 - q.ships.length} 艘` : ''}${q.ships.length ? '' : '（全滅）'}`, ok ? 'ok' : 'bad');
    if (!ok) continue;
    S.pl.merit += 40;
    if (t.kind === 'raid') { if (s.sg) s.sg.raid = true; } else ccMissionDone(S, M, true);
  }
}

// ───── AI 勢力的特戰（每週）：挑一個完好的小隊，對相鄰（或所在）的敵對勢力星系出手；用 ccOpP 算成敗與損失 ─────
const CC_AI_OPS = ['intercept', 'sabotage', 'strike', 'decap', 'wipe'];
function ccAiOps(S) {
  for (const f of [SM_A, SM_E, SM_P]) {
    if (smRnd(S) >= CC_RULE.aiOp * (f === S.fac ? 1 : CC_DIFF[S.diff].aggr)) continue;
    const L = [];
    for (const q of S.sq) {
      if (q.fac !== f || q.pl || q.ships.length < 2 || ccDis(S, q) || q.ships.reduce((a, c) => a + c.hp, 0) / q.ships.length < 0.6) continue;
      if (S.sys[q.sys].owner !== f) continue;   // 圍城中的不派
      for (const j of [q.sys, ...S.adj[q.sys]]) {
        const t = S.sys[j], o = t.owner; if (o === f || o === SM_N || !ccHostile(S, f, o)) continue;   // 對中立勢力不主動出手
        for (const op of CC_AI_OPS) {
          const M = ccAiOpTarget(S, f, op, t); if (M) L.push({ q, M });
        }
      }
    }
    if (!L.length) continue;
    const { q, M } = L[Math.floor(smRnd(S) * L.length)], s = S.sys[M.sys];
    const p = ccOpP(S, q, M.op, s, f), li = ccOpLi(S, s, f), ok = smRnd(S) < p, n0 = q.ships.length;
    q.ships = q.ships.filter((c) => { if (smRnd(S) >= ccOpSurv(c, p, li)) return false; c.hp = Math.max(0.05, c.hp * (0.65 + 0.3 * smRnd(S))); c.msl *= 0.5; return true; });
    for (const c of q.ships) ccXp(S, q, c, CAP_XP.fight + CAP_XP.live);
    const vs = M.vs, me = vs === S.fac;
    let res = '';
    if (ok) { res = CC_OPFX[M.op].apply(S, M); ccFame(S, f, CC_RULE.fame.op); ccFame(S, vs, -CC_RULE.fame.op); }
    ccLog(S, `${SM_FAC[f].name}的${q.name}對${SM_FAC[vs].name}的 ${s.name} 發動${CC_OPFX[M.op].name}：${ok ? `成功・${res}` : '失敗'}${n0 > q.ships.length ? `（損失 ${n0 - q.ships.length} 艘）` : ''}`, me ? (ok ? 'bad' : 'ok') : f === S.fac ? (ok ? 'ok' : '') : '');
  }
}
// AI 特戰的目標（和玩家的任務同一套效果）：沒有合適的目標回傳 null
function ccAiOpTarget(S, f, op, t) {
  const o = t.owner, base = { op, sys: t.id, vs: o, by: f };
  if (op === 'intercept') return { ...base, f: o };
  if (op === 'sabotage') return ccDefsAlive(t).length >= 2 ? { ...base, tgt: 'defs' } : null;
  if (op === 'strike') return t.yard || t.depot ? { ...base, tgt: t.yard ? 'yard' : 'depot' } : null;
  if (op === 'wipe') return t.def >= 2 ? base : null;
  if (op === 'decap') { const x = ccAt(S, t.id, o).filter((z) => z.ships.length >= 2 && !ccDis(S, z)).sort((a, b) => ccPow([b]) - ccPow([a]))[0]; return x ? { ...base, sq: x.id } : null; }
  return null;
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
    fx: (S, M) => `${S.sys[M.sys].name} 的地面防禦 −2（圍城少 2 週，投降評分 −2），每 ${CC_RULE.fx.defBack} 週回復 1`,
    apply(S, M) { const s = S.sys[M.sys]; s.def = Math.max(0, s.def - 2); s.fx.gT = S.turn; return `${s.name} 的地面防禦降到 ${s.def}（圍城 ${ccSiegeNeed(s)} 週）`; } },
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
  if (tc && open().length < ccMaxMis(S) && !open().some((M) => M.type === 'cap')) S.missions.push({ id: S.nextId++, type: 'cap', sys: tc.id, due: S.turn + 6 + smHop(S, P.sys, tc.id) * 2, state: 'open', reward: { money: 600 + tc.tier * 200, merit: 250 } });
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
  for (let k = 0, made = 0; k < types.length && made < nOp && open().length < ccMaxMis(S); k++) {
    const op = types[k]; if (open().some((M) => M.op === op)) continue;
    const t = pick[op](); if (!t) continue;
    S.missions.push({ id: S.nextId++, type: 'op', op, ...t, due: S.turn + 4 + smHop(S, P.sys, t.sys), state: 'open', reward: { money: rew[op][0], merit: rew[op][1] } }); made++;
  }
  const L = S.missions.filter((M) => M.state === 'open' && M.t0 == null); for (const M of L) { M.t0 = S.turn; if (M.from == null) { M.from = S.fac; const k = ccFavK(S, M.from); M.reward = { money: Math.round(M.reward.money * k), merit: Math.round(M.reward.merit * k) }; } ccLog(S, `新任務：${ccMisName(M)}・${CC_MIS[M.type].desc(S, M)}`, 'ev'); }
}
// 每週：時限、斬首目標的位置（目標小隊會移動）
function ccMissionTick(S, track) {
  for (const M of S.missions) {
    if (M.state !== 'open') continue;
    if (M.type === 'op' && M.op === 'decap') { const q = S.sq.find((x) => x.id === M.sq); if (!q || !q.ships.length) { M.state = 'gone'; ccLog(S, '斬首的目標小隊已經被消滅：任務取消', ''); continue; } M.sys = q.sys; }
    if (M.type === 'op' && M.op !== 'decap' && M.f != null && S.sys[M.sys].owner !== M.f) { M.state = 'gone'; ccLog(S, `${S.sys[M.sys].name} 已經易主：${ccMisName(M)}任務取消`, ''); continue; }
    if (!track && S.turn >= M.due) { ccMisFail(S, M, '時限已過'); if (M.exam) { S.pl.examCd = S.turn + 2; ccLog(S, `升遷考核沒有通過：2 週後上級會再給一次機會`, 'bad'); } }
  }
}
// 任務失敗：沒有獎勵，和發出任務的勢力好感度略降
function ccMisFail(S, M, why) {
  M.state = 'fail'; const f = M.from != null ? M.from : S.fac;
  ccFav(S, f, -CC_RULE.fav.fail);
  ccLog(S, `任務失敗（${why}）：${CC_MIS[M.type].desc(S, M)}・${SM_FAC[f].name}對你的好感度 −${CC_RULE.fav.fail}（${Math.round(ccFavOf(S, f))}）`, 'bad');
}
const ccFavOf = (S, f) => ((S.pl.fav || {})[f] ?? 50);
function ccFav(S, f, d) { if (!S.pl.fav) S.pl.fav = {}; S.pl.fav[f] = Math.max(0, Math.min(100, ccFavOf(S, f) + d)); }
const ccFavK = (S, f) => 0.75 + ccFavOf(S, f) / 200;   // 任務獎勵的倍率（好感度 50＝×1）
function ccMissionDone(S, M, ok) {
  if (!ok) { ccMisFail(S, M, '任務沒有完成'); return; }
  M.state = 'done'; ccFav(S, M.from != null ? M.from : S.fac, CC_RULE.fav.ok); ccFame(S, S.fac, CC_RULE.fame.op);
  S.pl.money += M.reward.money; S.pl.merit += M.reward.merit;
  ccLog(S, `任務完成：${ccMisName(M)}・${M.type === 'op' ? CC_OPFX[M.op].goal(S, M) : CC_MIS[M.type].desc(S, M)}（資金 +${M.reward.money}、戰功 +${M.reward.merit}）`, 'ok');
  if (M.type === 'op') { const t = CC_OPFX[M.op].apply(S, M); M.res = t; ccLog(S, `任務的影響：${t}`, 'ok'); }
  if (M.exam) ccPromote(S);
}

function ccSave(S) { try { STORE.setItem(CC_STORE, JSON.stringify(S)); return true; } catch (e) { return false; } }
function ccLoad() { try { const t = STORE.getItem(CC_STORE); const S = t ? JSON.parse(t) : null; if (!S || S.v !== 1) return null; for (const s of S.sys) { if (s.def0 == null) s.def0 = s.def; if (!s.fx) s.fx = {}; if (!s.scene) s.scene = ccSceneFor(S, s); }
    for (const q of S.sq) q.ships.forEach(capShipFix);   // 舊存檔：船補上等級、模組
    if (!S.pl.yq) S.pl.yq = []; if (!S.pl.res) S.pl.res = [];   // 舊存檔：船塢排隊、預備艦
    for (const r of S.pl.res) capShipFix(r.c); for (const o of S.pl.yq) if (o.c) capShipFix(o.c);
    if (S.pl.rank == null) S.pl.rank = S.pl.merit >= 2000 ? 2 : S.pl.merit >= 800 ? 1 : 0;   // 舊存檔：照以前的指揮權換算軍階
    return S; } catch (e) { return null; } }
