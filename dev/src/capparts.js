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
Object.assign(window.__cap || (window.__cap = {}), { CAP_PART_CAND, CAP_PART_SRC, capPartCut, capPartSheet });
