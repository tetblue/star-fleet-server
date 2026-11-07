// ───── 星海生涯：情報、天氣、地面突襲、科技（第 5 階段）─────
// 數值都是暫定，邊玩邊改（見 dev/星海生涯企劃.md 第二節）。

/* ───── 天氣：每個星系一種週期性天氣（s.wx＝{ k, per, len, ph }），每 per 週出現 len 週 ───── */
const SM_WX = {
  solar: { name: '太陽風暴', desc: '雷達與情報失效；特種部隊可以趁機避開敵方艦隊突襲' },
  ion: { name: '離子星雲', desc: '光束武器的射程縮短：地面砲台效能 ×0.7' },
  grav: { name: '重力潮汐', desc: '可航行的空間縮小：每波上限 ×0.6' },
};
const smWxOn = (S, s, k, turn = S.turn) => !!s.wx && s.wx.k === k && (turn + s.wx.ph) % s.wx.per < s.wx.len;
const smWxNow = (S, s) => (s.wx && smWxOn(S, s, s.wx.k) ? s.wx.k : null);
function smWxNext(S, s) { if (!s.wx) return null; for (let d = 0; d < 30; d++) if (smWxOn(S, s, s.wx.k, S.turn + d)) return d; return null; }   // 幾週後出現（0＝現在）
function smWaveCap(S, s) { return Math.round(SM_RULE.wave[s.size] * (smWxOn(S, s, 'grav') ? 0.6 : 1)); }

/* ───── 科技：投入研究點數（用資金換）並等待回合數 ───── */
const SM_TECH = {
  stealth: { name: '匿蹤躍遷', br: '艦隊', rp: 300, turns: 4, desc: '特戰小隊可以避開敵方艦隊突襲地面（潛入成功率 60%）' },
  charge: { name: '快速充能', br: '艦隊', rp: 250, turns: 3, desc: '躍遷撤退的充能時間 10 → 6 秒，撤退時損失比較少' },
  scout: { name: '深空偵察', br: '艦隊', rp: 200, turns: 3, desc: '偵察技能：取得 3 個航道內任一星系的精確情報（冷卻 4 週）' },
  repair: { name: '戰場維修', br: '艦隊', rp: 300, turns: 4, desc: '戰後修回的比例 25% → 40%' },
  radar: { name: '雷達擴展', br: '建築', rp: 250, turns: 3, desc: '情報範圍：己方星系周圍 1 → 2 個航道' },
  shield: { name: '護盾強化', br: '建築', rp: 300, turns: 4, desc: '你轄區的行星護盾 ×1.5 → ×1.8' },
  plan: { name: '都市規劃', br: '建築', rp: 200, turns: 3, desc: '轄區建設的費用 −20%' },
};
const SM_RP_PRICE = 1;   // 每點研究要多少資金
const smHas = (S, k) => !!(S.pl.tech && S.pl.tech.done && S.pl.tech.done.includes(k));
function smTechInit(S) { if (!S.pl.tech) S.pl.tech = { done: [], cur: null, rp: 0, start: 0 }; return S.pl.tech; }
function smResearch(S, k) {
  const T = smTechInit(S); if (T.cur || smHas(S, k) || !SM_TECH[k]) return '已經在研究，或已經完成';
  const c = SM_TECH[k].rp * SM_RP_PRICE; if (S.pl.money < c) return `資金不足（要 ${c}）`;
  S.pl.money -= c; T.cur = k; T.start = S.turn; smLog(S, `開始研究「${SM_TECH[k].name}」（${SM_TECH[k].turns} 週後完成）`);
  return '';
}
function smTechTick(S) {
  const T = smTechInit(S);
  if (T.cur && S.turn - T.start + 1 >= SM_TECH[T.cur].turns) { T.done.push(T.cur); smLog(S, `研究完成：「${SM_TECH[T.cur].name}」`, 'good'); T.cur = null; }
}

/* ───── 情報 ───── */
// S.pl.intel[星系]＝{ t: 取得的週, q: 準確度（0 粗略、1 普通、2 精確）, src, en: 敵方艦數, comp, fac: 敵方勢力, gar, def, shield, aa }
// 來源：同陣營的單位（己方星系與己方艦隊所在＝精確；周圍 1 個航道＝粗略）、商人（花錢買，普通）、偵察技能（精確，冷卻）
// 太陽風暴的星系：雷達失效，只有艦隊在場才看得到
function smIntelTick(S) {
  const p = S.pl; if (!p.intel) p.intel = {};
  const rng = smHas(S, 'radar') ? 2 : 1, own = smOwned(S, p.fac).map((s) => s.id), fleetAt = new Set(S.fleets.filter((f) => f.fac === p.fac && smShips(f.comp) > 0).map((f) => f.sys));
  const near = new Set(own); let ring = own.slice();
  for (let k = 0; k < rng; k++) { const nx = []; for (const i of ring) for (const j of S.adj[i]) if (!near.has(j)) { near.add(j); nx.push(j); } ring = nx; }
  for (const s of S.sys) {
    const storm = smWxOn(S, s, 'solar');
    if (fleetAt.has(s.id) || (s.owner === p.fac && !storm)) smSeen(S, s.id, 2, '同陣營');
    else if (near.has(s.id) && !storm) smSeen(S, s.id, 0, '雷達');
  }
}
function smSeen(S, sid, q, src) {
  const p = S.pl, s = S.sys[sid], old = p.intel[sid];
  if (old && old.t === S.turn && old.q >= q) return old;
  const en = smEnemyAt(S, p.fac, sid), comp = en.reduce((c, f) => smAdd(c, f.comp), [0, 0, 0, 0, 0, 0]);
  p.intel[sid] = { t: S.turn, q, src, en: smShips(comp), comp, fac: [...new Set(en.map((f) => f.fac))], nf: en.length, owner: s.owner, gar: s.gar, def: s.def, shield: !!s.mega.shield, pop: s.pop, prosp: s.prosp, tier: s.tier, dis: s.dis || -1 };
  return p.intel[sid];
}
// 敵方兵力的等級：以這個星系每波上限的比例；不準的時候給一個範圍
function smForceLv(S, sid, n) { const r = n / SM_RULE.wave[S.sys[sid].size]; return n <= 0 ? 1 : r < 0.1 ? 2 : r < 0.3 ? 3 : r < 0.7 ? 4 : r < 1.2 ? 5 : 6; }
function smIntelOf(S, sid) {
  const I = S.pl.intel && S.pl.intel[sid];
  if (!I) return { known: false, text: SM_INTEL[0], age: null };
  const lv = smForceLv(S, sid, I.en), age = S.turn - I.t;
  const text = I.en <= 0 ? SM_INTEL[1] : I.q >= 2 ? SM_INTEL[lv] : I.q === 1 ? SM_INTEL[lv] : `${SM_INTEL[Math.max(2, lv - 1)]}～${SM_INTEL[Math.min(6, lv + 1)]}`;
  return { known: true, I, lv, text, age, exact: I.q >= 2 && age === 0 };
}
const SM_MERCHANT = 60;   // 跟商人買一個星系的情報
function smBuyIntel(S, sid) { if (S.pl.money < SM_MERCHANT) return `資金不足（要 ${SM_MERCHANT}）`; S.pl.money -= SM_MERCHANT; smSeen(S, sid, 1, '商人'); return ''; }
function smScout(S, sid) {
  const p = S.pl; if (!smHas(S, 'scout')) return '還沒研究「深空偵察」';
  if ((p.scoutCd || 0) > S.turn) return `偵察技能冷卻中（第 ${p.scoutCd} 週可用）`;
  const from = S.fleets.filter((f) => f.pl && smShips(f.comp) > 0).map((f) => f.sys);
  if (!from.some((i) => smHop(S, i, sid) <= 3)) return '太遠了：要在你的艦隊 3 個航道內';
  smSeen(S, sid, 2, '偵察'); p.scoutCd = S.turn + 4; return '';
}

/* ───── 地面突襲（特戰小隊）───── */
// 條件（照優先順序）：我方控制軌道 → 沒有敵方艦隊 → 太陽風暴 → 匿蹤躍遷科技；都不符合就不能突襲
const SM_RAID_INF = { siege: 1, noFleet: 0.9, storm: 0.7, stealth: 0.6 };
const SM_RAID_NAME = { siege: '我方控制軌道', noFleet: '沒有敵方艦隊駐守', storm: '太陽風暴', stealth: '匿蹤躍遷' };
const SM_RAID_T = 5;   // 突襲成功後，地面防禦癱瘓幾週
function smRaidCond(S, s) {
  if (s.sg && s.sg.f === S.pl.fac) return 'siege';
  if (!smEnemyAt(S, S.pl.fac, s.id).length) return 'noFleet';
  if (smWxOn(S, s, 'solar')) return 'storm';
  if (smHas(S, 'stealth')) return 'stealth';
  return null;
}
function smCanRaid(S, s) { const q = smSquad(S); return !!q && q.sys === s.id && smHostileSys(S, S.pl.fac, s) && s.owner !== SM_N && !(s.dis > S.turn) && (S.pl.raidCd || 0) <= S.turn && !!smRaidCond(S, s); }
// 潛入：先擲潛入成功率；被發現＝任務取消、小隊冷卻比較久
function smRaidInfiltrate(S, s) {
  const c = smRaidCond(S, s), ok = smRnd(S) < SM_RAID_INF[c];
  if (!ok) { S.pl.raidCd = S.turn + 3; smLog(S, `特戰小隊潛入 ${s.name} 時被發現，任務取消`, 'bad'); }
  return ok;
}
function smRaidResult(S, s, ok) {
  S.pl.raidCd = S.turn + (ok ? 1 : 2);
  if (ok) { s.dis = S.turn + SM_RAID_T; S.pl.merit += 10; smLog(S, `突襲成功：${s.name} 的地面防禦癱瘓 ${SM_RAID_T} 週`, 'good'); }
  else smLog(S, `突襲 ${s.name} 失敗，特戰小隊撤離`, 'bad');
}
// 自動代打用：任務勝率＝A²/(A²+D²)
function smRaidAuto(S, s) {
  if (!smRaidInfiltrate(S, s)) return false;
  const A = (20 + 6 * Math.max(S.pl.mil, S.pl.gov + 1)) , D = (s.gar * 0.5 + s.def * 4) * (smWxOn(S, s, 'solar') ? 0.8 : 1) * 0.4, ok = smRnd(S) < A * A / (A * A + D * D);
  smRaidResult(S, s, ok); return ok;
}
