
// ═══════════════════════ 多人戰鬥：內網 1 對 1＋觀戰 ═══════════════════════
// 大廳 → 房間（房主選規模、地形、操作難度、速度）→ 各自編成、部署 → 雙方準備好就開戰 → 戰後報告
// 同步方式：鎖步。伺服器每一回合（NET.K 個 tick）把收到的命令廣播出來，每個瀏覽器用同樣的種子、規則、開局，
// 照同樣的命令各自跑模擬（見 main.js 的 issue／frame）。雙方定期互比戰局指紋，不一樣就提示不同步。
// 多人的指揮官只有初始的幾位，等級與天賦另外存（fleet.pvpcmdrs）；功勳算進單人的星際酒館。
const MP_SIZES = [
  { name: '小型', budget: 2400, maxFleets: 2, time: 360 },
  { name: '中型', budget: 3600, maxFleets: 3, time: 480 },
  { name: '大型', budget: 5000, maxFleets: 3, time: 600 },
];
const MP_SPEEDS = [0.5, 1, 2, 4];   // 與伺服器一致
const MP_ZONES = [DEPLOY_ZONE, { x0: -520, x1: 520, z0: -420 - ZONE_SHIFT, z1: -170 - ZONE_SHIFT }];   // 第二方＝第一方的部署區轉 180°
const MP_HASH_EVERY = 120;   // 每 2 秒（模擬時間）互比一次戰局指紋
const MP_LO_STORE = 'fleet.pvplo';

// ───── 指揮官：進入多人畫面時換成多人用的（初始指揮官＋多人的等級天賦），離開時換回來 ─────
function pvpEnter() {
  if (GAME.pvp) return;
  GAME.pvp = { cmdrs: COMMANDERS.slice(), lo: GAME.loadout, sc: GAME.sc, talSel: GAME.talSel };
  COMMANDERS.length = 0; COMMANDERS.push(...COMMANDERS_BASE);
  CMDR_SAVE = loadCmdrs();
}
function pvpExit() {
  const p = GAME.pvp; if (!p) return;
  GAME.pvp = null;
  COMMANDERS.length = 0; COMMANDERS.push(...p.cmdrs);
  CMDR_SAVE = loadCmdrs();
  GAME.loadout = p.lo; GAME.sc = p.sc; GAME.talSel = p.talSel; GAME.playerSide = 0;
}

// ───── 連線 ─────
const netAct = (op, b = {}) => API.post('api/mp/act', { op, ...b });
async function netConnect() {
  if (NET.conn) return;
  const ctl = new AbortController(); NET.conn = ctl;
  try {
    const r = await fetch('api/mp/stream', { headers: API.headers(), signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    NET.online = true; mpStatus();
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) { try { netMsg(JSON.parse(line)); } catch (e) { console.warn('多人訊息處理失敗', e); } } }
    }
  } catch (e) { if (ctl.signal.aborted) return; }
  if (NET.conn !== ctl) return;
  NET.conn = null; NET.online = false; mpStatus();
  if (NET.want) setTimeout(() => { if (NET.want) netConnect(); }, 1500);   // 斷線：自動重連（戰鬥中重連後會從頭快轉追上）
}
function netClose() { NET.want = false; const c = NET.conn; NET.conn = null; NET.online = false; if (c) c.abort(); }
function mpStatus() { const e = gEl('mp-st'); if (e) { e.textContent = NET.online ? '● 已連線' : '○ 連線中…'; e.className = NET.online ? 'g-good' : 'g-warn'; } }
// 離開多人戰鬥（回主選單、單人戰鬥時呼叫）
function mpQuit() {
  if (!NET.want && !NET.conn && !NET.on) return;
  if (NET.room) netAct('leave').catch(() => {});
  netClose();
  NET.on = false; NET.spec = false; NET.room = null; NET.seat = -1; NET.screen = null; NET.chat = [];
}

function netMsg(m) {
  switch (m.t) {
    case 'hello': NET.me = m.me; break;
    case 'lobby':
      NET.lobby = m.rooms;
      if (NET.room) { NET.room = null; NET.seat = -1; if (NET.screen !== 'battle' && NET.screen !== 'report') showLobby(); }
      else if (NET.screen === 'lobby') showLobby();
      break;
    case 'room': {
      const first = !NET.room || NET.room.id !== m.room.id;
      NET.room = m.room; NET.seat = m.room.seats.findIndex((s) => s && s.id === (NET.me && NET.me.id));
      if (first) NET.chat = [];
      if (NET.screen === 'lobby' || NET.screen === 'room') showRoom();
      else if ((NET.screen === 'loadout' || NET.screen === 'deploy') && NET.seat < 0) showRoom();
      else if (NET.screen === 'loadout' && GAME.sc && JSON.stringify(m.room.opts) !== GAME.sc.optsKey) { toast('房主改了設定，請重新編成', 'hint'); mpGoLoadout(); }
      else if (NET.screen === 'deploy' && GAME.sc && JSON.stringify(m.room.opts) !== GAME.sc.optsKey) { toast('房主改了設定，請重新編成', 'hint'); fieldGroup.clear(); mpGoLoadout(); }
      break;
    }
    case 'left':
      NET.room = null; NET.seat = -1;
      if (NET.on) { NET.on = false; NET.spec = false; }
      showLobby(m.why);
      break;
    case 'kicked': NET.want = false; mpQuit(); showMenu(); gEl('mm-note').textContent = m.why; break;
    case 'start': netBegin(m.start, m.cmds, m.turn); break;
    case 'turn':
      if (!NET.on) break;
      if (m.c) for (const c of m.c) cmdQueue.push(c);   // 伺服器的順序就是執行順序（每個人都一樣）
      NET.bound = (m.n + 1) * NET.K;
      break;
    case 'desync': if (NET.on && !NET.desync) { NET.desync = true; toast(`連線不同步（tick ${m.tick}）：雙方看到的戰況可能不一樣了，結果以各自畫面為準`, 'bad'); } break;
    case 'note': toast(m.msg, 'hint'); break;
    case 'chat':
      NET.chat.push(m); if (NET.chat.length > 60) NET.chat.shift();
      if (NET.screen === 'room') mpChatDraw(); else toast(`${m.from}：${m.msg}`, 'hint');
      break;
  }
}

// ───── 房間設定 → 戰場 ─────
function mpScenario(o) {
  const S = MP_SIZES[o.size] || MP_SIZES[1];
  return { id: 'pvp', mp: true, sizeIdx: o.size, op: o.op, name: `多人對戰・${S.name}`, size: S.name, budget: S.budget, maxFleets: S.maxFleets, timeLimit: S.time, level: 1,
    seed: o.map, terrain: mpTerrain(o), enemy: [], events: [], intel: { accuracy: 1, hide: [] }, optsKey: JSON.stringify(o) };
}
// 地形：點對稱（轉 180° 一樣），雙方公平；巨大小行星不壓到任何一方的部署區
function mpTerrain(o) {
  const R = mulberry32(campHash(o.map, o.terr, 5));
  let st = RAND_TERR[o.terr] ? RAND_TERR[o.terr].st : null; if (st == null) st = R() < 0.15 ? -1 : Math.floor(R() * 15);
  if (st < 0) return [];
  const base = campTerrain(R, st), out = [];
  for (const t of base.slice(0, Math.ceil(base.length / 2))) {
    if (t.type === 'rock' && Math.abs(t.z) + t.r > 140) continue;
    out.push(t);
    if (Math.hypot(t.x, t.z) > t.r + 30) out.push({ ...t, x: -t.x, z: -t.z });
  }
  return out;
}
// 自己的編成（位置一律用第一方的座標）；預算不同時兵力等比例縮放
function mpLoadout(sc, faction) {
  let lo = NET.lo;
  if (!lo) { try { lo = JSON.parse(STORE.getItem(MP_LO_STORE) || 'null'); } catch (e) { lo = null; } }
  if (lo && lo.fleets && lo.fleets.length) {
    if (lo.budget !== sc.budget) {
      const k = sc.budget / (lo.budget || 1);
      for (const f of lo.fleets) f.comp = f.comp.map((n) => Math.floor(n * k / 10) * 10);
      for (const S of supplyList(lo)) S.comp = S.comp.map((n) => Math.floor(n * k / 10) * 10);
    }
  } else lo = defaultLoadout(sc, faction);
  lo.sc = 'pvp'; lo.budget = sc.budget; lo.fleets = lo.fleets.slice(0, sc.maxFleets);
  if ((lo.faction || 0) !== faction) { lo.faction = faction; for (const f of lo.fleets) f.cmdr = null; }
  fixLoadoutCmdrs(lo);
  if (!lo.fleets.length) lo.fleets = defaultLoadout(sc, faction).fleets;
  return (NET.lo = lo);
}
// 一方的艦隊（setup 格式）。第二方整個轉 180°。每支艦隊都帶「呼叫增援」（多人：每位指揮官每場 1 次，不用天賦、不扣酒館存量）
function mpSideFleets(lo, side, sc, preview) {
  const M = (p) => (side ? { x: -p.x, z: -p.z, h: (p.h || 0) + Math.PI } : { x: p.x, z: p.z, h: p.h || 0 });
  const out = [];
  lo.fleets.forEach((f, k) => {
    const c = COMMANDERS.find((o) => o.id === f.cmdr) || cmdrsOf(lo.faction || 0)[0] || COMMANDERS[0], P = M(f);
    const skills = commanderSkills(c.skills, cmdrTal(c.id)); if (!skills.includes('reinforce')) skills.push('reinforce');
    out.push({ side, name: `第${'一二三四'[k]}艦隊`, ax: P.x, az: P.z, ay: f.y || 0, h: P.h, formation: f.formation, orderly: !!f.orderly, layers: f.layers || 1, comp: f.comp.slice(), hangar: (f.hangar || HANGAR_DEFAULT).slice(),
      commander: { id: c.id, name: c.name, title: c.title, trait: c.trait, level: cmdrLevel(c.id), tal: { ...cmdrTal(c.id) }, skills } });
  });
  supplyList(lo).forEach((S, i) => { if (sumA(S.comp) > 0) { const P = M(S); out.push(supplySetup(side, { ...S, x: P.x, z: P.z, h: P.h }, S.follow >= 0 && S.follow < lo.fleets.length ? S.follow : -1, supplyName(i))); } });
  if (!preview) lo.fleets.forEach((f, k) => out.push({ side, name: `${out[k].name}增援`, ax: 0, az: side ? MAP_BOUNDS.z0 - 900 : MAP_BOUNDS.z1 + 900, ay: 0, h: side ? 0 : Math.PI,
    formation: f.formation, comp: reinforceComp(f.comp, sc.budget), commander: null, reserve: true, activateAt: null, reinfOf: k }));
  return out;
}
function mpPreviewSetup() {
  const sc = GAME.sc, lo = GAME.loadout, s = GAME.playerSide, fac = lo.faction || 0;
  return { bg: false, terrain: sc.terrain, fleets: mpSideFleets(lo, s, sc, true), scenario: 'pvp', timeLimit: sc.timeLimit, level: 1, factions: s ? [1 - fac, fac] : [fac, 1 - fac] };
}
// 開局：把雙方送來的艦隊合在一起（第二方的跟隨、增援序號往後移）。每個瀏覽器算出一樣的 setup
function mpComposeSetup(st) {
  const sc = mpScenario(st.opts), fl = [];
  st.sides.forEach((arr, s) => {
    const off = fl.length;
    for (const f of arr || []) {
      const g = { ...f, side: s };
      if (g.follow != null && g.follow >= 0) g.follow += off;
      if (g.reinfOf != null) g.reinfOf += off;
      fl.push(g);
    }
  });
  return { bg: false, pvp: true, terrain: sc.terrain, fleets: fl, scenario: 'pvp', timeLimit: sc.timeLimit, level: 1, factions: st.factions.slice(), op: st.opts.op, names: st.names.slice() };
}
const mpNames = () => (battleSetup && battleSetup.names) || (NET.start && NET.start.names) || ['第一方', '第二方'];
function mpSideName(s) { return `${FACTION_NAME[SIDE_FAC[s]].slice(0, 2)}・${mpNames()[s]}${s === GAME.playerSide && !NET.spec ? '（你）' : ''}`; }
// 勝負是以第一方的角度記的；第二方看的時候反過來
function mpPersp(R, side) {
  if (!side) return { ...R };
  const sw = (s) => String(s || '').replace(/我軍|敵軍|我方|敵方/g, (w) => ({ 我軍: '敵軍', 敵軍: '我軍', 我方: '敵方', 敵方: '我方' })[w]);
  return { ...R, kind: R.kind === 'win' ? 'lose' : R.kind === 'lose' ? 'win' : R.kind, why: sw(R.why), ratio: [R.ratio[1], R.ratio[0]], alive: R.alive && [R.alive[1], R.alive[0]] };
}
// 觀戰：用名字取代我軍／敵軍
function mpWhyNamed(why) { const n = mpNames(); return String(why || '').replace(/我軍|我方/g, n[0]).replace(/敵軍|敵方/g, n[1]); }

// ───── 大廳 ─────
function showMulti() {
  pvpEnter();
  NET.want = true; netConnect();
  if (NET.room) showRoom(); else showLobby();
}
function mpOptsText(o) { return `${(MP_SIZES[o.size] || {}).name}・地形${(RAND_TERR[o.terr] || {}).name}・${OP_LEVELS[o.op].name}難度・×${MP_SPEEDS[o.speed]}`; }
function showLobby(msg) {
  NET.screen = 'lobby'; NET.on = false;
  setPhase('briefing'); fieldGroup.clear();
  const st = { wait: '等待中', battle: '戰鬥中' };
  const rows = NET.lobby.map((r) => { const full = r.players.every(Boolean); return `<tr><td><b>${escH(r.name)}</b></td><td>${st[r.state] || r.state}</td><td>${r.players.map((p) => (p ? escH(p) : '<span class="g-dim">空位</span>')).join(' vs ')}${r.specs ? `<span class="g-dim">　觀戰 ${r.specs}</span>` : ''}</td><td class="g-dim">${mpOptsText(r.opts)}</td>
    <td class="rec-act">${r.state !== 'battle' && !full ? `<button class="g-btn sm pri" data-join="${r.id}">加入</button>` : ''}<button class="g-btn sm" data-spec="${r.id}">觀戰</button></td></tr>`; }).join('');
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>多人戰鬥</h2><span class="crumb">內網 1 對 1・可以觀戰</span><span id="mp-st"></span><span class="g-sp"></span><button class="g-btn" id="mp-back">← 主選單</button></div>
    ${msg ? `<div class="g-card g-warn" style="margin-bottom:12px">${escH(msg)}</div>` : ''}
    <div class="g-card" style="margin-bottom:12px"><div class="g-row"><span class="g-dim">開新房間</span><input class="g-in" id="mp-name" maxlength="30" placeholder="${escH(API.name())} 的房間"><button class="g-btn pri" id="mp-new">開房間</button>
      <span class="g-sp"></span><button class="g-btn" id="mp-cmdr">多人指揮官（等級與天賦）</button></div>
      <p class="g-dim" style="margin:8px 0 0;font-size:calc(12px * var(--ui))">房主選規模、地形、操作難度與速度；雙方用一樣的預算各自編成、部署，都按「準備」就開戰。戰鬥中不能暫停。多人只能派初始指揮官，等級與天賦和單人分開計算；打完照樣得到功勳（星際酒館用）。</p></div>
    <div class="g-card"><h3>房間</h3>${NET.lobby.length ? `<table class="stat-tbl mp-tbl"><tr><th>房間</th><th>狀態</th><th>玩家</th><th>設定</th><th></th></tr>${rows}</table>` : '<p class="g-dim">目前沒有房間。開一個，等內網的其他玩家加入。</p>'}</div>
  </div>`);
  mpStatus();
  gEl('mp-back').onclick = showMenu;
  gEl('mp-cmdr').onclick = () => showCommanders(() => showLobby());
  gEl('mp-new').onclick = () => netAct('create', { name: gEl('mp-name').value.trim() || undefined }).catch((e) => toast('開房間失敗：' + e.message));
  document.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => netAct('join', { room: b.dataset.join }).catch((e) => toast(e.message))));
  document.querySelectorAll('[data-spec]').forEach((b) => (b.onclick = () => netAct('join', { room: b.dataset.spec, spec: true }).catch((e) => toast(e.message))));
}

// ───── 房間 ─────
function mpMinimap(sc, side) {
  const W = 360, Hh = 260, B = MAP_BOUNDS, mx = (x) => (x - B.x0) / (B.x1 - B.x0) * W, mz = (z) => (z - B.z0) / (B.z1 - B.z0) * Hh, sx = W / (B.x1 - B.x0);
  const rect = (r, c) => `<rect x="${mx(r.x0)}" y="${mz(r.z0)}" width="${mx(r.x1) - mx(r.x0)}" height="${mz(r.z1) - mz(r.z0)}" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-opacity=".7" stroke-dasharray="4 3"/>`;
  let s = `<svg class="minimap" viewBox="0 0 ${W} ${Hh}">${rect(MP_ZONES[0], side === 1 ? '#7cc4ff' : '#f2b35a')}${rect(MP_ZONES[1], side === 1 ? '#f2b35a' : '#7cc4ff')}`;
  for (const t of sc.terrain) s += `<circle cx="${mx(t.x)}" cy="${mz(t.z)}" r="${t.r * sx}" fill="#${TERRAIN_TYPES[t.type].color.toString(16).padStart(6, '0')}" fill-opacity=".25"/>`;
  return s + `<text x="6" y="${Hh - 6}" fill="#8592a8" font-size="10">${side >= 0 ? '橘框＝你的部署區' : '下方＝第一方、上方＝第二方'}　地形點對稱</text></svg>`;
}
function showRoom() {
  const r = NET.room; if (!r) { showLobby(); return; }
  NET.screen = 'room'; NET.on = false;
  setPhase('briefing'); fieldGroup.clear();
  const me = NET.me && NET.me.id, host = r.host === me, k = NET.seat, sc = mpScenario(r.opts), mine = k >= 0 ? r.seats[k] : null;
  const seg = (key, arr, lbl) => `<div class="wed-seg rd-seg mp-opt ${host ? '' : 'ro'}" data-opt="${key}">${arr.map((a, i) => `<button data-v="${i}" class="${r.opts[key] === i ? 'on' : ''}" ${host ? '' : 'disabled'}>${lbl ? lbl(a) : a.name}</button>`).join('')}</div>`;
  const seat = (s, i) => s ? `<div class="mp-seat ${s.ready ? 'rdy' : ''}"><div class="g-dim">${i ? '第二方（上方）' : '第一方（下方）'}${r.host === s.id ? '　★房主' : ''}</div>
      <b>${escH(s.name)}${s.id === me ? '（你）' : ''}</b><span class="${s.faction ? 'g-all' : 'g-emp'}">${FACTION_NAME[s.faction]}</span>
      <span class="${s.ready ? 'g-good' : 'g-dim'}">${s.ready ? '✓ 已準備' : '編成中…'}</span>${s.online ? '' : '<span class="g-warn">斷線</span>'}</div>`
    : `<div class="mp-seat empty"><div class="g-dim">${i ? '第二方（上方）' : '第一方（下方）'}</div><span class="g-dim">空位・等待玩家加入</span>${k < 0 && r.state !== 'battle' ? '<button class="g-btn sm pri" data-sit="1">坐這裡</button>' : ''}</div>`;
  const R = r.result;
  const last = R ? `<div class="g-dim" style="margin-top:8px">上一場：${R.kind === 'draw' ? '平手' : `${escH((R.names || [])[R.kind === 'win' ? 0 : 1] || '')} 獲勝`}（${escH(mpWhyNamedWith(R.why, R.names))}）</div>` : '';
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>${escH(r.name)}</h2><span class="crumb">${r.state === 'battle' ? '戰鬥中' : '等待雙方準備'}</span><span id="mp-st"></span><span class="g-sp"></span><button class="g-btn" id="rm-leave">← 離開房間</button></div>
    <div class="intel-grid">
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="g-card"><h3>玩家</h3><div class="mp-seats">${seat(r.seats[0], 0)}<span class="mp-vs">VS</span>${seat(r.seats[1], 1)}</div>
          <div class="g-dim" style="margin-top:6px">觀戰：${r.specs.length ? r.specs.map(escH).join('、') : '沒有'}</div>${last}</div>
        <div class="g-card"><h3>戰場設定${host ? '' : '<span class="g-dim" style="font-weight:normal">（房主決定）</span>'}</h3>
          <dl class="kv rd-opts"><dt>規模</dt><dd>${seg('size', MP_SIZES)}<div class="g-dim">預算 ${fmtN(sc.budget)} 點・最多 ${sc.maxFleets} 支艦隊・${Math.round(sc.timeLimit / 60)} 分鐘</div></dd>
          <dt>地形</dt><dd>${seg('terr', RAND_TERR)}${host ? '<button class="g-btn sm" id="rm-reroll" style="margin-left:6px">⟳ 換一張地圖</button>' : ''}</dd>
          <dt>操作難度</dt><dd>${seg('op', OP_LEVELS)}<div class="g-dim">${OP_LEVELS[r.opts.op].desc}</div></dd>
          <dt>速度</dt><dd>${seg('speed', MP_SPEEDS, (v) => '×' + v)}<div class="g-dim">戰鬥中不能暫停、不能調速度</div></dd>
          <dt>勝負</dt><dd>對方損失超過 ${Math.round((1 - ROUT_AT) * 100)}% 就潰走；時間到依雙方損失比例判定</dd>
          <dt>增援</dt><dd>每位指揮官每場可以呼叫 1 次增援（本場預算的 25%），不用天賦、不扣酒館的次數</dd></dl></div>
        ${mine ? `<div class="g-card"><h3>你的艦隊</h3><div class="g-row"><span class="g-dim">陣營</span><div class="wed-seg" id="rm-fac"><button data-f="0" class="${mine.faction === 0 ? 'on emp' : ''}" ${mine.ready ? 'disabled' : ''}>帝國軍</button><button data-f="1" class="${mine.faction === 1 ? 'on all' : ''}" ${mine.ready ? 'disabled' : ''}>聯盟軍</button></div>
            <span class="g-dim" style="font-size:calc(12px * var(--ui))">雙方可以同陣營</span><span class="g-sp"></span><button class="g-btn sm" id="rm-cmdr">多人指揮官</button></div>
          <div class="g-row" style="margin-top:10px">${mine.ready ? '<span class="g-good">✓ 已準備，等待對手…</span><span class="g-sp"></span><button class="g-btn" id="rm-unready">取消準備</button>' : '<span class="g-dim">編成、部署好之後按「部署完成・準備」</span><span class="g-sp"></span><button class="g-btn" id="rm-spec">改去觀戰</button><button class="g-btn pri" id="rm-go">編成與部署 →</button>'}</div></div>`
    : `<div class="g-card"><h3>觀戰中</h3><p class="g-dim">開戰後就能看到雙方的戰況（看得到全部、不能下令）。${r.state === 'battle' ? '戰鬥正在進行，加入時會快轉追上目前的進度。' : ''}</p></div>`}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="g-card"><h3>戰場環境</h3>${mpMinimap(sc, k)}<div style="margin-top:8px;font-size:calc(12.5px * var(--ui))">${sc.terrain.length ? [...new Set(sc.terrain.map((t) => t.type))].map((x) => `<div><b>${TERRAIN_TYPES[x].name}</b>：<span class="g-dim">${TERRAIN_TYPES[x].desc}</span></div>`).join('') : '<span class="g-dim">開闊宙域，沒有地形影響。</span>'}</div></div>
        <div class="g-card"><h3>聊天</h3><div class="mp-chat" id="rm-chat"></div><div class="g-row" style="margin-top:6px"><input class="g-in" id="rm-msg" maxlength="200" placeholder="說點什麼…（Enter 送出）" style="flex:1"><button class="g-btn sm" id="rm-send">送出</button></div></div>
      </div>
    </div></div>`);
  mpStatus(); mpChatDraw();
  gEl('rm-leave').onclick = () => netAct('leave').catch((e) => toast(e.message));
  if (host) {
    document.querySelectorAll('.mp-opt').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => netAct('opts', { opts: { ...r.opts, [g.dataset.opt]: +b.dataset.v } }).catch((e) => toast(e.message)))));
    gEl('rm-reroll').onclick = () => netAct('opts', { opts: r.opts, reroll: true }).catch((e) => toast(e.message));
  }
  document.querySelectorAll('[data-sit]').forEach((b) => (b.onclick = () => netAct('sit', {}).catch((e) => toast(e.message))));
  if (mine) {
    gEl('rm-fac').onclick = (e) => { const f = e.target.dataset.f; if (f != null && +f !== mine.faction && !mine.ready) mpFaction(+f); };
    gEl('rm-cmdr').onclick = () => showCommanders(() => showRoom());
    if (gEl('rm-unready')) gEl('rm-unready').onclick = () => netAct('seat', { ready: false }).catch((e) => toast(e.message));
    if (gEl('rm-spec')) gEl('rm-spec').onclick = () => netAct('sit', { spec: true }).catch((e) => toast(e.message));
    if (gEl('rm-go')) gEl('rm-go').onclick = mpGoLoadout;
  }
  const send = () => { const el = gEl('rm-msg'), v = el.value.trim(); if (!v) return; el.value = ''; netAct('chat', { msg: v }).catch((e) => toast(e.message)); };
  gEl('rm-send').onclick = send;
  gEl('rm-msg').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); };
}
function mpWhyNamedWith(why, names) { const n = names || ['第一方', '第二方']; return String(why || '').replace(/我軍|我方/g, n[0]).replace(/敵軍|敵方/g, n[1]); }
function mpChatDraw() {
  const el = gEl('rm-chat'); if (!el) return;
  el.innerHTML = NET.chat.length ? NET.chat.map((c) => `<div><b>${escH(c.from)}</b>：${escH(c.msg)}</div>`).join('') : '<span class="g-dim">還沒有訊息</span>';
  el.scrollTop = el.scrollHeight;
}
function mpFaction(f) {
  netAct('seat', { faction: f }).catch((e) => toast(e.message));
  if (NET.lo && (NET.lo.faction || 0) !== f) { NET.lo.faction = f; for (const fl of NET.lo.fleets) fl.cmdr = null; fixLoadoutCmdrs(NET.lo); }
}
// 編成：沿用單人的編成畫面（多人的指揮官、房主的預算）
function mpGoLoadout() {
  const r = NET.room; if (!r || NET.seat < 0) { showRoom(); return; }
  NET.screen = 'loadout';
  const sc = mpScenario(r.opts), fac = r.seats[NET.seat].faction || 0;
  GAME.sc = sc; GAME.intel = { fleets: [], events: [], acc: 1 }; GAME.playerSide = NET.seat;
  GAME.loadout = mpLoadout(sc, fac);
  showLoadout();
}
async function mpReady() {
  const sc = GAME.sc, lo = GAME.loadout, r = NET.room;
  if (!r || NET.seat < 0) { showLobby(); return; }
  applyOp(sc.op); opts.fire = true; opts.advance = false;   // 規則：開戰時就生效（記進回放）
  const rules = Object.fromEntries(SIM_RULES.map((k) => [k, opts[k]]));
  try { STORE.setItem(MP_LO_STORE, JSON.stringify(lo)); } catch (e) { /* 只在本次 */ }
  try { await netAct('seat', { ready: true, faction: lo.faction || 0, lo: mpSideFleets(lo, NET.seat, sc, false), rules, optsKey: sc.optsKey }); }
  catch (e) { toast('準備失敗：' + e.message); return; }
  fieldGroup.clear(); clearSelection();
  if (NET.screen !== 'battle') showRoom();
}

// ───── 戰鬥 ─────
function netBegin(st, cmds, turn) {
  pvpEnter();
  NET.start = st; NET.K = st.K; NET.speed = st.speed; NET.spec = NET.seat < 0; NET.desync = false; NET.ended = false; NET.lag = false; NET.out.length = 0;
  NET.screen = 'battle'; NET.on = true;
  const sc = mpScenario(st.opts); sc.name = `多人對戰・${st.names[0]} vs ${st.names[1]}`;
  GAME.sc = sc; GAME.playerSide = NET.spec ? 0 : NET.seat; GAME.watch = false; GAME.recView = false; GAME.attempt = 0;
  overlay(null); fieldGroup.clear();
  GAME.op = st.opts.op; Object.assign(opts, st.rules);   // 規則：用第一方送來的（雙方一樣）
  newBattle(st.seed, mpComposeSetup(st));
  GAME.init = [sideAlive(0), sideAlive(1)];
  GAME.result = null; GAME.reportShown = false; GAME.replaying = false; GAME.replayEnd = null; GAME.skillArm = null; GAME.xp = null; GAME.mpR = null; GAME.merit = 0; GAME.log = []; GAME.simCtl = null;
  for (const c of cmds) cmdQueue.push({ ...c });
  NET.bound = (turn + 1) * NET.K;
  gEl('battlehud').innerHTML = '';
  drawField(false);
  setPhase('battle'); setCmdSide(GAME.playerSide, false); clearSelection();
  paused = false; updateTimeUI();
  force3D(); if (GAME.op === 2 && !NET.spec) enterBridge();
  camAnim = null; view.target.x = 0; view.target.z = GAME.playerSide ? -300 : 300; view.height = 1250; if (mode3D) view.yaw = GAME.playerSide ? Math.PI : 0; updateCamera();
  if (!NET.spec && opts.fow && SETTINGS.autoScan === false) issue('autoscan', { on: false });
  const late = NET.bound > NET.K * 30;
  if (!late) cutPlay(cutSpecStart(sc));
  toast(NET.spec ? `觀戰：${st.names[0]} vs ${st.names[1]}${late ? '（快轉追上目前的進度…）' : ''}` : `${late ? '重新連上：快轉追上目前的進度…' : '多人對戰　開戰！'}（不能暫停；速度 ×${NET.speed}）`);
}
let _netOutT = 0;
function netCmd(c) {
  NET.out.push(c);
  if (!_netOutT) _netOutT = setTimeout(() => { _netOutT = 0; const list = NET.out.splice(0); if (list.length) netAct('cmd', { c: list }).catch((e) => toast('命令沒送出：' + e.message, 'bad')); }, 0);
}
// 每幀：照收到的回合推進；落後很多（中途加入、重連）就快轉
function netStep(dt) {
  if (GAME.result) { NET.lag = false; return; }
  const lag = NET.bound - simTick, catching = lag > NET.K * 30;
  simAcc += dt * NET.speed * (catching ? 40 : lag > NET.K * 3 ? 1.25 : 1);   // 稍微落後：加快一點追上
  const max = catching ? 400 : MAX_STEPS_PER_FRAME, t0 = performance.now();
  let n = 0;
  while (simAcc >= SIM_DT && n < max && simTick < NET.bound && !GAME.result) {
    stepSim(); simAcc -= SIM_DT; n++;
    if (!NET.spec && !catching && simTick % MP_HASH_EVERY === 0) { const tick = simTick, h = fullHash(); netAct('hash', { tick, h }).catch(() => {}); }
    if (catching && performance.now() - t0 > 30) break;
  }
  if (simTick >= NET.bound) { simAcc = Math.min(simAcc, SIM_DT); NET.lagT = (NET.lagT || 0) + dt; } else NET.lagT = 0;
  NET.lag = NET.lagT > 0.6;   // 等伺服器的下一回合等太久
  if (n >= max) simAcc = 0;
  // 沒有前進時不重算部隊位置：pushSquadronUniforms 會動到部隊狀態，多呼叫幾次可能和對方有微小差異
  if (GAME.result && !NET.ended) {
    NET.ended = true;
    const R = GAME.result;
    if (!NET.spec) netAct('end', { res: { kind: R.kind, why: R.why, tick: R.tick, ratio: R.ratio } }).catch(() => {});
  }
}
function mpQuitBattle(btn) {
  if (NET.spec) { netAct('leave').catch(() => {}); NET.on = false; NET.spec = false; showLobby(); return; }
  if (GAME.result) return;
  if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = '確定投降？'; setTimeout(() => { delete btn.dataset.sure; }, 3000); return; }
  delete btn.dataset.sure;
  netAct('surrender').catch((e) => toast(e.message));
}

// ───── 戰後報告（自己這一方的角度；觀戰用名字） ─────
function mpReport() {
  const live = NET.on || NET.screen === 'battle';
  NET.on = false; NET.screen = 'report';
  const R0 = GAME.result, spec = NET.spec && !GAME.recView, side = spec ? 0 : GAME.playerSide, names = mpNames();
  setPhase('report');
  const st0 = battleStats(), st = side ? { init: [st0.init[1], st0.init[0]], left: [st0.left[1], st0.left[0]] } : st0;
  if (!GAME.mpR || GAME.recView) { GAME.mpR = mpPersp(R0, side); GAME.mpR.retreat = !spec && R0.surrender === side; }   // 自己投降＝撤退（獎勵減半，太早投降沒有獎勵）
  const R = GAME.mpR;
  if (!GAME.xp && live && !spec && !GAME.recView) {
    const lv = (s) => { const l = fleets.filter((f) => f.side === s && f.commander).map((f) => f.commander.level || 1); return l.length ? Math.round(sumA(l) / l.length) : 1; };
    GAME.xp = awardXP(R, st);
    uploadRecord({ ...R, retreat: false }, st);   // 投降是命令，回放會自己重演，不用記結束的 tick
    GAME.merit = tavernAfterBattle(R, { random: true, sizeIdx: GAME.sc.sizeIdx || 0, enemyLevel: lv(1 - side), avgLevel: lv(side) });
  }
  const gains = GAME.xp || [];
  const label = spec ? (R.kind === 'draw' ? '平手' : `${escH(names[R.kind === 'win' ? 0 : 1])} 獲勝`) : { win: '勝利', lose: '敗北', draw: '平手' }[R.kind];
  const who = spec ? names.map(escH) : ['我軍', '敵軍'];
  const row = (t) => `<tr><td>${SHIP_TYPES[t].name}</td><td>${ships5(st.init[0][t])}</td><td>${ships5(st.init[0][t] - st.left[0][t])}</td><td>${ships5(st.init[1][t])}</td><td>${ships5(st.init[1][t] - st.left[1][t])}</td></tr>`;
  const inRoom = !!NET.room && !GAME.recView;
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>戰後報告</h2><span class="crumb">${escH(names[0])} vs ${escH(names[1])}　·　${OP_LEVELS[(battleSetup && battleSetup.op) || 0].name}難度　·　戰鬥時間 ${_fmtT(R.t)}</span></div>
    <div class="g-card" style="margin-bottom:12px;text-align:center"><p class="result ${spec ? 'draw' : R.kind}">${label}</p><div class="g-dim">${escH(spec ? mpWhyNamed(R.why) : R.why)}${R.retreat ? (rewardMul(R) ? '（投降：經驗與功勳減半）' : `（開戰 ${RETREAT_MIN_T} 秒內投降：不給經驗與功勳）`) : ''}</div>
      <div style="margin-top:6px">${who[0]}剩 ${Math.round(R.ratio[0] * 100)}%　·　${who[1]}剩 ${Math.round(R.ratio[1] * 100)}%</div>${NET.desync ? '<div class="g-warn" style="margin-top:6px">這場途中出現過不同步，雙方畫面的結果可能不一樣。</div>' : ''}</div>
    <div class="intel-grid">
      <div class="g-card"><h3>兵力損失（艘）</h3><table class="stat-tbl"><tr><th>艦種</th><th>${who[0]}出擊</th><th>${who[0]}損失</th><th>${who[1]}出擊</th><th>${who[1]}損失</th></tr>
        ${SHIP_TYPES.map((_, t) => t).filter((t) => t < N_COMBAT || st.init[0][t] + st.init[1][t] > 0).map(row).join('')}
        <tr><td><b>合計</b></td><td>${ships5(sumA(st.init[0]))}</td><td>${ships5(sumA(st.init[0]) - sumA(st.left[0]))}</td><td>${ships5(sumA(st.init[1]))}</td><td>${ships5(sumA(st.init[1]) - sumA(st.left[1]))}</td></tr></table></div>
      <div class="g-card"><h3>${spec || GAME.recView ? '指揮官' : '多人指揮官經驗'}</h3>${gains.length ? gains.map((g) => `<div style="margin-bottom:10px"><b>${g.f.commander.name}</b>（${g.f.name}，存活 ${Math.round(g.surv * 100)}%）
        <span class="g-good">+${g.xp} 經驗</span>${g.up ? `　<b class="g-emp">升到 Lv ${g.lv}！</b>` : `　Lv ${g.lv}`}${cmdrPoints(g.f.commander.id) > 0 ? `　<span class="tal-pts">可分配天賦 ${cmdrPoints(g.f.commander.id)} 點</span>` : ''}
        <div class="xpbar"><i style="width:${(cmdrXP(g.f.commander.id) % XP_PER_LEVEL) / XP_PER_LEVEL * 100}%"></i></div></div>`).join('')
        : fleets.filter((f) => f.commander && !f.reserve).map((f) => `<div>${escH(names[f.side])}：<b>${f.commander.name}</b> Lv ${f.commander.level}</div>`).join('')}
        ${GAME.merit ? `<div style="margin:6px 0"><b class="g-emp">+${GAME.merit} 功勳</b>　<span class="g-dim">算進單人的星際酒館（目前 ${fmtN(ROSTER.merit)}）</span></div>` : ''}</div>
    </div>
    <div class="g-row" style="margin-top:14px">${GAME.recView ? '<button class="g-btn" id="r-rec">← 戰鬥回放</button>' : `${inRoom ? '<button class="g-btn pri" id="r-room">回到房間 →</button>' : '<button class="g-btn" id="r-lobby">多人大廳</button>'}${spec ? '' : '<button class="g-btn" id="r-tal">多人指揮官天賦</button>'}`}<span class="g-sp"></span><button class="g-btn" id="r-replay">觀看回放</button></div>
  </div>`);
  if (GAME.recView) gEl('r-rec').onclick = () => { GAME.recView = false; showRecords(); };
  else {
    if (gEl('r-room')) gEl('r-room').onclick = () => (NET.room ? showRoom() : showLobby());
    if (gEl('r-lobby')) gEl('r-lobby').onclick = () => showMulti();
    if (gEl('r-tal')) gEl('r-tal').onclick = () => showCommanders(() => mpReport());
  }
  gEl('r-replay').onclick = () => { NET.screen = 'report'; startReplay(); };
}

// ───── 樣式 ─────
(() => {
  const s = document.createElement('style');
  s.textContent = `.mp-seats{display:flex;align-items:stretch;gap:10px}.mp-seat{flex:1;display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid rgba(140,160,200,.25);border-radius:8px}
  .mp-seat.rdy{border-color:rgba(110,220,140,.6)}.mp-seat.empty{border-style:dashed;opacity:.8}.mp-vs{align-self:center;font-weight:bold;opacity:.6}
  .mp-chat{height:160px;overflow:auto;font-size:calc(13px * var(--ui));line-height:1.5}.mp-opt.ro button{cursor:default}.mp-tbl td{vertical-align:middle}`;
  document.head.appendChild(s);
})();
