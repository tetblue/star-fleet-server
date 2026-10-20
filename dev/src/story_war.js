// ═══════════════════════ 劇情戰役〈雙星記〉：每一關的戰鬥資料、簡報、戰後進度 ═══════════════════════
// foes：[艦隊名, 指揮官, 特性, 等級, 技能, 艦隊類型（CAMP_ARCHETYPES 的 key）, 兵力（預算的倍數）, 陣型, 打法, x（省略＝平均排開）]
// goal：省略＝殲滅或潰走；survive＝撐到時限；escort＝護送目標（vip）撐到時限；cut＝擊沉敵方所有補給艦（要有 supply）
// ev：增援 [名稱, 指揮官 [名, 特性, 等級, 技能] 或 null, 兵力, 艦隊類型, 陣型, 進場邊 left/right, 進場時間 [a, b], 機率（省略＝1）]
// intel：[準確度, 看不到的項目]；decoy：假情報（簡報只顯示第一支艦隊，兵力 × decoy，也看不到增援）；enemyFac：敵軍外觀的陣營（目前沒有關卡使用：同陣營兩邊的標籤顏色和船型分不出來）
// lines：戰鬥中的通訊 [秒, 誰, 台詞]；after：打贏後的結語；supply：敵方補給艦隊（預算的倍數，跟著第一支艦隊）
const stT = (type, x, z, r, y = 0) => ({ type, x, y, z, r });
const STORY_DEATH = { kas: '10', grace: '16' };   // 劇情中退場：打完這一關之後就不能再派
const STORY_WAR = {
  '1': { budget: 2400, time: 240, fleets: 1, lv: 1, intel: [0.9, []],
    terrain: [stT('rock', -280, -60, 60, 40), stT('rock', 260, 20, 48, -70)],
    foes: [['聯盟巡邏艦隊', '巴爾克', 'dmg', 1, ['focus'], 'balanced', 0.8, 'line', 'push']],
    lines: [[3, '雷恩', '聯盟的巡邏隊？……全艦，第一種戰鬥配置。'], [45, '副官', '敵旗艦確認，指揮官是巴爾克中校。'], [120, '雷恩', '對方陣形還沒亂。不要急著追，先把他們的火力削下來。']],
    after: '巴爾克的巡邏隊潰走了。雷恩在戰報上寫下：「敵軍撤退得異常有秩序。對面有人在收拾殘局。」' },
  '2': { budget: 2400, time: 180, fleets: 1, lv: 1, goal: 'survive', intel: [0.8, ['events']],
    terrain: [stT('asteroid', -300, -40, 170), stT('asteroid', 320, 60, 150), stT('rock', 0, 120, 55, 30)],
    foes: [['帝國追擊艦隊', '雷恩・瓦爾特', 'dmg', 2, ['focus', 'charge'], 'raider', 0.9, 'wedge', 'breakthrough'],
      ['帝國前鋒艦隊', '霍克', 'speed', 1, ['charge'], 'balanced', 0.35, 'line', 'flank']],
    lines: [[3, '亞倫', '不用打贏，只要活著回去。全艦後退，保持陣形。'], [70, '通訊官', '帝國艦隊的指揮官是……雷恩・瓦爾特少將。'], [140, '亞倫', '再撐一下。這個人追擊的方式，很有意思。']],
    after: '亞倫帶回了大部分的艦艇。他的報告只寫了一句：「帝國有一位值得注意的將領。」' },
  '3': { budget: 3000, time: 300, fleets: 2, lv: 2, intel: [0.95, []],
    terrain: [stT('nebula', 0, -120, 260, -30), stT('rock', -430, 60, 70, 80), stT('rock', 420, -20, 60, -60)],
    foes: [['帝國第三艦隊', '艾琳・索拉', 'shield', 2, ['wall', 'focus'], 'balanced', 0.6, 'column', 'push', -120],
      ['帝國機動艦隊', '卡斯・莫德', 'speed', 2, ['charge'], 'raider', 0.3, 'column', 'flank', 280]],
    lines: [[3, '葛瑞絲', '等他們進到星雲裡再開火。佩蕾，側翼交給妳。'], [40, '佩蕾', '（通訊）收到。帝國艦隊的動作比預想的快。'], [150, '葛瑞絲', '議會要的勝利，就在眼前了。']],
    after: '帝國艦隊在星雲裡損失慘重，卻始終沒有潰散。葛瑞絲的戰報被議會拿去當成了選舉文宣。' },
  '4': { budget: 3200, time: 330, fleets: 2, lv: 2, intel: [0.55, ['events', 'tactic']],
    terrain: [stT('nebula', 0, -60, 280, 20), stT('rock', 380, 140, 60)],
    foes: [['聯盟伏擊艦隊', '葛瑞絲・卡特萊', 'dmg', 3, ['focus', 'rapid'], 'heavy', 0.55, 'crescent', 'kite']],
    ev: [['佩蕾的機動艦隊', ['佩蕾', 'speed', 3, ['charge']], 0.32, 'raider', 'wedge', 'right', [45, 80]]],
    lines: [[3, '艾琳', '情報說這片星雲是空的。……我不喜歡「空」這個字。'], [50, '副官', '右舷出現艦影！是伏兵！'], [56, '艾琳', '果然。全艦轉向迎擊，不要慌。']],
    after: '艾琳突破了伏擊。回到後方時，她發現那份「星雲內無敵蹤」的情報，是攝政派的參謀部發出的。' },
  '5': { budget: 3000, time: 300, fleets: 2, lv: 2, goal: 'escort', vip: { name: '補給船團', comp: [0, 0, 0, 0, 40, 60] }, intel: [0.7, ['events']],
    terrain: [stT('asteroid', -260, 0, 160), stT('asteroid', 300, -120, 140), stT('rock', 60, 160, 50, -40)],
    foes: [['聯盟襲擊艦隊', '佩蕾', 'speed', 3, ['charge', 'evade'], 'raider', 0.45, 'wedge', 'flank', 320],
      ['聯盟遊擊艦隊', '索恩', 'dmg', 2, ['focus'], 'raider', 0.35, 'column', 'breakthrough', -300]],
    lines: [[3, '卡斯', '護衛只有我們？……好吧，那就別讓他們碰到船團。'], [80, '補給船團', '（通訊）後方有敵艦接近！'], [220, '卡斯', '再撐一下，航道快到了。']],
    after: '船團抵達了前線。卡斯在報告最後加了一句：「下次請派護衛。」那份報告沒有人回覆。' },
  '6': { budget: 3400, time: 360, fleets: 2, lv: 2, intel: [0.75, ['events']],
    terrain: [stT('nebula', -300, -80, 180), stT('rock', 200, 40, 70, 50), stT('rock', -60, -260, 55)],
    foes: [['帝國突擊艦隊', '格倫', 'dmg', 3, ['charge', 'focus'], 'raider', 0.5, 'spindle', 'breakthrough'],
      ['帝國守備艦隊', '奧德', 'shield', 3, ['wall'], 'heavy', 0.4, 'line', 'push']],
    lines: [[3, '霍斯特', '（通訊）亞倫，議會要的是數字。我負責拖住他們，你負責算。'], [90, '亞倫', '擊沉數……這些人回不了家了。可是在議會裡，他們只是一個數字。']],
    after: '戰報上的擊沉數又多了一筆。亞倫把報告送出去之前，在後面附上了己方的陣亡名單。' },
  '7': { budget: 3800, time: 420, fleets: 2, lv: 3, intel: [0.6, ['tactic', 'events']], supply: 0.6,
    terrain: [stT('asteroid', -260, -40, 170, -60), stT('asteroid', 280, 20, 150, 70), stT('rock', -250, -60, 62, -40), stT('rock', 300, 0, 70, 90), stT('rock', 30, -250, 85, 10)],
    foes: [['要塞前哨守備隊', '奧德', 'shield', 4, ['wall', 'focus'], 'heavy', 0.55, 'line', 'push'],
      ['前哨巡邏艦隊', '莫蘭', 'dmg', 3, ['focus'], 'balanced', 0.35, 'crescent', 'kite']],
    ev: [['前哨預備隊', null, 0.25, 'balanced', 'crescent', 'right', [90, 150], 0.6]],
    lines: [[3, '亞倫', '十天。議長給了十天。……打仗不是排行程。'], [110, '葛瑞絲', '（通訊）前哨的防線開始動搖了！']],
    after: '前哨陷落，埃吉斯要塞的外圍防線出現了缺口。奧德撤回了要塞本體。' },
  '8': { budget: 4000, time: 420, fleets: 2, lv: 3, intel: [0.7, ['events']],
    terrain: [stT('rock', -200, -120, 75, 30), stT('rock', 220, -60, 60, -50), stT('nebula', 0, 200, 160)],
    foes: [['聯盟包圍艦隊', '葛瑞絲・卡特萊', 'dmg', 4, ['focus', 'rapid'], 'heavy', 0.5, 'crescent', 'push', -150],
      ['聯盟飛彈艦隊', '霍斯特', 'shield', 4, ['wall', 'jam'], 'missile', 0.4, 'crescent', 'kite', 300]],
    lines: [[3, '雷恩', '要塞拒絕開放航道？那就從外面把包圍網撕開。'], [60, '副官', '要塞司令來電……他說「不需要援助」。'], [64, '雷恩', '不用理他。']],
    after: '雷恩擊退了包圍艦隊的一翼，但要塞司令依然拒絕會合。三天後，聯盟發動了總攻。' },
  '9': { budget: 4600, time: 480, fleets: 3, lv: 3, intel: [0.5, ['comp', 'events']], supply: 0.6,
    terrain: [stT('rock', 0, -300, 110, 0), stT('asteroid', -340, -120, 170), stT('asteroid', 340, -120, 170), stT('rock', -380, 100, 55, 60)],
    foes: [['要塞駐留艦隊', '奧德', 'shield', 5, ['wall', 'focus'], 'heavy', 0.45, 'line', 'push'],
      ['要塞司令直屬艦隊', '赫茲', 'shield', 4, ['wall'], 'carrier', 0.35, 'ring', 'kite']],
    ev: [['要塞防衛隊', null, 0.25, 'balanced', 'line', 'left', [100, 170], 0.7]],
    lines: [[3, '亞倫', '要塞的砲台交給干擾。我們只對付艦隊。'], [130, '葛瑞絲', '（通訊）要塞的防衛網沉默了！'], [260, '亞倫', '……這一仗之後，議會會說「聯盟所向無敵」。那才是最危險的。']],
    after: '埃吉斯要塞陷落。聯盟舉國歡騰，亞倫被授予元帥軍銜。帝國的門戶，從此握在聯盟手上。' },
  '10': { budget: 4200, time: 240, fleets: 2, lv: 3, goal: 'survive', intel: [0.65, ['events']],
    terrain: [stT('asteroid', -200, 80, 180), stT('asteroid', 260, -60, 160), stT('rock', 40, -40, 60)],
    foes: [['聯盟突擊艦隊', '葛瑞絲・卡特萊', 'dmg', 5, ['charge', 'focus', 'rapid'], 'raider', 0.55, 'wedge', 'breakthrough'],
      ['聯盟主力艦隊', '亞倫・楊森', 'shield', 5, ['wall', 'jam'], 'balanced', 0.5, 'crescent', 'push'],
      ['聯盟機動艦隊', '佩蕾', 'speed', 4, ['charge', 'evade'], 'raider', 0.35, 'column', 'flank']],
    lines: [[3, '卡斯', '雷恩，主力先走。這裡交給我。'], [6, '雷恩', '卡斯——'], [9, '卡斯', '我是機動型的，撤退比誰都快。放心吧。'], [150, '卡斯', '（通訊）……看來這次，跑不掉了。'], [210, '通訊官', '卡斯准將的旗艦……訊號消失。']],
    after: '帝國主力撤出了歐倫星系。卡斯・莫德准將沒有回來。雷恩在艦橋上，為他留了一個空位。' },
  '11': { budget: 4200, time: 300, fleets: 2, lv: 4, goal: 'escort', vip: { name: '帝國使節艦', comp: [0, 0, 0, 0, 50, 20] }, intel: [0.4, ['comp', 'tactic', 'events']],
    terrain: [stT('nebula', -320, -60, 200), stT('nebula', 340, -20, 180), stT('rock', 0, 60, 60, 30)],
    foes: [['身分不明的艦隊', '？？？', 'dmg', 5, ['focus', 'charge'], 'raider', 0.45, 'wedge', 'flank'],
      ['身分不明的艦隊', '？？？', 'speed', 5, ['charge'], 'missile', 0.35, 'crescent', 'kite']],
    lines: [[3, '艾琳', '停戰談判……如果真的能停下來就好了。'], [45, '副官', '不明艦隊接近！沒有識別信號！'], [52, '艾琳', '聯盟的？……不，聯盟沒有理由在這裡破壞談判。']],
    after: '使節艦平安抵達洛珊。艾琳查不出那支艦隊的來歷，它們的艦體上什麼標誌都沒有。' },
  '12': { budget: 4400, time: 300, fleets: 2, lv: 4, goal: 'survive', intel: [0.9, []], decoy: 0.45,
    terrain: [stT('rock', -300, -100, 70, 40), stT('rock', 260, 60, 60, -30), stT('asteroid', 0, -200, 160)],
    foes: [['帝國艦隊？', '？？？', 'shield', 5, ['wall', 'focus'], 'heavy', 0.6, 'line', 'push'],
      ['身分不明的艦隊', '？？？', 'dmg', 5, ['charge', 'focus'], 'raider', 0.5, 'wedge', 'breakthrough']],
    ev: [['身分不明的增援', null, 0.3, 'balanced', 'crescent', 'left', [60, 100]]],
    lines: [[3, '亞倫', '情報說只有一支小型艦隊……'], [40, '通訊官', '敵艦數量是情報的兩倍以上！'], [43, '亞倫', '情報是假的。全艦，準備突圍。'], [200, '亞倫', '有人不想讓這場戰爭結束。']],
    after: '亞倫突圍成功。那份戰前情報的簽發單位是聯盟參謀本部，而它的抄本，同時出現在赫爾墨斯集團的帳簿裡。' },
  '13': { budget: 4800, time: 480, fleets: 3, lv: 4, intel: [0.7, ['events']], supply: 0.6,
    terrain: [stT('nebula', 300, -100, 200), stT('rock', -250, -40, 80, -50), stT('rock', 100, 150, 55, 60)],
    foes: [['攝政派先鋒艦隊', '格倫', 'dmg', 6, ['charge', 'focus'], 'raider', 0.5, 'spindle', 'breakthrough'],
      ['凡德林公爵直屬艦隊', '布勞', 'shield', 5, ['wall'], 'heavy', 0.45, 'line', 'push']],
    ev: [['攝政派援軍', null, 0.25, 'balanced', 'line', 'right', [120, 200], 0.7]],
    lines: [[3, '雷恩', '格倫，你知道自己在替誰打仗嗎？'], [8, '格倫', '（通訊）我替帝國打仗。這是命令，雷恩。'], [160, '艾琳', '攝政派的陣線開始動搖了。']],
    after: '格倫的艦隊投降了。格倫說：「我服從的是帝國，不是公爵。」他帶著殘存的艦隊加入了雷恩的陣營。' },
  '14': { budget: 5000, time: 480, fleets: 3, lv: 4, intel: [0.65, ['events']],
    terrain: [stT('asteroid', -280, -60, 180), stT('asteroid', 300, 0, 160), stT('rock', 0, -220, 70)],
    foes: [['帝國第三艦隊', '艾琳・索拉', 'shield', 6, ['wall', 'focus'], 'heavy', 0.5, 'crescent', 'kite'],
      ['帝國守備艦隊', '赫克', 'dmg', 5, ['focus'], 'balanced', 0.45, 'line', 'push']],
    lines: [[3, '葛瑞絲', '亞倫，你投反對票的事，整個艦隊都知道了。'], [7, '亞倫', '那就讓他們也知道，投反對票的人一樣會把他們帶回家。']],
    after: '遠征軍在涅瓦星系站穩了腳步。前方的帝國星域，安靜得令人不安。' },
  '15': { budget: 5000, time: 420, fleets: 2, lv: 4, goal: 'cut', intel: [0.75, ['events']], supply: 1.2,
    terrain: [stT('nebula', -280, -120, 190), stT('nebula', 300, 40, 170), stT('rock', 0, -60, 65)],
    foes: [['遠征軍後衛', '霍斯特', 'shield', 6, ['wall', 'jam'], 'missile', 0.45, 'ring', 'kite'],
      ['輸送護衛艦隊', '尤里', 'speed', 5, ['charge'], 'balanced', 0.35, 'line', 'push']],
    lines: [[3, '艾琳', '不必擊敗他們。讓他們餓著就夠了。'], [120, '副官', '敵方補給艦隊的位置確認，在主力後方。'], [125, '艾琳', '繞過去。打船團，不要跟主力纏鬥。']],
    after: '遠征軍的補給線被切斷了。霍斯特撤退前說：「帝國那邊，有個比我更會打消耗戰的人。」' },
  '16': { budget: 5200, time: 300, fleets: 2, lv: 5, goal: 'survive', intel: [0.6, ['events']],
    terrain: [stT('rock', -180, 40, 60, 20), stT('rock', 200, -80, 55, -40)],
    foes: [['帝國主力艦隊', '雷恩・瓦爾特', 'dmg', 7, ['focus', 'charge', 'rapid'], 'heavy', 0.45, 'crescent', 'push'],
      ['帝國第三艦隊', '艾琳・索拉', 'shield', 7, ['wall', 'focus'], 'balanced', 0.4, 'line', 'kite', -360],
      ['帝國突擊艦隊', '格倫', 'dmg', 6, ['charge'], 'raider', 0.35, 'wedge', 'flank', 360]],
    ev: [['帝國包圍艦隊', null, 0.25, 'raider', 'wedge', 'left', [90, 140]]],
    lines: [[3, '葛瑞絲', '亞倫，主力交給你了。這個缺口，我來開。'], [7, '亞倫', '（通訊）葛瑞絲，等等——'], [11, '葛瑞絲', '火力集中就是一切。你常說我太衝動……這次就讓我衝一次吧。'], [230, '葛瑞絲', '（通訊）缺口……打開了。快走。'], [280, '通訊官', '葛瑞絲・卡特萊准將的旗艦……失去聯繫。']],
    after: '遠征軍主力從缺口撤了出去。葛瑞絲・卡特萊沒有回來。撤退途中，亞倫一句話也沒有說。' },
  '17': { budget: 5600, time: 480, fleets: 3, lv: 5, intel: [0.7, ['events']], supply: 0.7,
    terrain: [stT('rock', -320, -200, 90, 60), stT('rock', 320, -180, 80, -40), stT('nebula', 0, 60, 180)],
    foes: [['凡德林公爵艦隊', '凡德林公爵', 'shield', 8, ['wall', 'jam'], 'heavy', 0.4, 'ring', 'kite'],
      ['近衛艦隊', '西格', 'dmg', 7, ['focus', 'rapid'], 'balanced', 0.35, 'line', 'push'],
      ['貴族聯合艦隊', '馮・赫特', 'shield', 6, ['wall'], 'carrier', 0.25, 'ring', 'kite']],
    lines: [[3, '雷恩', '打贏這一仗，帝國就只剩下一個聲音。'], [6, '艾琳', '（通訊）那個聲音會是你的。你想清楚了嗎？'], [200, '雷恩', '公爵的旗艦在後面。他從來不站在最前面。']],
    after: '凡德林公爵在旗艦上被捕，帝國的內戰結束了。雷恩回到帝都時，皇帝已經駕崩三天。' },
  '18': { budget: 5600, time: 360, fleets: 3, lv: 5, goal: 'survive', intel: [0.7, ['events']],
    terrain: [stT('rock', 0, 250, 110, 0), stT('asteroid', -320, 0, 170), stT('asteroid', 320, 0, 170)],
    foes: [['帝國主力艦隊', '雷恩・瓦爾特', 'dmg', 8, ['focus', 'charge', 'rapid'], 'heavy', 0.55, 'spindle', 'breakthrough'],
      ['帝國第三艦隊', '艾琳・索拉', 'shield', 8, ['wall', 'focus'], 'missile', 0.45, 'crescent', 'kite'],
      ['帝國突擊艦隊', '格倫', 'dmg', 7, ['charge', 'focus'], 'raider', 0.4, 'wedge', 'flank']],
    ev: [['帝國第二波', null, 0.3, 'balanced', 'line', 'right', [120, 180]]],
    lines: [[3, '亞倫', '我們不需要打贏，只要讓他們打不下來。'], [180, '亞倫', '雷恩・瓦爾特……你也累了吧。']],
    after: '帝國軍在埃吉斯前停下了腳步。雙方都知道，下一戰將決定一切。洛珊自治領宣布：誰贏下這一戰，就歸順誰。' },
  '19e': { budget: 6000, time: 540, fleets: 3, lv: 5, intel: [0.7, ['events']],
    terrain: [stT('nebula', -420, -60, 220, 60), stT('nebula', 420, -60, 220, -60), stT('asteroid', 0, -160, 150), stT('rock', 0, 100, 60)],
    foes: [['聯盟主力艦隊', '亞倫・楊森', 'shield', 10, ['wall', 'jam', 'focus'], 'balanced', 0.45, 'crescent', 'kite'],
      ['聯盟飛彈艦隊', '霍斯特', 'shield', 9, ['wall', 'jam'], 'missile', 0.3, 'line', 'kite', -380],
      ['聯盟機動艦隊', '佩蕾', 'speed', 9, ['charge', 'evade'], 'raider', 0.25, 'column', 'flank', 380]],
    ev: [['聯盟預備艦隊', null, 0.25, 'heavy', 'line', 'left', [150, 220], 0.7]],
    lines: [[3, '雷恩', '亞倫・楊森。我等這一天很久了。'], [7, '艾琳', '（通訊）……你看起來很高興。'], [300, '雷恩', '他在等我犯錯。那我就不犯錯。']],
    after: '亞倫的艦隊撤出了走廊。最後的通訊裡，他說：「你贏了，雷恩。好好對待那些星星上的人。」' },
  '19a': { budget: 6000, time: 540, fleets: 3, lv: 5, intel: [0.7, ['events']],
    terrain: [stT('nebula', -420, -60, 220, 60), stT('nebula', 420, -60, 220, -60), stT('asteroid', 0, -160, 150), stT('rock', 0, 100, 60)],
    foes: [['帝國主力艦隊', '雷恩・瓦爾特', 'dmg', 10, ['focus', 'charge', 'rapid'], 'heavy', 0.45, 'spindle', 'breakthrough'],
      ['帝國第三艦隊', '艾琳・索拉', 'shield', 9, ['wall', 'focus'], 'balanced', 0.3, 'crescent', 'kite', -380],
      ['帝國突擊艦隊', '格倫', 'dmg', 9, ['charge', 'focus'], 'raider', 0.25, 'wedge', 'flank', 380]],
    ev: [['帝國預備艦隊', null, 0.25, 'heavy', 'line', 'right', [150, 220], 0.7]],
    lines: [[3, '亞倫', '他一定會從正面來。……他就是那種人。'], [200, '亞倫', '葛瑞絲，換成妳會怎麼打？……對，火力集中。']],
    after: '雷恩的旗艦在走廊中央停止了反擊，他拒絕了投降勸告。最後的通訊只有一句：「這是很好的一戰，亞倫。」' },
  '20e': { budget: 6000, time: 480, fleets: 3, lv: 5, intel: [0.75, ['events']], supply: 0.6,
    terrain: [stT('rock', -260, -260, 100, 40), stT('rock', 280, -200, 80, -60), stT('nebula', 0, 120, 160)],
    foes: [['首都防衛艦隊', '莫蘭', 'shield', 9, ['wall', 'jam'], 'heavy', 0.45, 'line', 'push'],
      ['議會直屬艦隊', '戈爾', 'dmg', 8, ['focus', 'rapid'], 'carrier', 0.3, 'ring', 'kite'],
      ['赫利昂民兵艦隊', '芙蕾', 'speed', 8, ['charge'], 'balanced', 0.25, 'crescent', 'flank']],
    lines: [[3, '雷恩', '對面的士兵沒有錯。錯的是讓他們站在這裡的人。'], [200, '艾琳', '（通訊）議會在廣播，要全體市民「戰到最後一人」。'], [204, '雷恩', '……那就更要快點結束。']],
    after: '赫利昂的防衛艦隊投降了。薩莫斯議長在議會大廳簽下了降書。' },
  '20a': { budget: 6000, time: 480, fleets: 3, lv: 5, intel: [0.75, ['events']], supply: 0.6,
    terrain: [stT('rock', -260, -260, 100, 40), stT('rock', 280, -200, 80, -60), stT('nebula', 0, 120, 160)],
    foes: [['近衛艦隊', '西格', 'dmg', 9, ['focus', 'rapid', 'charge'], 'heavy', 0.45, 'line', 'push'],
      ['攝政派殘黨', '布勞', 'shield', 8, ['wall'], 'balanced', 0.3, 'crescent', 'kite'],
      ['帝都防衛隊', '霍克', 'speed', 8, ['charge'], 'missile', 0.25, 'crescent', 'flank']],
    lines: [[3, '亞倫', '這裡曾經是他的帝都。……我們只帶走必要的東西。'], [220, '通訊官', '帝國各星區的總督陸續要求通訊！']],
    after: '維斯特拉的軌道上升起了白旗。帝國各星區的總督陸續發出了停戰的通訊。' },
  '21e': { budget: 6000, time: 540, fleets: 3, lv: 5, intel: [0.6, ['events', 'tactic']], supply: 0.6,
    terrain: [stT('rock', 0, -280, 120, 0), stT('asteroid', -340, -40, 170), stT('asteroid', 340, -40, 170)],
    foes: [['赫爾墨斯私兵艦隊', '沃斯總裁', 'dmg', 10, ['focus', 'rapid', 'jam'], 'carrier', 0.4, 'ring', 'kite'],
      ['傭兵艦隊', '賽隆', 'speed', 9, ['charge', 'evade'], 'raider', 0.35, 'wedge', 'flank'],
      ['港口防衛隊', '黛菈', 'shield', 9, ['wall', 'focus'], 'heavy', 0.25, 'line', 'push']],
    ev: [['赫爾墨斯預備艦隊', null, 0.25, 'missile', 'crescent', 'left', [140, 200], 0.8]],
    lines: [[3, '雷恩', '這場戰爭的每一艘船，都有他們的帳。今天把帳結清。'], [250, '沃斯總裁', '（通訊）瓦爾特閣下，我們可以談談。帝國的重建需要資金——'], [254, '雷恩', '關掉通訊。']],
    after: '赫爾墨斯的私兵艦隊潰散，沃斯總裁在港口被捕。' },
  '21a': { budget: 6000, time: 540, fleets: 3, lv: 5, intel: [0.6, ['events', 'tactic']], supply: 0.6,
    terrain: [stT('rock', 0, -280, 120, 0), stT('asteroid', -340, -40, 170), stT('asteroid', 340, -40, 170)],
    foes: [['赫爾墨斯私兵艦隊', '沃斯總裁', 'dmg', 10, ['focus', 'rapid', 'jam'], 'carrier', 0.4, 'ring', 'kite'],
      ['傭兵艦隊', '賽隆', 'speed', 9, ['charge', 'evade'], 'raider', 0.35, 'wedge', 'flank'],
      ['港口防衛隊', '黛菈', 'shield', 9, ['wall', 'focus'], 'heavy', 0.25, 'line', 'push']],
    ev: [['赫爾墨斯預備艦隊', null, 0.25, 'missile', 'crescent', 'right', [140, 200], 0.8]],
    lines: [[3, '亞倫', '葛瑞絲，還有兩邊所有回不了家的人……這一仗是為了他們。'], [250, '沃斯總裁', '（通訊）楊森元帥，聯盟的議會需要我們的資金，您應該很清楚——'], [254, '亞倫', '我很清楚。所以才要在這裡結束。']],
    after: '赫爾墨斯的私兵艦隊潰散，沃斯總裁在港口被捕。' },
};

// 難度：lv＝敵方指揮官等級加減、pow＝敵軍兵力倍數（含增援）、ai＝AI 難度加減（1～5）；存在劇情進度的 diff（序號）
const STORY_DIFF = [
  { key: 'easy', en: 'EASY', name: '簡單', lv: -2, pow: 0.85, ai: -1, desc: '敵方指揮官低 2 級、兵力少 15%、AI 較保守。想輕鬆看劇情就選這個。' },
  { key: 'normal', en: 'NORMAL', name: '普通', lv: 0, pow: 1, ai: 0, desc: '照劇本設計的強度。要讀情報、選陣型，才打得順。' },
  { key: 'hard', en: 'HARD', name: '困難', lv: 2, pow: 1.15, ai: 1, desc: '敵方指揮官高 2 級、兵力多 15%、AI 更會打。給熟悉戰術、指揮官練得夠高的玩家。' },
];
const storyDiffOf = (p) => STORY_DIFF[p && p.diff != null ? p.diff : 1] || STORY_DIFF[1];
// 建議等級：這一關敵方指揮官的平均等級（套用難度）減 1
function storyRec(id, D = storyDiffOf(storyLoad())) {
  const lv = STORY_WAR[id].foes.map((f) => Math.max(1, f[3] + D.lv));
  return Math.max(1, Math.round(lv.reduce((a, b) => a + b, 0) / lv.length) - 1);
}
// 劇情關卡 → 作戰（跟 SCENARIOS 同一個格式，再加上 saga、goal、lines 等劇情欄位）
function storyScenario(id) {
  const s = STORY_BY[id], W = STORY_WAR[id], seq = storySeq(s.route), k = seq.indexOf(id), B = W.budget, D = storyDiffOf(storyLoad());
  const comp = (arch, pow) => {
    const A = CAMP_ARCHETYPES.find((a) => a.key === arch), per = A.mix.reduce((t, m, i) => t + m * SHIP_TYPES[i].cost, 0), n = B * pow * D.pow / per;
    return A.mix.map((m) => Math.round(n * m / 10) * 10);
  };
  const nF = W.foes.length;
  const enemy = W.foes.map(([name, cn, trait, level, skills, arch, pow, formation, tactic, x], i) => ({ name, commander: { name: cn, trait, level: Math.max(1, level + D.lv), skills: skills.slice() },
    comp: comp(arch, pow), formation, tactic, x: x != null ? x : nF === 1 ? 0 : Math.round(-380 + 760 * i / (nF - 1)), y: 0, z: -660 - (i % 2) * 60, h: 0 }));
  const sc = { id: 'story-' + id, saga: true, stageId: id, side: s.side, cast: s.cast.slice(),
    dead: Object.keys(STORY_DEATH).filter((c) => { const d = seq.indexOf(STORY_DEATH[c]); return d >= 0 && d < k; }),
    name: `雙星記・${s.name}`, size: B < 3400 ? '小型' : B < 4800 ? '中型' : '大型', timeLimit: W.time, budget: B, maxFleets: Math.max(W.fleets, s.cast.length), level: Math.max(1, Math.min(5, W.lv + D.ai)), diff: D.key,
    seed: 5000 + k * 37 + (s.route === 'a' ? 7 : 0), terrain: W.terrain || [], enemy, story: s.story,
    events: (W.ev || []).map(([name, cm, pow, arch, formation, edge, at, chance]) => ({ type: 'reinforce', chance: chance == null ? 1 : chance, at, name, comp: comp(arch, pow), formation, edge,
      ...(cm ? { commander: { name: cm[0], trait: cm[1], level: Math.max(1, cm[2] + D.lv), skills: cm[3].slice() } } : {}) })),
    intel: { accuracy: W.intel ? W.intel[0] : 0.8, hide: W.intel ? W.intel[1].slice() : [] },
    enemySupply: W.supply ? { comp: aiSupplyComp(B * W.supply), formation: 'ring', x: enemy[0].x, z: enemy[0].z - 230, h: 0, follow: 0 } : null,
    goal: W.goal ? { type: W.goal, ...(W.vip ? { name: W.vip.name } : {}) } : null, lines: W.lines || null, after: W.after || '', decoy: W.decoy || 0 };
  if (W.enemyFac != null) sc.enemyFac = W.enemyFac;
  if (W.vip) sc.vip = { name: W.vip.name, comp: W.vip.comp.slice(), formation: 'ring', x: 0, z: DEPLOY_ZONE.z1 - 40, h: Math.PI };
  return sc;
}
function storySave(p) { try { STORE.setItem(STORY_STORE, JSON.stringify(p)); } catch (e) { /* 只在本次有效 */ } }
// 下一關（照路線順序；第 18 關之後是選邊，回星圖）
function storyNext(id) { const s = STORY_BY[id], seq = storySeq(s.route || null), k = seq.indexOf(id); return k >= 0 && k + 1 < seq.length ? seq[k + 1] : null; }
function storyLoadout(sc) {
  const n = sc.cast.length;
  return { sc: sc.id, faction: sc.side, fleets: sc.cast.map((cmdr, k) => ({ cmdr, comp: defaultComp(sc.budget / n), formation: 'line', x: n === 1 ? 0 : Math.round(-220 + 440 * k / (n - 1)), z: 300 + ZONE_SHIFT, h: Math.PI })) };
}
function storyGoalRows(sc) {
  const G = sc.goal, min = Math.round(sc.timeLimit / 60), pct = Math.round((1 - ROUT_AT) * 100);
  const rout = `我軍損失超過 ${pct}%（潰走）`, er = `使敵軍損失超過 ${pct}%（潰走）`;
  const T = !G ? ['殲滅敵軍，或' + er, rout, `${min} 分鐘（時間到依雙方損失比例判定）`]
    : G.type === 'survive' ? [`撐過 ${min} 分鐘，或${er}`, rout, `${min} 分鐘（撐到時間就是勝利）`]
    : G.type === 'escort' ? [`保護${G.name}撐過 ${min} 分鐘，或${er}`, `${G.name}損失超過 ${Math.round((1 - VIP_KEEP) * 100)}%，或${rout}`, `${min} 分鐘（${G.name}撐到時間就是勝利）`]
    : [`擊沉敵方所有補給艦，或${er}`, rout, `${min} 分鐘（時間到依雙方損失比例判定）`];
  return `<dt>勝利條件</dt><dd>${T[0]}</dd><dt>敗北條件</dt><dd>${T[1]}</dd><dt>時間限制</dt><dd>${T[2]}</dd>`;
}
// 作戰簡報
function storyBriefing(id) {
  const s = STORY_BY[id], sc = storyScenario(id), ch = STORY_CH[s.ch], side = STORY_SIDE[s.side];
  GAME.sc = sc;
  // 假情報：只看得到第一支艦隊，而且兵力被低估，也看不到增援
  GAME.intel = makeIntel(sc.decoy ? { ...sc, enemy: sc.enemy.slice(0, 1).map((e) => ({ ...e, comp: e.comp.map((n) => Math.round(n * sc.decoy / 10) * 10) })), events: [] } : sc);
  if (!GAME.loadout || GAME.loadout.sc !== sc.id) GAME.loadout = storyLoadout(sc);
  setPhase('briefing');
  const cast = s.cast.map((cid) => { const c = COMMANDERS.find((o) => o.id === cid); return c ? `${c.title} ${c.name}（Lv ${cmdrLevel(c.id)}）` : cid; }).join('、');
  const D = storyDiffOf(storyLoad()), rec = storyRec(id, D);
  const low = s.cast.map((cid) => COMMANDERS.find((o) => o.id === cid)).filter((c) => c && cmdrLevel(c.id) < rec);
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>${s.name}</h2><span class="crumb">雙星記　·　${ch.no}　${ch.name}・第 ${id.replace(/[ea]$/, '')} 關　·　<span class="g-${side.cls}">${side.name}</span>　·　${s.place}　·　難度${D.name}</span><span class="g-sp"></span><button class="g-btn" id="sb-back">← 星圖</button></div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="g-card st-brief ${side.cls}"><h3>狀況</h3><p>${s.story}</p>
        <dl class="kv"><dt>出擊指揮官</dt><dd>${cast}</dd><dt>作戰目標</dt><dd><b>${s.goal}</b></dd>${storyGoalRows(sc)}
        <dt>編成預算</dt><dd>${fmtN(sc.budget)} 點　最多 ${sc.maxFleets} 支艦隊</dd><dt>建議等級</dt><dd>Lv ${rec} 以上（${D.name}）${low.length ? `　<span class="g-warn">${low.map((c) => `${c.name} 只有 Lv ${cmdrLevel(c.id)}`).join('、')}：可以先到無限戰場或隨機戰役練等，或在星圖上調低難度</span>` : '　<span class="g-good">出擊指揮官都達到了</span>'}</dd>
        <dt>情報準確度</dt><dd>${Math.round(GAME.intel.acc * 100)}%${GAME.intel.acc < 0.7 ? '　<span class="g-warn">情報可能有誤</span>' : ''}</dd></dl></div>
      ${briefIntel(sc, GAME.intel)}
      <div class="g-row"><span class="g-sp"></span><button class="g-btn pri" id="sb-next">進入編成 →</button></div>
    </div></div>`);
  gEl('sb-back').onclick = () => showStory();
  gEl('sb-next').onclick = showLoadout;
}
// 打完一場（只在第一次產生戰報時呼叫）：打贏就記進度；第 19 關打贏就鎖定路線
function storyResult(R) {
  const sc = GAME.sc; if (!sc || !sc.saga || GAME.replaying) return;
  if (R.kind !== 'win') return;
  const p = storyLoad(), s = STORY_BY[sc.stageId];
  if (s.route && p.route && p.route !== s.route) return;
  p.done[sc.stageId] = Date.now(); if (s.route) p.route = s.route;
  storySave(p);
}
function storyAfterHTML(R) {
  const s = STORY_BY[GAME.sc.stageId]; if (R.kind !== 'win') return '';
  return `<div class="g-card st-after ${STORY_SIDE[s.side].cls}" style="margin-bottom:12px"><p>${GAME.sc.after}</p>${s.ending ? `<div class="st-end"><b>結局</b><p>${s.ending}</p></div>` : ''}</div>`;
}
function storyAgainLabel(R) { const nx = R.kind === 'win' && storyNext(GAME.sc.stageId); return R.kind !== 'win' ? '重打這一關（回到編成）' : nx ? `下一場作戰：${STORY_BY[nx].name} →` : '回到星圖 →'; }
function storyAgain(R) {
  if (R.kind !== 'win') { showLoadout(); return; }
  const nx = storyNext(GAME.sc.stageId);
  if (nx) storyBriefing(nx); else { if (GAME.storyView) GAME.storyView.sel = null; showStory(); }
}
// 戰鬥中的通訊台詞（gameTick 每 30 tick 叫一次）
function storyLines(t) {
  const L = battleSetup.lines;
  while ((GAME.lineK || 0) < L.length && L[GAME.lineK || 0][0] <= t) { const [, who, msg] = L[GAME.lineK || 0]; GAME.lineK = (GAME.lineK || 0) + 1; toast(`${who}：${msg}`, 'story'); }
}
// 測試用：直接把進度設成打完前 n 場（console：__demo.storyUnlock(18) 或 __demo.storyUnlock(20, 'a')）
function storyUnlock(n, route = 'e') { const done = {}; storySeq(route).slice(0, n).forEach((id) => { done[id] = Date.now(); }); storySave({ done, route: n > 18 ? route : null, diff: storyLoad().diff }); if (GAME.storyView) GAME.storyView.sel = null; }
