// ═══════════════════════ 訓練作戰：教學課程與戰術手冊 ═══════════════════════
// 教學課程：一課＝一個固定的小戰場＋一串步驟。步驟有「目標」（check）時，偵測到玩家真的做了（看命令紀錄、選取、鏡頭、戰況）才前進；
//   沒有目標的步驟是說明，按「下一步」繼續。flow 'loadout' 的課走正式的編成 → 部署 → 開戰流程（步驟用 phase 標明在哪個畫面）。
// 戰鬥中的結束（撤退、勝負）照正式流程進到 showReport，再轉到 tutReport（不給經驗、不上傳紀錄；第一次完成給 TUT_MERIT 功勳）。
// 戰術手冊：從遊戲資料（艦種、陣型、技能、天賦、地形…）產生的圖文教範，數值改了手冊跟著變。
const TUT_STORE = 'fleet.tut', TUT_MERIT = 50;
const TUT = { L: null, i: 0, S: null, ok: false, okT: 0, el: null, min: false, timer: 0, complete: false, pausedBy: false, marks: null };
function tutLoad() { try { return JSON.parse(STORE.getItem(TUT_STORE) || 'null') || { done: {} }; } catch (e) { return { done: {} }; } }
function tutSave(d) { try { STORE.setItem(TUT_STORE, JSON.stringify(d)); } catch (e) { /* 只在本次 */ } }
const tutK = (id) => `<kbd>${keyLabel(keyOf(id))}</kbd>`;
const tutKQ = () => `<kbd>${SETTINGS.queueMod === 'Control' ? 'Ctrl' : SETTINGS.queueMod}</kbd>`;

// ───── 課程用的小工具 ─────
const tutMine = () => fleets.filter((f) => f.side === 0 && !f.supply && !f.reserve);
const tutFoes = () => fleets.filter((f) => f.side === 1 && !f.reserve);
function tutCenter(f) { return f ? centerOf(fleetAlive(f)) : null; }
function tutIn(f, m) { const c = tutCenter(f); return !!c && Math.hypot(c.x - m.x, c.z - m.z) < m.r; }
function tutHeadOk(f, H, tol = 0.45) { const g = f && fleetGroup(f); return !!g && !g.plan && Math.abs(wrapAngle(groupHeading(g, U.uTime.value) - H)) < tol; }
function tutSelFleets() { return new Set([...selected].filter((q) => q.alive > 0 && q.side === 0).map((q) => q.fleet).filter(Boolean)); }
function tutFoeRatio() { return sideAlive(1) / Math.max(1, GAME.init[1]); }
function tutWon() { return !!GAME.result && GAME.result.kind === 'win'; }
function tutForm(f) { const g = f && fleetGroup(f); return g ? g.formation : null; }
// 命令紀錄第 k 筆之後，玩家下過「換成橫陣」（直接或排進隊列）
function tutLineSince(k) { return cmdLog.slice(k).some((c) => c.side === GAME.playerSide && !c.auto && ((c.type === 'form' && c.kind === 'line') || (c.type === 'queue' && c.item && c.item.type === 'form' && c.item.kind === 'line'))); }

// 戰場上的艦隊（教學用的設定格式，與模擬室相同）
function tutFleet(o) {
  const side = o.side || 0;
  return { side, name: o.name, ax: o.x, az: o.z, ay: o.y || 0, h: o.h != null ? o.h : side ? 0 : Math.PI, formation: o.formation || 'line', orderly: !!o.orderly, layers: 1,
    comp: o.comp.slice(), hangar: (o.hangar || HANGAR_DEFAULT).slice(),
    commander: o.cmdr === null ? null : { name: (o.cmdr && o.cmdr.name) || (side ? '敵指揮官' : '教官'), title: '', trait: (o.cmdr && o.cmdr.trait) || 'dmg', level: (o.cmdr && o.cmdr.level) || 1, skills: ((o.cmdr && o.cmdr.skills) || []).slice() },
    ai: o.ai || null, reserve: false, activateAt: null, supply: !!o.supply, follow: o.follow != null ? o.follow : -1 };
}
function tutSetup(L) {
  // victory：照正式規則判定勝負；有 fight 的步驟＝到那一步才開始判定（前面的步驟先把敵人打垮也不會提早結束）
  return { bg: false, scenario: 'tut-' + L.id, level: 1, factions: [0, 1], timeLimit: SIM_INF, noVictory: !L.victory || L.steps.some((st) => st.fight),
    terrain: (L.terrain || []).map((t) => ({ ...t })), fleets: L.fleets.map(tutFleet) };
}

// 地面標記：目的地圈（mark：{x, z, r, H?}；H＝要朝向的方向，畫一個箭頭）
const tutGroup = new THREE.Group(); tutGroup.renderOrder = 6; scene.add(tutGroup);
function tutMarks(list) {
  tutGroup.clear();
  for (const m of list || []) {
    const ring = lineObj(0xffd27a, 0.85), pts = [];
    for (let k = 0; k <= 64; k++) pts.push([m.x + Math.cos(k / 64 * TAU) * m.r, m.z + Math.sin(k / 64 * TAU) * m.r]);
    setPts(ring, pts); tutGroup.add(ring);
    const ring2 = lineObj(0xffd27a, 0.35), p2 = [];
    for (let k = 0; k <= 64; k++) p2.push([m.x + Math.cos(k / 64 * TAU) * (m.r + 12), m.z + Math.sin(k / 64 * TAU) * (m.r + 12)]);
    setPts(ring2, p2); tutGroup.add(ring2);
    if (m.H != null) {   // 朝向箭頭
      const ux = Math.sin(m.H), uz = Math.cos(m.H), L = m.r * 0.8, ax = m.x + ux * L, az = m.z + uz * L, w = m.r * 0.22;
      const ar = lineObj(0xffd27a, 0.9);
      setPts(ar, [[m.x - ux * L * 0.5, m.z - uz * L * 0.5], [ax, az], [ax - ux * w + uz * w, az - uz * w - ux * w], [ax, az], [ax - ux * w - uz * w, az - uz * w + ux * w]]);
      tutGroup.add(ar);
    }
  }
}

// 編成畫面用的小工具（flow 'loadout'）
function tutLoComp(t) { const lo = GAME.loadout; return lo ? sumA(lo.fleets.map((f) => f.comp[t] || 0)) : 0; }

// ═════ 課程 ═════
// fleets：雙方艦隊（tutFleet 的格式）；victory：true＝照正式規則判定勝負（打贏＝完成）；op：操作難度（課程固定）
// cam：開場鏡頭；steps：{ title, text, goal?, check?(S), live?(S), pause?, mark?, phase?, enter?(S), fight?（到這一步才判定勝負） }
const TMIX = (cv, bb, cr, dd, es) => [cv, bb, cr, dd, es];
const TUT_LESSONS = [
  // ───────────── 基礎操作 ─────────────
  { id: 't1', grp: '基礎操作', name: '鏡頭與選取', op: 0, mins: 4,
    sum: '移動鏡頭、縮放、選取艦隊與全軍、暫停與調整時間速度。',
    learn: ['平移與縮放鏡頭', '選取一支艦隊、加選、框選、全選', '暫停、時間速度', '隨時查看操作說明'],
    cam: { x: 0, z: 560, h: 900 },
    fleets: [
      { name: '第一艦隊', x: -230, z: 620, comp: TMIX(0, 16, 50, 60, 50) },
      { name: '第二艦隊', x: 230, z: 620, comp: TMIX(0, 16, 50, 60, 50) },
    ],
    steps: [
      { title: '歡迎來到艦隊學校', pause: true, text: () => `這套課程帶你從零開始學會指揮艦隊。每一課都有一個小戰場，右邊這個面板會告訴你下一步做什麼；<b>完成目標就會自動前進</b>，也可以按「跳過」。<br><br>
        畫面上方是<b>戰況列</b>：左邊我軍、右邊敵軍的剩餘兵力，中間是時間；旁邊的按鈕可以暫停、調速度、開戰術面板、切換 2D／3D、撤退。<br>
        一個圖示代表 ${opts.rep} 艘船，戰場上的數字都是艘數。` },
      { title: '平移鏡頭', text: () => `按住 ${tutK('cam_up')}${tutK('cam_down')}${tutK('cam_left')}${tutK('cam_right')} 方向鍵，或按住<b>滑鼠中鍵拖曳</b>，把鏡頭移到別的地方。<br><small>觸控：單指拖曳。</small>`,
        goal: '把鏡頭移開一段距離', check: (S) => Math.hypot(view.target.x - S.cam.x, view.target.z - S.cam.z) > 220 },
      { title: '縮放', text: '轉動<b>滑鼠滾輪</b>拉近、拉遠。拉遠時艦隊會變成戰術符號（外框），適合看全局；拉近可以看清楚每一艘船。<br><small>觸控：雙指縮放。</small>',
        goal: '拉近或拉遠鏡頭', check: (S) => Math.abs(view.height - S.cam.h) > 260 },
      { title: '選取一支艦隊', text: '用<b>滑鼠左鍵點</b>一支我方艦隊（橘色）。作戰中點任何一支分艦隊都會選起它所屬的整支艦隊。畫面下方的<b>選取資訊列</b>會顯示選了什麼。',
        goal: '只選取一支艦隊', check: () => tutSelFleets().size === 1 },
      { title: '加選', text: '按住 <kbd>Shift</kbd>（或 <kbd>Ctrl</kbd>）再左鍵點<b>另一支</b>艦隊，兩支就會一起被選取。之後下的命令會同時給它們。',
        goal: '同時選取兩支艦隊', check: () => tutSelFleets().size >= 2 },
      { title: '取消選取', text: '按 <kbd>Esc</kbd> 取消選取。沒有選取任何東西時下命令＝<b>對全軍下令</b>，要小心。',
        goal: '取消所有選取', check: () => selected.size === 0 },
      { title: '框選與全選', text: '按住<b>左鍵拖曳</b>可以框選；<b>左鍵連點兩下</b>（或 <kbd>Ctrl</kbd>＋<kbd>A</kbd>）選取全軍。',
        goal: '選取全軍', check: () => { const all = sideSquadrons(0); return all.length > 0 && all.every((q) => selected.has(q)); } },
      { title: '暫停', text: () => `按 ${tutK('pause')} 暫停。<b>暫停中仍然可以下命令</b>：遇到混亂的局面先暫停、想清楚、下好命令再繼續，是最重要的指揮習慣。`,
        goal: '暫停遊戲', check: () => paused },
      { title: '時間速度', text: () => `再按 ${tutK('pause')} 繼續，然後按 ${tutK('speed_up')}／${tutK('speed_down')} 調整速度（×0.5～×8）。行軍時加速、交戰時放慢。<br><small>「設定 → 遊戲」可以設定開戰時的速度，以及下令時自動減速。</small>`,
        goal: '繼續遊戲並改變速度', check: (S) => !paused && speedIdx !== S.spd },
      { title: '操作說明', text: () => `按 ${tutK('help')} 可以隨時打開／關掉完整的操作說明（所有按鍵、觸控手勢）。按鍵可以在「⚙ 設定 → 按鍵綁定」改。`,
        goal: '打開操作說明', check: () => !gEl('help').hidden },
      { title: '完成', pause: true, text: () => `關掉操作說明（再按 ${tutK('help')}）。你已經會看戰場和選取部隊了。下一課學習<b>移動與朝向</b>。` },
    ] },

  { id: 't2', grp: '基礎操作', name: '移動、朝向與戰術隊列', op: 0, mins: 6,
    sum: '右鍵移動、拖曳決定朝向、轉向、用隊列排好連續動作，以及戰術面板。',
    learn: ['右鍵移動', '右鍵拖曳＝到達後的朝向', '轉向 45°', `戰術隊列（按住修飾鍵排命令）`, '戰術面板（簡化俯視圖）'],
    cam: { x: 0, z: 380, h: 1250 },
    fleets: [{ name: '第一艦隊', x: 0, z: 650, comp: TMIX(0, 20, 60, 80, 60) }],
    steps: [
      { title: '船怎麼移動', pause: true, text: '每艘船<b>往船頭方向前進最快</b>，倒退、側移都很慢；轉彎需要時間。艦隊移動時會先轉向目的地、到了再轉回你指定的朝向。<br><br>所以下移動命令時要想兩件事：<b>去哪裡</b>、<b>到了面向哪裡</b>（主砲只能打正前方）。' },
      { title: '右鍵移動', mark: [{ x: -360, z: 260, r: 120 }], text: '先左鍵選取第一艦隊，再<b>右鍵點</b>黃色圈裡的地面。艦隊會移動過去，朝向不變。<br><small>走得慢可以按 ＋ 加速。觸控：長按後放開。</small>',
        goal: '艦隊抵達黃色圈', check: (S) => S.cmds('move').length > 0 && tutIn(tutMine()[0], { x: -360, z: 260, r: 120 }) },
      { title: '指定朝向', mark: [{ x: 320, z: 150, r: 130, H: Math.PI / 2 }], text: '<b>右鍵按住</b>黃色圈的中心，<b>往箭頭方向拖曳</b>再放開：按下的地方＝目的地，拖曳的方向＝到達後的朝向。這次要讓艦隊抵達後面向右方。',
        goal: '抵達黃色圈並面向右方', check: () => tutIn(tutMine()[0], { x: 320, z: 150, r: 130 }) && tutHeadOk(tutMine()[0], Math.PI / 2) },
      { title: '原地轉向', text: () => `按 ${tutK('turn')} 讓選取的艦隊<b>原地向右轉 45°</b>。被敵人從側面攻擊時，快速轉向讓船頭（主砲）對準敵人。`,
        goal: '轉向一次', check: (S) => S.cmds('turn').length > 0 },
      { title: '戰術隊列', mark: [{ x: -300, z: -150, r: 90 }, { x: 0, z: -350, r: 90 }, { x: 300, z: -150, r: 90 }], text: () => `按住 ${tutKQ()} 再下命令，命令會<b>排進隊列</b>：前一個動作完成（抵達、變陣結束）才執行下一個。<br>
        按住 ${tutKQ()}，依序右鍵點三個黃色圈，排出一條巡邏路線。<br><small>不按修飾鍵直接下令＝清掉隊列。隊列也能排變陣、技能，例如「先移動、到了換陣型、再放技能」。觸控：「隊列」按鈕。</small>`,
        goal: '排進 3 個隊列命令', check: (S) => S.cmds('queue').length >= 3, live: (S) => `已排 ${Math.min(3, S.cmds('queue').length)}／3` },
      { title: '戰術面板', text: () => `按 ${tutK('tactical')} 打開<b>戰術面板</b>：簡化的俯視圖，看得到每支部隊的隊列、路線，可以直接在上面下令、拖曳節點修改路線；下方的側視圖可以調高度。單人模式打開時會自動暫停。`,
        goal: '打開戰術面板', check: () => TAC.open },
      { title: '關閉戰術面板', text: () => `在戰術面板裡試著點一支部隊、右鍵下一個移動，然後再按 ${tutK('tactical')}（或 Esc）關閉。`,
        goal: '關閉戰術面板', check: () => !TAC.open },
      { title: '完成', pause: true, text: '移動的基本功都學會了。實戰中記得：<b>先暫停、選取、右鍵拖曳決定位置與朝向</b>。下一課學習<b>陣型</b>。' },
    ] },

  { id: 't3', grp: '基礎操作', name: '陣型', op: 0, mins: 5,
    sum: '七種陣型的特性、變陣、整齊排列，以及指令輪盤。',
    learn: ['七種陣型與快捷鍵', '變陣需要時間', '整齊排列', '指令輪盤'],
    cam: { x: 0, z: 450, h: 800 },
    fleets: [{ name: '第一艦隊', x: 0, z: 520, comp: TMIX(10, 24, 60, 80, 70) }],
    steps: [
      { title: '陣型決定火力與弱點', pause: true, text: () => `陣型影響<b>火力倍率、防空、速度、受擊</b>。每種陣型的特性：<br>${tutFormTable()}` },
      { title: '試試各種陣型', text: () => `選取艦隊，按 ${tutK('form_line')}～${tutK('form_column')}、${tutK('form_wedge')}、${tutK('form_hcone')} 換陣型，至少試 4 種。<b>變陣需要約 ${MORPH_DUR} 秒</b>，變陣中的艦隊比較脆弱，不要在敵人眼前亂換。`,
        goal: '試過 4 種陣型', check: (S) => S.forms().size >= 4,
        live: (S) => `已試：${[...S.forms()].map((k) => FORMATIONS[k] ? FORMATIONS[k].name : k).join('、') || '—'}` },
      { title: '整齊排列', text: () => `按 ${tutK('orderly')} 切換<b>整齊排列</b>：船排成規則的格子（自然＝較鬆散）。整齊排列比較好預測射界；編成畫面也可以選「整齊・3 層」。`,
        goal: '切換整齊排列', check: (S) => S.cmds('orderly').length > 0 },
      { title: '指令輪盤', text: () => `在艦隊上<b>按住左鍵不動</b>約半秒，會出現<b>指令輪盤</b>：滑向想要的指令再放開＝下令，停在中間放開＝取消。輪盤出現時按 ${tutK('radial_prev')}／${tutK('radial_next')} 切換「陣型／攻擊」兩頁。<br>用輪盤把艦隊換回<b>橫陣</b>。`,
        goal: '用輪盤換成橫陣', check: (S) => S.flag.radial != null && tutForm(tutMine()[0]) === 'line' && tutLineSince(S.flag.radial) },
      { title: '完成', pause: true, text: '小訣竅：<b>行軍用縱陣（最快）、對射用橫陣、怕被包抄用圓陣、突擊用紡錘陣或圓錐陣</b>。下一課開始真正的交戰。' },
    ] },

  // ───────────── 交戰 ─────────────
  { id: 't4', grp: '交戰', name: '武器與攻擊命令', op: 0, mins: 6,
    sum: '主砲、副砲、防空砲與飛彈的射程，指定攻擊、齊射與飛彈齊射。',
    learn: ['三種光束砲的射程與射角', '距離與命中率', '指定攻擊目標', '全艦齊射、飛彈齊射', '護盾與飛彈'],
    cam: { x: 0, z: 250, h: 1300 },
    fleets: [
      { name: '第一艦隊', x: 0, z: 650, comp: TMIX(0, 30, 70, 80, 50) },
      { side: 1, name: '標靶甲', x: -260, z: -80, h: 0, cmdr: null, comp: TMIX(0, 6, 24, 30, 30) },
      { side: 1, name: '標靶乙', x: 260, z: -80, h: 0, cmdr: null, comp: TMIX(0, 6, 24, 30, 30) },
    ],
    steps: [
      { title: '自動開火', pause: true, text: () => `船上的武器都是<b>自動開火</b>的：敵人進入射程就打。你要做的是<b>把艦隊帶到好的位置、選擇目標</b>。<br>${tutGunTable()}
        <small>主砲只能打正前方 ±30° 左右、射程最遠、單發最重，但打小船命中率差；副砲射角大；防空砲全方向、優先打飛彈和艦載機。<br>距離越遠命中率越低（最大射程剩 ${Math.round(HIT_RULE.farMul * 100)}%）、傷害越低（剩 ${Math.round(BEAM_FALLOFF_MIN * 100)}%）。</small>` },
      { title: '進入射程', text: '前方有兩支不會動的標靶艦隊（藍色）。把第一艦隊往前移動、<b>船頭對著它們</b>，進入射程後就會開火。',
        goal: '第一次命中敵艦', check: () => dmgDealt[0] > 0 },
      { title: '指定攻擊', text: () => `平常每艘船會自己挑目標。按 ${tutK('attack')} 再<b>左鍵點一支敵方分艦隊</b>＝選取的艦隊集中攻擊它（沒有選取＝全軍）。集中打一個目標，讓它更快失去戰力。<br><small>觸控：「攻擊」按鈕。</small>`,
        goal: '指定攻擊一個目標', check: (S) => S.cmds('attack').length > 0 },
      { title: '飛彈齊射', text: () => `巡洋艦與驅逐艦帶飛彈：射程比光束遠、不衰減，平常自動發射。按 ${tutK('missile')} 讓選取的艦隊<b>立刻一起發射</b>——同時到達的飛彈比較容易突破防空。<br><small>飛彈打完要回補給艦隊補充；護盾還在時飛彈的傷害主要被護盾吃掉（×${MISSILE_RULE.shield}），護盾打光後直擊船體 ×${MISSILE_RULE.direct}。</small>`,
        goal: '飛彈齊射一次', check: (S) => S.cmds('missile').length > 0 },
      { title: '全艦齊射', text: () => `按 ${tutK('volley')} <b>全艦齊射</b>：冷卻好的光束砲同時開火。適合在敵人剛進入全威力距離、或護盾剛被打穿時爆發。`,
        goal: '全艦齊射一次', check: (S) => S.cmds('volley').length > 0 },
      { title: '殲滅標靶', text: () => `把兩支標靶打到剩不到 25%。<br><small>護盾沒有方向，要先打光護盾才傷得到船體；護盾在 ${SHIELD_RULE.delay} 秒沒被打後開始回充（被打光則要 ${SHIELD_RULE.broken} 秒）——所以<b>火力要集中、不要分散</b>。${typeof DEFLECT_RULE !== 'undefined' ? `光束打在護盾上有 ${Math.round(DEFLECT_RULE.none * 100)}% 機率被完全偏折、${Math.round(DEFLECT_RULE.half * 100)}% 機率減半。` : ''}</small>`,
        goal: '標靶兵力剩不到 25%', check: () => tutFoeRatio() < 0.25, live: () => `標靶剩 ${Math.round(tutFoeRatio() * 100)}%` },
      { title: '完成', pause: true, text: '武器會自己打，指揮官決定的是<b>距離、角度與目標</b>。下一課學習傷害加倍的<b>側背攻擊</b>。' },
    ] },

  { id: 't5', grp: '交戰', name: '側背攻擊與包抄', op: 0, mins: 7, victory: true,
    sum: '側面、背後受擊的傷害倍率，用兩支艦隊夾擊敵人。',
    learn: ['正面／側面／背後的傷害倍率', '牽制與包抄的分工', '圓錐陣的側擊加成', '圓陣沒有側背弱點'],
    cam: { x: 150, z: 250, h: 1400 },
    fleets: [
      { name: '第一艦隊（牽制）', x: -120, z: 640, comp: TMIX(0, 40, 90, 60, 50), cmdr: { name: '教官', skills: ['wall'] } },
      { name: '第二艦隊（包抄）', x: 520, z: 700, formation: 'column', comp: TMIX(0, 0, 40, 110, 50), cmdr: { name: '副官', skills: ['charge'] } },
      { side: 1, name: '敵守備艦隊', x: -80, z: -260, h: 0, comp: TMIX(0, 40, 90, 70, 60), ai: { tactic: 'push', level: 1 }, cmdr: { name: '巴爾克', level: 1 } },
    ],
    steps: [
      { title: '弱點在側面與背後', pause: true, text: () => `<b>船體</b>受到的傷害會依被打的方向放大：正面 ×1、<b>側面 ×${opts.flankSide}</b>、<b>背後 ×${opts.flankRear}</b>（護盾沒有方向）。<br>
        一支艦隊在正面<b>牽制</b>、另一支繞到側面<b>包抄</b>，是最有效的戰法。<br><small>圓陣沒有側背弱點；圓錐陣、空心錐陣打側背時傷害再 ×${FORMATIONS.wedge.flankBonus}。戰況數據（左上）會顯示敵我「被擊沉方向」正／側／背的數量。</small>` },
      { title: '正面牽制', text: '敵軍會往你推進。讓<b>第一艦隊</b>面對敵人、在正面接戰，把它拖住。',
        goal: '第一艦隊與敵軍交火', check: () => dmgDealt[0] > 0 },
      { title: '包抄艦隊換陣', text: () => `選取<b>第二艦隊</b>（快速的驅逐艦隊），按 ${tutK('form_wedge')} 換成<b>圓錐陣</b>：速度 ×${FORMATIONS.wedge.speed}、打側背傷害 ×${FORMATIONS.wedge.flankBonus}。`,
        goal: '第二艦隊換成圓錐陣或空心錐陣', check: () => ['wedge', 'hcone'].includes(tutForm(tutMine()[1])) },
      { title: '繞到側面', text: '讓第二艦隊<b>大繞一圈</b>從敵人的側面或背後切入（不要從敵人正面經過）。可以用隊列排兩個點；技能列的「突進」能加速。',
        get goal() { return `從側面或背後擊沉 ${ships5(8)} 艘以上的敵艦`; }, check: () => dmgStats[1][1] + dmgStats[1][2] >= 8,
        live: () => `敵軍被擊沉 正／側／背：${dmgStats[1].map((v) => ships5(v)).join('／')} 艘（側背合計 ${ships5(dmgStats[1][1] + dmgStats[1][2])}／${ships5(8)}）` },
      { title: '擊潰敵軍', text: () => `兩面夾擊，讓敵軍損失超過 ${Math.round((1 - ROUT_AT) * 100)}%（潰走）。`,
        goal: '打贏這一戰', check: () => tutWon(), live: () => `敵軍剩 ${Math.round(tutFoeRatio() * 100)}%` },
    ] },

  { id: 't6', grp: '交戰', name: '指揮官技能', op: 0, mins: 6, victory: true,
    sum: '技能列、集中火力、鐵壁、突進、極速射擊，以及指揮官的等級與天賦。',
    learn: ['技能的次數與冷卻', '集中火力要選目標', '防禦技能的時機', '指揮官等級與天賦'],
    cam: { x: 0, z: 300, h: 1300 },
    fleets: [
      { name: '第一艦隊', x: 0, z: 650, comp: TMIX(0, 40, 100, 90, 60), cmdr: { name: '教官', skills: ['focus', 'wall', 'charge', 'rapid', 'evade'] } },
      { side: 1, name: '敵前鋒艦隊', x: 0, z: -420, h: 0, comp: TMIX(0, 30, 80, 80, 60), ai: { tactic: 'push', level: 1 }, cmdr: { name: '霍斯特', level: 1 } },
    ],
    steps: [
      { title: '技能列', pause: true, text: () => `畫面下方是<b>技能列</b>，每位指揮官有自己的技能；每個技能每場有<b>次數</b>，用過後要<b>冷卻</b>。<br>${tutSkillTable(['focus', 'wall', 'charge', 'rapid', 'evade'])}` },
      { title: '突進', text: () => `按 ${tutK('skill_charge')}（或點技能列）放<b>突進</b>：向前速度 ×1.8，快速拉近距離。`,
        goal: '使用突進', check: (S) => S.skill('charge') },
      { title: '集中火力', text: () => `進入射程後按 ${tutK('skill_focus')}，再<b>左鍵點一支敵方分艦隊</b>：全軍集中砲擊它、傷害 +20%。`,
        goal: '使用集中火力', check: (S) => S.skill('focus') },
      { title: '鐵壁', text: () => `交火最激烈時按 ${tutK('skill_wall')} 放<b>鐵壁</b>：護盾受傷 −40%、船體受傷 −30%，持續 20 秒。`,
        goal: '使用鐵壁', check: (S) => S.skill('wall') },
      { title: '極速射擊', text: () => `按 ${tutK('skill_rapid')} 放<b>極速射擊</b>：光束開火間隔縮短 35%。和集中火力、鐵壁疊在一起效果最好。`,
        goal: '使用極速射擊', check: (S) => S.skill('rapid') },
      { title: '打贏這一戰', text: () => `還有 ${tutK('skill_evade')} <b>機動迴避</b>可以用。把敵軍打到潰走。`,
        goal: '打贏這一戰', check: () => tutWon(), live: () => `敵軍剩 ${Math.round(tutFoeRatio() * 100)}%` },
    ],
    outro: () => `<b>指揮官會成長</b>：打完作戰得到經驗（勝 60／平 35／敗 20，加上擊沉量），每 ${XP_PER_LEVEL} 經驗升一級、得 1 點天賦。到「單人戰鬥 → 指揮官」分配天賦，可以強化能力或學會新技能，隨時能退回重配。` },

  // ───────────── 戰場與戰術 ─────────────
  { id: 't7', grp: '戰場與戰術', name: '地形運用', op: 0, mins: 7, victory: true,
    sum: '小行星帶減速、星雲降低命中、巨大小行星擋住射線。',
    learn: ['三種地形的效果', '躲在巨大小行星後面', '用地形接近射程比你遠的敵人'],
    cam: { x: 0, z: 200, h: 1500 },
    terrain: [{ type: 'asteroid', x: -400, y: 0, z: 220, r: 160 }, { type: 'nebula', x: 400, y: 0, z: 180, r: 190 }, { type: 'rock', x: 0, y: 0, z: -60, r: 85 }],
    fleets: [
      { name: '第一艦隊', x: 0, z: 680, comp: TMIX(0, 20, 70, 90, 60), cmdr: { name: '教官', skills: ['charge', 'wall'] } },
      { side: 1, name: '敵砲擊艦隊', x: 0, z: -700, h: 0, comp: TMIX(0, 50, 10, 0, 20), cmdr: { name: '奧德', level: 1 } },
    ],
    steps: [
      { title: '三種地形', pause: true, text: () => `${Object.values(TERRAIN_TYPES).map((d) => `<b>${d.name}</b>：${d.desc}`).join('<br>')}<br><br>北方有一支<b>戰列艦</b>砲擊艦隊（主砲射程 ${SHIP_TYPES[1].guns.main.far}），比你的船打得遠。直接衝過去會挨打很久——利用地形。` },
      { title: '小行星帶', mark: [{ x: -400, z: 220, r: 160 }], text: '把艦隊開進左邊的<b>小行星帶</b>，感受一下速度減半。艦隊會盡量照直線走，行軍路線要避開它。',
        goal: '艦隊中心進入小行星帶', check: () => tutIn(tutMine()[0], { x: -400, z: 220, r: 150 }) },
      { title: '電離星雲', mark: [{ x: 400, z: 180, r: 190 }], text: '再開進右邊的<b>電離星雲</b>。在星雲裡<b>開火與挨打的命中率都下降</b>——射程短、數量多的一方可以躲在星雲裡等敵人靠近。',
        goal: '艦隊中心進入星雲', check: () => tutIn(tutMine()[0], { x: 400, z: 180, r: 180 }) },
      { title: '躲在岩石後面', mark: [{ x: 0, z: 110, r: 80 }], text: '中央的<b>巨大小行星</b>是實體障礙：光束、飛彈都會被擋住。把艦隊開到它的<b>正後方</b>（黃色圈），讓岩石擋在你和敵方戰列艦之間。',
        goal: '躲到岩石後方', check: () => tutIn(tutMine()[0], { x: 0, z: 110, r: 90 }) },
      { title: '從掩護後殺出', fight: true, text: '從岩石後面<b>從側面繞出去</b>直撲敵艦隊（突進可以加速），讓戰列艦來不及用主砲多打幾輪。戰列艦主砲轉得慢、打小船不準，貼近後是你的機會。',
        goal: '打贏這一戰', check: () => tutWon(), live: () => `敵軍剩 ${Math.round(tutFoeRatio() * 100)}%` },
    ] },

  { id: 't8', grp: '戰場與戰術', name: '反制敵方打法', op: 0, mins: 8, victory: true,
    sum: '認識 AI 的四種打法，實戰反制「中央突破」。',
    learn: ['正面推進、遠距離消耗、側翼包抄、中央突破', '每種打法的反制', '用凹形陣包夾紡錘陣'],
    cam: { x: 0, z: 250, h: 1400 },
    fleets: [
      { name: '第一艦隊', x: -200, z: 620, comp: TMIX(0, 34, 80, 70, 50), cmdr: { name: '教官', skills: ['wall', 'focus'] } },
      { name: '第二艦隊', x: 260, z: 640, comp: TMIX(0, 16, 50, 80, 50), cmdr: { name: '副官', skills: ['charge'] } },
      { side: 1, name: '敵突擊艦隊', x: 0, z: -560, h: 0, formation: 'spindle', comp: TMIX(0, 34, 95, 95, 50), ai: { tactic: 'breakthrough', level: 2 }, cmdr: { name: '格倫', level: 2, skills: ['charge'] } },
    ],
    steps: [
      { title: '敵人的四種打法', pause: true, text: () => `作戰簡報會告訴你敵人的<b>偏好打法</b>（情報不一定準）。${tutTacticTable()}` },
      { title: '準備包夾', text: () => `這次的敵人用<b>紡錘陣中央突破</b>直衝過來。選取<b>第一艦隊</b>，按 ${tutK('form_crescent')} 換成<b>凹形陣</b>，兩翼向前包住它。`,
        goal: '有一支艦隊換成凹形陣', check: () => tutMine().some((f) => tutForm(f) === 'crescent') },
      { title: '側面伏擊', text: '讓<b>第二艦隊</b>往旁邊讓開，等敵人衝進第一艦隊時，從側面打它<b>薄弱的兩側</b>。',
        goal: '敵軍接近（距離 700 內）', check: () => { const a = tutCenter(tutMine()[0]), b = tutCenter(tutFoes()[0]); return !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) < 700; } },
      { title: '接觸時開鐵壁', text: () => `紡錘陣正面受傷 −30%、衝進陣中會讓你<b>陣形混亂</b>（開火變慢、受傷增加）。接觸前按 ${tutK('skill_wall')} 放<b>鐵壁</b>撐過衝擊。`,
        goal: '使用鐵壁', check: (S) => S.skill('wall') },
      { title: '擊潰敵軍', text: '集中火力、兩面夾擊，打贏這一戰。',
        goal: '打贏這一戰', check: () => tutWon(), live: () => `敵軍剩 ${Math.round(tutFoeRatio() * 100)}%` },
    ] },

  // ───────────── 配隊 ─────────────
  { id: 't9', grp: '配隊', name: '編成與配隊', op: 0, mins: 10, victory: true, flow: 'loadout',
    comps: [TMIX(0, 180, 200, 100, 20), TMIX(0, 150, 180, 140, 20)],   // 起始編成：戰列、巡洋多，幾乎沒有護衛艦（讓玩家自己補防空）
    sum: '用預算組艦隊：艦種分工、看敵情配隊、補給艦隊、艦載機，接著部署與開戰。',
    learn: ['各艦種的定位與成本', '看敵方編成決定配隊', '補給艦隊與飛彈', '航母的艦載機配置', '部署位置與朝向'],
    sc: { budget: 3000, maxFleets: 2, seed: 909, timeLimit: 420, level: 1, terrain: [{ type: 'rock', x: -320, y: 0, z: -40, r: 60 }],
      story: '敵方的航空艦隊以航母與飛彈巡洋艦為主，會拉開距離用艦載機和飛彈消耗你。',
      enemy: [{ name: '敵航空艦隊', commander: { name: '米蘭', trait: 'dmg', level: 1, skills: [] }, comp: TMIX(140, 60, 220, 80, 40), formation: 'ring', tactic: 'kite', x: 0, z: -660, h: 0 }] },
    steps: [
      { phase: 'loadout', title: '編成畫面', text: () => `這是<b>編成</b>：用預算（這一課 3,000 點）決定每支艦隊帶什麼船、由哪位指揮官帶領。<br>${tutShipTable()}<small>數量以圖示計，1 個圖示＝${opts.rep} 艘；成本是每個圖示的點數。</small>` },
      { phase: 'loadout', title: '看敵情配隊', text: () => `情報：敵方是<b>航母＋飛彈巡洋艦</b>的航空艦隊，而這份起始編成<b>幾乎沒有護衛艦</b>。艦載機和飛彈都會被<b>防空</b>攔截——<b>護衛艦</b>防空最好（防空係數 ${SHIP_TYPES[4].aa}，其他艦種約 0.2），又便宜。<br>把全軍的護衛艦增加到 <b>150 個圖示以上</b>（在艦種那一列按 ＋ 或直接輸入數字）。`,
        goal: '護衛艦合計 ≥ 150', check: () => tutLoComp(4) >= 150, live: () => `目前護衛艦 ${tutLoComp(4)}／150` },
      { phase: 'loadout', title: '補給艦隊', text: () => `巡洋艦（${SHIP_TYPES[2].missile.n} 發）與驅逐艦（${SHIP_TYPES[3].missile.n} 發）的飛彈打完就沒了。按「<b>＋ 補給艦隊</b>」：補給艦 ${SUPPLY_RULE.range} 範圍內的友艦每 ${SUPPLY_RULE.cd} 秒補 1 發。補給艦隊不佔艦隊數、沒有指揮官，預設跟在艦隊後方。<br><small>補給艦被擊沉，它帶的存量就沒了——別讓它跑到前線。</small>`,
        goal: '加入一支補給艦隊', check: () => GAME.loadout && supplyList(GAME.loadout).length > 0 },
      { phase: 'loadout', title: '航母與艦載機（選讀）', text: () => `如果編了<b>航母</b>，下方會出現<b>艦載機配置</b>（每艘 ${SHIP_TYPES[0].fighters.n} 架）：${CRAFT.map((c) => `<b>${c.name}</b>：${c.note}`).join('；')}。<br>對付航空艦隊，多帶<b>攔截機</b>可以保護艦隊。` },
      { phase: 'loadout', title: '陣型與預算', text: '每支艦隊可以選<b>起始陣型</b>（這次敵人多是空中威脅，圓陣的防空 ×2）。確認<b>沒有超出預算</b>後，按「<b>下一步：部署 →</b>」。',
        goal: '進入部署畫面', check: () => GAME.phase === 'deploy' },
      { phase: 'deploy', title: '部署', text: '在<b>橘色框</b>（部署區）裡：左鍵點艦隊（或上方按鈕）選擇要放的那一支，<b>右鍵點擊＝放置、右鍵按住拖曳＝朝向</b>，↺↻ 旋轉。<br>藍色框是敵方的部署區。把至少一支艦隊換個位置。',
        goal: '移動一支艦隊的部署位置', check: (S) => JSON.stringify(GAME.loadout.fleets.map((f) => [f.x, f.z, f.h])) !== S.flag.pos,
        enter: (S) => { S.flag.pos = JSON.stringify(GAME.loadout.fleets.map((f) => [f.x, f.z, f.h])); } },
      { phase: 'deploy', title: '開戰', text: '部署好後按下方的「<b>開戰</b>」。', goal: '開戰', check: () => GAME.phase === 'battle' },
      { phase: 'battle', title: '打贏航空艦隊', text: () => `敵人會<b>拉開距離</b>消耗你：用突進或快船<b>逼近</b>，打它的航母（艦載機的來源）。按 ${tutK('attack')}＋左鍵點航母所在的分艦隊。`,
        goal: '打贏這一戰', check: () => tutWon(), live: () => `敵軍剩 ${Math.round(tutFoeRatio() * 100)}%` },
    ] },

  // ───────────── 進階規則 ─────────────
  { id: 't10', grp: '進階規則', name: '3D 與高度', op: 1, mins: 6, victory: true,
    sum: '「進階」難度：3D 鏡頭、讓艦隊升降，攻擊不同高度的敵人。',
    learn: ['3D 鏡頭旋轉與仰角', '改變艦隊高度', '戰術面板的側視圖'],
    cam: { x: 0, z: 400, h: 1100 },
    fleets: [
      { name: '第一艦隊', x: 0, z: 640, comp: TMIX(0, 24, 70, 80, 50) },
      { side: 1, name: '高空標靶', x: 0, y: 260, z: -120, h: 0, cmdr: null, comp: TMIX(0, 6, 30, 30, 30) },
    ],
    steps: [
      { title: '戰場是立體的', pause: true, text: () => `「<b>進階</b>」與「<b>擬真</b>」難度下，艦隊可以在 ±${ALT_RANGE} 的高度範圍內上下移動，作戰中只能用 3D 畫面。敵人可能從上方或下方來，<b>錯開高度</b>也能讓後排的船不被前排擋住射線。` },
      { title: '旋轉鏡頭', text: () => `按住 ${tutK('cam_yaw_l')}／${tutK('cam_yaw_r')}，或<b>按住中鍵拖曳</b>，水平旋轉鏡頭。`,
        goal: '把鏡頭轉一個角度', check: (S) => Math.abs(wrapAngle(view.yaw - S.cam.yaw)) > 0.5 },
      { title: '仰角', text: () => `按 ${tutK('cam_pitch_up')}／${tutK('cam_pitch_dn')} 調整鏡頭仰角，從側面看就能看出高度差。前方的標靶在<b>高處</b>。`,
        goal: '改變鏡頭仰角', check: (S) => Math.abs(view.pitch - S.cam.pitch) > 0.15 },
      { title: '爬升', text: () => `選取艦隊，<b>右鍵按住地面不放、同時轉滾輪</b>：每格調整目的地高度 20，放開後艦隊會邊走邊升降（按住 ${tutK('pitch_mod')} 轉滾輪＝到達後的仰角）。<br>也可以打開戰術面板（${tutK('tactical')}），在下方的<b>側視圖右鍵上下拖曳</b>改高度。<br>讓艦隊爬升到 +150 以上。`,
        goal: '艦隊高度 ≥ +150', check: () => { const g = fleetGroup(tutMine()[0]); return !!g && (g.ay || 0) > 150; }, live: () => { const g = fleetGroup(tutMine()[0]); return `目前高度 ${g ? Math.round(g.ay || 0) : 0}`; } },
      { title: '擊毀高空標靶', fight: true, text: '接近標靶並把它打到潰走。',
        goal: '打贏這一戰', check: () => tutWon(), live: () => `標靶剩 ${Math.round(tutFoeRatio() * 100)}%` },
    ] },

  { id: 't11', grp: '進階規則', name: '擬真：戰爭迷霧與艦橋', op: 2, mins: 9, victory: true,
    sum: '「擬真」難度：從旗艦艦橋指揮、戰爭迷霧、偵察機、區域攻擊與友軍誤傷。',
    learn: ['艦橋視角與戰術台', '偵測範圍與自動掃描', '派偵察機做區域掃描', '區域攻擊（盲射）', '友軍誤傷與空心錐陣'],
    fleets: [
      { name: '第一艦隊', x: 0, z: 650, comp: TMIX(16, 24, 70, 80, 60), hangar: [2, 3, 1, 0], cmdr: { name: '教官', skills: ['charge', 'wall'] } },
      { side: 1, name: '隱藏的敵艦隊', x: 420, z: -480, h: -0.5, comp: TMIX(0, 20, 60, 70, 50), cmdr: { name: '佩蕾', level: 1 } },
    ],
    steps: [
      { title: '站上艦橋', pause: true, text: () => `「<b>擬真</b>」難度從<b>旗艦艦橋</b>指揮：滑鼠左右移動＝轉頭（往左看「戰況」、往右看「各艦隊旗艦」）。<br><b>艦橋上只能透過戰術台下令</b>：按 ${tutK('tactical')}、滾輪往下，或把滑鼠移到畫面最下方＝<b>低頭看戰術台</b>。` },
      { title: '低頭看戰術台', text: () => `按 ${tutK('tactical')} 低頭看戰術台。之後的命令都在這裡下（看著戰術台時把滑鼠移到最上方＝抬頭）。`,
        goal: '看著戰術台', check: () => BR.on && bridgeConsoleK() > 0.5 },
      { title: '戰爭迷霧', text: () => `你<b>只看得到偵測範圍內</b>的敵人（護衛艦 ${SENSOR_R[4]}、航母 ${SENSOR_R[0]}、戰列 ${SENSOR_R[1]}…，3D 距離），敵人開火會暴露位置。開戰 ${FOW_RULE.scanFirst} 秒後艦隊會<b>自動脈衝掃描</b>（半徑 ${FOW_RULE.scanR}、冷卻 ${FOW_RULE.scanCd} 秒），可以在戰術台關掉。<br>敵人在很遠的地方——派<b>偵察機</b>去找。` },
      { title: '派偵察機', text: () => `你的艦隊有<b>航母</b>。按 ${tutK('scan')}，再<b>點戰術台地圖上的一點</b>，航母會派偵察機飛過去，在半徑 ${FOW_RULE.recon.r} 內盤旋 ${FOW_RULE.recon.loiter} 秒，看到的敵人都會回報。<br><small>敵人大約在你前方 1,100 的右側：先在戰術台上<b>轉滾輪把地圖拉遠</b>，再點那一帶。</small>`,
        goal: '派出偵察機', check: (S) => S.cmds('recon').length > 0 },
      { title: '找到敵人', text: '等偵察機回報，或者自己往前搜索。找到後戰術台上會出現敵方艦隊（看不到時會留下「最後已知位置」）。',
        goal: '發現敵艦隊', check: () => fleets.some((f) => f.side === 1 && f.sqs.some((q) => q.alive > 0 && fowKnows(fowObs(0), q))) },
      { title: '區域攻擊', text: () => `看不到的敵人不會被自動攻擊。按 ${tutK('area')}，再點地圖上的位置：選取的艦隊對那裡開火 ${FOW_RULE.area.dur} 秒（看不到目標＝盲射，命中率 ×${FOW_RULE.area.blind}）。往敵人的位置試一次。`,
        goal: '下一次區域攻擊', check: (S) => S.cmds('area').length > 0 },
      { title: '友軍誤傷', fight: true, text: () => `擬真難度下光束<b>穿過別的友軍部隊會誤傷</b>，同一個部隊被擋住時多半停火——別讓艦隊排成一直線互相擋。<b>空心錐陣</b>（${tutK('form_hcone')}）往正前方開火時不會被自己擋住；天賦「精準射擊」「火線管制」「完美布陣」可以減少誤傷。<br>接近並擊潰敵艦隊。`,
        goal: '打贏這一戰', check: () => tutWon(), live: () => `敵軍估計剩 ${Math.round(fowEstAlive(1) / Math.max(1, GAME.init[1]) * 100)}%` },
    ] },
];
const TUT_BY_ID = Object.fromEntries(TUT_LESSONS.map((L) => [L.id, L]));

// ───── 表格（課程說明與手冊共用，從遊戲資料產生） ─────
function tutFormTable(keys = Object.keys(FORMATIONS)) {
  const fk = { line: 'form_line', spindle: 'form_spindle', crescent: 'form_crescent', ring: 'form_ring', column: 'form_column', wedge: 'form_wedge', hcone: 'form_hcone' };
  return `<table class="tut-tbl"><tr><th>陣型</th><th>鍵</th><th>火力</th><th>防空</th><th>特性</th></tr>${keys.map((k) => { const F = FORMATIONS[k]; return `<tr><td><b>${F.name}</b></td><td>${fk[k] ? tutK(fk[k]) : ''}</td><td>×${F.fire}${F.fireNear ? `<br><small>近戰 ×${F.fireNear}</small>` : ''}</td><td>${(AIR_RULE.formBase + F.aa).toFixed(1)}</td><td class="tl">${F.note}</td></tr>`; }).join('')}</table>`;
}
function tutGunTable() {
  return `<table class="tut-tbl"><tr><th>艦種</th><th>主砲</th><th>副砲</th><th>防空</th><th>飛彈</th></tr>${SHIP_TYPES.slice(0, N_COMBAT).map((s) => `<tr><td><b>${s.name}</b></td>${GUN_KEYS.map((k) => `<td>${s.guns[k] ? `${s.guns[k].far}<small>／全威力 ${s.guns[k].near}</small>` : '—'}</td>`).join('')}<td>${s.missile ? `${s.missile.range}<small>／${s.missile.n} 發</small>` : '—'}</td></tr>`).join('')}</table>`;
}
function tutShipTable() {
  const role = ['艦載機打擊、維修；自身火力弱，要被保護', '主砲射程最遠、護盾最厚、最慢；打大船', '均衡、帶飛彈；主力', '快、飛彈多；包抄、追擊', '便宜、難打中、防空最好；保護艦隊', '補充飛彈；只能編在補給艦隊'];
  return `<table class="tut-tbl"><tr><th>艦種</th><th>點數</th><th>耐久／護盾</th><th>速度</th><th class="tl">定位</th></tr>${SHIP_TYPES.map((s, t) => `<tr><td><b>${s.name}</b></td><td>${s.cost}</td><td>${s.hp}／${s.sh}</td><td>${s.speed}</td><td class="tl">${role[t] || ''}</td></tr>`).join('')}</table>`;
}
function tutSkillTable(ids = Object.keys(SKILLS)) {
  const key = (id) => (keyOf('skill_' + id) ? tutK('skill_' + id) : '');
  return `<table class="tut-tbl"><tr><th>技能</th><th>鍵</th><th>次數</th><th>冷卻</th><th class="tl">效果</th></tr>${ids.map((id) => { const s = SKILLS[id]; return `<tr><td><b>${s.name}</b></td><td>${key(id)}</td><td>${s.uses}</td><td>${s.cd ? s.cd + ' 秒' : '—'}</td><td class="tl">${s.desc}</td></tr>`; }).join('')}</table>`;
}
const TUT_COUNTER = {
  push: '用射程比它遠的戰列艦先打；正面牽制、另一支艦隊從側面包抄；它停下來對射時正是繞側的時機。',
  kite: '它會保持在射程邊緣、被逼近就後退：用突進、縱陣或圓錐陣快速貼近，用快船追；躲在星雲或岩石後接近。',
  flank: '注意側翼：留一支艦隊或預備隊面向它來的方向，被繞到時立刻轉向（右鍵拖曳或轉向鍵）或換圓陣；先集中火力打掉繞過來的那支。',
  breakthrough: '換凹形陣包夾、接觸時開鐵壁；或讓開正面、從兩側打它薄弱的側面；紡錘陣近戰很強，別跟它在正面硬碰。',
};
function tutTacticTable() {
  return `<table class="tut-tbl"><tr><th>打法</th><th class="tl">敵人會怎麼做</th><th class="tl">反制</th></tr>${Object.entries(TACTICS).map(([k, t]) => `<tr><td><b>${t.name}</b></td><td class="tl">${t.desc}</td><td class="tl">${TUT_COUNTER[k] || ''}</td></tr>`).join('')}</table>`;
}

// ═════ 流程 ═════
function tutLessonNo(L) { return TUT_LESSONS.indexOf(L) + 1; }
function tutStart(L) {
  tutClose();
  TUT.L = L; TUT.i = 0; TUT.complete = false; TUT.min = false;
  const sc = { id: 'tut-' + L.id, name: `教學・${L.name}`, tut: L, op: L.op || 0, seed: (L.sc && L.sc.seed) || 700 + tutLessonNo(L), timeLimit: SIM_INF, budget: 0, maxFleets: 1, level: 1,
    enemy: [], events: [], terrain: L.terrain || [], intel: { accuracy: 1, hide: [] }, story: L.sum, ...(L.sc || {}) };
  GAME.sc = sc;
  if (L.flow === 'loadout') {   // 走正式流程：編成 → 部署 → 開戰（makeSetup）
    GAME.loadout = defaultLoadout(sc); GAME.loadout.sc = sc.id;
    (L.comps || []).forEach((c, k) => { if (GAME.loadout.fleets[k]) GAME.loadout.fleets[k].comp = c.slice(); });
    showLoadout(); tutOpen(); return;
  }
  GAME.attempt = (GAME.attempt || 0) + 1; GAME.recView = false; GAME.watch = false; SIM.t0 = 0;
  overlay(null); fieldGroup.clear();
  applyOp(sc.op); const setup = tutSetup(L); setup.op = GAME.op;
  newBattle(sc.seed, setup);
  setRule('fire', true); setRule('advance', false);
  GAME.init = [sideAlive(0), sideAlive(1)];
  GAME.result = null; GAME.reportShown = false; GAME.replaying = false; GAME.replayEnd = null; GAME.skillArm = null; GAME.xp = null; GAME.log = []; GAME.simCtl = null;
  gEl('battlehud').innerHTML = '';
  drawField(false);
  GAME.playerSide = 0; setPhase('battle'); setCmdSide(0, false); clearSelection();
  paused = false; setSpeed(SETTINGS.speedIdx);
  force3D(); if (GAME.op === 2) enterBridge();
  if (opts.fow && SETTINGS.autoScan === false) issue('autoscan', { on: false });
  const C = L.cam || { x: 0, z: 400, h: 1100 };
  camAnim = null; view.target.x = C.x; view.target.z = C.z; view.height = C.h; view.yaw = 0; view.pitch = ELEV; updateCamera();
  tutOpen();
}
function tutOpen() {
  if (!TUT.el) {
    TUT.el = document.createElement('div'); TUT.el.id = 'tut-panel'; document.body.appendChild(TUT.el);
    TUT.el.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });   // 按鈕不搶焦點（空白鍵才不會按到它）
    TUT.el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'next' || b.dataset.a === 'skip') tutNext();
      else if (b.dataset.a === 'min') { TUT.min = !TUT.min; tutRender(); }
      else if (b.dataset.a === 'quit') tutQuit();
    });
  }
  TUT.el.hidden = false;
  clearInterval(TUT.timer); TUT.timer = setInterval(tutTick, 150);
  tutEnter(TUT.i);
}
function tutClose() {
  clearInterval(TUT.timer); TUT.timer = 0;
  if (TUT.el) TUT.el.hidden = true;
  document.body.classList.remove('tut-side');
  tutMarks(null);
  if (TUT.S && TUT.pausedBy && GAME.phase === 'battle') { paused = false; updateTimeUI(); }
  TUT.L = null; TUT.S = null; TUT.pausedBy = false;
}
const TUT_PH = { loadout: 0, deploy: 1, battle: 2 };
function tutEnter(i) {
  const L = TUT.L, st = L.steps[i]; TUT.i = i; TUT.ok = false;
  const S = TUT.S = {
    t0: U.uTime.value, log0: cmdLog.length, cam: { x: view.target.x, z: view.target.z, h: view.height, yaw: view.yaw, pitch: view.pitch }, spd: speedIdx, flag: {},
    cmds: (type) => cmdLog.slice(S.log0).filter((c) => c.side === GAME.playerSide && c.type === type && !c.auto && !c.fromQueue),
    // 技能：整場都算（次數有限，先用了後面的技能也不必再用一次）
    skill: (id) => cmdLog.some((c) => c.side === GAME.playerSide && ((c.type === 'skill' && c.skill === id) || (c.type === 'queue' && c.item && c.item.type === 'skill' && c.item.skill === id))),
    forms: () => new Set([...S.cmds('form').map((c) => c.kind), ...S.cmds('queue').filter((c) => c.item && c.item.type === 'form').map((c) => c.item.kind)]),
  };
  if (cmdLog.length < S.log0) S.log0 = 0;
  tutMarks(GAME.phase === 'battle' ? st.mark : null);
  if (st.enter) try { st.enter(S); } catch (e) { /* 戰場還沒準備好 */ }
  if (st.fight && battleSetup) battleSetup.noVictory = false;   // 開始判定勝負（教學不存回放，不必走命令）
  if (TUT.pausedBy && !st.pause && GAME.phase === 'battle') { paused = false; updateTimeUI(); TUT.pausedBy = false; }
  if (st.pause && GAME.phase === 'battle' && !paused) { paused = true; updateTimeUI(); TUT.pausedBy = true; }
  tutRender();
}
function tutNext() {
  if (!TUT.L) return;
  if (TUT.i + 1 >= TUT.L.steps.length) { tutFinish(); return; }
  tutEnter(TUT.i + 1);
}
// 所有步驟完成：戰鬥中＝以「教學完成」結束這一戰（照正式流程進到報告）
function tutFinish() {
  TUT.complete = true;
  if (GAME.phase === 'battle' && !GAME.result) { if (TUT.pausedBy) { paused = false; TUT.pausedBy = false; } GAME.result = battleResult('win', '教學完成'); }
  else if (GAME.phase !== 'battle') tutReport();
}
function tutQuit() {
  if (GAME.phase === 'battle' && !GAME.result) { quitBattle(); return; }
  tutClose(); showTraining();
}
function tutTick() {
  const L = TUT.L;
  if (!L || !GAME.sc || GAME.sc.tut !== L || !['loadout', 'deploy', 'battle'].includes(GAME.phase)) { if (L && GAME.phase !== 'report') tutClose(); return; }
  const st = L.steps[TUT.i], S = TUT.S;
  // 走在步驟前面了（例如還沒看完說明就按了「部署」）：跳過前面畫面的步驟
  if (st.phase && TUT_PH[GAME.phase] > TUT_PH[st.phase]) { tutNext(); return; }
  if (TUT.el && !TUT.min && st.live) { const el = TUT.el.querySelector('.tp-live'); if (el) try { el.innerHTML = st.live(S); } catch (e) { /* 略過 */ } }
  if (st.phase && st.phase !== GAME.phase) return;
  if (radialOpen() && S.flag.radial == null) S.flag.radial = cmdLog.length;   // 第一次打開輪盤時的命令紀錄位置（之後的變陣才算用輪盤下的）
  if (TUT.el) {   // 戰術面板（艦橋的戰術台）開著：教學面板縮到它上方，目標與按鈕排在前面
    const tac = TAC.open && gEl('tac'), lim = tac ? tac.getBoundingClientRect().top - TUT.el.getBoundingClientRect().top - 10 : 0;
    TUT.el.style.maxHeight = tac ? Math.max(110, lim) + 'px' : ''; TUT.el.classList.toggle('tac', !!tac);
  }
  document.body.classList.toggle('tut-side', GAME.phase === 'loadout' && !TUT.min);   // 編成畫面：內容讓出教學面板的位置
  if (!TUT.ok && st.check) {
    let ok = false; try { ok = !!st.check(S); } catch (e) { ok = false; }
    if (ok) { TUT.ok = true; TUT.okT = performance.now(); tutRender(); }
  }
  if (TUT.ok && performance.now() - TUT.okT > 900) tutNext();
}
function tutRender() {
  const L = TUT.L, el = TUT.el; if (!L || !el) return;
  const st = L.steps[TUT.i], S = TUT.S, txt = typeof st.text === 'function' ? st.text(S) : st.text;
  const head = `<div class="tp-head"><span class="tp-no">教學 ${tutLessonNo(L)}／${TUT_LESSONS.length}</span><b>${L.name}</b><span class="g-sp"></span><span class="tp-step">${TUT.i + 1}／${L.steps.length}</span><button class="g-btn sm" data-a="min" title="${TUT.min ? '展開' : '縮小'}">${TUT.min ? '▢' : '—'}</button></div>`;
  el.classList.toggle('min', TUT.min);
  if (TUT.min) { el.innerHTML = head + `<div class="tp-mini">${st.title}${st.goal ? `：${st.goal}` : ''}</div>`; return; }
  const dots = L.steps.map((_, k) => `<i class="${k < TUT.i ? 'd' : k === TUT.i ? 'c' : ''}"></i>`).join('');
  el.innerHTML = `${head}<div class="tp-dots">${dots}</div>
    <h4>${st.title}</h4><div class="tp-text">${txt}</div>
    ${st.goal ? `<div class="tp-goal ${TUT.ok ? 'ok' : ''}"><span>${TUT.ok ? '✓ 完成' : '目標'}</span>${st.goal}</div>` : ''}
    <div class="tp-live"></div>
    <div class="tp-btns">${st.check ? '<button class="g-btn sm" data-a="skip" title="不做這一步，直接到下一步">跳過</button>' : `<button class="g-btn pri" data-a="next">${TUT.i + 1 >= L.steps.length ? '完成 ✓' : '下一步 →'}</button>`}<span class="g-sp"></span><button class="g-btn sm" data-a="quit">結束教學</button></div>`;
  if (st.live) try { el.querySelector('.tp-live').innerHTML = st.live(S); } catch (e) { /* 略過 */ }
}

// ───── 結束畫面（showReport 轉過來） ─────
function tutReport() {
  const L = TUT.L || (GAME.sc && GAME.sc.tut), R = GAME.result;
  if (!L) { showTraining(); return; }
  const done = TUT.complete || (L.victory && R && R.kind === 'win');
  tutClose();
  setPhase('report');
  const save = tutLoad(); let merit = 0;
  if (done && !save.done[L.id]) { save.done[L.id] = 1; tutSave(save); merit = TUT_MERIT; ROSTER.merit += merit; rosterSave(); }
  else if (done) { save.done[L.id] = (save.done[L.id] || 1) + 1; tutSave(save); }
  const next = TUT_LESSONS[TUT_LESSONS.indexOf(L) + 1];
  const outro = done && L.outro ? `<div class="g-card" style="margin-top:12px;text-align:left">${L.outro()}</div>` : '';
  overlay(`<div class="g-wrap" style="max-width:calc(720px * var(--ui))">
    <div class="g-head"><h2>${done ? '教學完成' : '教學中止'}</h2><span class="crumb">教學 ${tutLessonNo(L)}　·　${L.name}</span></div>
    <div class="g-card" style="text-align:center">
      <p class="result ${done ? 'win' : 'lose'}">${done ? '完成' : R && R.kind === 'lose' && !R.retreat ? '敗北' : '中止'}</p>
      <div class="g-dim">${done ? `學會了：${L.learn.join('、')}` : R && R.kind === 'lose' && !R.retreat ? `${R.why}。調整戰術再試一次——暫停、想清楚再下令。` : '可以隨時回來從頭開始。'}</div>
      ${merit ? `<div style="margin-top:8px"><b class="g-emp">+${merit} 功勳</b>　<span class="g-dim">（第一次完成的獎勵，目前 ${fmtN(ROSTER.merit)}）</span></div>` : ''}
    </div>${outro}
    <div class="g-row" style="margin-top:14px"><button class="g-btn" id="tr-list">← 訓練作戰</button><button class="g-btn" id="tr-man">戰術手冊</button><span class="g-sp"></span>
      <button class="g-btn" id="tr-again">${done ? '再練一次' : '重新開始'}</button>${done && next ? `<button class="g-btn pri" id="tr-next">下一課：${next.name} →</button>` : ''}${done && !next ? '<button class="g-btn pri" id="tr-real">前往實戰作戰 →</button>' : ''}</div></div>`);
  gEl('tr-list').onclick = () => showTraining(L);
  gEl('tr-man').onclick = () => showManual(null, () => showTraining(L));
  gEl('tr-again').onclick = () => tutStart(L);
  if (gEl('tr-next')) gEl('tr-next').onclick = () => tutStart(next);
  if (gEl('tr-real')) gEl('tr-real').onclick = () => showBriefing(SCENARIOS[0]);
}

// ═════ 訓練作戰畫面：教學課程＋戰術手冊＋實戰作戰 ═════
// cur：選中的課程（物件）；實戰作戰的選擇在 showBriefing
function trainList(cur) {
  const save = tutLoad(), nDone = TUT_LESSONS.filter((L) => save.done[L.id]).length;
  let grp = '', s = `<div class="tr-sec">教學課程<span>${nDone}／${TUT_LESSONS.length}</span></div>`;
  for (const L of TUT_LESSONS) {
    if (L.grp !== grp) { grp = L.grp; s += `<div class="tr-grp">${grp}</div>`; }
    s += `<button class="sc-item tr-item ${L === cur ? 'on' : ''}" data-tut="${L.id}"><b><i class="${save.done[L.id] ? 'ok' : ''}">${save.done[L.id] ? '✓' : tutLessonNo(L)}</i>${L.name}</b><span>約 ${L.mins} 分鐘・${OP_LEVELS[L.op || 0].name}難度</span></button>`;
  }
  s += `<button class="sc-item tr-man" data-man="1"><b>📖 戰術手冊</b><span>艦種、陣型、武器、技能、配隊與戰術的完整說明</span></button>`;
  s += `<div class="tr-sec">實戰作戰</div>`;
  s += SCENARIOS.map((x) => `<button class="sc-item ${x === GAME.sc && !cur ? 'on' : ''}" data-id="${x.id}"><b>${x.name}</b><span>${x.size}　${Math.round(x.timeLimit / 60)} 分鐘　難度 <span class="stars">${stars(x.level)}</span></span></button>`).join('');
  return `<div class="sc-list">${s}</div>`;
}
function bindTrainList() {
  document.querySelectorAll('.sc-list [data-tut]').forEach((b) => (b.onclick = () => showTraining(TUT_BY_ID[b.dataset.tut])));
  document.querySelectorAll('.sc-list [data-man]').forEach((b) => (b.onclick = () => showManual(null, () => showTraining())));
  document.querySelectorAll('.sc-list [data-id]').forEach((b) => (b.onclick = () => showBriefing(SCENARIOS.find((s) => s.id === b.dataset.id))));
}
// 訓練作戰的入口：還沒完成全部教學＝停在下一課；全部完成＝停在上次的實戰作戰
function showTraining(L) {
  const save = tutLoad();
  if (!L) L = TUT_LESSONS.find((o) => !save.done[o.id]);
  if (!L) { showBriefing(GAME.sc && SCENARIOS.includes(GAME.sc) ? GAME.sc : SCENARIOS[0]); return; }
  setPhase('briefing');
  const done = save.done[L.id];
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>訓練作戰</h2><span class="crumb">教學課程　·　${L.grp}</span><span class="g-sp"></span><button class="g-btn" id="b-back">← 單人戰鬥</button></div>
    <div class="brief">${trainList(L)}
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="g-card"><h3>教學 ${tutLessonNo(L)}　${L.name}${done ? '　<span class="g-emp">✓ 已完成</span>' : ''}</h3><div>${L.sum}</div>
          <dl class="kv"><dt>你會學到</dt><dd>${L.learn.join('<br>')}</dd>
          <dt>操作難度</dt><dd>${OP_LEVELS[L.op || 0].name}<span class="conf">${OP_LEVELS[L.op || 0].desc}</span></dd>
          <dt>流程</dt><dd>${L.flow === 'loadout' ? '編成 → 部署 → 開戰（正式流程，教學面板一路說明）' : `直接進入戰場，共 ${L.steps.length} 個步驟`}${L.victory ? '；要打贏這一戰' : ''}</dd>
          <dt>獎勵</dt><dd>${done ? '已領取' : `第一次完成：${TUT_MERIT} 功勳`}（教學不給指揮官經驗）</dd></dl></div>
        <div class="g-card"><h3>怎麼進行</h3><div class="g-dim" style="font-size:calc(13px * var(--ui));line-height:1.7">開始後右側會出現<b>教學面板</b>：照著目標操作，完成就自動前進；說明步驟按「下一步」。不想做的步驟可以「跳過」，面板可以縮小。戰鬥中隨時可以按 <kbd>${keyLabel(keyOf('pause'))}</kbd> 暫停、按 <kbd>${keyLabel(keyOf('help'))}</kbd> 看操作說明。</div></div>
        <div class="g-row"><button class="g-btn" id="b-man">戰術手冊</button><span class="g-sp"></span><button class="g-btn pri" id="b-go">開始教學 →</button></div>
      </div></div></div>`);
  bindTrainList();
  gEl('b-back').onclick = showSingle;
  gEl('b-man').onclick = () => showManual(null, () => showTraining(L));
  gEl('b-go').onclick = () => tutStart(L);
}

// ═════ 戰術手冊 ═════
const MAN_CH = [
  { id: 'ops', name: '操作總覽' }, { id: 'flow', name: '作戰流程與勝負' }, { id: 'ships', name: '艦種' }, { id: 'weapons', name: '武器、命中與傷害' },
  { id: 'forms', name: '陣型' }, { id: 'aspect', name: '側背與包抄' }, { id: 'air', name: '艦載機、飛彈與補給' }, { id: 'skills', name: '指揮官、技能與天賦' },
  { id: 'terrain', name: '地形' }, { id: 'ai', name: '敵方打法與反制' }, { id: 'build', name: '配隊指南' }, { id: 'adv', name: '進階與擬真規則' }, { id: 'tips', name: '指揮官守則' },
];
function manBody(id) {
  const P = (s) => `<p>${s}</p>`;
  switch (id) {
    case 'ops': {
      const grps = [...new Set(KEY_ACTIONS.map((a) => a[2]))];
      return P('以下按鍵是目前的設定（「⚙ 設定 → 按鍵綁定」可以改）。滑鼠：<b>左鍵</b>選取（拖曳框選、連點兩下全選、按住不動＝指令輪盤）、<b>右鍵</b>移動（按住拖曳＝朝向、同時轉滾輪＝高度）、<b>中鍵</b>拖曳＝平移（3D：旋轉）、<b>滾輪</b>縮放。') +
        P(`按住 ${tutKQ()} 再下令＝排進<b>戰術隊列</b>；不按直接下令＝清掉隊列。<kbd>Esc</kbd> 取消選取／取消選目標；<kbd>Ctrl</kbd>＋<kbd>A</kbd> 全選。`) +
        `<div class="man-keys">${grps.map((g) => `<div><h4>${g}</h4><table class="tut-tbl">${KEY_ACTIONS.filter((a) => a[2] === g).map(([k, n]) => `<tr><td class="tl">${n}</td><td>${tutK(k)}</td></tr>`).join('')}</table></div>`).join('')}</div>` +
        P('觸控：點＝選取、連點兩下＝整支艦隊、長按後放開＝移動（在敵軍上＝集中砲火）、長按拖曳＝目的地與朝向；「畫線」「隊列」「攻擊」按鈕在畫面上。');
    }
    case 'flow':
      return P('<b>作戰簡報</b>：讀狀況、敵方配置、地形。情報有<b>準確度</b>：準確度低時兵力、陣型可能有誤，打法、編成、增援可能「不明」。天賦「偵察」能提高準確度。') +
        P('<b>編成</b>：用預算決定每支艦隊的艦種與數量（1 個圖示＝' + opts.rep + ' 艘）、指派指揮官（每位只能帶一支）、起始陣型、排列；可以加<b>補給艦隊</b>（不佔艦隊數）。') +
        P(`<b>部署</b>：在橘色部署區放置艦隊（右鍵＝放置、拖曳＝朝向）。雙方起始距離約 1300，比偵測與掃描範圍遠。`) +
        P(`<b>勝負</b>：敵軍損失超過 <b>${Math.round((1 - ROUT_AT) * 100)}%</b>＝潰走（勝利），我軍損失超過 ${Math.round((1 - ROUT_AT) * 100)}%＝敗北；時間到時依雙方損失比例判定（差距 8% 以內平手）。開戰 ${RETREAT_MIN_T} 秒內撤退不給獎勵，之後撤退獎勵減半。`) +
        P('<b>獎勵</b>：指揮官經驗（勝 60／平 35／敗 20，加上擊沉量、艦隊存活過半 +10）與功勳（到星際酒館招募指揮官、購買增援）。每場戰鬥都存成<b>回放</b>，可以從主選單「戰鬥回放」重看、檢討。');
    case 'ships':
      return tutShipTable() + `<table class="tut-tbl" style="margin-top:10px"><tr><th>艦種</th><th class="tl">說明</th><th>防空係數</th><th>大小</th><th>維修機</th></tr>${SHIP_TYPES.map((s, t) => `<tr><td><b>${s.name}</b></td><td class="tl">${s.note}</td><td>${s.aa}</td><td>${HIT_RULE.size[t]}</td><td>${s.repair ? s.repair.n : '—'}</td></tr>`).join('')}</table>` +
        P('<b>大小</b>越小越難被打中（護衛艦 0.75、航母 1.15）；主砲轉得慢，打小船的命中率再打折。<b>維修機</b>會自動修理受損的友艦。');
    case 'weapons':
      return tutGunTable() +
        P(`<b>三種光束砲</b>：主砲只打船頭前方（約 ±30°）、射程最遠、單發最重；副砲射角大（前方＋兩側）；防空砲全方向，優先打飛彈、其次艦載機，射程內都沒有才打船。每種砲各自冷卻、各自選目標。`) +
        P(`<b>命中率</b>＝基本命中率 × 距離 × 目標大小 × 目標速度 × 環境，限制在 ${Math.round(HIT_RULE.min * 100)}%～${Math.round(HIT_RULE.max * 100)}%。全威力距離內 100%，最大射程剩 ${Math.round(HIT_RULE.farMul * 100)}%；目標越快越難打中（最多 −${Math.round(HIT_RULE.speedMax * 100)}%）；星雲 ×${HIT_RULE.nebula}；被干擾 ×${HIT_RULE.jammed}。`) +
        P(`<b>傷害</b>：距離越遠越低（最大射程剩 ${Math.round(BEAM_FALLOFF_MIN * 100)}%）。光束要先打光<b>護盾</b>才傷到船體；護盾在 ${SHIELD_RULE.delay} 秒沒被打後以每秒 ${Math.round(SHIELD_RULE.rate * 100)}% 回充；被完全打光的護盾要 ${SHIELD_RULE.broken} 秒後才重新啟動——受損的艦隊退到後方能恢復護盾，前排輪替很重要。${typeof DEFLECT_RULE !== 'undefined' ? `光束打在護盾上有 ${Math.round(DEFLECT_RULE.none * 100)}% 完全偏折、${Math.round(DEFLECT_RULE.half * 100)}% 減半（天賦「能量調度」提高）。` : ''}`) +
        P(`<b>飛彈</b>：射程比光束遠、不衰減、有導引（對小船、快船也準），但會被防空攔截。護盾還在時：護盾吃 ×${MISSILE_RULE.shield}、船體同時受 ×${MISSILE_RULE.blast}；護盾打光後直擊船體 ×${MISSILE_RULE.direct}。所以<b>先用光束剝護盾、再用飛彈收割</b>。`) +
        P('<b>射線</b>：光束沿射線判定，擋在前面的敵艦先挨打、打偏的可能打中後方的敵艦；巨大小行星會擋住光束與飛彈。') +
        P(`<b>指定攻擊</b>（${tutK('attack')}＋點敵軍）不加傷害、沒有次數限制；<b>集中火力</b>（技能）全軍 +20%。<b>全艦齊射</b>（${tutK('volley')}）、<b>飛彈齊射</b>（${tutK('missile')}）讓冷卻好的武器一起發射，適合爆發。`);
    case 'forms':
      return tutFormTable() + P(`<b>變陣</b>約需 ${MORPH_DUR} 秒（天賦「陣型演練」縮短），變陣中陣形散亂。<b>防空</b>欄是對空命中倍率（基本 ${AIR_RULE.formBase}＋陣型）。`) +
        P('<b>陣形混亂</b>：被紡錘陣、圓錐陣的前端衝進陣中，會混亂幾秒：開火速度 ×' + DISORDER.fire + '、受到傷害 ×' + DISORDER.taken + '。') +
        P(`<b>整齊排列</b>（${tutK('orderly')}）：船排成規則格子；編成時可以選 1 層或 3 層。<b>選陣型的原則</b>：行軍用縱陣、對射用橫陣、怕包抄或空襲用圓陣、突破用紡錘陣、繞側用圓錐陣、擬真難度下正面火力用空心錐陣。`);
    case 'aspect':
      return P(`船體受到的傷害依被打的方向放大：<b>正面 ×1、側面 ×${opts.flankSide}、背後 ×${opts.flankRear}</b>（護盾沒有方向）。左上角的戰況數據會顯示雙方「被擊沉方向」。`) +
        P(`<b>圓陣</b>沒有側背弱點；<b>紡錘陣</b>正面受傷 ×${FORMATIONS.spindle.frontTaken}、<b>圓錐陣</b>正面 ×${FORMATIONS.wedge.frontTaken}、打側背時再 ×${FORMATIONS.wedge.flankBonus}。`) +
        P('<b>鐵鎚與鐵砧</b>：一支艦隊在正面牽制（鐵砧，橫陣、凹形陣，帶戰列艦），另一支快速艦隊（驅逐、護衛，縱陣或圓錐陣）大繞一圈從側面或背後切入（鐵鎚）。繞路時不要從敵人正面經過；用隊列排兩個點（先到側前方集結點，再切入）。') +
        P(`<b>被包抄時</b>：立刻轉向（${tutK('turn')} 或右鍵拖曳）讓船頭面向威脅，或換圓陣、開鐵壁／機動迴避撐住，再用預備隊反包抄。`);
    case 'air':
      return `<table class="tut-tbl"><tr><th>艦載機</th><th>耐久</th><th>續航</th><th class="tl">任務</th></tr>${CRAFT.map((c) => `<tr><td><b>${c.name}</b></td><td>${c.hp}</td><td>${c.fuel} 秒</td><td class="tl">${c.note}</td></tr>`).join('')}</table>` +
        P(`<b>航母</b>每艘機庫 ${SHIP_TYPES[0].fighters.n} 架，在編成畫面設定四種機的比例（預設 ${HANGAR_DEFAULT.join('／')}）。艦載機自動出擊、返航補給；被打下的機庫每 ${SHIP_TYPES[0].fighters.build} 秒補一架。天賦「機庫整備」加快補充、提高傷害。`) +
        P(`<b>防空</b>：防空砲優先打飛彈、其次艦載機；副砲在全威力距離內也會打。命中率受艦種防空係數（護衛艦 ${SHIP_TYPES[4].aa} 最高）、陣型（圓陣最好）與天賦「防空網」影響。同時到達的飛彈越多，越容易突破防空。`) +
        P(`<b>前排輪替</b>：分艦隊裡受損的船會自動跟後方同艦種、狀態好的船（護盾 ≥ ${Math.round(ROTATE_RULE.fresh.sh * 100)}%、船體 ≥ ${Math.round(ROTATE_RULE.fresh.hp * 100)}%）交換位置，換位 ${ROTATE_RULE.dur} 秒、期間主砲副砲停火。一般在護盾打光時換；指揮官特性會改變時機——攻擊型船體剩 ${Math.round(ROTATE_RULE.hull * 100)}% 才換、防禦型護盾剩 ${Math.round(ROTATE_RULE.shEarly * 100)}% 就換（護盾回充 +${Math.round(ROTATE_RULE.shRegen * 100)}%）、機動型換位快 ${Math.round(ROTATE_RULE.fast * 100)}%；天賦「輪替演練」再加快。陣型越厚，後排越有船可以替換；變陣、轉向時會中斷。`) +
        P(`<b>戰地維修</b>：船體低於 ${Math.round(FIELD_REPAIR.below * 100)}%、${FIELD_REPAIR.quiet} 秒沒被打中，就在 ${FIELD_REPAIR.dur} 秒內逐步修理。在補給艦 ${SUPPLY_RULE.range} 範圍內：第 1 次回復最大耐久的 ${Math.round(FIELD_REPAIR.first * 100)}%、之後每次減半，每艘船基本可修 ${FIELD_REPAIR.n} 次；不在範圍內：只有還沒修過的船能修 1 次（${Math.round(FIELD_REPAIR.alone * 100)}%）。天賦「損害管制」每階次數 +1、單次 +${Math.round(FIELD_REPAIR.step * 100)}%。所以<b>輪替到後排的船能在補給艦旁修整</b>。`) +
        P(`<b>補給</b>：巡洋艦 ${SHIP_TYPES[2].missile.n} 發、驅逐艦 ${SHIP_TYPES[3].missile.n} 發，打完要補。補給艦隊（補給艦＋護衛艦）${SUPPLY_RULE.range} 範圍內、飛彈沒滿的友艦每 ${SUPPLY_RULE.cd} 秒補 1 發，每艘補給艦帶 ${SHIP_TYPES[5].supply.stock} 發，被擊沉就跟著沒了。補給艦隊可以設定<b>跟隨</b>某支艦隊（待在後方 ${SUPPLY_RULE.follow}）；直接對它下移動命令會取消跟隨。`);
    case 'skills':
      return tutSkillTable() +
        P(`<b>指揮官</b>：每位有固有特性（攻擊／防禦／機動 +8%）與固有技能。每 ${XP_PER_LEVEL} 經驗升一級、得 1 點天賦（Lv 1 就有 1 點），可以隨時退回重新分配。指揮官不夠可以到<b>星際酒館</b>用功勳招募（兩個陣營）。`) +
        TALENT_BRANCHES.map(([br, name]) => `<h4 class="man-h4">${name}</h4><table class="tut-tbl">${TALENTS.filter((t) => t.br === br).map((t) => `<tr><td class="tl"><b>${t.name}</b>${t.req ? `<small>（Lv ${t.req}）</small>` : ''}</td><td>${t.kind === 'skill' ? `${t.cost} 點` : `${t.max} 階`}</td><td class="tl">${t.kind === 'skill' ? '學會技能：' + SKILLS[t.skill].desc : t.desc(1) + (t.max > 1 ? '（每階）' : '')}</td></tr>`).join('')}</table>`).join('') +
        P('<b>時機</b>：突進用在拉近距離（倒退、側移不加速）；集中火力在全軍都在射程內時用；鐵壁、機動迴避在接觸或被包抄時用；極速射擊和集中火力疊在一起爆發；干擾在接敵前用，讓敵人變陣延遲、命中下降。');
    case 'terrain':
      return `<table class="tut-tbl">${Object.values(TERRAIN_TYPES).map((d) => `<tr><td class="tl"><b>${d.name}</b></td><td class="tl">${d.desc}</td></tr>`).join('')}</table>` +
        P('<b>星雲</b>：數量多、射程短的一方躲在裡面等敵人接近；遠程艦隊別在星雲裡對射。<b>小行星帶</b>：行軍時繞開，也可以擋住敵人的包抄路線。<b>巨大小行星</b>：躲在後面避開戰列艦主砲、掩護接近；擬真難度下也會擋住視線。') +
        P('地形是立體的球：進階以上的難度可以從上方或下方繞過。');
    case 'ai':
      return tutTacticTable() +
        P('<b>AI 難度</b>（關卡的難度星數）：難度 2 起會用技能、被繞側背會轉向、飛彈打完回去補給；難度 3 起會在接敵前干擾、看到你用紡錘陣就換凹形陣包夾、遠距離消耗被拉近時改成推進；難度 4 起被包抄會換圓陣、優先打你的航母與快垮的分艦隊；難度 5 會協同集火，並依時間與戰損決定拖時間還是全力進攻。') +
        P('想看實際的打法，可以到「單人戰鬥 → AI 對戰觀摩」看 AI 互打，左側有即時解說。');
    case 'build':
      return P('<b>配隊的思考順序</b>：① 看敵方編成與打法 → ② 決定誰當鐵砧、誰當鐵鎚 → ③ 補防空與補給 → ④ 選指揮官（技能要配合任務）。') +
        `<table class="tut-tbl"><tr><th class="tl">敵人</th><th class="tl">建議</th></tr>
          <tr><td class="tl">航母多、飛彈多</td><td class="tl">多帶護衛艦（防空最好）、圓陣、攔截機；用快船逼近打航母</td></tr>
          <tr><td class="tl">戰列艦多（遠距離）</td><td class="tl">驅逐艦、護衛艦小而快（主砲打不準小船）；利用岩石、星雲接近；突進</td></tr>
          <tr><td class="tl">小船多（驅逐、護衛）</td><td class="tl">巡洋艦副砲與飛彈；凹形陣包住；別只帶戰列艦</td></tr>
          <tr><td class="tl">紡錘陣突破</td><td class="tl">凹形陣＋鐵壁；預備一支艦隊打它的側面</td></tr>
          <tr><td class="tl">側翼包抄</td><td class="tl">兩支艦隊互相掩護側翼、或帶一支快速預備隊</td></tr></table>` +
        P(`<b>範例</b>（以預設比例為基礎，數字是圖示）：<br>• <b>均衡主力</b>：航母 4%・戰列 14%・巡洋 27%・驅逐 30%・護衛 25%（遊戲的預設編成）。<br>• <b>鐵砧艦隊</b>：戰列與巡洋為主、護衛艦補防空，橫陣或凹形陣，指揮官帶鐵壁、集中火力。<br>• <b>鐵鎚艦隊</b>：驅逐艦為主、少量巡洋，縱陣行軍、圓錐陣切入，指揮官帶突進。<br>• <b>補給艦隊</b>：補給艦＋護衛艦，跟在飛彈多的艦隊後面。`) +
        P('預算有限時，<b>集中</b>比平均好：兩支有明確分工的艦隊，勝過三支什麼都有一點的艦隊。打完看戰後報告的「兵力損失」與「被擊沉方向」，調整下一次的配隊。');
    case 'adv':
      return `<table class="tut-tbl"><tr><th>難度</th><th class="tl">規則</th></tr>${OP_LEVELS.map((o) => `<tr><td><b>${o.name}</b></td><td class="tl">${o.desc}</td></tr>`).join('')}</table>` +
        P(`<b>高度</b>（進階以上）：戰場高度 ±${ALT_RANGE}。右鍵按住＋滾輪調整目的地高度，按住 ${tutK('pitch_mod')} 轉滾輪＝仰角；戰術面板的側視圖可以直接拖。錯開高度能讓後排不被前排擋住射線。`) +
        P(`<b>戰爭迷霧</b>（擬真）：只看得到偵測範圍內的敵人（${SHIP_TYPES.map((s, t) => `${s.name} ${SENSOR_R[t]}`).join('、')}）；敵人開火會暴露 ${FOW_RULE.expose} 秒。自動脈衝掃描半徑 ${FOW_RULE.scanR}、冷卻 ${FOW_RULE.scanCd} 秒；航母可以派<b>偵察機</b>（${tutK('scan')}＋點地圖）做區域掃描（半徑 ${FOW_RULE.recon.r}、冷卻 ${FOW_RULE.recon.cd} 秒）。看不到的敵人不會被自動攻擊，用<b>區域攻擊</b>（${tutK('area')}＋點地圖）盲射。被干擾時各艦隊不能共享情報。`) +
        P('<b>友軍誤傷</b>（擬真）：光束穿過別的友軍部隊可能誤傷，同部隊被擋住多半停火。用空心錐陣、錯開高度、天賦「精準射擊／火線管制／完美布陣」減少。') +
        P(`<b>艦橋</b>（擬真，${tutK('bridge')}）：從旗艦艦橋看戰場，只能低頭在戰術台下令。設定裡可以讓低頭時自動暫停。`);
    case 'tips':
      return `<ol class="man-ol">
        <li><b>先暫停，再下令。</b>暫停中能下所有命令；局面一亂就暫停。</li>
        <li><b>朝向比位置重要。</b>主砲只打正前方，側面挨打傷害 ×${opts.flankSide}、背後 ×${opts.flankRear}。</li>
        <li><b>集中火力。</b>護盾會回充，分散攻擊等於沒打；用指定攻擊（${tutK('attack')}）或集中火力打同一個目標。</li>
        <li><b>分工明確。</b>一支牽制、一支包抄；補給艦隊跟在後面。</li>
        <li><b>保護脆弱的船。</b>航母與補給艦放在後方，前面用護衛艦擋飛彈與艦載機。</li>
        <li><b>別在敵人面前變陣。</b>變陣要 ${MORPH_DUR} 秒，變陣中很脆弱；用隊列在接敵前換好。</li>
        <li><b>技能留給關鍵時刻。</b>每個技能次數有限；鐵壁擋衝擊、突進追擊或脫離。</li>
        <li><b>相信情報，但留預備。</b>情報可能錯、可能有伏兵或增援。</li>
        <li><b>打完看報告與回放。</b>看自己是從哪個方向被擊沉的。</li></ol>`;
  }
  return '';
}
function showManual(ch, back) {
  if (back) GAME.manBack = back;
  const cur = MAN_CH.find((c) => c.id === ch) || MAN_CH[0];
  overlay(`<div class="g-wrap man-wrap">
    <div class="g-head"><h2>戰術手冊</h2><span class="crumb">${cur.name}</span><span class="g-sp"></span><button class="g-btn" id="man-back">返回</button></div>
    <div class="brief"><div class="sc-list">${MAN_CH.map((c, k) => `<button class="sc-item ${c === cur ? 'on' : ''}" data-ch="${c.id}"><b><i>${k + 1}</i>${c.name}</b></button>`).join('')}</div>
      <div class="g-card man-body"><h3>${cur.name}</h3>${manBody(cur.id)}
        <div class="g-row" style="margin-top:14px">${MAN_CH.indexOf(cur) > 0 ? `<button class="g-btn sm" data-ch="${MAN_CH[MAN_CH.indexOf(cur) - 1].id}">← ${MAN_CH[MAN_CH.indexOf(cur) - 1].name}</button>` : ''}<span class="g-sp"></span>${MAN_CH.indexOf(cur) < MAN_CH.length - 1 ? `<button class="g-btn sm" data-ch="${MAN_CH[MAN_CH.indexOf(cur) + 1].id}">${MAN_CH[MAN_CH.indexOf(cur) + 1].name} →</button>` : ''}</div></div></div></div>`);
  document.querySelectorAll('#game [data-ch]').forEach((b) => (b.onclick = () => showManual(b.dataset.ch)));
  gEl('man-back').onclick = () => { const f = GAME.manBack || showTraining; GAME.manBack = null; f(); };
}
