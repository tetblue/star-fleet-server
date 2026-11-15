// ═══════════════════════ 艦長：外掛零件（從現有船體模型剪下來，2026-11-15） ═══════════════════════
// 零件＝「來源模型的鍵＋一個框」：框是來源模型外框的比例（x 左右、y 上下、z 船尾 0～船頭 1），框裡的三角面就是零件。
// 候選（CAP_PART_CAND）先畫成對照圖給使用者確認；確認過的寫進 models/零件/parts.json（之後由遊戲讀取、裝到船上）。
const CAP_PART_CAND = [
  // 引擎艙：船尾一段（整排噴口）／船尾單側的推進器
  { kind: 'eng', id: 'stern', name: '船尾推進段', box: [0, 1, 0, 1, 0, 0.16] },
  { kind: 'eng', id: 'pod', name: '單側推進器', box: [0.55, 1, 0, 1, 0, 0.24] },
  // 裝甲：船身側面一塊／船頭的裝甲
  { kind: 'armor', id: 'side', name: '側面裝甲板', box: [0.72, 1, 0.15, 0.8, 0.32, 0.66] },
  { kind: 'armor', id: 'bow', name: '艦首裝甲', box: [0, 1, 0, 0.7, 0.84, 1] },
  // 護盾產生器：船身中段頂部的構造（圓頂、天線）
  { kind: 'shield', id: 'top', name: '頂部構造', box: [0.25, 0.75, 0.62, 1, 0.3, 0.72] },
];
const CAP_PART_SRC = { e: 'e1', a: 'a1', m: 'm1' };   // 從哪一艘剪：各陣營的戰列艦（細節最多）
// 剪：回傳 { geo（置中、最大邊＝1）, mat, tris }
function capPartCut(key, box) {
  const M = getModel(key); if (!M) return null;
  const g0 = M.lods[0]; if (!g0.boundingBox) g0.computeBoundingBox();
  const bb = g0.boundingBox, P = g0.attributes.position, N = g0.attributes.normal, UV = g0.attributes.uv, I = g0.index;
  const nt = I ? I.count / 3 : P.count / 3, vi = (t, k) => (I ? I.getX(t * 3 + k) : t * 3 + k);
  const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z, [x0, x1, y0, y1, z0, z1] = box;
  const pos = [], nor = [], uv = [];
  for (let t = 0; t < nt; t++) {
    let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { const v = vi(t, k); cx += P.getX(v); cy += P.getY(v); cz += P.getZ(v); }
    const u = (cx / 3 - bb.min.x) / sx, w = (cy / 3 - bb.min.y) / sy, q = (cz / 3 - bb.min.z) / sz;
    if (u < x0 || u > x1 || w < y0 || w > y1 || q < z0 || q > z1) continue;
    for (let k = 0; k < 3; k++) { const v = vi(t, k); pos.push(P.getX(v), P.getY(v), P.getZ(v)); if (N) nor.push(N.getX(v), N.getY(v), N.getZ(v)); if (UV) uv.push(UV.getX(v), UV.getY(v)); }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); else g.computeVertexNormals();
  if (uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()), s = g.boundingBox.getSize(new THREE.Vector3()), m = Math.max(s.x, s.y, s.z) || 1;
  g.translate(-c.x, -c.y, -c.z); g.scale(1 / m, 1 / m, 1 / m); g.computeBoundingSphere();
  return { geo: g, mat: M.mat, tris: pos.length / 9 };
}
// 對照圖：每一列一個候選，每一欄一個陣營（各畫斜前方、側面兩個角度）
function capPartSheet(cands = CAP_PART_CAND, facs = Object.keys(CAP_PART_SRC)) {
  const cw = 300, ch = 220, pad = 34, W = facs.length * 2 * cw, H = cands.length * (ch + pad) + 40;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(cw, ch); r.outputColorSpace = THREE.SRGBColorSpace;
  const S = new THREE.Scene(); S.background = new THREE.Color(0x1b2230);
  S.add(new THREE.HemisphereLight(0xdfe8f6, 0x3a3630, 1.6)); const sun = new THREE.DirectionalLight(0xfff4e4, 2.4); sun.position.set(2, 3, 2); S.add(sun);
  const cam = new THREE.PerspectiveCamera(30, cw / ch, 0.01, 50);
  const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d');
  g.fillStyle = '#0d121b'; g.fillRect(0, 0, W, H); g.font = '18px sans-serif'; g.fillStyle = '#e8eef8';
  facs.forEach((f, j) => g.fillText(`${FACTION_NAME[{ e: 0, a: 1, m: 2 }[f]] || f}（${CAP_PART_SRC[f]}）`, j * 2 * cw + 10, 26));
  const info = [];
  cands.forEach((C, i) => {
    const y = 40 + i * (ch + pad);
    g.fillStyle = '#f2b35a'; g.font = '15px sans-serif'; g.fillText(`${i + 1}. ${C.kind}・${C.name}（${C.kind}_${C.id}）`, 10, y + 18);
    facs.forEach((f, j) => {
      const P = capPartCut(CAP_PART_SRC[f], C.box); info.push({ id: `${C.kind}_${C.id}`, f, tris: P ? P.tris : 0 });
      if (!P) return;
      const mesh = new THREE.Mesh(P.geo, P.mat); S.add(mesh);
      [[0.8, 0.45], [Math.PI / 2, 0.15]].forEach(([a, e], v) => {
        cam.position.set(Math.sin(a) * Math.cos(e) * 2.1, Math.sin(e) * 2.1, Math.cos(a) * Math.cos(e) * 2.1); cam.lookAt(0, 0, 0);
        r.render(S, cam); g.drawImage(r.domElement, (j * 2 + v) * cw, y + 26);
      });
      S.remove(mesh);
      g.fillStyle = '#9fb0c8'; g.font = '12px sans-serif'; g.fillText(`${P.tris} 面`, j * 2 * cw + 8, y + 26 + ch - 8);
    });
  });
  r.dispose();
  return { url: out.toDataURL('image/jpeg', 0.86), info };
}
// ───── 試裝：把零件裝到別的船型上（候選確認用） ─────
// 位置用射線找船殼表面：側面零件貼在船身側面、頂部構造放在船背上、艦首裝甲包住船頭、引擎接在船尾（單側推進器左右各一，左邊鏡像）
const _cpRay = new THREE.Raycaster();
function capPartHit(hull, from, dir) {
  _cpRay.set(from, dir.clone().normalize()); _cpRay.far = 10;
  const h = _cpRay.intersectObject(hull, false)[0]; return h ? h.point : null;
}
// body＝船的群組（模型單位、船頭 +z），hull＝船體 mesh，P＝capPartCut 的結果，C＝候選；回傳加上去的 mesh
function capPartFit(body, hull, P, C) {
  const bb = hull.geometry.boundingBox, W = bb.max.x - bb.min.x, Hh = bb.max.y - bb.min.y, Lz = bb.max.z - bb.min.z;
  const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const ps = P.geo.boundingBox.getSize(new THREE.Vector3()), V = (x, y, z) => new THREE.Vector3(x, y, z), out = [];
  const add = (pos, s, mirror) => { const m = new THREE.Mesh(P.geo, P.mat); m.position.copy(pos); m.scale.set(mirror ? -s : s, s, s); body.add(m); out.push(m); };
  const id = C.kind + '_' + C.id;
  // 船殼表面：在一排起點上打射線，取最外面的那個（band＝起點的範圍，船身中間那一段，避開翼、天線）
  const far = (pts, dir, key, sign) => { let best = null; for (const p of pts) { const h = capPartHit(hull, p, dir); if (h && (!best || (h[key] - best[key]) * sign > 0)) best = h; } return best; };
  const ys = (z, x0) => [-0.25, -0.12, 0, 0.12, 0.25].map((k) => V(x0, cy + k * Hh, z));
  const xs = (y0, z) => [-0.15, 0, 0.15].map((k) => V(cx + k * W, y0, z));
  if (id === 'eng_stern') {   // 接在船尾：寬＝船寬 0.7，往後伸出
    const s = (W * 0.7) / ps.x, back = far(ys(bb.min.z - 1, cx), V(0, 0, 1), 'z', -1) || V(cx, cy, bb.min.z);
    add(V(cx, back.y, back.z - ps.z * s * 0.35), s);
  } else if (id === 'eng_pod') {   // 船尾兩側各一：長＝船長 0.22
    const s = (Lz * 0.22) / ps.z, z = bb.min.z + Lz * 0.12;
    for (const sd of [1, -1]) { const h = far(ys(z, cx + sd * (W + 1)).map((p) => p).filter((p) => Math.abs(p.y - cy) < Hh * 0.2), V(-sd, 0, 0), 'x', sd) || V(cx + sd * W * 0.3, cy, z); add(V(h.x + sd * ps.x * s * 0.3, h.y, z), s, sd < 0); }
  } else if (id === 'armor_side') {   // 船身中段兩側：長＝船長 0.3，貼在船殼上
    const s = (Lz * 0.3) / ps.z, z = cz + Lz * 0.04;
    for (const sd of [1, -1]) { const h = far(ys(z, cx + sd * (W + 1)).filter((p) => Math.abs(p.y - cy) < Hh * 0.2), V(-sd, 0, 0), 'x', sd) || V(cx + sd * W * 0.3, cy, z); add(V(h.x + sd * ps.x * s * 0.15, h.y, z), s, sd < 0); }
  } else if (id === 'armor_bow') {   // 包住船頭：長＝船長 0.2，前緣對齊船頭
    const s = (Lz * 0.24) / ps.z, front = far(ys(bb.max.z + 1, cx), V(0, 0, -1), 'z', 1) || V(cx, cy, bb.max.z);
    add(V(cx, front.y, front.z - ps.z * s * 0.4), s);
  } else if (id === 'shield_top') {   // 船背中段最高的地方：寬＝船寬 0.4
    const s = (Lz * 0.16) / ps.x, z = cz - Lz * 0.05, top = far(xs(bb.max.y + 1, z), V(0, -1, 0), 'y', 1) || V(cx, bb.max.y, z);
    add(V(cx, top.y + ps.y * s * 0.3, z), s);
  }
  return out;
}
// 試裝對照圖：一個陣營一張；每列一個候選，欄＝突擊艦（裝之前、裝之後）、電戰艦（裝之後）
const CAP_PART_FIT_HULL = [3, 2];   // 試裝的船型（look）：突擊艦、電戰艦
const CAP_PART_FIT_VIEW = { eng: [2.5, 0.35], armor_side: [1.15, 0.25], armor_bow: [0.55, 0.3], shield_top: [0.8, 0.6] };   // 鏡頭：方位（從船頭量）、仰角
function capPartFitSheet(f, cands = CAP_PART_CAND) {
  const fk = f, fi = { e: 0, a: 1, m: 2 }[f], cw = 420, ch = 290, pad = 30, cols = [[CAP_PART_FIT_HULL[0], 0], [CAP_PART_FIT_HULL[0], 1], [CAP_PART_FIT_HULL[1], 1]];
  const W = cols.length * cw, H = cands.length * (ch + pad) + 40;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(cw, ch); r.outputColorSpace = THREE.SRGBColorSpace;
  const S = new THREE.Scene(); S.background = new THREE.Color(0x1b2230);
  S.add(new THREE.HemisphereLight(0xdfe8f6, 0x3a3630, 1.6)); const sun = new THREE.DirectionalLight(0xfff4e4, 2.4); sun.position.set(2, 3, 2); S.add(sun);
  const cam = new THREE.PerspectiveCamera(30, cw / ch, 0.01, 50);
  const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d');
  g.fillStyle = '#0d121b'; g.fillRect(0, 0, W, H); g.font = '18px sans-serif'; g.fillStyle = '#e8eef8';
  g.fillText(`${FACTION_NAME[fi]}的零件（從 ${CAP_PART_SRC[f]} 剪的）裝到${FACTION_NAME[fi]}的船上`, 10, 26);
  const ship = (look) => {
    const key = fk + look, M = getModel(key); if (!M) return null;
    const body = new THREE.Group(), hull = new THREE.Mesh(M.lods[0], M.mat); body.add(hull);
    if (!hull.geometry.boundingBox) hull.geometry.computeBoundingBox();
    for (const m of mountsOf(key)) { const Wm = getModel(fk + 'w' + m.w); if (!Wm) continue; const o = new THREE.Mesh(Wm.lods[Math.min(1, Wm.lods.length - 1)], Wm.mat); setMountObj(o, m); body.add(o); }
    return { body, hull };
  };
  cands.forEach((C, i) => {
    const y = 40 + i * (ch + pad), id = C.kind + '_' + C.id, P = capPartCut(CAP_PART_SRC[f], C.box);
    g.fillStyle = '#f2b35a'; g.font = '15px sans-serif'; g.fillText(`${i + 1}. ${C.name}（${id}）`, 10, y + 18);
    cols.forEach(([look, withPart], j) => {
      const X = ship(look); if (!X) return;
      if (withPart && P) capPartFit(X.body, X.hull, P, C);
      S.add(X.body);
      const bb = new THREE.Box3().setFromObject(X.body), c = bb.getCenter(new THREE.Vector3()), d = (bb.getSize(new THREE.Vector3()).length() / 2) / Math.sin((15 * Math.PI) / 180) * 0.62;
      const [a, e] = CAP_PART_FIT_VIEW[id] || CAP_PART_FIT_VIEW[C.kind] || [0.8, 0.4];
      cam.position.set(c.x + Math.sin(a) * Math.cos(e) * d, c.y + Math.sin(e) * d, c.z + Math.cos(a) * Math.cos(e) * d); cam.lookAt(c);
      r.render(S, cam); g.drawImage(r.domElement, j * cw, y + 24); S.remove(X.body);
      g.fillStyle = '#9fb0c8'; g.font = '13px sans-serif'; g.fillText(`${HULL_NAMES[look]}・${withPart ? '裝上之後' : '原本'}`, j * cw + 8, y + 24 + ch - 8);
    });
  });
  r.dispose();
  return out.toDataURL('image/jpeg', 0.86);
}
Object.assign(window.__cap || (window.__cap = {}), { CAP_PART_CAND, CAP_PART_SRC, capPartCut, capPartSheet, capPartFit, capPartFitSheet, THREE, hgProp, getModel });   // THREE、hgProp：測試腳本用
