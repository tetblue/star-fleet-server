// 機甲動作預覽：四足步伐（移植自 rubicon-protocol render/mech-model.js 的 quadSolve 與螃蟹步）、履帶車的起伏與揚塵、
// 武器轉向瞄準、開火（砲彈／機砲／飛彈／光束）、後座。只是預覽，跟遊戲的模擬無關。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as B from '/build.js';
import { UNITS } from '/units.js';

const FAC_COL = ['#f2b35a', '#7cc4ff', '#e2735a', '#ff6a7e', '#4ff0d8', '#c47cff', '#9be35a'];
const FAC_NAME = ['帝國', '聯盟', '傭兵', '機械改造', '機械智慧', '蟲族感染', '蟲族'];
const SIZE_K = [1, 1.2, 1.6];   // 預覽用的大小：標準／重型／巨型
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ───── 場景 ─────
const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
R.setPixelRatio(Math.min(2, devicePixelRatio)); R.setSize(innerWidth, innerHeight);
R.outputColorSpace = THREE.SRGBColorSpace; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(R.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8e98a4); scene.fog = new THREE.Fog(0x8e98a4, 160, 520);
const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 2000); cam.position.set(24, 15, 28);
const ctl = new OrbitControls(cam, R.domElement); ctl.target.set(0, 4, 0); ctl.enableDamping = true; ctl.maxPolarAngle = 1.5;
scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x4a4436, 1.6));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6); sun.position.set(40, 70, 25); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 250 }); sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
addEventListener('resize', () => { R.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });

// 地面：程序生成的沙土＋網格
function groundTex() {
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  g.fillStyle = '#6f6656'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 9000; i++) { const v = 90 + Math.random() * 40; g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.78},${Math.random() * 0.25})`; const s = 1 + Math.random() * 6; g.fillRect(Math.random() * n, Math.random() * n, s, s); }
  g.strokeStyle = 'rgba(40,36,30,0.18)'; g.lineWidth = 2; for (let i = 0; i <= n; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, n); g.moveTo(0, i); g.lineTo(n, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(120, 120); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// 標靶：敵方碉堡（被打中會閃光冒煙）
function bunker() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x5a5c5e, roughness: 0.8 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 10), m); a.position.y = 2.5; g.add(a);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 4, 10), m); b.position.y = 7; g.add(b);
  const r = new THREE.Mesh(new THREE.RingGeometry(16, 17.5, 48), new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.6 })); r.rotation.x = -Math.PI / 2; r.position.y = 0.05; g.add(r);
  g.traverse((o) => { if (o.isMesh && o !== r) { o.castShadow = o.receiveShadow = true; } });
  scene.add(g); return g;
}

// ───── 特效：砲彈、機砲、飛彈、光束、砲口火光、爆炸、煙、塵土 ─────
function radialTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const T_FLASH = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,230,160,0.9)'], [1, 'rgba(255,120,30,0)']]);
const T_SMOKE = radialTex([[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
const FX = [];
function sprite(tex, color, add, pos, size, life, opt = {}) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: opt.op ?? 1 }));
  m.position.copy(pos); m.scale.setScalar(size); scene.add(m);
  FX.push({ m, life, t: 0, size, grow: opt.grow ?? 0, vel: opt.vel || null, op: opt.op ?? 1 });
}
const flash = (p, s, col = 0xffd27a) => sprite(T_FLASH, col, true, p, s, 0.09);
const smoke = (p, s, life, col = 0x8a857c, vel = null, op = 0.55) => sprite(T_SMOKE, col, false, p, s, life, { grow: s * 1.6, vel: vel || new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2 + Math.random(), (Math.random() - 0.5) * 1.5), op });
const dust = (p, s) => smoke(p, s, 1.4, 0x9c8e74, new THREE.Vector3((Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2), 0.45);
function boom(p, s) {
  flash(p, s * 2.4, 0xffb060);
  for (let i = 0; i < 4; i++) smoke(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * s, Math.random() * s * 0.5, (Math.random() - 0.5) * s)), s * 1.1, 1.6 + Math.random(), 0x4a4640);
}
const SHOTS = [];
const G_SHELL = new THREE.BoxGeometry(0.22, 0.22, 2.2), G_TRACER = new THREE.BoxGeometry(0.1, 0.1, 1.6), G_MSL = new THREE.ConeGeometry(0.25, 1.4, 6).rotateX(Math.PI / 2);
const G_BEAM = new THREE.CylinderGeometry(0.16, 0.16, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const matCache = {};
const glowMat = (col) => matCache[col] || (matCache[col] = new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
function shoot(kind, from, to, col, scale) {
  const spread = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 3, (Math.random() - 0.5) * 6));
  if (kind === 'beam') {
    const m = new THREE.Mesh(G_BEAM, glowMat(col)); m.position.copy(from); m.lookAt(spread); m.scale.set(scale * 1.4, scale * 1.4, from.distanceTo(spread)); scene.add(m);
    FX.push({ m, life: 0.18, t: 0, beam: true }); boom(spread, 2.2 * scale); return;
  }
  const geo = kind === 'missile' ? G_MSL : kind === 'rapid' ? G_TRACER : G_SHELL;
  const m = new THREE.Mesh(geo, kind === 'missile' ? new THREE.MeshStandardMaterial({ color: 0x9a9a94, emissive: col, emissiveIntensity: 0.4 }) : glowMat(col));
  m.scale.setScalar(scale); m.position.copy(from); scene.add(m);
  const spd = kind === 'missile' ? 55 : kind === 'rapid' ? 170 : 130, d = from.distanceTo(spread);
  // 飛彈：先往上竄再俯衝（二次貝茲）
  const mid = kind === 'missile' ? from.clone().lerp(spread, 0.35).add(new THREE.Vector3((Math.random() - 0.5) * 20, 25 + Math.random() * 15, (Math.random() - 0.5) * 20)) : null;
  SHOTS.push({ m, kind, a: from.clone(), b: spread, mid, T: d / spd * (mid ? 1.4 : 1), t: 0, scale, smokeT: 0 });
}
const _p = new THREE.Vector3(), _q = new THREE.Vector3();
function bez(s, k, out) { if (!s.mid) return out.copy(s.a).lerp(s.b, k); const u = 1 - k; return out.copy(s.a).multiplyScalar(u * u).addScaledVector(s.mid, 2 * u * k).addScaledVector(s.b, k * k); }
function fxStep(dt) {
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    const s = SHOTS[i]; s.t += dt; const k = Math.min(1, s.t / s.T);
    bez(s, k, _p); bez(s, Math.min(1, k + 0.02), _q); s.m.position.copy(_p); if (_q.distanceToSquared(_p) > 1e-6) s.m.lookAt(_q);
    if (s.kind === 'missile' && (s.smokeT -= dt) < 0) { s.smokeT = 0.03; smoke(_p, 1.2 * s.scale, 1.2, 0xc8c4bc, new THREE.Vector3(0, 0.3, 0), 0.5); }
    if (k >= 1) { boom(s.b, (s.kind === 'rapid' ? 0.9 : s.kind === 'missile' ? 3 : 2.4) * s.scale); scene.remove(s.m); SHOTS.splice(i, 1); }
  }
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i]; f.t += dt; const k = f.t / f.life;
    if (k >= 1) { scene.remove(f.m); f.m.material !== undefined && !f.beam && f.m.material.dispose(); FX.splice(i, 1); continue; }
    if (f.beam) { f.m.material.opacity = 1 - k; continue; }
    if (f.vel) f.m.position.addScaledVector(f.vel, dt);
    f.m.scale.setScalar(f.size + f.grow * k); f.m.material.opacity = f.op * (1 - k);
  }
}

// ───── 武器的分類（決定開火方式） ─────
// heavy＝主砲（慢、砲彈大）；rapid＝機砲／防空；missile＝飛彈、魚雷；lance＝貫穿砲／長管砲（固定朝前、要車體對準）；melee＝抓臂、巨顎（不開火，做揮動）
const KIND = {
  ew0: 'heavy', ew1: 'heavy', ew2: 'heavy', ew3: 'rapid', ew4: 'missile', ew5: 'lance',
  aw0: 'heavy', aw1: 'heavy', aw2: 'missile', aw3: 'rapid', aw4: 'missile', aw5: 'lance',
  mw0: 'heavy', mw1: 'lance', mw2: 'missile', mw3: 'rapid', mw4: 'missile', mw5: 'melee',
  cw0: 'heavy', cw1: 'heavy', cw2: 'missile', cw3: 'lance', cw4: 'missile', cw5: 'rapid',
  rw0: 'heavy', rw1: 'lance', rw2: 'lance', rw3: 'missile', rw4: 'rapid', rw5: 'rapid',
  iw0: 'heavy', iw1: 'heavy', iw2: 'lance', iw3: 'missile', iw4: 'missile', iw5: 'missile',
  bw0: 'heavy', bw1: 'heavy', bw2: 'lance', bw3: 'rapid', bw4: 'melee', bw5: 'rapid',
  'rb:bw_gat': 'rapid',
};
// 射擊間隔（秒）、轉向速度（弧度／秒）、射界（左右各幾弧度）
const WK = { heavy: { cd: 3.2, rate: 1.1, arc: Math.PI }, rapid: { cd: 0.12, rate: 3, arc: Math.PI }, missile: { cd: 5.5, rate: 1.4, arc: Math.PI }, lance: { cd: 4.5, rate: 0.5, arc: 0.3 }, melee: { cd: 2.5, rate: 1.5, arc: 0.5 } };

// ───── 機甲 ─────
const _e1 = new THREE.Vector3(1, 0, 0), _w = new THREE.Vector3(), _l = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const _qa = new THREE.Vector3(), _qb = new THREE.Vector3(), _qc = new THREE.Vector3(), _qd = new THREE.Vector3(), _qe = new THREE.Vector3(), _qq = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qr = new THREE.Quaternion();
// rubicon 的 quadSolve：兩段骨頭，膝蓋繞 hinge 彎，讓腳踝到世界座標 T
function quadSolve(L, T) {
  L.thigh.quaternion.identity(); L.knee.quaternion.identity(); L.thigh.updateMatrixWorld(true);
  const A = L.thigh.getWorldPosition(_qa), Bp = L.knee.getWorldPosition(_qb), C = L.foot.getWorldPosition(_qc);
  const lab = A.distanceTo(Bp), lcb = Bp.distanceTo(C), lat = clamp(A.distanceTo(T), Math.abs(lab - lcb) + 1e-3, lab + lcb - 1e-3);
  const ba = _qd.subVectors(A, Bp).normalize(), bc = _qe.subVectors(C, Bp).normalize();
  const ang0 = Math.acos(clamp(ba.dot(bc), -1, 1)), ang1 = Math.acos(clamp((lab * lab + lcb * lcb - lat * lat) / (2 * lab * lcb), -1, 1));
  L.knee.quaternion.setFromAxisAngle(L.hinge, ang0 - ang1); L.knee.updateMatrixWorld(true);
  const C2 = L.foot.getWorldPosition(_qc).sub(A).normalize(), want = _qd.subVectors(T, A).normalize();
  _qq.setFromUnitVectors(C2, want);
  const pq = L.thigh.parent.getWorldQuaternion(_qp);
  L.thigh.quaternion.copy(_qr.copy(pq).invert().multiply(_qq).multiply(pq));
}

class Mech {
  constructor(U, obj, home) {
    this.U = U; this.col = new THREE.Color(FAC_COL[U.fac]); this.k = SIZE_K[U.size];
    this.holder = new THREE.Group(); this.body = obj; this.holder.add(obj); this.holder.scale.setScalar(this.k); scene.add(this.holder);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.home = home.clone(); this.target = home.clone().add(new THREE.Vector3(0, 3, -85));
    this.holder.position.copy(home); this.hd = 0; this.holder.rotation.y = 0;
    this.spd = (U.ch === 'qd' ? 4.2 : 5.5) * (U.size === 2 ? 0.75 : 1); this.turnRate = U.ch === 'qd' ? 0.7 : 0.45;
    this.v = 0; this.w = 0; this.gp = 0; this.t = Math.random() * 10;
    this.state = 'fire'; this.stT = 2 + Math.random() * 2; this.wp = home.clone();
    this.holder.updateMatrixWorld(true);
    const inv = this.holder.matrixWorld.clone().invert();
    this.legs = [];
    if (U.ch === 'qd') for (const s of ['fl', 'fr', 'bl', 'br']) {
      const L = { s, thigh: obj.getObjectByName(`leg_${s}_thigh`), knee: obj.getObjectByName(`leg_${s}_shin`), foot: obj.getObjectByName(`leg_${s}_foot`) };
      L.rest = L.foot.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      // 蜘蛛／螃蟹站姿：四隻腳往外撐成 X 形（前腳原本太靠前、太靠內）
      const sx = Math.sign(L.rest.x), front = L.rest.z > 0;
      L.rest.x = sx * (front ? 4.8 : 6.0); L.rest.z = front ? 4.0 : -5.2;
      { const a = L.thigh.getWorldPosition(new THREE.Vector3()), b = L.knee.getWorldPosition(new THREE.Vector3()), c = L.foot.getWorldPosition(new THREE.Vector3()); L.reach = a.distanceTo(b) + b.distanceTo(c); }   // 腳能伸到的最遠距離（世界單位）
      L.grp = s === 'fl' || s === 'br' ? 0 : 1; L.swing = null; L.plant = null;
      L.fq0 = this.holder.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(L.foot.getWorldQuaternion(new THREE.Quaternion()));   // 站姿時腳掌相對機體的方向
      const kinv = L.knee.matrixWorld.clone().invert(), a = L.thigh.getWorldPosition(new THREE.Vector3()).applyMatrix4(kinv), c = L.foot.getWorldPosition(new THREE.Vector3()).applyMatrix4(kinv);
      const h = new THREE.Vector3().crossVectors(c, a); L.hinge = h.lengthSq() > 1e-8 ? h.normalize() : new THREE.Vector3(1, 0, 0);
      this.legs.push(L);
    }
    // 武器：轉向節點、俯仰節點、砲口位置（俯仰節點的區域座標）
    this.wpn = [];
    obj.userData.mech.mounts.forEach((mt, i) => {
      const g = obj.getObjectByName(`wpn_${i}`), p = obj.getObjectByName(`wpn_${i}_pitch`), kind = KIND[mt.k] || 'heavy';
      const y0 = g.rotation.y; g.rotation.y = 0; obj.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(p), muzzle = p.worldToLocal(new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2 + (bb.max.y - bb.min.y) * 0.15, bb.max.z));
      g.rotation.y = y0;
      this.wpn.push({ g, p, kind, K: WK[kind], y0, yaw: y0, pos0: p.position.clone(), rx0: p.rotation.x, muzzle, cd: Math.random() * WK[kind].cd, rec: 0, s: mt.s, burst: 0 });
    });
    obj.updateMatrixWorld(true);
  }
  // 狀態：走到標靶前方的新位置 → 轉向標靶 → 停下來齊射 → 再換位置
  think() {
    if (this.state === 'move') {
      if (this.holder.position.distanceTo(this.wp) < 2) { this.state = 'face'; }
    } else if (this.state === 'face') {
      const want = Math.atan2(this.target.x - this.holder.position.x, this.target.z - this.holder.position.z);
      if (Math.abs(angDiff(this.hd, want)) < 0.05) { this.state = 'fire'; this.stT = 4 + Math.random() * 3; }
    } else if ((this.stT -= DT) < 0) {
      const a = (Math.random() - 0.5) * 1.6, r = 18 + Math.random() * 22;
      this.wp.set(this.home.x + Math.sin(a) * r * (Math.random() < 0.5 ? -1 : 1), 0, this.home.z + (Math.random() - 0.3) * r);
      this.state = 'move';
    }
  }
  step(dt, walkOn, fireOn) {
    this.t += dt; if (walkOn) this.think(); else this.state = 'hold';
    const P = this.holder.position;
    // 移動與轉向
    let wantV = 0, wantW = 0;
    if (this.legs.length) { this.moveCrab(dt); return this.finishStep(dt, fireOn); }
    if (this.state === 'move') {
      const dx = this.wp.x - P.x, dz = this.wp.z - P.z, d = Math.hypot(dx, dz), want = Math.atan2(dx, dz), dA = angDiff(this.hd, want);
      wantW = clamp(dA * 2, -1, 1) * this.turnRate;
      // 履帶車要先轉到大致的方向才前進；四足可以邊走邊轉
      wantV = this.spd * Math.min(1, d / 6) * Math.max(0, Math.cos(dA)) * (this.U.ch === 'tk' && Math.abs(dA) > 0.6 ? 0 : 1);
    } else if (this.state === 'face') {
      const dA = angDiff(this.hd, Math.atan2(this.target.x - P.x, this.target.z - P.z)); wantW = clamp(dA * 2, -1, 1) * this.turnRate;
    }
    const acc = (wantV - this.v); this.v += clamp(acc, -6 * dt, 4 * dt); this.w = lerp(this.w, wantW, Math.min(1, dt * 3));
    this.hd += this.w * dt; this.holder.rotation.y = this.hd;
    P.x += Math.sin(this.hd) * this.v * dt * this.k; P.z += Math.cos(this.hd) * this.v * dt * this.k;
    const moving = this.v > 0.15 || Math.abs(this.w) > 0.04;
    this.holder.updateMatrixWorld(true);
    // 下半身
    this.stepTank(dt, moving, acc);
    this.finishStep(dt, fireOn);
  }
  finishStep(dt, fireOn) {
    this.body.updateMatrixWorld(true);
    for (const W of this.wpn) this.stepWeapon(W, dt, fireOn);
  }
  // 四足＝螃蟹式移動：身體一直朝向標靶，往任何方向橫著走（不用先轉身）
  moveCrab(dt) {
    const P = this.holder.position;
    let tx = 0, tz = 0, faceX = this.target.x, faceZ = this.target.z;
    if (this.state === 'move') {
      const dx = this.wp.x - P.x, dz = this.wp.z - P.z, d = Math.hypot(dx, dz), sp = this.spd * Math.min(1, d / 5);
      tx = dx / (d || 1) * sp; tz = dz / (d || 1) * sp;
    }
    if (!this.vel) this.vel = new THREE.Vector2();
    const ax = tx - this.vel.x, az = tz - this.vel.y, al = Math.hypot(ax, az), lim = (al > 0 && al < 1e9 ? Math.min(1, 7 * dt / al) : 0);
    this.vel.x += ax * lim; this.vel.y += az * lim; this.v = this.vel.length();
    const dA = angDiff(this.hd, Math.atan2(faceX - P.x, faceZ - P.z));
    this.w = lerp(this.w, clamp(dA * 2, -1, 1) * this.turnRate, Math.min(1, dt * 3));
    this.hd += this.w * dt; this.holder.rotation.y = this.hd;
    P.x += this.vel.x * dt * this.k; P.z += this.vel.y * dt * this.k;
    this.holder.updateMatrixWorld(true);
    this.stepLegs(dt);
  }
  // 腳的落點（世界座標）：站姿位置，往前預估 lead 秒的移動和轉向
  footHome(L, lead, out) {
    const P = this.holder.position, h = this.hd + this.w * lead, c = Math.cos(h), s = Math.sin(h), k = this.k;
    const vx = this.vel.x * lead * k, vz = this.vel.y * lead * k;
    return out.set(P.x + vx + (L.rest.x * c + L.rest.z * s) * k, L.rest.y * k, P.z + vz + (-L.rest.x * s + L.rest.z * c) * k);
  }
  // 蜘蛛步：腳釘在地上不滑動，身體移開後落後太多就快速抬腳、劃弧線跨到前方的新落點；
  // 對角兩隻一組，另一組在空中時這組不能抬（永遠至少兩隻腳著地）
  stepLegs(dt) {
    const k = this.k, sk = Math.sqrt(k), dur = 0.26 * sk, lift = 1.6, thresh = 1.7 * k, lead = 0.42;
    const H = this._h || (this._h = new THREE.Vector3()), moving = this.v > 0.15 || Math.abs(this.w) > 0.04;
    const busy = [0, 0]; for (const L of this.legs) if (L.swing) busy[L.grp]++;
    // 先挑落後最多的那組
    let need = [0, 0];
    for (const L of this.legs) {
      if (!L.plant) L.plant = this.footHome(L, 0, new THREE.Vector3());
      let e = Math.hypot(L.plant.x - this.footHome(L, 0, H).x, L.plant.z - H.z);
      // 腳快拉直了（快被拖著走）→ 不管門檻，馬上要跨
      if (L.thigh.getWorldPosition(_qa).distanceTo(L.plant) > L.reach * 0.93) e = Math.max(e, thresh * 1.01);
      L.err = e;
      need[L.grp] = Math.max(need[L.grp], e);
    }
    const lim = moving ? thresh : 0.35 * k;   // 停下來時把腳收回站姿
    // 兩組輪流：剛踩完的那組先讓另一組走（另一組也差不多該走了就換它）
    let g = need[0] >= need[1] ? 0 : 1;
    if (g === this.lastG && need[1 - g] > lim * 0.5) g = 1 - g;
    // 落點只超前站姿半個門檻：超前太多，落地時又被當成「離太遠」而連踩
    const sp = this.v + Math.abs(this.w) * 7.5, ahead = Math.min(lead, 0.55 * 1.7 / Math.max(sp, 0.1));
    for (const grp of [g, 1 - g]) {
      if (busy[1 - grp] || busy[grp]) continue;
      if (need[grp] < lim) continue;
      for (const L of this.legs) if (L.grp === grp && L.err > 0.12 * k) {
        L.swing = { t: 0, from: L.plant.clone(), to: this.footHome(L, moving ? ahead + dur : 0, new THREE.Vector3()), h: lift * k * Math.min(1, 0.45 + L.err / thresh * 0.55) };
      }
      busy[grp] = 1; this.lastG = grp; break;
    }
    const inv = _m4.copy(this.holder.matrixWorld).invert();
    let up = 0;
    for (const L of this.legs) {
      const T = _w;
      if (L.swing) {
        const S = L.swing; S.t = Math.min(1, S.t + dt / dur);
        const e = S.t * S.t * (3 - 2 * S.t);
        T.lerpVectors(S.from, S.to, e); T.y += Math.sin(Math.PI * Math.min(1, S.t * 1.15)) * S.h;
        up = Math.max(up, Math.sin(Math.PI * S.t));
        if (S.t >= 1) { L.plant.copy(S.to); L.swing = null; dust(L.plant, 1.2 * k); this.land = 1; }
      } else T.copy(L.plant);
      quadSolve(L, T);
      // 腳掌保持站姿方向（貼地），抬腳時腳尖往下勾
      L.knee.updateMatrixWorld(true);
      const lift01 = L.swing ? Math.sin(Math.PI * L.swing.t) : 0;
      _qq.copy(this.holder.getWorldQuaternion(_qp)).multiply(L.fq0); _qr.setFromAxisAngle(_e1, lift01 * 0.35 * Math.sign(L.rest.z || 1));
      L.foot.quaternion.copy(L.knee.getWorldQuaternion(_qp).invert().multiply(_qq).multiply(_qr));
    }
    // 機體壓低、平穩滑行；落腳時微微一沉，往移動方向稍微傾
    const b = this.body; this.land = Math.max(0, (this.land || 0) - dt * 5);
    b.position.y = lerp(b.position.y, -0.55 + up * 0.08 - this.land * 0.12 + (moving ? 0 : Math.sin(this.t * 1.3) * 0.05), Math.min(1, dt * 10));
    const c = Math.cos(this.hd), s = Math.sin(this.hd), lx = this.vel.x * c - this.vel.y * s, lz = this.vel.x * s + this.vel.y * c;
    b.rotation.x = lerp(b.rotation.x, clamp(lz * 0.012, -0.05, 0.05), Math.min(1, dt * 4));
    b.rotation.z = lerp(b.rotation.z, clamp(-lx * 0.012, -0.05, 0.05), Math.min(1, dt * 4));
  }
  stepTank(dt, moving, acc) {
    const b = this.body;
    b.position.y = moving ? Math.sin(this.t * 31) * 0.03 + Math.sin(this.t * 7.3) * 0.04 : 0;
    b.rotation.x = lerp(b.rotation.x, clamp(-acc * 0.05, -0.05, 0.05) + (moving ? Math.sin(this.t * 5.1) * 0.006 : 0), Math.min(1, dt * 5));
    b.rotation.z = lerp(b.rotation.z, -this.w * 0.03, Math.min(1, dt * 4));
    if (moving && Math.random() < dt * 14) {   // 履帶後方揚塵
      for (const sx of [-4.5, 4.5]) dust(_w.set(sx + (Math.random() - 0.5), 0.6, -7).applyMatrix4(this.holder.matrixWorld), 2.2 * this.k);
    }
  }
  stepWeapon(W, dt, fireOn) {
    // 標靶在武器座標（轉向節點的父節點＝機體）裡的方位
    const loc = this.body.worldToLocal(_l.copy(this.target)).sub(W.g.position);
    let want = Math.atan2(loc.x, loc.z);
    const dYaw = angDiff(W.y0, want);
    let inArc = Math.abs(dYaw) <= W.K.arc;
    want = W.y0 + clamp(dYaw, -W.K.arc, W.K.arc);
    if (W.kind === 'melee') want = W.y0 + Math.sin(this.t * 0.9 + W.s) * 0.35;
    const d = angDiff(W.yaw, want); W.yaw += clamp(d, -W.K.rate * dt, W.K.rate * dt); W.g.rotation.y = W.yaw;
    const aimed = inArc && Math.abs(angDiff(W.yaw, want)) < 0.08;
    // 俯仰：主砲微抬（模型是一整塊，只能整個抬）
    const dist = Math.hypot(loc.x, loc.z), pitchWant = W.kind === 'melee' ? Math.sin(this.t * 2.3 + W.s) * 0.25 : W.kind === 'missile' ? 0 : -clamp(Math.atan2(loc.y, dist) + 0.04, -0.15, 0.2);
    W.p.rotation.x = lerp(W.p.rotation.x, W.rx0 + pitchWant, Math.min(1, dt * 3));
    // 後座：砲身往後縮再彈回
    W.rec = Math.max(0, W.rec - dt * (W.kind === 'rapid' ? 14 : 3.2));
    W.p.position.copy(W.pos0); W.p.position.z -= Math.sin(Math.min(1, W.rec) * Math.PI * 0.5) * W.s * (W.kind === 'rapid' ? 0.02 : W.kind === 'missile' ? 0.01 : 0.07);
    if (!fireOn || W.kind === 'melee') return;
    if (W.kind === 'lance' && this.state !== 'fire') return;
    W.cd -= dt; if (W.cd > 0 || !aimed) return;
    // 機砲：一串連射後停一下
    if (W.kind === 'rapid') { if (++W.burst > 14) { W.burst = 0; W.cd = 1.6 + Math.random(); return; } }
    W.cd = W.K.cd * (0.85 + Math.random() * 0.3);
    W.rec = 1;
    const m = W.p.localToWorld(_w.copy(W.muzzle));
    const beam = this.U.fac === 4 && W.kind !== 'missile';
    const sc = this.k * (W.kind === 'heavy' || W.kind === 'lance' ? Math.min(1.6, W.s / 5) : 1);
    if (W.kind === 'missile') { for (let i = 0; i < 2; i++) shoot('missile', m.clone().add(new THREE.Vector3(0, i * 0.4, 0)), this.target, this.col, this.k); smoke(m, 2.5 * this.k, 1.5, 0xd0ccc4); }
    else { shoot(beam ? 'beam' : W.kind === 'rapid' ? 'rapid' : 'shell', m.clone(), this.target, this.col, sc); flash(m, (W.kind === 'rapid' ? 1.4 : 4) * sc, beam ? this.col : 0xffd27a); if (W.kind !== 'rapid') smoke(m, 2.4 * sc, 1.4, 0x9a968e); }
  }
  dispose() { scene.remove(this.holder); }
}

// ───── 介面 ─────
await B.init();
const sel = document.getElementById('sel'), info = document.getElementById('info');
UNITS.forEach((U, i) => sel.add(new Option(`${i + 1}. ${U.name}（${FAC_NAME[U.fac]}）`, i)));
let mechs = [], bunkers = [], walkOn = true, fireOn = true, follow = true, DT = 0;
const tog = (id, get, set) => { const b = document.getElementById(id); b.onclick = () => { set(!get()); b.classList.toggle('on', get()); }; };
tog('b-walk', () => walkOn, (v) => (walkOn = v)); tog('b-fire', () => fireOn, (v) => (fireOn = v)); tog('b-cam', () => follow, (v) => (follow = v));
function clear() { mechs.forEach((m) => m.dispose()); mechs = []; bunkers.forEach((b) => scene.remove(b)); bunkers = []; }
async function showOne(i) {
  info.textContent = '組裝中…'; clear();
  const U = UNITS[i], obj = B.gameLook(await B.build(U));
  mechs.push(new Mech(U, obj, new THREE.Vector3(0, 0, 0)));
  const k = SIZE_K[U.size]; ctl.target.set(0, 4 * k, 0); cam.position.set(17 * k, 10 * k, 20 * k); follow = true; document.getElementById('b-cam').classList.add('on');   // 鏡頭：斜後方，看得到標靶
  const bk = bunker(); bk.position.copy(mechs[0].target).setY(0); bunkers.push(bk);
  const W = obj.userData.mech.mounts.map((m) => `${m.k}（${KIND[m.k]}）`).join('、');
  info.textContent = `${U.name}\n${FAC_NAME[U.fac]}・${U.ch === 'qd' ? '四足' : '履帶'}・${['標準', '重型', '巨型'][U.size]}・${U.role}\n武器：${W}\n滑鼠拖曳旋轉、滾輪縮放`;
  history.replaceState(null, '', '#' + U.id);
}
async function showAll() {
  info.textContent = '組裝 20 台中…（第一次要烘焙貼圖，約 1 分鐘）'; clear();
  for (let i = 0; i < UNITS.length; i++) {
    const U = UNITS[i], obj = B.gameLook(await B.build(U)), home = new THREE.Vector3(((i % 5) - 2) * 46, 0, Math.floor(i / 5) * 44);
    const m = new Mech(U, obj, home); m.target.set(home.x * 0.5, 3, -110); mechs.push(m);
    info.textContent = `組裝中 ${i + 1}／20`;
  }
  for (let x = -2; x <= 2; x++) { const bk = bunker(); bk.position.set(x * 23, 0, -110); bunkers.push(bk); }
  info.textContent = '全部 20 台：滑鼠拖曳旋轉、滾輪縮放';
  cam.position.set(110, 70, 170); ctl.target.set(0, 0, 30); follow = false; document.getElementById('b-cam').classList.remove('on');
}
sel.onchange = () => showOne(+sel.value);
document.getElementById('b-all').onclick = () => showAll();
// 錄影：canvas 的串流 → webm，存到 out/video/
document.getElementById('b-rec').onclick = async () => {
  const b = document.getElementById('b-rec'); if (b.dataset.on) return; b.dataset.on = 1; b.textContent = '錄影中…';
  const name = await recordSteps(10, `${mechs.length > 1 ? 'all' : mechs[0].U.id}.webm`); b.textContent = '已存 ' + name; delete b.dataset.on;
};
async function record(sec, file) {
  const st = R.domElement.captureStream(30), rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8e6 }), parts = [];
  rec.ondataavailable = (e) => parts.push(e.data); rec.start();
  await new Promise((r) => setTimeout(r, sec * 1000)); rec.stop(); await new Promise((r) => (rec.onstop = r));
  const name = file || `${mechs.length > 1 ? 'all' : mechs[0].U.id}.webm`;
  await fetch('/out/video/' + name, { method: 'POST', body: new Blob(parts, { type: 'video/webm' }) }); return name;
}


// ───── 主迴圈 ─────
let last = performance.now();
const camOff = new THREE.Vector3();
let paused = false;
function frame(now) {
  if (!paused) frame0(Math.min(0.05, (now - last) / 1000)); last = now;
  requestAnimationFrame(frame);
}
function frame0(dt) {
  DT = dt;
  for (const m of mechs) m.step(DT, walkOn, fireOn);
  fxStep(DT);
  if (follow && mechs.length === 1) {
    const p = mechs[0].holder.position; camOff.subVectors(cam.position, ctl.target);
    ctl.target.lerp(_q.set(p.x, 4 * mechs[0].k, p.z), Math.min(1, DT * 3)); cam.position.copy(ctl.target).add(camOff);
  }
  sun.position.set(ctl.target.x + 40, 70, ctl.target.z + 25); sun.target.position.copy(ctl.target);
  ctl.update(); R.render(scene, cam);
}
requestAnimationFrame(frame);
// 測試用：面板隱藏時 rAF 不跑，手動推進 n 格
function tick(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { last = performance.now() - dt * 1000; frame0(dt); } }
// 逐格錄影：不靠 rAF（面板隱藏也能錄），每格推進 1/30 秒、送一格給錄影器，用實際時間對齊節拍
const yieldNow = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
async function recordSteps(sec, file) {
  const st = R.domElement.captureStream(0), tr = st.getVideoTracks()[0], rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8e6 }), parts = [];
  rec.ondataavailable = (e) => parts.push(e.data); rec.start(); paused = true;
  const t0 = performance.now();
  for (let f = 0; f < sec * 30; f++) { frame0(1 / 30); tr.requestFrame(); const due = t0 + (f + 1) * 1000 / 30; while (performance.now() < due) await yieldNow(); }
  rec.stop(); await new Promise((r) => (rec.onstop = r)); paused = false;
  await fetch('/out/video/' + file, { method: 'POST', body: new Blob(parts, { type: 'video/webm' }) }); return file;
}
window.__anim = { showOne, showAll, record, recordSteps, tick, mechs: () => mechs, cam, ctl, R };
const h = location.hash.slice(1), hi = UNITS.findIndex((U) => U.id === h);
if (h === 'all') showAll(); else { sel.value = Math.max(0, hi); showOne(Math.max(0, hi)); }
