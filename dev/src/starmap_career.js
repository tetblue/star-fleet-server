// ───── 星海生涯：生涯（軍階、任務、升遷、政務、失敗與里程碑）─────
// 資料都在 S.pl；每回合結束時 smCareerTick（在 smTurnEnd 裡呼叫）。數值都是暫定，邊玩邊改。
const SM_MIL = ['艦長', '分隊長', '艦隊指揮官', '方面軍司令', '元帥'];
const SM_MIL_MERIT = [0, 60, 180, 400, 800];   // 升到這一階要的戰功（再通過考核任務）
const SM_MIL_CAP = [0, 1, 3, 6, 99];           // 能指揮幾支艦隊（艦長只有特戰小隊）
const SM_MIL_SAL = [30, 50, 80, 120, 180];     // 每週薪餉
const SM_GOV = ['行星司令', '星區總督', '議員', '元首'];
const SM_GOV_REQ = [null, { perf: 55, sup: 45 }, { perf: 62, sup: 60 }, { perf: 68, sup: 75 }];   // 政績（轄區平均繁榮）與最高的派系支持
const SM_GOV_SAL = [90, 150, 220, 0];
const SM_SUP = ['鷹派', '鴿派', '財團'];
const SM_NPC = ['巴爾克', '霍斯特', '佩蕾', '格倫', '奧德', '薇拉', '卡蘭', '索恩', '伊格', '莫蘭', '黛菈', '雷文', '芙蕾', '戈爾', '尤里', '艾德', '娜塔', '羅森'];
const SM_NPC_EXIT = ['調任後方', '光榮退役', '戰死沙場', '因醜聞去職', '升任他職', '病倒退休'];
const SM_INTEL = ['無情報', '無', '零星', '少量', '中等', '大量', '龐大'];
const SM_OP = { sabotage: '破壞', decap: '斬首', wipe: '全滅' };   // 艦長任務（captain.js 的 CAP_MIS）
const SM_BUILD = {   // 政務：在轄區建設（玩家的資金）
  city: { name: '都市升級', cost: (s) => 250 * (s.tier + 1), ok: (s) => s.tier < 4 && s.pop >= SM_TIER_CAP[s.tier] * 0.6 },
  def: { name: '防衛建築 +1', cost: () => 150, ok: (s) => s.def < 8 },
  gar: { name: '徵召守軍 +60', cost: () => 30, ok: () => true },
  dock: { name: SM_MEGA.dock, cost: () => 900, ok: (s) => !s.mega.dock && s.tier >= 2 },
  elev: { name: SM_MEGA.elev, cost: () => 700, ok: (s) => !s.mega.elev && s.tier >= 2 },
  radar: { name: SM_MEGA.radar, cost: () => 550, ok: (s) => !s.mega.radar },
  shield: { name: SM_MEGA.shield, cost: () => 900, ok: (s) => !s.mega.shield && s.tier >= 2 },
};

function smCareerInit(S, start) {
  const p = S.pl;
  Object.assign(p, { mil: start === 'cmd' ? 2 : 0, gov: -1, merit: start === 'cmd' ? 180 : 0, trust: 50, sup: [30, 30, 30], gs: [], missions: [], ms: [], status: '正常', kills: 0, caps: 0, exam: null, boss: smPick(S, SM_NPC), opCd: 0, offerGov: false });
  smMs(S, `${SM_FAC[p.fac].name}${SM_MIL[p.mil]}`);
}
const smRankName = (S) => { const p = S.pl; return p.status === '終結' ? '已終結' : `${SM_FAC[p.fac].name}${p.gov >= 0 ? SM_GOV[p.gov] : SM_MIL[p.mil]}`; };
const smFleetCap = (S) => { const p = S.pl; return p.gov === 3 ? 99 : Math.max(SM_MIL_CAP[p.mil], p.gov >= 0 ? 2 + p.gov : 0); };
const smSquad = (S) => S.fleets.find((f) => f.pl && f.cap);
function smMs(S, t) { if (!S.pl.ms.some((m) => m.t === t)) { S.pl.ms.push({ t, turn: S.turn }); smLog(S, `★ ${t}`, 'ev'); } }
const smGovPerf = (S) => (S.pl.gs.length ? S.pl.gs.reduce((a, i) => a + S.sys[i].prosp, 0) / S.pl.gs.length : 0);

/* ───── 情報（第 5 階段再細分來源與時效；現在依敵方兵力和這個星系每波上限的比例）───── */
function smIntel(S, sid, fac) {
  const s = S.sys[sid], en = smEnemyAt(S, fac, sid).reduce((a, f) => a + smShips(f.comp), 0);
  if (!en) return SM_INTEL[1];
  const r = en / SM_RULE.wave[s.size];
  return SM_INTEL[r < 0.1 ? 2 : r < 0.3 ? 3 : r < 0.7 ? 4 : r < 1.2 ? 5 : 6];
}

/* ───── 任務 ───── */
// M＝{ id, from: { name, role }, kind: 'order' 上級命令｜'request' 派系委託, type, sys, due（最後一週）, goal, support, intel, reward, exam, state: 'offer'｜'open'｜'done'｜'fail'｜'declined' }
function smNewMission(S, o) {
  const M = { id: S.nextId++, state: o.kind === 'order' ? 'open' : 'offer', t0: S.turn, ...o };
  S.pl.missions.push(M);
  if (M.support && M.support.fleet) {   // 支援：撥一支艦隊給玩家指揮，任務結束收回
    const f = S.fleets.find((x) => x.fac === S.pl.fac && !x.pl && smShips(x.comp) > 0 && smHop(S, x.sys, M.sys) <= 4 && !x.path);
    if (f && M.state === 'open') { f.pl = true; f.loan = M.id; S.pl.fleets.push(f.id); M.support.got = f.name; }
    else M.support.fleet = false;
  }
  if (M.support && M.support.money && M.state === 'open') S.pl.money += M.support.money;
  smLog(S, `${M.kind === 'order' ? '收到命令' : '委託'}：${smMisText(S, M)}`, 'ev');
  return M;
}
function smMisText(S, M) {
  const s = M.sys != null ? S.sys[M.sys].name : '';
  return {
    op: `派特戰小隊到 ${s} 執行${SM_OP[M.op]}任務`,
    capture: `佔領 ${s}${M.exam ? '（考核）' : ''}`,
    defend: `守住 ${s} 到第 ${M.due} 週`,
    destroy: `擊沉 ${Math.round(M.goal * smRep())} 艘敵艦（從接令起算）`,
    prosper: `讓 ${s} 的繁榮達到 ${M.goal}`,
    pay: `資助 ${M.goal} 資金`,
  }[M.type] || M.type;
}
const smMisLeft = (S, M) => M.due - S.turn + 1;   // 還剩幾週（含這一週）
function smAccept(S, M) {
  if (M.state !== 'offer') return;
  M.state = 'open'; M.t0 = S.turn; M.kills0 = S.pl.kills;
  if (M.type === 'pay') { if (S.pl.money < M.goal) { M.state = 'offer'; return '資金不足'; } S.pl.money -= M.goal; smMisDone(S, M); }
  return '';
}
function smDecline(S, M) { if (M.state === 'offer') { M.state = 'declined'; smLog(S, `婉拒委託：${smMisText(S, M)}`); } }
function smMisDone(S, M) {
  M.state = 'done'; const R = M.reward || {}, p = S.pl;
  p.merit += R.merit || 0; p.money += R.money || 0; p.trust = smClamp(p.trust + (R.trust || 0), 0, 100);
  if (R.sup) p.sup[R.sup[0]] = smClamp(p.sup[R.sup[0]] + R.sup[1], 0, 100);
  smLog(S, `任務完成：${smMisText(S, M)}${R.merit ? `（戰功 +${R.merit}）` : ''}${R.money ? `（資金 +${R.money}）` : ''}`, 'good');
  smMisEnd(S, M);
  if (M.exam) smPromote(S);
}
function smMisFail(S, M, why) {
  M.state = 'fail'; const p = S.pl;
  if (M.kind === 'order') { p.trust = smClamp(p.trust - (M.exam ? 6 : 8), 0, 100); p.merit = Math.max(0, p.merit - 10); }
  else if (M.reward && M.reward.sup) p.sup[M.reward.sup[0]] = smClamp(p.sup[M.reward.sup[0]] - 6, 0, 100);
  smLog(S, `任務失敗：${smMisText(S, M)}${why ? `（${why}）` : ''}`, 'bad');
  smMisEnd(S, M);
  if (M.exam) S.pl.exam = null;
}
function smMisEnd(S, M) {   // 收回支援的艦隊
  for (const f of S.fleets) if (f.loan === M.id) { f.pl = false; f.loan = null; f.path = null; S.pl.fleets = S.pl.fleets.filter((id) => id !== f.id); }
}
// 每週：檢查任務進度、發新任務
function smMissionTick(S) {
  const p = S.pl;
  for (const M of p.missions) {
    if (M.state === 'offer' && S.turn > M.t0 + 2) { M.state = 'declined'; continue; }   // 委託放著不理：過期
    if (M.state !== 'open') continue;
    const s = M.sys != null ? S.sys[M.sys] : null;
    if (M.type === 'capture' && s.owner === p.fac && (!M.exam || M.byPl)) { smMisDone(S, M); continue; }
    if (M.type === 'capture' && s.owner === p.fac && M.exam && !M.byPl) { smMisFail(S, M, '被別人佔領了'); continue; }
    if (M.type === 'destroy' && p.kills - (M.kills0 || 0) >= M.goal) { smMisDone(S, M); continue; }
    if (M.type === 'prosper' && s.prosp >= M.goal) { smMisDone(S, M); continue; }
    if (M.type === 'defend' && s.owner !== p.fac) { smMisFail(S, M, `${s.name} 失守`); continue; }
    if (S.turn >= M.due) { if (M.type === 'defend') smMisDone(S, M); else smMisFail(S, M, '超過時限'); }
  }
  p.missions = p.missions.filter((M) => M.state === 'open' || M.state === 'offer' || S.turn - (M.end || (M.end = S.turn)) < 6);
  smGenMissions(S);
}
function smGenMissions(S) {
  const p = S.pl; if (p.status === '終結') return;
  const open = p.missions.filter((M) => M.state === 'open' || M.state === 'offer');
  const mine = smOwned(S, p.fac), targets = [...new Set(mine.flatMap((s) => S.adj[s.id]))].map((i) => S.sys[i]).filter((t) => smHostileSys(S, p.fac, t));
  const boss = { name: p.boss, role: p.gov >= 0 ? '聯盟議會' : `上級（${SM_MIL[Math.min(4, p.mil + 1)]}）` };
  // 考核：戰功夠了就發（艦長的考核是特戰任務，其他是佔領）
  if (!p.exam && p.gov < 0 && p.mil < 4 && p.merit >= SM_MIL_MERIT[p.mil + 1] && !open.some((M) => M.exam)) {
    const t = smPickTarget(S, targets, p.mil === 0);
    if (t) { const M = smNewMission(S, p.mil === 0 ? { kind: 'order', from: boss, type: 'op', op: smPick(S, Object.keys(SM_OP)), sys: t.id, due: S.turn + 8, exam: true, reward: { merit: 20, trust: 5 }, intel: smIntel(S, t.id, p.fac) }
      : { kind: 'order', from: boss, type: 'capture', sys: t.id, due: S.turn + 10, exam: true, reward: { merit: 30, trust: 6, money: 200 }, support: { fleet: p.mil >= 2 }, intel: smIntel(S, t.id, p.fac) }); p.exam = M.id; return; }
  }
  // 上級的命令：同時最多一道
  if (!open.some((M) => M.kind === 'order') && p.gov < 0 && smRnd(S) < 0.5) {
    if (p.mil === 0) {
      const t = smPickTarget(S, targets, true);
      if (t) smNewMission(S, { kind: 'order', from: boss, type: 'op', op: smPick(S, Object.keys(SM_OP)), sys: t.id, due: S.turn + 6, reward: { merit: 15 + Math.round(smRnd(S) * 10), money: 80 }, intel: smIntel(S, t.id, p.fac) });
    } else {
      const r = smRnd(S), threatened = mine.filter((s) => S.adj[s.id].some((j) => smEnemyAt(S, p.fac, j).length));
      if (r < 0.45 && targets.length) { const t = smPickTarget(S, targets, false); smNewMission(S, { kind: 'order', from: boss, type: 'capture', sys: t.id, due: S.turn + 8, reward: { merit: 25, money: 150, trust: 3 }, support: { fleet: smRnd(S) < 0.4, money: smRnd(S) < 0.5 ? 150 : 0 }, intel: smIntel(S, t.id, p.fac) }); }
      else if (r < 0.75 && threatened.length) { const t = smPick(S, threatened); smNewMission(S, { kind: 'order', from: boss, type: 'defend', sys: t.id, due: S.turn + 4, reward: { merit: 15, trust: 4 }, intel: smIntel(S, S.adj[t.id].find((j) => smEnemyAt(S, p.fac, j).length), p.fac) }); }
      else smNewMission(S, { kind: 'order', from: boss, type: 'destroy', goal: 60 + 40 * p.mil, due: S.turn + 6, reward: { merit: 20, money: 100 } });
    }
  }
  // 派系的委託（艦隊指揮官以上、或政務線）：偶爾一個
  if ((p.mil >= 2 || p.gov >= 0) && !open.some((M) => M.kind === 'request') && smRnd(S) < 0.18) {
    const k = Math.floor(smRnd(S) * 3), from = { name: smPick(S, SM_NPC), role: SM_SUP[k] };
    if (k === 0 && targets.length) { const t = smPickTarget(S, targets, false); smNewMission(S, { kind: 'request', from, type: 'capture', sys: t.id, due: S.turn + 10, reward: { merit: 15, sup: [0, 10] }, intel: smIntel(S, t.id, p.fac) }); }
    else if (k === 1 && p.gs.length) { const t = S.sys[smPick(S, p.gs)]; smNewMission(S, { kind: 'request', from, type: 'prosper', sys: t.id, goal: Math.min(95, t.prosp + 8), due: S.turn + 10, reward: { money: 120, sup: [1, 10] } }); }
    else smNewMission(S, { kind: 'request', from, type: 'pay', goal: 150 + 50 * Math.max(p.mil, p.gov + 2), due: S.turn + 3, reward: { sup: [2, 12], trust: 2 } });
  }
}
function smPickTarget(S, targets, op) {
  const L = targets.filter((t) => (op ? t.owner !== SM_N : true));
  if (!L.length) return null;
  const val = (t) => (t.pop + 3) / (smEnemyAt(S, S.pl.fac, t.id).reduce((a, f) => a + smVal(f.comp), 0) + smGround(t) * 0.5 + 30);
  return L.sort((a, b) => val(b) - val(a))[Math.floor(smRnd(S) * Math.min(3, L.length))];
}
// 艦長任務：特戰小隊在目標星系才能執行；真打用艦長模式（starmap_ui.js），自動代打用機率
function smOpReady(S, M) { const q = smSquad(S); return M.type === 'op' && M.state === 'open' && q && q.sys === M.sys && S.pl.opCd <= S.turn; }
function smOpResult(S, M, ok) {
  S.pl.opCd = S.turn + 1;
  if (ok) smMisDone(S, M); else { smLog(S, `${SM_OP[M.op]}任務失敗，特戰小隊撤離`, 'bad'); S.pl.trust = smClamp(S.pl.trust - 3, 0, 100); }
}

/* ───── 升遷 ───── */
function smPromote(S) {
  const p = S.pl;
  if (p.gov >= 0 || p.mil >= 4) return;
  const was = smPick(S, SM_NPC), why = smPick(S, SM_NPC_EXIT);
  p.mil++; p.exam = null; p.trust = smClamp(p.trust + 5, 0, 100);
  smLog(S, `${was}（${SM_MIL[p.mil]}）${why}，職缺由你遞補`, 'ev');
  smMs(S, `${SM_FAC[p.fac].name}${SM_MIL[p.mil]}`);
  smAssignFleets(S);
  if (p.mil >= 2 && !p.offerGov) p.offerGov = true;   // 艦隊指揮官以上：議會會來問要不要轉任政務
}
// 依軍階撥艦隊給玩家（從聯盟現有的艦隊撥，不夠就在首都新編）
function smAssignFleets(S) {
  const p = S.pl, cap = smFleetCap(S), mine = () => S.fleets.filter((f) => f.pl && !f.cap && !f.loan && smShips(f.comp) > 0);
  const base = (smSquad(S) && S.sys[smSquad(S).sys].owner === p.fac ? smSquad(S).sys : null) ?? (smOwned(S, p.fac).find((s) => s.cap) || smOwned(S, p.fac)[0] || {}).id;
  for (let guard = 0; mine().length < Math.min(cap, 6) && guard < 8; guard++) {
    const f = S.fleets.filter((x) => x.fac === p.fac && !x.pl && !x.cap && smShips(x.comp) > 0 && !x.path).sort((a, b) => smHop(S, a.sys, base) - smHop(S, b.sys, base))[0];
    if (f && S.fleets.filter((x) => x.fac === p.fac && !x.pl && smShips(x.comp) > 0).length > 3) { f.pl = true; f.name = `${f.name}（撥交）`; S.pl.fleets.push(f.id); smLog(S, `${f.name} 撥入你的指揮`); }
    else if (base != null) { const nf = smNewFleet(S, p.fac, base, smArchComp(0, 300), { pl: true, name: `新編第${S.nextId}艦隊`, cmdr: { name: smPick(S, SM_CMDR), lv: 2, tac: 'push' } }); S.pl.fleets.push(nf.id); smLog(S, `${nf.name} 新編成，歸你指揮`); }
    else break;
  }
}
// 政務線：轉任行星司令（從軍職轉過來，艦隊上限照政務）
function smTakeGov(S) {
  const p = S.pl, c = smOwned(S, p.fac).filter((s) => !s.cap).sort((a, b) => a.prosp - b.prosp);
  const s = c[Math.floor(c.length / 2)] || smOwned(S, p.fac)[0]; if (!s) return false;
  p.gov = 0; p.gs = [s.id]; p.offerGov = false; p.exam = null;
  for (const M of p.missions) if (M.kind === 'order' && M.state === 'open') { M.state = 'declined'; smMisEnd(S, M); }
  smMs(S, `${SM_FAC[p.fac].name}${SM_GOV[0]}`); smLog(S, `轉任政務：${s.name} 的行星司令`, 'ev');
  return true;
}
function smGovTick(S) {
  const p = S.pl; if (p.gov < 0) return;
  p.gs = p.gs.filter((i) => S.sys[i].owner === p.fac);
  if (p.gov === 3) p.gs = smOwned(S, p.fac).map((s) => s.id);
  if (!p.gs.length && p.gov < 3) { p.gov = -1; p.trust = smClamp(p.trust - 15, 0, 100); smLog(S, '轄區全部失守，被解除政務職，回到軍職', 'bad'); return; }
  p.money += SM_GOV_SAL[p.gov] + p.gs.reduce((a, i) => a + smSysIncome(S.sys[i]), 0) * (p.gov === 3 ? 0 : 0.3);
  // 升遷：政績與派系支持達標就一定觸發（議會的職位有人出缺）
  const R = SM_GOV_REQ[p.gov + 1];
  if (p.gov < 3 && R && smGovPerf(S) >= R.perf && Math.max(...p.sup) >= R.sup) {
    p.gov++; smLog(S, `${smPick(S, SM_NPC)}（${SM_GOV[p.gov]}）${smPick(S, SM_NPC_EXIT)}，由你遞補`, 'ev'); smMs(S, `${SM_FAC[p.fac].name}${SM_GOV[p.gov]}`);
    if (p.gov === 1) { const add = [...new Set(p.gs.flatMap((i) => S.adj[i]))].filter((i) => S.sys[i].owner === p.fac && !p.gs.includes(i)).slice(0, 3); p.gs.push(...add); }
    if (p.gov === 2) { const add = smOwned(S, p.fac).filter((s) => !p.gs.includes(s.id)).slice(0, 3).map((s) => s.id); p.gs.push(...add); }
    smAssignFleets(S);
  }
}
function smCanBuild(S, s, k) { const p = S.pl, B = SM_BUILD[k]; return p.gs.includes(s.id) && s.owner === p.fac && !s.sg && B.ok(s) && (p.gov === 3 ? S.fac[p.fac].money : p.money) >= B.cost(s); }
function smBuild(S, sid, k) {
  const s = S.sys[sid], B = SM_BUILD[k]; if (!smCanBuild(S, s, k)) return false;
  const c = B.cost(s); if (S.pl.gov === 3) S.fac[S.pl.fac].money -= c; else S.pl.money -= c;
  if (k === 'city') s.tier++; else if (k === 'def') s.def++; else if (k === 'gar') s.gar += 60; else s.mega[k] = 1;
  if (k !== 'gar') s.prosp = smClamp(s.prosp + 2, 0, 100);
  smLog(S, `${s.name}：${B.name}`);
  return true;
}

/* ───── 每週的生涯結算（smTurnEnd 呼叫）───── */
function smCareerTick(S) {
  const p = S.pl; if (p.status === '終結') return;
  if (p.gov < 0) p.money += SM_MIL_SAL[p.mil];
  smGovTick(S);
  smMissionTick(S);
  // 艦隊超過上限：多的交回（先交回撥交的）
  const cap = smFleetCap(S), own = S.fleets.filter((f) => f.pl && !f.cap && !f.loan && smShips(f.comp) > 0);
  if (own.length > cap) for (const f of own.slice(cap)) { f.pl = false; S.pl.fleets = S.pl.fleets.filter((id) => id !== f.id); smLog(S, `${f.name} 交回聯盟指揮`); }
  // 失敗：聯盟沒有星系、玩家也沒有艦隊和小隊
  if (!smOwned(S, p.fac).length && !S.fleets.some((f) => f.pl && smShips(f.comp) > 0)) { p.status = '終結'; smLog(S, `${SM_FAC[p.fac].name}滅亡，你也失去了一切。生涯結束。`, 'bad'); smMs(S, '生涯終結'); }
  // 里程碑
  const c = smCounts(S);
  if (c[p.fac] >= S.sys.length * 0.8) smMs(S, `${SM_FAC[p.fac].name}統一星域`);
  p.trust = smClamp(p.trust + (p.trust < 50 ? 0.3 : 0), 0, 100);
  p.sup = p.sup.map((v) => smClamp(v + (v > 30 ? -0.4 : v < 30 ? 0.4 : 0), 0, 100));
}
// 自動代打（測試用）：接受委託、特戰任務用機率、政務隨便蓋、艦隊照 AI
function smAutoCareer(S) {
  const p = S.pl;
  for (const M of p.missions) {
    if (M.state === 'offer') { if (smRnd(S) < 0.7) smAccept(S, M); else smDecline(S, M); }
    if (M.state === 'open' && M.type === 'op') { const q = smSquad(S); if (q) { q.sys = M.sys; if (smOpReady(S, M)) smOpResult(S, M, smRnd(S) < 0.7); } }
  }
  if (p.offerGov && smRnd(S) < 0.3) smTakeGov(S);
  for (const i of p.gs) for (const k of ['city', 'def', 'elev', 'radar']) if (smRnd(S) < 0.3) smBuild(S, i, k);
}
