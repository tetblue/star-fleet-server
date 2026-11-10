// ═══════════════════════ 艦長生涯：畫面 ═══════════════════════
// 星圖（canvas）＋星系卡片＋玩家小隊的狀態；樣式與對話框沿用星海生涯（SMU_CSS、smuModal、smuPick）。
let CC = { S: null, sel: -1, raf: 0, view: null };
function ccSummary() { const S = ccLoad(); return S ? `第 ${S.turn} 週・${CC_ROLES[S.role].name}・${S.fin ? '已結束' : `資金 ${fmtN(Math.round(S.pl.money))}`}` : '還沒開始'; }
function ccShow() {
  setPhase('menu');
  const S = ccLoad();
  if (!S) return ccNewDialog();
  CC = { S, sel: -1, raf: 0, view: null };
  if (S.pendB) { ccSkipPlayerBattle(S, '離開了戰場'); ccWeekB(S); ccSave(S); }   // 打到一半離開：當作撤退，接著結束這一週
  ccRender();
}
function ccNewDialog() {
  overlay(`<style>${SMU_CSS}</style><div class="g-wrap sp-wrap"><div class="g-head"><h2>艦長生涯</h2><span class="crumb">開新局</span><span class="g-sp"></span><button class="g-btn" id="cc-back">← 艦長</button></div>
    <p class="g-dim">回合制的星圖，每一回合是一週。所有勢力的兵力都是戰艦小隊，沒有艦隊戰：小隊戰的結果決定星系的所有權。你的小隊碰上敵人時，由你親自操艦；其他的戰鬥用公式計算，下令前都看得到勝率與每艘船的存活率。損傷會留到下一場，要回有維修船塢的星系花錢修理。<b>你的小隊全滅，生涯就結束。</b></p>
    <h3 style="margin:16px 0 4px">角色</h3>
    ${smuPick('cc-role', Object.entries(CC_ROLES).map(([k, R]) => ({ v: k, name: R.name, desc: R.desc, info: `開局：${R.hulls.map((h) => CAP_HULLS[h].name).join('＋')}・${R.techName}` })), 'emp', 240)}
    <h3 style="margin:16px 0 4px">難度</h3>
    ${smuPick('cc-diff', CC_DIFF.map((D, i) => ({ v: i, name: D.name, desc: D.desc })), 1, 170)}
    <div style="height:12px"></div><button class="g-btn primary" id="cc-go">開始</button></div>`);
  smuBindUi(gEl('g-screen'));
  gEl('cc-back').onclick = () => { GAME.spMode = 'captain'; showSingle(); };
  gEl('cc-go').onclick = () => { const S = ccNewGame({ seed: (Math.random() * 1e9) >>> 0, role: smuVal('cc-role') || 'emp', diff: +smuVal('cc-diff') }); ccSave(S); CC = { S, sel: -1, raf: 0, view: null }; ccRender(); };
}
function ccRender() {
  const S = CC.S, P = ccPl(S), cnt = [SM_A, SM_E, SM_P, SM_N].map((f) => S.sys.filter((s) => s.owner === f).length);
  const nMis = S.missions.filter((M) => M.state === 'open').length;
  overlay(`<style>${SMU_CSS}${CC_CSS}</style><div class="sm-wrap">
    <div class="sm-top"><h2>艦長生涯</h2><span class="sm-chip">第 ${S.turn} 週</span><span class="sm-chip">${CC_ROLES[S.role].name}</span><span class="sm-chip">資金 ${fmtN(Math.round(S.pl.money))}</span><span class="sm-chip">戰功 ${Math.round(S.pl.merit)}</span>
      ${[SM_A, SM_E, SM_P, SM_N].map((f) => `<span class="sm-chip"><i style="background:${SM_FAC[f].col}"></i>${SM_FAC[f].name} ${cnt[f]}</span>`).join('')}
      <span class="sm-btnbar"><button class="g-btn" id="cc-mis">任務${nMis ? `<span class="sm-badge">${nMis}</span>` : ''}</button><button class="g-btn" id="cc-logb">紀錄</button><button class="g-btn" id="cc-quit">離開</button><button class="g-btn primary" id="cc-end" ${S.fin ? 'disabled' : ''}>結束這一週 →</button></span></div>
    <div class="sm-map" id="cc-map"><canvas id="cc-cv"></canvas>
      <div class="sm-leg" id="cc-leg" style="cursor:pointer">${CC.leg ? `<div><b>圖例 ▾</b></div><div><i style="background:#3fdf8f"></i>你的小隊（綠框；★＝親自指揮，粗框＝選中）</div><div>! ＝ 你的小隊下週會被進攻</div><div>◆ 軌道防禦・⚓ 維修船塢・✚ 補給站</div><div>虛線圈：圍城中・⚔ 這週會交戰</div><div>箭頭：看得到的預定動向（你的小隊周圍、偵察過的星系）</div><div>藍色虛線大圈：偵察中・亂＝指揮中斷</div><div class="g-dim">點星系看詳情；點相鄰的星系下令移動</div>` : '<div><b>圖例 ▸</b></div>'}</div>
      <div class="sm-dock" id="cc-dock"></div><div class="sm-card" id="cc-card" hidden></div></div></div>`);
  gEl('cc-quit').onclick = () => { ccSave(S); window.removeEventListener('resize', ccDraw); GAME.spMode = 'captain'; showSingle(); };
  gEl('cc-end').onclick = () => ccEndWeek();
  gEl('cc-mis').onclick = ccMissionList;
  gEl('cc-leg').onclick = () => { CC.leg = !CC.leg; ccRender(); };
  gEl('cc-logb').onclick = () => ccLogView(S.log.slice(-60).reverse(), '紀錄');
  const cv = gEl('cc-cv');
  cv.onclick = (e) => { const r = cv.getBoundingClientRect(), id = ccHit(e.clientX - r.left, e.clientY - r.top); CC.sel = id; ccCard(); };
  window.removeEventListener('resize', ccDraw); window.addEventListener('resize', ccDraw);
  ccDock(); ccCard();
  if (!CC.raf) CC.raf = requestAnimationFrame(ccLoop);
  if (S.fin) ccEndView();
}
const CC_CSS = `.cc-ship{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;align-items:center;margin:3px 0}.cc-ship b{font-size:12px}
.cc-bar{height:4px;background:#1a2433;border-radius:2px;overflow:hidden}.cc-bar i{display:block;height:100%}
.cc-sq{border:1px solid #1d2838;border-radius:6px;padding:5px 8px;margin:5px 0}.cc-sq.pl{border-color:#3fdf8f}
.cc-odds{font-size:20px;font-weight:700}.cc-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}.cc-tab{background:#121c2b;border:1px solid #2a3a50;color:#aab7c8;border-radius:5px;padding:2px 7px;font-size:12px;cursor:pointer}.cc-tab.on{border-color:#3fdf8f;color:#3fdf8f;background:#123024}
.cc-sq[data-sq]{cursor:pointer}.cc-sw{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}.cc-sw .cc-ship{grid-template-columns:auto 1fr auto}.cc-sw button{font-size:11px;padding:1px 6px;margin-left:3px}.cc-dock{background:#0d1522ee;border:2px solid #3fdf8f;border-radius:8px;padding:6px 10px;min-width:260px}`;
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
  for (const s of S.sys) { if (s.owner === SM_N) continue; const [x, y] = ccXY(s), r = k * 9, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, SM_FAC[s.owner].col + '2a'); gr.addColorStop(1, SM_FAC[s.owner].col + '00'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.lineWidth = 1.2; g.strokeStyle = '#243247';
  for (const [a, b] of S.edges) { const [x1, y1] = ccXY(S.sys[a]), [x2, y2] = ccXY(S.sys[b]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  // 你的小隊的移動命令（選中的較粗）
  for (const q of own) if (q.to != null) { const [x1, y1] = ccXY(S.sys[q.sys]), [x2, y2] = ccXY(S.sys[q.to]); g.strokeStyle = '#3fdf8f'; g.lineWidth = q === Q ? 3 : 1.8; g.setLineDash([8, 6]); g.lineDashOffset = -t * 20; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); }
  // 看得到的預定動向（AI 在週初就決定了）：細的虛線箭頭
  const arrows = new Map(); for (const q of S.sq) if (!q.pl && q.to != null && q.ships.length && ccSeen(S, q)) { const kk = q.sys + '>' + q.to + '>' + q.fac; arrows.set(kk, (arrows.get(kk) || 0) + 1); }
  for (const [kk, n] of arrows) {
    const [a, b, f] = kk.split('>').map(Number), [x1, y1] = ccXY(S.sys[a]), [x2, y2] = ccXY(S.sys[b]), L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    const sx = x1 + ux * 12, sy = y1 + uy * 12, ex = x2 - ux * 16, ey = y2 - uy * 16, hostile = ccHostile(S, S.fac, f);
    g.strokeStyle = SM_FAC[f].col; g.fillStyle = SM_FAC[f].col; g.lineWidth = hostile ? 2 + n : 1.5; g.setLineDash(hostile ? [6, 4] : [3, 5]); g.lineDashOffset = -t * 14;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(ex + ux * 8, ey + uy * 8); g.lineTo(ex - uy * 6, ey + ux * 6); g.lineTo(ex + uy * 6, ey - ux * 6); g.fill();
  }
  g.textAlign = 'center';
  for (const s of S.sys) {
    const [x, y] = ccXY(s), r = 5 + s.tier * 1.6, here = ccAt(S, s.id), mineHere = own.filter((q) => q.sys === s.id);
    if (ccIntel(S, s)) { g.strokeStyle = 'rgba(110,220,255,.35)'; g.lineWidth = 1; g.setLineDash([2, 4]); g.beginPath(); g.arc(x, y, r + 20, 0, 7); g.stroke(); g.setLineDash([]); }
    if (ccCut(S, s)) { g.fillStyle = '#ffb35a'; g.font = 'bold 10px sans-serif'; g.textAlign = 'right'; g.fillText('補給切斷', x - r - 4, y + 4); g.textAlign = 'center'; }
    if (Q && Q.sys === s.id) { const p = 0.5 + 0.5 * Math.sin(t * 3); g.strokeStyle = `rgba(63,223,143,${0.4 + 0.45 * p})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r + 8 + p * 3, 0, 7); g.stroke(); }
    else if (mineHere.length) { g.strokeStyle = 'rgba(63,223,143,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 8, 0, 7); g.stroke(); }
    if (Q && S.adj[Q.sys].includes(s.id) && !S.fin) { g.strokeStyle = 'rgba(63,223,143,.25)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r + 5, 0, 7); g.stroke(); }
    if (s.id === CC.sel) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, r + 14, 0, 7); g.stroke(); g.setLineDash([]); }
    if (s.sg) { g.strokeStyle = SM_FAC[s.sg.f].col; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, r + 3, 0, 7); g.stroke(); g.setLineDash([]); }
    g.fillStyle = SM_FAC[s.owner].col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (s.cap) { g.strokeStyle = '#ffe28a'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 1.5, 0, 7); g.stroke(); }
    const dn = ccDefsAlive(s).length;
    g.fillStyle = '#cfd8e3'; g.font = '12px sans-serif'; g.fillText(`${s.name}${s.yard ? ' ⚓' : ''}${s.depot ? ' ✚' : ''}`, x, y - r - 6);
    if (dn) { g.fillStyle = '#e8eef8'; g.font = 'bold 11px sans-serif'; g.textAlign = 'left'; g.fillText('◆' + dn, x + r + 3, y + 4); g.textAlign = 'center'; }
    // 小隊：每個勢力一個標籤（隊數、艘數）；你的小隊單獨一個標籤
    const groups = []; for (const q of here) { const k = q.pl ? 'pl' : q.fac; let G = groups.find((x) => x.k === k); if (!G) groups.push(G = { k, f: q.fac, L: [] }); G.L.push(q); }
    groups.sort((a, b) => (a.k === 'pl' ? -1 : b.k === 'pl' ? 1 : 0)).forEach(({ k: gk, f, L }, n) => {
      const mine = gk === 'pl', col = mine ? '#3fdf8f' : SM_FAC[f].col;
      const tx = mine ? `${L.some((q) => q.id === S.pl.sq) ? '★' : ''}${L.length > 1 ? `你的 ${L.length}隊` : L[0].name} ${L.reduce((a, q) => a + q.ships.length, 0)}艘` : `${SM_FAC[f].name} ${L.length > 1 ? L.length + '隊 ' : ''}${L.reduce((a, q) => a + q.ships.length, 0)}艘${L.some((q) => ccDis(S, q)) ? '・亂' : ''}`;
      g.font = 'bold 11px sans-serif'; const w = g.measureText(tx).width + 12, bx = x - w / 2, by = y + r + 6 + n * 17;
      g.fillStyle = '#0a0f18e6'; smuRRect(g, bx, by, w, 15, 4); g.fill(); g.strokeStyle = col; g.lineWidth = mine && L.includes(Q) ? 2.5 : mine ? 1.5 : 1.3; smuRRect(g, bx, by, w, 15, 4); g.stroke();
      g.fillStyle = col; g.fillText(tx, x, by + 11.5);
    });
    let bx = x + r + 12;
    if (ccWillFight(S, s)) { const p = 0.5 + 0.5 * Math.sin(t * 4); g.fillStyle = `rgba(255,179,90,${p > 0.5 ? 1 : 0.7})`; g.beginPath(); g.arc(bx, y - 2, 9, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = 'bold 12px sans-serif'; g.fillText('⚔', bx, y + 2); bx += 20; }
    if (mineHere.some((q) => q.to == null && ccThreatA(S, q, q.sys).length)) { const p = 0.5 + 0.5 * Math.sin(t * 5); g.fillStyle = `rgba(255,90,80,${0.7 + 0.3 * p})`; g.beginPath(); g.arc(bx, y - 2, 9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.fillText('!', bx, y + 3); }
  }
}
// 預計交戰：你的小隊要開進可以進攻的星系，或已經在交戰中的星系
function ccWillFight(S, s) {
  if (S.fin) return false;
  return ccOwn(S).some((q) => (q.to != null ? q.to : q.sys) === s.id && !q.task) && ((ccHostile(S, S.fac, s.owner) && s.owner !== S.fac && (ccDefsAlive(s).length || ccAt(S, s.id, s.owner).length)) || ccAt(S, s.id).some((q) => q.fac !== S.fac && q.fac !== SM_N && ccHostile(S, S.fac, q.fac)));
}
const ccBar = (v, col) => `<div class="cc-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;background:${col}"></i></div>`;
const ccOddCol = (v) => v >= 0.6 ? '#5fd39a' : v >= 0.4 ? '#ffd36a' : '#ff6a5a';
function ccShipBars(c) { return `<div>${ccBar(c.hp, c.hp < 0.35 ? '#ff6a5a' : '#5fd39a')}${ccBar(c.sh, '#7cc4ff')}${CAP_HULLS[c.key].msl ? ccBar(c.msl, '#ffd36a') : ''}</div>`; }
function ccShipRows(q) {
  return q.ships.map((c) => `<div class="cc-ship"><b>${CAP_HULLS[c.key].name}</b>${ccShipBars(c)}</div>`).join('') || '<div class="g-dim">（全滅）</div>';
}
const ccSurvTx = (q, sv) => q.ships.map((c, k) => `${CAP_HULLS[c.key].name} ${Math.round((sv[k] ?? 0) * 100)}%`).join('、');
// 小隊面板：你的每個小隊一個分頁；選中的小隊＝星系卡片上命令的對象
function ccDock() {
  const S = CC.S, P = ccPl(S), Q = ccCur(S), el = gEl('cc-dock'); if (!el || !Q) return;
  const own = S.sq.filter((q) => q.pl && (q.ships.length || q === P)), s = S.sys[Q.sys], slots = ccSlots(S), next = CC_RULE.sqMerit[slots];
  const mates = own.filter((q) => q !== Q && q.sys === Q.sys && q.ships.length);
  const tk = Q.task ? `<div style="color:#c9a7ff;font-size:12px">派出：${Q.task.kind === 'raid' ? '地面突襲' : CC_OPFX[(S.missions.find((M) => M.id === Q.task.mis) || {}).op || 'run'].name}（成功率 ${Math.round(ccTaskOdds(S, Q, Q.task).p * 100)}%，週末計算）</div>` : '';
  const blds = S.pl.build.filter((b) => (b.sq || S.pl.sq) === Q.id).map((b) => CAP_HULLS[b.key || b].name);
  el.innerHTML = `<div class="cc-dock">${own.length > 1 || slots > 1 ? `<div class="cc-tabs">${own.map((q) => `<button class="cc-tab ${q === Q ? 'on' : ''}" data-sq="${q.id}">${q === P ? '★' : ''}${smuEsc(q.name)} ${q.ships.length}艘${q.to == null && ccThreatA(S, q, q.sys).length ? ' ⚠' : ''}</button>`).join('')}</div>` : ''}
    <div style="display:flex;justify-content:space-between;gap:8px"><b style="color:#3fdf8f">${Q === P ? '★ ' : ''}${smuEsc(Q.name)}・${Q.ships.length} 艘${Q === P ? '（親自指揮）' : ''}</b><span class="g-dim">在 ${s.name}${Q.to != null ? ` → ${S.sys[Q.to].name}` : ''}</span></div>
    ${ccShipRows(Q)}${tk}${ccThreat(S, Q)}
    ${Q !== P || mates.length || slots > own.length ? `<div style="display:flex;gap:6px;margin:4px 0">${Q !== P ? `<button class="g-btn" id="cc-cmd" ${P && P.ships.length && P.sys !== Q.sys ? 'disabled title="要和現在指揮的小隊在同一個星系"' : ''}>改為親自指揮</button>` : ''}${mates.length || (slots > ccOwnCount(S) && Q.ships.length > 1) ? '<button class="g-btn" id="cc-swap">換船／分隊</button>' : ''}</div>` : ''}
    <div class="g-dim" style="font-size:11px">綠＝船體・藍＝護盾・黃＝飛彈・指揮權 ${ccOwnCount(S)}／${slots} 隊${next ? `（戰功 ${next} 可以多帶一隊）` : ''}${blds.length ? `・下週到：${blds.join('、')}` : ''}${Q === P && S.pl.weekFought ? '・這週已經打過一場' : ''}</div></div>`;
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
  const s = S.sys[CC.sel], P = ccPl(S), Q = ccCur(S), me = Q === P, here = ccAt(S, s.id), dl = ccDefsAlive(s);
  const why = Q ? ccCanMove(S, s.id, Q) : '', qAt = Q && Q.sys === s.id, who = Q ? smuEsc(Q.name) : '';
  const acts = [], busy = me && !!S.pl.weekFought;
  if (Q && !qAt && !S.fin) acts.push(Q.to === s.id ? { id: 'cc-cancel', name: `取消移動（${who}）`, desc: '小隊留在原地' } : { id: 'cc-go', name: `${who}移動到這裡`, desc: why || (Q.task ? '會取消派出的任務・' : '') + (ccHostile(S, S.fac, s.owner) && s.owner !== S.fac ? '這週結束時開進去：會和軌道防禦、守軍交戰' : '這週結束時抵達'), off: !!why });
  if (qAt && !S.fin) {
    const rc = ccRepairCost(S, Q), mc = ccMissileCost(S, Q), w1 = ccCanService(S, 'repair', Q), w2 = ccCanService(S, 'missile', Q), w3 = ccCanService(S, 'build', Q);
    acts.push({ id: 'cc-repair', name: `修理${who}`, desc: w1 || (rc ? `${rc} 資金` : '不用修'), off: !!w1 || !rc || S.pl.money < rc });
    acts.push({ id: 'cc-msl', name: '補飛彈', desc: w2 || (mc ? `${mc} 資金` : '已經滿了'), off: !!w2 || !mc || S.pl.money < mc });
    if (!w3) for (const k of CAP_HULL_ORDER) acts.push({ id: 'cc-b-' + k, name: `新造${CAP_HULLS[k].name}`, desc: `${CC_RULE.build[k]} 資金・下週加入${who}`, off: S.pl.money < CC_RULE.build[k] || Q.ships.length + ccBuildsFor(S, Q) >= CC_RULE.maxShips });
    if (!w3 && ccOwnCount(S) < ccSlots(S)) for (const k of CAP_HULL_ORDER) acts.push({ id: 'cc-n-' + k, name: `新造${CAP_HULLS[k].name}・成立新小隊`, desc: `${CC_RULE.build[k]} 資金・下週在這裡成立`, off: S.pl.money < CC_RULE.build[k] });
  }
  // 地面突襲、特戰任務：親自指揮的小隊＝親自打；其他小隊＝派出（公式計算，顯示成功率與存活率）
  const taskAct = (id, name, t, fx) => { const O = ccTaskOdds(S, Q, t), on = Q.task && Q.task.kind === t.kind && Q.task.sys === t.sys && Q.task.mis === t.mis;
    return on ? { id: 'cc-tcancel', name: `取消派出：${name}`, desc: `成功率 ${Math.round(O.p * 100)}%` } : { id, name: `派出${who}：${name}（計算）`, desc: `成功率 ${Math.round(O.p * 100)}%・存活率 ${ccSurvTx(Q, O.surv)}${fx ? `・成功：${fx}` : ''}`, cls: 'go' }; };
  if (Q && !S.fin && qAt && s.sg && s.sg.f === S.fac) acts.push(me ? { id: 'cc-raid', name: '地面突襲', desc: busy ? '這週已經打過一場' : '親自打地面的破壞任務：成功＝這週結束時地面投降', off: busy, cls: 'go' } : taskAct('cc-traid', '地面突襲', { kind: 'raid', sys: s.id }, '這週結束時地面投降'));
  if (Q && !S.fin) for (const M of S.missions) if (M.sys === s.id && ccCanOp(S, M, Q)) acts.push(me ? { id: 'cc-op-' + M.id, name: `執行任務：${CC_OPFX[M.op].name}`, desc: busy ? '這週已經打過一場' : `${qAt ? '' : '從相鄰的星系滲透出擊・'}成功：${CC_OPFX[M.op].fx(S, M)}`, off: busy, cls: 'go' } : taskAct('cc-top-' + M.id, CC_OPFX[M.op].name, { kind: 'op', sys: s.id, mis: M.id }, CC_OPFX[M.op].fx(S, M)));
  // 進攻這裡的勝率（選中的小隊＋同一週也要開進來的你的其他小隊 對 守軍＋防禦）
  let odds = '';
  if (Q && ccHostile(S, S.fac, s.owner) && s.owner !== S.fac && (dl.length || ccAt(S, s.id, s.owner).length)) {
    const A = [Q, ...ccOwn(S).filter((q) => q !== Q && (q.to != null ? q.to : q.sys) === s.id && !q.task)].slice(0, CC_RULE.maxSq), O = ccOdds(S, A, ccAt(S, s.id, s.owner).slice(0, 2), dl, 0);
    odds = `<h4>${A.map((q) => smuEsc(q.name)).join('＋')}進攻這裡</h4><div>勝率 <b class="cc-odds" style="color:${ccOddCol(O.win)}">${Math.round(O.win * 100)}%</b>　${who}存活率：${ccSurvTx(Q, O.surv[0][0])}</div><div class="g-dim" style="font-size:11px">${me ? '公式不含親自操艦的技術、地形；開戰前還會再顯示一次' : '不是親自指揮的小隊：照這個機率計算結果'}</div>`;
  }
  el.hidden = false;
  el.innerHTML = `<button class="sm-x" id="cc-x">×</button><h3><span style="color:${SM_FAC[s.owner].col}">●</span> ${s.name}</h3>
    <dl class="sm-kv"><dt>擁有者</dt><dd>${SM_FAC[s.owner].name}${s.cap ? '・首都' : ''}</dd><dt>等級</dt><dd>${SM_TIER[s.tier]}・地面防禦 ${s.def}${s.def0 != null && s.def < s.def0 ? `／${s.def0}（受創，圍城 ${ccSiegeNeed(s)} 週）` : ''}</dd>
      <dt>軌道防禦</dt><dd>${dl.length ? dl.map((d) => `${CAP_UNIT[d.type].name} ${Math.round(d.hp * 100)}%`).join('、') : '沒有'}</dd>
      <dt>設施</dt><dd>${[s.yard ? '維修船塢（修船、造艦）' : '', s.depot ? '補給站（補飛彈）' : ''].filter(Boolean).join('、') || '沒有'}</dd>
      ${s.sg ? `<dt>圍城</dt><dd>${SM_FAC[s.sg.f].name}・第 ${s.sg.w} 週（${ccWeakGround(s) ? '地面防禦 0：投降' : `${ccSiegeNeed(s)} 週投降`}）</dd>` : ''}
      ${ccCut(S, s) ? `<dt>補給</dt><dd style="color:#ffb35a">切斷到第 ${s.fx.cut} 週（不補飛彈、只修一半、防禦不重建）</dd>` : ''}
      ${ccIntel(S, s) ? `<dt>情報</dt><dd style="color:#7fdcff">偵察中，到第 ${s.fx.intel} 週</dd>` : ''}
      ${S.missions.filter((M) => M.state === 'open' && M.sys === s.id).map((M) => `<dt>任務</dt><dd style="color:#c9a7ff">${ccMisName(M)}・剩 ${M.due - S.turn} 週</dd>`).join('')}</dl>
    ${odds}
    ${Q ? `<div class="g-dim" style="font-size:11px;margin-top:6px">下面的命令給：<b style="color:#3fdf8f">${me ? '★' : ''}${who}</b>（在小隊面板換）</div>` : ''}
    <h4>小隊</h4>${here.length ? here.map((q) => `<div class="cc-sq ${q.pl ? 'pl' : ''}" ${q.pl ? `data-sq="${q.id}" title="選這個小隊下命令"` : ''} ${q === Q ? 'style="border-width:2px"' : ''}><b style="color:${q.pl ? '#3fdf8f' : SM_FAC[q.fac].col}">${q.id === S.pl.sq ? '★' : ''}${smuEsc(q.name)}</b>${ccSqNote(S, q)}${ccShipRows(q)}</div>`).join('') : '<div class="g-dim">沒有</div>'}
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
function CC_place(el) { const W = gEl('cc-map').clientWidth; el.style.left = (W - el.offsetWidth - 10) + 'px'; el.style.top = '10px'; }

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
  ccWeekA(S); ccSave(S);
  if (S.pendB) return ccBattleAsk(S);
  ccFinishWeek(S);
}
function ccFinishWeek(S) {
  const n0 = S.log.length;
  if (!S.fin) ccWeekB(S);
  ccSave(S); CC.sel = -1; ccRender();
  const L = S.log.filter((x) => x.turn >= S.turn - 1).slice(-30).reverse();
  if (!S.fin) ccLogView(L, `第 ${S.turn - 1} 週的戰報`);
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
  const seed = (S.turn * 7919 + s.id * 104729 + (S.r % 9973)) % 100000;
  let m, info = { kind, sys: s.id, own: [], foe: [], defIdx: [], mis: o.mis };
  if (kind === 'capture') {
    const B = S.pendB, A = B.A.map(ccSqById), D = B.D.map(ccSqById), mine = B.att ? A : D, foe = B.att ? D : A;
    const own = [P, ...mine.filter((q) => q !== P)], defs = B.att ? ccDefsAlive(s) : [];
    info.own = own.map((q) => q.id); info.foe = foe.map((q) => q.id); info.att = B.att; info.defIdx = defs.map((d) => s.defs.indexOf(d));
    const duel = { a: own.map((q) => q.ships.map((c) => c.key)), b: foe.map((q) => q.ships.map((c) => c.key)), st: [own.map((q) => q.ships.map(ccShipSt)), foe.map((q) => q.ships.map(ccShipSt))], li, real: true,
      defs: defs.map((d) => ({ type: d.type, hp: d.hp })), yard: B.att && s.yard, depot: B.att && s.depot, hm: R.tech.hull, shm: R.tech.shield };
    m = capLayout({ ...capLoad(), fac, diff: li, env: GROUND_KEYS.length + 1 + (s.id % CAP_SPACE_KEYS.length), mis: 'capture', seed, ally: '', duel, noDef: false });
    m.name = `${s.name}・${B.att ? '佔領戰' : '迎擊'}`;
  } else {
    const M = kind === 'op' ? S.missions.find((x) => x.id === o.mis) : null, mis = kind === 'raid' ? 'sabotage' : M.op;
    m = capLayout({ ...capLoad(), fac, diff: Math.min(4, li + (s.def >= 4 ? 1 : 0)), env: 0, mis, seed, slots: P.ships.map((c) => c.key), space: CAP_MIS[mis].at.includes('s') });
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
  const C = SIM.m.captain, I = C.cc, R = GAME.result || {}, s = S.sys[I.sys], st = CAP.stats || { ks: 0, merit: 0 };
  const put = (ids, L) => {
    const sqs = ids.map(ccSqById);
    for (const x of L) { const q = sqs[x.sq], c = q && q.ships[x.slot]; if (!c) continue; if (x.dead || !ships.alive[x.i]) { c.dead = true; continue; } c.hp = Math.max(0.02, ships.hp[x.i] / maxHp(x.i)); c.sh = ships.shMax[x.i] ? ships.sh[x.i] / ships.shMax[x.i] : 0; c.msl = x.H.msl ? x.mslN / x.H.msl.n : 0; }
    for (const q of sqs) if (q) q.ships = q.ships.filter((c) => !c.dead);
  };
  put(I.own, CAP.own); put(I.foe, CAP.foes);
  I.defIdx.forEach((di, k) => { const g = CAP.G.gts.find((u) => u.def && u.di === k); const d = s.defs[di]; if (d) d.hp = !g || gtDead(g) ? 0 : g.hp / g.max; });
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
  smuModal(`<h3>艦長生涯結束</h3><p>${smuEsc(S.fin.why)}（第 ${S.fin.turn} 週）。</p><dl class="sm-kv"><dt>戰功</dt><dd>${Math.round(S.pl.merit)}</dd><dt>擊沉</dt><dd>${S.pl.kills} 艘</dd><dt>親自佔領</dt><dd>${S.pl.caps} 個星系</dd></dl>
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
  smuModal(`<h3>任務</h3>${L.length ? L.map((M) => `<div class="sm-bt"><b>${ccMisName(M)}</b>：${CC_MIS[M.type].desc(S, M)}${M.type === 'op' ? `<div style="color:#c9a7ff">成功的影響：${CC_OPFX[M.op].fx(S, M)}</div>` : ''}<div class="g-dim">獎勵 ${M.reward.money} 資金、戰功 ${M.reward.merit}・剩 ${M.due - S.turn} 週</div><button class="g-btn" data-goto="${M.sys}">在星圖上看</button></div>`).join('') : '<p class="g-dim">目前沒有任務。每 3 週上級會交辦新任務。</p>'}
    ${ccMisDone(S)}
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`);
  gEl('cc-close').onclick = smuCloseModal;
  document.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => { smuCloseModal(); CC.sel = +b.dataset.goto; ccCard(); }));
}
Object.assign(window.__cap || (window.__cap = {}), { ccNewGame, ccWeekA, ccWeekB, ccLoad, ccSave, ccShow, ccState: () => CC, ccCard, ccLaunch, ccMissionDone, ccRender, ccPlan, ccTransfer, ccTakeCommand, ccSetTask, ccTaskOdds, ccRunTasks, ccBuild });
