// ═══════════════════════ 設定：按鍵綁定、遊戲、介面資訊 ═══════════════════════
const SET = { el: null, tab: 'keys', capture: null, msg: '', autoPaused: false };
function settingsOpen() { return !!SET.el && !SET.el.hidden; }
function settingsCapturing() { return !!SET.capture; }
function toggleSettings() { if (settingsOpen()) closeSettings(); else openSettings(); }
function applyUISettings() {
  const b = document.body;
  b.classList.toggle('ui-no-stats', !uiOn('stats'));
  b.classList.toggle('ui-no-skillbar', !uiOn('skillbar'));
  b.classList.toggle('ui-no-selbar', !uiOn('selbar'));
  b.classList.toggle('ui-no-minimap', !uiOn('minimap'));
  document.documentElement.style.setProperty('--ui', SETTINGS.uiScale || 1.2);
}
const UI_SCALES = [[1, '小（原本大小）'], [1.1, '中'], [1.2, '大（預設）'], [1.35, '特大'], [1.5, '超大']];
// 畫在 canvas 上的字跟著介面大小縮放
function uiPx(n) { return +(n * (SETTINGS.uiScale || 1.2)).toFixed(1); }
function openSettings() {
  if (!SET.el) {
    SET.el = document.createElement('div'); SET.el.id = 'settings'; SET.el.hidden = true;
    document.body.appendChild(SET.el);
    SET.el.addEventListener('click', (e) => { if (e.target === SET.el) closeSettings(); });
  }
  // 作戰中打開設定：暫停（關掉時恢復）
  SET.autoPaused = (GAME.phase === 'battle') && !paused;
  if (SET.autoPaused) { paused = true; updateTimeUI(); }
  SET.el.hidden = false; SET.msg = '';
  renderSettings();
}
function closeSettings() {
  if (!SET.el) return;
  SET.capture = null; SET.el.hidden = true;
  if (SET.autoPaused && !GAME.result) { paused = false; updateTimeUI(); }
  SET.autoPaused = false;
  saveSettings(); applyUISettings();
}
function renderSettings() {
  const tabs = [['keys', '按鍵綁定'], ['game', '遊戲'], ['ui', '介面資訊']];
  let body = '';
  if (SET.tab === 'keys') {
    const groups = [...new Set(KEY_ACTIONS.map((a) => a[2]))];
    body = `<p class="g-dim set-note">點右邊的按鍵後，按下新的鍵即可改綁（Esc 取消、Backspace 清除）。輪盤的鍵只在輪盤開著時有效，所以可以和鏡頭共用。Esc 與 Ctrl＋A（全選）固定不能改。</p>
      ${SET.msg ? `<p class="set-msg">${SET.msg}</p>` : ''}
      <div class="set-keys">${groups.map((gname) => `<div class="set-grp"><h4>${gname}</h4>${KEY_ACTIONS.filter((a) => a[2] === gname).map(([id, name]) => `
        <div class="set-row"><span>${name}</span><button class="g-btn sm set-key ${SET.capture === id ? 'cap' : ''}" data-k="${id}">${SET.capture === id ? '按下新按鍵…' : keyText(id)}</button></div>`).join('')}</div>`).join('')}</div>
      <div class="set-row" style="margin-top:10px"><span>排進戰術隊列的修飾鍵（按住它再下令）</span>
        <select class="g-sel" id="set-qmod">${['Shift', 'Control', 'Alt'].map((m) => `<option value="${m}" ${SETTINGS.queueMod === m ? 'selected' : ''}>${m === 'Control' ? 'Ctrl' : m}</option>`).join('')}</select></div>
      <div class="g-row" style="margin-top:12px"><span class="g-sp"></span><button class="g-btn sm" id="set-kreset">按鍵恢復預設</button></div>`;
  } else if (SET.tab === 'game') {
    body = `<div class="set-row"><span>開戰時的遊戲速度<br><small class="g-dim">戰鬥中仍可用 ${keyText('speed_up')}／${keyText('speed_down')} 或上方按鈕調整</small></span>
        <select class="g-sel" id="set-speed">${SPEEDS.map((v, i) => `<option value="${i}" ${SETTINGS.speedIdx === i ? 'selected' : ''}>×${v}</option>`).join('')}</select></div>
      <div class="set-row"><span>目前的遊戲速度</span><span class="g-row">${SPEEDS.map((v, i) => `<button class="g-btn sm ${speedIdx === i ? 'pri' : ''}" data-sp="${i}">×${v}</button>`).join('')}</span></div>
      <div class="set-row"><span>下令時自動減速<br><small class="g-dim">沒有暫停時，按住右鍵移動、打開指令輪盤、選攻擊或技能目標的期間，遊戲變慢，下完命令恢復原本速度</small></span>
        <select class="g-sel" id="set-cmdslow">${[[0, '關閉'], [0.1, '×0.1'], [0.2, '×0.2'], [0.5, '×0.5']].map(([v, n]) => `<option value="${v}" ${SETTINGS.cmdSlow === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <label class="set-row set-chk"><span>打開戰術面板時自動暫停<br><small class="g-dim">只限單人模式</small></span><input type="checkbox" id="set-tacpause" ${SETTINGS.tacPause ? 'checked' : ''}></label>
      <label class="set-row set-chk"><span>過場動畫<br><small class="g-dim">開戰、勝利／敗北／平手、戰鬥回放時的文字切入（APNG）</small></span><input type="checkbox" id="set-cutin" ${SETTINGS.cutin !== false ? 'checked' : ''}></label>
      <div class="set-row"><span>過場動畫工坊<br><small class="g-dim">自己打字做切入動畫，預覽並下載成 APNG</small></span><button class="g-btn sm" id="set-cutstudio">工坊…</button></div>
      <div class="set-h">指揮官視角（艦橋，${keyText('bridge')}）</div>
      <label class="set-row set-chk"><span>低頭看戰術台時自動暫停<br><small class="g-dim">只限單人模式；預設不暫停，邊看戰場邊下令</small></span><input type="checkbox" id="set-brpause" ${SETTINGS.bridgePause ? 'checked' : ''}></label>
      <label class="set-row set-chk"><span>「戰況」視窗固定在畫面上<br><small class="g-dim">不勾＝放在艦橋左側，轉頭才看得到</small></span><input type="checkbox" id="set-pin-stat" ${SETTINGS.brPins.stat ? 'checked' : ''}></label>
      <label class="set-row set-chk"><span>「各艦隊旗艦」視窗固定在畫面上<br><small class="g-dim">不勾＝放在艦橋右側，轉頭才看得到</small></span><input type="checkbox" id="set-pin-pip" ${SETTINGS.brPins.pip ? 'checked' : ''}></label>
      <div class="set-h">武器模型</div>
      <label class="set-row set-chk"><span>2D 畫面顯示武器<br><small class="g-dim">依「武器配置」的掛點，疊在船體貼圖上</small></span><input type="checkbox" id="set-w2d" ${SETTINGS.weapons2D !== false ? 'checked' : ''}></label>
      <label class="set-row set-chk"><span>3D 畫面顯示武器<br><small class="g-dim">船夠近（細節前三級）才畫；大軍遠景時關掉可以省效能</small></span><input type="checkbox" id="set-w3d" ${SETTINGS.weapons3D !== false ? 'checked' : ''}></label>
      <div class="set-row"><span>武器掛點<br><small class="g-dim">調整、新增每種船的武器位置</small></span><button class="g-btn sm" id="set-wed">武器配置…</button></div>
      <div class="set-row"><span>畫面</span><span class="g-row"><button class="g-btn sm ${mode3D ? '' : 'pri'}" data-rm="2d">2D 像素</button><button class="g-btn sm ${mode3D ? 'pri' : ''}" data-rm="3d">3D 模型</button></span></div>`;
  } else {
    body = `<div class="set-row"><span>介面大小<br><small class="g-dim">文字、按鈕與面板間距一起放大縮小</small></span>
        <select class="g-sel" id="set-uiscale">${UI_SCALES.map(([v, n]) => `<option value="${v}" ${(SETTINGS.uiScale || 1.2) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <p class="g-dim set-note" style="margin-top:12px">關掉的項目不會顯示在戰鬥畫面上（戰術面板裡的隊列與預覽一律顯示）。</p>
      <div class="set-h">王牌飛行員</div>
      <div class="set-row"><span>雷達小地圖的位置（背後視角）<br><small class="g-dim">另一側的儀表會移到雷達上方；座艙視角固定在中央儀表板</small></span>
        <select class="g-sel" id="set-pradar">${[['right', '右下角（預設）'], ['left', '左下角']].map(([v, n]) => `<option value="${v}" ${(SETTINGS.pilotRadar || 'right') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      ${UI_OPTS.map(([k, name, desc]) => `<label class="set-row set-chk"><span>${name}<br><small class="g-dim">${desc}</small></span><input type="checkbox" data-ui="${k}" ${uiOn(k) ? 'checked' : ''}></label>`).join('')}
      <div class="g-row" style="margin-top:12px"><span class="g-sp"></span><button class="g-btn sm" id="set-ureset">全部顯示</button></div>`;
  }
  SET.el.innerHTML = `<div class="set-card"><div class="g-head" style="margin-bottom:10px"><h2>設定</h2><span class="g-sp"></span><button class="g-btn" id="set-close">完成</button></div>
    <div class="set-tabs">${tabs.map(([k, n]) => `<button class="g-btn sm ${SET.tab === k ? 'pri' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
    <div class="set-body">${body}</div></div>`;
  const q = (s) => SET.el.querySelector(s), qa = (s) => SET.el.querySelectorAll(s);
  q('#set-close').onclick = closeSettings;
  qa('[data-tab]').forEach((b) => (b.onclick = () => { SET.tab = b.dataset.tab; SET.capture = null; SET.msg = ''; renderSettings(); }));
  qa('.set-key').forEach((b) => (b.onclick = () => { SET.capture = b.dataset.k; SET.msg = ''; renderSettings(); }));
  if (q('#set-pradar')) q('#set-pradar').onchange = (e) => { SETTINGS.pilotRadar = e.target.value; saveSettings(); };
  if (q('#set-qmod')) q('#set-qmod').onchange = (e) => { SETTINGS.queueMod = e.target.value; saveSettings(); };
  if (q('#set-kreset')) q('#set-kreset').onclick = () => { for (const a of KEY_ACTIONS) SETTINGS.keys[a[0]] = a[3]; SETTINGS.queueMod = 'Shift'; SET.msg = '已恢復預設按鍵。'; saveSettings(); renderSettings(); };
  if (q('#set-cutin')) q('#set-cutin').onchange = (e) => { SETTINGS.cutin = e.target.checked; saveSettings(); if (!e.target.checked) cutStop(); };
  if (q('#set-cutstudio')) q('#set-cutstudio').onclick = openCutStudio;
  if (q('#set-speed')) q('#set-speed').onchange = (e) => { SETTINGS.speedIdx = +e.target.value; saveSettings(); };
  qa('[data-sp]').forEach((b) => (b.onclick = () => { setSpeed(+b.dataset.sp); renderSettings(); }));
  if (q('#set-cmdslow')) q('#set-cmdslow').onchange = (e) => { SETTINGS.cmdSlow = +e.target.value; saveSettings(); };
  if (q('#set-tacpause')) q('#set-tacpause').onchange = (e) => { SETTINGS.tacPause = e.target.checked; saveSettings(); };
  if (q('#set-w2d')) q('#set-w2d').onchange = (e) => { SETTINGS.weapons2D = e.target.checked; saveSettings(); applyWeapon2D(); };
  if (q('#set-w3d')) q('#set-w3d').onchange = (e) => { SETTINGS.weapons3D = e.target.checked; saveSettings(); };
  if (q('#set-wed')) q('#set-wed').onclick = () => { closeSettings(); openWeaponEditor(GAME.phase === 'menu' ? showMenu : null); };
  if (q('#set-brpause')) q('#set-brpause').onchange = (e) => { SETTINGS.bridgePause = e.target.checked; saveSettings(); };
  for (const k of ['stat', 'pip']) if (q('#set-pin-' + k)) q('#set-pin-' + k).onchange = (e) => { SETTINGS.brPins[k] = e.target.checked; saveSettings(); };
  qa('[data-rm]').forEach((b) => (b.onclick = () => { setRenderMode(b.dataset.rm); setTimeout(renderSettings, 50); }));
  qa('[data-ui]').forEach((el) => (el.onchange = () => { SETTINGS.ui[el.dataset.ui] = el.checked; saveSettings(); applyUISettings(); }));
  if (q('#set-uiscale')) q('#set-uiscale').onchange = (e) => { SETTINGS.uiScale = +e.target.value; saveSettings(); applyUISettings(); dispatchEvent(new Event('resize')); };
  if (q('#set-ureset'))q('#set-ureset').onclick = () => { for (const u of UI_OPTS) SETTINGS.ui[u[0]] = true; saveSettings(); applyUISettings(); renderSettings(); };
}
// 改綁：攔下下一個按鍵
addEventListener('keydown', (e) => {
  if (!SET.capture) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const id = SET.capture, code = e.code;
  if (code === 'Escape') { SET.capture = null; renderSettings(); return; }
  if (code === 'Backspace' || code === 'Delete') { SETTINGS.keys[id] = ''; SET.capture = null; SET.msg = '已清除綁定。'; saveSettings(); renderSettings(); return; }
  if (/^(Shift|Control|Alt|Meta)/.test(code) && KEY_CTX(id) !== 'pilot' && KEY_CTX(id) !== 'cap') return;   // 修飾鍵不能單獨綁（駕駛、艦長的加速可以）
  // 同一情境裡重複的鍵：原本的動作解除綁定
  const clash = KEY_ACTIONS.filter((a) => a[0] !== id && KEY_CTX(a[0]) === KEY_CTX(id) && SETTINGS.keys[a[0]] === code);
  for (const a of clash) SETTINGS.keys[a[0]] = '';
  SETTINGS.keys[id] = code; SET.capture = null;
  const nm = KEY_ACTIONS.find((a) => a[0] === id)[1];
  SET.msg = `「${nm}」改為 ${keyLabel(code)}。` + (clash.length ? `原本用這個鍵的「${clash.map((a) => a[1]).join('、')}」已解除綁定。` : '');
  saveSettings(); renderSettings();
}, true);
