// ═══════════════════════ 地形畫法（只管畫面）═══════════════════════
// 近地戰場起伏地形（群山）的網格與材質。和玩法完全分開：
//   只讀 D.hf（(N+1)² 頂點高度）、D.extra（snow 雪線、alien）與場景配色 P；不寫 D，也不碰 H、C（玩法、重播只看那兩個）
//   對外只有三個函式：terrainBuild(P, D) 建網格、terrainSurfaceAt(D, x, z) 畫面上的地表高度、terrainUse(畫法) 切換畫法
//   之後要換成別的地形技術（clipmap、WebGPU…），只要在 TERRAIN_IMPLS 加一個畫法，其他檔案都不用改
// 畫法：
//   vcolor：舊的頂點色（草、岩、雪依高度與坡度），最便宜，給低階顯卡
//   splat ：自動材質（參考 Terrain3D 的 autoshader，MIT）：依坡度、高度混合草／岩／雪三層細節貼圖，
//           貼圖用 GPU 程序生成（不用下載），遠近兩種尺寸（dual scaling）、低頻扭曲＋大尺度調色（去重複感）、陡壁用側面投影
const TERRAIN = { impl: (typeof SETTINGS !== 'undefined' && SETTINGS.terrain) || 'splat', layers: null };   // 畫法存在設定裡（SETTINGS.terrain）

// 網格：和舊版一樣的 257² 平面（頂點高度＝D.hf），兩種畫法的地表形狀完全相同
function terrainGeo(D) {
  const N1 = GROUND_N + 1, g = new THREE.PlaneGeometry(GROUND_EXT * 2, GROUND_EXT * 2, GROUND_N, GROUND_N); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ix = Math.round((pos.getX(i) + GROUND_EXT) / GROUND_CELL), iz = Math.round((pos.getZ(i) + GROUND_EXT) / GROUND_CELL);
    pos.setY(i, GROUND_Y + D.hf[iz * N1 + ix]);
  }
  g.computeVertexNormals();
  return g;
}

const TERRAIN_IMPLS = {
  // 舊版：頂點色（草、岩、雪）＋通用地面材質
  vcolor(P, D) {
    const g = terrainGeo(D), pos = g.attributes.position, nrm = g.attributes.normal, cols = new Float32Array(pos.count * 3), sn = D.extra.snow;
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) - GROUND_Y, sl = 1 - nrm.getY(i), k = 0.85 + 0.3 * gNoise(pos.getX(i) / 40, pos.getZ(i) / 40, 5);
      let c = h < sn * 0.3 ? [0.06, 0.09, 0.045] : [0.11, 0.1, 0.085];
      if (sl > 0.35) c = [0.13, 0.12, 0.11];
      const snow = gSmooth(sn * 0.8, sn * 1.05, h) * (1 - gSmooth(0.45, 0.7, sl));
      cols[i * 3] = (c[0] * (1 - snow) + 0.42 * snow) * k; cols[i * 3 + 1] = (c[1] * (1 - snow) + 0.44 * snow) * k; cols[i * 3 + 2] = (c[2] * (1 - snow) + 0.5 * snow) * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.setAttribute('aWin', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
    return new THREE.Mesh(g, groundMat(P));
  },
  // 自動材質
  splat(P, D) {
    const L = terrainLayers(), sn = D.extra.snow;
    const m = new THREE.ShaderMaterial({
      uniforms: gUni(P, { uTL0: { value: L[0] }, uTL1: { value: L[1] }, uTL2: { value: L[2] }, uTSnow: { value: sn }, uTFar: { value: D.extra.alien ? 1 / 90 : 1 / 64 } }),
      vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: GROUND_FOG_GLSL + TERRAIN_SPLAT_FS,
    });
    GV.mats.push(m);   // 換地形時跟其他地面材質一起釋放
    return new THREE.Mesh(terrainGeo(D), m);
  },
};

// 自動材質的片段著色器。每像素讀貼圖：遠處 2～3 次，近處 2～6 次（只讀權重 > 0 的層、只在過渡帶讀兩種尺寸、只在陡壁讀側面）
const TERRAIN_SPLAT_FS = /* glsl */`
  uniform sampler2D uTL0; uniform sampler2D uTL1; uniform sampler2D uTL2;   // 草、岩、雪：rg＝細節法線、b＝高度、a＝亮度
  uniform float uTSnow; uniform float uTFar;
  varying vec3 vW; varying vec3 vN;
  const float NEAR_F = 1. / 8.;   // 近處：一張貼圖鋪 8 單位（約 1.6 公里）
  vec2 gX, gY;                    // 世界 xz 的螢幕導數（分支裡讀貼圖也能算對 mipmap）
  // 遠近兩種尺寸：kf＝0 只讀近、1 只讀遠，中間讀兩次混合
  vec4 lay2(sampler2D t, vec2 p, float s, float kf){
    vec4 a = vec4(0.), b = vec4(0.);
    if (kf < .995) { float f = NEAR_F * s; a = textureGrad(t, p * f, gX * f, gY * f); }
    if (kf > .005) { float f = uTFar * s; b = textureGrad(t, p * f + .37, gX * f, gY * f); }
    return mix(a, b, kf);
  }
  void main(){
    vec3 N = normalize(vN);
    float d = distance(vW, cameraPosition), h = vW.y - float(${GROUND_Y}), sl = 1. - N.y;
    gX = dFdx(vW.xz); gY = dFdy(vW.xz);
    float kf = smoothstep(60., 260., d);
    // 去重複感：低頻扭曲 UV（不影響導數）
    vec2 p = vW.xz + (vec2(gn(vW.xz / 37.), gn(vW.xz / 41. + 9.)) - .5) * 6.;
    float m1 = gn(vW.xz / 40.), m2 = gn(vW.xz / 260. + 7.);
    // autoshader：坡度 → 岩；高度 → 雪（陡坡積不了雪）；低處草、高處乾土
    float wS = smoothstep(uTSnow * .8, uTSnow * 1.05, h + (m2 - .5) * uTSnow * .25) * (1. - smoothstep(.45, .7, sl));
    float wR = smoothstep(.28, .42, sl + (m1 - .5) * .12) * (1. - wS);
    float wG = 1. - wR - wS;
    float dry = smoothstep(uTSnow * .25, uTSnow * .35, h + (m1 - .5) * uTSnow * .15);
    vec4 L0 = vec4(.5, .5, 0., .5), L1 = L0, L2 = L0;
    vec3 n1 = vec3(0.);
    if (wG > .01) L0 = lay2(uTL0, p, 1., kf);
    if (wS > .01) L2 = lay2(uTL2, p, .7, kf);
    if (wR > .01) {
      // 岩：平緩處用俯視投影，陡壁混入側面投影（避免貼圖被拉長）
      vec3 a = pow(abs(N), vec3(4.)); a /= a.x + a.y + a.z;
      L1 = a.y > .02 ? lay2(uTL1, p, 1.3, kf) * a.y : vec4(0.);
      n1 = vec3(L1.r - .5 * a.y, 0., L1.g - .5 * a.y);
      float fs = mix(NEAR_F, uTFar, kf) * 1.3;
      if (a.x > .02) { vec2 q = vW.zy * fs; vec4 s = textureGrad(uTL1, q, dFdx(vW.zy) * fs, dFdy(vW.zy) * fs); L1 += s * a.x; n1 += vec3(0., s.g - .5, s.r - .5) * a.x; }
      if (a.z > .02) { vec2 q = vW.xy * fs; vec4 s = textureGrad(uTL1, q, dFdx(vW.xy) * fs, dFdy(vW.xy) * fs); L1 += s * a.z; n1 += vec3(s.r - .5, s.g - .5, 0.) * a.z; }
    }
    // 高度混合：貼圖的高度決定交界的形狀（岩縫裡留雪、草從石頭間長出來）
    vec3 hw = vec3(wG, wR, wS), av = hw + vec3(L0.b, L1.b, L2.b) * .6 * step(.01, hw);
    float ma = max(av.x, max(av.y, av.z)) - .3;   // 交界的寬度（越大越柔和）
    vec3 r = max(av - ma, 0.) * step(.01, hw); r /= max(r.x + r.y + r.z, 1e-4);
    vec3 cG = mix(vec3(.06, .09, .045), vec3(.11, .1, .085), dry), cR = vec3(.13, .12, .11), cS = vec3(.42, .44, .5);
    vec3 alb = cG * (L0.a * 2.) * r.x + cR * (L1.a * 2.) * r.y + cS * (L2.a * 2.) * r.z;
    alb *= (.85 + .3 * m1) * (.9 + .2 * m2);   // 大尺度調色（同舊版的明暗起伏）
    // 細節法線：遠處淡出（避免閃爍）
    vec3 dn = vec3(L0.r - .5, 0., L0.g - .5) * r.x + n1 * r.y + vec3(L2.r - .5, 0., L2.g - .5) * r.z;
    N = normalize(N + dn * 1.6 * (1. - smoothstep(250., 1400., d)));
    float dif = max(dot(N, uSun), 0.);
    gl_FragColor = vec4(fogMix(alb * (uAmb + uLSun * dif), vW), 1.);
  }`;

// 三層細節貼圖（草、岩、雪）：第一次用到時在 GPU 上程序生成（512²、可無縫重複、含 mipmap），之後所有戰場共用
function terrainLayers() {
  if (TERRAIN.layers) return TERRAIN.layers;
  const S = 512, cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), sc = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({ uniforms: { uKind: { value: 0 } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: /* glsl */`
      uniform int uKind; varying vec2 vUv;
      float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float pn(vec2 p, float P){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);   // 週期 P 的值噪聲（可無縫重複）
        return mix(mix(hh(mod(i, P)), hh(mod(i + vec2(1., 0.), P)), f.x), mix(hh(mod(i + vec2(0., 1.), P)), hh(mod(i + 1., P)), f.x), f.y); }
      float fbm(vec2 uv, float P, int o){ float s = 0., a = .5, t = 0.; for (int k = 0; k < 6; k++) { if (k >= o) break; s += a * pn(uv * P, P); t += a; P *= 2.; a *= .5; } return s / t; }
      float H(vec2 uv){
        if (uKind == 0) return .6 * fbm(uv, 16., 5) + .4 * pn(uv * 128., 128.);                        // 草：細碎
        if (uKind == 1) { float s = fbm(uv, 4., 5), cr = 1. - abs(2. * fbm(uv + .5, 8., 4) - 1.);      // 岩：裂縫＋層理
          return .4 * s + .35 * pow(cr, 3.) + .25 * (.5 + .5 * sin(3.14159 * (6. * uv.y + 3. * s))); }
        return .75 * fbm(uv, 4., 4) + .25 * pn(uv * 64., 64.);                                          // 雪：平滑起伏
      }
      void main(){
        float e = 1. / ${S}., h = H(vUv), k = uKind == 0 ? 2.5 : uKind == 1 ? 6. : 1.5;
        vec2 g = vec2(H(vUv + vec2(e, 0.)) - H(vUv - vec2(e, 0.)), H(vUv + vec2(0., e)) - H(vUv - vec2(0., e))) * k;
        vec3 n = normalize(vec3(-g, 1.));
        float a = uKind == 0 ? .7 + .5 * fbm(vUv + .37, 8., 4) + .2 * (h - .5)
                : uKind == 1 ? .75 + .5 * h
                : .93 + .1 * h;
        gl_FragColor = vec4(n.xy * .5 + .5, h, clamp(a * .5, 0., 1.));
      }` });
  sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const prev = renderer.getRenderTarget(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  TERRAIN.layers = [0, 1, 2].map((k) => {
    const rt = new THREE.WebGLRenderTarget(S, S, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
    rt.texture.anisotropy = aniso;
    mat.uniforms.uKind.value = k; renderer.setRenderTarget(rt); renderer.render(sc, cam);
    return rt.texture;
  });
  renderer.setRenderTarget(prev);
  mat.dispose(); sc.children[0].geometry.dispose();
  return TERRAIN.layers;
}

// ───── 對外介面 ─────
// 建起伏地形的網格（呼叫端負責加到場景、換地形時釋放幾何）
function terrainBuild(P, D) {
  const m = (TERRAIN_IMPLS[TERRAIN.impl] || TERRAIN_IMPLS.vcolor)(P, D);
  m.frustumCulled = false;
  return m;
}
// 畫面上的地表高度（和網格的三角面完全一致）：只給貼地的畫面效果用（彈坑、殘骸）。玩法請用 terrainHAt
function terrainSurfaceAt(D, x, z) {
  if (!D || !D.hf) return GROUND_Y;
  const N1 = GROUND_N + 1, fx0 = (x + GROUND_EXT) / GROUND_CELL, fz0 = (z + GROUND_EXT) / GROUND_CELL;
  const ix = Math.min(GROUND_N - 1, Math.max(0, Math.floor(fx0))), iz = Math.min(GROUND_N - 1, Math.max(0, Math.floor(fz0)));
  const fx = Math.min(1, Math.max(0, fx0 - ix)), fz = Math.min(1, Math.max(0, fz0 - iz)), i = iz * N1 + ix, hf = D.hf;
  const h00 = hf[i], h10 = hf[i + 1], h01 = hf[i + N1], h11 = hf[i + N1 + 1];
  // PlaneGeometry 的對角線從 (0,1) 到 (1,0)
  return GROUND_Y + (fx + fz < 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz));
}
// 切換畫法（不給參數＝查目前的畫法）；換了會重建目前的近地場景
function terrainUse(v) {
  if (v === undefined || v === TERRAIN.impl || !TERRAIN_IMPLS[v]) return TERRAIN.impl;
  TERRAIN.impl = v;
  if (GRD && GRD.hf && GV.group) { GV.key = ''; groundSync(); }
  return TERRAIN.impl;
}
