// ═══════════════════════ AI 對戰觀摩 ═══════════════════════
// 選雙方 AI 的難度、打法、艦隊類型，產生一個模擬室布局（雙方都由 AI 指揮，m.watch）照正式規則開打；玩家只能看。
// 戰鬥中左側面板即時顯示每支艦隊的 AI 判斷（aiThink 寫在 f.aiS.note），戰後報告附上打法重點與簡單分析。
const WATCH_STORE = 'fleet.watch2';   // 2：預設改成全隨機
const WATCH_TAC = ['push', 'kite', 'flank', 'breakthrough'];
// 難度 → 指揮官等級（決定特性加成與技能數，同無限戰場的敵軍）
const WATCH_LV = [
  { name: '難度 1', cl: 2, desc: '只照偏好的打法行動，不會反制。' },
  { name: '難度 2', cl: 5, desc: '會反制：被包抄或損失加速時開「鐵壁」或「機動迴避」、轉向迎擊側背、「集中火力」打最弱的分艦隊、進入射程開「極速射擊」、遠了就「突進」。' },
  { name: '難度 3', cl: 8, desc: '難度 2 的反制，再加上針對：對手紡錘陣衝來就改凹形陣包夾；被遠距離消耗就改成逼近突進；接敵前「干擾」對手變陣。' },
  { name: '難度 4', cl: 11, desc: '難度 3 的全部，再加上：被包抄就改圓陣、脫離後換回；射程內優先打航母和快被打垮的分艦隊。' },
  { name: '難度 5', cl: 14, desc: '難度 4 的全部，再加上：各艦隊協同集中打同一處；後段看戰損調整打法（領先就拉開距離拖時間，落後就全力進攻）。' },
];
const WATCH_TIPS = {
  push: '看它停在中距離維持陣線：主砲只打前方，正面對射拚的是火力與陣型寬度。對付它可以從側翼繞過去，或拉開距離消耗。',
  kite: '看它被逼近就後退、一直待在戰列艦射程邊緣：用速度快的艦隊或「衝鋒」貼上去，它的距離優勢就沒了。',
  flank: '看牽制與包抄的分工：第一艦隊在正面拖住，其他艦隊繞到側面（側背受擊傷害較高）。被繞側時要轉向或開「鐵壁」。',
  breakthrough: '看紡錘陣集中衝擊一點、穿過去再掉頭：用凹形陣兩翼包夾，或側移讓它衝空。',
};
const WATCH_PRESETS = [
  { name: '全隨機', desc: '規模、難度、打法、艦隊類型與數量都隨機（每一場都不一樣）', s: [{ lv: -1, tac: 'rand', arch: -1, n: -1 }, { lv: -1, tac: 'rand', arch: -1, n: -1 }], size: -1 },
  { name: '難度 1 vs 難度 3', desc: '同樣正面推進，看反制差多少', s: [{ lv: 0, tac: 'push', arch: 0, n: 2 }, { lv: 2, tac: 'push', arch: 0, n: 2 }] },
  { name: '推進 vs 消耗', desc: '重砲陣線對上飛彈艦隊拉距離', s: [{ lv: 1, tac: 'push', arch: 1, n: 2 }, { lv: 1, tac: 'kite', arch: 4, n: 2 }] },
  { name: '推進 vs 包抄', desc: '一支牽制、一支繞側', s: [{ lv: 1, tac: 'push', arch: 0, n: 2 }, { lv: 1, tac: 'flank', arch: 3, n: 2 }] },
  { name: '推進 vs 突破', desc: '紡錘陣直衝陣線中央', s: [{ lv: 1, tac: 'push', arch: 1, n: 2 }, { lv: 1, tac: 'breakthrough', arch: 3, n: 2 }] },
  { name: '突破 vs 難度 3', desc: '看高難度 AI 怎麼用凹形陣反制', s: [{ lv: 0, tac: 'breakthrough', arch: 3, n: 2 }, { lv: 2, tac: 'push', arch: 0, n: 2 }] },
  { name: '難度 3 vs 難度 5', desc: '同樣的打法，看圓陣反制、選目標與協同集火的差別', s: [{ lv: 2, tac: 'flank', arch: 0, n: 3 }, { lv: 4, tac: 'flank', arch: 0, n: 3 }], size: 1 },
];
const watchTacName = (t) => (t === 'rand' ? '隨機' : TACTICS[t].name);
const watchTacDesc = (t) => TACTICS[t].desc.replaceAll('玩家', '對手');   // 打法說明原本是寫給敵方 AI 的
const watchLvName = (lv) => (lv < 0 ? '難度隨機' : WATCH_LV[lv].name);
const WATCH_RANDOM = () => JSON.parse(JSON.stringify(WATCH_PRESETS[0].s));   // 預設：全隨機

function watchOpts() {
  let o = null; try { o = JSON.parse(STORE.getItem(WATCH_STORE) || 'null'); } catch (e) { o = null; }
  o = Object.assign({ size: -1, terr: 3, seed: 0, s: WATCH_RANDOM() }, o || {});
  if (o.size !== -1 && !RAND_SIZES[o.size]) o.size = -1; if (!RAND_TERR[o.terr]) o.terr = 3;
  if (!Array.isArray(o.s) || o.s.length !== 2) o.s = WATCH_RANDOM();
  for (const s of o.s) {
    if (!(s.lv >= -1 && s.lv < WATCH_LV.length)) s.lv = -1;
    if (s.tac !== 'rand' && !TACTICS[s.tac]) s.tac = 'rand';
    if (!(s.arch >= -1 && s.arch < CAMP_ARCHETYPES.length)) s.arch = -1;
    if (!(s.n === -1 || s.n >= 1 && s.n <= 3)) s.n = -1;
  }
  if (!o.seed) o.seed = randSeed();
  return o;
}
function watchSave(o) { try { STORE.setItem(WATCH_STORE, JSON.stringify(o)); } catch (e) { /* 只在本次有效 */ } }
function watchSummary() {
  const o = watchOpts();
  if (o.size < 0 && o.s.every((s) => s.lv < 0 && s.tac === 'rand' && s.arch < 0 && s.n < 0)) return '全隨機：每一場都不一樣';
  return o.s.map((s) => `${watchLvName(s.lv)}・${watchTacName(s.tac)}`).join('　vs　'); }

// 設定 → 模擬室布局（同一組設定＋種子＝同一場）
function watchLayout(o) {
  const R = mulberry32(campHash(o.seed, o.size + 1, o.terr, 77));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const S = RAND_SIZES[o.size >= 0 ? o.size : Math.floor(R() * RAND_SIZES.length)];
  let st = RAND_TERR[o.terr].st; if (st == null) st = R() < 0.15 ? -1 : Math.floor(R() * 15);
  const m = { name: '', fac: 0, victory: true, ctl: -1, watch: true, seed: campHash(o.seed, o.size + 1, 5) % 100000, fleets: [], terrain: st < 0 ? [] : campTerrain(R, st), sides: [] };
  const names = CAMP_NAMES.slice();
  o.s.forEach((sd, side) => {
    const li = sd.lv < 0 ? Math.floor(R() * WATCH_LV.length) : sd.lv, L = WATCH_LV[li].cl, tac = sd.tac === 'rand' ? pick(WATCH_TAC) : sd.tac;
    const nF = sd.n < 0 ? 1 + Math.floor(R() * S.maxFleets) : Math.max(1, Math.min(S.maxFleets, sd.n));
    m.sides.push({ lv: li, tac });
    for (let k = 0; k < nF; k++) {
      const A = sd.arch >= 0 ? CAMP_ARCHETYPES[sd.arch] : pick(CAMP_ARCHETYPES);
      const per = A.mix.reduce((s, x, t) => s + x * SHIP_TYPES[t].cost, 0), n = S.budget / nF / per;
      const comp = A.mix.map((x) => Math.round(n * x / 10) * 10);
      const t = tac === 'flank' && nF >= 2 && k === 0 ? 'push' : tac;   // 包抄：第一艦隊在正面牽制，其他繞側
      const skills = [], nSk = Math.min(3, 1 + Math.floor(L / 4));
      while (skills.length < nSk) { const s = pick(L >= 5 ? CAMP_SKILLS : CAMP_SKILLS.slice(0, 3)); if (!skills.includes(s)) skills.push(s); }
      const cn = names.splice(Math.floor(R() * names.length), 1)[0] || '指揮官';
      m.fleets.push({ side, name: `第${SIM_CN[k]}艦隊（${A.name}）`, cmdr: { base: null, name: cn, title: '', trait: pick(['dmg', 'shield', 'speed']), level: L, mode: 'lv', tal: {}, skills },
        comp, hangar: HANGAR_DEFAULT.slice(), formation: tac === 'breakthrough' ? 'spindle' : pick(A.formations), orderly: false, layers: 1,
        x: nF === 1 ? 0 : Math.round(-380 + 760 * k / (nF - 1)), z: side ? -360 : 360, y: 0, h: side ? 0 : Math.PI,
        ai: { tactic: t, level: li + 1 }, reserve: false, at: 60 });
    }
  });
  m.name = `${S.name}・` + m.sides.map((s) => `${WATCH_LV[s.lv].name}・${TACTICS[s.tac].name}`).join(' vs ');
  return m;
}
function watchGo(reroll) {
  const o = watchOpts(); if (reroll) o.seed = randSeed(); watchSave(o);
  simEndMid(); overlay(null);
  SIM.m = watchLayout(o); SIM.sel = null;
  camAnim = null; view.target.x = 0; view.target.z = 0; view.height = 1500; view.yaw = 0; view.pitch = ELEV; updateCamera();
  simStart();
}

// ───── 設定畫面 ─────
function showWatch() {
  const o = watchOpts();
  setPhase('briefing'); GAME.watch = false;
  const seg = (attr, list, cur) => `<div class="wed-seg rd-seg" ${attr}>${list.map(([v, n]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const sideCard = (sd, side) => `<div class="g-card wt-side"><h3 class="${side ? 'g-ec' : 'g-pc'}">${FACTION_NAME[side]}</h3>
    <dl class="kv rd-opts">
      <dt>AI 難度</dt><dd>${seg(`data-ws="${side}:lv"`, [...WATCH_LV.map((l, i) => [i, l.name]), [-1, '隨機']], sd.lv)}<div class="g-dim">${sd.lv < 0 ? '開戰時隨機決定' : WATCH_LV[sd.lv].desc}</div></dd>
      <dt>打法</dt><dd>${seg(`data-ws="${side}:tac"`, [...WATCH_TAC.map((k) => [k, TACTICS[k].name]), ['rand', '隨機']], sd.tac)}<div class="g-dim">${sd.tac === 'rand' ? '開戰時隨機決定' : `${watchTacDesc(sd.tac)}<br>觀戰重點：${WATCH_TIPS[sd.tac]}`}</div></dd>
      <dt>艦隊類型</dt><dd>${seg(`data-ws="${side}:arch"`, [...CAMP_ARCHETYPES.map((a, i) => [i, a.name]), [-1, '隨機']], sd.arch)}<div class="g-dim">${sd.arch < 0 ? '每支艦隊隨機' : `編成比例 航母／戰列／巡洋／驅逐／護衛＝${CAMP_ARCHETYPES[sd.arch].mix.map((x) => Math.round(x * 100)).join('／')}%`}</div></dd>
      <dt>艦隊數</dt><dd>${seg(`data-ws="${side}:n"`, [[1, '1 支'], [2, '2 支'], [3, '3 支'], [-1, '隨機']], sd.n)}<div class="g-dim">雙方總兵力（點數）相同，平均分給各艦隊；小型最多 2 支</div></dd>
    </dl></div>`;
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>AI 對戰觀摩</h2><span class="crumb">雙方都由 AI 指揮・即時解說・不計戰績</span><span class="g-sp"></span><button class="g-btn" id="wt-back">← 單人戰鬥</button></div>
    <div class="g-card" style="margin-bottom:12px"><h3>快速組合</h3><div class="wt-presets">${WATCH_PRESETS.map((p, i) => `<button class="g-btn wt-pre" data-pre="${i}"><b>${p.name}</b><small>${p.desc}</small></button>`).join('')}</div></div>
    <div class="intel-grid">${o.s.map(sideCard).join('')}</div>
    <div class="g-card" style="margin-top:12px"><h3>戰場</h3><dl class="kv rd-opts">
      <dt>規模</dt><dd>${seg('data-wo="size"', [...RAND_SIZES.map((s, i) => [i, s.name]), [-1, '隨機']], o.size)}<div class="g-dim">${o.size < 0 ? '每一場隨機' : `每一方 ${fmtN(RAND_SIZES[o.size].budget)} 點兵力`}</div></dd>
      <dt>地形</dt><dd>${seg('data-wo="terr"', RAND_TERR.map((s, i) => [i, s.name]), o.terr)}</dd>
      <dt>規則</dt><dd>${opSeg('wt-op')}<div class="g-dim">${OP_LEVELS[opLevel()].desc}（與單人戰鬥共用；觀摩時不會鎖在艦橋）</div></dd>
      <dt>觀看方式</dt><dd class="g-dim">左側面板顯示每支艦隊 AI 目前的判斷，點名稱鏡頭會跳過去；技能與反制也會出現在通知裡。不能下令；滑鼠左鍵拖曳＝移動畫面、右鍵拖曳＝調整視角（3D）、滾輪＝縮放，也可以暫停、調速度、切 2D／3D、開戰術面板。打完可以看回放，或把這場帶到模擬室自己接手。</dd>
    </dl></div>
    <div class="g-row" style="margin-top:12px"><button class="g-btn" id="wt-reset" title="所有選項改回隨機">全部改回隨機</button><span class="g-dim" style="font-size:calc(12px * var(--ui))">每一場都會重新隨機：標成「隨機」的選項、戰場地形、指揮官與編成細節</span><span class="g-sp"></span><button class="g-btn pri" id="wt-go">開始觀摩 →</button></div></div>`);
  gEl('wt-reset').onclick = () => { o.s = WATCH_RANDOM(); o.size = -1; o.terr = 3; keep(); };
  gEl('wt-back').onclick = showSingle;
  gEl('wt-go').onclick = () => watchGo(true);
  bindOpSeg('wt-op', showWatch);
  const keep = () => { const y = gEl('game').scrollTop; watchSave(o); showWatch(); gEl('game').scrollTop = y; };
  document.querySelectorAll('[data-pre]').forEach((b) => (b.onclick = () => { const p = WATCH_PRESETS[+b.dataset.pre]; o.s = JSON.parse(JSON.stringify(p.s)); if (p.size != null) o.size = p.size; keep(); }));
  document.querySelectorAll('[data-ws]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    const [side, key] = g.dataset.ws.split(':'), v = b.dataset.v;
    o.s[+side][key] = key === 'tac' ? v : +v; keep();
  })));
  document.querySelectorAll('[data-wo]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => { o[g.dataset.wo] = +b.dataset.v; keep(); })));
}

// ───── 戰鬥中的解說面板 ─────
function watchHud() {
  let el = gEl('watchbar');
  if (!GAME.watch) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement('div'); el.id = 'watchbar'; document.body.appendChild(el);
  // 面板每 0.15 秒重畫，用 pointerdown 才不會被重畫吃掉點擊
  el.onpointerdown = (e) => {
    e.stopPropagation();
    if (e.target.closest('.wb-h')) { el.classList.toggle('min'); return; }
    const b = e.target.closest('[data-wf]'); if (!b) return;
    const f = fleets.find((o) => o.id === +b.dataset.wf), c = f && centerOf(fleetAlive(f));
    if (c) { camAnim = null; view.target.x = c.x; view.target.z = c.z; updateCamera(); }
  };
}
function watchFrame() {
  const el = gEl('watchbar'); if (!el) return;
  { const h = gEl('hud'), r = h && getComputedStyle(h).display !== 'none' ? h.getBoundingClientRect() : null; const top = r && r.height ? r.bottom + 8 : 70; el.style.top = top + 'px'; el.style.maxHeight = `calc(100vh - ${top + 90}px)`; }   // 放在左上角資訊欄的下面
  const m = SIM.m, side = (s) => {
    const info = m.sides && m.sides[s], col = FACTION[SIDE_FAC[s]].ui;
    const rows = fleets.filter((f) => f.side === s).map((f) => {
      const n = sumA(f.sqs.map((q) => q.alive)), g = fleetGroup(f), dead = n <= 0;
      const note = dead ? '全滅' : f.reserve ? '尚未出場' : (f.aiS && f.aiS.note) || '觀察戰場中…';
      return `<button class="wb-f ${dead ? 'dead' : ''}" data-wf="${f.id}"><span class="wb-t"><b>${escH(f.name)}</b><span>${Math.round(n / Math.max(1, f.initial) * 100)}%</span></span>
        <small>${f.ai ? `${TACTICS[f.ai.tactic].name}・難度 ${f.ai.level}` : ''}${g && FORMATIONS[g.formation] ? `・${FORMATIONS[g.formation].name}` : ''}・${escH(f.commander ? f.commander.name : '')}</small><i>${escH(note)}</i></button>`;
    }).join('');
    return `<div class="wb-side"><div class="wb-sn" style="color:${col}">${FACTION_NAME[SIDE_FAC[s]]}${info ? `<span>${WATCH_LV[info.lv].name}・${TACTICS[info.tac].name}</span>` : ''}</div>${rows}</div>`;
  };
  el.innerHTML = `<div class="wb-h"><b>AI 即時判斷</b><span class="g-dim">點這裡收合</span></div><div class="wb-body">${side(0)}${side(1)}</div>`;
}

// ───── 戰後：打法重點與簡單分析 ─────
function watchReportHtml(m, R) {
  const nm = (s) => simSideName(m, s), lines = [], loser = R.kind === 'win' ? 1 : R.kind === 'lose' ? 0 : -1;
  for (const s of [0, 1]) {
    const d = dmgStats[s], tot = sumA(d), sp = tot > 0 ? (d[1] + d[2]) / tot : 0;
    if (sp > 0.35) lines.push(`${nm(s)} 有 ${Math.round(sp * 100)}% 的損失來自側面或背後${s === loser ? '：被繞側、被穿透後沒有及時轉向，是吃虧的主因之一。' : '（側背受擊傷害較高，贏了也付出不少代價）。'}`);
    const sk = fleets.filter((f) => f.side === s).reduce((a, f) => a + Object.values(f.skills).reduce((b, x) => b + (x.used || 0), 0), 0);
    lines.push(`${nm(s)} 一共用了 ${sk} 次技能。`);
  }
  if (R.kind === 'win' || R.kind === 'lose') {
    const w = R.kind === 'win' ? 0 : 1, info = m.sides && m.sides[w];
    if (info) lines.unshift(`<b>${nm(w)}（${WATCH_LV[info.lv].name}・${TACTICS[info.tac].name}）獲勝</b>，剩餘兵力 ${Math.round(R.ratio[w] * 100)}%。`);
  }
  const card = (s) => { const info = m.sides && m.sides[s]; if (!info) return ''; return `<div class="g-card"><h3 class="${s ? 'g-ec' : 'g-pc'}">${nm(s)}：${WATCH_LV[info.lv].name}・${TACTICS[info.tac].name}</h3>
    <div style="line-height:1.65">${watchTacDesc(info.tac)}<br><span class="g-dim">AI 等級：${WATCH_LV[info.lv].desc}</span><br>觀戰重點：${WATCH_TIPS[info.tac]}</div></div>`; };
  return `<div class="g-card" style="margin-top:12px"><h3>這場的重點</h3><div style="line-height:1.7">${lines.join('<br>')}</div></div>
    <div class="intel-grid" style="margin-top:12px">${card(0)}${card(1)}</div>`;
}
