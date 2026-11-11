// ═══════════════════════ 艦長生涯：畫面 ═══════════════════════
// 星圖（canvas）＋星系卡片＋玩家小隊的狀態；樣式與對話框沿用星海生涯（SMU_CSS、smuModal、smuPick）。
let CC = { S: null, sel: -1, raf: 0, view: null };
function ccSummary() { const S = ccLoad(); return S ? `第 ${S.turn} 週・${CC_ROLES[S.role].name}・${S.fin ? '已結束' : `資金 ${fmtN(Math.round(S.pl.money))}`}` : '還沒開始'; }
function ccShow() {
  setPhase('menu');
  const S = ccLoad();
  if (!S) return ccNewDialog();
  CC = { S, sel: -1, raf: 0, view: null }; SMU.q = [];
  if (S.pendB) { ccSkipPlayerBattle(S, '離開了戰場'); ccWeekB(S); ccSave(S); }   // 打到一半離開：當作撤退，接著結束這一週
  if (!S.fin && !S.pendB && !S.missions.some((M) => M.state === 'open' && !M.brief)) return ccIdle(S);
  ccRender();
  if (!S.fin && !S.pendB) ccTurnStart(S, false);
}
function ccNewDialog() {
  const meta = ccMetaLoad();
  overlay(`<style>${SMU_CSS}</style><div class="g-wrap sp-wrap"><div class="g-head"><h2>艦長生涯</h2><span class="crumb">開新局</span><span class="g-sp"></span><button class="g-btn" id="cc-back">← 艦長</button></div>
    <p class="g-dim">回合制的星圖，每一回合是一週。所有勢力的兵力都是戰艦小隊，沒有艦隊戰：小隊戰的結果決定星系的所有權。你的小隊碰上敵人時，由你親自操艦；其他的戰鬥用公式計算，下令前都看得到勝率與每艘船的存活率。損傷會留到下一場，要回有維修船塢的星系花錢修理。<b>你的小隊全滅，生涯就結束。</b></p>
    <h3 style="margin:16px 0 4px">角色</h3>
    ${smuPick('cc-role', Object.entries(CC_ROLES).map(([k, R]) => ({ v: k, name: R.name, desc: R.desc, info: `開局：${R.hulls.map((h) => CAP_HULLS[h].name).join('＋')}・${R.techName}` })), 'emp', 240)}
    <h3 style="margin:16px 0 4px">開局身分</h3>
    ${smuPick('cc-start', CC_STARTS.map((X, i) => { const on = meta.best >= X.need; return { v: i, name: on ? X.name : `🔒 ${X.name}`, desc: X.desc, warn: on ? '' : `解鎖：在任何一局升到${CC_RANKS[X.need].name}`, off: !on }; }), 0, 170)}
    <h3 style="margin:16px 0 4px">難度</h3>
    ${smuPick('cc-diff', CC_DIFF.map((D, i) => { const on = !D.need || meta.best >= D.need; return { v: i, name: on ? D.name : `🔒 ${D.name}`, desc: D.desc, warn: on ? '' : `解鎖：在任何一局升到${CC_RANKS[D.need].name}`, off: !on }; }), 1, 170)}
    <p class="g-dim" style="margin-top:8px">第 ${meta.runs + 1} 局・歷來最高軍階：${CC_RANKS[meta.best].name}。升遷：戰功到了上級會發「升遷考核」（佔領任務），完成就升任，能帶的小隊、能造的船型、任務都會變多。</p>
    <div style="height:12px"></div><button class="g-btn primary" id="cc-go">開始</button></div>`);
  smuBindUi(gEl('g-screen'));
  gEl('cc-back').onclick = () => { GAME.spMode = 'captain'; showSingle(); };
  gEl('cc-go').onclick = () => { const S = ccNewGame({ seed: (Math.random() * 1e9) >>> 0, role: smuVal('cc-role') || 'emp', diff: +smuVal('cc-diff'), start: +smuVal('cc-start') || 0 }); ccSave(S); CC = { S, sel: -1, raf: 0, view: null }; ccRender(); ccTurnStart(S, false); };
}
function ccRender() {
  ccFogTick(CC.S);
  const S = CC.S, P = ccPl(S), cnt = [SM_A, SM_E, SM_P, SM_N].map((f) => S.sys.filter((s) => ccSee(S, s).owner === f).length);   // 照所知的情報（迷霧）
  const nMis = S.missions.filter((M) => M.state === 'open').length;
  overlay(`<style>${SMU_CSS}${CC_CSS}</style><div class="sm-wrap">
    <div class="sm-top"><h2>艦長生涯</h2><span class="sm-chip">第 ${S.turn} 週</span><span class="sm-chip">${CC_ROLES[S.role].name}・${ccRankOf(S).name}</span><span class="sm-chip">資金 ${fmtN(Math.round(S.pl.money))}</span><span class="sm-chip">戰功 ${Math.round(S.pl.merit)}</span>${ccTopChips(S, cnt)}
      <span class="sm-btnbar"><button class="g-btn" id="cc-mis">任務${nMis ? `<span class="sm-badge">${nMis}</span>` : ''}</button><button class="g-btn" id="cc-logb">紀錄</button><button class="g-btn" id="cc-quit">離開</button>${S.fin ? '' : `<button class="g-btn" id="cc-fly" title="回到${smuEsc(ccPl(S) ? S.sys[ccPl(S).sys].name : '')}的太空（${keyText('cap_map')}）">回到星系 ✈</button>`}<button class="g-btn primary" id="cc-end" ${S.fin ? 'disabled' : ''}>結束這一週 →</button></span></div>
    <div class="sm-map" id="cc-map"><canvas id="cc-cv"></canvas>
      <div class="sm-leg" id="cc-leg" style="cursor:pointer;pointer-events:auto">${CC.leg ? `<div><b>圖例 ▾</b></div>${['own', 'ally', 'enemy', 'neutral'].map((k) => `<div><i style="background:${SMU_REL[k].col}"></i>${k === 'own' ? '你的小隊（★＋光圈＝親自指揮，白框＝選中）' : SMU_REL[k].name}</div>`).join('')}<div>箭頭＝一個小隊：越大船越多（1～5 艘）；停在星系下方，閃爍且在航道上＝這週要移動</div><div class="g-dim">星系的顏色＝擁有者跟你的關係：藍＝你的陣營、紅＝敵對、黃＝中立／停戰</div><div>! ＝ 你的小隊下週會被進攻</div><div>◆ 軌道防禦・⚓ 維修船塢・✚ 補給站・白圈＝首都</div><div>虛線圈：圍城中・⚔ 這週會交戰</div><div>箭頭：看得到的預定動向（你的小隊周圍、偵察過的星系）</div><div>藍色虛線大圈：偵察中・亂＝指揮中斷</div><div class="g-dim">點星系看詳情；點相鄰的星系下令移動</div>` : '<div><b>圖例 ▸</b></div>'}</div>
      <div class="sm-dock" id="cc-dock"></div><div class="sm-card" id="cc-card" hidden></div></div></div>`);
  gEl('cc-quit').onclick = () => { ccSave(S); ccIdleStop(); window.removeEventListener('resize', ccResize); GAME.spMode = 'captain'; showSingle(); };
  if (gEl('cc-fly')) gEl('cc-fly').onclick = () => ccFly();
  gEl('cc-end').onclick = () => ccEndWeek();
  gEl('cc-mis').onclick = ccMissionList;
  gEl('cc-leg').onclick = () => { CC.leg = !CC.leg; ccRender(); };
  gEl('cc-logb').onclick = () => ccLogView(S.log.slice(-60).reverse(), '紀錄');
  const cv = gEl('cc-cv');
  cv.onclick = (e) => { const r = cv.getBoundingClientRect(), id = ccHit(e.clientX - r.left, e.clientY - r.top); CC.sel = id; ccCard(); };
  window.removeEventListener('resize', ccResize); window.addEventListener('resize', ccResize);
  ccDock(); ccCard();
  if (!CC.raf) CC.raf = requestAnimationFrame(ccLoop);
  if (S.fin) ccEndView();
}
const CC_CSS = `.cc-ico{width:15px;height:15px;vertical-align:-3px;margin-right:3px}.cc-chip2{display:inline-flex;align-items:center;gap:2px}.cc-chip2 b{font-weight:700;margin-right:5px}.cc-chip2 .sep{width:1px;height:12px;background:#2a3a50;margin:0 5px}
.cc-ship{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;align-items:center;margin:3px 0}.cc-ship b{font-size:12px}
.cc-bar{height:4px;background:#1a2433;border-radius:2px;overflow:hidden}.cc-bar i{display:block;height:100%}
.cc-sq{border:1px solid #1d2838;border-radius:6px;padding:5px 8px;margin:5px 0}.cc-sq.pl{border-color:#3fdf8f}
.cc-odds{font-size:20px;font-weight:700}.cc-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}.cc-tab{background:#121c2b;border:1px solid #2a3a50;color:#aab7c8;border-radius:5px;padding:2px 7px;font-size:12px;cursor:pointer}.cc-tab.on{border-color:#3fdf8f;color:#3fdf8f;background:#123024}
.cc-sq[data-sq]{cursor:pointer}.cc-sw{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}.cc-sw .cc-ship{grid-template-columns:auto 1fr auto}.cc-sw button{font-size:11px;padding:1px 6px;margin-left:3px}.cc-dock{background:#0d1522ee;border:2px solid #3fdf8f;border-radius:8px;padding:6px 10px;min-width:260px}`;
function ccResize() { ccDraw(); const el = gEl('cc-card'); if (el && !el.hidden) CC_place(el); }
function ccLoop(ts) { if (!gEl('cc-cv') || !CC.S) { CC.raf = 0; return; } ccDraw(ts); CC.raf = requestAnimationFrame(ccLoop); }
const ccXY = (s) => { const V = CC.view; return [V.ox + s.x * V.k, V.oy + s.y * V.k]; };
function ccHit(x, y) { let best = -1, bd = 26; for (const s of CC.S.sys) { const [px, py] = ccXY(s), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = s.id; } } return best; }
// 星圖上選中的我方小隊（命令的對象）；預設＝親自指揮的
const ccCur = (S) => S.sq.find((q) => q.id === CC.cur && q.pl && q.ships.length) || ccPl(S);
function ccDraw(ts) {
  const cv = gEl('cc-cv'); if (!cv || !CC.S) return;
  const S = CC.S, Q = ccCur(S), own = ccOwn(S), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, t = (ts || performance.now()) / 1000;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.min((W - 40) / 100, (H - 140) / 60); CC.view = { k, ox: (W - 100 * k) / 2, oy: Math.max(20, (H - 60 * k) / 2 - 30) };
  g.fillStyle = '#070b12'; g.fillRect(0, 0, W, H);
  const SEE = S.sys.map((s) => ccSee(S, s));
  for (const s of S.sys) { const o = SEE[s.id].owner; if (o < 0) continue; const fc = ccFacCol(S, o), [x, y] = ccXY(s), r = k * 9, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, fc + (SEE[s.id].live ? (o === SM_N ? '18' : '2a') : '10')); gr.addColorStop(1, fc + '00'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.lineWidth = 1.2; g.strokeStyle = '#243247';
  for (const [a, b] of S.edges) { const [x1, y1] = ccXY(S.sys[a]), [x2, y2] = ccXY(S.sys[b]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  // 你的小隊的移動命令（選中的較粗）
  for (const q of own) if (q.to != null) { const [x1, y1] = ccXY(S.sys[q.sys]), [x2, y2] = ccXY(S.sys[q.to]); g.strokeStyle = '#3fdf8f'; g.lineWidth = q === Q ? 3 : 1.8; g.setLineDash([8, 6]); g.lineDashOffset = -t * 20; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); }
  // 看得到的預定動向（AI 在週初就決定了）：細的虛線箭頭
  const arrows = new Map(); for (const q of S.sq) if (!q.pl && q.to != null && q.ships.length && ccSeen(S, q)) { const kk = q.sys + '>' + q.to + '>' + q.fac; arrows.set(kk, (arrows.get(kk) || 0) + 1); }
  for (const [kk, n] of arrows) {
    const [a, b, f] = kk.split('>').map(Number), [x1, y1] = ccXY(S.sys[a]), [x2, y2] = ccXY(S.sys[b]), L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    const sx = x1 + ux * 12, sy = y1 + uy * 12, ex = x2 - ux * 16, ey = y2 - uy * 16, hostile = ccHostile(S, S.fac, f), ac = SMU_REL[ccRel(S, { fac: f })].col;
    g.strokeStyle = ac; g.fillStyle = ac; g.lineWidth = hostile ? 2 + n : 1.5; g.setLineDash(hostile ? [6, 4] : [3, 5]); g.lineDashOffset = -t * 14;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(ex + ux * 8, ey + uy * 8); g.lineTo(ex - uy * 6, ey + ux * 6); g.lineTo(ex + uy * 6, ey - ux * 6); g.fill();
  }
  g.textAlign = 'center';
  const movers = [];
  for (const s of S.sys) {
    const V = SEE[s.id], [x, y] = ccXY(s), r = 5 + s.tier * 1.6, here = V.sq, mineHere = own.filter((q) => q.sys === s.id);
    if (ccIntel(S, s)) { g.strokeStyle = 'rgba(110,220,255,.35)'; g.lineWidth = 1; g.setLineDash([2, 4]); g.beginPath(); g.arc(x, y, r + 20, 0, 7); g.stroke(); g.setLineDash([]); }
    if (ccCut(S, s)) { g.fillStyle = '#ffb35a'; g.font = 'bold 10px sans-serif'; g.textAlign = 'right'; g.fillText('補給切斷', x - r - 4, y + 4); g.textAlign = 'center'; }
    if (Q && Q.sys === s.id) { const p = 0.5 + 0.5 * Math.sin(t * 3); g.strokeStyle = `rgba(63,223,143,${0.4 + 0.45 * p})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r + 8 + p * 3, 0, 7); g.stroke(); }
    else if (mineHere.length) { g.strokeStyle = 'rgba(63,223,143,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 8, 0, 7); g.stroke(); }
    if (Q && S.adj[Q.sys].includes(s.id) && !S.fin) { g.strokeStyle = 'rgba(63,223,143,.25)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r + 5, 0, 7); g.stroke(); }
    if (s.id === CC.sel) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, r + 14, 0, 7); g.stroke(); g.setLineDash([]); }
    if (V.sg) { g.strokeStyle = ccFacCol(S, V.sg.f); g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, r + 3, 0, 7); g.stroke(); g.setLineDash([]); }
    g.globalAlpha = V.live ? 1 : 0.55; g.fillStyle = V.owner < 0 ? '#3a4352' : ccFacCol(S, V.owner); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.globalAlpha = 1;
    if (V.owner < 0) { g.fillStyle = '#cfd8e3'; g.font = 'bold 11px sans-serif'; g.fillText('?', x, y + 4); }
    if (s.cap) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 1.5, 0, 7); g.stroke(); }   // 首都：白圈（黃色是中立）
    const dn = V.defs.length;
    g.fillStyle = V.live ? '#cfd8e3' : '#7d8794'; g.font = '12px sans-serif'; g.fillText(`${s.name}${V.yard ? ' ⚓' : ''}${V.depot ? ' ✚' : ''}${V.live || V.age == null ? '' : `（${V.age}週前）`}${s.id === S.pl.base ? '［據點］' : ''}`, x, y - r - 6);
    if (dn) { g.fillStyle = V.live ? '#e8eef8' : '#7d8794'; g.font = 'bold 11px sans-serif'; g.textAlign = 'left'; g.fillText('◆' + dn, x + r + 3, y + 4); g.textAlign = 'center'; }
    // 小隊：一隊一個箭頭（不寫數字），越大＝船越多；停著的錯開疊在星系下方，要移動的畫在航道上（迴圈後面畫）
    const stay = [];
    for (const q of here) { if (V.live && q.to != null && (q.pl || ccSeen(S, q))) movers.push({ q, s }); else stay.push(q); }
    stay.sort((a, b) => (a.pl - b.pl) || ((a.id === S.pl.sq) - (b.id === S.pl.sq)) || (b.ships.length - a.ships.length)).forEach((q, n) => {   // 大的在後、你的在最上面
      const ax = x + (n - (stay.length - 1) / 2) * 11, ay = y + r + 20 + (n % 2) * 4;
      ccSqIco(g, S, q, Q, ax, ay, -Math.PI / 2, 1, V.live ? 1 : 0.5);
    });
    let bx = x + r + 12;
    if (ccWillFight(S, s)) { const p = 0.5 + 0.5 * Math.sin(t * 4); g.fillStyle = `rgba(255,179,90,${p > 0.5 ? 1 : 0.7})`; g.beginPath(); g.arc(bx, y - 2, 9, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = 'bold 12px sans-serif'; g.fillText('⚔', bx, y + 2); bx += 20; }
    if (mineHere.some((q) => q.to == null && ccThreatA(S, q, q.sys).length)) { const p = 0.5 + 0.5 * Math.sin(t * 5); g.fillStyle = `rgba(255,90,80,${0.7 + 0.3 * p})`; g.beginPath(); g.arc(bx, y - 2, 9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.fillText('!', bx, y + 3); }
  }
  // 要移動的小隊：在航道中段，指向目的地、閃爍；同一條航道的錯開疊著
  const lanes = new Map(); for (const m of movers) { const kk = m.q.sys + '>' + m.q.to; if (!lanes.has(kk)) lanes.set(kk, []); lanes.get(kk).push(m.q); }
  const blink = 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(t * 7));   // 最暗也要看得到
  for (const [kk, L] of lanes) {
    const [a, b] = kk.split('>').map(Number), [x1, y1] = ccXY(S.sys[a]), [x2, y2] = ccXY(S.sys[b]), D = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / D, uy = (y2 - y1) / D, ang = Math.atan2(uy, ux);
    L.sort((p, q) => (p.pl - q.pl) || ((p.id === S.pl.sq) - (q.id === S.pl.sq)) || (q.ships.length - p.ships.length)).forEach((q, n) => {
      const d = Math.min(D * 0.72, D * 0.4 + (n - (L.length - 1) / 2) * 11);   // 航道中段
      ccSqIco(g, S, q, Q, x1 + ux * d, y1 + uy * d, ang, blink, 1);
    });
  }
}
// 預計交戰：你的小隊要開進可以進攻的星系，或已經在交戰中的星系
// 一個小隊的箭頭：n＝船數（越多越大），ang＝指向（不動＝朝上），blink＝閃爍的亮度，sel：2＝選中、1＝你的小隊
function ccArrowIco(g, x, y, n, col, ang, blink, dim, sel) {
  const len = 13 + Math.max(1, Math.min(5, n)) * 3.6, wd = len * 0.6;
  g.save(); g.translate(x, y); g.rotate(ang); g.globalAlpha = dim * blink;
  g.beginPath(); g.moveTo(len * 0.55, 0); g.lineTo(-len * 0.45, -wd); g.lineTo(-len * 0.2, 0); g.lineTo(-len * 0.45, wd); g.closePath();
  g.fillStyle = col; g.fill(); g.lineJoin = 'round';
  g.strokeStyle = sel === 2 ? '#ffffff' : '#05080d'; g.lineWidth = sel === 2 ? 2.5 : 1.5; g.stroke();
  if (sel === 1) { g.strokeStyle = '#ffffffaa'; g.lineWidth = 1; g.stroke(); }
  g.restore();
}
// 星圖上的一個小隊：箭頭＋★（親自指揮）＋「亂」（指揮中斷）
// 親自指揮的小隊要一眼認得出來：脈動的綠色光圈＋白色粗框＋白色 ★（不靠顏色深淺分辨）
function ccSqIco(g, S, q, Q, x, y, ang, blink, dim) {
  const main = q.pl && q.id === S.pl.sq;
  if (main) {
    const t = performance.now() / 1000, p = 0.5 + 0.5 * Math.sin(t * 4), R = 15 + Math.min(5, q.ships.length) * 1.8;
    g.globalAlpha = dim; g.fillStyle = `rgba(63,223,143,${0.16 + 0.12 * p})`; g.beginPath(); g.arc(x, y, R + p * 3, 0, 7); g.fill();
    g.strokeStyle = `rgba(160,255,200,${0.55 + 0.4 * p})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, R + p * 3, 0, 7); g.stroke(); g.globalAlpha = 1;
  }
  ccArrowIco(g, x, y, q.ships.length, SMU_REL[ccRel(S, q)].col, ang, main ? Math.max(0.55, blink) : blink, dim, main || (q.pl && q === Q) ? 2 : q.pl ? 1 : 0);
  if (main) { g.font = 'bold 14px sans-serif'; g.lineWidth = 3; g.strokeStyle = '#05080d'; const R = 15 + Math.min(5, q.ships.length) * 1.8 + 9; g.strokeText('★', x + R * 0.75, y + R * 0.75); g.fillStyle = '#ffffff'; g.fillText('★', x + R * 0.75, y + R * 0.75); }   // 光圈右下（上方會被 ⚔／! 蓋住）
  if (dim === 1 && ccDis(S, q)) { g.fillStyle = '#ffb35a'; g.font = 'bold 10px sans-serif'; g.fillText('亂', x + 13, y + 16); }
}
function ccWillFight(S, s) {
  if (S.fin) return false;
  const V = ccSee(S, s), o = V.owner;   // 照所知的情報（看不到的星系用舊情報）
  return ccOwn(S).some((q) => (q.to != null ? q.to : q.sys) === s.id && !q.task) && ((o >= 0 && ccHostile(S, S.fac, o) && o !== S.fac && (V.defs.length || V.sq.some((q) => q.fac === o))) || V.sq.some((q) => q.fac !== S.fac && q.fac !== SM_N && ccHostile(S, S.fac, q.fac)));
}
const ccBar = (v, col) => `<div class="cc-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;background:${col}"></i></div>`;
const ccOddCol = (v) => v >= 0.6 ? '#5fd39a' : v >= 0.4 ? '#ffd36a' : '#ff6a5a';
function ccShipBars(c) { return `<div>${ccBar(c.hp, c.hp < 0.35 ? '#ff6a5a' : '#5fd39a')}${ccBar(c.sh, '#7cc4ff')}${CAP_HULLS[c.key].msl ? ccBar(c.msl, '#ffd36a') : ''}</div>`; }
function ccShipRows(q) {
  return q.ships.map((c) => `<div class="cc-ship"><b>${CAP_HULLS[c.key].name}</b>${ccShipBars(c)}</div>`).join('') || '<div class="g-dim">（全滅）</div>';
}
const ccPartsTx = (P) => P.map(([k, v]) => `${k} ${v >= 0 ? '+' : '−'}${Math.abs(v)}`).join('、');   // 成功率的組成（百分點）
const ccSurvTx = (q, sv) => q.ships.map((c, k) => `${CAP_HULLS[c.key].name} ${Math.round((sv[k] ?? 0) * 100)}%`).join('、');
// 小隊面板：你的每個小隊一個分頁；選中的小隊＝星系卡片上命令的對象
function ccDock() {
  const S = CC.S, P = ccPl(S), Q = ccCur(S), el = gEl('cc-dock'); if (!el || !Q) return;
  const own = S.sq.filter((q) => q.pl && (q.ships.length || q === P)), s = S.sys[Q.sys], slots = ccSlots(S), next = CC_RANKS[(S.pl.rank || 0) + 1];
  const mates = own.filter((q) => q !== Q && q.sys === Q.sys && q.ships.length);
  const tk = Q.task ? `<div style="color:#c9a7ff;font-size:12px">派出：${Q.task.kind === 'raid' ? '地面突襲' : CC_OPFX[(S.missions.find((M) => M.id === Q.task.mis) || {}).op || 'run'].name}（成功率 ${Math.round(ccTaskOdds(S, Q, Q.task).p * 100)}%，週末計算）</div>` : '';
  const blds = S.pl.build.filter((b) => (b.sq || S.pl.sq) === Q.id).map((b) => CAP_HULLS[b.key || b].name);
  el.innerHTML = `<div class="cc-dock">${own.length > 1 || slots > 1 ? `<div class="cc-tabs">${own.map((q) => `<button class="cc-tab ${q === Q ? 'on' : ''}" data-sq="${q.id}">${q === P ? '★' : ''}${smuEsc(q.name)} ${q.ships.length}艘${q.to == null && ccThreatA(S, q, q.sys).length ? ' ⚠' : ''}</button>`).join('')}</div>` : ''}
    <div style="display:flex;justify-content:space-between;gap:8px"><b style="color:#3fdf8f">${Q === P ? '★ ' : ''}${smuEsc(Q.name)}・${Q.ships.length} 艘${Q === P ? '（親自指揮）' : ''}</b><span class="g-dim">在 ${s.name}${Q.to != null ? ` → ${S.sys[Q.to].name}` : ''}</span></div>
    ${ccShipRows(Q)}${tk}${ccThreat(S, Q)}
    ${Q !== P || mates.length || slots > own.length ? `<div style="display:flex;gap:6px;margin:4px 0">${Q !== P ? `<button class="g-btn" id="cc-cmd" ${P && P.ships.length && P.sys !== Q.sys ? 'disabled title="要和現在指揮的小隊在同一個星系"' : ''}>改為親自指揮</button>` : ''}${mates.length || (slots > ccOwnCount(S) && Q.ships.length > 1) ? '<button class="g-btn" id="cc-swap">換船／分隊</button>' : ''}</div>` : ''}
    <div class="g-dim" style="font-size:11px">綠＝船體・藍＝護盾・黃＝飛彈・${ccRankOf(S).name}・指揮權 ${ccOwnCount(S)}／${slots} 隊${next ? `・戰功 ${next.merit} 升遷考核（${next.name}）` : ''}${blds.length ? `・下週到：${blds.join('、')}` : ''}${Q === P && S.pl.weekFought ? '・這週已經打過一場' : ''}</div></div>`;
  el.querySelectorAll('[data-sq]').forEach((b) => (b.onclick = () => { CC.cur = +b.dataset.sq; ccDock(); ccCard(); }));
  const on = (id, fn) => { const b = gEl(id); if (b) b.onclick = fn; };
  on('cc-cmd', () => { if (ccTakeCommand(S, Q)) return; ccSave(S); ccRender(); });
  on('cc-swap', () => ccSwapView(Q));
}
// 看得到的敵方小隊，預定開進 at
const ccThreatA = (S, q, at) => S.sq.filter((x) => x.to === at && x.ships.length && ccHostile(S, x.fac, S.fac) && x.fac !== SM_N && ccSeen(S, x));
// 敵軍預定開進小隊所在（或要去）的星系：駐守的勝率、每艘船的存活率
function ccThreat(S, Q) {
  if (S.fin || Q.task) return '';
  const at = Q.to != null ? Q.to : Q.sys, s = S.sys[at], A = ccThreatA(S, Q, at);
  if (!A.length || (Q.to != null && s.owner !== S.fac)) return '';   // 開進敵方星系的勝率在星系卡片上
  const D = [Q, ...S.sq.filter((q) => q !== Q && q.fac === S.fac && q.ships.length && !q.task && (q.to != null ? q.to : q.sys) === at)].slice(0, CC_RULE.maxSq);
  const O = ccOdds(S, A.slice(0, CC_RULE.maxSq), D, s.owner === S.fac ? ccDefsAlive(s) : [], 1), w = 1 - O.win;
  return `<div style="margin:5px 0;padding:5px 7px;border:1px solid #ff6a5a;border-radius:6px;background:#2a1416"><b style="color:#ff8a7a">⚠ 下週敵軍${Q.to != null ? `開進 ${s.name}` : '來襲'}</b>：${A.map((q) => smuEsc(q.name)).join('、')}（${A.reduce((a, q) => a + q.ships.length, 0)} 艘）
    <div>駐守的勝率 <b style="color:${ccOddCol(w)}">${Math.round(w * 100)}%</b>・存活率 ${ccSurvTx(Q, (O.surv[1] && O.surv[1][0]) || [])}</div>
    <div class="g-dim" style="font-size:11px">${D.length > 1 ? `一起駐守：${D.slice(1).map((q) => smuEsc(q.name)).join('、')}・` : ''}${s.owner === S.fac && ccDefsAlive(s).length ? `軌道防禦 ${ccDefsAlive(s).length} 座` : ''}</div></div>`;
}
function ccCard() {
  const S = CC.S, el = gEl('cc-card'); if (!el) return;
  ccDraw();
  if (CC.sel < 0) { el.hidden = true; return; }
  const s = S.sys[CC.sel], V = ccSee(S, s), P = ccPl(S), Q = ccCur(S), me = Q === P, here = V.sq, dl = V.defs, own0 = V.owner;
  const why = Q ? ccCanMove(S, s.id, Q) : '', qAt = Q && Q.sys === s.id, who = Q ? smuEsc(Q.name) : '';
  const acts = [], busy = me && !!S.pl.weekFought;
  if (Q && !qAt && !S.fin) acts.push(Q.to === s.id ? { id: 'cc-cancel', name: `取消移動（${who}）`, desc: '小隊留在原地' } : { id: 'cc-go', name: `${who}移動到這裡`, desc: why || (Q.task ? '會取消派出的任務・' : '') + (own0 < 0 ? '沒有情報：不知道裡面有什麼' : ccHostile(S, S.fac, own0) && own0 !== S.fac ? '這週結束時開進去：會和軌道防禦、守軍交戰' : '這週結束時抵達'), off: !!why });
  if (qAt && !S.fin) {
    const rc = ccRepairCost(S, Q), mc = ccMissileCost(S, Q), w1 = ccCanService(S, 'repair', Q), w2 = ccCanService(S, 'missile', Q), w3 = ccCanService(S, 'build', Q);
    acts.push({ id: 'cc-repair', name: `修理${who}`, desc: w1 || (rc ? `${rc} 資金` : '不用修'), off: !!w1 || !rc || S.pl.money < rc });
    acts.push({ id: 'cc-msl', name: '補飛彈', desc: w2 || (mc ? `${mc} 資金` : '已經滿了'), off: !!w2 || !mc || S.pl.money < mc });
    if (!w3) for (const k of CAP_HULL_ORDER.filter((k) => ccHullOk(S, k))) acts.push({ id: 'cc-b-' + k, name: `新造${CAP_HULLS[k].name}`, desc: `${CC_RULE.build[k]} 資金・下週加入${who}`, off: S.pl.money < CC_RULE.build[k] || Q.ships.length + ccBuildsFor(S, Q) >= CC_RULE.maxShips });
    if (!w3 && ccOwnCount(S) < ccSlots(S)) for (const k of CAP_HULL_ORDER.filter((k) => ccHullOk(S, k))) acts.push({ id: 'cc-n-' + k, name: `新造${CAP_HULLS[k].name}・成立新小隊`, desc: `${CC_RULE.build[k]} 資金・下週在這裡成立`, off: S.pl.money < CC_RULE.build[k] });
  }
  // 地面突襲、特戰任務：親自指揮的小隊＝親自打；其他小隊＝派出（公式計算，顯示成功率與存活率）
  const taskAct = (id, name, t, fx) => { const O = ccTaskOdds(S, Q, t), on = Q.task && Q.task.kind === t.kind && Q.task.sys === t.sys && Q.task.mis === t.mis;
    return on ? { id: 'cc-tcancel', name: `取消派出：${name}`, desc: `成功率 ${Math.round(O.p * 100)}%` } : { id, name: `派出${who}：${name}（計算）`, desc: `成功率 ${Math.round(O.p * 100)}%（${ccPartsTx(O.parts)}）・存活率 ${ccSurvTx(Q, O.surv)}${fx ? `・成功：${fx}` : ''}`, cls: 'go' }; };
  if (Q && !S.fin && qAt && s.sg && s.sg.f === S.fac) acts.push(me ? { id: 'cc-raid', name: '地面突襲', desc: busy ? '這週已經打過一場' : '親自打地面的破壞任務：成功＝這週結束時地面投降', off: busy, cls: 'go' } : taskAct('cc-traid', '地面突襲', { kind: 'raid', sys: s.id }, '這週結束時地面投降'));
  if (Q && !S.fin) for (const M of S.missions) if (M.sys === s.id && ccCanOp(S, M, Q)) acts.push(me ? { id: 'cc-op-' + M.id, name: `執行任務：${CC_OPFX[M.op].name}`, desc: busy ? '這週已經打過一場' : `${qAt ? '' : '從相鄰的星系滲透出擊・'}成功：${CC_OPFX[M.op].fx(S, M)}`, off: busy, cls: 'go' } : taskAct('cc-top-' + M.id, CC_OPFX[M.op].name, { kind: 'op', sys: s.id, mis: M.id }, CC_OPFX[M.op].fx(S, M)));
  if (!S.fin && ccRankOf(S).base && s.owner === S.fac && s.yard && S.pl.base !== s.id) acts.push({ id: 'cc-base', name: '設為據點', desc: `${CC_RULE.baseCost} 資金・在據點修理、補飛彈半價，軌道防禦每週重建`, off: S.pl.money < CC_RULE.baseCost });
  // 進攻這裡的勝率（選中的小隊＋同一週也要開進來的你的其他小隊 對 守軍＋防禦）
  let odds = '';
  const defSq = here.filter((q) => q.fac === own0);
  if (Q && own0 >= 0 && ccHostile(S, S.fac, own0) && own0 !== S.fac && (dl.length || defSq.length)) {
    const A = [Q, ...ccOwn(S).filter((q) => q !== Q && (q.to != null ? q.to : q.sys) === s.id && !q.task)].slice(0, CC_RULE.maxSq), O = ccOdds(S, A, defSq.slice(0, 2), dl, 0);
    odds = `<h4>${A.map((q) => smuEsc(q.name)).join('＋')}進攻這裡</h4><div>勝率 <b class="cc-odds" style="color:${ccOddCol(O.win)}">${Math.round(O.win * 100)}%</b>　${who}存活率：${ccSurvTx(Q, O.surv[0][0])}</div><div class="g-dim" style="font-size:11px">${V.live ? '' : `照 ${V.age} 週前的情報估計・`}${me ? '公式不含親自操艦的技術、地形；開戰前還會再顯示一次' : '不是親自指揮的小隊：照這個機率計算結果'}</div>`;
  }
  const unk = own0 < 0, intelTx = V.live ? '' : unk ? '<dt>情報</dt><dd style="color:#ffb35a">沒有情報：從沒看過這個星系</dd>' : `<dt>情報</dt><dd style="color:#ffb35a">${V.age} 週前（第 ${S.turn - V.age} 週）看到的樣子・小隊靠近（相鄰）或偵察才會更新</dd>`;
  el.hidden = false;
  el.innerHTML = `<button class="sm-x" id="cc-x">×</button><h3><span style="color:${unk ? '#7d8794' : ccFacCol(S, own0)}">●</span> ${s.name}</h3>
    <dl class="sm-kv">${intelTx}<dt>擁有者</dt><dd>${unk ? '不明' : SM_FAC[own0].name}${s.cap && !unk ? '・首都' : ''}${s.id === S.pl.base ? '・<b style="color:#3fdf8f">你的據點</b>' : ''}</dd>${unk ? '' : `<dt>等級</dt><dd>${SM_TIER[s.tier]}・地面防禦 ${V.def}${V.live && s.def0 != null && s.def < s.def0 ? `／${s.def0}（受創，圍城 ${ccSiegeNeed(s)} 週）` : ''}</dd>
      <dt>軌道防禦</dt><dd>${dl.length ? dl.map((d) => `${CAP_UNIT[d.type].name} ${Math.round(d.hp * 100)}%`).join('、') : '沒有'}</dd>
      <dt>設施</dt><dd>${[V.yard ? '維修船塢（修船、造艦）' : '', V.depot ? '補給站（補飛彈）' : ''].filter(Boolean).join('、') || '沒有'}</dd>`}
      <dt>太空</dt><dd>${CAP_SPACE[s.scene || 'belt'].name}<div class="g-dim" style="font-size:11px">${CAP_SPACE[s.scene || 'belt'].desc}</div></dd>
      ${V.live && s.sg ? (() => { const G = ccGroundScore(S, s, s.sg.f), P = G.p, f1 = (v) => (v >= 0 ? '+' : '') + v.toFixed(1); return `<dt>圍城</dt><dd>${SM_FAC[s.sg.f].name}・第 ${s.sg.w} 週（${ccSiegeNeed(s)} 週投降）</dd><dt>投降評分</dt><dd><b style="color:${G.v < 0 ? '#ff7a6b' : '#3fdf8f'}">${f1(G.v)}</b>${G.v < 0 ? '・下週投降' : '・抵抗'}<br><span class="g-dim">聲望 ${f1(P.fame)}・艦隊 ${f1(P.fleet)}・地面 ${f1(P.ground)}・鄰近艦隊 ${f1(P.near)}（負數就投降）</span></dd>`; })() : ''}
      ${V.live && ccCut(S, s) ? `<dt>補給</dt><dd style="color:#ffb35a">切斷到第 ${s.fx.cut} 週（不補飛彈、只修一半、防禦不重建）</dd>` : ''}
      ${ccIntel(S, s) ? `<dt>情報</dt><dd style="color:#7fdcff">偵察中，到第 ${s.fx.intel} 週</dd>` : ''}
      ${S.missions.filter((M) => M.state === 'open' && M.sys === s.id).map((M) => `<dt>任務</dt><dd style="color:#c9a7ff">${ccMisName(M)}・剩 ${M.due - S.turn} 週</dd>`).join('')}</dl>
    ${odds}
    ${Q ? `<div class="g-dim" style="font-size:11px;margin-top:6px">下面的命令給：<b style="color:#3fdf8f">${me ? '★' : ''}${who}</b>（在小隊面板換）</div>` : ''}
    <h4>小隊${V.live ? '' : unk ? '（不明）' : `（${V.age} 週前）`}</h4>${here.length ? here.map((q) => `<div class="cc-sq ${q.pl ? 'pl' : ''}" ${q.pl ? `data-sq="${q.id}" title="選這個小隊下命令"` : ''} ${q === Q ? 'style="border-width:2px"' : ''}><b style="color:${SMU_REL[ccRel(S, q)].col}">${q.id === S.pl.sq ? '★' : ''}${smuEsc(q.name)}</b>${ccSqNote(S, q)}${ccShipRows(q)}</div>`).join('') : (unk ? '<div class="g-dim">不明</div>' : '<div class="g-dim">沒有</div>')}
    ${acts.length ? smuActs(acts, 150) : ''}`;
  CC_place(el);
  const on = (id, fn) => { const b = gEl(id); if (b) b.onclick = fn; };
  const re = () => { ccSave(S); ccDock(); ccCard(); };
  el.querySelectorAll('[data-sq]').forEach((b) => (b.onclick = () => { CC.cur = +b.dataset.sq; ccDock(); ccCard(); }));
  on('cc-x', () => { CC.sel = -1; ccCard(); });
  on('cc-go', () => { if (!ccCanMove(S, s.id, Q)) { Q.to = s.id; Q.task = null; re(); } });
  on('cc-cancel', () => { Q.to = null; re(); });
  on('cc-repair', () => { ccRepair(S, Q); ccSave(S); ccRender(); });
  on('cc-msl', () => { ccResupply(S, Q); ccSave(S); ccRender(); });
  for (const k of CAP_HULL_ORDER) { on('cc-b-' + k, () => { ccBuild(S, k, Q); ccSave(S); ccRender(); }); on('cc-n-' + k, () => { ccBuild(S, k, Q, true); ccSave(S); ccRender(); }); }
  on('cc-raid', () => ccLaunch(S, 'raid', { sys: s.id }));
  on('cc-base', () => { ccMoveBase(S, s); ccSave(S); ccRender(); });
  on('cc-traid', () => { ccSetTask(S, Q, { kind: 'raid', sys: s.id }); re(); });
  on('cc-tcancel', () => { Q.task = null; re(); });
  for (const M of S.missions) { on('cc-op-' + M.id, () => ccLaunch(S, 'op', { sys: s.id, mis: M.id })); on('cc-top-' + M.id, () => { ccSetTask(S, Q, { kind: 'op', sys: s.id, mis: M.id }); re(); }); }
}
// 換船／分隊：同一個星系的你的小隊之間，不花時間
function ccSwapView(Q) {
  const S = CC.S, L = S.sq.filter((q) => q.pl && q.ships.length && q.sys === Q.sys), canNew = ccOwnCount(S) < ccSlots(S);
  smuModal(`<h3>換船／分隊：${S.sys[Q.sys].name}</h3><p class="g-dim">同一個星系的小隊之間可以換船，不花時間。每隊最多 ${CC_RULE.maxShips} 艘；親自指揮的小隊至少留一艘。${canNew ? '「分出」＝用這艘船成立新的小隊。' : `指揮權 ${ccOwnCount(S)}／${ccSlots(S)} 隊${CC_RULE.sqMerit[ccSlots(S)] ? `（戰功 ${CC_RULE.sqMerit[ccSlots(S)]} 可以多帶一隊）` : ''}。`}</p>
    <div class="cc-sw">${L.map((q) => `<div class="cc-sq pl"><b style="color:#3fdf8f">${q.id === S.pl.sq ? '★' : ''}${smuEsc(q.name)}</b>${q.ships.map((c, k) => `<div class="cc-ship"><b>${CAP_HULLS[c.key].name}</b>${ccShipBars(c)}<span>${L.filter((o) => o !== q).map((o) => `<button class="g-btn" data-mv="${q.id}:${k}:${o.id}">→${smuEsc(o.name)}</button>`).join('')}${canNew && q.ships.length > 1 ? `<button class="g-btn" data-mv="${q.id}:${k}:new">分出</button>` : ''}</span></div>`).join('')}</div>`).join('')}</div>
    <div id="cc-swmsg" style="color:#ff8a7a;min-height:16px"></div><div class="sm-btns"><button class="g-btn primary" id="cc-close">完成</button></div>`);
  document.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => {
    const [a, k, to] = b.dataset.mv.split(':'), q = S.sq.find((x) => x.id === +a), w = ccTransfer(S, q, +k, to === 'new' ? 'new' : +to);
    if (w) { gEl('cc-swmsg').textContent = w; return; }
    ccSave(S); smuCloseModal(); ccRender(); ccSwapView(q.ships.length ? q : ccPl(S));
  }));
  gEl('cc-close').onclick = () => { smuCloseModal(); ccRender(); };
}
// 小隊的備註：指揮中斷、預定動向
function ccSqNote(S, q) {
  if (q.pl) return q.task ? `<span class="g-dim" style="font-size:11px">・派出執行任務（週末計算）</span>` : q.to != null ? `<span class="g-dim" style="font-size:11px">・預定 → ${S.sys[q.to].name}</span>` : '';
  const L = [];
  if (ccDis(S, q)) L.push(`<span style="color:#ffb35a">指揮中斷（到第 ${q.dis} 週）</span>`);
  if (ccSeen(S, q)) L.push(q.to != null ? `預定 → ${S.sys[q.to].name}` : '預定：留在原地');
  else L.push('動向不明');
  return `<span class="g-dim" style="font-size:11px">・${L.join('・')}</span>`;
}
function CC_place(el) {
  const mp = gEl('cc-map'), s = CC.S && CC.S.sys[CC.sel]; if (!mp || !s || !CC.view) return;
  const [x, y] = ccXY(s), W = mp.clientWidth, H = mp.clientHeight, w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = (x + 80 + w < W - 8 ? x + 80 : Math.max(8, x - 80 - w)) + 'px'; el.style.top = Math.max(8, Math.min(H - h - 8, y - 70)) + 'px';
}

// ───── 結束這一週 ─────
function ccEndWeek(go) {
  const S = CC.S; if (S.fin) return;
  // 提醒：駐守（沒有移動、沒有派出）的小隊下週會被進攻
  const W = go ? [] : S.sq.filter((q) => q.pl && q.ships.length && q.to == null && !q.task && ccThreatA(S, q, q.sys).length);
  if (W.length) {
    smuModal(`<h3>有小隊下週會被進攻</h3><p>這些小隊留在原地駐守，敵軍預定開進：</p>${W.map((q) => `<div class="cc-sq"><b>${q === ccPl(S) ? '★ ' : ''}${smuEsc(q.name)}</b>（${S.sys[q.sys].name}）${ccThreat(S, q)}</div>`).join('')}
      ${smuActs([{ id: 'cc-endgo', cls: 'go', name: '照樣結束這一週', desc: '這些小隊駐守迎戰' }, { id: 'cc-endback', name: '返回', desc: '回去重新下命令（移動、進攻）' }], 200)}`);
    gEl('cc-endgo').onclick = () => { smuCloseModal(); ccEndWeek(true); };
    gEl('cc-endback').onclick = () => { smuCloseModal(); const q = W[0]; CC.cur = q.id; CC.sel = q.sys; ccRender(); };
    return;
  }
  CC.cont = ccIdleOn() ? { sys: SIM.m.captain.cc.sys, seed: SIM.m.captain.cc.seed, env: SIM.m.captain.cc.env, turn: S.turn, key: CC.idle && CC.idle.key, snap: capContSnap() } : null;   // 巡航中結束這一週：迎擊戰接著打
  ccIdleStop();
  ccWeekA(S); ccSave(S);
  if (S.pendB) return ccBattleGo(S);
  ccFinishWeek(S);
}
function ccFinishWeek(S) {
  const n0 = S.log.length;
  if (!S.fin) ccWeekB(S);
  ccSave(S); CC.sel = -1; ccRender();
  if (!S.fin) ccTurnStart(S, true);
}
// 玩家的小隊捲入戰鬥：顯示勝率與每艘船的存活率，選擇親自打、或撤退
function ccBattleAsk(S) {
  const B = S.pendB, s = S.sys[B.sys], A = B.A.map(ccSqById), D = B.D.map(ccSqById), P = ccPl(S), plA = B.att;
  const defs = B.owner === s.owner && plA ? ccDefsAlive(s) : [];
  const mine = plA ? A : D, foe = plA ? D : A, O = plA ? ccOdds(S, A, D, defs, 0) : ccOdds(S, D, A, [], 0);
  const busy = !!S.pl.weekFought, noFoe = !foe.some((q) => q.ships.length), calc = busy;
  smuModal(`<h3>${plA ? '進攻' : '敵軍來襲'}：${s.name}</h3>
    <p>${plA ? `你的小隊開進 ${s.name}` : `${foe.map((q) => smuEsc(q.name)).join('、')} 進攻你所在的 ${s.name}`}。我方 ${mine.length} 隊 ${mine.reduce((a, q) => a + q.ships.length, 0)} 艘，敵方 ${foe.length} 隊 ${foe.reduce((a, q) => a + q.ships.length, 0)} 艘${defs.length ? `、軌道防禦 ${defs.length} 座` : ''}。</p>
    <div>評估勝率 <b class="cc-odds" style="color:${O.win >= 0.6 ? '#5fd39a' : O.win >= 0.4 ? '#ffd36a' : '#ff6a5a'}">${Math.round(O.win * 100)}%</b></div>
    <div style="margin-top:4px">你的船的存活率：${P.ships.map((c, k) => `${CAP_HULLS[c.key].name} ${Math.round((O.surv[0][mine.indexOf(P)] || [])[k] * 100)}%`).join('、')}</div>
    ${mine.length > 1 ? `<div class="g-dim">同行的我方小隊（${mine.filter((q) => q !== P).map((q) => smuEsc(q.name)).join('、')}）由 AI 操控，戰鬥中按 ${keyText('cap_squad')} 可以切換過去指揮。</div>` : ''}
    ${noFoe ? '' : '<h4 style="margin:10px 0 4px">敵方</h4>'}${foe.filter((q) => q.ships.length).map((q) => `<div class="cc-sq"><b>${smuEsc(q.name)}</b>${ccShipRows(q)}</div>`).join('')}
    ${smuActs([{ id: 'cc-fight', cls: 'go', name: calc ? '迎戰（計算）' : noFoe ? '親自指揮（攻擊軌道防禦）' : '親自指揮', desc: busy ? '這週已經打過一場：這場用公式計算' : noFoe ? '敵方沒有小隊，只剩軌道防禦：摧毀全部就取得軌道（可以隨時躍遷撤退）' : '進入戰場親自操艦（可以隨時躍遷撤退）' }, { id: 'cc-flee', name: '撤退', desc: plA ? '取消進攻，回到原本的星系' : '撤到相鄰的己方星系；這裡交給其他守軍' }], 200)}`);
  gEl('cc-fight').onclick = () => { smuCloseModal(); if (calc) ccCalcPlayerBattle(S); else ccLaunch(S, 'capture', { sys: s.id }); };
  gEl('cc-flee').onclick = () => { smuCloseModal(); ccSkipPlayerBattle(S, '撤退'); ccFinishWeek(S); };
}
const ccSqById = (id) => CC.S.sq.find((q) => q.id === id);
// 親自指揮的小隊的戰鬥改用公式計算（這週已經打過、戰場開不起來）
function ccCalcPlayerBattle(S) {
  const B = S.pendB, s = S.sys[B.sys], A = B.A.map(ccSqById), D = B.D.map(ccSqById);
  ccFightCalc(S, s, { A, D, defs: B.att && B.owner === s.owner ? ccDefsAlive(s) : [], owner: B.owner }); S.pendB = null; ccFinishWeek(S);
}
// 玩家不打：小隊撤離，剩下的（同行的我方小隊）照常用計算的
function ccSkipPlayerBattle(S, why) {
  const B = S.pendB; if (!B) return;
  const P = ccPl(S), s = S.sys[B.sys];
  if (B.att) { P.sys = P.prev; P.to = null; } else ccFlee(S, P);
  ccLog(S, `你的小隊從 ${s.name} ${why}`, 'bad');
  const R = ccBattleAt(S, s); if (R && !R.A.includes(P) && !R.D.includes(P)) ccFightCalc(S, s, R);
  S.pendB = null;
}

// ───── 親自打：佔領戰（軌道）、地面突襲、特戰任務 ─────
function ccShipSt(c) { return { hp: c.hp, sh: c.sh, msl: c.msl }; }
function ccLaunch(S, kind, o) {
  const s = S.sys[o.sys], P = ccPl(S), R = CC_ROLES[S.role], li = CC_DIFF[S.diff].li, fac = SM_FAC[S.fac].game === 0 ? 0 : 1;
  const seed = ccSeedOf(S, s);
  let m, info = { kind, sys: s.id, own: [], foe: [], defIdx: [], mis: o.mis };
  if (kind === 'capture') {
    const B = S.pendB, A = B.A.map(ccSqById), D = B.D.map(ccSqById), mine = B.att ? A : D, foe = B.att ? D : A;
    const own = [P, ...mine.filter((q) => q !== P)], defs = B.att ? ccDefsAlive(s) : [], ownDefs = !B.att && s.owner === S.fac ? ccDefsAlive(s) : [];
    info.ownDefIdx = ownDefs.map((d) => s.defs.indexOf(d));
    info.own = own.map((q) => q.id); info.foe = foe.map((q) => q.id); info.att = B.att; info.defIdx = defs.map((d) => s.defs.indexOf(d));
    const duel = { a: own.map((q) => q.ships.map((c) => c.key)), b: foe.map((q) => q.ships.map((c) => c.key)), st: [own.map((q) => q.ships.map(ccShipSt)), foe.map((q) => q.ships.map(ccShipSt))], li, real: true,
      defs: defs.map((d) => ({ type: d.type, hp: d.hp })), ownDefs: ownDefs.map((d) => ({ type: d.type, hp: d.hp })), yard: B.att && s.yard, depot: B.att && s.depot, hm: R.tech.hull, shm: R.tech.shield,
      ownYard: !B.att && s.owner === S.fac && s.yard, ownDepot: !B.att && s.owner === S.fac && s.depot };
    const K = CC.cont; CC.cont = null;
    if (K && K.snap && !B.att && K.sys === s.id && K.turn === S.turn && own[0] === P && K.snap.ships.length === P.ships.length) duel.cont = K.snap;
    if (!B.att) {   // 迎擊戰：敵軍從星圖上來的方向躍遷進來（倒數 CC_INB_T 秒）
      const from = foe.map((x) => S.sys[x.prev != null ? x.prev : x.sys]).filter((o) => o && o.id !== s.id);
      let dx = 0, dz = 0; for (const o of from) { dx += o.x - s.x; dz += o.y - s.y; } const L = Math.hypot(dx, dz);
      duel.inb = { dx: L ? dx / L : 0, dz: L ? dz / L : -1, t: CC_INB_T };
    }   // 同一個星系、同一週、船沒變：接著巡航的位置打
    m = capLayout({ ...capLoad(), fac, diff: li, env: duel.cont ? K.env : ccSceneEnv(s), mis: 'capture', seed: duel.cont ? K.seed : seed, ally: '', duel, noDef: false });   // 接續：和巡航同一個場景
    m.name = `${s.name}・${B.att ? '佔領戰' : '迎擊'}`;
  } else {
    const M = kind === 'op' ? S.missions.find((x) => x.id === o.mis) : null, mis = kind === 'raid' ? 'sabotage' : M.op;
    // 地點：太空任務在星系的太空場景；地面、太空都可以的任務（斬首、全滅）一半一半；地面任務隨機地形
    const at = CAP_MIS[mis].at, env = at === 'g' ? 0 : at === 's' || seed % 2 ? ccSceneEnv(s) : 0;
    m = capLayout({ ...capLoad(), fac, diff: Math.min(4, li + (s.def >= 4 ? 1 : 0)), env, mis, seed, tgt: M && M.tgt, slots: P.ships.map((c) => c.key), space: env !== 0 });
    let k = 0; for (const fd of m.fleets) if (fd.capRole === 'player') { fd.capSt = ccShipSt(P.ships[k]); fd.capHm = R.tech.hull; fd.capShm = R.tech.shield; k++; }
    info.own = [P.id];
    m.name = `${s.name}・${kind === 'raid' ? '地面突襲' : CC_OPFX[mis].name}`;
  }
  m.captain.cc = info;
  // 戰場要雙方都有艦隊才開得起來：開不起來就改用計算的（佔領戰），或回到星圖（任務）
  if ([0, 1].some((sd) => !m.fleets.some((f) => f.side === sd && !f.reserve && simComp(f) > 0) && !(sd === 1 && kind === 'capture' && info.defIdx.length))) {
    if (kind === 'capture') return ccCalcPlayerBattle(S);
    ccLog(S, `${s.name}：戰場沒辦法開始，任務沒有執行`, 'bad'); return ccRender();
  }
  ccSave(S);
  simEndMid(); overlay(null);
  SIM.m = m; SIM.sel = null; camAnim = null;
  simStart();
}
// 戰鬥結束（capReport 呼叫，CAP 還沒清掉）：各艦的狀態、戰果寫回生涯
function ccBattleDone() {
  const S = CC.S || ccLoad(); CC.S = S;
  const C = SIM.m.captain, I = C.cc;
  const R = GAME.result || {}, s = S.sys[I.sys], st = CAP.stats || { ks: 0, merit: 0 };
  const put = (ids, L) => {
    const sqs = ids.map(ccSqById);
    for (const x of L) { const q = sqs[x.sq], c = q && q.ships[x.slot]; if (!c) continue; if (x.dead || !ships.alive[x.i]) { c.dead = true; continue; } c.hp = Math.max(0.02, ships.hp[x.i] / maxHp(x.i)); c.sh = ships.shMax[x.i] ? ships.sh[x.i] / ships.shMax[x.i] : 0; c.msl = x.H.msl ? x.mslN / x.H.msl.n : 0; }
    for (const q of sqs) if (q) q.ships = q.ships.filter((c) => !c.dead);
  };
  put(I.own, CAP.own); put(I.foe, CAP.foes);
  if (I.kind === 'idle') {   // 巡航中結束（撞進危險區被擊沉、暫停選單結束）：損傷照樣留下，小隊全滅＝生涯結束
    CC.idle = null; CC.over = false;
    const P = ccPl(S); if (!P || !P.ships.length) { S.fin = { why: `你的小隊在 ${s.name} 巡航時全滅`, turn: S.turn }; ccLog(S, S.fin.why, 'bad'); }
    ccSave(S); setPhase('menu'); return ccRender();
  }
  (I.ownDefIdx || []).forEach((di, k) => { const g = CAP.G.gts.find((u) => u.def && u.side === CAP.side && u.di === k); const d = s.defs[di]; if (d) d.hp = !g || gtDead(g) ? 0 : g.hp / g.max; });
  I.defIdx.forEach((di, k) => { const g = CAP.G.gts.find((u) => u.def && u.side !== CAP.side && u.di === k); const d = s.defs[di]; if (d) d.hp = !g || gtDead(g) ? 0 : g.hp / g.max; });
  for (const g of CAP.G.gts) { if (!gtDead(g)) continue; if (g.cu === 'yard') s.yard = false; if (g.cu === 'depot') s.depot = false; }
  S.pl.kills += st.ks; S.pl.merit += st.merit; S.pl.money += Math.round(st.merit * 0.5); S.pl.weekFought = 1;
  const P = ccPl(S), ok = !!R.capOk, ret = !!R.retreat || R.why === '超過任務時限';
  if (!P || !P.ships.length) { S.fin = { why: `你的小隊在 ${s.name} 全滅`, turn: S.turn }; ccLog(S, S.fin.why, 'bad'); }
  else if (I.kind === 'capture') {
    if (ok) ccLog(S, `${s.name}：你的小隊打贏了（擊沉 ${st.ks} 艘${I.att ? '，取得軌道' : ''}）`, 'ok');
    else { ccLog(S, `${s.name}：你的小隊${R.retreat ? '躍遷撤退' : '撤出戰場'}`, 'bad'); for (const id of I.own) { const q = ccSqById(id); if (!q || !q.ships.length) continue; if (I.att) { q.sys = q.prev; q.to = null; } else ccFlee(S, q); } }
    for (const id of I.foe) { const q = ccSqById(id); if (q && q.ships.length && ok) ccFlee(S, q); }
  } else if (I.kind === 'raid') {
    if (ok && s.sg) { s.sg.raid = true; ccLog(S, `${s.name}：地面突襲成功，地面守軍將在這週結束時投降`, 'ok'); } else ccLog(S, `${s.name}：地面突襲${ret ? '中止' : '失敗'}`, 'bad');
  } else if (I.kind === 'op') {
    const M = S.missions.find((x) => x.id === I.mis);
    if (M && ok) ccMissionDone(S, M, true); else ccLog(S, `${s.name}：特戰任務${ret ? '中止（任務還在，可以再出擊）' : '失敗'}`, 'bad');
  }
  ccSave(S);
  setPhase('menu');
  if (I.kind === 'capture') { S.pendB = null; ccFinishWeek(S); } else { ccRender(); }
}
function ccEndView() {
  const S = CC.S;
  smuModal(`<h3>艦長生涯結束</h3><p>${smuEsc(S.fin.why)}（第 ${S.fin.turn} 週）。</p><dl class="sm-kv"><dt>軍階</dt><dd>${ccRankOf(S).name}</dd><dt>戰功</dt><dd>${Math.round(S.pl.merit)}</dd><dt>擊沉</dt><dd>${S.pl.kills} 艘</dd><dt>親自佔領</dt><dd>${S.pl.caps} 個星系</dd></dl>
    <div class="sm-btns"><button class="g-btn" id="cc-close">看星圖</button><button class="g-btn primary" id="cc-new">開新局</button></div>`);
  gEl('cc-close').onclick = smuCloseModal;
  gEl('cc-new').onclick = () => { smuCloseModal(); STORE.removeItem(CC_STORE); ccNewDialog(); };
}
function ccLogView(L, title) {
  const col = { ok: '#5fd39a', bad: '#ff6a5a', ev: '#c9a7ff' };
  smuModal(`<h3>${title}</h3><div class="sm-log">${L.length ? L.map((x) => `<div style="color:${col[x.c] || '#aab7c8'}">第 ${x.turn} 週・${smuEsc(x.t)}</div>`).join('') : '<div class="g-dim">沒有紀錄。</div>'}</div><div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`);
  gEl('cc-close').onclick = smuCloseModal;
}
function ccMisDone(S) {
  const L = S.missions.filter((M) => M.state === 'done' && M.res).slice(-5).reverse();
  return L.length ? `<h4 style="margin:10px 0 4px">最近完成的任務</h4>${L.map((M) => `<div class="g-dim">${ccMisName(M)}：${smuEsc(M.res)}</div>`).join('')}` : '';
}
function ccMissionList() {
  const S = CC.S, L = S.missions.filter((M) => M.state === 'open');
  smuModal(`<h3>任務</h3>${L.length ? L.map((M) => `<div class="sm-bt"><b>${M.exam ? `<span style="color:#ffd36a">升遷考核（${M.exam}）</span>・` : ''}${ccMisName(M)}</b>：${CC_MIS[M.type].desc(S, M)}${M.type === 'op' ? `<div style="color:#c9a7ff">成功的影響：${CC_OPFX[M.op].fx(S, M)}</div>` : ''}<div class="g-dim">獎勵 ${M.reward.money} 資金、戰功 ${M.reward.merit}・剩 ${M.due - S.turn} 週</div><button class="g-btn" data-goto="${M.sys}">在星圖上看</button></div>`).join('') : '<p class="g-dim">目前沒有任務。每 3 週上級會交辦新任務。</p>'}
    ${ccMisDone(S)}
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`);
  gEl('cc-close').onclick = smuCloseModal;
  document.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => { smuCloseModal(); CC.sel = +b.dataset.goto; ccCard(); }));
}
Object.assign(window.__cap || (window.__cap = {}), { ccNewGame, ccWeekA, ccWeekB, CC_RULE, ccLoad, ccSave, ccShow, ccState: () => CC, ccCard, ccLaunch, ccMissionDone, ccRender, ccPlan, ccTransfer, ccTakeCommand, ccSetTask, ccTaskOdds, ccRunTasks, ccBuild });

// ───── 星圖上的關係：own＝你的小隊、ally＝同勢力、enemy＝敵對、neutral＝其他（顏色同星海生涯的 SMU_REL）─────
// 星系、勢力的顏色跟小隊一樣照敵我關係（不是勢力的固定色）：你的陣營＝藍、敵對＝紅、中立星系與停戰＝黃
function ccFacRel(S, f) { return f === S.fac ? 'ally' : f === SM_N ? 'neutral' : ccHostile(S, S.fac, f) ? 'enemy' : 'neutral'; }
const ccFacCol = (S, f) => SMU_REL[ccFacRel(S, f)].col;
const ccFacRelName = (S, f) => f === S.fac ? '你的陣營' : f === SM_N ? '中立' : SMU_REL[ccFacRel(S, f)].name;
function ccRel(S, q) { return q.pl ? 'own' : q.fac === S.fac ? 'ally' : ccHostile(S, S.fac, q.fac) ? 'enemy' : 'neutral'; }
// ───── 頂端的圖示：填滿的高度＝數值（0～100）─────
let ccIcoN = 0;
const CC_ICO = {
  heart: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.4 2.5h1.8c.8-1.3 2.2-2.5 4.4-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z',
  star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z',
  planet: 'M12 5a7 7 0 100 14 7 7 0 000-14z',
};
function ccIco(kind, col, v) {
  const id = 'ccic' + (ccIcoN++), h = Math.max(0, Math.min(1, v == null ? 1 : v)) * 24;
  return `<svg class="cc-ico" viewBox="0 0 24 24"><clipPath id="${id}"><rect x="0" y="${24 - h}" width="24" height="${h}"/></clipPath><path d="${CC_ICO[kind]}" fill="${col}22" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/><path d="${CC_ICO[kind]}" fill="${col}" clip-path="url(#${id})"/>${kind === 'planet' ? `<ellipse cx="12" cy="12" rx="11" ry="3.2" fill="none" stroke="${col}" stroke-width="1.4" transform="rotate(-20 12 12)"/>` : ''}</svg>`;
}
function ccTopChips(S, cnt) {
  const fav = ccFavOf(S, S.fac), fame = S.fame || [50, 50, 50, 50];
  const favTip = `好感（${SM_FAC[S.fac].name}對你）${Math.round(fav)}／100：任務完成 +${CC_RULE.fav.ok}、失敗 −${CC_RULE.fav.fail}。新任務的獎勵 ×${ccFavK(S, S.fac).toFixed(2)}`;
  const fac = (f) => `<span class="sm-chip cc-chip2" title="${SM_FAC[f].name}${f === SM_N ? "" : `（${ccFacRelName(S, f)}）`}：已知擁有 ${cnt[f]} 個星系（看不到的星系照最後的情報）${f === SM_N ? '' : `・聲望 ${Math.round(fame[f])}／100（佔領、交戰、特戰的成敗會改變；影響地面投降的評分）`}"><i style="background:${ccFacCol(S, f)}"></i>${SM_FAC[f].name}<span class="sep"></span>${ccIco('planet', ccFacCol(S, f))}<b>${cnt[f]}</b>${f === SM_N ? '' : `${ccIco('star', '#ffd36a', fame[f] / 100)}<b>${Math.round(fame[f])}</b>`}</span>`;
  return `<span class="sm-chip cc-chip2" title="${favTip}">${ccIco('heart', '#ff7a9a', fav / 100)}<b>${Math.round(fav)}</b><span class="g-dim" style="font-size:11px">好感</span></span>${[SM_A, SM_E, SM_P, SM_N].map(fac).join('')}`;
}
// ───── 每週開始（同星海生涯）：上週的戰報 → 每個新任務一張簡報 ─────
function ccTurnStart(S, rep) {
  if (rep) { const L = S.log.filter((x) => x.turn >= S.turn - 1).slice(-30).reverse(); if (L.length) smuLater(() => ccLogView(L, `第 ${S.turn - 1} 週的戰報`)); }
  for (const M of S.missions.filter((x) => x.state === 'open' && !x.brief)) smuLater(() => ccBrief(M));
}
// 交辦任務的人（每個勢力一位上級）
const CC_NPC = {
  [SM_A]: { name: '歐文・哈特', role: '聯盟前線指揮部・准將' },
  [SM_E]: { name: '卡爾・瓦倫', role: '帝國第三艦隊・少將' },
  [SM_P]: { name: '黑帆莫拉', role: '海盜頭目' },
};
function ccBrief(M, again) {
  const S = CC.S; if (!S || !M) return;
  if (M.brief && !again) { if (!gEl('sm-modal') && SMU.q.length) SMU.q.shift()(); return; }   // 同一個任務已經看過（重複排進佇列）
  const f = M.from != null ? M.from : S.fac, N = CC_NPC[f] || CC_NPC[S.fac], col = ccFacCol(S, f), t = S.sys[M.sys], left = M.due - S.turn;
  const say = M.type === 'cap' ? [`${t.name} 是下一個目標。`, '先打下軌道，再圍城或地面突襲讓地面投降。']
    : [`${CC_OPFX[M.op].goal(S, M)}。`, `小隊在 ${t.name} 或相鄰的星系就能出擊。`];
  if (M.exam) say.push(`這次是你的升遷考核：完成就升任${M.exam}。`);
  smuModal(`<h3>新任務${M.exam ? '・升遷考核' : ''}<span class="g-dim" style="font-size:12px;font-weight:400;margin-left:8px">第 ${S.turn} 週</span></h3>
    <div class="sm-npc"><div class="sm-ava" style="border-color:${col};color:${col}">${smuEsc(N.name[0])}</div>
      <div class="sm-say"><div class="who" style="color:${col}">${smuEsc(N.name)}<span>${smuEsc(M.exam ? N.role + '・升遷考核' : N.role)}</span></div>${say.map((l) => `<div>「${smuEsc(l)}」</div>`).join('')}</div></div>
    <dl class="sm-kv">
      <dt>任務</dt><dd><b>${ccMisName(M)}</b>・${CC_MIS[M.type].desc(S, M)}</dd>
      <dt>時限</dt><dd class="${left <= 2 ? 'sm-bad' : ''}">${left} 週（到第 ${M.due} 週）</dd>
      <dt>地點</dt><dd><span style="color:${ccFacCol(S, t.owner)}">${smuEsc(t.name)}（${SM_FAC[t.owner].name}）</span></dd>
      ${M.type === 'op' ? `<dt>成功的影響</dt><dd style="color:#c9a7ff">${CC_OPFX[M.op].fx(S, M)}</dd>` : ''}
      <dt>報酬</dt><dd>資金 ${M.reward.money}、戰功 ${M.reward.merit}</dd>
      <dt>失敗</dt><dd class="g-dim">沒有報酬，${SM_FAC[f].name}對你的好感 −${CC_RULE.fav.fail}</dd>
    </dl>
    <div class="sm-btns" style="justify-content:flex-end"><button class="g-btn" id="cc-brief-map">在星圖上看目標</button><button class="g-btn primary" id="cc-brief-ok">${again ? '關閉' : '收到'}</button></div>`);
  const seen = () => { M.brief = true; ccSave(S); smuCloseModal(); };   // 按了才算看過（畫面被換掉的話下次再出現）
  gEl('cc-brief-ok').onclick = seen;
  gEl('cc-brief-map').onclick = () => { seen(); CC.sel = M.sys; ccCard(); };
}

// ───── 星系中巡航（2026-11-11）：平時開著親自指揮的小隊在所在星系的太空裡，按 M 疊出星圖下令 ─────
// 回合制不變：巡航、整備都不耗時間，只有在星圖按「結束這一週」才推進。戰鬥用同一個星系的場景（同樣的種子）開打。
const ccSeedOf = (S, s) => (S.turn * 7919 + s.id * 104729 + (S.r % 9973)) % 100000;   // 和 ccLaunch 一樣：巡航與戰鬥是同一個場景
const ccIdleKey = (S, P) => `${P.id}:${P.sys}:${S.turn}:${P.ships.map((c) => c.key + c.hp.toFixed(2) + c.sh.toFixed(2) + c.msl.toFixed(2)).join(',')}`;
const ccIdleOn = () => CAP.on && SIM.m && SIM.m.captain && SIM.m.captain.cc && SIM.m.captain.cc.kind === 'idle';
function ccIdle(S) {
  const P = ccPl(S); if (!P || !P.ships.length || S.fin) return ccRender();
  const s = S.sys[P.sys], R = CC_ROLES[S.role], li = CC_DIFF[S.diff].li, fac = SM_FAC[S.fac].game === 0 ? 0 : 1, mine = s.owner === S.fac;
  const duel = { a: [P.ships.map((c) => c.key)], b: [], st: [[P.ships.map(ccShipSt)], []], li, real: true, idle: true, defs: [], ownDefs: mine ? ccDefsAlive(s).map((d) => ({ type: d.type, hp: d.hp })) : [],
    ownYard: mine && s.yard, ownDepot: mine && s.depot, hm: R.tech.hull, shm: R.tech.shield };
  const m = capLayout({ ...capLoad(), fac, diff: li, env: ccSceneEnv(s), mis: 'capture', seed: ccSeedOf(S, s), ally: '', duel, noDef: false });
  m.captain.cc = { kind: 'idle', sys: s.id, own: [P.id], foe: [], defIdx: [], seed: ccSeedOf(S, s), env: ccSceneEnv(s) }; m.name = `${s.name}・巡航`;
  CC.idle = { key: ccIdleKey(S, P) }; CC.over = false;
  window.removeEventListener('resize', ccResize);
  simEndMid(); overlay(null);
  SIM.m = m; SIM.sel = null; camAnim = null;
  simStart();
}
// 收起巡航的場景（不算戰鬥、沒有戰果）
function ccIdleStop() {
  if (!ccIdleOn()) return;
  CC.idle = null; CC.over = false;
  if (paused) { paused = false; updateTimeUI(); }
  setPhase('menu');
}
// 巡航中按 M：暫停、疊出星圖
function ccMapOpen() {
  if (!ccIdleOn()) return;
  paused = true; updateTimeUI(); if (document.pointerLockElement) document.exitPointerLock();
  CC.over = true; CC.S = CC.S || ccLoad(); ccRender();
}
// 回到星系：場景還是同一個星系、同一週、船的狀態沒變就接著飛；不然重新開一個
function ccFly() {
  const S = CC.S, P = S && ccPl(S); if (!P) return;
  if (gEl('sm-modal')) smuCloseModal();
  window.removeEventListener('resize', ccResize);
  if (ccIdleOn() && CC.idle && CC.idle.key === ccIdleKey(S, P)) { overlay(null); CC.over = false; capPause(false); return; }
  ccIdleStop(); ccIdle(S);
}

// ───── 玩家的小隊捲入的戰鬥：直接開打（2026-11-11）─────
// 要撤退就在上一週移動到別的星系；開進敵方星系＝你下的命令。這週已經親自打過一場：用公式計算。
const CC_INB_T = 12;   // 迎擊戰：敵軍躍遷進來前的倒數（秒）
function ccBattleGo(S) {
  if (S.pl.weekFought) { ccLog(S, `${S.sys[S.pendB.sys].name}：這週已經親自打過一場，這場用公式計算`, 'ev'); return ccCalcPlayerBattle(S); }
  ccLaunch(S, 'capture', { sys: S.pendB.sys });
}
