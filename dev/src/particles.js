// ═══════════════════════ 粒子特效：GPU 粒子層（移植自 rubicon-protocol 的 src/fx/gpu.js、atlas.js，MIT） ═══════════════════════
// 疊在原本的 fx.webp 序列圖上面：序列圖負責爆炸的本體，粒子負責飛濺的火花、膨脹的火球、殘煙、閃光、衝擊環、護盾的電弧。
// 做法（rubicon 參考 wawa-vfx，MIT）：粒子產生時把參數寫進實例緩衝區一次，之後每幀只更新 uTime，
//   位置（速度＋阻力＋重力的解析解）、大小、顏色、旋轉、淡出都在頂點著色器裡依年齡算。一種畫法＝一次 draw call。
// 時鐘＝遊戲時間 U.uTime（暫停時停住、快轉時跟著快）；新戰鬥時間歸零就全部清掉。
// 不用遊戲的 rnd()、不改任何遊戲狀態：回放、多人、模擬的結果不受影響。
// 拉遠時（投影後小於幾個像素）、畫面外不產生；每幀有粒子預算（設定「粒子特效」）。
// 貼圖：程式產生的 8×4 格灰階圖集（1024×512，只用 R 通道），不需要外部檔案。

let pfxSeed = 0x2f6b1d3 >>> 0;
function pfxRnd() {
  pfxSeed = (pfxSeed + 0x6d2b79f5) >>> 0;
  let t = pfxSeed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pfxR = (a, b) => a + pfxRnd() * (b - a);

// ───── 圖集（程式產生） ─────
const PC = { soft: 0, hard: 1, ring: 2, line: 3, shard: 4, core: 5, star: 6, spark: 7, puff: 8, puff2: 9, puff3: 10, flame: 11, flame2: 12, arc: 13, arc2: 14 };
const PFX_PUFF = [PC.puff, PC.puff2, PC.puff3], PFX_FLAME = [PC.flame, PC.flame2, PC.puff], PFX_ARC = [PC.arc, PC.arc2];
function pfxAtlas() {
  const W = 1024, H = 512, C = 128;
  const hash = (i, j, s) => { const h = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
  const vn = (x, y, s) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const fbm = (x, y, s) => vn(x, y, s) * 0.55 + vn(x * 2.1, y * 2.1, s + 3) * 0.3 + vn(x * 4.3, y * 4.3, s + 7) * 0.15;
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const line = (x, y) => Math.exp(-(x * x) / 0.02) * ss(1, 0.55, Math.abs(y));
  const core = (x, y) => { const r = Math.hypot(x, y); return Math.min(1, Math.exp(-r * r * 30) + 0.55 * Math.exp(-r * r * 4)) * ss(1, 0.85, r); };
  const puff = (x, y, s) => { const r = Math.hypot(x, y), n = fbm(x * 2.2 + 5, y * 2.2 + 5, s); return ss(0.95, 0.35, r + (n - 0.5) * 0.55) * (0.55 + 0.45 * n); };
  const flame = (x, y, s) => { const r = Math.hypot(x, y), n = fbm(x * 3 + 2, y * 3 + 2, s); return ss(0.9, 0.2, r + (n - 0.5) * 0.7) * (0.45 + 0.55 * n * n * 1.6); };
  // 電弧：幾條鋸齒狀的亮線從中心往外
  const arc = (x, y, s) => {
    const r = Math.hypot(x, y); if (r > 0.98) return 0;
    const a = Math.atan2(y, x); let v = 0;
    for (let i = 0; i < 5; i++) { const a0 = i / 5 * 6.283 + hash(i, 1, s) * 1.2, wig = (vn(r * 9 + i * 3.1, i, s) - 0.5) * 1.1; let da = a - a0 - wig; da = Math.atan2(Math.sin(da), Math.cos(da)); v = Math.max(v, ss(0.05, 0.012, Math.abs(da) * r + 0.004) * ss(0.95, 0.5, r)); }
    return Math.max(v, Math.exp(-r * r * 40) * 0.8);
  };
  const SH = [
    (x, y) => Math.exp(-(x * x + y * y) * 4.5) * ss(1, 0.85, Math.hypot(x, y)),   // soft
    (x, y) => ss(0.82, 0.74, Math.hypot(x, y)),   // hard
    (x, y) => { const r = Math.hypot(x, y); return Math.exp(-((r - 0.82) ** 2) / 0.004) + 0.25 * Math.exp(-((r - 0.7) ** 2) / 0.02); },   // ring
    line,
    (x, y) => ss(0.06, 0, Math.abs(x) - (1 - Math.abs(y)) * 0.28) * ss(1, 0.8, Math.abs(y)),   // shard
    core,
    (x, y) => Math.max(core(x, y), Math.max(line(x * 1.4, y), line(y * 1.4, x)) * 0.85),   // star
    (x, y) => Math.max(line(x, y), line(y, x)) * ss(1, 0.3, Math.hypot(x, y)),   // spark
    (x, y) => puff(x, y, 1), (x, y) => puff(x, y, 2), (x, y) => puff(x, y, 3),
    (x, y) => flame(x, y, 4), (x, y) => flame(x, y, 5),
    (x, y) => arc(x, y, 6), (x, y) => arc(x, y, 7),
  ];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data, pad = 3, inn = C - pad * 2;
  SH.forEach((f, slot) => {
    const cx = (slot % 8) * C, cy = Math.floor(slot / 8) * C;
    for (let yy = 0; yy < inn; yy++) for (let xx = 0; xx < inn; xx++) {
      const x = (xx + 0.5) / inn * 2 - 1, y = 1 - (yy + 0.5) / inn * 2, v = Math.max(0, Math.min(1, f(x, y)));
      d[((cy + pad + yy) * W + cx + pad + xx) * 4] = Math.round(v * 255);
    }
  });
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ───── 一種畫法的粒子系統（rubicon 的 GpuFx，改成 three r160） ─────
// 每顆 28 個 float：p (x,y,z,t0)  v (vx,vy,vz,life)  c0 (r,g,b,a)  c1 (r,g,b,occ)  s (size0,size1,rot0,rotSpeed)  m (gravity,drag,cell,fade)  d (axis xyz, aspect)
// mode：0 面向鏡頭、1 沿速度拉長（火花）
// fade：0 線性、1 平方、2 結尾才淡、3 淡入淡出、4 閃爍、5 先維持再淡出
// occ：0＝純加色（光、火花）、1＝一般混合（煙）、中間＝發光又遮住後面（火球）；混合一律預乘透明度
const PFX_STRIDE = 28, PFX_MAX = 32768;
const PFX_VS = /* glsl */`
#define MODE __MODE__
uniform float uTime, uSpd, uMaxL;
attribute vec4 aP, aV, aC0, aC1, aS, aM, aD;
varying vec2 vUv; varying vec4 vCol; varying float vCell, vOcc;
void main() {
  float age = uTime - aP.w, life = aV.w, t = age / max(life, 1e-4);
  if (life <= 0.0 || t < 0.0 || t >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); return; }
  float d = aM.y, ed = exp(-d * age);
  vec3 wp = aP.xyz + (d > 1e-3 ? aV.xyz * (1.0 - ed) / d : aV.xyz * age);
  wp.y -= 0.5 * aM.x * age * age;
  vec3 vel = aV.xyz * ed - vec3(0.0, aM.x * age, 0.0);
  float sz = mix(aS.x, aS.y, t), ang = aS.z + aS.w * age, ca = cos(ang), sa = sin(ang);
  vec2 q = vec2(ca * position.x - sa * position.y, sa * position.x + ca * position.y) * sz;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 off;
#if MODE == 0
  off = camR * q.x + camU * q.y;
#else
  bool hasAx = dot(aD.xyz, aD.xyz) > 1e-8;
  vec3 ax = hasAx ? aD.xyz : vel;
  float asp = abs(aD.w), len = hasAx ? asp : min(sz * asp + length(vel) * uSpd, uMaxL + sz * asp);
  vec3 eye = isOrthographic ? vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(cameraPosition - wp);
  vec3 dir = length(ax) > 1e-5 ? normalize(ax) : camU;
  vec3 up = dir - dot(dir, eye) * eye;
  up = length(up) > 1e-4 ? normalize(up) : camU;
  vec3 rt = normalize(cross(up, eye));
  off = rt * position.x * sz + up * (position.y + (aD.w < 0.0 ? 0.5 : 0.0)) * len;
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(wp + off, 1.0);
  float f = aM.w, fa;
  if (f < 0.5) fa = 1.0 - t;
  else if (f < 1.5) fa = (1.0 - t) * (1.0 - t);
  else if (f < 2.5) fa = 1.0 - t * t;
  else if (f < 3.5) fa = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t));
  else if (f < 4.5) fa = (1.0 - t) * (0.55 + 0.45 * sin(age * 38.0 + aP.x * 7.0 + aP.z * 3.0));
  else fa = t < 0.7 ? 1.0 : (1.0 - t) / 0.3;
  vCol = vec4(mix(aC0.rgb, aC1.rgb, t), aC0.a * fa);
  vOcc = aC1.w; vCell = aM.z; vUv = position.xy + 0.5;
}`;
const PFX_FS = /* glsl */`
uniform sampler2D uTex;
varying vec2 vUv; varying vec4 vCol; varying float vCell, vOcc;
void main() {
  float c = floor(vCell + 0.5), col = mod(c, 8.0), row = floor(c / 8.0);
  float m = texture2D(uTex, vec2((col + vUv.x) / 8.0, 1.0 - (row + 1.0 - vUv.y) / 4.0)).r;
  float a = min(vCol.a * m, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * a, a * vOcc);
}`;
const _pfxCol = new THREE.Color(), PFX_COLS = new Map();
function pfxRgb(hex) {   // 不做 sRGB → 線性的轉換（和原本的特效、rubicon 的 r128 一樣：直接當成數值）
  let c = PFX_COLS.get(hex);
  if (!c) { _pfxCol.setHex(hex, THREE.LinearSRGBColorSpace); c = [_pfxCol.r, _pfxCol.g, _pfxCol.b]; PFX_COLS.set(hex, c); }
  return c;
}
class PfxSys {
  constructor(o) {
    this.mode = o.mode || 0; this.add = o.add !== false; this.n = 0; this.cur = 0; this.lo = Infinity; this.hi = -1; this.time = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: PFX.tex, uTime: { value: 0 }, uSpd: { value: o.spd || 0 }, uMaxL: { value: o.maxL || 1e3 } },
      vertexShader: PFX_VS.replace('__MODE__', String(this.mode)), fragmentShader: PFX_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.order = o.order;
    this.grow(o.cap || 1024);
  }
  grow(cap) {
    const old = this.arr; this.cap = cap; this.arr = new Float32Array(cap * PFX_STRIDE); if (old) this.arr.set(old);
    const g = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1);
    g.setIndex(quad.index); g.setAttribute('position', quad.attributes.position);
    const buf = new THREE.InstancedInterleavedBuffer(this.arr, PFX_STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    ['aP', 'aV', 'aC0', 'aC1', 'aS', 'aM', 'aD'].forEach((nm, i) => g.setAttribute(nm, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
    g.instanceCount = this.n; this.buf = buf;
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.geometry = g; }
    else { this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = this.order; scene.add(this.mesh); }
    this.lo = 0; this.hi = this.n - 1;
  }
  alive(i) { const a = this.arr, o = i * PFX_STRIDE; return a[o + 7] > 0 && this.time < a[o + 3] + a[o + 7]; }
  // e：{ x,y,z, vx,vy,vz, life, s0, s1, c0, c1, k, a, occ, cell, fade, g, drag, rot, rv, asp, delay }
  emit(e) {
    let i = this.cur;
    if (i < this.n && this.alive(i)) { if (this.n < this.cap) i = this.n; else if (this.cap < PFX_MAX) { this.grow(this.cap * 2); i = this.n; } }
    else if (i >= this.cap) { if (this.cap < PFX_MAX) this.grow(this.cap * 2); else i = 0; }
    if (i + 1 > this.n) this.n = i + 1;
    const a = this.arr, o = i * PFX_STRIDE, c0 = pfxRgb(e.c0), c1 = e.c1 != null ? pfxRgb(e.c1) : c0, k = e.k || 1;
    a[o] = e.x; a[o + 1] = e.y; a[o + 2] = e.z; a[o + 3] = U.uTime.value + (e.delay || 0);   // 遊戲時間（命中在模擬的 tick 裡處理，比上一幀的時鐘新）
    a[o + 4] = e.vx || 0; a[o + 5] = e.vy || 0; a[o + 6] = e.vz || 0; a[o + 7] = e.life;
    a[o + 8] = c0[0] * k; a[o + 9] = c0[1] * k; a[o + 10] = c0[2] * k; a[o + 11] = e.a != null ? e.a : 1;
    a[o + 12] = c1[0] * k; a[o + 13] = c1[1] * k; a[o + 14] = c1[2] * k; a[o + 15] = e.occ != null ? e.occ : this.add ? 0 : 1;
    a[o + 16] = e.s0; a[o + 17] = e.s1 != null ? e.s1 : e.s0; a[o + 18] = e.rot || 0; a[o + 19] = e.rv || 0;
    a[o + 20] = e.g || 0; a[o + 21] = e.drag || 0; a[o + 22] = e.cell; a[o + 23] = e.fade || 0;
    a[o + 24] = 0; a[o + 25] = 0; a[o + 26] = 0; a[o + 27] = e.asp != null ? e.asp : 1;
    this.cur = i + 1 >= this.n && !this.alive(0) ? 0 : i + 1;
    if (i < this.lo) this.lo = i; if (i > this.hi) this.hi = i;
    PFX.used++;
  }
  update(time) {
    this.time = time; this.mat.uniforms.uTime.value = time;
    if (this.hi >= this.lo) {
      const b = this.buf; b.clearUpdateRanges(); b.addUpdateRange(this.lo * PFX_STRIDE, (this.hi - this.lo + 1) * PFX_STRIDE); b.needsUpdate = true;
      this.mesh.geometry.instanceCount = this.n; this.lo = Infinity; this.hi = -1;
    }
    this.mesh.visible = this.n > 0;
  }
  clear() { this.arr.fill(0); this.n = 0; this.cur = 0; this.lo = Infinity; this.hi = -1; this.buf.clearUpdateRanges(); this.buf.needsUpdate = true; this.mesh.geometry.instanceCount = 0; this.mesh.visible = false; }
}

// ───── 粒子層 ─────
// 品質（SETTINGS.particles）：high／low／off → 每幀的粒子預算、數量倍率
const PFX_Q = { high: { budget: 1600, n: 1 }, low: { budget: 500, n: 0.5 }, off: { budget: 0, n: 0 } };
const PFX = { tex: null, sys: null, used: 0, q: PFX_Q.high, last: 0, shake: 0, shOff: new THREE.Vector3(), shOn: false, stat: { emitted: 0, skipped: 0, frames: 0 } };
function pfxInit() {
  if (PFX.sys) return true;
  if (typeof document === 'undefined') return false;
  PFX.tex = { value: pfxAtlas() };
  PFX.sys = {
    sm: new PfxSys({ add: false, order: 4 }),   // 煙（一般混合，先畫）
    gl: new PfxSys({ order: 5 }),   // 閃光、火球、餘燼、衝擊環
    ln: new PfxSys({ mode: 1, spd: 0.045, maxL: 9, order: 6 }),   // 火花（沿速度拉長）
  };
  return true;
}
// 這一點要不要產生粒子：回傳數量倍率（0＝不產生）。r＝特效的半徑（世界單位）；force＝超過預算也產生（大爆炸）
const _pfxV = new THREE.Vector3();
function pfxGate(x, y, z, r, force = false) {
  const Q = PFX.q;
  if (!Q.n || !PFX.sys) return 0;
  if (PFX.used >= Q.budget * (force ? 1.5 : 1)) { PFX.stat.skipped++; return 0; }
  _pfxV.set(x, y, z).project(camera);
  if (_pfxV.z > 1 || Math.abs(_pfxV.x) > 1.15 || Math.abs(_pfxV.y) > 1.15) return 0;   // 畫面外
  // 投影後的大小（像素）：太小＝原本的序列圖就夠了
  let px;
  if (camera.isOrthographicCamera) px = r * VH / (camera.top - camera.bottom);
  else { const d = camera.position.distanceTo(_pfxV.set(x, y, z)); px = r * VH / (2 * Math.tan(camera.fov * Math.PI / 360) * Math.max(1, d)); }
  if (px < 3) return 0;
  return Q.n * (px < 8 ? 0.5 : 1);
}
const pfxCnt = (n, m) => Math.max(1, Math.round(n * m));
// 方向隨機的速度
function pfxDir(spd, flat = 1) { const u = pfxR(-1, 1), a = pfxR(0, 6.2832), s = Math.sqrt(1 - u * u) * spd; return [Math.cos(a) * s, u * spd * flat, Math.sin(a) * s]; }

// 爆炸：r＝半徑、col＝火的顏色；big＝大船、flag＝旗艦（多一圈衝擊環、二次爆炸、很亮的閃光）
function pfxExplode(x, y, z, r, col = 0xff8030, big = false, flag = false) {
  const m = pfxGate(x, y, z, r, big || flag); if (!m) return;
  const S = PFX.sys, g = GRD ? 9 * r / 5 : 0;
  // 原本的序列圖已經有爆炸的亮光：這裡的閃光只要一點點（太大、太亮會跟 bloom 疊成一大片白）
  S.gl.emit({ x, y, z, life: flag ? 0.16 : 0.09, s0: r * 0.8, s1: r * (flag ? 2.6 : 1.6), c0: 0xfff0d0, k: flag ? 1.5 : 1.15, a: 0.8, cell: PC.core });
  if (big || flag) S.gl.emit({ x, y, z, life: 0.25, s0: r * 1.2, s1: r * 2.8, c0: col, k: 0.9, a: 0.45, cell: PC.soft });
  // 火球：幾團火焰由橘黃轉暗紅，往外膨脹、旋轉（遮住後面一點，不只是發光）
  for (let i = 0, n = pfxCnt(big ? 6 : 3, m); i < n; i++) {
    const [vx, vy, vz] = pfxDir(r * pfxR(1.2, 2.6));
    S.gl.emit({ x, y, z, vx, vy, vz, drag: 3.5, life: pfxR(0.35, 0.6) * (big ? 1.5 : 1), s0: r * 0.6, s1: r * pfxR(1.3, 1.9), c0: 0xffc060, c1: 0x7a1800, k: 1.0, a: 0.95, occ: 0.7, cell: PFX_FLAME[i % 3], fade: 2, rot: pfxR(0, 6.28), rv: pfxR(-2, 2) });
  }
  // 火花：沿速度拉長，太空裡沒有重力（近地才往下掉）
  for (let i = 0, n = pfxCnt(big ? 26 : 12, m); i < n; i++) {
    const [vx, vy, vz] = pfxDir(r * pfxR(5, 13) * (big ? 1.3 : 1));
    S.ln.emit({ x, y, z, vx, vy, vz, drag: 1.1, g, life: pfxR(0.4, 0.9) * (big ? 1.4 : 1), s0: r * 0.14, c0: i % 4 ? 0xffb050 : 0xffe8b0, k: 1.3, cell: PC.line, fade: 2, asp: 0.35 });
  }
  // 餘燼：慢慢飄散、閃爍
  for (let i = 0, n = pfxCnt(big ? 10 : 4, m); i < n; i++) {
    const [vx, vy, vz] = pfxDir(r * pfxR(1, 3.5));
    S.gl.emit({ x, y, z, vx, vy, vz, drag: 0.8, life: pfxR(0.9, 1.8), s0: r * 0.12, s1: r * 0.05, c0: 0xffa040, c1: 0xff4010, k: 1.8, cell: PC.hard, fade: 4 });
  }
  // 殘煙：暗色、慢慢散開（太空裡的燃燒殘氣）
  for (let i = 0, n = pfxCnt(big ? 5 : 2, m); i < n; i++) {
    const [vx, vy, vz] = pfxDir(r * pfxR(0.3, 0.9));
    S.sm.emit({ x: x + vx * 0.3, y: y + vy * 0.3, z: z + vz * 0.3, vx, vy: vy + (GRD ? r * 0.6 : 0), vz, drag: 0.5, life: pfxR(1.6, 2.8) * (big ? 1.4 : 1), s0: r * 0.9, s1: r * pfxR(2.6, 3.6), c0: 0x3a3632, c1: 0x1c1d22, a: 0.5, cell: PFX_PUFF[i % 3], fade: 1, rot: pfxR(0, 6.28), rv: pfxR(-0.6, 0.6), delay: 0.06 });
  }
  if (big || flag) {   // 衝擊環（面向鏡頭）
    S.gl.emit({ x, y, z, life: flag ? 0.7 : 0.45, s0: r * 1.2, s1: r * (flag ? 9 : 5.5), c0: 0xffd8a0, k: 1.0, a: 0.6, cell: PC.ring, fade: 1 });
    if (flag) S.gl.emit({ x, y, z, life: 1.0, s0: r * 2, s1: r * 14, c0: 0x9fd0ff, k: 0.9, a: 0.35, cell: PC.ring, fade: 1, delay: 0.08 });
  }
  if (flag) for (let i = 0; i < 3; i++) {   // 旗艦：連續的二次爆炸
    const [ox, oy, oz] = pfxDir(r * pfxR(0.8, 1.6));
    S.gl.emit({ x: x + ox, y: y + oy, z: z + oz, life: 0.4, s0: r * 0.6, s1: r * 2.2, c0: 0xffe0a0, c1: 0xb03000, k: 1.6, occ: 0.5, cell: PFX_FLAME[i % 3], fade: 2, rot: pfxR(0, 6.28), delay: 0.15 + i * 0.18 });
  }
}
// 打到船體：火花＋小閃光（heavy＝主砲、飛彈）
function pfxHull(x, y, z, r, heavy) {
  const m = pfxGate(x, y, z, r); if (!m) return;
  const S = PFX.sys;
  S.gl.emit({ x, y, z, life: 0.1, s0: r * 0.6, s1: r * 1.4, c0: 0xffe6b0, k: 1.2, a: 0.8, cell: PC.star, rot: pfxR(0, 6.28) });
  for (let i = 0, n = pfxCnt(heavy ? 9 : 5, m); i < n; i++) {
    const [vx, vy, vz] = pfxDir(r * pfxR(5, 12));
    S.ln.emit({ x, y, z, vx, vy, vz, drag: 1.5, g: GRD ? 9 * r / 5 : 0, life: pfxR(0.25, 0.55), s0: r * 0.1, c0: 0xffc060, k: 1.6, cell: PC.line, fade: 2, asp: 0.3 });
  }
  if (heavy) S.sm.emit({ x, y, z, life: pfxR(0.8, 1.4), s0: r * 0.5, s1: r * 1.8, c0: 0x3a3632, a: 0.45, cell: PFX_PUFF[Math.floor(pfxRnd() * 3)], fade: 1, rot: pfxR(0, 6.28) });
}
// 護盾擋下：陣營顏色的電弧閃一下＋往外散的光點
function pfxShield(x, y, z, r, side, heavy) {
  const m = pfxGate(x, y, z, r); if (!m) return;
  const S = PFX.sys, col = fxFac(side) === 1 ? 0x7fd4ff : 0xffb060;
  S.gl.emit({ x, y, z, life: 0.16, s0: r * 1.2, s1: r * 2.4, c0: col, k: 1.7, cell: PFX_ARC[pfxRnd() < 0.5 ? 0 : 1], fade: 4, rot: pfxR(0, 6.28) });
  if (heavy) S.gl.emit({ x, y, z, life: 0.3, s0: r * 0.6, s1: r * 3, c0: col, k: 1.2, a: 0.6, cell: PC.ring, fade: 1 });
  for (let i = 0, n = pfxCnt(heavy ? 6 : 3, m); i < n; i++) {
    const [vx, vy, vz] = pfxDir(r * pfxR(3, 7));
    S.ln.emit({ x, y, z, vx, vy, vz, drag: 2.5, life: pfxR(0.2, 0.4), s0: r * 0.08, c0: col, k: 1.8, cell: PC.line, fade: 2, asp: 0.25 });
  }
}
// 打到岩石、地面：灰色的塵＋火花
function pfxRock(x, y, z, r) {
  const m = pfxGate(x, y, z, r); if (!m) return;
  const S = PFX.sys;
  for (let i = 0, n = pfxCnt(2, m); i < n; i++) { const [vx, vy, vz] = pfxDir(r * pfxR(0.5, 1.5)); S.sm.emit({ x, y, z, vx, vy, vz, drag: 1, life: pfxR(1, 1.8), s0: r * 0.6, s1: r * 2.2, c0: 0x6a645c, a: 0.5, cell: PFX_PUFF[i % 3], fade: 1, rot: pfxR(0, 6.28) }); }
  for (let i = 0, n = pfxCnt(4, m); i < n; i++) { const [vx, vy, vz] = pfxDir(r * pfxR(4, 9)); S.ln.emit({ x, y, z, vx, vy, vz, drag: 1.5, life: pfxR(0.2, 0.45), s0: r * 0.08, c0: 0xffd090, k: 1.4, cell: PC.line, fade: 2, asp: 0.3 }); }
}

// ───── 近地作戰：飛彈的白煙帶（移植自 rubicon 的 fx/trail.js、effects.js 的 smokeRibbon，太空戰不畫） ─────
// rubicon 是一條帶子一個網格；這裡所有帶子合併成一個網格（一次 draw call），飛彈多也不怕。
// 每幀掃一遍飛彈（main.js 的 misT：開始時間、飛行時間、中斷點，bezCPU 算位置），還在飛的就在它的帶子加點；
// 帶子的寬度每幀依鏡頭方向重算（永遠朝向鏡頭），越舊越寬、越淡，並慢慢往上飄。飛彈沒了帶子留著自己淡掉。
// 只讀飛彈的陣列，不改遊戲狀態。
const RIB_MAX = 384, RIB_PTS = 24;   // 同時最多幾條帶子、每條最多幾個點
const RIB = { mesh: null, ribs: new Map(), pos: null, aux: null, cam: new THREE.Vector3(), eye: new THREE.Vector3(), mp: new THREE.Vector3() };
function ribInit() {
  if (RIB.mesh) return;
  const V = RIB_MAX * RIB_PTS * 2, g = new THREE.BufferGeometry();
  RIB.pos = new Float32Array(V * 3); RIB.aux = new Float32Array(V * 3);   // aux：透明度、橫向（-1／1）、沿著帶子的距離
  g.setAttribute('position', new THREE.BufferAttribute(RIB.pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aux', new THREE.BufferAttribute(RIB.aux, 3).setUsage(THREE.DynamicDrawUsage));
  const idx = new Uint32Array(RIB_MAX * (RIB_PTS - 1) * 6);
  for (let r = 0, n = 0; r < RIB_MAX; r++) for (let i = 0; i < RIB_PTS - 1; i++) { const a = (r * RIB_PTS + i) * 2; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], n); n += 6; }
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color().setHex(0xdfe3e8, THREE.LinearSRGBColorSpace) } },
    vertexShader: /* glsl */`
      attribute vec3 aux; varying vec3 vX;
      void main() { vX = aux; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; varying vec3 vX;
      void main() {
        float e = 1.0 - abs(vX.y);   // 邊緣柔和
        float puff = 0.72 + 0.28 * sin(vX.z * 0.55) * sin(vX.z * 0.21 + 1.3);   // 沿著帶子一團一團的濃淡
        float a = vX.x * smoothstep(0.0, 0.7, e) * puff;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uCol * (0.82 + 0.18 * e), a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  RIB.mesh = new THREE.Mesh(g, mat); RIB.mesh.frustumCulled = false; RIB.mesh.renderOrder = 4;
  scene.add(RIB.mesh);
}
function ribClear() { RIB.ribs.clear(); if (RIB.mesh) { RIB.mesh.geometry.setDrawRange(0, 0); RIB.mesh.visible = false; } }
// 帶子加一點：離上一點夠遠就新增，不然移動最新的那一點（帶子的頭跟著飛彈）
function ribPush(key, x, y, z, t) {
  let R = RIB.ribs.get(key);
  if (!R) { if (RIB.ribs.size >= RIB_MAX) return; R = { p: [] }; RIB.ribs.set(key, R); }
  R.seen = t;
  const P = R.p, L = P[P.length - 1], prev = P[P.length - 2];
  if (L && prev && Math.hypot(L.x - prev.x, L.y - prev.y, L.z - prev.z) < 5) { L.x = x; L.y = y; L.z = z; L.t = t; return; }
  P.push({ x, y, z, t }); if (P.length > RIB_PTS) P.shift();
}
function pfxRibbons(t) {
  const Q = PFX.q;
  if (!GRD || !Q.n) { if (RIB.ribs.size) ribClear(); return; }
  ribInit();
  const life = Q.n < 1 ? 1.3 : 2.2, M = RIB.mp;
  // 還在飛的飛彈：開始時間 ≤ 現在 ＜ 開始＋飛行時間×中斷點（被攔截、撞到岩石時中斷點會改短）
  for (let i = 0; i < MIS_MAX; i++) {
    const t0 = misT[i * 4], dur = misT[i * 4 + 1];
    if (!(dur > 0) || t < t0) continue;
    const u = (t - t0) / dur;
    if (u >= misT[i * 4 + 3] || u > 1) continue;
    bezCPU(i, u, M);
    ribPush(i * 4096 + (misGen[i] & 4095), M.x, M.y, M.z, t);
  }
  if (PL.on && PL.msl) for (const m of PL.msl) ribPush(m, m.x, m.y, m.z, t);   // 王牌飛行員自己的飛彈、魚雷
  // 組網格：每條帶子 RIB_PTS 個點的位置，不足的點重複最後一點（面積為 0）
  const cam = RIB.cam.copy(camera.position), ortho = camera.isOrthographicCamera;
  if (ortho) { const e = camera.matrixWorld.elements; RIB.eye.set(e[8], e[9], e[10]); }
  const pos = RIB.pos, aux = RIB.aux; let r = 0;
  for (const [key, R] of RIB.ribs) {
    const P = R.p;
    while (P.length && t - P[0].t >= life) P.shift();
    if (P.length < 2 || t < P[0].t - 1) { if (t - R.seen > life || t < R.seen - 1) RIB.ribs.delete(key); continue; }
    let dist = 0;
    for (let i = 0; i < RIB_PTS; i++) {
      const k = Math.min(i, P.length - 1), p = P[k], age = t - p.t, f = Math.min(1, age / life);
      const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
      let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
      const ex = ortho ? RIB.eye.x : cam.x - p.x, ey = ortho ? RIB.eye.y : cam.y - p.y, ez = ortho ? RIB.eye.z : cam.z - p.z;
      let sx = ty * ez - tz * ey, sy = tz * ex - tx * ez, sz = tx * ey - ty * ex;
      const sl = Math.hypot(sx, sy, sz) || 1, w = (0.3 + 1.6 * Math.sqrt(f)) * 0.5;   // 寬度：越舊越寬（煙散開）
      sx *= w / sl; sy *= w / sl; sz *= w / sl;
      const rise = age * 0.9, al = i < P.length ? Math.pow(1 - f, 1.4) * 0.36 * (k === P.length - 1 ? 0.5 : 1) * Math.min(1, age * 12 + 0.25) : 0;
      if (i > 0 && i < P.length) dist += Math.hypot(p.x - P[k - 1].x, p.y - P[k - 1].y, p.z - P[k - 1].z);
      const o = ((r * RIB_PTS + i) * 2) * 3;
      pos[o] = p.x + sx; pos[o + 1] = p.y + rise + sy; pos[o + 2] = p.z + sz;
      pos[o + 3] = p.x - sx; pos[o + 4] = p.y + rise - sy; pos[o + 5] = p.z - sz;
      aux[o] = al; aux[o + 1] = 1; aux[o + 2] = dist; aux[o + 3] = al; aux[o + 4] = -1; aux[o + 5] = dist;
    }
    if (++r >= RIB_MAX) break;
  }
  const g = RIB.mesh.geometry;
  if (r) {
    const n = r * RIB_PTS * 2 * 3;
    for (const nm of ['position', 'aux']) { const A = g.getAttribute(nm); A.clearUpdateRanges(); A.addUpdateRange(0, n); A.needsUpdate = true; }
  }
  g.setDrawRange(0, r * (RIB_PTS - 1) * 6); RIB.mesh.visible = r > 0;
}

// ───── 鏡頭震動：大船、旗艦沉沒（依距離衰減） ─────
function pfxShake(x, y, z, amt) {
  if (SETTINGS.shake === false) return;
  let gain;
  if ((PL.on && !PL.spec) || CAP.on || BR.on) { const d = camera.position.distanceTo(_pfxV.set(x, y, z)), ref = PL.on ? 60 : CAP.on ? 90 : 160; gain = ref / (ref + 1.5 * Math.max(0, d - ref)); }
  else { const d = Math.hypot(x - view.target.x, z - view.target.z), ref = view.height * 0.4; gain = ref / (ref + 1.5 * Math.max(0, d - ref)); if (view.height > 900) gain *= 900 / view.height; }
  if (gain > 0.15) PFX.shake = Math.min(1, PFX.shake + amt * gain);
}
// 自己（駕駛的機）被打中：不看距離
function pfxShakeOwn(amt) { if (SETTINGS.shake !== false) PFX.shake = Math.min(1, PFX.shake + amt); }
// composer.render 前後：把鏡頭暫時偏一點（畫完還原，點選、射線不受影響）
function pfxShakeApply(dt) {
  PFX.shake *= Math.exp(-dt * 5);
  if (PFX.shake < 0.01 || paused) { PFX.shake = paused ? PFX.shake : 0; return; }
  const close = (PL.on && !PL.spec) || CAP.on || BR.on, amp = PFX.shake * PFX.shake * (close ? 1.2 : view.height * 0.006);
  const e = camera.matrixWorld.elements, rx = pfxR(-1, 1) * amp, ry = pfxR(-1, 1) * amp;
  PFX.shOff.set(e[0] * rx + e[4] * ry, e[1] * rx + e[5] * ry, e[2] * rx + e[6] * ry);
  camera.position.add(PFX.shOff); camera.updateMatrixWorld(); PFX.shOn = true;
}
function pfxShakeRestore() { if (!PFX.shOn) return; camera.position.sub(PFX.shOff); camera.updateMatrixWorld(); PFX.shOn = false; }

// ───── 掛勾（main.js）：只有外觀 ─────
function pfxKill(i, x, y, z, flag) {
  const ty = ships.type[i], r = TYPE_W[ty] * (ty <= 1 ? 0.75 : 0.6), big = ty <= 1;   // 和序列圖的爆炸差不多大（TYPE_W × 1.6 是直徑）
  pfxExplode(x, y, z, r, 0xff8030, big, flag);
  if (big || flag) pfxShake(x, y, z, flag ? 0.9 : 0.35);
}
// processHits 的命中：kind 'hh' 船體、'hs' 護盾、'mh' 飛彈、'mx' 飛彈自爆、'ix' 攔截、'fd' 艦載機、'rk' 岩石、'gx' 地面
function pfxHit(kind, x, y, z, side, heavy, ty) {
  if (!PFX.q.n) return;
  const w = ty != null ? TYPE_W[ty] : 4;
  if (kind === 'hh') pfxHull(x, y, z, w * (heavy ? 0.45 : 0.3), heavy);
  else if (kind === 'hs') pfxShield(x, y, z, w * (heavy ? 0.55 : 0.4), side, heavy);
  else if (kind === 'mh') { pfxExplode(x, y, z, w * 0.4, 0xff9040); }
  else if (kind === 'mx' || kind === 'gx') pfxExplode(x, y, z, 2.2, 0xff9040);
  else if (kind === 'ix') pfxExplode(x, y, z, 1.4, 0xffc070);
  else if (kind === 'fd') pfxExplode(x, y, z, 1.6, 0xff8040);
  else if (kind === 'rk') pfxRock(x, y, z, 2);
}
// 每一幀（main.js 的 frame）：時鐘、品質、預算歸零
function pfxFrame() {
  PFX.q = PFX_Q[SETTINGS.particles] || PFX_Q.high;
  if (!PFX.q.n && !PFX.sys) return;
  if (!pfxInit()) return;
  const t = U.uTime.value;
  if (t < PFX.last - 0.001) { for (const k in PFX.sys) PFX.sys[k].clear(); ribClear(); }   // 新的戰鬥（時間歸零）、回放跳回去
  PFX.last = t;
  PFX.stat.emitted += PFX.used; PFX.stat.frames++;
  PFX.used = 0;
  for (const k in PFX.sys) PFX.sys[k].update(t);
  pfxRibbons(t);   // 近地作戰：飛彈的白煙帶
}
window.__pfx = { PFX, RIB, pfxExplode, pfxHit, pfxKill, pfxShake };   // 除錯、測試用
