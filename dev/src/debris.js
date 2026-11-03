// ═══════════════════════ 場景破壞與殘留物（只管畫面）═══════════════════════
// 被擊沉的船、被打中的小行星、倒塌的建築留下的東西。全部用 Math.random，不碰模擬的 rnd()，回放時細節可能不同
//   碎片：每塊一個 instance，位置在 GPU 上依時間算（太空＝漂走、慢慢減速、一直翻滾；近地＝拋物線落地後停住）
//         剛炸開時邊緣燒紅、幾秒後冷卻；壽命到了縮小消失（環形緩衝，滿了就蓋掉最舊的）
//   燃燒殘骸：大船沉沒時留下 1～2 塊大殘骸，持續冒火花（近地：落地後起火冒煙）
//   小行星凹坑：打在實體小行星上的光束把表面炸凹、燒黑，噴出碎石（新的一場復原）
//   建築瓦礫：近地建築倒塌時噴出水泥塊
// 對外：debrisShipKill、debrisRockHit、debrisBld、debrisCrash（由戰鬥結算呼叫）、debrisFrame（每幀）、debrisReset（新的一場）
// 設定：SETTINGS.debris＝'high'｜'low'｜'off'（畫面設定的「殘骸與碎片」）
const DEB_MAX = 12000, DEB_G = 1.6;   // 碎片上限、近地的重力（世界單位／秒²，跟墜落殘骸的速度差不多）
const DEB = { head: 0, lo: -1, hi: -1, hulks: [], fxT: 0, bldBudget: 0, rocks: [] };
const debOn = () => (typeof SETTINGS === 'undefined' ? 'high' : SETTINGS.debris || 'high') !== 'off';
const debMul = () => ((typeof SETTINGS !== 'undefined' && SETTINGS.debris === 'low') ? 0.45 : 1);

const debGeo = new THREE.InstancedBufferGeometry();
const debA = new Float32Array(DEB_MAX * 4), debB = new Float32Array(DEB_MAX * 4), debC = new Float32Array(DEB_MAX * 4), debD = new Float32Array(DEB_MAX * 4), debE = new Float32Array(DEB_MAX * 4);
{
  // 一塊不規則的碎片：二十面體的頂點亂推，展開成平面著色（每個面自己的法線）
  const ico = new THREE.IcosahedronGeometry(1, 0), P = ico.attributes.position, R = mulberry32(9137);
  const jit = new Map();
  for (let i = 0; i < P.count; i++) {
    const k = `${P.getX(i).toFixed(3)},${P.getY(i).toFixed(3)},${P.getZ(i).toFixed(3)}`;
    if (!jit.has(k)) jit.set(k, 0.55 + R() * 0.6);
    const s = jit.get(k); P.setXYZ(i, P.getX(i) * s, P.getY(i) * s, P.getZ(i) * s);
  }
  ico.computeVertexNormals();
  debGeo.setAttribute('position', ico.attributes.position); debGeo.setAttribute('normal', ico.attributes.normal);
  for (const [n, a] of [['iA', debA], ['iB', debB], ['iC', debC], ['iD', debD], ['iE', debE]]) debGeo.setAttribute(n, new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage));
  debGeo.instanceCount = DEB_MAX;
}
const debMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uSun: { value: new THREE.Vector3(-0.5, 0.8, 0.35).normalize() }, uG: { value: DEB_G } },
  vertexShader: /* glsl */`
    uniform float uTime; uniform vec3 uSun; uniform float uG;
    attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD; attribute vec4 iE;
    varying vec3 vN; varying vec3 vCol; varying float vHeat; varying float vSeed; varying vec3 vL; varying vec3 vF; varying float vEmb;
    float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
    vec3 rot(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1. - c); }
    void main(){
      // iA＝起點、誕生時間；iB＝速度、大小；iC＝種子、轉速、落地時間（＜0＝太空）、壽命；iD＝落地點、熱度；iE＝顏色、形狀（0 塊狀、1 板狀）
      float age = uTime - iA.w;
      if (iB.w <= 0. || age < 0. || age > iC.w) { gl_Position = vec4(2., 2., 2., 1.); return; }
      vec3 p; float ang;
      if (iC.z < 0.) {   // 太空：開始很快、慢慢減速，最後保留一點漂移
        float k = .45;
        p = iA.xyz + iB.xyz * ((1. - exp(-k * age)) / k + .04 * age);
        ang = iC.y * (age * .35 + (1. - exp(-age)) * 1.5);
      } else {           // 近地：拋物線，落地後停住
        float ta = min(age, iC.z);
        p = age >= iC.z ? iD.xyz : iA.xyz + iB.xyz * ta - vec3(0., .5 * uG * ta * ta, 0.);
        ang = iC.y * ta;
      }
      float sd = iC.x;
      vec3 ax = normalize(vec3(h1(sd) - .5, h1(sd + 1.3) - .5, h1(sd + 2.7) - .5) + 1e-3);
      vec3 sc = iB.w * (iE.w > .5 ? vec3(.9 + .6 * h1(sd + 4.), .12 + .1 * h1(sd + 5.), .7 + .5 * h1(sd + 6.))   // 板狀（船殼、牆）
                                  : vec3(.6 + .8 * h1(sd + 4.), .4 + .6 * h1(sd + 5.), .6 + .8 * h1(sd + 6.)));
      sc *= smoothstep(iC.w, iC.w - 4., age);   // 壽命到了縮小消失
      vec3 v = rot(position * sc, ax, ang + sd * 6.283);
      vN = normalize(rot(normal / max(sc, vec3(1e-4)), ax, ang + sd * 6.283));
      gl_Position = projectionMatrix * viewMatrix * vec4(p + v, 1.);
      vCol = iE.rgb; vSeed = sd; vL = uSun; vF = normal; vEmb = iD.w > 1.5 ? 1. : 0.;
      // 熱度：剛炸開燒紅（iD.w 1＝金屬），＞1.5＝燃燒殘骸（長時間閃爍）
      vHeat = iD.w > 1.5 ? (.55 + .45 * sin(uTime * (5. + 4. * h1(sd + 8.)) + sd * 40.)) * (1. - smoothstep(18., 32., age)) * 1.6
                         : iD.w * exp(-age / 2.5) * 1.6;
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vN; varying vec3 vCol; varying float vHeat; varying float vSeed; varying vec3 vL; varying vec3 vF; varying float vEmb;
    void main(){
      vec3 N = normalize(vN);
      float d = max(dot(N, vL), 0.), back = max(-N.y, 0.) * .15;
      vec3 col = vCol * (.22 + .95 * d + back);
      float hf = fract(sin(dot(floor(vF * 4. + .5), vec3(12.9898, 78.233, 37.719)) + vSeed) * 43758.5);   // 每個面固定的亂數：殘骸只有部分的面在燒
      float face = vEmb > .5 ? smoothstep(.55, .75, hf) : .35 + .65 * hf;
      col += vec3(1., .42, .12) * vHeat * face * (.45 + .55 * (1. - abs(N.y)));   // 燒紅的面（側面較亮，像裂開的斷面）
      gl_FragColor = vec4(col, 1.);
    }`,
});
const debMesh = new THREE.Mesh(debGeo, debMat);
debMesh.frustumCulled = false; debMesh.renderOrder = 2;
scene.add(debMesh);

// 一塊碎片：起點、速度、大小、顏色、壽命；ground＝近地拋物線（自動算落地點）；heat 0 冷、1 燒紅、2 燃燒殘骸；plate＝板狀
function debPiece(x, y, z, vx, vy, vz, t0, size, col, life, ground, heat = 0, plate = false, spin = 1) {
  const i = DEB.head; DEB.head = (DEB.head + 1) % DEB_MAX;
  debA.set([x, y, z, t0], i * 4);
  debB.set([vx, vy, vz, size], i * 4);
  let tl = -1, lx = 0, ly = 0, lz = 0;
  if (ground) {   // 落地時間：解 y0 + vy·t − g t²/2 = 地表高度（地表高度用落點附近的，算兩次就夠準）
    let gy = debGround(x, z) + size * 0.25;
    for (let k = 0; k < 3; k++) {
      const dy = y - gy, s = vy * vy + 2 * DEB_G * dy;
      tl = s > 0 ? (vy + Math.sqrt(s)) / DEB_G : 0.05;
      lx = x + vx * tl; lz = z + vz * tl; gy = debGround(lx, lz) + size * 0.25;
    }
    ly = gy;
  }
  debC.set([Math.random() * 100, (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 1.6) * spin, tl, life], i * 4);
  debD.set([lx, ly, lz, heat], i * 4);
  debE.set([col[0], col[1], col[2], plate ? 1 : 0], i * 4);
  if (DEB.lo < 0) DEB.lo = DEB.hi = i; else { DEB.lo = Math.min(DEB.lo, i); DEB.hi = Math.max(DEB.hi, i); }   // 繞回開頭時整段更新
  return i;
}
// 碎片在 t 時的位置（CPU 版，給燃燒殘骸冒火用；和著色器一樣的算式）
function debPos(i, t, out) {
  const age = t - debA[i * 4 + 3], tl = debC[i * 4 + 2];
  if (tl < 0) { const k = 0.45, f = (1 - Math.exp(-k * age)) / k + 0.04 * age; out.x = debA[i * 4] + debB[i * 4] * f; out.y = debA[i * 4 + 1] + debB[i * 4 + 1] * f; out.z = debA[i * 4 + 2] + debB[i * 4 + 2] * f; return false; }
  if (age >= tl) { out.x = debD[i * 4]; out.y = debD[i * 4 + 1]; out.z = debD[i * 4 + 2]; return true; }
  out.x = debA[i * 4] + debB[i * 4] * age; out.y = debA[i * 4 + 1] + debB[i * 4 + 1] * age - 0.5 * DEB_G * age * age; out.z = debA[i * 4 + 2] + debB[i * 4 + 2] * age;
  return false;
}
function debGround(x, z) { return !GRD ? -1e9 : GRD.hf ? terrainSurfaceAt(GRD, x, z) : terrainHAt(x, z); }
const _debV = new THREE.Vector3(), _debC = new THREE.Color();
// 隨機方向（單位球面）
function debDir() { const u = Math.random() * 2 - 1, a = Math.random() * TAU, s = Math.sqrt(1 - u * u); _debV.set(s * Math.cos(a), u, s * Math.sin(a)); return _debV; }
// 船殼顏色：深灰金屬，帶一點陣營色
function debHullCol(side) {
  _debC.set(FACTION[SIDE_FAC[side]] ? FACTION[SIDE_FAC[side]].ui : '#999');
  const v = 0.75 + Math.random() * 0.4;
  return [(0.06 + _debC.r * 0.05) * v, (0.065 + _debC.g * 0.05) * v, (0.075 + _debC.b * 0.05) * v];
}

// ── 船被擊沉：碎片四散，大船留下燃燒的殘骸 ──
const DEB_N = [16, 13, 9, 6, 4, 8];   // 航母 戰列 巡洋 驅逐 護衛 補給：每艘的碎片數
function debrisShipKill(i, t, x, y, z) {
  if (!debOn()) return;
  const ty = ships.type[i], side = ships.side[i], W = TYPE_W[ty] || 4, gnd = !!GRD;
  const n = Math.max(2, Math.round(DEB_N[ty] * debMul())), life = gnd ? 240 : 70 + Math.random() * 40;
  // 船原本的移動方向：碎片會帶著它（看起來是從移動中的船上剝落）
  const q = squadrons[ships.sq[i]], h = q ? q.h || 0 : 0, mx = Math.sin(h) * 0.8, mz = Math.cos(h) * 0.8;
  for (let k = 0; k < n; k++) {
    const d = debDir(), s = (1.5 + Math.random() * 3.5) * (0.6 + W * 0.12), sz = W * (0.035 + Math.random() * 0.06);
    debPiece(x + d.x * W * 0.2, y + d.y * W * 0.15, z + d.z * W * 0.2, d.x * s + mx, d.y * s * (gnd ? 0.5 : 0.6) + (gnd ? 1.5 : 0), d.z * s + mz, t, sz, debHullCol(side), life, gnd, Math.random() < 0.6 ? 1 : 0, Math.random() < 0.45);
  }
  if (ty <= 2 || ty === 5) {   // 大船：斷成兩截的殘骸，慢慢漂開、冒火
    const nh = ty <= 1 ? 2 : 1;
    for (let k = 0; k < nh; k++) {
      const a = h + (k ? Math.PI : 0) + (Math.random() - 0.5) * 0.6, s = 0.5 + Math.random() * 0.6;
      const j = debPiece(x + Math.sin(a) * W * 0.15, y, z + Math.cos(a) * W * 0.15, Math.sin(a) * s + mx * 0.6, (Math.random() - 0.5) * 0.3 + (gnd ? 0.6 : 0), Math.cos(a) * s + mz * 0.6, t, W * (0.17 + Math.random() * 0.06), debHullCol(side).map((c) => c * 0.7), gnd ? 300 : 110, gnd, 2, Math.random() < 0.5, 0.25);
      DEB.hulks.push({ i: j, side, t0: debA[j * 4 + 3], until: t + (gnd ? 60 : 28) + Math.random() * 10, acc: Math.random(), W });
    }
    if (DEB.hulks.length > 60) DEB.hulks.splice(0, DEB.hulks.length - 60);
  }
}

// ── 小行星被打中：表面炸凹、燒黑，噴出碎石 ──
// drawField 建好的實體小行星網格（rockMesh 會登記在這裡）
const DEB_ROCK_L = new THREE.Vector3(-0.5, 0.8, 0.35).normalize();   // 跟 rockMesh 烤進頂點色的光一樣
function debRockReg(mesh, tr) { DEB.rocks.push({ mesh, tr, craters: [], orig: null }); }
function debRockClear() { DEB.rocks.length = 0; }
function debrisRockHit(x, y, z) {
  if (!debOn() || GRD) return;
  let R = null, d = 0;
  for (const r of DEB.rocks) {
    const tr = r.tr, dd = Math.hypot(x - tr.x, y - (tr.y || 0), z - tr.z);
    if (Math.abs(dd - tr.r) < tr.r * 0.3 + 4) { R = r; d = dd; break; }
  }
  if (!R) return;
  const tr = R.tr, cy = tr.y || 0, nx = (x - tr.x) / (d || 1), ny = (y - cy) / (d || 1), nz = (z - tr.z) / (d || 1), t = U.uTime.value;
  const base = new THREE.Color(TERRAIN_TYPES[tr.type].color);
  // 碎石：沿著表面法線噴出去
  const n = Math.max(1, Math.round((3 + Math.random() * 3) * debMul()));
  for (let k = 0; k < n; k++) {
    const r = debDir(), s = 2 + Math.random() * 5, v = 0.6 + Math.random() * 0.5;
    debPiece(x, y, z, (nx + r.x * 0.7) * s, (ny + r.y * 0.7) * s, (nz + r.z * 0.7) * s, t, 0.25 + Math.random() * 0.7, [base.r * v, base.g * v, base.b * v], 40 + Math.random() * 30, false, Math.random() < 0.3 ? 0.6 : 0);
  }
  // 凹坑：太多、或離舊的太近就不再挖（只噴碎石）
  const cr = Math.max(3, Math.min(16, tr.r * (0.07 + Math.random() * 0.07)));
  if (R.craters.length >= 60 || R.craters.some((c) => (c[0] - nx) ** 2 + (c[1] - ny) ** 2 + (c[2] - nz) ** 2 < (cr / tr.r * 0.7) ** 2)) return;
  R.craters.push([nx, ny, nz]);
  const geo = R.mesh.geometry, P = geo.attributes.position, C = geo.attributes.color, A = P.array;
  if (!R.orig) { R.orig = [A.slice(), C.array.slice()]; R.burn = new Float32Array(P.count).fill(1); }
  const depth = cr * 0.45, rim = cr * 1.4, tris = new Set();
  for (let k = 0; k < P.count; k++) {
    const px = A[k * 3], py = A[k * 3 + 1], pz = A[k * 3 + 2], L = Math.hypot(px, py, pz) || 1;
    const dd = Math.hypot(nx * L - px, ny * L - py, nz * L - pz);
    if (dd > rim) continue;
    const u = dd / cr;
    let push;
    if (u < 1) { push = -depth * (1 - u * u); R.burn[k] *= 0.45 + 0.55 * u * u; }   // 坑底最黑
    else push = depth * 0.25 * (1 - (dd - cr) / (rim - cr));   // 坑緣隆起
    const f = Math.max(tr.r * 0.6, L + push) / L;
    A[k * 3] = px * f; A[k * 3 + 1] = py * f; A[k * 3 + 2] = pz * f;
    tris.add((k / 3) | 0);
  }
  // 重新打光：被推動的三角面用新的面法線（跟 rockMesh 一樣的光，坑壁才看得出凹下去）
  const Ld = DEB_ROCK_L;
  for (const f of tris) {
    const a = f * 9;
    const ux = A[a + 3] - A[a], uy = A[a + 4] - A[a + 1], uz = A[a + 5] - A[a + 2], vx = A[a + 6] - A[a], vy = A[a + 7] - A[a + 1], vz = A[a + 8] - A[a + 2];
    let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; const cl = Math.hypot(cx, cy, cz) || 1; cx /= cl; cy /= cl; cz /= cl;
    const sh = 0.18 + 0.82 * Math.max(0, cx * Ld.x + cy * Ld.y + cz * Ld.z) + 0.08 * Math.max(0, -cy);
    for (let m = 0; m < 3; m++) {
      const k = f * 3 + m, s = sh * (0.9 + 0.2 * Math.sin(k * 1.7)) * R.burn[k];
      C.array[k * 3] = base.r * s; C.array[k * 3 + 1] = base.g * s; C.array[k * 3 + 2] = base.b * s * 0.95;
    }
  }
  P.needsUpdate = true; C.needsUpdate = true;
  spawnFx(x + nx, y + ny, z + nz, 0, 1.2 + cr * 0.5, 20);   // 炸開的塵土
}

// ── 近地：建築倒塌噴出瓦礫；墜落的殘骸撞地時留下燒著的船殼 ──
function debrisBld(i) {
  const B = GV.bld; if (!debOn() || !B || DEB.bldBudget <= 0) return;
  DEB.bldBudget--;
  const x = B.iA[i * 4], z = B.iA[i * 4 + 1], w = B.iA[i * 4 + 2], dp = B.iA[i * 4 + 3], h = B.iB[i * 4], y0 = B.ic.array[i * 4 + 2], t = U.uTime.value;
  const n = Math.max(1, Math.round(Math.min(7, 2 + h / 3) * debMul())), sz = Math.min(w, dp);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * TAU, s = 0.8 + Math.random() * 2.2, v = 0.55 + Math.random() * 0.35;
    debPiece(x + (Math.random() - 0.5) * w * 0.6, y0 + h * (0.3 + Math.random() * 0.6), z + (Math.random() - 0.5) * dp * 0.6, Math.cos(a) * s, 1 + Math.random() * 2.5, Math.sin(a) * s, t,
      Math.max(0.25, sz * (0.08 + Math.random() * 0.12)), [0.36 * v, 0.35 * v, 0.33 * v], 300, true, Math.random() < 0.2 ? 0.5 : 0, Math.random() < 0.4);
  }
}
function debrisCrash(x, gy, z, sz, side) {
  if (!debOn()) return;
  const t = U.uTime.value, n = Math.max(2, Math.round(6 * debMul()));
  for (let k = 0; k < n; k++) {
    const a = Math.random() * TAU, s = 1 + Math.random() * 3;
    debPiece(x, gy + 0.5, z, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, t, sz * (0.06 + Math.random() * 0.08), debHullCol(side), 300, true, 1, Math.random() < 0.5);
  }
  const j = debPiece(x, gy + 0.3, z, 0, 0.4, 0, t, sz * 0.3, debHullCol(side).map((c) => c * 0.6), 400, true, 2, false, 0.1);
  DEB.hulks.push({ i: j, side, t0: debA[j * 4 + 3], until: t + 60 + Math.random() * 30, acc: 0, W: sz });
}

// ── 每幀：更新有變動的碎片、燃燒殘骸冒火冒煙 ──
const _debP = { x: 0, y: 0, z: 0 };
function debrisFrame() {
  debMesh.visible = debOn();
  DEB.bldBudget = 40;
  if (DEB.lo >= 0) {
    const n = DEB.hi - DEB.lo + 1;
    for (const nm of ['iA', 'iB', 'iC', 'iD', 'iE']) { const a = debGeo.getAttribute(nm); a.clearUpdateRanges(); a.addUpdateRange(DEB.lo * 4, n * 4); a.needsUpdate = true; }
    DEB.lo = DEB.hi = -1;
  }
  const t = U.uTime.value; let dt = t - DEB.fxT; DEB.fxT = t;
  if (dt < 0 || dt > 2) dt = dt < 0 ? 0 : 2;
  if (!DEB.hulks.length || dt === 0) return;
  for (let k = DEB.hulks.length - 1; k >= 0; k--) {
    const H = DEB.hulks[k];
    if (t > H.until || debA[H.i * 4 + 3] !== H.t0) { DEB.hulks.splice(k, 1); continue; }   // 燒完了、或那一格已經被新的碎片蓋掉
    H.acc += dt * (GRD ? 2.5 : 3.5);
    while (H.acc >= 1) {
      H.acc -= 1;
      const landed = debPos(H.i, t, _debP), j = () => (Math.random() - 0.5) * H.W * 0.35;
      if (GRD && typeof smokePuff === 'function') {   // 近地：黑煙（落地後更濃），加上火光
        smokePuff(_debP.x + j(), _debP.y + 0.3, _debP.z + j(), t, landed ? 14 + Math.random() * 8 : 6, H.W * 0.15, H.W * (landed ? 1.6 : 0.8), landed ? 1.6 : 0.5, WIND[0] * 0.5, WIND[1] * 0.5, 0.6);
        if (Math.random() < 0.5) smokePuff(_debP.x + j(), _debP.y + 0.2, _debP.z + j(), t, 0.7, H.W * 0.12, H.W * 0.22, 0.6, 0, 0, 2);
      } else if (Math.random() < 0.6) spawnFx(_debP.x + j(), _debP.y + j() * 0.5, _debP.z + j(), H.side, 0.35 + Math.random() * H.W * 0.12, 16 + Math.random() * 8);   // 太空：零星的小爆炸、火花
    }
  }
}
// 新的一場：碎片清空、小行星復原
function debrisReset() {
  debB.fill(0); DEB.head = 0; DEB.lo = 0; DEB.hi = DEB_MAX - 1; DEB.hulks.length = 0; DEB.fxT = U.uTime.value;
  for (const r of DEB.rocks) {
    if (!r.orig) continue;
    const g = r.mesh.geometry; g.attributes.position.array.set(r.orig[0]); g.attributes.color.array.set(r.orig[1]);
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true; r.orig = null; r.craters.length = 0;
  }
}
