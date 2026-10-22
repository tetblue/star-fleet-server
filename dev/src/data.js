// ═══════════════════════ 遊戲資料：艦種、指揮官、技能、作戰 ═══════════════════════
// 一個圖示＝opts.rep 艘（預設 5）。下面的耐久、傷害都是「每個圖示」的數值。

// 艦種：index 與貼圖／3D 模型一致（0 航母、1 戰列、2 巡洋、3 驅逐、4 護衛、5 補給）
//   5 補給艦只編在「補給艦隊」裡；look＝沒有自己的模型／貼圖時借用哪個艦種的外觀
//   aa：艦種的防空係數（防空砲、副砲打飛彈與艦載機的命中率 × aa / AA_TYPE_REF）
// 自動武器（不用按鍵，敵人進入射程就自己用，各艦各自冷卻）：
//   missile：飛彈（巡洋、驅逐）。dmg 每發傷害、cd 冷卻秒數、range 射程、n 攜彈量（打完要回補給艦隊補充）。
//            射程比副砲遠、比主砲短，不衰減，但會被防空攔截
//   fighters：攻擊型艦載機（航母專屬）。n 機庫容量、wave 每次放出幾架、cd 出擊間隔（續航見 CRAFT）、
//             build 機庫補一架新機的秒數（被打下的會慢慢補回來，機庫＋在外的不超過 n）
//   supply：補給艦專屬。stock 每艘（圖示）帶的飛彈存量（被擊沉就跟著沒了）
//   repair：維修機（依船的大小）。n 架數、amount 每趟修理量、cd 出動間隔
// 光束武器分三類（每艘船各類一組，各自冷卻、各自選目標）：
//   main 主砲：只能打船頭前方（arc＝左右各幾度），射程最遠、單發最重、轉得慢（打小船命中率更差）
//   sec  副砲：射角大（前方＋兩側），射程中等；打中距離的戰艦，全威力距離內有飛彈／艦載機會先打它們
//   aa   防空砲：全方向，射程短；優先鎖定飛彈、其次艦載機，射程內都沒有才打船
//   dmg 單發傷害、cd 開火間隔（秒）、near 全威力距離、far 最大射程、arc 半射角（度，180＝全方向）、acc 基本命中率
// sh：護盾容量（能量護盾，無方向）。光束、艦載機要先打光護盾才傷到船體；護盾在 SHIELD_RULE.delay 秒沒被打後開始回充
const SHIP_TYPES = [
  { key: 'carrier', name: '航母', cost: 5, hp: 140, sh: 70, speed: 0.85, aa: 0.2,
    guns: { main: null,
      sec: { dmg: 4, cd: 3, near: 160, far: 400, arc: 90, acc: 0.8 },
      aa: { dmg: 1.6, cd: 0.9, near: 100, far: 200, arc: 180, acc: 0.7 } },
    missile: null,
    fighters: { n: 6, wave: 3, cd: 20, range: 1000, build: 14 }, repair: { n: 4, amount: 24, cd: 18 },
    note: '自身火力弱，靠艦載機（自動出擊、返航補給）。也帶最多維修機。' },
  { key: 'battleship', name: '戰列艦', cost: 4, hp: 220, sh: 130, speed: 0.8, aa: 0.15,
    guns: { main: { dmg: 27, cd: 7.5, near: 350, far: 900, arc: 20, acc: 0.85 },
      sec: { dmg: 8, cd: 2.5, near: 220, far: 520, arc: 90, acc: 0.8 },
      aa: { dmg: 1.5, cd: 1, near: 90, far: 180, arc: 180, acc: 0.7 } },
    missile: null, fighters: null, repair: { n: 3, amount: 24, cd: 18 },
    note: '主砲射程最遠、單發最重，護盾最厚；最慢。主砲只能打正前方。' },
  { key: 'cruiser', name: '巡洋艦', cost: 2.5, hp: 120, sh: 75, speed: 1.0, aa: 0.25,
    guns: { main: { dmg: 15, cd: 7, near: 280, far: 700, arc: 20, acc: 0.85 },
      sec: { dmg: 7, cd: 2.5, near: 200, far: 480, arc: 90, acc: 0.8 },
      aa: { dmg: 1.2, cd: 1, near: 90, far: 170, arc: 180, acc: 0.7 } },
    missile: { dmg: 40, cd: 60, range: 600, n: 3 }, fighters: null, repair: { n: 2, amount: 24, cd: 18 },
    note: '均衡；遠距離自動發射飛彈（攜彈 3 發）。' },
  { key: 'destroyer', name: '驅逐艦', cost: 1.5, hp: 70, sh: 35, speed: 1.25, aa: 0.2,
    guns: { main: { dmg: 10, cd: 6, near: 220, far: 520, arc: 20, acc: 0.85 },
      sec: { dmg: 5, cd: 2, near: 160, far: 400, arc: 90, acc: 0.8 },
      aa: { dmg: 1, cd: 1, near: 80, far: 160, arc: 180, acc: 0.7 } },
    missile: { dmg: 40, cd: 45, range: 490, n: 4 }, fighters: null, repair: { n: 1, amount: 24, cd: 18 },
    note: '快、飛彈發射最頻繁（攜彈 4 發）；適合包抄與追擊。' },
  { key: 'escort', name: '護衛艦', cost: 1, hp: 50, sh: 25, speed: 1.3, aa: 0.45,
    guns: { main: null,
      sec: { dmg: 5, cd: 2, near: 160, far: 420, arc: 100, acc: 0.8 },
      aa: { dmg: 1.8, cd: 0.8, near: 100, far: 200, arc: 180, acc: 0.75 } },
    missile: null, fighters: null, repair: null,
    note: '便宜、小而快（難被打中）；防空最好。太小，沒有維修機與主砲。' },
  { key: 'supply', name: '補給艦', cost: 3, hp: 180, sh: 60, speed: 0.8, aa: 0.3, look: 2,
    guns: { main: null, sec: null,
      aa: { dmg: 1.4, cd: 0.9, near: 100, far: 200, arc: 180, acc: 0.7 } },
    missile: null, fighters: null, repair: { n: 2, amount: 24, cd: 18 }, supply: { stock: 40 },
    note: '只有防空砲。範圍內的友艦會自動補充飛彈；被擊沉時它帶的存量跟著損失。只能編在補給艦隊。' },
];
const N_COMBAT = 5, SUPPLY_T = 5;   // 一般艦隊能編的艦種（0～4）、補給艦的 index
// 補給：補給艦 range 內、飛彈沒滿的友艦每 cd 秒補 1 發（從最近的補給艦扣存量）；follow＝跟隨時待在被跟隨艦隊後方多遠
const SUPPLY_RULE = { range: 250, cd: 6, follow: 230 };
// AI 難度 minLv 以上的敵軍帶一支補給艦隊：護衛艦 escort、補給艦 supply（佔兵力點數的比例），跟在後方 SUPPLY_RULE.follow
const AI_SUPPLY = { minLv: 3, escort: 0.04, supply: 0.06 };
// 依兵力點數產生 AI 補給艦隊的編成 [航母, 戰列, 巡洋, 驅逐, 護衛, 補給]
function aiSupplyComp(total) { return SHIP_TYPES.map((_, t) => (t === 4 ? Math.max(10, Math.round(total * AI_SUPPLY.escort / 10) * 10) : t === SUPPLY_T ? Math.max(10, Math.round(total * AI_SUPPLY.supply / SHIP_TYPES[SUPPLY_T].cost / 10) * 10) : 0)); }
// 潰走：一方剩下的船（艘數）低於開戰時的這個比例就判定潰走（戰敗）
const ROUT_AT = 0.1;
// 戰地維修：船體低於 below 就開始一次維修（交戰中也會修），在 dur 秒內逐步補上（開始後不會被打斷）
//   補給艦 SUPPLY_RULE.range 內：第 1 次回復最大耐久的 first，之後每次減半；每艘船基本可修 n 次
//   不在補給艦範圍內：只有還沒修過的船能修這 1 次，回復 alone（算掉一次次數）
//   天賦「損害管制」每階：次數 +1、單次上限 +step（first 與 alone 都加）
const FIELD_REPAIR = { below: 0.6, dur: 10, first: 0.4, alone: 0.3, n: 1, step: 0.05 };
// 前排輪替：分艦隊裡受損的船，跟後方（至少深 gap）同艦種、狀態好的船（護盾 ≥ fresh.sh、船體 ≥ fresh.hp）交換位置
//   換位 dur 秒，期間兩艘都停火；換完 cd 秒內不再換；每 0.5 秒檢查一次，每次每支分艦隊最多換 max＋存活數 × per 對
//   什麼時候換（看指揮官特性）：一般＝護盾打光；防禦型＝護盾剩 shEarly 以下就換，護盾回充 +shRegen；
//   攻擊型＝船體剩 hull 以下才換（前排撐得久、火力不斷）；機動型＝換位時間 −fast
//   天賦「輪替演練」每階換位時間 −tal
const ROTATE_RULE = { dur: 6, cd: 15, gap: 10, fresh: { sh: 0.8, hp: 0.6 }, max: 2, per: 0.02, shEarly: 0.25, shRegen: 0.3, hull: 0.35, fast: 0.4, tal: 0.15 };
const AA_TYPE_REF = 0.275;   // 艦種防空係數的基準（一般編成的平均值 ≈ 0.275，平均起來命中率不變）
// 擬真難度的戰爭迷霧：各艦種的偵測半徑（3D 距離；分艦隊取編成裡最大的那一種）。護衛艦是偵察艦；戰列艦主砲 900 比自己看得到的遠，要靠友軍偵測
const SENSOR_R = [550, 650, 650, 600, 750, 450];   // 航母、戰列、巡洋、驅逐、護衛、補給
SHIP_TYPES.forEach((t, k) => (t.sensor = SENSOR_R[k]));
// 戰爭迷霧（擬真＋迷霧開啟）：自動攻擊只打「知道位置」的敵人（偵測範圍內、掃描結果、艦載機看到的、開火暴露的）
//   tick＝每幾個模擬 tick 重算一次；ftr＝攻擊型艦載機周圍看得到的半徑；expose＝敵艦開火後，被打的艦隊看得到它幾秒
//   scanFirst＝開戰後幾秒才能第一次掃描（自動、手動都一樣）
//   scanR／scanShow／scanCd＝掃描半徑、掃到的顯示幾秒、冷卻（每一方共用；天賦「偵察」每階 −scanCdRecon 秒、偵測半徑 +sensorRecon）
//   ping＝被掃到的一方看得到掃描訊號的方向幾秒；last＝畫面上「最後已知位置」保留幾秒
//   area＝區域攻擊：半徑、持續秒數、看不到目標時的命中率倍率（盲射）
//   自動掃描＝上面的脈衝掃描：還有敵方艦隊看不到時，冷卻好了就自動從艦隊發出（玩家可以在戰術台關掉）
//   recon＝區域掃描（主動）：航母派出偵察機（不佔機庫、沒有武裝）飛到指定的點，在上空盤旋 loiter 秒，半徑 r 的球體內的敵軍都看得到（離開後再保留 scanShow 秒）；
//     天賦「偵察機」每階半徑 +rTal；cd＝每支艦隊的冷卻；speed／hp／size／fuel＝速度、耐久（裝甲薄）、被瞄準的大小係數（難以擊中）、續航秒數
//     eye＝飛行路徑上（去程、回程）偵察機自己看得到的半徑，看到的也一起回報
//     被干擾時偵察機照樣起飛、照樣偵察，但即時回報不了：記在機上，干擾結束或飛回母艦時才回報（成為最後已知位置）；中途被打下來＝情報沒了
const FOW_RULE = { tick: 30, ftr: 250, expose: 4, scanR: 800, scanFirst: 15, scanShow: 6, scanCd: 40, scanCdRecon: 5, sensorRecon: 0.1, ping: 10, last: 60,
  area: { r: 70, dur: 20, blind: 0.5 },
  recon: { r: 350, rTal: 0.2, eye: 300, loiter: 8, cd: 20, speed: [115, 130], hp: 3, size: 0.15, fuel: 70,
    acc: 0.2, min: 0.008, gap: 3 } };   // 很難打中：防空砲、副砲、攔截機的命中率 ×acc（下限 min，一般是 5%），每架每 gap 秒才會被一門砲瞄準一次
const GUN_KEYS = ['main', 'sec', 'aa'];
const GUN_NAME = { main: '主砲', sec: '副砲', aa: '防空' };
// 舊程式用的「光束射程」：取射程最遠的那一門（AI 判斷交戰距離、編成畫面用）
for (const t of SHIP_TYPES) { const g = t.guns.main || t.guns.sec || t.guns.aa; t.beam = { near: g.near, far: g.far, dmg: g.dmg, cd: g.cd }; }
// 命中率＝基本命中率 × 距離 × 目標大小 × 目標速度 × 環境，限制在 5%～97%
const HIT_RULE = {
  farMul: 0.4,                                  // 最大射程時命中率剩幾成（全威力距離內 100%）
  size: [1.15, 1.1, 1.0, 0.85, 0.75, 1.05],      // 目標艦種的大小係數（航母、戰列、巡洋、驅逐、護衛、補給）
  mainSizePow: 1.5,                              // 主砲轉得慢：大小係數再取這個次方（打小船更吃虧）
  speedRef: 25, speedMax: 0.35,                  // 目標速度達 speedRef（每秒單位）時命中率 −35%
  nebula: 0.6,                                   // 開火方或目標在星雲裡
  jammed: 0.85,                                  // 被「干擾」的一方開火
  min: 0.05, max: 0.97,
};
// 對空：防空砲優先打飛彈、其次艦載機；副砲在全威力距離內也會打。命中率同上公式，大小係數換成下面的值
//   formBase＋陣型 aa（橫陣 0.3、圓陣 0.6…）＝對空命中倍率；飛彈一發打中就毀，艦載機有耐久
//   missileShots：每顆飛彈最多被瞄準幾次（太多門砲同時打一顆會全部攔下）；fighterGap：同一架艦載機每隔幾秒才會再被瞄準
const AIR_RULE = { missileSize: 0.55, droneSize: 0.4, formBase: 0.7, droneHp: 6, missileShots: 3, fighterGap: 1.2 };   // 艦載機的大小、耐久見 CRAFT
// 飛彈、艦載機攻擊船的命中率（另外還會被防空砲／副砲攔截）：基本 × 目標大小^sizePow × 目標速度 × 星雲 × 被干擾
//   飛彈有導引：對大小、速度比較不敏感；lance＝光束攻擊機的持續光束
const STRIKE_RULE = {
  missile: { acc: 0.9, sizePow: 0.5, speedMax: 0.2, nebula: 0.75 },
  fighter: { acc: 0.75, sizePow: 1, speedMax: 0.3, nebula: 0.7 },
  lance: { acc: 0.85, sizePow: 0.5, speedMax: 0.2, nebula: 0.7 },
};
// 艦載機（航母機庫，依任務分四種；每支艦隊在編成畫面設定機庫比例，合計＝航母機庫容量）
//   size＝被防空砲瞄準時的大小係數（越小越難打中）；hp 耐久；speed 速度範圍；fuel 續航秒數
//   launch＝這種機只在敵艦隊距離小於此值時才出擊（沒寫就用航母的 fighters.range）
const CRAFT = [
  { key: 'int', name: '攔截機', hp: 8, size: 0.3, speed: [62, 76], fuel: 45,
    note: '留在艦隊上空巡邏，攔截敵方飛彈與艦載機；不打船' },
  { key: 'atk', name: '攻擊機', hp: 8, size: 0.3, speed: [48, 62], fuel: 35, dmg: 12,
    note: '貼近掃射敵艦' },
  { key: 'msl', name: '飛彈攻擊機', hp: 14, size: 0.45, speed: [36, 46], fuel: 40, missiles: 2, dmg: 30, standoff: 320,
    note: '飛到防空射程外發射 2 枚飛彈後返航' },
  { key: 'lance', name: '光束攻擊機', hp: 14, size: 0.45, speed: [36, 46], fuel: 40, dps: 18, channel: 4, cd: 6, range: 55, launch: 450, shieldMul: 1.5, hullMul: 1.5,
    note: '近距離決戰用：敵艦隊進到 450 內才出擊，貼到 55 內照射持續光束 4 秒（約 3～5 次可擊毀戰列艦）；消耗護盾 ×1.5，打穿後對船體傷害 ×1.5' },
];
const HANGAR_DEFAULT = [2, 2, 1, 1];   // 攔截、攻擊、飛彈、光束
// 攔截機：巡邏半徑、交戰半徑（以艦隊中心算）、對艦載機／飛彈的命中率、每發傷害、射擊間隔、開火距離
const INTERCEPT_RULE = { patrol: 160, engage: 340, acc: { fighter: 0.7, missile: 0.5 }, dmg: 3, cd: [0.3, 0.55], range: 60 };
const BEAM_FALLOFF_MIN = 0.3;                    // 距離減傷：最大射程時傷害剩 30%（全威力距離內 100%）
// 護盾回充：最後一次被打 delay 秒後開始，每秒回 rate × 容量
//   broken＝護盾被完全打光後，至少要等這麼多秒才重新啟動（沒護盾時船體再被打，也要重新等 delay 秒）
const SHIELD_RULE = { delay: 5, rate: 0.05, broken: 15 };
// 飛彈：護盾還在時，護盾吃 shield 倍、爆炸同時傷到船體 blast 倍；護盾沒了直擊船體 direct 倍
const MISSILE_RULE = { shield: 0.6, blast: 0.3, direct: 1.0 };
const SHIP_ORDER_FRONT_TO_BACK = [4, 3, 2, 1, 5, 0];   // 陣型中由前到後的擺放順序（補給艦在中後方）

// 技能：targetMode＝'enemy' 需要點選敵方分艦隊；scope＝'fleet' 只影響該指揮官的艦隊，'side' 影響全軍
const SKILLS = {
  focus: { name: '集中火力', uses: 2, cd: 60, dur: 20, scope: 'side', targetMode: 'enemy',
    desc: '全軍集中砲擊一支敵方分艦隊，傷害 +20%，持續 20 秒。' },
  wall: { name: '鐵壁', uses: 2, cd: 60, dur: 20, scope: 'fleet',
    desc: '護盾受到的傷害 −40%、船體受到的傷害 −30%，持續 20 秒。' },
  charge: { name: '突進', uses: 2, cd: 45, dur: 15, scope: 'fleet',
    desc: '艦隊向前移動速度 ×1.8，持續 15 秒（倒退、側移不加速）。' },
  rapid: { name: '極速射擊', uses: 2, cd: 60, dur: 15, scope: 'fleet',
    desc: '艦隊光束開火間隔縮短 35%，持續 15 秒。' },
  evade: { name: '機動迴避', uses: 2, cd: 50, dur: 12, scope: 'fleet',
    desc: '艦隊各方向移動速度 ×1.4、受到傷害 −25%，持續 12 秒。' },
  jam: { name: '干擾', uses: 1, cd: 90, dur: 25, scope: 'side',
    desc: '干擾敵軍通訊 25 秒：敵方雷達失效（看到的我方位置停在干擾開始那一刻、兵力與狀態不明，AI 也會用舊情報判斷）；下令變陣（包括原地轉向後的重排、畫陣線）要多等 6 秒才開始；開火（光束、飛彈、防空）命中率 −15%。擬真難度開啟戰爭迷霧時：敵方各艦隊不能共享情報（只看得到自己偵測到的），掃描也沒有結果，偵察機的情報要等飛回母艦才回報。' },
  // targetMode 'point'＝點選地圖上的位置；fixed＝次數不受「戰術熟練」影響
  merc: { name: '傭兵支援', uses: 1, cd: 0, dur: 0, scope: 'fleet', targetMode: 'point', fixed: true,
    desc: '點選地圖上的位置：15 秒後灰鴉傭兵團的艦隊（本場預算的 30%）從最近的地圖邊緣進場，開往該位置，之後聽你指揮。呼叫時扣 200 功勳；每場一次（打下劇情支線「渡鴉之巢」之後才有）。' },
  reinforce: { name: '呼叫增援', uses: 1, cd: 0, dur: 0, scope: 'fleet', targetMode: 'point', fixed: true,
    desc: '點選地圖上的位置：20 秒後一支增援艦隊（本場預算的 25%，照這支艦隊的編成比例）從最近的地圖邊緣進場，開往該位置。每次消耗 1 次增援次數（星際酒館用功勳購買），每位指揮官每場 1 次。' },
};
// 增援：share 兵力＝本場預算的比例、delay 呼叫後幾秒進場、cost 每次的功勳、max 最多存幾次
const REINFORCE_RULE = { share: 0.25, delay: 20, cost: 150, max: 9 };
// 傭兵支援（打下灰鴉的基地之後）：每場一次，呼叫時才扣功勳；share 兵力＝本場預算的比例
const MERC_RULE = { share: 0.3, delay: 15, cost: 200 };

// 指揮官（原創人物）。trait：固有特性（固定 +8%）；skills：固有技能（不用天賦點數）
// 初始指揮官（faction：0 帝國、1 聯盟）；其他的到「星際酒館」招募（見 tavern.js，招募來的會加進這個陣列）
const COMMANDERS = [
  { id: 'rein', name: '雷恩・瓦爾特', title: '少將', trait: 'dmg', skills: ['focus', 'charge'], faction: 0, base: true, bio: '攻勢型。擅長集中兵力一點突破。' },
  { id: 'erin', name: '艾琳・索拉', title: '少將', trait: 'shield', skills: ['wall', 'focus'], faction: 0, base: true, bio: '守勢型。陣地戰與消耗戰的專家。' },
  { id: 'kas', name: '卡斯・莫德', title: '准將', trait: 'speed', skills: ['charge', 'wall'], faction: 0, base: true, bio: '機動型。喜歡從側翼切入。' },
  { id: 'aaron', name: '亞倫・楊森', title: '少將', trait: 'shield', skills: ['wall', 'jam'], faction: 1, base: true, bio: '守勢型。擅長以干擾打亂敵軍節奏。' },
  { id: 'grace', name: '葛瑞絲・卡特萊', title: '准將', trait: 'dmg', skills: ['focus', 'rapid'], faction: 1, base: true, bio: '攻勢型。相信火力集中就是一切。' },
];
const FACTION_NAME = ['帝國軍', '聯盟軍', '灰鴉傭兵團', '機械改造人類', '機械智慧族', '蟲族感染人類', '蟲族'];   // 2＝傭兵：不能當玩家的陣營，傭兵指揮官可以替兩個陣營出擊；3～6 目前只當敵軍外觀
const FACTION_CLS = ['emp', 'all', 'mer', 'cyb', 'mai', 'inf', 'bug'];
// 指揮官能不能替這個陣營出擊（傭兵兩邊都行）
const canLead = (c, faction) => (c.faction || 0) === faction || (c.faction === 2 && faction < 2);
// 指揮官只帶自己風格的艦隊：傭兵指揮官替帝國／聯盟出擊時，艦隊是灰鴉的船、用傭兵的種族特性（setup 的 fleet.fac）
const ownFac = (c, sideFac) => (c && c.faction != null && c.faction !== sideFac ? { fac: c.faction } : {});
const TRAIT_NAME = { dmg: '攻擊', shield: '防禦', speed: '機動' };
// 特性對前排輪替的影響（見 ROTATE_RULE）
const TRAIT_ROT = {
  dmg: `前排輪替：船體剩 ${Math.round(ROTATE_RULE.hull * 100)}% 才換下（前排撐得久、火力不斷）`,
  shield: `前排輪替：護盾剩 ${Math.round(ROTATE_RULE.shEarly * 100)}% 就換下，護盾回充 +${Math.round(ROTATE_RULE.shRegen * 100)}%`,
  speed: `前排輪替：換位時間 −${Math.round(ROTATE_RULE.fast * 100)}%`,
};
// 沒有天賦的指揮官（敵方）：特性加成照等級算；玩家的指揮官：固有特性固定 +8%，其餘靠天賦
function traitBonus(trait, level) { return 0.08 + 0.02 * (level - 1); }
const XP_PER_LEVEL = 200;

// ── 天賦：每升一級得 1 點（Lv 1 就有 1 點），可隨時重新分配 ──
// kind 'stat'＝強化能力（可多階）；kind 'skill'＝學會技能；req＝需要的指揮官等級
// 護盾偏折：光束打到護盾還在的船，none＝完全無傷、half＝傷害減半的機率（最大射程時）；天賦「能量調度」每階再加 stepNone／stepHalf
//   距離越近越低：機率 × (closeMul + (1 − closeMul) × 開火距離 ÷ 最大射程)，貼臉只剩 closeMul 倍
//   擦邊越容易彈開：機率 × (grazeLo + grazeK × 擦邊²)；擦邊＝船中心到光束的距離 ÷ 受擊半徑（0＝正中 ×0.3、1＝邊緣 ×1.7，平均 ×1）
const DEFLECT_RULE = { none: 0.05, half: 0.15, stepNone: 0.03, stepHalf: 0.05, halfMul: 0.5, closeMul: 0.2, grazeLo: 0.3, grazeK: 1.4 };
const TALENT_BRANCHES = [['atk', '攻擊'], ['def', '防禦'], ['mob', '機動'], ['cmd', '指揮']];
const TALENTS = [
  { id: 'gunnery', br: 'atk', name: '砲術訓練', max: 3, cost: 1, desc: (r) => `光束、飛彈、艦載機傷害 +${r * 5}%` },
  { id: 'missile', br: 'atk', name: '飛彈裝填', max: 3, cost: 1, desc: (r) => `飛彈冷卻 −${r * 10}%` },
  { id: 'hangar', br: 'atk', name: '機庫整備', max: 2, cost: 1, desc: (r) => `航母補充新機快 ${r * 30}%、艦載機傷害 +${r * 10}%` },
  { id: 'aim', br: 'atk', name: '精準射擊', max: 3, cost: 1, desc: (r) => `光束對敵艦的命中率 +${r * 5}%；擬真難度：射線擋到友艦時打中它的機率 −${r * 15}%` },
  { id: 'fireline', br: 'atk', name: '火線管制', max: 3, cost: 1, desc: (r) => `擬真難度：射界被同部隊友艦擋住時，誤擊友軍的機率 −${r * 20}%` },
  { id: 's_rapid', br: 'atk', name: '極速射擊', kind: 'skill', skill: 'rapid', cost: 2, req: 3 },
  { id: 'shield', br: 'def', name: '護盾強化', max: 3, cost: 1, desc: (r) => `護盾容量與回充 +${r * 4}%` },
  { id: 'energy', br: 'def', name: '能量調度', max: 3, cost: 1, desc: (r) => `光束打到還有護盾的船時：完全無傷的機率 +${Math.round(r * DEFLECT_RULE.stepNone * 100)}%、傷害減半的機率 +${Math.round(r * DEFLECT_RULE.stepHalf * 100)}%（基本 ${Math.round(DEFLECT_RULE.none * 100)}%／${Math.round(DEFLECT_RULE.half * 100)}%，以上都是最大射程時的平均值，距離越近越低、擦邊比正中容易彈開）` },
  { id: 'damage', br: 'def', name: '損害管制', max: 3, cost: 1, desc: (r) => `戰地維修次數 +${r}、單次回復上限 +${Math.round(r * FIELD_REPAIR.step * 100)}%；維修機每趟修理量 +${r * 20}%` },
  { id: 'aa', br: 'def', name: '防空網', max: 2, cost: 1, desc: (r) => `防空砲的命中率 ×${(1 + r * 0.08).toFixed(2)}（攔截敵方飛彈與艦載機）` },
  { id: 's_wall', br: 'def', name: '鐵壁', kind: 'skill', skill: 'wall', cost: 2, req: 2 },
  { id: 'engine', br: 'mob', name: '推進強化', max: 3, cost: 1, desc: (r) => `移動速度 +${r * 5}%` },
  { id: 'drill', br: 'mob', name: '陣型演練', max: 2, cost: 1, desc: (r) => `變換陣型時間 −${r * 12}%` },
  { id: 'rotate', br: 'mob', name: '輪替演練', max: 3, cost: 1, desc: (r) => `前排輪替的換位時間 −${Math.round(r * ROTATE_RULE.tal * 100)}%` },
  { id: 'perfect', br: 'mob', name: '完美布陣', max: 3, cost: 1, desc: (r) => `擬真難度：射界被同部隊友艦擋住時照樣開火（不停火），誤擊友軍的傷害 −${r * 25}%` },
  { id: 's_charge', br: 'mob', name: '突進', kind: 'skill', skill: 'charge', cost: 2, req: 2 },
  { id: 's_evade', br: 'mob', name: '機動迴避', kind: 'skill', skill: 'evade', cost: 2, req: 3 },
  { id: 'recon', br: 'cmd', name: '偵察', max: 2, cost: 1, desc: (r) => (r >= 2 ? '戰前情報準確度 +24%，並看得到敵方的打法與編成' : '戰前情報準確度 +12%') + `；戰爭迷霧：這支艦隊的偵測半徑 +${r * 10}%、掃描冷卻 −${r * 5} 秒` },
  { id: 'survey', br: 'cmd', name: '偵察機', max: 3, cost: 1, desc: (r) => `戰爭迷霧：區域掃描（航母的偵察機）的掃描半徑 +${r * 20}%` },
  { id: 'veteran', br: 'cmd', name: '戰術熟練', max: 2, cost: 1, desc: (r) => `每個技能每場多 ${r} 次` },
  { id: 'tempo', br: 'cmd', name: '指揮效率', max: 2, cost: 1, desc: (r) => `技能冷卻 −${r * 15}%` },
  { id: 's_focus', br: 'cmd', name: '集中火力', kind: 'skill', skill: 'focus', cost: 2, req: 2 },
  { id: 's_jam', br: 'cmd', name: '干擾', kind: 'skill', skill: 'jam', cost: 2, req: 4 },
  { id: 's_reinf', br: 'cmd', name: '呼叫增援', kind: 'skill', skill: 'reinforce', cost: 2, req: 5 },
  { id: 'fac', br: 'fac', name: '種族專屬', max: 2, cost: 1, desc: () => '依指揮官的陣營而不同（見 FAC_TALENT）' },   // 每個陣營各一格專屬天賦；名稱、效果用 talFor 取
];
// ── 種族特性：跟著指揮官的陣營走（指揮官只帶自己風格的艦隊：fleet.fac＝指揮官的陣營）──
//   name／desc：特性說明（手冊、指揮官畫面）；brief／counter：戰前簡報（不寫數字，只寫特色與建議的剋制方式）
//   還沒做的陣營是 null：簡報、畫面都略過
const FAC_TRAIT = [
  { name: '重砲齊射', desc: '同一艘敵艦在短時間內連續被主砲打中時，後面的主砲不會被護盾偏折，而且傷害提高。配合齊射命令最有效。',
    brief: '帝國艦隊擅長正面集中砲擊，接連命中的主砲能撕開護盾。', counter: '分散陣型、從側翼切入，避免正面長時間對射；受損的前排要及早輪替。' },
  { name: '資料鏈', desc: '友軍剛打中的敵分艦隊，其他分艦隊打它更準；被干擾時命中率下降只有一半；飛彈的目標在命中前被擊沉，會轉向附近的敵艦。',
    brief: '聯盟艦隊情報共享、集火精準，飛彈會自動轉向新目標，干擾對它效果有限。', counter: '強化防空攔截飛彈，利用星雲、小行星遮蔽，從多個方向進攻讓它難以集火。' },
  { name: '戰場回收', desc: '附近有船被擊沉時（敵我都算），範圍內的傭兵艦會用殘骸修補船體並累積零件；零件夠了就把艦隊裡沉沒的船重新造出來（新造的船最大耐久只有一半）。',
    brief: '傭兵擅長消耗戰，會從殘骸回收零件修補，甚至把沉沒的戰艦重新造出來。', counter: '速戰速決，集中火力一口氣擊潰整支分艦隊；避免在它附近長時間纏鬥。' },
  { name: '液壓裝甲', desc: '副砲、防空砲、艦載機打到船體時會被裝甲擋掉一部分，單發越小擋得越多；主砲幾乎擋不住，飛彈完全擋不住。護盾比較薄。被突破時陣形混亂的時間縮短。',
    brief: '機械改造艦裝甲厚重，小口徑火力很難打穿，被衝進陣中也很快恢復陣形；但護盾比較薄。', counter: '多帶巡洋艦、驅逐艦，用飛彈與主砲的重火力打它；副砲、防空砲、艦載機掃射的消耗戰對它有利。突破陣型的效果也比較差。' },
  { name: '網路連結', desc: '附近每多一支連線中的友軍分艦隊，射擊就更準（有上限）；護盾受擊後比較快開始回充。被干擾時網路斷線：失去連線加成，命中率下降也比一般更重。',
    brief: '機械智慧族的艦隊彼此連線，聚在一起時射擊精準、護盾回充快；但非常依賴網路。', counter: '用干擾切斷網路（效果特別大），或把它的艦隊分割開來各個擊破。' },
  { name: '感染', desc: '光束打中時留下腐蝕，接下來幾秒持續侵蝕船體（不經過護盾）。附近被擊沉的敵方驅逐艦、護衛艦有機率被寄生、倒戈加入感染方（數量有上限；寄生艦只剩四成耐久，而且會慢慢死去）。護盾比較薄。',
    brief: '感染艦的攻擊會持續腐蝕船體，在它附近被擊沉的小船可能被寄生倒戈。', counter: '保持距離作戰，別讓驅逐艦、護衛艦在它附近沉沒；受損的船及早撤回補給艦旁維修。' },
  { name: '群體意志', desc: '沒有護盾，但船體比較厚，一段時間沒被打就會再生（孵化囊附近更快）。巡洋艦、驅逐艦用短程的酸液孢子代替飛彈，持續腐蝕船體。航母、戰列艦、巡洋艦都會孵化艦載機。不會潰走，被突破也不會亂了陣形；但航母（母巢）被擊沉時，附近的分艦隊會陷入混亂。',
    brief: '蟲族艦載機成群、近距離火力兇猛，受傷會再生，而且不會潰逃。', counter: '拉開距離用主砲放風箏、強化防空；優先擊沉航母（母巢）讓周圍陷入混亂。不要用突破陣型衝進蟲群。' },
];
// 各陣營的專屬天賦（天賦樹「種族」那一格，id 'fac'）
const FAC_TALENT = [
  { name: '齊射指揮', max: 2, desc: (r) => `重砲齊射的判定時間 +${r * 25}%、額外傷害 +${r * 5}%` },
  { name: '智慧導引', max: 2, desc: (r) => `飛彈命中率 +${r * 5}%；飛彈轉向的搜尋範圍 +${r * 30}%` },
  { name: '拆解專家', max: 2, desc: (r) => `戰場回收的範圍 +${r * 20}%、修補量與零件 +${r * 20}%` },
  { name: '過載', max: 2, desc: (r) => `船體低於 ${Math.round(ARMOR_RULE.over * 100)}% 的船，主砲、副砲射速 +${r * 15}%` },
  { name: '冗餘節點', max: 2, desc: (r) => `被干擾時保留 ${r * 35}% 的連線加成，干擾額外造成的命中率下降減少 ${r * 35}%` },
  { name: '腐蝕爆發', max: 2, desc: (r) => `寄生艦被擊沉時，原地留下 ${INFECT_RULE.zone.dur} 秒的腐蝕區域（半徑 ${INFECT_RULE.zone.r + (r - 1) * INFECT_RULE.zone.rTal}）：感染族、蟲族以外的船在裡面傷害、移動速度 −${Math.round((1 - INFECT_RULE.zone.mul) * 100)}%（不疊加）` },
  { name: '屍體孵化', max: 2, desc: (r) => `附近被擊沉的敵方戰艦孵出 ${r * SWARM_RULE.corpse.ftr} 架攻擊機；${r * SWARM_RULE.corpse.ship * 100}% 機率孵出一艘驅逐艦或護衛艦` },
];
// 陣營讓某些天賦沒有作用時，同一格換成別的天賦（點數、階數不變）：FAC_TAL_SWAP[陣營][天賦 id]＝{ name, desc }
//   只給 name＝同樣效果、換成符合世界觀的名字；效果真的換掉的要在 fleetMods 裡照陣營處理
const FAC_TAL_SWAP = [{}, {}, {},
  { energy: { name: '裝甲強化', desc: (r) => `液壓裝甲的厚度 +${r * 25}%（取代能量調度：機械改造艦的護盾薄，偏折用處不大）` } },
  { survey: { name: '偵察無人機' }, hangar: { name: '無人機整備' } },
  {},
  // 蟲族：沒有飛彈、沒有護盾（效果換掉的在 fleetMods 處理；酸液孢子沿用飛彈的冷卻，所以「酸腺強化」效果同「飛彈裝填」）
  { missile: { name: '酸腺強化', desc: (r) => `酸液孢子冷卻 −${r * 10}%` },
    shield: { name: '甲殼增生', desc: (r) => `船體再生速度 +${r * 20}%（取代護盾強化：蟲族沒有護盾）` },
    energy: { name: '甲殼硬化', desc: (r) => `被光束打中時 ${Math.round(r * SWARM_RULE.harden * 100)}% 機率傷害減半（取代能量調度：蟲族沒有護盾）` },
    damage: { name: '快速癒合' }, s_jam: { name: '費洛蒙干擾' }, survey: { name: '偵察孢子' }, hangar: { name: '孵化加速' } }];
// 依陣營取天賦的實際名稱與說明
function talFor(t, fac) {
  const f = fac || 0;
  if (t.id === 'fac') { const x = FAC_TALENT[f]; return x ? { ...t, ...x } : { ...t, name: '種族專屬（未開放）', max: 0, desc: () => '這個陣營的專屬天賦還沒開放' }; }
  const s = FAC_TAL_SWAP[f] && FAC_TAL_SWAP[f][t.id];
  return s ? { ...t, ...s } : t;
}
// 種族特性的數值（戰鬥規則）
//   VOLLEY（帝國・重砲齊射）：同一艘敵艦上次被帝國主砲打中後 win 秒內再被打中＝齊射命中：不吃護盾偏折、傷害 ×(1＋bonus)；天賦每階 win ×(1＋winTal)、bonus ＋bonusTal
//   LINK（聯盟・資料鏈）：敵分艦隊 win 秒內被別支聯盟分艦隊打中過 → 命中率 ×acc；被干擾時命中率的懲罰 ×jam；飛彈目標沉了 → 在落點 r 內找新目標（天賦每階 r ×(1＋rTal)、飛彈命中率 ＋mslTal）
//   SALVAGE（傭兵・戰場回收）：船沉在傭兵分艦隊中心 r 內 → 那支分艦隊每艘船回復最大耐久的 heal（每支分艦隊 cd 秒最多一次）；
//     艦隊累積零件＝沉船造價 × parts；每 every 秒檢查一次：零件夠就把艦隊裡沉沒的船（還有存活艦的分艦隊、旗艦除外）重新造出來，最大耐久 ×cap；
//     每場最多造開戰艘數 × maxBuild 艘；天賦每階 r、heal、parts ×(1＋tal)
const VOLLEY_RULE = { win: 1.3, bonus: 0.12, winTal: 0.25, bonusTal: 0.05 };
const LINK_RULE = { win: 3, acc: 1.2, jam: 0.5, r: 80, rTal: 0.3, mslTal: 0.05 };
//   ARMOR（機械改造・液壓裝甲）：飛彈以外打到船體的每一發，擋掉 a[艦種] ÷ 武器原本的單發傷害（主砲再 ×mainMul）（不算距離衰減；最少留 min 倍），天賦「裝甲強化」每階 a ×(1＋tal)；護盾容量 ×sh；陣形混亂時間 ×disorder
//     over＝專屬天賦「過載」：船體低於最大耐久的 over，主砲、副砲射速 ×(1＋overRate × 階數)
//   NET（機械智慧・網路連結）：每 0.5 秒數一次 r 內同陣營、同一邊的分艦隊；每多一支命中率 ×(1＋per)，最多算 max 支；護盾回充延遲 ×delay
//     被干擾：連線加成歸零、干擾的命中率懲罰 ×jam；天賦「冗餘節點」每階保留 tal 的加成、懲罰的額外部分減少 tal
const ARMOR_RULE = { a: [3.4, 3.8, 3.1, 2.5, 2.0, 3.1], mainMul: 0.35, min: 0.25, tal: 0.25, sh: 0.9, disorder: 0.5, over: 0.3, overRate: 0.15 };
const NET_RULE = { r: 520, per: 0.05, max: 3, delay: 0.8, jam: 2.5, tal: 0.35 };
//   INFECT（蟲族感染人類・感染）：光束打中（不論打在護盾或船體）→ 目標在 dur 秒內船體再受到 dot × 這一發傷害（不經過護盾，同一艘疊加）；護盾容量 ×sh
//     寄生：敵方驅逐艦、護衛艦沉在感染分艦隊中心 r 內，chance 機率倒戈：感染艦隊開戰時預留的空位（dorm[艦種] 個）啟用，最大耐久 ×cap，每秒損失最大耐久的 decay
//     每支艦隊同時最多 live 艘、每場最多 max 艘（＝預留的空位）
//     zone（專屬天賦「腐蝕爆發」）：寄生艦沉了 → 原地 dur 秒的腐蝕區域，半徑 r（每多一階 ＋rTal）；感染族、蟲族以外的分艦隊中心在裡面：傷害、速度 ×mul（不疊加）
//   SWARM（蟲族・群體意志）：沒有護盾、船體 ×hp；最後一次被打 regenDelay 秒後每秒再生最大耐久的 regen（孵化囊 SUPPLY_RULE.range 內 ×hiveMul；天賦「甲殼增生」每階 ×(1＋0.2)）
//     spore：巡洋、驅逐的飛彈換成酸液孢子：射程 ×range，命中後 dur 秒內對船體造成 dmg × 飛彈傷害（不經過護盾）
//     brood：各艦種的艦載機（航母機庫 ×、補機時間 ×；戰列、巡洋另外有小機庫）；harden＝天賦「甲殼硬化」每階的減半機率
//     hive：航母（母巢）沉了 → r 內的蟲族分艦隊陣形混亂 dur 秒；corpse（專屬天賦「屍體孵化」）：敵方戰艦（航母～驅逐）沉在蟲族分艦隊 r 內
//       → 孵出 ftr × 階數 架攻擊機（從最近的蟲族船起飛）；ship × 階數 機率孵出一艘（用預留空位 dorm）
const INFECT_RULE = { dot: 0.1, dur: 8, sh: 0.9, r: 520, chance: 0.3, cap: 0.4, decay: 0.006, live: 3, dorm: [0, 0, 0, 3, 3, 0],
  zone: { dur: 60, r: 110, rTal: 40, mul: 0.85 } };
const SWARM_RULE = { hp: 1.5, regenDelay: 8, regen: 0.005, hiveMul: 2, harden: 0.06,
  spore: { range: 0.6, dmg: 0.85, dur: 6 },
  brood: { carrier: { n: 1.5, build: 0.6 }, 1: { n: 2, wave: 2, cd: 24, range: 800, build: 20 }, 2: { n: 1, wave: 1, cd: 28, range: 700, build: 24 } },
  hive: { r: 300, dur: 6 }, corpse: { r: 520, ftr: 2, ship: 0.05, dorm: [0, 0, 0, 2, 2, 0] } };
// 依陣營取艦種資料：蟲族的艦載機（機庫）與酸液孢子射程不一樣，其他陣營照 SHIP_TYPES
let BUG_TYPES = null;
function facShipType(fac, t) {
  if (fac !== 6) return SHIP_TYPES[t];
  if (!BUG_TYPES) {
    const B = SWARM_RULE.brood;
    BUG_TYPES = SHIP_TYPES.map((s, k) => {
      const o = { ...s };
      if (k === 0) o.fighters = { ...s.fighters, n: s.fighters.n * B.carrier.n, build: s.fighters.build * B.carrier.build };
      else if (B[k]) o.fighters = { ...B[k] };
      if (s.missile) o.missile = { ...s.missile, range: s.missile.range * SWARM_RULE.spore.range };
      return o;
    });
  }
  return BUG_TYPES[t];
}
const SALVAGE_RULE = { r: 200, heal: 0.015, cd: 8, parts: 0.3, every: 6, cap: 0.5, maxBuild: 0.04, tal: 0.2 };
const TALENT_BY_ID = Object.fromEntries(TALENTS.map((t) => [t.id, t]));
function talentRank(c, id) { return (c && c.tal && c.tal[id]) || 0; }
// 指揮官能用的技能＝固有技能＋天賦學會的
function commanderSkills(base, tal) { const out = base.slice(); for (const t of TALENTS) if (t.kind === 'skill' && tal && tal[t.id] && !out.includes(t.skill)) out.push(t.skill); return out; }

// 敵方的偏好打法（AI 會照這個行動；難度越高越會針對玩家反制）
const TACTICS = {
  push: { name: '正面推進', desc: '推進到中距離後維持陣線對射。' },
  kite: { name: '遠距離消耗', desc: '保持在戰列艦的射程邊緣；被逼近就後退。' },
  flank: { name: '側翼包抄', desc: '主力牽制正面，另一支艦隊繞向側翼。' },
  breakthrough: { name: '中央突破', desc: '紡錘陣直衝玩家中央。' },
};

// 地形（3D）：每個地形是一顆球（x, y, z, r）。nebula＝命中率下降（HIT_RULE.nebula；射擊方或目標在內）；asteroid＝移動速度 ×0.5；
// rock＝實體障礙（solid）：船過不去、光束與飛彈會被擋住，可以躲在後面
const TERRAIN_TYPES = {
  nebula: { name: '電離星雲', desc: '區域內命中率下降（光束 −40%、飛彈 −25%、艦載機 −30%；射擊方或目標在星雲內都算）。', color: 0x7a5cff },
  asteroid: { name: '小行星帶', desc: '區域內移動速度 −50%。', color: 0xb08a5a },
  rock: { name: '巨大小行星', desc: '實體障礙：艦隊無法穿越（會從旁邊或上下繞過），光束與飛彈也會被擋住，可以拿來掩護。', color: 0x9a8d7c, solid: true },
};
const ALT_RANGE = 400;   // 戰場的高度範圍 ±400（y＝0 是基準面）

// ── 作戰 ──
// 敵方艦隊：comp＝各艦種圖示數 [航母, 戰列, 巡洋, 驅逐, 護衛]
// intel：情報準確度（0～1，影響數量誤差）與看不到的項目
// aiOmni：true＝這一關的 AI 全知（擬真難度的戰爭迷霧不限制敵方，偵測、自動攻擊都照看得到全部；預設不開）
const SCENARIOS = [
  {
    id: 's1', name: '邊境遭遇戰', size: '小型', timeLimit: 240, budget: 2700, maxFleets: 2, level: 1, seed: 101,
    story: '巡邏艦隊在邊境星域與敵方前鋒遭遇。敵軍規模不大，正面推進。擊退它。',
    terrain: [{ type: 'rock', x: -280, y: 40, z: -60, r: 60 }, { type: 'rock', x: 260, y: -70, z: 20, r: 48 }],
    enemy: [
      { name: '敵前鋒艦隊', commander: { name: '巴爾克', trait: 'dmg', level: 1, skills: ['focus'] },
        comp: [0, 140, 300, 420, 400], formation: 'line', tactic: 'push', x: 0, z: -660, h: 0 },
    ],
    events: [],
    intel: { accuracy: 0.9, hide: [] },
  },
  {
    id: 's2', name: '星雲伏擊', size: '中型', timeLimit: 360, budget: 4400, maxFleets: 3, level: 2, seed: 202,
    story: '敵軍在星雲兩側布陣，主力打算拉開距離消耗我方，另一支艦隊伺機包抄。情報不完整。',
    terrain: [{ type: 'nebula', x: 0, y: -40, z: 0, r: 240 }, { type: 'rock', x: -420, y: 90, z: -120, r: 70 }, { type: 'rock', x: 330, y: -30, z: 110, r: 55 }],
    enemy: [
      { name: '敵主力艦隊', commander: { name: '霍斯特', trait: 'shield', level: 2, skills: ['wall', 'focus'] },
        comp: [60, 320, 380, 200, 200], formation: 'crescent', tactic: 'kite', x: -150, z: -710, h: 0 },
      { name: '敵機動艦隊', commander: { name: '佩蕾', trait: 'speed', level: 2, skills: ['charge'] },
        comp: [0, 0, 160, 420, 220], formation: 'column', tactic: 'flank', x: 380, y: 150, z: -630, h: 0 },
    ],
    events: [{ type: 'reinforce', chance: 0.4, at: [70, 130], name: '敵增援艦隊',
      comp: [0, 80, 160, 220, 140], formation: 'line', edge: 'left' }],
    intel: { accuracy: 0.65, hide: ['events'] },
  },
  {
    id: 's3', name: '要塞前哨突破', size: '大型', timeLimit: 540, budget: 5600, maxFleets: 3, level: 3, seed: 303,
    story: '敵方前哨站由小行星帶掩護，守軍擅長中央突破反擊，而且可能藏有預備隊。偵察情報極少。',
    terrain: [{ type: 'asteroid', x: -260, y: -60, z: -40, r: 170 }, { type: 'asteroid', x: 280, y: 70, z: 20, r: 150 },
      { type: 'rock', x: -250, y: -40, z: -60, r: 62 }, { type: 'rock', x: 300, y: 90, z: 0, r: 70 }, { type: 'rock', x: 30, y: 10, z: -250, r: 85 }],
    enemySupply: { comp: [0, 0, 0, 0, 220, 110], formation: 'ring', x: -320, y: -110, z: -980, h: 0, follow: 1 },   // 跟著守備艦隊
    enemy: [
      { name: '敵突擊艦隊', commander: { name: '格倫', trait: 'dmg', level: 3, skills: ['charge', 'focus'] },
        comp: [0, 110, 420, 480, 220], formation: 'spindle', tactic: 'breakthrough', x: 0, z: -690, h: 0 },
      { name: '敵守備艦隊', commander: { name: '奧德', trait: 'shield', level: 3, skills: ['wall'] },
        comp: [120, 320, 300, 120, 260], formation: 'line', tactic: 'push', x: -320, y: -110, z: -750, h: 0 },
    ],
    events: [{ type: 'reinforce', chance: 0.7, at: [90, 160], name: '敵預備隊',
      comp: [40, 160, 220, 160, 120], formation: 'crescent', edge: 'right' }],
    intel: { accuracy: 0.45, hide: ['comp', 'events', 'tactic'] },
  },
];
// 部署區（世界座標）：玩家在下方（靠鏡頭），面向上方（−z）
//   ZONE_SHIFT＝部署區往外推的距離：雙方起始距離（約 1300）大於偵測半徑、自動掃描半徑，開戰時彼此看不到（戰爭迷霧）
//   舊編成存的位置（z < DEPLOY_ZONE.z0）載入時一起往後推（zoneFix）
const ZONE_SHIFT = 330;
const DEPLOY_ZONE = { x0: -520, x1: 520, z0: 170 + ZONE_SHIFT, z1: 420 + ZONE_SHIFT };
const ENEMY_ZONE = { x0: -560, x1: 560, z0: -460 - ZONE_SHIFT, z1: -200 - ZONE_SHIFT };
const MAP_BOUNDS = { x0: -1000, x1: 1000, z0: -1000, z1: 1000 };
