// ═══════════════════════ 劇情戰役〈雙星記〉：星圖選關（每一關的戰鬥資料在 story_war.js） ═══════════════════════
// 共通路線 1～18 關：帝國、聯盟兩線交替；第 18 關之後選邊（route：'e' 帝國／'a' 聯盟），各打 19～21 關，贏的一方掌握大部分人類星域
// 星圖座標：viewBox 1600×900；西邊帝國、東邊聯盟，中間是暗黑星雲帶（阿刻戎走廊從中間穿過），南邊是洛珊自治領
const STORY_STORE = 'fleet.story';
const STORY_CH = [
  { no: '序章', name: '邊境' }, { no: '第一章', name: '星雲' }, { no: '第二章', name: '要塞' },
  { no: '第三章', name: '停戰' }, { no: '第四章', name: '遠征' }, { no: '終章', name: '雙星' },
];
const STORY_SIDE = [{ name: '帝國軍', cls: 'emp' }, { name: '聯盟軍', cls: 'all' }];
// 地標（不是關卡）：首都、要塞
const STORY_MARKS = [
  { name: '維斯特拉', sub: '奧瑞利安帝國　帝都', x: 150, y: 455, side: 0, kind: 'capital', lp: 'up' },
  { name: '赫利昂', sub: '自由星系聯盟　首都', x: 1460, y: 480, side: 1, kind: 'capital', lp: 'up' },
  { name: '洛珊', sub: '洛珊自治領　首府', x: 850, y: 840, side: 2, kind: 'capital', lp: 'right' },
  { name: '埃吉斯要塞', sub: '走廊的帝國側出口', x: 590, y: 380, side: 0, kind: 'fortress', flip: '9', lp: 'down' },   // 第 9 關後歸聯盟
];
const STORY_STAGES = [
  { id: '1', ch: 0, side: 0, name: '邊境遭遇戰', place: '塞伊邊境星域', x: 740, y: 150, cast: ['rein'], goal: '擊退敵軍巡邏隊',
    story: '塞伊邊境的例行巡邏撞上了聯盟的巡邏隊。對方規模不大，但這是三年來兩國第一次交火。' },
  { id: '2', ch: 0, side: 1, name: '撤出塞伊', place: '塞伊邊境星域', x: 910, y: 180, cast: ['aaron'], goal: '撐到撤離時限（存活即過關）',
    story: '巴爾克的巡邏隊被打散。亞倫奉命收攏殘部撤回本國，帝國的追兵已經在路上。' },
  { id: '3', ch: 1, side: 1, name: '紫晶的獵人', place: '紫晶星雲', x: 880, y: 300, cast: ['grace'], goal: '伏擊並殲滅帝國艦隊',
    story: '議會要一場勝利。葛瑞絲和佩蕾在紫晶星雲兩側布下伏兵，等帝國艦隊自己走進來。' },
  { id: '4', ch: 1, side: 0, name: '星雲中的砲火', place: '紫晶星雲', x: 790, y: 280, cast: ['erin'], goal: '突破伏擊',
    story: '艾琳的艦隊奉命穿越紫晶星雲。情報說前方沒有敵人，但情報並不完整。' },
  { id: '5', ch: 1, side: 0, name: '無人護航', place: '卡德倫星系', x: 440, y: 250, cast: ['kas'], goal: '護送補給艦隊抵達',
    story: '前線缺補給，司令部卻不派護衛。卡斯只能用自己的艦隊護送補給船團。' },
  { id: '6', ch: 1, side: 1, name: '數字的戰爭', place: '費茲星系', x: 1090, y: 330, cast: ['aaron'], goal: '在時限內維持戰損比',
    story: '霍斯特的消耗戰打得漂亮，戰報上的擊沉數每天都在增加。亞倫開始懷疑，這些數字是打給誰看的。' },
  { id: '7', ch: 2, side: 1, name: '要塞前哨', place: '埃吉斯外圍', x: 690, y: 480, cast: ['aaron'], goal: '突破前哨站',
    story: '薩莫斯議長限期十天拿下埃吉斯。第一步是要塞外圍的前哨站，守將是奧德。' },
  { id: '8', ch: 2, side: 0, name: '遲來的援軍', place: '埃吉斯後方', x: 470, y: 450, cast: ['rein'], goal: '援軍突入戰場',
    story: '雷恩帶援軍趕往埃吉斯，要塞司令卻拒絕開放航道。他是凡德林公爵的人。' },
  { id: '9', ch: 2, side: 1, name: '埃吉斯陷落', place: '埃吉斯要塞', x: 680, y: 380, cast: ['aaron', 'grace'], goal: '攻陷要塞',
    story: '正面強攻只會白白送死。亞倫決定用干擾癱瘓要塞的防衛網。' },
  { id: '10', ch: 2, side: 0, name: '殿後', place: '歐倫星系', x: 420, y: 560, cast: ['rein', 'kas'], goal: '讓主力撤出戰場',
    story: '埃吉斯失守，帝國艦隊全面撤退。總要有人留下來擋住追兵。' },
  { id: '11', ch: 3, side: 0, name: '和平的使者', place: '洛珊航道', x: 570, y: 700, cast: ['erin'], goal: '護送使節艦',
    story: '兩國同意在洛珊舉行停戰談判。艾琳負責護送帝國使節艦，沿途出現身分不明的艦隊。' },
  { id: '12', ch: 3, side: 1, name: '破局', place: '洛珊港外', x: 960, y: 760, cast: ['aaron'], goal: '突圍脫出',
    story: '使節艦在洛珊港外遇襲，兩國互指對方背信。亞倫手上的戰前情報，從一開始就是假的。' },
  { id: '13', ch: 3, side: 0, name: '同室操戈', place: '布雷克星系', x: 300, y: 230, cast: ['rein', 'erin'], goal: '擊破格倫的艦隊',
    story: '雷恩查到了襲擊的主使：凡德林公爵與赫爾墨斯軍需集團。攝政派宣布雷恩叛國，帝國內戰爆發。' },
  { id: '14', ch: 4, side: 1, name: '遠征令', place: '涅瓦星系', x: 500, y: 330, cast: ['aaron', 'grace'], goal: '擊退帝國守軍',
    story: '帝國內戰正酣，議會通過遠征案。亞倫投了反對票，然後率艦隊穿過埃吉斯。' },
  { id: '15', ch: 4, side: 0, name: '焦土', place: '希瑟星系', x: 360, y: 400, cast: ['erin'], goal: '截斷敵軍補給線',
    story: '艾琳撤走了每一座補給站。遠征軍越是深入，離自己的補給就越遠。' },
  { id: '16', ch: 4, side: 1, name: '紡錘的尖端', place: '塔斯星系', x: 270, y: 560, cast: ['grace'], goal: '撕開包圍網',
    story: '遠征軍陷入包圍。葛瑞絲請命率突擊艦隊，從正面撕開一道缺口。' },
  { id: '17', ch: 5, side: 0, name: '攝政的黃昏', place: '維斯特拉近郊', x: 180, y: 320, cast: ['rein'], goal: '殲滅攝政派艦隊',
    story: '凡德林公爵的艦隊退守帝都外圍。打贏這一仗，帝國就只剩下一個聲音。' },
  { id: '18', ch: 5, side: 1, name: '最後的防線', place: '埃吉斯要塞', x: 670, y: 315, cast: ['aaron'], goal: '守住要塞',
    story: '遠征失敗，帝國大軍正逼近埃吉斯。亞倫要守住聯盟唯一的門戶。' },
  // ── 選邊之後 ──
  { id: '19e', ch: 5, side: 0, route: 'e', name: '雙星', place: '阿刻戎走廊', x: 800, y: 420, cast: ['rein', 'erin'], goal: '擊敗亞倫的艦隊',
    story: '洛珊宣布：誰贏下這一戰，洛珊就歸順誰。雷恩親率全軍進入阿刻戎走廊，對面是他唯一承認的對手。' },
  { id: '19a', ch: 5, side: 1, route: 'a', name: '雙星', place: '阿刻戎走廊', x: 800, y: 420, cast: ['aaron'], goal: '擊敗雷恩的艦隊',
    story: '洛珊宣布：誰贏下這一戰，洛珊就歸順誰。亞倫在走廊裡等著，他知道雷恩一定會親自來。' },
  { id: '20e', ch: 5, side: 0, route: 'e', name: '赫利昂之門', place: '赫利昂', x: 1350, y: 395, cast: ['rein', 'erin'], goal: '擊破首都防衛艦隊',
    story: '走廊已經打通，前方就是聯盟首都。議會集結了最後的防衛艦隊。' },
  { id: '20a', ch: 5, side: 1, route: 'a', name: '帝都陷落', place: '維斯特拉', x: 210, y: 470, cast: ['aaron'], goal: '擊破近衛艦隊',
    story: '聯盟艦隊第一次看見帝都的天空。近衛艦隊和攝政派殘黨在軌道上列陣。' },
  { id: '21e', ch: 5, side: 0, route: 'e', name: '新王朝', place: '洛珊', x: 760, y: 800, cast: ['rein', 'erin'], goal: '擊潰赫爾墨斯私兵艦隊',
    story: '赫爾墨斯軍需集團不打算交出洛珊，私兵艦隊封鎖了港口。這是這場戰爭的最後一筆帳。',
    ending: '洛珊歸順，聯盟議會投降。雷恩登基，奧瑞利安帝國統治了約八成五的人類星域。共和制度從此成為歷史。' },
  { id: '21a', ch: 5, side: 1, route: 'a', name: '共和之星', place: '洛珊', x: 760, y: 800, cast: ['aaron'], goal: '擊潰赫爾墨斯私兵艦隊',
    story: '赫爾墨斯軍需集團不打算交出洛珊，私兵艦隊封鎖了港口。這是這場戰爭的最後一筆帳。',
    ending: '洛珊與帝國各星區以加盟國的身分併入聯盟，自由星系聯盟擁有約八成五的人類星域。議會依然腐敗，而亞倫成了不得不從政的英雄。' },
];
const STORY_BY = Object.fromEntries(STORY_STAGES.map((s) => [s.id, s]));
const STORY_COMMON = STORY_STAGES.filter((s) => !s.route).map((s) => s.id);
const storySeq = (route) => STORY_COMMON.concat(route ? ['19', '20', '21'].map((n) => n + route) : []);
// 星圖上的節點：19、21 兩條路線在同一個位置，合成一個節點（選邊前顯示成分岔點）
const STORY_NODES = STORY_COMMON.map((id) => ({ key: id, ids: [id] })).concat([
  { key: '19', ids: ['19e', '19a'] }, { key: '20e', ids: ['20e'] }, { key: '20a', ids: ['20a'] }, { key: '21', ids: ['21e', '21a'] }]);
const STORY_LINKS = STORY_COMMON.slice(1).map((id, k) => [STORY_COMMON[k], id]).concat([['18', '19'], ['19', '20e'], ['19', '20a'], ['20e', '21'], ['20a', '21']]);

function storyLoad() { let p = null; try { p = JSON.parse(STORE.getItem(STORY_STORE) || 'null'); } catch (e) { p = null; } return p && p.done ? p : { done: {}, route: null }; }
// 每一關的狀態：done 已完成、avail 可以打、locked 還沒開放、off 另一條路線（已經選了另一邊）
function storyState(p, id) {
  const s = STORY_BY[id];
  if (p.done[id]) return 'done';
  if (s.route && p.route && s.route !== p.route) return 'off';
  const seq = storySeq(s.route || p.route), k = seq.indexOf(id);
  if (k < 0) return 'locked';
  return seq.slice(0, k).every((x) => p.done[x]) ? 'avail' : 'locked';
}
// 節點代表哪一關：選邊前的分岔點沒有單一關卡（回傳 null）
function storyNodeStage(p, node) { return node.ids.length === 1 ? STORY_BY[node.ids[0]] : p.route ? STORY_BY[node.ids.find((id) => STORY_BY[id].route === p.route)] : null; }
function storyNodeState(p, node) {
  const st = node.ids.map((id) => storyState(p, id));
  return st.includes('done') ? 'done' : st.includes('avail') ? 'avail' : st.every((s) => s === 'off') ? 'off' : 'locked';
}
const storyPos = (key) => { const n = STORY_NODES.find((o) => o.key === key); const s = STORY_BY[n.ids[0]]; return [s.x, s.y]; };

// ───── 星圖（SVG） ─────
function storyMapSVG(p, sel) {
  const R = mulberry32(20261020), ended = p.done['21e'] ? 0 : p.done['21a'] ? 1 : -1;
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
    const side = m.flip && p.done[m.flip] ? 1 : ended >= 0 && m.side < 2 ? ended : m.side, c = ['emp', 'all', 'neu'][side];
    const icon = m.kind === 'fortress' ? `<path class="st-mk ${c}" d="M${m.x} ${m.y - 16}l14 8v16l-14 8l-14-8v-16z"/>`
      : `<circle class="st-mk ${c}" cx="${m.x}" cy="${m.y}" r="12"/><circle class="st-mk-c ${c}" cx="${m.x}" cy="${m.y}" r="5"/>`;
    const [dx, dy, an] = { up: [0, -44, 'middle'], down: [0, 40, 'middle'], right: [22, -2, 'start'], left: [-22, -2, 'end'] }[m.lp];
    return `<g class="st-mark" text-anchor="${an}">${icon}<text class="st-mk-t" x="${m.x + dx}" y="${m.y + dy}">${m.name}</text><text class="st-mk-s" x="${m.x + dx}" y="${m.y + dy + 19}">${m.sub}</text></g>`;
  }).join('');
  // 航線：依目的地的狀態畫實線（已走過）、亮虛線（下一步）、淡虛線（未來）
  const links = STORY_LINKS.map(([a, b]) => {
    const nb = STORY_NODES.find((o) => o.key === b), st = storyNodeState(p, nb), s = storyNodeStage(p, nb);
    const c = s ? STORY_SIDE[s.side].cls : 'fork', [x1, y1] = storyPos(a), [x2, y2] = storyPos(b);
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2 - (x2 - x1) * 0.12;   // 稍微彎曲
    return `<path class="st-link ${st} ${c}" d="M${x1} ${y1}Q${mx.toFixed(0)} ${my.toFixed(0)} ${x2} ${y2}"/>`;
  }).join('');
  const nodes = STORY_NODES.map((n) => {
    const s = storyNodeStage(p, n), st = storyNodeState(p, n), [x, y] = storyPos(n.key);
    const c = s ? STORY_SIDE[s.side].cls : 'fork', label = st === 'locked' || st === 'off' ? '' : s ? s.name : '選擇陣營';
    const no = n.key.replace(/[ea]$/, '');
    return `<g class="st-node ${st} ${c} ${sel === n.key ? 'sel' : ''}" data-k="${n.key}" transform="translate(${x} ${y})" tabindex="0">
      <circle class="st-hit" r="34"/>${st === 'avail' ? '<circle class="st-pulse" r="22"/>' : ''}
      <circle class="st-ring" r="22"/>${c === 'fork' && st !== 'off' ? '<path class="st-half" d="M0 -17A17 17 0 0 0 0 17z"/><path class="st-half2" d="M0 -17A17 17 0 0 1 0 17z"/>' : '<circle class="st-core" r="17"/>'}
      <text class="st-no" y="6">${st === 'done' ? '✓' : no}</text>
      ${label ? `<text class="st-lb" y="48">${label}</text>` : ''}</g>`;
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
  const n = STORY_NODES.find((o) => o.key === key);
  if (!n) return `<div class="st-panel g-card"><div class="g-dim">點選星圖上的星系查看作戰。</div></div>`;
  const s = storyNodeStage(p, n), st = storyNodeState(p, n);
  if (!s) {   // 選邊前的分岔點
    const [e, a] = n.ids.map((id) => STORY_BY[id]);
    return `<div class="st-panel g-card"><div class="st-ch">${STORY_CH[5].no}　${STORY_CH[5].name}・第 ${n.key} 關</div><h3 class="st-h">${e.name}</h3>
      <div class="st-meta">${e.place}</div>
      ${st === 'locked' ? '<p class="g-dim">完成第 18 關之後，選擇以哪一方迎接決戰。選擇後路線會鎖定，另一方的結局要重新打一次才看得到。</p>'
        : `<p>兩條路線在這裡分岔。選擇以哪一方迎接決戰：</p>
      <div class="st-fork"><div class="st-pick emp"><b>帝國軍</b><span>${e.story}<br>建議等級 Lv ${storyRec(e.id)} 以上</span><button class="g-btn" data-go="19e">以帝國軍出擊</button></div>
      <div class="st-pick all"><b>聯盟軍</b><span>${a.story}<br>建議等級 Lv ${storyRec(a.id)} 以上</span><button class="g-btn" data-go="19a">以聯盟軍出擊</button></div></div>`}</div>`;
  }
  const side = STORY_SIDE[s.side], ch = STORY_CH[s.ch], open = st !== 'locked' && st !== 'off';
  const cast = s.cast.map((id) => { const c = COMMANDERS.find((o) => o.id === id); return c ? `${c.title} ${c.name}` : id; }).join('、');
  return `<div class="st-panel g-card ${side.cls}">
    <div class="st-ch">${ch.no}　${ch.name}・第 ${s.id.replace(/[ea]$/, '')} 關</div>
    <h3 class="st-h">${open ? s.name : '？？？'}</h3>
    <div class="st-meta"><span class="g-${side.cls}">${side.name}視角</span>・${s.place}</div>
    ${open ? `<p>${s.story}</p><dl class="kv"><dt>出擊指揮官</dt><dd>${cast}</dd><dt>作戰目標</dt><dd>${s.goal}</dd><dt>建議等級</dt><dd>Lv ${storyRec(s.id)} 以上</dd></dl>`
      : `<p class="g-dim">${st === 'off' ? '你選擇了另一方的路線。' : '完成前一場作戰後開放。'}</p>`}
    ${st === 'done' && s.ending ? `<div class="st-end"><b>結局</b><p>${s.ending}</p></div>` : ''}
    <div class="g-row" style="margin-top:12px"><span class="g-sp"></span>${open ? `<button class="g-btn ${st === 'done' ? '' : 'pri'}" data-go="${s.id}">${st === 'done' ? '重打這一關' : '出擊 →'}</button>` : ''}</div>
  </div>`;
}
function showStory() {
  const V = GAME.storyView || (GAME.storyView = { sel: null });
  const p = storyLoad();
  if (p.diff == null) { showStoryDiff(); return; }   // 第一次進來（或重新開始）：先選難度
  if (!V.sel) { const nx = STORY_NODES.find((n) => storyNodeState(p, n) === 'avail'); V.sel = nx ? nx.key : '1'; }
  setPhase('briefing');
  const total = storySeq('e').length, cnt = storySeq(p.route || 'e').filter((id) => p.done[id]).length;
  const chs = STORY_CH.map((c, k) => {
    const ids = STORY_STAGES.filter((s) => s.ch === k && (!s.route || !p.route || s.route === p.route)).map((s) => s.id);
    const ids2 = k === 5 && !p.route ? ids.filter((id) => !id.endsWith('a')) : ids, d = ids2.filter((id) => p.done[id]).length;
    return `<button class="st-chb ${d === ids2.length ? 'done' : d ? 'on' : ''}" data-ch="${k}"><span>${c.no}</span><b>${c.name}</b><i>${d}／${ids2.length}</i></button>`;
  }).join('');
  overlay(`<div class="g-wrap st-wrap">
    <div class="g-head"><h2>雙星記</h2><span class="crumb">劇情戰役・${cnt}／${total} 場作戰</span><span class="g-sp"></span><button class="g-btn sm" id="st-diff" title="更改難度（進度不會重置）">難度：${storyDiffOf(p).name}</button><button class="g-btn sm" id="st-reset">重新開始劇情</button><button class="g-btn" id="st-back">← 單人戰鬥</button></div>
    <div class="st-main"><div class="st-map">${storyMapSVG(p, V.sel)}</div>${storyPanel(p, V.sel)}</div>
    <div class="st-chs">${chs}</div>
  </div>`);
  gEl('st-back').onclick = showSingle;
  document.querySelectorAll('.st-panel [data-go]').forEach((b) => { b.onclick = () => storyBriefing(b.dataset.go); });
  gEl('st-reset').onclick = (e) => {
    const b = e.target; if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定清除劇情進度？'; return; }
    storySave({ done: {}, route: null }); V.sel = null; showStory();
  };
  gEl('st-diff').onclick = () => showStoryDiff(true);
  const pick = (k) => { V.sel = k; const y = gEl('game').scrollTop; showStory(); gEl('game').scrollTop = y; };
  document.querySelectorAll('.st-node').forEach((g) => {
    g.onclick = () => pick(g.dataset.k);
    g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(g.dataset.k); } };
  });
  document.querySelectorAll('.st-chb').forEach((b) => { b.onclick = () => {
    const k = +b.dataset.ch, n = STORY_NODES.find((o) => o.ids.some((id) => STORY_BY[id].ch === k) && storyNodeState(p, o) === 'avail') || STORY_NODES.find((o) => STORY_BY[o.ids[0]].ch === k);
    pick(n.key);
  }; });
}
// 難度選擇：第一次進劇情（或重新開始）時一定會先到這裡；之後可以從星圖再進來改（進度保留）
function showStoryDiff(change) {
  const p = storyLoad(), cur = p.diff != null ? p.diff : -1;
  setPhase('briefing');
  // 各章的建議等級（同一章取最低～最高）
  const recs = (D) => STORY_CH.map((c, k) => {
    const v = STORY_STAGES.filter((s) => s.ch === k).map((s) => storyRec(s.id, D)), lo = Math.min(...v), hi = Math.max(...v);
    return `<span>${c.no} <b>Lv ${lo === hi ? lo : `${lo}～${hi}`}</b></span>`;
  }).join('');
  const lvOf = (f) => cmdrsOf(f).filter((c) => c.base).map((c) => `${c.name} Lv ${cmdrLevel(c.id)}`).join('、');
  overlay(`<div class="g-wrap sp-wrap">
    <div class="g-head"><h2>雙星記</h2><span class="crumb">${change ? '更改難度' : '開始劇情前，先選擇難度'}</span><span class="g-sp"></span><button class="g-btn" id="sd-back">${change ? '← 星圖' : '← 單人戰鬥'}</button></div>
    <p class="g-dim" style="margin-top:0">難度會改變敵方指揮官的等級、兵力和 AI 的強度。之後隨時可以在星圖右上角更改，進度不會重置。</p>
    <div class="st-diffs">${STORY_DIFF.map((D, i) => `<button class="sp-mode ${i === cur ? 'on' : ''}" data-d="${i}"><span class="sp-en">${D.en}${i === cur ? '・目前' : ''}</span><b>${D.name}</b><span class="sp-desc">${D.desc}</span>
      <span class="sp-st"><span class="g-dim">建議等級</span><span class="st-recs">${recs(D)}</span></span></button>`).join('')}</div>
    <div class="g-card" style="margin-top:12px"><h3>你目前的指揮官</h3><dl class="kv"><dt class="g-emp">帝國軍</dt><dd>${lvOf(0)}</dd><dt class="g-all">聯盟軍</dt><dd>${lvOf(1)}</dd></dl>
      <div class="g-dim" style="margin-top:8px;font-size:calc(12px * var(--ui))">建議等級是「這一關敵方指揮官的平均等級減 1」。劇情裡打仗一樣會累積經驗；等級不夠時，可以先到無限戰場或隨機戰役練等，天賦也照常生效。</div></div>
  </div>`);
  gEl('sd-back').onclick = change ? () => showStory() : showSingle;
  document.querySelectorAll('.st-diffs [data-d]').forEach((b) => { b.onclick = () => { const q = storyLoad(); q.diff = +b.dataset.d; storySave(q); showStory(); }; });
}
