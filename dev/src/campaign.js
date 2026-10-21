// ═══════════════════════ 無限戰場（原「戰役進度」）：無限關卡，敵軍依出擊指揮官平均等級 ±3 隨機生成，地形隨機 ═══════════════════════
const CAMP_STORE = 'fleet.campaign';
const CAMP_NAMES = ['巴爾克', '霍斯特', '佩蕾', '格倫', '奧德', '薇拉', '卡蘭', '索恩', '伊格', '莫蘭', '黛菈', '雷文', '賽隆', '芙蕾', '戈爾', '尤里'];
const CAMP_FLEET_NAMES = ['敵前鋒艦隊', '敵主力艦隊', '敵機動艦隊', '敵守備艦隊', '敵遊擊艦隊'];
// 艦隊類型：mix＝各艦種艘數比例（航母、戰列、巡洋、驅逐、護衛）；formations／tactics 從中隨機挑
const CAMP_ARCHETYPES = [
  { key: 'balanced', name: '均衡', mix: [0.04, 0.16, 0.28, 0.28, 0.24], formations: ['line', 'spindle', 'crescent'], tactics: ['push', 'push', 'breakthrough'] },
  { key: 'heavy', name: '重砲', mix: [0.02, 0.32, 0.34, 0.14, 0.18], formations: ['line', 'crescent'], tactics: ['push', 'kite'] },
  { key: 'carrier', name: '航母群', mix: [0.14, 0.12, 0.24, 0.2, 0.3], formations: ['ring', 'line'], tactics: ['kite', 'push'] },
  { key: 'raider', name: '突擊', mix: [0, 0.04, 0.16, 0.48, 0.32], formations: ['wedge', 'column', 'spindle'], tactics: ['flank', 'flank', 'breakthrough'] },
  { key: 'missile', name: '飛彈', mix: [0.02, 0.1, 0.46, 0.3, 0.12], formations: ['crescent', 'line'], tactics: ['kite', 'kite', 'push'] },
];
const CAMP_SKILLS = ['focus', 'wall', 'charge', 'rapid', 'evade', 'jam'];

function campLoad() {
  let c = null; try { c = JSON.parse(STORE.getItem(CAMP_STORE) || 'null'); } catch (e) { c = null; }
  if (!c || !c.seed) c = { seed: (Math.random() * 1e9) >>> 0, stage: 1, attempt: 0, best: 1, wins: 0, losses: 0, history: [] };
  return c;
}
function campSave(c) { try { STORE.setItem(CAMP_STORE, JSON.stringify(c)); } catch (e) { /* 只在本次有效 */ } }
const campHash = (...a) => a.reduce((h, v) => (Math.imul(h ^ (v >>> 0), 2654435761) + 0x9e3779b9) >>> 0, 2166136261);

// 關卡本身（地形、預算、時間）：由戰役種子＋關數＋第幾次挑戰決定；敵軍要等選好指揮官才生成
function campStage(c) {
  const st = c.stage, R = mulberry32(campHash(c.seed, st, c.attempt));
  const budget = Math.min(6000, 2400 + 220 * (st - 1));
  const sc = {
    id: 'camp', campaign: true, stage: st, name: `無限戰場 第 ${st} 關`, size: budget < 3400 ? '小型' : budget < 4800 ? '中型' : '大型',
    timeLimit: 300 + Math.min(240, st * 15), budget, maxFleets: st < 3 ? 2 : 3, level: Math.min(3, 1 + Math.floor(st / 4)),
    seed: campHash(c.seed, st, c.attempt, 7) % 100000, terrain: campTerrain(R, st), enemy: [], events: [], intel: { accuracy: 0.8, hide: [] },
  };
  sc.story = `隨機宙域。${sc.terrain.length ? '地形：' + [...new Set(sc.terrain.map((t) => TERRAIN_TYPES[t.type].name))].join('、') + '。' : '開闊宙域，沒有地形。'}敵軍會依你出擊的指揮官平均等級（±3）生成。`;
  return sc;
}
// 隨機地形：星雲、小行星帶放在中間區域；巨大小行星（實體）避開雙方部署區
function campTerrain(R, st) {
  const out = [], n = Math.min(6, 1 + Math.floor(R() * 3) + Math.floor(st / 5));
  const rr = (a, b) => a + R() * (b - a);
  const okRock = (x, z, r) => !(z + r > DEPLOY_ZONE.z0 - 30 || z - r < ENEMY_ZONE.z1 + 30 && z + r > ENEMY_ZONE.z0 - 30) && out.every((t) => t.type !== 'rock' || Math.hypot(t.x - x, t.z - z) > t.r + r + 60);
  for (let k = 0; k < n; k++) {
    const p = R();
    if (p < 0.3) out.push({ type: 'nebula', x: Math.round(rr(-520, 520)), y: Math.round(rr(-90, 90)), z: Math.round(rr(-420, 380)), r: Math.round(rr(140, 260)) });
    else if (p < 0.55) out.push({ type: 'asteroid', x: Math.round(rr(-560, 560)), y: Math.round(rr(-90, 90)), z: Math.round(rr(-400, 370)), r: Math.round(rr(110, 200)) });
    else {
      for (let tries = 0; tries < 12; tries++) {
        const r = Math.round(rr(40, 90)), x = Math.round(rr(-600, 600)), z = Math.round(rr(-450, 420));
        if (okRock(x, z, r)) { out.push({ type: 'rock', x, y: Math.round(rr(-120, 120)), z, r }); break; }
      }
    }
  }
  return out;
}
function campAvgLevel(lo) { const ls = lo.fleets.filter((f) => f.cmdr).map((f) => cmdrLevel(f.cmdr)); return Math.max(1, Math.round(ls.reduce((a, b) => a + b, 0) / Math.max(1, ls.length))); }
// 敵軍：等級 L＝平均等級 ±3；L 決定指揮官等級、技能數、AI 等級、艦隊數與兵力
function campEnemy(sc, lo) {
  const avg = campAvgLevel(lo), R = mulberry32(campHash(sc.seed, avg, 31));
  const L = Math.max(1, avg + (sc.levelOff != null ? sc.levelOff : Math.floor(R() * 7) - 3)), diff = L - avg;
  const pick = (a) => a[Math.floor(R() * a.length)];
  const nF = Math.max(1, Math.min(3, 1 + (L >= 3 ? 1 : 0) + (L >= 6 ? 1 : 0) + (R() < 0.2 ? 1 : 0) - (sc.stage <= 1 ? 1 : 0)));
  const total = sc.budget * (0.9 + 0.05 * diff) * Math.min(1.15, 1 + 0.006 * sc.stage);
  const aiLv = Math.min(5, 1 + Math.floor(L / 3));   // Lv 9 起難度 4、Lv 12 起難度 5
  const names = CAMP_NAMES.slice(); const fnames = CAMP_FLEET_NAMES.slice();
  sc.enemy = [];
  for (let k = 0; k < nF; k++) {
    const A = pick(CAMP_ARCHETYPES), share = total / nF * (0.8 + R() * 0.4);
    const per = A.mix.reduce((s, m, t) => s + m * SHIP_TYPES[t].cost, 0), n = share / per;
    const comp = A.mix.map((m) => Math.round(n * m / 10) * 10);
    const nSk = Math.min(3, 1 + Math.floor(L / 4)), skills = [];
    while (skills.length < nSk) { const s = pick(L >= 5 ? CAMP_SKILLS : CAMP_SKILLS.slice(0, 3)); if (!skills.includes(s)) skills.push(s); }
    const cn = names.splice(Math.floor(R() * names.length), 1)[0], fn = fnames.splice(Math.floor(R() * fnames.length), 1)[0];
    const x = nF === 1 ? Math.round((R() - 0.5) * 200) : Math.round(-380 + 760 * k / (nF - 1) + (R() - 0.5) * 120);
    sc.enemy.push({ name: fn, commander: { name: cn, trait: pick(['dmg', 'shield', 'speed']), level: L, skills },
      comp, formation: pick(A.formations), tactic: pick(A.tactics), x, y: L >= 3 ? Math.round((R() - 0.5) * 240) : 0, z: Math.round(-320 - ZONE_SHIFT - R() * 100), h: 0, archetype: A.name });
  }
  // 等級 4 以上：可能有增援
  sc.events = L >= 4 && R() < Math.min(0.7, 0.2 + 0.06 * L) ? [{ type: 'reinforce', chance: 1, at: [60, 140], name: '敵增援艦隊', comp: defaultComp(total * 0.25), formation: pick(['line', 'crescent', 'wedge']), edge: R() < 0.5 ? 'left' : 'right' }] : [];
  // AI 難度 3 以上（等級 6 起）：帶補給艦隊（約兵力的 10%，跟在第一艦隊後方）；AI 飛彈打完會回去補，受損的船輪替到後排也能戰地維修
  sc.enemySupply = aiLv >= AI_SUPPLY.minLv ? { comp: aiSupplyComp(total),
    formation: 'ring', x: sc.enemy[0].x, z: sc.enemy[0].z - 230, h: 0 } : null;
  sc.level = aiLv; sc.enemyLevel = L; sc.avgLevel = avg;
  return sc;
}
// 戰役畫面
function showCampaign() {
  const c = campLoad();
  setPhase('briefing');
  const hist = (c.history || []).slice(-8).reverse();
  overlay(`<div class="g-wrap" style="max-width:820px">
    <div class="g-head"><h2>無限戰場</h2><span class="crumb">無限關卡・每關重新編成・敵軍依你的指揮官等級生成</span><span class="g-sp"></span><button class="g-btn" id="cp-back">← 單人戰鬥</button></div>
    <div class="g-card" style="margin-bottom:12px"><div class="cp-top">
      <div><span class="g-dim">目前</span><b class="cp-stage">第 ${c.stage} 關</b>${c.attempt ? `<span class="g-dim">（第 ${c.attempt + 1} 次挑戰）</span>` : ''}</div>
      <div><span class="g-dim">最高紀錄</span><b>第 ${c.best} 關</b></div><div><span class="g-dim">勝／敗／平</span><b>${c.wins}／${c.losses}／${c.draws || 0}</b></div></div>
      <dl class="kv" style="margin-top:10px"><dt>規則</dt><dd>每一關的敵人依「出擊指揮官的平均等級 ±3」隨機生成：等級越高，敵方指揮官越強、技能越多、AI 越會打、艦隊越多，兵力也依等級差增減。地形每關隨機。</dd>
      <dt>過關</dt><dd>打贏進下一關（預算、時間限制、艦隊數上限逐關增加）；打輸或平手重打這一關，敵人與地形會重新生成。指揮官經驗照常累積。</dd></dl>
      <div class="g-row" style="margin-top:12px"><button class="g-btn sm" id="cp-reset">從第 1 關重新開始</button><span class="g-sp"></span><button class="g-btn pri" id="cp-go">出擊：第 ${c.stage} 關 →</button></div></div>
    ${hist.length ? `<div class="g-card"><h3>最近的關卡</h3><table class="stat-tbl"><tr><th>關卡</th><th>結果</th><th>敵軍等級</th><th>我方平均等級</th><th>剩餘（我／敵）</th></tr>
      ${hist.map((h) => `<tr><td>第 ${h.stage} 關</td><td class="rec-${h.kind}">${{ win: '勝利', lose: '敗北', draw: '平手' }[h.kind]}</td><td>Lv ${h.el}</td><td>Lv ${h.al}</td><td>${Math.round(h.r[0] * 100)}%／${Math.round(h.r[1] * 100)}%</td></tr>`).join('')}</table></div>` : ''}
  </div>`);
  gEl('cp-back').onclick = showSingle;
  gEl('cp-go').onclick = () => showCampBriefing();
  gEl('cp-reset').onclick = (e) => {
    const b = e.target; if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定重來？（最高紀錄保留）'; return; }
    const n = campLoad(); n.stage = 1; n.attempt = 0; n.seed = (Math.random() * 1e9) >>> 0; campSave(n); showCampaign();
  };
}
// 關卡簡報：地形、預算；選好指揮官後敵軍才會生成，所以這裡只顯示推估等級範圍
function showCampBriefing() {
  const c = campLoad(), sc = campStage(c);
  GAME.sc = sc; GAME.intel = { fleets: [], events: [], acc: 1 };
  // 沿用上一關的編成（指揮官、陣型、機庫），兵力依新預算等比例縮放
  const prev = GAME.campLoadout || c.loadout;
  if (prev && prev.fleets.length) {
    const used = sumA(prev.fleets.map((f) => compCost(f.comp))) || 1, k = sc.budget / used;
    GAME.loadout = { sc: 'camp', faction: prev.faction || 0, fleets: prev.fleets.slice(0, sc.maxFleets).map((f) => ({ ...f, comp: f.comp.map((n) => Math.floor(n * k / 10) * 10), hangar: (f.hangar || HANGAR_DEFAULT).slice() })),
      supplies: supplyList(prev).map((S) => ({ ...S, comp: S.comp.map((n) => Math.floor(n * k / 10) * 10) })) };
  } else { GAME.loadout = defaultLoadout(sc); GAME.loadout.sc = 'camp'; }
  setPhase('briefing');
  const avg = campAvgLevel(GAME.loadout);
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>${sc.name}</h2><span class="crumb">無限戰場　·　${sc.size}　·　${Math.round(sc.timeLimit / 60)} 分鐘</span><span class="g-sp"></span><button class="g-btn" id="cb-back">← 無限戰場</button></div>
    <div class="intel-grid">
      <div class="g-card"><h3>狀況</h3><div>${sc.story}</div>
        <dl class="kv"><dt>勝利條件</dt><dd>殲滅敵軍，或使敵軍損失超過 ${Math.round((1 - ROUT_AT) * 100)}%（潰走）</dd><dt>敗北條件</dt><dd>我軍損失超過 ${Math.round((1 - ROUT_AT) * 100)}%</dd>
        <dt>編成預算</dt><dd>${fmtN(sc.budget)} 點　最多 ${sc.maxFleets} 支艦隊</dd>
        <dt>敵軍等級</dt><dd>出擊指揮官平均等級 ±3（目前編成的平均是 Lv ${avg}，敵軍會在 Lv ${Math.max(1, avg - 3)}～${avg + 3}）</dd>
        <dt>敵軍編成</dt><dd><span class="unk">不明：部署時才會偵測到</span></dd></dl></div>
      <div class="g-card"><h3>戰場環境</h3>${minimapSVG(sc, GAME.intel, GAME.loadout)}
        <div style="margin-top:8px;font-size:calc(12.5px * var(--ui))">${sc.terrain.length ? [...new Set(sc.terrain.map((t) => t.type))].map((k) => `<div><b>${TERRAIN_TYPES[k].name}</b>：<span class="g-dim">${TERRAIN_TYPES[k].desc}</span></div>`).join('') : '<span class="g-dim">開闊宙域，沒有地形影響。</span>'}</div></div>
    </div>
    <div class="g-row" style="margin-top:12px"><span class="g-sp"></span><button class="g-btn pri" id="cb-next">進入編成 →</button></div></div>`);
  gEl('cb-back').onclick = showCampaign;
  gEl('cb-next').onclick = showLoadout;
}
// 打完一關：更新進度（只在第一次產生戰報時呼叫）
function campResult(R) {
  const sc = GAME.sc; if (!sc || !sc.campaign) return;
  const c = campLoad();
  if (sc.stage !== c.stage) return;   // 舊的關卡（例如回放）不算
  (c.history || (c.history = [])).push({ stage: c.stage, kind: R.kind, el: sc.enemyLevel, al: sc.avgLevel, r: R.ratio, t: Date.now() });
  if (c.history.length > 50) c.history.shift();
  if (R.kind === 'win') { c.stage++; c.attempt = 0; c.wins++; c.best = Math.max(c.best, c.stage); }
  else { if (!R.retreat) c.attempt++; if (R.kind === 'draw') c.draws = (c.draws || 0) + 1; else c.losses++; }   // 撤退不重新生成敵軍與地形（不能用撤退重抽）
  GAME.campLoadout = JSON.parse(JSON.stringify(GAME.loadout));
  c.loadout = GAME.campLoadout;   // 存進進度：重新整理頁面後下一關一樣沿用
  campSave(c);
  GAME.campOutcome = R.kind;
}

// ═══════════════════════ 隨機戰役：單場作戰，自選規模／敵軍強度／地形，敵軍與地形每次重新生成 ═══════════════════════
// 不影響無限戰場進度；敵軍一樣依出擊指揮官的平均等級生成（campEnemy），只是等級差由玩家決定
const RAND_STORE = 'fleet.random';
const RAND_SIZES = [
  { name: '小型', budget: 2400, maxFleets: 2, time: 300, stage: 3 },
  { name: '中型', budget: 3600, maxFleets: 3, time: 420, stage: 6 },
  { name: '大型', budget: 5000, maxFleets: 3, time: 540, stage: 10 },
];
const RAND_DIFF = [{ name: '較弱', off: -2 }, { name: '相當', off: 0 }, { name: '較強', off: 2 }, { name: '隨機', off: null }];
const RAND_TERR = [{ name: '無', st: -1 }, { name: '少', st: 0 }, { name: '多', st: 14 }, { name: '隨機', st: null }];
// 敵軍外觀：fac＝陣營編號（null＝對立的帝國／聯盟，'rand'＝從非人類正規軍的五個陣營隨機挑）；只換外觀，戰力規則不變
const RAND_LOOK = [{ name: '對立陣營', fac: null }, { name: '傭兵', fac: 2 }, { name: '機械改造人類', fac: 3 }, { name: '機械智慧族', fac: 4 }, { name: '蟲族感染人類', fac: 5 }, { name: '蟲族', fac: 6 }, { name: '隨機', fac: 'rand' }];
const randSeed = () => ((Math.random() * 1e9) >>> 0) || 1;
function randOpts() {
  let o = null; try { o = JSON.parse(STORE.getItem(RAND_STORE) || 'null'); } catch (e) { o = null; }
  o = Object.assign({ size: 1, diff: 1, terr: 3, look: 0, seed: 0 }, o || {});
  if (!RAND_SIZES[o.size]) o.size = 1; if (!RAND_DIFF[o.diff]) o.diff = 1; if (!RAND_TERR[o.terr]) o.terr = 3; if (!RAND_LOOK[o.look]) o.look = 0;
  if (!o.seed) o.seed = randSeed();
  return o;
}
function randSave(o) { try { STORE.setItem(RAND_STORE, JSON.stringify(o)); } catch (e) { /* 只在本次有效 */ } }
function randStage(o) {
  const S = RAND_SIZES[o.size], R = mulberry32(campHash(o.seed, o.size, o.terr, 3));
  let st = RAND_TERR[o.terr].st; if (st == null) st = R() < 0.15 ? -1 : Math.floor(R() * 15);
  const sc = {
    id: 'rand', random: true, sizeIdx: o.size, stage: S.stage, levelOff: RAND_DIFF[o.diff].off, name: `隨機戰役・${S.name}`, size: S.name,
    timeLimit: S.time, budget: S.budget, maxFleets: S.maxFleets, level: 1, seed: campHash(o.seed, o.size, o.diff, o.terr, 9) % 100000,
    terrain: st < 0 ? [] : campTerrain(R, st), enemy: [], events: [], intel: { accuracy: 0.8, hide: [] },
  };
  const lk = RAND_LOOK[o.look].fac, L = mulberry32(campHash(o.seed, 7));
  if (lk === 'rand') sc.enemyFac = 2 + Math.floor(L() * 5); else if (lk != null) sc.enemyFac = lk;
  return sc;
}
// 編成沿用上一場（指揮官、陣型、機庫）；預算不同時兵力等比例縮放
function randLoadout(sc) {
  const cur = GAME.loadout;
  if (cur && cur.sc === 'rand' && cur.budget === sc.budget) return cur;
  const prev = cur && cur.sc === 'rand' ? cur : GAME.randLoadout;
  let lo;
  if (prev && prev.fleets && prev.fleets.length) {
    const used = sumA(prev.fleets.map((f) => compCost(f.comp))) || 1, k = prev.budget === sc.budget ? 1 : sc.budget / used;
    lo = { sc: 'rand', faction: prev.faction || 0, fleets: prev.fleets.slice(0, sc.maxFleets).map((f) => ({ ...f, comp: f.comp.map((n) => (k === 1 ? n : Math.floor(n * k / 10) * 10)), hangar: (f.hangar || HANGAR_DEFAULT).slice() })),
      supplies: supplyList(prev).map((S) => ({ ...S, comp: S.comp.map((n) => (k === 1 ? n : Math.floor(n * k / 10) * 10)) })) };
  } else { lo = defaultLoadout(sc); lo.sc = 'rand'; }
  lo.budget = sc.budget;
  return lo;
}
function randReroll() { const o = randOpts(); o.seed = randSeed(); randSave(o); showRandom(); }
function showRandom() {
  const o = randOpts(), sc = randStage(o), S = RAND_SIZES[o.size], D = RAND_DIFF[o.diff];
  GAME.sc = sc; GAME.intel = { fleets: [], events: [], acc: 1 };
  GAME.loadout = randLoadout(sc);
  setPhase('briefing');
  const avg = campAvgLevel(GAME.loadout);
  const seg = (key, arr) => `<div class="wed-seg rd-seg" data-opt="${key}">${arr.map((a, k) => `<button data-v="${k}" class="${o[key] === k ? 'on' : ''}">${a.name}</button>`).join('')}</div>`;
  const terr = sc.terrain.length ? [...new Set(sc.terrain.map((t) => t.type))].map((k) => `<div><b>${TERRAIN_TYPES[k].name}</b>：<span class="g-dim">${TERRAIN_TYPES[k].desc}</span></div>`).join('') : '<span class="g-dim">開闊宙域，沒有地形影響。</span>';
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>隨機戰役</h2><span class="crumb">單場作戰・敵軍與地形隨機生成・不影響無限戰場進度</span><span class="g-sp"></span><button class="g-btn" id="rd-back">← 單人戰鬥</button></div>
    <div class="intel-grid">
      <div class="g-card"><h3>戰場設定</h3>
        <dl class="kv rd-opts"><dt>規模</dt><dd>${seg('size', RAND_SIZES)}<div class="g-dim">預算 ${fmtN(S.budget)} 點・最多 ${S.maxFleets} 支艦隊・${Math.round(S.time / 60)} 分鐘</div></dd>
        <dt>敵軍強度</dt><dd>${seg('diff', RAND_DIFF)}<div class="g-dim">依出擊指揮官的平均等級（目前 Lv ${avg}）：敵軍 ${D.off == null ? `Lv ${Math.max(1, avg - 3)}～${avg + 3} 隨機` : `Lv ${Math.max(1, avg + D.off)}`}。等級越高，敵方技能越多、AI 越會打、兵力越多</div></dd>
        <dt>地形</dt><dd>${seg('terr', RAND_TERR)}<div class="g-dim">星雲、小行星帶、巨大小行星隨機放在戰場中段</div></dd>
        <dt>敵軍外觀</dt><dd>${seg('look', RAND_LOOK)}<div class="g-dim">只換敵軍艦船的外觀與顏色，戰力規則不變${sc.enemyFac != null ? `・這一場：<b class="g-${FACTION_CLS[sc.enemyFac]}">${FACTION_NAME[sc.enemyFac]}</b>` : ''}</div></dd>
        <dt>勝利條件</dt><dd>殲滅敵軍，或使敵軍損失超過 ${Math.round((1 - ROUT_AT) * 100)}%（潰走）</dd><dt>敗北條件</dt><dd>我軍損失超過 ${Math.round((1 - ROUT_AT) * 100)}%</dd>
        <dt>敵軍編成</dt><dd><span class="unk">不明：部署時才會偵測到</span></dd>
        <dt>獎勵</dt><dd>指揮官經驗、功勳（規模越大、敵軍等級越高越多）</dd></dl></div>
      <div class="g-card"><h3>戰場環境</h3>${minimapSVG(sc, GAME.intel, GAME.loadout)}<div style="margin-top:8px;font-size:calc(12.5px * var(--ui))">${terr}</div></div>
    </div>
    <div class="g-row" style="margin-top:12px"><button class="g-btn" id="rd-roll">⟳ 換一個戰場</button><span class="g-dim" style="font-size:calc(12px * var(--ui))">同樣的設定重新生成地形與敵軍</span><span class="g-sp"></span><button class="g-btn pri" id="rd-next">進入編成 →</button></div></div>`);
  gEl('rd-back').onclick = showSingle;
  gEl('rd-roll').onclick = randReroll;
  gEl('rd-next').onclick = showLoadout;
  document.querySelectorAll('.rd-seg').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => { o[g.dataset.opt] = +b.dataset.v; randSave(o); showRandom(); })));
}
