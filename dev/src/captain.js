// ═══════════════════════ 艦長（特種作戰） ═══════════════════════
// 玩家是特種部隊的隊長：帶 1～5 艘特製戰艦，在近地戰場（行星地表）執行敵後作戰（破壞、斬首、全滅），完成後回撤離點。
// 玩家直接操控其中一艘：滑鼠＝船頭方向、W／S 油門、A／D 平移、空白鍵／C 升降、左鍵主砲、右鍵飛彈；其他艘是僚艦（1～4 下令、Tab 換船）。
// 敵軍多半是地面與海上單位：機動飛彈車、飛彈陣地、防空砲、海上軍艦（只在海港）、雷達站、通訊塔、機場（派戰機）；敵方戰艦很少（不超過我方）。
// 偵測：雷達站與各單位都有偵測範圍，被地形、巨型結構擋住就看不到；貼地飛（離地 lowAGL 內）雷達的範圍打折；開火會暴露一陣子。
//   被看到一陣子（偵測條滿）＝被發現：敵軍知道你的位置、會開火；發現你的單位 report 秒後回報＝拉警報（先打掉它、或通訊塔已毀＝不會）。
//   警報：機場派戰機、增援（有限的幾波）陸續趕來；全部打掉也能贏。
// 火控（X）：不攻擊（潛行）／手動射擊（按住開火鍵才打）／自動射擊。瞄準＝準心停在敵人上就鎖定；武器先打射程內鎖定的目標，沒有就打最近的敵人。
// 會消耗的彈藥（飛彈、護航機）隨時間補充，不在戰鬥時加倍（CAP_AMMO）。
// 技術：玩家小隊的每艘船都是一支「單艦分艦隊」（fd.cap），位置由這裡直接決定（main.js 的 capShip 分支）；敵方戰艦用一般的艦隊模擬（射程 ×rangeMul）。
// 敵方地面單位放在 CAP.G.gts（同王牌飛行員的地面目標：射線、受擊、模型共用），會移動的有 mv。沒有回放（玩家的輸入不進命令紀錄）。
const CAP_STORE = 'fleet.captain';
const DEG = Math.PI / 180;
const CAP_RULE = {
  rangeMul: 0.3,               // 敵方戰艦的武器射程倍率（小規模戰場）
  hitNom: true,                // 受彈範圍照船型（不照模型）：雙方同艦種＝同樣好打
  gunMul: 3, ftrMul: 1.5,      // 敵方戰艦的砲、戰機打玩家小隊的傷害倍率（艦隊戰的數值是給大軍用的）
  ftrSpd: 0.3, misSpd: 0.3,    // 艦載機、飛彈的速度倍率（main.js 的 FTR_SPD、MIS_SPD）
  misFuel: 1.8,                // 飛彈追船：速度固定，船跑開就要飛更久；超過「原本飛行時間 × misFuel」燃料用完、自爆（不造成傷害）
  zone: 1350, ceil: -6,        // 戰區半徑；飛行高度上限（y）
  pitchMax: 0.6,               // 船頭最多抬／壓幾弧度（約 34°）
  sig: 6, sigMul: 1.8, noise: 90,   // 開火：sig 秒內被偵測的距離 ×sigMul；noise 內的敵軍單位立刻發現
  lowAGL: 4, lowMul: 0.45,     // 離地低於 lowAGL（約 800 公尺）＝貼地飛：雷達類的偵測距離 ×lowMul
  seenRate: 0.4, seenDecay: 0.3,   // 偵測條：被看到時每秒漲多少（越近越快）、沒被看到每秒退多少
  knownT: 10,                  // 被發現後，敵軍知道位置多久（一直被看到就一直延長）
  report: 4,                   // 被發現到拉警報要幾秒（這段時間內打掉發現你的單位＝不會拉警報）
  waveFirst: 35, waveGap: 60,  // 增援：拉警報後幾秒第一波、之後每波間隔
  scramble: 30,                // 機場：警報中每隔幾秒派一批戰機
  extR: 70,                    // 撤離點半徑
  warpT: 5, warpCalm: 8, warpClear: 260,   // 躍遷撤離：充能秒數；幾秒內沒被打到、多遠內沒有敵方戰艦或武裝單位＝脫離戰鬥
  time: 1500,                  // 任務時限（秒）
  see: 330, seeShip: 450,      // 我方偵測：地面單位（要視線）、敵方戰艦
};
// 巨艦手感（2026-11-11 試做，暫停選單可以開關＝SETTINGS.capHeavy）：
//   鏡頭＝艦橋上方的第三人稱：鏡頭繞著艦橋上方的一點（pivot）轉，瞄準轉到哪裡都一樣，船永遠在準心下方固定的角度（atan(up/dist) ≈ 15°，畫面約 3/4 高的地方），不會被轉出畫面。
//     離船很近（船身佔滿畫面下方）＝巨艦的份量；沒有跟隨延遲（延遲會讓船滑出畫面）；主砲開火震動。
//   操船：速度、加速、轉向都變慢。敵我都用同一套（capFly），AI 不用改。
const CAP_FEEL = { fov: 55, boostFov: 4, dist: 0.95, up: 0.26, spd: 0.65, acc: 0.55, turn: 0.65, turnAcc: 0.5, shake: 0.35 };
const capHeavy = () => SETTINGS.capHeavy !== false;
// 火控（玩家小隊：自己的船＋同小隊的僚艦）。武器挑目標：先打射程內鎖定的目標，射程內沒有就打最近的敵人（敵艦、地面單位、艦載機、飛來的飛彈）
const CAP_FC = [
  { key: 'hold', name: '不攻擊', en: 'HOLD FIRE', col: '#8fe39a', desc: '所有武器停火（潛行用），護航機收回' },
  { key: 'manual', name: '手動射擊', en: 'MANUAL', col: '#ffd36a', desc: '按住左鍵：主砲、砲塔、點防禦一起開火；右鍵：飛彈；僚艦跟著你開火' },
  { key: 'auto', name: '自動射擊', en: 'AUTO FIRE', col: '#ff7a5a', desc: '所有武器（含飛彈）自動開火' },
];
// 會消耗的彈藥：戰鬥中隨時間補充，不在戰鬥時（capCalmWhy 沒有理由＝脫離戰鬥）速度 ×calm。以後新增會消耗的武器，都要加在這裡（capAmmoTick）
//   msl＝飛彈從 0 補滿要幾秒；ftr＝補一架護航機要幾秒
const CAP_AMMO = { calm: 2, msl: 180, ftr: 30 };
{ const k = KEY_ACTIONS.findIndex((a) => a[0] === 'cap_fc'); if (k >= 0) KEY_ACTIONS[k][1] = '火控切換：不攻擊／手動射擊／自動射擊'; const j = KEY_ACTIONS.findIndex((a) => a[0] === 'cap_target'); if (j >= 0) KEY_ACTIONS[j][1] = '鎖定準心附近的敵人（準心停在敵人上也會自動鎖定）'; }
// 切換小隊（同一場戰鬥有兩個我方小隊時）：按鍵表在 main.js，這裡補上
{ const k = KEY_ACTIONS.findIndex((a) => a[0] === 'cap_switch'); if (k >= 0 && !KEY_ACTIONS.some((a) => a[0] === 'cap_squad')) KEY_ACTIONS.splice(k + 1, 0, ['cap_squad', '切換小隊（兩個小隊同場時）', '艦長', 'KeyB']); if (SETTINGS.keys.cap_squad == null) SETTINGS.keys.cap_squad = 'KeyB'; }
{ const k = KEY_ACTIONS.findIndex((a) => a[0] === 'cap_view'); if (k >= 0) KEY_ACTIONS[k][1] = '鏡頭：近景／遠景／俯視'; if (k >= 0 && !KEY_ACTIONS.some((a) => a[0] === 'cap_move')) KEY_ACTIONS.splice(k + 1, 0, ['cap_move', '俯視：移動到游標處（選取的僚艦，沒選＝自己的船）', '艦長', 'KeyR']); if (SETTINGS.keys.cap_move == null) SETTINGS.keys.cap_move = 'KeyR'; }
{ const k = KEY_ACTIONS.findIndex((a) => a[0] === 'cap_squad'); if (k >= 0 && !KEY_ACTIONS.some((a) => a[0] === 'cap_map')) KEY_ACTIONS.splice(k + 1, 0, ['cap_map', '星圖（艦長生涯：在星系中巡航時）', '艦長', 'KeyM']); if (SETTINGS.keys.cap_map == null) SETTINGS.keys.cap_map = 'KeyM'; }
// 艦長生涯：停泊（大廳）／巡航切換（caplobby.js）
{ const k = KEY_ACTIONS.findIndex((a) => a[0] === 'cap_map'); if (k >= 0 && !KEY_ACTIONS.some((a) => a[0] === 'cap_dock')) KEY_ACTIONS.splice(k + 1, 0, ['cap_dock', '停泊／巡航（艦長生涯：在星系中時）', '艦長', 'KeyH']); if (SETTINGS.keys.cap_dock == null) SETTINGS.keys.cap_dock = 'KeyH'; }
const CAP_ORDERS = [{ key: 'follow', name: '跟隨' }, { key: 'focus', name: '集火我的目標' }, { key: 'free', name: '自由交戰' }, { key: 'hold', name: '原地防守' }];
// 難度：n＝敵軍數量倍率、sens＝偵測距離倍率、dmg＝敵方地面單位傷害倍率、hp＝敵方地面單位耐久倍率
//   foeMax＝任務裡敵方戰艦（巡邏隊、指揮艦）的數量上限：敵艦數照我方船數增加，但不超過上限，
//   所以低難度可以靠更多、更強的戰艦壓過敵人；pow＝派出任務公式裡的敵方戰力基準（capcareer.js 的 ccOpCalc）
const CAP_DIFF = [
  { name: '新兵', n: 0.7, sens: 0.85, dmg: 0.7, hp: 0.8, foeMax: 1, pow: 2 },
  { name: '普通', n: 1, sens: 1, dmg: 1, hp: 1, foeMax: 2, pow: 3 },
  { name: '老練', n: 1.2, sens: 1.1, dmg: 1.15, hp: 1.1, foeMax: 3, pow: 4 },
  { name: '精英', n: 1.4, sens: 1.2, dmg: 1.3, hp: 1.2, foeMax: 5, pow: 6 },
  { name: '傳奇', n: 1.65, sens: 1.3, dmg: 1.5, hp: 1.35, foeMax: 7, pow: 8 },
];
// 特製戰艦：look＝外觀借用的艦種（SHIP_TYPES 的索引）；速度單位／秒、轉向度／秒
// main＝艦首主砲（手動，船頭對準才打得到）；tur＝自動砲塔；pd＝點防禦（攔飛彈、打戰機）；msl＝垂直發射飛彈（要先鎖定）
const CAP_HULLS = {
  assault: { name: '突擊艦', en: 'ASSAULT', look: 3, hp: 300, sh: 160, cruise: 8, max: 13, acc: 3.2, strafe: 4.5, climb: 4, turn: 30, boostT: 5,
    main: { name: '磁軌主砲', dmg: 30, cd: 2.2, range: 240, spd: 260, arc: 45, trav: 60 },
    tur: { n: 2, dmg: 6, cd: 1.4, range: 160, acc: 0.85 }, pd: { n: 2, dmg: 2, cd: 0.4, far: 70, acc: 0.75 },
    msl: { n: 24, dmg: 40, range: 280, lockT: 1.0, cd: 0.4 },
    skill: { key: 'burst', name: '推進過載', cd: 25, dur: 5 },
    desc: '快、靈活，主砲射速快（射界左右各 45°）。技能：推進過載（5 秒內速度、轉向大幅提升）。' },
  gunship: { name: '重砲艦', en: 'GUNSHIP', look: 1, hp: 620, sh: 320, cruise: 5.5, max: 8.5, acc: 1.8, strafe: 2.5, climb: 2.5, turn: 16, boostT: 4,
    main: { name: '重粒子主砲', dmg: 85, cd: 6, range: 320, spd: 200, arc: 30, trav: 25 },
    tur: { n: 4, dmg: 8, cd: 1.6, range: 190, acc: 0.85 }, pd: { n: 2, dmg: 2, cd: 0.45, far: 70, acc: 0.75 },
    msl: { n: 32, dmg: 55, range: 300, lockT: 1.4, cd: 0.45 },
    skill: { key: 'shield', name: '護盾超載', cd: 40, dur: 8 },
    desc: '慢、最耐打，主砲一發重創，但砲塔轉得慢、射界只有左右各 30°；飛彈最多。技能：護盾超載（護盾立刻充滿，8 秒內受到的傷害減半）。' },
  support: { name: '支援艦', en: 'SUPPORT', look: 0, hp: 420, sh: 260, cruise: 6.5, max: 10, acc: 2.4, strafe: 3.2, climb: 3, turn: 20, boostT: 5,
    main: { name: '速射砲', dmg: 12, cd: 0.9, range: 200, spd: 280, arc: 150, trav: 90 },
    tur: { n: 2, dmg: 6, cd: 1.4, range: 170, acc: 0.85 }, pd: { n: 4, dmg: 2, cd: 0.4, far: 80, acc: 0.8 },
    msl: { n: 16, dmg: 35, range: 260, lockT: 1.2, cd: 0.5 }, ftr: 6, repair: { range: 150, hps: 16, dur: 6, recharge: 10 },
    skill: { key: 'repair', name: '維修光束', cd: 0, dur: 6 },
    desc: '帶 6 架護航機、點防禦最強，速射砲幾乎全方位。技能：維修光束（按住技能鍵，對準友艦修理船體與護盾；沒對準就修自己）。' },
};
const CAP_HULL_ORDER = ['assault', 'gunship', 'support'];
const CAP_GUN_PITCH = [-45 * Math.PI / 180, 30 * Math.PI / 180];   // 主砲的俯仰範圍（往下、往上）
const CAP_BOOST_RE = 0.3;   // 推進能量用完後，要回充到這麼多才能再加速
// 敵方地面／海上單位：kind 給 ground_pilot.js 用（受擊效果、沉沒）；sensor＝偵測距離（radar＝貼地飛時打折）；intel＝固定設施，開場就知道位置
// msl＝反艦飛彈（range、一次 n 發、cd 秒、每發 dmg）；gun＝機砲（打護航機，沒有才打船）；mv＝移動速度
const CAP_UNIT = {
  radar: { kind: 'bldg', sub: 'radar', name: '雷達站', hp: 260, r: 1.6, hh: 0.6, sensor: 400, sh: 2.2, radar: true, intel: true, merit: 40 },
  comm: { kind: 'bldg', sub: 'comm', name: '通訊塔', hp: 200, r: 1.2, hh: 3.5, sensor: 0, intel: true, merit: 50 },
  airbase: { kind: 'bldg', sub: 'airbase', name: '機場', hp: 520, r: 3.4, hh: 0.4, sensor: 170, sh: 1.5, radar: true, intel: true, merit: 80 },
  hq: { kind: 'bldg', sub: 'hq', name: '指揮中心', hp: 300, r: 2, hh: 1.3, sensor: 140, sh: 2.8, radar: true, intel: true, merit: 60 },
  fuel: { kind: 'bldg', sub: 'fuel', name: '燃料庫', hp: 220, r: 2.4, hh: 0.5, sensor: 0, intel: true, merit: 40 },
  power: { kind: 'bldg', sub: 'power', name: '發電廠', hp: 240, r: 2.5, hh: 0.7, sensor: 0, intel: true, merit: 40 },
  ammo: { kind: 'bldg', sub: 'ammo', name: '彈藥庫', hp: 200, r: 2.1, hh: 0.5, sensor: 0, intel: true, merit: 40 },
  site: { kind: 'site', sub: 'site', name: '飛彈陣地', hp: 220, r: 1.3, hh: 0.3, sensor: 170, sh: 1, radar: true, intel: true, merit: 45, msl: { range: 260, n: 4, cd: 20, dmg: 30 } },
  tel: { kind: 'msl', sub: 'tel', name: '機動飛彈車', hp: 70, r: 0.9, hh: 0.15, sensor: 140, sh: 0.6, radar: true, merit: 30, mv: 2.6, msl: { range: 230, n: 2, cd: 15, dmg: 30 } },
  flak: { kind: 'flak', sub: 'flak', name: '防空砲', hp: 90, r: 0.8, hh: 0.2, sensor: 120, sh: 0.6, merit: 20, gun: { range: 95, cd: 0.7, dmg: 2.2, acc: 0.45, ship: 1.4 } },
  navy: { kind: 'navy', sub: 'ship', name: '巡防艦', hp: 260, r: 1.3, hh: 0.15, sensor: 230, sh: 0.8, radar: true, merit: 60, mv: 2.2, sea: true,
    msl: { range: 240, n: 2, cd: 17, dmg: 30 }, gun: { range: 110, cd: 0.6, dmg: 1.8, acc: 0.4, ship: 1.2 } },
};
const CAP_COMBAT = { msl: 1, site: 1, flak: 1, navy: 1 };   // 全滅任務要打掉的地面單位
const CAP_MIS = {
  sabotage: { name: '破壞', text: (M) => `摧毀 ${M.goal} 處指定的設施（${M.names}）` },
  decap: { name: '斬首', text: () => '擊沉敵方指揮艦（儀表上標示「目標」）' },
  wipe: { name: '全滅', text: () => '殲滅區域內所有敵軍：戰艦、軍艦、飛彈車、飛彈陣地、防空砲（含趕來的增援；戰機不算）' },
};
const CAP_MERIT = { mission: [150, 200, 260, 330, 420], ghost: 150, noLoss: 100, ship: 40, ftr: 8 };

// ───── 存檔 ─────
function capLoad() {
  let p = null; try { p = JSON.parse(STORE.getItem(CAP_STORE) || 'null'); } catch (e) { p = null; }
  p = Object.assign({ fac: 0, slots: ['assault', 'gunship', '', '', ''], ally: '', diff: 1, env: 0, mis: '', seed: 0, sorties: 0, wins: 0, merit: 0, kills: 0, lost: 0, ghost: 0 }, p || {});
  if (!Array.isArray(p.slots)) p.slots = [];
  p.slots = [0, 1, 2, 3, 4].map((k) => (CAP_HULLS[p.slots[k]] ? p.slots[k] : ''));
  if (!p.slots.some(Boolean)) p.slots[0] = 'assault';
  if (p.fac !== 1) p.fac = 0;
  if (!(p.diff >= 0 && p.diff < CAP_DIFF.length)) p.diff = 1;
  if (!(p.env >= 0 && p.env <= GROUND_KEYS.length + CAP_SPACE_KEYS.length)) p.env = 0;
  if (p.mis && !CAP_MIS[p.mis]) p.mis = '';
  if (!CAP_ALLY[p.ally]) p.ally = '';
  return p;
}
function capSave(p) { try { STORE.setItem(CAP_STORE, JSON.stringify(p)); } catch (e) { /* 只在本次有效 */ } }
function capSummary() { const p = capLoad(); return `小隊 ${p.slots.filter(Boolean).length} 艘・戰功 ${fmtN(p.merit)}・任務成功 ${p.wins}／${p.sorties}`; }
function capHubItems(own) {
  const p = capLoad();
  return {
    ops: [
      { id: 'sp-story', icon: 'story', en: 'CAMPAIGN', name: '主線', desc: '特種部隊的劇情戰役', off: true },
      { id: 'sp-rand', icon: 'rand', en: 'MISSION', name: '隨機任務', desc: '隨機生成的敵後作戰：潛入、破壞、斬首、全滅，完成後撤離', st: `${CAP_DIFF[p.diff].name}・${FACTION_NAME[p.fac]}・出擊 ${p.sorties}`, cls: 'pri' },
      { id: 'sp-ccr', icon: 'career', en: 'CAPTAIN CAREER', name: '艦長生涯', desc: '回合制的星圖：所有勢力都是戰艦小隊，小隊戰的結果決定星系的所有權；損傷會留下，小隊全滅＝生涯結束', st: ccSummary(), cls: 'pri' },
      { id: 'sp-camp', icon: 'endless', en: 'ENDLESS', name: '無限戰場', desc: '一場接一場的連續任務', off: true },
      { id: 'sp-sand', icon: 'sim', en: 'SIMULATOR', name: '模擬室', desc: '自由布置敵軍與目標', off: true },
      { id: 'sp-train', icon: 'train', en: 'TRAINING', name: '訓練場', desc: '操艦、潛行、火控的教學', off: true },
    ],
    subs: [{ id: 'sp-capsq', icon: 'hang', name: '戰艦庫', desc: `小隊的特製戰艦・${p.slots.filter(Boolean).map((k) => CAP_HULLS[k].name).join('、')}`, tag: own },
      { id: 'sp-crew', icon: 'tav', name: '船員', desc: `各艦的軍官、經歷與紀念牆・陣亡 ${grLoad().fallen.length} 人`, tag: own }],
  };
}
function capHubBind() { gEl('sp-ccr').onclick = () => ccShow(); gEl('sp-rand').onclick = () => showCaptain(); gEl('sp-capsq').onclick = () => showCapBay(); gEl('sp-crew').onclick = () => showCrew(); }

// ───── 出擊設定 ─────
function capKeyRows() {
  const k = (id) => keyText(id);
  return [
    ['滑鼠移動', '準心瞄準：停在敵人上＝鎖定（移到別的敵人才換，目標離開畫面＝解除）'], ['滑鼠左鍵', '開火（火控「手動射擊」：主砲、砲塔、點防禦一起打）'], ['滑鼠右鍵', '飛彈（鎖定完成才發射；「自動射擊」會自己發射）'],
    [`${k('cap_left')}／${k('cap_right')}`, '左轉／右轉'], [`${k('cap_thr_up')}／${k('cap_thr_dn')}`, '油門加／減（減到 0 以下＝倒退）'], [k('cap_stop'), '油門歸零'], [`${k('cap_sl')}／${k('cap_sr')}`, '左右平移'], [`${k('cap_up')}／${k('cap_down')}`, '上升／下降'],
    [k('cap_boost'), `推進加速（能量用完要回充到 ${Math.round(CAP_BOOST_RE * 100)}% 才能再用）`], [k('cap_target'), '鎖定準心附近的敵人（僚艦「集火」也打它）'], [k('cap_fc'), '火控：不攻擊／手動射擊／自動射擊（武器先打射程內鎖定的目標，沒有就打最近的敵人）'],
    [k('cap_skill'), '艦種技能'], [k('cap_skill2'), '支援艦的護航機出擊／收回'], [k('cap_switch'), '換船（同一個小隊裡接手下一艘）'], [k('cap_squad'), '切換小隊（佔領戰有友軍小隊時；原本的小隊交給 AI）'],
    [`${k('cap_o1')}～${k('cap_o4')}`, '僚艦：跟隨／集火我的目標／自由交戰／原地防守'], [k('cap_view'), '鏡頭：近景／遠景／俯視'], ['俯視', `游標＝準心（停在敵人上＝鎖定，移到別的敵人才換）・左鍵點我方的船＝選取・中鍵或 ${k('cap_move')}＝選取的船移動到游標處（沒選＝自己的船自動航行）`], [k('cap_warp'), `任務完成、脫離戰鬥後：躍遷撤離（充能 ${CAP_RULE.warpT} 秒，被攻擊會中斷）`], ['滾輪', '鏡頭距離'], ['Esc', '暫停'],
  ];
}
function showCaptain() {
  const p = capLoad();
  setPhase('briefing');
  const sel = GAME.capSel = Math.max(0, Math.min(4, GAME.capSel || 0));
  const seg = (key, arr) => `<div class="wed-seg rd-seg" data-co="${key}">${arr.map(([v, n]) => `<button data-v="${v}" class="${p[key] === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const slot = (k) => { const h = CAP_HULLS[p.slots[k]];
    return `<button class="cap-slot ${k === sel ? 'on' : ''} ${h ? '' : 'empty'}" data-cs="${k}"><span class="g-dim">${k + 1} 號艦</span><b>${h ? h.name : '（空）'}</b><small>${h ? `耐久 ${h.hp}＋護盾 ${h.sh}・速度 ${h.cruise}～${h.max}` : '點一下，再選艦種'}</small></button>`; };
  const only = p.slots.filter(Boolean).length === 1 && p.slots[sel];
  const picks = ['', ...CAP_HULL_ORDER].map((key) => { const h = CAP_HULLS[key], on = (p.slots[sel] || '') === key, dis = !key && only;
    return `<button class="hg-chip ${on ? 'on' : ''}" data-ch="${key}" ${dis ? 'disabled' : ''}><b>${h ? h.name : '不帶'}</b><small>${h ? h.en : '這個位置空著'}</small></button>`; }).join('');
  const H = CAP_HULLS[p.slots[sel]];
  const hd = H ? `<b>${H.name}</b>　${H.desc}<br><span class="g-dim">主砲：${H.main.name}（${H.main.dmg} 傷害、${H.main.cd} 秒、射程 ${H.main.range}、射界左右各 ${H.main.arc}°）・砲塔 ${H.tur.n} 座・點防禦 ${H.pd.n} 座${H.msl ? `・飛彈 ${H.msl.n} 枚` : ''}${H.ftr ? `・護航機 ${H.ftr} 架` : ''}・轉向 ${H.turn}°／秒</span>` : '<span class="g-dim">這個位置不帶船。</span>';
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>隨機任務</h2><span class="crumb">艦長・帶領特種小隊執行敵後作戰・沒有回放</span><span class="g-sp"></span><button class="g-btn" id="cp-back">← 艦長</button></div>
    <div class="g-card pl-rec"><div><span class="g-dim">戰功</span><b>${fmtN(p.merit)}</b></div><div><span class="g-dim">出擊</span><b>${p.sorties}</b></div><div><span class="g-dim">任務成功</span><b>${p.wins}</b></div><div><span class="g-dim">無聲完成</span><b>${p.ghost}</b></div><div><span class="g-dim">摧毀</span><b>${fmtN(p.kills)}</b></div><div><span class="g-dim">損失</span><b>${p.lost}</b> 艘</div>
      <span class="g-dim pl-note">損失的船任務後會修好，只影響這次的評等與戰功。</span></div>
    ${capResumeCard(p)}
    <div class="g-card" style="margin-top:12px"><h3>小隊編成 <span class="g-dim" style="font-weight:400">1～5 艘・你親自駕駛其中一艘，其他是僚艦</span></h3>
      <div class="cap-slots">${[0, 1, 2, 3, 4].map(slot).join('')}</div>
      <div class="hg-pick" style="margin-top:10px">${picks}</div><div class="hg-desc" style="margin-top:8px">${hd}</div></div>
    <div class="intel-grid" style="margin-top:12px">
      <div class="g-card"><h3>戰場</h3><dl class="kv rd-opts">
        <dt>所屬陣營</dt><dd>${seg('fac', [[0, FACTION_NAME[0]], [1, FACTION_NAME[1]]])}<div class="g-dim">敵軍是另一個陣營</div></dd>
        <dt>難度</dt><dd>${seg('diff', CAP_DIFF.map((d, i) => [i, d.name]))}<div class="g-dim">敵軍的數量、偵測距離、增援波數</div></dd>
        <dt>地點</dt><dd>${seg('env', [[0, '隨機'], ...GROUND_KEYS.map((k, i) => [i + 1, GROUND_SCENES[k].name]), ...CAP_SPACE_KEYS.map((k, i) => [GROUND_KEYS.length + i + 1, '太空・' + CAP_SPACE[k].name])])}<div class="g-dim">地面：海港才有海上軍艦；群山最好躲雷達。太空：躲進小行星區擋雷達；戰區外圍的粒子帶會傷害船體</div></dd>
        <dt>任務</dt><dd>${seg('mis', [['', '隨機'], ...Object.entries(CAP_MIS).map(([k, M]) => [k, M.name + (M.at === 's' ? '（太空）' : M.at === 'g' ? '（地面）' : '')])])}<div class="g-dim">任務和地點不合時，以任務為準換地點</div></dd>
        <dt>友軍小隊</dt><dd>${seg('ally', Object.entries(CAP_ALLY).map(([k, A]) => [k, A.name]))}<div class="g-dim">只有佔領戰會出動：另一個由 AI 指揮的小隊，按 ${keyText('cap_squad')} 可以切換過去親自指揮</div></dd>
        <dt>規則</dt><dd>敵軍在後方：戰艦很少，多半是地面飛彈車、飛彈陣地、防空砲、戰機與海上軍艦。<b>雷達</b>看得到你就會漸漸發現你（偵測條）；山、巨型結構擋得住雷達，<b>貼地飛</b>（離地約 ${Math.round(CAP_RULE.lowAGL * GROUND_KM * 1000)} 公尺內）雷達的範圍會縮小；<b>開火</b>會暴露 ${CAP_RULE.sig} 秒。被發現後 ${CAP_RULE.report} 秒內摧毀發現你的單位，它就來不及拉警報。<b>警報</b>：機場派戰機、增援（有限）陸續趕來；先炸掉<b>通訊塔</b>，敵軍就無法拉警報、呼叫增援。完成主要目標後回到<b>撤離點</b>（出發的地方）。<br><b>太空戰場</b>：沒有地面可以躲，改躲進<b>小行星區</b>或星雲（雷達的範圍縮小，但速度變慢），大石頭擋得住雷達與射線；<b>通訊中繼站</b>就是通訊塔；戰區外圍的<b>高能粒子帶</b>、黑洞附近都會傷害船體。</dd>
        <dt>失敗</dt><dd>任務時限（${Math.round(CAP_RULE.time / 60)} 分鐘，每次出擊的戰鬥時間累計）用完，或你的小隊全滅。脫離戰鬥後按 ${keyText('cap_warp')} 可以隨時<b>躍遷撤退</b>：不算失敗，戰況會保留，修好船之後可以接續（敵方會不會整修，看星系裡有沒有維修船塢、補給站）。</dd></dl></div>
      <div class="g-card"><h3>操作（滑鼠＋鍵盤）</h3><table class="pl-keys">${capKeyRows().map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
        <div style="margin-top:6px"><button class="g-btn sm" id="cp-keys">修改按鍵…</button></div>
        <div class="g-dim" style="margin-top:6px">需要滑鼠：開戰後點一下畫面開始操艦（滑鼠游標會被鎖定）。</div></div>
    </div>
    <div class="g-row" style="margin-top:12px"><span class="g-dim">${p.slots.filter(Boolean).map((k) => CAP_HULLS[k].name).join('＋')}</span><span class="g-sp"></span><button class="g-btn pri" id="cp-go">${p.resume ? '出擊新任務（放棄撤退中的戰鬥）→' : '出擊 →'}</button></div></div>`);
  gEl('cp-back').onclick = () => { GAME.spMode = 'captain'; showSingle(); };
  gEl('cp-keys').onclick = () => openSettings();
  gEl('cp-go').onclick = () => capGo();
  const keep = () => { const y = gEl('game').scrollTop; capSave(p); showCaptain(); gEl('game').scrollTop = y; };
  capResumeBind(p, keep);
  document.querySelectorAll('[data-cs]').forEach((b) => (b.onclick = () => { GAME.capSel = +b.dataset.cs; keep(); }));
  document.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { p.slots[sel] = b.dataset.ch; if (!p.slots.some(Boolean)) p.slots[sel] = 'assault'; keep(); }));
  document.querySelectorAll('[data-co]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => { const k = g.dataset.co; p[k] = k === 'mis' || k === 'ally' ? b.dataset.v : +b.dataset.v; keep(); })));
}

// ───── 戰場生成：玩家從 z＝+880 往 −z 前進；敵方據點 B 在 z＜0；撤離點＝出發點 ─────
function capLayout(p) {
  const nG = GROUND_KEYS.length, R0 = mulberry32(campHash(p.seed, 29));
  let mt = CAP_MIS[p.mis] ? p.mis : '', sp = p.env > nG ? CAP_SPACE_KEYS[p.env - nG - 1] || null : p.env > 0 ? null : undefined;
  if (mt && sp !== undefined && !CAP_MIS[mt].at.includes(sp ? 's' : 'g')) sp = undefined;   // 任務和地點不合：以任務為準
  if (sp === undefined) {
    const canS = p.space !== false && (!mt || CAP_MIS[mt].at.includes('s')), canG = !mt || CAP_MIS[mt].at.includes('g');
    sp = canS && (!canG || R0() < 0.5) ? CAP_SPACE_KEYS[Math.floor(R0() * CAP_SPACE_KEYS.length)] : null;
  }
  const at = sp ? 's' : 'g';
  if (!mt) { const L = Object.keys(CAP_MIS).filter((k) => CAP_MIS[k].at.includes(at)); mt = L[Math.floor(R0() * L.length)]; }
  if (sp) return capSpaceScale(capLayoutSpace(p, sp, mt), CAP_SPACE_K);   // 太空戰場整體縮小（capspace.js）
  return capLayoutGround({ ...p, env: p.env > nG ? 0 : p.env }, mt);
}
function capLayoutGround(p, misType) {
  const seed = p.seed, R = mulberry32(campHash(seed, 31)), li = p.diff, Df = CAP_DIFF[li];
  const pick = (a) => a[Math.floor(R() * a.length)];
  const scene = p.env ? GROUND_KEYS[p.env - 1] : pick(GROUND_KEYS);
  const gs = campHash(seed, 79), D = groundData({ scene, seed: gs });
  const hAt = (x, z) => D.H[gIdx(x, z)];
  const cf = D.extra.coastF, coast = cf ? (z) => -110 + cf[0] * Math.sin(z / cf[1]) + cf[2] * Math.sin(z / cf[3] + cf[4]) : null;
  const land = (x, z) => !coast || x < coast(z) - 20, sea = (x, z) => !!coast && x > coast(z) + 30;
  const used = [];
  // 間距：同一種東西之間 gap，不同種之間至少 35；ex＝禁區（出發點附近不放敵軍）
  const free = (x, z, gap, type) => Math.abs(x) < 1250 && Math.abs(z) < 1250 && D.pil.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + 18) && used.every((u) => { const d = Math.hypot(u.x - x, u.z - z); return d > (u.ex || 0) && d > (u.type === type ? Math.max(gap, u.gap || 0) : 35); });
  // 找位置：f(x, z) 產生候選；ok 再檢查；best＝挑最高的（雷達放在高處）
  const spot = (gen, gap, ok = () => true, best = 1, type = '') => {
    let got = null, gh = -1e9;
    for (let n = 0, tries = 0; n < best && tries < 400; tries++) {
      const c = gen(); if (!free(c.x, c.z, gap, type) || !ok(c.x, c.z)) continue;
      n++; const h = hAt(c.x, c.z); if (h > gh) { gh = h; got = c; }
    }
    if (got) used.push({ x: got.x, z: got.z, gap, type });
    return got;
  };
  const N = (a) => Math.max(0, Math.round(a[li] * (0.85 + R() * 0.3)));
  const nShips = p.slots.filter(Boolean).length;
  // 出發點（＝撤離點）
  const S = spot(() => ({ x: (R() - 0.5) * 600, z: 860 + R() * 60 }), 50, (x, z) => !coast || land(x, z) || sea(x, z)) || { x: 0, z: 880 };
  used.push({ x: S.x, z: S.z, ex: 380 });   // 出發點附近不放敵軍
  // 敵方據點
  const B = spot(() => ({ x: (R() - 0.5) * 700, z: -300 - R() * 380 }), 120, land, 1, 'B') || { x: coast ? -400 : 0, z: -500 };
  const cmap = capMegaPlan(p, scene, li, R, B, spot, used, land, hAt);   // 據點的巨型建築、都市的道路模型（models/建築）
  const units = [];
  const add = (type, pt, extra = {}) => { if (pt) units.push({ type, x: Math.round(pt.x * 10) / 10, z: Math.round(pt.z * 10) / 10, hd: R() * TAU, ...extra }); return pt; };
  const near = (c, r0, r1) => () => { const a = R() * TAU, r = r0 + R() * (r1 - r0); return { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r }; };
  const area = (z0, z1, w = 1150) => () => ({ x: (R() - 0.5) * w, z: z0 + R() * (z1 - z0) });
  // 任務目標
  const mis = { type: misType, li, goal: 1, names: '' };
  if (misType === 'sabotage') {
    const tps = ['fuel', 'power', 'ammo', 'hq'].sort(() => R() - 0.5).slice(0, [2, 2, 3, 3, 3][li]);
    tps.forEach((tp) => add(tp, spot(near(B, 30, 150), 45, land, 1, 'mis'), { mis: true }));
    mis.goal = units.filter((u) => u.mis).length; mis.names = units.filter((u) => u.mis).map((u) => CAP_UNIT[u.type].name).join('、');
  } else add('hq', spot(near(B, 20, 120), 45, land, 1, 'hq'));
  add('comm', spot(near(B, 80, 220), 45, land, 1, 'comm'));
  // 雷達（放在高處）
  for (let k = 0, n = N([2, 2, 3, 3, 4]); k < n; k++) add('radar', spot(area(-800, 420), 280, (x, z) => land(x, z) || !coast, 6, 'radar'));
  // 機場（軍事基地用原本的機場位置）
  const nAir = scene === 'base' || li >= 4 ? 2 : 1, sites = (D.extra.sites || []).filter(([x, z]) => z < -150 && Math.abs(x) < 1100);
  for (let k = 0; k < nAir; k++) {
    const pt = sites[k] ? (used.push({ x: sites[k][0] + 18, z: sites[k][1] + 18, gap: 300, type: 'air' }), { x: sites[k][0] + 18, z: sites[k][1] + 18 }) : spot(area(-1000, -350), 300, (x, z) => land(x, z) && Math.abs(hAt(x, z) - GROUND_Y) < 12, 1, 'air');
    if (pt) add('airbase', pt, { hd: R() < 0.5 ? 0 : Math.PI / 2, air: k });
  }
  if (!units.some((u) => u.type === 'airbase')) add('airbase', { x: B.x + 260, z: B.z - 200 }, { hd: 0, air: 0 });
  // 飛彈陣地、飛彈車、防空砲、海上軍艦
  for (let k = 0, n = N([1, 2, 2, 3, 4]); k < n; k++) add('site', spot(k % 2 ? near(B, 120, 320) : area(-700, 250), 140, land, 1, 'site'));
  for (let k = 0, n = Math.round([2, 3, 4, 5, 6][li] * Df.n * 0.9); k < n; k++) add('tel', spot(area(-650, 380), 90, land, 1, 'tel'));
  const anchors = units.filter((u) => u.type === 'airbase' || u.type === 'radar' || u.mis || u.type === 'hq');
  for (let k = 0, n = N([2, 3, 4, 5, 6]); k < n; k++) { const a = anchors[k % Math.max(1, anchors.length)] || B; add('flak', spot(near(a, 30, 90), 40, land, 1, 'flak')); }
  if (coast) for (let k = 0, n = N([2, 2, 3, 3, 4]); k < n; k++) add('navy', spot(area(-800, 450, 2000), 120, sea, 1, 'navy'), { sea: true });
  // 艦隊：玩家小隊（每艘一支單艦分艦隊）
  const cmdr = { base: null, name: '', title: '', trait: 'shield', level: 1, mode: 'lv', tal: {}, skills: [] };
  const fleet = (o) => ({ cmdr, noCmdr: true, hangar: HANGAR_DEFAULT.slice(), formation: 'line', orderly: false, layers: 1, ai: null, reserve: false, at: 1e9, cap: true, ...o });
  const comp1 = (t, n = 1) => { const c = new Array(SHIP_TYPES.length).fill(0); c[t] = n; return c; };
  const fleets = [], hulls = p.slots.filter(Boolean);
  hulls.forEach((key, k) => {
    const H = CAP_HULLS[key], off = k - (hulls.length - 1) / 2, x = S.x + off * 16, z = S.z + Math.abs(off) * 8;
    fleets.push(fleet({ side: 0, name: `${'一二三四五'[k]}號艦・${H.name}`, capRole: 'player', comp: comp1(H.look), x, z, y: Math.max(hAt(x, z), GROUND_Y) + 4, h: Math.PI }));
  });
  // 敵方戰艦：總數不超過我方（高難度最多多一艘），多半更少
  const nEn = Math.min(nShips + (li >= 3 ? 1 : 0), Df.foeMax, Math.max(li >= 1 ? 1 : 0, Math.round(nShips * (0.3 + 0.15 * li) + R() * 0.8)));
  const shipT = () => (li >= 2 && R() < 0.3 ? 2 : R() < 0.5 ? 3 : 4);
  let left = nEn - (misType === 'decap' ? 1 : 0);
  if (misType === 'decap') {
    const c = comp1(li >= 3 ? 1 : 2); if (li >= 2 && left > 0) { c[4]++; left--; }
    fleets.push(fleet({ side: 1, name: '敵方指揮艦', capRole: 'flag', comp: c, x: B.x, z: B.z - 60, y: hAt(B.x, B.z) + 16, h: 0 }));
  }
  for (let k = 0; left > 0 && k < 2; k++) {
    const n = k === 1 ? left : Math.max(1, Math.ceil(left / 2)), c = new Array(SHIP_TYPES.length).fill(0);
    for (let m = 0; m < n; m++) c[shipT()]++;
    left -= n;
    const pt = area(-600, 150)(), wp = [0, 1, 2].map(() => area(-700, 200)()).map((q) => [Math.round(q.x), Math.round(q.z)]);
    fleets.push(fleet({ side: 1, name: `巡邏隊 ${k + 1}`, capRole: 'patrol', comp: c, x: pt.x, z: pt.z, y: hAt(pt.x, pt.z) + 16, h: R() * TAU, wp }));
  }
  // 增援（預先放在戰場外，警報時才出動）
  const nWave = [1, 1, 2, 2, 3][li];
  for (let k = 0; k < nWave; k++) {
    const c = new Array(SHIP_TYPES.length).fill(0); c[R() < 0.5 ? 3 : 4]++; if (li >= 2) c[shipT()]++;
    const x = (R() - 0.5) * 1200;
    fleets.push(fleet({ side: 1, name: `增援 ${k + 1}`, capRole: 'reinf', comp: c, x, z: -1450, y: hAt(x, -1300) + 20, h: 0, reserve: true }));
  }
  // 機場的戰機：每座機場一艘看不到的「航母」（派出的戰機要有母艦）
  units.filter((u) => u.type === 'airbase').forEach((u, k) => {
    u.air = k;
    fleets.push(fleet({ side: 1, name: '機場', capRole: 'airbase', comp: comp1(0), x: u.x, z: u.z, y: hAt(u.x, u.z) + 14, h: 0 }));
  });
  const m = { name: '', fac: p.fac === 1 ? 1 : 0, victory: false, ctl: -1, timeLimit: CAP_RULE.time, seed: campHash(seed, 13) % 100000, fleets, terrain: [], sides: [{ lv: 0 }, { lv: li }],
    ground: { scene, seed: gs, def: -1, cap: true, ...(cmap ? { cmap } : {}) },
    captain: { li, hulls, mis, units, S: { x: S.x, z: S.z }, B: { x: B.x, z: B.z }, waves: nWave, ftr: [4, 6, 8, 10, 12][li], scene } };
  m.name = `${CAP_MIS[misType].name}・${GROUND_SCENES[scene].name}・${CAP_DIFF[li].name}`;
  return m;
}
// resume＝true：接續撤退中的戰鬥（用當時的編成、種子重建戰場，再套上存下的戰況）；其他＝新任務（放棄撤退中的戰鬥）
function capGo(resume) {
  const p = capLoad(), R = resume === true ? p.resume : null;
  if (!R) { p.seed = randSeed(); p.resume = null; capSave(p); }
  const q = R ? { ...p, ...R.p } : p;
  simEndMid(); overlay(null);
  SIM.m = capLayout(q); SIM.sel = null;
  SIM.m.captain.resumeP = { fac: q.fac, diff: q.diff, env: q.env, mis: q.mis, seed: q.seed, slots: q.slots.slice(), ally: q.ally };
  if (R) SIM.m.captain.resume = R;
  camAnim = null;
  simStart();
}

// ───── 戰鬥中 ─────
Object.assign(CAP, { side: 0, cur: 0, fc: 0, order: 'follow', esc: false, keys: new Set(), fire: [false, false], press: [false, false], yaw: 0, pitch: 0, thr: 0.5, camD: 1, topD: 1, far: false, view: 0, mx: -1, my: -1, sel: new Set(), nav: null, hov: null,
  tgt: null, feed: [], msl: [], alarm: false, report: null, waves: 0, nextWave: 0, last: null, mis: null, stats: null, el: null, ctx: null, pauseEl: null, locked: false, rng: 1, pat: [], air: [] });
function capRnd() { CAP.rng = (Math.imul(CAP.rng ^ (CAP.rng >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return CAP.rng / 4294967296; }   // 不動到模擬的亂數
function capFeed(msg, cls = '') { CAP.feed.push({ msg, cls, t: performance.now() }); if (CAP.feed.length > 7) CAP.feed.shift(); }
function capHeld(id) { for (const c of CAP.keys) if (plCodeIs(id, c)) return true; return false; }
function capCur() { return CAP.ships[CAP.cur]; }
function capLive() { return CAP.on && GAME.phase === 'battle' && !GAME.result; }
// 俯視角（V 輪流切換：近景 → 遠景 → 俯視）：滑鼠不鎖定，游標瞄準；畫面方向固定（上＝北，和星圖一樣）
function capTop() { return CAP.view === 2; }
// 交戰距離的比例（2026-11-11 試做，暫停選單切換，下一場生效）：船身 ×ship、所有武器射程 ×rng。原本交戰距離是 40～60 個船身，船看起來很小
const CAP_SCALES = [
  { name: '原版', ship: 1, rng: 1 },
  { name: '戰艦 ×3', ship: 3, rng: 1 },
  { name: '射程 ×0.35', ship: 1, rng: 0.35 },
  { name: '戰艦 ×1.8＋射程 ×0.6', ship: 1.8, rng: 0.6 },
];
function capScaleSet() { const v = SETTINGS.capScale; return CAP_SCALES[v >= 0 && v < CAP_SCALES.length ? v : 1]; }
// 武器射程：CAP_HULLS、CAP_UNIT 裡所有 range／far（點防禦）都乘上 k（原本的值記在 _rng0，k＝1 還原）
const _rng0 = new WeakMap();
function capRangeScale(k) {
  const walk = (o) => {
    let b = _rng0.get(o);
    for (const key of Object.keys(o)) {
      const v = o[key];
      if ((key === 'range' || key === 'far') && typeof v === 'number') { if (!b) { b = {}; _rng0.set(o, b); } if (!(key in b)) b[key] = v; o[key] = b[key] * k; }
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v);
    }
  };
  for (const H of Object.values(CAP_HULLS)) walk(H);
  for (const T of Object.values(CAP_UNIT)) walk(T);
}
// 玩家的輸入有效：第三人稱＝滑鼠鎖定中；俯視＝沒暫停
function capIn() { return capTop() ? !paused : CAP.locked; }
function capTeam(s) { return s.foe ? CAP.foes : CAP.own; }
// 這艘船現在由 AI 操控：敵方、玩家沒在指揮的另一個小隊、全部交給 AI（測試）
function capIsAI(s) { if (s.foe || CAP.auto) return true; const c = capCur(); return !!c && s.sq !== c.sq; }
// 這艘船看得到第 i 艘敵艦嗎：我方＝偵測（CAP.seeS）；敵方＝玩家的船已被發現
function capVis(s, i, t) { if (!s.foe) return !!CAP.seeS[i]; const k = capShip(i); return k < 0 || t < CAP.ships[k].knownT; }
function capKnown(k) { const s = CAP.ships[k]; return !!s && U.uTime.value < s.knownT; }
function capCommAlive() { return CAP.G && CAP.G.gts ? CAP.G.gts.some((g) => CAP_UNIT[g.cu].comm && !gtDead(g)) : false; }
// 視線被擋住的位置（0～1），沒擋住＝-1：近地＝地面、柱子；太空＝巨大小行星
function capBlock(ax, ay, az, bx, by, bz) { return SOLID ? rockBlock(ax, ay, az, bx, by, bz) : -1; }
// 地面高度；太空＝基準面下 16（敵艦的高度＝這個 +16）
function capGY(x, z) { return GRD ? terrainHAt(x, z) : -16; }
function capBegin(C) {
  CAP.on = true; CAP.side = 0; CAP.cfg = C; capFxClear(); capSpaceBegin(C); CAP.li = C.li; CAP.Df = CAP_DIFF[C.li];
  CAP.rng = (battleSeed ^ 0x2545f491) >>> 0 || 1;
  CAP.sc = capScaleSet(); capRangeScale(CAP.sc.rng);
  CAP.saveRange = opts.rangeMul; opts.rangeMul = CAP_RULE.rangeMul * CAP.sc.rng; MIS_SPD = CAP_RULE.misSpd;
  CAP.byI = new Int16Array(shipCount).fill(-1); CAP.ships = []; CAP.own = []; CAP.foes = []; CAP.pat = []; CAP.air = []; CAP.sqAI = {};
  CAP.tUsed0 = C.resume ? C.resume.tUsed : 0; CAP.tLim = CAP_RULE.time - CAP.tUsed0;   // 任務時限：每次出擊的戰鬥時間累計
  CAP.auto = !!C.auto; CAP.home = C.auto ? -1 : 0; CAP.allSee = !!C.open;   // home＝玩家自己的小隊（全滅＝輸）；AI 對 AI＝整方全滅才算輸
  CAP.cur = 0; CAP.fc = C.open ? 2 : 0; CAP.fxq = []; CAP.calm = false; CAP.aimHit = null; CAP.order = 'follow'; CAP.esc = false; CAP.tgt = null; CAP.feed = []; CAP.msl = []; CAP.alarm = false; CAP.alarmT = 0; CAP.report = null; CAP.last = null;
  CAP.waves = C.waves; CAP.nextWave = 0; CAP.commLost = false; CAP.saved = false; CAP.hits = []; CAP.flash = null; CAP.pop = null;
  CAP.keys.clear(); CAP.fire = [false, false]; CAP.press = [false, false]; CAP.thr = 0.5; CAP.camD = 1; CAP.view = SETTINGS.capView >= 0 && SETTINGS.capView <= 2 ? SETTINGS.capView : 0; CAP.far = CAP.view === 1; CAP.warp = null; CAP.sel = new Set(); CAP.nav = null; CAP.hov = null;
  CAP.by = {}; CAP.stats = { ks: 0, kg: 0, kf: 0, dmg: 0, lost: 0, shots: 0, msl: 0, merit: 0, alarmed: false, kills: [] };
  CAP.ext = C.ext ? { x: C.ext.x, z: C.ext.z } : { x: C.S.x, z: C.S.z };
  const sc = shipGeo.getAttribute('aScale').array, aL = shipGeo.getAttribute('aLocal'), aL2 = shipGeo.getAttribute('aLocal2');
  for (let i = 0; i < shipCount; i++) sc[i] = TYPE_W[ships.type[i]] * capSizeK(i) * CAP.sc.ship * (0.96 + hash01(i * 7.3 + 1) * 0.08);
  shipGeo.getAttribute('aScale').needsUpdate = true;
  let hk = 0;
  for (const f of fleets) {
    const q = f.sqs[0]; if (!q) continue;
    const g = q.group;
    if (f.capRole === 'player' || f.capRole === 'foe') {
      const fd = SIM.m.fleets[f.id] || {}, foe = f.side !== CAP.side;
      const i = q.list[0], key = fd.capHull || C.hulls[hk], H = capProfMod(capHullMod(CAP_HULLS[key], fd.capSt), fd.capSt && fd.capSt.mod, fd.capSt && fd.capSt.prof),   /* 艦長生涯：模組與 Mk（caphulls.js） */ k = CAP.ships.length; if (!fd.capHull) hk++;
      const t = ships.type[i], hm = foe ? CAP.Df.hp : 1, st = fd.capSt || null;   // 敵方：難度的耐久倍率；capSt＝帶傷開戰（船體、護盾、飛彈剩下的比例）
      const hm2 = foe ? hm : fd.capHm || 1, sm2 = foe ? hm : fd.capShm || 1;   // 艦長生涯：陣營科技（船體、護盾）
      ships.hpCap[i] = H.hp * hm2 / SHIP_TYPES[t].hp; ships.hp[i] = H.hp * hm2 * (st ? st.hp : 1); ships.shMax[i] = H.sh * sm2; ships.sh[i] = H.sh * sm2 * (st ? st.sh : 1);
      ships.ammo[i] = 0; ships.ftr[i] = 0; ships.rep[i] = 0; for (let r = 0; r < 4; r++) ships.hang[i * 4 + r] = 0;
      ships.lx0[i] = ships.lx1[i] = ships.ly0[i] = ships.ly1[i] = ships.lz0[i] = ships.lz1[i] = 0;
      aL.array.set([0, 0, 0], i * 3); aL2.array.set([0, 0, 0], i * 3);
      q.capK = k; g.capPl = true; q.off0 = [0, 0, 0]; q.off1 = [0, 0, 0]; q.mDur = 0; g.plan = null;
      CAP.byI[i] = k;
      const s = { k, i, q, g, f, key, H, name: f.name, side: f.side, foe, sq: fd.capSq || 0, slot: fd.capSlot || 0, dm: foe ? CAP.Df.dmg : 1, guard: fd.capGuard || null, orb: (fd.capSlot || 0) % 2 ? 1 : -1, home0: { x: g.ax, y: g.ay, z: g.az }, L: sc[i] * TYPE_LEN3, x: g.ax, y: g.ay, z: g.az, vx: 0, vy: 0, vz: 0, yaw: g.to, P: 0, yr: 0, bank: 0,
        F: [Math.sin(g.to), 0, Math.cos(g.to)], U: [0, 1, 0], Rr: [-Math.cos(g.to), 0, Math.sin(g.to)], spd: 0, agl: 4, boostE: 1, boosting: false, burstT: -9, shieldT: -9,
        mainCd: 0, gY: 0, gP: 0, gOk: false, gAl: false, boostLock: false, ramT: -9, aiMslT: 0, mslN: H.msl ? H.msl.n : 0, mslCd: 0, lockT: 0, tcd: new Array(H.tur.n).fill(0).map((_, m) => m * 0.4), pcd: new Array(H.pd.n).fill(0), skillCd: 0, repE: 1, repOn: false,
        ftrMax: H.ftr || 0, ftrLost: 0, ftrIds: [], escT: 0, seen: 0, seeing: false, knownT: -99, sigT: -99, spot: null, dead: false, crashT: -9, outT: 0, hitT: -9,
        inp: { yaw: g.to, pitch: 0, thr: 0.5, strafe: 0, vert: 0, boost: false }, aiFire: false, aiMsl: false, aiTgt: null, aiT: 0, holdP: null, thrKeep: 0.5, wT: null, tT: null, mT: null, mslAcc: 0, ftrAcc: 0 };
      if (st && H.msl) s.mslN = Math.round(H.msl.n * st.msl);
      s.hitR = TYPE_W[t] * CAP.sc.ship * TYPE_LEN3 * 0.33;   // 受彈範圍：照船型的標準大小（各陣營的模型大小不同，不能讓模型大的比較容易被打中）
      if (GRD) s.y = Math.max(s.y, terrainHAt(s.x, s.z) + s.L * 0.13 + 2);
      if (foe || C.open) s.knownT = 1e9;   // 正面交戰：雙方一開始就知道彼此（敵方的船永遠「已知」，玩家的艦載機、飛彈才打得到）
      (foe ? CAP.foes : CAP.own).push(s); CAP.ships.push(s);
    } else if (f.capRole === 'airbase') {
      for (const qq of f.sqs) { qq.bg = true; qq.hidden = true; if (qq.label) qq.label.style.display = 'none'; }
      g.inactive = true;
      CAP.air.push({ f, i: q.list[0] });
    } else if (f.side !== CAP.side) {
      for (const i of q.list) ships.ammo[i] = 0;   // 敵方戰艦不帶長程飛彈（射程沒有跟著縮小）
      const fd = SIM.m.fleets[f.id] || {};
      CAP.pat.push({ f, g, role: f.capRole || 'patrol', wp: (fd.wp || []).map(([x, z]) => ({ x, z })), wi: 0, dest: null, destT: -99, home: { x: g.ax, z: g.az }, on: !f.reserve });
    } else if (f.capRole) capAllyAdd(f, g);   // 我方的運輸艦、受困的友艦（capmissions.js）
  }
  aL.needsUpdate = true; aL2.needsUpdate = true;
  CAP.ships = CAP.own.concat(CAP.foes); CAP.ships.forEach((s, k) => { s.k = k; s.q.capK = k; CAP.byI[s.i] = k; });   // 我方的船排在前面（CAP.cur 同時是 CAP.own 的索引）
  if (C.open) { CAP.alarm = true; CAP.waves = 0; }
  R3.version = -1;   // 3D 實例重建一次：改裝換上去的武器模型要有容量（capfx.js capMountCap）
  // 地面單位
  const hpM = CAP.Df.hp;
  CAP.G.gts = C.units.map((u, id) => capMakeUnit(u, id, hpM));
  CAP.G.gts.filter((g) => CAP_UNIT[g.cu].air).forEach((g) => { const A = CAP.air[g.air]; g.carrier = A ? A.i : -1; g.ftrLeft = C.ftr; g.nextT = 0; g.patT = 6 + capRnd() * 10; });
  capResumeApply(C);   // 接續撤退中的戰鬥（capstate.js）
  groundTargetsSync(); capSpaceBuild();
  CAP.seeG = new Uint8Array(CAP.G.gts.length + 64); CAP.seeS = new Uint8Array(shipCount);
  capMisInit(C.mis);
  if (C.resume && CAP.mis) CAP.mis.esc = C.resume.esc || 0;
  const s0 = capCur(); CAP.yaw = s0.yaw; CAP.pitch = -0.08;
  capSyncAll();
  capHudBuild(); document.body.classList.add('pilot-on', 'cap-on');
  if (C.mis.type === 'capture') { const O = CAP.mis.odds; toast(`佔領戰　${capMisText()}${O ? `・戰前評估：勝率 ${Math.round(O.win * 100)}%` : ''}`, 'pilot'); }
  else toast(`任務　${capMisText()}　完成後回到撤離點（綠色標記）`, 'pilot');
  if (C.open) toast(`火控：${CAP_FC[CAP.fc].name}${CAP.own.some((o) => o.sq) ? `・按 ${keyText('cap_squad')} 切換到另一個小隊` : ''}・情勢不利時，脫離戰鬥後按 ${keyText('cap_warp')} 躍遷撤退・點一下畫面開始操艦`, 'pilot');
  else toast(`火控：${CAP_FC[CAP.fc].name}（${keyText('cap_fc')} 切換）・${CAP.sp ? '躲進小行星區可以躲雷達' : '貼地飛可以躲雷達'}・點一下畫面開始操艦，Esc 暫停`, 'pilot');
}
// 艦長模式的艦艇大小：模型的長度都一樣，寬的模型（例如聯盟護衛艦，寬≈長）看起來比細長的大很多；照「寬長比」修正到差不多的份量
function capSizeK(i) {
  const M = R3.models && R3.models[hullKey(i)], g = M && M.lods && M.lods[0]; if (!g) return 1;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox, wr = Math.max(0.15, (b.max.x - b.min.x) / Math.max(0.01, b.max.z - b.min.z));
  return Math.max(0.7, Math.min(1.35, Math.sqrt(0.45 / wr)));
}
function capMakeUnit(u, id, hpM) {
  const T = CAP_UNIT[u.type], y = !GRD && u.y != null ? u.y : T.sea ? GROUND_Y : terrainHAt(u.x, u.z), hp = Math.round(T.hp * (u.own ? 1 : hpM));
  return { id, cu: u.type, kind: T.kind, sub: T.sub, name: T.name, x: u.x, y, z: u.z, hd: u.hd || 0, hp: u.hpf != null ? Math.max(1, Math.round(hp * u.hpf)) : hp, max: hp, di: u.di, r: T.r, hh: T.hh, aa: null, side: u.own ? CAP.side : 1 - CAP.side, deadT: -1,
    mv: !!T.mv, mis: !!u.mis, def: !!u.def, air: u.air, mark: !!u.mark, pv: !!u.pv, st: 'idle', tx: u.x, tz: u.z, fcd: 3 + capRnd() * 6, fireT: -99, gcd: 0, moveT: 0, home: { x: u.x, z: u.z }, wp: null };
}
function capEnd() {
  if (!CAP.on) return;
  capSpaceEnd(); capFxClear();
  CAP.on = false; opts.rangeMul = CAP.saveRange != null ? CAP.saveRange : 1; MIS_SPD = 1; capRangeScale(1);
  if (document.pointerLockElement) document.exitPointerLock();
  document.body.classList.remove('pilot-on', 'cap-on');
  if (CAP.el) CAP.el.hidden = true; if (CAP.pauseEl) CAP.pauseEl.hidden = true;
  CAP.byI = null; CAP.ships = []; CAP.own = []; CAP.foes = []; CAP.msl = [];
}
// 每 tick 把小隊的船位置寫回分艦隊（給模擬、著色器用）
function capSync(s) {
  const g = s.g, q = s.q;
  g.ax = s.x; g.az = s.z; g.ay = g.ayT = s.y; g.from = g.to = s.yaw; g.dur = 0; g.p = g.pCmd = s.P; g.avx = g.avz = 0;
  q.tFrom = q.tTo = s.yaw; q.tDur = 0; q.mDur = 0;
}
function capSyncAll() {
  const A = shipGeo.getAttribute('aPath');
  for (const s of CAP.ships) { capSync(s); A.array[s.i * 4] = s.x; A.array[s.i * 4 + 1] = s.z; A.array[s.i * 4 + 2] = s.yaw; A.array[s.i * 4 + 3] = 2; }
  A.needsUpdate = true;
}

// ───── 移動（每 tick） ─────
function capMove(dt) {
  const t = U.uTime.value;
  capInputs(dt, t);
  for (const s of CAP.ships) if (!s.dead) capFly(s, s.inp, dt, t);
  capSpaceStep(dt, t);
  capCollide(t);
  capSyncAll();
  capUnitsMove(dt, t);
}
function capInputs(dt, t) {
  const c = capCur(); if (!c) return;
  if (!c.dead && !CAP.auto) {
    if (!paused && capLive()) {
      if (capHeld('cap_thr_up')) CAP.thr = Math.min(1, CAP.thr + dt * 0.6);
      if (capHeld('cap_thr_dn')) { if (!CAP.thrHold) { const z = CAP.thr > 0; CAP.thr = Math.max(-0.3, CAP.thr - dt * 0.6); if (z && CAP.thr <= 0) { CAP.thr = 0; CAP.thrHold = true; } } } else CAP.thrHold = false;
    }
    const I = c.inp, live = capLive() && capIn();
    I.yaw = c.yaw; I.pitch = 0; I.thr = CAP.thr;
    if (CAP.nav && live && ['cap_left', 'cap_right', 'cap_thr_up', 'cap_thr_dn', 'cap_sl', 'cap_sr', 'cap_up', 'cap_down', 'cap_stop'].some(capHeld)) { CAP.nav = null; capFeed('自動航行取消', 'hint'); }
    I.turn = live ? (capHeld('cap_right') ? 1 : 0) - (capHeld('cap_left') ? 1 : 0) : 0;
    I.strafe = live ? (capHeld('cap_sr') ? 1 : 0) - (capHeld('cap_sl') ? 1 : 0) : 0;
    if (capTop()) capAimTop(c); else capAimPoint();
    capLockAim();
    I.vert = live ? (capHeld('cap_up') ? 1 : 0) - (capHeld('cap_down') ? 1 : 0) : 0;
    I.boost = live && capHeld('cap_boost');
    if (CAP.nav) capNav(c, I);
  }
  let n = 0;
  for (const s of CAP.ships) {
    if (s.dead || (s === c && !CAP.auto)) continue;
    if (capIsAI(s)) capSquadAI(s, t, dt); else capWing(s, t, c, n++, dt);
  }
}
function capFly(s, inp, dt, t) {
  if (CAP.sp && simTick % 3 === s.k % 3) s.inRock = inTerrain('asteroid', s.x, s.z, s.y);   // 太空：小行星區速度 ×0.8
  const H = s.H, burst = s.burstT > t, km = (burst ? 1.35 : 1) * (s.inRock ? 0.8 : 1);
  if (s.boostE <= 0) s.boostLock = true; else if (s.boostLock && s.boostE >= CAP_BOOST_RE) s.boostLock = false;
  const boost = inp.boost && !s.boostLock && inp.thr > 0.1;
  if (boost) s.boostE = Math.max(0, s.boostE - dt / H.boostT); else s.boostE = Math.min(1, s.boostE + dt / (H.boostT * 2.5));
  s.boosting = boost;
  // 轉向：往要的方向轉（有角加速度，大船轉得慢）；船頭最多抬／壓 pitchMax
  const FE = capHeavy() ? CAP_FEEL : null, kS = FE ? FE.spd : 1, kA = FE ? FE.acc : 1, kTa = FE ? FE.turnAcc : 1;   // 巨艦手感
  const rate = H.turn * DEG * (burst ? 1.6 : 1) * (FE ? FE.turn : 1);
  const want = inp.turn != null ? -inp.turn * rate : Math.max(-rate, Math.min(rate, wrapAngle(inp.yaw - s.yaw) * 2.5));
  s.yr += Math.max(-rate * 2.5 * kTa * dt, Math.min(rate * 2.5 * kTa * dt, want - s.yr));
  s.yaw = wrapAngle(s.yaw + s.yr * dt);
  const pw = Math.max(-CAP_RULE.pitchMax, Math.min(CAP_RULE.pitchMax, inp.pitch)), pr = rate * 0.7;
  s.P += Math.max(-pr * dt, Math.min(pr * dt, (pw - s.P) * Math.min(1, dt * 3)));
  const ch = Math.cos(s.yaw), sh = Math.sin(s.yaw), cp = Math.cos(s.P), sp = Math.sin(s.P);
  const F = [sh * cp, sp, ch * cp], Rr = [-ch, 0, sh];
  // 速度：要的速度＝油門×巡航（加速＝最高速）＋平移＋升降；加速度有上限＝慣性，放開按鍵會自動抵消漂移
  // 前進是水平的（自動保持高度）：船頭抬／壓只是為了瞄準主砲，升降用空白鍵／C
  const fwd = inp.thr * (boost ? H.max : H.cruise) * km * kS, st = inp.strafe * H.strafe * km * kS, vt = inp.vert * H.climb * km * kS;
  const tx = sh * fwd + Rr[0] * st, ty = vt, tz = ch * fwd + Rr[2] * st;
  let dx = tx - s.vx, dy = ty - s.vy, dz = tz - s.vz; const dl = Math.hypot(dx, dy, dz), a = H.acc * (boost ? 1.4 : 1) * (burst ? 1.6 : 1) * kA * dt;
  if (dl > a) { dx *= a / dl; dy *= a / dl; dz *= a / dl; }
  s.vx += dx; s.vy += dy; s.vz += dz;
  s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
  // 側傾（畫面）：轉彎時往內傾、平移時微傾
  const bk = Math.max(-0.4, Math.min(0.4, -s.yr * 0.9 + inp.strafe * 0.12));
  s.bank += (bk - s.bank) * Math.min(1, dt * 3);
  const U0 = [-sh * sp, cp, -ch * sp], cb = Math.cos(s.bank), sb = Math.sin(s.bank);
  s.F = F; s.Rr = Rr; s.U = [U0[0] * cb + Rr[0] * sb, U0[1] * cb + Rr[1] * sb, U0[2] * cb + Rr[2] * sb];
  s.spd = Math.hypot(s.vx, s.vy, s.vz);
  // 地面：船身前、中、後三點都要在地面上方；撞上去會受損
  const clr = s.L * 0.13, L2 = s.L * 0.45;
  const gh = capGroundH(s.x, s.z), need = Math.max(gh, capGroundH(s.x + sh * L2, s.z + ch * L2), capGroundH(s.x - sh * L2, s.z - ch * L2)) + clr;
  s.agl = CAP.sp ? 99 : s.y - Math.max(gh, GROUND_Y);
  if (s.y < need) {
    const pen = need - s.y, imp = Math.max(0, -s.vy);
    s.y = need; if (s.vy < 0) s.vy = 0;
    if ((pen > 0.05 || imp > 1.2) && t - s.crashT > 0.6) { s.crashT = t; s.vx *= 0.6; s.vz *= 0.6; capCrash(s, 6 + Math.min(40, s.spd * 2.5 + imp * 6), t, s.x, need - clr, s.z); }
  }
  // 巨型結構（柱子）
  for (const p of CAP.G.pil) {
    if (s.y - clr > p.top) continue;
    const ddx = s.x - p.x, ddz = s.z - p.z, d = Math.hypot(ddx, ddz), Rr2 = p.r + s.L * 0.35;
    if (d >= Rr2) continue;
    const nx = ddx / (d || 1), nz = ddz / (d || 1), into = -(s.vx * nx + s.vz * nz);
    s.x = p.x + nx * Rr2; s.z = p.z + nz * Rr2;
    if (into > 0) { s.vx += nx * into * 1.2; s.vz += nz * into * 1.2; if (into > 1 && t - s.crashT > 0.6) { s.crashT = t; capCrash(s, 8 + into * 4, t, s.x - nx * s.L * 0.3, s.y, s.z - nz * s.L * 0.3); } }
  }
  if (CAP.sp) return;   // 太空：邊界是粒子帶（capSpaceStep）
  if (s.y > CAP_RULE.ceil) { s.y = CAP_RULE.ceil; if (s.vy > 0) s.vy = 0; }
  const rr = Math.hypot(s.x, s.z);
  if (rr > CAP_RULE.zone) { s.outT += dt; const k = CAP_RULE.zone / rr; s.x *= k; s.z *= k; const vr = (s.vx * s.x + s.vz * s.z) / CAP_RULE.zone; if (vr > 0) { s.vx -= s.x / CAP_RULE.zone * vr; s.vz -= s.z / CAP_RULE.zone * vr; } } else s.outT = 0;
}
// 地面高度（雙線性內插）：地形格每格 12.5 單位，直接取格子會有台階，船撞上去會被「彈」起來
function capGroundH(x, z) {
  if (!GRD) return -1e9;
  const fx = (x + GROUND_EXT) / GROUND_CELL - 0.5, fz = (z + GROUND_EXT) / GROUND_CELL - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, N = GROUND_N - 1, H = GRD.H;
  const at = (a, b) => H[Math.max(0, Math.min(N, b)) * GROUND_N + Math.max(0, Math.min(N, a))];
  return (at(ix, iz) * (1 - u) + at(ix + 1, iz) * u) * (1 - v) + (at(ix, iz + 1) * (1 - u) + at(ix + 1, iz + 1) * u) * v;
}
function capCrash(s, dmg, t, x, y, z) {
  pending.push({ t, target: s.i, side: 1 - s.side, asp: 0, dmg, hm: 1, fx: true, dirIdx: 0, x, y, z, crash: true });
  spawnFx(x, y, z, s.side, s.L * 0.25, 26); if (GRD) groundScar(x, capGroundH(x, z), z, s.L * 0.15);
  if (s.k === CAP.cur) capFeed('撞擊！船體受損', 'bad');
}
// 船與船：太近就推開（只推我方的船）
function capCollide(t) {
  const L = CAP.ships.filter((s) => !s.dead);
  for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
    const A = L[a], B = L[b], dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, d = Math.hypot(dx, dy, dz), R = (A.L + B.L) * 0.42;
    if (d >= R || d < 1e-4) continue;
    const k = (R - d) / d * 0.5; A.x -= dx * k; A.y -= dy * k * 0.5; A.z -= dz * k; B.x += dx * k; B.y += dy * k * 0.5; B.z += dz * k;
  }
  if (simTick % 3) return;
  for (const s of L) for (const P of CAP.pat) {
    if (!P.on) continue;
    for (const q of P.f.sqs) for (const i of q.list) {
      if (!ships.alive[i]) continue; shipWorldCPU(i, _cq);
      const dx = s.x - _cq.x, dy = s.y - _cq.y, dz = s.z - _cq.z, d = Math.hypot(dx, dy, dz), R = s.L * 0.4 + TYPE_W[ships.type[i]] * CAP.sc.ship * 0.4;
      if (d < R && d > 1e-4) { const k = (R - d) / d; s.x += dx * k; s.y += dy * k; s.z += dz * k; }
    }
  }
}
const _cq = new THREE.Vector3(), _cr = new THREE.Vector3(), _cp = new THREE.Vector3();

// ───── 僚艦 ─────
function capWing(s, t, lead, idx, dt) {
  const I = s.inp, o = CAP.order;
  I.boost = false; I.turn = null; s.aiFire = false; s.aiMsl = false; s.aimP = null;
  let tgt = null;
  if (o === 'focus') tgt = CAP.tgt;
  else if (o === 'free') { if (t > s.aiT) { s.aiT = t + 0.5; s.aiTgt = capNearestEnemy(s, 480); } tgt = s.aiTgt; }
  const tp = tgt ? capTgtPos(tgt, _cr) : null;
  let gx, gy, gz, face = null, pitch = 0, spd0 = 0;
  if (tp) {
    const M = s.H.main, hx = s.x - tp.x, hz = s.z - tp.z, hd = Math.hypot(hx, hz) || 1, R = Math.min(M.range * 0.7, Math.max(40, hd));
    gx = tp.x + hx / hd * R; gz = tp.z + hz / hd * R; gy = Math.max(tp.y + 4, terrainHAt(gx, gz) + 3);
    const dx = tp.x - s.x, dy = tp.y - s.y, dz = tp.z - s.z, d = Math.hypot(dx, dy, dz) || 1;
    face = Math.atan2(dx, dz); pitch = 0;
    s.aimP = { x: tp.x, y: tp.y, z: tp.z };
    s.aiFire = d < M.range;
    s.aiMsl = o === 'focus' && !!s.H.msl && s.mslN > s.H.msl.n * 0.25 && t > s.aiMslT;   // 僚艦：留兩成五備用、每 2.5 秒一發
    if (s.H.skill.key === 'burst' && d > 200 && s.skillCd <= 0) capSkill(s, t);
  } else if (o === 'hold' && s.holdP) { gx = s.holdP.x; gy = s.holdP.y; gz = s.holdP.z; }
  else {
    const side = idx % 2 ? 1 : -1, row = Math.floor(idx / 2) + 1, sp = (lead.L + s.L) * 1.1;
    const Fh = [Math.sin(lead.yaw), Math.cos(lead.yaw)], Rh = [-Fh[1], Fh[0]];
    gx = lead.x + Rh[0] * side * sp * row - Fh[0] * sp * row * 0.8; gz = lead.z + Rh[1] * side * sp * row - Fh[1] * sp * row * 0.8; gy = lead.y + 0.5 * row;
    spd0 = lead.vx * Fh[0] + lead.vz * Fh[1];
  }
  if (s.moveP) { const mv = capMoveGoal(s); gx = mv.x; gy = mv.y; gz = mv.z; spd0 = 0; if (!mv.at) face = null; }   // 俯視：點地移動（到了就守在那裡，照樣打射程內的目標）
  const dx = gx - s.x, dz = gz - s.z, dH = Math.hypot(dx, dz);
  I.yaw = face != null ? face : dH > 8 ? Math.atan2(dx, dz) : o === 'follow' && !s.moveP ? lead.yaw : s.yaw;
  I.pitch = pitch;
  const Fh = [Math.sin(s.yaw), Math.cos(s.yaw)], ahead = dx * Fh[0] + dz * Fh[1], lat = dx * -Fh[1] + dz * Fh[0];
  const want = spd0 + ahead * 0.5;
  I.thr = Math.max(-0.3, Math.min(1, want / s.H.cruise)); I.boost = want > s.H.cruise * 1.2 && ahead > 30;
  I.strafe = Math.max(-1, Math.min(1, lat * 0.4 / s.H.strafe));
  I.vert = Math.max(-1, Math.min(1, (gy - s.y) * 0.6 / s.H.climb));
  if (s.agl < 2) I.vert = 1;
  let need = -1e9; for (const k of [1, 2.5]) need = Math.max(need, capGroundH(s.x + s.vx * k, s.z + s.vz * k));
  if (s.y < need + s.L * 0.13 + 1.5) { I.vert = 1; if (s.y < need + s.L * 0.13) I.thr = Math.min(I.thr, 0.2); }
  // 支援艦：替受傷的友艦修理；重砲艦：受傷時開護盾
  if (s.H.skill.key === 'shield' && s.skillCd <= 0 && ships.hp[s.i] < maxHp(s.i) * 0.5 && t - s.hitT < 2) capSkill(s, t);
  capHullAI(s, t);
}
// 點地移動的目標點：地面＝保持離地；到了（at）＝改成照目標轉船頭
function capMoveGoal(s) {
  const P = s.moveP, gy = GRD ? Math.max(P.y, capGroundH(P.x, P.z) + s.L * 0.13 + 4) : P.y;
  return { x: P.x, y: gy, z: P.z, at: Math.hypot(P.x - s.x, P.z - s.z) < Math.max(30, s.L * 1.5) };
}
// 自己的船：自動航行到 CAP.nav（任何移動鍵＝取消；到了＝停下）
function capNav(s, I) {
  const P = CAP.nav, gy = GRD ? Math.max(P.y, capGroundH(P.x, P.z) + s.L * 0.13 + 4) : P.y;
  const dx = P.x - s.x, dz = P.z - s.z, dH = Math.hypot(dx, dz);
  if (dH < Math.max(12, s.L * 0.8)) { CAP.nav = null; CAP.thr = 0; capFeed('抵達指定位置', 'ok'); return; }
  const Fh = [Math.sin(s.yaw), Math.cos(s.yaw)], ahead = dx * Fh[0] + dz * Fh[1];
  I.turn = null; I.yaw = Math.atan2(dx, dz); I.strafe = 0;
  I.thr = Math.max(0, Math.min(1, ahead * 0.5 / s.H.cruise)); CAP.thr = I.thr;
  I.vert = Math.max(-1, Math.min(1, (gy - s.y) * 0.6 / s.H.climb));
  if (GRD) { let need = -1e9; for (const k of [1, 2.5]) need = Math.max(need, capGroundH(s.x + s.vx * k, s.z + s.vz * k)); if (s.y < need + s.L * 0.13 + 1.5) I.vert = 1; }
}
function capNearestEnemy(s, R) {
  let best = null, bd = R;
  const es = 1 - s.side, t = U.uTime.value;
  for (let i = 0; i < shipCount; i++) { if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].hidden || !capVis(s, i, t)) continue; shipWorldCPU(i, _cp); const d = Math.hypot(_cp.x - s.x, _cp.y - s.y, _cp.z - s.z); if (d < bd) { bd = d; best = { k: 's', i }; } }
  for (const g of CAP.G.gts) { if (g.side !== es || gtDead(g) || (!s.foe && !CAP.seeG[g.id]) || g.kind === 'bldg' && !g.mis) continue; const d = Math.hypot(g.x - s.x, g.y - s.y, g.z - s.z) * (CAP_COMBAT[g.kind] ? 0.8 : 1); if (d < bd) { bd = d; best = { k: 'g', i: g.id }; } }
  return best;
}
// 目標的位置（死了／不見了＝null）
function capTgtPos(T, out) {
  if (!T) return null;
  if (T.k === 'm') { if (!misLive[T.i] || misGen[T.i] !== T.g) return null; const u = (U.uTime.value - misT[T.i * 4]) / misT[T.i * 4 + 1]; if (u < 0 || u >= 1) return null; return bezCPU(T.i, u, out); }
  if (T.k === 'f') { if (FT.state[T.i] !== 2 || FT.side[T.i] === CAP.side) return null; out.set(fP[T.i * 3], fP[T.i * 3 + 1], fP[T.i * 3 + 2]); return out; }
  if (T.k === 'g') { const g = CAP.G.gts[T.i]; if (!g || gtDead(g)) return null; out.set(g.x, g.y + g.hh, g.z); return out; }
  if (T.k === 'ms') { const M = CAP.G.ms[T.i], c = capCur(); if (!M || M.dead || !c) return null; return groundMsPoint(T.i, c.x, c.y, c.z, out); }
  if (!ships.alive[T.i]) return null; shipWorldCPU(T.i, out); return out;
}
function capTgtName(T) { return !T ? '' : T.k === 'm' ? '敵飛彈' : T.k === 'f' ? '敵戰機' : T.k === 'g' ? CAP.G.gts[T.i].name : T.k === 'ms' ? `${CAP.G.ms[T.i].name}（${Math.max(0, Math.round(CAP.G.ms[T.i].hpNow / CAP.G.ms[T.i].hp * 100))}%）` : capShipName(T.i); }
// 敵艦的名字：特製戰艦用小隊裡的名字（例如「敵 A 隊・重砲艦」）
function capShipName(i) { const k = capShip(i); return k >= 0 ? CAP.ships[k].name : `敵${SHIP_TYPES[ships.type[i]].name}`; }

// ───── 敵方地面單位：移動 ─────
function capCoast(z) { const cf = GRD && GRD.extra && GRD.extra.coastF; return cf ? -110 + cf[0] * Math.sin(z / cf[1]) + cf[2] * Math.sin(z / cf[3] + cf[4]) : null; }
function capLandOk(x, z) { const c = capCoast(z); return Math.abs(x) < 1250 && Math.abs(z) < 1250 && (c == null || x < c - 15) && CAP.G.pil.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + 6); }
function capSeaOk(x, z) { const c = capCoast(z); return c != null && x > c + 30 && Math.abs(x) < 1300 && Math.abs(z) < 1250; }
function capUnitsMove(dt, t) {
  for (const g of CAP.G.gts) {
    if (!g.mv || gtDead(g)) continue;
    const T = CAP_UNIT[g.cu];
    // 決定要去哪：飛彈車＝打完就換位置、警報中往最後看到你的地方靠近；軍艦＝沿航線巡邏
    if (g.st !== 'move' && t > g.moveT) {
      let goal = null;
      if (T.sea) {
        if (CAP.alarm && CAP.last && t - CAP.last.t < 40) goal = capStandoff(g, CAP.last, T.msl.range * 0.7, capSeaOk);
        if (!goal) for (let k = 0; k < 12 && !goal; k++) { const a = capRnd() * TAU, r = 80 + capRnd() * 200, x = g.home.x + Math.sin(a) * r, z = g.home.z + Math.cos(a) * r; if (capSeaOk(x, z)) goal = { x, z }; }
        g.moveT = t + 20 + capRnd() * 20;
      } else if (CAP.alarm && CAP.last && t - CAP.last.t < 40 && Math.hypot(CAP.last.x - g.x, CAP.last.z - g.z) > T.msl.range * 0.8) {
        goal = capStandoff(g, CAP.last, T.msl.range * 0.65, capLandOk); g.moveT = t + 20;
      } else g.moveT = t + 8;
      if (goal) { g.st = 'move'; g.tx = goal.x; g.tz = goal.z; }
    }
    if (g.st !== 'move') continue;
    const dx = g.tx - g.x, dz = g.tz - g.z, d = Math.hypot(dx, dz);
    if (d < 1) { g.st = 'idle'; continue; }
    const want = Math.atan2(dx, dz), turn = 1.2 * dt, dh = wrapAngle(want - g.hd);
    g.hd = wrapAngle(g.hd + Math.max(-turn, Math.min(turn, dh)));
    const v = T.mv * (Math.abs(dh) > 1 ? 0.3 : 1) * dt, nx = g.x + Math.sin(g.hd) * v, nz = g.z + Math.cos(g.hd) * v;
    if (T.sea ? !capSeaOk(nx, nz) : !capLandOk(nx, nz)) { g.st = 'idle'; g.moveT = t + 2; continue; }
    g.x = nx; g.z = nz; g.y = T.sea ? GROUND_Y : terrainHAt(nx, nz);
  }
}
// 離 P 大約 R 的一點（在 g 這一側），符合 ok
function capStandoff(g, P, R, ok) {
  for (let k = 0; k < 10; k++) {
    const a = Math.atan2(g.x - P.x, g.z - P.z) + (capRnd() - 0.5) * (0.6 + k * 0.25), r = R * (0.8 + capRnd() * 0.4), x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
    if (ok(x, z)) return { x, z };
  }
  return null;
}

// ───── 戰鬥（每 tick） ─────
// ───── 玩家小隊的武器：火控閘門、挑目標 ─────
function capFcKey() { return CAP_FC[CAP.fc].key; }
// 開火閘門：不攻擊＝全停；手動＝按住開火鍵才打（僚艦跟著玩家開火）；自動＝有目標就打。k：0＝左鍵（主砲、砲塔、點防禦）、1＝右鍵（飛彈）
function capTrig(k) { const fc = capFcKey(); return fc === 'auto' || fc === 'manual' && CAP.fire[k] && capIn(); }
function capSameT(a, b) { return a === b || !!a && !!b && a.k === b.k && a.i === b.i; }
// 射程 R 內的目標：先回傳鎖定的目標（CAP.tgt），沒有就回傳最近的敵人。kinds：s＝敵艦、g＝地面單位、f＝艦載機、m＝飛來的飛彈；ok＝額外條件（例如主砲射界）
//   一般建築（不是任務目標）不打；任務目標建築只有鎖定了才打
function capWpnPick(s, R, kinds, ok) {
  const dd = (x, y, z) => Math.hypot(x - s.x, y - s.y, z - s.z), T = CAP.tgt;
  const tp = T && kinds.includes(T.k === 'ms' ? 'g' : T.k) ? capTgtPos(T, _cr) : null;
  if (tp && dd(tp.x, tp.y, tp.z) <= R && (!ok || ok(tp.x, tp.y, tp.z))) return T;
  const es = 1 - s.side, t = U.uTime.value; let best = null, bd = R;
  const test = (o, x, y, z) => { const d = dd(x, y, z); if (d < bd && (!ok || ok(x, y, z))) { bd = d; best = o; } };
  if (kinds.includes('s')) for (let i = 0; i < shipCount; i++) { if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].hidden || !capVis(s, i, t)) continue; shipWorldCPU(i, _cp); test({ k: 's', i }, _cp.x, _cp.y, _cp.z); }
  if (kinds.includes('g')) for (const g of CAP.G.gts) if (g.side === es && !gtDead(g) && CAP.seeG[g.id] && g.kind !== 'bldg') test({ k: 'g', i: g.id }, g.x, g.y + g.hh, g.z);
  if (kinds.includes('f') || kinds.includes('m')) {
    airIndex(); const A = AIR.map[es];
    if (A) for (const arr of A.values()) for (const o of arr) {
      if (o.a === 1 ? !kinds.includes('f') || FT.kind[o.i] === 1 : !kinds.includes('m')) continue;
      test(o.a === 1 ? { k: 'f', i: o.i } : { k: 'm', i: o.i, g: o.g }, o.x, o.y, o.z);
    }
  }
  return best;
}
// 瞄準點：目標的位置＋提前量（子彈速度 spd）
const _wp = new THREE.Vector3();
function capLeadPos(T, s, spd) {
  const p = capTgtPos(T, _wp); if (!p) return null;
  let vx = 0, vy = 0, vz = 0;
  if (T.k === 'f') { vx = fV[T.i * 3]; vy = fV[T.i * 3 + 1]; vz = fV[T.i * 3 + 2]; }
  else if (T.k === 's') { const k = capShip(T.i); if (k >= 0) { const o = CAP.ships[k]; vx = o.vx; vy = o.vy; vz = o.vz; } }
  const tt = Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) / spd;
  return { x: p.x + vx * tt, y: p.y + vy * tt, z: p.z + vz * tt };
}
// 玩家小隊（自己操控的船＋同小隊的僚艦）：火控決定開不開火；目標＝鎖定的優先，射程內沒有就打最近的
function capSquadWeapons(s, dt, t, ctl) {
  const H = s.H, M = H.main, fc = capFcKey(), fire0 = capTrig(0), held = CAP.fire[0] && capIn();
  if (simTick % 3 === s.k % 3) capRam(s, t);
  // 主砲：射程內、射界內的目標（每 6 tick 重挑；目標還在就一直追著瞄）
  const arcOk = (x, y, z) => { const [mx, my, mz] = capMuzzle(s), dx = x - mx, dz = z - mz, wy = Math.abs(wrapAngle(Math.atan2(dx, dz) - s.yaw)), wp = Math.atan2(y - my, Math.hypot(dx, dz)); return wy <= M.arc * DEG && wp >= CAP_GUN_PITCH[0] && wp <= CAP_GUN_PITCH[1]; };
  if (fc === 'hold') s.wT = null;
  else if (simTick % 6 === s.k % 6 || !s.wT || !capTgtPos(s.wT, _cr)) s.wT = capWpnPick(s, M.range, 'sgfm', arcOk);
  const wp = s.wT ? capLeadPos(s.wT, s, M.spd) : null;
  capGunAim(s, dt, wp || (ctl ? CAP.aimPt : null));
  const want = fc === 'hold' ? false : ctl ? (fc === 'auto' ? !!wp || held : held) : fire0 && !!wp;   // 沒有目標時，自己的船按住開火＝打準心指的地方
  if (want && s.mainCd <= 0 && s.gOk && s.gAl) { capMain(s, t); if (ctl) CAP.shakeT = performance.now(); }
  else if (ctl && (CAP.press[0] || CAP.press[1]) && fc === 'hold') capFeed(`火控「不攻擊」：按 ${keyText('cap_fc')} 切換`, 'hint');
  else if (ctl && CAP.press[0] && s.mainCd <= 0 && !s.gOk && !wp) capFeed('主砲：準心在射界外，先把船轉過去', 'hint');
  // 飛彈：射程內的敵艦、地面單位（鎖定的優先）；換目標要重新鎖定
  if (H.msl) {
    if (fc === 'hold') { s.mT = null; }
    else if (simTick % 6 === (s.k + 3) % 6 || s.mT && !capTgtPos(s.mT, _cr)) {
      const n = capWpnPick(s, H.msl.range, 'sg', (x, y, z) => capBlock(s.x, s.y, s.z, x, y + 0.5, z) < 0);
      if (!capSameT(n, s.mT)) s.lockT = 0; s.mT = n;
    }
    s.lockT = s.mT ? Math.min(H.msl.lockT * 1.5, s.lockT + dt) : Math.max(0, s.lockT - dt * 2);
    const press = ctl && (CAP.press[1] || CAP.fire[1] && capIn()), keep = ctl || s.mslN > H.msl.n * 0.25;   // 僚艦留兩成五備用
    const go = fc === 'auto' ? press || keep && t > s.aiMslT : fc === 'manual' && (press || !ctl && keep && CAP.fire[1] && capIn() && t > s.aiMslT);
    if (go) capMissile(s, t, ctl && CAP.press[1]);
  }
  // 技能
  if (H.skill.key === 'repair') { if (ctl) capRepair(s, dt, t, CAP.skillHeld && capIn()); else capRepairAI(s, dt, t); }
  // 砲塔、點防禦：和主砲一起，照火控開火
  if (fc !== 'hold' && fire0) { capPD(s, dt, t); capTurretsP(s, dt, t); }
}
// 玩家小隊的砲塔：全部打同一個目標（鎖定的優先，沒有就最近的敵艦、地面單位、艦載機）
function capTurretsP(s, dt, t) {
  const T = s.H.tur;
  if (simTick % 6 === (s.k + 1) % 6 || !s.tT || !capTgtPos(s.tT, _cr)) s.tT = capWpnPick(s, T.range, 'sgf');
  for (let m = 0; m < T.n; m++) {
    s.tcd[m] -= dt; if (s.tcd[m] > 0) continue;
    if (!s.tT || !capTgtPos(s.tT, _cr)) { s.tcd[m] = 0.3 + capRnd() * 0.2; continue; }
    s.tcd[m] = T.cd * (0.85 + capRnd() * 0.3);
    capTurretShot(s, m, T, s.tT, t);
  }
}
// 彈藥補充（CAP_AMMO）：雙方的特製戰艦都會補（只補我方＝對等的交戰我方佔便宜）；不在戰鬥時加倍
function capAmmoTick(dt, t) {
  if (simTick % 30 === 17) CAP.calm = !capCalmWhy(t);
  const k = dt * (CAP.calm ? CAP_AMMO.calm : 1);
  for (const s of CAP.ships) {
    if (s.dead) continue;
    const M = s.H.msl;
    if (M && s.mslN < M.n) { s.mslAcc += k * M.n / CAP_AMMO.msl; while (s.mslAcc >= 1 && s.mslN < M.n) { s.mslAcc -= 1; s.mslN++; } } else s.mslAcc = 0;
    if (s.ftrMax && s.ftrLost > 0) { s.ftrAcc += k / CAP_AMMO.ftr; if (s.ftrAcc >= 1) { s.ftrAcc = 0; s.ftrLost--; } } else s.ftrAcc = 0;
  }
}
// ───── 子彈特效 ─────
// main.js 的光束：陣營編在整數部分、亮度在小數部分，所以 inten 一定要 < 1（≥ 1 會變成別的陣營顏色、亮度掉下來）
// capBolt：一發子彈＝中間一條亮的＋旁邊幾條暗一點的（看起來比較粗）；seg＝亮的那一段多長（世界單位），wid＝粗細（世界單位，0＝一條）
function capBolt(ax, ay, az, bx, by, bz, t, dur, side, inten, seg, wid) {
  const d = Math.hypot(bx - ax, by - ay, bz - az) || 1, len = Math.min(1, seg / d), fac = SIDE_FAC[side], I = Math.min(0.95, inten);
  spawnBeam(ax, ay, az, bx, by, bz, t, dur, side, I, len, fac);
  if (!(wid > 0)) return;
  let nx = -(bz - az), nz = bx - ax; const nl = Math.hypot(nx, nz) || 1; nx = nx / nl * wid; nz = nz / nl * wid;
  spawnBeam(ax + nx, ay, az + nz, bx + nx, by, bz + nz, t, dur, side, I * 0.6, len, fac);
  spawnBeam(ax - nx, ay, az - nz, bx - nx, by, bz - nz, t, dur, side, I * 0.6, len, fac);
  spawnBeam(ax, ay + wid, az, bx, by + wid, bz, t, dur, side, I * 0.5, len, fac);
}
// 命中閃光：子彈飛到的時候才炸（CAP.fxq，capCombat 每一幀處理）
function capFxAt(t, x, y, z, side, r, heavy) { CAP.fxq.push({ t, x, y, z, side, r, heavy }); }
function capFxTick(t) {
  for (let k = CAP.fxq.length - 1; k >= 0; k--) {
    const e = CAP.fxq[k]; if (e.t > t) continue;
    spawnFx(e.x, e.y, e.z, e.side, e.r, e.heavy ? 22 : 30);
    pfxHull(e.x, e.y, e.z, e.r * 0.5, e.heavy);
    CAP.fxq.splice(k, 1);
  }
}
function capCombat(dt) {
  const t = U.uTime.value;
  airIndex();
  for (const s of CAP.ships) if (!s.dead && ships.alive[s.i]) capShipWeapons(s, dt, t);
  CAP.press[0] = CAP.press[1] = false;
  capAmmoTick(dt, t);
  capFxTick(t);
  capMissilesStep(dt, t);
  capUnitsFire(dt, t);
  capEscorts(t);
  if (simTick % 15 === 5) capDetect(0.25, t);
  if (simTick % 15 === 9) capSeeEnemies(t);
  if (simTick % 30 === 13) capEnemyAI(t);
  capAlarmTick(t);
  capShipsCheck(t);
  if (simTick % 30 === 21) capMisTick(t);
}
function capSig(s, t, k = 1) { s.sigT = Math.max(s.sigT, t + CAP_RULE.sig * k); capCloakBreak(s, t); }
function capShipWeapons(s, dt, t) {
  const ai = capIsAI(s), ctl = !ai && s.k === CAP.cur, H = s.H;
  if (ctl) s.flyT = (s.flyT || 0) + dt;   // 艦長熟練度：親自開的時間
  s.mainCd -= dt; s.mslCd -= dt; s.skillCd -= dt;
  if (!ai) { capSquadWeapons(s, dt, t, ctl); return; }
  // 鎖定（飛彈）：目標在射程內、看得到就累積
  const T = ai ? s.aiTgt : ctl || CAP.order === 'focus' ? CAP.tgt : null, tp = T ? capTgtPos(T, _cr) : null;
  if (H.msl && tp && T.k !== 'f' && Math.hypot(tp.x - s.x, tp.y - s.y, tp.z - s.z) <= H.msl.range && !(T.k === 'g' && capBlock(s.x, s.y, s.z, tp.x, tp.y + 0.5, tp.z) >= 0)) s.lockT = Math.min(H.msl.lockT * 1.5, s.lockT + dt);
  else s.lockT = Math.max(0, s.lockT - dt * 2);
  if (T && !tp && ctl) CAP.tgt = null;
  // 主砲砲塔：轉向準心（僚艦：轉向目標），在射界內、對準了才開火
  capGunAim(s, dt, ctl ? CAP.aimPt : s.aimP);
  if ((ctl ? CAP.fire[0] && capIn() : s.aiFire) && s.mainCd <= 0 && s.gOk && s.gAl) { capMain(s, t); if (ctl) CAP.shakeT = performance.now(); }
  else if (ctl && CAP.press[0] && s.mainCd <= 0 && !s.gOk) capFeed('主砲：準心在射界外，先把船轉過去', 'hint');
  if (simTick % 3 === s.k % 3) capRam(s, t);
  if (ctl ? CAP.press[1] || (CAP.fire[1] && capIn()) : s.aiMsl) capMissile(s, t, ctl && CAP.press[1]);
  // 技能
  if (ctl && H.skill.key === 'repair') capRepair(s, dt, t, CAP.skillHeld && capIn());
  else if (!ctl && H.skill.key === 'repair') capRepairAI(s, dt, t);
  // 自動武器（AI 一律自由開火）
  const fc = ai ? 'free' : CAP_FC[CAP.fc].key;
  if (fc !== 'hold') capPD(s, dt, t);
  if (fc !== 'hold') capTurrets(s, dt, t, fc);
  else if (!ctl && CAP.order === 'focus' && CAP.tgt) capTurrets(s, dt, t, 'focus');
}
// ───── 主砲砲塔 ─────
// 準心指到的地方（鏡頭沿瞄準方向的射線：敵艦、地面單位、建築、地面、巨型結構；什麼都沒有＝前方 500）
function capAimPoint() {
  const A = capAim(), cx = camPersp.position.x, cy = camPersp.position.y, cz = camPersp.position.z;
  const h = pilotRay(cx, cy, cz, A, 900, { speed: 1e9 }, false, 1 - CAP.side), mh = groundMsRay(cx, cy, cz, A, h.k ? h.s + 0.5 : 900);
  const s = mh ? mh.s : h.k ? h.s : 500;
  CAP.aimPt = { x: cx + A[0] * s, y: cy + A[1] * s, z: cz + A[2] * s, hit: !!(mh || h.k) };
  const G = h.k === 'g' ? CAP.G.gts[h.i] : null;   // 準心的射線直接打到的敵人（鎖定用）
  CAP.aimHit = mh ? { k: 'ms', i: mh.id } : h.k === 's' && CAP.seeS[h.i] ? { k: 's', i: h.i } : G && CAP.seeG[G.id] && !(G.kind === 'bldg' && !G.mis) ? { k: 'g', i: G.id } : null;
}
// 鎖定（所有視角）：準心（俯視＝游標）停在敵人上＝鎖定它，一直鎖著，直到準心移到另一個敵人上；目標離開畫面＝解除
function capLockAim() {
  if (!capIn()) return;
  if (CAP.tgt) { const tp = capTgtPos(CAP.tgt, _cr); if (tp && !capOnScr(capScr(tp.x, tp.y, tp.z))) { CAP.tgt = null; capFeed('目標離開畫面，解除鎖定', 'hint'); } }
  const h = capTop() ? capHover(true) : capHover(true, [VW / 2, VH / 2]) || CAP.aimHit;
  if (h && !capSameT(CAP.tgt, h)) { CAP.tgt = { k: h.k, i: h.i }; capFeed(`鎖定：${capTgtName(h)}`, 'hint'); }
}
// 俯視：游標指到的地方。游標停在敵人上＝鎖定它（一直鎖著，直到游標移到另一個敵人上）；瞄準點＝鎖定的目標，沒有目標＝游標在船的高度的平面上
const _tr = new THREE.Vector3();
function capScr(x, y, z) { _tr.set(x, y, z).project(camPersp); return _tr.z < 1 && _tr.z > -1 ? [(_tr.x * 0.5 + 0.5) * VW, (-_tr.y * 0.5 + 0.5) * VH] : null; }
function capMouseVW() { const R = canvas.getBoundingClientRect(); return CAP.mx < 0 ? null : [(CAP.mx - R.left) * VW / (R.width || 1), (CAP.my - R.top) * VH / (R.height || 1)]; }
// 游標的射線打到高度 y 的平面
function capMousePlane(y) {
  const m = capMouseVW(); if (!m) return null;
  _tr.set(m[0] / VW * 2 - 1, -(m[1] / VH * 2 - 1), 0.5).unproject(camPersp);
  const o = camPersp.position, dx = _tr.x - o.x, dy = _tr.y - o.y, dz = _tr.z - o.z;
  if (dy > -1e-6) return null; const k = (y - o.y) / dy; if (k <= 0) return null;
  return { x: o.x + dx * k, y, z: o.z + dz * k };
}
// 游標附近（畫面上）的東西：foe＝敵艦、敵方地面單位；否則＝我方的船
function capHover(foe, at) {
  const m = at || capMouseVW(); if (!m) return null;
  let best = null, bd = 1e9;
  const test = (o, x, y, z, L) => { const p = capScr(x, y, z); if (!p) return; const q = capScr(x + L * 0.5, y, z), R = Math.max(22, q ? Math.hypot(q[0] - p[0], q[1] - p[1]) * 1.2 : 0), d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < R && d < bd) { bd = d; best = o; } };
  if (foe) {
    const es = 1 - CAP.side;
    for (let i = 0; i < shipCount; i++) { if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].hidden || !CAP.seeS[i]) continue; shipWorldCPU(i, _cp); const k = capShip(i); test({ k: 's', i }, _cp.x, _cp.y, _cp.z, k >= 0 ? CAP.ships[k].L : 8); }
    for (const g of CAP.G.gts) if (g.side === es && !gtDead(g) && CAP.seeG[g.id] && !(g.kind === 'bldg' && !g.mis)) test({ k: 'g', i: g.id }, g.x, g.y + g.hh, g.z, 4);
  } else for (const o of CAP.own) if (!o.dead) test(o, o.x, o.y, o.z, o.L);
  return best;
}
function capOnScr(p) { return !!p && p[0] >= 0 && p[0] <= VW && p[1] >= 0 && p[1] <= VH; }
function capAimTop(s) {
  if (!capIn()) return;
  CAP.hov = capHover(false);
  const P = capMousePlane(s.y);   // 準心＝游標（鎖定在 capLockAim；砲塔自己轉向目標）
  if (!P) return;
  P.hit = true; CAP.aimPt = P; CAP.aimHit = null;
  const dx = P.x - s.x, dy = P.y - s.y, dz = P.z - s.z;   // 換回第三人稱時，鏡頭朝著原本瞄的方向
  CAP.yaw = Math.atan2(dx, dz); CAP.pitch = Math.max(-1.2, Math.min(1.0, Math.atan2(dy, Math.hypot(dx, dz))));
}
// 俯視：中鍵／G＝移動到游標處（選取的我方船；沒選＝自己的船自動航行）
function capMoveCmd() {
  const s = capCur(); if (!s || !capTop()) return;
  for (const k of [...CAP.sel]) { const o = CAP.ships[k]; if (!o || o.dead) CAP.sel.delete(k); }
  const sel = [...CAP.sel].map((k) => CAP.ships[k]).filter((o) => o !== s);
  const P = capMousePlane(sel.length ? sel[0].y : s.y); if (!P) return;
  if (!sel.length) { CAP.nav = P; capFeed('自動航行：按任何移動鍵取消', 'ok'); return; }
  // 多艘：在目標點附近排開
  const n = sel.length, sp = Math.max(...sel.map((o) => o.L)) * 2.2;
  sel.forEach((o, k) => { const a = k * 2.4, rr = n > 1 ? sp * (0.6 + 0.25 * k) : 0; o.moveP = { x: P.x + Math.sin(a) * rr, y: o.y, z: P.z + Math.cos(a) * rr }; });
  capFeed(`${n} 艘移動到指定位置（守在那裡；按 ${keyText('cap_o1')}～${keyText('cap_o4')} 取消）`, 'ok');
}
// 俯視：左鍵點我方的船＝選取／取消；點自己操控的船＝清除選取
function capSelClick() {
  const o = CAP.hov, s = capCur(); if (!o || !s) return false;
  if (o === s) { CAP.sel.clear(); capFeed('取消選取：移動指令給自己的船', 'hint'); return true; }
  if (CAP.sel.has(o.k)) CAP.sel.delete(o.k); else CAP.sel.add(o.k);
  capFeed(CAP.sel.size ? `選取 ${CAP.sel.size} 艘：按中鍵或 ${keyText('cap_move')} 移動到游標處` : '取消選取', 'hint');
  return true;
}
const _muz = [0, 0, 0];
function capMuzzle(s) { const f = s.L * 0.28, u = s.L * 0.09; return [s.x + s.F[0] * f + s.U[0] * u, s.y + s.F[1] * f + s.U[1] * u, s.z + s.F[2] * f + s.U[2] * u]; }
function capGunDir(s) { const a = s.yaw + s.gY, c = Math.cos(s.gP); return [Math.sin(a) * c, Math.sin(s.gP), Math.cos(a) * c]; }
// 砲塔轉向 P（每秒最多 trav 度）；gOk＝P 在射界內、gAl＝已經對準
function capGunAim(s, dt, P) {
  const M = s.H.main, arc = M.arc * DEG, tr = M.trav * DEG * dt;
  let wy = 0, wp = 0; s.gOk = true;
  if (P) {
    const [mx, my, mz] = capMuzzle(s), dx = P.x - mx, dy = P.y - my, dz = P.z - mz;
    wy = wrapAngle(Math.atan2(dx, dz) - s.yaw); wp = Math.atan2(dy, Math.hypot(dx, dz));
    s.gOk = Math.abs(wy) <= arc && wp >= CAP_GUN_PITCH[0] && wp <= CAP_GUN_PITCH[1];
    wy = Math.max(-arc, Math.min(arc, wy)); wp = Math.max(CAP_GUN_PITCH[0], Math.min(CAP_GUN_PITCH[1], wp));
  }
  s.gY += Math.max(-tr, Math.min(tr, wy - s.gY)); s.gP += Math.max(-tr, Math.min(tr, wp - s.gP));
  s.gAl = Math.abs(wy - s.gY) < 0.02 && Math.abs(wp - s.gP) < 0.02;
}
// 船身撞上一般建築：建築倒塌，船受一點傷、減速一點
function capRam(s, t) {
  if (!GV.bld) return;
  const bot = s.y - s.L * 0.13, top = s.y + s.L * 0.08; let n = 0;
  for (const k of [-0.35, 0, 0.35]) groundBldEach(s.x + s.F[0] * s.L * k, s.z + s.F[2] * s.L * k, s.L * 0.16, bot, top, (i) => { if (groundBldKill(i, s.x, s.z)) n++; });
  if (!n) return;
  spawnFx(s.x + s.F[0] * s.L * 0.4, bot + 0.2, s.z + s.F[2] * s.L * 0.4, s.side, s.L * 0.12, 24);
  s.vx *= 0.96; s.vz *= 0.96;
  if (t - s.ramT > 0.4) {
    pending.push({ t, target: s.i, side: 1 - s.side, asp: 0, dmg: 1.5 * n, hm: 1, fx: false, dirIdx: 0, x: s.x, y: bot, z: s.z, crash: true });
    if (s.k === CAP.cur && t - s.ramT > 2) capFeed('撞穿建築！', 'hint');
    s.ramT = t;
  }
}
function capMain(s, t) {
  const M = s.H.main; s.mainCd = M.cd;
  const G = capGunDir(s), [ox, oy, oz] = capMuzzle(s);
  const sp = 0.004, D = v3.norm([G[0] + (capRnd() - 0.5) * sp * 2, G[1] + (capRnd() - 0.5) * sp * 2, G[2] + (capRnd() - 0.5) * sp * 2]);
  const h = pilotRay(ox, oy, oz, D, M.range, { speed: M.spd }, true, 1 - s.side), mh = s.foe ? null : groundMsRay(ox, oy, oz, D, h.k ? h.s + 0.5 : M.range);
  if (mh) { h.k = 'ms'; h.i = mh.id; h.s = mh.s; }
  const sd = h.s, tf = sd / M.spd;
  const ex = ox + D[0] * sd, ey = oy + D[1] * sd, ez = oz + D[2] * sd, side = s.side;
  const dmg = M.dmg * s.dm, sdm = s.foe ? dmg / CAP_RULE.gunMul : dmg;   // 敵方特製戰艦打玩家：main.js 會把敵方的砲 ×gunMul（給一般戰艦用），先除掉
  const F = M.fx, hv = F ? !!F.hv : M.dmg >= 50;   // F＝改裝的主砲模組的外觀（caphulls.js CAP_MODS）
  // 畫面：從主砲的砲口出去（每門主砲、每根砲管輪流；capfx.js capMuzzleAt），命中判定照舊用船上的瞄準點
  const [vx, vy, vz] = capMuzzleAt(s, 'main', (s.muzN = (s.muzN || 0) + 1), _muz) || [ox, oy, oz];
  if (F && F.beam) capBolt(vx, vy, vz, ex, ey, ez, t, 0.3, side, 0.95, sd + 1, s.L * F.wid);   // 光束：整條一起亮
  else {
    capBolt(vx, vy, vz, ex, ey, ez, t, tf, side, 0.95, F ? Math.max(s.L * F.seg, 8) : Math.max(s.L * (hv ? 1.6 : 1.1), hv ? 22 : 14), s.L * (F ? F.wid : hv ? 0.05 : 0.035));
    spawnBeam(vx, vy, vz, ex, ey, ez, t, tf, side, F && F.trail ? F.trail : 0.3, 0.75, SIDE_FAC[side]);   // 淡淡的彈道（看得出從哪裡打到哪裡）
  }
  rigFire(s.i, 'main', t, ex, ey, ez);   // 3D 砲塔轉向、後座
  spawnFx(vx, vy, vz, side, s.L * (F ? F.fl : hv ? 0.4 : 0.26), 30);   // 砲口閃光
  if (h.k) capFxAt(t + tf, ex, ey, ez, side, s.L * (F ? F.hit : hv ? 0.35 : 0.22), hv);   // 命中閃光
  if (!s.foe) CAP.stats.shots++; capSig(s, t);
  if (h.k === 'f') pending.push({ kind: 'ak', a: 1, t: t + tf, i: h.i, dmg: dmg * 0.5, side });
  else if (h.k === 'm') pending.push({ kind: 'ak', a: 0, t: t + tf, i: h.i, g: h.g, dmg: 1, side });
  else if (h.k === 's') { const g = h.i; capBy(s, g); const asp = hitAspect(g, ox, oz, ex, ez, oy, ey); pending.push({ src: 0, gk: 'main', nd: dmg, t: t + tf, target: g, side, asp, dmg: sdm, hm: hitMul(asp, s.q, squadrons[ships.sq[g]]), fx: true, dirIdx: dirIndexOf(ex - ox, ez - oz), x: ex, y: ey, z: ez }); }
  else if (h.k === 'g') pending.push({ kind: 'gt', t: t + tf, gi: h.i, dmg, side, x: ex, y: ey, z: ez });
  else if (h.k === 'ms') pending.push({ kind: 'ms', t: t + tf, id: h.i, dmg, side, x: ex, y: ey, z: ez });
  else if (h.k) pending.push({ kind: 'sp', t: t + tf, x: ex, y: ey, z: ez, side, r: h.k === 'r' ? -1 : M.dmg >= 50 ? 0.8 : 0.4, bi: h.k === 'b' ? h.i : null });
}
function capMissile(s, t, pressed) {
  const M = s.H.msl; if (!M || s.mslCd > 0) return;
  const ctl = s.k === CAP.cur;
  if (s.mslN <= 0) { if (pressed) capFeed('飛彈打完了', 'hint'); return; }
  const T = capIsAI(s) ? s.aiTgt : s.mT, tp = T ? capTgtPos(T, _cr) : null;
  if (!tp || T.k === 'f' || T.k === 'm') { if (pressed) capFeed('飛彈：射程內沒有目標（準心停在敵人上＝鎖定）', 'hint'); return; }
  if (s.lockT < M.lockT) { if (pressed) capFeed(Math.hypot(tp.x - s.x, tp.y - s.y, tp.z - s.z) > M.range ? '飛彈：目標在射程外' : '飛彈：鎖定中…', 'hint'); return; }
  const nS = Math.min(M.salvo || 1, s.mslN);   // 蜂群飛彈：一次齊射幾枚
  s.mslN -= nS; s.mslCd = M.cd * (M.salvo || 1); s.aiMslT = t + 2.5; if (!s.foe) CAP.stats.msl += nS; capSig(s, t);
  rigFire(s.i, 'msl', t, tp.x, tp.y, tp.z);
  for (let j = 0; j < nS; j++) {
    const sp = nS > 1 ? (j - (nS - 1) / 2) * s.L * 0.12 : 0;
    const mu = capMuzzleAt(s, 'msl', (s.mslMz = (s.mslMz || 0) + 1), _muz);   // 從飛彈發射器出去（每座輪流）；船型沒有發射器模型＝甲板上方
    const ox = mu ? mu[0] : s.x + s.U[0] * s.L * 0.12 + s.Rr[0] * sp, oy = mu ? mu[1] : s.y + s.U[1] * s.L * 0.12, oz = mu ? mu[2] : s.z + s.U[2] * s.L * 0.12 + s.Rr[2] * sp;
    if (T.k === 's') { capBy(s, T.i); const n0 = pending.length; if (launchMissileAt(ox, oy, oz, s.side, s.q, T.i, M.dmg * s.dm, t + j * 0.08, 1, 1.2) && pending.length > n0) pending[pending.length - 1].rt = 0; }   // 艦長模式不用艦隊戰的陣營特性（聯盟飛彈換目標）：陣營差異改由招牌模組表現
    else CAP.msl.push({ x: ox, y: oy, z: oz, vx: s.vx * 0.5 + (j - (nS - 1) / 2) * 4, vy: 9, vz: s.vz * 0.5, gi: T.k === 'g' ? T.i : -1, ms: T.k === 'ms' ? T.i : -1, dmg: M.dmg, life: 22, age: 0, n: 0 });
  }
  if (ctl && (pressed || s.mslN % 4 === 0)) capFeed(`飛彈發射 → ${capTgtName(T)}（剩 ${s.mslN} 枚）`, 'ok');
}
// 打地面目標的飛彈：先往上彈出，再導向目標
function capMissilesStep(dt, t) {
  const spd = 100 * CAP_RULE.misSpd;
  for (let k = CAP.msl.length - 1; k >= 0; k--) {
    const m = CAP.msl[k], x0 = m.x, y0 = m.y, z0 = m.z, MS = m.ms >= 0 ? CAP.G.ms[m.ms] : null;
    let g = m.gi >= 0 ? CAP.G.gts[m.gi] : null;
    if (MS && !MS.dead) { groundMsPoint(MS.id, m.x, m.y, m.z, _cp); g = { x: _cp.x, y: _cp.y, z: _cp.z, hh: 0, r: 1.5, ms: MS.id, hp: 1 }; }
    m.life -= dt; m.age += dt;
    if (g && !gtDead(g) && m.age > 0.5) {
      const D = v3.norm([g.x - m.x, g.y + g.hh - m.y, g.z - m.z]), ms = Math.min(spd, Math.hypot(m.vx, m.vy, m.vz) + 30 * dt), V = v3.norm([m.vx, m.vy, m.vz]);
      const ang = Math.acos(Math.max(-1, Math.min(1, v3.dot(V, D)))), tr = 2.2 * dt;
      const N = ang > tr ? v3.rot(V, v3.norm(v3.cross(V, D)), tr) : D;
      m.vx = N[0] * ms; m.vy = N[1] * ms; m.vz = N[2] * ms;
    } else if (m.age <= 0.5) m.vy = Math.max(m.vy, 9);
    m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    if ((m.n++ & 1) === 0) spawnBeam(x0, y0, z0, m.x, m.y, m.z, t, 0.25, CAP.side, 0.9, 1, SIDE_FAC[CAP.side]);
    if (g && !gtDead(g) && Math.hypot(g.x - m.x, g.y + g.hh - m.y, g.z - m.z) < Math.max(1, g.r)) { pending.push(g.ms != null ? { kind: 'ms', t, id: g.ms, dmg: m.dmg, side: CAP.side, x: m.x, y: m.y, z: m.z } : { kind: 'gt', t, gi: g.id, dmg: m.dmg, side: CAP.side, x: m.x, y: m.y, z: m.z }); spawnFx(m.x, m.y, m.z, CAP.side, 2.6, 24); CAP.msl.splice(k, 1); continue; }
    if (m.life <= 0 || m.y < terrainHAt(m.x, m.z)) { spawnFx(m.x, m.y, m.z, CAP.side, 2, 24); if (GRD) groundScar(m.x, terrainHAt(m.x, m.z), m.z, 0.8); CAP.msl.splice(k, 1); }
  }
}
// 點防禦：先打飛來的飛彈，沒有才打戰機
function capPD(s, dt, t) {
  const P = s.H.pd, m = AIR.map[1 - s.side]; if (!P) return;
  for (let k = 0; k < P.n; k++) {
    s.pcd[k] -= dt; if (s.pcd[k] > 0) continue;
    let bm = null, dm = P.far, bf = null, df = P.far;
    if (m.size) for (const arr of m.values()) for (const o of arr) {
      const d = Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z);
      if (o.a === 0) { if (d < dm && misShot[o.i] < 3) { dm = d; bm = o; } } else if (d < df && FT.kind[o.i] !== 1) { df = d; bf = o; }
    }
    const o = bm || bf, d = bm ? dm : df;
    if (!o) { s.pcd[k] = 0.25; continue; }
    s.pcd[k] = P.cd * (0.8 + capRnd() * 0.4);
    const p = P.acc * (o.a === 0 ? 0.55 : 0.4) * (1 - 0.4 * d / P.far), hit = capRnd() < p;
    if (o.a === 0) misShot[o.i]++;
    const a = (k / P.n) * TAU, mx = s.x + s.U[0] * s.L * 0.1 + Math.sin(a) * s.L * 0.15, my = s.y + s.U[1] * s.L * 0.1, mz = s.z + s.U[2] * s.L * 0.1 + Math.cos(a) * s.L * 0.15;
    const mu = capMuzzleAt(s, 'aa', k + (s.pdMz = (s.pdMz || 0) + 1), _muz) || [mx, my, mz];   // 畫面：從防空砲的砲口出去（判定照舊）
    const lead = d / 600, tx = o.x + o.vx * lead + (hit ? 0 : (capRnd() - 0.5) * 6), ty = o.y + o.vy * lead + (hit ? 0 : (capRnd() - 0.5) * 4), tz = o.z + o.vz * lead + (hit ? 0 : (capRnd() - 0.5) * 6);
    const dur = Math.hypot(tx - mx, ty - my, tz - mz) / 600;
    capBolt(mu[0], mu[1], mu[2], tx, ty, tz, t, dur, s.side, 0.8, Math.max(4, s.L * 0.3), 0);
    rigFire(s.i, 'aa', t, tx, ty, tz);
    if (hit) pending.push({ kind: 'ak', t: t + dur, a: o.a, i: o.i, g: o.g, dmg: o.a === 0 ? 1 : P.dmg, side: s.side });
    capSig(s, t, 0.5);
  }
}
// 砲塔：照火控挑目標（focus＝只打指定目標）
function capTurrets(s, dt, t, mode) {
  const T = s.H.tur;
  if (simTick % 15 === s.k % 15 || !s.tl) s.tl = capTurretList(s, T.range, mode, t);
  for (let m = 0; m < T.n; m++) {
    s.tcd[m] -= dt; if (s.tcd[m] > 0) continue;
    const L = s.tl.filter((o) => capTgtPos(o, _cr)); if (!L.length) { s.tcd[m] = 0.4 + capRnd() * 0.3; continue; }
    s.tcd[m] = T.cd * (0.85 + capRnd() * 0.3);
    capTurretShot(s, m, T, L[m % L.length], t);
  }
}
function capTurretList(s, R, mode, t) {
  const es = 1 - s.side, out = [], inR = (x, y, z) => Math.hypot(x - s.x, y - s.y, z - s.z) <= R;
  const T = capIsAI(s) ? s.aiTgt : CAP.tgt, tp = T ? capTgtPos(T, _cr) : null;
  if (tp && inR(tp.x, tp.y, tp.z)) out.push(T);
  if (mode === 'focus') return out;
  const ours = new Set(CAP.own.map((o) => o.q));
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].hidden || (mode === 'free' ? !capVis(s, i, t) : !ours.has(squadrons[ships.sq[i]].group && squadrons[ships.sq[i]].group.target))) continue;
    shipWorldCPU(i, _cp); if (inR(_cp.x, _cp.y, _cp.z)) out.push({ k: 's', i });
  }
  for (const g of CAP.G.gts) {
    if (g.side !== es || gtDead(g) || (mode === 'free' ? !s.foe && !CAP.seeG[g.id] : t - g.fireT > 10)) continue;
    if (inR(g.x, g.y + g.hh, g.z)) out.push({ k: 'g', i: g.id });
  }
  for (const j of aliveF[es]) { if (FT.kind[j] === 1 || !inR(fP[j * 3], fP[j * 3 + 1], fP[j * 3 + 2])) continue; if (mode === 'free' || Math.hypot(fP[j * 3] - s.x, fP[j * 3 + 2] - s.z) < R * 0.6) out.push({ k: 'f', i: j }); }
  return out;
}
function capTurretShot(s, m, T, tg, t) {
  const p = capTgtPos(tg, _cr); if (!p) return;
  const side = s.side, off = (m % 2 ? 1 : -1) * s.L * (0.12 + 0.08 * Math.floor(m / 2)), dmg = T.dmg * s.dm;
  const mx = s.x + s.F[0] * off + s.U[0] * s.L * 0.08, my = s.y + s.F[1] * off + s.U[1] * s.L * 0.08, mz = s.z + s.F[2] * off + s.U[2] * s.L * 0.08;
  let tx = p.x, ty = p.y, tz = p.z;
  if (tg.k === 'f') { const lead = Math.hypot(tx - mx, ty - my, tz - mz) / 620; tx += fV[tg.i * 3] * lead; ty += fV[tg.i * 3 + 1] * lead; tz += fV[tg.i * 3 + 2] * lead; }
  if (rockBlock(mx, my, mz, tx, ty, tz) >= 0) { s.tcd[m] = 0.3; return; }
  const d = Math.hypot(tx - mx, ty - my, tz - mz);
  const sz = tg.k === 'ms' ? 1 : tg.k === 's' ? Math.sqrt(HIT_RULE.size[ships.type[tg.i]]) : tg.k === 'f' ? 0.4 : CAP.G.gts[tg.i].r > 2 ? 1 : CAP.G.gts[tg.i].mv && CAP.G.gts[tg.i].st === 'move' ? 0.6 : 0.8;
  const hit = capRnd() < T.acc * sz * (1 - 0.25 * d / T.range) * (GRD ? Math.sqrt(groundHitMul(my, ty)) : 1);
  if (!hit) { const o = 1.5 + capRnd() * 3; tx += (capRnd() - 0.5) * o * 2; tz += (capRnd() - 0.5) * o * 2; ty += (capRnd() - 0.5) * o; }
  const dur = Math.hypot(tx - mx, ty - my, tz - mz) / 620;
  const F = T.fx;   // 改裝的副砲模組的外觀
  const mu = capMuzzleAt(s, 'sec', m + T.n * (s.secMz = ((s.secMz || 0) + 1) % 64), _muz) || [mx, my, mz];   // 畫面：第 m 座副砲的砲口（多管輪流；判定照舊）
  capBolt(mu[0], mu[1], mu[2], tx, ty, tz, t, dur, side, 0.9, Math.max(F ? 4 : 8, s.L * (F ? F.seg : 0.6)), s.L * (F ? F.wid : 0.015));
  spawnFx(mu[0], mu[1], mu[2], side, s.L * (F ? F.fl : 0.07), 34);   // 砲口閃光
  if (hit) capFxAt(t + dur, tx, ty, tz, side, s.L * (F ? F.hit : 0.1), false);
  rigFire(s.i, 'sec', t, tx, ty, tz);
  capSig(s, t);
  if (!hit) { if (tg.k !== 'f' && GRD) pending.push({ kind: 'sp', t: t + dur, x: tx, y: Math.max(ty, terrainHAt(tx, tz)), z: tz, side, r: 0.15 }); return; }
  if (tg.k === 'ms') pending.push({ kind: 'ms', t: t + dur, id: tg.i, dmg, side, x: tx, y: ty, z: tz });
  else if (tg.k === 'f') pending.push({ kind: 'ak', a: 1, t: t + dur, i: tg.i, dmg: dmg * 0.6, side });
  else if (tg.k === 'g') pending.push({ kind: 'gt', t: t + dur, gi: tg.i, dmg, side, x: tx, y: ty, z: tz });
  else { capBy(s, tg.i); const asp = hitAspect(tg.i, mx, mz, tx, tz, my, ty); pending.push({ gk: 'sec', nd: dmg, t: t + dur, target: tg.i, side, asp, dmg: s.foe ? dmg / CAP_RULE.gunMul : dmg, hm: hitMul(asp, s.q, squadrons[ships.sq[tg.i]]), fx: capRnd() < 0.3, dirIdx: dirIndexOf(tx - mx, tz - mz), x: tx, y: ty, z: tz }); }
}
// ───── 技能 ─────
function capSkill(s, t) {
  const K = s.H.skill, ctl = s.k === CAP.cur;
  if (K.key === 'repair') return;
  if (s.skillCd > 0) { if (ctl) capFeed(`${K.name}冷卻中（${Math.ceil(s.skillCd)} 秒）`, 'hint'); return; }
  s.skillCd = K.cd;
  if (capSkill2(s, K, t, ctl)) return;   // 匿蹤、電子干擾（caphulls.js）
  if (K.key === 'burst') { s.burstT = t + K.dur; s.boostE = 1; if (ctl) capFeed(`${K.name}！${K.dur} 秒內速度、轉向提升`, 'ok'); }
  if (K.key === 'shield') { s.shieldT = t + K.dur; ships.sh[s.i] = ships.shMax[s.i]; ships.shT[s.i] = -99; spawnFx(s.x, s.y, s.z, fxShield(s.side), s.L * 0.8, 22); if (ctl) capFeed(`${K.name}！護盾充滿，${K.dur} 秒內傷害減半`, 'ok'); }
}
// 支援艦的維修光束：按住 Q，修準心方向附近的友艦（沒有就修自己，比較慢）
function capRepair(s, dt, t, on) {
  const Rp = s.H.repair;
  if (!on || s.repE <= 0 || s.repEmpty) { s.repE = Math.min(1, s.repE + dt / Rp.recharge); if (!on && s.repE > 0.2) s.repEmpty = false; s.repOn = false; return; }
  const A = capAim();
  let best = null, bc = Math.cos(0.3);
  for (const o of capTeam(s)) {
    if (o === s || o.dead) continue;
    const dx = o.x - s.x, dy = o.y - s.y, dz = o.z - s.z, d = Math.hypot(dx, dy, dz); if (d > Rp.range) continue;
    const c = (dx * A[0] + dy * A[1] + dz * A[2]) / d; if (c > bc) { bc = c; best = o; }
  }
  capHeal(s, best || s, Rp.hps * (best ? 1 : 0.4) * dt, t);
  s.repE -= dt / Rp.dur; if (s.repE <= 0) { s.repE = 0; s.repEmpty = true; }
  s.repOn = best ? best.k : s.k;
}
function capRepairAI(s, dt, t) {
  const Rp = s.H.repair;
  let best = null, br = 0.7;
  for (const o of capTeam(s)) { if (o.dead) continue; const r = ships.hp[o.i] / maxHp(o.i); if (r < br && Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z) < Rp.range) { br = r; best = o; } }
  if (!best || s.repE <= 0 || s.repEmpty) { s.repE = Math.min(1, s.repE + dt / Rp.recharge); if (s.repE > 0.5) s.repEmpty = false; s.repOn = false; return; }
  capHeal(s, best, Rp.hps * (best === s ? 0.4 : 1) * dt, t);
  s.repE -= dt / Rp.dur; if (s.repE <= 0) { s.repE = 0; s.repEmpty = true; }
  s.repOn = best.k;
}
function capHeal(s, o, amt, t) {
  const i = o.i, a = Math.min(amt, maxHp(i) - ships.hp[i]); if (a > 0) ships.hp[i] += a;
  const b = Math.min(amt * 0.6, ships.shMax[i] - ships.sh[i]); if (b > 0) ships.sh[i] += b;
  if (o !== s && simTick % 4 === 0) spawnBeam(s.x, s.y + s.L * 0.1, s.z, o.x, o.y, o.z, t, 0.08, s.side, 0.7, 1, SIDE_FAC[s.side]);
  if (simTick % 12 === 0) spawnFx(o.x, o.y, o.z, fxShield(s.side), o.L * 0.4, 30);
}
// 支援艦的護航機（攔截機：在支援艦附近巡邏，攔飛彈、打戰機）；火控「不攻擊」＝全部收回
function capEscorts(t) {
  for (const s of CAP.ships) {
    if (!s.ftrMax) continue;
    for (let k = s.ftrIds.length - 1; k >= 0; k--) { const j = s.ftrIds[k]; if (FT.carrier[j] !== s.i || FT.state[j] === 0 || FT.state[j] === 3) { if (FT.state[j] === 3) s.ftrLost++; s.ftrIds.splice(k, 1); } }
    const out = s.ftrIds.length, avail = s.ftrMax - out - s.ftrLost;
    const want = (capIsAI(s) ? !!s.aiEng : CAP.esc && CAP_FC[CAP.fc].key !== 'hold') && !s.dead && ships.alive[s.i];
    if (!want) { for (const j of s.ftrIds) if (FT.state[j] === 2) FT.ret[j] = 1; continue; }
    if (avail > 0 && t > s.escT && launchCraft(s.i, 1, 0, -1, t + 0.2, 0)) { s.ftrIds.push(launchCraft.last); s.escT = t + 0.5; }
  }
}

// ───── 敵方單位開火 ─────
function capUnitsFire(dt, t) {
  for (const g of CAP.G.gts) {
    if (gtDead(g)) continue;
    const own = g.side === CAP.side, Df = own ? CAP_DIFF[1] : CAP.Df;   // 己方的軌道防禦（艦長生涯的迎擊戰）打敵艦
    const T = CAP_UNIT[g.cu]; if (!T.msl && !T.gun) continue;
    const ux = g.x, uy = g.y + g.hh * 2 + 0.3, uz = g.z;
    if (T.gun) {   // 機砲：先打護航機，再打看得到（已被發現）的船
      g.gcd -= dt;
      if (g.gcd <= 0) {
        let tj = -1, td = T.gun.range;
        for (const j of aliveF[own ? 1 - CAP.side : CAP.side]) { const d = Math.hypot(fP[j * 3] - ux, fP[j * 3 + 1] - uy, fP[j * 3 + 2] - uz); if (d < td) { td = d; tj = j; } }
        if (tj >= 0) {
          g.gcd = T.gun.cd * (0.8 + capRnd() * 0.4);
          const hit = capRnd() < T.gun.acc * 0.6, x = fP[tj * 3], y = fP[tj * 3 + 1], z = fP[tj * 3 + 2], dur = td / 520;
          spawnBeam(ux, uy, uz, x + (hit ? 0 : (capRnd() - 0.5) * 5), y, z + (hit ? 0 : (capRnd() - 0.5) * 5), t, dur, g.side, 0.5, Math.min(0.3, 6 / Math.max(1, td)), SIDE_FAC[g.side]);
          if (hit) pending.push({ kind: 'ak', a: 1, t: t + dur, i: tj, dmg: T.gun.dmg, side: g.side });
        } else {
          const s = capPickShip(ux, uy, uz, T.gun.range, t, own);
          if (s) {
            g.gcd = T.gun.cd * (0.8 + capRnd() * 0.4); g.fireT = t;
            const d = Math.hypot(s.x - ux, s.y - uy, s.z - uz), hit = capRnd() < T.gun.acc * (GRD ? groundHitMul(uy, s.y) : 1), dur = d / 520;
            const ex = s.x + (hit ? (capRnd() - 0.5) * s.L * 0.4 : (capRnd() - 0.5) * s.L * 2), ey = s.y + (hit ? 0 : (capRnd() - 0.5) * 3), ez = s.z + (hit ? (capRnd() - 0.5) * s.L * 0.4 : (capRnd() - 0.5) * s.L * 2);
            spawnBeam(ux, uy, uz, ex, ey, ez, t, dur, g.side, 0.55, Math.min(0.3, 8 / Math.max(1, d)), SIDE_FAC[g.side]);
            if (hit) { const asp = hitAspect(s.i, ux, uz, s.x, s.z, uy, s.y); pending.push({ t: t + dur, target: s.i, side: g.side, asp, dmg: T.gun.ship * Df.dmg, hm: hitMul(asp, null, s.q), fx: capRnd() < 0.3, dirIdx: dirIndexOf(s.x - ux, s.z - uz), x: ex, y: ey, z: ez, sx: ux, sy: uy, sz: uz }); }
          } else g.gcd = 0.5;
        }
      }
    }
    if (T.msl) {   // 反艦飛彈：要停著才能發射（飛彈車打完就換位置）
      g.fcd -= dt;
      if (g.fcd > 0 || (g.mv && g.st === 'move' && !T.sea)) continue;
      const s = capPickShip(ux, uy, uz, T.msl.range, t, own);
      if (!s) { g.fcd = 1 + capRnd(); continue; }
      g.fcd = T.msl.cd * (0.85 + capRnd() * 0.3) / Math.sqrt(Df.n); g.fireT = t;
      for (let n = 0; n < T.msl.n; n++) launchMissileAt(ux, uy + 0.2, uz, g.side, null, s.i, T.msl.dmg * Df.dmg, t + n * 0.45, 1);
      if (g.mv && !T.sea) { const a = capRnd() * TAU, r = 45 + capRnd() * 60, x = g.x + Math.sin(a) * r, z = g.z + Math.cos(a) * r; if (capLandOk(x, z)) { g.st = 'move'; g.tx = x; g.tz = z; } }
      if (!own && t - (CAP.mslWarnT || -9) > 4 && s.k === CAP.cur) { CAP.mslWarnT = t; capFeed(`${g.name}發射飛彈！`, 'bad'); }
    }
  }
}
// 敵軍挑船：已被發現、射程內、視線沒被擋住的最近一艘
function capPickShip(x, y, z, R, t, own) {
  let best = null, bd = R;
  for (const s of own ? CAP.foes : CAP.own) {   // own＝己方的單位挑敵艦（正面交戰，不必先發現）
    if (s.dead || s.inb || !ships.alive[s.i] || (!own && t >= s.knownT)) continue;
    const d = Math.hypot(s.x - x, s.y - y, s.z - z); if (d >= bd) continue;
    if (capBlock(x, y, z, s.x, s.y, s.z) >= 0) continue;
    bd = d; best = s;
  }
  return best;
}

// ───── 偵測（每 0.25 秒）：敵軍的感測器 → 偵測條 → 被發現 → 回報＝警報 ─────
function capSensors() {
  const out = [], es = 1 - CAP.side;
  for (const g of CAP.G.gts) { if (g.side !== es || gtDead(g)) continue; const T = CAP_UNIT[g.cu]; if (T.sensor) out.push({ x: g.x, y: g.y + (T.sh || 1), z: g.z, R: T.sensor, radar: !!T.radar, src: { k: 'g', i: g.id } }); }
  for (let i = 0; i < shipCount; i++) { if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].hidden) continue; shipWorldCPU(i, _cp); out.push({ x: _cp.x, y: _cp.y, z: _cp.z, R: 220, radar: true, src: { k: 's', i } }); }
  for (const j of aliveF[es]) if (FT.kind[j] !== 1) out.push({ x: fP[j * 3], y: fP[j * 3 + 1], z: fP[j * 3 + 2], R: 110, radar: false, src: { k: 'f', i: j } });
  return out;
}
function capDetect(dt, t) {
  const sens = capSensors(), mul = CAP.Df.sens * (CAP.alarm ? 1.25 : 1);
  for (const s of CAP.own) {
    if (s.dead) continue;
    capCloakTick(s, t); if (capCloakOn(s, t)) { s.seeing = false; s.seen = 0; continue; }   // 匿蹤中：看不到
    const low = CAP.sp ? !!(s.inRock || inTerrain('nebula', s.x, s.z, s.y)) : s.agl < CAP_RULE.lowAGL, sig = t < s.sigT;   // 太空：在小行星區、星雲裡＝雷達難發現
    let best = 0, by = null;
    for (const S of sens) {
      if (capJammed(S.x, S.y, S.z, t)) continue;   // 電子干擾範圍內的偵測失效
      const R = S.R * mul * (S.radar && low ? CAP_RULE.lowMul : 1) * (sig ? CAP_RULE.sigMul : 1) * (s.H.stealth || 1);
      const d = Math.hypot(S.x - s.x, S.y - s.y, S.z - s.z);
      if (sig && d < CAP_RULE.noise && S.src.k !== 'f') { best = Math.max(best, 6); by = S.src; continue; }   // 開火的聲光：近的敵軍立刻知道
      if (d > R || capBlock(S.x, S.y, S.z, s.x, s.y, s.z) >= 0) continue;
      const k = 1 + 1.5 * (1 - d / R); if (k > best) { best = k; by = S.src; }
    }
    s.seeing = best > 0;
    if (best > 0) { s.seen = Math.min(1.3, s.seen + CAP_RULE.seenRate * best * dt); s.spot = by; } else s.seen = Math.max(0, s.seen - CAP_RULE.seenDecay * dt);
    if (s.seen >= 1) {
      if (t >= s.knownT && s.k === CAP.cur) capFeed(`被發現！（${capSrcName(by)}）`, 'bad');
      s.knownT = t + CAP_RULE.knownT; CAP.last = { x: s.x, y: s.y, z: s.z, t };
      if (!CAP.alarm && !CAP.report && by) capReportStart(by, t);
    }
  }
}
function capSrcName(S) { return !S ? '敵軍' : S.k === 'g' ? CAP.G.gts[S.i].name : S.k === 's' ? capShipName(S.i) : '敵方戰機'; }
function capSrcAlive(S) { return S.k === 'g' ? !gtDead(CAP.G.gts[S.i]) : S.k === 's' ? !!ships.alive[S.i] : FT.state[S.i] === 2; }
function capReportStart(by, t) {
  if (!capCommAlive()) { if (!CAP.commLost) { CAP.commLost = true; capFeed('通訊塔已毀：敵軍無法拉警報', 'ok'); } return; }
  CAP.report = { t: t + CAP_RULE.report, src: by };
  capFeed(`${capSrcName(by)}正在回報！${CAP_RULE.report} 秒內摧毀它就不會拉警報`, 'bad');
}
function capAlarmTick(t) {
  const R = CAP.report;
  if (R && t >= R.t) {
    CAP.report = null;
    if (capSrcAlive(R.src) && capCommAlive()) capAlarm(t);
    else capFeed(capCommAlive() ? '發現你的敵人來不及回報：警報沒有發出' : '通訊塔已毀：警報沒有發出', 'ok');
  }
  if (!CAP.alarm) {   // 平時：機場派兩架戰機在附近巡邏（也會發現你）
    for (const g of CAP.G.gts) if (CAP_UNIT[g.cu].air && !gtDead(g) && t > g.patT && g.carrier >= 0 && ships.alive[g.carrier]) {
      g.patT = t + 70 + capRnd() * 30;
      const a = capRnd() * TAU, area = { x: g.x + Math.sin(a) * 160, y: g.y + 20, z: g.z + Math.cos(a) * 160 };
      for (let k = 0; k < 2; k++) launchCraft(g.carrier, 1, 0, -1, t + k * 0.5, 1, area);
    }
    return;
  }
  // 增援：通訊塔還在才叫得到
  if (CAP.waves > 0 && t >= CAP.nextWave) {
    CAP.nextWave = t + CAP_RULE.waveGap;
    if (capCommAlive()) { CAP.waves--; capWave(t); } else if (!CAP.commLost) { CAP.commLost = true; capFeed('通訊塔已毀：敵軍無法呼叫增援', 'ok'); }
  }
  // 機場緊急起飛
  for (const g of CAP.G.gts) {
    if (!CAP_UNIT[g.cu].air || gtDead(g) || g.ftrLeft <= 0 || t < g.nextT || g.carrier < 0 || !ships.alive[g.carrier]) continue;
    g.nextT = t + CAP_RULE.scramble;
    const P = CAP.last || { x: g.x, y: g.y, z: g.z }, n = Math.min(g.ftrLeft, 2 + Math.floor(CAP.li / 2) + Math.floor(capRnd() * 2)), area = { x: P.x, y: P.y + 4, z: P.z };
    let got = 0; for (let k = 0; k < n; k++) got += launchCraft(g.carrier, 1, 0, -1, t + k * 0.4, k === 0 && CAP.own.some((s) => s.ftrMax) ? 0 : 1, area);
    g.ftrLeft -= got;
    if (got) capFeed(`${g.name}起飛 ${got} 架戰機！`, 'bad');
  }
}
function capAlarm(t) {
  CAP.alarm = true; CAP.alarmT = t; CAP.stats.alarmed = true; CAP.nextWave = t + CAP_RULE.waveFirst;
  for (const g of CAP.G.gts) if (CAP_UNIT[g.cu].air) g.nextT = t + 4;
  toast(`警報！敵軍已發現小隊${CAP.waves ? `：增援 ${CAP.waves} 波將陸續趕到` : ''}（先炸${CAP.sp ? '通訊中繼站' : '通訊塔'}可以切斷增援）`, 'bad');
  capFeed('警報！', 'bad');
}
function capWaveOn(P) {
  P.on = true; P.f.reserve = false; GAME.init[P.f.side] += P.f.initial;
  for (const q of P.f.sqs) { q.bg = false; q.hidden = false; if (q.label) q.label.classList.remove('bg'); }
  P.g.inactive = false;
}
function capWave(t) {
  const P = CAP.pat.find((p) => p.role === 'reinf' && !p.on);
  if (P) capWaveOn(P);
  // 兩輛飛彈車從敵方後方（離最後看到你的地方 500～650）開過來
  const es = 1 - CAP.side, P0 = CAP.last || { x: CAP.cfg.B.x, z: CAP.cfg.B.z };
  for (let k = 0; GRD && k < 2; k++) {   // 地面：飛彈車
    for (let n = 0; n < 30; n++) {
      const a = Math.PI + (capRnd() - 0.5) * 2.2, r = 500 + capRnd() * 150, x = P0.x + Math.sin(a) * r, z = Math.max(-1200, P0.z + Math.cos(a) * r); if (!capLandOk(x, z)) continue;
      const g = capMakeUnit({ type: 'tel', x, z, hd: 0 }, CAP.G.gts.length, CAP.Df.hp); g.side = es; g.reinf = true;
      CAP.G.gts.push(g);
      if (GV.gtMeshes && GV.group) { const m = groundTargetMesh(g); GV.group.add(m); GV.gtMeshes.push(m); }
      break;
    }
  }
  if (CAP.seeG.length < CAP.G.gts.length) { const a = new Uint8Array(CAP.G.gts.length + 64); a.set(CAP.seeG); CAP.seeG = a; }
  toast(`敵方增援抵達戰區！${CAP.waves ? `（還有 ${CAP.waves} 波）` : '（最後一波）'}`, 'bad');
}
// 我方看得到的敵軍（每 0.25 秒）：固定設施開場就知道；其他要在偵測範圍內（地面單位要有視線）
function capSeeEnemies(t) {
  const L = CAP.own.filter((s) => !s.dead), es = 1 - CAP.side;
  for (const g of CAP.G.gts) {
    if (g.side !== es || gtDead(g)) { CAP.seeG[g.id] = 0; continue; }
    const T = CAP_UNIT[g.cu];
    let v = T.intel || CAP.allSee ? 1 : 0;
    if (!v) for (const s of L) { const d = Math.hypot(g.x - s.x, g.y - s.y, g.z - s.z); if (d < (T.seeR || CAP_RULE.see) && capBlock(s.x, s.y, s.z, g.x, g.y + g.hh + 0.3, g.z) < 0) { v = 1; break; } }
    if (!v && t - g.fireT < 6) v = 1;   // 剛開過火：看得到
    CAP.seeG[g.id] = v; if (v) g.seenT = t;
  }
  for (let i = 0; i < shipCount; i++) {
    CAP.seeS[i] = 0;
    if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].hidden) continue;
    if (CAP.allSee) { CAP.seeS[i] = 1; continue; }
    shipWorldCPU(i, _cp);
    for (const s of L) if (Math.hypot(_cp.x - s.x, _cp.y - s.y, _cp.z - s.z) < CAP_RULE.seeShip) { CAP.seeS[i] = 1; break; }
  }
}

// ───── 敵方戰艦（艦隊模擬）：巡邏 → 追擊已被發現的船 → 警報中搜索最後看到的位置 ─────
function capEnemyAI(t) {
  capAllyAI(t);
  for (const P of CAP.pat) {
    if (!P.on) continue;
    if (P.role === 'convoy' || P.role === 'escort') { capConvoyAI(P, t); continue; }   // 太空：運輸船隊（capspace.js）
    const g = P.g, al = P.f.sqs.filter((q) => q.alive > 0); if (!al.length) continue;
    const C = centerOf(al);
    let best = null, bd = P.role === 'flag' ? 520 : 900;
    for (const s of CAP.own) { if (s.dead || t >= s.knownT) continue; const d = Math.hypot(s.x - C.x, s.z - C.z); if (d < bd) { bd = d; best = s; } }
    const A2 = capAllyTarget(C, bd); if (A2) best = A2;   // 我方的運輸艦、友艦比較近
    let dest = null, H = null, y = null;
    if (best) {
      g.target = best.q;
      const R = 110, hx = C.x - best.x, hz = C.z - best.z, hd = Math.hypot(hx, hz) || 1;
      dest = { x: best.x + hx / hd * R, z: best.z + hz / hd * R }; H = Math.atan2(-hx, -hz); y = Math.max(best.y + 10, capGY(dest.x, dest.z) + 12);
      if (best.lead) { dest = { x: best.lead.x, z: best.lead.z }; H = Math.atan2(best.x - dest.x, best.z - dest.z); }   // 移動中的我方運輸艦：搶到它前面攔截
    } else {
      g.target = null;
      if (CAP.alarm && CAP.last && t - CAP.last.t < 90 && P.role !== 'flag') { dest = { x: CAP.last.x, z: CAP.last.z }; y = GRD ? terrainHAt(dest.x, dest.z) + 16 : CAP.last.y; }
      else if (P.wp.length) { const w = P.wp[P.wi % P.wp.length]; if (Math.hypot(w.x - C.x, w.z - C.z) < 40) P.wi++; const w2 = P.wp[P.wi % P.wp.length]; dest = { x: w2.x, z: w2.z }; y = GRD ? terrainHAt(w2.x, w2.z) + 16 : g.ay; }
      else if (P.role === 'flag') { const a = t * 0.02; dest = { x: P.home.x + Math.sin(a) * 90, z: P.home.z + Math.cos(a) * 90 }; y = GRD ? terrainHAt(dest.x, dest.z) + 16 : g.ay; }
    }
    if (!dest) continue;
    if (P.role === 'flag' && Math.hypot(dest.x - P.home.x, dest.z - P.home.z) > 420) { const k = 420 / Math.hypot(dest.x - P.home.x, dest.z - P.home.z); dest.x = P.home.x + (dest.x - P.home.x) * k; dest.z = P.home.z + (dest.z - P.home.z) * k; }
    if (P.dest && Math.hypot(P.dest.x - dest.x, P.dest.z - dest.z) < 30 && (g.plan || Math.hypot(C.x - dest.x, C.z - dest.z) < 30) && t - P.destT < 12) continue;
    P.dest = dest; P.destT = t;
    moveGroup(g, dest.x, dest.z, H != null ? H : Math.atan2(dest.x - C.x, dest.z - C.z), { y });
  }
}

// ───── 小隊的狀態（被擊沉、換船、受擊） ─────
// 輸＝玩家自己的小隊（CAP.home）全滅；切換去指揮的友軍小隊全滅只會切回來
function capShipsCheck(t) {
  for (const s of CAP.ships) {
    if (s.dead || ships.alive[s.i]) continue;
    s.dead = true; s.deadT = t;
    if (s.foe) { capSquadLost(s); continue; }
    CAP.stats.lost++;
    capFeed(`${s.name}被擊沉！`, 'bad'); toast(`${s.name}被擊沉！`, 'bad');
    if (s.k === CAP.cur) capSwitch(1, true);
  }
  if (!GAME.result && !CAP.own.some((s) => !s.dead && (CAP.home < 0 || s.sq === CAP.home))) capFinish(false, CAP.own.some((s) => s.sq !== CAP.home) ? '你的小隊全滅' : '小隊全滅');
}
// 換船：Tab 只在同一個小隊裡換；被擊沉（forced）時同一隊沒有船了，才換到另一個小隊
function capSwitch(dir, forced) {
  const c = capCur(), L = CAP.own, n = L.length, sq = c ? c.sq : CAP.home;
  for (const same of [true, false]) {
    if (!same && !forced) break;
    for (let k = 1; k <= n; k++) {
      const s = L[(CAP.cur + dir * k + n * 4) % n];
      if (s.dead || (s.sq === sq) !== same) continue;
      capTake(s, forced ? (same ? '旗艦沉沒，' : `${capSqName(sq)}全滅，改指揮${capSqName(s.sq)}：`) : '');
      return true;
    }
  }
  return false;
}
function capTake(s, pre) {
  const old = capCur(); if (old && !old.dead) old.thrKeep = CAP.thr;
  CAP.cur = s.k; CAP.yaw = s.yaw; CAP.pitch = s.P; CAP.thr = s.thrKeep != null ? s.thrKeep : 0.5;
  capFeed(`${pre}接手 ${s.name}`, 'ok');
}
function capHurt(ti, e, shD, hullD) {
  const k = capShip(ti); if (k < 0) return;
  const s = CAP.ships[k], t = U.uTime.value;
  if (!e.crash) { s.hitT = t; if (!capCloakOn(s, t)) s.knownT = Math.max(s.knownT, t + 3); }
  if (t < s.shieldT && ships.alive[ti]) { ships.hp[ti] = Math.min(maxHp(ti), ships.hp[ti] + hullD * 0.5); ships.sh[ti] = Math.min(ships.shMax[ti], ships.sh[ti] + shD * 0.5); }
  capJamRefund(s, ti, shD, hullD, t);   // 電子干擾（caphulls.js）
  capReactRefund(s, ti, e, hullD);   // 反應裝甲
  if (e.kill) capByKill(ti);   // 敵艦擊沉你的船：經驗算給它
  if (k === CAP.cur) {
    const now = performance.now(); CAP.flash = { t: now, hull: hullD > 0 };
    if (e.sx != null) { CAP.hits.push({ t: now, x: e.sx, z: e.sz, hull: hullD > 0 }); if (CAP.hits.length > 8) CAP.hits.shift(); }
    else if (e.x != null) { CAP.hits.push({ t: now, x: s.x + (s.x - e.x) * -3, z: s.z + (s.z - e.z) * -3, hull: hullD > 0, near: true }); if (CAP.hits.length > 8) CAP.hits.shift(); }
  }
}
// ───── 戰果 ─────
function capCreditShip(ti, dmg, kill) {
  const S = CAP.stats; if (!S) return;
  S.dmg += dmg;
  if (!kill) return;
  capByKill(ti);   // 船的經驗（caphulls.js）
  S.ks++; S.merit += CAP_MERIT.ship * (ships.type[ti] <= 2 ? 2 : 1); const ck = capShip(ti); S.kills.push(ck >= 0 ? CAP.ships[ck].H.name : SHIP_TYPES[ships.type[ti]].name);
  const nm = capShipName(ti); capFeed(`擊沉${nm}！`, 'kill'); CAP.pop = { t: performance.now(), txt: 'DESTROYED', sub: `擊沉 ${nm.replace(/^敵/, '')}` };
  if (CAP.mis && CAP.mis.ship === ti) capFeed('指揮艦被擊沉！', 'kill');
}
function capCreditG(g, dmg, kill) {
  const S = CAP.stats; if (!S || g.side === CAP.side) return;
  S.dmg += dmg;
  if (!kill) { if (!(CAP.pop && CAP.pop.sub && performance.now() - CAP.pop.t < 900)) CAP.pop = { t: performance.now(), txt: 'HIT', sub: '' }; return; }
  const T = CAP_UNIT[g.cu]; S.kg++; S.merit += T ? T.merit : 20; S.kills.push(g.name);
  CAP.pop = { t: performance.now(), txt: 'DESTROYED', sub: `摧毀 ${g.name}` };
  capFeed(`摧毀${g.mis ? '目標・' : ''}${g.name}`, 'kill');
  if (g.cu === 'comm' && !capCommAlive()) { CAP.commLost = true; capFeed('通訊塔被摧毀：敵軍無法再拉警報、呼叫增援', 'ok'); toast('通訊塔被摧毀：敵軍無法再拉警報、呼叫增援', 'pilot'); }
  if (CAP_UNIT[g.cu].air && g.carrier >= 0 && ships.alive[g.carrier]) { ships.alive[g.carrier] = 0; const q = squadrons[ships.sq[g.carrier]]; q.alive--; q.typeAlive[ships.type[g.carrier]]--; capFeed('機場被摧毀：不會再有戰機起飛', 'ok'); }
  if (CAP.report && CAP.report.src.k === 'g' && CAP.report.src.i === g.id) capFeed('來不及回報！', 'ok');
}
function capCreditMs(M, dmg, kill) {
  const S = CAP.stats; if (!S) return;
  S.dmg += dmg;
  if (!kill) { if (!(CAP.pop && CAP.pop.sub && performance.now() - CAP.pop.t < 900)) CAP.pop = { t: performance.now(), txt: 'HIT', sub: '' }; return; }
  S.kms = (S.kms || 0) + 1; S.merit += 150; S.kills.push(M.name);
  CAP.pop = { t: performance.now(), txt: 'DESTROYED', sub: `${M.name}倒塌` };
  capFeed(`${M.name}倒塌了！`, 'kill'); toast(`${M.name}被摧毀，倒塌了`, 'pilot');
  if (CAP.tgt && CAP.tgt.k === 'ms' && CAP.tgt.i === M.id) CAP.tgt = null;
}
function capCreditF() { const S = CAP.stats; if (!S) return; S.kf++; S.merit += CAP_MERIT.ftr; }

// ───── 任務 ─────
function capMisInit(C) {
  CAP.mai = null;
  const M = CAP.mis = { ...C, prog: 0, done: false, doneT: 0, gts: [], ship: -1 };
  if (M.type === 'sabotage' || M.type === 'strike') { M.gts = CAP.G.gts.filter((g) => g.mis).map((g) => g.id); M.goal = M.gts.length || 1; }
  if (M.type === 'decap') { const P = CAP.pat.find((p) => p.role === 'flag'); const q = P && P.f.sqs[0]; let best = -1; if (q) for (const i of q.list) if (best < 0 || ships.type[i] < ships.type[best]) best = i; M.ship = best; M.goal = 1; }
  if (M.type === 'wipe') { M.goal = capWipeLeft(); M.total = M.goal; }
  if (M.type === 'intercept') M.esc = 0;
  if (M.type === 'run') { M.goal = 1; M.prog = 0; }
  capMis2Init(M);
  capCaptureInit(M);
}
function capWipeLeft() {
  const es = 1 - CAP.side;
  let n = CAP.G.gts.filter((g) => g.side === es && !gtDead(g) && CAP_COMBAT[g.kind]).length;
  for (const P of CAP.pat) if (P.on) for (const q of P.f.sqs) n += q.alive;
  return n;
}
function capMisText() {
  const M = CAP.mis; if (!M) return '';
  return `${CAP_MIS[M.type].name}：${CAP_MIS[M.type].text(M)}`;
}
function capMisTick(t) {
  const M = CAP.mis; if (!M || GAME.result) return;
  if (CAP.warp) {
    const w = capCalmWhy(t);
    if (w) { CAP.warp = null; capFeed(`躍遷充能中斷：${w}`, 'bad'); }
    else if (t - CAP.warp.t0 >= CAP_RULE.warpT) { if (M.done) capFinish(true, '躍遷撤離'); else capRetreat(); return; }
  }
  if (M.type === 'sabotage' || M.type === 'strike') M.prog = M.gts.filter((i) => gtDead(CAP.G.gts[i])).length;
  if (M.type === 'decap') M.prog = M.ship >= 0 && !ships.alive[M.ship] ? 1 : 0;
  if (M.type === 'wipe') {
    M.left = capWipeLeft(); M.pend = CAP.alarm && CAP.waves > 0 && capCommAlive();
    if (M.left === 0 && M.pend) CAP.nextWave = Math.min(CAP.nextWave, t + 5);   // 都打光了：下一波增援提早到
    M.prog = M.left === 0 && !M.pend ? M.goal : 0;
  }
  capSpaceMisTick(M);
  capMis2Tick(M, t); if (GAME.result) return;
  if (capCaptureTick(M, t)) return;
  if (M.type === 'run') {   // 突破封鎖：小隊的船抵達躍遷點就成功
    if (CAP.own.some((s) => !s.dead && Math.hypot(s.x - CAP.ext.x, s.z - CAP.ext.z) < CAP_RULE.extR * 1.4)) { M.prog = 1; capFinish(true, '突破封鎖'); }
    if (t > CAP.tLim) capFinish(false, '超過任務時限');
    return;
  }
  if (!M.done && M.prog >= M.goal) {
    M.done = true; M.doneT = t;
    capFeed(`主要目標完成！回到撤離點（綠色標記），或脫離戰鬥後按 ${keyText('cap_warp')} 躍遷`, 'kill'); toast(`主要目標完成！回到撤離點（綠色標記）撤離，或脫離戰鬥後按 ${keyText('cap_warp')} 躍遷撤離`, 'pilot');
  }
  if (M.done) {
    const c = capCur();
    if (c && !c.dead && Math.hypot(c.x - CAP.ext.x, c.z - CAP.ext.z) < CAP_RULE.extR) capFinish(true, '撤離成功');
  }
  if (t > CAP.tLim) capFinish(false, '超過任務時限');
}
// ───── 躍遷撤離：主要目標完成、脫離戰鬥後按鍵，充能幾秒就算撤離成功（被打到或敵人靠近就中斷）─────
// 回傳還不算脫離戰鬥的原因；空字串＝已脫離
function capCalmWhy(t) {
  const L = CAP.own.filter((s) => !s.dead); if (!L.length) return '小隊全滅';
  const hit = Math.max(...L.map((s) => s.hitT || -99));
  if (t - hit < CAP_RULE.warpCalm) return `剛受到攻擊（${Math.ceil(CAP_RULE.warpCalm - (t - hit))} 秒後）`;
  const es = 1 - CAP.side, R = CAP_RULE.warpClear, near = (x, y, z) => L.some((s) => Math.hypot(x - s.x, y - s.y, z - s.z) < R);
  for (let i = 0; i < shipCount; i++) { if (!ships.alive[i] || ships.side[i] !== es) continue; shipWorldCPU(i, _cp); if (near(_cp.x, _cp.y, _cp.z)) return '附近還有敵方戰艦'; }
  for (const g of CAP.G.gts) if (g.side === es && !gtDead(g) && CAP_COMBAT[g.kind] && near(g.x, g.y, g.z)) return `附近還有${g.name}`;
  return '';
}
function capWarpKey() {
  const M = CAP.mis, t = U.uTime.value;
  if (!M) return;
  if (CAP.warp) { CAP.warp = null; capFeed('取消躍遷', 'hint'); return; }
  const w = capCalmWhy(t); if (w) { capFeed(`還不能躍遷：${w}`, 'bad'); return; }
  CAP.warp = { t0: t }; capFeed(`躍遷${M.done ? '' : '撤退'}充能 ${CAP_RULE.warpT} 秒…被攻擊會中斷`, M.done ? 'ok' : 'bad');
}
function capWarpHud(g, cx, y, grn, amb, t) {
  plFont(g, 12, true); g.textAlign = 'center';
  g.fillStyle = 'rgba(8,12,20,.6)'; g.fillRect(cx - 200, y - 10, 400, CAP.warp ? 28 : 20);   // 底色：天空很亮時也看得清楚
  if (CAP.warp) {
    const u = Math.min(1, (t - CAP.warp.t0) / CAP_RULE.warpT);
    g.fillStyle = grn; g.fillText(`躍遷${CAP.mis && !CAP.mis.done ? '撤退' : ''}充能 ${Math.max(0, CAP_RULE.warpT - (t - CAP.warp.t0)).toFixed(1)} 秒（${keyText('cap_warp')} 取消）`, cx, y);
    capBar(g, cx - 90, y + 10, 180, 5, u, grn);
  } else { const w = capCalmWhy(t); g.fillStyle = w ? amb : grn; g.fillText(w ? `脫離戰鬥後可以按 ${keyText('cap_warp')} 躍遷撤離（${w}）` : `已脫離戰鬥：按 ${keyText('cap_warp')} 躍遷到撤離點`, cx, y); }
  g.textAlign = 'left';
}
// ───── 地面單位用現有的模型（models/機庫 的整備庫道具、models/建築 的通訊塔）；載入前先顯示方塊造型 ─────
// [資料夾, 檔名, 底面寬＝單位半徑的幾倍]
const CAP_UNIT_GLB = {
  hq: ['機庫', '整備庫_01_管制塔.glb', 1.8],
  fuel: ['機庫', '整備庫_21_圓頂儲槽.glb', 1.7],
  power: ['機庫', '整備庫_11_加工站.glb', 1.8],
  ammo: ['機庫', '整備庫_18_物料艙.glb', 1.8],
  comm: ['建築', '人類聯盟風_10通訊塔_設計圖.glb', 2.4],
  site: ['機庫', '整備庫_04_飛彈架.glb', 2],
  tel: ['機庫', '整備庫_23_履帶車.glb', 2.2],
  flak: ['機庫', '整備庫_16_雙管砲塔.glb', 2.2],
};
function capTargetGlb(g, m) {
  const G = g.cu && CAP_UNIT_GLB[g.cu]; if (!G || !GRD) return;
  const key = GV.key, P = GRD.S.pal;
  if (GV.capGlbKey !== key) { GV.capGlbKey = key; GV.capGlbMats = new Map(); }
  const mats = GV.capGlbMats;
  bldModel(G[1], 0, G[0]).then((src) => {
    if (GV.key !== key || !m.parent) return;
    const b = src.box, w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 1e-6), h = (b.max.y - b.min.y) * (G[2] * g.r) / w;
    m.add(bldFit(src, h, (mm) => { const o = bldMat(P, mm, 1.15, mats); if (!GV.mats.includes(o)) GV.mats.push(o); return o; }));
    m.geometry.setDrawRange(0, 0);   // 方塊造型不畫了
  }).catch((e) => console.warn('地面單位模型載入失敗', e.message));
}
// ───── 敵方據點：巨型建築（可以擊毀、會倒塌、擋射線）；都市再用道路模型鋪出 3×3 的街區 ─────
// 用建築編輯器的種類（models/建築/buildings.json）；沒有讀到就不放。回傳作戰用的地圖快照（keep：保留場景原本的巨型結構）
function capMegaPlan(p, scene, li, R, B, spot, used, land, hAt) {
  const T = (typeof BLD !== 'undefined' && BLD.data && BLD.data.types) || {};
  if (!Object.keys(T).length) return null;
  const tower = p.fac === 1 ? 't_emp_tower' : 't_all_tower';   // 敵方的風格
  const pool = ({ city: [tower, 't_comm', 't_dock', 't_cannon', tower, 't_ark'], harbor: ['t_dock', tower, 't_cannon', 't_comm'], base: ['t_cannon', 't_ark', 't_comm', tower],
    elevator: [tower, 't_comm', 't_cannon'], mountain: ['t_cannon', 't_comm', 't_ark'] }[scene] || [tower, 't_comm']).filter((k) => T[k] && T[k].file);
  const n = Math.min(pool.length, 2 + (li >= 2 ? 1 : 0) + (li >= 4 ? 1 : 0));
  const items = [], foot = (k, s) => Math.max(T[k].fw || 12, T[k].fd || 12) * s / 2;
  const flat = (x, z, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => Math.abs(hAt(x + dx, z + dz) - GROUND_Y) < 2.5);
  if (scene === 'city' && T.t_road_st && T.t_road_x && T.t_road_cn) {
    // 道路：格線 ±105、±35（每塊 70），每 14 一節；轉角與路口用專用的模型（角度照範本「聯盟街區」）
    const gx = [-105, -35, 35, 105], cn = { '-105,-105': 270, '-105,105': 0, '105,-105': 180, '105,105': 90 };
    for (const a of gx) for (let b = -105; b <= 105; b += 14) {
      if (gx.includes(b)) { const c = cn[`${a},${b}`]; items.push({ t: c != null ? 't_road_cn' : 't_road_x', x: B.x + a, z: B.z + b, rot: c || 0, s: 1 }); }
      else items.push({ t: 't_road_st', x: B.x + a, z: B.z + b, rot: 0, s: 1 }, { t: 't_road_st', x: B.x + b, z: B.z + a, rot: 90, s: 1 });
    }
    // 巨型建築放在街區中央（正中央留給指揮中心、北邊留給敵方指揮艦）
    const blocks = [[-70, -70], [70, -70], [-70, 0], [70, 0], [-70, 70], [0, 70], [70, 70]].sort(() => R() - 0.5);
    for (let k = 0; k < n; k++) {
      const [dx, dz] = blocks[k], key = pool[k], x = B.x + dx, z = B.z + dz, s = 0.8;
      items.push({ t: key, x, z, rot: Math.floor(R() * 4) * 90, s });
      used.push({ x, z, ex: foot(key, s) + 6 });
    }
  } else {
    for (let k = 0; k < n; k++) {
      const key = pool[k], s = 0.6, r = foot(key, s);
      const pt = spot(() => { const a = R() * TAU, d = 170 + R() * 170; return { x: B.x + Math.sin(a) * d, z: B.z + Math.cos(a) * d }; }, 140, (x, z) => land(x, z) && flat(x, z, r), 1, 'mega');
      if (!pt) continue;
      items.push({ t: key, x: Math.round(pt.x), z: Math.round(pt.z), rot: Math.floor(R() * 8) * 45, s });
      used.push({ x: pt.x, z: pt.z, ex: r + 10 });
    }
  }
  if (!items.length) return null;
  return bldSnapshot({ id: 'cap', name: '', keep: true, items });
}
function capFinish(ok, why, extra) {
  if (GAME.result) return;
  const ret = !!(extra && extra.retreat);
  GAME.result = battleResult(ok ? 'win' : ret ? 'end' : 'lose', why, { capOk: ok, ...(extra || {}) });
  if (!ret && CAP.cfg && CAP.cfg.resumeP) { const p = capLoad(); if (p.resume) { p.resume = null; capSave(p); } }
  if (CAP.cfg && CAP.cfg.duel) CAP.duelRow = capDuelRow();
  if (CAP.cfg && CAP.cfg.opDuel) CAP.duelRow = capOpRow();   // 派出任務的實戰測試（capmisai.js）   // AI 對 AI：結果在報告畫面清掉之前記下來
}

// ───── 鏡頭 ─────
function capAim() { const cp = Math.cos(CAP.pitch); return [Math.sin(CAP.yaw) * cp, Math.sin(CAP.pitch), Math.cos(CAP.yaw) * cp]; }
const CAP_TOP = { tilt: 60, fov: 50, k: 14, min: 0.5, max: 5, maxD: 1500 };   // 俯視：斜俯視 60°、沒有威脅時距離＝船長 ×14（滾輪 0.5～5 倍）
// 俯視的自動取景：射程搆得到我的敵人（含飛彈射程）、鎖定的目標，一定框在畫面裡（滾輪拉近也不會把它們推出畫面）
function capThreats(s) {
  const P = [], es = 1 - CAP.side, sk = CAP.sc ? CAP.sc.rng : 1, t = U.uTime.value;
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].hidden || !CAP.seeS[i]) continue;
    const k = capShip(i), o = k >= 0 ? CAP.ships[k] : null; if (o && o.inb) continue;
    const R = o ? Math.max(o.H.main.range, o.H.tur.range, o.H.msl ? o.H.msl.range : 0) : 260 * sk;
    shipWorldCPU(i, _cp); if (Math.hypot(_cp.x - s.x, _cp.z - s.z) <= R * 1.05 + 10) P.push({ x: _cp.x, y: _cp.y, z: _cp.z });
  }
  for (const g of CAP.G.gts) {
    if (g.side !== es || gtDead(g) || !CAP.seeG[g.id]) continue;
    const T = CAP_UNIT[g.cu], R = Math.max(T.msl ? T.msl.range : 0, T.gun ? T.gun.range : 0); if (!R) continue;
    if (Math.hypot(g.x - s.x, g.z - s.z) <= R * 1.05 + 10) P.push({ x: g.x, y: g.y + g.hh, z: g.z });
  }
  const tp = CAP.tgt ? capTgtPos(CAP.tgt, _cr) : null;
  if (tp && Math.hypot(tp.x - s.x, tp.z - s.z) < s.H.main.range * 1.3) P.push({ x: tp.x, y: tp.y, z: tp.z });
  return P;
}
function capCamTop(s) {
  const el = CAP_TOP.tilt * DEG, base = Math.max(25, s.L * CAP_TOP.k) * CAP.topD, ce = Math.cos(el), se = Math.sin(el);
  camera = camPersp;
  camPersp.aspect = VW / VH; camPersp.fov = CAP_TOP.fov; camPersp.far = 9000; camPersp.updateProjectionMatrix();
  // 取景中心：自己的船＋威脅的範圍中心（船不一定在正中央，但一定在畫面內）；沒有威脅＝船在中央
  const pts = capThreats(s), all = pts.concat([{ x: s.x, y: s.y, z: s.z }]);
  let x0 = s.x, x1 = s.x, z0 = s.z, z1 = s.z; for (const q of pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const place = (D, X, Z) => { camPersp.position.set(X, s.y + D * se, Z + D * ce); camPersp.up.set(0, 1, 0); camPersp.lookAt(X, s.y, Z); camPersp.updateMatrixWorld(); };
  const fits = (D) => { place(D, cx, cz); return all.every((q) => { _tr.set(q.x, q.y, q.z).project(camPersp); return _tr.z < 1 && Math.abs(_tr.x) < 0.84 && _tr.y > -0.7 && _tr.y < 0.68; }); };
  let want = base;
  if (pts.length && !fits(base)) { let lo = base, hi = CAP_TOP.maxD; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; } want = hi; }
  const now = performance.now(), dt = CAP.topT ? Math.min(0.1, (now - CAP.topT) / 1000) : 1; CAP.topT = now;
  const cur = CAP.topA || want; CAP.topA = cur + (want - cur) * (1 - Math.exp(-dt * (want > cur ? 4 : 1.2)));   // 拉遠快、拉近慢
  // 中心相對於船的偏移也平滑（船自己在動，所以記相對位置）
  const O = CAP.topO || (CAP.topO = { x: 0, z: 0 }), ko = 1 - Math.exp(-dt * 2.5); O.x += (cx - s.x - O.x) * ko; O.z += (cz - s.z - O.z) * ko;
  const D = CAP.topA, X = s.x + O.x, Z = s.z + O.z;
  camPersp.near = Math.max(0.5, D * 0.02);
  let px = X, py = s.y + D * se, pz = Z + D * ce;   // 鏡頭在南邊（+z）往北看：畫面右＝+x、下＝+z，和星圖一樣
  const sk = CAP.shakeT ? Math.max(0, 1 - (performance.now() - CAP.shakeT) / 350) : 0;
  if (sk > 0 && capHeavy()) { const m = s.L * 0.08 * CAP_FEEL.shake * sk; px += (Math.random() - 0.5) * m; pz += (Math.random() - 0.5) * m; }
  camPersp.position.set(px, py, pz); camPersp.up.set(0, 1, 0);
  camPersp.lookAt(px, s.y, pz - D * ce);
  camPersp.updateProjectionMatrix();
  CAM_DIR.set(0, Math.sin(el), Math.cos(el));
  renderPass.camera = camera;
  view.target.set(s.x, 0, s.z); view.height = 160;
}
function capCamera() { capFxFrame(); capCamera0(); capFxCam(); }   // 改裝的外觀、展示鏡頭（capfx.js）
function capCamera0() {
  const s = capCur(); if (!s) return;
  if (capTop()) return capCamTop(s);
  const A = capAim(), Wu = v3.norm([-A[0] * A[1], 1 - A[1] * A[1], -A[2] * A[1]]);
  const FE = capHeavy() ? CAP_FEEL : null, zk = CAP.camD * (CAP.far ? 2.2 : 1);   // 滾輪、遠景：距離和高度一起縮放＝船在畫面上的角度不變
  const dist = s.L * (FE ? FE.dist * zk : 2.4 * CAP.camD * (CAP.far ? 2.4 : 1)), up = s.L * (FE ? FE.up * zk : 0.55 * CAP.camD * (CAP.far ? 1.6 : 1));
  camera = camPersp;
  camPersp.aspect = VW / VH; camPersp.near = Math.max(0.05, Math.min(0.45, s.L * 0.25));   // 太小的話遠處地面深度不夠精確，會閃
  camPersp.far = 9000; camPersp.fov = FE ? FE.fov + (s.boosting ? FE.boostFov : 0) : 58 + (s.boosting ? 5 : 0);
  let px = s.x - A[0] * dist + Wu[0] * up, py = s.y - A[1] * dist + Wu[1] * up, pz = s.z - A[2] * dist + Wu[2] * up;
  if (FE) {   // 艦橋上方的第三人稱：位置照上面的算法（up 沿著和瞄準垂直的方向＝不管瞄哪裡，船在畫面上的位置都一樣），只加開火震動
    const sk = CAP.shakeT ? Math.max(0, 1 - (performance.now() - CAP.shakeT) / 350) : 0;
    if (sk > 0) { const m = s.L * 0.04 * FE.shake * sk; px += (Math.random() - 0.5) * m; py += (Math.random() - 0.5) * m; pz += (Math.random() - 0.5) * m; }
  }
  if (GRD) py = Math.max(py, capGroundH(px, pz) + 0.6);
  camPersp.position.set(px, py, pz);
  camPersp.up.set(Wu[0], Wu[1], Wu[2]);
  camPersp.lookAt(px + A[0], py + A[1], pz + A[2]);
  camPersp.updateProjectionMatrix();
  CAM_DIR.set(-A[0], -A[1], -A[2]);
  renderPass.camera = camera;
  view.target.set(s.x, 0, s.z); view.height = 160;
}
function capWheel(d) { if (capTop()) CAP.topD = Math.max(CAP_TOP.min, Math.min(CAP_TOP.max, CAP.topD * Math.exp(d * 0.0012))); else CAP.camD = Math.max(0.6, Math.min(3, CAP.camD * Math.exp(d * 0.001))); }

// ───── 輸入 ─────
function capKey(e) {
  const k = e.code;
  if (/^F\d+$/.test(k)) return false;   // F1～F12 照原本
  e.preventDefault();
  if (e.repeat) return true;
  CAP.keys.add(k);
  const live = capLive(), is = (id) => plCodeIs(id, k);
  if (CAP.mis && CAP.mis.idle && cclKey(e, is)) return true;   // 艦長生涯：停泊中的大廳先處理（caplobby.js）
  if (CAP.mis && CAP.mis.idle) {   // 艦長生涯的星系巡航：M 叫出／收起星圖（capcareer_ui.js）
    if (CC.over) { if (k === 'Escape' || is('cap_map')) ccFly(); return true; }
    if (is('cap_map')) { ccMapOpen(); return true; }
  }
  if (k === 'Escape') { capPause(true); return true; }
  if (k === 'KeyP') { capPause(!paused); return true; }
  if (!live) return true;
  if (is('cap_main')) { CAP.fire[0] = true; CAP.press[0] = true; }
  if (is('cap_msl')) { CAP.fire[1] = true; CAP.press[1] = true; }
  if (is('cap_stop')) { CAP.thr = 0; capFeed('油門歸零', 'hint'); }
  if (is('cap_target')) capPickTarget();
  if (is('cap_fc')) { CAP.fc = (CAP.fc + 1) % CAP_FC.length; capFeed(`火控：${CAP_FC[CAP.fc].name}　${CAP_FC[CAP.fc].desc}`, CAP.fc === 2 ? 'bad' : 'ok'); }
  if (is('cap_skill')) { const s = capCur(); if (s && s.H.skill.key === 'repair') CAP.skillHeld = true; else if (s) capSkill(s, U.uTime.value); }
  if (is('cap_skill2')) { if (CAP.own.some((s) => s.ftrMax && !s.dead)) { CAP.esc = !CAP.esc; capFeed(CAP.esc ? (CAP.fc === 0 ? '護航機：火控「不攻擊」時不會出擊' : '護航機出擊') : '護航機收回', 'ok'); } else capFeed('小隊裡沒有支援艦', 'hint'); }
  if (is('cap_switch')) { if (!capSwitch(e.shiftKey ? -1 : 1, false)) capFeed('這個小隊沒有別的船可以接手', 'hint'); }
  if (is('cap_squad')) capSquadKey();
  for (let n = 0; n < 4; n++) if (is('cap_o' + (n + 1))) capOrder(n);
  if (is('cap_view')) capSetView((CAP.view + 1) % 3);
  if (is('cap_move')) capMoveCmd();
  if (is('cap_warp')) capWarpKey();
  return true;
}
function capSetView(v) {
  const was = capTop(); CAP.view = v; CAP.far = v === 1; SETTINGS.capView = v; saveSettings();
  capFeed(`鏡頭：${['近景', '遠景', '俯視（游標瞄準，停在敵人上＝鎖定；中鍵／' + keyText('cap_move') + '＝移動到游標處）'][v]}`, 'hint');
  if (capTop() && document.pointerLockElement) document.exitPointerLock();
  if (was && !capTop() && !paused) capLock();
  if (!capTop()) { CAP.sel.clear(); CAP.hov = null; }
}
function capOrder(n) {
  const O = CAP_ORDERS[n]; CAP.order = O.key;
  for (const s of CAP.own) if (s.sq === capCur().sq) s.moveP = null;   // 取消點地移動
  if (O.key === 'hold') for (const s of CAP.own) if (s.sq === capCur().sq) s.holdP = { x: s.x, y: s.y, z: s.z };
  if (O.key === 'focus' && !CAP.tgt) capFeed(`僚艦：${O.name}（還沒有目標：按 ${keyText('cap_target')} 鎖定）`, 'hint');
  else capFeed(`僚艦：${O.name}`, 'ok');
}
addEventListener('keyup', (e) => {
  CAP.keys.delete(e.code);
  if (!CAP.on) return;
  if (plCodeIs('cap_main', e.code)) CAP.fire[0] = false;
  if (plCodeIs('cap_msl', e.code)) CAP.fire[1] = false;
  if (plCodeIs('cap_skill', e.code)) CAP.skillHeld = false;
});
addEventListener('blur', () => { CAP.keys.clear(); CAP.fire.fill(false); CAP.skillHeld = false; });
canvas.addEventListener('mousedown', (e) => {
  if (!capLive()) return;
  e.preventDefault();
  if (capTop()) {   // 俯視：滑鼠不鎖定
    CAP.mx = e.clientX; CAP.my = e.clientY;
    if (paused) { capPause(false); return; }
    if (e.button === 1) { capMoveCmd(); return; }
    if (e.button === 0 && capSelClick()) return;
  } else if (document.pointerLockElement !== canvas) { if (paused) capPause(false); else capLock(); return; }
  if (e.button === 0) { CAP.fire[0] = true; CAP.press[0] = true; }
  if (e.button === 2) { CAP.fire[1] = true; CAP.press[1] = true; }
});
addEventListener('mouseup', (e) => { if (!CAP.on) return; if (e.button === 0) CAP.fire[0] = false; if (e.button === 2) CAP.fire[1] = false; });
canvas.addEventListener('contextmenu', (e) => { if (CAP.on) e.preventDefault(); });
addEventListener('mousemove', (e) => {
  if (CAP.on) { CAP.mx = e.clientX; CAP.my = e.clientY; }
  if (!capLive() || document.pointerLockElement !== canvas || paused) return;
  const k = 0.0019;
  CAP.yaw = wrapAngle(CAP.yaw - e.movementX * k); CAP.pitch = Math.max(-1.2, Math.min(1.0, CAP.pitch - e.movementY * k));
});
document.addEventListener('pointerlockchange', () => {
  if (!CAP.on) return;
  CAP.locked = document.pointerLockElement === canvas;
  if (!CAP.locked && !capTop()) { CAP.fire.fill(false); CAP.skillHeld = false; if (capLive() && !paused && !CCL.on) capPause(true); }   // 停泊中放開滑鼠不算暫停
});
function capLock() { if (capTop()) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 不支援 */ } }
function capPause(on) {
  if (on) { paused = true; updateTimeUI(); if (document.pointerLockElement) document.exitPointerLock(); if (CAP.pauseEl) CAP.pauseEl.hidden = false; }
  else { if (CAP.pauseEl) CAP.pauseEl.hidden = true; paused = false; updateTimeUI(); capLock(); }
}
// T：鎖定準心附近（角度最小）的敵人
function capPickTarget() {
  const s = capCur(); if (!s) return;
  if (capTop()) {   // 俯視：離游標（畫面上）最近的敵人
    const m = capMouseVW(), es = 1 - CAP.side; let best = null, bd = 1e9;
    const test = (o, x, y, z) => { const p = capScr(x, y, z); if (!capOnScr(p) || !m) return; const d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < bd) { bd = d; best = o; } };
    for (let i = 0; i < shipCount; i++) { if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].hidden || !CAP.seeS[i]) continue; shipWorldCPU(i, _cp); test({ k: 's', i }, _cp.x, _cp.y, _cp.z); }
    for (const g of CAP.G.gts) if (g.side === es && !gtDead(g) && CAP.seeG[g.id] && !(g.kind === 'bldg' && !g.mis)) test({ k: 'g', i: g.id }, g.x, g.y + g.hh, g.z);
    CAP.tgt = best; for (const o of CAP.own) o.lockT = 0;
    capFeed(best ? `鎖定：${capTgtName(best)}` : '畫面上沒有看得到的敵人', 'hint'); return;
  }
  const A = capAim(), es = 1 - CAP.side, cx = camPersp.position.x, cy = camPersp.position.y, cz = camPersp.position.z;
  let best = null, bc = Math.cos(0.28);
  const test = (k, i, x, y, z, bonus = 0) => { const dx = x - cx, dy = y - cy, dz = z - cz, d = Math.hypot(dx, dy, dz); if (d > 1500) return; const c = (dx * A[0] + dy * A[1] + dz * A[2]) / d + bonus; if (c > bc) { bc = c; best = { k, i }; } };
  for (let i = 0; i < shipCount; i++) { if (!ships.alive[i] || ships.side[i] !== es || squadrons[ships.sq[i]].hidden || !CAP.seeS[i]) continue; shipWorldCPU(i, _cp); test('s', i, _cp.x, _cp.y, _cp.z, 0.01); }
  for (const g of CAP.G.gts) if (g.side === es && !gtDead(g) && CAP.seeG[g.id]) test('g', g.id, g.x, g.y + g.hh, g.z, g.mis ? 0.01 : 0);
  for (const j of aliveF[es]) if (FT.kind[j] !== 1 && Math.hypot(fP[j * 3] - s.x, fP[j * 3 + 2] - s.z) < 300) test('f', j, fP[j * 3], fP[j * 3 + 1], fP[j * 3 + 2]);
  for (const M of CAP.G.ms || []) if (!M.dead) { groundMsPoint(M.id, cx, cy, cz, _cp); test('ms', M.id, _cp.x, _cp.y, _cp.z, -0.02); }   // 巨型結構（優先度低一點）
  CAP.tgt = best;
  for (const o of CAP.own) o.lockT = 0;
  capFeed(best ? `鎖定：${capTgtName(best)}` : '準心附近沒有看得到的敵人', 'hint');
}

// ───── 儀表 ─────
function capHudBuild() {
  if (!CAP.el) {
    CAP.el = document.createElement('canvas'); CAP.el.id = 'caphud'; document.body.appendChild(CAP.el); CAP.ctx = CAP.el.getContext('2d');
    CAP.pauseEl = document.createElement('div'); CAP.pauseEl.id = 'cappause'; document.body.appendChild(CAP.pauseEl);
  }
  CAP.pauseEl.innerHTML = `<div class="g-card"><h3>暫停</h3><table class="pl-keys" style="margin-bottom:10px">${capKeyRows().map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
    <div class="g-row"><button class="g-btn" id="cpp-quit">結束任務</button><button class="g-btn" id="cpp-scale" title="縮短交戰距離的試做：下一場戰鬥生效">比例：${capScaleSet().name}</button><button class="g-btn" id="cpp-view">鏡頭：${['近景', '遠景', '俯視'][CAP.view]}</button><button class="g-btn" id="cpp-heavy" title="鏡頭長焦、貼近船身、跟隨延遲；操船變慢變重（試做）">巨艦手感：${capHeavy() ? '開' : '關'}</button><span class="g-sp"></span><button class="g-btn pri" id="cpp-go">繼續</button></div></div>`;
  CAP.pauseEl.querySelector('#cpp-go').onclick = () => capPause(false);
  CAP.pauseEl.querySelector('#cpp-scale').onclick = (e) => { const v = (CAP_SCALES.indexOf(capScaleSet()) + 1) % CAP_SCALES.length; SETTINGS.capScale = v; saveSettings(); e.currentTarget.textContent = `比例：${CAP_SCALES[v].name}（下一場）`; };
  CAP.pauseEl.querySelector('#cpp-view').onclick = (e) => { capSetView((CAP.view + 1) % 3); e.currentTarget.textContent = `鏡頭：${['近景', '遠景', '俯視'][CAP.view]}`; };
  CAP.pauseEl.querySelector('#cpp-heavy').onclick = (e) => { SETTINGS.capHeavy = !capHeavy(); saveSettings(); e.currentTarget.textContent = `巨艦手感：${capHeavy() ? '開' : '關'}`; };
  CAP.pauseEl.querySelector('#cpp-quit').onclick = () => { CAP.pauseEl.hidden = true; paused = false; updateTimeUI(); quitBattle(); };
  CAP.el.hidden = false; CAP.pauseEl.hidden = true;
}
function capFrame(dt) {
  if (canvas.style.cursor && (!CAP.on || !capTop() || GAME.phase !== 'battle')) canvas.style.cursor = '';
  if (!CAP.on || GAME.phase !== 'battle') return;
  if (GAME.result && document.pointerLockElement) document.exitPointerLock();
  updateCamera();
  capSpaceFrame();
  capHud();
}
const _ch = new THREE.Vector3();
function capHud() {
  const c = CAP.el, g = CAP.ctx, dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const s = capCur(); if (!s) return;
  const fac = SIDE_FAC[CAP.side], col = FACTION[fac].ui, ca = (a) => facRGBA(fac, a), red = '#ff5a4a', grn = '#8fe39a', amb = '#ffd36a', t = U.uTime.value, now = performance.now();
  const sw = (x, y, z) => { _ch.set(x, y, z).project(camera); return _ch.z < 1 && _ch.z > -1 ? [(_ch.x * 0.5 + 0.5) * VW, (-_ch.y * 0.5 + 0.5) * VH] : null; };
  const m = Math.min(W, H), cx = W / 2, cy = H / 2;
  g.lineWidth = 1.5; plFont(g, 12); g.textBaseline = 'middle'; g.textAlign = 'left';
  capMarkers(g, sw, s, red, grn, amb, col, now);
  // 準心（滑鼠方向）與船頭（主砲指向）
  g.save(); g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 3;
  const M = s.H.main, A = capAim(), Pa = CAP.aimPt, mu = capMuzzle(s), G = capGunDir(s);
  const ap = (Pa && sw(Pa.x, Pa.y, Pa.z)) || sw(camPersp.position.x + A[0] * 600, camPersp.position.y + A[1] * 600, camPersp.position.z + A[2] * 600) || [cx, cy];
  const gd = Pa ? Math.min(M.range, Math.hypot(Pa.x - mu[0], Pa.y - mu[1], Pa.z - mu[2])) : M.range, np = sw(mu[0] + G[0] * gd, mu[1] + G[1] * gd, mu[2] + G[2] * gd);
  g.strokeStyle = ca(0.8); g.beginPath(); g.arc(ap[0], ap[1], 14, 0, TAU); g.stroke();
  g.beginPath(); for (const [a, b] of [[-26, -18], [18, 26]]) { g.moveTo(ap[0] + a, ap[1]); g.lineTo(ap[0] + b, ap[1]); g.moveTo(ap[0], ap[1] + a); g.lineTo(ap[0], ap[1] + b); } g.stroke();
  if (Pa) { const dk = Math.hypot(Pa.x - mu[0], Pa.y - mu[1], Pa.z - mu[2]); plFont(g, 10, false, true); g.fillStyle = dk > M.range ? amb : 'rgba(230,236,248,.8)'; g.textAlign = 'center'; g.fillText(Pa.hit ? `${(dk * GROUND_KM).toFixed(1)} km${dk > M.range ? '・射程外' : ''}` : '', ap[0], ap[1] + 34); g.textAlign = 'left'; }
  if (!s.gOk) { plFont(g, 12, true); g.fillStyle = red; g.textAlign = 'center'; g.fillText('射界外', ap[0], ap[1] - 26); g.textAlign = 'left'; }
  if (np) {
    const ready = s.mainCd <= 0, al = s.gAl && s.gOk;
    g.strokeStyle = !s.gOk ? red : ready ? (al ? grn : amb) : 'rgba(255,255,255,.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(np[0] - 9, np[1]); g.lineTo(np[0] - 3, np[1]); g.moveTo(np[0] + 3, np[1]); g.lineTo(np[0] + 9, np[1]); g.moveTo(np[0], np[1] - 9); g.lineTo(np[0], np[1] - 3); g.stroke();
    if (!ready) { g.beginPath(); g.arc(np[0], np[1], 12, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - s.mainCd / M.cd)); g.stroke(); }
    g.lineWidth = 1.5;
  }
  if (CAP.pop && now - CAP.pop.t < 1100) { const a = 1 - (now - CAP.pop.t) / 1100; g.globalAlpha = Math.min(1, a * 2); pilotText(g, ap[0], ap[1] - 44, CAP.pop.txt, CAP.pop.sub ? '#ffb070' : '#fff', CAP.pop.sub ? 20 : 15); if (CAP.pop.sub) pilotText(g, ap[0], ap[1] - 22, CAP.pop.sub, '#ffd2a8', 13); g.globalAlpha = 1; }
  g.restore();
  const bh = gEl('battlehud'), top = bh && !bh.hidden && bh.offsetHeight ? bh.getBoundingClientRect().bottom + 8 : 12;
  capTopHud(g, W, cx, red, grn, amb, t, top);
  capSquadHud(g, H, ca, red, grn, amb, col, t);
  capShipHud(g, W, H, cx, s, ca, red, grn, amb, col, t);
  capRadar(g, W, H, s, ca, red, grn, amb, col, t);
  capFeedHud(g, H);
  // 受擊閃光、飛彈來襲
  if (CAP.flash && now - CAP.flash.t < 300) { const a = 1 - (now - CAP.flash.t) / 300; g.fillStyle = CAP.flash.hull ? `rgba(255,80,40,${0.18 * a})` : `rgba(120,190,255,${0.12 * a})`; g.fillRect(0, 0, W, H); }
  let inc = 0; for (let i = 0; i < MIS_MAX; i++) { if (!misLive[i] || misSide[i] === CAP.side) continue; const u = (t - misT[i * 4]) / misT[i * 4 + 1]; if (u < 0 || u > 1) continue; if (Math.hypot(misC[i * 3] - s.x, misC[i * 3 + 1] - s.y, misC[i * 3 + 2] - s.z) < s.L * 4) inc++; }
  if (inc && (now / 250 | 0) % 2) pilotText(g, cx, cy + m * 0.13, `飛彈來襲 ×${inc}`, red, 16);
  if (!CAP.sp && s.agl < s.L * 0.4) pilotText(g, cx, cy + m * 0.17, '高度過低！', red, 15);
  if (!capSpaceHud(g, s, cx, cy, m, red, amb) && s.outT > 0) pilotText(g, cx, cy - m * 0.2, '離開戰區：請回頭', red, 16);
  if (!capIn() && capLive()) pilotText(g, cx, cy + 70, paused ? '暫停中' : '點一下畫面開始操艦', '#fff', 16);
  if (capTop() && capLive()) capTopMarks(g, sw, s, grn, amb, col, now, W, H);
  if (GAME.result) pilotText(g, cx, cy - 60, GAME.result.capOk ? '任務完成・撤離' : GAME.result.retreat ? '任務中止' : `任務失敗：${GAME.result.why}`, GAME.result.capOk ? grn : red, 22);
}
function capMarkers(g, sw, s, red, grn, amb, col, now) {
  const es = 1 - CAP.side, t = U.uTime.value;
  plFont(g, 11, false, true); g.textAlign = 'left';
  const box = (p, r, c, lw = 1.5) => { g.strokeStyle = c; g.lineWidth = lw; const q = r * 0.4; g.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(p[0] + sx * r, p[1] + sy * (r - q)); g.lineTo(p[0] + sx * r, p[1] + sy * r); g.lineTo(p[0] + sx * (r - q), p[1] + sy * r); } g.stroke(); g.lineWidth = 1.5; };
  const dia = (p, r, c) => { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(p[0], p[1] - r); g.lineTo(p[0] + r, p[1]); g.lineTo(p[0], p[1] + r); g.lineTo(p[0] - r, p[1]); g.closePath(); g.stroke(); g.lineWidth = 1.5; };
  const T = CAP.tgt, M = CAP.mis;
  // 敵軍即將躍遷進來的點：畫面內＝脈動的圈與倒數，畫面外＝邊緣的箭頭
  if (M && M.inb && !M.inb.done) {
    const left = Math.max(0, M.inb.t - t), d = Math.hypot(M.inb.x - s.x, M.inb.y - s.y, M.inb.z - s.z), p = sw(M.inb.x, M.inb.y, M.inb.z), lab = `敵軍躍遷 ${left.toFixed(0)} 秒・${Math.round(d)}`;
    if (!p) { _ch.set(M.inb.x, M.inb.y, M.inb.z); pilotEdgeArrow(g, _ch, red, lab); }
    else { const k = 0.5 + 0.5 * Math.sin(now / 120); g.strokeStyle = red; g.lineWidth = 2; for (const rr of [16, 26 + k * 10]) { g.beginPath(); g.arc(p[0], p[1], rr, 0, 7); g.stroke(); } g.fillStyle = red; g.fillText(lab, p[0] + 30, p[1] - 4); }
  }
  // 地面單位
  for (const G of CAP.G.gts) {
    if (G.side !== es || gtDead(G) || !CAP.seeG[G.id]) continue;
    const isT = M && (M.gts.includes(G.id)), isL = T && T.k === 'g' && T.i === G.id, d = Math.hypot(G.x - s.x, G.y - s.y, G.z - s.z);
    if (!isT && !isL && d > 900) continue;
    const p = sw(G.x, G.y + G.hh, G.z);
    if (!p) { if (isT) { _ch.set(G.x, G.y + G.hh, G.z); pilotEdgeArrow(g, _ch, '#ff9f40', `TGT ${Math.round(d)}`); } continue; }
    const c = isT ? '#ff9f40' : CAP_COMBAT[G.kind] ? 'rgba(255,90,80,.95)' : 'rgba(255,170,110,.85)';
    if (isT) dia(p, 12, c); else box(p, 7, c);
    if (isT || isL || d < 420) { g.fillStyle = c; g.fillText(`${isT ? 'TGT ' : ''}${G.name} ${Math.round(d)}`, p[0] + 12, p[1] - 2); }
    if (CAP.report && CAP.report.src.k === 'g' && CAP.report.src.i === G.id && (now / 200 | 0) % 2) { g.fillStyle = red; g.fillText('回報中！', p[0] + 12, p[1] + 12); }
  }
  // 敵艦
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i] || ships.side[i] !== es || !CAP.seeS[i] || squadrons[ships.sq[i]].hidden) continue;
    shipWorldCPU(i, _cp); const p = sw(_cp.x, _cp.y, _cp.z), d = Math.hypot(_cp.x - s.x, _cp.y - s.y, _cp.z - s.z), isT = M && M.ship === i;
    if (!p) { if (isT) pilotEdgeArrow(g, _cp.clone(), '#ff9f40', `TGT ${Math.round(d)}`); continue; }
    if (isT) dia(p, 14, '#ff9f40'); else box(p, 11, red);
    g.fillStyle = isT ? '#ff9f40' : red; g.fillText(`${isT ? 'TGT 指揮艦・' : ''}${capShipName(i).replace(/^敵/, '')} ${Math.round(d)}`, p[0] + 15, p[1] - 4);
    const r = ships.hp[i] / maxHp(i); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(p[0] - 11, p[1] + 14, 22, 3); g.fillStyle = red; g.fillRect(p[0] - 11, p[1] + 14, 22 * r, 3);
  }
  // 敵機
  for (const j of aliveF[es]) {
    if (FT.kind[j] === 1) continue; const x = fP[j * 3], y = fP[j * 3 + 1], z = fP[j * 3 + 2], d = Math.hypot(x - s.x, y - s.y, z - s.z); if (d > 320) continue;
    const p = sw(x, y, z); if (!p) continue; g.strokeStyle = 'rgba(255,110,90,.9)'; g.beginPath(); g.moveTo(p[0] - 5, p[1] - 4); g.lineTo(p[0] + 5, p[1] - 4); g.lineTo(p[0], p[1] + 4); g.closePath(); g.stroke();
  }
  // 鎖定的目標
  if (T) { const tp = capTgtPos(T, _cr); if (tp) { const p = sw(tp.x, tp.y, tp.z), d = Math.hypot(tp.x - s.x, tp.y - s.y, tp.z - s.z);
    if (p) {
      g.strokeStyle = '#ff5a4a'; g.lineWidth = 2; g.strokeRect(p[0] - 17, p[1] - 17, 34, 34); g.lineWidth = 1.5;
      const L = s.H.msl ? Math.min(1, s.lockT / s.H.msl.lockT) : 0;
      if (s.H.msl) { g.strokeStyle = L >= 1 ? '#ff5a4a' : amb; g.beginPath(); g.arc(p[0], p[1], 24, -Math.PI / 2, -Math.PI / 2 + TAU * L); g.stroke(); if (L >= 1) { plFont(g, 11, true); g.fillStyle = '#ff5a4a'; g.fillText('LOCK', p[0] - 14, p[1] + 34); plFont(g, 11, false, true); } }
      g.fillStyle = '#ff8a7a'; g.fillText(`${capTgtName(T)} ${Math.round(d)}`, p[0] + 22, p[1] - 22);
    } else { _ch.copy(tp); pilotEdgeArrow(g, _ch, '#ff5a4a', `LOCK ${Math.round(d)}`); } } }
  capMis2Marks(g, sw, s, dia);   // 我方艦艇、偵察點（capmissions.js）
  // 撤離點
  const eh = GRD ? terrainHAt(CAP.ext.x, CAP.ext.z) + 3 : 0, ep = sw(CAP.ext.x, eh, CAP.ext.z), ed = Math.hypot(CAP.ext.x - s.x, CAP.ext.z - s.z);
  if (M && (M.done || M.type === 'run' || M.type === 'escort')) { if (ep) { dia(ep, 14, grn); g.fillStyle = grn; g.fillText(`撤離點 ${Math.round(ed)}`, ep[0] + 18, ep[1]); } else { _ch.set(CAP.ext.x, eh, CAP.ext.z); pilotEdgeArrow(g, _ch, grn, `撤離 ${Math.round(ed)}`); } }
  else if (ep && ed < 900) { g.globalAlpha = 0.6; dia(ep, 9, grn); g.fillStyle = grn; g.fillText('撤離點', ep[0] + 14, ep[1]); g.globalAlpha = 1; }
  // 僚艦
  for (const o of CAP.own) {
    if (o === s || o.dead) continue; const p = sw(o.x, o.y + o.L * 0.25, o.z); if (!p) continue;
    g.fillStyle = o.sq === s.sq ? col : '#9fd8ff'; g.textAlign = 'center'; g.fillText(`${o.sq === s.sq ? '' : capSqName(o.sq) + '・'}${o.name.replace(/^.隊・/, '').slice(0, 3)}${o.repOn !== false && o.repOn != null ? '・維修中' : ''}`, p[0], p[1] - 8); g.textAlign = 'left';
    const r = ships.hp[o.i] / maxHp(o.i); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(p[0] - 14, p[1] - 1, 28, 3); g.fillStyle = r < 0.35 ? red : grn; g.fillRect(p[0] - 14, p[1] - 1, 28 * r, 3);
  }
}
// 俯視：選取的船、移動目標、自動航行、游標下的我方船、操作提示
function capTopMarks(g, sw, s, grn, amb, col, now, W, H) {
  if (canvas.style.cursor !== 'crosshair') canvas.style.cursor = 'crosshair';
  g.save(); g.lineWidth = 1.5;
  const ring = (o, c, dash) => { const p = sw(o.x, o.y, o.z); if (!p) return; const q = sw(o.x + o.L * 0.5, o.y, o.z), R = Math.max(14, q ? Math.hypot(q[0] - p[0], q[1] - p[1]) * 1.15 : 0); g.strokeStyle = c; g.setLineDash(dash || []); g.beginPath(); g.arc(p[0], p[1], R, 0, TAU); g.stroke(); g.setLineDash([]); };
  const goal = (o, P, c) => { const a = sw(o.x, o.y, o.z), b = sw(P.x, P.y, P.z); if (!a || !b) return; g.strokeStyle = c; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]); g.beginPath(); g.moveTo(b[0] - 6, b[1] - 6); g.lineTo(b[0] + 6, b[1] + 6); g.moveTo(b[0] + 6, b[1] - 6); g.lineTo(b[0] - 6, b[1] + 6); g.stroke(); };
  for (const o of CAP.own) { if (o.dead) continue; if (CAP.sel.has(o.k)) ring(o, grn); if (o.moveP && o !== s) goal(o, o.moveP, 'rgba(143,227,154,.6)'); }
  if (CAP.nav) goal(s, CAP.nav, amb);
  if (CAP.hov && !CAP.sel.has(CAP.hov.k)) ring(CAP.hov, 'rgba(255,255,255,.7)', [3, 3]);
  plFont(g, 11); g.textAlign = 'center'; g.fillStyle = 'rgba(220,230,245,.7)';
  g.fillText(`俯視・游標瞄準（停在敵人上＝鎖定）・左鍵 主砲・右鍵 飛彈・左鍵點我方的船＝選取${CAP.sel.size ? `（${CAP.sel.size} 艘）` : ''}・中鍵／${keyText('cap_move')} 移動到游標處・${keyText('cap_view')} 換視角`, W / 2, H - 14);
  g.textAlign = 'left'; g.restore();
}
function capTopHud(g, W, cx, red, grn, amb, t, top) {
  const M = CAP.mis, s = capCur();
  // 任務
  plFont(g, 13, true); g.textAlign = 'center'; g.fillStyle = M && M.done ? grn : '#e8eef8';
  const prog = !M ? '' : M.type === 'capture' ? capCaptureProg(M) : M.type === 'escort' || M.type === 'rescue' ? capMis2Prog(M) : M.type === 'wipe' ? `剩 ${M.left != null ? M.left : M.goal} 個${M.pend ? '＋增援' : ''}` : `${M.prog}／${M.goal}`;
  g.fillText(M ? (M.idle ? '巡航' : `${CAP_MIS[M.type].name}　${M.done && M.type !== 'capture' ? '完成！回到撤離點' : prog}`) : '', cx, top + 76);
  plFont(g, 11, false); g.fillStyle = 'rgba(220,230,245,.75)';
  g.fillText(M && !M.done ? CAP_MIS[M.type].text(M) : `剩餘時間 ${_fmtT(Math.max(0, CAP.tLim - t))}`, cx, top + 94);
  if (M && (M.done || CAP.warp) && !GAME.result) capWarpHud(g, cx, top + 114, grn, amb, t);
  if (M && M.inb && !M.inb.done) { capInbHud(g, cx, top, M, t); g.textAlign = 'left'; return; }   // 迎擊戰：敵軍躍遷倒數（艦長生涯交戰畫面同一套紅色）
  // 警戒狀態
  let txt, c, sub = '';
  const seen = Math.max(...CAP.own.filter((o) => !o.dead).map((o) => Math.min(1, o.seen)), 0), known = CAP.own.some((o) => !o.dead && t < o.knownT);
  if (M && M.inb && !M.inb.done) { txt = `敵軍躍遷中 ${Math.max(0, M.inb.t - t).toFixed(1)}`; c = red; sub = '紅色箭頭＝敵軍躍遷進來的方向，先占好位置'; }
  else if (M && M.idle) { txt = '巡航中'; c = grn; sub = `沒有敵人・按 ${keyText('cap_map')} 打開星圖`; }
  else if (M && M.type === 'capture') { txt = '交戰中'; c = '#ff9a5a'; const O = capOddsNow(); sub = O ? `目前評估：勝率 ${Math.round(O.win * 100)}%` : ''; }
  else if (CAP.alarm) { txt = '警報中'; c = red; sub = `${CAP.waves > 0 && capCommAlive() ? `增援還有 ${CAP.waves} 波${CAP.nextWave > t ? `（${Math.ceil(CAP.nextWave - t)} 秒）` : ''}` : '沒有更多增援'}${known ? '・位置暴露' : '・敵軍在搜索'}`; }
  else if (CAP.report) { txt = `回報中 ${Math.max(0, CAP.report.t - t).toFixed(1)}`; c = red; sub = `摧毀 ${capSrcName(CAP.report.src)} 就不會拉警報`; }
  else if (known) { txt = '被發現'; c = '#ff9a5a'; sub = capCommAlive() ? '敵軍正在攻擊' : '通訊塔已毀：無法拉警報'; }
  else if (seen > 0.02) { txt = '偵測中'; c = amb; sub = CAP.sp ? (s && s.inRock ? '已經在小行星區，找大石頭掩護！' : '躲進小行星區、星雲，或大石頭後面') : s && s.agl < CAP_RULE.lowAGL ? '已經貼地，找掩護！' : '貼地飛或躲到山後'; }
  else { txt = '未被發現'; c = grn; sub = capCommAlive() ? '' : '通訊塔已毀'; }
  const bx = cx - 110, by = top;
  g.fillStyle = 'rgba(8,12,20,.55)'; g.fillRect(bx, by, 220, 46); g.strokeStyle = c; g.strokeRect(bx + 0.5, by + 0.5, 219, 45);
  plFont(g, 15, true); g.fillStyle = c; g.fillText(txt, cx, by + 15);
  if (!CAP.alarm && !known) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(bx + 14, by + 28, 192, 5); g.fillStyle = c; g.fillRect(bx + 14, by + 28, 192 * seen, 5); }
  else { plFont(g, 11); g.fillStyle = 'rgba(230,236,248,.85)'; g.fillText(sub, cx, by + 33); }
  if (!CAP.alarm && !known && sub) { plFont(g, 11); g.fillStyle = 'rgba(230,236,248,.75)'; g.fillText(sub, cx, by + 56); }
  g.textAlign = 'left';
}
function capInbHud(g, cx, top, M, t) {
  const left = Math.max(0, M.inb.t - t), w = 400, h = 62, x = cx - w / 2, y = top - 4, blink = left < 3 && (t * 4) % 1 < 0.5;
  g.save();
  g.beginPath(); g.moveTo(x + 14, y); g.lineTo(x + w, y); g.lineTo(x + w - 14, y + h); g.lineTo(x, y + h); g.closePath();
  const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(120,10,28,.85)'); gr.addColorStop(1, 'rgba(40,6,16,.8)'); g.fillStyle = gr; g.fill();
  g.strokeStyle = blink ? '#fff' : 'rgba(255,90,110,.9)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#ff4d5e'; g.fillRect(x + 14, y, 120, 3);
  g.textAlign = 'left'; g.fillStyle = '#ffb0ba'; g.font = '700 11px Rajdhani, Bahnschrift, sans-serif'; g.fillText('INCOMING  WARP', x + 26, y + 18); plFont(g, 10, false); g.fillStyle = 'rgba(255,220,226,.75)'; g.fillText('紅色箭頭＝來的方向', x + 132, y + 18);
  plFont(g, 20, true); g.fillStyle = '#fff'; g.fillText('⚠ 敵軍躍遷中', x + 24, y + 42);
  g.textAlign = 'right'; g.font = '700 40px Rajdhani, Bahnschrift, sans-serif'; g.fillStyle = blink ? '#fff' : '#ff8a96'; g.fillText(left.toFixed(1), x + w - 46, y + 46);
  plFont(g, 12, false); g.fillStyle = 'rgba(255,220,226,.8)'; g.fillText('秒', x + w - 26, y + 46);
  capBar(g, x + 24, y + h - 12, w - 60, 4, left / M.inb.t, '#ff4d5e', 'rgba(255,255,255,.14)');
  g.restore();
}
function capBar(g, x, y, w, h, r, c, bg = 'rgba(255,255,255,.12)') { g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = c; g.fillRect(x, y, w * Math.max(0, Math.min(1, r)), h); }
function capSquadHud(g, H, ca, red, grn, amb, col, t) {
  const c = capCur(), L = CAP.own.filter((o) => o.sq === c.sq), O = CAP.own.filter((o) => o.sq !== c.sq);
  const x = 16, w = 250, rh = 34, n = L.length, y0 = H - 22 - n * rh - 44 - (O.length ? 30 : 0);
  const F = CAP_FC[CAP.fc];
  g.fillStyle = 'rgba(8,12,20,.55)'; g.fillRect(x, y0, w, 38); g.strokeStyle = F.col; g.strokeRect(x + 0.5, y0 + 0.5, w - 1, 37);
  plFont(g, 10, false, true); g.fillStyle = 'rgba(220,230,245,.7)'; g.fillText(`火控 [${keyLabel(keyOf('cap_fc'))}]`, x + 10, y0 + 12);
  plFont(g, 15, true); g.fillStyle = F.col; g.fillText(F.name, x + 10, y0 + 27);
  plFont(g, 10, false, true); g.fillStyle = F.col; g.fillText(F.en, x + 110, y0 + 27);
  plFont(g, 11); g.fillStyle = 'rgba(220,230,245,.85)'; g.textAlign = 'right'; g.fillText(`僚艦：${CAP_ORDERS.find((o) => o.key === CAP.order).name}`, x + w - 8, y0 + 12); g.textAlign = 'left';
  if (O.length) {   // 另一個小隊（AI 指揮中）：一行摘要
    const y = y0 + 44 + n * rh, al = O.filter((o) => !o.dead), hp = al.reduce((a, o) => a + ships.hp[o.i], 0) / Math.max(1, O.reduce((a, o) => a + maxHp(o.i), 0));
    g.fillStyle = 'rgba(8,12,20,.5)'; g.fillRect(x, y, w, 26); plFont(g, 11); g.fillStyle = al.length ? '#9fd8ff' : 'rgba(200,200,200,.4)';
    g.fillText(`${capSqName(O[0].sq)}（AI）　${al.length}／${O.length} 艘`, x + 10, y + 9);
    capBar(g, x + 10, y + 18, 150, 3, hp, '#9fd8ff');
    plFont(g, 10, false, true); g.textAlign = 'right'; g.fillStyle = 'rgba(220,230,245,.7)'; g.fillText(al.length ? `[${keyLabel(keyOf('cap_squad'))}] 切換` : '全滅', x + w - 8, y + 13); g.textAlign = 'left';
  }
  L.forEach((o, k) => {
    const y = y0 + 44 + k * rh, cur = o.k === CAP.cur;
    g.fillStyle = cur ? ca(0.22) : 'rgba(8,12,20,.5)'; g.fillRect(x, y, w, rh - 4);
    if (cur) { g.fillStyle = col; g.fillRect(x, y, 3, rh - 4); }
    plFont(g, 12, cur); g.fillStyle = o.dead ? 'rgba(200,200,200,.4)' : cur ? '#fff' : 'rgba(225,232,245,.9)';
    g.fillText(`${cur ? '▶ ' : ''}${o.name}`, x + 10, y + 9);
    if (o.dead) { g.fillStyle = red; g.textAlign = 'right'; g.fillText('擊沉', x + w - 8, y + 9); g.textAlign = 'left'; return; }
    const hr = ships.hp[o.i] / maxHp(o.i), sr = ships.shMax[o.i] ? ships.sh[o.i] / ships.shMax[o.i] : 0;
    capBar(g, x + 10, y + 18, 150, 4, hr, hr < 0.35 ? red : grn); capBar(g, x + 10, y + 24, 150, 3, sr, '#7cc4ff');
    plFont(g, 10, false, true); g.textAlign = 'right';
    const st = t < o.knownT ? ['暴露', '#ff9a5a'] : o.seeing ? ['被偵測', amb] : o.agl < CAP_RULE.lowAGL ? ['貼地', grn] : ['', ''];
    g.fillStyle = st[1]; g.fillText(st[0], x + w - 8, y + 21); g.textAlign = 'left';
  });
}
function capShipHud(g, W, H, cx, s, ca, red, grn, amb, col, t) {
  const y = H - 92, w = 300, x = cx - w / 2;
  g.fillStyle = 'rgba(8,12,20,.5)'; g.fillRect(x, y, w, 76);
  const hr = ships.hp[s.i] / maxHp(s.i), sr = ships.shMax[s.i] ? ships.sh[s.i] / ships.shMax[s.i] : 0;
  plFont(g, 10, false, true); g.fillStyle = 'rgba(220,230,245,.75)'; g.fillText('HULL', x + 10, y + 12); g.fillText('SHLD', x + 10, y + 26); g.fillText('BOOST', x + 10, y + 40);
  capBar(g, x + 52, y + 9, 150, 6, hr, hr < 0.35 ? red : grn); capBar(g, x + 52, y + 23, 150, 6, sr, '#7cc4ff'); capBar(g, x + 52, y + 37, 150, 6, s.boostE, s.boostLock ? red : s.boosting ? amb : 'rgba(255,211,106,.6)');
  g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x + 52 + 150 * CAP_BOOST_RE, y + 35, 1, 10); if (s.boostLock) { g.fillStyle = red; g.fillText('回充中', x + 240, y + 40); }
  g.fillStyle = '#e8eef8'; g.fillText(`${Math.round(ships.hp[s.i])}`, x + 208, y + 12); g.fillText(`${Math.round(ships.sh[s.i])}`, x + 208, y + 26);
  if (t < s.shieldT) { g.fillStyle = '#7cc4ff'; g.fillText('超載', x + 240, y + 26); }
  if (capCloakOn(s, t)) { g.fillStyle = '#b8a8ff'; g.fillText(`匿蹤 ${Math.ceil(s.cloakT - t)}`, x + 240, y + 12); }
  if (t < (s.jamT || -9)) { g.fillStyle = '#5fd8ff'; g.fillText(`干擾 ${Math.ceil(s.jamT - t)}`, x + 240, y + 26); }
  if (t < s.burstT && !s.boostLock) { g.fillStyle = amb; g.fillText('過載', x + 240, y + 40); }
  // 速度、油門、離地高度
  const fwd = s.vx * s.F[0] + s.vy * s.F[1] + s.vz * s.F[2];
  plFont(g, 12, true, true); g.fillStyle = '#e8eef8';
  g.fillText(`速度 ${Math.round(Math.abs(fwd) * GROUND_KM * 3600)} km/h${fwd < -0.3 ? '（倒退）' : ''}`, x + 10, y + 58);
  const low = s.agl < CAP_RULE.lowAGL;
  g.fillStyle = s.agl < s.L * 0.4 ? red : low ? grn : '#e8eef8'; g.textAlign = 'right';
  g.fillText(CAP.sp ? `${capNearDanger(s)}${s.inRock ? '・小行星區' : ''}` : `離地 ${Math.round(s.agl * GROUND_KM * 1000)} m${low ? '・貼地' : ''}`, x + w - 10, y + 58); g.textAlign = 'left';
  capBar(g, x + 10, y + 66, w - 20, 4, Math.abs(CAP.thr), CAP.thr < 0 ? amb : ca(0.9));
  // 武器（右下）
  const wx = W - 250, wy = H - 120;
  g.fillStyle = 'rgba(8,12,20,.5)'; g.fillRect(wx, wy, 234, 104);
  const row = (k, name, val, ok, sub = '') => { plFont(g, 10, false, true); g.fillStyle = 'rgba(220,230,245,.6)'; g.fillText(k, wx + 10, wy + 14 + row.n * 22); plFont(g, 12, true); g.fillStyle = ok ? '#e8eef8' : 'rgba(220,230,245,.45)'; g.fillText(name, wx + 58, wy + 14 + row.n * 22); g.textAlign = 'right'; plFont(g, 11, false, true); g.fillStyle = ok ? grn : amb; g.fillText(val, wx + 224, wy + 14 + row.n * 22); g.textAlign = 'left'; if (sub) { plFont(g, 10); g.fillStyle = 'rgba(220,230,245,.55)'; g.fillText(sub, wx + 58, wy + 24 + row.n * 22); } row.n++; };
  row.n = 0;
  const M = s.H.main; row('左鍵', M.name, !s.gOk ? '射界外' : s.mainCd > 0 ? `${s.mainCd.toFixed(1)}s` : !s.gAl ? '轉向中' : 'READY', s.mainCd <= 0 && s.gOk && s.gAl);
  const refill = (v) => { const yy = wy + 14 + (row.n - 1) * 22 + 8; capBar(g, wx + 58, yy, 90, 3, v, amb); };   // 彈藥補充進度
  if (s.H.msl) { const tp = s.mT ? capTgtPos(s.mT, _cr) : null; row('右鍵', `飛彈 ${s.mslN}／${s.H.msl.n}`, !tp ? '無目標' : s.lockT >= s.H.msl.lockT ? 'LOCK' : `${Math.round(Math.min(1, s.lockT / s.H.msl.lockT) * 100)}%`, !!tp && s.lockT >= s.H.msl.lockT && s.mslN > 0); if (s.mslN < s.H.msl.n) refill(s.mslAcc); }
  else row('右鍵', '（沒有飛彈）', '', false);
  const K = s.H.skill; row(keyLabel(keyOf('cap_skill')), K.name, K.key === 'repair' ? `${Math.round(s.repE * 100)}%` : s.skillCd > 0 ? `${Math.ceil(s.skillCd)}s` : 'READY', K.key === 'repair' ? s.repE > 0.05 : s.skillCd <= 0);
  if (CAP.own.some((o) => o.ftrMax && !o.dead)) { const sp = CAP.own.find((o) => o.ftrMax && !o.dead), out = sp.ftrIds.length, av = sp.ftrMax - sp.ftrLost; row(keyLabel(keyOf('cap_skill2')), '護航機', `${out}／${av}${CAP.esc ? ' 出擊' : ' 待命'}`, CAP.esc); if (sp.ftrLost > 0) refill(sp.ftrAcc); }
}
function capRadar(g, W, H, s, ca, red, grn, amb, col, t) {
  const R = Math.min(92, (H - 300) / 2.6), cx = W - R - 26, cy = H - 136 - R - 18, range = 700, k = R / range, es = 1 - CAP.side;
  const fw = [Math.sin(s.yaw), Math.cos(s.yaw)];
  const pt = (x, z) => { const dx = x - s.x, dz = z - s.z, ah = dx * fw[0] + dz * fw[1], rt = -dx * fw[1] + dz * fw[0]; const px = cx + rt * k, py = cy - ah * k; return Math.hypot(px - cx, py - cy) <= R ? [px, py] : null; };
  g.fillStyle = 'rgba(8,12,20,.55)'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.strokeStyle = ca(0.5); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke(); g.beginPath(); g.arc(cx, cy, R / 2, 0, TAU); g.stroke();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
  // 已知雷達的偵測範圍（照目前的離地高度）
  const low = s.agl < CAP_RULE.lowAGL, sig = t < s.sigT, mul = CAP.Df.sens * (CAP.alarm ? 1.25 : 1);
  for (const G of CAP.G.gts) {
    if (G.side !== es || gtDead(G) || !CAP.seeG[G.id]) continue;
    const T = CAP_UNIT[G.cu]; if (!T.sensor || !T.intel) continue;
    const dx = G.x - s.x, dz = G.z - s.z, ah = dx * fw[0] + dz * fw[1], rt = -dx * fw[1] + dz * fw[0], rr = T.sensor * mul * (T.radar && low ? CAP_RULE.lowMul : 1) * (sig ? CAP_RULE.sigMul : 1) * k;
    g.fillStyle = 'rgba(255,90,70,.07)'; g.strokeStyle = 'rgba(255,90,70,.3)'; g.beginPath(); g.arc(cx + rt * k, cy - ah * k, rr, 0, TAU); g.fill(); g.stroke();
  }
  capSpaceRadar(g, s, cx, cy, k, fw);   // 太空：粒子帶邊界、黑洞
  g.restore();
  for (const G of CAP.G.gts) {
    if (G.side !== es || gtDead(G) || !CAP.seeG[G.id]) continue;
    const p = pt(G.x, G.z); if (!p) continue;
    const isT = CAP.mis && CAP.mis.gts.includes(G.id);
    g.fillStyle = isT ? '#ff9f40' : CAP_COMBAT[G.kind] ? red : 'rgba(255,170,110,.9)';
    if (isT) { g.save(); g.translate(p[0], p[1]); g.rotate(Math.PI / 4); g.fillRect(-3.5, -3.5, 7, 7); g.restore(); } else g.fillRect(p[0] - 2, p[1] - 2, 4, 4);
  }
  for (let i = 0; i < shipCount; i++) { if (!ships.alive[i] || ships.side[i] !== es || !CAP.seeS[i]) continue; shipWorldCPU(i, _cp); const p = pt(_cp.x, _cp.z); if (!p) continue; g.fillStyle = CAP.mis && CAP.mis.ship === i ? '#ff9f40' : red; g.beginPath(); g.moveTo(p[0], p[1] - 5); g.lineTo(p[0] + 4, p[1] + 4); g.lineTo(p[0] - 4, p[1] + 4); g.closePath(); g.fill(); }
  for (const j of aliveF[es]) { if (FT.kind[j] === 1) continue; const p = pt(fP[j * 3], fP[j * 3 + 2]); if (!p || Math.hypot(fP[j * 3] - s.x, fP[j * 3 + 2] - s.z) > 320) continue; g.fillStyle = 'rgba(255,120,100,.9)'; g.fillRect(p[0] - 1, p[1] - 1, 2, 2); }
  const ep = pt(CAP.ext.x, CAP.ext.z); if (ep) { g.strokeStyle = grn; g.beginPath(); g.arc(ep[0], ep[1], CAP_RULE.extR * k, 0, TAU); g.stroke(); }
  else { const a = Math.atan2(-(CAP.ext.x - s.x) * fw[1] + (CAP.ext.z - s.z) * fw[0], (CAP.ext.x - s.x) * fw[0] + (CAP.ext.z - s.z) * fw[1]); g.fillStyle = grn; g.beginPath(); g.arc(cx + Math.sin(a) * (R - 5), cy - Math.cos(a) * (R - 5), 3, 0, TAU); g.fill(); }
  capMis2Radar(g, pt, k);
  if (CAP.last && CAP.alarm) { const p = pt(CAP.last.x, CAP.last.z); if (p) { g.strokeStyle = 'rgba(255,90,70,.6)'; g.beginPath(); g.moveTo(p[0] - 4, p[1] - 4); g.lineTo(p[0] + 4, p[1] + 4); g.moveTo(p[0] + 4, p[1] - 4); g.lineTo(p[0] - 4, p[1] + 4); g.stroke(); } }
  for (const o of CAP.own) { if (o.dead) continue; const p = pt(o.x, o.z); if (!p) continue; g.fillStyle = o === s ? '#fff' : col; g.beginPath(); g.arc(p[0], p[1], o === s ? 3.5 : 2.5, 0, TAU); g.fill(); }
  // 受擊方向
  const now = performance.now();
  for (const h of CAP.hits) { const a = 1 - (now - h.t) / 1500; if (a <= 0) continue; const ang = Math.atan2(-(h.x - s.x) * fw[1] + (h.z - s.z) * fw[0], (h.x - s.x) * fw[0] + (h.z - s.z) * fw[1]); g.strokeStyle = h.hull ? `rgba(255,90,60,${a})` : `rgba(120,190,255,${a})`; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R + 4, -Math.PI / 2 + ang - 0.25, -Math.PI / 2 + ang + 0.25); g.stroke(); g.lineWidth = 1.5; }
  plFont(g, 10, false, true); g.fillStyle = 'rgba(220,230,245,.6)'; g.textAlign = 'center'; g.fillText(`${Math.round(range * GROUND_KM)} km`, cx, cy + R + 12); g.textAlign = 'left';
}
function capFeedHud(g, H) {
  const now = performance.now(), x = 18, y0 = H * 0.36;
  plFont(g, 13);
  CAP.feed.forEach((f, k) => {
    const age = (now - f.t) / 1000; if (age > 7) return;
    g.globalAlpha = Math.min(1, (7 - age) / 1.5);
    g.fillStyle = f.cls === 'bad' ? '#ff8a7a' : f.cls === 'kill' ? '#ffcf8a' : f.cls === 'ok' ? '#8fe39a' : 'rgba(225,232,245,.85)';
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeText(f.msg, x, y0 + k * 20); g.fillText(f.msg, x, y0 + k * 20); g.lineWidth = 1.5;
  });
  g.globalAlpha = 1;
}

// ───── 地面單位的外觀（ground_pilot.js 的 groundTargetMesh 呼叫；有處理就回傳 true） ─────
function capTargetGeo(G, g, box, ac) {
  if (g.sub === 'tel') {   // 氣墊飛彈車：車身＋傾斜的發射筒
    box(0, 0, 0.26, 0.7, 0.09, 0, [0.17, 0.19, 0.14]); box(0, 0.27, 0.22, 0.14, 0.1, 0.09, [0.2, 0.22, 0.16]);
    box(-0.05, -0.08, 0.08, 0.46, 0.08, 0.1, [0.32, 0.33, 0.3]); box(0.05, -0.08, 0.08, 0.46, 0.08, 0.1, [0.32, 0.33, 0.3]);
    box(0, -0.3, 0.27, 0.04, 0.012, 0.09, ac);
    return true;
  }
  if (g.sub === 'site') {   // 飛彈陣地：水泥平台＋四座發射架＋雷達
    box(0, 0, 2.2, 2.2, 0.06, 0, [0.3, 0.3, 0.29]);
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) { box(x, z, 0.32, 0.6, 0.12, 0.06, [0.22, 0.24, 0.2]); box(x, z - 0.05, 0.22, 0.48, 0.12, 0.18, [0.34, 0.35, 0.32]); }
    gbDome(G, 0, 0.06, 0, 0.28, [0.6, 0.6, 0.58], 12, 4);
    box(0, 0, 2.26, 0.05, 0.02, 0.06, ac);
    return true;
  }
  if (g.sub === 'flak') {   // 防空砲：底座＋砲塔＋雙管
    box(0, 0, 0.5, 0.5, 0.1, 0, [0.22, 0.23, 0.2]); gbCyl(G, 0, 0.1, 0, 0.17, 0.12, [0.3, 0.31, 0.28], 10);
    box(-0.05, 0.2, 0.03, 0.4, 0.03, 0.18, [0.18, 0.18, 0.18]); box(0.05, 0.2, 0.03, 0.4, 0.03, 0.18, [0.18, 0.18, 0.18]);
    box(0, -0.2, 0.52, 0.03, 0.012, 0.1, ac);
    return true;
  }
  if (g.sub === 'airbase') {   // 機場：跑道、三座機庫、塔台
    box(0, 0, 1.2, 9, 0.03, 0, [0.12, 0.12, 0.13]);
    for (let z = -4; z <= 4; z += 1) box(0, z, 0.06, 0.4, 0.01, 0.03, [0.7, 0.7, 0.65]);
    for (const z of [-2.2, 0, 2.2]) box(2.1, z, 1.5, 1.4, 0.55, 0, [0.32, 0.33, 0.35], 5);
    gbCyl(G, -1.6, 0, 1, 0.22, 1.2, [0.4, 0.4, 0.42], 10); box(-1.6, 1, 0.6, 0.6, 0.2, 1.2, [0.35, 0.45, 0.5], 9);
    box(2.1, 0, 1.56, 5.8, 0.03, 0.56, ac);
    return true;
  }
  return false;
}

// ───── 任務報告 ─────
function capReport() {
  if (!GAME.result || !SIM.m || !SIM.m.captain) return;   // 已經開始下一場（AI 對 AI 連續測試）
  if (SIM.m.captain.cc) { ccBattleDone(); return; }   // 艦長生涯（capcareer_ui.js）
  const R = GAME.result, S = CAP.stats || { ks: 0, kg: 0, kf: 0, dmg: 0, lost: 0, shots: 0, msl: 0, merit: 0, alarmed: false, kills: [] }, m = SIM.m, M = CAP.mis, C = m.captain;
  const snap = grCapSnap();   // 各艦的狀態：報告畫面一開就會清掉
  setPhase('report');
  const ok = !!R.capOk, li = C.li, open = M && M.type === 'capture', ghost = ok && !S.alarmed && !open, noLoss = ok && S.lost === 0;
  const base = ok ? CAP_MERIT.mission[li] : 0, bonus = (ghost ? CAP_MERIT.ghost : 0) + (noLoss ? CAP_MERIT.noLoss : 0);
  const gain = Math.round(S.merit + base + bonus);
  const grade = !ok ? '失敗' : ghost && noLoss ? 'S' : ghost || noLoss ? 'A' : 'B';
  const p = capLoad();
  if (!CAP.saved && !C.auto) { CAP.saved = true; p.merit += gain; p.sorties++; if (ok) p.wins++; if (ghost) p.ghost++; p.kills += S.ks + S.kg; p.lost += S.lost; capSave(p); grAfterCaptain(ok, M ? CAP_MIS[M.type].name : '', C.scene && GROUND_SCENES[C.scene] ? GROUND_SCENES[C.scene].name : '', S.alarmed, snap); }   // 船員與戰痕（growth.js）
  const ret = !ok && R.retreat && R.why === '躍遷撤退', pr = ret ? capLoad().resume : null;
  const why = ok ? '' : ret ? (pr ? `戰況已保留：任務時限剩 ${_fmtT(Math.max(0, CAP_RULE.time - pr.tUsed))}，修好船之後可以接續（隨機任務的選單）` : '') : R.retreat ? '中途結束任務' : R.why;
  const kills = {}; for (const k of S.kills) kills[k] = (kills[k] || 0) + 1;
  overlay(`<div class="g-wrap" style="max-width:820px">
    <div class="g-head"><h2>任務報告</h2><span class="crumb">${escH(m.name)}　·　${C.hulls.length} 艘　·　時間 ${_fmtT(R.t)}</span></div>
    <div class="g-card" style="margin-bottom:12px;text-align:center"><p class="result ${ok ? 'win' : ret ? '' : 'lose'}">${ok ? `任務成功・評等 ${grade}` : ret ? '躍遷撤退' : '任務失敗'}</p>
      <div>${M ? escH(`${CAP_MIS[M.type].name}：${CAP_MIS[M.type].text(M)}`) : ''}</div>${why ? `<div class="g-dim">${escH(why)}</div>` : ''}
      <div class="g-dim" style="margin-top:6px">${open ? (M.odds ? `戰前評估：勝率 ${Math.round(M.odds.win * 100)}%` : '正面交戰') : S.alarmed ? '敵軍拉響了警報' : '全程沒有拉警報'}・損失 ${S.lost} 艘</div></div>
    <div class="intel-grid">
      <div class="g-card"><h3>戰果</h3><dl class="kv"><dt>擊沉戰艦</dt><dd>${S.ks} 艘</dd><dt>摧毀地面單位</dt><dd>${S.kg} 個</dd><dt>擊墜戰機</dt><dd>${S.kf} 架</dd><dt>造成傷害</dt><dd>${fmtN(Math.round(S.dmg))}</dd>
        <dt>主砲</dt><dd>${fmtN(S.shots)} 發・飛彈 ${S.msl} 枚</dd>${Object.keys(kills).length ? `<dt>明細</dt><dd>${Object.entries(kills).map(([k, n]) => `${escH(k)} ×${n}`).join('、')}</dd>` : ''}</dl></div>
      <div class="g-card"><h3>戰功</h3><dl class="kv"><dt>這次</dt><dd><b>+${fmtN(gain)}</b></dd>
        <dd class="g-dim" style="grid-column:1/-1">戰鬥 ${fmtN(Math.round(S.merit))}＋任務 ${base}${ghost ? `＋無聲完成 ${CAP_MERIT.ghost}` : ''}${noLoss ? `＋零損失 ${CAP_MERIT.noLoss}` : ''}</dd>
        <dt>累積</dt><dd>${fmtN(p.merit)}</dd><dt>任務成功</dt><dd>${p.wins}／${p.sorties}</dd></dl>
        <div class="g-dim" style="font-size:calc(12px * var(--ui));margin-top:8px">損失的船任務後會修好。艦長模式沒有回放，也不算進指揮官的戰績。</div></div>
    </div>
    <div class="g-row" style="margin-top:14px"><button class="g-btn" id="cr-menu">單人戰鬥</button><span class="g-sp"></span><button class="g-btn" id="cr-sq">小隊編成</button>${pr ? '<button class="g-btn" id="cr-again">放棄、出擊新任務</button><button class="g-btn pri" id="cr-resume">修好船、接續戰鬥 →</button>' : '<button class="g-btn pri" id="cr-again">再出擊（新任務）→</button>'}</div></div>`);
  gEl('cr-menu').onclick = () => { GAME.spMode = 'captain'; showSingle(); };
  gEl('cr-sq').onclick = () => showCaptain();
  gEl('cr-again').onclick = () => capGo();
  if (pr) gEl('cr-resume').onclick = () => capGo(true);
}
window.__cap = { bounds: () => Object.fromEntries(Object.entries(R3.models).filter(([k]) => /^[ea][0-5]$/.test(k)).map(([k, M]) => { const g = M.lods[0]; g.computeBoundingBox(); const b = g.boundingBox; return [k, [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => +v.toFixed(2))]; })), frame: () => frame(), capHud, grd: () => GRD, gv: () => GV, dbg: () => ({ gunStats, dmgDealt, wStats, ftrStats }), pending: () => pending, capPickTarget, capMain, CAP, capLoad, capSave, capLayout, capGo, capDetect, capSwitch, capOrder, capFinish, CAP_RULE, CAP_UNIT, CAP_HULLS };
