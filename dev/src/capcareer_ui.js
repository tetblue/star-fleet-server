// ═══════════════════════ 艦長生涯：畫面 ═══════════════════════
// 星圖（canvas）＋星系卡片＋玩家小隊的狀態；樣式與對話框沿用星海生涯（SMU_CSS、smuModal、smuPick）。
let CC = { S: null, sel: -1, raf: 0, view: null };
function ccSummary() { const S = ccLoad(); return S ? `第 ${S.turn} 週・${CC_ROLES[S.role].name}・${S.fin ? '已結束' : `資金 ${fmtN(Math.round(S.pl.money))}`}` : '還沒開始'; }
function ccShow() {
  setPhase('menu'); cceTabOff();
  const S = ccLoad();
  if (!S) return ccNewDialog();
  CC = { S, sel: -1, raf: 0, view: null }; SMU.q = [];
  if (S.pendB) { ccSkipPlayerBattle(S, '離開了戰場'); ccWeekB(S); ccSave(S); }   // 打到一半離開：當作撤退，接著結束這一週
  if (!S.fin && !S.pendB && !S.missions.some((M) => M.state === 'open' && !M.brief)) return ccIdle(S);
  ccRender();
  if (!S.fin && !S.pendB) ccTurnStart(S, false);
}
function ccRender() {
  ccFogTick(CC.S);
  const S = CC.S, P = ccPl(S), cnt = [SM_A, SM_E, SM_P, SM_N].map((f) => S.sys.filter((s) => ccSee(S, s).owner === f).length);   // 照所知的情報（迷霧）
  const nMis = S.missions.filter((M) => M.state === 'open').length, X = ccT(S), nW = ccmWarnN(S), P0 = ccPl(S);
  const fav = ccFavOf(S, S.fac), fame = S.fame || [50, 50, 50, 50];
  const ico = (k) => `<svg viewBox="0 0 24 24">${CCL_ICON[k] || CCM_ICON[k]}</svg>`;
  const ri = (k, v, c, ic, id, tip) => `<div class="ccm-ri"${id ? ` id="${id}" style="--c:${c};cursor:pointer"` : ` style="--c:${c}"`}${tip ? ` title="${tip}"` : ''}>${ico(ic)}<span class="k">${k}</span><b>${v}</b></div>`;
  const facIt = (f) => `<span class="it" title="${SM_FAC[f].name}${f === SM_N ? '' : `（${ccFacRelName(S, f)}）`}：已知擁有 ${cnt[f]} 個星系${f === SM_N ? '' : `・聲望 ${Math.round(fame[f])}／100（佔領、交戰、特戰的成敗會改變；影響地面投降的評分）`}">${f === SM_N ? `<span class="dot" style="--c:${ccFacCol(S, f)}"></span>` : `<span class="pie" style="--c:${ccFacCol(S, f)};--v:${Math.round(fame[f])}"></span>`}${SM_FAC[f].name}${f === SM_N ? '' : ` <b>${Math.round(fame[f])}</b>`}<span style="margin-left:2px">・${cnt[f]}</span></span>`;
  const back = S.fin ? ['cc-quit2', CCM_ICON.quit, '離開'] : ['cc-fly2', CCM_ICON.back, `回到星系（${keyText('cap_map')}）`];
  overlay(`<style>${SMU_CSS}${CC_CSS}${CCM_CSS}${CCD_CSS}${CCS_CSS}</style><div class="sm-wrap ccm" style="--k:${ccmK()}">
    <div class="sm-map" id="cc-map"><canvas id="cc-cv"></canvas><div class="ccm-vig"></div><i class="ccm-cn cn1"></i><i class="ccm-cn cn2"></i><i class="ccm-cn cn3"></i><i class="ccm-cn cn4"></i>
      <div class="ccm-z ccm-head"><button class="ccm-back" id="${back[0]}" title="${back[2]}"><svg viewBox="0 0 24 24">${back[1]}</svg></button>
        <div><span class="ent">STAR MAP ・ ORDERS</span><h1>星圖・下令</h1><span class="crumb"><b>第 ${S.turn} 週</b>・${CC_ROLES[S.role].name}・${ccRankOf(S).name}・指揮權 ${ccOwnCount(S)}／${ccSlots(S)} 隊${P0 ? `・你在 ${S.sys[P0.sys].name}` : ''}</span></div></div>
      <div class="ccm-z ccm-res">${ri('資金', fmtN(Math.round(S.pl.money)), '#ffc24a', 'money')}${ri('戰功', fmtN(Math.round(S.pl.merit)), '#3fdf8f', 'merit', 'cc-rank', '軍階：每一階解鎖什麼、離下一階還差多少')}${ri('研究點', fmtN(Math.round(S.pl.rp || 0)), '#3cc8ff', 'rp', 'cc-rp', '研究點數與研發樹')}</div>
      <div class="ccm-z ccm-rel"><span class="it" title="好感（${SM_FAC[S.fac].name}對你）${Math.round(fav)}／100：任務完成 +${CC_RULE.fav.ok}、失敗 −${CC_RULE.fav.fail}。新任務的獎勵 ×${ccFavK(S, S.fac).toFixed(2)}"><span class="pie" style="--c:#ffc24a;--v:${Math.round(fav)}"></span>好感 <b>${Math.round(fav)}</b></span><span class="sep"></span>${[SM_A, SM_E, SM_P, SM_N].map(facIt).join('')}</div>
      <div class="ccm-z ccm-tools"><button class="ccm-tb" id="cc-mis">${ico('mis')}任務${nMis ? `<span class="nb">${nMis}</span>` : ''}</button><button class="ccm-tb" id="cc-tech" title="研究點數與研發樹">${ico('rp')}研發 <span class="mono">${fmtN(Math.round(S.pl.rp || 0))}</span>${X.cur ? '<span class="busy">研究中</span>' : ''}</button><button class="ccm-tb" id="cc-logb">${ico('log')}紀錄</button>${S.fin ? '' : `<button class="ccm-tb" id="cc-fly" title="回到${smuEsc(P0 ? S.sys[P0.sys].name : '')}的太空">${ico('fly')}回到星系<kbd>${keyText('cap_map')}</kbd></button>`}<button class="ccm-tb q" id="cc-quit" title="存檔、回到選擇作戰（可以玩其他模式）">${ico('quit')}存檔離開</button></div>
      <div class="ccm-z ccm-leg" id="cc-leg">${CC.leg ? `<h5>圖例 ▾ ／ LEGEND</h5>${['own', 'ally', 'enemy', 'neutral'].map((k) => `<div><i style="background:${SMU_REL[k].col}"></i>${k === 'own' ? '你的小隊（★＋光圈＝親自指揮，白框＝選中）' : SMU_REL[k].name}</div>`).join('')}<div>箭頭＝一個小隊：越大船越多（1～5 艘）；停在星系下方，閃爍且在航道上＝這週要移動</div><div class="g-dim">星系的顏色＝擁有者跟你的關係：藍＝你的陣營、紅＝敵對、黃＝中立／停戰</div><div>! ＝ 你的小隊下週會被進攻</div><div>◆ 軌道防禦・⚓ 維修船塢・✚ 補給站・$ 商店（貿易站、黑市、商會貿易所）・白圈＝首都</div>${cpNzShow(S) ? '<div><span style="color:#ffd23f">◇</span> 星際商會的據點・<span style="color:#ffd23f">◆</span> 有商船隊（中立好感度 ' + CP_RULE.nzMap + ' 以上才標）</div>' : ''}<div>虛線圈：圍城中・⚔ 這週會交戰</div><div>箭頭：看得到的預定動向（你的小隊周圍、偵察過的星系）</div><div>藍色虛線大圈：偵察中・亂＝指揮中斷</div><div class="g-dim">點星系看詳情；點相鄰的星系下令移動</div>` : '<h5>圖例 ▸ ／ LEGEND（點開）</h5>'}</div>
      <button class="ccm-z ccm-end" id="cc-end" ${S.fin ? 'disabled' : ''}><div><b>結束這一週</b><small class="en">END WEEK ${S.turn} → ${S.turn + 1}</small></div>${nW ? `<span class="w" title="${nW} 個小隊留在原地，下週會被進攻">⚠ ${nW}</span>` : ''}<span class="arrow">→</span></button>
      ${ccFleeHtml(S)}<div class="sm-dock" id="cc-dock"></div><div class="sm-card" id="cc-card" hidden></div></div></div>`);
  { const b = gEl('cc-fly2') || gEl('cc-quit2'); b.onclick = () => gEl(b.id === 'cc-fly2' ? 'cc-fly' : 'cc-quit').click(); }
  gEl('cc-rp').onclick = () => ccTechView();
  gEl('cc-rank').onclick = ccRankView;   // 軍階的階梯（caplevel_ui.js）
  gEl('cc-quit').onclick = () => { ccSave(S); ccIdleStop(); window.removeEventListener('resize', ccResize); GAME.spMode = 'captain'; showSingle(); };
  if (gEl('cc-fly')) gEl('cc-fly').onclick = () => ccFly();
  gEl('cc-end').onclick = () => ccEndWeek();
  document.querySelectorAll('[data-flee]').forEach((b) => (b.onclick = () => { if (+b.dataset.flee >= 0) ccFleePick(S, +b.dataset.flee); else S.pl.flee = null; ccSave(S); CC.sel = -1; ccRender(); }));
  gEl('cc-mis').onclick = () => (CC.drw && CC.drw.kind === 'mis' ? ccdClose() : ccdOpen('mis'));   // 任務、紀錄：右側的斜放面板（capinfo_ui.js）
  gEl('cc-leg').onclick = () => { CC.leg = !CC.leg; ccRender(); };
  gEl('cc-tech').onclick = () => ccTechView();
  gEl('cc-logb').onclick = () => (CC.drw && CC.drw.kind === 'log' && CC.drw.arg.mode === 'all' ? ccdClose() : ccdOpen('log', { mode: 'all' }));
  const cv = gEl('cc-cv');
  cv.onclick = (e) => { const r = cv.getBoundingClientRect(), id = ccHit(e.clientX - r.left, e.clientY - r.top); CC.sel = id; ccCard(); };
  window.removeEventListener('resize', ccResize); window.addEventListener('resize', ccResize);
  ccDock(); ccCard(); ccdRestore(); cceRepRestore();
  if (!CC.raf) CC.raf = requestAnimationFrame(ccLoop);
  if (S.fin) ccEndView();
}
const CC_CSS = `.cc-ico{width:15px;height:15px;vertical-align:-3px;margin-right:3px}.cc-chip2{display:inline-flex;align-items:center;gap:2px}.cc-chip2 b{font-weight:700;margin-right:5px}.cc-chip2 .sep{width:1px;height:12px;background:#2a3a50;margin:0 5px}
.cc-ship{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;align-items:center;margin:3px 0}.cc-ship b{font-size:12px}
.cc-bar{height:4px;background:#1a2433;border-radius:2px;overflow:hidden}.cc-bar i{display:block;height:100%}
.cc-sq{border:1px solid #1d2838;border-radius:6px;padding:5px 8px;margin:5px 0}.cc-sq.pl{border-color:#3fdf8f}
.cc-odds{font-size:20px;font-weight:700}.cc-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}.cc-tab{background:#121c2b;border:1px solid #2a3a50;color:#aab7c8;border-radius:5px;padding:2px 7px;font-size:12px;cursor:pointer}.cc-tab.on{border-color:#3fdf8f;color:#3fdf8f;background:#123024}
.cc-sq[data-sq]{cursor:pointer}.cc-sw{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}.cc-sw .cc-ship{grid-template-columns:auto 1fr auto}.cc-sw button{font-size:11px;padding:1px 6px;margin-left:3px}.cc-dock{background:#0d1522ee;border:2px solid #3fdf8f;border-radius:8px;padding:6px 10px;min-width:260px}
.cc-lv{font-size:10px;font-weight:700;color:#8a96a8;border:1px solid #3a4658;border-radius:3px;padding:0 3px;margin-left:2px}.cc-lv.up{color:#c9a7ff;border-color:#7a5fb0}.cc-shipnm{cursor:pointer;text-decoration:underline dotted #3fdf8f88}
.cc-mods{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}.cc-mods td{padding:3px 6px;border-top:1px solid #1d2838;vertical-align:top}.cc-mods td:first-child{color:#8a96a8;white-space:nowrap}.cc-mods td:nth-child(2){white-space:nowrap}
.cc-cmp{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:2px 10px;font-size:12px;margin:6px 0}.cc-cmp dt{color:#8a96a8}.cc-cmp dd{margin:0}
.cc-fit .sm-seg{flex-wrap:wrap}.cc-fit .sm-seg button{font-size:11px;padding:2px 6px}.cc-fit tr.chg td:first-child{color:#c9a7ff;font-weight:700}
.cc-yq{font-size:12px}.cc-yq .g-dim{font-size:12px}.cc-yq button{font-size:11px;padding:1px 6px;margin-left:3px}
.cc-thr{margin:5px 0;padding:5px 7px;border:1px solid #ff6a5a;border-radius:6px;background:#2a1416}
.cc-xp{height:6px;background:#1a2433;border-radius:3px;overflow:hidden;margin:3px 0 8px}.cc-xp i{display:block;height:100%;background:#c9a7ff}`;
function ccResize() { ccmFit(); ccdRestore(); cceRepRestore(); ccDraw(); const el = gEl('cc-card'); if (el && !el.hidden) CC_place(el); }
function ccLoop(ts) { if (!gEl('cc-cv') || !CC.S) { CC.raf = 0; return; } ccDraw(ts); CC.raf = requestAnimationFrame(ccLoop); }
const ccXY = (s) => { const V = CC.view; return [V.ox + s.x * V.k, V.oy + s.y * V.k]; };
function ccHit(x, y) { let best = -1, bd = 26; for (const s of CC.S.sys) { const [px, py] = ccXY(s), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = s.id; } } return best; }
// 星圖上選中的我方小隊（命令的對象）；預設＝親自指揮的
const ccCur = (S) => S.sq.find((q) => q.id === CC.cur && q.pl && q.ships.length) || ccPl(S);
// 戰鬥中躍遷撤退之後：選撤退的目的地（星圖上方的橫幅；星圖上可以去的星系有青色的虛線圈，星系卡片也可以選）
function ccFleeHtml(S) {
  const F = S.pl.flee, q = F && ccSqById(F.q); if (!q || S.fin) return '';
  return `<div class="ccm-z ccm-flee"><div class="h"><b>選擇撤退的目的地</b><span>${smuEsc(q.name)}從 ${smuEsc(S.sys[F.from].name)} 躍遷撤退・現在在 <b>${smuEsc(S.sys[q.sys].name)}</b></span></div>
    <div class="L">${F.opts.map((id) => { const t = S.sys[id]; return `<button type="button" data-flee="${id}" class="${id === q.sys ? 'on' : ''}" style="--c:${ccFacCol(S, t.owner)}"><i></i>${smuEsc(t.name)}<small>${t.owner === S.fac ? '己方' : '中立'}${t.yard ? '・船塢' : ''}${id === q.prev ? '' : ''}</small></button>`; }).join('')}<button type="button" data-flee="-1" class="ok">就這樣</button></div></div>`;
}
function ccDraw(ts) {
  const cv = gEl('cc-cv'); if (!cv || !CC.S) return;
  const S = CC.S, Q = ccCur(S), own = ccOwn(S), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, t = (ts || performance.now()) / 1000;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const A0 = ccmArea(W, H), k = Math.min(A0.w / 100, A0.h / 60); CC.view = { k, ox: A0.x + (A0.w - 100 * k) / 2, oy: A0.y + (A0.h - 60 * k) / 2 };
  ccmBg(g, W, H);
  const SEE = S.sys.map((s) => ccSee(S, s));
  for (const s of S.sys) { const o = SEE[s.id].owner; if (o < 0) continue; const fc = ccFacCol(S, o), [x, y] = ccXY(s), r = k * 9, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, fc + (SEE[s.id].live ? (o === SM_N ? '1c' : '30') : '12')); gr.addColorStop(1, fc + '00'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(140,180,240,.26)';
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
    if (S.pl.flee && S.pl.flee.opts.includes(s.id)) { const p = 0.5 + 0.5 * Math.sin(t * 4); g.strokeStyle = `rgba(60,200,255,${0.5 + 0.45 * p})`; g.lineWidth = 2.5; g.setLineDash([5, 4]); g.lineDashOffset = -t * 16; g.beginPath(); g.arc(x, y, r + 12 + p * 2, 0, 7); g.stroke(); g.setLineDash([]); }   // 可以撤退過去的星系
    if (Q && S.adj[Q.sys].includes(s.id) && !S.fin) { g.strokeStyle = 'rgba(63,223,143,.25)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r + 5, 0, 7); g.stroke(); }
    if (s.id === CC.sel) { const rr = r + 14 + Math.sin(t * 3.3) * 2; g.strokeStyle = 'rgba(60,200,255,.95)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rr, 0, 7); g.stroke(); g.setLineDash([3, 6]); g.beginPath(); g.arc(x, y, rr + 8, t * 1.1, t * 1.1 + 5); g.stroke(); g.setLineDash([]); }
    if (V.sg) { g.strokeStyle = ccFacCol(S, V.sg.f); g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, r + 3, 0, 7); g.stroke(); g.setLineDash([]); }
    g.globalAlpha = V.live ? 1 : 0.55; g.fillStyle = '#0a1024'; g.beginPath(); g.arc(x, y, r + 3, 0, 7); g.fill();
    g.fillStyle = V.owner < 0 ? '#3a4352' : ccFacCol(S, V.owner); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.32)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.36, 0, 7); g.fill(); g.globalAlpha = 1;
    if (V.owner < 0) { g.fillStyle = '#cfd8e3'; g.font = CCM_FONT(700, 11); g.fillText('?', x, y + 4); }
    if (s.cap) { g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r + 4.5, 0, 7); g.stroke(); }   // 首都：白圈（黃色是中立）
    const dn = V.defs.length;
    { const nm = `${s.name}${V.yard ? ' ⚓' : ''}${V.depot ? ' ✚' : ''}${s.shop && (s.shop !== 'nz' || cpNzShow(S)) ? ' $' : ''}${V.live || V.age == null ? '' : `（${V.age}週前）`}${s.id === S.pl.base ? '［據點］' : ''}`;
      g.font = CCM_FONT(700, 13); g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = 'rgba(3,5,12,.85)'; g.strokeText(nm, x, y - r - 8); g.fillStyle = V.live ? '#e8eef8' : '#8a94a8'; g.fillText(nm, x, y - r - 8); }
    if ((s.nz || cpNuAt(S, s.id).length) && cpNzShow(S)) cpNzIco(g, x - r - 10, y, cpNuAt(S, s.id).length, !!s.nz);   // 星際商會（中立好感度夠才標）
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
// 船名＋等級（舊情報沒有等級就不顯示）
const ccShipNm = (c) => `${CAP_HULLS[c.key].name}${c.lv ? ` <span class="cc-lv${c.lv > 1 ? ' up' : ''}">Lv${c.lv}</span>` : ''}${ccMkTag(c)}`;
// 裝備的最高 Mk（看得出敵方的研發）
const ccMkTag = (c) => { const m = Math.max(1, ...Object.values(c.mk || {})); ccIcoCss(); return m > 1 ? ` <span class="cc-mk cc-mk${m}" title="裝備等級（最高的槽位）">${CAP_MK_NAME[m]}</span>` : ''; };   // 等階顏色：capicons_ui.js
// own＝你的小隊：點船名看那艘船的等級、模組、數值
function ccShipRows(q, own) {
  return q.ships.map((c, k) => `<div class="cc-ship"><b${own ? ` class="cc-shipnm" data-ship="${q.id}:${k}" title="看這艘船的等級與模組"` : ''}>${ccShipNm(c)}</b>${ccShipBars(c)}</div>`).join('') || '<div class="g-dim">（全滅）</div>';
}
const ccPartsTx = (P) => P.map(([k, v]) => `${k} ${v >= 0 ? '+' : '−'}${Math.abs(v)}`).join('、');   // 成功率的組成（百分點）
const ccSurvTx = (q, sv) => q.ships.map((c, k) => `${CAP_HULLS[c.key].name} ${Math.round((sv[k] ?? 0) * 100)}%`).join('、');
// 一艘船的等級、經驗、模組與實際數值（研發、改裝的第 1 步：先能看，改裝之後開放）
function ccShipView(q, k) {
  const c = q && q.ships[k]; if (!c) return;
  capShipFix(c); ccIcoCss(); ccvCss();
  const H0 = CAP_HULLS[c.key], H = capProfMod(capHullMod(H0, c), c.mod, CC.S.pl.prof), L = CAP_XP.lv, lv = c.lv, cap = ccMkCap(CC.S, c);
  const lo = L[lv - 1], hi = L[lv], xpTx = hi == null ? `經驗 ${c.xp}（已經是最高等級）` : `經驗 ${c.xp}／${hi}（升到 Lv${lv + 1}${capMkCapLv(lv + 1) > capMkCapLv(lv) ? `，等級上限 ${CAP_MK_NAME[capMkCapLv(lv + 1)]}` : ''}）`;
  const pct = hi == null ? 1 : (c.xp - lo) / (hi - lo);
  const rows = CAP_SLOTS.map(([slot, nm]) => { const id = c.mod[slot], M = id && CAP_MODS[slot][id];
    return `<tr><td><span class="cc-slot">${ccModIco(slot, id, ccMkCol(c.mk[slot]))}${nm}</span></td><td><b>${capModName(H0, slot, id)}</b> ${ccMkBadge(c.mk[slot])}</td><td class="g-dim">${M ? M.desc : '原廠'}</td><td class="g-dim" title="艦長熟練度">熟練 Lv${capProfLv((CC.S.pl.prof || {})[capProfKey(slot, id)] || 0)}</td></tr>`; }).join('');
  const f1 = (v) => Math.round(v * 10) / 10;
  const st = [['船體', Math.round(H.hp)], ['護盾', Math.round(H.sh)], ['主砲', `${H.main.name} ${f1(H.main.dmg)} 傷害／${H.main.cd} 秒（每秒 ${f1(H.main.dmg / H.main.cd)}）・射程 ${H.main.range}・射界左右各 ${H.main.arc}°`],
    ['副砲', `砲塔 ${H.tur.n} 座・${f1(H.tur.dmg)} 傷害／${f1(H.tur.cd)} 秒・點防禦 ${H.pd.n} 座`],
    ['飛彈', H.msl ? `${H.msl.n} 枚・每枚 ${f1(H.msl.dmg)}・鎖定 ${f1(H.msl.lockT)} 秒${H.ftr ? `・護航機 ${H.ftr} 架` : ''}` : '沒有'],
    ['機動', `最高速度 ${f1(H.max)}・轉向 ${Math.round(H.turn)}°／秒`], ['技能', `${H0.skill.name}（船型固定）`]];
  ccmSheet(`<h3>${smuEsc(q.name)}・${H0.name} <span class="cc-lv${lv > 1 ? ' up' : ''}" style="font-size:13px">Lv${lv}</span><span class="en">SHIP DATA</span></h3>
    <div class="g-dim">${xpTx}・Mk 上限 <b style="color:${ccMkCol(cap)}">${CAP_MK_NAME[cap]}</b>（船的等級與研發取低的）</div>${ccvShipLv(CC.S, c)}
    <table class="cc-mods">${rows}</table>
    <dl class="sm-kv">${st.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
    <p class="g-dim" style="font-size:12px">經驗：參戰 +${CAP_XP.fight}、活下來 +${CAP_XP.live}、擊沉 +10～30（看船型）。船沉了，等級也跟著沒了。改裝與 Mk 升級：在己方有船塢的星系，佔用船塢一週。</p>
    <div class="sm-btns"><button class="g-btn" id="cc-fit">改裝／升級 Mk</button><button class="g-btn primary" id="cc-close">關閉</button></div>`, '', 'var(--own)');
  gEl('cc-close').onclick = smuCloseModal;
  gEl('cc-fit').onclick = () => ccFitView({ q: q.id, k });
}
// 小隊面板：你的每個小隊一個分頁；選中的小隊＝星系卡片上命令的對象
function ccDock() {
  const S = CC.S, P = ccPl(S), Q = ccCur(S), el = gEl('cc-dock'); if (!el || !Q) return;
  const own = S.sq.filter((q) => q.pl && (q.ships.length || q === P)), s = S.sys[Q.sys], slots = ccSlots(S), next = CC_RANKS[(S.pl.rank || 0) + 1];
  const mates = own.filter((q) => q !== Q && q.sys === Q.sys && q.ships.length);
  const tk = Q.task ? `<div style="color:#c9a7ff;font-size:12px">派出：${Q.task.kind === 'raid' ? '地面突襲' : CC_OPFX[(S.missions.find((M) => M.id === Q.task.mis) || {}).op || 'run'].name}（成功率 ${Math.round(ccTaskOdds(S, Q, Q.task).p * 100)}%，週末計算）</div>` : '';
  const blds = S.pl.build.filter((b) => (b.sq || S.pl.sq) === Q.id).map((b) => CAP_HULLS[b.key || b].name);
  const yq = S.pl.yq.filter((o) => o.to === Q.id).map((o) => `${o.kind === 'fit' ? '改裝' : ''}${CAP_HULLS[o.key].name}（${ccYqEta(S, o)} 週）`), nRes = S.pl.res.length;
  el.innerHTML = `<div class="cc-dock">${own.length > 1 || slots > 1 ? `<div class="cc-tabs">${own.map((q) => `<button class="cc-tab ${q === Q ? 'on' : ''}" data-sq="${q.id}">${q === P ? '★' : ''}${smuEsc(q.name)} ${q.ships.length}艘${q.to == null && ccThreatA(S, q, q.sys).length ? ' ⚠' : ''}</button>`).join('')}</div>` : ''}
    <div class="dh"><span>${Q === P ? '★ ' : ''}${smuEsc(Q.name)}・${Q.ships.length} 艘${Q === P ? '（親自指揮）' : ''}</span><small>在 ${s.name}${Q.to != null ? ` → ${S.sys[Q.to].name}` : ''}</small></div>
    ${ccShipRows(Q, true)}${tk}${ccThreat(S, Q)}
    ${Q !== P || mates.length || slots > own.length ? `<div style="display:flex;gap:8px;margin:10px 0 2px">${Q !== P ? `<button class="g-btn" id="cc-cmd" ${P && P.ships.length && P.sys !== Q.sys ? 'disabled title="要和現在指揮的小隊在同一個星系"' : ''}>改為親自指揮</button>` : ''}${mates.length || (slots > ccOwnCount(S) && Q.ships.length > 1) ? '<button class="g-btn" id="cc-swap">換船／分隊</button>' : ''}</div>` : ''}
    <div class="df">綠＝船體・藍＝護盾・黃＝飛彈・${ccRankOf(S).name}・指揮權 ${ccOwnCount(S)}／${slots} 隊${next ? `・戰功 ${next.merit} 升遷考核（${next.name}）` : ''}${blds.length ? `・下週到：${blds.join('、')}` : ''}${yq.length ? `・船塢：${yq.join('、')}` : ''}${nRes ? `・預備艦 ${nRes} 艘` : ''}${Q === P && S.pl.weekFought ? '・這週已經打過一場' : ''}</div></div>`;
  el.querySelectorAll('[data-sq]').forEach((b) => (b.onclick = () => { CC.cur = +b.dataset.sq; ccDock(); ccCard(); }));
  el.querySelectorAll('[data-ship]').forEach((b) => (b.onclick = () => { const [qi, k] = b.dataset.ship.split(':').map(Number); ccShipView(ccSqById(qi), k); }));
  const on = (id, fn) => { const b = gEl(id); if (b) b.onclick = fn; };
  on('cc-cmd', () => { if (ccTakeCommand(S, Q)) return; ccSave(S); ccRender(); });
  on('cc-swap', () => ccSwapView(Q));
}
// 看得到的敵方小隊，預定開進 at
const ccThreatA = (S, q, at) => S.sq.filter((x) => x.to === at && x.ships.length && ccHostile(S, x.fac, S.fac) && x.fac !== SM_N && ccSeen(S, x));
// 敵軍預定開進小隊所在（或要去）的星系：駐守的勝率、每艘船的存活率
function ccThreatD(S, Q) {
  if (S.fin || Q.task) return null;
  const at = Q.to != null ? Q.to : Q.sys, s = S.sys[at], A = ccThreatA(S, Q, at);
  if (!A.length || (Q.to != null && s.owner !== S.fac)) return null;   // 開進敵方星系的勝率在星系卡片上
  const D = [Q, ...S.sq.filter((q) => q !== Q && q.fac === S.fac && q.ships.length && !q.task && (q.to != null ? q.to : q.sys) === at)].slice(0, CC_RULE.maxSq);
  const O = ccOdds(S, A.slice(0, CC_RULE.maxSq), D, s.owner === S.fac ? ccDefsAlive(s) : [], 1);
  return { at, s, A, D, O, w: 1 - O.win, sv: (O.surv[1] && O.surv[1][0]) || [] };
}
function ccThreat(S, Q) {
  const T = ccThreatD(S, Q); if (!T) return '';
  const { s, A, D, O, w } = T;
  return `<div class="cc-thr"><b style="color:#ff8a7a">⚠ 下週敵軍${Q.to != null ? `開進 ${s.name}` : '來襲'}</b>：${A.map((q) => smuEsc(q.name)).join('、')}（${A.reduce((a, q) => a + q.ships.length, 0)} 艘）
    <div>駐守的勝率 <b style="color:${ccOddCol(w)}">${Math.round(w * 100)}%</b>・存活率 ${ccSurvTx(Q, (O.surv[1] && O.surv[1][0]) || [])}</div>
    <div class="g-dim" style="font-size:11px">${D.length > 1 ? `一起駐守：${D.slice(1).map((q) => smuEsc(q.name)).join('、')}・` : ''}${s.owner === S.fac && ccDefsAlive(s).length ? `軌道防禦 ${ccDefsAlive(s).length} 座` : ''}</div></div>`;
}
// 星系卡片的指令：簡易圖示＋兩個字（使用者 2026-11-21：移動用箭頭、建設用槌子）；滑過／按住看完整說明，角落的數字＝價錢或成功率
const CC_ACT_ICO = {
  go: ['移動', '<path d="M4 12h14M13 6l6 6-6 6"/>'], cancel: ['取消', '<path d="M6 6l12 12M18 6L6 18"/>'],
  repair: ['修理', '<path d="M14.5 4.5a4 4 0 00-5 5L4 15l5 5 5.5-5.5a4 4 0 005-5l-2.5 2.5-3-.5-.5-3z"/>'], msl: ['補彈', '<path d="M6 18l2.5-2.5M8.5 15.5L17 7l3-4-4 3-8.5 8.5zM7 12l5 5"/>'],
  raid: ['突襲', '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'],
  traid: ['派出', '<path d="M3 12l16-7-5 16-3-6z"/>'], tcancel: ['召回', '<path d="M20 12H6M11 6l-6 6 6 6"/>'],
  op: ['任務', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'], top: ['派出', '<path d="M3 12l16-7-5 16-3-6z"/>'],
  shop: ['商店', '<path d="M4 8h16l-1.5 12h-13z"/><path d="M8.5 8V6a3.5 3.5 0 017 0v2"/>'], yard: ['船塢', '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>'],
  planet: ['建設', '<path d="M13.5 3.5l7 7-3 3-7-7z"/><path d="M12 8l-8.5 8.5 3 3L15 11"/>'], base: ['據點', '<path d="M5 21V3M5 4h12l-2 4 2 4H5"/>'],
};
const ccActKey = (id) => (/^cc-top-/.test(id) ? 'top' : /^cc-op-/.test(id) ? 'op' : id.replace(/^cc-/, '').replace('msl', 'msl'));
function ccActGrid(acts) {
  const badge = (d) => { const m = /(d[d,]*) 資金/.exec(d || '') || null, p = /成功率 (d+)%/.exec(d || ''); return p ? p[1] + '%' : m ? m[1] : ''; };
  return `<div class="cc-acts">${acts.map((o) => { const k = ccActKey(o.id), I = CC_ACT_ICO[k] || ['', '<circle cx="12" cy="12" r="6"/>'], b = badge(o.desc);
    return `<button type="button" class="cc-act ${o.cls || ''}" id="${o.id}" ${o.off ? 'disabled' : ''} data-h="${smuEsc(o.name)}" data-d="${smuEsc(String(o.desc || '').replace(/<[^>]+>/g, ''))}" title="${smuEsc(o.name)}"><svg viewBox="0 0 24 24">${I[1]}</svg><span>${I[0]}</span>${b ? `<i>${b}</i>` : ''}</button>`; }).join('')}</div><div class="cc-acth"><b>點圖示＝執行</b><span>滑過看說明</span></div>`;
}
function ccActHover(el) {
  const h = el.querySelector('.cc-acth'); if (!h) return;
  const show = (b) => { h.innerHTML = `<b>${b.dataset.h}</b><span>${b.dataset.d}</span>`; h.classList.toggle('off', b.disabled); };
  el.querySelectorAll('.cc-act').forEach((b) => { b.addEventListener('mouseenter', () => show(b)); b.addEventListener('focus', () => show(b)); b.addEventListener('touchstart', () => show(b), { passive: true }); });
  const first = el.querySelector('.cc-act.go:not([disabled])') || el.querySelector('.cc-act:not([disabled])'); if (first) show(first);
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
    const rc = ccRepairCost(S, Q), mc = ccMissileCost(S, Q), w1 = ccCanService(S, 'repair', Q), w2 = ccCanService(S, 'missile', Q);
    acts.push({ id: 'cc-repair', name: `修理${who}`, desc: rc ? `${rc} 資金${w1 ? `・現地維修 ×${CC_FIELD_K}（${w1}）` : ''}` : '不用修', off: !rc || S.pl.money < rc });   // 不在船塢＝現地維修，貴 1.5 倍
    acts.push({ id: 'cc-msl', name: '補飛彈', desc: mc ? `${mc} 資金${w2 ? `・現地補給 ×${CC_FIELD_K}` : ''}` : '已經滿了', off: !mc || S.pl.money < mc });
  }
  // 地面突襲、特戰任務：親自指揮的小隊＝親自打；其他小隊＝派出（公式計算，顯示成功率與存活率）
  const taskAct = (id, name, t, fx) => { const O = ccTaskOdds(S, Q, t), on = Q.task && Q.task.kind === t.kind && Q.task.sys === t.sys && Q.task.mis === t.mis;
    return on ? { id: 'cc-tcancel', name: `取消派出：${name}`, desc: `成功率 ${Math.round(O.p * 100)}%` } : { id, name: `派出${who}：${name}（計算）`, desc: `成功率 ${Math.round(O.p * 100)}%（${ccPartsTx(O.parts)}）・存活率 ${ccSurvTx(Q, O.surv)}${fx ? `・成功：${fx}` : ''}`, cls: 'go' }; };
  if (Q && !S.fin && qAt && s.sg && s.sg.f === S.fac) acts.push(me ? { id: 'cc-raid', name: '地面突襲', desc: busy ? '這週已經打過一場' : '親自打地面的破壞任務：成功＝這週結束時地面投降', off: busy, cls: 'go' } : taskAct('cc-traid', '地面突襲', { kind: 'raid', sys: s.id }, '這週結束時地面投降'));
  if (Q && !S.fin) for (const M of S.missions) if (M.sys === s.id && ccCanOp(S, M, Q)) acts.push(me ? { id: 'cc-op-' + M.id, name: `執行任務：${CC_OPFX[M.op].name}`, desc: busy ? '這週已經打過一場' : `${qAt ? '' : '從相鄰的星系滲透出擊・'}成功：${CC_OPFX[M.op].fx(S, M)}`, off: busy, cls: 'go' } : taskAct('cc-top-' + M.id, CC_OPFX[M.op].name, { kind: 'op', sys: s.id, mis: M.id }, CC_OPFX[M.op].fx(S, M)));
  if (!S.fin && s.shop && (s.shop !== 'nz' || cpNzOk(S))) acts.push({ id: 'cc-shop', name: `${CC_SHOP[s.shop].name}：買藍圖、研究資料`, desc: ccShopWhy(S, s) || '貨每週換', cls: ccShopWhy(S, s) ? '' : 'go' });
  if (!S.fin && V.live && s.owner === S.fac && (s.yard || ccYq(S, s.id).length || ccResAt(S, s.id).length)) acts.push({ id: 'cc-yard', name: '船塢：訂造、預備艦', desc: ccYardSum(S, s) || (ccCanOrder(S, s) ? `訂造：${ccCanOrder(S, s)}` : '在這裡訂造新船（排隊建造，大船比較久）'), cls: 'go' });
  if (!S.fin && s.bd && (V.live || (s.pv || []).length)) acts.push({ id: 'cc-planet', name: '星球：建設、投資', desc: cpMineSum(S, s) || (s.owner === S.fac ? '強化勢力的建築、蓋你自己的建築' : s.owner === SM_N ? '在中立星系蓋你的建築（看中立好感度）' : '看建築與收入'), cls: (s.owner === S.fac || s.owner === SM_N) ? 'go' : '' });
  if (!S.fin && ccRankOf(S).base && s.owner === S.fac && s.yard && S.pl.base !== s.id) acts.push({ id: 'cc-base', name: '設為據點', desc: `${CC_RULE.baseCost} 資金・在據點修理、補飛彈半價，軌道防禦每週重建`, off: S.pl.money < CC_RULE.baseCost });
  // 進攻這裡的勝率（選中的小隊＋同一週也要開進來的你的其他小隊 對 守軍＋防禦）
  let odds = '';
  const defSq = here.filter((q) => q.fac === own0);
  if (Q && own0 >= 0 && ccHostile(S, S.fac, own0) && own0 !== S.fac && (dl.length || defSq.length)) {
    const A = [Q, ...ccOwn(S).filter((q) => q !== Q && (q.to != null ? q.to : q.sys) === s.id && !q.task)].slice(0, CC_RULE.maxSq), O = ccOdds(S, A, defSq.slice(0, 2), dl, 0);
    odds = `<div class="cc-oddsbox"><h4>${A.map((q) => smuEsc(q.name)).join('＋')}進攻這裡</h4><div>勝率 <b class="cc-odds" style="color:${ccOddCol(O.win)}">${Math.round(O.win * 100)}%</b>　${who}存活率：${ccSurvTx(Q, O.surv[0][0])}</div><div class="g-dim" style="font-size:11px">${V.live ? '' : `照 ${V.age} 週前的情報估計・`}${me ? '公式不含親自操艦的技術、地形；開戰前還會再顯示一次' : '不是親自指揮的小隊：照這個機率計算結果'}</div></div>`;
  }
  const unk = own0 < 0, intelTx = V.live ? '' : unk ? '<dt>情報</dt><dd style="color:#ffb35a">沒有情報：從沒看過這個星系</dd>' : `<dt>情報</dt><dd style="color:#ffb35a">${V.age} 週前（第 ${S.turn - V.age} 週）看到的樣子・小隊靠近（相鄰）或偵察才會更新</dd>`;
  el.hidden = false;
  el.style.setProperty('--pc', unk ? '#7d8794' : ccFacCol(S, own0));
  el.innerHTML = `<button class="sm-x" id="cc-x">×</button><div class="ccm-ch"><h3><i></i>${s.name}</h3><span class="en">${unk ? 'UNKNOWN' : V.live ? 'SYSTEM' : `INTEL −${V.age}W`}</span></div><div class="ccm-cb">
    <dl class="sm-kv">${intelTx}<dt>擁有者</dt><dd>${unk ? '不明' : SM_FAC[own0].name}${s.cap && !unk ? '・首都' : ''}${s.id === S.pl.base ? '・<b style="color:#3fdf8f">你的據點</b>' : ''}</dd>${unk ? '' : `<dt>等級</dt><dd>${SM_TIER[s.tier]}${V.live && s.bd ? `・${cpSum(S, s)}` : ''}・地面防禦 ${V.def}${V.live && s.def0 != null && s.def < s.def0 ? `／${s.def0}（受創，圍城 ${ccSiegeNeed(s)} 週）` : ''}</dd>
      <dt>軌道防禦</dt><dd>${dl.length ? dl.map((d) => `${CAP_UNIT[d.type].name} ${Math.round(d.hp * 100)}%`).join('、') : '沒有'}</dd>
      <dt>設施</dt><dd>${[V.yard ? '維修船塢（修船、造艦）' : '', V.depot ? '補給站（補飛彈）' : ''].filter(Boolean).join('、') || '沒有'}</dd>${V.live && ccYardSum(S, s) ? `<dt>你的船塢</dt><dd>${ccYardSum(S, s)}</dd>` : ''}`}
      ${cpNzRow(S, s, V)}<dt>太空</dt><dd>${CAP_SPACE[s.scene || 'belt'].name}<div class="g-dim" style="font-size:11px">${CAP_SPACE[s.scene || 'belt'].desc}</div></dd>
      ${V.live && s.sg ? (() => { const G = ccGroundScore(S, s, s.sg.f), P = G.p, f1 = (v) => (v >= 0 ? '+' : '') + v.toFixed(1); return `<dt>圍城</dt><dd>${SM_FAC[s.sg.f].name}・第 ${s.sg.w} 週（${ccSiegeNeed(s)} 週投降）</dd><dt>投降評分</dt><dd><b style="color:${G.v < 0 ? '#ff7a6b' : '#3fdf8f'}">${f1(G.v)}</b>${G.v < 0 ? '・下週投降' : '・抵抗'}<br><span class="g-dim">聲望 ${f1(P.fame)}・艦隊 ${f1(P.fleet)}・地面 ${f1(P.ground)}・鄰近艦隊 ${f1(P.near)}（負數就投降）</span></dd>`; })() : ''}
      ${V.live && ccCut(S, s) ? `<dt>補給</dt><dd style="color:#ffb35a">切斷到第 ${s.fx.cut} 週（不補飛彈、只修一半、防禦不重建）</dd>` : ''}
      ${ccIntel(S, s) ? `<dt>情報</dt><dd style="color:#7fdcff">偵察中，到第 ${s.fx.intel} 週</dd>` : ''}
      ${S.missions.filter((M) => M.state === 'open' && M.sys === s.id).map((M) => `<dt>任務</dt><dd style="color:#c9a7ff">${ccMisName(M)}・剩 ${M.due - S.turn} 週</dd>`).join('')}</dl>
    ${odds}
    ${Q ? `<div class="cc-for">下面的命令給：<b>${me ? '★' : ''}${who}</b>（點下面的小隊、或在小隊面板換）</div>` : ''}
    <h4>小隊${V.live ? '' : unk ? '（不明）' : `（${V.age} 週前）`}</h4>${here.length ? here.map((q) => `<div class="cc-sq ${q.pl ? 'pl' : ''} ${q === Q ? 'cur' : ''}" style="--c:${SMU_REL[ccRel(S, q)].col}" ${q.pl ? `data-sq="${q.id}" title="選這個小隊下命令"` : ''}><b style="color:${SMU_REL[ccRel(S, q)].col}">${q.id === S.pl.sq ? '★' : ''}${smuEsc(q.name)}</b>${ccSqNote(S, q)}${ccShipRows(q)}</div>`).join('') : (unk ? '<div class="g-dim">不明</div>' : '<div class="g-dim">沒有</div>')}
    ${acts.length ? ccActGrid(acts) : ''}</div>`;
  CC_place(el); ccActHover(el);
  const on = (id, fn) => { const b = gEl(id); if (b) b.onclick = fn; };
  const re = () => { ccSave(S); ccDock(); ccCard(); };
  el.querySelectorAll('[data-sq]').forEach((b) => (b.onclick = () => { CC.cur = +b.dataset.sq; ccDock(); ccCard(); }));
  on('cc-x', () => { CC.sel = -1; ccCard(); });
  on('cc-go', () => { if (!ccCanMove(S, s.id, Q)) { Q.to = s.id; Q.task = null; re(); } });
  on('cc-cancel', () => { Q.to = null; re(); });
  on('cc-repair', () => { const before = Q.ships.filter((c) => c.hp < 0.999).map((c) => ({ c, hp: c.hp })); if (!ccRepair(S, Q)) { ccRender(); return; } ccSave(S); crRepair(before, SM_FAC[S.fac].game, () => ccRender()); });
  on('cc-msl', () => { ccResupply(S, Q); ccSave(S); ccRender(); });
  on('cc-yard', () => ccYardView(s));
  on('cc-planet', () => cpView(s));
  on('cc-shop', () => ccShopView(s));
  on('cc-raid', () => ccRaidCover(S, s));   // 先選掩護方式
  on('cc-base', () => { ccMoveBase(S, s); ccSave(S); ccRender(); });
  on('cc-traid', () => { ccSetTask(S, Q, { kind: 'raid', sys: s.id }); re(); });
  on('cc-tcancel', () => { Q.task = null; re(); });
  for (const M of S.missions) { on('cc-op-' + M.id, () => ccLaunch(S, 'op', { sys: s.id, mis: M.id })); on('cc-top-' + M.id, () => { ccSetTask(S, Q, { kind: 'op', sys: s.id, mis: M.id }); re(); }); }
}
// 研發（第 4 步）：研究點數、目前的研究、研發樹
function ccTechView(sel) {
  ccvCss();
  const S = CC.S, X = ccT(S), cur = X.cur, L = ccvTechLayout(S).ids;
  if (sel && CC_TECH[sel]) CC.tsel = sel;
  if (CC.tsel && !L.includes(CC.tsel)) CC.tsel = null;   // 沒有預設選中：點了圖示才出現說明
  const nDone = L.filter((id) => X.done[id]).length;
  const strip = `<div class="ccs-stat" style="--sc:var(--violet)"><div><span>研究點數</span><b style="color:#c9a7ff">${S.pl.rp}</b></div><div><span>研究中</span><b style="font:900 16px/1.9 'Noto Sans TC',sans-serif">${cur ? `${CC_TECH[cur.id].name}<small>剩 ${cur.left} 週</small>` : '<span style="color:var(--dim);display:inline">閒著</span>'}</b></div><div><span>完成</span><b>${nDone}<small>／${L.length}</small></b></div><div><span>Mk 上限</span><b style="color:${ccMkCol(ccMkRes(S))}">${CAP_MK_NAME[ccMkRes(S)]}</b></div></div>`;
  ccmSheet(`<h3>研發<span class="en">R&amp;D ・ TECH TREE</span></h3>${strip}
    <div class="ccs-note">研究點數來源：任務完成（戰功的 1/10）、打贏後打撈殘骸（親自打的每擊沉一艘 ${CC_RP.kill} 點、計算的戰鬥每艘 ${CC_RP.calc} 點）、據點的研究所（每週 ${CC_RP.lab} 點）。一次研究一項，開始時付點數。別的陣營的招牌模組要先拿到藍圖（打贏後打撈、商店買）。</div>
    ${CCV_LEGEND_T}<div class="ccv-tw">${ccvTechTree(S, CC.tsel)}</div>${ccProfHtml(S)}
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`, '', 'var(--violet)');
  gEl('cc-close').onclick = () => { smuCloseModal(); ccRender(); };
  document.querySelectorAll('[data-tn]').forEach((b) => (b.onclick = () => { CC.tsel = CC.tsel === b.dataset.tn ? null : b.dataset.tn; ccTechKeep(); }));
  const dx = document.querySelector('.ccv-det .x'); if (dx) dx.onclick = () => { CC.tsel = null; ccTechKeep(); };
  ccvTechPlace();
  document.querySelectorAll('[data-tech]').forEach((b) => (b.onclick = () => { const err = ccTechStart(S, b.dataset.tech); if (err) { toast(err, 'warn'); return; } ccSave(S); ccRender(); ccTechView(); }));
}
// 重畫研發、捲動的位置不變（上下＝面板、左右＝研發樹）
function ccTechKeep() { const q = (s) => document.querySelector(s), y = q('.ccm-sheet').scrollTop, x = q('.ccv-tw') ? q('.ccv-tw').scrollLeft : 0; ccTechView(); q('.ccm-sheet').scrollTop = y; if (q('.ccv-tw')) q('.ccv-tw').scrollLeft = x; ccvTechPlace(); }
// 商店貨品的簡易圖示（使用者 2026-11-21）：藍圖＝紙捲（角落疊那個模組的圖示）、研究資料＝晶片、教官訓練＝階級章
const CC_SHOP_ICO = {
  bp: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 10h5M9 13h7M9 16h4" stroke-dasharray="1.5 1.5"/>',
  rp: '<rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3"/>',
  xp: '<path d="M5 9l7-5 7 5M5 14l7-5 7 5M5 19l7-5 7 5"/>',
};
function ccShopIco(it) {
  const c = it.kind === 'bp' ? 'var(--gold)' : it.kind === 'rp' ? 'var(--violet)' : 'var(--own)';
  const mod = it.kind === 'bp' && typeof CC_MODICO !== 'undefined' && CC_MODICO[it.k] ? `<svg class="m" viewBox="0 0 20 20">${CC_MODICO[it.k]}</svg>` : '';
  return `<span class="ccs-ico" style="--c:${c}"><svg viewBox="0 0 24 24">${CC_SHOP_ICO[it.kind] || CC_SHOP_ICO.rp}</svg>${mod}</span>`;
}
// 商店（第 5 步）：貿易站、黑市；貨每週換
function ccShopView(s) {
  cpvCss();   // 格子、浮出的說明跟星球畫面同一套（capplanet_ui.js）
  const S = CC.S, T = CC_SHOP[s.shop], why = ccShopWhy(S, s), L = ccShopStock(S, s), K = ccShopK(S, s), blk = s.shop === 'black', sc = blk ? 'var(--red)' : 'var(--gold)';
  if (CC.ssel && (CC.ssel.sys !== s.id || CC.ssel.turn !== S.turn)) CC.ssel = null;
  const sel = CC.ssel ? CC.ssel.i : -1;
  const got = (it, i) => ccShopBought(S, s, i) || (it.kind === 'bp' && ccHasBp(S, it.k));
  const short = (it) => (it.kind === 'bp' ? ccBpName(it.k) : it.kind === 'rp' ? `研究 +${it.n}` : `經驗 +${it.n}`);
  const col = (it) => (it.kind === 'bp' ? 'var(--gold)' : it.kind === 'rp' ? 'var(--violet)' : 'var(--own)');
  // 一格貨品：圖示＋短名，右上角＝價錢；買過的變暗
  const tile = (it, i) => `<button type="button" class="cpv-t shop-t${i === sel ? ' sel' : ''}${got(it, i) ? ' got' : ''}" data-si="${i}" style="--c:${col(it)}"><div>${ccShopIco(it)}<span>${smuEsc(short(it))}</span></div><b class="tag pr">${got(it, i) ? '已買' : fmtN(it.p)}</b></button>`;
  const det = (it, i) => {
    if (i !== sel) return '';
    const g = got(it, i), no = why || (g ? '已經買了' : S.pl.money < it.p ? `資金不夠（要 ${it.p}）` : '');
    const M = it.kind === 'bp' ? CAP_MODS[it.k.split(':')[0]][it.k.split(':')[1]] : null;
    const d = it.kind === 'bp' ? `${M.desc}。買到後在「研發」研究（${SM_FAC[CC_ORG[it.k]].name}的技術）。` : it.kind === 'rp' ? `研究點數 +${it.n}，馬上可以用在「研發」。` : `在場你的小隊每艘 +${it.n} 經驗（船的等級決定 Mk 上限）。`;
    return `<div class="cpv-det" style="--c:${col(it)}"><button type="button" class="x" data-si="${i}">✕</button><div class="hd">${ccShopIco(it)}<div><h5>${smuEsc(ccShopItemName(it))}</h5><div class="lab">${fmtN(it.p)} 資金${it.kind === 'bp' ? '・藍圖' : ''}</div></div></div>
      <div class="d">${d}</div><div class="acts"><button class="g-btn${no ? '' : ' primary'}" data-buy="${i}" ${no ? 'disabled' : ''}>${no ? smuEsc(no) : `買（${fmtN(it.p)} 資金）`}</button></div></div>`;
  };
  ccmSheet(`<h3>${s.name} 的${T.name}<span class="en">${blk ? 'BLACK MARKET' : 'TRADE POST'}</span></h3>
    <div class="ccs-stat"><div><span>資金</span><b>${fmtN(S.pl.money)}</b></div><div title="${blk ? '黑市貴 30%、看海盜' : '看中立勢力'}對你的好感度與你的陣營的聲望"><span>價格</span><b style="color:${K > 1.05 ? 'var(--red)' : K < 0.95 ? 'var(--own)' : '#fff'}">×${K.toFixed(2)}</b></div><div><span>本週貨品</span><b>${L.length}</b></div></div>
    ${why ? `<div class="ccs-warn">${why}</div>` : ''}
    <div class="cpv-area">${L.length ? `<div class="cpv-grid">${L.map(tile).join('')}</div>${L.map(det).join('')}` : '<div class="g-dim">這週沒有貨。</div>'}</div>
    <div class="g-dim" style="font-size:12px;margin-top:6px">貨每週換${s.shop === 'trade' ? '・擁有者跟你交戰中就不賣' : '・黑市誰都賣'}・點貨品看說明</div>
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`, 'narrow', sc);
  gEl('cc-close').onclick = () => { CC.ssel = null; smuCloseModal(); ccRender(); };
  document.querySelectorAll('.ccm-sheet [data-si]').forEach((b) => (b.onclick = () => { const i = +b.dataset.si; CC.ssel = sel === i ? null : { sys: s.id, turn: S.turn, i }; ccShopView(s); }));
  document.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => { const err = ccShopBuy(S, s, +b.dataset.buy); if (err) { toast(err, 'warn'); return; } ccSave(S); ccRender(); ccShopView(s); }));
  cpvPlace();
}
// 艦長熟練度的列表（研發視窗的下面）
function ccProfHtml(S) {
  const P = S.pl.prof || {}, mx = CAP_PROF.lv.length - 1;
  const keys = CAP_SLOTS.flatMap(([slot]) => [capProfKey(slot), ...Object.keys(CAP_MODS[slot]).map((id) => capProfKey(slot, id))]).filter((k) => P[k] || k.endsWith(':std'));
  return `<h4 style="margin:12px 0 4px">艦長熟練度</h4><div class="g-dim" style="font-size:12px">每一種裝備一條。經驗只從你親自開的船累積（照親自開的時間分配），效果套用到你所有小隊裝那種裝備的船：每級 +${Math.round(CAP_PROF.per * 100)}%，Lv${mx} 再解鎖特性。</div>`
    + ccvProf(S, keys);   // 等級格子（caplevel_ui.js）
}
// 船塢的摘要：建造中、排隊、預備艦
function ccYardSum(S, s) {
  const Y = ccYq(S, s.id), R = ccResAt(S, s.id), a = [];
  if (Y.length) a.push(`${Y[0].kind === 'fit' ? '改裝中' : '建造中'}：${CAP_HULLS[Y[0].key].name}（剩 ${Y[0].left} 週${Y[0].held ? '・暫停' : ''}）${Y.length > 1 ? `・排隊 ${Y.length - 1} 艘` : ''}`);
  if (R.length) a.push(`預備艦 ${R.length} 艘`);
  return a.join('・');
}
// 船塢（生產第 2 步）：訂造、排隊、預備艦、把船停進船塢
function ccYardView(s) {
  const S = CC.S, why = ccCanOrder(S, s), Y = ccYq(S, s.id), R = ccResAt(S, s.id), here = S.sq.filter((q) => q.pl && q.ships.length && q.sys === s.id);
  const canNew = ccOwnCount(S) < ccSlots(S), yardOk = s.owner === S.fac && s.yard;
  const dest = CC.yto != null && here.some((q) => q.id === CC.yto) ? CC.yto : 'res';
  const hulls = CAP_HULL_ORDER.filter((k) => ccHullOk(S, k));
  const etaNew = (k) => { const ins = { at: Y.length, w: ccBuildW(S, k) }; return ccYqSim(S, s.id, ins).get(ins); };
  const order = why ? `<p class="g-dim">不能訂造：${why}</p>` : `
    <div class="g-dim" style="font-size:12px;margin-bottom:4px">造好後：</div>
    <div class="sm-seg" id="cc-yto" data-val="${dest}">${here.map((q) => `<button data-v="${q.id}" class="${dest === q.id ? 'on' : ''}">加入${smuEsc(q.name)}</button>`).join('')}<button data-v="res" class="${dest === 'res' ? 'on' : ''}">停在船塢（預備艦）</button></div>
    ${smuActs(hulls.map((k) => ({ id: 'cc-o-' + k, name: `訂造${CAP_HULLS[k].name}`, desc: `${CC_RULE.build[k]} 資金・建造 ${ccBuildW(S, k)} 週・${etaNew(k)} 週後完成`, off: S.pl.money < CC_RULE.build[k] })), 150)}`;
  const queue = Y.length ? Y.map((o, n) => { const q = o.to != null && S.sq.find((x) => x.id === o.to);
    return `<div class="cc-ship cc-yq" style="grid-template-columns:1fr auto"><span><b>${n ? `${n + 1}.` : o.kind === 'fit' ? '改裝中' : '建造中'} ${o.kind === 'fit' ? '改裝' : ''}${o.kind === 'fit' ? ccShipNm(o.c) : CAP_HULLS[o.key].name}</b> <span class="g-dim">${o.held ? '<span style="color:#ff8a7a">暫停</span>' : `${ccYqEta(S, o)} 週後${o.kind === 'fit' ? '好' : '完成'}`}・${o.kind === 'fit' ? `${ccFitTx(o.fit, CAP_HULLS[o.key], o.c)}・` : ''}${q ? `${o.kind === 'fit' ? '回到' : '加入'}${smuEsc(q.name)}` : '停在船塢'}</span>${ccBar(1 - o.left / o.tot, '#c9a7ff')}</span><button class="g-btn" data-ycan="${o.id}">取消（退 ${ccYqBack(o)}）</button></div>`; }).join('') : '<div class="g-dim">沒有。</div>';
  const res = R.length ? R.map((x) => `<div class="cc-ship cc-yq" style="grid-template-columns:auto 1fr auto"><b>${ccShipNm(x.c)}</b>${ccShipBars(x.c)}<span>${here.map((q) => `<button class="g-btn" data-rj="${x.id}:${q.id}" ${q.ships.length >= CC_RULE.maxShips ? 'disabled title="那一隊已經滿了"' : ''}>→${smuEsc(q.name)}</button>`).join('')}<button class="g-btn" data-rf="${x.id}" ${yardOk ? '' : 'disabled'}>改裝</button><button class="g-btn" data-rj="${x.id}:new" ${canNew ? '' : `disabled title="指揮權不夠（${ccRankOf(S).name}最多帶 ${ccSlots(S)} 隊）"`}>成立新小隊</button></span></div>`).join('') : '<div class="g-dim">沒有。</div>';
  const put = yardOk && here.length ? `<h4 style="margin:10px 0 4px">小隊的船：改裝、停進船塢</h4>${here.map((q) => `<div class="cc-sq pl"><b style="color:#3fdf8f">${q.id === S.pl.sq ? '★' : ''}${smuEsc(q.name)}</b>${q.ships.map((c, k) => `<div class="cc-ship cc-yq" style="grid-template-columns:auto 1fr auto"><b>${ccShipNm(c)}</b>${ccShipBars(c)}<button class="g-btn" data-rf2="${q.id}:${k}">改裝</button><button class="g-btn" data-rp="${q.id}:${k}" ${q.id === S.pl.sq && q.ships.length <= 1 ? 'disabled title="親自指揮的小隊至少要留一艘"' : ''}>停進船塢</button></div>`).join('')}</div>`).join('')}` : '';
  ccmSheet(`<h3>${s.name} 的船塢<span class="en">SHIPYARD</span></h3>
    <div class="g-dim" style="font-size:12px">一座船塢一次造一艘，排前面的先造；大船造得久。改裝佔用一週，排在還沒開工的造船前面。造好的船停在船塢當預備艦，在這裡編進小隊。星系失守時，排隊暫停、預備艦與改裝中的船被俘。資金 ${S.pl.money}</div>
    <h4 style="margin:10px 0 4px">訂造</h4>${order}
    <h4 style="margin:10px 0 4px">排隊（${Y.length}／${CC_RULE.yardQ}）</h4>${queue}
    <h4 style="margin:10px 0 4px">預備艦</h4>${res}
    ${put}
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`, '', 'var(--gold)');
  const re = (err) => { if (err) { toast(err, 'warn'); return; } ccSave(S); ccRender(); ccYardView(s); };
  gEl('cc-close').onclick = () => { smuCloseModal(); ccRender(); };
  const seg = gEl('cc-yto'); if (seg) seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { CC.yto = b.dataset.v === 'res' ? null : +b.dataset.v; }));
  for (const k of hulls) { const b = gEl('cc-o-' + k); if (b) b.onclick = () => { const v = smuVal('cc-yto'); re(ccOrder(S, k, s, v && v !== 'res' ? +v : null) ? '' : '沒辦法訂造'); }; }
  document.querySelectorAll('[data-ycan]').forEach((b) => (b.onclick = () => { ccOrderCancel(S, +b.dataset.ycan); re(); }));
  document.querySelectorAll('[data-rj]').forEach((b) => (b.onclick = () => { const [rid, to] = b.dataset.rj.split(':'); re(ccResJoin(S, +rid, to === 'new' ? 'new' : +to)); }));
  document.querySelectorAll('[data-rp]').forEach((b) => (b.onclick = () => { const [qi, k] = b.dataset.rp.split(':').map(Number); re(ccResPut(S, ccSqById(qi), k)); }));
  document.querySelectorAll('[data-rf]').forEach((b) => (b.onclick = () => ccFitView({ rid: +b.dataset.rf })));
  document.querySelectorAll('[data-rf2]').forEach((b) => (b.onclick = () => { const [qi, k] = b.dataset.rf2.split(':').map(Number); ccFitView({ q: qi, k }); }));
}
// 改裝、Mk 升級（第 3 步）：src＝{ q: 小隊 id, k: 第幾艘 } 或 { rid: 預備艦 id }；D＝還沒送出的改裝（每點一下重畫）
function ccFitView(src, D) {
  const S = CC.S, F = ccFitSrc(S, src); if (!F) { smuCloseModal(); return; }
  const c = capShipFix(F.c), H0 = CAP_HULLS[c.key], s = S.sys[F.sys], cap = ccMkCap(S, c), capL = capMkCapLv(c.lv);
  D = D || { mod: { ...c.mod }, mk: { ...c.mk } }; ccIcoCss();
  const hx0 = ccHexNow();   // 六角圖：從上一次的形狀動畫過去
  const rows = CAP_SLOTS.map(([slot, nm]) => {
    const cur = D.mod[slot] || '', same = cur === (c.mod[slot] || ''), k0 = same ? c.mk[slot] || 1 : 1, kc = D.mk[slot] || 1;
    const opts = [['', ccModIco(slot, '') + capModBase(H0, slot)], ...Object.entries(CAP_MODS[slot]).map(([id, M]) => { const w = ccFitOk(S, H0, slot, id); return [id, ccModIco(slot, id) + M.name + (w ? '🔒' : ''), !!w, w || M.desc]; })];
    const mks = [1, 2, 3].map((k) => [k, ccMkBadge(k), k > cap || k < k0, k > cap ? (k > capL ? `船要 Lv${k === 2 ? 3 : 5}` : `要先研究 Mk ${k === 2 ? 'II' : 'III'} 工藝`) : k < k0 ? 'Mk 不能降' : `主要數值 ×${CAP_MK[k]}`]);
    const M = cur && CAP_MODS[slot][cur], chg = !same || kc !== (c.mk[slot] || 1);
    return `<tr${chg ? ' class="chg"' : ''}><td><span class="cc-slot">${ccModIco(slot, cur, ccMkCol(kc))}${nm}</span></td><td>${smuSeg('cc-fm-' + slot, opts, cur)}<div class="g-dim" style="font-size:11px;margin-top:2px">${M ? M.desc : '原廠'}${!same && (c.mk[slot] || 1) > 1 ? `（換模組＝回到 Mk I）` : ''}</div></td><td>${smuSeg('cc-fk-' + slot, mks, kc)}</td></tr>`;
  }).join('');
  const A = capProfMod(capHullMod(H0, c), c.mod, S.pl.prof), B = capProfMod(capHullMod(H0, D), D.mod, S.pl.prof), f1 = (v) => Math.round(v * 10) / 10;
  const chg = [], cmp = (nm, a, b, fmt = f1, hi = 1) => { const x = fmt(a), y = fmt(b), d = b - a, col = Math.abs(d) < 1e-6 ? '' : (d > 0) === (hi > 0) ? '#3fdf8f' : '#ff8a7a'; if (col) chg.push(`${nm} ${x} → <b style="color:${col}">${y}</b>`); return `<dt>${nm}</dt><dd>${x}${col ? ` → <b style="color:${col}">${y}</b>` : ''}</dd>`; };
  const dps = (H) => H.main.dmg / H.main.cd, tdps = (H) => (H.tur.n * H.tur.dmg) / H.tur.cd, mt = (H) => (H.msl ? H.msl.n * H.msl.dmg : 0);
  const st = cmp('船體', A.hp, B.hp, Math.round) + cmp('護盾', A.sh, B.sh, Math.round) + cmp('主砲每秒傷害', dps(A), dps(B)) + cmp('主砲射程', A.main.range, B.main.range, Math.round) + cmp('主砲射界（左右各）', A.main.arc, B.main.arc, Math.round)
    + cmp('副砲每秒傷害', tdps(A), tdps(B)) + cmp('點防禦', A.pd.n, B.pd.n, Math.round) + cmp('飛彈總傷害', mt(A), mt(B), Math.round) + cmp('護航機', A.ftr || 0, B.ftr || 0, Math.round)
    + cmp('最高速度', A.max, B.max) + cmp('轉向（°／秒）', A.turn, B.turn, Math.round);
  const cost = ccFitCost(c, D), bad = ccFitBad(S, c, D), why = ccFitWhy(S, s), eta = ccFitEta(S, s.id);
  const last = F.q && F.q.id === S.pl.sq && F.q.ships.length <= 1;
  const stop = why || bad || (last ? '親自指揮的小隊至少要留一艘（先把預備艦編進來，或從別隊調一艘）' : '') || (!cost ? '還沒選要改的地方' : '') || (S.pl.money < cost ? `資金不夠（要 ${cost}，有 ${S.pl.money}）` : '');
  const back = F.q ? `好了回到${smuEsc(F.q.name)}（那時還在 ${s.name}、沒滿的話；不然停在船塢）` : '好了停回船塢（預備艦）';
  ccmSheet(`<h3>改裝：${F.q ? smuEsc(F.q.name) + '・' : '預備艦・'}${H0.name} <span class="cc-lv${c.lv > 1 ? ' up' : ''}" style="font-size:13px">Lv${c.lv}</span><span class="en">REFIT</span></h3>
    <div class="g-dim" style="font-size:12px">在 ${s.name} 的船塢改裝：佔用船塢一週，跟造船排同一個隊（排在還沒開工的造船前面）。改裝中的船離開小隊、不能出戰；${back}。Mk 上限 <b>${CAP_MK_NAME[cap]}</b>（船的等級與研發取低的）。資金 ${S.pl.money}</div>
    <table class="cc-mods cc-fit"><tr><td></td><td class="g-dim">模組</td><td class="g-dim">Mk</td></tr>${rows}</table>
    <div class="cc-fitcmp">${ccHexSvg(A, B, H0)}<dl class="cc-cmp">${st}</dl></div>
    <div class="g-dim" style="font-size:12px">價錢：工錢 ${CC_RULE.fit.base}・換模組 ${CC_RULE.fit.mod.main}／${CC_RULE.fit.mod.tur}／${CC_RULE.fit.mod.msl}／${CC_RULE.fit.mod.def}／${CC_RULE.fit.mod.eng}（主砲／副砲／飛彈艙／防禦／引擎，換回原廠半價）・Mk II ${CC_RULE.fit.mk[2]}、Mk III 再 ${CC_RULE.fit.mk[3]}（每個槽位）</div>
    ${stop && cost ? `<div style="color:#ff8a7a;margin-top:6px">${stop}</div>` : ''}
    <div class="sm-btns"><button class="g-btn" id="cc-fit-no">${F.q ? '回到船的資料' : '回到船塢'}</button><button class="g-btn" id="cc-fit-rs" ${cost ? '' : 'disabled'}>重選</button><button class="g-btn primary" id="cc-fit-ok" ${stop ? 'disabled' : ''}>${cost ? `送進船塢（${cost} 資金・${eta} 週後好）` : '送進船塢'}</button></div>`, 'sm-wide cr-side', 'var(--violet)');
  const redo = () => ccFitView(src, D);
  ccHexAnim(hx0);
  // 整修庫（caprefit.js）：背景照現在的設定擺船；剛選的零件播安裝動畫，下方說明這次的數值變化
  { const ls = D._last, sl = ls && (ls.startsWith('mk:') ? ls.slice(3) : ls), nm = sl && (CAP_SLOTS.find(([k]) => k === sl) || [])[1], md = sl && D.mod[sl] && CAP_MODS[sl][D.mod[sl]];
    const head = nm ? `<b>${nm}：${md ? md.name : '原廠'}${(D.mk[sl] || 1) > 1 ? ' ' + CAP_MK_NAME[D.mk[sl]] : ''}</b>` : `<b>${H0.name}</b>　整修庫`;
    crShow({ c, D, fac: SM_FAC[S.fac].game, last: ls, cap: `${head}${chg.length ? '<br>' + chg.join('<br>') : '<br><span class="g-dim">在右邊選零件：船上會裝給你看</span>'}` }); D._last = null; }
  for (const [slot] of CAP_SLOTS) {
    const g1 = gEl('cc-fm-' + slot); if (g1) g1.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; const v = b.dataset.v; if (v) D.mod[slot] = v; else delete D.mod[slot]; D._last = slot; if ((D.mod[slot] || '') === (c.mod[slot] || '')) D.mk[slot] = c.mk[slot] || 1; else delete D.mk[slot]; redo(); }));
    const g2 = gEl('cc-fk-' + slot); if (g2) g2.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; const k = +b.dataset.v; if (k > 1) D.mk[slot] = k; else delete D.mk[slot]; D._last = 'mk:' + slot; redo(); }));
  }
  gEl('cc-fit-rs').onclick = () => ccFitView(src);
  gEl('cc-fit-no').onclick = () => { if (F.q) ccShipView(F.q, F.q.ships.indexOf(c)); else ccYardView(s); };
  gEl('cc-fit-ok').onclick = () => { const err = ccFitOrder(S, src, D); if (err) { toast(err, 'warn'); return; } ccSave(S); ccRender(); ccYardView(s); };
}
// 換船／分隊：同一個星系的你的小隊之間，不花時間
function ccSwapView(Q) {
  const S = CC.S, L = S.sq.filter((q) => q.pl && q.ships.length && q.sys === Q.sys), canNew = ccOwnCount(S) < ccSlots(S);
  ccmSheet(`<h3>換船／分隊：${S.sys[Q.sys].name}<span class="en">TRANSFER</span></h3><p class="g-dim">同一個星系的小隊之間可以換船，不花時間。每隊最多 ${CC_RULE.maxShips} 艘；親自指揮的小隊至少留一艘。${canNew ? '「分出」＝用這艘船成立新的小隊。' : `指揮權 ${ccOwnCount(S)}／${ccSlots(S)} 隊${CC_RULE.sqMerit[ccSlots(S)] ? `（戰功 ${CC_RULE.sqMerit[ccSlots(S)]} 可以多帶一隊）` : ''}。`}</p>
    <div class="cc-sw">${L.map((q) => `<div class="cc-sq pl"><b style="color:#3fdf8f">${q.id === S.pl.sq ? '★' : ''}${smuEsc(q.name)}</b>${q.ships.map((c, k) => `<div class="cc-ship"><b>${ccShipNm(c)}</b>${ccShipBars(c)}<span>${L.filter((o) => o !== q).map((o) => `<button class="g-btn" data-mv="${q.id}:${k}:${o.id}">→${smuEsc(o.name)}</button>`).join('')}${canNew && q.ships.length > 1 ? `<button class="g-btn" data-mv="${q.id}:${k}:new">分出</button>` : ''}</span></div>`).join('')}</div>`).join('')}</div>
    <div id="cc-swmsg" style="color:#ff8a7a;min-height:16px"></div><div class="sm-btns"><button class="g-btn primary" id="cc-close">完成</button></div>`, '', 'var(--own)');
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
  const [x, y] = ccXY(s), H = mp.clientHeight, kz = ccmK(), top = 168 * kz, bot = 24 * kz;   // 避開標題、工具列（capmap_ui.js）
  const dr = gEl('cc-drw') || document.querySelector('.sm-box.ccm-sheet:not(.cr-side)'), W = dr ? dr.getBoundingClientRect().left - mp.getBoundingClientRect().left - 20 : mp.clientWidth;   // 右側的任務／紀錄面板打開時，卡片不要蓋上去
  const m0 = mp.getBoundingClientRect(), rp = mp.querySelector('#cce-side.rep') || document.querySelector('#g-screen > #cce-side.rep'), X0 = rp ? rp.getBoundingClientRect().right - m0.left + 12 : 16;   // 左側的戰報打開時，卡片不要蓋上去
  const w = el.offsetWidth, L = x + 70 + w < W - 16 ? x + 70 : Math.max(X0, x - 70 - w);
  let B = H - bot;   // 底部：跟卡片左右重疊的面板（小隊面板、結束這一週、圖例）上緣
  for (const e of [document.querySelector('.ccm .cc-dock'), gEl('cc-end'), gEl('cc-leg')]) { if (!e) continue; const r = e.getBoundingClientRect(); if (r.right - m0.left > L && r.left - m0.left < L + w) B = Math.min(B, r.top - m0.top - 12); }
  if (B - top < 360) B = H - bot;   // 放不下就蓋過去
  el.style.maxHeight = (B - top) + 'px';
  const h = el.offsetHeight;
  el.style.left = L + 'px'; el.style.top = Math.max(top, Math.min(B - h, y - 120)) + 'px';
}

// ───── 結束這一週 ─────
function ccEndWeek(go, warped) {
  const S = CC.S; if (S.fin || CC.leaving) return;
  S.pl.flee = null;   // 撤退的目的地：結束這一週就照目前的
  // 提醒：駐守（沒有移動、沒有派出）的小隊下週會被進攻
  const W = go ? [] : S.sq.filter((q) => q.pl && q.ships.length && q.to == null && !q.task && ccThreatA(S, q, q.sys).length);
  if (W.length) {
    smuModal(ccmWarnHtml(S, W), 'ccm-warn');
    gEl('cc-endgo').onclick = () => { smuCloseModal(); ccEndWeek(true, warped); };
    gEl('cc-endback').onclick = () => { smuCloseModal(); const q = W[0]; CC.cur = q.id; CC.sel = q.sys; ccRender(); };
    return;
  }
  const P0 = ccPl(S);
  if (!warped && P0 && P0.to != null && !P0.task && ccIdleOn() && CAP.on) {   // 你指揮的小隊要換星系：先在巡航的場景播躍遷離開（capwarp.js），播完再結算這一週
    CC.leaving = true; if (gEl('sm-modal')) smuCloseModal(); overlay(null); CC.over = false; paused = false; updateTimeUI();
    const T = capWarpOutAll(CAP_WARP.charge); capFeed(`躍遷前往 ${S.sys[P0.to].name}`, 'ok');
    capWarpWait(T + 0.2, () => { CC.leaving = false; ccEndWeek(true, true); }); return;
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
function ccShipSt(c) { return { hp: c.hp, sh: c.sh, msl: c.msl, mod: c.mod, mk: c.mk }; }
const ccShipStP = (c) => ({ ...ccShipSt(c), prof: CC.S && CC.S.pl.prof });   // 你的船：再帶艦長熟練度   // mod、mk：模組與 Mk（capHullMod）
function ccLaunch(S, kind, o) {
  CC.brep = null; CC.rshow = false; cceRepOff(); S.pl.flee = null;
  const s = S.sys[o.sys], P = ccPl(S), R = CC_ROLES[S.role], li = CC_DIFF[S.diff].li, fac = SM_FAC[S.fac].game === 0 ? 0 : 1;
  const seed = ccSeedOf(S, s);
  let m, info = { kind, sys: s.id, own: [], foe: [], defIdx: [], mis: o.mis };
  if (kind === 'capture') {
    const B = S.pendB, A = B.A.map(ccSqById), D = B.D.map(ccSqById), mine = B.att ? A : D, foe = B.att ? D : A;
    const own = [P, ...mine.filter((q) => q !== P)], defs = B.att ? ccDefsAlive(s) : [], ownDefs = !B.att && s.owner === S.fac ? ccDefsAlive(s) : [];
    info.ownDefIdx = ownDefs.map((d) => s.defs.indexOf(d));
    info.own = own.map((q) => q.id); info.foe = foe.map((q) => q.id); info.att = B.att; info.defIdx = defs.map((d) => s.defs.indexOf(d));
    const duel = { a: own.map((q) => q.ships.map((c) => c.key)), b: foe.map((q) => q.ships.map((c) => c.key)), st: [own.map((q) => q.ships.map(ccShipStP)), foe.map((q) => q.ships.map(ccShipSt))], li, real: true, mine: own.map((q) => !!q.pl),   // mine：哪幾隊是玩家的（B 鍵只能切換到玩家的小隊）
      defs: defs.map((d) => ({ type: d.type, hp: d.hp })), ownDefs: ownDefs.map((d) => ({ type: d.type, hp: d.hp, k: d.k })), yard: B.att && s.yard, depot: B.att && s.depot, hm: R.tech.hull, shm: R.tech.shield,
      ownYard: !B.att && s.owner === S.fac && s.yard, ownDepot: !B.att && s.owner === S.fac && s.depot, ...cpScene(S, s, !B.att) };
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
    if (kind === 'raid') ccRaidPrep(S, s, m, o.cover || 'none', seed);   // 掩護：起點離目標的秒數、軌道轟炸、電子干擾
    let k = 0; for (const fd of m.fleets) if (fd.capRole === 'player') { fd.capSt = ccShipStP(P.ships[k]); fd.capHm = R.tech.hull; fd.capShm = R.tech.shield; k++; }
    info.own = [P.id];
    m.name = `${s.name}・${kind === 'raid' ? '地面突襲' : CC_OPFX[mis].name}`;
  }
  m.captain.cc = info;
  if (kind !== 'capture' || info.att) m.captain.arrive = true;   // 進攻、突襲、特戰：躍遷進場（迎擊戰本來就在這裡）
  // 戰場要雙方都有艦隊才開得起來：開不起來就改用計算的（佔領戰），或回到星圖（任務）
  if ([0, 1].some((sd) => !m.fleets.some((f) => f.side === sd && !f.reserve && simComp(f) > 0) && !(sd === 1 && kind === 'capture' && info.defIdx.length))) {
    if (kind === 'capture') return ccCalcPlayerBattle(S);
    ccLog(S, `${s.name}：戰場沒辦法開始，任務沒有執行`, 'bad'); return ccRender();
  }
  ccSave(S);
  simEndMid(); overlay(null);
  SIM.m = m; SIM.sel = null; camAnim = null;
  simStart();
  if (kind === 'capture') cceTab(S);   // 戰場左側的「交戰評估」按鈕（capengage_ui.js）
}
// 地面突襲前：選掩護方式（要先研發）。沒有掩護＝起點離目標 20 秒；軌道轟炸 5 秒；電子干擾 10 秒（capcareer.js 的 CC_COVER）
function ccRaidCover(S, s) {
  const lv = ccBombLv(S), acc = lv ? CC_COVER.bomb.acc[lv - 1] : 0;
  const L = [
    { id: 'cc-cv-none', name: '直接降落', desc: `起點離目標約 ${CC_COVER.none.secs} 秒（開到能開火）` },
    { id: 'cc-cv-bomb', name: `軌道轟炸${lv ? ' ' + 'I'.repeat(lv) : ''}`, desc: lv ? `起點約 ${CC_COVER.bomb.secs} 秒；先炸降落路線上的防空與飛彈，精準度 ${Math.round(acc * 100)}%（沒炸準＝防禦還在，或誤炸民用設施：繁榮 −3）` : '要先研發「軌道轟炸 I」', off: !lv, cls: lv ? 'go' : '' },
    { id: 'cc-cv-jam', name: '電子干擾', desc: ccHas(S, 'rjam') ? `起點約 ${CC_COVER.jam.secs} 秒；敵人前 ${CC_COVER.jam.jamT} 秒偵測不到你，防禦完好` : '要先研發「突襲電子干擾」', off: !ccHas(S, 'rjam'), cls: ccHas(S, 'rjam') ? 'go' : '' },
  ];
  smuModal(`<h3>地面突襲・${smuEsc(s.name)}<span class="g-dim" style="font-size:13px;font-weight:400;margin-left:8px">選擇掩護方式</span></h3>
    <p class="g-dim" style="font-size:13px">起點的距離是「開到能開火要幾秒」。掩護方式在「研發」的突襲分類解鎖。</p>${smuActs(L, 220)}
    <div class="sm-btns"><button class="g-btn" id="cc-cv-x">取消</button></div>`, 'sm-sm');
  gEl('cc-cv-x').onclick = smuCloseModal;
  for (const k of Object.keys(CC_COVER)) { const b = gEl('cc-cv-' + k); if (b) b.onclick = () => { if (b.classList.contains('off') || b.disabled) return; smuCloseModal(); ccLaunch(S, 'raid', { sys: s.id, cover: k }); }; }
}
// 突襲的戰場：照掩護方式拉近起點；軌道轟炸先擲每一座降落路線上的防禦（照精準度：炸掉／沒炸到／誤炸民用設施）；電子干擾設定開頭的偵測空窗
function ccRaidPrep(S, s, m, cover, seed) {
  const CV = CC_COVER[cover] || CC_COVER.none, C = m.captain, A = capApproachGround(m, CV.secs); if (!A) return;
  C.cover = cover;
  if (cover === 'jam') { C.jamT = CV.jamT; C.coverMsg = `電子干擾中：敵人前 ${CV.jamT} 秒偵測不到你`; return; }
  if (cover !== 'bomb') return;
  const acc = CV.acc[Math.max(0, ccBombLv(S) - 1)], R = mulberry32(campHash(seed, 211)), DEF = ['flak', 'site', 'tel', 'radar'];
  const seg = (u) => { const vx = A.T.x - A.S.x, vz = A.T.z - A.S.z, L2 = vx * vx + vz * vz || 1, k = Math.max(0, Math.min(1, ((u.x - A.S.x) * vx + (u.z - A.S.z) * vz) / L2)); return Math.hypot(u.x - (A.S.x + vx * k), u.z - (A.S.z + vz * k)); };
  let hit = 0, miss = 0, civ = 0;
  C.units = C.units.filter((u) => {
    if (!DEF.includes(u.type) || seg(u) > 260) return true;
    if (R() < acc) { hit++; return false; }
    if (R() < 0.5) miss++; else civ++;
    return true;
  });
  if (civ && s.bd) { s.prosp = Math.max(0, s.prosp - 3 * civ); ccLog(S, `${s.name}：軌道轟炸誤炸民用設施 ${civ} 處（繁榮 −${3 * civ}）`, 'bad'); }
  C.coverMsg = `軌道轟炸：炸掉防禦 ${hit} 座${miss ? `・${miss} 座沒炸到` : ''}${civ ? `・誤炸民用設施 ${civ} 處` : ''}`;
}
// 戰鬥結束（capReport 呼叫，CAP 還沒清掉）：各艦的狀態、戰果寫回生涯
function ccBattleDone() {
  cceTabOff();
  const S = CC.S || ccLoad(); CC.S = S;
  const C = SIM.m.captain, I = C.cc;
  const R = GAME.result || {}, s = S.sys[I.sys], st = CAP.stats || { ks: 0, merit: 0 };
  const rep = I.kind === 'idle' ? null : cceRepSnap(S, I);   // 戰報（capengage_ui.js）
  const put = (ids, L) => {
    const sqs = ids.map(ccSqById);
    for (const x of L) { const q = sqs[x.sq], c = q && q.ships[x.slot]; if (!c) continue; if (x.dead || !ships.alive[x.i]) { c.dead = true; continue; } c.hp = Math.max(0.02, ships.hp[x.i] / maxHp(x.i)); c.sh = ships.shMax[x.i] ? ships.sh[x.i] / ships.shMax[x.i] : 0; c.msl = x.H.msl ? x.mslN / x.H.msl.n : 0; if (q) ccXp(S, q, c, (I.kind === 'idle' ? 0 : CAP_XP.fight + CAP_XP.live) + (x.kxp || 0)); }
    for (const q of sqs) if (q) q.ships = q.ships.filter((c) => !c.dead);
  };
  const prof = I.kind === 'idle' ? [] : CAP.own.map((x) => { const q = ccSqById(I.own[x.sq]), c = q && q.ships[x.slot]; return c && x.flyT ? [c.mod, x.flyT, x.kxp || 0] : null; }).filter(Boolean);
  put(I.own, CAP.own); put(I.foe, CAP.foes);
  ccProfGain(S, prof);
  if (I.kind === 'idle') {   // 巡航中結束（撞進危險區被擊沉、暫停選單結束）：損傷照樣留下，小隊全滅＝生涯結束
    CC.idle = null; CC.over = false;
    const P = ccPl(S); if (!P || !P.ships.length) { S.fin = { why: `你的小隊在 ${s.name} 巡航時全滅`, turn: S.turn }; ccLog(S, S.fin.why, 'bad'); }
    ccSave(S); setPhase('menu'); return ccRender();
  }
  (I.ownDefIdx || []).forEach((di, k) => { const g = CAP.G.gts.find((u) => u.def && u.side === CAP.side && u.di === k); const d = s.defs[di]; if (d) d.hp = !g || gtDead(g) ? 0 : g.hp / g.max; });
  I.defIdx.forEach((di, k) => { const g = CAP.G.gts.find((u) => u.def && u.side !== CAP.side && u.di === k); const d = s.defs[di]; if (d) d.hp = !g || gtDead(g) ? 0 : g.hp / g.max; });
  for (const g of CAP.G.gts) { if (!gtDead(g) || g.pv) continue; if (g.cu === 'yard') cpKill(S, s, 'yard'); if (g.cu === 'depot') cpKill(S, s, 'depot'); }   // 你的建築（g.pv）打壞了不會拆掉
  if (R.capOk && st.ks) { ccRpGain(S, st.ks * CC_RP.kill, `打撈 ${s.name} 的殘骸`); const fq = I.foe.map(ccSqById).find(Boolean); ccBpDrop(S, fq ? fq.fac : s.owner, st.ks, CC_BP.kill, `打撈 ${s.name} 的殘骸`); }
  S.pl.kills += st.ks; S.pl.merit += st.merit; S.pl.money += Math.round(st.merit * 0.5); S.pl.weekFought = 1;
  const P = ccPl(S), ok = !!R.capOk, ret = !!R.retreat || R.why === '超過任務時限';
  if (!P || !P.ships.length) { S.fin = { why: `你的小隊在 ${s.name} 全滅`, turn: S.turn }; ccLog(S, S.fin.why, 'bad'); }
  else if (I.kind === 'capture') {
    if (ok) ccLog(S, `${s.name}：你的小隊打贏了（擊沉 ${st.ks} 艘${I.att ? '，取得軌道' : ''}）`, 'ok');
    else { ccLog(S, `${s.name}：你的小隊${R.retreat ? '躍遷撤退' : '撤出戰場'}`, 'bad'); for (const id of I.own) { const q = ccSqById(id); if (!q || !q.ships.length) continue;
      const O = q === P ? ccFleeOpts(S, q, s.id) : [];   // 你指揮的小隊：撤退的目的地在星圖上選（預設上週的星系）
      if (O.length) { q.sys = O.includes(q.prev) ? q.prev : O[0]; q.prev = s.id; q.to = null; if (O.length > 1) S.pl.flee = { q: q.id, from: s.id, opts: O }; }
      else if (I.att) { q.sys = q.prev; q.to = null; } else ccFlee(S, q); } }
    for (const id of I.foe) { const q = ccSqById(id); if (q && q.ships.length && ok) ccFlee(S, q); }
  } else if (I.kind === 'raid') {
    if (ok && s.sg) { s.sg.raid = true; ccLog(S, `${s.name}：地面突襲成功，地面守軍將在這週結束時投降`, 'ok'); } else ccLog(S, `${s.name}：地面突襲${ret ? '中止' : '失敗'}`, 'bad');
  } else if (I.kind === 'op') {
    const M = S.missions.find((x) => x.id === I.mis);
    if (M && ok) ccMissionDone(S, M, true); else ccLog(S, `${s.name}：特戰任務${ret ? '中止（任務還在，可以再出擊）' : '失敗'}`, 'bad');
  }
  if (rep) CC.brep = cceRepDone(S, rep, R, st);
  const wk = I.kind === 'capture';
  if (wk) { S.pendB = null; if (!S.fin) ccWeekB(S); }   // 這週先結算完（中途離開也不會壞檔）
  ccSave(S);
  // 畫面留在戰場（暫停），戰報出現在左邊交戰評估的位置；M／Esc／星圖按鈕才打開星圖（ccPostLeave，capengage_ui.js）
  CC.post = { week: wk, warp: (I.kind === 'raid' || I.kind === 'op') && !R.retreat && !!(P && P.ships.length) && !S.fin }; CC.rshow = true;   // warp：突襲、特戰打完離開時播躍遷離開
  cceRepTab(); cceRepRestore();
}
function ccLogView(L, title) {
  const col = { ok: '#5fd39a', bad: '#ff6a5a', ev: '#c9a7ff' };
  smuModal(`<h3>${title}</h3><div class="sm-log">${L.length ? L.map((x) => `<div style="color:${col[x.c] || '#aab7c8'}">第 ${x.turn} 週・${smuEsc(x.t)}</div>`).join('') : '<div class="g-dim">沒有紀錄。</div>'}</div><div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`);
  gEl('cc-close').onclick = smuCloseModal;
}
Object.assign(window.__cap || (window.__cap = {}), { ccNewGame, ccWeekA, ccWeekB, CC_RULE, ccLoad, ccSave, ccShow, ccState: () => CC, ccCard, ccLaunch, ccMissionDone, ccRender, ccPlan, ccTransfer, ccTakeCommand, ccSetTask, ccTaskOdds, ccRunTasks, ccOrder, ccOrderCancel, ccResJoin, ccResPut, ccYardView, ccFitView, ccFitOrder, ccFitCost, ccTechView, ccTechStart, ccT, ccShopView, ccShopBuy, ccShopStock, ccBpDrop, ccProfGain });

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
  if (rep) ccdOpen('log', { mode: 'week' });   // 上週的戰報：右側面板，不擋操作（capinfo_ui.js）
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
  const duel = { a: [P.ships.map((c) => c.key)], b: [], st: [[P.ships.map(ccShipStP)], []], li, real: true, idle: true, defs: [], ownDefs: mine ? ccDefsAlive(s).map((d) => ({ type: d.type, hp: d.hp, k: d.k })) : [],
    ownYard: mine && s.yard, ownDepot: mine && s.depot, hm: R.tech.hull, shm: R.tech.shield, ...cpScene(S, s, true) };
  if (P.arr && P.arrSeen !== P.arr) { duel.arrive = true; P.arrSeen = P.arr; }   // 這週剛到這個星系：播躍遷進入（capwarp.js）
  const m = capLayout({ ...capLoad(), fac, diff: li, env: ccSceneEnv(s), mis: 'capture', seed: ccSeedOf(S, s), ally: '', duel, noDef: false });
  m.captain.cc = { kind: 'idle', sys: s.id, own: [P.id], foe: [], defIdx: [], seed: ccSeedOf(S, s), env: ccSceneEnv(s) }; m.name = `${s.name}・巡航`;
  CC.idle = { key: ccIdleKey(S, P) }; CC.over = false;
  window.removeEventListener('resize', ccResize);
  simEndMid(); overlay(null);
  SIM.m = m; SIM.sel = null; camAnim = null;
  simStart();
  cceRepTab();   // 側邊的「戰報」（capengage_ui.js）
  if (CCL.dock) cclShow();   // 平常是停泊（大廳）；巡航中換場景就接著巡航（caplobby.js）
}
// 收起巡航的場景（不算戰鬥、沒有戰果）
function ccIdleStop() {
  if (!ccIdleOn()) return;
  cclRemove(); cceRepOff();
  CC.idle = null; CC.over = false;
  if (paused) { paused = false; updateTimeUI(); }
  setPhase('menu');
}
// 巡航中按 M：暫停、疊出星圖
function ccMapOpen() {
  if (!ccIdleOn()) return;
  if (CCL.on) cclHide(true);   // 關掉星圖時回到停泊
  paused = true; updateTimeUI(); if (document.pointerLockElement) document.exitPointerLock();
  CC.over = true; CC.S = CC.S || ccLoad(); ccRender();
}
// 回到星系：場景還是同一個星系、同一週、船的狀態沒變就接著飛；不然重新開一個
function ccFly() {
  const S = CC.S, P = S && ccPl(S); if (!P) return;
  if (gEl('sm-modal')) smuCloseModal();
  window.removeEventListener('resize', ccResize);
  if (ccIdleOn() && CC.idle && CC.idle.key === ccIdleKey(S, P)) {
    overlay(null); CC.over = false; cceRepTab(); cceRepRestore();
    if (CCL.dock) { paused = false; updateTimeUI(); cclShow(); } else capPause(false);   // 回到停泊（大廳）或接著巡航
    return;
  }
  ccIdleStop(); ccIdle(S);
}

// ───── 玩家的小隊捲入的戰鬥：直接開打（2026-11-11）─────
// 要撤退就在上一週移動到別的星系；開進敵方星系＝你下的命令。這週已經親自打過一場：用公式計算。
const CC_INB_T = 12;   // 迎擊戰：敵軍躍遷進來前的倒數（秒）
function ccBattleGo(S) {
  if (S.pl.weekFought) { ccLog(S, `${S.sys[S.pendB.sys].name}：這週已經親自打過一場，這場用公式計算`, 'ev'); return ccCalcPlayerBattle(S); }
  ccLaunch(S, 'capture', { sys: S.pendB.sys });   // 直接開打；交戰評估不強制顯示，戰場左側的按鈕可以打開（capengage_ui.js）
}
