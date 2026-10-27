// ═══════════════════════ 模擬室 ═══════════════════════
// 自由布置兩軍艦隊與地形，開戰後走正式的戰鬥流程（同一套模擬、AI、技能、戰術面板、回放），只是不計戰績、不給經驗。
// 編輯：右側面板改數值；地圖上左鍵點選、拖曳＝移動，右鍵點＝放到那裡（艦隊：按住拖曳＝朝向），中鍵拖曳＝移動鏡頭
// 戰鬥中可以切換指揮的陣營：被接管的一方 AI 暫停（切換也是一道命令，回放一致）
// 戰鬥中也能隨時「編輯配置」：以目前戰況（各艦隊的位置、朝向、剩餘艦數）當新的起點接著打；
// 還沒改任何東西之前，戰局本身原封不動（繼續／放棄修改＝回到原本的戰局）。「重置戰場」＝回到開戰時的布局。
//   base：開戰時的布局；mid：戰鬥中編輯；live：暫停中的戰局還在（尚未重建）；dirty：有修改；t0：先前各段的經過時間
const SIM = { m: null, sel: null, drag: null, tab: 'unit', base: null, mid: false, live: false, dirty: false, t0: 0, snapT: 0, snapInit: null, snapAlive: null };
const SIM_LAST = 'fleet.simlast', SIM_KEY = 'fleet.simlayouts';
const SIM_INF = 359999;   // 模擬室沒有時限
const SIM_CN = '一二三四五六七八九十';
const SIM_TERR_MAX_SOLID = 8;   // 實體障礙最多 8 個（著色器與碰撞的上限）
const simSideName = (m, side) => FACTION_NAME[side ? 1 - m.fac : m.fac];
// 戰術面板、艦橋共用：一般作戰＝剩餘時間；模擬室（無時限）＝整場的經過時間
function timeLeftText(t) { const tl = battleSetup.timeLimit; return battleSetup.untimed ? _fmtT(t) : tl >= SIM_INF ? `經過 ${_fmtT(t + SIM.t0)}` : _fmtT(Math.max(0, tl - t)); }

// ───── 布局資料 ─────
function simCmdrFrom(c, mode = 'lv') {
  return { base: c.id, name: c.name, title: c.title || '', trait: c.trait, level: mode === 'tal' ? cmdrLevel(c.id) : 3, mode, tal: mode === 'tal' ? { ...cmdrTal(c.id) } : {}, skills: c.skills.slice() };
}
function simNewFleet(m, side) {
  const fac = side ? 1 - m.fac : m.fac, pool = COMMANDERS.filter((c) => (c.faction || 0) === fac), n = m.fleets.filter((f) => f.side === side).length;
  const c = pool[n % Math.max(1, pool.length)] || COMMANDERS[0];
  return { side, name: `${side ? '敵方' : '我方'}第${SIM_CN[n] || n + 1}艦隊`, cmdr: simCmdrFrom(c), comp: defaultComp(2000), hangar: HANGAR_DEFAULT.slice(),
    formation: 'line', orderly: false, layers: 1, x: -300 + (n % 4) * 200, z: side ? -330 : 330, y: 0, h: side ? 0 : Math.PI,
    ai: side ? { tactic: 'push', level: 2 } : null, reserve: false, at: 60 };
}
function simDefault() {
  const m = { name: '新布局', fac: 0, victory: true, ctl: 0, seed: 1, fleets: [], terrain: [] };
  m.fleets.push(simNewFleet(m, 0), simNewFleet(m, 1));
  return m;
}
// 從訓練作戰匯入：我方用預設編成與自己的指揮官（天賦制），敵方照關卡設定（含增援，固定出現）
function simFromScenario(sc) {
  const m = { name: sc.name, fac: 0, victory: true, ctl: 0, seed: sc.seed, fleets: [], terrain: JSON.parse(JSON.stringify(sc.terrain || [])), ...(sc.ground ? { ground: { ...sc.ground } } : {}) };
  defaultLoadout(sc, 0).fleets.forEach((f, k) => {
    const c = COMMANDERS.find((o) => o.id === f.cmdr) || COMMANDERS[0];
    m.fleets.push({ side: 0, name: `我方第${SIM_CN[k]}艦隊`, cmdr: simCmdrFrom(c, 'tal'), comp: f.comp.slice(), hangar: HANGAR_DEFAULT.slice(), formation: f.formation, orderly: false, layers: 1,
      x: f.x, z: f.z, y: 0, h: f.h, ai: null, reserve: false, at: 60 });
  });
  for (const ef of sc.enemy) m.fleets.push({ side: 1, name: ef.name, cmdr: { base: null, name: ef.commander.name, title: ef.commander.title || '', trait: ef.commander.trait, level: ef.commander.level, mode: 'lv', tal: {}, skills: (ef.commander.skills || []).slice() },
    comp: ef.comp.slice(), hangar: HANGAR_DEFAULT.slice(), formation: ef.formation, orderly: false, layers: 1, x: ef.x, z: ef.z, y: ef.y || 0, h: ef.h, ai: { tactic: ef.tactic, level: sc.level }, reserve: false, at: 60 });
  for (const ev of sc.events) if (ev.type === 'reinforce') {
    const sx = ev.edge === 'left' ? -1 : 1;
    const rc = reinforceCmdr(sc);
    m.fleets.push({ side: 1, name: ev.name, cmdr: { base: null, name: rc.name, title: '', trait: rc.trait, level: rc.level, mode: 'lv', tal: {}, skills: rc.skills },
      comp: ev.comp.slice(), hangar: HANGAR_DEFAULT.slice(), formation: ev.formation, orderly: false, layers: 1, x: sx * 800, z: -40, y: 0, h: sx < 0 ? Math.PI / 2 : -Math.PI / 2,
      ai: { tactic: 'push', level: sc.level }, reserve: true, at: Math.round((ev.at[0] + ev.at[1]) / 2) });
  }
  return m;
}
// 布局 → 戰鬥設定（與正式作戰相同的格式）；edit＝編輯中（增援也先顯示出來，方便擺放）
function simSetup(m, edit) {
  const S = {
    bg: false, scenario: 'sim', level: 1, factions: m.fac ? [1, 0] : [0, 1], timeLimit: m.timeLimit || SIM_INF, noVictory: !m.victory,
    terrain: m.ground ? [] : m.terrain.map((t) => ({ ...t })), ...(m.ground && GROUND_SCENES[m.ground.scene] ? { ground: { ...m.ground } } : {}),   // 近地作戰：不用太空地形
    fleets: m.fleets.map((f) => {
      const c = f.cmdr, tal = c.mode === 'tal' ? { ...c.tal } : null;
      return { side: f.side, name: f.name, ax: f.x, az: f.z, ay: f.y || 0, h: f.h, formation: f.formation, orderly: !!f.orderly, layers: f.layers || 1, comp: f.comp.slice(), hangar: f.hangar.slice(),
        commander: f.supply || f.noCmdr ? null : { ...(c.base ? { id: c.base } : {}), name: c.name || '指揮官', title: c.title || '', trait: c.trait, level: Math.max(1, c.level | 0), ...(tal ? { tal } : {}), skills: c.skills.filter((s) => SKILLS[s]) },
        ai: f.ai ? { ...f.ai } : null, reserve: !edit && !!f.reserve, activateAt: !edit && f.reserve ? Math.max(1, +f.at || 0) : null,
        supply: !!f.supply, follow: f.supply ? (f.follow != null ? f.follow : -1) : undefined, keep: !edit && f.keep ? f.keep : null, cap: !!f.cap, capRole: f.capRole || null };
    }),
    jam: !edit && m.jam ? m.jam : null,
  };
  // 呼叫增援：模擬室免費（不扣酒館買的次數），每位有這個技能的指揮官準備一支（這支艦隊兵力的 25%），藏在場外
  if (!edit) m.fleets.forEach((f, i) => {
    const cm = S.fleets[i].commander;
    if (!cm || !cm.skills.includes('reinforce')) return;
    S.fleets.push({ side: f.side, name: `${f.name}增援`, ax: 0, az: f.side ? MAP_BOUNDS.z0 - 900 : MAP_BOUNDS.z1 + 900, ay: 0, h: f.side ? 0 : Math.PI, formation: f.formation, comp: reinforceComp(f.comp, compCost(f.comp)),
      hangar: f.hangar.slice(), commander: null, ai: null, reserve: true, activateAt: null, reinfOf: i });
  });
  return S;
}
function simSave() { if (SIM.mid) return; /* 戰鬥中的編輯不覆蓋「上次的布局」 */ try { STORE.setItem(SIM_LAST, JSON.stringify(SIM.m)); } catch (e) { /* 只在本次 */ } }
function simLoadLast() { try { const m = JSON.parse(STORE.getItem(SIM_LAST) || 'null'); if (m && m.fleets) return m; } catch (e) { /* 用預設 */ } return simDefault(); }
function simLayouts() { try { return JSON.parse(STORE.getItem(SIM_KEY) || '[]'); } catch (e) { return []; } }
function simSetLayouts(l) { try { STORE.setItem(SIM_KEY, JSON.stringify(l)); } catch (e) { toast('無法存檔'); } }

// ───── 編輯畫面 ─────
function showSim(m) {
  simEndMid();
  GAME.watch = false;
  if (m) SIM.m = m; else if (!SIM.m || SIM.m.watch) SIM.m = simLoadLast();   // 剛看完觀摩：回到自己上次的布局
  if (SIM.m.watch) { SIM.m.watch = false; SIM.m.ctl = 0; }   // 觀摩的布局拿到模擬室：可以編輯、接管
  overlay(null); setPhase('simedit'); GAME.replaying = false; GAME.result = null; GAME.sc = null;
  GAME.playerSide = 0; setCmdSide(0, false);
  if (SIM.sel && !simSelItem()) SIM.sel = null;
  simBuild();
  camAnim = null; view.target.x = 0; view.target.z = 0; view.height = 1700; view.yaw = 0; view.pitch = ELEV; updateCamera();
}
function simSelItem() { const s = SIM.sel; if (!s) return null; return s.kind === 'fleet' ? SIM.m.fleets[s.i] : SIM.m.terrain[s.i]; }
function simBuild() {
  applyOp();   // 預覽也照操作難度（一般：都在基準面）
  newBattle(SIM.m.seed >>> 0, simSetup(SIM.m, true));
  paused = true; updateTimeUI();
  drawField(false);
  simMarkSel();
  simRender();
}
// 選取：艦隊用一般的選取外框；地形畫白圈
function simMarkSel() {
  clearSelection();
  const s = SIM.sel; if (!s) return;
  if (s.kind === 'fleet') { const f = fleets.find((o) => o.id === s.i); if (f) setSelection(f.sqs.filter((q) => q.alive > 0)); }   // 沒有艦艇的艦隊不會建出來，所以用 id 找
  else { const t = SIM.m.terrain[s.i]; if (t) { const ring = lineObj(0xffffff, 0.9), pts = []; for (let k = 0; k <= 64; k++) pts.push([t.x + Math.cos(k / 64 * TAU) * (t.r + 6), t.z + Math.sin(k / 64 * TAU) * (t.r + 6), t.y || 0]); setPts(ring, pts); fieldGroup.add(ring); } }
}
function simChanged(rebuild = true) {
  if (SIM.mid) { SIM.dirty = true; if (rebuild) SIM.live = false; }   // 重建場景後，暫停中的戰局就不在了
  simSave(); if (rebuild) simBuild(); else simRender();
}
function simSelect(sel) { SIM.sel = sel; drawField(false); simMarkSel(); simRender(); }

const simNum = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const simComp = (f) => sumA(f.comp);
function simRender() {
  const el = gEl('simbar'); if (!el) return;
  const m = SIM.m, it = simSelItem(), solid = m.terrain.filter((t) => TERRAIN_TYPES[t.type] && TERRAIN_TYPES[t.type].solid).length;
  const sideList = (side) => m.fleets.map((f, i) => [f, i]).filter(([f]) => f.side === side).map(([f, i]) =>
    `<button class="sim-it ${SIM.sel && SIM.sel.kind === 'fleet' && SIM.sel.i === i ? 'on' : ''}" data-sf="${i}"><b>${escH(f.name)}</b><small>${ships5(simComp(f))} 艘・${f.supply ? '補給艦隊' : `${escH(f.cmdr.name)} Lv ${f.cmdr.level}`}・${f.ai ? TACTICS[f.ai.tactic].name : '無 AI'}${f.reserve ? `・增援 ${f.at} 秒` : ''}</small></button>`).join('') || '<span class="g-dim">（沒有艦隊）</span>';
  const tot = (side) => ships5(sumA(m.fleets.filter((f) => f.side === side).map(simComp)));
  el.innerHTML = `<div class="sim-head"><b>模擬室</b><input class="g-in" id="sim-name" maxlength="30" value="${escH(m.name)}" title="布局名稱"><span class="g-sp"></span>
      <button class="g-btn sm" id="sim-exit">離開</button><button class="g-btn sm pri" id="sim-go">${SIM.mid ? '▶ 繼續' : '▶ 開戰'}</button></div>
    ${SIM.mid ? `<div class="sim-mid"><div><b>戰鬥暫停中</b>　<span class="g-dim">經過 ${_fmtT(SIM.t0 + SIM.snapT)}</span></div>
      <div class="g-dim">${SIM.dirty ? '已修改：按「繼續」會以目前的配置為新起點接著打（個別艦艇的損傷、技能次數與冷卻、飛行中的飛彈與艦載機會重置；分散的分艦隊會回到艦隊陣型）。' : '目前顯示的是暫停時的戰況，還沒有修改；按「繼續」會原封不動回到戰局。'}</div>
      <div class="sim-btns" style="margin-top:6px">${SIM.dirty && SIM.live ? '<button class="g-btn sm" id="sim-discard" title="回到暫停時的戰局">放棄修改</button>' : ''}<button class="g-btn sm" id="sim-reset" title="布局與狀態恢復成開戰時的樣子">↺ 重置戰場</button></div></div>` : ''}
    <div class="wed-seg sim-tabs" id="sim-tabs"><button data-tab="unit" class="${SIM.tab === 'unit' ? 'on' : ''}">單位與地形</button><button data-tab="field" class="${SIM.tab === 'field' ? 'on' : ''}">戰場設定</button><button data-tab="file" class="${SIM.tab === 'file' ? 'on' : ''}">布局存檔</button></div>
    ${SIM.tab === 'field' ? simFieldHtml(m) : SIM.tab === 'file' ? simFileHtml(m) : `
    <div class="sim-sec"><div class="sim-h"><span class="g-pc">${simSideName(m, 0)}（我方）</span><span class="g-dim">${tot(0)} 艘</span><span class="g-sp"></span><button class="g-btn sm" data-add="0">＋ 艦隊</button></div>${sideList(0)}</div>
    <div class="sim-sec"><div class="sim-h"><span class="g-ec">${simSideName(m, 1)}（敵方）</span><span class="g-dim">${tot(1)} 艘</span><span class="g-sp"></span><button class="g-btn sm" data-add="1">＋ 艦隊</button></div>${sideList(1)}</div>
    <div class="sim-sec"><div class="sim-h"><span>地形</span><span class="g-dim">實體障礙 ${solid}／${SIM_TERR_MAX_SOLID}</span><span class="g-sp"></span>${Object.keys(TERRAIN_TYPES).map((k) => `<button class="g-btn sm" data-addt="${k}" title="${TERRAIN_TYPES[k].desc}">＋ ${TERRAIN_TYPES[k].name}</button>`).join('')}</div>
      ${m.terrain.map((t, i) => `<button class="sim-it ${SIM.sel && SIM.sel.kind === 'terr' && SIM.sel.i === i ? 'on' : ''}" data-st="${i}"><b>${TERRAIN_TYPES[t.type].name}</b><small>(${Math.round(t.x)}, ${Math.round(t.z)})・高度 ${Math.round(t.y || 0)}・半徑 ${Math.round(t.r)}</small></button>`).join('') || '<span class="g-dim">（沒有地形）</span>'}</div>
    ${it ? (SIM.sel.kind === 'fleet' ? simFleetHtml(it) : simTerrHtml(it)) : '<div class="sim-sec g-dim">點清單或地圖上的艦隊／地形來編輯。</div>'}`}
    <div class="sim-help g-dim">地圖：左鍵點＝選取、拖曳＝移動；右鍵點＝把選取的放到那裡（艦隊：按住拖曳＝朝向）；中鍵拖曳＝移動鏡頭、滾輪＝縮放</div>`;
  simBind(el);
}
function simFieldHtml(m) {
  return `<div class="sim-sec">
    <div class="sim-row"><span>我方陣營</span><div class="wed-seg" id="sim-fac"><button data-v="0" class="${m.fac === 0 ? 'on emp' : ''}">帝國軍</button><button data-v="1" class="${m.fac === 1 ? 'on all' : ''}">聯盟軍</button></div></div>
    <div class="sim-row"><span>操作難度</span>${opSeg('sim-op')}</div>
    <div class="g-dim sim-note">${OP_LEVELS[opLevel()].desc}（與單人戰鬥共用同一個設定）</div>
    <div class="sim-row"><span>戰場</span><div class="wed-seg" id="sim-env"><button data-v="" class="${!m.ground ? 'on' : ''}">太空</button>${GROUND_KEYS.map((k) => `<button data-v="${k}" class="${m.ground && m.ground.scene === k ? 'on' : ''}">${GROUND_SCENES[k].name}</button>`).join('')}</div></div>
    ${m.ground ? `<div class="g-dim sim-note">${GROUND_SCENES[m.ground.scene].desc}（近地戰場不使用太空地形）</div>
    <div class="sim-row"><span>地面砲台</span><div class="wed-seg" id="sim-gdef"><button data-v="-1" class="${m.ground.def === -1 ? 'on' : ''}">沒有</button><button data-v="0" class="${m.ground.def === 0 ? 'on' : ''}">${simSideName(m, 0)}</button><button data-v="1" class="${m.ground.def === 1 ? 'on' : ''}">${simSideName(m, 1)}</button></div></div>
    <div class="sim-row"><span>地形種子</span><input class="g-in" type="number" id="sim-gseed" value="${m.ground.seed}" style="width:110px"><button class="g-btn sm" id="sim-gre">換一個</button></div>` : ''}
    <div class="sim-row"><span>戰爭迷霧</span><div class="wed-seg" id="sim-fow"><button data-v="1" class="${m.fow !== false ? 'on' : ''}">開</button><button data-v="0" class="${m.fow === false ? 'on' : ''}">關</button></div></div>
    <div class="g-dim sim-note">開＝只看得到偵測範圍內（或掃描到）的敵軍，自動攻擊也只打看得到的；關＝雙方都看得到全部</div>
    <div class="sim-row"><span>${SIM.mid ? '繼續時指揮' : '開戰時指揮'}</span><div class="wed-seg" id="sim-ctl"><button data-v="0" class="${m.ctl === 0 ? 'on' : ''}">我方</button><button data-v="1" class="${m.ctl === 1 ? 'on' : ''}">敵方</button></div></div>
    <div class="sim-row"><span>勝負判定</span><label><input type="checkbox" id="sim-vic" ${m.victory ? 'checked' : ''}> 一方全滅或潰走（剩 ${Math.round(ROUT_AT * 100)}% 以下）就結束</label></div>
    <div class="sim-row"><span>時限</span><span class="g-dim">模擬室沒有時間限制</span></div>
    <div class="sim-row"><span>隨機種子</span><input class="g-in" type="number" id="sim-seed" value="${m.seed}" style="width:110px"><button class="g-btn sm" id="sim-reseed">換一個</button></div>
    <div class="g-dim" style="font-size:calc(11.5px * var(--ui));margin-top:6px">同一個布局＋同一個種子＋同樣的指令＝同樣的結果；換種子會改變陣型細節與命中的隨機性。<br>規則與正式作戰相同（持續交火、不自動前進、主砲只打前方）。</div></div>`;
}
function simFileHtml(m) {
  const L = simLayouts();
  return `<div class="sim-sec"><div class="sim-h"><span>已存的布局</span><span class="g-sp"></span><button class="g-btn sm pri" id="sim-saveas">儲存目前布局</button></div>
      ${L.length ? L.map((l, i) => `<div class="sim-file"><b>${escH(l.name)}</b><small class="g-dim">${new Date(l.t).toLocaleString('zh-TW', { hour12: false })}・${l.m.fleets.length} 支艦隊・${l.m.terrain.length} 個地形</small><span class="g-sp"></span><button class="g-btn sm" data-ld="${i}">載入</button><button class="g-btn sm" data-dl="${i}">刪除</button></div>`).join('') : '<div class="g-dim">還沒有存過布局。名稱一樣會覆蓋。</div>'}</div>
    <div class="sim-sec"><div class="sim-h"><span>從訓練作戰匯入</span></div><div class="sim-btns">${SCENARIOS.map((sc, i) => `<button class="g-btn sm" data-sc="${i}">${sc.name}</button>`).join('')}</div>
      <div class="g-dim" style="font-size:calc(11.5px * var(--ui));margin-top:4px">敵軍、地形照關卡設定；增援改成固定出現（時間取中間值）。</div></div>
    <div class="sim-sec"><div class="sim-btns"><button class="g-btn sm" id="sim-new">新的空白布局</button></div></div>`;
}
function simFleetHtml(f) {
  const c = f.cmdr, opt = (v, n, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`;
  const cost = compCost(f.comp);
  return `<div class="sim-sec sim-ed"><div class="sim-h"><b>編輯艦隊</b><span class="g-sp"></span><button class="g-btn sm" id="sim-dup">複製</button><button class="g-btn sm" id="sim-del">刪除</button></div>
    <div class="sim-row"><span>名稱</span><input class="g-in" data-fk="name" value="${escH(f.name)}" maxlength="20"></div>
    <div class="sim-row"><span>陣營</span><div class="wed-seg" id="sim-fside"><button data-v="0" class="${f.side === 0 ? 'on' : ''}">我方</button><button data-v="1" class="${f.side === 1 ? 'on' : ''}">敵方</button></div></div>
    <div class="sim-row"><span>補給艦隊</span><label><input type="checkbox" data-fk="supply" ${f.supply ? 'checked' : ''}> 沒有指揮官，範圍內的友艦自動補飛彈</label></div>
    ${f.supply ? `<div class="sim-row"><span>跟隨</span><select class="g-sel" data-fk="follow">${opt(-1, '不跟隨', f.follow != null ? f.follow : -1)}${SIM.m.fleets.map((o, i) => (o !== f && o.side === f.side && !o.supply ? opt(i, o.name, f.follow) : '')).join('')}</select></div>` : `
    <div class="sim-row"><span>控制</span><select class="g-sel" data-fk="ai">${opt('', '無 AI（玩家指揮／不動）', f.ai ? f.ai.tactic : '')}${Object.keys(TACTICS).map((k) => opt(k, 'AI：' + TACTICS[k].name, f.ai ? f.ai.tactic : '')).join('')}</select>
      ${f.ai ? `<select class="g-sel" data-fk="ailv">${WATCH_LV.map((l, i) => opt(i + 1, l.name, f.ai.level)).join('')}</select>` : ''}</div>
    ${f.ai ? `<div class="g-dim sim-note">${TACTICS[f.ai.tactic].desc}${f.ai.level >= 2 ? ' ' + WATCH_LV[Math.min(WATCH_LV.length, f.ai.level) - 1].desc : ''}</div>` : ''}`}
    <div class="sim-row"><span>增援</span><label><input type="checkbox" data-fk="reserve" ${f.reserve ? 'checked' : ''}> 開戰後</label><input class="g-in" type="number" min="1" data-fk="at" value="${f.at}" style="width:70px" ${f.reserve ? '' : 'disabled'}><span class="g-dim">秒才出現</span></div>
    ${f.supply ? '' : '<div class="sim-sub">指揮官</div>'}
    ${f.supply ? '' : `<div class="sim-row"><span>套用</span><select class="g-sel" data-fk="base">${opt('', '（自訂）', c.base || '')}${COMMANDERS.map((o) => opt(o.id, `${o.name}（${FACTION_NAME[o.faction || 0]}・${TRAIT_NAME[o.trait]}）`, c.base || '')).join('')}</select></div>
    <div class="sim-row"><span>名稱</span><input class="g-in" data-ck="name" value="${escH(c.name)}" maxlength="16"></div>
    <div class="sim-row"><span>加成</span><select class="g-sel" data-ck="mode">${opt('lv', '等級制（同 AI 指揮官：特性隨等級）', c.mode)}${opt('tal', '天賦制（同玩家：特性 +8%＋天賦）', c.mode)}</select></div>
    <div class="sim-row"><span>等級／特性</span><input class="g-in" type="number" min="1" max="30" data-ck="level" value="${c.level}" style="width:64px"><select class="g-sel" data-ck="trait">${Object.keys(TRAIT_NAME).map((k) => opt(k, TRAIT_NAME[k], c.trait)).join('')}</select>
      <span class="g-dim">${c.mode === 'tal' ? '特性 +8%' : `特性 +${Math.round(traitBonus(c.trait, c.level) * 100)}%`}</span></div>
    <div class="sim-row"><span>技能</span><div class="sim-chk">${Object.keys(SKILLS).map((k) => `<label title="${SKILLS[k].desc}"><input type="checkbox" data-sk="${k}" ${c.skills.includes(k) ? 'checked' : ''}> ${SKILLS[k].name}</label>`).join('')}</div></div>
    ${c.mode === 'tal' ? `<div class="sim-row"><span>天賦</span><div class="sim-tal">${TALENTS.filter((t) => t.kind !== 'skill' && t.id !== 'recon').map((t) => `<label title="${t.desc(Math.max(1, c.tal[t.id] || 1))}">${t.name}<input class="g-in" type="number" min="0" max="${t.max}" data-tal="${t.id}" value="${c.tal[t.id] || 0}"></label>`).join('')}</div></div>` : ''}`}
    <div class="sim-sub">編成 <span class="g-dim">${ships5(simComp(f))} 艘・${fmtN(cost)} 點（每個數字＝圖示數，1 圖示＝${opts.rep} 艘）</span></div>
    <div class="sim-comp">${SHIP_TYPES.map((st, t) => `<label>${st.name}<input class="g-in" type="number" min="0" step="10" data-ct="${t}" value="${f.comp[t] || 0}"></label>`).join('')}</div>
    ${f.comp[0] > 0 ? `<div class="sim-comp">${CRAFT.map((cr, r) => `<label title="${cr.note}">${cr.name}<input class="g-in" type="number" min="0" max="${SHIP_TYPES[0].fighters.n}" data-hg="${r}" value="${f.hangar[r]}"></label>`).join('')}</div>` : ''}
    <div class="sim-row"><span>陣型</span><select class="g-sel" data-fk="formation">${Object.keys(FORMATIONS).map((k) => opt(k, FORMATIONS[k].name, f.formation)).join('')}</select>
      <select class="g-sel" data-fk="arr">${opt('0', '自然', f.orderly ? String(f.layers || 1) : '0')}${opt('1', '整齊・1 層', f.orderly ? String(f.layers || 1) : '0')}${opt('3', '整齊・3 層', f.orderly ? String(f.layers || 1) : '0')}</select></div>
    <div class="sim-sub">位置</div>
    <div class="sim-comp"><label>X<input class="g-in" type="number" step="10" data-pk="x" value="${Math.round(f.x)}"></label><label>Z<input class="g-in" type="number" step="10" data-pk="z" value="${Math.round(f.z)}"></label>
      <label>高度<input class="g-in" type="number" step="10" min="${-ALT_MAX + 50}" max="${ALT_MAX - 50}" data-pk="y" value="${Math.round(f.y || 0)}"></label><label>朝向°<input class="g-in" type="number" step="15" data-pk="h" value="${Math.round(f.h * 180 / Math.PI)}"></label></div>
  </div>`;
}
function simTerrHtml(t) {
  return `<div class="sim-sec sim-ed"><div class="sim-h"><b>編輯地形</b><span class="g-sp"></span><button class="g-btn sm" id="sim-dup">複製</button><button class="g-btn sm" id="sim-del">刪除</button></div>
    <div class="sim-row"><span>類型</span><select class="g-sel" data-tk="type">${Object.keys(TERRAIN_TYPES).map((k) => `<option value="${k}" ${k === t.type ? 'selected' : ''}>${TERRAIN_TYPES[k].name}</option>`).join('')}</select></div>
    <div class="g-dim sim-note">${TERRAIN_TYPES[t.type].desc}</div>
    <div class="sim-comp"><label>X<input class="g-in" type="number" step="10" data-tk="x" value="${Math.round(t.x)}"></label><label>Z<input class="g-in" type="number" step="10" data-tk="z" value="${Math.round(t.z)}"></label>
      <label>高度<input class="g-in" type="number" step="10" data-tk="y" value="${Math.round(t.y || 0)}"></label><label>半徑<input class="g-in" type="number" step="5" min="20" max="400" data-tk="r" value="${Math.round(t.r)}"></label></div></div>`;
}
function simClampPos(o) { o.x = Math.max(MAP_BOUNDS.x0, Math.min(MAP_BOUNDS.x1, o.x)); o.z = Math.max(MAP_BOUNDS.z0, Math.min(MAP_BOUNDS.z1, o.z)); return o; }
function simBind(el) {
  const m = SIM.m, q = (s) => el.querySelectorAll(s), on = (id, ev, fn) => { const e = el.querySelector('#' + id); if (e) e[ev] = fn; };
  on('sim-name', 'onchange', (e) => { m.name = e.target.value.trim() || '新布局'; simChanged(false); });
  on('sim-exit', 'onclick', () => { if (SIM.mid && !confirm('離開模擬室？目前的戰局不會保留。')) return; simEndMid(); fieldGroup.clear(); clearSelection(); showSingle(); });
  on('sim-go', 'onclick', simGo);
  q('#sim-tabs [data-tab]').forEach((b) => (b.onclick = () => { SIM.tab = b.dataset.tab; simRender(); }));
  // 單位與地形清單
  q('[data-sf]').forEach((b) => (b.onclick = () => simSelect({ kind: 'fleet', i: +b.dataset.sf })));
  q('[data-st]').forEach((b) => (b.onclick = () => simSelect({ kind: 'terr', i: +b.dataset.st })));
  q('[data-add]').forEach((b) => (b.onclick = () => { m.fleets.push(simNewFleet(m, +b.dataset.add)); SIM.sel = { kind: 'fleet', i: m.fleets.length - 1 }; simChanged(); }));
  q('[data-addt]').forEach((b) => (b.onclick = () => {
    const type = b.dataset.addt;
    if (TERRAIN_TYPES[type].solid && m.terrain.filter((t) => TERRAIN_TYPES[t.type].solid).length >= SIM_TERR_MAX_SOLID) { toast(`實體障礙最多 ${SIM_TERR_MAX_SOLID} 個`); return; }
    const p = { x: Math.round(view.target.x / 10) * 10, z: Math.round(view.target.z / 10) * 10 };
    m.terrain.push({ type, x: p.x, z: p.z, y: 0, r: TERRAIN_TYPES[type].solid ? 60 : 180 }); SIM.sel = { kind: 'terr', i: m.terrain.length - 1 }; simChanged();
  }));
  // 戰場設定
  q('#sim-fac [data-v]').forEach((b) => (b.onclick = () => { m.fac = +b.dataset.v; simChanged(); }));
  q('#sim-ctl [data-v]').forEach((b) => (b.onclick = () => { m.ctl = +b.dataset.v; simChanged(false); }));
  q('#sim-env [data-v]').forEach((b) => (b.onclick = () => { const k = b.dataset.v; m.ground = k ? { scene: k, seed: (m.ground && m.ground.seed) || ((Math.random() * 1e6) | 0) + 1, def: m.ground ? m.ground.def : 1 } : null; simChanged(); }));   // 近地作戰
  q('#sim-gdef [data-v]').forEach((b) => (b.onclick = () => { m.ground.def = +b.dataset.v; simChanged(); }));
  on('sim-gseed', 'onchange', (e) => { m.ground.seed = Math.max(1, simNum(e.target.value, 1) | 0); simChanged(); });
  on('sim-gre', 'onclick', () => { m.ground.seed = ((Math.random() * 1e6) | 0) + 1; simChanged(); });
  q('#sim-fow [data-v]').forEach((b) => (b.onclick = () => { m.fow = b.dataset.v === '1'; simChanged(); }));   // 規則改變：戰鬥中改了就要重建
  if (el.querySelector('#sim-op')) bindOpSeg('sim-op', () => simChanged());   // 難度會改變規則（高度、誤射）：戰鬥中改了就要重建
  on('sim-discard', 'onclick', simDiscard);
  on('sim-reset', 'onclick', simReset);
  on('sim-vic', 'onchange', (e) => { m.victory = e.target.checked; simChanged(false); });
  on('sim-seed', 'onchange', (e) => { m.seed = Math.max(0, Math.round(simNum(e.target.value, 1))); simChanged(); });
  on('sim-reseed', 'onclick', () => { m.seed = Math.floor(Math.random() * 1e6); simChanged(); });
  // 布局存檔
  on('sim-saveas', 'onclick', () => { const L = simLayouts().filter((l) => l.name !== m.name); L.unshift({ name: m.name, t: Date.now(), m: JSON.parse(JSON.stringify(m)) }); simSetLayouts(L); toast(`已儲存「${m.name}」`); simRender(); });
  q('[data-ld]').forEach((b) => (b.onclick = () => { const l = simLayouts()[+b.dataset.ld]; if (!l) return; SIM.m = JSON.parse(JSON.stringify(l.m)); SIM.sel = null; SIM.tab = 'unit'; simChanged(); toast(`已載入「${l.name}」`); }));
  q('[data-dl]').forEach((b) => (b.onclick = () => { const L = simLayouts(), l = L[+b.dataset.dl]; if (!l || !confirm(`刪除布局「${l.name}」？`)) return; L.splice(+b.dataset.dl, 1); simSetLayouts(L); simRender(); }));
  q('[data-sc]').forEach((b) => (b.onclick = () => { SIM.m = simFromScenario(SCENARIOS[+b.dataset.sc]); SIM.sel = null; SIM.tab = 'unit'; simChanged(); }));
  on('sim-new', 'onclick', () => { SIM.m = simDefault(); SIM.sel = null; SIM.tab = 'unit'; simChanged(); });
  // 選取中的項目
  const it = simSelItem(); if (!it) return;
  on('sim-del', 'onclick', () => { (SIM.sel.kind === 'fleet' ? m.fleets : m.terrain).splice(SIM.sel.i, 1); SIM.sel = null; simChanged(); });
  on('sim-dup', 'onclick', () => {
    const arr = SIM.sel.kind === 'fleet' ? m.fleets : m.terrain, o = JSON.parse(JSON.stringify(it));
    if (SIM.sel.kind === 'terr' && TERRAIN_TYPES[o.type].solid && m.terrain.filter((t) => TERRAIN_TYPES[t.type].solid).length >= SIM_TERR_MAX_SOLID) { toast(`實體障礙最多 ${SIM_TERR_MAX_SOLID} 個`); return; }
    o.x += 80; if (o.name) o.name += '（複製）'; simClampPos(o); arr.push(o); SIM.sel = { kind: SIM.sel.kind, i: arr.length - 1 }; simChanged();
  });
  if (SIM.sel.kind === 'terr') {
    q('[data-tk]').forEach((e) => (e.onchange = () => {
      const k = e.dataset.tk;
      if (k === 'type') {
        if (TERRAIN_TYPES[e.value].solid && !TERRAIN_TYPES[it.type].solid && m.terrain.filter((t) => TERRAIN_TYPES[t.type].solid).length >= SIM_TERR_MAX_SOLID) { toast(`實體障礙最多 ${SIM_TERR_MAX_SOLID} 個`); simRender(); return; }
        it.type = e.value;
      } else if (k === 'r') it.r = Math.max(20, Math.min(400, simNum(e.value, it.r)));
      else if (k === 'y') it.y = Math.max(-ALT_MAX, Math.min(ALT_MAX, simNum(e.value, 0)));
      else { it[k] = simNum(e.value, it[k]); simClampPos(it); }
      simChanged();
    }));
    return;
  }
  const f = it, c = f.cmdr;
  q('#sim-fside [data-v]').forEach((b) => (b.onclick = () => { f.side = +b.dataset.v; simChanged(); }));
  q('[data-fk]').forEach((e) => (e.onchange = () => {
    const k = e.dataset.fk;
    if (k === 'name') { f.name = e.value.trim() || f.name; simChanged(false); return; }
    if (k === 'ai') f.ai = e.value ? { tactic: e.value, level: f.ai ? f.ai.level : 2 } : null;
    else if (k === 'ailv') f.ai.level = +e.value;
    else if (k === 'reserve') f.reserve = e.checked;
    else if (k === 'supply') { f.supply = e.checked; if (f.supply) { f.ai = null; if (f.follow == null) f.follow = -1; } }   // 補給艦隊：沒有指揮官與 AI，可設定跟隨
    else if (k === 'follow') f.follow = +e.value;
    else if (k === 'at') f.at = Math.max(1, Math.round(simNum(e.value, 60)));
    else if (k === 'formation') f.formation = e.value;
    else if (k === 'arr') { f.orderly = +e.value > 0; f.layers = +e.value || 1; }
    else if (k === 'base') {
      const o = COMMANDERS.find((x) => x.id === e.value);
      if (o) f.cmdr = { ...simCmdrFrom(o, c.mode), level: c.mode === 'tal' ? cmdrLevel(o.id) : c.level }; else c.base = null;
    }
    simChanged(['formation', 'arr', 'base'].includes(k));
  }));
  q('[data-ck]').forEach((e) => (e.onchange = () => {
    const k = e.dataset.ck;
    if (k === 'name') c.name = e.value.trim() || c.name;
    else if (k === 'level') c.level = Math.max(1, Math.min(30, Math.round(simNum(e.value, 1))));
    else if (k === 'trait') c.trait = e.value;
    else if (k === 'mode') c.mode = e.value;
    simChanged(false);
  }));
  q('[data-sk]').forEach((e) => (e.onchange = () => { const s = e.dataset.sk; c.skills = c.skills.filter((x) => x !== s); if (e.checked) c.skills.push(s); simChanged(false); }));
  q('[data-tal]').forEach((e) => (e.onchange = () => { const t = TALENT_BY_ID[e.dataset.tal], v = Math.max(0, Math.min(t.max, Math.round(simNum(e.value, 0)))); if (v) c.tal[t.id] = v; else delete c.tal[t.id]; simChanged(false); }));
  q('[data-ct]').forEach((e) => (e.onchange = () => { f.comp[+e.dataset.ct] = Math.max(0, Math.round(simNum(e.value, 0))); simChanged(); }));
  q('[data-hg]').forEach((e) => (e.onchange = () => { f.hangar[+e.dataset.hg] = Math.max(0, Math.min(SHIP_TYPES[0].fighters.n, Math.round(simNum(e.value, 0)))); simChanged(false); }));
  q('[data-pk]').forEach((e) => (e.onchange = () => {
    const k = e.dataset.pk, v = simNum(e.value, 0);
    if (k === 'h') f.h = v * Math.PI / 180; else if (k === 'y') f.y = Math.max(-ALT_MAX + 50, Math.min(ALT_MAX - 50, v)); else { f[k] = v; simClampPos(f); }
    simChanged();
  }));
}

// ───── 地圖上的滑鼠（編輯中） ─────
function simHit(cx, cy) {
  const q = squadronAt(cx, cy);
  if (q && q.fleet && SIM.m.fleets[q.fleet.id]) return { kind: 'fleet', i: q.fleet.id };
  const p = groundAt(cx, cy); if (!p) return null;
  let best = null, br = 1e9;
  SIM.m.terrain.forEach((t, i) => { const d = Math.hypot(p.x - t.x, p.z - t.z); if (d < t.r && t.r < br) { br = t.r; best = { kind: 'terr', i }; } });
  return best;
}
function simPointer(type, e) {
  if (e.pointerType === 'touch' || e.button === 1 && type === 'down') return false;
  const d = SIM.drag;
  if (type === 'down') {
    if (e.button === 0) {
      const h = simHit(e.clientX, e.clientY);
      if (!h) { if (SIM.sel) simSelect(null); return true; }
      if (!SIM.sel || SIM.sel.kind !== h.kind || SIM.sel.i !== h.i) simSelect(h);
      SIM.drag = { mode: 'move', A: groundAt(e.clientX, e.clientY), x0: e.clientX, y0: e.clientY };
      return true;
    }
    if (e.button === 2) {
      if (!SIM.sel) { toast('先選取一支艦隊或一個地形'); return true; }
      const A = groundAt(e.clientX, e.clientY); if (!A) return true;
      SIM.drag = { mode: 'place', A: simClampPos(A), x0: e.clientX, y0: e.clientY };
      return true;
    }
    return false;
  }
  if (!d) return false;
  const B = groundAt(e.clientX, e.clientY), far = Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8, it = simSelItem();
  if (type === 'move') {
    if (B && d.A && far && it) {
      d.moved = true;
      const from = d.mode === 'move' ? [it.x, it.z] : [d.A.x, d.A.z], to = d.mode === 'move' ? [it.x + B.x - d.A.x, it.z + B.z - d.A.z] : [B.x, B.z];
      preview.visible = true; pvBox.visible = pvArrow.visible = pvPath.visible = false; pvLine.visible = true; setPts(pvLine, [from, to]);
    }
    return true;
  }
  if (type === 'up') {
    hidePreview(); SIM.drag = null;
    if (!it) return true;
    if (d.mode === 'move' && d.moved && B && d.A) { it.x += B.x - d.A.x; it.z += B.z - d.A.z; simClampPos(it); simChanged(); }
    else if (d.mode === 'place') {
      it.x = d.A.x; it.z = d.A.z;
      if (SIM.sel.kind === 'fleet' && B && far) it.h = Math.atan2(B.x - d.A.x, B.z - d.A.z);
      simChanged();
    }
    return true;
  }
  return false;
}

// ───── 戰鬥 ─────
function simGo() { if (SIM.mid && SIM.live && !SIM.dirty) simResumeLive(); else simStart(); }
// 開戰（SIM.mid＝戰鬥中編輯完，從暫停時的戰況接著打）
function simStart() {
  const m = SIM.m, cont = SIM.mid;
  if (![0, 1].every((s) => m.fleets.some((f) => f.side === s && !f.reserve && simComp(f) > 0))) { toast('雙方都至少要有一支（非增援的）艦隊'); return; }
  if (cont) SIM.t0 += SIM.snapT; else { SIM.base = JSON.parse(JSON.stringify(m)); SIM.t0 = 0; if (!m.watch && !m.pilot && !m.captain) simSave(); }   // 觀摩不覆蓋模擬室「上次的布局」
  SIM.mid = SIM.live = SIM.dirty = false;
  GAME.attempt = (GAME.attempt || 0) + 1;
  GAME.watch = !!m.watch;   // AI 對戰觀摩：雙方都是 AI，玩家只看
  GAME.pilot = m.pilot || null;   // 王牌飛行員：雙方艦隊都由 AI 指揮，玩家駕駛一架艦載機
  GAME.captain = m.captain || null;   // 艦長：玩家直接操控特種小隊的戰艦（captain.js）
  GAME.sc = { id: 'sim', name: GAME.watch ? `AI 對戰觀摩・${m.name}` : GAME.pilot ? `王牌飛行員・${m.name}` : GAME.captain ? `艦長・${m.name}` : `模擬室・${m.name}`, sim: true, seed: m.seed, timeLimit: m.timeLimit || SIM_INF };
  fieldGroup.clear();
  applyOp(GAME.pilot || GAME.captain ? 1 : opLevel(), !GAME.pilot && !GAME.captain && m.fow !== false); const setup = simSetup(m, false); setup.op = GAME.op;   // 戰爭迷霧可以在模擬室關掉；駕駛：可以上下移動、沒有戰爭迷霧
  if (GAME.watch) GAME.op = Math.min(GAME.op, 1);   // 觀摩：規則照操作難度（含擬真的誤射），但畫面不鎖在艦橋
  newBattle(m.seed >>> 0, setup);
  setRule('fire', true); setRule('advance', false);
  GAME.init = [sideAlive(0), sideAlive(1)];
  if (cont) {
    // 接續：潰走的比例仍以整場的兵力為準（加進來的新艦隊另外算進去）；各艦隊的百分比也照原本的兵力
    GAME.init = GAME.init.map((n, s) => SIM.snapInit[s] + Math.max(0, n - SIM.snapAlive[s]));
    for (const f of fleets) { const mf = m.fleets[f.id]; if (mf && mf.init0) f.initial = Math.max(f.initial, mf.init0); }
  }
  GAME.result = null; GAME.reportShown = false; GAME.replaying = false; GAME.skillArm = null; GAME.xp = null; GAME.log = []; GAME.simCtl = null;
  gEl('battlehud').innerHTML = '';
  drawField(false);
  setPhase('battle');
  if (GAME.watch || GAME.pilot || GAME.captain) { GAME.playerSide = 0; setCmdSide(0, false); clearSelection(); }   // 觀摩、駕駛：沒有 simctl 命令＝雙方 AI 都在動
  else { GAME.playerSide = m.ctl; setCmdSide(m.ctl, false); clearSelection(); issue('simctl', { ctl: m.ctl }); }   // 誰被玩家接管（該方 AI 暫停）也記在命令裡，回放一致
  paused = false; setSpeed(GAME.pilot || GAME.captain ? SPEEDS.indexOf(1) : SETTINGS.speedIdx);   // 駕駛：固定 ×1
  force3D(); if (GAME.pilot) { pilotBegin(m.pilot); return; } if (GAME.captain) { capBegin(m.captain); return; } if (GAME.op === 2) enterBridge();   // 與正式作戰相同：進階以上強制 3D，擬真直接上艦橋
  if (opts.fow && SETTINGS.autoScan === false && !GAME.watch) issue('autoscan', { on: false });   // 戰爭迷霧：玩家關掉了自動掃描
  if (GAME.watch) { toast(`觀摩開始：${simSideName(m, 0)} vs ${simSideName(m, 1)}（左側面板是 AI 的即時判斷，點艦隊名稱可以跳過去看；左鍵拖曳＝移動畫面、右鍵拖曳＝調整視角；空白鍵暫停、＋／－ 調速度）`); return; }
  toast(cont ? `以目前戰況接續（指揮${simSideName(m, m.ctl)}）` : `模擬開始：指揮${simSideName(m, m.ctl)}（畫面上方「切換指揮」可以接管另一方、「編輯配置」可以隨時調整）`);
}
// 目前戰況 → 布局：位置＝存活艦艇的中心、朝向與陣型＝旗艦那一隊、編成＝剩下的艦數；尚未出現的增援照剩餘時間
function simSnapshot() {
  const m = JSON.parse(JSON.stringify(SIM.m)), t = U.uTime.value;
  m.ctl = GAME.playerSide;
  m.fleets.forEach((mf, i) => {
    const f = fleets.find((o) => o.id === i); if (!f) return;   // 原本就沒有艦艇
    mf.init0 = Math.max(mf.init0 || 0, f.initial);
    if (f.reserve) { mf.reserve = true; mf.at = Math.max(1, Math.round((f.activateAt != null ? f.activateAt : mf.at) - t)); return; }
    mf.reserve = false;
    const al = fleetAlive(f), comp = new Array(NT).fill(0);
    for (const q of al) for (let k = 0; k < NT; k++) comp[k] += q.typeAlive[k];
    if (al.some((q) => q.flagship >= 0 && ships.alive[q.flagship]) && comp[1] > 0) comp[1]--;   // 重建時會再補一艘旗艦
    mf.comp = comp;
    if (!al.length) return;
    const C = centerOf(al), g = (al.find((q) => q.flagship >= 0 && ships.alive[q.flagship]) || al[0]).group;
    mf.x = Math.round(C.x); mf.z = Math.round(C.z); mf.y = Math.max(-ALT_MAX + 50, Math.min(ALT_MAX - 50, Math.round(C.y)));
    if (g) { mf.h = groupHeading(g, t); mf.formation = g.formation; mf.orderly = !!g.orderly; mf.layers = g.layers || 1; }
    if (f.ai && mf.ai) mf.ai.tactic = f.ai.tactic;   // AI 中途改過的打法
    if (f.supply) mf.follow = f.follow;
    mf.keep = simKeepOf(f, g, t);
  });
  // 已經進場的呼叫增援：變成布局裡的一般艦隊（沒有指揮官），接續時才不會消失
  for (const f of fleets) {
    if (f.reinfOf == null || f.reserve) continue;
    const al = fleetAlive(f); if (!al.length) continue;
    const comp = new Array(NT).fill(0); for (const q of al) for (let k = 0; k < NT; k++) comp[k] += q.typeAlive[k];
    if (al.some((q) => q.flagship >= 0 && ships.alive[q.flagship]) && comp[1] > 0) comp[1]--;   // 重建時會再補一艘旗艦
    const C = centerOf(al), g = al[0].group;
    m.fleets.push({ side: f.side, name: f.name, noCmdr: true, cmdr: { base: null, name: f.name, title: '', trait: 'dmg', level: 1, mode: 'lv', tal: {}, skills: [] }, comp, hangar: (f.hangar || HANGAR_DEFAULT).slice(),
      formation: g ? g.formation : 'line', orderly: !!(g && g.orderly), layers: (g && g.layers) || 1, x: Math.round(C.x), z: Math.round(C.z), y: Math.round(C.y), h: g ? groupHeading(g, t) : 0,
      ai: null, reserve: false, at: 60, init0: f.initial, keep: simKeepOf(f, g, t) });
  }
  m.jam = [0, 1].map((s) => (jammed(s) ? [Math.round((jam[s].until - t) * 10) / 10, jam[s].delay] : null));   // 干擾剩下的時間
  return m;
}
// 接續時要保留的狀態（重建後套回去）：平均耐久與護盾比例、飛彈與補給存量比例、技能剩餘次數與冷卻、命令隊列（指定目標的項目除外）
function simKeepOf(f, g, t) {
  let hp = 0, hpM = 0, sh = 0, shM = 0, am = 0, amM = 0, sk = 0, skM = 0;
  for (const q of fleetAlive(f)) for (const i of q.list) {
    if (!ships.alive[i]) continue;
    const st = SHIP_TYPES[ships.type[i]];
    hp += ships.hp[i]; hpM += maxHp(i); sh += ships.sh[i]; shM += ships.shMax[i];
    if (st.missile) { am += ships.ammo[i]; amM += st.missile.n; }
    if (st.supply) { sk += ships.stock[i]; skM += st.supply.stock; }
  }
  const r = (a, b) => (b ? Math.round(a / b * 1000) / 1000 : 1);
  return {
    hp: r(hp, hpM), sh: r(sh, shM), ammo: r(am, amM), stock: r(sk, skM),
    skills: Object.fromEntries(Object.entries(f.skills).map(([id, s]) => [id, { left: s.left, cd: Math.max(0, Math.round((s.ready - t) * 10) / 10) }])),
    queue: g && g.queue ? g.queue.filter((it) => it.target == null).map(({ qid, ...it }) => it) : [],
  };
}
// 戰鬥中：暫停並打開編輯（戰局先保留，第一次修改場景時才重建）
function simEditMid() {
  if (!GAME.sc || !GAME.sc.sim || GAME.phase !== 'battle' || GAME.replaying || GAME.result) return;
  if (BR.on) exitBridge();
  if (TAC.open) closeTac();
  GAME.skillArm = null; hideHint(); closeRadial();
  paused = true; updateTimeUI();
  SIM.snapT = U.uTime.value; SIM.snapInit = GAME.init.slice(); SIM.snapAlive = [sideAlive(0), sideAlive(1)];
  SIM.keep = SIM.m;   // 放棄修改時還原
  SIM.m = simSnapshot(); SIM.mid = true; SIM.live = true; SIM.dirty = false; SIM.sel = null; SIM.tab = 'unit';
  setPhase('simedit');
  clearSelection(); simRender();
}
// 沒有修改（或放棄修改）：回到原本的戰局，什麼都不重置
function simResumeLive() {
  SIM.m = SIM.keep || SIM.m; SIM.keep = null; SIM.mid = SIM.live = SIM.dirty = false; SIM.sel = null;
  drawField(false); clearSelection();
  gEl('battlehud').innerHTML = '';
  setPhase('battle'); setCmdSide(GAME.playerSide, false);
  paused = false; updateTimeUI();
  if (GAME.op === 2) enterBridge();
}
function simDiscard() { if (SIM.live) simResumeLive(); }
// 重置戰場：布局與狀態回到開戰時
function simReset() {
  if (!SIM.base) return;
  if (SIM.dirty && !confirm('重置戰場？目前的戰況與修改都會捨棄，回到開戰時的布局。')) return;
  SIM.m = JSON.parse(JSON.stringify(SIM.base)); simEndMid(); SIM.sel = null;
  simBuild(); toast('已重置：回到開戰時的布局');
}
function simEndMid() { SIM.mid = SIM.live = SIM.dirty = false; SIM.keep = null; SIM.t0 = 0; }
// 戰鬥中切換指揮的陣營
function simSwitch() {
  if (!GAME.sc || !GAME.sc.sim || GAME.phase !== 'battle' || GAME.replaying) return;
  if (BR.on) exitBridge();
  const side = 1 - GAME.playerSide;
  GAME.skillArm = null; hideHint(); closeRadial();
  if (typeof closeNodePop === 'function') closeNodePop();
  issue('simctl', { ctl: side });
  GAME.playerSide = side; setCmdSide(side, false); clearSelection();
  buildBattleHud();
  if (GAME.op === 2) enterBridge();   // 擬真：換到另一方的旗艦艦橋
  else if (TAC.open) buildTacSide();
  toast(`改為指揮${simSideName(SIM.m, side)}（這一方的 AI 暫停）`);
}
function showSimReport() {
  if (SIM.m && SIM.m.pilot) { pilotReport(); return; }   // 王牌飛行員：個人戰績
  if (SIM.m && SIM.m.captain) { capReport(); return; }   // 艦長：任務報告
  const R = GAME.result, m = SIM.m, st = battleStats();
  setPhase('report');
  const n0 = simSideName(m, 0), n1 = simSideName(m, 1);
  const label = { win: `${n0} 勝利`, lose: `${n1} 勝利`, draw: '平手', end: '模擬結束' }[R.kind] || '模擬結束';
  const row = (t) => `<tr><td>${SHIP_TYPES[t].name}</td><td>${ships5(st.init[0][t])}</td><td>${ships5(st.init[0][t] - st.left[0][t])}</td><td>${ships5(st.init[1][t])}</td><td>${ships5(st.init[1][t] - st.left[1][t])}</td></tr>`;
  const asp = (sd) => dmgStats[sd].map((v) => ships5(v)).join(' ／ ');
  const used = (side) => fleets.filter((f) => f.side === side).flatMap((f) => Object.entries(f.skills).filter(([, s]) => s.used).map(([id, s]) => `${f.name}：${SKILLS[id].name} ×${s.used}`));
  const fl = (side) => fleets.filter((f) => f.side === side).map((f) => { const n = sumA(f.sqs.map((q) => q.alive)); return `<div>${escH(f.name)}　<span class="g-dim">${f.reserve ? '未出場' : `剩 ${Math.round(n / f.initial * 100)}%`}</span></div>`; }).join('');
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>${m.watch ? '觀摩結果' : '模擬結果'}</h2><span class="crumb">${escH(m.name)}　·　${OP_LEVELS[(battleSetup && battleSetup.op) || 0].name}難度　·　戰鬥時間 ${_fmtT(R.t + SIM.t0)}</span></div>
    ${SIM.t0 > 0 ? `<div class="g-dim" style="margin:-4px 0 10px">戰鬥中調整過配置：下面的損失統計與回放從最後一次調整（${_fmtT(SIM.t0)}）開始。</div>` : ''}
    <div class="g-card" style="margin-bottom:12px;text-align:center"><p class="result ${R.kind === 'end' ? 'draw' : R.kind}">${label}</p><div class="g-dim">${escH(m.watch ? R.why.replaceAll('我軍', n0).replaceAll('敵軍', n1).replace('我方', n0).replace('敵方', n1) : R.why)}</div>
      <div style="margin-top:6px">${n0} 剩 ${Math.round(R.ratio[0] * 100)}%　·　${n1} 剩 ${Math.round(R.ratio[1] * 100)}%</div></div>
    <div class="intel-grid">
      <div class="g-card"><h3>兵力損失（艘）</h3><table class="stat-tbl"><tr><th>艦種</th><th>${n0}出擊</th><th>${n0}損失</th><th>${n1}出擊</th><th>${n1}損失</th></tr>
        ${SHIP_TYPES.map((_, t) => t).filter((t) => t < N_COMBAT || st.init[0][t] + st.init[1][t] > 0).map(row).join('')}
        <tr><td><b>合計</b></td><td>${ships5(sumA(st.init[0]))}</td><td>${ships5(sumA(st.init[0]) - sumA(st.left[0]))}</td><td>${ships5(sumA(st.init[1]))}</td><td>${ships5(sumA(st.init[1]) - sumA(st.left[1]))}</td></tr></table>
        <dl class="kv" style="margin-top:10px"><dt>被擊沉方向</dt><dd>${n0} 正／側／背 ${asp(0)}<br>${n1} 正／側／背 ${asp(1)}</dd>
        ${battleRules && battleRules.rotate ? `<dt>前排輪替／戰地維修</dt><dd>${n0} ${fmtN(wStats[0].rot)} 次／${fmtN(wStats[0].fRep)} 次（修回 ${fmtN(wStats[0].fHeal)}）<br>${n1} ${fmtN(wStats[1].rot)} 次／${fmtN(wStats[1].fRep)} 次（修回 ${fmtN(wStats[1].fHeal)}）</dd>` : ''}
        ${battleRules && battleRules.deflect ? `<dt>護盾偏折（無傷／減半）</dt><dd>${n0} ${fmtN(deflStats[0][0])}／${fmtN(deflStats[0][1])} 次（擋掉 ${fmtN(deflStats[0][2])}）<br>${n1} ${fmtN(deflStats[1][0])}／${fmtN(deflStats[1][1])} 次（擋掉 ${fmtN(deflStats[1][2])}）</dd>` : ''}
        ${battleRules && battleRules.ray ? `<dt>光束擋下／流彈／空中擋下</dt><dd>${n0} ${rayStats[0].map(fmtN).join('／')} 發<br>${n1} ${rayStats[1].map(fmtN).join('／')} 發</dd>` : ''}
        ${battleRules && battleRules.ff ? `<dt>友軍誤射</dt><dd>${n0} ${fmtN(ffStats[0][0])} 發（${fmtN(Math.round(ffStats[0][1]))} 傷害）<br>${n1} ${fmtN(ffStats[1][0])} 發（${fmtN(Math.round(ffStats[1][1]))} 傷害）</dd>${battleRules.ff === 2 ? `<dt>射界受阻停火</dt><dd>${n0} ${fmtN(ffHold[0])} 次<br>${n1} ${fmtN(ffHold[1])} 次</dd>` : ''}` : ''}</dl></div>
      <div class="g-card"><h3>各艦隊</h3><div class="g-pc" style="margin-bottom:4px">${n0}</div>${fl(0)}<div class="g-ec" style="margin:8px 0 4px">${n1}</div>${fl(1)}
        <dl class="kv" style="margin-top:10px"><dt>使用技能</dt><dd>${[...used(0), ...used(1)].join('<br>') || '無'}</dd></dl>
        <div class="g-dim" style="font-size:calc(12px * var(--ui));margin-top:8px">${m.watch ? 'AI 對戰觀摩' : '模擬室'}不計戰績、不給經驗，也不會上傳戰鬥紀錄。</div></div>
    </div>
    ${m.watch ? watchReportHtml(m, R) : ''}
    <div class="g-row" style="margin-top:14px"><button class="g-btn" id="sr-menu">單人戰鬥</button><span class="g-sp"></span>
      ${m.watch ? '<button class="g-btn" id="sr-replay">觀看回放</button><button class="g-btn" id="sr-sim" title="把這場的布局帶到模擬室：可以接管任一方，自己試試看">在模擬室接手</button><button class="g-btn" id="sr-edit">觀摩設定</button><button class="g-btn pri" id="sr-roll">再看一場（重新隨機）→</button>'
        : '<button class="g-btn" id="sr-replay">觀看回放</button><button class="g-btn" id="sr-again">同一個布局再打一次</button><button class="g-btn pri" id="sr-edit">回到編輯 →</button>'}</div>
  </div>`);
  gEl('sr-menu').onclick = showSingle;
  gEl('sr-replay').onclick = () => startReplay();
  const base = () => JSON.parse(JSON.stringify(SIM.base || SIM.m));
  if (m.watch) {
    gEl('sr-roll').onclick = () => watchGo(true);
    gEl('sr-sim').onclick = () => { const b = base(); b.watch = false; b.ctl = 0; b.name = '觀摩・' + b.name; showSim(b); };
    gEl('sr-edit').onclick = () => showWatch();
    return;
  }
  gEl('sr-again').onclick = () => { overlay(null); simEndMid(); SIM.m = base(); simStart(); };
  gEl('sr-edit').onclick = () => showSim(base());
}
