// ───── 星海生涯：星圖畫面（資料模型在 starmap.js）─────
// 整個畫面是星圖。上方是週數、資金與按鈕；左下是我的艦隊列（點一下選取）；點星系才跳出星系卡片。
// 星圖上：綠＝我的艦隊、藍＝友軍、紅＝敵軍；箭頭＝下一回合的動向（看得到的單位）；⚔＝預計交戰。
// 結束回合：所有艦隊移動 → 列出有我方艦隊的戰鬥，選擇介入方式（親自指揮／交給艦隊指揮官）→ 計算 → 戰報 → 下一週
let SMU = { S: null, sel: new Set(), sys: -1, card: null, view: null, scene: null, hits: [], q: [], raf: 0 };
// 深色星圖上要好認：中立用亮黃色（2026-11-12，原本的灰色太暗）
const SMU_REL = { own: { col: '#3fdf8f', tag: '我', name: '我的艦隊' }, ally: { col: '#4aa8ff', tag: '友', name: '友軍' }, enemy: { col: '#ff4d4d', tag: '敵', name: '敵軍' }, neutral: { col: '#ffd23f', tag: '中', name: '中立／停戰' } };
const SMU_CSS = `
.sm-wrap{position:fixed;inset:0;display:flex;flex-direction:column;background:#070b12;color:#dfe6ef;font-size:13px;z-index:5}
.sm-top{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #1d2838;background:#0b111b;flex-wrap:wrap}
.sm-top h2{margin:0;font-size:17px;letter-spacing:1px}.sm-top .g-sp{flex:1}
.sm-top .g-btn{padding:5px 11px;min-height:0;font-size:13px}.sm-top .sm-btnbar{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.sm-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:10px;background:#121b29;font-size:12px}
.sm-chip i{width:9px;height:9px;border-radius:50%;display:inline-block}
.sm-badge{display:inline-block;min-width:16px;padding:0 4px;margin-left:4px;border-radius:8px;background:#ffb35a;color:#111;font-size:11px;font-weight:700;text-align:center}
.sm-map{flex:1;position:relative;min-height:0;overflow:hidden}.sm-map canvas{position:absolute;inset:0;width:100%;height:100%;cursor:pointer}
.sm-leg{position:absolute;left:10px;top:10px;background:#0b111bdd;border:1px solid #1d2838;border-radius:6px;padding:6px 10px;font-size:12px;line-height:1.75;pointer-events:none}
.sm-leg i{display:inline-block;width:18px;height:4px;vertical-align:middle;margin-right:6px;border-radius:2px}
.sm-dock{position:absolute;left:10px;right:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end;pointer-events:none}
.sm-dock>*{pointer-events:auto}
.sm-fc{background:#0d1522ee;border:2px solid #24563d;border-radius:8px;padding:5px 9px;cursor:pointer;min-width:130px;user-select:none}
.sm-fc:hover{border-color:#3fdf8f88}.sm-fc.on{border-color:#3fdf8f;background:#10261bee;box-shadow:0 0 12px #3fdf8f66}
.sm-fc .nm{font-weight:600;color:#3fdf8f}.sm-fc .sub{font-size:11px;color:#8b9bb0}.sm-fc .sub.lk{color:#ffb35a}
.sm-fc .gear{float:right;margin-left:8px;color:#9fb3cc;padding:0 4px;border-radius:3px}.sm-fc .gear:hover{background:#1d2838;color:#fff}
.sm-hint{width:100%;font-size:12px;color:#9fe8c0;text-shadow:0 1px 3px #000;pointer-events:none}
.sm-card{position:absolute;width:350px;max-height:calc(100% - 20px);overflow-y:auto;background:#0b111bf4;border:1px solid #2a3a52;border-radius:8px;padding:10px 12px 12px;box-shadow:0 6px 28px #000c;z-index:2}
.sm-card h3{margin:0 24px 6px 0;font-size:15px}.sm-card h4{margin:10px 0 4px;font-size:12px;color:#9fb3cc;font-weight:600;letter-spacing:1px}
.sm-card a,.sm-box a,.sm-tip a{color:#7fb8ff}
.sm-x{position:absolute;right:6px;top:3px;background:none;border:0;color:#8b9bb0;font-size:20px;cursor:pointer;line-height:1}.sm-x:hover{color:#fff}
.sm-row{display:flex;align-items:center;gap:7px;padding:2px 0}.sm-dot{width:10px;height:10px;border-radius:50%;flex:none}
.sm-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:0}.sm-kv dt{color:#8b9bb0}.sm-kv dd{margin:0}
.sm-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.sm-warn{color:#ffb35a;font-size:12px;margin-top:6px}.sm-bad{color:#ff6a5a}.sm-good{color:#5fd39a}.sm-ev{color:#c9a7ff}
.sm-log{font-size:12px;line-height:1.55;color:#aab7c8}.sm-log div{border-bottom:1px solid #121b29;padding:2px 0}
.sm-modal{position:fixed;inset:0;background:rgba(3,6,10,.78);display:flex;align-items:center;justify-content:center;z-index:9}
.sm-box{background:#0b111b;border:1px solid #2a3a52;border-radius:8px;max-width:760px;width:calc(100% - 32px);max-height:86vh;overflow-y:auto;padding:16px 18px}
.sm-box.sm-sm{max-width:460px}
.sm-box h3{margin:0 0 10px}.sm-bt{border:1px solid #1d2838;border-radius:6px;padding:8px 10px;margin-bottom:10px}
.sm-fl{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center;padding:6px 8px;border:1px solid #1d2838;border-radius:6px;margin-bottom:6px;background:#0d1522}
.sm-fl .nm{font-weight:600}.sm-fl .sub{grid-column:1/3;color:#8b9bb0;font-size:12px}
.sm-opt{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:6px}
.sm-seg{display:inline-flex;flex-wrap:wrap;border:1px solid #2a3a52;border-radius:6px;overflow:hidden}
.sm-seg button{background:#0d1522;color:#cfd8e3;border:0;border-right:1px solid #2a3a52;padding:5px 11px;cursor:pointer;font:inherit}
.sm-seg button:last-child{border-right:0}.sm-seg button:hover:not(:disabled){background:#15233a}.sm-seg button.on{background:#1f6b48;color:#fff}.sm-seg button:disabled{opacity:.4;cursor:not-allowed}
.sm-tog{background:#0d1522;color:#cfd8e3;border:1px solid #2a3a52;border-radius:6px;padding:5px 11px;cursor:pointer;font:inherit}
.sm-tog::before{content:'';display:inline-block;width:11px;height:11px;border:1px solid #6b7a90;border-radius:3px;margin-right:6px;vertical-align:-1px}
.sm-tog.on{border-color:#3fdf8f;color:#fff}.sm-tog.on::before{background:#3fdf8f;border-color:#3fdf8f;box-shadow:inset 0 0 0 2px #0d1522}
.sm-npc{display:flex;gap:14px;align-items:flex-start;margin:4px 0 12px}
.sm-ava{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;flex:none;border:2px solid;background:#121b29}
.sm-say{flex:1;background:#121b29;border:1px solid #1d2838;border-radius:8px;padding:8px 12px;line-height:1.75}
.sm-say .who{font-weight:600;margin-bottom:2px}.sm-say .who span{color:#8b9bb0;font-weight:400;margin-left:6px;font-size:12px}
table.sm-t{border-collapse:collapse;width:100%;font-size:12px;margin-top:6px}table.sm-t td,table.sm-t th{border-bottom:1px solid #1a2433;padding:3px 6px;text-align:right}table.sm-t th:first-child,table.sm-t td:first-child{text-align:left}
.sm-tip{position:absolute;right:10px;top:10px;width:300px;background:#0b111bf4;border:1px solid #2a3a52;border-left:3px solid #ffb35a;border-radius:8px;padding:10px 12px;box-shadow:0 6px 28px #000c;z-index:3;line-height:1.65;animation:smTipIn .35s ease-out}
.sm-tip h4{margin:0 22px 4px 0;font-size:14px;color:#ffb35a}.sm-tip p{margin:4px 0}.sm-tip label{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:#9fb3cc;cursor:pointer}
@keyframes smTipIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
@media (max-width:760px){.sm-tip{left:8px;right:8px;width:auto}}
.sm-pick,.sm-acts{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--cw,160px),1fr));gap:8px;margin:6px 0}
.sm-pc{position:relative;text-align:left;background:#0d1522;border:1px solid #2a3a52;border-radius:8px;padding:9px 11px;color:#cfd8e3;cursor:pointer;font:inherit;display:flex;flex-direction:column;gap:3px;line-height:1.5}
.sm-pc:hover:not(:disabled){border-color:#3fdf8f88;background:#111d2e}
.sm-pc.on{border-color:#3fdf8f;background:#10261b;box-shadow:0 0 10px #3fdf8f44}.sm-pc.on::after{content:'✓';position:absolute;right:9px;top:7px;color:#3fdf8f;font-weight:700}
.sm-pc:disabled{opacity:.45;cursor:not-allowed}.sm-pc.done{opacity:.75;cursor:default;border-color:#24563d}
.sm-pc b{font-size:14px;color:#fff;padding-right:16px}.sm-pc .d{font-size:12px;color:#8b9bb0}.sm-pc .k{font-size:12px;color:#9fe8c0}.sm-pc .w{font-size:12px;color:#ffb35a}
.sm-pc.go{border-color:#3fdf8f66}
@media (max-width:760px){.sm-card{left:8px!important;right:8px;width:auto;top:auto!important;bottom:8px;max-height:62%}.sm-leg{font-size:11px;line-height:1.5}}
`;
const smuEsc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const smuShip = (n) => smuN(n * smRep());   // 艦數：星圖存的是圖示數，顯示時和戰場一樣乘上每個圖示代表的艘數
const smuN = (n) => (typeof fmtN === 'function' ? fmtN(Math.round(n)) : String(Math.round(n)));
// 和玩家的關係：自己、友軍（同陣營）、敵軍（交戰中）、中立／停戰
function smuRel(S, f) { return f.pl ? 'own' : f.fac === S.pl.fac ? 'ally' : smAtWar(S, S.pl.fac, f.fac) ? 'enemy' : 'neutral'; }
// 看得到的單位：自己和友軍一定看得到；其他的要這一週有那個星系的情報
function smuSees(S, f) { const r = smuRel(S, f); if (r === 'own' || r === 'ally') return true; const I = S.pl.intel && S.pl.intel[f.sys]; return !!I && I.t === S.turn; }

// ───── 遊戲內的對話框（不用瀏覽器的 alert／confirm）─────
// 選項列：smuSeg('id', [[值, 文字, 停用?, 提示]], 目前值)；讀值：smuVal('id')
function smuSeg(id, opts, cur) { return `<div class="sm-seg" id="${id}" data-val="${smuEsc(cur)}">${opts.map(([v, t, off, tip]) => `<button type="button" data-v="${smuEsc(v)}" class="${String(v) === String(cur) ? 'on' : ''}" ${off ? 'disabled' : ''} ${tip ? `title="${smuEsc(tip)}"` : ''}>${t}</button>`).join('')}</div>`; }
// 卡片選項（單選，讀值同 smuVal）：smuPick('id', [{ v, name, desc, info, warn, off }], 目前值, 卡片最小寬度)
const smuPc = (o) => `<b>${o.name}</b>${o.desc ? `<span class="d">${o.desc}</span>` : ''}${o.info ? `<span class="k">${o.info}</span>` : ''}${o.warn ? `<span class="w">${o.warn}</span>` : ''}`;
function smuPick(id, opts, cur, w) { return `<div class="sm-pick" id="${id}" data-val="${smuEsc(cur)}"${w ? ` style="--cw:${w}px"` : ''}>${opts.map((o) => `<button type="button" class="sm-pc ${String(o.v) === String(cur) ? 'on' : ''}" data-v="${smuEsc(o.v)}" ${o.off ? 'disabled' : ''}>${smuPc(o)}</button>`).join('')}</div>`; }
// 卡片按鈕（按了就執行）：smuActs([{ id 或 data, name, desc, info, warn, off, cls }], 卡片最小寬度)
function smuActs(opts, w) { return `<div class="sm-acts"${w ? ` style="--cw:${w}px"` : ''}>${opts.map((o) => `<button type="button" class="sm-pc ${o.cls || ''}" ${o.id ? `id="${o.id}"` : ''} ${o.data || ''} ${o.off ? 'disabled' : ''}>${smuPc(o)}</button>`).join('')}</div>`; }
function smuTog(id, on, text) { return `<button type="button" class="sm-tog ${on ? 'on' : ''}" id="${id}">${text}</button>`; }
const smuVal = (id) => { const e = gEl(id); return e ? e.dataset.val : null; };
const smuOn = (id) => { const e = gEl(id); return !!e && e.classList.contains('on'); };
function smuBindUi(root, onSeg) {
  root.querySelectorAll('.sm-seg, .sm-pick').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => { if (b.disabled) return; g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); g.dataset.val = b.dataset.v; if (onSeg) onSeg(g.id, b.dataset.v); })));
  root.querySelectorAll('.sm-tog').forEach((b) => (b.onclick = () => b.classList.toggle('on')));
}
function smuModal(html, cls) { const old = gEl('sm-modal'); if (old) old.remove(); smuSheetGone(old); const d = document.createElement('div'); d.className = 'sm-modal'; d.id = 'sm-modal'; d.innerHTML = `<div class="sm-box ${cls || ''}">${html}</div>`; gEl('g-screen').appendChild(d); smuBindUi(d); return d; }
// 關掉對話框；排隊的下一個（例如回合開始的任務簡報）接著出來
function smuCloseModal() { const d = gEl('sm-modal'); if (d) d.remove(); if (SMU.q.length) SMU.q.shift()(); smuSheetGone(d); if (typeof cclHostCheck === 'function') cclHostCheck(); }   // 從大廳打開的面板：關掉回大廳（caplobby.js）
// 艦長生涯：右側的斜放面板（ccmSheet）關掉後，星圖與星系卡片重新排（capinfo_ui.js 的 ccdRefit）
function smuSheetGone(d) { if (d && d.querySelector('.ccm-sheet') && !document.querySelector('#sm-modal .ccm-sheet') && typeof ccdRefit === 'function') ccdRefit(); }
function smuLater(fn) { if (gEl('sm-modal')) SMU.q.push(fn); else fn(); }
// 確認框：smuAsk('標題', '內容', '確定的文字', 確定後做的事)
function smuAsk(title, body, ok, fn, danger) {
  smuModal(`<h3>${title}</h3><p style="line-height:1.7">${body}</p><div class="sm-btns" style="justify-content:flex-end"><button class="g-btn" id="sm-ask-no">取消</button><button class="g-btn primary" id="sm-ask-ok" ${danger ? 'style="background:#a8452f;border-color:#d0603f"' : ''}>${ok}</button></div>`, 'sm-sm');
  const q = SMU.q; SMU.q = [];   // 確認框不讓排隊的對話框插進來
  gEl('sm-ask-no').onclick = () => { smuCloseModal(); SMU.q = q; };
  gEl('sm-ask-ok').onclick = () => { smuCloseModal(); SMU.q = q; fn(); };
}

// 進入星海生涯：有存檔就接著玩，沒有就開新局
function showStarmap() {
  setPhase('menu'); GAME.replaying = false;
  const S = smLoad();
  if (!S || S.v !== 1) return smuNewDialog();
  if (S.live) { S.live = null; smTurnEnd(S); smSave(S); }   // 真打到一半離開了：剩下的戰鬥用計算的，接著結束這一週
  SMU = { S, sel: new Set(), sys: -1, card: null, view: null, scene: null, hits: [], q: [], raf: 0 };
  smuRender(); smuTurnStart([]);
}
// 難度：敵方勢力的進攻慾望與收入（starmap.js smAiTurn、smEconomy）、艦長任務的敵人等級
const SMU_DIFF = [
  { name: '簡單', desc: '敵軍比較保守，收入也少一點。', info: '敵軍進攻 ×0.75・收入 −15%・艦長任務敵人弱一級' },
  { name: '普通', desc: '標準的局勢。', info: '敵軍進攻 ×1・收入 ±0' },
  { name: '困難', desc: '敵軍積極進攻，家底更厚。', info: '敵軍進攻 ×1.25・收入 +15%・艦長任務敵人強一級' },
  { name: '殘酷', desc: '敵軍傾巢而出，一步都不能錯。', info: '敵軍進攻 ×1.6・收入 +30%・艦長任務敵人強兩級' },
];
function smuNewDialog() {
  const meta = smMetaLoad();
  overlay(`<style>${SMU_CSS}</style><div class="g-wrap sp-wrap"><div class="g-head"><h2>星海生涯</h2><span class="crumb">開新局</span><span class="g-sp"></span><button class="g-btn" id="sm-back">← 返回</button></div>
    <p class="g-dim">回合制的星圖：每一回合是一週。下令移動艦隊，結束回合後所有勢力同時行動，碰上敵軍就開戰。立下戰功、完成上級與派系交辦的任務來升遷，你的選擇決定局勢與結局。</p>
    <h3 style="margin:16px 0 4px">開局身分 <span class="g-dim" style="font-size:12px;font-weight:400">已玩 ${meta.runs} 局</span></h3>
    ${smuPick('sm-start', Object.entries(SM_STARTS).map(([k, X]) => { const on = meta.unlock.includes(k); return { v: k, name: on ? X.name : `🔒 ${X.name}`, desc: X.desc, info: X.gov >= 0 ? '政務線：轄區建設、派系支持' : X.mil === 0 ? '軍職：從最基層開始' : `軍職・起始戰功 ${X.merit}`, warn: on ? '' : `解鎖：在任何一局當上${X.need}`, off: !on }; }), 'cap', 170)}
    <h3 style="margin:16px 0 4px">難度</h3>
    ${smuPick('sm-diff', SMU_DIFF.map((D, i) => ({ v: i, name: D.name, desc: D.desc, info: D.info })), 1, 170)}
    <div style="height:12px"></div>
    <button class="g-btn primary" id="sm-go">開始</button></div>`);
  smuBindUi(gEl('g-screen'));
  gEl('sm-back').onclick = () => { GAME.spMode = null; showSingle(); };
  gEl('sm-go').onclick = () => {
    const S = smNewGame({ seed: (Math.random() * 1e9) >>> 0, diff: +smuVal('sm-diff'), start: smuVal('sm-start') || 'cap' });
    smSave(S); SMU = { S, sel: new Set(), sys: -1, card: null, view: null, scene: null, hits: [], q: [], raf: 0 }; smuRender(); smuTurnStart([]);
  };
}
function smuRender() {
  const S = SMU.S, c = smCounts(S);
  SMU.q = []; SMU.scene = null;
  const nMis = S.pl.missions.filter((M) => M.state === 'open' || M.state === 'offer').length, nOffer = S.pl.missions.filter((M) => M.state === 'offer').length;
  overlay(`<style>${SMU_CSS}</style><div class="sm-wrap">
    <div class="sm-top"><h2>星海生涯</h2><span class="sm-chip">第 ${S.turn} 週</span><span class="sm-chip" id="sm-money">資金 ${smuN(S.pl.money)}</span><span class="sm-chip">${smRankName(S)}</span><span class="sm-chip">戰功 ${Math.round(S.pl.merit)}${S.pl.gov < 0 && S.pl.mil < 4 ? `／${SM_MIL_MERIT[S.pl.mil + 1]}` : ''}</span><span class="sm-chip">信任 ${Math.round(S.pl.trust)}</span>
      ${[SM_A, SM_E, SM_P, SM_N].map((f) => `<span class="sm-chip"><i style="background:${SM_FAC[f].col}"></i>${SM_FAC[f].name} ${c[f]}</span>`).join('')}
      <span class="sm-chip">${smAtWar(S, SM_A, SM_E) ? '聯盟與帝國交戰中' : '聯盟與帝國停戰中'}</span>
      <span class="sm-btnbar"><button class="g-btn" id="sm-mis">任務${nMis ? `<span class="sm-badge">${nOffer ? nOffer + ' 新' : nMis}</span>` : ''}</button><button class="g-btn" id="sm-car">生涯</button><button class="g-btn" id="sm-tech">科技</button><button class="g-btn" id="sm-rep">戰報</button><button class="g-btn" id="sm-logb">日誌</button><button class="g-btn primary" id="sm-end">結束回合</button><button class="g-btn" id="sm-quit">離開</button></span></div>
    <div class="sm-map" id="sm-map"><canvas id="sm-cv"></canvas>
      <div class="sm-leg">${['own', 'ally', 'enemy'].map((k) => `<div><i style="background:${SMU_REL[k].col}"></i>${SMU_REL[k].name}</div>`).join('')}<div class="g-dim">箭頭：下一回合的動向・⚔ 預計交戰</div></div>
      <div class="sm-dock" id="sm-dock"></div><div class="sm-card" id="sm-card" hidden></div></div></div>`);
  gEl('sm-quit').onclick = () => { if (SMU.anim) return; smSave(S); window.removeEventListener('resize', smuResize); GAME.spMode = null; showSingle(); };
  gEl('sm-end').onclick = () => (S.pl.status === '終結' ? toast('生涯已經結束') : smuEndTurn());
  gEl('sm-car').onclick = smuCareer;
  gEl('sm-tech').onclick = smuTech;
  gEl('sm-mis').onclick = smuMissionList;
  gEl('sm-logb').onclick = smuLog;
  gEl('sm-rep').onclick = () => smuReports(S.reports.slice(-12).reverse(), '最近的戰報');
  const cv = gEl('sm-cv');
  cv.onclick = (e) => { const r = cv.getBoundingClientRect(), id = smuHit(e.clientX - r.left, e.clientY - r.top); if (id >= 0) smuOpen('sys', id); else smuOpen(null); };
  window.removeEventListener('resize', smuResize); window.addEventListener('resize', smuResize);
  smuDock(); smuDraw(); smuCardRender();
  if (!SMU.raf) SMU.raf = requestAnimationFrame(smuLoop);
}
function smuResize() { smuDraw(); smuCardPlace(); }
function smuLoop(ts) { if (!gEl('sm-cv') || !SMU.S) { SMU.raf = 0; return; } smuDraw(ts); SMU.raf = requestAnimationFrame(smuLoop); }
// 回合開始：戰報 → 政務邀請 → 新任務的簡報（一個接一個）
function smuTurnStart(reps) {
  const S = SMU.S;
  if (reps.length) smuLater(() => smuReports(reps, `第 ${S.turn - 1} 週的戰報`));
  if (S.pl.offerGov && !S.pl.offerAsked) { S.pl.offerAsked = true; smSave(S); smuLater(smuOfferGov); }
  for (const M of S.pl.missions.filter((x) => !x.brief && (x.state === 'open' || x.state === 'offer'))) smuLater(() => smuBrief(M));
  smuLater(smuResupplyTip);
}

// ───── 側邊提示（玩家可以勾「不再顯示」；記在 STORE，跨存檔）─────
const SMU_TIP_STORE = 'fleet.smtips';
function smuTipOff(k) { try { return !!(JSON.parse(STORE.getItem(SMU_TIP_STORE) || '{}') || {})[k]; } catch (e) { return false; } }
function smuTipSetOff(k) { try { const o = JSON.parse(STORE.getItem(SMU_TIP_STORE) || '{}') || {}; o[k] = 1; STORE.setItem(SMU_TIP_STORE, JSON.stringify(o)); } catch (e) { /* 只在本次 */ } }
function smuTip(k, title, html) {
  const map = gEl('sm-map'); if (!map || smuTipOff(k)) return;
  const old = gEl('sm-tip'); if (old) old.remove();
  const el = document.createElement('div'); el.className = 'sm-tip'; el.id = 'sm-tip';
  el.innerHTML = `<button class="sm-x" id="sm-tip-x" title="關閉">×</button><h4>${title}</h4>${html}<label><input type="checkbox" id="sm-tip-off">不再顯示這個提示</label>`;
  map.appendChild(el);
  gEl('sm-tip-x').onclick = () => { if (gEl('sm-tip-off').checked) smuTipSetOff(k); el.remove(); };
  gEl('sm-tip-off').onchange = (e) => { if (e.target.checked) smuTipSetOff(k); else try { const o = JSON.parse(STORE.getItem(SMU_TIP_STORE) || '{}') || {}; delete o[k]; STORE.setItem(SMU_TIP_STORE, JSON.stringify(o)); } catch (er) { /* 只在本次 */ } };
  el.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); smuOpen('sys', +b.dataset.goto); }));
}
// 艦隊受損：告訴玩家怎麼補充（最近的己方船塢、要多少錢）。每次開啟星海生涯最多提示一次
function smuResupplyTip() {
  const S = SMU.S; if (!S || SMU.tipRs || smuTipOff('resupply') || S.pl.status === '終結') return;
  const hurt = S.fleets.filter((f) => f.pl && !f.cap && !f.loan && smShips(f.comp) > 0 && smShips(f.comp) < smShips(f.init) * 0.85).sort((a, b) => smShips(a.comp) / smShips(a.init) - smShips(b.comp) / smShips(b.init));
  if (!hurt.length) return;
  SMU.tipRs = true;
  const f = hurt[0], yards = smOwned(S, S.pl.fac).filter((s) => (s.cap || s.mega.dock) && !s.sg).sort((a, b) => smHop(S, f.sys, a.id) - smHop(S, f.sys, b.id)), y = yards[0], cost = smResupplyCost(S, f).cost;
  const where = !y ? '<p class="sm-bad">目前沒有能用的己方船塢（都失守或被圍城了）。</p>'
    : y.id === f.sys ? `<p>它現在就停在船塢 <a href="#" data-goto="${y.id}">${smuEsc(y.name)}</a>：點艦隊卡片上的「補充」就好。</p>`
    : `<p>最近的船塢：<a href="#" data-goto="${y.id}">${smuEsc(y.name)}</a>（${smHop(S, f.sys, y.id)} 跳）。</p>`;
  smuTip('resupply', '艦隊受損了', `<p><b>${smuEsc(f.name)}</b> 剩 ${smuShip(smShips(f.comp))}／${smuShip(smShips(f.init))} 艘。</p>
    <p>補充方法：把艦隊開到己方的船塢星系（星圖上名稱旁有 ⚓ 的首都或大型船塢），在艦隊卡片按「補充」，用你的資金補回原本的編成。被圍城的船塢不能用。</p>${where}
    <p class="g-dim">補滿要 ${smuN(cost)}（你有 ${smuN(S.pl.money)}）。錢不夠的話能補多少算多少。打贏、留在戰場的一方戰後會修回 25% 損失；撤退的不會。</p>`);
}

// ───── 星圖 ─────
// 星圖座標（0～100 × 0～60）→ 畫面
function smuXY(s) { const V = SMU.view; return [V.ox + s.x * V.k, V.oy + s.y * V.k]; }
function smuHit(x, y) {
  for (const h of SMU.hits) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.sys;   // 艦隊標籤
  const S = SMU.S; let best = -1, bd = 24; for (const s of S.sys) { const [px, py] = smuXY(s), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = s.id; } } return best;
}
// 這一週的星圖內容：每個星系的艦隊標籤、下一回合的移動箭頭、預計交戰的地方（狀態改變時重算）
function smuScene() {
  if (SMU.scene) return SMU.scene;
  const S = SMU.S, tags = {}, arrows = new Map(), end = {}, clash = {};
  const ships = (L) => L.reduce((a, f) => a + smShips(f.comp), 0);
  for (const s of S.sys) {
    const at = S.fleets.filter((f) => f.sys === s.id && smShips(f.comp) > 0), T = [];
    const own = at.filter((f) => f.pl);
    if (own.length) T.push({ rel: 'own', tx: own.map((f) => (f.cap ? '特戰' : smuShip(smShips(f.comp)))).join('＋') });
    const ally = at.filter((f) => !f.pl && !f.cap && f.fac === S.pl.fac);
    if (ally.length) T.push({ rel: 'ally', tx: `${ally.length > 1 ? ally.length + '隊 ' : ''}${smuShip(ships(ally))}` });
    const neu = at.filter((f) => !f.cap && smuRel(S, f) === 'neutral' && smuSees(S, f));
    if (neu.length) T.push({ rel: 'neutral', tx: smuShip(ships(neu)) });
    const IN = smIntelOf(S, s.id);
    if (IN.known && IN.I.en > 0) T.push({ rel: 'enemy', tx: IN.exact ? smuShip(IN.I.en) : `${IN.text}${IN.age ? `・${IN.age}週前` : ''}`, old: IN.age > 0 });
    else if (!IN.known && s.owner !== S.pl.fac) T.push({ rel: 'unknown', tx: '?' });
    tags[s.id] = T;
  }
  // 移動箭頭：同一條路線、同一種關係的艦隊合成一支
  for (const f of S.fleets) {
    if (smShips(f.comp) <= 0 || !smuSees(S, f)) continue;
    const rel = smuRel(S, f), to = f.path ? f.path[f.path.length - 1] : f.sys;
    if (!f.cap) (end[to] = end[to] || []).push({ f, rel });
    if (!f.path) continue;
    const key = rel + '|' + f.path.join(',');
    const A = arrows.get(key) || { rel, path: f.path, n: 0, ships: 0, names: [], lock: false, exact: true };
    A.n++; A.ships += smShips(f.comp); A.names.push(f.cap ? '特戰小隊' : f.name); A.lock = A.lock || !!f.lock;
    if (rel === 'enemy' || rel === 'neutral') { const I = S.pl.intel[f.sys]; if (!I || I.q < 2) A.exact = false; }
    arrows.set(key, A);
  }
  for (const A of arrows.values()) A.tx = A.rel === 'own' ? (A.n > 1 ? `${A.n} 支` : A.names[0]) : A.exact ? smuShip(A.ships) : SM_INTEL[smForceLv(S, A.path[0], A.ships)];
  // 預計交戰：移動後同一個星系有我方陣營和敵軍；或我方陣營的艦隊開進可以進攻的星系；或敵軍開進我方陣營的星系
  for (const s of S.sys) {
    const L = end[s.id] || [], mine = L.filter((o) => o.rel === 'own' || o.rel === 'ally'), en = L.filter((o) => o.rel === 'enemy');
    const IN = smIntelOf(S, s.id), stayEn = IN.known && IN.I.en > 0 && !en.length && IN.age === 0 && S.fleets.some((f) => f.sys === s.id && !f.path && smAtWar(S, S.pl.fac, f.fac) && smShips(f.comp) > 0);
    const sieging = s.sg && s.sg.f === S.pl.fac && !mine.some((o) => o.f.path && o.f.path[o.f.path.length - 1] === s.id);   // 已經在圍城：虛線圈表示，不算交戰
    if (mine.length && (en.length || stayEn || (smHostileSys(S, S.pl.fac, s) && !sieging))) clash[s.id] = mine.some((o) => o.rel === 'own') ? 'own' : 'ally';
    else if (en.length && s.owner === S.pl.fac && en.some((o) => o.f.path)) clash[s.id] = 'threat';
  }
  return (SMU.scene = { tags, arrows: [...arrows.values()], clash });
}
function smuDraw(ts) {
  const cv = gEl('sm-cv'); if (!cv || !SMU.S) return;
  const S = SMU.S, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, t = (ts || performance.now()) / 1000;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.min((W - 40) / 100, (H - 120) / 60); SMU.view = { k, ox: (W - 100 * k) / 2, oy: Math.max(20, (H - 60 * k) / 2 - 20) };
  const SC = smuScene(); SMU.hits = [];
  g.fillStyle = '#070b12'; g.fillRect(0, 0, W, H);
  // 勢力範圍（淡色光暈）
  for (const s of S.sys) { if (s.owner === SM_N) continue; const [x, y] = smuXY(s), r = k * 9, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, SM_FAC[s.owner].col + '2a'); gr.addColorStop(1, SM_FAC[s.owner].col + '00'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  // 航道
  g.lineWidth = 1.2; g.strokeStyle = '#243247';
  for (const [a, b] of S.edges) { const [x1, y1] = smuXY(S.sys[a]), [x2, y2] = smuXY(S.sys[b]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  // 下一回合的動向
  const OFF = { own: 0, ally: 5, enemy: -5, neutral: 9 };
  for (const A of SC.arrows) smuArrow(g, A, OFF[A.rel], t);
  if (SMU.anim) for (const A of SMU.anim.G) smuMoving(g, A, OFF[A.rel]);
  // 星系
  g.textAlign = 'center';
  for (const s of S.sys) {
    const [x, y] = smuXY(s), r = 5 + s.tier * 1.6, T = SC.tags[s.id], hasOwn = T.some((o) => o.rel === 'own');
    if (hasOwn) { const p = 0.5 + 0.5 * Math.sin(t * 3); g.strokeStyle = `rgba(63,223,143,${0.35 + 0.45 * p})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r + 7 + p * 3, 0, 7); g.stroke(); }
    if (s.id === SMU.sys) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, r + 13, 0, 7); g.stroke(); g.setLineDash([]); }
    if (s.sg) { g.strokeStyle = SM_FAC[s.sg.f].col; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, r + 3, 0, 7); g.stroke(); g.setLineDash([]); }
    g.fillStyle = SM_FAC[s.owner].col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (s.cap) { g.strokeStyle = '#ffe28a'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 1.5, 0, 7); g.stroke(); }
    g.fillStyle = '#cfd8e3'; g.font = '12px sans-serif'; g.fillText(s.name + (s.mega.dock || s.cap ? ' ⚓' : ''), x, y - r - 6);
    // 艦隊標籤：▲ 我／友／敵（艦數或情報等級）
    T.forEach((o, n) => {
      const R = SMU_REL[o.rel], col = R ? R.col : '#59606b', tx = R ? `${R.tag} ${o.tx}` : o.tx;
      g.font = 'bold 11px sans-serif'; const w = g.measureText(tx).width + (R ? 22 : 12), bx = x - w / 2, by = y + r + 7 + n * 18;
      g.globalAlpha = o.old ? 0.6 : 1;
      g.fillStyle = '#0a0f18e6'; smuRRect(g, bx, by, w, 16, 4); g.fill();
      g.strokeStyle = col; g.lineWidth = o.rel === 'own' ? 2.2 : 1.5; smuRRect(g, bx, by, w, 16, 4); g.stroke();
      if (R) { g.fillStyle = col; g.beginPath(); g.moveTo(bx + 6, by + 12); g.lineTo(bx + 10, by + 4); g.lineTo(bx + 14, by + 12); g.closePath(); g.fill(); }
      g.fillStyle = R ? col : '#9aa3ad'; g.textAlign = 'left'; g.fillText(tx, bx + (R ? 18 : 6), by + 12); g.textAlign = 'center';
      g.globalAlpha = 1; SMU.hits.push({ x: bx, y: by, w, h: 16, sys: s.id });
    });
    const wx = smWxNow(S, s); if (wx) { g.font = '13px sans-serif'; g.fillStyle = '#ffd36a'; g.fillText({ solar: '☀', ion: '≋', grav: '◎' }[wx], x - r - 10, y - r + 2); }
    const cl = SC.clash[s.id], pend = S.pend && S.pend.some((b) => b.sys === s.id && !b.done);
    if (cl || pend) {
      const p = 0.5 + 0.5 * Math.sin(t * 4), bx = x + r + 12, col = cl === 'threat' ? '#ff4d4d' : '#ffb35a';
      g.fillStyle = col + (p > 0.5 ? 'ff' : 'bb'); g.beginPath(); g.arc(bx, y - 2, 9, 0, 7); g.fill();
      g.fillStyle = '#111'; g.font = 'bold 12px sans-serif'; g.fillText(cl === 'threat' ? '!' : '⚔', bx, y + 2);
    }
  }
}
// 移動中的艦隊：沿著航線走到終點（或被攔截的星系），後面拖一條軌跡
function smuMoving(g, A, off) {
  const S = SMU.S, N = SMU.anim, col = SMU_REL[A.rel].col;
  const k = Math.min(1, Math.max(0, (performance.now() - N.t0) / N.dur)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const P = A.path.slice(0, A.stop + 1).map((i) => smuXY(S.sys[i])).map(([x, y], i, a) => { const p = a[Math.max(0, i - 1)], q = a[Math.min(a.length - 1, i + 1)], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; return [x - (dy / L) * off, y + (dx / L) * off]; });
  const seg = P.slice(1).map((q, i) => Math.hypot(q[0] - P[i][0], q[1] - P[i][1])), tot = seg.reduce((a, b) => a + b, 0) || 1;
  let d = e * tot, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
  const f = Math.min(1, d / (seg[i] || 1)), x = P[i][0] + (P[i + 1][0] - P[i][0]) * f, y = P[i][1] + (P[i + 1][1] - P[i][1]) * f, an = Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]);
  // 軌跡
  g.lineCap = 'round'; g.strokeStyle = col + '88'; g.lineWidth = 3; g.beginPath(); g.moveTo(...P[0]); for (let j = 1; j <= i; j++) g.lineTo(...P[j]); g.lineTo(x, y); g.stroke();
  // 艦隊（箭頭形）
  g.save(); g.translate(x, y); g.rotate(an);
  g.shadowColor = col; g.shadowBlur = 14; g.fillStyle = col; g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -8); g.lineTo(-4, 0); g.lineTo(-8, 8); g.closePath(); g.fill();
  g.shadowBlur = 0; g.strokeStyle = '#000'; g.lineWidth = 1.2; g.stroke(); g.restore();
  g.textAlign = 'center'; g.font = 'bold 11px sans-serif';
  if (A.tx) { g.fillStyle = '#000b'; const w = g.measureText(A.tx).width + 8; g.fillRect(x - w / 2, y - 25, w, 14); g.fillStyle = col; g.fillText(A.tx, x, y - 14); }
  if (k >= 1 && A.stop < A.path.length - 1) { g.fillStyle = '#ff4d4d'; g.font = 'bold 13px sans-serif'; g.fillText('被攔截！', x, y + 24); }
}
function smuRRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// 一支移動箭頭：沿著航線（兩端讓開星系），流動的虛線＋箭頭＋艦數
function smuArrow(g, A, off, t) {
  const S = SMU.S, col = SMU_REL[A.rel].col, P = A.path.map((i) => { const s = S.sys[i]; return [...smuXY(s), 5 + s.tier * 1.6]; });
  const pts = [];
  for (let i = 0; i < P.length; i++) {
    const [x, y] = P[i], a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    pts.push([x - (dy / L) * off, y + (dx / L) * off]);
  }
  const cut = (p, q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; return [p[0] + (dx / L) * d, p[1] + (dy / L) * d]; };
  pts[0] = cut(pts[0], pts[1], P[0][2] + 6); const n = pts.length - 1; pts[n] = cut(pts[n], pts[n - 1], P[n][2] + 10);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#000a'; g.lineWidth = A.rel === 'own' ? 6 : 5; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.stroke();
  g.strokeStyle = col + '66'; g.lineWidth = A.rel === 'own' ? 3.5 : 2.6; g.stroke();
  g.strokeStyle = col; g.setLineDash([8, 7]); g.lineDashOffset = -t * 22; g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
  const [ex, ey] = pts[n], [px, py] = pts[n - 1], an = Math.atan2(ey - py, ex - px), hl = A.rel === 'own' ? 13 : 11;
  g.fillStyle = col; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - hl * Math.cos(an - 0.45), ey - hl * Math.sin(an - 0.45)); g.lineTo(ex - hl * Math.cos(an + 0.45), ey - hl * Math.sin(an + 0.45)); g.closePath(); g.fill();
  g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
  // 標籤放在第一段的中間
  const mx = (pts[0][0] + pts[1][0]) / 2, my = (pts[0][1] + pts[1][1]) / 2;
  g.font = '11px sans-serif'; const tx = A.tx, w = g.measureText(tx).width + 8;
  g.fillStyle = '#0a0f18dd'; g.fillRect(mx - w / 2, my - 8, w, 15); g.fillStyle = col; g.textAlign = 'center'; g.fillText(tx, mx, my + 4);
}

// ───── 艦隊列（左下）：點一下選取，再點星系下令；⚙ 看艦隊詳情 ─────
function smuDock() {
  const S = SMU.S, el = gEl('sm-dock'); if (!el) return;
  const fls = smPlFleets(S), n = fls.filter((f) => SMU.sel.has(f.id)).length;
  el.innerHTML = (n ? `<div class="sm-hint">已選 ${n} 支：點星圖上的星系下令移動（再點艦隊取消選取）</div>` : fls.length ? '<div class="sm-hint" style="color:#8b9bb0">點艦隊選取，再點星系下令移動</div>' : '') + fls.map((f) => {
    const ord = f.path ? `→ ${S.sys[f.path[f.path.length - 1]].name}${f.lock ? '・會開戰' : ''}` : '待命';
    return `<div class="sm-fc ${SMU.sel.has(f.id) ? 'on' : ''}" data-sel="${f.id}"><span class="gear" data-fl="${f.id}" title="艦隊詳情">⚙</span><div class="nm">${smuEsc(f.name)}</div>
      <div class="sub">${f.cap ? `特戰艦 ${smShips(f.comp)} 艘` : `${smuShip(smShips(f.comp))} 艘`}${f.loan ? '・任務支援' : ''}・${smuEsc(S.sys[f.sys].name)}</div><div class="sub ${f.lock ? 'lk' : ''}">${ord}</div></div>`;
  }).join('');
  el.querySelectorAll('[data-sel]').forEach((b) => (b.onclick = (e) => {
    const id = +b.dataset.sel;
    if (e.target.dataset.fl) return smuOpen('fleet', id);
    if (SMU.sel.has(id)) SMU.sel.delete(id); else SMU.sel.add(id);
    smuDock(); if (SMU.card && SMU.card.k === 'sys') smuCardRender();
  }));
}
// ───── 卡片：點星系才出現（或艦隊詳情）─────
function smuOpen(k, id) { SMU.card = k ? { k, id } : null; SMU.sys = k === 'sys' ? id : -1; smuCardRender(); }
function smuCardRender() {
  const S = SMU.S, el = gEl('sm-card'); if (!el) return;
  const C = SMU.card;
  if (!C) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  if (C.k === 'fleet') { const f = S.fleets.find((x) => x.id === C.id); if (!f) { SMU.card = null; el.hidden = true; return; } el.innerHTML = '<button class="sm-x" id="sm-cx">×</button>' + smuFleetCard(f); }
  else el.innerHTML = '<button class="sm-x" id="sm-cx">×</button>' + smuSysPanel(S.sys[C.id]);
  smuBindUi(el, (id, v) => { if (id.startsWith('sm-rt')) { S.fleets.find((f) => f.id === +id.slice(5)).retreat = +v / 100; smSave(S); } });
  smuBindCard(el);
  smuCardPlace();
}
// 放在星系旁邊（右邊放不下就放左邊）
function smuCardPlace() {
  const el = gEl('sm-card'), mp = gEl('sm-map'); if (!el || el.hidden || !SMU.card || !SMU.view) return;
  const S = SMU.S, sid = SMU.card.k === 'sys' ? SMU.card.id : (S.fleets.find((f) => f.id === SMU.card.id) || {}).sys; if (sid == null) return;
  const [x, y] = smuXY(S.sys[sid]), W = mp.clientWidth, H = mp.clientHeight, w = el.offsetWidth, h = el.offsetHeight;
  const left = x + 80 + w < W - 8 ? x + 80 : Math.max(8, x - 80 - w);
  el.style.left = left + 'px'; el.style.top = Math.max(8, Math.min(H - h - 8, y - 70)) + 'px';
}
function smuBindCard(el) {
  const S = SMU.S;
  const on = (id, fn) => { const b = gEl(id); if (b) b.onclick = fn; };
  on('sm-cx', () => smuOpen(null));
  on('sm-move', smuMove);
  on('sm-buy', () => { const w = smBuyIntel(S, SMU.sys); if (w) toast(w, 'bad'); smuRefresh(); });
  on('sm-scout', () => { const w = smScout(S, SMU.sys); if (w) toast(w, 'bad'); smuRefresh(); });
  on('sm-raid', () => smuRaid(S.sys[SMU.sys]));
  on('sm-as-cmd', () => smuAssault('cmd'));
  on('sm-as-watch', () => smuAssault('watch'));
  on('sm-assault', () => { const s = S.sys[SMU.sys]; s.assault = s.assault === S.turn ? -1 : S.turn; smuRefresh(); });
  on('sm-selhere', () => { smPlFleets(S).filter((f) => f.sys === SMU.sys).forEach((f) => SMU.sel.add(f.id)); smuDock(); smuCardRender(); });
  el.querySelectorAll('[data-bld]').forEach((b) => (b.onclick = () => { if (smBuild(S, SMU.sys, b.dataset.bld)) { smSave(S); const c = SMU.card; smuRender(); SMU.card = c; SMU.sys = c.id; smuCardRender(); } }));
  el.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); smuOpen('sys', +b.dataset.goto); }));
  el.querySelectorAll('[data-fl]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); smuOpen('fleet', +b.dataset.fl); }));
  el.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => { smCancel(S, S.fleets.find((f) => f.id === +b.dataset.cancel)); smuRefresh(); }));
  el.querySelectorAll('[data-op]').forEach((b) => (b.onclick = () => smuOp(S.pl.missions.find((M) => M.id === +b.dataset.op))));
  el.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = () => { const n = smResupply(S, S.fleets.find((f) => f.id === +b.dataset.rs)); if (n) toast(`補充了 ${smuShip(n)} 艘`); smuRefresh(); }));
}
function smuFleetCard(f) {
  const S = SMU.S, s = S.sys[f.sys], rs = !f.cap && smCanResupply(S, f) ? smResupplyCost(S, f) : null;
  const comp = f.comp.map((n, t) => (n ? `${smShipV()[t].name} ${f.cap ? n : smuShip(n)}` : '')).filter(Boolean).join('、');
  return `<h3 style="color:${SMU_REL.own.col}">${smuEsc(f.name)}${f.loan ? '<span class="g-dim" style="font-size:12px">（任務支援）</span>' : ''}</h3><dl class="sm-kv">
    <dt>位置</dt><dd><a href="#" data-goto="${s.id}">${smuEsc(s.name)}</a></dd>
    <dt>艦數</dt><dd>${f.cap ? `特戰艦 ${smShips(f.comp)} 艘` : `${smuShip(smShips(f.comp))} 艘`}<br><span class="g-dim">${comp}</span></dd>
    <dt>指揮官</dt><dd>${smuEsc(f.cmdr.name)}・Lv ${f.cmdr.lv}</dd>
    <dt>命令</dt><dd>${f.path ? `前往 ${f.path.slice(1).map((i) => smuEsc(S.sys[i].name)).join(' → ')}${f.lock ? '<br><span class="sm-warn">會引發戰鬥，已鎖定</span>' : ''}` : '待命'}</dd></dl>
    ${f.path && !f.lock ? `<div class="sm-btns"><button class="g-btn" data-cancel="${f.id}">取消命令（退回費用）</button></div>` : ''}
    ${f.cap ? '<p class="g-dim">特戰小隊不參加艦隊戰；到目標星系執行艦長任務或地面突襲。</p>' : `<h4>撤退門檻</h4>${smuSeg('sm-rt' + f.id, [0, 10, 20, 30, 40, 50].map((v) => [v, v ? v + '%' : '不撤退']), Math.round(f.retreat * 100))}
    <div class="g-dim" style="margin-top:4px">剩下的比例低於門檻就躍遷撤退。門檻越高，保住越多船，但越容易輸。</div>
    ${rs && rs.cost > 0 ? `<div class="sm-btns"><button class="g-btn" data-rs="${f.id}">補充 ${smuShip(smShips(rs.miss))} 艘（${smuN(rs.cost)}）</button></div>` : ''}`}`;
}
const SMU_BUILD_DESC = { city: '都市等級 +1：人口上限與收入提高。', def: '地面防禦更強，繁榮略升。', gar: '守軍 +60，地面更難攻下。', dock: '可以在這裡補充艦隊（⚓）。', elev: '收入 +15%，繁榮 +8。', radar: '周圍 2 個航道內看得到敵軍艦數。', shield: '地面戰力 ×1.5。' };
function smuSysPanel(s) {
  const S = SMU.S, IN = smIntelOf(S, s.id), I = IN.I, mine = s.owner === S.pl.fac, kn = mine || IN.known;
  const wx = s.wx ? SM_WX[s.wx.k] : null, nx = smWxNext(S, s), wxNow = smWxNow(S, s);
  const kinds = I && I.q >= 1 && I.en > 0 ? I.comp.map((n, t) => (n ? smShipV()[t].name : '')).filter(Boolean).join('、') : '';
  const nb = S.adj[s.id].map((j) => S.sys[j]), risky = nb.filter((t) => { const J = smIntelOf(S, t.id); return J.known && J.I.en > 0; });
  const here = S.fleets.filter((f) => f.sys === s.id && smShips(f.comp) > 0);
  const row = (rel, html) => `<div class="sm-row"><span class="sm-dot" style="background:${SMU_REL[rel].col}"></span><span>${html}</span></div>`;
  const dest = (f) => (f.path ? `<span class="g-dim">→ ${smuEsc(S.sys[f.path[f.path.length - 1]].name)}</span>` : '<span class="g-dim">待命</span>');
  let h = `<h3>${smuEsc(s.name)}${s.cap ? '（首都）' : ''} <span style="color:${SM_FAC[s.owner].col};font-size:13px">${SM_FAC[s.owner].name}</span></h3>`;
  // 駐留的艦隊
  h += '<h4>駐留艦隊</h4>';
  const own = here.filter((f) => f.pl), ally = here.filter((f) => !f.pl && !f.cap && f.fac === S.pl.fac), neu = here.filter((f) => !f.cap && smuRel(S, f) === 'neutral' && smuSees(S, f));
  const rows = [
    ...own.map((f) => row('own', `<a href="#" data-fl="${f.id}">${smuEsc(f.name)}</a> ${f.cap ? `特戰艦 ${smShips(f.comp)} 艘` : `${smuShip(smShips(f.comp))} 艘`} ${dest(f)}`)),
    ...ally.map((f) => row('ally', `${smuEsc(f.name)} ${smuShip(smShips(f.comp))} 艘 ${dest(f)}`)),
    ...neu.map((f) => row('neutral', `${SM_FAC[f.fac].name}・${smuEsc(f.name)} ${smuShip(smShips(f.comp))} 艘 ${dest(f)}`)),
  ];
  if (IN.known && I.en > 0) rows.push(row('enemy', `${I.fac.map((x) => `<span style="color:${SM_FAC[x].col}">${SM_FAC[x].name}</span>`).join('、')} ${IN.text}${IN.exact ? `（${smuShip(I.en)} 艘、${I.nf} 支）` : ''}${IN.age ? `<span class="g-dim">・${IN.age} 週前的情報</span>` : ''}${kinds ? `<br><span class="g-dim">艦種：${kinds}</span>` : ''}`));
  else if (!kn) rows.push(row('enemy', '<span class="g-dim">沒有情報</span>'));
  h += rows.join('') || '<div class="g-dim">無</div>';
  if (own.some((f) => !SMU.sel.has(f.id))) h += '<div class="sm-btns"><button class="g-btn" id="sm-selhere">選取這裡的我方艦隊</button></div>';
  // 下一回合的動向（看得到的單位）
  const vis = S.fleets.filter((f) => f.path && smShips(f.comp) > 0 && smuSees(S, f));
  const inc = vis.filter((f) => f.path[f.path.length - 1] === s.id), out = vis.filter((f) => f.sys === s.id), pass = vis.filter((f) => f.path.slice(1, -1).includes(s.id));
  const mv = (f, tx) => { const rel = smuRel(S, f), nm = rel === 'own' || rel === 'ally' ? smuEsc(f.cap ? '特戰小隊' : f.name) : `${SM_FAC[f.fac].name}艦隊`; return row(rel, `${nm} ${tx}`); };
  const mvRows = [...inc.map((f) => mv(f, `從 ${smuEsc(S.sys[f.sys].name)} 開過來`)), ...out.map((f) => mv(f, `離開，前往 ${smuEsc(S.sys[f.path[f.path.length - 1]].name)}`)), ...pass.map((f) => mv(f, '途經這裡'))];
  const cl = smuScene().clash[s.id];
  h += `<h4>下一回合</h4>${mvRows.join('') || '<div class="g-dim">看得到的單位都沒有動靜</div>'}${cl ? `<div class="sm-warn">${cl === 'threat' ? '⚠ 敵軍來犯，這裡沒有我方艦隊' : '⚔ 預計在這裡交戰'}</div>` : ''}`;
  // 星系資料
  h += `<h4>星系</h4><dl class="sm-kv">
    <dt>星球防禦</dt><dd>${kn ? `守軍 ${smuN(mine ? s.gar : I.gar)}・防衛建築 ${mine ? s.def : I.def}${(mine ? s.mega.shield : I.shield) ? '・行星護盾' : ''}${s.dis > S.turn ? `<br><span class="sm-good">癱瘓中（到第 ${s.dis} 週）</span>` : ''}` : SM_INTEL[0]}</dd>
    <dt>天氣</dt><dd>${wx ? `${wxNow ? `<b>${wx.name}</b>（現在）` : `${wx.name}：${nx} 週後出現`}・每 ${s.wx.per} 週一次、持續 ${s.wx.len} 週<br><span class="g-dim">${wx.desc}</span>` : '穩定'}</dd>
    <dt>經濟</dt><dd>${kn ? `${SM_TIER[mine ? s.tier : I.tier]}・人口 ${mine ? s.pop : I.pop}・繁榮 ${mine ? s.prosp : I.prosp}${mine ? `・收入 ${smuN(smSysIncome(s))}／週` : ''}` : SM_INTEL[0]}</dd>
    <dt>政治民心</dt><dd>${s.sg ? `<span style="color:${SM_FAC[s.sg.f].col}">${SM_FAC[s.sg.f].name}控制軌道，圍城第 ${s.sg.t}／${SM_RULE.siegeT} 週</span>` : s.hit > S.turn - 3 ? '剛易手，人心不穩' : '安定'}</dd>
    <dt>航道</dt><dd>${nb.map((t) => `<a href="#" data-goto="${t.id}">${smuEsc(t.name)}</a>`).join('、')}${risky.length ? `<br><span class="sm-warn">有敵軍：${risky.map((t) => t.name).join('、')}（經過可能被攔截）</span>` : ''}</dd>
    <dt>戰鬥空間</dt><dd>${SM_SIZE[s.size]}（每波每方最多 ${smuShip(smWaveCap(S, s))} 艘）</dd>
    <dt>巨型建築</dt><dd>${kn ? Object.keys(s.mega).map((k) => SM_MEGA[k]).join('、') || '無' : SM_INTEL[0]}</dd>
    <dt>情報時效</dt><dd>${mine ? '即時（己方星系）' : IN.known ? `${IN.age ? `${IN.age} 週前` : '本週'}・來源：${I.src}` : '沒有情報'}</dd></dl>
    ${mine ? '' : `<div class="sm-btns"><button class="g-btn" id="sm-buy">跟商人買情報（${SM_MERCHANT}）</button>${smHas(S, 'scout') ? `<button class="g-btn" id="sm-scout" ${(S.pl.scoutCd || 0) > S.turn ? 'disabled' : ''}>偵察${(S.pl.scoutCd || 0) > S.turn ? `（第 ${S.pl.scoutCd} 週可用）` : ''}</button>` : ''}</div>`}`;
  // 這裡的任務
  const ms = S.pl.missions.filter((M) => M.sys === s.id && (M.state === 'open' || M.state === 'offer'));
  if (ms.length) h += `<h4>任務</h4>${ms.map((M) => `<div class="sm-ev">${M.kind === 'order' ? '命令' : '委託'}：${smuEsc(smMisText(S, M))}（剩 ${smMisLeft(S, M)} 週）</div>`).join('')}`;
  // 地面突襲：特戰小隊在這裡、條件符合
  const q = smSquad(S);
  if (q && q.sys === s.id && smHostileSys(S, S.pl.fac, s) && s.owner !== SM_N) {
    const c = smRaidCond(S, s);
    h += c && smCanRaid(S, s) ? `<div class="sm-btns"><button class="g-btn primary" id="sm-raid">地面突襲（${SM_RAID_NAME[c]}・潛入成功率 ${Math.round(SM_RAID_INF[c] * 100)}%）</button></div><div class="g-dim">成功的話，地面防禦癱瘓 ${SM_RAID_T} 週。</div>`
      : `<div class="g-dim" style="margin-top:6px">${s.dis > S.turn ? '地面防禦已經癱瘓。' : (S.pl.raidCd || 0) > S.turn ? `特戰小隊整備中（第 ${S.pl.raidCd} 週可用）。` : '敵方艦隊在軌道上：要等太陽風暴，或研究「匿蹤躍遷」才能突襲。'}</div>`;
  }
  const opM = S.pl.missions.find((M) => M.type === 'op' && M.state === 'open' && M.sys === s.id && smOpReady(S, M));
  if (opM) h += `<div class="sm-btns"><button class="g-btn primary" data-op="${opM.id}">執行${SM_OP[opM.op]}任務（艦長模式）</button></div>`;
  // 下令：選取的艦隊移動到這裡
  const sel = smPlFleets(S).filter((f) => SMU.sel.has(f.id) && f.sys !== s.id);
  if (sel.length) {
    const P = sel.map((f) => ({ f, P: smPlanMove(S, f, s.id) })), bad = P.filter((o) => !o.P.ok), ok = P.filter((o) => o.P.ok);
    const cost = ok.reduce((a, o) => a + o.P.cost, 0), fight = ok.some((o) => o.P.fight), mid = ok.some((o) => o.P.mid.length);
    h += `<div class="sm-btns"><button class="g-btn primary" id="sm-move" ${ok.length ? '' : 'disabled'}>派 ${ok.length} 支艦隊到這裡（${cost ? `費用 ${smuN(cost)}` : '免費'}）</button></div>`;
    if (bad.length) h += `<div class="sm-warn">${bad.map((o) => `${smuEsc(o.f.name)}：${o.P.why}`).join('<br>')}</div>`;
    if (fight) h += '<div class="sm-warn">這道命令會引發戰鬥：下令後無法撤銷。</div>';
    if (mid) h += '<div class="sm-warn">途中經過有敵方艦隊的星系，可能被攔下來先打一仗。</div>';
  } else if (smPlFleets(S).some((f) => !f.cap || smSquad(S)) && !smPlFleets(S).some((f) => f.sys === s.id)) h += '<div class="g-dim" style="margin-top:8px">要派艦隊來這裡：先在左下角點選艦隊。</div>';
  // 強攻：我方艦隊控制這裡的軌道
  if (s.sg && s.sg.f === S.pl.fac && own.some((f) => !f.cap)) {
    h += s.assaulted === S.turn ? '<div class="g-dim">這一週已經強攻過了。</div>' : `<div class="g-dim" style="margin-top:8px">強攻地面：快，但建築受損、繁榮下降。不強攻的話，控制軌道 ${SM_RULE.siegeT} 週後星球投降。</div>
      ${smuActs([{ id: 'sm-assault', cls: s.assault === S.turn ? 'on' : '', name: '強攻：交給艦隊指揮官', desc: s.assault === S.turn ? '已下令：本週結束時強攻。再按一次取消。' : '本週結束時算出結果。' },
        { id: 'sm-as-cmd', name: '強攻：親自指揮', desc: '現在進入戰場，你來下令。' }, ...(S.pl.skipWatch ? [] : [{ id: 'sm-as-watch', name: '強攻：觀戰', desc: 'AI 指揮，真的打一場給你看。' }])], 140)}`;
  }
  // 政務：轄區的建設
  if (S.pl.gs.includes(s.id) && s.owner === S.pl.fac) {
    const funds = S.pl.gov === 3 ? S.fac[S.pl.fac].money : S.pl.money;
    h += `<h4>轄區建設（${S.pl.gov === 3 ? '聯盟國庫' : '你的資金'} ${smuN(funds)}）</h4>${smuActs(Object.entries(SM_BUILD).filter(([, B]) => B.ok(s)).map(([k, B]) => ({ data: `data-bld="${k}"`, off: !smCanBuild(S, s, k), name: B.name, desc: SMU_BUILD_DESC[k] || '', info: `${smuN(smBuildCost(S, s, k))} 資金` })), 140)}`;
  }
  return h;
}
function smuMove() {
  const S = SMU.S, s = S.sys[SMU.sys], sel = smPlFleets(S).filter((f) => SMU.sel.has(f.id) && f.sys !== s.id);
  const plans = sel.map((f) => ({ f, P: smPlanMove(S, f, s.id) })).filter((o) => o.P.ok);
  const go = () => {
    const msg = [];
    for (const o of plans) { const r = smOrder(S, o.f, s.id); if (!r.ok) msg.push(`${o.f.name}：${r.why}`); }
    if (msg.length) toast(msg.join('；'), 'bad');
    SMU.sel.clear(); smuRefresh();
  };
  if (plans.some((o) => o.P.fight || o.P.mid.length)) smuAsk('下令後無法撤銷', `派 ${plans.map((o) => smuEsc(o.f.name)).join('、')} 前往 <b>${smuEsc(s.name)}</b>。<br>這道命令會引發戰鬥${plans.some((o) => o.P.mid.length) ? '（途中也可能被攔截）' : ''}，下令後就不能取消。`, '下令出擊', go, true);
  else go();
}
function smuRefresh() { const S = SMU.S; smSave(S); SMU.scene = null; smuDock(); smuDraw(); smuCardRender(); const m = gEl('sm-money'); if (m) m.textContent = `資金 ${smuN(S.pl.money)}`; }

// 結束回合：移動 → 我方的戰鬥先選介入方式 → 計算 → 戰報
// 結束回合：先播艦隊移動的動畫（看得到的單位），播完才列出戰鬥
function smuEndTurn() {
  const S = SMU.S; if (SMU.anim) return;
  SMU.sel.clear(); smuOpen(null);
  const sc = smuScene(), mv = S.fleets.filter((f) => f.path && smShips(f.comp) > 0 && smuSees(S, f)).map((f) => ({ f, rel: smuRel(S, f), path: f.path.slice() }));
  smTurnMove(S);
  const G = new Map();
  for (const m of mv) {
    let stop = m.path.indexOf(m.f.sys); if (stop < 1) stop = m.path.length - 1;   // 中途被攔下：停在攔截的星系
    const key = m.rel + '|' + m.path.join(',') + '|' + stop, A = G.get(key) || { rel: m.rel, path: m.path, stop, ships: 0, cap: true };
    A.ships += smShips(m.f.comp); A.cap = A.cap && !!m.f.cap; G.set(key, A);
  }
  if (!G.size) return smuEndTurn2();
  for (const A of G.values()) A.tx = A.cap ? '特戰小隊' : A.rel === 'own' || A.rel === 'ally' ? smuShip(A.ships) : '';
  SMU.scene = { ...sc, arrows: [], clash: {} };   // 動畫時：標籤停在原位，箭頭換成移動中的艦隊
  const dur = 1700 + 150 * Math.max(...[...G.values()].map((A) => A.stop));
  SMU.anim = { t0: performance.now(), dur, G: [...G.values()] };
  const b = gEl('sm-end'); if (b) b.disabled = true;
  setTimeout(() => { SMU.anim = null; SMU.scene = null; const e = gEl('sm-end'); if (e) e.disabled = false; smuEndTurn2(); }, dur + 350);
}
function smuEndTurn2() {
  const S = SMU.S;
  const mine = S.pend.filter((b) => b.pl);
  SMU.scene = null; smuDock(); smuDraw();
  if (!mine.length) return smuFinishTurn([]);
  const fsAt = (sid, pred) => smFleetsAt(S, sid).filter(pred);
  smuModal(`<h3>第 ${S.turn} 週・我方艦隊的戰鬥</h3><p class="g-dim">選擇每一場戰鬥要怎麼打。結果在選擇之後才會揭曉。</p>
    ${mine.map((b, i) => {
      const s = S.sys[b.sys], my = fsAt(b.sys, (f) => f.fac === S.pl.fac), en = fsAt(b.sys, (f) => smAtWar(S, S.pl.fac, f.fac));
      return `<div class="sm-bt"><b>${smuEsc(s.name)}</b>　<span class="g-dim">戰鬥空間${SM_SIZE[s.size]}（每波每方最多 ${smuShip(smWaveCap(S, s))} 艘）</span>
        <div>我方：${my.map((f) => `${smuEsc(f.name)} ${smuShip(smShips(f.comp))} 艘`).join('、')}</div>
        <div>敵方：${[...new Set(en.map((f) => f.fac))].map((fac) => `<span style="color:${SM_FAC[fac].col}">${SM_FAC[fac].name} ${en.filter((f) => f.fac === fac).length} 支・${smuShip(en.filter((f) => f.fac === fac).reduce((a, f) => a + smShips(f.comp), 0))} 艘</span>`).join('、')}</div>
        ${smuPick('sm-how' + i, [{ v: 'ai', name: '交給艦隊指揮官', desc: '直接算出結果，最快。' }, { v: 'cmd', name: '親自指揮', desc: '進入戰場，你來下令。' }, ...(S.pl.skipWatch ? [] : [{ v: 'watch', name: '觀戰', desc: 'AI 指揮雙方，真的打一場給你看。' }])], 'ai', 150)}</div>`;
    }).join('')}
    <div class="sm-opt">${smuTog('sm-skipw', S.pl.skipWatch, '不再顯示「觀戰」選項')}</div>
    <div class="sm-btns"><button class="g-btn primary" id="sm-fight">開戰</button></div>`);
  gEl('sm-fight').onclick = () => {
    S.pl.skipWatch = smuOn('sm-skipw');
    const reps = [], live = [];
    mine.forEach((b, i) => {
      const how = smuVal('sm-how' + i) || 'ai';
      if (how === 'cmd' || how === 'watch') live.push({ sys: b.sys, how });
      else { reps.push(smResolve(S, b.sys, 'ai')); b.done = true; }
    });
    smuCloseModal();
    if (!live.length) return smuFinishTurn(reps);
    S.live = { q: live, reps: reps.map((r) => S.reports.indexOf(r)) }; smSave(S);   // 真打的戰鬥：一場一場進戰場
    smuNextLive();
  };
}
// ───── 真打的戰鬥（親自指揮、觀戰）─────
let SMB = null;   // 進行中的戰鬥：{ sys, fa, fb, how, cap, th: 各艦隊的撤退門檻, gone: 已躍遷的艦隊, jump: 充能完成的時間 }
function smuNextLive() {
  const S = SMU.S, L = S.live;
  while (L && L.q.length) {
    const b = L.q.shift(), en = smEnemyAt(S, S.pl.fac, b.sys);
    if (!en.length || !smFleetsAt(S, b.sys).some((f) => f.fac === S.pl.fac)) continue;   // 敵人已經不在了
    const fb = [...new Set(en.map((f) => f.fac))].sort((x, y) => smFacValAt(S, b.sys, y) - smFacValAt(S, b.sys, x))[0];
    const m = smuLayout(S, b.sys, S.pl.fac, fb, b.how);
    smSave(S);
    simEndMid(); overlay(null); SIM.m = m; SIM.sel = null;
    camAnim = null; view.target.x = 0; view.target.z = 0; view.height = 1500; view.yaw = 0; view.pitch = ELEV; updateCamera();
    SMB = { sys: b.sys, fa: S.pl.fac, fb, how: b.how, cap: smWaveCap(S, S.sys[b.sys]), charge: smHas(S, 'charge') ? 6 : 10, th: m.fleets.map((f) => f.th || 0), gone: new Set(), jump: {}, saved: {} };
    simStart();
    return;
  }
  // 都打完了
  const reps = (L ? L.reps : []).map((i) => S.reports[i]).filter(Boolean);
  S.live = null; SMB = null;
  setPhase('menu'); smuRender();
  smuFinishTurn(reps);
}
// ───── 強攻：近地戰（地面砲台＋少數守備艦），砲台也算敵人，全部打掉才算攻下 ─────
function smuAssault(how) {
  const S = SMU.S, s = S.sys[SMU.sys];
  smuAsk(`強攻 ${smuEsc(s.name)}`, '打下來就佔領，但建築會受損、繁榮下降。現在就開打？', '開打', () => smuAssaultGo(how, s), true);
}
function smuAssaultGo(how, s) {
  const S = SMU.S;
  const fs = smFleetsAt(S, s.id).filter((f) => f.fac === S.pl.fac).sort((a, b) => (b.pl ? 1 : 0) - (a.pl ? 1 : 0)).slice(0, 6);
  const keys = GROUND_KEYS.filter((k) => k !== 'city'), scene = s.tier >= 2 || !keys.length ? 'city' : keys[s.id % keys.length];
  const seed = (S.turn * 7919 + s.id * 104729 + S.r) % 100000, cap = smWaveCap(S, s);
  const m = { name: `強攻 ${s.name}（第 ${S.turn} 週）`, fac: SM_FAC[S.pl.fac].game === 0 ? 0 : 1, victory: true, ctl: how === 'cmd' ? 0 : -1, watch: how === 'watch', seed, fleets: [], terrain: [], ais: [],
    ground: { scene, seed: seed + 1, def: 1 }, names: [SM_FAC[S.pl.fac].name + '軍', SM_FAC[s.owner].name + '守軍'], career: { sys: s.id, fa: S.pl.fac, fb: s.owner, how, map: [], assault: true } };
  let n = 0;
  fs.forEach((f, i) => {
    const on = n < cap || !i; n += smShips(f.comp);
    m.fleets.push({ side: 0, name: f.name, cmdr: { base: null, name: f.cmdr.name, title: '', trait: 'dmg', level: f.cmdr.lv, mode: 'lv', tal: {}, skills: ['focus', 'charge'] }, comp: f.comp.slice(), hangar: HANGAR_DEFAULT.slice(),
      formation: 'line', orderly: false, layers: 1, x: Math.round((i - (fs.length - 1) / 2) * 380), z: on ? 420 : 900, y: 0, h: Math.PI, ai: { tactic: 'push', level: f.cmdr.lv }, reserve: !on, at: 1e9, th: f.retreat || 0 });
    m.career.map.push(f.id);
  });
  // 守備艦：守方不會為了少數船對自己的星球開火，所以只有少量戰艦（依守軍多寡）
  const dn = Math.max(20, Math.min(160, Math.round(s.gar / 4))), dc = [0, 0, Math.round(dn * 0.2), Math.round(dn * 0.4), dn - Math.round(dn * 0.2) - Math.round(dn * 0.4), 0];
  m.fleets.push({ side: 1, name: `${s.name}守備艦隊`, cmdr: { base: null, name: '守備司令', title: '', trait: 'shield', level: 2, mode: 'lv', tal: {}, skills: ['wall'] }, comp: dc, hangar: HANGAR_DEFAULT.slice(),
    formation: 'line', orderly: false, layers: 1, x: 0, z: -300, y: 0, h: 0, ...(SM_FAC[s.owner].game >= 2 ? { fac: SM_FAC[s.owner].game } : {}), ai: { tactic: 'push', level: 2 }, reserve: false, at: 1e9 });
  m.career.map.push(null);
  m.ais = [{ lv: 1, tac: 'push' }, { lv: 1, tac: 'push' }];
  s.assault = -1; smSave(S);
  simEndMid(); overlay(null); SIM.m = m; SIM.sel = null;
  camAnim = null; view.target.x = 0; view.target.z = 0; view.height = 1500; view.yaw = 0; view.pitch = ELEV; updateCamera();
  SMB = { sys: s.id, fa: S.pl.fac, fb: s.owner, how, cap, th: m.fleets.map((f) => f.th || 0), gone: new Set(), jump: {}, saved: {}, assault: true, defN: smShips(dc) };
  simStart();
  SMB.turTot = GRD ? GRD.tur.length : 0;
}
function smuAssaultDone() {
  const S = SMU.S, B = SMB, m = SIM.m, R = GAME.result || { kind: 'end' };
  const fleetsRes = m.career.map.map((id, i) => {
    if (id == null) return null;
    const f = fleets.find((o) => o.id === i), orig = m.fleets[i].comp, comp = orig.map(() => 0);
    if (B.saved[i]) B.saved[i].forEach((x, k) => { if (k < comp.length) comp[k] = x; });
    else if (f) for (const q of f.sqs) for (let k = 0; k < comp.length; k++) comp[k] += Math.max(0, q.typeAlive[k] || 0);
    return { id, comp: comp.map((x, k) => Math.min(orig[k], x)), gone: B.gone.has(i) };
  }).filter(Boolean);
  const di = m.career.map.indexOf(null), df = fleets.find((o) => o.id === di), defLeft = df ? df.sqs.reduce((a, q) => a + Math.max(0, q.alive), 0) : 0;
  const win = R.kind === 'win', turLeft = GRD ? GRD.live : 0;
  const rep = smApplyAssault(S, B.sys, { fleets: fleetsRes, win, turLeft: win ? 0 : turLeft, turTot: B.turTot || 0, defLost: Math.max(0, B.defN - defLeft) }, B.how);
  SMB = null; smSave(S);
  setPhase('menu'); smuRender(); smuReports([rep], `強攻 ${rep.name}`);
}
// 星圖的艦隊 → 戰場布局：我方在南、敵方在北；每一方先上場到每波上限，其餘在場外待命，場上空出來就補上
function smuLayout(S, sid, fa, fb, how) {
  const s = S.sys[sid], cap = smWaveCap(S, s), seed = (S.turn * 7919 + sid * 104729 + S.r) % 100000;
  const m = { name: `${s.name}（第 ${S.turn} 週）`, fac: SM_FAC[fa].game === 0 ? 0 : 1, victory: true, ctl: how === 'cmd' ? 0 : -1, watch: how === 'watch', seed, fleets: [], terrain: [], ais: [],
    names: [SM_FAC[fa].name + '軍', SM_FAC[fb].name + '軍'], career: { sys: sid, fa, fb, how, map: [] } };
  for (const [side, fac] of [[0, fa], [1, fb]]) {
    const L = smFleetsAt(S, sid).filter((f) => f.fac === fac).sort((a, b) => (b.pl ? 1 : 0) - (a.pl ? 1 : 0) || smVal(b.comp) - smVal(a.comp)).slice(0, 8);   // 引擎每場最多 40 個分隊：每方最多 8 支
    const lv = Math.round(smLv(L)) || 1;
    m.ais.push({ lv: Math.max(0, Math.min(4, lv - 1)), tac: L[0] ? L[0].cmdr.tac : 'push' });
    let n = 0, k = 0;
    const field = L.filter((f) => { const on = n < cap || !k; if (on) { n += smShips(f.comp); k++; } return on; });
    L.forEach((f, i) => {
      const on = field.includes(f), col = on ? field.indexOf(f) - (field.length - 1) / 2 : 0, south = side === 0;
      const tac = f.cmdr.tac || 'push';
      m.fleets.push({ side, name: f.name, cmdr: { base: null, name: f.cmdr.name, title: '', trait: tac === 'kite' ? 'speed' : tac === 'push' ? 'shield' : 'dmg', level: f.cmdr.lv, mode: 'lv', tal: {}, skills: ['focus', 'charge'] },
        comp: f.comp.slice(), hangar: HANGAR_DEFAULT.slice(), formation: tac === 'breakthrough' ? 'spindle' : 'line', orderly: false, layers: 1,
        x: Math.round((south ? col : -col) * 380), z: south ? (on ? 360 : 900) : (on ? -360 : -900), y: 0, h: south ? Math.PI : 0,
        ...(SM_FAC[fac].game >= 2 ? { fac: SM_FAC[fac].game } : {}),
        ai: { tactic: tac, level: f.cmdr.lv }, reserve: !on, at: 1e9, th: f.retreat || 0 });
      m.career.map.push(f.id);
    });
  }
  return m;
}
// 每個模擬步：躍遷撤退（剩下的比例低於門檻 → 充能 10 秒後離場）、場上空出來就讓待命的艦隊進場
function smbTick(t) {
  const B = SMB; if (!B || !B.th) return;
  const alive = (f) => f.sqs.reduce((a, q) => a + Math.max(0, q.alive), 0);
  for (let s = 0; s < 2; s++) {
    const mine = fleets.filter((f) => f.side === s && !f.supply && f.id < B.th.length);
    for (const f of mine) {
      if (f.reserve || B.gone.has(f.id)) continue;
      const n = alive(f), th = B.th[f.id] || 0;
      if (B.jump[f.id] == null && n > 0 && th > 0 && n / Math.max(1, f.initial) < th) { B.jump[f.id] = t + (s === 0 && B.charge ? B.charge : 10); if (s === GAME.playerSide || GAME.watch) toast(`${f.name} 開始躍遷充能（10 秒後撤離戰場）`); }
      if (B.jump[f.id] != null && t >= B.jump[f.id] && n > 0) {
        B.saved[f.id] = f.sqs.reduce((c, q) => c.map((x, k) => x + Math.max(0, q.typeAlive[k] || 0)), new Array(NT).fill(0));   // 躍遷當下的艦數（離場的分隊之後會被清掉）
        B.gone.add(f.id); f.reserve = true; f.activateAt = null; GAME.init[s] = Math.max(1, GAME.init[s] - f.initial);
        for (const q of f.sqs) { q.bg = true; q.hidden = true; if (q.group) q.group.inactive = true; }
      }
    }
    let n = mine.filter((f) => !f.reserve && !B.gone.has(f.id)).reduce((a, f) => a + alive(f), 0);
    const wait = mine.filter((f) => f.reserve && !B.gone.has(f.id) && f.activateAt != null && f.activateAt > t + 1);
    while (wait.length && (n < B.cap * 0.5 || n === 0)) { const f = wait.shift(); f.activateAt = t; n += f.initial; if (s === GAME.playerSide || GAME.watch) toast(`${f.name} 進入戰場`); }
  }
}
// 戰鬥結束：各艦隊剩下的艦數寫回星圖；還有敵人的話，剩下的用計算的
function smuBattleDone() {
  const S = SMU.S, B = SMB, m = SIM.m, R = GAME.result || { kind: 'end' };
  if (!S || !B) { setPhase('menu'); showStarmap(); return; }
  if (B.assault) return smuAssaultDone();
  if (B.op) return smuOpDone();
  if (B.raid != null) return smuRaidDone();
  const quit = R.kind === 'end' && B.how === 'cmd';   // 親自指揮時按了撤退：我方全部躍遷離開
  const res = { fleets: m.career.map.map((id, i) => {
    const f = fleets.find((o) => o.id === i), orig = m.fleets[i].comp, comp = orig.map(() => 0);
    if (B.saved[i]) B.saved[i].forEach((x, k) => { if (k < comp.length) comp[k] = x; });
    else if (f) for (const q of f.sqs) for (let k = 0; k < comp.length; k++) comp[k] += Math.max(0, q.typeAlive[k] || 0);
    return { id, comp: comp.map((x, k) => Math.min(orig[k], x)), gone: B.gone.has(i) || (quit && m.fleets[i].side === 0) };
  }) };
  const rep = smApplyReal(S, B.sys, B.fa, B.fb, res, B.how);
  S.live.reps.push(S.reports.indexOf(rep));
  if (smBattles(S).some((x) => x.sys === B.sys)) { const r2 = smResolve(S, B.sys, 'ai'); S.live.reps.push(S.reports.indexOf(r2)); }   // 還有交戰的（例如第三方）：用計算的
  const b = (S.pend || []).find((x) => x.sys === B.sys); if (b) b.done = true;
  SMB = null; smSave(S);
  smuNextLive();
}
function smuFinishTurn(mineReps) {
  const S = SMU.S, n0 = S.reports.length;
  smTurnEnd(S);
  // 自己陣營星系的戰鬥也列進戰報
  const rest = S.reports.slice(n0).filter((r) => S.sys[r.sys].owner === S.pl.fac || r.fights.some((F) => F.a === S.pl.fac || F.b === S.pl.fac));
  smSave(S); SMU.sel.clear(); SMU.card = null; SMU.sys = -1; smuRender();
  smuTurnStart([...mineReps, ...rest]);
}
function smuReports(reps, title) {
  const S = SMU.S, nm = (fac) => `<span style="color:${SM_FAC[fac].col}">${SM_FAC[fac].name}</span>`;
  const comp = (c) => c.map((n, t) => (n ? `${smShipV()[t].name} ${smuShip(n)}` : '')).filter(Boolean).join('、') || '—';
  smuModal(`<h3>${title}</h3>${reps.length ? '' : '<p class="g-dim">還沒有戰報。</p>'}${reps.map((r) => r.fights.map((F) => {
    const res = F.win < 0 ? '雙方都離開了戰場' : `${nm(F.win ? F.b : F.a)} 獲勝`;
    return `<div class="sm-bt"><b>第 ${r.turn} 週・${smuEsc(r.name)}</b>：${nm(F.a)} 對 ${nm(F.b)}，${res}${F.assault ? `（強攻・地面砲台 ${F.tur ? F.tur[0] - F.tur[1] : 0}／${F.tur ? F.tur[0] : 0} 座被摧毀）` : ''}${F.real === 'cmd' ? '（親自指揮）' : F.real === 'watch' ? '（觀戰）' : F.pl ? '（我方參戰）' : ''}
      <table class="sm-t"><tr><th></th><th>${SM_FAC[F.a].name}</th><th>${SM_FAC[F.b].name}</th></tr>
      <tr><td>開戰</td><td>${smuShip(smShips(F.start[0]))}</td><td>${smuShip(smShips(F.start[1]))}</td></tr>
      ${F.waves.map((W, i) => `<tr><td>${W.real ? '實戰（開戰時' : `第 ${i + 1} 波（場上`} ${smuShip(W.n[0])}／${smuShip(W.n[1])}）${W.retreat[0].length + W.retreat[1].length ? `<br><span class="g-dim">撤退：${[...W.retreat[0], ...W.retreat[1]].map(smuEsc).join('、')}</span>` : ''}</td><td>−${smuShip(W.lost[0])}${W.win === 0 ? ' ✓' : ''}</td><td>−${smuShip(W.lost[1])}${W.win === 1 ? ' ✓' : ''}</td></tr>`).join('')}
      <tr><td>剩下</td><td>${smuShip(smShips(F.end[0]))}</td><td>${smuShip(smShips(F.end[1]))}</td></tr></table>
      <div class="g-dim" style="margin-top:4px">${SM_FAC[F.a].name}損失：${comp(F.lost[0])}<br>${SM_FAC[F.b].name}損失：${comp(F.lost[1])}
      ${F.win >= 0 ? `<br>戰場回收 ${smuN(F.salvage || 0)} 資金・修回 ${smuShip(F.repaired || 0)} 艘` : ''}</div></div>`;
  }).join('')).join('')}<div class="sm-btns"><button class="g-btn primary" id="sm-close">關閉</button></div>`);
  gEl('sm-close').onclick = smuCloseModal;
}
function smSummary() { const S = smLoad(); return S && S.v === 1 ? `第 ${S.turn} 週・資金 ${smuN(S.pl.money)}・艦隊 ${smPlFleets(S).length} 支` : '還沒開始'; }
// 測試用（tools/starmap-ui.mjs）：打包後的函式不是全域的，從這裡取
window.__sm = { get SMU() { return SMU; }, SM_RULE, get SMB() { return SMB; }, showStarmap, smuXY, smuEndTurn, smuRender, smuOpen, smuScene, smuBrief, smNewGame, smSave, smTurnMove, smAutoTurn, smPlFleets, smShips };

// ───── 生涯：任務面板、艦長任務、政務邀請、生涯紀錄 ─────
// 任務的報酬、支援文字
function smuReward(M) { const R = M.reward || {}; return [R.merit ? `戰功 ${R.merit}` : '', R.money ? `資金 ${R.money}` : '', R.trust ? `信任 ${R.trust}` : '', R.sup ? `${SM_SUP[R.sup[0]]}支持 ${R.sup[1]}` : ''].filter(Boolean).join('、') || '—'; }
function smuSupport(M) { return M.support && (M.support.got || M.support.money) ? [M.support.got ? `艦隊「${smuEsc(M.support.got)}」暫時歸你指揮` : '', M.support.money ? `資金 ${M.support.money}` : ''].filter(Boolean).join('、') : '沒有支援'; }
// 任務一覽（上方的「任務」按鈕）
function smuMissionList() {
  const S = SMU.S, L = S.pl.missions.filter((M) => M.state === 'open' || M.state === 'offer');
  smuModal(`<h3>任務</h3>${L.length ? L.map((M) => {
    const left = smMisLeft(S, M);
    return `<div class="sm-fl"><span class="nm">${M.kind === 'order' ? '命令' : '委託'}：${smuEsc(smMisText(S, M))}${M.state === 'offer' ? ' <span class="sm-badge">待回覆</span>' : ''}</span><span class="${left <= 2 ? 'sm-bad' : 'g-dim'}">剩 ${left} 週</span>
      <span class="sub">來自 ${smuEsc(M.from.name)}（${smuEsc(M.from.role)}）・情報：${M.intel || '無情報'}・${smuSupport(M)}</span>
      <span class="sub">報酬：${smuReward(M)}</span>
      <span class="sub"><button class="g-btn" data-brief="${M.id}">簡報</button>${M.sys != null ? ` <button class="g-btn" data-goto="${M.sys}">在星圖上看目標</button>` : ''}${M.state === 'offer' ? ` <button class="g-btn primary" data-acc="${M.id}">接受</button> <button class="g-btn" data-dec="${M.id}">婉拒</button>` : ''}${M.type === 'op' && M.state === 'open' ? (smOpReady(S, M) ? ` <button class="g-btn primary" data-op="${M.id}">執行${SM_OP[M.op]}任務（艦長模式）</button>` : ' <span class="g-dim">先把特戰小隊移到目標星系</span>') : ''}</span></div>`;
  }).join('') : '<p class="g-dim">目前沒有任務。</p>'}<div class="sm-btns"><button class="g-btn primary" id="sm-close">關閉</button></div>`);
  const d = gEl('sm-modal'), M = (b, k) => S.pl.missions.find((x) => x.id === +b.dataset[k]);
  gEl('sm-close').onclick = smuCloseModal;
  d.querySelectorAll('[data-brief]').forEach((b) => (b.onclick = () => smuBrief(M(b, 'brief'), true)));
  d.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => { smuCloseModal(); smuOpen('sys', +b.dataset.goto); }));
  d.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => { const w = smAccept(S, M(b, 'acc')); if (w) toast(w, 'bad'); smuRender(); smuMissionList(); }));
  d.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => { smDecline(S, M(b, 'dec')); smuRender(); smuMissionList(); }));
  d.querySelectorAll('[data-op]').forEach((b) => (b.onclick = () => { smuCloseModal(); smuOp(M(b, 'op')); }));
}
// 艦長任務：用艦長模式打（captain.js 的隨機任務，指定任務類型與難度）
function smuOp(M) {
  const S = SMU.S; if (!smOpReady(S, M)) return;
  const t = S.sys[M.sys], li = Math.max(0, Math.min(4, Math.max(0, SM_INTEL.indexOf(smIntel(S, M.sys, S.pl.fac)) - 2) + (t.def >= 4 ? 1 : 0) + S.diff - 1));
  const p = { ...capLoad(), seed: (S.turn * 7919 + t.id * 104729 + S.r) % 100000, diff: li, mis: M.op, env: 0, space: false, fac: SM_FAC[S.pl.fac].game === 0 ? 0 : 1 };
  smSave(S);
  simEndMid(); overlay(null);
  const m = capLayout(p); m.career = { op: M.id }; m.name = `${t.name}・${m.name}`;
  SIM.m = m; SIM.sel = null; camAnim = null;
  SMB = { op: M.id };
  simStart();
}
function smuOpDone() {
  const S = SMU.S, R = GAME.result || {}, M = S.pl.missions.find((x) => x.id === SMB.op);
  if (M) smOpResult(S, M, !!R.capOk);
  grAfterCaptain(!!R.capOk, M ? SM_OP[M.op] : '', S.sys[M ? M.sys : 0].name, CAP.stats && CAP.stats.alarmed);   // 船員的經歷（growth.js）
  SMB = null; smSave(S);
  setPhase('menu'); smuRender();
  toast(R.capOk ? '艦長任務完成' : `艦長任務失敗${R.why ? '：' + R.why : ''}`, R.capOk ? '' : 'bad');
}
function smuOfferGov() {
  const S = SMU.S;
  smuModal(`<h3>議會的邀請</h3><p>聯盟議會希望你轉任政務，出任一個星系的行星司令：管理轄區的建設與繁榮，之後依政績與派系支持升任星區總督、議員，甚至元首。</p>
    <p class="g-dim">轉任後不再接軍職的命令；能指揮的艦隊依政務職位。也可以留在軍職，繼續升遷到元帥。</p>
    ${smuActs([{ id: 'sm-gov-yes', cls: 'go', name: '轉任政務', desc: '出任行星司令，管理一個星系。', info: '建設轄區・爭取派系支持・可升到元首' }, { id: 'sm-gov-no', name: '留在軍職', desc: '繼續接上級的命令打仗。', info: '戰功升遷・可升到元帥' }], 200)}`);
  gEl('sm-gov-yes').onclick = () => { smTakeGov(S); smSave(S); smuCloseModal(); smuRender(); };
  gEl('sm-gov-no').onclick = () => { S.pl.offerGov = false; smSave(S); smuCloseModal(); };
}
function smuCareer() {
  const S = SMU.S, p = S.pl, R = p.gov >= 0 ? SM_GOV_REQ[p.gov + 1] : null;
  smuModal(`<h3>生涯・${smRankName(S)}</h3><dl class="sm-kv">
    <dt>戰功</dt><dd>${Math.round(p.merit)}${p.gov < 0 && p.mil < 4 ? `（升${SM_MIL[p.mil + 1]}要 ${SM_MIL_MERIT[p.mil + 1]}，再通過考核）` : ''}</dd>
    <dt>上級信任</dt><dd>${Math.round(p.trust)}</dd>
    <dt>派系支持</dt><dd>${SM_SUP.map((n, i) => `${n} ${Math.round(p.sup[i])}`).join('・')}</dd>
    ${p.gov >= 0 ? `<dt>政績</dt><dd>轄區平均繁榮 ${Math.round(smGovPerf(S))}${R ? `（升${SM_GOV[p.gov + 1]}要 ${R.perf}，且最高的派系支持 ${R.sup}）` : ''}</dd><dt>轄區</dt><dd>${p.gs.map((i) => S.sys[i].name).join('、') || '無'}</dd>` : ''}
    <dt>能指揮的艦隊</dt><dd>${smFleetCap(S) >= 99 ? '不限' : smFleetCap(S) + ' 支'}</dd>
    <dt>擊沉</dt><dd>${smuShip(p.kills)} 艘・親自佔領 ${p.caps} 個星系</dd></dl>
    <h3 style="margin-top:14px">里程碑</h3><div class="sm-log">${p.ms.map((m) => `<div>第 ${m.turn} 週・${smuEsc(m.t)}</div>`).join('')}</div>
    ${p.status === '終結' ? '<p class="sm-bad">生涯已經結束。可以開新局。</p><div class="sm-btns"><button class="g-btn" id="sm-new">開新局</button></div>' : ''}
    <div class="sm-btns"><button class="g-btn primary" id="sm-close">關閉</button></div>`);
  gEl('sm-close').onclick = smuCloseModal;
  const nb = gEl('sm-new'); if (nb) nb.onclick = () => { smuCloseModal(); STORE.removeItem(SM_STORE); smuNewDialog(); };
}

// ───── 地面突襲：先擲潛入，成功才進艦長模式（破壞任務）─────
function smuRaid(t) {
  const S = SMU.S; if (!smCanRaid(S, t)) return;
  const c = smRaidCond(S, t);
  smuAsk(`突襲 ${smuEsc(t.name)}`, `${SM_RAID_NAME[c]}，潛入成功率 ${Math.round(SM_RAID_INF[c] * 100)}%。<br>被發現的話任務取消。要出發嗎？`, '出發', () => smuRaidGo(t, c));
}
function smuRaidGo(t, c) {
  const S = SMU.S;
  if (!smRaidInfiltrate(S, t)) { smSave(S); smuRender(); toast('潛入時被發現，任務取消', 'bad'); return; }
  const li = Math.max(0, Math.min(4, Math.round(t.def / 2) + S.diff - 1));
  const p = { ...capLoad(), seed: (S.turn * 7919 + t.id * 104729 + S.r) % 100000, diff: li, mis: 'sabotage', env: 0, space: false, fac: SM_FAC[S.pl.fac].game === 0 ? 0 : 1 };
  smSave(S); simEndMid(); overlay(null);
  const m = capLayout(p); m.career = { raid: t.id }; m.name = `突襲 ${t.name}・${m.name}`;
  SIM.m = m; SIM.sel = null; camAnim = null; SMB = { raid: t.id };
  simStart();
}
function smuRaidDone() {
  const S = SMU.S, R = GAME.result || {}, t = S.sys[SMB.raid];
  smRaidResult(S, t, !!R.capOk); grAfterCaptain(!!R.capOk, '突襲', t.name, CAP.stats && CAP.stats.alarmed); SMB = null; smSave(S);
  setPhase('menu'); smuRender();
  toast(R.capOk ? `突襲成功：${t.name} 的地面防禦癱瘓 ${SM_RAID_T} 週` : '突襲失敗', R.capOk ? '' : 'bad');
}
// ───── 科技 ─────
function smuTech() {
  const S = SMU.S, T = smTechInit(S);
  smuModal(`<h3>科技研發</h3><p class="g-dim">投入資金換研究點數（每點 ${SM_RP_PRICE} 資金），等待幾週後完成。一次研究一項。</p>
    ${['艦隊', '建築'].map((br) => `<h3 style="margin-top:10px">${br}科技</h3>${smuActs(Object.entries(SM_TECH).filter(([, x]) => x.br === br).map(([k, x]) => {
      const done = smHas(S, k), now = T.cur === k, cost = x.rp * SM_RP_PRICE;
      return { data: done || now ? '' : `data-tech="${k}"`, cls: done || now ? 'done' : '', off: !done && !now && !!T.cur, name: x.name, desc: x.desc,
        info: done ? '✓ 已完成' : now ? `研究中・第 ${T.start + x.turns} 週完成` : `${smuN(cost)} 資金・${x.turns} 週`, warn: done || now ? '' : T.cur ? '一次只能研究一項' : '' };
    }), 200)}`).join('')}
    <div class="sm-btns"><button class="g-btn primary" id="sm-close">關閉</button></div>`);
  gEl('sm-close').onclick = smuCloseModal;
  document.querySelectorAll('[data-tech]').forEach((b) => (b.onclick = () => { const w = smResearch(S, b.dataset.tech); if (w) toast(w, 'bad'); smSave(S); smuRender(); smuTech(); }));
}

// ───── 任務簡報：取得任務的那一週開始時跳出來（NPC 交代任務）─────
// 台詞：{t} 目標星系、{d} 剩幾週、{due} 期限週、{op} 艦長任務、{g} 目標數值、{n} 艦數、{me} 玩家的稱呼
const SMU_LINES = {
  op: [['艦長，情報部確認了{t}的位置。', '帶你的特戰小隊潛進去，執行{op}任務。動作要快，別讓他們察覺。'], ['{t}那邊有個目標，我需要它消失。', '{op}任務，{d}週內完成。小隊的人命，交給你了。']],
  opExam: [['你的戰功我都看在眼裡，{me}。', '不過要升遷，得先過這一關：到{t}執行{op}任務。成功的話，我親自替你遞升遷報告。']],
  capture: [['{t}是下一個目標。拿下它，前線就能往前推。', '支援都寫在簡報裡了，剩下的靠你。'], ['敵人在{t}的防線開始鬆動。', '{d}週內拿下那裡，別給他們重整的時間。']],
  captureExam: [['考核任務：{d}週內親自拿下{t}。', '別讓其他艦隊搶在你前面——別人打下來的不算數。']],
  defend: [['敵軍正在{t}附近集結。', '撐到第{due}週。{t}要是丟了，我們都不好交代。'], ['{t}的守軍向我求援了。', '守住它，直到第{due}週。']],
  destroy: [['前線需要喘息的空間。', '{d}週內擊沉{n}艘敵艦，打亂他們的部署。']],
  鷹派: [['議會裡那些人只會開會。我們鷹派要看到成果。', '替我們拿下{t}，鷹派會記住你的。']],
  鴿派: [['戰爭總有結束的一天，民生才是根本。', '讓{t}的繁榮回到{g}，鴿派會在議會支持你。']],
  財團: [['生意歸生意，{me}。', '{g}資金，換財團的友誼。這筆投資很划算——不過我們只等{d}週。']],
};
function smuLines(S, M) {
  const key = M.kind === 'request' && SMU_LINES[M.from.role] ? M.from.role : M.type + (M.exam && SMU_LINES[M.type + 'Exam'] ? 'Exam' : '');
  const L = SMU_LINES[key] || [['有件事要交給你。']], pick = L[M.id % L.length];
  const v = { t: M.sys != null ? S.sys[M.sys].name : '', d: smMisLeft(S, M), due: M.due, op: SM_OP[M.op] || '', g: M.goal, n: M.goal ? Math.round(M.goal * smRep()) : 0, me: smRankName(S).replace(SM_FAC[S.pl.fac].name, '') };
  return pick.map((x) => smuEsc(x.replace(/\{(\w+)\}/g, (_, k) => v[k])));
}
function smuBrief(M, again) {
  const S = SMU.S; if (!M) return;
  M.brief = true; smSave(S);
  const col = M.kind === 'order' ? SM_FAC[S.pl.fac].col : { 鷹派: '#e0784a', 鴿派: '#5fc9b8', 財團: '#e0b84a' }[M.from.role] || '#9fb3cc';
  const t = M.sys != null ? S.sys[M.sys] : null, left = smMisLeft(S, M);
  smuModal(`<h3>${M.kind === 'order' ? '新命令' : '新委託'}${M.exam ? '・升遷考核' : ''}<span class="g-dim" style="font-size:12px;font-weight:400;margin-left:8px">第 ${S.turn} 週</span></h3>
    <div class="sm-npc"><div class="sm-ava" style="border-color:${col};color:${col}">${smuEsc(M.from.name[0])}</div>
      <div class="sm-say"><div class="who" style="color:${col}">${smuEsc(M.from.name)}<span>${smuEsc(M.from.role)}</span></div>${smuLines(S, M).map((l) => `<div>「${l}」</div>`).join('')}</div></div>
    <dl class="sm-kv">
      <dt>目標</dt><dd><b>${smuEsc(smMisText(S, M))}</b></dd>
      <dt>時限</dt><dd class="${left <= 2 ? 'sm-bad' : ''}">${left} 週（到第 ${M.due} 週）</dd>
      ${t ? `<dt>地點</dt><dd><span style="color:${SM_FAC[t.owner].col}">${smuEsc(t.name)}（${SM_FAC[t.owner].name}）</span></dd>` : ''}
      <dt>情報</dt><dd>${M.intel || '無情報'}</dd>
      <dt>支援</dt><dd>${smuSupport(M)}</dd>
      <dt>報酬</dt><dd>${smuReward(M)}</dd>
      ${M.kind === 'order' ? `<dt>失敗</dt><dd class="g-dim">上級信任${M.exam ? ' −6' : ' −8'}、戰功 −10${M.exam ? '，這次考核不算' : ''}</dd>` : '<dt>失敗</dt><dd class="g-dim">委託的派系支持 −6</dd>'}
    </dl>
    <div class="sm-btns" style="justify-content:flex-end">${t ? '<button class="g-btn" id="sm-brief-map">在星圖上看目標</button>' : ''}
      ${M.state === 'offer' ? '<button class="g-btn" id="sm-brief-later">晚點再決定</button><button class="g-btn" id="sm-brief-no">婉拒</button><button class="g-btn primary" id="sm-brief-yes">接受</button>' : `<button class="g-btn primary" id="sm-brief-ok">${again ? '關閉' : '收到'}</button>`}</div>`);
  const done = () => { smuCloseModal(); if (again) smuMissionList(); };
  const on = (id, fn) => { const b = gEl(id); if (b) b.onclick = fn; };
  on('sm-brief-ok', done);
  on('sm-brief-later', done);
  on('sm-brief-yes', () => { const w = smAccept(S, M); if (w) toast(w, 'bad'); else toast('接受了委託'); smuRefreshTop(); done(); });
  on('sm-brief-no', () => { smDecline(S, M); smuRefreshTop(); done(); });
  on('sm-brief-map', () => { const n = SMU.q.length; SMU.q = []; smuCloseModal(); smuOpen('sys', t.id); if (n) toast(`還有 ${n} 則任務簡報：點上方的「任務」查看`); });
}
// 接受／婉拒之後，更新上方的資金與任務數（不重畫整個畫面，排隊的對話框才不會被清掉）
function smuRefreshTop() {
  const S = SMU.S, b = gEl('sm-mis'), nMis = S.pl.missions.filter((M) => M.state === 'open' || M.state === 'offer').length, nOffer = S.pl.missions.filter((M) => M.state === 'offer').length;
  if (b) b.innerHTML = `任務${nMis ? `<span class="sm-badge">${nOffer ? nOffer + ' 新' : nMis}</span>` : ''}`;
  smuRefresh();
}
// 日誌
function smuLog() {
  const S = SMU.S;
  smuModal(`<h3>日誌</h3><div class="sm-log">${S.log.slice(-60).reverse().map((l) => `<div class="sm-${l.c}">第 ${l.turn} 週・${smuEsc(l.t)}</div>`).join('')}</div><div class="sm-btns"><button class="g-btn primary" id="sm-close">關閉</button></div>`);
  gEl('sm-close').onclick = smuCloseModal;
}
