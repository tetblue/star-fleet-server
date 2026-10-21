import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ───────────────────────── 常數 ─────────────────────────
const SHIP_ATLAS = window.__ASSETS.ships;   // 4096×4096, 每格 256×192：每 1024 px 一段、每段左右各放一個陣營（8 方向 × 5 艦種）；陣營 f 在 x＝(f%2)×2048、y＝⌊f/2⌋×1024（見 atlasXY）
const FX_ATLAS = window.__ASSETS.fx;        // 2048×2304, 16 frames × 18 rows (0-1 爆炸, 2-9 帝國護盾, 10-17 聯盟護盾)
const FTR_ATLAS = window.__ASSETS.fighters; // 2048×512, 每格 128×128：每排左右各放一個陣營（8 方向）；陣營 f 在第 ⌊f/2⌋ 排、x＝(f%2)×1024
let VW = innerWidth, VH = innerHeight;   // 戰場畫面大小（戰術面板會讓出空間）
function tacDockSize() { if (typeof TAC === 'undefined' || !TAC.open || BR.on) return { w: 0, h: 0 }; return { w: 0, h: Math.round(Math.min(760, Math.max(300, innerHeight * (innerWidth >= 760 ? 0.58 : 0.6)))) }; }   // 戰術面板固定在下方
const ELEV = 30 * Math.PI / 180;
const BR = { on: false };
// 陣營（外觀）與模擬的「邊」分開：邊 0＝玩家（畫面下方）、邊 1＝對手；SIDE_FAC[邊]＝那一邊用哪個陣營（0 帝國、1 聯盟、2 傭兵、3 機械改造人類、4 機械智慧族、5 蟲族感染人類、6 蟲族；玩家只能是 0、1）
// 單一艦隊也可以有自己的外觀（fleet.fac，例如友軍傭兵、傭兵支援）；畫船、光束、飛彈、艦載機都用 sqFac／shipFac
let SIDE_FAC = [0, 1];
// 作戰介面跟著玩家的陣營換主題（顏色、紋飾）
function applyPlayerTheme() {   // 傭兵等不是玩家陣營：對手是這些陣營時，敵方顏色（--ec）改成那個陣營的顏色
  const sd = typeof cmdSide === 'number' ? cmdSide : 0, f = SIDE_FAC[sd] || 0, ef = SIDE_FAC[1 - sd];
  document.body.classList.toggle('pf-0', f !== 1); document.body.classList.toggle('pf-1', f === 1);
  if (ef >= 2 && FACTION[ef]) document.body.style.setProperty('--ec', FACTION[ef].ui); else document.body.style.removeProperty('--ec');
}
const FAC_KEY = ['e', 'a', 'm', 'c', 'r', 'i', 'b'];   // 模型鍵的字首（依陣營編號）
const sqFac = (sq) => (sq.fleet && sq.fleet.fac != null ? sq.fleet.fac : SIDE_FAC[sq.side]);
const shipFac = (i) => sqFac(squadrons[ships.sq[i]]);
const fxFac = (side) => (SIDE_FAC[side] === 1 ? 1 : 0);   // 爆炸、護盾特效只有帝國、聯盟兩套：傭兵用帝國的
function applySideNames() {
  document.querySelectorAll('[data-fn]').forEach((el) => { const f = SIDE_FAC[+el.dataset.fn]; el.textContent = el.dataset.short ? FACTION[f].name[0] : FACTION[f].name; });
  document.querySelectorAll('[data-fs]').forEach((el) => { const f = SIDE_FAC[+el.dataset.fs]; FAC_KEY.forEach((k, i) => el.classList.toggle(k, f === i)); });
}   // 指揮官視角狀態（內容在 bridge.js）
const CAM_DIR = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV)); // 目標點 → 相機
const TYPE_W = [6.0, 5.6, 4.6, 3.8, 3.2, 5.0];     // 航母 戰列 巡洋 驅逐 護衛 補給（貼圖寬，世界單位）
const TYPE_WEIGHT = [0.05, 0.12, 0.23, 0.32, 0.28, 0];   // 測試場的編成比例（不含補給艦）
const NT = TYPE_W.length;   // 艦種數（＝SHIP_TYPES.length）
const MAX_SQ = 40;
const FACTION = [
  { name: '帝國軍', beam: new THREE.Color(1.0, 0.62, 0.22), glow: new THREE.Color(1.0, 0.45, 0.18), ui: '#f2b35a' },
  { name: '聯盟軍', beam: new THREE.Color(0.45, 0.80, 1.0), glow: new THREE.Color(0.35, 0.65, 1.0), ui: '#7cc4ff' },
  { name: '灰鴉傭兵團', beam: new THREE.Color(1.0, 0.36, 0.28), glow: new THREE.Color(1.0, 0.3, 0.22), ui: '#e2735a' },
  { name: '機械改造人類', beam: new THREE.Color(1.0, 0.30, 0.42), glow: new THREE.Color(1.0, 0.22, 0.35), ui: '#ff6a7e' },
  { name: '機械智慧族', beam: new THREE.Color(0.30, 1.0, 0.86), glow: new THREE.Color(0.2, 0.95, 0.8), ui: '#4ff0d8' },
  { name: '蟲族感染人類', beam: new THREE.Color(0.80, 0.42, 1.0), glow: new THREE.Color(0.72, 0.3, 1.0), ui: '#c47cff' },
  { name: '蟲族', beam: new THREE.Color(0.62, 1.0, 0.30), glow: new THREE.Color(0.55, 0.95, 0.2), ui: '#9be35a' },
];
const FAC_N = FACTION.length;
const facRGBA = (f, al) => { const h = (FACTION[f] || FACTION[0]).ui; return 'rgba(' + [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',') + ',' + al + ')'; };   // 陣營顏色＋透明度（畫布用）

let simAlt = 1;
const opts = {
  rangeMul: 1,
  uturn: 'auto',
  autoFace: true,               // 停著的部隊自動把船頭轉向敵人（主砲有射角）
  flankSide: 1.5, flankRear: 1.75,   // 側面、背後受擊時「船體」傷害倍率（護盾沒有方向）
  beamNear: 250, beamFar: 700,  // 光束：有效射程內全威力，之後線性衰減到最大射程時剩 BEAM_FALLOFF_MIN（30%），超過不開火
  perSide: 3000, rep: 5, persp: true, altitude: true, fog: true, glow: true,
  bloom: true, fire: true, labels: true, background: true, advance: false,
  flat: false,                  // 操作難度「一般」：艦隊都在同一平面（不能升降）
  fow: false,                   // 操作難度「擬真」：戰爭迷霧（模擬室可以關掉）
  ff: false,                    // 操作難度「擬真」：射線穿過別的友軍部隊時可能誤傷、同部隊多半停火（2＝現行規則，true＝舊回放）
  deflect: true,                // 護盾偏折：光束打到護盾還在的船有機率無傷或減半（DEFLECT_RULE；舊回放沒有）
  rotate: true,                 // 前排輪替＋戰地維修（ROTATE_RULE、FIELD_REPAIR；舊回放沒有）
  ray: true,                    // 光束沿射線判定：擋在前面的敵艦先挨打、打偏的可能打中後方的敵艦（舊回放沒有）
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
  attribute vec3 aLocal; attribute vec3 aLocal2; attribute vec4 aInfo; attribute vec2 aState; attribute float aScale; attribute vec4 aPath; attribute vec4 aSwap; attribute float aSwapD;
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
    if (aSwapD > 0.) L += aSwap.xyz * (1. - easeIO((uTime - aSwap.w) / aSwapD));   // 前排輪替：從舊位置滑到新位置
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
      float fac = floor(aInfo.z + 0.5);   // 陣營 f：x＝(f%2)×8 格、y＝⌊f/2⌋×1024 px（見 atlasXY）
      float col = mod(fac, 2.) * 8. + dir;
      float row = floor(aInfo.y);
      vAlt = fract(aInfo.y);
      vec2 uv = position.xy + 0.5;
      vUv = vec2((col + uv.x) / 16., 1. - (floor(fac / 2.) * 1024. + (row + 1. - uv.y) * 192.) / 4096.);
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
  uniforms: { ...U, u3D: { value: 0 }, uFac: { value: FACTION.map((f) => f.glow) } },
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
    uniform vec3 uFac[7]; vec3 facCol(float f){ return uFac[int(clamp(floor(f + 0.5), 0., 6.))]; }
    varying vec2 vUv; varying float vI; varying float vFac;
    void main(){
      float d = length(vUv);
      float g = exp(-d * d * 7.) ;
      float core = exp(-d * d * 40.);
      vec3 c = facCol(vFac);
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
  uniforms: { ...U, uFac: { value: FACTION.map((f) => f.beam) } },
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
    uniform vec3 uFac[7]; vec3 facCol(float f){ return uFac[int(clamp(floor(f + 0.5), 0., 6.))]; }
    varying vec2 vUv; varying float vFade; varying float vFac;
    void main(){
      float y = abs(vUv.y);
      float glow = exp(-y * y * 9.);
      float core = exp(-y * y * 90.);
      float along = pow(vUv.x, 1.6);
      vec3 c = facCol(vFac);
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
  if (row < 2) row = fxFac(row); else if (row < 18) row = 2 + fxFac((row - 2) >> 3) * 8 + ((row - 2) & 7);   // 邊 → 陣營（爆炸、護盾的顏色）
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
      supply: !!fd.supply, vip: !!fd.vip, fac: fd.fac != null ? fd.fac : SIDE_FAC[fd.side], ally: !!fd.ally, defectAt: fd.defectAt != null ? fd.defectAt : null, follow: fd.follow != null ? fd.follow : -1, reinfOf: fd.reinfOf != null ? fd.reinfOf : null, mercOf: fd.mercOf != null ? fd.mercOf : null, keep: fd.keep || null,
      skills: {}, initial: total + (fd.supply ? 0 : 1), ai: fd.ai || null, activateAt: fd.activateAt != null ? fd.activateAt : null, aiS: {} };
    for (const sk of (fd.commander && fd.commander.skills) || []) {
      // 戰術熟練：每階 +1 次（fixed 的技能除外）；呼叫增援：這場有準備增援艦隊才能用
      const left = (sk === 'reinforce' && !setup.fleets.some((o) => o.reinfOf === fi)) || (sk === 'merc' && !setup.fleets.some((o) => o.mercOf === fi)) ? 0 : SKILLS[sk].uses + (SKILLS[sk].fixed ? 0 : talentRank(fd.commander, 'veteran'));
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
    // 前排輪替：換位開始時間、換位秒數（0＝沒在換）、下次可以再換的時間、換位起點相對新位置的偏移（陣型座標）
    swS: new Float32Array(total), swD: new Float32Array(total), swE: new Float32Array(total), sox: new Float32Array(total), soy: new Float32Array(total), soz: new Float32Array(total),
    // 戰地維修：已經修過幾次、這次還要補多少、每秒補多少
    rpN: new Uint8Array(total), rpLeft: new Float32Array(total), rpRate: new Float32Array(total),
  };
  const aLocal = new Float32Array(total * 3), aLocal2 = new Float32Array(total * 3), aInfo = new Float32Array(total * 4), aState = new Float32Array(total * 2), aScale = new Float32Array(total), aPath = new Float32Array(total * 4), aSwap = new Float32Array(total * 4), aSwapD = new Float32Array(total);

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
      aInfo.set([sqi, st.look != null ? st.look + 0.5 : t, p.fleetObj && p.fleetObj.fac != null ? p.fleetObj.fac : SIDE_FAC[p.side], R()], si * 4);   // 貼圖列；借用外觀的艦種 +0.5（著色器換色區分）
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
  shipGeo.setAttribute('aSwap', new THREE.InstancedBufferAttribute(aSwap, 4).setUsage(THREE.DynamicDrawUsage));
  shipGeo.setAttribute('aSwapD', new THREE.InstancedBufferAttribute(aSwapD, 1).setUsage(THREE.DynamicDrawUsage));
  shipGeo.instanceCount = total;
  shipMesh = new THREE.Mesh(shipGeo, shipMat); shipMesh.frustumCulled = false; shipMesh.renderOrder = 1;
  glowMesh = new THREE.Mesh(shipGeo, glowMat); glowMesh.frustumCulled = false; glowMesh.renderOrder = 2;
  scene.add(shipMesh, glowMesh);

  // 戰術符號：單位方框，用 scale 表示分艦隊大小
  squadrons.forEach((sq) => {
    const col = new THREE.Color(FACTION[sqFac(sq)].ui);
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
    el.className = 'sq-label s' + sqFac(sq) + (sq.bg ? ' bg' : '');
    el.innerHTML = `<b>${sq.fleet && battleSetup && !battleSetup.bg ? sq.fleet.name : FACTION[sqFac(sq)].name}</b> ${sq.name}<span></span><i></i>`;
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
    swapClear([sq]);   // 換位中的船從目前位置直接走向新陣型
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
  swapClear(list);
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
  swapClear(g.sqs);
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
  swapClear(g.sqs);
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
  const sd = ships.swD[i];   // 前排輪替：從舊位置滑到新位置（同著色器）
  if (sd > 0 && t < ships.swS[i] + sd) { const k = 1 - ease((t - ships.swS[i]) / sd); out[0] += ships.sox[i] * k; out[1] += ships.soy[i] * k; out[2] += ships.soz[i] * k; }
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
  const m = { dmg: 1, shield: 0, shTaken: 1, taken: 1, speed: 1, fwd: 1, mcd: 1, aa: 0, repair: 1, ftrRegen: 1, ftrDmg: 1, morph: 1, fireCd: 1, acc: 1, ffP: 1, defl: 0,
    rot: 'shield', rotDur: ROTATE_RULE.dur, shRegen: 1, repN: FIELD_REPAIR.n, repCap: 0 };
  if (!fleet) return m;
  const c = fleet.commander;
  if (c) {
    const b = c.tal ? 0.08 : traitBonus(c.trait, c.level || 1);   // 玩家：固有特性固定 +8%，其餘靠天賦；敵方：照等級
    if (c.trait === 'dmg') m.dmg += b; else if (c.trait === 'shield') m.shield += b; else if (c.trait === 'speed') m.speed += b;
    // 前排輪替：攻擊型晚退、防禦型早退（回盾較快）、機動型換位快
    if (c.trait === 'dmg') m.rot = 'hull'; else if (c.trait === 'shield') { m.rot = 'early'; m.shRegen += ROTATE_RULE.shRegen; } else if (c.trait === 'speed') m.rotDur *= 1 - ROTATE_RULE.fast;
    if (c.tal) { const r = (id) => c.tal[id] || 0; m.rotDur *= 1 - ROTATE_RULE.tal * r('rotate'); m.repN += r('damage'); m.repCap += FIELD_REPAIR.step * r('damage'); }
    const T = c.tal;
    if (T) {
      const r = (id) => T[id] || 0;
      m.dmg += 0.05 * r('gunnery'); m.mcd *= 1 - 0.1 * r('missile'); m.ftrRegen *= 1 + 0.3 * r('hangar'); m.ftrDmg *= 1 + 0.1 * r('hangar');
      m.shield += 0.04 * r('shield'); m.repair *= 1 + 0.2 * r('damage'); m.aa += 0.08 * r('aa'); m.speed += 0.05 * r('engine'); m.morph *= 1 - 0.12 * r('drill');
      m.acc *= 1 + 0.05 * r('aim'); m.ffP *= 1 - 0.15 * r('aim'); m.defl = r('energy');
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
  spawnBeam(_a.x, _a.y, _a.z, tx, ty, tz, t0, dur, sq.side, fxs.inten * 0.8, Math.min(0.5, 30 / Math.max(1, dist)), sqFac(sq));
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
// 射線判定（opts.ray）：光束朝瞄準點飛（命中＝飛向目標、沒中＝從旁邊偏開），沿路第一艘被射線碰到的敵艦才是真正挨打的
//   擋在目標前面的敵艦會先被打中；打偏的光束在射程內還可能打中後面的敵艦。船的受擊半徑＝貼圖寬 × r
//   艦艇每 every 個 tick 重新放進水平格子（cell 寬），射線只走過它經過的格子
const RAY_RULE = { r: 0.55, cell: 16, every: 3, air: [1.2, 1.6] };
const _r = new THREE.Vector3();
let rayT = 0, rayB = 0;   // rayCast 打到的距離；rayB＝擦邊程度（船中心到射線的距離 ÷ 受擊半徑，0＝正中、1＝擦過邊緣）
const RAYG = { gen: 0, tick: -1, pos: new Float32Array(0), map: [new Map(), new Map()] };   // pos：各艦 x, y, z, 受擊半徑；map[s]＝陣營 s 的格子（陣列帶 g＝哪一輪）
function rayGrid() {
  if (RAYG.tick >= 0 && simTick >= RAYG.tick && simTick - RAYG.tick < RAY_RULE.every) return;
  RAYG.tick = simTick; const gen = ++RAYG.gen;
  if (RAYG.pos.length < shipCount * 4) RAYG.pos = new Float32Array(shipCount * 4);
  const P = RAYG.pos, C = RAY_RULE.cell;
  for (const q of squadrons) {
    if (q.bg || q.alive <= 0) continue;
    const m = RAYG.map[q.side];
    for (const i of q.list) {
      if (!ships.alive[i]) continue;
      shipWorldCPU(i, _r);
      const r = TYPE_W[ships.type[i]] * RAY_RULE.r;
      P[i * 4] = _r.x; P[i * 4 + 1] = _r.y; P[i * 4 + 2] = _r.z; P[i * 4 + 3] = r;
      // 放進船身蓋到的每一格（射線只檢查走過的格子）
      for (let cx = Math.floor((_r.x - r) / C), x1 = Math.floor((_r.x + r) / C); cx <= x1; cx++)
        for (let cz = Math.floor((_r.z - r) / C), z1 = Math.floor((_r.z + r) / C); cz <= z1; cz++) {
          const k = cx * 100003 + cz;
          let a = m.get(k); if (!a) m.set(k, (a = []));
          if (a.g !== gen) { a.g = gen; a.length = 0; }
          a.push(i);
        }
    }
  }
}
// 射線（起點 x0、單位方向 u）在 tmax 內第一艘碰到的 side 方艦艇；skip 不算。回傳艦艇編號（沒有＝-1），距離放在 rayT
function rayCast(side, x0, y0, z0, ux, uy, uz, tmax, skip) {
  rayGrid();
  const m = RAYG.map[side], P = RAYG.pos, C = RAY_RULE.cell;
  let best = tmax, bi = -1, bb = 0;
  // 依序走過射線經過的格子（水平投影）；t 是沿 3D 射線的距離
  let cx = Math.floor(x0 / C), cz = Math.floor(z0 / C);
  const sx = ux > 0 ? 1 : -1, sz = uz > 0 ? 1 : -1;
  const dX = ux ? C / Math.abs(ux) : Infinity, dZ = uz ? C / Math.abs(uz) : Infinity;
  let nX = ux ? ((cx + (sx > 0 ? 1 : 0)) * C - x0) / ux : Infinity, nZ = uz ? ((cz + (sz > 0 ? 1 : 0)) * C - z0) / uz : Infinity;
  for (let tIn = 0; tIn < best;) {
    const a = m.get(cx * 100003 + cz);
    if (a && a.g === RAYG.gen) for (const i of a) {
      if (i === skip || !ships.alive[i]) continue;
      const r = P[i * 4 + 3], vx = P[i * 4] - x0, vy = P[i * 4 + 1] - y0, vz = P[i * 4 + 2] - z0, t = vx * ux + vy * uy + vz * uz;
      if (t <= 0) continue;
      const d2 = vx * vx + vy * vy + vz * vz - t * t; if (d2 >= r * r) continue;
      const th = t - Math.sqrt(r * r - d2);   // 射線碰到船身的位置
      if (th > 0.5 && th < best) { best = th; bi = i; bb = Math.sqrt(d2) / r; }
    }
    if (nX < nZ) { tIn = nX; nX += dX; cx += sx; } else { tIn = nZ; nZ += dZ; cz += sz; }
  }
  rayT = best; rayB = bb;
  return bi;
}
// 射線途中的敵方空中目標（打向戰艦的光束）：依距離由近到遠，飛彈碰到就吃下這一發；
//   艦載機要再擲自己的被命中機率（大小 × 速度 × 星雲，偵察機另外打折），沒中就讓光束穿過去
//   受擊半徑 air＝[飛彈, 艦載機]（世界單位）。回傳被打中的空中目標（沒有＝null），距離放在 rayT
const _rayAir = [];
function rayAir(side, x0, y0, z0, ux, uy, uz, tmax) {
  airIndex();
  const m = AIR.map[side]; if (!m.size) return null;
  const C = AIR.cell, A = _rayAir; A.length = 0;
  let cx = Math.floor(x0 / C), cz = Math.floor(z0 / C);
  const sx = ux > 0 ? 1 : -1, sz = uz > 0 ? 1 : -1;
  const dX = ux ? C / Math.abs(ux) : Infinity, dZ = uz ? C / Math.abs(uz) : Infinity;
  let nX = ux ? ((cx + (sx > 0 ? 1 : 0)) * C - x0) / ux : Infinity, nZ = uz ? ((cz + (sz > 0 ? 1 : 0)) * C - z0) / uz : Infinity;
  for (let tIn = 0; tIn < tmax;) {
    const arr = m.get(cx * 100003 + cz);
    if (arr) for (const o of arr) {
      const r = RAY_RULE.air[o.a], vx = o.x - x0, vy = o.y - y0, vz = o.z - z0, t = vx * ux + vy * uy + vz * uz;
      if (t <= 0 || t >= tmax || vx * vx + vy * vy + vz * vz - t * t >= r * r) continue;
      A.push({ o, t });
    }
    if (nX < nZ) { tIn = nX; nX += dX; cx += sx; } else { tIn = nZ; nZ += dZ; cz += sz; }
  }
  if (!A.length) return null;
  A.sort((p, q) => p.t - q.t);
  const RC = FOW_RULE.recon;
  for (const { o, t } of A) {
    if (o.a === 0) { if (!misLive[o.i] || misGen[o.i] !== o.g) continue; }
    else {
      const vf = 1 - HIT_RULE.speedMax * Math.min(1, o.v / HIT_RULE.speedRef);
      const raw = o.sz * vf * (inTerrain('nebula', o.x, o.z, o.y) ? HIT_RULE.nebula : 1);
      const p = FT.kind[o.i] === 2 ? Math.max(RC.min, raw * RC.acc) : Math.min(HIT_RULE.max, Math.max(HIT_RULE.min, raw));
      if (rnd() >= p) continue;   // 閃過了，光束繼續往前
    }
    rayT = t;
    return o;
  }
  return null;
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
        spawnBeam(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, t0, _a.distanceTo(_b) / (fxs.spd + rnd() * 120), sq.side, (volleyShot ? 0.6 : 1) * fxs.inten * (0.4 + 0.6 * beamFalloff(L, gun)), Math.min(fxs.len, 60 / L), sqFac(sq));
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
  const ray = opts.ray && !ff;
  let blk, hit, graze;   // graze：擦邊程度（射線判定才有）
  if (ray) {
    // 射線判定：先擲瞄準準不準，決定光束飛的方向，再看沿路第一艘碰到的是誰
    const p = hitChance(gk, gun, dist, target, sq, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z) * accM;
    const ok = rnd() < p, aimed = target;
    if (ok) { _b.x += (rnd() - 0.5) * 2; _b.z += (rnd() - 0.5) * 2; _b.y += (rnd() - 0.5) * 1.5; }
    else {
      const off = TYPE_W[ships.type[target]] * (0.8 + rnd() * 1.6) * (rnd() < 0.5 ? -1 : 1), ext = 1.15 + rnd() * 0.25;
      const ux = (_b.x - _a.x) / dist, uz = (_b.z - _a.z) / dist;
      _b.set(_a.x + (_b.x - _a.x) * ext - uz * off, _a.y + (_b.y - _a.y) * ext + (rnd() - 0.5) * 4, _a.z + (_b.z - _a.z) * ext + ux * off);
    }
    const L = Math.max(1, _a.distanceTo(_b)), ux = (_b.x - _a.x) / L, uy = (_b.y - _a.y) / L, uz = (_b.z - _a.z) / L;
    // 準：只看目標前面有沒有別的敵艦擋住；偏：射程內沿路都算（目標本身已經閃過）
    let i = rayCast(1 - sq.side, _a.x, _a.y, _a.z, ux, uy, uz, ok ? L : far, target), th = rayT;
    graze = rayB;
    if (i < 0 && ok) { i = target; th = L; graze = Math.sqrt(rnd()); }   // 打中瞄準的目標：落點在船身截面上均勻分布
    const end = i >= 0 ? th : L;
    blk = ROCKS.length ? rockBlock(_a.x, _a.y, _a.z, _a.x + ux * end, _a.y + uy * end, _a.z + uz * end) : -1;
    // 途中先碰到敵方飛彈／艦載機：由它吃下這一發
    const o = rayAir(1 - sq.side, _a.x, _a.y, _a.z, ux, uy, uz, end * (blk >= 0 ? blk : 1));
    if (o) {
      const tA = Math.max(1, rayT), fA = beamFalloff(tA, gun), fxs = GUN_FX[gk];
      _b.set(_a.x + ux * tA, _a.y + uy * tA, _a.z + uz * tA);
      fowExpose(sq, aimed);
      rayStats[sq.side][2]++;
      gunStats[sq.side][gk][0]++;
      hitAvg[sq.side] -= hitAvg[sq.side] * 0.01;
      beamPow[sq.side] += (fA - beamPow[sq.side]) * (beamShots[sq.side] ? 0.01 : 1); beamShots[sq.side]++; beamLastT[sq.side] = U.uTime.value;
      const t0 = U.uTime.value + delay, dur = tA / (fxs.spd + rnd() * 120);
      spawnBeam(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, t0, dur, sq.side, (volleyShot ? 0.6 : 1) * fxs.inten * (0.4 + 0.6 * fA), Math.min(fxs.len, 60 / tA), sqFac(sq));
      pending.push({ kind: 'ak', t: t0 + dur, a: o.a, i: o.i, g: o.g, dmg: gun.dmg * dmgMul * fA, side: sq.side });
      return true;
    }
    hit = blk < 0 && i >= 0;
    _b.set(_a.x + ux * end * (blk >= 0 ? blk : 1), _a.y + uy * end * (blk >= 0 ? blk : 1), _a.z + uz * end * (blk >= 0 ? blk : 1));
    fowExpose(sq, aimed);   // 戰爭迷霧：被瞄準、被打到的艦隊看得到開火的人幾秒
    if (hit && i !== aimed) fowExpose(sq, i);
    if (hit && i !== aimed) rayStats[sq.side][ok ? 0 : 1]++;
    if (hit) { target = i; dist = Math.max(1, th); }
  } else {
    // 被巨大小行星擋住：光束打在岩石上（沒有傷害）
    blk = ROCKS.length ? rockBlock(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z) : -1;
    const p = hitChance(gk, gun, dist, target, sq, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z) * accM;
    hit = blk < 0 && (ff || rnd() < p);
    if (!ff) fowExpose(sq, target);   // 戰爭迷霧：被打的艦隊看得到開火的人幾秒
  }
  const fm = beamFalloff(dist, gun);
  const tq = squadrons[ships.sq[target]];
  const gs = gunStats[sq.side][gk]; gs[0]++; if (hit) gs[1]++;
  hitAvg[sq.side] += ((hit ? 1 : 0) - hitAvg[sq.side]) * 0.01;
  beamPow[sq.side] += (fm - beamPow[sq.side]) * (beamShots[sq.side] ? 0.01 : 1); beamShots[sq.side]++; beamLastT[sq.side] = U.uTime.value;
  const fxs = GUN_FX[gk];
  // 落點：命中＝船身附近；沒中＝從旁邊擦過、往後延伸（射線判定在上面已經算好）
  if (ray) { /* 落點已定 */ }
  else if (hit) { _b.x += (rnd() - 0.5) * 2; _b.z += (rnd() - 0.5) * 2; _b.y += (rnd() - 0.5) * 1.5; }
  else if (blk >= 0) _b.set(_a.x + (_b.x - _a.x) * blk, _a.y + (_b.y - _a.y) * blk, _a.z + (_b.z - _a.z) * blk);
  else {
    const off = TYPE_W[ships.type[target]] * (0.8 + rnd() * 1.6) * (rnd() < 0.5 ? -1 : 1), ext = 1.15 + rnd() * 0.25;
    const ux = (_b.x - _a.x) / dist, uz = (_b.z - _a.z) / dist;
    _b.set(_a.x + (_b.x - _a.x) * ext - uz * off, _a.y + (_b.y - _a.y) * ext + (rnd() - 0.5) * 4, _a.z + (_b.z - _a.z) * ext + ux * off);
  }
  const inten = (volleyShot ? 0.6 : 1) * fxs.inten * (0.4 + 0.6 * fm);   // 遠距離的光束比較暗
  const L = _a.distanceTo(_b), dur = L / (fxs.spd + rnd() * 120);
  const t0 = U.uTime.value + delay;
  spawnBeam(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, t0, dur, sq.side, inten, Math.min(fxs.len, 60 / L), sqFac(sq));
  if (blk >= 0) { if (rnd() < 0.25) pending.push({ kind: 'sp', t: t0 + dur * (ray ? 1 : blk), side: sq.side, x: _b.x, y: _b.y, z: _b.z }); return true; }
  if (!hit) return true;
  const asp = hitAspect(target, _a.x, _a.z, _b.x, _b.z, _a.y, _b.y);
  let dmg = gun.dmg * dmgMul * fm * fleetMods(sq.fleet).dmg;
  if (sideFocus(sq.side) === tq) dmg *= 1.2;
  if (ff) dmg *= ffMul;
  pending.push({ gk, dr: Math.min(1, dist / far), gr: graze, t: t0 + dur, target, side: sq.side, ff, dirIdx: dirIndexOf(_b.x - _a.x, _b.z - _a.z), asp, fm, dmg, hm: hitMul(asp, sq, tq), fx: rnd() < fxs.fxP * (0.3 + 0.7 * fm) * (volleyShot ? 0.4 : 1), x: _b.x, y: _b.y, z: _b.z });
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
function spawnBeam(ax, ay, az, bx, by, bz, t0, dur, side, inten, len, fac) {   // fac：開火那支艦隊的外觀（省略＝那一邊的陣營）
  const i = beamHead; beamHead = (beamHead + 1) % BEAM_MAX;
  beamA[i * 3] = ax; beamA[i * 3 + 1] = ay; beamA[i * 3 + 2] = az;
  beamB[i * 3] = bx; beamB[i * 3 + 1] = by; beamB[i * 3 + 2] = bz;
  beamT[i * 4] = t0; beamT[i * 4 + 1] = dur; beamT[i * 4 + 2] = (fac != null ? fac : SIDE_FAC[side]) + inten; beamT[i * 4 + 3] = len;
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
const MIS_COL = [new THREE.Color(1.0, 0.42, 0.14), new THREE.Color(0.55, 0.85, 1.0), new THREE.Color(1.0, 0.3, 0.3), new THREE.Color(1.0, 0.32, 0.45), new THREE.Color(0.35, 1.0, 0.88), new THREE.Color(0.78, 0.45, 1.0), new THREE.Color(0.6, 1.0, 0.3)];
const misTrailMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uRes: U.uRes, uFac: { value: MIS_COL } },
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
    uniform vec3 uFac[7]; vec3 facCol(float f){ return uFac[int(clamp(floor(f + 0.5), 0., 6.))]; }
    varying float vS; varying float vY; varying float vI; varying float vFac;
    void main(){
      float y = abs(vY);
      float glow = exp(-y * y * 6.), core = exp(-y * y * 50.);
      vec3 c = facCol(vFac);
      gl_FragColor = vec4((c * glow * 0.55 + vec3(1.) * core * 0.45 * vS) * pow(vS, 1.8) * vI, 1.);
    }`,
});
const misHeadMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uRes: U.uRes, uFac: { value: MIS_COL } },
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
    uniform vec3 uFac[7]; vec3 facCol(float f){ return uFac[int(clamp(floor(f + 0.5), 0., 6.))]; }
    varying vec2 vUv; varying float vFac; varying float vI;
    void main(){
      float d = length(vUv);
      vec3 c = facCol(vFac);
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
  misT.set([t0, dur, (msq ? sqFac(msq) : SIDE_FAC[side]) + 0.5, cut], i * 4);
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
  misT.set([t0, dur, sqFac(sq) + 0.5, cut], i * 4);
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
  misT.set([t0, dur, sqFac(sq) + 0.5, cut], i * 4);
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
      float fac = floor(aFI.x + 0.5); vUv = vec2((mod(fac, 2.) * 8. + dir + uv.x) / 16., 1. - (floor(fac / 2.) + 1. - uv.y) * 0.25);   // 陣營 f：第 ⌊f/2⌋ 排（共 4 排）、左右各一個陣營
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
const FTR_COL = [new THREE.Color(1.0, 0.55, 0.25), new THREE.Color(0.5, 0.8, 1.0), new THREE.Color(1.0, 0.4, 0.3), new THREE.Color(1.0, 0.4, 0.5), new THREE.Color(0.4, 1.0, 0.9), new THREE.Color(0.8, 0.5, 1.0), new THREE.Color(0.65, 1.0, 0.35)];
const ftrTrailMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uRes: U.uRes, uCamDir: U.uCamDir, uFog: U.uFog, uFac: { value: FTR_COL } },
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
      vUv = vec2(t, position.y * 2.); vFac = kind > 0.5 ? 9. : aFI.x;   // 9＝維修機（綠色尾焰）；0～6＝陣營
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uFac[7]; vec3 facCol(float f){ return uFac[int(clamp(floor(f + 0.5), 0., 6.))]; } varying vec2 vUv; varying float vFac;
    void main(){
      float y = abs(vUv.y);
      vec3 c = vFac > 8.5 ? vec3(0.45, 1.0, 0.6) : facCol(vFac);
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
const wStats = [{ mFired: 0, mInt: 0, mMiss: 0, healed: 0, fLaunch: 0, rLaunch: 0, fLand: 0, fLost: 0, fBuilt: 0, rot: 0, fRep: 0, fHeal: 0 }, { mFired: 0, mInt: 0, mMiss: 0, healed: 0, fLaunch: 0, rLaunch: 0, fLand: 0, fLost: 0, fBuilt: 0, rot: 0, fRep: 0, fHeal: 0 }];
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
// ───── 前排輪替（ROTATE_RULE）：受損的船跟後方同艦種、狀態好的船交換位置 ─────
// 換位中的船（swD > 0）沿偏移量從舊位置滑到新位置；陣型有其他變化（變陣、轉向、迴轉）時直接取消
function swapClear(sqs) {
  if (!shipGeo) return;
  const aD = shipGeo.getAttribute('aSwapD'); let dirty = false;
  for (const q of sqs) for (const i of q.list) if (ships.swD[i] > 0) { ships.swD[i] = 0; aD.array[i] = 0; dirty = true; }
  if (dirty) aD.needsUpdate = true;
}
function rotNeed(i, M) {
  if (M.rot === 'hull') return ships.hp[i] < ROTATE_RULE.hull * maxHp(i);           // 攻擊型：船體快撐不住才換
  if (M.rot === 'early') return ships.sh[i] < ROTATE_RULE.shEarly * ships.shMax[i];  // 防禦型：護盾快沒了就換
  return ships.sh[i] <= 0.5;                                                         // 一般：護盾打光
}
function rotFresh(j) { return ships.sh[j] >= ROTATE_RULE.fresh.sh * ships.shMax[j] && ships.hp[j] >= ROTATE_RULE.fresh.hp * maxHp(j); }
function rotateLines(t) {
  if (simTick % 30 !== 7) return;   // 每 0.5 秒
  const A = ['aLocal', 'aLocal2', 'aSwap', 'aSwapD'].map((k) => shipGeo.getAttribute(k));
  let dirty = false;
  for (const q of squadrons) {
    const pk = q.group && q.group.plan && q.group.plan.kind;   // 平移、原地轉向照常輪替；蛇行迴轉、打散重組時不換
    if (q.bg || q.hidden || !q.group || q.group.inactive || pk === 'snake' || pk === 'scatter' || q.alive < 2 || sqMorphing(q, t)) continue;
    const M = q.mods || fleetMods(q.fleet), need = [], cand = [];
    for (const i of q.list) {
      if (!ships.alive[i] || i === q.flagship || ships.swE[i] > t) continue;
      if (rotNeed(i, M)) need.push(i); else if (rotFresh(i)) cand.push(i);
    }
    if (!need.length || !cand.length) continue;
    need.sort((a, b) => ships.lz1[b] - ships.lz1[a] || a - b);   // 越前排越優先
    cand.sort((a, b) => ships.lz1[a] - ships.lz1[b] || a - b);   // 替補：越後排越優先
    let left = ROTATE_RULE.max + Math.floor(q.alive * ROTATE_RULE.per);
    for (const i of need) {
      if (left <= 0) break;
      const zMax = ships.lz1[i] - ROTATE_RULE.gap;
      const k = cand.findIndex((j) => j >= 0 && ships.type[j] === ships.type[i] && ships.lz1[j] < zMax);
      if (k < 0) continue;
      swapPair(i, cand[k], t, M.rotDur, A); cand[k] = -1; left--; dirty = true;
      wStats[q.side].rot++;
    }
  }
  if (dirty) for (const a of A) a.needsUpdate = true;
}
function swapPair(i, j, t, dur, A) {
  const pi = [ships.lx1[i], ships.ly1[i], ships.lz1[i]], pj = [ships.lx1[j], ships.ly1[j], ships.lz1[j]];
  const put = (a, P, O) => {
    ships.lx0[a] = ships.lx1[a] = P[0]; ships.ly0[a] = ships.ly1[a] = P[1]; ships.lz0[a] = ships.lz1[a] = P[2];
    ships.sox[a] = O[0] - P[0]; ships.soy[a] = O[1] - P[1]; ships.soz[a] = O[2] - P[2];
    ships.swS[a] = t; ships.swD[a] = dur; ships.swE[a] = t + dur + ROTATE_RULE.cd;
    A[0].array.set(P, a * 3); A[1].array.set(P, a * 3);
    A[2].array.set([ships.sox[a], ships.soy[a], ships.soz[a], t], a * 4); A[3].array[a] = dur;
  };
  put(i, pj, pi); put(j, pi, pj);
}
// ───── 戰地維修（FIELD_REPAIR）：脫離火力的受損船逐步回復船體 ─────
function fieldRepair(dt, t) {
  for (let i = 0; i < shipCount; i++) {
    if (ships.rpLeft[i] <= 0) continue;
    if (!ships.alive[i]) { ships.rpLeft[i] = 0; continue; }
    const mh = maxHp(i), amt = Math.min(ships.rpLeft[i], ships.rpRate[i] * dt, mh - ships.hp[i]);
    ships.hp[i] += amt; ships.rpLeft[i] -= amt; wStats[ships.side[i]].fHeal += amt;
    if (ships.hp[i] >= mh - 1e-3) ships.rpLeft[i] = 0;
  }
  if (simTick % 30 !== 22) return;   // 每 0.5 秒看一次有沒有船可以開始維修
  const F = FIELD_REPAIR, R2 = SUPPLY_RULE.range * SUPPLY_RULE.range;
  let sup = null;
  for (const q of squadrons) {
    if (q.bg || q.hidden || (q.group && q.group.inactive)) continue;
    const M = q.mods || fleetMods(q.fleet);
    for (const i of q.list) {
      if (!ships.alive[i] || ships.rpLeft[i] > 0 || ships.rpN[i] >= M.repN) continue;
      const mh = maxHp(i);
      if (ships.hp[i] >= F.below * mh) continue;
      if (!sup) { sup = []; for (let s = 0; s < shipCount; s++) if (ships.alive[s] && ships.type[s] === SUPPLY_T && !squadrons[ships.sq[s]].bg) { shipWorldCPU(s, _a); sup.push(s, _a.x, _a.y, _a.z); } }
      shipWorldCPU(i, _a);
      let near = false;
      for (let k = 0; k < sup.length; k += 4) if (ships.side[sup[k]] === ships.side[i] && (sup[k + 1] - _a.x) ** 2 + (sup[k + 2] - _a.y) ** 2 + (sup[k + 3] - _a.z) ** 2 < R2) { near = true; break; }
      let frac;
      if (near) frac = (F.first + M.repCap) * 0.5 ** ships.rpN[i];   // 補給艦旁：40%、20%、10%…
      else if (ships.rpN[i] === 0) frac = F.alone + M.repCap;           // 沒有補給艦：只能修這一次
      else continue;
      ships.rpN[i]++; ships.rpLeft[i] = frac * mh; ships.rpRate[i] = ships.rpLeft[i] / F.dur;
      wStats[q.side].fRep++;
    }
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
    fI[i * 4] = shipFac(FT.carrier[i]); fI[i * 4 + 1] = st; fI[i * 4 + 2] = FT.t0[i]; fI[i * 4 + 3] = FT.seed[i] + (FT.kind[i] === 1 ? 2 : 0);   // w：整數部分＝種類（畫維修機用；偵察機畫成一般艦載機）
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
      // 護盾偏折（opts.deflect）：光束打到護盾還在的船，有機率無傷或減半（天賦「能量調度」提高機率）
      //   距離越近機率越低：dr＝開火距離 ÷ 最大射程，機率 × (closeMul + (1 − closeMul) × dr)
      //   擦邊越容易彈開：gr＝擦邊程度（0＝正中、1＝邊緣），再 × (grazeLo + grazeK × gr²)
      let dm = 1;
      if (opts.deflect && !e.src && sh0 > 0.5) {
        const D = DEFLECT_RULE, u = rnd(), dk = (D.closeMul + (1 - D.closeMul) * (e.dr != null ? e.dr : 1)) * (e.gr != null ? D.grazeLo + D.grazeK * e.gr * e.gr : 1);
        const pn = (D.none + D.stepNone * mods.defl) * dk, ph = (D.half + D.stepHalf * mods.defl) * dk;
        if (u < pn) { dm = 0; deflStats[tSide][0]++; deflStats[tSide][2] += raw; }
        else if (u < pn + ph) { dm = D.halfMul; deflStats[tSide][1]++; deflStats[tSide][2] += raw * (1 - D.halfMul); }
      }
      const need = raw * dm * mods.shTaken;
      if (sh0 >= need) shD = need; else { shD = sh0; hullD = (need - sh0) / mods.shTaken * hm; }
    }
    ships.sh[ti] = sh0 - shD; if (shD > 0) ships.shT[ti] = t;
    // 護盾被打光：至少 broken 秒後才重新啟動；已經沒護盾時船體再被打，也要重新等 delay 秒
    if (sh0 > 0.5 && ships.sh[ti] <= 0.5) ships.shT[ti] = t + SHIELD_RULE.broken - SHIELD_RULE.delay;
    else if (sh0 <= 0.5 && hullD > 0) ships.shT[ti] = Math.max(ships.shT[ti], t);
    ships.hp[ti] -= hullD;
    const eff = shD + hullD;
    e.kill = ships.hp[ti] <= 0;
    e.hull = hullD > 0;
    if (e.asp != null) {
      tq.hitW[e.asp] += 1;
      if (e.kill) dmgStats[tSide][e.asp]++;
    }
    if (e.ff) { ffStats[e.side][0]++; ffStats[e.side][1] += eff; }   // 友軍誤射：不算進對敵傷害
    else { dmgDealt[e.side] += eff; wDmg[e.side][e.src || 0] += eff; cStatHit(e, ti, shD, hullD); }
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
const deflStats = [[0, 0, 0], [0, 0, 0]];  // 護盾偏折：各方受擊時 [無傷次數, 減半次數, 擋掉的傷害]
const rayStats = [[0, 0, 0], [0, 0, 0]];  // 射線判定：各方光束 [被目標前面的敵艦擋下, 打偏後打中別艘敵艦, 被敵方飛彈／艦載機擋下] 的次數
const ffHold = [0, 0];   // 擬真難度：同部隊擋住射界而停火的次數
const wDmg = [[0, 0, 0], [0, 0, 0]];   // 傷害來源：光束、飛彈、艦載機
// 平衡用的細項統計（不顯示，供除錯／模擬分析）：各方打出的傷害依武器分 [護盾, 船體]、受到的傷害依艦種分、擊沉數、護盾回充量
const C_SRC = ['main', 'sec', 'aa', 'msl', 'ftr', 'lance'];
const cStats = [0, 1].map(() => ({ src: C_SRC.map(() => [0, 0]), taken: [0, 1, 2, 3, 4, 5].map(() => [0, 0]), lost: [0, 0, 0, 0, 0, 0], regen: 0 }));   // 艦種 6 種（data.js 比 main.js 晚載入）
function cStatHit(e, ti, shD, hullD) {
  const k = e.kind === 'mh' ? 3 : e.kind === 'lb' ? 5 : e.src === 2 ? 4 : e.gk === 'sec' ? 1 : e.gk === 'aa' ? 2 : 0;
  const a = cStats[e.side].src[k], d = cStats[1 - e.side], ty = ships.type[ti];
  a[0] += shD; a[1] += hullD; d.taken[ty][0] += shD; d.taken[ty][1] += hullD;
  if (e.kill) d.lost[ty]++;
}
function cStatReset() { for (const c of cStats) { c.src.forEach((a) => a.fill(0)); c.taken.forEach((a) => a.fill(0)); c.lost.fill(0); c.regen = 0; } }
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
    const s0 = ships.sh[i]; ships.sh[i] = Math.min(ships.shMax[i], s0 + ships.shMax[i] * SHIELD_RULE.rate * (q.mods ? q.mods.shRegen : 1) * dt);
    if (!q.bg) cStats[ships.side[i]].regen += ships.sh[i] - s0;   // 防禦型指揮官回充較快
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
    const G = SHIP_TYPES[ships.type[i]].guns, sw = ships.swD[i] > 0 && t < ships.swS[i] + ships.swD[i];   // 前排輪替換位中：主砲、副砲停火（防空照打）
    for (let g = 0; g < 3; g++) {
      const gk = GUN_KEYS[g], gun = G[gk]; if (!gun || (sw && gk !== 'aa')) continue;
      const arr = CDS[g], cd = arr[i] - dt * (gk === 'aa' ? 1 : r);   // 防空不受陣型火力影響
      if (cd > 0) { arr[i] = cd; continue; }
      arr[i] = fireGun(i, gk) ? gun.cd * (0.85 + rnd() * 0.3) : 0.4 + rnd() * 0.4;
    }
  }
}
function resetCombat() {
  pending.length = 0; RAYG.tick = -1;
  for (const k in FT) FT[k].fill(k === 'tgt' ? -1 : 0);
  fP.fill(0); fV.fill(0); fI.fill(0); ftrAttrs.aFI.needsUpdate = true;
  aliveF[0].length = 0; aliveF[1].length = 0; misHead = 0; ftrHead = 0;
  for (const w of wStats) { w.mFired = w.mInt = w.mMiss = w.healed = w.fLaunch = w.rLaunch = w.fLand = w.fLost = w.fBuilt = w.rot = w.fRep = w.fHeal = 0; } for (const a of wDmg) a.fill(0);
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
const SIM_RULES = ['fire', 'advance', 'flankSide', 'flankRear', 'beamNear', 'beamFar', 'altitude', 'rangeMul', 'autoFace', 'flat', 'ff', 'fow', 'ray', 'deflect', 'rotate'];
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
  dmgDealt.fill(0); cStatReset(); ffStats.forEach((a) => a.fill(0)); rayStats.forEach((a) => a.fill(0)); deflStats.forEach((a) => a.fill(0)); ffHold.fill(0);
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
  Object.assign(opts, { fow: false, ray: false, deflect: false, rotate: false }, rules);   // 舊紀錄沒有戰爭迷霧、射線判定、護盾偏折
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
const MODEL_LOAD = { done: false, err: [], man: null, pending: {}, loader: null };
// 太空站、遊戲裡還沒有的風格（只有武器配置會用到）：開場不下載，用到才用 ensureModels 載入
const modelLazy = (key, m) => m.kind === 'station' || !FAC_KEY.includes(key[0]);
async function loadAllModels(onProgress = () => {}) {
  const man = MODEL_LOAD.man = await (await fetch('api/models', { cache: 'no-cache' })).json();
  const keys = Object.keys(man.models).filter((k) => !modelLazy(k, man.models[k])), total = keys.reduce((a, k) => a + man.models[k].bytes + man.models[k].lodBytes, 0);
  let got = 0, n = 0;
  const loader = MODEL_LOAD.loader = new GLTFLoader();
  const one = async (key) => {
    await loadOneModel(key, man.models[key], loader, (b) => { got += b; onProgress(got / total, n, keys.length); });
    n++; onProgress(got / total, n, keys.length);
  };
  const queue = keys.slice(), workers = Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); });
  await Promise.all(workers);
  MODEL_LOAD.done = true;
  return MODEL_LOAD;
}
function ensureModels(keys) {   // 晚載入的模型；已經有、或伺服器沒有的鍵直接略過
  const man = MODEL_LOAD.man; if (!man) return Promise.resolve();
  if (!MODEL_LOAD.loader) MODEL_LOAD.loader = new GLTFLoader();
  return Promise.all(keys.map((k) => {
    if (MODEL_SRC[k] || !man.models[k]) return null;
    return MODEL_LOAD.pending[k] || (MODEL_LOAD.pending[k] = loadOneModel(k, man.models[k], MODEL_LOAD.loader, () => {}).finally(() => { delete MODEL_LOAD.pending[k]; }));
  }));
}
async function loadOneModel(key, m, loader, onBytes) {
  const fetchBytes = async (url) => {   // 邊下載邊回報進度
    const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${url}：HTTP ${r.status}`);
    const rd = r.body.getReader(), parts = []; let len = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); len += value.length; onBytes(value.length); }
    const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out.buffer;
  };
  {
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
  }
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
function typeKey(i) { return FAC_KEY[shipFac(i)] + ships.type[i]; }
function hullKey(i) { const k = typeKey(i), lk = SHIP_TYPES[ships.type[i]].look; return lk == null || R3.models[k] ? k : k[0] + lk; }
// 依目前艦艇數建立 (模型, 細節) 的 InstancedMesh
function rebuild3D() {
  for (const it of R3.list) { scene.remove(it.mesh); it.mesh.dispose(); }
  R3.list = []; R3.meshByKey = {};
  const cap = {};
  const capT = {};   // 依艦種（e0～e5／a0～a5）算船數；cap 是依模型（借用外觀的艦種算在被借的模型上）
  for (let i = 0; i < shipCount; i++) { const k = hullKey(i), tk = typeKey(i); cap[k] = (cap[k] || 0) + 1; capT[tk] = (capT[tk] || 0) + 1; }
  for (const k of FAC_KEY) if (R3.models[k + 'f']) cap[k + 'f'] = FTR_MAX;
  cap.ef = FTR_MAX;
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
    writeMatrix((R3.meshByKey[FAC_KEY[shipFac(FT.carrier[j])] + 'f'] || R3.meshByKey.ef)[lod], x, y, z, vx / vl, vy / vl, vz / vl, FTR_LEN3 * (FT.kind[j] ? 0.6 : 1));   // 維修機小一點
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
  if (GAME.phase === 'battle' || GAME.phase === 'deploy') list = list.filter((q) => q.side === GAME.playerSide && !q.bg && !(q.fleet && q.fleet.ally));   // 作戰中只能選自己的（友軍傭兵自己打，不聽指揮）
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
    _stc.set(FACTION[sqFac(q)].ui);
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
  const d = { keys: Object.fromEntries(KEY_ACTIONS.map((a) => [a[0], a[3]])), queueMod: 'Shift', speedIdx: 1, tacPause: true, bridgePause: false, cmdSlow: 0.2, weapons2D: true, weapons3D: true, brPins: { stat: false, pip: false }, uiScale: 1.2, autoScan: true, cutin: true, ui: Object.fromEntries(UI_OPTS.map((u) => [u[0], true])) };
  try { const s = JSON.parse(STORE.getItem('fleet.settings') || 'null'); if (s) { Object.assign(d.keys, s.keys || {}); Object.assign(d.ui, s.ui || {}); for (const k of ['queueMod', 'speedIdx', 'tacPause', 'bridgePause', 'brPins', 'cmdSlow', 'weapons2D', 'weapons3D', 'uiScale', 'autoScan', 'cutin']) if (s[k] != null) d[k] = s[k]; } } catch (e) { /* 用預設值 */ }
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
  if (opts.fire && opts.rotate) { rotateLines(U.uTime.value); fieldRepair(dt, U.uTime.value); }
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

