// ═══════════════════════ 王牌飛行員 ═══════════════════════
// 玩家不指揮艦隊：雙方艦隊都由 AI 指揮（同 AI 對戰觀摩），玩家駕駛一架特殊改裝的艦載機加入戰場。
// 玩家的機佔艦載機池最後一格（PL.j，kind 3）：防空砲、攔截機照常會打它；飛行、武器由這裡處理（updateFighters 每 tick 呼叫 pilotFly）。
// 操作：滑鼠移動瞄準方向（機體自動轉過去）、W／S 油門、A／D 翻滾、Shift 加速、左鍵武裝一、右鍵武裝二、T 鎖定準心附近的敵人、V 切換背後／座艙視角。
// 玩家的輸入不進命令紀錄，所以駕駛的戰鬥沒有回放。
const PILOT_STORE = 'fleet.pilot';
const PILOT_FTR_LEN = FTR_LEN3;   // 駕駛中所有艦載機（玩家與 AI）的 3D 長度：與指揮模式相同（main.js 的 FTR_LEN3）
const PILOT_RESPAWN = 5;       // 被擊墜後幾秒重新出擊
const PILOT_HITR_F = 1.3;      // 機砲對艦載機的命中半徑（比機身大一點，好打一點）
const PILOT_ZONE = 1500;
const PILOT_DODGE = 3.5;      // 打向玩家的子彈：到達時機體離預測點超過這個距離＝閃過       // 戰區半徑：超出會被拉回
// 機體：role＝CRAFT 的索引（防空砲依它的大小算命中）；min／cruise／max＝最低／巡航／加速速度；turn＝每秒最大轉向（弧度）
const PILOT_FRAMES = [
  { role: 0, name: '攔截機・改', en: 'INTERCEPTOR', hp: 30, sh: 24, shR: 7, min: 22, cruise: 58, max: 96, acc: 46, turn: 2.3, roll: 4.4, boostT: 4,
    desc: '最快、最靈活，裝甲最薄。追蹤飛彈多帶 4 枚。', mods: { homing: 4 } },
  { role: 1, name: '攻擊機・改', en: 'STRIKER', hp: 40, sh: 28, shR: 6, min: 18, cruise: 50, max: 86, acc: 40, turn: 2.0, roll: 3.8, boostT: 4,
    desc: '均衡的纏鬥機。機砲傷害 ×1.25，火箭多帶 50%。', mods: { gun: 1.25, rocket: 1.5 } },
  { role: 2, name: '飛彈攻擊機・改', en: 'BOMBER', hp: 52, sh: 32, shR: 6, min: 16, cruise: 42, max: 74, acc: 34, turn: 1.6, roll: 3.0, boostT: 5,
    desc: '慢、耐打，彈艙大：追蹤飛彈多帶 4 枚、重型魚雷多帶 2 枚。', mods: { homing: 4, torpedo: 2 } },
  { role: 3, name: '光束攻擊機・改', en: 'LANCER', hp: 58, sh: 40, shR: 8, min: 14, cruise: 40, max: 70, acc: 32, turn: 1.5, roll: 2.8, boostT: 5,
    desc: '最耐打、最慢。光矛傷害 ×1.35、射程 ×1.3。', mods: { lance: 1.35, lanceR: 1.3 } },
];
// 武裝：gun＝直射（機砲有過熱，火箭有彈數）、lock＝要先鎖定（vs：f 打艦載機、s 打船）、beam＝持續光束（有能量）
// unlock＝累積多少戰功才能裝
const PILOT_WEAPONS = {
  pulse: { name: '脈衝機砲', type: 'gun', unlock: 0, rof: 10, speed: 480, range: 300, spread: 0.006, dmgF: 2.2, dmgS: 2, heat: 0.055, cool: 0.45, bolt: 5, inten: 0.6,
    desc: '射速快、會過熱。對艦載機最好用，打船只能刮護盾。' },
  homing: { name: '追蹤飛彈', type: 'lock', vs: 'f', unlock: 0, ammo: 10, cone: 0.42, range: 520, lockT: 0.45, speed: 150, turn: 4, dmg: 10, cd: 0.4, life: 5,
    desc: '機首大致對準敵機約 0.5 秒鎖定，一發擊墜。沒鎖定也能發射：飛彈會自己找前方的敵機（轉向較差）。' },
  heavy: { name: '重粒子砲', type: 'gun', unlock: 150, rof: 2.6, speed: 360, range: 360, spread: 0.003, dmgF: 6, dmgS: 9, heat: 0.16, cool: 0.4, bolt: 8, inten: 1.0,
    desc: '射速慢、威力大，打船也有效。' },
  rocket: { name: '火箭巢', type: 'gun', unlock: 400, rof: 6, speed: 220, range: 320, spread: 0.012, dmgF: 0, dmgS: 11, ammo: 24, bolt: 3, inten: 0.9, shipOnly: true,
    desc: '無導引火箭連射，只能打船。彈數有限，回母艦整補。' },
  torpedo: { name: '重型魚雷', type: 'lock', vs: 's', unlock: 800, ammo: 3, cone: 0.3, range: 600, lockT: 0.9, dmg: 70, accM: 1.6, cd: 1,
    desc: '對準敵艦約 1 秒鎖定。威力極大，但會被防空砲攔截。沒鎖定也能發射，打向前方最近的敵艦，命中率較低。' },
  repair: { name: '維修光束', type: 'beam', heal: true, unlock: 100, range: 70, hps: 12, self: 3, dur: 5, recharge: 8,
    desc: '對準友艦按住：修復船體與護盾。沒有對準友艦時修復自己（比較慢）。能量 5 秒，8 秒充滿。' },
  lance: { name: '光矛', type: 'beam', unlock: 1400, range: 85, dps: 24, dpsF: 16, dur: 4, recharge: 9,
    desc: '貼近照射的持續光束：護盾消耗 ×1.5，打穿後船體 ×1.5。能量 4 秒，9 秒充滿。' },
};
const PILOT_WPN_ORDER = ['pulse', 'homing', 'repair', 'heavy', 'rocket', 'torpedo', 'lance'];
// 四個武裝槽：左鍵、右鍵、Q、E
const PILOT_SLOTS = [{ name: '武裝一', mouse: '左鍵' }, { name: '武裝二', mouse: '右鍵' }, { name: '武裝三' }, { name: '武裝四' }];
// 按鍵在「設定 → 按鍵綁定 → 駕駛」修改（KEY_ACTIONS 的 pilot_*）；Shift／Ctrl／Alt 左右邊都算
function plCodeIs(id, code) { const c = keyOf(id); if (!c || !code) return false; if (c === code) return true; const m = /^(Shift|Control|Alt|Meta)/.exec(c); return !!m && code.startsWith(m[1]); }
function plHeld(id) { for (const c of PL.keys) if (plCodeIs(id, c)) return true; return false; }
function plKey(id) { return keyLabel(keyOf(id)); }
function plSlotKey(k) { const S = PILOT_SLOTS[k], kb = keyOf('pilot_w' + (k + 1)); return [S.mouse, kb ? keyLabel(kb) : ''].filter(Boolean).join('／') || '未綁定'; }
const PILOT_SLOT_DEF = ['pulse', 'homing', 'homing', 'pulse'];
const PILOT_MERIT = { ftr: 25, ship: 60, dmg: 0.4, heal: 0.5, fleet: 20, bonus: 40, mission: [100, 140, 180, 230, 280] };
// ───── 任務：個人紀錄看任務成敗（艦隊戰勝負只是小獎勵） ─────
// 每次出擊隨機一個主要目標＋0～2 個額外目標；完成主要目標後降落航母結算（也可以繼續打）；被擊墜超過上限＝失敗
const PILOT_DEATHS = [5, 4, 3, 3, 2];   // 依 AI 難度 1～5
const PILOT_MIS = {
  kills: { name: '制空', goal: (li) => [5, 6, 8, 10, 12][li], text: (n) => `擊墜 ${n} 架敵機` },
  hunt: { name: '獵殺', goal: (li) => [1, 2, 2, 3, 3][li], text: (n) => `擊沉 ${n} 艘指定的敵艦（儀表上標示「目標」）` },
  damage: { name: '對艦攻擊', goal: (li) => [250, 350, 500, 650, 800][li], text: (n) => `對敵艦造成 ${fmtN(n)} 點傷害` },
  carrier: { name: '擊沉航母', goal: () => 1, text: () => '擊沉指定的敵方航母' },
  escort: { name: '護衛航母', goal: (li, T) => Math.round(Math.min(T * 0.7, 150 + 30 * li)), text: (n) => `保護指定的己方航母 ${Math.round(n / 60 * 10) / 10} 分鐘（敵方打擊群會來攻擊它）` },
};
const PILOT_BONUS = {
  nodeath: { name: '一次都沒被擊墜' },
  fast: { name: '在戰鬥時間的前 60% 完成主要目標' },
  extra: { name: '另外擊墜 3 架敵機', not: ['kills'] },
  fleet: { name: '我軍贏得艦隊戰（要打到戰鬥結束）' },
  hp50: { name: '護衛的航母耐久保持在 50% 以上', only: ['escort'] },
};
function pilotMisText(M) { return `${PILOT_MIS[M.type].name}：${PILOT_MIS[M.type].text(M.goal)}`; }
// 出擊前決定（隨機）：類型、目標量、額外目標、被擊墜上限
function pilotMisRoll(R, li, T) {
  const types = Object.keys(PILOT_MIS), type = types[Math.floor(R() * types.length)];
  const pool = Object.keys(PILOT_BONUS).filter((id) => !(PILOT_BONUS[id].not || []).includes(type) && (!PILOT_BONUS[id].only || PILOT_BONUS[id].only.includes(type))), bonus = [];
  const nb = Math.floor(R() * 3);
  while (bonus.length < nb && pool.length) bonus.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  return { type, li, T, goal: PILOT_MIS[type].goal(li, T), bonus, deaths: PILOT_DEATHS[li] };
}
for (const k in PILOT_WEAPONS) PILOT_WEAPONS[k].id = k;

// ───── 成長：飛行員等級與天賦、武器熟練度 ─────
// 飛行員經驗＝累積得到的戰功（戰功另外當作解鎖武裝的門檻）；每升一級得 1 點天賦點數，天賦可以免費重新分配
const PILOT_TALENTS = [
  { id: 'armor', name: '強化裝甲', max: 3, desc: (r) => `機體耐久 +${10 * r}%` },
  { id: 'shield', name: '護盾增幅', max: 3, desc: (r) => `護盾 +${12 * r}%、回充 +${10 * r}%` },
  { id: 'engine', name: '推進器調校', max: 3, desc: (r) => `巡航與加速速度 +${5 * r}%` },
  { id: 'agile', name: '機動調校', max: 3, desc: (r) => `轉向、翻滾 +${6 * r}%` },
  { id: 'boost', name: '加速儲能', max: 2, desc: (r) => `加速能量 +${25 * r}%` },
  { id: 'bay', name: '彈艙擴充', max: 3, desc: (r) => `飛彈、魚雷、火箭攜帶量 +${25 * r}%` },
  { id: 'cool', name: '散熱系統', max: 3, desc: (r) => `機砲熱量 −${12 * r}%` },
  { id: 'lock', name: '快速鎖定', max: 2, desc: (r) => `鎖定時間 −${15 * r}%` },
  { id: 'ace', name: '王牌直覺', max: 2, desc: (r) => `受到的傷害 −${8 * r}%` },
  { id: 'rescue', name: '緊急回收', max: 2, desc: (r) => `重新出擊快 ${1.5 * r} 秒` },
];
const PILOT_LV_MAX = 26;   // 25 點剛好點滿全部天賦
function pilotLvNeed(lv) { return 120 + 80 * (lv - 1); }   // Lv → Lv+1 要的經驗
function pilotLevel(xp) { let lv = 1, need = pilotLvNeed(1); while (lv < PILOT_LV_MAX && xp >= need) { xp -= need; lv++; need = pilotLvNeed(lv); } return { lv, xp, need: lv >= PILOT_LV_MAX ? 0 : need }; }
function pilotTalUsed(tal) { return PILOT_TALENTS.reduce((a, T) => a + Math.min(T.max, tal[T.id] || 0), 0); }
function pilotTalFree(p) { return pilotLevel(p.xp).lv - 1 - pilotTalUsed(p.tal); }
// 武器熟練度：用那把武器打中、擊墜、擊沉累積經驗，Lv 0～5
const PILOT_PROF = [0, 50, 150, 320, 600, 1000];
const PILOT_PROF_XP = { hitF: 1, ftr: 12, dmg: 0.15, ship: 15, heal: 0.3 };
function pilotProf(xp) { let lv = 0; while (lv < 5 && xp >= PILOT_PROF[lv + 1]) lv++; return { lv, xp, cur: PILOT_PROF[lv], next: lv < 5 ? PILOT_PROF[lv + 1] : 0 }; }
function pilotProfDesc(id, lv) {
  const W = PILOT_WEAPONS[id], out = [`${W.heal ? '維修量' : '傷害'} +${4 * lv}%`];
  if (W.type === 'gun') out.push(W.ammo ? `彈數 +${10 * lv}%` : `熱量 −${6 * lv}%`);
  if (W.type === 'lock') out.push(`鎖定時間 −${6 * lv}%`, id === 'torpedo' ? `魚雷 +${Math.floor(lv / 2)} 枚` : `飛彈 +${lv} 枚`);
  if (W.type === 'beam') out.push(`能量 +${8 * lv}%`);
  return lv ? out.join('、') : '還沒有加成';
}
// 這一次出擊的實際數值：機體 × 天賦；每個武裝槽的倍率（熟練度 × 天賦）
function pilotBuild(cfg) {
  const T = (id) => Math.min((PILOT_TALENTS.find((x) => x.id === id) || { max: 0 }).max, (cfg.tal || {})[id] || 0), B = PILOT_FRAMES[cfg.frame] || PILOT_FRAMES[1];
  const sp = 1 + 0.05 * T('engine'), ag = 1 + 0.06 * T('agile');
  const fr = { ...B, hp: B.hp * (1 + 0.1 * T('armor')), sh: B.sh * (1 + 0.12 * T('shield')), shR: B.shR * (1 + 0.1 * T('shield')), min: B.min * sp, cruise: B.cruise * sp, max: B.max * sp,
    turn: B.turn * ag, roll: B.roll * ag, boostT: B.boostT * (1 + 0.25 * T('boost')) };
  return { fr, taken: 1 - 0.08 * T('ace'), respawn: PILOT_RESPAWN - 1.5 * T('rescue'), bay: 1 + 0.25 * T('bay'), cool: 1 - 0.12 * T('cool'), lock: 1 - 0.15 * T('lock') };
}
function pilotSlotMods(id, lv, B) {
  const W = PILOT_WEAPONS[id], M = B.fr.mods;
  let ammo = 0;
  if (id === 'homing') ammo = Math.round((W.ammo + (M.homing || 0)) * B.bay) + lv;
  else if (id === 'torpedo') ammo = Math.round((W.ammo + (M.torpedo || 0)) * B.bay) + Math.floor(lv / 2);
  else if (id === 'rocket') ammo = Math.round(W.ammo * (M.rocket || 1) * B.bay * (1 + 0.1 * lv));
  return { max: ammo, dm: 1 + 0.04 * lv, heatM: B.cool * (1 - 0.06 * lv), need: (W.lockT || 0) * B.lock * (1 - 0.06 * lv), enM: 1 + 0.08 * lv };
}

function pilotLoad() {
  let p = null; try { p = JSON.parse(STORE.getItem(PILOT_STORE) || 'null'); } catch (e) { p = null; }
  p = Object.assign({ merit: 0, sorties: 0, wins: 0, kf: 0, ks: 0, deaths: 0, fac: 0, frame: 1, slots: PILOT_SLOT_DEF.slice(), size: 1, ai: -1, terr: 3, seed: 0, tal: {}, wxp: {} }, p || {});
  if (p.xp == null) p.xp = p.merit;   // 舊存檔：經驗＝已累積的戰功
  if (!p.tal || typeof p.tal !== 'object') p.tal = {}; if (!p.wxp || typeof p.wxp !== 'object') p.wxp = {};
  if (pilotTalFree(p) < 0) p.tal = {};   // 點數對不上就重新分配
  if (!PILOT_FRAMES[p.frame]) p.frame = 1;
  if (!Array.isArray(p.slots)) p.slots = [];
  p.slots = PILOT_SLOT_DEF.map((d, k) => { const w = p.slots[k]; return PILOT_WEAPONS[w] && PILOT_WEAPONS[w].unlock <= p.merit ? w : d; });   // 舊存檔只有 2 槽：補上預設
  if (p.fac !== 1) p.fac = 0;
  if (!RAND_SIZES[p.size]) p.size = 1; if (!(p.ai >= -1 && p.ai < WATCH_LV.length)) p.ai = -1; if (!RAND_TERR[p.terr]) p.terr = 3;
  return p;
}
function pilotSave(p) { try { STORE.setItem(PILOT_STORE, JSON.stringify(p)); } catch (e) { /* 只在本次有效 */ } }
function pilotSummary() { const p = pilotLoad(); return `飛行員 Lv ${pilotLevel(p.xp).lv}・${PILOT_FRAMES[p.frame].name}・戰功 ${fmtN(p.merit)}・擊墜 ${p.kf}`; }

// ───── 機庫（出擊前設定） ─────
function showPilot() {
  const p = pilotLoad();
  setPhase('briefing');
  const seg = (key, arr) => `<div class="wed-seg rd-seg" data-po="${key}">${arr.map(([v, n]) => `<button data-v="${v}" class="${p[key] === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const F = PILOT_FRAMES[p.frame];
  const bar = (v, max) => `<i class="pl-bar"><b style="width:${Math.round(v / max * 100)}%"></b></i>`;
  const frames = PILOT_FRAMES.map((f, i) => `<button class="pl-frame ${i === p.frame ? 'on' : ''}" data-fr="${i}"><span class="sp-en">${f.en}</span><b>${f.name}</b>
    <span class="pl-st">耐久 ${bar(f.hp + f.sh, 100)} 速度 ${bar(f.max, 100)} 機動 ${bar(f.turn, 2.5)}</span><small>${f.desc}</small></button>`).join('');
  const wcell = (k) => PILOT_WPN_ORDER.map((id) => {
    const W = PILOT_WEAPONS[id], lock = W.unlock > p.merit, on = p.slots[k] === id, other = p.slots.some((x, i) => i !== k && x === id);
    const P = pilotProf(p.wxp[id] || 0), prof = lock ? '' : `<span class="pl-prof">熟練 Lv ${P.lv}${P.next ? ` ${bar(P.xp - P.cur, P.next - P.cur)}` : '（最高）'}</span>`;
    return `<button class="pl-wpn ${on ? 'on' : ''} ${lock ? 'lock' : ''}" data-slot="${k}" data-w="${id}" ${lock ? 'disabled' : ''} title="${W.desc}"><b>${W.name}</b>${prof}<small>${lock ? `戰功 ${fmtN(W.unlock)} 解鎖` : other && on ? '其他槽也裝了這把（各自的彈藥、鎖定）' : `${W.desc}${P.lv ? `<br>熟練加成：${pilotProfDesc(id, P.lv)}` : ''}`}</small></button>`;
  }).join('');
  const L = pilotLevel(p.xp), free = pilotTalFree(p);
  const tals = PILOT_TALENTS.map((T) => { const r = Math.min(T.max, p.tal[T.id] || 0);
    return `<div class="pl-tal ${r ? 'on' : ''}"><div class="pl-tal-h"><b>${T.name}</b><span class="pl-pips">${Array.from({ length: T.max }, (_, k) => `<i class="${k < r ? 'on' : ''}"></i>`).join('')}</span></div>
      <small>${r ? T.desc(r) : '尚未學習'}${r < T.max ? `　<span class="g-dim">下一級：${T.desc(r + 1)}</span>` : ''}</small>
      <div class="pl-tal-b"><button class="g-btn sm" data-tal="${T.id}" data-d="-1" ${r ? '' : 'disabled'}>−</button><button class="g-btn sm" data-tal="${T.id}" data-d="1" ${r < T.max && free > 0 ? '' : 'disabled'}>＋</button></div></div>`; }).join('');
  const B = pilotBuild({ frame: p.frame, tal: p.tal }), lo = p.slots.map((id) => { const m = pilotSlotMods(id, pilotProf(p.wxp[id] || 0).lv, B); return `${PILOT_WEAPONS[id].name}${m.max ? ` ${m.max} ${PILOT_WEAPONS[id].type === 'lock' ? '枚' : '發'}` : ''}`; }).join('＋');
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>王牌飛行員</h2><span class="crumb">不指揮艦隊・駕駛一架艦載機加入隨機戰場・沒有回放</span><span class="g-sp"></span><button class="g-btn" id="pl-back">← 單人戰鬥</button></div>
    <div class="g-card pl-rec"><div class="pl-lv"><span class="g-dim">飛行員等級</span><b>Lv ${L.lv}</b>${L.need ? `<span class="pl-xp">${bar(L.xp, L.need)}<small>${fmtN(Math.floor(L.xp))}／${fmtN(L.need)}</small></span>` : '<small>最高等級</small>'}</div><div><span class="g-dim">戰功</span><b>${fmtN(p.merit)}</b></div><div><span class="g-dim">出擊</span><b>${p.sorties}</b></div><div><span class="g-dim">任務成功</span><b>${p.wins}</b></div>
      <div><span class="g-dim">擊墜</span><b>${p.kf}</b></div><div><span class="g-dim">擊沉</span><b>${p.ks}</b></div><div><span class="g-dim">被擊墜</span><b>${p.deaths}</b></div>
      <span class="g-dim pl-note">戰功同時是飛行員經驗（升級得天賦點數）與解鎖武裝的門檻；武器用得越多，熟練度越高。</span></div>
    <div class="g-card" style="margin-top:12px"><h3>天賦 <span class="g-dim" style="font-weight:400">可用點數 <b class="${free > 0 ? 'g-pc' : ''}">${free}</b>・每升一級 1 點・可以隨時免費重新分配</span><button class="g-btn sm" id="pl-tal-reset" style="float:right">全部重新分配</button></h3><div class="pl-tals">${tals}</div></div>
    <div class="g-card" style="margin-top:12px"><h3>機體</h3><div class="pl-frames">${frames}</div></div>
    <div class="intel-grid" style="margin-top:12px">
      ${PILOT_SLOTS.map((S, k) => `<div class="g-card"><h3>${S.name}（${plSlotKey(k)}）</h3><div class="pl-wpns">${wcell(k)}</div></div>`).join('')}
    </div>
    <div class="intel-grid" style="margin-top:12px">
      <div class="g-card"><h3>戰場</h3><dl class="kv rd-opts">
        <dt>所屬陣營</dt><dd>${seg('fac', [[0, FACTION_NAME[0]], [1, FACTION_NAME[1]]])}<div class="g-dim">從己方航母起飛；敵軍是另一個陣營</div></dd>
        <dt>規模</dt><dd>${seg('size', RAND_SIZES.map((s, i) => [i, s.name]))}<div class="g-dim">每一方 ${fmtN(RAND_SIZES[p.size].budget)} 點兵力・${Math.round(RAND_SIZES[p.size].time / 60)} 分鐘</div></dd>
        <dt>AI 難度</dt><dd>${seg('ai', [...WATCH_LV.map((l, i) => [i, l.name]), [-1, '隨機']])}<div class="g-dim">雙方艦隊的指揮官等級與 AI 難度（兩邊相同，戰局要靠你扭轉）</div></dd>
        <dt>地形</dt><dd>${seg('terr', RAND_TERR.map((s, i) => [i, s.name]))}</dd>
        <dt>任務</dt><dd>每次出擊隨機指派：${Object.values(PILOT_MIS).map((x) => x.name).join('、')}，另外附 0～2 個額外目標（決定評等）。完成主要目標後靠近己方航母按 ${plKey('pilot_land')} 降落結算，也可以繼續打。指定目標被友軍打掉不算失敗，會改派新目標。</dd>
        <dt>失敗</dt><dd>被擊墜超過上限（依 AI 難度：${PILOT_DEATHS.map((n, i) => `難度 ${i + 1} ${n} 次`).join('、')}）、護衛的航母被擊沉，或戰鬥結束前沒完成。艦隊戰勝負只是小獎勵。己方航母全滅就無法再出擊。</dd></dl></div>
      <div class="g-card"><h3>操作（滑鼠＋鍵盤）</h3><table class="pl-keys">
        <tr><td>滑鼠移動</td><td>瞄準方向（機體自動轉過去）</td></tr>${PILOT_SLOTS.map((S, k) => `<tr><td>${plSlotKey(k)}</td><td>${S.name}</td></tr>`).join('')}
        <tr><td>${plKey('pilot_thr_up')}／${plKey('pilot_thr_dn')}</td><td>油門加／減</td></tr><tr><td>${plKey('pilot_roll_l')}／${plKey('pilot_roll_r')}</td><td>翻滾</td></tr><tr><td>${plKey('pilot_boost')}</td><td>加速（有能量）</td></tr>
        <tr><td>${plKey('pilot_target')}</td><td>鎖定準心附近的敵人（機砲會顯示提前量）</td></tr><tr><td>${plKey('pilot_view')}</td><td>背後視角／座艙視角</td></tr><tr><td>滾輪</td><td>背後視角的鏡頭距離</td></tr>
        <tr><td>${plKey('pilot_land')}</td><td>靠近己方航母時：自動降落、整補（彈藥、耐久補滿），再彈射起飛</td></tr><tr><td>Esc</td><td>暫停</td></tr></table>
        <div style="margin-top:6px"><button class="g-btn sm" id="pl-keys">修改按鍵…</button></div>
        <div class="g-dim" style="margin-top:6px">需要滑鼠：開戰後點一下畫面開始駕駛（滑鼠游標會被鎖定）。</div></div>
    </div>
    <div class="g-row" style="margin-top:12px"><span class="g-dim">${F.name}：${lo}</span><span class="g-sp"></span><button class="g-btn pri" id="pl-go">出擊 →</button></div></div>`);
  gEl('pl-back').onclick = showSingle;
  gEl('pl-go').onclick = () => pilotGo();
  gEl('pl-keys').onclick = () => openSettings();
  const keep = () => { const y = gEl('game').scrollTop; pilotSave(p); showPilot(); gEl('game').scrollTop = y; };
  document.querySelectorAll('[data-fr]').forEach((b) => (b.onclick = () => { p.frame = +b.dataset.fr; keep(); }));
  document.querySelectorAll('[data-tal]').forEach((b) => (b.onclick = () => { const T = PILOT_TALENTS.find((x) => x.id === b.dataset.tal), r = (p.tal[T.id] || 0) + +b.dataset.d; if (r < 0 || r > T.max || (+b.dataset.d > 0 && pilotTalFree(p) <= 0)) return; p.tal[T.id] = r; keep(); }));
  gEl('pl-tal-reset').onclick = () => { p.tal = {}; keep(); };
  document.querySelectorAll('.pl-wpn').forEach((b) => (b.onclick = () => { p.slots[+b.dataset.slot] = b.dataset.w; keep(); }));
  document.querySelectorAll('[data-po]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => { p[g.dataset.po] = +b.dataset.v; keep(); })));
}
// 設定 → 模擬室布局（雙方 AI；己方第一艦隊一定有航母）
function pilotLayout(p) {
  const R = mulberry32(campHash(p.seed, p.size + 1, p.terr, 91));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const S = RAND_SIZES[p.size];
  let st = RAND_TERR[p.terr].st; if (st == null) st = R() < 0.15 ? -1 : Math.floor(R() * 15);
  const li = p.ai < 0 ? Math.floor(R() * WATCH_LV.length) : p.ai, L = WATCH_LV[li].cl, mis = pilotMisRoll(R, li, S.time);
  const m = { name: '', fac: p.fac === 1 ? 1 : 0, victory: true, ctl: -1, pilot: { frame: p.frame, slots: p.slots.slice(), tal: { ...p.tal }, prof: Object.fromEntries(p.slots.map((id) => [id, pilotProf(p.wxp[id] || 0).lv])), mis }, timeLimit: S.time,
    seed: campHash(p.seed, p.size + 1, 13) % 100000, fleets: [], terrain: st < 0 ? [] : campTerrain(R, st), sides: [] };
  const names = CAMP_NAMES.slice();
  for (const side of [0, 1]) {
    const tac = pick(WATCH_TAC), nF = 1 + Math.floor(R() * S.maxFleets);
    m.sides.push({ lv: li, tac });
    const sup = li + 1 >= AI_SUPPLY.minLv, budget = S.budget * (sup ? 1 - AI_SUPPLY.escort - AI_SUPPLY.supply : 1);
    const first = m.fleets.length;
    for (let k = 0; k < nF; k++) {
      const A = side === 0 && k === 0 ? CAMP_ARCHETYPES.find((a) => a.key === 'carrier') : pick(CAMP_ARCHETYPES);
      const per = A.mix.reduce((s, x, t) => s + x * SHIP_TYPES[t].cost, 0), n = budget / nF / per;
      const comp = A.mix.map((x) => Math.round(n * x / 10) * 10);
      if (side === 0 && k === 0) comp[0] = Math.max(comp[0], 10);   // 玩家的母艦
      if (side === 1 && k === 0 && mis.type === 'carrier') comp[0] = Math.max(comp[0], 10);   // 任務：擊沉航母
      const t = tac === 'flank' && nF >= 2 && k === 0 ? 'push' : tac;
      const skills = [], nSk = Math.min(3, 1 + Math.floor(L / 4));
      while (skills.length < nSk) { const s = pick(L >= 5 ? CAMP_SKILLS : CAMP_SKILLS.slice(0, 3)); if (!skills.includes(s)) skills.push(s); }
      const cn = names.splice(Math.floor(R() * names.length), 1)[0] || '指揮官';
      m.fleets.push({ side, name: `第${SIM_CN[k]}艦隊（${A.name}）`, cmdr: { base: null, name: cn, title: '', trait: pick(['dmg', 'shield', 'speed']), level: L, mode: 'lv', tal: {}, skills },
        comp, hangar: HANGAR_DEFAULT.slice(), formation: tac === 'breakthrough' ? 'spindle' : pick(A.formations), orderly: false, layers: 1,
        x: nF === 1 ? 0 : Math.round(-380 + 760 * k / (nF - 1)), z: side ? -360 : 360, y: 0, h: side ? 0 : Math.PI,
        ai: { tactic: t, level: li + 1 }, reserve: false, at: 60 });
    }
    if (sup) m.fleets.push({ side, name: '補給艦隊', supply: true, follow: first, cmdr: { base: null, name: '', title: '', trait: 'shield', level: 1, mode: 'lv', tal: {}, skills: [] },
      comp: aiSupplyComp(S.budget), hangar: HANGAR_DEFAULT.slice(), formation: 'ring', orderly: false, layers: 1,
      x: 0, z: side ? -360 - SUPPLY_RULE.follow : 360 + SUPPLY_RULE.follow, y: 0, h: side ? 0 : Math.PI, ai: null, reserve: false, at: 60 });
  }
  m.name = `${PILOT_MIS[mis.type].name}・${S.name}・${WATCH_LV[li].name}`;
  return m;
}
function pilotGo() {
  const p = pilotLoad(); p.seed = randSeed(); pilotSave(p);
  simEndMid(); overlay(null);
  SIM.m = pilotLayout(p); SIM.sel = null;
  camAnim = null;
  simStart();
}

// ───── 戰鬥中 ─────
Object.assign(PL, { side: 0, F: [0, 0, 1], U: [0, 1, 0], yaw: 0, pitch: 0, speed: 0, thr: 0.6, boost: 1, hp: 0, sh: 0, shT: -9, inv: 0, dead: false, deadT: 0,
  home: -1, frame: null, slots: [], fire: [false, false, false, false], press: [false, false, false, false], keys: new Set(), tgt: null, cock: false, camD: 1, msl: [], feed: [], hitT: -9, hurtT: -9,
  rearm: 0, out: 0, rng: 1, hits: [], flash: null, stats: null, el: null, ctx: null, pauseEl: null, locked: false, manualT: 0, seed: 0, banner: '' });
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pp = new THREE.Vector3();
function plRnd() { PL.rng = (Math.imul(PL.rng ^ (PL.rng >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return PL.rng / 4294967296; }   // 不動到模擬的亂數
const v3 = { dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  rot: (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), d = v3.dot(k, v), x = v3.cross(k, v); return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]; } };
function pilotAim() { const cp = Math.cos(PL.pitch); return [Math.sin(PL.yaw) * cp, Math.sin(PL.pitch), Math.cos(PL.yaw) * cp]; }
function pilotResetSlots() { PL.slots = PL.slotIds.map((id) => { const m = pilotSlotMods(id, PL.prof[id] || 0, PL.B); return { id, ...m, ammo: m.max, heat: 0, over: false, cd: 0, lock: -1, lockK: '', lockT: 0, en: 1, dmgT: 0, side: 0 }; }); }
function pilotBegin(cfg) {
  PL.on = true; PL.spec = false; PL.side = 0; PL.j = FTR_MAX - 1; FT.state[PL.j] = 0;
  PL.B = pilotBuild(cfg); PL.frame = PL.B.fr; PL.taken = PL.B.taken; PL.respawn = PL.B.respawn; PL.prof = cfg.prof || {}; PL.slotIds = cfg.slots.slice();
  PL.stats = { kf: 0, ks: 0, dmg: 0, deaths: 0, shots: 0, hits: 0, merit: 0, msl: 0, heal: 0, wxp: {} };
  PL.feed = []; PL.msl = []; PL.hits = []; PL.flash = null; PL.dodge = 0; PL.tgt = null; PL.cock = false; PL.camD = 1; PL.rng = (battleSeed ^ 0x5bd1e995) >>> 0 || 1; PL.thr = 0.6; PL.saved = false; PL.savedBefore = PL.lv0 = PL.wx0 = null;
  PL.keys.clear(); PL.fire = [false, false, false, false]; PL.press = [false, false, false, false];
  const fl = fleets.find((f) => f.side === PL.side && !f.supply && f.sqs.some((q) => q.list.some((i) => ships.alive[i] && ships.type[i] === 0)));
  PL.home = -1; if (fl) for (const q of fl.sqs) for (const i of q.list) if (PL.home < 0 && ships.alive[i] && ships.type[i] === 0) PL.home = i;
  pilotHudBuild(); document.body.classList.add('pilot-on');
  pilotSpawn(true);
  pilotMisInit(cfg.mis);
  if (PL.mis) toast(`任務　${pilotMisText(PL.mis)}${PL.mis.bonus.length ? `　額外：${PL.mis.bonus.map((b) => PILOT_BONUS[b].name).join('、')}` : ''}　被擊墜超過 ${PL.mis.deaths} 次就失敗`, 'pilot');
  toast(`出擊！${PL.frame.name}：${PILOT_WEAPONS[PL.slotIds[0]].name}＋${PILOT_WEAPONS[PL.slotIds[1]].name}（點一下畫面開始駕駛・Esc 暫停）`, 'pilot');
}
function pilotEnd() {
  if (!PL.on) return;
  PL.beam = null; PL.dock = null; PL.flash = null; pilotBeamFrame(); pilotHitFrame();
  PL.on = false; PL.spec = false;
  if (PL.j >= 0) FT.state[PL.j] = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  document.body.classList.remove('pilot-on', 'pilot-spec');
  if (PL.el) PL.el.hidden = true; if (PL.pauseEl) PL.pauseEl.hidden = true;
}
function pilotCarrier() {
  if (PL.home >= 0 && ships.alive[PL.home]) return PL.home;
  let best = -1, bd = 1e18; const px = fP[PL.j * 3], pz = fP[PL.j * 3 + 2];
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i] || ships.side[i] !== PL.side || ships.type[i] !== 0 || squadrons[ships.sq[i]].bg) continue;
    shipWorldCPU(i, _pa); const d = (_pa.x - px) ** 2 + (_pa.z - pz) ** 2; if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function pilotSpawn(first) {
  const c = pilotCarrier();
  if (c < 0) { pilotSpectate(); return; }
  PL.home = c;
  const j = PL.j, sq = squadrons[ships.sq[c]], t = U.uTime.value, Fr = PL.frame;
  shipWorldCPU(c, _pa);
  const h = sq.h, F = v3.norm([Math.sin(h), Math.sin((sq.p || 0) * 0.5), Math.cos(h)]), L = shipGeo.getAttribute('aScale').array[c] * TYPE_LEN3;
  FT.state[j] = 2; FT.side[j] = PL.side; FT.kind[j] = 3; FT.role[j] = Fr.role; FT.carrier[j] = c; FT.hp[j] = 999; FT.seed[j] = 0.5; FT.t0[j] = t; FT.launch[j] = 0; FT.ret[j] = 0; FT.engT[j] = 0; FT.tgt[j] = -1;
  fP[j * 3] = _pa.x + F[0] * L * 0.6; fP[j * 3 + 1] = _pa.y + L * 0.25 + 0.6; fP[j * 3 + 2] = _pa.z + F[2] * L * 0.6;
  PL.F = F; PL.U = v3.norm(v3.cross(v3.cross(F, [0, 1, 0]), F)); PL.yaw = Math.atan2(F[0], F[2]); PL.pitch = Math.asin(F[1]);
  PL.speed = Fr.cruise; PL.thr = 0.6; PL.boost = 1; PL.hp = Fr.hp; PL.sh = Fr.sh; PL.shT = -9; PL.inv = t + 3; PL.dead = false; PL.rearm = 0; PL.out = 0;
  fV[j * 3] = F[0] * PL.speed; fV[j * 3 + 1] = F[1] * PL.speed; fV[j * 3 + 2] = F[2] * PL.speed;
  pilotResetSlots();
  PL.beam = null; PL.dock = { ph: 'out', t: 0, c }; pilotDockStep(j, 0, t);   // 從甲板彈射起飛
  if (!first) pilotFeed('從母艦重新出擊', 'ok');
}
function pilotSpectate() {
  PL.spec = true; PL.dead = true; document.body.classList.add('pilot-spec');
  if (document.pointerLockElement) document.exitPointerLock();
  const al = fleets.filter((f) => f.side === PL.side).flatMap((f) => fleetAlive(f)), C = al.length ? centerOf(al) : { x: 0, z: 0 };
  view.target.set(C.x, 0, C.z); view.height = 700; view.pitch = 0.6; updateCamera();
  toast('己方航母全滅，無法再出擊：改為觀戰（可以調速度，或按「結束模擬」）', 'bad');
}

// 每 tick：飛行、碰撞、武器（模擬時間）
function pilotFly(j, dt, t) {
  if (PL.dock) { pilotDockStep(j, dt, t); PL.press.fill(false); pilotMissiles(dt, t); return; }   // 自動降落、整補、彈射
  const Fr = PL.frame, j3 = j * 3;
  let px = fP[j3], py = fP[j3 + 1], pz = fP[j3 + 2];
  // 戰區外：瞄準方向被拉回中心
  const rr = Math.hypot(px, pz);
  PL.out = rr > PILOT_ZONE || Math.abs(py) > 700 ? PL.out + dt : 0;
  if (PL.out > 4) { const yaw = Math.atan2(-px, -pz); PL.yaw += wrapAngle(yaw - PL.yaw) * Math.min(1, dt * 2); PL.pitch += (Math.atan2(-py, Math.max(1, rr)) - PL.pitch) * Math.min(1, dt * 2); }
  const A = pilotAim();
  // 速度：油門＋加速
  const boosting = plHeld('pilot_boost');
  let want = Fr.min + (Fr.cruise - Fr.min) * PL.thr;
  if (boosting && PL.boost > 0) { want = Fr.max; PL.boost = Math.max(0, PL.boost - dt / Fr.boostT); } else PL.boost = Math.min(1, PL.boost + dt / (Fr.boostT * 2.5));
  PL.boosting = boosting && PL.boost > 0;
  PL.speed += Math.max(-Fr.acc * dt * 1.5, Math.min(Fr.acc * dt, want - PL.speed));
  // 轉向：機首往瞄準方向轉，每秒最多 turn（低速稍微靈活、加速時遲鈍）
  let F = PL.F, U = PL.U;
  const turn = Fr.turn * (PL.boosting ? 0.7 : 1) * (1 + 0.35 * (1 - PL.thr));
  const d = Math.max(-1, Math.min(1, v3.dot(F, A))), ang = Math.acos(d);
  let lat = 0;
  if (ang > 1e-4) {
    let ax = v3.cross(F, A); if (Math.hypot(ax[0], ax[1], ax[2]) < 1e-6) ax = U;
    ax = v3.norm(ax);
    const step = Math.min(ang, turn * dt, ang * Math.min(1, dt * 9));
    F = v3.norm(v3.rot(F, ax, step)); U = v3.rot(U, ax, step);
    const Rt = v3.cross(F, U); lat = v3.dot(A, Rt);
  }
  // 側傾：轉彎自動壓坡度；A／D 手動翻滾（放開 0.5 秒後才回到自動）
  const rollIn = (plHeld('pilot_roll_r') ? 1 : 0) - (plHeld('pilot_roll_l') ? 1 : 0);
  if (rollIn) { U = v3.rot(U, F, rollIn * Fr.roll * dt); PL.manualT = 0.5; }
  else if ((PL.manualT -= dt) <= 0 && Math.abs(F[1]) < 0.96) {
    const Ur = v3.norm([-F[0] * F[1], 1 - F[1] * F[1], -F[2] * F[1]]), Rr = v3.cross(F, Ur), phi = Math.max(-1, Math.min(1, lat * 3)) * 1.1;
    const Ud = [Ur[0] * Math.cos(phi) + Rr[0] * Math.sin(phi), Ur[1] * Math.cos(phi) + Rr[1] * Math.sin(phi), Ur[2] * Math.cos(phi) + Rr[2] * Math.sin(phi)];
    const cur = v3.dot(v3.cross(U, Ud), F), cosA = Math.max(-1, Math.min(1, v3.dot(U, Ud))), da = Math.atan2(cur, cosA);
    U = v3.rot(U, F, Math.max(-Fr.roll * dt, Math.min(Fr.roll * dt, da * Math.min(1, dt * 5))));
  }
  const fu = v3.dot(F, U); U = v3.norm([U[0] - F[0] * fu, U[1] - F[1] * fu, U[2] - F[2] * fu]);
  PL.F = F; PL.U = U;
  let vx = F[0] * PL.speed, vy = F[1] * PL.speed, vz = F[2] * PL.speed;
  px += vx * dt; py += vy * dt; pz += vz * dt;
  // 碰撞：小行星、船體（擦撞扣耐久、彈開、減速）
  for (const r of ROCKS) {
    const dx = px - r.x, dy = py - r.y, dz = pz - r.z, dd = Math.hypot(dx, dy, dz), R = r.r + 0.8;
    if (dd < R) { px = r.x + dx / dd * R; py = r.y + dy / dd * R; pz = r.z + dz / dd * R; pilotBump(t, 12); }
  }
  pilotShipBump(t, px, py, pz, (x, y, z) => { px = x; py = y; pz = z; });
  fP[j3] = px; fP[j3 + 1] = py; fP[j3 + 2] = pz; fV[j3] = vx; fV[j3 + 1] = vy; fV[j3 + 2] = vz;
  // 護盾回充
  if (t - PL.shT > 3) PL.sh = Math.min(Fr.sh, PL.sh + Fr.shR * dt);
  for (let k = 0; k < PL.slots.length; k++) pilotWeapon(k, dt, t, px, py, pz);
  PL.press.fill(false);
  pilotMissiles(dt, t);
}
function pilotBump(t, dmg) { if (t - (PL.bumpT || -9) < 0.5) return; PL.bumpT = t; PL.speed *= 0.5; pilotHurt(dmg, null, true); }
function pilotShipBump(t, px, py, pz, set) {
  const sc = shipGeo.getAttribute('aScale').array;
  for (const sq of squadrons) {
    if (sq.alive <= 0 || sq.bg || sq.hidden) continue;
    const rad = Math.max(sq.W || 0, sq.D || 0) / 2 + 20;
    if (Math.abs(sq.x - px) > rad || Math.abs(sq.z - pz) > rad || Math.abs((sq.y || 0) - py) > rad + 40) continue;
    for (const i of sq.list) {
      if (!ships.alive[i]) continue;
      shipWorldCPU(i, _pa); const r = sc[i] * TYPE_LEN3 * 0.26 + 0.3, dx = px - _pa.x, dy = py - _pa.y, dz = pz - _pa.z, dd = Math.hypot(dx, dy, dz);
      if (dd < r && dd > 1e-4) { set(_pa.x + dx / dd * r, _pa.y + dy / dd * r, _pa.z + dz / dd * r); pilotBump(t, 8); return; }
    }
  }
}
// ───── 降落整補：自動進場降落在航母甲板 → 整補 → 彈射起飛（出擊、重新出擊也從甲板彈射） ─────
const PILOT_DOCK = { range: 90, inT: 2.6, deckT: 3, outT: 1.8 };
const PILOT_DECK = {};
// 甲板在船體模型上的位置（船長的倍數）：沿中線往下打射線，取偏低的那段高度（避開艦橋塔）
function pilotDeck(hk) {
  if (PILOT_DECK[hk]) return PILOT_DECK[hk];
  const M = typeof getModel === 'function' ? getModel(hk) : null;
  if (!M) return { z: -0.05, y: 0.12 };
  const mesh = new THREE.Mesh(M.lods[0]), rc = new THREE.Raycaster(), dn = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3(), hs = [];
  for (let z = -0.3; z <= 0.3001; z += 0.02) { o.set(0, 3, z); rc.set(o, dn); const hit = rc.intersectObject(mesh)[0]; if (hit) hs.push([z, hit.point.y]); }
  if (!hs.length) return (PILOT_DECK[hk] = { z: -0.05, y: 0.12 });
  const ys = hs.map((a) => a[1]).sort((a, b) => a - b), deck = ys[Math.floor(ys.length * 0.7)];
  const near = hs.filter((a) => Math.abs(a[1] - deck) < 0.02).sort((a, b) => Math.abs(a[0] + 0.05) - Math.abs(b[0] + 0.05))[0] || [-0.05, deck];
  return (PILOT_DECK[hk] = { z: near[0], y: deck + 0.02 });
}
// 航母現在的甲板點、船的前／上（與 3D 模型的位置、漂浮一致）
const _dkP = {};
function pilotDockPose(c) {
  bridgePose(c, _dkP);
  const S = pilotDeck(_dkP.hk), h = _dkP.h, p = _dkP.p || 0, cp = Math.cos(p), sp = Math.sin(p), L = _dkP.L;
  const F = [Math.sin(h) * cp, sp, Math.cos(h) * cp], U = [-Math.sin(h) * sp, cp, -Math.cos(h) * sp], up = 0.12 * PILOT_FTR_LEN;
  return { F, U, L, P: [_dkP.x + (F[0] * S.z + U[0] * S.y) * L + U[0] * up, _dkP.y + (F[1] * S.z + U[1] * S.y) * L + U[1] * up, _dkP.z + (F[2] * S.z + U[2] * S.y) * L + U[2] * up] };
}
function pilotNearCarrier(px, py, pz, R) {
  let best = -1, bd = R;
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i] || ships.side[i] !== PL.side || ships.type[i] !== 0 || squadrons[ships.sq[i]].bg) continue;
    shipWorldCPU(i, _pa); const d = Math.hypot(_pa.x - px, _pa.y - py, _pa.z - pz); if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function pilotLandReq() {
  if (PL.dead || PL.dock) return;
  const j = PL.j, c = pilotNearCarrier(fP[j * 3], fP[j * 3 + 1], fP[j * 3 + 2], PILOT_DOCK.range);
  if (c < 0) { pilotFeed(`附近沒有己方航母（${PILOT_DOCK.range} 以內才能降落）`, 'hint'); return; }
  PL.dock = { ph: 'in', t: 0, c, S0: [fP[j * 3], fP[j * 3 + 1], fP[j * 3 + 2]], U0: PL.U.slice(), v0: PL.speed };
  PL.fire.fill(false); PL.beam = null;
  pilotFeed('進場降落（自動駕駛）', 'ok');
}
// 每 tick：照階段擺好機體位置、方向
function pilotDockStep(j, dt, t) {
  const d = PL.dock, c = d.c, Fr = PL.frame;
  if (!ships.alive[c]) { PL.dock = null; PL.speed = Fr.cruise; PL.inv = t + 1.5; pilotFeed('母艦被擊沉！緊急脫離', 'bad'); return; }
  d.t += dt; PL.inv = Math.max(PL.inv, t + 0.3);   // 降落、在甲板上、彈射時不會被打下
  const K = pilotDockPose(c);
  let P, F, U = K.U, sp = 0;
  if (d.ph === 'in') {
    const u = Math.min(1, d.t / PILOT_DOCK.inT), e = u * u * (3 - 2 * u);
    const A = [K.P[0] - K.F[0] * K.L * 2.4 + K.U[0] * K.L * 0.5, K.P[1] - K.F[1] * K.L * 2.4 + K.U[1] * K.L * 0.5, K.P[2] - K.F[2] * K.L * 2.4 + K.U[2] * K.L * 0.5];   // 從船尾後上方進場
    P = [0, 1, 2].map((q) => (1 - e) * (1 - e) * d.S0[q] + 2 * (1 - e) * e * A[q] + e * e * K.P[q]);
    const T = v3.norm([0, 1, 2].map((q) => 2 * (1 - e) * (A[q] - d.S0[q]) + 2 * e * (K.P[q] - A[q])));
    const w = Math.max(0, (u - 0.75) / 0.25);   // 最後一段：機首對齊船
    F = v3.norm([0, 1, 2].map((q) => T[q] * (1 - w) + K.F[q] * w));
    U = v3.norm([0, 1, 2].map((q) => d.U0[q] * (1 - e) + K.U[q] * e));
    sp = d.v0 * (1 - e) + 4 * e;
    if (u >= 1) { d.ph = 'deck'; d.t = 0; }
  } else if (d.ph === 'deck') {
    if (PL.mis && PL.mis.done && !GAME.result) { PL.mis.rtb = true; GAME.result = battleResult('end', '任務完成，返航', { pilotRtb: true }); }   // 完成任務後降落＝結算
    P = K.P; F = K.F; PL.rearm = Math.min(1, d.t / PILOT_DOCK.deckT);
    if (d.t >= PILOT_DOCK.deckT) { PL.hp = Fr.hp; PL.sh = Fr.sh; PL.boost = 1; pilotResetSlots(); PL.rearm = 0; d.ph = 'out'; d.t = 0; pilotFeed('整補完成：彈藥、耐久補滿・彈射起飛！', 'ok'); }
  } else {
    // 彈射：沿甲板加速到巡航速度，最後稍微拉起
    const T = PILOT_DOCK.outT, a = Fr.cruise / T, s = 0.5 * a * d.t * d.t, lift = Math.max(0, d.t - T * 0.5) * 0.12;
    P = [0, 1, 2].map((q) => K.P[q] + K.F[q] * s + K.U[q] * lift * s * 0.3);
    F = v3.norm([0, 1, 2].map((q) => K.F[q] + K.U[q] * lift)); sp = a * d.t;
    if (d.t >= T) { PL.dock = null; PL.speed = Fr.cruise; PL.thr = 0.6; PL.inv = Math.max(PL.inv, t + 1.5); }
  }
  const fu = v3.dot(F, U); U = v3.norm([U[0] - F[0] * fu, U[1] - F[1] * fu, U[2] - F[2] * fu]);
  PL.F = F; PL.U = U; PL.yaw = Math.atan2(F[0], F[2]); PL.pitch = Math.asin(Math.max(-1, Math.min(1, F[1]))); if (PL.dock) PL.speed = sp;
  const j3 = j * 3; fP[j3] = P[0]; fP[j3 + 1] = P[1]; fP[j3 + 2] = P[2]; fV[j3] = F[0] * Math.max(1, sp); fV[j3 + 1] = F[1] * Math.max(1, sp); fV[j3 + 2] = F[2] * Math.max(1, sp);
}
// 一個武裝槽（k＝0 左鍵、1 右鍵）
function pilotWeapon(k, dt, t, px, py, pz) {
  const S = PL.slots[k]; if (!S) return;
  const W = PILOT_WEAPONS[S.id], F = PL.F, fire = PL.fire[k], M = PL.frame.mods;
  S.cd -= dt;
  if (W.type === 'gun') {
    if (!W.ammo) { S.heat = Math.max(0, S.heat - W.cool * dt); if (S.over && S.heat < 0.35) S.over = false; }
    if (!fire || S.cd > 0 || S.over || (W.ammo && S.ammo <= 0)) return;
    S.cd += 1 / W.rof; if (S.cd < 0) S.cd = 0;
    if (W.ammo) S.ammo--; else { S.heat += W.heat * S.heatM; if (S.heat >= 1) { S.heat = 1; S.over = true; } }
    S.side = 1 - S.side;
    const Rt = v3.cross(F, PL.U), o = (S.side ? 0.25 : -0.25) * PILOT_FTR_LEN;
    const sp = W.spread, D = v3.norm([F[0] + (plRnd() - 0.5) * sp * 2, F[1] + (plRnd() - 0.5) * sp * 2, F[2] + (plRnd() - 0.5) * sp * 2]);
    pilotShot(px + F[0] * 0.5 + Rt[0] * o, py + F[1] * 0.5 + Rt[1] * o, pz + F[2] * 0.5 + Rt[2] * o, D, W, t, (M.gun || 1) * S.dm);
    return;
  }
  if (W.type === 'lock') {
    // 鎖定：機首 cone 內最近的目標（有指定目標而且在 cone 內就優先）
    // 鎖定中的目標比較黏：離開 cone 一點點（1.8 倍內）還算；短暫丟失 0.4 秒內不歸零
    const c = pilotLockCand(W, px, py, pz, S);
    if (c && c.k + c.i === S.lockK + S.lock) { S.lockT += dt; S.lost = 0; }
    else if (!c && S.lock >= 0 && (S.lost = (S.lost || 0) + dt) < 0.4) { /* 保留鎖定進度 */ }
    else { S.lockT = 0; S.lost = 0; S.lock = c ? c.i : -1; S.lockK = c ? c.k : ''; }
    if (!PL.press[k] || S.cd > 0 || S.ammo <= 0) return;
    const locked = !!c && S.lockT >= S.need;   // 沒鎖定也能發射
    if (W.vs === 'f') {
      PL.msl.push({ x: px + F[0], y: py + F[1], z: pz + F[2], vx: F[0] * W.speed, vy: F[1] * W.speed, vz: F[2] * W.speed, tg: locked ? c.i : -1, turn: W.turn * (locked ? 1 : 0.8), age: 0, life: W.life, dmg: W.dmg * S.dm, W, n: 0 });
    } else {
      const tc = locked ? c : c || pilotLockCand({ ...W, cone: 0.6 }, px, py, pz, null);
      if (!tc) { pilotFeed('前方沒有敵艦', 'hint'); return; }
      const hq = squadrons[ships.sq[PL.home >= 0 ? PL.home : 0]], n0 = pending.length;
      if (launchMissileAt(px + F[0], py + F[1] - 0.3, pz + F[2], PL.side, hq, tc.i, W.dmg * S.dm, t, 1, W.accM * (locked ? 1 : 0.55))) for (let q = n0; q < pending.length; q++) pending[q].pl = S.id;
    }
    S.cd = W.cd; S.ammo--; PL.stats.msl++;
    S.lockT = 0;
    return;
  }
  if (W.type === 'beam' && W.heal) { pilotRepair(S, W, dt, t, px, py, pz, fire); return; }
  if (W.type === 'beam') {
    const dur = W.dur * S.enM, R = W.range * (M.lanceR || 1);
    if (!fire || S.en <= 0) { S.en = Math.min(1, S.en + dt / W.recharge); if (!fire && S.en > 0.15) S.empty = false; return; }
    if (S.empty) { S.en = Math.min(1, S.en + dt / W.recharge); return; }
    S.en -= dt / dur; if (S.en <= 0) { S.en = 0; S.empty = true; }
    const ox = px + F[0] * 0.5, oy = py + F[1] * 0.5, oz = pz + F[2] * 0.5;
    const h = pilotRay(ox, oy, oz, F, R, null, false);
    const ex = ox + F[0] * h.s, ey = oy + F[1] * h.s, ez = oz + F[2] * h.s;
    PL.beam = { t, b: [ex, ey, ez], hit: h.k };   // 畫面：pilotBeamFrame 每幀畫一條實體光束
    if (h.k && simTick % 7 === 0) spawnFx(ex, ey, ez, h.k === 's' ? PL.side : PL.side, h.k === 's' ? 1.6 : 1.1, 30);   // 打到的地方冒火花
    S.dmgT -= dt;
    if (S.dmgT <= 0) {
      S.dmgT = 0.25; const mul = (M.lance || 1) * S.dm;
      if (h.k === 's') { const g = h.i, asp = hitAspect(g, ox, oz, ex, ez, oy, ey); pending.push({ kind: 'lb', src: 2, t: t + 0.02, target: g, side: PL.side, asp, dmg: W.dps * 0.25 * mul, hm: hitMul(asp, pilotSq(), squadrons[ships.sq[g]]), fx: plRnd() < 0.4, dirIdx: dirIndexOf(ex - ox, ez - oz), x: ex, y: ey, z: ez, pl: W.id }); }
      else if (h.k === 'f') pending.push({ kind: 'ak', a: 1, t: t + 0.02, i: h.i, dmg: W.dpsF * 0.25 * mul, side: PL.side, pl: W.id });
    }
  }
}
// 維修光束：對準的友艦（射線碰到的第一艘）修船體與護盾；沒對準友艦就修自己
function pilotRepair(S, W, dt, t, px, py, pz, fire) {
  if (!fire || S.en <= 0 || S.empty) { S.en = Math.min(1, S.en + dt / W.recharge); if (!fire && S.en > 0.15) S.empty = false; return; }
  const F = PL.F, ox = px + F[0] * 0.5, oy = py + F[1] * 0.5, oz = pz + F[2] * 0.5;
  const h = pilotRay(ox, oy, oz, F, W.range, { shipOnly: true, speed: 1e9 }, false, PL.side);
  let amt = 0;
  if (h.k === 's') {
    const i = h.i, a = Math.min(W.hps * S.dm * dt, maxHp(i) - ships.hp[i]); ships.hp[i] += Math.max(0, a); amt = Math.max(0, a);
    const b = Math.min(W.hps * 0.6 * S.dm * dt, ships.shMax[i] - ships.sh[i]); if (b > 0) { ships.sh[i] += b; amt += b * 0.5; }
    PL.beam = { t, b: [ox + F[0] * h.s, oy + F[1] * h.s, oz + F[2] * h.s], hit: 's', heal: true };
    if (simTick % 9 === 0) spawnFx(PL.beam.b[0], PL.beam.b[1], PL.beam.b[2], PL.side, 0.9, 30);
  } else if (PL.hp < PL.frame.hp) { amt = Math.min(W.self * S.dm * dt, PL.frame.hp - PL.hp); PL.hp += amt; PL.selfFix = t; }
  if (amt <= 0) { S.en = Math.min(1, S.en + dt / W.recharge); return; }   // 沒有東西可修：不耗能量
  S.en -= dt / (W.dur * S.enM); if (S.en <= 0) { S.en = 0; S.empty = true; }
  pilotCredit('heal', h.k === 's' ? h.i : -1, amt, false, W.id);
}
function pilotSq() { const c = PL.home >= 0 ? PL.home : 0; return squadrons[ships.sq[c]]; }
// 射線：最先碰到的敵方艦載機（lead＝依彈速預測位置）、飛彈、敵艦、岩石；回傳 {k, i, s}
function pilotRay(ox, oy, oz, D, R, W, lead, es = 1 - PL.side) {   // es：要打（或修）的那一方
  let best = R, k = '', hi = -1, hg = 0;
  const sp = W ? W.speed : 1e9;
  if (!W || !W.shipOnly) {
    airIndex();
    const m = AIR.map[es], C = AIR.cell, r = Math.ceil(R / C) + 1, cx = Math.floor(ox / C), cz = Math.floor(oz / C);
    if (m.size) for (let ax = cx - r; ax <= cx + r; ax++) for (let az = cz - r; az <= cz + r; az++) {
      const arr = m.get(ax * 100003 + az); if (!arr) continue;
      for (const o of arr) {
        const dx0 = o.x - ox, dy0 = o.y - oy, dz0 = o.z - oz, d0 = Math.hypot(dx0, dy0, dz0); if (d0 > best + 3) continue;
        const tf = lead ? d0 / sp : 0, qx = dx0 + o.vx * tf, qy = dy0 + o.vy * tf, qz = dz0 + o.vz * tf;
        const s = qx * D[0] + qy * D[1] + qz * D[2]; if (s <= 0 || s >= best) continue;
        const hr = o.a ? PILOT_HITR_F : 0.9, p2 = qx * qx + qy * qy + qz * qz - s * s;
        if (p2 < hr * hr) { best = s; k = o.a ? 'f' : 'm'; hi = o.i; hg = o.g || 0; }
      }
    }
  }
  const sc = shipGeo.getAttribute('aScale').array;
  for (const sq of squadrons) {
    if (sq.side !== es || sq.alive <= 0 || sq.bg || sq.hidden) continue;
    const cx = sq.x - ox, cy = (sq.y || 0) - oy, cz = sq.z - oz, rad = Math.max(sq.W || 0, sq.D || 0) / 2 + 30;
    const s0 = cx * D[0] + cy * D[1] + cz * D[2]; if (s0 < -rad || s0 > best + rad) continue;
    if (cx * cx + cy * cy + cz * cz - s0 * s0 > rad * rad) continue;
    for (const i of sq.list) {
      if (!ships.alive[i]) continue;
      shipWorldCPU(i, _pa);
      const r = sc[i] * TYPE_LEN3 * 0.3, qx = _pa.x - ox, qy = _pa.y - oy, qz = _pa.z - oz, s = qx * D[0] + qy * D[1] + qz * D[2];
      if (s < -r || s - r > best) continue;
      const p2 = qx * qx + qy * qy + qz * qz - s * s; if (p2 > r * r) continue;
      const sh = s - Math.sqrt(r * r - p2); if (sh > 0 && sh < best) { best = sh; k = 's'; hi = i; }
    }
  }
  if (ROCKS.length) { const b = rockBlock(ox, oy, oz, ox + D[0] * best, oy + D[1] * best, oz + D[2] * best); if (b >= 0) { best *= b; k = 'r'; hi = -1; } }
  return { k, i: hi, g: hg, s: best };
}
function pilotShot(ox, oy, oz, D, W, t, mul) {
  const h = pilotRay(ox, oy, oz, D, W.range, W, true), s = h.s, tf = s / W.speed;
  const ex = ox + D[0] * s, ey = oy + D[1] * s, ez = oz + D[2] * s;
  spawnBeam(ox, oy, oz, ex, ey, ez, t, tf, PL.side, W.inten, Math.min(1, W.bolt / Math.max(1, s)), shipFac(PL.home >= 0 ? PL.home : 0));
  PL.stats.shots++;
  if (h.k === 'f') pending.push({ kind: 'ak', a: 1, t: t + tf, i: h.i, dmg: W.dmgF * mul, side: PL.side, pl: W.id });
  else if (h.k === 'm') pending.push({ kind: 'ak', a: 0, t: t + tf, i: h.i, g: h.g, dmg: 1, side: PL.side });
  else if (h.k === 's') { const g = h.i, asp = hitAspect(g, ox, oz, ex, ez, oy, ey); pending.push({ src: 2, t: t + tf, target: g, side: PL.side, asp, dmg: W.dmgS * mul, hm: hitMul(asp, pilotSq(), squadrons[ships.sq[g]]), fx: plRnd() < 0.5, dirIdx: dirIndexOf(ex - ox, ez - oz), x: ex, y: ey, z: ez, pl: W.id }); }
  else if (h.k === 'r') pending.push({ kind: 'sp', t: t + tf, x: ex, y: ey, z: ez, side: PL.side });
}
// 鎖定候選：機首 cone 內、射程內，角度最小的（指定目標在 cone 內就選它）
function pilotLockCand(W, px, py, pz, S) {
  const F = PL.F, cc = Math.cos(W.cone), cw = Math.cos(Math.min(1.2, W.cone * 1.8)), es = 1 - PL.side;
  let best = null, bc = -2;
  const test = (k, i, x, y, z) => {
    const dx = x - px, dy = y - py, dz = z - pz, d = Math.hypot(dx, dy, dz); if (d > W.range || d < 3) return;
    let c = (dx * F[0] + dy * F[1] + dz * F[2]) / d;
    const cur = S && S.lock === i && S.lockK === k;
    if (c < (cur ? cw : cc)) return;
    if (cur) c += 2;   // 正在鎖的目標優先
    if (PL.tgt && PL.tgt.k === k && PL.tgt.i === i) c += 1;   // 指定的目標優先
    if (c > bc) { bc = c; best = { k, i, x, y, z, d }; }
  };
  if (W.vs === 'f') { for (const j of aliveF[es]) if (FT.kind[j] !== 1) test('f', j, fP[j * 3], fP[j * 3 + 1], fP[j * 3 + 2]); }
  else for (let i = 0; i < shipCount; i++) { if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].bg) continue; shipWorldCPU(i, _pa); test('s', i, _pa.x, _pa.y, _pa.z); }
  return best;
}
// 追蹤飛彈（打艦載機）：自己飛，尾焰用短光束畫
function pilotMissiles(dt, t) {
  for (let k = PL.msl.length - 1; k >= 0; k--) {
    const m = PL.msl[k], W = m.W;
    m.life -= dt;
    m.age = (m.age || 0) + dt;
    if (!(m.tg >= 0 && FT.state[m.tg] === 2) && m.life > 0.5 && m.age > 0.25) m.tg = pilotRetarget(m);   // 沒鎖定、或目標被別人打下：自己找前方最近的敵機
    const live = m.tg >= 0 && FT.state[m.tg] === 2, x0 = m.x, y0 = m.y, z0 = m.z;
    const g = m.tg;
    if (live) {
      // 導引：瞄準目標的預測位置（距離 ÷ 彈速 秒後），每秒最多轉 turn 弧度
      const tx = fP[g * 3], ty = fP[g * 3 + 1], tz = fP[g * 3 + 2], d0 = Math.hypot(tx - m.x, ty - m.y, tz - m.z), tg = Math.min(1.5, d0 / W.speed);
      const D = v3.norm([tx + fV[g * 3] * tg - m.x, ty + fV[g * 3 + 1] * tg - m.y, tz + fV[g * 3 + 2] * tg - m.z]), V = v3.norm([m.vx, m.vy, m.vz]);
      const ang = Math.acos(Math.max(-1, Math.min(1, v3.dot(V, D))));
      let N = D;
      const tr = m.turn || W.turn;
      if (ang > tr * dt) { let ax = v3.cross(V, D); if (Math.hypot(ax[0], ax[1], ax[2]) < 1e-6) ax = [0, 1, 0]; N = v3.rot(V, v3.norm(ax), tr * dt); }
      m.vx = N[0] * W.speed; m.vy = N[1] * W.speed; m.vz = N[2] * W.speed;
    }
    m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    if (live) {   // 這一 tick 的線段離目標最近的距離（彈速快，只看端點會穿過去）
      const tx = fP[g * 3], ty = fP[g * 3 + 1], tz = fP[g * 3 + 2], sx = m.x - x0, sy = m.y - y0, sz = m.z - z0, L2 = sx * sx + sy * sy + sz * sz || 1;
      const u = Math.max(0, Math.min(1, ((tx - x0) * sx + (ty - y0) * sy + (tz - z0) * sz) / L2)), cd = Math.hypot(x0 + sx * u - tx, y0 + sy * u - ty, z0 + sz * u - tz);
      if (cd < 2.4) { pending.push({ kind: 'ak', a: 1, t, i: g, dmg: m.dmg, side: PL.side, pl: W.id }); spawnFx(tx, ty, tz, PL.side, 1.6, 26); PL.msl.splice(k, 1); continue; }
    }
    if ((m.n++ & 1) === 0) spawnBeam(x0 - m.vx * dt, y0 - m.vy * dt, z0 - m.vz * dt, m.x, m.y, m.z, t, 0.18, PL.side, 0.8, 1.0, shipFac(PL.home >= 0 ? PL.home : 0));
    if (m.life <= 0 || (ROCKS.length && rockBlock(x0, y0, z0, m.x, m.y, m.z) >= 0)) { spawnFx(m.x, m.y, m.z, PL.side, 1.4, 26); PL.msl.splice(k, 1); }
  }
}
function pilotRetarget(m) {
  const V = v3.norm([m.vx, m.vy, m.vz]); let best = -1, bd = 320;
  for (const f of aliveF[1 - PL.side]) { if (FT.kind[f] === 1) continue; const dx = fP[f * 3] - m.x, dy = fP[f * 3 + 1] - m.y, dz = fP[f * 3 + 2] - m.z, d = Math.hypot(dx, dy, dz); if (d < bd && (dx * V[0] + dy * V[1] + dz * V[2]) / d > 0.7) { bd = d; best = f; } }
  return best;
}
// 被打中：先扣護盾，打穿扣耐久；歸零＝被擊墜
function pilotHurt(dmg, e, self) {
  const t = U.uTime.value; if (PL.dead || t < PL.inv) return;
  if (e && e.px != null) { const j = PL.j; if (Math.hypot(fP[j * 3] - e.px, fP[j * 3 + 1] - e.py, fP[j * 3 + 2] - e.pz) > PILOT_DODGE) { PL.dodge = (PL.dodge || 0) + 1; return; } }   // 閃過了
  PL.shT = t; PL.hurtT = t; dmg *= PL.taken || 1;
  if (PL.sh > 0) { const a = Math.min(PL.sh, dmg); PL.sh -= a; dmg -= a; }
  pilotHitFx(e, dmg > 0);
  PL.hp -= dmg;
  if (PL.hp > 0) return;
  PL.hp = 0; PL.dead = true; PL.deadT = t; PL.stats.deaths++;
  const j = PL.j; FT.state[j] = 3; FT.t0[j] = t; spawnFx(fP[j * 3], fP[j * 3 + 1], fP[j * 3 + 2], PL.side, 3.2, 24);
  PL.fire.fill(false); PL.msl.length = 0; PL.dock = null; PL.beam = null; PL.rearm = 0;
  pilotFeed(self ? '機體撞毀！' : '被擊墜！', 'bad');
  if (PL.mis && !PL.mis.done && PL.stats.deaths > PL.mis.deaths) pilotMisFail(`被擊墜 ${PL.stats.deaths} 次，超過上限 ${PL.mis.deaths} 次`);
}
// 被打中：機體上的閃光（護盾藍、機體橘）＋火花；記下來源方向給儀表畫受擊方向
function pilotHitFx(e, hull) {
  const j = PL.j, x = fP[j * 3], y = fP[j * 3 + 1], z = fP[j * 3 + 2], now = performance.now();
  PL.hurtSh = !hull;
  const src = e && e.sx != null ? [e.sx, e.sy, e.sz] : null;
  PL.flash = { t: now, hull, src };
  if (src) { PL.hits.push({ t: now, x: src[0], y: src[1], z: src[2], hull }); if (PL.hits.length > 10) PL.hits.shift(); }
  if (hull) spawnFx(x, y, z, PL.side, 0.9, 30);
  else spawnFx(x, y, z, 2 + fxFac(PL.side) * 8 + (src ? dirIndexOf(x - src[0], z - src[2]) : 0), 1.1, 26);
}
function pilotCredit(kind, i, dmg, kill, wid) {
  const S = PL.stats; if (!S) return;
  if (PILOT_WEAPONS[wid]) S.wxp[wid] = (S.wxp[wid] || 0) + (kind === 'ship' ? dmg * PILOT_PROF_XP.dmg + (kill ? PILOT_PROF_XP.ship : 0) : kind === 'heal' ? dmg * PILOT_PROF_XP.heal : PILOT_PROF_XP[kind] || 0);   // 武器熟練度
  PL.hitT = U.uTime.value;
  S.hits++;
  if (kind === 'hitF') return;
  if (kind === 'heal') { S.heal += dmg; S.merit += dmg * PILOT_MERIT.heal; return; }
  if (kind === 'ftr') { S.kf++; S.merit += PILOT_MERIT.ftr; pilotFeed(`擊墜敵機（第 ${S.kf} 架）`, 'kill'); if (PL.mis && PL.mis.type === 'kills') PL.mis.prog++; return; }
  if (kind === 'ship') {
    S.dmg += dmg; S.merit += dmg * PILOT_MERIT.dmg;
    const M = PL.mis; if (M && M.type === 'damage') M.prog += dmg;
    if (M && kill && (M.type === 'hunt' || M.type === 'carrier')) { const k = M.tg.indexOf(i); if (k >= 0) { M.tg[k] = -1; M.prog++; pilotFeed(`擊沉指定目標！（${M.prog}／${M.goal}）`, 'kill'); } }
    if (kill) { S.ks++; S.merit += PILOT_MERIT.ship * (ships.type[i] <= 1 ? 2 : 1); pilotFeed(`擊沉敵${SHIP_TYPES[ships.type[i]].name}！`, 'kill'); }
  }
}
function pilotFeed(msg, cls = '') { PL.feed.push({ msg, cls, t: performance.now() }); if (PL.feed.length > 6) PL.feed.shift(); }

// ───── 任務：建立、每幀檢查 ─────
function pilotMisInit(C) {
  PL.mis = null; if (!C || !PILOT_MIS[C.type]) return;
  const M = PL.mis = { ...C, bonus: (C.bonus || []).slice(), prog: 0, done: false, failed: false, why: '', doneT: 0, t0: U.uTime.value, tg: [], esc: -1, minHp: 1, nextWave: U.uTime.value + 25, friendly: 0 };
  const es = 1 - PL.side;
  if (M.type === 'hunt') {
    for (const ty of [2, 3, 4, 1]) for (let i = 0; i < shipCount && M.tg.length < M.goal; i++) if (ships.alive[i] && ships.side[i] === es && ships.type[i] === ty && !squadrons[ships.sq[i]].bg && squadrons[ships.sq[i]].flagship !== i && !M.tg.some((g) => ships.sq[g] === ships.sq[i]) && plRnd() < 0.08) M.tg.push(i);
    for (let i = 0; i < shipCount && M.tg.length < M.goal; i++) if (ships.alive[i] && ships.side[i] === es && ships.type[i] >= 2 && ships.type[i] <= 4 && !M.tg.includes(i)) M.tg.push(i);   // 不夠：照順序補
    M.tgType = M.tg.map((i) => ships.type[i]);
  }
  if (M.type === 'carrier') {
    const c = pilotFindShip(es, 0, M.tg); if (c < 0) { M.type = 'hunt'; M.goal = 1; return pilotMisInit({ ...C, type: 'hunt', goal: 1 }); }
    M.tg = [c]; M.tgType = [0];
  }
  if (M.type === 'escort') {
    let best = -1; for (let i = 0; i < shipCount; i++) if (ships.alive[i] && ships.side[i] === PL.side && ships.type[i] === 0 && !squadrons[ships.sq[i]].bg && (best < 0 || (best === PL.home && i !== PL.home))) best = i;
    M.esc = best; if (best < 0) return pilotMisInit({ ...C, type: 'kills', goal: PILOT_MIS.kills.goal(C.li) });
  }
}
// 某一方、某艦種、還活著、不在 skip 裡的一艘（隨機挑一支分艦隊）
function pilotFindShip(side, ty, skip) {
  const c = []; for (let i = 0; i < shipCount; i++) if (ships.alive[i] && ships.side[i] === side && ships.type[i] === ty && !squadrons[ships.sq[i]].bg && !skip.includes(i)) c.push(i);
  return c.length ? c[Math.floor(plRnd() * c.length)] : -1;
}
function pilotMisDone() {
  const M = PL.mis; if (M.done || M.failed) return;
  M.done = true; M.doneT = U.uTime.value - M.t0;
  pilotFeed(`任務完成！按 ${plKey('pilot_land')} 降落航母結算，或繼續作戰`, 'kill');
  toast(`任務完成：${PILOT_MIS[M.type].name}。靠近己方航母按 ${plKey('pilot_land')} 降落結算（繼續打可以多拿戰功、完成額外目標）`, 'pilot');
}
function pilotMisFail(why) {
  const M = PL.mis; if (!M || M.done || M.failed) return;
  M.failed = true; M.why = why;
  toast(`任務失敗：${why}`, 'bad');
  if (!GAME.result) GAME.result = battleResult('end', '任務失敗：' + why, { pilotFail: true });
}
function pilotMisTick() {
  const M = PL.mis; if (!M || GAME.result || M.failed) return;
  const t = U.uTime.value, es = 1 - PL.side;
  if (M.type === 'hunt' || M.type === 'carrier') {
    // 指定目標被友軍打掉：不算失敗，換一艘同艦種的；沒有可以換的就當作已排除
    M.tg.forEach((i, k) => {
      if (i < 0 || ships.alive[i]) return;
      const n = pilotFindShip(es, M.tgType[k], M.tg);
      if (n >= 0) { M.tg[k] = n; pilotFeed('指定目標被友軍擊沉：改派新目標', 'hint'); } else { M.tg[k] = -1; M.prog++; M.friendly++; pilotFeed('指定目標被友軍擊沉（已沒有同類目標）', 'hint'); }
    });
  }
  if (M.type === 'escort' && !M.done) {
    const c = M.esc;
    if (!ships.alive[c]) { pilotMisFail('護衛的航母被擊沉'); return; }
    M.minHp = Math.min(M.minHp, ships.hp[c] / maxHp(c));
    M.prog = Math.min(M.goal, t - M.t0);
    if (t >= M.nextWave) { M.nextWave = t + Math.max(18, 32 - 3 * M.li); pilotStrikeWave(M); }
  }
  if (M.type === 'escort' && M.done && ships.alive[M.esc]) M.minHp = Math.min(M.minHp, ships.hp[M.esc] / maxHp(M.esc));
  if (!M.done && M.prog >= M.goal) pilotMisDone();
}
// 護衛任務：敵方航母派攻擊機、光束攻擊機往護衛目標打
function pilotStrikeWave(M) {
  _pa.set(0, 0, 0); shipWorldCPU(M.esc, _pa); const area = { x: _pa.x, y: _pa.y, z: _pa.z }, t = U.uTime.value, es = 1 - PL.side;
  const cs = []; for (let i = 0; i < shipCount; i++) if (ships.alive[i] && ships.side[i] === es && ships.type[i] === 0 && !squadrons[ships.sq[i]].bg) cs.push(i);
  if (!cs.length) return;
  const n = 3 + M.li; let got = 0;
  for (let k = 0; k < n; k++) got += launchCraft(cs[k % cs.length], 1, 0, -1, t + k * 0.3, k % 3 === 2 ? 3 : 1, area);
  if (got) pilotFeed(`敵方打擊群（${got} 架）正飛向護衛目標！`, 'bad');
}
function pilotBonusOk(id, R) {
  const M = PL.mis, S = PL.stats;
  if (id === 'nodeath') return S.deaths === 0;
  if (id === 'fast') return M.done && M.doneT <= M.T * 0.6;
  if (id === 'extra') return S.kf >= 3;
  if (id === 'fleet') return !!R && R.kind === 'win';
  if (id === 'hp50') return M.minHp >= 0.5;
  return false;
}
// ───── 鏡頭（每幀） ─────
function pilotCamera() {
  const j = PL.j, P = [fP[j * 3], fP[j * 3 + 1], fP[j * 3 + 2]], A = pilotAim(), FL = PILOT_FTR_LEN;
  camera = camPersp;
  camPersp.aspect = VW / VH; camPersp.near = 0.04; camPersp.far = 7000;
  if (PL.cock && !PL.dead) {
    const F = PL.F, U = PL.U;
    camPersp.fov = 72;
    camPersp.position.set(P[0] + U[0] * 0.12 * FL + F[0] * 0.15 * FL, P[1] + U[1] * 0.12 * FL + F[1] * 0.15 * FL, P[2] + U[2] * 0.12 * FL + F[2] * 0.15 * FL);
    camPersp.up.set(U[0], U[1], U[2]);
    camPersp.lookAt(camPersp.position.x + F[0], camPersp.position.y + F[1], camPersp.position.z + F[2]);
    CAM_DIR.set(-F[0], -F[1], -F[2]);
  } else {
    // 背後：沿瞄準方向往後拉，鏡頭不跟著側傾
    const Wu = v3.norm([-A[0] * A[1], 1 - A[1] * A[1], -A[2] * A[1]]), dist = 5.2 * FL * PL.camD * (PL.dead ? 3 : 1), up = 1.3 * FL * PL.camD;
    camPersp.fov = 68 + (PL.boosting ? 8 : 0);
    camPersp.position.set(P[0] - A[0] * dist + Wu[0] * up, P[1] - A[1] * dist + Wu[1] * up, P[2] - A[2] * dist + Wu[2] * up);
    camPersp.up.set(Wu[0], Wu[1], Wu[2]);
    camPersp.lookAt(camPersp.position.x + A[0], camPersp.position.y + A[1], camPersp.position.z + A[2]);
    CAM_DIR.set(-A[0], -A[1], -A[2]);
  }
  camPersp.updateProjectionMatrix();
  renderPass.camera = camera;
  view.target.set(P[0], 0, P[2]); view.height = 160;
}
// 自己的機：照機體的前／上畫（會側傾）；座艙視角不畫
function pilotDrawSelf(lod, x, y, z, L) {
  if (lod < 0 || lod > 3 || (PL.cock && !PL.dead) || PL.spec) return;
  const ms = R3.meshByKey[FAC_KEY[shipFac(FT.carrier[PL.j])] + 'f'] || R3.meshByKey.ef, mesh = ms && ms[lod]; if (!mesh) return;
  const F = PL.F, U = PL.U, Rr = v3.cross(U, F), e = mesh.instanceMatrix.array, o = mesh.count * 16;
  e.set([Rr[0] * L, Rr[1] * L, Rr[2] * L, 0, U[0] * L, U[1] * L, U[2] * L, 0, F[0] * L, F[1] * L, F[2] * L, 0, x, y, z, 1], o);
  mesh.count++;
}

// ───── 輸入 ─────
function pilotKey(e) {
  const k = e.code;
  if (k.startsWith('F') && /^F\d+$/.test(k)) return false;   // F1～F12 照原本（例如設定）
  e.preventDefault();
  if (e.repeat) return true;
  PL.keys.add(k);
  if (pilotLive()) for (let s = 0; s < PILOT_SLOTS.length; s++) if (plCodeIs('pilot_w' + (s + 1), k)) { PL.fire[s] = true; PL.press[s] = true; }   // 武裝的鍵盤按鍵
  if (plCodeIs('pilot_view', k)) { PL.cock = !PL.cock; pilotFeed(PL.cock ? '座艙視角' : '背後視角', 'hint'); }
  if (plCodeIs('pilot_target', k)) pilotPickTarget();
  if (plCodeIs('pilot_land', k) && pilotLive()) pilotLandReq();
  if (k === 'Escape') pilotPause(true);
  if (k === 'KeyP') pilotPause(!paused);
  return true;
}
addEventListener('keyup', (e) => { PL.keys.delete(e.code); for (let s = 0; s < PILOT_SLOTS.length; s++) if (plCodeIs('pilot_w' + (s + 1), e.code)) PL.fire[s] = false; });
addEventListener('blur', () => { PL.keys.clear(); PL.fire.fill(false); });
function pilotWheel(d) { PL.camD = Math.max(0.6, Math.min(3, PL.camD * Math.exp(d * 0.001))); }
function pilotLive() { return PL.on && !PL.spec && GAME.phase === 'battle' && !GAME.result; }
canvas.addEventListener('mousedown', (e) => {
  if (!pilotLive()) return;
  e.preventDefault();
  if (document.pointerLockElement !== canvas) { if (paused) pilotPause(false); else pilotLock(); return; }
  if (e.button === 0 || e.button === 2) { const k = e.button === 0 ? 0 : 1; PL.fire[k] = true; PL.press[k] = true; }
});
addEventListener('mouseup', (e) => { if (!PL.on) return; if (e.button === 0) PL.fire[0] = false; if (e.button === 2) PL.fire[1] = false; });
addEventListener('mousemove', (e) => {
  if (!pilotLive() || document.pointerLockElement !== canvas || paused || PL.dock) return;   // 自動降落／起飛中不能轉向
  const k = 0.0021 * (PL.cock ? 0.9 : 1);
  PL.yaw -= e.movementX * k; PL.pitch = Math.max(-1.4, Math.min(1.4, PL.pitch - e.movementY * k));
});
document.addEventListener('pointerlockchange', () => {
  PL.locked = document.pointerLockElement === canvas;
  if (!PL.locked) { PL.fire.fill(false); if (pilotLive() && !paused) pilotPause(true); }
});
function pilotLock() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 不支援 */ } }
function pilotPause(on) {
  if (on) {
    paused = true; updateTimeUI(); if (document.pointerLockElement) document.exitPointerLock();
    if (PL.pauseEl) PL.pauseEl.hidden = false;
  } else { if (PL.pauseEl) PL.pauseEl.hidden = true; paused = false; updateTimeUI(); pilotLock(); }
}
// T：鎖定準心附近（角度最小）的敵人：艦載機優先，沒有才找船
function pilotPickTarget() {
  const j = PL.j, px = fP[j * 3], py = fP[j * 3 + 1], pz = fP[j * 3 + 2], A = pilotAim(), es = 1 - PL.side;
  let best = null, bc = Math.cos(0.3);
  for (const f of aliveF[es]) { if (FT.kind[f] === 1) continue; const dx = fP[f * 3] - px, dy = fP[f * 3 + 1] - py, dz = fP[f * 3 + 2] - pz, d = Math.hypot(dx, dy, dz); if (d > 900) continue; const c = (dx * A[0] + dy * A[1] + dz * A[2]) / d + 0.02; if (c > bc) { bc = c; best = { k: 'f', i: f }; } }
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].bg) continue;
    shipWorldCPU(i, _pa); const dx = _pa.x - px, dy = _pa.y - py, dz = _pa.z - pz, d = Math.hypot(dx, dy, dz); if (d > 1200) continue;
    const c = (dx * A[0] + dy * A[1] + dz * A[2]) / d; if (c > bc) { bc = c; best = { k: 's', i }; }
  }
  PL.tgt = best;
  pilotFeed(best ? `鎖定：${best.k === 'f' ? '敵艦載機' : '敵' + SHIP_TYPES[ships.type[best.i]].name}` : '準心附近沒有敵人', 'hint');
}
function pilotTgtPos(T, out) {
  if (!T) return null;
  if (T.k === 'f') { if (FT.state[T.i] !== 2 || FT.side[T.i] === PL.side) return null; out.set(fP[T.i * 3], fP[T.i * 3 + 1], fP[T.i * 3 + 2]); return out; }
  if (!ships.alive[T.i]) return null; shipWorldCPU(T.i, out); return out;
}

// ───── 儀表（每幀） ─────
function pilotHudBuild() {
  if (!PL.el) {
    PL.el = document.createElement('canvas'); PL.el.id = 'pilothud'; document.body.appendChild(PL.el); PL.ctx = PL.el.getContext('2d');
    PL.pauseEl = document.createElement('div'); PL.pauseEl.id = 'pilotpause'; document.body.appendChild(PL.pauseEl);
  }
  {
    PL.pauseEl.innerHTML = `<div class="g-card"><h3>暫停</h3><div class="g-dim" style="margin-bottom:10px">滑鼠瞄準・${plKey('pilot_thr_up')}／${plKey('pilot_thr_dn')} 油門・${plKey('pilot_roll_l')}／${plKey('pilot_roll_r')} 翻滾・${plKey('pilot_boost')} 加速・${PILOT_SLOTS.map((S, k) => plSlotKey(k)).join('／')} 武裝・${plKey('pilot_target')} 鎖定・${plKey('pilot_view')} 視角・${plKey('pilot_land')} 降落整補（按鍵在「設定」修改）</div>
      <div class="g-row"><button class="g-btn" id="plp-quit">結束出擊</button><span class="g-sp"></span><button class="g-btn pri" id="plp-go">繼續駕駛</button></div></div>`;
    PL.pauseEl.querySelector('#plp-go').onclick = () => pilotPause(false);
    PL.pauseEl.querySelector('#plp-quit').onclick = () => { PL.pauseEl.hidden = true; paused = false; updateTimeUI(); quitBattle(); };
  }
  PL.el.hidden = false; PL.pauseEl.hidden = true;
}
function pilotFrame(dt) {
  if (!PL.on) return;
  if (GAME.phase !== 'battle') return;
  if (GAME.result && document.pointerLockElement) document.exitPointerLock();
  // 油門（每幀依按鍵調整）
  if (!paused && !PL.spec) { if (plHeld('pilot_thr_up')) PL.thr = Math.min(1, PL.thr + dt * 0.8); if (plHeld('pilot_thr_dn')) PL.thr = Math.max(0, PL.thr - dt * 0.8); }
  if (PL.dead && !PL.spec && !GAME.result && U.uTime.value - PL.deadT > PL.respawn) pilotSpawn(false);
  if (!PL.spec) updateCamera();
  pilotMisTick();
  pilotBeamFrame();
  pilotHitFrame();
  pilotHud();
}
function pilotHud() {
  const c = PL.el, g = PL.ctx, dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (PL.spec) { pilotText(g, W / 2, 110, '己方航母全滅：觀戰中', '#ff9a7a', 16); return; }
  const fac = SIDE_FAC[PL.side], col = FACTION[fac].ui, red = '#ff6a5a', t = U.uTime.value, now = performance.now();
  const sw = (x, y, z) => { _pp.set(x, y, z).project(camera); return _pp.z < 1 && _pp.z > -1 ? [(_pp.x * 0.5 + 0.5) * VW, (-_pp.y * 0.5 + 0.5) * VH] : null; };
  const j = PL.j, px = fP[j * 3], py = fP[j * 3 + 1], pz = fP[j * 3 + 2], A = pilotAim(), F = PL.F, es = 1 - PL.side;
  g.lineWidth = 1.5; g.font = '12px "Noto Sans TC", sans-serif'; g.textBaseline = 'middle';
  if (PL.cock && !PL.dead) pilotCockpit(g, W, H, col);
  if (!PL.dead) {
    // 準心（瞄準方向）、機首（武器實際指向）
    const a = sw(px + A[0] * 400, py + A[1] * 400, pz + A[2] * 400);
    if (a) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(a[0], a[1], 9, 0, Math.PI * 2); g.stroke(); }
    const n = sw(px + F[0] * 160, py + F[1] * 160, pz + F[2] * 160);
    if (n) { g.strokeStyle = col; g.beginPath(); g.moveTo(n[0] - 12, n[1]); g.lineTo(n[0] - 4, n[1]); g.moveTo(n[0] + 4, n[1]); g.lineTo(n[0] + 12, n[1]); g.moveTo(n[0], n[1] - 12); g.lineTo(n[0], n[1] - 4); g.moveTo(n[0], n[1] + 4); g.lineTo(n[0], n[1] + 12); g.stroke(); }
    if (t - PL.hitT < 0.15 && n) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(n[0] - 16, n[1] - 16); g.lineTo(n[0] - 9, n[1] - 9); g.moveTo(n[0] + 16, n[1] - 16); g.lineTo(n[0] + 9, n[1] - 9); g.moveTo(n[0] - 16, n[1] + 16); g.lineTo(n[0] - 9, n[1] + 9); g.moveTo(n[0] + 16, n[1] + 16); g.lineTo(n[0] + 9, n[1] + 9); g.stroke(); g.lineWidth = 1.5; }
  }
  // 敵方艦載機（近的）：小菱形；敵艦（近的）：小方框
  g.strokeStyle = red;
  let nF = 0;
  for (const f of aliveF[es]) {
    if (nF > 60) break;
    const x = fP[f * 3], y = fP[f * 3 + 1], z = fP[f * 3 + 2], d = Math.hypot(x - px, y - py, z - pz); if (d > 700) continue;
    const s = sw(x, y, z); if (!s) continue; nF++;
    const r = d < 150 ? 6 : 4; g.beginPath(); g.moveTo(s[0], s[1] - r); g.lineTo(s[0] + r, s[1]); g.lineTo(s[0], s[1] + r); g.lineTo(s[0] - r, s[1]); g.closePath(); g.stroke();
  }
  const labs = [];
  for (const sq of squadrons) {
    if (sq.alive <= 0 || sq.bg || sq.hidden || sq.side === PL.side) continue;
    const d = Math.hypot(sq.x - px, (sq.y || 0) - py, sq.z - pz), s = sw(sq.x, sq.y || 0, sq.z); if (!s) continue;
    if (d > 160) { labs.push([d, s]); continue; }
    g.strokeStyle = 'rgba(255,106,90,.5)';   // 近的敵艦：小方框（每支分艦隊最多 12 艘、只框 120 內的）
    let nb = 0; for (const i of sq.list) { if (nb >= 12) break; if (!ships.alive[i]) continue; shipWorldCPU(i, _pa); if (Math.hypot(_pa.x - px, _pa.y - py, _pa.z - pz) > 120) continue; const p2 = sw(_pa.x, _pa.y, _pa.z); if (!p2) continue; nb++; g.strokeRect(p2[0] - 5, p2[1] - 5, 10, 10); }
  }
  labs.sort((a, b) => a[0] - b[0]); g.fillStyle = 'rgba(255,106,90,.8)';   // 遠的敵方分艦隊：只標最近的 6 支（距離）
  for (const [d, s] of labs.slice(0, 6)) g.fillText(`▼ ${Math.round(d)}`, s[0] + 6, s[1]);
  if (PL.home >= 0 && ships.alive[PL.home]) { shipWorldCPU(PL.home, _pa); const s = sw(_pa.x, _pa.y, _pa.z); if (s) { g.strokeStyle = '#8fe39a'; g.strokeRect(s[0] - 7, s[1] - 7, 14, 14); g.fillStyle = '#8fe39a'; g.fillText(`母艦 ${Math.round(Math.hypot(_pa.x - px, _pa.y - py, _pa.z - pz))}`, s[0] + 10, s[1]); } }
  // 指定目標：方框＋距離＋提前量（直射武器）
  const T = pilotTgtPos(PL.tgt, _pb);
  if (PL.tgt && !T) PL.tgt = null;
  if (T && !PL.dead) {
    const d = Math.hypot(T.x - px, T.y - py, T.z - pz), s = sw(T.x, T.y, T.z);
    if (s) {
      g.strokeStyle = '#ffd36a'; g.lineWidth = 2; const r = 16;
      g.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(s[0] + sx * r, s[1] + sy * (r - 6)); g.lineTo(s[0] + sx * r, s[1] + sy * r); g.lineTo(s[0] + sx * (r - 6), s[1] + sy * r); } g.stroke();
      g.fillStyle = '#ffd36a'; g.fillText(`${Math.round(d)}`, s[0] + r + 4, s[1] - r);
      const gun = PL.slots.map((S) => PILOT_WEAPONS[S.id]).find((w) => w.type === 'gun' && (!w.shipOnly || PL.tgt.k === 's'));
      if (gun && PL.tgt.k === 'f' && d < gun.range * 1.6) {
        const tf = d / gun.speed, i = PL.tgt.i, L = sw(T.x + fV[i * 3] * tf, T.y + fV[i * 3 + 1] * tf, T.z + fV[i * 3 + 2] * tf);
        if (L) { g.beginPath(); g.arc(L[0], L[1], 5, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(L[0], L[1]); g.globalAlpha = 0.4; g.stroke(); g.globalAlpha = 1; }
      }
      g.lineWidth = 1.5;
    } else pilotEdgeArrow(g, T, '#ffd36a');
  }
  // 鎖定中的武器：鎖定圈
  PL.slots.forEach((S) => {
    const Wd = PILOT_WEAPONS[S.id]; if (Wd.type !== 'lock' || S.lock < 0 || PL.dead) return;
    const p = S.lockK === 'f' ? (FT.state[S.lock] === 2 ? [fP[S.lock * 3], fP[S.lock * 3 + 1], fP[S.lock * 3 + 2]] : null) : ships.alive[S.lock] ? (shipWorldCPU(S.lock, _pa), [_pa.x, _pa.y, _pa.z]) : null;
    const s = p && sw(p[0], p[1], p[2]); if (!s) return;
    const k = Math.min(1, S.lockT / Math.max(0.01, S.need)), done = k >= 1;
    g.strokeStyle = done ? '#ff4040' : '#ffb060'; g.lineWidth = 2; g.beginPath(); g.arc(s[0], s[1], 22 - k * 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke(); g.lineWidth = 1.5;
    if (done) { g.fillStyle = '#ff4040'; g.fillText('鎖定', s[0] + 20, s[1] + 18); }
  });
  pilotMisHud(g, W, H, sw, px, py, pz);
  const LY = pilotHudLayout(W, H);
  pilotRadar(g, LY, px, py, pz, col, red);
  pilotGauges(g, W, H, col, LY);
  // 訊息
  PL.feed = PL.feed.filter((m) => now - m.t < 4000);
  PL.feed.forEach((m, k) => { g.globalAlpha = Math.min(1, (4000 - (now - m.t)) / 600); pilotText(g, W / 2, H * 0.24 + k * 20, m.msg, m.cls === 'bad' ? red : m.cls === 'kill' ? '#ffd36a' : m.cls === 'ok' ? '#8fe39a' : 'rgba(230,235,245,.85)', 14); });
  g.globalAlpha = 1;
  if (PL.out > 0) pilotText(g, W / 2, H * 0.36, PL.out > 4 ? '超出戰區：自動返回' : '即將超出戰區，請返回', red, 16);
  if (PL.selfFix && U.uTime.value - PL.selfFix < 0.1 && !PL.dock) pilotText(g, W / 2, H * 0.66, '自我修復中…', '#8fe39a', 13);
  if (PL.dock) pilotText(g, W / 2, H * 0.62, PL.dock.ph === 'in' ? '自動降落中…' : PL.dock.ph === 'deck' ? `整補中… ${Math.round(PL.rearm * 100)}%` : '彈射起飛！', '#8fe39a', 15);
  else if (!PL.dead && (simTick % 20 === 0 || PL.nearC == null)) PL.nearC = pilotNearCarrier(px, py, pz, PILOT_DOCK.range) >= 0;
  if (!PL.dock && !PL.dead && PL.nearC) pilotText(g, W / 2, H * 0.62, `按 ${plKey('pilot_land')} 降落整補`, 'rgba(143,227,154,.85)', 13);
  if (t - PL.hurtT < 0.35) { const k = 1 - (t - PL.hurtT) / 0.35, c = PL.hurtSh ? '80,160,255' : '255,40,30', gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7); gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(1, `rgba(${c},${(PL.hurtSh ? 0.25 : 0.45) * k})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  // 受擊方向：準心外圍的弧，指向打來的方向（紅＝打到機體、藍＝護盾擋下），1.2 秒淡出
  PL.hits = PL.hits.filter((h) => now - h.t < 1200);
  for (const h of PL.hits) {
    _pp.set(h.x, h.y, h.z).applyMatrix4(camera.matrixWorldInverse);
    const a = Math.atan2(-_pp.y, _pp.x), al = 1 - (now - h.t) / 1200, r = Math.min(W, H) * 0.16;
    g.strokeStyle = h.hull ? `rgba(255,74,58,${al})` : `rgba(124,196,255,${al * 0.85})`; g.lineWidth = h.hull ? 6 : 4;
    g.beginPath(); g.arc(W / 2, H / 2, r, a - 0.32, a + 0.32); g.stroke();
  }
  g.lineWidth = 1.5;
  if (PL.dead) { pilotText(g, W / 2, H * 0.42, '被擊墜', red, 26); pilotText(g, W / 2, H * 0.42 + 32, `${Math.max(0, Math.ceil(PL.respawn - (t - PL.deadT)))} 秒後從母艦重新出擊`, 'rgba(230,235,245,.9)', 14); }
  if (!PL.locked && !paused && !GAME.result) pilotText(g, W / 2, H * 0.55, '點一下畫面開始駕駛（滑鼠游標會被鎖定・Esc 暫停）', '#fff', 15);
}
// 座艙框：上方兩根支柱、下方儀表板（跟著機體側傾的是鏡頭，框固定在畫面上）
function pilotCockpit(g, W, H, col) {
  g.save(); g.fillStyle = 'rgba(14,18,26,.92)'; g.strokeStyle = facRGBA(SIDE_FAC[PL.side], 0.35); g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.8); g.quadraticCurveTo(W * 0.5, H * 0.7, W, H * 0.8); g.lineTo(W, H); g.closePath(); g.fill(); g.stroke();
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + sx * W * 0.62, 0); g.lineTo(W / 2 + sx * W * 0.5, 0); g.lineTo(W / 2 + sx * W * 0.34, H * 0.76); g.lineTo(W / 2 + sx * W * 0.4, H * 0.78); g.closePath(); g.fill(); g.stroke(); }
  g.restore();
}
// 光矛的實體光束：白色核心＋陣營色光暈（加亮混合，會被泛光放大），寬度閃動
const PL_BEAM = (() => {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), mk = (c, o) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
  const g = new THREE.Group(), core = mk(0xffffff, 0.95), glow = mk(0xffaa55, 0.4), halo = mk(0xffaa55, 0.15);
  g.add(halo, glow, core); g.visible = false; g.renderOrder = 7; for (const m of [core, glow, halo]) m.frustumCulled = false; scene.add(g);
  return { g, core, glow, halo };
})();
const _bmY = new THREE.Vector3(0, 1, 0), _bmD = new THREE.Vector3(), _healCol = new THREE.Color(0.35, 1.0, 0.55);
const PL_HIT = (() => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.visible = false; m.renderOrder = 8; m.frustumCulled = false; scene.add(m); return m;
})();
const _hitHull = new THREE.Color(1.0, 0.55, 0.2), _hitSh = new THREE.Color(0.45, 0.75, 1.0);
function pilotHitFrame() {
  const f = PL.flash, age = f ? (performance.now() - f.t) / 1000 : 9, on = PL.on && !PL.spec && !PL.dead && !PL.cock && age < 0.22;
  PL_HIT.visible = on; if (!on) return;
  const j = PL.j, FL = PILOT_FTR_LEN; let ox = 0, oy = 0, oz = 0;
  if (f.src) { const dx = f.src[0] - fP[j * 3], dy = f.src[1] - fP[j * 3 + 1], dz = f.src[2] - fP[j * 3 + 2], d = Math.hypot(dx, dy, dz) || 1; ox = dx / d * FL * 0.3; oy = dy / d * FL * 0.3; oz = dz / d * FL * 0.3; }   // 偏向打來的那一側
  PL_HIT.position.set(fP[j * 3] + ox, fP[j * 3 + 1] + oy, fP[j * 3 + 2] + oz);
  const k = age / 0.22; PL_HIT.scale.setScalar(FL * (f.hull ? 0.22 + k * 0.4 : 0.75 + k * 0.25));
  PL_HIT.material.color.copy(f.hull ? _hitHull : _hitSh); PL_HIT.material.opacity = (1 - k) * (f.hull ? 0.85 : 0.5);
}
function pilotBeamFrame() {
  const B = PL.beam, on = PL.on && !PL.spec && !PL.dead && !PL.dock && B && B.b && U.uTime.value - B.t < 0.06;
  PL_BEAM.g.visible = !!on; if (!on) return;
  const j = PL.j, F = PL.F, a = [fP[j * 3] + F[0] * 0.45, fP[j * 3 + 1] + F[1] * 0.45, fP[j * 3 + 2] + F[2] * 0.45];
  _bmD.set(B.b[0] - a[0], B.b[1] - a[1], B.b[2] - a[2]); const len = _bmD.length() || 0.01; _bmD.divideScalar(len);
  PL_BEAM.g.position.set((a[0] + B.b[0]) / 2, (a[1] + B.b[1]) / 2, (a[2] + B.b[2]) / 2); PL_BEAM.g.quaternion.setFromUnitVectors(_bmY, _bmD);
  const now = performance.now() / 1000, w = 0.02 * (1 + 0.35 * Math.sin(now * 53) + 0.2 * Math.sin(now * 31)), col = B.heal ? _healCol : FACTION[SIDE_FAC[PL.side]].beam;
  PL_BEAM.core.scale.set(w, len, w); PL_BEAM.glow.scale.set(w * 3.2, len, w * 3.2); PL_BEAM.halo.scale.set(w * 8, len, w * 8);
  PL_BEAM.glow.material.color.copy(col); PL_BEAM.halo.material.color.copy(col);
}
function pilotMisHud(g, W, H, sw, px, py, pz) {
  const M = PL.mis; if (!M) return;
  // 指定目標（橘）、護衛目標（綠）
  const mark = (i, c, txt) => {
    shipWorldCPU(i, _pb); const s = sw(_pb.x, _pb.y, _pb.z), d = Math.hypot(_pb.x - px, _pb.y - py, _pb.z - pz);
    if (!s) { pilotEdgeArrow(g, _pb, c); return; }
    g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(s[0], s[1] - 14); g.lineTo(s[0] + 14, s[1]); g.lineTo(s[0], s[1] + 14); g.lineTo(s[0] - 14, s[1]); g.closePath(); g.stroke(); g.lineWidth = 1.5;
    g.fillStyle = c; g.fillText(`${txt} ${Math.round(d)}`, s[0] + 18, s[1] + 12);
  };
  for (const i of M.tg) if (i >= 0 && ships.alive[i]) mark(i, '#ff9f40', `目標・${SHIP_TYPES[ships.type[i]].name}`);
  if (M.esc >= 0 && ships.alive[M.esc]) mark(M.esc, '#8fe39a', `護衛 ${Math.round(ships.hp[M.esc] / maxHp(M.esc) * 100)}%`);
  // 左上：任務欄
  const x = 18, y0 = 96, lines = [];
  const P = PILOT_MIS[M.type], prog = M.type === 'escort' ? `${_fmtT(M.prog)}／${_fmtT(M.goal)}` : M.type === 'damage' ? `${fmtN(Math.floor(M.prog))}／${fmtN(M.goal)}` : `${M.prog}／${M.goal}`;
  lines.push([`任務・${P.name}　${prog}`, M.done ? '#8fe39a' : '#ffd36a', 14]);
  lines.push([M.done ? `完成！按 ${plKey('pilot_land')} 降落航母結算` : P.text(M.goal), M.done ? '#8fe39a' : 'rgba(225,232,242,.85)', 12]);
  lines.push([`被擊墜 ${PL.stats.deaths}／${M.deaths}`, PL.stats.deaths >= M.deaths ? '#ff6a5a' : 'rgba(225,232,242,.75)', 12]);
  for (const b of M.bonus) { const ok = b === 'fleet' ? null : pilotBonusOk(b); lines.push([`${ok ? '✓' : ok === false && (b === 'nodeath' || b === 'hp50') ? '✗' : '・'} ${PILOT_BONUS[b].name}`, ok ? '#8fe39a' : ok === false && (b === 'nodeath' || b === 'hp50') ? 'rgba(255,106,90,.8)' : 'rgba(225,232,242,.7)', 12]); }
  const h = lines.length * 18 + 12; g.fillStyle = 'rgba(6,12,22,.55)'; g.fillRect(x - 8, y0 - 14, 330, h);
  lines.forEach(([t, c, sz], k) => { g.font = `${sz > 12 ? '600 ' : ''}${sz}px "Noto Sans TC", sans-serif`; g.fillStyle = c; g.fillText(t, x, y0 + k * 18); });
  g.font = '12px "Noto Sans TC", sans-serif';
}
function pilotText(g, x, y, s, c, size) { g.font = `600 ${size}px "Noto Sans TC", sans-serif`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(s, x, y); g.fillStyle = c; g.fillText(s, x, y); g.textAlign = 'left'; g.font = '12px "Noto Sans TC", sans-serif'; g.lineWidth = 1.5; }
function pilotEdgeArrow(g, T, c) {
  _pp.set(T.x, T.y, T.z).applyMatrix4(camera.matrixWorldInverse);
  const a = Math.atan2(-_pp.y, _pp.x), W = VW, H = VH, r = Math.min(W, H) * 0.38, x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r;
  g.fillStyle = c; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -8); g.lineTo(-6, 8); g.closePath(); g.fill(); g.restore();
}
// 雷達：以機首方向為上，半徑 600
// 儀表的位置：背後視角＝雷達在右下（設定可改左下），那一側的儀表往上移；座艙視角＝雷達在中央儀表板
function pilotHudLayout(W, H) {
  const R = 74;
  if (PL.cock && !PL.dead) return { R, cx: W / 2, cy: H - R - 18, cock: true, wBase: H - 104, gBase: H - 112 };
  const left = SETTINGS.pilotRadar === 'left', cy = H - R - 34;
  return { R, cx: left ? 22 + R : W - 22 - R, cy, wBase: left ? H - 104 : cy - R - 34, gBase: left ? cy - R - 100 : H - 112 };
}
function pilotRadar(g, LY, px, py, pz, col, red) {
  const R = LY.R, cx = LY.cx, cy = LY.cy, S = R / 600, h = Math.atan2(PL.F[0], PL.F[2]), ch = Math.cos(h), sh = Math.sin(h);
  if (LY.cock) { g.fillStyle = 'rgba(20,26,36,.95)'; g.strokeStyle = facRGBA(SIDE_FAC[PL.side], 0.5); g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R + 7, 0, Math.PI * 2); g.fill(); g.stroke(); g.lineWidth = 1.5; }   // 儀表板上的框
  g.fillStyle = 'rgba(6,12,22,.55)'; g.strokeStyle = 'rgba(160,190,220,.35)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.arc(cx, cy, R / 2, 0, Math.PI * 2); g.stroke();
  const pt = (x, z) => { const dx = x - px, dz = z - pz, u = -(dx * ch - dz * sh), v = dx * sh + dz * ch; const k = Math.hypot(u, v) * S; if (k > R - 2) return null; return [cx + u * S, cy - v * S]; };
  for (const sq of squadrons) {
    if (sq.alive <= 0 || sq.bg || sq.hidden) continue;
    const p = pt(sq.x, sq.z); if (!p) continue;
    g.fillStyle = sq.side === PL.side ? facRGBA(SIDE_FAC[PL.side], 0.85) : red; g.fillRect(p[0] - 2.5, p[1] - 2.5, 5, 5);
  }
  g.fillStyle = 'rgba(255,140,120,.9)';
  for (const f of aliveF[1 - PL.side]) { const p = pt(fP[f * 3], fP[f * 3 + 2]); if (p) g.fillRect(p[0] - 1, p[1] - 1, 2, 2); }
  if (PL.home >= 0 && ships.alive[PL.home]) { shipWorldCPU(PL.home, _pa); const p = pt(_pa.x, _pa.z); if (p) { g.strokeStyle = '#8fe39a'; g.strokeRect(p[0] - 4, p[1] - 4, 8, 8); } }
  g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 4, cy + 4); g.lineTo(cx - 4, cy + 4); g.closePath(); g.fill();
}
// 耐久、護盾、速度、加速、武裝
function pilotGauges(g, W, H, col, LY) {
  const Fr = PL.frame, x0 = 22, y0 = LY.gBase;
  const bar = (x, y, w, k, c, label, val) => { g.fillStyle = 'rgba(6,12,22,.6)'; g.fillRect(x, y, w, 8); g.fillStyle = c; g.fillRect(x, y, w * Math.max(0, Math.min(1, k)), 8); g.fillStyle = 'rgba(220,228,240,.85)'; g.fillText(label, x, y - 8); if (val != null) { g.textAlign = 'right'; g.fillText(val, x + w, y - 8); g.textAlign = 'left'; } };
  bar(x0, y0, 190, PL.sh / Fr.sh, '#7cc4ff', '護盾', Math.ceil(PL.sh));
  bar(x0, y0 + 26, 190, PL.hp / Fr.hp, PL.hp / Fr.hp < 0.35 ? '#ff6a5a' : '#8fe39a', '機體', Math.ceil(PL.hp));
  bar(x0, y0 + 52, 190, PL.boost, PL.boosting ? '#ffd36a' : 'rgba(255,211,106,.6)', '加速能量 (Shift)');
  g.fillStyle = col; g.font = '600 15px "Noto Sans TC", sans-serif'; g.fillText(`速度 ${Math.round(PL.speed)}`, x0, y0 + 80); g.font = '12px "Noto Sans TC", sans-serif';
  g.fillStyle = 'rgba(6,12,22,.6)'; g.fillRect(x0 + 90, y0 + 74, 100, 8); g.fillStyle = 'rgba(220,228,240,.8)'; g.fillRect(x0 + 90, y0 + 74, 100 * PL.thr, 8); g.fillText('油門 W/S', x0 + 196, y0 + 78);
  // 武裝
  const xr = W - 232;
  PL.slots.forEach((S, k) => {
    const Wd = PILOT_WEAPONS[S.id], y = LY.wBase - (PL.slots.length - 1 - k) * 46;
    g.fillStyle = 'rgba(6,12,22,.6)'; g.fillRect(xr, y - 14, 212, 40);
    g.fillStyle = PL.fire[k] ? '#fff' : col; g.font = '600 13px "Noto Sans TC", sans-serif'; g.fillText(`${plSlotKey(k)}　${Wd.name}`, xr + 8, y); g.font = '12px "Noto Sans TC", sans-serif';
    let k2 = 1, txt = '', c2 = col;
    if (Wd.type === 'gun') { if (Wd.ammo) { k2 = S.ammo / Math.max(1, S.max); txt = `${S.ammo} 發`; } else { k2 = 1 - S.heat; txt = S.over ? '過熱！' : `熱度 ${Math.round(S.heat * 100)}%`; c2 = S.over ? '#ff6a5a' : S.heat > 0.7 ? '#ffb060' : col; } }
    else if (Wd.type === 'lock') { k2 = S.ammo / Math.max(1, S.max); txt = `${S.ammo} 枚${S.lock >= 0 ? (S.lockT >= S.need ? '・已鎖定' : '・鎖定中') : ''}`; c2 = S.ammo ? col : '#ff6a5a'; }
    else { k2 = S.en; txt = S.empty ? '充能中' : `能量 ${Math.round(S.en * 100)}%`; c2 = S.empty ? '#ffb060' : col; }
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(xr + 8, y + 12, 196, 5); g.fillStyle = c2; g.fillRect(xr + 8, y + 12, 196 * Math.max(0, Math.min(1, k2)), 5);
    g.textAlign = 'right'; g.fillStyle = c2; g.fillText(txt, xr + 204, y); g.textAlign = 'left';
  });
  // 個人戰績
  const S = PL.stats; g.textAlign = 'right'; g.fillStyle = 'rgba(230,235,245,.9)'; g.font = '600 13px "Noto Sans TC", sans-serif';
  g.fillText(`擊墜 ${S.kf}　擊沉 ${S.ks}　戰功 ${Math.round(S.merit)}`, W - 20, 96); g.textAlign = 'left'; g.font = '12px "Noto Sans TC", sans-serif';
  g.fillStyle = 'rgba(200,210,225,.55)'; g.fillText(`${plKey('pilot_target')} 鎖定　${plKey('pilot_view')} ${PL.cock ? '背後' : '座艙'}視角　${plKey('pilot_land')} 降落整補　Esc 暫停`, x0, H - 14);
}

// ───── 戰後 ─────
function pilotReport() {
  const R = GAME.result, S = PL.stats || { kf: 0, ks: 0, dmg: 0, deaths: 0, shots: 0, hits: 0, merit: 0, heal: 0 }, m = SIM.m, M = PL.mis;
  setPhase('report');
  // 任務成敗：主要目標完成＝成功；護衛任務打到戰鬥結束、航母還活著也算成功
  if (M && !M.done && !M.failed && M.type === 'escort' && ships.alive[M.esc] && !R.retreat) { M.done = true; M.doneT = R.t; }
  const ok = !!M && M.done && !M.failed, li = M ? M.li : 0;
  const why = !M ? '' : ok ? '' : M.failed ? M.why : R.retreat && !R.pilotRtb ? '中途結束出擊' : '戰鬥結束前沒有完成主要目標';
  const bon = M ? M.bonus.map((b) => ({ b, ok: ok && pilotBonusOk(b, R) })) : [];
  const nOk = bon.filter((x) => x.ok).length, grade = !ok ? '失敗' : nOk === bon.length ? 'S' : bon.length - nOk === 1 ? 'A' : 'B';
  const fleet = R.kind === 'win' ? PILOT_MERIT.fleet : 0, base = ok ? PILOT_MERIT.mission[li] : 0, bonusM = nOk * PILOT_MERIT.bonus;
  const gain = Math.round(S.merit + base + bonusM + fleet);
  const p = pilotLoad(), before = PL.savedBefore != null ? PL.savedBefore : p.merit, lv0 = PL.lv0 != null ? PL.lv0 : pilotLevel(p.xp).lv, wx0 = PL.wx0 || { ...p.wxp };
  if (!PL.saved) {
    PL.saved = true; PL.savedBefore = before; PL.lv0 = lv0; PL.wx0 = wx0;
    p.xp += gain; for (const [id, x] of Object.entries(S.wxp || {})) p.wxp[id] = (p.wxp[id] || 0) + x;
    p.merit += gain; p.sorties++; if (ok) p.wins++; p.kf += S.kf; p.ks += S.ks; p.deaths += S.deaths; pilotSave(p);
  }
  const fresh = PILOT_WPN_ORDER.filter((id) => PILOT_WEAPONS[id].unlock > before && PILOT_WEAPONS[id].unlock <= p.merit).map((id) => PILOT_WEAPONS[id].name);
  const next = PILOT_WPN_ORDER.map((id) => PILOT_WEAPONS[id]).find((w) => w.unlock > p.merit);
  const fleetTxt = R.pilotRtb || R.pilotFail || R.retreat ? '艦隊戰尚未分出勝負' : { win: '我軍贏得艦隊戰', lose: '我軍輸掉艦隊戰', draw: '艦隊戰平手' }[R.kind] || '艦隊戰尚未分出勝負';
  overlay(`<div class="g-wrap" style="max-width:820px">
    <div class="g-head"><h2>出擊報告</h2><span class="crumb">${escH(m.name)}　·　${PL.frame ? PL.frame.name : ''}　·　戰鬥時間 ${_fmtT(R.t)}</span></div>
    <div class="g-card" style="margin-bottom:12px;text-align:center"><p class="result ${ok ? 'win' : 'lose'}">${ok ? `任務成功・評等 ${grade}` : '任務失敗'}</p>
      <div>${M ? escH(pilotMisText(M)) : ''}</div>${why ? `<div class="g-dim">${escH(why)}</div>` : ''}
      ${M && M.friendly ? `<div class="g-dim">其中 ${M.friendly} 個目標被友軍擊沉（不算失敗）</div>` : ''}
      <div class="g-dim" style="margin-top:6px">${fleetTxt}　·　我軍剩 ${Math.round(R.ratio[0] * 100)}%・敵軍剩 ${Math.round(R.ratio[1] * 100)}%</div></div>
    <div class="intel-grid">
      <div class="g-card"><h3>任務</h3><dl class="kv"><dt>主要目標</dt><dd>${ok ? '<b class="g-pc">完成</b>' : '未完成'}${M && M.done && M.doneT ? `（${_fmtT(M.doneT)}）` : ''}</dd>
        ${bon.map((x) => `<dt>額外目標</dt><dd>${x.ok ? '✓' : '✗'} ${PILOT_BONUS[x.b].name}</dd>`).join('') || '<dt>額外目標</dt><dd class="g-dim">這次沒有</dd>'}
        <dt>被擊墜</dt><dd>${S.deaths}／${M ? M.deaths : '-'} 次</dd></dl>
        <h3 style="margin-top:12px">個人戰績</h3><dl class="kv"><dt>擊墜敵機</dt><dd>${S.kf} 架</dd><dt>擊沉敵艦</dt><dd>${S.ks} 艘</dd><dt>對艦傷害</dt><dd>${fmtN(Math.round(S.dmg))}</dd>
        ${S.heal ? `<dt>維修量</dt><dd>${fmtN(Math.round(S.heal))}</dd>` : ''}<dt>射擊</dt><dd>${fmtN(S.shots)} 發${S.msl ? `・飛彈／魚雷 ${S.msl} 枚` : ''}</dd></dl></div>
      <div class="g-card"><h3>戰功</h3><dl class="kv"><dt>這次出擊</dt><dd><b>+${fmtN(gain)}</b></dd>
        <dd class="g-dim" style="grid-column:1/-1">戰鬥 ${fmtN(Math.round(S.merit))}＋任務 ${base}＋額外目標 ${bonusM}＋艦隊戰 ${fleet}</dd><dt>累積</dt><dd>${fmtN(p.merit)}</dd>
        ${fresh.length ? `<dt>新解鎖</dt><dd class="g-pc"><b>${fresh.join('、')}</b>（到機庫裝上）</dd>` : ''}
        <dt>飛行員</dt><dd>Lv ${pilotLevel(p.xp).lv}${pilotLevel(p.xp).lv > lv0 ? `　<b class="g-pc">升級！</b>天賦點數 ${pilotTalFree(p)} 點可分配` : pilotTalFree(p) > 0 ? `（天賦點數 ${pilotTalFree(p)} 點未分配）` : ''}</dd>
        ${Object.keys(S.wxp || {}).map((id) => { const a = pilotProf(wx0[id] || 0).lv, b = pilotProf(p.wxp[id] || 0); return `<dt>${PILOT_WEAPONS[id].name}熟練</dt><dd>+${fmtN(Math.round(S.wxp[id]))}　Lv ${b.lv}${b.lv > a ? ' <b class="g-pc">升級！</b>' : ''}${b.next ? `（${fmtN(Math.floor(b.xp))}／${fmtN(b.next)}）` : ''}</dd>`; }).join('')}
        <dt>下一個解鎖</dt><dd>${next ? `${next.name}（還差 ${fmtN(next.unlock - p.merit)}）` : '全部武裝都解鎖了'}</dd></dl>
        <div class="g-dim" style="font-size:calc(12px * var(--ui));margin-top:8px">個人紀錄只看任務成敗。駕駛的戰鬥沒有回放，也不算進指揮官的戰績。</div></div>
    </div>
    <div class="g-row" style="margin-top:14px"><button class="g-btn" id="pr-menu">單人戰鬥</button><span class="g-sp"></span><button class="g-btn" id="pr-hangar">機庫</button><button class="g-btn pri" id="pr-again">再出擊（新任務）→</button></div></div>`);
  gEl('pr-menu').onclick = showSingle;
  gEl('pr-hangar').onclick = showPilot;
  gEl('pr-again').onclick = pilotGo;
}
