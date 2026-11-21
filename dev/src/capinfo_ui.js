// ═══════════════════════ 艦長生涯：任務／戰報／紀錄（2026-11-18）═══════════════════════
// 照使用者對交戰評估的決定：不佔滿畫面，從星圖右側滑出一塊斜放的面板（和停泊大廳右側面板同一種傾斜），星圖照常可以點。
// 任務：進行中／最近結束兩個分頁；每個任務一張卡（考核、類型、剩幾週、報酬、地點、看目標、簡報）。
// 戰報（每週開始自動打開，不擋操作）與紀錄：同一塊面板，上面是分類篩選（好事／損失／事件／一般），依週分組。
// 面板的狀態記在 CC.drw，星圖重畫（ccRender）之後再打開（ccdRestore）；任務簡報仍是對話框。
const CCD_CSS = `
.ccm .ccd{position:absolute;right:30px;width:600px;perspective:1500px;pointer-events:none;z-index:4}
.ccm .ccd .tilt{position:absolute;inset:0;pointer-events:auto;transform-origin:100% 50%;transform:translateX(-24px) rotateY(-9deg) rotateZ(-.6deg);animation:ccdIn .4s cubic-bezier(.2,.8,.2,1) both;
  display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(18,28,58,.9),rgba(8,13,30,.86));border:1px solid var(--line2);border-right:3px solid var(--pc,var(--cyan));backdrop-filter:blur(3px);
  clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px))}
@keyframes ccdIn{from{opacity:0;transform:translateX(60%) rotateY(-9deg) rotateZ(-.6deg)}}
.ccm .ccd .tilt::before{content:"";position:absolute;left:0;top:0;width:130px;height:3px;background:var(--pc,var(--cyan))}
.ccm .ccd .hd{display:flex;align-items:baseline;gap:12px;padding:20px 24px 12px;flex:none}
.ccm .ccd .hd h2{margin:0;font:900 26px var(--jp);letter-spacing:.12em;white-space:nowrap}
.ccm .ccd .hd .en{font:700 11px var(--en);letter-spacing:.28em;color:var(--pc,var(--cyan))}
.ccm .ccd .hd .x{margin-left:auto;border:0;background:none;color:var(--dim);font:700 20px var(--en);cursor:pointer}.ccm .ccd .hd .x:hover{color:#fff}
.ccm .ccd .tabs{display:flex;gap:6px;padding:0 24px 12px;border-bottom:1px solid var(--line2);flex:none;flex-wrap:wrap}
.ccm .ccd .tb{border:1px solid var(--line2);background:rgba(14,22,46,.8);color:var(--dim);font:700 15px var(--jp);padding:5px 14px;cursor:pointer;clip-path:polygon(7px 0,100% 0,calc(100% - 7px) 100%,0 100%)}
.ccm .ccd .tb b{font:700 14px var(--en);margin-left:6px;color:var(--text)}
.ccm .ccd .tb.on{background:linear-gradient(100deg,rgba(60,200,255,.32),rgba(47,134,255,.2));color:#fff;border-color:var(--cyan)}
.ccm .ccd .tb i{display:inline-block;width:8px;height:8px;margin-right:6px;background:var(--c)}
.ccm .ccd .bd{flex:1;overflow:auto;padding:12px 24px 18px;scrollbar-width:thin;scrollbar-color:rgba(90,200,255,.35) transparent}
.ccm .ccd .emp{color:var(--dim);font-size:14px;padding:20px 0;text-align:center}
/* 任務卡 */
.ccm .ccd .mi{position:relative;padding:14px 16px 12px 18px;background:rgba(12,20,42,.75);border-left:3px solid var(--mc,var(--cyan));margin-bottom:10px}
.ccm .ccd .mi .t{display:flex;align-items:center;gap:8px;padding-right:80px}
.ccm .ccd .mi .tag{font:700 13px var(--jp);padding:1px 8px;border:1px solid var(--mc);color:var(--mc);white-space:nowrap}
.ccm .ccd .mi .tag.ex{border-color:var(--gold);color:#1a1300;background:var(--gold)}
.ccm .ccd .mi h4{margin:0;font:900 20px var(--jp);letter-spacing:.06em;color:var(--text)}
.ccm .ccd .mi .left{position:absolute;right:16px;top:10px;text-align:right}
.ccm .ccd .mi .left b{display:block;font:700 30px/1 var(--en)}.ccm .ccd .mi .left small{font-size:11px;color:var(--dim)}
.ccm .ccd .mi .d{padding-right:64px;margin-top:8px;font-size:15px;color:#c9d6ee;line-height:1.6}
.ccm .ccd .mi .fx{font-size:14px;color:#c9a7ff;line-height:1.5;margin-top:4px}
.ccm .ccd .mi .ft{display:flex;align-items:center;gap:14px;margin-top:10px;font-size:14px;color:var(--dim);flex-wrap:wrap}
.ccm .ccd .mi .ft b{font:700 15px var(--en);color:var(--text)}
.ccm .ccd .mi .ft .go{margin-left:auto;display:flex;gap:6px}
.ccm .ccd .mi .ft button{border:1px solid var(--line);background:rgba(20,40,80,.8);color:#cfe9ff;font:700 14px var(--jp);padding:5px 14px;cursor:pointer;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}
.ccm .ccd .mi .ft button:hover{background:rgba(60,200,255,.35);color:#fff}
.ccm .ccd .mi.end{opacity:.8}.ccm .ccd .mi .res{margin-top:6px;font-size:15px}
/* 紀錄 */
.ccm .ccd .sum{display:flex;gap:10px;padding:0 24px 12px;flex:none}
.ccm .ccd .sum div{flex:1;padding:8px 12px;background:rgba(12,20,42,.7);border-bottom:2px solid var(--c)}
.ccm .ccd .sum b{display:block;font:700 30px/1 var(--en);color:var(--c)}.ccm .ccd .sum small{font-size:14px;color:var(--dim)}
.ccm .ccd .wk{display:flex;align-items:center;gap:10px;margin:14px 0 6px;font:700 14px var(--en);letter-spacing:.2em;color:var(--cyan)}
.ccm .ccd .wk::after{content:"";flex:1;height:1px;background:var(--line2)}
.ccm .ccd .wk:first-child{margin-top:0}
.ccm .ccd .le{padding:6px 10px 6px 12px;border-left:3px solid var(--c);background:rgba(12,20,42,.55);margin-top:4px;font-size:15px;line-height:1.55;color:#dfe8fa}
.ccm .ccd .more{display:block;margin:12px auto 0;border:1px solid var(--line);background:rgba(20,40,80,.8);color:#cfe9ff;font:700 13px var(--jp);padding:6px 18px;cursor:pointer}
`;
const CCD_LOGC = [['ok', '好事', '#3fdf8f'], ['bad', '損失', '#ff4d5e'], ['ev', '事件', '#c9a7ff'], ['', '一般', '#8fa3c7']];
const ccdCat = (x) => (x.c === 'ok' || x.c === 'bad' || x.c === 'ev' ? x.c : '');
const ccdK = () => (typeof ccmK === 'function' ? ccmK() : 1);
// kind：'mis'（arg＝{ tab: 'open'|'end' }）、'log'（arg＝{ mode: 'week'|'all', f: 篩選 }）
function ccdOpen(kind, arg) {
  if (document.querySelector('.sm-box.ccm-sheet') && typeof smuCloseModal === 'function') smuCloseModal();   // 右側同一個位置：小隊／船塢／研發等面板先收起
  CC.drw = { kind, arg: arg || {} }; ccdDraw(); ccdRefit(); }
function ccdClose() { CC.drw = null; const d = gEl('cc-drw'); if (d) d.remove(); ccdRefit(); cclHostCheck(); }
// 星圖的可用範圍跟著面板變（ccmArea），卡片重新定位
function ccdRefit() { if (!gEl('cc-cv')) return; ccDraw(); const el = gEl('cc-card'); if (el && !el.hidden) CC_place(el); }
function ccdRestore() { if (CC.drw) ccdDraw(true); }
function ccdDraw(quiet) {
  const W = document.querySelector('.ccm'), S = CC.S; if (!W || !S || !CC.drw) return;
  let d = gEl('cc-drw'); const fresh = !d;
  if (!d) { d = document.createElement('div'); d.id = 'cc-drw'; d.className = 'ccd ccm-z'; W.appendChild(d); }
  const k = ccdK(); d.style.top = '150px'; d.style.height = Math.max(360, innerHeight / k - 150 - 200) + 'px';
  const { kind, arg } = CC.drw;
  d.innerHTML = `<div class="tilt"${quiet || !fresh ? ' style="animation:none"' : ''}>${kind === 'mis' ? ccdMisHtml(S, arg) : ccdLogHtml(S, arg)}</div>`;
  d.style.setProperty('--pc', kind === 'mis' ? 'var(--gold)' : arg.mode === 'week' ? 'var(--cyan)' : 'var(--violet)');
  d.querySelector('.x').onclick = ccdClose;
  d.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { arg.tab = b.dataset.tab; ccdDraw(true); }));
  d.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { arg.f = b.dataset.f === arg.f ? null : b.dataset.f; ccdDraw(true); }));
  d.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => { CC.sel = +b.dataset.goto; ccCard(); }));
  d.querySelectorAll('[data-brief]').forEach((b) => (b.onclick = () => { const M = S.missions.find((x) => x.id === +b.dataset.brief); if (M) ccBrief(M, true); }));
  const more = d.querySelector('[data-all]'); if (more) more.onclick = () => { arg.mode = 'all'; arg.f = null; ccdDraw(true); };
}
function ccdMisHtml(S, arg) {
  const open = S.missions.filter((M) => M.state === 'open'), end = S.missions.filter((M) => M.state !== 'open' && M.res).slice(-8).reverse();
  const tab = arg.tab === 'end' ? 'end' : 'open';
  const card = (M) => {
    const t = S.sys[M.sys], left = M.due - S.turn, mc = M.type === 'cap' ? 'var(--red)' : 'var(--violet)';
    const st = M.state === 'done' ? ['完成', 'var(--own)'] : M.state === 'fail' ? ['失敗', 'var(--red)'] : M.state === 'gone' ? ['取消', 'var(--dim)'] : null;
    return `<div class="mi${st ? ' end' : ''}" style="--mc:${M.exam ? 'var(--gold)' : mc}">
      <div class="t">${M.exam ? `<span class="tag ex">升遷考核・${smuEsc(M.exam)}</span>` : ''}<span class="tag" style="--mc:${mc}">${M.type === 'cap' ? '佔領' : '特戰'}</span><h4>${ccMisName(M)}</h4></div>
      <div class="left">${st ? `<b style="color:${st[1]};font-size:22px">${st[0]}</b><small>第 ${M.due} 週到期</small>` : `<b style="color:${left <= 2 ? 'var(--red)' : left <= 4 ? 'var(--yellow)' : 'var(--text)'}">${left}</b><small>週後到期</small>`}</div>
      <div class="d">${CC_MIS[M.type].desc(S, M)}</div>
      ${M.type === 'op' && !st ? `<div class="fx">成功的影響：${CC_OPFX[M.op].fx(S, M)}</div>` : ''}
      ${st ? `<div class="res" style="color:${st[1]}">${smuEsc(M.res)}</div>` : `<div class="ft"><span>地點 <span style="color:${ccFacCol(S, t.owner)};font-weight:700">${smuEsc(t.name)}</span></span><span>資金 <b style="color:var(--gold)">${M.reward.money}</b></span><span>戰功 <b style="color:var(--own)">${M.reward.merit}</b></span>
        <span class="go"><button type="button" data-goto="${M.sys}">看目標</button><button type="button" data-brief="${M.id}">簡報</button></span></div>`}</div>`;
  };
  const L = tab === 'end' ? end : open;
  return `<div class="hd"><h2>任務</h2><span class="en">MISSIONS ・ WEEK ${S.turn}</span><button type="button" class="x" title="收起">✕</button></div>
    <div class="tabs"><button type="button" class="tb${tab === 'open' ? ' on' : ''}" data-tab="open">進行中<b>${open.length}</b></button><button type="button" class="tb${tab === 'end' ? ' on' : ''}" data-tab="end">最近結束<b>${end.length}</b></button></div>
    <div class="bd">${L.length ? L.map(card).join('') : `<div class="emp">${tab === 'open' ? `目前沒有任務。上級每 3 週交辦新任務（同時最多 ${ccMaxMis(S)} 個）。` : '還沒有結束的任務。'}</div>`}</div>`;
}
function ccdLogHtml(S, arg) {
  const wk = arg.mode === 'week', from = S.turn - 1;
  const all = (wk ? S.log.filter((x) => x.turn >= from) : S.log.slice(-200)).slice().reverse();
  const cnt = Object.fromEntries(CCD_LOGC.map(([c]) => [c, all.filter((x) => ccdCat(x) === c).length]));
  const L = arg.f != null ? all.filter((x) => ccdCat(x) === arg.f) : all;
  const groups = []; for (const x of L) { const g = groups[groups.length - 1]; if (g && g.t === x.turn) g.L.push(x); else groups.push({ t: x.turn, L: [x] }); }
  const col = Object.fromEntries(CCD_LOGC.map(([c, , v]) => [c, v]));
  return `<div class="hd"><h2>${wk ? `第 ${from} 週的戰報` : '紀錄'}</h2><span class="en">${wk ? 'WEEKLY REPORT' : 'LOG'}</span><button type="button" class="x" title="收起">✕</button></div>
    ${wk ? `<div class="sum">${CCD_LOGC.slice(0, 3).map(([c, n, v]) => `<div style="--c:${v}"><b>${cnt[c]}</b><small>${n}</small></div>`).join('')}</div>` : ''}
    <div class="tabs">${CCD_LOGC.map(([c, n, v]) => `<button type="button" class="tb${arg.f === c ? ' on' : ''}" data-f="${c}" style="--c:${v}"><i></i>${n}<b>${cnt[c]}</b></button>`).join('')}</div>
    <div class="bd">${groups.length ? groups.map((g) => `<div class="wk">WEEK ${g.t}</div>${g.L.map((x) => `<div class="le" style="--c:${col[ccdCat(x)]}">${smuEsc(x.t)}</div>`).join('')}`).join('') : `<div class="emp">${arg.f != null ? '這個分類沒有紀錄。' : wk ? '上週沒有大事。' : '沒有紀錄。'}</div>`}
      ${wk ? '<button type="button" class="more" data-all="1">看全部紀錄</button>' : ''}</div>`;
}
