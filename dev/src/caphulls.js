// ═══════════════════════ 艦長：新船型（艦長生涯第 7 階段：升遷解鎖） ═══════════════════════
// 匿蹤艦：船身難偵測（偵測距離 ×stealth）；技能「匿蹤」＝一段時間完全隱形，敵軍失去位置（knownT 歸零），開火、掃描會解除（capSig）。
// 電戰艦：技能「電子干擾」＝一段時間內，周圍的友艦受到的傷害降低（capHurt），範圍內的敵方偵測失效（capDetect）。
// 勝率、存活率公式的艦種係數是暫定值（還沒用 AI 對 AI 實戰校正）。
Object.assign(CAP_HULLS, {
  ew: { name: '電戰艦', en: 'EW', look: 2, hp: 380, sh: 240, cruise: 6.8, max: 10.5, acc: 2.5, strafe: 3.2, climb: 3, turn: 21, boostT: 5,
    main: { name: '脈衝砲', dmg: 16, cd: 1.1, range: 210, spd: 280, arc: 120, trav: 80 },
    tur: { n: 2, dmg: 6, cd: 1.4, range: 170, acc: 0.85 }, pd: { n: 3, dmg: 2, cd: 0.4, far: 80, acc: 0.8 },
    msl: { n: 16, dmg: 35, range: 270, lockT: 1.1, cd: 0.5 },
    skill: { key: 'jam', name: '電子干擾', cd: 35, dur: 8, r: 320, cut: 0.35 },
    desc: '火力普通，靠干擾保護小隊。技能：電子干擾（8 秒內，周圍 320 內的友艦受到的傷害 −35%，範圍內的敵方雷達、偵測失效）。' },
  stealth: { name: '匿蹤艦', en: 'STEALTH', look: 4, hp: 240, sh: 120, cruise: 8.5, max: 13.5, acc: 3.4, strafe: 4.8, climb: 4.2, turn: 32, boostT: 5,
    main: { name: '穿甲魚雷砲', dmg: 42, cd: 3.2, range: 230, spd: 240, arc: 40, trav: 60 },
    tur: { n: 1, dmg: 6, cd: 1.4, range: 150, acc: 0.85 }, pd: { n: 1, dmg: 2, cd: 0.45, far: 65, acc: 0.7 },
    msl: { n: 12, dmg: 70, range: 300, lockT: 0.9, cd: 0.5 },
    skill: { key: 'cloak', name: '匿蹤', cd: 35, dur: 10 }, stealth: 0.55,
    desc: '最脆，但船身難被偵測（敵方的偵測距離 ×0.55）。技能：匿蹤（10 秒內完全隱形，敵軍失去你的位置；開火、掃描會解除）。' },
});
CAP_HULL_ORDER.push('ew', 'stealth');
Object.assign(CAP_ODDS.win.f, { ew: 1.55, stealth: 1.15 });    // 火力係數（突擊艦＝1），2026-11-10 用 538 場 AI 對戰擬合
Object.assign(CAP_ODDS.surv.b, { ew: -1.95, stealth: -2.95 }); // 存活率的艦種基準，同上

function capCloakOn(s, t) { return t < (s.cloakT || -9); }
// 技能（capSkill 呼叫）：回傳 true＝處理了
function capSkill2(s, K, t, ctl) {
  if (K.key === 'cloak') {
    s.cloakT = t + K.dur; s.cloakOn = true; s.knownT = t; s.seen = 0;
    spawnFx(s.x, s.y, s.z, fxShield(s.side), s.L * 0.6, 18);
    if (ctl) capFeed(`${K.name}！${K.dur} 秒內敵軍看不到你（開火會解除）`, 'ok');
    return true;
  }
  if (K.key === 'jam') {
    s.jamT = t + K.dur;
    spawnFx(s.x, s.y, s.z, fxShield(s.side), K.r * 0.08, 30);
    if (ctl) capFeed(`${K.name}！${K.dur} 秒內周圍的友艦受到的傷害減少、敵方偵測失效`, 'ok');
    return true;
  }
  return false;
}
// 開火、掃描（capSig）：解除匿蹤
function capCloakBreak(s, t) {
  if (!capCloakOn(s, t)) return;
  s.cloakT = t; if (s.k === CAP.cur) capFeed('開火：匿蹤解除', 'hint');
}
// 每次偵測（capDetect）：匿蹤結束時，正面交戰的戰場恢復「雙方都知道彼此」
function capCloakTick(s, t) {
  if (s.cloakOn && !capCloakOn(s, t)) { s.cloakOn = false; if (CAP.allSee) s.knownT = 1e9; }
}
// 干擾中的友艦（電戰艦）
const capJammers = (t) => CAP.own.filter((o) => !o.dead && t < (o.jamT || -9));
function capJammed(x, y, z, t) { for (const o of capJammers(t)) if (Math.hypot(o.x - x, o.y - y, o.z - z) < o.H.skill.r) return true; return false; }
// 受擊（capHurt 呼叫）：在干擾範圍內的友艦退回一部分傷害
function capJamRefund(s, ti, shD, hullD, t) {
  if (s.foe || !ships.alive[ti]) return;
  const J = capJammers(t).find((o) => Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z) < o.H.skill.r); if (!J) return;
  const c = J.H.skill.cut;
  ships.hp[ti] = Math.min(maxHp(ti), ships.hp[ti] + hullD * c); ships.sh[ti] = Math.min(ships.shMax[ti], ships.sh[ti] + shD * c);
}
// AI 用新船型的技能：匿蹤＝受傷撤離時；干擾＝交戰中被打
function capHullAI(s, t) {
  const K = s.H.skill; if (s.skillCd > 0) return;
  if (K.key === 'cloak' && ships.hp[s.i] < maxHp(s.i) * 0.45 && t - s.hitT < 2) capSkill(s, t);
  if (K.key === 'jam' && t - s.hitT < 3) capSkill(s, t);
}

// ═══════════════════════ 艦長生涯：船的等級與模組（研發、改裝的第 1 步，2026-11-14） ═══════════════════════
// 每艘船（生涯存檔的 ship 記錄）：lv＝等級 1～5、xp＝戰鬥經驗、mod＝各槽位裝的模組（沒寫＝原廠）、mk＝各槽位的 Mk 等級（沒寫＝Mk I）。
// 等級來自那艘船自己的戰鬥（參戰、存活、擊沉），船沉了就沒了。等級決定 Mk 上限（之後再跟研發到的 Mk 取低的）。
// 模組各有取捨；主砲模組換的是砲的「型式」，每秒傷害照船型原廠主砲（各船型原本就差不多），所以不會因為換砲變成另一個船型。
const CAP_SLOTS = [['main', '主砲'], ['tur', '副砲'], ['msl', '飛彈艙／機庫'], ['def', '防禦'], ['eng', '引擎']];
const CAP_MODS = {
  main: {
    rail: { name: '磁軌砲', desc: '射得快、單發輕，射界左右各 45°', p: { cd: 2.2, k: 1, range: 240, spd: 260, arc: 45, trav: 60 }, fx: { seg: 2.4, wid: 0.018, fl: 0.2, hit: 0.2, trail: 0.6 } },
    heavy: { name: '重粒子砲', desc: '一發重、射得慢、射程遠；砲塔轉得慢，射界左右各 30°', p: { cd: 6, k: 0.95, range: 320, spd: 200, arc: 30, trav: 25 }, fx: { seg: 1.9, wid: 0.085, fl: 0.6, hit: 0.5, hv: 1 } },
    rapid: { name: '速射砲', desc: '射界幾乎全方位，單發輕、射程短', p: { cd: 0.9, k: 0.85, range: 200, spd: 280, arc: 150, trav: 90 }, fx: { seg: 0.5, wid: 0.014, fl: 0.13, hit: 0.13 } },
    beam: { name: '光束砲', desc: '持續照射、每秒傷害最高，射程最短', p: { cd: 0.35, k: 1.1, range: 170, spd: 600, arc: 60, trav: 70 }, fx: { beam: 1, wid: 0.03, fl: 0.1, hit: 0.14 }, res: true },
  },
  tur: {
    heavy: { name: '重型砲塔', desc: '傷害高、射得慢、比較不準', tur: { dmg: 1.8, cd: 1.5, acc: 0.9, range: 1.1 }, fx: { seg: 0.9, wid: 0.03, fl: 0.13, hit: 0.18 } },
    aa: { name: '防空砲塔', desc: '對艦傷害低；點防禦多 2 座、攔截距離遠，專打飛彈與艦載機', tur: { dmg: 0.6 }, pdN: 2, pd: { far: 1.25 }, fx: { seg: 0.35, wid: 0, fl: 0.05, hit: 0.07 } },
  },
  msl: {
    heavy: { name: '重飛彈', desc: '數量少、一發傷害高，鎖定比較久', msl: { n: 0.4, dmg: 2.2, lockT: 1.3 } },
    swarm: { name: '蜂群飛彈', desc: '數量多、一發傷害低，鎖定快', msl: { n: 2, dmg: 0.45, lockT: 0.7 }, salvo: 3 },
    hangar: { name: '機庫', desc: '帶 6 架護航機，飛彈只剩三分之一', msl: { n: 0.35 }, ftr: 6 },
  },
  def: {
    armor: { name: '重裝甲', desc: '船體多 25%，護盾少 10%、速度慢 10%', hull: { hp: 1.25, sh: 0.9, cruise: 0.9, max: 0.9 } },
    shield: { name: '強化護盾', desc: '護盾多 35%，船體少 15%', hull: { sh: 1.35, hp: 0.85 } },
    react: { name: '反應裝甲', desc: '船體多 5%，飛彈對船體的傷害少 30%', hull: { hp: 1.05 }, mslCut: 0.3, res: true },
  },
  eng: {
    cruise: { name: '巡航引擎', desc: '均衡：巡航速度、加速都快一點', hull: { cruise: 1.1, acc: 1.05 } },
    sprint: { name: '衝刺引擎', desc: '最高速度快 20%，轉向慢 20%', hull: { max: 1.2, cruise: 1.1, acc: 1.15, turn: 0.8 } },
    agile: { name: '機動引擎', desc: '轉向快 30%、側移快，最高速度慢 10%', hull: { turn: 1.3, strafe: 1.25, climb: 1.2, max: 0.9 } },
  },
};
const CAP_MK = [1, 1, 1.1, 1.2];   // Mk I／II／III：那個槽位的主要數值倍率
const CAP_XP = { fight: 10, live: 10, lv: [0, 30, 80, 160, 300], kill: { assault: 15, stealth: 15, ew: 20, support: 20, gunship: 30 }, big: 25, small: 10, calc: 18 };
const CAP_MK_NAME = ['', 'Mk I', 'Mk II', 'Mk III'];
// 原廠模組的名字
function capModBase(H, slot) { return slot === 'main' ? H.main.name : slot === 'tur' ? '標準砲塔' : slot === 'msl' ? (H.msl ? (H.ftr ? `飛彈＋護航機 ${H.ftr} 架` : '標準飛彈') : '沒有') : slot === 'def' ? '標準裝甲' : '標準引擎'; }
function capModName(H, slot, id) { const M = id && CAP_MODS[slot][id]; return M ? M.name : capModBase(H, slot); }
const capLvOf = (xp) => CAP_XP.lv.reduce((a, v, k) => (xp >= v ? k + 1 : a), 1);
const capMkCapLv = (lv) => (lv >= 5 ? 3 : lv >= 3 ? 2 : 1);   // 船的等級能裝到的 Mk（研發的上限之後再加）
// 新船、舊存檔的船：補上等級、裝備（eq）的欄位；舊的 5 槽模組（mod、mk）換算成槽位裝備（見下面「槽位制度」）
function capShipFix(c) {
  if (c.lv == null) c.lv = 1; if (c.xp == null) c.xp = 0;
  if (!c.eq) { const o = capEqFromOld(c.key, c.mod, c.mk, c.lv); c.eq = o.eq; c.conv = 1; if (o.refund) c.refund = (c.refund || 0) + o.refund; }
  delete c.mod; delete c.mk;
  capEqGrow(c); return c;
}
const capNewShip = (key) => capShipFix({ key, hp: 1, sh: 1, msl: 1, eq: capStockEq(key) });
// 照裝備算出這艘船實際的數值：o＝{ eq, lv }（新）或 { mod, mk }（舊的戰鬥快照、改裝草稿）；回傳的 H.mod／H.mk＝舊 5 槽的摘要（外觀、熟練度用）
function capHullMod(H0, o) {
  if (o && o.eq) return capHullEq(H0, o.eq, o.lv);
  return capHullOld(H0, o);
}
function capHullOld(H0, o) {
  const mod = (o && o.mod) || {}, mk = (o && o.mk) || {};
  if (!CAP_SLOTS.some(([k]) => mod[k] || (mk[k] || 1) > 1)) return H0;
  const H = { ...H0, main: { ...H0.main }, tur: { ...H0.tur }, pd: { ...H0.pd }, msl: H0.msl ? { ...H0.msl } : null, mod, mk };
  const mul = (T, m) => { if (T && m) for (const k in m) T[k] = T[k] * m[k]; };
  const M = (slot) => mod[slot] && CAP_MODS[slot][mod[slot]];
  const mm = M('main');
  if (mm) { const dps = H0.main.dmg / H0.main.cd, p = mm.p; Object.assign(H.main, { name: mm.name, cd: p.cd, dmg: Math.round(dps * p.k * p.cd * 10) / 10, range: p.range, spd: p.spd, arc: p.arc, trav: p.trav, mod: mod.main, fx: mm.fx }); }
  const mt = M('tur'); if (mt) { mul(H.tur, mt.tur); H.tur.fx = mt.fx; mul(H.pd, mt.pd); H.pd.n += mt.pdN || 0; }
  const ms = M('msl'); if (ms && H.msl) { mul(H.msl, ms.msl); H.msl.n = Math.max(2, Math.round(H.msl.n)); H.ftr = ms.ftr || 0; if (ms.salvo) H.msl.salvo = ms.salvo; }
  for (const slot of ['def', 'eng']) { const m = M(slot); if (m) mul(H, m.hull); }
  const md = M('def'); if (md && md.mslCut) H.mslCut = md.mslCut;
  // Mk：主砲、副砲、飛彈＝傷害；防禦＝船體與護盾；引擎＝最高速度與加速
  const K = (slot) => CAP_MK[mk[slot] || 1];
  H.main.dmg *= K('main'); H.tur.dmg *= K('tur'); if (H.msl) H.msl.dmg *= K('msl');
  H.hp *= K('def'); H.sh *= K('def'); H.max *= K('eng'); H.acc *= K('eng');
  return H;
}
// 擊沉的經驗（ti＝被擊沉的船）：艦長戰場的船照船型，其他照大小
function capKillXp(ti) { const k = capShip(ti); return k >= 0 ? CAP_XP.kill[CAP.ships[k].key] || 15 : ships.type[ti] <= 2 ? CAP_XP.big : CAP_XP.small; }
// 記下最後一艘朝 ti 開火的船（擊沉的經驗算給它）
function capBy(s, ti) { if (CAP.by && ti >= 0) CAP.by[ti] = s.k; }
function capByKill(ti) { const k = CAP.by && CAP.by[ti]; const s = k != null && CAP.ships[k]; if (s) s.kxp = (s.kxp || 0) + capKillXp(ti); }
// 反應裝甲（capHurt 呼叫）：飛彈打到船體的傷害退回一部分
function capReactRefund(s, ti, e, hullD) { if (s.H.mslCut && e.kind === 'mh' && hullD > 0 && ships.alive[ti]) ships.hp[ti] = Math.min(maxHp(ti), ships.hp[ti] + hullD * s.H.mslCut); }

// ═══════════════════════ 艦長生涯：艦長熟練度（研發、改裝的第 5 步，2026-11-15） ═══════════════════════
// 記在玩家身上，每一種裝備（槽位＋模組，原廠＝std）一條；經驗只從你親自開的船累積，效果套用到你所有小隊的船。
// 每級手感 +3%（練到 Lv5＝15%），練滿再解鎖那個槽位的特性。
const CAP_PROF = { lv: [0, 40, 100, 200, 350, 550], per: 0.03, fight: 12, kill: 0.3 };
const CAP_PROF_FX = {
  main: { name: '主砲裝填', trait: '精準射擊：主砲射程 +10%' },
  tur: { name: '副砲命中', trait: '連射：副砲裝填 −10%' },
  msl: { name: '飛彈鎖定', trait: '加大彈艙：飛彈 +20%' },
  def: { name: '護盾', trait: '損管：船體 +5%' },
  eng: { name: '轉向', trait: '急轉：側移 +15%' },
};
const capProfKey = (slot, id) => slot + ':' + (id || 'std');
const capProfLv = (xp) => CAP_PROF.lv.reduce((a, v, k) => (xp >= v ? k : a), 0);
function capProfName(k) { const [slot, id] = k.split(':'), nm = CAP_SLOTS.find((x) => x[0] === slot)[1]; return id === 'std' ? `原廠${nm}` : CAP_MODS[slot][id].name; }
// 照熟練度調整數值（mod＝這艘船的模組，prof＝S.pl.prof；沒有熟練度就回傳原本的）
function capProfMod(H, mod, prof) {
  if (!prof) return H;
  if (H.mod) mod = H.mod;   // 槽位裝備：用摘要（每類取第一件）
  const l = CAP_SLOTS.map(([s]) => capProfLv(prof[capProfKey(s, (mod || {})[s])] || 0)); if (!l.some(Boolean)) return H;
  H = { ...H, main: { ...H.main }, tur: { ...H.tur }, pd: { ...H.pd }, msl: H.msl ? { ...H.msl } : null };
  const p = CAP_PROF.per, mx = CAP_PROF.lv.length - 1, [a, b, c, d, e] = l;
  H.main.cd *= 1 - p * a; if (a >= mx) H.main.range *= 1.1;
  H.tur.acc = Math.min(0.98, H.tur.acc * (1 + p * b)); if (b >= mx) H.tur.cd *= 0.9;
  if (H.msl) { H.msl.lockT *= 1 - p * c; if (c >= mx) H.msl.n = Math.round(H.msl.n * 1.2); }
  H.sh *= 1 + p * d; if (d >= mx) H.hp *= 1.05;
  H.turn *= 1 + p * e; if (e >= mx) H.strafe *= 1.15;
  return H;
}

// ═══════════════════════ 艦長：槽位制度（dev/艦長槽位企劃.md 第 1 步，2026-11-22） ═══════════════════════
// 每個艦種、每個等級有幾個主砲槽、副砲槽、防空槽、艦載機槽、輔助槽（CAP_HULL_SLOTS）；船的記錄 c.eq＝{ 槽位編號: { g: 裝備, mk } }，g＝'' 是空槽。
// 槽位編號＝種類＋序號（main0、sec1、aux0…），升級時沿用，所以裝好的裝備不會掉；新開的槽是空的。
// 能裝的東西（使用者 2026-11-22）：主砲槽＝主砲、副砲級（副砲、飛彈艙）、大型輔助；副砲槽＝副砲級、中型輔助；防空槽＝防空砲、小型輔助；
// 艦載機槽＝只能放艦載機；輔助槽＝大中小輔助都可以。輔助裝備：實體裝甲、能量護盾、超頻引擎（＋研發、藍圖的變體），各分大中小。
// 船的火力＝裝備加總；艦種本身只有船體、護盾、機動與技能。原廠裝備（std、gun、pod、pd、wing）照艦種原本的數值，所以原廠的 Lv1 船數值不變。
// 戰鬥還是一門主砲、一組砲塔（第 4 步才照槽位分開）：多門主砲先合成一門（傷害相加），副砲、飛彈艙取平均、加總。
const CAP_KIND_ORDER = ['main', 'sec', 'aa', 'ftr', 'aux'];
const CAP_KIND = {
  main: { name: '主砲槽', cls: ['main', 'sec'], aux: ['L'] },
  sec: { name: '副砲槽', cls: ['sec'], aux: ['M'] },
  aa: { name: '防空槽', cls: ['aa'], aux: ['S'] },
  ftr: { name: '艦載機槽', cls: ['ftr'], aux: [] },
  aux: { name: '輔助槽', cls: [], aux: ['L', 'M', 'S'] },
};
const CAP_AUX_SIZE = { L: { name: '大型', k: 1 }, M: { name: '中型', k: 0.7 }, S: { name: '小型', k: 0.45 } };
// 輔助裝備的效果（大型的；中、小型照 CAP_AUX_SIZE 打折）：數值是倍率的增減（0.25＝+25%）；grp 相同的裝多個會遞減（CAP_AUX_STACK）
const CAP_AUX_FAM = {
  armor: { name: '實體裝甲', grp: 'hull', fx: { hp: 0.25, cruise: -0.06, max: -0.06, acc: -0.06 }, p: 220, desc: '船體多，速度略降' },
  react: { name: '反應裝甲', grp: 'hull', fx: { hp: 0.08, cruise: -0.03, max: -0.03 }, mslCut: 0.3, res: true, p: 260, desc: '飛彈打到船體的傷害少（大型 30%），船體略增' },
  shield: { name: '能量護盾', grp: 'shield', fx: { sh: 0.35, hp: -0.05 }, p: 220, desc: '護盾多，船體略減' },
  oc: { name: '超頻引擎', grp: 'eng', fx: { cruise: 0.12, max: 0.12, acc: 0.1, hp: -0.03 }, p: 160, desc: '巡航、最高速度、加速都快，船體略減' },
  sprint: { name: '衝刺超頻引擎', grp: 'eng', fx: { max: 0.2, cruise: 0.1, acc: 0.15, turn: -0.15 }, p: 180, desc: '最高速度快很多，轉向變慢' },
  agile: { name: '機動超頻引擎', grp: 'eng', fx: { turn: 0.3, strafe: 0.25, climb: 0.2, max: -0.05 }, p: 180, desc: '轉向、側移快，最高速度略降' },
};
const CAP_AUX_STACK = [1, 0.8, 0.6, 0.45, 0.35];
// 裝備：cls＝裝在哪一類（main 主砲、sec 副砲級、aa 防空、ftr 艦載機、aux 輔助）；p＝改裝換上的價錢；res＝要研發；mod＝對應的舊模組（外觀、熟練度）
const CAP_GEAR = {
  std: { cls: 'main', name: '原廠主砲', p: 150, desc: '這個艦種原本的主砲' },
  rail: { cls: 'main', mod: 'rail', p: 300 }, heavy: { cls: 'main', mod: 'heavy', p: 300 }, rapid: { cls: 'main', mod: 'rapid', p: 300 }, beam: { cls: 'main', mod: 'beam', p: 320, res: true },
  gun: { cls: 'sec', kind: 'gun', name: '標準砲塔', p: 100, desc: '自動射擊的砲塔（艦種原本的副砲）' },
  hgun: { cls: 'sec', kind: 'gun', mod: 'heavy', p: 150 },
  agun: { cls: 'sec', kind: 'gun', mod: 'aa', pdN: 1, p: 150 },
  pod: { cls: 'sec', kind: 'pod', name: '標準飛彈艙', p: 150, desc: '垂直發射飛彈（艦種原本的彈艙）' },
  hpod: { cls: 'sec', kind: 'pod', name: '重飛彈艙', msl: { n: 0.4, dmg: 2.2, lockT: 1.3 }, p: 200, desc: '數量少、一發傷害高，鎖定比較久' },
  spod: { cls: 'sec', kind: 'pod', name: '蜂群飛彈艙', msl: { n: 2, dmg: 0.45, lockT: 0.7 }, salvo: 3, p: 200, desc: '數量多、一發傷害低，鎖定快' },
  pd: { cls: 'aa', name: '防空砲', p: 80, desc: '點防禦：攔飛彈、打艦載機' },
  lpd: { cls: 'aa', name: '遠程防空砲', far: 1.3, dmg: 0.85, p: 120, desc: '攔截距離遠 30%，傷害低一點' },
  wing: { cls: 'ftr', name: '護航機中隊', n: 3, p: 200, desc: '3 架護航機' },
  awing: { cls: 'ftr', name: '攔截機中隊', n: 4, p: 260, desc: '4 架攔截機（聯盟的技術）' },
};
for (const k of ['rail', 'heavy', 'rapid', 'beam']) Object.assign(CAP_GEAR[k], { name: CAP_MODS.main[k].name, desc: CAP_MODS.main[k].desc });
for (const [k, m] of [['hgun', 'heavy'], ['agun', 'aa']]) Object.assign(CAP_GEAR[k], { name: CAP_MODS.tur[m].name, desc: CAP_MODS.tur[m].desc });
CAP_GEAR.agun.desc = '對艦傷害低；附 1 座點防禦（攔截距離遠 25%），專打飛彈與艦載機';
for (const [fam, F] of Object.entries(CAP_AUX_FAM)) for (const [sz, Z] of Object.entries(CAP_AUX_SIZE)) CAP_GEAR[fam + sz] = { cls: 'aux', fam, size: sz, name: `${Z.name}${F.name}`, p: Math.round(F.p * (0.5 + Z.k * 0.5) / 10) * 10, res: F.res, desc: F.desc };
// 每個艦種 Lv1～5 的槽位數 [主砲, 副砲, 防空, 艦載機, 輔助]（預設值；之後在戰艦組裝編輯器的艦種面板改）。Lv1＝原廠的配置
const CAP_HULL_SLOTS = {
  assault: [[1, 3, 2, 0, 2], [1, 3, 3, 0, 2], [1, 4, 3, 0, 2], [1, 4, 3, 0, 3], [2, 4, 3, 0, 3]],
  gunship: [[1, 5, 2, 0, 2], [1, 5, 3, 0, 2], [1, 6, 3, 0, 2], [1, 6, 3, 0, 3], [2, 6, 3, 0, 3]],
  support: [[1, 3, 4, 2, 2], [1, 3, 4, 2, 3], [1, 3, 5, 2, 3], [1, 4, 5, 2, 3], [1, 4, 5, 3, 3]],
  ew: [[1, 3, 3, 0, 2], [1, 3, 3, 0, 3], [1, 4, 3, 0, 3], [1, 4, 4, 0, 3], [1, 4, 4, 0, 4]],
  stealth: [[1, 2, 1, 0, 2], [1, 2, 2, 0, 2], [1, 3, 2, 0, 2], [1, 3, 2, 0, 3], [1, 3, 3, 0, 3]],
};
const capGearName = (H0, id) => (!id ? '（空）' : id === 'std' ? (H0 && H0.main ? H0.main.name : CAP_GEAR.std.name) : (CAP_GEAR[id] || { name: id }).name);
const capGearFam = (id) => (CAP_GEAR[id] && CAP_GEAR[id].fam) || id;   // 研發、藍圖看的是系列（大中小的輔助裝備算同一種）
function capSlotN(key, lv) { const T = CAP_HULL_SLOTS[key] || [[1, 2, 2, 0, 2]], r = T[Math.min(T.length, Math.max(1, lv || 1)) - 1]; return Object.fromEntries(CAP_KIND_ORDER.map((k, i) => [k, r[i] || 0])); }
// 這個艦種、這個等級的槽位：[{ id, kind, n }]
function capSlotList(key, lv) { const N = capSlotN(key, lv), out = []; for (const k of CAP_KIND_ORDER) for (let n = 0; n < N[k]; n++) out.push({ id: k + n, kind: k, n }); return out; }
const capSlotName = (sl) => `${CAP_KIND[sl.kind].name} ${sl.n + 1}`;
// 這件裝備能不能裝在這一類槽位（不看研發）
function capGearFits(kind, id) {
  if (!id) return true;
  const G = CAP_GEAR[id], K = CAP_KIND[kind]; if (!G || !K) return false;
  return G.cls === 'aux' ? K.aux.includes(G.size) : K.cls.includes(G.cls);
}
// 原廠配置：主砲 1 門、副砲照艦種的砲塔數＋1 個飛彈艙、防空照點防禦數、艦載機每 3 架一個槽；輔助槽空著
function capStockEq(key) {
  const H = CAP_HULLS[key], N = capSlotN(key, 1), eq = {}, put = (kind, list) => { for (let n = 0; n < N[kind]; n++) eq[kind + n] = { g: list[n] || '', mk: 1 }; };
  put('main', H && H.main ? ['std'] : []);
  put('sec', [...Array(H ? H.tur.n : 0).fill('gun'), ...(H && H.msl ? ['pod'] : [])]);
  put('aa', Array(H ? H.pd.n : 0).fill('pd'));
  put('ftr', Array(Math.round(((H && H.ftr) || 0) / 3)).fill('wing'));
  put('aux', []);
  return eq;
}
// 升級：新開的槽位補成空的；多出來的（等級下降、槽位表改小）留著不用
function capEqGrow(c) { for (const sl of capSlotList(c.key, c.lv)) if (!c.eq[sl.id]) c.eq[sl.id] = { g: '', mk: 1 }; return c; }
const capEqLive = (key, lv, eq) => capSlotList(key, lv).map((sl) => [sl, (eq && eq[sl.id]) || { g: '', mk: 1 }]);
// 舊的 5 槽模組 → 槽位裝備。機庫（飛彈艙換成護航機）在沒有艦載機槽的船上裝不了：退回改裝費（refund，由生涯存檔發給你）
const CAP_OLD_REFUND = 200;   // 等於以前換飛彈艙模組的價錢
function capEqFromOld(key, mod, mk, lv) {
  mod = mod || {}; mk = mk || {};
  const eq = capStockEq(key), L = capSlotList(key, lv || 1), M = (s) => mk[s] || 1; let refund = 0;
  for (const sl of L) if (!eq[sl.id]) eq[sl.id] = { g: '', mk: 1 };
  if (eq.main0 && eq.main0.g) eq.main0 = { g: mod.main || 'std', mk: M('main') };
  for (const sl of L) {
    const e = eq[sl.id];
    if (e.g === 'gun') { e.g = mod.tur === 'heavy' ? 'hgun' : mod.tur === 'aa' ? 'agun' : 'gun'; e.mk = M('tur'); }
    if (e.g === 'pod') { e.g = mod.msl === 'heavy' ? 'hpod' : mod.msl === 'swarm' ? 'spod' : 'pod'; e.mk = M('msl'); }
  }
  if (mod.msl === 'hangar') refund += CAP_OLD_REFUND;
  const aux = L.filter((sl) => sl.kind === 'aux'), put = (g, m) => { const sl = aux.shift(); if (sl) eq[sl.id] = { g, mk: m }; };
  const def = { armor: 'armorL', shield: 'shieldL', react: 'reactL' }[mod.def] || (M('def') > 1 ? 'armorS' : '');
  const eng = { cruise: 'ocM', sprint: 'sprintL', agile: 'agileL' }[mod.eng] || (M('eng') > 1 ? 'ocS' : '');
  if (def) put(def, M('def')); if (eng) put(eng, M('eng'));
  return { eq, refund };
}
// 舊 5 槽的摘要（每類取第一件）：外觀（capfx、整修庫）、熟練度、勝率的 Mk 係數還是照這個
function capEqSum(key, eq, lv) {
  const mod = {}, mk = {}, take = (slot, id, m) => { if (mk[slot] == null) { if (id) mod[slot] = id; mk[slot] = m || 1; } };
  for (const [, e] of capEqLive(key, lv || 5, eq)) {
    const G = CAP_GEAR[e.g]; if (!G) continue;
    if (G.cls === 'main') take('main', G.mod, e.mk);
    else if (G.kind === 'gun') take('tur', G.mod, e.mk);
    else if (G.kind === 'pod') take('msl', { hpod: 'heavy', spod: 'swarm' }[e.g], e.mk);
    else if (G.cls === 'ftr' && e.g === 'awing') take('msl', 'hangar', e.mk);
    else if (G.cls === 'aux' && CAP_AUX_FAM[G.fam].grp !== 'eng') take('def', G.fam, e.mk);
    else if (G.cls === 'aux') take('eng', { oc: 'cruise', sprint: 'sprint', agile: 'agile' }[G.fam], e.mk);
  }
  for (const [s] of CAP_SLOTS) if (mk[s] === 1) delete mk[s];
  return { mod, mk };
}
const capMaxMk = (c) => Math.max(1, ...Object.values(c.eq || {}).filter((e) => e.g).map((e) => e.mk || 1), ...Object.values(c.mk || {}));
const capHullKey = (H0) => Object.keys(CAP_HULLS).find((k) => CAP_HULLS[k] === H0) || '';
// 照槽位裝備算出實際數值（H0＝艦種；eq＝c.eq）。只算目前等級有的槽位（lv 沒給就全部）
function capHullEq(H0, eq, lv) {
  const key = capHullKey(H0), H = { ...H0, eq };
  const list = (key ? capEqLive(key, lv || 5, eq) : Object.entries(eq).map(([id, e]) => [{ id, kind: id.replace(/\d+$/, '') }, e])).filter(([sl, e]) => e.g && CAP_GEAR[e.g] && capGearFits(sl.kind, e.g));
  const K = (e) => CAP_MK[e.mk || 1];
  // 主砲：每門照自己的型式；多門先合成一門（裝填照第一門，傷害照每秒傷害相加）
  const base = H0.main || { name: '主砲', dmg: 15, cd: 1, range: 220, spd: 260, arc: 60, trav: 60 }, dps0 = base.dmg / base.cd;
  const mains = list.filter(([, e]) => CAP_GEAR[e.g].cls === 'main').map(([sl, e]) => {
    const G = CAP_GEAR[e.g], mm = G.mod && CAP_MODS.main[G.mod];
    const g = mm ? { name: mm.name, cd: mm.p.cd, dmg: dps0 * mm.p.k * mm.p.cd, range: mm.p.range, spd: mm.p.spd, arc: mm.p.arc, trav: mm.p.trav, mod: G.mod, fx: mm.fx } : { ...base };
    g.dmg = Math.round(g.dmg * K(e) * 10) / 10; g.slot = sl.id; return g;
  });
  H.mains = mains;
  H.main = mains.length ? { ...mains[0], dmg: Math.round(mains.reduce((a, g) => a + g.dmg * mains[0].cd / g.cd, 0) * 10) / 10 } : { ...base, dmg: 0, none: true };
  // 副砲（砲塔）：每座照型式，合成一組（每秒傷害不變）
  const tb = H0.tur || { n: 0, dmg: 6, cd: 1.4, range: 160, acc: 0.85 };
  const guns = list.filter(([, e]) => CAP_GEAR[e.g].kind === 'gun').map(([, e]) => {
    const G = CAP_GEAR[e.g], m = G.mod && CAP_MODS.tur[G.mod], t = { dmg: tb.dmg, cd: tb.cd, range: tb.range, acc: tb.acc };
    if (m && m.tur) for (const k in m.tur) t[k] *= m.tur[k];
    t.dmg *= K(e); t.fx = m && m.fx; t.pdN = G.pdN || 0; return t;
  });
  if (guns.length) { const n = guns.length, c0 = guns[0].cd; H.tur = { n, cd: c0, dmg: Math.round(guns.reduce((a, t) => a + t.dmg / t.cd, 0) / n * c0 * 1000) / 1000, range: guns.reduce((a, t) => a + t.range, 0) / n, acc: guns.reduce((a, t) => a + t.acc, 0) / n }; if (guns[0].fx) H.tur.fx = guns[0].fx; }
  else H.tur = { ...tb, n: 0 };
  // 防空：防空砲＋防空砲塔附的點防禦
  const pb = H0.pd || { n: 0, dmg: 2, cd: 0.4, far: 70, acc: 0.75 };
  const pds = list.filter(([, e]) => CAP_GEAR[e.g].cls === 'aa').map(([, e]) => { const G = CAP_GEAR[e.g]; return { dmg: pb.dmg * (G.dmg || 1) * K(e), far: pb.far * (G.far || 1) }; });
  for (const t of guns) for (let j = 0; j < t.pdN; j++) pds.push({ dmg: pb.dmg * 0.6, far: pb.far * 1.25 });
  H.pd = pds.length ? { ...pb, n: pds.length, dmg: pds.reduce((a, p) => a + p.dmg, 0) / pds.length, far: pds.reduce((a, p) => a + p.far, 0) / pds.length } : { ...pb, n: 0 };
  // 飛彈艙：彈量相加，傷害、鎖定時間照彈量平均
  const mb = H0.msl || { n: 16, dmg: 35, range: 260, lockT: 1.1, cd: 0.5 };
  const pods = list.filter(([, e]) => CAP_GEAR[e.g].kind === 'pod').map(([, e]) => { const G = CAP_GEAR[e.g], m = { ...mb }; if (G.msl) for (const k in G.msl) m[k] *= G.msl[k]; m.n = Math.max(2, Math.round(m.n)); m.dmg *= K(e); m.salvo = G.salvo || 0; return m; });
  if (pods.length) {
    const n = pods.reduce((a, m) => a + m.n, 0); H.msl = { ...mb, n, dmg: pods.reduce((a, m) => a + m.dmg * m.n, 0) / n, lockT: pods.reduce((a, m) => a + m.lockT * m.n, 0) / n };
    const sw = pods.filter((m) => m.salvo); if (sw.length * 2 > pods.length) H.msl.salvo = sw[0].salvo; else delete H.msl.salvo;
  } else H.msl = null;
  // 艦載機
  H.ftr = list.filter(([, e]) => CAP_GEAR[e.g].cls === 'ftr').reduce((a, [, e]) => a + CAP_GEAR[e.g].n, 0);
  // 輔助：大型的效果 × 尺寸 × Mk（只放大好處），同一組的第 2、3 件遞減
  const add = {}, seen = {}; let cut = 0;
  const aux = list.filter(([, e]) => CAP_GEAR[e.g].cls === 'aux').map(([, e]) => ({ e, G: CAP_GEAR[e.g] })).sort((a, b) => CAP_AUX_SIZE[b.G.size].k - CAP_AUX_SIZE[a.G.size].k);
  for (const { e, G } of aux) {
    const F = CAP_AUX_FAM[G.fam]; seen[F.grp] = (seen[F.grp] ?? -1) + 1;
    const w = CAP_AUX_STACK[Math.min(CAP_AUX_STACK.length - 1, seen[F.grp])] * CAP_AUX_SIZE[G.size].k;
    for (const k in F.fx) add[k] = (add[k] || 0) + F.fx[k] * w * (F.fx[k] > 0 ? K(e) : 1);
    if (F.mslCut) cut += F.mslCut * w;
  }
  for (const k in add) H[k] = H[k] * Math.max(0.3, 1 + add[k]);
  if (cut) H.mslCut = Math.min(0.5, cut); else delete H.mslCut;
  const sum = capEqSum(key, eq, lv); H.mod = sum.mod; H.mk = sum.mk;
  return H;
}
