// ═══════════════════════ 星際酒館：用「功勳」招募兩個陣營的指揮官 ═══════════════════════
// 存檔 fleet.roster：merit 功勳、hired 招募來的指揮官（完整資料）、fired 解雇的初始指揮官、pool 目前的候選人、reinf 增援次數
const ROSTER_STORE = 'fleet.roster';
const ROSTER_MAX = 16;
const TAVERN_PER_FACTION = 3;
const TAVERN_REFRESH_COST = 30;
const RARITY = [
  { key: 'common', name: '普通', p: 0.65, lv: [1, 2], skills: 1, cost: 0 },
  { key: 'elite', name: '精英', p: 0.28, lv: [2, 4], skills: 2, cost: 60 },
  { key: 'ace', name: '名將', p: 0.07, lv: [4, 6], skills: 2, cost: 180 },
];
const NAME_POOL = [
  { given: ['奧斯卡', '卡爾', '奧古斯特', '路德', '艾米爾', '海因', '歐根', '法蘭茲', '馬克斯', '希爾德', '伊莉莎', '葛蕾特', '席格', '露易絲'],
    family: ['馮・霍爾', '施坦納', '克萊斯', '巴赫曼', '諾伊曼', '韋伯', '哈特曼', '布勞恩', '莫勒', '福克斯', '雷曼', '齊默', '馮・艾克', '羅森'] },
  { given: ['布萊恩', '卡特', '丹尼', '艾倫', '法蘭克', '海倫', '伊凡', '茱莉', '凱文', '莉莉', '諾拉', '馬修', '蕾貝卡', '湯姆'],
    family: ['布朗', '米勒', '克拉克', '霍爾', '莫里斯', '華勒斯', '格林', '柯林斯', '派克', '肯特', '奧尼爾', '席爾瓦', '雷諾', '韓森'] },
];
const TRAIT_BIO = { dmg: '攻勢型，偏好以火力壓制敵軍。', shield: '守勢型，擅長穩住戰線、打消耗戰。', speed: '機動型，擅長繞側與追擊。' };
const titleOf = (lv) => (lv >= 8 ? '上將' : lv >= 5 ? '中將' : lv >= 3 ? '少將' : '准將');

function rosterLoad() {
  let r = null; try { r = JSON.parse(STORE.getItem(ROSTER_STORE) || 'null'); } catch (e) { r = null; }
  if (!r) r = { merit: 300, hired: [], fired: [], pool: [], battles: 0 };
  r.hired = r.hired || []; r.fired = r.fired || []; r.pool = r.pool || [];
  return r;
}
function rosterSave() { try { STORE.setItem(ROSTER_STORE, JSON.stringify(ROSTER)); } catch (e) { /* 只在本次有效 */ } }
let ROSTER = rosterLoad();
const COMMANDERS_BASE = COMMANDERS.filter((c) => c.base);   // 初始指揮官（多人戰鬥只能派這幾位）
// 把招募來的指揮官放進 COMMANDERS、拿掉解雇的初始指揮官
function rosterApply() {
  for (let k = COMMANDERS.length - 1; k >= 0; k--) if (!COMMANDERS[k].base || ROSTER.fired.includes(COMMANDERS[k].id)) COMMANDERS.splice(k, 1);
  for (const c of ROSTER.hired) COMMANDERS.push(c);
}
rosterApply();
function cmdrsOf(faction) { return COMMANDERS.filter((c) => (c.faction || 0) === faction); }

// 候選人
function genCandidate(faction, R) {
  let q = R(), rar = RARITY[0]; for (const r of RARITY) { if (q < r.p) { rar = r; break; } q -= r.p; }
  const lv = rar.lv[0] + Math.floor(R() * (rar.lv[1] - rar.lv[0] + 1));
  const N = NAME_POOL[faction], trait = ['dmg', 'shield', 'speed'][Math.floor(R() * 3)];
  const skills = []; while (skills.length < rar.skills) { const s = CAMP_SKILLS[Math.floor(R() * CAMP_SKILLS.length)]; if (!skills.includes(s)) skills.push(s); }
  return { id: 'h' + Math.floor(R() * 1e9).toString(36) + Date.now().toString(36).slice(-3), name: N.given[Math.floor(R() * N.given.length)] + '・' + N.family[Math.floor(R() * N.family.length)],
    title: titleOf(lv), trait, skills, faction, level: lv, rarity: rar.key, cost: 60 + 50 * (lv - 1) + rar.cost, bio: TRAIT_BIO[trait] };
}
function tavernRefresh() {
  const R = mulberry32((Math.random() * 1e9) >>> 0);
  ROSTER.pool = [];
  for (const f of [0, 1]) for (let k = 0; k < TAVERN_PER_FACTION; k++) ROSTER.pool.push(genCandidate(f, R));
  rosterSave();
}
if (!ROSTER.pool.length) tavernRefresh();
// 戰後：給功勳、換一批候選人；回傳這次得到的功勳
function meritFor(R, sc) {
  const base = sc && sc.campaign ? 40 + 15 * sc.stage : sc && sc.random ? 50 + 30 * sc.sizeIdx + 15 * Math.max(0, (sc.enemyLevel || 0) - (sc.avgLevel || 0)) : 40 + 40 * ((sc && sc.level) || 1);
  return Math.round(base * (R.kind === 'win' ? 2.5 : R.kind === 'draw' ? 1.5 : 1));
}
function tavernAfterBattle(R, sc) {
  const mul = rewardMul(R);
  if (!mul) return 0;   // 開戰就撤退：不給功勳、也不換候選人
  const m = Math.round(meritFor(R, sc) * mul);
  ROSTER.merit += m; ROSTER.battles++;
  tavernRefresh();   // 內含存檔
  return m;
}
function recruit(id) {
  const c = ROSTER.pool.find((o) => o.id === id); if (!c) return '候選人已經不在了';
  if (COMMANDERS.length >= ROSTER_MAX) return `指揮官最多 ${ROSTER_MAX} 位，先解雇幾位`;
  if (ROSTER.merit < c.cost) return '功勳不夠';
  ROSTER.merit -= c.cost;
  ROSTER.pool = ROSTER.pool.filter((o) => o.id !== id);
  const def = { id: c.id, name: c.name, title: c.title, trait: c.trait, skills: c.skills.slice(), faction: c.faction, rarity: c.rarity, bio: c.bio };
  ROSTER.hired.push(def); COMMANDERS.push(def);
  CMDR_SAVE[c.id] = { xp: XP_PER_LEVEL * (c.level - 1), tal: {} }; saveCmdrs(CMDR_SAVE);
  rosterSave();
  return '';
}
function dismiss(id) {
  const c = COMMANDERS.find((o) => o.id === id); if (!c) return '';
  if (cmdrsOf(c.faction || 0).length <= 1) return '每個陣營至少要留一位指揮官';
  if (c.base) ROSTER.fired.push(id); else ROSTER.hired = ROSTER.hired.filter((o) => o.id !== id);
  const k = COMMANDERS.indexOf(c); if (k >= 0) COMMANDERS.splice(k, 1);
  rosterSave();
  return '';
}

function showTavern(msg) {
  setPhase('briefing');
  const card = (c) => {
    const rar = RARITY.find((r) => r.key === c.rarity) || RARITY[0], can = ROSTER.merit >= c.cost && COMMANDERS.length < ROSTER_MAX;
    return `<div class="tv-c tv-${c.rarity}"><div class="tv-h"><b>${c.title} ${c.name}</b><span class="tv-r">${rar.name}</span></div>
      <div class="tv-m"><span>Lv ${c.level}</span><span>${TRAIT_NAME[c.trait]}型</span></div>
      <div class="tv-s">${c.skills.map((s) => `<span class="tal-sk" title="${SKILLS[s].desc}">${SKILLS[s].name}</span>`).join('')}</div>
      <div class="g-dim tv-b">${c.bio}</div>
      <div class="tv-f"><span class="tv-cost">${c.cost} 功勳</span><button class="g-btn sm ${can ? 'pri' : ''}" data-hire="${c.id}" ${can ? '' : 'disabled'}>招募</button></div></div>`;
  };
  const col = (f) => `<div class="tv-col"><h4 class="${f ? 'g-all' : 'g-emp'}">${FACTION_NAME[f]}</h4>${ROSTER.pool.filter((c) => c.faction === f).map(card).join('') || '<p class="g-dim">這一批沒有人了，打完下一場或換一批。</p>'}</div>`;
  const mine = (f) => cmdrsOf(f).map((c) => `<div class="tv-mine"><b>${c.title} ${c.name}</b><span class="g-dim">Lv ${cmdrLevel(c.id)}・${TRAIT_NAME[c.trait]}・${c.skills.map((s) => SKILLS[s].name).join('、')}</span><span class="g-sp"></span><button class="g-btn sm" data-fire="${c.id}" title="解雇（不退還功勳）">解雇</button></div>`).join('');
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>星際酒館</h2><span class="crumb">招募兩個陣營的指揮官・每打完一場換一批候選人</span><span class="g-sp"></span><button class="g-btn" id="tv-back">← 單人戰鬥</button></div>
    <div class="g-card" style="margin-bottom:12px"><div class="g-row"><span>功勳 <b class="g-emp tv-merit">${fmtN(ROSTER.merit)}</b></span><span class="g-dim">打完訓練作戰、隨機戰役或無限戰場就會得到功勳（勝利最多）</span><span class="g-sp"></span>
      <span class="g-dim">指揮官 ${COMMANDERS.length}／${ROSTER_MAX}</span><button class="g-btn sm" id="tv-ref" ${ROSTER.merit < TAVERN_REFRESH_COST ? 'disabled' : ''}>換一批（${TAVERN_REFRESH_COST} 功勳）</button></div>
      ${msg ? `<p class="g-warn" style="margin:8px 0 0">${msg}</p>` : ''}</div>
    <div class="g-card" style="margin-bottom:12px"><div class="g-row"><span>增援次數 <b class="g-emp">${ROSTER.reinf || 0}</b>／${REINFORCE_RULE.max}</span>
      <span class="g-dim" style="font-size:calc(12px * var(--ui))">學會天賦「呼叫增援」（指揮，Lv ${TALENT_BY_ID.s_reinf.req}）的指揮官可以在作戰中呼叫增援，每次消耗 1 次（全部指揮官共用）</span><span class="g-sp"></span>
      <button class="g-btn sm" id="tv-reinf" ${ROSTER.merit < REINFORCE_RULE.cost || (ROSTER.reinf || 0) >= REINFORCE_RULE.max ? 'disabled' : ''}>購買 1 次（${REINFORCE_RULE.cost} 功勳）</button></div></div>
    <div class="tv-grid">${col(0)}${col(1)}</div>
    <div class="g-card" style="margin-top:12px"><h3>我的指揮官</h3><div class="tv-grid"><div>${mine(0)}</div><div>${mine(1)}</div></div>
      <p class="g-dim" style="font-size:calc(12px * var(--ui));margin:8px 0 0">招募來的指揮官從候選人的等級開始，天賦點數照等級計算。出擊時只能派該陣營的指揮官。</p></div></div>`);
  gEl('tv-back').onclick = showSingle;
  gEl('tv-ref').onclick = () => { if (ROSTER.merit < TAVERN_REFRESH_COST) return; ROSTER.merit -= TAVERN_REFRESH_COST; tavernRefresh(); showTavern(); };
  gEl('tv-reinf').onclick = () => {
    if (ROSTER.merit < REINFORCE_RULE.cost || (ROSTER.reinf || 0) >= REINFORCE_RULE.max) return;
    ROSTER.merit -= REINFORCE_RULE.cost; ROSTER.reinf = (ROSTER.reinf || 0) + 1; rosterSave(); showTavern();
  };
  document.querySelectorAll('[data-hire]').forEach((b) => (b.onclick = () => showTavern(recruit(b.dataset.hire))));
  document.querySelectorAll('[data-fire]').forEach((b) => (b.onclick = () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定解雇？'; return; }
    showTavern(dismiss(b.dataset.fire));
  }));
}
