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
