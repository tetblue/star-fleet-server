// 機械臂本體：整台用程式碼建出來（把 AnyMachine 的做法搬到 three.js，不經過 Blender）。
// 照 AnyMachine 的規矩：
//   1. 模型就是程式碼：每個零件一個網格，只跟一根骨頭動；改設計就是改這個檔，整台重建。
//   2. 每個關節是真的機構：叉與舌夾一根銷、馬達鼓、兩節式油壓缸（缸筒在上一段、活塞桿在下一段，互相對準）。
//   3. 相鄰的兩段各佔自己的一層（z 方向），繞同一根軸轉，所以不管轉幾度都不會互穿。
//   4. 油壓缸的固定點由程式挑：把關節整個行程掃過一遍，留下「活塞桿始終在缸筒裡」而且力臂最大的那組。挑不到就報錯。
//   5. 每個關節是一個 0～1 的參數，超出範圍會被夾住；匯出的 GLB 每個參數一段 1 秒的線性動作（seek 到 t＝參數值）。
// 座標：公尺，y 朝上；手臂平面是迴轉座的 xy 平面，肩、肘、腕的轉軸都是 z。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const D = Math.PI / 180;
export const DIM = { H: 3.2, L1: 4.2, L2: 3.6, L3: 1.75, handX: 0.62, clawX: 0.47, clawR: 0.30 };
// min／max／rest：度。grip 是夾爪張開的角度（最小＝夾緊）
export const JOINTS = [
  { key: 'yaw', name: '底座迴轉', bone: 'Yaw', axis: 'y', min: -170, max: 170, rest: 0 },
  { key: 'sh', name: '肩', bone: 'Upper', axis: 'z', min: 30, max: 105, rest: 75 },
  { key: 'el', name: '肘', bone: 'Fore', axis: 'z', min: -125, max: -25, rest: -105 },
  { key: 'wr', name: '腕俯仰', bone: 'Wrist', axis: 'z', min: -105, max: 60, rest: -60 },
  { key: 'roll', name: '腕旋轉', bone: 'Hand', axis: 'x', min: -180, max: 180, rest: 0 },
  { key: 'grip', name: '夾爪', bone: 'Claw_A', axis: 'z', min: -4, max: 36, rest: 36 },
];
export const JMAP = Object.fromEntries(JOINTS.map((j) => [j.key, j]));

// ───── 材質（白色陶瓷殼、海軍藍、鋼、鍍鉻活塞桿、橡膠、藍色燈條、橘色夾墊）─────
const MATS = {
  white: new THREE.MeshStandardMaterial({ name: 'M_Arm_White', color: 0xe6eaf0, metalness: 0.15, roughness: 0.42 }),
  navy: new THREE.MeshStandardMaterial({ name: 'M_Arm_Navy', color: 0x1b2d52, metalness: 0.35, roughness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ name: 'M_Arm_Steel', color: 0x4a515c, metalness: 0.85, roughness: 0.42 }),
  chrome: new THREE.MeshStandardMaterial({ name: 'M_Arm_Chrome', color: 0xdfe5ec, metalness: 1, roughness: 0.12 }),
  rubber: new THREE.MeshStandardMaterial({ name: 'M_Arm_Rubber', color: 0x15171b, metalness: 0, roughness: 0.85 }),
  glow: new THREE.MeshStandardMaterial({ name: 'M_Arm_Glow', color: 0x0a1830, emissive: 0x2f9bff, emissiveIntensity: 2.2, roughness: 0.4 }),
  orange: new THREE.MeshStandardMaterial({ name: 'M_Arm_Pad', color: 0xe8791c, metalness: 0.1, roughness: 0.7 }),
};

// ───── 零件：一堆基本形狀合成一個網格；同時記下碰撞盒（檢查用）─────
class Part {
  constructor(name, bone) { this.name = name; this.bone = bone; this.g = {}; this.cols = []; }
  _add(mat, geo, o, cc, ch, round) {
    if (geo.index) geo = geo.toNonIndexed();
    const m = o.m || (o.rz != null || o.at ? new THREE.Matrix4().makeRotationZ((o.rz || 0) * D).setPosition(o.at ? o.at[0] : 0, o.at ? o.at[1] : 0, 0) : null);
    if (m) geo.applyMatrix4(m);
    (this.g[mat] || (this.g[mat] = [])).push(geo);
    if (o.col !== false && cc) {
      const cm = new THREE.Matrix4().makeTranslation(cc[0], cc[1], cc[2]); if (m) cm.premultiply(m);
      if (!round) this.cols.push({ m: cm, h: ch });
      else for (let k = 0; k < 4; k++) {   // 圓的東西：四塊轉 45° 的薄盒子疊起來（都在圓裡面，比一個方盒子準）
        const ax = 'xyz'.indexOf(round), r = ch[(ax + 1) % 3], h = [0, 0, 0]; h[ax] = ch[ax]; h[(ax + 1) % 3] = r * 0.924; h[(ax + 2) % 3] = r * 0.383;
        const rot = new THREE.Matrix4()['makeRotation' + round.toUpperCase()](k * Math.PI / 4);
        this.cols.push({ m: cm.clone().multiply(rot), h });
      }
    }
    return this;
  }
  box(mat, x0, x1, y0, y1, z0, z1, o = {}) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this._add(mat, g, o, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2]);
  }
  cylZ(mat, cx, cy, z0, z1, r, o = {}) {   // 銷、鼓：軸沿 z
    const g = new THREE.CylinderGeometry(r, r, z1 - z0, o.seg || 28); g.rotateX(Math.PI / 2); g.translate(cx, cy, (z0 + z1) / 2);
    return this._add(mat, g, o, [cx, cy, (z0 + z1) / 2], [r, r, (z1 - z0) / 2], 'z');
  }
  cylX(mat, x0, x1, cy, cz, r, o = {}) {   // r 可以是 [x0 那頭, x1 那頭]
    const r0 = r.length ? r[0] : r, r1 = r.length ? r[1] : r, rm = Math.max(r0, r1);
    const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, o.seg || 24); g.rotateZ(-Math.PI / 2); g.translate((x0 + x1) / 2, cy, cz);
    return this._add(mat, g, o, [(x0 + x1) / 2, cy, cz], [(x1 - x0) / 2, rm, rm], 'x');
  }
  cylY(mat, cx, cz, y0, y1, r, o = {}) {   // r 可以是 [下, 上]
    const r0 = r.length ? r[0] : r, r1 = r.length ? r[1] : r, rm = Math.max(r0, r1);
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, o.seg || 48); g.translate(cx, (y0 + y1) / 2, cz);
    return this._add(mat, g, o, [cx, (y0 + y1) / 2, cz], [rm, (y1 - y0) / 2, rm], 'y');
  }
  plate(mat, pts, z0, z1, o = {}) {   // xy 平面的外形擠出成一塊板（邊緣有小倒角）
    const bv = Math.min(o.bevel ?? 0.015, (z1 - z0) * 0.3);
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))), { depth: z1 - z0 - 2 * bv, bevelEnabled: bv > 0, bevelSize: bv, bevelThickness: bv, bevelOffset: -bv, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, z0 + bv);
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const p of pts) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }
    return this._add(mat, g, o, [(a + b) / 2, (c + d) / 2, (z0 + z1) / 2], [(b - a) / 2 - (o.trim || 0), (d - c) / 2, (z1 - z0) / 2]);   // trim：兩頭是圓的，碰撞盒在長度方向縮一點
  }
  boltsZ(cx, cy, R, n, z, h, rb = 0.03) { for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; this.cylZ('steel', cx + R * Math.cos(a), cy + R * Math.sin(a), Math.min(z, z + h), Math.max(z, z + h), rb, { seg: 6, col: false }); } return this; }
  boltsY(cx, cz, R, n, y, h, rb = 0.035) { for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; this.cylY('steel', cx + R * Math.cos(a), cz + R * Math.sin(a), y, y + h, rb, { seg: 6, col: false }); } return this; }
  boltsX(x, h, cy, cz, R, n, rb = 0.025) { for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; this.cylX('steel', Math.min(x, x + h), Math.max(x, x + h), cy + R * Math.cos(a), cz + R * Math.sin(a), rb, { seg: 6, col: false }); } return this; }
  mesh() {
    const keys = Object.keys(this.g), per = keys.map((k) => mergeGeometries(this.g[k], false));
    const geo = mergeGeometries(per, true), m = new THREE.Mesh(geo, keys.map((k) => MATS[k]));
    m.name = this.name; m.castShadow = m.receiveShadow = true; this.tris = geo.attributes.position.count / 3; return m;
  }
}
// 兩個圓的外包絡（一頭大一頭小的連桿外形）：圓心 (x0,0) 半徑 r0 → (x0+len,0) 半徑 r1
function link2d(len, r0, r1, x0 = 0, seg = 10) {
  const ang = Math.acos(Math.max(-1, Math.min(1, (r0 - r1) / len))), pts = [];
  for (let i = 0; i <= seg; i++) { const a = -ang + 2 * ang * i / seg; pts.push([x0 + len + r1 * Math.cos(a), r1 * Math.sin(a)]); }
  for (let i = 0; i <= seg; i++) { const a = ang + (2 * Math.PI - 2 * ang) * i / seg; pts.push([x0 + r0 * Math.cos(a), r0 * Math.sin(a)]); }
  return pts;
}
const arc = (cx, cy, r, a0, a1, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * D; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

// ───── 油壓缸的固定點：掃過關節整個行程，挑「套得住」而且力臂最大的一組 ─────
// J＝關節在上一段座標裡的位置；tops＝缸筒那頭的候選點（上一段座標）；bots＝活塞桿那頭的候選點（下一段座標，原點在關節）
function searchAnchors(name, J, range, tops, bots, clear) {   // clear＝油壓缸中線離關節軸至少要這麼遠（不然缸筒會擦到關節的舌）
  let best = null;
  for (const tp of tops) for (const bp of bots) {
    let lo = 1e9, hi = 0, lev = 1e9;
    for (let i = 0; i <= 32; i++) {
      const a = (range[0] + (range[1] - range[0]) * i / 32) * D, bx = J[0] + bp[0] * Math.cos(a) - bp[1] * Math.sin(a), by = J[1] + bp[0] * Math.sin(a) + bp[1] * Math.cos(a);
      const ln = Math.hypot(bx - tp[0], by - tp[1]); lo = Math.min(lo, ln); hi = Math.max(hi, ln);
      lev = Math.min(lev, Math.abs((J[0] - tp[0]) * (by - tp[1]) - (J[1] - tp[1]) * (bx - tp[0])) / ln);
    }
    const ok = hi <= 2 * lo - 0.7 && lev >= clear, sc = [ok ? 1 : 0, ok ? lev : -(hi / lo)];
    if (!best || sc[0] > best.sc[0] || (sc[0] === best.sc[0] && sc[1] > best.sc[1])) best = { sc, tp, bp, lo, hi, lever: lev, ok };
  }
  if (!best.ok) throw new Error(`油壓缸 ${name}：找不到套得住的固定點（最長 ${best.hi.toFixed(2)}、最短 ${best.lo.toFixed(2)}）`);
  best.Lc = best.lo - 0.25; best.Lr = best.hi - best.Lc + 0.18; best.J = J; best.name = name;   // 缸筒長、活塞桿長
  return best;
}

export function buildArm() {
  const { H, L1, L2, L3, handX, clawX, clawR } = DIM;
  const B = {}, parts = [];
  const bone = (name, parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); if (parent) B[parent].add(g); B[name] = g; return g; };
  const part = (name, b) => { const p = new Part(name, b); parts.push(p); return p; };

  // 油壓缸固定點（先挑，因為耳座是幾何的一部分）
  const SH = searchAnchors('肩', [0, H], [JMAP.sh.min, JMAP.sh.max],
    [1.35, 1.5, 1.65, 1.8, 1.95].flatMap((x) => [H - 1.75, H - 1.6, H - 1.45].map((y) => [x, y])),
    [1.6, 1.9, 2.2, 2.6].flatMap((x) => [-0.45, -0.55].map((y) => [x, y])), 0.5 + 0.15 + 0.1);
  const EL = searchAnchors('肘', [L1, 0], [JMAP.el.min, JMAP.el.max],
    [L1 - 3.4, L1 - 3.0, L1 - 2.6, L1 - 2.2].flatMap((x) => [0.55, 0.65, 0.75].map((y) => [x, y])),
    [0.75, 0.85, 0.95].flatMap((r) => [150, 160, 170].map((a) => [r * Math.cos(a * D), r * Math.sin(a * D)])), 0.3 + 0.11 + 0.1);
  SH.rc = 0.15; EL.rc = 0.11;

  // ── 骨架 ──
  bone('Root'); bone('Yaw', 'Root'); bone('Upper', 'Yaw', 0, H, 0); bone('Fore', 'Upper', L1, 0, 0); bone('Wrist', 'Fore', L2, 0, 0); bone('Hand', 'Wrist', handX, 0, 0);
  bone('TCP', 'Hand', L3 - handX, 0, 0);
  for (const [i, k] of ['A', 'B', 'C'].entries()) { bone('ClawMount_' + k, 'Hand').rotation.x = i * 120 * D; bone('Claw_' + k, 'ClawMount_' + k, clawX, clawR, 0); }
  bone('Act_Sh_Cyl', 'Yaw', SH.tp[0], SH.tp[1], 0); bone('Act_Sh_Rod', 'Upper', SH.bp[0], SH.bp[1], 0);
  bone('Act_El_Cyl', 'Upper', EL.tp[0], EL.tp[1], 0); bone('Act_El_Rod', 'Fore', EL.bp[0], EL.bp[1], 0);

  // ── 底座（不動）──
  part('Base_Plate', 'Root').cylY('steel', 0, 0, 0, 0.18, 1.75).boltsY(0, 0, 1.55, 12, 0.18, 0.05, 0.06);
  part('Pedestal', 'Root').cylY('white', 0, 0, 0.18, 0.95, [1.28, 1.05]).cylY('navy', 0, 0, 0.42, 0.6, 1.235, { col: false }).cylY('glow', 0, 0, 0.49, 0.53, 1.242, { col: false });
  part('Slew_Ring_Fixed', 'Root').cylY('steel', 0, 0, 0.95, 1.12, 1.18);

  // ── 迴轉座：迴轉環、甲板、兩片立板夾住肩膀、肩馬達鼓、油壓缸耳座、電控箱 ──
  part('Slew_Ring_Moving', 'Yaw').cylY('steel', 0, 0, 1.14, 1.28, 1.12).boltsY(0, 0, 1.0, 24, 1.28, 0.02, 0.03);
  part('Turret_Deck', 'Yaw').cylY('white', 0, 0, 1.28, 1.48, 1.05).boltsY(0, 0, 0.95, 16, 1.48, 0.03);
  const yokeProf = [[-0.75, 1.48], [0.85, 1.48], ...arc(0, H, 0.6, -25, 205)];
  for (const [n, s] of [['L', 1], ['R', -1]]) {
    const z0 = s > 0 ? 0.5 : -0.66, zo = s * 0.66;
    part('Yoke_' + n, 'Yaw').plate('white', yokeProf, z0, z0 + 0.16)
      .box('navy', -0.13, 0.13, 1.75, H - 0.8, Math.min(zo, zo + s * 0.012), Math.max(zo, zo + s * 0.012), { col: false })
      .box('glow', -0.025, 0.025, 1.9, H - 0.95, Math.min(zo, zo + s * 0.02), Math.max(zo, zo + s * 0.02), { col: false });
  }
  part('Yoke_Back', 'Yaw').box('navy', -0.75, -0.55, 1.48, H - 0.9, -0.5, 0.5);
  part('Shoulder_Drum_L', 'Yaw').cylZ('navy', 0, H, 0.66, 0.92, 0.46).cylZ('white', 0, H, 0.92, 0.98, 0.34).boltsZ(0, H, 0.40, 10, 0.92, 0.025);
  part('Shoulder_Drum_R', 'Yaw').cylZ('navy', 0, H, -0.8, -0.66, 0.40).cylZ('steel', 0, H, -0.86, -0.8, 0.2).boltsZ(0, H, 0.32, 8, -0.8, -0.025);
  {
    const bx = 0.7, by = 1.62, len = Math.hypot(SH.tp[0] - bx, SH.tp[1] - by), rz = Math.atan2(SH.tp[1] - by, SH.tp[0] - bx) / D, p = part('Act_Sh_Bracket', 'Yaw');
    for (const z of [0.14, -0.22]) p.plate('steel', link2d(len, 0.22, 0.17), z, z + 0.08, { at: [bx, by], rz });
    p.cylZ('chrome', SH.tp[0], SH.tp[1], -0.26, 0.26, 0.07, { col: false });
  }
  part('Cabinet', 'Yaw').box('white', -1.0, -0.76, 1.48, 2.5, -0.4, 0.4).box('navy', -1.012, -1.0, 1.7, 2.3, -0.3, 0.3, { col: false }).box('glow', -1.02, -1.012, 2.1, 2.14, -0.22, 0.22, { col: false });

  // ── 上臂：肩膀的舌、兩片側板（到肘那頭變成叉）、中間的箱梁、肘馬達鼓、兩個油壓缸耳座、油管 ──
  {
    const p = part('Upper_Arm', 'Upper').cylZ('steel', 0, 0, -0.44, 0.44, 0.5);
    for (const z of [0.30, -0.42]) p.plate('white', link2d(L1, 0.44, 0.36), z, z + 0.12, { bevel: 0.02 });
    p.box('navy', 0.35, L1 - 1.0, -0.26, 0.26, -0.30, 0.30);
    for (const s of [1, -1]) {
      p.box('navy', 0.9, L1 - 0.9, -0.06, 0.06, Math.min(s * 0.42, s * 0.432), Math.max(s * 0.42, s * 0.432), { col: false });
      p.box('glow', 1.2, L1 - 1.2, -0.018, 0.018, Math.min(s * 0.432, s * 0.44), Math.max(s * 0.432, s * 0.44), { col: false });
      p.cylX('rubber', 0.5, L1 - 1.1, 0.29, s * 0.2, 0.035, { seg: 8, col: false });
    }
  }
  part('Elbow_Drum_L', 'Upper').cylZ('navy', L1, 0, 0.42, 0.6, 0.34).cylZ('white', L1, 0, 0.6, 0.66, 0.24).boltsZ(L1, 0, 0.29, 8, 0.6, 0.025);
  part('Elbow_Drum_R', 'Upper').cylZ('navy', L1, 0, -0.56, -0.42, 0.30).cylZ('steel', L1, 0, -0.62, -0.56, 0.16);
  {
    const p = part('Upper_Lugs', 'Upper');
    for (const z of [0.10, -0.17]) {
      p.plate('steel', link2d(EL.tp[1] - 0.2, 0.22, 0.14), z, z + 0.07, { at: [EL.tp[0], 0.2], rz: 90 });
      p.plate('steel', link2d(-SH.bp[1] - 0.2, 0.22, 0.14), z, z + 0.07, { at: [SH.bp[0], -0.2], rz: -90 });
    }
    p.cylZ('chrome', EL.tp[0], EL.tp[1], -0.2, 0.2, 0.055, { col: false }).cylZ('chrome', SH.bp[0], SH.bp[1], -0.2, 0.2, 0.06, { col: false });
  }

  // ── 前臂：肘的舌、往後伸的搖臂（油壓缸推這裡）、梁、白殼、腕那頭的叉、腕馬達鼓 ──
  {
    const p = part('Forearm', 'Fore').cylZ('steel', 0, 0, -0.27, 0.27, 0.30);
    const hl = Math.hypot(EL.bp[0], EL.bp[1]), hr = Math.atan2(EL.bp[1], EL.bp[0]) / D;
    for (const z of [0.10, -0.17]) p.plate('steel', link2d(hl, 0.26, 0.13), z, z + 0.07, { rz: hr });
    p.cylZ('chrome', EL.bp[0], EL.bp[1], -0.2, 0.2, 0.05, { col: false });
    p.plate('navy', link2d(L2 - 0.75, 0.27, 0.22), -0.24, 0.24, { bevel: 0.03 });
    p.box('white', 0.6, L2 - 1.05, -0.29, 0.29, -0.27, 0.27);
    for (const s of [1, -1]) {
      p.box('navy', 0.8, L2 - 1.25, -0.05, 0.05, Math.min(s * 0.27, s * 0.28), Math.max(s * 0.27, s * 0.28), { col: false });
      p.box('glow', 1.0, L2 - 1.45, -0.015, 0.015, Math.min(s * 0.28, s * 0.287), Math.max(s * 0.28, s * 0.287), { col: false });
    }
    for (const z of [0.16, -0.24]) p.plate('steel', link2d(0.9, 0.22, 0.2, L2 - 0.9), z, z + 0.08);
  }
  part('Wrist_Drum_L', 'Fore').cylZ('navy', L2, 0, 0.24, 0.36, 0.2).cylZ('white', L2, 0, 0.36, 0.4, 0.13);
  part('Wrist_Drum_R', 'Fore').cylZ('navy', L2, 0, -0.34, -0.24, 0.18);

  // ── 手腕（俯仰）＋ 手（旋轉環、掌、感測燈、三個爪座）──
  part('Wrist_Block', 'Wrist').cylZ('steel', 0, 0, -0.14, 0.14, 0.19).box('steel', 0.05, 0.42, -0.15, 0.15, -0.14, 0.14).cylX('navy', 0.36, 0.585, 0, 0, 0.28).cylX('steel', 0.585, 0.615, 0, 0, 0.31, { col: false });
  {
    const p = part('Palm', 'Hand').cylX('steel', 0.01, 0.10, 0, 0, 0.26).boltsX(0.10, 0.02, 0, 0, 0.3, 12, 0.02).cylX('white', 0.10, 0.34, 0, 0, [0.30, 0.34]).cylX('navy', 0.34, 0.38, 0, 0, 0.34).cylX('glow', 0.38, 0.4, 0, 0, 0.09, { col: false });
    for (let i = 0; i < 3; i++) for (const z of [0.1, -0.16]) p.box('steel', 0.3, 0.56, 0.2, 0.38, z, z + 0.06, { m: new THREE.Matrix4().makeRotationX(i * 120 * D), col: false });
  }
  for (const k of ['A', 'B', 'C']) {
    const kx = 0.5, ky = 0.22, tx = 0.95, ty = -0.05, rb = Math.atan2(ty - ky, tx - kx) / D;
    part('Claw_Finger_' + k, 'Claw_' + k).cylZ('steel', 0, 0, -0.095, 0.095, 0.08)
      .plate('white', link2d(Math.hypot(kx, ky), 0.085, 0.07), -0.06, 0.06, { rz: Math.atan2(ky, kx) / D, trim: 0.06 })
      .plate('white', link2d(Math.hypot(tx - kx, ty - ky), 0.07, 0.05), -0.06, 0.06, { at: [kx, ky], rz: rb, trim: 0.04 })
      .cylZ('navy', kx, ky, -0.07, 0.07, 0.075, { col: false })
      .box('orange', -0.2, 0.03, -0.085, -0.045, -0.07, 0.07, { at: [tx, ty], rz: rb, col: false });
  }

  // ── 油壓缸：缸筒（上一段）＋ 活塞桿（下一段），各自繞自己的銷，互相對準 ──
  for (const [n, A] of [['Sh', SH], ['El', EL]]) {
    const rc = A.rc, ez = n === 'Sh' ? 0.11 : 0.085;
    part(`Act_${n}_Barrel`, `Act_${n}_Cyl`).cylZ('steel', 0, 0, -ez, ez, rc * 0.8).box('steel', 0, 0.22, -rc * 0.5, rc * 0.5, -ez, ez, { col: false })
      .cylX('steel', 0.16, 0.24, 0, 0, rc * 1.12, { col: false }).cylX('navy', 0.2, A.Lc, 0, 0, rc)
      .cylX('steel', A.Lc - 0.1, A.Lc, 0, 0, rc * 1.12, { col: false }).box('steel', 0.3, 0.5, rc * 0.8, rc * 1.25, -0.05, 0.05, { col: false });
    part(`Act_${n}_Piston`, `Act_${n}_Rod`).cylZ('steel', 0, 0, -ez + 0.02, ez - 0.02, rc * 0.75).cylX('chrome', 0.06, A.Lr, 0, 0, rc * 0.5);
  }

  // 規矩：網格不能跟骨頭同名
  for (const p of parts) { if (B[p.name]) throw new Error('網格跟骨頭同名：' + p.name); B[p.bone].add(p.mesh()); }

  const M = {
    root: B.Root, bones: B, parts, dim: DIM, joints: JOINTS, act: { sh: SH, el: EL }, mats: MATS,
    ang: Object.fromEntries(JOINTS.map((j) => [j.key, j.rest])),
    // 參數 0～1 ↔ 角度；超出範圍一律夾住
    set(key, deg) { const j = JMAP[key]; this.ang[key] = Math.max(j.min, Math.min(j.max, deg)); return this; },
    setParam(key, p) { const j = JMAP[key]; return this.set(key, j.min + (j.max - j.min) * p); },
    param(key) { const j = JMAP[key]; return (this.ang[key] - j.min) / (j.max - j.min); },
    rest() { for (const j of JOINTS) this.ang[j.key] = j.rest; return this; },
    pose() {
      const a = this.ang;
      B.Yaw.rotation.y = a.yaw * D; B.Upper.rotation.z = a.sh * D; B.Fore.rotation.z = a.el * D; B.Wrist.rotation.z = a.wr * D; B.Hand.rotation.x = a.roll * D;
      for (const k of ['A', 'B', 'C']) B['Claw_' + k].rotation.z = a.grip * D;
      for (const [n, A, q] of [['Sh', SH, a.sh * D], ['El', EL, a.el * D]]) {
        const bx = A.J[0] + A.bp[0] * Math.cos(q) - A.bp[1] * Math.sin(q), by = A.J[1] + A.bp[0] * Math.sin(q) + A.bp[1] * Math.cos(q);
        const dir = Math.atan2(by - A.tp[1], bx - A.tp[0]);
        B[`Act_${n}_Cyl`].rotation.z = dir; B[`Act_${n}_Rod`].rotation.z = dir + Math.PI - q; A.len = Math.hypot(bx - A.tp[0], by - A.tp[1]);
      }
      return this;
    },
    // 反向運動學（圓柱座標）：工具中心點到（迴轉角 yaw、離軸距離 r、高度 y），工具的俯仰角 phi（-90＝朝下）。回傳到不到得了
    ikPolar(yaw, r, y, phi = -90) {
      const f = phi * D, wx = r - L3 * Math.cos(f), wy = y - H - L3 * Math.sin(f), d0 = Math.hypot(wx, wy), d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(L1 + L2 - 1e-3, d0));
      const sh = (Math.atan2(wy, wx) + Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))) / D, el = -(180 - Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)) / D), wr = phi - sh - el;
      const want = { yaw, sh, el, wr }; let ok = Math.abs(d0 - d) < 1e-6;
      for (const k in want) { this.set(k, want[k]); if (Math.abs(this.ang[k] - want[k]) > 1e-6) ok = false; }
      return ok;
    },
    ik(P, phi = -90) { const p = B.Root.worldToLocal(P.clone()); return this.ikPolar(Math.atan2(-p.z, p.x) / D, Math.hypot(p.x, p.z), p.y, phi); },
    tcp(out = new THREE.Vector3()) { B.Root.updateMatrixWorld(true); return out.setFromMatrixPosition(B.TCP.matrixWorld); },
    info() {
      const P = (b) => (b.parent && B[b.parent.name] === b.parent ? b.parent.name : null);
      return {
        units: 'm', up: 'y', tris: parts.reduce((s, p) => s + p.tris, 0), dim: DIM,
        joints: JOINTS.map((j) => ({ ...j, param: '0..1 → min..max（度）', clip: j.key + '_param' })),
        bones: Object.values(B).map((b) => ({ name: b.name, parent: P(b), pos: b.position.toArray().map((v) => +v.toFixed(4)) })),
        actuators: Object.fromEntries(Object.entries(this.act).map(([k, A]) => [k, { top_anchor: A.tp, bot_anchor: A.bp.map((v) => +v.toFixed(4)), stroke: [+A.lo.toFixed(3), +A.hi.toFixed(3)], min_lever: +A.lever.toFixed(3), cylinder: +A.Lc.toFixed(3), rod: +A.Lr.toFixed(3) }])),
        parts: parts.map((p) => ({ name: p.name, bone: p.bone, tris: p.tris, colliders: p.cols.length })),
      };
    },
  };
  B.Root.userData.arm = { joints: JOINTS, dim: DIM };   // 匯出到 GLB 的 extras：拿到模型的人知道每個參數是什麼
  return M.pose();
}
