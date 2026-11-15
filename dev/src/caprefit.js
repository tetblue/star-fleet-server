// ═══════════════════════ 艦長生涯：整修庫（改裝預覽、維修動畫，2026-11-15） ═══════════════════════
// 用戰艦庫（capbay.js）的場景，另外蓋第 6 座機庫（1～5 號是隨機任務的）。
// 改裝：改裝視窗靠右，背景是整修庫；玩家每選一個零件，鏡頭飛到那個位置，天車吊走舊砲塔、放下新的，焊接火花；
//   防禦模組、Mk＝從船尾掃到船頭刷上新塗裝；引擎＝鏡頭到船尾試車；飛彈艙＝天車吊一箱飛彈下來裝進去。沒在播動畫時鏡頭慢慢繞著船。
// 維修：修理後播（設定可以關，播的時候點一下畫面略過）：每艘船的燒焦痕跡一路退掉、機械臂焊接火花、船體百分比跑上去。
const CR = { on: false, mode: '', built: false, ship: null, sig: '', A: null, cam: null, look: null, t0: 0, raf: 0, cap: null, sparks: null, crane: null, arms: [], rep: null, done: null };
const CR_K = 5;                                      // 第 6 座機庫
const CR_DUR = { main: 2.8, tur: 2.8, msl: 2.6, def: 2.3, eng: 2.4, mk: 2.0 };   // 各種安裝動畫的秒數
const CR_REP = 2.4;                                  // 維修動畫：每艘船幾秒
const crNow = () => performance.now() / 1000;
// 版面：整修庫在改裝視窗後面（視窗靠右、背景透明）；維修動畫全螢幕
{ const st = document.createElement('style'); st.textContent = `
  body.cr-on .cb-bg { display: block !important; z-index: 8; }
  body.cr-full .cb-bg { z-index: 40; }
  body.cr-on .sm-modal:has(.cr-side) { background: transparent; justify-content: flex-end; padding-right: 2vw; }
  .sm-box.cr-side { width: min(620px, 46vw); max-width: none; max-height: 92vh; overflow: auto; background: rgba(10,16,26,.9); }
  .cr-cap { position: fixed; left: 24px; bottom: 24px; z-index: 10; max-width: 44vw; padding: 10px 14px; border-radius: 8px; background: rgba(6,10,18,.78); border: 1px solid rgba(242,179,90,.4); color: #e8eef8; font-size: 13px; line-height: 1.7; pointer-events: none; }
  body.cr-full .cr-cap { z-index: 41; font-size: 15px; }
  .cr-cap[hidden] { display: none; }`; document.head.appendChild(st); }
// 星圖、對話框都在 #game 裡（z-index 30 的一層）：整修庫的背景要搬進去，才能夾在星圖（5）和對話框（9）中間
function crHost(on) {
  const host = on ? document.getElementById('game') || document.body : document.body;
  if (CB.wrap && CB.wrap.parentElement !== host) host.appendChild(CB.wrap);
  if (CR.cap && CR.cap.parentElement !== host) host.appendChild(CR.cap);
}
const crEase = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// 整修庫的擺設（全部是 models/機庫 的現成模型）：[名稱, x（相對機庫中線）, z, 轉向, 縮放, 離地, y 縮放]
// 機庫裡：兩側牆邊升降工作台（上面各一座軌道機械臂）、照明塔、加工站、登艦梯、備用的推進器艙、砲塔、飛彈架；外面沿用戰艦庫的擺設
const CR_PROP_SET = [
  ['10_升降工作台', -16, -12, Math.PI / 2, 70, 0.6], ['10_升降工作台', 16, -9, -Math.PI / 2, 70, 0.6],
  ['08_軌道機械臂', -15.5, -12, Math.PI, 70, 8.0], ['08_軌道機械臂', 15.5, -9, 0, 70, 8.0],
  ['13_照明塔A', -17, -27, 0.7, 60, 0.6], ['14_照明塔B', 17, -27, -0.7, 60, 0.6], ['13_照明塔A', 17, 13.5, -2.4, 60, 0.6], ['14_照明塔B', -17, 13.5, 2.4, 60, 0.6],
  ['11_加工站', -14.5, -24, 0.5, 60, 0.6], ['20_小型機械爪', -9.5, -27.5, 0.3, 45, 0.6], ['22_登艦梯', 13.5, -21, Math.PI, 50, 0.6],
  ['12_雙推進器艙', 14, 2.5, -Math.PI / 2, 55, 0.6], ['16_雙管砲塔', 13.5, 9.5, -2.2, 50, 0.6], ['04_飛彈架', -13.5, 4, Math.PI / 2, 75, 0.6], ['15_氣瓶組', -16.5, 10, 0, 70, 0.6],
  ['02_天車', 0, -26.5, 0, 96, 21.7 - 0.133 * 96 * 0.6, 0.6],   // 停在後面的另一台天車（y 縮成 0.6）
];
// 模型上的一點（原始單位）：pick(頂點陣列) 回傳一個點；模型載入後才算得出來
function crPropPt(name, pick) {
  return hgProp(name).then((src) => {
    const v = [], p = new THREE.Vector3(); src.updateMatrixWorld(true);
    src.traverse((o) => { if (!o.isMesh) return; const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i += 3) { p.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); v.push(p.clone()); } });
    return pick(v);
  });
}
const crMean = (a) => a.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, a.length));
// 機械臂工作車：剪式升降車（17）上站一座機械臂（06／07）；整台沿著船邊開到要裝的位置，升降車撐高，臂尖對準
const CR_ARM = { lift: 70, arm: 85, deck: 0.071 };   // 縮放、升降車平台的高度（原始單位）
function crArmUnit(name, side, z) {
  const U = new THREE.Group(), cx = cbX(CR_K); U.position.set(cx + side * 11, 0.6, z); CB.scene.add(U);
  const lift = new THREE.Group(); lift.scale.setScalar(CR_ARM.lift); U.add(lift);
  hgProp('17_剪式升降車').then((s) => lift.add(s.clone(true))).catch(() => {});
  const arm = new THREE.Group(); arm.scale.setScalar(CR_ARM.arm); arm.rotation.y = side < 0 ? 0 : Math.PI; U.add(arm);   // 模型的 +x＝手臂伸出去的方向：朝船
  hgProp(name).then((s) => arm.add(s.clone(true))).catch(() => {});
  const A = { U, lift, arm, side, home: U.position.clone(), tip: new THREE.Vector3(0.04, 0.045, 0), ys: 1, goal: null, ysGoal: 1 };
  crPropPt(name, (v) => { const mx = Math.max(...v.map((p) => p.x)); return crMean(v.filter((p) => p.x > mx - 0.008)); }).then((p) => { A.tip.copy(p); }).catch(() => {});
  CR.arms.push(A); return A;
}
// 臂尖的世界座標
function crArmTip(A, out = new THREE.Vector3()) { A.arm.updateWorldMatrix(true, false); return out.copy(A.tip).applyMatrix4(A.arm.matrixWorld); }
// 讓工作車把臂尖送到 P（世界座標）；P＝null＝回原位
function crArmGo(A, P) {
  if (!P) { A.goal = A.home.clone(); A.ysGoal = 1; return; }
  const u = CR.ship && CR.ship.userData.cr, cx = cbX(CR_K), hw = u ? ((u.bb.max.x - u.bb.min.x) * u.L) / 2 : 5;
  const reach = A.tip.x * CR_ARM.arm, deck = CR_ARM.deck * CR_ARM.lift;
  const x = A.side < 0 ? Math.min(cx - hw - 2.2, P.x - reach) : Math.max(cx + hw + 2.2, P.x + reach);
  A.goal = new THREE.Vector3(Math.max(cx - CB_HALL.hw + 3, Math.min(cx + CB_HALL.hw - 3, x)), 0.6, Math.max(CB_HALL.z0 + 5, Math.min(CB_HALL.z1 - 4, P.z)));
  A.ysGoal = Math.max(0.35, Math.min(2.8, (P.y - 0.6 - A.tip.y * CR_ARM.arm) / deck));
}
function crArmsStep(dt) {
  const k = 1 - Math.exp(-dt * 2.4), deck = CR_ARM.deck * CR_ARM.lift;
  if (!CR.A && CR.crane) crCrane(cbX(CR_K), CR.crane.userData.hookY - 0.4, CB_HALL.z0 + 10, 1 - Math.exp(-dt * 0.8));   // 天車沒事就開回後面停著
  for (const A of CR.arms) {
    if (A.goal) A.U.position.lerp(A.goal, k);
    A.ys += (A.ysGoal - A.ys) * k;
    A.lift.scale.y = CR_ARM.lift * A.ys; A.arm.position.y = deck * A.ys;
    A.arm.rotation.z = A.busy ? Math.sin(crNow() * 3 + A.side) * 0.03 : 0;   // 焊接時手臂微微晃
  }
}
// 焊接火花：從臂尖噴
function crArmSpark(A, n = 6) { const p = crArmTip(A); crSpark(p.x, p.y, p.z, n); }

function crEnsure() {
  cbInit();
  if (CR.built) return;
  CR.built = true;
  cbBuildHangar(CR_K);
  const cx = cbX(CR_K);
  for (const [name, x, z, ry, s, y = 0, sy] of CR_PROP_SET) { const [h] = hgPlaceProps(CB.scene, [[name, cx + x, z, ry, 1, y]], s); if (sy) h.scale.y *= sy; }
  for (const it of CB_PROP_SET) if (it[2] > CB_HALL.z1 || Math.abs(it[1]) > CB_HALL.hw) hgPlaceProps(CB.scene, [[it[0], cx + it[1], it[2], it[3], 1, it[5] || 0]], it[4]);   // 機庫外面的
  crArmUnit('06_機械臂A', -1, -2); crArmUnit('07_機械臂B', 1, -14);
  // 天車（02）：橫跨機庫、掛在屋頂下，沿 z 開到要裝的位置；吊鉤下面一條鋼索吊著砲塔（舊的、新的）或飛彈架
  const g = CR.crane = new THREE.Group(), KY = 0.6, K = 96;
  const cr = new THREE.Group(); cr.scale.set(K, K * KY, K); cr.position.y = CB_HALL.h - 0.3 - 0.133 * K * KY; g.add(cr);
  hgProp('02_天車').then((s) => cr.add(s.clone(true))).catch(() => {});
  g.userData.hookY = cr.position.y; g.userData.cr = cr;
  crPropPt('02_天車', (v) => { const c = v.filter((p) => Math.abs(p.x) < 0.04); const my = Math.min(...c.map((p) => p.y)); return crMean(c.filter((p) => p.y < my + 0.006)); })
    .then((p) => { cr.position.x = -p.x * K; cr.position.z = -p.z * K; g.userData.hookY = cr.position.y + p.y * K * KY; }).catch(() => {});
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.7, roughness: 0.4 }));
  cable.geometry.translate(0, 0.5, 0); cable.visible = false; g.add(cable); g.userData.cable = cable;
  const crate = new THREE.Group(); crate.scale.setScalar(75); crate.visible = false; g.add(crate); g.userData.crate = crate;
  hgProp('04_飛彈架').then((s) => crate.add(s.clone(true))).catch(() => {});
  g.position.set(cx, 0, CB_HALL.z0 + 10); CB.scene.add(g);
  // 焊接火花：一池點（位置、速度在 JS 算）
  const N = 260, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: CB.glowTex || null }));
  pts.frustumCulled = false; CB.scene.add(pts);
  CR.sparks = { pts, pos, col, v: new Float32Array(N * 3), life: new Float32Array(N), n: N, head: 0 };
}
function crSpark(x, y, z, n = 18, hot = 1) {
  const S = CR.sparks; if (!S) return;
  for (let k = 0; k < n; k++) {
    const i = S.head; S.head = (S.head + 1) % S.n;
    S.pos[i * 3] = x; S.pos[i * 3 + 1] = y; S.pos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2, u = Math.random() * 6 + 2;
    S.v[i * 3] = Math.cos(a) * u; S.v[i * 3 + 1] = Math.random() * 7 + 1; S.v[i * 3 + 2] = Math.sin(a) * u;
    S.life[i] = 0.4 + Math.random() * 0.5 * hot;
  }
}
function crSparksStep(dt) {
  const S = CR.sparks; if (!S) return;
  for (let i = 0; i < S.n; i++) {
    if (S.life[i] <= 0) { S.pos[i * 3 + 1] = -999; continue; }
    S.life[i] -= dt; S.v[i * 3 + 1] -= 18 * dt;
    S.pos[i * 3] += S.v[i * 3] * dt; S.pos[i * 3 + 1] += S.v[i * 3 + 1] * dt; S.pos[i * 3 + 2] += S.v[i * 3 + 2] * dt;
    if (S.pos[i * 3 + 1] < 0.7) { S.pos[i * 3 + 1] = 0.7; S.v[i * 3 + 1] *= -0.3; S.v[i * 3] *= 0.6; S.v[i * 3 + 2] *= 0.6; }
    const h = Math.max(0, Math.min(1, S.life[i] * 2)); S.col[i * 3] = 1; S.col[i * 3 + 1] = 0.45 + 0.5 * h; S.col[i * 3 + 2] = 0.15 + 0.6 * h * h;
  }
  S.pts.geometry.attributes.position.needsUpdate = true; S.pts.geometry.attributes.color.needsUpdate = true;
}

// ───── 船：船體＋照模組換的武器＋塗裝層（Mk 條紋、裝甲、燒焦）＋護盾殼＋尾焰 ─────
// 武器模型的鍵與尺寸（同 capfx.js 的 CAP_WLOOK；整修庫不經過 main.js，自己算）
function crWeapon(m, slot, mod) {
  const st = m.hk[0], X = capWKey(st, slot, mod);
  if (!X) return { key: st + 'w' + m.w, m };
  const { L, key } = X;
  return getModel(key) ? { key, m: { ...m, hk: key[0] + m.hk.slice(1), w: +key.slice(2), s: (m.s || 0.1) * L.k } } : { key: st + 'w' + m.w, m };
}
function crMakeShip(c, D, fac) {
  const H = CAP_HULLS[c.key]; if (!H) return null;
  const g = cbMakeShip(c.key, fac); if (!g) return null;
  const body = g.children[0], fk = FAC_KEY[fac] || 'e', key = (getModel(fk + H.look) ? fk : 'e') + H.look, M = getModel(key);
  while (body.children.length > 1) body.remove(body.children[body.children.length - 1]);   // 原廠武器拿掉，照模組重新裝
  const raw = mountsOf(key).filter((m) => getModel(m.hk[0] + 'w' + m.w)), slots = capMountSlots(raw), mounts = [];
  raw.forEach((m0, j) => {
    const sl = slots[j], W = crWeapon(m0, sl, D.mod), Wm = getModel(W.key); if (!Wm) return;
    const o = new THREE.Mesh(Wm.lods[Math.min(1, Wm.lods.length - 1)], Wm.mat); setMountObj(o, W.m); body.add(o);
    const gk = (WEAPON_GK['eamcrib'.indexOf(m0.hk[0])] || '')[m0.w]; mounts.push({ o, slot: sl || (gk === 'x' ? 'msl' : null), key: W.key, home: o.position.clone() });
  });
  const geo = M.lods[0]; if (!geo.boundingBox) geo.computeBoundingBox(); if (!geo.attributes.normal) geo.computeVertexNormals();
  const bb = geo.boundingBox, sp = { mk: Math.max(1, ...Object.values(D.mk || {})), def: (D.mod || {}).def || '', eng: (D.mod || {}).eng || 'std' }, F = FACTION[fac] || FACTION[0];
  const pm = capFxPaintMat(); pm.uniforms.uBmin.value.copy(bb.min); pm.uniforms.uBmax.value.copy(bb.max); pm.uniforms.uCol.value.set(F.ui);
  pm.uniforms.uMk.value = sp.mk; pm.uniforms.uArm.value = sp.def === 'armor' ? 1 : sp.def === 'react' ? 2 : 0;
  const paint = new THREE.Mesh(geo, pm); paint.renderOrder = 3; body.add(paint);
  const shm = capFxShellMat(); shm.uniforms.uCol.value.copy(F.glow); shm.uniforms.uI.value = sp.def === 'shield' ? 0.1 : 0;
  const shell = new THREE.Mesh(capFxGeo().shell, shm), cc = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
  shell.position.copy(cc); shell.scale.set(sz.x * 0.5 * CAP_FX.shell, sz.y * 0.5 * CAP_FX.shell, sz.z * 0.5 * CAP_FX.shell); shell.visible = sp.def === 'shield'; body.add(shell);
  const E = CAP_FX.eng[sp.eng] || CAP_FX.eng.std, fm = capFxFlameMat(); fm.uniforms.uCol.value.copy(E.col ? new THREE.Color(...E.col) : F.glow);
  const flame = new THREE.Mesh(capFxGeo().flame, fm); flame.position.set(cc.x, cc.y, bb.min.z + sz.z * 0.02); flame.visible = false; body.add(flame);
  g.userData.cr = { body, mounts, paint, shell, flame, E, bb, sp, L: body.scale.x };
  return g;
}
// 換成新的設定：重蓋一艘（舊的武器先留著，給吊走的動畫用）
function crSig(c, D) { return c.key + JSON.stringify([D.mod, D.mk]); }
function crPut(c, D, fac) {
  const sig = crSig(c, D) + fac; if (CR.ship && CR.sig === sig) return { same: true };
  const old = CR.ship, g = crMakeShip(c, D, fac); if (!g) return { same: true };
  g.position.set(cbX(CR_K), 0.6, CB_SHIP_Z); CB.scene.add(g);
  CR.ship = g; CR.sig = sig;
  return { old };
}
function crDrop(g) { if (g) CB.scene.remove(g); }
// 船上某些東西的世界座標（鏡頭、天車對準用）
function crWorld(o, v = new THREE.Vector3()) { o.updateWorldMatrix(true, false); return v.setFromMatrixPosition(o.matrixWorld); }
function crShipPt(fz, fy = 1) {   // 船上一點：fz＝從船尾（0）到船頭（1），fy＝0 船底～1 船頂
  const u = CR.ship.userData.cr, b = u.bb, p = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y + (b.max.y - b.min.y) * fy, b.min.z + (b.max.z - b.min.z) * fz);
  return u.body.localToWorld(p);
}

// ───── 改裝：選一個零件就播安裝動畫 ─────
// o＝{ c: 船的記錄, D: 改裝中的設定 { mod, mk }, fac, last: 剛改的槽位（'main'…，Mk 改的是 'mk:main'）, cap: 下方的說明字 }
function crShow(o) {
  crEnsure();
  const first = !CR.on;
  CR.on = true; CR.mode = 'fit';
  crCaption(''); crHost(true);
  document.body.classList.add('cr-on'); CB.wrap.hidden = false; CB.mark.visible = false;
  if (first) { CR.cam = null; CR.t0 = crNow(); requestAnimationFrame(() => cbSize()); }
  const was = CR.ship, P = crPut(o.c, o.D, o.fac);
  crCaption(o.cap || '');
  if (P.same || !o.last) { if (P.old) crDrop(P.old); return; }
  const isMk = o.last.startsWith('mk:'), slot = isMk ? o.last.slice(3) : o.last;
  crAnimStart(isMk ? 'mk' : slot, slot, P.old || was);
}
function crHide() {
  if (!CR.on) return;
  CR.on = false; CR.A = null; document.body.classList.remove('cr-on'); crHost(false);
  if (CB.wrap && !document.querySelector('.cb-screen')) CB.wrap.hidden = true;
  for (const B of CR.arms) { B.busy = false; crArmGo(B, null); }
  crCaption('');
}
// 天車：開到 (x, z)（k＝這一幀走多少），吊的東西（鋼索下端）在高度 y；天車本身一直看得到
function crCrane(x, y, z, k = 1) {
  const C = CR.crane; if (!C) return;
  C.position.x += (x - C.position.x) * k; C.position.z += (z - C.position.z) * k;
  const top = C.userData.hookY, cb = C.userData.cable; cb.position.y = y; cb.scale.y = Math.max(0.05, top - y); cb.visible = top - y > 0.3;
  C.userData.crate.position.y = y - 0.028 * 75;
}
function crCaption(t) {
  if (!CR.cap) { CR.cap = document.createElement('div'); CR.cap.className = 'cr-cap'; document.body.appendChild(CR.cap); }
  CR.cap.innerHTML = t; CR.cap.hidden = !t;
}
function crAnimStart(kind, slot, old) {
  const u = CR.ship.userData.cr, now = crNow();
  if (CR.A && CR.A.old && CR.A.old !== old) crDrop(CR.A.old);
  const A = CR.A = { kind, slot, t0: now, dur: CR_DUR[kind] || 2.4, old, sp: 0 };
  if (kind === 'main' || kind === 'tur') {
    // 舊船的那些砲塔留在場上，等天車吊走；舊船的其他東西藏起來
    A.neu = u.mounts.filter((m) => m.slot === slot);
    A.gone = old ? old.userData.cr.mounts.filter((m) => m.slot === slot).map((m) => m.o) : [];
    if (old) { old.userData.cr.body.children.forEach((ch) => { if (!A.gone.includes(ch)) ch.visible = false; }); }
    for (const m of A.neu) m.o.visible = false;
    const pts = A.neu.length ? A.neu.map((m) => crWorld(m.o)) : [crShipPt(0.6)];
    A.focus = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length); A.pts = pts;
    if (!A.neu.length) A.kind = 'def';   // 這個船型沒有那個槽位的砲塔：改成刷塗裝
  } else {
    if (old) crDrop(old); A.old = null;
    if (kind === 'eng') A.focus = crShipPt(0.02, 0.5);
    else if (kind === 'msl') { const ms = u.mounts.filter((m) => m.slot === 'msl'); A.focus = ms.length ? crWorld(ms[0].o) : crShipPt(0.45); }
    else A.focus = crShipPt(0.5, 0.9);
  }
  if (A.kind === 'def' || A.kind === 'mk') u.paint.material.uniforms.uCut.value = 0;
}
// 每幀：動畫的進度
function crAnimStep(t, dt) {
  const A = CR.A, u = CR.ship && CR.ship.userData.cr; if (!A || !u) return;
  const x = (t - A.t0) / A.dur, C = CR.crane, L = u.L;
  if (A.kind === 'main' || A.kind === 'tur') {
    // 0～.25 吊鉤下來；.25～.45 舊的吊上去；.45～.75 新的放下來；.75～ 焊接
    // 天車開過來（0～.12），鋼索放下來勾住舊砲塔（～.25），吊上去（～.45），換新的放下來（～.75），機械臂焊接（.75～）
    const top = C.userData.hookY, seat = A.focus.y + 1.2, up = Math.min(top - 1, seat + 9);
    C.userData.crate.visible = false;
    if (x < 0.12) crCrane(A.focus.x, top - 0.4, A.focus.z, crEase(x / 0.12));
    else if (x < 0.25) crCrane(A.focus.x, top - (top - seat) * crEase((x - 0.12) / 0.13), A.focus.z);
    else if (x < 0.45) { const k = crEase((x - 0.25) / 0.2); crCrane(A.focus.x, seat + k * (up - seat), A.focus.z); for (const o of A.gone) o.position.y = (o.userData.y0 ??= o.position.y) + (k * (up - seat)) / L; }
    else if (x < 0.75) { if (A.old) { crDrop(A.old); A.old = null; } const k = crEase((x - 0.45) / 0.3); crCrane(A.focus.x, seat + (1 - k) * (up - seat), A.focus.z); for (const m of A.neu) { m.o.visible = true; m.o.position.copy(m.home); m.o.position.y += ((1 - k) * (up - seat)) / L; } }
    else {
      for (const m of A.neu) { m.o.visible = true; m.o.position.copy(m.home); }
      crCrane(A.focus.x, seat + crEase((x - 0.75) / 0.25) * (top - seat), A.focus.z);
      if (t - A.sp > 0.08 && x < 0.97) { A.sp = t; for (const B of CR.arms) if (B.busy) crArmSpark(B, 7); }
    }
    if (!A.armSet) { A.armSet = 1; const p0 = A.pts[0], p1 = A.pts[A.pts.length - 1]; CR.arms.forEach((B) => { B.busy = true; crArmGo(B, B.side < 0 ? p0 : p1); }); }
  } else if (A.kind === 'def' || A.kind === 'mk') {
    const k = crEase(Math.min(1, x / 0.85)); u.paint.material.uniforms.uCut.value = k < 1 ? k * 1.02 : 2;
    // 兩台機械臂沿著船身跟著刷新的那條線走，臂尖噴火花
    for (const B of CR.arms) { B.busy = true; crArmGo(B, crShipPt(Math.min(1, k + 0.04), 0.75)); }
    if (k < 1 && t - A.sp > 0.06) { A.sp = t; for (const B of CR.arms) crArmSpark(B, 5); }
    if (A.kind === 'def' && u.sp.def === 'shield') { u.shell.visible = true; u.shell.material.uniforms.uI.value = 0.1 + Math.max(0, 1 - Math.abs(x - 0.9) * 4) * 0.6; }
  } else if (A.kind === 'eng') {
    // 試車：點火、拉到最大、收回
    const E = u.E, f = u.flame, k = x < 0.2 ? 0 : x < 0.55 ? crEase((x - 0.2) / 0.35) : x < 0.8 ? 1 : 1 - crEase((x - 0.8) / 0.2);
    f.visible = k > 0.01; f.scale.set(E.wid * 1.2, E.wid * 1.2, E.len * 2.2 * k * (1 + Math.sin(t * 40) * E.fl * 0.5)); f.material.uniforms.uI.value = E.I * k;
    if (!A.armSet) { A.armSet = 1; for (const B of CR.arms) { B.busy = false; crArmGo(B, null); } }
  } else if (A.kind === 'msl') {
    // 天車吊一座飛彈架下來，放到飛彈艙上；機械臂接住、裝進去
    const top = C.userData.hookY, seat = A.focus.y + 2.4, cr = C.userData.crate; cr.visible = x < 0.62;
    const y = x < 0.4 ? top - 2 - (top - 2 - seat) * crEase(x / 0.4) : x < 0.6 ? seat - crEase((x - 0.4) / 0.2) * 1.2 : seat + crEase((x - 0.6) / 0.3) * (top - seat);
    crCrane(A.focus.x, y, A.focus.z, x < 0.15 ? crEase(x / 0.15) : 1);
    if (!A.armSet) { A.armSet = 1; CR.arms.forEach((B) => { B.busy = true; crArmGo(B, A.focus); }); }
    if (x > 0.45 && x < 0.8 && t - A.sp > 0.1) { A.sp = t; for (const B of CR.arms) crArmSpark(B, 6); }
  }
  if (x >= 1) { if (A.old) crDrop(A.old); C.userData.crate.visible = false; crCrane(C.position.x, C.userData.hookY - 0.4, C.position.z); for (const B of CR.arms) { B.busy = false; crArmGo(B, null); } u.flame.visible = false; if (u.paint.material.uniforms.uCut.value < 1.5) u.paint.material.uniforms.uCut.value = 2; CR.A = null; CR.idleT = t; }
}

// ───── 維修：修理後播 ─────
// list＝[{ c: 船的記錄, hp: 修之前的船體 }]；done＝播完（或略過）之後
function crRepair(list, fac, done) {
  if (SETTINGS.capRepAnim === false || !list.length) { done && done(); return; }
  crEnsure();
  CR.on = true; CR.mode = 'rep'; CR.cam = null; CR.A = null; CR.done = done;
  CR.rep = { list, k: -1, t0: 0, fac };
  crCaption(''); crHost(true);
  document.body.classList.add('cr-on', 'cr-full'); CB.wrap.hidden = false; CB.mark.visible = false;
  requestAnimationFrame(() => cbSize());
  if (!CR.skipEv) { CR.skipEv = (e) => { if (CR.on && CR.mode === 'rep' && (e.type !== 'keydown' || e.key === 'Escape' || e.key === ' ')) crRepairEnd(); }; window.addEventListener('pointerdown', CR.skipEv, true); window.addEventListener('keydown', CR.skipEv, true); }
  crRepairNext();
}
function crRepairNext() {
  const R = CR.rep; R.k++;
  if (R.k >= R.list.length) { crRepairEnd(); return; }
  const it = R.list[R.k], old = CR.ship;
  CR.sig = ''; crPut(it.c, { mod: it.c.mod || {}, mk: it.c.mk || {} }, R.fac); crDrop(old);
  CR.ship.userData.cr.paint.material.uniforms.uDmg.value = 1 - it.hp;
  R.t0 = crNow(); R.sp = 0; CR.cam = CR.cam || null;
}
function crRepairStep(t) {
  const R = CR.rep, it = R && R.list[R.k], u = CR.ship && CR.ship.userData.cr; if (!it || !u) return;
  const x = (t - R.t0) / CR_REP, k = crEase(Math.min(1, Math.max(0, (x - 0.15) / 0.7))), hp = it.hp + (1 - it.hp) * k;
  u.paint.material.uniforms.uDmg.value = (1 - it.hp) * (1 - k);
  // 兩台機械臂各負責一側，從船尾往船頭修，火花從臂尖噴
  CR.arms.forEach((B, j) => { B.busy = x > 0.1 && x < 0.9; crArmGo(B, B.busy ? crShipPt(Math.min(1, 0.1 + 0.8 * crEase((x - 0.1) / 0.8) + j * 0.05), 0.7) : null); });
  if (x > 0.12 && x < 0.88 && t - R.sp > 0.05) { R.sp = t; for (const B of CR.arms) crArmSpark(B, 6); const p = crShipPt(Math.random(), 0.5 + Math.random() * 0.5); crSpark(p.x, p.y, p.z, 4); }
  crCaption(`<b>修理中</b>　${R.k + 1}／${R.list.length}　${ccShipNm ? ccShipNm(it.c) : CAP_HULLS[it.c.key].name}<br>船體 <b>${Math.round(hp * 100)}%</b><span class="g-dim">　點一下畫面略過</span>`);
  if (x >= 1) crRepairNext();
}
function crRepairEnd() {
  const fn = CR.done; CR.done = null; CR.rep = null;
  document.body.classList.remove('cr-full'); crHide();
  if (CR.ship) { crDrop(CR.ship); CR.ship = null; CR.sig = ''; }
  if (fn) fn();
}

// ───── 每幀：鏡頭、動畫、畫 ─────
const _crP = new THREE.Vector3(), _crL = new THREE.Vector3();
function crClamp(P, cx) {
  const H = CB_HALL;
  P.x = Math.max(cx - H.hw + 1.6, Math.min(cx + H.hw - 1.6, P.x));
  P.y = Math.min(H.h - 2, P.y);   // 屋頂（前緣的艙蓋也往外伸）下面
  P.y = Math.max(1.6, P.y); P.z = Math.max(H.z0 + 2, Math.min(H.z1 + 48, P.z));
}
function crFrame() {
  CR.raf = requestAnimationFrame(crFrame);
  if (!CR.on || !CB.r) return;
  if (CR.mode === 'fit' && !document.querySelector('.cr-side')) { crHide(); return; }   // 改裝視窗關了
  const t = crNow(), dt = Math.min(0.1, t - (CR.tp || t)); CR.tp = t;
  if (!CB.W) cbSize();
  if (CR.mode === 'rep') crRepairStep(t); else crAnimStep(t, dt);
  crSparksStep(dt); crArmsStep(dt);
  const sh = CR.ship, u = sh && sh.userData.cr, C = CB.cam; if (!u) return;
  const hl = sh.userData.hl || 15, mid = (sh.userData.bot + sh.userData.top) / 2, cx = cbX(CR_K);
  // 鏡頭：動畫中＝飛到那個位置（從船外側、斜上方看）；平常＝慢慢繞著船
  if (CR.A && CR.A.focus) {
    // 動畫：從前上方看那個位置（引擎＝從側前方看船尾）
    const f = CR.A.focus, K = CR.A.kind, sx = f.x >= cx ? 1 : -1;
    const dir = K === 'eng' ? new THREE.Vector3(sx, 0.55, 0.35) : K === 'def' || K === 'mk' ? new THREE.Vector3(0.35, 0.5, 1) : new THREE.Vector3(sx, 0.75, 0.3);   // 砲塔：從側上方看（從前面看會被艦橋擋住）
    const d = K === 'eng' ? hl * 0.7 + 8 : K === 'def' || K === 'mk' ? hl * 1.5 + 10 : hl * 0.45 + 12;
    dir.normalize(); _crP.set(f.x + dir.x * d, f.y + dir.y * d, f.z + dir.z * d); _crL.copy(f);
  } else {
    // 平常：在機庫開口前方左右慢慢擺
    const a = Math.sin((t - CR.t0) * 0.12) * 0.42, d = hl * 1.7 + 12;
    _crP.set(cx + Math.sin(a) * d, mid + d * 0.22, CB_SHIP_Z + Math.cos(a) * d); _crL.set(cx, mid, CB_SHIP_Z);
  }
  crClamp(_crP, cx);
  const k = 1 - Math.exp(-dt * 2.6);
  if (!CR.cam) { CR.cam = _crP.clone(); CR.look = _crL.clone(); } else { CR.cam.lerp(_crP, k); CR.look.lerp(_crL, k); }
  // 飛過去的路上不穿過船：在船的範圍裡就抬到船頂上面
  const sd = sh.userData, top = sh.position.y + sd.top + 2.5;
  if (Math.abs(CR.cam.x - cx) < (sd.hw || 6) + 2 && Math.abs(CR.cam.z - CB_SHIP_Z) < hl + 2 && CR.cam.y < top) CR.cam.y = top;
  C.fov = 40; C.near = 0.2;
  C.position.copy(CR.cam); C.lookAt(CR.look);
  const ox = CR.mode === 'fit' ? -CB.W * 0.2 : 0;   // 改裝視窗在右邊：船往左挪
  C.setViewOffset(CB.W, CB.H, -ox, 0, CB.W, CB.H); C.updateProjectionMatrix(); C.updateMatrixWorld();
  CB.r.render(CB.scene, C);
}
if (typeof requestAnimationFrame === 'function') CR.raf = requestAnimationFrame(crFrame);
Object.assign(window.__cap || (window.__cap = {}), { CR, crShow, crHide, crRepair });
