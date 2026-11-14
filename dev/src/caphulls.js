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
    rail: { name: '磁軌砲', desc: '射得快、單發輕，射界左右各 45°', p: { cd: 2.2, k: 1, range: 240, spd: 260, arc: 45, trav: 60 } },
    heavy: { name: '重粒子砲', desc: '一發重、射得慢、射程遠；砲塔轉得慢，射界左右各 30°', p: { cd: 6, k: 0.95, range: 320, spd: 200, arc: 30, trav: 25 } },
    rapid: { name: '速射砲', desc: '射界幾乎全方位，單發輕、射程短', p: { cd: 0.9, k: 0.85, range: 200, spd: 280, arc: 150, trav: 90 } },
    beam: { name: '光束砲', desc: '持續照射、每秒傷害最高，射程最短', p: { cd: 0.35, k: 1.1, range: 170, spd: 600, arc: 60, trav: 70 }, res: true },
  },
  tur: {
    heavy: { name: '重型砲塔', desc: '傷害高、射得慢、比較不準', tur: { dmg: 1.8, cd: 1.5, acc: 0.9, range: 1.1 } },
    aa: { name: '防空砲塔', desc: '對艦傷害低；點防禦多 2 座、攔截距離遠，專打飛彈與艦載機', tur: { dmg: 0.6 }, pdN: 2, pd: { far: 1.25 } },
  },
  msl: {
    heavy: { name: '重飛彈', desc: '數量少、一發傷害高，鎖定比較久', msl: { n: 0.4, dmg: 2.2, lockT: 1.3 } },
    swarm: { name: '蜂群飛彈', desc: '數量多、一發傷害低，鎖定快', msl: { n: 2, dmg: 0.45, lockT: 0.7 } },
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
// 新船、舊存檔的船：補上等級、模組的欄位
function capShipFix(c) { if (c.lv == null) c.lv = 1; if (c.xp == null) c.xp = 0; if (!c.mod) c.mod = {}; if (!c.mk) c.mk = {}; return c; }
const capNewShip = (key) => capShipFix({ key, hp: 1, sh: 1, msl: 1 });
// 照模組與 Mk 算出這艘船實際的數值（o＝{ mod, mk }；都是原廠就直接回傳原本的船型）
function capHullMod(H0, o) {
  const mod = (o && o.mod) || {}, mk = (o && o.mk) || {};
  if (!CAP_SLOTS.some(([k]) => mod[k] || (mk[k] || 1) > 1)) return H0;
  const H = { ...H0, main: { ...H0.main }, tur: { ...H0.tur }, pd: { ...H0.pd }, msl: H0.msl ? { ...H0.msl } : null, mod, mk };
  const mul = (T, m) => { if (T && m) for (const k in m) T[k] = T[k] * m[k]; };
  const M = (slot) => mod[slot] && CAP_MODS[slot][mod[slot]];
  const mm = M('main');
  if (mm) { const dps = H0.main.dmg / H0.main.cd, p = mm.p; Object.assign(H.main, { name: mm.name, cd: p.cd, dmg: Math.round(dps * p.k * p.cd * 10) / 10, range: p.range, spd: p.spd, arc: p.arc, trav: p.trav, mod: mod.main }); }
  const mt = M('tur'); if (mt) { mul(H.tur, mt.tur); mul(H.pd, mt.pd); H.pd.n += mt.pdN || 0; }
  const ms = M('msl'); if (ms && H.msl) { mul(H.msl, ms.msl); H.msl.n = Math.max(2, Math.round(H.msl.n)); H.ftr = ms.ftr || 0; }
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
