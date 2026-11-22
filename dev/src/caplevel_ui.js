// ═══════════════════════ 艦長生涯：升級、階級的圖像化（2026-11-19）═══════════════════════
// 照使用者的方向：升級、階級相關的畫面不要只是文字，用樹狀結構、顏色表現。
//   研發樹：節點＋連線，欄＝前置的深度，列＝分類；點節點看細節、開始研究。
//   軍階：四階的階梯，每一階新增的東西（小隊、船型、任務、據點、私人建築）用色塊標出來；戰功進度條。
//   船的等級：Lv1～5 的軌道，顏色＝那一級能裝到的 Mk（灰 Mk I、藍 Mk II、金 Mk III），研發沒到的段落打斜線。
//   艦長熟練度、星球建築：等級格子。
// 顏色：綠＝完成／已有、紫＝研究中／進行中、青＝現在可以做、金＝軍階／藍圖、紅＝不夠、灰＝鎖住。
const CCV_CSS = `
.ccm-sheet .ccv-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--dim);margin:2px 0 8px}
.ccm-sheet .ccv-legend i{display:inline-block;width:10px;height:10px;margin-right:5px;vertical-align:-1px;border:2px solid var(--c);background:var(--b,transparent)}
/* 研發樹：每個項目一個圖示，點了才在右邊出現說明 */
.ccv-tw{position:relative;overflow-x:auto;overflow-y:hidden;margin:4px 0 6px;padding-bottom:4px}   /* 樹變長時左右捲動；說明浮在樹的上面 */
.ccv-tw::-webkit-scrollbar{height:6px}.ccv-tw::-webkit-scrollbar-thumb{background:rgba(120,160,220,.4)}
.ccv-tree{position:relative}
.ccv-tree svg.ln{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.ccv-lane{position:absolute;left:0;width:26px;display:flex;align-items:center;justify-content:center;border-left:3px solid var(--line2);background:rgba(12,20,42,.5)}
.ccv-lane b{writing-mode:vertical-rl;font:900 12px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.3em;color:var(--dim)}
.ccv-n{position:absolute;width:60px;height:60px;padding:2px;box-sizing:border-box;cursor:pointer;background:var(--c);clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px),0 14px);transition:transform .12s}
.ccv-n > div{position:relative;width:100%;height:100%;display:grid;place-items:center;background:rgb(10,16,34);clip-path:polygon(13px 0,calc(100% - 13px) 0,100% 13px,100% calc(100% - 13px),calc(100% - 13px) 100%,13px 100%,0 calc(100% - 13px),0 13px)}
.ccv-n svg,.ccv-det .hd svg{width:32px;height:32px;fill:none;stroke:var(--c);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ccv-n:hover{transform:scale(1.08)}
.ccv-n.done > div{background:rgba(20,70,48,.95)}
.ccv-n.cur > div{background:rgba(52,30,96,.95)}
.ccv-n.ok > div{background:rgba(14,50,80,.95)}
.ccv-n.lock,.ccv-n.bp{opacity:.7}
.ccv-n.sel{background:#fff;transform:scale(1.12)}
.ccv-n .pg{position:absolute;left:0;right:0;bottom:0;height:5px;background:rgba(255,255,255,.12)}.ccv-n .pg i{display:block;height:100%;background:var(--violet)}
.ccv-bd{position:absolute;width:18px;height:18px;display:grid;place-items:center;font:900 10px/1 'Noto Sans TC',sans-serif;color:#04122a;background:var(--c);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);pointer-events:none}
.ccv-gd{position:absolute;font-size:14px;color:var(--gold);text-shadow:0 0 4px #000;pointer-events:none}
.ccv-n.cur{animation:ccvPulse 1.6s ease-in-out infinite}
@keyframes ccvPulse{50%{filter:brightness(1.35)}}
.ccv-det{position:absolute;z-index:3;width:300px;box-sizing:border-box;padding:14px 16px;background:rgba(8,14,32,.97);border:1px solid var(--line2);border-top:3px solid var(--c);box-shadow:0 10px 30px rgba(0,0,0,.6);display:flex;flex-direction:column;gap:8px;animation:ccvIn .16s ease-out}
.ccv-det .x{position:absolute;right:8px;top:6px;border:0;background:none;color:var(--dim);font-size:16px;cursor:pointer}.ccv-det .x:hover{color:#fff}
@keyframes ccvIn{from{opacity:0;transform:scale(.96)}}
.ccv-det .hd{display:flex;gap:10px;align-items:center}
.ccv-det .hd svg{flex:none;width:36px;height:36px}
.ccv-det h5{margin:0;font:900 18px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#fff}
.ccv-det .lab{font:700 13px var(--en);color:var(--c);letter-spacing:.04em}
.ccv-det .d{font-size:13.5px;color:#cfd8e3;line-height:1.55}
.ccv-det .need{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:var(--dim)}
.ccv-det .g-btn{align-self:flex-start}
.ccv-empty{padding:30px 16px;text-align:center;color:var(--dim);font-size:13.5px;line-height:1.7;border:1px dashed var(--line2)}
.ccv-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;font-size:12.5px;font-weight:700;color:var(--c);border:1px solid var(--c);background:rgba(10,16,34,.7);transform:skewX(-10deg)}
.ccv-chip > *{transform:skewX(10deg)}
.ccv-chip.new{color:#04122a;background:var(--c)}
.ccv-chip.off{color:var(--mute);border-color:var(--mute)}
/* 軍階的階梯 */
.ccv-ladder{display:flex;align-items:flex-end;gap:6px;margin:10px 0 4px}
.ccv-step{flex:1;position:relative;display:flex;flex-direction:column;padding:10px 10px 12px;box-sizing:border-box;background:rgba(12,20,42,.78);border-top:4px solid var(--c);
  clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)}
.ccv-step.past{--c:var(--own)}.ccv-step.now{--c:var(--gold);background:linear-gradient(180deg,rgba(80,60,10,.55),rgba(12,20,42,.85) 60%)}.ccv-step.next{--c:var(--cyan)}.ccv-step.far{--c:var(--mute)}
.ccv-step .ic{width:46px;height:40px}
.ccv-step.far .ic{opacity:.45}
.ccv-step .nm{font:900 17px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#fff;margin-top:2px;white-space:nowrap}
.ccv-step.far .nm{color:#9aa7bd}
.ccv-step .req{font:700 12px var(--en);color:var(--c);letter-spacing:.06em;margin-bottom:8px}
.ccv-step .st{position:absolute;right:10px;top:10px;font:700 11px var(--en);letter-spacing:.14em;color:var(--c)}
.ccv-step .ul{display:flex;flex-direction:column;gap:5px;margin-top:auto}
.ccv-step .pips{display:flex;gap:3px;align-items:center;font-size:12px;color:var(--dim)}
.ccv-step .pips i{width:12px;height:12px;background:var(--c);clip-path:polygon(50% 0,100% 100%,0 100%)}
.ccv-step .pips i.o{background:rgba(255,255,255,.14)}
.ccv-mer{position:relative;height:12px;margin:12px 0 4px;background:rgba(255,255,255,.08)}
.ccv-mer i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,var(--own),var(--gold))}
.ccv-mer b{position:absolute;top:-3px;bottom:-3px;width:2px;background:rgba(255,255,255,.5)}
.ccv-merl{display:flex;justify-content:space-between;font:700 12px var(--en);color:var(--dim)}
/* 船的等級軌道 */
.ccv-lv{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:8px 0 2px}
.ccv-lv > div{position:relative;height:30px;background:rgba(255,255,255,.07);border-bottom:3px solid var(--c);display:flex;align-items:center;justify-content:center;font:700 14px var(--en);color:var(--dim);overflow:hidden}
.ccv-lv > div > i{position:absolute;left:0;top:0;bottom:0;background:var(--c);opacity:.5}
.ccv-lv > div > span{position:relative}
.ccv-lv > div.on{color:#04122a}.ccv-lv > div.on > i{opacity:.9}
.ccv-lv > div.me{outline:2px solid #fff;outline-offset:-2px;color:#fff}
.ccv-lv > div.rs::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(135deg,transparent 0 6px,rgba(0,0,0,.45) 6px 9px)}
.ccv-lvb{display:grid;grid-template-columns:2fr 2fr 1fr;gap:4px;font:700 12px var(--en);letter-spacing:.08em}
.ccv-lvb span{text-align:center;color:var(--c);border-top:1px solid var(--c);padding-top:2px}
.ccv-lvb span small{font:600 11px 'Noto Sans TC',sans-serif;color:var(--dim);letter-spacing:0;margin-left:4px}
/* 等級格子（熟練度、建築） */
.ccv-pips{display:inline-flex;gap:3px;vertical-align:middle}
.ccv-pips i{width:14px;height:8px;background:rgba(255,255,255,.12);transform:skewX(-20deg)}
.ccv-pips i.on{background:var(--c)}
.ccv-pips i.q{background:var(--violet);animation:ccvPulse2 1.2s ease-in-out infinite}
@keyframes ccvPulse2{50%{opacity:.35}}
.ccv-prof{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.ccv-prof > div{padding:7px 10px;background:rgba(12,20,42,.75);border-left:3px solid var(--c)}
.ccv-prof .h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px}
.ccv-prof .h .ccv-pips{margin-left:auto}
.ccv-prof .x{font-size:12px;color:var(--dim);margin-top:3px}
.ccv-prof .x b{color:var(--gold)}
.ccv-prof .bar{height:3px;margin-top:4px;background:rgba(255,255,255,.08)}.ccv-prof .bar i{display:block;height:100%;background:var(--c)}
`;
function ccvCss() { if (!gEl('ccv-css')) { const st = document.createElement('style'); st.id = 'ccv-css'; st.textContent = CCV_CSS; document.head.appendChild(st); } }
const ccvPips = (n, on, c, q) => `<span class="ccv-pips" style="--c:${c}">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? 'on' : i < q ? 'q' : ''}"></i>`).join('')}</span>`;

// ───── 研發樹 ─────
const CCV_TC = { done: 'var(--own)', cur: 'var(--violet)', ok: 'var(--cyan)', rp: 'var(--cyan)', lock: 'var(--mute)', bp: 'var(--gold)' };
function ccvTechSt(S, id) {
  const X = ccT(S), T = CC_TECH[id], bk = ccBpKey(T);
  if (X.done[id]) return 'done';
  if (X.cur && X.cur.id === id) return 'cur';
  if (ccForeignK(S, bk) && !ccHasBp(S, bk)) return 'bp';
  if ((T.need || []).some((k) => !X.done[k])) return 'lock';
  return S.pl.rp >= ccTechCost(S, id) ? 'ok' : 'rp';
}
// 版面：欄＝前置的深度；每個分類一條（或幾條）橫列，同一條鏈排在同一列
function ccvTechLayout(S) {
  const ids = CC_TECH_ORDER.filter((id) => !(CC_TECH[id].cp && !ccForeignK(S, ccBpKey(CC_TECH[id]))));
  const dep = {}, d = (id) => dep[id] != null ? dep[id] : (dep[id] = Math.max(-1, ...(CC_TECH[id].need || []).filter((k) => ids.includes(k)).map(d)) + 1);
  ids.forEach(d);
  const pos = {}, lanes = []; let row = 0;
  for (const g of [...new Set(ids.map((id) => CC_TECH[id].g))]) {
    const L = ids.filter((id) => CC_TECH[id].g === g), rows = [];
    if (L.every((id) => !dep[id])) L.forEach((id, i) => { const r = Math.floor(i / 3); (rows[r] = rows[r] || new Set()).add(i % 3); pos[id] = { c: i % 3, r: row + r }; });   // 沒有前置：照順序排滿三欄
    else for (const id of L) {
      const c = dep[id], par = (CC_TECH[id].need || []).find((k) => pos[k] && CC_TECH[k].g === g);
      let r = par != null ? pos[par].r - row : -1;
      if (r < 0 || rows[r].has(c)) { r = rows.findIndex((o) => !o.has(c)); if (r < 0) { r = rows.length; rows.push(new Set()); } }
      rows[r].add(c); pos[id] = { c, r: row + r };
    }
    lanes.push({ g, r0: row, n: rows.length }); row += rows.length;
  }
  return { ids, pos, lanes, rows: row };
}
// 每個項目的圖示（viewBox 24×24，線條）；模組類用裝備的圖示（capicons_ui.js 的 CC_MODICO，viewBox 20×20）
const CCV_TICO = {
  mk2: '<path d="M5 14l7-5 7 5M5 19l7-5 7 5"/><path d="M12 3v3"/>',
  mk3: '<path d="M5 10l7-5 7 5M5 15l7-5 7 5M5 20l7-5 7 5"/>',
  ew: '<circle cx="12" cy="17" r="2"/><path d="M8 13a5.5 5.5 0 018 0M5 10a10 10 0 0114 0M2 7a14 14 0 0120 0"/>',
  stealth: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20L20 4"/>',
  lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7.5 15h9"/>',
  yard1: '<circle cx="9" cy="10" r="3"/><path d="M9 4v2M9 14v2M3 10h2M13 10h2M4.8 5.8l1.4 1.4M11.8 12.8l1.4 1.4M4.8 14.2l1.4-1.4M11.8 7.2l1.4-1.4"/><path d="M14 20l3-3 4 4"/>',
  yard2: '<path d="M3 8h18M3 16h18"/><path d="M6 5v6M10 5v6M6 13v6M10 13v6"/><path d="M14 6.5l4 1.5-4 1.5zM14 14.5l4 1.5-4 1.5z"/>',
  bomb: '<path d="M12 3v7M9 7l3 3 3-3"/><circle cx="12" cy="16" r="4.5"/><path d="M5 21h14"/>',
  rjam: '<path d="M4 12h3l2-5 3 10 3-8 2 3h3"/><path d="M3 4l18 16"/>',
  scorch: '<path d="M12 21c-4 0-6.5-2.8-6.5-6.3 0-3.7 3-5.3 3.6-9.2 2.3 1.6 3.4 3.7 3.4 6 1-.8 1.6-2 1.7-3.4 2.4 2 4.3 4.3 4.3 6.7 0 3.4-2.6 6.2-6.5 6.2z"/>',
};
function ccvTSvg(id) {
  const T = CC_TECH[id], mk = T.gear && ccGearIcoKey(T.gear);
  if (mk && typeof CC_MODICO !== 'undefined' && CC_MODICO[mk]) return `<svg viewBox="0 0 20 20">${CC_MODICO[mk]}</svg>`;
  const sc = /^(scorch|bomb)(\d)/.exec(id), n = sc ? +sc[2] : 0;
  const dots = Array.from({ length: n }, (_, i) => `<circle cx="${12 + (i - (n - 1) / 2) * 3.6}" cy="16.5" r="1.1" fill="var(--c)" stroke="none"/>`).join('');
  return `<svg viewBox="0 0 24 24">${sc ? CCV_TICO[sc[1]] + (sc[1] === 'bomb' ? dots.replace(/cy="16.5"/g, 'cy="16"').replace(/fill="var\(--c\)"/g, 'fill="#04122a"') : dots) : CCV_TICO[id] || '<circle cx="12" cy="12" r="7"/>'}</svg>`;
}
const CCV_LOCK = '<svg viewBox="0 0 12 12" width="9" height="9" style="stroke:none"><rect x="2" y="5" width="8" height="6" fill="#04122a"/><path d="M4 5V3.5a2 2 0 014 0V5" stroke="#04122a" stroke-width="1.6" fill="none"/></svg>';
function ccvTechTree(S, sel) {
  const { ids, pos, lanes } = ccvTechLayout(S), X = ccT(S);
  const CW = 96, RH = 76, LG = 10, X0 = 38, NW = 60, NH = 60;
  const li = {}; lanes.forEach((l, i) => { for (let r = l.r0; r < l.r0 + l.n; r++) li[r] = i; });
  const xy = (id) => { const p = pos[id]; return [X0 + p.c * CW, 8 + p.r * RH + li[p.r] * LG]; };
  const H = Math.max(...ids.map((id) => xy(id)[1])) + NH + 6, W = X0 + 2 * CW + NW + 8;
  let lines = '';
  for (const id of ids) for (const k of CC_TECH[id].need || []) {
    if (!pos[k]) continue;
    const [ax, ay] = xy(k), [bx, by] = xy(id), st = ccvTechSt(S, id), c = X.done[id] ? '#3fdf8f' : X.done[k] ? (st === 'cur' ? '#a97bff' : '#3cc8ff') : '#5d6f92';
    const x1 = ax + NW, y1 = ay + NH / 2, x2 = bx - 3, y2 = by + NH / 2, m = (x1 + x2) / 2;
    lines += `<path d="M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}" stroke="${c}" stroke-width="${X.done[k] ? 2.5 : 1.6}" fill="none"${X.done[k] ? '' : ' stroke-dasharray="5 4"'}/><path d="M${x2 - 6} ${y2 - 4}L${x2} ${y2}L${x2 - 6} ${y2 + 4}" stroke="${c}" stroke-width="2" fill="none"/>`;
  }
  const lane = lanes.map((l, i) => `<div class="ccv-lane" style="top:${8 + l.r0 * RH + i * LG}px;height:${(l.n - 1) * RH + NH}px"><b>${l.g}</b></div>`).join('');
  const node = (id) => {
    const T = CC_TECH[id], st = ccvTechSt(S, id), [x, y] = xy(id), c = CCV_TC[st];
    const bd = { done: '✓', lock: CCV_LOCK, bp: '藍' }[st];
    return `<div class="ccv-n ${st}${sel === id ? ' sel' : ''}" data-tn="${id}" style="--c:${c};left:${x}px;top:${y}px" title="${T.name}"><div>${ccvTSvg(id)}${st === 'cur' ? `<div class="pg"><i style="width:${Math.round((1 - X.cur.left / X.cur.tot) * 100)}%"></i></div>` : ''}</div></div>`
      + (bd ? `<span class="ccv-bd" style="--c:${c};left:${x + NW - 12}px;top:${y - 6}px">${bd}</span>` : '')
      + (T.good === S.fac && st !== 'done' ? `<span class="ccv-gd" style="left:${x - 5}px;top:${y - 9}px">★</span>` : '');
  };
  return `<div class="ccv-tree" style="width:${W}px;height:${H}px"><svg class="ln" width="${W}" height="${H}">${lines}</svg>${lane}${ids.map(node).join('')}${ccvTechDet(S, sel)}</div>`;
}
// 說明浮在選中的圖示旁邊：右邊放得下就放右邊，不然放左邊；不超出樹的上下
function ccvTechPlace() {
  const d = document.querySelector('.ccv-det'), w = document.querySelector('.ccv-tw'), t = document.querySelector('.ccv-tree'); if (!d || !w || !t) return;
  const n = t.querySelector('.ccv-n.sel'); if (!n) return;
  const x = n.offsetLeft, y = n.offsetTop, dw = d.offsetWidth, dh = d.offsetHeight, vr = w.scrollLeft + w.clientWidth;
  const L = x + 60 + 14 + dw <= Math.max(vr, t.offsetWidth) ? x + 60 + 14 : Math.max(w.scrollLeft, x - 14 - dw);
  if (dh > t.offsetHeight) t.style.minHeight = dh + 'px';
  d.style.left = L + 'px'; d.style.top = Math.max(0, Math.min(y - 12, Math.max(t.offsetHeight, dh) - dh)) + 'px';
  if (L + dw > vr) w.scrollLeft = L + dw - w.clientWidth + 8; else if (L < w.scrollLeft) w.scrollLeft = L - 8;
  d.scrollIntoView({ block: 'nearest', inline: 'nearest' });   // 說明在面板下緣外面時，面板捲過去
}
// 點了圖示才出現：說明、前置、會解鎖什麼、花費、開始研究
function ccvTechDet(S, id) {
  if (!id) return '';
  const T = CC_TECH[id], st = ccvTechSt(S, id), why = ccTechWhy(S, id), X = ccT(S), c = CCV_TC[st];
  const need = (T.need || []).map((k) => `<span class="ccv-chip${X.done[k] ? '' : ' off'}" style="--c:var(--own)"><span>${X.done[k] ? '✓' : '🔒'} ${CC_TECH[k].name}</span></span>`).join('');
  const kids = CC_TECH_ORDER.filter((k) => (CC_TECH[k].need || []).includes(id)).map((k) => `<span class="ccv-chip" style="--c:var(--cyan)"><span>→ ${CC_TECH[k].name}</span></span>`).join('');
  const lab = { done: '已完成', cur: `研究中・剩 ${X.cur && X.cur.left} 週`, ok: '可以研究', rp: '研究點數不夠', lock: '前置還沒完成', bp: `要${CC_ORG[ccBpKey(T)] != null ? SM_FAC[CC_ORG[ccBpKey(T)]].name : ''}的藍圖` }[st];
  return `<div class="ccv-det" style="--c:${c}"><button type="button" class="x" title="收起">✕</button><div class="hd">${ccvTSvg(id)}<div><h5>${T.name}</h5><div class="lab">${lab}</div></div></div>
    <div class="lab" style="color:var(--dim)">${ccTechCost(S, id)} 點・${T.w} 週${T.good === S.fac ? '・<span style="color:var(--gold)">★ 你的陣營擅長（−20%）</span>' : ''}</div>
    <div class="d">${T.desc}</div>
    ${need ? `<div class="need">前置 ${need}</div>` : ''}${kids ? `<div class="need">解鎖 ${kids}</div>` : ''}
    ${st === 'done' || st === 'cur' ? '' : `<button class="g-btn${why ? '' : ' primary'}" data-tech="${id}" ${why ? 'disabled' : ''}>${why ? smuEsc(why) : '開始研究'}</button>`}</div>`;
}
const CCV_LEGEND_T = `<div class="ccv-legend"><span><i style="--c:var(--own);--b:var(--own)"></i>已完成</span><span><i style="--c:var(--violet);--b:var(--violet)"></i>研究中</span><span><i style="--c:var(--cyan)"></i>可以研究</span><span><i style="--c:var(--gold)"></i>要藍圖</span><span><i style="--c:var(--mute)"></i>前置還沒完成</span><span style="color:var(--gold)">★ 你的陣營擅長</span><span style="margin-left:auto">點圖示看說明</span></div>`;

// ───── 軍階的階梯 ─────
function ccRankView() {
  ccvCss();
  const S = CC.S, cur = S.pl.rank || 0, N = CC_RANKS[cur + 1], mer = Math.round(S.pl.merit), exam = S.missions.find((M) => M.exam && M.state === 'open');
  const st = (i) => (i < cur ? 'past' : i === cur ? 'now' : i === cur + 1 ? 'next' : 'far');
  const steps = CC_RANKS.map((R, i) => {
    const P = CC_RANKS[i - 1], nw = (on) => (on && i > 0 ? ' new' : ''), c = { past: 'var(--own)', now: 'var(--gold)', next: 'var(--cyan)', far: 'var(--mute)' }[st(i)];
    const hullNew = R.hulls.filter((k) => !P || !P.hulls.includes(k));
    const chips = [
      `<div class="pips">${Array.from({ length: 4 }, (_, k) => `<i class="${k < R.sq ? '' : 'o'}"></i>`).join('')}<span style="margin-left:4px">小隊 ${R.sq}</span></div>`,
      ...hullNew.map((k) => `<span class="ccv-chip${nw(1)}" style="--c:${c}"><span>${i ? '+' : ''}${CAP_HULLS[k].name}</span></span>`),
      `<span class="ccv-chip${nw(P && R.mis > P.mis)}" style="--c:${c}"><span>任務 ${R.mis}</span></span>`,
      R.base ? `<span class="ccv-chip${nw(P && R.base > P.base)}" style="--c:${c}"><span>${R.base > 1 ? '據點＋防禦站' : '自己的據點'}</span></span>` : '',
      CP_RULE.pvRank[i] ? `<span class="ccv-chip${nw(P && CP_RULE.pvRank[i] > CP_RULE.pvRank[i - 1])}" style="--c:${c}"><span>私人建築 ${CP_RULE.pvRank[i]}</span></span>` : '',
    ].join('');
    return `<div class="ccv-step ${st(i)}" style="min-height:${190 + i * 44}px" title="${R.desc}"><span class="st">${{ past: 'DONE', now: 'NOW', next: 'NEXT', far: '' }[st(i)]}</span>
      <svg class="ic" viewBox="0 0 46 40">${CCL_RANK_ICON[Math.min(3, i)].replace(/#e8f2ff/g, st(i) === 'far' ? '#7d8aa3' : st(i) === 'now' ? '#ffd27a' : '#e8f2ff')}</svg>
      <div class="nm">${R.name}</div><div class="req">${R.merit ? `戰功 ${fmtN(R.merit)}` : '起點'}</div><div class="ul">${chips}</div></div>`;
  }).join('');
  const top = CC_RANKS[CC_RANKS.length - 1].merit, pct = (v) => Math.min(100, (v / top) * 100);
  const bar = `<div class="ccv-mer"><i style="width:${pct(mer)}%"></i>${CC_RANKS.slice(1).map((R) => `<b style="left:${pct(R.merit)}%" title="${R.name}"></b>`).join('')}</div>
    <div class="ccv-merl"><span>戰功 <b style="color:#fff">${fmtN(mer)}</b></span><span>${N ? `${N.name}：${fmtN(N.merit)}${mer >= N.merit ? '（已達到）' : `（還差 ${fmtN(N.merit - mer)}）`}` : '已經是最高軍階'}</span></div>`;
  const nx = !N ? '' : exam ? `<div class="ccs-note" style="border-left-color:var(--gold)">升遷考核進行中：<b style="color:var(--gold)">${ccMisName(exam)}</b>，剩 ${exam.due - S.turn} 週。完成就升任${N.name}。</div>`
    : mer >= N.merit ? `<div class="ccs-note" style="border-left-color:var(--gold)">戰功已經夠了：${(S.pl.examCd || 0) > S.turn ? `第 ${S.pl.examCd} 週上級會再發升遷考核。` : '下一週上級會發「升遷考核」（佔領任務），完成就升任。'}</div>`
    : `<div class="ccs-note">戰功到 ${fmtN(N.merit)} 後，上級會發「升遷考核」（佔領任務），完成就升任${N.name}。戰功來自任務、打贏的戰鬥。</div>`;
  ccmSheet(`<h3>軍階<span class="en">RANK ・ ${CC_RANKS[cur].name}</span></h3>
    <div class="ccv-legend"><span><i style="--c:var(--own);--b:var(--own)"></i>已經升過</span><span><i style="--c:var(--gold);--b:var(--gold)"></i>現在</span><span><i style="--c:var(--cyan)"></i>下一階</span><span><span class="ccv-chip new" style="--c:var(--cyan)"><span>實心</span></span> 這一階新增的</span></div>
    <div class="ccv-ladder">${steps}</div>${bar}${nx}
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`, '', 'var(--gold)');
  gEl('cc-close').onclick = smuCloseModal;
}

// ───── 船的等級軌道 ─────
function ccvShipLv(S, c) {
  const L = CAP_XP.lv, res = ccMkRes(S);
  const cells = [1, 2, 3, 4, 5].map((v) => {
    const mk = capMkCapLv(v), lo = L[v - 1], hi = L[v], f = v < c.lv ? 1 : v === c.lv ? (hi == null ? 1 : (c.xp - lo) / (hi - lo)) : 0;
    return `<div class="${v < c.lv ? 'on' : ''}${v === c.lv ? ' me' : ''}${mk > res ? ' rs' : ''}" style="--c:${ccMkCol(mk)}" title="Lv${v}：${CAP_MK_NAME[mk]}${mk > res ? `（研發只到 ${CAP_MK_NAME[res]}）` : ''}${lo ? `・經驗 ${lo}` : ''}"><i style="width:${Math.round(f * 100)}%"></i><span>Lv${v}</span></div>`;
  }).join('');
  const band = (mk, n) => `<span style="--c:${ccMkCol(mk)}">${CAP_MK_NAME[mk]}${mk > res ? '<small>研發未到</small>' : ''}</span>`;
  return `<div class="ccv-lv">${cells}</div><div class="ccv-lvb">${band(1)}${band(2)}${band(3)}</div>`;
}

// ───── 艦長熟練度 ─────
function ccvProf(S, keys) {
  const P = S.pl.prof || {}, mx = CAP_PROF.lv.length - 1;
  return `<div class="ccv-prof">${keys.map((k) => {
    const x = P[k] || 0, lv = capProfLv(x), lo = CAP_PROF.lv[lv], hi = CAP_PROF.lv[lv + 1], F = CAP_PROF_FX[k.split(':')[0]], top = lv >= mx, c = top ? 'var(--gold)' : lv ? 'var(--violet)' : 'var(--mute)';
    return `<div style="--c:${c}"><div class="h">${capProfName(k)}${ccvPips(mx, lv, c)}<span style="font:700 13px var(--en);color:${c}">Lv${lv}</span></div>
      <div class="bar"><i style="width:${Math.round((hi == null ? 1 : (x - lo) / (hi - lo)) * 100)}%"></i></div>
      <div class="x">${F.name} +${Math.round(lv * CAP_PROF.per * 100)}%${top ? `・<b>${F.trait}</b>` : `・經驗 ${x}／${hi}・Lv${mx}：${F.trait}`}</div></div>`;
  }).join('')}</div>`;
}
