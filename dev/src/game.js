// ═══════════════════════ 遊戲流程：PvE 1v1 ═══════════════════════
// 選單 → 作戰簡報 → 編成 → 部署 → 戰鬥 → 戰後報告
// 會改變戰局的東西（技能、AI、事件、勝負）都在模擬裡跑（gameTick / gameExec），回放時結果一樣。

const GAME = {
  phase: 'menu', playerSide: 0, sc: null, intel: null, loadout: null, attempt: 0,
  init: [0, 0], result: null, skillArm: null, deploySel: 0, drag: null, replaying: false, reportShown: false,
};
const PHASE_ON = ['deploy', 'battle', 'report', 'simedit'];
const gEl = (id) => document.getElementById(id);
const fmtN = (n) => Math.round(n).toLocaleString();
const ships5 = (icons) => fmtN(icons * opts.rep);
const sumA = (a) => a.reduce((x, y) => x + y, 0);

// ───── 指揮官存檔（等級、經驗） ─────
// 多人戰鬥（GAME.pvp）的指揮官等級與天賦另外存（fleet.pvpcmdrs），和單人分開
const cmdrKey = () => (GAME.pvp ? 'fleet.pvpcmdrs' : 'fleet.cmdrs');
function loadCmdrs() { try { return JSON.parse(STORE.getItem(cmdrKey()) || '{}'); } catch (e) { return {}; } }
function saveCmdrs(d) { try { STORE.setItem(cmdrKey(), JSON.stringify(d)); } catch (e) { /* 無法存檔時只在本次有效 */ } }
let CMDR_SAVE = loadCmdrs();
function cmdrXP(id) { return (CMDR_SAVE[id] && CMDR_SAVE[id].xp) || 0; }
function cmdrLevel(id) { return 1 + Math.floor(cmdrXP(id) / XP_PER_LEVEL); }
// ───── 天賦：每升一級 1 點（Lv 1 就有 1 點） ─────
function cmdrTal(id) { const d = CMDR_SAVE[id] || (CMDR_SAVE[id] = { xp: 0 }); return d.tal || (d.tal = {}); }
function talSpent(tal) { let n = 0; for (const k in tal) if (TALENT_BY_ID[k]) n += tal[k] * TALENT_BY_ID[k].cost; return n; }
function cmdrPoints(id) { return cmdrLevel(id) - talSpent(cmdrTal(id)); }
// 可以加點嗎？（點數夠、等級夠、沒到上限、固有技能不用再學）
function talentCan(c, t) {
  t = talFor(t, c.faction);   // 種族：專屬天賦、被替換的天賦
  const tal = cmdrTal(c.id), r = tal[t.id] || 0;
  if (!t.max && t.kind !== 'skill') return '未開放';
  if (t.kind === 'skill') { if (r || c.skills.includes(t.skill)) return ''; if (cmdrLevel(c.id) < (t.req || 1)) return `需要 Lv ${t.req}`; }
  else if (r >= t.max) return '';
  return cmdrPoints(c.id) >= t.cost ? 'ok' : '點數不足';
}
function talentAdd(c, t) { if (talentCan(c, t) !== 'ok') return false; const tal = cmdrTal(c.id); tal[t.id] = (tal[t.id] || 0) + 1; saveCmdrs(CMDR_SAVE); return true; }
function talentSub(c, t) { const tal = cmdrTal(c.id); if (!tal[t.id]) return false; if (--tal[t.id] <= 0) delete tal[t.id]; saveCmdrs(CMDR_SAVE); return true; }
// 偵察天賦：用全體指揮官裡最高的那一階（參謀部的情報）
function reconRank() { return Math.max(0, ...COMMANDERS.map((c) => cmdrTal(c.id).recon || 0)); }

// ───── 情報：依準確度產生「看到的」敵情（同一作戰每次看到一樣的情報） ─────
function makeIntel(sc) {
  const rr = reconRank(), R = mulberry32(sc.seed * 7 + 13), acc = Math.min(0.98, sc.intel.accuracy + 0.12 * rr), err = 1 - acc;
  const hide = sc.intel.hide.filter((h) => !(rr >= 2 && (h === 'tactic' || h === 'comp')));   // 偵察 2 階：看得到打法與編成
  const forms = Object.keys(FORMATIONS);
  const fleetsI = sc.enemy.map((ef) => {
    const total = sumA(ef.comp);
    const lo = Math.max(50, Math.round(total * (1 - err * (0.3 + R() * 0.7)) / 20) * 20);
    const hi = Math.round(total * (1 + err * (0.3 + R() * 0.7)) / 20) * 20;
    const wrong = R() < err * 0.6;
    const formation = wrong ? forms[(forms.indexOf(ef.formation) + 1 + Math.floor(R() * 4)) % forms.length] : ef.formation;
    const comp = hide.includes('comp') ? null : ef.comp.map((n) => (n === 0 ? 0 : Math.max(10, Math.round(n * (1 + (R() - 0.5) * 2 * err) / 10) * 10)));
    return {
      name: ef.name, lo, hi, comp, formation, conf: Math.round(acc * 100),
      tactic: hide.includes('tactic') ? null : ef.tactic,
      cmdr: { name: ef.commander.name, trait: ef.commander.trait, level: acc < 0.5 ? null : ef.commander.level },
      x: ef.x + (R() - 0.5) * err * 300, z: ef.z + (R() - 0.5) * err * 160, fuzz: 40 + err * 160, h: ef.h,
    };
  });
  const events = hide.includes('events') ? null : sc.events.map((e) => `可能有${e.name}出現（約 ${Math.round(e.chance * 100)}%）`);
  return { fleets: fleetsI, events, acc };
}

// ───── 編成 ─────
function compCost(c) { return c.reduce((s, n, t) => s + n * SHIP_TYPES[t].cost, 0); }
function defaultComp(budget) {
  const mix = [0.04, 0.14, 0.27, 0.3, 0.25];   // 以艘數比例
  const per = mix.reduce((s, m, t) => s + m * SHIP_TYPES[t].cost, 0);
  const n = budget / per;
  return mix.map((m) => Math.floor(n * m / 10) * 10);
}
// 自動分配的偏好：mix＝艘數比例 [航母, 戰列, 巡洋, 驅逐, 護衛]（null＝照艦隊目前的比例）；hangar＝航母艦載機配置（攔截、攻擊、飛彈、光束），沒有就不動
const AUTO_PREFS = {
  keep:    { name: '保持目前比例', desc: '照每支艦隊現在的艦種比例放大縮小（沒有船的艦隊用均衡比例）', mix: null },
  balance: { name: '均衡', desc: '各艦種都有，跟新艦隊的預設比例一樣', mix: [0.04, 0.14, 0.27, 0.3, 0.25], hangar: [2, 2, 1, 1] },
  front:   { name: '正面火力優先', desc: '戰列艦、巡洋艦為主：主砲射程遠、正面最硬；轉向慢，怕被包抄', mix: [0.02, 0.3, 0.38, 0.2, 0.1] },
  carrier: { name: '多艦載機', desc: '航母多、攻擊機為主，靠艦載機打遠；航母本身脆弱，要有護衛', mix: [0.14, 0.1, 0.22, 0.2, 0.34], hangar: [1, 3, 1, 1] },
  aa:      { name: '多防空', desc: '護衛艦多、航母改裝攔截機：對付敵方飛彈與艦載機（如蟲族、航母多的敵軍）', mix: [0.04, 0.1, 0.3, 0.16, 0.4], hangar: [4, 1, 1, 0] },
  missile: { name: '飛彈齊射', desc: '巡洋艦、驅逐艦為主，遠距離飛彈輸出；帶補給艦隊效果更好', mix: [0.02, 0.08, 0.38, 0.42, 0.1] },
  mobile:  { name: '高機動', desc: '不帶航母、戰列艦也少，整支艦隊速度快：適合包抄、追擊', mix: [0, 0.04, 0.2, 0.46, 0.3] },
};
// 自動分配：補給艦隊不動，剩下的預算平均分給每支艦隊，各艦隊照自己的偏好（f.autoPref）決定艦種比例
// （保持目前比例：艦隊現在的比例，沒船就用均衡）；以 10 艘為單位，零頭再一次補 10 艘給離目標最遠、還買得起的艦種
const fleetPref = (f) => AUTO_PREFS[f.autoPref] || AUTO_PREFS.keep;
function autoAllocate(lo, budget) {
  const FL = lo.fleets; if (!FL.length) return;
  const avail = Math.max(0, budget - sumA(supplyList(lo).map((s) => compCost(s.comp)))), share = avail / FL.length;
  const ideal = FL.map((f) => {
    const P = fleetPref(f), mix0 = P.mix || AUTO_PREFS.balance.mix;
    const r = SHIP_TYPES.map((_, t) => (t < N_COMBAT ? f.comp[t] || 0 : 0));
    const mix = P.mix || sumA(r) <= 0 ? SHIP_TYPES.map((_, t) => mix0[t] || 0) : r, k = share / (compCost(mix) || 1);
    if (P.hangar) f.hangar = P.hangar.slice();
    return mix.map((n) => n * k);
  });
  // 每支艦隊只用自己那一份（不跨艦隊補零頭），重按幾次結果才不會漂移
  FL.forEach((f, i) => {
    f.comp = ideal[i].map((n) => Math.floor(n / 10 + 1e-6) * 10);   // 1e-6：29.9999… 不要被捨成 20
    let left = share - compCost(f.comp);
    for (;;) {
      let best = -1, gap = 0;
      ideal[i].forEach((n, t) => {
        const g = n - f.comp[t], c = SHIP_TYPES[t].cost * 10;
        if (t < N_COMBAT && n > 0 && c <= left + 1e-6 && g / c > gap) { gap = g / c; best = t; }
      });
      if (best < 0) break;
      f.comp[best] += 10; left -= SHIP_TYPES[best].cost * 10;
    }
  });
}
function defaultLoadout(sc, faction = GAME.faction || 0) {
  const pool = cmdrsOf(faction).length ? cmdrsOf(faction) : COMMANDERS;
  const nF = Math.max(1, Math.min(2, sc.maxFleets, pool.length)), share = sc.budget / nF;
  const fl = [];
  for (let k = 0; k < nF; k++) {
    const x = nF === 1 ? 0 : -220 + 440 * k / (nF - 1);
    fl.push({ cmdr: pool[k % pool.length].id, comp: defaultComp(share), formation: 'line', x, z: 300 + ZONE_SHIFT, h: Math.PI });
  }
  return { faction, fleets: fl };
}
// 編成的指揮官要屬於選的陣營、不能重複；不夠就減少艦隊數
function fixLoadoutCmdrs(lo) {
  zoneFix(lo);
  const pool = cmdrPool(GAME.sc, lo.faction || 0), used = new Set();
  lo.fleets = lo.fleets.filter((f) => {
    const c = COMMANDERS.find((o) => o.id === f.cmdr);
    if (c && canLead(c, lo.faction || 0) && !used.has(c.id)) { used.add(c.id); return true; }
    const free = pool.find((o) => !used.has(o.id) && !lo.fleets.some((g) => g !== f && g.cmdr === o.id));
    if (!free) return false;
    f.cmdr = free.id; used.add(free.id); return true;
  });
}
// 部署區往外推（ZONE_SHIFT）之前存的編成：位置在新部署區前面＝整組往後推
function zoneFix(lo) {
  const all = [...lo.fleets, ...supplyList(lo)];
  if (all.length && all.every((f) => f.z < DEPLOY_ZONE.z0)) for (const f of all) f.z = Math.min(DEPLOY_ZONE.z1, f.z + ZONE_SHIFT);
}
// 補給艦隊的 setup（編成的 comp 是 [航母, 戰列, 巡洋, 驅逐, 護衛, 補給]，只會有護衛和補給）
function supplySetup(side, S, follow, name = '補給艦隊') {
  return { side, name, supply: true, follow, ax: S.x, az: S.z, ay: S.y || 0, h: S.h, formation: S.formation || 'ring', orderly: false, layers: 1,
    comp: SHIP_TYPES.map((_, t) => (t === 4 || t === SUPPLY_T ? S.comp[t] || 0 : 0)), commander: null };
}
// 編成的補給艦隊（可以有好幾支，最多跟艦隊數一樣多；舊存檔的 lo.supply 轉成陣列）
function supplyList(lo) {
  if (lo.supply) { lo.supplies = [lo.supply]; delete lo.supply; }
  return lo.supplies || (lo.supplies = []);
}
const supplyName = (i) => `補給第${'一二三四'[i]}隊`;
// 新增第 i 支：預設跟隨同序號的艦隊，擺在它後方
function defaultSupply(lo, i) {
  const f = lo.fleets[i] || lo.fleets[0], z = f ? f.z + 120 : DEPLOY_ZONE.z1;
  return { comp: SHIP_TYPES.map((_, t) => (t === 4 ? 30 : t === SUPPLY_T ? 30 : 0)), formation: 'ring', x: f ? f.x : 0, z: Math.min(DEPLOY_ZONE.z1, z), h: Math.PI, follow: lo.fleets[i] ? i : lo.fleets.length ? 0 : -1 };
}
// 增援的編成：本場預算 × share，照呼叫的艦隊的艦種比例（只算一般艦種）
function reinforceComp(comp, budget) {
  const c = SHIP_TYPES.map((_, t) => (t < N_COMBAT ? comp[t] || 0 : 0)), cost = compCost(c) || 1, k = budget * REINFORCE_RULE.share / cost;
  return c.map((n) => Math.floor(n * k / 10) * 10);
}
// 增援指揮官：等級跟主力敵軍一樣（無限戰場是敵軍等級，不是 AI 難度）
function reinforceCmdr(sc) {
  const lv = sc.enemyLevel || Math.max(sc.level || 1, ...sc.enemy.map((e) => (e.commander && e.commander.level) || 1));
  return { name: '增援指揮官', trait: 'dmg', level: lv, skills: sc.level >= 2 ? (lv >= 5 ? ['wall', 'rapid'] : ['wall']) : [] };
}
function makeSetup(sc, lo, attempt) {
  const fleetsS = [];
  lo.fleets.forEach((f, k) => {
    const c = COMMANDERS.find((o) => o.id === f.cmdr) || cmdrsOf(lo.faction || 0)[0] || COMMANDERS[0];
    fleetsS.push({ side: 0, ...ownFac(c, lo.faction || 0), name: `第${'一二三四'[k]}艦隊`, ax: f.x, az: f.z, ay: f.y || 0, h: f.h, formation: f.formation, orderly: !!f.orderly, layers: f.layers || 1, comp: f.comp.slice(), hangar: (f.hangar || HANGAR_DEFAULT).slice(),
      commander: { id: c.id, name: c.name, title: c.title, trait: c.trait, level: cmdrLevel(c.id), tal: { ...cmdrTal(c.id) }, skills: commanderSkills(c.skills, cmdrTal(c.id)) } });
  });
  // 補給艦隊：不佔艦隊欄位、沒有指揮官；follow＝跟隨的艦隊（setup 裡的 index）
  supplyList(lo).forEach((S, i) => { if (sumA(S.comp) > 0) fleetsS.push(supplySetup(0, S, S.follow >= 0 && S.follow < lo.fleets.length ? S.follow : -1, supplyName(i))); });
  // 呼叫增援：有這個技能的指揮官各準備一支（隱藏在場外，用技能時才決定進場位置）；次數不夠就只準備得起的那幾支
  const stock = sc.sim || sc.tut ? 0 : Math.min(ROSTER.reinf || 0, REINFORCE_RULE.max);
  let nR = 0;
  lo.fleets.forEach((f, k) => {
    const cm = fleetsS[k].commander;
    if (nR >= stock || !cm.skills.includes('reinforce')) return;
    nR++;
    fleetsS.push({ side: 0, ...(fleetsS[k].fac != null ? { fac: fleetsS[k].fac } : {}), name: `${fleetsS[k].name}增援`, ax: 0, az: MAP_BOUNDS.z1 + 900, ay: 0, h: Math.PI, formation: f.formation, comp: reinforceComp(f.comp, sc.budget),
      commander: null, reserve: true, activateAt: null, reinfOf: k });
  });
  // 傭兵支援：打下灰鴉的基地、功勳夠才準備（第一艦隊的指揮官多一個技能）；對手就是灰鴉的關卡不能叫
  if (ROSTER.mercSup && !sc.sim && !sc.tut && !sc.mp && sc.enemyFac !== 2 && lo.faction !== 2 && lo.fleets.length && (ROSTER.merit || 0) >= MERC_RULE.cost) {
    const A = CAMP_ARCHETYPES.find((a) => a.key === 'raider'), per = A.mix.reduce((t, m, i) => t + m * SHIP_TYPES[i].cost, 0), n = sc.budget * MERC_RULE.share / per;
    fleetsS[0].commander.skills = fleetsS[0].commander.skills.concat('merc');
    fleetsS.push({ side: 0, fac: 2, name: '灰鴉傭兵團', ax: 0, az: MAP_BOUNDS.z1 + 900, ay: 0, h: Math.PI, formation: 'wedge', comp: A.mix.map((m) => Math.round(n * m / 10) * 10),
      commander: { name: '賽隆', trait: 'speed', level: fleetsS[0].commander.level, skills: ['charge'] }, reserve: true, activateAt: null, mercOf: 0 });
  }
  // 劇情戰役的護送目標（不能部署，跟著第一艦隊；損失太多就敗北）
  if (sc.vip) fleetsS.push({ ...supplySetup(0, sc.vip, lo.fleets.length ? 0 : -1, sc.vip.name), vip: true });
  // 劇情戰役的友軍（傭兵外觀）：AI 自己打、玩家不能指揮；defectAt 秒後倒戈成敵軍
  for (const a of sc.allies || []) fleetsS.push({ side: 0, fac: a.fac, name: a.name, ax: a.x, az: a.z, ay: 0, h: a.h, formation: a.formation, comp: a.comp.slice(),
    commander: { ...a.commander }, ai: { tactic: a.tactic, level: sc.level }, ally: true, defectAt: a.defectAt });
  const e0 = fleetsS.length;
  sc.enemy.forEach((ef) => fleetsS.push({ side: 1, name: ef.name, ax: ef.x, az: ef.z, ay: ef.y || 0, h: ef.h, formation: ef.formation, comp: ef.comp.slice(),
    commander: { ...ef.commander }, ai: { tactic: ef.tactic, level: sc.level } }));
  if (sc.enemySupply && sc.enemy.length) fleetsS.push(supplySetup(1, sc.enemySupply, e0 + Math.min(sc.enemySupply.follow || 0, sc.enemy.length - 1)));
  // 突發事件：開戰前就抽好（同一個 attempt 回放時一樣）
  const R = mulberry32(sc.seed * 31 + attempt * 977);
  for (const ev of sc.events) {
    if (ev.type !== 'reinforce' || R() >= ev.chance) continue;
    const at = ev.at[0] + R() * (ev.at[1] - ev.at[0]), sx = ev.edge === 'left' ? -1 : 1;
    fleetsS.push({ side: 1, name: ev.name, ax: sx * 800, az: -140 + R() * 200, ay: Math.round((R() - 0.5) * 240), h: sx < 0 ? Math.PI / 2 : -Math.PI / 2, formation: ev.formation, comp: ev.comp.slice(),
      commander: ev.commander ? { ...ev.commander } : reinforceCmdr(sc), reserve: true, activateAt: at, ai: { tactic: 'push', level: sc.level } });
  }
  return { bg: false, terrain: sc.terrain, ...(sc.ground ? { ground: { ...sc.ground } } : {}), fleets: fleetsS, scenario: sc.id, timeLimit: sc.timeLimit, level: sc.level, factions: sc.enemyFac != null ? [lo.faction || 0, sc.enemyFac] : (lo.faction || 0) === 1 ? [1, 0] : [0, 1], ...(sc.goal ? { goal: sc.goal } : {}), ...(sc.lines ? { lines: sc.lines } : {}), ...(sc.dlines ? { dlines: sc.dlines } : {}), ...(sc.defect ? { defect: sc.defect } : {}), ...(sc.aiOmni ? { omni: [false, true] } : {}), ...(sc.untimed ? { untimed: true } : {}) };   // untimed：沒有時限（timeLimit 只當目標時間）；aiOmni：這一關的 AI 不受戰爭迷霧限制
}

// ───── 技能（命令 'skill'） ─────
function gameExec(c) {
  if (c.type === 'surrender') { if (!GAME.result) GAME.result = battleResult(c.side ? 'win' : 'lose', `${c.side ? '敵軍' : '我軍'}${c.why || '投降了'}`, { surrender: c.side }); return null; }   // 多人：投降、斷線（伺服器發出）
  if (c.type === 'simctl') { GAME.simCtl = c.ctl; return null; }   // 模擬室：玩家接管的一方（該方 AI 暫停）
  if (c.type === 'skill') { const f = fleets.find((o) => o.id === c.fleet); if (f && f.side === c.side) useSkill(f, c.skill, c.target != null ? squadrons[c.target] : null, c.x != null ? { x: c.x, z: c.z } : null); }
  return null;
}
function useSkill(f, id, target, pt) {
  const s = f.skills[id], t = U.uTime.value, def = SKILLS[id];
  if (!s || s.left <= 0 || t < s.ready || f.sqs.every((q) => q.alive <= 0)) return false;
  if (def.targetMode === 'enemy' && (!target || target.side === f.side || target.alive <= 0)) return false;
  if (def.targetMode === 'point' && !pt) return false;
  if (id === 'reinforce' && !callReinforce(f, pt)) return false;
  if (id === 'merc' && !callMercs(f, pt)) return false;
  s.left--; s.until = t + def.dur; s.ready = t + def.cd * (1 - 0.15 * talentRank(f.commander, 'tempo')); s.target = target; s.used = (s.used || 0) + 1;   // 指揮效率：冷卻縮短
  if (id === 'jam') setJam(1 - f.side, def.dur, 6);   // 干擾：敵方變陣延遲 6 秒
  const who = GAME.watch ? `${FACTION_NAME[SIDE_FAC[f.side]]}・${f.name}　` : f.side === GAME.playerSide ? '' : '敵方';   // 觀摩：兩邊都是 AI，用陣營名稱
  toast(`${who}${f.commander ? f.commander.name : f.name}：${def.name}${target ? ` → ${target.fleet ? target.fleet.name + ' ' : ''}${target.name}` : ''}`, f.side === GAME.playerSide ? '' : 'enemy');
  if (id === 'focus') for (const g of groups) if (g.side === f.side && !g.inactive) g.target = target;
  return true;
}
// 呼叫增援：把準備好的增援艦隊（還在場外）移到離 pt 最近的地圖邊緣外側，delay 秒後進場、開往 pt
function callReinforce(f, pt) {
  const rf = fleets.find((o) => o.reinfOf === f.id && o.reserve && o.activateAt == null);
  if (!rf) { if (f.side === GAME.playerSide) toast('這場沒有可以呼叫的增援（星際酒館購買增援次數）'); return false; }
  const g = rf.sqs[0] && rf.sqs[0].group; if (!g) return false;
  const B = MAP_BOUNDS, P = clampMap({ x: pt.x, z: pt.z });
  const d = [[P.x - B.x0, 'x0'], [B.x1 - P.x, 'x1'], [P.z - B.z0, 'z0'], [B.z1 - P.z, 'z1']].sort((a, b) => a[0] - b[0])[0][1];
  const E = { x: d === 'x0' ? B.x0 - 80 : d === 'x1' ? B.x1 + 80 : P.x, z: d === 'z0' ? B.z0 - 80 : d === 'z1' ? B.z1 + 80 : P.z };
  warpGroup(g, E.x, E.z, Math.atan2(P.x - E.x, P.z - E.z));
  rf.activateAt = U.uTime.value + REINFORCE_RULE.delay; rf.entryGoal = P;
  // 次數：只在正式作戰、第一次執行時扣（回放重跑同一個命令不再扣）
  if (!GAME.replaying && f.side === GAME.playerSide && GAME.phase === 'battle' && !(GAME.sc && (GAME.sc.sim || GAME.sc.mp))) {   /* 多人：每場固定次數，不扣酒館的存量 */ ROSTER.reinf = Math.max(0, (ROSTER.reinf || 0) - 1); rosterSave(); }
  if (f.side === GAME.playerSide) toast(`${rf.name}：${REINFORCE_RULE.delay} 秒後從${{ x0: '左', x1: '右', z0: '前', z1: '後' }[d]}方進場`);
  return true;
}
// 傭兵支援：跟呼叫增援一樣從最近的地圖邊緣進場；正式作戰第一次執行時才扣功勳（回放不扣）
function callMercs(f, pt) {
  const rf = fleets.find((o) => o.mercOf === f.id && o.reserve && o.activateAt == null);
  const real = !GAME.replaying && f.side === GAME.playerSide && GAME.phase === 'battle';
  if (!rf) return false;
  if (real && (ROSTER.merit || 0) < MERC_RULE.cost) { toast(`功勳不夠（傭兵支援要 ${MERC_RULE.cost} 功勳）`); return false; }
  const g = rf.sqs[0] && rf.sqs[0].group; if (!g) return false;
  const B = MAP_BOUNDS, P = clampMap({ x: pt.x, z: pt.z });
  const d = [[P.x - B.x0, 'x0'], [B.x1 - P.x, 'x1'], [P.z - B.z0, 'z0'], [B.z1 - P.z, 'z1']].sort((a, b) => a[0] - b[0])[0][1];
  const E = { x: d === 'x0' ? B.x0 - 80 : d === 'x1' ? B.x1 + 80 : P.x, z: d === 'z0' ? B.z0 - 80 : d === 'z1' ? B.z1 + 80 : P.z };
  warpGroup(g, E.x, E.z, Math.atan2(P.x - E.x, P.z - E.z));
  rf.activateAt = U.uTime.value + MERC_RULE.delay; rf.entryGoal = P;
  if (real) { ROSTER.merit -= MERC_RULE.cost; rosterSave(); }
  if (f.side === GAME.playerSide) toast(`灰鴉傭兵團：收到 ${MERC_RULE.cost} 功勳，${MERC_RULE.delay} 秒後從${{ x0: '左', x1: '右', z0: '前', z1: '後' }[d]}方進場`);
  return true;
}
// 友軍倒戈：整支艦隊換到對面（船、分艦隊、艦隊群組、艦載機），之後算敵軍兵力
function defectFleet(f) {
  f.ally = false; f.side = 1 - f.side; f.aiS = {};
  const sqSet = new Set(f.sqs);
  for (const q of f.sqs) { q.side = f.side; q.target = null; if (q.group) { q.group.side = f.side; q.group.target = null; q.group.goal = null; } selected.delete(q); }
  for (let i = 0; i < shipCount; i++) if (sqSet.has(squadrons[ships.sq[i]])) ships.side[i] = f.side;
  for (let j = 0; j < FT.side.length; j++) if (FT.state[j] && sqSet.has(squadrons[ships.sq[FT.carrier[j]]])) FT.side[j] = f.side;
  let n = 0; for (const q of f.sqs) n += q.alive;
  GAME.init[f.side] += n;
  // 番外篇：玩家就是傭兵，倒戈的是自己這一邊
  toast(SIDE_FAC[GAME.playerSide || 0] === 2 ? `灰鴉傭兵團轉向攻擊${f.name}！` : `警告：${f.name}倒戈了！`, 'bad');
}
function skillCmd(f, id, target, pt) {
  const args = { fleet: f.id, skill: id, target: target ? squadrons.indexOf(target) : null, ...(pt ? { x: Math.round(pt.x), z: Math.round(pt.z) } : {}) };
  // 排進隊列時掛在「選取的部隊」上（例如：先移動到某地，再放技能）
  if (queueMode()) { const sel = actOn().filter((q) => q.fleet === f); issue('queue', { sqs: sqIds(sel.length ? actOn() : fleetAlive(f)), item: { type: 'skill', ...args } }); }
  else issue('skill', args);
}
function armSkill(f, id) {
  if (SKILLS[id].targetMode === 'enemy') { GAME.skillArm = { f, id }; hint(`${SKILLS[id].name}：點選要集中砲擊的敵方分艦隊（Esc 取消）`); }
  else if (SKILLS[id].targetMode === 'point') { GAME.skillArm = { f, id, point: true }; hint(`${SKILLS[id].name}：點選增援要開往的位置（從最近的地圖邊緣進場，Esc 取消）`); }
  else skillCmd(f, id);
}
// A 鍵（觸控：「攻擊」按鈕）：接著左鍵點敵方分艦隊＝選取的艦隊集中攻擊它（不加傷害、沒有次數限制）
function armAttack() {
  if (GAME.phase !== 'battle' && GAME.phase !== 'sandbox') return;
  if (!actOn().length) return;
  GAME.skillArm = { attack: true };
  hint(`攻擊：選取的艦隊要打哪一支？左鍵點敵方分艦隊（右鍵或 Esc 取消）`);
}
// D 鍵（輪盤「攻擊」頁）：接著左鍵點地圖上的一點＝選取的艦隊對那裡開火（光束、飛彈、艦載機；射程內才打）
function armArea() {
  if (GAME.phase !== 'battle' && GAME.phase !== 'sandbox') return;
  if (!actOn().length) return;
  GAME.skillArm = { area: true, point: true };
  hint(`區域攻擊：選取的艦隊要打哪裡？左鍵點地圖上的位置（${FOW_RULE.area.dur} 秒；射程內的光束、飛彈、艦載機會打那裡，看不到目標＝盲射）（右鍵或 Esc 取消）`);
}
function skillEsc() { if (!GAME.skillArm) return false; GAME.skillArm = null; hideHint(); return true; }
function skillKey(id) {
  if (GAME.phase !== 'battle') return false;
  if (!SKILLS[id]) return false;
  const sel = [...selected].filter((q) => q.alive > 0).map((q) => q.fleet).filter(Boolean);
  if (!sel.length) return true;   // 沒有選取：技能鍵不做事
  const pool = [...sel, ...fleets.filter((f) => f.side === GAME.playerSide && !f.ally)];
  const f = pool.find((o) => o.skills[id] && o.skills[id].left > 0 && U.uTime.value >= o.skills[id].ready);
  if (f) armSkill(f, id);
  return true;
}

// ───── 增援 ─────
function activateReserve(f) {
  f.reserve = false;
  for (const q of f.sqs) { q.bg = false; q.hidden = false; if (q.group) q.group.inactive = false; if (q.label) q.label.classList.remove('bg'); }
  GAME.init[f.side] += f.initial;
  // 呼叫來的增援：進場後開往指定的位置
  if (f.entryGoal) { const g = f.sqs[0].group; execCommand({ tick: simTick, side: f.side, type: 'move', auto: true, sqs: fleetAlive(f).map((q) => squadrons.indexOf(q)), x: f.entryGoal.x, z: f.entryGoal.z, H: g ? g.to : null, pivot: false, width: null, uturn: 'auto' }); }
  if (typeof TAC !== 'undefined' && TAC.open && f.side === GAME.playerSide) buildTacSide();   // 戰術面板加上這支艦隊的卡片
  if (f.side === GAME.playerSide) toast(f.entryGoal ? `增援：${f.name}進場` : `增援：${f.name}抵達${f.sqs[0].x < 0 ? '左' : '右'}翼`);
  else toast(`警告：${f.name}出現在${f.sqs[0].x < 0 ? '左' : '右'}翼！`, 'bad');
  for (let k = 0; k < 12; k++) { const q = f.sqs[k % f.sqs.length]; spawnFx(q.x + (rnd() - 0.5) * 60, 0, q.z + (rnd() - 0.5) * 60, 1, 8, 16); }
}

// ───── 敵方 AI ─────
// 每 0.5 秒想一次（在模擬裡、用模擬的隨機數 → 回放一致）。AI 也只能下命令。
function fleetAlive(f) { return f.sqs.filter((q) => q.alive > 0 && !q.bg); }
function centerOf(sqs) { let x = 0, y = 0, z = 0, n = 0; for (const q of sqs) { x += q.x * q.alive; y += (q.y || 0) * q.alive; z += q.z * q.alive; n += q.alive; } return n ? { x: x / n, y: y / n, z: z / n, n } : null; }
function fleetRange(f, key) { let s = 0, n = 0; for (const q of f.sqs) for (let t = 0; t < NT; t++) { s += q.typeAlive[t] * SHIP_TYPES[t].beam[key]; n += q.typeAlive[t]; } return n ? s / n : 300; }
function aiCmd(f, type, args = {}) {
  const sqs = fleetAlive(f).map((q) => squadrons.indexOf(q));
  if (!sqs.length) return null;
  return execCommand({ tick: simTick, side: f.side, type, sqs, ...args });
}
function fleetGroup(f) { const q = fleetAlive(f)[0]; return q ? q.group : null; }
function clampMap(p) { p.x = Math.max(MAP_BOUNDS.x0 + 60, Math.min(MAP_BOUNDS.x1 - 60, p.x)); p.z = Math.max(MAP_BOUNDS.z0 + 60, Math.min(MAP_BOUNDS.z1 - 60, p.z)); if (p.y != null) p.y = Math.max(-ALT_MAX + 40, Math.min(ALT_MAX - 40, p.y)); return p; }
function aiMove(f, S, P, H, minD = 60) {
  const g = fleetGroup(f); if (!g) return;
  clampMap(P);
  const same = S.goal && Math.hypot(S.goal.x - P.x, S.goal.z - P.z) < minD && Math.abs(wrapAngle((S.goal.H ?? 0) - H)) < 0.5;
  if (same && g.plan) return;
  if (maneuvering(g) && S.goal && Math.hypot(S.goal.x - P.x, S.goal.z - P.z) < 200) return;   // 迴轉途中不要一直改命令
  if (g.plan && g.plan.kind === 'pivot' && g.sqs.some((q) => sqMorphing(q)) && S.goal && Math.hypot(S.goal.x - P.x, S.goal.z - P.z) < 160) return;   // 原地轉向重排中
  // 3D：預設跟著目標的高度走；包抄的艦隊（難度 2 以上）從上方切入
  if (P.y == null) P.y = (S.ey != null ? S.ey : g.ay || 0) + (f.ai.tactic === 'flank' && f.ai.level >= 2 && S.phase !== 'attack' ? 140 : 0);
  clampMap(P);
  S.goal = { x: P.x, z: P.z, H };
  aiCmd(f, 'move', { x: P.x, z: P.z, H, pivot: false, width: null, uturn: 'auto', y: Math.round(P.y) });
}
// 船頭還在轉：不要再下轉向命令（否則陣型一直重組、永遠排不好）
function hullsTurning(g) { const t = U.uTime.value; return g.sqs.some((q) => q.alive > 0 && q.tDur > 0 && t < q.tStart + q.tDur); }
function aiFace(f, S, E) {
  const g = fleetGroup(f); if (!g || g.plan || hullsTurning(g)) return;
  const H = Math.atan2(E.x - g.ax, E.z - g.az);
  if (Math.abs(wrapAngle(H - g.to)) > 0.45) { S.goal = null; aiCmd(f, 'face', { x: E.x, z: E.z }); }
}
function aiForm(f, S, kind) { const g = fleetGroup(f); if (g && g.formation !== kind && U.uTime.value > (S.formT || 0)) { S.formT = U.uTime.value + 25; aiCmd(f, 'form', { kind }); } }
function aiSkill(f, id, target) { const s = f.skills[id]; if (s && s.left > 0 && U.uTime.value >= s.ready) useSkill(f, id, target); }
// AI 看到的敵情：被干擾時是干擾開始那一刻的位置、兵力與陣型（seenSq）
function seenAlive(viewer, f) { return f.sqs.map((q) => seenSq(viewer, q)).filter((q) => q && !q.bg && q.alive > 0); }
function seenCenter(viewer, f) { return centerOf(seenAlive(viewer, f)); }
function seenGroup(viewer, f) { const q = seenAlive(viewer, f)[0]; return q ? (q.stale ? q : q.group) : null; }   // 快照（干擾、最後已知）本身帶陣型與朝向
// 難度 4 以上的選目標：射程內的航母（艦載機的來源）優先，其次是快被打垮的分艦隊；
// 難度 5 再加上協同：其他 AI 艦隊也打得到的目標加分，各艦隊會集中打同一處。集中火力生效中不改目標
function aiTarget(f, S, C, far, lv) {
  const fs = f.skills.focus; if (fs && U.uTime.value < fs.until) return;
  const allies = lv >= 5 ? fleets.filter((o) => o !== f && o.side === f.side && o.ai && !o.reserve).map((o) => [centerOf(fleetAlive(o)), fleetRange(o, 'far')]).filter((a) => a[0]) : [];
  let best = null, bs = -1e9;
  for (const q of squadrons) {
    const v = seenSq(f.side, q);   // 被干擾：位置與兵力是干擾開始時的
    if (q.side === f.side || !v || v.bg || v.alive <= 0 || q.alive <= 0 || Math.hypot(v.x - C.x, v.z - C.z) > far || (fowOn() && v.stale)) continue;   // 戰爭迷霧：只選看得到的
    let s = q.typeAlive[0] * 4 + (1 - v.alive / Math.max(1, q.list.length - (q.nDorm || 0))) * 30 - v.alive * 0.05;   // 預留的空位（寄生、孵化）不算損失
    for (const [A, r] of allies) if (Math.hypot(v.x - A.x, v.z - A.z) < r) s += 12;
    if (s > bs) { bs = s; best = q; }
  }
  if (best && S.atk !== best) { S.atk = best; aiCmd(f, 'attack', { target: squadrons.indexOf(best) }); }
}
// AI 想事情時，seenSq 用這支艦隊自己的情報（戰爭迷霧：被干擾時各艦隊不共享）
function aiThink(f) { FOW.obs = f; try { aiThink0(f); } finally { FOW.obs = null; } }
// 戰爭迷霧：脈衝掃描是自動的（fowAutoScan）；有航母的 AI 另外派偵察機做區域掃描：
//   沒有看得到的敵軍就派（難度 2：開戰 30 秒後才會；難度 1 不會）；難度 4 以上還有敵方艦隊看不到時也派
//   派去哪：掃描訊號的方向 → 最近的最後已知位置 → 敵軍開戰時的位置
function aiScan(f, lv, t) {
  if (!fowOn() || lv < 2 || f.supply || fowReconLeft(f) > 0 || !fowHasCarrier(f)) return;
  const en = fleets.filter((o) => o.side !== f.side && !o.reserve && o.sqs.some((q) => fowLive(q)));
  const seen = (o) => o.sqs.some((q) => fowLive(q) && fowKnows(f, q));
  const none = !en.some(seen);
  if (!((none && (lv >= 3 || t > 30)) || (lv >= 4 && t > 15 && en.some((o) => !seen(o))))) return;
  const C = centerOf(fleetAlive(f)); if (!C) return;
  const ps = FOW.pings[f.side].filter((p) => p.fleet === f.id), p = ps[ps.length - 1];
  let P = null;
  if (p) { const d = FOW_RULE.scanR * 0.65; P = { x: C.x + Math.sin(p.a) * d, y: C.y, z: C.z + Math.cos(p.a) * d }; }   // 掃描來自 scanR 以內：取 0.65 倍，偵察半徑 350 涵蓋大半範圍
  else {
    let best = null; for (const [e, o] of f.fowLast) if (e.alive > 0 && !fowKnows(f, e) && (!best || o.t > best.t)) best = o;
    const st = FOW.start[1 - f.side];
    P = best ? { x: best.x, y: best.y, z: best.z } : st ? { x: st.x, y: st.y || 0, z: st.z } : null;
  }
  if (P) { clampMap(P); launchRecon(f, P); }
}
// 戰爭迷霧：完全不知道敵人在哪＝搜索：先往掃描訊號的方向，否則在敵方開戰位置與地圖中央之間來回
function aiSearch(f, S, C) {
  const ps = FOW.pings[f.side].filter((p) => p.fleet === f.id), p = ps[ps.length - 1];
  let P;
  if (p) { P = { x: C.x + Math.sin(p.a) * 450, z: C.z + Math.cos(p.a) * 450 }; S.note = '搜索：往掃描訊號的方向'; }
  else {
    const st = FOW.start[1 - f.side] || { x: 0, z: 0 }, A = S.searchMid ? { x: 0, z: 0 } : st;
    if (Math.hypot(A.x - C.x, A.z - C.z) < 220) S.searchMid = !S.searchMid;
    P = { x: A.x, z: A.z }; S.note = S.searchMid ? '搜索：往地圖中央' : '搜索：往敵軍開戰時的位置';
  }
  aiMove(f, S, P, Math.atan2(P.x - C.x, P.z - C.z), 120);
}
function aiThink0(f) {
  const mine = fleetAlive(f); if (!mine.length) return;
  const C = centerOf(mine), S = f.aiS, lv = f.ai.level, t = U.uTime.value;
  aiScan(f, lv, t);
  // 最近的玩家艦隊
  let E = null, Ef = null, bd = 1e18;
  for (const o of fleets) if (o.side !== f.side && !o.reserve) { const c = seenCenter(f.side, o); if (c && (c.x - C.x) ** 2 + (c.z - C.z) ** 2 < bd) { bd = (c.x - C.x) ** 2 + (c.z - C.z) ** 2; E = c; Ef = o; } }   // 被干擾：用干擾開始時的敵情；戰爭迷霧：看得到的或最後已知
  if (!E) { if (fowOn()) aiSearch(f, S, C); return; }
  S.ey = E.y;
  const d = Math.sqrt(bd), ux = (E.x - C.x) / (d || 1), uz = (E.z - C.z) / (d || 1), H = Math.atan2(ux, uz);
  const near = fleetRange(f, 'near'), far = fleetRange(f, 'far');
  const flanked = mine.some((q) => flankState(q));
  // 損失速度（最近 10 秒）
  const n = sumA(mine.map((q) => q.alive));
  if (!S.hist) S.hist = [];
  S.hist.push([t, n]); while (S.hist.length && S.hist[0][0] < t - 10) S.hist.shift();
  const lossRate = S.hist.length ? (S.hist[0][1] - n) / Math.max(1, S.hist[0][1]) : 0;
  if (lv >= 2 && aiResupply(f, S, H)) return;   // 飛彈打完：先回去補給

  // ── 反制（難度 2 以上）──
  if (lv >= 2) {
    if ((flanked || lossRate > 0.12) && d < far) aiSkill(f, 'wall');
    if (flanked && S.phase !== 'swing' && t > (S.turnT || 0) && !(fleetGroup(f) && hullsTurning(fleetGroup(f)))) { S.turnT = t + 6; S.goal = null; S.note = '反制：被繞到側背，轉向迎擊'; aiCmd(f, 'face', { x: E.x, z: E.z }); return; }
    if (d < far * 1.05) {
      // 集中火力：射程內存活最少的玩家分艦隊
      let best = null, ba = 0; for (const q of squadrons) { const v = seenSq(f.side, q); if (q.side !== f.side && v && !v.bg && v.alive > 0 && q.alive > 0 && !(fowOn() && v.stale) && Math.hypot(v.x - C.x, v.z - C.z) < far) if (!best || v.alive < ba) { best = q; ba = v.alive; } }
      if (best) aiSkill(f, 'focus', best);
    }
  }
  if (lv >= 3) {
    // 玩家以紡錘陣衝過來 → 改凹形陣包夾
    const pg = Ef && seenGroup(f.side, Ef);
    if (pg && pg.formation === 'spindle' && d < 650 && f.ai.tactic !== 'breakthrough') { aiForm(f, S, 'crescent'); S.note = '反制：對手紡錘陣衝來，改凹形陣包夾'; }
    // 玩家拉遠距離消耗我方 → 直接逼近
    if (f.ai.tactic === 'kite' && d > far * 0.95 && beamPow[f.side] < 0.45 && t > 40) { f.ai.tactic = 'push'; aiSkill(f, 'charge'); if (GAME.watch) toast(`${f.name}：被遠距離消耗，改為正面推進並衝鋒`); }
  }
  // ── 其他技能（難度 2 以上）：進入射程開「極速射擊」；掉血或被繞側而鐵壁沒開時用「機動迴避」；難度 3 以上：接敵前「干擾」──
  if (lv >= 2) {
    if (d < far * 0.95) aiSkill(f, 'rapid');
    const w = f.skills.wall;
    if ((lossRate > 0.1 || flanked) && d < far && !(w && t < w.until)) aiSkill(f, 'evade');
    if (lv >= 3 && d < far * 1.3 && jam[1 - f.side].until <= t) aiSkill(f, 'jam');
  }
  // ── 難度 4 以上：被包抄時改圓陣、脫離後換回；射程內優先打航母與快被打垮的分艦隊 ──
  if (lv >= 4) {
    const g = fleetGroup(f);
    if (g) {
      if (S.baseForm == null) S.baseForm = g.formation;
      if (flanked && lossRate > 0.06 && g.formation !== 'ring' && f.ai.tactic !== 'breakthrough') { aiForm(f, S, 'ring'); S.note = '反制：側背受擊，改圓陣全方位防禦'; }
      else if (!flanked && g.formation === 'ring' && S.baseForm !== 'ring' && lossRate < 0.03) aiForm(f, S, S.baseForm);
    }
    aiTarget(f, S, C, far, lv);
  }
  // ── 難度 5：看時間與戰損調整打法（領先就拉開距離拖到時間到，落後就推進衝鋒）──
  if (lv >= 5 && battleSetup.timeLimit < SIM_INF && !battleSetup.untimed && t > battleSetup.timeLimit * 0.65 && t > (S.tmT || 0)) {
    const me = sideAlive(f.side) / Math.max(1, GAME.init[f.side]), op = sideAlive(1 - f.side) / Math.max(1, GAME.init[1 - f.side]);
    if (me - op > 0.12 && f.ai.tactic !== 'kite') { S.tmT = t + 20; S.base = S.base || f.ai.tactic; f.ai.tactic = 'kite'; S.goal = null; S.phase = null; if (GAME.watch) toast(`${f.name}：戰損領先，拉開距離拖時間`); }
    else if (op - me > 0.02 && f.ai.tactic === 'kite') { S.tmT = t + 20; f.ai.tactic = S.base && S.base !== 'kite' ? S.base : 'push'; S.goal = null; aiSkill(f, 'charge'); if (GAME.watch) toast(`${f.name}：時間不多又落後，全力進攻`); }
  }

  switch (f.ai.tactic) {
    case 'push': {
      const want = Math.max(200, Math.min(420, near * 1.05));
      if (d > want + 80) { S.note = `推進到 ${Math.round(want)} 的交戰距離`; aiMove(f, S, { x: E.x - ux * want, z: E.z - uz * want }, H); if (lv >= 2 && d > want + 250) aiSkill(f, 'charge'); }
      else { S.note = '維持陣線，正面對射'; aiFace(f, S, E); }
      break;
    }
    case 'kite': {
      const want = Math.max(380, Math.min(720, far * 0.85));
      if (d < want - 110) { S.note = '被逼近：後退拉開距離'; aiMove(f, S, { x: C.x - ux * (want - d + 80), z: C.z - uz * (want - d + 80) }, H, 90); }
      else if (d > want + 110) { S.note = '逼近到射程邊緣'; aiMove(f, S, { x: E.x - ux * want, z: E.z - uz * want }, H, 90); }
      else { S.note = '在射程邊緣對射消耗'; aiFace(f, S, E); }
      break;
    }
    case 'flank': {
      // 繞到玩家側面：以玩家朝向的左右為準，選自己這一側（不穿越玩家正面）
      const pg = Ef && seenGroup(f.side, Ef), ph = pg ? pg.to : Math.atan2(-ux, -uz);
      const rx = Math.cos(ph), rz = -Math.sin(ph), fx = Math.sin(ph), fz = Math.cos(ph);
      if (!S.phase) { S.phase = 'swing'; S.sideSign = (C.x - E.x) * rx + (C.z - E.z) * rz >= 0 ? 1 : -1; }
      if (S.phase === 'swing') {
        // 先到側前方的集結點，再切到正側面；移動時船頭朝前進方向（速度最快）
        const lat = 430 * S.sideSign;
        const wp = S.wp || 0;
        const P = wp === 0 ? { x: E.x + rx * lat + fx * 260, z: E.z + rz * lat + fz * 260 } : { x: E.x + rx * lat - fx * 40, z: E.z + rz * lat - fz * 40 };
        const dP = Math.hypot(P.x - C.x, P.z - C.z);
        S.note = wp === 0 ? '迂迴：先到對手側前方的集結點' : '切入對手的正側面';
        if (wp === 0 && dP < 160) S.wp = 1;
        else if (wp === 1 && dP < 150) { S.phase = 'attack'; S.goal = null; }
        else { aiMove(f, S, P, Math.atan2(P.x - C.x, P.z - C.z), 140); if (lv >= 2 && wp === 1) aiSkill(f, 'charge'); }
      } else {
        S.note = '從側面近距離攻擊（側背受擊傷害較高）';
        if (d > near + 60) aiMove(f, S, { x: E.x - ux * near, z: E.z - uz * near }, H); else aiFace(f, S, E);
      }
      break;
    }
    case 'breakthrough': {
      aiForm(f, S, 'spindle');
      if (!S.dir) S.dir = { x: ux, z: uz };
      const g = fleetGroup(f);
      // 衝過玩家中央，穿出去後再掉頭
      const past = (C.x - E.x) * S.dir.x + (C.z - E.z) * S.dir.z > 120;
      if (past && !(g && maneuvering(g))) S.dir = { x: ux, z: uz };
      S.note = past ? '穿出敵陣，掉頭再衝一次' : '紡錘陣直衝對手中央';
      aiMove(f, S, { x: E.x + S.dir.x * 220, z: E.z + S.dir.z * 220 }, Math.atan2(S.dir.x, S.dir.z), 90);
      if (d < 760) aiSkill(f, 'charge');
      break;
    }
  }
}

// ───── 補給艦隊：跟隨 ─────
// 待在被跟隨艦隊的正後方 SUPPLY_RULE.follow 處；被跟隨的艦隊全滅就改跟同一方還在的艦隊
function supplyFollow(f) {
  let T = fleets.find((o) => o.id === f.follow);
  if (!T || !fleetAlive(T).length) {
    T = fleets.find((o) => o.side === f.side && !o.supply && !o.reserve && fleetAlive(o).length);
    if (!T) return;
    f.follow = T.id;
  }
  if (T.aiS && T.aiS.resup) return;   // 被跟隨的艦隊正回來補給：原地等它
  const g = fleetGroup(T), me = fleetGroup(f); if (!g || !me) return;
  const H = g.to, P = clampMap({ x: g.ax - Math.sin(H) * SUPPLY_RULE.follow, z: g.az - Math.cos(H) * SUPPLY_RULE.follow }), S = f.aiS;
  if (S.goal && Math.hypot(S.goal.x - P.x, S.goal.z - P.z) < 80 && (me.plan || Math.hypot(me.ax - P.x, me.az - P.z) < 120)) return;
  if (!S.goal && Math.hypot(me.ax - P.x, me.az - P.z) < 80) return;
  S.goal = { x: P.x, z: P.z };
  execCommand({ tick: simTick, side: f.side, type: 'move', auto: true, sqs: fleetAlive(f).map((q) => squadrons.indexOf(q)), x: P.x, z: P.z, H, pivot: false, width: null, uturn: 'auto', y: Math.round(g.ay || 0) });
}
// AI：帶飛彈的艦隊打完飛彈就回補給艦隊補（補到七成五再回去打）
function aiResupply(f, S, H) {
  const al = fleetAlive(f), n = sumA(al.map((q) => q.alive)); if (!n) return false;
  const msl = sumA(al.map((q) => q.typeAlive[2] + q.typeAlive[3]));
  if (msl / n < 0.4) return false;
  const r = ammoRatio(f);
  if (S.resup ? r > 0.75 : r > 0.15) { if (S.resup) { S.resup = false; S.goal = null; } return false; }
  const sup = fleets.find((o) => o.supply && o.side === f.side && !o.reserve && fleetAlive(o).length && supplyStock(f.side, o) > 0);
  if (!sup) { S.resup = false; return false; }
  const c = centerOf(fleetAlive(sup));
  S.resup = true; S.note = `飛彈剩 ${Math.round(r * 100)}%：回補給艦隊補充`;
  aiMove(f, S, { x: c.x, z: c.z }, H, 60);
  return true;
}

// ───── 勝負 ─────
function sideAlive(side) { let n = 0; for (const f of fleets) if (f.side === side && !f.reserve && !f.ally) for (const q of f.sqs) n += q.alive; return n; }   // 友軍（還沒倒戈的傭兵）不算進勝負
// 蟲族・群體意志：還活著的艦隊全是蟲族的一方不會潰走（要全滅才算輸）
function noRout(side) { let any = false; for (const f of fleets) if (f.side === side && !f.reserve && !f.ally && f.sqs.some((q) => q.alive > 0)) { if (fleetMods(f).fac !== 6) return false; any = true; } return any; }
// 劇情戰役的護送目標：剩不到 VIP_KEEP 就算護送失敗
const VIP_KEEP = 0.4;
function vipLost() { const f = fleets.find((o) => o.vip); if (!f) return false; let n = 0; for (const q of f.sqs) n += q.alive; return n < f.initial * VIP_KEEP; }
function checkVictory() {
  const t = U.uTime.value, tl = battleSetup.timeLimit, G = battleSetup.goal;
  const a0 = sideAlive(0), a1 = sideAlive(1), p = a0 / Math.max(1, GAME.init[0]), e = a1 / Math.max(1, GAME.init[1]);
  let r = null;
  const pend = fleets.some((f) => f.ally && f.defectAt != null && !f.reserve);   // 還有友軍沒倒戈（劇情的倒戈）：先不判勝利，等倒戈發生
  if (a1 === 0 && !pend) r = ['win', '殲滅敵軍'];
  else if (e < ROUT_AT && !noRout(1) && !pend) r = ['win', '敵軍潰走'];
  else if (a0 === 0) r = ['lose', '我軍全滅'];
  else if (p < ROUT_AT && !noRout(0)) r = ['lose', '我軍潰走'];
  else if (G && G.type === 'escort' && vipLost()) r = ['lose', `${G.name}損失過重`];
  else if (G && G.type === 'cut' && !fleets.some((f) => f.side === 1 && f.supply && !f.reserve && fleetAlive(f).length)) r = ['win', '敵軍補給艦全滅・補給線切斷'];
  else if (t >= tl && G && (G.type === 'survive' || G.type === 'escort')) r = ['win', G.type === 'escort' ? `時間到・${G.name}撐到了最後` : '時間到・撐過了敵軍的攻勢'];
  else if (t >= tl && !battleSetup.untimed) {
    const lp = 1 - p, le = 1 - e;
    r = le - lp > 0.08 ? ['win', '時間到・判定勝利（敵方損失較重）'] : lp - le > 0.08 ? ['lose', '時間到・判定敗北（我方損失較重）'] : ['draw', '時間到・平手'];
  }
  if (r) GAME.result = battleResult(r[0], r[1]);
}
function battleResult(kind, why, extra) {
  const a0 = sideAlive(0), a1 = sideAlive(1);
  return { kind, why, t: U.uTime.value, alive: [a0, a1], ratio: [a0 / Math.max(1, GAME.init[0]), a1 / Math.max(1, GAME.init[1])], tick: simTick, hash: fullHash(), ...extra };   // hash：結束那一刻的戰局指紋（回放比對用）
}
// 撤退／手動結束：記下結束的 tick，回放才會停在同一刻（不靠勝負判定）
const RETREAT_MIN_T = 60;   // 開戰不到這麼久就撤退：不給經驗與功勳
function quitBattle() {
  if (GAME.result) return;
  const sim = GAME.sc && GAME.sc.sim;
  GAME.result = battleResult(sim ? 'end' : 'lose', sim ? '手動結束' : '撤退', { retreat: true });
}
const replayEndOf = (R) => ({ tick: R.tick, kind: R.kind, why: R.why, retreat: true });
function gameTick() {
  if (!(GAME.phase === 'battle' || GAME.phase === 'replay') || GAME.result) return;
  const end = GAME.replaying && GAME.replayEnd;
  if (end && simTick >= end.tick) { GAME.result = battleResult(end.kind, end.why, { retreat: !!end.retreat }); return; }
  const t = U.uTime.value;
  for (const f of fleets) if (f.reserve && f.activateAt != null && t >= f.activateAt) activateReserve(f);
  // 倒戈的觸發（劇情）：敵軍剩下的比例夠低、或快到原本的倒戈秒數，就排定 lead 秒後倒戈（defT＝倒戈的時間，台詞跟著它走）
  const DF = battleSetup.defect;
  if (DF) for (const f of fleets) if (f.ally && f.defectAt != null && !f.defSched && (sideAlive(1) <= GAME.init[1] * DF.left || t >= f.defectAt - DF.lead)) { f.defSched = true; f.defT = f.defectAt = Math.min(f.defectAt, t + DF.lead); }
  for (const f of fleets) if (f.ally && f.defectAt != null && t >= f.defectAt) defectFleet(f);
  if (simTick % 30 === 0) for (const f of fleets) if (f.ai && !f.reserve && f.side !== GAME.simCtl) aiThink(f);
  if (simTick % 30 === 7) for (const f of fleets) if (f.supply && f.follow >= 0 && !f.reserve) supplyFollow(f);
  if (simTick % 30 === 22 && battleSetup.lines) storyLines(t);   // 劇情戰役：戰鬥中的通訊台詞
  if (simTick % 30 === 15 && !battleSetup.noVictory) checkVictory();   // 模擬室可以關掉勝負判定
}

// ───── 提示 ─────
function toast(msg, cls = '') {
  if ((GAME.phase === 'battle' || GAME.phase === 'replay') && cls !== 'hint') { (GAME.log || (GAME.log = [])).push({ t: U.uTime.value, msg, cls }); if (GAME.log.length > 40) GAME.log.shift(); }   // 艦橋的通訊紀錄
  if (!uiOn('toasts')) return;
  if (((PL.on && !PL.spec) || CAP.on) && cls !== 'pilot' && cls !== 'bad') return;   // 駕駛中、艦長：AI 指揮官的通知只記在紀錄裡，不擋畫面
  const el = document.createElement('div'); el.className = 'toast ' + cls; el.textContent = msg;
  const box = gEl('toasts'); box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 3800);
}

// ───── 地形與部署區的地面標記 ─────
const fieldGroup = new THREE.Group(); fieldGroup.renderOrder = 0; scene.add(fieldGroup);
function rectLine(r, color, op) {
  const l = lineObj(color, op); setPts(l, [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1], [r.x0, r.z0]]); return l;
}
// 3D 地形：星雲、小行星帶是半透明的球；巨大小行星是實體（凹凸的岩塊，光影直接烤在頂點顏色裡，2D／3D 都看得到）
function rockMesh(tr) {
  const geo = new THREE.IcosahedronGeometry(tr.r, 4), P = geo.attributes.position, n = new THREE.Vector3();
  const sd = (tr.x * 0.013 + tr.z * 0.029) % 7;
  for (let i = 0; i < P.count; i++) {
    n.fromBufferAttribute(P, i).normalize();
    const k = 0.92 + 0.1 * Math.sin(n.x * 4.1 + sd) * Math.cos(n.y * 3.3 - sd) + 0.05 * Math.sin(n.z * 9.7 + n.x * 7.3 + sd * 2);   // 半徑 0.78～1.07 倍
    P.setXYZ(i, n.x * tr.r * k, n.y * tr.r * k, n.z * tr.r * k);
  }
  geo.computeVertexNormals();
  const N = geo.attributes.normal, col = new Float32Array(P.count * 3), base = new THREE.Color(TERRAIN_TYPES[tr.type].color), L = new THREE.Vector3(-0.5, 0.8, 0.35).normalize();
  for (let i = 0; i < P.count; i++) {
    n.fromBufferAttribute(N, i);
    const sh = 0.18 + 0.82 * Math.max(0, n.dot(L)) + 0.08 * Math.max(0, -n.y), v = 0.9 + 0.2 * Math.sin(i * 1.7);
    col[i * 3] = base.r * sh * v; col[i * 3 + 1] = base.g * sh * v; col[i * 3 + 2] = base.b * sh * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  m.position.set(tr.x, tr.y || 0, tr.z); m.renderOrder = 1;
  return m;
}
function drawField(showZones) {
  fieldGroup.clear();
  for (const tr of terrainList()) {
    const def = TERRAIN_TYPES[tr.type], y = tr.y || 0, has3 = tr.y != null || def.solid;
    if (def.solid) fieldGroup.add(rockMesh(tr));
    else if (has3) {
      const sph = new THREE.Mesh(new THREE.SphereGeometry(tr.r, 40, 24), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: tr.type === 'nebula' ? 0.05 : 0.03, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      sph.position.set(tr.x, y, tr.z); sph.renderOrder = 0; fieldGroup.add(sph);
      if (tr.type === 'asteroid') {   // 小行星帶：球裡面散著碎石（點）
        const R = mulberry32(Math.round(tr.x * 7 + tr.z * 13) >>> 0), N = Math.min(900, Math.round(tr.r * 4)), pos = new Float32Array(N * 3);
        for (let k = 0; k < N; k++) { let a, b, c; do { a = R() * 2 - 1; b = R() * 2 - 1; c = R() * 2 - 1; } while (a * a + b * b + c * c > 1); pos.set([tr.x + a * tr.r, y + b * tr.r, tr.z + c * tr.r], k * 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        fieldGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: def.color, size: 2.2, transparent: true, opacity: 0.7, depthWrite: false })));
      }
    } else {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(tr.r, 64), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.045, depthWrite: false, toneMapped: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(tr.x, -1, tr.z); disc.renderOrder = 0; fieldGroup.add(disc);
    }
    // 外框：在地形自己的高度畫一圈；不在基準面上的再往基準面畫一條垂直線（2D 也看得出高度）
    const ring = lineObj(def.color, def.solid ? 0.35 : 0.55), pts = [];
    for (let k = 0; k <= 64; k++) pts.push([tr.x + Math.cos(k / 64 * TAU) * tr.r, tr.z + Math.sin(k / 64 * TAU) * tr.r, y]);
    setPts(ring, pts); fieldGroup.add(ring);
    if (Math.abs(y) > 5) { const st = lineObj(def.color, 0.35); setPts(st, [[tr.x, tr.z, y], [tr.x, tr.z, 0], [tr.x - 10, tr.z, 0], [tr.x + 10, tr.z, 0]]); fieldGroup.add(st); }
  }
  if (showZones) { const mp = GAME.sc && GAME.sc.mp, me = mp ? MP_ZONES[GAME.playerSide] : DEPLOY_ZONE; const zc = (sd) => new THREE.Color(FACTION[SIDE_FAC[sd]].ui).getHex(); fieldGroup.add(rectLine(me, zc(GAME.playerSide), 0.8), rectLine(mp ? MP_ZONES[1 - GAME.playerSide] : ENEMY_ZONE, zc(1 - GAME.playerSide), 0.5)); }   // 部署區用雙方陣營的顏色
}

// ═════ 操作難度 ═════
// 一般：2D／3D／指揮官模式都能用，艦隊都在同一平面；進階：作戰中只能 3D 與指揮官模式，可以升降；
// 擬真：開戰直接上艦橋、不能離開，而且射線穿過別的友軍部隊時可能誤傷（同部隊多半停火）。存在玩家存檔（fleet.oplv），回放不受限制
const OP_LEVELS = [
  { name: '一般', desc: '可用 2D、3D 與指揮官模式；艦隊都在同一平面，不能升降；戰爭迷霧：只看得到偵測範圍內、掃描到的敵軍' },
  { name: '進階', desc: '只能用 3D 與指揮官模式；艦隊可以上下移動；戰爭迷霧：只看得到偵測範圍內、掃描到的敵軍' },
  { name: '擬真', desc: '作戰中只能用指揮官模式（艦橋）；艦隊可以上下移動；射線穿過別的友軍部隊會誤傷，同一個部隊（同陣型）內被擋住多半停火；戰爭迷霧：只看得到偵測範圍內、掃描到的敵軍，自動攻擊也只打看得到的（可以用區域攻擊盲射）' },
];
function opLevel() { let n = 0; try { n = +(STORE.getItem('fleet.oplv') || 0); } catch (e) { n = 0; } return OP_LEVELS[n] ? n : 0; }
function setOpLevel(n) { try { STORE.setItem('fleet.oplv', String(n)); } catch (e) { /* 只在本次 */ } }
function opNow() { return ((GAME.phase === 'battle' || GAME.phase === 'deploy') && GAME.op) || 0; }   // 目前生效的難度（作戰、部署中）
function applyOp(op = GAME.sc && (GAME.sc.mp || GAME.sc.tut) ? GAME.sc.op : opLevel(), fow = true) { GAME.op = op; opts.flat = op === 0; opts.ff = op === 2 ? 2 : false; opts.fow = !!fow; opts.ray = opts.deflect = opts.rotate = true; }   // 建立戰場前呼叫（規則會記進回放）；fow＝戰爭迷霧（所有難度都有，模擬室可以關）
function opSeg(id) { const cur = opLevel(); return `<div class="wed-seg rd-seg" id="${id}">${OP_LEVELS.map((o, i) => `<button data-v="${i}" class="${cur === i ? 'on' : ''}">${o.name}</button>`).join('')}</div>`; }
function bindOpSeg(id, redraw) { gEl(id).querySelectorAll('button').forEach((b) => (b.onclick = () => { setOpLevel(+b.dataset.v); redraw(); })); }
function force3D() { if (opNow() >= 1 && !mode3D) { setRenderMode('3d', false); GAME.forced3D = true; } }   // 進階以上：作戰中強制 3D（不改存檔的畫面設定）

// ═════ 畫面 ═════
function setPhase(ph) {
  if (PL.on && ph !== 'battle') pilotEnd();   // 離開作戰＝結束駕駛
  if (CAP.on && ph !== 'battle') capEnd();   // 離開作戰＝結束艦長模式
  if (BR.on && ph !== 'battle' && ph !== 'replay') exitBridge();   // 離開作戰＝離開艦橋
  GAME.phase = ph;
  if (GAME.forced3D && ph !== 'battle' && ph !== 'deploy' && ph !== 'simedit') { GAME.forced3D = false; if (mode3D) setRenderMode('2d', false); }   // 離開作戰：回到原本的 2D
  { const op = opNow(), on = ph === 'battle' || ph === 'deploy';
    document.body.classList.toggle('op-flat', on && op === 0); document.body.classList.toggle('op-adv', op >= 1); document.body.classList.toggle('op-sim', op === 2); }
  document.body.classList.toggle('game-on', PHASE_ON.includes(ph) || ph === 'replay');
  document.body.classList.toggle('game-battle', ph === 'battle' || ph === 'replay');
  document.body.classList.toggle('game-deploy', ph === 'deploy');
  document.body.classList.toggle('ld-on', ph === 'loadout');   // 編成：背景是 3D 太空港（dock.js）
  document.body.classList.remove('hg-on');   // 王牌飛行員的機庫（hangar.js）：進機庫畫面時再加回來
  document.body.classList.toggle('game-sand', ph === 'sandbox');
  document.body.classList.toggle('game-simedit', ph === 'simedit');
  document.body.classList.toggle('game-watch', !!GAME.watch && (ph === 'battle' || ph === 'replay'));
  if (ph !== 'simedit') { const sb = gEl('simbar'); if (sb) sb.innerHTML = ''; SIM.drag = null; }
  gEl('battlehud').hidden = !(ph === 'battle' || ph === 'replay');
  gEl('skillbar').hidden = ph !== 'battle';
  gEl('deploybar').hidden = ph !== 'deploy';
  if (ph !== 'battle' && ph !== 'replay') { gEl('battlehud').innerHTML = ''; }
}
function overlay(html) { const g = gEl('game'); g.hidden = !html; gEl('g-screen').innerHTML = html || ''; g.scrollTop = 0; }

function menuBg() {
  GAME.recView = false; GAME.watch = false; GAME.pilot = null; GAME.captain = null; opts.flat = opts.ff = opts.fow = false; GAME.op = 0;
  if (!battleSetup || !battleSetup.bg) { newBattle(12345); setRule('fire', true); }
  paused = false; updateTimeUI();
}
// ───── 選單圖示與圖塊（主選單、單人戰鬥的模式選擇、模式大廳共用） ─────
// 線條圖示（24×24，顏色跟著 currentColor）
const MENU_ICONS = {
  single: '<path d="M12 2.5 19 20l-7-4-7 4z"/><path d="M12 8v6"/>',
  multi: '<path d="M4 4l11 11M20 4 9 15M13 17l4-4M7 13l4 4M16.5 16.5 20 20M7.5 16.5 4 20"/>',
  rec: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
  wed: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  set: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  save: '<path d="M6.5 19a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 17.6 8.5 4.5 4.5 0 0 1 17.5 19z"/><path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5"/>',
  test: '<path d="M9 3h6M10 3v6l-5 10a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7.5 15h9"/>',
  cmd: '<path d="M12 2.5l3.2 7.5H8.8zM6 12l3.2 7.5H2.8zM18 12l3.2 7.5h-6.4z"/>',
  pilot: '<path d="M12 2l1.6 6.2L21 13v2l-7.3-2-.5 5 3 2.2V22L12 21l-4.2 1v-1.8l3-2.2-.5-5L3 15v-2l7.4-4.8z"/>',
  captain: '<path d="M12 3 6 8v7l6 6 6-6V8z"/><path d="M12 3v18M6 12h12"/>',
  story: '<path d="M12 6C10 4.5 7 4 3 4v15c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2z"/><path d="M12 6v15"/>',
  rand: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/>',
  endless: '<path d="M12 12c-2-3-4-4.5-6-4.5a4.5 4.5 0 0 0 0 9c2 0 4-1.5 6-4.5s4-4.5 6-4.5a4.5 4.5 0 0 1 0 9c-2 0-4-1.5-6-4.5z"/>',
  sim: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12 4 7.5"/>',
  train: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  watch: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  tal: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z"/>',
  tav: '<path d="M5 9h10v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M15 11h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2M5 9c0-2 1.3-3.2 3-3.2C8.6 4.6 9.7 4 11 4s2.6.8 3 2c1 .2 1 1.5 1 3"/>',
  hang: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.5-.6-.6-2.5z"/>',
};
function menuIcon(k) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MENU_ICONS[k] || ''}</svg>`; }
// 圖塊按鈕：o = { id, data, icon, en, name, desc, st, cls, off, badge, tag }；desc 太長時畫面上會截斷，完整內容放在 title
function menuTile(o) {
  const attr = o.id ? `id="${o.id}"` : '', data = o.data ? ` ${o.data}` : '';
  return `<button class="mt ${o.cls || ''} ${o.off ? 'off' : ''}" ${attr}${data} ${o.off ? 'disabled' : ''} title="${escH(String(o.desc || '').replace(/<[^>]+>/g, ''))}">
    <span class="mt-ic">${menuIcon(o.icon)}</span>
    <span class="mt-tx">${o.en ? `<span class="mt-en">${o.en}</span>` : ''}<b class="mt-name">${o.name}</b>${o.desc ? `<span class="mt-desc">${o.desc}</span>` : ''}${o.off ? '<span class="mt-st">尚未開放</span>' : o.st ? `<span class="mt-st">${o.st}</span>` : ''}</span>
    ${o.badge ? `<i class="mt-badge" title="可分配的天賦點數">${o.badge}</i>` : ''}${o.tag ? `<span class="mt-tag">${o.tag}</span>` : ''}</button>`;
}

function showMenu() {
  mpQuit(); pvpExit();   // 離開多人戰鬥：斷開連線、換回單人的指揮官
  setPhase('menu'); GAME.replaying = false; GAME.playerSide = 0; menuBg();
  const T = (id, icon, name, desc, cls = '') => menuTile({ id, icon, name, desc, cls });
  overlay(`<div class="g-menu">
    <h1>星海艦隊戰</h1><div class="sub">FLEET TACTICS · 原型</div>
    ${window.API ? `<div class="g-player"><span class="g-dim">玩家</span><b>${escH(API.name())}</b><span id="m-sync" class="sync-${STORE.state ? STORE.state() : 'ok'}">${syncText()}</span><button class="g-btn sm" id="m-acct">帳號</button><button class="g-btn sm" id="m-out">登出</button></div>` : ''}
    <div class="mm-tiles">
      <div class="mt-grid mt-main">
        ${T('m-single', 'single', '單人戰鬥', '指揮官・王牌飛行員', 'pri row')}
        ${T('m-multi', 'multi', '多人戰鬥', '和內網的其他玩家 1 對 1 對戰，或觀戰', 'pri row')}
      </div>
      <div class="mt-grid mt-util">
        ${T('m-rec', 'rec', '戰鬥回放', '每場戰鬥都存在伺服器，隨時可以重看')}
        ${T('m-wed', 'wed', '武器配置', '調整、新增各艦種的武器位置（2D／3D 共用）')}
        ${T('m-set', 'set', '設定', '按鍵綁定、遊戲速度、介面資訊')}
        ${T('m-save', 'save', '存檔管理', '3 個雲端存檔欄位：儲存、讀取進度，也可以匯出成檔案或從檔案匯入')}
        ${T('m-test', 'test', '遊戲測試', '大軍畫面、效能與戰鬥數值（射程、側背受擊倍率等）的測試場')}
      </div>
    </div>
    <div class="mm-note" id="mm-note"></div>
    <div class="g-row mm-view" style="justify-content:center"><span class="g-dim">畫面</span><button class="g-btn sm ${mode3D ? '' : 'pri'}" id="m-2d">2D 像素</button><button class="g-btn sm ${mode3D ? 'pri' : ''}" id="m-3d">3D 模型</button><span class="g-dim" style="font-size:calc(12px * var(--ui))">（作戰中也可按 M 或畫面上方按鈕切換）</span></div>
  </div>`);
  gEl('m-2d').onclick = () => { setRenderMode('2d'); showMenu(); };
  gEl('m-3d').onclick = () => { setRenderMode('3d'); showMenu(); };
  gEl('m-single').onclick = () => { GAME.spMode = null; showSingle(); };
  gEl('m-multi').onclick = () => (window.API ? showMulti() : (gEl('mm-note').textContent = '多人戰鬥要連上伺服器才能玩。'));
  gEl('m-wed').onclick = () => openWeaponEditor(showMenu);
  gEl('m-rec').onclick = () => showRecords();
  if (window.API) { gEl('m-out').onclick = () => API.logout(); gEl('m-acct').onclick = () => showAccount(); }
  gEl('m-set').onclick = () => openSettings();
  gEl('m-save').onclick = () => (window.API ? showSaves() : (gEl('mm-note').textContent = '存檔管理要連上伺服器才能用。'));
  gEl('m-test').onclick = () => { overlay(null); setPhase('sandbox'); newBattle(12345); setCmdSide(0); };   // 原本的測試場（數值、畫面）
}
// 單人戰鬥：先選模式（指揮官、王牌飛行員…），再進該模式的大廳。GAME.spMode＝目前所在的模式（戰鬥、子畫面返回時回到同一個大廳）
// 新模式加在 SP_MODES（icon 是 MENU_ICONS 的 key）；每個模式都有 主線、隨機戰役、無限戰場、模擬室、訓練場、天賦，其餘是該模式獨有的（showSpHub）
const SP_MODES = [
  { key: 'cmd', icon: 'cmd', en: 'COMMANDER', name: '指揮官', desc: '指揮整支艦隊：編成、部署、下令，用陣型、技能與地形打贏艦隊戰',
    st: () => { const pts = COMMANDERS.reduce((s, o) => s + Math.max(0, cmdrPoints(o.id)), 0); return `${COMMANDERS.length} 位指揮官${pts ? `・可分配天賦 ${pts} 點` : ''}・功勳 ${fmtN(ROSTER.merit)}`; } },
  { key: 'pilot', icon: 'pilot', en: 'ACE PILOT', name: '王牌飛行員', desc: '不指揮艦隊：以一名飛行員的身分駕駛特殊改裝的艦載機加入戰場。背後或座艙視角、滑鼠瞄準，靠自己的任務決定成敗',
    st: () => pilotSummary() },
  { key: 'captain', icon: 'captain', en: 'CAPTAIN', name: '艦長', desc: '特種部隊隊長：帶 1～5 艘特製戰艦執行敵後作戰。直接操控戰艦的上下左右，潛入、破壞、斬首，再撤離',
    st: () => capSummary() },
];
function showSingle() {
  const M = SP_MODES.find((m) => m.key === GAME.spMode);
  if (M) return showSpHub(M);
  mpQuit(); pvpExit();
  setPhase('menu'); GAME.replaying = false; GAME.playerSide = 0; menuBg();
  overlay(`<div class="g-wrap sp-wrap">
    <div class="g-head"><h2>單人戰鬥</h2><span class="crumb">選擇遊戲模式</span><span class="g-sp"></span><button class="g-btn" id="sp-back">← 主選單</button></div>
    <div class="mt-grid mt-modes">${SP_MODES.map((m) => menuTile({ data: `data-spm="${m.key}"`, icon: m.icon, en: m.en, name: m.name, desc: m.desc, st: m.st(), cls: 'big' })).join('')}</div></div>`);
  gEl('sp-back').onclick = showMenu;
  document.querySelectorAll('[data-spm]').forEach((b) => (b.onclick = () => { GAME.spMode = b.dataset.spm; showSingle(); }));
}
// 模式大廳：上排＝作戰（共通的五種，還沒做的顯示「尚未開放」）；下排＝天賦（共通）＋該模式專屬
function showSpHub(M) {
  mpQuit(); pvpExit();
  setPhase('menu'); GAME.replaying = false; GAME.playerSide = 0; menuBg();
  const cmd = M.key === 'cmd', own = '專屬';
  let ops, subs;
  if (cmd) {
    const c = campLoad(), ro = randOpts(), sp = storyLoad();
    const pts = COMMANDERS.reduce((s, o) => s + Math.max(0, cmdrPoints(o.id)), 0);
    ops = [
      { id: 'sp-story', icon: 'story', en: 'CAMPAIGN', name: '主線・雙星記', desc: '劇情戰役：選擇帝國篇或聯盟篇，從頭到尾指揮同一個陣營，打到這場戰爭的結局；番外篇〈雙星之外〉是灰鴉傭兵團的故事', st: STORY_LINE[sp.line] ? `${STORY_LINE[sp.line].name} ${storyCount(sp, sp.line)}／${storySeq(sp.line).length} 場` : '尚未開始', cls: 'pri' },
      { id: 'sp-rand', icon: 'rand', en: 'SKIRMISH', name: '隨機戰役', desc: '自選規模與敵軍強度，敵軍和地形每次隨機生成', st: `${RAND_SIZES[ro.size].name}・敵軍${RAND_DIFF[ro.diff].name}・${ro.env ? GROUND_ENV[ro.env].name : `地形${RAND_TERR[ro.terr].name}`}` },
      { id: 'sp-camp', icon: 'endless', en: 'ENDLESS', name: '無限戰場', desc: '無限關卡：敵軍依你的指揮官等級生成，一關比一關大', st: `第 ${c.stage} 關・最高第 ${c.best} 關` },
      { id: 'sp-sand', icon: 'sim', en: 'SIMULATOR', name: '模擬室', desc: '自由布置雙方艦隊、指揮官與地形，用正式規則測試戰術（可接管任一方）', st: '不計戰績、不給經驗' },
      { id: 'sp-train', icon: 'train', en: 'TRAINING', name: '訓練場', desc: '從零開始的教學課程與戰術手冊，以及固定的作戰關卡：讀情報、編成、部署，熟悉各種戰況', st: `教學 ${TUT_LESSONS.filter((L) => tutLoad().done[L.id]).length}／${TUT_LESSONS.length}・${SCENARIOS.length} 場作戰` },
    ];
    subs = [
      { id: 'sp-tal', icon: 'tal', name: '天賦', desc: `${COMMANDERS.length} 位指揮官・等級與天賦`, badge: pts },
      { id: 'sp-watch', icon: 'watch', name: 'AI 對戰', desc: `看 AI 互打並即時解說・${watchSummary()}`, tag: own },
      { id: 'sp-tav', icon: 'tav', name: '星際酒館', desc: `功勳 ${fmtN(ROSTER.merit)}・招募兩個陣營的指揮官`, tag: own },
    ];
  } else if (M.key === 'captain') {
    ({ ops, subs } = capHubItems(own));
  } else {
    const p = pilotLoad(), free = pilotTalFree(p), L = pilotLevel(p.xp);
    ops = [
      { id: 'sp-story', icon: 'story', en: 'CAMPAIGN', name: '主線', desc: '飛行員的劇情戰役', off: true },
      { id: 'sp-rand', icon: 'rand', en: 'SORTIE', name: '隨機戰役', desc: '加入隨機生成的艦隊戰：每次出擊隨機指派任務，完成後回己方航母降落結算', st: `${RAND_SIZES[p.size].name}・${FACTION_NAME[p.fac === 1 ? 1 : 0]}・出擊 ${p.sorties}`, cls: 'pri' },
      { id: 'sp-camp', icon: 'endless', en: 'ENDLESS', name: '無限戰場', desc: '一場接一場的連續出擊', off: true },
      { id: 'sp-sand', icon: 'sim', en: 'SIMULATOR', name: '模擬室', desc: '自由布置戰場與目標，測試機體與武裝', off: true },
      { id: 'sp-train', icon: 'train', en: 'TRAINING', name: '訓練場', desc: '飛行、射擊、降落整補的教學', off: true },
    ];
    subs = [
      { id: 'sp-tal', icon: 'tal', name: '天賦', desc: `飛行員 Lv ${L.lv}・戰功 ${fmtN(p.merit)}`, badge: free > 0 ? free : 0 },
      { id: 'sp-hang', icon: 'hang', name: '機庫', desc: `${PILOT_FRAMES[p.frame].name}・調整機體、武裝與纏鬥裝備`, tag: own },
    ];
  }
  overlay(`<div class="g-wrap sp-wrap mt-hub">
    <div class="g-head"><h2 class="mt-h2"><span class="mt-ic">${menuIcon(M.icon)}</span>${M.name}</h2><span class="crumb">單人戰鬥・選擇作戰</span><span class="g-sp"></span><button class="g-btn" id="sp-back">← 選擇模式</button></div>
    ${cmd ? `<div class="sp-op"><span class="g-dim">操作難度</span>${opSeg('sp-op')}<span class="sp-opd">${OP_LEVELS[opLevel()].desc}</span></div>` : ''}
    <div class="mt-sec">作戰</div>
    <div class="mt-grid mt-ops">${ops.map(menuTile).join('')}</div>
    <div class="mt-sec">整備</div>
    <div class="mt-grid mt-subs">${subs.map((o) => menuTile({ ...o, cls: 'row' })).join('')}</div></div>`);
  gEl('sp-back').onclick = () => { GAME.spMode = null; showSingle(); };
  if (cmd) {
    bindOpSeg('sp-op', showSingle);
    gEl('sp-story').onclick = () => showStory();
    gEl('sp-train').onclick = () => showTraining();
    gEl('sp-rand').onclick = showRandom;
    gEl('sp-camp').onclick = showCampaign;
    gEl('sp-sand').onclick = () => showSim();
    gEl('sp-watch').onclick = () => showWatch();
    gEl('sp-tal').onclick = () => showCommanders(showSingle);
    gEl('sp-tav').onclick = () => showTavern();
  } else if (M.key === 'captain') capHubBind();
  else {
    gEl('sp-rand').onclick = () => showPilot('rand');
    gEl('sp-hang').onclick = () => showPilot('hangar');
    gEl('sp-tal').onclick = () => showPilot('tal');
  }
}
// ───── 指揮官與天賦 ─────
function showCommanders(back) {
  if (back) GAME.talBack = back;
  const sel = COMMANDERS.find((c) => c.id === GAME.talSel) || COMMANDERS[0]; GAME.talSel = sel.id;
  const lv = cmdrLevel(sel.id), xp = cmdrXP(sel.id), tal = cmdrTal(sel.id), pts = cmdrPoints(sel.id);
  const list = COMMANDERS.map((c) => `<button class="tal-who ${c === sel ? 'on' : ''}" data-c="${c.id}"><b>${c.title} ${c.name}</b><span><span class="g-${FACTION_CLS[c.faction || 0]}">${FACTION_NAME[c.faction || 0].slice(0, 2)}</span>・Lv ${cmdrLevel(c.id)}・${TRAIT_NAME[c.trait]}</span>${cmdrPoints(c.id) > 0 ? `<i>${cmdrPoints(c.id)}</i>` : ''}</button>`).join('');
  const node = (t0) => {
    const t = talFor(t0, sel.faction), r = tal[t.id] || 0, can = talentCan(sel, t0), innate = t.kind === 'skill' && sel.skills.includes(t.skill);
    const pips = t.kind === 'skill' ? '' : `<span class="tal-pips">${Array.from({ length: t.max }, (_, k) => `<i class="${k < r ? 'on' : ''}"></i>`).join('')}</span>`;
    const desc = t.kind === 'skill' ? SKILLS[t.skill].desc : (r ? `目前：${t.desc(r)}` : t.desc(1)) + (r && r < t.max ? `<br><span class="nx">下一階：${t.desc(r + 1)}</span>` : '');
    const state = innate ? '固有技能' : t.kind === 'skill' ? (r ? '已學會' : can === 'ok' ? `學習（${t.cost} 點）` : can) : r >= t.max ? '已滿' : can === 'ok' ? `+1（${t.cost} 點）` : can;
    return `<div class="tal-node ${t.kind === 'skill' ? 'sk' : ''} ${r || innate ? 'got' : ''}" data-t="${t.id}">
      <div class="tal-top"><b>${t.name}</b>${pips}</div><div class="tal-desc">${desc}</div>
      <div class="tal-act"><button class="g-btn sm" data-add="${t.id}" ${can === 'ok' ? '' : 'disabled'}>${state}</button>${r && !innate ? `<button class="g-btn sm" data-sub="${t.id}" title="退回點數">−</button>` : ''}</div></div>`;
  };
  const keepScroll = GAME.talOpen ? gEl('game').scrollTop : 0;   // 加點後畫面不要跳回頂端
  const tree = TALENT_BRANCHES.map(([br, name]) => `<div class="tal-col"><h4>${name}</h4>${TALENTS.filter((t) => t.br === br).map(node).join('')}</div>`).join('');
  const FT_ = FAC_TRAIT[sel.faction || 0];   // 種族特性＋專屬天賦
  const facRow = FT_ ? `<div class="tal-fac"><div><h4>種族特性・<span class="g-${FACTION_CLS[sel.faction || 0]}">${FACTION_NAME[sel.faction || 0]}</span></h4><b>${FT_.name}</b><div class="g-dim">${FT_.desc}</div></div>${node(TALENT_BY_ID.fac)}</div>` : '';
  const skills = commanderSkills(sel.skills, tal).map((id) => `<span class="tal-sk ${sel.skills.includes(id) ? '' : 'new'}" title="${SKILLS[id].desc}">${SKILLS[id].name}</span>`).join('');
  overlay(`<div class="g-wrap tal-wrap"><div class="g-head"><h2>指揮官</h2><span class="crumb">每升一級得 1 點天賦，用來強化能力或學習技能；可以隨時退回重新分配</span><span class="g-sp"></span><button class="g-btn" id="c-back">返回</button></div>
    <div class="tal-layout"><div class="tal-list">${list}</div>
      <div class="g-card tal-main">
        <div class="tal-head"><div><h3 class="tal-name">${sel.title} ${sel.name}</h3><div class="g-dim" style="font-size:calc(12.5px * var(--ui))">${sel.bio}</div></div>
          <div class="tal-lv"><b>Lv ${lv}</b><div class="xpbar"><i style="width:${(xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100}%"></i></div><span class="g-dim">${xp % XP_PER_LEVEL} / ${XP_PER_LEVEL} 經驗</span></div>
          <div class="tal-pt"><span class="g-dim">天賦點數</span><b class="${pts > 0 ? 'g-emp' : ''}">${pts}</b><span class="g-dim">／${lv}</span><button class="g-btn sm" id="c-reset" ${talSpent(tal) ? '' : 'disabled'}>全部退回</button></div></div>
        <dl class="kv"><dt>固有特性</dt><dd>${TRAIT_NAME[sel.trait]} +8%<br><small class="g-dim">${TRAIT_ROT[sel.trait]}</small></dd><dt>可用技能</dt><dd>${skills}</dd></dl>
        <div class="tal-tree">${tree}</div>${facRow}</div></div></div>`);
  const root = gEl('game'); root.scrollTop = keepScroll; GAME.talOpen = true;
  root.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { GAME.talSel = b.dataset.c; showCommanders(); }));
  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { if (talentAdd(sel, TALENT_BY_ID[b.dataset.add])) showCommanders(); }));
  root.querySelectorAll('[data-sub]').forEach((b) => (b.onclick = () => { if (talentSub(sel, TALENT_BY_ID[b.dataset.sub])) showCommanders(); }));
  gEl('c-reset').onclick = () => { CMDR_SAVE[sel.id].tal = {}; saveCmdrs(CMDR_SAVE); showCommanders(); };
  gEl('c-back').onclick = () => { const f = GAME.talBack || showMenu; GAME.talBack = null; GAME.talOpen = false; f(); };
}

// 小地圖（SVG）：部署區、地形、敵軍推估位置
function minimapSVG(sc, intel, lo) {
  const W = 360, Hh = 260, mx = (x) => (x - MAP_BOUNDS.x0) / (MAP_BOUNDS.x1 - MAP_BOUNDS.x0) * W, mz = (z) => (z - MAP_BOUNDS.z0) / (MAP_BOUNDS.z1 - MAP_BOUNDS.z0) * Hh;
  const sx = W / (MAP_BOUNDS.x1 - MAP_BOUNDS.x0);
  const rect = (r, c, op) => `<rect x="${mx(r.x0)}" y="${mz(r.z0)}" width="${mx(r.x1) - mx(r.x0)}" height="${mz(r.z1) - mz(r.z0)}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-opacity=".7" stroke-dasharray="4 3"/>`;
  let s = `<svg class="minimap" viewBox="0 0 ${W} ${Hh}">`;
  s += groundMinimapSVG(sc.ground, W, Hh, mx, mz);   // 近地：高度底圖、砲台
  s += rect(DEPLOY_ZONE, '#f2b35a', 0.08) + rect(ENEMY_ZONE, '#7cc4ff', 0.06);
  for (const t of sc.terrain) s += `<circle cx="${mx(t.x)}" cy="${mz(t.z)}" r="${t.r * sx}" fill="#${TERRAIN_TYPES[t.type].color.toString(16).padStart(6, '0')}" fill-opacity=".22"/>`;
  for (const f of intel.fleets) s += `<circle cx="${mx(f.x)}" cy="${mz(f.z)}" r="${f.fuzz * sx + 6}" fill="#7cc4ff" fill-opacity=".18" stroke="#7cc4ff" stroke-opacity=".6"/><text x="${mx(f.x)}" y="${mz(f.z) - f.fuzz * sx - 9}" fill="#9fd2ff" font-size="10" text-anchor="middle">${f.name}</text>`;
  if (lo) lo.fleets.forEach((f, k) => { s += `<circle cx="${mx(f.x)}" cy="${mz(f.z)}" r="6" fill="#f2b35a"/><text x="${mx(f.x)}" y="${mz(f.z) + 18}" fill="#f2b35a" font-size="10" text-anchor="middle">第${'一二三四'[k]}艦隊</text>`; });
  s += `<text x="6" y="${Hh - 6}" fill="#8592a8" font-size="10">虛線框＝部署區　藍圈＝敵軍推估位置（越大越不確定）</text></svg>`;
  return s;
}
function stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
// 簡報：敵軍的陣營＝關卡指定的外觀，沒指定就是玩家陣營的對手
function briefEnemyFac(sc) { return sc.enemyFac != null ? sc.enemyFac : ((GAME.loadout && GAME.loadout.faction) ?? GAME.faction ?? 0) === 1 ? 0 : 1; }
// 簡報的種族特性卡：只寫特色與建議的剋制方式（不寫數字）；還沒開放特性的陣營不顯示
function briefFaction(fac, title = '敵軍特性') {
  const T = FAC_TRAIT[fac]; if (!T) return '';
  return `<div class="g-card brief-fac"><h3>${title}・<span class="g-${FACTION_CLS[fac]}">${FACTION_NAME[fac]}</span></h3><b class="tn">${T.name}</b><div>${T.brief}</div><div class="ctr"><b>建議對策</b>：${T.counter}</div></div>`;
}
// 簡報的敵方配置與戰場環境（訓練作戰、劇情戰役共用）
function briefIntel(sc, I) {
  const compStr = (c) => c ? c.map((n, t) => n ? `${SHIP_TYPES[t].name} ~${ships5(n)}` : '').filter(Boolean).join('、') : '<span class="unk">不明</span>';
  return `<div class="intel-grid">
          <div class="g-card"><h3>敵方配置</h3>${I.fleets.map((f) => `<div class="ef"><b>${f.name}</b>
            <dl class="kv"><dt>指揮官</dt><dd>${f.cmdr.name}（${TRAIT_NAME[f.cmdr.trait]}型${f.cmdr.level ? ' Lv ' + f.cmdr.level : '・等級不明'}）</dd>
            <dt>兵力</dt><dd>約 ${ships5(f.lo)}～${ships5(f.hi)} 艘</dd>
            <dt>編成</dt><dd>${compStr(f.comp)}</dd>
            <dt>偏好陣型</dt><dd>${FORMATIONS[f.formation].name}<span class="conf">可信度 ${f.conf}%</span></dd>
            <dt>偏好打法</dt><dd>${f.tactic ? `${TACTICS[f.tactic].name}<span class="conf">${TACTICS[f.tactic].desc}</span>` : '<span class="unk">不明</span>'}</dd></dl></div>`).join('')}
            <dl class="kv"><dt>其他</dt><dd>${I.events ? (I.events.length ? I.events.join('<br>') : '未發現其他部隊') : '<span class="unk">不明（無法排除伏兵或增援）</span>'}</dd></dl></div>
          <div class="g-card"><h3>戰場環境</h3>${minimapSVG(sc, I, GAME.loadout)}
            <div style="margin-top:8px;font-size:calc(12.5px * var(--ui))">${envBriefHtml(sc)}</div></div>
        </div>${briefFaction(briefEnemyFac(sc))}`;
}
function showBriefing(sc) {
  GAME.sc = sc; GAME.intel = makeIntel(sc);
  if (!GAME.loadout || GAME.loadout.sc !== sc.id) { GAME.loadout = defaultLoadout(sc); GAME.loadout.sc = sc.id; }
  setPhase('briefing');
  const I = GAME.intel;
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>訓練作戰</h2><span class="crumb">實戰作戰　·　PvE 1v1</span><span class="g-sp"></span><button class="g-btn" id="b-back">← 單人戰鬥</button></div>
    <div class="brief">
      ${trainList()}
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="g-card"><h3>狀況</h3><div>${sc.story}</div>
          <dl class="kv"><dt>勝利條件</dt><dd>殲滅敵軍，或使敵軍損失超過 ${Math.round((1 - ROUT_AT) * 100)}%（潰走）</dd><dt>敗北條件</dt><dd>我軍損失超過 ${Math.round((1 - ROUT_AT) * 100)}%</dd>
          <dt>時間限制</dt><dd>${Math.round(sc.timeLimit / 60)} 分鐘（時間到依雙方損失比例判定）</dd><dt>編成預算</dt><dd>${fmtN(sc.budget)} 點　最多 ${sc.maxFleets} 支艦隊</dd>
          <dt>情報準確度</dt><dd>${Math.round(I.acc * 100)}%${I.acc < 0.7 ? '　<span class="g-warn">情報可能有誤</span>' : ''}</dd></dl></div>
        ${briefIntel(sc, I)}
        <div class="g-row"><span class="g-sp"></span><button class="g-btn pri" id="b-next">進入編成 →</button></div>
      </div>
    </div></div>`);
  bindTrainList();
  gEl('b-back').onclick = showSingle;
  gEl('b-next').onclick = showLoadout;
}

// 航母機庫比例（每個航母圖示的機庫合計 n 架）
function hangarRow(f, k) {
  const n = SHIP_TYPES[0].fighters.n, h = f.hangar || (f.hangar = HANGAR_DEFAULT.slice()), sum = sumA(h);
  return `<div class="ld-hang"><div class="ld-hh">艦載機配置<small>每艘航母 ${n} 架</small>${sum === n ? '' : `<b class="g-warn">合計 ${sum}，會依比例換算成 ${n} 架</b>`}</div><div class="ld-hg">
    ${CRAFT.map((c, r) => `<div class="ld-hc" title="${c.note}"><span>${c.name}</span><span class="ctl"><button class="g-btn sm" data-hk="${k}" data-hr="${r}" data-hd="-1">−</button><input type="number" min="0" max="${n}" value="${h[r]}" data-hk="${k}" data-hr="${r}"><button class="g-btn sm" data-hk="${k}" data-hr="${r}" data-hd="1">＋</button></span></div>`).join('')}</div></div>`;
}
function showLoadout() {
  const sc = GAME.sc, lo = GAME.loadout;
  if (lo.faction == null) lo.faction = GAME.faction || 0;
  fixLoadoutCmdrs(lo);
  setPhase('loadout');
  const fac = lo.faction;
  const SPS = supplyList(lo);
  const used = sumA(lo.fleets.map((f) => compCost(f.comp))) + sumA(SPS.map((s) => compCost(s.comp)));
  const loF = (k) => (k[0] === 's' ? SPS[+k.slice(1)] : lo.fleets[+k]);   // k＝艦隊序號，'s0'、's1'…＝補給艦隊
  const over = used > sc.budget;
  const pool = cmdrPool(sc, fac), locked = (k) => !!sc.saga && k < sc.cast.length;   // 劇情戰役：前幾支是劇情指定的指揮官
  const cmdrOpts = (sel, k) => pool.map((c) => { const taken = lo.fleets.some((f, j) => j !== k && f.cmdr === c.id); return `<option value="${c.id}" ${c.id === sel ? 'selected' : ''} ${taken ? 'disabled' : ''}>${c.name}（${TRAIT_NAME[c.trait]} Lv ${cmdrLevel(c.id)}${cmdrPoints(c.id) > 0 ? `，天賦 ${cmdrPoints(c.id)} 點未分配` : ''}）${taken ? '・已指派' : ''}</option>`; }).join('');
  // 一次只編一支（分頁）；選中的那一支也是背景太空港裡顯示的艦隊
  const keys = [...lo.fleets.map((_, k) => String(k)), ...SPS.map((_, i) => 's' + i)];
  if (!keys.includes(GAME.ldSel)) GAME.ldSel = keys[0] || '0';
  const sel = GAME.ldSel, F = keys.length ? loF(sel) : null, isSup = sel[0] === 's', k = isSup ? -1 : +sel, si = isSup ? +sel.slice(1) : -1;
  const tabName = (key) => (key[0] === 's' ? supplyName(+key.slice(1)) : `第${'一二三四'[+key]}艦隊`);
  const typeRows = (f, kk, types) => types.map((t) => { const st = SHIP_TYPES[t];
    const tip = `${st.note}\n耐久 ${st.hp}・護盾 ${st.sh}・速度 ${st.speed}${GUN_KEYS.filter((g) => st.guns[g]).map((g) => `・${GUN_NAME[g]} ${st.guns[g].far}`).join('')}${st.missile ? `・飛彈 ${st.missile.n} 發（每 ${st.missile.cd} 秒）` : ''}${st.supply ? `・補給存量 ${st.supply.stock} 發` : ''}${st.fighters ? `・艦載機 ${st.fighters.n} 架` : ''}${st.repair ? `・維修機 ${st.repair.n}` : ''}`;
    return `<div class="ld-ty" title="${tip}"><span class="nm">${st.name}<small>${st.cost} 點／${opts.rep} 艘</small></span><b>${ships5(f.comp[t] || 0)}<small> 艘</small></b>
      <span class="ctl"><button class="g-btn sm" data-k="${kk}" data-t="${t}" data-d="-20">−</button><input type="number" min="0" step="10" value="${f.comp[t] || 0}" data-k="${kk}" data-t="${t}"><button class="g-btn sm" data-k="${kk}" data-t="${t}" data-d="20">＋</button></span></div>`; }).join('');
  const fmSel = (attr, cur) => `<select class="g-sel" ${attr}>${Object.keys(FORMATIONS).map((fk) => `<option value="${fk}" ${fk === cur ? 'selected' : ''}>${FORMATIONS[fk].name}</option>`).join('')}</select>`;
  let body = '';
  if (F && !isSup) {
    const c = COMMANDERS.find((o) => o.id === F.cmdr);
    body = `<div class="ld-ca"><div class="ld-fh"><b class="g-emp">${tabName(sel)}</b><span class="g-dim">${ships5(sumA(F.comp))} 艘・${fmtN(compCost(F.comp))} 點</span><span class="g-sp"></span>${lo.fleets.length > 1 && !locked(k) ? `<button class="g-btn sm" data-del="${k}">移除這支艦隊</button>` : ''}</div>
      <div class="ld-r"><label>指揮官</label><select class="g-sel" data-cm="${k}" ${locked(k) ? 'disabled' : ''}>${cmdrOpts(F.cmdr, k)}</select></div>
      <div class="ld-bio">${c ? `${c.bio}　技能：${c.skills.map((s) => `<b title="${SKILLS[s].desc}">${SKILLS[s].name}</b>`).join('、')}` : ''}</div>
      <div class="ld-r"><label>分配偏好</label><select class="g-sel" data-pref="${k}" title="${fleetPref(F).desc}">${Object.entries(AUTO_PREFS).map(([key, P]) => `<option value="${key}" ${P === fleetPref(F) ? 'selected' : ''} title="${P.desc}">${P.name}</option>`).join('')}</select><button class="g-btn sm" id="l-auto" title="補給艦隊不動；剩下的預算平均分給每支艦隊，各艦隊照自己的「分配偏好」決定艦種比例，盡量用完預算">⚖ 自動分配</button></div>
      <div class="ld-types">${typeRows(F, k, [0, 1, 2, 3, 4])}</div></div>
      <div class="ld-cb">${F.comp[0] > 0 ? hangarRow(F, k) : ''}
      <div class="ld-r"><label>起始陣型</label>${fmSel(`data-fm="${k}"`, F.formation)}<select class="g-sel" data-ar="${k}" title="排列"><option value="0" ${!F.orderly ? 'selected' : ''}>自然</option><option value="1" ${F.orderly && (F.layers || 1) === 1 ? 'selected' : ''}>整齊・1 層</option><option value="3" ${F.orderly && F.layers === 3 ? 'selected' : ''}>整齊・3 層</option></select></div></div>`;
  } else if (F) {
    body = `<div class="ld-ca"><div class="ld-fh"><b class="g-emp">${tabName(sel)}</b><span class="g-dim">${ships5(sumA(F.comp))} 艘・${fmtN(compCost(F.comp))} 點</span><span class="g-sp"></span><button class="g-btn sm" data-sdel="${si}">移除</button></div>
      <div class="ld-bio" title="任何友艦（不限跟隨的那支）待在補給艦 ${SUPPLY_RULE.range} 內，飛彈沒滿就每 ${SUPPLY_RULE.cd} 秒補 1 發；補給艦被擊沉，它帶的存量就沒了。">補給艦隊不佔艦隊數、沒有指揮官。友艦在補給艦 ${SUPPLY_RULE.range} 內會自動補充飛彈；補給艦被擊沉，存量就沒了。</div>
      <div class="ld-types">${typeRows(F, sel, [4, SUPPLY_T])}</div></div><div class="ld-cb">
      <div class="ld-r"><label>跟隨</label><select class="g-sel" data-sfol="${si}" title="跟在後方 ${SUPPLY_RULE.follow}；戰鬥中直接下移動命令會取消跟隨"><option value="-1" ${F.follow < 0 ? 'selected' : ''}>不跟隨（自己指揮）</option>${lo.fleets.map((f, j) => `<option value="${j}" ${F.follow === j ? 'selected' : ''}>第${'一二三四'[j]}艦隊</option>`).join('')}</select></div>
      <div class="ld-r"><label>起始陣型</label>${fmSel(`data-sfm="${si}"`, F.formation || 'ring')}</div></div>`;
  }
  const facTip = sc.mp ? `只能派該陣營的初始指揮官（${cmdrsOf(fac).length} 位），等級與天賦是多人專用的；換陣營會通知房間` : `只能派該陣營的指揮官（${cmdrsOf(fac).length} 位）；敵軍是另一個陣營。指揮官不夠可以到「星際酒館」招募`;
  overlay(`<div class="ld-screen">
    <div class="ld-top">
      <button class="g-btn" id="l-back">${sc.mp ? '← 房間' : sc.tut ? '← 訓練作戰' : '← 簡報'}</button>
      <div class="ld-title"><h2>編成</h2><span class="crumb">${sc.name}</span></div>
      <div class="ld-opt">${sc.saga ? `<span class="g-dim">陣營</span><b class="g-${FACTION_CLS[fac]}" title="劇情固定；劇情指定的指揮官不能更換">${FACTION_NAME[fac]}</b>` : `<div class="wed-seg" id="l-fac" title="${facTip}"><button data-f="0" class="${fac === 0 ? 'on emp' : ''}">帝國軍</button><button data-f="1" class="${fac === 1 ? 'on all' : ''}">聯盟軍</button></div>`}
        ${sc.tut || sc.mp ? `<span class="g-dim" title="${OP_LEVELS[sc.op].desc}">${sc.tut ? '教學固定' : '房主決定'}：<b>${OP_LEVELS[sc.op].name}</b></span>` : `<span title="${OP_LEVELS[opLevel()].desc}">${opSeg('l-op')}</span>`}</div>
      <span class="g-sp"></span>
      <div class="ld-bud ${over ? 'over' : ''}"><div>已用 <b class="${over ? 'g-warn' : 'g-emp'}">${fmtN(used)}</b> / ${fmtN(sc.budget)} 點<span class="g-dim">　總兵力 ${ships5(sumA(lo.fleets.map((f) => sumA(f.comp))) + sumA(SPS.map((s) => sumA(s.comp))))} 艘</span></div>
        <div class="budget ${over ? 'over' : ''}"><i style="width:${Math.min(100, used / sc.budget * 100)}%"></i></div></div>
      <button class="g-btn pri" id="l-next" ${over || !used || !lo.fleets.length ? 'disabled' : ''} title="${over ? '超出預算，請減少艦艇' : ''}">下一步：部署 →</button>
    </div>
    <div class="ld-side g-card">
      <div class="ld-tabs">${keys.map((key) => `<button class="g-btn sm ${key === sel ? 'on' : ''}" data-tab="${key}">${tabName(key)}</button>`).join('')}
        ${lo.fleets.length < sc.maxFleets && lo.fleets.length < pool.length ? '<button class="g-btn sm add" id="l-add" title="最多 ' + sc.maxFleets + ' 支艦隊">＋ 艦隊</button>' : ''}${SPS.length < Math.max(1, lo.fleets.length) ? `<button class="g-btn sm add" id="l-sup" title="補給艦＋護衛艦，不佔艦隊數、沒有指揮官；最多跟艦隊數一樣多支（目前 ${SPS.length}／${Math.max(1, lo.fleets.length)}）">＋ 補給</button>` : ''}</div>
      ${lo.fleets.length ? '' : '<div class="g-warn">這個陣營沒有可派的指揮官，先到星際酒館招募。</div>'}
      ${over ? `<div class="g-warn ld-over">超出預算 ${fmtN(used - sc.budget)} 點，請減少艦艇。</div>` : ''}
      <div class="ld-body">${body}</div>
    </div>
    <div class="ld-cap" id="ld-cap"></div>
  </div>`);
  dockAttach();   // 背景：3D 太空港（dock.js）
  const redraw = () => showLoadout();
  if (!sc.mp && !sc.tut) bindOpSeg('l-op', redraw);
  gEl('l-back').onclick = () => (sc.mp ? showRoom() : sc.tut ? (tutClose(), showTraining(sc.tut)) : sc.saga ? storyBriefing(sc.stageId) : sc.campaign ? showCampBriefing() : sc.random ? showRandom() : showBriefing(sc));
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { GAME.ldSel = b.dataset.tab; redraw(); }));
  if (gEl('l-add')) gEl('l-add').onclick = () => {
    const free = pool.find((c) => !lo.fleets.some((f) => f.cmdr === c.id));
    if (!free) return;
    const left = Math.max(0, sc.budget - used);
    lo.fleets.push({ cmdr: free.id, comp: defaultComp(Math.max(600, left)), formation: 'line', x: 0, z: 300 + ZONE_SHIFT, h: Math.PI });
    lo.fleets.forEach((f, j) => { f.x = lo.fleets.length === 1 ? 0 : -300 + 600 * j / (lo.fleets.length - 1); });
    GAME.ldSel = String(lo.fleets.length - 1);
    redraw();
  };
  if (gEl('l-auto')) gEl('l-auto').onclick = () => { autoAllocate(lo, sc.budget); redraw(); };
  document.querySelectorAll('[data-pref]').forEach((el) => (el.onchange = () => { lo.fleets[+el.dataset.pref].autoPref = el.value; redraw(); }));
  if (gEl('l-fac')) gEl('l-fac').onclick = (e) => {
    const f = e.target.dataset.f; if (f == null || +f === fac || sc.saga) return;
    lo.faction = +f; if (sc.mp) mpFaction(+f); else GAME.faction = +f;
    if (!lo.fleets.length) { const d = defaultLoadout(sc, +f); lo.fleets = d.fleets; } else for (const fl of lo.fleets) fl.cmdr = null;   // 換陣營：重新分配指揮官
    redraw();
  };
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const j = +b.dataset.del; lo.fleets.splice(j, 1);
    for (const S of SPS) S.follow = S.follow === j ? (lo.fleets.length ? 0 : -1) : S.follow > j ? S.follow - 1 : S.follow;   // 跟隨的艦隊被移除
    GAME.ldSel = String(Math.max(0, j - 1));
    redraw();
  }));
  if (gEl('l-sup')) gEl('l-sup').onclick = () => { SPS.push(defaultSupply(lo, SPS.length)); GAME.ldSel = 's' + (SPS.length - 1); redraw(); };
  document.querySelectorAll('[data-sdel]').forEach((b) => (b.onclick = () => { SPS.splice(+b.dataset.sdel, 1); GAME.ldSel = '0'; redraw(); }));
  document.querySelectorAll('[data-sfol]').forEach((el) => (el.onchange = () => { SPS[+el.dataset.sfol].follow = +el.value; }));
  document.querySelectorAll('[data-sfm]').forEach((el) => (el.onchange = () => { SPS[+el.dataset.sfm].formation = el.value; }));
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { const f = loF(b.dataset.k); f.comp[+b.dataset.t] = Math.max(0, f.comp[+b.dataset.t] + +b.dataset.d); redraw(); }));
  document.querySelectorAll('input[data-t]').forEach((el) => (el.onchange = () => { const f = loF(el.dataset.k); f.comp[+el.dataset.t] = Math.max(0, Math.round(+el.value || 0)); redraw(); }));
  document.querySelectorAll('[data-hd]').forEach((b) => (b.onclick = () => {
    const f = lo.fleets[+b.dataset.hk], h = f.hangar, r = +b.dataset.hr, d = +b.dataset.hd, n = SHIP_TYPES[0].fighters.n;
    if (d > 0 && sumA(h) >= n) { let o = -1; h.forEach((v, j) => { if (j !== r && v > 0 && (o < 0 || v > h[o])) o = j; }); if (o < 0) return; h[o]--; }   // 滿了：從最多的那種挪一架過來
    h[r] = Math.max(0, Math.min(n, h[r] + d)); redraw();
  }));
  document.querySelectorAll('.ld-hang input[type=number]').forEach((el) => (el.onchange = () => { const f = lo.fleets[+el.dataset.hk]; f.hangar[+el.dataset.hr] = Math.max(0, Math.round(+el.value || 0)); redraw(); }));
  document.querySelectorAll('[data-cm]').forEach((el) => (el.onchange = () => { lo.fleets[+el.dataset.cm].cmdr = el.value; redraw(); }));
  document.querySelectorAll('[data-fm]').forEach((el) => (el.onchange = () => { lo.fleets[+el.dataset.fm].formation = el.value; }));
  document.querySelectorAll('[data-ar]').forEach((el) => (el.onchange = () => { const f = lo.fleets[+el.dataset.ar], v = +el.value; f.orderly = v > 0; f.layers = v || 1; }));
  gEl('l-next').onclick = startDeploy;
}

// ───── 部署 ─────
function deployWheel(deltaY) {
  const d = GAME.drag, f = dpLo(); if (!d || !f) return;
  if (GAME.op === 0) { hint('一般難度：艦隊都在同一平面，不能調高度'); return; }
  d.dy = (d.dy || 0) + (deltaY < 0 ? 20 : -20);
  const y = Math.max(-ALT_MAX + 50, Math.min(ALT_MAX - 50, (f.y || 0) + d.dy)); d.dy = y - (f.y || 0);
  hint(`起始高度 ${y > 0 ? '+' : ''}${Math.round(y)}（滾輪調整）· 放開放置`);
}
function rebuildDeploy() {
  const sel = GAME.deploySel;
  applyOp();
  newBattle(GAME.sc.seed, GAME.sc.mp ? mpPreviewSetup() : makeSetup(GAME.sc, GAME.loadout, GAME.attempt));
  paused = true; updateTimeUI();
  drawField(true);
  const f = fleets.filter((o) => o.side === GAME.playerSide)[sel];
  if (f) setSelection(f.sqs);
  renderDeployBar();
}
function startDeploy() {
  GAME.playerSide = GAME.sc && GAME.sc.mp ? NET.seat : 0;
  if (GAME.sc && GAME.sc.mp) NET.screen = 'deploy';
  GAME.loadout.supplies = supplyList(GAME.loadout).filter((S) => sumA(S.comp) > 0);   // 沒有船的補給艦隊不出擊（部署序號才會跟戰場上的艦隊對得上）
  if (GAME.sc && (GAME.sc.campaign || GAME.sc.random)) campEnemy(GAME.sc, GAME.loadout);   // 戰役：依出擊指揮官的平均等級生成敵軍
  applyOp(); overlay(null); setPhase('deploy'); GAME.deploySel = 0; force3D();
  setCmdSide(GAME.playerSide, false);
  rebuildDeploy();
  cutPrepare(cutSpecStart(GAME.sc));   // 部署時先把開戰切入編成 APNG
  camAnim = null; view.target.x = 0; view.target.z = GAME.playerSide ? -300 : 300; view.height = 1250; view.yaw = mode3D && GAME.playerSide ? Math.PI : 0; view.pitch = ELEV; updateCamera();   // 多人的第二方：3D 轉 180°，自己在下方
}
// 部署中選的那一支（序號＝lo.fleets，最後一個是補給艦隊）
function dpLo() { const lo = GAME.loadout; return GAME.deploySel < lo.fleets.length ? lo.fleets[GAME.deploySel] : supplyList(lo)[GAME.deploySel - lo.fleets.length]; }
function renderDeployBar() {
  const lo = GAME.loadout;
  gEl('deploybar').innerHTML = `<span class="g-dim">部署：</span>${lo.fleets.map((f, k) => `<button class="g-btn dp-f ${k === GAME.deploySel ? 'on' : ''}" data-k="${k}">第${'一二三四'[k]}艦隊</button>`).join('')}${supplyList(lo).map((S, i) => `<button class="g-btn dp-f ${GAME.deploySel === lo.fleets.length + i ? 'on' : ''}" data-k="${lo.fleets.length + i}">${supplyName(i)}</button>`).join('')}
    <button class="g-btn sm" id="dp-l" title="左轉 45°">↺</button><button class="g-btn sm" id="dp-r" title="右轉 45°">↻</button>
    <span class="g-dim" style="font-size:calc(12px * var(--ui))">左鍵點艦隊＝選擇；右鍵在橘色框內點擊＝放置，按住拖曳＝朝向</span>
    <button class="g-btn sm" id="dp-3d">${mode3D ? '2D 畫面' : '3D 畫面'}</button><button class="g-btn" id="dp-back">← 編成</button><button class="g-btn pri" id="dp-go">${GAME.sc.mp ? '部署完成・準備' : '開戰'}</button>`;
  gEl('dp-3d').onclick = () => { setRenderMode(mode3D ? '2d' : '3d'); renderDeployBar(); };
  document.querySelectorAll('#deploybar .dp-f').forEach((b) => (b.onclick = () => { GAME.deploySel = +b.dataset.k; rebuildDeploy(); }));
  gEl('dp-l').onclick = () => { dpLo().h -= Math.PI / 4; rebuildDeploy(); };
  gEl('dp-r').onclick = () => { dpLo().h += Math.PI / 4; rebuildDeploy(); };
  gEl('dp-back').onclick = () => { fieldGroup.clear(); showLoadout(); };
  gEl('dp-go').onclick = GAME.sc.mp ? mpReady : startBattle;
}
function clampZone(p) { const Z = GAME.sc && GAME.sc.mp ? MP_ZONES[GAME.playerSide] : DEPLOY_ZONE; p.x = Math.max(Z.x0, Math.min(Z.x1, p.x)); p.z = Math.max(Z.z0, Math.min(Z.z1, p.z)); return p; }
// 編成裡的位置一律用第一方（下方）的座標；多人的第二方在戰場上是整個轉 180°
function dpCanon(p) { return GAME.sc && GAME.sc.mp && GAME.playerSide ? { x: -p.x, z: -p.z } : p; }
// 遊戲層攔截滑鼠／觸控：部署時放置艦隊、技能選目標
function gamePointer(type, e) {
  if (GAME.phase === 'simedit') return simPointer(type, e);   // 模擬室編輯：選取、移動、放置
  // 技能選目標：左鍵（或觸控）點敵方分艦隊；右鍵取消
  if (GAME.skillArm && type === 'down' && e.pointerType !== 'touch' && e.button === 2) { skillEsc(); return true; }
  if (GAME.skillArm && GAME.skillArm.point && type === 'down' && (e.pointerType === 'touch' || e.button === 0)) {
    const A = GAME.skillArm, p = groundAt(e.clientX, e.clientY, A.area || A.recon || A.move ? selAlt() : 0);
    if (p) { if (A.move) cmdMoveTo(p); else if (A.area) cmdArea({ x: p.x, y: selAlt(), z: p.z }); else if (A.recon) cmdRecon(A.f, { x: p.x, y: selAlt(), z: p.z }); else skillCmd(GAME.skillArm.f, GAME.skillArm.id, null, p); GAME.skillArm = null; hideHint(); } else toast('請點選地圖上的位置（Esc 取消）');
    return true;
  }
  if (GAME.skillArm && type === 'down' && (e.pointerType === 'touch' || e.button === 0)) {
    const q = squadronAt(e.clientX, e.clientY);
    if (q && q.side !== cmdSide && !q.bg) {
      if (GAME.skillArm.attack) cmdAttack(q); else skillCmd(GAME.skillArm.f, GAME.skillArm.id, q);
      GAME.skillArm = null; hideHint();
    }
    else toast('請點選敵方分艦隊（Esc 取消）');
    return true;
  }
  if (GAME.phase !== 'deploy') return false;
  if (e.pointerType === 'touch') {
    // 觸控：輕點放置；拖曳照常平移鏡頭
    if (type === 'down') GAME.drag = { x0: e.clientX, y0: e.clientY, t0: e.timeStamp, touch: true };
    else if (type === 'up' && GAME.drag && GAME.drag.touch && Math.hypot(e.clientX - GAME.drag.x0, e.clientY - GAME.drag.y0) < 12 && e.timeStamp - GAME.drag.t0 < 400) {
      const p = groundAt(e.clientX, e.clientY); GAME.drag = null;
      if (p) { const f = dpLo(); clampZone(p); const c = dpCanon(p); f.x = c.x; f.z = c.z; rebuildDeploy(); }
    }
    return false;
  }
  if (e.button === 1 && type === 'down') return false;
  // 部署：左鍵點自己的艦隊＝選它；右鍵點擊＝放置，右鍵拖曳＝指定朝向
  if (type === 'down' && e.button === 0) {
    const q = squadronAt(e.clientX, e.clientY);
    if (q && q.side === GAME.playerSide && q.fleet) { const k = fleets.filter((o) => o.side === GAME.playerSide).indexOf(q.fleet); if (k >= 0) { GAME.deploySel = k; setSelection(q.fleet.sqs); renderDeployBar(); } }
    return true;
  }
  if (type === 'down' && e.button === 2) {
    const A = groundAt(e.clientX, e.clientY); if (!A) return true;
    clampZone(A); GAME.drag = { A, x0: e.clientX, y0: e.clientY };
    return true;
  }
  if (!GAME.drag || GAME.drag.touch) return type !== 'move' ? false : false;
  const B = groundAt(e.clientX, e.clientY), d = GAME.drag;
  if (type === 'move') {
    if (B && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 12) { preview.visible = true; pvBox.visible = pvArrow.visible = pvPath.visible = false; pvLine.visible = true; setPts(pvLine, [[d.A.x, d.A.z], [B.x, B.z]]); }
    return true;
  }
  if (type === 'up') {
    hidePreview(); pvBox.visible = pvArrow.visible = pvPath.visible = true; hideHint();
    const f = dpLo();
    const A = dpCanon(d.A);
    f.x = A.x; f.z = A.z; if (d.dy) f.y = Math.max(-ALT_MAX + 50, Math.min(ALT_MAX - 50, (f.y || 0) + d.dy));
    if (B && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 20) { const Bc = dpCanon(B); f.h = Math.atan2(Bc.x - A.x, Bc.z - A.z); }
    GAME.drag = null; rebuildDeploy();
    return true;
  }
  return false;
}

// ───── 戰鬥 ─────
function startBattle() {
  GAME.attempt++; GAME.recView = false; GAME.watch = false; GAME.pilot = null; GAME.captain = null;
  const setup = makeSetup(GAME.sc, GAME.loadout, GAME.attempt);
  applyOp(); setup.op = GAME.op;
  newBattle(GAME.sc.seed + GAME.attempt, setup);
  setRule('fire', true); setRule('advance', false);
  GAME.init = [sideAlive(0), sideAlive(1)];
  GAME.result = null; GAME.reportShown = false; GAME.replaying = false; GAME.replayEnd = null; GAME.skillArm = null; GAME.xp = null; GAME.log = []; GAME.simCtl = null; GAME.lineK = 0; GAME.dlineK = 0;
  gEl('battlehud').innerHTML = '';
  drawField(false);
  setPhase('battle'); setCmdSide(GAME.playerSide, false); clearSelection();
  paused = false; setSpeed(SETTINGS.speedIdx);
  force3D(); if (GAME.op === 2) enterBridge();   // 擬真：開戰直接上艦橋
  if (opts.fow && SETTINGS.autoScan === false) issue('autoscan', { on: false });   // 戰爭迷霧：玩家關掉了自動掃描（記在命令裡）
  cutPlay(cutSpecStart(GAME.sc));
  toast(`${GAME.sc.name}　開戰！${GAME.op ? `（${OP_LEVELS[GAME.op].name}難度）` : ''}（${keyText('pause')} 暫停、${keyText('speed_up')}／${keyText('speed_down')} 調速度、${keyText('attack')}＋左鍵點敵軍＝指定攻擊）`);
}
const _fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let _hudAcc = 0;
// 右上角戰鬥列的簡易圖示（16×16，線條跟著文字顏色）
const BH_IC = (() => {
  const s = (d) => `<svg class="bh-ic" viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
  const ship = '<path d="M8 4.5 L10.5 11 L8 9.8 L5.5 11 Z" fill="currentColor" stroke="none"/>';   // 朝上的船
  return {
    pause: s('<rect x="4" y="3" width="2.6" height="10" fill="currentColor" stroke="none"/><rect x="9.4" y="3" width="2.6" height="10" fill="currentColor" stroke="none"/>'),
    play: s('<path d="M5 3 L13 8 L5 13 Z" fill="currentColor" stroke="none"/>'),
    tac: s('<rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M2 6.5h12M6 2.5v11"/><circle cx="10" cy="10" r="1.3" fill="currentColor"/>'),
    bridge: s('<circle cx="8" cy="8" r="4.2"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><path d="M8 1.5v2.3M8 12.2v2.3M1.5 8h2.3M12.2 8h2.3M3.4 3.4l1.6 1.6M11 11l1.6 1.6M3.4 12.6 5 11M11 5l1.6-1.6"/>'),
    report: s('<path d="M2 14h12"/><rect x="3" y="8" width="2.4" height="5" fill="currentColor" stroke="none"/><rect x="6.8" y="4" width="2.4" height="9" fill="currentColor" stroke="none"/><rect x="10.6" y="6" width="2.4" height="7" fill="currentColor" stroke="none"/>'),
    aim: s('<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/>'),
    front: s(ship + '<path d="M8 1.2v2.6" stroke="#ff7a6a" stroke-width="2"/>'),
    side: s(ship + '<path d="M1.5 8h2.6M11.9 8h2.6" stroke="#ff7a6a" stroke-width="2"/>'),
    rear: s(ship + '<path d="M8 12.2v2.6" stroke="#ff7a6a" stroke-width="2"/>'),
    fighter: s('<path d="M8 2 L9 7 L14 9.5 L9 9.5 L8.6 12.5 L10.2 14 H5.8 L7.4 12.5 L7 9.5 L2 9.5 L7 7 Z" fill="currentColor" stroke="none"/>'),
    missile: s('<path d="M3 13 L11 5" stroke-width="2.2"/><path d="M11 5 L13.5 2.5 M10 3.5 L12.5 3.5 L12.5 6" /><path d="M3 13 L2 14" stroke="#ffb35a"/>'),
  };
})();
// 戰況簡報：右上角戰鬥列下方的小面板（數字來自 main.js 每幀更新的 #hud）
function bhRepOpen() { return SETTINGS.ui.report === true && uiOn('stats'); }
function bhRepToggle() { SETTINGS.ui.report = !bhRepOpen(); saveSettings(); bhRepFrame(); }
function bhRepFrame() {
  let el = gEl('bh-rep');
  if (!el) { el = document.createElement('div'); el.id = 'bh-rep'; document.body.appendChild(el); }
  const bh = gEl('battlehud'), on = bhRepOpen() && !bh.hidden && GAME.phase !== 'deploy';
  el.hidden = !on; if (gEl('bh-rep-b')) gEl('bh-rep-b').classList.toggle('on', on);
  const top = bh.hidden ? 10 : bh.getBoundingClientRect().bottom + 6;
  el.style.top = top + 'px';
  document.body.style.setProperty('--toast-top', (on ? top + el.offsetHeight + 6 : top) + 'px');   // 通知排在戰鬥列（和簡報）下方
  if (!on) return;
  const tx = (id) => (gEl(id) ? gEl(id).textContent : '–'), dm = [0, 1].map((s) => tx('h-dmg' + s).split('／').map((v) => v.trim()));
  const nm = (s) => (s === GAME.playerSide ? '我軍' : '敵軍');
  const row = (ic, tip, a, b) => `<tr title="${tip}"><th>${ic}</th><td class="s0">${a}</td><td class="s1">${b}</td></tr>`;
  const html = `<table><tr><th></th><td class="s0 h">${nm(0)}</td><td class="s1 h">${nm(1)}</td></tr>
    ${row(BH_IC.aim, '光束命中率', tx('h-bp0'), tx('h-bp1'))}
    ${row(BH_IC.front, '被擊沉：正面', dm[0][0], dm[1][0])}${row(BH_IC.side, '被擊沉：側面', dm[0][1], dm[1][1])}${row(BH_IC.rear, '被擊沉：背後', dm[0][2], dm[1][2])}
    ${row(BH_IC.fighter, '艦載機（在場）', tx('h-ftr0'), tx('h-ftr1'))}
    <tr title="飛行中的飛彈（全場）"><th>${BH_IC.missile}</th><td colspan="2" class="c">${tx('h-mis')}</td></tr></table>`;
  if (el.innerHTML !== html) el.innerHTML = html;
}
// 戰鬥 HUD 與技能列：結構只建一次，之後只更新文字（避免重畫吃掉點擊）
// 右上角：雙方兵力＋時間，指令都是圖示按鈕（滑鼠移上去看說明）
function buildBattleHud() {
  gEl('battlehud').innerHTML = `<div class="side"><div class="lbl" id="bh-t0"></div><div class="bar s0"><i id="bh-b0"></i></div></div>
    <div class="timer"><span id="bh-tm"></span><div class="lbl" id="bh-tl"></div></div>
    <div class="side"><div class="lbl" style="text-align:right" id="bh-t1"></div><div class="bar s1"><i id="bh-b1"></i></div></div>
    <span class="bh-sep"></span>
    <button class="g-btn sm ic" id="bh-pause"></button><button class="g-btn sm" id="bh-speed"></button><button class="g-btn sm ic" id="bh-tac">${BH_IC.tac}</button><button class="g-btn sm" id="bh-3d" title="切換 2D／3D 畫面（${keyText('render')}）"></button><button class="g-btn sm ic" id="bh-br">${BH_IC.bridge}</button>${uiOn('stats') ? `<button class="g-btn sm ic" id="bh-rep-b" title="戰況簡報：命中率、被擊沉方向、艦載機與飛彈">${BH_IC.report}</button>` : ''}<button class="g-btn sm ic" id="bh-help" title="操作說明（${keyText('help')}）">?</button><button class="g-btn sm ic" id="bh-set" title="設定（${keyText('settings')}）">⚙</button>${GAME.sc && GAME.sc.sim && !GAME.replaying && !GAME.watch ? '<button class="g-btn sm" id="bh-ctl" title="模擬室：接管另一方（該方 AI 暫停）"></button><button class="g-btn sm" id="bh-edit" title="模擬室：暫停並調整配置與設定">✎ 編輯</button>' : ''}<button class="g-btn sm" id="bh-quit"></button>`;
  if (gEl('bh-rep-b')) gEl('bh-rep-b').onclick = bhRepToggle;
  gEl('bh-set').onclick = () => openSettings();
  gEl('bh-help').onclick = toggleHelp;
  if (gEl('bh-ctl')) gEl('bh-ctl').onclick = simSwitch;
  if (gEl('bh-edit')) gEl('bh-edit').onclick = simEditMid;
  gEl('bh-tac').onclick = toggleTac;
  gEl('bh-br').onclick = toggleBridge;
  gEl('bh-3d').onclick = () => setRenderMode(mode3D ? '2d' : '3d');
  gEl('bh-pause').onclick = togglePause;
  gEl('bh-speed').onclick = () => setSpeed((speedIdx + 1) % SPEEDS.length);
  gEl('bh-quit').onclick = (e) => {
    if (GAME.replaying) { endReplay(); return; }
    if (NET.on) { mpQuitBattle(e.currentTarget); return; }   // 多人：投降（要按兩次）／離開觀戰
    quitBattle();
  };
  watchHud();   // 觀摩：雙方 AI 的解說面板
  buildCmdHud();   // 小地圖、選取面板、指令卡（hud.js）
  const mine = GAME.watch || NET.spec || GAME.pilot || GAME.captain ? [] : fleets.filter((f) => f.side === GAME.playerSide && f.commander && !f.ally);   // 觀摩：不能放技能；友軍傭兵的技能由 AI 自己用
  gEl('skillbar').innerHTML = mine.map((f) => `<div class="sk-fleet"><div class="nm"><b>${f.name}</b>　${f.commander.name} Lv ${f.commander.level}</div>${Object.keys(f.skills).map((id) =>
    `<button class="g-btn sk-btn" data-f="${f.id}" data-s="${id}" title="${SKILLS[id].desc}">${SKILLS[id].name}<small></small><i class="cdv"></i></button>`).join('')}</div>`).join('');
  document.querySelectorAll('#skillbar .sk-btn').forEach((b) => (b.onclick = () => armSkill(fleets[+b.dataset.f], b.dataset.s)));
}
function gameFrame(dt) {
  if (GAME.phase !== 'battle' && GAME.phase !== 'replay') return;
  tacFrame(dt);
  cmdHudFrame(dt);
  _hudAcc += dt;
  if (GAME.result && !GAME.reportShown) {
    paused = true; updateTimeUI();
    GAME.reportShown = true;
    // 結算切入（回放、觀戰不播）；玩家在第 1 邊（多人）時換成自己這一方的角度
    const R = GAME.result, kind = GAME.playerSide === 1 ? { win: 'lose', lose: 'win' }[R.kind] || R.kind : R.kind;
    const ms = GAME.replaying || (NET.on && NET.spec) || (GAME.sc && GAME.sc.sim) ? 0 : cutPlay(cutSpecResult(kind, R.why));
    setTimeout(() => (GAME.replaying ? endReplay() : showReport()), Math.max(1100, ms - 300));
  }
  if (_hudAcc < 0.15) return;
  _hudAcc = 0;
  const t = U.uTime.value, tl = battleSetup.timeLimit;
  const a0 = sideAlive(0), a1 = sideAlive(1), p = a0 / Math.max(1, GAME.init[0]), e = a1 / Math.max(1, GAME.init[1]);
  if (!gEl('bh-tm')) buildBattleHud();
  const sim = GAME.sc && GAME.sc.sim, nm = (s) => (NET.on ? mpSideName(s) : sim ? simSideName(SIM.m, s) + (s === GAME.playerSide && !GAME.watch ? (GAME.pilot || GAME.captain ? '（我軍）' : '（指揮中）') : '') : s === GAME.playerSide ? '我軍' : '敵軍');
  if (GAME.watch) watchFrame();
  // 兵力只顯示百分比，艘數放在滑鼠提示裡
  const setT = (s, txt, tip) => { const el = gEl('bh-t' + s); el.textContent = txt; el.parentElement.title = tip; };
  setT(0, `${nm(0)} ${Math.round(p * 100)}%`, `${nm(0)}：剩 ${ships5(a0)} 艘`); gEl('bh-b0').style.width = p * 100 + '%';
  const fogE = playerFogged() ? 1 - GAME.playerSide : -1;   // 雷達受干擾：敵方兵力不明（長條停在原處）
  if (fogE === 0) setT(0, `${nm(0)} ？？？`, '雷達受干擾：兵力不明');
  if (fogE === 1) setT(1, `${nm(1)} ？？？`, '雷達受干擾：兵力不明'); else { setT(1, `${nm(1)} ${Math.round(e * 100)}%`, `${nm(1)}：剩 ${ships5(a1)} 艘`); gEl('bh-b1').style.width = e * 100 + '%'; }
  if (fowView()) {   // 戰爭迷霧：對方兵力只能估計（看得到的照實、最後已知照當時、沒看過的照開戰時）
    const os = 1 - GAME.playerSide, est = fowEstAlive(os), r = est / Math.max(1, GAME.init[os]);
    setT(os, `${nm(os)} ≈${Math.round(r * 100)}%`, `${nm(os)}：估計約 ${ships5(est)} 艘${jammed(GAME.playerSide) ? '（通訊受干擾）' : ''}`); gEl('bh-b' + os).style.width = r * 100 + '%';
  }
  const unt = battleSetup.untimed;   // 沒有時限的主線關卡：顯示經過時間與目標時間
  gEl('bh-tm').textContent = unt ? _fmtT(t) : tl >= SIM_INF ? _fmtT(t + SIM.t0) : _fmtT(Math.max(0, tl - t));
  gEl('bh-tm').classList.toggle('over', !!unt && t > tl);
  gEl('bh-tl').textContent = GAME.replaying ? '回放中' : paused && !NET.on ? '已暫停' : unt ? `目標 ${_fmtT(tl)}` : tl >= SIM_INF ? '經過時間' : '剩餘時間';
  gEl('bh-tl').classList.toggle('paused', paused && !NET.on);
  const pb = gEl('bh-pause'), pIc = NET.on ? 'pause' : paused ? 'play' : 'pause';
  if (pb.dataset.ic !== pIc) { pb.dataset.ic = pIc; pb.innerHTML = BH_IC[pIc]; }
  pb.disabled = NET.on; pb.classList.toggle('on', paused && !NET.on);
  pb.title = NET.on ? '多人對戰不能暫停' : `${paused ? '繼續' : '暫停'}（${keyText('pause')}）`;
  gEl('bh-speed').textContent = NET.on ? `×${NET.speed}${NET.lag ? ' …' : ''}` : cmdSlowOn ? `×${effSpeed()}` : '×' + SPEEDS[speedIdx]; gEl('bh-speed').classList.toggle('slow', cmdSlowOn);
  gEl('bh-speed').title = NET.on ? (NET.lag ? '等待連線…' : '遊戲速度（房主決定）') : cmdSlowOn ? '下令中：自動放慢' : `遊戲速度（${keyText('speed_up')}／${keyText('speed_down')}）`;
  if (!gEl('bh-quit').dataset.sure) gEl('bh-quit').textContent = GAME.replaying ? '結束回放' : NET.on ? (NET.spec ? '離開觀戰' : '投降') : GAME.watch ? '結束觀摩' : GAME.pilot ? '結束出擊' : GAME.captain ? '結束任務' : sim ? '結束模擬' : GAME.sc && GAME.sc.tut ? '結束教學' : '撤退';
  if (gEl('bh-ctl')) gEl('bh-ctl').textContent = `切換 → ${simSideName(SIM.m, 1 - GAME.playerSide)}`;
  gEl('bh-3d').textContent = mode3D ? '2D' : '3D';
  gEl('bh-br').title = `${BR.on ? '離開艦橋' : '艦橋視角'}（${keyText('bridge')}）`; gEl('bh-br').classList.toggle('on', BR.on);
  gEl('bh-tac').title = `${BR.on ? (bridgeConsoleK() > 0.5 ? '抬頭' : '戰術台') : '戰術面板'}（${keyText('tactical')}）`;
  bhRepFrame();
  if (GAME.phase !== 'battle') return;
  document.querySelectorAll('#skillbar .sk-btn').forEach((b) => {
    const f = fleets[+b.dataset.f], id = b.dataset.s, s = f.skills[id], def = SKILLS[id];
    const act = t < s.until, cd = Math.max(0, s.ready - t), arm = !!GAME.skillArm && GAME.skillArm.f === f && GAME.skillArm.id === id;
    b.querySelector('small').textContent = act ? `生效 ${Math.ceil(s.until - t)} 秒` : s.left <= 0 ? '已用完' : cd > 0 ? `冷卻 ${Math.ceil(cd)} 秒` : `剩 ${s.left} 次`;
    b.classList.toggle('active', act); b.classList.toggle('arm', arm);
    b.disabled = s.left <= 0 || cd > 0 || f.reserve || f.sqs.every((q) => q.alive <= 0);   // 還沒進場的艦隊（傭兵支援）不能放技能
    b.querySelector('.cdv').style.width = cd > 0 ? (1 - cd / def.cd) * 100 + '%' : '0';
  });
}

// ───── 戰後報告 ─────
function battleStats() {
  const init = [0, 1].map(() => new Array(NT).fill(0)), left = [0, 1].map(() => new Array(NT).fill(0));
  for (const f of fleets) {
    if (f.reserve) continue;   // 沒出場的增援不算
    for (const q of f.sqs) for (const i of q.list) { init[f.side][ships.type[i]]++; if (ships.alive[i]) left[f.side][ships.type[i]]++; }
  }
  return { init, left };
}
// 經驗：勝 60／平 35／敗 20，加上擊沉量（每 100 個敵方圖示 +5，最多 +60），艦隊存活過半再 +10
// 撤退：開戰不到 RETREAT_MIN_T 秒＝不給獎勵；之後撤退＝獎勵減半
function rewardMul(R) { return !R.retreat ? 1 : R.t < RETREAT_MIN_T ? 0 : 0.5; }
// 速戰獎勵（沒有時限的主線關卡）：在目標時間的某個比例內獲勝，經驗與功勳加成
const SPEED_TIERS = [{ at: 0.5, add: 0.5, name: '閃電戰' }, { at: 0.75, add: 0.3, name: '速戰速決' }, { at: 1, add: 0.15, name: '目標時間內完成' }];
function speedBonus(R) {
  if (!battleSetup || !battleSetup.untimed || R.kind !== 'win' || R.retreat) return null;
  const k = R.t / battleSetup.timeLimit, b = SPEED_TIERS.find((x) => k <= x.at);
  return b ? { ...b, par: battleSetup.timeLimit } : null;
}
function awardXP(R, st) {
  const enemyLost = sumA(st.init[1]) - sumA(st.left[1]);
  const base = R.kind === 'win' ? 60 : R.kind === 'draw' ? 35 : 20, sb = speedBonus(R), mul = rewardMul(R) * (sb ? 1 + sb.add : 1);
  const out = fleets.filter((f) => f.side === GAME.playerSide && f.commander).map((f) => {
    const alive = sumA(f.sqs.map((q) => q.alive)), surv = alive / f.initial;
    const xp = Math.round((base + Math.min(60, Math.round(enemyLost / 100 * 5)) + (surv > 0.5 ? 10 : 0)) * mul);
    const id = f.commander.id, before = cmdrLevel(id);
    CMDR_SAVE[id] = { ...(CMDR_SAVE[id] || {}), xp: cmdrXP(id) + xp };
    return { f, xp, surv, up: cmdrLevel(id) > before, lv: cmdrLevel(id) };
  });
  saveCmdrs(CMDR_SAVE);
  return out;
}
function showReport() {
  if (GAME.sc && GAME.sc.sim) { showSimReport(); return; }
  if (GAME.sc && GAME.sc.tut) { tutReport(); return; }   // 教學：不給經驗、不上傳紀錄
  if (GAME.sc && GAME.sc.mp) { mpReport(); return; }   // 多人：依自己這一方的角度   // 模擬室：不給經驗、不上傳紀錄
  const R = GAME.result, sc = GAME.sc, st = battleStats();
  setPhase('report');
  if (!GAME.xp) { GAME.xp = awardXP(R, st); uploadRecord(R, st); campResult(R); storyResult(R); GAME.merit = tavernAfterBattle(R, sc); if (sc.random) GAME.randLoadout = JSON.parse(JSON.stringify(GAME.loadout)); }
  const gains = GAME.xp;
  const row = (t) => `<tr><td>${SHIP_TYPES[t].name}</td><td>${ships5(st.init[0][t])}</td><td>${ships5(st.init[0][t] - st.left[0][t])}</td><td>${ships5(st.init[1][t])}</td><td>${ships5(st.init[1][t] - st.left[1][t])}</td></tr>`;
  const asp = (sd) => dmgStats[sd].map((v) => ships5(v)).join(' ／ ');
  const skillsUsed = fleets.filter((f) => f.side === GAME.playerSide).flatMap((f) => Object.entries(f.skills).filter(([, s]) => s.used).map(([id, s]) => `${f.commander.name}：${SKILLS[id].name} ×${s.used}`));
  const label = { win: '勝利', lose: '敗北', draw: '平手' }[R.kind];
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>戰後報告</h2><span class="crumb">${sc.name}　·　${OP_LEVELS[(battleSetup && battleSetup.op) || 0].name}難度　·　戰鬥時間 ${_fmtT(R.t)}</span></div>
    <div class="g-card" style="margin-bottom:12px;text-align:center"><p class="result ${R.kind}">${label}</p><div class="g-dim">${R.why}${speedBonus(R) ? `　<b class="g-emp">${speedBonus(R).name}</b>（目標 ${_fmtT(speedBonus(R).par)}：經驗與功勳 +${Math.round(speedBonus(R).add * 100)}%）` : ''}${R.retreat ? (rewardMul(R) ? '（撤退：經驗與功勳減半）' : `（開戰 ${RETREAT_MIN_T} 秒內撤退：不給經驗與功勳）`) : ''}</div>
      <div style="margin-top:6px">我軍剩 ${Math.round(R.ratio[0] * 100)}%　·　敵軍剩 ${Math.round(R.ratio[1] * 100)}%</div></div>${sc.saga ? storyAfterHTML(R) : ''}
    <div class="intel-grid">
      <div class="g-card"><h3>兵力損失（艘）</h3><table class="stat-tbl"><tr><th>艦種</th><th>我軍出擊</th><th>我軍損失</th><th>敵軍出擊</th><th>敵軍損失</th></tr>
        ${SHIP_TYPES.map((_, t) => t).filter((t) => t < N_COMBAT || st.init[0][t] + st.init[1][t] > 0).map(row).join('')}
        <tr><td><b>合計</b></td><td>${ships5(sumA(st.init[0]))}</td><td>${ships5(sumA(st.init[0]) - sumA(st.left[0]))}</td><td>${ships5(sumA(st.init[1]))}</td><td>${ships5(sumA(st.init[1]) - sumA(st.left[1]))}</td></tr></table>
        <dl class="kv" style="margin-top:10px"><dt>被擊沉方向</dt><dd>我軍 正／側／背 ${asp(0)}<br>敵軍 正／側／背 ${asp(1)}</dd>
        <dt>使用技能</dt><dd>${skillsUsed.length ? skillsUsed.join('<br>') : '無'}</dd>
        ${battleRules && battleRules.rotate ? `<dt>前排輪替／戰地維修</dt><dd>我軍 ${fmtN(wStats[GAME.playerSide].rot)} 次／${fmtN(wStats[GAME.playerSide].fRep)} 次（修回 ${fmtN(wStats[GAME.playerSide].fHeal)}）　敵軍 ${fmtN(wStats[1 - GAME.playerSide].rot)} 次／${fmtN(wStats[1 - GAME.playerSide].fRep)} 次（修回 ${fmtN(wStats[1 - GAME.playerSide].fHeal)}）</dd>` : ''}
        ${battleRules && battleRules.deflect ? `<dt>護盾偏折（無傷／減半）</dt><dd>我軍 ${fmtN(deflStats[GAME.playerSide][0])}／${fmtN(deflStats[GAME.playerSide][1])} 次（擋掉 ${fmtN(deflStats[GAME.playerSide][2])} 傷害）　敵軍 ${fmtN(deflStats[1 - GAME.playerSide][0])}／${fmtN(deflStats[1 - GAME.playerSide][1])} 次</dd>` : ''}
        ${battleRules && battleRules.ray ? `<dt>光束擋下／流彈／空中擋下</dt><dd>我軍 ${rayStats[GAME.playerSide].map(fmtN).join('／')} 發　敵軍 ${rayStats[1 - GAME.playerSide].map(fmtN).join('／')} 發</dd>` : ''}
        ${battleRules && battleRules.ff ? `<dt>友軍誤射</dt><dd>我軍 ${fmtN(ffStats[GAME.playerSide][0])} 發（${fmtN(Math.round(ffStats[GAME.playerSide][1]))} 傷害）　敵軍 ${fmtN(ffStats[1 - GAME.playerSide][0])} 發</dd>${battleRules.ff === 2 ? `<dt>射界受阻停火</dt><dd>我軍 ${fmtN(ffHold[GAME.playerSide])} 次　敵軍 ${fmtN(ffHold[1 - GAME.playerSide])} 次</dd>` : ''}` : ''}</dl></div>
      <div class="g-card"><h3>指揮官經驗</h3>${gains.map((g) => `<div style="margin-bottom:10px"><b>${g.f.commander.name}</b>（${g.f.name}，存活 ${Math.round(g.surv * 100)}%）
        <span class="g-good">+${g.xp} 經驗</span>${g.up ? `　<b class="g-emp">升到 Lv ${g.lv}！</b>` : `　Lv ${g.lv}`}${cmdrPoints(g.f.commander.id) > 0 ? `　<span class="tal-pts">可分配天賦 ${cmdrPoints(g.f.commander.id)} 點</span>` : ''}
        <div class="xpbar"><i style="width:${(cmdrXP(g.f.commander.id) % XP_PER_LEVEL) / XP_PER_LEVEL * 100}%"></i></div></div>`).join('')}
        ${GAME.merit ? `<div style="margin:6px 0"><b class="g-emp">+${GAME.merit} 功勳</b>　<span class="g-dim">目前 ${fmtN(ROSTER.merit)}，可以到星際酒館招募指揮官（候選人已換新一批）</span></div>` : ''}
        <div class="g-dim" style="font-size:calc(12px * var(--ui))">這一版是「每場給預算」的模式：輸贏都不會損失艦隊，經驗會保留。</div></div>
    </div>
    <div class="g-row" style="margin-top:14px">${GAME.recView ? '<button class="g-btn" id="r-rec">← 戰鬥回放</button>' : `<button class="g-btn" id="r-menu">單人戰鬥</button><button class="g-btn" id="r-brief">${sc.saga ? '星圖' : sc.campaign ? '無限戰場' : sc.random ? '隨機戰役設定' : '作戰列表'}</button><button class="g-btn" id="r-tal">指揮官天賦</button>`}<span class="g-sp"></span>
      <button class="g-btn" id="r-replay">觀看回放</button>${GAME.recView ? '' : sc.random ? '<button class="g-btn" id="r-retry">同一個戰場再戰</button><button class="g-btn pri" id="r-again">換一個戰場 →</button>'
        : `<button class="g-btn pri" id="r-again">${sc.saga ? storyAgainLabel(R) : sc.campaign ? (GAME.campOutcome === 'win' ? `下一關：第 ${sc.stage + 1} 關 →` : R.retreat ? '重打這一關（同樣的敵人與地形）' : '重打這一關（敵人與地形重新生成）') : '再戰一次（回到編成）'}</button>`}</div>
  </div>`);
  if (GAME.recView) gEl('r-rec').onclick = () => { GAME.recView = false; showRecords(); };
  else {
    gEl('r-tal').onclick = () => showCommanders(() => showReport());
    gEl('r-menu').onclick = showSingle;
    gEl('r-brief').onclick = () => (sc.saga ? showStory() : sc.campaign ? showCampaign() : sc.random ? showRandom() : showBriefing(sc));
    gEl('r-again').onclick = () => (sc.saga ? storyAgain(R) : sc.campaign ? showCampBriefing() : sc.random ? randReroll() : showLoadout());
    if (gEl('r-retry')) gEl('r-retry').onclick = showLoadout;
  }
  gEl('r-replay').onclick = startReplay;
}
function startReplay(rec) {
  overlay(null);
  if (GAME.result) GAME.lastResult = GAME.result;   // 提早結束回放時，戰報用原本的結果
  GAME.replaying = true; GAME.result = null; GAME.reportShown = false; GAME.log = []; GAME.simCtl = null; GAME.lineK = 0; GAME.dlineK = 0;   // 模擬室的接管紀錄會在回放裡重新執行
  gEl('battlehud').innerHTML = '';
  const LR = GAME.lastResult;   // 撤退結束的戰鬥：回放停在撤退那一刻
  GAME.replayEnd = rec && rec.replay ? rec.replay.end || null : LR && LR.retreat ? replayEndOf(LR) : null;
  // 比對用：紀錄的版本與結束指紋（剛打完的這場＝目前版本）
  GAME.replayRef = rec && rec.replay ? { ver: rec.replay.ver || '', hash: rec.replay.hash || null, retreat: !!rec.replay.end } : LR ? { ver: window.__BUILD || '', hash: LR.hash || null, retreat: !!LR.retreat } : null;
  const ref = GAME.replayRef;
  if (rec && ref && !ref.ver) toast('這是舊版的紀錄（沒有版本資訊）：規則改過的話，回放結果可能和當時不同', 'hint');
  else if (rec && ref && ref.ver !== (window.__BUILD || '')) toast(`這筆紀錄來自版本 ${ref.ver}（目前 ${window.__BUILD || '-'}）：結束時會比對結果是否一致`, 'hint');
  if (rec && rec.replay) replayBattle(rec.replay.log, rec.replay.rules, rec.replay.seed, rec.replay.setup);
  else replayBattle(cmdLog.slice(), battleRules, battleSeed, battleSetup);
  GAME.init = [sideAlive(0), sideAlive(1)];
  drawField(false);
  setPhase('replay');
  paused = false; updateTimeUI();
  cutPlay(cutSpecReplay(GAME.sc));
  toast('回放：同一個開局，照紀錄的命令重演（不能下令；左鍵拖曳＝移動畫面、右鍵拖曳＝調整視角）');
}
function endReplay() {
  GAME.replaying = false; paused = true; updateTimeUI();
  // 回放自然結束：比對結束那一刻的戰局指紋（中途結束回放、撤退的紀錄不比對）
  const ref = GAME.replayRef; GAME.replayRef = null;
  if (GAME.result && ref && ref.hash && !ref.retreat) {
    if (GAME.result.hash === ref.hash) toast('回放結果與原本的戰鬥完全一致', 'hint');
    else toast(`回放結果與原本的戰鬥不一致${ref.ver && ref.ver !== (window.__BUILD || '') ? `（紀錄來自版本 ${ref.ver}，之後規則有改過）` : ''}`, 'bad');
  }
  if (GAME.recView) { GAME.recView = false; GAME.result = GAME.lastResult; showMenu(); showRecords(); return; }   // 從戰鬥回放進來的：回到紀錄列表
  if (!GAME.result) GAME.result = GAME.lastResult;
  showReport();
}

// ═════ 伺服器：戰績紀錄、帳號 ═════
function escH(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function syncText() { const s = window.STORE && STORE.state ? STORE.state() : 'ok'; return { ok: '☁ 已同步', pending: '☁ 等待同步', saving: '☁ 同步中', error: '⚠ 未同步' }[s] || ''; }
addEventListener('savesync', () => { const e = document.getElementById('m-sync'); if (e) { e.textContent = syncText(); e.className = 'sync-' + STORE.state(); } });
function uploadRecord(R, st) {
  if (!window.API || GAME.replaying || !GAME.sc) return;
  const mine = fleets.filter((f) => f.side === GAME.playerSide);
  const summary = { sc: GAME.sc.id, scName: GAME.sc.name, op: GAME.op || 0, kind: R.kind, why: R.why, dur: Math.round(R.t), ratio: R.ratio, side: GAME.playerSide, ver: window.__BUILD || '',
    cmdrs: mine.map((f) => f.commander ? f.commander.name : f.name), init: [sumA(st.init[0]), sumA(st.init[1])], left: [sumA(st.left[0]), sumA(st.left[1])] };
  let replay;
  // ver：遊戲版本（build 號）；hash：結束時的戰局指紋（撤退的紀錄停在撤退那一刻，指紋不比對）
  try { replay = JSON.parse(JSON.stringify({ log: cmdLog, rules: battleRules, seed: battleSeed, setup: battleSetup, end: R.retreat ? replayEndOf(R) : undefined, ver: window.__BUILD || '', hash: R.retreat ? undefined : R.hash })); } catch (e) { console.warn('紀錄無法序列化', e); return; }
  API.post('api/records', { summary, replay }).then(() => toast('戰績已存到伺服器', 'hint'), (e) => toast('戰績上傳失敗：' + e.message));
}
async function showRecords() {
  overlay(`<div class="g-wrap"><div class="g-head"><h2>戰績紀錄</h2><span class="crumb">存在伺服器上，換電腦登入也看得到</span><span class="g-sp"></span><button class="g-btn" id="rc-back">返回</button></div><div class="g-card" id="rc-body"><p class="g-dim">讀取中…</p></div></div>`);
  gEl('rc-back').onclick = showMenu;
  let list;
  try { list = await API.get('api/records'); } catch (e) { gEl('rc-body').innerHTML = `<p class="g-warn">讀不到紀錄：${escH(e.message)}</p>`; return; }
  if (!gEl('rc-body')) return;
  if (!list.length) { gEl('rc-body').innerHTML = '<p class="g-dim">還沒有紀錄。打完一場作戰就會自動存進來。</p>'; return; }
  const lbl = { win: '勝利', lose: '敗北', draw: '平手' };
  gEl('rc-body').innerHTML = `<table class="stat-tbl rec-tbl"><tr><th>時間</th><th>作戰</th><th>結果</th><th>戰鬥時間</th><th>我軍／敵軍剩餘</th><th>指揮官</th><th></th></tr>
    ${list.map((r) => `<tr><td>${new Date(r.time).toLocaleString('zh-TW', { hour12: false })}</td><td>${escH(r.scName)}</td><td class="rec-${r.kind}">${lbl[r.kind] || escH(r.kind)}</td><td>${_fmtT(r.dur || 0)}</td>
      <td>${Math.round((r.ratio || [0])[0] * 100)}%／${Math.round((r.ratio || [0, 0])[1] * 100)}%</td><td>${escH((r.cmdrs || []).join('、'))}</td>
      <td class="rec-act">${r.ver === (window.__BUILD || '') ? '' : `<span class="g-dim" title="紀錄來自${r.ver ? '版本 ' + escH(r.ver) : '舊版本'}，回放結果可能和當時不同（結束時會比對）">舊版</span> `}<button class="g-btn sm" data-play="${r.id}">回放</button><button class="g-btn sm" data-del="${r.id}" title="刪除">✕</button></td></tr>`).join('')}</table>`;
  gEl('rc-body').querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => playRecord(b.dataset.play)));
  gEl('rc-body').querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定刪除？'; return; }
    try { await API.del('api/records/' + b.dataset.del); showRecords(); } catch (e) { toast('刪除失敗：' + e.message); }
  }));
}
async function playRecord(id) {
  let rec; try { rec = await API.get('api/records/' + id); } catch (e) { toast('讀不到這筆紀錄：' + e.message); return; }
  GAME.sc = SCENARIOS.find((s) => s.id === rec.summary.sc) || { id: rec.summary.sc, mp: rec.summary.sc === 'pvp', name: rec.summary.scName || '戰績紀錄', terrain: (rec.replay && rec.replay.setup && rec.replay.setup.terrain) || [] };
  GAME.playerSide = rec.summary.side || 0;
  GAME.xp = [];   // 回放不再給經驗、也不再存一筆
  GAME.merit = 0; GAME.recView = true;
  startReplay(rec);
}
// ── 存檔管理：伺服器上 3 個欄位，可匯出／匯入成 JSON 檔 ──
const SAVE_FMT = 'starfleet-save';
function saveSummary(d) {
  const j = (k) => { try { return JSON.parse(d[k] || 'null'); } catch (e) { return null; } };
  const st = j(STORY_STORE), tu = j(TUT_STORE), ca = j(CAMP_STORE), out = [];
  if (st && st.done) for (const k of ['e', 'a', 'm']) if (storyCount(st, k)) out.push(`雙星記${STORY_LINE[k].name} ${storyCount(st, k)}／${storySeq(k).length}`);
  if (tu && tu.done) out.push(`教學 ${TUT_LESSONS.filter((L) => tu.done[L.id]).length}／${TUT_LESSONS.length}`);
  if (ca && ca.seed) out.push(`隨機戰役 第 ${ca.stage || 1} 關`);
  return out.join('・') || '（沒有進度）';
}
function saveDownload(name, summary, data) {
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const t = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  const body = JSON.stringify({ format: SAVE_FMT, v: 1, build: window.__BUILD || '', player: API.name(), name, summary, time: Date.now(), data }, null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  a.download = `星海艦隊戰-${API.name()}-${name}-${t}.json`.replace(/[\\/:*?"<>|\s]+/g, '_');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
// 匯入的檔案：本遊戲匯出的格式，或直接是 { 'fleet.xxx': '...' } 的存檔內容
function saveParse(text) {
  let o; try { o = JSON.parse(text); } catch (e) { throw new Error('檔案不是 JSON'); }
  const data = o && o.format === SAVE_FMT ? o.data : o;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('看不懂這個檔案（不是星海艦隊戰的存檔）');
  const keys = Object.keys(data);
  if (!keys.length || keys.some((k) => !/^fleet\.[\w.-]+$/.test(k) || typeof data[k] !== 'string')) throw new Error('看不懂這個檔案（不是星海艦隊戰的存檔）');
  return { data, name: (o.format === SAVE_FMT && o.name) || '匯入的存檔' };
}
async function showSaves() {
  overlay(`<div class="g-wrap" style="max-width:760px"><div class="g-head"><h2>存檔管理</h2><span class="crumb">存在伺服器上，換電腦登入也讀得到</span><span class="g-sp"></span><button class="g-btn" id="sv-back">返回</button></div>
    <div class="g-card" style="margin-bottom:12px"><h3>目前進度</h3>
      <p class="g-dim">${escH(saveSummary(STORE.dump()))}（一直都會自動存到伺服器；欄位是另外留的存檔）</p>
      <div class="g-row"><input class="g-in" id="sv-name" maxlength="40" placeholder="存檔名稱（可留空）"><button class="g-btn sm" id="sv-exp">匯出目前進度</button></div></div>
    <div class="g-card"><h3>存檔欄位</h3><div id="sv-slots" class="sv-slots">讀取中…</div>
      <p class="g-dim" style="margin-top:10px">讀取欄位會取代目前進度（伺服器會先備份，可在「帳號」還原）。按鍵、畫面等設定不會跟著存檔走。</p></div>
    <input type="file" id="sv-file" accept=".json,application/json" hidden></div>`);
  gEl('sv-back').onclick = showMenu;
  const nm = () => gEl('sv-name').value.trim();
  gEl('sv-exp').onclick = () => { const d = STORE.dump(); saveDownload(nm() || '目前進度', saveSummary(d), d); };
  let slots;
  try { await STORE.sync(); slots = await API.get('api/slots'); } catch (e) { const el = gEl('sv-slots'); if (el) el.innerHTML = `<p class="g-warn">讀不到存檔欄位：${escH(e.message)}</p>`; return; }
  const el = gEl('sv-slots'); if (!el) return;
  const when = (t) => new Date(t).toLocaleString('zh-TW', { hour12: false });
  el.innerHTML = slots.map((s, i) => `<div class="sv-slot${s ? '' : ' empty'}"><span class="sv-no">${i + 1}</span>
    <span class="sv-info">${s ? `<b>${escH(s.name)}</b><small>${escH(s.summary || '')}</small><small class="g-dim">${when(s.time)}</small>` : '<span class="g-dim">（空）</span>'}</span>
    <span class="sv-act"><button class="g-btn sm" data-a="save" data-i="${i}">儲存到這裡</button>${s ? `<button class="g-btn sm pri" data-a="load" data-i="${i}">讀取</button><button class="g-btn sm" data-a="exp" data-i="${i}">匯出</button>` : ''}<button class="g-btn sm" data-a="imp" data-i="${i}">匯入檔案</button>${s ? `<button class="g-btn sm" data-a="del" data-i="${i}" title="刪除">✕</button>` : ''}</span></div>`).join('');
  const sure = (b, txt) => { if (b.dataset.sure === '1') return true; b.dataset.sure = '1'; b.textContent = txt; return false; };
  let impSlot = -1;
  gEl('sv-file').onchange = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f || impSlot < 0) return;
    try {
      const r = saveParse(await f.text());
      await API.put('api/slots/' + impSlot, { name: nm() || r.name, summary: saveSummary(r.data), data: r.data });
      toast(`已匯入到欄位 ${impSlot + 1}，按「讀取」就能接著玩`, 'hint'); showSaves();
    } catch (e) { toast('匯入失敗：' + e.message); }
  };
  el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
    const i = +b.dataset.i, s = slots[i], a = b.dataset.a;
    try {
      if (a === 'save') {
        if (s && !sure(b, '確定覆蓋？')) return;
        await STORE.sync(); const d = STORE.dump();
        await API.put('api/slots/' + i, { name: nm() || `存檔 ${i + 1}`, summary: saveSummary(d), data: d });
        toast(`已存到欄位 ${i + 1}`, 'hint'); showSaves();
      } else if (a === 'load') {
        if (!sure(b, '確定讀取？（會重新載入）')) return;
        await STORE.sync(); await API.post(`api/slots/${i}/load`); STORE.freeze(); location.reload();
      } else if (a === 'exp') {
        const full = await API.get('api/slots/' + i); saveDownload(full.name, full.summary, full.data);
      } else if (a === 'imp') {
        if (s && !sure(b, '覆蓋這格？再按一次選檔')) return;
        impSlot = i; gEl('sv-file').click();
      } else if (a === 'del') {
        if (!sure(b, '確定刪除？')) return;
        await API.del('api/slots/' + i); showSaves();
      }
    } catch (e) { toast('失敗：' + e.message); }
  }));
}
function showAccount() {
  overlay(`<div class="g-wrap" style="max-width:640px"><div class="g-head"><h2>帳號</h2><span class="crumb">${escH(API.name())}</span><span class="g-sp"></span><button class="g-btn" id="ac-back">返回</button></div>
    <div class="g-card" style="margin-bottom:12px"><h3>變更密碼</h3>
      <div class="g-row"><input class="g-in" type="password" id="ac-old" placeholder="舊密碼（沒有就留空）"><input class="g-in" type="password" id="ac-new" placeholder="新密碼（留空＝不用密碼）"><button class="g-btn sm" id="ac-pw">變更</button></div><p class="g-dim" id="ac-msg"></p></div>
    <div class="g-card"><h3>存檔備份</h3><p class="g-dim">伺服器會自動備份你的存檔（設定、天賦、武器配置等）。還原會先把目前的存檔再備份一份。</p><div id="ac-bk">讀取中…</div></div></div>`);
  gEl('ac-back').onclick = showMenu;
  gEl('ac-pw').onclick = async () => {
    try { await API.post('api/password', { old: gEl('ac-old').value, password: gEl('ac-new').value }); gEl('ac-msg').textContent = '密碼已變更'; } catch (e) { gEl('ac-msg').textContent = e.message; }
  };
  API.get('api/backups').then((list) => {
    const el = gEl('ac-bk'); if (!el) return;
    el.innerHTML = list.length ? `<div class="bk-list">${list.slice(0, 40).map((b) => `<div class="g-row"><span>${new Date(b.time).toLocaleString('zh-TW', { hour12: false })}</span><span class="g-dim">${b.name.includes('conflict') ? '（兩台電腦同時存檔時留下的）' : b.name.includes('before-restore') ? '（還原前）' : ''}</span><span class="g-sp"></span><button class="g-btn sm" data-bk="${escH(b.name)}">還原</button></div>`).join('')}</div>` : '<p class="g-dim">目前還沒有備份（存檔每 10 分鐘最多備份一次）。</p>';
    el.querySelectorAll('[data-bk]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定還原？（會重新載入）'; return; }
      try { await STORE.sync(); await API.post('api/backups/restore', { name: b.dataset.bk }); STORE.freeze(); location.reload(); } catch (e) { toast('還原失敗：' + e.message); }
    }));
  }, (e) => { const el = gEl('ac-bk'); if (el) el.textContent = '讀不到備份：' + e.message; });
}
