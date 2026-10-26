// ═══════════════════════ 劇情戰役〈雙星記〉：星圖選關（每一關的戰鬥資料在 story_war.js） ═══════════════════════
// 兩條獨立的篇章：進劇情時選帝國篇（line 'e'）或聯盟篇（line 'a'），玩家從頭到尾只操作同一個陣營，結局跟著陣營走
// 原本屬於對方視角的關卡改成「同一場戰役的另一邊」（鏡像關，id 加 e／a 後綴）；對方的劇情用簡報裡的幕間（inter）交代
// 星圖座標：viewBox 1600×900；西邊帝國、東邊聯盟，中間是暗黑星雲帶（阿刻戎走廊從中間穿過），南邊是洛珊自治領
const STORY_STORE = 'fleet.story';
const STORY_CH = [
  { no: '序章', name: '邊境' }, { no: '第一章', name: '星雲' }, { no: '第二章', name: '要塞' },
  { no: '第三章', name: '停戰' }, { no: '第四章', name: '遠征' }, { no: '終章', name: '雙星' },
];
const STORY_SIDE = [{ name: '帝國軍', cls: 'emp' }, { name: '聯盟軍', cls: 'all' }, { name: '灰鴉傭兵團', cls: 'mer' }];
const STORY_LINE = {
  e: { side: 0, name: '帝國篇', ending: '新王朝', cast: '雷恩・瓦爾特、艾琳・索拉、卡斯・莫德',
    blurb: '平民出身的天才雷恩，在貴族的猜忌與攝政派的陰謀之間，一路打到帝國的頂點。' },
  a: { side: 1, name: '聯盟篇', ending: '共和之星', cast: '亞倫・楊森、葛瑞絲・卡特萊',
    blurb: '不想打仗的名將亞倫，替腐敗的議會守住共和國，也替戰友們把帳算清。' },
  m: { side: 2, name: '番外・雙星之外', ending: '雙星之外', cast: '賽隆、「鏽牙」杜蘭、「快手」莎夏、「鐵顎」柯爾', extra: true,
    blurb: '帝國和聯盟都雇用過他們，也都追殺過他們。收錢辦事的灰鴉傭兵團，看見了這場戰爭帳本的另一面。',
    note: '番外篇的前半段跟主線第一、二章的事件（包括灰鴉的支線）是同一批事件，後半段會揭露主線第三章以後的內幕。沒玩過主線也能直接玩，但建議先玩過主線的第一、二章。' },
};
// 番外篇的 {V}：贏得戰爭的一方（玩家打過的結局；兩個都打過就看最近的那一個，都沒打過就是「新政府」）
function storyVictor() { const p = storyLoad(), e = p.done['21e'] || 0, a = p.done['21a'] || 0; return !e && !a ? '新政府' : e >= a ? '帝國' : '聯盟'; }
const storyText = (t) => (t ? t.split('{V}').join(storyVictor()) : t);
// 地標（不是關卡）：首都、要塞
const STORY_MARKS = [
  { name: '維斯特拉', sub: '奧瑞利安帝國　帝都', x: 150, y: 455, side: 0, kind: 'capital', lp: 'up' },
  { name: '赫利昂', sub: '自由星系聯盟　首都', x: 1460, y: 480, side: 1, kind: 'capital', lp: 'up' },
  { name: '洛珊', sub: '洛珊自治領　首府', x: 850, y: 840, side: 2, kind: 'capital', lp: 'right' },
  { name: '埃吉斯要塞', sub: '走廊的帝國側出口', x: 590, y: 380, side: 0, kind: 'fortress', flip: ['9', '9e'], lp: 'down' },   // 第 9 關後歸聯盟
];
// inter：幕間（簡報最前面的「與此同時」，交代對方陣營的動向）；joins：打完這一關後加入的指揮官（STORY_CMDRS）
const STORY_STAGES = [
  // ── 帝國篇 ──
  { id: '1', ch: 0, line: 'e', name: '邊境遭遇戰', place: '塞伊邊境星域', x: 740, y: 150, cast: ['rein'], goal: '擊退敵軍巡邏隊',
    story: '塞伊邊境的例行巡邏撞上了聯盟的巡邏隊。對方規模不大，但這是三年來兩國第一次交火。' },
  { id: '2e', ch: 0, line: 'e', name: '追擊', place: '塞伊邊境星域', x: 910, y: 180, cast: ['rein'], goal: '在時限內盡量重創撤退的敵軍',
    story: '巴爾克的巡邏隊潰走後，聯盟派來另一支艦隊收攏殘部。雷恩接到追擊令。對方撤得太有秩序了。' },
  { id: '4', ch: 1, line: 'e', name: '星雲中的砲火', place: '紫晶星雲', x: 790, y: 280, cast: ['erin'], goal: '突破伏擊',
    story: '艾琳的艦隊奉命穿越紫晶星雲。情報說前方沒有敵人，但情報並不完整。',
    inter: '聯盟議會的選舉將近，薩莫斯議長需要一場勝利。前線收到的命令只有一句：「不惜代價。」' },
  { id: '5', ch: 1, line: 'e', name: '無人護航', place: '卡德倫星系', x: 440, y: 250, cast: ['kas'], goal: '護送補給艦隊抵達',
    story: '前線缺補給，司令部卻不派護衛。卡斯只能用自己的艦隊護送補給船團。' },
  { id: '8', ch: 2, line: 'e', name: '遲來的援軍', place: '埃吉斯後方', x: 470, y: 450, cast: ['rein'], goal: '援軍突入戰場',
    story: '雷恩帶援軍趕往埃吉斯，要塞司令卻拒絕開放航道。他是凡德林公爵的人。',
    inter: '聯盟的消耗戰專家霍斯特在費茲星系不斷擴大戰果。亞倫・楊森奉議長之命，限期十天拿下埃吉斯。要塞外圍的前哨站已經失守。' },
  { id: '9e', ch: 2, line: 'e', name: '埃吉斯陷落', place: '埃吉斯要塞', x: 680, y: 380, cast: ['rein'], goal: '接應守軍撤出（撐到時限）',
    story: '聯盟發動總攻，要塞的防衛網突然沉默。司令終於開放航道向雷恩求援，可是已經太遲了。雷恩決定接應守軍撤出。' },
  { id: '10', ch: 2, line: 'e', name: '殿後', place: '歐倫星系', x: 420, y: 560, cast: ['rein', 'kas'], goal: '讓主力撤出戰場',
    story: '埃吉斯失守，帝國艦隊全面撤退。總要有人留下來擋住追兵。' },
  { id: '11', ch: 3, merc: true, line: 'e', name: '和平的使者', place: '洛珊航道', x: 570, y: 700, cast: ['erin'], goal: '護送使節艦',
    story: '兩國同意在洛珊舉行停戰談判。艾琳負責護送帝國使節艦，沿途出現身分不明的艦隊。',
    inter: '埃吉斯陷落，聯盟舉國歡騰，亞倫被授予元帥軍銜。然而兩國的國庫都已見底，洛珊的銀行家開始催討債務。' },
  { id: '12e', ch: 3, merc: true, line: 'e', name: '破局', place: '洛珊港外', x: 960, y: 760, cast: ['erin'], goal: '擊破襲擊艦隊，帶回證據',
    story: '談判前夕，帝國使節艦在洛珊港外遇襲。港口管制說附近只有一支聯盟的小艦隊。艾琳不相信。' },
  { id: '13', ch: 3, line: 'e', name: '同室操戈', place: '布雷克星系', x: 300, y: 230, cast: ['rein', 'erin'], goal: '擊破格倫的艦隊', joins: ['glen'],
    story: '艾琳帶回的殘骸說出了襲擊的主使：凡德林公爵與赫爾墨斯軍需集團。攝政派宣布雷恩叛國，帝國內戰爆發。',
    inter: '聯盟那邊，亞倫的戰前情報也被證實是假的。兩國互指對方背信，談判就此破局。' },
  { id: '14e', ch: 4, line: 'e', name: '遠征令', place: '涅瓦星系', x: 500, y: 330, cast: ['erin', 'glen'], goal: '拖住遠征軍（撐到時限）',
    story: '雷恩還在帝都對付攝政派，聯盟遠征軍就穿過了埃吉斯。艾琳和剛投誠的格倫奉命拖住他們。',
    inter: '聯盟議會趁帝國內戰通過了遠征案。亞倫・楊森投下反對票，然後率領艦隊穿過埃吉斯。' },
  { id: '15', ch: 4, line: 'e', name: '焦土', place: '希瑟星系', x: 360, y: 400, cast: ['erin'], goal: '截斷敵軍補給線',
    story: '艾琳撤走了每一座補給站。遠征軍越是深入，離自己的補給就越遠。' },
  { id: '16e', ch: 4, line: 'e', name: '紡錘的尖端', place: '塔斯星系', x: 270, y: 560, cast: ['rein', 'erin', 'glen'], goal: '殲滅被包圍的遠征軍',
    story: '補給斷絕的遠征軍在塔斯星系陷入包圍。雷恩把攝政派暫時交給盟友牽制，親自趕來收緊包圍網。' },
  { id: '17', ch: 5, line: 'e', name: '攝政的黃昏', place: '維斯特拉近郊', x: 180, y: 320, cast: ['rein'], goal: '殲滅攝政派艦隊',
    story: '凡德林公爵的艦隊退守帝都外圍。打贏這一仗，帝國就只剩下一個聲音。',
    inter: '葛瑞絲・卡特萊戰死的消息傳回赫利昂。議會追封她為上將，然後在同一場會議裡，追加了下一年度的軍費。' },
  { id: '18e', ch: 5, line: 'e', name: '叩關', place: '埃吉斯要塞', x: 670, y: 315, cast: ['rein', 'erin', 'glen'], goal: '重創埃吉斯守軍',
    story: '內戰結束了。雷恩以帝國唯一的聲音下令：奪回埃吉斯。要塞後面，是亞倫・楊森。',
    inter: '遠征軍殘部退回埃吉斯。亞倫把葛瑞絲的座位留著，誰也不准坐。' },
  { id: '19e', ch: 5, line: 'e', name: '雙星', place: '阿刻戎走廊', x: 800, y: 420, cast: ['rein', 'erin', 'glen'], goal: '擊敗亞倫的艦隊',
    story: '洛珊宣布：誰贏下這一戰，洛珊就歸順誰。雷恩親率全軍進入阿刻戎走廊，對面是他唯一承認的對手。',
    inter: '聯盟議會把最後的希望交給了亞倫。他接下命令時只說了一句：「這是最後一次。」' },
  { id: '20e', ch: 5, line: 'e', name: '赫利昂之門', place: '赫利昂', x: 1350, y: 395, cast: ['rein', 'erin', 'glen'], goal: '擊破首都防衛艦隊',
    story: '走廊已經打通，前方就是聯盟首都。議會集結了最後的防衛艦隊。' },
  { id: '21e', ch: 5, merc: true, line: 'e', name: '新王朝', place: '洛珊', x: 760, y: 800, cast: ['rein', 'erin', 'glen'], goal: '擊潰赫爾墨斯私兵艦隊',
    story: '赫爾墨斯軍需集團不打算交出洛珊，私兵艦隊封鎖了港口。這是這場戰爭的最後一筆帳。',
    ending: '洛珊歸順，聯盟議會投降。雷恩登基，奧瑞利安帝國統治了約八成五的人類星域。共和制度從此成為歷史。' },
  // ── 聯盟篇 ──
  { id: '2', ch: 0, line: 'a', name: '撤出塞伊', place: '塞伊邊境星域', x: 910, y: 180, cast: ['aaron'], goal: '撐到撤離時限（存活即過關）',
    story: '塞伊邊境的巡邏隊撞上了帝國艦隊，巴爾克的巡邏隊被打散。亞倫奉命收攏殘部撤回本國，帝國的追兵已經在路上。' },
  { id: '3', ch: 1, line: 'a', name: '紫晶的獵人', place: '紫晶星雲', x: 880, y: 300, cast: ['grace'], goal: '伏擊並殲滅帝國艦隊', joins: ['pele'],
    story: '議會要一場勝利。葛瑞絲和佩蕾在紫晶星雲兩側布下伏兵，等帝國艦隊自己走進來。',
    inter: '塞伊的衝突之後，帝國軍裡多了一個名字：雷恩・瓦爾特。平民出身，貴族們私下叫他「棄子」。' },
  { id: '5a', ch: 1, line: 'a', name: '截斷補給', place: '卡德倫星系', x: 440, y: 250, cast: ['pele'], goal: '擊沉敵方補給船團',
    story: '帝國前線缺補給，司令部卻只派一支機動艦隊護送船團。佩蕾接到命令：讓那些船到不了前線。' },
  { id: '6', ch: 1, line: 'a', name: '數字的戰爭', place: '費茲星系', x: 1090, y: 330, cast: ['aaron'], goal: '在時限內維持戰損比', joins: ['horst'],
    story: '霍斯特的消耗戰打得漂亮，戰報上的擊沉數每天都在增加。亞倫開始懷疑，這些數字是打給誰看的。' },
  { id: '7', ch: 2, line: 'a', name: '要塞前哨', place: '埃吉斯外圍', x: 690, y: 480, cast: ['aaron'], goal: '突破前哨站',
    story: '薩莫斯議長限期十天拿下埃吉斯。第一步是要塞外圍的前哨站，守將是奧德。' },
  { id: '8a', ch: 2, line: 'a', name: '包圍網', place: '埃吉斯後方', x: 470, y: 450, cast: ['grace', 'horst'], goal: '擋住帝國援軍（撐到時限）',
    story: '亞倫在埃吉斯正面準備總攻，葛瑞絲和霍斯特負責後方的包圍網。偵察回報：一支帝國援軍正全速趕來。' },
  { id: '9', ch: 2, line: 'a', name: '埃吉斯陷落', place: '埃吉斯要塞', x: 680, y: 380, cast: ['aaron', 'grace'], goal: '攻陷要塞',
    story: '正面強攻只會白白送死。亞倫決定用干擾癱瘓要塞的防衛網。',
    inter: '帝國的援軍被要塞司令擋在門外。司令是凡德林公爵的人，他寧可要塞陷落，也不願讓平民出身的將領立功。' },
  { id: '10a', ch: 2, line: 'a', name: '追擊', place: '歐倫星系', x: 420, y: 560, cast: ['aaron', 'grace'], goal: '擊破帝國殿後艦隊',
    story: '埃吉斯陷落，帝國艦隊全面撤退。議會下令追擊，但擋在後面的殿後艦隊遲遲不肯退。' },
  { id: '11a', ch: 3, merc: true, line: 'a', name: '和平的使者', place: '洛珊航道', x: 1130, y: 640, cast: ['grace'], goal: '護送使節艦',
    story: '兩國同意在洛珊舉行停戰談判。葛瑞絲不贊成停戰，但還是接下了護送聯盟使節的任務。航道上出現了沒有識別信號的艦隊。',
    inter: '帝國的殿後指揮官卡斯・莫德沒有回來。據說雷恩在艦橋上為他留了一個空位。' },
  { id: '12', ch: 3, merc: true, line: 'a', name: '破局', place: '洛珊港外', x: 960, y: 760, cast: ['aaron'], goal: '突圍脫出',
    story: '使節艦在洛珊港外遇襲，兩國互指對方背信。亞倫手上的戰前情報，從一開始就是假的。' },
  { id: '14', ch: 4, line: 'a', name: '遠征令', place: '涅瓦星系', x: 500, y: 330, cast: ['aaron', 'grace'], goal: '擊退帝國守軍',
    story: '帝國內戰正酣，議會通過遠征案。亞倫投了反對票，然後率艦隊穿過埃吉斯。',
    inter: '襲擊使節艦的主使曝光：帝國攝政派的凡德林公爵與赫爾墨斯軍需集團。攝政派宣布雷恩叛國，帝國內戰爆發。猛將格倫戰敗後，帶著艦隊加入了雷恩。' },
  { id: '15a', ch: 4, line: 'a', name: '補給線', place: '希瑟星系', x: 360, y: 400, cast: ['horst'], goal: '護送補給船團',
    story: '遠征軍越深入，補給線就拉得越長，沿途的補給站全被帝國撤空了。霍斯特親自押送下一批船團。' },
  { id: '16', ch: 4, line: 'a', name: '紡錘的尖端', place: '塔斯星系', x: 270, y: 560, cast: ['grace'], goal: '撕開包圍網',
    story: '遠征軍陷入包圍。葛瑞絲請命率突擊艦隊，從正面撕開一道缺口。' },
  { id: '18', ch: 5, line: 'a', name: '最後的防線', place: '埃吉斯要塞', x: 670, y: 315, cast: ['aaron', 'horst', 'pele'], goal: '守住要塞',
    story: '遠征失敗，帝國大軍正逼近埃吉斯。亞倫要守住聯盟唯一的門戶。',
    inter: '凡德林公爵在帝都外圍被捕，帝國內戰結束。雷恩回到帝都時，皇帝已經駕崩三天。帝國現在只剩下一個聲音。' },
  { id: '19a', ch: 5, line: 'a', name: '雙星', place: '阿刻戎走廊', x: 800, y: 420, cast: ['aaron', 'horst', 'pele'], goal: '擊敗雷恩的艦隊',
    story: '洛珊宣布：誰贏下這一戰，洛珊就歸順誰。亞倫在走廊裡等著，他知道雷恩一定會親自來。',
    inter: '雷恩・瓦爾特拒絕了所有的停戰提議。他對部下說：「這一仗，我要親自去。」' },
  { id: '20a', ch: 5, line: 'a', name: '帝都陷落', place: '維斯特拉', x: 210, y: 470, cast: ['aaron', 'horst', 'pele'], goal: '擊破近衛艦隊',
    story: '聯盟艦隊第一次看見帝都的天空。近衛艦隊和攝政派殘黨在軌道上列陣。' },
  { id: '21a', ch: 5, merc: true, line: 'a', name: '共和之星', place: '洛珊', x: 760, y: 800, cast: ['aaron', 'horst', 'pele'], goal: '擊潰赫爾墨斯私兵艦隊',
    story: '赫爾墨斯軍需集團不打算交出洛珊，私兵艦隊封鎖了港口。這是這場戰爭的最後一筆帳。',
    ending: '洛珊與帝國各星區以加盟國的身分併入聯盟，自由星系聯盟擁有約八成五的人類星域。議會依然腐敗，而亞倫成了不得不從政的英雄。' },
  // ── 番外篇〈雙星之外〉：灰鴉傭兵團（玩家是傭兵陣營）。when＝對應主線的時間點；{V}＝贏得戰爭的一方（看玩家打過的結局）──
  { id: 'm1', ch: 1, merc: true, line: 'm', name: '鏽色的生意', place: '卡德倫星系', x: 340, y: 170, cast: ['ceron', 'duran'], goal: '擊沉帝國的補給船團',
    when: '主線第一章〈無人護航〉前後，支線〈鏽色的海盜〉的另一邊',
    story: '一筆來自洛珊的匿名訂單：劫掠帝國的補給線，但要打扮成海盜。賽隆把灰鴉的旗子收了起來。',
    inter: '帝國前線缺補給，司令部卻不派護衛。帝國的補給船團只能自己上路。' },
  { id: 'm2', ch: 1, merc: true, line: 'm', name: '價碼', place: '費茲外緣', x: 1200, y: 240, cast: ['ceron'], goal: '倒戈之後撐到時限',
    when: '主線第一章〈數字的戰爭〉之後，支線〈價碼〉的另一邊',
    story: '聯盟議會雇用灰鴉協同作戰，帶隊的是葛瑞絲・卡特萊准將。開戰前，賽隆收到洛珊的加密頻道：價錢待會兒再談。' },
  { id: 'm3', ch: 1, merc: true, line: 'm', name: '巢穴', place: '暗黑星雲北段', x: 690, y: 232, cast: ['ceron', 'kol'], goal: '守住巢穴，讓補給船全部出港（撐到時限）',
    when: '主線第一章的尾聲，支線〈渡鴉之巢〉的另一邊',
    story: '帝國的卡斯・莫德順著補給船找到了灰鴉的巢穴。巢穴守不住，但灰鴉的家當都還在港裡。' },
  { id: 'm4', ch: 3, merc: true, line: 'm', name: '無名的艦隊', place: '洛珊航道', x: 570, y: 700, cast: ['ceron', 'sasha'], goal: '重創護衛艦隊，然後撤走',
    when: '主線第三章〈和平的使者〉',
    story: '兩國要在洛珊停戰談判。新的訂單寫著：讓帝國的使節艦「遇到一點麻煩」。識別信號全關，今天的灰鴉沒有名字。',
    inter: '埃吉斯要塞陷落，帝國艦隊撤出了歐倫星系。兩國的國庫都見了底，停戰談判終於排上了日程。' },
  { id: 'm5', ch: 3, merc: true, line: 'm', name: '破局', place: '洛珊港外', x: 960, y: 760, cast: ['ceron', 'duran'], goal: '擊退亞倫的艦隊',
    when: '主線第三章〈破局〉',
    story: '假情報已經送到亞倫・楊森手上：港外只有一支小型艦隊。雇主還派來一支掛著帝國識別碼的「友軍」，一起等他進來。' },
  { id: 'm6', ch: 4, merc: true, line: 'm', name: '滅口', place: '暗黑星雲南段', x: 820, y: 560, cast: ['ceron', 'duran', 'kol'], goal: '從獵殺中脫身（撐到時限）',
    when: '主線第四章到終章之間',
    story: '赫爾墨斯約灰鴉在星雲南段交接最後一筆款項。來的不是運鈔船，是赫爾墨斯自己的私兵艦隊。',
    inter: '帝國的內戰結束了，聯盟的遠征也失敗了。戰爭接近尾聲，打贏的一方遲早會追查：是誰讓這場仗打了這麼久。' },
  { id: 'm7', ch: 5, merc: true, line: 'm', name: '最後一筆帳', place: '洛珊', x: 760, y: 800, cast: ['ceron', 'duran', 'sasha'], goal: '擊潰赫爾墨斯私兵艦隊',
    when: '主線最後一關〈新王朝〉／〈共和之星〉',
    story: '{V}的艦隊封鎖了洛珊。沃斯總裁要灰鴉守在最前面當擋箭牌。賽隆接下了命令，然後把砲口轉了過去。',
    inter: '阿刻戎走廊的決戰分出了勝負。{V}的大軍南下，赫爾墨斯軍需集團是最後一個不肯低頭的對手。' },
  { id: 'm8', ch: 5, merc: true, line: 'm', name: '雙星之外', place: '星圖邊緣・未知星域', x: 1480, y: 830, cast: ['ceron', 'sasha', 'kol'], goal: '跟杜蘭會合，撐到時限',
    when: '主線結局之後',
    story: '灰鴉的一半成了{V}的傭兵編隊，另一半跟著杜蘭當了宇宙海盜。第一份任務就是追捕杜蘭。賽隆追著他的訊號，一路追出了星圖。',
    inter: '戰爭結束了。{V}的星圖上，人類星域第一次只剩下一種顏色。',
    ending: '帝國與聯盟的戰爭結束了，人類以為星空終於屬於自己。灰鴉的一半成了{V}的傭兵編隊，另一半成了被通緝的宇宙海盜。而在星圖的邊緣，那些沒有活人的船，還在朝這裡航行。' },
  // ── 支線：灰鴉傭兵團（第一章；不打也能繼續主線）。req＝要先打完的關、at＝劇情時間點（在哪一關之後：決定誰已經退場）、merc＝跟傭兵有關的任務 ──
  { id: 's1', sub: true, merc: true, req: ['5'], at: '5', ch: 1, line: 'e', name: '鏽色的海盜', place: '卡德倫外緣', x: 340, y: 170, cast: ['kas'], goal: '擊退海盜艦隊',
    story: '卡德倫的補給線接連被「海盜」劫掠。卡斯追了上去，才發現對方的陣形和裝備都不像海盜。',
    reward: '第一次打完跟傭兵有關的任務：星際酒館開始出現灰鴉傭兵團的指揮官（兩個陣營都能派）。' },
  { id: 's3', sub: true, merc: true, req: ['s1'], at: '5', ch: 1, line: 'e', name: '渡鴉之巢', place: '暗黑星雲北段', x: 690, y: 232, cast: ['kas'], goal: '攻陷傭兵基地',
    story: '卡斯追蹤灰鴉的補給船，找到了他們藏在暗黑星雲裡的基地。聯盟那邊，似乎也有人在找他們。',
    reward: '解鎖「傭兵支援」：之後每場戰鬥可以花功勳呼叫一次灰鴉的艦隊。' },
  { id: 's2', sub: true, merc: true, req: ['6'], at: '6', ch: 1, line: 'a', name: '價碼', place: '費茲外緣', x: 1200, y: 240, cast: ['grace'], goal: '撐過灰鴉的背叛',
    story: '議會為了戰果，雇用「灰鴉傭兵團」協同作戰。葛瑞絲不喜歡這個安排，但命令就是命令。',
    reward: '第一次打完跟傭兵有關的任務：星際酒館開始出現灰鴉傭兵團的指揮官（兩個陣營都能派）。' },
  { id: 's3a', sub: true, merc: true, req: ['s2'], at: '6', ch: 1, line: 'a', name: '渡鴉之巢', place: '暗黑星雲北段', x: 740, y: 220, cast: ['grace'], goal: '攻陷傭兵基地',
    story: '葛瑞絲沒有忘記賽隆。她順著付款帳戶的線索，找到了灰鴉藏在暗黑星雲裡的基地。帝國那邊，似乎也有人在找他們。',
    reward: '解鎖「傭兵支援」：之後每場戰鬥可以花功勳呼叫一次灰鴉的艦隊。' },
];
STORY_STAGES.forEach((s) => { s.side = STORY_LINE[s.line].side; });
const STORY_BY = Object.fromEntries(STORY_STAGES.map((s) => [s.id, s]));
const STORY_SUBS = STORY_STAGES.filter((s) => s.sub);
// 主線的關卡順序（照 STORY_STAGES 的排列）
const STORY_SEQ = Object.fromEntries(Object.keys(STORY_LINE).map((k) => [k, STORY_STAGES.filter((s) => s.line === k && !s.sub).map((s) => s.id)]));
const storySeq = (line) => STORY_SEQ[line] || STORY_SEQ.e;
const storyLineOf = (p) => (p && STORY_LINE[p.line] ? p.line : 'e');
// 星圖上的節點與航線：只畫目前篇章的關卡
const storyNodes = (line) => storySeq(line).map((id) => ({ key: id, ids: [id] })).concat(STORY_SUBS.filter((s) => s.line === line).map((s) => ({ key: s.id, ids: [s.id], sub: true })));
const storyLinks = (line) => { const q = storySeq(line); return q.slice(1).map((id, k) => [q[k], id]).concat(STORY_SUBS.filter((s) => s.line === line).flatMap((s) => s.req.map((r) => [r, s.id]))); };
const storyNo = (s) => (s.sub ? '支線' : `第 ${storySeq(s.line).indexOf(s.id) + 1} 關`);
const storyCount = (p, line) => storySeq(line).filter((id) => p.done[id]).length;

function storyLoad() { let p = null; try { p = JSON.parse(STORE.getItem(STORY_STORE) || 'null'); } catch (e) { p = null; } return p && p.done ? p : { done: {}, line: null }; }
// 每一關的狀態：done 已完成、avail 可以打、locked 還沒開放
function storyState(p, id) {
  const s = STORY_BY[id];
  if (p.done[id]) return 'done';
  if (s.sub) return s.req.every((x) => p.done[x]) ? 'avail' : 'locked';   // 支線：前置關卡都打完就開放
  const seq = storySeq(s.line), k = seq.indexOf(id);
  return seq.slice(0, k).every((x) => p.done[x]) ? 'avail' : 'locked';
}
const storyNodeStage = (p, node) => STORY_BY[node.ids[0]];
const storyNodeState = (p, node) => storyState(p, node.ids[0]);
const storyPos = (key) => { const s = STORY_BY[key]; return [s.x, s.y]; };

// ───── 星圖（SVG） ─────
function storyMapSVG(p, sel) {
  const R = mulberry32(20261020), line = storyLineOf(p), ended = p.done['21' + line] ? STORY_LINE[line].side : -1;
  const stars = Array.from({ length: 260 }, () => `<circle cx="${(R() * 1600).toFixed(0)}" cy="${(R() * 900).toFixed(0)}" r="${(0.4 + R() * R() * 1.6).toFixed(2)}" opacity="${(0.25 + R() * 0.6).toFixed(2)}"/>`).join('');
  // 勢力範圍：結局後輸的一方染成贏家的顏色
  const terrCol = (side) => (ended >= 0 && side !== ended ? STORY_SIDE[ended].cls : ['emp', 'all', 'neu'][side]);
  const blobs = [[0, 300, 430, 420, 400], [1, 1310, 450, 400, 380], [2, 830, 860, 330, 130]]
    .map(([side, x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#stg-${terrCol(side)})"/>`).join('');
  // 暗黑星雲帶：北、南兩段，中間留出阿刻戎走廊
  const dust = (R2) => Array.from({ length: 16 }, (_, k) => {
    const north = k < 8, y = north ? 215 + R2() * 135 : 470 + R2() * 170;
    return `<ellipse cx="${(700 + R2() * 200).toFixed(0)}" cy="${y.toFixed(0)}" rx="${(60 + R2() * 70).toFixed(0)}" ry="${(40 + R2() * 50).toFixed(0)}"/>`;
  }).join('');
  const regions = [['奧瑞利安帝國', 300, 120, 'emp'], ['自由星系聯盟', 1310, 140, 'all'], ['洛珊自治領', 1260, 860, 'neu'], ['暗黑星雲帶', 800, 640, 'dust']]
    .map(([t, x, y, c]) => `<text class="st-region ${c}" x="${x}" y="${y}">${t}</text>`).join('');
  const marks = STORY_MARKS.map((m) => {
    const side = m.flip && m.flip.some((id) => p.done[id]) ? 1 : ended >= 0 && m.side < 2 ? ended : m.side, c = ['emp', 'all', 'neu'][side];
    const icon = m.kind === 'fortress' ? `<path class="st-mk ${c}" d="M${m.x} ${m.y - 16}l14 8v16l-14 8l-14-8v-16z"/>`
      : `<circle class="st-mk ${c}" cx="${m.x}" cy="${m.y}" r="12"/><circle class="st-mk-c ${c}" cx="${m.x}" cy="${m.y}" r="5"/>`;
    const [dx, dy, an] = { up: [0, -44, 'middle'], down: [0, 40, 'middle'], right: [22, -2, 'start'], left: [-22, -2, 'end'] }[m.lp];
    return `<g class="st-mark" text-anchor="${an}">${icon}<text class="st-mk-t" x="${m.x + dx}" y="${m.y + dy}">${m.name}</text><text class="st-mk-s" x="${m.x + dx}" y="${m.y + dy + 19}">${m.sub}</text></g>`;
  }).join('');
  // 航線：依目的地的狀態畫實線（已走過）、亮虛線（下一步）、淡虛線（未來）
  const NODES = storyNodes(line);
  const links = storyLinks(line).map(([a, b]) => {
    const nb = NODES.find((o) => o.key === b), st = storyNodeState(p, nb), s = storyNodeStage(p, nb);
    const c = STORY_SIDE[s.side].cls, [x1, y1] = storyPos(a), [x2, y2] = storyPos(b);
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2 - (x2 - x1) * 0.12;   // 稍微彎曲
    return `<path class="st-link ${st} ${c} ${nb.sub ? 'sub' : ''}" d="M${x1} ${y1}Q${mx.toFixed(0)} ${my.toFixed(0)} ${x2} ${y2}"/>`;
  }).join('');
  const nodes = NODES.map((n) => {
    const s = storyNodeStage(p, n), st = storyNodeState(p, n), [x, y] = storyPos(n.key);
    const c = STORY_SIDE[s.side].cls, label = st === 'locked' ? '' : s.name;
    const no = n.sub ? '支' : storySeq(line).indexOf(n.key) + 1, r = n.sub ? 16 : 22;   // 支線：小一號的節點
    return `<g class="st-node ${st} ${c} ${n.sub ? 'sub' : ''} ${sel === n.key ? 'sel' : ''}" data-k="${n.key}" transform="translate(${x} ${y})" tabindex="0">
      <circle class="st-hit" r="34"/>${st === 'avail' ? `<circle class="st-pulse" r="${r}"/>` : ''}
      <circle class="st-ring" r="${r}"/><circle class="st-core" r="${r - 5}"/>
      <text class="st-no" y="6">${st === 'done' ? '✓' : no}</text>
      ${label ? `<text class="st-lb" y="${r + 26}">${label}</text>` : ''}</g>`;
  }).join('');
  return `<svg class="st-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" role="img" aria-label="雙星記星圖">
    <defs>
      <radialGradient id="stg-emp"><stop offset="0" stop-color="#f2b35a" stop-opacity=".16"/><stop offset="1" stop-color="#f2b35a" stop-opacity="0"/></radialGradient>
      <radialGradient id="stg-all"><stop offset="0" stop-color="#7cc4ff" stop-opacity=".16"/><stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="stg-neu"><stop offset="0" stop-color="#8fd9b6" stop-opacity=".15"/><stop offset="1" stop-color="#8fd9b6" stop-opacity="0"/></radialGradient>
      <radialGradient id="stg-ame"><stop offset="0" stop-color="#b48cff" stop-opacity=".35"/><stop offset="1" stop-color="#b48cff" stop-opacity="0"/></radialGradient>
      <filter id="stf-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
    </defs>
    <g class="st-stars">${stars}</g>
    ${blobs}
    <g class="st-dust2" filter="url(#stf-blur)">${dust(mulberry32(11))}</g>
    <g class="st-dust" filter="url(#stf-blur)">${dust(mulberry32(7))}</g>
    <ellipse cx="835" cy="290" rx="120" ry="80" fill="url(#stg-ame)"/>
    <path class="st-lane" d="M590 380C680 395 720 430 800 420S940 400 1010 410"/><text class="st-lane-t" x="920" y="455">阿刻戎走廊</text>
    <path class="st-lane" d="M470 560C520 690 660 790 830 820S1100 720 1180 560"/><text class="st-lane-t" x="1110" y="700">洛珊航道</text>
    ${regions}${links}${marks}${nodes}
  </svg>`;
}

// ───── 畫面 ─────
function storyPanel(p, key) {
  const s = STORY_BY[key];
  if (!s || s.line !== storyLineOf(p)) return `<div class="st-panel g-card"><div class="g-dim">點選星圖上的星系查看作戰。</div></div>`;
  const st = storyState(p, s.id);
  const side = STORY_SIDE[s.side], ch = STORY_CH[s.ch], open = st !== 'locked';
  const cast = s.cast.map((id) => { const c = storyCmdrDef(id); return c ? `${c.title} ${c.name}` : id; }).join('、');
  return `<div class="st-panel g-card ${side.cls}">
    <div class="st-ch">${ch.no}　${ch.name}・${storyNo(s)}</div>
    <h3 class="st-h">${open ? s.name : '？？？'}</h3>
    <div class="st-meta"><span class="g-${side.cls}">${side.name}</span>・${s.place}</div>
    ${open && s.when ? `<div class="st-when">時間點：${s.when}</div>` : ''}
    ${open ? `<p>${storyText(s.story)}</p><dl class="kv"><dt>出擊指揮官</dt><dd>${cast}</dd><dt>作戰目標</dt><dd>${s.goal}</dd><dt>建議等級</dt><dd>Lv ${storyRec(s.id)} 以上</dd>${s.reward ? `<dt>獎勵</dt><dd>${s.reward}</dd>` : ''}</dl>`
      : `<p class="g-dim">${s.sub ? `完成${s.req.map((q) => (STORY_BY[q].sub ? `支線「${STORY_BY[q].name}」` : storyNo(STORY_BY[q]))).join('、')}後開放。支線不打也能繼續主線。` : '完成前一場作戰後開放。'}</p>`}
    ${st === 'done' && s.ending ? `<div class="st-end"><b>結局</b><p>${storyText(s.ending)}</p></div>` : ''}
    <div class="g-row" style="margin-top:12px"><span class="g-sp"></span>${open ? `<button class="g-btn ${st === 'done' ? '' : 'pri'}" data-go="${s.id}">${st === 'done' ? '重打這一關' : '出擊 →'}</button>` : ''}</div>
  </div>`;
}
function showStory() {
  const V = GAME.storyView || (GAME.storyView = { sel: null });
  const p = storyLoad();
  if (!STORY_LINE[p.line]) { showStoryLine(); return; }   // 第一次進來：先選篇章（陣營）
  if (p.diff == null) { showStoryDiff(); return; }        // 再選難度
  const line = p.line, L = STORY_LINE[line], NODES = storyNodes(line);
  if (!V.sel || !NODES.some((n) => n.key === V.sel)) { const nx = NODES.find((n) => !n.sub && storyNodeState(p, n) === 'avail'); V.sel = nx ? nx.key : storySeq(line)[0]; }
  setPhase('briefing');
  const chs = STORY_CH.map((c, k) => {
    const ids = storySeq(line).filter((id) => STORY_BY[id].ch === k), d = ids.filter((id) => p.done[id]).length;
    const subs = STORY_SUBS.filter((s) => s.ch === k && s.line === line), sd = subs.filter((s) => p.done[s.id]).length;
    if (!ids.length) return '';   // 番外篇：沒有關卡的章節不顯示
    return `<button class="st-chb ${d === ids.length ? 'done' : d ? 'on' : ''}" data-ch="${k}"><span>${c.no}</span><b>${c.name}</b><i>${d}／${ids.length}${subs.length ? `・支線 ${sd}／${subs.length}` : ''}</i></button>`;
  }).join('');
  overlay(`<div class="g-wrap st-wrap">
    <div class="g-head"><h2>雙星記</h2><span class="crumb"><span class="g-${STORY_SIDE[L.side].cls}">${L.name}</span>・${storyCount(p, line)}／${storySeq(line).length} 場作戰</span><span class="g-sp"></span><button class="g-btn sm" id="st-line" title="換到另一個篇章（兩篇的進度分開保存）">切換篇章</button><button class="g-btn sm" id="st-diff" title="更改難度（進度不會重置）">難度：${storyDiffOf(p).name}</button><button class="g-btn sm" id="st-reset">重新開始${L.name}</button><button class="g-btn" id="st-back">← 單人戰鬥</button></div>
    <div class="st-main"><div class="st-map">${storyMapSVG(p, V.sel)}</div>${storyPanel(p, V.sel)}</div>
    <div class="st-chs">${chs}</div>
  </div>`);
  gEl('st-back').onclick = showSingle;
  document.querySelectorAll('.st-panel [data-go]').forEach((b) => { b.onclick = () => storyBriefing(b.dataset.go); });
  gEl('st-reset').onclick = (e) => {
    const b = e.target; if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = `確定清除${L.name}的進度？`; return; }
    const q = storyLoad(); STORY_STAGES.filter((s) => s.line === line).forEach((s) => { delete q.done[s.id]; }); storySave(q); V.sel = null; showStory();
  };
  gEl('st-diff').onclick = () => showStoryDiff(true);
  gEl('st-line').onclick = () => showStoryLine(true);
  const pick = (k) => { V.sel = k; const y = gEl('game').scrollTop; showStory(); gEl('game').scrollTop = y; };
  document.querySelectorAll('.st-node').forEach((g) => {
    g.onclick = () => pick(g.dataset.k);
    g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(g.dataset.k); } };
  });
  document.querySelectorAll('.st-chb').forEach((b) => { b.onclick = () => {
    const k = +b.dataset.ch, ids = storySeq(line).filter((id) => STORY_BY[id].ch === k);
    pick(ids.find((id) => storyState(p, id) === 'avail') || ids[0]);
  }; });
}
// 選篇章：帝國篇或聯盟篇。整篇只操作這個陣營；兩篇的進度分開保存，隨時可以回來換
function showStoryLine(change) {
  const p = storyLoad();
  setPhase('briefing');
  const card = (k) => {
    const L = STORY_LINE[k], cls = STORY_SIDE[L.side].cls, n = storyCount(p, k), all = storySeq(k).length, cur = change && p.line === k;
    return `<button class="sp-mode st-linepick ${cls} ${cur ? 'on' : ''}" data-l="${k}"><span class="sp-en">${L.extra ? '番外篇・' : ''}${STORY_SIDE[L.side].name}${cur ? '・目前' : ''}</span><b class="g-${cls}">${L.name}</b><span class="sp-desc">${L.blurb}</span>
      ${L.note ? `<span class="sp-desc st-note">${L.note}</span>` : ''}<span class="sp-st"><span class="g-dim">主要人物</span>　${L.cast}</span><span class="sp-st"><span class="g-dim">進度</span>　${n ? `${n}／${all} 場作戰${p.done[storySeq(k)[all - 1]] ? `・已看過結局〈${L.ending}〉` : ''}` : `尚未開始・共 ${all} 場作戰`}</span></button>`;
  };
  overlay(`<div class="g-wrap sp-wrap">
    <div class="g-head"><h2>雙星記</h2><span class="crumb">${change ? '切換篇章' : '選擇你要追隨的陣營'}</span><span class="g-sp"></span><button class="g-btn" id="sl-back">${change ? '← 星圖' : '← 單人戰鬥'}</button></div>
    <p class="g-dim" style="margin-top:0">帝國與聯盟的戰爭，從兩邊看是兩個不同的故事。選定之後，整篇都只指揮這一方的艦隊；另一方的動向會在作戰簡報裡交代。各篇的進度分開保存，打完一篇可以再回來看另一篇。</p>
    <div class="st-lines">${card('e')}${card('a')}</div>
    <h3 class="st-xh">番外篇</h3>
    <div class="st-lines one">${card('m')}</div>
  </div>`);
  gEl('sl-back').onclick = change ? () => showStory() : showSingle;
  document.querySelectorAll('.st-lines [data-l]').forEach((b) => { b.onclick = () => {
    const q = storyLoad(); q.line = b.dataset.l; storySave(q); if (GAME.storyView) GAME.storyView.sel = null; showStory();
  }; });
}
// 難度選擇：第一次進劇情（或重新開始）時一定會先到這裡；之後可以從星圖再進來改（進度保留）
function showStoryDiff(change) {
  const p = storyLoad(), cur = p.diff != null ? p.diff : -1, line = storyLineOf(p), L = STORY_LINE[line];
  setPhase('briefing');
  // 各章的建議等級（同一章取最低～最高；只算目前篇章）
  const recs = (D) => STORY_CH.map((c, k) => {
    const v = STORY_STAGES.filter((s) => s.ch === k && s.line === line).map((s) => storyRec(s.id, D));
    if (!v.length) return '';
    const lo = Math.min(...v), hi = Math.max(...v);
    return `<span>${c.no} <b>Lv ${lo === hi ? lo : `${lo}～${hi}`}</b></span>`;
  }).join('');
  const lv = cmdrsIn(L.side).map((c) => `${c.name} Lv ${cmdrLevel(c.id)}`).join('、');
  overlay(`<div class="g-wrap sp-wrap">
    <div class="g-head"><h2>雙星記</h2><span class="crumb">${L.name}・${change ? '更改難度' : '開始劇情前，先選擇難度'}</span><span class="g-sp"></span><button class="g-btn" id="sd-back">${change ? '← 星圖' : '← 選擇篇章'}</button></div>
    <p class="g-dim" style="margin-top:0">難度會改變敵方指揮官的等級、兵力和 AI 的強度。之後隨時可以在星圖右上角更改，進度不會重置。</p>
    <div class="st-diffs">${STORY_DIFF.map((D, i) => `<button class="sp-mode ${i === cur ? 'on' : ''}" data-d="${i}"><span class="sp-en">${D.en}${i === cur ? '・目前' : ''}</span><b>${D.name}</b><span class="sp-desc">${D.desc}</span>
      <span class="sp-st"><span class="g-dim">建議等級</span><span class="st-recs">${recs(D)}</span></span></button>`).join('')}</div>
    <div class="g-card" style="margin-top:12px"><h3>你目前的指揮官</h3><dl class="kv"><dt class="g-${STORY_SIDE[L.side].cls}">${STORY_SIDE[L.side].name}</dt><dd>${lv || '（沒有）'}</dd></dl>
      <div class="g-dim" style="margin-top:8px;font-size:calc(12px * var(--ui))">建議等級是「這一關敵方指揮官的平均等級減 1」。劇情裡打仗一樣會累積經驗；等級不夠時，可以先到無限戰場或隨機戰役練等，天賦也照常生效。</div></div>
  </div>`);
  gEl('sd-back').onclick = change ? () => showStory() : () => showStoryLine();
  document.querySelectorAll('.st-diffs [data-d]').forEach((b) => { b.onclick = () => { const q = storyLoad(); q.diff = +b.dataset.d; storySave(q); showStory(); }; });
}
