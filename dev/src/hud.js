
// ───────── 作戰 HUD（仿星海爭霸 2／世紀帝國）：左下小地圖、中下選取面板、右下指令卡 ─────────
// 指令卡 3 排 × 5 格：按鍵＝格子的位置（預設 QWERT／ASDFG／ZXCVB，設定裡可以改）。陣型、技能太多時進子頁，Esc 回主頁
// 數字鍵＝編隊：Ctrl（或 Alt）＋數字＝記住目前選取、數字＝叫回（連按兩下＝鏡頭跳過去）、Shift＋數字＝把選取加進編隊
// 只在一般戰場畫面顯示；艦橋、戰術面板、王牌飛行員維持原本的介面（按鍵照樣有效）
const CC_N = 15;
const CC_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'];
const CC_FORMS = ['line', 'spindle', 'crescent', 'ring', 'column', 'wedge', 'hcone'];
// 主頁固定的位置（教學、說明用 keyText 查）
const CC_MAIN = { move: 0, stop: 1, attack: 2, area: 3, turn: 4, page_form: 5, orderly: 6, volley: 7, missile: 8, scan: 9 };
const CH = { page: 'main', el: null, btns: [], tipI: -1, selSig: '', acc: 1, mmAcc: 1, shown: false, card: false,
  cg: Array.from({ length: 10 }, () => []), cgLast: { n: -1, t: 0 }, mm: null, mmDrag: false, battleKey: null };

// ── 按鍵文字：指令卡上的指令回傳格子的鍵（陣型＝「A → Q」），其他照原本的綁定 ──
function ccPosOf(id) {
  if (CC_MAIN[id] != null) return [CC_MAIN[id]];
  if (id.startsWith('form_')) { const i = CC_FORMS.indexOf(id.slice(5)); return i >= 0 ? [CC_MAIN.page_form, i] : null; }
  if (id.startsWith('skill_')) {
    const S = ccSkills(true), i = S.findIndex((s) => s.id === id.slice(6));
    if (i < 0) return null;
    return S.length > 5 && i >= 4 ? [14, i] : [10 + i];
  }
  return null;
}
function keyText(id) {
  const p = ccPosOf(id);
  if (p) return p.map((i) => keyLabel(keyOf('cc_' + i))).join(' → ');
  if (id.startsWith('skill_')) return '指令卡下排';
  return keyLabel(keyOf(id));
}

// ── 指令卡內容 ──
// 選取裡有指揮官的艦隊的技能，依 SKILLS 的順序；all＝選取裡沒有就看全軍（教學說明用）
function ccSkills(all = false) {
  const own = (f) => f && f.side === GAME.playerSide && f.commander && !f.ally && f.skills;
  let fl = [...new Set(actOn().map((q) => q.fleet))].filter(own);
  const ids = (L) => Object.keys(SKILLS).filter((id) => L.some((f) => f.skills[id]));
  if (all && !ids(fl).length) fl = fleets.filter(own);
  return ids(fl).map((id) => ({ id, fleets: fl.filter((f) => f.skills[id]) }));
}
function ccSkillReady(f, id) { const s = f.skills[id]; return !f.reserve && s.left > 0 && U.uTime.value >= s.ready && f.sqs.some((q) => q.alive > 0); }
function ccSkillItem(S) {
  const t = U.uTime.value, def = SKILLS[S.id], st = S.fleets.map((f) => f.skills[S.id]);
  const left = sumA(st.map((s) => s.left)), ready = S.fleets.filter((f) => ccSkillReady(f, S.id));
  const act = st.find((s) => t < s.until), cds = st.filter((s) => s.left > 0).map((s) => Math.max(0, s.ready - t)), cd = cds.length ? Math.min(...cds) : 0;
  const A = GAME.skillArm;
  return { act: 'skill_' + S.id, name: def.name, skill: true, ok: ready.length > 0,
    sub: act ? `生效 ${Math.ceil(act.until - t)} 秒` : left <= 0 ? '已用完' : cd > 0 ? `冷卻 ${Math.ceil(cd)}` : `剩 ${left} 次`,
    cd: !ready.length && cd > 0 && def.cd ? cd / def.cd : 0, active: !!act, arm: !!(A && A.id === S.id),
    desc: def.desc + (S.fleets.length > 1 ? `<br><small>選取中有這個技能的艦隊：${S.fleets.map((f) => f.name).join('、')}（每按一次由一支施放）</small>` : ''),
    why: left <= 0 ? `${def.name}已經用完了` : S.fleets.every((f) => f.reserve) ? '艦隊還沒進場' : `${def.name}冷卻中（${Math.ceil(cd)} 秒）` };
}
function ccItems() {
  const it = Array(CC_N).fill(null);
  const L = actOn(), has = L.length > 0, A = GAME.skillArm;
  const g0 = has && L.every((q) => q.group === L[0].group) ? L[0].group : null;
  const back = { act: 'back', name: '返回', sub: 'Esc', desc: '回到主頁', ok: true, nav: true };
  const none = '先選取要指揮的艦隊';
  if (CH.page === 'form') {
    CC_FORMS.forEach((k, i) => { const F = FORMATIONS[k]; it[i] = { act: 'form_' + k, name: F.name, desc: `${F.note}<br><small>火力 ×${F.fire}　變陣至少 ${MORPH_DUR} 秒（艦隊越大越久），變陣中比較脆弱</small>`, ok: has, why: none, on: !!(g0 && g0.formation === k) }; });
    it[7] = { act: 'orderly', name: '整齊排列', sub: g0 ? (g0.orderly ? '開' : '關') : '', desc: '切換整齊排列：等距網格，射界比較好預測（關＝自然、較鬆散）', ok: has, why: none, on: !!(g0 && g0.orderly) };
    it[8] = { act: 'layers_1', name: '1 層', desc: '整齊排列時排成 1 層（畫面最整齊）', ok: has, why: none, on: !!(g0 && g0.orderly && (g0.layers || 1) === 1) };
    it[9] = { act: 'layers_3', name: '3 層', desc: '整齊排列時排成 3 層（上下也等距）', ok: has, why: none, on: !!(g0 && g0.orderly && g0.layers === 3) };
    it[14] = back;
    return it;
  }
  if (CH.page === 'skill') {
    ccSkills().slice(0, 14).forEach((S, i) => (it[i] = ccSkillItem(S)));
    it[14] = back;
    return it;
  }
  it[0] = { act: 'move', name: '移動', desc: '再左鍵點地圖：移動到那裡，朝向不變<br><small>也可以直接右鍵點地面；右鍵按住拖曳＝指定到達後的朝向</small>', ok: has, why: none, arm: !!(A && A.move) };
  it[1] = { act: 'stop', name: '停止', desc: '停在原地：取消移動、戰術隊列、指定目標與區域攻擊', ok: has, why: none };
  it[2] = { act: 'attack', name: '攻擊', desc: '再左鍵點敵方分艦隊：集中攻擊它（不加傷害、沒有次數限制）<br><small>平常每艘船會自己挑目標</small>', ok: has, why: none, arm: !!(A && A.attack) };
  it[3] = { act: 'area', name: '區域攻擊', desc: `再左鍵點地圖：對那一點開火 ${FOW_RULE.area.dur} 秒（射程內的光束、飛彈、艦載機）<br><small>看不到目標也能打（盲射，命中率減半）</small>`, ok: has, why: none, arm: !!(A && A.area) };
  it[4] = { act: 'turn', name: '轉向 45°', desc: '原地向右轉 45°：被側擊時把船頭（主砲）轉向敵人', ok: has, why: none };
  it[5] = { act: 'page_form', name: '陣型 ▸', sub: g0 ? FORMATIONS[g0.formation].name : '', desc: '打開陣型頁：七種陣型、整齊排列、層數', ok: has, why: none, nav: true };
  it[6] = { act: 'orderly', name: '整齊排列', sub: g0 ? (g0.orderly ? '開' : '關') : '', desc: '切換整齊排列：等距網格，射界比較好預測（關＝自然、較鬆散）', ok: has, why: none, on: !!(g0 && g0.orderly) };
  it[7] = { act: 'volley', name: '全艦齊射', desc: '冷卻好的光束砲同時開火：在敵人剛進入全威力距離、或護盾剛被打穿時爆發<br><small>平常會自動開火</small>', ok: has, why: none };
  it[8] = { act: 'missile', name: '飛彈齊射', desc: '巡洋艦、驅逐艦冷卻好又還有彈藥的立刻一起發射（會扣彈藥）：同時到達的飛彈比較容易突破防空<br><small>平常會自動發射</small>', ok: has, why: none };
  if (fowOn()) {
    const rf = reconFleet(), cd = rf ? fowReconLeft(rf) : 0;
    it[9] = { act: 'scan', name: '區域掃描', sub: !rf ? '沒有航母' : cd > 0 ? `冷卻 ${Math.ceil(cd)}` : '', cd: rf && cd > 0 ? cd / FOW_RULE.recon.cd : 0, arm: !!(A && A.recon),
      desc: `再左鍵點地圖：航母派偵察機飛過去盤旋 ${FOW_RULE.recon.loiter} 秒，半徑 ${rf ? Math.round(fowReconR(rf)) : FOW_RULE.recon.r} 內的敵軍都看得到<br><small>每支艦隊冷卻 ${FOW_RULE.recon.cd} 秒；偵察機會被防空砲、攔截機打下來</small>`,
      ok: !!rf && cd <= 0, why: rf ? `${rf.name}：偵察機冷卻中（${Math.ceil(cd)} 秒）` : '沒有航母：區域掃描要由航母派出偵察機' };
  }
  const S = ccSkills(), more = S.length > 5;
  (more ? S.slice(0, 4) : S).forEach((s, i) => (it[10 + i] = ccSkillItem(s)));
  if (more) it[14] = { act: 'page_skill', name: '更多技能 ▸', desc: '打開技能頁：選取的艦隊所有的技能', ok: true, nav: true };
  return it;
}
function ccPhaseOK() { return (GAME.phase === 'battle' || GAME.phase === 'sandbox') && !GAME.replaying && !GAME.watch && !(NET.on && NET.spec) && !(PL.on && !PL.spec); }
// 按下第 i 格（按鍵或滑鼠）
function ccPress(i) {
  if (!ccPhaseOK()) return false;
  const it = ccItems()[i];
  if (!it) return true;   // 空格：吃掉按鍵
  if (BR.on && bridgeConsoleK() < 0.9) { bridgeNoCmd(); return true; }   // 艦橋：看著戰術台才能用指令卡（連換頁也不行）
  if (!it.ok) { if (it.why) toast(it.why, 'hint'); return true; }
  ccRun(it.act);
  ccRefresh(true);
  return true;
}
function ccRun(act) {
  if (act === 'page_form' || act === 'page_skill') {
    CH.page = act.slice(5);
    if (!CH.card) hint(CH.page === 'form' ? `陣型：${CC_FORMS.map((k, i) => `${keyLabel(keyOf('cc_' + i))} ${FORMATIONS[k].name}`).join('　')}（Esc 返回）` : `技能：${ccSkills().map((s, i) => `${keyLabel(keyOf('cc_' + i))} ${SKILLS[s.id].name}`).join('　')}（Esc 返回）`);
    return;
  }
  if (act === 'back') { ccBack(); return; }
  const wasPage = CH.page;
  if (act === 'move') armMove();
  else if (act === 'stop') cmdStop();
  else if (act.startsWith('layers_')) cmdLayers(+act.slice(7));
  else if (act.startsWith('skill_')) ccSkill(act.slice(6));
  else runKeyAction(act);
  // 選了陣型、技能就回主頁（開關類的留在原頁）
  if (wasPage !== 'main' && (act.startsWith('form_') || act.startsWith('skill_'))) ccBack();
}
function ccBack() { if (CH.page === 'main') return false; CH.page = 'main'; if (!CH.card) hideHint(); ccRefresh(true); return true; }
function ccSkill(id) {
  const S = ccSkills().find((s) => s.id === id); if (!S) return;
  const f = S.fleets.find((o) => ccSkillReady(o, id)); if (f) armSkill(f, id);
}
// 移動：接著左鍵點地圖（gamePointer、戰術面板處理）
function armMove() {
  if (!actOn().length) return;
  GAME.skillArm = { move: true, point: true };
  hint(`移動：選取的艦隊要去哪裡？左鍵點地圖上的位置（右鍵或 Esc 取消）`);
}
function cmdStop() { if (!actOn().length) return; issue('stop', { sqs: sqIds() }); updateSelBar(); }   // 停止不排進隊列

// ── 編隊（數字鍵） ──
function cgReset() {
  CH.cg = Array.from({ length: 10 }, () => []); CH.cgLast = { n: -1, t: 0 };
  // 開戰時自動把每支艦隊編成 1、2、3…（看得到編隊列，玩家自然就會用）
  const mine = fleets.filter((f) => f.side === GAME.playerSide && !f.ally && !f.supply && f.sqs.length);
  const sup = fleets.filter((f) => f.side === GAME.playerSide && !f.ally && f.supply && f.sqs.length);
  [...mine, ...sup].slice(0, 9).forEach((f, k) => (CH.cg[k + 1] = f.sqs.slice()));
}
function cgAlive(n) { return CH.cg[n].filter((q) => q.alive > 0 && !q.bg && q.side === GAME.playerSide); }
function cgName(n) {
  const L = cgAlive(n); if (!L.length) return '';
  const fl = [...new Set(L.map((q) => q.fleet).filter(Boolean))];
  if (fl.length === 1) return fl[0].sqs.every((q) => q.alive <= 0 || q.bg || L.includes(q)) ? fl[0].name : L.length === 1 ? L[0].name : `${fl[0].name}（${L.length} 支）`;
  return `${fl.length} 支艦隊`;
}
function camFocus(x, z) { camAnim = { from: { x: view.target.x, z: view.target.z, h: view.height, yaw: view.yaw, pitch: view.pitch }, to: { x, z, h: view.height, yaw: view.yaw, pitch: view.pitch }, t: 0 }; }
function cgKey(e) {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code); if (!m) return false;
  if ((GAME.phase !== 'battle' && GAME.phase !== 'sandbox') || (PL.on && !PL.spec) || (BR.on && bridgeConsoleK() < 0.9)) return false;   // 艦橋：看著戰術台時才能用
  e.preventDefault();
  const n = +m[1], now = performance.now();
  if (e.ctrlKey || e.metaKey || e.altKey) {
    const L = [...selected].filter((q) => q.alive > 0);
    if (!L.length) { toast(`先選取部隊，再按 Ctrl＋${n} 編成第 ${n} 隊`, 'hint'); return true; }
    CH.cg[n] = L; toast(`編隊 ${n}：${cgName(n)}`, 'hint'); CH.selSig = ''; return true;
  }
  if (e.shiftKey) {
    const L = [...selected].filter((q) => q.alive > 0 && !CH.cg[n].includes(q));
    CH.cg[n] = [...cgAlive(n), ...L]; if (L.length) toast(`編隊 ${n}：加入 ${L.length} 支分艦隊`, 'hint'); CH.selSig = ''; return true;
  }
  const L = cgAlive(n);
  if (!L.length) { toast(`編隊 ${n} 是空的：先選取部隊，再按 Ctrl＋${n}`, 'hint'); return true; }
  setSelection(L);
  if (!BR.on && CH.cgLast.n === n && now - CH.cgLast.t < 400) { const C = centerOf(L); if (C) camFocus(C.x, C.z); }
  CH.cgLast = { n, t: now };
  return true;
}

// ── DOM ──
function buildCmdHud() {
  if (!CH.el) {
    CH.el = document.createElement('div'); CH.el.id = 'cmdhud';
    CH.el.innerHTML = `<div class="ch-box" id="ch-mm"><canvas id="ch-mmc"></canvas></div>
      <div class="ch-mid"><div id="ch-cg"></div><div class="ch-box" id="ch-sel"></div></div>
      <div class="ch-box" id="ch-card" style="display:none"><div id="ch-page"></div><div class="ch-grid">${Array.from({ length: CC_N }, (_, i) => `<button class="cc-b" data-i="${i}"><b class="cc-k"></b><span class="cc-n"></span><small></small><i class="cc-cd"></i></button>`).join('')}</div></div>`;
    document.body.appendChild(CH.el);
    CH.cardEl = gEl('ch-card');
    const tip = document.createElement('div'); tip.id = 'ch-tip'; tip.hidden = true; document.body.appendChild(tip);   // 提示框放在最外層（戰術面板裡也看得到）
    CH.cardEl.addEventListener('contextmenu', (e) => e.preventDefault());
    CH.btns = [...CH.el.querySelectorAll('.cc-b')];
    CH.btns.forEach((b, i) => {
      b.onclick = () => ccPress(i);
      b.onmouseenter = () => { CH.tipI = i; ccTip(); };
      b.onmouseleave = () => { if (CH.tipI === i) { CH.tipI = -1; ccTip(); } };
    });
    CH.el.addEventListener('contextmenu', (e) => e.preventDefault());
    gEl('ch-sel').onclick = chSelClick;
    gEl('ch-cg').onclick = (e) => { const b = e.target.closest('[data-cg]'); if (b) cgKey({ code: 'Digit' + b.dataset.cg, preventDefault() {}, shiftKey: e.shiftKey }); };
    mmBind(gEl('ch-mmc'));
    CH.mmEl = gEl('ch-mm');
  }
  CH.page = 'main'; CH.selSig = ''; CH.acc = 1;
  cgReset();
}
function chVisible() {
  if (GAME.phase !== 'battle' && GAME.phase !== 'replay') return false;
  if (BR.on || (PL.on) || GAME.pilot || (typeof TAC !== 'undefined' && TAC.open)) return false;
  return true;
}
// 指令卡只有一張：戰場畫面時在右下角，打開戰術面板（艦橋：戰術台）時搬到面板右側下方
function cmdHudFrame(dt) {
  if (!CH.el) return;
  const on = chVisible(), inTac = typeof TAC !== 'undefined' && TAC.open && !!TAC.cc;
  const card = ccPhaseOK() && !GAME.pilot && (on || inTac);
  const host = inTac ? TAC.cc : CH.el;
  if (CH.cardEl.parentElement !== host) { host.appendChild(CH.cardEl); CH.tipI = -1; ccTip(); }
  if (on !== CH.shown) { CH.shown = on; document.body.classList.toggle('ch-on', on); }
  // 艦橋：左下角一直顯示小地圖（只看、不能點）；低頭看戰術台就收起來
  const brMM = BR.on && !!BR.el && !inTac && (GAME.phase === 'battle' || GAME.phase === 'replay') && uiOn('minimap');
  const mmHost = brMM ? BR.el : CH.el;
  if (CH.mmEl.parentElement !== mmHost) { if (brMM) BR.el.appendChild(CH.mmEl); else CH.el.insertBefore(CH.mmEl, CH.el.firstChild); }
  if (brMM !== CH.brMM) { CH.brMM = brMM; CH.mmEl.classList.toggle('br', brMM); document.body.classList.toggle('br-mm', brMM); if (brMM) CH.mmAcc = 1; }
  if (brMM) { CH.mmAcc += dt; if (CH.mmAcc >= 1 / 15) { CH.mmAcc = 0; mmDraw(); } }
  if (card !== CH.card) { CH.card = card; CH.cardEl.style.display = card ? '' : 'none'; if (!card) { CH.tipI = -1; ccTip(); } else ccRefresh(true); }
  if (!on && !inTac) return;
  CH.acc += dt; CH.mmAcc += dt;
  if (on && CH.mmAcc >= 1 / 15) { CH.mmAcc = 0; if (uiOn('minimap')) mmDraw(); }
  if (CH.acc < 0.15) return;
  CH.acc = 0;
  if (card) ccRefresh();
  if (on) chSelRefresh();
}
// 指令卡：按鈕固定 15 個，只改內容（重畫 innerHTML 會吃掉點擊）
function ccRefresh(force) {
  if (!CH.el || !CH.card) return;
  if (force) CH.acc = 0;
  const items = ccItems();
  gEl('ch-page').textContent = CH.page === 'form' ? '陣型' : CH.page === 'skill' ? '技能' : `${selected.size ? '選取的艦隊' : '未選取（先選艦隊才能下令）'}　按鍵＝格子位置`;
  items.forEach((it, i) => {
    const b = CH.btns[i], set = (sel, v) => { const el = b.querySelector(sel); if (el.textContent !== v) el.textContent = v; };
    set('.cc-k', keyLabel(keyOf('cc_' + i)));
    set('.cc-n', it ? it.name : ''); set('small', it ? it.sub || '' : '');
    b.classList.toggle('empty', !it); b.classList.toggle('off', !!it && !it.ok);
    b.classList.toggle('on', !!(it && it.on)); b.classList.toggle('arm', !!(it && it.arm)); b.classList.toggle('act', !!(it && it.active));
    b.classList.toggle('sk', !!(it && it.skill)); b.classList.toggle('nav', !!(it && it.nav));
    b.querySelector('.cc-cd').style.height = it && it.cd ? Math.round(it.cd * 100) + '%' : '0';
  });
  if (CH.tipI >= 0) ccTip(items);
}
function ccTip(items) {
  const tip = gEl('ch-tip'); if (!tip) return;
  const it = CH.tipI >= 0 && CH.card ? (items || ccItems())[CH.tipI] : null;
  if (!it) { tip.hidden = true; return; }
  const k = keyLabel(keyOf('cc_' + CH.tipI));
  const html = `<div class="tt-h"><b>${it.name}</b><kbd>${k}</kbd></div><div class="tt-d">${it.desc || ''}</div>${it.sub ? `<div class="tt-s">${it.sub}</div>` : ''}${!it.ok && it.why ? `<div class="tt-w">${it.why}</div>` : ''}${it.nav || it.act === 'stop' ? '' : `<div class="tt-q">按住 ${SETTINGS.queueMod === 'Control' ? 'Ctrl' : SETTINGS.queueMod} 再按＝排進戰術隊列</div>`}`;
  if (tip.innerHTML !== html) tip.innerHTML = html;
  const r = CH.cardEl.getBoundingClientRect();
  tip.style.right = Math.max(8, innerWidth - r.right) + 'px'; tip.style.bottom = (innerHeight - r.top + 6) + 'px';
  tip.hidden = false;
}

// ── 選取面板 ──
function chFleetsOf(L) { const m = new Map(); for (const q of L) { const f = q.fleet; if (!m.has(f)) m.set(f, []); m.get(f).push(q); } return [...m.entries()]; }
function chSqInit(q) { return Math.max(1, q.list.length - (q.nDorm || 0)); }
function chOrder(L) {
  const g = L[0] && L[0].group, t = U.uTime.value; if (!g) return '';
  const out = [];
  const st = L.map(sqStatus), pri = ['warn', 'move', 'fight', ''];
  for (const p of pri) { const s = st.find((x) => x[1] === p); if (s) { out.push(s[0]); break; } }
  if (g.target && g.target.alive > 0) out.push(`攻擊 ${g.target.name}`);
  if (g.area && t < g.area.until) out.push(`區域攻擊 ${Math.ceil(g.area.until - t)} 秒`);
  if (g.queue && g.queue.length) out.push(`隊列 ${g.queue.length} 步`);
  return out.join('・');
}
function chSelList() {
  const L = [...selected].filter((q) => q.alive > 0 && !q.bg);
  return { L: L.length ? L : sideSquadrons(cmdSide).filter((q) => q.alive > 0), all: !L.length };   // 沒選時只顯示全軍狀態（不能下令）
}
function chSelRefresh() {
  const el = gEl('ch-sel'); if (!el) return;
  const { L, all } = chSelList();
  const F = chFleetsOf(L), one = F.length === 1;
  const sig = (all ? 'A' : 'S') + L.map((q) => squadrons.indexOf(q)).join(',') + '|' + CH.cg.map((c) => cgAlive(CH.cg.indexOf(c)).length).join('');
  if (sig !== CH.selSig) {
    CH.selSig = sig;
    // 編隊列
    gEl('ch-cg').innerHTML = CH.cg.map((c, n) => (cgAlive(n).length ? `<button class="cg-b" data-cg="${n}" title="按 ${n} 選取、連按兩下鏡頭跳過去；Ctrl＋${n} 重新編隊、Shift＋${n} 加入"><b>${n}</b>${cgName(n)}</button>` : '')).join('') || '<span class="cg-hint">Ctrl＋數字＝編隊</span>';
    if (!L.length) { el.innerHTML = '<div class="cs-h g-dim">沒有可以指揮的艦隊</div>'; return; }
    let head;
    if (one && F[0][0]) {
      const f = F[0][0], c = f.commander;
      head = `<div class="cs-h"><b class="cs-fn">${f.name}</b>${c ? `<span>${c.name}${c.title ? ' ' + c.title : ''} Lv ${c.level}</span>` : ''}${all ? '<span class="g-dim">（未選取：不能下令）</span>' : ''}</div>`;
    } else head = `<div class="cs-h"><b class="cs-fn">${all ? '全軍' : '選取'}</b><span>${F.length} 支艦隊・${L.length} 支分艦隊</span>${all ? '<span class="g-dim">（未選取：先選艦隊才能下令）</span>' : ''}</div>`;
    const tiles = one
      ? L.map((q) => `<button class="cs-t" data-sq="${squadrons.indexOf(q)}" title="點＝只選這支分艦隊；Shift＋點＝從選取中移除"><span class="cs-tn">${q.name}</span><span class="cs-tc"></span><i class="cs-bar"><i></i></i></button>`).join('')
      : F.map(([f]) => `<button class="cs-t" data-fl="${f ? f.id : -1}" title="點＝只選這支艦隊；Shift＋點＝從選取中移除"><span class="cs-tn">${f ? f.name : '—'}</span><span class="cs-tc"></span><i class="cs-bar"><i></i></i></button>`).join('');
    el.innerHTML = `${head}<div class="cs-st"></div><div class="cs-ts">${tiles}</div>`;
  }
  if (!L.length) return;
  // 文字與血條
  const groups = [...new Set(L.map((q) => q.group).filter(Boolean))];
  const n = sumA(L.map((q) => q.alive)), fm = groups.length === 1 ? FORMATIONS[groups[0].formation].name + (groups[0].orderly ? '（整齊）' : '') : `${groups.length} 個部隊`;
  const t = U.uTime.value, sk = one && F[0][0] ? Object.keys(F[0][0].skills || {}).filter((id) => t < F[0][0].skills[id].until).map((id) => `${SKILLS[id].name} ${Math.ceil(F[0][0].skills[id].until - t)}s`) : [];
  const stTxt = `${ships5(n)} 艘・${fm}${groups.length === 1 ? '・' + chOrder(L) : ''}${sk.length ? '・<span class="cs-sk">' + sk.join('、') + '</span>' : ''}`;
  const stEl = el.querySelector('.cs-st'); if (stEl && stEl.innerHTML !== stTxt) stEl.innerHTML = stTxt;
  el.querySelectorAll('.cs-t').forEach((b) => {
    let alive, init, sel;
    if (b.dataset.sq != null) { const q = squadrons[+b.dataset.sq]; alive = q.alive; init = chSqInit(q); sel = q; }
    else { const f = fleets.find((o) => o.id === +b.dataset.fl), qs = L.filter((q) => q.fleet === f); alive = sumA(qs.map((q) => q.alive)); init = sumA(qs.map(chSqInit)); }
    const r = Math.max(0, Math.min(1, alive / init)), tc = b.querySelector('.cs-tc'), txt = ships5(alive);
    if (tc.textContent !== txt) tc.textContent = txt;
    const bar = b.querySelector('.cs-bar i'); bar.style.width = Math.round(r * 100) + '%'; bar.className = r < 0.35 ? 'bad' : r < 0.65 ? 'mid' : '';
    b.classList.toggle('dead', alive <= 0);
    if (sel) b.classList.toggle('warn', sqStatus(sel)[1] === 'warn');
  });
}
function chSelClick(e) {
  const b = e.target.closest('.cs-t'); if (!b) return;
  const { L } = chSelList();
  let pick;
  if (b.dataset.sq != null) pick = [squadrons[+b.dataset.sq]];
  else { const f = fleets.find((o) => o.id === +b.dataset.fl); pick = L.filter((q) => q.fleet === f); }
  if (e.shiftKey) setSelection(L.filter((q) => !pick.includes(q)));
  else setSelection(pick);
  if (e.detail >= 2) { const C = centerOf(pick); if (C) camFocus(C.x, C.z); }   // 連點兩下＝鏡頭跳過去
}

// ── 小地圖 ──
function mmFlip() { return !!(GAME.sc && GAME.sc.mp && GAME.playerSide === 1); }   // 多人的第二方：畫面整個轉 180°
function mmGeom(cv) {
  const B = MAP_BOUNDS, W = cv.clientWidth, H = cv.clientHeight, k = Math.min(W / (B.x1 - B.x0), H / (B.z1 - B.z0));
  const ox = (W - (B.x1 - B.x0) * k) / 2, oy = (H - (B.z1 - B.z0) * k) / 2, f = mmFlip();
  return { W, H, k, toX: (x) => ox + ((f ? -x : x) - B.x0) * k, toY: (z) => oy + ((f ? -z : z) - B.z0) * k,
    fromXY: (px, py) => { const x = (px - ox) / k + B.x0, z = (py - oy) / k + B.z0; return f ? { x: -x, z: -z } : { x, z }; } };
}
function mmDraw() {
  const cv = gEl('ch-mmc'); if (!cv || !cv.clientWidth) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'), G = mmGeom(cv), B = MAP_BOUNDS, k = G.k;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#03060d'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(150,175,220,.3)'; c.lineWidth = 1;
  const x0 = Math.min(G.toX(B.x0), G.toX(B.x1)), y0 = Math.min(G.toY(B.z0), G.toY(B.z1));
  c.strokeRect(x0 + 0.5, y0 + 0.5, (B.x1 - B.x0) * k - 1, (B.z1 - B.z0) * k - 1);
  // 地形
  for (const t of terrainList()) {
    const T = TERRAIN_TYPES[t.type], col = '#' + T.color.toString(16).padStart(6, '0');
    c.beginPath(); c.arc(G.toX(t.x), G.toY(t.z), Math.max(1.5, t.r * k), 0, TAU); c.fillStyle = col + (T.solid ? '99' : '26'); c.fill();
  }
  // 艦艇（抽樣畫點）：戰爭迷霧／被干擾時，敵軍只畫看得到的
  const fog = pFiltered(), me = GAME.playerSide, step = Math.max(2, Math.ceil(shipCount / 3000));
  for (let sd = 0; sd < 2; sd++) {
    if (fog && sd !== me && !fowView()) continue;
    for (let i = 0; i < shipCount; i += step) {
      if (!ships.alive[i] || ships.side[i] !== sd) continue;
      const q = squadrons[ships.sq[i]]; if (!q || q.bg || q.hidden || fowHidden(q)) continue;
      c.fillStyle = sd === me ? '#5fe38a' : '#ff5a4a';
      shipWorldCPU(i, _a); c.fillRect(G.toX(_a.x) - 0.75, G.toY(_a.z) - 0.75, 1.5, 1.5);
    }
  }
  // 敵軍的最後已知位置（虛線圈）、選取中的分艦隊（白框）
  for (const q0 of squadrons) {
    if (q0.bg || q0.alive <= 0 || q0.hidden) continue;
    if (q0.side !== me && fog) { const v = pSeen(q0); if (v && v !== q0) { c.strokeStyle = 'rgba(255,120,100,.6)'; c.setLineDash([2, 2]); c.beginPath(); c.arc(G.toX(v.x), G.toY(v.z), 4, 0, TAU); c.stroke(); c.setLineDash([]); } continue; }
    if (!selected.has(q0)) continue;
    const r = Math.max(3, Math.max(q0.W, q0.D) * k * 0.5);
    c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.strokeRect(G.toX(q0.x) - r, G.toY(q0.z) - r, r * 2, r * 2);
  }
  // 艦橋：畫旗艦的位置與視線方向（扇形）
  if (BR.on) {
    const P0 = camPersp.position, d = camPersp.getWorldDirection(new THREE.Vector3()), a = Math.atan2(d.x, d.z);
    const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(camPersp.fov / 2)) * camPersp.aspect), L = 520;
    const pt = (ang) => [G.toX(P0.x + Math.sin(ang) * L), G.toY(P0.z + Math.cos(ang) * L)];
    c.fillStyle = 'rgba(255,255,255,.1)'; c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(G.toX(P0.x), G.toY(P0.z)); c.lineTo(...pt(a - hf)); c.lineTo(...pt(a + hf)); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(G.toX(P0.x), G.toY(P0.z), 2.5, 0, TAU); c.fill();
    return;
  }
  // 鏡頭看到的範圍
  const hh = CH.el ? CH.el.getBoundingClientRect().top : VH, pts = [[0, 0], [VW, 0], [VW, Math.min(VH, hh)], [0, Math.min(VH, hh)]].map(([x, y]) => groundAt(x, y)).map((p) => p && { x: Math.max(B.x0, Math.min(B.x1, p.x)), z: Math.max(B.z0, Math.min(B.z1, p.z)) });
  if (pts.every(Boolean)) {
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1; c.beginPath();
    pts.forEach((p, j) => (j ? c.lineTo(G.toX(p.x), G.toY(p.z)) : c.moveTo(G.toX(p.x), G.toY(p.z)))); c.closePath(); c.stroke();
  } else { c.fillStyle = '#fff'; c.fillRect(G.toX(view.target.x) - 2, G.toY(view.target.z) - 2, 4, 4); }
  // 在小地圖上下的命令：閃一下
  const P = CH.ping, u = P ? (performance.now() - P.t) / 600 : 1;
  if (u < 1) { c.strokeStyle = `rgba(143,227,165,${1 - u})`; c.lineWidth = 1.5; c.beginPath(); c.arc(G.toX(P.x), G.toY(P.z), 3 + u * 10, 0, TAU); c.stroke(); }
}
// 左鍵（拖曳）＝移動鏡頭；右鍵＝選取的艦隊移動到那裡；選目標中（移動、區域攻擊…）左鍵＝點那個位置
function mmBind(cv) {
  const at = (e) => { const r = cv.getBoundingClientRect(), G = mmGeom(cv), p = G.fromXY(e.clientX - r.left, e.clientY - r.top); return clampMap({ x: p.x, z: p.z }); };
  const look = (p) => { camAnim = null; view.target.x = p.x; view.target.z = p.z; updateCamera(); };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (BR.on) return;   // 艦橋：只看
    const p = at(e), A = GAME.skillArm;
    if (e.button === 2) {
      if (A) { skillEsc(); return; }
      if (ccPhaseOK() && actOn().length) { cmdMoveTo(p); mmPing(p); }
      return;
    }
    if (e.button !== 0) return;
    if (A && A.point) {
      if (A.move) cmdMoveTo(p); else if (A.area) cmdArea({ x: p.x, y: selAlt(), z: p.z }); else if (A.recon) cmdRecon(A.f, { x: p.x, y: selAlt(), z: p.z }); else skillCmd(A.f, A.id, null, p);
      GAME.skillArm = null; hideHint(); mmPing(p); return;
    }
    CH.mmDrag = true; cv.setPointerCapture(e.pointerId); look(p);
  });
  cv.addEventListener('pointermove', (e) => { if (CH.mmDrag) look(at(e)); });
  const up = () => { CH.mmDrag = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
}
function mmPing(p) { CH.ping = { x: p.x, z: p.z, t: performance.now() }; }
