// ═══════════════════════ 命令預覽：目的地、變陣後的樣子、戰術隊列 ═══════════════════════
// 主畫面與戰術面板共用同一份「圖形清單」（世界座標），各自畫出來。

// 部隊目前（或變陣後）的分艦隊排法：每支分艦隊的中心（陣型座標）與大小
function layoutNow(g) {
  return g.sqs.filter((q) => q.alive > 0).map((q) => {
    const o = q.snSave ? q.snSave.off1 : q.off1;
    return { cu: o[0], cv: o[1], W: q.snSave ? q.snSave.W1 : q.W1, D: q.snSave ? q.snSave.D1 : q.D1 };
  });
}
// 隊列裡「之後才換」的陣型：用同一套陣型產生器先算出大致排法（只給預覽用，不動到模擬）
const _layCache = new WeakMap();
function layoutFor(g, kind, orderly, width, key) {
  if (key && _layCache.has(key)) return _layCache.get(key);
  const sqs = g.sqs.filter((q) => q.alive > 0);
  const counts = sqs.map((q) => q.list.length);
  const order = squadronOrder(kind, sqs.map((q) => ({ cu: q.off1[0], cv: q.off1[1] })));
  const opt = kind === 'line' && width ? { width } : null;
  const lay = orderly ? genOrderly(kind, counts, order, g.layers || 1, opt) : genFormation(kind, counts, order, rand(7), opt);
  const out = lay.map((L) => { let mx = 0, mz = 0; for (const l of L.local) { mx = Math.max(mx, Math.abs(l[0])); mz = Math.max(mz, Math.abs(l[2])); } return { cu: L.cu, cv: L.cv, W: mx * 2 + 10, D: mz * 2 + 10, local: L.local }; });
  if (key) _layCache.set(key, out);
  return out;
}
// 命令種類的顏色：移動＝青、陣型＝綠、技能＝粉紫、攻擊＝橘紅
const CMD_COL = { move: 0x5ad1ff, form: 0x8fe3a5, skill: 0xff7ad9, attack: 0xff6a4a };
const CMD_NAME = { move: '移動', form: '陣型', skill: '技能', attack: '攻擊' };
function itemKind(it) { return it.type === 'orderly' || it.type === 'layers' ? 'form' : it.type === 'alt' || it.type === 'turn' ? 'move' : it.type === 'volley' || it.type === 'missile' || it.type === 'area' ? 'attack' : it.type; }
const turnTxt = (d) => `轉向 ${d > 0 ? '右' : '左'} ${Math.round(Math.abs(d) * 180 / Math.PI)}°`;
const SALVO_NAME = { volley: '全艦齊射', missile: '飛彈齊射' };
// 圖形清單：boxes（預定位置框）、lines（路線，arrow＝畫箭頭）、labels、ghosts（船的預定位置）
// blink＝正在執行的命令（閃爍提醒）
function groupOverlay(g, main = false) {
  const showPrev = !main || uiOn('preview'), showQ = !main || uiOn('queue');
  const out = { boxes: [], lines: [], labels: [], arrows: [], ghosts: [] };
  const t = U.uTime.value;
  let P = { x: g.ax, z: g.az, y: g.ay || 0 }, H = g.to, lay = layoutNow(g), form = g.formation, orderly = g.orderly;
  const altTxt = (y, p) => (Math.abs(y) >= 5 ? ` ${y > 0 ? '▲' : '▼'}${Math.round(Math.abs(y))}` : '') + pitchTxt(p);   // 高度、仰角（3D）
  let Pt = g.pCmd || 0;
  const ghostNow = (P, H, col) => { out.ghosts.push({ P, H, col, ships: true }); };
  const ghostLay = (P, H, lay, col) => { out.ghosts.push({ P, H, col, lay }); };
  const place = (P, H, lay, col, op, blink) => {
    let u0 = 1e9, u1 = -1e9, v1 = -1e9;
    for (const L of lay) {
      out.boxes.push({ x: P.x + Math.cos(H) * L.cu + Math.sin(H) * L.cv, z: P.z - Math.sin(H) * L.cu + Math.cos(H) * L.cv, y: P.y || 0, H, W: L.W, D: L.D, col, op, blink });
      u0 = Math.min(u0, L.cu - L.W / 2); u1 = Math.max(u1, L.cu + L.W / 2); v1 = Math.max(v1, L.cv + L.D / 2);
    }
    if (lay.length) { const cu = (u0 + u1) / 2, W = u1 - u0; out.arrows.push({ x: P.x + Math.cos(H) * cu + Math.sin(H) * (v1 + 6), z: P.z - Math.sin(H) * cu + Math.cos(H) * (v1 + 6), y: P.y || 0, H, W, col, op: 0.9, blink }); }
  };
  const tgtP = (tq) => (tq && tq.alive > 0 ? pSeen(tq) : null);   // 戰爭迷霧：目標看不到就指向最後已知位置（沒有就不畫）
  const gT = showPrev && tgtP(g.target);
  if (gT) out.lines.push({ pts: [[g.ax, g.az, g.ay || 0], [gT.x, gT.z, gT.y || 0]], col: CMD_COL.attack, op: gT.stale ? 0.3 : 0.6, arrow: true, dash: true });
  if (showPrev) for (const q of g.sqs) { const T = q.alive > 0 && tgtP(q.atk); if (T) out.lines.push({ pts: [[q.x, q.z, q.y || 0], [T.x, T.z, T.y || 0]], col: CMD_COL.attack, op: T.stale ? 0.25 : 0.5, arrow: true, dash: true }); }   // 分艦隊自己的目標
  // 區域攻擊：那一點畫一圈＋剩餘秒數
  if (showPrev && g.area && g.area.until > t) {
    const A = g.area, r = FOW_RULE.area.r, ring = [];
    for (let k = 0; k <= 32; k++) ring.push([A.x + Math.cos(k / 32 * TAU) * r, A.z + Math.sin(k / 32 * TAU) * r, A.y]);
    out.lines.push({ pts: ring, col: CMD_COL.attack, op: 0.8, blink: true });
    out.lines.push({ pts: [[g.ax, g.az, g.ay || 0], [A.x, A.z, A.y]], col: CMD_COL.attack, op: 0.45, arrow: true, dash: true });
    out.labels.push({ x: A.x, z: A.z, y: A.y, text: `區域攻擊 ${Math.ceil(g.area.until - t)} 秒`, col: CMD_COL.attack, blink: true });
  }
  const cur = g.cur;
  const morphing = g.sqs.some((q) => q.alive > 0 && (sqMorphing(q, t) || q.relayUntil > t));
  if (g.goal && showPrev) {
    // 正在執行的移動：青色、閃爍
    const yT = g.ayT != null ? g.ayT : (g.ay || 0);
    if (g.plan && g.plan.segs) out.lines.push({ pts: withY(planPoints(g.plan.segs, g.plan.i || 0, g.plan.s || 0, g.plan.kind === 'snake' ? null : [g.ax, g.az]), g.ay || 0, yT), col: CMD_COL.move, op: 0.75, arrow: true, blink: true });
    P = { x: g.goal.x, z: g.goal.z, y: yT }; H = g.goal.H;
    place(P, H, lay, CMD_COL.move, 0.7, true);
    if (!maneuvering(g)) ghostNow(P, H, 0xffffff);
    out.labels.push({ x: P.x, z: P.z, y: P.y, text: '▶ 移動中' + altTxt(P.y, Pt), col: CMD_COL.move, blink: true });
  } else if (showPrev && g.ayT != null && Math.abs(g.ayT - (g.ay || 0)) > 2) {
    // 只改高度（原地升降）
    out.lines.push({ pts: [[g.ax, g.az, g.ay || 0], [g.ax, g.az, g.ayT]], col: CMD_COL.move, op: 0.75, arrow: true, blink: true });
    P = { x: g.ax, z: g.az, y: g.ayT };
    place(P, H, lay, CMD_COL.move, 0.7, true);
    out.labels.push({ x: P.x, z: P.z, y: P.y, text: '▶ ' + (g.ayT > (g.ay || 0) ? '上升' : '下降') + altTxt(P.y, Pt), col: CMD_COL.move, blink: true });
  }
  if (showPrev && morphing && (!g.goal || (cur && cur.type === 'form'))) {
    // 正在執行的變陣：綠色、閃爍
    const Pm = g.goal ? P : { x: g.ax, z: g.az, y: g.ay || 0 }, Hm = g.goal ? H : g.to;
    if (!g.goal) { place(Pm, Hm, lay, CMD_COL.form, 0.75, true); ghostNow(Pm, Hm, 0xffffff); }
    out.labels.push({ x: Pm.x, z: Pm.z, y: Pm.y, text: '▶ 變陣 → ' + FORMATIONS[g.formation].name, col: CMD_COL.form, blink: true });
  }
  let n = 1;
  if (showQ) for (const it of g.queue || []) {
    const k = itemKind(it), col = CMD_COL[k];
    if (it.type === 'move') {
      const ny = it.y != null ? it.y : P.y;
      out.lines.push({ pts: [[P.x, P.z, P.y], [it.x, it.z, ny]], col, op: 0.85, arrow: true, dash: true });
      P = { x: it.x, z: it.z, y: ny }; if (it.H != null) H = it.H; if (it.P != null) Pt = it.P;
      if (it.width) { lay = layoutFor(g, 'line', orderly, it.width, it); form = 'line'; }
      place(P, H, lay, col, 0.6, false); if (lay[0] && lay[0].local) ghostLay(P, H, lay, col);
      out.labels.push({ x: P.x, z: P.z, y: P.y, text: `${n}. 移動${altTxt(P.y, it.P)}`, col });
    } else if (it.type === 'form' || it.type === 'orderly' || it.type === 'layers') {
      if (it.type === 'form') form = it.kind; else if (it.type === 'orderly') orderly = it.on;
      lay = layoutFor(g, form, orderly, null, it);
      place(P, H, lay, col, 0.6, false); ghostLay(P, H, lay, col);
      out.labels.push({ x: P.x, z: P.z, y: P.y, text: `${n}. 陣型 → ${FORMATIONS[form].name}${it.type === 'orderly' ? (it.on ? '（整齊）' : '（自然）') : it.type === 'layers' ? `（${it.n} 層）` : ''}`, col });
    } else if (it.type === 'alt') {
      out.lines.push({ pts: [[P.x, P.z, P.y], [P.x, P.z, it.y]], col, op: 0.85, arrow: true, dash: true });
      P = { ...P, y: it.y };
      out.labels.push({ x: P.x, z: P.z, y: P.y, text: `${n}. 高度${altTxt(P.y) || ' 0'}`, col });
    } else if (it.type === 'turn') {
      H += it.d;
      place(P, H, lay, col, 0.6, false); if (lay[0] && lay[0].local) ghostLay(P, H, lay, col);
      out.labels.push({ x: P.x, z: P.z, y: P.y, text: `${n}. ${turnTxt(it.d)}`, col });
    } else if (it.type === 'volley' || it.type === 'missile') {
      out.labels.push({ x: P.x, z: P.z, y: P.y, text: `${n}. ${SALVO_NAME[it.type]}`, col });
    } else if (it.type === 'skill') {
      out.labels.push({ x: P.x, z: P.z, y: P.y, text: `${n}. 技能 ⚡ ${SKILLS[it.skill].name}`, col });
      if (it.target != null && squadrons[it.target]) out.lines.push({ pts: [[P.x, P.z, P.y], [squadrons[it.target].x, squadrons[it.target].z, squadrons[it.target].y || 0]], col, op: 0.6, arrow: true, dash: true });
    } else if (it.type === 'area') {
      out.lines.push({ pts: [[P.x, P.z, P.y], [it.x, it.z, it.y || 0]], col, op: 0.6, arrow: true, dash: true });
      out.labels.push({ x: it.x, z: it.z, y: it.y || 0, text: `${n}. 區域攻擊`, col });
    } else if (it.type === 'attack') {
      const tq = squadrons[it.target];
      if (tq) { out.lines.push({ pts: [[P.x, P.z, P.y], [tq.x, tq.z, tq.y || 0]], col, op: 0.7, arrow: true, dash: true }); out.labels.push({ x: P.x, z: P.z, y: P.y, text: `${n}. 攻擊 ${tq.name}`, col }); }
    }
    n++;
  }
  return out;
}
const pitchTxt = (p) => (p != null && Math.abs(p) >= Math.PI / 180 ? ` ∠${p > 0 ? '+' : ''}${Math.round(p * 180 / Math.PI)}°` : '');
// 戰術面板可編輯的節點：正在前往的目的地（ref 'cur'）＋隊列裡的每個移動；y、P 沿用前一個節點
// form＝抵達後要換的陣型（沒有＝不變陣）；n＝與預覽標籤相同的編號（0＝目前的目的地）
function groupNodes(g) {
  const out = [];
  let y = g.ayT != null ? g.ayT : (g.ay || 0), P = g.pCmd || 0, H = g.goal ? g.goal.H : g.to, node = null, n = 1;
  if (g.goal) out.push(node = { g, ref: 'cur', n: 0, x: g.goal.x, z: g.goal.z, y, P, H, form: null });
  for (const it of g.queue || []) {
    if (it.type === 'move') {
      if (it.y != null) y = it.y; if (it.P != null) P = it.P; if (it.H != null) H = it.H;
      out.push(node = { g, ref: it.qid, n, x: it.x, z: it.z, y, P, H, form: null, setY: it.y != null });
    } else if (it.type === 'alt') { y = it.y; if (it.P != null) P = it.P; if (node) { node.y = y; node.P = P; } }
    else if (it.type === 'form' && node) node.form = it.kind;
    n++;
  }
  return out;
}
// 閃爍：用真實時間（暫停中也會閃）
// 路線上的點加上高度（從 y0 平均過渡到 y1）
function withY(pts, y0, y1) { const n = pts.length; return pts.map(([x, z], k) => [x, z, y0 + (y1 - y0) * (n > 1 ? k / (n - 1) : 1)]); }
function blinkK(main) { if (main && !uiOn('blink')) return 1; return 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(performance.now() * 0.009)); }
function overlayGroups() { if (PL.on && !PL.spec) return [];   // 駕駛中：不畫命令標示
  return groups.filter((g) => g.side === cmdSide && !g.inactive && g.sqs.some((q) => q.alive > 0 && !q.bg)); }

// ── 主畫面 ──
const ovGroup = new THREE.Group(); ovGroup.renderOrder = 6; scene.add(ovGroup);
const ovPool = []; let ovUsed = 0;
const ovLabels = []; let ovLabUsed = 0;
function ovLine(pts, color, op) {
  let l = ovPool[ovUsed];
  if (!l) { l = lineObj(color, op); ovPool.push(l); ovGroup.add(l); }
  l.material.color.set(color); l.material.opacity = op; setPts(l, pts); l.visible = true; ovUsed++;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function ovLabel(x, z, text, lb, dy, bk, y = 0) {
  let el = ovLabels[ovLabUsed];
  if (!el) { el = document.createElement('div'); el.className = 'ov-label'; labelLayer.appendChild(el); ovLabels.push(el); }
  ovLabUsed++;
  const [sx, sy, sz] = screenOf(x, y, z);
  if (sz > 1 || sx < -50 || sx > VW + 50 || sy < -50 || sy > VH + 50) { el.style.display = 'none'; return; }
  el.style.display = ''; if (el.textContent !== text) el.textContent = text;
  el.style.color = hex(lb.col); el.style.borderLeftColor = hex(lb.col); el.style.opacity = lb.blink ? bk : 1;
  el.style.transform = `translate(${sx}px, ${sy - 10 - dy}px) translate(-50%, -100%)`;
}
function ovArrowHead(pts, col, op) {
  const n = pts.length; if (n < 2) return;
  const [x1, z1, y1] = pts[n - 1]; let [x0, z0] = pts[n - 2];
  for (let k = n - 2; k >= 0 && Math.hypot(x1 - x0, z1 - z0) < 6; k--) [x0, z0] = pts[k];
  const L = Math.hypot(x1 - x0, z1 - z0) || 1, dx = (x1 - x0) / L, dz = (z1 - z0) / L, s = Math.min(22, Math.max(10, view.height * 0.018));
  ovLine([[x1 - dx * s - dz * s * 0.55, z1 - dz * s + dx * s * 0.55, y1], [x1, z1, y1], [x1 - dx * s + dz * s * 0.55, z1 - dz * s - dx * s * 0.55, y1]], col, op);
}
function renderOverlay3D() {
  ovUsed = 0; ovLabUsed = 0;
  const ghosts = [], bk = blinkK(true);
  for (const g of overlayGroups()) {
    const o = groupOverlay(g, true), sel = g.sqs.some((q) => selected.has(q)), k = sel || paused ? 1 : 0.6;
    for (const gh of o.ghosts) ghosts.push([g, gh]);
    const Y = (pts, y) => pts.map((p) => [p[0], p[1], y + 0.5]);
    for (const b of o.boxes) ovLine(Y(footprintPts(b.x, b.z, b.H, b.W, b.D).box, b.y || 0), b.col, b.op * k * (b.blink ? bk : 1));
    for (const a of o.arrows) ovLine(Y(footprintPts(a.x, a.z, a.H, a.W, 0).arrow, a.y || 0), a.col, Math.min(1, a.op * k * (a.blink ? bk : 1)));
    for (const l of o.lines) { if (l.pts.length < 2) continue; const op = l.op * k * (l.blink ? bk : 1); ovLine(l.pts, l.col, op); if (l.arrow) ovArrowHead(l.pts, l.col, Math.min(1, op + 0.2)); }
    const stack = {};
    for (const lb of o.labels) { const key = Math.round(lb.x / 20) + ',' + Math.round(lb.z / 20); const dy = (stack[key] = (stack[key] || 0) + 1) - 1; ovLabel(lb.x, lb.z, lb.text, lb, dy * 17, bk, lb.y || 0); }
  }
  renderGhosts3D(ghosts);
  for (let i = ovUsed; i < ovPool.length; i++) ovPool[i].visible = false;
  for (let i = ovLabUsed; i < ovLabels.length; i++) ovLabels[i].style.display = 'none';
}
// 預定位置的小點：用 GPU 點雲（只在暫停時畫）
const GHOST_MAX = 60000;
function mkGhost(color) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GHOST_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.6, depthTest: false }));
  pts.frustumCulled = false; pts.renderOrder = 7; scene.add(pts); return pts;
}
const ghostW = mkGhost(0xffffff), ghostY = mkGhost(0xffd27a);
let GHOST_Y = 0.6;
function forGhost(g, gh, cb) {
  const fx = Math.sin(gh.H), fz = Math.cos(gh.H), rx = Math.cos(gh.H), rz = -Math.sin(gh.H); GHOST_Y = (gh.P.y || 0) + 0.6;
  if (gh.ships) {
    for (const q of g.sqs) {
      if (q.alive <= 0) continue;
      for (const i of q.list) { if (!ships.alive[i]) continue; const u = q.off1[0] + ships.lx1[i], v = q.off1[1] + ships.lz1[i]; cb(gh.P.x + rx * u + fx * v, gh.P.z + rz * u + fz * v); }
    }
  } else for (const L of gh.lay) for (let k = 0; k < L.local.length; k += 2) { const l = L.local[k], u = L.cu + l[0], v = L.cv + l[2]; cb(gh.P.x + rx * u + fx * v, gh.P.z + rz * u + fz * v); }
}
function renderGhosts3D(list) {
  const fill = (pts, want) => {
    const a = pts.geometry.attributes.position.array; let n = 0;
    if (paused && uiOn('ghosts')) for (const [g, gh] of list) if ((gh.col !== 0xffffff) === want) forGhost(g, gh, (x, z) => { if (n < GHOST_MAX) { a[n * 3] = x; a[n * 3 + 1] = GHOST_Y; a[n * 3 + 2] = z; n++; } });
    pts.geometry.setDrawRange(0, n); pts.geometry.attributes.position.needsUpdate = n > 0; pts.visible = n > 0;
  };
  fill(ghostW, false); fill(ghostY, true);
}
// 舊的目的地標記改由預覽層統一畫
function showGoal() {}
function updateMarkers() { renderOverlay3D(); }

// ── 戰術面板（2D） ──
function drawArrow2D(c, pts) {
  const n = pts.length; if (n < 2) return;
  const x1 = tx(pts[n - 1][0]), y1 = tz(pts[n - 1][1]); let x0 = tx(pts[n - 2][0]), y0 = tz(pts[n - 2][1]);
  for (let k = n - 2; k >= 0 && Math.hypot(x1 - x0, y1 - y0) < 4; k--) { x0 = tx(pts[k][0]); y0 = tz(pts[k][1]); }
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, dx = (x1 - x0) / L, dy = (y1 - y0) / L, s = 9;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - dx * s - dy * s * 0.6, y1 - dy * s + dx * s * 0.6); c.lineTo(x1 - dx * s + dy * s * 0.6, y1 - dy * s - dx * s * 0.6); c.closePath(); c.fill();
}
function drawOverlay2D(c) {
  const k = TAC.k, bk = blinkK();
  for (const g of overlayGroups()) {
    const o = groupOverlay(g);
    if (paused) for (const gh of o.ghosts) { c.fillStyle = gh.col === 0xffffff ? 'rgba(255,255,255,.55)' : hex(gh.col) + '99'; let n = 0; forGhost(g, gh, (x, z) => { if ((n++ & 1) === 0) c.fillRect(tx(x) - 0.7, tz(z) - 0.7, 1.4, 1.4); }); }
    for (const b of o.boxes) {
      c.save(); c.translate(tx(b.x), tz(b.z)); c.rotate(-b.H + Math.PI);
      c.globalAlpha = Math.min(1, b.op + 0.2) * (b.blink ? bk : 1); c.strokeStyle = hex(b.col); c.lineWidth = b.blink ? 2 : 1.3; c.setLineDash(b.blink ? [] : [4, 3]);
      c.strokeRect(-b.W * k / 2, -b.D * k / 2, b.W * k, b.D * k); c.restore();
    }
    c.setLineDash([]); c.lineWidth = 1;
    for (const a of o.arrows) { c.globalAlpha = a.blink ? bk : 0.9; c.strokeStyle = hex(a.col); c.lineWidth = 2; c.beginPath(); c.moveTo(tx(a.x), tz(a.z)); c.lineTo(tx(a.x) + Math.sin(a.H) * 12, tz(a.z) + Math.cos(a.H) * 12); c.stroke(); c.lineWidth = 1; }
    for (const l of o.lines) {
      if (l.pts.length < 2) continue;
      c.globalAlpha = Math.min(1, l.op + 0.2) * (l.blink ? bk : 1); c.strokeStyle = c.fillStyle = hex(l.col); c.lineWidth = l.blink ? 2.4 : 1.8; c.setLineDash(l.dash ? [6, 4] : []);
      c.beginPath(); l.pts.forEach(([x, z], j) => (j ? c.lineTo(tx(x), tz(z)) : c.moveTo(tx(x), tz(z)))); c.stroke();
      c.setLineDash([]); if (l.arrow) drawArrow2D(c, l.pts);
    }
    c.lineWidth = 1; c.setLineDash([]); c.globalAlpha = 1;
    c.font = '600 11.5px system-ui'; c.textAlign = 'center';
    const stack = {};
    for (const lb of o.labels) {
      const key = Math.round(lb.x / 20) + ',' + Math.round(lb.z / 20), dy = ((stack[key] = (stack[key] || 0) + 1) - 1) * 16;
      const x = tx(lb.x), y = tz(lb.z) - 12 - dy, w = c.measureText(lb.text).width + 10;
      c.globalAlpha = lb.blink ? Math.max(0.35, bk) : 1;
      c.fillStyle = 'rgba(5,8,16,.9)'; c.fillRect(x - w / 2, y - 12, w, 16);
      c.fillStyle = hex(lb.col); c.fillRect(x - w / 2, y - 12, 3, 16); c.fillText(lb.text, x + 1, y);
      c.globalAlpha = 1;
    }
  }
}
