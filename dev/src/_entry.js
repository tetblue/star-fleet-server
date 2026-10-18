import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ───────────────────────── 常數 ─────────────────────────
const SHIP_ATLAS = window.__ASSETS.ships;   // 4096×1024, 16 cols (2 陣營 × 8 方向) × 5 rows (艦種), 每格 256×192
const FX_ATLAS = window.__ASSETS.fx;        // 2048×2304, 16 frames × 18 rows (0-1 爆炸, 2-9 帝國護盾, 10-17 聯盟護盾)
const FTR_ATLAS = window.__ASSETS.fighters; // 2048×128, 16 cols (2 陣營 × 8 方向)
let VW = innerWidth, VH = innerHeight;   // 戰場畫面大小（戰術面板會讓出空間）
function tacDockSize() { if (typeof TAC === 'undefined' || !TAC.open || BR.on) return { w: 0, h: 0 }; return { w: 0, h: Math.round(Math.min(760, Math.max(300, innerHeight * (innerWidth >= 760 ? 0.58 : 0.6)))) }; }   // 戰術面板固定在下方
const ELEV = 30 * Math.PI / 180;
const BR = { on: false };
// 陣營（外觀）與模擬的「邊」分開：邊 0＝玩家（畫面下方）、邊 1＝對手；SIDE_FAC[邊]＝那一邊用哪個陣營（0 帝國、1 聯盟）
let SIDE_FAC = [0, 1];
// 作戰介面跟著玩家的陣營換主題（顏色、紋飾）
function applyPlayerTheme() { const f = SIDE_FAC[typeof cmdSide === 'number' ? cmdSide : 0] || 0; document.body.classList.toggle('pf-0', f === 0); document.body.classList.toggle('pf-1', f === 1); }
function applySideNames() {
  document.querySelectorAll('[data-fn]').forEach((el) => { const f = SIDE_FAC[+el.dataset.fn]; el.textContent = el.dataset.short ? FACTION[f].name[0] : FACTION[f].name; });
  document.querySelectorAll('[data-fs]').forEach((el) => { el.classList.toggle('e', SIDE_FAC[+el.dataset.fs] === 0); el.classList.toggle('a', SIDE_FAC[+el.dataset.fs] === 1); });
}   // 指揮官視角狀態（內容在 bridge.js）
const CAM_DIR = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV)); // 目標點 → 相機
const TYPE_W = [6.0, 5.6, 4.6, 3.8, 3.2, 5.0];     // 航母 戰列 巡洋 驅逐 護衛 補給（貼圖寬，世界單位）
const TYPE_WEIGHT = [0.05, 0.12, 0.23, 0.32, 0.28, 0];   // 測試場的編成比例（不含補給艦）
const NT = TYPE_W.length;   // 艦種數（＝SHIP_TYPES.length）
const MAX_SQ = 40;
const FACTION = [
  { name: '帝國軍', beam: new THREE.Color(1.0, 0.62, 0.22), glow: new THREE.Color(1.0, 0.45, 0.18), ui: '#f2b35a' },
  { name: '聯盟軍', beam: new THREE.Color(0.45, 0.80, 1.0), glow: new THREE.Color(0.35, 0.65, 1.0), ui: '#7cc4ff' },
];

let simAlt = 1;
const opts = {
  rangeMul: 1,
  uturn: 'auto',
  autoFace: true,               // 停著的部隊自動把船頭轉向敵人（主砲有射角）
  flankSide: 1.5, flankRear: 1.75,   // 側面、背後受擊時「船體」傷害倍率（護盾沒有方向）
  beamNear: 250, beamFar: 700,  // 光束：有效射程內全威力，之後線性衰減到最大射程時剩 BEAM_FALLOFF_MIN（50%），超過不開火
  perSide: 3000, rep: 5, persp: true, altitude: true, fog: true, glow: true,
  bloom: true, fire: true, labels: true, background: true, advance: false,
  flat: false,                  // 操作難度「一般」：艦隊都在同一平面（不能升降）
  fow: false,                   // 操作難度「擬真」：戰爭迷霧（模擬室可以關掉）
  ff: false,                    // 操作難度「擬真」：射線穿過別的友軍部隊時可能誤傷、同部隊多半停火（2＝現行規則，true＝舊回放）
};

// ───────────────────────── renderer / camera ─────────────────────────
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x03050b, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();

const camPersp = new THREE.PerspectiveCamera(20, 1, 10, 20000);
const camOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
const view = { target: new THREE.Vector3(0, 0, 0), height: 620, minH: 40, maxH: 2100, yaw: 0, pitch: ELEV };
let camera = camPersp;

function updateCamera() {
  if (BR.on) { bridgeCamera(); return; }   // 指揮官視角：鏡頭跟著旗艦
  const w = VW, h = VH, aspect = w / h;
  // 2D 像素圖只能從固定的 30° 俯角看；3D 可以自由轉
  if (!mode3D && !camAnim) { view.yaw = 0; view.pitch = ELEV; }
  CAM_DIR.set(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch));
  if (opts.persp || mode3D) {
    camera = camPersp;
    camPersp.aspect = aspect;
    camPersp.fov = mode3D ? 40 : 20;
    const dist = (view.height / 2) / Math.tan(THREE.MathUtils.degToRad(camPersp.fov / 2));
    camPersp.position.copy(view.target).addScaledVector(CAM_DIR, dist);
    camPersp.near = mode3D ? Math.max(0.5, dist * 0.01) : Math.max(5, dist - 1500); camPersp.far = dist + (mode3D ? 6000 : 3000);
    camPersp.lookAt(view.target);
    camPersp.updateProjectionMatrix();
  } else {
    camera = camOrtho;
    const hh = view.height / 2;
    camOrtho.left = -hh * aspect; camOrtho.right = hh * aspect; camOrtho.top = hh; camOrtho.bottom = -hh;
    camOrtho.position.copy(view.target).addScaledVector(CAM_DIR, 3000);
    camOrtho.near = 1000; camOrtho.far = 6000;
    camOrtho.lookAt(view.target);
    camOrtho.updateProjectionMatrix();
  }
  renderPass.camera = camera;
}

// ───────────────────────── 貼圖 ─────────────────────────
const loader = new THREE.TextureLoader();
function loadTex(src) {
  const t = loader.load(src);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}
const shipTex = loadTex(SHIP_ATLAS);
const fxTex = loadTex(FX_ATLAS);

// ───────────────────────── 共用 uniforms ─────────────────────────
const U = {
  uTime: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uSq: { value: Array.from({ length: MAX_SQ }, () => new THREE.Vector4()) },      // cx, cz, heading(位置用), visible
  uSqT: { value: Array.from({ length: MAX_SQ }, () => new THREE.Vector4()) },     // turn from, to, start, dur
  uSqM: { value: Array.from({ length: MAX_SQ }, () => new THREE.Vector4()) },     // 陣型變換 start, dur
  uSqP: { value: Array.from({ length: MAX_SQ }, () => new THREE.Vector4()) },     // 3D：高度、俯仰角
  uRock: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uRockN: { value: 0 },   // 實體障礙（球）：x, y, z, r
  uAlt: { value: 1 },
  uFog: { value: 1 },
  uCamDir: { value: CAM_DIR },
  uGlowOn: { value: 1 },
  uSpriteFade: { value: 1 },
};

const COMMON_GLSL = /* glsl */`
  uniform float uTime; uniform vec2 uRes; uniform vec4 uSq[${MAX_SQ}]; uniform vec4 uSqT[${MAX_SQ}]; uniform vec4 uSqM[${MAX_SQ}]; uniform vec4 uSqP[${MAX_SQ}];
  uniform vec4 uRock[8]; uniform float uRockN;
  uniform float uAlt; uniform float uFog; uniform vec3 uCamDir;
  attribute vec3 aLocal; attribute vec3 aLocal2; attribute vec4 aInfo; attribute vec2 aState; attribute float aScale; attribute vec4 aPath;
  const float PI = 3.14159265;
  float easeIO(float x){ x = clamp(x,0.,1.); return x*x*(3.-2.*x); }
  float sqHeading(int i, float lag){
    vec4 t = uSqT[i];
    if (t.w == 0.) return t.y;
    if (t.w < 0.) return mix(t.x, t.y, clamp((uTime - t.z - lag) / -t.w, 0., 1.));
    return mix(t.x, t.y, easeIO((uTime - t.z - lag) / t.w));
  }
  vec3 shipWorld(out float hShip, out float visible){
    int si = int(aInfo.x + 0.5);
    vec4 sq = uSq[si];
    visible = sq.w;
    float h = sq.z;
    vec4 sp = uSqP[si];
    float pit = sp.y, cp = cos(pit), spt = sin(pit);
    vec3 F = vec3(sin(h) * cp, spt, cos(h) * cp), R = vec3(cos(h), 0., -sin(h)), Up = vec3(-sin(h) * spt, cp, -cos(h) * spt);   // 陣型的前、右、上（含俯仰）
    float seed = aInfo.w;
    vec3 p = vec3(sq.x, sp.x, sq.y);
    // 陣型變換：起點 → 目標，每艘船依 lag 稍晚出發，像水流一樣重組
    vec4 m = uSqM[si];
    vec3 L = m.y > 0. ? mix(aLocal, aLocal2, easeIO((uTime - m.x - aState.y * 0.9) / m.y)) : aLocal2;
    // 整齊度：0 自然、1 整齊（高度層固定、不漂浮）
    float om = m.y > 0. ? mix(m.z, m.w, easeIO((uTime - m.x) / m.y)) : m.w;
    float ly = L.y * mix(uAlt, 1., om);
    p += R * L.x + F * L.z + Up * ly;
    if (aPath.w > 0.5) p = vec3(aPath.x, sp.x + ly, aPath.y);   // 蛇行迴轉：位置由 CPU 沿軌跡算好（水平）
    for (int k = 0; k < 8; k++) { if (float(k) >= uRockN) break; vec3 d = p - uRock[k].xyz; float dl = length(d); if (dl < uRock[k].w + 1.5) p = uRock[k].xyz + d / max(dl, 0.001) * (uRock[k].w + 1.5); }   // 被障礙擋住：推到表面
    // 微幅漂浮（整齊模式也保留，幅度遠小於艦距）
    float bob = 1.;
    p.y += sin(uTime * 0.6 + seed * 40.) * 0.35 * bob;
    p.xz += vec2(sin(uTime*0.31 + seed*17.), cos(uTime*0.27 + seed*23.)) * 0.25 * bob;
    // 轉向延遲：每艘船依 seed 稍晚轉向，形成「波浪式」轉身
    hShip = aPath.w > 0.5 ? aPath.z : sqHeading(si, aState.y);
    return p;
  }
  float dirIndex(float h){ return mod(floor(-h / (PI/4.) + 0.5) + 16., 8.); }
  float pxPerUnit(vec4 clip){ return projectionMatrix[1][1] * 0.5 * uRes.y / clip.w; }
`;

// ───────────────────────── 艦艇 Mesh ─────────────────────────
let shipGeo = null, shipMesh = null, glowMesh = null;

// 武器疊圖（與船體貼圖同排列；由 weapons.js 依掛點即時算出來）
const NO_WTEX = new THREE.DataTexture(new Uint8Array(4), 1, 1); NO_WTEX.needsUpdate = true;
const shipMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uTex: { value: shipTex }, uWTex: { value: NO_WTEX } },
  vertexShader: COMMON_GLSL + /* glsl */`
    varying vec2 vUv; varying float vFog; varying float vBright; varying float vDeath; varying float vFac; varying float vAlt;
    void main(){
      float hShip, vis;
      vec3 p = shipWorld(hShip, vis);
      float dead = aState.x > 0. ? (uTime - aState.x) : -1.;
      if (vis < 0.5 || dead > 0.9) { gl_Position = vec4(2.,2.,2.,1.); return; }
      vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.);
      float w = aScale;
      float ppu = pxPerUnit(clip);
      vec2 sizePx = vec2(w, w * 0.75) * ppu;
      clip.xy += position.xy * sizePx * 2. / uRes * clip.w;
      gl_Position = clip;
      float dir = dirIndex(hShip);
      float col = aInfo.z * 8. + dir;
      float row = floor(aInfo.y);
      vAlt = fract(aInfo.y);
      vec2 uv = position.xy + 0.5;
      vUv = vec2((col + uv.x) / 16., 1. - (row + 1. - uv.y) * 192. / 1024.);
      // 景深霧：越遠（畫面越上方、高度越低）越暗越藍
      float depth = dot(p, -uCamDir);
      vFog = uFog * smoothstep(-260., 620., depth) * 0.75;
      vBright = 0.85 + 0.3 * fract(aInfo.w * 91.7);
      vDeath = dead;
      vFac = aInfo.z;
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uTex; uniform sampler2D uWTex; uniform float uSpriteFade;
    varying vec2 vUv; varying float vFog; varying float vBright; varying float vDeath; varying float vFac; varying float vAlt;
    void main(){
      vec4 c = texture2D(uTex, vUv);
      vec4 w = vAlt > 0.25 ? vec4(0.) : texture2D(uWTex, vUv);   // 武器（預乘透明度）；借用外觀的艦種（補給艦）不畫別人的砲
      c.rgb = c.rgb * (1. - w.a) + w.rgb; c.a = max(c.a, w.a);
      if (c.a < 0.32) discard;
      vec3 col = c.rgb * vBright;
      if (vAlt > 0.25) col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(0.75, 1.15, 0.85), 0.7);   // 補給艦：偏綠的灰色
      vec3 fogCol = vFac < 0.5 ? vec3(0.05,0.06,0.12) : vec3(0.04,0.07,0.13);
      col = mix(col, fogCol, vFog);
      if (vDeath > 0.) {             // 被擊沉：閃白後淡出
        col = mix(col, vec3(3.0, 2.2, 1.4), smoothstep(0.0, 0.08, vDeath) * (1. - smoothstep(0.1, 0.5, vDeath)));
        col *= 1. - smoothstep(0.4, 0.9, vDeath);
      }
      gl_FragColor = vec4(col * uSpriteFade, 1.);
    }`,
});

const glowMat = new THREE.ShaderMaterial({
  uniforms: { ...U, u3D: { value: 0 }, uColA: { value: FACTION[0].glow }, uColB: { value: FACTION[1].glow } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: COMMON_GLSL + /* glsl */`
    uniform float uGlowOn; uniform float u3D;
    varying vec2 vUv; varying float vI; varying float vFac;
    void main(){
      float hShip, vis;
      vec3 p = shipWorld(hShip, vis);
      if (uGlowOn < 0.5 || vis < 0.5 || aState.x > 0.) { gl_Position = vec4(2.,2.,2.,1.); return; }
      float dir = dirIndex(hShip);
      float hq = u3D > 0.5 ? hShip : -dir * PI / 4.;   // 2D：與貼圖一致的量化航向；3D：連續
      vec2 fq = vec2(sin(hq), cos(hq));
      p.xz -= fq * aScale * (u3D > 0.5 ? 0.48 : 0.36);  // 推進器在船尾
      vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.);
      float ppu = pxPerUnit(clip);
      float sizeW = aScale * (u3D > 0.5 ? 0.2 : 0.55);
      float px = sizeW * ppu;
      float minPx = u3D > 0.5 ? 2.2 : 3.0;
      float sz = max(px, minPx);
      vI = mix(0.55, 1.0, clamp(px / minPx, 0., 1.)) * (0.8 + 0.2 * sin(uTime * 23. + aInfo.w * 300.));
      float depth = dot(p, -uCamDir);
      vI *= 1. - uFog * smoothstep(-260., 620., depth) * 0.6;
      clip.xy += position.xy * sz * 2. / uRes * clip.w;
      clip.z -= 0.0005 * clip.w;
      gl_Position = clip;
      vUv = position.xy * 2.;
      vFac = aInfo.z;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColA; uniform vec3 uColB;
    varying vec2 vUv; varying float vI; varying float vFac;
    void main(){
      float d = length(vUv);
      float g = exp(-d * d * 7.) ;
      float core = exp(-d * d * 40.);
      vec3 c = (vFac < 0.5 ? uColA : uColB);
      gl_FragColor = vec4((c * g * 0.75 + vec3(1.) * core * 0.6) * vI, 1.);
    }`,
});

// ───────────────────────── 光束 ─────────────────────────
const BEAM_MAX = 24000;
const beamA = new Float32Array(BEAM_MAX * 3), beamB = new Float32Array(BEAM_MAX * 3), beamT = new Float32Array(BEAM_MAX * 4);
for (let i = 0; i < BEAM_MAX; i++) beamT[i * 4] = -999;
const beamGeo = new THREE.InstancedBufferGeometry();
{
  const base = new THREE.PlaneGeometry(1, 1);
  beamGeo.index = base.index; beamGeo.attributes.position = base.attributes.position;
  beamGeo.setAttribute('aA', new THREE.InstancedBufferAttribute(beamA, 3).setUsage(THREE.DynamicDrawUsage));
  beamGeo.setAttribute('aB', new THREE.InstancedBufferAttribute(beamB, 3).setUsage(THREE.DynamicDrawUsage));
  beamGeo.setAttribute('aT', new THREE.InstancedBufferAttribute(beamT, 4).setUsage(THREE.DynamicDrawUsage));
  beamGeo.instanceCount = BEAM_MAX;
}
const beamMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uColA: { value: FACTION[0].beam }, uColB: { value: FACTION[1].beam } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform float uTime; uniform vec2 uRes;
    attribute vec3 aA; attribute vec3 aB; attribute vec4 aT;
    varying vec2 vUv; varying float vFade; varying float vFac;
    void main(){
      float p = (uTime - aT.x) / aT.y;
      if (p < 0. || p > 1.35) { gl_Position = vec4(2.,2.,2.,1.); return; }
      float len = aT.w;                                 // 光束長度佔全程比例
      vec3 head = mix(aA, aB, clamp(p, 0., 1.));
      vec3 tail = mix(aA, aB, clamp(p - len, 0., 1.));
      vec4 ch = projectionMatrix * viewMatrix * vec4(head, 1.);
      vec4 ct = projectionMatrix * viewMatrix * vec4(tail, 1.);
      vec2 sh = ch.xy / ch.w * uRes * 0.5, st = ct.xy / ct.w * uRes * 0.5;
      vec2 d = sh - st; float L = length(d);
      vec2 dn = L > 0.001 ? d / L : vec2(1.,0.);
      vec2 nrm = vec2(-dn.y, dn.x);
      float ppu = projectionMatrix[1][1] * 0.5 * uRes.y / ch.w;
      float wpx = clamp(0.55 * ppu, 1.3, 6.0);
      float t = position.x + 0.5;
      vec4 c = mix(ct, ch, t);
      vec2 s = mix(st, sh, t) + nrm * position.y * wpx * 3.0 + dn * (position.x) * wpx * 2.0;
      c.xy = s / (uRes * 0.5) * c.w;
      gl_Position = c;
      vUv = vec2(t, position.y * 2.);
      vFade = 1. - smoothstep(1.0, 1.35, p);
      vFac = floor(aT.z); vFade *= fract(aT.z);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColA; uniform vec3 uColB;
    varying vec2 vUv; varying float vFade; varying float vFac;
    void main(){
      float y = abs(vUv.y);
      float glow = exp(-y * y * 9.);
      float core = exp(-y * y * 90.);
      float along = pow(vUv.x, 1.6);
      vec3 c = vFac < 0.5 ? uColA : uColB;
      vec3 col = (c * glow * 0.55 + vec3(1.0) * core * 1.05) * along * vFade;
      gl_FragColor = vec4(col, 1.);
    }`,
});
const beamMesh = new THREE.Mesh(beamGeo, beamMat);
beamMesh.frustumCulled = false; beamMesh.renderOrder = 3;
scene.add(beamMesh);
let beamHead = 0, beamDirtyFrom = -1, beamDirtyCount = 0;

// ───────────────────────── 特效（爆炸／護盾）─────────────────────────
const FX_MAX = 8000;
const fxP = new Float32Array(FX_MAX * 3), fxF = new Float32Array(FX_MAX * 4);
for (let i = 0; i < FX_MAX; i++) { fxF[i * 4] = -999; fxF[i * 4 + 3] = 20; }
const fxGeo = new THREE.InstancedBufferGeometry();
{
  const base = new THREE.PlaneGeometry(1, 1);
  fxGeo.index = base.index; fxGeo.attributes.position = base.attributes.position;
  fxGeo.setAttribute('aP', new THREE.InstancedBufferAttribute(fxP, 3).setUsage(THREE.DynamicDrawUsage));
  fxGeo.setAttribute('aF', new THREE.InstancedBufferAttribute(fxF, 4).setUsage(THREE.DynamicDrawUsage));
  fxGeo.instanceCount = FX_MAX;
}
const fxMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uTex: { value: fxTex } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform float uTime; uniform vec2 uRes;
    attribute vec3 aP; attribute vec4 aF;
    varying vec2 vUv; varying float vA;
    void main(){
      float age = uTime - aF.x;
      float frame = floor(age * aF.w);
      if (age < 0. || frame > 15.) { gl_Position = vec4(2.,2.,2.,1.); return; }
      vec4 clip = projectionMatrix * viewMatrix * vec4(aP, 1.);
      float ppu = projectionMatrix[1][1] * 0.5 * uRes.y / clip.w;
      float px = max(aF.z * ppu, 3.0);
      vA = mix(0.35, 1.0, clamp(aF.z * ppu / 3.0, 0., 1.));
      clip.xy += position.xy * px * 2. / uRes * clip.w;
      clip.z -= 0.001 * clip.w;
      gl_Position = clip;
      vec2 uv = position.xy + 0.5;
      vUv = vec2((frame + uv.x) / 16., 1. - (aF.y + 1. - uv.y) / 18.);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uTex; varying vec2 vUv; varying float vA;
    void main(){
      vec4 c = texture2D(uTex, vUv);
      gl_FragColor = vec4(c.rgb * c.a * 0.95 * vA, 1.);
    }`,
});
const fxMesh = new THREE.Mesh(fxGeo, fxMat);
fxMesh.frustumCulled = false; fxMesh.renderOrder = 4;
scene.add(fxMesh);
let fxHead = 0, fxDirtyFrom = -1, fxDirtyCount = 0;

function spawnFx(x, y, z, row, scale, fps = 20) {
  if (row < 2) row = SIDE_FAC[row]; else if (row < 18) row = 2 + SIDE_FAC[(row - 2) >> 3] * 8 + ((row - 2) & 7);   // 邊 → 陣營（爆炸、護盾的顏色）
  const i = fxHead; fxHead = (fxHead + 1) % FX_MAX;
  fxP[i * 3] = x; fxP[i * 3 + 1] = y; fxP[i * 3 + 2] = z;
  fxF[i * 4] = U.uTime.value; fxF[i * 4 + 1] = row; fxF[i * 4 + 2] = scale; fxF[i * 4 + 3] = fps;
  markDirty('fx', i);
}

function markDirty(kind, i) {
  if (kind === 'fx') { if (fxDirtyFrom < 0) fxDirtyFrom = i; fxDirtyCount++; }
  else { if (beamDirtyFrom < 0) beamDirtyFrom = i; beamDirtyCount++; }
}
function flushRing(geo, names, sizes, from, count, max) {
  if (from < 0 || count === 0) return;
  for (let k = 0; k < names.length; k++) {
    const attr = geo.getAttribute(names[k]);
    const s = sizes[k];
    if (attr.addUpdateRange && count < max) {
      attr.clearUpdateRanges && attr.clearUpdateRanges();
      const end = from + count;
      if (end <= max) attr.addUpdateRange(from * s, count * s);
      else { attr.addUpdateRange(from * s, (max - from) * s); attr.addUpdateRange(0, (end - max) * s); }
    }
    attr.needsUpdate = true;
  }
}

// ───────────────────────── 背景星雲 ─────────────────────────
const bgMat = new THREE.ShaderMaterial({
  uniforms: { uRes: U.uRes, uTime: U.uTime, uOff: { value: new THREE.Vector2() } },
  depthTest: false, depthWrite: false,
  vertexShader: `void main(){ gl_Position = vec4(position.xy * 2., 0.9999, 1.); }`,
  fragmentShader: /* glsl */`
    uniform vec2 uRes; uniform float uTime; uniform vec2 uOff;
    float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5;} return v; }
    float stars(vec2 px, float cell, float prob){
      vec2 g = px / cell; vec2 id = floor(g); vec2 f = fract(g);
      float h = h21(id);
      if (h > prob) return 0.;
      vec2 o = vec2(h21(id+3.1), h21(id+7.7));
      float d = length((f - o) * cell);
      float tw = 0.7 + 0.3 * sin(uTime * (1. + h * 40.) + h * 100.);
      return smoothstep(1.2, 0.0, d) * (0.3 + 0.7 * h21(id+1.9)) * tw;
    }
    void main(){
      vec2 px = gl_FragCoord.xy;
      vec2 uv = px / uRes.y;
      vec2 p = uv * 1.4 + uOff * 0.00025;
      float n = fbm(p * 1.3 + fbm(p * 0.7 + 3.));
      float n2 = fbm(p * 2.6 + 11.);
      vec3 col = vec3(0.010, 0.013, 0.030);
      col += vec3(0.14, 0.05, 0.20) * smoothstep(0.48, 0.95, n) * 0.55;
      col += vec3(0.03, 0.10, 0.16) * smoothstep(0.52, 0.95, n2) * 0.45;
      col += vec3(0.75, 0.82, 1.0) * stars(px + uOff * 0.05, 3.0, 0.010) * 0.55;
      col += vec3(1.0, 0.95, 0.88) * stars(px + uOff * 0.12, 7.0, 0.012) * 0.9;
      gl_FragColor = vec4(col, 1.);
    }`,
});
const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
bgMesh.frustumCulled = false; bgMesh.renderOrder = -10;
scene.add(bgMesh);

// ───────────────────────── 陣型 ─────────────────────────
// 每個陣型＝艦隊座標（u 往右、v 往前）裡的一塊區域，依「切片鍵」切給各分艦隊
const SHIP_AREA = 13;
const CONE_VOL = SHIP_AREA * 24, CONE_RB = 0.55;   // 圓錐陣：每艘船佔的體積、底面半徑／長度
const HCONE_K = 0.7, HCONE_RMIN = 66;   // 空心錐陣：錐底半徑／長度、錐底半徑的下限
// 陣型的戰鬥特性：fire 火力倍率、aa 飛彈攔截、speed 速度倍率、frontTaken 正面受到的傷害倍率、
//   flankBonus 打敵人側面／背後時的傷害倍率、noFlank＝沒有側背弱點、breach＝前端衝進敵方分艦隊時讓它陣形混亂幾秒
const FORMATIONS = {
  line:     { name: '橫陣',   fire: 1.0,  aa: 0.30, note: '正面火力最大；側翼與中央較薄，被側擊、背擊傷害加倍。' },
  spindle:  { name: '紡錘陣', fire: 0.85, fireNear: 1.15, aa: 0.30, frontTaken: 0.7, breach: 8,
    note: '中央突破：遠距離火力 ×0.85，但近戰（120 以內）火力 ×1.15；正面受到的傷害 −30%；前端衝進敵方分艦隊時，讓它陣形混亂 8 秒（開火變慢、受傷增加）。兩側薄，容易被包夾。' },
  crescent: { name: '凹形陣', fire: 0.95, aa: 0.30, note: '兩翼向前包住敵軍正面；展開需要時間，兩翼容易被各個擊破。' },
  ring:     { name: '圓陣',   fire: 0.7,  aa: 0.60, noFlank: true, note: '全方位防禦：沒有側背弱點，防空攔截率提高；火力下降。' },
  column:   { name: '縱陣',   fire: 0.6,  aa: 0.25, speed: 1.6, note: '機動最快；正面火力最弱，被橫切損失慘重。' },
  wedge:    { name: '圓錐陣', fire: 0.9, fireNear: 1.0, aa: 0.25, speed: 1.25, frontTaken: 0.85, flankBonus: 1.25, breach: 4,
    note: '快速突擊：速度 ×1.25、正面受傷 −15%，打敵人側面／背後時傷害再 +25%；衝進敵陣讓它混亂 4 秒。適合繞側切入。' },
  hcone:    { name: '空心錐陣', fire: 0.9, fireNear: 1.0, aa: 0.25, speed: 1.25, frontTaken: 0.85, flankBonus: 1.25, breach: 4,
    note: '圓錐陣的變形：艦艇排在空心的錐面上、各分艦隊分瓣錯開，往正前方開火時不會被自己的分艦隊擋住（擬真難度）。其餘特性同圓錐陣。' },
};
const DISORDER = { fire: 0.5, taken: 1.3 };   // 陣形混亂：開火速度 ×0.5、受到傷害 ×1.3
// 命中倍率：受擊方位 × 雙方陣型 × 混亂
function hitMul(asp, aq, tq) {
  let m = asp === 0 ? 1 : asp === 1 ? opts.flankSide : opts.flankRear;
  const tf = FORMATIONS[(tq && tq.group && tq.group.formation) || 'line'], af = aq && aq.group ? FORMATIONS[aq.group.formation] : null;
  if (tf.noFlank) m = 1;
  if (asp === 0 && tf.frontTaken) m *= tf.frontTaken;
  if (asp > 0 && af && af.flankBonus) m *= af.flankBonus;
  if (tq && tq.disorderUntil > U.uTime.value) m *= DISORDER.taken;
  return m;
}
const MORPH_DUR = 7;

function formationRegion(kind, total, opt) {
  const area = total * SHIP_AREA;
  const se = (u, v, a, b) => Math.pow(Math.abs(u / a), 4) + Math.pow(Math.abs(v / b), 4) <= 1;
  if (kind === 'line') {
    let D = Math.sqrt(area / (7 * 0.927)), W = 7 * D;
    if (opt && opt.width) { W = Math.min(Math.max(opt.width, Math.sqrt(area * 1.5)), Math.sqrt(area * 40)); D = area / (0.927 * W); }
    return { bbox: [-W / 2, W / 2, -D / 2, D / 2], inside: (u, v) => se(u, v, W / 2, D / 2), key: (u) => u, alt: 1 };
  }
  if (kind === 'column') {
    const D = Math.sqrt(area * 6 / 0.927), W = D / 6, off = -D * 0.3;
    return { bbox: [-W / 2, W / 2, off - D / 2, off + D / 2], inside: (u, v) => se(u, v - off, W / 2, D / 2), key: (u, v) => -v, alt: 0.8 };
  }
  if (kind === 'spindle') {
    const Wm = Math.sqrt(area / (3 * 0.67)), L = 3 * Wm, off = -L * 0.15;
    return {
      bbox: [-Wm / 2, Wm / 2, off - L / 2, off + L / 2],
      inside: (u, v) => { const s = (v - off + L / 2) / L; return s > 0 && s < 1 && Math.abs(u) <= Wm / 2 * Math.pow(Math.sin(Math.PI * s), 0.8); },
      key: (u, v) => -v, alt: 1.1,
    };
  }
  if (kind === 'crescent') {
    const PHI = 65 * Math.PI / 180;
    const Rm = Math.sqrt(area / (0.56 * PHI)), T = Rm * 0.28, Ov = Rm * Math.sin(PHI) / PHI;
    const ang = (u, v) => Math.atan2(u, -(v - Ov));
    return {
      bbox: [-Rm - T, Rm + T, Ov - Rm - T, Ov],
      inside: (u, v) => { const r = Math.hypot(u, v - Ov); return Math.abs(r - Rm) <= T / 2 && Math.abs(ang(u, v)) <= PHI; },
      key: ang, alt: 1,
    };
  }
  if (kind === 'wedge') {
    // 圓錐：尖端朝前的實心圓錐（底面直徑約等於長度的 1.1 倍），截面是圓；重心（距底面 L/4）放在原點
    // 每艘船佔 CONE_VOL 的體積；inside3 判斷 3D 點，inside 是它在水平面的投影（三角形）
    const L = Math.cbrt(3 * total * CONE_VOL / (Math.PI * CONE_RB * CONE_RB)), Rb = CONE_RB * L, vb = -L / 4, vt = L * 3 / 4;
    const rad = (v) => (vt - v) / L * Rb;
    return {
      bbox: [-Rb, Rb, vb, vt], L, Rb, rad, cone: true,
      inside: (u, v) => v >= vb && v <= vt && Math.abs(u) <= rad(v),
      inside3: (u, y, v) => v >= vb && v <= vt && Math.hypot(u, y) <= rad(v),
      key: (u, v) => -v + Math.abs(u) * 0.35, alt: 1,
    };
  }
  // ring
  const Ro = Math.sqrt(area / (Math.PI * 0.7975)), Ri = Ro * 0.45;
  return {
    bbox: [-Ro, Ro, -Ro, Ro],
    inside: (u, v) => { const r = Math.hypot(u, v); return r <= Ro && r >= Ri; },
    key: (u, v) => Math.atan2(u, v), alt: 1.7,
  };
}

// 產生各分艦隊的落點（艦隊座標），order[k] = 第 k 個切片給哪個分艦隊
function genFormation(kind, counts, order, R, opt) {
  if (kind === 'hcone') return hollowConeLayout(counts, order, R);
  const total = counts.reduce((a, b) => a + b, 0);
  const reg = formationRegion(kind, total, opt);
  const [u0, u1, v0, v1] = reg.bbox;
  let cell = reg.cone ? Math.cbrt(CONE_VOL) : Math.sqrt(SHIP_AREA), pts = [];
  for (let tries = 0; tries < 12; tries++) {
    pts = [];
    if (reg.cone) {
      // 圓錐：在 3D 格子裡取點，[u, v, y]
      for (let v = v0; v <= v1; v += cell) for (let y = -reg.Rb; y <= reg.Rb; y += cell) for (let u = u0; u <= u1; u += cell) {
        const uu = u + (R() - 0.5) * cell * 0.8, yy = y + (R() - 0.5) * cell * 0.8, vv = v + (R() - 0.5) * cell * 0.8;
        if (reg.inside3(uu, yy, vv)) pts.push([uu, vv, yy]);
      }
    } else {
      for (let v = v0; v <= v1; v += cell) for (let u = u0; u <= u1; u += cell) {
        const uu = u + (R() - 0.5) * cell * 0.9, vv = v + (R() - 0.5) * cell * 0.9;
        if (reg.inside(uu, vv)) pts.push([uu, vv]);
      }
    }
    if (pts.length >= total) break;
    cell *= 0.93;
  }
  // 隨機去掉多餘的點
  for (let i = pts.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
  pts.length = total;
  pts.sort((a, b) => reg.key(a[0], a[1]) - reg.key(b[0], b[1]));
  const out = new Array(counts.length);
  let k = 0;
  for (let slice = 0; slice < order.length; slice++) {
    const sqi = order[slice], n = counts[sqi];
    const chunk = pts.slice(k, k + n); k += n;
    let cu = 0, cv = 0; for (const p of chunk) { cu += p[0]; cv += p[1]; } cu /= n; cv /= n;
    // 往中心收一點，讓分艦隊之間留出縫
    // 圓錐的高度來自錐體本身（跟左右一樣縮 0.9，保持圓形截面）；其他陣型的高度隨機散開
    const local = chunk.map((p) => [(p[0] - cu) * 0.9, reg.cone ? p[2] * 0.9 : gauss(R) * 13 * reg.alt, (p[1] - cv) * 0.9]);
    out[sqi] = { cu, cv, local };
  }
  return out;
}

// ───── 整齊排列：等距網格，前後、左右、上下的艦距都相同 ─────
// 1 層：所有船同一平面，畫面上是乾淨的行列；3 層：上下再疊兩層，層距＝艦距
const ORDER_SPACING = { 1: 5.2, 3: 6.2 };
function rimOf(kind, reg) {
  // 0＝中心、1＝邊緣，用來決定多出來的格子從哪裡拿掉
  const [u0, u1, v0, v1] = reg.bbox, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, hu = (u1 - u0) / 2, hv = (v1 - v0) / 2;
  if (kind === 'spindle') return (u, v) => Math.max(Math.abs(v - cv) / hv, Math.abs(u) / hu);
  return (u, v) => Math.pow(Math.abs((u - cu) / hu), 4) + Math.pow(Math.abs((v - cv) / hv), 4);
}
function squareLattice(kind, total, M, s, opt) {
  for (let f = 0.8; f < 6; f *= 1.015) {
    const reg = formationRegion(kind, total * f, opt);
    const [u0, u1, v0, v1] = reg.bbox, pts = [];
    for (let i = Math.ceil(u0 / s); i * s <= u1; i++) for (let j = Math.ceil(v0 / s); j * s <= v1; j++) if (reg.inside(i * s, j * s)) pts.push([i * s, j * s]);
    if (pts.length >= M) {
      const rim = rimOf(kind, reg);
      pts.sort((a, b) => rim(a[0], a[1]) - rim(b[0], b[1]));
      pts.length = M;
      return pts;
    }
  }
  return [];
}
function polarLattice(kind, total, M, s, layers) {
  const pts = [];
  const A = s * s / layers;   // 每艘船佔的面積
  if (kind === 'ring') {
    const Ro = Math.sqrt(total * A / (Math.PI * 0.7975));
    for (let r = Ro * 0.45; pts.length < M; r += s) {
      const n = Math.floor(2 * Math.PI * r / s), need = Math.min(n, M - pts.length);
      // 每圈等弧長；最外圈不滿就從後方置中排
      for (let j = 0; j < need; j++) { const a = Math.PI + (j - (need - 1) / 2) * (2 * Math.PI / n); pts.push([r * Math.sin(a), r * Math.cos(a)]); }
    }
  } else {
    const PHI = 65 * Math.PI / 180, Rm = Math.sqrt(total * A / (0.56 * PHI)), T = Rm * 0.28, Ov = Rm * Math.sin(PHI) / PHI;
    for (let r = Rm - T / 2; pts.length < M; r += s) {
      const n = Math.floor(2 * PHI * r / s) + 1, need = Math.min(n, M - pts.length);
      for (let j = 0; j < need; j++) { const a = (j - (need - 1) / 2) * s / r; pts.push([r * Math.sin(a), Ov - r * Math.cos(a)]); }
    }
  }
  return pts;
}
// 圓錐的 3D 等距網格：放大錐體直到格點夠用，多的從錐面（離軸最遠的）拿掉
function coneLattice(total, s) {
  for (let f = 0.3; f < 8; f *= 1.015) {
    const reg = formationRegion('wedge', total * f), [u0, u1, v0, v1] = reg.bbox, pts = [];
    for (let j = Math.ceil(v0 / s); j * s <= v1; j++) for (let k = Math.ceil(-reg.Rb / s); k * s <= reg.Rb; k++) for (let i = Math.ceil(u0 / s); i * s <= u1; i++)
      if (reg.inside3(i * s, k * s, j * s)) pts.push([i * s, j * s, k * s]);
    if (pts.length >= total) {
      const rim = (p) => Math.hypot(p[0], p[2]) / Math.max(reg.rad(p[1]), 1e-6);
      pts.sort((a, b) => (rim(a) - rim(b)) || (b[1] - a[1]));
      pts.length = total;
      return pts;
    }
  }
  return [];
}
function genOrderly(kind, counts, order, layers = 1, opt) {
  const total = counts.reduce((a, b) => a + b, 0), s = ORDER_SPACING[layers];
  if (kind === 'hcone') return hollowConeLayout(counts, order, null, s);   // 空心錐本身就是立體的，不另外疊層
  let p3;
  if (kind === 'wedge') p3 = coneLattice(total, s);   // 圓錐本身就是立體的，不另外疊層
  else {
    const M = Math.ceil(total / layers);
    const pts = (kind === 'ring' || kind === 'crescent') ? polarLattice(kind, total, M, s, layers) : squareLattice(kind, total, M, s, opt);
    // 疊層，層距也是 s
    p3 = [];
    for (const p of pts) for (let L = 0; L < layers; L++) p3.push([p[0], p[1], (L - (layers - 1) / 2) * s]);
    for (let k = p3.length - 1; p3.length > total && k >= 0; k--) if (p3[k][2] > 0) p3.splice(k, 1);
  }
  const key = formationRegion(kind, total, opt).key;
  p3.sort((a, b) => (key(a[0], a[1]) - key(b[0], b[1])) || (a[2] - b[2]));
  const out = new Array(counts.length);
  let k = 0;
  for (let slice = 0; slice < order.length; slice++) {
    const sqi = order[slice], n = counts[sqi];
    const chunk = p3.slice(k, k + n); k += n;
    let cu = 0, cv = 0; for (const p of chunk) { cu += p[0]; cv += p[1]; } cu /= n; cv /= n;
    out[sqi] = { cu, cv, local: chunk.map((p) => [p[0] - cu, p[2], p[1] - cv]) };
  }
  return out;
}

// ───── 空心錐陣：尖端朝前的空心尖錐 ─────
// 艦艇排在有厚度的錐面上，依繞軸的角度切給各分艦隊（第一瓣以正上方為中心）：各瓣的中心高度、左右位置都不同，
// 往正前方開火的射線從別的分艦隊的上下或旁邊穿過，擬真難度下不會被自己的分艦隊擋住。錐底半徑至少 HCONE_RMIN（不夠就把艦距拉開），
// 讓各瓣的高度差大於誤射的高度容許（FF_RULE.vTol）。只有一支分艦隊時排成實心尖錐（同隊不會擋射界）。
// R＝亂數：散布落點（每艘船佔 CONE_VOL）；沒給＝整齊排列，艦距 s。回傳的 cw＝分艦隊中心的高度
function hollowConeLayout(counts, order, R, s) {
  const N = counts.reduce((a, b) => a + b, 0), n = order.length, hollow = n > 1, K = HCONE_K, TK = 2.2;   // 殼厚＝TK × 艦距（厚一點，前後才短）
  // 錐長：空心＝錐面積 πK·L² × 殼厚 ≈ 艘數 × 每艘體積；實心＝圓錐體積
  const lenOf = (c, f) => hollow ? Math.sqrt(N * f * c * c / (Math.PI * K * TK)) : Math.cbrt(3 * N * f * c * c * c / (Math.PI * K * K));
  const c0 = R ? Math.cbrt(CONE_VOL) : s, cell = hollow ? c0 * Math.max(1, HCONE_RMIN / K / lenOf(c0, 1)) : c0, T = TK * cell;
  // 三瓣以上：瓣與瓣的接縫留空（半寬＝分艦隊外框多出的 9＋半個艦距），同高度的相鄰兩瓣才不會互相擋；尖端因此空出一小段。
  // 接縫的角度依各瓣艘數的比例
  const TAU = 2 * Math.PI, ang = (p) => ((Math.atan2(p[0], p[2]) + Math.PI / n) % TAU + TAU) % TAU;
  const seams = []; if (n > 2) { let cum = 0; for (let i = 0; i < n; i++) { seams.push(cum / N * TAU); cum += counts[order[i]]; } }
  const gap = 9 + cell * 0.5, inGap = (a, r) => seams.some((b) => { const d = Math.abs(((a - b) % TAU + TAU + Math.PI) % TAU - Math.PI); return d < Math.PI / 2 && r * Math.sin(d) < gap; });
  let pts = [], L = 0;
  for (let f = 1; f < 8; f *= 1.04) {   // 接縫與邊緣會少掉一些點：放大到夠用為止
    L = lenOf(cell, f); pts = [];
    const rb = K * L, j = R ? cell * 0.8 : 0, g0 = (x) => Math.ceil(x / cell) * cell;
    for (let v = g0(-L); v <= 0; v += cell) for (let y = g0(-rb); y <= rb; y += cell) for (let u = g0(-rb); u <= rb; u += cell) {
      const uu = j ? u + (R() - 0.5) * j : u, yy = j ? y + (R() - 0.5) * j : y, vv = j ? v + (R() - 0.5) * j : v;
      if (vv > 0 || vv < -L) continue;
      const p = [uu, vv, yy], r = Math.hypot(uu, yy), ro = -K * vv;
      if (r <= ro && (!hollow || r >= ro - T) && !inGap(ang(p), r)) pts.push(p);
    }
    if (pts.length >= N) break;
  }
  pts.sort((a, b) => b[1] - a[1]); pts.length = Math.min(pts.length, N);   // 多的從最後面拿掉
  if (hollow) pts.sort((a, b) => ang(a) - ang(b));
  const mv = pts.reduce((t, p) => t + p[1], 0) / pts.length;   // 前後重心放在原點
  const out = new Array(counts.length), k = R ? 0.9 : 1;   // 散布：往分艦隊中心收一點，讓分艦隊之間留出縫
  let at = 0;
  for (let slice = 0; slice < n; slice++) {
    const sqi = order[slice], c = counts[sqi], chunk = pts.slice(at, at += c);
    let cu = 0, cv = 0, cw = 0; for (const p of chunk) { cu += p[0]; cv += p[1]; cw += p[2]; } cu /= c; cv /= c; cw /= c;
    out[sqi] = { cu, cv: cv - mv, cw, local: chunk.map((p) => [(p[0] - cu) * k, (p[2] - cw) * k, (p[1] - cv) * k]) };
  }
  return out;
}

// 分艦隊要依什麼順序對到切片（盡量少交叉）
function squadronOrder(kind, sqs) {
  const key = (kind === 'spindle' || kind === 'column' || kind === 'wedge' || kind === 'hcone') ? (s) => -s.cv + Math.abs(s.cu) * 0.5 : (s) => s.cu;
  return sqs.map((s, i) => ({ i, k: key(s) })).sort((a, b) => a.k - b.k).map((o) => o.i);
}

// 艦艇對落點：沿前後切成帶狀，帶內再依左右配對
function matchSlots(oldL, newL) {
  const n = oldL.length;
  const bands = Math.max(1, Math.round(Math.sqrt(n / 3)));
  const o = oldL.map((p, i) => ({ p, i })).sort((a, b) => b.p[2] - a.p[2]);
  const nn = newL.map((p, i) => ({ p, i })).sort((a, b) => b.p[2] - a.p[2]);
  const res = new Array(n);
  for (let b = 0; b < bands; b++) {
    const s0 = Math.floor(b * n / bands), s1 = Math.floor((b + 1) * n / bands);
    const ob = o.slice(s0, s1).sort((a, c) => a.p[0] - c.p[0]);
    const nb = nn.slice(s0, s1).sort((a, c) => a.p[0] - c.p[0]);
    for (let k = 0; k < ob.length; k++) res[ob[k].i] = nb[k].p;
  }
  return res;
}

// ───────────────────────── 艦隊資料 ─────────────────────────
let groups = [];          // 部隊：一或多支分艦隊組成，有錨點、航向、陣型、移動目標
let squadrons = [];
let ships = null;
let shipCount = 0;
let aliveBySide = [0, 0];
const outlineGroup = new THREE.Group();
scene.add(outlineGroup);
const labelLayer = document.getElementById('labels');

// 模擬專用隨機數：同一個種子＋同樣的命令＝同樣的戰果（回放、連線都靠這個）
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let battleSeed = 12345, rnd = mulberry32(battleSeed);
function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(R) { return (R() + R() + R() - 1.5); }
function ease(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }
function groupHeading(g, t) { return g.dur > 0 ? g.from + (g.to - g.from) * ease((t - g.start) / g.dur) : g.to; }
// 船身朝向（視覺）：tDur > 0 平滑插值；tDur < 0 等速插值（弧線迴轉時用）；lag 讓每艘船稍晚轉
function visHeading(sq, t, lag = 0) {
  if (sq.tDur > 0) return sq.tFrom + (sq.tTo - sq.tFrom) * ease((t - sq.tStart - lag) / sq.tDur);
  if (sq.tDur < 0) return sq.tFrom + (sq.tTo - sq.tFrom) * Math.min(1, Math.max(0, (t - sq.tStart - lag) / -sq.tDur));
  return sq.tTo;
}
function sqHeadingNow(sq, t) { return visHeading(sq, t, 0); }
function wrapAngle(a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; }
function sqMorphing(sq, t = U.uTime.value) { return sq.mDur > 0 && t < sq.mStart + sq.mDur + 2.2; }
function isMorphing(side, t = U.uTime.value) { return squadrons.some((sq) => !sq.bg && sq.side === side && sqMorphing(sq, t)); }

const SIDE_DEFS = [
  { side: 0, h: -Math.PI / 4, ax: 175, az: -175, formation: 'line', share: 1.0,
    names: ['第一分艦隊', '第二分艦隊', '本隊（旗艦）', '第三分艦隊', '第四分艦隊', '第五分艦隊'] },
  { side: 1, h: Math.PI * 3 / 4, ax: -175, az: 175, formation: 'crescent', share: 1.0,
    names: ['第一分艦隊', '第二分艦隊', '本隊（旗艦）', '第四分艦隊', '第五分艦隊'] },
];

let fleetVersion = 0;
let fleets = [];          // 艦隊（編制單位）：有指揮官、技能狀態；底下是幾支分艦隊
let battleSetup = null;
const SQ_NAMES = ['第一分艦隊', '第二分艦隊', '第三分艦隊', '第四分艦隊', '第五分艦隊', '第六分艦隊'];
// 測試場的預設布陣（沿用原本的兩軍）
function sandboxSetup() {
  const N = opts.perSide;
  const comp = (n) => { const c = TYPE_WEIGHT.map((w) => Math.floor(n * w)); c[4] += n - c.reduce((a, b) => a + b, 0); return c; };
  return { bg: true, fleets: SIDE_DEFS.map((sd) => ({ side: sd.side, name: sd.side ? '聯盟艦隊' : '帝國艦隊', ax: sd.ax, az: sd.az, h: sd.h,
    formation: sd.formation, comp: comp(N), names: sd.names, commander: null })) };
}
// 把一支艦隊的各艦種數量平均分到 K 支分艦隊
function splitComp(comp, K) {
  const out = Array.from({ length: K }, () => new Array(NT).fill(0));
  comp.forEach((n, t) => { for (let k = 0; k < K; k++) out[k][t] = Math.floor(n / K) + (k < n % K ? 1 : 0); });
  return out;
}
function buildFleets(setup = battleSetup || sandboxSetup()) {
  battleSetup = setup;
  setRocks();   // 實體障礙（給碰撞、遮蔽與著色器用）
  fleetVersion++;
  if (shipMesh) { scene.remove(shipMesh); scene.remove(glowMesh); shipGeo.dispose(); }
  outlineGroup.clear();
  labelLayer.innerHTML = '';
  squadrons = []; groups = []; fleets = [];
  SIDE_FAC = (setup.factions || [0, 1]).slice(); applySideNames(); applyPlayerTheme();
  const R = rand(12345);

  // 先決定每支分艦隊的艦數與落點
  const plans = [];
  setup.fleets.forEach((fd, fi) => {
    const fcomp = SHIP_TYPES.map((_, t) => fd.comp[t] || 0);   // 舊資料只有 5 種艦
    const total = fcomp.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const K = fd.names ? fd.names.length : Math.max(fd.supply ? 1 : 2, Math.min(6, Math.round(total / 380)));
    const comps = splitComp(fcomp, K);
    const counts = comps.map((c) => c.reduce((a, b) => a + b, 0));
    const flagK = Math.floor((K - 1) / 2);
    if (!fd.supply) { counts[flagK]++; comps[flagK][1]++; }   // 本隊多一艘旗艦（戰列艦）；補給艦隊沒有旗艦
    const order = counts.map((_, i) => i);
    const lay = fd.orderly ? genOrderly(fd.formation, counts, order, fd.layers || 1) : genFormation(fd.formation, counts, order, R);
    const fleet = { id: fi, side: fd.side, name: fd.name, commander: fd.commander || null, hangar: fd.hangar || null, sqs: [], reserve: !!fd.reserve, entry: fd.entry || null,
      supply: !!fd.supply, follow: fd.follow != null ? fd.follow : -1, reinfOf: fd.reinfOf != null ? fd.reinfOf : null, keep: fd.keep || null,
      skills: {}, initial: total + (fd.supply ? 0 : 1), ai: fd.ai || null, activateAt: fd.activateAt != null ? fd.activateAt : null, aiS: {} };
    for (const sk of (fd.commander && fd.commander.skills) || []) {
      // 戰術熟練：每階 +1 次（fixed 的技能除外）；呼叫增援：這場有準備增援艦隊才能用
      const left = sk === 'reinforce' && !setup.fleets.some((o) => o.reinfOf === fi) ? 0 : SKILLS[sk].uses + (SKILLS[sk].fixed ? 0 : talentRank(fd.commander, 'veteran'));
      fleet.skills[sk] = { left, ready: 0, until: 0, target: null };
      const ks = fd.keep && fd.keep.skills && fd.keep.skills[sk];   // 模擬室接續：技能剩餘次數與冷卻
      if (ks) { fleet.skills[sk].left = Math.min(left, ks.left); fleet.skills[sk].ready = ks.cd; }
    }
    fleets.push(fleet);
    const ay0 = opts.flat ? 0 : fd.ay || 0;   // 一般難度：都在基準面
    const grp = { side: fd.side, ax: fd.ax, az: fd.az, ay: ay0, ayT: ay0, p: 0, pCmd: 0, avx: 0, avz: 0, from: fd.h, to: fd.h, start: 0, dur: 0, formation: fd.formation, orderly: !!fd.orderly, layers: fd.layers || 1, width: null, goal: null, target: null, sqs: [], inactive: !!fd.reserve,
      queue: fd.keep && fd.keep.queue ? fd.keep.queue.map((it) => ({ ...it, qid: ++qidSeq })) : [] };   // 模擬室接續：命令隊列
    groups.push(grp);
    for (let k = 0; k < K; k++) {
      const name = fd.names ? fd.names[k] : (k === flagK ? '本隊（旗艦）' : SQ_NAMES[k < flagK ? k : k - 1]);
      plans.push({ side: fd.side, fleet: grp, fleetObj: fleet, name: fd.supply ? (K > 1 ? `補給第${'一二三四五六'[k]}隊` : '補給隊') : name, n: counts[k], comp: comps[k], lay: lay[k], flagship: k === flagK && !fd.supply });
    }
  });
  // 遠方增援艦隊（只在測試場）：固定在背景，不參與陣型
  if (setup.bg) for (const sd of SIDE_DEFS) {
    const N = opts.perSide;
    const bgN = Math.round(N * 0.45 / 2);
    const f = [Math.sin(sd.h), Math.cos(sd.h)], r = [Math.cos(sd.h), -Math.sin(sd.h)];
    for (let k = -1; k <= 1; k += 2) {
      const d3 = Math.sqrt(bgN * 16 / 1.8), W = d3 * 1.8;
      const local = [];
      for (let i = 0; i < bgN; i++) {
        let x, z; do { x = (R() - 0.5) * W; z = (R() - 0.5) * d3; } while ((x / W * 2) ** 2 + (z / d3 * 2) ** 2 > 1);
        local.push([x, -70 + gauss(R) * 13, z]);
      }
      const back = 420;
      plans.push({ side: sd.side, bg: true, name: '遠方增援艦隊', n: bgN, local,
        x: sd.ax - f[0] * back + r[0] * k * W * 0.66, z: sd.az - f[1] * back + r[1] * k * W * 0.66, h: sd.h });
    }
  }

  const total = plans.reduce((s, p) => s + p.n, 0);
  shipCount = total;
  ships = {
    sq: new Uint8Array(total), type: new Uint8Array(total), alive: new Uint8Array(total), side: new Uint8Array(total),
    lx0: new Float32Array(total), ly0: new Float32Array(total), lz0: new Float32Array(total),
    lx1: new Float32Array(total), ly1: new Float32Array(total), lz1: new Float32Array(total), lag: new Float32Array(total),
    // 蛇行迴轉：每艘船沿軌跡的位置／朝向（snOn＝使用中），與暫存的陣型目標
    snX: new Float32Array(total), snZ: new Float32Array(total), snH: new Float32Array(total), snOn: new Uint8Array(total),
    svX: new Float32Array(total), svY: new Float32Array(total), svZ: new Float32Array(total),
    // 打散重組：每艘船的起點與終點（世界座標）
    scX0: new Float32Array(total), scZ0: new Float32Array(total), scX3: new Float32Array(total), scZ3: new Float32Array(total),
    // 戰鬥數值：耐久、開火冷卻、飛彈存量、艦載機存量
    hp: new Float32Array(total), cd: new Float32Array(total), cd1: new Float32Array(total), cd2: new Float32Array(total),
    sh: new Float32Array(total), shMax: new Float32Array(total), shT: new Float32Array(total), ammo: new Uint8Array(total), stock: new Uint16Array(total), ftr: new Uint8Array(total),
    // 自動武器：飛彈冷卻、艦載機出擊冷卻、維修機出動冷卻、機上剩餘維修機
    mcd: new Float32Array(total), fcd: new Float32Array(total), rcd: new Float32Array(total), rep: new Uint8Array(total),
    fout: new Uint8Array(total), fbt: new Float32Array(total), hang: new Uint8Array(total * 4), foutR: new Uint8Array(total * 4),   // 機庫：各任務的架數、在外面飛的架數   // 航母：在外面飛的艦載機數、補充新機的進度
  };
  const aLocal = new Float32Array(total * 3), aLocal2 = new Float32Array(total * 3), aInfo = new Float32Array(total * 4), aState = new Float32Array(total * 2), aScale = new Float32Array(total), aPath = new Float32Array(total * 4);

  let si = 0;
  plans.forEach((p, sqi) => {
    const sq = {
      side: p.side, bg: !!p.bg || !!(p.fleetObj && p.fleetObj.reserve), hidden: !!(p.fleetObj && p.fleetObj.reserve), fleet: p.fleetObj || null,
      name: p.name, list: [], alive: 0, flagship: -1, typeAlive: new Array(NT).fill(0),
      group: p.fleet || null, mStart: 0, mDur: 0, oFrom: p.fleet && p.fleet.orderly ? 1 : 0, oTo: p.fleet && p.fleet.orderly ? 1 : 0, relayUntil: 0, hitW: [0, 0, 0],
      off0: p.lay ? [p.lay.cu, p.lay.cv, p.lay.cw || 0] : null, off1: p.lay ? [p.lay.cu, p.lay.cv, p.lay.cw || 0] : null,
      x: p.x || 0, y: (p.fleet && p.fleet.ay) || 0, p: 0, z: p.z || 0, h: p.h != null ? p.h : p.fleet.to,
      tFrom: p.h != null ? p.h : p.fleet.to, tTo: p.h != null ? p.h : p.fleet.to, tStart: 0, tDur: 0,
    };
    const local = p.lay ? p.lay.local : p.local;
    // 依前後分配艦種：前排小船、後排大船、航母最後
    const order = local.map((l, i) => ({ i, k: l[2] + (R() - 0.5) * 20 })).sort((a, b) => b.k - a.k);
    const typeOf = new Array(local.length);
    if (p.comp) {
      // 依艦種數量由前到後擺：護衛、驅逐、巡洋、戰列、航母
      const seq = []; for (const t of SHIP_ORDER_FRONT_TO_BACK) for (let k = 0; k < p.comp[t]; k++) seq.push(t);
      order.forEach((o, rank) => { typeOf[o.i] = seq[rank] != null ? seq[rank] : 4; });
    } else {
      const cum = []; { let s = 0; for (const w of [...TYPE_WEIGHT].reverse()) { s += w; cum.push(s); } }
      order.forEach((o, rank) => { const q = rank / local.length; let t = 4; for (let j = 0; j < 5; j++) if (q < cum[j]) { t = 4 - j; break; } typeOf[o.i] = t; });
    }
    let flagSlot = -1;
    if (p.flagship) { let best = 1e9; local.forEach((l, i) => { const d = Math.hypot(l[0], l[2] + 8); if (d < best) { best = d; flagSlot = i; } }); }
    local.forEach((l, k) => {
      const isFlag = k === flagSlot;
      const t = isFlag ? 1 : typeOf[k];
      ships.sq[si] = sqi; ships.type[si] = t; ships.alive[si] = 1; ships.side[si] = p.side;
      const st = SHIP_TYPES[t];
      ships.hp[si] = st.hp * (isFlag ? 3 : 1);
      ships.shMax[si] = ships.sh[si] = st.sh * (isFlag ? 3 : 1) * (1 + fleetMods(p.fleetObj || null).shield); ships.shT[si] = -99;
      // 各類砲的冷卻錯開（固定雜湊，不動到佈陣的亂數）
      ships.cd[si] = st.guns.main ? st.guns.main.cd * (0.3 + 0.9 * hash01(si * 1.7 + 4)) : 0;
      ships.cd1[si] = st.guns.sec ? st.guns.sec.cd * (0.3 + 0.9 * hash01(si * 2.9 + 5)) : 0;
      ships.cd2[si] = st.guns.aa ? st.guns.aa.cd * (0.3 + 0.9 * hash01(si * 4.3 + 6)) : 0;
      ships.ammo[si] = st.missile ? st.missile.n : 0; ships.stock[si] = st.supply ? st.supply.stock : 0; ships.ftr[si] = 0;
      const kp = p.fleetObj && p.fleetObj.keep;   // 模擬室接續：照平均比例套回耐久、護盾、飛彈與補給存量
      if (kp) {
        ships.hp[si] = Math.max(1, ships.hp[si] * (kp.hp ?? 1)); ships.sh[si] *= kp.sh ?? 1;
        if (st.missile) ships.ammo[si] = Math.round(st.missile.n * (kp.ammo ?? 1));
        if (st.supply) ships.stock[si] = Math.round(st.supply.stock * (kp.stock ?? 1));
      } if (st.fighters) { const mx = hangarMix(p.fleetObj, st.fighters.n); for (let r = 0; r < 4; r++) { ships.hang[si * 4 + r] = mx[r]; ships.ftr[si] += mx[r]; } } ships.rep[si] = st.repair ? st.repair.n : 0;
      // 開戰時的冷卻錯開（用固定雜湊，不動到佈陣的亂數）
      ships.mcd[si] = st.missile ? st.missile.cd * (0.25 + 0.75 * hash01(si * 3.1 + 1)) : 0; ships.fcd[si] = st.fighters ? 2 + 6 * hash01(si * 5.7 + 2) : 0; ships.rcd[si] = 3 * hash01(si * 2.3 + 3);
      sq.typeAlive[t]++;
      ships.lx0[si] = ships.lx1[si] = l[0]; ships.ly0[si] = ships.ly1[si] = p.fleet && (p.fleet.orderly || p.fleet.formation === 'hcone') ? l[1] : isFlag ? 4 : l[1] * (t <= 1 ? 0.6 : 1); ships.lz0[si] = ships.lz1[si] = l[2];
      ships.lag[si] = R() * 1.6 + R() * 0.6;
      aLocal.set([ships.lx0[si], ships.ly0[si], ships.lz0[si]], si * 3); aLocal2.set([ships.lx0[si], ships.ly0[si], ships.lz0[si]], si * 3);
      aInfo.set([sqi, st.look != null ? st.look + 0.5 : t, SIDE_FAC[p.side], R()], si * 4);   // 貼圖列；借用外觀的艦種 +0.5（著色器換色區分）
      aState.set([0, ships.lag[si]], si * 2);
      aScale[si] = isFlag ? TYPE_W[1] * 2.4 : TYPE_W[t] * (0.92 + R() * 0.16);
      if (isFlag) sq.flagship = si;
      sq.list.push(si); sq.alive++;
      si++;
    });
    measureSquadron(sq);
    sq.W0 = sq.W1; sq.D0 = sq.D1;
    if (sq.group) sq.group.sqs.push(sq);
    if (sq.fleet) sq.fleet.sqs.push(sq);
    squadrons.push(sq);
  });

  shipGeo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  shipGeo.index = base.index; shipGeo.attributes.position = base.attributes.position;
  shipGeo.setAttribute('aLocal', new THREE.InstancedBufferAttribute(aLocal, 3).setUsage(THREE.DynamicDrawUsage));
  shipGeo.setAttribute('aLocal2', new THREE.InstancedBufferAttribute(aLocal2, 3).setUsage(THREE.DynamicDrawUsage));
  shipGeo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(aInfo, 4));
  shipGeo.setAttribute('aState', new THREE.InstancedBufferAttribute(aState, 2).setUsage(THREE.DynamicDrawUsage));
  shipGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));
  shipGeo.setAttribute('aPath', new THREE.InstancedBufferAttribute(aPath, 4).setUsage(THREE.DynamicDrawUsage));
  shipGeo.instanceCount = total;
  shipMesh = new THREE.Mesh(shipGeo, shipMat); shipMesh.frustumCulled = false; shipMesh.renderOrder = 1;
  glowMesh = new THREE.Mesh(shipGeo, glowMat); glowMesh.frustumCulled = false; glowMesh.renderOrder = 2;
  scene.add(shipMesh, glowMesh);

  // 戰術符號：單位方框，用 scale 表示分艦隊大小
  squadrons.forEach((sq) => {
    const col = new THREE.Color(FACTION[SIDE_FAC[sq.side]].ui);
    const g = new THREE.Group();
    const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const box = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthTest: false }));
    const arrowPts = [[-0.12, 0.56], [0, 0.72], [0.12, 0.56]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const arrow = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arrowPts), box.material);
    g.add(box, arrow);
    g.renderOrder = 5;
    outlineGroup.add(g);
    sq.outline = g;
    const el = document.createElement('div');
    el.className = 'sq-label s' + SIDE_FAC[sq.side] + (sq.bg ? ' bg' : '');
    el.innerHTML = `<b>${sq.fleet && battleSetup && !battleSetup.bg ? sq.fleet.name : FACTION[SIDE_FAC[sq.side]].name}</b> ${sq.name}<span></span><i></i>`;
    labelLayer.appendChild(el);
    sq.label = el; sq.labelNum = el.querySelector('span'); sq.labelState = el.querySelector('i');
  });
  recountAlive();
  pushSquadronUniforms();
  refreshFormationUI && refreshFormationUI();
}

function measureSquadron(sq) {
  let mx = 0, mz = 0;
  for (const i of sq.list) { if (!ships.alive[i]) continue; mx = Math.max(mx, Math.abs(ships.lx1[i])); mz = Math.max(mz, Math.abs(ships.lz1[i])); }
  sq.W1 = mx * 2 + 10; sq.D1 = mz * 2 + 10;
}

function recountAlive() {
  aliveBySide = [0, 0];
  for (const sq of squadrons) if (!sq.bg) aliveBySide[sq.side] += sq.alive;
}

// 變換陣型：記下目前位置當起點，產生新落點當目標（對象是一個部隊）
function changeFormation(g, kind, orderly, opt) {
  if (!g || !g.sqs.length) return;
  if (maneuvering(g)) {
    // 迴轉中：完成後再變陣
    g.afterSnake = () => changeFormation(g, kind, orderly, opt);
    g.formation = kind; if (orderly != null) g.orderly = orderly;
    refreshFormationUI && refreshFormationUI();
    return;
  }
  if (orderly == null) orderly = !!g.orderly;
  if (kind !== 'line') opt = null; else if (!opt && g.width) opt = { width: g.width };
  const t = U.uTime.value;
  const R = rand((rnd() * 1e9) | 0);
  // 只用剩下的船重排：被擊沉的不佔位置，陣型依存活艦數重新算大小
  const sqs = g.sqs.filter((sq) => sq.list.some((i) => ships.alive[i]));
  if (!sqs.length) { g.formation = kind; if (orderly != null) g.orderly = orderly; refreshFormationUI && refreshFormationUI(); return; }
  const live = sqs.map((sq) => sq.list.filter((i) => ships.alive[i]));
  const eOf = (sq) => (sq.mDur > 0 ? ease((t - sq.mStart) / sq.mDur) : 1);
  const cur = sqs.map((sq) => { const e = eOf(sq); return { cu: sq.off0[0] + (sq.off1[0] - sq.off0[0]) * e, cv: sq.off0[1] + (sq.off1[1] - sq.off0[1]) * e, cw: (sq.off0[2] || 0) + ((sq.off1[2] || 0) - (sq.off0[2] || 0)) * e }; });
  const counts = live.map((l) => l.length);
  const order = squadronOrder(kind, cur);
  const lay = orderly ? genOrderly(kind, counts, order, g.layers || 1, opt) : genFormation(kind, counts, order, R, opt);
  const aL = shipGeo.getAttribute('aLocal'), aL2 = shipGeo.getAttribute('aLocal2'), vMorph = Math.max(1, groupBaseSpeed(g)), morphMul = fleetMods(sqs[0].fleet).morph;   // 陣型演練：變陣更快
  sqs.forEach((sq, k) => {
    const eNow = eOf(sq);
    const omNow = sq.mDur > 0 ? (sq.oFrom + (sq.oTo - sq.oFrom) * eNow) : (sq.oTo || 0);
    const list = live[k];
    const oldL = list.map((i) => shipLocalCPU(i, t, [0, 0, 0]));
    // 旗艦固定佔最靠近中心後方的位置
    const fi = sq.flagship >= 0 ? list.indexOf(sq.flagship) : -1;
    let newL = lay[k].local;
    if (fi >= 0) {
      let best = 0, bd = 1e9; newL.forEach((l, j) => { const d = Math.hypot(l[0], l[2] + 8); if (d < bd) { bd = d; best = j; } });
      const flagSlot = newL[best]; if (!orderly && kind !== 'hcone') flagSlot[1] = 4;
      const restNew = newL.filter((_, j) => j !== best), restOld = oldL.filter((_, j) => j !== fi);
      const m = matchSlots(restOld, restNew);
      newL = []; let r = 0;
      for (let j = 0; j < oldL.length; j++) newL.push(j === fi ? flagSlot : m[r++]);
    } else newL = matchSlots(oldL, newL);
    // 已沉的船停在原地（看不見），不留空位
    for (const i of sq.list) if (!ships.alive[i]) {
      const L = shipLocalCPU(i, t, [0, 0, 0]);
      ships.lx0[i] = ships.lx1[i] = L[0]; ships.ly0[i] = ships.ly1[i] = L[1]; ships.lz0[i] = ships.lz1[i] = L[2];
      aL.array.set(L, i * 3); aL2.array.set(L, i * 3);
    }
    list.forEach((i, j) => {
      ships.lx0[i] = oldL[j][0]; ships.ly0[i] = oldL[j][1]; ships.lz0[i] = oldL[j][2];
      const big = ships.type[i] <= 1 && i !== sq.flagship;
      ships.lx1[i] = newL[j][0]; ships.ly1[i] = orderly || kind === 'hcone' ? newL[j][1] : (i === sq.flagship ? 4 : newL[j][1] * (big ? 0.6 : 1)); ships.lz1[i] = newL[j][2];
      aL.array.set([ships.lx0[i], ships.ly0[i], ships.lz0[i]], i * 3);
      aL2.array.set([ships.lx1[i], ships.ly1[i], ships.lz1[i]], i * 3);
    });
    sq.off0 = [cur[k].cu, cur[k].cv, cur[k].cw];
    sq.off1 = [lay[k].cu, lay[k].cv, lay[k].cw || 0];   // 換陣＝整個部隊回到同一個陣型平面（空心錐陣的分艦隊各有自己的高度）
    sq.W0 = lerpNum(sq.W0, sq.W1, eNow); sq.D0 = lerpNum(sq.D0, sq.D1, eNow);
    measureSquadron(sq);
    // 換陣的移動距離很遠（例如把分散的艦隊編在一起）：依距離拉長時間，不准瞬間滑過去
    const far = Math.hypot(sq.off1[0] - sq.off0[0], sq.off1[1] - sq.off0[1], sq.off1[2] - (sq.off0[2] || 0));
    sq.mStart = t; sq.mDur = Math.max(MORPH_DUR * morphMul, far / (vMorph * 5));   // 換陣最快是巡航速度的 5 倍
    sq.oFrom = omNow; sq.oTo = orderly ? 1 : 0;
  });
  aL.needsUpdate = true; aL2.needsUpdate = true;
  g.formation = kind; g.orderly = orderly;
  refreshFormationUI && refreshFormationUI();
}
function lerpNum(a, b, e) { return a + (b - a) * e; }

// ───── 通訊干擾接口：受干擾的一方下令變陣後，要延遲才開始 ─────
// 之後的技能或特殊場地只要呼叫 setJam(side, 秒數, 延遲秒數)
const jam = [{ until: 0, delay: 0 }, { until: 0, delay: 0 }];
const orderQueue = [];
function setJam(side, duration, delay) {
  if (!jammed(side)) jamSeen[side] = snapEnemy(side);   // 雷達失效：這一方看到的敵情停在干擾開始那一刻
  jam[side] = { until: U.uTime.value + duration, delay };
}
function jammed(side) { return jam[side].until > U.uTime.value; }
// 被干擾時看到的敵軍分艦隊（位置、艘數、陣型都是干擾開始時的）；沒被干擾＝即時的
const jamSeen = [null, null];
function snapEnemy(side) {
  const m = new Map();
  for (const q of squadrons) if (q.side !== side) m.set(q, { x: q.x, y: q.y || 0, z: q.z, h: q.h, W: q.W, D: q.D, alive: q.alive, name: q.name, side: q.side, bg: q.bg, formation: q.group ? q.group.formation : null, to: q.group ? q.group.to : q.h, group: q.group, fleet: q.fleet, t: U.uTime.value, stale: true });
  return m;
}
// 看到的敵方分艦隊：即時＝q 本身；最後已知＝快照（stale）；不知道＝null
//   戰爭迷霧：用「觀察的艦隊」（AI 想事情時＝那支艦隊）的情報；沒有迷霧：被干擾時是干擾開始那一刻的快照
function seenSq(viewer, q) {
  if (q.side === viewer) return q;
  if (fowOn()) { const f = fowObs(viewer); return f ? fowSeen(f, q) : q; }
  return jammed(viewer) && jamSeen[viewer] ? jamSeen[viewer].get(q) || null : q;
}
// 玩家畫面要不要遮敵情（作戰中被干擾；觀摩時看得到全部）。戰爭迷霧另外由 fowView 處理
function playerFogged() { return typeof GAME !== 'undefined' && (GAME.phase === 'battle' || GAME.phase === 'replay') && !GAME.watch && !NET.spec && jammed(GAME.playerSide) && !fowOn(); }

// ───── 戰爭迷霧（擬真難度＋opts.fow；規則記進回放）─────
// 每支艦隊各有一份「知道哪些敵方分艦隊的位置」（f.fowK，每 FOW_RULE.tick 重算）：
//   自己的分艦隊偵測半徑內、視線沒被巨大小行星擋住；攻擊型艦載機周圍；掃描結果、開火暴露（f.fowRev 到期前）
//   沒被干擾＝全軍共享（每支艦隊都知道全軍知道的）；被干擾＝各艦隊只知道自己偵測到的，掃描也沒有結果
// 最後已知：f.fowLast（分艦隊 → 最後看到的快照）；看過去那個位置已經沒有人＝刪掉。全部在模擬裡算（回放一致）
const FOW = { tick: -1, scanReady: [0, 0], pings: [[], []], scans: [], start: [null, null], obs: null, auto: [true, true], rlog: new Map() };   // rlog：偵察機（FT 索引）→ 被干擾時記下、還沒回報的情報
function fowOn() { return !!opts.fow && !!battleSetup && !battleSetup.bg; }
function fowOmni(side) { return !!(battleSetup && battleSetup.omni && battleSetup.omni[side]); }   // 關卡設定：這一方全知
function sqIdx(q) { return squadrons[q.qi] === q ? q.qi : (q.qi = squadrons.indexOf(q)); }
function fowReset() {
  FOW.tick = -1; FOW.scanReady = [U.uTime.value + FOW_RULE.scanFirst, U.uTime.value + FOW_RULE.scanFirst];   // 開戰 scanFirst 秒後才能第一次掃描 FOW.pings = [[], []]; FOW.scans = []; FOW.start = [null, null]; FOW.obs = null; FOW.auto = [true, true]; FOW.rlog = new Map();
  squadrons.forEach((q, i) => (q.qi = i));
  for (const f of fleets) { f.fowK = new Uint8Array(MAX_SQ); f.fowRev = new Float32Array(MAX_SQ); f.fowLast = new Map(); }
}
function fowRecon(f) { const c = f && f.commander; return c && c.tal ? c.tal.recon || 0 : 0; }
function fowSensor(q) {
  let r = 0; for (let k = 0; k < NT; k++) if (q.typeAlive[k]) r = Math.max(r, SHIP_TYPES[k].sensor);
  return r * (1 + FOW_RULE.sensorRecon * fowRecon(q.fleet));
}
function fowSnap(e, t, o = {}) {
  return Object.assign(o, { x: e.x, y: e.y || 0, z: e.z, h: e.h, W: e.W, D: e.D, alive: e.alive, name: e.name, side: e.side, bg: e.bg, fleet: e.fleet,
    formation: e.group ? e.group.formation : null, to: e.group ? e.group.to : e.h, t, stale: true });
}
const fowLive = (e) => !e.bg && e.alive > 0 && !e.hidden;
function fowUpdate() {
  if (!fowOn()) return;
  if (!fleets.length) return;
  if (!fleets[0].fowK) fowReset();
  if (FOW.tick < 0) pushSquadronUniforms();   // 第一次：先算出分艦隊位置
  const t = U.uTime.value, nS = squadrons.length;
  FOW.tick = simTick;
  if (!FOW.start[0]) for (let s = 0; s < 2; s++) { const al = squadrons.filter((q) => q.side === s && fowLive(q)); FOW.start[s] = al.length ? centerOf(al) : { x: 0, y: 0, z: 0 }; }   // 開戰時的位置（部署時看得到）
  for (const f of fleets) f.fowK.fill(0);
  // 自己的分艦隊偵測到的（3D 距離，量到對方外框）
  for (const q of squadrons) {
    if (!fowLive(q) || !q.fleet) continue;
    const R = fowSensor(q), row = q.fleet.fowK;
    for (const e of squadrons) {
      if (e.side === q.side || !fowLive(e)) continue;
      const i = sqIdx(e); if (row[i]) continue;
      if (Math.hypot(e.x - q.x, (e.y || 0) - (q.y || 0), e.z - q.z) - Math.max(e.W, e.D) / 2 > R) continue;
      if (ROCKS.length && rockBlock(q.x, q.y || 0, q.z, e.x, e.y || 0, e.z) >= 0) continue;   // 躲在巨大小行星後面
      row[i] = 1;
    }
  }
  // 攻擊型艦載機、偵察機看到的：算母艦那支艦隊的
  //   偵察機飛進掃描區域（離目標點 < 半徑 FT.heal）＝區域掃描：以目標點為中心的球體內都看得到，離開後再保留 scanShow 秒
  //   所以就算之後被打下來，進到區域那一刻起掃到的都已經回報；飛行路徑上（去程、回程）自己周圍 recon.eye 看到的也一起回報
  //   被干擾：回報不了 → 記在偵察機上（FOW.rlog），干擾結束或飛回母艦時才回報（fowReconReport）；被打下來＝情報跟著沒了
  for (let s = 0; s < 2; s++) for (const j of aliveF[s]) {
    if (FT.kind[j] === 1 || FT.state[j] !== 2) continue;
    const c = FT.carrier[j]; if (c < 0 || c >= shipCount) continue;
    const f = squadrons[ships.sq[c]].fleet; if (!f) continue;
    const px = fP[j * 3], py = fP[j * 3 + 1], pz = fP[j * 3 + 2], rc = FT.kind[j] === 2, jm = jammed(s);
    const survey = rc && !FT.ret[j] && Math.hypot(px - FT.ax[j], py - FT.ay[j], pz - FT.az[j]) < FT.heal[j];
    if (survey && FT.tk[j] === 0) FT.tk[j] = 1, FT.cd[j] = FOW_RULE.recon.loiter;   // 開始掃描（盤旋計時）
    if (rc && !jm && FOW.rlog.has(j)) fowReconReport(j, f, '干擾結束');   // 通訊恢復：先把記下來的回報
    const eye = rc ? FOW_RULE.recon.eye : FOW_RULE.ftr;
    for (const e of squadrons) {
      if (e.side === s || !fowLive(e)) continue;
      const i = sqIdx(e), ex = Math.max(e.W, e.D) / 2;
      const inS = survey && (e.x - FT.ax[j]) ** 2 + ((e.y || 0) - FT.ay[j]) ** 2 + (e.z - FT.az[j]) ** 2 < (FT.heal[j] + ex) ** 2;
      const inE = (e.x - px) ** 2 + ((e.y || 0) - py) ** 2 + (e.z - pz) ** 2 < (eye + ex) ** 2;
      if (!inS && !inE) continue;
      if (rc && jm) { let L = FOW.rlog.get(j); if (!L) FOW.rlog.set(j, (L = new Map())); L.set(e, fowSnap(e, t, L.get(e))); continue; }   // 被干擾：記在偵察機上
      if (inS) f.fowRev[i] = Math.max(f.fowRev[i], t + FOW_RULE.scanShow);
      else f.fowK[i] = 1;
    }
  }
  // 掃描結果、開火暴露
  for (const f of fleets) for (let i = 0; i < nS; i++) if (f.fowRev[i] > t && fowLive(squadrons[i])) f.fowK[i] = 1;
  // 共享：沒被干擾＝全軍共用；關卡設定全知的一方＝全部知道
  for (let s = 0; s < 2; s++) {
    const fs = fleets.filter((f) => f.side === s);
    if (fowOmni(s)) { for (const f of fs) for (let i = 0; i < nS; i++) f.fowK[i] = squadrons[i].side !== s && fowLive(squadrons[i]) ? 1 : 0; continue; }
    if (jammed(s)) continue;
    const u = new Uint8Array(MAX_SQ); for (const f of fs) for (let i = 0; i < nS; i++) u[i] |= f.fowK[i];
    for (const f of fs) f.fowK.set(u);
  }
  // 最後已知：看得到的更新快照；快照的位置現在在自己（被干擾時＝自己艦隊；否則全軍）的偵測範圍內卻看不到＝人已經不在那裡，刪掉
  for (const f of fleets) {
    for (let i = 0; i < nS; i++) if (f.fowK[i]) { const e = squadrons[i]; f.fowLast.set(e, fowSnap(e, t, f.fowLast.get(e))); }
    if (!f.fowLast.size) continue;
    const eyes = squadrons.filter((q) => q.side === f.side && fowLive(q) && (jammed(f.side) ? q.fleet === f : true));
    for (const [e, o] of f.fowLast) {
      if (f.fowK[sqIdx(e)]) continue;
      if (e.alive <= 0 && t - o.t > FOW_RULE.last) { f.fowLast.delete(e); continue; }
      for (const q of eyes) if (Math.hypot(o.x - q.x, o.y - (q.y || 0), o.z - q.z) < fowSensor(q) * 0.8 && !(ROCKS.length && rockBlock(q.x, q.y || 0, q.z, o.x, o.y, o.z) >= 0)) { f.fowLast.delete(e); break; }
    }
  }
  for (let s = 0; s < 2; s++) FOW.pings[s] = FOW.pings[s].filter((p) => t - p.t < FOW_RULE.ping);
  FOW.scans = FOW.scans.filter((p) => t - p.t < 4);
}
// f 這支艦隊知不知道敵方分艦隊 q 的位置（沒有迷霧＝一律知道）；沒有艦隊（艦載機的母艦沉了等）＝這一方有人知道就算
function fowKnows(f, q, side) {
  if (!fowOn() || q.side === (f ? f.side : side)) return true;
  if (f && f.fowK) return !!f.fowK[sqIdx(q)];
  const i = sqIdx(q); return fleets.some((o) => o.side === side && o.fowK && o.fowK[i]);
}
function fowKnowsSq(fromSq, q) { return fowKnows(fromSq && fromSq.fleet, q, fromSq && fromSq.side != null ? fromSq.side : 1 - q.side); }
// 觀察的艦隊：AI 想事情時＝那支艦隊（FOW.obs）；玩家畫面＝艦橋所在的艦隊，否則第一支還在的艦隊（沒被干擾時每支都一樣）
function fowObs(side) {
  if (FOW.obs && FOW.obs.side === side) return FOW.obs;
  if (BR.on && BR.fleet && BR.fleet.side === side && BR.fleet.fowK) return BR.fleet;
  let any = null;
  for (const f of fleets) if (f.side === side && f.fowK) { if (!f.reserve && f.sqs.some((q) => q.alive > 0)) return f; any = any || f; }
  return any;
}
function fowSeen(f, q, maxAge = Infinity) {
  if (fowKnows(f, q)) return q;
  const o = f.fowLast && f.fowLast.get(q);
  return o && U.uTime.value - o.t <= maxAge ? o : null;
}
// ── 玩家畫面 ──
// 要不要用玩家這一方的情報畫敵軍（戰爭迷霧；回放、觀摩看得到全部）
function fowView() { return fowOn() && typeof GAME !== 'undefined' && GAME.phase === 'battle' && !GAME.watch && !GAME.replaying && !NET.spec; }   // 觀戰：看得到全部
function pFiltered() { return fowView() || playerFogged(); }
// 玩家看到的敵方分艦隊（同 seenSq：即時／快照／null）；maxAge＝最後已知位置保留幾秒
function pSeen(q, maxAge = FOW_RULE.last) {
  if (q.side === GAME.playerSide) return q;
  if (fowView()) { const f = fowObs(GAME.playerSide); return f ? fowSeen(f, q, maxAge) : q; }
  return playerFogged() ? seenSq(GAME.playerSide, q) : q;
}
function fowHidden(q) { return fowView() && !q.bg && q.side !== GAME.playerSide && !fowKnows(fowObs(GAME.playerSide), q); }   // 3D／戰術圖：不畫這支敵軍
// 估計的敵方兵力（看得到的照實、最後已知照快照、沒看過的照開戰時）
function fowEstAlive(side) {
  const f = fowObs(1 - side); let n = 0;
  for (const g of fleets) if (g.side === side && !g.reserve) for (const q of g.sqs) { if (q.bg) continue; const v = f ? fowSeen(f, q) : q; n += v ? v.alive : q.list.length; }
  return n;
}
// ── 掃描：從艦隊中心發出 FOW_RULE.scanR 的脈衝，範圍內的敵軍顯示 scanShow 秒；冷卻每一方共用 ──
//   被掃到的一方只看得到「掃描訊號的方向」（FOW.pings），不知道正確位置；被干擾時照樣發出（會被對方察覺）但沒有結果
function fowScan(f, auto = false) {
  if (!fowOn() || !f) return -1;
  const t = U.uTime.value, s = f.side, al = f.sqs.filter((q) => fowLive(q));
  if (t < FOW.scanReady[s] || !al.length) return -1;
  const C = centerOf(al), jm = jammed(s);
  FOW.scanReady[s] = t + Math.max(10, FOW_RULE.scanCd - FOW_RULE.scanCdRecon * fowRecon(f));
  FOW.scans.push({ side: s, x: C.x, y: C.y, z: C.z, t, fleet: f.id, jam: jm });
  let n = 0; const pinged = new Set();
  for (const e of squadrons) {
    if (e.side === s || !fowLive(e) || Math.hypot(e.x - C.x, (e.y || 0) - C.y, e.z - C.z) > FOW_RULE.scanR) continue;
    if (e.fleet && !pinged.has(e.fleet)) { pinged.add(e.fleet); FOW.pings[e.side].push({ fleet: e.fleet.id, a: Math.atan2(C.x - e.x, C.z - e.z), t }); }   // 只有方向
    if (jm || (ROCKS.length && rockBlock(C.x, C.y, C.z, e.x, e.y || 0, e.z) >= 0)) continue;
    f.fowRev[sqIdx(e)] = t + FOW_RULE.scanShow; n++;
  }
  fowUpdate();
  const who = `${f.name}${auto ? '（自動掃描）' : ''}`;
  if (typeof toast === 'function' && s === GAME.playerSide && !GAME.replaying && !GAME.watch) toast(jm ? `${who}：掃描沒有回應（通訊受干擾）` : n ? `${who}：掃描發現 ${n} 支敵方分艦隊` : `${who}：掃描範圍內沒有發現敵軍`, jm || !n ? 'hint' : '');
  return n;
}
function fowScanLeft(side) { return Math.max(0, FOW.scanReady[side] - U.uTime.value); }
// 自動掃描：每一方還有敵方艦隊看不到、冷卻好了，就從第一支還在的艦隊自動發出脈衝掃描（FOW.auto＝開關，用命令 'autoscan' 改）
function fowAutoScan() {
  if (!fowOn()) return;
  for (let s = 0; s < 2; s++) {
    if (!FOW.auto[s] || fowScanLeft(s) > 0) continue;
    const ob = fleets.filter((o) => o.side === s && !o.reserve && !o.supply && o.sqs.some(fowLive)); if (!ob.length) continue;
    const en = fleets.filter((o) => o.side !== s && !o.reserve && o.sqs.some(fowLive));
    if (!en.length || en.every((o) => o.sqs.some((q) => fowLive(q) && ob.some((f) => fowKnows(f, q))))) continue;   // 全都看得到
    fowScan(ob[0], true);
  }
}
// ── 區域掃描（主動）：航母派出偵察機飛到 P，在上空盤旋時半徑 fowReconR 的球體內都看得到 ──
function fowReconR(f) { return FOW_RULE.recon.r * (1 + FOW_RULE.recon.rTal * talentRank(f && f.commander, 'survey')); }
function fowReconLeft(f) { return Math.max(0, (f.reconReady || 0) - U.uTime.value); }
function fowHasCarrier(f) { return f.sqs.some((q) => fowLive(q) && q.typeAlive[0] > 0); }
// 偵察機回報被干擾時記下的情報（飛回母艦，或干擾結束）：成為「最後已知位置」（看到的那一刻）；
//   回報的當下沒被干擾＝全軍共享，被干擾＝只有母艦那支艦隊
function fowReconReport(j, f, why) {
  const L = FOW.rlog.get(j); FOW.rlog.delete(j);
  if (!L || !L.size || !f || !f.fowLast) return;
  const s = f.side, to = jammed(s) ? [f] : fleets.filter((o) => o.side === s && o.fowLast);
  let tMin = Infinity, tMax = 0;
  for (const [e, o] of L) { tMin = Math.min(tMin, o.t); tMax = Math.max(tMax, o.t); for (const g of to) { const cur = g.fowLast.get(e); if (!cur || cur.t < o.t) g.fowLast.set(e, { ...o }); } }
  const a0 = Math.round(U.uTime.value - tMax), a1 = Math.round(U.uTime.value - tMin);
  if (typeof toast === 'function' && s === GAME.playerSide && !GAME.replaying && !GAME.watch) toast(`${f.name}：偵察機${why}回報 ${L.size} 支敵方分艦隊的位置（${a0 === a1 ? a0 : `${a0}～${a1}`} 秒前看到的）${jammed(s) ? '・通訊受干擾，只有本艦隊知道' : ''}`);
}
function launchRecon(f, P) {
  if (!fowOn() || !f || fowReconLeft(f) > 0) return 0;
  let best = -1, bd = 1e18;   // 離目標最近的航母起飛
  for (const q of f.sqs) if (fowLive(q) && q.typeAlive[0] > 0) for (const i of q.list) if (ships.alive[i] && SHIP_TYPES[ships.type[i]].fighters) { shipWorldCPU(i, _a); const d = (_a.x - P.x) ** 2 + (_a.z - P.z) ** 2; if (d < bd) { bd = d; best = i; } }
  if (best < 0) return -1;
  if (!launchCraft(best, 1, 2, -1, U.uTime.value, 0, P)) return -2;   // 機位滿了
  const j = launchCraft.last;
  FOW.rlog.delete(j);   // 這個機位上一架偵察機沒回報的情報（被打下來了）
  FT.fuel[j] = FOW_RULE.recon.fuel; FT.heal[j] = fowReconR(f); FT.tk[j] = 0; FT.cd[j] = 0;
  f.reconReady = U.uTime.value + FOW_RULE.recon.cd;
  return 1;
}
// 開火暴露：被 fromSq 打的那支艦隊看得到它幾秒
function fowExpose(fromSq, target) {
  if (!fowOn() || target < 0) return;
  const tf = squadrons[ships.sq[target]].fleet;
  if (tf && tf.fowRev) { const i = sqIdx(fromSq); tf.fowRev[i] = Math.max(tf.fowRev[i], U.uTime.value + FOW_RULE.expose); }
}
// ── 區域攻擊：部隊（g.area）對地圖上的一點開火，射程與射角內才會打；有敵艦在範圍內就隨機打中它（看不到＝盲射，命中率打折）──
function sqArea(sq) { const a = sq.group && sq.group.area; return a && a.until > U.uTime.value ? a : null; }
function areaShip(side, A) {
  const r = FOW_RULE.area.r, c = [];
  for (const e of squadrons) if (e.side !== side && fowLive(e) && Math.hypot(e.x - A.x, (e.y || 0) - A.y, e.z - A.z) < r + Math.max(e.W, e.D) / 2) c.push(e);
  if (!c.length) return -1;
  for (let k = 0; k < 8; k++) {
    const e = c[(rnd() * c.length) | 0], i = e.list[(rnd() * e.list.length) | 0];
    if (!ships.alive[i]) continue;
    shipWorldCPU(i, _b); if (Math.hypot(_b.x - A.x, _b.y - A.y, _b.z - A.z) < r) return i;
  }
  return -1;
}
function jamDelay(side) { return jam[side].until > U.uTime.value ? jam[side].delay : 0; }
function issueFormation(g, kind, orderly, opt) {
  if (!g) return;
  const d = jamDelay(g.side);
  if (d > 0) {
    const due = U.uTime.value + d;
    for (const sq of g.sqs) sq.relayUntil = due;
    orderQueue.push({ t: due, fn: () => changeFormation(g, kind, orderly, opt) });
    g.formation = kind; if (orderly != null) g.orderly = orderly;   // 介面先顯示新命令
    refreshFormationUI && refreshFormationUI();
    return;
  }
  changeFormation(g, kind, orderly, opt);
}
function runOrderQueue() {
  const t = U.uTime.value;
  for (let k = orderQueue.length - 1; k >= 0; k--) if (orderQueue[k].t <= t) { const o = orderQueue[k]; orderQueue.splice(k, 1); o.fn(); }
}

// ───── 座標換算：同一個位移，從朝向 h0 的陣型座標改用朝向 h0+d 的陣型座標表示 ─────
function rotUV(u, v, d) { const c = Math.cos(d), s = Math.sin(d); return [u * c - v * s, u * s + v * c]; }
function measureFrom(sq) {
  let mx = 0, mz = 0;
  for (const i of sq.list) { mx = Math.max(mx, Math.abs(ships.lx0[i])); mz = Math.max(mz, Math.abs(ships.lz0[i])); }
  sq.W0 = mx * 2 + 10; sq.D0 = mz * 2 + 10;
}
// 把船身朝向補間設成從目前角度轉到 Ht
// 朝向 h、俯仰 p 的陣型座標軸：R 右、U 上、F 前
function basis3(h, p) { const sh = Math.sin(h), ch = Math.cos(h), sp = Math.sin(p), cp = Math.cos(p); return { R: [ch, 0, -sh], U: [-sh * sp, cp, -ch * sp], F: [sh * cp, sp, ch * cp] }; }
function visTurnTo(q, Ht, t, dur) {
  const c = sqHeadingNow(q, t), d = wrapAngle(Ht - c);
  q.tFrom = c; q.tTo = c + d; q.tStart = t; q.tDur = Math.abs(d) > 0.01 ? dur : 0;
}

// ───── 編組：把選取的分艦隊組成一個部隊（不會跳位） ─────
// 朝向不同的分艦隊：陣型座標立即換成部隊朝向，船從目前位置流回自己的隊形（重排＋轉向同時）
function formGroup(list) {
  list = list.filter((s) => !s.bg);
  if (!list.length) return null;
  const g0 = list[0].group;
  if (g0 && g0.sqs.filter((s) => s.alive > 0 && !s.bg).length === list.length && list.every((s) => s.group === g0)) return g0;
  for (const og of new Set(list.map((q) => q.group))) if (og) endManeuver(og, false);
  const t = U.uTime.value;
  let sx = 0, sy = 0, sz = 0, ss = 0, sc = 0;
  for (const q of list) { sx += q.x; sy += q.y || 0; sz += q.z; ss += Math.sin(q.h); sc += Math.cos(q.h); }
  const H = Math.atan2(ss, sc), P = g0.p || 0;   // 新部隊沿用第一支的俯仰
  const g = { side: list[0].side, ax: sx / list.length, ay: sy / list.length, az: sz / list.length, p: P, pCmd: g0.pCmd || 0, avx: 0, avz: 0, from: H, to: H, start: 0, dur: 0,
    formation: g0.formation, orderly: g0.orderly, layers: g0.layers || 1, width: g0.width, goal: null, plan: null, target: g0.target, sqs: [] };
  g.ayT = g.ay;
  const B = basis3(H, P);
  const aL = shipGeo.getAttribute('aLocal'), aL2 = shipGeo.getAttribute('aLocal2');
  for (const q of list) {
    if (q.group) q.group.sqs = q.group.sqs.filter((o) => o !== q);
    const dx = q.x - g.ax, dy = (q.y || 0) - g.ay, dz = q.z - g.az;
    const u = dx * B.R[0] + dy * B.R[1] + dz * B.R[2], v = dx * B.F[0] + dy * B.F[1] + dz * B.F[2], w = dx * B.U[0] + dy * B.U[1] + dz * B.U[2];
    q.off0 = [u, v, w]; q.off1 = [u, v, w];
    const d = wrapAngle(H - q.h), dp = P - (q.p || 0);   // 舊座標 → 新座標
    if (Math.abs(d) > 0.02 || Math.abs(dp) > 0.02) {
      const e = q.mDur > 0 ? ease((t - q.mStart) / q.mDur) : 1;
      const omNow = q.mDur > 0 ? q.oFrom + (q.oTo - q.oFrom) * e : (q.oTo || 0);
      const O = basis3(q.h, q.p || 0);
      for (const i of q.list) {
        const L = shipLocalCPU(i, t, [0, 0, 0]);
        const wx = O.R[0] * L[0] + O.U[0] * L[1] + O.F[0] * L[2], wy = O.R[1] * L[0] + O.U[1] * L[1] + O.F[1] * L[2], wz = O.R[2] * L[0] + O.U[2] * L[1] + O.F[2] * L[2];
        const nx = wx * B.R[0] + wy * B.R[1] + wz * B.R[2], ny = wx * B.U[0] + wy * B.U[1] + wz * B.U[2], nz = wx * B.F[0] + wy * B.F[1] + wz * B.F[2];
        ships.lx0[i] = nx; ships.ly0[i] = ny; ships.lz0[i] = nz;
        aL.array.set([nx, ny, nz], i * 3);
        aL2.array.set([ships.lx1[i], ships.ly1[i], ships.lz1[i]], i * 3);
      }
      measureFrom(q);
      q.mStart = t; q.mDur = 3 + Math.abs(d) / Math.PI * 4; q.oFrom = omNow;
    }
    visTurnTo(q, H, t, Math.max(1.5, Math.abs(wrapAngle(H - sqHeadingNow(q, t))) / (Math.PI / 4) * 2.5));
    q.group = g; g.sqs.push(q);
  }
  aL.needsUpdate = true; aL2.needsUpdate = true;
  for (const o of groups) if (!o.sqs.length) { if (o.goalMarker) o.goalMarker.visible = false; if (o.tLine) o.tLine.visible = false; }
  groups = groups.filter((o) => o.sqs.length);
  groups.push(g);
  return g;
}
// 剛性轉向：整個陣型繞部隊中心轉（小角度用）
function turnGroupTo(g, Ht) {
  const t = U.uTime.value, cur = groupHeading(g, t), d = wrapAngle(Ht - cur);
  if (Math.abs(d) < 0.01) return;
  // 部隊散得很開時，外圍繞中心轉的線速度不能超過部隊速度的 5 倍（否則遠處的分艦隊會「飛」過去）
  let rMax = 0; for (const q of g.sqs) if (q.alive > 0) rMax = Math.max(rMax, Math.hypot(q.off1[0], q.off1[1]) + Math.max(q.W1 || 0, q.D1 || 0) / 2);
  const dur = Math.max(2, Math.abs(d) / (Math.PI / 4) * 3, Math.abs(d) * rMax / Math.max(1, groupSpeed(g, t) * 5));
  g.from = cur; g.to = cur + d; g.start = t; g.dur = dur;
  for (const q of g.sqs) { const c = sqHeadingNow(q, t); q.tFrom = c; q.tTo = c + wrapAngle(cur + d - c); q.tStart = t; q.tDur = dur; }
}
// 原地轉向：陣型座標立即換到新朝向（船的世界位置不變），之後由變陣把船帶到新位置
function reframeGroup(g, Hn) {
  const t = U.uTime.value, H0 = groupHeading(g, t);
  Hn = H0 + wrapAngle(Hn - H0);
  const d = Hn - H0;   // 舊座標 → 新座標
  const aL = shipGeo.getAttribute('aLocal'), aL2 = shipGeo.getAttribute('aLocal2');
  for (const sq of g.sqs) {
    sq.off0 = [...rotUV(sq.off0[0], sq.off0[1], d), sq.off0[2] || 0]; sq.off1 = [...rotUV(sq.off1[0], sq.off1[1], d), sq.off1[2] || 0];
    for (const i of sq.list) {
      let [x, z] = rotUV(ships.lx0[i], ships.lz0[i], d); ships.lx0[i] = x; ships.lz0[i] = z;
      [x, z] = rotUV(ships.lx1[i], ships.lz1[i], d); ships.lx1[i] = x; ships.lz1[i] = z;
      aL.array.set([ships.lx0[i], ships.ly0[i], ships.lz0[i]], i * 3);
      aL2.array.set([ships.lx1[i], ships.ly1[i], ships.lz1[i]], i * 3);
    }
    measureFrom(sq); measureSquadron(sq);
    visTurnTo(sq, Hn, t, Math.max(2, Math.abs(d) / (Math.PI / 4) * 2.2));
  }
  aL.needsUpdate = true; aL2.needsUpdate = true;
  g.from = g.to = Hn; g.dur = 0;
}

// ───── 移動規劃 ─────
// 規則（H0＝目前朝向，H1＝指定朝向，P＝目的地）：
//   |H1−H0| ≤ 60°        → 平移：直接走過去，途中剛性微調朝向；往後走＝倒退（0.5 倍速），往側面 0.6 倍速
//   60°～120°、太近 → 原地轉向：重排、移動、轉向同時進行
//   ≥ 120°（反向）         → 蛇行迴轉：艦首沿平滑軌跡（Dubins 曲線）繞回，後面的船走同一條軌跡；
//                             轉彎處陣型橫向收窄成一道艦流，出彎後再展開，最後停在 P
const BASE_SPEED = 10, MOVE_ACC = 4, TAU = Math.PI * 2;
function rVec(h) { return [Math.cos(h), -Math.sin(h)]; }
function arcSeg(sx, sz, h0, sgn, phi, R) {
  const [rx, rz] = rVec(h0), cx = sx + sgn * R * rx, cz = sz + sgn * R * rz;
  const h1 = h0 + sgn * phi, [ex, ez] = rVec(h1);
  return { type: 'A', cx, cz, R, h0, h1, sgn, phi, len: phi * R, sx, sz, ex: cx - sgn * R * ex, ez: cz - sgn * R * ez };
}
function lineSeg(ax, az, bx, bz, h) {
  const len = Math.hypot(bx - ax, bz - az);
  return { type: 'L', sx: ax, sz: az, ex: bx, ez: bz, len, h0: h != null ? h : Math.atan2(bx - ax, bz - az) };
}
function lineDir(x, z, h, L) { return lineSeg(x, z, x + Math.sin(h) * L, z + Math.cos(h) * L, h); }
function angMod(a) { a = ((a % TAU) + TAU) % TAU; return a > TAU - 1e-5 ? 0 : a; }
function arcRadius(W) { return Math.min(90, Math.max(45, W * 0.15)); }
function lineMul(sg, H) {
  if (sg.len < 1e-6) return 1;
  const c = ((sg.ex - sg.sx) * Math.sin(H) + (sg.ez - sg.sz) * Math.cos(H)) / sg.len;
  return c >= 0 ? 0.6 + 0.4 * c : 0.6 + 0.1 * c;
}
// 最短的「弧－直線－弧」路徑（起點朝向 h0 → 終點朝向 h1，轉彎半徑 R）
function dubins(x0, z0, h0, x1, z1, h1, R) {
  let best = null;
  const [r0x, r0z] = rVec(h0), [r1x, r1z] = rVec(h1);
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
    const c1x = x0 + s1 * R * r0x, c1z = z0 + s1 * R * r0z, c2x = x1 + s2 * R * r1x, c2z = z1 + s2 * R * r1z;
    const vx = c2x - c1x, vz = c2z - c1z, d = Math.hypot(vx, vz);
    let ht, L;
    if (s1 === s2) { ht = d < 1e-6 ? h0 : Math.atan2(vx, vz); L = d; }
    else { if (d < 2 * R) continue; ht = Math.atan2(vx, vz) + Math.asin(2 * s1 * R / d); L = Math.sqrt(d * d - 4 * R * R); }
    const p1 = angMod(s1 * (ht - h0)), p2 = angMod(s2 * (h1 - ht)), tot = R * (p1 + p2) + L;
    if (!best || tot < best.tot) best = { tot, s1, s2, p1, p2, L };
  }
  const a1 = arcSeg(x0, z0, h0, best.s1, best.p1, R);
  const l = lineDir(a1.ex, a1.ez, a1.h1, best.L);
  const a2 = arcSeg(l.ex, l.ez, a1.h1, best.s2, best.p2, R);
  return [a1, l, a2];
}
// g 只需要 ax, az 與朝向；ext＝部隊外框 {W, D, cu, cv}。不改動任何狀態（預覽也用這個）
function planMove(g, P, H1, pivot, ext, uturn = opts.uturn) {
  if (Math.abs(g.p || 0) > 0.08 && uturn !== 'pivot') uturn = 'pivot';   // 陣型傾斜中：不做水平的蛇行／打散迴轉
  const t = U.uTime.value, H0 = groupHeading(g, t);
  if (H1 == null) H1 = g.dur > 0 ? g.to : H0;
  H1 = H0 + wrapAngle(H1 - H0);
  const dH = H1 - H0, adH = Math.abs(dH), DEG = Math.PI / 180;
  const ax = g.ax, az = g.az, dx = P.x - ax, dz = P.z - az, d = Math.hypot(dx, dz);
  const R = arcRadius(ext.W);
  const plan = { H0, H1, P: { x: P.x, z: P.z }, R, segs: [] };
  if (adH <= 60 * DEG) { plan.kind = 'translate'; if (d > 0.5) plan.segs.push(lineSeg(ax, az, P.x, P.z)); return plan; }
  if (pivot || adH < 120 * DEG || d < Math.max(20, R * 1.5)) { plan.kind = 'pivot'; if (d > 0.5) plan.segs.push(lineSeg(ax, az, P.x, P.z)); return plan; }
  // 蛇行：軌跡是「艦首中心」走的路。出發後兩翼放慢、往中線靠攏，整支艦隊拉成一條艦流跟著艦首轉彎；
  // 出彎後在最後一段直線上重新展開。所以軌跡前後各留一段直線
  const kA = Math.min(1, 0.8 * R / Math.max(1, ext.W / 2));
  const mode = uturn === 'snake' || uturn === 'scatter' ? uturn : (kA >= 0.3 ? 'snake' : 'scatter');
  if (mode === 'scatter') return planScatter(plan, ax, az, H0, H1, dH, d, R, dx, dz);
  plan.kind = 'snake';
  const halfW = ext.W / 2, vF = ext.cv + ext.D / 2, D = ext.D;
  const kArc = Math.min(1, 0.8 * R / Math.max(1, halfW)), c = kArc < 1 ? 0.5 : 0;
  const Lm = Math.max(35, 1.2 * halfW * (1 - kArc), 1.65 * c * halfW);
  const Ax = ax + Math.sin(H0) * vF, Az = az + Math.cos(H0) * vF;           // 目前艦首
  const Px = P.x + Math.sin(H1) * vF, Pz = P.z + Math.cos(H1) * vF;       // 到達時艦首
  const lead = lineDir(Ax, Az, H0, Lm);
  const Lf = Lm + D + c * halfW + 10, Gx = Px - Math.sin(H1) * Lf, Gz = Pz - Math.cos(H1) * Lf;
  const mid = dubins(lead.ex, lead.ez, H0, Gx, Gz, H1, R);
  const tail = lineDir(Gx, Gz, mid[2].h1, Lf);
  plan.segs = [lead, ...mid, tail].filter((s) => s.len > 0.01);
  plan.sn = { vF, D, cu: ext.cu, kArc, c, Lm };
  return plan;
}

// ───── 蛇行軌跡 ─────
function segPoint(sg, s, out) {
  if (sg.type === 'B') return bezAt(sg.sc, sg.sx, sg.sz, sg.ex, sg.ez, bezTau(sg, s), out);
  if (sg.type === 'L') { out.x = sg.sx + Math.sin(sg.h0) * s; out.z = sg.sz + Math.cos(sg.h0) * s; out.h = sg.h0; return out; }
  const h = sg.h0 + sg.sgn * s / sg.R, [rx, rz] = rVec(h);
  out.x = sg.cx - sg.sgn * sg.R * rx; out.z = sg.cz - sg.sgn * sg.R * rz; out.h = h; return out;
}
function prepSnake(pl) {
  let c = 0;
  pl.cum = pl.segs.map((sg) => { const v = c; c += sg.len; return v; });
  pl.total = c;
}
const _tp = { x: 0, z: 0, h: 0 };
function trailAt(pl, sig, out = _tp) {
  const segs = pl.segs;
  if (sig <= 0) { segPoint(segs[0], 0, out); out.x += Math.sin(out.h) * sig; out.z += Math.cos(out.h) * sig; }
  else if (sig >= pl.total) { const L = segs[segs.length - 1]; segPoint(L, L.len, out); const e = sig - pl.total; out.x += Math.sin(out.h) * e; out.z += Math.cos(out.h) * e; }
  else { let k = segs.length - 1; while (k > 0 && pl.cum[k] > sig) k--; segPoint(segs[k], sig - pl.cum[k], out); }
  return out;
}
// 收攏程度 w（0＝原陣型，1＝完全拉成艦流）與它對艦首行進距離的變化率
function snakeMerge(pl) {
  const L = pl.sn.Lm, a = Math.min(1, pl.S / L), b = Math.min(1, Math.max(0, (pl.total - pl.S) / L));
  const x = Math.min(a, b), w = x * x * (3 - 2 * x), dw = x >= 1 ? 0 : 6 * x * (1 - x) / L * (a <= b ? 1 : -1);
  return [w, dw];
}
// 開始蛇行：凍結目前陣型（進行中的變陣目標先存起來，結束後接著做）
function startSnake(g, pl) {
  const t = U.uTime.value;
  prepSnake(pl);
  const aL = shipGeo.getAttribute('aLocal'), aL2 = shipGeo.getAttribute('aLocal2');
  for (const sq of g.sqs) {
    const e = sq.mDur > 0 ? ease((t - sq.mStart) / sq.mDur) : 1;
    const om = sq.mDur > 0 ? sq.oFrom + (sq.oTo - sq.oFrom) * e : (sq.oTo || 0);
    const cu = sq.off0[0] + (sq.off1[0] - sq.off0[0]) * e, cv = sq.off0[1] + (sq.off1[1] - sq.off0[1]) * e;
    sq.snSave = { off1: sq.off1, oTo: sq.oTo, W1: sq.W1, D1: sq.D1 };
    const cw = (sq.off0[2] || 0) + ((sq.off1[2] || 0) - (sq.off0[2] || 0)) * e;
    sq.off0 = [cu, cv, cw]; sq.off1 = [cu, cv, cw]; sq.oFrom = sq.oTo = om;
    sq.W0 = sq.W1 = lerpNum(sq.W0, sq.W1, e); sq.D0 = sq.D1 = lerpNum(sq.D0, sq.D1, e);
    for (const i of sq.list) {
      const L = shipLocalCPU(i, t, [0, 0, 0]);
      ships.svX[i] = ships.lx1[i]; ships.svY[i] = ships.ly1[i]; ships.svZ[i] = ships.lz1[i];
      ships.lx0[i] = ships.lx1[i] = L[0]; ships.ly0[i] = ships.ly1[i] = L[1]; ships.lz0[i] = ships.lz1[i] = L[2];
      aL.array.set(L, i * 3); aL2.array.set(L, i * 3);
      ships.snOn[i] = 1;
    }
    sq.mDur = 0;
  }
  aL.needsUpdate = true; aL2.needsUpdate = true;
  pl.S = 0;
}
// 每幀：依軌跡算出每艘船的位置與朝向（同一條路，越後面的船越晚到）
function updateSnake(g) {
  const pl = g.plan, sn = pl.sn, S = pl.S, aP = shipGeo.getAttribute('aPath'), A = aP.array;
  const [w, dw] = snakeMerge(pl), k = 1 - (1 - sn.kArc) * w, dk = -(1 - sn.kArc) * dw, base = S - sn.vF, cu = sn.cu;
  const c = trailAt(pl, base);
  g.ax = c.x; g.az = c.z; g.to = g.from = g.to + wrapAngle(c.h - g.to); g.dur = 0;
  for (const sq of g.sqs) {
    const u0 = sq.off1[0], v0 = sq.off1[1];
    let p = trailAt(pl, base + v0 - sn.c * Math.abs(u0 - cu) * w);
    let lat = cu + (u0 - cu) * k;
    sq.x = p.x + Math.cos(p.h) * lat; sq.z = p.z - Math.sin(p.h) * lat; sq.h = p.h; sq.y = (g.ay || 0) + (sq.off1[2] || 0); sq.p = 0;
    sq.W = sq.W1 * (0.3 + 0.7 * k); sq.D = sq.D1;
    for (const i of sq.list) {
      const u = u0 + ships.lx1[i] - cu, au = Math.abs(u);
      // 每艘船：越靠兩翼越晚到（讓中央先走、兩翼併入），橫向依 k 收窄
      const q = trailAt(pl, base + v0 + ships.lz1[i] - sn.c * au * w);
      lat = cu + u * k;
      const x = q.x + Math.cos(q.h) * lat, z = q.z - Math.sin(q.h) * lat;
      // 船頭朝實際移動方向：沿軌跡前進 ＋ 橫向靠攏／展開
      const h = q.h + Math.atan2(u * dk, Math.max(0.05, 1 - sn.c * au * dw));
      ships.snX[i] = x; ships.snZ[i] = z; ships.snH[i] = h;
      A[i * 4] = x; A[i * 4 + 1] = z; A[i * 4 + 2] = h; A[i * 4 + 3] = 1;
    }
  }
  aP.needsUpdate = true;
}
// 結束蛇行（到達或中途改命令）：把每艘船目前的位置換回陣型座標，再流回存起來的陣型
function endSnake(g, arrived) {
  const pl = g.plan; if (!pl || pl.kind !== 'snake') return;
  const t = U.uTime.value, sn = pl.sn;
  updateSnake(g);
  const H = arrived ? g.to + wrapAngle(pl.H1 - g.to) : g.to;
  if (arrived) { g.ax = pl.P.x; g.az = pl.P.z; }
  const fx = Math.sin(H), fz = Math.cos(H), rx = Math.cos(H), rz = -Math.sin(H);
  const toU = (dx, dz) => dx * rx + dz * rz, toV = (dx, dz) => dx * fx + dz * fz;
  const aL = shipGeo.getAttribute('aLocal'), aL2 = shipGeo.getAttribute('aLocal2'), aP = shipGeo.getAttribute('aPath');
  for (const sq of g.sqs) {
    const sv = sq.snSave || { off1: sq.off1, oTo: sq.oTo, W1: sq.W1, D1: sq.D1 };
    const ou = toU(sq.x - g.ax, sq.z - g.az), ovv = toV(sq.x - g.ax, sq.z - g.az);
    let dmax = Math.hypot(ou - sv.off1[0], ovv - sv.off1[1]);
    sq.off0 = [ou, ovv, sq.off1[2] || 0]; sq.off1 = sv.off1;
    for (const i of sq.list) {
      const lx = toU(ships.snX[i] - sq.x, ships.snZ[i] - sq.z), lz = toV(ships.snX[i] - sq.x, ships.snZ[i] - sq.z);
      ships.lx0[i] = lx; ships.lz0[i] = lz;
      ships.lx1[i] = ships.svX[i]; ships.ly1[i] = ships.svY[i]; ships.lz1[i] = ships.svZ[i];
      dmax = Math.max(dmax, Math.abs(lx - ships.lx1[i]) + Math.abs(lz - ships.lz1[i]) + Math.abs(ships.ly0[i] - ships.ly1[i]));
      aL.array.set([ships.lx0[i], ships.ly0[i], ships.lz0[i]], i * 3);
      aL2.array.set([ships.lx1[i], ships.ly1[i], ships.lz1[i]], i * 3);
      ships.snOn[i] = 0; aP.array[i * 4 + 3] = 0;
    }
    measureFrom(sq); sq.W1 = sv.W1; sq.D1 = sv.D1; sq.oTo = sv.oTo; sq.snSave = null;
    sq.mStart = t; sq.mDur = dmax > 0.3 ? Math.min(6, 2 + dmax / 25) : 0;
    // 船身：從軌跡上的朝向轉到部隊朝向
    const c = sq.h, d = wrapAngle(H - c);
    sq.tFrom = c; sq.tTo = c + d; sq.tStart = t; sq.tDur = Math.abs(d) > 0.01 ? 2.5 : 0;
  }
  aL.needsUpdate = true; aL2.needsUpdate = true; aP.needsUpdate = true;
  g.from = g.to = H; g.dur = 0;
  g.lastV = arrived ? 0 : pl.v;
  g.plan = null; if (arrived) g.goal = null;
  if (g.afterSnake) { const f = g.afterSnake; g.afterSnake = null; f(); }
}

// ───── 打散重組迴轉：每艘船各自走一條弧線繞回，在目的地重新組成陣型 ─────
// 曲線＝三次貝茲（起點沿目前朝向出發、終點沿新朝向進場）＋往轉彎那一側的鼓起，所以每艘船都會自己掉頭
function bezAt(sc, x0, z0, x3, z3, tau, out, ka = 1, kb = 1) {
  const u = 1 - tau, b1 = 3 * u * u * tau, b2 = 3 * u * tau * tau, b3 = tau * tau * tau, b0 = u * u * u;
  const a = sc.a * ka, c1x = x0 + sc.f0x * a, c1z = z0 + sc.f0z * a, c2x = x3 - sc.f1x * a, c2z = z3 - sc.f1z * a, bx = sc.bx * kb, bz = sc.bz * kb;
  const sn = Math.sin(Math.PI * tau), env = sn * sn, denv = Math.PI * Math.sin(2 * Math.PI * tau);
  out.x = b0 * x0 + b1 * c1x + b2 * c2x + b3 * x3 + bx * env;
  out.z = b0 * z0 + b1 * c1z + b2 * c2z + b3 * z3 + bz * env;
  const d0 = 3 * u * u, d1 = 6 * u * tau, d2 = 3 * tau * tau;
  const vx = d0 * (c1x - x0) + d1 * (c2x - c1x) + d2 * (x3 - c2x) + bx * denv;
  const vz = d0 * (c1z - z0) + d1 * (c2z - c1z) + d2 * (z3 - c2z) + bz * denv;
  if (vx * vx + vz * vz > 1e-6) out.h = Math.atan2(vx, vz);
  return out;
}
function bezTau(sg, s) {
  const L = sg.lut, n = L.length - 1;
  if (s <= 0) return 0; if (s >= sg.len) return 1;
  let k = 1; while (k < n && L[k] < s) k++;
  return (k - 1 + (s - L[k - 1]) / Math.max(1e-6, L[k] - L[k - 1])) / n;
}
function planScatter(plan, ax, az, H0, H1, dH, d, R, dx, dz) {
  const [r0x, r0z] = rVec(H0), ut = dx * r0x + dz * r0z;
  const side = Math.abs(ut) > 0.15 * d ? Math.sign(ut) : (dH >= 0 ? 1 : -1);
  const b = R * 1.6 + d * 0.1;
  const sc = { f0x: Math.sin(H0), f0z: Math.cos(H0), f1x: Math.sin(H1), f1z: Math.cos(H1), a: Math.max(R * 1.6, d * 0.4), bx: r0x * b * side, bz: r0z * b * side };
  const sg = { type: 'B', sc, sx: ax, sz: az, ex: plan.P.x, ez: plan.P.z, R, lut: [0] };
  const p = { x: ax, z: az, h: H0 }; let px = ax, pz = az, L = 0;
  for (let k = 1; k <= 48; k++) { bezAt(sc, ax, az, sg.ex, sg.ez, k / 48, p); L += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; sg.lut.push(L); }
  sg.len = L;
  plan.kind = 'scatter'; plan.segs = [sg];
  plan.T = Math.max(12, L / (BASE_SPEED * 1.5));
  return plan;
}
const SCATTER_LAG = 1.3;
function hash01(i) { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
function startScatter(g, pl, width) {
  const t = U.uTime.value, H = pl.H1, fx = Math.sin(H), fz = Math.cos(H), rx = Math.cos(H), rz = -Math.sin(H);
  const A = { x: g.ax, z: g.az };
  // 陣型座標轉到新朝向，並在新朝向下重新排一次（橫陣寬度＝畫線長度）
  reframeGroup(g, H);
  // 被干擾時畫陣線：打散迴轉先照原本的陣型重組，改成橫陣要等干擾的延遲（迴轉完才變）
  const jammedLine = width != null && jamDelay(g.side) > 0;
  changeFormation(g, width != null && !jammedLine ? 'line' : g.formation, g.orderly, width != null && !jammedLine ? { width } : null);
  if (width != null) g.width = width;
  if (jammedLine) issueFormation(g, 'line', g.orderly, { width });
  for (const sq of g.sqs) {
    sq.scS = [A.x + rx * sq.off0[0] + fx * sq.off0[1], A.z + rz * sq.off0[0] + fz * sq.off0[1], pl.P.x + rx * sq.off1[0] + fx * sq.off1[1], pl.P.z + rz * sq.off1[0] + fz * sq.off1[1]];
    for (const i of sq.list) {
      ships.scX0[i] = sq.scS[0] + rx * ships.lx0[i] + fx * ships.lz0[i]; ships.scZ0[i] = sq.scS[1] + rz * ships.lx0[i] + fz * ships.lz0[i];
      ships.scX3[i] = sq.scS[2] + rx * ships.lx1[i] + fx * ships.lz1[i]; ships.scZ3[i] = sq.scS[3] + rz * ships.lx1[i] + fz * ships.lz1[i];
      ships.snH[i] = pl.H0; ships.snOn[i] = 1;
    }
    sq.mStart = t; sq.mDur = pl.T;   // 高度層跟著一起變
  }
  pl.t0 = t; pl.tau = 0;
}
const _sp = { x: 0, z: 0, h: 0 };
function updateScatter(g) {
  const pl = g.plan, t = U.uTime.value, sg = pl.segs[0], sc = sg.sc, aP = shipGeo.getAttribute('aPath'), A = aP.array;
  const tc = ease((t - pl.t0) / pl.T);
  _sp.h = g.to; bezAt(sc, sg.sx, sg.sz, sg.ex, sg.ez, tc, _sp);
  g.ax = _sp.x; g.az = _sp.z; g.to = g.from = g.to + wrapAngle(_sp.h - g.to); g.dur = 0;
  pl.tau = tc; pl.s = sg.lut[Math.round(tc * (sg.lut.length - 1))];
  for (const sq of g.sqs) {
    _sp.h = sq.h; bezAt(sc, sq.scS[0], sq.scS[1], sq.scS[2], sq.scS[3], tc, _sp);
    sq.x = _sp.x; sq.z = _sp.z; sq.h = _sp.h; sq.y = (g.ay || 0) + (sq.off1[2] || 0); sq.p = 0;
    const e = ease((t - sq.mStart) / sq.mDur); sq.W = lerpNum(sq.W0, sq.W1, e); sq.D = lerpNum(sq.D0, sq.D1, e);
    for (const i of sq.list) {
      _sp.h = ships.snH[i];
      // 每艘船的弧線大小、出發時間都不同 → 陣型散開、各自掉頭
      const h1 = hash01(i), h2 = hash01(i + 7919);
      bezAt(sc, ships.scX0[i], ships.scZ0[i], ships.scX3[i], ships.scZ3[i], ease((t - pl.t0 - (ships.lag[i] + h2 * 2) * SCATTER_LAG) / pl.T), _sp, 0.6 + 0.8 * h1, 0.35 + 1.3 * h2);
      ships.snX[i] = _sp.x; ships.snZ[i] = _sp.z; ships.snH[i] = _sp.h;
      A[i * 4] = _sp.x; A[i * 4 + 1] = _sp.z; A[i * 4 + 2] = _sp.h; A[i * 4 + 3] = 1;
    }
  }
  aP.needsUpdate = true;
}
function endScatter(g, arrived) {
  const pl = g.plan, t = U.uTime.value;
  updateScatter(g);
  const aL = shipGeo.getAttribute('aLocal'), aL2 = shipGeo.getAttribute('aLocal2'), aP = shipGeo.getAttribute('aPath');
  if (arrived) {
    const H = g.to + wrapAngle(pl.H1 - g.to);
    g.ax = pl.P.x; g.az = pl.P.z;
    for (const sq of g.sqs) {
      sq.off0 = sq.off1; sq.oFrom = sq.oTo; sq.mDur = 0; sq.W0 = sq.W1; sq.D0 = sq.D1;
      for (const i of sq.list) { ships.lx0[i] = ships.lx1[i]; ships.ly0[i] = ships.ly1[i]; ships.lz0[i] = ships.lz1[i]; aL.array.set([ships.lx1[i], ships.ly1[i], ships.lz1[i]], i * 3); ships.snOn[i] = 0; aP.array[i * 4 + 3] = 0; }
      sq.tFrom = sq.tTo = H; sq.tDur = 0;
    }
    g.from = g.to = H; g.goal = null;
  } else {
    // 中途改命令：目前位置換成以「目前朝向」為準的陣型座標，再流回同一個陣型
    const H = g.to, d = H - (g.to + wrapAngle(pl.H1 - g.to));
    const fx = Math.sin(H), fz = Math.cos(H), rx = Math.cos(H), rz = -Math.sin(H);
    const toU = (dx, dz) => dx * rx + dz * rz, toV = (dx, dz) => dx * fx + dz * fz;
    for (const sq of g.sqs) {
      const e = ease((t - sq.mStart) / sq.mDur), om = sq.oFrom + (sq.oTo - sq.oFrom) * e;
      const ys = sq.list.map((i) => shipLocalCPU(i, t, [0, 0, 0])[1]);
      sq.off0 = [toU(sq.x - g.ax, sq.z - g.az), toV(sq.x - g.ax, sq.z - g.az), sq.off1[2] || 0]; sq.off1 = [...rotUV(sq.off1[0], sq.off1[1], d), sq.off1[2] || 0];
      sq.list.forEach((i, k) => {
        ships.lx0[i] = toU(ships.snX[i] - sq.x, ships.snZ[i] - sq.z); ships.lz0[i] = toV(ships.snX[i] - sq.x, ships.snZ[i] - sq.z); ships.ly0[i] = ys[k];
        const [x1, z1] = rotUV(ships.lx1[i], ships.lz1[i], d); ships.lx1[i] = x1; ships.lz1[i] = z1;
        aL.array.set([ships.lx0[i], ships.ly0[i], ships.lz0[i]], i * 3); aL2.array.set([ships.lx1[i], ships.ly1[i], ships.lz1[i]], i * 3);
        ships.snOn[i] = 0; aP.array[i * 4 + 3] = 0;
      });
      measureFrom(sq); measureSquadron(sq);
      sq.mStart = t; sq.mDur = 4; sq.oFrom = om;
      const c = sq.h, dd = wrapAngle(H - c); sq.tFrom = c; sq.tTo = c + dd; sq.tStart = t; sq.tDur = Math.abs(dd) > 0.01 ? 2.5 : 0;
    }
    g.from = g.to = H;
  }
  g.dur = 0; g.lastV = 0; g.plan = null;
  aL.needsUpdate = true; aL2.needsUpdate = true; aP.needsUpdate = true;
  if (g.afterSnake) { const f = g.afterSnake; g.afterSnake = null; f(); }
}
function endManeuver(g, arrived) {
  if (!g.plan) return;
  if (g.plan.kind === 'snake') endSnake(g, arrived); else if (g.plan.kind === 'scatter') endScatter(g, arrived);
}
function maneuvering(g) { return !!g.plan && (g.plan.kind === 'snake' || g.plan.kind === 'scatter'); }

// 下令：width 有值＝畫陣線（同時重排成該寬度的橫陣；蛇行時等出彎後再展開）
function startPlan(g, plan, width) {
  endManeuver(g, false);
  const keepV = g.plan ? g.plan.v : (g.lastV || 0); g.lastV = 0;
  if (plan.kind === 'translate') turnGroupTo(g, plan.H1);
  else if (plan.kind === 'pivot') { reframeGroup(g, plan.H1); if (width == null) issueFormation(g, g.formation, g.orderly); }   // 重排也算變陣：被干擾時一樣要等
  if (plan.segs.length) {
    g.plan = { segs: plan.segs, i: 0, s: 0, v: keepV, kind: plan.kind, sn: plan.sn, H1: plan.H1, P: plan.P };
    g.goal = { x: plan.P.x, z: plan.P.z, H: plan.H1 };
    if (plan.kind === 'snake') startSnake(g, g.plan);
  } else { g.plan = null; g.goal = null; }
  if (plan.kind === 'scatter') {   // 先排好新陣型（不能在 g.plan 設好之後，否則會被延後）
    const pl = g.plan; g.plan = null; startScatter(g, Object.assign(pl, { T: plan.T, H0: plan.H0 }), width); g.plan = pl;
    return;
  }
  if (width != null) { g.width = width; issueFormation(g, 'line', g.orderly, { width }); }
}
function moveGroup(g, x, z, H, opt = {}) {
  if (!g) return;
  endManeuver(g, false);   // 先把迴轉中的位置換回陣型座標，再從目前位置規劃
  if (opt.y != null && !opts.flat) g.ayT = Math.max(-ALT_MAX, Math.min(ALT_MAX, opt.y));   // 3D：目的地高度（一般難度不能升降）
  if (opt.P != null && !opts.flat) g.pCmd = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, opt.P));   // 到達後的俯仰角
  g.avx = g.avz = 0;
  startPlan(g, planMove(g, { x, z }, H, !!opt.pivot, groupExtents(g), opt.uturn), opt.width);
}
function faceGroup(g, H) { if (g) moveGroup(g, g.ax, g.az, H); }
// 瞬間移到 (x, z)、朝向 H（只用在還沒進場的增援：場外隱藏時換位置）
function warpGroup(g, x, z, H) {
  g.ax = x; g.az = z; g.from = g.to = H; g.start = 0; g.dur = 0; g.plan = null; g.goal = null; g.avx = g.avz = 0;
  for (const sq of g.sqs) { sq.h = sq.tFrom = sq.tTo = H; sq.tStart = 0; sq.tDur = 0; }
}
// 不含換陣、地形的基本速度（換陣時間的上限用）
function groupBaseSpeed(g) {
  let ts = 2, fs = 9;
  for (const q of g.sqs) { if (q.alive <= 0) continue; for (let k = 0; k < NT; k++) if (q.typeAlive[k] > 0 && SHIP_TYPES[k].speed < ts) ts = SHIP_TYPES[k].speed; fs = Math.min(fs, fleetMods(q.fleet).speed); }
  if (ts > 1.9) ts = 1;
  return BASE_SPEED * ts * Math.min(fs, 2) * (FORMATIONS[g.formation].speed || 1);
}
// 部隊速度＝最慢艦種 × 指揮官機動加成 × 陣型 × 換陣中 × 地形
function groupSpeed(g, t) {
  let ts = 2, fs = 9, morph = false;
  for (const q of g.sqs) {
    if (q.alive <= 0) continue;
    for (let k = 0; k < NT; k++) if (q.typeAlive[k] > 0 && SHIP_TYPES[k].speed < ts) ts = SHIP_TYPES[k].speed;
    fs = Math.min(fs, fleetMods(q.fleet).speed);
    if (!morph && sqMorphing(q, t)) morph = true;
  }
  if (ts > 1.9) ts = 1;
  return BASE_SPEED * ts * Math.min(fs, 2) * (FORMATIONS[g.formation].speed || 1) * (morph ? 0.75 : 1) * (inTerrain('asteroid', g.ax, g.az, g.ay || 0) ? 0.5 : 1);
}
// 突進：只有往前走時加速
function groupFwd(g) { let f = 9; for (const q of g.sqs) if (q.alive > 0) f = Math.min(f, fleetMods(q.fleet).fwd); return f > 8 ? 1 : f; }
function planRemain(pl) { let r = 0; for (let k = pl.i; k < pl.segs.length; k++) r += pl.segs[k].len; return r - pl.s; }
function applySeg(g, sg, s) {
  const k = sg.len > 0 ? s / sg.len : 1; g.ax = sg.sx + (sg.ex - sg.sx) * k; g.az = sg.sz + (sg.ez - sg.sz) * k;
}
function updateGroups(dt) {
  const t = U.uTime.value;
  for (const g of groups) {
    if (g.inactive) continue;
    const pl = g.plan;
    if (pl && pl.kind === 'scatter') {
      if (t >= pl.t0 + pl.T + SCATTER_LAG * 4.3) endScatter(g, true);
    } else if (pl) {
      const sg = pl.segs[pl.i], snake = pl.kind === 'snake';
      let mul = snake ? 1.8 * groupFwd(g) : sg.type === 'L' ? lineMul(sg, groupHeading(g, t)) : 1;
      if (!snake && sg.type === 'L' && mul >= 0.9) mul *= groupFwd(g);
      const vt = Math.min(groupSpeed(g, t) * mul, Math.sqrt(2 * MOVE_ACC * planRemain(pl)) + 0.3);
      pl.v += Math.max(-MOVE_ACC * 1.5 * dt, Math.min(MOVE_ACC * dt, vt - pl.v));
      let step = Math.max(0, pl.v) * dt;
      while (step > 0 && pl.i < pl.segs.length) {
        const cur = pl.segs[pl.i], left = cur.len - pl.s;
        if (step < left) { pl.s += step; step = 0; }
        else { step -= left; pl.i++; pl.s = 0; }
      }
      if (snake) {
        pl.S = pl.i < pl.segs.length ? pl.cum[pl.i] + pl.s : pl.total;
        if (pl.i >= pl.segs.length) endSnake(g, true);
      } else if (pl.i >= pl.segs.length) { const last = pl.segs[pl.segs.length - 1]; g.ax = last.ex + (g.avx || 0); g.az = last.ez + (g.avz || 0); g.plan = null; g.goal = null; }
      else { applySeg(g, pl.segs[pl.i], pl.s); avoidRocks(g, dt); }
    } else if (opts.advance) {
      const step = groupSpeed(g, t) * dt;
      let best = 1e9;
      for (const o of groups) if (o.side !== g.side) best = Math.min(best, Math.hypot(o.ax - g.ax, o.az - g.az));
      if (best > 280) { const H = groupHeading(g, t); g.ax += Math.sin(H) * step * 0.7; g.az += Math.cos(H) * step * 0.7; }
    }
    if (g.target && g.target.alive <= 0) g.target = null;
    altitudeStep(g, dt, t);
  }
}
// ───── 3D：高度與俯仰 ─────
const ALT_MAX = 400, PITCH_MAX = 1.1;   // 高度範圍 ±400；俯仰最多約 ±63°
// 高度：往目標高度移動（有水平移動時，配合水平剩下的時間一起到）；姿態：爬升／俯衝時陣型跟著抬頭／低頭，平飛時回到指令的俯仰角
function altitudeStep(g, dt, t) {
  if (g.inactive) return;
  if (g.ayT == null) g.ayT = g.ay || 0;
  const pl = g.plan, dy = g.ayT - (g.ay || 0), v = groupSpeed(g, t);
  let vy = 0;
  if (Math.abs(dy) > 0.02) {
    let vmax = v * 0.8;
    if (pl && pl.segs && pl.kind !== 'scatter' && pl.segs.length) { const tH = planRemain(pl) / Math.max(2, pl.v || v); vmax = Math.min(vmax, Math.abs(dy) / Math.max(0.5, tH) + 0.5); }
    const step = Math.min(Math.abs(dy), vmax * dt); g.ay = (g.ay || 0) + Math.sign(dy) * step; vy = Math.sign(dy) * step / dt;
  }
  const vh = pl && pl.kind !== 'scatter' ? Math.max(0, pl.v || 0) : 0, man = maneuvering(g);
  const want = man ? 0 : Math.abs(vy) > 0.3 && vh > 0.8 ? Math.max(-0.55, Math.min(0.55, Math.atan2(vy, vh))) : (g.pCmd || 0);
  // 轉動速度：散得越開越慢（外圍線速度不超過部隊速度的 5 倍）
  let rMax = 40; for (const q of g.sqs) if (q.alive > 0) rMax = Math.max(rMax, Math.hypot(q.off1[0], q.off1[1]) + Math.max(q.W1 || 0, q.D1 || 0) / 2);
  const rate = Math.min(0.3, v * 5 / rMax), d = want - (g.p || 0);
  g.p = (g.p || 0) + Math.max(-rate * dt, Math.min(rate * dt, d));
}
// 繞開實體障礙：部隊中心太靠近時往外偏（水平），船艦本身再由 rockPush 推到障礙表面
function avoidRocks(g, dt) {
  if (!ROCKS.length) return;
  const bx = g.ax, bz = g.az;
  let ox = 0, oz = 0, ext = 0;
  for (const q of g.sqs) if (q.alive > 0) ext = Math.max(ext, Math.min(q.W1 || 0, q.D1 || 0));
  for (const r of ROCKS) {
    const req = r.r + ext * 0.3 + 20, dx = bx - r.x, dy = (g.ay || 0) - r.y, dz = bz - r.z, dh = Math.hypot(dx, dz);
    if (Math.abs(dy) > req || dh >= req) continue;
    const need = Math.sqrt(Math.max(0, req * req - dy * dy)) - dh;   // 在這個高度要離中心多遠
    if (need <= 0) continue;
    let nx = dx, nz = dz; if (dh < 1e-3) { const H = groupHeading(g, U.uTime.value); nx = Math.cos(H); nz = -Math.sin(H); } else { nx /= dh; nz /= dh; }
    ox += nx * need; oz += nz * need;
  }
  const k = Math.min(1, dt * 1.5);
  g.avx = (g.avx || 0) + (ox - (g.avx || 0)) * k; g.avz = (g.avz || 0) + (oz - (g.avz || 0)) * k;
  g.ax = bx + g.avx; g.az = bz + g.avz;
}
// 路徑取樣（給預覽與目的地標記）：從第 i0 段的 s0 處開始
function planPoints(segs, i0 = 0, s0 = 0, start) {
  const pts = start ? [start] : [], p = { x: 0, z: 0, h: 0 };
  for (let k = i0; k < segs.length; k++) {
    const sg = segs[k], s = k === i0 ? s0 : 0;
    if (!pts.length || k === i0) { segPoint(sg, s, p); pts.push([p.x, p.z]); }
    if (sg.type === 'L') { pts.push([sg.ex, sg.ez]); continue; }
    const n = Math.max(2, Math.ceil((sg.len - s) / sg.R / 0.12));
    for (let j = 1; j <= n; j++) { segPoint(sg, s + (sg.len - s) * j / n, p); pts.push([p.x, p.z]); }
  }
  return pts;
}
// 部隊的外框尺寸（陣型座標）：給預覽與目的地標記用
function groupExtents(g) {
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const q of g.sqs) {
    const o = q.snSave ? q.snSave.off1 : q.off1, W = q.snSave ? q.snSave.W1 : q.W1, D = q.snSave ? q.snSave.D1 : q.D1;
    u0 = Math.min(u0, o[0] - W / 2); u1 = Math.max(u1, o[0] + W / 2); v0 = Math.min(v0, o[1] - D / 2); v1 = Math.max(v1, o[1] + D / 2);
  }
  return { W: u1 - u0, D: v1 - v0, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2 };
}

function pushSquadronUniforms() {
  const t = U.uTime.value;
  for (const g of groups) {
    if (g.plan && g.plan.kind === 'snake') { updateSnake(g); continue; }
    if (g.plan && g.plan.kind === 'scatter') { updateScatter(g); continue; }
    const H = groupHeading(g, t), P = g.p || 0, cp = Math.cos(P), sp = Math.sin(P);
    const fx = Math.sin(H) * cp, fy = sp, fz = Math.cos(H) * cp, rx = Math.cos(H), rz = -Math.sin(H), ux = -Math.sin(H) * sp, uy = cp, uz = -Math.cos(H) * sp;
    for (const sq of g.sqs) {
      const e = sq.mDur > 0 ? ease((t - sq.mStart) / sq.mDur) : 1;
      const u = sq.off0[0] + (sq.off1[0] - sq.off0[0]) * e, v = sq.off0[1] + (sq.off1[1] - sq.off0[1]) * e, w = (sq.off0[2] || 0) + ((sq.off1[2] || 0) - (sq.off0[2] || 0)) * e;
      // sq.h＝陣型座標的朝向（決定位置）；船身朝向另外用 tFrom/tTo 補間；w＝分艦隊在陣型平面上下的偏移
      sq.x = g.ax + rx * u + fx * v + ux * w; sq.y = (g.ay || 0) + fy * v + uy * w; sq.z = g.az + rz * u + fz * v + uz * w; sq.h = H; sq.p = P;
      sq.W = lerpNum(sq.W0, sq.W1, e); sq.D = lerpNum(sq.D0, sq.D1, e);
    }
  }
  squadrons.forEach((sq, i) => {
    if (sq.bg) { sq.W = sq.W1; sq.D = sq.D1; }
    U.uSq.value[i].set(sq.x, sq.z, sq.h, (sq.hidden || (sq.bg && !opts.background) || fowHidden(sq)) ? 0 : 1);   // 戰爭迷霧：看不到的敵軍不畫
    if (sq.group) U.uSqT.value[i].set(sq.tFrom, sq.tTo, sq.tStart, sq.tDur); else U.uSqT.value[i].set(sq.h, sq.h, 0, 0);
    U.uSqM.value[i].set(sq.mStart, sq.mDur, sq.oFrom || 0, sq.oTo || 0);
    U.uSqP.value[i].set(sq.y || 0, sq.p || 0, 0, 0);
    if (sq.outline) { sq.outline.position.set(sq.x, sq.y || 0, sq.z); sq.outline.rotation.set(-(sq.p || 0), sq.h, 0, 'YXZ'); sq.outline.scale.set(sq.W, 1, sq.D); }
  });
}
let refreshFormationUI = null;

const _L = [0, 0, 0];
function shipLocalCPU(i, t, out = _L) {
  const sq = squadrons[ships.sq[i]];
  let e = 1;
  if (sq.mDur > 0) { e = (t - sq.mStart - ships.lag[i] * 0.9) / sq.mDur; e = Math.min(1, Math.max(0, e)); e = e * e * (3 - 2 * e); }
  out[0] = ships.lx0[i] + (ships.lx1[i] - ships.lx0[i]) * e;
  out[1] = ships.ly0[i] + (ships.ly1[i] - ships.ly0[i]) * e;
  out[2] = ships.lz0[i] + (ships.lz1[i] - ships.lz0[i]) * e;
  return out;
}
function shipWorldCPU(i, out) {
  const sq = squadrons[ships.sq[i]];
  const L = shipLocalCPU(i, U.uTime.value);
  const h = sq.h, p = sq.p || 0, sh = Math.sin(h), ch = Math.cos(h), sp = Math.sin(p), cp = Math.cos(p);
  const om = sq.mDur > 0 ? sq.oFrom + (sq.oTo - sq.oFrom) * ease((U.uTime.value - sq.mStart) / sq.mDur) : (sq.oTo || 0);
  const ly = L[1] * (simAlt + (1 - simAlt) * om);   // 模擬用的高度（不跟畫面上的漸變走，結果才穩定）
  const y0 = sq.y || 0;
  if (ships.snOn[i]) out.set(ships.snX[i], y0 + ly, ships.snZ[i]);
  // 陣型的前 F＝(sin h·cos p, sin p, cos h·cos p)、右 R＝(cos h, 0, −sin h)、上 U＝(−sin h·sin p, cos p, −cos h·sin p)
  else out.set(sq.x + ch * L[0] - sh * sp * ly + sh * cp * L[2], y0 + cp * ly + sp * L[2], sq.z - sh * L[0] - ch * sp * ly + ch * cp * L[2]);
  if (ROCKS.length) rockPush(out);
  return out;
}
// ───── 實體障礙（小行星）：擋住移動與射擊 ─────
let ROCKS = [];
function setRocks() {
  ROCKS = terrainList().filter((t) => TERRAIN_TYPES[t.type] && TERRAIN_TYPES[t.type].solid).map((t) => ({ x: t.x, y: t.y || 0, z: t.z, r: t.r })).slice(0, 8);
  U.uRockN.value = ROCKS.length; ROCKS.forEach((r, k) => U.uRock.value[k].set(r.x, r.y, r.z, r.r));
}
function rockPush(out) {
  for (const r of ROCKS) {
    const dx = out.x - r.x, dy = out.y - r.y, dz = out.z - r.z, d2 = dx * dx + dy * dy + dz * dz, R = r.r + 1.5;
    if (d2 < R * R) { const d = Math.sqrt(d2) || 0.001; out.x = r.x + dx / d * R; out.y = r.y + dy / d * R; out.z = r.z + dz / d * R; }
  }
}
// 線段 A→B 會不會被障礙擋住；擋住就回傳撞到的位置（0～1）
function rockBlock(ax, ay, az, bx, by, bz) {
  let best = 2;
  for (const r of ROCKS) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, fx = ax - r.x, fy = ay - r.y, fz = az - r.z;
    const a = dx * dx + dy * dy + dz * dz, b = 2 * (fx * dx + fy * dy + fz * dz), c = fx * fx + fy * fy + fz * fz - r.r * r.r;
    const disc = b * b - 4 * a * c; if (disc < 0 || a < 1e-6) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a); if (t > 0.001 && t < 1 && t < best) best = t;
  }
  return best <= 1 ? best : -1;
}

// ───────────────────────── 交火 ─────────────────────────
const pending = []; // 命中事件
function pickTarget(sideAttacker, fromSq) {
  // 打對面同位置附近的分艦隊（對位），有一定機率打鄰近的；戰爭迷霧：只打知道位置的
  const enemies = squadrons.filter((s) => s.side !== sideAttacker && !s.bg && s.alive > 0 && fowKnowsSq(fromSq, s));
  if (!enemies.length) return -1;
  let best = null, bd = 1e9;
  for (const e of enemies) {
    const d = (e.x - fromSq.x) ** 2 + (e.z - fromSq.z) ** 2 + rnd() * 40000;
    if (d < bd) { bd = d; best = e; }
  }
  for (let tries = 0; tries < 6; tries++) {
    const idx = best.list[(rnd() * best.list.length) | 0];
    if (ships.alive[idx]) return idx;
  }
  return -1;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
// 部隊指定了目標就優先打它
function focusTarget(sq) {
  const ft = sideFocus(sq.side);
  if (ft && fowKnowsSq(sq, ft) && rnd() < 0.9) for (let k = 0; k < 6; k++) { const i = ft.list[(rnd() * ft.list.length) | 0]; if (ships.alive[i]) return i; }
  const g = sq.group, T = sq.atk && sq.atk.alive > 0 ? sq.atk : g && g.target && g.target.alive > 0 ? g.target : null;   // 分艦隊自己的目標優先於部隊的
  if (T && fowKnowsSq(sq, T) && rnd() < 0.8) {   // 戰爭迷霧：指定的目標看不到就先打看得到的
    for (let k = 0; k < 6; k++) { const i = T.list[(rnd() * T.list.length) | 0]; if (ships.alive[i]) return i; }
  }
  return pickTarget(sq.side, sq);
}
// ───── 受擊方位：攻擊來自目標船頭前方 ±60°＝正面，船尾 ±60°＝背後，其餘＝側面 ─────
// 以目標艦「當下船頭朝向」判斷，所以迴轉、轉向途中被打，容易吃到側面與背後傷害
const ASPECT_NAME = ['正面', '側面', '背後'];
const dmgStats = [[0, 0, 0], [0, 0, 0]];   // 各陣營被擊沉的方位統計
function shipHeadingNow(i) {
  if (ships.snOn[i]) return ships.snH[i];
  return visHeading(squadrons[ships.sq[i]], U.uTime.value, ships.lag[i]);
}
// 3D：攻擊方向與目標船頭（含陣型俯仰）的夾角；從正上方／正下方打過來也算「側面」（整個陣型平面都露出來）
function hitAspect(target, fromX, fromZ, toX, toZ, fromY = 0, toY = 0) {
  const h = shipHeadingNow(target), p = squadrons[ships.sq[target]].p || 0, dx = fromX - toX, dy = fromY - toY, dz = fromZ - toZ, L = Math.hypot(dx, dy, dz) || 1;
  const c = (Math.sin(h) * Math.cos(p) * dx + Math.sin(p) * dy + Math.cos(h) * Math.cos(p) * dz) / L;
  return c >= 0.5 ? 0 : c <= -0.5 ? 2 : 1;
}
function aspectMul(asp) { return asp === 0 ? 1 : asp === 1 ? opts.flankSide : opts.flankRear; }
// ───── 艦隊加成：指揮官特性＋生效中的技能 ─────
function skillActive(fleet, id) { const s = fleet && fleet.skills[id]; return !!s && U.uTime.value < s.until; }
// m：dmg 傷害、shield 護盾、taken 受傷倍率、speed 速度、fwd 前進加速、mcd 飛彈冷卻、aa 飛彈攔截、repair 維修量、
//    ftrRegen 補充新機、ftrDmg 艦載機傷害、morph 變陣時間、fireCd 光束開火間隔、acc 光束命中率倍率、ffP 打中擋路友艦的機率倍率
//    shield 護盾容量與回充加成、shTaken 護盾受到的傷害倍率
function fleetMods(fleet) {
  const m = { dmg: 1, shield: 0, shTaken: 1, taken: 1, speed: 1, fwd: 1, mcd: 1, aa: 0, repair: 1, ftrRegen: 1, ftrDmg: 1, morph: 1, fireCd: 1, acc: 1, ffP: 1 };
  if (!fleet) return m;
  const c = fleet.commander;
  if (c) {
    const b = c.tal ? 0.08 : traitBonus(c.trait, c.level || 1);   // 玩家：固有特性固定 +8%，其餘靠天賦；敵方：照等級
    if (c.trait === 'dmg') m.dmg += b; else if (c.trait === 'shield') m.shield += b; else if (c.trait === 'speed') m.speed += b;
    const T = c.tal;
    if (T) {
      const r = (id) => T[id] || 0;
      m.dmg += 0.05 * r('gunnery'); m.mcd *= 1 - 0.1 * r('missile'); m.ftrRegen *= 1 + 0.3 * r('hangar'); m.ftrDmg *= 1 + 0.1 * r('hangar');
      m.shield += 0.04 * r('shield'); m.repair *= 1 + 0.2 * r('damage'); m.aa += 0.08 * r('aa'); m.speed += 0.05 * r('engine'); m.morph *= 1 - 0.12 * r('drill');
      m.acc *= 1 + 0.05 * r('aim'); m.ffP *= 1 - 0.15 * r('aim');
    }
  }
  if (skillActive(fleet, 'wall')) { m.shTaken *= 0.6; m.taken *= 0.7; }
  if (skillActive(fleet, 'charge')) m.fwd *= 1.8;
  if (skillActive(fleet, 'rapid')) m.fireCd *= 0.65;
  if (skillActive(fleet, 'evade')) { m.speed *= 1.4; m.taken *= 0.75; }
  return m;
}
// 全軍集中火力：回傳生效中的目標分艦隊
function sideFocus(side) {
  for (const f of fleets) if (f.side === side && skillActive(f, 'focus')) { const tq = f.skills.focus.target; if (tq && tq.alive > 0) return tq; }
  return null;
}
// ───── 地形 ─────
function terrainList() { return (battleSetup && battleSetup.terrain) || []; }
// 3D 地形：有 y 的是球形區域（星雲、小行星帶都有自己的高度）；舊資料沒有 y 就當成上下無限的圓柱
function inTerrain(type, x, z, y = 0) { for (const t of terrainList()) if (t.type === type && (x - t.x) ** 2 + (z - t.z) ** 2 + (t.y != null ? (y - t.y) ** 2 : 0) < t.r * t.r) return true; return false; }

// ───── 光束：距離減傷、射角、命中率 ─────
// 最大射程時的傷害倍率：BEAM_FALLOFF_MIN（data.js）
const beamPow = [0, 0], beamShots = [0, 0], beamLastT = [-99, -99];   // 最近一段時間的平均威力（給 HUD）
const gunStats = [0, 1].map(() => ({ main: [0, 0], sec: [0, 0], aa: [0, 0] }));   // 各類砲 [開火, 命中]
const hitAvg = [0, 0];   // 最近的平均命中率（HUD）
function beamFalloff(d, bm) {
  const k = opts.rangeMul || 1;
  const n = (bm ? bm.near : opts.beamNear) * k, f = Math.max(n + 1, (bm ? bm.far : opts.beamFar) * k);
  if (d <= n) return 1;
  if (d > f) return 0;
  return 1 - (1 - BEAM_FALLOFF_MIN) * (d - n) / (f - n);
}
// 目標在不在這門砲的射角內（以船當下的船頭＋陣型俯仰為準）
function inArc(i, gun, dx, dy, dz, dist) {
  if (gun.arc >= 180) return true;
  const h = shipHeadingNow(i), p = squadrons[ships.sq[i]].p || 0;
  const c = (Math.sin(h) * Math.cos(p) * dx + Math.sin(p) * dy + Math.cos(h) * Math.cos(p) * dz) / (dist || 1);
  return c >= Math.cos(gun.arc * Math.PI / 180);
}
// 命中率
function hitChance(gk, gun, dist, target, attackerSq, ax, ay, az, bx, by, bz) {
  const k = opts.rangeMul || 1, n = gun.near * k, f = Math.max(n + 1, gun.far * k);
  const rf = dist <= n ? 1 : 1 - (1 - HIT_RULE.farMul) * Math.min(1, (dist - n) / (f - n));
  let sf = HIT_RULE.size[ships.type[target]]; if (gk === 'main') sf = Math.pow(sf, HIT_RULE.mainSizePow);
  const tq = squadrons[ships.sq[target]];
  const vf = 1 - HIT_RULE.speedMax * Math.min(1, (tq.vel || 0) / HIT_RULE.speedRef);
  let ef = 1;
  if (inTerrain('nebula', ax, az, ay) || inTerrain('nebula', bx, bz, by)) ef *= HIT_RULE.nebula;
  if (jam[attackerSq.side].until > U.uTime.value) ef *= HIT_RULE.jammed;
  ef *= fleetMods(attackerSq.fleet).acc;   // 天賦：精準射擊
  return Math.min(HIT_RULE.max, Math.max(HIT_RULE.min, gun.acc * rf * sf * vf * ef));
}
const GUN_FX = { main: { inten: 1.0, len: 0.45, fxP: 0.4, spd: 560 }, sec: { inten: 0.75, len: 0.3, fxP: 0.25, spd: 620 }, aa: { inten: 0.45, len: 0.16, fxP: 0.08, spd: 760 } };
// ───── 空中目標（飛彈、艦載機）：每個 tick 建一次格子索引，防空砲／副砲找最近的 ─────
const AIR = { tick: -1, cell: 200, map: [new Map(), new Map()] };   // map[s]＝陣營 s 的飛彈與艦載機
function airKey(x, z) { return Math.floor(x / AIR.cell) * 100003 + Math.floor(z / AIR.cell); }
function airIndex() {
  if (AIR.tick === simTick) return;
  AIR.tick = simTick;
  for (const m of AIR.map) m.clear();
  const t = U.uTime.value;
  const put = (s, r) => { const k = airKey(r.x, r.z), m = AIR.map[s]; let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(r); };
  for (let i = 0; i < MIS_MAX; i++) {
    if (!misLive[i]) continue;
    const u = (t - misT[i * 4]) / misT[i * 4 + 1];
    if (u < 0.05 || u >= 1) continue;   // 剛出膛還沒展開的不打
    bezCPU(i, u, _c);
    put(misSide[i], { a: 0, i, g: misGen[i], x: _c.x, y: _c.y, z: _c.z, v: misSpd[i], vx: 0, vy: 0, vz: 0 });
  }
  for (let j = 0; j < FTR_MAX; j++) {
    if (FT.state[j] !== 2) continue;
    const j3 = j * 3, vx = fV[j3], vy = fV[j3 + 1], vz = fV[j3 + 2];
    put(FT.side[j], { a: 1, i: j, sz: FT.kind[j] === 2 ? FOW_RULE.recon.size : FT.kind[j] ? AIR_RULE.droneSize : CRAFT[FT.role[j]].size, x: fP[j3], y: fP[j3 + 1], z: fP[j3 + 2], v: Math.hypot(vx, vy, vz), vx, vy, vz });
  }
}
// 還能不能再對它開火：每顆飛彈最多被打 missileShots 次；每架艦載機每 fighterGap 秒最多被一門砲瞄準
function airFree(o, t) { return o.a === 0 ? misShot[o.i] < AIR_RULE.missileShots : FT.engT[o.i] <= t; }
// 射程內、射角內最近的敵方空中目標
function nearestAir(enemySide, i, gun, R, x, y, z) {
  airIndex();
  const m = AIR.map[enemySide]; if (!m.size) return null;
  const C = AIR.cell, r = Math.ceil(R / C), cx = Math.floor(x / C), cz = Math.floor(z / C), t = U.uTime.value;
  let best = null, bd = R;
  for (let ax = cx - r; ax <= cx + r; ax++) for (let az = cz - r; az <= cz + r; az++) {
    const arr = m.get(ax * 100003 + az); if (!arr) continue;
    for (const o of arr) { if (!airFree(o, t)) continue; const dx = o.x - x, dy = o.y - y, dz = o.z - z, d = Math.hypot(dx, dy, dz); if (d < bd && inArc(i, gun, dx, dy, dz, d)) { bd = d; best = o; } }
  }
  if (best) best.d = bd;
  return best;
}
// 防空砲的優先順序：射程內先找飛彈，沒有才找艦載機
function nearestAirPri(enemySide, i, gun, R) {
  airIndex();
  const m = AIR.map[enemySide]; if (!m.size) return null;
  const C = AIR.cell, r = Math.ceil(R / C), cx = Math.floor(_a.x / C), cz = Math.floor(_a.z / C), t = U.uTime.value;
  let bm = null, dm = R, bf = null, df = R;
  for (let ax = cx - r; ax <= cx + r; ax++) for (let az = cz - r; az <= cz + r; az++) {
    const arr = m.get(ax * 100003 + az); if (!arr) continue;
    for (const o of arr) {
      if (!airFree(o, t)) continue;
      const dx = o.x - _a.x, dy = o.y - _a.y, dz = o.z - _a.z, d = Math.hypot(dx, dy, dz);
      if (o.a === 0) { if (d < dm) { dm = d; bm = o; } } else if (d < df) { df = d; bf = o; }
    }
  }
  if (bm) { bm.d = dm; return bm; }
  if (bf) bf.d = df;
  return bf;
}
// 對空倍率：陣型（圓陣最好）× 換陣中下降 × 防空網天賦（艦種防空係數在 fireAir 另外乘）
function aaMul(sq) {
  const FM = FORMATIONS[(sq.group && sq.group.formation) || 'line'];
  return (AIR_RULE.formBase + FM.aa) * (sqMorphing(sq) ? 0.6 : 1) * (1 + fleetMods(sq.fleet).aa);
}
const airStats = [0, 1].map(() => ({ shots: 0, hits: 0 }));
const ftrStats = [[0, 0], [0, 0]];   // 艦載機開火／命中
function fireAir(attacker, gk, gun, sq, o, delay) {
  const k = opts.rangeMul || 1, n = gun.near * k, f = Math.max(n + 1, gun.far * k), dist = o.d;
  const rf = dist <= n ? 1 : 1 - (1 - HIT_RULE.farMul) * Math.min(1, (dist - n) / (f - n));
  const sf = o.a ? o.sz : AIR_RULE.missileSize;
  const vf = 1 - HIT_RULE.speedMax * Math.min(1, o.v / HIT_RULE.speedRef);
  let ef = 1;
  if (inTerrain('nebula', _a.x, _a.z, _a.y) || inTerrain('nebula', o.x, o.z, o.y)) ef *= HIT_RULE.nebula;
  if (jam[sq.side].until > U.uTime.value) ef *= HIT_RULE.jammed;
  const raw = gun.acc * rf * sf * vf * ef * aaMul(sq) * SHIP_TYPES[ships.type[attacker]].aa / AA_TYPE_REF;   // 艦種防空係數
  const rc = o.a === 1 && FT.kind[o.i] === 2, RC = FOW_RULE.recon;   // 偵察機：很難打中（命中率再打折、下限更低，被瞄準的間隔更長）
  const p = rc ? Math.min(HIT_RULE.max, Math.max(RC.min, raw * RC.acc)) : Math.min(HIT_RULE.max, Math.max(HIT_RULE.min, raw));
  const hit = rnd() < p;
  if (o.a === 0) misShot[o.i]++; else FT.engT[o.i] = U.uTime.value + (rc ? RC.gap : AIR_RULE.fighterGap);
  const gs = gunStats[sq.side][gk]; gs[0]++; if (hit) gs[1]++;
  const as = airStats[sq.side]; as.shots++; if (hit) as.hits++;
  // 畫面：瞄準提前量；沒中就偏一點
  const lead = dist / 900;
  let tx = o.x + o.vx * lead, ty = o.y + o.vy * lead, tz = o.z + o.vz * lead;
  if (!hit) { tx += (rnd() - 0.5) * 10; ty += (rnd() - 0.5) * 6; tz += (rnd() - 0.5) * 10; }
  const fxs = GUN_FX[gk], t0 = U.uTime.value + delay, dur = Math.hypot(tx - _a.x, ty - _a.y, tz - _a.z) / 900;
  spawnBeam(_a.x, _a.y, _a.z, tx, ty, tz, t0, dur, sq.side, fxs.inten * 0.8, Math.min(0.5, 30 / Math.max(1, dist)));
  if (hit) pending.push({ kind: 'ak', t: t0 + dur, a: o.a, i: o.i, g: o.g, dmg: gun.dmg, side: sq.side });
  return true;
}
// 擬真難度：友軍誤射。射線（射擊艦 → 目標）先穿過友軍分艦隊時，依穿過的位置與密度有機率打中它。
// opts.ff＝2（現行）：擋住的是「別的部隊」→ 照機率誤擊；是「同一個部隊」（同陣型協同射界）→ 多半停火，
//   只剩一點機率仍誤擊，部隊裡最高等級的指揮官越高越低。opts.ff＝true：舊回放的規則（只看艦隊，同艦隊不會）
// 天賦（部隊裡任一指揮官有就算，取最高階）：「完美布陣」同部隊擋住也照樣開火，殘餘誤擊的傷害 −25%／階；
//   「火線管制」殘餘誤擊的機率 −20%／階
// 回傳被誤擊的艦艇；-2＝停火；沒有就 -1。誤擊的傷害倍率放在 ffMul
const FF_RULE = { base: 0.1, dens: 0.45, vTol: 28, resid: 0.25, residLv: 0.02, residMin: 0.05, perfect: 0.25, fireline: 0.2 };
let ffMul = 1;
function ffGroupCmd(g) {
  let lv = 1, pf = 0, fl = 0;
  if (g) for (const q of g.sqs) {
    const c = q.alive > 0 && q.fleet && q.fleet.commander; if (!c) continue;
    lv = Math.max(lv, c.level || 1); pf = Math.max(pf, talentRank(c, 'perfect')); fl = Math.max(fl, talentRank(c, 'fireline'));
  }
  return { resid: Math.max(FF_RULE.residMin, FF_RULE.resid - FF_RULE.residLv * lv) * (1 - FF_RULE.fireline * fl), pf };
}
function ffHit(sq, x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L2 = dx * dx + dz * dz;
  if (L2 < 1) return -1;
  const v2 = opts.ff === 2;
  ffMul = 1;
  let best = null, bt = 0.96, br = 1;
  for (const q of squadrons) {
    if (q.side !== sq.side || q === sq || (!v2 && q.fleet === sq.fleet) || q.bg || q.alive <= 0) continue;
    const t = ((q.x - x0) * dx + (q.z - z0) * dz) / L2;   // 沿射線的位置（0＝射擊艦、1＝目標）
    if (t <= 0.02 || t >= bt || Math.abs(y0 + dy * t - (q.y || 0)) > FF_RULE.vTol) continue;
    const px = x0 + dx * t - q.x, pz = z0 + dz * t - q.z, c = Math.cos(q.h), s = Math.sin(q.h);
    const u = (px * c - pz * s) / (q.W1 / 2 + 4), v = (px * s + pz * c) / (q.D1 / 2 + 4), r = u * u + v * v;   // 在分艦隊的外框（橢圓）內
    if (r < 1) { best = q; bt = t; br = r; }
  }
  if (!best) return -1;
  const p = (FF_RULE.base + FF_RULE.dens * (1 - Math.sqrt(br))) * Math.min(1, best.alive / best.list.length * 1.3)   // 越靠中心、越密越容易打到
    * (v2 ? fleetMods(sq.fleet).ffP : 1);   // 天賦：精準射擊（舊回放不套用）
  if (rnd() >= p) return -1;   // 射線從空隙穿過
  if (v2 && best.group && best.group === sq.group) {   // 同部隊：射界被擋就停火；完美布陣照樣開火
    const G = ffGroupCmd(sq.group);
    if (rnd() >= G.resid) return G.pf ? -1 : -2;
    ffMul = 1 - FF_RULE.perfect * G.pf;
  }
  for (let k = 0; k < 8; k++) { const i = best.list[Math.floor(rnd() * best.list.length)]; if (ships.alive[i]) return i; }
  return -1;
}
// 一門砲開火：選目標（射角、射程內）、擲命中、排進待結算；回傳是否有開火
// 主砲：只打戰艦。副砲：全威力距離內有飛彈／艦載機先打，否則打戰艦，沒戰艦可打再打較遠的空中目標。
// 防空：優先鎖定飛彈，其次艦載機（都取最近的），射程內都沒有才打戰艦
function fireGun(attacker, gk, delay = 0, dmgMul = 1, volleyShot = false) {
  const st = SHIP_TYPES[ships.type[attacker]], gun = st.guns[gk]; if (!gun) return false;
  const sq = squadrons[ships.sq[attacker]];
  shipWorldCPU(attacker, _a);
  const k = opts.rangeMul || 1, far = gun.far * k;
  if (gk !== 'main' && !volleyShot) {
    const o = gk === 'aa' ? nearestAirPri(1 - sq.side, attacker, gun, far) : nearestAir(1 - sq.side, attacker, gun, gun.near * k, _a.x, _a.y, _a.z);
    if (o) return fireAir(attacker, gk, gun, sq, o, delay);
  }
  // 區域攻擊（主／副砲）：那一點在射程、射角內就打那裡；範圍內有敵艦＝打它（看不到＝盲射），沒有＝光束打進空處
  let target = -1, dist = 0, accM = 1;
  const ar = gk !== 'aa' ? sqArea(sq) : null;
  if (ar) {
    const dx = ar.x - _a.x, dy = ar.y - _a.y, dz = ar.z - _a.z, d = Math.hypot(dx, dy, dz);
    if (d <= far && inArc(attacker, gun, dx, dy, dz, d)) {
      const c = areaShip(sq.side, ar);
      if (c >= 0) { target = c; shipWorldCPU(c, _b); dist = Math.max(1, _a.distanceTo(_b)); if (!fowKnowsSq(sq, squadrons[ships.sq[c]])) accM = FOW_RULE.area.blind; }
      else {
        const r = FOW_RULE.area.r; _b.set(ar.x + (rnd() - 0.5) * r * 1.4, ar.y + (rnd() - 0.5) * r * 0.4, ar.z + (rnd() - 0.5) * r * 1.4);
        const fxs = GUN_FX[gk], L = _a.distanceTo(_b), t0 = U.uTime.value + delay, blk = ROCKS.length ? rockBlock(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z) : -1;
        if (blk >= 0) _b.set(_a.x + (_b.x - _a.x) * blk, _a.y + (_b.y - _a.y) * blk, _a.z + (_b.z - _a.z) * blk);
        spawnBeam(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, t0, _a.distanceTo(_b) / (fxs.spd + rnd() * 120), sq.side, (volleyShot ? 0.6 : 1) * fxs.inten * (0.4 + 0.6 * beamFalloff(L, gun)), Math.min(fxs.len, 60 / L));
        gunStats[sq.side][gk][0]++; beamLastT[sq.side] = U.uTime.value;
        return true;
      }
    }
  }
  // 候選：主／副砲先看部隊指定的目標，不行再找最近的；防空只找最近的
  for (let tries = 0; target < 0 && tries < (gk === 'aa' ? 2 : 3); tries++) {
    const c = gk === 'aa' || tries > 0 ? pickTarget(sq.side, sq) : focusTarget(sq);
    if (c < 0) break;
    shipWorldCPU(c, _b);
    const dx = _b.x - _a.x, dy = _b.y - _a.y, dz = _b.z - _a.z, d = Math.hypot(dx, dy, dz);
    if (d <= far && inArc(attacker, gun, dx, dy, dz, d)) { target = c; dist = d; break; }
  }
  if (target < 0) {
    if (gk === 'sec' && !volleyShot) { const o = nearestAir(1 - sq.side, attacker, gun, far, _a.x, _a.y, _a.z); if (o) { shipWorldCPU(attacker, _a); return fireAir(attacker, gk, gun, sq, o, delay); } }
    return false;
  }
  let ff = false;   // 擬真難度：射線上有友軍分艦隊 → 可能誤擊或停火
  if (opts.ff) {
    const o = ffHit(sq, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
    if (o === -2) { ffHold[sq.side]++; return false; }   // 同部隊擋住射界：這次不開火
    if (o >= 0) { target = o; ff = true; shipWorldCPU(o, _b); dist = Math.max(1, _a.distanceTo(_b)); }
  }
  const fm = beamFalloff(dist, gun);
  const tq = squadrons[ships.sq[target]];
  // 被巨大小行星擋住：光束打在岩石上（沒有傷害）
  const blk = ROCKS.length ? rockBlock(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z) : -1;
  const p = hitChance(gk, gun, dist, target, sq, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z) * accM;
  const hit = blk < 0 && (ff || rnd() < p);
  if (!ff) fowExpose(sq, target);   // 戰爭迷霧：被打的艦隊看得到開火的人幾秒
  const gs = gunStats[sq.side][gk]; gs[0]++; if (hit) gs[1]++;
  hitAvg[sq.side] += ((hit ? 1 : 0) - hitAvg[sq.side]) * 0.01;
  beamPow[sq.side] += (fm - beamPow[sq.side]) * (beamShots[sq.side] ? 0.01 : 1); beamShots[sq.side]++; beamLastT[sq.side] = U.uTime.value;
  const fxs = GUN_FX[gk];
  // 落點：命中＝船身附近；沒中＝從旁邊擦過、往後延伸
  if (hit) { _b.x += (rnd() - 0.5) * 2; _b.z += (rnd() - 0.5) * 2; _b.y += (rnd() - 0.5) * 1.5; }
  else if (blk >= 0) _b.set(_a.x + (_b.x - _a.x) * blk, _a.y + (_b.y - _a.y) * blk, _a.z + (_b.z - _a.z) * blk);
  else {
    const off = TYPE_W[ships.type[target]] * (0.8 + rnd() * 1.6) * (rnd() < 0.5 ? -1 : 1), ext = 1.15 + rnd() * 0.25;
    const ux = (_b.x - _a.x) / dist, uz = (_b.z - _a.z) / dist;
    _b.set(_a.x + (_b.x - _a.x) * ext - uz * off, _a.y + (_b.y - _a.y) * ext + (rnd() - 0.5) * 4, _a.z + (_b.z - _a.z) * ext + ux * off);
  }
  const inten = (volleyShot ? 0.6 : 1) * fxs.inten * (0.4 + 0.6 * fm);   // 遠距離的光束比較暗
  const L = _a.distanceTo(_b), dur = L / (fxs.spd + rnd() * 120);
  const t0 = U.uTime.value + delay;
  spawnBeam(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, t0, dur, sq.side, inten, Math.min(fxs.len, 60 / L));
  if (blk >= 0) { if (rnd() < 0.25) pending.push({ kind: 'sp', t: t0 + dur * blk, side: sq.side, x: _b.x, y: _b.y, z: _b.z }); return true; }
  if (!hit) return true;
  const asp = hitAspect(target, _a.x, _a.z, _b.x, _b.z, _a.y, _b.y);
  let dmg = gun.dmg * dmgMul * fm * fleetMods(sq.fleet).dmg;
  if (sideFocus(sq.side) === tq) dmg *= 1.2;
  if (ff) dmg *= ffMul;
  pending.push({ t: t0 + dur, target, side: sq.side, ff, dirIdx: dirIndexOf(_b.x - _a.x, _b.z - _a.z), asp, fm, dmg, hm: hitMul(asp, sq, tq), fx: rnd() < fxs.fxP * (0.3 + 0.7 * fm) * (volleyShot ? 0.4 : 1), x: _b.x, y: _b.y, z: _b.z });
  return true;
}
// 齊射：分艦隊每 VOLLEY_CD 秒只能齊射一次；只有裝填過半（剩餘冷卻 ≤ VOLLEY_READY×冷卻）的砲會跟著開火
const VOLLEY_CD = 20, VOLLEY_READY = 0.5;
function volley(side, set) {
  // 從旗艦附近開始，像波浪一樣向兩翼擴散的齊射
  const t = U.uTime.value;
  const sqs = squadrons.filter((s) => s.side === side && !s.bg && (!set || set.has(s)));
  const ready = new Set(sqs.filter((q) => q.alive > 0 && t - (q.volleyT ?? -1e9) >= VOLLEY_CD));
  if (!ready.size) return;
  const alive = [];
  for (let i = 0; i < shipCount; i++) if (ships.alive[i] && ready.has(squadrons[ships.sq[i]])) alive.push(i);
  if (!alive.length) return;
  for (const q of ready) q.volleyT = t;
  const cx = sqs.reduce((s, q) => s + q.x, 0) / sqs.length, cz = sqs.reduce((s, q) => s + q.z, 0) / sqs.length;
  for (const i of alive) {
    shipWorldCPU(i, _a);
    const d = Math.hypot(_a.x - cx, _a.z - cz), delay = d / 900 + rnd() * 0.12, G = SHIP_TYPES[ships.type[i]].guns;
    // 齊射＝把裝填好的砲同步開火（不多算傷害），開火的砲重新冷卻
    if (G.main && ships.cd[i] <= G.main.cd * VOLLEY_READY && fireGun(i, 'main', delay, 1, true)) ships.cd[i] = G.main.cd * (0.9 + rnd() * 0.2);
    if (G.sec && ships.cd1[i] <= G.sec.cd * VOLLEY_READY && fireGun(i, 'sec', delay + 0.05, 1, true)) ships.cd1[i] = G.sec.cd * (0.9 + rnd() * 0.2);
  }
  flash(side);
}
function flash(side) {
  const el = document.getElementById('flash');
  el.style.background = side === 0 ? 'radial-gradient(ellipse at 70% 30%, rgba(255,170,80,.16), transparent 60%)' : 'radial-gradient(ellipse at 30% 70%, rgba(110,190,255,.16), transparent 60%)';
  el.style.opacity = 1; setTimeout(() => (el.style.opacity = 0), 160);
}

// ───────────────────────── 共用：光束、擊沉 ─────────────────────────
function spawnBeam(ax, ay, az, bx, by, bz, t0, dur, side, inten, len) {
  const i = beamHead; beamHead = (beamHead + 1) % BEAM_MAX;
  beamA[i * 3] = ax; beamA[i * 3 + 1] = ay; beamA[i * 3 + 2] = az;
  beamB[i * 3] = bx; beamB[i * 3 + 1] = by; beamB[i * 3 + 2] = bz;
  beamT[i * 4] = t0; beamT[i * 4 + 1] = dur; beamT[i * 4 + 2] = SIDE_FAC[side] + inten; beamT[i * 4 + 3] = len;
  markDirty('beam', i);
}
function dirIndexOf(dx, dz) { return ((Math.round(-Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8; }
let stateDirty = false;
function killShip(i, t, x, y, z, mul = 1) {
  if (!ships.alive[i]) return;
  ships.alive[i] = 0;
  shipGeo.getAttribute('aState').array[i * 2] = t;
  stateDirty = true;
  const q = squadrons[ships.sq[i]];
  q.alive--; q.typeAlive[ships.type[i]]--;
  if (i === q.flagship) q.flagLost = true;
  const sc = TYPE_W[ships.type[i]] * 1.6 * (ships.type[i] <= 1 ? 1.4 : 1) * mul;
  spawnFx(x, y, z, ships.side[i], sc, 18 + rnd() * 6);
}

// ───────────────────────── 飛彈 ─────────────────────────
// 二次貝茲曲線軌跡，GPU 算位置；尾焰是一條沿曲線的帶子
const MIS_MAX = 8000;
const misA = new Float32Array(MIS_MAX * 3), misB = new Float32Array(MIS_MAX * 3), misC = new Float32Array(MIS_MAX * 3), misT = new Float32Array(MIS_MAX * 4);
for (let i = 0; i < MIS_MAX; i++) { misT[i * 4] = -999; misT[i * 4 + 1] = 1; misT[i * 4 + 3] = 1; }
const misAttrs = {
  aM0: new THREE.InstancedBufferAttribute(misA, 3).setUsage(THREE.DynamicDrawUsage),
  aM1: new THREE.InstancedBufferAttribute(misB, 3).setUsage(THREE.DynamicDrawUsage),
  aM2: new THREE.InstancedBufferAttribute(misC, 3).setUsage(THREE.DynamicDrawUsage),
  aMT: new THREE.InstancedBufferAttribute(misT, 4).setUsage(THREE.DynamicDrawUsage),
};
function instGeo(base, attrs, count) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes.position = base.attributes.position;
  for (const k in attrs) g.setAttribute(k, attrs[k]);
  g.instanceCount = count;
  return g;
}
const misTrailGeo = instGeo(new THREE.PlaneGeometry(1, 1, 14, 1), misAttrs, MIS_MAX);
const misHeadGeo = instGeo(new THREE.PlaneGeometry(1, 1), misAttrs, MIS_MAX);
const MIS_GLSL = /* glsl */`
  uniform float uTime; uniform vec2 uRes;
  attribute vec3 aM0; attribute vec3 aM1; attribute vec3 aM2; attribute vec4 aMT;
  vec3 bez(float u){ float a = 1. - u; return a * a * aM0 + 2. * a * u * aM1 + u * u * aM2; }
`;
const MIS_COL = [new THREE.Color(1.0, 0.42, 0.14), new THREE.Color(0.55, 0.85, 1.0)];
const misTrailMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uRes: U.uRes, uColA: { value: MIS_COL[0] }, uColB: { value: MIS_COL[1] } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: MIS_GLSL + /* glsl */`
    varying float vS; varying float vY; varying float vI; varying float vFac;
    void main(){
      float p = (uTime - aMT.x) / aMT.y, cut = aMT.w, fadeT = 0.7 / aMT.y;
      if (p < 0. || p > cut + fadeT) { gl_Position = vec4(2.,2.,2.,1.); return; }
      float s = position.x + 0.5;
      float head = min(p, cut);
      float k = clamp((p - cut) / fadeT, 0., 1.);
      float tail = max(0., head - 0.16 * (1. - k));
      float u = mix(tail, head, s);
      vec4 c = projectionMatrix * viewMatrix * vec4(bez(u), 1.);
      vec4 c2 = projectionMatrix * viewMatrix * vec4(bez(min(1., u + 0.01)), 1.);
      vec2 sp = c.xy / c.w * uRes * 0.5, sp2 = c2.xy / c2.w * uRes * 0.5;
      vec2 d = sp2 - sp; float L = length(d);
      vec2 dn = L > 1e-4 ? d / L : vec2(1., 0.);
      float ppu = projectionMatrix[1][1] * 0.5 * uRes.y / c.w;
      float w = clamp(0.35 * ppu, 1.0, 3.5) * mix(0.25, 1.0, s) * 2.6;
      sp += vec2(-dn.y, dn.x) * position.y * w;
      c.xy = sp / (uRes * 0.5) * c.w;
      gl_Position = c;
      vS = s; vY = position.y * 2.; vI = 1. - k; vFac = floor(aMT.z);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColA; uniform vec3 uColB;
    varying float vS; varying float vY; varying float vI; varying float vFac;
    void main(){
      float y = abs(vY);
      float glow = exp(-y * y * 6.), core = exp(-y * y * 50.);
      vec3 c = vFac < 0.5 ? uColA : uColB;
      gl_FragColor = vec4((c * glow * 0.55 + vec3(1.) * core * 0.45 * vS) * pow(vS, 1.8) * vI, 1.);
    }`,
});
const misHeadMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uRes: U.uRes, uColA: { value: MIS_COL[0] }, uColB: { value: MIS_COL[1] } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: MIS_GLSL + /* glsl */`
    varying vec2 vUv; varying float vFac; varying float vI;
    void main(){
      float p = (uTime - aMT.x) / aMT.y;
      if (p < 0. || p > aMT.w) { gl_Position = vec4(2.,2.,2.,1.); return; }
      vec4 c = projectionMatrix * viewMatrix * vec4(bez(p), 1.);
      float ppu = projectionMatrix[1][1] * 0.5 * uRes.y / c.w;
      float sz = max(1.1 * ppu, 4.0);
      c.xy += position.xy * sz * 2. / uRes * c.w;
      c.z -= 0.001 * c.w;
      gl_Position = c;
      vUv = position.xy * 2.; vFac = floor(aMT.z);
      vI = 0.8 + 0.2 * sin(uTime * 40. + aMT.x * 97.);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColA; uniform vec3 uColB;
    varying vec2 vUv; varying float vFac; varying float vI;
    void main(){
      float d = length(vUv);
      vec3 c = vFac < 0.5 ? uColA : uColB;
      gl_FragColor = vec4((c * exp(-d * d * 6.) * 0.7 + vec3(1.) * exp(-d * d * 30.) * 0.9) * vI, 1.);
    }`,
});
const misTrailMesh = new THREE.Mesh(misTrailGeo, misTrailMat); misTrailMesh.frustumCulled = false; misTrailMesh.renderOrder = 3;
const misHeadMesh = new THREE.Mesh(misHeadGeo, misHeadMat); misHeadMesh.frustumCulled = false; misHeadMesh.renderOrder = 3;
scene.add(misTrailMesh, misHeadMesh);
let misHead = 0, misDirtyFrom = -1, misDirtyCount = 0;

function bezCPU(i, u, out) {
  const a = 1 - u, k0 = a * a, k1 = 2 * a * u, k2 = u * u;
  out.set(misA[i * 3] * k0 + misB[i * 3] * k1 + misC[i * 3] * k2,
    misA[i * 3 + 1] * k0 + misB[i * 3 + 1] * k1 + misC[i * 3 + 1] * k2,
    misA[i * 3 + 2] * k0 + misB[i * 3 + 2] * k1 + misC[i * 3 + 2] * k2);
  return out;
}
const _c = new THREE.Vector3(), _d = new THREE.Vector3();
// 飛彈、艦載機打船的命中率：基本 × 目標大小^sizePow × 目標速度 × 星雲 × 被干擾
function strikeChance(rule, target, side, pos) {
  const tq = squadrons[ships.sq[target]];
  let p = rule.acc * Math.pow(HIT_RULE.size[ships.type[target]], rule.sizePow) * (1 - rule.speedMax * Math.min(1, (tq.vel || 0) / HIT_RULE.speedRef));
  if (inTerrain('nebula', pos.x, pos.z, pos.y)) p *= rule.nebula;
  if (jam[side].until > U.uTime.value) p *= HIT_RULE.jammed;
  return Math.min(HIT_RULE.max, Math.max(HIT_RULE.min, p));
}
// 飛行中的飛彈：live＝還在飛（沒被打下、還沒命中）；gen＝環狀緩衝重複使用時分辨是不是同一顆
const misShot = new Uint8Array(MIS_MAX), misLive = new Uint8Array(MIS_MAX), misGen = new Uint32Array(MIS_MAX), misSide = new Uint8Array(MIS_MAX), misSpd = new Float32Array(MIS_MAX);
let misCut = false;   // 有飛彈被打下：整段時間資料要重新上傳
// 從任意位置發射一枚飛彈（飛彈攻擊機用）；msq＝發射方分艦隊（加成、陣型用），src＝傷害統計分類
function launchMissileAt(x, y, z, side, msq, target, dmg, t0, src, accM = 1) {
  if (target < 0 || !ships.alive[target]) return false;
  const tg = squadrons[ships.sq[target]];
  shipWorldCPU(target, _b);
  const dx = _b.x - x, dz = _b.z - z, dist = Math.hypot(dx, dz, _b.y - y) || 1;
  const i = misHead; misHead = (misHead + 1) % MIS_MAX;
  const lx = -dz / dist, lz = dx / dist, lat = (rnd() - 0.5) * dist * 0.3, up = dist * (0.08 + rnd() * 0.1);
  misA.set([x, y, z], i * 3);
  misB.set([(x + _b.x) / 2 + lx * lat, (y + _b.y) / 2 + up, (z + _b.z) / 2 + lz * lat], i * 3);
  const hit = rnd() < strikeChance(STRIKE_RULE.missile, target, side, _b) * accM;
  if (msq) fowExpose(msq, target);
  if (hit) misC.set([_b.x, _b.y, _b.z], i * 3);
  else { const off = TYPE_W[ships.type[target]] * (1.2 + rnd() * 1.5) * (rnd() < 0.5 ? -1 : 1); misC.set([_b.x + dx / dist * 12 + lx * off, _b.y + (rnd() - 0.5) * 6, _b.z + dz / dist * 12 + lz * off], i * 3); }
  const dur = dist / (85 + rnd() * 35);
  const blk = ROCKS.length ? rockBlock(x, y, z, _b.x, _b.y, _b.z) : -1, cut = blk >= 0 ? Math.max(0.05, blk) : 1;   // 被巨大小行星擋住＝撞上岩石（同艦艇飛彈）
  misT.set([t0, dur, SIDE_FAC[side] + 0.5, cut], i * 4);
  if (misDirtyFrom < 0) misDirtyFrom = i; misDirtyCount++;
  misGen[i]++; misShot[i] = 0; misLive[i] = blk >= 0 ? 0 : 1; misSide[i] = side; misSpd[i] = dist / dur;
  const tHit = t0 + dur;
  if (blk >= 0) { bezCPU(i, cut, _c); pending.push({ kind: 'mi', t: t0 + dur * cut, side, x: _c.x, y: _c.y, z: _c.z }); }
  else if (!hit) { wStats[side].mMiss++; pending.push({ kind: 'mi', mi: i, g: misGen[i], t: tHit, side, x: misC[i * 3], y: misC[i * 3 + 1], z: misC[i * 3 + 2] }); }
  else { const asp = hitAspect(target, x, z, _b.x, _b.z, y, _b.y); pending.push({ kind: 'mh', src, mi: i, g: misGen[i], t: tHit, target, side, asp, dmg, hm: hitMul(asp, msq, tg), dirIdx: dirIndexOf(dx, dz), x: _b.x, y: _b.y, z: _b.z }); }
  wStats[side].mFired++;
  return true;
}
function launchMissile(launcher, t0, maxRange = 0) {
  const sq = squadrons[ships.sq[launcher]];
  // 先看指定目標，在射程外就改打最近的敵人（同 fireGun）
  shipWorldCPU(launcher, _a);
  let target = -1;
  for (let tries = 0; tries < 3; tries++) {
    const c = tries > 0 ? pickTarget(sq.side, sq) : focusTarget(sq);
    if (c < 0) break;
    shipWorldCPU(c, _b);
    if (!maxRange || Math.hypot(_b.x - _a.x, _b.z - _a.z, _b.y - _a.y) <= maxRange) { target = c; break; }
  }
  if (target < 0) return false;   // 射程內沒有目標：這次不發射
  fowExpose(sq, target);
  const tg = squadrons[ships.sq[target]];
  const dx = _b.x - _a.x, dz = _b.z - _a.z, dist = Math.hypot(dx, dz, _b.y - _a.y);
  const i = misHead; misHead = (misHead + 1) % MIS_MAX;
  const lx = -dz / dist, lz = dx / dist;
  const lat = (rnd() - 0.5) * dist * 0.4, up = dist * (0.12 + rnd() * 0.18);
  misA.set([_a.x, _a.y + 1.5, _a.z], i * 3);
  misB.set([(_a.x + _b.x) / 2 + lx * lat, (_a.y + _b.y) / 2 + up, (_a.z + _b.z) / 2 + lz * lat], i * 3);
  // 命中與否在發射時決定：沒中＝從目標旁邊掠過、在後方自爆（途中仍可能被攔截）
  const hit = rnd() < strikeChance(STRIKE_RULE.missile, target, sq.side, _b);
  if (hit) misC.set([_b.x, _b.y, _b.z], i * 3);
  else {
    const off = TYPE_W[ships.type[target]] * (1.2 + rnd() * 1.5) * (rnd() < 0.5 ? -1 : 1);
    misC.set([_b.x + dx / dist * 12 + lx * off, _b.y + (rnd() - 0.5) * 6, _b.z + dz / dist * 12 + lz * off], i * 3);
  }
  const dur = dist / (85 + rnd() * 35);
  const blk = ROCKS.length ? rockBlock(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z) : -1;   // 被巨大小行星擋住＝撞上岩石
  // 攔截不再開火時就決定：飛彈真的在空中飛，由對方的防空砲／副砲打下來（見 fireAir）
  const intercepted = blk >= 0;   // 只有撞上岩石是一開始就知道的
  const cut = blk >= 0 ? Math.max(0.05, blk) : 1;
  misT.set([t0, dur, SIDE_FAC[sq.side] + 0.5, cut], i * 4);
  if (misDirtyFrom < 0) misDirtyFrom = i; misDirtyCount++;
  misGen[i]++; misShot[i] = 0; misLive[i] = intercepted ? 0 : 1; misSide[i] = sq.side; misSpd[i] = dist / dur;
  const tHit = t0 + dur * cut;
  if (intercepted) {
    bezCPU(i, cut, _c);
    pending.push({ kind: 'mi', t: tHit, side: sq.side, x: _c.x, y: _c.y, z: _c.z });
  } else if (!hit) {
    wStats[sq.side].mMiss++;
    pending.push({ kind: 'mi', mi: i, g: misGen[i], t: tHit, side: sq.side, x: misC[i * 3], y: misC[i * 3 + 1], z: misC[i * 3 + 2] });
  } else {
    const asp = hitAspect(target, _a.x, _a.z, _b.x, _b.z, _a.y, _b.y);
    const md = SHIP_TYPES[ships.type[launcher]].missile;
    pending.push({ kind: 'mh', src: 1, mi: i, g: misGen[i], t: tHit, target, side: sq.side, asp, dmg: (md ? md.dmg : 30) * fleetMods(sq.fleet).dmg, hm: hitMul(asp, sq, tg), dirIdx: dirIndexOf(dx, dz), x: _b.x, y: _b.y, z: _b.z });
  }
  wStats[sq.side].mFired++;
  return true;
}
// 區域攻擊的飛彈：範圍內有敵艦＝朝它發射（看不到＝盲射，命中率打折）；沒有＝飛到那一點自爆
function launchMissileArea(launcher, t0, A) {
  const sq = squadrons[ships.sq[launcher]], md = SHIP_TYPES[ships.type[launcher]].missile;
  shipWorldCPU(launcher, _a);
  const c = areaShip(sq.side, A);
  if (c >= 0) return launchMissileAt(_a.x, _a.y + 1.5, _a.z, sq.side, sq, c, (md ? md.dmg : 30) * fleetMods(sq.fleet).dmg, t0, 1, fowKnowsSq(sq, squadrons[ships.sq[c]]) ? 1 : FOW_RULE.area.blind);
  const r = FOW_RULE.area.r, bx = A.x + (rnd() - 0.5) * r, by = A.y + (rnd() - 0.5) * r * 0.3, bz = A.z + (rnd() - 0.5) * r;
  const dx = bx - _a.x, dz = bz - _a.z, dist = Math.hypot(dx, dz, by - _a.y) || 1;
  const i = misHead; misHead = (misHead + 1) % MIS_MAX;
  const lx = -dz / dist, lz = dx / dist, lat = (rnd() - 0.5) * dist * 0.4, up = dist * (0.12 + rnd() * 0.18);
  misA.set([_a.x, _a.y + 1.5, _a.z], i * 3);
  misB.set([(_a.x + bx) / 2 + lx * lat, (_a.y + by) / 2 + up, (_a.z + bz) / 2 + lz * lat], i * 3);
  misC.set([bx, by, bz], i * 3);
  const dur = dist / (85 + rnd() * 35), blk = ROCKS.length ? rockBlock(_a.x, _a.y, _a.z, bx, by, bz) : -1, cut = blk >= 0 ? Math.max(0.05, blk) : 1;
  misT.set([t0, dur, SIDE_FAC[sq.side] + 0.5, cut], i * 4);
  if (misDirtyFrom < 0) misDirtyFrom = i; misDirtyCount++;
  misGen[i]++; misShot[i] = 0; misLive[i] = blk >= 0 ? 0 : 1; misSide[i] = sq.side; misSpd[i] = dist / dur;
  bezCPU(i, cut, _c);
  pending.push({ kind: 'mi', ...(blk >= 0 ? {} : { mi: i, g: misGen[i] }), t: t0 + dur * cut, side: sq.side, x: _c.x, y: _c.y, z: _c.z });
  wStats[sq.side].mFired++; wStats[sq.side].mMiss++;
  return true;
}
// 飛彈齊射（輪盤「攻擊」頁、按鍵）：選取的艦隊裡冷卻好、還有彈藥的船立刻一起發射（射程內沒目標的不發），會扣彈藥並重新冷卻
function missileSalvo(side, set) {
  const t = U.uTime.value;
  let n = 0;
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i] || ships.side[i] !== side || ships.ammo[i] <= 0 || ships.mcd[i] > 0) continue;
    const md = SHIP_TYPES[ships.type[i]].missile; if (!md) continue;
    const sq = squadrons[ships.sq[i]];
    if (sq.bg || sq.hidden || (set && !set.has(sq))) continue;
    if (launchMissile(i, t + rnd() * 1.2, md.range)) { ships.ammo[i]--; ships.mcd[i] = md.cd * fleetMods(sq.fleet).mcd * (0.85 + rnd() * 0.3); n++; }
  }
  if (n) flash(side);
  if (side === cmdSide && !GAME.replaying && typeof toast === 'function') toast(n ? `飛彈齊射：發射 ${n * opts.rep} 發` : '飛彈齊射：射程內沒有目標，或飛彈還在冷卻／打完了', n ? '' : 'hint');
  return n;
}
// 選取中有沒有可以齊射的飛彈（冷卻好、還有彈藥）
function salvoReady(sel) { return sel.some((q) => q.list.some((i) => ships.alive[i] && ships.ammo[i] > 0 && ships.mcd[i] <= 0 && SHIP_TYPES[ships.type[i]].missile)); }

// ───────────────────────── 艦載機 ─────────────────────────
// CPU 模擬（追擊、迴旋、脫離），每幀把位置／速度整包送上 GPU
const FTR_MAX = 4000;
const fP = new Float32Array(FTR_MAX * 3), fV = new Float32Array(FTR_MAX * 3), fI = new Float32Array(FTR_MAX * 4);
const FT = {
  side: new Uint8Array(FTR_MAX), state: new Uint8Array(FTR_MAX), t0: new Float32Array(FTR_MAX),
  tgt: new Int32Array(FTR_MAX).fill(-1), tk: new Uint8Array(FTR_MAX), rt: new Float32Array(FTR_MAX), cd: new Float32Array(FTR_MAX),
  seed: new Float32Array(FTR_MAX), brk: new Float32Array(FTR_MAX), hp: new Float32Array(FTR_MAX), engT: new Float32Array(FTR_MAX), carrier: new Int32Array(FTR_MAX), launch: new Float32Array(FTR_MAX),
  // kind：0＝攻擊型艦載機、1＝維修機；ret＝返航中；fuel＝剩餘續航；heal＝這趟還能修多少
  kind: new Uint8Array(FTR_MAX), ret: new Uint8Array(FTR_MAX), fuel: new Float32Array(FTR_MAX), heal: new Float32Array(FTR_MAX), hr: new Float32Array(FTR_MAX),
  // role：任務（CRAFT 的索引）；tg2：目標是飛彈時的世代號；ammo：飛彈攻擊機剩幾枚；ch／bcd：光束攻擊機照射剩餘時間／下次照射冷卻
  role: new Uint8Array(FTR_MAX), tg2: new Uint32Array(FTR_MAX), ammo: new Uint8Array(FTR_MAX), ch: new Float32Array(FTR_MAX), bcd: new Float32Array(FTR_MAX),
  // 區域攻擊派出去的：area＝1，ax／ay／az＝要去的那一點（到了找那附近看得到的敵艦，沒有就在上空盤旋偵察）
  area: new Uint8Array(FTR_MAX), ax: new Float32Array(FTR_MAX), ay: new Float32Array(FTR_MAX), az: new Float32Array(FTR_MAX),
};
const ftrAttrs = {
  aFP: new THREE.InstancedBufferAttribute(fP, 3).setUsage(THREE.DynamicDrawUsage),
  aFV: new THREE.InstancedBufferAttribute(fV, 3).setUsage(THREE.DynamicDrawUsage),
  aFI: new THREE.InstancedBufferAttribute(fI, 4).setUsage(THREE.DynamicDrawUsage),
};
const ftrTex = loadTex(FTR_ATLAS);
const FTR_GLSL = /* glsl */`
  uniform float uTime; uniform vec2 uRes; uniform vec3 uCamDir; uniform float uFog;
  attribute vec3 aFP; attribute vec3 aFV; attribute vec4 aFI;
  const float PI = 3.14159265;
`;
const ftrSpriteMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uRes: U.uRes, uCamDir: U.uCamDir, uFog: U.uFog, uTex: { value: ftrTex } },
  vertexShader: FTR_GLSL + /* glsl */`
    varying vec2 vUv; varying float vDie; varying float vFog;
    void main(){
      float st = aFI.y;
      float die = st > 2.5 ? uTime - aFI.z : -1.;
      if (st < 1.5 || die > 0.6) { gl_Position = vec4(2.,2.,2.,1.); return; }
      vec4 clip = projectionMatrix * viewMatrix * vec4(aFP, 1.);
      float sz = 2.0 * projectionMatrix[1][1] * 0.5 * uRes.y / clip.w;
      if (sz < 2.5) { gl_Position = vec4(2.,2.,2.,1.); return; }   // 太小就交給尾焰表現
      clip.xy += position.xy * sz * 2. / uRes * clip.w;
      gl_Position = clip;
      float h = atan(aFV.x, aFV.z);
      float dir = mod(floor(-h / (PI / 4.) + 0.5) + 16., 8.);
      vec2 uv = position.xy + 0.5;
      vUv = vec2((aFI.x * 8. + dir + uv.x) / 16., uv.y);
      vDie = die;
      vFog = uFog * smoothstep(-260., 620., dot(aFP, -uCamDir)) * 0.6;
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uTex; varying vec2 vUv; varying float vDie; varying float vFog;
    void main(){
      vec4 c = texture2D(uTex, vUv);
      if (c.a < 0.35) discard;
      vec3 col = mix(c.rgb, vec3(0.05, 0.07, 0.13), vFog);
      if (vDie > 0.) { col = mix(col, vec3(3., 2.2, 1.4), 1. - smoothstep(0., 0.25, vDie)); col *= 1. - smoothstep(0.3, 0.6, vDie); }
      gl_FragColor = vec4(col, 1.);
    }`,
});
const FTR_COL = [new THREE.Color(1.0, 0.55, 0.25), new THREE.Color(0.5, 0.8, 1.0)];
const ftrTrailMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uRes: U.uRes, uCamDir: U.uCamDir, uFog: U.uFog, uColA: { value: FTR_COL[0] }, uColB: { value: FTR_COL[1] } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: FTR_GLSL + /* glsl */`
    varying vec2 vUv; varying float vFac;
    void main(){
      if (aFI.y < 1.5 || aFI.y > 2.5) { gl_Position = vec4(2.,2.,2.,1.); return; }
      float kind = floor(aFI.w * 0.5);
      vec3 tailP = aFP - aFV * 0.16;
      vec4 ch = projectionMatrix * viewMatrix * vec4(aFP, 1.), ct = projectionMatrix * viewMatrix * vec4(tailP, 1.);
      vec2 sh = ch.xy / ch.w * uRes * 0.5, st = ct.xy / ct.w * uRes * 0.5;
      vec2 d = sh - st; float L = length(d); vec2 dn = L > 1e-3 ? d / L : vec2(1., 0.);
      float ppu = projectionMatrix[1][1] * 0.5 * uRes.y / ch.w;
      float w = clamp(0.3 * ppu, 1.0, 3.0) * 2.5;
      float t = position.x + 0.5;
      vec4 c = mix(ct, ch, t);
      vec2 s = mix(st, sh, t) + vec2(-dn.y, dn.x) * position.y * w + dn * position.x * w * 0.6;
      c.xy = s / (uRes * 0.5) * c.w;
      gl_Position = c;
      vUv = vec2(t, position.y * 2.); vFac = kind > 0.5 ? 2. : aFI.x;   // 2＝維修機（綠色尾焰）
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColA; uniform vec3 uColB; varying vec2 vUv; varying float vFac;
    void main(){
      float y = abs(vUv.y);
      vec3 c = vFac > 1.5 ? vec3(0.45, 1.0, 0.6) : vFac < 0.5 ? uColA : uColB;
      gl_FragColor = vec4((c * exp(-y * y * 6.) * 0.6 + vec3(1.) * exp(-y * y * 40.) * 0.5 * vUv.x) * pow(vUv.x, 1.3), 1.);
    }`,
});
const ftrSpriteMesh = new THREE.Mesh(instGeo(new THREE.PlaneGeometry(1, 1), ftrAttrs, FTR_MAX), ftrSpriteMat);
const ftrTrailMesh = new THREE.Mesh(instGeo(new THREE.PlaneGeometry(1, 1), ftrAttrs, FTR_MAX), ftrTrailMat);
ftrSpriteMesh.frustumCulled = ftrTrailMesh.frustumCulled = false;
ftrSpriteMesh.renderOrder = 1; ftrTrailMesh.renderOrder = 2;
scene.add(ftrSpriteMesh, ftrTrailMesh);
let ftrHead = 0;
const aliveF = [[], []];

// 從艦 i 放出 n 架（kind 0＝攻擊型、1＝維修機，tgt＝維修對象）；回傳實際放出的架數（機位滿了就少放）
// 艦隊的機庫比例（合計＝n）
function hangarMix(fleet, n) {
  const src = (fleet && fleet.hangar) || HANGAR_DEFAULT, sum = src.reduce((a, b) => a + b, 0) || 1;
  const out = src.map((v) => Math.floor(v * n / sum)); let left = n - out.reduce((a, b) => a + b, 0);
  for (let r = 0; left > 0; r = (r + 1) % 4) if (src[r] > 0) { out[r]++; left--; }
  return out;
}
function launchCraft(i, n, kind, tgt = -1, t0 = U.uTime.value, role = 1, area = null) {
  let got = 0;
  for (let k = 0; k < n; k++) {
    let j = -1;
    for (let s = 0; s < FTR_MAX; s++) { const c = (ftrHead + s) % FTR_MAX; if (FT.state[c] === 0) { j = c; break; } }
    if (j < 0) break;
    ftrHead = (j + 1) % FTR_MAX;
    FT.state[j] = 1; FT.side[j] = ships.side[i]; FT.t0[j] = t0 + k * 0.22; FT.carrier[j] = i; FT.seed[j] = rnd();
    FT.kind[j] = kind; FT.ret[j] = 0; FT.tgt[j] = tgt; FT.tk[j] = kind ? 2 : role === 0 ? 0 : 1;
    FT.role[j] = kind ? 0 : role; FT.ammo[j] = kind ? 0 : CRAFT[role].missiles || 0; FT.ch[j] = 0; FT.bcd[j] = 0; FT.engT[j] = 0;
    const st = SHIP_TYPES[ships.type[i]];
    FT.fuel[j] = kind ? 40 : CRAFT[role].fuel; FT.heal[j] = kind ? st.repair.amount * fleetMods(squadrons[ships.sq[i]].fleet).repair : 0;   // 損害管制天賦
    FT.hr[j] = kind ? FT.heal[j] / 12 : 0;   // 維修機：每 0.5 秒修多少（6 秒修完）
    FT.area[j] = area ? 1 : 0; if (area) { FT.ax[j] = area.x; FT.ay[j] = area.y; FT.az[j] = area.z; }
    launchCraft.last = j;
    got++;
  }
  return got;
}
// 舊的手動出擊（測試場用）
function launchFighters(side, perCarrier = 8, set = null) {
  const t = U.uTime.value; let n = 0;
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i] || ships.side[i] !== side || !SHIP_TYPES[ships.type[i]].fighters || squadrons[ships.sq[i]].bg || (set && !set.has(squadrons[ships.sq[i]]))) continue;
    let m = 0; for (let r = 0; r < 4 && m < perCarrier; r++) while (ships.hang[i * 4 + r] > 0 && m < perCarrier && launchCraft(i, 1, 0, -1, t + rnd() * 1.2 + m * 0.22, r)) { ships.hang[i * 4 + r]--; ships.ftr[i]--; m++; }
    n += m;
  }
  return n;
}
function ftrDmgMul(home) { const q = home >= 0 && home < shipCount ? squadrons[ships.sq[home]] : null, m = q && (q.mods || fleetMods(q.fleet)); return m ? m.dmg * m.ftrDmg : 1; }
// ───── 自動武器：飛彈、艦載機、維修機（各艦各自冷卻；敵人進入射程才用） ─────
const wStats = [{ mFired: 0, mInt: 0, mMiss: 0, healed: 0, fLaunch: 0, rLaunch: 0, fLand: 0, fLost: 0, fBuilt: 0 }, { mFired: 0, mInt: 0, mMiss: 0, healed: 0, fLaunch: 0, rLaunch: 0, fLand: 0, fLost: 0, fBuilt: 0 }];
function maxHp(i) { return SHIP_TYPES[ships.type[i]].hp * (squadrons[ships.sq[i]].flagship === i ? 3 : 1); }
function updateEnemyDist() {   // 每支分艦隊離最近敵方分艦隊（邊緣）的距離，每 0.5 秒更新
  for (const q of squadrons) {
    if (q.bg || q.alive <= 0) { q.enemyD = 1e9; continue; }
    let best = 1e9;
    for (const o of squadrons) { if (o.side === q.side || o.bg || o.alive <= 0 || o.hidden || !fowKnowsSq(q, o)) continue; const d = Math.hypot(o.x - q.x, (o.y || 0) - (q.y || 0), o.z - q.z) - Math.max(o.W, o.D) / 2 - Math.max(q.W, q.D) / 2; if (d < best) best = d; }
    q.enemyD = Math.max(0, best);
  }
  // 突破：紡錘陣／圓錐陣的前端衝進敵方分艦隊 → 對方陣形混亂
  const t = U.uTime.value;
  for (const q of squadrons) {
    const F = q.group && FORMATIONS[q.group.formation];
    if (!F || !F.breach || q.bg || q.alive <= 0 || q.enemyD > 5 || sqMorphing(q, t)) continue;
    const fx = q.x + Math.sin(q.h) * q.D / 2, fz = q.z + Math.cos(q.h) * q.D / 2;
    for (const o of squadrons) {
      if (o.side === q.side || o.bg || o.alive <= 0 || o.hidden) continue;
      const dx = fx - o.x, dz = fz - o.z, u = dx * Math.cos(o.h) - dz * Math.sin(o.h), v = dx * Math.sin(o.h) + dz * Math.cos(o.h);
      if (Math.abs(u) > o.W / 2 || Math.abs(v) > o.D / 2 || Math.abs((q.y || 0) + Math.sin(q.p || 0) * q.D / 2 - (o.y || 0)) > 40) continue;   // 3D：高度也要對上
      const fresh = !(o.disorderUntil > t);
      o.disorderUntil = Math.max(o.disorderUntil || 0, t + F.breach);
      if (fresh && typeof toast === 'function' && GAME.phase === 'battle') toast(o.side === GAME.playerSide ? `${o.fleet ? o.fleet.name : ''} ${o.name} 被突破，陣形混亂！` : `突破成功：${o.fleet ? o.fleet.name : ''} ${o.name} 陣形混亂`, o.side === GAME.playerSide ? 'bad' : '');
    }
  }
}
// 補給：補給艦 SUPPLY_RULE.range 內、飛彈沒滿的友艦補 1 發，從最近、還有存量的補給艦扣（每 SUPPLY_RULE.cd 秒一次）
function resupply() {
  const sup = [];
  for (let i = 0; i < shipCount; i++) if (ships.alive[i] && ships.stock[i] > 0 && !squadrons[ships.sq[i]].bg) { shipWorldCPU(i, _a); sup.push(i, _a.x, _a.y, _a.z); }
  if (!sup.length) return;
  const R2 = SUPPLY_RULE.range * SUPPLY_RULE.range;
  for (let i = 0; i < shipCount; i++) {
    const md = SHIP_TYPES[ships.type[i]].missile;
    if (!md || !ships.alive[i] || ships.ammo[i] >= md.n || squadrons[ships.sq[i]].bg) continue;
    shipWorldCPU(i, _a);
    let best = -1, bd = R2;
    for (let k = 0; k < sup.length; k += 4) {
      const s = sup[k]; if (ships.side[s] !== ships.side[i] || ships.stock[s] <= 0) continue;
      const d = (sup[k + 1] - _a.x) ** 2 + (sup[k + 2] - _a.y) ** 2 + (sup[k + 3] - _a.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    if (best >= 0) { ships.ammo[i]++; ships.stock[best]--; wStats[ships.side[i]].resup = (wStats[ships.side[i]].resup || 0) + 1; }
  }
}
// 一方目前的補給存量（存活補給艦的合計）與飛彈存量（攜彈的比例）
function supplyStock(side, fleet) { let n = 0; for (let i = 0; i < shipCount; i++) if (ships.alive[i] && ships.side[i] === side && (!fleet || squadrons[ships.sq[i]].fleet === fleet)) n += ships.stock[i]; return n; }
function ammoRatio(fleet) {
  let a = 0, m = 0;
  for (const q of fleet.sqs) for (const i of q.list) { const md = SHIP_TYPES[ships.type[i]].missile; if (md && ships.alive[i]) { a += ships.ammo[i]; m += md.n; } }
  return m ? a / m : 1;
}
function autoWeapons(dt) {
  if (!opts.fire) return;
  if (simTick % (SUPPLY_RULE.cd * 60) === 0) resupply();
  if (simTick % 30 === 0 || squadrons.some((q) => q.enemyD == null)) updateEnemyDist();
  const t = U.uTime.value, ftrFree = FTR_MAX - aliveF[0].length - aliveF[1].length;
  for (const q of squadrons) q.mods = fleetMods(q.fleet);   // 每 tick 算一次就好
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i]) continue;
    const st = SHIP_TYPES[ships.type[i]], sq = squadrons[ships.sq[i]];
    if (sq.bg || sq.hidden || (sq.group && sq.group.inactive)) continue;
    // 機庫：慢慢補新機（機庫＋在外面飛的不超過容量）
    if (st.fighters && ships.ftr[i] + ships.fout[i] < st.fighters.n) {
      ships.fbt[i] += dt * sq.mods.ftrRegen;
      if (ships.fbt[i] >= st.fighters.build) {   // 補缺最多的那一種
        const mx = sq.hmix || (sq.hmix = hangarMix(sq.fleet, st.fighters.n));
        let br = -1, bm = 0; for (let r = 0; r < 4; r++) { const miss = mx[r] - ships.hang[i * 4 + r] - ships.foutR[i * 4 + r]; if (miss > bm) { bm = miss; br = r; } }
        ships.fbt[i] = 0; if (br >= 0) { ships.hang[i * 4 + br]++; ships.ftr[i]++; wStats[sq.side].fBuilt++; }
      }
    }
    // 飛彈：冷卻好了、敵人在射程內就發射；打完了要回補給艦隊補（見 resupply）
    if (st.missile && ships.ammo[i] > 0) {
      const ar = sqArea(sq);
      if (ships.mcd[i] > 0) ships.mcd[i] -= dt;
      else if (ar && (shipWorldCPU(i, _a), Math.hypot(ar.x - _a.x, ar.y - _a.y, ar.z - _a.z) <= st.missile.range)) {   // 區域攻擊：射程內就往那裡發射
        if (launchMissileArea(i, t + rnd() * 0.6, ar)) { ships.ammo[i]--; ships.mcd[i] = st.missile.cd * sq.mods.mcd * (0.85 + rnd() * 0.3); }
      } else if (sq.enemyD < st.missile.range) { if (launchMissile(i, t + rnd() * 0.6, st.missile.range)) { ships.ammo[i]--; ships.mcd[i] = st.missile.cd * sq.mods.mcd * (0.85 + rnd() * 0.3); } else ships.mcd[i] = 1 + rnd(); }
      else ships.mcd[i] = 0.5 + rnd() * 0.5;
    }
    // 攻擊型艦載機（航母）：機庫有機、敵人在作戰半徑內就放一波
    if (st.fighters) {
      const ar = sqArea(sq), ad = ar ? (shipWorldCPU(i, _a), Math.hypot(ar.x - _a.x, ar.y - _a.y, ar.z - _a.z)) : 1e9;   // 區域攻擊：作戰半徑內就派攻擊機過去（攔截機留守）
      if (ships.fcd[i] > 0) ships.fcd[i] -= dt;
      else if (ships.ftr[i] > 0 && (sq.enemyD < st.fighters.range || ad < st.fighters.range) && ftrFree > 200) {
        // 一波最多 wave 架，各任務輪流放（攔截機先）
        let m = 0; const t1 = t + rnd() * 1.2, toA = ad < st.fighters.range && !(sq.enemyD < st.fighters.range && ad > sq.enemyD), dd = toA ? ad : sq.enemyD;
        for (let pass = 0; pass < 6 && m < st.fighters.wave; pass++) for (let r = 0; r < 4 && m < st.fighters.wave; r++)
          if (ships.hang[i * 4 + r] > 0 && !(toA && r === 0) && !(dd >= (CRAFT[r].launch || 1e9)) && launchCraft(i, 1, 0, -1, t1 + m * 0.22, r, toA ? ar : null)) { ships.hang[i * 4 + r]--; m++; }   // 光束攻擊機等敵人近了才放
        ships.ftr[i] -= m; ships.fout[i] += m; wStats[sq.side].fLaunch += m; ships.fcd[i] = m ? st.fighters.cd * (0.85 + rnd() * 0.3) : 1 + rnd();
      } else ships.fcd[i] = 1 + rnd();
    }
    // 維修機：同一支分艦隊裡有受傷的船就出動（每支分艦隊同時出動的架數有上限）
    if (st.repair && ships.rep[i] > 0) {
      if (ships.rcd[i] > 0) { ships.rcd[i] -= dt; continue; }
      ships.rcd[i] = 2 + rnd() * 2;
      if (ftrFree < 100 || (sq.drones || 0) >= 4 + Math.ceil(sq.alive * 0.08)) continue;
      let best = -1, br = 0.8;
      for (let k = 0; k < 5; k++) { const c = sq.list[(rnd() * sq.list.length) | 0]; if (!ships.alive[c]) continue; const r = ships.hp[c] / maxHp(c); if (r < br) { br = r; best = c; } }
      if (best < 0) continue;
      if (launchCraft(i, 1, 1, best, t + rnd() * 0.5)) { ships.rep[i]--; sq.drones = (sq.drones || 0) + 1; wStats[sq.side].rLaunch++; ships.rcd[i] = st.repair.cd * (0.85 + rnd() * 0.3); }
    }
  }
}
function activateFighter(j) {
  const c = FT.carrier[j];
  if (!ships.alive[c]) { FT.state[j] = 0; return; }
  shipWorldCPU(c, _a);
  const H = squadrons[ships.sq[c]].h;
  const lat = (rnd() - 0.5) * 2;
  fP.set([_a.x + (rnd() - 0.5) * 3, _a.y + 1, _a.z + (rnd() - 0.5) * 3], j * 3);
  fV.set([Math.sin(H) * 30 + Math.cos(H) * lat * 14, 6 + rnd() * 6, Math.cos(H) * 30 - Math.sin(H) * lat * 14], j * 3);
  FT.launch[j] = 1.0 + rnd() * 0.6; FT.cd[j] = 1 + rnd(); FT.rt[j] = 0; FT.brk[j] = 0;
  FT.hp[j] = FT.kind[j] === 2 ? FOW_RULE.recon.hp : FT.kind[j] ? AIR_RULE.droneHp : CRAFT[FT.role[j]].hp;
  FT.state[j] = 2;
}
// 攔截機找目標：交戰半徑內（以艦隊中心算）離中心最近的敵方飛彈，沒有就找艦載機
function interceptAcquire(j, s, cx, cy, cz) {
  airIndex();
  const m = AIR.map[1 - s], R = INTERCEPT_RULE.engage, C = AIR.cell, r = Math.ceil(R / C), gx = Math.floor(cx / C), gz = Math.floor(cz / C);
  let bm = null, dm = R, bf = null, df = R;
  if (m.size) for (let ax = gx - r; ax <= gx + r; ax++) for (let az = gz - r; az <= gz + r; az++) {
    const arr = m.get(ax * 100003 + az); if (!arr) continue;
    for (const o of arr) { const d = Math.hypot(o.x - cx, o.y - cy, o.z - cz); if (o.a === 0) { if (d < dm) { dm = d; bm = o; } } else if (d < df) { df = d; bf = o; } }
  }
  const o = bm || bf;
  if (o) { FT.tgt[j] = o.i; FT.tk[j] = o.a === 0 ? 3 : 0; FT.tg2[j] = o.g || 0; } else FT.tgt[j] = -1;
  FT.rt[j] = 1 + rnd();
}
// 區域攻擊派出的艦載機：那一點附近（350 內）看得到的敵方分艦隊，離那一點最近的
function areaFtrTarget(j, s, hq) {
  let best = null, bd = 350;
  for (const e of squadrons) {
    if (e.side === s || !fowLive(e) || !fowKnowsSq(hq || { side: s }, e)) continue;
    const d = Math.hypot(e.x - FT.ax[j], (e.y || 0) - FT.ay[j], e.z - FT.az[j]); if (d < bd) { bd = d; best = e; }
  }
  if (!best) return -1;
  for (let k = 0; k < 6; k++) { const i = best.list[(rnd() * best.list.length) | 0]; if (ships.alive[i]) return i; }
  return -1;
}
let aaAcc = 0;
function updateFighters(dt) {
  const t = U.uTime.value;
  aliveF[0].length = 0; aliveF[1].length = 0;
  for (const q of squadrons) q.drones = 0;
  ships.fout.fill(0); ships.foutR.fill(0);
  for (let i = 0; i < FTR_MAX; i++) {
    if (FT.state[i] === 2) aliveF[FT.side[i]].push(i);
    if (FT.kind[i] === 0 && (FT.state[i] === 1 || FT.state[i] === 2) && FT.carrier[i] < shipCount && ships.fout[FT.carrier[i]] < 255) { ships.fout[FT.carrier[i]]++; ships.foutR[FT.carrier[i] * 4 + FT.role[i]]++; }
    if (FT.kind[i] === 1 && (FT.state[i] === 1 || FT.state[i] === 2)) { const c = FT.carrier[i]; if (c >= 0 && c < shipCount) squadrons[ships.sq[c]].drones++; }
  }
  for (let i = 0; i < FTR_MAX; i++) {
    let st = FT.state[i];
    if (st === 1 && t >= FT.t0[i]) { activateFighter(i); st = FT.state[i]; }
    if (st === 3 && t - FT.t0[i] > 0.7) { FT.state[i] = 0; st = 0; }
    fI[i * 4] = SIDE_FAC[FT.side[i]]; fI[i * 4 + 1] = st; fI[i * 4 + 2] = FT.t0[i]; fI[i * 4 + 3] = FT.seed[i] + (FT.kind[i] === 1 ? 2 : 0);   // w：整數部分＝種類（畫維修機用；偵察機畫成一般艦載機）
    if (st !== 2) continue;
    const i3 = i * 3, s = FT.side[i], seed = FT.seed[i];
    let px = fP[i3], py = fP[i3 + 1], pz = fP[i3 + 2], vx = fV[i3], vy = fV[i3 + 1], vz = fV[i3 + 2];
    const kind = FT.kind[i], home = FT.carrier[i];
    const RC = FOW_RULE.recon;
    let speed = kind === 2 ? RC.speed[0] + seed * (RC.speed[1] - RC.speed[0]) : kind ? 30 + seed * 8 : CRAFT[FT.role[i]].speed[0] + seed * (CRAFT[FT.role[i]].speed[1] - CRAFT[FT.role[i]].speed[0]);
    let dx = vx, dy = vy, dz = vz, d = 1e9, tx = 0, ty = 0, tz = 0, hasT = false;
    if (FT.launch[i] > 0) {
      FT.launch[i] -= dt;
    } else if (kind === 2 && !FT.ret[i]) {
      // 偵察機：飛到指定的點（tk 0），到了在上空盤旋 loiter 秒（tk 1，區域掃描見 fowUpdate），然後返航
      FT.fuel[i] -= dt; if (FT.fuel[i] <= 0) FT.ret[i] = 1;
      tx = FT.ax[i]; ty = FT.ay[i]; tz = FT.az[i];
      dx = tx - px; dy = ty - py; dz = tz - pz; d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
      if (FT.tk[i] === 0 && d < 40) { FT.tk[i] = 1; FT.cd[i] = RC.loiter; }
      let ex = dx, ey = dy, ez = dz;
      if (FT.tk[i] === 1) {
        FT.cd[i] -= dt; if (FT.cd[i] <= 0) FT.ret[i] = 1;
        ex = -dz + dx * (d - 45) / 30; ey = dy * 0.5; ez = dx + dz * (d - 45) / 30; speed *= 0.6;   // 繞著那一點盤旋
      }
      const el = Math.hypot(ex, ey, ez) || 1, k = Math.min(1, 3 * dt);
      vx += (ex / el * speed - vx) * k; vy += (ey / el * speed - vy) * k; vz += (ez / el * speed - vz) * k;
    } else if (FT.ret[i] || kind === 1) {
      // 返航（續航用完／維修完）或維修機飛往受傷的船
      FT.fuel[i] -= dt;
      if (!FT.ret[i]) { const g = FT.tgt[i]; if (g < 0 || !ships.alive[g] || ships.hp[g] >= maxHp(g) * 0.995 || FT.heal[i] <= 0 || FT.fuel[i] <= 0) FT.ret[i] = 1; }
      const goal = FT.ret[i] ? home : FT.tgt[i];
      if (goal < 0 || !ships.alive[goal]) { FT.state[i] = 3; FT.t0[i] = t; continue; }   // 母艦沉了：找不到地方降落
      shipWorldCPU(goal, _a); tx = _a.x; ty = _a.y + 1; tz = _a.z;
      dx = tx - px; dy = ty - py; dz = tz - pz; d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
      if (FT.ret[i] && d < 10) {   // 降落：回到機庫／機上
        if (kind === 2) fowReconReport(i, squadrons[ships.sq[home]].fleet, '返航');   // 偵察機：把被干擾時記下的情報帶回來
        FT.state[i] = 0; if (kind === 1) ships.rep[home]++; else if (kind === 0) { ships.ftr[home]++; ships.hang[home * 4 + FT.role[i]]++; wStats[s].fLand++; }   // 偵察機不佔機庫
        fI[i * 4 + 1] = 0; continue;
      }
      let ex = dx, ey = dy, ez = dz;
      if (FT.ret[i] && d < 40) speed = Math.max(14, speed * d / 40);   // 進場減速，才停得下來
      if (!FT.ret[i] && d < 9) {   // 在受傷的船旁邊盤旋、修理
        ex = -dz + dx * 0.3; ey = Math.sin(t * 2 + seed * 9) * 0.2; ez = dx + dz * 0.3; speed = 9;
        FT.cd[i] -= dt;
        if (FT.cd[i] <= 0) { FT.cd[i] = 0.5; const g = FT.tgt[i], amt = Math.min(FT.heal[i], FT.hr[i], maxHp(g) - ships.hp[g]); ships.hp[g] += amt; FT.heal[i] -= amt; wStats[s].healed += amt; }
      }
      const el = Math.hypot(ex, ey, ez) || 1, k = Math.min(1, 3 * dt);
      vx += (ex / el * speed - vx) * k; vy += (ey / el * speed - vy) * k; vz += (ez / el * speed - vz) * k;
    } else {
      const role = FT.role[i], C = CRAFT[role];
      FT.fuel[i] -= dt;
      if (FT.fuel[i] <= 0) FT.ret[i] = 1;   // 續航用完：下一幀開始返航
      FT.rt[i] -= dt;
      const hq = home >= 0 && home < shipCount ? squadrons[ships.sq[home]] : null;
      let mode = 0;   // 0 追擊迴旋、1 巡邏、2 飛彈發射、3 光束照射
      if (role === 0) {
        // 攔截機：以艦隊中心為巡邏點，攔截附近的敵方飛彈與艦載機
        const G = hq && hq.group, cx0 = G ? G.ax : px, cy0 = G ? (G.ay || 0) : py, cz0 = G ? G.az : pz;
        const g = FT.tgt[i];
        const ok = g >= 0 && (FT.tk[i] === 3 ? misLive[g] && misGen[g] === FT.tg2[i] : FT.state[g] === 2);
        if (!ok || FT.rt[i] <= 0) interceptAcquire(i, s, cx0, cy0, cz0);
        const g2 = FT.tgt[i];
        if (g2 >= 0 && FT.tk[i] === 3) { const u = Math.min(1, Math.max(0, (t - misT[g2 * 4]) / misT[g2 * 4 + 1])); bezCPU(g2, u, _c); tx = _c.x; ty = _c.y; tz = _c.z; hasT = true; }
        else if (g2 >= 0) { tx = fP[g2 * 3]; ty = fP[g2 * 3 + 1]; tz = fP[g2 * 3 + 2]; hasT = true; }
        else { mode = 1; const an = t * 0.45 + seed * 6.283; tx = cx0 + Math.cos(an) * INTERCEPT_RULE.patrol * 0.7; ty = cy0 + 25; tz = cz0 + Math.sin(an) * INTERCEPT_RULE.patrol * 0.7; }
      } else {
        // 打船：跟著母艦所屬分艦隊的攻擊目標（沒有就打最近的）；光束照射中不換目標
        const g = FT.tgt[i];
        if ((!(g >= 0 && ships.alive[g]) || FT.rt[i] <= 0) && FT.ch[i] <= 0) {
          FT.tgt[i] = FT.area[i] ? areaFtrTarget(i, s, hq) : hq && hq.alive > 0 ? focusTarget(hq) : pickTarget(s, { x: px, z: pz, side: s }); FT.tk[i] = 1; FT.rt[i] = 3 + rnd() * 2;
        }
        const g2 = FT.tgt[i];
        if (g2 >= 0 && ships.alive[g2]) { shipWorldCPU(g2, _a); tx = _a.x; ty = _a.y; tz = _a.z; hasT = true; }
        else if (FT.area[i]) { FT.ch[i] = 0; tx = FT.ax[i]; ty = FT.ay[i]; tz = FT.az[i]; }   // 區域攻擊：飛到那一點，在上空盤旋偵察
        else if (fowOn()) { FT.ch[i] = 0; const G = hq && hq.group; tx = G ? G.ax : px; ty = G ? G.ay || 0 : py; tz = G ? G.az : pz; }   // 戰爭迷霧：沒有看得到的目標就回艦隊上空
        else { FT.ch[i] = 0; const ef = groups.find((o) => o.side === 1 - s); tx = ef ? ef.ax : px; ty = 0; tz = ef ? ef.az : pz; }
        if (role === 2) mode = 2; else if (role === 3) mode = 3;
      }
      dx = tx - px; dy = ty - py; dz = tz - pz; d = Math.hypot(dx, dy, dz) || 1;
      dx /= d; dy /= d; dz /= d;
      let ex, ey, ez;
      if (mode === 1) { ex = dx; ey = dy * 0.6; ez = dz; speed *= 0.7; }
      else if (mode === 2 && hasT && d < C.standoff) {   // 到發射距離：橫向繞飛、發射飛彈，打完返航
        ex = -dz + dx * 0.15; ey = 0; ez = dx + dz * 0.15; speed *= 0.7;
        FT.cd[i] -= dt;
        if (FT.cd[i] <= 0 && FT.ammo[i] > 0) {
          FT.cd[i] = 0.7 + rnd() * 0.4;
          if (launchMissileAt(px, py, pz, s, hq, FT.tgt[i], C.dmg * ftrDmgMul(home), t, 2)) FT.ammo[i]--;
          if (FT.ammo[i] === 0) FT.ret[i] = 1;
        }
      } else if (mode === 3 && hasT && d < C.range * 1.15) {   // 照射：慢速繞著目標，持續光束
        const side = Math.sin(seed * 31) > 0 ? 1 : -1;
        ex = -dz * side + dx * (d - C.range * 0.8) / 40; ey = dy * 0.3; ez = dx * side + dz * (d - C.range * 0.8) / 40; speed = Math.min(speed, 16);
      } else {
        // 追擊：繞著目標迴旋，不直線對衝
        const sw = Math.sin(t * 1.7 + seed * 20) * 0.8;
        ex = dx - dz * sw; ey = dy * 0.6 + Math.sin(t * 1.1 + seed * 9) * 0.35; ez = dz + dx * sw;
        if (role === 1 && d < 16) FT.brk[i] = 1.4;              // 掃射完拉起脫離
        if (FT.brk[i] > 0) { FT.brk[i] -= dt; ex = -dx + Math.sin(seed * 50) * 0.8; ey = 0.5; ez = -dz + Math.cos(seed * 50) * 0.8; }
      }
      const yref = hasT ? ty : py; if (py > yref + 45) ey -= 0.6; if (py < yref - 45) ey += 0.6;   // 3D：在目標的高度附近
      const el = Math.hypot(ex, ey, ez) || 1;
      const k = Math.min(1, 2.6 * dt);
      vx += (ex / el * speed - vx) * k; vy += (ey / el * speed - vy) * k; vz += (ez / el * speed - vz) * k;
      // 光束攻擊機：照射
      if (role === 3) {
        FT.bcd[i] -= dt;
        if (FT.ch[i] > 0) {
          if (!hasT || d > C.range * 1.3) FT.ch[i] = 0;
          else {
            FT.ch[i] -= dt;
            if ((simTick + i) % 3 === 0) spawnBeam(px, py, pz, tx, ty, tz, t, 0.045, s, 1.1, 1.0);
            FT.cd[i] -= dt;
            if (FT.cd[i] <= 0) {
              FT.cd[i] = 0.25;
              const g = FT.tgt[i], fh = rnd() < strikeChance(STRIKE_RULE.lance, g, s, { x: tx, y: ty, z: tz }) && !(ROCKS.length && rockBlock(px, py, pz, tx, ty, tz) >= 0);   // 被巨大小行星擋住就打不到
              const fs = ftrStats[s]; fs[0]++; if (fh) fs[1]++;
              if (fh) { const asp = hitAspect(g, px, pz, tx, tz, py, ty); pending.push({ kind: 'lb', src: 2, t: t + 0.02, target: g, side: s, asp, dmg: C.dps * 0.25 * ftrDmgMul(home), hm: hitMul(asp, hq, squadrons[ships.sq[g]]), fx: rnd() < 0.3, dirIdx: dirIndexOf(tx - px, tz - pz), x: tx, y: ty, z: tz }); }
            }
          }
        } else if (hasT && !FT.ret[i] && d < C.range * 1.15 && FT.bcd[i] <= 0) { FT.ch[i] = C.channel; FT.bcd[i] = C.channel + C.cd; FT.cd[i] = 0; }
      }
    }
    const vl = Math.hypot(vx, vy, vz) || 1;
    const sp = FT.launch[i] > 0 ? Math.min(speed, vl + 30 * dt) : speed;
    vx = vx / vl * sp; vy = vy / vl * sp; vz = vz / vl * sp;
    px += vx * dt; py += vy * dt; pz += vz * dt;
    fP[i3] = px; fP[i3 + 1] = py; fP[i3 + 2] = pz; fV[i3] = vx; fV[i3 + 1] = vy; fV[i3 + 2] = vz;
    // 射擊：機首大致對準目標才開火
    const gunCraft = kind === 0 && FT.role[i] <= 1;   // 攔截機、攻擊機用機砲；重攻擊機在上面另外處理
    if (gunCraft && !FT.ret[i]) FT.cd[i] -= dt;
    if (gunCraft && !FT.ret[i] && hasT && FT.cd[i] <= 0 && d < (FT.role[i] === 0 ? INTERCEPT_RULE.range : 55) && (vx * dx + vy * dy + vz * dz) / sp > 0.85) {
      const IR = INTERCEPT_RULE;
      FT.cd[i] = FT.role[i] === 0 ? IR.cd[0] + rnd() * (IR.cd[1] - IR.cd[0]) : 0.35 + rnd() * 0.5;
      const g = FT.tgt[i];
      // 命中率：攔截機打艦載機／飛彈，攻擊機打船；沒中就偏開
      const fh = FT.tk[i] === 3 ? rnd() < IR.acc.missile : FT.tk[i] === 0 ? rnd() < IR.acc.fighter * (FT.kind[g] === 2 ? FOW_RULE.recon.acc : 1) : rnd() < strikeChance(STRIKE_RULE.fighter, g, s, { x: tx, y: ty, z: tz }) && !(ROCKS.length && rockBlock(px, py, pz, tx, ty, tz) >= 0);   // 掃射船：被巨大小行星擋住就打不到
      const miss = fh ? 1.5 : 7 + rnd() * 6;
      const jx = (rnd() - 0.5) * miss, jy = fh ? 0 : (rnd() - 0.5) * miss * 0.6, jz = (rnd() - 0.5) * miss, bd = d / 450;
      spawnBeam(px, py, pz, tx + jx, ty + jy, tz + jz, t, bd, s, 0.35, 0.55);
      const fs = ftrStats[s]; fs[0]++; if (fh) fs[1]++;
      if (!fh) { /* 沒打中 */ }
      else if (FT.tk[i] === 3) pending.push({ kind: 'ak', a: 0, t: t + bd, i: g, g: FT.tg2[i], dmg: IR.dmg, side: s });
      else if (FT.tk[i] === 0) pending.push({ kind: 'ak', a: 1, t: t + bd, i: g, dmg: IR.dmg, side: s });
      else { const asp = hitAspect(g, px, pz, tx, tz, py, ty); pending.push({ src: 2, t: t + bd, target: g, side: s, asp, dmg: CRAFT[1].dmg * ftrDmgMul(home), hm: hitMul(asp, home >= 0 && home < shipCount ? squadrons[ships.sq[home]] : null, squadrons[ships.sq[g]]), fx: rnd() < 0.35, dirIdx: dirIndexOf(tx - px, tz - pz), x: tx + jx, y: ty, z: tz + jz }); }
    }
  }
  // 艦艇對空：改由每艘船的防空砲／副砲各自瞄準開火（fireAir）
  ftrAttrs.aFP.needsUpdate = ftrAttrs.aFV.needsUpdate = ftrAttrs.aFI.needsUpdate = true;
}

// ───────────────────────── 命中處理 ─────────────────────────
// 最近幾秒的受擊方位（指數衰減）；側面＋背後佔三成以上就在標籤上警示
function decayHits(dt) { const k = Math.exp(-dt / 3); for (const sq of squadrons) if (sq.hitW) for (let a = 0; a < 3; a++) sq.hitW[a] *= k; }
function flankState(sq) {
  const w = sq.hitW; if (!w) return '';
  const tot = w[0] + w[1] + w[2]; if (tot < 4) return '';
  if ((w[1] + w[2]) / tot < 0.3) return '';
  return w[2] >= w[1] ? '背後' : '側面';
}
function processHits() {
  const t = U.uTime.value;
  for (let k = pending.length - 1; k >= 0; k--) {
    const e = pending[k];
    if (e.t > t) continue;
    pending[k] = pending[pending.length - 1]; pending.pop();
    if (e.kind === 'mi') {   // 撞上岩石，或沒命中、在目標後方自爆（半路被打下的就不再爆一次）
      if (e.mi != null) { if (!misLive[e.mi] || misGen[e.mi] !== e.g) continue; misLive[e.mi] = 0; }
      spawnFx(e.x, e.y, e.z, e.side, 3.2, 26); continue;
    }
    if (e.kind === 'ak') {   // 防空／副砲打中飛彈或艦載機
      if (e.a === 0) {
        const i = e.i;
        if (misLive[i] && misGen[i] === e.g) {
          misLive[i] = 0; const t0 = misT[i * 4], dur = misT[i * 4 + 1], u = Math.min(1, Math.max(0, (t - t0) / dur));
          misT[i * 4 + 3] = u; misCut = true; wStats[misSide[i]].mInt++;
          bezCPU(i, u, _c); spawnFx(_c.x, _c.y, _c.z, misSide[i], 3.2, 26);
        }
      } else {
        const j = e.i;
        if (FT.state[j] === 2) {
          FT.hp[j] -= e.dmg;
          if (FT.hp[j] <= 0) { FT.state[j] = 3; FT.t0[j] = t; if (!FT.kind[j]) wStats[FT.side[j]].fLost++; spawnFx(fP[j * 3], fP[j * 3 + 1], fP[j * 3 + 2], FT.side[j], 2.6, 26); }
        }
      }
      continue;
    }
    if (e.kind === 'mh' && e.mi != null) { if (!misLive[e.mi] || misGen[e.mi] !== e.g) continue; misLive[e.mi] = 0; }   // 半路被打下了
    if (e.kind === 'sp') { spawnFx(e.x, e.y, e.z, e.side, 1.4, 20); continue; }   // 光束打在岩石上的火花
    if (!ships.alive[e.target]) continue;
    const tSide = ships.side[e.target];
    const tq = squadrons[ships.sq[e.target]];
    // 傷害：能量（光束、艦載機）先打護盾，打穿才傷船體；飛彈打在護盾上也有爆炸傷到船體，護盾沒了直擊更痛
    // hm＝船體受傷倍率（受擊方位、陣型、混亂）；護盾沒有方向，不吃這個倍率
    const mods = fleetMods(tq.fleet), raw = (e.dmg || 0) * mods.taken, hm = e.hm != null ? e.hm : 1, ti = e.target;
    let shD = 0, hullD = 0;
    const sh0 = ships.sh[ti];
    if (e.kind === 'lb') {   // 光束攻擊機的持續光束：護盾消耗 ×shieldMul，打穿後船體 ×hullMul
      const L = CRAFT[3], need = raw * L.shieldMul * mods.shTaken;
      if (sh0 >= need) shD = need; else { shD = sh0; hullD = (need - sh0) / (L.shieldMul * mods.shTaken) * L.hullMul * hm; }
    } else if (e.kind === 'mh') {
      if (sh0 > 0.5) { shD = Math.min(sh0, raw * MISSILE_RULE.shield * mods.shTaken); hullD = raw * MISSILE_RULE.blast * hm; }
      else hullD = raw * MISSILE_RULE.direct * hm;
    } else {
      const need = raw * mods.shTaken;
      if (sh0 >= need) shD = need; else { shD = sh0; hullD = (need - sh0) / mods.shTaken * hm; }
    }
    ships.sh[ti] = sh0 - shD; if (shD > 0) ships.shT[ti] = t;
    ships.hp[ti] -= hullD;
    const eff = shD + hullD;
    e.kill = ships.hp[ti] <= 0;
    e.hull = hullD > 0;
    if (e.asp != null) {
      tq.hitW[e.asp] += 1;
      if (e.kill) dmgStats[tSide][e.asp]++;
    }
    if (e.ff) { ffStats[e.side][0]++; ffStats[e.side][1] += eff; }   // 友軍誤射：不算進對敵傷害
    else { dmgDealt[e.side] += eff; wDmg[e.side][e.src || 0] += eff; }
    if (e.kind === 'mh' || e.kind === 'lb') {
      if (e.kill) { killShip(e.target, t, e.x, e.y, e.z, e.kind === 'mh' ? 1.25 : 1); continue; }
      if (e.kind === 'lb') { if (e.fx) spawnFx(e.x, e.y, e.z, e.hull ? e.side : 2 + tSide * 8 + e.dirIdx, TYPE_W[ships.type[e.target]] * (e.hull ? 0.4 : 0.9), 24); continue; }
      if (e.kill) killShip(e.target, t, e.x, e.y, e.z, 1.25);
      else { spawnFx(e.x, e.y, e.z, 2 + tSide * 8 + e.dirIdx, TYPE_W[ships.type[e.target]] * 1.2, 22); spawnFx(e.x, e.y, e.z, e.side, 3, 24); }
      continue;
    }
    if (e.kill) killShip(e.target, t, e.x, e.y, e.z);
    else if (e.fx) {
      if (!e.hull) spawnFx(e.x, e.y, e.z, 2 + tSide * 8 + e.dirIdx, TYPE_W[ships.type[e.target]] * 0.9, 24);   // 護盾擋下
      else spawnFx(e.x, e.y, e.z, e.side, TYPE_W[ships.type[e.target]] * 0.45, 26);   // 打到船體：小爆炸
    }
  }
  if (stateDirty) { shipGeo.getAttribute('aState').needsUpdate = true; recountAlive(); stateDirty = false; }
}

const dmgDealt = [0, 0];
const ffStats = [[0, 0], [0, 0]];   // 友軍誤射（擬真難度）：各方誤擊的次數、傷害
const ffHold = [0, 0];   // 擬真難度：同部隊擋住射界而停火的次數
const wDmg = [[0, 0, 0], [0, 0, 0]];   // 傷害來源：光束、飛彈、艦載機
let fireAcc = [0, 0];
// 每艘艦各自冷卻：艦種決定開火間隔；陣型火力倍率、變換陣型中減半
const _rate = new Float32Array(MAX_SQ);
// 自動迎敵：沒有在移動、轉向、變陣的部隊，主砲指不到目標時自己轉向（目標＝指定的攻擊目標，沒有就是最近的敵方分艦隊）
const AUTO_FACE = { every: 30, tol: 25 * Math.PI / 180, range: 1.3 };
function autoFace() {
  if (!opts.autoFace) return;
  const t = U.uTime.value;
  groups.forEach((g, gi) => {
    if ((simTick + gi * 7) % AUTO_FACE.every || !groupIdle(g) || (g.queue && g.queue.length) || t < g.start + g.dur) return;
    const mine = g.sqs.filter((q) => q.alive > 0 && !q.bg); if (!mine.length) return;
    let cx = 0, cz = 0, far = 0; for (const q of mine) { cx += q.x; cz += q.z; for (let k = 0; k < NT; k++) if (q.typeAlive[k]) far = Math.max(far, SHIP_TYPES[k].beam.far); }
    cx /= mine.length; cz /= mine.length; far *= (opts.rangeMul || 1) * AUTO_FACE.range;
    let T = g.target && g.target.alive > 0 && fowKnowsSq(mine[0], g.target) ? g.target : null;   // 戰爭迷霧：只轉向看得到的敵人
    if (!T) { let bd = far * far; for (const q of squadrons) { if (q.side === g.side || q.bg || q.alive <= 0 || !fowKnowsSq(mine[0], q)) continue; const d = (q.x - cx) ** 2 + (q.z - cz) ** 2; if (d < bd) { bd = d; T = q; } } }
    if (!T && g.area && g.area.until > t) T = g.area;   // 區域攻擊：轉向那一點
    if (!T) return;
    const H = Math.atan2(T.x - cx, T.z - cz), cur = groupHeading(g, t);
    if (Math.abs(wrapAngle(H - cur)) > AUTO_FACE.tol) turnGroupTo(g, H);
  });
}
function continuousFire(dt) {
  const t = U.uTime.value;
  // 分艦隊速度（命中率用）：位置變化量，平滑
  for (const q of squadrons) {
    if (q._px != null) { const v = Math.hypot(q.x - q._px, (q.y || 0) - q._py, q.z - q._pz) / dt; q.vel = (q.vel || 0) + (Math.min(v, 200) - (q.vel || 0)) * 0.1; }
    q._px = q.x; q._py = q.y || 0; q._pz = q.z;
  }
  // 護盾回充
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i] || ships.sh[i] >= ships.shMax[i] || t - ships.shT[i] < SHIELD_RULE.delay) continue;
    const q = squadrons[ships.sq[i]];
    ships.sh[i] = Math.min(ships.shMax[i], ships.sh[i] + ships.shMax[i] * SHIELD_RULE.rate * dt);
  }
  if (!opts.fire) return;
  for (let k = 0; k < squadrons.length; k++) {
    const q = squadrons[k];
    const FM = q.group && FORMATIONS[q.group.formation];
    _rate[k] = q.bg || !q.group ? 0 : (FM.fireNear != null && q.enemyD < 120 ? FM.fireNear : FM.fire) * (sqMorphing(q, t) ? 0.5 : 1) * (q.disorderUntil > t ? DISORDER.fire : 1) / fleetMods(q.fleet).fireCd;   // 極速射擊：開火間隔縮短
  }
  const CDS = [ships.cd, ships.cd1, ships.cd2];
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i]) continue;
    const r = _rate[ships.sq[i]];
    if (r <= 0) continue;
    const G = SHIP_TYPES[ships.type[i]].guns;
    for (let g = 0; g < 3; g++) {
      const gk = GUN_KEYS[g], gun = G[gk]; if (!gun) continue;
      const arr = CDS[g], cd = arr[i] - dt * (gk === 'aa' ? 1 : r);   // 防空不受陣型火力影響
      if (cd > 0) { arr[i] = cd; continue; }
      arr[i] = fireGun(i, gk) ? gun.cd * (0.85 + rnd() * 0.3) : 0.4 + rnd() * 0.4;
    }
  }
}
function resetCombat() {
  pending.length = 0;
  for (const k in FT) FT[k].fill(k === 'tgt' ? -1 : 0);
  fP.fill(0); fV.fill(0); fI.fill(0); ftrAttrs.aFI.needsUpdate = true;
  aliveF[0].length = 0; aliveF[1].length = 0; misHead = 0; ftrHead = 0;
  for (const w of wStats) { w.mFired = w.mInt = w.mMiss = w.healed = w.fLaunch = w.rLaunch = w.fLand = w.fLost = w.fBuilt = 0; } for (const a of wDmg) a.fill(0);
  for (const q of squadrons) { q.enemyD = null; q.drones = 0; q.disorderUntil = 0; q.volleyT = -1e9; }
  for (let i = 0; i < MIS_MAX; i++) misT[i * 4] = -999;
  misLive.fill(0); AIR.tick = -1;
  misAttrs.aMT.needsUpdate = true;
}

// ───────────────────────── 命令與固定步長模擬 ─────────────────────────
// 玩家與 AI 只能用「命令」改變戰局：命令帶著它生效的 tick；模擬每 tick 固定前進 1/60 秒。
// 同一個種子＋同一串命令 → 完全相同的結果。之後的回放、連線（互傳命令）都建立在這上面。
const SIM_HZ = 60, SIM_DT = 1 / SIM_HZ, MAX_STEPS_PER_FRAME = 16;
let simTick = 0, simAcc = 0;
const INPUT_DELAY = 0;            // 單機＝0（立即生效）；連線時設成幾個 tick 讓命令先傳到對方
const cmdQueue = [], cmdLog = [];
const SIM_RULES = ['fire', 'advance', 'flankSide', 'flankRear', 'beamNear', 'beamFar', 'altitude', 'rangeMul', 'autoFace', 'flat', 'ff', 'fow'];
let battleRules = null;
// 多人戰鬥（內容在 multi.js）：on＝這場戰鬥由伺服器的回合推進；spec＝觀戰；bound＝收到的回合允許跑到哪個 tick（不含）
const NET = { on: false, spec: false, seat: -1, K: 4, speed: 1, bound: 0, start: null, room: null, lobby: [], out: [], want: false, conn: null, screen: null, chat: [] };
function issue(type, args = {}) {
  if (type === 'qedit' && args.uturn == null) args = { ...args, uturn: opts.uturn };   // 迴轉方式記進命令（不同玩家的設定不同）
  if (NET.on && GAME.phase === 'battle') { if (!NET.spec && type !== 'rule' && !GAME.result) netCmd({ type, ...args }); return null; }   // 多人：送到伺服器，由回合帶回來才執行
  if (GAME.replaying && type !== 'rule') return null;   // 回放中不接受新命令
  if (GAME.watch && type !== 'rule') { if (GAME.phase === 'battle' && performance.now() - (GAME.watchWarn || 0) > 4000) { GAME.watchWarn = performance.now(); toast('AI 對戰觀摩：雙方都由 AI 指揮，不能下令（可以點選艦隊查看、移動鏡頭、調速度）', 'hint'); } return null; }
  if (BR.on && type !== 'rule' && bridgeConsoleK() < 0.9) { bridgeNoCmd(); return null; }   // 艦橋：只有看著戰術台時才能下令（戰場畫面的右鍵移動等一律無效）
  const c = { tick: simTick + INPUT_DELAY, side: cmdSide, type, ...args };
  let k = cmdQueue.length; while (k > 0 && cmdQueue[k - 1].tick > c.tick) k--;   // 依 tick 排序（回放中插隊也正確）
  cmdQueue.splice(k, 0, c);
  return INPUT_DELAY === 0 ? runCommands() : null;
}
function runCommands() {
  let last = null;
  while (cmdQueue.length && cmdQueue[0].tick <= simTick) { const c = cmdQueue.shift(); cmdLog.push(c); last = execCommand(c); }
  return last;
}
// 依目前的部隊分開；只選了部隊的一部分＝把那幾支分出來成為獨立部隊
function selGroups(list) {
  const by = new Map();
  for (const q of list) { if (q.bg || !q.group) continue; if (!by.has(q.group)) by.set(q.group, []); by.get(q.group).push(q); }
  return [...by.values()].map((l) => formGroup(l)).filter(Boolean);
}
// 多支部隊一起移動：以兵力加權的中心為基準，每支部隊的目的地＝指定點＋原本的相對位置（有指定朝向就一起轉）
function multiTargets(gs, x, z, H, y = null) {
  const t = U.uTime.value; let cx = 0, cy = 0, cz = 0, n = 0, ss = 0, sc = 0;
  for (const g of gs) { const w = Math.max(1, sumA(g.sqs.map((q) => q.alive))), h = groupHeading(g, t); cx += g.ax * w; cy += (g.ay || 0) * w; cz += g.az * w; n += w; ss += Math.sin(h) * w; sc += Math.cos(h) * w; }
  cx /= n; cy /= n; cz /= n;
  const d = H == null ? 0 : wrapAngle(H - Math.atan2(ss, sc)), cd = Math.cos(d), sd = Math.sin(d);
  return gs.map((g) => { const ox = g.ax - cx, oz = g.az - cz; return { x: x + ox * cd + oz * sd, z: z - ox * sd + oz * cd, H: H == null ? null : H, y: y == null ? null : y + ((g.ay || 0) - cy) }; });   // 高度也保持相對位置
}
function execCommand(c) {
  const list = (c.sqs || []).map((i) => squadrons[i]).filter((q) => q && !q.bg && q.alive > 0 && q.side === c.side);
  const set = new Set(list);
  // 直接下的命令會取消該部隊的戰術隊列；隊列自己發出的命令（fromQueue）不會
  const grp = () => { const g2 = formGroup(list); if (g2 && !c.fromQueue) g2.queue = []; return g2; };
  let g = null;
  switch (c.type) {
    case 'qclear': g = formGroup(list); if (g) g.queue = []; break;
    case 'queue': {
      // 選了好幾支部隊：各自排進自己的隊列（移動的目的地保持彼此的相對位置），不併成一支
      // （併成一支會丟掉各部隊已排好的隊列，所以排隊的命令一律各自執行；畫陣線例外）
      const gs = c.item.width == null ? selGroups(list) : [formGroup(list)].filter(Boolean);
      const T = gs.length > 1 ? multiTargets(gs, c.item.x, c.item.z, c.item.H, c.item.y) : null;
      gs.forEach((gg, k) => {
        if (!gg.queue) gg.queue = [];
        gg.queue.push({ ...c.item, ...(T ? { x: T[k].x, z: T[k].z, H: T[k].H, ...(c.item.y != null ? { y: T[k].y } : {}) } : {}), qid: ++qidSeq });
        runQueue(gg); g = gg;
      });
      break;
    }
    case 'form': g = grp(); if (g) { g.width = null; issueFormation(g, c.kind); g.cur = { type: 'form', kind: c.kind }; } break;
    case 'orderly': g = grp(); if (g) { issueFormation(g, g.formation, c.on); g.cur = { type: 'form', kind: g.formation }; } break;
    case 'layers': g = grp(); if (g) { g.layers = c.n; if (g.orderly) { issueFormation(g, g.formation, true); g.cur = { type: 'form', kind: g.formation }; } } break;
    case 'follow': {   // 補給艦隊：跟隨某支艦隊（target＝艦隊 id，-1＝不跟隨）
      const f = fleets.find((o) => o.id === c.fleet);
      if (f && f.supply && f.side === c.side) { f.follow = c.target; f.aiS.goal = null; }
      break;
    }
    case 'move': {
      if (!c.auto) for (const q of list) if (q.fleet && q.fleet.supply) q.fleet.follow = -1;   // 直接下移動命令：取消跟隨
      // 好幾支部隊一起移動：不併成一支（避免散開的部隊被當成一個陣型旋轉），各自保持相對位置、用自己的速度（不必同時到達）
      const gs = c.width == null ? selGroups(list) : [];
      if (gs.length > 1) {
        const T = multiTargets(gs, c.x, c.z, c.H, c.y);
        gs.forEach((gg, k) => { if (!c.fromQueue) gg.queue = []; moveGroup(gg, T[k].x, T[k].z, T[k].H, { pivot: c.pivot, uturn: c.uturn, y: c.y != null ? T[k].y : null, P: c.P }); gg.cur = gg.plan ? { type: 'move', x: T[k].x, z: T[k].z } : null; });
        g = gs[0]; break;
      }
      g = grp(); if (g) { moveGroup(g, c.x, c.z, c.H, { pivot: c.pivot, width: c.width, uturn: c.uturn, y: c.y, P: c.P }); g.cur = g.plan || Math.abs((g.ayT || 0) - (g.ay || 0)) > 1 ? { type: 'move', x: c.x, z: c.z } : null; } break;
    }
    case 'face': g = grp(); if (g) faceGroup(g, Math.atan2(c.x - g.ax, c.z - g.az)); break;
    case 'alt': {
      // 只改高度（與俯仰）：水平的移動照常進行；多支部隊保持彼此的高度差
      if (opts.flat) break;   // 一般難度：艦隊都在同一平面
      const gs = selGroups(list); if (!gs.length) break;
      let cy = 0, n = 0; for (const gg of gs) { const w = Math.max(1, sumA(gg.sqs.map((q) => q.alive))); cy += (gg.ay || 0) * w; n += w; } cy /= n;
      for (const gg of gs) {
        if (!c.fromQueue) gg.queue = [];
        gg.ayT = Math.max(-ALT_MAX, Math.min(ALT_MAX, c.y + ((gg.ay || 0) - cy)));
        if (c.P != null) gg.pCmd = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, c.P));
        if (!gg.plan) gg.cur = { type: 'move', x: gg.ax, z: gg.az };
      }
      g = gs[0]; break;
    }
    case 'attack': {
      // 只指定射擊目標：不重新編組、不轉向、不變陣，也不取消隊列（陣型／移動是另一套命令）
      // 選的是整支部隊＝部隊目標；只選了其中幾支分艦隊＝只有它們改打這個目標
      const tq = squadrons[c.target];
      if (tq) for (const gg of new Set(list.map((q) => q.group).filter(Boolean))) {
        const mine = list.filter((q) => q.group === gg), whole = gg.sqs.filter((q) => q.alive > 0 && !q.bg).every((q) => set.has(q));
        if (whole) { gg.target = tq; for (const q of gg.sqs) q.atk = null; } else for (const q of mine) q.atk = tq;
        gg.area = null;   // 改打指定目標＝取消區域攻擊
        g = gg;
      }
      break;
    }
    case 'area': {   // 區域攻擊：選取的部隊對 (x, y, z) 開火 FOW_RULE.area.dur 秒（光束、飛彈、艦載機；射程內才打）；off＝取消
      for (const gg of new Set(list.map((q) => q.group).filter(Boolean))) { gg.area = c.off ? null : { x: c.x, y: c.y || 0, z: c.z, until: U.uTime.value + FOW_RULE.area.dur }; g = gg; }
      break;
    }
    case 'scan': { const f = fleets.find((o) => o.id === c.fleet && o.side === c.side); if (f) fowScan(f); break; }   // 舊的脈衝掃描命令（現在由自動掃描發出）
    case 'recon': {   // 區域掃描：航母派出偵察機到 (x, y, z)
      const f = fleets.find((o) => o.id === c.fleet && o.side === c.side), r = f ? launchRecon(f, { x: c.x, y: c.y || 0, z: c.z }) : 0;
      if (f && c.side === GAME.playerSide && !GAME.replaying && !GAME.watch && typeof toast === 'function')
        toast(r === 1 ? `${f.name}：偵察機起飛（區域掃描半徑 ${Math.round(fowReconR(f))}）` : r === -1 ? `${f.name}：沒有航母，不能派偵察機` : r === -2 ? '艦載機太多，偵察機沒有機位' : `${f.name}：偵察機冷卻中`, r === 1 ? '' : 'hint');
      break;
    }
    case 'autoscan': FOW.auto[c.side] = !!c.on; break;   // 自動掃描開關（記在命令裡，回放一致）
    case 'qedit': g = formGroup(list); if (g) editQueueNode(g, c); break;
    case 'turn': g = grp(); if (g) turn(g, c.d); break;
    case 'volley': volley(c.side, set); break;
    case 'missile': missileSalvo(c.side, set); break;
    case 'fighter': launchFighters(c.side, c.n || 8, set); break;
    case 'jam': setJam(c.target, c.dur, c.delay); break;
    case 'rule': opts[c.key] = c.value; if (c.key === 'altitude') simAlt = c.value ? 1 : 0; break;
    default: g = gameExec(c, list);   // 遊戲層的命令（技能等）
  }
  return g;
}
// ───── 戰術面板的節點編輯：節點＝正在前往的目的地（ref 'cur'）或隊列裡的移動（ref＝qid）─────
// 節點「附帶」的動作＝它後面、下一個移動之前的變陣（抵達該節點後執行）
let qidSeq = 0;   // 隊列項目的編號（每場重設，回放時編號一致）
const NODE_ATTACHED = { form: 1, orderly: 1, layers: 1, alt: 1 };
function editQueueNode(g, c) {
  const Q = g.queue || (g.queue = []);
  const cur = c.ref === 'cur', idx = cur ? -1 : Q.findIndex((it) => it.qid === c.ref);
  if (!cur && idx < 0) return;
  const it = cur ? null : Q[idx];
  let end = idx + 1; while (end < Q.length && Q[end].type !== 'move') end++;   // 附帶動作的範圍 (idx, end)
  const clampY = (y) => Math.max(-ALT_MAX, Math.min(ALT_MAX, Math.round(y))), clampP = (p) => Math.max(-PITCH_MAX, Math.min(PITCH_MAX, p));
  switch (c.op) {
    case 'pos':   // 平面位置
      if (it) Q[idx] = { ...it, x: c.x, z: c.z };
      else if (g.goal) { moveGroup(g, c.x, c.z, g.goal.H, { uturn: c.uturn != null ? c.uturn : opts.uturn }); g.cur = g.plan ? { type: 'move', x: c.x, z: c.z } : null; }
      break;
    case 'alt':   // 高度與仰角（cur 且沒有目的地＝原地）；節點上原本附帶的升降一併取代
      if (opts.flat) return;   // 一般難度：不能升降
      for (let i = end - 1; i > idx; i--) if (Q[i].type === 'alt') Q.splice(i, 1);
      if (it) Q[idx] = { ...it, ...(c.y != null ? { y: clampY(c.y) } : {}), ...(c.P != null ? { P: clampP(c.P) } : {}) };
      else {
        if (c.y != null) g.ayT = clampY(c.y);
        if (c.P != null) g.pCmd = clampP(c.P);
        if (!g.plan && Math.abs((g.ayT || 0) - (g.ay || 0)) > 1) g.cur = { type: 'move', x: g.ax, z: g.az };
      }
      break;
    case 'form': {   // 抵達後的陣型：kind＝null 表示不變陣
      let k = -1; for (let i = idx + 1; i < end; i++) if (Q[i].type === 'form') k = i;
      if (c.kind == null) { if (k >= 0) Q.splice(k, 1); }
      else if (!FORMATIONS[c.kind]) return;
      else if (k >= 0) Q[k] = { ...Q[k], kind: c.kind };   // 換新物件：預覽的排法快取跟著更新
      else Q.splice(idx + 1, 0, { type: 'form', kind: c.kind, qid: ++qidSeq });
      break;
    }
    case 'del': {   // 刪除節點（連同附帶的變陣、升降）；cur＝停止目前的移動，接著執行下一個節點
      const keep = Q.filter((x, i) => !(i > idx && i < end && NODE_ATTACHED[x.type]));
      if (it) keep.splice(keep.indexOf(it), 1);
      else if (g.goal) { moveGroup(g, g.ax, g.az, null); g.cur = null; }
      g.queue = keep;
      break;
    }
  }
}
// ───── 戰術隊列：前一個動作完成（抵達、變陣結束）才執行下一個 ─────
function groupIdle(g) {
  if (g.plan || g.inactive) return false;
  if (g.ayT != null && Math.abs(g.ayT - (g.ay || 0)) > 1) return false;   // 還在升降
  const t = U.uTime.value;
  for (const q of g.sqs) if (q.alive > 0 && (sqMorphing(q, t) || q.relayUntil > t)) return false;
  return true;
}
function runQueue(g) {
  let guard = 0;
  while (g.queue && g.queue.length && groupIdle(g) && guard++ < 8) {
    const it = g.queue.shift();
    const sqs = g.sqs.filter((q) => q.alive > 0).map((q) => squadrons.indexOf(q));
    if (!sqs.length) { g.queue.length = 0; return; }
    const g2 = execCommand({ ...it, tick: simTick, side: g.side, sqs, fromQueue: true });
    if (g2 && g2 !== g) { g2.queue = g.queue; g.queue = []; g = g2; }
  }
}
function processQueues() { for (const g of groups) { if (g.cur && groupIdle(g)) g.cur = null; if (g.queue && g.queue.length) runQueue(g); } }   // g.cur＝正在執行的命令（只給畫面標示用）
function stepSim() {
  if (simTick % FOW_RULE.tick === 0) { fowUpdate(); fowAutoScan(); }   // 戰爭迷霧：在 AI 想事情之前更新情報、自動掃描
  runCommands();
  processQueues();
  gameTick();          // AI、事件、勝負判定（在模擬裡，回放時會得到一樣的結果）
  simulate(SIM_DT);
  simTick++;
}
// 重開一場：同一個種子會得到同樣的開局
function newBattle(seed = battleSeed, setup = null) {
  battleSeed = seed >>> 0; rnd = mulberry32(battleSeed); qidSeq = 0;
  resetCombat();
  for (let i = 0; i < BEAM_MAX; i++) beamT[i * 4] = -999;
  beamHead = 0; beamDirtyFrom = 0; beamDirtyCount = BEAM_MAX;
  for (let i = 0; i < FX_MAX; i++) fxF[i * 4] = -999;
  fxHead = 0; fxDirtyFrom = 0; fxDirtyCount = FX_MAX;
  orderQueue.length = 0; jam[0] = { until: 0, delay: 0 }; jam[1] = { until: 0, delay: 0 }; jamSeen[0] = jamSeen[1] = null;
  for (const a of dmgStats) a.fill(0);
  dmgDealt.fill(0); ffStats.forEach((a) => a.fill(0)); ffHold.fill(0);
  beamPow.fill(0); beamShots.fill(0); beamLastT.fill(-99); hitAvg.fill(0); for (const g of gunStats) for (const k in g) g[k].fill(0); for (const a of airStats) a.shots = a.hits = 0; for (const f of ftrStats) f.fill(0); fireAcc = [0, 0]; aaAcc = 0;
  cmdQueue.length = 0; cmdLog.length = 0; simTick = 0; simAcc = 0; U.uTime.value = 0;
  simAlt = opts.altitude ? 1 : 0;
  battleRules = Object.fromEntries(SIM_RULES.map((k) => [k, opts[k]]));
  if (typeof selected !== 'undefined') selected.clear();
  buildFleets(setup || sandboxSetup());
  fowReset();
  if (setup && setup.jam) pushSquadronUniforms();   // 先算出分艦隊位置，干擾的「最後已知位置」才對
  if (setup && setup.jam) setup.jam.forEach((j, s) => { if (j && j[0] > 0) setJam(s, j[0], j[1]); });   // 模擬室接續：干擾剩下的時間
  if (typeof selectionChanged === 'function') selectionChanged();
}
// 戰局指紋：比對兩次模擬是否完全一致
function stateHash() {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h ^= (v | 0); h = Math.imul(h, 16777619) >>> 0; };
  for (let i = 0; i < shipCount; i += 3) { mix(ships.alive[i]); if (ships.alive[i]) { shipWorldCPU(i, _a); mix(Math.round(_a.x * 16)); mix(Math.round(_a.z * 16)); } }
  for (const g of groups) { mix(Math.round(g.ax * 64)); mix(Math.round(g.az * 64)); }
  for (const a of dmgStats) for (const v of a) mix(v);
  for (let j = 0; j < FTR_MAX; j += 7) mix(FT.state[j]);
  mix(simTick);
  return h.toString(16);
}
// 完整戰局指紋（存進戰績紀錄，回放結束時比對）：每艘船的存活、耐久、護盾、彈藥、補給存量、位置，部隊位置，艦載機狀態，干擾
function fullHash() {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h ^= (v | 0); h = Math.imul(h, 16777619) >>> 0; };
  for (let i = 0; i < shipCount; i++) {
    mix(ships.alive[i]); if (!ships.alive[i]) continue;
    mix(Math.round(ships.hp[i] * 8)); mix(Math.round(ships.sh[i] * 8)); mix(ships.ammo[i]); mix(ships.stock[i]);
    shipWorldCPU(i, _a); mix(Math.round(_a.x * 16)); mix(Math.round(_a.z * 16)); mix(Math.round(_a.y * 16));
  }
  for (const g of groups) { mix(Math.round(g.ax * 64)); mix(Math.round(g.az * 64)); }
  for (let j = 0; j < FTR_MAX; j++) if (FT.state[j]) { mix(j); mix(FT.state[j]); }
  for (const a of dmgStats) for (const v of a) mix(v);
  mix(Math.round(jam[0].until * 60)); mix(Math.round(jam[1].until * 60)); mix(simTick);
  return h.toString(16);
}
// 回放：用同樣的種子與規則重開，照紀錄的 tick 重新下命令
function replayBattle(log = cmdLog.slice(), rules = battleRules, seed = battleSeed, setup = battleSetup) {
  Object.assign(opts, { fow: false }, rules);   // 舊紀錄沒有戰爭迷霧
  newBattle(seed, setup);
  for (const c of log) cmdQueue.push({ ...c });
}

// ───────────────────────── 3D 模型模式 ─────────────────────────
// 與 2D 共用同一套模擬；這裡只負責每幀把艦艇位置寫成 3D 模型實例
let mode3D = false;
const R3 = { ready: false, models: {}, meshByKey: {}, list: [], version: -1, lodStats: [0, 0, 0, 0, 0], geomBytes: 0 };
const opts3 = { detail: 'auto', lodScale: 1 };
const LOD3_PX = [170, 55, 16, 2];   // 以 CSS px 計：艦長超過幾 px 用第 0/1/2/3 級
const TYPE_LEN3 = 1.0;       // 3D 艦長＝2D 貼圖寬 × 此值
const FTR_LEN3 = 1.8;

function b64ToBuf(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
// 解碼 3D 模型（船體、艦載機、武器共用；第一次用到才解）
const MODEL_CACHE = {};
// 模型由伺服器的模型資料夾提供：近距離（第 0 級）直接用 GLB 原檔（含原始貼圖），遠景各級用伺服器算好的簡化網格
const MODEL_SRC = {};   // key → { kind, geo0, tex, lods: [BufferGeometry…] }
const MODEL_LOAD = { done: false, err: [] };
async function loadAllModels(onProgress = () => {}) {
  const man = await (await fetch('api/models', { cache: 'no-cache' })).json();
  const keys = Object.keys(man.models), total = keys.reduce((a, k) => a + man.models[k].bytes + man.models[k].lodBytes, 0);
  let got = 0, n = 0;
  const loader = new GLTFLoader();
  const fetchBytes = async (url) => {   // 邊下載邊回報進度
    const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${url}：HTTP ${r.status}`);
    const rd = r.body.getReader(), parts = []; let len = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); len += value.length; got += value.length; onProgress(got / total, n, keys.length); }
    const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out.buffer;
  };
  const one = async (key) => {
    const m = man.models[key];
    try {
      const [glb, lodBin] = await Promise.all([fetchBytes(m.glb), fetchBytes(m.lod)]);
      const gltf = await loader.parseAsync(glb, '');
      let mesh = null; gltf.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
      if (!mesh) throw new Error('沒有網格');
      gltf.scene.updateMatrixWorld(true);
      const src = mesh.geometry, g0 = new THREE.BufferGeometry();
      for (const a of ['position', 'normal', 'uv']) if (src.attributes[a]) g0.setAttribute(a, src.attributes[a].clone());
      if (src.index) g0.setIndex(src.index.clone());
      g0.applyMatrix4(mesh.matrixWorld); g0.applyMatrix4(new THREE.Matrix4().fromArray(m.orient));
      if (!g0.attributes.normal) g0.computeVertexNormals();
      g0.computeBoundingSphere();
      const tex = mesh.material && mesh.material.map;
      if (tex) { tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace; }
      const lods = [g0, ...m.lods.map((L) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lodBin, L.pos, L.verts * 3), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(lodBin, L.uv, L.verts * 2), 2));
        g.setIndex(new THREE.BufferAttribute(L.idx32 ? new Uint32Array(lodBin, L.idx, L.idxCount) : new Uint16Array(lodBin, L.idx, L.idxCount), 1));
        g.computeVertexNormals(); g.computeBoundingSphere();
        return g;
      })];
      for (const g of lods) R3.geomBytes += g.attributes.position.count * 32 + (g.index ? g.index.count * 4 : 0);
      MODEL_SRC[key] = { kind: m.kind, tex, lods, min: m.min, max: m.max, name: m.name };
    } catch (e) { MODEL_LOAD.err.push(`${key}：${e.message}`); console.warn('模型載入失敗', key, e); }
    n++; onProgress(got / total, n, keys.length);
  };
  const queue = keys.slice(), workers = Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); });
  await Promise.all(workers);
  MODEL_LOAD.done = true;
  return MODEL_LOAD;
}
const NO_MODEL_TEX = (() => { const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); t.needsUpdate = true; return t; })();
function getModel(key) {
  if (MODEL_CACHE[key]) return MODEL_CACHE[key];
  const m = MODEL_SRC[key]; if (!m) return null;
  const tex = m.tex || NO_MODEL_TEX, weapon = m.kind === 'weapon';
  const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.35, roughness: 0.6, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: weapon ? 0.18 : 0.14 });
  return (MODEL_CACHE[key] = { lods: m.lods, mat, weapon, min: m.min, max: m.max, ready: Promise.resolve() });
}
function init3D() {
  if (R3.ready) return;
  for (const key in MODEL_SRC) R3.models[key] = getModel(key);
  // 燈光（只影響 3D 模型）
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0); sun.position.set(-0.6, 0.8, 0.35);
  R3.lights = [sun, new THREE.HemisphereLight(0x8fb2ff, 0x1a1020, 0.9), new THREE.AmbientLight(0x404858, 0.5)];
  for (const l of R3.lights) scene.add(l);
  // 依視線方向的星空（鏡頭可以自由轉）
  R3.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      float h31(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * n3(p); p *= 2.07; a *= .5; } return v; }
      float stars(vec3 d, float sc, float prob){ vec3 g = d * sc, id = floor(g), f = fract(g) - .5; float h = h31(id); if (h > prob) return 0.;
        vec3 o = vec3(h31(id + 3.1), h31(id + 7.7), h31(id + 1.3)) - .5; return smoothstep(.12, 0., length(f - o * .6)) * (.4 + .6 * h31(id + 9.1)); }
      void main(){
        vec3 d = normalize(vDir), col = vec3(.008, .011, .026);
        col += vec3(.16, .06, .22) * smoothstep(.5, .95, fbm(d * 2.2 + 4.1)) * .6;
        col += vec3(.03, .11, .17) * smoothstep(.52, .95, fbm(d * 3.7 + 11.)) * .5;
        col += vec3(.85, .9, 1.) * stars(d, 260., .045) * .8 + vec3(1., .95, .85) * stars(d, 90., .03) * 1.1;
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  R3.sky.frustumCulled = false; R3.sky.renderOrder = -20;
  scene.add(R3.sky);
  R3.ready = true;
}
// 艦種鍵（e0～e5／a0～a5，掛點用）與模型鍵（沒有自己模型的艦種借用 look 的模型，例如補給艦借巡洋艦）
function typeKey(i) { return (SIDE_FAC[ships.side[i]] ? 'a' : 'e') + ships.type[i]; }
function hullKey(i) { const k = typeKey(i), lk = SHIP_TYPES[ships.type[i]].look; return lk == null || R3.models[k] ? k : k[0] + lk; }
// 依目前艦艇數建立 (模型, 細節) 的 InstancedMesh
function rebuild3D() {
  for (const it of R3.list) { scene.remove(it.mesh); it.mesh.dispose(); }
  R3.list = []; R3.meshByKey = {};
  const cap = {};
  const capT = {};   // 依艦種（e0～e5／a0～a5）算船數；cap 是依模型（借用外觀的艦種算在被借的模型上）
  for (let i = 0; i < shipCount; i++) { const k = hullKey(i), tk = typeKey(i); cap[k] = (cap[k] || 0) + 1; capT[tk] = (capT[tk] || 0) + 1; }
  cap.ef = FTR_MAX; cap.af = FTR_MAX;
  // 武器：每艘船的掛點數 × 船數（只有細節夠的船才畫，但容量照最多的算）；借用外觀的艦種只畫被借模型上的防空砲
  R3.mounts = {};
  for (const tk of Object.keys(capT)) {
    const st = SHIP_TYPES[+tk.slice(1)], own = R3.models[tk] || st.look == null, src = own ? tk : tk[0] + st.look;
    let list = (typeof mountsOf === 'function' ? mountsOf(src) : []).map(mountMatrix).filter((m) => R3.models[m.wk]);
    if (!own) list = list.filter((m) => m.wk.endsWith('w3'));
    R3.mounts[tk] = list;
    for (const m of list) cap[m.wk] = (cap[m.wk] || 0) + capT[tk];
  }
  for (const key in cap) {
    const M = R3.models[key]; if (!M) continue;
    R3.meshByKey[key] = M.lods.map((g, lod) => {
      const mesh = new THREE.InstancedMesh(g, M.mat, Math.max(1, cap[key]));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 1;
      scene.add(mesh); R3.list.push({ key, lod, mesh });
      return mesh;
    });
  }
  R3.version = fleetVersion;
}
// 掛點 → 船體座標裡的 3×3（含尺寸）＋位移；旋轉＝先轉向 r（繞船的上方）再側傾 t（繞船的縱軸）
function mountMatrix(m) {
  const r = (m.r || 0) * Math.PI / 180, t = (m.t || 0) * Math.PI / 180, s = m.s || 0.1;
  const cr = Math.cos(r), sr = Math.sin(r), ct = Math.cos(t), st = Math.sin(t);
  return { wk: m.hk[0] + 'w' + m.w, o: m.p, small: s < 0.1, q: [ct * cr * s, st * cr * s, -sr * s, -st * s, ct * s, 0, ct * sr * s, st * sr * s, cr * s] };
}
const _fr = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sph = new THREE.Sphere();
const _WB = new Float64Array(6);
// 船上的武器：船的基底 × 掛點矩陣（船畫到第 2 級細節以內才畫武器，武器用同一級；第 2 級只畫大的）
function writeMounts(hk, lod, wl, x, y, z, fx, fy, fz, L) {
  const list = R3.mounts[hk]; if (!list || !list.length) return;
  const rx = _WB[0], ry = _WB[1], rz = _WB[2], ux = _WB[3], uy = _WB[4], uz = _WB[5];
  for (const m of list) {
    if (lod === 2 && m.small) continue;   // 遠一點的船只畫大砲塔，防空砲之類的小東西看不出來

    const mesh = R3.meshByKey[m.wk][wl]; if (!mesh || mesh.count >= mesh.instanceMatrix.count) continue;
    const q = m.q, o = m.o, e = mesh.instanceMatrix.array, k = mesh.count * 16;
    for (let c = 0; c < 3; c++) {
      const a = q[c * 3], b = q[c * 3 + 1], d = q[c * 3 + 2];
      e[k + c * 4] = (rx * a + ux * b + fx * d) * L; e[k + c * 4 + 1] = (ry * a + uy * b + fy * d) * L; e[k + c * 4 + 2] = (rz * a + uz * b + fz * d) * L; e[k + c * 4 + 3] = 0;
    }
    e[k + 12] = x + (rx * o[0] + ux * o[1] + fx * o[2]) * L; e[k + 13] = y + (ry * o[0] + uy * o[1] + fy * o[2]) * L; e[k + 14] = z + (rz * o[0] + uz * o[1] + fz * o[2]) * L; e[k + 15] = 1;
    mesh.count++;
  }
}
function writeMatrix(mesh, x, y, z, fx, fy, fz, L) {
  let ux = 0, uy = 1, uz = 0;
  let rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  ux = fy * rz - fz * ry; uy = fz * rx - fx * rz; uz = fx * ry - fy * rx;
  _WB[0] = rx; _WB[1] = ry; _WB[2] = rz; _WB[3] = ux; _WB[4] = uy; _WB[5] = uz;
  if (!mesh) return;
  const e = mesh.instanceMatrix.array, o = mesh.count * 16;
  e[o] = rx * L; e[o + 1] = ry * L; e[o + 2] = rz * L; e[o + 3] = 0;
  e[o + 4] = ux * L; e[o + 5] = uy * L; e[o + 6] = uz * L; e[o + 7] = 0;
  e[o + 8] = fx * L; e[o + 9] = fy * L; e[o + 10] = fz * L; e[o + 11] = 0;
  e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
  mesh.count++;
}
function update3D(cam = camera, vh = VH) {   // cam／vh：子畫面（其他旗艦視角）會用自己的鏡頭重算一次
  if (!mode3D || !R3.ready) return;
  if (R3.version !== fleetVersion) rebuild3D();
  for (const it of R3.list) it.mesh.count = 0;
  const st = R3.lodStats; st.fill(0);
  cam.updateMatrixWorld();
  _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pv);
  const ppuK = cam.projectionMatrix.elements[5] * 0.5 * vh;   // 不受渲染解析度影響
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  const t = U.uTime.value, forced = opts3.detail === 'auto' ? -1 : +opts3.detail;
  const scaleArr = shipGeo.getAttribute('aScale').array, info = shipGeo.getAttribute('aInfo').array;
  let pickPx = 0;
  const pick = (L, x, y, z) => {
    _sph.center.set(x, y, z); _sph.radius = L * 0.6;
    if (!_fr.intersectsSphere(_sph)) return -1;
    if (forced >= 0) return forced;
    const px = L * ppuK / Math.max(1, Math.hypot(x - cx, y - cy, z - cz)) / opts3.lodScale; pickPx = px;
    for (let k = 0; k < 4; k++) if (px >= LOD3_PX[k]) return k;
    return 4;
  };
  for (let i = 0; i < shipCount; i++) {
    if (!ships.alive[i]) continue;
    const sq = squadrons[ships.sq[i]];
    if (sq.hidden || (sq.bg && !opts.background) || fowHid[ships.sq[i]]) continue;   // 戰爭迷霧：看不到的敵軍不畫
    shipWorldCPU(i, _a);
    const seed = info[i * 4 + 3];
    // 與 2D 著色器相同的微幅漂浮
    _a.y += Math.sin(t * 0.6 + seed * 40) * 0.35;
    _a.x += Math.sin(t * 0.31 + seed * 17) * 0.25; _a.z += Math.cos(t * 0.27 + seed * 23) * 0.25;
    // 每艘船稍晚轉向（與 2D 相同的 lag），但角度是連續的
    const h = ships.snOn[i] ? ships.snH[i] : visHeading(sq, t, ships.lag[i]);
    const L = scaleArr[i] * TYPE_LEN3;
    const lod = pick(L, _a.x, _a.y, _a.z);
    if (lod < 0) continue;
    st[lod]++;
    if (lod > 3) continue;
    const pp = ships.snOn[i] ? 0 : (sq.p || 0), cpp = Math.cos(pp);   // 船身跟著陣型俯仰
    const hk = hullKey(i), ms = R3.meshByKey[hk], fx = Math.sin(h) * cpp, fy = Math.sin(pp), fz = Math.cos(h) * cpp;
    if (!ms) continue;
    writeMatrix(ms[lod], _a.x, _a.y, _a.z, fx, fy, fz, L);
    if (lod <= 2 && SETTINGS.weapons3D !== false) writeMounts(typeKey(i), lod, forced >= 0 ? Math.min(3, forced + 1) : pickPx > 1500 ? 0 : lod + 1, _a.x, _a.y, _a.z, fx, fy, fz, L);   // 武器細節：很近才用原檔，其餘比船低一級
  }
  // 艦載機：機首沿速度方向
  for (let j = 0; j < FTR_MAX; j++) {
    if (FT.state[j] !== 2 || (fowFtrOn && fowFtrHide[j])) continue;
    const j3 = j * 3, x = fP[j3], y = fP[j3 + 1], z = fP[j3 + 2];
    const lod = pick(FTR_LEN3, x, y, z);
    if (lod < 0 || lod > 3) continue;
    let vx = fV[j3], vy = fV[j3 + 1], vz = fV[j3 + 2]; const vl = Math.hypot(vx, vy, vz) || 1;
    writeMatrix(R3.meshByKey[SIDE_FAC[FT.side[j]] ? 'af' : 'ef'][lod], x, y, z, vx / vl, vy / vl, vz / vl, FTR_LEN3 * (FT.kind[j] ? 0.6 : 1));   // 維修機小一點
  }
  for (const it of R3.list) if (it.mesh.count) { const a = it.mesh.instanceMatrix; a.clearUpdateRanges && a.clearUpdateRanges(); a.addUpdateRange(0, it.mesh.count * 16); a.needsUpdate = true; }
}
// ── 戰爭迷霧的畫面遮罩（每幀算一次，只影響畫面）：fowHid[分艦隊]＝看不到；敵方艦載機在我方偵測範圍外＝不畫 ──
const fowHid = new Uint8Array(MAX_SQ), fowFtrHide = new Uint8Array(FTR_MAX);
let fowFtrOn = false;
function fowFrameMask() {
  const on = fowView();
  for (let i = 0; i < squadrons.length; i++) fowHid[i] = on && fowHidden(squadrons[i]) ? 1 : 0;
  fowFtrOn = on;
  if (!on) return;
  const me = GAME.playerSide, obs = fowObs(me), jm = jammed(me);
  const eyes = squadrons.filter((q) => q.side === me && fowLive(q) && (!jm || !obs || q.fleet === obs)).map((q) => [q.x, q.y || 0, q.z, fowSensor(q) ** 2]);
  let dirty = false;
  for (let j = 0; j < FTR_MAX; j++) {
    if (FT.state[j] !== 2 || FT.side[j] === me) { fowFtrHide[j] = 0; continue; }
    const x = fP[j * 3], y = fP[j * 3 + 1], z = fP[j * 3 + 2];
    let vis = 0; for (const e of eyes) if ((x - e[0]) ** 2 + (y - e[1]) ** 2 + (z - e[2]) ** 2 < e[3]) { vis = 1; break; }
    fowFtrHide[j] = vis ? 0 : 1;
    if (!vis && fI[j * 4 + 1] !== 0) { fI[j * 4 + 1] = 0; dirty = true; }   // 2D：狀態 0＝不畫（下一個模擬 tick 會重寫）
  }
  if (dirty) ftrAttrs.aFI.needsUpdate = true;
}
// 3D 場景：我方掃描的波紋（往外擴散的圈）、被敵方掃描到的方向（從艦隊中心往那個方向的虛線）
let fowFx = null;
function fowFxFrame() {
  if (!fowFx) { fowFx = { g: new THREE.Group(), rings: [], pings: [] }; fowFx.g.renderOrder = 6; scene.add(fowFx.g); }
  const on = fowView(), t = U.uTime.value, me = on ? GAME.playerSide : 0;
  const use =(arr, k, col) => { let l = arr[k]; if (!l) { l = lineObj(col, 0.8); arr.push(l); fowFx.g.add(l); } l.visible = true; return l; };
  let nr = 0, np = 0;
  if (on) {
    for (const s of FOW.scans) {
      if (s.side !== me) continue;
      const u = Math.min(1, (t - s.t) / 1.5); if (u >= 1) continue;
      const l = use(fowFx.rings, nr++, 0x8ce6ff), R = FOW_RULE.scanR * u, pts = [];
      for (let k = 0; k <= 64; k++) pts.push([s.x + Math.cos(k / 64 * TAU) * R, s.z + Math.sin(k / 64 * TAU) * R, s.y]);
      l.material.color.set(s.jam ? 0xff8c78 : 0x8ce6ff); l.material.opacity = (1 - u) * 0.85; setPts(l, pts);
    }
    for (const j of aliveF[me]) {   // 我方偵察機的掃描區域（水平的圈）
      if (FT.kind[j] !== 2 || FT.ret[j]) continue;
      const l = use(fowFx.rings, nr++, 0x8ce6ff), R = FT.heal[j], pts = [];
      for (let k = 0; k <= 64; k++) pts.push([FT.ax[j] + Math.cos(k / 64 * TAU) * R, FT.az[j] + Math.sin(k / 64 * TAU) * R, FT.ay[j]]);
      l.material.color.set(0x8ce6ff); l.material.opacity = FT.tk[j] === 1 ? 0.75 : 0.35; setPts(l, pts);
    }
    for (const p of FOW.pings[me]) {
      const f = fleets.find((o) => o.id === p.fleet), al = f ? f.sqs.filter((q) => fowLive(q)) : []; if (!al.length) continue;
      const C = centerOf(al), L = 700, l = use(fowFx.pings, np++, 0xffd27a);
      l.material.opacity = 0.8 * (1 - (t - p.t) / FOW_RULE.ping);
      setPts(l, [[C.x, C.z, C.y], [C.x + Math.sin(p.a) * L, C.z + Math.cos(p.a) * L, C.y]]);
    }
  }
  for (let k = nr; k < fowFx.rings.length; k++) fowFx.rings[k].visible = false;
  for (let k = np; k < fowFx.pings.length; k++) fowFx.pings[k].visible = false;
}
function apply3DVisibility() {
  if (shipMesh) shipMesh.visible = !mode3D;
  ftrSpriteMesh.visible = !mode3D;
  bgMesh.visible = !mode3D;
  if (R3.ready) { R3.sky.visible = mode3D; for (const it of R3.list) it.mesh.visible = mode3D; for (const l of R3.lights) l.visible = mode3D; }
  glowMat.uniforms.u3D.value = mode3D ? 1 : 0;
}

// ───────────────────────── 後處理 ─────────────────────────
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.35, 0.85);
// 泛光前先「消毒」：NaN／Inf 歸零、過亮像素柔性壓縮，避免泛光把壞像素擴散成方塊
const sanitizePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uMax: { value: 4.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uMax; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.);
      c = max(c, vec3(0.));
      float m = max(c.r, max(c.g, c.b));
      if (m > 1.0) c *= (1.0 + log(m)) / m;      // 高光對數壓縮，保留顏色
      gl_FragColor = vec4(min(c, vec3(uMax)), 1.);
    }`,
});
composer.addPass(renderPass);
composer.addPass(sanitizePass);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function resize() {
  // 戰術面板開著時，戰場畫面讓出空間（不被蓋住）：桌機在右側，窄螢幕在下方
  const tw = tacDockSize();
  VW = innerWidth - tw.w; VH = innerHeight - tw.h;
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
  document.body.style.setProperty('--vw', VW + 'px'); document.body.style.setProperty('--vh', VH + 'px');
  document.body.style.setProperty('--tacw', tw.w + 'px'); document.body.style.setProperty('--tach', (BR.on && TAC.open ? bridgeConsoleH() : tw.h) + 'px');
  const w = VW, h = VH;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  U.uRes.value.set(w * pr, h * pr);
  updateCamera();
}
addEventListener('resize', resize);

// ───────────────────────── GPU 量測 ─────────────────────────
// 用 EXT_disjoint_timer_query_webgl2 量每一幀 GPU 實際花的時間（不受 CPU 影響）
renderer.info.autoReset = false;
const gl = renderer.getContext();
const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const gpuName = (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })();
const queries = [];
let gpuMsAvg = -1, wallAvg = -1, lastWall = -1;
function gpuBegin() {
  if (!tq || queries.length > 6) return null;
  const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); return q;
}
function gpuEnd(q) { if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); queries.push(q); } }
function gpuPoll() {
  while (queries.length) {
    const q = queries[0];
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
    if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) {
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gpuMsAvg = gpuMsAvg < 0 ? ms : gpuMsAvg * 0.9 + ms * 0.1;
    }
    gl.deleteQuery(q); queries.shift();
  }
}
// 顯存估計：貼圖（含 mipmap）＋渲染目標＋泛光鏈＋畫布＋實例資料
function vramEstimateMB() {
  const v = new THREE.Vector2(); renderer.getDrawingBufferSize(v);
  const px = v.x * v.y;
  const tex = (4096 * 1024 + 2048 * 2304) * 4 * 4 / 3;
  const samples = composer.renderTarget1.samples || 0;
  const oneRT = px * 8 * (samples > 0 ? samples + 1 : 1) + px * 4 * Math.max(1, samples); // 半精度色彩（MSAA＋resolve）＋深度
  const bloom = opts.bloom ? px * 8 * (0.25 + 2 * 0.25 * 4 / 3) : 0;
  const canvasBuf = px * 4 * 2 + px * 4;
  const inst = (shipCount * 10 + BEAM_MAX * 10 + FX_MAX * 7) * 4;
  const t3 = R3.ready ? Object.keys(R3.models).length * 1024 * 1024 * 4 * 4 / 3 + R3.geomBytes + R3.list.reduce((a, it) => a + it.mesh.instanceMatrix.array.byteLength, 0) : 0;
  return (tex + oneRT * 2 + bloom + canvasBuf + inst + t3) / 1048576;
}
let resScale = 1;
function applyResolution() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * resScale);
  resize();
}
function setMSAA(on) {
  for (const t of [composer.renderTarget1, composer.renderTarget2]) { t.samples = on ? 4 : 0; t.dispose(); }
}

// ───────────────────────── 操作 ─────────────────────────
const $ = (id) => document.getElementById(id);
let cmdSide = 0;                 // 目前指揮的陣營
const selected = new Set();      // 選取中的分艦隊
let paused = false;
const SPEEDS = [0.5, 1, 2, 4, 8];
let speedIdx = 1;
const keysDown = new Set();

// ── 地面拾取 ──
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ndc = new THREE.Vector2();
function groundAt(cx, cy, y = 0) {   // y：在這個高度的水平面上取點（3D：用選取部隊的高度）
  _ndc.set((cx / VW) * 2 - 1, -(cy / VH) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const p = new THREE.Vector3();
  groundPlane.constant = -y;
  const hit = raycaster.ray.intersectPlane(groundPlane, p);
  groundPlane.constant = 0;
  return hit ? p : null;
}
function screenOf(x, y, z) { proj.set(x, y, z).project(camera); if (proj.z > 1) return [-1e5, -1e5, proj.z]; return [(proj.x * 0.5 + 0.5) * VW, (-proj.y * 0.5 + 0.5) * VH, proj.z]; }   // 在鏡頭後面（指揮官視角）＝畫面外
function squadronAt(cx, cy) {
  let best = null, bestArea = 1e12;
  for (const sq of squadrons) {
    if (sq.bg || sq.alive <= 0 || fowHidden(sq)) continue;   // 戰爭迷霧：看不到的點不到
    const p = groundAt(cx, cy, sq.y || 0); if (!p) continue;   // 3D：在每支分艦隊自己的高度上判斷
    const dx = p.x - sq.x, dz = p.z - sq.z;
    const u = dx * Math.cos(sq.h) - dz * Math.sin(sq.h), v = dx * Math.sin(sq.h) + dz * Math.cos(sq.h);
    if (Math.abs(u) <= sq.W / 2 + 6 && Math.abs(v) <= sq.D / 2 + 6 && sq.W * sq.D < bestArea) { best = sq; bestArea = sq.W * sq.D; }
  }
  if (best) return best;
  // 退而求其次：畫面上離中心最近、30px 內
  let bd = 30 * 30;
  for (const sq of squadrons) {
    if (sq.bg || sq.alive <= 0 || fowHidden(sq)) continue;
    const [sx, sy] = screenOf(sq.x, sq.y || 0, sq.z), d = (sx - cx) ** 2 + (sy - cy) ** 2;
    if (d < bd) { bd = d; best = sq; }
  }
  return best;
}

// ── 選取 ──
function sideSquadrons(sd) { return squadrons.filter((q) => !q.bg && q.side === sd && q.alive > 0); }
function setSelection(list, add = false) {
  if (GAME.phase === 'battle' || GAME.phase === 'deploy') list = list.filter((q) => q.side === GAME.playerSide && !q.bg);   // 作戰中只能選自己的
  if (!add) selected.clear();
  for (const q of list) {
    if (q.side !== cmdSide) { selected.clear(); setCmdSide(q.side, false); }
    selected.add(q);
  }
  selectionChanged();
}
function toggleSelect(q) {
  if ((GAME.phase === 'battle' || GAME.phase === 'deploy') && q.side !== GAME.playerSide) return;
  if (q.side !== cmdSide) { setSelection([q]); return; }
  if (selected.has(q)) selected.delete(q); else selected.add(q);
  selectionChanged();
}
function clearSelection() { selected.clear(); selectionChanged(); }
// 作戰中點選：第一次點＝整支艦隊；整支艦隊已選取時再點其中一支＝只選那支分艦隊（可單獨下陣型、移動、攻擊）；
// 只選著那支時再點＝回到整支艦隊。Alt＋點＝直接選分艦隊
function fleetUnit(q) { return GAME.phase !== 'sandbox' && q.fleet ? q.fleet.sqs.filter((x) => x.alive > 0 && !x.bg) : [q]; }
function pickUnit(q, alt) {
  const all = fleetUnit(q);
  if (alt || all.length <= 1) return [q];
  const fleetSel = selected.size === all.length && all.every((x) => selected.has(x));
  return fleetSel ? [q] : all;
}
// 指令對象：有選取就用選取，沒有就是整支艦隊
function actOn() { const l = [...selected].filter((q) => q.alive > 0); return l.length ? l : sideSquadrons(cmdSide); }
function actSet() { return new Set(actOn()); }
function selectionChanged() {
  for (const q of squadrons) q.label && q.label.classList.toggle('sel', selected.has(q));
  refreshFormationUI && refreshFormationUI();
  updateSelBar();
}
function setCmdSide(sd, selectAll = true) {
  cmdSide = sd; applyPlayerTheme();
  $('panel').classList.toggle('cmd1', sd === 1);
  document.querySelectorAll('#seg-side button').forEach((b) => b.classList.toggle('on', +b.dataset.side === sd));
  if (selectAll) { selected.clear(); for (const q of sideSquadrons(sd)) selected.add(q); selectionChanged(); }
}
function updateSelBar() {
  const l = [...selected];
  const el = $('selbar');
  if (!l.length) { el.innerHTML = `<span class="dim">未選取 · 指令會套用到整支${FACTION[SIDE_FAC[cmdSide]].name}</span>`; return; }
  const n = l.reduce((s, q) => s + q.alive, 0) * opts.rep;
  const g = l[0].group, same = l.every((q) => q.group === g);
  const names = l.length <= 3 ? l.map((q) => q.name).join('、') : `${l.length} 支分艦隊`;
  let html = `<b class="s${SIDE_FAC[cmdSide]}">${FACTION[SIDE_FAC[cmdSide]].name}</b> ${names} <span class="dim">${n.toLocaleString()} 艘</span>`;
  if (same && g) {
    html += ` · ${FORMATIONS[g.formation].name}${g.orderly ? '（整齊）' : ''}`;
    if (g.target) html += ` · <span class="tgt">目標：${FACTION[SIDE_FAC[g.target.side]].name} ${g.target.name}</span>`;
  }
  el.innerHTML = html;
}

// ── 指令：UI 只負責把操作轉成命令 ──
function sqIds(list = actOn()) { return list.map((q) => squadrons.indexOf(q)); }
// 按住 Shift（觸控：「隊列」按鈕）＝排進戰術隊列，等前面的動作完成才執行
let queueToggle = false;
function queueMode() { const m = SETTINGS.queueMod; return queueToggle || keysDown.has(m + 'Left') || keysDown.has(m + 'Right'); }
function sendCmd(type, args) {
  if (queueMode()) { const { sqs, ...item } = args; return issue('queue', { sqs, item: { type, ...item } }); }
  return issue(type, args);
}
function cmdFormation(kind) { sendCmd('form', { sqs: sqIds(), kind }); updateSelBar(); }
function cmdOrderly(on) { sendCmd('orderly', { sqs: sqIds(), on }); updateSelBar(); }
function cmdLayers(n) { sendCmd('layers', { sqs: sqIds(), n }); }
// 移動到 p；H＝到達時的朝向（null＝不變）；pivot＝強制原地轉向
function cmdMoveTo(p, H = null, pivot = false, width = null, v3 = null) {
  if (!p || !actOn().length) return;
  sendCmd('move', { sqs: sqIds(), x: p.x, z: p.z, H, pivot, width, uturn: opts.uturn, ...(v3 && v3.y != null ? { y: Math.round(v3.y) } : {}), ...(v3 && v3.P != null ? { P: v3.P } : {}) });
}
function cmdAlt(y, P = null) { if (!actOn().length) return; sendCmd('alt', { sqs: sqIds(), y: Math.round(y), ...(P != null ? { P } : {}) }); }
function cmdAttack(target) { sendCmd('attack', { sqs: sqIds(), target: squadrons.indexOf(target) }); updateSelBar(); }
function cmdTurn(d) { sendCmd('turn', { sqs: sqIds(), d }); }
function cmdVolley() { sendCmd('volley', { sqs: sqIds() }); }
function cmdMissile() { sendCmd('missile', { sqs: sqIds() }); }   // 層數、轉向、齊射都可以排進隊列（按住隊列鍵）
function cmdFighter() { issue('fighter', { sqs: sqIds(), n: 8 }); }
function cmdArea(p) { sendCmd('area', { sqs: sqIds(), x: Math.round(p.x), y: Math.round(p.y != null ? p.y : selAlt()), z: Math.round(p.z) }); updateSelBar(); }
// 區域掃描：選取的（沒選＝任一支）有航母、冷卻好的艦隊；接著點地圖上的位置（高度＝選取部隊的高度）
function reconFleet(f) {
  if (f) return f;
  const ok = (o) => o && o.side === cmdSide && !o.reserve && fowHasCarrier(o);
  const sel = [...selected].map((q) => q.fleet).filter(ok);
  return sel.find((o) => fowReconLeft(o) <= 0) || fleets.find((o) => ok(o) && fowReconLeft(o) <= 0) || sel[0] || fleets.find(ok) || null;
}
function armRecon(f) {
  if (GAME.phase !== 'battle') return;
  if (!fowOn()) { toast('只有擬真難度開啟戰爭迷霧時才需要掃描', 'hint'); return; }
  f = reconFleet(f);
  if (!f) { toast('沒有航母：區域掃描要由航母派出偵察機', 'hint'); return; }
  const cd = fowReconLeft(f); if (cd > 0) { toast(`${f.name}：偵察機冷卻中（${Math.ceil(cd)} 秒）`, 'hint'); return; }
  GAME.skillArm = { recon: true, point: true, f };
  hint(`區域掃描：${f.name}的航母派出偵察機。左鍵點地圖上要掃描的位置（半徑 ${Math.round(fowReconR(f))}，盤旋 ${FOW_RULE.recon.loiter} 秒）（右鍵或 Esc 取消）`);
}
function cmdRecon(f, p) { issue('recon', { fleet: f.id, x: Math.round(p.x), y: Math.round(p.y != null ? p.y : selAlt()), z: Math.round(p.z) }); }
function cmdAutoScan(on) { issue('autoscan', { on }); SETTINGS.autoScan = on; saveSettings(); }
function cmdJam() { issue('jam', { target: 1 - cmdSide, dur: SKILLS.jam.dur, delay: 6 }); }   // 測試場：與技能「干擾」相同
function setRule(key, value) { issue('rule', { key, value }); }
// 畫陣線：第一步 A→B 決定位置與寬度；第二步指定面向線的哪一側（預設：最近的敵軍那一側）
function lineNormal(A, B) { const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1; return [dz / L, -dx / L]; }
function defaultLineSide(A, B) {
  const [nx, nz] = lineNormal(A, B), mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
  let best = null, bd = 1e18;
  for (const q of sideSquadrons(1 - cmdSide)) { const d = (q.x - mx) ** 2 + (q.z - mz) ** 2; if (d < bd) { bd = d; best = q; } }
  if (best) return (best.x - mx) * nx + (best.z - mz) * nz >= 0 ? 1 : -1;
  const c = camGround(); return nx * c.fx + nz * c.fz >= 0 ? 1 : -1;
}
function lineHeading(A, B, side) { const [nx, nz] = lineNormal(A, B); return Math.atan2(nx * side, nz * side); }
function cmdLine(A, B, side, pivot = false) {
  if (!A || !B) return;
  if (side == null) side = defaultLineSide(A, B);
  cmdMoveTo({ x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, lineHeading(A, B, side), pivot, Math.hypot(B.x - A.x, B.z - A.z));
}

// ── 高度標示（3D）：每支分艦隊往基準面（y＝0）畫一條垂直線＋十字，2D 畫面也看得出誰在上、誰在下 ──
const STALK_MAX = MAX_SQ * 6;
const stalkGeo = new THREE.BufferGeometry();
stalkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STALK_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
stalkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(STALK_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
const stalks = new THREE.LineSegments(stalkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }));
stalks.frustumCulled = false; stalks.renderOrder = 4; scene.add(stalks);
const _stc = new THREE.Color();
function updateStalks() {
  const P = stalkGeo.attributes.position.array, C = stalkGeo.attributes.color.array; let n = 0;
  const put = (x, y, z) => { P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z; C[n * 3] = _stc.r; C[n * 3 + 1] = _stc.g; C[n * 3 + 2] = _stc.b; n++; };
  for (const q of squadrons) {
    if (q.bg || q.hidden || q.alive <= 0 || Math.abs(q.y || 0) < 8 || n + 6 > STALK_MAX || fowHidden(q)) continue;
    _stc.set(FACTION[SIDE_FAC[q.side]].ui);
    put(q.x, q.y, q.z); put(q.x, 0, q.z); put(q.x - 9, 0, q.z); put(q.x + 9, 0, q.z); put(q.x, 0, q.z - 9); put(q.x, 0, q.z + 9);
  }
  stalkGeo.setDrawRange(0, n); stalkGeo.attributes.position.needsUpdate = stalkGeo.attributes.color.needsUpdate = n > 0;
}
// ── 預覽與標記（畫在地面上） ──
function lineObj(color, opacity = 0.9) {
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
  const l = new THREE.Line(new THREE.BufferGeometry(), m);
  l.renderOrder = 6; l.frustumCulled = false;
  return l;
}
let PTS_Y = 0.5;   // 沒有給高度的點畫在這個高度
function setPts(line, pts, y = PTS_Y) { line.geometry.setFromPoints(pts.map(([x, z, py]) => new THREE.Vector3(x, py != null ? py : y, z))); }
function footprintPts(cx, cz, H, W, D) {
  const fx = Math.sin(H), fz = Math.cos(H), rx = Math.cos(H), rz = -Math.sin(H);
  const c = (u, v) => [cx + rx * u + fx * v, cz + rz * u + fz * v];
  return { box: [c(-W / 2, -D / 2), c(W / 2, -D / 2), c(W / 2, D / 2), c(-W / 2, D / 2), c(-W / 2, -D / 2)],
    arrow: [c(-W * 0.08, D / 2 + 6), c(0, D / 2 + 6 + Math.min(40, W * 0.12)), c(W * 0.08, D / 2 + 6)] };
}
const preview = new THREE.Group();
const pvLine = lineObj(0xffffff, 0.95), pvBox = lineObj(0xffffff, 0.45), pvArrow = lineObj(0xffffff, 0.95), pvPath = lineObj(0xffffff, 0.5), pvAlt = lineObj(0xffffff, 0.95);
pvAlt.visible = false;
preview.add(pvLine, pvBox, pvArrow, pvPath, pvAlt); preview.visible = false; scene.add(preview);
// 預覽用的部隊：選取的分艦隊若還沒編組，就用它們的中心與平均朝向估算（不真的編組）
function previewGroup() {
  const list = actOn(); if (!list.length) return null;
  const g0 = list[0].group;
  if (g0 && g0.sqs.length === list.length && list.every((q) => q.group === g0)) return { g: g0, ...groupExtents(g0) };
  let sx = 0, sz = 0, ss = 0, sc = 0;
  for (const q of list) { sx += q.x; sz += q.z; ss += Math.sin(q.h); sc += Math.cos(q.h); }
  const H = Math.atan2(ss, sc), ax = sx / list.length, az = sz / list.length;
  const fx = Math.sin(H), fz = Math.cos(H), rx = Math.cos(H), rz = -Math.sin(H);
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const q of list) {
    const u = (q.x - ax) * rx + (q.z - az) * rz, v = (q.x - ax) * fx + (q.z - az) * fz;
    u0 = Math.min(u0, u - q.W1 / 2); u1 = Math.max(u1, u + q.W1 / 2); v0 = Math.min(v0, v - q.D1 / 2); v1 = Math.max(v1, v + q.D1 / 2);
  }
  const g = { ax, az, from: H, to: H, dur: 0, sqs: list, formation: g0.formation, orderly: g0.orderly, layers: g0.layers || 1 };
  return { g, W: u1 - u0, D: v1 - v0, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2 };
}
// 畫成橫陣後的大小（與 genFormation 的估算一致）
function lineFootprint(pg, width) {
  const g = pg.g, total = g.sqs.reduce((s, q) => s + q.list.length, 0);
  const area = total * (g.orderly ? (ORDER_SPACING[g.layers || 1] ** 2) / (g.layers || 1) : SHIP_AREA);
  const W = Math.min(Math.max(width, Math.sqrt(area * 1.5)), Math.sqrt(area * 40));
  return { W, D: area / (0.927 * W) };
}
function drawPreview(pg, P, H1, pivot, W, D, cu, cv, stroke) {
  const plan = planMove(pg.g, P, H1, pivot, pg);
  const col = new THREE.Color(FACTION[SIDE_FAC[cmdSide]].ui);
  for (const l of [pvLine, pvBox, pvArrow, pvPath]) l.material.color.copy(col);
  const pts = planPoints(plan.segs, 0, 0, plan.kind === 'snake' ? null : [pg.g.ax, pg.g.az]);
  pvPath.visible = pts.length >= 2; if (pvPath.visible) setPts(pvPath, pts);
  pvLine.visible = !!stroke; if (stroke) setPts(pvLine, stroke);
  const H = plan.H1, fp = footprintPts(P.x + Math.cos(H) * cu + Math.sin(H) * cv, P.z - Math.sin(H) * cu + Math.cos(H) * cv, H, W, D);
  setPts(pvBox, fp.box); setPts(pvArrow, fp.arrow);
  preview.visible = true;
  return plan;
}
function planLabel(plan) {
  if (plan.kind === 'pivot') return plan.segs.length ? '原地轉向＋移動' : '原地轉向';
  if (plan.kind === 'snake') return '蛇行迴轉';
  if (plan.kind === 'scatter') return '打散迴轉、到點重組';
  if (!plan.segs.length) return '轉向';
  const c = lineMul(plan.segs[0], plan.H0);
  return c < 0.56 ? '倒退' : c < 0.9 ? '側移' : '前進';
}
function hidePreview() { preview.visible = false; pvAlt.visible = false; pvBox.visible = pvArrow.visible = pvPath.visible = true; }
// 目的地標記與剩下的路徑：部隊抵達前一直顯示
// ── 鏡頭 ──
// 鏡頭在地面上的右方與前方（前方＝遠離鏡頭）
function camGround() { const y = view.yaw; return { rx: Math.cos(y), rz: -Math.sin(y), fx: -Math.sin(y), fz: -Math.cos(y), sp: Math.max(0.25, Math.sin(view.pitch)) }; }
function panBy(dxPx, dyPx) {
  if (BR.on) { bridgeLookPx(-dxPx, -dyPx); return; }   // 指揮官視角：拖曳＝轉頭（抓著景物拖）
  const upp = view.height / VH, c = camGround();
  view.target.x += -c.rx * dxPx * upp + c.fx * dyPx * upp / c.sp;
  view.target.z += -c.rz * dxPx * upp + c.fz * dyPx * upp / c.sp;
  camAnim = null;
  updateCamera();
}
function zoomAt(k, cx, cy) {
  if (BR.on) { bridgeWheel(Math.log(k)); return; }   // 指揮官視角：滾輪＝抬頭／低頭（低頭＝戰術台）
  const ndcX = (cx / VW) * 2 - 1, ndcY = -(cy / VH) * 2 + 1;
  const aspect = VW / VH, before = view.height, c = camGround();
  view.height = THREE.MathUtils.clamp(view.height * k, mode3D ? 6 : view.minH, view.maxH);
  const dh = before - view.height;
  view.target.x += c.rx * ndcX * dh * 0.5 * aspect + c.fx * ndcY * dh * 0.5 / c.sp;
  view.target.z += c.rz * ndcX * dh * 0.5 * aspect + c.fz * ndcY * dh * 0.5 / c.sp;
  camAnim = null;
  updateCamera();
}
function orbitBy(dYaw, dPitch) {
  if (BR.on) { BR.kYaw -= dYaw; BR.tPitch = bridgeClampPitch(BR.tPitch - dPitch); return; }
  if (!mode3D) return;
  view.yaw += dYaw;
  view.pitch = THREE.MathUtils.clamp(view.pitch + dPitch, 3 * Math.PI / 180, 89 * Math.PI / 180);
  camAnim = null;
  updateCamera();
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (ms && (ms.mode === 'rpress' || ms.mode === 'raim') && !BR.on) { altWheel(ms, e.deltaY, pitchHeld()); return; }
  if (GAME.phase === 'deploy' && GAME.drag && !GAME.drag.touch) { deployWheel(e.deltaY); return; }   // 部署：右鍵按住轉滾輪＝起始高度   // 右鍵按住：滾輪＝目的地高度，Shift＝俯仰
  zoomAt(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY);
}, { passive: false });
// ───── 3D：高度與俯仰的下令 ─────
// 選取部隊目前的平均高度（右鍵就在這個高度的水平面上取點，游標才會對準部隊）
// 仰角鍵（預設 Z）：右鍵按住時按著它轉滾輪＝調整仰角（這時不會觸發齊射）
function pitchHeld() { return keyHeld('pitch_mod'); }
function altHelp() { return `滾輪：高度　${keyLabel(keyOf('pitch_mod'))}＋滾輪：仰角`; }
function rightDragging() { return (ms && (ms.mode === 'rpress' || ms.mode === 'raim')) || (typeof TAC !== 'undefined' && TAC.drag && (TAC.drag.kind === 'right' || TAC.drag.kind === 'sright')) || (GAME.phase === 'deploy' && GAME.drag && !GAME.drag.touch); }
function selAlt() { const l = actOn(); if (!l.length) return 0; let s = 0; for (const q of l) s += q.group ? (q.group.ay || 0) : (q.y || 0); return s / l.length; }
function selPitch() { const l = actOn(); return l.length && l[0].group ? (l[0].group.pCmd || 0) : 0; }
const ALT_STEP = 20, PITCH_STEP = 5 * Math.PI / 180;
function altWheel(m, deltaY, shift) {
  if (opts.flat) { hint('一般難度：艦隊都在同一平面，不能調高度'); return; }
  const k = deltaY < 0 ? 1 : -1;   // 往上捲＝升高／抬頭
  if (shift) m.dp = Math.max(-PITCH_MAX - selPitch(), Math.min(PITCH_MAX - selPitch(), (m.dp || 0) + k * PITCH_STEP));
  else m.dy = Math.max(-ALT_MAX - m.alt0, Math.min(ALT_MAX - m.alt0, (m.dy || 0) + k * ALT_STEP));
  if (m.mode === 'raim' && m.cx != null) dragPreview(m.A, groundAt(m.cx, m.cy, m.alt0), false, '', m);
  else altPreview(m);
}
function alt3(m) { if (!m) return null; const o = {}; if (m.dy) o.y = m.alt0 + m.dy; if (m.dp) o.P = selPitch() + m.dp; return o.y != null || o.P != null ? o : null; }
function altText(m) { const y = m.alt0 + (m.dy || 0), p = Math.round((selPitch() + (m.dp || 0)) * 180 / Math.PI); return `高度 ${y > 0 ? '+' : ''}${Math.round(y)}${m.dy ? `（${m.dy > 0 ? '+' : ''}${m.dy}）` : ''}・仰角 ${p > 0 ? '+' : ''}${p}°`; }
// 只按住右鍵、還沒拖曳：畫高度柱
function altPreview(m) {
  if (!m || !m.A) return;
  const y1 = m.alt0 + (m.dy || 0), col = new THREE.Color(FACTION[SIDE_FAC[cmdSide]].ui);
  pvAlt.material.color.copy(col); setPts(pvAlt, [[m.A.x, m.A.z, m.alt0], [m.A.x, m.A.z, y1], [m.A.x - 8, m.A.z, y1], [m.A.x + 8, m.A.z, y1]]);
  pvAlt.visible = true; preview.visible = true; pvBox.visible = pvArrow.visible = pvPath.visible = pvLine.visible = false;
  hint(`${altText(m)} · 放開移動（${altHelp()}）`);
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ── 滑鼠 ──
// 右鍵點：移動（朝向不變）；右鍵拖曳：按下處＝目的地，拖曳方向＝到達後的朝向
// Ctrl＋右鍵拖曳：畫陣線 → 放開後移動滑鼠選擇面向哪一側，點擊確認
const boxEl = $('boxsel');
let ms = null;   // { mode, x0, y0, A }
let aim = null;  // 畫陣線第二步：{ A, B, side, touch }
function hint(text) { const el = $('touchhint'); el.textContent = text; el.classList.add('on'); }
function hideHint() { $('touchhint').classList.remove('on'); }
function dragPreview(A, cur, pivot, suffix, m = null) {
  const pg = previewGroup(); if (!pg || !A) return;
  const H1 = cur && Math.hypot(cur.x - A.x, cur.z - A.z) > 2 ? Math.atan2(cur.x - A.x, cur.z - A.z) : null;
  const y0 = m ? m.alt0 : 0, y1 = m ? m.alt0 + (m.dy || 0) : 0.5;
  PTS_Y = y1 + 0.5;   // 預覽框畫在目的地高度
  pvBox.visible = pvArrow.visible = true;
  const plan = drawPreview(pg, A, H1, pivot, pg.W, pg.D, pg.cu, pg.cv, cur ? [[A.x, A.z], [cur.x, cur.z]] : null);
  PTS_Y = 0.5;
  if (m) { setPts(pvAlt, [[A.x, A.z, y0], [A.x, A.z, y1]]); pvAlt.material.color.copy(pvBox.material.color); pvAlt.visible = Math.abs(y1 - y0) > 1; }
  hint(`${planLabel(plan)}${m ? '・' + altText(m) : ''} · 放開下令${pivot ? '' : suffix}${m ? `（${altHelp()}）` : ''}`);
}
function lineAimPreview(a, pivot, text) {
  const pg = previewGroup(); if (!pg) return;
  const f = lineFootprint(pg, Math.hypot(a.B.x - a.A.x, a.B.z - a.A.z));
  const plan = drawPreview(pg, { x: (a.A.x + a.B.x) / 2, z: (a.A.z + a.B.z) / 2 }, lineHeading(a.A, a.B, a.side), pivot, f.W, f.D, 0, 0, [[a.A.x, a.A.z], [a.B.x, a.B.z]]);
  hint(`${planLabel(plan)} · ${text}`);
}
function lineDrawPreview(A, B, pivot) {
  if (!A || !B) return;
  lineAimPreview({ A, B, side: defaultLineSide(A, B) }, pivot, '放開後指定面向陣線哪一側');
}
function aimSideFrom(cur) {
  if (!aim || !cur) return;
  const [nx, nz] = lineNormal(aim.A, aim.B), mx = (aim.A.x + aim.B.x) / 2, mz = (aim.A.z + aim.B.z) / 2;
  const s = (cur.x - mx) * nx + (cur.z - mz) * nz;
  if (Math.abs(s) > Math.max(4, view.height * 0.012)) aim.side = s > 0 ? 1 : -1;
}
function updateAim(cur, pivot) {
  if (!aim) return;
  aimSideFrom(cur);
  lineAimPreview(aim, pivot, aim.touch ? '點陣線的一側決定朝向；「取消」放棄' : '移動滑鼠選擇朝向，點擊確認；Esc 取消');
}
function beginAim(A, B, touch) { aim = { A, B, side: defaultLineSide(A, B), touch }; updateAim(null, false); }
function confirmAim(cur, pivot) {
  if (!aim) return;
  aimSideFrom(cur);
  const a = aim; aim = null; hidePreview(); hideHint();
  cmdLine(a.A, a.B, a.side, pivot);
}
function cancelAim() { aim = null; hidePreview(); hideHint(); }
function cancelDrag() { ms = null; ts = null; hidePreview(); hideHint(); boxEl.style.display = 'none'; }

// ── 指令輪盤：選取後按住左鍵不動 → 出現輪盤；滑向某一格放開＝下令；停在中間放開＝取消 ──
// 輪盤有兩頁，出現時按 Q／E 左右切換：「陣型」與「攻擊」
const RADIAL_ORDER = ['line', 'spindle', 'wedge', 'hcone', 'crescent', 'ring', 'column'];   // 從正上方順時針
const RADIAL_HOLD = 350, RADIAL_R = 100, RADIAL_DEAD = 28;
const RADIAL_PAGES = [
  { name: '陣型', col: '#8fe3a5', items: RADIAL_ORDER.map((k) => ({ id: k, label: FORMATIONS[k].name, act: 'form_' + k })) },
  { name: '攻擊', col: '#ff6a4a', items: [
    { id: 'attack', label: '指定攻擊', act: 'attack' }, { id: 'volley', label: '全艦齊射', act: 'volley' },
    { id: 'missile', label: '飛彈齊射', act: 'missile' }, { id: 'focus', label: '集中火力', act: 'skill_focus' },
    { id: 'area', label: '區域攻擊', act: 'area' }, { id: 'scan', label: '區域掃描', act: 'scan' }] },
];
let radialEl = null, radialPage = 0, radialM = null;
function buildRadial() {
  radialEl = document.createElement('div'); radialEl.id = 'radial'; radialEl.hidden = true;
  document.body.appendChild(radialEl);
}
function renderRadial() {
  const page = RADIAL_PAGES[radialPage], n = page.items.length, R = RADIAL_R, r0 = RADIAL_DEAD, c = R + 4;
  const pt = (rad, a) => [c + Math.sin(a) * rad, c - Math.cos(a) * rad];
  let svg = `<div class="rad-tabs">${RADIAL_PAGES.map((p, k) => `<span class="${k === radialPage ? 'on' : ''}" style="--c:${p.col}">${p.name}</span>`).join(`<i>${keyLabel(keyOf('radial_prev'))}／${keyLabel(keyOf('radial_next'))} 切換</i>`)}</div>`;
  svg += `<svg width="${c * 2}" height="${c * 2}" viewBox="0 0 ${c * 2} ${c * 2}" style="--c:${page.col}">`;
  page.items.forEach((it, i) => {
    const a0 = (i - 0.5) / n * TAU, a1 = (i + 0.5) / n * TAU;
    const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
    svg += `<path data-i="${i}" d="M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3} Z"/>`;
    const [tx, ty] = pt((R + r0) / 2 + 4, i / n * TAU);
    svg += `<text x="${tx}" y="${ty}" data-t="${i}">${it.label}</text><text class="k" x="${tx}" y="${ty + 14}">${keyLabel(keyOf(it.act))}</text>`;
  });
  svg += `<circle cx="${c}" cy="${c}" r="${r0 - 2}" class="mid"/><text x="${c}" y="${c + 4}" class="cancel">取消</text></svg>`;
  radialEl.innerHTML = svg;
  // 目前的陣型、不能用的項目
  const cur = selected.size ? [...selected][0].group : null;
  radialEl.querySelectorAll('path').forEach((p) => {
    const it = page.items[+p.dataset.i];
    p.classList.toggle('cur', radialPage === 0 && !!cur && it.id === cur.formation);
    p.classList.toggle('off', !radialItemOK(it.id));
  });
  radialEl.querySelectorAll('text[data-t]').forEach((tx) => tx.classList.toggle('off', !radialItemOK(page.items[+tx.dataset.t].id)));
  if (radialM) radialPick(radialM, radialM.lx ?? radialM.x0, radialM.ly ?? radialM.y0);
}
function radialItemOK(id) {
  const sel = [...selected].filter((q) => q.alive > 0);
  if (id === 'missile') return salvoReady(sel);
  if (id === 'focus') return !!radialFocusFleet();
  if (id === 'scan') { const f = fowOn() && reconFleet(); return !!f && fowReconLeft(f) <= 0; }
  return true;
}
function radialFocusFleet() {
  const t = U.uTime.value;
  for (const q of selected) { const f = q.fleet, s = f && f.skills.focus; if (s && s.left > 0 && t >= s.ready) return f; }
  return null;
}
function openRadial(m) {
  // 沒有選取時，按在自己的分艦隊上＝先選它（作戰中選整支艦隊）
  const q = squadronAt(m.x0, m.y0);
  if (q && q.side === cmdSide && !q.bg && !selected.has(q)) setSelection(GAME.phase !== 'sandbox' && q.fleet ? q.fleet.sqs.filter((x) => x.alive > 0) : [q]);
  if (!selected.size) return false;
  showRadial(m);
  return true;
}
function showRadial(m) {
  if (!radialEl) buildRadial();
  radialPage = 0; radialM = m;
  radialEl.style.left = m.x0 + 'px'; radialEl.style.top = m.y0 + 'px';
  radialEl.hidden = false; m.mode = 'radial'; m.pick = -1;
  renderRadial();
  hint(`滑向指令後放開；停在中間放開＝取消。${keyLabel(keyOf('radial_prev'))}／${keyLabel(keyOf('radial_next'))} 切換「陣型／攻擊」（按住 ${SETTINGS.queueMod}＝排進隊列）`);
}
function radialOpen() { return !!radialEl && !radialEl.hidden; }
function radialFlip(d) { if (!radialOpen()) return false; radialPage = (radialPage + d + RADIAL_PAGES.length) % RADIAL_PAGES.length; renderRadial(); return true; }
function radialPick(m, x, y) {
  m.lx = x; m.ly = y;
  const n = RADIAL_PAGES[radialPage].items.length, dx = x - m.x0, dy = y - m.y0, d = Math.hypot(dx, dy);
  let i = -1;
  if (d > RADIAL_DEAD) { const a = (Math.atan2(dx, -dy) + TAU) % TAU; i = Math.round(a / (TAU / n)) % n; }
  m.pick = i;
  radialEl.querySelectorAll('path').forEach((p) => p.classList.toggle('on', +p.dataset.i === i));
  radialEl.querySelector('.mid').classList.toggle('on', i < 0);
}
function closeRadial() { if (radialEl) radialEl.hidden = true; radialM = null; hideHint(); }
// 放開時執行選到的那一格
function radialActivate(i) {
  const it = RADIAL_PAGES[radialPage].items[i]; if (!it || !radialItemOK(it.id)) return;
  if (radialPage === 0) { cmdFormation(it.id); return; }
  if (it.id === 'attack') armAttack();
  else if (it.id === 'volley') cmdVolley();
  else if (it.id === 'missile') cmdMissile();
  else if (it.id === 'focus') { const f = radialFocusFleet(); if (f) armSkill(f, 'focus'); }
  else if (it.id === 'area') armArea();
  else if (it.id === 'scan') armRecon();
}

// 回放與 AI 對戰觀摩：不能下令，滑鼠只管鏡頭：左鍵拖曳＝移動畫面、右鍵拖曳＝調整視角（3D）；左鍵點一下仍是選取（看資訊）
function viewOnly() { return GAME.phase === 'replay' || (GAME.phase === 'battle' && (GAME.replaying || GAME.watch)); }
function mouseDown(e) {
  if (viewOnly() && (e.button === 0 || e.button === 2)) { ms = { mode: 'vpress', btn: e.button, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; return; }
  if (aim && (e.button === 0 || e.button === 2)) { ms = { mode: 'aimclick' }; return; }   // 觸控畫線後的指向（滑鼠不再畫線）
  if (e.button === 0) {
    const m = ms = { mode: 'lpress', x0: e.clientX, y0: e.clientY, t0: e.timeStamp };
    m.timer = setTimeout(() => { if (ms === m && m.mode === 'lpress') openRadial(m); }, RADIAL_HOLD);
  }
  else if (e.button === 1) { ms = { mode: mode3D && !e.shiftKey ? 'orbit' : 'pan', x: e.clientX, y: e.clientY }; e.preventDefault(); }
  else if (e.button === 2) { const y0 = selAlt(); ms = { mode: 'rpress', x0: e.clientX, y0: e.clientY, alt0: y0, dy: 0, dp: 0, A: groundAt(e.clientX, e.clientY, y0) }; }
}
function mouseMove(e) {
  if (aim && (!ms || ms.mode === 'aimclick')) updateAim(groundAt(e.clientX, e.clientY), false);
  if (!ms) return;
  const dist = ms.x0 != null ? Math.hypot(e.clientX - ms.x0, e.clientY - ms.y0) : 0;
  if (ms.mode === 'radial') { radialPick(ms, e.clientX, e.clientY); return; }
  if (ms.mode === 'vpress' && dist > 4) ms.mode = ms.btn === 2 ? 'orbit' : 'pan';
  if (ms.mode === 'lpress' && dist > 6) {
    // 畫面忙時計時器可能晚到：按住已超過時間就當成長按
    if (e.timeStamp - ms.t0 >= RADIAL_HOLD && openRadial(ms)) { radialPick(ms, e.clientX, e.clientY); return; }
    clearTimeout(ms.timer); ms.mode = 'box';
  }
  if (ms.mode === 'box') {
    const x = Math.min(ms.x0, e.clientX), y = Math.min(ms.y0, e.clientY);
    Object.assign(boxEl.style, { display: 'block', left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - ms.x0) + 'px', height: Math.abs(e.clientY - ms.y0) + 'px' });
  } else if (ms.mode === 'pan') { panBy(e.clientX - ms.x, e.clientY - ms.y); ms.x = e.clientX; ms.y = e.clientY; }
  else if (ms.mode === 'orbit') { orbitBy(-(e.clientX - ms.x) * 0.006, (e.clientY - ms.y) * 0.005); ms.x = e.clientX; ms.y = e.clientY; }
  else if (ms.mode === 'rpress' && dist > 10) ms.mode = 'raim';
  const pivot = false;
  if (ms.mode === 'rline') lineDrawPreview(ms.A, groundAt(e.clientX, e.clientY), pivot);
  else if (ms.mode === 'raim') { ms.cx = e.clientX; ms.cy = e.clientY; dragPreview(ms.A, groundAt(e.clientX, e.clientY, ms.alt0), pivot, '', ms); }
}
function mouseUp(e) {
  if (!ms) return;
  const m = ms; ms = null;
  if (m.timer) clearTimeout(m.timer);
  if (m.mode === 'radial') { const pk = m.pick; if (pk >= 0) radialActivate(pk); closeRadial(); return; }
  const pivot = false;
  if (m.mode === 'aimclick') { confirmAim(groundAt(e.clientX, e.clientY), pivot); return; }
  if (m.mode === 'vpress') { if (m.btn !== 0) return; m.mode = 'lpress'; }   // 回放／觀摩：沒拖曳的左鍵＝選取，右鍵點一下不做事
  if (m.mode === 'lpress') {
    // 左鍵：選擇（作戰中點一下＝整支艦隊；Shift／Ctrl＋點＝加選；連點兩下＝全軍；拖曳＝框選分艦隊）
    const q = squadronAt(e.clientX, e.clientY);
    if (e.detail >= 2 && q) setSelection(sideSquadrons(q.side));
    else if (q) {
      if (e.shiftKey || e.ctrlKey) { const u = e.altKey ? [q] : fleetUnit(q), on = u.every((x) => selected.has(x)); if (q.side === cmdSide) { for (const x of u) on ? selected.delete(x) : selected.add(x); selectionChanged(); } }
      else setSelection(pickUnit(q, e.altKey));
    } else if (!e.shiftKey) clearSelection();
  } else if (m.mode === 'box') {
    boxEl.style.display = 'none';
    boxSelect(m.x0, m.y0, e.clientX, e.clientY, e.shiftKey);
  } else if (m.mode === 'rpress') {
    // 右鍵點：移動到該點，朝向不變（按住時轉滾輪＝改高度）
    hidePreview(); hideHint();
    cmdMoveTo(groundAt(e.clientX, e.clientY, m.alt0), null, false, null, alt3(m));
  } else if (m.mode === 'raim') {
    hidePreview(); hideHint();
    const B = groundAt(e.clientX, e.clientY, m.alt0);
    if (m.A && B) cmdMoveTo(m.A, Math.hypot(B.x - m.A.x, B.z - m.A.z) > 2 ? Math.atan2(B.x - m.A.x, B.z - m.A.z) : null, pivot, null, alt3(m));
  }
}
function boxSelect(x0, y0, x1, y1, add) {
  const [a, b, c, d] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
  const inBox = (sd) => sideSquadrons(sd).filter((q) => { const [sx, sy] = screenOf(q.x, q.y || 0, q.z); return sx >= a && sx <= c && sy >= b && sy <= d; });
  let l = inBox(cmdSide);
  if (!l.length) l = inBox(1 - cmdSide);
  if (l.length) setSelection(l, add && l[0].side === cmdSide);
  else if (!add) clearSelection();
}

// ── 觸控 ──
// 點：選取；連點兩下：整支艦隊；單指拖：平移；雙指：縮放＋平移
// 長按後放開：移動（朝向不變；按在敵軍上＝集中砲火）；長按後拖：按下處＝目的地，拖曳方向＝朝向
// 「畫線」模式：單指拖畫陣線 → 再點陣線的一側決定朝向
const touches = new Map();
let ts = null;       // { mode, x0, y0, A, timer, lastX, lastY }
let lastTap = { t: 0, q: null };
let lineMode = false;  // 觸控工具列「畫線」
let LONG_PRESS = 380;
function touchDown(e) {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  document.body.classList.add('touch');
  if (touches.size === 1) {
    // 長按與否用事件時間戳判斷（畫面忙時計時器可能比移動事件先到）；計時器只負責提示
    ts = { mode: 'tpress', x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastY: e.clientY, t0: e.timeStamp };
    ts.timer = setTimeout(() => {
      if (ts && ts.mode === 'tpress' && !aim) { navigator.vibrate && navigator.vibrate(15); hint('拖曳指定到達後的朝向；直接放開＝移動'); }
    }, LONG_PRESS);
  } else if (touches.size === 2) {
    if (ts && ts.timer) clearTimeout(ts.timer);
    if (!aim) { hidePreview(); hideHint(); }
    const [p, q] = [...touches.values()];
    ts = { mode: 'pinch', d0: Math.hypot(p.x - q.x, p.y - q.y), h0: view.height, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2, a: Math.atan2(q.y - p.y, q.x - p.x) };
  }
}
function touchMove(e) {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!ts) return;
  if (ts.mode === 'pinch' && touches.size >= 2) {
    const [p, q] = [...touches.values()];
    const d = Math.hypot(p.x - q.x, p.y - q.y), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    zoomAt((ts.h0 * ts.d0 / Math.max(d, 1)) / view.height, mx, my);
    panBy(mx - ts.mx, my - ts.my); ts.mx = mx; ts.my = my;
    const a = Math.atan2(q.y - p.y, q.x - p.x); let da = a - ts.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    orbitBy(-da, 0); ts.a = a;
    return;
  }
  const dist = Math.hypot(e.clientX - ts.x0, e.clientY - ts.y0);
  if (ts.mode === 'tpress' && dist > 10) {
    clearTimeout(ts.timer);
    const long = e.timeStamp - ts.t0 >= LONG_PRESS;
    if (lineMode && !aim) { ts.mode = 'tline'; ts.A = groundAt(ts.x0, ts.y0); }
    else if (long && !aim) { ts.mode = 'taim'; ts.A = groundAt(ts.x0, ts.y0); }
    else ts.mode = orbitMode && mode3D ? 'torbit' : 'tpan';
  }
  if (ts.mode === 'tpan') { panBy(e.clientX - ts.lastX, e.clientY - ts.lastY); }
  else if (ts.mode === 'torbit') orbitBy(-(e.clientX - ts.lastX) * 0.008, (e.clientY - ts.lastY) * 0.006);
  else if (ts.mode === 'tline') lineDrawPreview(ts.A, groundAt(e.clientX, e.clientY), false);
  else if (ts.mode === 'taim') dragPreview(ts.A, groundAt(e.clientX, e.clientY), false, '');
  ts.lastX = e.clientX; ts.lastY = e.clientY;
}
function touchUp(e) {
  touches.delete(e.pointerId);
  if (!ts) return;
  const m = ts;
  if (m.timer) clearTimeout(m.timer);
  if (m.mode === 'pinch') { if (touches.size === 0) ts = null; return; }
  ts = null;
  if (!aim) hideHint();
  const far = Math.hypot(e.clientX - m.x0, e.clientY - m.y0) > 24;
  const moveOrAttack = (p) => { const q = squadronAt(e.clientX, e.clientY); if (q && q.side !== cmdSide) cmdAttack(q); else cmdMoveTo(p); };
  if (m.mode === 'tpress' && aim) {
    // 畫陣線第二步：點的位置決定面向哪一側
    confirmAim(groundAt(e.clientX, e.clientY), false);
  } else if (m.mode === 'tpress' && e.timeStamp - m.t0 >= LONG_PRESS) {
    moveOrAttack(groundAt(e.clientX, e.clientY));
  } else if (m.mode === 'tpress') {
    const q = squadronAt(e.clientX, e.clientY), now = performance.now();
    if (q && lastTap.q === q && now - lastTap.t < 320) setSelection(sideSquadrons(q.side));
    else if (q) { if (q.side === cmdSide && selected.size && !selected.has(q) && multiTap) toggleSelect(q); else setSelection([q]); }
    else clearSelection();
    lastTap = { t: now, q };
  } else if (m.mode === 'taim') {
    hidePreview();
    const B = groundAt(e.clientX, e.clientY);
    if (far && m.A && B) cmdMoveTo(m.A, Math.atan2(B.x - m.A.x, B.z - m.A.z), false);
    else moveOrAttack(m.A);
  } else if (m.mode === 'tline') {
    const B = groundAt(e.clientX, e.clientY);
    if (far && m.A && B) beginAim(m.A, B, true);
    else { hidePreview(); moveOrAttack(B); }
  }
}
let multiTap = false;   // 觸控工具列「多選」
canvas.addEventListener('pointerdown', (e) => { if (BR.on) { bridgePointer('down', e); return; } canvas.setPointerCapture(e.pointerId); if (gamePointer('down', e)) return; if (e.pointerType === 'touch') touchDown(e); else mouseDown(e); });
canvas.addEventListener('pointermove', (e) => { if (BR.on) { bridgePointer('move', e); return; } if (gamePointer('move', e)) return; if (e.pointerType === 'touch') touchMove(e); else mouseMove(e); });
canvas.addEventListener('pointerup', (e) => { if (BR.on) { bridgePointer('up', e); return; } if (gamePointer('up', e)) return; if (e.pointerType === 'touch') touchUp(e); else mouseUp(e); });
canvas.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); closeRadial(); cancelDrag(); if (aim) updateAim(null, false); });

// ── 鍵盤 ──
// ── 按鍵綁定（可在「設定」修改）──
// [動作, 名稱, 分組, 預設鍵]。分組 radial 的鍵只在輪盤開著時有效，所以可以和鏡頭共用 Q／E
const KEY_ACTIONS = [
  ['form_line', '橫陣', '陣型', 'Digit1'], ['form_spindle', '紡錘陣', '陣型', 'Digit2'], ['form_crescent', '凹形陣', '陣型', 'Digit3'],
  ['form_ring', '圓陣', '陣型', 'Digit4'], ['form_column', '縱陣', '陣型', 'Digit5'], ['form_wedge', '圓錐陣', '陣型', 'KeyW'], ['form_hcone', '空心錐陣', '陣型', 'KeyH'], ['orderly', '整齊排列切換', '陣型', 'KeyF'],
  ['attack', '指定攻擊（再點敵軍）', '攻擊', 'KeyA'], ['volley', '全艦齊射', '攻擊', 'KeyZ'], ['missile', '飛彈齊射', '攻擊', 'KeyX'],
  ['area', '區域攻擊（再點地圖）', '攻擊', 'KeyD'], ['scan', '區域掃描：航母派偵察機（再點地圖）', '攻擊', 'KeyC'],
  ['skill_focus', '集中火力', '技能', 'Digit6'], ['skill_wall', '鐵壁', '技能', 'Digit7'], ['skill_charge', '突進', '技能', 'Digit8'],
  ['skill_rapid', '極速射擊', '技能', 'Digit9'], ['skill_evade', '機動迴避', '技能', 'Digit0'], ['skill_jam', '干擾', '技能', 'KeyJ'], ['skill_reinforce', '呼叫增援', '技能', 'KeyG'],
  ['turn', '向右轉 45°', '移動', 'KeyV'], ['pitch_mod', '仰角（右鍵按住時按著轉滾輪）', '移動', 'KeyZ'],
  ['pause', '暫停／繼續', '時間', 'Space'], ['speed_up', '加速', '時間', 'Equal'], ['speed_down', '減速', '時間', 'Minus'],
  ['tactical', '戰術面板（艦橋：低頭／抬頭）', '介面', 'Tab'], ['bridge', '指揮官視角（旗艦艦橋）', '介面', 'KeyB'], ['render', '切換 2D／3D', '介面', 'KeyM'], ['help', '操作說明', '介面', 'Slash'], ['settings', '設定', '介面', 'F10'],
  ['radial_prev', '輪盤：上一頁', '輪盤', 'KeyQ'], ['radial_next', '輪盤：下一頁', '輪盤', 'KeyE'],
  ['cam_up', '鏡頭往前', '鏡頭', 'ArrowUp'], ['cam_down', '鏡頭往後', '鏡頭', 'ArrowDown'], ['cam_left', '鏡頭往左', '鏡頭', 'ArrowLeft'], ['cam_right', '鏡頭往右', '鏡頭', 'ArrowRight'],
  ['cam_yaw_l', '3D：向左轉', '鏡頭', 'KeyQ'], ['cam_yaw_r', '3D：向右轉', '鏡頭', 'KeyE'], ['cam_pitch_up', '3D：仰角升高', '鏡頭', 'KeyR'], ['cam_pitch_dn', '3D：仰角降低', '鏡頭', 'KeyT'],
];
const KEY_CTX = (id) => (id.startsWith('radial_') ? 'radial' : id === 'pitch_mod' ? 'drag' : 'main');   // 不同情境的鍵可以重複（例如 Z＝齊射，右鍵按住時＝仰角）
// 介面資訊預設都顯示
const UI_OPTS = [
  ['labels', '分艦隊標籤', '戰場上每支分艦隊的名稱與艦數'], ['outlines', '戰術符號外框', '拉遠時的分艦隊外框'],
  ['preview', '命令預覽', '目的地框、移動路線、變陣後的位置'], ['queue', '戰術隊列', '隊列每一步的顏色、箭頭與編號（戰術面板一律顯示）'],
  ['blink', '閃爍提醒', '正在執行的命令會閃爍'], ['ghosts', '暫停時的預定位置小點', '暫停時用小點畫出每艘船的預定位置'],
  ['stats', '戰況數據', '左上角的光束威力與被擊沉方向'], ['skillbar', '技能列', '畫面下方的技能按鈕'],
  ['selbar', '選取資訊列', '畫面下方顯示目前選取'], ['toasts', '通知訊息', '開戰、技能、增援等通知'],
  ['compass', '艦橋方位儀', '指揮官視角上方的方位刻度與各艦隊方位'],
];
const SETTINGS = (() => {
  const d = { keys: Object.fromEntries(KEY_ACTIONS.map((a) => [a[0], a[3]])), queueMod: 'Shift', speedIdx: 1, tacPause: true, bridgePause: false, cmdSlow: 0.2, weapons2D: true, weapons3D: true, brPins: { stat: false, pip: false }, uiScale: 1.2, autoScan: true, ui: Object.fromEntries(UI_OPTS.map((u) => [u[0], true])) };
  try { const s = JSON.parse(STORE.getItem('fleet.settings') || 'null'); if (s) { Object.assign(d.keys, s.keys || {}); Object.assign(d.ui, s.ui || {}); for (const k of ['queueMod', 'speedIdx', 'tacPause', 'bridgePause', 'brPins', 'cmdSlow', 'weapons2D', 'weapons3D', 'uiScale', 'autoScan']) if (s[k] != null) d[k] = s[k]; } } catch (e) { /* 用預設值 */ }
  return d;
})();
function saveSettings() { try { STORE.setItem('fleet.settings', JSON.stringify(SETTINGS)); } catch (e) { /* 只在本次有效 */ } }
function keyOf(id) { return SETTINGS.keys[id] || ''; }
function uiOn(k) { return SETTINGS.ui[k] !== false; }
const KEY_NAMES = { Space: '空白鍵', Tab: 'Tab', Equal: '=', Minus: '-', Slash: '/', Backslash: '\\', Backquote: '`', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn' };
function keyLabel(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return '數字鍵' + code.slice(6);
  return code;
}
function keyHeld(id) { const c = keyOf(id); return !!c && keysDown.has(c); }
function runKeyAction(id, e) {
  if (id.startsWith('form_')) { cmdFormation(id.slice(5)); return true; }
  if (id.startsWith('skill_')) return skillKey(id.slice(6));
  switch (id) {
    case 'orderly': { const q = actOn()[0]; if (q && q.group) cmdOrderly(!q.group.orderly); return true; }
    case 'attack': armAttack(); return true;
    case 'volley': cmdVolley(); return true;
    case 'missile': cmdMissile(); return true;
    case 'area': armArea(); return true;
    case 'scan': armRecon(); return true;
    case 'turn': cmdTurn(Math.PI / 4); return true;
    case 'pause': togglePause(); return true;
    case 'speed_up': setSpeed(speedIdx + 1); return true;
    case 'speed_down': setSpeed(speedIdx - 1); return true;
    case 'tactical': if (GAME.phase === 'sandbox') setCmdSide(1 - cmdSide); else toggleTac(); return true;   // 測試場：切換指揮陣營
    case 'render': setRenderMode(mode3D ? '2d' : '3d'); return true;
    case 'bridge': toggleBridge(); return true;
    case 'help': toggleHelp(); return true;
    case 'settings': toggleSettings(); return true;
  }
  return false;   // 鏡頭等「按住」的動作
}
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (settingsCapturing()) return;
  if (typeof weaponEditorOpen === 'function' && weaponEditorOpen()) return;   // 武器配置畫面自己處理按鍵
  const k = e.code;
  if (radialOpen()) {   // 輪盤開著：切換頁
    if (k === keyOf('radial_prev') || k === keyOf('radial_next')) { e.preventDefault(); radialFlip(k === keyOf('radial_prev') ? -1 : 1); return; }
  }
  if (k === keyOf('pitch_mod') && rightDragging()) { e.preventDefault(); keysDown.add(k); return; }   // 右鍵按住中：當成仰角鍵
  if (k === 'Escape') {
    if (settingsOpen()) { closeSettings(); return; }
    if (ms && ms.mode === 'radial') { closeRadial(); ms = null; return; } if (skillEsc()) return; if (tacOpen()) { closeTac(); return; } if (aim) cancelAim(); else if (ms) cancelDrag(); else clearSelection(); return;
  }
  if (k === 'KeyA' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (BR.on && bridgeConsoleK() < 0.9) { bridgeNoCmd(); return; } setCmdSide(cmdSide); return; }   // Ctrl＋A 全選（固定）
  if (k === 'NumpadAdd') { setSpeed(speedIdx + 1); return; }
  if (k === 'NumpadSubtract') { setSpeed(speedIdx - 1); return; }
  if (settingsOpen()) return;
  for (const [id] of KEY_ACTIONS) {
    if (KEY_CTX(id) !== 'main' || keyOf(id) !== k) continue;
    if (k === 'Tab' || k === 'Space' || k === 'Slash' || k.startsWith('Arrow') || k.startsWith('F')) e.preventDefault();
    if (bridgeBlocksKey(id)) { bridgeNoCmd(); return; }   // 艦橋：命令只能在戰術台下
    if (runKeyAction(id, e)) return;
  }
  keysDown.add(k);
});
addEventListener('keyup', (e) => keysDown.delete(e.code));
addEventListener('blur', () => keysDown.clear());
function keyPan(dt) {
  if (BR.on) { bridgeKeys(dt); return; }
  if (keyHeld('cam_yaw_l')) orbitBy(1.4 * dt, 0);
  if (keyHeld('cam_yaw_r')) orbitBy(-1.4 * dt, 0);
  if (keyHeld('cam_pitch_up')) orbitBy(0, 0.9 * dt);
  if (keyHeld('cam_pitch_dn')) orbitBy(0, -0.9 * dt);
  let dx = 0, dy = 0;
  if (keyHeld('cam_up')) dy += 1;
  if (keyHeld('cam_down')) dy -= 1;
  if (keyHeld('cam_left')) dx += 1;
  if (keyHeld('cam_right')) dx -= 1;
  if (dx || dy) panBy(dx * VH * 0.9 * dt, dy * VH * 0.9 * dt);
}

// ── 時間 ──
function togglePause() { if (GAME.phase === 'simedit') return; if (NET.on) { toast('多人戰鬥不能暫停', 'hint'); return; } /* 模擬室編輯中保持暫停 */ paused = !paused; if (typeof TAC !== 'undefined' && TAC.open) TAC.autoPaused = false; updateTimeUI(); }
// 下令時減速：不是暫停時，正在下令（右鍵拖曳、指令輪盤、選攻擊／技能目標、畫陣線）就把速度降到設定值，下完恢復
function commanding() {
  if (GAME.phase !== 'battle' && GAME.phase !== 'sandbox') return false;
  if (ms && ['rpress', 'raim', 'radial', 'rline', 'aimclick'].includes(ms.mode)) return true;
  if (aim || GAME.skillArm || radialOpen()) return true;
  return typeof TAC !== 'undefined' && !!TAC.drag && ['right', 'sright', 'radial', 'node', 'svnode', 'svpitch'].includes(TAC.drag.kind);
}
let cmdSlowOn = false;
function effSpeed() { const base = SPEEDS[speedIdx], f = SETTINGS.cmdSlow; return cmdSlowOn && f > 0 ? Math.min(base, f) : base; }
function cmdSlowFrame() {
  const on = !paused && SETTINGS.cmdSlow > 0 && commanding();
  if (on !== cmdSlowOn) { cmdSlowOn = on; updateTimeUI(); document.body.classList.toggle('cmd-slow', on); }
}
function setSpeed(i) { if (NET.on && GAME.phase === 'battle') { toast(`多人戰鬥的速度由房主決定（×${NET.speed}）`, 'hint'); return; } speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, i)); updateTimeUI(); }
function updateTimeUI() {
  $('st-pause').hidden = !paused;
  $('st-speed').textContent = cmdSlowOn ? `下令中 ×${effSpeed()}` : '×' + SPEEDS[speedIdx];
  $('st-speed').classList.toggle('slow', cmdSlowOn);
  $('tb-pause').textContent = paused ? '繼續' : '暫停';
  $('tb-speed').textContent = '×' + SPEEDS[speedIdx];
}
function toggleHelp() { $('help').hidden = !$('help').hidden; }

// ── 面板與觸控工具列 ──
const presets = {
  far: { x: 0, z: 0, h: 1100 },
  mid: { x: 0, z: 0, h: 560 },
  near: { x: 120, z: -110, h: 120 },
  flag: { x: -205, z: 205, h: 62 },
};
let camAnim = null;
function goPreset(name) {
  const p = presets[name];
  if (name === 'flag') {
    const sq = squadrons.find((s) => s.side === 1 && s.flagship >= 0);
    if (sq) { shipWorldCPU(sq.flagship, _a); p.x = _a.x; p.z = _a.z; }
  }
  camAnim = { from: { x: view.target.x, z: view.target.z, h: view.height, yaw: view.yaw, pitch: view.pitch }, to: { yaw: view.yaw, pitch: view.pitch, ...p }, t: 0 };
}
function bindToggle(id, key, after) {
  const el = $(id); el.checked = opts[key];
  // 會影響戰局的設定走命令（回放、連線才會一致）；純畫面設定直接改
  el.addEventListener('change', () => { if (SIM_RULES.includes(key)) setRule(key, el.checked); else opts[key] = el.checked; after && after(); });
}
bindToggle('t-persp', 'persp', updateCamera);
bindToggle('t-alt', 'altitude');
bindToggle('t-fog', 'fog');
bindToggle('t-glow', 'glow');
bindToggle('t-bloom', 'bloom');
bindToggle('t-fire', 'fire');
bindToggle('t-labels', 'labels');
bindToggle('t-bg', 'background', pushSquadronUniforms);
bindToggle('t-adv', 'advance');
bindToggle('t-face', 'autoFace');
$('n-per').value = opts.perSide;
$('n-per-v').textContent = opts.perSide.toLocaleString();
$('n-per').addEventListener('input', (e) => { $('n-per-v').textContent = (+e.target.value).toLocaleString(); });
$('n-per').addEventListener('change', (e) => { opts.perSide = +e.target.value; newBattle(); });
$('n-rep').value = opts.rep;
$('n-rep').addEventListener('change', (e) => { opts.rep = +e.target.value; updateSelBar(); });
refreshFormationUI = () => {
  if (!groups.length) return;
  const l = actOn(), g = l.length ? l[0].group : null, same = g && l.every((q) => q.group === g);
  document.querySelectorAll('#formations button').forEach((b) => b.classList.toggle('on', !!same && b.dataset.f === g.formation));
  $('f-note').textContent = same ? FORMATIONS[g.formation].note : '選取的分艦隊屬於不同部隊；選一個陣型會把它們編成同一部隊。';
  $('t-orderly').checked = !!(same && g.orderly);
  $('n-layers').value = String((same && g.layers) || 1);
  $('n-layers').disabled = !(same && g.orderly);
};
for (const [id, key] of [['n-flank-side', 'flankSide'], ['n-flank-rear', 'flankRear']]) {
  const el = $(id), out = $(id + '-v'); el.value = opts[key]; out.textContent = '×' + (+opts[key]).toFixed(1);
  el.addEventListener('input', () => { setRule(key, +el.value); out.textContent = '×' + opts[key].toFixed(1); });
}
{ const el = $('n-range'), out = $('n-range-v');
  el.addEventListener('input', () => { setRule('rangeMul', +el.value); out.textContent = '×' + (+el.value).toFixed(2); }); }
$('n-uturn').addEventListener('change', (e) => { opts.uturn = e.target.value; });
$('n-layers').addEventListener('change', (e) => cmdLayers(+e.target.value));
$('t-orderly').addEventListener('change', (e) => cmdOrderly(e.target.checked));
document.querySelectorAll('#seg-side button').forEach((b) => (b.onclick = () => setCmdSide(+b.dataset.side)));
document.querySelectorAll('#formations button').forEach((b) => (b.onclick = () => cmdFormation(b.dataset.f)));
$('b-volley').onclick = cmdVolley;
$('b-missile').onclick = cmdMissile;
$('b-fighter').onclick = cmdFighter;
$('b-turn').onclick = () => cmdTurn(Math.PI / 4);
$('b-jam').onclick = cmdJam;
$('b-reset').onclick = () => newBattle();
$('b-replay').onclick = () => {
  const n = cmdLog.length, ticks = simTick;
  replayBattle();
  $('replay-note').textContent = `回放中：${n} 道命令、${(ticks / SIM_HZ).toFixed(0)} 秒。你的操作會接在後面成為新的紀錄。`;
};
document.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => goPreset(b.dataset.preset)));
$('h-gpuname').textContent = gpuName;
$('n-res').addEventListener('change', (e) => { resScale = +e.target.value; applyResolution(); });
$('t-msaa').checked = true;
$('t-msaa').addEventListener('change', (e) => setMSAA(e.target.checked));
$('panel-toggle').onclick = () => document.body.classList.toggle('panel-hidden');
$('help-btn').onclick = toggleHelp;
$('help').onclick = (e) => { if (e.target.id === 'help' || e.target.dataset.close != null) toggleHelp(); };
$('tb-pause').onclick = togglePause;
$('tb-speed').onclick = () => setSpeed((speedIdx + 1) % SPEEDS.length);
$('tb-line').onclick = () => { lineMode = !lineMode; $('tb-line').classList.toggle('on', lineMode); };
$('tb-multi').onclick = () => { multiTap = !multiTap; $('tb-multi').classList.toggle('on', multiTap); };
$('tb-all').onclick = () => setCmdSide(cmdSide);
$('tb-clear').onclick = () => { if (aim) cancelAim(); else clearSelection(); };
let orbitMode = false;
$('tb-orbit').onclick = () => { orbitMode = !orbitMode; $('tb-orbit').classList.toggle('on', orbitMode); };
// ── 2D／3D 切換（記住玩家的選擇） ──
function setRenderMode(m, persist = true) {
  const want = m === '3d';
  if (!want && opNow() >= 1) { toast(`${OP_LEVELS[GAME.op].name}難度：作戰中不能用 2D 畫面`); return; }
  if (!want && BR.on) { BR.prev.mode3D = false; exitBridge(); return; }   // 艦橋只有 3D：切 2D＝離開指揮官視角
  if (want) init3D();
  mode3D = want;
  if (persist) try { STORE.setItem('fleet.render', m); } catch (e) { /* 無法儲存就算了 */ }
  document.body.classList.toggle('mode3d', mode3D);
  document.querySelectorAll('#seg-render button').forEach((b) => b.classList.toggle('on', b.dataset.r === m));
  $('t-persp').disabled = mode3D;
  apply3DVisibility();
  // 切回 2D 時鏡頭轉回固定俯角；切到 3D 時稍微斜一點讓人看出立體
  if (!BR.on) camAnim = { from: { x: view.target.x, z: view.target.z, h: view.height, yaw: view.yaw, pitch: view.pitch },
    to: { x: view.target.x, z: view.target.z, h: view.height, yaw: mode3D ? -0.5 : 0, pitch: mode3D ? 22 * Math.PI / 180 : ELEV }, t: 0 };
  updateCamera();
}
document.querySelectorAll('#seg-render button').forEach((b) => (b.onclick = () => setRenderMode(b.dataset.r)));
$('n-detail3').addEventListener('change', (e) => (opts3.detail = e.target.value));
$('n-lod3').addEventListener('input', (e) => { opts3.lodScale = +e.target.value; $('n-lod3-v').textContent = '×' + opts3.lodScale.toFixed(2); });
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch', 'panel-hidden');

function turn(g, delta) { if (g) turnGroupTo(g, groupHeading(g, U.uTime.value) + delta); }

// ───────────────────────── 主迴圈 ─────────────────────────
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fpsShow = 0, hudT = 0;
const proj = new THREE.Vector3();

function simulate(dt) {
  U.uTime.value += dt;
  runOrderQueue();
  updateGroups(dt);
  autoFace();
  pushSquadronUniforms();
  continuousFire(dt);
  autoWeapons(dt);
  updateFighters(dt);
  processHits();
  decayHits(dt);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  // 固定步長：依真實經過時間累積，一次走整數個 tick（太慢時寧可放慢也不跳步）
  if (NET.on && GAME.phase === 'battle') netStep(dt);   // 多人：照伺服器的回合推進（不能暫停）
  else if (!paused) {
    simAcc += dt * effSpeed();
    let n = 0;
    while (simAcc >= SIM_DT && n < MAX_STEPS_PER_FRAME) { stepSim(); simAcc -= SIM_DT; n++; }
    if (n === MAX_STEPS_PER_FRAME) simAcc = 0;
    if (!n) pushSquadronUniforms();
  } else pushSquadronUniforms();
  cmdSlowFrame();
  fowFrameMask();    // 戰爭迷霧：這一幀看不到的敵軍、艦載機
  fowFxFrame();      // 戰爭迷霧：掃描波紋、被掃描的方向（3D 場景）
  keyPan(dt);
  bridgeFrame(dt);   // 指揮官視角：鏡頭、懸浮視窗、戰術台
  updateMarkers();
  updateStalks();
  gameFrame(dt);
  const t = U.uTime.value;
  const fogNow = playerFogged();   // 被干擾：敵方標籤只顯示「？？？」

  // 數值平滑
  U.uAlt.value += ((opts.altitude ? 1 : 0) - U.uAlt.value) * Math.min(1, dt * 4);
  U.uFog.value += ((opts.fog ? 1 : 0) - U.uFog.value) * Math.min(1, dt * 4);
  U.uGlowOn.value = opts.glow ? 1 : 0;
  bloomPass.enabled = opts.bloom;

  if (camAnim && BR.on) camAnim = null;
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt / 1.2);
    const e = camAnim.t * camAnim.t * (3 - 2 * camAnim.t);
    view.target.x = camAnim.from.x + (camAnim.to.x - camAnim.from.x) * e;
    view.target.z = camAnim.from.z + (camAnim.to.z - camAnim.from.z) * e;
    view.height = Math.exp(Math.log(camAnim.from.h) + (Math.log(camAnim.to.h) - Math.log(camAnim.from.h)) * e);
    view.yaw = camAnim.from.yaw + wrapAngle(camAnim.to.yaw - camAnim.from.yaw) * e;
    view.pitch = camAnim.from.pitch + (camAnim.to.pitch - camAnim.from.pitch) * e;
    if (camAnim.t >= 1) camAnim = null;
    updateCamera();
  }

  flushRing(misTrailGeo, ['aM0', 'aM1', 'aM2', 'aMT'], [3, 3, 3, 4], misDirtyFrom, misDirtyCount, MIS_MAX);
  misDirtyFrom = -1; misDirtyCount = 0;
  if (misCut) { const a = misTrailGeo.getAttribute('aMT'); a.clearUpdateRanges && a.clearUpdateRanges(); a.needsUpdate = true; misCut = false; }
  flushRing(beamGeo, ['aA', 'aB', 'aT'], [3, 3, 4], beamDirtyFrom, beamDirtyCount, BEAM_MAX);
  beamDirtyFrom = -1; beamDirtyCount = 0;
  flushRing(fxGeo, ['aP', 'aF'], [3, 4], fxDirtyFrom, fxDirtyCount, FX_MAX);
  fxDirtyFrom = -1; fxDirtyCount = 0;

  // LOD：拉遠時顯示戰術符號
  const ppu = VH / view.height;
  const symAlpha = opts.labels ? THREE.MathUtils.clamp((1.25 - ppu) / 0.45, 0, 1) : 0;
  for (const sq of squadrons) {
    const fh = fowHidden(sq), gh = fh ? pSeen(sq) : null;   // 戰爭迷霧：看不到＝不畫；有最後已知位置＝標籤留在那裡（淡）
    const vis = !sq.hidden && !(sq.bg && !opts.background) && (!fh || !!gh);
    const sel = selected.has(sq);
    sq.outline.visible = vis && !fh && !sq.bg && (sel || (symAlpha > 0.01 && uiOn('outlines') && !BR.on));
    sq.outline.children[0].material.opacity = sel ? 0.95 : 0.55 * symAlpha;
    let la = vis ? (sq.bg ? symAlpha * 0.7 : Math.max(symAlpha, opts.labels ? THREE.MathUtils.clamp((2.2 - ppu) / 0.8, 0, 1) * 0.85 : 0)) : 0;
    // 作戰中拉遠時，每支艦隊只留旗艦分艦隊的標籤（避免疊在一起）
    if (battleSetup && !battleSetup.bg && symAlpha > 0.4 && sq.fleet && sq.flagship < 0 && sq.fleet.sqs.some((o) => o.flagship >= 0 && o.group === sq.group)) la = 0;   // 獨立行動的分艦隊保留標籤
    if (sel || sq.relayUntil > t || flankState(sq) || sq.disorderUntil > t) la = Math.max(la, 0.95);   // 選取中、傳令中、側背受擊的標籤一律顯示
    if (BR.on) la = vis && !sq.bg && (sq.flagship >= 0 || sel || flankState(sq)) ? 0.9 : 0;   // 艦橋：只標旗艦分艦隊與選取中的
    if (!uiOn('labels')) la = 0;
    if (!vis) la = 0; else if (gh) la *= 0.6;
    if (la < 0.02) { sq.label.style.opacity = 0; continue; }
    const P = gh || sq;
    proj.set(P.x - Math.sin(P.h) * (P.D / 2 + 16), P.y || 0, P.z - Math.cos(P.h) * (P.D / 2 + 16)).project(camera);
    if (proj.z > 1) { sq.label.style.opacity = 0; continue; }   // 在鏡頭後面
    sq.label.style.opacity = la;
    const fl = gh ? '' : flankState(sq);
    const st = sq.bg ? '' : gh ? ` 最後已知・${Math.round(t - gh.t)} 秒前` : fogNow && sq.side !== GAME.playerSide ? ' 雷達受干擾' : sq.disorderUntil > t ? ` 陣形混亂 ${Math.ceil(sq.disorderUntil - t)} 秒` : fl ? ` ${fl}受擊！` : sq.relayUntil > t ? ` 傳令中 ${(sq.relayUntil - t).toFixed(1)} 秒` : sqMorphing(sq, t) ? ' 變換陣型中' : '';
    if (sq.labelState.textContent !== st) { sq.labelState.textContent = st; sq.label.classList.toggle('relay', !fl && sq.relayUntil > t); sq.label.classList.toggle('flank', !!fl || sq.disorderUntil > t); }
    sq.label.style.transform = `translate(${(proj.x * 0.5 + 0.5) * VW}px, ${(-proj.y * 0.5 + 0.5) * VH}px) translate(-50%, 0)`;
  }
  U.uSpriteFade.value = 1.0;

  // 背景視差
  bgMat.uniforms.uOff.value.set(view.target.x * ppu, -view.target.z * Math.sin(ELEV) * ppu);
  apply3DVisibility();
  if (mode3D) { if (R3.sky) R3.sky.position.copy(camera.position); update3D(); }

  renderer.info.reset();
  const gq = gpuBegin();
  composer.render(dt);
  bridgePips();   // 其他艦隊旗艦的子畫面
  gpuEnd(gq);
  gpuPoll();
  const nowMs = performance.now();
  if (lastWall > 0) wallAvg = wallAvg < 0 ? nowMs - lastWall : wallAvg * 0.95 + (nowMs - lastWall) * 0.05;
  lastWall = nowMs;

  // HUD
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fpsShow = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.25;
    let activeBeams = 0;
    for (let i = 0; i < BEAM_MAX; i++) { const p = (t - beamT[i * 4]) / beamT[i * 4 + 1]; if (p >= 0 && p <= 1.35) activeBeams++; }
    const rep = opts.rep;
    $('h-fps').textContent = fpsShow.toFixed(0);
    if (tq) {
      if (gpuMsAvg >= 0) {
        $('h-gpu').textContent = gpuMsAvg.toFixed(2) + ' ms';
        $('h-gpup').textContent = wallAvg > 0 ? Math.min(100, gpuMsAvg / wallAvg * 100).toFixed(0) + '%' : '–';
      }
    } else { $('h-gpu').textContent = '不支援'; $('h-gpup').textContent = '–'; }
    $('h-vram').textContent = vramEstimateMB().toFixed(0) + ' MB';
    $('h-calls').textContent = renderer.info.render.calls;
    $('h-tris').textContent = (renderer.info.render.triangles / 1e6).toFixed(2) + ' M';
    if (mode3D) { const s3 = R3.lodStats; for (let k = 0; k < 4; k++) $('h3-l' + k).textContent = s3[k].toLocaleString(); $('h3-dots').textContent = s3[4].toLocaleString(); }
    $('h-spr').textContent = shipCount.toLocaleString();
    $('h-beam').textContent = activeBeams.toLocaleString();
    $('h-a0').textContent = (aliveBySide[0] * rep).toLocaleString();
    $('h-a1').textContent = (aliveBySide[1] * rep).toLocaleString();
    for (let sd = 0; sd < 2; sd++) {
      const gs = groups.filter((g) => g.side === sd && g.sqs.length);
      let txt = gs.length === 1 ? FORMATIONS[gs[0].formation].name + (gs[0].orderly ? '・整齊' : '') : `${gs.length} 個部隊`;
      if (isMorphing(sd, t)) txt += '（變換中）';
      if (jam[sd].until > t) txt += ` · 通訊受干擾 ${(jam[sd].until - t).toFixed(0)} 秒`;
      $('h-f' + sd).textContent = txt;
      $('h-ftr' + sd).textContent = aliveF[sd].length.toLocaleString();
    }
    let flying = 0;
    for (let i = 0; i < MIS_MAX; i++) { const p = (t - misT[i * 4]) / misT[i * 4 + 1]; if (p >= 0 && p <= misT[i * 4 + 3]) flying++; }
    $('h-mis').textContent = flying.toLocaleString();
    for (let sd = 0; sd < 2; sd++) $('h-bp' + sd).textContent = !beamShots[sd] ? '–' : U.uTime.value - beamLastT[sd] > 2 ? '射程外' : Math.round(hitAvg[sd] * 100) + '%';
    for (let sd = 0; sd < 2; sd++) $('h-dmg' + sd).textContent = dmgStats[sd].map((v) => (v * opts.rep).toLocaleString()).join(' ／ ');
    for (const sq of squadrons) sq.labelNum.textContent = (fogNow && sq.side !== GAME.playerSide) || fowHidden(sq) ? ' ？？？ 艘' : ` ${(sq.alive * rep * (sq.bg ? 3 : 1)).toLocaleString()} 艘${Math.abs(sq.y || 0) >= 8 ? `　${sq.y > 0 ? '▲' : '▼'}${Math.round(Math.abs(sq.y))}` : ''}`;
  }
  requestAnimationFrame(frame);
}


// ═══════════════════════ 遊戲資料：艦種、指揮官、技能、作戰 ═══════════════════════
// 一個圖示＝opts.rep 艘（預設 5）。下面的耐久、傷害都是「每個圖示」的數值。

// 艦種：index 與貼圖／3D 模型一致（0 航母、1 戰列、2 巡洋、3 驅逐、4 護衛、5 補給）
//   5 補給艦只編在「補給艦隊」裡；look＝沒有自己的模型／貼圖時借用哪個艦種的外觀
//   aa：艦種的防空係數（防空砲、副砲打飛彈與艦載機的命中率 × aa / AA_TYPE_REF）
// 自動武器（不用按鍵，敵人進入射程就自己用，各艦各自冷卻）：
//   missile：飛彈（巡洋、驅逐）。dmg 每發傷害、cd 冷卻秒數、range 射程、n 攜彈量（打完要回補給艦隊補充）。
//            射程比光束遠、不衰減，但會被防空攔截
//   fighters：攻擊型艦載機（航母專屬）。n 機庫容量、wave 每次放出幾架、cd 出擊間隔（續航見 CRAFT）、
//             build 機庫補一架新機的秒數（被打下的會慢慢補回來，機庫＋在外的不超過 n）
//   supply：補給艦專屬。stock 每艘（圖示）帶的飛彈存量（被擊沉就跟著沒了）
//   repair：維修機（依船的大小）。n 架數、amount 每趟修理量、cd 出動間隔
// 光束武器分三類（每艘船各類一組，各自冷卻、各自選目標）：
//   main 主砲：只能打船頭前方（arc＝左右各幾度），射程最遠、單發最重、轉得慢（打小船命中率更差）
//   sec  副砲：射角大（前方＋兩側），射程中等；打中距離的戰艦，全威力距離內有飛彈／艦載機會先打它們
//   aa   防空砲：全方向，射程短；優先鎖定飛彈、其次艦載機，射程內都沒有才打船
//   dmg 單發傷害、cd 開火間隔（秒）、near 全威力距離、far 最大射程、arc 半射角（度，180＝全方向）、acc 基本命中率
// sh：護盾容量（能量護盾，無方向）。光束、艦載機要先打光護盾才傷到船體；護盾在 SHIELD_RULE.delay 秒沒被打後開始回充
const SHIP_TYPES = [
  { key: 'carrier', name: '航母', cost: 5, hp: 140, sh: 70, speed: 0.85, aa: 0.2,
    guns: { main: null,
      sec: { dmg: 4, cd: 3, near: 160, far: 400, arc: 120, acc: 0.8 },
      aa: { dmg: 1.6, cd: 0.9, near: 100, far: 200, arc: 180, acc: 0.7 } },
    missile: null,
    fighters: { n: 6, wave: 3, cd: 20, range: 1000, build: 14 }, repair: { n: 4, amount: 24, cd: 18 },
    note: '自身火力弱，靠艦載機（自動出擊、返航補給）。也帶最多維修機。' },
  { key: 'battleship', name: '戰列艦', cost: 4, hp: 220, sh: 130, speed: 0.8, aa: 0.15,
    guns: { main: { dmg: 27, cd: 5, near: 350, far: 900, arc: 30, acc: 0.85 },
      sec: { dmg: 8, cd: 2.5, near: 220, far: 520, arc: 120, acc: 0.8 },
      aa: { dmg: 1.5, cd: 1, near: 90, far: 180, arc: 180, acc: 0.7 } },
    missile: null, fighters: null, repair: { n: 3, amount: 24, cd: 18 },
    note: '主砲射程最遠、單發最重，護盾最厚；最慢。主砲只能打正前方。' },
  { key: 'cruiser', name: '巡洋艦', cost: 2.5, hp: 120, sh: 75, speed: 1.0, aa: 0.25,
    guns: { main: { dmg: 15, cd: 4.5, near: 280, far: 700, arc: 30, acc: 0.85 },
      sec: { dmg: 7, cd: 2.5, near: 200, far: 480, arc: 120, acc: 0.8 },
      aa: { dmg: 1.2, cd: 1, near: 90, far: 170, arc: 180, acc: 0.7 } },
    missile: { dmg: 40, cd: 50, range: 800, n: 4 }, fighters: null, repair: { n: 2, amount: 24, cd: 18 },
    note: '均衡；遠距離自動發射飛彈（攜彈 4 發）。' },
  { key: 'destroyer', name: '驅逐艦', cost: 1.5, hp: 70, sh: 35, speed: 1.25, aa: 0.2,
    guns: { main: { dmg: 10, cd: 4, near: 220, far: 520, arc: 25, acc: 0.85 },
      sec: { dmg: 5, cd: 2, near: 160, far: 400, arc: 120, acc: 0.8 },
      aa: { dmg: 1, cd: 1, near: 80, far: 160, arc: 180, acc: 0.7 } },
    missile: { dmg: 40, cd: 36, range: 650, n: 6 }, fighters: null, repair: { n: 1, amount: 24, cd: 18 },
    note: '快、飛彈發射最頻繁（攜彈 6 發）；適合包抄與追擊。' },
  { key: 'escort', name: '護衛艦', cost: 1, hp: 50, sh: 25, speed: 1.3, aa: 0.45,
    guns: { main: null,
      sec: { dmg: 5, cd: 2, near: 160, far: 420, arc: 135, acc: 0.8 },
      aa: { dmg: 1.8, cd: 0.8, near: 100, far: 200, arc: 180, acc: 0.75 } },
    missile: null, fighters: null, repair: null,
    note: '便宜、小而快（難被打中）；防空最好。太小，沒有維修機與主砲。' },
  { key: 'supply', name: '補給艦', cost: 3, hp: 180, sh: 60, speed: 0.8, aa: 0.3, look: 2,
    guns: { main: null, sec: null,
      aa: { dmg: 1.4, cd: 0.9, near: 100, far: 200, arc: 180, acc: 0.7 } },
    missile: null, fighters: null, repair: { n: 2, amount: 24, cd: 18 }, supply: { stock: 40 },
    note: '只有防空砲。範圍內的友艦會自動補充飛彈；被擊沉時它帶的存量跟著損失。只能編在補給艦隊。' },
];
const N_COMBAT = 5, SUPPLY_T = 5;   // 一般艦隊能編的艦種（0～4）、補給艦的 index
// 補給：補給艦 range 內、飛彈沒滿的友艦每 cd 秒補 1 發（從最近的補給艦扣存量）；follow＝跟隨時待在被跟隨艦隊後方多遠
const SUPPLY_RULE = { range: 250, cd: 6, follow: 230 };
const AA_TYPE_REF = 0.275;   // 艦種防空係數的基準（一般編成的平均值 ≈ 0.275，平均起來命中率不變）
// 擬真難度的戰爭迷霧：各艦種的偵測半徑（3D 距離；分艦隊取編成裡最大的那一種）。護衛艦是偵察艦；戰列艦主砲 900 比自己看得到的遠，要靠友軍偵測
const SENSOR_R = [550, 650, 650, 600, 750, 450];   // 航母、戰列、巡洋、驅逐、護衛、補給
SHIP_TYPES.forEach((t, k) => (t.sensor = SENSOR_R[k]));
// 戰爭迷霧（擬真＋迷霧開啟）：自動攻擊只打「知道位置」的敵人（偵測範圍內、掃描結果、艦載機看到的、開火暴露的）
//   tick＝每幾個模擬 tick 重算一次；ftr＝攻擊型艦載機周圍看得到的半徑；expose＝敵艦開火後，被打的艦隊看得到它幾秒
//   scanFirst＝開戰後幾秒才能第一次掃描（自動、手動都一樣）
//   scanR／scanShow／scanCd＝掃描半徑、掃到的顯示幾秒、冷卻（每一方共用；天賦「偵察」每階 −scanCdRecon 秒、偵測半徑 +sensorRecon）
//   ping＝被掃到的一方看得到掃描訊號的方向幾秒；last＝畫面上「最後已知位置」保留幾秒
//   area＝區域攻擊：半徑、持續秒數、看不到目標時的命中率倍率（盲射）
//   自動掃描＝上面的脈衝掃描：還有敵方艦隊看不到時，冷卻好了就自動從艦隊發出（玩家可以在戰術台關掉）
//   recon＝區域掃描（主動）：航母派出偵察機（不佔機庫、沒有武裝）飛到指定的點，在上空盤旋 loiter 秒，半徑 r 的球體內的敵軍都看得到（離開後再保留 scanShow 秒）；
//     天賦「偵察機」每階半徑 +rTal；cd＝每支艦隊的冷卻；speed／hp／size／fuel＝速度、耐久（裝甲薄）、被瞄準的大小係數（難以擊中）、續航秒數
//     eye＝飛行路徑上（去程、回程）偵察機自己看得到的半徑，看到的也一起回報
//     被干擾時偵察機照樣起飛、照樣偵察，但即時回報不了：記在機上，干擾結束或飛回母艦時才回報（成為最後已知位置）；中途被打下來＝情報沒了
const FOW_RULE = { tick: 30, ftr: 250, expose: 4, scanR: 800, scanFirst: 15, scanShow: 6, scanCd: 40, scanCdRecon: 5, sensorRecon: 0.1, ping: 10, last: 60,
  area: { r: 70, dur: 20, blind: 0.5 },
  recon: { r: 350, rTal: 0.2, eye: 300, loiter: 8, cd: 20, speed: [115, 130], hp: 3, size: 0.15, fuel: 70,
    acc: 0.2, min: 0.008, gap: 3 } };   // 很難打中：防空砲、副砲、攔截機的命中率 ×acc（下限 min，一般是 5%），每架每 gap 秒才會被一門砲瞄準一次
const GUN_KEYS = ['main', 'sec', 'aa'];
const GUN_NAME = { main: '主砲', sec: '副砲', aa: '防空' };
// 舊程式用的「光束射程」：取射程最遠的那一門（AI 判斷交戰距離、編成畫面用）
for (const t of SHIP_TYPES) { const g = t.guns.main || t.guns.sec || t.guns.aa; t.beam = { near: g.near, far: g.far, dmg: g.dmg, cd: g.cd }; }
// 命中率＝基本命中率 × 距離 × 目標大小 × 目標速度 × 環境，限制在 5%～97%
const HIT_RULE = {
  farMul: 0.6,                                   // 最大射程時命中率剩幾成（全威力距離內 100%）
  size: [1.15, 1.1, 1.0, 0.85, 0.75, 1.05],      // 目標艦種的大小係數（航母、戰列、巡洋、驅逐、護衛、補給）
  mainSizePow: 1.5,                              // 主砲轉得慢：大小係數再取這個次方（打小船更吃虧）
  speedRef: 25, speedMax: 0.35,                  // 目標速度達 speedRef（每秒單位）時命中率 −35%
  nebula: 0.6,                                   // 開火方或目標在星雲裡
  jammed: 0.85,                                  // 被「干擾」的一方開火
  min: 0.05, max: 0.97,
};
// 對空：防空砲優先打飛彈、其次艦載機；副砲在全威力距離內也會打。命中率同上公式，大小係數換成下面的值
//   formBase＋陣型 aa（橫陣 0.3、圓陣 0.6…）＝對空命中倍率；飛彈一發打中就毀，艦載機有耐久
//   missileShots：每顆飛彈最多被瞄準幾次（太多門砲同時打一顆會全部攔下）；fighterGap：同一架艦載機每隔幾秒才會再被瞄準
const AIR_RULE = { missileSize: 0.45, droneSize: 0.4, formBase: 0.7, droneHp: 6, missileShots: 3, fighterGap: 1.2 };   // 艦載機的大小、耐久見 CRAFT
// 飛彈、艦載機攻擊船的命中率（另外還會被防空砲／副砲攔截）：基本 × 目標大小^sizePow × 目標速度 × 星雲 × 被干擾
//   飛彈有導引：對大小、速度比較不敏感；lance＝光束攻擊機的持續光束
const STRIKE_RULE = {
  missile: { acc: 0.9, sizePow: 0.5, speedMax: 0.2, nebula: 0.75 },
  fighter: { acc: 0.75, sizePow: 1, speedMax: 0.3, nebula: 0.7 },
  lance: { acc: 0.85, sizePow: 0.5, speedMax: 0.2, nebula: 0.7 },
};
// 艦載機（航母機庫，依任務分四種；每支艦隊在編成畫面設定機庫比例，合計＝航母機庫容量）
//   size＝被防空砲瞄準時的大小係數（越小越難打中）；hp 耐久；speed 速度範圍；fuel 續航秒數
//   launch＝這種機只在敵艦隊距離小於此值時才出擊（沒寫就用航母的 fighters.range）
const CRAFT = [
  { key: 'int', name: '攔截機', hp: 8, size: 0.3, speed: [62, 76], fuel: 45,
    note: '留在艦隊上空巡邏，攔截敵方飛彈與艦載機；不打船' },
  { key: 'atk', name: '攻擊機', hp: 8, size: 0.3, speed: [48, 62], fuel: 35, dmg: 12,
    note: '貼近掃射敵艦' },
  { key: 'msl', name: '飛彈攻擊機', hp: 14, size: 0.45, speed: [36, 46], fuel: 40, missiles: 2, dmg: 30, standoff: 320,
    note: '飛到防空射程外發射 2 枚飛彈後返航' },
  { key: 'lance', name: '光束攻擊機', hp: 14, size: 0.45, speed: [36, 46], fuel: 40, dps: 18, channel: 4, cd: 6, range: 55, launch: 450, shieldMul: 1.5, hullMul: 1.5,
    note: '近距離決戰用：敵艦隊進到 450 內才出擊，貼到 55 內照射持續光束 4 秒（約 3～5 次可擊毀戰列艦）；消耗護盾 ×1.5，打穿後對船體傷害 ×1.5' },
];
const HANGAR_DEFAULT = [2, 2, 1, 1];   // 攔截、攻擊、飛彈、光束
// 攔截機：巡邏半徑、交戰半徑（以艦隊中心算）、對艦載機／飛彈的命中率、每發傷害、射擊間隔、開火距離
const INTERCEPT_RULE = { patrol: 160, engage: 340, acc: { fighter: 0.7, missile: 0.5 }, dmg: 3, cd: [0.3, 0.55], range: 60 };
const BEAM_FALLOFF_MIN = 0.5;                    // 距離減傷：最大射程時傷害剩 50%（全威力距離內 100%）
// 護盾回充：最後一次被打 delay 秒後開始，每秒回 rate × 容量
const SHIELD_RULE = { delay: 10, rate: 0.02 };
// 飛彈：護盾還在時，護盾吃 shield 倍、爆炸同時傷到船體 blast 倍；護盾沒了直擊船體 direct 倍
const MISSILE_RULE = { shield: 0.6, blast: 0.35, direct: 1.4 };
const SHIP_ORDER_FRONT_TO_BACK = [4, 3, 2, 1, 5, 0];   // 陣型中由前到後的擺放順序（補給艦在中後方）

// 技能：targetMode＝'enemy' 需要點選敵方分艦隊；scope＝'fleet' 只影響該指揮官的艦隊，'side' 影響全軍
const SKILLS = {
  focus: { name: '集中火力', uses: 2, cd: 60, dur: 20, scope: 'side', targetMode: 'enemy',
    desc: '全軍集中砲擊一支敵方分艦隊，傷害 +20%，持續 20 秒。' },
  wall: { name: '鐵壁', uses: 2, cd: 60, dur: 20, scope: 'fleet',
    desc: '護盾受到的傷害 −40%、船體受到的傷害 −30%，持續 20 秒。' },
  charge: { name: '突進', uses: 2, cd: 45, dur: 15, scope: 'fleet',
    desc: '艦隊向前移動速度 ×1.8，持續 15 秒（倒退、側移不加速）。' },
  rapid: { name: '極速射擊', uses: 2, cd: 60, dur: 15, scope: 'fleet',
    desc: '艦隊光束開火間隔縮短 35%，持續 15 秒。' },
  evade: { name: '機動迴避', uses: 2, cd: 50, dur: 12, scope: 'fleet',
    desc: '艦隊各方向移動速度 ×1.4、受到傷害 −25%，持續 12 秒。' },
  jam: { name: '干擾', uses: 1, cd: 90, dur: 25, scope: 'side',
    desc: '干擾敵軍通訊 25 秒：敵方雷達失效（看到的我方位置停在干擾開始那一刻、兵力與狀態不明，AI 也會用舊情報判斷）；下令變陣（包括原地轉向後的重排、畫陣線）要多等 6 秒才開始；開火（光束、飛彈、防空）命中率 −15%。擬真難度開啟戰爭迷霧時：敵方各艦隊不能共享情報（只看得到自己偵測到的），掃描也沒有結果，偵察機的情報要等飛回母艦才回報。' },
  // targetMode 'point'＝點選地圖上的位置；fixed＝次數不受「戰術熟練」影響
  reinforce: { name: '呼叫增援', uses: 1, cd: 0, dur: 0, scope: 'fleet', targetMode: 'point', fixed: true,
    desc: '點選地圖上的位置：20 秒後一支增援艦隊（本場預算的 25%，照這支艦隊的編成比例）從最近的地圖邊緣進場，開往該位置。每次消耗 1 次增援次數（星際酒館用功勳購買），每位指揮官每場 1 次。' },
};
// 增援：share 兵力＝本場預算的比例、delay 呼叫後幾秒進場、cost 每次的功勳、max 最多存幾次
const REINFORCE_RULE = { share: 0.25, delay: 20, cost: 150, max: 9 };

// 指揮官（原創人物）。trait：固有特性（固定 +8%）；skills：固有技能（不用天賦點數）
// 初始指揮官（faction：0 帝國、1 聯盟）；其他的到「星際酒館」招募（見 tavern.js，招募來的會加進這個陣列）
const COMMANDERS = [
  { id: 'rein', name: '雷恩・瓦爾特', title: '少將', trait: 'dmg', skills: ['focus', 'charge'], faction: 0, base: true, bio: '攻勢型。擅長集中兵力一點突破。' },
  { id: 'erin', name: '艾琳・索拉', title: '少將', trait: 'shield', skills: ['wall', 'focus'], faction: 0, base: true, bio: '守勢型。陣地戰與消耗戰的專家。' },
  { id: 'kas', name: '卡斯・莫德', title: '准將', trait: 'speed', skills: ['charge', 'wall'], faction: 0, base: true, bio: '機動型。喜歡從側翼切入。' },
  { id: 'aaron', name: '亞倫・楊森', title: '少將', trait: 'shield', skills: ['wall', 'jam'], faction: 1, base: true, bio: '守勢型。擅長以干擾打亂敵軍節奏。' },
  { id: 'grace', name: '葛瑞絲・卡特萊', title: '准將', trait: 'dmg', skills: ['focus', 'rapid'], faction: 1, base: true, bio: '攻勢型。相信火力集中就是一切。' },
];
const FACTION_NAME = ['帝國軍', '聯盟軍'];
const TRAIT_NAME = { dmg: '攻擊', shield: '防禦', speed: '機動' };
// 沒有天賦的指揮官（敵方）：特性加成照等級算；玩家的指揮官：固有特性固定 +8%，其餘靠天賦
function traitBonus(trait, level) { return 0.08 + 0.02 * (level - 1); }
const XP_PER_LEVEL = 200;

// ── 天賦：每升一級得 1 點（Lv 1 就有 1 點），可隨時重新分配 ──
// kind 'stat'＝強化能力（可多階）；kind 'skill'＝學會技能；req＝需要的指揮官等級
const TALENT_BRANCHES = [['atk', '攻擊'], ['def', '防禦'], ['mob', '機動'], ['cmd', '指揮']];
const TALENTS = [
  { id: 'gunnery', br: 'atk', name: '砲術訓練', max: 3, cost: 1, desc: (r) => `光束、飛彈、艦載機傷害 +${r * 5}%` },
  { id: 'missile', br: 'atk', name: '飛彈裝填', max: 3, cost: 1, desc: (r) => `飛彈冷卻 −${r * 10}%` },
  { id: 'hangar', br: 'atk', name: '機庫整備', max: 2, cost: 1, desc: (r) => `航母補充新機快 ${r * 30}%、艦載機傷害 +${r * 10}%` },
  { id: 'aim', br: 'atk', name: '精準射擊', max: 3, cost: 1, desc: (r) => `光束對敵艦的命中率 +${r * 5}%；擬真難度：射線擋到友艦時打中它的機率 −${r * 15}%` },
  { id: 'fireline', br: 'atk', name: '火線管制', max: 3, cost: 1, desc: (r) => `擬真難度：射界被同部隊友艦擋住時，誤擊友軍的機率 −${r * 20}%` },
  { id: 's_rapid', br: 'atk', name: '極速射擊', kind: 'skill', skill: 'rapid', cost: 2, req: 3 },
  { id: 'shield', br: 'def', name: '護盾強化', max: 3, cost: 1, desc: (r) => `護盾容量與回充 +${r * 4}%` },
  { id: 'damage', br: 'def', name: '損害管制', max: 3, cost: 1, desc: (r) => `維修機每趟修理量 +${r * 20}%` },
  { id: 'aa', br: 'def', name: '防空網', max: 2, cost: 1, desc: (r) => `防空砲的命中率 ×${(1 + r * 0.08).toFixed(2)}（攔截敵方飛彈與艦載機）` },
  { id: 's_wall', br: 'def', name: '鐵壁', kind: 'skill', skill: 'wall', cost: 2, req: 2 },
  { id: 'engine', br: 'mob', name: '推進強化', max: 3, cost: 1, desc: (r) => `移動速度 +${r * 5}%` },
  { id: 'drill', br: 'mob', name: '陣型演練', max: 2, cost: 1, desc: (r) => `變換陣型時間 −${r * 12}%` },
  { id: 'perfect', br: 'mob', name: '完美布陣', max: 3, cost: 1, desc: (r) => `擬真難度：射界被同部隊友艦擋住時照樣開火（不停火），誤擊友軍的傷害 −${r * 25}%` },
  { id: 's_charge', br: 'mob', name: '突進', kind: 'skill', skill: 'charge', cost: 2, req: 2 },
  { id: 's_evade', br: 'mob', name: '機動迴避', kind: 'skill', skill: 'evade', cost: 2, req: 3 },
  { id: 'recon', br: 'cmd', name: '偵察', max: 2, cost: 1, desc: (r) => (r >= 2 ? '戰前情報準確度 +24%，並看得到敵方的打法與編成' : '戰前情報準確度 +12%') + `；戰爭迷霧：這支艦隊的偵測半徑 +${r * 10}%、掃描冷卻 −${r * 5} 秒` },
  { id: 'survey', br: 'cmd', name: '偵察機', max: 3, cost: 1, desc: (r) => `戰爭迷霧：區域掃描（航母的偵察機）的掃描半徑 +${r * 20}%` },
  { id: 'veteran', br: 'cmd', name: '戰術熟練', max: 2, cost: 1, desc: (r) => `每個技能每場多 ${r} 次` },
  { id: 'tempo', br: 'cmd', name: '指揮效率', max: 2, cost: 1, desc: (r) => `技能冷卻 −${r * 15}%` },
  { id: 's_focus', br: 'cmd', name: '集中火力', kind: 'skill', skill: 'focus', cost: 2, req: 2 },
  { id: 's_jam', br: 'cmd', name: '干擾', kind: 'skill', skill: 'jam', cost: 2, req: 4 },
  { id: 's_reinf', br: 'cmd', name: '呼叫增援', kind: 'skill', skill: 'reinforce', cost: 2, req: 5 },
];
const TALENT_BY_ID = Object.fromEntries(TALENTS.map((t) => [t.id, t]));
function talentRank(c, id) { return (c && c.tal && c.tal[id]) || 0; }
// 指揮官能用的技能＝固有技能＋天賦學會的
function commanderSkills(base, tal) { const out = base.slice(); for (const t of TALENTS) if (t.kind === 'skill' && tal && tal[t.id] && !out.includes(t.skill)) out.push(t.skill); return out; }

// 敵方的偏好打法（AI 會照這個行動；難度越高越會針對玩家反制）
const TACTICS = {
  push: { name: '正面推進', desc: '推進到中距離後維持陣線對射。' },
  kite: { name: '遠距離消耗', desc: '保持在戰列艦的射程邊緣；被逼近就後退。' },
  flank: { name: '側翼包抄', desc: '主力牽制正面，另一支艦隊繞向側翼。' },
  breakthrough: { name: '中央突破', desc: '紡錘陣直衝玩家中央。' },
};

// 地形（3D）：每個地形是一顆球（x, y, z, r）。nebula＝命中率下降（HIT_RULE.nebula；射擊方或目標在內）；asteroid＝移動速度 ×0.5；
// rock＝實體障礙（solid）：船過不去、光束與飛彈會被擋住，可以躲在後面
const TERRAIN_TYPES = {
  nebula: { name: '電離星雲', desc: '區域內命中率下降（光束 −40%、飛彈 −25%、艦載機 −30%；射擊方或目標在星雲內都算）。', color: 0x7a5cff },
  asteroid: { name: '小行星帶', desc: '區域內移動速度 −50%。', color: 0xb08a5a },
  rock: { name: '巨大小行星', desc: '實體障礙：艦隊無法穿越（會從旁邊或上下繞過），光束與飛彈也會被擋住，可以拿來掩護。', color: 0x9a8d7c, solid: true },
};
const ALT_RANGE = 400;   // 戰場的高度範圍 ±400（y＝0 是基準面）

// ── 作戰 ──
// 敵方艦隊：comp＝各艦種圖示數 [航母, 戰列, 巡洋, 驅逐, 護衛]
// intel：情報準確度（0～1，影響數量誤差）與看不到的項目
// aiOmni：true＝這一關的 AI 全知（擬真難度的戰爭迷霧不限制敵方，偵測、自動攻擊都照看得到全部；預設不開）
const SCENARIOS = [
  {
    id: 's1', name: '邊境遭遇戰', size: '小型', timeLimit: 240, budget: 2700, maxFleets: 2, level: 1, seed: 101,
    story: '巡邏艦隊在邊境星域與敵方前鋒遭遇。敵軍規模不大，正面推進。擊退它。',
    terrain: [{ type: 'rock', x: -280, y: 40, z: -60, r: 60 }, { type: 'rock', x: 260, y: -70, z: 20, r: 48 }],
    enemy: [
      { name: '敵前鋒艦隊', commander: { name: '巴爾克', trait: 'dmg', level: 1, skills: ['focus'] },
        comp: [0, 140, 300, 420, 400], formation: 'line', tactic: 'push', x: 0, z: -660, h: 0 },
    ],
    events: [],
    intel: { accuracy: 0.9, hide: [] },
  },
  {
    id: 's2', name: '星雲伏擊', size: '中型', timeLimit: 360, budget: 4400, maxFleets: 3, level: 2, seed: 202,
    story: '敵軍在星雲兩側布陣，主力打算拉開距離消耗我方，另一支艦隊伺機包抄。情報不完整。',
    terrain: [{ type: 'nebula', x: 0, y: -40, z: 0, r: 240 }, { type: 'rock', x: -420, y: 90, z: -120, r: 70 }, { type: 'rock', x: 330, y: -30, z: 110, r: 55 }],
    enemy: [
      { name: '敵主力艦隊', commander: { name: '霍斯特', trait: 'shield', level: 2, skills: ['wall', 'focus'] },
        comp: [60, 320, 380, 200, 200], formation: 'crescent', tactic: 'kite', x: -150, z: -710, h: 0 },
      { name: '敵機動艦隊', commander: { name: '佩蕾', trait: 'speed', level: 2, skills: ['charge'] },
        comp: [0, 0, 160, 420, 220], formation: 'column', tactic: 'flank', x: 380, y: 150, z: -630, h: 0 },
    ],
    events: [{ type: 'reinforce', chance: 0.4, at: [70, 130], name: '敵增援艦隊',
      comp: [0, 80, 160, 220, 140], formation: 'line', edge: 'left' }],
    intel: { accuracy: 0.65, hide: ['events'] },
  },
  {
    id: 's3', name: '要塞前哨突破', size: '大型', timeLimit: 540, budget: 5600, maxFleets: 3, level: 3, seed: 303,
    story: '敵方前哨站由小行星帶掩護，守軍擅長中央突破反擊，而且可能藏有預備隊。偵察情報極少。',
    terrain: [{ type: 'asteroid', x: -260, y: -60, z: -40, r: 170 }, { type: 'asteroid', x: 280, y: 70, z: 20, r: 150 },
      { type: 'rock', x: -250, y: -40, z: -60, r: 62 }, { type: 'rock', x: 300, y: 90, z: 0, r: 70 }, { type: 'rock', x: 30, y: 10, z: -250, r: 85 }],
    enemy: [
      { name: '敵突擊艦隊', commander: { name: '格倫', trait: 'dmg', level: 3, skills: ['charge', 'focus'] },
        comp: [0, 110, 420, 480, 220], formation: 'spindle', tactic: 'breakthrough', x: 0, z: -690, h: 0 },
      { name: '敵守備艦隊', commander: { name: '奧德', trait: 'shield', level: 3, skills: ['wall'] },
        comp: [120, 320, 300, 120, 260], formation: 'line', tactic: 'push', x: -320, y: -110, z: -750, h: 0 },
    ],
    events: [{ type: 'reinforce', chance: 0.7, at: [90, 160], name: '敵預備隊',
      comp: [40, 160, 220, 160, 120], formation: 'crescent', edge: 'right' }],
    intel: { accuracy: 0.45, hide: ['comp', 'events', 'tactic'] },
  },
];
// 部署區（世界座標）：玩家在下方（靠鏡頭），面向上方（−z）
//   ZONE_SHIFT＝部署區往外推的距離：雙方起始距離（約 1300）大於偵測半徑、自動掃描半徑，開戰時彼此看不到（戰爭迷霧）
//   舊編成存的位置（z < DEPLOY_ZONE.z0）載入時一起往後推（zoneFix）
const ZONE_SHIFT = 330;
const DEPLOY_ZONE = { x0: -520, x1: 520, z0: 170 + ZONE_SHIFT, z1: 420 + ZONE_SHIFT };
const ENEMY_ZONE = { x0: -560, x1: 560, z0: -460 - ZONE_SHIFT, z1: -200 - ZONE_SHIFT };
const MAP_BOUNDS = { x0: -1000, x1: 1000, z0: -1000, z1: 1000 };

// 預設武器掛點（船體模型座標：船長＝1，船頭＋z、上＋y）；w＝武器編號，r＝轉向（度），t＝側傾（度），s＝尺寸
const MOUNTS_DEFAULT = {"e0":[{"w":3,"p":[-0.2333,0.0083,0.4],"r":0,"s":0.06},{"w":3,"p":[-0.0444,0.0088,0.4],"r":0,"s":0.06},{"w":3,"p":[-0.2667,0.0061,-0.3778],"r":0,"s":0.06},{"w":3,"p":[-0.0111,-0.0015,-0.3778],"r":0,"s":0.06},{"w":1,"p":[0.1156,-0.0227,0.0267],"r":90,"s":0.1},{"w":1,"p":[-0.3,0.0035,0.1556],"r":0,"s":0.09},{"w":2,"p":[0.0267,0.008,-0.1556],"r":90,"s":0.08},{"w":2,"p":[0.0267,0,0.2],"r":90,"s":0.08}],"e1":[{"w":0,"p":[0,-0.0331,0.112],"r":0,"s":0.21},{"w":0,"p":[0,-0.0015,-0.0498],"r":0,"s":0.23},{"w":0,"p":[0,-0.0015,-0.4231],"r":180,"s":0.22},{"w":1,"p":[0,-0.0352,0.3484],"r":0,"s":0.11},{"w":1,"p":[-0.0996,-0.033,-0.112],"r":-90,"s":0.12},{"w":1,"p":[0.0996,-0.0336,-0.112],"r":90,"s":0.12},{"w":3,"p":[-0.1095,-0.0419,0.0311],"r":0,"s":0.07},{"w":3,"p":[0.1095,-0.0426,0.0311],"r":0,"s":0.07},{"w":3,"p":[-0.0871,-0.0189,-0.2987],"r":0,"s":0.06},{"w":3,"p":[0.0871,-0.0188,-0.2987],"r":0,"s":0.06},{"w":2,"p":[-0.1195,-0.0498,0.1493],"r":-90,"s":0.09},{"w":2,"p":[0.1195,-0.0505,0.1493],"r":90,"s":0.09}],"e2":[{"w":1,"p":[0,0.0385,0.112],"r":0,"s":0.2},{"w":1,"p":[0,0.0508,-0.2987],"r":180,"s":0.2},{"w":5,"p":[0,0.0251,0.3484],"r":0,"s":0.14},{"w":4,"p":[-0.0722,0.0174,0.0373],"r":0,"s":0.1},{"w":4,"p":[0.0722,0.0171,0.0373],"r":0,"s":0.1},{"w":3,"p":[-0.0871,0.0242,-0.0871],"r":0,"s":0.06},{"w":3,"p":[0.0871,0.0241,-0.0871],"r":0,"s":0.06},{"w":3,"p":[-0.0996,-0.0197,-0.3111],"r":0,"s":0.06},{"w":3,"p":[0.0996,-0.0191,-0.3111],"r":0,"s":0.06}],"e3":[{"w":1,"p":[0,0.0065,0.0373],"r":0,"s":0.17},{"w":5,"p":[0,-0.0145,0.2738],"r":0,"s":0.16},{"w":3,"p":[-0.0498,-0.0163,0.1182],"r":0,"s":0.06},{"w":3,"p":[0.0498,-0.0162,0.1182],"r":0,"s":0.06},{"w":4,"p":[-0.1145,-0.09,-0.0747],"r":0,"s":0.1},{"w":4,"p":[0.1145,-0.0899,-0.0747],"r":0,"s":0.1}],"e4":[{"w":3,"p":[0,0.1175,-0.1493],"r":0,"s":0.1},{"w":3,"p":[-0.0062,0.0507,0],"r":0,"s":0.09},{"w":3,"p":[-0.168,-0.0631,-0.1307],"r":0,"s":0.06},{"w":3,"p":[0.168,-0.0627,-0.1307],"r":0,"s":0.06},{"w":1,"p":[0,0.0479,0.1867],"r":0,"s":0.1}],"a0":[{"w":3,"p":[-0.1083,-0.003,0.2091],"r":0,"s":0.07},{"w":3,"p":[0.1095,-0.0025,0.2091],"r":0,"s":0.07},{"w":3,"p":[0.1207,0.0258,-0.1493],"r":0,"s":0.06},{"w":1,"p":[-0.0933,0.12,-0.1929],"r":0,"s":0.09},{"w":2,"p":[0.112,0.021,-0.336],"r":0,"s":0.06},{"w":2,"p":[0.112,0.0202,-0.0249],"r":0,"s":0.06}],"a1":[{"w":0,"p":[0,-0.002,0.1717],"r":0,"s":0.2},{"w":0,"p":[0,0.007,0.0436],"r":0,"s":0.21},{"w":0,"p":[0,0.017,-0.0871],"r":0,"s":0.22},{"w":5,"p":[0,0.0014,0.3422],"r":0,"s":0.2},{"w":3,"p":[-0.0933,-0.0346,-0.3858],"r":0,"s":0.06},{"w":3,"p":[0.0933,-0.0338,-0.3858],"r":0,"s":0.06},{"w":2,"p":[-0.1058,-0.0074,-0.0809],"r":0,"s":0.06},{"w":2,"p":[-0.1058,-0.0073,-0.1556],"r":0,"s":0.06},{"w":2,"p":[0.102,-0.0074,-0.0809],"r":0,"s":0.06},{"w":2,"p":[0.102,-0.0074,-0.1556],"r":0,"s":0.06},{"w":3,"p":[-0.0684,-0.0034,0.0249],"r":0,"s":0.05},{"w":3,"p":[0.0684,-0.0041,0.0249],"r":0,"s":0.05}],"a2":[{"w":1,"p":[-0.0062,0.0079,-0.3298],"r":180,"s":0.19},{"w":1,"p":[0,0.0019,0.1618],"r":0,"s":0.15},{"w":2,"p":[0,0.027,0.0498],"r":0,"s":0.06},{"w":2,"p":[0,0.0277,-0.0187],"r":0,"s":0.06},{"w":3,"p":[-0.056,0.0045,0.0249],"r":0,"s":0.06},{"w":3,"p":[-0.056,0.0047,-0.056],"r":0,"s":0.06},{"w":3,"p":[0.0498,0.0046,0.0249],"r":0,"s":0.06},{"w":3,"p":[0.0498,0.0049,-0.056],"r":0,"s":0.06},{"w":4,"p":[-0.112,-0.0142,-0.0373],"r":0,"s":0.08},{"w":4,"p":[0.1058,-0.0105,-0.0373],"r":0,"s":0.08}],"a3":[{"w":5,"p":[0,0.0416,0.1493],"r":0,"s":0.28},{"w":1,"p":[0.0025,0.0671,-0.0622],"r":0,"s":0.12},{"w":3,"p":[-0.0772,0.0565,-0.1867],"r":0,"s":0.07},{"w":3,"p":[0.0747,0.0566,-0.1867],"r":0,"s":0.07},{"w":2,"p":[-0.0871,0.0375,0],"r":0,"s":0.06},{"w":2,"p":[0.0871,0.038,0],"r":0,"s":0.06},{"w":4,"p":[-0.1556,0.023,-0.1742],"r":0,"s":0.09},{"w":4,"p":[0.1556,0.023,-0.1742],"r":0,"s":0.09}],"a4":[{"w":3,"p":[0,0.134,-0.1333],"r":0,"s":0.1},{"w":3,"p":[0.3111,0.0228,-0.1333],"r":0,"s":0.07},{"w":3,"p":[-0.3111,0.0327,-0.1333],"r":0,"s":0.07},{"w":1,"p":[0,0.1264,0.3333],"r":0,"s":0.1},{"w":2,"p":[0,0.122,0.0444],"r":0,"s":0.06}]};

// ═══════════════════════ 武器：掛點資料、2D 疊圖、配置編輯器 ═══════════════════════
// 掛點用船體模型座標（船長＝1，船頭＋z、上＋y、右＋x）。3D 直接當實例畫在船上；
// 2D 則用同一套掛點，從與原始貼圖相同的鏡頭把武器算成一張疊圖（被船身擋住的部分會被遮掉）
const WEAPON_NAMES = [
  ['三聯裝巨砲塔', '雙聯裝砲塔', '舷砲砲座模組', '防空砲塔', '魚雷發射管組', '金色衝角砲'],
  ['三聯裝主砲塔', '雙聯裝副砲塔', '垂直飛彈發射模組', '防空砲塔', '魚雷發射管組', '貫穿式主砲'],
];
const WEAPON_DEF_S = [0.2, 0.12, 0.08, 0.06, 0.09, 0.18];   // 新放上去的預設尺寸（船長的比例）
const HULL_NAMES = ['航空母艦', '戰列艦', '巡洋艦', '驅逐艦', '護衛艦'];
// 2D 貼圖的鏡頭校正（用船體輪廓對齊原圖求得，30° 俯角、正交）：每單位幾 px、垂直位移 px
const ATLAS_CAL = { e0: [244, -5.0], e1: [252, -12.3], e2: [248, -10.7], e3: [248, -14.5], e4: [248, -12.6], a0: [248, -6.6], a1: [248, -6.4], a2: [248, -10.0], a3: [248, -1.0], a4: [252, 4.3] };
const HULL_KEYS = ['e0', 'e1', 'e2', 'e3', 'e4', 'a0', 'a1', 'a2', 'a3', 'a4'];
const D2R = Math.PI / 180;
const MOUNT_STORE = 'fleet.mounts';

function cloneMounts(o) { return JSON.parse(JSON.stringify(o)); }
function validMount(m) { return !!m && Number.isInteger(m.w) && m.w >= 0 && m.w < 6 && Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite) && Number.isFinite(m.s) && m.s > 0; }
function cleanMount(m) { return { w: m.w, p: m.p.map((v) => Math.round(v * 10000) / 10000), r: Math.round((+m.r || 0) * 10) / 10, t: Math.round((+m.t || 0) * 10) / 10, s: Math.round(m.s * 10000) / 10000 }; }
function readMounts(obj) {   // 不認得的鍵、壞掉的項目都略過；沒有的艦種用預設
  const d = cloneMounts(MOUNTS_DEFAULT), src = obj && (obj.m || obj);
  if (src && typeof src === 'object') for (const k of HULL_KEYS) if (Array.isArray(src[k])) d[k] = src[k].filter(validMount).map(cleanMount);
  return d;
}
let MOUNTS = (() => { try { return readMounts(JSON.parse(STORE.getItem(MOUNT_STORE) || 'null')); } catch (e) { return readMounts(null); } })();
function saveMounts() { try { STORE.setItem(MOUNT_STORE, JSON.stringify({ v: 1, m: MOUNTS })); } catch (e) { /* 只在本次有效 */ } }
function mountsOf(hk) { return (MOUNTS[hk] || []).map((m) => ({ ...m, hk })); }
function mountsChanged(hk) { saveMounts(); R3.version = -1; scheduleWeaponAtlas(hk); }

// ───── 武器疊圖（2D）─────
const WA = { scene: null, cam: null, rt: null, pool: [], hull: null, ship: null, timer: 0, dirty: new Set(), busy: false };
function weaponScene() {
  if (WA.scene) return WA.scene;
  const sc = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.7); sun.position.set(-0.55, 0.85, 0.55);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 0.7); rim.position.set(0.6, 0.3, -0.7);
  sc.add(sun, rim, new THREE.HemisphereLight(0x9fb8ff, 0x221a24, 1.0), new THREE.AmbientLight(0x50586a, 0.55));
  WA.ship = new THREE.Group(); sc.add(WA.ship);
  WA.hull = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false }));   // 船身只寫深度：擋住後面的武器
  WA.hull.renderOrder = -1; WA.ship.add(WA.hull);
  WA.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
  WA.cam.position.copy(CAM_DIR).multiplyScalar(10); WA.cam.lookAt(0, 0, 0);
  return (WA.scene = sc);
}
function setMountObj(o, m) { o.position.set(m.p[0], m.p[1], m.p[2]); o.rotation.set(0, (m.r || 0) * D2R, (m.t || 0) * D2R, 'ZYX'); o.scale.setScalar(m.s); }
function poseWeaponShip(hk, list, lod) {
  WA.hull.geometry = getModel(hk).lods[0];
  let n = 0;
  for (const m of list) {
    const W = getModel(hk[0] + 'w' + m.w); if (!W) continue;
    let o = WA.pool[n]; if (!o) { o = new THREE.Mesh(); WA.ship.add(o); WA.pool[n] = o; }
    o.geometry = W.lods[Math.min(lod, W.lods.length - 1)]; o.material = W.mat; o.visible = true; setMountObj(o, m); n++;
  }
  for (let i = n; i < WA.pool.length; i++) WA.pool[i].visible = false;
}
// cells：[{ hk, d, x, y }]，x/y＝該格在 rt 裡的左下角（px）；每格 256×192
// 每格先畫進一張小的多重取樣暫存圖（抗鋸齒），再貼進 rt 的那一格（rt 本身不做多重取樣，才能只更新部分格子）
const WCOPY = { scene: null, cam: null, mat: null };
function renderWeaponCells(rdr, rt, cells, list) {
  weaponScene();
  if (!WCOPY.scene) {
    WCOPY.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: null } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = texture2D(map, vUv); }' });
    WCOPY.scene = new THREE.Scene(); WCOPY.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), WCOPY.mat)); WCOPY.cam = new THREE.Camera();
  }
  if (!rdr.__wcell) rdr.__wcell = new THREE.WebGLRenderTarget(256, 192, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const cell = rdr.__wcell; WCOPY.mat.uniforms.map.value = cell.texture;
  const prevRT = rdr.getRenderTarget(), prevAuto = rdr.autoClear, cc = rdr.getClearColor(new THREE.Color()), ca = rdr.getClearAlpha();
  rdr.setClearColor(0x000000, 0);
  const mips = rt.texture.generateMipmaps; rt.texture.generateMipmaps = false;
  for (const c of cells) {
    const [k, oy] = ATLAS_CAL[c.hk];
    WA.cam.left = -128 / k; WA.cam.right = 128 / k; WA.cam.top = (96 + oy) / k; WA.cam.bottom = (oy - 96) / k; WA.cam.updateProjectionMatrix();
    WA.ship.rotation.y = -c.d * Math.PI / 4;
    poseWeaponShip(c.hk, list ? list(c.hk) : (MOUNTS[c.hk] || []), 1);   // 2D 格子只有 256 px：武器用第 1 級就夠
    rdr.autoClear = true; rdr.setRenderTarget(cell); rdr.render(WA.scene, WA.cam);
    rdr.autoClear = false; rt.viewport.set(c.x, c.y, 256, 192); rt.scissor.set(c.x, c.y, 256, 192); rt.scissorTest = true;
    rdr.setRenderTarget(rt); rdr.render(WCOPY.scene, WCOPY.cam);   // 不混色：整格覆蓋（含透明處）
  }
  rt.viewport.set(0, 0, rt.width, rt.height); rt.scissor.set(0, 0, rt.width, rt.height); rt.scissorTest = false;
  if (mips) { rt.texture.generateMipmaps = true; rdr.setRenderTarget(rt); rdr.render(new THREE.Scene(), WCOPY.cam); }   // 最後一次才產生 mipmap
  rdr.setRenderTarget(prevRT); rdr.autoClear = prevAuto; rdr.setClearColor(cc, ca);
}
function atlasCells(hk) { const side = hk[0] === 'a' ? 1 : 0, t = +hk[1]; return Array.from({ length: 8 }, (_, d) => ({ hk, d, x: (side * 8 + d) * 256, y: 1024 - (t + 1) * 192 })); }
async function buildWeaponAtlas(only) {
  const keys = only && only.length ? only : HULL_KEYS;
  const need = new Set(); for (const hk of keys) { need.add(hk); for (const m of MOUNTS[hk] || []) need.add(hk[0] + 'w' + m.w); }
  await Promise.all([...need].map((k) => getModel(k) && getModel(k).ready));
  if (!WA.rt) {
    WA.rt = new THREE.WebGLRenderTarget(4096, 1024, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    WA.rt.texture.anisotropy = 4;
    renderWeaponCells(renderer, WA.rt, HULL_KEYS.flatMap(atlasCells));
  } else renderWeaponCells(renderer, WA.rt, keys.flatMap(atlasCells));
  applyWeapon2D();
}
function applyWeapon2D() { shipMat.uniforms.uWTex.value = WA.rt && SETTINGS.weapons2D !== false ? WA.rt.texture : NO_WTEX; }
function scheduleWeaponAtlas(hk) {
  if (hk) WA.dirty.add(hk); else HULL_KEYS.forEach((k) => WA.dirty.add(k));
  clearTimeout(WA.timer);
  WA.timer = setTimeout(async () => {
    if (WA.busy) { scheduleWeaponAtlas(); return; }
    WA.busy = true; const keys = [...WA.dirty]; WA.dirty.clear();
    try { await buildWeaponAtlas(WA.rt ? keys : null); } catch (e) { console.warn('weapon atlas', e); }
    WA.busy = false;
  }, WA.rt ? 120 : 30);
}

// ═════ 武器配置編輯器 ═════
const WE = { el: null, open: false, hk: 'e1', sel: -1, place: -1, undo: [], redo: [], back: null };
function weaponEditorOpen() { return WE.open; }
function openWeaponEditor(back) {
  WE.back = back || null; WE.open = true; WE.sel = -1; WE.place = -1; WE.undo = []; WE.redo = [];
  if (!WE.el) buildWeaponEditor();
  WE.el.hidden = false;
  weResize(); weLoadHull(); weCamPreset('iso');
}
function closeWeaponEditor() {
  if (!WE.open) return;
  WE.open = false; WE.el.hidden = true; cancelAnimationFrame(WE.raf); WE.raf = 0;
  scheduleWeaponAtlas();
  const b = WE.back; WE.back = null; if (b) b();
}
function buildWeaponEditor() {
  const el = WE.el = document.createElement('div'); el.id = 'wed'; el.hidden = true;
  el.innerHTML = `<div class="wed-top"><h2>武器配置</h2>
      <div class="wed-seg" id="wed-fac"><button data-f="e">帝國軍</button><button data-f="a">聯盟軍</button></div>
      <div class="wed-seg" id="wed-type">${HULL_NAMES.map((n, i) => `<button data-t="${i}">${n}</button>`).join('')}</div>
      <span class="g-sp"></span>
      <button class="g-btn sm" id="wed-undo" title="復原（Ctrl＋Z）">↶</button><button class="g-btn sm" id="wed-redo" title="重做（Ctrl＋Y）">↷</button>
      <button class="g-btn sm" id="wed-io">匯出／匯入</button><label class="wed-chk" title="編輯有對稱夥伴的武器時，另一側跟著動"><input type="checkbox" id="wed-sym" checked>左右對稱</label><button class="g-btn sm" id="wed-reset">此艦預設</button><button class="g-btn sm" id="wed-resetall">全部預設</button>
      <button class="g-btn sm pri" id="wed-done">完成</button></div>
    <div class="wed-body">
      <div class="wed-view" id="wed-view"><canvas id="wed-c"></canvas>
        <div class="wed-cams"><button class="g-btn sm" data-cam="iso">斜視</button><button class="g-btn sm" data-cam="top">俯視</button><button class="g-btn sm" data-cam="side">側視</button><button class="g-btn sm" data-cam="front">正面</button><button class="g-btn sm" data-cam="game">遊戲角度</button></div>
        <div class="wed-hint" id="wed-hint"></div></div>
      <div class="wed-side">
        <h4>新增武器 <small>點選後在船身上點一下放置；按住 Shift 可連續放</small></h4><div class="wed-pal" id="wed-pal"></div>
        <h4>掛點 <small id="wed-n"></small></h4><div class="wed-list" id="wed-list"></div>
        <h4>選取的掛點</h4><div id="wed-prop"></div>
      </div>
    </div>
    <div class="wed-2d"><div class="wed-2dh"><b>2D 八方向預覽</b><span class="g-dim">遊戲的 2D 畫面會用這個疊圖（被船身擋住的部分會自動遮掉）</span></div><canvas id="wed-2d" width="2048" height="192"></canvas></div>
    <div class="wed-modal" id="wed-modal" hidden><div class="g-card"><h3>匯出／匯入掛點</h3>
      <p class="g-dim">複製下面的文字就能保存或分享目前全部艦種的掛點；貼上別人的文字後按「套用」。</p>
      <textarea id="wed-json" spellcheck="false"></textarea>
      <div class="g-row"><span id="wed-iomsg" class="g-dim"></span><span class="g-sp"></span><button class="g-btn sm" id="wed-copy">複製</button><button class="g-btn sm" id="wed-apply">套用</button><button class="g-btn sm" id="wed-ioclose">關閉</button></div></div></div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector('#' + id);
  WE.cv = $('wed-c'); WE.c2 = $('wed-2d');
  WE.r = new THREE.WebGLRenderer({ canvas: WE.cv, antialias: true });
  WE.r.setPixelRatio(Math.min(devicePixelRatio, 2)); WE.r.outputColorSpace = THREE.SRGBColorSpace;
  WE.r.toneMapping = THREE.ACESFilmicToneMapping; WE.r.toneMappingExposure = 1.15;
  WE.scene = new THREE.Scene(); WE.scene.background = new THREE.Color(0x0a1020);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0); sun.position.set(-0.6, 0.8, 0.35);
  WE.scene.add(sun, new THREE.HemisphereLight(0x8fb2ff, 0x1a1020, 0.9), new THREE.AmbientLight(0x404858, 0.6));
  const grid = new THREE.GridHelper(1.4, 28, 0x34507a, 0x1c2a44); grid.material.transparent = true; grid.material.opacity = 0.5; WE.grid = grid; WE.scene.add(grid);
  const bow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0.56), 0.1, 0xf2b35a, 0.04, 0.03); WE.scene.add(bow);
  WE.hullMesh = new THREE.Mesh(); WE.scene.add(WE.hullMesh);
  WE.wGroup = new THREE.Group(); WE.scene.add(WE.wGroup);
  WE.box = new THREE.BoxHelper(undefined, 0xffd27a); WE.box.visible = false; WE.scene.add(WE.box);
  WE.ghost = new THREE.Mesh(); WE.ghost.visible = false; WE.scene.add(WE.ghost);
  WE.cam = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  WE.orb = { yaw: 0.8, pitch: 0.5, dist: 1.9, tx: 0, ty: 0, tz: 0 };
  WE.ray = new THREE.Raycaster(); WE.rt2 = new THREE.WebGLRenderTarget(2048, 192, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace });
  WE.shipImg = new Image(); WE.shipImg.src = SHIP_ATLAS; WE.shipImg.onload = () => weDraw2D();
  $('wed-fac').onclick = (e) => { const f = e.target.dataset.f; if (f) { WE.hk = f + WE.hk[1]; weLoadHull(); } };
  $('wed-type').onclick = (e) => { const t = e.target.dataset.t; if (t != null) { WE.hk = WE.hk[0] + t; weLoadHull(); } };
  $('wed-done').onclick = closeWeaponEditor;
  $('wed-undo').onclick = weUndo; $('wed-redo').onclick = weRedo;
  $('wed-reset').onclick = () => { weSnap(); MOUNTS[WE.hk] = cloneMounts(MOUNTS_DEFAULT[WE.hk]); WE.sel = -1; weChanged(); };
  $('wed-resetall').onclick = () => { weSnap(); MOUNTS = readMounts(null); WE.sel = -1; weChanged(true); };
  $('wed-io').onclick = () => { $('wed-json').value = JSON.stringify({ v: 1, m: MOUNTS }); $('wed-iomsg').textContent = ''; $('wed-modal').hidden = false; };
  $('wed-ioclose').onclick = () => { $('wed-modal').hidden = true; };
  $('wed-copy').onclick = () => { const t = $('wed-json'); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 無法複製 */ } if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(() => ($('wed-iomsg').textContent = '已複製'), () => {}); $('wed-iomsg').textContent = ok ? '已複製' : '已選取，請按 Ctrl＋C'; };
  $('wed-apply').onclick = () => {
    try { const o = JSON.parse($('wed-json').value); weSnap(); MOUNTS = readMounts(o); WE.sel = -1; weChanged(true); $('wed-iomsg').textContent = '已套用'; }
    catch (e) { $('wed-iomsg').textContent = '格式不對：' + e.message; }
  };
  el.querySelector('.wed-cams').onclick = (e) => { const c = e.target.dataset.cam; if (c) weCamPreset(c); };
  $('wed-pal').onclick = (e) => { const b = e.target.closest('[data-w]'); if (!b) return; const w = +b.dataset.w; WE.place = WE.place === w ? -1 : w; weUI(); };
  $('wed-list').onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; WE.sel = +b.dataset.i; WE.place = -1; weUI(); weSync(); };
  // 3D 視窗操作
  const cv = WE.cv;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', wePointerDown);
  cv.addEventListener('pointermove', wePointerMove);
  cv.addEventListener('pointerup', wePointerUp); cv.addEventListener('pointercancel', wePointerUp);
  cv.addEventListener('pointerleave', () => { WE.ghost.visible = false; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); WE.orb.dist = Math.min(6, Math.max(0.25, WE.orb.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  addEventListener('keydown', weKey);
  addEventListener('resize', () => { if (WE.open) weResize(); });
}
function weResize() {
  const v = WE.el.querySelector('#wed-view'), w = Math.max(50, v.clientWidth), h = Math.max(50, v.clientHeight);
  WE.r.setSize(w, h, false); WE.cam.aspect = w / h; WE.cam.updateProjectionMatrix();
}
function weCamPreset(c) {
  const o = WE.orb; o.tx = 0; o.ty = 0; o.tz = 0;
  if (c === 'top') { o.yaw = Math.PI; o.pitch = 1.5; o.dist = 2.1; }
  else if (c === 'side') { o.yaw = Math.PI / 2; o.pitch = 0.02; o.dist = 2.0; }
  else if (c === 'front') { o.yaw = 0; o.pitch = 0.1; o.dist = 1.5; }
  else if (c === 'game') { o.yaw = -Math.PI / 2; o.pitch = ELEV; o.dist = 2.0; }
  else { o.yaw = 0.75; o.pitch = 0.5; o.dist = 1.6; }
  if (!WE.raf) weLoop();
}
function weLoadHull() {
  const M = getModel(WE.hk);
  WE.hullMesh.geometry = M.lods[0]; WE.hullMesh.material = M.mat;
  WE.sel = -1; WE.place = -1;
  const need = [WE.hk, ...[0, 1, 2, 3, 4, 5].map((w) => WE.hk[0] + 'w' + w)];
  Promise.all(need.map((k) => getModel(k).ready)).then(() => weDraw2D());
  weSync(); weUI(); if (!WE.raf) weLoop();
}
function weMounts() { return MOUNTS[WE.hk] || (MOUNTS[WE.hk] = []); }
// 3D 場景跟著資料重建
function weSync() {
  const list = weMounts(), g = WE.wGroup;
  while (g.children.length > list.length) g.remove(g.children[g.children.length - 1]);
  list.forEach((m, i) => {
    let o = g.children[i]; if (!o) { o = new THREE.Mesh(); g.add(o); }
    const W = getModel(WE.hk[0] + 'w' + m.w); o.geometry = W.lods[0]; o.material = W.mat; o.userData.i = i; setMountObj(o, m);
  });
  const s = g.children[WE.sel];
  WE.box.visible = !!s; if (s) { s.updateMatrixWorld(true); WE.box.setFromObject(s); }
}
function weChanged(all) {
  weSync(); weUI(); weDraw2DSoon();
  saveMounts(); R3.version = -1; scheduleWeaponAtlas(all ? null : WE.hk);
}
function weSnap() { WE.undo.push(JSON.stringify(MOUNTS)); if (WE.undo.length > 80) WE.undo.shift(); WE.redo = []; }
function weUndo() { if (!WE.undo.length) return; WE.redo.push(JSON.stringify(MOUNTS)); MOUNTS = readMounts(JSON.parse(WE.undo.pop())); WE.sel = Math.min(WE.sel, weMounts().length - 1); weChanged(true); }
function weRedo() { if (!WE.redo.length) return; WE.undo.push(JSON.stringify(MOUNTS)); MOUNTS = readMounts(JSON.parse(WE.redo.pop())); WE.sel = Math.min(WE.sel, weMounts().length - 1); weChanged(true); }
function weUI() {
  const el = WE.el, fac = WE.hk[0] === 'a' ? 1 : 0, list = weMounts(), names = WEAPON_NAMES[fac];
  el.querySelectorAll('#wed-fac button').forEach((b) => b.className = b.dataset.f === WE.hk[0] ? 'on ' + (fac ? 'all' : 'emp') : '');
  el.querySelectorAll('#wed-type button').forEach((b) => b.className = +b.dataset.t === +WE.hk[1] ? 'on ' + (fac ? 'all' : 'emp') : '');
  el.querySelector('#wed-pal').innerHTML = names.map((n, w) => `<button class="g-btn sm ${WE.place === w ? 'pri' : ''}" data-w="${w}">${n}</button>`).join('');
  el.querySelector('#wed-n').textContent = `（${list.length}）`;
  el.querySelector('#wed-list').innerHTML = list.length ? list.map((m, i) => `<button class="wed-it ${i === WE.sel ? 'on' : ''}" data-i="${i}"><b>${i + 1}</b>${names[m.w]}<span>${m.p[0] < -0.01 ? '左' : m.p[0] > 0.01 ? '右' : '中'}・${m.p[2] > 0.15 ? '前' : m.p[2] < -0.15 ? '後' : '中段'}</span></button>`).join('') : '<p class="g-dim">還沒有武器，從上面挑一個放上去。</p>';
  el.querySelector('#wed-undo').disabled = !WE.undo.length; el.querySelector('#wed-redo').disabled = !WE.redo.length;
  const m = list[WE.sel], prop = el.querySelector('#wed-prop');
  WE.el.querySelector('#wed-hint').textContent = WE.place >= 0 ? `放置「${names[WE.place]}」：在船身上點一下（Esc 取消）` : '左鍵拖曳旋轉・右鍵拖曳平移・滾輪縮放・點武器選取、拖曳沿船身移動・Delete 刪除・M 鏡像複製・R 轉 15°';
  if (!m) { prop.innerHTML = '<p class="g-dim">點選 3D 畫面或上面清單裡的武器來調整。</p>'; return; }
  const num = (id, label, v, step, unit = '') => `<label class="wed-num"><span>${label}</span><input type="number" id="${id}" value="${v}" step="${step}"><i>${unit}</i></label>`;
  prop.innerHTML = `<label class="wed-num"><span>種類</span><select class="g-sel" id="wp-w">${names.map((n, w) => `<option value="${w}" ${w === m.w ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    ${num('wp-x', '左右 X', m.p[0], 0.002)}${num('wp-y', '高度 Y', m.p[1], 0.002)}${num('wp-z', '前後 Z', m.p[2], 0.002)}
    ${num('wp-r', '轉向', m.r || 0, 5, '°')}${num('wp-t', '側傾', m.t || 0, 5, '°')}${num('wp-s', '尺寸', m.s, 0.005)}
    <div class="wed-acts"><button class="g-btn sm" id="wp-snap" title="把高度貼到下方的船身表面">貼齊船身</button><button class="g-btn sm" id="wp-mir" title="M">鏡像複製到另一側</button><button class="g-btn sm" id="wp-dup">複製一個</button><button class="g-btn sm" id="wp-del" title="Delete">刪除</button></div>`;
  const upd = weEdit;
  prop.querySelector('#wp-w').onchange = (e) => upd((q) => (q.w = +e.target.value));
  for (const [id, k] of [['wp-x', 0], ['wp-y', 1], ['wp-z', 2]]) prop.querySelector('#' + id).onchange = (e) => { const v = +e.target.value; if (Number.isFinite(v)) upd((q) => (q.p[k] = v)); };
  for (const [id, k] of [['wp-r', 'r'], ['wp-t', 't'], ['wp-s', 's']]) prop.querySelector('#' + id).onchange = (e) => { const v = +e.target.value; if (Number.isFinite(v) && (k !== 's' || v > 0)) upd((q) => (q[k] = v)); };
  prop.querySelector('#wp-snap').onclick = () => upd((q) => { const h = weSurfaceBelow(q.p[0], q.p[2], q.s); if (h != null) q.p[1] = h; });
  prop.querySelector('#wp-mir').onclick = () => weMirror();
  prop.querySelector('#wp-dup').onclick = () => { weSnap(); const c = cloneMounts(m); c.p[2] -= 0.04; list.push(c); WE.sel = list.length - 1; weChanged(); };
  prop.querySelector('#wp-del').onclick = () => weDelete();
}
// 左右對稱編輯：找另一側的對應武器（同種類、同尺寸、位置鏡像）
function wePartner(i) {
  const cb = WE.el.querySelector('#wed-sym'); if (cb && !cb.checked) return -1;
  const list = weMounts(), m = list[i]; if (!m || Math.abs(m.p[0]) < 0.004) return -1;
  let best = -1, bd = 0.02;
  list.forEach((q, j) => { if (j === i || q.w !== m.w || Math.abs(q.s - m.s) > 0.01) return; const d = Math.hypot(q.p[0] + m.p[0], q.p[1] - m.p[1], q.p[2] - m.p[2]); if (d < bd) { bd = d; best = j; } });
  return best;
}
function weMirrorInto(m, q) { q.w = m.w; q.p = [-m.p[0], m.p[1], m.p[2]]; q.r = -(m.r || 0); q.t = -(m.t || 0); q.s = m.s; }
function weEdit(fn) { const list = weMounts(), m = list[WE.sel]; if (!m) return; const j = wePartner(WE.sel); weSnap(); fn(m); if (j >= 0) weMirrorInto(m, list[j]); weChanged(); }
function weMirror() {
  const list = weMounts(), m = list[WE.sel]; if (!m) return;
  weSnap(); const c = cloneMounts(m); c.p[0] = -c.p[0]; c.r = -(c.r || 0); c.t = -(c.t || 0);
  if (Math.abs(m.p[0]) < 0.004) c.p[0] = m.p[0] + 0.04;   // 在中線上：往右挪一點，免得疊在一起
  list.push(c); WE.sel = list.length - 1; weChanged();
}
function weDelete() {
  const list = weMounts(); if (!list[WE.sel]) return;
  const j = wePartner(WE.sel); weSnap();
  for (const i of [WE.sel, j].filter((v) => v >= 0).sort((a, b) => b - a)) list.splice(i, 1);
  WE.sel = -1; weChanged();
}
function weSurfaceBelow(x, z, s) {   // 往下打射線：底座範圍內最高的那一點
  const r = 0.12 * (s || 0.1); let best = null;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    WE.ray.set(new THREE.Vector3(x + dx, 2, z + dz), new THREE.Vector3(0, -1, 0));
    const h = WE.ray.intersectObject(WE.hullMesh)[0]; if (h && (best == null || h.point.y > best)) best = h.point.y;
  }
  return best == null ? null : Math.round(best * 10000) / 10000;
}
function weRayAt(e, objs) {
  const b = WE.cv.getBoundingClientRect();
  WE.ray.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), WE.cam);
  return WE.ray.intersectObjects(objs, false)[0] || null;
}
// 依表面法線決定側傾：朝上的面＝0，船側的牆＝±90
function tiltOf(hit) {
  if (!hit || !hit.face) return 0;
  const n = hit.face.normal; if (n.y > 0.5) return 0;
  const t = Math.round(Math.atan2(-n.x, n.y) / D2R / 15) * 15;
  return Math.abs(t) < 30 ? 0 : t;
}
function wePlaceAt(hit, w) {
  const list = weMounts(), same = list.filter((m) => m.w === w), fac = WE.hk[0];
  const s = same.length ? same.reduce((a, m) => a + m.s, 0) / same.length : WEAPON_DEF_S[w];
  const p = hit.point, t = tiltOf(hit);
  let r = 0; if (fac === 'e' && w === 2 && Math.abs(p.x) > 0.02) r = p.x > 0 ? 90 : -90;   // 舷砲朝外
  weSnap(); list.push({ w, p: [p.x, p.y, p.z].map((v) => Math.round(v * 10000) / 10000), r, t, s });
  WE.sel = list.length - 1; weChanged();
}
function wePointerDown(e) {
  WE.cv.setPointerCapture(e.pointerId);
  const d = WE.drag = { x: e.clientX, y: e.clientY, btn: e.button, moved: false, mode: 'orbit' };
  if (e.button === 2 || e.button === 1) { d.mode = 'pan'; return; }
  if (WE.place >= 0) { d.mode = 'place'; return; }
  const hw = weRayAt(e, WE.wGroup.children);
  if (hw) { WE.sel = hw.object.userData.i; d.mode = 'move'; d.snapped = false; d.partner = wePartner(WE.sel); weUI(); weSync(); }
}
function wePointerMove(e) {
  const d = WE.drag;
  if (!d) {   // 放置模式：游標下顯示預覽
    if (WE.place >= 0) {
      const h = weRayAt(e, [WE.hullMesh]); WE.ghost.visible = !!h;
      if (h) { const W = getModel(WE.hk[0] + 'w' + WE.place); WE.ghost.geometry = W.lods[1]; WE.ghost.material = W.mat; const same = weMounts().filter((m) => m.w === WE.place); setMountObj(WE.ghost, { p: [h.point.x, h.point.y, h.point.z], r: 0, t: tiltOf(h), s: same.length ? same[0].s : WEAPON_DEF_S[WE.place] }); }
    } else WE.cv.style.cursor = weRayAt(e, WE.wGroup.children) ? 'pointer' : 'grab';
    return;
  }
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (!d.moved && Math.hypot(dx, dy) < 3) return;
  d.moved = true;
  if (d.mode === 'orbit') { WE.orb.yaw -= dx * 0.008; WE.orb.pitch = Math.min(1.55, Math.max(-1.4, WE.orb.pitch + dy * 0.008)); d.x = e.clientX; d.y = e.clientY; }
  else if (d.mode === 'pan') {
    const k = WE.orb.dist * 0.0012, cy = Math.cos(WE.orb.yaw), sy = Math.sin(WE.orb.yaw);
    WE.orb.tx -= (dx * cy) * k; WE.orb.tz -= (-dx * sy) * k; WE.orb.ty += dy * k; d.x = e.clientX; d.y = e.clientY;
  } else if (d.mode === 'move') {   // 沿船身表面拖
    const m = weMounts()[WE.sel]; if (!m) return;
    const h = weRayAt(e, [WE.hullMesh]); if (!h) return;
    if (!d.snapped) { weSnap(); d.snapped = true; }
    m.p = [h.point.x, h.point.y, h.point.z].map((v) => Math.round(v * 10000) / 10000); m.t = tiltOf(h);
    if (d.partner >= 0 && weMounts()[d.partner]) weMirrorInto(m, weMounts()[d.partner]);
    weSync(); weUIValues(m);
  }
}
function weUIValues(m) { const set = (id, v) => { const i = WE.el.querySelector('#' + id); if (i) i.value = v; }; set('wp-x', m.p[0]); set('wp-y', m.p[1]); set('wp-z', m.p[2]); set('wp-t', m.t || 0); }
function wePointerUp(e) {
  const d = WE.drag; WE.drag = null; if (!d) return;
  if (d.mode === 'place' && !d.moved) {
    const h = weRayAt(e, [WE.hullMesh]);
    if (h) { const w = WE.place; if (!e.shiftKey) WE.place = -1; WE.ghost.visible = WE.place >= 0; wePlaceAt(h, w); }
  } else if (d.mode === 'place' && d.moved) { /* 放置模式下拖曳＝轉鏡頭 */ }
  else if (d.mode === 'orbit' && !d.moved) { if (WE.sel >= 0) { WE.sel = -1; weUI(); weSync(); } }
  else if (d.mode === 'move' && d.snapped) weChanged();
}
function weKey(e) {
  if (!WE.open) return;
  if (e.target.closest && e.target.closest('input, select, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.code, list = weMounts(), m = list[WE.sel];
  if (k === 'Escape') { e.preventDefault(); if (!WE.el.querySelector('#wed-modal').hidden) WE.el.querySelector('#wed-modal').hidden = true; else if (WE.place >= 0) { WE.place = -1; WE.ghost.visible = false; weUI(); } else if (WE.sel >= 0) { WE.sel = -1; weUI(); weSync(); } else closeWeaponEditor(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'KeyZ') { e.preventDefault(); if (e.shiftKey) weRedo(); else weUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'KeyY') { e.preventDefault(); weRedo(); return; }
  if (!m) return;
  const step = e.shiftKey ? 0.001 : 0.005;
  const edit = (fn) => { e.preventDefault(); weEdit(fn); };
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); weDelete(); }
  else if (k === 'KeyM') { e.preventDefault(); weMirror(); }
  else if (k === 'KeyR') edit((q) => (q.r = (((q.r || 0) + (e.shiftKey ? -15 : 15)) + 540) % 360 - 180));
  else if (k === 'Equal' || k === 'NumpadAdd') edit((q) => (q.s = Math.round(q.s * 1.05 * 10000) / 10000));
  else if (k === 'Minus' || k === 'NumpadSubtract') edit((q) => (q.s = Math.round(q.s / 1.05 * 10000) / 10000));
  else if (k === 'ArrowUp') edit((q) => (q.p[2] += step));
  else if (k === 'ArrowDown') edit((q) => (q.p[2] -= step));
  else if (k === 'ArrowLeft') edit((q) => (q.p[0] -= step));
  else if (k === 'ArrowRight') edit((q) => (q.p[0] += step));
  else if (k === 'PageUp') edit((q) => (q.p[1] += step));
  else if (k === 'PageDown') edit((q) => (q.p[1] -= step));
}
function weLoop() {
  if (!WE.open) { WE.raf = 0; return; }
  const o = WE.orb, cp = Math.cos(o.pitch);
  WE.cam.position.set(o.tx + Math.sin(o.yaw) * cp * o.dist, o.ty + Math.sin(o.pitch) * o.dist, o.tz + Math.cos(o.yaw) * cp * o.dist);
  WE.cam.lookAt(o.tx, o.ty, o.tz);
  const s = WE.wGroup.children[WE.sel]; if (s) { s.updateMatrixWorld(true); WE.box.setFromObject(s); }
  WE.r.render(WE.scene, WE.cam);
  WE.raf = requestAnimationFrame(weLoop);
}
// 2D 預覽：原本的船體貼圖＋這裡算出的武器疊圖
function weDraw2DSoon() { clearTimeout(WE.t2); WE.t2 = setTimeout(weDraw2D, 60); }
function weDraw2D() {
  if (!WE.open || !WE.shipImg.complete) return;
  const hk = WE.hk, side = hk[0] === 'a' ? 1 : 0, t = +hk[1];
  renderWeaponCells(WE.r, WE.rt2, Array.from({ length: 8 }, (_, d) => ({ hk, d, x: d * 256, y: 0 })));
  const px = new Uint8Array(2048 * 192 * 4); WE.r.readRenderTargetPixels(WE.rt2, 0, 0, 2048, 192, px);
  const img = new ImageData(2048, 192);
  for (let y = 0; y < 192; y++) for (let x = 0; x < 2048; x++) {   // 上下翻轉、去掉預乘
    const s = ((191 - y) * 2048 + x) * 4, d = (y * 2048 + x) * 4, a = px[s + 3];
    if (!a) continue;
    img.data[d] = Math.min(255, px[s] * 255 / a); img.data[d + 1] = Math.min(255, px[s + 1] * 255 / a); img.data[d + 2] = Math.min(255, px[s + 2] * 255 / a); img.data[d + 3] = a;
  }
  const c = WE.c2.getContext('2d'); c.clearRect(0, 0, 2048, 192);
  c.drawImage(WE.shipImg, side * 2048, t * 192, 2048, 192, 0, 0, 2048, 192);
  const tmp = document.createElement('canvas'); tmp.width = 2048; tmp.height = 192; tmp.getContext('2d').putImageData(img, 0, 0);
  c.drawImage(tmp, 0, 0);
}

// ═══════════════════════ 遊戲流程：PvE 1v1 ═══════════════════════
// 選單 → 作戰簡報 → 編成 → 部署 → 戰鬥 → 戰後報告
// 會改變戰局的東西（技能、AI、事件、勝負）都在模擬裡跑（gameTick / gameExec），回放時結果一樣。

const GAME = {
  phase: 'menu', playerSide: 0, sc: null, intel: null, loadout: null, attempt: 0,
  init: [0, 0], result: null, skillArm: null, deploySel: 0, drag: null, replaying: false, reportShown: false,
};
const PHASE_ON = ['deploy', 'battle', 'report', 'simedit'];
const gEl = (id) => document.getElementById(id);
const fmtN = (n) => Math.round(n).toLocaleString();
const ships5 = (icons) => fmtN(icons * opts.rep);
const sumA = (a) => a.reduce((x, y) => x + y, 0);

// ───── 指揮官存檔（等級、經驗） ─────
// 多人戰鬥（GAME.pvp）的指揮官等級與天賦另外存（fleet.pvpcmdrs），和單人分開
const cmdrKey = () => (GAME.pvp ? 'fleet.pvpcmdrs' : 'fleet.cmdrs');
function loadCmdrs() { try { return JSON.parse(STORE.getItem(cmdrKey()) || '{}'); } catch (e) { return {}; } }
function saveCmdrs(d) { try { STORE.setItem(cmdrKey(), JSON.stringify(d)); } catch (e) { /* 無法存檔時只在本次有效 */ } }
let CMDR_SAVE = loadCmdrs();
function cmdrXP(id) { return (CMDR_SAVE[id] && CMDR_SAVE[id].xp) || 0; }
function cmdrLevel(id) { return 1 + Math.floor(cmdrXP(id) / XP_PER_LEVEL); }
// ───── 天賦：每升一級 1 點（Lv 1 就有 1 點） ─────
function cmdrTal(id) { const d = CMDR_SAVE[id] || (CMDR_SAVE[id] = { xp: 0 }); return d.tal || (d.tal = {}); }
function talSpent(tal) { let n = 0; for (const k in tal) if (TALENT_BY_ID[k]) n += tal[k] * TALENT_BY_ID[k].cost; return n; }
function cmdrPoints(id) { return cmdrLevel(id) - talSpent(cmdrTal(id)); }
// 可以加點嗎？（點數夠、等級夠、沒到上限、固有技能不用再學）
function talentCan(c, t) {
  const tal = cmdrTal(c.id), r = tal[t.id] || 0;
  if (t.kind === 'skill') { if (r || c.skills.includes(t.skill)) return ''; if (cmdrLevel(c.id) < (t.req || 1)) return `需要 Lv ${t.req}`; }
  else if (r >= t.max) return '';
  return cmdrPoints(c.id) >= t.cost ? 'ok' : '點數不足';
}
function talentAdd(c, t) { if (talentCan(c, t) !== 'ok') return false; const tal = cmdrTal(c.id); tal[t.id] = (tal[t.id] || 0) + 1; saveCmdrs(CMDR_SAVE); return true; }
function talentSub(c, t) { const tal = cmdrTal(c.id); if (!tal[t.id]) return false; if (--tal[t.id] <= 0) delete tal[t.id]; saveCmdrs(CMDR_SAVE); return true; }
// 偵察天賦：用全體指揮官裡最高的那一階（參謀部的情報）
function reconRank() { return Math.max(0, ...COMMANDERS.map((c) => cmdrTal(c.id).recon || 0)); }

// ───── 情報：依準確度產生「看到的」敵情（同一作戰每次看到一樣的情報） ─────
function makeIntel(sc) {
  const rr = reconRank(), R = mulberry32(sc.seed * 7 + 13), acc = Math.min(0.98, sc.intel.accuracy + 0.12 * rr), err = 1 - acc;
  const hide = sc.intel.hide.filter((h) => !(rr >= 2 && (h === 'tactic' || h === 'comp')));   // 偵察 2 階：看得到打法與編成
  const forms = Object.keys(FORMATIONS);
  const fleetsI = sc.enemy.map((ef) => {
    const total = sumA(ef.comp);
    const lo = Math.max(50, Math.round(total * (1 - err * (0.3 + R() * 0.7)) / 20) * 20);
    const hi = Math.round(total * (1 + err * (0.3 + R() * 0.7)) / 20) * 20;
    const wrong = R() < err * 0.6;
    const formation = wrong ? forms[(forms.indexOf(ef.formation) + 1 + Math.floor(R() * 4)) % forms.length] : ef.formation;
    const comp = hide.includes('comp') ? null : ef.comp.map((n) => (n === 0 ? 0 : Math.max(10, Math.round(n * (1 + (R() - 0.5) * 2 * err) / 10) * 10)));
    return {
      name: ef.name, lo, hi, comp, formation, conf: Math.round(acc * 100),
      tactic: hide.includes('tactic') ? null : ef.tactic,
      cmdr: { name: ef.commander.name, trait: ef.commander.trait, level: acc < 0.5 ? null : ef.commander.level },
      x: ef.x + (R() - 0.5) * err * 300, z: ef.z + (R() - 0.5) * err * 160, fuzz: 40 + err * 160, h: ef.h,
    };
  });
  const events = hide.includes('events') ? null : sc.events.map((e) => `可能有${e.name}出現（約 ${Math.round(e.chance * 100)}%）`);
  return { fleets: fleetsI, events, acc };
}

// ───── 編成 ─────
function compCost(c) { return c.reduce((s, n, t) => s + n * SHIP_TYPES[t].cost, 0); }
function defaultComp(budget) {
  const mix = [0.04, 0.14, 0.27, 0.3, 0.25];   // 以艘數比例
  const per = mix.reduce((s, m, t) => s + m * SHIP_TYPES[t].cost, 0);
  const n = budget / per;
  return mix.map((m) => Math.floor(n * m / 10) * 10);
}
function defaultLoadout(sc, faction = GAME.faction || 0) {
  const pool = cmdrsOf(faction).length ? cmdrsOf(faction) : COMMANDERS;
  const nF = Math.max(1, Math.min(2, sc.maxFleets, pool.length)), share = sc.budget / nF;
  const fl = [];
  for (let k = 0; k < nF; k++) {
    const x = nF === 1 ? 0 : -220 + 440 * k / (nF - 1);
    fl.push({ cmdr: pool[k % pool.length].id, comp: defaultComp(share), formation: 'line', x, z: 300 + ZONE_SHIFT, h: Math.PI });
  }
  return { faction, fleets: fl };
}
// 編成的指揮官要屬於選的陣營、不能重複；不夠就減少艦隊數
function fixLoadoutCmdrs(lo) {
  zoneFix(lo);
  const pool = cmdrsOf(lo.faction || 0), used = new Set();
  lo.fleets = lo.fleets.filter((f) => {
    const c = COMMANDERS.find((o) => o.id === f.cmdr);
    if (c && (c.faction || 0) === (lo.faction || 0) && !used.has(c.id)) { used.add(c.id); return true; }
    const free = pool.find((o) => !used.has(o.id) && !lo.fleets.some((g) => g !== f && g.cmdr === o.id));
    if (!free) return false;
    f.cmdr = free.id; used.add(free.id); return true;
  });
}
// 部署區往外推（ZONE_SHIFT）之前存的編成：位置在新部署區前面＝整組往後推
function zoneFix(lo) {
  const all = [...lo.fleets, ...supplyList(lo)];
  if (all.length && all.every((f) => f.z < DEPLOY_ZONE.z0)) for (const f of all) f.z = Math.min(DEPLOY_ZONE.z1, f.z + ZONE_SHIFT);
}
// 補給艦隊的 setup（編成的 comp 是 [航母, 戰列, 巡洋, 驅逐, 護衛, 補給]，只會有護衛和補給）
function supplySetup(side, S, follow, name = '補給艦隊') {
  return { side, name, supply: true, follow, ax: S.x, az: S.z, ay: S.y || 0, h: S.h, formation: S.formation || 'ring', orderly: false, layers: 1,
    comp: SHIP_TYPES.map((_, t) => (t === 4 || t === SUPPLY_T ? S.comp[t] || 0 : 0)), commander: null };
}
// 編成的補給艦隊（可以有好幾支，最多跟艦隊數一樣多；舊存檔的 lo.supply 轉成陣列）
function supplyList(lo) {
  if (lo.supply) { lo.supplies = [lo.supply]; delete lo.supply; }
  return lo.supplies || (lo.supplies = []);
}
const supplyName = (i) => `補給第${'一二三四'[i]}隊`;
// 新增第 i 支：預設跟隨同序號的艦隊，擺在它後方
function defaultSupply(lo, i) {
  const f = lo.fleets[i] || lo.fleets[0], z = f ? f.z + 120 : DEPLOY_ZONE.z1;
  return { comp: SHIP_TYPES.map((_, t) => (t === 4 ? 30 : t === SUPPLY_T ? 30 : 0)), formation: 'ring', x: f ? f.x : 0, z: Math.min(DEPLOY_ZONE.z1, z), h: Math.PI, follow: lo.fleets[i] ? i : lo.fleets.length ? 0 : -1 };
}
// 增援的編成：本場預算 × share，照呼叫的艦隊的艦種比例（只算一般艦種）
function reinforceComp(comp, budget) {
  const c = SHIP_TYPES.map((_, t) => (t < N_COMBAT ? comp[t] || 0 : 0)), cost = compCost(c) || 1, k = budget * REINFORCE_RULE.share / cost;
  return c.map((n) => Math.floor(n * k / 10) * 10);
}
// 增援指揮官：等級跟主力敵軍一樣（無限戰場是敵軍等級，不是 AI 難度）
function reinforceCmdr(sc) {
  const lv = sc.enemyLevel || Math.max(sc.level || 1, ...sc.enemy.map((e) => (e.commander && e.commander.level) || 1));
  return { name: '增援指揮官', trait: 'dmg', level: lv, skills: sc.level >= 2 ? (lv >= 5 ? ['wall', 'rapid'] : ['wall']) : [] };
}
function makeSetup(sc, lo, attempt) {
  const fleetsS = [];
  lo.fleets.forEach((f, k) => {
    const c = COMMANDERS.find((o) => o.id === f.cmdr) || cmdrsOf(lo.faction || 0)[0] || COMMANDERS[0];
    fleetsS.push({ side: 0, name: `第${'一二三四'[k]}艦隊`, ax: f.x, az: f.z, ay: f.y || 0, h: f.h, formation: f.formation, orderly: !!f.orderly, layers: f.layers || 1, comp: f.comp.slice(), hangar: (f.hangar || HANGAR_DEFAULT).slice(),
      commander: { id: c.id, name: c.name, title: c.title, trait: c.trait, level: cmdrLevel(c.id), tal: { ...cmdrTal(c.id) }, skills: commanderSkills(c.skills, cmdrTal(c.id)) } });
  });
  // 補給艦隊：不佔艦隊欄位、沒有指揮官；follow＝跟隨的艦隊（setup 裡的 index）
  supplyList(lo).forEach((S, i) => { if (sumA(S.comp) > 0) fleetsS.push(supplySetup(0, S, S.follow >= 0 && S.follow < lo.fleets.length ? S.follow : -1, supplyName(i))); });
  // 呼叫增援：有這個技能的指揮官各準備一支（隱藏在場外，用技能時才決定進場位置）；次數不夠就只準備得起的那幾支
  const stock = sc.sim ? 0 : Math.min(ROSTER.reinf || 0, REINFORCE_RULE.max);
  let nR = 0;
  lo.fleets.forEach((f, k) => {
    const cm = fleetsS[k].commander;
    if (nR >= stock || !cm.skills.includes('reinforce')) return;
    nR++;
    fleetsS.push({ side: 0, name: `${fleetsS[k].name}增援`, ax: 0, az: MAP_BOUNDS.z1 + 900, ay: 0, h: Math.PI, formation: f.formation, comp: reinforceComp(f.comp, sc.budget),
      commander: null, reserve: true, activateAt: null, reinfOf: k });
  });
  const e0 = fleetsS.length;
  sc.enemy.forEach((ef) => fleetsS.push({ side: 1, name: ef.name, ax: ef.x, az: ef.z, ay: ef.y || 0, h: ef.h, formation: ef.formation, comp: ef.comp.slice(),
    commander: { ...ef.commander }, ai: { tactic: ef.tactic, level: sc.level } }));
  if (sc.enemySupply && sc.enemy.length) fleetsS.push(supplySetup(1, sc.enemySupply, e0));
  // 突發事件：開戰前就抽好（同一個 attempt 回放時一樣）
  const R = mulberry32(sc.seed * 31 + attempt * 977);
  for (const ev of sc.events) {
    if (ev.type !== 'reinforce' || R() >= ev.chance) continue;
    const at = ev.at[0] + R() * (ev.at[1] - ev.at[0]), sx = ev.edge === 'left' ? -1 : 1;
    fleetsS.push({ side: 1, name: ev.name, ax: sx * 800, az: -140 + R() * 200, ay: Math.round((R() - 0.5) * 240), h: sx < 0 ? Math.PI / 2 : -Math.PI / 2, formation: ev.formation, comp: ev.comp.slice(),
      commander: reinforceCmdr(sc), reserve: true, activateAt: at, ai: { tactic: 'push', level: sc.level } });
  }
  return { bg: false, terrain: sc.terrain, fleets: fleetsS, scenario: sc.id, timeLimit: sc.timeLimit, level: sc.level, factions: (lo.faction || 0) === 1 ? [1, 0] : [0, 1], ...(sc.aiOmni ? { omni: [false, true] } : {}) };   // aiOmni：這一關的 AI 不受戰爭迷霧限制
}

// ───── 技能（命令 'skill'） ─────
function gameExec(c) {
  if (c.type === 'surrender') { if (!GAME.result) GAME.result = battleResult(c.side ? 'win' : 'lose', `${c.side ? '敵軍' : '我軍'}${c.why || '投降了'}`, { surrender: c.side }); return null; }   // 多人：投降、斷線（伺服器發出）
  if (c.type === 'simctl') { GAME.simCtl = c.ctl; return null; }   // 模擬室：玩家接管的一方（該方 AI 暫停）
  if (c.type === 'skill') { const f = fleets.find((o) => o.id === c.fleet); if (f && f.side === c.side) useSkill(f, c.skill, c.target != null ? squadrons[c.target] : null, c.x != null ? { x: c.x, z: c.z } : null); }
  return null;
}
function useSkill(f, id, target, pt) {
  const s = f.skills[id], t = U.uTime.value, def = SKILLS[id];
  if (!s || s.left <= 0 || t < s.ready || f.sqs.every((q) => q.alive <= 0)) return false;
  if (def.targetMode === 'enemy' && (!target || target.side === f.side || target.alive <= 0)) return false;
  if (def.targetMode === 'point' && !pt) return false;
  if (id === 'reinforce' && !callReinforce(f, pt)) return false;
  s.left--; s.until = t + def.dur; s.ready = t + def.cd * (1 - 0.15 * talentRank(f.commander, 'tempo')); s.target = target; s.used = (s.used || 0) + 1;   // 指揮效率：冷卻縮短
  if (id === 'jam') setJam(1 - f.side, def.dur, 6);   // 干擾：敵方變陣延遲 6 秒
  const who = GAME.watch ? `${FACTION_NAME[SIDE_FAC[f.side]]}・${f.name}　` : f.side === GAME.playerSide ? '' : '敵方';   // 觀摩：兩邊都是 AI，用陣營名稱
  toast(`${who}${f.commander ? f.commander.name : f.name}：${def.name}${target ? ` → ${target.fleet ? target.fleet.name + ' ' : ''}${target.name}` : ''}`, f.side === GAME.playerSide ? '' : 'enemy');
  if (id === 'focus') for (const g of groups) if (g.side === f.side && !g.inactive) g.target = target;
  return true;
}
// 呼叫增援：把準備好的增援艦隊（還在場外）移到離 pt 最近的地圖邊緣外側，delay 秒後進場、開往 pt
function callReinforce(f, pt) {
  const rf = fleets.find((o) => o.reinfOf === f.id && o.reserve && o.activateAt == null);
  if (!rf) { if (f.side === GAME.playerSide) toast('這場沒有可以呼叫的增援（星際酒館購買增援次數）'); return false; }
  const g = rf.sqs[0] && rf.sqs[0].group; if (!g) return false;
  const B = MAP_BOUNDS, P = clampMap({ x: pt.x, z: pt.z });
  const d = [[P.x - B.x0, 'x0'], [B.x1 - P.x, 'x1'], [P.z - B.z0, 'z0'], [B.z1 - P.z, 'z1']].sort((a, b) => a[0] - b[0])[0][1];
  const E = { x: d === 'x0' ? B.x0 - 80 : d === 'x1' ? B.x1 + 80 : P.x, z: d === 'z0' ? B.z0 - 80 : d === 'z1' ? B.z1 + 80 : P.z };
  warpGroup(g, E.x, E.z, Math.atan2(P.x - E.x, P.z - E.z));
  rf.activateAt = U.uTime.value + REINFORCE_RULE.delay; rf.entryGoal = P;
  // 次數：只在正式作戰、第一次執行時扣（回放重跑同一個命令不再扣）
  if (!GAME.replaying && f.side === GAME.playerSide && GAME.phase === 'battle' && !(GAME.sc && (GAME.sc.sim || GAME.sc.mp))) {   /* 多人：每場固定次數，不扣酒館的存量 */ ROSTER.reinf = Math.max(0, (ROSTER.reinf || 0) - 1); rosterSave(); }
  if (f.side === GAME.playerSide) toast(`${rf.name}：${REINFORCE_RULE.delay} 秒後從${{ x0: '左', x1: '右', z0: '前', z1: '後' }[d]}方進場`);
  return true;
}
function skillCmd(f, id, target, pt) {
  const args = { fleet: f.id, skill: id, target: target ? squadrons.indexOf(target) : null, ...(pt ? { x: Math.round(pt.x), z: Math.round(pt.z) } : {}) };
  // 排進隊列時掛在「選取的部隊」上（例如：先移動到某地，再放技能）
  if (queueMode()) { const sel = actOn().filter((q) => q.fleet === f); issue('queue', { sqs: sqIds(sel.length ? actOn() : fleetAlive(f)), item: { type: 'skill', ...args } }); }
  else issue('skill', args);
}
function armSkill(f, id) {
  if (SKILLS[id].targetMode === 'enemy') { GAME.skillArm = { f, id }; hint(`${SKILLS[id].name}：點選要集中砲擊的敵方分艦隊（Esc 取消）`); }
  else if (SKILLS[id].targetMode === 'point') { GAME.skillArm = { f, id, point: true }; hint(`${SKILLS[id].name}：點選增援要開往的位置（從最近的地圖邊緣進場，Esc 取消）`); }
  else skillCmd(f, id);
}
// A 鍵（觸控：「攻擊」按鈕）：接著左鍵點敵方分艦隊＝選取的艦隊集中攻擊它（不加傷害、沒有次數限制）
function armAttack() {
  if (GAME.phase !== 'battle' && GAME.phase !== 'sandbox') return;
  GAME.skillArm = { attack: true };
  hint(`攻擊：${selected.size ? '選取的艦隊' : '全軍'}要打哪一支？左鍵點敵方分艦隊（右鍵或 Esc 取消）`);
}
// D 鍵（輪盤「攻擊」頁）：接著左鍵點地圖上的一點＝選取的艦隊對那裡開火（光束、飛彈、艦載機；射程內才打）
function armArea() {
  if (GAME.phase !== 'battle' && GAME.phase !== 'sandbox') return;
  if (!actOn().length) return;
  GAME.skillArm = { area: true, point: true };
  hint(`區域攻擊：${selected.size ? '選取的艦隊' : '全軍'}要打哪裡？左鍵點地圖上的位置（${FOW_RULE.area.dur} 秒；射程內的光束、飛彈、艦載機會打那裡，看不到目標＝盲射）（右鍵或 Esc 取消）`);
}
function skillEsc() { if (!GAME.skillArm) return false; GAME.skillArm = null; hideHint(); return true; }
function skillKey(id) {
  if (GAME.phase !== 'battle') return false;
  if (!SKILLS[id]) return false;
  const sel = [...selected].map((q) => q.fleet).filter(Boolean);
  const pool = [...sel, ...fleets.filter((f) => f.side === GAME.playerSide)];
  const f = pool.find((o) => o.skills[id] && o.skills[id].left > 0 && U.uTime.value >= o.skills[id].ready);
  if (f) armSkill(f, id);
  return true;
}

// ───── 增援 ─────
function activateReserve(f) {
  f.reserve = false;
  for (const q of f.sqs) { q.bg = false; q.hidden = false; if (q.group) q.group.inactive = false; if (q.label) q.label.classList.remove('bg'); }
  GAME.init[f.side] += f.initial;
  // 呼叫來的增援：進場後開往指定的位置
  if (f.entryGoal) { const g = f.sqs[0].group; execCommand({ tick: simTick, side: f.side, type: 'move', auto: true, sqs: fleetAlive(f).map((q) => squadrons.indexOf(q)), x: f.entryGoal.x, z: f.entryGoal.z, H: g ? g.to : null, pivot: false, width: null, uturn: 'auto' }); }
  if (typeof TAC !== 'undefined' && TAC.open && f.side === GAME.playerSide) buildTacSide();   // 戰術面板加上這支艦隊的卡片
  if (f.side === GAME.playerSide) toast(f.entryGoal ? `增援：${f.name}進場` : `增援：${f.name}抵達${f.sqs[0].x < 0 ? '左' : '右'}翼`);
  else toast(`警告：${f.name}出現在${f.sqs[0].x < 0 ? '左' : '右'}翼！`, 'bad');
  for (let k = 0; k < 12; k++) { const q = f.sqs[k % f.sqs.length]; spawnFx(q.x + (rnd() - 0.5) * 60, 0, q.z + (rnd() - 0.5) * 60, 1, 8, 16); }
}

// ───── 敵方 AI ─────
// 每 0.5 秒想一次（在模擬裡、用模擬的隨機數 → 回放一致）。AI 也只能下命令。
function fleetAlive(f) { return f.sqs.filter((q) => q.alive > 0 && !q.bg); }
function centerOf(sqs) { let x = 0, y = 0, z = 0, n = 0; for (const q of sqs) { x += q.x * q.alive; y += (q.y || 0) * q.alive; z += q.z * q.alive; n += q.alive; } return n ? { x: x / n, y: y / n, z: z / n, n } : null; }
function fleetRange(f, key) { let s = 0, n = 0; for (const q of f.sqs) for (let t = 0; t < NT; t++) { s += q.typeAlive[t] * SHIP_TYPES[t].beam[key]; n += q.typeAlive[t]; } return n ? s / n : 300; }
function aiCmd(f, type, args = {}) {
  const sqs = fleetAlive(f).map((q) => squadrons.indexOf(q));
  if (!sqs.length) return null;
  return execCommand({ tick: simTick, side: f.side, type, sqs, ...args });
}
function fleetGroup(f) { const q = fleetAlive(f)[0]; return q ? q.group : null; }
function clampMap(p) { p.x = Math.max(MAP_BOUNDS.x0 + 60, Math.min(MAP_BOUNDS.x1 - 60, p.x)); p.z = Math.max(MAP_BOUNDS.z0 + 60, Math.min(MAP_BOUNDS.z1 - 60, p.z)); if (p.y != null) p.y = Math.max(-ALT_MAX + 40, Math.min(ALT_MAX - 40, p.y)); return p; }
function aiMove(f, S, P, H, minD = 60) {
  const g = fleetGroup(f); if (!g) return;
  clampMap(P);
  const same = S.goal && Math.hypot(S.goal.x - P.x, S.goal.z - P.z) < minD && Math.abs(wrapAngle((S.goal.H ?? 0) - H)) < 0.5;
  if (same && g.plan) return;
  if (maneuvering(g) && S.goal && Math.hypot(S.goal.x - P.x, S.goal.z - P.z) < 200) return;   // 迴轉途中不要一直改命令
  if (g.plan && g.plan.kind === 'pivot' && g.sqs.some((q) => sqMorphing(q)) && S.goal && Math.hypot(S.goal.x - P.x, S.goal.z - P.z) < 160) return;   // 原地轉向重排中
  // 3D：預設跟著目標的高度走；包抄的艦隊（難度 2 以上）從上方切入
  if (P.y == null) P.y = (S.ey != null ? S.ey : g.ay || 0) + (f.ai.tactic === 'flank' && f.ai.level >= 2 && S.phase !== 'attack' ? 140 : 0);
  clampMap(P);
  S.goal = { x: P.x, z: P.z, H };
  aiCmd(f, 'move', { x: P.x, z: P.z, H, pivot: false, width: null, uturn: 'auto', y: Math.round(P.y) });
}
function aiFace(f, S, E) {
  const g = fleetGroup(f); if (!g || g.plan) return;
  const H = Math.atan2(E.x - g.ax, E.z - g.az);
  if (Math.abs(wrapAngle(H - g.to)) > 0.45) { S.goal = null; aiCmd(f, 'face', { x: E.x, z: E.z }); }
}
function aiForm(f, S, kind) { const g = fleetGroup(f); if (g && g.formation !== kind && U.uTime.value > (S.formT || 0)) { S.formT = U.uTime.value + 25; aiCmd(f, 'form', { kind }); } }
function aiSkill(f, id, target) { const s = f.skills[id]; if (s && s.left > 0 && U.uTime.value >= s.ready) useSkill(f, id, target); }
// AI 看到的敵情：被干擾時是干擾開始那一刻的位置、兵力與陣型（seenSq）
function seenAlive(viewer, f) { return f.sqs.map((q) => seenSq(viewer, q)).filter((q) => q && !q.bg && q.alive > 0); }
function seenCenter(viewer, f) { return centerOf(seenAlive(viewer, f)); }
function seenGroup(viewer, f) { const q = seenAlive(viewer, f)[0]; return q ? (q.stale ? q : q.group) : null; }   // 快照（干擾、最後已知）本身帶陣型與朝向
// 難度 4 以上的選目標：射程內的航母（艦載機的來源）優先，其次是快被打垮的分艦隊；
// 難度 5 再加上協同：其他 AI 艦隊也打得到的目標加分，各艦隊會集中打同一處。集中火力生效中不改目標
function aiTarget(f, S, C, far, lv) {
  const fs = f.skills.focus; if (fs && U.uTime.value < fs.until) return;
  const allies = lv >= 5 ? fleets.filter((o) => o !== f && o.side === f.side && o.ai && !o.reserve).map((o) => [centerOf(fleetAlive(o)), fleetRange(o, 'far')]).filter((a) => a[0]) : [];
  let best = null, bs = -1e9;
  for (const q of squadrons) {
    const v = seenSq(f.side, q);   // 被干擾：位置與兵力是干擾開始時的
    if (q.side === f.side || !v || v.bg || v.alive <= 0 || q.alive <= 0 || Math.hypot(v.x - C.x, v.z - C.z) > far || (fowOn() && v.stale)) continue;   // 戰爭迷霧：只選看得到的
    let s = q.typeAlive[0] * 4 + (1 - v.alive / Math.max(1, q.list.length)) * 30 - v.alive * 0.05;
    for (const [A, r] of allies) if (Math.hypot(v.x - A.x, v.z - A.z) < r) s += 12;
    if (s > bs) { bs = s; best = q; }
  }
  if (best && S.atk !== best) { S.atk = best; aiCmd(f, 'attack', { target: squadrons.indexOf(best) }); }
}
// AI 想事情時，seenSq 用這支艦隊自己的情報（戰爭迷霧：被干擾時各艦隊不共享）
function aiThink(f) { FOW.obs = f; try { aiThink0(f); } finally { FOW.obs = null; } }
// 戰爭迷霧：脈衝掃描是自動的（fowAutoScan）；有航母的 AI 另外派偵察機做區域掃描：
//   沒有看得到的敵軍就派（難度 2：開戰 30 秒後才會；難度 1 不會）；難度 4 以上還有敵方艦隊看不到時也派
//   派去哪：掃描訊號的方向 → 最近的最後已知位置 → 敵軍開戰時的位置
function aiScan(f, lv, t) {
  if (!fowOn() || lv < 2 || f.supply || fowReconLeft(f) > 0 || !fowHasCarrier(f)) return;
  const en = fleets.filter((o) => o.side !== f.side && !o.reserve && o.sqs.some((q) => fowLive(q)));
  const seen = (o) => o.sqs.some((q) => fowLive(q) && fowKnows(f, q));
  const none = !en.some(seen);
  if (!((none && (lv >= 3 || t > 30)) || (lv >= 4 && t > 15 && en.some((o) => !seen(o))))) return;
  const C = centerOf(fleetAlive(f)); if (!C) return;
  const ps = FOW.pings[f.side].filter((p) => p.fleet === f.id), p = ps[ps.length - 1];
  let P = null;
  if (p) { const d = FOW_RULE.scanR * 0.65; P = { x: C.x + Math.sin(p.a) * d, y: C.y, z: C.z + Math.cos(p.a) * d }; }   // 掃描來自 scanR 以內：取 0.65 倍，偵察半徑 350 涵蓋大半範圍
  else {
    let best = null; for (const [e, o] of f.fowLast) if (e.alive > 0 && !fowKnows(f, e) && (!best || o.t > best.t)) best = o;
    const st = FOW.start[1 - f.side];
    P = best ? { x: best.x, y: best.y, z: best.z } : st ? { x: st.x, y: st.y || 0, z: st.z } : null;
  }
  if (P) { clampMap(P); launchRecon(f, P); }
}
// 戰爭迷霧：完全不知道敵人在哪＝搜索：先往掃描訊號的方向，否則在敵方開戰位置與地圖中央之間來回
function aiSearch(f, S, C) {
  const ps = FOW.pings[f.side].filter((p) => p.fleet === f.id), p = ps[ps.length - 1];
  let P;
  if (p) { P = { x: C.x + Math.sin(p.a) * 450, z: C.z + Math.cos(p.a) * 450 }; S.note = '搜索：往掃描訊號的方向'; }
  else {
    const st = FOW.start[1 - f.side] || { x: 0, z: 0 }, A = S.searchMid ? { x: 0, z: 0 } : st;
    if (Math.hypot(A.x - C.x, A.z - C.z) < 220) S.searchMid = !S.searchMid;
    P = { x: A.x, z: A.z }; S.note = S.searchMid ? '搜索：往地圖中央' : '搜索：往敵軍開戰時的位置';
  }
  aiMove(f, S, P, Math.atan2(P.x - C.x, P.z - C.z), 120);
}
function aiThink0(f) {
  const mine = fleetAlive(f); if (!mine.length) return;
  const C = centerOf(mine), S = f.aiS, lv = f.ai.level, t = U.uTime.value;
  aiScan(f, lv, t);
  // 最近的玩家艦隊
  let E = null, Ef = null, bd = 1e18;
  for (const o of fleets) if (o.side !== f.side && !o.reserve) { const c = seenCenter(f.side, o); if (c && (c.x - C.x) ** 2 + (c.z - C.z) ** 2 < bd) { bd = (c.x - C.x) ** 2 + (c.z - C.z) ** 2; E = c; Ef = o; } }   // 被干擾：用干擾開始時的敵情；戰爭迷霧：看得到的或最後已知
  if (!E) { if (fowOn()) aiSearch(f, S, C); return; }
  S.ey = E.y;
  const d = Math.sqrt(bd), ux = (E.x - C.x) / (d || 1), uz = (E.z - C.z) / (d || 1), H = Math.atan2(ux, uz);
  const near = fleetRange(f, 'near'), far = fleetRange(f, 'far');
  const flanked = mine.some((q) => flankState(q));
  // 損失速度（最近 10 秒）
  const n = sumA(mine.map((q) => q.alive));
  if (!S.hist) S.hist = [];
  S.hist.push([t, n]); while (S.hist.length && S.hist[0][0] < t - 10) S.hist.shift();
  const lossRate = S.hist.length ? (S.hist[0][1] - n) / Math.max(1, S.hist[0][1]) : 0;
  if (lv >= 2 && aiResupply(f, S, H)) return;   // 飛彈打完：先回去補給

  // ── 反制（難度 2 以上）──
  if (lv >= 2) {
    if ((flanked || lossRate > 0.12) && d < far) aiSkill(f, 'wall');
    if (flanked && S.phase !== 'swing' && t > (S.turnT || 0)) { S.turnT = t + 6; S.goal = null; S.note = '反制：被繞到側背，轉向迎擊'; aiCmd(f, 'face', { x: E.x, z: E.z }); return; }
    if (d < far * 1.05) {
      // 集中火力：射程內存活最少的玩家分艦隊
      let best = null, ba = 0; for (const q of squadrons) { const v = seenSq(f.side, q); if (q.side !== f.side && v && !v.bg && v.alive > 0 && q.alive > 0 && !(fowOn() && v.stale) && Math.hypot(v.x - C.x, v.z - C.z) < far) if (!best || v.alive < ba) { best = q; ba = v.alive; } }
      if (best) aiSkill(f, 'focus', best);
    }
  }
  if (lv >= 3) {
    // 玩家以紡錘陣衝過來 → 改凹形陣包夾
    const pg = Ef && seenGroup(f.side, Ef);
    if (pg && pg.formation === 'spindle' && d < 650 && f.ai.tactic !== 'breakthrough') { aiForm(f, S, 'crescent'); S.note = '反制：對手紡錘陣衝來，改凹形陣包夾'; }
    // 玩家拉遠距離消耗我方 → 直接逼近
    if (f.ai.tactic === 'kite' && d > far * 0.95 && beamPow[f.side] < 0.45 && t > 40) { f.ai.tactic = 'push'; aiSkill(f, 'charge'); if (GAME.watch) toast(`${f.name}：被遠距離消耗，改為正面推進並衝鋒`); }
  }
  // ── 其他技能（難度 2 以上）：進入射程開「極速射擊」；掉血或被繞側而鐵壁沒開時用「機動迴避」；難度 3 以上：接敵前「干擾」──
  if (lv >= 2) {
    if (d < far * 0.95) aiSkill(f, 'rapid');
    const w = f.skills.wall;
    if ((lossRate > 0.1 || flanked) && d < far && !(w && t < w.until)) aiSkill(f, 'evade');
    if (lv >= 3 && d < far * 1.3 && jam[1 - f.side].until <= t) aiSkill(f, 'jam');
  }
  // ── 難度 4 以上：被包抄時改圓陣、脫離後換回；射程內優先打航母與快被打垮的分艦隊 ──
  if (lv >= 4) {
    const g = fleetGroup(f);
    if (g) {
      if (S.baseForm == null) S.baseForm = g.formation;
      if (flanked && lossRate > 0.06 && g.formation !== 'ring' && f.ai.tactic !== 'breakthrough') { aiForm(f, S, 'ring'); S.note = '反制：側背受擊，改圓陣全方位防禦'; }
      else if (!flanked && g.formation === 'ring' && S.baseForm !== 'ring' && lossRate < 0.03) aiForm(f, S, S.baseForm);
    }
    aiTarget(f, S, C, far, lv);
  }
  // ── 難度 5：看時間與戰損調整打法（領先就拉開距離拖到時間到，落後就推進衝鋒）──
  if (lv >= 5 && battleSetup.timeLimit < SIM_INF && t > battleSetup.timeLimit * 0.65 && t > (S.tmT || 0)) {
    const me = sideAlive(f.side) / Math.max(1, GAME.init[f.side]), op = sideAlive(1 - f.side) / Math.max(1, GAME.init[1 - f.side]);
    if (me - op > 0.12 && f.ai.tactic !== 'kite') { S.tmT = t + 20; S.base = S.base || f.ai.tactic; f.ai.tactic = 'kite'; S.goal = null; S.phase = null; if (GAME.watch) toast(`${f.name}：戰損領先，拉開距離拖時間`); }
    else if (op - me > 0.02 && f.ai.tactic === 'kite') { S.tmT = t + 20; f.ai.tactic = S.base && S.base !== 'kite' ? S.base : 'push'; S.goal = null; aiSkill(f, 'charge'); if (GAME.watch) toast(`${f.name}：時間不多又落後，全力進攻`); }
  }

  switch (f.ai.tactic) {
    case 'push': {
      const want = Math.max(200, Math.min(420, near * 1.05));
      if (d > want + 80) { S.note = `推進到 ${Math.round(want)} 的交戰距離`; aiMove(f, S, { x: E.x - ux * want, z: E.z - uz * want }, H); if (lv >= 2 && d > want + 250) aiSkill(f, 'charge'); }
      else { S.note = '維持陣線，正面對射'; aiFace(f, S, E); }
      break;
    }
    case 'kite': {
      const want = Math.max(380, Math.min(720, far * 0.85));
      if (d < want - 110) { S.note = '被逼近：後退拉開距離'; aiMove(f, S, { x: C.x - ux * (want - d + 80), z: C.z - uz * (want - d + 80) }, H, 90); }
      else if (d > want + 110) { S.note = '逼近到射程邊緣'; aiMove(f, S, { x: E.x - ux * want, z: E.z - uz * want }, H, 90); }
      else { S.note = '在射程邊緣對射消耗'; aiFace(f, S, E); }
      break;
    }
    case 'flank': {
      // 繞到玩家側面：以玩家朝向的左右為準，選自己這一側（不穿越玩家正面）
      const pg = Ef && seenGroup(f.side, Ef), ph = pg ? pg.to : Math.atan2(-ux, -uz);
      const rx = Math.cos(ph), rz = -Math.sin(ph), fx = Math.sin(ph), fz = Math.cos(ph);
      if (!S.phase) { S.phase = 'swing'; S.sideSign = (C.x - E.x) * rx + (C.z - E.z) * rz >= 0 ? 1 : -1; }
      if (S.phase === 'swing') {
        // 先到側前方的集結點，再切到正側面；移動時船頭朝前進方向（速度最快）
        const lat = 430 * S.sideSign;
        const wp = S.wp || 0;
        const P = wp === 0 ? { x: E.x + rx * lat + fx * 260, z: E.z + rz * lat + fz * 260 } : { x: E.x + rx * lat - fx * 40, z: E.z + rz * lat - fz * 40 };
        const dP = Math.hypot(P.x - C.x, P.z - C.z);
        S.note = wp === 0 ? '迂迴：先到對手側前方的集結點' : '切入對手的正側面';
        if (wp === 0 && dP < 160) S.wp = 1;
        else if (wp === 1 && dP < 150) { S.phase = 'attack'; S.goal = null; }
        else { aiMove(f, S, P, Math.atan2(P.x - C.x, P.z - C.z), 140); if (lv >= 2 && wp === 1) aiSkill(f, 'charge'); }
      } else {
        S.note = '從側面近距離攻擊（側背受擊傷害較高）';
        if (d > near + 60) aiMove(f, S, { x: E.x - ux * near, z: E.z - uz * near }, H); else aiFace(f, S, E);
      }
      break;
    }
    case 'breakthrough': {
      aiForm(f, S, 'spindle');
      if (!S.dir) S.dir = { x: ux, z: uz };
      const g = fleetGroup(f);
      // 衝過玩家中央，穿出去後再掉頭
      const past = (C.x - E.x) * S.dir.x + (C.z - E.z) * S.dir.z > 120;
      if (past && !(g && maneuvering(g))) S.dir = { x: ux, z: uz };
      S.note = past ? '穿出敵陣，掉頭再衝一次' : '紡錘陣直衝對手中央';
      aiMove(f, S, { x: E.x + S.dir.x * 220, z: E.z + S.dir.z * 220 }, Math.atan2(S.dir.x, S.dir.z), 90);
      if (d < 760) aiSkill(f, 'charge');
      break;
    }
  }
}

// ───── 補給艦隊：跟隨 ─────
// 待在被跟隨艦隊的正後方 SUPPLY_RULE.follow 處；被跟隨的艦隊全滅就改跟同一方還在的艦隊
function supplyFollow(f) {
  let T = fleets.find((o) => o.id === f.follow);
  if (!T || !fleetAlive(T).length) {
    T = fleets.find((o) => o.side === f.side && !o.supply && !o.reserve && fleetAlive(o).length);
    if (!T) return;
    f.follow = T.id;
  }
  if (T.aiS && T.aiS.resup) return;   // 被跟隨的艦隊正回來補給：原地等它
  const g = fleetGroup(T), me = fleetGroup(f); if (!g || !me) return;
  const H = g.to, P = clampMap({ x: g.ax - Math.sin(H) * SUPPLY_RULE.follow, z: g.az - Math.cos(H) * SUPPLY_RULE.follow }), S = f.aiS;
  if (S.goal && Math.hypot(S.goal.x - P.x, S.goal.z - P.z) < 80 && (me.plan || Math.hypot(me.ax - P.x, me.az - P.z) < 120)) return;
  if (!S.goal && Math.hypot(me.ax - P.x, me.az - P.z) < 80) return;
  S.goal = { x: P.x, z: P.z };
  execCommand({ tick: simTick, side: f.side, type: 'move', auto: true, sqs: fleetAlive(f).map((q) => squadrons.indexOf(q)), x: P.x, z: P.z, H, pivot: false, width: null, uturn: 'auto', y: Math.round(g.ay || 0) });
}
// AI：帶飛彈的艦隊打完飛彈就回補給艦隊補（補到七成五再回去打）
function aiResupply(f, S, H) {
  const al = fleetAlive(f), n = sumA(al.map((q) => q.alive)); if (!n) return false;
  const msl = sumA(al.map((q) => q.typeAlive[2] + q.typeAlive[3]));
  if (msl / n < 0.4) return false;
  const r = ammoRatio(f);
  if (S.resup ? r > 0.75 : r > 0.15) { if (S.resup) { S.resup = false; S.goal = null; } return false; }
  const sup = fleets.find((o) => o.supply && o.side === f.side && !o.reserve && fleetAlive(o).length && supplyStock(f.side, o) > 0);
  if (!sup) { S.resup = false; return false; }
  const c = centerOf(fleetAlive(sup));
  S.resup = true; S.note = `飛彈剩 ${Math.round(r * 100)}%：回補給艦隊補充`;
  aiMove(f, S, { x: c.x, z: c.z }, H, 60);
  return true;
}

// ───── 勝負 ─────
function sideAlive(side) { let n = 0; for (const f of fleets) if (f.side === side && !f.reserve) for (const q of f.sqs) n += q.alive; return n; }
function checkVictory() {
  const t = U.uTime.value, tl = battleSetup.timeLimit;
  const a0 = sideAlive(0), a1 = sideAlive(1), p = a0 / Math.max(1, GAME.init[0]), e = a1 / Math.max(1, GAME.init[1]);
  let r = null;
  if (a1 === 0) r = ['win', '殲滅敵軍'];
  else if (e < 0.25) r = ['win', '敵軍潰走'];
  else if (a0 === 0) r = ['lose', '我軍全滅'];
  else if (p < 0.25) r = ['lose', '我軍潰走'];
  else if (t >= tl) {
    const lp = 1 - p, le = 1 - e;
    r = le - lp > 0.08 ? ['win', '時間到・判定勝利（敵方損失較重）'] : lp - le > 0.08 ? ['lose', '時間到・判定敗北（我方損失較重）'] : ['draw', '時間到・平手'];
  }
  if (r) GAME.result = battleResult(r[0], r[1]);
}
function battleResult(kind, why, extra) {
  const a0 = sideAlive(0), a1 = sideAlive(1);
  return { kind, why, t: U.uTime.value, alive: [a0, a1], ratio: [a0 / Math.max(1, GAME.init[0]), a1 / Math.max(1, GAME.init[1])], tick: simTick, hash: fullHash(), ...extra };   // hash：結束那一刻的戰局指紋（回放比對用）
}
// 撤退／手動結束：記下結束的 tick，回放才會停在同一刻（不靠勝負判定）
const RETREAT_MIN_T = 60;   // 開戰不到這麼久就撤退：不給經驗與功勳
function quitBattle() {
  if (GAME.result) return;
  const sim = GAME.sc && GAME.sc.sim;
  GAME.result = battleResult(sim ? 'end' : 'lose', sim ? '手動結束' : '撤退', { retreat: true });
}
const replayEndOf = (R) => ({ tick: R.tick, kind: R.kind, why: R.why, retreat: true });
function gameTick() {
  if (!(GAME.phase === 'battle' || GAME.phase === 'replay') || GAME.result) return;
  const end = GAME.replaying && GAME.replayEnd;
  if (end && simTick >= end.tick) { GAME.result = battleResult(end.kind, end.why, { retreat: !!end.retreat }); return; }
  const t = U.uTime.value;
  for (const f of fleets) if (f.reserve && f.activateAt != null && t >= f.activateAt) activateReserve(f);
  if (simTick % 30 === 0) for (const f of fleets) if (f.ai && !f.reserve && f.side !== GAME.simCtl) aiThink(f);
  if (simTick % 30 === 7) for (const f of fleets) if (f.supply && f.follow >= 0 && !f.reserve) supplyFollow(f);
  if (simTick % 30 === 15 && !battleSetup.noVictory) checkVictory();   // 模擬室可以關掉勝負判定
}

// ───── 提示 ─────
function toast(msg, cls = '') {
  if ((GAME.phase === 'battle' || GAME.phase === 'replay') && cls !== 'hint') { (GAME.log || (GAME.log = [])).push({ t: U.uTime.value, msg, cls }); if (GAME.log.length > 40) GAME.log.shift(); }   // 艦橋的通訊紀錄
  if (!uiOn('toasts')) return;
  const el = document.createElement('div'); el.className = 'toast ' + cls; el.textContent = msg;
  const box = gEl('toasts'); box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 3800);
}

// ───── 地形與部署區的地面標記 ─────
const fieldGroup = new THREE.Group(); fieldGroup.renderOrder = 0; scene.add(fieldGroup);
function rectLine(r, color, op) {
  const l = lineObj(color, op); setPts(l, [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1], [r.x0, r.z0]]); return l;
}
// 3D 地形：星雲、小行星帶是半透明的球；巨大小行星是實體（凹凸的岩塊，光影直接烤在頂點顏色裡，2D／3D 都看得到）
function rockMesh(tr) {
  const geo = new THREE.IcosahedronGeometry(tr.r, 4), P = geo.attributes.position, n = new THREE.Vector3();
  const sd = (tr.x * 0.013 + tr.z * 0.029) % 7;
  for (let i = 0; i < P.count; i++) {
    n.fromBufferAttribute(P, i).normalize();
    const k = 0.92 + 0.1 * Math.sin(n.x * 4.1 + sd) * Math.cos(n.y * 3.3 - sd) + 0.05 * Math.sin(n.z * 9.7 + n.x * 7.3 + sd * 2);   // 半徑 0.78～1.07 倍
    P.setXYZ(i, n.x * tr.r * k, n.y * tr.r * k, n.z * tr.r * k);
  }
  geo.computeVertexNormals();
  const N = geo.attributes.normal, col = new Float32Array(P.count * 3), base = new THREE.Color(TERRAIN_TYPES[tr.type].color), L = new THREE.Vector3(-0.5, 0.8, 0.35).normalize();
  for (let i = 0; i < P.count; i++) {
    n.fromBufferAttribute(N, i);
    const sh = 0.18 + 0.82 * Math.max(0, n.dot(L)) + 0.08 * Math.max(0, -n.y), v = 0.9 + 0.2 * Math.sin(i * 1.7);
    col[i * 3] = base.r * sh * v; col[i * 3 + 1] = base.g * sh * v; col[i * 3 + 2] = base.b * sh * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  m.position.set(tr.x, tr.y || 0, tr.z); m.renderOrder = 1;
  return m;
}
function drawField(showZones) {
  fieldGroup.clear();
  for (const tr of terrainList()) {
    const def = TERRAIN_TYPES[tr.type], y = tr.y || 0, has3 = tr.y != null || def.solid;
    if (def.solid) fieldGroup.add(rockMesh(tr));
    else if (has3) {
      const sph = new THREE.Mesh(new THREE.SphereGeometry(tr.r, 40, 24), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: tr.type === 'nebula' ? 0.05 : 0.03, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      sph.position.set(tr.x, y, tr.z); sph.renderOrder = 0; fieldGroup.add(sph);
      if (tr.type === 'asteroid') {   // 小行星帶：球裡面散著碎石（點）
        const R = mulberry32(Math.round(tr.x * 7 + tr.z * 13) >>> 0), N = Math.min(900, Math.round(tr.r * 4)), pos = new Float32Array(N * 3);
        for (let k = 0; k < N; k++) { let a, b, c; do { a = R() * 2 - 1; b = R() * 2 - 1; c = R() * 2 - 1; } while (a * a + b * b + c * c > 1); pos.set([tr.x + a * tr.r, y + b * tr.r, tr.z + c * tr.r], k * 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        fieldGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: def.color, size: 2.2, transparent: true, opacity: 0.7, depthWrite: false })));
      }
    } else {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(tr.r, 64), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.045, depthWrite: false, toneMapped: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(tr.x, -1, tr.z); disc.renderOrder = 0; fieldGroup.add(disc);
    }
    // 外框：在地形自己的高度畫一圈；不在基準面上的再往基準面畫一條垂直線（2D 也看得出高度）
    const ring = lineObj(def.color, def.solid ? 0.35 : 0.55), pts = [];
    for (let k = 0; k <= 64; k++) pts.push([tr.x + Math.cos(k / 64 * TAU) * tr.r, tr.z + Math.sin(k / 64 * TAU) * tr.r, y]);
    setPts(ring, pts); fieldGroup.add(ring);
    if (Math.abs(y) > 5) { const st = lineObj(def.color, 0.35); setPts(st, [[tr.x, tr.z, y], [tr.x, tr.z, 0], [tr.x - 10, tr.z, 0], [tr.x + 10, tr.z, 0]]); fieldGroup.add(st); }
  }
  if (showZones) { const mp = GAME.sc && GAME.sc.mp, me = mp ? MP_ZONES[GAME.playerSide] : DEPLOY_ZONE; fieldGroup.add(rectLine(me, 0xf2b35a, 0.8), rectLine(mp ? MP_ZONES[1 - GAME.playerSide] : ENEMY_ZONE, 0x7cc4ff, 0.5)); }
}

// ═════ 操作難度 ═════
// 一般：2D／3D／指揮官模式都能用，艦隊都在同一平面；進階：作戰中只能 3D 與指揮官模式，可以升降；
// 擬真：開戰直接上艦橋、不能離開，而且射線穿過別的友軍部隊時可能誤傷（同部隊多半停火）。存在玩家存檔（fleet.oplv），回放不受限制
const OP_LEVELS = [
  { name: '一般', desc: '可用 2D、3D 與指揮官模式；艦隊都在同一平面，不能升降' },
  { name: '進階', desc: '只能用 3D 與指揮官模式；艦隊可以上下移動' },
  { name: '擬真', desc: '作戰中只能用指揮官模式（艦橋）；艦隊可以上下移動；射線穿過別的友軍部隊會誤傷，同一個部隊（同陣型）內被擋住多半停火；戰爭迷霧：只看得到偵測範圍內、掃描到的敵軍，自動攻擊也只打看得到的（可以用區域攻擊盲射）' },
];
function opLevel() { let n = 0; try { n = +(STORE.getItem('fleet.oplv') || 0); } catch (e) { n = 0; } return OP_LEVELS[n] ? n : 0; }
function setOpLevel(n) { try { STORE.setItem('fleet.oplv', String(n)); } catch (e) { /* 只在本次 */ } }
function opNow() { return ((GAME.phase === 'battle' || GAME.phase === 'deploy') && GAME.op) || 0; }   // 目前生效的難度（作戰、部署中）
function applyOp(op = GAME.sc && GAME.sc.mp ? GAME.sc.op : opLevel(), fow = true) { GAME.op = op; opts.flat = op === 0; opts.ff = op === 2 ? 2 : false; opts.fow = op === 2 && fow; }   // 建立戰場前呼叫（規則會記進回放）；fow＝擬真的戰爭迷霧（模擬室可以關）
function opSeg(id) { const cur = opLevel(); return `<div class="wed-seg rd-seg" id="${id}">${OP_LEVELS.map((o, i) => `<button data-v="${i}" class="${cur === i ? 'on' : ''}">${o.name}</button>`).join('')}</div>`; }
function bindOpSeg(id, redraw) { gEl(id).querySelectorAll('button').forEach((b) => (b.onclick = () => { setOpLevel(+b.dataset.v); redraw(); })); }
function force3D() { if (opNow() >= 1 && !mode3D) { setRenderMode('3d', false); GAME.forced3D = true; } }   // 進階以上：作戰中強制 3D（不改存檔的畫面設定）

// ═════ 畫面 ═════
function setPhase(ph) {
  if (BR.on && ph !== 'battle' && ph !== 'replay') exitBridge();   // 離開作戰＝離開艦橋
  GAME.phase = ph;
  if (GAME.forced3D && ph !== 'battle' && ph !== 'deploy' && ph !== 'simedit') { GAME.forced3D = false; if (mode3D) setRenderMode('2d', false); }   // 離開作戰：回到原本的 2D
  { const op = opNow(), on = ph === 'battle' || ph === 'deploy';
    document.body.classList.toggle('op-flat', on && op === 0); document.body.classList.toggle('op-adv', op >= 1); document.body.classList.toggle('op-sim', op === 2); }
  document.body.classList.toggle('game-on', PHASE_ON.includes(ph) || ph === 'replay');
  document.body.classList.toggle('game-battle', ph === 'battle' || ph === 'replay');
  document.body.classList.toggle('game-deploy', ph === 'deploy');
  document.body.classList.toggle('game-sand', ph === 'sandbox');
  document.body.classList.toggle('game-simedit', ph === 'simedit');
  document.body.classList.toggle('game-watch', !!GAME.watch && (ph === 'battle' || ph === 'replay'));
  if (ph !== 'simedit') { const sb = gEl('simbar'); if (sb) sb.innerHTML = ''; SIM.drag = null; }
  gEl('battlehud').hidden = !(ph === 'battle' || ph === 'replay');
  gEl('skillbar').hidden = ph !== 'battle';
  gEl('deploybar').hidden = ph !== 'deploy';
  if (ph !== 'battle' && ph !== 'replay') { gEl('battlehud').innerHTML = ''; }
}
function overlay(html) { const g = gEl('game'); g.hidden = !html; gEl('g-screen').innerHTML = html || ''; g.scrollTop = 0; }

function menuBg() {
  GAME.recView = false; GAME.watch = false; opts.flat = opts.ff = opts.fow = false; GAME.op = 0;
  if (!battleSetup || !battleSetup.bg) { newBattle(12345); setRule('fire', true); }
  paused = false; updateTimeUI();
}
function showMenu() {
  mpQuit(); pvpExit();   // 離開多人戰鬥：斷開連線、換回單人的指揮官
  setPhase('menu'); GAME.replaying = false; GAME.playerSide = 0; menuBg();
  const item = (id, no, name, desc, cls = '', tag = '') => `<button class="g-btn mm-item ${cls}" id="${id}"><span class="mm-no">${no}</span><span class="mm-tx"><b>${name}</b><small>${desc}</small></span>${tag ? `<span class="mm-tag">${tag}</span>` : '<span class="mm-arr">›</span>'}</button>`;
  overlay(`<div class="g-menu">
    <h1>星海艦隊戰</h1><div class="sub">FLEET TACTICS · 原型</div>
    ${window.API ? `<div class="g-player"><span class="g-dim">玩家</span><b>${escH(API.name())}</b><span id="m-sync" class="sync-${STORE.state ? STORE.state() : 'ok'}">${syncText()}</span><button class="g-btn sm" id="m-acct">帳號</button><button class="g-btn sm" id="m-out">登出</button></div>` : ''}
    <div class="mm-list">
      ${item('m-single', '01', '單人戰鬥', '訓練作戰・隨機戰役・無限戰場・模擬室', 'pri')}
      ${item('m-multi', '02', '多人戰鬥', '和內網的其他玩家 1 對 1 對戰，或觀戰')}
      ${item('m-rec', '03', '戰鬥回放', '每場戰鬥都存在伺服器，隨時可以重看')}
      ${item('m-wed', '04', '武器配置', '調整、新增各艦種的武器位置（2D／3D 共用）')}
      ${item('m-set', '05', '設定', '按鍵綁定、遊戲速度、介面資訊')}
      ${item('m-test', '06', '遊戲測試', '大軍畫面、效能與戰鬥數值（射程、側背受擊倍率等）的測試場')}
    </div>
    <div class="mm-note" id="mm-note"></div>
    <div class="g-row mm-view" style="justify-content:center"><span class="g-dim">畫面</span><button class="g-btn sm ${mode3D ? '' : 'pri'}" id="m-2d">2D 像素</button><button class="g-btn sm ${mode3D ? 'pri' : ''}" id="m-3d">3D 模型</button><span class="g-dim" style="font-size:calc(12px * var(--ui))">（作戰中也可按 M 或畫面上方按鈕切換）</span></div>
  </div>`);
  gEl('m-2d').onclick = () => { setRenderMode('2d'); showMenu(); };
  gEl('m-3d').onclick = () => { setRenderMode('3d'); showMenu(); };
  gEl('m-single').onclick = showSingle;
  gEl('m-multi').onclick = () => (window.API ? showMulti() : (gEl('mm-note').textContent = '多人戰鬥要連上伺服器才能玩。'));
  gEl('m-wed').onclick = () => openWeaponEditor(showMenu);
  gEl('m-rec').onclick = () => showRecords();
  if (window.API) { gEl('m-out').onclick = () => API.logout(); gEl('m-acct').onclick = () => showAccount(); }
  gEl('m-set').onclick = () => openSettings();
  gEl('m-test').onclick = () => { overlay(null); setPhase('sandbox'); newBattle(12345); setCmdSide(0); };   // 原本的測試場（數值、畫面）
}
// 單人戰鬥：四種模式＋指揮官、星際酒館
function showSingle() {
  mpQuit(); pvpExit();
  setPhase('menu'); GAME.replaying = false; GAME.playerSide = 0; menuBg();
  const c = campLoad(), ro = randOpts();
  const pts = COMMANDERS.reduce((s, o) => s + Math.max(0, cmdrPoints(o.id)), 0);
  const mode = (id, en, name, desc, st) => `<button class="sp-mode" id="${id}"><span class="sp-en">${en}</span><b>${name}</b><span class="sp-desc">${desc}</span><span class="sp-st">${st}</span></button>`;
  overlay(`<div class="g-wrap sp-wrap">
    <div class="g-head"><h2>單人戰鬥</h2><span class="crumb">選擇作戰模式</span><span class="g-sp"></span><button class="g-btn" id="sp-back">← 主選單</button></div>
    <div class="sp-op"><span class="g-dim">操作難度</span>${opSeg('sp-op')}<span class="sp-opd">${OP_LEVELS[opLevel()].desc}</span></div>
    <div class="sp-grid">
      ${mode('sp-train', 'TRAINING', '訓練作戰', '固定的作戰關卡：讀情報、編成、部署，熟悉各種戰況', `${SCENARIOS.length} 場作戰`)}
      ${mode('sp-rand', 'SKIRMISH', '隨機戰役', '自選規模與敵軍強度，敵軍和地形每次隨機生成', `${RAND_SIZES[ro.size].name}・敵軍${RAND_DIFF[ro.diff].name}・地形${RAND_TERR[ro.terr].name}`)}
      ${mode('sp-camp', 'ENDLESS', '無限戰場', '無限關卡：敵軍依你的指揮官等級生成，一關比一關大', `目前第 ${c.stage} 關・最高第 ${c.best} 關`)}
      ${mode('sp-sand', 'SIMULATOR', '模擬室', '自由布置雙方艦隊、指揮官與地形，用正式規則測試戰術（可接管任一方）', '不計戰績、不給經驗')}
      <button class="sp-mode wide" id="sp-watch"><span class="sp-en">SPECTATE</span><b>AI 對戰觀摩</b><span class="sp-desc">選擇雙方 AI 的難度與打法，看 AI 互打：即時解說每支艦隊在做什麼，參考推進、消耗、包抄、突破與反制的時機</span><span class="sp-st">${watchSummary()}</span></button>
    </div>
    <div class="sp-row">
      <button class="sp-sub" id="sp-cmdr"><b>指揮官</b><span>${COMMANDERS.length} 位・等級與天賦</span>${pts ? `<i title="可分配的天賦點數">${pts}</i>` : ''}</button>
      <button class="sp-sub" id="sp-tav"><b>星際酒館</b><span>功勳 ${fmtN(ROSTER.merit)}・招募兩個陣營的指揮官</span></button>
    </div></div>`);
  gEl('sp-back').onclick = showMenu;
  bindOpSeg('sp-op', showSingle);
  gEl('sp-train').onclick = () => showBriefing(GAME.sc && SCENARIOS.includes(GAME.sc) ? GAME.sc : SCENARIOS[0]);
  gEl('sp-rand').onclick = showRandom;
  gEl('sp-camp').onclick = showCampaign;
  gEl('sp-sand').onclick = () => showSim();
  gEl('sp-watch').onclick = () => showWatch();
  gEl('sp-cmdr').onclick = () => showCommanders(showSingle);
  gEl('sp-tav').onclick = () => showTavern();
}
// ───── 指揮官與天賦 ─────
function showCommanders(back) {
  if (back) GAME.talBack = back;
  const sel = COMMANDERS.find((c) => c.id === GAME.talSel) || COMMANDERS[0]; GAME.talSel = sel.id;
  const lv = cmdrLevel(sel.id), xp = cmdrXP(sel.id), tal = cmdrTal(sel.id), pts = cmdrPoints(sel.id);
  const list = COMMANDERS.map((c) => `<button class="tal-who ${c === sel ? 'on' : ''}" data-c="${c.id}"><b>${c.title} ${c.name}</b><span><span class="${c.faction ? 'g-all' : 'g-emp'}">${FACTION_NAME[c.faction || 0].slice(0, 2)}</span>・Lv ${cmdrLevel(c.id)}・${TRAIT_NAME[c.trait]}</span>${cmdrPoints(c.id) > 0 ? `<i>${cmdrPoints(c.id)}</i>` : ''}</button>`).join('');
  const node = (t) => {
    const r = tal[t.id] || 0, can = talentCan(sel, t), innate = t.kind === 'skill' && sel.skills.includes(t.skill);
    const pips = t.kind === 'skill' ? '' : `<span class="tal-pips">${Array.from({ length: t.max }, (_, k) => `<i class="${k < r ? 'on' : ''}"></i>`).join('')}</span>`;
    const desc = t.kind === 'skill' ? SKILLS[t.skill].desc : (r ? `目前：${t.desc(r)}` : t.desc(1)) + (r && r < t.max ? `<br><span class="nx">下一階：${t.desc(r + 1)}</span>` : '');
    const state = innate ? '固有技能' : t.kind === 'skill' ? (r ? '已學會' : can === 'ok' ? `學習（${t.cost} 點）` : can) : r >= t.max ? '已滿' : can === 'ok' ? `+1（${t.cost} 點）` : can;
    return `<div class="tal-node ${t.kind === 'skill' ? 'sk' : ''} ${r || innate ? 'got' : ''}" data-t="${t.id}">
      <div class="tal-top"><b>${t.name}</b>${pips}</div><div class="tal-desc">${desc}</div>
      <div class="tal-act"><button class="g-btn sm" data-add="${t.id}" ${can === 'ok' ? '' : 'disabled'}>${state}</button>${r && !innate ? `<button class="g-btn sm" data-sub="${t.id}" title="退回點數">−</button>` : ''}</div></div>`;
  };
  const keepScroll = GAME.talOpen ? gEl('game').scrollTop : 0;   // 加點後畫面不要跳回頂端
  const tree = TALENT_BRANCHES.map(([br, name]) => `<div class="tal-col"><h4>${name}</h4>${TALENTS.filter((t) => t.br === br).map(node).join('')}</div>`).join('');
  const skills = commanderSkills(sel.skills, tal).map((id) => `<span class="tal-sk ${sel.skills.includes(id) ? '' : 'new'}" title="${SKILLS[id].desc}">${SKILLS[id].name}</span>`).join('');
  overlay(`<div class="g-wrap tal-wrap"><div class="g-head"><h2>指揮官</h2><span class="crumb">每升一級得 1 點天賦，用來強化能力或學習技能；可以隨時退回重新分配</span><span class="g-sp"></span><button class="g-btn" id="c-back">返回</button></div>
    <div class="tal-layout"><div class="tal-list">${list}</div>
      <div class="g-card tal-main">
        <div class="tal-head"><div><h3 class="tal-name">${sel.title} ${sel.name}</h3><div class="g-dim" style="font-size:calc(12.5px * var(--ui))">${sel.bio}</div></div>
          <div class="tal-lv"><b>Lv ${lv}</b><div class="xpbar"><i style="width:${(xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100}%"></i></div><span class="g-dim">${xp % XP_PER_LEVEL} / ${XP_PER_LEVEL} 經驗</span></div>
          <div class="tal-pt"><span class="g-dim">天賦點數</span><b class="${pts > 0 ? 'g-emp' : ''}">${pts}</b><span class="g-dim">／${lv}</span><button class="g-btn sm" id="c-reset" ${talSpent(tal) ? '' : 'disabled'}>全部退回</button></div></div>
        <dl class="kv"><dt>固有特性</dt><dd>${TRAIT_NAME[sel.trait]} +8%</dd><dt>可用技能</dt><dd>${skills}</dd></dl>
        <div class="tal-tree">${tree}</div></div></div></div>`);
  const root = gEl('game'); root.scrollTop = keepScroll; GAME.talOpen = true;
  root.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { GAME.talSel = b.dataset.c; showCommanders(); }));
  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { if (talentAdd(sel, TALENT_BY_ID[b.dataset.add])) showCommanders(); }));
  root.querySelectorAll('[data-sub]').forEach((b) => (b.onclick = () => { if (talentSub(sel, TALENT_BY_ID[b.dataset.sub])) showCommanders(); }));
  gEl('c-reset').onclick = () => { CMDR_SAVE[sel.id].tal = {}; saveCmdrs(CMDR_SAVE); showCommanders(); };
  gEl('c-back').onclick = () => { const f = GAME.talBack || showMenu; GAME.talBack = null; GAME.talOpen = false; f(); };
}

// 小地圖（SVG）：部署區、地形、敵軍推估位置
function minimapSVG(sc, intel, lo) {
  const W = 360, Hh = 260, mx = (x) => (x - MAP_BOUNDS.x0) / (MAP_BOUNDS.x1 - MAP_BOUNDS.x0) * W, mz = (z) => (z - MAP_BOUNDS.z0) / (MAP_BOUNDS.z1 - MAP_BOUNDS.z0) * Hh;
  const sx = W / (MAP_BOUNDS.x1 - MAP_BOUNDS.x0);
  const rect = (r, c, op) => `<rect x="${mx(r.x0)}" y="${mz(r.z0)}" width="${mx(r.x1) - mx(r.x0)}" height="${mz(r.z1) - mz(r.z0)}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-opacity=".7" stroke-dasharray="4 3"/>`;
  let s = `<svg class="minimap" viewBox="0 0 ${W} ${Hh}">`;
  s += rect(DEPLOY_ZONE, '#f2b35a', 0.08) + rect(ENEMY_ZONE, '#7cc4ff', 0.06);
  for (const t of sc.terrain) s += `<circle cx="${mx(t.x)}" cy="${mz(t.z)}" r="${t.r * sx}" fill="#${TERRAIN_TYPES[t.type].color.toString(16).padStart(6, '0')}" fill-opacity=".22"/>`;
  for (const f of intel.fleets) s += `<circle cx="${mx(f.x)}" cy="${mz(f.z)}" r="${f.fuzz * sx + 6}" fill="#7cc4ff" fill-opacity=".18" stroke="#7cc4ff" stroke-opacity=".6"/><text x="${mx(f.x)}" y="${mz(f.z) - f.fuzz * sx - 9}" fill="#9fd2ff" font-size="10" text-anchor="middle">${f.name}</text>`;
  if (lo) lo.fleets.forEach((f, k) => { s += `<circle cx="${mx(f.x)}" cy="${mz(f.z)}" r="6" fill="#f2b35a"/><text x="${mx(f.x)}" y="${mz(f.z) + 18}" fill="#f2b35a" font-size="10" text-anchor="middle">第${'一二三四'[k]}艦隊</text>`; });
  s += `<text x="6" y="${Hh - 6}" fill="#8592a8" font-size="10">虛線框＝部署區　藍圈＝敵軍推估位置（越大越不確定）</text></svg>`;
  return s;
}
function stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
function showBriefing(sc) {
  GAME.sc = sc; GAME.intel = makeIntel(sc);
  if (!GAME.loadout || GAME.loadout.sc !== sc.id) { GAME.loadout = defaultLoadout(sc); GAME.loadout.sc = sc.id; }
  setPhase('briefing');
  const I = GAME.intel;
  const compStr = (c) => c ? c.map((n, t) => n ? `${SHIP_TYPES[t].name} ~${ships5(n)}` : '').filter(Boolean).join('、') : '<span class="unk">不明</span>';
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>訓練作戰</h2><span class="crumb">PvE 1v1　·　選擇作戰</span><span class="g-sp"></span><button class="g-btn" id="b-back">← 單人戰鬥</button></div>
    <div class="brief">
      <div class="sc-list">${SCENARIOS.map((s) => `<button class="sc-item ${s === sc ? 'on' : ''}" data-id="${s.id}"><b>${s.name}</b><span>${s.size}　${Math.round(s.timeLimit / 60)} 分鐘　難度 <span class="stars">${stars(s.level)}</span></span></button>`).join('')}</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="g-card"><h3>狀況</h3><div>${sc.story}</div>
          <dl class="kv"><dt>勝利條件</dt><dd>殲滅敵軍，或使敵軍損失超過 75%（潰走）</dd><dt>敗北條件</dt><dd>我軍損失超過 75%</dd>
          <dt>時間限制</dt><dd>${Math.round(sc.timeLimit / 60)} 分鐘（時間到依雙方損失比例判定）</dd><dt>編成預算</dt><dd>${fmtN(sc.budget)} 點　最多 ${sc.maxFleets} 支艦隊</dd>
          <dt>情報準確度</dt><dd>${Math.round(I.acc * 100)}%${I.acc < 0.7 ? '　<span class="g-warn">情報可能有誤</span>' : ''}</dd></dl></div>
        <div class="intel-grid">
          <div class="g-card"><h3>敵方配置</h3>${I.fleets.map((f) => `<div class="ef"><b>${f.name}</b>
            <dl class="kv"><dt>指揮官</dt><dd>${f.cmdr.name}（${TRAIT_NAME[f.cmdr.trait]}型${f.cmdr.level ? ' Lv ' + f.cmdr.level : '・等級不明'}）</dd>
            <dt>兵力</dt><dd>約 ${ships5(f.lo)}～${ships5(f.hi)} 艘</dd>
            <dt>編成</dt><dd>${compStr(f.comp)}</dd>
            <dt>偏好陣型</dt><dd>${FORMATIONS[f.formation].name}<span class="conf">可信度 ${f.conf}%</span></dd>
            <dt>偏好打法</dt><dd>${f.tactic ? `${TACTICS[f.tactic].name}<span class="conf">${TACTICS[f.tactic].desc}</span>` : '<span class="unk">不明</span>'}</dd></dl></div>`).join('')}
            <dl class="kv"><dt>其他</dt><dd>${I.events ? (I.events.length ? I.events.join('<br>') : '未發現其他部隊') : '<span class="unk">不明（無法排除伏兵或增援）</span>'}</dd></dl></div>
          <div class="g-card"><h3>戰場環境</h3>${minimapSVG(sc, I, GAME.loadout)}
            <div style="margin-top:8px;font-size:calc(12.5px * var(--ui))">${sc.terrain.length ? [...new Set(sc.terrain.map((t) => t.type))].map((k) => `<div><b>${TERRAIN_TYPES[k].name}</b>：<span class="g-dim">${TERRAIN_TYPES[k].desc}</span></div>`).join('') : '<span class="g-dim">開闊宙域，沒有地形影響。</span>'}</div></div>
        </div>
        <div class="g-row"><span class="g-sp"></span><button class="g-btn pri" id="b-next">進入編成 →</button></div>
      </div>
    </div></div>`);
  document.querySelectorAll('.sc-item').forEach((b) => (b.onclick = () => showBriefing(SCENARIOS.find((s) => s.id === b.dataset.id))));
  gEl('b-back').onclick = showSingle;
  gEl('b-next').onclick = showLoadout;
}

// 航母機庫比例（每個航母圖示的機庫合計 n 架）
function hangarRow(f, k) {
  const n = SHIP_TYPES[0].fighters.n, h = f.hangar || (f.hangar = HANGAR_DEFAULT.slice()), sum = sumA(h);
  return `<div class="ld-hang"><div class="ld-row"><span>艦載機配置<br><small>每艘航母 ${n} 架</small></span><span class="g-dim" style="font-size:calc(12px * var(--ui))">${sum === n ? '' : `<b class="g-warn">合計 ${sum}，會依比例換算成 ${n} 架</b>`}</span><span></span></div>
    ${CRAFT.map((c, r) => `<div class="ld-row"><span>${c.name}</span><small title="${c.note}">${c.note}</small>
      <span class="ctl"><button class="g-btn sm" data-hk="${k}" data-hr="${r}" data-hd="-1">−</button><input type="number" min="0" max="${n}" value="${h[r]}" data-hk="${k}" data-hr="${r}"><button class="g-btn sm" data-hk="${k}" data-hr="${r}" data-hd="1">＋</button></span></div>`).join('')}</div>`;
}
function showLoadout() {
  const sc = GAME.sc, lo = GAME.loadout;
  if (lo.faction == null) lo.faction = GAME.faction || 0;
  fixLoadoutCmdrs(lo);
  setPhase('loadout');
  const fac = lo.faction;
  const SPS = supplyList(lo);
  const used = sumA(lo.fleets.map((f) => compCost(f.comp))) + sumA(SPS.map((s) => compCost(s.comp)));
  const loF = (k) => (k[0] === 's' ? SPS[+k.slice(1)] : lo.fleets[+k]);   // 編成卡片：k＝艦隊序號，'s0'、's1'…＝補給艦隊
  const over = used > sc.budget;
  const cmdrOpts = (sel, k) => cmdrsOf(fac).map((c) => { const taken = lo.fleets.some((f, j) => j !== k && f.cmdr === c.id); return `<option value="${c.id}" ${c.id === sel ? 'selected' : ''} ${taken ? 'disabled' : ''}>${c.name}（${TRAIT_NAME[c.trait]} Lv ${cmdrLevel(c.id)}${cmdrPoints(c.id) > 0 ? `，天賦 ${cmdrPoints(c.id)} 點未分配` : ''}）${taken ? '・已指派' : ''}</option>`; }).join('');
  const typeRows = (f, k, types = SHIP_TYPES.map((_, t) => t).filter((t) => t < N_COMBAT)) => types.map((t) => [SHIP_TYPES[t], t]).map(([st, t]) => `<div class="ld-row"><span>${st.name}<br><small>${st.cost} 點／${opts.rep} 艘</small></span>
      <small title="${st.note}">耐久 ${st.hp}・護盾 ${st.sh}・${GUN_KEYS.filter((k) => st.guns[k]).map((k) => `${GUN_NAME[k]} ${st.guns[k].far}`).join('／')}・速度 ${st.speed}${st.missile ? `・飛彈 ${st.missile.n} 發（每 ${st.missile.cd} 秒）` : ''}${st.supply ? `・補給存量 ${st.supply.stock} 發` : ''}${st.fighters ? `・艦載機 ${st.fighters.n} 架` : ''}${st.repair ? `・維修機 ${st.repair.n}` : ''}</small>
      <span class="ctl"><button class="g-btn sm" data-k="${k}" data-t="${t}" data-d="-20">−</button><input type="number" min="0" step="10" value="${f.comp[t] || 0}" data-k="${k}" data-t="${t}"><button class="g-btn sm" data-k="${k}" data-t="${t}" data-d="20">＋</button></span></div>`).join('');
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>編成</h2><span class="crumb">${sc.name}　·　預算 ${fmtN(sc.budget)} 點</span><span class="g-sp"></span><button class="g-btn" id="l-back">${sc.mp ? '← 房間' : '← 簡報'}</button></div>
    <div class="g-card" style="margin-bottom:12px"><div class="g-row" style="margin-bottom:8px"><span class="g-dim">陣營</span>
      <div class="wed-seg" id="l-fac"><button data-f="0" class="${fac === 0 ? 'on emp' : ''}">帝國軍</button><button data-f="1" class="${fac === 1 ? 'on all' : ''}">聯盟軍</button></div>
      <span class="g-dim" style="font-size:calc(12px * var(--ui))">${sc.mp ? `只能派該陣營的初始指揮官（${cmdrsOf(fac).length} 位），等級與天賦是多人專用的；換陣營會通知房間` : `只能派該陣營的指揮官（${cmdrsOf(fac).length} 位）；敵軍是另一個陣營。指揮官不夠可以到「星際酒館」招募`}</span></div>
      <div class="g-row" style="margin-bottom:8px"><span class="g-dim">操作難度</span>${sc.mp ? `<b>${OP_LEVELS[sc.op].name}</b><span class="g-dim" style="font-size:calc(12px * var(--ui))">（房主決定）${OP_LEVELS[sc.op].desc}</span>` : `${opSeg('l-op')}<span class="g-dim" style="font-size:calc(12px * var(--ui))">${OP_LEVELS[opLevel()].desc}</span>`}</div>
      ${lo.fleets.length ? '' : '<div class="g-warn" style="margin-bottom:8px">這個陣營沒有可派的指揮官，先到星際酒館招募。</div>'}
      <div class="g-row"><span>已用 <b class="${over ? 'g-warn' : 'g-emp'}">${fmtN(used)}</b> / ${fmtN(sc.budget)} 點</span>
      <span class="g-dim">總兵力 ${ships5(sumA(lo.fleets.map((f) => sumA(f.comp))) + sumA(SPS.map((s) => sumA(s.comp))))} 艘</span><span class="g-sp"></span>${SPS.length < Math.max(1, lo.fleets.length) ? `<button class="g-btn sm" id="l-sup" title="補給艦＋護衛艦，不佔艦隊數、沒有指揮官；最多跟艦隊數一樣多支">＋ 補給艦隊（${SPS.length}／${Math.max(1, lo.fleets.length)}）</button>` : ''}
      ${lo.fleets.length < sc.maxFleets && lo.fleets.length < cmdrsOf(fac).length ? '<button class="g-btn sm" id="l-add">＋ 增加艦隊</button>' : ''}</div>
      <div class="budget ${over ? 'over' : ''}" style="margin-top:6px"><i style="width:${Math.min(100, used / sc.budget * 100)}%"></i></div>
      ${over ? '<div class="g-warn" style="margin-top:6px">超出預算，請減少艦艇。</div>' : ''}</div>
    <div class="ld-fleets">${lo.fleets.map((f, k) => { const c = COMMANDERS.find((o) => o.id === f.cmdr); return `<div class="g-card ld-fleet">
      <h4><span class="g-emp">第${'一二三四'[k]}艦隊</span><span class="g-dim" style="font-size:calc(12px * var(--ui))">${ships5(sumA(f.comp))} 艘・${fmtN(compCost(f.comp))} 點</span><span class="g-sp"></span>${lo.fleets.length > 1 ? `<button class="g-btn sm" data-del="${k}">移除</button>` : ''}</h4>
      <div class="ld-row"><span>指揮官</span><select class="g-sel" data-cm="${k}">${cmdrOpts(f.cmdr, k)}</select><span></span></div>
      <div class="g-dim" style="font-size:calc(12px * var(--ui));margin:2px 0 6px">${c ? `${c.bio}　技能：${c.skills.map((s) => `<b title="${SKILLS[s].desc}">${SKILLS[s].name}</b>`).join('、')}` : ''}</div>
      ${typeRows(f, k)}
      ${f.comp[0] > 0 ? hangarRow(f, k) : ''}
      <div class="ld-row"><span>起始陣型</span><select class="g-sel" data-fm="${k}">${Object.keys(FORMATIONS).map((fk) => `<option value="${fk}" ${fk === f.formation ? 'selected' : ''}>${FORMATIONS[fk].name}</option>`).join('')}</select><span></span></div>
      <div class="ld-row"><span>排列</span><select class="g-sel" data-ar="${k}"><option value="0" ${!f.orderly ? 'selected' : ''}>自然</option><option value="1" ${f.orderly && (f.layers || 1) === 1 ? 'selected' : ''}>整齊・1 層</option><option value="3" ${f.orderly && f.layers === 3 ? 'selected' : ''}>整齊・3 層</option></select><span></span></div>
    </div>`; }).join('')}${SPS.map((SP, i) => `<div class="g-card ld-fleet ld-sup">
      <h4><span class="g-emp">${supplyName(i)}</span><span class="g-dim" style="font-size:calc(12px * var(--ui))">${ships5(sumA(SP.comp))} 艘・${fmtN(compCost(SP.comp))} 點</span><span class="g-sp"></span><button class="g-btn sm" data-sdel="${i}">移除</button></h4>
      <div class="g-dim" style="font-size:calc(12px * var(--ui));margin:2px 0 6px">補給艦隊不佔艦隊數、沒有指揮官。任何友艦（不限跟隨的那支）待在補給艦 ${SUPPLY_RULE.range} 內，飛彈沒滿就每 ${SUPPLY_RULE.cd} 秒補 1 發，一直補到滿或存量用完；補給艦被擊沉，它帶的存量就沒了。</div>
      ${typeRows(SP, 's' + i, [4, SUPPLY_T])}
      <div class="ld-row"><span>跟隨</span><select class="g-sel" data-sfol="${i}"><option value="-1" ${SP.follow < 0 ? 'selected' : ''}>不跟隨（自己指揮）</option>${lo.fleets.map((f, k) => `<option value="${k}" ${SP.follow === k ? 'selected' : ''}>第${'一二三四'[k]}艦隊</option>`).join('')}</select><span class="g-dim" style="font-size:calc(11.5px * var(--ui))">跟在後方 ${SUPPLY_RULE.follow}；戰鬥中直接下移動命令會取消跟隨</span></div>
      <div class="ld-row"><span>起始陣型</span><select class="g-sel" data-sfm="${i}">${Object.keys(FORMATIONS).map((fk) => `<option value="${fk}" ${fk === (SP.formation || 'ring') ? 'selected' : ''}>${FORMATIONS[fk].name}</option>`).join('')}</select><span></span></div>
    </div>`).join('')}</div>
    <div class="g-row" style="margin-top:14px"><span class="g-dim">技能：${Object.values(SKILLS).map((s) => `<b>${s.name}</b>（${s.desc}）`).join('　')}</span></div>
    <div class="g-row" style="margin-top:12px"><span class="g-sp"></span><button class="g-btn pri" id="l-next" ${over || !used || !lo.fleets.length ? 'disabled' : ''}>下一步：部署 →</button></div>
  </div>`);
  const redraw = () => showLoadout();
  if (!sc.mp) bindOpSeg('l-op', redraw);
  gEl('l-back').onclick = () => (sc.mp ? showRoom() : sc.campaign ? showCampBriefing() : sc.random ? showRandom() : showBriefing(sc));
  if (gEl('l-add')) gEl('l-add').onclick = () => {
    const free = cmdrsOf(fac).find((c) => !lo.fleets.some((f) => f.cmdr === c.id));
    if (!free) return;
    const left = Math.max(0, sc.budget - used);
    lo.fleets.push({ cmdr: free.id, comp: defaultComp(Math.max(600, left)), formation: 'line', x: 0, z: 300 + ZONE_SHIFT, h: Math.PI });
    lo.fleets.forEach((f, k) => { f.x = lo.fleets.length === 1 ? 0 : -300 + 600 * k / (lo.fleets.length - 1); });
    redraw();
  };
  gEl('l-fac').onclick = (e) => {
    const f = e.target.dataset.f; if (f == null || +f === fac) return;
    lo.faction = +f; if (sc.mp) mpFaction(+f); else GAME.faction = +f;
    if (!lo.fleets.length) { const d = defaultLoadout(sc, +f); lo.fleets = d.fleets; } else for (const fl of lo.fleets) fl.cmdr = null;   // 換陣營：重新分配指揮官
    redraw();
  };
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const k = +b.dataset.del; lo.fleets.splice(k, 1);
    for (const S of SPS) S.follow = S.follow === k ? (lo.fleets.length ? 0 : -1) : S.follow > k ? S.follow - 1 : S.follow;   // 跟隨的艦隊被移除
    redraw();
  }));
  if (gEl('l-sup')) gEl('l-sup').onclick = () => { SPS.push(defaultSupply(lo, SPS.length)); redraw(); };
  document.querySelectorAll('[data-sdel]').forEach((b) => (b.onclick = () => { SPS.splice(+b.dataset.sdel, 1); redraw(); }));
  document.querySelectorAll('[data-sfol]').forEach((el) => (el.onchange = () => { SPS[+el.dataset.sfol].follow = +el.value; }));
  document.querySelectorAll('[data-sfm]').forEach((el) => (el.onchange = () => { SPS[+el.dataset.sfm].formation = el.value; }));
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { const f = loF(b.dataset.k); f.comp[+b.dataset.t] = Math.max(0, f.comp[+b.dataset.t] + +b.dataset.d); redraw(); }));
  document.querySelectorAll('.ld-row input[data-t]').forEach((el) => (el.onchange = () => { const f = loF(el.dataset.k); f.comp[+el.dataset.t] = Math.max(0, Math.round(+el.value || 0)); redraw(); }));
  document.querySelectorAll('[data-hd]').forEach((b) => (b.onclick = () => {
    const f = lo.fleets[+b.dataset.hk], h = f.hangar, r = +b.dataset.hr, d = +b.dataset.hd, n = SHIP_TYPES[0].fighters.n;
    if (d > 0 && sumA(h) >= n) { let o = -1; h.forEach((v, j) => { if (j !== r && v > 0 && (o < 0 || v > h[o])) o = j; }); if (o < 0) return; h[o]--; }   // 滿了：從最多的那種挪一架過來
    h[r] = Math.max(0, Math.min(n, h[r] + d)); redraw();
  }));
  document.querySelectorAll('.ld-hang input[type=number]').forEach((el) => (el.onchange = () => { const f = lo.fleets[+el.dataset.hk]; f.hangar[+el.dataset.hr] = Math.max(0, Math.round(+el.value || 0)); redraw(); }));
  document.querySelectorAll('[data-cm]').forEach((el) => (el.onchange = () => { lo.fleets[+el.dataset.cm].cmdr = el.value; redraw(); }));
  document.querySelectorAll('[data-fm]').forEach((el) => (el.onchange = () => { lo.fleets[+el.dataset.fm].formation = el.value; }));
  document.querySelectorAll('[data-ar]').forEach((el) => (el.onchange = () => { const f = lo.fleets[+el.dataset.ar], v = +el.value; f.orderly = v > 0; f.layers = v || 1; }));
  gEl('l-next').onclick = startDeploy;
}

// ───── 部署 ─────
function deployWheel(deltaY) {
  const d = GAME.drag, f = dpLo(); if (!d || !f) return;
  if (GAME.op === 0) { hint('一般難度：艦隊都在同一平面，不能調高度'); return; }
  d.dy = (d.dy || 0) + (deltaY < 0 ? 20 : -20);
  const y = Math.max(-ALT_MAX + 50, Math.min(ALT_MAX - 50, (f.y || 0) + d.dy)); d.dy = y - (f.y || 0);
  hint(`起始高度 ${y > 0 ? '+' : ''}${Math.round(y)}（滾輪調整）· 放開放置`);
}
function rebuildDeploy() {
  const sel = GAME.deploySel;
  applyOp();
  newBattle(GAME.sc.seed, GAME.sc.mp ? mpPreviewSetup() : makeSetup(GAME.sc, GAME.loadout, GAME.attempt));
  paused = true; updateTimeUI();
  drawField(true);
  const f = fleets.filter((o) => o.side === GAME.playerSide)[sel];
  if (f) setSelection(f.sqs);
  renderDeployBar();
}
function startDeploy() {
  GAME.playerSide = GAME.sc && GAME.sc.mp ? NET.seat : 0;
  if (GAME.sc && GAME.sc.mp) NET.screen = 'deploy';
  GAME.loadout.supplies = supplyList(GAME.loadout).filter((S) => sumA(S.comp) > 0);   // 沒有船的補給艦隊不出擊（部署序號才會跟戰場上的艦隊對得上）
  if (GAME.sc && (GAME.sc.campaign || GAME.sc.random)) campEnemy(GAME.sc, GAME.loadout);   // 戰役：依出擊指揮官的平均等級生成敵軍
  applyOp(); overlay(null); setPhase('deploy'); GAME.deploySel = 0; force3D();
  setCmdSide(GAME.playerSide, false);
  rebuildDeploy();
  camAnim = null; view.target.x = 0; view.target.z = GAME.playerSide ? -300 : 300; view.height = 1250; view.yaw = mode3D && GAME.playerSide ? Math.PI : 0; view.pitch = ELEV; updateCamera();   // 多人的第二方：3D 轉 180°，自己在下方
}
// 部署中選的那一支（序號＝lo.fleets，最後一個是補給艦隊）
function dpLo() { const lo = GAME.loadout; return GAME.deploySel < lo.fleets.length ? lo.fleets[GAME.deploySel] : supplyList(lo)[GAME.deploySel - lo.fleets.length]; }
function renderDeployBar() {
  const lo = GAME.loadout;
  gEl('deploybar').innerHTML = `<span class="g-dim">部署：</span>${lo.fleets.map((f, k) => `<button class="g-btn dp-f ${k === GAME.deploySel ? 'on' : ''}" data-k="${k}">第${'一二三四'[k]}艦隊</button>`).join('')}${supplyList(lo).map((S, i) => `<button class="g-btn dp-f ${GAME.deploySel === lo.fleets.length + i ? 'on' : ''}" data-k="${lo.fleets.length + i}">${supplyName(i)}</button>`).join('')}
    <button class="g-btn sm" id="dp-l" title="左轉 45°">↺</button><button class="g-btn sm" id="dp-r" title="右轉 45°">↻</button>
    <span class="g-dim" style="font-size:calc(12px * var(--ui))">左鍵點艦隊＝選擇；右鍵在橘色框內點擊＝放置，按住拖曳＝朝向</span>
    <button class="g-btn sm" id="dp-3d">${mode3D ? '2D 畫面' : '3D 畫面'}</button><button class="g-btn" id="dp-back">← 編成</button><button class="g-btn pri" id="dp-go">${GAME.sc.mp ? '部署完成・準備' : '開戰'}</button>`;
  gEl('dp-3d').onclick = () => { setRenderMode(mode3D ? '2d' : '3d'); renderDeployBar(); };
  document.querySelectorAll('#deploybar .dp-f').forEach((b) => (b.onclick = () => { GAME.deploySel = +b.dataset.k; rebuildDeploy(); }));
  gEl('dp-l').onclick = () => { dpLo().h -= Math.PI / 4; rebuildDeploy(); };
  gEl('dp-r').onclick = () => { dpLo().h += Math.PI / 4; rebuildDeploy(); };
  gEl('dp-back').onclick = () => { fieldGroup.clear(); showLoadout(); };
  gEl('dp-go').onclick = GAME.sc.mp ? mpReady : startBattle;
}
function clampZone(p) { const Z = GAME.sc && GAME.sc.mp ? MP_ZONES[GAME.playerSide] : DEPLOY_ZONE; p.x = Math.max(Z.x0, Math.min(Z.x1, p.x)); p.z = Math.max(Z.z0, Math.min(Z.z1, p.z)); return p; }
// 編成裡的位置一律用第一方（下方）的座標；多人的第二方在戰場上是整個轉 180°
function dpCanon(p) { return GAME.sc && GAME.sc.mp && GAME.playerSide ? { x: -p.x, z: -p.z } : p; }
// 遊戲層攔截滑鼠／觸控：部署時放置艦隊、技能選目標
function gamePointer(type, e) {
  if (GAME.phase === 'simedit') return simPointer(type, e);   // 模擬室編輯：選取、移動、放置
  // 技能選目標：左鍵（或觸控）點敵方分艦隊；右鍵取消
  if (GAME.skillArm && type === 'down' && e.pointerType !== 'touch' && e.button === 2) { skillEsc(); return true; }
  if (GAME.skillArm && GAME.skillArm.point && type === 'down' && (e.pointerType === 'touch' || e.button === 0)) {
    const A = GAME.skillArm, p = groundAt(e.clientX, e.clientY, A.area || A.recon ? selAlt() : 0);
    if (p) { if (A.area) cmdArea({ x: p.x, y: selAlt(), z: p.z }); else if (A.recon) cmdRecon(A.f, { x: p.x, y: selAlt(), z: p.z }); else skillCmd(GAME.skillArm.f, GAME.skillArm.id, null, p); GAME.skillArm = null; hideHint(); } else toast('請點選地圖上的位置（Esc 取消）');
    return true;
  }
  if (GAME.skillArm && type === 'down' && (e.pointerType === 'touch' || e.button === 0)) {
    const q = squadronAt(e.clientX, e.clientY);
    if (q && q.side !== cmdSide && !q.bg) {
      if (GAME.skillArm.attack) cmdAttack(q); else skillCmd(GAME.skillArm.f, GAME.skillArm.id, q);
      GAME.skillArm = null; hideHint();
    }
    else toast('請點選敵方分艦隊（Esc 取消）');
    return true;
  }
  if (GAME.phase !== 'deploy') return false;
  if (e.pointerType === 'touch') {
    // 觸控：輕點放置；拖曳照常平移鏡頭
    if (type === 'down') GAME.drag = { x0: e.clientX, y0: e.clientY, t0: e.timeStamp, touch: true };
    else if (type === 'up' && GAME.drag && GAME.drag.touch && Math.hypot(e.clientX - GAME.drag.x0, e.clientY - GAME.drag.y0) < 12 && e.timeStamp - GAME.drag.t0 < 400) {
      const p = groundAt(e.clientX, e.clientY); GAME.drag = null;
      if (p) { const f = dpLo(); clampZone(p); const c = dpCanon(p); f.x = c.x; f.z = c.z; rebuildDeploy(); }
    }
    return false;
  }
  if (e.button === 1 && type === 'down') return false;
  // 部署：左鍵點自己的艦隊＝選它；右鍵點擊＝放置，右鍵拖曳＝指定朝向
  if (type === 'down' && e.button === 0) {
    const q = squadronAt(e.clientX, e.clientY);
    if (q && q.side === GAME.playerSide && q.fleet) { const k = fleets.filter((o) => o.side === GAME.playerSide).indexOf(q.fleet); if (k >= 0) { GAME.deploySel = k; setSelection(q.fleet.sqs); renderDeployBar(); } }
    return true;
  }
  if (type === 'down' && e.button === 2) {
    const A = groundAt(e.clientX, e.clientY); if (!A) return true;
    clampZone(A); GAME.drag = { A, x0: e.clientX, y0: e.clientY };
    return true;
  }
  if (!GAME.drag || GAME.drag.touch) return type !== 'move' ? false : false;
  const B = groundAt(e.clientX, e.clientY), d = GAME.drag;
  if (type === 'move') {
    if (B && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 12) { preview.visible = true; pvBox.visible = pvArrow.visible = pvPath.visible = false; pvLine.visible = true; setPts(pvLine, [[d.A.x, d.A.z], [B.x, B.z]]); }
    return true;
  }
  if (type === 'up') {
    hidePreview(); pvBox.visible = pvArrow.visible = pvPath.visible = true; hideHint();
    const f = dpLo();
    const A = dpCanon(d.A);
    f.x = A.x; f.z = A.z; if (d.dy) f.y = Math.max(-ALT_MAX + 50, Math.min(ALT_MAX - 50, (f.y || 0) + d.dy));
    if (B && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 20) { const Bc = dpCanon(B); f.h = Math.atan2(Bc.x - A.x, Bc.z - A.z); }
    GAME.drag = null; rebuildDeploy();
    return true;
  }
  return false;
}

// ───── 戰鬥 ─────
function startBattle() {
  GAME.attempt++; GAME.recView = false; GAME.watch = false;
  const setup = makeSetup(GAME.sc, GAME.loadout, GAME.attempt);
  applyOp(); setup.op = GAME.op;
  newBattle(GAME.sc.seed + GAME.attempt, setup);
  setRule('fire', true); setRule('advance', false);
  GAME.init = [sideAlive(0), sideAlive(1)];
  GAME.result = null; GAME.reportShown = false; GAME.replaying = false; GAME.replayEnd = null; GAME.skillArm = null; GAME.xp = null; GAME.log = []; GAME.simCtl = null;
  gEl('battlehud').innerHTML = '';
  drawField(false);
  setPhase('battle'); setCmdSide(GAME.playerSide, false); clearSelection();
  paused = false; setSpeed(SETTINGS.speedIdx);
  force3D(); if (GAME.op === 2) enterBridge();   // 擬真：開戰直接上艦橋
  if (opts.fow && SETTINGS.autoScan === false) issue('autoscan', { on: false });   // 戰爭迷霧：玩家關掉了自動掃描（記在命令裡）
  toast(`${GAME.sc.name}　開戰！${GAME.op ? `（${OP_LEVELS[GAME.op].name}難度）` : ''}（${keyLabel(keyOf('pause'))} 暫停、${keyLabel(keyOf('speed_up'))}／${keyLabel(keyOf('speed_down'))} 調速度、${keyLabel(keyOf('attack'))}＋左鍵點敵軍＝指定攻擊）`);
}
const _fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let _hudAcc = 0;
// 戰鬥 HUD 與技能列：結構只建一次，之後只更新文字（避免重畫吃掉點擊）
function buildBattleHud() {
  gEl('battlehud').innerHTML = `<div><div class="lbl" id="bh-t0"></div><div class="bar s0"><i id="bh-b0"></i></div></div>
    <div class="timer"><span id="bh-tm"></span><div class="lbl" style="text-align:center" id="bh-tl"></div></div>
    <div><div class="lbl" style="text-align:right" id="bh-t1"></div><div class="bar s1"><i id="bh-b1"></i></div></div>
    <button class="g-btn sm" id="bh-pause"></button><button class="g-btn sm" id="bh-speed"></button><button class="g-btn sm" id="bh-tac" title="Tab">戰術面板</button><button class="g-btn sm" id="bh-3d" title="M"></button><button class="g-btn sm" id="bh-br"></button><button class="g-btn sm" id="bh-set" title="設定">⚙</button>${GAME.sc && GAME.sc.sim && !GAME.replaying && !GAME.watch ? '<button class="g-btn sm" id="bh-ctl" title="模擬室：接管另一方（該方 AI 暫停）"></button><button class="g-btn sm" id="bh-edit" title="模擬室：暫停並調整配置與設定">✎ 編輯配置</button>' : ''}<button class="g-btn sm" id="bh-quit"></button>`;
  gEl('bh-set').onclick = () => openSettings();
  if (gEl('bh-ctl')) gEl('bh-ctl').onclick = simSwitch;
  if (gEl('bh-edit')) gEl('bh-edit').onclick = simEditMid;
  gEl('bh-tac').onclick = toggleTac;
  gEl('bh-br').onclick = toggleBridge;
  gEl('bh-3d').onclick = () => setRenderMode(mode3D ? '2d' : '3d');
  gEl('bh-pause').onclick = togglePause;
  gEl('bh-speed').onclick = () => setSpeed((speedIdx + 1) % SPEEDS.length);
  gEl('bh-quit').onclick = (e) => {
    if (GAME.replaying) { endReplay(); return; }
    if (NET.on) { mpQuitBattle(e.currentTarget); return; }   // 多人：投降（要按兩次）／離開觀戰
    quitBattle();
  };
  watchHud();   // 觀摩：雙方 AI 的解說面板
  const mine = GAME.watch || NET.spec ? [] : fleets.filter((f) => f.side === GAME.playerSide && f.commander);   // 觀摩：不能放技能
  gEl('skillbar').innerHTML = mine.map((f) => `<div class="sk-fleet"><div class="nm"><b>${f.name}</b>　${f.commander.name} Lv ${f.commander.level}</div>${Object.keys(f.skills).map((id) =>
    `<button class="g-btn sk-btn" data-f="${f.id}" data-s="${id}" title="${SKILLS[id].desc}">${SKILLS[id].name}<small></small><i class="cdv"></i></button>`).join('')}</div>`).join('');
  document.querySelectorAll('#skillbar .sk-btn').forEach((b) => (b.onclick = () => armSkill(fleets[+b.dataset.f], b.dataset.s)));
}
function gameFrame(dt) {
  if (GAME.phase !== 'battle' && GAME.phase !== 'replay') return;
  tacFrame(dt);
  _hudAcc += dt;
  if (GAME.result && !GAME.reportShown) {
    paused = true; updateTimeUI();
    GAME.reportShown = true;
    setTimeout(() => (GAME.replaying ? endReplay() : showReport()), 1100);
  }
  if (_hudAcc < 0.15) return;
  _hudAcc = 0;
  const t = U.uTime.value, tl = battleSetup.timeLimit;
  const a0 = sideAlive(0), a1 = sideAlive(1), p = a0 / Math.max(1, GAME.init[0]), e = a1 / Math.max(1, GAME.init[1]);
  if (!gEl('bh-tm')) buildBattleHud();
  const sim = GAME.sc && GAME.sc.sim, nm = (s) => (NET.on ? mpSideName(s) : sim ? simSideName(SIM.m, s) + (s === GAME.playerSide && !GAME.watch ? '（指揮中）' : '') : s === GAME.playerSide ? '我軍' : '敵軍');
  if (GAME.watch) watchFrame();
  gEl('bh-t0').textContent = `${nm(0)} ${Math.round(p * 100)}%　${ships5(a0)} 艘`; gEl('bh-b0').style.width = p * 100 + '%';
  const fogE = playerFogged() ? 1 - GAME.playerSide : -1;   // 雷達受干擾：敵方兵力不明（長條停在原處）
  if (fogE === 0) gEl('bh-t0').textContent = `${nm(0)} ？？？`;
  if (fogE === 1) gEl('bh-t1').textContent = `${nm(1)} ？？？（雷達受干擾）`; else { gEl('bh-t1').textContent = `${nm(1)} ${Math.round(e * 100)}%　${ships5(a1)} 艘`; gEl('bh-b1').style.width = e * 100 + '%'; }
  if (fowView()) {   // 戰爭迷霧：對方兵力只能估計（看得到的照實、最後已知照當時、沒看過的照開戰時）
    const os = 1 - GAME.playerSide, est = fowEstAlive(os), r = est / Math.max(1, GAME.init[os]);
    gEl('bh-t' + os).textContent = `${nm(os)} 估計 ${Math.round(r * 100)}%　≈${ships5(est)} 艘${jammed(GAME.playerSide) ? '（通訊受干擾）' : ''}`; gEl('bh-b' + os).style.width = r * 100 + '%';
  }
  gEl('bh-tm').textContent = tl >= SIM_INF ? _fmtT(t + SIM.t0) : _fmtT(Math.max(0, tl - t)); gEl('bh-tl').textContent = GAME.replaying ? '回放中' : tl >= SIM_INF ? '經過時間' : '剩餘時間';
  gEl('bh-pause').textContent = NET.on ? '不能暫停' : paused ? '▶ 繼續' : '❚❚ 暫停'; gEl('bh-speed').textContent = NET.on ? `×${NET.speed}${NET.lag ? ' 等待連線…' : ''}` : cmdSlowOn ? `×${effSpeed()} 下令中` : '×' + SPEEDS[speedIdx]; gEl('bh-speed').classList.toggle('slow', cmdSlowOn);
  if (!gEl('bh-quit').dataset.sure) gEl('bh-quit').textContent = GAME.replaying ? '結束回放' : NET.on ? (NET.spec ? '離開觀戰' : '投降') : GAME.watch ? '結束觀摩' : sim ? '結束模擬' : '撤退';
  if (gEl('bh-ctl')) gEl('bh-ctl').textContent = `切換指揮 → ${simSideName(SIM.m, 1 - GAME.playerSide)}`;
  gEl('bh-3d').textContent = mode3D ? '2D 畫面' : '3D 畫面';
  gEl('bh-br').textContent = BR.on ? '離開艦橋' : '艦橋視角'; gEl('bh-br').title = `指揮官視角（${keyLabel(keyOf('bridge'))}）`;
  gEl('bh-tac').textContent = BR.on ? (bridgeConsoleK() > 0.5 ? '抬頭' : '戰術台') : '戰術面板';
  if (GAME.phase !== 'battle') return;
  document.querySelectorAll('#skillbar .sk-btn').forEach((b) => {
    const f = fleets[+b.dataset.f], id = b.dataset.s, s = f.skills[id], def = SKILLS[id];
    const act = t < s.until, cd = Math.max(0, s.ready - t), arm = !!GAME.skillArm && GAME.skillArm.f === f && GAME.skillArm.id === id;
    b.querySelector('small').textContent = act ? `生效 ${Math.ceil(s.until - t)} 秒` : s.left <= 0 ? '已用完' : cd > 0 ? `冷卻 ${Math.ceil(cd)} 秒` : `剩 ${s.left} 次・鍵 ${keyLabel(keyOf('skill_' + id))}`;
    b.classList.toggle('active', act); b.classList.toggle('arm', arm);
    b.disabled = s.left <= 0 || cd > 0 || f.sqs.every((q) => q.alive <= 0);
    b.querySelector('.cdv').style.width = cd > 0 ? (1 - cd / def.cd) * 100 + '%' : '0';
  });
}

// ───── 戰後報告 ─────
function battleStats() {
  const init = [0, 1].map(() => new Array(NT).fill(0)), left = [0, 1].map(() => new Array(NT).fill(0));
  for (const f of fleets) {
    if (f.reserve) continue;   // 沒出場的增援不算
    for (const q of f.sqs) for (const i of q.list) { init[f.side][ships.type[i]]++; if (ships.alive[i]) left[f.side][ships.type[i]]++; }
  }
  return { init, left };
}
// 經驗：勝 60／平 35／敗 20，加上擊沉量（每 100 個敵方圖示 +5，最多 +60），艦隊存活過半再 +10
// 撤退：開戰不到 RETREAT_MIN_T 秒＝不給獎勵；之後撤退＝獎勵減半
function rewardMul(R) { return !R.retreat ? 1 : R.t < RETREAT_MIN_T ? 0 : 0.5; }
function awardXP(R, st) {
  const enemyLost = sumA(st.init[1]) - sumA(st.left[1]);
  const base = R.kind === 'win' ? 60 : R.kind === 'draw' ? 35 : 20, mul = rewardMul(R);
  const out = fleets.filter((f) => f.side === GAME.playerSide && f.commander).map((f) => {
    const alive = sumA(f.sqs.map((q) => q.alive)), surv = alive / f.initial;
    const xp = Math.round((base + Math.min(60, Math.round(enemyLost / 100 * 5)) + (surv > 0.5 ? 10 : 0)) * mul);
    const id = f.commander.id, before = cmdrLevel(id);
    CMDR_SAVE[id] = { ...(CMDR_SAVE[id] || {}), xp: cmdrXP(id) + xp };
    return { f, xp, surv, up: cmdrLevel(id) > before, lv: cmdrLevel(id) };
  });
  saveCmdrs(CMDR_SAVE);
  return out;
}
function showReport() {
  if (GAME.sc && GAME.sc.sim) { showSimReport(); return; }
  if (GAME.sc && GAME.sc.mp) { mpReport(); return; }   // 多人：依自己這一方的角度   // 模擬室：不給經驗、不上傳紀錄
  const R = GAME.result, sc = GAME.sc, st = battleStats();
  setPhase('report');
  if (!GAME.xp) { GAME.xp = awardXP(R, st); uploadRecord(R, st); campResult(R); GAME.merit = tavernAfterBattle(R, sc); if (sc.random) GAME.randLoadout = JSON.parse(JSON.stringify(GAME.loadout)); }
  const gains = GAME.xp;
  const row = (t) => `<tr><td>${SHIP_TYPES[t].name}</td><td>${ships5(st.init[0][t])}</td><td>${ships5(st.init[0][t] - st.left[0][t])}</td><td>${ships5(st.init[1][t])}</td><td>${ships5(st.init[1][t] - st.left[1][t])}</td></tr>`;
  const asp = (sd) => dmgStats[sd].map((v) => ships5(v)).join(' ／ ');
  const skillsUsed = fleets.filter((f) => f.side === GAME.playerSide).flatMap((f) => Object.entries(f.skills).filter(([, s]) => s.used).map(([id, s]) => `${f.commander.name}：${SKILLS[id].name} ×${s.used}`));
  const label = { win: '勝利', lose: '敗北', draw: '平手' }[R.kind];
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>戰後報告</h2><span class="crumb">${sc.name}　·　${OP_LEVELS[(battleSetup && battleSetup.op) || 0].name}難度　·　戰鬥時間 ${_fmtT(R.t)}</span></div>
    <div class="g-card" style="margin-bottom:12px;text-align:center"><p class="result ${R.kind}">${label}</p><div class="g-dim">${R.why}${R.retreat ? (rewardMul(R) ? '（撤退：經驗與功勳減半）' : `（開戰 ${RETREAT_MIN_T} 秒內撤退：不給經驗與功勳）`) : ''}</div>
      <div style="margin-top:6px">我軍剩 ${Math.round(R.ratio[0] * 100)}%　·　敵軍剩 ${Math.round(R.ratio[1] * 100)}%</div></div>
    <div class="intel-grid">
      <div class="g-card"><h3>兵力損失（艘）</h3><table class="stat-tbl"><tr><th>艦種</th><th>我軍出擊</th><th>我軍損失</th><th>敵軍出擊</th><th>敵軍損失</th></tr>
        ${SHIP_TYPES.map((_, t) => t).filter((t) => t < N_COMBAT || st.init[0][t] + st.init[1][t] > 0).map(row).join('')}
        <tr><td><b>合計</b></td><td>${ships5(sumA(st.init[0]))}</td><td>${ships5(sumA(st.init[0]) - sumA(st.left[0]))}</td><td>${ships5(sumA(st.init[1]))}</td><td>${ships5(sumA(st.init[1]) - sumA(st.left[1]))}</td></tr></table>
        <dl class="kv" style="margin-top:10px"><dt>被擊沉方向</dt><dd>我軍 正／側／背 ${asp(0)}<br>敵軍 正／側／背 ${asp(1)}</dd>
        <dt>使用技能</dt><dd>${skillsUsed.length ? skillsUsed.join('<br>') : '無'}</dd>
        ${battleRules && battleRules.ff ? `<dt>友軍誤射</dt><dd>我軍 ${fmtN(ffStats[GAME.playerSide][0])} 發（${fmtN(Math.round(ffStats[GAME.playerSide][1]))} 傷害）　敵軍 ${fmtN(ffStats[1 - GAME.playerSide][0])} 發</dd>${battleRules.ff === 2 ? `<dt>射界受阻停火</dt><dd>我軍 ${fmtN(ffHold[GAME.playerSide])} 次　敵軍 ${fmtN(ffHold[1 - GAME.playerSide])} 次</dd>` : ''}` : ''}</dl></div>
      <div class="g-card"><h3>指揮官經驗</h3>${gains.map((g) => `<div style="margin-bottom:10px"><b>${g.f.commander.name}</b>（${g.f.name}，存活 ${Math.round(g.surv * 100)}%）
        <span class="g-good">+${g.xp} 經驗</span>${g.up ? `　<b class="g-emp">升到 Lv ${g.lv}！</b>` : `　Lv ${g.lv}`}${cmdrPoints(g.f.commander.id) > 0 ? `　<span class="tal-pts">可分配天賦 ${cmdrPoints(g.f.commander.id)} 點</span>` : ''}
        <div class="xpbar"><i style="width:${(cmdrXP(g.f.commander.id) % XP_PER_LEVEL) / XP_PER_LEVEL * 100}%"></i></div></div>`).join('')}
        ${GAME.merit ? `<div style="margin:6px 0"><b class="g-emp">+${GAME.merit} 功勳</b>　<span class="g-dim">目前 ${fmtN(ROSTER.merit)}，可以到星際酒館招募指揮官（候選人已換新一批）</span></div>` : ''}
        <div class="g-dim" style="font-size:calc(12px * var(--ui))">這一版是「每場給預算」的模式：輸贏都不會損失艦隊，經驗會保留。</div></div>
    </div>
    <div class="g-row" style="margin-top:14px">${GAME.recView ? '<button class="g-btn" id="r-rec">← 戰鬥回放</button>' : `<button class="g-btn" id="r-menu">單人戰鬥</button><button class="g-btn" id="r-brief">${sc.campaign ? '無限戰場' : sc.random ? '隨機戰役設定' : '作戰列表'}</button><button class="g-btn" id="r-tal">指揮官天賦</button>`}<span class="g-sp"></span>
      <button class="g-btn" id="r-replay">觀看回放</button>${GAME.recView ? '' : sc.random ? '<button class="g-btn" id="r-retry">同一個戰場再戰</button><button class="g-btn pri" id="r-again">換一個戰場 →</button>'
        : `<button class="g-btn pri" id="r-again">${sc.campaign ? (GAME.campOutcome === 'win' ? `下一關：第 ${sc.stage + 1} 關 →` : R.retreat ? '重打這一關（同樣的敵人與地形）' : '重打這一關（敵人與地形重新生成）') : '再戰一次（回到編成）'}</button>`}</div>
  </div>`);
  if (GAME.recView) gEl('r-rec').onclick = () => { GAME.recView = false; showRecords(); };
  else {
    gEl('r-tal').onclick = () => showCommanders(() => showReport());
    gEl('r-menu').onclick = showSingle;
    gEl('r-brief').onclick = () => (sc.campaign ? showCampaign() : sc.random ? showRandom() : showBriefing(sc));
    gEl('r-again').onclick = () => (sc.campaign ? showCampBriefing() : sc.random ? randReroll() : showLoadout());
    if (gEl('r-retry')) gEl('r-retry').onclick = showLoadout;
  }
  gEl('r-replay').onclick = startReplay;
}
function startReplay(rec) {
  overlay(null);
  if (GAME.result) GAME.lastResult = GAME.result;   // 提早結束回放時，戰報用原本的結果
  GAME.replaying = true; GAME.result = null; GAME.reportShown = false; GAME.log = []; GAME.simCtl = null;   // 模擬室的接管紀錄會在回放裡重新執行
  gEl('battlehud').innerHTML = '';
  const LR = GAME.lastResult;   // 撤退結束的戰鬥：回放停在撤退那一刻
  GAME.replayEnd = rec && rec.replay ? rec.replay.end || null : LR && LR.retreat ? replayEndOf(LR) : null;
  // 比對用：紀錄的版本與結束指紋（剛打完的這場＝目前版本）
  GAME.replayRef = rec && rec.replay ? { ver: rec.replay.ver || '', hash: rec.replay.hash || null, retreat: !!rec.replay.end } : LR ? { ver: window.__BUILD || '', hash: LR.hash || null, retreat: !!LR.retreat } : null;
  const ref = GAME.replayRef;
  if (rec && ref && !ref.ver) toast('這是舊版的紀錄（沒有版本資訊）：規則改過的話，回放結果可能和當時不同', 'hint');
  else if (rec && ref && ref.ver !== (window.__BUILD || '')) toast(`這筆紀錄來自版本 ${ref.ver}（目前 ${window.__BUILD || '-'}）：結束時會比對結果是否一致`, 'hint');
  if (rec && rec.replay) replayBattle(rec.replay.log, rec.replay.rules, rec.replay.seed, rec.replay.setup);
  else replayBattle(cmdLog.slice(), battleRules, battleSeed, battleSetup);
  GAME.init = [sideAlive(0), sideAlive(1)];
  drawField(false);
  setPhase('replay');
  paused = false; updateTimeUI();
  toast('回放：同一個開局，照紀錄的命令重演（不能下令；左鍵拖曳＝移動畫面、右鍵拖曳＝調整視角）');
}
function endReplay() {
  GAME.replaying = false; paused = true; updateTimeUI();
  // 回放自然結束：比對結束那一刻的戰局指紋（中途結束回放、撤退的紀錄不比對）
  const ref = GAME.replayRef; GAME.replayRef = null;
  if (GAME.result && ref && ref.hash && !ref.retreat) {
    if (GAME.result.hash === ref.hash) toast('回放結果與原本的戰鬥完全一致', 'hint');
    else toast(`回放結果與原本的戰鬥不一致${ref.ver && ref.ver !== (window.__BUILD || '') ? `（紀錄來自版本 ${ref.ver}，之後規則有改過）` : ''}`, 'bad');
  }
  if (GAME.recView) { GAME.recView = false; GAME.result = GAME.lastResult; showMenu(); showRecords(); return; }   // 從戰鬥回放進來的：回到紀錄列表
  if (!GAME.result) GAME.result = GAME.lastResult;
  showReport();
}

// ═════ 伺服器：戰績紀錄、帳號 ═════
function escH(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function syncText() { const s = window.STORE && STORE.state ? STORE.state() : 'ok'; return { ok: '☁ 已同步', pending: '☁ 等待同步', saving: '☁ 同步中', error: '⚠ 未同步' }[s] || ''; }
addEventListener('savesync', () => { const e = document.getElementById('m-sync'); if (e) { e.textContent = syncText(); e.className = 'sync-' + STORE.state(); } });
function uploadRecord(R, st) {
  if (!window.API || GAME.replaying || !GAME.sc) return;
  const mine = fleets.filter((f) => f.side === GAME.playerSide);
  const summary = { sc: GAME.sc.id, scName: GAME.sc.name, op: GAME.op || 0, kind: R.kind, why: R.why, dur: Math.round(R.t), ratio: R.ratio, side: GAME.playerSide, ver: window.__BUILD || '',
    cmdrs: mine.map((f) => f.commander ? f.commander.name : f.name), init: [sumA(st.init[0]), sumA(st.init[1])], left: [sumA(st.left[0]), sumA(st.left[1])] };
  let replay;
  // ver：遊戲版本（build 號）；hash：結束時的戰局指紋（撤退的紀錄停在撤退那一刻，指紋不比對）
  try { replay = JSON.parse(JSON.stringify({ log: cmdLog, rules: battleRules, seed: battleSeed, setup: battleSetup, end: R.retreat ? replayEndOf(R) : undefined, ver: window.__BUILD || '', hash: R.retreat ? undefined : R.hash })); } catch (e) { console.warn('紀錄無法序列化', e); return; }
  API.post('api/records', { summary, replay }).then(() => toast('戰績已存到伺服器', 'hint'), (e) => toast('戰績上傳失敗：' + e.message));
}
async function showRecords() {
  overlay(`<div class="g-wrap"><div class="g-head"><h2>戰績紀錄</h2><span class="crumb">存在伺服器上，換電腦登入也看得到</span><span class="g-sp"></span><button class="g-btn" id="rc-back">返回</button></div><div class="g-card" id="rc-body"><p class="g-dim">讀取中…</p></div></div>`);
  gEl('rc-back').onclick = showMenu;
  let list;
  try { list = await API.get('api/records'); } catch (e) { gEl('rc-body').innerHTML = `<p class="g-warn">讀不到紀錄：${escH(e.message)}</p>`; return; }
  if (!gEl('rc-body')) return;
  if (!list.length) { gEl('rc-body').innerHTML = '<p class="g-dim">還沒有紀錄。打完一場作戰就會自動存進來。</p>'; return; }
  const lbl = { win: '勝利', lose: '敗北', draw: '平手' };
  gEl('rc-body').innerHTML = `<table class="stat-tbl rec-tbl"><tr><th>時間</th><th>作戰</th><th>結果</th><th>戰鬥時間</th><th>我軍／敵軍剩餘</th><th>指揮官</th><th></th></tr>
    ${list.map((r) => `<tr><td>${new Date(r.time).toLocaleString('zh-TW', { hour12: false })}</td><td>${escH(r.scName)}</td><td class="rec-${r.kind}">${lbl[r.kind] || escH(r.kind)}</td><td>${_fmtT(r.dur || 0)}</td>
      <td>${Math.round((r.ratio || [0])[0] * 100)}%／${Math.round((r.ratio || [0, 0])[1] * 100)}%</td><td>${escH((r.cmdrs || []).join('、'))}</td>
      <td class="rec-act">${r.ver === (window.__BUILD || '') ? '' : `<span class="g-dim" title="紀錄來自${r.ver ? '版本 ' + escH(r.ver) : '舊版本'}，回放結果可能和當時不同（結束時會比對）">舊版</span> `}<button class="g-btn sm" data-play="${r.id}">回放</button><button class="g-btn sm" data-del="${r.id}" title="刪除">✕</button></td></tr>`).join('')}</table>`;
  gEl('rc-body').querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => playRecord(b.dataset.play)));
  gEl('rc-body').querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定刪除？'; return; }
    try { await API.del('api/records/' + b.dataset.del); showRecords(); } catch (e) { toast('刪除失敗：' + e.message); }
  }));
}
async function playRecord(id) {
  let rec; try { rec = await API.get('api/records/' + id); } catch (e) { toast('讀不到這筆紀錄：' + e.message); return; }
  GAME.sc = SCENARIOS.find((s) => s.id === rec.summary.sc) || { id: rec.summary.sc, mp: rec.summary.sc === 'pvp', name: rec.summary.scName || '戰績紀錄', terrain: (rec.replay && rec.replay.setup && rec.replay.setup.terrain) || [] };
  GAME.playerSide = rec.summary.side || 0;
  GAME.xp = [];   // 回放不再給經驗、也不再存一筆
  GAME.merit = 0; GAME.recView = true;
  startReplay(rec);
}
function showAccount() {
  overlay(`<div class="g-wrap" style="max-width:640px"><div class="g-head"><h2>帳號</h2><span class="crumb">${escH(API.name())}</span><span class="g-sp"></span><button class="g-btn" id="ac-back">返回</button></div>
    <div class="g-card" style="margin-bottom:12px"><h3>變更密碼</h3>
      <div class="g-row"><input class="g-in" type="password" id="ac-old" placeholder="舊密碼（沒有就留空）"><input class="g-in" type="password" id="ac-new" placeholder="新密碼（留空＝不用密碼）"><button class="g-btn sm" id="ac-pw">變更</button></div><p class="g-dim" id="ac-msg"></p></div>
    <div class="g-card"><h3>存檔備份</h3><p class="g-dim">伺服器會自動備份你的存檔（設定、天賦、武器配置等）。還原會先把目前的存檔再備份一份。</p><div id="ac-bk">讀取中…</div></div></div>`);
  gEl('ac-back').onclick = showMenu;
  gEl('ac-pw').onclick = async () => {
    try { await API.post('api/password', { old: gEl('ac-old').value, password: gEl('ac-new').value }); gEl('ac-msg').textContent = '密碼已變更'; } catch (e) { gEl('ac-msg').textContent = e.message; }
  };
  API.get('api/backups').then((list) => {
    const el = gEl('ac-bk'); if (!el) return;
    el.innerHTML = list.length ? `<div class="bk-list">${list.slice(0, 40).map((b) => `<div class="g-row"><span>${new Date(b.time).toLocaleString('zh-TW', { hour12: false })}</span><span class="g-dim">${b.name.includes('conflict') ? '（兩台電腦同時存檔時留下的）' : b.name.includes('before-restore') ? '（還原前）' : ''}</span><span class="g-sp"></span><button class="g-btn sm" data-bk="${escH(b.name)}">還原</button></div>`).join('')}</div>` : '<p class="g-dim">目前還沒有備份（存檔每 10 分鐘最多備份一次）。</p>';
    el.querySelectorAll('[data-bk]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定還原？（會重新載入）'; return; }
      try { await STORE.sync(); await API.post('api/backups/restore', { name: b.dataset.bk }); STORE.freeze(); location.reload(); } catch (e) { toast('還原失敗：' + e.message); }
    }));
  }, (e) => { const el = gEl('ac-bk'); if (el) el.textContent = '讀不到備份：' + e.message; });
}

// ═══════════════════════ 無限戰場（原「戰役進度」）：無限關卡，敵軍依出擊指揮官平均等級 ±3 隨機生成，地形隨機 ═══════════════════════
const CAMP_STORE = 'fleet.campaign';
const CAMP_NAMES = ['巴爾克', '霍斯特', '佩蕾', '格倫', '奧德', '薇拉', '卡蘭', '索恩', '伊格', '莫蘭', '黛菈', '雷文', '賽隆', '芙蕾', '戈爾', '尤里'];
const CAMP_FLEET_NAMES = ['敵前鋒艦隊', '敵主力艦隊', '敵機動艦隊', '敵守備艦隊', '敵遊擊艦隊'];
// 艦隊類型：mix＝各艦種艘數比例（航母、戰列、巡洋、驅逐、護衛）；formations／tactics 從中隨機挑
const CAMP_ARCHETYPES = [
  { key: 'balanced', name: '均衡', mix: [0.04, 0.16, 0.28, 0.28, 0.24], formations: ['line', 'spindle', 'crescent'], tactics: ['push', 'push', 'breakthrough'] },
  { key: 'heavy', name: '重砲', mix: [0.02, 0.32, 0.34, 0.14, 0.18], formations: ['line', 'crescent'], tactics: ['push', 'kite'] },
  { key: 'carrier', name: '航母群', mix: [0.14, 0.12, 0.24, 0.2, 0.3], formations: ['ring', 'line'], tactics: ['kite', 'push'] },
  { key: 'raider', name: '突擊', mix: [0, 0.04, 0.16, 0.48, 0.32], formations: ['wedge', 'column', 'spindle'], tactics: ['flank', 'flank', 'breakthrough'] },
  { key: 'missile', name: '飛彈', mix: [0.02, 0.1, 0.46, 0.3, 0.12], formations: ['crescent', 'line'], tactics: ['kite', 'kite', 'push'] },
];
const CAMP_SKILLS = ['focus', 'wall', 'charge', 'rapid', 'evade', 'jam'];

function campLoad() {
  let c = null; try { c = JSON.parse(STORE.getItem(CAMP_STORE) || 'null'); } catch (e) { c = null; }
  if (!c || !c.seed) c = { seed: (Math.random() * 1e9) >>> 0, stage: 1, attempt: 0, best: 1, wins: 0, losses: 0, history: [] };
  return c;
}
function campSave(c) { try { STORE.setItem(CAMP_STORE, JSON.stringify(c)); } catch (e) { /* 只在本次有效 */ } }
const campHash = (...a) => a.reduce((h, v) => (Math.imul(h ^ (v >>> 0), 2654435761) + 0x9e3779b9) >>> 0, 2166136261);

// 關卡本身（地形、預算、時間）：由戰役種子＋關數＋第幾次挑戰決定；敵軍要等選好指揮官才生成
function campStage(c) {
  const st = c.stage, R = mulberry32(campHash(c.seed, st, c.attempt));
  const budget = Math.min(6000, 2400 + 220 * (st - 1));
  const sc = {
    id: 'camp', campaign: true, stage: st, name: `無限戰場 第 ${st} 關`, size: budget < 3400 ? '小型' : budget < 4800 ? '中型' : '大型',
    timeLimit: 300 + Math.min(240, st * 15), budget, maxFleets: st < 3 ? 2 : 3, level: Math.min(3, 1 + Math.floor(st / 4)),
    seed: campHash(c.seed, st, c.attempt, 7) % 100000, terrain: campTerrain(R, st), enemy: [], events: [], intel: { accuracy: 0.8, hide: [] },
  };
  sc.story = `隨機宙域。${sc.terrain.length ? '地形：' + [...new Set(sc.terrain.map((t) => TERRAIN_TYPES[t.type].name))].join('、') + '。' : '開闊宙域，沒有地形。'}敵軍會依你出擊的指揮官平均等級（±3）生成。`;
  return sc;
}
// 隨機地形：星雲、小行星帶放在中間區域；巨大小行星（實體）避開雙方部署區
function campTerrain(R, st) {
  const out = [], n = Math.min(6, 1 + Math.floor(R() * 3) + Math.floor(st / 5));
  const rr = (a, b) => a + R() * (b - a);
  const okRock = (x, z, r) => !(z + r > DEPLOY_ZONE.z0 - 30 || z - r < ENEMY_ZONE.z1 + 30 && z + r > ENEMY_ZONE.z0 - 30) && out.every((t) => t.type !== 'rock' || Math.hypot(t.x - x, t.z - z) > t.r + r + 60);
  for (let k = 0; k < n; k++) {
    const p = R();
    if (p < 0.3) out.push({ type: 'nebula', x: Math.round(rr(-520, 520)), y: Math.round(rr(-90, 90)), z: Math.round(rr(-420, 380)), r: Math.round(rr(140, 260)) });
    else if (p < 0.55) out.push({ type: 'asteroid', x: Math.round(rr(-560, 560)), y: Math.round(rr(-90, 90)), z: Math.round(rr(-400, 370)), r: Math.round(rr(110, 200)) });
    else {
      for (let tries = 0; tries < 12; tries++) {
        const r = Math.round(rr(40, 90)), x = Math.round(rr(-600, 600)), z = Math.round(rr(-450, 420));
        if (okRock(x, z, r)) { out.push({ type: 'rock', x, y: Math.round(rr(-120, 120)), z, r }); break; }
      }
    }
  }
  return out;
}
function campAvgLevel(lo) { const ls = lo.fleets.filter((f) => f.cmdr).map((f) => cmdrLevel(f.cmdr)); return Math.max(1, Math.round(ls.reduce((a, b) => a + b, 0) / Math.max(1, ls.length))); }
// 敵軍：等級 L＝平均等級 ±3；L 決定指揮官等級、技能數、AI 等級、艦隊數與兵力
function campEnemy(sc, lo) {
  const avg = campAvgLevel(lo), R = mulberry32(campHash(sc.seed, avg, 31));
  const L = Math.max(1, avg + (sc.levelOff != null ? sc.levelOff : Math.floor(R() * 7) - 3)), diff = L - avg;
  const pick = (a) => a[Math.floor(R() * a.length)];
  const nF = Math.max(1, Math.min(3, 1 + (L >= 3 ? 1 : 0) + (L >= 6 ? 1 : 0) + (R() < 0.2 ? 1 : 0) - (sc.stage <= 1 ? 1 : 0)));
  const total = sc.budget * (0.9 + 0.05 * diff) * Math.min(1.15, 1 + 0.006 * sc.stage);
  const aiLv = Math.min(5, 1 + Math.floor(L / 3));   // Lv 9 起難度 4、Lv 12 起難度 5
  const names = CAMP_NAMES.slice(); const fnames = CAMP_FLEET_NAMES.slice();
  sc.enemy = [];
  for (let k = 0; k < nF; k++) {
    const A = pick(CAMP_ARCHETYPES), share = total / nF * (0.8 + R() * 0.4);
    const per = A.mix.reduce((s, m, t) => s + m * SHIP_TYPES[t].cost, 0), n = share / per;
    const comp = A.mix.map((m) => Math.round(n * m / 10) * 10);
    const nSk = Math.min(3, 1 + Math.floor(L / 4)), skills = [];
    while (skills.length < nSk) { const s = pick(L >= 5 ? CAMP_SKILLS : CAMP_SKILLS.slice(0, 3)); if (!skills.includes(s)) skills.push(s); }
    const cn = names.splice(Math.floor(R() * names.length), 1)[0], fn = fnames.splice(Math.floor(R() * fnames.length), 1)[0];
    const x = nF === 1 ? Math.round((R() - 0.5) * 200) : Math.round(-380 + 760 * k / (nF - 1) + (R() - 0.5) * 120);
    sc.enemy.push({ name: fn, commander: { name: cn, trait: pick(['dmg', 'shield', 'speed']), level: L, skills },
      comp, formation: pick(A.formations), tactic: pick(A.tactics), x, y: L >= 3 ? Math.round((R() - 0.5) * 240) : 0, z: Math.round(-320 - ZONE_SHIFT - R() * 100), h: 0, archetype: A.name });
  }
  // 等級 4 以上：可能有增援
  sc.events = L >= 4 && R() < Math.min(0.7, 0.2 + 0.06 * L) ? [{ type: 'reinforce', chance: 1, at: [60, 140], name: '敵增援艦隊', comp: defaultComp(total * 0.25), formation: pick(['line', 'crescent', 'wedge']), edge: R() < 0.5 ? 'left' : 'right' }] : [];
  // 等級 6 以上：帶補給艦隊（約兵力的 10%，跟在第一艦隊後方）；AI 飛彈打完會回去補
  sc.enemySupply = L >= 6 ? { comp: SHIP_TYPES.map((_, t) => (t === 4 ? Math.max(10, Math.round(total * 0.04 / 10) * 10) : t === SUPPLY_T ? Math.max(10, Math.round(total * 0.06 / SHIP_TYPES[SUPPLY_T].cost / 10) * 10) : 0)),
    formation: 'ring', x: sc.enemy[0].x, z: sc.enemy[0].z - 230, h: 0 } : null;
  sc.level = aiLv; sc.enemyLevel = L; sc.avgLevel = avg;
  return sc;
}
// 戰役畫面
function showCampaign() {
  const c = campLoad();
  setPhase('briefing');
  const hist = (c.history || []).slice(-8).reverse();
  overlay(`<div class="g-wrap" style="max-width:820px">
    <div class="g-head"><h2>無限戰場</h2><span class="crumb">無限關卡・每關重新編成・敵軍依你的指揮官等級生成</span><span class="g-sp"></span><button class="g-btn" id="cp-back">← 單人戰鬥</button></div>
    <div class="g-card" style="margin-bottom:12px"><div class="cp-top">
      <div><span class="g-dim">目前</span><b class="cp-stage">第 ${c.stage} 關</b>${c.attempt ? `<span class="g-dim">（第 ${c.attempt + 1} 次挑戰）</span>` : ''}</div>
      <div><span class="g-dim">最高紀錄</span><b>第 ${c.best} 關</b></div><div><span class="g-dim">勝／敗／平</span><b>${c.wins}／${c.losses}／${c.draws || 0}</b></div></div>
      <dl class="kv" style="margin-top:10px"><dt>規則</dt><dd>每一關的敵人依「出擊指揮官的平均等級 ±3」隨機生成：等級越高，敵方指揮官越強、技能越多、AI 越會打、艦隊越多，兵力也依等級差增減。地形每關隨機。</dd>
      <dt>過關</dt><dd>打贏進下一關（預算、時間限制、艦隊數上限逐關增加）；打輸或平手重打這一關，敵人與地形會重新生成。指揮官經驗照常累積。</dd></dl>
      <div class="g-row" style="margin-top:12px"><button class="g-btn sm" id="cp-reset">從第 1 關重新開始</button><span class="g-sp"></span><button class="g-btn pri" id="cp-go">出擊：第 ${c.stage} 關 →</button></div></div>
    ${hist.length ? `<div class="g-card"><h3>最近的關卡</h3><table class="stat-tbl"><tr><th>關卡</th><th>結果</th><th>敵軍等級</th><th>我方平均等級</th><th>剩餘（我／敵）</th></tr>
      ${hist.map((h) => `<tr><td>第 ${h.stage} 關</td><td class="rec-${h.kind}">${{ win: '勝利', lose: '敗北', draw: '平手' }[h.kind]}</td><td>Lv ${h.el}</td><td>Lv ${h.al}</td><td>${Math.round(h.r[0] * 100)}%／${Math.round(h.r[1] * 100)}%</td></tr>`).join('')}</table></div>` : ''}
  </div>`);
  gEl('cp-back').onclick = showSingle;
  gEl('cp-go').onclick = () => showCampBriefing();
  gEl('cp-reset').onclick = (e) => {
    const b = e.target; if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定重來？（最高紀錄保留）'; return; }
    const n = campLoad(); n.stage = 1; n.attempt = 0; n.seed = (Math.random() * 1e9) >>> 0; campSave(n); showCampaign();
  };
}
// 關卡簡報：地形、預算；選好指揮官後敵軍才會生成，所以這裡只顯示推估等級範圍
function showCampBriefing() {
  const c = campLoad(), sc = campStage(c);
  GAME.sc = sc; GAME.intel = { fleets: [], events: [], acc: 1 };
  // 沿用上一關的編成（指揮官、陣型、機庫），兵力依新預算等比例縮放
  const prev = GAME.campLoadout || c.loadout;
  if (prev && prev.fleets.length) {
    const used = sumA(prev.fleets.map((f) => compCost(f.comp))) || 1, k = sc.budget / used;
    GAME.loadout = { sc: 'camp', faction: prev.faction || 0, fleets: prev.fleets.slice(0, sc.maxFleets).map((f) => ({ ...f, comp: f.comp.map((n) => Math.floor(n * k / 10) * 10), hangar: (f.hangar || HANGAR_DEFAULT).slice() })),
      supplies: supplyList(prev).map((S) => ({ ...S, comp: S.comp.map((n) => Math.floor(n * k / 10) * 10) })) };
  } else { GAME.loadout = defaultLoadout(sc); GAME.loadout.sc = 'camp'; }
  setPhase('briefing');
  const avg = campAvgLevel(GAME.loadout);
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>${sc.name}</h2><span class="crumb">無限戰場　·　${sc.size}　·　${Math.round(sc.timeLimit / 60)} 分鐘</span><span class="g-sp"></span><button class="g-btn" id="cb-back">← 無限戰場</button></div>
    <div class="intel-grid">
      <div class="g-card"><h3>狀況</h3><div>${sc.story}</div>
        <dl class="kv"><dt>勝利條件</dt><dd>殲滅敵軍，或使敵軍損失超過 75%（潰走）</dd><dt>敗北條件</dt><dd>我軍損失超過 75%</dd>
        <dt>編成預算</dt><dd>${fmtN(sc.budget)} 點　最多 ${sc.maxFleets} 支艦隊</dd>
        <dt>敵軍等級</dt><dd>出擊指揮官平均等級 ±3（目前編成的平均是 Lv ${avg}，敵軍會在 Lv ${Math.max(1, avg - 3)}～${avg + 3}）</dd>
        <dt>敵軍編成</dt><dd><span class="unk">不明：部署時才會偵測到</span></dd></dl></div>
      <div class="g-card"><h3>戰場環境</h3>${minimapSVG(sc, GAME.intel, GAME.loadout)}
        <div style="margin-top:8px;font-size:calc(12.5px * var(--ui))">${sc.terrain.length ? [...new Set(sc.terrain.map((t) => t.type))].map((k) => `<div><b>${TERRAIN_TYPES[k].name}</b>：<span class="g-dim">${TERRAIN_TYPES[k].desc}</span></div>`).join('') : '<span class="g-dim">開闊宙域，沒有地形影響。</span>'}</div></div>
    </div>
    <div class="g-row" style="margin-top:12px"><span class="g-sp"></span><button class="g-btn pri" id="cb-next">進入編成 →</button></div></div>`);
  gEl('cb-back').onclick = showCampaign;
  gEl('cb-next').onclick = showLoadout;
}
// 打完一關：更新進度（只在第一次產生戰報時呼叫）
function campResult(R) {
  const sc = GAME.sc; if (!sc || !sc.campaign) return;
  const c = campLoad();
  if (sc.stage !== c.stage) return;   // 舊的關卡（例如回放）不算
  (c.history || (c.history = [])).push({ stage: c.stage, kind: R.kind, el: sc.enemyLevel, al: sc.avgLevel, r: R.ratio, t: Date.now() });
  if (c.history.length > 50) c.history.shift();
  if (R.kind === 'win') { c.stage++; c.attempt = 0; c.wins++; c.best = Math.max(c.best, c.stage); }
  else { if (!R.retreat) c.attempt++; if (R.kind === 'draw') c.draws = (c.draws || 0) + 1; else c.losses++; }   // 撤退不重新生成敵軍與地形（不能用撤退重抽）
  GAME.campLoadout = JSON.parse(JSON.stringify(GAME.loadout));
  c.loadout = GAME.campLoadout;   // 存進進度：重新整理頁面後下一關一樣沿用
  campSave(c);
  GAME.campOutcome = R.kind;
}

// ═══════════════════════ 隨機戰役：單場作戰，自選規模／敵軍強度／地形，敵軍與地形每次重新生成 ═══════════════════════
// 不影響無限戰場進度；敵軍一樣依出擊指揮官的平均等級生成（campEnemy），只是等級差由玩家決定
const RAND_STORE = 'fleet.random';
const RAND_SIZES = [
  { name: '小型', budget: 2400, maxFleets: 2, time: 300, stage: 3 },
  { name: '中型', budget: 3600, maxFleets: 3, time: 420, stage: 6 },
  { name: '大型', budget: 5000, maxFleets: 3, time: 540, stage: 10 },
];
const RAND_DIFF = [{ name: '較弱', off: -2 }, { name: '相當', off: 0 }, { name: '較強', off: 2 }, { name: '隨機', off: null }];
const RAND_TERR = [{ name: '無', st: -1 }, { name: '少', st: 0 }, { name: '多', st: 14 }, { name: '隨機', st: null }];
const randSeed = () => ((Math.random() * 1e9) >>> 0) || 1;
function randOpts() {
  let o = null; try { o = JSON.parse(STORE.getItem(RAND_STORE) || 'null'); } catch (e) { o = null; }
  o = Object.assign({ size: 1, diff: 1, terr: 3, seed: 0 }, o || {});
  if (!RAND_SIZES[o.size]) o.size = 1; if (!RAND_DIFF[o.diff]) o.diff = 1; if (!RAND_TERR[o.terr]) o.terr = 3;
  if (!o.seed) o.seed = randSeed();
  return o;
}
function randSave(o) { try { STORE.setItem(RAND_STORE, JSON.stringify(o)); } catch (e) { /* 只在本次有效 */ } }
function randStage(o) {
  const S = RAND_SIZES[o.size], R = mulberry32(campHash(o.seed, o.size, o.terr, 3));
  let st = RAND_TERR[o.terr].st; if (st == null) st = R() < 0.15 ? -1 : Math.floor(R() * 15);
  const sc = {
    id: 'rand', random: true, sizeIdx: o.size, stage: S.stage, levelOff: RAND_DIFF[o.diff].off, name: `隨機戰役・${S.name}`, size: S.name,
    timeLimit: S.time, budget: S.budget, maxFleets: S.maxFleets, level: 1, seed: campHash(o.seed, o.size, o.diff, o.terr, 9) % 100000,
    terrain: st < 0 ? [] : campTerrain(R, st), enemy: [], events: [], intel: { accuracy: 0.8, hide: [] },
  };
  return sc;
}
// 編成沿用上一場（指揮官、陣型、機庫）；預算不同時兵力等比例縮放
function randLoadout(sc) {
  const cur = GAME.loadout;
  if (cur && cur.sc === 'rand' && cur.budget === sc.budget) return cur;
  const prev = cur && cur.sc === 'rand' ? cur : GAME.randLoadout;
  let lo;
  if (prev && prev.fleets && prev.fleets.length) {
    const used = sumA(prev.fleets.map((f) => compCost(f.comp))) || 1, k = prev.budget === sc.budget ? 1 : sc.budget / used;
    lo = { sc: 'rand', faction: prev.faction || 0, fleets: prev.fleets.slice(0, sc.maxFleets).map((f) => ({ ...f, comp: f.comp.map((n) => (k === 1 ? n : Math.floor(n * k / 10) * 10)), hangar: (f.hangar || HANGAR_DEFAULT).slice() })),
      supplies: supplyList(prev).map((S) => ({ ...S, comp: S.comp.map((n) => (k === 1 ? n : Math.floor(n * k / 10) * 10)) })) };
  } else { lo = defaultLoadout(sc); lo.sc = 'rand'; }
  lo.budget = sc.budget;
  return lo;
}
function randReroll() { const o = randOpts(); o.seed = randSeed(); randSave(o); showRandom(); }
function showRandom() {
  const o = randOpts(), sc = randStage(o), S = RAND_SIZES[o.size], D = RAND_DIFF[o.diff];
  GAME.sc = sc; GAME.intel = { fleets: [], events: [], acc: 1 };
  GAME.loadout = randLoadout(sc);
  setPhase('briefing');
  const avg = campAvgLevel(GAME.loadout);
  const seg = (key, arr) => `<div class="wed-seg rd-seg" data-opt="${key}">${arr.map((a, k) => `<button data-v="${k}" class="${o[key] === k ? 'on' : ''}">${a.name}</button>`).join('')}</div>`;
  const terr = sc.terrain.length ? [...new Set(sc.terrain.map((t) => t.type))].map((k) => `<div><b>${TERRAIN_TYPES[k].name}</b>：<span class="g-dim">${TERRAIN_TYPES[k].desc}</span></div>`).join('') : '<span class="g-dim">開闊宙域，沒有地形影響。</span>';
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>隨機戰役</h2><span class="crumb">單場作戰・敵軍與地形隨機生成・不影響無限戰場進度</span><span class="g-sp"></span><button class="g-btn" id="rd-back">← 單人戰鬥</button></div>
    <div class="intel-grid">
      <div class="g-card"><h3>戰場設定</h3>
        <dl class="kv rd-opts"><dt>規模</dt><dd>${seg('size', RAND_SIZES)}<div class="g-dim">預算 ${fmtN(S.budget)} 點・最多 ${S.maxFleets} 支艦隊・${Math.round(S.time / 60)} 分鐘</div></dd>
        <dt>敵軍強度</dt><dd>${seg('diff', RAND_DIFF)}<div class="g-dim">依出擊指揮官的平均等級（目前 Lv ${avg}）：敵軍 ${D.off == null ? `Lv ${Math.max(1, avg - 3)}～${avg + 3} 隨機` : `Lv ${Math.max(1, avg + D.off)}`}。等級越高，敵方技能越多、AI 越會打、兵力越多</div></dd>
        <dt>地形</dt><dd>${seg('terr', RAND_TERR)}<div class="g-dim">星雲、小行星帶、巨大小行星隨機放在戰場中段</div></dd>
        <dt>勝利條件</dt><dd>殲滅敵軍，或使敵軍損失超過 75%（潰走）</dd><dt>敗北條件</dt><dd>我軍損失超過 75%</dd>
        <dt>敵軍編成</dt><dd><span class="unk">不明：部署時才會偵測到</span></dd>
        <dt>獎勵</dt><dd>指揮官經驗、功勳（規模越大、敵軍等級越高越多）</dd></dl></div>
      <div class="g-card"><h3>戰場環境</h3>${minimapSVG(sc, GAME.intel, GAME.loadout)}<div style="margin-top:8px;font-size:calc(12.5px * var(--ui))">${terr}</div></div>
    </div>
    <div class="g-row" style="margin-top:12px"><button class="g-btn" id="rd-roll">⟳ 換一個戰場</button><span class="g-dim" style="font-size:calc(12px * var(--ui))">同樣的設定重新生成地形與敵軍</span><span class="g-sp"></span><button class="g-btn pri" id="rd-next">進入編成 →</button></div></div>`);
  gEl('rd-back').onclick = showSingle;
  gEl('rd-roll').onclick = randReroll;
  gEl('rd-next').onclick = showLoadout;
  document.querySelectorAll('.rd-seg').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => { o[g.dataset.opt] = +b.dataset.v; randSave(o); showRandom(); })));
}

// ═══════════════════════ 星際酒館：用「功勳」招募兩個陣營的指揮官 ═══════════════════════
// 存檔 fleet.roster：merit 功勳、hired 招募來的指揮官（完整資料）、fired 解雇的初始指揮官、pool 目前的候選人、reinf 增援次數
const ROSTER_STORE = 'fleet.roster';
const ROSTER_MAX = 16;
const TAVERN_PER_FACTION = 3;
const TAVERN_REFRESH_COST = 30;
const RARITY = [
  { key: 'common', name: '普通', p: 0.65, lv: [1, 2], skills: 1, cost: 0 },
  { key: 'elite', name: '精英', p: 0.28, lv: [2, 4], skills: 2, cost: 60 },
  { key: 'ace', name: '名將', p: 0.07, lv: [4, 6], skills: 2, cost: 180 },
];
const NAME_POOL = [
  { given: ['奧斯卡', '卡爾', '奧古斯特', '路德', '艾米爾', '海因', '歐根', '法蘭茲', '馬克斯', '希爾德', '伊莉莎', '葛蕾特', '席格', '露易絲'],
    family: ['馮・霍爾', '施坦納', '克萊斯', '巴赫曼', '諾伊曼', '韋伯', '哈特曼', '布勞恩', '莫勒', '福克斯', '雷曼', '齊默', '馮・艾克', '羅森'] },
  { given: ['布萊恩', '卡特', '丹尼', '艾倫', '法蘭克', '海倫', '伊凡', '茱莉', '凱文', '莉莉', '諾拉', '馬修', '蕾貝卡', '湯姆'],
    family: ['布朗', '米勒', '克拉克', '霍爾', '莫里斯', '華勒斯', '格林', '柯林斯', '派克', '肯特', '奧尼爾', '席爾瓦', '雷諾', '韓森'] },
];
const TRAIT_BIO = { dmg: '攻勢型，偏好以火力壓制敵軍。', shield: '守勢型，擅長穩住戰線、打消耗戰。', speed: '機動型，擅長繞側與追擊。' };
const titleOf = (lv) => (lv >= 8 ? '上將' : lv >= 5 ? '中將' : lv >= 3 ? '少將' : '准將');

function rosterLoad() {
  let r = null; try { r = JSON.parse(STORE.getItem(ROSTER_STORE) || 'null'); } catch (e) { r = null; }
  if (!r) r = { merit: 300, hired: [], fired: [], pool: [], battles: 0 };
  r.hired = r.hired || []; r.fired = r.fired || []; r.pool = r.pool || [];
  return r;
}
function rosterSave() { try { STORE.setItem(ROSTER_STORE, JSON.stringify(ROSTER)); } catch (e) { /* 只在本次有效 */ } }
let ROSTER = rosterLoad();
const COMMANDERS_BASE = COMMANDERS.filter((c) => c.base);   // 初始指揮官（多人戰鬥只能派這幾位）
// 把招募來的指揮官放進 COMMANDERS、拿掉解雇的初始指揮官
function rosterApply() {
  for (let k = COMMANDERS.length - 1; k >= 0; k--) if (!COMMANDERS[k].base || ROSTER.fired.includes(COMMANDERS[k].id)) COMMANDERS.splice(k, 1);
  for (const c of ROSTER.hired) COMMANDERS.push(c);
}
rosterApply();
function cmdrsOf(faction) { return COMMANDERS.filter((c) => (c.faction || 0) === faction); }

// 候選人
function genCandidate(faction, R) {
  let q = R(), rar = RARITY[0]; for (const r of RARITY) { if (q < r.p) { rar = r; break; } q -= r.p; }
  const lv = rar.lv[0] + Math.floor(R() * (rar.lv[1] - rar.lv[0] + 1));
  const N = NAME_POOL[faction], trait = ['dmg', 'shield', 'speed'][Math.floor(R() * 3)];
  const skills = []; while (skills.length < rar.skills) { const s = CAMP_SKILLS[Math.floor(R() * CAMP_SKILLS.length)]; if (!skills.includes(s)) skills.push(s); }
  return { id: 'h' + Math.floor(R() * 1e9).toString(36) + Date.now().toString(36).slice(-3), name: N.given[Math.floor(R() * N.given.length)] + '・' + N.family[Math.floor(R() * N.family.length)],
    title: titleOf(lv), trait, skills, faction, level: lv, rarity: rar.key, cost: 60 + 50 * (lv - 1) + rar.cost, bio: TRAIT_BIO[trait] };
}
function tavernRefresh() {
  const R = mulberry32((Math.random() * 1e9) >>> 0);
  ROSTER.pool = [];
  for (const f of [0, 1]) for (let k = 0; k < TAVERN_PER_FACTION; k++) ROSTER.pool.push(genCandidate(f, R));
  rosterSave();
}
if (!ROSTER.pool.length) tavernRefresh();
// 戰後：給功勳、換一批候選人；回傳這次得到的功勳
function meritFor(R, sc) {
  const base = sc && sc.campaign ? 40 + 15 * sc.stage : sc && sc.random ? 50 + 30 * sc.sizeIdx + 15 * Math.max(0, (sc.enemyLevel || 0) - (sc.avgLevel || 0)) : 40 + 40 * ((sc && sc.level) || 1);
  return Math.round(base * (R.kind === 'win' ? 2.5 : R.kind === 'draw' ? 1.5 : 1));
}
function tavernAfterBattle(R, sc) {
  const mul = rewardMul(R);
  if (!mul) return 0;   // 開戰就撤退：不給功勳、也不換候選人
  const m = Math.round(meritFor(R, sc) * mul);
  ROSTER.merit += m; ROSTER.battles++;
  tavernRefresh();   // 內含存檔
  return m;
}
function recruit(id) {
  const c = ROSTER.pool.find((o) => o.id === id); if (!c) return '候選人已經不在了';
  if (COMMANDERS.length >= ROSTER_MAX) return `指揮官最多 ${ROSTER_MAX} 位，先解雇幾位`;
  if (ROSTER.merit < c.cost) return '功勳不夠';
  ROSTER.merit -= c.cost;
  ROSTER.pool = ROSTER.pool.filter((o) => o.id !== id);
  const def = { id: c.id, name: c.name, title: c.title, trait: c.trait, skills: c.skills.slice(), faction: c.faction, rarity: c.rarity, bio: c.bio };
  ROSTER.hired.push(def); COMMANDERS.push(def);
  CMDR_SAVE[c.id] = { xp: XP_PER_LEVEL * (c.level - 1), tal: {} }; saveCmdrs(CMDR_SAVE);
  rosterSave();
  return '';
}
function dismiss(id) {
  const c = COMMANDERS.find((o) => o.id === id); if (!c) return '';
  if (cmdrsOf(c.faction || 0).length <= 1) return '每個陣營至少要留一位指揮官';
  if (c.base) ROSTER.fired.push(id); else ROSTER.hired = ROSTER.hired.filter((o) => o.id !== id);
  const k = COMMANDERS.indexOf(c); if (k >= 0) COMMANDERS.splice(k, 1);
  rosterSave();
  return '';
}

function showTavern(msg) {
  setPhase('briefing');
  const card = (c) => {
    const rar = RARITY.find((r) => r.key === c.rarity) || RARITY[0], can = ROSTER.merit >= c.cost && COMMANDERS.length < ROSTER_MAX;
    return `<div class="tv-c tv-${c.rarity}"><div class="tv-h"><b>${c.title} ${c.name}</b><span class="tv-r">${rar.name}</span></div>
      <div class="tv-m"><span>Lv ${c.level}</span><span>${TRAIT_NAME[c.trait]}型</span></div>
      <div class="tv-s">${c.skills.map((s) => `<span class="tal-sk" title="${SKILLS[s].desc}">${SKILLS[s].name}</span>`).join('')}</div>
      <div class="g-dim tv-b">${c.bio}</div>
      <div class="tv-f"><span class="tv-cost">${c.cost} 功勳</span><button class="g-btn sm ${can ? 'pri' : ''}" data-hire="${c.id}" ${can ? '' : 'disabled'}>招募</button></div></div>`;
  };
  const col = (f) => `<div class="tv-col"><h4 class="${f ? 'g-all' : 'g-emp'}">${FACTION_NAME[f]}</h4>${ROSTER.pool.filter((c) => c.faction === f).map(card).join('') || '<p class="g-dim">這一批沒有人了，打完下一場或換一批。</p>'}</div>`;
  const mine = (f) => cmdrsOf(f).map((c) => `<div class="tv-mine"><b>${c.title} ${c.name}</b><span class="g-dim">Lv ${cmdrLevel(c.id)}・${TRAIT_NAME[c.trait]}・${c.skills.map((s) => SKILLS[s].name).join('、')}</span><span class="g-sp"></span><button class="g-btn sm" data-fire="${c.id}" title="解雇（不退還功勳）">解雇</button></div>`).join('');
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>星際酒館</h2><span class="crumb">招募兩個陣營的指揮官・每打完一場換一批候選人</span><span class="g-sp"></span><button class="g-btn" id="tv-back">← 單人戰鬥</button></div>
    <div class="g-card" style="margin-bottom:12px"><div class="g-row"><span>功勳 <b class="g-emp tv-merit">${fmtN(ROSTER.merit)}</b></span><span class="g-dim">打完訓練作戰、隨機戰役或無限戰場就會得到功勳（勝利最多）</span><span class="g-sp"></span>
      <span class="g-dim">指揮官 ${COMMANDERS.length}／${ROSTER_MAX}</span><button class="g-btn sm" id="tv-ref" ${ROSTER.merit < TAVERN_REFRESH_COST ? 'disabled' : ''}>換一批（${TAVERN_REFRESH_COST} 功勳）</button></div>
      ${msg ? `<p class="g-warn" style="margin:8px 0 0">${msg}</p>` : ''}</div>
    <div class="g-card" style="margin-bottom:12px"><div class="g-row"><span>增援次數 <b class="g-emp">${ROSTER.reinf || 0}</b>／${REINFORCE_RULE.max}</span>
      <span class="g-dim" style="font-size:calc(12px * var(--ui))">學會天賦「呼叫增援」（指揮，Lv ${TALENT_BY_ID.s_reinf.req}）的指揮官可以在作戰中呼叫增援，每次消耗 1 次（全部指揮官共用）</span><span class="g-sp"></span>
      <button class="g-btn sm" id="tv-reinf" ${ROSTER.merit < REINFORCE_RULE.cost || (ROSTER.reinf || 0) >= REINFORCE_RULE.max ? 'disabled' : ''}>購買 1 次（${REINFORCE_RULE.cost} 功勳）</button></div></div>
    <div class="tv-grid">${col(0)}${col(1)}</div>
    <div class="g-card" style="margin-top:12px"><h3>我的指揮官</h3><div class="tv-grid"><div>${mine(0)}</div><div>${mine(1)}</div></div>
      <p class="g-dim" style="font-size:calc(12px * var(--ui));margin:8px 0 0">招募來的指揮官從候選人的等級開始，天賦點數照等級計算。出擊時只能派該陣營的指揮官。</p></div></div>`);
  gEl('tv-back').onclick = showSingle;
  gEl('tv-ref').onclick = () => { if (ROSTER.merit < TAVERN_REFRESH_COST) return; ROSTER.merit -= TAVERN_REFRESH_COST; tavernRefresh(); showTavern(); };
  gEl('tv-reinf').onclick = () => {
    if (ROSTER.merit < REINFORCE_RULE.cost || (ROSTER.reinf || 0) >= REINFORCE_RULE.max) return;
    ROSTER.merit -= REINFORCE_RULE.cost; ROSTER.reinf = (ROSTER.reinf || 0) + 1; rosterSave(); showTavern();
  };
  document.querySelectorAll('[data-hire]').forEach((b) => (b.onclick = () => showTavern(recruit(b.dataset.hire))));
  document.querySelectorAll('[data-fire]').forEach((b) => (b.onclick = () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定解雇？'; return; }
    showTavern(dismiss(b.dataset.fire));
  }));
}

// ═══════════════════════ 模擬室 ═══════════════════════
// 自由布置兩軍艦隊與地形，開戰後走正式的戰鬥流程（同一套模擬、AI、技能、戰術面板、回放），只是不計戰績、不給經驗。
// 編輯：右側面板改數值；地圖上左鍵點選、拖曳＝移動，右鍵點＝放到那裡（艦隊：按住拖曳＝朝向），中鍵拖曳＝移動鏡頭
// 戰鬥中可以切換指揮的陣營：被接管的一方 AI 暫停（切換也是一道命令，回放一致）
// 戰鬥中也能隨時「編輯配置」：以目前戰況（各艦隊的位置、朝向、剩餘艦數）當新的起點接著打；
// 還沒改任何東西之前，戰局本身原封不動（繼續／放棄修改＝回到原本的戰局）。「重置戰場」＝回到開戰時的布局。
//   base：開戰時的布局；mid：戰鬥中編輯；live：暫停中的戰局還在（尚未重建）；dirty：有修改；t0：先前各段的經過時間
const SIM = { m: null, sel: null, drag: null, tab: 'unit', base: null, mid: false, live: false, dirty: false, t0: 0, snapT: 0, snapInit: null, snapAlive: null };
const SIM_LAST = 'fleet.simlast', SIM_KEY = 'fleet.simlayouts';
const SIM_INF = 359999;   // 模擬室沒有時限
const SIM_CN = '一二三四五六七八九十';
const SIM_TERR_MAX_SOLID = 8;   // 實體障礙最多 8 個（著色器與碰撞的上限）
const simSideName = (m, side) => FACTION_NAME[side ? 1 - m.fac : m.fac];
// 戰術面板、艦橋共用：一般作戰＝剩餘時間；模擬室（無時限）＝整場的經過時間
function timeLeftText(t) { const tl = battleSetup.timeLimit; return tl >= SIM_INF ? `經過 ${_fmtT(t + SIM.t0)}` : _fmtT(Math.max(0, tl - t)); }

// ───── 布局資料 ─────
function simCmdrFrom(c, mode = 'lv') {
  return { base: c.id, name: c.name, title: c.title || '', trait: c.trait, level: mode === 'tal' ? cmdrLevel(c.id) : 3, mode, tal: mode === 'tal' ? { ...cmdrTal(c.id) } : {}, skills: c.skills.slice() };
}
function simNewFleet(m, side) {
  const fac = side ? 1 - m.fac : m.fac, pool = COMMANDERS.filter((c) => (c.faction || 0) === fac), n = m.fleets.filter((f) => f.side === side).length;
  const c = pool[n % Math.max(1, pool.length)] || COMMANDERS[0];
  return { side, name: `${side ? '敵方' : '我方'}第${SIM_CN[n] || n + 1}艦隊`, cmdr: simCmdrFrom(c), comp: defaultComp(2000), hangar: HANGAR_DEFAULT.slice(),
    formation: 'line', orderly: false, layers: 1, x: -300 + (n % 4) * 200, z: side ? -330 : 330, y: 0, h: side ? 0 : Math.PI,
    ai: side ? { tactic: 'push', level: 2 } : null, reserve: false, at: 60 };
}
function simDefault() {
  const m = { name: '新布局', fac: 0, victory: true, ctl: 0, seed: 1, fleets: [], terrain: [] };
  m.fleets.push(simNewFleet(m, 0), simNewFleet(m, 1));
  return m;
}
// 從訓練作戰匯入：我方用預設編成與自己的指揮官（天賦制），敵方照關卡設定（含增援，固定出現）
function simFromScenario(sc) {
  const m = { name: sc.name, fac: 0, victory: true, ctl: 0, seed: sc.seed, fleets: [], terrain: JSON.parse(JSON.stringify(sc.terrain || [])) };
  defaultLoadout(sc, 0).fleets.forEach((f, k) => {
    const c = COMMANDERS.find((o) => o.id === f.cmdr) || COMMANDERS[0];
    m.fleets.push({ side: 0, name: `我方第${SIM_CN[k]}艦隊`, cmdr: simCmdrFrom(c, 'tal'), comp: f.comp.slice(), hangar: HANGAR_DEFAULT.slice(), formation: f.formation, orderly: false, layers: 1,
      x: f.x, z: f.z, y: 0, h: f.h, ai: null, reserve: false, at: 60 });
  });
  for (const ef of sc.enemy) m.fleets.push({ side: 1, name: ef.name, cmdr: { base: null, name: ef.commander.name, title: ef.commander.title || '', trait: ef.commander.trait, level: ef.commander.level, mode: 'lv', tal: {}, skills: (ef.commander.skills || []).slice() },
    comp: ef.comp.slice(), hangar: HANGAR_DEFAULT.slice(), formation: ef.formation, orderly: false, layers: 1, x: ef.x, z: ef.z, y: ef.y || 0, h: ef.h, ai: { tactic: ef.tactic, level: sc.level }, reserve: false, at: 60 });
  for (const ev of sc.events) if (ev.type === 'reinforce') {
    const sx = ev.edge === 'left' ? -1 : 1;
    const rc = reinforceCmdr(sc);
    m.fleets.push({ side: 1, name: ev.name, cmdr: { base: null, name: rc.name, title: '', trait: rc.trait, level: rc.level, mode: 'lv', tal: {}, skills: rc.skills },
      comp: ev.comp.slice(), hangar: HANGAR_DEFAULT.slice(), formation: ev.formation, orderly: false, layers: 1, x: sx * 800, z: -40, y: 0, h: sx < 0 ? Math.PI / 2 : -Math.PI / 2,
      ai: { tactic: 'push', level: sc.level }, reserve: true, at: Math.round((ev.at[0] + ev.at[1]) / 2) });
  }
  return m;
}
// 布局 → 戰鬥設定（與正式作戰相同的格式）；edit＝編輯中（增援也先顯示出來，方便擺放）
function simSetup(m, edit) {
  const S = {
    bg: false, scenario: 'sim', level: 1, factions: m.fac ? [1, 0] : [0, 1], timeLimit: SIM_INF, noVictory: !m.victory,
    terrain: m.terrain.map((t) => ({ ...t })),
    fleets: m.fleets.map((f) => {
      const c = f.cmdr, tal = c.mode === 'tal' ? { ...c.tal } : null;
      return { side: f.side, name: f.name, ax: f.x, az: f.z, ay: f.y || 0, h: f.h, formation: f.formation, orderly: !!f.orderly, layers: f.layers || 1, comp: f.comp.slice(), hangar: f.hangar.slice(),
        commander: f.supply || f.noCmdr ? null : { ...(c.base ? { id: c.base } : {}), name: c.name || '指揮官', title: c.title || '', trait: c.trait, level: Math.max(1, c.level | 0), ...(tal ? { tal } : {}), skills: c.skills.filter((s) => SKILLS[s]) },
        ai: f.ai ? { ...f.ai } : null, reserve: !edit && !!f.reserve, activateAt: !edit && f.reserve ? Math.max(1, +f.at || 0) : null,
        supply: !!f.supply, follow: f.supply ? (f.follow != null ? f.follow : -1) : undefined, keep: !edit && f.keep ? f.keep : null };
    }),
    jam: !edit && m.jam ? m.jam : null,
  };
  // 呼叫增援：模擬室免費（不扣酒館買的次數），每位有這個技能的指揮官準備一支（這支艦隊兵力的 25%），藏在場外
  if (!edit) m.fleets.forEach((f, i) => {
    const cm = S.fleets[i].commander;
    if (!cm || !cm.skills.includes('reinforce')) return;
    S.fleets.push({ side: f.side, name: `${f.name}增援`, ax: 0, az: f.side ? MAP_BOUNDS.z0 - 900 : MAP_BOUNDS.z1 + 900, ay: 0, h: f.side ? 0 : Math.PI, formation: f.formation, comp: reinforceComp(f.comp, compCost(f.comp)),
      hangar: f.hangar.slice(), commander: null, ai: null, reserve: true, activateAt: null, reinfOf: i });
  });
  return S;
}
function simSave() { if (SIM.mid) return; /* 戰鬥中的編輯不覆蓋「上次的布局」 */ try { STORE.setItem(SIM_LAST, JSON.stringify(SIM.m)); } catch (e) { /* 只在本次 */ } }
function simLoadLast() { try { const m = JSON.parse(STORE.getItem(SIM_LAST) || 'null'); if (m && m.fleets) return m; } catch (e) { /* 用預設 */ } return simDefault(); }
function simLayouts() { try { return JSON.parse(STORE.getItem(SIM_KEY) || '[]'); } catch (e) { return []; } }
function simSetLayouts(l) { try { STORE.setItem(SIM_KEY, JSON.stringify(l)); } catch (e) { toast('無法存檔'); } }

// ───── 編輯畫面 ─────
function showSim(m) {
  simEndMid();
  GAME.watch = false;
  if (m) SIM.m = m; else if (!SIM.m || SIM.m.watch) SIM.m = simLoadLast();   // 剛看完觀摩：回到自己上次的布局
  if (SIM.m.watch) { SIM.m.watch = false; SIM.m.ctl = 0; }   // 觀摩的布局拿到模擬室：可以編輯、接管
  overlay(null); setPhase('simedit'); GAME.replaying = false; GAME.result = null; GAME.sc = null;
  GAME.playerSide = 0; setCmdSide(0, false);
  if (SIM.sel && !simSelItem()) SIM.sel = null;
  simBuild();
  camAnim = null; view.target.x = 0; view.target.z = 0; view.height = 1700; view.yaw = 0; view.pitch = ELEV; updateCamera();
}
function simSelItem() { const s = SIM.sel; if (!s) return null; return s.kind === 'fleet' ? SIM.m.fleets[s.i] : SIM.m.terrain[s.i]; }
function simBuild() {
  applyOp();   // 預覽也照操作難度（一般：都在基準面）
  newBattle(SIM.m.seed >>> 0, simSetup(SIM.m, true));
  paused = true; updateTimeUI();
  drawField(false);
  simMarkSel();
  simRender();
}
// 選取：艦隊用一般的選取外框；地形畫白圈
function simMarkSel() {
  clearSelection();
  const s = SIM.sel; if (!s) return;
  if (s.kind === 'fleet') { const f = fleets.find((o) => o.id === s.i); if (f) setSelection(f.sqs.filter((q) => q.alive > 0)); }   // 沒有艦艇的艦隊不會建出來，所以用 id 找
  else { const t = SIM.m.terrain[s.i]; if (t) { const ring = lineObj(0xffffff, 0.9), pts = []; for (let k = 0; k <= 64; k++) pts.push([t.x + Math.cos(k / 64 * TAU) * (t.r + 6), t.z + Math.sin(k / 64 * TAU) * (t.r + 6), t.y || 0]); setPts(ring, pts); fieldGroup.add(ring); } }
}
function simChanged(rebuild = true) {
  if (SIM.mid) { SIM.dirty = true; if (rebuild) SIM.live = false; }   // 重建場景後，暫停中的戰局就不在了
  simSave(); if (rebuild) simBuild(); else simRender();
}
function simSelect(sel) { SIM.sel = sel; drawField(false); simMarkSel(); simRender(); }

const simNum = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const simComp = (f) => sumA(f.comp);
function simRender() {
  const el = gEl('simbar'); if (!el) return;
  const m = SIM.m, it = simSelItem(), solid = m.terrain.filter((t) => TERRAIN_TYPES[t.type] && TERRAIN_TYPES[t.type].solid).length;
  const sideList = (side) => m.fleets.map((f, i) => [f, i]).filter(([f]) => f.side === side).map(([f, i]) =>
    `<button class="sim-it ${SIM.sel && SIM.sel.kind === 'fleet' && SIM.sel.i === i ? 'on' : ''}" data-sf="${i}"><b>${escH(f.name)}</b><small>${ships5(simComp(f))} 艘・${f.supply ? '補給艦隊' : `${escH(f.cmdr.name)} Lv ${f.cmdr.level}`}・${f.ai ? TACTICS[f.ai.tactic].name : '無 AI'}${f.reserve ? `・增援 ${f.at} 秒` : ''}</small></button>`).join('') || '<span class="g-dim">（沒有艦隊）</span>';
  const tot = (side) => ships5(sumA(m.fleets.filter((f) => f.side === side).map(simComp)));
  el.innerHTML = `<div class="sim-head"><b>模擬室</b><input class="g-in" id="sim-name" maxlength="30" value="${escH(m.name)}" title="布局名稱"><span class="g-sp"></span>
      <button class="g-btn sm" id="sim-exit">離開</button><button class="g-btn sm pri" id="sim-go">${SIM.mid ? '▶ 繼續' : '▶ 開戰'}</button></div>
    ${SIM.mid ? `<div class="sim-mid"><div><b>戰鬥暫停中</b>　<span class="g-dim">經過 ${_fmtT(SIM.t0 + SIM.snapT)}</span></div>
      <div class="g-dim">${SIM.dirty ? '已修改：按「繼續」會以目前的配置為新起點接著打（個別艦艇的損傷、技能次數與冷卻、飛行中的飛彈與艦載機會重置；分散的分艦隊會回到艦隊陣型）。' : '目前顯示的是暫停時的戰況，還沒有修改；按「繼續」會原封不動回到戰局。'}</div>
      <div class="sim-btns" style="margin-top:6px">${SIM.dirty && SIM.live ? '<button class="g-btn sm" id="sim-discard" title="回到暫停時的戰局">放棄修改</button>' : ''}<button class="g-btn sm" id="sim-reset" title="布局與狀態恢復成開戰時的樣子">↺ 重置戰場</button></div></div>` : ''}
    <div class="wed-seg sim-tabs" id="sim-tabs"><button data-tab="unit" class="${SIM.tab === 'unit' ? 'on' : ''}">單位與地形</button><button data-tab="field" class="${SIM.tab === 'field' ? 'on' : ''}">戰場設定</button><button data-tab="file" class="${SIM.tab === 'file' ? 'on' : ''}">布局存檔</button></div>
    ${SIM.tab === 'field' ? simFieldHtml(m) : SIM.tab === 'file' ? simFileHtml(m) : `
    <div class="sim-sec"><div class="sim-h"><span class="g-pc">${simSideName(m, 0)}（我方）</span><span class="g-dim">${tot(0)} 艘</span><span class="g-sp"></span><button class="g-btn sm" data-add="0">＋ 艦隊</button></div>${sideList(0)}</div>
    <div class="sim-sec"><div class="sim-h"><span class="g-ec">${simSideName(m, 1)}（敵方）</span><span class="g-dim">${tot(1)} 艘</span><span class="g-sp"></span><button class="g-btn sm" data-add="1">＋ 艦隊</button></div>${sideList(1)}</div>
    <div class="sim-sec"><div class="sim-h"><span>地形</span><span class="g-dim">實體障礙 ${solid}／${SIM_TERR_MAX_SOLID}</span><span class="g-sp"></span>${Object.keys(TERRAIN_TYPES).map((k) => `<button class="g-btn sm" data-addt="${k}" title="${TERRAIN_TYPES[k].desc}">＋ ${TERRAIN_TYPES[k].name}</button>`).join('')}</div>
      ${m.terrain.map((t, i) => `<button class="sim-it ${SIM.sel && SIM.sel.kind === 'terr' && SIM.sel.i === i ? 'on' : ''}" data-st="${i}"><b>${TERRAIN_TYPES[t.type].name}</b><small>(${Math.round(t.x)}, ${Math.round(t.z)})・高度 ${Math.round(t.y || 0)}・半徑 ${Math.round(t.r)}</small></button>`).join('') || '<span class="g-dim">（沒有地形）</span>'}</div>
    ${it ? (SIM.sel.kind === 'fleet' ? simFleetHtml(it) : simTerrHtml(it)) : '<div class="sim-sec g-dim">點清單或地圖上的艦隊／地形來編輯。</div>'}`}
    <div class="sim-help g-dim">地圖：左鍵點＝選取、拖曳＝移動；右鍵點＝把選取的放到那裡（艦隊：按住拖曳＝朝向）；中鍵拖曳＝移動鏡頭、滾輪＝縮放</div>`;
  simBind(el);
}
function simFieldHtml(m) {
  return `<div class="sim-sec">
    <div class="sim-row"><span>我方陣營</span><div class="wed-seg" id="sim-fac"><button data-v="0" class="${m.fac === 0 ? 'on emp' : ''}">帝國軍</button><button data-v="1" class="${m.fac === 1 ? 'on all' : ''}">聯盟軍</button></div></div>
    <div class="sim-row"><span>操作難度</span>${opSeg('sim-op')}</div>
    <div class="g-dim sim-note">${OP_LEVELS[opLevel()].desc}（與單人戰鬥共用同一個設定）</div>
    <div class="sim-row"><span>戰爭迷霧</span><div class="wed-seg" id="sim-fow"><button data-v="1" class="${m.fow !== false ? 'on' : ''}">開</button><button data-v="0" class="${m.fow === false ? 'on' : ''}">關</button></div></div>
    <div class="g-dim sim-note">${opLevel() === 2 ? '擬真難度：開＝只看得到偵測範圍內（或掃描到）的敵軍，自動攻擊也只打看得到的；關＝雙方都看得到全部' : '只有擬真難度才有戰爭迷霧'}</div>
    <div class="sim-row"><span>${SIM.mid ? '繼續時指揮' : '開戰時指揮'}</span><div class="wed-seg" id="sim-ctl"><button data-v="0" class="${m.ctl === 0 ? 'on' : ''}">我方</button><button data-v="1" class="${m.ctl === 1 ? 'on' : ''}">敵方</button></div></div>
    <div class="sim-row"><span>勝負判定</span><label><input type="checkbox" id="sim-vic" ${m.victory ? 'checked' : ''}> 一方全滅或潰走（剩 25% 以下）就結束</label></div>
    <div class="sim-row"><span>時限</span><span class="g-dim">模擬室沒有時間限制</span></div>
    <div class="sim-row"><span>隨機種子</span><input class="g-in" type="number" id="sim-seed" value="${m.seed}" style="width:110px"><button class="g-btn sm" id="sim-reseed">換一個</button></div>
    <div class="g-dim" style="font-size:calc(11.5px * var(--ui));margin-top:6px">同一個布局＋同一個種子＋同樣的指令＝同樣的結果；換種子會改變陣型細節與命中的隨機性。<br>規則與正式作戰相同（持續交火、不自動前進、主砲只打前方）。</div></div>`;
}
function simFileHtml(m) {
  const L = simLayouts();
  return `<div class="sim-sec"><div class="sim-h"><span>已存的布局</span><span class="g-sp"></span><button class="g-btn sm pri" id="sim-saveas">儲存目前布局</button></div>
      ${L.length ? L.map((l, i) => `<div class="sim-file"><b>${escH(l.name)}</b><small class="g-dim">${new Date(l.t).toLocaleString('zh-TW', { hour12: false })}・${l.m.fleets.length} 支艦隊・${l.m.terrain.length} 個地形</small><span class="g-sp"></span><button class="g-btn sm" data-ld="${i}">載入</button><button class="g-btn sm" data-dl="${i}">刪除</button></div>`).join('') : '<div class="g-dim">還沒有存過布局。名稱一樣會覆蓋。</div>'}</div>
    <div class="sim-sec"><div class="sim-h"><span>從訓練作戰匯入</span></div><div class="sim-btns">${SCENARIOS.map((sc, i) => `<button class="g-btn sm" data-sc="${i}">${sc.name}</button>`).join('')}</div>
      <div class="g-dim" style="font-size:calc(11.5px * var(--ui));margin-top:4px">敵軍、地形照關卡設定；增援改成固定出現（時間取中間值）。</div></div>
    <div class="sim-sec"><div class="sim-btns"><button class="g-btn sm" id="sim-new">新的空白布局</button></div></div>`;
}
function simFleetHtml(f) {
  const c = f.cmdr, opt = (v, n, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`;
  const cost = compCost(f.comp);
  return `<div class="sim-sec sim-ed"><div class="sim-h"><b>編輯艦隊</b><span class="g-sp"></span><button class="g-btn sm" id="sim-dup">複製</button><button class="g-btn sm" id="sim-del">刪除</button></div>
    <div class="sim-row"><span>名稱</span><input class="g-in" data-fk="name" value="${escH(f.name)}" maxlength="20"></div>
    <div class="sim-row"><span>陣營</span><div class="wed-seg" id="sim-fside"><button data-v="0" class="${f.side === 0 ? 'on' : ''}">我方</button><button data-v="1" class="${f.side === 1 ? 'on' : ''}">敵方</button></div></div>
    <div class="sim-row"><span>補給艦隊</span><label><input type="checkbox" data-fk="supply" ${f.supply ? 'checked' : ''}> 沒有指揮官，範圍內的友艦自動補飛彈</label></div>
    ${f.supply ? `<div class="sim-row"><span>跟隨</span><select class="g-sel" data-fk="follow">${opt(-1, '不跟隨', f.follow != null ? f.follow : -1)}${SIM.m.fleets.map((o, i) => (o !== f && o.side === f.side && !o.supply ? opt(i, o.name, f.follow) : '')).join('')}</select></div>` : `
    <div class="sim-row"><span>控制</span><select class="g-sel" data-fk="ai">${opt('', '無 AI（玩家指揮／不動）', f.ai ? f.ai.tactic : '')}${Object.keys(TACTICS).map((k) => opt(k, 'AI：' + TACTICS[k].name, f.ai ? f.ai.tactic : '')).join('')}</select>
      ${f.ai ? `<select class="g-sel" data-fk="ailv">${WATCH_LV.map((l, i) => opt(i + 1, l.name, f.ai.level)).join('')}</select>` : ''}</div>
    ${f.ai ? `<div class="g-dim sim-note">${TACTICS[f.ai.tactic].desc}${f.ai.level >= 2 ? ' ' + WATCH_LV[Math.min(WATCH_LV.length, f.ai.level) - 1].desc : ''}</div>` : ''}`}
    <div class="sim-row"><span>增援</span><label><input type="checkbox" data-fk="reserve" ${f.reserve ? 'checked' : ''}> 開戰後</label><input class="g-in" type="number" min="1" data-fk="at" value="${f.at}" style="width:70px" ${f.reserve ? '' : 'disabled'}><span class="g-dim">秒才出現</span></div>
    ${f.supply ? '' : '<div class="sim-sub">指揮官</div>'}
    ${f.supply ? '' : `<div class="sim-row"><span>套用</span><select class="g-sel" data-fk="base">${opt('', '（自訂）', c.base || '')}${COMMANDERS.map((o) => opt(o.id, `${o.name}（${FACTION_NAME[o.faction || 0]}・${TRAIT_NAME[o.trait]}）`, c.base || '')).join('')}</select></div>
    <div class="sim-row"><span>名稱</span><input class="g-in" data-ck="name" value="${escH(c.name)}" maxlength="16"></div>
    <div class="sim-row"><span>加成</span><select class="g-sel" data-ck="mode">${opt('lv', '等級制（同 AI 指揮官：特性隨等級）', c.mode)}${opt('tal', '天賦制（同玩家：特性 +8%＋天賦）', c.mode)}</select></div>
    <div class="sim-row"><span>等級／特性</span><input class="g-in" type="number" min="1" max="30" data-ck="level" value="${c.level}" style="width:64px"><select class="g-sel" data-ck="trait">${Object.keys(TRAIT_NAME).map((k) => opt(k, TRAIT_NAME[k], c.trait)).join('')}</select>
      <span class="g-dim">${c.mode === 'tal' ? '特性 +8%' : `特性 +${Math.round(traitBonus(c.trait, c.level) * 100)}%`}</span></div>
    <div class="sim-row"><span>技能</span><div class="sim-chk">${Object.keys(SKILLS).map((k) => `<label title="${SKILLS[k].desc}"><input type="checkbox" data-sk="${k}" ${c.skills.includes(k) ? 'checked' : ''}> ${SKILLS[k].name}</label>`).join('')}</div></div>
    ${c.mode === 'tal' ? `<div class="sim-row"><span>天賦</span><div class="sim-tal">${TALENTS.filter((t) => t.kind !== 'skill' && t.id !== 'recon').map((t) => `<label title="${t.desc(Math.max(1, c.tal[t.id] || 1))}">${t.name}<input class="g-in" type="number" min="0" max="${t.max}" data-tal="${t.id}" value="${c.tal[t.id] || 0}"></label>`).join('')}</div></div>` : ''}`}
    <div class="sim-sub">編成 <span class="g-dim">${ships5(simComp(f))} 艘・${fmtN(cost)} 點（每個數字＝圖示數，1 圖示＝${opts.rep} 艘）</span></div>
    <div class="sim-comp">${SHIP_TYPES.map((st, t) => `<label>${st.name}<input class="g-in" type="number" min="0" step="10" data-ct="${t}" value="${f.comp[t] || 0}"></label>`).join('')}</div>
    ${f.comp[0] > 0 ? `<div class="sim-comp">${CRAFT.map((cr, r) => `<label title="${cr.note}">${cr.name}<input class="g-in" type="number" min="0" max="${SHIP_TYPES[0].fighters.n}" data-hg="${r}" value="${f.hangar[r]}"></label>`).join('')}</div>` : ''}
    <div class="sim-row"><span>陣型</span><select class="g-sel" data-fk="formation">${Object.keys(FORMATIONS).map((k) => opt(k, FORMATIONS[k].name, f.formation)).join('')}</select>
      <select class="g-sel" data-fk="arr">${opt('0', '自然', f.orderly ? String(f.layers || 1) : '0')}${opt('1', '整齊・1 層', f.orderly ? String(f.layers || 1) : '0')}${opt('3', '整齊・3 層', f.orderly ? String(f.layers || 1) : '0')}</select></div>
    <div class="sim-sub">位置</div>
    <div class="sim-comp"><label>X<input class="g-in" type="number" step="10" data-pk="x" value="${Math.round(f.x)}"></label><label>Z<input class="g-in" type="number" step="10" data-pk="z" value="${Math.round(f.z)}"></label>
      <label>高度<input class="g-in" type="number" step="10" min="${-ALT_MAX + 50}" max="${ALT_MAX - 50}" data-pk="y" value="${Math.round(f.y || 0)}"></label><label>朝向°<input class="g-in" type="number" step="15" data-pk="h" value="${Math.round(f.h * 180 / Math.PI)}"></label></div>
  </div>`;
}
function simTerrHtml(t) {
  return `<div class="sim-sec sim-ed"><div class="sim-h"><b>編輯地形</b><span class="g-sp"></span><button class="g-btn sm" id="sim-dup">複製</button><button class="g-btn sm" id="sim-del">刪除</button></div>
    <div class="sim-row"><span>類型</span><select class="g-sel" data-tk="type">${Object.keys(TERRAIN_TYPES).map((k) => `<option value="${k}" ${k === t.type ? 'selected' : ''}>${TERRAIN_TYPES[k].name}</option>`).join('')}</select></div>
    <div class="g-dim sim-note">${TERRAIN_TYPES[t.type].desc}</div>
    <div class="sim-comp"><label>X<input class="g-in" type="number" step="10" data-tk="x" value="${Math.round(t.x)}"></label><label>Z<input class="g-in" type="number" step="10" data-tk="z" value="${Math.round(t.z)}"></label>
      <label>高度<input class="g-in" type="number" step="10" data-tk="y" value="${Math.round(t.y || 0)}"></label><label>半徑<input class="g-in" type="number" step="5" min="20" max="400" data-tk="r" value="${Math.round(t.r)}"></label></div></div>`;
}
function simClampPos(o) { o.x = Math.max(MAP_BOUNDS.x0, Math.min(MAP_BOUNDS.x1, o.x)); o.z = Math.max(MAP_BOUNDS.z0, Math.min(MAP_BOUNDS.z1, o.z)); return o; }
function simBind(el) {
  const m = SIM.m, q = (s) => el.querySelectorAll(s), on = (id, ev, fn) => { const e = el.querySelector('#' + id); if (e) e[ev] = fn; };
  on('sim-name', 'onchange', (e) => { m.name = e.target.value.trim() || '新布局'; simChanged(false); });
  on('sim-exit', 'onclick', () => { if (SIM.mid && !confirm('離開模擬室？目前的戰局不會保留。')) return; simEndMid(); fieldGroup.clear(); clearSelection(); showSingle(); });
  on('sim-go', 'onclick', simGo);
  q('#sim-tabs [data-tab]').forEach((b) => (b.onclick = () => { SIM.tab = b.dataset.tab; simRender(); }));
  // 單位與地形清單
  q('[data-sf]').forEach((b) => (b.onclick = () => simSelect({ kind: 'fleet', i: +b.dataset.sf })));
  q('[data-st]').forEach((b) => (b.onclick = () => simSelect({ kind: 'terr', i: +b.dataset.st })));
  q('[data-add]').forEach((b) => (b.onclick = () => { m.fleets.push(simNewFleet(m, +b.dataset.add)); SIM.sel = { kind: 'fleet', i: m.fleets.length - 1 }; simChanged(); }));
  q('[data-addt]').forEach((b) => (b.onclick = () => {
    const type = b.dataset.addt;
    if (TERRAIN_TYPES[type].solid && m.terrain.filter((t) => TERRAIN_TYPES[t.type].solid).length >= SIM_TERR_MAX_SOLID) { toast(`實體障礙最多 ${SIM_TERR_MAX_SOLID} 個`); return; }
    const p = { x: Math.round(view.target.x / 10) * 10, z: Math.round(view.target.z / 10) * 10 };
    m.terrain.push({ type, x: p.x, z: p.z, y: 0, r: TERRAIN_TYPES[type].solid ? 60 : 180 }); SIM.sel = { kind: 'terr', i: m.terrain.length - 1 }; simChanged();
  }));
  // 戰場設定
  q('#sim-fac [data-v]').forEach((b) => (b.onclick = () => { m.fac = +b.dataset.v; simChanged(); }));
  q('#sim-ctl [data-v]').forEach((b) => (b.onclick = () => { m.ctl = +b.dataset.v; simChanged(false); }));
  q('#sim-fow [data-v]').forEach((b) => (b.onclick = () => { m.fow = b.dataset.v === '1'; simChanged(); }));   // 規則改變：戰鬥中改了就要重建
  if (el.querySelector('#sim-op')) bindOpSeg('sim-op', () => simChanged());   // 難度會改變規則（高度、誤射）：戰鬥中改了就要重建
  on('sim-discard', 'onclick', simDiscard);
  on('sim-reset', 'onclick', simReset);
  on('sim-vic', 'onchange', (e) => { m.victory = e.target.checked; simChanged(false); });
  on('sim-seed', 'onchange', (e) => { m.seed = Math.max(0, Math.round(simNum(e.target.value, 1))); simChanged(); });
  on('sim-reseed', 'onclick', () => { m.seed = Math.floor(Math.random() * 1e6); simChanged(); });
  // 布局存檔
  on('sim-saveas', 'onclick', () => { const L = simLayouts().filter((l) => l.name !== m.name); L.unshift({ name: m.name, t: Date.now(), m: JSON.parse(JSON.stringify(m)) }); simSetLayouts(L); toast(`已儲存「${m.name}」`); simRender(); });
  q('[data-ld]').forEach((b) => (b.onclick = () => { const l = simLayouts()[+b.dataset.ld]; if (!l) return; SIM.m = JSON.parse(JSON.stringify(l.m)); SIM.sel = null; SIM.tab = 'unit'; simChanged(); toast(`已載入「${l.name}」`); }));
  q('[data-dl]').forEach((b) => (b.onclick = () => { const L = simLayouts(), l = L[+b.dataset.dl]; if (!l || !confirm(`刪除布局「${l.name}」？`)) return; L.splice(+b.dataset.dl, 1); simSetLayouts(L); simRender(); }));
  q('[data-sc]').forEach((b) => (b.onclick = () => { SIM.m = simFromScenario(SCENARIOS[+b.dataset.sc]); SIM.sel = null; SIM.tab = 'unit'; simChanged(); }));
  on('sim-new', 'onclick', () => { SIM.m = simDefault(); SIM.sel = null; SIM.tab = 'unit'; simChanged(); });
  // 選取中的項目
  const it = simSelItem(); if (!it) return;
  on('sim-del', 'onclick', () => { (SIM.sel.kind === 'fleet' ? m.fleets : m.terrain).splice(SIM.sel.i, 1); SIM.sel = null; simChanged(); });
  on('sim-dup', 'onclick', () => {
    const arr = SIM.sel.kind === 'fleet' ? m.fleets : m.terrain, o = JSON.parse(JSON.stringify(it));
    if (SIM.sel.kind === 'terr' && TERRAIN_TYPES[o.type].solid && m.terrain.filter((t) => TERRAIN_TYPES[t.type].solid).length >= SIM_TERR_MAX_SOLID) { toast(`實體障礙最多 ${SIM_TERR_MAX_SOLID} 個`); return; }
    o.x += 80; if (o.name) o.name += '（複製）'; simClampPos(o); arr.push(o); SIM.sel = { kind: SIM.sel.kind, i: arr.length - 1 }; simChanged();
  });
  if (SIM.sel.kind === 'terr') {
    q('[data-tk]').forEach((e) => (e.onchange = () => {
      const k = e.dataset.tk;
      if (k === 'type') {
        if (TERRAIN_TYPES[e.value].solid && !TERRAIN_TYPES[it.type].solid && m.terrain.filter((t) => TERRAIN_TYPES[t.type].solid).length >= SIM_TERR_MAX_SOLID) { toast(`實體障礙最多 ${SIM_TERR_MAX_SOLID} 個`); simRender(); return; }
        it.type = e.value;
      } else if (k === 'r') it.r = Math.max(20, Math.min(400, simNum(e.value, it.r)));
      else if (k === 'y') it.y = Math.max(-ALT_MAX, Math.min(ALT_MAX, simNum(e.value, 0)));
      else { it[k] = simNum(e.value, it[k]); simClampPos(it); }
      simChanged();
    }));
    return;
  }
  const f = it, c = f.cmdr;
  q('#sim-fside [data-v]').forEach((b) => (b.onclick = () => { f.side = +b.dataset.v; simChanged(); }));
  q('[data-fk]').forEach((e) => (e.onchange = () => {
    const k = e.dataset.fk;
    if (k === 'name') { f.name = e.value.trim() || f.name; simChanged(false); return; }
    if (k === 'ai') f.ai = e.value ? { tactic: e.value, level: f.ai ? f.ai.level : 2 } : null;
    else if (k === 'ailv') f.ai.level = +e.value;
    else if (k === 'reserve') f.reserve = e.checked;
    else if (k === 'supply') { f.supply = e.checked; if (f.supply) { f.ai = null; if (f.follow == null) f.follow = -1; } }   // 補給艦隊：沒有指揮官與 AI，可設定跟隨
    else if (k === 'follow') f.follow = +e.value;
    else if (k === 'at') f.at = Math.max(1, Math.round(simNum(e.value, 60)));
    else if (k === 'formation') f.formation = e.value;
    else if (k === 'arr') { f.orderly = +e.value > 0; f.layers = +e.value || 1; }
    else if (k === 'base') {
      const o = COMMANDERS.find((x) => x.id === e.value);
      if (o) f.cmdr = { ...simCmdrFrom(o, c.mode), level: c.mode === 'tal' ? cmdrLevel(o.id) : c.level }; else c.base = null;
    }
    simChanged(['formation', 'arr', 'base'].includes(k));
  }));
  q('[data-ck]').forEach((e) => (e.onchange = () => {
    const k = e.dataset.ck;
    if (k === 'name') c.name = e.value.trim() || c.name;
    else if (k === 'level') c.level = Math.max(1, Math.min(30, Math.round(simNum(e.value, 1))));
    else if (k === 'trait') c.trait = e.value;
    else if (k === 'mode') c.mode = e.value;
    simChanged(false);
  }));
  q('[data-sk]').forEach((e) => (e.onchange = () => { const s = e.dataset.sk; c.skills = c.skills.filter((x) => x !== s); if (e.checked) c.skills.push(s); simChanged(false); }));
  q('[data-tal]').forEach((e) => (e.onchange = () => { const t = TALENT_BY_ID[e.dataset.tal], v = Math.max(0, Math.min(t.max, Math.round(simNum(e.value, 0)))); if (v) c.tal[t.id] = v; else delete c.tal[t.id]; simChanged(false); }));
  q('[data-ct]').forEach((e) => (e.onchange = () => { f.comp[+e.dataset.ct] = Math.max(0, Math.round(simNum(e.value, 0))); simChanged(); }));
  q('[data-hg]').forEach((e) => (e.onchange = () => { f.hangar[+e.dataset.hg] = Math.max(0, Math.min(SHIP_TYPES[0].fighters.n, Math.round(simNum(e.value, 0)))); simChanged(false); }));
  q('[data-pk]').forEach((e) => (e.onchange = () => {
    const k = e.dataset.pk, v = simNum(e.value, 0);
    if (k === 'h') f.h = v * Math.PI / 180; else if (k === 'y') f.y = Math.max(-ALT_MAX + 50, Math.min(ALT_MAX - 50, v)); else { f[k] = v; simClampPos(f); }
    simChanged();
  }));
}

// ───── 地圖上的滑鼠（編輯中） ─────
function simHit(cx, cy) {
  const q = squadronAt(cx, cy);
  if (q && q.fleet && SIM.m.fleets[q.fleet.id]) return { kind: 'fleet', i: q.fleet.id };
  const p = groundAt(cx, cy); if (!p) return null;
  let best = null, br = 1e9;
  SIM.m.terrain.forEach((t, i) => { const d = Math.hypot(p.x - t.x, p.z - t.z); if (d < t.r && t.r < br) { br = t.r; best = { kind: 'terr', i }; } });
  return best;
}
function simPointer(type, e) {
  if (e.pointerType === 'touch' || e.button === 1 && type === 'down') return false;
  const d = SIM.drag;
  if (type === 'down') {
    if (e.button === 0) {
      const h = simHit(e.clientX, e.clientY);
      if (!h) { if (SIM.sel) simSelect(null); return true; }
      if (!SIM.sel || SIM.sel.kind !== h.kind || SIM.sel.i !== h.i) simSelect(h);
      SIM.drag = { mode: 'move', A: groundAt(e.clientX, e.clientY), x0: e.clientX, y0: e.clientY };
      return true;
    }
    if (e.button === 2) {
      if (!SIM.sel) { toast('先選取一支艦隊或一個地形'); return true; }
      const A = groundAt(e.clientX, e.clientY); if (!A) return true;
      SIM.drag = { mode: 'place', A: simClampPos(A), x0: e.clientX, y0: e.clientY };
      return true;
    }
    return false;
  }
  if (!d) return false;
  const B = groundAt(e.clientX, e.clientY), far = Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8, it = simSelItem();
  if (type === 'move') {
    if (B && d.A && far && it) {
      d.moved = true;
      const from = d.mode === 'move' ? [it.x, it.z] : [d.A.x, d.A.z], to = d.mode === 'move' ? [it.x + B.x - d.A.x, it.z + B.z - d.A.z] : [B.x, B.z];
      preview.visible = true; pvBox.visible = pvArrow.visible = pvPath.visible = false; pvLine.visible = true; setPts(pvLine, [from, to]);
    }
    return true;
  }
  if (type === 'up') {
    hidePreview(); SIM.drag = null;
    if (!it) return true;
    if (d.mode === 'move' && d.moved && B && d.A) { it.x += B.x - d.A.x; it.z += B.z - d.A.z; simClampPos(it); simChanged(); }
    else if (d.mode === 'place') {
      it.x = d.A.x; it.z = d.A.z;
      if (SIM.sel.kind === 'fleet' && B && far) it.h = Math.atan2(B.x - d.A.x, B.z - d.A.z);
      simChanged();
    }
    return true;
  }
  return false;
}

// ───── 戰鬥 ─────
function simGo() { if (SIM.mid && SIM.live && !SIM.dirty) simResumeLive(); else simStart(); }
// 開戰（SIM.mid＝戰鬥中編輯完，從暫停時的戰況接著打）
function simStart() {
  const m = SIM.m, cont = SIM.mid;
  if (![0, 1].every((s) => m.fleets.some((f) => f.side === s && !f.reserve && simComp(f) > 0))) { toast('雙方都至少要有一支（非增援的）艦隊'); return; }
  if (cont) SIM.t0 += SIM.snapT; else { SIM.base = JSON.parse(JSON.stringify(m)); SIM.t0 = 0; if (!m.watch) simSave(); }   // 觀摩不覆蓋模擬室「上次的布局」
  SIM.mid = SIM.live = SIM.dirty = false;
  GAME.attempt = (GAME.attempt || 0) + 1;
  GAME.watch = !!m.watch;   // AI 對戰觀摩：雙方都是 AI，玩家只看
  GAME.sc = { id: 'sim', name: GAME.watch ? `AI 對戰觀摩・${m.name}` : `模擬室・${m.name}`, sim: true, seed: m.seed, timeLimit: SIM_INF };
  fieldGroup.clear();
  applyOp(opLevel(), m.fow !== false); const setup = simSetup(m, false); setup.op = GAME.op;   // 擬真：戰爭迷霧可以在模擬室關掉
  if (GAME.watch) GAME.op = Math.min(GAME.op, 1);   // 觀摩：規則照操作難度（含擬真的誤射），但畫面不鎖在艦橋
  newBattle(m.seed >>> 0, setup);
  setRule('fire', true); setRule('advance', false);
  GAME.init = [sideAlive(0), sideAlive(1)];
  if (cont) {
    // 接續：潰走的比例仍以整場的兵力為準（加進來的新艦隊另外算進去）；各艦隊的百分比也照原本的兵力
    GAME.init = GAME.init.map((n, s) => SIM.snapInit[s] + Math.max(0, n - SIM.snapAlive[s]));
    for (const f of fleets) { const mf = m.fleets[f.id]; if (mf && mf.init0) f.initial = Math.max(f.initial, mf.init0); }
  }
  GAME.result = null; GAME.reportShown = false; GAME.replaying = false; GAME.skillArm = null; GAME.xp = null; GAME.log = []; GAME.simCtl = null;
  gEl('battlehud').innerHTML = '';
  drawField(false);
  setPhase('battle');
  if (GAME.watch) { GAME.playerSide = 0; setCmdSide(0, false); clearSelection(); }   // 觀摩：沒有 simctl 命令＝雙方 AI 都在動
  else { GAME.playerSide = m.ctl; setCmdSide(m.ctl, false); clearSelection(); issue('simctl', { ctl: m.ctl }); }   // 誰被玩家接管（該方 AI 暫停）也記在命令裡，回放一致
  paused = false; setSpeed(SETTINGS.speedIdx);
  force3D(); if (GAME.op === 2) enterBridge();   // 與正式作戰相同：進階以上強制 3D，擬真直接上艦橋
  if (opts.fow && SETTINGS.autoScan === false && !GAME.watch) issue('autoscan', { on: false });   // 戰爭迷霧：玩家關掉了自動掃描
  if (GAME.watch) { toast(`觀摩開始：${simSideName(m, 0)} vs ${simSideName(m, 1)}（左側面板是 AI 的即時判斷，點艦隊名稱可以跳過去看；左鍵拖曳＝移動畫面、右鍵拖曳＝調整視角；空白鍵暫停、＋／－ 調速度）`); return; }
  toast(cont ? `以目前戰況接續（指揮${simSideName(m, m.ctl)}）` : `模擬開始：指揮${simSideName(m, m.ctl)}（畫面上方「切換指揮」可以接管另一方、「編輯配置」可以隨時調整）`);
}
// 目前戰況 → 布局：位置＝存活艦艇的中心、朝向與陣型＝旗艦那一隊、編成＝剩下的艦數；尚未出現的增援照剩餘時間
function simSnapshot() {
  const m = JSON.parse(JSON.stringify(SIM.m)), t = U.uTime.value;
  m.ctl = GAME.playerSide;
  m.fleets.forEach((mf, i) => {
    const f = fleets.find((o) => o.id === i); if (!f) return;   // 原本就沒有艦艇
    mf.init0 = Math.max(mf.init0 || 0, f.initial);
    if (f.reserve) { mf.reserve = true; mf.at = Math.max(1, Math.round((f.activateAt != null ? f.activateAt : mf.at) - t)); return; }
    mf.reserve = false;
    const al = fleetAlive(f), comp = new Array(NT).fill(0);
    for (const q of al) for (let k = 0; k < NT; k++) comp[k] += q.typeAlive[k];
    if (al.some((q) => q.flagship >= 0 && ships.alive[q.flagship]) && comp[1] > 0) comp[1]--;   // 重建時會再補一艘旗艦
    mf.comp = comp;
    if (!al.length) return;
    const C = centerOf(al), g = (al.find((q) => q.flagship >= 0 && ships.alive[q.flagship]) || al[0]).group;
    mf.x = Math.round(C.x); mf.z = Math.round(C.z); mf.y = Math.max(-ALT_MAX + 50, Math.min(ALT_MAX - 50, Math.round(C.y)));
    if (g) { mf.h = groupHeading(g, t); mf.formation = g.formation; mf.orderly = !!g.orderly; mf.layers = g.layers || 1; }
    if (f.ai && mf.ai) mf.ai.tactic = f.ai.tactic;   // AI 中途改過的打法
    if (f.supply) mf.follow = f.follow;
    mf.keep = simKeepOf(f, g, t);
  });
  // 已經進場的呼叫增援：變成布局裡的一般艦隊（沒有指揮官），接續時才不會消失
  for (const f of fleets) {
    if (f.reinfOf == null || f.reserve) continue;
    const al = fleetAlive(f); if (!al.length) continue;
    const comp = new Array(NT).fill(0); for (const q of al) for (let k = 0; k < NT; k++) comp[k] += q.typeAlive[k];
    if (al.some((q) => q.flagship >= 0 && ships.alive[q.flagship]) && comp[1] > 0) comp[1]--;   // 重建時會再補一艘旗艦
    const C = centerOf(al), g = al[0].group;
    m.fleets.push({ side: f.side, name: f.name, noCmdr: true, cmdr: { base: null, name: f.name, title: '', trait: 'dmg', level: 1, mode: 'lv', tal: {}, skills: [] }, comp, hangar: (f.hangar || HANGAR_DEFAULT).slice(),
      formation: g ? g.formation : 'line', orderly: !!(g && g.orderly), layers: (g && g.layers) || 1, x: Math.round(C.x), z: Math.round(C.z), y: Math.round(C.y), h: g ? groupHeading(g, t) : 0,
      ai: null, reserve: false, at: 60, init0: f.initial, keep: simKeepOf(f, g, t) });
  }
  m.jam = [0, 1].map((s) => (jammed(s) ? [Math.round((jam[s].until - t) * 10) / 10, jam[s].delay] : null));   // 干擾剩下的時間
  return m;
}
// 接續時要保留的狀態（重建後套回去）：平均耐久與護盾比例、飛彈與補給存量比例、技能剩餘次數與冷卻、命令隊列（指定目標的項目除外）
function simKeepOf(f, g, t) {
  let hp = 0, hpM = 0, sh = 0, shM = 0, am = 0, amM = 0, sk = 0, skM = 0;
  for (const q of fleetAlive(f)) for (const i of q.list) {
    if (!ships.alive[i]) continue;
    const st = SHIP_TYPES[ships.type[i]];
    hp += ships.hp[i]; hpM += maxHp(i); sh += ships.sh[i]; shM += ships.shMax[i];
    if (st.missile) { am += ships.ammo[i]; amM += st.missile.n; }
    if (st.supply) { sk += ships.stock[i]; skM += st.supply.stock; }
  }
  const r = (a, b) => (b ? Math.round(a / b * 1000) / 1000 : 1);
  return {
    hp: r(hp, hpM), sh: r(sh, shM), ammo: r(am, amM), stock: r(sk, skM),
    skills: Object.fromEntries(Object.entries(f.skills).map(([id, s]) => [id, { left: s.left, cd: Math.max(0, Math.round((s.ready - t) * 10) / 10) }])),
    queue: g && g.queue ? g.queue.filter((it) => it.target == null).map(({ qid, ...it }) => it) : [],
  };
}
// 戰鬥中：暫停並打開編輯（戰局先保留，第一次修改場景時才重建）
function simEditMid() {
  if (!GAME.sc || !GAME.sc.sim || GAME.phase !== 'battle' || GAME.replaying || GAME.result) return;
  if (BR.on) exitBridge();
  if (TAC.open) closeTac();
  GAME.skillArm = null; hideHint(); closeRadial();
  paused = true; updateTimeUI();
  SIM.snapT = U.uTime.value; SIM.snapInit = GAME.init.slice(); SIM.snapAlive = [sideAlive(0), sideAlive(1)];
  SIM.keep = SIM.m;   // 放棄修改時還原
  SIM.m = simSnapshot(); SIM.mid = true; SIM.live = true; SIM.dirty = false; SIM.sel = null; SIM.tab = 'unit';
  setPhase('simedit');
  clearSelection(); simRender();
}
// 沒有修改（或放棄修改）：回到原本的戰局，什麼都不重置
function simResumeLive() {
  SIM.m = SIM.keep || SIM.m; SIM.keep = null; SIM.mid = SIM.live = SIM.dirty = false; SIM.sel = null;
  drawField(false); clearSelection();
  gEl('battlehud').innerHTML = '';
  setPhase('battle'); setCmdSide(GAME.playerSide, false);
  paused = false; updateTimeUI();
  if (GAME.op === 2) enterBridge();
}
function simDiscard() { if (SIM.live) simResumeLive(); }
// 重置戰場：布局與狀態回到開戰時
function simReset() {
  if (!SIM.base) return;
  if (SIM.dirty && !confirm('重置戰場？目前的戰況與修改都會捨棄，回到開戰時的布局。')) return;
  SIM.m = JSON.parse(JSON.stringify(SIM.base)); simEndMid(); SIM.sel = null;
  simBuild(); toast('已重置：回到開戰時的布局');
}
function simEndMid() { SIM.mid = SIM.live = SIM.dirty = false; SIM.keep = null; SIM.t0 = 0; }
// 戰鬥中切換指揮的陣營
function simSwitch() {
  if (!GAME.sc || !GAME.sc.sim || GAME.phase !== 'battle' || GAME.replaying) return;
  if (BR.on) exitBridge();
  const side = 1 - GAME.playerSide;
  GAME.skillArm = null; hideHint(); closeRadial();
  if (typeof closeNodePop === 'function') closeNodePop();
  issue('simctl', { ctl: side });
  GAME.playerSide = side; setCmdSide(side, false); clearSelection();
  buildBattleHud();
  if (GAME.op === 2) enterBridge();   // 擬真：換到另一方的旗艦艦橋
  else if (TAC.open) buildTacSide();
  toast(`改為指揮${simSideName(SIM.m, side)}（這一方的 AI 暫停）`);
}
function showSimReport() {
  const R = GAME.result, m = SIM.m, st = battleStats();
  setPhase('report');
  const n0 = simSideName(m, 0), n1 = simSideName(m, 1);
  const label = { win: `${n0} 勝利`, lose: `${n1} 勝利`, draw: '平手', end: '模擬結束' }[R.kind] || '模擬結束';
  const row = (t) => `<tr><td>${SHIP_TYPES[t].name}</td><td>${ships5(st.init[0][t])}</td><td>${ships5(st.init[0][t] - st.left[0][t])}</td><td>${ships5(st.init[1][t])}</td><td>${ships5(st.init[1][t] - st.left[1][t])}</td></tr>`;
  const asp = (sd) => dmgStats[sd].map((v) => ships5(v)).join(' ／ ');
  const used = (side) => fleets.filter((f) => f.side === side).flatMap((f) => Object.entries(f.skills).filter(([, s]) => s.used).map(([id, s]) => `${f.name}：${SKILLS[id].name} ×${s.used}`));
  const fl = (side) => fleets.filter((f) => f.side === side).map((f) => { const n = sumA(f.sqs.map((q) => q.alive)); return `<div>${escH(f.name)}　<span class="g-dim">${f.reserve ? '未出場' : `剩 ${Math.round(n / f.initial * 100)}%`}</span></div>`; }).join('');
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>${m.watch ? '觀摩結果' : '模擬結果'}</h2><span class="crumb">${escH(m.name)}　·　${OP_LEVELS[(battleSetup && battleSetup.op) || 0].name}難度　·　戰鬥時間 ${_fmtT(R.t + SIM.t0)}</span></div>
    ${SIM.t0 > 0 ? `<div class="g-dim" style="margin:-4px 0 10px">戰鬥中調整過配置：下面的損失統計與回放從最後一次調整（${_fmtT(SIM.t0)}）開始。</div>` : ''}
    <div class="g-card" style="margin-bottom:12px;text-align:center"><p class="result ${R.kind === 'end' ? 'draw' : R.kind}">${label}</p><div class="g-dim">${escH(m.watch ? R.why.replaceAll('我軍', n0).replaceAll('敵軍', n1).replace('我方', n0).replace('敵方', n1) : R.why)}</div>
      <div style="margin-top:6px">${n0} 剩 ${Math.round(R.ratio[0] * 100)}%　·　${n1} 剩 ${Math.round(R.ratio[1] * 100)}%</div></div>
    <div class="intel-grid">
      <div class="g-card"><h3>兵力損失（艘）</h3><table class="stat-tbl"><tr><th>艦種</th><th>${n0}出擊</th><th>${n0}損失</th><th>${n1}出擊</th><th>${n1}損失</th></tr>
        ${SHIP_TYPES.map((_, t) => t).filter((t) => t < N_COMBAT || st.init[0][t] + st.init[1][t] > 0).map(row).join('')}
        <tr><td><b>合計</b></td><td>${ships5(sumA(st.init[0]))}</td><td>${ships5(sumA(st.init[0]) - sumA(st.left[0]))}</td><td>${ships5(sumA(st.init[1]))}</td><td>${ships5(sumA(st.init[1]) - sumA(st.left[1]))}</td></tr></table>
        <dl class="kv" style="margin-top:10px"><dt>被擊沉方向</dt><dd>${n0} 正／側／背 ${asp(0)}<br>${n1} 正／側／背 ${asp(1)}</dd>
        ${battleRules && battleRules.ff ? `<dt>友軍誤射</dt><dd>${n0} ${fmtN(ffStats[0][0])} 發（${fmtN(Math.round(ffStats[0][1]))} 傷害）<br>${n1} ${fmtN(ffStats[1][0])} 發（${fmtN(Math.round(ffStats[1][1]))} 傷害）</dd>${battleRules.ff === 2 ? `<dt>射界受阻停火</dt><dd>${n0} ${fmtN(ffHold[0])} 次<br>${n1} ${fmtN(ffHold[1])} 次</dd>` : ''}` : ''}</dl></div>
      <div class="g-card"><h3>各艦隊</h3><div class="g-pc" style="margin-bottom:4px">${n0}</div>${fl(0)}<div class="g-ec" style="margin:8px 0 4px">${n1}</div>${fl(1)}
        <dl class="kv" style="margin-top:10px"><dt>使用技能</dt><dd>${[...used(0), ...used(1)].join('<br>') || '無'}</dd></dl>
        <div class="g-dim" style="font-size:calc(12px * var(--ui));margin-top:8px">${m.watch ? 'AI 對戰觀摩' : '模擬室'}不計戰績、不給經驗，也不會上傳戰鬥紀錄。</div></div>
    </div>
    ${m.watch ? watchReportHtml(m, R) : ''}
    <div class="g-row" style="margin-top:14px"><button class="g-btn" id="sr-menu">單人戰鬥</button><span class="g-sp"></span>
      ${m.watch ? '<button class="g-btn" id="sr-replay">觀看回放</button><button class="g-btn" id="sr-sim" title="把這場的布局帶到模擬室：可以接管任一方，自己試試看">在模擬室接手</button><button class="g-btn" id="sr-edit">觀摩設定</button><button class="g-btn pri" id="sr-roll">再看一場（重新隨機）→</button>'
        : '<button class="g-btn" id="sr-replay">觀看回放</button><button class="g-btn" id="sr-again">同一個布局再打一次</button><button class="g-btn pri" id="sr-edit">回到編輯 →</button>'}</div>
  </div>`);
  gEl('sr-menu').onclick = showSingle;
  gEl('sr-replay').onclick = () => startReplay();
  const base = () => JSON.parse(JSON.stringify(SIM.base || SIM.m));
  if (m.watch) {
    gEl('sr-roll').onclick = () => watchGo(true);
    gEl('sr-sim').onclick = () => { const b = base(); b.watch = false; b.ctl = 0; b.name = '觀摩・' + b.name; showSim(b); };
    gEl('sr-edit').onclick = () => showWatch();
    return;
  }
  gEl('sr-again').onclick = () => { overlay(null); simEndMid(); SIM.m = base(); simStart(); };
  gEl('sr-edit').onclick = () => showSim(base());
}

// ═══════════════════════ AI 對戰觀摩 ═══════════════════════
// 選雙方 AI 的難度、打法、艦隊類型，產生一個模擬室布局（雙方都由 AI 指揮，m.watch）照正式規則開打；玩家只能看。
// 戰鬥中左側面板即時顯示每支艦隊的 AI 判斷（aiThink 寫在 f.aiS.note），戰後報告附上打法重點與簡單分析。
const WATCH_STORE = 'fleet.watch2';   // 2：預設改成全隨機
const WATCH_TAC = ['push', 'kite', 'flank', 'breakthrough'];
// 難度 → 指揮官等級（決定特性加成與技能數，同無限戰場的敵軍）
const WATCH_LV = [
  { name: '難度 1', cl: 2, desc: '只照偏好的打法行動，不會反制。' },
  { name: '難度 2', cl: 5, desc: '會反制：被包抄或損失加速時開「鐵壁」或「機動迴避」、轉向迎擊側背、「集中火力」打最弱的分艦隊、進入射程開「極速射擊」、遠了就「突進」。' },
  { name: '難度 3', cl: 8, desc: '難度 2 的反制，再加上針對：對手紡錘陣衝來就改凹形陣包夾；被遠距離消耗就改成逼近突進；接敵前「干擾」對手變陣。' },
  { name: '難度 4', cl: 11, desc: '難度 3 的全部，再加上：被包抄就改圓陣、脫離後換回；射程內優先打航母和快被打垮的分艦隊。' },
  { name: '難度 5', cl: 14, desc: '難度 4 的全部，再加上：各艦隊協同集中打同一處；後段看戰損調整打法（領先就拉開距離拖時間，落後就全力進攻）。' },
];
const WATCH_TIPS = {
  push: '看它停在中距離維持陣線：主砲只打前方，正面對射拚的是火力與陣型寬度。對付它可以從側翼繞過去，或拉開距離消耗。',
  kite: '看它被逼近就後退、一直待在戰列艦射程邊緣：用速度快的艦隊或「衝鋒」貼上去，它的距離優勢就沒了。',
  flank: '看牽制與包抄的分工：第一艦隊在正面拖住，其他艦隊繞到側面（側背受擊傷害較高）。被繞側時要轉向或開「鐵壁」。',
  breakthrough: '看紡錘陣集中衝擊一點、穿過去再掉頭：用凹形陣兩翼包夾，或側移讓它衝空。',
};
const WATCH_PRESETS = [
  { name: '全隨機', desc: '規模、難度、打法、艦隊類型與數量都隨機（每一場都不一樣）', s: [{ lv: -1, tac: 'rand', arch: -1, n: -1 }, { lv: -1, tac: 'rand', arch: -1, n: -1 }], size: -1 },
  { name: '難度 1 vs 難度 3', desc: '同樣正面推進，看反制差多少', s: [{ lv: 0, tac: 'push', arch: 0, n: 2 }, { lv: 2, tac: 'push', arch: 0, n: 2 }] },
  { name: '推進 vs 消耗', desc: '重砲陣線對上飛彈艦隊拉距離', s: [{ lv: 1, tac: 'push', arch: 1, n: 2 }, { lv: 1, tac: 'kite', arch: 4, n: 2 }] },
  { name: '推進 vs 包抄', desc: '一支牽制、一支繞側', s: [{ lv: 1, tac: 'push', arch: 0, n: 2 }, { lv: 1, tac: 'flank', arch: 3, n: 2 }] },
  { name: '推進 vs 突破', desc: '紡錘陣直衝陣線中央', s: [{ lv: 1, tac: 'push', arch: 1, n: 2 }, { lv: 1, tac: 'breakthrough', arch: 3, n: 2 }] },
  { name: '突破 vs 難度 3', desc: '看高難度 AI 怎麼用凹形陣反制', s: [{ lv: 0, tac: 'breakthrough', arch: 3, n: 2 }, { lv: 2, tac: 'push', arch: 0, n: 2 }] },
  { name: '難度 3 vs 難度 5', desc: '同樣的打法，看圓陣反制、選目標與協同集火的差別', s: [{ lv: 2, tac: 'flank', arch: 0, n: 3 }, { lv: 4, tac: 'flank', arch: 0, n: 3 }], size: 1 },
];
const watchTacName = (t) => (t === 'rand' ? '隨機' : TACTICS[t].name);
const watchTacDesc = (t) => TACTICS[t].desc.replaceAll('玩家', '對手');   // 打法說明原本是寫給敵方 AI 的
const watchLvName = (lv) => (lv < 0 ? '難度隨機' : WATCH_LV[lv].name);
const WATCH_RANDOM = () => JSON.parse(JSON.stringify(WATCH_PRESETS[0].s));   // 預設：全隨機

function watchOpts() {
  let o = null; try { o = JSON.parse(STORE.getItem(WATCH_STORE) || 'null'); } catch (e) { o = null; }
  o = Object.assign({ size: -1, terr: 3, seed: 0, s: WATCH_RANDOM() }, o || {});
  if (o.size !== -1 && !RAND_SIZES[o.size]) o.size = -1; if (!RAND_TERR[o.terr]) o.terr = 3;
  if (!Array.isArray(o.s) || o.s.length !== 2) o.s = WATCH_RANDOM();
  for (const s of o.s) {
    if (!(s.lv >= -1 && s.lv < WATCH_LV.length)) s.lv = -1;
    if (s.tac !== 'rand' && !TACTICS[s.tac]) s.tac = 'rand';
    if (!(s.arch >= -1 && s.arch < CAMP_ARCHETYPES.length)) s.arch = -1;
    if (!(s.n === -1 || s.n >= 1 && s.n <= 3)) s.n = -1;
  }
  if (!o.seed) o.seed = randSeed();
  return o;
}
function watchSave(o) { try { STORE.setItem(WATCH_STORE, JSON.stringify(o)); } catch (e) { /* 只在本次有效 */ } }
function watchSummary() {
  const o = watchOpts();
  if (o.size < 0 && o.s.every((s) => s.lv < 0 && s.tac === 'rand' && s.arch < 0 && s.n < 0)) return '全隨機：每一場都不一樣';
  return o.s.map((s) => `${watchLvName(s.lv)}・${watchTacName(s.tac)}`).join('　vs　'); }

// 設定 → 模擬室布局（同一組設定＋種子＝同一場）
function watchLayout(o) {
  const R = mulberry32(campHash(o.seed, o.size + 1, o.terr, 77));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const S = RAND_SIZES[o.size >= 0 ? o.size : Math.floor(R() * RAND_SIZES.length)];
  let st = RAND_TERR[o.terr].st; if (st == null) st = R() < 0.15 ? -1 : Math.floor(R() * 15);
  const m = { name: '', fac: 0, victory: true, ctl: -1, watch: true, seed: campHash(o.seed, o.size + 1, 5) % 100000, fleets: [], terrain: st < 0 ? [] : campTerrain(R, st), sides: [] };
  const names = CAMP_NAMES.slice();
  o.s.forEach((sd, side) => {
    const li = sd.lv < 0 ? Math.floor(R() * WATCH_LV.length) : sd.lv, L = WATCH_LV[li].cl, tac = sd.tac === 'rand' ? pick(WATCH_TAC) : sd.tac;
    const nF = sd.n < 0 ? 1 + Math.floor(R() * S.maxFleets) : Math.max(1, Math.min(S.maxFleets, sd.n));
    m.sides.push({ lv: li, tac });
    for (let k = 0; k < nF; k++) {
      const A = sd.arch >= 0 ? CAMP_ARCHETYPES[sd.arch] : pick(CAMP_ARCHETYPES);
      const per = A.mix.reduce((s, x, t) => s + x * SHIP_TYPES[t].cost, 0), n = S.budget / nF / per;
      const comp = A.mix.map((x) => Math.round(n * x / 10) * 10);
      const t = tac === 'flank' && nF >= 2 && k === 0 ? 'push' : tac;   // 包抄：第一艦隊在正面牽制，其他繞側
      const skills = [], nSk = Math.min(3, 1 + Math.floor(L / 4));
      while (skills.length < nSk) { const s = pick(L >= 5 ? CAMP_SKILLS : CAMP_SKILLS.slice(0, 3)); if (!skills.includes(s)) skills.push(s); }
      const cn = names.splice(Math.floor(R() * names.length), 1)[0] || '指揮官';
      m.fleets.push({ side, name: `第${SIM_CN[k]}艦隊（${A.name}）`, cmdr: { base: null, name: cn, title: '', trait: pick(['dmg', 'shield', 'speed']), level: L, mode: 'lv', tal: {}, skills },
        comp, hangar: HANGAR_DEFAULT.slice(), formation: tac === 'breakthrough' ? 'spindle' : pick(A.formations), orderly: false, layers: 1,
        x: nF === 1 ? 0 : Math.round(-380 + 760 * k / (nF - 1)), z: side ? -360 : 360, y: 0, h: side ? 0 : Math.PI,
        ai: { tactic: t, level: li + 1 }, reserve: false, at: 60 });
    }
  });
  m.name = `${S.name}・` + m.sides.map((s) => `${WATCH_LV[s.lv].name}・${TACTICS[s.tac].name}`).join(' vs ');
  return m;
}
function watchGo(reroll) {
  const o = watchOpts(); if (reroll) o.seed = randSeed(); watchSave(o);
  simEndMid(); overlay(null);
  SIM.m = watchLayout(o); SIM.sel = null;
  camAnim = null; view.target.x = 0; view.target.z = 0; view.height = 1500; view.yaw = 0; view.pitch = ELEV; updateCamera();
  simStart();
}

// ───── 設定畫面 ─────
function showWatch() {
  const o = watchOpts();
  setPhase('briefing'); GAME.watch = false;
  const seg = (attr, list, cur) => `<div class="wed-seg rd-seg" ${attr}>${list.map(([v, n]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const sideCard = (sd, side) => `<div class="g-card wt-side"><h3 class="${side ? 'g-ec' : 'g-pc'}">${FACTION_NAME[side]}</h3>
    <dl class="kv rd-opts">
      <dt>AI 難度</dt><dd>${seg(`data-ws="${side}:lv"`, [...WATCH_LV.map((l, i) => [i, l.name]), [-1, '隨機']], sd.lv)}<div class="g-dim">${sd.lv < 0 ? '開戰時隨機決定' : WATCH_LV[sd.lv].desc}</div></dd>
      <dt>打法</dt><dd>${seg(`data-ws="${side}:tac"`, [...WATCH_TAC.map((k) => [k, TACTICS[k].name]), ['rand', '隨機']], sd.tac)}<div class="g-dim">${sd.tac === 'rand' ? '開戰時隨機決定' : `${watchTacDesc(sd.tac)}<br>觀戰重點：${WATCH_TIPS[sd.tac]}`}</div></dd>
      <dt>艦隊類型</dt><dd>${seg(`data-ws="${side}:arch"`, [...CAMP_ARCHETYPES.map((a, i) => [i, a.name]), [-1, '隨機']], sd.arch)}<div class="g-dim">${sd.arch < 0 ? '每支艦隊隨機' : `編成比例 航母／戰列／巡洋／驅逐／護衛＝${CAMP_ARCHETYPES[sd.arch].mix.map((x) => Math.round(x * 100)).join('／')}%`}</div></dd>
      <dt>艦隊數</dt><dd>${seg(`data-ws="${side}:n"`, [[1, '1 支'], [2, '2 支'], [3, '3 支'], [-1, '隨機']], sd.n)}<div class="g-dim">雙方總兵力（點數）相同，平均分給各艦隊；小型最多 2 支</div></dd>
    </dl></div>`;
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>AI 對戰觀摩</h2><span class="crumb">雙方都由 AI 指揮・即時解說・不計戰績</span><span class="g-sp"></span><button class="g-btn" id="wt-back">← 單人戰鬥</button></div>
    <div class="g-card" style="margin-bottom:12px"><h3>快速組合</h3><div class="wt-presets">${WATCH_PRESETS.map((p, i) => `<button class="g-btn wt-pre" data-pre="${i}"><b>${p.name}</b><small>${p.desc}</small></button>`).join('')}</div></div>
    <div class="intel-grid">${o.s.map(sideCard).join('')}</div>
    <div class="g-card" style="margin-top:12px"><h3>戰場</h3><dl class="kv rd-opts">
      <dt>規模</dt><dd>${seg('data-wo="size"', [...RAND_SIZES.map((s, i) => [i, s.name]), [-1, '隨機']], o.size)}<div class="g-dim">${o.size < 0 ? '每一場隨機' : `每一方 ${fmtN(RAND_SIZES[o.size].budget)} 點兵力`}</div></dd>
      <dt>地形</dt><dd>${seg('data-wo="terr"', RAND_TERR.map((s, i) => [i, s.name]), o.terr)}</dd>
      <dt>規則</dt><dd>${opSeg('wt-op')}<div class="g-dim">${OP_LEVELS[opLevel()].desc}（與單人戰鬥共用；觀摩時不會鎖在艦橋）</div></dd>
      <dt>觀看方式</dt><dd class="g-dim">左側面板顯示每支艦隊 AI 目前的判斷，點名稱鏡頭會跳過去；技能與反制也會出現在通知裡。不能下令；滑鼠左鍵拖曳＝移動畫面、右鍵拖曳＝調整視角（3D）、滾輪＝縮放，也可以暫停、調速度、切 2D／3D、開戰術面板。打完可以看回放，或把這場帶到模擬室自己接手。</dd>
    </dl></div>
    <div class="g-row" style="margin-top:12px"><button class="g-btn" id="wt-reset" title="所有選項改回隨機">全部改回隨機</button><span class="g-dim" style="font-size:calc(12px * var(--ui))">每一場都會重新隨機：標成「隨機」的選項、戰場地形、指揮官與編成細節</span><span class="g-sp"></span><button class="g-btn pri" id="wt-go">開始觀摩 →</button></div></div>`);
  gEl('wt-reset').onclick = () => { o.s = WATCH_RANDOM(); o.size = -1; o.terr = 3; keep(); };
  gEl('wt-back').onclick = showSingle;
  gEl('wt-go').onclick = () => watchGo(true);
  bindOpSeg('wt-op', showWatch);
  const keep = () => { const y = gEl('game').scrollTop; watchSave(o); showWatch(); gEl('game').scrollTop = y; };
  document.querySelectorAll('[data-pre]').forEach((b) => (b.onclick = () => { const p = WATCH_PRESETS[+b.dataset.pre]; o.s = JSON.parse(JSON.stringify(p.s)); if (p.size != null) o.size = p.size; keep(); }));
  document.querySelectorAll('[data-ws]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    const [side, key] = g.dataset.ws.split(':'), v = b.dataset.v;
    o.s[+side][key] = key === 'tac' ? v : +v; keep();
  })));
  document.querySelectorAll('[data-wo]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => { o[g.dataset.wo] = +b.dataset.v; keep(); })));
}

// ───── 戰鬥中的解說面板 ─────
function watchHud() {
  let el = gEl('watchbar');
  if (!GAME.watch) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement('div'); el.id = 'watchbar'; document.body.appendChild(el);
  // 面板每 0.15 秒重畫，用 pointerdown 才不會被重畫吃掉點擊
  el.onpointerdown = (e) => {
    e.stopPropagation();
    if (e.target.closest('.wb-h')) { el.classList.toggle('min'); return; }
    const b = e.target.closest('[data-wf]'); if (!b) return;
    const f = fleets.find((o) => o.id === +b.dataset.wf), c = f && centerOf(fleetAlive(f));
    if (c) { camAnim = null; view.target.x = c.x; view.target.z = c.z; updateCamera(); }
  };
}
function watchFrame() {
  const el = gEl('watchbar'); if (!el) return;
  { const h = gEl('hud'), r = h && getComputedStyle(h).display !== 'none' ? h.getBoundingClientRect() : null; const top = r && r.height ? r.bottom + 8 : 70; el.style.top = top + 'px'; el.style.maxHeight = `calc(100vh - ${top + 90}px)`; }   // 放在左上角資訊欄的下面
  const m = SIM.m, side = (s) => {
    const info = m.sides && m.sides[s], col = FACTION[SIDE_FAC[s]].ui;
    const rows = fleets.filter((f) => f.side === s).map((f) => {
      const n = sumA(f.sqs.map((q) => q.alive)), g = fleetGroup(f), dead = n <= 0;
      const note = dead ? '全滅' : f.reserve ? '尚未出場' : (f.aiS && f.aiS.note) || '觀察戰場中…';
      return `<button class="wb-f ${dead ? 'dead' : ''}" data-wf="${f.id}"><span class="wb-t"><b>${escH(f.name)}</b><span>${Math.round(n / Math.max(1, f.initial) * 100)}%</span></span>
        <small>${f.ai ? `${TACTICS[f.ai.tactic].name}・難度 ${f.ai.level}` : ''}${g && FORMATIONS[g.formation] ? `・${FORMATIONS[g.formation].name}` : ''}・${escH(f.commander ? f.commander.name : '')}</small><i>${escH(note)}</i></button>`;
    }).join('');
    return `<div class="wb-side"><div class="wb-sn" style="color:${col}">${FACTION_NAME[SIDE_FAC[s]]}${info ? `<span>${WATCH_LV[info.lv].name}・${TACTICS[info.tac].name}</span>` : ''}</div>${rows}</div>`;
  };
  el.innerHTML = `<div class="wb-h"><b>AI 即時判斷</b><span class="g-dim">點這裡收合</span></div><div class="wb-body">${side(0)}${side(1)}</div>`;
}

// ───── 戰後：打法重點與簡單分析 ─────
function watchReportHtml(m, R) {
  const nm = (s) => simSideName(m, s), lines = [], loser = R.kind === 'win' ? 1 : R.kind === 'lose' ? 0 : -1;
  for (const s of [0, 1]) {
    const d = dmgStats[s], tot = sumA(d), sp = tot > 0 ? (d[1] + d[2]) / tot : 0;
    if (sp > 0.35) lines.push(`${nm(s)} 有 ${Math.round(sp * 100)}% 的損失來自側面或背後${s === loser ? '：被繞側、被穿透後沒有及時轉向，是吃虧的主因之一。' : '（側背受擊傷害較高，贏了也付出不少代價）。'}`);
    const sk = fleets.filter((f) => f.side === s).reduce((a, f) => a + Object.values(f.skills).reduce((b, x) => b + (x.used || 0), 0), 0);
    lines.push(`${nm(s)} 一共用了 ${sk} 次技能。`);
  }
  if (R.kind === 'win' || R.kind === 'lose') {
    const w = R.kind === 'win' ? 0 : 1, info = m.sides && m.sides[w];
    if (info) lines.unshift(`<b>${nm(w)}（${WATCH_LV[info.lv].name}・${TACTICS[info.tac].name}）獲勝</b>，剩餘兵力 ${Math.round(R.ratio[w] * 100)}%。`);
  }
  const card = (s) => { const info = m.sides && m.sides[s]; if (!info) return ''; return `<div class="g-card"><h3 class="${s ? 'g-ec' : 'g-pc'}">${nm(s)}：${WATCH_LV[info.lv].name}・${TACTICS[info.tac].name}</h3>
    <div style="line-height:1.65">${watchTacDesc(info.tac)}<br><span class="g-dim">AI 等級：${WATCH_LV[info.lv].desc}</span><br>觀戰重點：${WATCH_TIPS[info.tac]}</div></div>`; };
  return `<div class="g-card" style="margin-top:12px"><h3>這場的重點</h3><div style="line-height:1.7">${lines.join('<br>')}</div></div>
    <div class="intel-grid" style="margin-top:12px">${card(0)}${card(1)}</div>`;
}


// ═══════════════════════ 多人戰鬥：內網 1 對 1＋觀戰 ═══════════════════════
// 大廳 → 房間（房主選規模、地形、操作難度、速度）→ 各自編成、部署 → 雙方準備好就開戰 → 戰後報告
// 同步方式：鎖步。伺服器每一回合（NET.K 個 tick）把收到的命令廣播出來，每個瀏覽器用同樣的種子、規則、開局，
// 照同樣的命令各自跑模擬（見 main.js 的 issue／frame）。雙方定期互比戰局指紋，不一樣就提示不同步。
// 多人的指揮官只有初始的幾位，等級與天賦另外存（fleet.pvpcmdrs）；功勳算進單人的星際酒館。
const MP_SIZES = [
  { name: '小型', budget: 2400, maxFleets: 2, time: 360 },
  { name: '中型', budget: 3600, maxFleets: 3, time: 480 },
  { name: '大型', budget: 5000, maxFleets: 3, time: 600 },
];
const MP_SPEEDS = [0.5, 1, 2, 4];   // 與伺服器一致
const MP_ZONES = [DEPLOY_ZONE, { x0: -520, x1: 520, z0: -420 - ZONE_SHIFT, z1: -170 - ZONE_SHIFT }];   // 第二方＝第一方的部署區轉 180°
const MP_HASH_EVERY = 120;   // 每 2 秒（模擬時間）互比一次戰局指紋
const MP_LO_STORE = 'fleet.pvplo';

// ───── 指揮官：進入多人畫面時換成多人用的（初始指揮官＋多人的等級天賦），離開時換回來 ─────
function pvpEnter() {
  if (GAME.pvp) return;
  GAME.pvp = { cmdrs: COMMANDERS.slice(), lo: GAME.loadout, sc: GAME.sc, talSel: GAME.talSel };
  COMMANDERS.length = 0; COMMANDERS.push(...COMMANDERS_BASE);
  CMDR_SAVE = loadCmdrs();
}
function pvpExit() {
  const p = GAME.pvp; if (!p) return;
  GAME.pvp = null;
  COMMANDERS.length = 0; COMMANDERS.push(...p.cmdrs);
  CMDR_SAVE = loadCmdrs();
  GAME.loadout = p.lo; GAME.sc = p.sc; GAME.talSel = p.talSel; GAME.playerSide = 0;
}

// ───── 連線 ─────
const netAct = (op, b = {}) => API.post('api/mp/act', { op, ...b });
async function netConnect() {
  if (NET.conn) return;
  const ctl = new AbortController(); NET.conn = ctl;
  try {
    const r = await fetch('api/mp/stream', { headers: API.headers(), signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    NET.online = true; mpStatus();
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) { try { netMsg(JSON.parse(line)); } catch (e) { console.warn('多人訊息處理失敗', e); } } }
    }
  } catch (e) { if (ctl.signal.aborted) return; }
  if (NET.conn !== ctl) return;
  NET.conn = null; NET.online = false; mpStatus();
  if (NET.want) setTimeout(() => { if (NET.want) netConnect(); }, 1500);   // 斷線：自動重連（戰鬥中重連後會從頭快轉追上）
}
function netClose() { NET.want = false; const c = NET.conn; NET.conn = null; NET.online = false; if (c) c.abort(); }
function mpStatus() { const e = gEl('mp-st'); if (e) { e.textContent = NET.online ? '● 已連線' : '○ 連線中…'; e.className = NET.online ? 'g-good' : 'g-warn'; } }
// 離開多人戰鬥（回主選單、單人戰鬥時呼叫）
function mpQuit() {
  if (!NET.want && !NET.conn && !NET.on) return;
  if (NET.room) netAct('leave').catch(() => {});
  netClose();
  NET.on = false; NET.spec = false; NET.room = null; NET.seat = -1; NET.screen = null; NET.chat = [];
}

function netMsg(m) {
  switch (m.t) {
    case 'hello': NET.me = m.me; break;
    case 'lobby':
      NET.lobby = m.rooms;
      if (NET.room) { NET.room = null; NET.seat = -1; if (NET.screen !== 'battle' && NET.screen !== 'report') showLobby(); }
      else if (NET.screen === 'lobby') showLobby();
      break;
    case 'room': {
      const first = !NET.room || NET.room.id !== m.room.id;
      NET.room = m.room; NET.seat = m.room.seats.findIndex((s) => s && s.id === (NET.me && NET.me.id));
      if (first) NET.chat = [];
      if (NET.screen === 'lobby' || NET.screen === 'room') showRoom();
      else if ((NET.screen === 'loadout' || NET.screen === 'deploy') && NET.seat < 0) showRoom();
      else if (NET.screen === 'loadout' && GAME.sc && JSON.stringify(m.room.opts) !== GAME.sc.optsKey) { toast('房主改了設定，請重新編成', 'hint'); mpGoLoadout(); }
      else if (NET.screen === 'deploy' && GAME.sc && JSON.stringify(m.room.opts) !== GAME.sc.optsKey) { toast('房主改了設定，請重新編成', 'hint'); fieldGroup.clear(); mpGoLoadout(); }
      break;
    }
    case 'left':
      NET.room = null; NET.seat = -1;
      if (NET.on) { NET.on = false; NET.spec = false; }
      showLobby(m.why);
      break;
    case 'kicked': NET.want = false; mpQuit(); showMenu(); gEl('mm-note').textContent = m.why; break;
    case 'start': netBegin(m.start, m.cmds, m.turn); break;
    case 'turn':
      if (!NET.on) break;
      if (m.c) for (const c of m.c) cmdQueue.push(c);   // 伺服器的順序就是執行順序（每個人都一樣）
      NET.bound = (m.n + 1) * NET.K;
      break;
    case 'desync': if (NET.on && !NET.desync) { NET.desync = true; toast(`連線不同步（tick ${m.tick}）：雙方看到的戰況可能不一樣了，結果以各自畫面為準`, 'bad'); } break;
    case 'note': toast(m.msg, 'hint'); break;
    case 'chat':
      NET.chat.push(m); if (NET.chat.length > 60) NET.chat.shift();
      if (NET.screen === 'room') mpChatDraw(); else toast(`${m.from}：${m.msg}`, 'hint');
      break;
  }
}

// ───── 房間設定 → 戰場 ─────
function mpScenario(o) {
  const S = MP_SIZES[o.size] || MP_SIZES[1];
  return { id: 'pvp', mp: true, sizeIdx: o.size, op: o.op, name: `多人對戰・${S.name}`, size: S.name, budget: S.budget, maxFleets: S.maxFleets, timeLimit: S.time, level: 1,
    seed: o.map, terrain: mpTerrain(o), enemy: [], events: [], intel: { accuracy: 1, hide: [] }, optsKey: JSON.stringify(o) };
}
// 地形：點對稱（轉 180° 一樣），雙方公平；巨大小行星不壓到任何一方的部署區
function mpTerrain(o) {
  const R = mulberry32(campHash(o.map, o.terr, 5));
  let st = RAND_TERR[o.terr] ? RAND_TERR[o.terr].st : null; if (st == null) st = R() < 0.15 ? -1 : Math.floor(R() * 15);
  if (st < 0) return [];
  const base = campTerrain(R, st), out = [];
  for (const t of base.slice(0, Math.ceil(base.length / 2))) {
    if (t.type === 'rock' && Math.abs(t.z) + t.r > 140) continue;
    out.push(t);
    if (Math.hypot(t.x, t.z) > t.r + 30) out.push({ ...t, x: -t.x, z: -t.z });
  }
  return out;
}
// 自己的編成（位置一律用第一方的座標）；預算不同時兵力等比例縮放
function mpLoadout(sc, faction) {
  let lo = NET.lo;
  if (!lo) { try { lo = JSON.parse(STORE.getItem(MP_LO_STORE) || 'null'); } catch (e) { lo = null; } }
  if (lo && lo.fleets && lo.fleets.length) {
    if (lo.budget !== sc.budget) {
      const k = sc.budget / (lo.budget || 1);
      for (const f of lo.fleets) f.comp = f.comp.map((n) => Math.floor(n * k / 10) * 10);
      for (const S of supplyList(lo)) S.comp = S.comp.map((n) => Math.floor(n * k / 10) * 10);
    }
  } else lo = defaultLoadout(sc, faction);
  lo.sc = 'pvp'; lo.budget = sc.budget; lo.fleets = lo.fleets.slice(0, sc.maxFleets);
  if ((lo.faction || 0) !== faction) { lo.faction = faction; for (const f of lo.fleets) f.cmdr = null; }
  fixLoadoutCmdrs(lo);
  if (!lo.fleets.length) lo.fleets = defaultLoadout(sc, faction).fleets;
  return (NET.lo = lo);
}
// 一方的艦隊（setup 格式）。第二方整個轉 180°。每支艦隊都帶「呼叫增援」（多人：每位指揮官每場 1 次，不用天賦、不扣酒館存量）
function mpSideFleets(lo, side, sc, preview) {
  const M = (p) => (side ? { x: -p.x, z: -p.z, h: (p.h || 0) + Math.PI } : { x: p.x, z: p.z, h: p.h || 0 });
  const out = [];
  lo.fleets.forEach((f, k) => {
    const c = COMMANDERS.find((o) => o.id === f.cmdr) || cmdrsOf(lo.faction || 0)[0] || COMMANDERS[0], P = M(f);
    const skills = commanderSkills(c.skills, cmdrTal(c.id)); if (!skills.includes('reinforce')) skills.push('reinforce');
    out.push({ side, name: `第${'一二三四'[k]}艦隊`, ax: P.x, az: P.z, ay: f.y || 0, h: P.h, formation: f.formation, orderly: !!f.orderly, layers: f.layers || 1, comp: f.comp.slice(), hangar: (f.hangar || HANGAR_DEFAULT).slice(),
      commander: { id: c.id, name: c.name, title: c.title, trait: c.trait, level: cmdrLevel(c.id), tal: { ...cmdrTal(c.id) }, skills } });
  });
  supplyList(lo).forEach((S, i) => { if (sumA(S.comp) > 0) { const P = M(S); out.push(supplySetup(side, { ...S, x: P.x, z: P.z, h: P.h }, S.follow >= 0 && S.follow < lo.fleets.length ? S.follow : -1, supplyName(i))); } });
  if (!preview) lo.fleets.forEach((f, k) => out.push({ side, name: `${out[k].name}增援`, ax: 0, az: side ? MAP_BOUNDS.z0 - 900 : MAP_BOUNDS.z1 + 900, ay: 0, h: side ? 0 : Math.PI,
    formation: f.formation, comp: reinforceComp(f.comp, sc.budget), commander: null, reserve: true, activateAt: null, reinfOf: k }));
  return out;
}
function mpPreviewSetup() {
  const sc = GAME.sc, lo = GAME.loadout, s = GAME.playerSide, fac = lo.faction || 0;
  return { bg: false, terrain: sc.terrain, fleets: mpSideFleets(lo, s, sc, true), scenario: 'pvp', timeLimit: sc.timeLimit, level: 1, factions: s ? [1 - fac, fac] : [fac, 1 - fac] };
}
// 開局：把雙方送來的艦隊合在一起（第二方的跟隨、增援序號往後移）。每個瀏覽器算出一樣的 setup
function mpComposeSetup(st) {
  const sc = mpScenario(st.opts), fl = [];
  st.sides.forEach((arr, s) => {
    const off = fl.length;
    for (const f of arr || []) {
      const g = { ...f, side: s };
      if (g.follow != null && g.follow >= 0) g.follow += off;
      if (g.reinfOf != null) g.reinfOf += off;
      fl.push(g);
    }
  });
  return { bg: false, pvp: true, terrain: sc.terrain, fleets: fl, scenario: 'pvp', timeLimit: sc.timeLimit, level: 1, factions: st.factions.slice(), op: st.opts.op, names: st.names.slice() };
}
const mpNames = () => (battleSetup && battleSetup.names) || (NET.start && NET.start.names) || ['第一方', '第二方'];
function mpSideName(s) { return `${FACTION_NAME[SIDE_FAC[s]].slice(0, 2)}・${mpNames()[s]}${s === GAME.playerSide && !NET.spec ? '（你）' : ''}`; }
// 勝負是以第一方的角度記的；第二方看的時候反過來
function mpPersp(R, side) {
  if (!side) return { ...R };
  const sw = (s) => String(s || '').replace(/我軍|敵軍|我方|敵方/g, (w) => ({ 我軍: '敵軍', 敵軍: '我軍', 我方: '敵方', 敵方: '我方' })[w]);
  return { ...R, kind: R.kind === 'win' ? 'lose' : R.kind === 'lose' ? 'win' : R.kind, why: sw(R.why), ratio: [R.ratio[1], R.ratio[0]], alive: R.alive && [R.alive[1], R.alive[0]] };
}
// 觀戰：用名字取代我軍／敵軍
function mpWhyNamed(why) { const n = mpNames(); return String(why || '').replace(/我軍|我方/g, n[0]).replace(/敵軍|敵方/g, n[1]); }

// ───── 大廳 ─────
function showMulti() {
  pvpEnter();
  NET.want = true; netConnect();
  if (NET.room) showRoom(); else showLobby();
}
function mpOptsText(o) { return `${(MP_SIZES[o.size] || {}).name}・地形${(RAND_TERR[o.terr] || {}).name}・${OP_LEVELS[o.op].name}難度・×${MP_SPEEDS[o.speed]}`; }
function showLobby(msg) {
  NET.screen = 'lobby'; NET.on = false;
  setPhase('briefing'); fieldGroup.clear();
  const st = { wait: '等待中', battle: '戰鬥中' };
  const rows = NET.lobby.map((r) => { const full = r.players.every(Boolean); return `<tr><td><b>${escH(r.name)}</b></td><td>${st[r.state] || r.state}</td><td>${r.players.map((p) => (p ? escH(p) : '<span class="g-dim">空位</span>')).join(' vs ')}${r.specs ? `<span class="g-dim">　觀戰 ${r.specs}</span>` : ''}</td><td class="g-dim">${mpOptsText(r.opts)}</td>
    <td class="rec-act">${r.state !== 'battle' && !full ? `<button class="g-btn sm pri" data-join="${r.id}">加入</button>` : ''}<button class="g-btn sm" data-spec="${r.id}">觀戰</button></td></tr>`; }).join('');
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>多人戰鬥</h2><span class="crumb">內網 1 對 1・可以觀戰</span><span id="mp-st"></span><span class="g-sp"></span><button class="g-btn" id="mp-back">← 主選單</button></div>
    ${msg ? `<div class="g-card g-warn" style="margin-bottom:12px">${escH(msg)}</div>` : ''}
    <div class="g-card" style="margin-bottom:12px"><div class="g-row"><span class="g-dim">開新房間</span><input class="g-in" id="mp-name" maxlength="30" placeholder="${escH(API.name())} 的房間"><button class="g-btn pri" id="mp-new">開房間</button>
      <span class="g-sp"></span><button class="g-btn" id="mp-cmdr">多人指揮官（等級與天賦）</button></div>
      <p class="g-dim" style="margin:8px 0 0;font-size:calc(12px * var(--ui))">房主選規模、地形、操作難度與速度；雙方用一樣的預算各自編成、部署，都按「準備」就開戰。戰鬥中不能暫停。多人只能派初始指揮官，等級與天賦和單人分開計算；打完照樣得到功勳（星際酒館用）。</p></div>
    <div class="g-card"><h3>房間</h3>${NET.lobby.length ? `<table class="stat-tbl mp-tbl"><tr><th>房間</th><th>狀態</th><th>玩家</th><th>設定</th><th></th></tr>${rows}</table>` : '<p class="g-dim">目前沒有房間。開一個，等內網的其他玩家加入。</p>'}</div>
  </div>`);
  mpStatus();
  gEl('mp-back').onclick = showMenu;
  gEl('mp-cmdr').onclick = () => showCommanders(() => showLobby());
  gEl('mp-new').onclick = () => netAct('create', { name: gEl('mp-name').value.trim() || undefined }).catch((e) => toast('開房間失敗：' + e.message));
  document.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => netAct('join', { room: b.dataset.join }).catch((e) => toast(e.message))));
  document.querySelectorAll('[data-spec]').forEach((b) => (b.onclick = () => netAct('join', { room: b.dataset.spec, spec: true }).catch((e) => toast(e.message))));
}

// ───── 房間 ─────
function mpMinimap(sc, side) {
  const W = 360, Hh = 260, B = MAP_BOUNDS, mx = (x) => (x - B.x0) / (B.x1 - B.x0) * W, mz = (z) => (z - B.z0) / (B.z1 - B.z0) * Hh, sx = W / (B.x1 - B.x0);
  const rect = (r, c) => `<rect x="${mx(r.x0)}" y="${mz(r.z0)}" width="${mx(r.x1) - mx(r.x0)}" height="${mz(r.z1) - mz(r.z0)}" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-opacity=".7" stroke-dasharray="4 3"/>`;
  let s = `<svg class="minimap" viewBox="0 0 ${W} ${Hh}">${rect(MP_ZONES[0], side === 1 ? '#7cc4ff' : '#f2b35a')}${rect(MP_ZONES[1], side === 1 ? '#f2b35a' : '#7cc4ff')}`;
  for (const t of sc.terrain) s += `<circle cx="${mx(t.x)}" cy="${mz(t.z)}" r="${t.r * sx}" fill="#${TERRAIN_TYPES[t.type].color.toString(16).padStart(6, '0')}" fill-opacity=".25"/>`;
  return s + `<text x="6" y="${Hh - 6}" fill="#8592a8" font-size="10">${side >= 0 ? '橘框＝你的部署區' : '下方＝第一方、上方＝第二方'}　地形點對稱</text></svg>`;
}
function showRoom() {
  const r = NET.room; if (!r) { showLobby(); return; }
  NET.screen = 'room'; NET.on = false;
  setPhase('briefing'); fieldGroup.clear();
  const me = NET.me && NET.me.id, host = r.host === me, k = NET.seat, sc = mpScenario(r.opts), mine = k >= 0 ? r.seats[k] : null;
  const seg = (key, arr, lbl) => `<div class="wed-seg rd-seg mp-opt ${host ? '' : 'ro'}" data-opt="${key}">${arr.map((a, i) => `<button data-v="${i}" class="${r.opts[key] === i ? 'on' : ''}" ${host ? '' : 'disabled'}>${lbl ? lbl(a) : a.name}</button>`).join('')}</div>`;
  const seat = (s, i) => s ? `<div class="mp-seat ${s.ready ? 'rdy' : ''}"><div class="g-dim">${i ? '第二方（上方）' : '第一方（下方）'}${r.host === s.id ? '　★房主' : ''}</div>
      <b>${escH(s.name)}${s.id === me ? '（你）' : ''}</b><span class="${s.faction ? 'g-all' : 'g-emp'}">${FACTION_NAME[s.faction]}</span>
      <span class="${s.ready ? 'g-good' : 'g-dim'}">${s.ready ? '✓ 已準備' : '編成中…'}</span>${s.online ? '' : '<span class="g-warn">斷線</span>'}</div>`
    : `<div class="mp-seat empty"><div class="g-dim">${i ? '第二方（上方）' : '第一方（下方）'}</div><span class="g-dim">空位・等待玩家加入</span>${k < 0 && r.state !== 'battle' ? '<button class="g-btn sm pri" data-sit="1">坐這裡</button>' : ''}</div>`;
  const R = r.result;
  const last = R ? `<div class="g-dim" style="margin-top:8px">上一場：${R.kind === 'draw' ? '平手' : `${escH((R.names || [])[R.kind === 'win' ? 0 : 1] || '')} 獲勝`}（${escH(mpWhyNamedWith(R.why, R.names))}）</div>` : '';
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>${escH(r.name)}</h2><span class="crumb">${r.state === 'battle' ? '戰鬥中' : '等待雙方準備'}</span><span id="mp-st"></span><span class="g-sp"></span><button class="g-btn" id="rm-leave">← 離開房間</button></div>
    <div class="intel-grid">
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="g-card"><h3>玩家</h3><div class="mp-seats">${seat(r.seats[0], 0)}<span class="mp-vs">VS</span>${seat(r.seats[1], 1)}</div>
          <div class="g-dim" style="margin-top:6px">觀戰：${r.specs.length ? r.specs.map(escH).join('、') : '沒有'}</div>${last}</div>
        <div class="g-card"><h3>戰場設定${host ? '' : '<span class="g-dim" style="font-weight:normal">（房主決定）</span>'}</h3>
          <dl class="kv rd-opts"><dt>規模</dt><dd>${seg('size', MP_SIZES)}<div class="g-dim">預算 ${fmtN(sc.budget)} 點・最多 ${sc.maxFleets} 支艦隊・${Math.round(sc.timeLimit / 60)} 分鐘</div></dd>
          <dt>地形</dt><dd>${seg('terr', RAND_TERR)}${host ? '<button class="g-btn sm" id="rm-reroll" style="margin-left:6px">⟳ 換一張地圖</button>' : ''}</dd>
          <dt>操作難度</dt><dd>${seg('op', OP_LEVELS)}<div class="g-dim">${OP_LEVELS[r.opts.op].desc}</div></dd>
          <dt>速度</dt><dd>${seg('speed', MP_SPEEDS, (v) => '×' + v)}<div class="g-dim">戰鬥中不能暫停、不能調速度</div></dd>
          <dt>勝負</dt><dd>對方損失超過 75% 就潰走；時間到依雙方損失比例判定</dd>
          <dt>增援</dt><dd>每位指揮官每場可以呼叫 1 次增援（本場預算的 25%），不用天賦、不扣酒館的次數</dd></dl></div>
        ${mine ? `<div class="g-card"><h3>你的艦隊</h3><div class="g-row"><span class="g-dim">陣營</span><div class="wed-seg" id="rm-fac"><button data-f="0" class="${mine.faction === 0 ? 'on emp' : ''}" ${mine.ready ? 'disabled' : ''}>帝國軍</button><button data-f="1" class="${mine.faction === 1 ? 'on all' : ''}" ${mine.ready ? 'disabled' : ''}>聯盟軍</button></div>
            <span class="g-dim" style="font-size:calc(12px * var(--ui))">雙方可以同陣營</span><span class="g-sp"></span><button class="g-btn sm" id="rm-cmdr">多人指揮官</button></div>
          <div class="g-row" style="margin-top:10px">${mine.ready ? '<span class="g-good">✓ 已準備，等待對手…</span><span class="g-sp"></span><button class="g-btn" id="rm-unready">取消準備</button>' : '<span class="g-dim">編成、部署好之後按「部署完成・準備」</span><span class="g-sp"></span><button class="g-btn" id="rm-spec">改去觀戰</button><button class="g-btn pri" id="rm-go">編成與部署 →</button>'}</div></div>`
    : `<div class="g-card"><h3>觀戰中</h3><p class="g-dim">開戰後就能看到雙方的戰況（看得到全部、不能下令）。${r.state === 'battle' ? '戰鬥正在進行，加入時會快轉追上目前的進度。' : ''}</p></div>`}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="g-card"><h3>戰場環境</h3>${mpMinimap(sc, k)}<div style="margin-top:8px;font-size:calc(12.5px * var(--ui))">${sc.terrain.length ? [...new Set(sc.terrain.map((t) => t.type))].map((x) => `<div><b>${TERRAIN_TYPES[x].name}</b>：<span class="g-dim">${TERRAIN_TYPES[x].desc}</span></div>`).join('') : '<span class="g-dim">開闊宙域，沒有地形影響。</span>'}</div></div>
        <div class="g-card"><h3>聊天</h3><div class="mp-chat" id="rm-chat"></div><div class="g-row" style="margin-top:6px"><input class="g-in" id="rm-msg" maxlength="200" placeholder="說點什麼…（Enter 送出）" style="flex:1"><button class="g-btn sm" id="rm-send">送出</button></div></div>
      </div>
    </div></div>`);
  mpStatus(); mpChatDraw();
  gEl('rm-leave').onclick = () => netAct('leave').catch((e) => toast(e.message));
  if (host) {
    document.querySelectorAll('.mp-opt').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => netAct('opts', { opts: { ...r.opts, [g.dataset.opt]: +b.dataset.v } }).catch((e) => toast(e.message)))));
    gEl('rm-reroll').onclick = () => netAct('opts', { opts: r.opts, reroll: true }).catch((e) => toast(e.message));
  }
  document.querySelectorAll('[data-sit]').forEach((b) => (b.onclick = () => netAct('sit', {}).catch((e) => toast(e.message))));
  if (mine) {
    gEl('rm-fac').onclick = (e) => { const f = e.target.dataset.f; if (f != null && +f !== mine.faction && !mine.ready) mpFaction(+f); };
    gEl('rm-cmdr').onclick = () => showCommanders(() => showRoom());
    if (gEl('rm-unready')) gEl('rm-unready').onclick = () => netAct('seat', { ready: false }).catch((e) => toast(e.message));
    if (gEl('rm-spec')) gEl('rm-spec').onclick = () => netAct('sit', { spec: true }).catch((e) => toast(e.message));
    if (gEl('rm-go')) gEl('rm-go').onclick = mpGoLoadout;
  }
  const send = () => { const el = gEl('rm-msg'), v = el.value.trim(); if (!v) return; el.value = ''; netAct('chat', { msg: v }).catch((e) => toast(e.message)); };
  gEl('rm-send').onclick = send;
  gEl('rm-msg').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); };
}
function mpWhyNamedWith(why, names) { const n = names || ['第一方', '第二方']; return String(why || '').replace(/我軍|我方/g, n[0]).replace(/敵軍|敵方/g, n[1]); }
function mpChatDraw() {
  const el = gEl('rm-chat'); if (!el) return;
  el.innerHTML = NET.chat.length ? NET.chat.map((c) => `<div><b>${escH(c.from)}</b>：${escH(c.msg)}</div>`).join('') : '<span class="g-dim">還沒有訊息</span>';
  el.scrollTop = el.scrollHeight;
}
function mpFaction(f) {
  netAct('seat', { faction: f }).catch((e) => toast(e.message));
  if (NET.lo && (NET.lo.faction || 0) !== f) { NET.lo.faction = f; for (const fl of NET.lo.fleets) fl.cmdr = null; fixLoadoutCmdrs(NET.lo); }
}
// 編成：沿用單人的編成畫面（多人的指揮官、房主的預算）
function mpGoLoadout() {
  const r = NET.room; if (!r || NET.seat < 0) { showRoom(); return; }
  NET.screen = 'loadout';
  const sc = mpScenario(r.opts), fac = r.seats[NET.seat].faction || 0;
  GAME.sc = sc; GAME.intel = { fleets: [], events: [], acc: 1 }; GAME.playerSide = NET.seat;
  GAME.loadout = mpLoadout(sc, fac);
  showLoadout();
}
async function mpReady() {
  const sc = GAME.sc, lo = GAME.loadout, r = NET.room;
  if (!r || NET.seat < 0) { showLobby(); return; }
  applyOp(sc.op); opts.fire = true; opts.advance = false;   // 規則：開戰時就生效（記進回放）
  const rules = Object.fromEntries(SIM_RULES.map((k) => [k, opts[k]]));
  try { STORE.setItem(MP_LO_STORE, JSON.stringify(lo)); } catch (e) { /* 只在本次 */ }
  try { await netAct('seat', { ready: true, faction: lo.faction || 0, lo: mpSideFleets(lo, NET.seat, sc, false), rules, optsKey: sc.optsKey }); }
  catch (e) { toast('準備失敗：' + e.message); return; }
  fieldGroup.clear(); clearSelection();
  if (NET.screen !== 'battle') showRoom();
}

// ───── 戰鬥 ─────
function netBegin(st, cmds, turn) {
  pvpEnter();
  NET.start = st; NET.K = st.K; NET.speed = st.speed; NET.spec = NET.seat < 0; NET.desync = false; NET.ended = false; NET.lag = false; NET.out.length = 0;
  NET.screen = 'battle'; NET.on = true;
  const sc = mpScenario(st.opts); sc.name = `多人對戰・${st.names[0]} vs ${st.names[1]}`;
  GAME.sc = sc; GAME.playerSide = NET.spec ? 0 : NET.seat; GAME.watch = false; GAME.recView = false; GAME.attempt = 0;
  overlay(null); fieldGroup.clear();
  GAME.op = st.opts.op; Object.assign(opts, st.rules);   // 規則：用第一方送來的（雙方一樣）
  newBattle(st.seed, mpComposeSetup(st));
  GAME.init = [sideAlive(0), sideAlive(1)];
  GAME.result = null; GAME.reportShown = false; GAME.replaying = false; GAME.replayEnd = null; GAME.skillArm = null; GAME.xp = null; GAME.mpR = null; GAME.merit = 0; GAME.log = []; GAME.simCtl = null;
  for (const c of cmds) cmdQueue.push({ ...c });
  NET.bound = (turn + 1) * NET.K;
  gEl('battlehud').innerHTML = '';
  drawField(false);
  setPhase('battle'); setCmdSide(GAME.playerSide, false); clearSelection();
  paused = false; updateTimeUI();
  force3D(); if (GAME.op === 2 && !NET.spec) enterBridge();
  camAnim = null; view.target.x = 0; view.target.z = GAME.playerSide ? -300 : 300; view.height = 1250; if (mode3D) view.yaw = GAME.playerSide ? Math.PI : 0; updateCamera();
  if (!NET.spec && opts.fow && SETTINGS.autoScan === false) issue('autoscan', { on: false });
  const late = NET.bound > NET.K * 30;
  toast(NET.spec ? `觀戰：${st.names[0]} vs ${st.names[1]}${late ? '（快轉追上目前的進度…）' : ''}` : `${late ? '重新連上：快轉追上目前的進度…' : '多人對戰　開戰！'}（不能暫停；速度 ×${NET.speed}）`);
}
let _netOutT = 0;
function netCmd(c) {
  NET.out.push(c);
  if (!_netOutT) _netOutT = setTimeout(() => { _netOutT = 0; const list = NET.out.splice(0); if (list.length) netAct('cmd', { c: list }).catch((e) => toast('命令沒送出：' + e.message, 'bad')); }, 0);
}
// 每幀：照收到的回合推進；落後很多（中途加入、重連）就快轉
function netStep(dt) {
  if (GAME.result) { NET.lag = false; return; }
  const lag = NET.bound - simTick, catching = lag > NET.K * 30;
  simAcc += dt * NET.speed * (catching ? 40 : lag > NET.K * 3 ? 1.25 : 1);   // 稍微落後：加快一點追上
  const max = catching ? 400 : MAX_STEPS_PER_FRAME, t0 = performance.now();
  let n = 0;
  while (simAcc >= SIM_DT && n < max && simTick < NET.bound && !GAME.result) {
    stepSim(); simAcc -= SIM_DT; n++;
    if (!NET.spec && !catching && simTick % MP_HASH_EVERY === 0) { const tick = simTick, h = fullHash(); netAct('hash', { tick, h }).catch(() => {}); }
    if (catching && performance.now() - t0 > 30) break;
  }
  if (simTick >= NET.bound) { simAcc = Math.min(simAcc, SIM_DT); NET.lagT = (NET.lagT || 0) + dt; } else NET.lagT = 0;
  NET.lag = NET.lagT > 0.6;   // 等伺服器的下一回合等太久
  if (n >= max) simAcc = 0;
  // 沒有前進時不重算部隊位置：pushSquadronUniforms 會動到部隊狀態，多呼叫幾次可能和對方有微小差異
  if (GAME.result && !NET.ended) {
    NET.ended = true;
    const R = GAME.result;
    if (!NET.spec) netAct('end', { res: { kind: R.kind, why: R.why, tick: R.tick, ratio: R.ratio } }).catch(() => {});
  }
}
function mpQuitBattle(btn) {
  if (NET.spec) { netAct('leave').catch(() => {}); NET.on = false; NET.spec = false; showLobby(); return; }
  if (GAME.result) return;
  if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = '確定投降？'; setTimeout(() => { delete btn.dataset.sure; }, 3000); return; }
  delete btn.dataset.sure;
  netAct('surrender').catch((e) => toast(e.message));
}

// ───── 戰後報告（自己這一方的角度；觀戰用名字） ─────
function mpReport() {
  const live = NET.on || NET.screen === 'battle';
  NET.on = false; NET.screen = 'report';
  const R0 = GAME.result, spec = NET.spec && !GAME.recView, side = spec ? 0 : GAME.playerSide, names = mpNames();
  setPhase('report');
  const st0 = battleStats(), st = side ? { init: [st0.init[1], st0.init[0]], left: [st0.left[1], st0.left[0]] } : st0;
  if (!GAME.mpR || GAME.recView) { GAME.mpR = mpPersp(R0, side); GAME.mpR.retreat = !spec && R0.surrender === side; }   // 自己投降＝撤退（獎勵減半，太早投降沒有獎勵）
  const R = GAME.mpR;
  if (!GAME.xp && live && !spec && !GAME.recView) {
    const lv = (s) => { const l = fleets.filter((f) => f.side === s && f.commander).map((f) => f.commander.level || 1); return l.length ? Math.round(sumA(l) / l.length) : 1; };
    GAME.xp = awardXP(R, st);
    uploadRecord({ ...R, retreat: false }, st);   // 投降是命令，回放會自己重演，不用記結束的 tick
    GAME.merit = tavernAfterBattle(R, { random: true, sizeIdx: GAME.sc.sizeIdx || 0, enemyLevel: lv(1 - side), avgLevel: lv(side) });
  }
  const gains = GAME.xp || [];
  const label = spec ? (R.kind === 'draw' ? '平手' : `${escH(names[R.kind === 'win' ? 0 : 1])} 獲勝`) : { win: '勝利', lose: '敗北', draw: '平手' }[R.kind];
  const who = spec ? names.map(escH) : ['我軍', '敵軍'];
  const row = (t) => `<tr><td>${SHIP_TYPES[t].name}</td><td>${ships5(st.init[0][t])}</td><td>${ships5(st.init[0][t] - st.left[0][t])}</td><td>${ships5(st.init[1][t])}</td><td>${ships5(st.init[1][t] - st.left[1][t])}</td></tr>`;
  const inRoom = !!NET.room && !GAME.recView;
  overlay(`<div class="g-wrap">
    <div class="g-head"><h2>戰後報告</h2><span class="crumb">${escH(names[0])} vs ${escH(names[1])}　·　${OP_LEVELS[(battleSetup && battleSetup.op) || 0].name}難度　·　戰鬥時間 ${_fmtT(R.t)}</span></div>
    <div class="g-card" style="margin-bottom:12px;text-align:center"><p class="result ${spec ? 'draw' : R.kind}">${label}</p><div class="g-dim">${escH(spec ? mpWhyNamed(R.why) : R.why)}${R.retreat ? (rewardMul(R) ? '（投降：經驗與功勳減半）' : `（開戰 ${RETREAT_MIN_T} 秒內投降：不給經驗與功勳）`) : ''}</div>
      <div style="margin-top:6px">${who[0]}剩 ${Math.round(R.ratio[0] * 100)}%　·　${who[1]}剩 ${Math.round(R.ratio[1] * 100)}%</div>${NET.desync ? '<div class="g-warn" style="margin-top:6px">這場途中出現過不同步，雙方畫面的結果可能不一樣。</div>' : ''}</div>
    <div class="intel-grid">
      <div class="g-card"><h3>兵力損失（艘）</h3><table class="stat-tbl"><tr><th>艦種</th><th>${who[0]}出擊</th><th>${who[0]}損失</th><th>${who[1]}出擊</th><th>${who[1]}損失</th></tr>
        ${SHIP_TYPES.map((_, t) => t).filter((t) => t < N_COMBAT || st.init[0][t] + st.init[1][t] > 0).map(row).join('')}
        <tr><td><b>合計</b></td><td>${ships5(sumA(st.init[0]))}</td><td>${ships5(sumA(st.init[0]) - sumA(st.left[0]))}</td><td>${ships5(sumA(st.init[1]))}</td><td>${ships5(sumA(st.init[1]) - sumA(st.left[1]))}</td></tr></table></div>
      <div class="g-card"><h3>${spec || GAME.recView ? '指揮官' : '多人指揮官經驗'}</h3>${gains.length ? gains.map((g) => `<div style="margin-bottom:10px"><b>${g.f.commander.name}</b>（${g.f.name}，存活 ${Math.round(g.surv * 100)}%）
        <span class="g-good">+${g.xp} 經驗</span>${g.up ? `　<b class="g-emp">升到 Lv ${g.lv}！</b>` : `　Lv ${g.lv}`}${cmdrPoints(g.f.commander.id) > 0 ? `　<span class="tal-pts">可分配天賦 ${cmdrPoints(g.f.commander.id)} 點</span>` : ''}
        <div class="xpbar"><i style="width:${(cmdrXP(g.f.commander.id) % XP_PER_LEVEL) / XP_PER_LEVEL * 100}%"></i></div></div>`).join('')
        : fleets.filter((f) => f.commander && !f.reserve).map((f) => `<div>${escH(names[f.side])}：<b>${f.commander.name}</b> Lv ${f.commander.level}</div>`).join('')}
        ${GAME.merit ? `<div style="margin:6px 0"><b class="g-emp">+${GAME.merit} 功勳</b>　<span class="g-dim">算進單人的星際酒館（目前 ${fmtN(ROSTER.merit)}）</span></div>` : ''}</div>
    </div>
    <div class="g-row" style="margin-top:14px">${GAME.recView ? '<button class="g-btn" id="r-rec">← 戰鬥回放</button>' : `${inRoom ? '<button class="g-btn pri" id="r-room">回到房間 →</button>' : '<button class="g-btn" id="r-lobby">多人大廳</button>'}${spec ? '' : '<button class="g-btn" id="r-tal">多人指揮官天賦</button>'}`}<span class="g-sp"></span><button class="g-btn" id="r-replay">觀看回放</button></div>
  </div>`);
  if (GAME.recView) gEl('r-rec').onclick = () => { GAME.recView = false; showRecords(); };
  else {
    if (gEl('r-room')) gEl('r-room').onclick = () => (NET.room ? showRoom() : showLobby());
    if (gEl('r-lobby')) gEl('r-lobby').onclick = () => showMulti();
    if (gEl('r-tal')) gEl('r-tal').onclick = () => showCommanders(() => mpReport());
  }
  gEl('r-replay').onclick = () => { NET.screen = 'report'; startReplay(); };
}

// ───── 樣式 ─────
(() => {
  const s = document.createElement('style');
  s.textContent = `.mp-seats{display:flex;align-items:stretch;gap:10px}.mp-seat{flex:1;display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid rgba(140,160,200,.25);border-radius:8px}
  .mp-seat.rdy{border-color:rgba(110,220,140,.6)}.mp-seat.empty{border-style:dashed;opacity:.8}.mp-vs{align-self:center;font-weight:bold;opacity:.6}
  .mp-chat{height:160px;overflow:auto;font-size:calc(13px * var(--ui));line-height:1.5}.mp-opt.ro button{cursor:default}.mp-tbl td{vertical-align:middle}`;
  document.head.appendChild(s);
})();

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
function overlayGroups() { return groups.filter((g) => g.side === cmdSide && !g.inactive && g.sqs.some((q) => q.alive > 0 && !q.bg)); }

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
      <button class="g-btn sm" id="tac-fit" title="地圖自動對準部隊（滾輪縮放、拖曳平移後會改成手動）">⤢ 自動對焦</button><button class="g-btn sm" id="tac-pause"></button><button class="g-btn sm" id="tac-speed"></button><button class="g-btn sm" id="tac-close">關閉（Tab）</button></div>
    <div class="tac-body"><div class="tac-mapwrap"><div class="tac-mapbox"><canvas id="tac-map"></canvas>
        <div class="tac-pop" id="tac-pop" hidden></div></div>
      <div class="tac-svbox"><div class="tac-svbar"><span id="tac-svt"></span><button class="g-btn sm" id="tac-svfit" title="恢復自動縮放">⤢ 重設</button><button class="g-btn sm" id="tac-svaxis" title="切換側視的方向"></button></div><div class="tac-svcv"><canvas id="tac-sv"></canvas></div></div></div><div class="tac-side" id="tac-side"></div></div>`;
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
  const help = gEl('tac-help'); help.textContent = help.title = `左鍵：選艦隊／拖曳＝平移／按住＝指令輪盤　Shift＋左鍵拖曳：框選　滾輪：縮放　右鍵：移動（拖曳＝朝向）　${SETTINGS.queueMod}＋右鍵：加節點　節點：點＝陣型／刪除、拖曳＝改位置　${keyLabel(keyOf('attack'))}＋左鍵：指定攻擊`;
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
  const svt = gEl('tac-svt'); svt.textContent = svt.title = `${SV.axis === 'x' ? '側視・左右（從我方看過去）' : '側視・前後（從右側看：我方在左）'}　拖曳節點＝高度・拖曳把手＝仰角・滾輪＝縮放`;
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

// ═══════════════════════ 指揮官視角（旗艦艦橋） ═══════════════════════
// 鏡頭放在目前指揮艦隊的旗艦艦橋上，看艦首前方。滑鼠左右移動＝轉頭（游標越靠邊轉越多）：
//   往左看會滑出「戰況」視窗，往右看會滑出「各艦隊旗艦」子畫面（其他艦隊旗艦看到的畫面，點一下切過去）。
//   往下看＝戰術台（就是戰術面板）。艦橋上只能透過戰術台下令：戰場畫面上的點擊、命令快捷鍵都不作用。
// 純畫面功能：不影響模擬，也不進命令紀錄。只有 3D 模型能從艦橋看（2D 貼圖只有 30° 俯角）。
const BR_FOV = 55;                 // 垂直視角
const BR_FWD = -0.16;              // 平視時的俯角（往下一點：看得到自己艦首的主砲、副砲與前方戰場）
const BR_CON = -1.05;              // 低頭看戰術台
const BR_PMAX = 0.55, BR_PMIN = -1.15;
const BR_UP = 0.34, BR_BACK = 0.36; // 鏡頭在艦上的位置（艦長的倍數）：艦橋，略高略後
const BR_PANEL_YAW = { stat: -1.2, pip: 1.2 };   // 方位儀上標示懸浮視窗的方位（相對艦首，左負右正）
const BR_MOUSE_MAX = 1.75, BR_MOUSE_DEAD = 0.12;   // 游標在最邊緣＝轉 100°；中央 12% 不轉
const BR_WIN_OPEN = 0.75, BR_WIN_CLOSE = 0.35;      // 轉頭超過約 43° 滑出視窗，回到 20° 內收回
// 艦橋上被擋下的命令（要低頭看戰術台才能用）
const BR_CMD_KEYS = new Set(['orderly', 'attack', 'volley', 'missile', 'turn', 'area', 'scan']);
function bridgeBlocksKey(id) { return BR.on && bridgeConsoleK() < 0.9 && (id.startsWith('form_') || id.startsWith('skill_') || BR_CMD_KEYS.has(id)); }
Object.assign(BR, { on: false, el: null, fleet: null, fleetId: -1, ship: -1, shipFleet: null, shipH: null, pose: {},
  yaw: 0, pitch: BR_FWD, tYaw: 0, tPitch: BR_FWD, mYaw: 0, kYaw: 0, open: { stat: false, pip: false }, tp: null, closing: false, prev: null, lastIn: 0, acc: 1, pips: {}, pipRR: 0, fallback: {}, sig: '', pipSig: '' });
const _brV = new THREE.Vector3(), _brT = new THREE.Vector3();

function bridgeClampPitch(p) { return Math.max(BR_PMIN, Math.min(BR_PMAX, p)); }
function bridgeConsoleH() { return Math.round(Math.min(820, Math.max(340, innerHeight * 0.7))); }
function bridgeConsoleK() { const x = Math.max(0, Math.min(1, (-BR.pitch - 0.42) / (0.98 - 0.42))); return x * x * (3 - 2 * x); }
function bridgeFleets() { return fleets.filter((f) => f.side === GAME.playerSide && !f.reserve && fleetAlive(f).length); }

// 艦隊的旗艦；被擊沉時司令部移到存活的最大艦（戰列 → 巡洋 → 航母 → 驅逐 → 護衛）
function bridgeShip(f) {
  const fs = f.sqs.find((q) => q.flagship >= 0);
  if (fs && ships.alive[fs.flagship]) return fs.flagship;
  const c = BR.fallback[f.id]; if (c != null && ships.alive[c] && ships.sq[c] != null && squadrons[ships.sq[c]].fleet === f) return c;
  const pref = [1, 2, 0, 3, 4, 5]; let best = -1, br = 9;
  for (const q of fleetAlive(f)) for (const i of q.list) { if (!ships.alive[i]) continue; const r = pref.indexOf(ships.type[i]); if (r < br) { br = r; best = i; } }
  BR.fallback[f.id] = best; return best;
}
function bridgePose(i, out) {
  const sq = squadrons[ships.sq[i]], t = U.uTime.value, seed = shipGeo.getAttribute('aInfo').array[i * 4 + 3];
  shipWorldCPU(i, _brV);
  // 與 3D 模型相同的微幅漂浮，鏡頭才會黏在艦上
  out.x = _brV.x + Math.sin(t * 0.31 + seed * 17) * 0.25; out.y = _brV.y + Math.sin(t * 0.6 + seed * 40) * 0.35; out.z = _brV.z + Math.cos(t * 0.27 + seed * 23) * 0.25;
  out.h = ships.snOn[i] ? ships.snH[i] : visHeading(sq, t, ships.lag[i]);
  out.p = ships.snOn[i] ? 0 : (sq.p || 0);   // 3D：艦橋跟著陣型俯仰
  out.L = shipGeo.getAttribute('aScale').array[i] * TYPE_LEN3;
  out.hk = hullKey(i);
  return out;
}
// 艦橋在船體模型上的位置（船長的倍數，船頭＋z、上＋y）：沿中線往下打射線找上層建築，取最高那一段的最前緣、略高於屋頂
const BR_SPOT = {};
function bridgeSpot(hk) {
  if (BR_SPOT[hk]) return BR_SPOT[hk];
  const M = typeof getModel === 'function' ? getModel(hk) : null;
  if (!M) return { z: -BR_BACK, y: BR_UP };
  const mesh = new THREE.Mesh(M.lods[0]), rc = new THREE.Raycaster(), hs = [], dn = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
  for (let z = -0.45; z <= 0.2001; z += 0.01) {
    let h = -9;
    for (const x of [-0.015, 0, 0.015]) { o.set(x, 3, z); rc.set(o, dn); const hit = rc.intersectObject(mesh)[0]; if (hit) h = Math.max(h, hit.point.y); }
    if (h > -9) hs.push([z, h]);
  }
  if (!hs.length) return (BR_SPOT[hk] = { z: -BR_BACK, y: BR_UP });
  const sorted = hs.map((a) => a[1]).sort((a, b) => a - b), top = sorted[Math.floor(sorted.length * 0.9)], base = sorted[Math.floor(sorted.length * 0.3)];
  const tower = hs.filter(([, h]) => h >= base + (top - base) * 0.75);
  const front = tower.reduce((m, a) => (a[0] > m[0] ? a : m), tower[0]);
  return (BR_SPOT[hk] = { z: front[0] + 0.006, y: front[1] + 0.014 });
}
function placeBridgeCam(cam, P, h, yaw, pitch) {
  // 鏡頭在艦橋上（跟著船的航向與俯仰）；視線方向用平滑過的航向 h
  const S = bridgeSpot(P.hk || 'e1'), ph = P.h != null ? P.h : h, pp = P.p || 0, cp0 = Math.cos(pp), sp0 = Math.sin(pp);
  const Fx = Math.sin(ph) * cp0, Fy = sp0, Fz = Math.cos(ph) * cp0, Ux = -Math.sin(ph) * sp0, Uy = cp0, Uz = -Math.cos(ph) * sp0;
  cam.position.set(P.x + (Fx * S.z + Ux * S.y) * P.L, P.y + (Fy * S.z + Uy * S.y) * P.L, P.z + (Fz * S.z + Uz * S.y) * P.L);
  pitch += P.p || 0;
  const a = h - yaw, cp = Math.cos(pitch);   // yaw 正＝往畫面右邊轉（艦艇的 h 增加是往左轉）
  _brT.set(cam.position.x + Math.sin(a) * cp, cam.position.y + Math.sin(pitch), cam.position.z + Math.cos(a) * cp);
  cam.up.set(0, 1, 0); cam.lookAt(_brT);
}
function bridgeCamera(recompute = true) {
  if (BR.ship < 0 || !ships.alive[BR.ship]) { if (!BR.fleet) return; BR.ship = bridgeShip(BR.fleet); if (BR.ship < 0) return; }
  if (recompute || BR.pose.L == null) bridgePose(BR.ship, BR.pose);
  if (BR.shipH == null) BR.shipH = BR.pose.h;
  camera = camPersp;
  camPersp.aspect = VW / VH; camPersp.fov = BR_FOV; camPersp.near = 0.05; camPersp.far = 7000;
  placeBridgeCam(camPersp, BR.pose, BR.shipH, BR.yaw, BR.pitch);
  camPersp.updateProjectionMatrix();
  CAM_DIR.set(-Math.sin(BR.shipH - BR.yaw) * Math.cos(BR.pitch), -Math.sin(BR.pitch), -Math.cos(BR.shipH - BR.yaw) * Math.cos(BR.pitch));
  renderPass.camera = camera;
  // 其他地方（箭頭大小、背景）用到 view：給個合理的值
  view.target.set(BR.pose.x + Math.sin(BR.shipH) * 200, 0, BR.pose.z + Math.cos(BR.shipH) * 200); view.height = 160;
}

// ── 進入／離開／切換 ──
function toggleBridge() {
  if (BR.on) { if (opNow() === 2) { toast('擬真難度：作戰中只能使用指揮官模式'); return; } exitBridge(); }   // 擬真：不能離開艦橋
  else enterBridge();
}
function enterBridge(f) {
  if (!(GAME.phase === 'battle' || GAME.phase === 'replay') || GAME.result) { toast('指揮官視角只能在作戰中使用'); return false; }
  const list = bridgeFleets(); if (!list.length) return false;
  if (!f) { const sf = [...selected].map((q) => q.fleet).filter(Boolean); f = sf.length && sf.every((x) => x === sf[0]) && list.includes(sf[0]) ? sf[0] : list[0]; }
  const wasTac = TAC.open && !BR.on;
  if (!BR.on) BR.prev = { mode3D, x: view.target.x, z: view.target.z, h: view.height, yaw: view.yaw, pitch: view.pitch };
  if (wasTac) closeTac();               // 下方的戰術面板 → 改成艦橋的戰術台
  cancelDrag(); closeRadial(); if (aim) cancelAim();   // 進艦橋前的拖曳、輪盤一律作廢
  BR.on = true;
  if (!mode3D) setRenderMode('3d', false);   // 艦橋只能用 3D 模型（不改變玩家存的 2D／3D 偏好）
  camAnim = null;
  buildBridge(); BR.el.hidden = false; document.body.classList.add('bridge-on');
  BR.tYaw = BR.yaw = BR.mYaw = BR.kYaw = 0; BR.tPitch = BR.pitch = wasTac ? BR_CON : BR_FWD;
  bridgeSwitch(f, true);
  resize();
  return true;
}
function bridgeSwitch(f, quiet) {
  BR.fleet = f; BR.fleetId = f.id; BR.ship = bridgeShip(f); BR.shipFleet = f; BR.shipH = null; BR.pose = {};
  BR.sig = ''; BR.pipSig = ''; BR.acc = 1;
  if (BR.el) { const fl = BR.el.querySelector('.br-flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on'); }
  if (!quiet) toast(`切換到 ${f.name} 旗艦艦橋`);
}
function exitBridge() {
  if (!BR.on) return;
  if (TAC.open) { BR.closing = true; closeTac(); BR.closing = false; }
  BR.on = false; if (BR.el) BR.el.hidden = true;
  document.body.classList.remove('bridge-on', 'br-console', 'tac-console');
  const p = BR.prev || { mode3D, x: 0, z: 0, h: 560, yaw: view.yaw, pitch: view.pitch };
  view.target.set(p.x, 0, p.z); view.height = p.h; view.yaw = p.yaw; view.pitch = p.pitch;
  if (!p.mode3D && mode3D) setRenderMode('2d', !!p.persist);
  updateCamera(); resize();
}

// ── 轉頭 ──
function bridgeTouched() { BR.lastIn = performance.now(); }
function bridgeLookPx(dx, dy) { const rpp = BR_FOV * Math.PI / 180 / VH; BR.kYaw += dx * rpp; BR.tPitch = bridgeClampPitch(BR.tPitch - dy * rpp); bridgeTouched(); }
function bridgeWheel(d) {   // d > 0：往下捲＝低頭
  bridgeTouched();
  if (d > 0) BR.tPitch = BR.tPitch < -0.45 ? BR_CON : Math.max(BR_CON, BR.tPitch - d * 1.6);
  else BR.tPitch = BR.tPitch <= -0.45 ? -0.3 : bridgeClampPitch(BR.tPitch - d * 1.6);
  if (d > 0 && BR.tPitch < -0.5) BR.tPitch = BR_CON;     // 低到一半就直接看向戰術台
}
function bridgeKeys(dt) {
  const ys = 1.7 * dt, ps = 1.2 * dt; let k = false;
  if (keyHeld('cam_left') || keyHeld('cam_yaw_l')) { BR.kYaw -= ys; k = true; }
  if (keyHeld('cam_right') || keyHeld('cam_yaw_r')) { BR.kYaw += ys; k = true; }
  if (keyHeld('cam_up') || keyHeld('cam_pitch_up')) { BR.tPitch = bridgeClampPitch(BR.tPitch + ps); k = true; }
  if (keyHeld('cam_down') || keyHeld('cam_pitch_dn')) { BR.tPitch = bridgeClampPitch(BR.tPitch - ps); k = true; }
  if (k) bridgeTouched();
}
function bridgeLook(yaw, pitch) { if (yaw != null) BR.kYaw = wrapAngle(yaw - BR.mYaw); if (pitch != null) BR.tPitch = pitch; bridgeTouched(); }
function bridgeToggleConsole() { bridgeLook(null, BR.tPitch < -0.45 ? BR_FWD : BR_CON); }
// 滑鼠：游標的水平位置＝轉頭角度（中央不轉，越靠邊轉越多）。看著戰術台時不轉（游標要拿來操作）
function bridgeMouseX(x) {
  if (bridgeConsoleK() > 0.01) return;
  const c = (x - VW / 2) / (VW / 2), u = Math.max(0, Math.min(1, (Math.abs(c) - BR_MOUSE_DEAD) / (1 - BR_MOUSE_DEAD)));
  BR.mYaw = Math.sign(c) * BR_MOUSE_MAX * Math.pow(u, 1.15);
}
// 戰場畫面上的指標：只用來轉頭（觸控＝拖曳轉頭），不下令
function bridgePointer(type, e) {
  if (e.pointerType === 'touch') {
    if (type === 'down') BR.tp = { id: e.pointerId, x: e.clientX, y: e.clientY };
    else if (type === 'move' && BR.tp && BR.tp.id === e.pointerId) { bridgeLookPx(-(e.clientX - BR.tp.x), -(e.clientY - BR.tp.y)); BR.tp.x = e.clientX; BR.tp.y = e.clientY; }
    else if (type === 'up') BR.tp = null;
    return;
  }
  if (type === 'move') bridgeMouseX(e.clientX);
  else if (type === 'down' && bridgeConsoleK() < 0.5 && (e.button === 0 || e.button === 2)) bridgeNoCmd();
}
// 滑鼠移到畫面最下緣＝低頭看戰術台；看著戰術台時移到最上緣＝抬頭（Tab、滾輪照舊可用）
addEventListener('pointermove', (e) => {
  if (!BR.on || e.pointerType === 'touch' || settingsOpen()) return;
  const H = innerHeight, k = bridgeConsoleK();
  if (k < 0.5 && BR.tPitch > -0.45 && e.clientY >= H - Math.max(14, H * 0.035)) bridgeLook(null, BR_CON);
  else if (k > 0.9 && e.clientY <= Math.max(14, H * 0.03)) bridgeLook(null, BR_FWD);
});
let _brNoCmdT = 0;
function bridgeNoCmd() { const n = performance.now(); if (n - _brNoCmdT < 2500) return; _brNoCmdT = n; toast(`艦橋上要低頭看戰術台才能下令（滑鼠移到畫面最下方／滾輪往下／${keyLabel(keyOf('tactical'))}）`, 'hint'); }

// ── 每幀 ──
function bridgeFrame(dt) {
  if (!BR.on) return;
  if (!(GAME.phase === 'battle' || GAME.phase === 'replay')) { exitBridge(); return; }
  if (!fleets.includes(BR.fleet)) { BR.fleet = fleets.find((f) => f.id === BR.fleetId) || null; BR.ship = -1; BR.fallback = {}; BR.pips = {}; }
  if (!BR.fleet || !fleetAlive(BR.fleet).length) {
    const nf = bridgeFleets()[0];
    if (!nf) { exitBridge(); return; }
    if (BR.fleet) toast(`${BR.fleet.name}已全滅，指揮權移至 ${nf.name}`, 'bad');
    bridgeSwitch(nf, true);
  }
  const i = bridgeShip(BR.fleet);
  if (i !== BR.ship) {
    if (BR.ship >= 0 && BR.shipFleet === BR.fleet && !ships.alive[BR.ship]) toast(`旗艦被擊沉！司令部移至${SHIP_TYPES[ships.type[i]].name}`, 'bad');
    BR.ship = i; BR.shipFleet = BR.fleet;
  }
  bridgePose(i, BR.pose);
  BR.shipH = BR.shipH == null ? BR.pose.h : BR.shipH + wrapAngle(BR.pose.h - BR.shipH) * Math.min(1, dt * 4);
  // 停在低頭一半的位置太久：自動看向戰術台或抬回來
  if (performance.now() - BR.lastIn > 350 && BR.tPitch < -0.45 && BR.tPitch > BR_CON + 0.01) BR.tPitch = BR.tPitch < -0.7 ? BR_CON : -0.32;
  const a = Math.min(1, dt * 9);
  BR.kYaw = wrapAngle(BR.kYaw); BR.tYaw = BR.mYaw + BR.kYaw;
  BR.yaw = wrapAngle(BR.yaw + wrapAngle(BR.tYaw - BR.yaw) * a); BR.pitch += (BR.tPitch - BR.pitch) * a;
  bridgeCamera(false);
  bridgeConsole();
  bridgeHud(dt);
}
function bridgeConsole() {
  const k = bridgeConsoleK();
  if (k > 0.01 && !TAC.open) openTac();
  if (k <= 0.01 && TAC.open) { BR.closing = true; closeTac(); BR.closing = false; }
  if (TAC.open && TAC.el) {
    TAC.el.style.transform = k >= 0.995 ? 'none' : `perspective(1400px) translateY(${((1 - k) * 75).toFixed(2)}%) rotateX(${((1 - k) * 38).toFixed(2)}deg)`;
    TAC.el.style.opacity = Math.min(1, k * 1.6).toFixed(3);
    TAC.el.classList.toggle('br-live', k > 0.9);   // 看到底才能操作（傾斜中點擊位置不準）
  }
  document.body.classList.toggle('br-console', k > 0.5);
}

// ── 艦橋介面：方位儀、懸浮視窗、操作列 ──
function buildBridge() {
  if (BR.el) return;
  const el = document.createElement('div'); el.id = 'bridge'; el.hidden = true;
  el.innerHTML = `<div class="br-vig"></div><div class="br-glass"></div><div class="br-flash"></div>
    <div class="br-rig" id="br-rig">
      <svg class="br-frame" id="br-frame" aria-hidden="true"></svg>
      <div class="br-canopy">
        <div class="br-force me"><span>我軍</span><b id="br-p0"></b><div class="br-bar me"><i id="br-b0"></i></div></div>
        <div class="br-title" id="br-title"></div>
        <div class="br-force en"><div class="br-bar en"><i id="br-b1"></i></div><b id="br-p1"></b><span>敵軍</span></div>
      </div>
      <div class="br-notch"><div class="br-compass" id="br-compass"><div class="br-ticks"></div><div class="br-marks"></div><div class="br-cur"></div></div></div>
      <div class="br-dash" id="br-dash">
        <div class="br-dp br-dl" id="br-dl"></div>
        <div class="br-dc" id="br-dc"></div>
        <div class="br-dp br-dr"><div class="br-clock"><b id="br-time"></b><span id="br-tl">剩餘時間</span></div>
          <div class="br-ctl"><button class="br-key" data-act="pause" id="br-pause"></button><button class="br-key" data-act="speed" id="br-speed"></button><button class="br-key" data-act="set" title="設定">設定</button>
            <button class="br-key" data-act="exit" id="br-exit"></button><button class="br-key warn" data-act="quit" id="br-quit"></button></div></div>
        <button class="br-tab" data-act="con" id="br-tab"><span id="br-tabt"></span><small id="br-tabk"></small></button>
      </div>
    </div>
    <div class="br-win" id="br-stat"><div class="br-wh"><b>戰況</b><span class="g-sp"></span><button class="br-pin" data-pin="stat" title="固定在畫面上">📌</button></div><div class="br-wb" id="br-stat-b"></div></div>
    <div class="br-win" id="br-pip"><div class="br-wh"><b>各艦隊旗艦</b><span class="br-sub">點一下切換艦橋</span><span class="g-sp"></span><button class="br-pin" data-pin="pip" title="固定在畫面上">📌</button></div><div class="br-wb" id="br-pip-b"></div></div>
    <div class="br-hint" id="br-hint"></div>`;
  document.body.appendChild(el);
  BR.el = el; BR.wStat = el.querySelector('#br-stat'); BR.wPip = el.querySelector('#br-pip');
  BR.ticks = el.querySelector('.br-ticks'); BR.marks = el.querySelector('.br-marks'); BR.rig = el.querySelector('#br-rig'); BR.frameWH = '';
  // 方位刻度：每 15°
  for (let d = -165; d <= 180; d += 15) {
    const t = document.createElement('i'); t.dataset.a = d;
    t.className = d % 45 ? 'm' : 'M';
    t.textContent = d === 0 ? '艦首' : d === 180 ? '艦尾' : d === -90 ? '左舷' : d === 90 ? '右舷' : d % 45 ? '' : Math.abs(d) + '';
    BR.ticks.appendChild(t);
  }
  // 按鈕：用 pointerdown，內容每 0.25 秒更新也點得到
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-act],[data-pin],[data-pf]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.act) {
      const A = b.dataset.act;
      if (A === 'con') bridgeToggleConsole();
      else if (A === 'exit') exitBridge();
      else if (A === 'pause') togglePause();
      else if (A === 'speed') setSpeed((speedIdx + 1) % SPEEDS.length);
      else if (A === 'set') openSettings();
      else if (A === 'quit') { const q = gEl('bh-quit'); if (q && q.onclick) q.onclick(); }
    } else if (b.dataset.pin) { SETTINGS.brPins[b.dataset.pin] = !SETTINGS.brPins[b.dataset.pin]; saveSettings(); }
    else if (b.dataset.pf) { const f = fleets[+b.dataset.pf]; if (f && fleetAlive(f).length) bridgeSwitch(f); }
  });
  el.addEventListener('wheel', (e) => { if (e.target.closest('.br-wb')) return; e.preventDefault(); bridgeWheel(Math.sign(e.deltaY) * 0.12); }, { passive: false });
}
// 艦橋框架（參考圖：天花板與燈條、大片觀景窗的窗框、前方的戰術桌、兩側的乘員席）
// 窗框、燈條固定在艦上：轉頭時會掃過畫面（照視角投影）；天花板、戰術桌邊緣固定在畫面上
const BR_POSTS = [-2.6, -1.9, -1.2, -0.5, 0.5, 1.2, 1.9, 2.6];   // 窗柱的方位（相對艦首，右正）
const BR_LAMPS = [-1.55, -0.85, -0.25, 0.25, 0.85, 1.55];                     // 天花板燈的方位
function bridgeFrameSVG() {
  const W = VW, H = VH, narrow = W < 760, cx = W / 2;
  const ceil = Math.round(Math.max(44, Math.min(84, H * 0.095))), nw = Math.min(560, Math.max(300, W * 0.42)), nd = 46, sl = 26;
  const dh = Math.round((narrow ? 96 : 116) * (SETTINGS.uiScale || 1.2)), tw = narrow ? 150 : 190, st = Math.min(150, W * 0.12);
  BR.notchW = nw; BR.frameWH = W + 'x' + H + 'x' + SETTINGS.uiScale;BR.ceil = ceil; BR.dh = dh; BR.lastDyn = '';
  const el = BR.el; el.style.setProperty('--pw', (narrow ? 12 : 26) + 'px'); el.style.setProperty('--dh', dh + 'px'); el.style.setProperty('--nw', nw + 'px'); el.style.setProperty('--ceil', ceil + 'px');
  const X = 60, Y = 260, P = (pts) => pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  // 天花板：中央凹進去放方位儀；下緣有一排通風格柵
  const ceilP = [[-X, -Y], [W + X, -Y], [W + X, ceil], [cx + nw / 2 + sl, ceil], [cx + nw / 2, ceil + nd], [cx - nw / 2, ceil + nd], [cx - nw / 2 - sl, ceil], [-X, ceil]];
  const ceilRim = [[-X, ceil], [cx - nw / 2 - sl, ceil], [cx - nw / 2, ceil + nd], [cx + nw / 2, ceil + nd], [cx + nw / 2 + sl, ceil], [W + X, ceil]];
  let ribs = ''; for (let x = 0; x < W; x += 46) if (Math.abs(x - cx) > nw / 2 + sl + 10) ribs += `<line x1="${x}" y1="${ceil * 0.35}" x2="${x + 18}" y2="${ceil - 3}" class="rib"/>`;
  // 戰術桌：前緣是一條橘色光帶；中央凸起的把手＝低頭看戰術台；兩端是乘員席（小螢幕亮著）
  const ty = H - dh;
  const table = [[-X, ty + 18], [st, ty + 18], [st + 26, ty], [cx - tw / 2 - 24, ty], [cx - tw / 2, ty - 8], [cx + tw / 2, ty - 8], [cx + tw / 2 + 24, ty], [W - st - 26, ty], [W - st, ty + 18], [W + X, ty + 18], [W + X, H + Y], [-X, H + Y]];
  const glow = [[st + 26, ty], [cx - tw / 2 - 24, ty], [cx - tw / 2, ty - 8], [cx + tw / 2, ty - 8], [cx + tw / 2 + 24, ty], [W - st - 26, ty]];
  const stn = (x0, s) => { const x1 = x0 + s * st; return `<polygon points="${P([[x0, H + Y], [x0, ty - 6], [x0 + s * st * 0.82, ty - 22], [x1, ty + 18], [x1, H + Y]])}" class="stn"/>
      <polygon points="${P([[x0 + s * 14, ty - 2], [x0 + s * st * 0.38, ty - 12], [x0 + s * st * 0.38, ty + 8], [x0 + s * 14, ty + 14]])}" class="scr b"/>
      <polygon points="${P([[x0 + s * st * 0.44, ty - 13], [x0 + s * st * 0.76, ty - 20], [x0 + s * st * 0.76, ty + 2], [x0 + s * st * 0.44, ty + 7]])}" class="scr o"/>`; };
  gEl('br-frame').innerHTML = `<defs>
      <linearGradient id="brCeil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080f"/><stop offset=".7" stop-color="#0d1626"/><stop offset="1" stop-color="#16233a"/></linearGradient>
      <linearGradient id="brTable" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2438"/><stop offset=".12" stop-color="#0c1322"/><stop offset="1" stop-color="#04070d"/></linearGradient>
      <linearGradient id="brPost" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#060a12"/><stop offset=".5" stop-color="#1a2539"/><stop offset="1" stop-color="#070b14"/></linearGradient>
      <filter id="brBloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>
    <g id="br-dyn"></g>
    <polygon points="${P(ceilP)}" fill="url(#brCeil)"/>${ribs}
    <polyline points="${P(ceilRim)}" class="rim"/><polyline points="${P(ceilRim.map(([x, y]) => [x, y - 4]))}" class="rim2"/>
    <g id="br-lamps"></g>
    <polygon points="${P(table)}" fill="url(#brTable)"/>
    <polyline points="${P(glow)}" class="tglow" filter="url(#brBloom)"/><polyline points="${P(glow)}" class="tedge"/>
    ${stn(-1, 1)}${stn(W + 1, -1)}`;
  gEl('br-frame').setAttribute('viewBox', `0 0 ${W} ${H}`); gEl('br-frame').setAttribute('width', W); gEl('br-frame').setAttribute('height', H);
}
// 每幀：窗柱、橫樑、天花板燈依目前視角投影（轉頭時掃過畫面）
function bridgeFrameDyn() {
  const W = VW, H = VH, key = BR.yaw.toFixed(4) + '|' + BR.frameWH; if (key === BR.lastDyn) return; BR.lastDyn = key;
  const f = (H / 2) / Math.tan(BR_FOV * Math.PI / 360), xOf = (r) => W / 2 + f * Math.tan(r);
  const top = BR.ceil - 2, bot = H - BR.dh + 4, tr = BR.ceil + Math.round((H - BR.ceil - BR.dh) * 0.2);
  let h = '';
  // 橫樑（上排小窗與下方大窗的分界）：只畫在窗柱之間（窗柱以外是側窗，一樣有）
  h += `<rect x="-60" y="${tr - 5}" width="${W + 120}" height="9" class="beam"/><line x1="-60" y1="${tr - 5}" x2="${W + 60}" y2="${tr - 5}" class="rim2"/>`;
  for (const pa of BR_POSTS) {
    const r = wrapAngle(pa - BR.yaw); if (Math.abs(r) > 1.25) continue;
    const x = xOf(r), c = Math.cos(r), wt = 16 + 10 * c, wb = 24 + 16 * c, lean = Math.sin(r) * 18;   // 越靠邊越斜、越窄
    if (x + wb < -40 || x - wb > W + 40) continue;
    h += `<polygon points="${(x - wt / 2 + lean).toFixed(1)},${top} ${(x + wt / 2 + lean).toFixed(1)},${top} ${(x + wb / 2).toFixed(1)},${bot} ${(x - wb / 2).toFixed(1)},${bot}" fill="url(#brPost)"/>
      <line x1="${(x + (r < 0 ? wt : -wt) / 2 + lean).toFixed(1)}" y1="${top}" x2="${(x + (r < 0 ? wb : -wb) / 2).toFixed(1)}" y2="${bot}" class="rim"/>`;
  }
  gEl('br-dyn').innerHTML = h;
  let l = '';
  for (const la of BR_LAMPS) {
    const r = wrapAngle(la - BR.yaw); if (Math.abs(r) > 1.2) continue;
    const x = xOf(r), w = 46 * Math.cos(r), red = Math.abs(la) > 1;   // 外側紅燈、內側藍燈（參考圖）
    l += `<rect x="${(x - w / 2).toFixed(1)}" y="${(BR.ceil * 0.42).toFixed(1)}" width="${w.toFixed(1)}" height="7" rx="1" class="lamp ${red ? 'r' : 'b'}" filter="url(#brBloom)"/><rect x="${(x - w / 2).toFixed(1)}" y="${(BR.ceil * 0.42).toFixed(1)}" width="${w.toFixed(1)}" height="7" rx="1" class="lamp ${red ? 'r' : 'b'}"/>`;
  }
  gEl('br-lamps').innerHTML = l;
}
const _brTW = (t) => { let w = 14; for (const ch of t) w += ch.charCodeAt(0) > 255 ? 11 : 6.2; return w; };   // 標記文字的大約寬度
const _brMin = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function bridgeBearing(x, z) {   // 相對艦首的方位（右正）與距離
  const c = camPersp.position; return [wrapAngle(BR.shipH - Math.atan2(x - c.x, z - c.z)), Math.hypot(x - c.x, z - c.z)];   // 右正，與轉頭方向一致
}
function bridgeHud(dt) {
  const el = BR.el; if (!el) return;
  const k = bridgeConsoleK();
  // 懸浮視窗：往左看滑出「戰況」、往右看滑出「各艦隊旗艦」（游標剛好在那一側，可以直接點）；📌＝一直顯示
  // 游標停在視窗上時不轉頭，所以視窗不會跑掉
  for (const key of ['stat', 'pip']) {
    const w = key === 'stat' ? BR.wStat : BR.wPip, pinned = !!SETTINGS.brPins[key], s = key === 'stat' ? -1 : 1, y = BR.tYaw * s;
    if (y > BR_WIN_OPEN) BR.open[key] = true; else if (y < BR_WIN_CLOSE) BR.open[key] = false;
    w.classList.toggle('open', k < 0.6 && (pinned || BR.open[key]));
  }
  // 艦橋框架：視窗尺寸變了就重畫；轉頭／低頭時整個框架稍微反向移動（頭在動、艦橋不動）
  if (BR.frameWH !== VW + 'x' + VH + 'x' + SETTINGS.uiScale) bridgeFrameSVG();
  bridgeFrameDyn();
  const px = -Math.max(-1, Math.min(1, BR.yaw)) * 16, py = Math.min(40, (BR.pitch - BR_FWD) * 170);
  BR.rig.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
  BR.rig.style.setProperty('--dash-op', Math.max(0, 1 - k * 2.2).toFixed(3));
  // 方位儀（在上方框架的凹口裡）
  const cw = BR.notchW - 36, span = 1.25, pxA = (cw / 2) / span;
  const cmp = el.querySelector('#br-compass'); cmp.style.width = cw + 'px'; cmp.hidden = !uiOn('compass');
  for (const t of BR.ticks.children) {
    const rel = wrapAngle(+t.dataset.a * Math.PI / 180 - BR.yaw);
    if (Math.abs(rel) > span) { t.style.display = 'none'; continue; }
    t.style.display = ''; t.style.transform = `translateX(${(cw / 2 + rel * pxA).toFixed(1)}px)`;
  }
  BR.acc += dt;
  if (BR.acc >= 0.25) { BR.acc = 0; bridgeHudSlow(cw, span, pxA); }
}
function bridgeHudSlow(cw, span, pxA) {
  const el = BR.el, t = U.uTime.value, fl = BR.fleet;
  const proxy = BR.ship >= 0 && BR.fleet.sqs.every((q) => q.flagship !== BR.ship);
  gEl('br-title').textContent = `${fl.name}旗艦艦橋${proxy ? '（代理旗艦）' : ''}`;
  gEl('br-tabt').textContent = bridgeConsoleK() > 0.5 ? '▲ 抬頭' : '▼ 戰術台';
  gEl('br-tabk').textContent = keyLabel(keyOf('tactical'));
  gEl('br-exit').textContent = `離開艦橋 ${keyLabel(keyOf('bridge'))}`;
  gEl('br-pause').textContent = paused ? '▶ 繼續' : '❚❚ 暫停'; gEl('br-pause').classList.toggle('lit', paused);
  gEl('br-speed').textContent = cmdSlowOn ? `×${effSpeed()} 下令中` : '×' + SPEEDS[speedIdx];
  gEl('br-quit').textContent = GAME.replaying ? '結束回放' : '撤退';
  gEl('br-time').textContent = timeLeftText(t); gEl('br-tl').textContent = GAME.replaying ? '回放中' : paused ? '暫停中' : battleSetup.timeLimit >= SIM_INF ? '模擬室' : '剩餘時間';
  gEl('br-hint').textContent = bridgeConsoleK() > 0.5 ? '' : `滑鼠左右移動＝轉頭（左：戰況　右：各艦隊旗艦）　下令：滑鼠移到最下方／滾輪往下／${keyLabel(keyOf('tactical'))} 低頭看戰術台`;
  BR.el.querySelectorAll('.br-pin').forEach((b) => b.classList.toggle('on', !!SETTINGS.brPins[b.dataset.pin]));
  // 方位儀標記：各艦隊、懸浮視窗
  const marks = [];
  for (const f2 of fleets) {
    if (f2.reserve) continue;
    let fogE = f2.side !== GAME.playerSide && pFiltered();   // 雷達受干擾：敵方方位停在最後已知位置、不顯示距離；戰爭迷霧：只標看得到的（其他＝最後已知）
    let al = fogE ? f2.sqs.map((q) => pSeen(q)).filter((q) => q && !q.bg && q.alive > 0) : fleetAlive(f2); if (!al.length) continue;
    if (fogE && fowView() && al.some((q) => !q.stale)) { al = al.filter((q) => !q.stale); fogE = false; }
    const C = centerOf(al), [a, d] = bridgeBearing(C.x, C.z);
    marks.push({ a, cls: f2.side === GAME.playerSide ? (f2 === fl ? 'me' : 'al') : 'en', txt: f2 === fl ? '' : fogE ? `${f2.name} ？` : `${f2.name} ${Math.round(d)}` });
  }
  // 戰爭迷霧：被敵方掃描到的方向（不知道距離）
  if (fowView()) for (const p of FOW.pings[GAME.playerSide]) {
    const f2 = fleets.find((o) => o.id === p.fleet), al = f2 ? fleetAlive(f2) : []; if (!al.length) continue;
    const C = centerOf(al), [a] = bridgeBearing(C.x + Math.sin(p.a) * 2000, C.z + Math.cos(p.a) * 2000);
    marks.push({ a, cls: 'en', txt: '⚠ 掃描訊號' });
  }
  marks.push({ a: BR_PANEL_YAW.stat, cls: 'pn', txt: '▣ 戰況' }, { a: BR_PANEL_YAW.pip, cls: 'pn', txt: '▣ 各艦隊旗艦' });
  // 太靠近的標記錯開成兩排；超出範圍的貼在兩端（加箭頭）
  const ms = [];
  for (const m of marks) {
    if (m.cls === 'me') continue;
    let rel = wrapAngle(m.a - BR.yaw), edge = '';
    if (rel > span * 0.86) { rel = span * 0.86; edge = '▶'; } else if (rel < -span * 0.86) { rel = -span * 0.86; edge = '◀'; }
    ms.push({ ...m, x: cw / 2 + rel * pxA, edge, w: _brTW(m.txt) });
  }
  // 貼在同一端的合併成一個
  for (const e of ['◀', '▶']) { const g = ms.filter((m) => m.edge === e); if (g.length > 1) { const t = g.map((m) => m.txt).join('・'); for (const m of g.slice(1)) ms.splice(ms.indexOf(m), 1); Object.assign(g[0], { txt: t, cls: g.some((m) => m.cls === 'en') ? 'en' : g[0].cls, w: _brTW(t), x: e === '◀' ? Math.max(g[0].x, _brTW(t) / 2 + 4) : Math.min(g[0].x, cw - _brTW(t) / 2 - 4) }); } }
  // 依重要性放：敵軍 → 友軍 → 視窗位置；兩排都放不下就不顯示（不重疊）
  const pri = { en: 0, al: 1, pn: 2 }; ms.sort((p, q) => pri[p.cls] - pri[q.cls] || Math.abs(p.x - cw / 2) - Math.abs(q.x - cw / 2));
  const rows = [[], []]; let mh = '';
  for (const m of ms) {
    const a0 = m.x - m.w / 2 - 3, a1 = m.x + m.w / 2 + 3;
    const r = rows.findIndex((row) => row.every(([b0, b1]) => a1 < b0 || a0 > b1)); if (r < 0) continue;
    rows[r].push([a0, a1]);
    mh += `<span class="mk ${m.cls} ${r ? 'r1' : ''}" style="left:${m.x.toFixed(1)}px">${m.edge === '◀' ? '◀ ' : ''}${m.txt}${m.edge === '▶' ? ' ▶' : ''}</span>`;
  }
  BR.marks.innerHTML = mh;
  // 戰況視窗
  const a0 = sideAlive(GAME.playerSide), a1 = sideAlive(1 - GAME.playerSide), p0 = a0 / Math.max(1, GAME.init[GAME.playerSide]), p1 = a1 / Math.max(1, GAME.init[1 - GAME.playerSide]);
  const fog = playerFogged(), fv = fowView();   // 雷達受干擾：敵方兵力、狀態、距離不明；戰爭迷霧：敵方兵力是估計值、看不到的艦隊位置不明
  const p1e = fv ? fowEstAlive(1 - GAME.playerSide) / Math.max(1, GAME.init[1 - GAME.playerSide]) : p1;
  const al = fleetAlive(fl), n = sumA(al.map((q) => q.alive)), g = al[0] && al[0].group, st = fleetStatus(fl);
  const fs = fl.sqs.find((q) => q.flagship >= 0), isOrig = fs && BR.ship === fs.flagship;
  const fhp = BR.ship >= 0 ? ships.hp[BR.ship] / (SHIP_TYPES[ships.type[BR.ship]].hp * (isOrig ? 3 : 1)) : 0;
  const tg = g && g.target && g.target.alive > 0 ? `${g.target.fleet ? g.target.fleet.name + ' ' : ''}${g.target.name}` : '自動選擇';
  const bar = (v, c) => `<div class="br-bar ${c}"><i style="width:${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%"></i></div>`;
  const row = (f2) => { if (fog && f2.side !== GAME.playerSide) return `<div class="br-fr"><span class="g-ec">${f2.name}</span><span class="g-dim">？？？ 雷達受干擾</span></div>`;
    if (fv && f2.side !== GAME.playerSide) {
      const vs = f2.sqs.map((q) => pSeen(q, Infinity)).filter((q) => q && !q.bg && q.alive > 0), live = vs.filter((q) => !q.stale);
      if (!live.length) return `<div class="br-fr"><span class="g-ec">${f2.name}</span><span class="g-dim">${vs.length ? `最後已知・${Math.round(t - Math.max(...vs.map((q) => q.t || 0)))} 秒前` : '位置不明'}</span></div>`;
      const C = centerOf(live), d = bridgeBearing(C.x, C.z)[1];
      return `<div class="br-fr"><span class="g-ec">${f2.name}</span><span class="g-dim">看得到 ${ships5(sumA(live.map((q) => q.alive)))} 艘</span><span class="tac-st fight">偵測中</span><span class="g-sp"></span><span class="g-dim">距 ${Math.round(d)}</span></div>`;
    }
    const a2 = fleetAlive(f2), n2 = sumA(a2.map((q) => q.alive)), s2 = fleetStatus(f2), C = a2.length ? centerOf(a2) : null, d = C ? bridgeBearing(C.x, C.z)[1] : 0;
    return `<div class="br-fr"><span class="${f2.side === GAME.playerSide ? 'g-pc' : 'g-ec'}">${f2.name}</span><span class="g-dim">${Math.round(n2 / f2.initial * 100)}%</span><span class="tac-st ${s2[1]}">${s2[0]}</span><span class="g-sp"></span><span class="g-dim">${C && f2 !== fl ? '距 ' + Math.round(d) : ''}</span></div>`; };
  const skills = Object.keys(fl.skills).map((id) => { const s = fl.skills[id], cd = Math.max(0, s.ready - t);
    const txt = t < s.until ? `生效 ${Math.ceil(s.until - t)}s` : s.left <= 0 ? '用完' : cd > 0 ? `${Math.ceil(cd)}s` : `×${s.left}`;
    return `<span class="br-skc ${t < s.until ? 'on' : cd > 0 || s.left <= 0 ? 'off' : ''}" title="${SKILLS[id].desc}">${SKILLS[id].name} <small>${txt}</small></span>`; }).join('');   // 只顯示；施放要在戰術台
  const others = fleets.filter((f2) => !f2.reserve && f2 !== fl && fleetAlive(f2).length);
  const log = (GAME.log || []).slice(-5).reverse().map((L) => `<div class="br-log ${L.cls}"><span class="g-dim">${_brMin(L.t)}</span> ${L.msg}</div>`).join('');
  gEl('br-stat-b').innerHTML = `<div class="g-row"><span class="g-dim">${battleSetup.timeLimit >= SIM_INF ? '' : '剩餘'}</span><b>${timeLeftText(t)}</b><span class="g-sp"></span><span class="g-dim">${paused ? '暫停中' : '×' + SPEEDS[speedIdx]}</span></div>
    <div class="br-fr"><span class="g-pc">我軍 ${Math.round(p0 * 100)}%</span><span class="g-sp"></span><span class="g-ec">敵軍 ${fog ? '？？？' : (fv ? '估計 ' : '') + Math.round(p1e * 100) + '%'}</span></div>
    <div class="br-vs">${bar(p0, 'me')}${fog ? '' : bar(p1e, 'en')}</div>
    ${fv ? `<div class="br-fr g-dim">自動掃描 ${FOW.auto[GAME.playerSide] ? (fowScanLeft(GAME.playerSide) > 0 ? `冷卻 ${Math.ceil(fowScanLeft(GAME.playerSide))} 秒` : '待命') : '關'}・區域掃描 ${fowHasCarrier(fl) ? (fowReconLeft(fl) > 0 ? `冷卻 ${Math.ceil(fowReconLeft(fl))} 秒` : `可用（戰術台 ${keyLabel(keyOf('scan'))}）`) : '本艦隊沒有航母'}${jammed(GAME.playerSide) ? '・通訊受干擾，不能共享情報' : ''}</div>` : ''}
    <div class="br-h">本艦隊・${fl.name}</div>
    <div class="br-fr"><span>旗艦 ${SHIP_TYPES[ships.type[BR.ship]] ? SHIP_TYPES[ships.type[BR.ship]].name : ''}${isOrig ? '' : '（代理）'}</span><span class="g-sp"></span><span class="g-dim">耐久 ${Math.round(fhp * 100)}%</span></div>${bar(fhp, fhp < 0.35 ? 'bad' : 'me')}
    <div class="br-fr"><span>兵力 ${ships5(n)} 艘（${Math.round(n / fl.initial * 100)}%）</span><span class="g-sp"></span><span>${g ? FORMATIONS[g.formation].name : ''}</span><span class="tac-st ${st[1]}">${st[0]}</span></div>
    <div class="br-fr g-dim">攻擊目標：${tg}</div>
    ${skills ? `<div class="br-sk">${skills}</div>` : ''}
    ${others.length ? `<div class="br-h">各艦隊</div>${others.map(row).join('')}` : ''}
    ${log ? `<div class="br-h">通訊紀錄</div>${log}` : ''}`;
  // 頂棚：雙方兵力
  gEl('br-p0').textContent = Math.round(p0 * 100) + '%'; gEl('br-b0').style.width = (p0 * 100).toFixed(1) + '%';
  gEl('br-p1').textContent = fog ? '？？？' : (fv ? '≈' : '') + Math.round(p1e * 100) + '%'; if (!fog) gEl('br-b1').style.width = (p1e * 100).toFixed(1) + '%';
  // 控制台左：本艦隊
  const meter = (lb, v, txt, c) => `<div class="br-meter ${c || ''}"><span>${lb}</span><div class="br-bar"><i style="width:${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%"></i></div><b>${Math.round(v * 100)}%</b><em>${txt}</em></div>`;
  gEl('br-dl').innerHTML = `<div class="br-dlh"><b>${fl.name}</b><span>${fl.commander ? fl.commander.name + ' ' + (fl.commander.title || '') + ' Lv ' + fl.commander.level : ''}</span></div>
    ${meter('兵力', n / fl.initial, ships5(n) + ' 艘')}${meter('旗艦', fhp, (SHIP_TYPES[ships.type[BR.ship]] || {}).name + (isOrig ? '' : '（代理）'), fhp < 0.35 ? 'bad' : '')}
    <div class="br-cells"><span><i>陣型</i>${g ? FORMATIONS[g.formation].name + (g.orderly ? '（整齊）' : '') : '-'}</span><span><i>狀態</i><em class="tac-st ${st[1]}">${st[0]}</em></span><span><i>目標</i>${tg}</span></div>`;
  // 控制台中：航向、目前命令、隊列
  const hdg = Math.round((((180 - BR.shipH * 180 / Math.PI) % 360) + 360) % 360), look = Math.round(BR.yaw * 180 / Math.PI);
  const cur = g && g.cur ? (g.cur.type === 'form' ? '變陣中' : '移動中') : g && g.plan ? '移動中' : '待命', qn = g && g.queue ? g.queue.length : 0;
  gEl('br-dc').innerHTML = `<div class="br-hdg"><span>航向</span><b>${String(hdg).padStart(3, '0')}°</b></div>
    <div class="br-ord"><span class="${cur === '待命' ? '' : 'go'}">${cur === '待命' ? '待命' : '▶ ' + cur}</span>${qn ? `<span>隊列 ${qn}</span>` : ''}<span class="dim">視線 ${look > 0 ? '右' : look < 0 ? '左' : ''}${Math.abs(look)}°</span></div>`;
  // 各艦隊旗艦子畫面
  const mates = bridgeFleets().filter((f2) => f2 !== fl);
  const sig = mates.map((f2) => f2.id).join(',');
  const pb = gEl('br-pip-b');
  if (BR.pipSig !== sig || !pb.firstChild) {
    BR.pipSig = sig;
    pb.innerHTML = mates.length ? mates.map((f2) => `<div class="br-pipc" data-pf="${f2.id}"><div class="br-pipv"></div><div class="br-pipcap"></div></div>`).join('')
      : '<div class="g-dim" style="padding:10px 4px">目前沒有其他友軍艦隊。</div>';
  }
  pb.querySelectorAll('.br-pipc').forEach((c) => {
    const f2 = fleets[+c.dataset.pf], a2 = fleetAlive(f2), n2 = sumA(a2.map((q) => q.alive)), s2 = fleetStatus(f2);
    const h = `<b class="g-pc">${f2.name}</b> <span class="g-dim">${f2.commander ? f2.commander.name : ''}</span><span class="g-sp"></span><span>${Math.round(n2 / f2.initial * 100)}%</span> <span class="tac-st ${s2[1]}">${s2[0]}</span>`;
    const cap = c.querySelector('.br-pipcap'); if (cap.dataset.h !== h) { cap.dataset.h = h; cap.innerHTML = h; }
  });
}

// ── 子畫面：其他艦隊旗艦看到的畫面 ──
// 每幀只重畫一個（輪流），畫進各自的貼圖；每幀把所有貼圖貼到視窗的位置
const BLIT = (() => {
  const s = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }));
  mesh.frustumCulled = false; s.add(mesh); return { s, cam, mesh };
})();
function bridgePips() {
  if (!BR.on || !R3.ready || !BR.wPip || !BR.wPip.classList.contains('open') || bridgeConsoleK() > 0.6) return;
  const cr = canvas.getBoundingClientRect(), slots = [];
  for (const v of BR.wPip.querySelectorAll('.br-pipv')) {
    const r = v.getBoundingClientRect(), f = fleets[+v.parentElement.dataset.pf];
    if (!f || !fleetAlive(f).length || r.width < 16 || r.height < 9) continue;
    const x = r.left - cr.left, y = r.top - cr.top;
    if (x + r.width < 0 || y + r.height < 0 || x > VW || y > VH) continue;
    slots.push({ f, x, y, w: r.width, h: r.height });
  }
  if (!slots.length) return;
  renderPip(slots[BR.pipRR++ % slots.length]);
  renderer.autoClear = false; renderer.setScissorTest(true);
  for (const s of slots) {
    const P = BR.pips[s.f.id]; if (!P || !P.rt) continue;
    const yb = VH - (s.y + s.h);
    renderer.setViewport(s.x, yb, s.w, s.h); renderer.setScissor(s.x, yb, s.w, s.h);
    if (BLIT.mesh.material.map !== P.rt.texture) { const first = !BLIT.mesh.material.map; BLIT.mesh.material.map = P.rt.texture; if (first) BLIT.mesh.material.needsUpdate = true; }
    renderer.render(BLIT.s, BLIT.cam);
  }
  renderer.setScissorTest(false); renderer.setViewport(0, 0, VW, VH); renderer.autoClear = true;
}
function renderPip(s) {
  const P = BR.pips[s.f.id] || (BR.pips[s.f.id] = { cam: new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 7000), rt: null, h: null, pose: {} });
  const pr = renderer.getPixelRatio(), w = Math.max(16, Math.min(640, Math.round(s.w * pr))), h = Math.max(9, Math.min(360, Math.round(s.h * pr)));
  if (!P.rt || P.rt.width !== w || P.rt.height !== h) { if (P.rt) P.rt.dispose(); P.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 2 }); }
  const i = bridgeShip(s.f); if (i < 0) return;
  bridgePose(i, P.pose);
  P.h = P.h == null ? P.pose.h : P.h + wrapAngle(P.pose.h - P.h) * 0.35;
  P.cam.aspect = s.w / s.h; P.cam.fov = 50; P.cam.updateProjectionMatrix();
  placeBridgeCam(P.cam, P.pose, P.h, 0, BR_FWD);
  update3D(P.cam, s.h);
  const sky = R3.sky; if (sky) sky.position.copy(P.cam.position);
  renderer.setRenderTarget(P.rt); renderer.clear(); renderer.render(scene, P.cam); renderer.setRenderTarget(null);
  if (sky) sky.position.copy(camera.position);
}

// 看著戰術台時，在地圖或上方工具列往上捲＝抬頭
addEventListener('wheel', (e) => { if (BR.on && TAC.open && e.deltaY < 0 && e.target.closest && e.target.closest('#tac-map, .tac-top')) bridgeWheel(-0.12); }, { passive: true });

// ═══════════════════════ 設定：按鍵綁定、遊戲、介面資訊 ═══════════════════════
const SET = { el: null, tab: 'keys', capture: null, msg: '', autoPaused: false };
function settingsOpen() { return !!SET.el && !SET.el.hidden; }
function settingsCapturing() { return !!SET.capture; }
function toggleSettings() { if (settingsOpen()) closeSettings(); else openSettings(); }
function applyUISettings() {
  const b = document.body;
  b.classList.toggle('ui-no-stats', !uiOn('stats'));
  b.classList.toggle('ui-no-skillbar', !uiOn('skillbar'));
  b.classList.toggle('ui-no-selbar', !uiOn('selbar'));
  document.documentElement.style.setProperty('--ui', SETTINGS.uiScale || 1.2);
}
const UI_SCALES = [[1, '小（原本大小）'], [1.1, '中'], [1.2, '大（預設）'], [1.35, '特大'], [1.5, '超大']];
// 畫在 canvas 上的字跟著介面大小縮放
function uiPx(n) { return +(n * (SETTINGS.uiScale || 1.2)).toFixed(1); }
function openSettings() {
  if (!SET.el) {
    SET.el = document.createElement('div'); SET.el.id = 'settings'; SET.el.hidden = true;
    document.body.appendChild(SET.el);
    SET.el.addEventListener('click', (e) => { if (e.target === SET.el) closeSettings(); });
  }
  // 作戰中打開設定：暫停（關掉時恢復）
  SET.autoPaused = (GAME.phase === 'battle') && !paused;
  if (SET.autoPaused) { paused = true; updateTimeUI(); }
  SET.el.hidden = false; SET.msg = '';
  renderSettings();
}
function closeSettings() {
  if (!SET.el) return;
  SET.capture = null; SET.el.hidden = true;
  if (SET.autoPaused && !GAME.result) { paused = false; updateTimeUI(); }
  SET.autoPaused = false;
  saveSettings(); applyUISettings();
}
function renderSettings() {
  const tabs = [['keys', '按鍵綁定'], ['game', '遊戲'], ['ui', '介面資訊']];
  let body = '';
  if (SET.tab === 'keys') {
    const groups = [...new Set(KEY_ACTIONS.map((a) => a[2]))];
    body = `<p class="g-dim set-note">點右邊的按鍵後，按下新的鍵即可改綁（Esc 取消、Backspace 清除）。輪盤的鍵只在輪盤開著時有效，所以可以和鏡頭共用。Esc 與 Ctrl＋A（全選）固定不能改。</p>
      ${SET.msg ? `<p class="set-msg">${SET.msg}</p>` : ''}
      <div class="set-keys">${groups.map((gname) => `<div class="set-grp"><h4>${gname}</h4>${KEY_ACTIONS.filter((a) => a[2] === gname).map(([id, name]) => `
        <div class="set-row"><span>${name}</span><button class="g-btn sm set-key ${SET.capture === id ? 'cap' : ''}" data-k="${id}">${SET.capture === id ? '按下新按鍵…' : keyLabel(keyOf(id))}</button></div>`).join('')}</div>`).join('')}</div>
      <div class="set-row" style="margin-top:10px"><span>排進戰術隊列的修飾鍵（按住它再下令）</span>
        <select class="g-sel" id="set-qmod">${['Shift', 'Control', 'Alt'].map((m) => `<option value="${m}" ${SETTINGS.queueMod === m ? 'selected' : ''}>${m === 'Control' ? 'Ctrl' : m}</option>`).join('')}</select></div>
      <div class="g-row" style="margin-top:12px"><span class="g-sp"></span><button class="g-btn sm" id="set-kreset">按鍵恢復預設</button></div>`;
  } else if (SET.tab === 'game') {
    body = `<div class="set-row"><span>開戰時的遊戲速度<br><small class="g-dim">戰鬥中仍可用 ${keyLabel(keyOf('speed_up'))}／${keyLabel(keyOf('speed_down'))} 或上方按鈕調整</small></span>
        <select class="g-sel" id="set-speed">${SPEEDS.map((v, i) => `<option value="${i}" ${SETTINGS.speedIdx === i ? 'selected' : ''}>×${v}</option>`).join('')}</select></div>
      <div class="set-row"><span>目前的遊戲速度</span><span class="g-row">${SPEEDS.map((v, i) => `<button class="g-btn sm ${speedIdx === i ? 'pri' : ''}" data-sp="${i}">×${v}</button>`).join('')}</span></div>
      <div class="set-row"><span>下令時自動減速<br><small class="g-dim">沒有暫停時，按住右鍵移動、打開指令輪盤、選攻擊或技能目標的期間，遊戲變慢，下完命令恢復原本速度</small></span>
        <select class="g-sel" id="set-cmdslow">${[[0, '關閉'], [0.1, '×0.1'], [0.2, '×0.2'], [0.5, '×0.5']].map(([v, n]) => `<option value="${v}" ${SETTINGS.cmdSlow === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <label class="set-row set-chk"><span>打開戰術面板時自動暫停<br><small class="g-dim">只限單人模式</small></span><input type="checkbox" id="set-tacpause" ${SETTINGS.tacPause ? 'checked' : ''}></label>
      <div class="set-h">指揮官視角（艦橋，${keyLabel(keyOf('bridge'))}）</div>
      <label class="set-row set-chk"><span>低頭看戰術台時自動暫停<br><small class="g-dim">只限單人模式；預設不暫停，邊看戰場邊下令</small></span><input type="checkbox" id="set-brpause" ${SETTINGS.bridgePause ? 'checked' : ''}></label>
      <label class="set-row set-chk"><span>「戰況」視窗固定在畫面上<br><small class="g-dim">不勾＝放在艦橋左側，轉頭才看得到</small></span><input type="checkbox" id="set-pin-stat" ${SETTINGS.brPins.stat ? 'checked' : ''}></label>
      <label class="set-row set-chk"><span>「各艦隊旗艦」視窗固定在畫面上<br><small class="g-dim">不勾＝放在艦橋右側，轉頭才看得到</small></span><input type="checkbox" id="set-pin-pip" ${SETTINGS.brPins.pip ? 'checked' : ''}></label>
      <div class="set-h">武器模型</div>
      <label class="set-row set-chk"><span>2D 畫面顯示武器<br><small class="g-dim">依「武器配置」的掛點，疊在船體貼圖上</small></span><input type="checkbox" id="set-w2d" ${SETTINGS.weapons2D !== false ? 'checked' : ''}></label>
      <label class="set-row set-chk"><span>3D 畫面顯示武器<br><small class="g-dim">船夠近（細節前三級）才畫；大軍遠景時關掉可以省效能</small></span><input type="checkbox" id="set-w3d" ${SETTINGS.weapons3D !== false ? 'checked' : ''}></label>
      <div class="set-row"><span>武器掛點<br><small class="g-dim">調整、新增每種船的武器位置</small></span><button class="g-btn sm" id="set-wed">武器配置…</button></div>
      <div class="set-row"><span>畫面</span><span class="g-row"><button class="g-btn sm ${mode3D ? '' : 'pri'}" data-rm="2d">2D 像素</button><button class="g-btn sm ${mode3D ? 'pri' : ''}" data-rm="3d">3D 模型</button></span></div>`;
  } else {
    body = `<div class="set-row"><span>介面大小<br><small class="g-dim">文字、按鈕與面板間距一起放大縮小</small></span>
        <select class="g-sel" id="set-uiscale">${UI_SCALES.map(([v, n]) => `<option value="${v}" ${(SETTINGS.uiScale || 1.2) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <p class="g-dim set-note" style="margin-top:12px">關掉的項目不會顯示在戰鬥畫面上（戰術面板裡的隊列與預覽一律顯示）。</p>
      ${UI_OPTS.map(([k, name, desc]) => `<label class="set-row set-chk"><span>${name}<br><small class="g-dim">${desc}</small></span><input type="checkbox" data-ui="${k}" ${uiOn(k) ? 'checked' : ''}></label>`).join('')}
      <div class="g-row" style="margin-top:12px"><span class="g-sp"></span><button class="g-btn sm" id="set-ureset">全部顯示</button></div>`;
  }
  SET.el.innerHTML = `<div class="set-card"><div class="g-head" style="margin-bottom:10px"><h2>設定</h2><span class="g-sp"></span><button class="g-btn" id="set-close">完成</button></div>
    <div class="set-tabs">${tabs.map(([k, n]) => `<button class="g-btn sm ${SET.tab === k ? 'pri' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
    <div class="set-body">${body}</div></div>`;
  const q = (s) => SET.el.querySelector(s), qa = (s) => SET.el.querySelectorAll(s);
  q('#set-close').onclick = closeSettings;
  qa('[data-tab]').forEach((b) => (b.onclick = () => { SET.tab = b.dataset.tab; SET.capture = null; SET.msg = ''; renderSettings(); }));
  qa('.set-key').forEach((b) => (b.onclick = () => { SET.capture = b.dataset.k; SET.msg = ''; renderSettings(); }));
  if (q('#set-qmod')) q('#set-qmod').onchange = (e) => { SETTINGS.queueMod = e.target.value; saveSettings(); };
  if (q('#set-kreset')) q('#set-kreset').onclick = () => { for (const a of KEY_ACTIONS) SETTINGS.keys[a[0]] = a[3]; SETTINGS.queueMod = 'Shift'; SET.msg = '已恢復預設按鍵。'; saveSettings(); renderSettings(); };
  if (q('#set-speed')) q('#set-speed').onchange = (e) => { SETTINGS.speedIdx = +e.target.value; saveSettings(); };
  qa('[data-sp]').forEach((b) => (b.onclick = () => { setSpeed(+b.dataset.sp); renderSettings(); }));
  if (q('#set-cmdslow')) q('#set-cmdslow').onchange = (e) => { SETTINGS.cmdSlow = +e.target.value; saveSettings(); };
  if (q('#set-tacpause')) q('#set-tacpause').onchange = (e) => { SETTINGS.tacPause = e.target.checked; saveSettings(); };
  if (q('#set-w2d')) q('#set-w2d').onchange = (e) => { SETTINGS.weapons2D = e.target.checked; saveSettings(); applyWeapon2D(); };
  if (q('#set-w3d')) q('#set-w3d').onchange = (e) => { SETTINGS.weapons3D = e.target.checked; saveSettings(); };
  if (q('#set-wed')) q('#set-wed').onclick = () => { closeSettings(); openWeaponEditor(GAME.phase === 'menu' ? showMenu : null); };
  if (q('#set-brpause')) q('#set-brpause').onchange = (e) => { SETTINGS.bridgePause = e.target.checked; saveSettings(); };
  for (const k of ['stat', 'pip']) if (q('#set-pin-' + k)) q('#set-pin-' + k).onchange = (e) => { SETTINGS.brPins[k] = e.target.checked; saveSettings(); };
  qa('[data-rm]').forEach((b) => (b.onclick = () => { setRenderMode(b.dataset.rm); setTimeout(renderSettings, 50); }));
  qa('[data-ui]').forEach((el) => (el.onchange = () => { SETTINGS.ui[el.dataset.ui] = el.checked; saveSettings(); applyUISettings(); }));
  if (q('#set-uiscale')) q('#set-uiscale').onchange = (e) => { SETTINGS.uiScale = +e.target.value; saveSettings(); applyUISettings(); dispatchEvent(new Event('resize')); };
  if (q('#set-ureset'))q('#set-ureset').onclick = () => { for (const u of UI_OPTS) SETTINGS.ui[u[0]] = true; saveSettings(); applyUISettings(); renderSettings(); };
}
// 改綁：攔下下一個按鍵
addEventListener('keydown', (e) => {
  if (!SET.capture) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const id = SET.capture, code = e.code;
  if (code === 'Escape') { SET.capture = null; renderSettings(); return; }
  if (code === 'Backspace' || code === 'Delete') { SETTINGS.keys[id] = ''; SET.capture = null; SET.msg = '已清除綁定。'; saveSettings(); renderSettings(); return; }
  if (/^(Shift|Control|Alt|Meta)/.test(code)) return;   // 修飾鍵不能單獨綁
  // 同一情境裡重複的鍵：原本的動作解除綁定
  const clash = KEY_ACTIONS.filter((a) => a[0] !== id && KEY_CTX(a[0]) === KEY_CTX(id) && SETTINGS.keys[a[0]] === code);
  for (const a of clash) SETTINGS.keys[a[0]] = '';
  SETTINGS.keys[id] = code; SET.capture = null;
  const nm = KEY_ACTIONS.find((a) => a[0] === id)[1];
  SET.msg = `「${nm}」改為 ${keyLabel(code)}。` + (clash.length ? `原本用這個鍵的「${clash.map((a) => a[1]).join('、')}」已解除綁定。` : '');
  saveSettings(); renderSettings();
}, true);

// ═══════════════════════ 啟動 ═══════════════════════
newBattle(12345);
resize();
goPreset('mid');
requestAnimationFrame(frame);
setCmdSide(0, false);
selectionChanged();
document.querySelectorAll('#seg-render button').forEach((b) => b.classList.toggle('on', b.dataset.r === '2d'));
updateTimeUI();
window.__demo = { view, updateCamera, volley, turn, opts, goPreset, changeFormation, missileSalvo, launchFighters, groups: () => groups, aliveF,
  setRenderMode, orbitBy, mode: () => mode3D, R3, squadrons: () => squadrons, dbg: () => ({ ts, touches: [...touches.keys()], camAnim, paused }), setLongPress(ms) { LONG_PRESS = ms; }, setSelection, cmdLine, cmdMoveTo, planMove, distSample(n) { const out = []; for (let k = 0; k < n; k++) { const i = (Math.random() * shipCount) | 0; const q = squadrons[ships.sq[i]]; if (!ships.alive[i] || q.bg) continue; const tg = focusTarget(q); if (tg < 0) continue; shipWorldCPU(i, _a); shipWorldCPU(tg, _b); out.push(_a.distanceTo(_b)); } return out.sort((a, b) => a - b); }, dmgStats, hitAspect, beamFalloff, beamPow, G: () => groups, shipWorld(i) { shipWorldCPU(i, _a); return [_a.x, _a.z]; }, beginAim, confirmAim, aim: () => aim, cmdFormation, cmdAttack, setJam, formGroup, groundAt, screenOf, selected, step(sec) { const n = Math.round(sec * SIM_HZ); for (let k = 0; k < n; k++) stepSim(); }, newBattle, replayBattle, stateHash, setPaused(b) { paused = b; updateTimeUI(); }, cmdLog, simTick: () => simTick, issue, setView(x, z, h) { camAnim = null; view.target.x = x; view.target.z = z; view.height = h; updateCamera(); } };
document.getElementById('sand-exit').onclick = () => showMenu();
Object.assign(window.__demo, { GAME, TAC, SV, svH, svV, groupNodes, SIM, showSim, simStart, simSwitch, simSetup, simEditMid, simGo, simReset, opLevel, setOpLevel, applyOp, OP_LEVELS, ffStats, ffHold,fleets: () => fleets, showMenu, showSingle, showRandom, showCampaign, showBriefing, showWatch, watchGo, showLoadout, startDeploy, startBattle, showReport, startReplay, SCENARIOS, sideAlive });
// 除錯：命令、干擾、補給、地形與統計
Object.assign(window.__demo, { step: (n = 1) => { for (let k = 0; k < n && !GAME.result; k++) stepSim(); pushSquadronUniforms(); gameFrame(0.2); }, issue, setSelection, squadrons: () => squadrons, ships: () => ships, jammed, seenSq, playerFogged, FOW: () => FOW, FT: () => FT, rockBlock, rocks: () => ROCKS, wStats, ftrStats, ammoRatio, supplyStock });
document.getElementById('tb-attack').onclick = armAttack;
document.getElementById('tb-queue').onclick = () => { queueToggle = !queueToggle; document.getElementById('tb-queue').classList.toggle('on', queueToggle); };
document.getElementById('set-btn').onclick = () => openSettings();
applyUISettings();
Object.assign(window.__demo, { rocks: () => ROCKS, shipWorld3(i) { shipWorldCPU(i, _a); return [_a.x, _a.y, _a.z]; }, fleetMods, U: () => U.uTime.value, gunStats: () => gunStats, pending: () => pending, wInfo: () => ({ dmg: wDmg.map((a) => a.map(Math.round)), w: wStats.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v)]))), air: [aliveF[0].length, aliveF[1].length], alive: [sideAlive(0), sideAlive(1)] }), SETTINGS, openSettings, closeSettings, keyOf, BR, enterBridge, exitBridge, ships: () => ships, bridgeLook, bridgeConsoleK, camera: () => camera });
Object.assign(window.__demo, { MOUNTS: () => MOUNTS, mountsOf, openWeaponEditor, closeWeaponEditor, WE, WA, buildWeaponAtlas, shipMat, getModel, MODEL_SRC, MODEL_LOAD, STORE: () => STORE, showRecords, showCampaign, showCampBriefing, campLoad, campStage, campEnemy, showTavern, roster: () => ROSTER, sideFac: () => SIDE_FAC, COMMANDERS });
// 載入伺服器模型資料夾裡的模型（啟動畫面顯示進度），完成後才進選單
(async () => {
  const B = window.BOOT;
  B && B.status('載入模型…', 0);
  try {
    await loadAllModels((f, n, total) => B && B.status(`載入模型 ${n}／${total}`, f));
  } catch (e) { MODEL_LOAD.err.push(e.message); }
  if (MODEL_LOAD.err.length && B) await B.warn('有模型沒有載入成功（3D 畫面會缺這些船或武器）：<br>' + MODEL_LOAD.err.join('<br>'));
  scheduleWeaponAtlas();
  let m = '2d'; try { m = STORE.getItem('fleet.render') || '2d'; } catch (e) { /* 預設 2D */ }
  if (m === '3d' && MODEL_SRC.e0) setRenderMode('3d', false);
  if (/sandbox/.test(location.search)) setPhase('sandbox'); else showMenu();
  B && B.done();
  window.__ready = true;
})();
