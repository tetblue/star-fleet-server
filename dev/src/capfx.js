// ═══════════════════════ 艦長模式：改裝的外觀（2026-11-15） ═══════════════════════
// 船的 3D 模型在 main.js 畫（實例化）；這裡在每艘特製戰艦上再疊一層，照它裝的模組與 Mk 改變外觀：
//   塗裝層（同一個船體模型，沿法線外推一點）：每個模組一種塗裝樣式（主砲＝船頭、副砲＝船腰、飛彈艙＝甲板、引擎＝船尾、防禦＝全船）、
//     Mk 識別條紋（Mk II 一條、Mk III 兩條）、重裝甲＝面板接縫、反應裝甲＝磚塊與引信燈
//   護盾殼（強化護盾）：平常淡淡一層，被打到時亮起；其他船只有被打到護盾的瞬間閃一下
//   尾焰：原廠短而淡；巡航＝細長穩定；衝刺＝粗、閃爍，加速時拉長；機動＝主焰短＋四角姿態噴口，轉向、側移時噴
// 位置與方向照 main.js update3D 的艦長分支（前 s.F、上 s.U、長度 scale × TYPE_LEN3），所以會完全貼合。
const CAP_FX = {
  on: true,
  // 升級的外觀（塗裝樣式、Mk 條紋、裝甲花紋、各種引擎的尾焰、強化護盾的殼）：先關掉，升級目前只改數值（2026-11-15 使用者決定，計劃保留）
  // 關掉時每艘船都照原廠的樣子；被打到護盾閃一下、尾焰還是有。改成 true 就全部回來
  look: false,
  // 換武器（主砲、副砲模組）真的換武器模型：戰鬥中、整修庫都照玩家配置的武器（2026-11-15 使用者決定，跟 look 分開）
  wpn: true,
  push: 0.004,                        // 塗裝層沿法線外推（船長的比例）
  stripe: [0.30, 0.03, 0.06],        // Mk 條紋：從船尾算起的位置、寬、兩條的間距（船長的比例）
  shell: 1.32, shellMin: 0.22,        // 護盾殼：船體外框半徑 ×，最小（船長的比例）
  eng: {                              // 尾焰：長、寬（船長的比例）、亮度、閃爍、顏色（null＝陣營色）
    std: { len: 0.22, wid: 0.07, I: 0.55, fl: 0.08, col: null },
    cruise: { len: 0.55, wid: 0.05, I: 0.85, fl: 0.03, col: [0.65, 0.85, 1.0] },
    sprint: { len: 0.36, wid: 0.10, I: 1.0, fl: 0.25, col: [1.0, 0.72, 0.38], boost: 2.4 },
    agile: { len: 0.2, wid: 0.06, I: 0.7, fl: 0.1, col: [0.55, 1.0, 0.9], rcs: true },
  },
};
const CFX = { group: null, list: [], geo: {} };

// 塗裝層：模型座標（船頭＋z）；bmin／bmax＝船體外框
const capFxPaintMat = () => new THREE.ShaderMaterial({
  uniforms: { uBmin: { value: new THREE.Vector3() }, uBmax: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color() }, uMk: { value: 1 }, uArm: { value: 0 }, uLv: { value: new THREE.Vector4() }, uEng: { value: 0 }, uTime: U.uTime, uPush: { value: CAP_FX.push }, uCut: { value: 2 }, uDmg: { value: 0 }, uSt: { value: new THREE.Vector3(...CAP_FX.stripe) } },
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  vertexShader: /* glsl */`
    uniform float uPush; varying vec3 vP; varying vec3 vN;
    void main(){ vP = position; vN = normalize(normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uPush, 1.); }`,
  fragmentShader: /* glsl */`
    uniform vec3 uBmin; uniform vec3 uBmax; uniform vec3 uCol; uniform float uMk; uniform float uArm; uniform vec4 uLv; uniform float uEng; uniform float uTime; uniform vec3 uSt; uniform float uCut; uniform float uDmg;
    varying vec3 vP; varying vec3 vN;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
    // 三向投影的格線：k＝每單位幾格，w＝線寬（格的比例）；回傳 0～1（1＝在線上）
    vec2 tri(vec3 p, vec3 n, float k, float w, out vec2 cell){
      vec3 a = abs(n); vec2 uv = a.x > a.y && a.x > a.z ? p.zy : a.y > a.z ? p.xz : p.xy;
      uv *= k; cell = floor(uv); vec2 f = fract(uv);
      vec2 d = min(f, 1. - f); return vec2(1. - smoothstep(0., w, min(d.x, d.y)), length(f - 0.5));
    }
    void main(){
      vec3 n = normalize(cross(dFdx(vP), dFdy(vP))); float L = uBmax.z - uBmin.z, zN = (vP.z - uBmin.z) / L;
      vec4 c = vec4(0.);
      vec3 q = vP / L; float hw = max(1e-4, (uBmax.x - uBmin.x) * 0.5), xN = (vP.x - (uBmax.x + uBmin.x) * 0.5) / hw, yN = (vP.y - uBmin.y) / max(1e-4, uBmax.y - uBmin.y);
      float side = smoothstep(0.35, 0.6, abs(n.x)), top = smoothstep(0.3, 0.6, n.y), body = 1. - smoothstep(0.7, 0.85, abs(n.z));
      // ── 塗裝樣式：每個槽位的模組在自己的區域畫一種花紋（主砲＝船頭、副砲＝船腰一圈、飛彈艙＝甲板、引擎＝船尾、防禦＝全船）──
      // 防禦：重裝甲＝碎片迷彩（兩組斜格子疊出來的深色塊）；強化護盾＝甲板與側面的六角格（微微發光）
      if (uLv.w > 0.5 && uLv.w < 1.5) {
        vec2 uv = vec2(vP.z, vP.y + vP.x) / L; mat2 r1 = mat2(0.8, 0.6, -0.6, 0.8), r2 = mat2(0.5, -0.87, 0.87, 0.5);
        float sp = h21(floor(r1 * uv * 7.)) + h21(floor(r2 * uv * 5. + 3.1));
        c = mix(c, vec4(0.09, 0.1, 0.11, 0.62), step(1.1, sp));
      }
      if (uLv.w > 2.5) {
        vec3 a = abs(n); vec2 uv = (a.x > a.y && a.x > a.z ? q.zy : a.y > a.z ? q.xz : q.xy) * 26.; uv.x += mod(floor(uv.y), 2.) * 0.5;
        vec2 f = abs(fract(uv) - 0.5); float hx = smoothstep(0.43, 0.48, max(f.x * 1.15, f.y));
        c = mix(c, vec4(vec3(0.35, 0.85, 1.3) * (0.8 + 0.2 * sin(uTime * 2. + zN * 20.)), 0.38), hx * max(top, side) * body);
      }
      // 引擎（船尾，側面）：巡航＝三條往前收尖的藍色速度線；衝刺＝火焰；機動＝白色箭頭
      if (uEng > 0.5 && zN < 0.34) {
        if (uEng < 1.5) {
          float m = 0.; for (int k = 0; k < 3; k++) { float yc = 0.32 + 0.16 * float(k), w = 0.07 * (1. - zN / 0.3); m = max(m, (1. - smoothstep(w * 0.8, w, abs(yN - yc))) * step(0.02, zN) * step(zN, 0.3)); }
          c = mix(c, vec4(0.5, 0.78, 1.0, 0.95), m * side);
        } else if (uEng < 2.5) {
          float k = floor(yN * 4.), tg = 0.07 + 0.22 * pow(0.5 + 0.5 * cos(yN * 6.2832 * 2. + 0.8), 1.6) * (0.55 + 0.45 * h21(vec2(k, 3.)));
          float m = 1. - smoothstep(tg - 0.004, tg, zN), e = m * smoothstep(tg - 0.02, tg - 0.006, zN);
          vec3 fc = mix(vec3(0.85, 0.1, 0.03), vec3(1.0, 0.78, 0.12), clamp(zN / tg, 0., 1.));
          c = mix(c, vec4(fc, 0.96), m * side); c = mix(c, vec4(0.05, 0.03, 0.02, 0.95), e * side);
        } else {
          float ch = step(fract(zN * 20. + abs(yN - 0.5) * 2.6), 0.38) * step(0.05, zN) * step(zN, 0.27) * (1. - smoothstep(0.32, 0.38, abs(yN - 0.5)));
          c = mix(c, vec4(0.92, 0.94, 0.96, 0.95), ch * side);
        }
      }
      // 飛彈艙（甲板中段）：重飛彈＝黃黑箭頭；蜂群＝橘色點陣；機庫＝飛行甲板標線（白色虛線中線＋黃邊線）
      if (uLv.z > 0.5 && zN > 0.26 && zN < 0.64) {
        float m = 0., ok = top * body; vec4 col = vec4(0.);
        if (uLv.z < 1.5) { float cz = step(abs(xN), 0.24); float st = step(fract(zN * 28. - abs(xN) * 3.), 0.5); col = mix(vec4(0.06, 0.06, 0.05, 0.95), vec4(0.98, 0.78, 0.08, 0.95), st); m = cz; }
        else if (uLv.z < 2.5) { vec2 g = vec2(zN * 70., xN * 9.); float d = length(fract(g) - 0.5); m = (1. - smoothstep(0.22, 0.28, d)) * step(abs(xN), 0.7); col = vec4(1.0, 0.45, 0.08, 0.95); }
        else { float cl = step(abs(xN), 0.025) * step(fract(zN * 26.), 0.55), ed = step(abs(abs(xN) - 0.5), 0.022); m = max(cl, ed); col = mix(vec4(0.95, 0.95, 0.92, 0.95), vec4(0.98, 0.78, 0.1, 0.95), ed); }
        c = mix(c, col, m * ok);
      }
      // 副砲（船腰一圈，前後面不畫）：重型砲塔＝深灰寬帶＋白色細邊；防空砲塔＝黑白棋盤
      if (uLv.y > 0.5) {
        if (uLv.y < 1.5) { float b = step(abs(zN - 0.54), 0.04), e = step(abs(abs(zN - 0.54) - 0.043), 0.004); c = mix(c, vec4(0.16, 0.18, 0.21, 0.95), b * body); c = mix(c, vec4(0.95, 0.95, 0.95, 0.95), e * body); }
        else { float b = step(abs(zN - 0.545), 0.028), ck = mod(floor(zN * 140.) + floor((yN + xN) * 10.), 2.); c = mix(c, mix(vec4(0.05, 0.05, 0.05, 0.95), vec4(0.95, 0.95, 0.95, 0.95), ck), b * body); }
      }
      // 主砲（船頭）：磁軌砲＝甲板上兩條電藍色長條（有光點往前跑）；重粒子砲＝紅色船頭＋鋸齒邊；速射砲＝黃黑警示環；光束砲＝發光的電路紋
      if (uLv.x > 0.5) {
        if (uLv.x < 1.5) {
          float m = (1. - smoothstep(0.045, 0.06, abs(abs(xN) - 0.2))) * step(0.42, zN) * step(zN, 0.97) * top;
          c = mix(c, vec4(vec3(0.2, 0.55, 1.0) * (1. + 0.6 * step(0.8, fract(zN * 10. - uTime * 1.2))), 0.95), m);
        } else if (uLv.x < 2.5) {
          float ed = 0.84 + 0.03 * abs(fract(yN * 5. + abs(xN) * 3.) - 0.5) * 2., m = smoothstep(ed, ed + 0.003, zN), o = step(abs(zN - ed - 0.008), 0.006);
          c = mix(c, vec4(0.62, 0.05, 0.04, 0.96), m); c = mix(c, vec4(0.04, 0.03, 0.03, 0.96), o);
        } else if (uLv.x < 3.5) {
          float b = step(abs(zN - 0.83), 0.03), st = step(0.5, fract(zN * 45. + yN * 3. + xN * 1.5));
          c = mix(c, mix(vec4(0.05, 0.05, 0.04, 0.95), vec4(0.98, 0.78, 0.08, 0.95), st), b * body);
        } else if (zN > 0.7) {
          vec2 cell; vec2 g = tri(q, n, 34., 0.07, cell); float on = step(0.45, h21(cell + 11.)) * g.x * smoothstep(0.7, 0.8, zN);
          c = mix(c, vec4(vec3(0.5, 1.3, 1.6) * (0.7 + 0.5 * sin(uTime * 3. - zN * 40.)), 0.9), on);
        }
      }
      // 裝甲：重裝甲＝細的面板接縫＋每塊明暗不同；反應裝甲＝大一點的磚塊＋中間的引信燈
      if (uArm > 0.5) {
        vec2 cell; float rx = uArm > 1.5 ? 1. : 0.;
        vec2 g = tri(vP / L, n, rx > 0.5 ? 12. : 22., rx > 0.5 ? 0.1 : 0.07, cell);
        float shade = h21(cell) * 0.35;
        c = vec4(vec3(0.04, 0.045, 0.05), g.x * 0.9 + shade * 0.55);
        if (rx > 0.5) { float dot_ = 1. - smoothstep(0.13, 0.2, g.y); float bl = 0.55 + 0.45 * sin(uTime * 3. + h21(cell) * 40.); c = mix(c, vec4(1.6, 0.6, 0.15, 1.), dot_ * bl * step(0.35, h21(cell + 7.))); }
      }
      // Mk 條紋：繞船身一圈（船頭、船尾的面不畫）
      if (uMk > 1.5 && abs(n.z) < 0.6) {
        float s = 0.;
        for (int k = 0; k < 2; k++) { if (float(k) > uMk - 1.5 - 0.5) break; float z0 = uSt.x + float(k) * uSt.z; s = max(s, 1. - smoothstep(uSt.y * 0.4, uSt.y * 0.5, abs(zN - z0))); }
        c = mix(c, vec4(uCol * 1.35, 0.95), s);
      }
      // uCut: the new paint is only shown up to this point from the stern (refit sweep)
      if (zN > uCut) c = vec4(0.);
      float sweep = 1. - smoothstep(0., 0.012, abs(zN - uCut));
      if (uCut < 1.5) c = mix(c, vec4(0.6, 0.9, 1.4, 0.9), sweep);
      // uDmg: burn marks (repair)
      if (uDmg > 0.001) {
        float nz = vn(vP / L * 14.) * 0.65 + vn(vP / L * 41.) * 0.35, b = uDmg * 0.75;
        float burn = 1. - smoothstep(b - 0.015, b, nz), edge = burn * smoothstep(b - 0.07, b - 0.015, nz);
        c = mix(c, vec4(0.03, 0.025, 0.02, 0.88), burn);
        c = mix(c, vec4(1.5, 0.55, 0.12, 1.), edge * (0.6 + 0.4 * sin(uTime * 6. + nz * 40.)));
      }
      if (c.a < 0.01) discard;
      gl_FragColor = c;
    }`,
});
// 護盾殼：邊緣亮的球（菲涅耳）＋六角格
const capFxShellMat = () => new THREE.ShaderMaterial({
  uniforms: { uCol: { value: new THREE.Color() }, uI: { value: 0 }, uTime: U.uTime },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  vertexShader: /* glsl */`
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vP = position; vec4 w = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-w.xyz); gl_Position = projectionMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform vec3 uCol; uniform float uI; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){
      float fr = pow(1. - abs(dot(normalize(vN), normalize(vV))), 3.);
      vec2 q = vec2(atan(vP.z, vP.x) * 4.5, vP.y * 9.); q.x += mod(floor(q.y), 2.) * 0.5;
      vec2 f = abs(fract(q) - 0.5); float hex = smoothstep(0.38, 0.47, max(f.x, f.y));
      float wave = 0.75 + 0.25 * sin(uTime * 4. - vP.y * 12.);
      gl_FragColor = vec4(uCol * (fr * 1.1 + hex * 0.35 * (0.3 + fr)) * uI * wave, 1.);
    }`,
});
// 尾焰：沿 −z 的十字片；u＝0 在噴口、1 在尾端
const capFxFlameMat = () => new THREE.ShaderMaterial({
  uniforms: { uCol: { value: new THREE.Color() }, uI: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: /* glsl */`
    uniform vec3 uCol; uniform float uI; varying vec2 vUv;
    void main(){
      float u = 1. - vUv.y, w = abs(vUv.x - 0.5) * 2.;
      float body = (1. - smoothstep(0.0, 1.0 - u * 0.75, w)) * pow(1. - u, 1.4);
      float core = (1. - smoothstep(0.0, 0.32 * (1. - u), w)) * pow(1. - u, 3.);
      gl_FragColor = vec4((uCol * body * 0.9 + vec3(1.) * core * 0.8) * uI, 1.);
    }`,
});
function capFxGeo() {
  const G = CFX.geo;
  if (!G.flame) {   // 兩片互相垂直的板子（長 1、寬 1，噴口在 z＝0，往 −z 延伸）
    const a = new THREE.PlaneGeometry(1, 1); a.translate(0, -0.5, 0); a.rotateX(Math.PI / 2);   // 板子在 xz 平面，uv.y 沿 −z
    const b = a.clone(); b.rotateZ(Math.PI / 2);
    G.flame = mergeGeos([a, b]);
    G.shell = new THREE.SphereGeometry(1, 36, 18);
  }
  return G;
}
function mergeGeos(list) {
  const pos = [], uv = [], idx = []; let off = 0;
  for (const g of list) { const p = g.attributes.position.array, u = g.attributes.uv.array; pos.push(...p); uv.push(...u); for (const i of g.index.array) idx.push(i + off); off += p.length / 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
// 塗裝樣式的編號（給塗裝層的 uLv＝主砲、副砲、飛彈艙、防禦；uEng＝引擎）；0＝原廠、沒有花紋
const CAP_LIVERY = { main: ['rail', 'heavy', 'rapid', 'beam'], tur: ['heavy', 'aa'], msl: ['heavy', 'swarm', 'hangar'], def: ['armor', 'react', 'shield'], eng: ['cruise', 'sprint', 'agile'] };
function capFxLv(mod) { const id = (k) => CAP_LIVERY[k].indexOf((mod || {})[k]) + 1; return { v: [id('main'), id('tur'), id('msl'), id('def')], eng: id('eng') }; }
function capFxSetPaint(m, mod, mk, def) { const L = capFxLv(mod); m.uniforms.uLv.value.set(...L.v); m.uniforms.uEng.value = L.eng; m.uniforms.uMk.value = mk; m.uniforms.uArm.value = def === 'armor' ? 1 : def === 'react' ? 2 : 0; }
// 這艘船的外觀設定：模組、Mk（取最高的槽位）
function capFxSpec(s) {
  if (!CAP_FX.look) return { eng: 'std', def: '', mk: 1, mod: {}, lv: false };
  const mod = (s.H && s.H.mod) || {}, mk = (s.H && s.H.mk) || {};
  let m = 1; for (const k in mk) m = Math.max(m, mk[k] || 1);
  return { eng: mod.eng || 'std', def: mod.def || '', mk: m, mod, lv: CAP_SLOTS.some(([k]) => mod[k]) };
}
function capFxBuild() {
  capFxClear();
  if (!CAP_FX.on || !R3.ready) return;
  const G = capFxGeo(); CFX.group = new THREE.Group(); scene.add(CFX.group);
  for (const s of CAP.ships) {
    const hk = hullKey(s.i), M = R3.models[hk], geo = M && M.lods && M.lods[0]; if (!geo) continue;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox, sp = capFxSpec(s), fac = FACTION[shipFac(s.i)] || FACTION[0];
    const root = new THREE.Group(); root.matrixAutoUpdate = false; CFX.group.add(root);
    const o = { s, root, sp, bb, paint: null, shell: null, flames: [] };
    if (sp.mk > 1 || sp.lv) {
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const m = capFxPaintMat(); m.uniforms.uBmin.value.copy(bb.min); m.uniforms.uBmax.value.copy(bb.max); m.uniforms.uCol.value.set(fac.ui); capFxSetPaint(m, sp.mod, sp.mk, sp.def);
      o.paint = new THREE.Mesh(geo, m); o.paint.renderOrder = 3; root.add(o.paint);
    }
    { // 護盾殼（每艘都有；平常只有強化護盾看得到）
      const m = capFxShellMat(); m.uniforms.uCol.value.copy(fac.glow);
      const sh = new THREE.Mesh(G.shell, m), c = bb.getCenter(new THREE.Vector3()), z = bb.getSize(new THREE.Vector3()), k = CAP_FX.shell;
      sh.position.copy(c); sh.scale.set(Math.max(CAP_FX.shellMin, z.x * 0.5 * k), Math.max(CAP_FX.shellMin * 0.7, z.y * 0.5 * k), Math.max(CAP_FX.shellMin, z.z * 0.5 * k)); sh.renderOrder = 4;
      o.shell = sh; root.add(sh);
    }
    { // 尾焰：主焰在船尾中央；機動引擎多四個姿態噴口
      const E = CAP_FX.eng[sp.eng] || CAP_FX.eng.std, c = bb.getCenter(new THREE.Vector3()), z = bb.getSize(new THREE.Vector3());
      const col = E.col ? new THREE.Color(...E.col) : fac.glow.clone();
      const add = (x, y, zz, dir, main, side = 0, front = 0) => { const m = capFxFlameMat(); m.uniforms.uCol.value.copy(col); const f = new THREE.Mesh(G.flame, m); f.position.set(x, y, zz); if (dir) f.rotation.y = dir; f.renderOrder = 4; root.add(f); o.flames.push({ f, main, E, side, front }); };
      add(c.x, c.y, bb.min.z + z.z * 0.02, 0, true);
      if (E.rcs) for (const sx of [-1, 1]) for (const zz of [0.18, 0.8]) add(c.x + sx * z.x * 0.42, c.y, bb.min.z + z.z * zz, -sx * Math.PI / 2, false, sx, zz > 0.5 ? 1 : -1);   // 側噴口：朝外
    }
    CFX.list.push(o);
  }
}
function capFxClear() {
  if (CFX.group) { scene.remove(CFX.group); CFX.group.traverse((o) => { if (o.material) o.material.dispose(); }); }
  CFX.group = null; CFX.list = [];
}
const _fxa = new THREE.Vector3(), _fxm = new THREE.Matrix4(), _fxr = new THREE.Vector3(), _fxu = new THREE.Vector3(), _fxf = new THREE.Vector3();
// 每一幀（capCamera 呼叫）：跟著船擺好、更新尾焰長度與護盾亮度
function capFxFrame() {
  if (!CAP_FX.on) return;
  if (!CFX.group && R3.ready && CAP.ships.length) capFxBuild();
  if (!CFX.group) return;
  CFX.group.visible = !!mode3D;
  const t = U.uTime.value, now = performance.now() / 1000;
  for (const o of CFX.list) {
    const s = o.s, i = s.i;
    if (s.dead || !ships.alive[i] || s.q.hidden) { o.root.visible = false; continue; }
    o.root.visible = true;
    shipWorldCPU(i, _fxa);
    const L = shipGeo.getAttribute('aScale').array[i] * TYPE_LEN3;
    _fxf.set(s.F[0], s.F[1], s.F[2]); _fxu.set(s.U[0], s.U[1], s.U[2]);
    _fxr.crossVectors(_fxu, _fxf).normalize(); _fxu.crossVectors(_fxf, _fxr);
    _fxm.makeBasis(_fxr, _fxu, _fxf).scale(_fxa.set(L, L, L)); shipWorldCPU(i, _fxa); _fxm.setPosition(_fxa);
    o.root.matrix.copy(_fxm); o.root.matrixWorldNeedsUpdate = true;
    // 護盾：強化護盾平常 0.12；護盾還在時被打到亮起來（0.6 秒退掉）
    const shUp = ships.sh[i] > 0.5, hit = Math.max(0, 1 - (t - (s.hitT || -9)) / 0.6);
    o.shell.material.uniforms.uI.value = shUp ? (o.sp.def === 'shield' ? 0.06 + hit * 0.45 : hit * 0.28) : 0;
    o.shell.visible = o.shell.material.uniforms.uI.value > 0.005;
    // 尾焰：照推力、速度；衝刺引擎加速時拉長；機動引擎的側噴口照轉向、側移
    const H = s.H, thr = Math.max(0, s.inp ? s.inp.thr : 0.5), sp = Math.min(1.2, (s.spd || 0) / Math.max(1, H.max || H.cruise || 1));
    const turn = Math.min(1, Math.abs(s.yr || 0) / Math.max(0.1, (H.turn || 30) * DEG)), str = s.inp ? s.inp.strafe || 0 : 0;
    for (const F of o.flames) {
      const E = F.E, fl = 1 + (Math.sin(now * 37 + i * 1.7) * 0.6 + Math.sin(now * 23.3 + i) * 0.4) * E.fl;
      let len, wid, I;
      if (F.main) {
        const b = s.boosting && E.boost ? E.boost : s.boosting ? 1.5 : 1;
        len = E.len * (0.45 + 0.4 * thr + 0.3 * sp) * b * fl; wid = E.wid * (s.boosting ? 1.2 : 1); I = E.I * (0.6 + 0.4 * thr) * (s.boosting ? 1.25 : 1);
      } else {   // 側噴口：轉向＝前後兩側反向噴；側移＝同一側全部噴
        const want = Math.max(0, F.side * F.front * Math.sign(s.yr || 0) * turn, F.side * str);
        len = 0.09 * want * fl; wid = 0.03; I = 0.9 * want;
      }
      F.f.visible = len > 0.004 && I > 0.02;
      F.f.scale.set(wid, wid, len); F.f.material.uniforms.uI.value = I;
    }
  }
}
// ───── B：換武器模型（主砲、副砲照模組換成別的砲塔模型；位置、方向照原本的掛點）─────
// 模組 → 武器模型。戰艦可以裝別的陣營的武器（藍圖＋仿製，CC_ORG），所以模型照「武器的風格」選，不是照船：
//   org＝這個模組是哪個陣營的技術（跟 capcareer.js 的 CC_ORG 一致）：不管裝在誰的船上都用那個陣營的模型；沒有 org＝通用模組，用船自己的風格
//   e／a／m／c／r／i／b＝那個風格指定的模型鍵；w＝帝國、聯盟、傭兵的第幾號武器（WEAPON_NAMES）；
//   其他風格（將來擄獲的外星船）沒有指定時，照 role 找那個風格的同類武器（m 主砲、s 副砲、a 防空）；k＝尺寸倍率
// 之後有專屬的武器模型，改這張表就好
const CAP_WLOOK = {
  main: {
    heavy: { org: 'e', w: 0, role: 'm', k: 1.12 },     // 重粒子砲（帝國）：三聯裝巨砲塔，大一點
    rail: { e: 'ew5', a: 'aw5', m: 'mw1', c: 'cw3', r: 'rw2', i: 'iw2', b: 'bw2', role: 'm', k: 1 },   // 磁軌砲（通用）：各風格的長砲管主砲
    rapid: { org: 'm', w: 3, role: 'a', k: 1.35 },     // 速射砲（海盜）：傭兵的雙管機砲塔放大
    beam: { org: 'a', a: 'rw0', role: 'm', k: 1 },     // 光束砲（聯盟）：聯盟沒有光束砲模型，借機械智慧族的稜形激光砲塔
  },
  tur: {
    heavy: { w: 1, role: 's', k: 1.25 },               // 重型副砲（通用）：雙聯裝砲塔放大
    aa: { w: 3, role: 'a', k: 1 },                     // 防空副砲（通用）：防空砲塔
  },
};
// 某個風格的某類武器（role）是第幾號：先找會轉的砲塔，沒有就找固定砲；那個風格沒有這一類＝主砲
function capRoleW(st, role) {
  const fi = 'eamcrib'.indexOf(st), gk = WEAPON_GK[fi] || '', rig = WEAPON_RIG[fi] || '';
  for (const want of ['t', 'f']) for (let w = 0; w < 6; w++) if (gk[w] === role && rig[w] === want) return w;
  return role === 'm' ? 0 : capRoleW(st, 'm');
}
// 模組在某個風格的船上用哪個武器模型（null＝表裡沒有，照原本的）
function capWKey(st, slot, mod) {
  const L = slot && mod && mod[slot] && CAP_WLOOK[slot] && CAP_WLOOK[slot][mod[slot]]; if (!L) return null;
  const ws = L.org || st;
  return { L, key: L[ws] || (L.w != null && 'eam'.includes(ws) ? ws + 'w' + L.w : ws + 'w' + capRoleW(ws, L.role || 'm')) };
}
// 每個掛點屬於哪個槽位：主砲＝跟主砲開火的掛點；船型沒有主砲掛點（例如支援艦全是防空砲塔）＝最大的那一座當主砲
function capMountSlots(raw) {
  const gkOf = (m) => { const fi = 'eamcrib'.indexOf(m.hk[0]); return fi < 0 ? '' : WEAPON_GK[fi][m.w]; };
  const out = raw.map((m) => (gkOf(m) === 'm' ? 'main' : gkOf(m) === 's' ? 'tur' : null));
  if (!out.includes('main') && raw.length) { let b = 0; raw.forEach((m, j) => { if ((m.s || 0.1) > (raw[b].s || 0.1)) b = j; }); out[b] = 'main'; }
  return out;
}
// 換成的武器鍵與新掛點（不用換＝null）；m＝原始掛點資料（mountsOf），mm＝main.js 算好的掛點，slot＝capMountSlots 給的槽位
function capSwapMount(m, mm, mod, slot) {
  const st = m.hk[0]; if ('eamcrib'.indexOf(st) < 0) return null;
  const X = capWKey(st, slot, mod); if (!X) return null;
  const { L, key } = X;
  if (!key || (key === mm.wk && L.k === 1) || !R3.models[key]) return null;   // 同一個模型：只有要放大才換
  const n = mountMatrix({ ...m, hk: key[0] + m.hk.slice(1), w: +key.slice(2), s: (m.s || 0.1) * L.k });
  n.rig = { ...n.rig, g: mm.rig.g };   // 開火動畫照原本槽位的砲（換成防空砲塔的主砲也跟主砲開火）
  return n;
}
// 跟 main.js rebuild3D 一樣的掛點清單（順序一致，j 才對得上）
function capMountRaw(tk) {
  if (typeof mountsOf !== 'function') return null;
  const st = SHIP_TYPES[+tk.slice(1)], own = R3.models[tk] || st.look == null, src = own ? tk : tk[0] + st.look;
  let list = mountsOf(src).filter((m) => R3.models[mountMatrix(m).wk]);
  if (!own) list = list.filter((m) => mountMatrix(m).wk.endsWith('w3'));
  return list;
}
function capShipMods(i) { if (!CAP_FX.wpn) return null; const k = CAP.byI && i < CAP.byI.length ? CAP.byI[i] : -1, s = k >= 0 ? CAP.ships[k] : null, mod = s && s.H && s.H.mod; return mod && (mod.main || mod.tur) ? { s, mod } : null; }
const capShipOf = (i) => { const k = CAP.byI && i < CAP.byI.length ? CAP.byI[i] : -1; return k >= 0 ? CAP.ships[k] : null; };

// ───── 槽位制度第 4 步：發佈的艦種模型、裝備照槽位裝在船上 ─────
// 發佈的模型：這一級沒發佈就用往下最近一級的；都沒有＝null（照原本借用勢力船體）
function capHullModel(s) {
  const P = s && CAP_HULL_PUB[s.key]; if (!P) return null;
  for (let l = Math.min(4, (s.lv || 1) - 1); l >= 0; l--) if (P[l] && R3.models[P[l].model]) return { key: P[l].model, pub: P[l] };
  return null;
}
// main.js rebuild3D／update3D：艦長的船用哪個船體模型（null＝原本的 hullKey）
function capHull3D(i) { const H = CAP.on && capHullModel(capShipOf(i)); return H ? H.key : null; }
// 發佈的模型在用到前要先下載（sy 開頭的鍵是「用到才下載」）：開機讀完 hulls.json 就先載好
function capPubPreload() {
  const keys = [...new Set(Object.values(CAP_HULL_PUB).flat().filter(Boolean).map((P) => P.model))];
  if (!keys.length || typeof ensureModels !== 'function') return Promise.resolve();
  return ensureModels(keys).then(() => { if (R3.ready) for (const k of keys) if (MODEL_SRC[k] && !R3.models[k]) R3.models[k] = getModel(k); R3.version = -1; });
}
// 裝備 → 武器模型鍵（st＝風格）與尺寸倍率；艦載機、輔助裝備還沒有模型（null）
const CAP_GEAR_CK = (G) => (!G ? null : G.cls === 'main' ? 'main' : G.kind === 'gun' ? 'sec' : G.kind === 'pod' ? 'msl' : G.cls === 'aa' ? 'aa' : null);
const CAP_CK_G = { main: 0, sec: 1, aa: 2, msl: 3 };
function capRoleAny(st, role) { const fi = 'eamcrib'.indexOf(st), gk = WEAPON_GK[fi] || ''; for (let w = 0; w < 6; w++) if (gk[w] === role) return w; return -1; }
function capGearWKey(st, g) {
  const G = CAP_GEAR[g], ck = CAP_GEAR_CK(G); if (!ck) return null;
  if ('eamcrib'.indexOf(st) < 0) st = 'e';
  let key = null, k = 1;
  if (ck === 'main' || ck === 'sec') {
    const X = G.mod && capWKey(st, ck === 'main' ? 'main' : 'tur', { [ck === 'main' ? 'main' : 'tur']: G.mod });
    if (X) { key = X.key; k = X.L.k || 1; } else key = st + 'w' + capRoleW(st, ck === 'main' ? 'm' : 's');
  } else if (ck === 'aa') { key = st + 'w' + capRoleW(st, 'a'); if (g === 'lpd') k = 1.1; }
  else { const w = capRoleAny(st, 'x'); key = w >= 0 ? st + 'w' + w : null; if (g === 'hpod') k = 1.2; }
  return key && R3.models[key] ? { key, k, ck } : null;
}
// 發佈模型的槽位（設計座標：公尺、+x 船首）→ 船體模型座標（船長＝1、+z 船首）：套伺服器算的 orient
const _sv = new THREE.Vector3(), _sf = new THREE.Vector3(), _su = new THREE.Vector3(), _sr = new THREE.Vector3(), _sE = new THREE.Euler(), _sM = new THREE.Matrix4(), _sO = new THREE.Matrix4(), _sN = new THREE.Matrix3();
const CAP_SLOT_LEN = { main: 0.075, sec: 0.05, aa: 0.032, ftr: 0.05, aux: 0.04 };   // 發佈的船上，裝備的大小（船長的比例）
function capWeapLen(wk) { const g = MODEL_SRC[wk] && MODEL_SRC[wk].lods[0]; if (!g) return 1; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox; return Math.max(1e-3, b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z); }
function capPubMount(model, P, slotKind, W) {
  const man = MODEL_LOAD.man && MODEL_LOAD.man.models[model]; if (!man || !man.orient) return null;
  _sO.fromArray(man.orient); _sN.setFromMatrix4(_sO);
  const r = P.r || [0, 0, 0]; _sM.makeRotationFromEuler(_sE.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ'));
  _sf.set(1, 0, 0).applyMatrix4(_sM).applyMatrix3(_sN).normalize(); _su.set(0, 1, 0).applyMatrix4(_sM).applyMatrix3(_sN).normalize();
  _sr.crossVectors(_su, _sf).normalize(); _su.crossVectors(_sf, _sr).normalize();
  _sv.fromArray(P.p).applyMatrix4(_sO);
  const sc = (CAP_SLOT_LEN[slotKind] || 0.05) * W.k / capWeapLen(W.key);
  const ax = [_sr.x, _sr.y, _sr.z, _su.x, _su.y, _su.z, _sf.x, _sf.y, _sf.z];
  return { wk: W.key, o: [_sv.x, _sv.y, _sv.z], q: ax.map((v) => v * sc), ax, small: W.ck === 'aa', rig: { ...rigSpec(W.key), g: CAP_CK_G[W.ck] }, parts: !!MODEL_SRC[W.key].lods[0].attributes.aPart, ck: W.ck, slot: P.id };
}
// 舊艦種：槽位位置照船型原本的武器掛點（主砲槽＝主砲掛點、副砲槽＝副砲與飛彈掛點、防空槽＝防空掛點，依序分配）；
// 沒分到槽位的掛點照原樣畫（裝飾，不當砲口）；分到的槽位空著＝那個掛點不畫
function capOldSlotMounts(s, tk, live, st) {
  const raw = tk && capMountRaw(tk), base = R3.mounts && R3.mounts[tk]; if (!raw || !base || raw.length !== base.length) return null;   // 2D 畫面（還沒建 3D）＝沒有掛點
  const role = raw.map((m) => { const fi = 'eamcrib'.indexOf(m.hk[0]); return fi < 0 ? '' : WEAPON_GK[fi][m.w]; }), sl = capMountSlots(raw);
  const pool = { main: [], sec: [], aa: [] };
  raw.forEach((m, j) => (sl[j] === 'main' ? pool.main : role[j] === 'a' ? pool.aa : pool.sec).push(j));
  const used = new Map();
  for (const [S, e] of live) {
    const P = S.kind === 'main' ? (pool.main.length ? pool.main : pool.sec) : pool[S.kind]; if (!P || !P.length) continue;
    used.set(P.shift(), [S, e]);
  }
  const out = [];
  base.forEach((mm, j) => {
    if (!used.has(j)) { out.push(mm); return; }
    const [S, e] = used.get(j), W = e.g && capGearWKey(st, e.g); if (!W) return;
    const m = raw[j], n = mountMatrix({ ...m, hk: W.key[0] + m.hk.slice(1), w: +W.key.slice(2), s: (m.s || 0.1) * W.k });
    n.wk = W.key; n.rig = { ...rigSpec(W.key), g: CAP_CK_G[W.ck] }; n.parts = !!MODEL_SRC[W.key].lods[0].attributes.aPart; n.ck = W.ck; n.slot = S.id;
    out.push(n);
  });
  return out;
}
// 這艘船照槽位的掛點清單（沒有槽位裝備的船＝null，照舊的模組換模型）
function capSlotMounts(s, tk) {
  const eq = s.H && s.H.eq; if (!eq || !CAP_FX.wpn) return null;
  const live = capEqLive(s.key, s.lv || 1, eq).filter(([S, e]) => e.g && capGearFits(S.kind, e.g)), st = FAC_KEY[shipFac(s.i)];
  const HM = capHullModel(s);
  if (!HM) return capOldSlotMounts(s, tk, live, st);
  const out = [];
  for (const [S, e] of live) {
    const P = HM.pub.slots && HM.pub.slots[S.id], W = P && capGearWKey(st, e.g); if (!W) continue;
    const m = capPubMount(HM.key, { ...P, id: S.id }, S.kind, W); if (m) out.push(m);
  }
  return out;
}
// main.js rebuild3D：多留換上去的武器模型的容量
function capMountCap(cap) {
  for (const s of CAP.ships) {
    const tk = typeKey(s.i), L = capSlotMounts(s, tk);
    if (L) { for (const m of L) if (m.ck) cap[m.wk] = (cap[m.wk] || 0) + 1; continue; }
    const X = capShipMods(s.i); if (!X) continue;
    const raw = capMountRaw(tk), base = R3.mounts[tk]; if (!raw || !base || raw.length !== base.length) continue;
    const sl = capMountSlots(raw); raw.forEach((m, j) => { const n = capSwapMount(m, base[j], X.mod, sl[j]); if (n) cap[n.wk] = (cap[n.wk] || 0) + 1; });
  }
}
// main.js writeMounts：這艘船的掛點清單（沒有改裝＝null，用原本的）
function capMountList(i, hk) {
  const s = capShipOf(i); if (!s) return null;
  if (!CAP_FX.wpn) return capHullModel(s) ? [] : null;   // 發佈的船體上沒有勢力船體的掛點：不畫武器
  const HM = capHullModel(s), sig = `${R3.version}|${hk}|${s.lv}|${HM ? HM.key : ''}|${JSON.stringify((s.H && s.H.eq) || s.H.mod || '')}`;
  if (s.mountSig === sig) return s.mounts;
  s.mountSig = sig; s.mounts = null;
  const L = capSlotMounts(s, hk);
  if (L) {
    if (L.some((m) => !R3.meshByKey[m.wk])) { R3.version = -1; s.mountSig = null; return L.filter((m) => R3.meshByKey[m.wk]); }   // 新的武器模型還沒有容量：下一幀重建
    return (s.mounts = L);
  }
  if (HM) return (s.mounts = []);
  const X = capShipMods(i); if (!X) return null;
  const raw = capMountRaw(hk), base = R3.mounts && R3.mounts[hk]; if (!raw || !base || raw.length !== base.length) return null;
  const sl = capMountSlots(raw);
  s.mounts = base.map((mm, j) => { const n = capSwapMount(raw[j], mm, X.mod, sl[j]); return n && R3.meshByKey[n.wk] ? n : mm; });
  return s.mounts;
}

// ───── 每門武器自己的發射點 ─────
// 武器模型座標裡的砲口：分件模型＝每根砲管（aPart 2+k）最前端的中心；沒分件＝整座最前端（+z）的中心；飛彈發射器＝頂面中心
// 回傳 { tips: [{ p, piv }]（piv＝砲管的仰角軸心，沒分件＝null）, yc: 轉塔的方位軸心 [x, z], turn: 會不會轉 }
function capMuzLocal(wk) {
  const C = CFX.muz || (CFX.muz = {}); if (C[wk]) return C[wk];
  const src = MODEL_SRC[wk], g = src && src.lods[0]; if (!g) return (C[wk] = { tips: [{ p: [0, 0, 0], piv: null }], yc: [0, 0], turn: false });
  const P = g.attributes.position, pa = g.attributes.aPart, pv = g.attributes.aPiv, n = P.count, sp = rigSpec(wk);
  let yc = [0, 0], ycOk = false;
  const front = (ids) => {   // 一群頂點的最前端：最前面 8% 長度內的頂點取平均
    let z0 = Infinity, z1 = -Infinity; for (const i of ids) { const z = P.getZ(i); if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const cut = z1 - Math.max(1e-4, (z1 - z0) * 0.08); let x = 0, y = 0, c = 0;
    for (const i of ids) if (P.getZ(i) >= cut) { x += P.getX(i); y += P.getY(i); c++; }
    return [x / c, y / c, z1];
  };
  const all = Array.from({ length: n }, (_, i) => i), tips = [];
  if (sp.mode === 'l' || sp.g === 3) {   // 飛彈：從頂面出去
    let y1 = -Infinity; for (const i of all) y1 = Math.max(y1, P.getY(i));
    let x = 0, z = 0, c = 0; for (const i of all) if (P.getY(i) >= y1 - 1e-3 - 0.05 * Math.abs(y1)) { x += P.getX(i); z += P.getZ(i); c++; }
    tips.push({ p: [x / c, y1, z / c], piv: null });
  } else {
    const parts = new Map();
    if (pa) for (let i = 0; i < n; i++) { const k = Math.round(pa.getX(i)); if (k === 1 && !ycOk) { yc = [pv.getX(i), pv.getZ(i)]; ycOk = true; } if (k >= 2 && k < 10) (parts.get(k) || parts.set(k, []).get(k)).push(i); }
    for (const k of [...parts.keys()].sort((a, b) => a - b)) { const ids = parts.get(k); tips.push({ p: front(ids), piv: [pv.getX(ids[0]), pv.getY(ids[0]), pv.getZ(ids[0])] }); }
    if (!tips.length) tips.push({ p: front(all), piv: null });
  }
  return (C[wk] = { tips, yc, turn: sp.mode === 't' || sp.mode === 'f' });
}
// 這艘船每一類武器（main 主砲、sec 副砲、aa 防空、msl 飛彈）有哪些砲口：[[掛點 j, 砲管 b], …]
function capMuzGroups(s) {
  const hk = typeKey(s.i), list = (CAP.on && capMountList(s.i, hk)) || (R3.mounts && R3.mounts[hk]);
  if (s.muzG && s.muzG.list === list && s.muzG.v === R3.version) return s.muzG;
  const G = { list, v: R3.version, main: [], sec: [], aa: [], msl: [], mainJ: [] };
  if (list && list.length) {
    const bySlot = list.some((m) => m.ck);   // 照槽位的掛點：只有裝了武器的槽位當砲口（舊艦種沒分到槽位的掛點只是裝飾）
    const raw = bySlot ? null : capMountRaw(hk), sl = raw && raw.length === list.length ? capMountSlots(raw) : null;
    list.forEach((m, j) => {
      if (!MODEL_SRC[m.wk] || (bySlot && !m.ck)) return;
      const g = m.rig.g, k = bySlot ? m.ck : sl && sl[j] === 'main' ? 'main' : g === 3 ? 'msl' : g === 2 ? 'aa' : g === 0 && !sl ? 'main' : 'sec';
      const T = capMuzLocal(m.wk); T.tips.forEach((_, b) => G[k].push([j, b]));
      if (k === 'main') G.mainJ.push(j);
    });
    if (!G.sec.length) G.sec = G.aa.length ? G.aa : G.main;
    if (!G.aa.length) G.aa = G.sec;
    if (!G.main.length) G.main = G.sec;
  }
  return (s.muzG = G);
}
// 第 n 個砲口的世界座標（砲塔現在的方位、砲管仰角都算進去）；這艘船沒有這類武器的模型＝null
function capMuzzleAt(s, kind, n, out = []) {
  const G = capMuzGroups(s), L = G[kind]; if (!L || !L.length || !G.list) return null;
  const [j, b] = L[((n % L.length) + L.length) % L.length];
  return capMuzzleJB(s, G, j, b, out);
}
// 多門主砲一起開火：每一門主砲各一個砲口（第 n 次開火輪到每門的第 n 根砲管）
function capMuzzleMains(s, n) {
  const G = capMuzGroups(s); if (!G.list || G.mainJ.length < 2) return null;
  return G.mainJ.map((j) => capMuzzleJB(s, G, j, n % capMuzLocal(G.list[j].wk).tips.length, []));
}
function capMuzzleJB(s, G, j, b, out) {
  const m = G.list[j], T = capMuzLocal(m.wk), tip = T.tips[b % T.tips.length];
  let x = tip.p[0], y = tip.p[1], z = tip.p[2];
  const ok = RIG.ver === fleetVersion && s.i < RIG.n && j < RIG_M, r = s.i * RIG_M + j, yaw = ok ? RIG.yaw[r] : 0, pit = ok ? RIG.pit[r] : 0;
  if (tip.piv && pit) { const [px, py, pz] = tip.piv, dy = y - py, dz = z - pz, c = Math.cos(pit), sn = Math.sin(pit); y = py + dy * c + dz * sn; z = pz - dy * sn + dz * c; }
  if (T.turn && yaw) { const [cx, cz] = T.yc, dx = x - cx, dz = z - cz, c = Math.cos(yaw), sn = Math.sin(yaw); x = cx + dx * c + dz * sn; z = cz - dx * sn + dz * c; }
  const q = m.q, o = m.o;
  const hx = o[0] + x * q[0] + y * q[3] + z * q[6], hy = o[1] + x * q[1] + y * q[4] + z * q[7], hz = o[2] + x * q[2] + y * q[5] + z * q[8];
  const F = s.F, U = s.U, R = [U[1] * F[2] - U[2] * F[1], U[2] * F[0] - U[0] * F[2], U[0] * F[1] - U[1] * F[0]], Ls = s.L;
  out[0] = s.x + (R[0] * hx + U[0] * hy + F[0] * hz) * Ls; out[1] = s.y + (R[1] * hx + U[1] * hy + F[1] * hz) * Ls; out[2] = s.z + (R[2] * hx + U[2] * hy + F[2] * hz) * Ls;
  return out;
}

// 環繞鏡頭（測試、截圖用；之後的整修庫也會用）：CAP_FX.cam＝{ k: CAP.ships 的索引, yaw: 相對船頭的方位（弧度）, el: 仰角, d: 距離（船長的倍數） }
function capFxCam() {
  const V = CAP_FX.cam, s = V && CAP.ships[V.k]; if (!s) return;
  const L = shipGeo.getAttribute('aScale').array[s.i] * TYPE_LEN3, a = Math.atan2(s.F[0], s.F[2]) + V.yaw, d = V.d * L;
  shipWorldCPU(s.i, _fxa);
  camPersp.position.set(_fxa.x + Math.sin(a) * Math.cos(V.el) * d, _fxa.y + Math.sin(V.el) * d, _fxa.z + Math.cos(a) * Math.cos(V.el) * d);
  // sx：把船推到畫面的一側（看的點往鏡頭右邊移，船就往左偏；大廳把右邊留給按鈕）
  const sx = V.sx || 0, rx = Math.cos(a), rz = -Math.sin(a);   // 鏡頭的右方（水平）
  camPersp.lookAt(_fxa.x + rx * sx * d, _fxa.y, _fxa.z + rz * sx * d); camPersp.updateMatrixWorld();
}
Object.assign(window.__cap || (window.__cap = {}), { CAP_FX, CFX, capFxBuild, CAP_WLOOK, capWKey, CAP_LIVERY, capMuzGroups, capMuzzleAt, capHullModel, capSlotMounts, capMountList, capGearWKey, capMuzzleMains, CAP_HULL_PUB, cam: () => camPersp });
