// ═══════════════════════ 艦長：其餘場景與太空任務（艦長生涯第 6 階段） ═══════════════════════
// 場景（capspace.js 的 CAP_SPACE）：深空・恆星（高溫區）、行星軌道（重力＋大氣層）、星雲（到處能躲雷達，外圍是離子風暴）、太空站周邊（巨大太空站＋殘骸區）。
// 任務：護送（我方運輸船隊到躍遷點）、救援撤離（接駁受困的友艦，帶到撤離點）、摧毀設施（雷達陣列、船塢、補給站、跳躍門的護衛平台）、偵察（靠近偵察點掃描後離開）。
// 我方的非玩家艦艇（運輸艦、受困的友艦）放在 CAP.ally，由這裡的 AI 移動；敵軍會把它們當目標（capAllyTarget）。
const CAP_MIS2 = { linkR: 110, linkT: 6, scanT: 5, scanR: 120, holdR: 260 };
Object.assign(CAP_UNIT, {
  array: { kind: 'bldg', sub: 'array', name: '雷達陣列', hp: 620, r: 3.4, hh: 0, sensor: 420, sh: 0, radar: true, intel: true, merit: 90, space: true },
  gate: { kind: 'bldg', sub: 'gate', name: '跳躍門', hp: 9000, r: 12, hh: 0, sensor: 0, merit: 0, space: true },
});
Object.assign(CAP_MIS, {
  escort: { name: '護送', at: 's', text: (M) => `護送 ${M.n} 艘運輸艦到躍遷點（至少 ${M.goal} 艘抵達；${M.n - M.goal + 1} 艘被擊沉就失敗）` },
  rescue: { name: '救援撤離', at: 's', text: (M) => `找到受困的友艦（藍色標記），靠近接駁 ${CAP_MIS2.linkT} 秒，再護送到撤離點（至少救出 ${M.goal} 艘，共 ${M.n} 艘）` },
  strike: { name: '摧毀設施', at: 's', text: (M) => `摧毀 ${M.goal} 處目標設施（${M.names}）` },
  scan: { name: '偵察', at: 's', text: (M) => `靠近 ${M.goal} 個偵察點（青色標記）掃描 ${CAP_MIS2.scanT} 秒，完成後回撤離點或躍遷離開` },
});
const CAP_STRIKE_T = ['array', 'yard', 'depot', 'gate'];

// ───── 戰場生成（capLayoutSpace 呼叫）：回傳 null＝不是這裡的任務 ─────
function capMisLayout2(type, p, o) {
  const { R, li, S, B, fleets, fleet, comp1, shipT, mis, add, spot, near, area, alt, used, units } = o;
  let nEn = o.nEn;
  const comp = (n) => { const c = new Array(SHIP_TYPES.length).fill(0); for (let m = 0; m < n; m++) c[shipT()]++; return c; };
  if (type === 'escort') {
    const E = { x: Math.round((R() - 0.5) * 700), z: -1020 }; used.push({ x: E.x, z: E.z, ex: 240 });
    const nC = [3, 3, 4, 4, 5][li];
    const wp = [0.25, 0.5, 0.75, 1].map((f) => [Math.round(S.x + (E.x - S.x) * f + (f < 1 ? (R() - 0.5) * 520 : 0)), Math.round(S.z + (E.z - S.z) * f)]);
    fleets.push(fleet({ side: 0, name: '運輸船隊', capRole: 'aconvoy', comp: comp1(5, nC), x: S.x + 50, z: S.z - 50, y: 0, h: Math.PI, wp, formation: 'column' }));
    const nA = Math.max(2, nEn + 1);
    for (let k = 0; k < 2; k++) {   // 伏擊：航線中段的兩側
      const f0 = 0.38 + k * 0.28, w = wp[k + 1], c = { x: w[0] + (k ? 1 : -1) * (150 + R() * 100), z: S.z + (E.z - S.z) * f0 };
      if (Math.hypot(c.x, c.z) > CAP_EDGE.R - 150) c.x = w[0];
      fleets.push(fleet({ side: 1, name: `伏擊隊 ${k + 1}`, capRole: 'patrol', comp: comp(k ? nA - Math.ceil(nA / 2) || 1 : Math.ceil(nA / 2)), x: Math.round(c.x), z: Math.round(c.z), y: alt(0.5), h: R() * TAU }));
    }
    mis.n = nC; mis.goal = Math.max(1, nC - (li === 0 ? 2 : 1));
    return { nEn: 0, ext: E };
  }
  if (type === 'rescue') {
    const P0 = spot(area(-850, -350, 1300), 200) || { x: 0, z: -600 };
    const nS = [2, 2, 3, 3, 3][li], c = new Array(SHIP_TYPES.length).fill(0); for (let m = 0; m < nS; m++) c[R() < 0.5 ? 3 : 4]++;
    fleets.push(fleet({ side: 0, name: '受困的友艦', capRole: 'stranded', comp: c, x: Math.round(P0.x), z: Math.round(P0.z), y: alt(0.4), h: R() * TAU, capHpF: Math.round((0.35 + R() * 0.15) * 100) / 100 }));
    const nH = Math.max(1, nEn), wp = Array.from({ length: 8 }, (_, k) => [Math.round(P0.x + Math.sin(k / 8 * TAU) * 300), Math.round(P0.z + Math.cos(k / 8 * TAU) * 300)]);
    fleets.push(fleet({ side: 1, name: '獵殺隊', capRole: 'patrol', comp: comp(nH), x: wp[0][0], z: wp[0][1], y: alt(0.5), h: Math.PI / 2, wp }));
    mis.n = nS; mis.goal = li < 2 ? Math.ceil(nS / 2) : nS - 1;
    return { nEn: Math.max(0, nEn - nH) };
  }
  if (type === 'strike') {
    const tgt = CAP_STRIKE_T.includes(p.tgt) ? p.tgt : CAP_STRIKE_T[Math.floor(R() * CAP_STRIKE_T.length)];
    const T0 = spot(near(B, 40, 160), 110) || { x: B.x + 80, z: B.z };
    if (tgt === 'gate') { add('gate', T0, { y: 0 }); for (let k = 0; k < 3; k++) add('plat', spot(near(T0, 80, 150), 45), { mis: true }); }
    else if (tgt === 'array') { add('array', T0, { mis: true }); add('array', spot(near(T0, 180, 340), 90), { mis: true }); }
    else add(tgt, T0, { mis: true });
    if (li >= 2) add('plat', spot(near(T0, 120, 220), 80));
    const L = units.filter((u) => u.mis);
    mis.goal = L.length; mis.names = `${CAP_UNIT[L[0].type].name}${L.length > 1 ? ` ×${L.length}` : ''}${tgt === 'gate' ? '（跳躍門的護衛）' : ''}`; mis.tgt = tgt;
    return { nEn };
  }
  if (type === 'scan') {
    const nP = [2, 3, 3, 3, 4][li], pts = [];
    for (let k = 0; k < nP; k++) {
      const c = spot(k === 0 ? near(B, 60, 200) : area(-850, 250, 1600), 300); if (!c) continue;
      const pt = { x: Math.round(c.x), y: alt(0.4), z: Math.round(c.z), r: CAP_MIS2.scanR, p: 0 }; pts.push(pt);
      add('buoy', spot(near(pt, 150, 260), 60));
    }
    mis.pts = pts; mis.goal = pts.length;
    return { nEn };
  }
  return null;
}

// ───── 我方的非玩家艦艇 ─────
function capAllyAdd(f, g) {
  const fd = SIM.m.fleets[f.id] || {};
  if (fd.capHpF) for (const q of f.sqs) for (const i of q.list) ships.hp[i] = maxHp(i) * fd.capHpF;
  for (const q of f.sqs) for (const i of q.list) ships.ammo[i] = 0;
  CAP.ally.push({ f, g, role: f.capRole, wp: (fd.wp || []).map(([x, z]) => ({ x, z })), wi: 0, dest: null, destT: -99, on: true, link: 0, lt: null, n0: f.sqs.reduce((a, q) => a + q.alive, 0) });
}
const capAllyAlive = (A) => (A.on ? A.f.sqs.reduce((a, q) => a + q.alive, 0) : 0);
// 抵達：從戰場上拿掉，算進任務進度
function capAllyLeave(A) {
  let n = 0;
  for (const q of A.f.sqs) for (const i of q.list) { if (!ships.alive[i]) continue; ships.alive[i] = 0; q.alive--; q.typeAlive[ships.type[i]]--; n++; }
  for (const q of A.f.sqs) { q.bg = true; q.hidden = true; if (q.label) q.label.style.display = 'none'; }
  A.g.inactive = true; A.on = false;
  const M = CAP.mis; if (!M || !n) return;
  M.arr = (M.arr || 0) + n;
  const msg = A.role === 'aconvoy' ? `${n} 艘運輸艦抵達躍遷點` : `${n} 艘友艦撤離成功`;
  capFeed(msg, 'ok'); toast(msg, 'pilot');
}
function capAllyAI(t) {
  for (const A of CAP.ally) {
    if (!A.on) continue;
    const dt = A.lt == null ? 0 : t - A.lt; A.lt = t;
    const al = A.f.sqs.filter((q) => q.alive > 0); if (!al.length) { A.on = false; continue; }
    const C = centerOf(al); A.c = C;
    let dest = null;
    if (A.role === 'aconvoy') {
      const w = A.wp[Math.min(A.wi, A.wp.length - 1)];
      if (Math.hypot(w.x - C.x, w.z - C.z) < 55) A.wi++;
      if (A.wi >= A.wp.length) { capAllyLeave(A); continue; }
      // 遇襲：附近有敵艦就停下來等護衛清除威脅（威脅消失 3 秒後再出發）
      const th = capThreatNear(C, CAP_MIS2.holdR);
      if (th) { A.clearT = t; if (!A.hold) { A.hold = true; moveGroup(A.g, C.x, C.z, A.g.to || 0, { y: A.g.ay || 0 }); A.dest = null; capFeed('運輸船隊遇襲：停下來等待護衛清除威脅', 'bad'); toast('運輸船隊遇襲，停止前進：清除附近的敵艦', 'bad'); } continue; }
      if (A.hold) { if (t - A.clearT < 3) continue; A.hold = false; capFeed('威脅解除：運輸船隊繼續前進', 'ok'); }
      dest = A.wp[A.wi];
    } else if (A.role === 'stranded') {
      if (A.link < 1) {
        const near = CAP.own.some((s) => !s.dead && Math.hypot(s.x - C.x, s.y - C.y, s.z - C.z) < CAP_MIS2.linkR);
        if (near) { if (!A.link) capFeed('開始接駁受困的友艦…留在附近', 'hint'); A.link = Math.min(1, A.link + dt / CAP_MIS2.linkT); if (A.link >= 1) { capFeed('接駁完成：友艦往撤離點移動，護送它們', 'ok'); toast('接駁完成：受困的友艦往撤離點移動', 'pilot'); } }
        continue;
      }
      if (Math.hypot(CAP.ext.x - C.x, CAP.ext.z - C.z) < CAP_RULE.extR * 1.5) { capAllyLeave(A); continue; }
      dest = CAP.ext;
    }
    if (!dest) continue;
    if (A.dest && A.dest.x === dest.x && A.dest.z === dest.z && t - A.destT < 12) continue;
    A.dest = { x: dest.x, z: dest.z }; A.destT = t;
    moveGroup(A.g, dest.x, dest.z, Math.atan2(dest.x - C.x, dest.z - C.z), { y: A.g.ay || 0 });
  }
}
// 附近的敵方戰艦（運輸船隊遇襲判定）
function capThreatNear(C, R) {
  for (const P of CAP.pat) if (P.on) for (const q of P.f.sqs) if (q.alive > 0 && !q.hidden && Math.hypot(q.x - C.x, q.z - C.z) < R) return true;   // 艦載機平台的母艦（隱藏）不算
  return CAP.foes.some((s) => !s.dead && Math.hypot(s.x - C.x, s.z - C.z) < R);
}
// 敵軍的目標：比 bd 更近的我方運輸艦、友艦（受困的友艦在接駁開始或拉警報後才會被追殺）
function capAllyTarget(C, bd) {
  let best = null;
  for (const A of CAP.ally || []) {
    if (!A.on || (A.role === 'stranded' && !A.link && !CAP.alarm)) continue;
    for (const q of A.f.sqs) {
      if (q.alive <= 0) continue; const d = Math.hypot(q.x - C.x, q.z - C.z); if (d >= bd) continue;
      bd = d; best = { x: q.x, y: q.y || 0, z: q.z, q };
      // 移動中：還在前方＝到它的航線上等（攔截點）；已經過去了＝往它要去的方向搶前（越近搶得越少，最後貼上去開火）
      if (A.dest && (A.role === 'aconvoy' || A.link >= 1)) {
        const dx = A.dest.x - q.x, dz = A.dest.z - q.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, s = (C.x - q.x) * ux + (C.z - q.z) * uz;
        const k = s > 40 ? Math.min(s, l) : Math.min(90, d * 0.5);
        best.lead = { x: q.x + ux * k, z: q.z + uz * k };
      }
    }
  }
  return best;
}

// ───── 任務進度 ─────
function capMis2Init(M) {
  if (M.type === 'scan') M.pts = (M.pts || []).map((p) => ({ ...p, p: 0 }));
  if (M.type === 'escort' || M.type === 'rescue') { M.arr = 0; M.prog = 0; }
}
function capMis2Tick(M, t) {
  const dt = M.lt == null ? 0 : t - M.lt; M.lt = t;
  if (M.type === 'escort' || M.type === 'rescue') {
    const alive = (CAP.ally || []).reduce((a, A) => a + capAllyAlive(A), 0);
    M.prog = Math.min(M.goal, M.arr || 0); M.alive = alive;
    if (!M.done && (M.arr || 0) + alive < M.goal) capFinish(false, M.type === 'escort' ? '運輸艦損失太多' : '受困的友艦損失太多');
  }
  if (M.type === 'scan') {
    for (const pt of M.pts) {
      if (pt.p >= 1) continue;
      const L = CAP.own.filter((s) => !s.dead && Math.hypot(s.x - pt.x, s.y - pt.y, s.z - pt.z) < pt.r); if (!L.length) continue;
      pt.p = Math.min(1, pt.p + dt / CAP_MIS2.scanT); for (const s of L) capSig(s, t, 0.3);   // 掃描會發出訊號：比較容易被發現
      if (pt.p >= 1) capFeed(`偵察點掃描完成（${M.pts.filter((q) => q.p >= 1).length}／${M.pts.length}）`, 'ok');
    }
    M.prog = M.pts.filter((q) => q.p >= 1).length;
  }
}
function capMis2Prog(M) {
  if (M.type === 'escort') return `抵達 ${M.arr || 0}／${M.goal}・航行中 ${M.alive != null ? M.alive : M.n}`;
  if (M.type === 'rescue') return `救出 ${M.arr || 0}／${M.goal}・受困 ${M.alive != null ? M.alive : M.n}`;
  return '';
}
// 儀表：我方艦艇（藍）、偵察點（青）
function capMis2Marks(g, sw, s, dia) {
  const M = CAP.mis; if (!M) return;
  for (const A of CAP.ally || []) {
    if (!A.on || !A.c) continue;
    const C = A.c, d = Math.hypot(C.x - s.x, C.y - s.y, C.z - s.z), p = sw(C.x, C.y + 4, C.z), n = capAllyAlive(A);
    const hp = A.f.sqs.reduce((a, q) => a + q.list.reduce((b, i) => b + (ships.alive[i] ? ships.hp[i] / maxHp(i) : 0), 0), 0) / Math.max(1, n);
    const label = A.role === 'aconvoy' ? `運輸艦 ${n} 艘 ${Math.round(hp * 100)}%` : A.link >= 1 ? `友艦撤離中 ${n} 艘` : A.link > 0 ? `接駁 ${Math.round(A.link * 100)}%` : `受困友艦 ${n} 艘`;
    if (!p) { _ch.set(C.x, C.y, C.z); pilotEdgeArrow(g, _ch, '#6fb8ff', `${label} ${Math.round(d)}`); continue; }
    dia(p, 13, '#6fb8ff'); g.fillStyle = '#9fd0ff'; g.fillText(`${label} ${Math.round(d)}`, p[0] + 16, p[1] - 2);
    if (A.role === 'stranded' && A.link > 0 && A.link < 1) { g.strokeStyle = '#6fb8ff'; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 19, -Math.PI / 2, -Math.PI / 2 + TAU * A.link); g.stroke(); g.lineWidth = 1.5; }
  }
  if (M.type === 'scan') for (const pt of M.pts) {
    if (pt.p >= 1) continue;
    const p = sw(pt.x, pt.y, pt.z), d = Math.hypot(pt.x - s.x, pt.y - s.y, pt.z - s.z);
    if (!p) { _ch.set(pt.x, pt.y, pt.z); pilotEdgeArrow(g, _ch, '#5fe0d8', `偵察點 ${Math.round(d)}`); continue; }
    g.strokeStyle = '#5fe0d8'; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 14, 0, TAU); g.stroke();
    if (pt.p > 0) { g.beginPath(); g.arc(p[0], p[1], 19, -Math.PI / 2, -Math.PI / 2 + TAU * pt.p); g.stroke(); }
    g.lineWidth = 1.5; g.fillStyle = '#5fe0d8'; g.fillText(`偵察點 ${pt.p > 0 ? Math.round(pt.p * 100) + '%' : Math.round(d)}${d < pt.r ? '・掃描中' : ''}`, p[0] + 18, p[1] - 2);
  }
}
function capMis2Radar(g, pt, k) {
  const M = CAP.mis; if (!M) return;
  for (const A of CAP.ally || []) { if (!A.on || !A.c) continue; const p = pt(A.c.x, A.c.z); if (!p) continue; g.fillStyle = '#6fb8ff'; g.fillRect(p[0] - 3, p[1] - 3, 6, 6); }
  if (M.type === 'scan') for (const q of M.pts) { if (q.p >= 1) continue; const p = pt(q.x, q.z); if (!p) continue; g.strokeStyle = '#5fe0d8'; g.beginPath(); g.arc(p[0], p[1], Math.max(3, q.r * k), 0, TAU); g.stroke(); }
}

// ───── 畫面：恆星、行星、星雲、太空站 ─────
const CAP_BILL_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
let _capSoftTex = null;
function capSoftTex() {
  if (_capSoftTex) return _capSoftTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); _capSoftTex = new THREE.CanvasTexture(c); return _capSoftTex;
}
const capRingLine = (r, c, o) => { const P = []; for (let k = 0; k <= 128; k++) { const a = k / 128 * TAU; P.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); } return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false })); };
function capSceneBuild(group, V, sp) {
  V.bill = [];
  const h = sp.hole;
  if (h && h.kind === 'star') {
    const hg = new THREE.Group(); hg.position.set(h.x, h.y, h.z); group.add(hg);
    hg.add(new THREE.Mesh(new THREE.SphereGeometry(h.r, 40, 20), new THREE.MeshBasicMaterial({ color: 0xfff2c8, toneMapped: false })));
    const cm = new THREE.ShaderMaterial({ vertexShader: CAP_BILL_VS, uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      fragmentShader: 'uniform float uT; varying vec2 vUv; void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x); float fl = 0.85 + 0.15 * sin(a * 7.0 + uT * 0.7) * sin(a * 3.0 - uT * 0.4); float k = exp(-pow(max(0.0, r - 0.14) / (0.32 * fl), 1.4)); gl_FragColor = vec4(vec3(1.0, 0.78, 0.4) * k, k); }' });
    const corona = new THREE.Mesh(new THREE.PlaneGeometry(h.r * 9, h.r * 9), cm); hg.add(corona); V.bill.push(corona); V.starM = cm;
    hg.add(capRingLine(h.hurt, 0xffc040, 0.75));
    const L = new THREE.PointLight(0xffd8a0, 1.2, 2600, 0.6); hg.add(L); V.light = L;
  }
  if (h && h.kind === 'planet') {
    const hg = new THREE.Group(); hg.position.set(h.x, h.y, h.z); group.add(hg);
    const geo = new THREE.SphereGeometry(h.r, 72, 48), P = geo.getAttribute('position'), col = new Float32Array(P.count * 3), c0 = new THREE.Color(0x3a6aa8), c1 = new THREE.Color(0x8fb4d8), c2 = new THREE.Color(0x2b4f30);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i) / h.r, y = P.getY(i) / h.r, z = P.getZ(i) / h.r, n = Math.sin(x * 7.1 + z * 3.3) * Math.cos(y * 5.7 - x * 2.1) + 0.5 * Math.sin(z * 13 + y * 9);
      const c = n > 0.55 ? c2 : c0.clone().lerp(c1, 0.5 + 0.5 * Math.sin(y * 18 + n * 2)); col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    hg.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })));
    const am = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(vec3(0.4, 0.68, 1.0) * f * 0.75, f * 0.6); }' });
    hg.add(new THREE.Mesh(new THREE.SphereGeometry(h.r + (h.hurt - h.r) * 0.55, 64, 32), am));
    hg.add(capRingLine(h.hurt, 0x6fb0ff, 0.8)); hg.add(capRingLine(h.pull, 0x6fb0ff, 0.3));
  }
  // 星雲：大片柔和的光點（加色混合）
  const neb = terrainList().filter((t) => t.type === 'nebula');
  if (neb.length) {
    const n = neb.length * 70, pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), pal = [[0.55, 0.3, 0.9], [0.2, 0.7, 0.85], [0.85, 0.35, 0.6]];
    let k = 0;
    for (const t of neb) {
      const R = mulberry32(Math.round(t.x * 5 + t.z * 17) >>> 0), base = pal[Math.floor(R() * pal.length)];
      for (let m = 0; m < 70; m++, k++) {
        let a, b, c; do { a = R() * 2 - 1; b = R() * 2 - 1; c = R() * 2 - 1; } while (a * a + b * b + c * c > 1);
        pos.set([t.x + a * t.r * 0.85, (t.y || 0) + b * t.r * 0.45, t.z + c * t.r * 0.85], k * 3);
        const v = 0.25 + R() * 0.35; cl.set([base[0] * v, base[1] * v, base[2] * v], k * 3);
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    group.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 150, map: capSoftTex(), vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
  }
  // 太空站：實體岩塊（st）換成太空站模型
  for (const t of terrainList()) {
    if (t.type !== 'rock' || !t.st) continue;
    fieldGroup.traverse((o) => { if (o.isMesh && o.visible && Math.abs(o.position.x - t.x) < 1 && Math.abs(o.position.z - t.z) < 1 && o.geometry && o.geometry.type !== 'SphereGeometry') { o.visible = false; V.hidden.push(o); } });
    const o = new THREE.Group(); o.position.set(t.x, t.y || 0, t.z); group.add(o); V.station = o;
    const M = V.mats.hull || new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.6, metalness: 0.5 });
    o.add(new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.35, t.r * 0.45, t.r * 1.2, 16), M));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(t.r * 0.85, t.r * 0.08, 10, 48), M); ring.rotation.x = Math.PI / 2; o.add(ring);
    const key = FAC_KEY[SIDE_FAC[1 - CAP.side]] + 's2';
    ensureModels([key]).then(() => {
      if (!CAP.spV || !o.parent) return;
      const G = getModel(key) || getModel('es2'); if (!G) return;
      for (const c of o.children.slice()) { o.remove(c); if (c.geometry) c.geometry.dispose(); }
      const m = new THREE.Mesh(G.lods[0], G.mat); m.userData.shared = true; m.scale.setScalar(t.r * 2.3); o.add(m);
    });
  }
}
function capSceneFrame(V, t) {
  for (const b of V.bill || []) b.quaternion.copy(camera.quaternion);
  if (V.starM) V.starM.uniforms.uT.value = t;
  if (V.station) V.station.rotation.y = t * 0.01;
}
// 新設施的幾何造型：回傳 true＝畫好了
function capUnitGeo(g, add, m) {
  if (g.cu === 'array') {
    add(new THREE.CylinderGeometry(0.35, 0.5, 6, 8), m.hull);
    const dish = add(new THREE.SphereGeometry(3, 20, 10, 0, TAU, 0, Math.PI * 0.32), m.dark, 0, 3.2, 0, Math.PI * 0.6); dish.material = m.dark;
    add(new THREE.BoxGeometry(5.5, 0.1, 1.6), m.glow, 0, -1.6); add(new THREE.SphereGeometry(0.25, 8, 6), m.red, 0, 3.6);
    return true;
  }
  if (g.cu === 'gate') {
    add(new THREE.TorusGeometry(g.r, g.r * 0.09, 10, 56), m.hull);
    add(new THREE.TorusGeometry(g.r * 0.92, g.r * 0.025, 6, 56), m.glow);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; add(new THREE.BoxGeometry(g.r * 0.22, g.r * 0.22, g.r * 0.3), m.dark, Math.cos(a) * g.r, Math.sin(a) * g.r, 0); }
    return true;
  }
  return false;
}
