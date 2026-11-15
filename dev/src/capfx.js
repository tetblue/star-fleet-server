// ═══════════════════════ 艦長模式：改裝的外觀（2026-11-15） ═══════════════════════
// 船的 3D 模型在 main.js 畫（實例化）；這裡在每艘特製戰艦上再疊一層，照它裝的模組與 Mk 改變外觀：
//   塗裝層（同一個船體模型，沿法線外推一點）：Mk 識別條紋（Mk II 一條、Mk III 兩條）、重裝甲＝面板接縫、反應裝甲＝磚塊與引信燈
//   護盾殼（強化護盾）：平常淡淡一層，被打到時亮起；其他船只有被打到護盾的瞬間閃一下
//   尾焰：原廠短而淡；巡航＝細長穩定；衝刺＝粗、閃爍，加速時拉長；機動＝主焰短＋四角姿態噴口，轉向、側移時噴
// 位置與方向照 main.js update3D 的艦長分支（前 s.F、上 s.U、長度 scale × TYPE_LEN3），所以會完全貼合。
const CAP_FX = {
  on: true,
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
  uniforms: { uBmin: { value: new THREE.Vector3() }, uBmax: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color() }, uMk: { value: 1 }, uArm: { value: 0 }, uTime: U.uTime, uPush: { value: CAP_FX.push }, uCut: { value: 2 }, uDmg: { value: 0 }, uSt: { value: new THREE.Vector3(...CAP_FX.stripe) } },
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  vertexShader: /* glsl */`
    uniform float uPush; varying vec3 vP; varying vec3 vN;
    void main(){ vP = position; vN = normalize(normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uPush, 1.); }`,
  fragmentShader: /* glsl */`
    uniform vec3 uBmin; uniform vec3 uBmax; uniform vec3 uCol; uniform float uMk; uniform float uArm; uniform float uTime; uniform vec3 uSt; uniform float uCut; uniform float uDmg;
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
// 這艘船的外觀設定：模組、Mk（取最高的槽位）
function capFxSpec(s) {
  const mod = (s.H && s.H.mod) || {}, mk = (s.H && s.H.mk) || {};
  let m = 1; for (const k in mk) m = Math.max(m, mk[k] || 1);
  return { eng: mod.eng || 'std', def: mod.def || '', mk: m };
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
    if (sp.mk > 1 || sp.def === 'armor' || sp.def === 'react') {
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const m = capFxPaintMat(); m.uniforms.uBmin.value.copy(bb.min); m.uniforms.uBmax.value.copy(bb.max); m.uniforms.uCol.value.set(fac.ui); m.uniforms.uMk.value = sp.mk; m.uniforms.uArm.value = sp.def === 'armor' ? 1 : sp.def === 'react' ? 2 : 0;
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
// 模組 → 武器模型：w＝同一個風格的第幾號（WEAPON_NAMES）；風格字母開頭的鍵（例如 'rw0'）＝指定模型（e／a／m 各自、all＝所有風格）；k＝尺寸倍率
// 之後有專屬的武器模型，改這張表就好
const CAP_WLOOK = {
  main: {
    heavy: { w: 0, k: 1.12 },                          // 重粒子砲：三聯裝主砲塔，大一點
    rail: { e: 'ew5', a: 'aw5', m: 'mw1', k: 1 },      // 磁軌砲：帝國衝角砲、聯盟貫穿式主砲、傭兵臨時加裝軌道砲（都是長砲管）
    rapid: { w: 3, k: 1.35 },                          // 速射砲：防空／雙管機砲塔放大
    beam: { all: 'rw0', k: 1 },                        // 光束砲：借機械智慧族的稜形激光砲塔
  },
  tur: {
    heavy: { w: 1, k: 1.25 },                          // 重型副砲：雙聯裝砲塔放大
    aa: { w: 3, k: 1 },                                // 防空副砲：防空砲塔
  },
};
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
  const L = slot && mod[slot] && CAP_WLOOK[slot][mod[slot]]; if (!L) return null;
  const key = L.all || L[st] || (L.w != null ? st + 'w' + L.w : null);
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
function capShipMods(i) { const k = CAP.byI && i < CAP.byI.length ? CAP.byI[i] : -1, s = k >= 0 ? CAP.ships[k] : null, mod = s && s.H && s.H.mod; return mod && (mod.main || mod.tur) ? { s, mod } : null; }
// main.js rebuild3D：多留換上去的武器模型的容量
function capMountCap(cap) {
  for (const s of CAP.ships) {
    const X = capShipMods(s.i); if (!X) continue;
    const tk = typeKey(s.i), raw = capMountRaw(tk), base = R3.mounts[tk]; if (!raw || !base || raw.length !== base.length) continue;
    const sl = capMountSlots(raw); raw.forEach((m, j) => { const n = capSwapMount(m, base[j], X.mod, sl[j]); if (n) cap[n.wk] = (cap[n.wk] || 0) + 1; });
  }
}
// main.js writeMounts：這艘船的掛點清單（沒有改裝＝null，用原本的）
function capMountList(i, hk) {
  const X = capShipMods(i); if (!X) return null;
  const s = X.s; if (s.mountV === R3.version && s.mountK === hk) return s.mounts;
  s.mountV = R3.version; s.mountK = hk; s.mounts = null;
  const raw = capMountRaw(hk), base = R3.mounts[hk]; if (!raw || !base || raw.length !== base.length) return null;
  const sl = capMountSlots(raw);
  s.mounts = base.map((mm, j) => { const n = capSwapMount(raw[j], mm, X.mod, sl[j]); return n && R3.meshByKey[n.wk] ? n : mm; });
  return s.mounts;
}

// 環繞鏡頭（測試、截圖用；之後的整修庫也會用）：CAP_FX.cam＝{ k: CAP.ships 的索引, yaw: 相對船頭的方位（弧度）, el: 仰角, d: 距離（船長的倍數） }
function capFxCam() {
  const V = CAP_FX.cam, s = V && CAP.ships[V.k]; if (!s) return;
  const L = shipGeo.getAttribute('aScale').array[s.i] * TYPE_LEN3, a = Math.atan2(s.F[0], s.F[2]) + V.yaw, d = V.d * L;
  shipWorldCPU(s.i, _fxa);
  camPersp.position.set(_fxa.x + Math.sin(a) * Math.cos(V.el) * d, _fxa.y + Math.sin(V.el) * d, _fxa.z + Math.cos(a) * Math.cos(V.el) * d);
  camPersp.lookAt(_fxa.x, _fxa.y, _fxa.z); camPersp.updateMatrixWorld();
}
Object.assign(window.__cap || (window.__cap = {}), { CAP_FX, CFX, capFxBuild, CAP_WLOOK });
