// ═══════════════════════ 艦長生涯：星球建設與經營（2026-11-17，企劃第五節） ═══════════════════════
// 兩層建築，互不衝突：
//   勢力的建築 s.bd＝[{ id, k, lv, inv, tk, raze }]：上級（AI）照 CP_B 蓋（地表 at:'g'、軌道 at:'o'）；你可以出錢強化到 Lv2／Lv3（inv＝你出的錢），好處一半給勢力、一半給你。
//   你的建築   s.pv＝[{ id, k, cost, tk, off, raze }]：私人區塊（地表、軌道各幾格），蓋在己方星系（數量照軍階）或中立星系（照中立好感度）。
// 星系的舊欄位照建築算出來（cpSync）：s.yard、s.depot（有沒有在運作的船塢、補給站）、s.def0（地面防禦＝原本的地面防禦 s.gd0＋守備營、防空陣地＋戰時動員−暴動）、
//   ccDefBase（軌道防禦＝防禦站、防禦平台、艦載機平台）。所以船塢、補給站被炸掉以後可以重建。
// 每週：人口、繁榮成長（繁榮兼民心，<20 暴動、回到 30 才平息）；建設佇列（一個星系勢力一條、你一條，一次一件）；
//   收入＝人口 ×（0.4＋繁榮/100）× CP_RULE.incK ＋ 建築收入 − 維護（取代原本的 30＋等級×25）；勢力照 cpAiBuild 建設。
// 星系失守：建築先「接管中」（誰都不能用），勢力建築要 Lv 週、你的建築要建造週數（強化過的 +1）；接管完成前你可以下令破壞，
//   拿回你出的錢 × 返還比例（30%，研發「焦土協定」50／80／100%）；接管完成前奪回來＝原樣還你。
// 中立：中立勢力也收入、建設（防禦為主）；AI 進攻中立星系要更高的勝率（CP_RULE.neuAtk）。中立星系的私人建築照中立好感度（CP_NEU_FAV）。
// 中立的委託任務（星際商會）：護送商船、救援商船、摧毀黑市補給站（type 'op'，M.neu）、驅逐入侵者（type 'neu'）。
const CP_RULE = {
  incK: 26,                 // 收入：人口 ×（0.4＋繁榮/100）× incK
  reserve: 900, reserveN: 250,   // AI 建設只花超過這個數字的錢（造船優先）
  aiOrders: 3,              // 每個勢力每週最多開工幾件
  upK: [0, 0, 0.6, 1.2], upW: [0, 0, 2, 3],   // 強化：建築價錢 ×、週數（到 Lv2、Lv3）
  raze: [0.3, 0.5, 0.8, 1], // 破壞的返還比例（焦土協定 0～3）
  tax: { own: 0.3, neu: 0.2 },   // 你的建築的稅（給星系的擁有者）
  pvRank: [1, 2, 4, 6],     // 己方星系能蓋幾座你的建築（照軍階；據點的不算）
  neuAtk: 0.3,              // AI 進攻中立星系：勝率門檻多這麼多
  neuAtkP: 0.006,           // 而且每個小隊每週只有這個機率考慮進攻中立星系（×難度的積極度）
  neuSiege: 2,              // 中立星系的圍城多幾週（而且不會直接投降）
  hitP: 12,                 // 最近 3 週有戰鬥：繁榮目標 −12
  riot: [20, 30],           // 繁榮低於 20 暴動，回到 30 平息
  capHit: 20, raidHit: 15,  // 剛佔領繁榮 −20；地面突襲攻下再 −15、毀掉 1～2 個地表建築
  mob: { inc: 0.8, prosp: 5 },   // 戰時動員（前線）：地面防禦 +1、收入 ×0.8、繁榮目標 −5
  aiRaze: 0.3,              // AI 失守時，Lv2 以上的建築被它自己破壞的機率
  seize: 0.2,               // 中立好感度 <30：你在中立星系的建築每週被查封的機率
};
const CP_SLOTS_G = [2, 3, 4, 6, 8];   // 地表區塊（照等級）
const cpSlotsO = (s) => (s.cap ? 8 : 5 + (s.size || 0));   // 軌道區塊（照星系大小）
// 勢力的建築。perk＝你強化後（Lv2／Lv3）的好處說明；fac＝勢力得到的
const CP_B = {
  home: { at: 'g', name: '住宅區', cost: 200, w: 1, up: 5, desc: '人口上限 +2（每級）', fac: '人口上限再 +2', perk: '—（人口多，你的商行收入也多）' },
  ind: { at: 'g', name: '工業區', cost: 350, w: 2, up: 10, inc: 25, desc: '收入 +25；這個星系造船、改裝便宜 15%；繁榮目標 −3', fac: '收入 +20／+40%', perk: '分紅：每週這個星系總收入的 8／15%' },
  port: { at: 'g', name: '商業港', cost: 400, w: 2, up: 10, desc: '收入 +人口×3；繁榮目標 +4', fac: '收入 +20／+40%', perk: '分紅：每週這個星系總收入的 8／15%' },
  gar: { at: 'g', name: '守備營', cost: 250, w: 1, up: 10, gd: 1, desc: '地面防禦 +1（每級）', fac: '地面防禦再 +1', perk: '投降評分：你的陣營的聲望多算一次' },
  aa: { at: 'g', name: '防空陣地', cost: 300, w: 2, up: 12, gd: 1, desc: '地面防禦 +1（每級）；敵方對這裡的特戰、地面突襲成功率 −10', fac: '地面防禦再 +1', perk: '投降評分：你的陣營的聲望多算一次' },
  lab: { at: 'g', name: '研究所', cost: 450, w: 3, up: 15, desc: '勢力的研發加快', fac: '勢力的研發再加快', perk: '每週 +4／+8 研究點數' },
  intel: { at: 'g', name: '情報中心', cost: 350, w: 2, up: 10, desc: '你的陣營看得到相鄰的星系', fac: '—', perk: '情報範圍 2 個航道' },
  yard: { at: 'o', name: '維修船塢', cost: 900, w: 3, up: 20, desc: '修理、造船、改裝', fac: '每週修理量 +20／+40%', perk: '你修理、改裝便宜 20／35%' },
  depot: { at: 'o', name: '補給站', cost: 300, w: 1, up: 8, desc: '補飛彈', fac: '補給線被切斷時仍補飛彈', perk: '你補飛彈半價／免費' },
  orb: { at: 'o', name: '軌道防禦站', cost: 600, w: 2, up: 15, def: 1, desc: '防禦戰的大型砲台', fac: '耐久 +20／+40%', perk: '—' },
  plat: { at: 'o', name: '防禦平台', cost: 250, w: 1, up: 6, def: 1, desc: '防禦戰的砲台', fac: '耐久 +20／+40%', perk: '—' },
  hangar: { at: 'o', name: '艦載機平台', cost: 500, w: 2, up: 12, def: 1, desc: '防禦戰時放出戰機', fac: '耐久 +20／+40%', perk: '—' },
};
const CP_B_ORDER = ['home', 'ind', 'port', 'gar', 'aa', 'lab', 'intel', 'yard', 'depot', 'orb', 'plat', 'hangar'];
// 你的建築（私人區塊）。neu＝只能蓋在中立星系；fav＝中立星系要的好感度；tech＝要先研究
const CP_PV = {
  plab: { at: 'g', name: '私人研究室', cost: 400, w: 2, up: 12, fav: 70, tech: 'lab', desc: '每週 +5 研究點數（要先研究「研究所」）' },
  shop: { at: 'g', name: '商行', cost: 450, w: 2, up: 5, fav: 50, desc: '每週收入 40＋人口×4（繳稅給星系的擁有者）' },
  crew: { at: 'g', name: '船員招募處', cost: 350, w: 2, up: 10, fav: 70, desc: '在這個星系造的船起始經驗 +30' },
  safe: { at: 'g', name: '安全屋', cost: 300, w: 1, up: 6, fav: 50, neu: 1, desc: '從這裡或相鄰的星系出擊的特戰任務成功率 +8（只能蓋在中立星系）' },
  pdock: { at: 'o', name: '私人船台', cost: 700, w: 2, up: 15, fav: 85, desc: '這個星系的船塢多一條只給你用的船台（要有維修船塢）' },
  store: { at: 'o', name: '倉庫', cost: 250, w: 1, up: 5, fav: 30, desc: '你的小隊在這裡補飛彈（不用補給站）' },
  listen: { at: 'o', name: '監聽站', cost: 300, w: 1, up: 8, fav: 30, desc: '這個星系與相鄰的星系永遠看得到（不受戰爭迷霧）' },
};
const CP_PV_ORDER = ['shop', 'plab', 'crew', 'safe', 'store', 'listen', 'pdock'];
// 中立好感度 → 中立星系總共能蓋幾座、每個中立星系最多幾座
const CP_NEU_FAV = [[0, 0, 0, '敵視'], [30, 1, 1, '冷淡'], [50, 3, 1, '友好'], [70, 5, 2, '信任'], [85, 8, 2, '盟友']];
const cpNeuTier = (S) => { const v = ccFavOf(S, SM_N); let r = CP_NEU_FAV[0]; for (const x of CP_NEU_FAV) if (v >= x[0]) r = x; return r; };

const cpAct = (b) => !b.tk && !b.off;
const cpBd = (s, k) => (s.bd || []).filter((b) => b.k === k && cpAct(b));
const cpLv = (s, k) => cpBd(s, k).reduce((a, b) => Math.max(a, b.lv), 0);   // 最高的等級（0＝沒有）
const cpPv = (s, k) => (s.pv || []).filter((p) => p.k === k && cpAct(p));
const cpMine = (S, s) => s.owner === S.fac;   // 你的陣營的星系：強化的好處才給你
const cpName = (k) => (CP_B[k] || CP_PV[k] || { name: k === 'city' ? '都市升級' : k }).name;

// ───── 初始化（新局、舊存檔）─────
function cpInit(S, s) {
  if (s.bd) return;
  s.gd0 = s.def0 != null ? s.def0 : s.def;
  s.bd = []; s.pv = []; s.bq = []; s.pq = []; s.hit = -99; s.yard0 = !!s.yard;
  const add = (k) => s.bd.push({ id: S.nextId++, k, lv: 1, inv: 0 });
  for (const t of ccDefBase0(s)) add(t);
  if (s.yard) add('yard'); if (s.depot) add('depot');
  // 開局的地表建築：首都齊全，其他照等級（決定論：照星系編號）
  const h = (n) => ((Math.imul(s.id + 7, 2654435761) >>> (n * 3)) & 7) / 8;
  const want = s.cap ? ['home', 'ind', 'port', 'lab', 'intel', 'gar'] : s.owner === SM_N ? (h(1) < 0.5 ? ['port'] : []) : s.owner === SM_P ? ['gar']
    : s.tier >= 2 ? [h(1) < 0.5 ? 'ind' : 'port', h(2) < 0.5 ? 'home' : 'gar'] : h(1) < 0.5 ? [h(2) < 0.5 ? 'ind' : 'home'] : [];
  for (const k of want) if (cpFree(s, 'g') > 0) add(k);
  cpSync(S, s);
}
// 區塊：剩幾格（排隊中、還沒蓋好的也算）
function cpFree(s, at) {
  const n = (at === 'g' ? CP_SLOTS_G[s.tier] : cpSlotsO(s));
  return n - s.bd.filter((b) => CP_B[b.k].at === at).length - (s.bq || []).filter((o) => !o.bid && CP_B[o.k] && CP_B[o.k].at === at).length;
}
// 地面防禦、船塢、補給站、軌道防禦的強度（照建築）
function cpGround(s) {
  return Math.max(0, (s.gd0 || 0) + s.bd.filter((b) => cpAct(b) && CP_B[b.k].gd).reduce((a, b) => a + b.lv, 0) + (s.mob ? 1 : 0) - (s.riot ? 1 : 0));
}
function cpSync(S, s) {
  if (!s.bd) return;
  s.yard = cpBd(s, 'yard').length > 0; s.depot = cpBd(s, 'depot').length > 0;
  const g0 = s.def0, g1 = cpGround(s); s.def0 = g1;
  if (g0 != null && g1 !== g0) s.def = Math.max(0, s.def + (g1 - g0));
  if (s.def > s.def0) s.def = s.def0;
  cpDefK(s);
}
// 軌道防禦：照建築的種類（防禦站排前面）；ccDefBase 用
function cpDefTypes(s) {
  const L = s.bd.filter((b) => cpAct(b) && CP_B[b.k].def).map((b) => b.k);
  return L.sort((a, b) => (a === 'orb' ? 0 : 1) - (b === 'orb' ? 0 : 1));
}
// 每座軌道防禦的耐久倍率（Lv2 ×1.2、Lv3 ×1.4）：同種類的高等級排前面
function cpDefK(s) {
  for (const t of ['orb', 'plat', 'hangar']) {
    const lv = cpBd(s, t).map((b) => b.lv).sort((a, b) => b - a);
    let i = 0; for (const d of s.defs || []) if (d.type === t) d.k = 1 + 0.2 * ((lv[i++] || 1) - 1);
  }
}
// 拿掉一座建築（任務炸掉、地面突襲）
function cpKill(S, s, k) {
  const i = s.bd.findIndex((b) => b.k === k && cpAct(b)); if (i < 0) return false;
  const b = s.bd[i]; s.bd.splice(i, 1);
  if (b.inv && cpMine(S, s)) ccLog(S, `${s.name} 的${CP_B[k].name}被摧毀：你強化的 Lv${b.lv} 一起沒了`, 'bad');
  cpSync(S, s); return true;
}

// ───── 你得到的好處（只在你的陣營的星系）─────
const cpYardRep = (s) => 1 + 0.2 * (Math.max(1, cpLv(s, 'yard')) - 1);   // AI 修船量
function cpRepK(S, s) { if (!cpMine(S, s)) return 1; const lv = cpLv(s, 'yard'); return lv >= 3 ? 0.65 : lv === 2 ? 0.8 : 1; }   // 你修理、改裝的價錢
function cpMslK(S, s) { if (!cpMine(S, s)) return 1; const lv = cpLv(s, 'depot'); return lv >= 3 ? 0 : lv === 2 ? 0.5 : 1; }
const cpIndK = (s) => (cpBd(s, 'ind').length ? 0.85 : 1);   // 工業區：造船、改裝便宜 15%
const cpStore = (S, s) => cpPv(s, 'store').length > 0;
const cpDockLines = (S, sid) => (S.sys[sid] && cpPv(S.sys[sid], 'pdock').length && S.sys[sid].yard ? 1 : 0);
function cpSafe(S, s) { return [s.id, ...S.adj[s.id]].some((j) => cpPv(S.sys[j], 'safe').length); }
// 看得到：你的陣營的情報中心（相鄰；你強化到 Lv2＝2 個航道）、你的監聽站（這個星系＋相鄰）
function cpSee(S, s) {
  for (const t of S.sys) {
    if (!t.bd) continue;
    const d = t.id === s.id ? 0 : S.adj[t.id].includes(s.id) ? 1 : 2;
    if (d <= 1 && cpPv(t, 'listen').length) return true;
    if (t.owner === S.fac) { const lv = cpLv(t, 'intel'); if (lv && (d <= 1 || (lv >= 2 && smHop(S, t.id, s.id) <= 2))) return true; }
  }
  return false;
}
// 投降評分：你強化過守備營、防空陣地（Lv2+）的己方星系，聲望多算一次
const cpFameX = (S, s) => cpMine(S, s) && (cpLv(s, 'gar') >= 2 || cpLv(s, 'aa') >= 2);
// 敵方的特戰、地面突襲打這裡：防空陣地每座 −10（最多 −20）
const cpAA = (s) => -Math.min(20, 10 * cpBd(s, 'aa').length);

// ───── 每週：成長、民心、建設、接管 ─────
function cpPopCap(s) { return SM_TIER_CAP[s.tier] + 2 * cpBd(s, 'home').reduce((a, b) => a + b.lv, 0); }
// 收入：{ g 總收入, up 維護, b: [[建築, 收入]…] }（暴動、圍城＝0；戰時動員 ×0.8；補給線切斷 ×0.5）
function cpInc(S, s) {
  const dead = s.riot || s.sg, k = (s.mob ? CP_RULE.mob.inc : 1) * (ccCut(S, s) ? 0.5 : 1);
  const base = dead ? 0 : s.pop * (0.4 + s.prosp / 100) * CP_RULE.incK * k, B = [];
  for (const b of s.bd) {
    if (!cpAct(b) || dead) continue;
    const m = 1 + 0.2 * (b.lv - 1);
    if (b.k === 'ind') B.push([b, CP_B.ind.inc * m * k]);
    if (b.k === 'port') B.push([b, s.pop * 3 * m * k]);
  }
  const up = s.bd.filter(cpAct).reduce((a, b) => a + CP_B[b.k].up, 0);
  return { base, b: B, g: base + B.reduce((a, x) => a + x[1], 0), up };
}
// 你的建築的收入（商行）
const cpShopInc = (s) => (s.riot || s.sg ? 0 : 40 + s.pop * 4);
function cpGrow(S, s) {
  const cap = cpPopCap(s);
  s.pop = smR1(Math.min(cap, Math.max(0.5, s.pop + Math.max(0.05, s.pop * 0.03 * (s.prosp / 100) * (1 - s.pop / cap)))));
  const tgt = 25 + s.tier * 12 + Math.min(s.def, 6) * 2 + (s.cap ? 10 : 0) + 4 * cpBd(s, 'port').length - 3 * cpBd(s, 'ind').length
    - (S.turn - (s.hit ?? -99) < 3 ? CP_RULE.hitP : 0) - (s.sg ? 15 : 0) - (s.mob ? CP_RULE.mob.prosp : 0) - (ccCut(S, s) ? 10 : 0);
  s.prosp = smClamp(Math.round(s.prosp + (tgt - s.prosp) * 0.15), 0, 100);
  if (!s.riot && s.prosp < CP_RULE.riot[0] && s.owner !== SM_N) { s.riot = 1; ccLog(S, `${s.name} 發生暴動（繁榮 ${s.prosp}）：收入歸零、地面防禦 −1，繁榮回到 ${CP_RULE.riot[1]} 才平息`, s.owner === S.fac ? 'bad' : ''); }
  else if (s.riot && s.prosp >= CP_RULE.riot[1]) { s.riot = 0; ccLog(S, `${s.name} 的暴動平息了`, s.owner === S.fac ? 'ok' : ''); }
}
// 建設：勢力的佇列（含你出錢的強化）、你的佇列；圍城中暫停、有敵方小隊時軌道建築暫停
function cpBuildTick(S, s) {
  const foe = S.sq.some((q) => q.sys === s.id && q.ships.length && ccHostile(S, q.fac, s.owner));
  const o = s.bq[0];
  if (o && !s.sg && !(foe && (o.k === 'city' ? false : CP_B[o.k].at === 'o'))) {
    if (--o.left <= 0) {
      s.bq.shift();
      if (o.k === 'city') { if (s.tier < 4) { s.tier++; if (s.owner === S.fac) ccLog(S, `${s.name} 升級為${SM_TIER[s.tier]}（地表區塊 ${CP_SLOTS_G[s.tier]} 格）`, 'ok'); } }
      else if (o.bid) { const b = s.bd.find((x) => x.id === o.bid); if (b && cpAct(b)) { b.lv = o.lv; b.inv = (b.inv || 0) + (o.pay || 0); if (o.pay) ccLog(S, `${s.name} 的${CP_B[b.k].name}強化到 Lv${b.lv}（${CP_B[b.k].perk}）`, 'ok'); } }
      else { s.bd.push({ id: S.nextId++, k: o.k, lv: 1, inv: 0 }); if (s.owner === S.fac && (o.k === 'yard' || s.id === S.pl.base)) ccLog(S, `${s.name} 蓋好${CP_B[o.k].name}`, 'ok'); }
      cpSync(S, s);
    }
  }
  const p = s.pq[0];
  if (p && !s.sg && (s.owner === S.fac || s.owner === SM_N) && !(foe && CP_PV[p.k].at === 'o')) {
    if (--p.left <= 0) { s.pq.shift(); s.pv.push({ id: S.nextId++, k: p.k, cost: p.cost }); ccLog(S, `你在 ${s.name} 的${CP_PV[p.k].name}蓋好了（${CP_PV[p.k].desc}）`, 'ok'); }
  }
}
// 失守：接管（每週先處理破壞、再倒數）；ccSiege 之前呼叫，所以佔領的那一週不會倒數，你至少有一週可以下令破壞
function cpTakeTick(S) {
  const K = cpRazeK(S);
  for (const s of S.sys) {
    if (!s.bd) continue;
    for (const b of s.bd.slice()) {
      if (!b.tk) continue;
      if (b.raze) { s.bd.splice(s.bd.indexOf(b), 1); const back = Math.round((b.inv || 0) * K); S.pl.money += back; ccLog(S, `你破壞了 ${s.name} 的${CP_B[b.k].name}（Lv${b.lv}），拿回 ${back} 資金（${Math.round(K * 100)}%）`, 'ok'); continue; }
      if (s.owner !== b.tk.f) continue;
      if (--b.tk.left <= 0) { const mine = b.inv && b.tk.from === S.fac; b.tk = null; if (mine) { ccLog(S, `${SM_FAC[s.owner].name}接管了 ${s.name} 的${CP_B[b.k].name}（你強化的 Lv${b.lv} 歸他們了）`, 'bad'); b.inv = 0; } }
    }
    for (const p of s.pv.slice()) {
      if (!p.tk) continue;
      if (p.raze) { s.pv.splice(s.pv.indexOf(p), 1); const back = Math.round(p.cost * K); S.pl.money += back; ccLog(S, `你破壞了自己在 ${s.name} 的${CP_PV[p.k].name}，拿回 ${back} 資金（${Math.round(K * 100)}%）`, 'ok'); continue; }
      if (s.owner !== p.tk.f) continue;
      if (--p.tk.left <= 0) { s.pv.splice(s.pv.indexOf(p), 1); ccLog(S, `${SM_FAC[s.owner].name}接管了你在 ${s.name} 的${CP_PV[p.k].name}`, 'bad'); }
    }
    cpSync(S, s);
  }
}
const cpRazeK = (S) => CP_RULE.raze[ccHas(S, 'scorch3') ? 3 : ccHas(S, 'scorch2') ? 2 : ccHas(S, 'scorch1') ? 1 : 0];
// 佔領時（ccCapture）：繁榮下降、地面突襲毀掉地表建築、AI 自己破壞、建築進入接管、排隊取消
function cpCapture(S, s, was, f, raid) {
  if (!s.bd) return;
  s.prosp = Math.max(0, s.prosp - CP_RULE.capHit - (raid ? CP_RULE.raidHit : 0)); s.riot = 0; s.mob = 0;
  if (raid) {
    const G = s.bd.filter((b) => CP_B[b.k].at === 'g');
    for (let n = 1 + (smRnd(S) < 0.5 ? 1 : 0); n > 0 && G.length; n--) { const b = G.splice(Math.floor(smRnd(S) * G.length), 1)[0]; s.bd.splice(s.bd.indexOf(b), 1); ccLog(S, `${s.name}：地面突襲中${CP_B[b.k].name}被毀${b.inv && was === S.fac ? `（你強化的 Lv${b.lv}）` : ''}`, was === S.fac ? 'bad' : ''); }
  }
  for (const b of s.bd.slice()) {
    if (b.tk && b.tk.from === f) { b.tk = null; if (b.inv && f === S.fac) ccLog(S, `奪回 ${s.name}：你強化的${CP_B[b.k].name}原樣還你`, 'ok'); continue; }   // 接管完成前奪回
    if (!b.tk && was !== S.fac && was !== SM_N && b.lv >= 2 && smRnd(S) < CP_RULE.aiRaze) { s.bd.splice(s.bd.indexOf(b), 1); continue; }   // AI 撤退前自己破壞
    if (!b.tk && was === S.fac && !b.inv && b.lv >= 2 && smRnd(S) < CP_RULE.aiRaze) { s.bd.splice(s.bd.indexOf(b), 1); continue; }
    b.tk = { f, from: b.tk ? b.tk.from : was, left: b.lv };
  }
  for (const p of s.pv) {
    if (f === S.fac) { if (p.tk) { p.tk = null; ccLog(S, `${s.name} 回到你的陣營：你的${CP_PV[p.k].name}原樣還你`, 'ok'); } continue; }
    if (!p.tk) p.tk = { f, left: CP_PV[p.k].w };
  }
  const back = s.bq.reduce((a, o) => a + Math.round((o.pay || 0) * 0.5), 0) + (f === S.fac ? 0 : s.pq.reduce((a, o) => a + Math.round(o.cost * 0.5), 0));
  if (back) { S.pl.money += back; ccLog(S, `${s.name} 易主：你在那裡排隊的建設取消，退回 ${back} 資金`, 'bad'); }
  s.bq = []; if (f !== S.fac) s.pq = [];
  if (was === SM_N && ccAt(S, s.id).some((q) => q.pl)) { ccFav(S, SM_N, -15); ccLog(S, `你參與佔領中立的 ${s.name}：中立好感度 −15（${Math.round(ccFavOf(S, SM_N))}）`, 'bad'); }
  cpSync(S, s);
}
// 中立好感度：太低＝查封；比能蓋的數量多＝多的停止運作；商行每週 +0.5（最多 +2）
function cpNeuTick(S) {
  const T = cpNeuTier(S), L = S.sys.filter((s) => s.owner === SM_N && s.pv).flatMap((s) => s.pv.filter((p) => !p.tk).map((p) => [s, p]));
  if (T[1] === 0) for (const [s, p] of L) if (smRnd(S) < CP_RULE.seize) { s.pv.splice(s.pv.indexOf(p), 1); ccLog(S, `中立好感度太低：你在 ${s.name} 的${CP_PV[p.k].name}被查封`, 'bad'); }
  const live = L.filter(([s, p]) => s.pv.includes(p));
  live.forEach(([s, p], i) => (p.off = i >= T[1] ? 1 : 0));
  const shops = live.filter(([s, p]) => p.k === 'shop' && !p.off).length; if (shops) ccFav(S, SM_N, Math.min(2, shops * 0.5));
}

// ───── 你的投資：強化勢力的建築、蓋自己的建築、破壞 ─────
const cpHere = (S, s) => S.sq.some((q) => q.pl && q.ships.length && q.sys === s.id) || S.pl.base === s.id;
function cpUpWhy(S, s, b) {
  if (s.owner !== S.fac) return '只能強化你的陣營的建築';
  if (!cpAct(b)) return b.tk ? '接管中' : '停止運作';
  if (b.lv >= 3) return '已經是 Lv3';
  if (s.bq.some((o) => o.bid === b.id)) return '已經在排隊強化';
  if (s.sg) return '圍城中不能施工';
  if (!cpHere(S, s)) return '要有你的小隊在這裡（或是你的據點）';
  if (S.pl.money < cpUpCost(b)) return `資金不夠（要 ${cpUpCost(b)}）`;
  return '';
}
const cpUpCost = (b) => Math.round(CP_B[b.k].cost * CP_RULE.upK[b.lv + 1]);
function cpUp(S, s, b) {
  const why = cpUpWhy(S, s, b); if (why) return why;
  const c = cpUpCost(b), w = CP_RULE.upW[b.lv + 1]; S.pl.money -= c;
  s.bq.unshift({ k: b.k, bid: b.id, lv: b.lv + 1, left: w, tot: w, pay: c });   // 你出錢的強化排在最前面
  ccLog(S, `出資強化 ${s.name} 的${CP_B[b.k].name}到 Lv${b.lv + 1}（${c} 資金，${w} 週）`, 'ok');
  S.pl.merit += 10; ccFav(S, S.fac, 1);   // 上級記得：小量戰功、好感度
  return '';
}
// 你在己方星系、中立星系能蓋幾座、已經蓋（或排隊）幾座
function cpPvCount(S, neu) {
  return S.sys.reduce((a, s) => a + (s.pv && (s.owner === SM_N) === neu && (neu || s.id !== S.pl.base) ? s.pv.length + s.pq.length : 0), 0);
}
const cpPvCap = (S, neu) => (neu ? cpNeuTier(S)[1] + (S.pl.neuBonus || 0) : CP_RULE.pvRank[S.pl.rank || 0]);
function cpPvSlots(S, s, at) {   // 這個星系你的區塊（地表、軌道各幾格）
  if (s.owner === SM_N) return at === 'g' || at === 'o' ? cpNeuTier(S)[2] : 0;   // 中立：合計上限（地表＋軌道）
  return (at === 'g' ? (s.tier >= 2 ? 2 : 1) : 1) + (s.id === S.pl.base ? 1 : 0);
}
function cpPvWhy(S, s, k) {
  const P = CP_PV[k], neu = s.owner === SM_N;
  if (!neu && s.owner !== S.fac) return '只能蓋在你的陣營或中立的星系';
  if (P.neu && !neu) return '只能蓋在中立星系';
  if (P.tech && !ccHas(S, P.tech)) return `要先研究${CC_TECH[P.tech].name}`;
  if (k === 'pdock' && !s.yard) return '這裡要有維修船塢';
  if (neu && ccFavOf(S, SM_N) < P.fav) return `中立好感度要 ${P.fav}（現在 ${Math.round(ccFavOf(S, SM_N))}）`;
  if (s.sg) return '圍城中不能施工';
  if (s.pq.length) return '這個星系你一次只能蓋一件';
  const mine = s.pv.length + s.pq.length;
  if (neu) { if (mine >= cpPvSlots(S, s, 'g')) return `中立星系每個最多 ${cpPvSlots(S, s, 'g')} 座（${cpNeuTier(S)[3]}）`; }
  else if (s.pv.concat(s.pq).filter((x) => CP_PV[x.k].at === P.at).length >= cpPvSlots(S, s, P.at)) return `這裡你的${P.at === 'g' ? '地表' : '軌道'}區塊滿了`;
  if ((neu || s.id !== S.pl.base) && cpPvCount(S, neu) >= cpPvCap(S, neu)) return neu ? `中立星系你總共只能蓋 ${cpPvCap(S, true)} 座（中立好感度：${cpNeuTier(S)[3]}）` : `${ccRankOf(S).name}在己方星系最多蓋 ${cpPvCap(S, false)} 座（據點的不算）`;
  if (s.pv.some((p) => p.k === k) || s.pq.some((p) => p.k === k)) return '這裡已經有了';
  if (!cpHere(S, s)) return '要有你的小隊在這裡（或是你的據點）';
  if (S.pl.money < P.cost) return `資金不夠（要 ${P.cost}）`;
  return '';
}
function cpPvBuild(S, s, k) {
  const why = cpPvExt(S, s, k); if (why) return why;
  const P = CP_PV[k]; S.pl.money -= P.cost; s.pq.push({ k, left: P.w, tot: P.w, cost: P.cost });
  ccLog(S, `在 ${s.name} 蓋${P.name}（${P.cost} 資金，${P.w} 週）`, 'ok'); return '';
}
const cpPvExt = (S, s, k) => cpPvWhy(S, s, k);
function cpPvDemolish(S, s, id) {
  const p = s.pv.find((x) => x.id === id); if (!p || p.tk) return '接管中：要用「破壞」';
  s.pv.splice(s.pv.indexOf(p), 1); const back = Math.round(p.cost * 0.25); S.pl.money += back;
  ccLog(S, `拆掉你在 ${s.name} 的${CP_PV[p.k].name}（退回 ${back}）`, ''); return '';
}
function cpRazeWhy(S, s, b, pv) { if (!b.tk) return '只有接管中的建築可以破壞'; if (!pv && !b.inv) return '你沒有出資強化這座'; return ''; }
function cpRaze(S, s, id, pv, undo) {
  const b = (pv ? s.pv : s.bd).find((x) => x.id === id); if (!b) return '沒有這座建築';
  const why = cpRazeWhy(S, s, b, pv); if (why) return why;
  b.raze = undo ? 0 : 1; return '';
}

// ───── 勢力（AI）的建設 ─────
function cpAiPick(S, s, f) {
  const n = (k) => s.bd.filter((b) => b.k === k).length + s.bq.filter((o) => o.k === k && !o.bid).length;
  const g = cpFree(s, 'g') > 0, o = cpFree(s, 'o') > 0, front = smFront(S, s), cap = cpPopCap(s);
  const defN = s.bd.filter((b) => CP_B[b.k].def).length + s.bq.filter((x) => !x.bid && CP_B[x.k] && CP_B[x.k].def).length;
  if (f === SM_N) {
    if (g && n('gar') < 1) return 'gar';
    if (o && defN < (s.tier >= 2 ? 3 : 2)) return 'plat';
    if (g && n('aa') < 1 && s.tier >= 1) return 'aa';
    if (g && n('port') < 1) return 'port';
    return null;
  }
  if (o && !n('yard') && (s.yard0 || (s.tier >= 2 && !S.sys.some((t) => t.owner === f && t.yard && smHop(S, t.id, s.id) <= 2)))) return 'yard';
  if (o && !n('depot') && (front || s.tier >= 2) && f !== SM_P) return 'depot';
  if (front) {
    if (g && n('gar') < 1) return 'gar';
    if (o && defN < (s.tier >= 2 ? 3 : 2)) return s.tier >= 2 && !n('orb') ? 'orb' : 'plat';
    if (g && n('aa') < 1 && f !== SM_P) return 'aa';
    if (o && f !== SM_P && s.tier >= 2 && !n('hangar')) return 'hangar';
    if (g && f !== SM_P && s.tier >= 2 && !n('intel')) return 'intel';
  }
  if (s.tier < 4 && s.pop >= SM_TIER_CAP[s.tier] * 0.7 && !front && !s.bq.some((x) => x.k === 'city')) return 'city';
  if (g && s.pop >= cap * 0.85) return 'home';
  if (f === SM_P) return g && n('gar') < 2 ? 'gar' : o && defN < 2 ? 'plat' : null;
  const labs = S.sys.filter((t) => t.owner === f && t.bd && t.bd.some((b) => b.k === 'lab')).length, own = S.sys.filter((t) => t.owner === f).length;
  if (g && s.tier >= 2 && !n('lab') && labs < Math.ceil(own / 6)) return 'lab';
  if (g) return n('ind') <= n('port') ? 'ind' : 'port';
  if (o && defN < 2) return 'plat';
  return null;
}
const cpCost = (s, k) => (k === 'city' ? 250 * (s.tier + 1) : CP_B[k].cost);
const cpW = (k) => (k === 'city' ? 3 : CP_B[k].w);
function cpAiBuild(S, f) {
  const own = S.sys.filter((s) => s.owner === f && s.bd && !s.sg && !s.bq.length);
  const res = f === SM_N ? CP_RULE.reserveN : CP_RULE.reserve;
  own.sort((a, b) => (smFront(S, b) ? 1 : 0) - (smFront(S, a) ? 1 : 0) || (b.yard0 && !b.yard ? 1 : 0) - (a.yard0 && !a.yard ? 1 : 0));
  for (let i = 0, made = 0; i < own.length && made < CP_RULE.aiOrders; i++) {
    const s = own[i], k = cpAiPick(S, s, f); if (!k) continue;
    const c = cpCost(s, k); if (S.money[f] - c < res) continue;
    S.money[f] -= c; s.bq.push({ k, left: cpW(k), tot: cpW(k), pay: 0 }); made++;
  }
}
// 每週（ccEconomy 呼叫）：成長、動員、建設、收入（勢力與你的）、AI 的建設與研究所
function cpWeek(S) {
  const inc = [0, 0, 0, 0], I = { sal: CC_RULE.salary, div: 0, pv: 0, up: 0, tax: 0, rp: 0 };
  for (const s of S.sys) {
    if (!s.bd) cpInit(S, s);
    s.mob = s.owner !== SM_N && smFront(S, s) && S.adj[s.id].some((j) => ccHostile(S, s.owner, S.sys[j].owner) && S.sys[j].owner !== SM_N) ? 1 : 0;
    cpGrow(S, s); cpBuildTick(S, s); cpSync(S, s);
    const R = cpInc(S, s), f = s.owner;
    inc[f] += (R.g - R.up) * (f !== S.fac && f !== SM_N ? CC_DIFF[S.diff].aggr : 1);
    if (cpMine(S, s)) for (const b of s.bd) if ((b.k === 'ind' || b.k === 'port') && cpAct(b) && b.lv >= 2 && b.inv) I.div += R.g * (b.lv >= 3 ? 0.15 : 0.08);   // 分紅：這個星系總收入的 8／15%
    // 你的建築：商行收入（繳稅）、維護
    for (const p of s.pv || []) {
      if (!cpAct(p)) continue;
      I.up += CP_PV[p.k].up;
      if (p.k === 'shop') { const v = cpShopInc(s), t = s.owner === SM_N ? CP_RULE.tax.neu : CP_RULE.tax.own; I.pv += v * (1 - t); I.tax += v * t; inc[f] += v * t; }
      if (p.k === 'plab') I.rp += 5;
    }
    if (cpMine(S, s)) { const lv = cpLv(s, 'lab'); if (lv >= 2 && s.bd.some((b) => b.k === 'lab' && b.inv)) I.rp += lv >= 3 ? 8 : 4; }
    for (const b of s.bd) if (b.k === 'lab' && cpAct(b) && f !== SM_N) ccAiR(S, f).rp += 1.5 * b.lv;
  }
  for (const f of [SM_A, SM_E, SM_P, SM_N]) S.money[f] = Math.max(0, (S.money[f] || 0) + inc[f]);
  S.inc = inc.map(Math.round);
  const net = Math.round(I.div + I.pv - I.up); S.pl.money = Math.max(0, S.pl.money + net);
  if (I.rp) ccRpGain(S, I.rp, '研究所、私人研究室');
  S.pl.inc = { sal: I.sal, div: Math.round(I.div), pv: Math.round(I.pv), up: Math.round(I.up), tax: Math.round(I.tax), rp: I.rp };
  for (const f of [SM_A, SM_E, SM_P, SM_N]) cpAiBuild(S, f);
  cpNeuTick(S);
}

// ───── 中立的委託任務（星際商會）─────
const CP_NEU_NPC = '星際商會的伊蓮・索羅';
const CP_NEU_REW = { escort: [350, 4], rescue: [400, 5], strike: [380, 4], expel: [420, 5] };
function cpNeuGen(S) {
  const P = ccPl(S); if (!P || S.fin || ccFavOf(S, SM_N) < 30) return;
  if (S.missions.some((M) => M.state === 'open' && M.from === SM_N)) return;
  const near = (n) => S.sys.filter((s) => s.owner === SM_N && smHop(S, P.sys, s.id) <= n);
  const taken = (sid) => S.missions.some((M) => M.state === 'open' && M.sys === sid);
  const C = [];
  for (const s of near(2)) {
    if (taken(s.id)) continue;
    const foe = ccAt(S, s.id).find((q) => q.fac !== SM_N && q.fac !== S.fac && ccHostile(S, S.fac, q.fac));
    if (foe) C.push({ type: 'neu', op: 'expel', sys: s.id, sq: foe.id });
    C.push({ type: 'op', op: 'escort', sys: s.id });
  }
  for (const s of near(3)) if (!taken(s.id)) C.push({ type: 'op', op: 'rescue', sys: s.id });
  for (const s of S.sys.filter((t) => t.owner === SM_P && t.depot && smHop(S, P.sys, t.id) <= 3 && S.adj[t.id].some((j) => S.sys[j].owner === SM_N))) if (!taken(s.id)) C.push({ type: 'op', op: 'strike', sys: s.id, tgt: 'depot' });
  if (!C.length) return;
  const exp = C.find((c) => c.op === 'expel'), c = exp && smRnd(S) < 0.7 ? exp : C[Math.floor(smRnd(S) * C.length)];
  const R = CP_NEU_REW[c.op], k = ccFavK(S, SM_N);
  S.missions.push({ id: S.nextId++, ...c, neu: 1, from: SM_N, due: S.turn + 4 + smHop(S, P.sys, c.sys), state: 'open', reward: { money: Math.round(R[0] * k), merit: 0, fav: R[1] }, t0: S.turn });
  const M = S.missions[S.missions.length - 1];
  ccLog(S, `新委託（${CP_NEU_NPC}）：${CC_MIS[M.type].desc(S, M)}・報酬 ${M.reward.money} 資金、中立好感度 +${R[1]}`, 'ev');
}
// 驅逐入侵者：這週結束時目標小隊不在那個星系（擊沉或撤走）、而且你的小隊在那裡＝完成
function cpNeuTick2(S) {
  for (const M of S.missions) {
    if (M.state !== 'open' || !M.neu) continue;
    const s = S.sys[M.sys];
    if (s.owner !== SM_N && M.op !== 'strike') { M.state = 'gone'; ccLog(S, `${s.name} 已經不是中立星系：星際商會的委託取消`, ''); continue; }
    if (M.op === 'strike' && s.owner !== SM_P) { M.state = 'gone'; ccLog(S, `${s.name} 已經易主：星際商會的委託取消`, ''); continue; }
    if (M.type === 'neu') {
      const q = S.sq.find((x) => x.id === M.sq), plHere = ccAt(S, s.id).some((x) => x.pl);
      if ((!q || !q.ships.length || q.sys !== s.id) && plHere) ccMissionDone(S, M, true);
      else if (!q || !q.ships.length || q.sys !== s.id) { M.state = 'gone'; ccLog(S, `入侵者離開了 ${s.name}：星際商會的委託取消`, ''); }
    }
  }
}
function cpNeuDone(S, M) {
  ccFav(S, SM_N, (M.reward.fav || 3) - CC_RULE.fav.ok);   // ccMissionDone 已經 +2
  let t = `中立好感度 +${M.reward.fav || 3}（${Math.round(ccFavOf(S, SM_N))}）`;
  if (smRnd(S) < 0.25) { S.pl.neuBonus = (S.pl.neuBonus || 0) + 1; t += `・星際商會給你中立星系的優先權：能多蓋一座（不受好感度上限）`; }
  return t;
}

// ───── 測試用：玩家自動投資（tools/capcareer-run.mjs --auto）─────
function cpAuto(S) {
  for (const s of S.sys) {
    if (!s.bd || !cpHere(S, s)) continue;
    if (S.pl.money > 1600) { const b = s.bd.find((x) => ['yard', 'port', 'ind', 'lab', 'depot'].includes(x.k) && !cpUpWhy(S, s, x)); if (b) cpUp(S, s, b); }
    if (S.pl.money > 1200) for (const k of CP_PV_ORDER) if (!cpPvWhy(S, s, k)) { cpPvBuild(S, s, k); break; }
  }
}
const CP_API = { auto: cpAuto };
