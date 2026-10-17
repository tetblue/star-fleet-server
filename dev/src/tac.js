// ═══════════════════════ 戰術面板 ═══════════════════════
// 簡化的俯視戰場：每艘船畫成小點（看得出陣型）、分艦隊外框、艦隊狀態、移動路線與攻擊目標。
// 面板上也能下令（命令系統與主畫面相同）。單人模式打開時自動暫停，可在面板內繼續。
// 視角：auto＝自動對準部隊；用滾輪縮放或拖曳平移後改為手動，按「自動對焦」恢復
// 節點：正在前往的目的地與隊列裡的移動（groupNodes）。拖曳＝改位置；點一下＝陣型／刪除；高度與仰角在側視圖調整
const TAC = { open: false, autoPaused: false, el: null, cv: null, ctx: null, side: null, k: 1, ox: 0, oy: 0, drag: null, acc: 0, auto: true, node: null, pop: null };
function tacOpen() { return TAC.open; }
function buildTac() {
  const el = document.createElement('div'); el.id = 'tac'; el.hidden = true;
  el.innerHTML = `<div class="tac-top"><b>戰術面板</b><span class="g-dim" id="tac-time"></span>
      <span class="tac-help g-dim" id="tac-help"></span><span class="g-sp"></span>
      <span class="tac-legend"><i style="--c:#5ad1ff">移動</i><i style="--c:#8fe3a5">陣型</i><i style="--c:#ff7ad9">技能</i><i style="--c:#ff6a4a">攻擊</i></span>
      <button class="g-btn sm" id="tac-pause"></button><button class="g-btn sm" id="tac-speed"></button><button class="g-btn sm" id="tac-close">關閉（Tab）</button></div>
    <div class="tac-body"><div class="tac-mapwrap"><div class="tac-mapbox"><canvas id="tac-map"></canvas>
        <div class="tac-svbar tac-mapbar"><button class="g-btn sm" id="tac-fit" title="自動對準部隊（滾輪縮放、拖曳平移後會改成手動）">⤢ 自動對焦</button></div>
        <div class="tac-pop" id="tac-pop" hidden></div></div>
      <div class="tac-svbox"><canvas id="tac-sv"></canvas><div class="tac-svbar"><span id="tac-svt"></span><button class="g-btn sm" id="tac-svfit" title="恢復自動縮放">⤢ 重設</button><button class="g-btn sm" id="tac-svaxis" title="切換側視的方向"></button></div></div></div><div class="tac-side" id="tac-side"></div></div>`;
  document.body.appendChild(el);
  TAC.el = el; TAC.cv = el.querySelector('#tac-map'); TAC.ctx = TAC.cv.getContext('2d'); TAC.side = el.querySelector('#tac-side'); TAC.pop = el.querySelector('#tac-pop');
  el.querySelector('#tac-close').onclick = closeTac;
  el.querySelector('#tac-fit').onclick = () => { TAC.auto = true; tacFit(true); drawTac(); };
  TAC.pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  TAC.pop.addEventListener('click', tacPopClick);
  el.querySelector('#tac-pause').onclick = () => { TAC.autoPaused = false; togglePause(); };
  el.querySelector('#tac-speed').onclick = () => setSpeed((speedIdx + 1) % SPEEDS.length);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  const cv = TAC.cv;
  cv.addEventListener('pointerdown', tacDown); cv.addEventListener('pointermove', tacMove); cv.addEventListener('pointerup', tacUp);
  cv.addEventListener('pointercancel', () => { TAC.drag = null; });
  cv.addEventListener('pointerleave', () => { if (!TAC.drag) cv.style.cursor = ''; });
  // 滾輪：以游標為中心縮放（高度與仰角改在側視圖用拖曳調整）
  cv.addEventListener('wheel', (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const B = MAP_BOUNDS, kMin = 0.4 * Math.min(TAC.w / (B.x1 - B.x0), TAC.h / (B.z1 - B.z0)), kMax = 12;
    const k = Math.max(kMin, Math.min(kMax, TAC.k * Math.exp(-e.deltaY * 0.0015)));
    TAC.ox = mx - (mx - TAC.ox) * k / TAC.k; TAC.oy = my - (my - TAC.oy) * k / TAC.k; TAC.k = k;
    TAC.auto = false; drawTac();
  }, { passive: false });
  buildSideView(el);
}
// ── 節點 ──
function tacEditable() { return GAME.phase === 'battle' && !GAME.replaying; }
function tacNodes() { return overlayGroups().flatMap(groupNodes); }
function sameNode(a, b) { return !!a && !!b && a.g === b.g && a.ref === b.ref; }
function findNode(ref) { if (!ref) return null; const n = tacNodes().find((x) => sameNode(x, ref)); return n && (n.ref !== 'cur' || n.g.goal === ref.goal) ? n : null; }   // cur：目的地換了（抵達、改道）就不是同一個節點
function nodeEdit(nd, op, args = {}) {
  const sqs = nd.g.sqs.filter((q) => q.alive > 0 && !q.bg).map((q) => squadrons.indexOf(q)); if (!sqs.length) return;
  issue('qedit', { sqs, ref: nd.ref, op, ...args });
  if (TAC.node && sameNode(TAC.node, nd)) TAC.node.goal = nd.g.goal;   // 改了目前目的地的位置：目的地物件會換新
}
function tacNodeHit(px, py) {
  let best = null, bd = 10;
  for (const n of tacNodes()) { const d = Math.hypot(tx(n.x) - px, tz(n.z) - py); if (d < bd) { bd = d; best = n; } }
  return best;
}
const nodeName = (n) => (n.ref === 'cur' ? '目前目的地' : `節點 ${n.n}`);
const yTxt = (y) => (Math.abs(y) < 1 ? '0' : `${y > 0 ? '▲' : '▼'}${Math.round(Math.abs(y))}`);
const pTxt = (p) => { const d = Math.round((p || 0) * 180 / Math.PI); return `${d > 0 ? '+' : ''}${d}°`; };
// 節點的小視窗：陣型（抵達後換）、刪除
function openNodePop(n) { TAC.node = { g: n.g, ref: n.ref, goal: n.g.goal }; renderNodePop(); }
function closeNodePop() { TAC.node = null; if (TAC.pop) { TAC.pop.hidden = true; TAC.pop.dataset.h = ''; } }
function renderNodePop() {
  const n = findNode(TAC.node); if (!n) { closeNodePop(); return; }
  const h = `<div class="g-row"><b>${nodeName(n)}</b><span class="g-sp"></span><button class="g-btn sm" data-pc title="關閉">✕</button></div>
    <div class="g-dim">高度 ${yTxt(n.y)}・仰角 ${pTxt(n.P)}<br>（在下方側視圖拖曳節點／把手調整）</div>
    <div class="tac-pop-l">抵達後的陣型</div>
    <div class="tac-forms"><button class="g-btn sm ${n.form ? '' : 'on'}" data-pf="">不變陣</button>${RADIAL_ORDER.map((k) => `<button class="g-btn sm ${n.form === k ? 'on' : ''}" data-pf="${k}" title="${FORMATIONS[k].note}">${FORMATIONS[k].name}</button>`).join('')}</div>
    <div class="g-row" style="margin-top:6px"><span class="g-sp"></span><button class="g-btn sm" data-pd>${n.ref === 'cur' ? '刪除（停止目前移動）' : '刪除節點'}</button></div>`;
  const P = TAC.pop; if (P.dataset.h !== h) { P.dataset.h = h; P.innerHTML = h; }
  P.hidden = false;
  const w = P.offsetWidth, hh = P.offsetHeight;
  let x = tx(n.x) + 14, y = tz(n.z) + 14;
  if (x + w > TAC.w - 4) x = tx(n.x) - 14 - w; if (y + hh > TAC.h - 4) y = tz(n.z) - 14 - hh;
  P.style.left = Math.max(4, x) + 'px'; P.style.top = Math.max(4, y) + 'px';
}
function tacPopClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pc != null) { closeNodePop(); return; }
  const n = findNode(TAC.node); if (!n) { closeNodePop(); return; }
  if (!tacEditable()) { toast('回放中不能修改'); return; }
  if (b.dataset.pf != null) nodeEdit(n, 'form', { kind: b.dataset.pf || null });
  else if (b.dataset.pd != null) { nodeEdit(n, 'del'); closeNodePop(); }
  updateTacSide(); drawTac(); drawSideView();
}
function toggleTac() { if (BR.on) { bridgeToggleConsole(); return; } if (TAC.open) closeTac(); else openTac(); }   // 艦橋：低頭／抬頭
function openTac() {
  if (!(GAME.phase === 'battle' || GAME.phase === 'replay')) return;
  if (!TAC.el) buildTac();
  TAC.open = true; TAC.el.hidden = false;
  document.body.classList.toggle('tac-console', BR.on);    // 艦橋：戰術台（往下看才看到，蓋在畫面下方）
  document.body.classList.add('tac-on'); resize();          // 一般：戰場畫面讓出空間，不被蓋住
  const ap = BR.on ? SETTINGS.bridgePause : SETTINGS.tacPause;
  TAC.autoPaused = ap && !paused; if (ap) { paused = true; updateTimeUI(); }   // 單人：打開就暫停（可在設定關掉）
  gEl('tac-close').textContent = BR.on ? `抬頭（${keyLabel(keyOf('tactical'))}）` : `關閉（${keyLabel(keyOf('tactical'))}）`;
  gEl('tac-help').textContent = `左鍵：選艦隊／拖曳＝平移／按住＝指令輪盤　Shift＋左鍵拖曳：框選　滾輪：縮放　右鍵：移動（拖曳＝朝向）　${SETTINGS.queueMod}＋右鍵：加節點　節點：點＝陣型／刪除、拖曳＝改位置　${keyLabel(keyOf('attack'))}＋左鍵：指定攻擊`;
  buildTacSide(); tacResize(); drawTac();
}
function closeTac() {
  if (!TAC.open) return;
  if (BR.on && !BR.closing) { bridgeLook(null, BR_FWD); return; }   // 艦橋：關閉＝抬頭（戰術台跟著滑下去）
  TAC.open = false; TAC.el.hidden = true; TAC.drag = null; closeRadial(); closeNodePop();
  document.body.classList.remove('tac-on', 'tac-console'); TAC.el.style.transform = ''; TAC.el.style.opacity = ''; TAC.el.classList.remove('br-live'); resize();
  if (TAC.autoPaused && !GAME.result) { paused = false; updateTimeUI(); }   // 是面板自己暫停的才恢復
  TAC.autoPaused = false;
}
function tacResize() {
  svResize();
  const wrap = TAC.cv.parentElement, dpr = Math.min(2, devicePixelRatio || 1);
  const w = wrap.clientWidth, h = wrap.clientHeight;
  TAC.cv.width = w * dpr; TAC.cv.height = h * dpr; TAC.cv.style.width = w + 'px'; TAC.cv.style.height = h + 'px';
  TAC.dpr = dpr; TAC.w = w; TAC.h = h;
  if (TAC.auto) tacFit(true);
}
// 地圖自動對準有部隊的範圍（含目的地、隊列、地形），不必每次都看整張地圖
function tacBounds() {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  const add = (x, z, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); };
  for (const q of squadrons) if (!q.bg && q.alive > 0 && !fowHidden(q)) add(q.x, q.z, Math.max(q.W, q.D) / 2);
  for (const g of groups) { if (g.goal) add(g.goal.x, g.goal.z, 60); for (const it of g.queue || []) if (it.type === 'move') add(it.x, it.z, 60); }
  for (const tr of terrainList()) add(tr.x, tr.z, tr.r);
  if (x0 > x1) return MAP_BOUNDS;
  const pad = 110; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
  // 最小範圍，避免放太大
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = Math.max(350, (x1 - x0) / 2), hh = Math.max(240, (z1 - z0) / 2);
  return { x0: Math.max(MAP_BOUNDS.x0, cx - hw), x1: Math.min(MAP_BOUNDS.x1, cx + hw), z0: Math.max(MAP_BOUNDS.z0, cz - hh), z1: Math.min(MAP_BOUNDS.z1, cz + hh) };
}
function tacFit(snap) {
  const B = tacBounds(), w = TAC.w, h = TAC.h, px = 20, pz = 46, bw = B.x1 - B.x0, bh = B.z1 - B.z0;   // 上下多留空間給艦隊標籤
  const k = Math.min((w - px * 2) / bw, (h - pz * 2) / bh);
  const ox = (w - bw * k) / 2 - B.x0 * k, oy = (h - bh * k) / 2 - B.z0 * k;
  const a = snap ? 1 : 0.12;   // 慢慢移過去，不要跳
  TAC.k += (k - TAC.k) * a; TAC.ox += (ox - TAC.ox) * a; TAC.oy += (oy - TAC.oy) * a;
}
addEventListener('resize', () => { if (TAC.open) { tacResize(); drawTac(); } });
const tx = (x) => TAC.ox + x * TAC.k, tz = (z) => TAC.oy + z * TAC.k;
function tacWorld(e) { const r = TAC.cv.getBoundingClientRect(); return { x: (e.clientX - r.left - TAC.ox) / TAC.k, z: (e.clientY - r.top - TAC.oy) / TAC.k }; }

// 分艦隊狀態
function sqStatus(q) {
  const t = U.uTime.value, g = q.group, fl = flankState(q);
  if (q.alive <= 0) return ['已殲滅', 'dead'];
  if (fl) return [fl + '受擊', 'warn'];
  if (q.relayUntil > t) return ['傳令中', 'warn'];
  if (g && g.plan && (g.plan.kind === 'snake' || g.plan.kind === 'scatter')) return ['迴轉中', 'move'];
  if (q.disorderUntil > t) return ['陣形混亂', 'warn'];
  if (sqMorphing(q, t)) return ['變陣中', 'move'];
  if (g && g.plan) return ['移動中', 'move'];
  if (q.hitW && q.hitW[0] + q.hitW[1] + q.hitW[2] > 2) return ['交戰中', 'fight'];
  return ['待命', ''];
}
function fleetStatus(f) {
  const alive = fleetAlive(f); if (!alive.length) return ['已殲滅', 'dead'];
  const st = alive.map(sqStatus), pri = ['warn', 'move', 'fight', ''];
  for (const p of pri) { const s = st.find((x) => x[1] === p); if (s) return s; }
  return st[0];
}

// ── 繪圖 ──
// 戰爭迷霧：我方各分艦隊的偵測範圍（淡色圈）、我方掃描的波紋、被敵方掃描到的方向（只知道方向）
function drawFowTac(c, k, me) {
  const t = U.uTime.value;
  c.save();
  c.fillStyle = 'rgba(120,200,255,.035)'; c.strokeStyle = 'rgba(120,200,255,.14)'; c.lineWidth = 1;
  for (const q of squadrons) {
    if (q.side !== me || !fowLive(q)) continue;
    c.beginPath(); c.arc(tx(q.x), tz(q.z), fowSensor(q) * k, 0, TAU); c.fill(); c.stroke();
  }
  for (const s of FOW.scans) {
    if (s.side !== me) continue;
    const u = Math.min(1, (t - s.t) / 1.5);
    c.strokeStyle = s.jam ? `rgba(255,140,120,${(1 - u) * 0.8})` : `rgba(140,230,255,${(1 - u) * 0.9})`; c.lineWidth = 2;
    c.beginPath(); c.arc(tx(s.x), tz(s.z), FOW_RULE.scanR * u * k, 0, TAU); c.stroke();
  }
  // 我方偵察機：飛往的掃描區域（飛行中＝虛線，盤旋掃描中＝填色）
  c.font = `${uiPx(12)}px system-ui`; c.textAlign = 'center';
  for (const j of aliveF[me]) {
    if (FT.kind[j] !== 2 || FT.ret[j]) continue;
    const X = tx(FT.ax[j]), Z = tz(FT.az[j]), R = FT.heal[j] * k, on = FT.tk[j] === 1;
    c.strokeStyle = 'rgba(140,230,255,.8)'; c.setLineDash(on ? [] : [5, 4]); c.beginPath(); c.arc(X, Z, R, 0, TAU); c.stroke(); c.setLineDash([]);
    if (on) { c.fillStyle = 'rgba(140,230,255,.08)'; c.fill(); }
    c.strokeStyle = 'rgba(140,230,255,.35)'; c.beginPath(); c.moveTo(tx(fP[j * 3]), tz(fP[j * 3 + 2])); c.lineTo(X, Z); c.stroke();
    c.fillStyle = 'rgba(140,230,255,.95)'; c.fillText(on ? `區域掃描中 ${Math.ceil(FT.cd[j])} 秒` : '偵察機前往中', X, Z - R - 4);
  }
  // 被干擾時記在偵察機上、還沒回報的情報
  for (const j of aliveF[me]) {
    const L = FT.kind[j] === 2 && FOW.rlog.get(j); if (!L || !L.size) continue;
    c.fillStyle = 'rgba(255,210,122,.95)'; c.fillText(`📡 待回報 ${L.size}`, tx(fP[j * 3]), tz(fP[j * 3 + 2]) - 8);
  }
  c.textAlign = 'left';
  for (const p of FOW.pings[me]) {
    const f = fleets.find((o) => o.id === p.fleet), al = f ? fleetAlive(f) : []; if (!al.length) continue;
    const C = centerOf(al), a = 1 - (t - p.t) / FOW_RULE.ping, L = 700;
    c.strokeStyle = `rgba(255,210,122,${0.75 * a})`; c.lineWidth = 1.5; c.setLineDash([6, 5]);
    c.beginPath(); c.moveTo(tx(C.x), tz(C.z)); c.lineTo(tx(C.x + Math.sin(p.a) * L), tz(C.z + Math.cos(p.a) * L)); c.stroke(); c.setLineDash([]);
    c.fillStyle = `rgba(255,210,122,${a})`; c.fillText('⚠ 偵測到掃描訊號（方向）', tx(C.x + Math.sin(p.a) * L * 0.55) + 6, tz(C.z + Math.cos(p.a) * L * 0.55));
  }
  c.restore();
}
function drawTac() {
  const c = TAC.ctx, dpr = TAC.dpr, W = TAC.cv.width / dpr, H = TAC.cv.height / dpr, k = TAC.k;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#04070f'; c.fillRect(0, 0, W, H);
  // 格線
  c.strokeStyle = 'rgba(150,175,220,.07)'; c.lineWidth = 1;
  for (let x = Math.ceil(MAP_BOUNDS.x0 / 100) * 100; x <= MAP_BOUNDS.x1; x += 100) { c.beginPath(); c.moveTo(tx(x), tz(MAP_BOUNDS.z0)); c.lineTo(tx(x), tz(MAP_BOUNDS.z1)); c.stroke(); }
  for (let z = Math.ceil(MAP_BOUNDS.z0 / 100) * 100; z <= MAP_BOUNDS.z1; z += 100) { c.beginPath(); c.moveTo(tx(MAP_BOUNDS.x0), tz(z)); c.lineTo(tx(MAP_BOUNDS.x1), tz(z)); c.stroke(); }
  c.strokeStyle = 'rgba(150,175,220,.25)'; c.strokeRect(tx(MAP_BOUNDS.x0), tz(MAP_BOUNDS.z0), (MAP_BOUNDS.x1 - MAP_BOUNDS.x0) * k, (MAP_BOUNDS.z1 - MAP_BOUNDS.z0) * k);
  // 地形
  for (const t of terrainList()) {
    const col = '#' + TERRAIN_TYPES[t.type].color.toString(16).padStart(6, '0');
    const solid = TERRAIN_TYPES[t.type].solid;
    c.beginPath(); c.arc(tx(t.x), tz(t.z), t.r * k, 0, TAU); c.fillStyle = col + (solid ? 'aa' : '22'); c.fill(); c.strokeStyle = col + (solid ? 'ff' : '88'); c.setLineDash(solid ? [] : [4, 4]); c.stroke(); c.setLineDash([]);
    const ty = t.y != null && Math.abs(t.y) >= 5 ? `　${t.y > 0 ? '▲' : '▼'}${Math.round(Math.abs(t.y))}` : '';
    c.fillStyle = col; c.font = `${uiPx(12.5)}px system-ui`; c.textAlign = 'center'; c.fillText(TERRAIN_TYPES[t.type].name + ty, tx(t.x), tz(t.z - t.r) - 4);
  }
  // 艦艇：每 3 艘畫一點（看得出陣型）
  const col = ['#f2b35a', '#7cc4ff'];
  const fog = pFiltered(), me = GAME.playerSide, hid = (side) => fog && side !== me;   // 被干擾／戰爭迷霧：敵軍只畫看得到的，其他畫最後已知位置
  // 戰爭迷霧：我方的偵測範圍（淡色圈）、掃描波紋、被掃描的方向
  if (fowView()) drawFowTac(c, k, me);
  for (let sd = 0; sd < 2; sd++) {
    if (hid(sd) && !fowView()) continue;
    c.fillStyle = col[SIDE_FAC[sd]];
    for (let i = 0; i < shipCount; i += 3) {
      if (!ships.alive[i] || ships.side[i] !== sd) continue;
      const q = squadrons[ships.sq[i]]; if (q.bg || fowHidden(q)) continue;
      shipWorldCPU(i, _a); c.fillRect(tx(_a.x) - 0.8, tz(_a.z) - 0.8, 1.6, 1.6);
    }
  }
  // 分艦隊外框（選取的加粗）與朝向
  for (const q0 of squadrons) {
    const q = hid(q0.side) ? pSeen(q0) : q0;
    if (!q || q.bg || q.alive <= 0) continue;
    const sel = selected.has(q0);
    c.save(); c.translate(tx(q.x), tz(q.z)); c.rotate(-q.h + Math.PI);   // 世界的 h：前方＝(sin h, cos h)；畫布 y 向下
    if (q !== q0) { c.globalAlpha = 0.45; c.setLineDash([4, 3]); }
    c.strokeStyle = sel ? '#ffffff' : (SIDE_FAC[q.side] ? 'rgba(124,196,255,.55)' : 'rgba(242,179,90,.55)'); c.lineWidth = sel ? 1.6 : 1;
    c.strokeRect(-q0.W * k / 2, -q0.D * k / 2, q0.W * k, q0.D * k);
    c.beginPath(); c.moveTo(-5, -q0.D * k / 2 - 2); c.lineTo(0, -q0.D * k / 2 - 8); c.lineTo(5, -q0.D * k / 2 - 2); c.stroke();
    c.restore(); c.globalAlpha = 1; c.setLineDash([]);
  }
  // 路線與攻擊目標
  drawOverlay2D(c);
  // 節點：可拖曳、可點選（開著小視窗的那個加白圈；拖曳中畫出新位置）
  const dn = TAC.drag && TAC.drag.kind === 'node' ? TAC.drag : null;
  for (const n of tacNodes()) {
    const moving = dn && dn.moved && sameNode(dn.nd, n), x = tx(moving ? dn.w.x : n.x), y = tz(moving ? dn.w.z : n.z);
    if (moving) { c.strokeStyle = 'rgba(255,255,255,.6)'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(tx(n.x), tz(n.z)); c.lineTo(x, y); c.stroke(); c.setLineDash([]); }
    c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fillStyle = n.form ? hex(CMD_COL.form) : hex(CMD_COL.move); c.fill();
    c.lineWidth = 1.5; c.strokeStyle = '#04070f'; c.stroke(); c.lineWidth = 1;
    if (sameNode(TAC.node, n) || moving) { c.beginPath(); c.arc(x, y, 8.5, 0, TAU); c.strokeStyle = '#ffffff'; c.lineWidth = 1.6; c.stroke(); c.lineWidth = 1; }
  }
  gEl('tac-fit').classList.toggle('on', TAC.auto);
  for (const g of groups) {
    if (!g.sqs.length || g.inactive || g.side === cmdSide || hid(g.side)) continue;   // 我方的路線、預覽、隊列由 drawOverlay2D 畫；被干擾、戰爭迷霧時看不到敵方路線
    const c0 = col[g.side];
    if (g.plan && g.plan.segs) {
      const pts = planPoints(g.plan.segs, g.plan.i || 0, g.plan.s || 0, g.plan.kind === 'snake' ? null : [g.ax, g.az]);
      c.strokeStyle = c0; c.globalAlpha = 0.6; c.setLineDash([5, 4]); c.beginPath();
      pts.forEach(([x, z], j) => (j ? c.lineTo(tx(x), tz(z)) : c.moveTo(tx(x), tz(z)))); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      if (g.goal) { const H = g.goal.H, gx = tx(g.goal.x), gz = tz(g.goal.z); c.beginPath(); c.arc(gx, gz, 4, 0, TAU); c.fillStyle = c0; c.fill(); c.beginPath(); c.moveTo(gx, gz); c.lineTo(gx + Math.sin(H) * 16, gz + Math.cos(H) * 16); c.strokeStyle = c0; c.stroke(); }
    }
    if (g.target && g.target.alive > 0) { c.strokeStyle = g.side ? 'rgba(124,196,255,.7)' : 'rgba(255,140,90,.8)'; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(tx(g.ax), tz(g.az)); c.lineTo(tx(g.target.x), tz(g.target.z)); c.stroke(); c.setLineDash([]); }
  }
  // 艦隊標籤：名稱、兵力、陣型、狀態
  c.font = `${uiPx(14)}px system-ui`; c.textAlign = 'left';
  for (const f of fleets) {
    if (f.reserve) continue;
    let fogged = hid(f.side);
    let al = fogged ? f.sqs.map((q) => pSeen(q)).filter((q) => q && !q.bg && q.alive > 0) : fleetAlive(f); if (!al.length) continue;
    // 戰爭迷霧：有看得到的分艦隊＝照實顯示看得到的那幾支；全部都是最後已知＝標出幾秒前
    const live = fowView() && fogged ? al.filter((q) => !q.stale) : [];
    if (live.length) { al = live; fogged = false; }
    const age = fogged && fowView() ? Math.round(U.uTime.value - Math.max(...al.map((q) => q.t || 0))) : 0;
    const C = centerOf(al), n = sumA(al.map((q) => q.alive)), g = al[0].group, st = fogged ? [fowView() ? `最後已知位置・${age} 秒前` : '雷達受干擾・最後已知位置', ''] : live.length ? ['偵測中', 'fight'] : fleetStatus(f);
    let maxD = 0; for (const q of al) maxD = Math.max(maxD, Math.hypot(q.x - C.x, q.z - C.z) + Math.max(q.W, q.D) / 2);
    const lh = uiPx(18), bh = lh * 2 + 4;   // 行高跟著介面大小
    const lx = tx(C.x) + 8, lz = tz(C.z) + (f.side ? -maxD * k - bh - 2 : maxD * k + 14);
    const fy = g && !fogged ? (g.ay || 0) : 0, txt1 = fogged ? `${f.name}　？？？` : `${f.name}　${Math.round(n / f.initial * 100)}%${Math.abs(fy) >= 8 ? `　${fy > 0 ? '▲' : '▼'}${Math.round(Math.abs(fy))}` : ''}`, txt2 = fogged ? st[0] : `${g ? FORMATIONS[g.formation].name : ''}・${st[0]}`;
    const w = Math.max(c.measureText(txt1).width, c.measureText(txt2).width) + 12;
    c.fillStyle = 'rgba(5,8,16,.82)'; c.fillRect(lx - 6, lz - 2, w, bh);
    c.fillStyle = col[SIDE_FAC[f.side]]; c.fillRect(lx - 6, lz - 2, 2, bh);
    c.fillText(txt1, lx, lz + lh - 4);
    c.fillStyle = st[1] === 'warn' ? '#ff8a7a' : st[1] === 'move' ? '#ffd27a' : st[1] === 'fight' ? '#d8e0ee' : '#8592a8'; c.fillText(txt2, lx, lz + lh * 2 - 4);
  }
  // 獨立行動的分艦隊（不在旗艦那一隊）：小標籤
  c.font = `${uiPx(13)}px system-ui`; c.textAlign = 'left';
  for (const g of groups) {
    if (g.side !== GAME.playerSide || g.inactive || !g.sqs.length) continue;
    const al = g.sqs.filter((q) => q.alive > 0 && !q.bg); if (!al.length || al.some((q) => q.flagship >= 0)) continue;
    const f = al[0].fleet; if (!f || f.sqs.filter((q) => q.alive > 0).length === al.length) continue;
    let maxD = 0; for (const q of al) maxD = Math.max(maxD, Math.hypot(q.x - g.ax, q.z - g.az) + Math.max(q.W, q.D) / 2);
    const txt = `${al.map((q) => q.name).join('、')}　${FORMATIONS[g.formation].name}`, lx = tx(g.ax) + 6, lz = tz(g.az) + maxD * k + 12, w = c.measureText(txt).width + 10;
    const bh = uiPx(19);
    c.fillStyle = 'rgba(5,8,16,.8)'; c.fillRect(lx - 5, lz - 1, w, bh); c.fillStyle = col[g.side]; c.fillRect(lx - 5, lz - 1, 2, bh); c.fillText(txt, lx, lz + bh - 6);
  }
  // 艦橋：目前看的方向
  if (BR.on && BR.pose.L != null) {
    const P = BR.pose, a = BR.shipH - BR.yaw, hf = Math.atan(Math.tan(BR_FOV * Math.PI / 360) * VW / VH), R = 320;
    c.beginPath(); c.moveTo(tx(P.x), tz(P.z));
    for (let j = 0; j <= 12; j++) { const b = a - hf + (2 * hf * j) / 12; c.lineTo(tx(P.x + Math.sin(b) * R), tz(P.z + Math.cos(b) * R)); }
    c.closePath(); c.fillStyle = 'rgba(255,255,255,.06)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.28)'; c.stroke();
    c.beginPath(); c.arc(tx(P.x), tz(P.z), 4.5, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `${uiPx(11)}px system-ui`; c.textAlign = 'center'; c.fillText('艦橋', tx(P.x), tz(P.z) + 16);
  }
  // 拖曳預覽
  const d = TAC.drag;
  if (d && d.kind === 'right' && d.B && d.moved) { c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(tx(d.A.x), tz(d.A.z)); c.lineTo(tx(d.B.x), tz(d.B.z)); c.stroke(); c.beginPath(); c.arc(tx(d.A.x), tz(d.A.z), 4, 0, TAU); c.fillStyle = '#fff'; c.fill(); }
  if (d && d.kind === 'box') { c.strokeStyle = 'rgba(255,255,255,.7)'; c.strokeRect(d.sx, d.sy, d.cx - d.sx, d.cy - d.sy); }
  if (GAME.skillArm) { const A = GAME.skillArm; c.fillStyle = '#ffd27a'; c.font = `${uiPx(13)}px system-ui`; c.textAlign = 'center'; c.fillText(A.attack ? '指定攻擊：左鍵點敵方分艦隊（右鍵／Esc 取消）' : A.area ? '區域攻擊：左鍵點地圖上的位置（右鍵／Esc 取消）' : A.recon ? `區域掃描（${A.f.name}的偵察機）：左鍵點地圖上要掃描的位置（右鍵／Esc 取消）` : `${SKILLS[A.id].name}：${A.point ? '左鍵點地圖上的位置' : '左鍵點敵方分艦隊'}（右鍵／Esc 取消）`, W / 2, 22); }
}

// ── 側欄：我方艦隊卡片（下令）＋敵方概況 ──
function buildTacSide() {
  const mine = fleets.filter((f) => f.side === GAME.playerSide && !f.reserve);
  TAC.side.innerHTML = `<div class="tac-h">我方艦隊</div>${mine.map((f) => `<div class="tac-card" data-f="${f.id}">
      <div class="g-row"><b class="g-pc">${f.name}</b><span class="g-dim">${f.commander ? f.commander.name + ' Lv ' + f.commander.level : ''}</span><span class="g-sp"></span><span class="tac-st"></span></div>
      <div class="tac-bar"><i></i></div><div class="tac-info g-dim"></div>
      <div class="tac-sec"><span class="tac-lb">分艦隊</span><div class="tac-sqs"></div></div>
      <div class="tac-sec"><span class="tac-lb" style="color:#8fe3a5">陣型</span><div class="tac-forms">${RADIAL_ORDER.map((k, i) => `<button class="g-btn sm" data-form="${k}" title="${FORMATIONS[k].note}（鍵 ${keyLabel(keyOf('form_' + k))}）">${FORMATIONS[k].name}</button>`).join('')}
        <button class="g-btn sm" data-ord title="鍵 ${keyLabel(keyOf('orderly'))}">整齊</button><button class="g-btn sm" data-ly="1">1 層</button><button class="g-btn sm" data-ly="3">3 層</button></div></div>
      <div class="tac-sec"><span class="tac-lb" style="color:#ff6a4a">攻擊・技能</span><div class="tac-acts"><button class="g-btn sm" data-atk title="${keyLabel(keyOf('attack'))}＋左鍵">指定攻擊</button><button class="g-btn sm" data-area title="${keyLabel(keyOf('area'))}＋左鍵點地圖：對那裡開火 ${FOW_RULE.area.dur} 秒（射程內的光束、飛彈、艦載機）">區域攻擊</button>${fowOn() && fowHasCarrier(f) ? `<button class="g-btn sm" data-scan title="${keyLabel(keyOf('scan'))}＋左鍵點地圖：航母派出偵察機（不佔機庫、沒有武裝、速度快、難以擊中、裝甲薄）飛到那裡盤旋 ${FOW_RULE.recon.loiter} 秒，半徑 ${Math.round(fowReconR(f))} 的球體內的敵軍都看得到，飛行路徑上看到的也一起回報；被干擾時情報記在機上，飛回母艦（或干擾結束）才回報；每支艦隊冷卻 ${FOW_RULE.recon.cd} 秒">區域掃描<small></small></button>` : ''}${f.supply ? '<button class="g-btn sm" data-fol title="自動跟在指定艦隊的後方；直接下移動命令會取消跟隨"></button>' : ''}${Object.keys(f.skills).map((id) => `<button class="g-btn sm tac-sk" data-sk="${id}" title="${SKILLS[id].desc}">${SKILLS[id].name}<small></small></button>`).join('')}<span class="g-sp"></span><button class="g-btn sm" data-sel>選取</button></div></div>
      <div class="tac-q"></div>
    </div>`).join('')}
    <div class="tac-h" style="margin-top:12px">敵方艦隊</div><div id="tac-enemy"></div>`;
  gEl('tac-enemy').onclick = (e) => { if (e.target.closest('[data-autoscan]')) cmdAutoScan(!FOW.auto[GAME.playerSide]); };   // 敵方概況每 0.2 秒重畫：用委派
  const pick = (f) => setSelection(fleetAlive(f));
  // 卡片上的命令：已選了這支艦隊裡的幾支分艦隊＝只對它們下令；否則對整支艦隊
  const use = (f) => { const al = fleetAlive(f); if (!selected.size || ![...selected].every((q) => al.includes(q))) pick(f); };
  const grpOf = () => { const l = [...selected]; return l.length && l.every((q) => q.group === l[0].group) ? l[0].group : null; };
  TAC.side.querySelectorAll('.tac-card').forEach((card) => {
    const f = fleets[+card.dataset.f];
    card.querySelector('[data-sel]').onclick = () => pick(f);
    card.querySelector('[data-atk]').onclick = () => { use(f); armAttack(); };
    card.querySelector('[data-area]').onclick = () => { use(f); armArea(); };
    const sc = card.querySelector('[data-scan]'); if (sc) sc.onclick = () => armRecon(f);
    card.querySelectorAll('[data-form]').forEach((b) => (b.onclick = () => { use(f); cmdFormation(b.dataset.form); }));
    card.querySelector('[data-ord]').onclick = () => { use(f); const g = grpOf(); cmdOrderly(!(g && g.orderly)); };
    card.querySelectorAll('[data-ly]').forEach((b) => (b.onclick = () => { use(f); const g = grpOf(); if (g && !g.orderly) cmdOrderly(true); cmdLayers(+b.dataset.ly); }));
    card.querySelector('.tac-sqs').onclick = (e) => { const b = e.target.closest('[data-sq]'); if (!b) return; const q = squadrons[+b.dataset.sq]; if (!q || q.alive <= 0) return;
      if (e.shiftKey || e.ctrlKey) { selected.has(q) ? selected.delete(q) : selected.add(q); selectionChanged(); } else setSelection([q]); };
    card.querySelectorAll('[data-sk]').forEach((b) => (b.onclick = () => armSkill(f, b.dataset.sk)));
    const fol = card.querySelector('[data-fol]');
    if (fol) fol.onclick = () => {   // 補給艦隊：輪流切換跟隨的艦隊（不跟隨 → 第一艦隊 → …）
      const ids = [-1, ...fleets.filter((o) => o.side === f.side && !o.supply && !o.reserve && fleetAlive(o).length).map((o) => o.id)];
      issue('follow', { fleet: f.id, target: ids[(ids.indexOf(f.follow) + 1) % ids.length] });
    };
    card.querySelector('.tac-q').onclick = (e) => { if (e.target.dataset.qc != null) { const al = fleetAlive(f); issue('qclear', { sqs: al.map((q) => squadrons.indexOf(q)) }); } };
  });
  updateTacSide();
}
function updateTacSide() {
  const t = U.uTime.value;
  TAC.side.querySelectorAll('.tac-card').forEach((card) => {
    const f = fleets[+card.dataset.f], al = fleetAlive(f), n = sumA(al.map((q) => q.alive)), st = fleetStatus(f);
    const sub = al.filter((q) => selected.has(q)), g = (sub.length && sub.every((q) => q.group === sub[0].group) ? sub[0] : al[0] || {}).group;   // 按鈕狀態顯示選取中那一隊
    const comp = new Array(NT).fill(0); for (const q of al) for (let k = 0; k < NT; k++) comp[k] += q.typeAlive[k];
    card.classList.toggle('sel', al.length > 0 && al.every((q) => selected.has(q)));
    const part = al.some((q) => selected.has(q)) && !al.every((q) => selected.has(q));
    card.classList.toggle('part', part);
    // 分艦隊按鈕：名稱、艦數；獨立行動（不在旗艦那一隊）的標出它自己的陣型
    const flagG = (f.sqs.find((q) => q.flagship >= 0) || {}).group;
    const sh = al.map((q) => `<button class="g-btn sm tac-sq ${selected.has(q) ? 'on' : ''} ${q.group !== flagG ? 'solo' : ''}" data-sq="${squadrons.indexOf(q)}" title="點＝只選這支（Shift＝加選）">${q.name.replace('（旗艦）', '')} <small>${ships5(q.alive)}${q.group !== flagG ? '・' + FORMATIONS[q.group.formation].name : ''}${q.atk && q.atk.alive > 0 ? '・⚔' : ''}</small></button>`).join('');
    const se = card.querySelector('.tac-sqs'); if (se.dataset.h !== sh) { se.dataset.h = sh; se.innerHTML = sh; }
    card.querySelector('.tac-st').textContent = st[0]; card.querySelector('.tac-st').className = 'tac-st ' + st[1];
    card.querySelector('.tac-bar i').style.width = (n / f.initial * 100) + '%';
    const ammo = f.supply ? `・補給存量 ${supplyStock(f.side, f)}` : comp[2] + comp[3] ? `・飛彈 ${Math.round(ammoRatio(f) * 100)}%` : '';
    card.querySelector('.tac-info').textContent = `${ships5(n)} 艘（${Math.round(n / f.initial * 100)}%）・${g ? FORMATIONS[g.formation].name : '-'}・${comp.map((v, k) => (v ? SHIP_TYPES[k].name + ships5(v) : '')).filter(Boolean).join(' ')}${ammo}`;
    const fol = card.querySelector('[data-fol]');
    if (fol) { const T = fleets.find((o) => o.id === f.follow); fol.textContent = `跟隨：${T ? T.name : '不跟隨'}`; fol.classList.toggle('on', !!T); }
    card.querySelectorAll('[data-form]').forEach((b) => b.classList.toggle('on', !!g && g.formation === b.dataset.form));
    card.querySelector('[data-ord]').classList.toggle('on', !!g && g.orderly);
    card.querySelectorAll('[data-ly]').forEach((b) => b.classList.toggle('on', !!g && g.orderly && (g.layers || 1) === +b.dataset.ly));
    // 隊列：正在執行的（閃爍）→ 之後的命令，依種類上色
    const chip = (k, txt, cur) => `<span class="qchip ${cur ? 'cur' : ''}" style="--c:${hex(CMD_COL[k])}">${txt}</span>`;
    const itxt = (it) => it.type === 'alt' ? '高度 ' + (it.y > 0 ? '▲' : '▼') + Math.abs(Math.round(it.y)) : it.type === 'move' ? '移動' + (it.y != null ? ' ' + yTxt(it.y) : '') + pitchTxt(it.P) : it.type === 'form' ? '陣型 ' + FORMATIONS[it.kind].name : it.type === 'orderly' ? (it.on ? '整齊' : '自然') : it.type === 'layers' ? it.n + ' 層' : it.type === 'turn' ? turnTxt(it.d) : SALVO_NAME[it.type] ? SALVO_NAME[it.type] : it.type === 'area' ? '區域攻擊' : it.type === 'skill' ? '⚡' + SKILLS[it.skill].name : '攻擊 ' + (squadrons[it.target] ? squadrons[it.target].name : '');
    const parts = [];
    if (g && g.cur) parts.push(chip(g.cur.type === 'form' ? 'form' : 'move', '▶ ' + (g.cur.type === 'form' ? '變陣 ' + FORMATIONS[g.formation].name : '移動中' + (g.ayT != null && Math.abs(g.ayT) >= 1 ? ' ' + yTxt(g.ayT) : '') + pitchTxt(g.pCmd)), true));
    if (g && g.queue) g.queue.forEach((it, i) => parts.push(chip(itemKind(it), `${i + 1}. ${itxt(it)}`, false)));
    const qh = parts.length ? `<span class="tac-lb">隊列</span>${parts.join('<i class="qarr">➜</i>')}${g && g.queue && g.queue.length ? ' <button class="g-btn sm" data-qc>清除</button>' : ''}` : '';
    const qe = card.querySelector('.tac-q'); if (qe.dataset.h !== qh) { qe.dataset.h = qh; qe.innerHTML = qh; }
    card.querySelectorAll('[data-sk]').forEach((b) => {
      const s = f.skills[b.dataset.sk], cd = Math.max(0, s.ready - t);
      b.querySelector('small').textContent = t < s.until ? ` 生效 ${Math.ceil(s.until - t)}s` : s.left <= 0 ? ' 用完' : cd > 0 ? ` ${Math.ceil(cd)}s` : ` ×${s.left}`;
      b.disabled = s.left <= 0 || cd > 0 || !al.length;
    });
    const sc = card.querySelector('[data-scan]');
    if (sc) { const cd = fowReconLeft(f), ok = fowHasCarrier(f); sc.querySelector('small').textContent = !ok ? ' 沒有航母' : cd > 0 ? ` ${Math.ceil(cd)}s` : jammed(f.side) ? ' 受干擾' : ''; sc.disabled = cd > 0 || !ok; }
  });
  const en = fleets.filter((f) => f.side !== GAME.playerSide && !f.reserve);
  const enEl = gEl('tac-enemy'), enH = playerFogged() ? `<div class="tac-ecard"><div class="g-warn">通訊受干擾：敵方資料不明（剩 ${Math.ceil(jam[GAME.playerSide].until - t)} 秒）</div><div class="g-dim">地圖上只顯示干擾開始時的最後已知位置</div></div>` : fowView() ? fowEnemyCards(en, t) : en.map((f) => { const al = fleetAlive(f), n = sumA(al.map((q) => q.alive)), g = al[0] && al[0].group, st = fleetStatus(f);
    return `<div class="tac-ecard"><div class="g-row"><b class="g-ec">${f.name}</b><span class="g-sp"></span><span class="tac-st ${st[1]}">${st[0]}</span></div>
      <div class="tac-bar e"><i style="width:${n / f.initial * 100}%"></i></div><div class="g-dim">${ships5(n)} 艘・${g ? FORMATIONS[g.formation].name : '-'}</div></div>`; }).join('');
  if (enEl.dataset.h !== enH) { enEl.dataset.h = enH; enEl.innerHTML = enH; }   // 沒變就不重畫（按鈕才點得到）
  const tt = timeLeftText(t); gEl('tac-time').textContent = tt.startsWith('經過') ? tt : `剩餘 ${tt}`;
  gEl('tac-pause').textContent = paused ? '▶ 繼續' : '❚❚ 暫停';
  gEl('tac-speed').textContent = cmdSlowOn ? `×${effSpeed()} 下令中` : '×' + SPEEDS[speedIdx];
}
// 戰爭迷霧的敵方概況：看得到的照實（只算看得到的分艦隊）、最後已知標出幾秒前、其他＝位置不明
function fowEnemyCards(en, t) {
  const me = GAME.playerSide, jm = jammed(me);
  const on = FOW.auto[me], cd = fowScanLeft(me);
  const head = `<div class="tac-ecard"><div class="${jm ? 'g-warn' : 'g-dim'}">${jm ? `通訊受干擾（剩 ${Math.ceil(jam[me].until - t)} 秒）：各艦隊不能共享情報，掃描沒有結果` : '戰爭迷霧：只看得到偵測範圍內、掃描到的敵軍'}</div>
    <div class="g-row"><button class="g-btn sm ${on ? 'on' : ''}" data-autoscan title="還有敵方艦隊看不到時，冷卻好了就自動從艦隊發出脈衝掃描（半徑 ${FOW_RULE.scanR}；被掃到的一方會知道掃描來的方向）">自動掃描：${on ? '開' : '關'}</button><span class="g-dim">${cd > 0 ? `冷卻 ${Math.ceil(cd)} 秒` : on ? '待命' : ''}</span><span class="g-sp"></span><span class="g-dim">區域掃描 ${keyLabel(keyOf('scan'))}＋點地圖</span></div></div>`;
  return head + en.map((f) => {
    const vs = f.sqs.map((q) => pSeen(q, Infinity)).filter((q) => q && !q.bg && q.alive > 0), live = vs.filter((q) => !q.stale);
    if (!vs.length) return `<div class="tac-ecard"><div class="g-row"><b class="g-ec">${f.name}</b><span class="g-sp"></span><span class="tac-st">位置不明</span></div></div>`;
    const n = sumA((live.length ? live : vs).map((q) => q.alive)), g = live[0] && live[0].group;
    const st = live.length ? `偵測中・${live.length}／${f.sqs.filter((q) => !q.bg).length} 支` : `最後已知・${Math.round(t - Math.max(...vs.map((q) => q.t || 0)))} 秒前`;
    return `<div class="tac-ecard"><div class="g-row"><b class="g-ec">${f.name}</b><span class="g-sp"></span><span class="tac-st ${live.length ? 'fight' : ''}">${st}</span></div>
      <div class="g-dim">${live.length ? '看得到' : '當時'} ${ships5(n)} 艘${g ? '・' + FORMATIONS[g.formation].name : ''}</div></div>`;
  }).join('');
}
function tacFrame(dt) {
  if (!TAC.open) return;
  if (GAME.result || !(GAME.phase === 'battle' || GAME.phase === 'replay')) { closeTac(); return; }
  if (!TAC.drag && TAC.auto) tacFit(false);   // 操作中不改變縮放，免得點錯位置
  drawTac(); drawSideView();
  if (TAC.node) renderNodePop();   // 跟著節點移動；節點消失（抵達、刪除）就關掉
  TAC.acc += dt; if (TAC.acc > 0.2) { TAC.acc = 0; updateTacSide(); }
}

// ── 面板上的滑鼠／觸控 ──
function tacHit(w, side) {
  let best = null, bd = 1e9;
  const pad = 10 / TAC.k;
  for (const q of squadrons) {
    if (q.bg || q.alive <= 0 || (side != null && q.side !== side) || fowHidden(q)) continue;   // 戰爭迷霧：看不到的點不到
    const dx = w.x - q.x, dz = w.z - q.z;
    const u = dx * Math.cos(q.h) - dz * Math.sin(q.h), v = dx * Math.sin(q.h) + dz * Math.cos(q.h);
    if (Math.abs(u) <= q.W / 2 + pad && Math.abs(v) <= q.D / 2 + pad) { const d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = q; } }
  }
  return best;
}
const tacUnit = (q) => (q.fleet ? q.fleet.sqs.filter((x) => x.alive > 0 && !x.bg) : [q]);
function tacDown(e) {
  TAC.cv.setPointerCapture(e.pointerId);
  const w = tacWorld(e), r = TAC.cv.getBoundingClientRect();
  if (GAME.skillArm && e.pointerType !== 'touch' && e.button === 2) { skillEsc(); return; }
  if (GAME.skillArm && GAME.skillArm.point) {   // 點地圖上的位置：區域攻擊、呼叫增援
    if (GAME.skillArm.area) cmdArea({ x: w.x, y: selAlt(), z: w.z }); else if (GAME.skillArm.recon) cmdRecon(GAME.skillArm.f, { x: w.x, y: selAlt(), z: w.z }); else skillCmd(GAME.skillArm.f, GAME.skillArm.id, null, w);
    GAME.skillArm = null; hideHint(); drawTac(); return;
  }
  if (GAME.skillArm) {
    const q = tacHit(w, 1 - cmdSide);
    if (q) { if (GAME.skillArm.attack) cmdAttack(q); else skillCmd(GAME.skillArm.f, GAME.skillArm.id, q); GAME.skillArm = null; hideHint(); }
    return;
  }
  const touch = e.pointerType === 'touch';
  if (!touch && e.button === 2) { TAC.drag = { kind: 'right', A: w, x0: e.clientX, y0: e.clientY, alt0: selAlt(), dy: 0, dp: 0 }; return; }
  if (!touch && e.button !== 0) return;
  // 點到節點：拖曳＝改位置，放開沒移動＝打開節點視窗
  const add = e.shiftKey || e.ctrlKey;
  const nd = !touch && !add ? tacNodeHit(e.clientX - r.left, e.clientY - r.top) : null;
  if (nd) { TAC.drag = { kind: 'node', nd, w: { x: nd.x, z: nd.z }, x0: e.clientX, y0: e.clientY }; return; }
  if (TAC.node) closeNodePop();
  const q = tacHit(w, cmdSide);
  if (touch) {
    if (q) { setSelection(pickUnit(q, false)); TAC.drag = null; return; }
    TAC.drag = selected.size ? { kind: 'right', A: w, x0: e.clientX, y0: e.clientY } : null;   // 觸控：有選取時點空地＝移動，拖曳＝朝向
    return;
  }
  // 滑鼠左鍵：短按＝選取；按住不動＝陣型輪盤；拖曳＝平移畫面（Shift／Ctrl＋拖曳＝框選）
  const d = TAC.drag = { kind: 'lpress', q, w, alt: e.altKey, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, sx: e.clientX - r.left, sy: e.clientY - r.top, cx: e.clientX - r.left, cy: e.clientY - r.top, add };
  d.timer = setTimeout(() => { if (TAC.drag === d && d.kind === 'lpress') tacRadial(d); }, RADIAL_HOLD);
}
function tacRadial(d) {
  if (d.q && !selected.has(d.q)) setSelection(tacUnit(d.q));
  if (!selected.size) return false;
  showRadial(d); d.kind = 'radial';   // showRadial 會設 mode；這裡用 kind 區分
  return true;
}
function tacMove(e) {
  const d = TAC.drag;
  const r = TAC.cv.getBoundingClientRect();
  if (!d) { if (e.pointerType === 'mouse') TAC.cv.style.cursor = tacNodeHit(e.clientX - r.left, e.clientY - r.top) ? 'pointer' : ''; return; }
  const far = Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6;
  if (d.kind === 'radial') { radialPick(d, e.clientX, e.clientY); return; }
  if (d.kind === 'node') { if (far) d.moved = true; if (d.moved) { d.w = tacWorld(e); TAC.cv.style.cursor = 'grabbing'; } if (paused) drawTac(); return; }
  if (d.kind === 'pan') { TAC.ox = d.ox0 + e.clientX - d.x0; TAC.oy = d.oy0 + e.clientY - d.y0; TAC.auto = false; if (paused) drawTac(); return; }
  if (d.kind === 'lpress' && far) {
    if (e.timeStamp - d.t0 >= RADIAL_HOLD && tacRadial(d)) { radialPick(d, e.clientX, e.clientY); return; }
    clearTimeout(d.timer);
    if (!d.add) { d.kind = 'pan'; d.ox0 = TAC.ox; d.oy0 = TAC.oy; TAC.cv.style.cursor = 'grabbing'; tacMove(e); return; }
    d.kind = 'box';
  }
  if (far) d.moved = true;
  if (d.kind === 'right') d.B = tacWorld(e); else { d.cx = e.clientX - r.left; d.cy = e.clientY - r.top; }
  if (paused) drawTac();
}
function tacUp(e) {
  const d = TAC.drag; TAC.drag = null; if (!d) return;
  if (d.timer) clearTimeout(d.timer);
  TAC.cv.style.cursor = '';
  if (d.kind === 'radial') { const pk = d.pick; if (pk >= 0) radialActivate(pk); closeRadial(); drawTac(); return; }
  if (d.kind === 'pan') { drawTac(); return; }
  if (d.kind === 'node') {
    if (!d.moved) openNodePop(d.nd);
    else if (tacEditable()) { nodeEdit(d.nd, 'pos', { x: d.w.x, z: d.w.z }); updateTacSide(); }
    else toast('回放中不能修改');
    drawTac(); drawSideView(); return;
  }
  if (d.kind === 'lpress') {
    if (d.q) {
      if (d.add) { const u = d.alt ? [d.q] : tacUnit(d.q), on = u.every((x) => selected.has(x)); for (const x of u) on ? selected.delete(x) : selected.add(x); selectionChanged(); }
      else setSelection(pickUnit(d.q, d.alt));
    } else if (!d.add) clearSelection();
  } else if (d.kind === 'right') {
    if (!selected.size) return;
    const B = tacWorld(e);
    cmdMoveTo(d.A, d.moved && Math.hypot(B.x - d.A.x, B.z - d.A.z) > 4 ? Math.atan2(B.x - d.A.x, B.z - d.A.z) : null, false, null, alt3(d)); hideHint();
  } else if (d.kind === 'box') {
    const a = { x: (Math.min(d.sx, d.cx) - TAC.ox) / TAC.k, z: (Math.min(d.sy, d.cy) - TAC.oy) / TAC.k }, b = { x: (Math.max(d.sx, d.cx) - TAC.ox) / TAC.k, z: (Math.max(d.sy, d.cy) - TAC.oy) / TAC.k };
    const l = sideSquadrons(cmdSide).filter((q) => q.x >= a.x && q.x <= b.x && q.z >= a.z && q.z <= b.z);
    if (l.length) setSelection(l, d.add); else if (!d.add) clearSelection();
  }
  drawTac();
}

// ═════ 側視圖：高度 ═════
// 預設「左右」：橫軸＝地圖的 x，從我方這一側看過去；「前後」：橫軸＝前後（z），從右側看，我方在左、敵方在右。
// 縱軸＝高度（±400，依目前的範圍自動縮放）。滾輪縮放、左鍵拖曳空白處平移後改為手動，按「重設」恢復。
// 操作：左鍵點＝選取；拖曳節點（圓點）上下＝該節點的高度；拖曳把手（節點伸出的短線）＝到達後的仰角；
//       右鍵按住上下拖＝把選取的部隊升降到那個高度
const SV = { cv: null, ctx: null, w: 0, h: 0, dpr: 1, axis: 'x', range: 200, k: 1, o: 0, ext: [], zk: 1, ph: 0, pv: 0, user: false };
const SV_HANDLE = 24;   // 仰角把手的長度（px）
function buildSideView(el) {
  SV.cv = el.querySelector('#tac-sv'); SV.ctx = SV.cv.getContext('2d');
  try { SV.axis = STORE.getItem('fleet.svaxis') || 'x'; } catch (e) { /* 預設 */ }
  el.querySelector('#tac-svaxis').onclick = () => { SV.axis = SV.axis === 'x' ? 'z' : 'x'; svReset(); try { STORE.setItem('fleet.svaxis', SV.axis); } catch (e) { /* 只在本次 */ } drawSideView(); };
  el.querySelector('#tac-svfit').onclick = () => { svReset(); drawSideView(); };
  SV.cv.addEventListener('pointerdown', svDown); SV.cv.addEventListener('pointermove', svMove); SV.cv.addEventListener('pointerup', svUp);
  SV.cv.addEventListener('pointercancel', () => { TAC.drag = null; });
  SV.cv.addEventListener('pointerleave', () => { if (!TAC.drag) SV.cv.style.cursor = ''; });
  SV.cv.addEventListener('contextmenu', (e) => e.preventDefault());
  SV.cv.addEventListener('wheel', (e) => {   // 以游標為中心縮放（兩個方向一起）
    e.preventDefault(); e.stopPropagation();
    const r = SV.cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const zk = Math.max(0.5, Math.min(20, SV.zk * Math.exp(-e.deltaY * 0.0015)));
    SV.ph = mx - (mx - SV.ph) * zk / SV.zk; SV.pv = my - (my - SV.pv) * zk / SV.zk; SV.zk = zk; SV.user = true;
    drawSideView();
  }, { passive: false });
}
function svReset() { SV.zk = 1; SV.ph = 0; SV.pv = 0; SV.user = false; }
function svResize() {
  if (!SV.cv) return;
  const wrap = SV.cv.parentElement, dpr = Math.min(2, devicePixelRatio || 1), w = wrap.clientWidth, h = wrap.clientHeight;
  SV.cv.width = w * dpr; SV.cv.height = h * dpr; SV.cv.style.width = w + 'px'; SV.cv.style.height = h + 'px'; SV.dpr = dpr; SV.w = w; SV.h = h;
}
// 基本換算（自動縮放）再套上使用者的縮放（zk）與平移（ph、pv）
function svH(x, z) { return (SV.axis === 'x' ? SV.o + x * SV.k : SV.o - z * SV.k) * SV.zk + SV.ph; }
function svV(y) { return (SV.h / 2 - y * (SV.h / 2 - 16) / SV.range) * SV.zk + SV.pv; }
function svY(py) { return (SV.h / 2 - (py - SV.pv) / SV.zk) * SV.range / (SV.h / 2 - 16); }
// 仰角把手：從節點往船頭的方向（在這個側視方向上看）伸出，角度＝仰角
function svDir(H) { const f = SV.axis === 'x' ? Math.sin(H || 0) : -Math.cos(H || 0); return f < -0.2 ? -1 : 1; }
function svHandle(h, v, P, H) { const s = svDir(H); return [h + s * Math.cos(P || 0) * SV_HANDLE, v - Math.sin(P || 0) * SV_HANDLE]; }
// 側視圖上可以調整的點：每個節點（高度＋仰角）；沒有目的地的部隊＝原地（只有仰角把手）
function svNodes() {
  const out = [];
  for (const g of overlayGroups()) {
    if (!g.goal) out.push({ g, ref: 'cur', n: 0, x: g.ax, z: g.az, y: g.ayT != null ? g.ayT : (g.ay || 0), P: g.pCmd || 0, H: g.to, still: true });
    out.push(...groupNodes(g));
  }
  const d = TAC.drag;   // 拖曳中：先顯示新的值
  if (d && (d.kind === 'svnode' || d.kind === 'svpitch')) for (const n of out) if (sameNode(n, d.nd)) { if (d.y != null) n.y = d.y; if (d.P != null) n.P = d.P; }
  return out;
}
function drawSideView() {
  if (!SV.cv || !SV.w) return;
  const c = SV.ctx, W = SV.w, H = SV.h, dpr = SV.dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#03060d'; c.fillRect(0, 0, W, H);
  const nodes = svNodes();
  if (!SV.user) {   // 手動縮放／平移時固定基本換算，畫面才不會自己跑掉
    // 高度範圍：照目前用到的最大高度（含目的地、節點、地形）放大縮小
    let ym = 120;
    for (const q of squadrons) if (!q.bg && q.alive > 0 && !fowHidden(q)) ym = Math.max(ym, Math.abs(q.y || 0) + Math.max(q.W, q.D) * 0.3);
    for (const g of groups) if (g.ayT != null) ym = Math.max(ym, Math.abs(g.ayT));
    for (const n of nodes) ym = Math.max(ym, Math.abs(n.y));
    for (const t of terrainList()) if (t.y != null) ym = Math.max(ym, Math.abs(t.y) + t.r * 0.6);
    if (TAC.drag && TAC.drag.kind === 'sright') ym = Math.max(ym, Math.abs(TAC.drag.y));
    SV.range += (Math.min(ALT_MAX, ym * 1.15 + 20) - SV.range) * (TAC.drag ? 0 : 0.15);
    // 橫軸：把部隊所在的範圍撐滿整個寬度（左右模式＝x，前後模式＝z，我方在左）
    const B = tacBounds(), pad = 24;
    if (SV.axis === 'x') { SV.k = (W - pad * 2) / (B.x1 - B.x0); SV.o = pad - B.x0 * SV.k; } else { SV.k = (W - pad * 2) / (B.z1 - B.z0); SV.o = pad + B.z1 * SV.k; }
  }
  gEl('tac-svt').textContent = `${SV.axis === 'x' ? '側視・左右（從我方看過去）' : '側視・前後（從右側看：我方在左）'}　拖曳節點＝高度・拖曳把手＝仰角・滾輪＝縮放`;
  gEl('tac-svaxis').textContent = SV.axis === 'x' ? '改看前後' : '改看左右';
  gEl('tac-svfit').classList.toggle('on', !SV.user);
  // 高度格線
  c.font = `${uiPx(11.5)}px system-ui`; c.textAlign = 'left';
  const ppu = (H / 2 - 16) / SV.range * SV.zk, step = [5, 10, 25, 50, 100, 200].find((s) => s * ppu >= 18) || 400;   // 格線間距至少 18px
  const yTop = Math.min(ALT_MAX, svY(0)), yBot = Math.max(-ALT_MAX, svY(H));
  for (let y = Math.ceil(yBot / step) * step; y <= yTop; y += step) {
    const py = svV(y); c.strokeStyle = y === 0 ? 'rgba(150,175,220,.35)' : 'rgba(150,175,220,.08)'; c.beginPath(); c.moveTo(0, py); c.lineTo(W, py); c.stroke();
    c.fillStyle = y === 0 ? 'rgba(200,215,240,.7)' : 'rgba(150,175,220,.45)'; c.fillText(y === 0 ? '基準面 0' : (y > 0 ? '+' : '') + y, 4, py - 2);
  }
  // 地形：球的剖面（實體障礙填滿）
  const kx = SV.k * SV.zk, ky = (H / 2 - 16) / SV.range * SV.zk;
  for (const t of terrainList()) {
    const def = TERRAIN_TYPES[t.type], col = '#' + def.color.toString(16).padStart(6, '0'), y = t.y || 0;
    c.beginPath(); c.ellipse(svH(t.x, t.z), svV(y), t.r * kx, t.r * ky, 0, 0, TAU);
    c.fillStyle = col + (def.solid ? '99' : '1c'); c.fill(); c.strokeStyle = col + (def.solid ? 'ee' : '77'); c.setLineDash(def.solid ? [] : [4, 4]); c.stroke(); c.setLineDash([]);
  }
  // 艦艇：每 3 艘一點；同時算出每支分艦隊在側視圖上的範圍
  const col = ['#f2b35a', '#7cc4ff'];
  SV.ext = squadrons.map(() => [1e9, -1e9, 1e9, -1e9]);
  for (let sd = 0; sd < 2; sd++) {
    c.fillStyle = col[SIDE_FAC[sd]];
    for (let i = 0; i < shipCount; i += 3) {
      if (!ships.alive[i] || ships.side[i] !== sd) continue;
      const qi = ships.sq[i], q = squadrons[qi]; if (q.bg || q.hidden || fowHidden(q)) continue;
      shipWorldCPU(i, _a); const h = svH(_a.x, _a.z), v = svV(_a.y);
      c.fillRect(h - 0.8, v - 0.8, 1.6, 1.6);
      const e = SV.ext[qi]; if (h < e[0]) e[0] = h; if (h > e[1]) e[1] = h; if (v < e[2]) e[2] = v; if (v > e[3]) e[3] = v;
    }
  }
  // 分艦隊外框（選取的白色）
  squadrons.forEach((q, qi) => {
    const e = SV.ext[qi]; if (q.bg || q.alive <= 0 || e[0] > e[1]) return;
    const sel = selected.has(q);
    c.strokeStyle = sel ? '#ffffff' : (SIDE_FAC[q.side] ? 'rgba(124,196,255,.45)' : 'rgba(242,179,90,.45)'); c.lineWidth = sel ? 1.6 : 1;
    c.strokeRect(e[0] - 3, e[2] - 3, e[1] - e[0] + 6, e[3] - e[2] + 6);
  });
  c.lineWidth = 1;
  // 我方部隊的路徑：目前位置 → 各節點（虛線），節點＝圓點＋編號＋仰角把手
  const mv = hex(CMD_COL.move), d = TAC.drag;
  for (const g of overlayGroups()) {
    const ns = nodes.filter((n) => n.g === g && !n.still); if (!ns.length) continue;
    c.strokeStyle = mv; c.globalAlpha = 0.8; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(svH(g.ax, g.az), svV(g.ay || 0));
    for (const n of ns) c.lineTo(svH(n.x, n.z), svV(n.y));
    c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  }
  c.font = `600 ${uiPx(10.5)}px system-ui`;
  for (const n of nodes) {
    const h = svH(n.x, n.z), v = svV(n.y), [hx, hy] = svHandle(h, v, n.P, n.H);
    const act = d && (d.kind === 'svnode' || d.kind === 'svpitch') && sameNode(d.nd, n), cn = n.form ? hex(CMD_COL.form) : mv;
    c.strokeStyle = act && d.kind === 'svpitch' ? '#ffffff' : 'rgba(255,210,122,.9)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(h, v); c.lineTo(hx, hy); c.stroke(); c.lineWidth = 1;
    c.beginPath(); c.arc(hx, hy, 3.5, 0, TAU); c.fillStyle = '#ffd27a'; c.fill();
    if (n.still) continue;
    c.beginPath(); c.arc(h, v, 5, 0, TAU); c.fillStyle = cn; c.fill(); c.lineWidth = 1.5; c.strokeStyle = act ? '#ffffff' : '#03060d'; c.stroke(); c.lineWidth = 1;
    c.fillStyle = cn; c.textAlign = 'center'; c.fillText(n.ref === 'cur' ? '▶' : String(n.n), h, v - 9);
  }
  // 艦隊標籤：名稱＋高度
  c.font = `${uiPx(12.5)}px system-ui`; c.textAlign = 'left';
  const placed = [];   // 標籤互相錯開
  for (const f of fleets) {
    if (f.reserve) continue; const al = fleetAlive(f); if (!al.length) continue;
    const C = centerOf(al), h = svH(C.x, C.z), txt = `${f.name} ${C.y >= 0 ? '▲' : '▼'}${Math.round(Math.abs(C.y))}`, w = c.measureText(txt).width + 8;
    const lh = uiPx(17);
    let v = svV(C.y) - lh - 1;
    for (let k = 0; k < 6 && placed.some((p) => h + 6 < p[0] + p[2] && h + 6 + w > p[0] && v < p[1] + lh && v + lh > p[1]); k++) v -= lh + 1;
    placed.push([h + 6, v, w]);
    c.fillStyle = 'rgba(5,8,16,.8)'; c.fillRect(h + 6, v, w, lh);
    c.fillStyle = col[SIDE_FAC[f.side]]; c.fillText(txt, h + 10, v + lh - 4);
  }
  // 拖曳中：數值提示
  c.fillStyle = '#fff'; c.font = `600 ${uiPx(12)}px system-ui`; c.textAlign = 'right';
  if (d && d.kind === 'sright') {
    const v = svV(d.y); c.strokeStyle = '#ffffff'; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(0, v); c.lineTo(W, v); c.stroke(); c.setLineDash([]);
    c.fillText(`高度 ${d.y > 0 ? '+' : ''}${Math.round(d.y)}`, W - 8, v - 6);
  } else if (d && (d.kind === 'svnode' || d.kind === 'svpitch')) {
    const n = nodes.find((x) => sameNode(x, d.nd));
    if (n) c.fillText(`${n.still ? '原地' : nodeName(n)}：高度 ${yTxt(n.y)}・仰角 ${pTxt(n.P)}`, W - 8, H - 8);
  }
}
function svHit(px, py) {
  let best = null, bd = 1e9;
  squadrons.forEach((q, qi) => {
    const e = SV.ext[qi]; if (!e || q.bg || q.alive <= 0 || e[0] > e[1] || q.side !== cmdSide) return;
    if (px < e[0] - 8 || px > e[1] + 8 || py < e[2] - 8 || py > e[3] + 8) return;
    const d = Math.hypot(px - (e[0] + e[1]) / 2, py - (e[2] + e[3]) / 2); if (d < bd) { bd = d; best = q; }
  });
  return best;
}
// 先找把手（仰角），再找節點（高度）
function svNodeHit(px, py) {
  let best = null, bd = 9;
  for (const n of svNodes()) {
    const h = svH(n.x, n.z), v = svV(n.y), [hx, hy] = svHandle(h, v, n.P, n.H);
    const dh = Math.hypot(hx - px, hy - py); if (dh < bd) { bd = dh; best = { nd: n, kind: 'svpitch' }; }
    if (!n.still) { const dn = Math.hypot(h - px, v - py); if (dn < bd) { bd = dn; best = { nd: n, kind: 'svnode' }; } }
  }
  return best;
}
function svDown(e) {
  SV.cv.setPointerCapture(e.pointerId);
  const r = SV.cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (e.button === 2 || e.pointerType === 'touch' && selected.size) {
    if (!selected.size) { toast('先選取要升降的部隊'); return; }
    TAC.drag = { kind: 'sright', y: Math.max(-ALT_MAX, Math.min(ALT_MAX, svY(py))) }; drawSideView(); return;
  }
  if (e.button !== 0) return;
  const hit = svNodeHit(px, py);
  if (hit) {
    if (!tacEditable()) { toast('回放中不能修改'); return; }
    TAC.drag = { kind: hit.kind, nd: hit.nd, y: null, P: null, x0: e.clientX, y0: e.clientY };
    SV.cv.style.cursor = hit.kind === 'svnode' ? 'ns-resize' : 'grabbing'; drawSideView(); return;
  }
  TAC.drag = { kind: 'svpress', x0: e.clientX, y0: e.clientY, ph0: SV.ph, pv0: SV.pv, px, py, add: e.shiftKey || e.ctrlKey, alt: e.altKey };
}
function svMove(e) {
  const d = TAC.drag, r = SV.cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (!d) { if (e.pointerType === 'mouse') { const h = svNodeHit(px, py); SV.cv.style.cursor = !h ? '' : h.kind === 'svnode' ? 'ns-resize' : 'grab'; } return; }
  if (d.kind === 'sright') d.y = Math.max(-ALT_MAX, Math.min(ALT_MAX, Math.round(svY(py) / 10) * 10));
  else if (d.kind === 'svnode') d.y = Math.max(-ALT_MAX, Math.min(ALT_MAX, Math.round(svY(py) / 10) * 10));
  else if (d.kind === 'svpitch') {
    const n = d.nd, h = svH(n.x, n.z), v = svV(d.y != null ? d.y : n.y);
    const a = Math.atan2(v - py, Math.max(1, Math.abs(px - h)));   // 往左或往右拖都可以；往上＝抬頭
    d.P = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, Math.round(a * 180 / Math.PI) * Math.PI / 180));
  } else if (d.kind === 'svpress' || d.kind === 'svpan') {
    if (d.kind === 'svpress' && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) { d.kind = 'svpan'; SV.cv.style.cursor = 'grabbing'; }
    if (d.kind === 'svpan') { SV.ph = d.ph0 + e.clientX - d.x0; SV.pv = d.pv0 + e.clientY - d.y0; SV.user = true; }
  } else return;
  drawSideView();
}
function svUp() {
  const d = TAC.drag; if (!d) return;
  if (!(d.kind === 'sright' || d.kind === 'svnode' || d.kind === 'svpitch' || d.kind === 'svpress' || d.kind === 'svpan')) return;
  TAC.drag = null; SV.cv.style.cursor = '';
  if (d.kind === 'sright') { if (selected.size) cmdAlt(d.y); }
  else if (d.kind === 'svnode' && d.y != null) nodeEdit(d.nd, 'alt', { y: d.y });
  else if (d.kind === 'svpitch' && d.P != null) nodeEdit(d.nd, 'alt', { P: d.P });
  else if (d.kind === 'svpress') {   // 短按：選取
    const q = svHit(d.px, d.py);
    if (q) setSelection(d.alt ? [q] : pickUnit(q, false), d.add); else if (!d.add) clearSelection();
  }
  if (d.kind === 'svnode' || d.kind === 'svpitch') updateTacSide();
  drawSideView(); if (paused) drawTac();
}
