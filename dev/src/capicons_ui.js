// ═══════════════════════ 艦長生涯：裝備圖示、Mk 等階顏色、改裝前後的六角圖（2026-11-18）═══════════════════════
// 讓玩家一眼分辨：每個模組（槽位＋型式，原廠＝std）一個小圖示；Mk 等階一個顏色（Mk I 灰白、Mk II 藍、Mk III 金）。
// 改裝畫面多一張六角雷達圖：灰線＝改裝前、彩色＝改裝後，每次點選零件從上一次的形狀動畫過去。
// 六個軸都跟「這個船型的原廠 Mk I」比：原廠＝圖的 60%（虛線），+83% 以上頂到外圈。
const CC_MK_COL = ['#c8d2e0', '#c8d2e0', '#4fb0ff', '#ffc24a'];
const ccMkCol = (k) => CC_MK_COL[k || 1];
// 圖示（viewBox 20×20，線條用 currentColor）
const CC_MODICO = {
  'main:std': '<circle cx="7" cy="13" r="4"/><path d="M9.5 10.5L17 4"/>',
  'main:rail': '<path d="M2 13L17 3.5M3.5 16L18.5 6.5"/><path d="M7 11.5l1.6 2.3M11 9l1.6 2.3M15 6.5l1.2 1.8"/>',
  'main:heavy': '<circle cx="6.5" cy="13.5" r="4"/><path d="M8 9.5l6.5-6 3 3-6 6.5" fill="currentColor" fill-opacity=".35"/>',
  'main:rapid': '<circle cx="5" cy="15" r="3"/><path d="M6 12L14 4M8 14l8-8M7.5 9.5l8.5-1"/>',
  'main:beam': '<circle cx="4" cy="10" r="2.6"/><path d="M6.5 10H18" stroke-width="3" stroke-opacity=".45"/><path d="M6.5 10H18"/>',
  'tur:std': '<path d="M3.5 16a6.5 6.5 0 0 1 13 0z"/><path d="M10 9.5V3"/>',
  'tur:heavy': '<path d="M3 16.5a7 7 0 0 1 14 0z" fill="currentColor" fill-opacity=".3"/><path d="M8.6 9.5V2.5M11.4 9.5V2.5"/>',
  'tur:aa': '<path d="M3.5 16a6.5 6.5 0 0 1 13 0z"/><path d="M8.5 9.5L5 3M11.5 9.5L15 3"/><path d="M2 5h2M16 5h2" stroke-opacity=".6"/>',
  'msl:std': '<path d="M10 2l2.6 3.5V14H7.4V5.5z"/><path d="M7.4 11.5L5 15.5h2.4M12.6 11.5l2.4 4h-2.4M10 15v3"/>',
  'msl:heavy': '<path d="M10 1.5l3.5 4V14h-7V5.5z" fill="currentColor" fill-opacity=".35"/><path d="M6.5 11L4 16h2.5M13.5 11L16 16h-2.5"/>',
  'msl:swarm': '<path d="M5 3l1.6 2v6H3.4V5zM10 6l1.6 2v6H8.4V8zM15 3l1.6 2v6h-3.2V5z"/><path d="M5 11v3M10 14v3M15 11v3" stroke-opacity=".6"/>',
  'msl:hangar': '<path d="M10 2.5l6.5 13-6.5-3-6.5 3z"/><path d="M10 2.5v10"/>',
  'def:std': '<path d="M10 2l7 2.8V10c0 4-3 6.8-7 8-4-1.2-7-4-7-8V4.8z"/>',
  'def:armor': '<rect x="3" y="3.5" width="14" height="13" rx="1"/><path d="M3 10h14M10 3.5v13"/><circle cx="6" cy="6.5" r=".8" fill="currentColor"/><circle cx="14" cy="13.5" r=".8" fill="currentColor"/>',
  'def:shield': '<path d="M10 2l7 2.8V10c0 4-3 6.8-7 8-4-1.2-7-4-7-8V4.8z" fill="currentColor" fill-opacity=".3"/><path d="M6.5 9.5a4.5 4.5 0 0 1 7 0"/>',
  'def:react': '<path d="M10 2l7 2.8V10c0 4-3 6.8-7 8-4-1.2-7-4-7-8V4.8z"/><path d="M11 5l-3 5.5h3.5L8.5 15" />',
  'eng:std': '<path d="M5.5 3h9l-2 6.5h-5z"/><path d="M10 11c-2.2 2.6-.4 6.5 0 6.5s2.2-3.9 0-6.5z" fill="currentColor" fill-opacity=".4"/>',
  'eng:cruise': '<path d="M4 4.5l6 5 6-5M4 10.5l6 5 6-5"/>',
  'eng:sprint': '<path d="M2 6.5h6M1.5 10h9M2 13.5h6"/><path d="M11 4.5l6.5 5.5-6.5 5.5z" fill="currentColor" fill-opacity=".35"/>',
  'eng:agile': '<path d="M4 16.5c0-7 4.5-11 12-11"/><path d="M13 2.5l3.2 3-3.2 3.2"/><path d="M4 16.5l-1.5-2.5M4 16.5l2.5-1.3" stroke-opacity=".6"/>',
};
// 圖示的 HTML：slot＋id（沒有 id＝原廠）、col＝顏色（不給＝跟著文字顏色）
function ccModIco(slot, id, col, sz) {
  const p = CC_MODICO[slot + ':' + (id || 'std')] || CC_MODICO[slot + ':std'] || '';
  return `<svg class="cc-mico" viewBox="0 0 20 20" width="${sz || 18}" height="${sz || 18}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${col ? ` style="color:${col}"` : ''}>${p}</svg>`;
}
// Mk 徽章：等階的顏色
const ccMkBadge = (k) => `<span class="cc-mk cc-mk${k || 1}">${CAP_MK_NAME[k || 1]}</span>`;

// ── 六角圖 ──
const CC_HEX_AX = [
  ['火力', (H) => H.main.dmg / H.main.cd + (H.tur.n * H.tur.dmg) / H.tur.cd],
  ['射程', (H) => H.main.range],
  ['飛彈', (H) => (H.msl ? H.msl.n * H.msl.dmg : 0) + (H.ftr || 0) * 6],
  ['機動', (H, H0) => H.max / H0.max + H.turn / H0.turn],   // 最高速度與轉向各半
  ['耐久', (H) => H.hp + H.sh],
  ['防空', (H) => H.pd.n * (H.pd.far || 1)],
];
// 0～1 的半徑：原廠＝0.6，每多（少）1% 外推（內縮）0.8%，小改動也看得出來
function ccHexVals(H, H0) {
  return CC_HEX_AX.map(([, f]) => { const b = f(H0, H0), v = f(H, H0); if (!(b > 0)) return v > 0 ? 0.8 : 0; return Math.max(0.06, Math.min(1, 0.6 + (v / b - 1) * 0.48)); });
}
const CC_HEX_R = 74, CC_HEX_C = [130, 100];
function ccHexPts(v) { return v.map((r, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return `${(CC_HEX_C[0] + Math.cos(a) * r * CC_HEX_R).toFixed(1)},${(CC_HEX_C[1] + Math.sin(a) * r * CC_HEX_R).toFixed(1)}`; }).join(' '); }
// A＝改裝前、B＝改裝後（capHullMod 算好的數值）；回傳 SVG（id＝cc-hex，動畫用 ccHexAnim）
function ccHexSvg(A, B, H0) {
  const a = ccHexVals(A, H0), b = ccHexVals(B, H0), [cx, cy] = CC_HEX_C, R = CC_HEX_R;
  const ring = (k) => `<polygon points="${ccHexPts([k, k, k, k, k, k])}" class="r${k === 0.6 ? ' base' : ''}"/>`;
  const up = b.some((x, i) => x > a[i] + 1e-3), dn = b.some((x, i) => x < a[i] - 1e-3), col = up && !dn ? '#3fdf8f' : dn && !up ? '#ff8a7a' : up ? '#c9a7ff' : '#3cc8ff';
  const lab = CC_HEX_AX.map(([nm, f], i) => {
    const ang = -Math.PI / 2 + i * Math.PI / 3, x = cx + Math.cos(ang) * (R + 16), y = cy + Math.sin(ang) * (R + 12), fa = f(A, H0), fb = f(B, H0), d = fa > 0 ? (fb - fa) / fa : fb > 0 ? 1 : 0;
    const anc = Math.abs(Math.cos(ang)) < 0.2 ? 'middle' : Math.cos(ang) > 0 ? 'start' : 'end';
    const dt = Math.abs(d) < 0.005 ? '' : `<tspan x="${x.toFixed(1)}" dy="13" class="${d > 0 ? 'u' : 'd'}">${d > 0 ? '▲' : '▼'}${Math.round(Math.abs(d) * 100)}%</tspan>`;
    return `<text x="${x.toFixed(1)}" y="${(y + (i === 0 ? -4 : i === 3 ? 6 : 0)).toFixed(1)}" text-anchor="${anc}">${nm}${dt}</text>`;
  }).join('');
  const spokes = [0, 1, 2, 3, 4, 5].map((i) => { const ang = -Math.PI / 2 + i * Math.PI / 3; return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(ang) * R).toFixed(1)}" y2="${(cy + Math.sin(ang) * R).toFixed(1)}"/>`; }).join('');
  return `<div class="cc-hexw" style="--hc:${col}"><svg class="cc-hex" id="cc-hex" viewBox="0 0 260 206" data-b="${b.join(',')}">
    <g class="g">${ring(1)}${ring(0.8)}${ring(0.6)}${ring(0.4)}${ring(0.2)}${spokes}</g>
    <polygon class="old" points="${ccHexPts(a)}"/><polygon class="new" points="${ccHexPts(b)}"/>
    ${b.map((r, i) => { const ang = -Math.PI / 2 + i * Math.PI / 3; return `<circle class="dot" r="2.6" cx="${(cx + Math.cos(ang) * r * R).toFixed(1)}" cy="${(cy + Math.sin(ang) * r * R).toFixed(1)}"/>`; }).join('')}
    <g class="lb">${lab}</g></svg><div class="cc-hexlg"><span><i></i>改裝前</span><span><i class="n"></i>改裝後</span><span>虛線＝原廠</span></div></div>`;
}
// 從上一次的形狀（from＝陣列）動畫到現在的形狀
function ccHexAnim(from) {
  const el = gEl('cc-hex'); if (!el || !from) return;
  const to = el.dataset.b.split(',').map(Number), pg = el.querySelector('polygon.new'), dots = el.querySelectorAll('circle.dot');
  if (from.every((v, i) => Math.abs(v - to[i]) < 1e-3)) return;
  const t0 = performance.now(), T = 320;
  const step = (now) => {
    if (!el.isConnected) return;
    const u = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - u, 3), v = to.map((x, i) => from[i] + (x - from[i]) * e);
    pg.setAttribute('points', ccHexPts(v));
    dots.forEach((d, i) => { const ang = -Math.PI / 2 + i * Math.PI / 3; d.setAttribute('cx', CC_HEX_C[0] + Math.cos(ang) * v[i] * CC_HEX_R); d.setAttribute('cy', CC_HEX_C[1] + Math.sin(ang) * v[i] * CC_HEX_R); });
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const ccHexNow = () => { const el = gEl('cc-hex'); return el ? el.dataset.b.split(',').map(Number) : null; };

// 樣式：第一次用到時掛進 <head>
let ccIcoCssOn = false;
function ccIcoCss() {
  if (ccIcoCssOn) return; ccIcoCssOn = true;
  const st = document.createElement('style'); st.textContent = `
.cc-mico{display:inline-block;vertical-align:-4px;margin-right:5px;flex:none}
.cc-mk{display:inline-block;padding:0 6px;font:700 12px/1.5 Rajdhani,Bahnschrift,'Segoe UI',sans-serif;letter-spacing:.04em;border:1px solid currentColor;transform:skewX(-12deg)}
.cc-mk1{color:${CC_MK_COL[1]};background:rgba(200,210,224,.08)}
.cc-mk2{color:${CC_MK_COL[2]};background:rgba(79,176,255,.16);box-shadow:0 0 6px rgba(79,176,255,.35)}
.cc-mk3{color:${CC_MK_COL[3]};background:rgba(255,194,74,.18);box-shadow:0 0 8px rgba(255,194,74,.5)}
.cc-fit .sm-seg button .cc-mk{border:0;background:none;box-shadow:none;padding:0;transform:none;font-size:inherit}
.cc-fit .sm-seg button:has(.cc-mk2):not(:disabled){border-color:rgba(79,176,255,.6)}
.cc-fit .sm-seg button:has(.cc-mk3):not(:disabled){border-color:rgba(255,194,74,.6)}
.cc-fit .sm-seg button.on:has(.cc-mk2){background:linear-gradient(100deg,rgba(79,176,255,.55),rgba(40,90,200,.4));border-color:${CC_MK_COL[2]}}
.cc-fit .sm-seg button.on:has(.cc-mk3){background:linear-gradient(100deg,rgba(255,194,74,.5),rgba(200,120,20,.35));border-color:${CC_MK_COL[3]}}
.cc-fit .sm-seg button.on .cc-mk{color:#fff}
.cc-fit .sm-seg button:disabled .cc-mico{opacity:.45}
.cc-slot{display:flex;align-items:center;gap:2px;white-space:nowrap}
.cc-fitcmp{display:flex;gap:10px;align-items:stretch;margin:6px 0}
.cc-fitcmp .cc-cmp,.ccm-sheet .cc-fitcmp .cc-cmp{flex:1;margin:0;align-content:start;grid-template-columns:auto 1fr;padding:8px 12px;font-size:13px}
.cc-hexw{width:270px;flex:none;background:rgba(12,20,42,.55);padding:6px 4px}
.cc-hex{width:100%;display:block;overflow:visible}
.cc-hex .g polygon,.cc-hex .g line{fill:none;stroke:rgba(150,190,240,.16);stroke-width:1}
.cc-hex .g polygon.base{stroke:rgba(150,190,240,.42);stroke-dasharray:3 3}
.cc-hex polygon.old{fill:rgba(200,210,224,.1);stroke:rgba(200,210,224,.7);stroke-width:1.2;stroke-dasharray:4 3}
.cc-hex polygon.new{fill:var(--hc);fill-opacity:.28;stroke:var(--hc);stroke-width:2;filter:drop-shadow(0 0 4px var(--hc))}
.cc-hex circle.dot{fill:var(--hc)}
.cc-hex text{font:700 12px 'Noto Sans TC','Microsoft JhengHei',sans-serif;fill:#cfd8e3}
.cc-hex text .u{fill:#3fdf8f;font:700 11px Rajdhani,Bahnschrift,sans-serif}.cc-hex text .d{fill:#ff8a7a;font:700 11px Rajdhani,Bahnschrift,sans-serif}
.cc-hexlg{display:flex;gap:12px;justify-content:center;font-size:11px;color:#8fa3c7;margin-top:-2px}
.cc-hexlg i{display:inline-block;width:14px;height:0;border-top:2px dashed #c8d2e0;vertical-align:middle;margin-right:4px}
.cc-hexlg i.n{border-top:2px solid var(--hc,#3cc8ff)}
`; document.head.appendChild(st);
}
