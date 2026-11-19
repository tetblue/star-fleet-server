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

// 整修庫比戰艦庫的機庫大（寬 60、深 70、高 32），船停在中間偏後
const CR_HALL = { hw: 30, z0: -48, z1: 22, h: 32 };
const CR_SHIP_Z = -14;
// 整修庫的擺設（全部是 models/機庫 的現成模型）：[名稱, x（相對機庫中線）, z, 轉向, 縮放, 離地, y 縮放]
// 兩側牆邊：照明塔、加工站、氣瓶、備用零件（推進器艙、砲塔、飛彈架）；後牆：登艦梯、小型機械爪；前方開口兩側：照明塔
const CR_PROP_SET = [
  ['13_照明塔A', -27, -45, 0.7, 75, 0.6], ['14_照明塔B', 27, -45, -0.7, 75, 0.6], ['13_照明塔A', 27, 19, -2.4, 75, 0.6], ['14_照明塔B', -27, 19, 2.4, 75, 0.6],
  ['11_加工站', -26, -36, Math.PI / 2, 70, 0.6], ['15_氣瓶組', -27, -27, 0, 75, 0.6], ['15_氣瓶組', -27, -21.5, 0, 75, 0.6],
  ['12_雙推進器艙', 25, -33, -Math.PI / 2, 60, 0.6], ['16_雙管砲塔', 25, -22, -2.2, 55, 0.6], ['04_飛彈架', 25, 6, -Math.PI / 2, 80, 0.6], ['04_飛彈架', 25, 13, -Math.PI / 2, 80, 0.6],
  ['20_小型機械爪', -24, 8, Math.PI / 2, 60, 0.6], ['22_登艦梯', 8, -43, Math.PI, 60, 0.6], ['22_登艦梯', -8, -43, Math.PI, 60, 0.6],
  ['02_天車', 0, -44, 0, 1, 0, 0],   // 停在後面的另一台天車（x、y 縮放在 crEnsure 照機庫算）
];
const CR_NEW = { '04_飛彈架': '28_飛彈架', '16_雙管砲塔': '29_雙管砲塔', '12_雙推進器艙': '30_雙推進器艙', '22_登艦梯': '31_登艦梯', '13_照明塔A': '32_照明塔A', '14_照明塔B': '33_照明塔B', '11_加工站': '34_加工站', '15_氣瓶組': '35_氣瓶組',
  '01_管制塔': '36_管制塔', '18_物料艙': '37_物料艙', '19_雙聯儲槽': '38_雙聯儲槽', '21_圓頂儲槽': '39_圓頂儲槽' };   // 舊模型 → dev/tools/hangar 重建的
// 新模型是照整修庫裡的大小（公尺）建的：CA_BASE＝對應的舊模型在整修庫用的縮放。別的地方（戰艦庫）用別的縮放時，照比例縮
const CA_BASE = { '04_飛彈架': 85, '16_雙管砲塔': 55, '12_雙推進器艙': 60, '22_登艦梯': 60, '13_照明塔A': 75, '14_照明塔B': 75, '11_加工站': 70, '15_氣瓶組': 75,
  '01_管制塔': 95, '18_物料艙': 70, '19_雙聯儲槽': 85, '21_圓頂儲槽': 85 };   // 這四樣只在戰艦庫旁邊，照那裡的縮放建的
// 當擺設的機械臂的幾個姿勢（手臂的平面跟舊模型一樣，不朝船伸）
const CA_STOW = [{ sh: 70, el: -100, wr: -60 }, { yaw: 12, sh: 86, el: -116, wr: -58, grip: 8 }, { yaw: -10, sh: 60, el: -92, wr: -58, roll: 40 }, { yaw: 6, sh: 78, el: -108, wr: -40, grip: 20 }];
// 不會再動的蒙皮模型：算一次包圍球，看不到的時候就不畫（戰艦庫有五座，每座好幾座機械臂）
function caStill(root) { root.updateMatrixWorld(true); root.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingSphere(); o.frustumCulled = true; } }); }
// 擺一件擺設：有重建過的就用新的，沒有、或新的載入失敗，就用舊的。s＝舊模型在這裡用的縮放；n＝第幾件（機械臂輪流擺不同的姿勢）
//   06／07／08 機械臂 → 一座擺好姿勢的重型機械臂；20 小型機械爪 → 兩座小的重型機械臂；CR_NEW 裡有的 → 對應的新模型
function caPlace(S, name, x, z, ry, s, y = 0, n = 0) {
  const old = () => hgPlaceProps(S, [[name, x, z, ry, 1, y]], s);
  const arm = (G, k, px, pz, rot, pose) => {
    const I = caMake(G), ang = {}; for (const key in G.lim) ang[key] = G.lim[key].rest;
    I.root.scale.setScalar(k); I.root.position.set(px, y, pz); I.root.rotation.y = rot; S.add(I.root); caPose({ G, bones: I.bones, ang: Object.assign(ang, pose) }); caStill(I.root);
  };
  if (/^0[678]_/.test(name)) caSrc().then((G) => arm(G, s / 95, x, z, ry, CA_STOW[n % CA_STOW.length])).catch(old);
  else if (name === '20_小型機械爪') {
    const rot = ry - Math.PI / 2, k = 0.38 * s / 60;
    caSrc().then((G) => [[-1.8, { yaw: 28, sh: 62, el: -112, wr: -30, grip: 22 }], [1.8, { yaw: -22, sh: 96, el: -82, wr: -68, grip: 0 }]]
      .forEach(([d, pose]) => arm(G, k, x + d * Math.sin(rot) * s / 60, z + d * Math.cos(rot) * s / 60, rot, pose))).catch(old);
  } else if (CR_NEW[name] && CA_BASE[name]) caGlb(CR_NEW[name]).then((G) => { const I = caMake(G); I.root.scale.setScalar(s / CA_BASE[name]); I.root.position.set(x, y, z); I.root.rotation.y = ry; S.add(I.root); }).catch(old);
  else old();
}
// 模型上的一點（原始單位）：pick(頂點陣列) 回傳一個點；模型載入後才算得出來
function crPropPt(name, pick) {
  return hgProp(name).then((src) => {
    const v = [], p = new THREE.Vector3(); src.updateMatrixWorld(true);
    src.traverse((o) => { if (!o.isMesh) return; const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i += 3) { p.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); v.push(p.clone()); } });
    return pick(v);
  });
}
const crMean = (a) => a.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, a.length));

// ───── 會彎的機械臂：把現成的機械臂模型（一整塊）切成幾段，各段掛在關節上 ─────
// 關節的位置（模型原始單位，xy 平面；轉軸都是 z）：S 肩、E 肘、W 腕；tip＝工具在手那一段的哪一頭（+1＝x 最大、-1＝x 最小）
// bend＝上臂中間的折點（08 的立柱）；base＝這個高度以下、肩膀附近的三角面是底座（不動，只有上面會轉）
// 每個三角面照它離哪一段最近決定跟哪一段動；關節軸是圓的，轉起來接縫看不出來
const CR_RIG = {
  '06_機械臂A': { S: [-0.0324, 0.0103], E: [-0.0038, 0.0682], W: [0.029, 0.0451], tip: 1 },
  '07_機械臂B': { S: [-0.0346, 0.0112], E: [-0.0089, 0.0689], W: [0.0248, 0.0477], tip: 1 },
  '08_軌道機械臂': { S: [0.041, 0.009], bend: [0.0425, 0.041], E: [0.0147, 0.0541], W: [-0.0131, 0.0295], tip: -1, base: 0.0075 },
};
const CR_RIGS = {};
function crRigSrc(name) {
  return CR_RIGS[name] || (CR_RIGS[name] = hgProp(name).then((src) => {
    const R = CR_RIG[name]; src.updateMatrixWorld(true);
    let mesh = null; src.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); g.applyMatrix4(mesh.matrixWorld);
    const P = g.attributes.position, n = P.count / 3, S = new THREE.Vector2(...R.S), E = new THREE.Vector2(...R.E), W = new THREE.Vector2(...R.W);
    const segD = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
    // 手那一段的尖端：沿著前臂方向最遠的那些頂點
    let T = null; { const d = W.clone().sub(E).normalize(); let best = -1e9; const v = new THREE.Vector2(); for (let i = 0; i < P.count; i++) { v.set(P.getX(i), P.getY(i)); const k = v.clone().sub(W).dot(d); if (k > best) best = k; }
      const pts = []; for (let i = 0; i < P.count; i++) { v.set(P.getX(i), P.getY(i)); if (v.clone().sub(W).dot(d) > best - 0.003) pts.push(v.clone()); } T = pts.reduce((a, p) => a.add(p), new THREE.Vector2()).multiplyScalar(1 / pts.length); }
    const up = R.bend ? [[S, new THREE.Vector2(...R.bend)], [new THREE.Vector2(...R.bend), E]] : [[S, E]];
    const part = new Uint8Array(n), c = new THREE.Vector2(), v2 = new THREE.Vector2();
    for (let t = 0; t < n; t++) {
      let cx = 0, cy = 0; for (let j = 0; j < 3; j++) { cx += P.getX(t * 3 + j); cy += P.getY(t * 3 + j); } c.set(cx / 3, cy / 3);
      if (R.base && c.y < R.base && Math.abs(c.x - S.x) < 0.02) { part[t] = 0; continue; }
      // 三個頂點離那一段最遠的距離最小的那段（長條三角形才不會分到別段）
      const d = [0, 0, 0]; for (let j = 0; j < 3; j++) { v2.set(P.getX(t * 3 + j), P.getY(t * 3 + j)); d[0] = Math.max(d[0], Math.min(...up.map(([a, b]) => segD(v2, a, b)))); d[1] = Math.max(d[1], segD(v2, E, W)); d[2] = Math.max(d[2], segD(v2, W, T)); }
      part[t] = 1 + d.indexOf(Math.min(...d));
    }
    // 每一段一個幾何（頂點移到那一段的關節為原點）
    const piv = [new THREE.Vector2(0, 0), S, E, W];
    const geos = [0, 1, 2, 3].map((k) => {
      const ids = []; for (let t = 0; t < n; t++) if (part[t] === k) ids.push(t);
      if (!ids.length) return null;
      const out = new THREE.BufferGeometry();
      for (const key of Object.keys(g.attributes)) {
        const A = g.attributes[key], sz = A.itemSize, arr = new A.array.constructor(ids.length * 3 * sz);
        ids.forEach((t, i) => { for (let j = 0; j < 3 * sz; j++) arr[i * 3 * sz + j] = A.array[t * 3 * sz + j]; });
        out.setAttribute(key, new THREE.BufferAttribute(arr, sz, A.normalized));
      }
      out.translate(-piv[k].x, -piv[k].y, 0); return out;
    });
    const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
    return { R, geos, mat: mesh.material, S, E, W, T, L1: S.distanceTo(E), L2: E.distanceTo(W), L3: W.distanceTo(T), a1: ang(S, E), a2: ang(E, W), a3: ang(W, T), dir: Math.sign(T.x - S.x) || 1 };
  }));
}
// ───── 重型機械臂（models/機庫/整備庫_24_重型機械臂.glb；由 dev/tools/arm/blender/build_arm.py 在 Blender 裡建的，2026-11-19）─────
// 一個蒙皮網格、14 根骨頭、烘焙貼圖。六段參數動作（yaw／sh／el／wr／roll／grip，每段 1 秒，t＝參數 0～1）：肩、肘的油壓缸對準已經烘在動作裡。
// 這裡不用 AnimationMixer：照每個參數直接從動作的關鍵格取骨頭的轉動。尺寸、關節範圍寫在 GLB 的 extras。
// 這個檔載入失敗的話，退回上面切出來的 TRIPO 機械臂（06／07／08）。
const CA = { src: null, D2R: Math.PI / 180 };
// 用 Blender 腳本建的模型（dev/tools/arm/blender、dev/tools/hangar）：{ scene, clips＝{參數: [每根骨頭的關鍵格]}, lim＝{參數: {min,max,rest}}, X＝檔案裡帶的數字 }
function caGlb(file) {
  return CA[file] || (CA[file] = (async () => {
    const r = await fetch(`models/${encodeURIComponent('機庫')}/${encodeURIComponent(`整備庫_${file}.glb`)}`);
    if (!r.ok) throw new Error(file + '：HTTP ' + r.status);
    if (!MODEL_LOAD.loader) MODEL_LOAD.loader = new GLTFLoader();
    const g = await MODEL_LOAD.loader.parseAsync(await r.arrayBuffer(), '');
    const clips = {}, lim = {}, X = {};
    for (const c of g.animations) clips[c.name.replace('_param', '')] = c.tracks.filter((t) => !t.name.endsWith('.scale')).map((t) => ({ bone: t.name.split('.')[0], pos: t.name.endsWith('.position'), v: t.values, n: t.times.length }));
    g.scene.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; for (const k in o.userData) { const v = o.userData[k]; if (typeof v === 'string') try { X[k] = JSON.parse(v); } catch (e) { /* 不是數字資料 */ } } });
    for (const j of X.joints || []) lim[j.key] = j;
    return { scene: g.scene, clips, lim, X };
  })());
}
function caSrc() {
  return CA.src || (CA.src = caGlb('24_重型機械臂').then((G) => { G.D = G.X.dim; if (!G.D || !G.clips.sh) throw new Error('重型機械臂：檔案裡沒有關節資料'); return G; }));
}
// 一座新的（骨架各自一份，網格與貼圖共用）
function caMake(G) {
  const root = G.scene.clone(true), bones = {}, sk = []; let S = null;
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh) sk.push(o); });
  for (const m of sk) { if (!S) S = new THREE.Skeleton(m.skeleton.bones.map((b) => bones[b.name]), m.skeleton.boneInverses); m.bind(S, m.bindMatrix); m.frustumCulled = false; }
  return { root, bones };
}
const _caQ = [0, 0, 0, 1];
function caPose(C) {
  for (const k in C.G.clips) {
    const L = C.G.lim[k], p = Math.max(0, Math.min(1, (C.ang[k] - L.min) / (L.max - L.min)));
    for (const T of C.G.clips[k]) {
      const f = p * (T.n - 1), i = Math.min(T.n - 2, Math.floor(f)), u = f - i, B = C.bones[T.bone];
      if (T.pos) B.position.set(T.v[i * 3] + (T.v[i * 3 + 3] - T.v[i * 3]) * u, T.v[i * 3 + 1] + (T.v[i * 3 + 4] - T.v[i * 3 + 1]) * u, T.v[i * 3 + 2] + (T.v[i * 3 + 5] - T.v[i * 3 + 2]) * u);   // 會平移的骨頭（升降車的平台、天車的吊車與吊鉤）
      else { THREE.Quaternion.slerpFlat(_caQ, 0, T.v, i * 4, T.v, i * 4 + 4, u); B.quaternion.fromArray(_caQ); }
    }
  }
}
// 反向運動學：工具中心點到世界座標 P，工具往下壓 tilt（弧度）。夾爪收起來當焊槍用
function caAim(C, P, tilt) {
  const D = C.G.D, k = CA.D2R; C.root.updateWorldMatrix(true, false);
  const p = C.root.worldToLocal(P.clone()), r = Math.hypot(p.x, p.z), wx = r - D.L3 * Math.cos(tilt), wy = p.y - D.H + D.L3 * Math.sin(tilt);
  const d0 = Math.hypot(wx, wy), d = Math.max(Math.abs(D.L1 - D.L2) + 1e-3, Math.min(D.L1 + D.L2 - 1e-3, d0));
  const sh = (Math.atan2(wy, wx) + Math.acos((D.L1 * D.L1 + d * d - D.L2 * D.L2) / (2 * D.L1 * d))) / k, el = -(180 - Math.acos((D.L1 * D.L1 + D.L2 * D.L2 - d * d) / (2 * D.L1 * D.L2)) / k);
  C.goal = { yaw: Math.atan2(-p.z, p.x) / k, sh, el, wr: -tilt / k - sh - el, roll: 0, grip: C.G.lim.grip.min + 5 };
  return d0 <= D.L1 + D.L2;
}
function caRest(C, yaw) { C.goal = {}; for (const key in C.G.lim) C.goal[key] = C.G.lim[key].rest; C.goal.yaw = yaw / CA.D2R; }
function caStep(C, k) {
  if (!C.goal) return;
  for (const key in C.goal) { const L = C.G.lim[key]; C.ang[key] += (Math.max(L.min, Math.min(L.max, C.goal[key])) - C.ang[key]) * k; }
  caPose(C);
}

// 一座會彎的機械臂（外面再縮放）。回傳的 A.ok 在模型載入後變 true。
// side＝站在船的哪一邊（-1 左、+1 右；手臂要朝船）。先試重型機械臂（A.ca），沒有那個檔才用切出來的 TRIPO 機械臂（A.rig）
function crRigArm(name, side = -1) {
  const A = { root: new THREE.Group(), yaw: new THREE.Group(), sh: new THREE.Group(), el: new THREE.Group(), wr: new THREE.Group(), ok: false, q: [0, 0, 0, 0], goal: null, rig: null, ca: null };
  A.root.add(A.yaw); A.yaw.add(A.sh); A.sh.add(A.el); A.el.add(A.wr);
  const tower = name.startsWith('08');
  caSrc().then((G) => {
    // 外面是照 TRIPO 模型的原始單位縮放的；重型機械臂的單位是公尺，這裡除回來。08 的手臂朝 −x、06／07 朝 +x，照原本的朝向擺
    const I = caMake(G); I.root.scale.setScalar((tower ? CR_ARM.caT : CR_ARM.ca) / A.root.scale.x); I.root.rotation.y = tower || side > 0 ? Math.PI : 0; A.root.add(I.root);
    A.ca = { G, root: I.root, bones: I.bones, ang: {}, goal: null }; for (const key in G.lim) A.ca.ang[key] = G.lim[key].rest;
    caPose(A.ca); A.ok = true;
  }).catch(() => crRigSrc(name).then((G) => {
    A.rig = G; const m = (k, par) => { if (G.geos[k]) par.add(new THREE.Mesh(G.geos[k], G.mat)); };
    m(0, A.root); A.yaw.position.set(G.S.x, 0, 0); A.sh.position.set(0, G.S.y, 0); m(1, A.sh);
    A.el.position.set(G.E.x - G.S.x, G.E.y - G.S.y, 0); m(2, A.el); A.wr.position.set(G.W.x - G.E.x, G.W.y - G.E.y, 0); m(3, A.wr);
    A.ok = true;
  }).catch(() => {}));
  return A;
}
// 反向運動學：讓工具尖端到世界座標 P；tilt＝工具往下壓的角度。回傳到不到得了
function crRigAim(A, P, tilt = 0.5) {
  if (A.ca) return caAim(A.ca, P, tilt);
  const G = A.rig; if (!G) return false;
  A.root.updateWorldMatrix(true, false);
  const p = A.root.worldToLocal(P.clone()), dx = p.x - G.S.x, dz = p.z, s0 = G.dir;
  const yaw = s0 > 0 ? Math.atan2(-dz, dx) : Math.atan2(dz, -dx);
  const r = Math.hypot(dx, dz) * s0, h = p.y - G.S.y;
  const phi = s0 > 0 ? -tilt : Math.PI + tilt;
  let wx = r - G.L3 * Math.cos(phi), wy = h - G.L3 * Math.sin(phi);
  const d0 = Math.hypot(wx, wy), d = Math.max(Math.abs(G.L1 - G.L2) + 1e-4, Math.min(G.L1 + G.L2 - 1e-4, d0));
  const b = Math.atan2(wy, wx), al = Math.acos((G.L1 * G.L1 + d * d - G.L2 * G.L2) / (2 * G.L1 * d)), ga = Math.acos((G.L1 * G.L1 + G.L2 * G.L2 - d * d) / (2 * G.L1 * G.L2));
  const t1 = b + s0 * al, t2 = t1 - s0 * (Math.PI - ga);
  A.goal = [yaw, t1 - G.a1, t2 - G.a2 - (t1 - G.a1), phi - G.a3 - (t2 - G.a2)];
  return d0 <= G.L1 + G.L2 + G.L3 * 0.1;
}
// 收起來的姿勢：手臂立起來、前臂往前垂
function crRigRest(A, yaw = 0) { if (A.ca) return caRest(A.ca, yaw); A.goal = [yaw, 0.15 * (A.rig ? A.rig.dir : 1), -0.35 * (A.rig ? A.rig.dir : 1), 0]; }
function crRigStep(A, k) {
  if (A.ca) return caStep(A.ca, k);
  if (!A.goal) return;
  for (let j = 0; j < 4; j++) { let d = A.goal[j] - A.q[j]; if (j === 0) d = Math.atan2(Math.sin(d), Math.cos(d)); A.q[j] += d * k; }
  A.yaw.rotation.y = A.q[0]; A.sh.rotation.z = A.q[1]; A.el.rotation.z = A.q[2]; A.wr.rotation.z = A.q[3];
}
function crRigTip(A, out = new THREE.Vector3()) {
  if (A.ca) { const b = A.ca.bones.TCP; b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); }
  const G = A.rig; if (!G) return A.root.getWorldPosition(out);
  A.wr.updateWorldMatrix(true, false); return out.set(G.T.x - G.W.x, G.T.y - G.W.y, 0).applyMatrix4(A.wr.matrixWorld);
}

// 機械臂工作車：剪式升降車（17）上站一座會彎的機械臂（06／07）；整台沿著船邊開到要裝的位置，升降車撐高，手臂彎過去對準
// 固定的機械臂：升降工作台（10）上站一座軌道機械臂（08），搆得到就幫忙
const CR_ARM = { lift: 80, arm: 110, deck: 0.071, tower: 110, tarm: 130, ca: 1.15, caT: 1.5, craneY: 1.0 };   // 縮放、升降車平台的高度（原始單位）；ca、caT＝重型機械臂在工作車上、在升降工作台上的大小（1＝肩高 3.2）
function crArmUnit(name, side, z) {
  const U = new THREE.Group(), cx = cbX(CR_K); U.position.set(cx + side * 16, 0.6, z); CB.scene.add(U);
  const lift = new THREE.Group(); lift.scale.setScalar(CR_ARM.lift); U.add(lift);
  // 新的升降車（25）：真的剪刀架，用 lift 參數（平台地板的高度）驅動；沒有那個檔才用舊的（靠拉長模型升高）
  caGlb('25_剪式升降車').then((G) => { const I = caMake(G); U.add(I.root); A.L = { G, root: I.root, bones: I.bones, ang: { lift: G.lim.lift.rest } }; caPose(A.L); })
    .catch(() => hgProp('17_剪式升降車').then((s) => lift.add(s.clone(true))).catch(() => {}));
  const R = crRigArm(name, side), arm = R.root; arm.scale.setScalar(CR_ARM.arm); U.add(arm);
  const A = { U, lift, arm, R, side, mobile: true, home: U.position.clone(), ys: 1, goal: null, ysGoal: 1, aim: null };
  CR.arms.push(A); return A;
}
function crArmTower(side, z) {
  const cx = cbX(CR_K), x = cx + side * 22, top = 0.1089 * CR_ARM.tower + 0.6;
  // 新的升降工作台（27）：平台夠深，機械臂站在正中間的安裝環上；沒有那個檔才用舊的
  caGlb('27_升降工作台').then((G) => { const I = caMake(G); I.root.position.set(x, 0.6, z); I.root.rotation.y = Math.PI / 2; CB.scene.add(I.root); arm.position.set(x, 0.6 + G.X.top, z); })
    .catch(() => hgPlaceProps(CB.scene, [['10_升降工作台', x, z, Math.PI / 2, 1, 0.6]], CR_ARM.tower));
  const R = crRigArm('08_軌道機械臂', side), arm = R.root; arm.scale.setScalar(CR_ARM.tarm); arm.position.set(x - side * 0.5, top, z);
  // 08 的手臂往 −x 伸：右邊那座不用轉，左邊那座轉半圈朝船
  arm.rotation.y = side < 0 ? Math.PI : 0; CB.scene.add(arm);
  const A = { U: arm, arm, R, side, mobile: false, aim: null };
  CR.arms.push(A); return A;
}
// 臂尖的世界座標
function crArmTip(A, out = new THREE.Vector3()) { return crRigTip(A.R, out); }
// 讓機械臂把工具送到 P（世界座標）；P＝null＝收回去。工作車先開過去、升降車撐到差不多的高度，最後手臂彎過去
function crArmGo(A, P) {
  A.aim = P ? P.clone() : null;
  if (!A.mobile) return;
  if (!P) { A.goal = A.home.clone(); A.ysGoal = 1; return; }
  const u = CR.ship && CR.ship.userData.cr, cx = cbX(CR_K), hw = u ? ((u.bb.max.x - u.bb.min.x) * u.L) / 2 : 5, H = CR_HALL;
  const ca = A.R.ca, reach = ca ? 6.2 * CR_ARM.ca : 0.045 * CR_ARM.arm, deck = CR_ARM.deck * CR_ARM.lift;   // 工作車停在離目標多遠、肩膀要撐多高
  const x = A.side < 0 ? Math.min(cx - hw - 2.5, P.x - reach) : Math.max(cx + hw + 2.5, P.x + reach);
  A.goal = new THREE.Vector3(Math.max(cx - H.hw + 4, Math.min(cx + H.hw - 4, x)), 0.6, Math.max(H.z0 + 6, Math.min(H.z1 - 4, P.z)));
  A.ysGoal = Math.max(0.35, Math.min(3, (P.y - 0.6 - (ca ? 3.4 * CR_ARM.ca : 0.04 * CR_ARM.arm)) / deck));
}
function crArmsStep(dt) {
  const k = 1 - Math.exp(-dt * 2.4), deck = CR_ARM.deck * CR_ARM.lift, kq = 1 - Math.exp(-dt * 3.2), t = crNow();
  if (!CR.A && CR.crane) crCrane(cbX(CR_K), CR.crane.userData.hookY - 0.4, CR_HALL.z0 + 12, 1 - Math.exp(-dt * 0.8));   // 天車沒事就開回後面停著
  for (const A of CR.arms) {
    if (A.mobile) {
      if (A.goal) A.U.position.lerp(A.goal, k);
      A.ys += (A.ysGoal - A.ys) * k;
      if (A.L) { const J = A.L.G.lim.lift, h = Math.max(J.min, Math.min(J.max, deck * A.ys)); A.L.ang.lift = h; caPose(A.L); A.arm.position.y = h; }
      else { A.lift.scale.y = CR_ARM.lift * A.ys; A.arm.position.y = deck * A.ys; }
    }
    // 手臂：有目標＝彎過去（焊接時臂尖小幅畫圈）；沒有＝收起來，朝船
    if (A.aim) {
      const P = A.busy ? _crW.copy(A.aim).add(_crV.set(Math.sin(t * 5 + A.side) * 0.25, Math.cos(t * 7) * 0.2, Math.cos(t * 5) * 0.25)) : A.aim;
      crRigAim(A.R, P, 0.55);
    } else crRigRest(A.R);
    crRigStep(A.R, kq);
  }
}
const _crW = new THREE.Vector3(), _crV = new THREE.Vector3();
// 焊接火花：從臂尖噴（手臂還沒到位就不噴）
function crArmSpark(A, n = 6) { const p = crArmTip(A); if (A.aim && p.distanceTo(A.aim) > 2.5) return; crSpark(p.x, p.y, p.z, n); }

function crEnsure() {
  cbInit();
  if (CR.built) return;
  CR.built = true;
  cbBuildHangar(CR_K, CR_HALL);
  const cx = cbX(CR_K), H = CR_HALL, CW = 0.3746, KY = 0.6, K = 120, KX = (H.hw * 2 - 1) / CW;   // 天車：橫跨整座機庫（模型寬 0.3746）
  for (const [name, x, z, ry, s, y = 0, sy] of CR_PROP_SET) {
    if (name === '02_天車') {   // 停在後面的另一台：新的天車（26）照機庫的跨度建，不用拉寬；沒有那個檔才用舊的
      caGlb('26_天車').then((G) => { const I = caMake(G); I.root.position.set(cx + x, H.h - CR_ARM.craneY, z); CB.scene.add(I.root); caPose({ G, bones: I.bones, ang: { trolley: 14, hook: 0 } }); })
        .catch(() => { const [h] = hgPlaceProps(CB.scene, [[name, cx + x, z, ry, 1, H.h - 0.3 - 0.133 * K * KY]], 1); h.scale.set(KX, K * KY, K); });
      continue;
    }
    if (name === '20_小型機械爪') {   // 牆邊的小機械爪：兩座縮小的重型機械臂，各擺一個姿勢；沒有那個檔才用舊的
      caSrc().then((G) => [[-1.8, { yaw: 28, sh: 62, el: -112, wr: -30, grip: 22 }], [1.8, { yaw: -22, sh: 96, el: -82, wr: -68, grip: 0 }]].forEach(([dz, pose]) => {
        const I = caMake(G), ang = {}; for (const key in G.lim) ang[key] = G.lim[key].rest;
        I.root.scale.setScalar(0.38); I.root.position.set(cx + x, y, z + dz); I.root.rotation.y = x < 0 ? 0 : Math.PI; CB.scene.add(I.root); caPose({ G, bones: I.bones, ang: Object.assign(ang, pose) });
      })).catch(() => hgPlaceProps(CB.scene, [[name, cx + x, z, ry, 1, y]], s));
      continue;
    }
    const old = () => { const [h] = hgPlaceProps(CB.scene, [[name, cx + x, z, ry, 1, y]], s); if (sy) h.scale.y *= sy; };
    // 重建過的靜態物件（單位是公尺，不用縮放；尺寸、朝向跟舊模型一樣）；沒有那個檔才用舊的
    if (CR_NEW[name]) caGlb(CR_NEW[name]).then((G) => { const I = caMake(G); I.root.position.set(cx + x, y, z); I.root.rotation.y = ry; CB.scene.add(I.root); }).catch(old);
    else old();
  }
  for (const it of CB_PROP_SET) if (it[2] > H.z1 + 6 || Math.abs(it[1]) > H.hw + 6) caPlace(CB.scene, it[0], cx + (Math.abs(it[1]) > CB_HALL.hw + 6 ? it[1] + Math.sign(it[1]) * (H.hw - CB_HALL.hw) : it[1] * (H.hw / CB_HALL.hw)), it[2] + (H.z1 - CB_HALL.z1), it[3], it[4], it[5] || 0);   // 牆外的＝離牆的距離不變（管制塔的平台要接到牆上）   // 機庫外面的（跟著機庫的大小往外挪）
  crArmUnit('06_機械臂A', -1, CR_SHIP_Z + 4); crArmUnit('07_機械臂B', 1, CR_SHIP_Z - 8);
  crArmTower(-1, CR_SHIP_Z - 12); crArmTower(1, CR_SHIP_Z - 2);
  // 天車（02）：橫跨機庫、掛在屋頂下，沿 z 開到要裝的位置；吊鉤下面一條鋼索吊著砲塔（舊的、新的）或飛彈架
  const g = CR.crane = new THREE.Group();
  const cr = new THREE.Group(); cr.scale.set(KX, K * KY, K); cr.position.y = H.h - 0.3 - 0.133 * K * KY; g.add(cr);
  g.userData.hookY = cr.position.y; g.userData.cr = cr;
  // 新的天車（26）：樑留在機庫中線，吊車沿著樑走、吊鉤升降（參數 trolley、hook），鋼索在模型裡；沒有那個檔才用舊的
  caGlb('26_天車').then((G) => { const I = caMake(G); I.root.position.y = H.h - CR_ARM.craneY; g.add(I.root); g.userData.N = { G, root: I.root, bones: I.bones, ang: { trolley: 0, hook: 0 } }; g.userData.hookY = I.root.position.y + G.X.hook_y; caPose(g.userData.N); })
    .catch(() => {
      hgProp('02_天車').then((s) => cr.add(s.clone(true))).catch(() => {});
      crPropPt('02_天車', (v) => { const c = v.filter((p) => Math.abs(p.x) < 0.04); const my = Math.min(...c.map((p) => p.y)); return crMean(c.filter((p) => p.y < my + 0.006)); })
    .then((p) => { cr.position.x = -p.x * KX; cr.position.z = -p.z * K; g.userData.hookY = cr.position.y + p.y * K * KY; }).catch(() => {});
    });
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.7, roughness: 0.4 }));
  cable.geometry.translate(0, 0.5, 0); cable.visible = false; g.add(cable); g.userData.cable = cable;
  const crate = new THREE.Group(); crate.scale.setScalar(85); crate.visible = false; g.add(crate); g.userData.crate = crate;
  caGlb(CR_NEW['04_飛彈架']).then((G) => { const I = caMake(G); I.root.scale.setScalar(1 / 85); crate.add(I.root); })   // 外面那層是照舊模型縮放 85 的，新的除回來
    .catch(() => hgProp('04_飛彈架').then((s) => crate.add(s.clone(true))).catch(() => {}));
  g.position.set(cx, 0, H.z0 + 12); CB.scene.add(g);
  // 焊接火花：一池點（位置、速度在 JS 算）
  const N = 320, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), geo = new THREE.BufferGeometry();
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
  const W0 = CAP_FX.wpn ? { main: (D.mod || {}).main, tur: (D.mod || {}).tur } : {};   // 武器模型照配置換（CAP_FX.wpn）
  if (!CAP_FX.look) D = { mod: {}, mk: {} };   // 其他升級的外觀關著：塗裝、尾焰、護盾殼照原廠的樣子
  const H = CAP_HULLS[c.key]; if (!H) return null;
  const g = cbMakeShip(c.key, fac); if (!g) return null;
  const body = g.children[0], fk = FAC_KEY[fac] || 'e', key = (getModel(fk + H.look) ? fk : 'e') + H.look, M = getModel(key);
  while (body.children.length > 1) body.remove(body.children[body.children.length - 1]);   // 原廠武器拿掉，照模組重新裝
  const raw = mountsOf(key).filter((m) => getModel(m.hk[0] + 'w' + m.w)), slots = capMountSlots(raw), mounts = [];
  raw.forEach((m0, j) => {
    const sl = slots[j], W = crWeapon(m0, sl, CAP_FX.look ? D.mod : W0), Wm = getModel(W.key); if (!Wm) return;
    const o = new THREE.Mesh(Wm.lods[Math.min(1, Wm.lods.length - 1)], Wm.mat); setMountObj(o, W.m); body.add(o);
    const gk = (WEAPON_GK['eamcrib'.indexOf(m0.hk[0])] || '')[m0.w]; mounts.push({ o, slot: sl || (gk === 'x' ? 'msl' : null), key: W.key, home: o.position.clone() });
  });
  const geo = M.lods[0]; if (!geo.boundingBox) geo.computeBoundingBox(); if (!geo.attributes.normal) geo.computeVertexNormals();
  const bb = geo.boundingBox, sp = { mk: Math.max(1, ...Object.values(D.mk || {})), def: (D.mod || {}).def || '', eng: (D.mod || {}).eng || 'std' }, F = FACTION[fac] || FACTION[0];
  const pm = capFxPaintMat(); pm.uniforms.uBmin.value.copy(bb.min); pm.uniforms.uBmax.value.copy(bb.max); pm.uniforms.uCol.value.set(F.ui);
  capFxSetPaint(pm, D.mod, sp.mk, sp.def);
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
  g.position.set(cbX(CR_K), 0.6, CR_SHIP_Z); CB.scene.add(g);
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
  const N = C.userData.N;   // 新的天車：C 的位置是「吊鉤在哪」，樑往回挪到機庫中線，差的那一段由吊車走
  if (N) { const cx = cbX(CR_K), J = N.G.lim; N.root.position.x = cx - C.position.x; N.ang.trolley = Math.max(J.trolley.min, Math.min(J.trolley.max, C.position.x - cx)); N.ang.hook = Math.max(0, Math.min(J.hook.max, top - y)); caPose(N); cb.visible = false; }
  C.userData.crate.position.y = y - 0.028 * 85;
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
  u.paint.material.uniforms.uCut.value = 0;   // 新的塗裝樣式：動畫裡從船尾刷到船頭
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
  if (A.kind !== 'def' && A.kind !== 'mk') {   // 換砲＝裝好之後刷塗裝；引擎、飛彈艙＝邊裝邊刷
    const [a, b] = A.kind === 'main' || A.kind === 'tur' ? [0.72, 0.97] : [0.15, 0.85], k = (x - a) / (b - a);
    u.paint.material.uniforms.uCut.value = k <= 0 ? 0 : k >= 1 ? 2 : crEase(k) * 1.02;
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
  const H = CR_HALL;
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
    const d = K === 'eng' ? hl * 0.7 + 8 : K === 'def' || K === 'mk' ? hl * 1.5 + 10 : hl * 0.7 + 18;
    dir.normalize(); _crP.set(f.x + dir.x * d, f.y + dir.y * d, f.z + dir.z * d); _crL.copy(f);
  } else {
    // 平常：在機庫開口前方左右慢慢擺
    const a = Math.sin((t - CR.t0) * 0.12) * 0.42, d = hl * 1.7 + 12;
    _crP.set(cx + Math.sin(a) * d, mid + d * 0.22, CR_SHIP_Z + Math.cos(a) * d); _crL.set(cx, mid, CR_SHIP_Z);
  }
  if (CR.over) { _crP.set(cx + CR.over[0], CR.over[1], CR.over[2]); _crL.set(cx + CR.over[3], CR.over[4], CR.over[5]); }   // 截圖用的固定鏡頭（相對機庫中線）
  else crClamp(_crP, cx);
  const k = CR.over ? 1 : 1 - Math.exp(-dt * 2.6);
  if (!CR.cam) { CR.cam = _crP.clone(); CR.look = _crL.clone(); } else { CR.cam.lerp(_crP, k); CR.look.lerp(_crL, k); }
  // 飛過去的路上不穿過船：在船的範圍裡就抬到船頂上面
  const sd = sh.userData, top = sh.position.y + sd.top + 2.5;
  if (!CR.over && Math.abs(CR.cam.x - cx) < (sd.hw || 6) + 2 && Math.abs(CR.cam.z - CR_SHIP_Z) < hl + 2 && CR.cam.y < top) CR.cam.y = top;
  C.fov = 40; C.near = 0.2;
  C.position.copy(CR.cam); C.lookAt(CR.look);
  const ox = CR.mode === 'fit' ? -CB.W * 0.2 : 0;   // 改裝視窗在右邊：船往左挪
  C.setViewOffset(CB.W, CB.H, -ox, 0, CB.W, CB.H); C.updateProjectionMatrix(); C.updateMatrixWorld();
  cbRender(C);   // 跟戰艦庫一樣描邊（capbay.js）
}
if (typeof requestAnimationFrame === 'function') CR.raf = requestAnimationFrame(crFrame);
Object.assign(window.__cap || (window.__cap = {}), { CR, CB, crShow, crHide, crRepair, crEnsure, crMakeShip, crRigArm, crRigAim, crRigStep, crRigTip, THREE, hgProp, getModel });   // THREE、hgProp、getModel：測試腳本用
