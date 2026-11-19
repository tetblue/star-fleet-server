// 機械臂 demo 的場景與操作：自動作業（把砲塔從輸送架搬到裝配平台，再搬回來）、手動（每個關節一條滑桿）、拖曳目標（反向運動學）。
// 手臂本體在 machine.js，檢查與匯出在 checks.js；這裡只管場景、介面、示範動作。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildArm, JOINTS, JMAP, DIM } from './machine.js';
import { runCheck, exportGlb, verifyGlb, colliderHelpers } from './checks.js';

const D = Math.PI / 180, $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1e26); scene.fog = new THREE.Fog(0x1a1e26, 40, 90);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 300); camera.position.set(11.5, 7.5, 12.5);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(1.2, 3.0, 0); orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.495; orbit.update();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ── 場地：地板、格線、作業半徑的黃線 ──
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x20242c, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(9, 16, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 }); sun.shadow.bias = -0.0004; scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x2b313b, roughness: 0.85, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(60, 30, 0x46536a, 0x363f4e); grid.position.y = 0.004; scene.add(grid);
for (const [r0, r1, c] of [[7.55, 7.68, 0xe0b020], [2.05, 2.12, 0xe0b020]]) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), new THREE.MeshBasicMaterial({ color: c })); m.rotation.x = -Math.PI / 2; m.position.y = 0.008; scene.add(m); }

// ── 手臂 ──
const M = buildArm(); scene.add(M.root);

// ── Blender 版（blender/build_arm.py 建的 arm_blender.glb）：一個蒙皮網格＋烘焙貼圖，用六段參數動作擺姿勢 ──
// 位置還是 machine.js 算（兩邊尺寸、骨頭同名）；這裡只把每段動作 seek 到 t＝參數值。沒有這個檔就只顯示程式碼版。
let BL = null, useBL = false;
async function loadBlender() {
  const g = await new GLTFLoader().loadAsync('/out/arm_blender.glb?' + Date.now());
  g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(g.scene), acts = {};
  for (const c of g.animations) { const a = mixer.clipAction(c); a.play(); a.paused = true; acts[c.name] = a; }
  scene.add(g.scene); BL = { scene: g.scene, mixer, acts, clips: g.animations }; setVer(true);
}
function poseBlender() { if (!BL) return; for (const j of JOINTS) { const a = BL.acts[j.key + '_param']; if (a) a.time = M.param(j.key) * a.getClip().duration; } BL.mixer.update(0); }
function setVer(b) { useBL = !!(b && BL); if (BL) BL.scene.visible = useBL; M.root.visible = !useBL; $('b-ver').textContent = useBL ? 'Blender 版' : '程式碼版'; $('b-ver').classList.toggle('on', useBL); $('ttl').textContent = useBL ? '重型機械臂（Blender 腳本建模）' : '重型機械臂（three.js 程式碼建模）'; }
// 用動作擺姿勢，跟 machine.js 的骨頭位置比（兩套各自寫的運動學要對得上）
function verifyBlender() {
  if (!BL) return null; const keep = { ...M.ang }, a = new THREE.Vector3(), b = new THREE.Vector3(); let err = 0, worst = '', n = 0;
  const names = Object.keys(M.bones).filter((k) => BL.scene.getObjectByName(k));
  for (let i = 0; i < 40; i++) {
    for (const [k, j] of JOINTS.entries()) M.setParam(j.key, i < 2 ? i : (i * 0.618 + k * 0.37) % 1);
    M.pose(); M.root.updateMatrixWorld(true); poseBlender(); BL.scene.updateMatrixWorld(true);
    for (const nm of names) { a.setFromMatrixPosition(M.bones[nm].matrixWorld); b.setFromMatrixPosition(BL.scene.getObjectByName(nm).matrixWorld); const d = a.distanceTo(b); n++; if (d > err) { err = d; worst = nm; } }
  }
  Object.assign(M.ang, keep); M.pose(); poseBlender();
  let tris = 0; BL.scene.traverse((o) => { if (o.isMesh) tris += o.geometry.index.count / 3; });
  return { bones: names.length, poses: 40, compared: n, max_bone_err_mm: +(err * 1000).toFixed(4), worst, tris, clips: BL.clips.map((c) => ({ name: c.name, duration: +c.duration.toFixed(4), tracks: c.tracks.map((t) => t.name) })), pass: err < 0.0005 && names.length >= 14 };
}

// ── 遊戲裡現成的整備庫元件：輸送架（A 點）、裝配平台（B 點）、雙管砲塔（要搬的東西）──
const loader = new GLTFLoader();
async function prop(name, size) {   // size＝最長邊縮放到幾公尺
  const g = await loader.loadAsync(`/models/${encodeURIComponent('機庫')}/${encodeURIComponent(`整備庫_${name}.glb`)}`);
  g.scene.traverse((o) => { if (o.isMesh) { o.material.metalness = 0.45; o.material.roughness = 0.55; o.castShadow = o.receiveShadow = true; } });
  const b = new THREE.Box3().setFromObject(g.scene), s = b.getSize(new THREE.Vector3()), k = size / Math.max(s.x, s.z);
  const hold = new THREE.Group(); hold.add(g.scene); hold.scale.setScalar(k);
  return { obj: hold, k, w: s.x * k, h: s.y * k, d: s.z * k };
}
function fallback(w, h, d, color) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.6 })); m.position.y = h / 2; m.castShadow = m.receiveShadow = true; const g = new THREE.Group(); g.add(m); return { obj: g, k: 1, w, h, d }; }
const SPOT = { A: { yaw: 58, r: 5.5 }, B: { yaw: -62, r: 5.3 } };
const spotPos = (s, y = 0) => new THREE.Vector3(s.r * Math.cos(s.yaw * D), y, -s.r * Math.sin(s.yaw * D));

// ── 示範動作：時間的函數（同一個 t 永遠是同一個姿勢，檢查才能重放）──
let demo = null, cargo = null;
function makeDemo(A, B, gH) {
  M.rest().pose(); const hp = M.tcp(), home = { yaw: 0, r: Math.hypot(hp.x, hp.z), y: hp.y };
  // [時間, 迴轉角, 距離, 高度, 腕旋轉, 夾爪]
  const K = [
    [0, home.yaw, home.r, home.y, 0, 1], [2.2, A.yaw, A.r, A.y + 1.6, 0, 1], [3.4, A.yaw, A.r, A.y, 0, 1], [4.2, A.yaw, A.r, A.y, 0, gH], [5.4, A.yaw, A.r, A.y + 1.9, 0, gH],
    [8.6, B.yaw, B.r, B.y + 1.9, 90, gH], [9.8, B.yaw, B.r, B.y, 90, gH], [10.6, B.yaw, B.r, B.y, 90, 1], [11.8, B.yaw, B.r, B.y + 1.6, 90, 1], [14.0, home.yaw, home.r, home.y, 0, 1], [14.6, home.yaw, home.r, home.y, 0, 1],
  ];
  const Tc = K[K.length - 1][0], tGrab = 4.1, tRel = 9.9;
  const tau = (t) => { t = ((t % (2 * Tc)) + 2 * Tc) % (2 * Tc); return t < Tc ? t : 2 * Tc - t; };
  return {
    T: 2 * Tc, Tc, tGrab, tRel, reach: true,
    apply(t) {
      const u = tau(t); let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
      const a = K[i], b = K[i + 1], x = Math.max(0, Math.min(1, (u - a[0]) / (b[0] - a[0]))), s = x * x * (3 - 2 * x), L = (k) => a[k] + (b[k] - a[k]) * s;
      this.reach = M.ikPolar(L(1), L(2), L(3), -90); M.set('roll', L(4)).setParam('grip', L(5)).pose();
    },
    // 砲塔在哪：第一趟（A→B）跟第二趟（倒著走，B→A）
    state(t) { t = ((t % (2 * Tc)) + 2 * Tc) % (2 * Tc); const u = tau(t), held = u > tGrab && u < tRel; return { held, at: held ? 'hand' : (t < Tc ? (u <= tGrab ? 'A' : 'B') : (u >= tRel ? 'B' : 'A')) }; },
  };
}
const cargoM = { A: new THREE.Matrix4(), B: new THREE.Matrix4(), local: new THREE.Matrix4() };
async function setupProps() {
  const [rack, plat, tur] = await Promise.all([
    prop('03_輸送架', 2.6).catch(() => fallback(2.6, 1.0, 1.0, 0x5a6578)), prop('09_裝配平台', 3.2).catch(() => fallback(3.0, 0.9, 3.2, 0x5a6578)), prop('16_雙管砲塔', 1.5).catch(() => fallback(1.5, 0.55, 0.95, 0xc0c8d4)),
  ]);
  rack.obj.position.copy(spotPos(SPOT.A)); rack.obj.rotation.y = SPOT.A.yaw * D + Math.PI / 2; scene.add(rack.obj);
  plat.obj.position.copy(spotPos(SPOT.B)); plat.obj.rotation.y = SPOT.B.yaw * D; scene.add(plat.obj);
  cargo = tur.obj; cargo.matrixAutoUpdate = false; scene.add(cargo);
  // 夾爪夾住時的開度：爪尖離手的中心線＝砲塔窄邊的一半
  const half = Math.min(tur.w, tur.d) / 2 + 0.02; let a = JMAP.grip.min; while (a < JMAP.grip.max && DIM.clawR + 0.95 * Math.sin(a * D) - 0.05 * Math.cos(a * D) < half) a += 0.25;
  const gH = (a - JMAP.grip.min) / (JMAP.grip.max - JMAP.grip.min), lift = tur.h * 0.5;
  const A = { ...SPOT.A, y: rack.h + lift }, B = { ...SPOT.B, y: plat.h + lift };
  demo = makeDemo(A, B, gH);
  cargoM.A.compose(spotPos(SPOT.A, rack.h), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SPOT.A.yaw * D), new THREE.Vector3().setScalar(tur.k));
  demo.apply(demo.tGrab); M.root.updateMatrixWorld(true); cargoM.local.copy(M.bones.Hand.matrixWorld).invert().multiply(cargoM.A);
  demo.apply(demo.tRel); M.root.updateMatrixWorld(true); cargoM.B.multiplyMatrices(M.bones.Hand.matrixWorld, cargoM.local);
  // 示範動作的每一格角度存下來：Blender 那邊的互穿檢查（三角面對三角面）也要跑這段動作
  const poses = []; for (let i = 0; i < 240; i++) { demo.apply(demo.T * i / 240); poses.push({ ...M.ang }); }
  fetch('/out/demo_poses.json', { method: 'POST', body: JSON.stringify(poses) }).catch(() => {});
  M.rest().pose();
}
function placeCargo(t) {
  if (!cargo || !demo) return; const s = mode === 'auto' ? demo.state(t) : { at: lastAt };
  if (s.at === 'hand') { M.root.updateMatrixWorld(true); cargo.matrix.multiplyMatrices(M.bones.Hand.matrixWorld, cargoM.local); } else { cargo.matrix.copy(cargoM[s.at]); lastAt = s.at; }
  cargo.matrixWorldNeedsUpdate = true;
}

// ── 介面 ──
let mode = 'auto', paused = false, time = 0, lastAt = 'A', helpers = null;
const sl = {};
for (const j of JOINTS) {
  const row = document.createElement('div'); row.className = 'j'; row.innerHTML = `<span>${j.name}</span><input type="range" min="0" max="1" step="0.001"><span></span>`;
  $('joints').appendChild(row); const inp = row.children[1]; sl[j.key] = { inp, val: row.children[2] };
  inp.addEventListener('input', () => { if (mode !== 'manual' && !(mode === 'ik' && (j.key === 'roll' || j.key === 'grip'))) setMode('manual'); M.setParam(j.key, +inp.value).pose(); });
}
const target = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshBasicMaterial({ color: 0x40e080 })); target.visible = false; scene.add(target);
const tc = new TransformControls(camera, renderer.domElement); tc.setSize(0.8); tc.attach(target); tc.visible = tc.enabled = false; scene.add(tc);
tc.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
function setMode(m) {
  mode = m; for (const k of ['auto', 'manual', 'ik']) $('m-' + k).classList.toggle('on', k === m);
  const ik = m === 'ik'; target.visible = tc.visible = tc.enabled = ik; $('phi-row').style.display = ik ? '' : 'none'; $('b-pause').style.display = m === 'auto' ? '' : 'none';
  if (ik) { M.tcp(target.position); $('phi').value = Math.max(-90, Math.min(0, Math.round(M.ang.sh + M.ang.el + M.ang.wr))); }
}
for (const k of ['auto', 'manual', 'ik']) $('m-' + k).onclick = () => setMode(k);
$('b-pause').onclick = () => { paused = !paused; $('b-pause').textContent = paused ? '繼續' : '暫停'; $('b-pause').classList.toggle('on', paused); };
$('phi').oninput = () => { $('phi-v').textContent = $('phi').value + '°'; };
$('b-ver').onclick = () => setVer(!useBL);
$('b-col').onclick = () => { if (useBL) setVer(false); if (helpers) { helpers.forEach((h) => h.parent.remove(h)); helpers = null; } else helpers = colliderHelpers(M); $('b-col').classList.toggle('on', !!helpers); };
const post = (name, body) => fetch('/out/' + name, { method: 'POST', body }).catch(() => {});
const mark = (ok) => (ok ? '<span class="ok">✔</span>' : '<span class="bad">✘</span>');
async function doCheck() {
  $('res').textContent = '檢查中…'; await new Promise((r) => setTimeout(r, 30));
  const R = runCheck(M, demo), sw = R.sweeps.filter((s) => s.clashing);
  let h = `${mark(R.pass)} <b>${R.pass ? '全部通過' : '有問題'}</b>（${R.colliders} 個碰撞盒，${R.ms} ms）\n`;
  h += `${mark(!sw.length)} 單一關節掃過整個範圍：${sw.length ? sw.map((s) => `${JMAP[s.joint].name} ${s.clashing} 格互穿（${s.first.pair}）`).join('；') : '6 個關節 × 61 格，0 互穿'}\n`;
  for (const [k, n] of [['sh', '肩'], ['el', '肘']]) { const a = R.actuators[k]; h += `${mark(a.ok)} ${n}油壓缸：行程 ${a.stroke[0]}～${a.stroke[1]} m，活塞桿最少還有 ${a.rod_inside_min} m 在缸筒裡\n`; }
  h += `${mark(R.clamp)} 參數超出 0～1 會夾住\n${mark(R.ik.max_err_mm < 0.01)} 反向運動學：${R.ik.reachable} 個到得了的目標，最大誤差 ${R.ik.max_err_mm} mm\n`;
  if (R.demo) h += `${mark(!R.demo.clashing && !R.demo.floor)} 示範動作 ${R.demo.samples} 格：互穿 ${R.demo.clashing}、撞地板 ${R.demo.floor}${R.demo.first ? `（${R.demo.first.pair}，t=${R.demo.first.t}）` : ''}\n`;
  h += `<span class="k">參考：肩×肘×腕 ${R.grid.poses} 種組合裡 ${R.grid.clashing} 種會碰到自己${R.grid.top[0] ? `（${R.grid.top[0].pair}）` : ''}</span>`;
  const VB = verifyBlender();
  if (VB) { h += `
${mark(VB.pass)} Blender 版 GLB：${VB.tris} 個三角面、${VB.clips.length} 段動作；${VB.poses} 個姿勢 × ${VB.bones} 根骨頭跟 machine.js 比，最大差 ${VB.max_bone_err_mm} mm`; await post('verify_blender_glb.json', JSON.stringify(VB, null, 1)); R.blender = VB; }
  $('res').innerHTML = h; await post('check.json', JSON.stringify(R, null, 1)); await post('arm_info.json', JSON.stringify(M.info(), null, 1));
  return R;
}
async function doExport() {
  $('res').textContent = '匯出中…'; if (helpers) $('b-col').onclick();
  const buf = await exportGlb(M), V = await verifyGlb(M, buf);
  await post('arm.glb', buf); await post('verify_glb.json', JSON.stringify(V, null, 1));
  $('res').innerHTML = `${mark(V.pass)} <b>arm.glb</b> ${(V.bytes / 1024).toFixed(0)} KB → tools/arm/out/\n重新讀入：${V.parts} 個零件、${V.tris} 個三角面、${V.clips.length} 段動作（${V.clips.map((c) => c.name).join('、')}）\n用動作擺 ${V.poses} 個姿勢跟原本比：骨頭位置最大差 ${V.max_bone_err_mm} mm`;
  return V;
}
// 錄影：把畫布錄成影片存到 out/（從示範動作的開頭錄 sec 秒；鏡頭慢慢繞）
async function record(sec, name = 'arm_demo') {
  const type = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(renderer.domElement.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 }), parts = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  setMode('auto'); time = 0; paused = false; spin = { t0: performance.now(), sec }; rec.start();
  await new Promise((r) => setTimeout(r, sec * 1000)); rec.stop(); await new Promise((r) => { rec.onstop = r; }); spin = null;
  const file = name + (type.startsWith('video/mp4') ? '.mp4' : '.webm'); await post(file, new Blob(parts, { type }));
  return file;
}
let spin = null;
$('b-check').onclick = doCheck; $('b-glb').onclick = doExport;

// ── 每一格 ──
const clock = new THREE.Clock(), P = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'auto' && demo) { if (!paused) time += dt; demo.apply(time); }
  else if (mode === 'ik') { target.position.y = Math.max(0.3, target.position.y); const ok = M.ik(target.position, +$('phi').value); M.pose(); target.material.color.set(ok ? 0x40e080 : 0xff5040); }
  if (useBL) poseBlender();
  placeCargo(time);
  for (const j of JOINTS) { const s = sl[j.key]; if (document.activeElement !== s.inp) s.inp.value = M.param(j.key); s.val.textContent = M.ang[j.key].toFixed(1) + '°'; }
  for (const k of ['sh', 'el']) { const A = M.act[k]; $('a-' + k).textContent = `${A.len.toFixed(2)} m`; $('g-' + k).style.width = (100 * (A.len - A.lo) / (A.hi - A.lo)).toFixed(1) + '%'; }
  M.tcp(P); $('stat').textContent = `工具中心 x ${P.x.toFixed(2)}　y ${P.y.toFixed(2)}　z ${P.z.toFixed(2)} m${mode === 'auto' && demo && !demo.reach ? '　（到不了）' : ''}`;
  if (spin) { const a = 0.75 + 0.5 * Math.sin((performance.now() - spin.t0) / 1000 / spin.sec * Math.PI * 2); camera.position.set(1 + 17.5 * Math.cos(a), 7.8, 17.5 * Math.sin(a)); orbit.target.set(1.2, 3.0, 0); }
  orbit.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
Promise.all([setupProps().catch((e) => console.error('元件載入失敗', e)), loadBlender().catch(() => setVer(false))]).then(() => {
  // 測試腳本用：setT 把示範動作停在某一秒；cam 擺鏡頭
  window.__arm = { M, demo, setMode, doCheck, doExport, setVer, verifyBlender, record, get BL() { return BL; }, setT(t) { setMode('auto'); time = t; paused = true; }, cam(p, t) { camera.position.set(...p); orbit.target.set(...t); orbit.update(); }, ready: true };
  frame();
});
