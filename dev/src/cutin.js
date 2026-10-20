// ═══════════════════════ 過場動畫：文字切入 → APNG ═══════════════════════
// 移植自 tetblue/apng_gen（RUBICON PROTOCOL 文字動畫 APNG 產生器）的精簡版：
//   排版（逐字量寬）→ 時間軸（登場／顯示／退場、逐字延遲）→ 效果與裝飾 → 逐格描繪 → APNG 編碼（CompressionStream + 自組 chunk）
// 遊戲裡用在「開戰」「勝利／敗北／平手」「戰鬥回放」的切入畫面；設定 →「過場動畫工坊」可以自己打字、預覽、下載 APNG。
// 所有隨機都由（時間、字的索引）決定，所以即時預覽（canvas）與輸出（APNG）每一格完全一樣：
//   已經編好的 APNG → 直接用 <img> 播；還沒編好（或瀏覽器沒有 CompressionStream）→ 先用 canvas 即時畫，同時在背景編好留著下次用。

// ───── PNG / APNG 編碼（apng_gen js/codec/png.js）─────
const CUT_CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function cutCrc(b) { let c = ~0 >>> 0; for (let i = 0; i < b.length; i++) c = CUT_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return ~c >>> 0; }
const cutCanEncode = () => typeof CompressionStream === 'function';
async function cutDeflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); }
const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, cutCrc(out.subarray(4, 8 + data.length)));
  return out;
}
// RGBA 矩形 → 加上濾波位元組的列資料；每列從 None/Sub/Up/Paeth 挑變化量最小的
function pngFilter(rgba, stride, x, y, w, h) {
  const rl = w * 4, out = new Uint8Array(h * (rl + 1)), prev = new Uint8Array(rl), cur = new Uint8Array(rl);
  const cand = [new Uint8Array(rl), new Uint8Array(rl), new Uint8Array(rl), new Uint8Array(rl)], [c0, c1, c2, c3] = cand;
  for (let r = 0; r < h; r++) {
    const st = ((y + r) * stride + x) * 4;
    cur.set(rgba.subarray(st, st + rl));
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let i = 0; i < rl; i++) {
      const v = cur[i], a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
      const p = a + b - c, pa = p > a ? p - a : a - p, pb = p > b ? p - b : b - p, pc = p > c ? p - c : c - p;
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const v1 = (v - a) & 255, v2 = (v - b) & 255, v3 = (v - pred) & 255;
      c0[i] = v; c1[i] = v1; c2[i] = v2; c3[i] = v3;
      s0 += v < 128 ? v : 256 - v; s1 += v1 < 128 ? v1 : 256 - v1; s2 += v2 < 128 ? v2 : 256 - v2; s3 += v3 < 128 ? v3 : 256 - v3;
    }
    const sums = [s0, s1, s2, s3];
    let best = 0;
    for (let f = 1; f < 4; f++) if (sums[f] < sums[best]) best = f;
    out[r * (rl + 1)] = [0, 1, 2, 4][best];
    out.set(cand[best], r * (rl + 1) + 1);
    prev.set(cur);
  }
  return out;
}
// 兩張畫面的差異矩形（完全相同＝null）
function pngDiffRect(a, b, W, H) {
  const A = new Uint32Array(a.buffer, a.byteOffset, W * H), B = new Uint32Array(b.buffer, b.byteOffset, W * H);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let x0 = -1;
    for (let x = 0; x < W; x++) if (A[row + x] !== B[row + x]) { x0 = x; break; }
    if (x0 < 0) continue;
    let x1 = x0;
    for (let x = W - 1; x > x0; x--) if (A[row + x] !== B[row + x]) { x1 = x; break; }
    if (y < minY) minY = y;
    maxY = y; if (x0 < minX) minX = x0; if (x1 > maxX) maxX = x1;
  }
  return maxY < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
// 逐格加入的 APNG 組裝器：只存與上一格不同的矩形，相同影格合併延長
class ApngWriter {
  constructor(width, height, fps, plays) { Object.assign(this, { width, height, fps, plays }); this.frames = []; this.prev = null; }
  async addFrame(buf) {
    const W = this.width, H = this.height;
    let rect = { x: 0, y: 0, w: W, h: H };
    if (this.prev) {
      rect = pngDiffRect(this.prev, buf, W, H);
      if (!rect) { this.frames[this.frames.length - 1].delay++; return false; }
    }
    this.prev = buf.slice();
    this.frames.push({ ...rect, data: await cutDeflate(pngFilter(buf, W, rect.x, rect.y, rect.w, rect.h)), delay: 1 });
    return true;
  }
  finish() {
    const W = this.width, H = this.height, u32 = (...n) => { const o = new Uint8Array(n.length * 4), v = new DataView(o.buffer); n.forEach((x, i) => v.setUint32(i * 4, x)); return o; };
    const ihdr = new Uint8Array(13); new DataView(ihdr.buffer).setUint32(0, W); new DataView(ihdr.buffer).setUint32(4, H); ihdr[8] = 8; ihdr[9] = 6;
    const out = [PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('acTL', u32(this.frames.length, this.plays))];
    let seq = 0;
    this.frames.forEach((f, i) => {
      const fc = new Uint8Array(26), v = new DataView(fc.buffer);
      v.setUint32(0, seq++); v.setUint32(4, f.w); v.setUint32(8, f.h); v.setUint32(12, f.x); v.setUint32(16, f.y);
      let num = f.delay, den = this.fps;   // 影格數／FPS 直接當分數，不累積四捨五入誤差
      while (num > 65535) { num = Math.round(num / 2); den = Math.max(1, Math.round(den / 2)); }
      v.setUint16(20, num); v.setUint16(22, den); fc[24] = 0; fc[25] = 0;   // dispose NONE、blend SOURCE（矩形內整塊取代，含透明）
      out.push(pngChunk('fcTL', fc));
      if (i === 0) out.push(pngChunk('IDAT', f.data));
      else { const fd = new Uint8Array(4 + f.data.length); new DataView(fd.buffer).setUint32(0, seq++); fd.set(f.data, 4); out.push(pngChunk('fdAT', fd)); }
    });
    out.push(pngChunk('IEND', new Uint8Array(0)));
    return new Blob(out, { type: 'image/apng' });
  }
}

// ───── 樣式（模板）─────
// 每種切入＝一組 登場效果／退場效果／裝飾／顏色；顏色跟著玩家陣營（帝國金、聯盟藍），敗北一律紅色警戒
const CUT_FAC = [
  { font: '"Noto Serif TC", "PMingLiU", "Songti TC", serif', main: '#ffe2b0', edge: '#7a4a12', glow: '#f2b35a', deco: '#f2b35a' },
  { font: '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif', main: '#e6f6ff', edge: '#123a5a', glow: '#7cc4ff', deco: '#7cc4ff' },
];
const CUT_STYLES = {
  start: { name: '開戰', inFx: 'slam', outFx: 'spread', deco: 'band', inDur: 0.42, stagger: 0.07, hold: 1.0, outDur: 0.45, spacing: 0.5 },
  win: { name: '勝利', inFx: 'drop', outFx: 'rise', deco: 'lines', inDur: 0.55, stagger: 0.12, hold: 1.5, outDur: 0.5, spacing: 0.6 },
  lose: { name: '敗北', inFx: 'glitch', outFx: 'glitch', deco: 'tape', inDur: 0.5, stagger: 0.1, hold: 1.4, outDur: 0.4, spacing: 0.6, color: { main: '#ffd6d0', edge: '#5a0d0d', glow: '#ff4a3a', deco: '#ff5a3a' } },
  draw: { name: '平手', inFx: 'converge', outFx: 'spread', deco: 'lines', inDur: 0.6, stagger: 0, hold: 1.3, outDur: 0.45, spacing: 0.5, color: { main: '#eef1f5', edge: '#2a3240', glow: '#aab4c4', deco: '#aab4c4' } },
  replay: { name: '回放', inFx: 'type', outFx: 'fade', deco: 'frame', inDur: 0, stagger: 0.09, hold: 0.9, outDur: 0.35, spacing: 0.35 },
};
const CUT_W = 960, CUT_H = 300, CUT_FPS = 20;

// ───── 小工具 ─────
function cutHash(a, b = 0, c = 0) { let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; }
const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const eOut = (p) => 1 - (1 - p) ** 3, eIn = (p) => p * p * p, eBack = (p) => 1 + 2.4 * (p - 1) ** 3 + 1.4 * (p - 1) ** 2;
function eBounce(p) { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75; if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375; return n * (p -= 2.625 / d) * p + 0.984375; }

// ───── 排版＋時間軸：spec → 每個字的位置與登場／退場時刻 ─────
// spec：{ main, sub, style, fac, w, h, fps }
function cutLayout(spec) {
  const st = CUT_STYLES[spec.style] || CUT_STYLES.start, W = spec.w || CUT_W, H = spec.h || CUT_H;
  const col = { ...CUT_FAC[spec.fac || 0], ...(st.color || {}) }, font = CUT_FAC[spec.fac || 0].font;
  const mc = document.createElement('canvas').getContext('2d');
  const chars = [...(spec.main || '')];
  // 自動縮小：主文字太長就縮到畫面寬的 86%
  let size = Math.round(H * 0.36);
  const widthAt = (sz) => { mc.font = `900 ${sz}px ${font}`; return chars.reduce((s, ch) => s + mc.measureText(ch).width, 0) + sz * st.spacing * Math.max(0, chars.length - 1); };
  while (size > 18 && widthAt(size) > W * 0.86) size -= 2;
  mc.font = `900 ${size}px ${font}`;
  const total = widthAt(size), gap = size * st.spacing, cy = spec.sub ? H * 0.45 : H * 0.5;
  let x = (W - total) / 2;
  const glyphs = chars.map((ch, i) => { const w = mc.measureText(ch).width, g = { ch, i, x: x + w / 2, y: cy, w }; x += w + gap; return g; });
  const n = glyphs.length, mid = (n - 1) / 2;
  // 逐字延遲：開戰從中央向外，其餘從頭到尾
  glyphs.forEach((g) => { const k = st.inFx === 'slam' ? Math.abs(g.i - mid) : g.i; g.in0 = 0.25 + k * st.stagger; g.in1 = g.in0 + st.inDur; });
  const inEnd = Math.max(0.25, ...glyphs.map((g) => g.in1));
  const subIn = inEnd - 0.1, holdEnd = Math.max(inEnd, subIn + 0.4) + st.hold;
  glyphs.forEach((g) => { g.out0 = holdEnd + (st.outFx === 'glitch' ? cutHash(g.i, 9) * 0.15 : 0); g.out1 = g.out0 + st.outDur; });
  const outEnd = Math.max(holdEnd + st.outDur, ...glyphs.map((g) => g.out1));
  const subSize = Math.round(size * 0.3);
  return { st, col, font, W, H, size, glyphs, total, cy, sub: spec.sub || '', subSize, subY: cy + size * 0.62 + subSize * 0.7, subIn, holdEnd, inEnd, outEnd, dur: outEnd + 0.15, fps: spec.fps || CUT_FPS };
}

// ───── 描繪：L（版面）在時間 t 的一格 ─────
function cutDraw(ctx, L, t) {
  const { st, col, W, H, size } = L;
  ctx.clearRect(0, 0, W, H);
  const fIdx = Math.floor(t * L.fps);   // 故障類的亂數以影格為單位（預覽與輸出一致）
  // 裝飾的展開／收起
  const dIn = eOut(cl01(t / 0.35)), dOut = 1 - eIn(cl01((t - L.holdEnd) / (st.outDur + 0.1)));
  const dk = Math.min(dIn, dOut);
  if (dk > 0) cutDeco(ctx, L, dk, t, fIdx);
  // 登場閃光（重擊／故障）
  if (st.inFx === 'slam' || st.inFx === 'glitch') {
    const ft = t - L.inEnd;
    if (ft > -0.05 && ft < 0.25) { const a = (1 - cl01(ft / 0.25)) * 0.55; ctx.fillStyle = st.inFx === 'glitch' ? `rgba(255,80,60,${a})` : `rgba(255,255,255,${a})`; ctx.fillRect(0, L.cy - size * 0.75, W, size * 1.5); }
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const g of L.glyphs) cutGlyph(ctx, L, g, t, fIdx);
  // 副文字：主文字到齊前淡入上浮，退場跟著淡出
  if (L.sub) {
    const a = Math.min(eOut(cl01((t - L.subIn) / 0.4)), 1 - cl01((t - L.holdEnd) / st.outDur));
    if (a > 0) {
      ctx.save(); ctx.globalAlpha = a; ctx.font = `700 ${L.subSize}px ${L.font}`;
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${Math.round(L.subSize * 0.25)}px`;
      ctx.fillStyle = col.main; ctx.shadowColor = col.glow; ctx.shadowBlur = 8;
      ctx.fillText(L.sub, W / 2, L.subY + (1 - a) * 10);
      ctx.restore();
    }
  }
}
function cutGlyph(ctx, L, g, t, fIdx) {
  const { st, col, size, W } = L;
  let a = 1, dx = 0, dy = 0, sc = 1, blur = 0, split = 0;
  if (t < g.in1 || st.inDur === 0) {
    const p = st.inDur ? cl01((t - g.in0) / st.inDur) : t >= g.in0 ? 1 : 0;
    if (p <= 0) return;
    switch (st.inFx) {
      case 'slam': sc = 1 + (1 - eIn(p)) * 2.2; a = cl01(p * 1.6); blur = (1 - p) * 10; break;   // 重擊：由大砸下
      case 'drop': dy = -(1 - eBounce(p)) * size * 1.4; a = cl01(p * 3); break;   // 落下彈跳
      case 'glitch': { const r = cutHash(g.i, fIdx, 3); a = p < 1 && r < 0.35 ? 0.15 : 1; dx = (1 - p) * (cutHash(g.i, fIdx, 5) - 0.5) * size * 0.8; split = (1 - p) * size * 0.12; break; }   // 故障
      case 'converge': dx = (g.x - W / 2) * (1 - eOut(p)) * 1.6; a = eOut(p); blur = (1 - p) * 6; break;   // 字距收攏
      case 'type': break;   // 打字機：到時間直接出現
    }
  }
  if (t > g.out0) {
    const q = cl01((t - g.out0) / st.outDur);
    if (q >= 1) return;
    switch (st.outFx) {
      case 'spread': dx += (g.x - W / 2) * eIn(q) * 1.2; sc *= 1 + q * 0.25; a *= 1 - q; blur += q * 8; break;
      case 'rise': dy -= eIn(q) * size * 0.5; a *= 1 - q; break;
      case 'glitch': { const r = cutHash(g.i, fIdx, 7); a *= r < q ? 0 : 1 - q * 0.5; dx += (cutHash(g.i, fIdx, 11) - 0.5) * q * size; split += q * size * 0.15; break; }
      default: a *= 1 - q;
    }
  }
  // 顯示中：敗北偶爾抖一下
  if (st.inFx === 'glitch' && t > g.in1 && t < g.out0 && cutHash(fIdx, 13) < 0.06) { dx += (cutHash(g.i, fIdx, 17) - 0.5) * size * 0.2; split = Math.max(split, size * 0.05); }
  ctx.save();
  ctx.translate(g.x + dx, g.y + dy); ctx.scale(sc, sc);
  ctx.font = `900 ${size}px ${L.font}`;
  if (blur > 0.5 && 'filter' in ctx) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  if (split > 0.5) {   // 故障色：紅藍錯開
    ctx.globalAlpha = a * 0.7; ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ff2a3a'; ctx.fillText(g.ch, -split, 0);
    ctx.fillStyle = '#2ad4ff'; ctx.fillText(g.ch, split, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = a;
  ctx.shadowColor = col.glow; ctx.shadowBlur = size * 0.28;   // 外發光
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.07); ctx.strokeStyle = col.edge; ctx.strokeText(g.ch, 0, 0);   // 描邊
  ctx.shadowBlur = 0;
  const gr = ctx.createLinearGradient(0, -size / 2, 0, size / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, col.main); gr.addColorStop(1, col.glow);   // 漸層填色
  ctx.fillStyle = gr; ctx.fillText(g.ch, 0, 0);
  ctx.restore();
}
// 裝飾：色帶／上下線／警戒膠帶／角框；k＝展開程度 0～1
function cutDeco(ctx, L, k, t, fIdx) {
  const { st, col, W, H, size, cy } = L;
  ctx.save();
  if (st.deco === 'band') {   // 色帶：從中央向兩側伸展，兩端淡化
    const bh = size * 1.25 * (0.4 + 0.6 * k), half = W * 0.5 * k;
    const gr = ctx.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.18, 'rgba(8,12,22,.82)'); gr.addColorStop(0.82, 'rgba(8,12,22,.82)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(W / 2 - half, cy - bh / 2, half * 2, bh);
    ctx.globalAlpha = 0.9; ctx.fillStyle = col.deco;
    ctx.fillRect(W / 2 - half * 0.9, cy - bh / 2, half * 1.8, 2); ctx.fillRect(W / 2 - half * 0.9, cy + bh / 2 - 2, half * 1.8, 2);
    if (L.sub) { ctx.globalAlpha = 0.75 * k; ctx.fillStyle = 'rgba(8,12,22,.7)'; ctx.fillRect(W / 2 - half * 0.6, L.subY - L.subSize * 0.75, half * 1.2, L.subSize * 1.5); }
  } else if (st.deco === 'lines') {   // 上下線：從中央拉開
    const len = L.total * 0.62 * k + size * 0.6 * k, y0 = cy - size * 0.72, y1 = (L.sub ? L.subY + L.subSize * 0.9 : cy + size * 0.72);
    ctx.strokeStyle = col.deco; ctx.lineWidth = 2; ctx.shadowColor = col.glow; ctx.shadowBlur = 10;
    for (const y of [y0, y1]) {
      const gr = ctx.createLinearGradient(W / 2 - len, 0, W / 2 + len, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, col.deco); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = gr; ctx.beginPath(); ctx.moveTo(W / 2 - len, y); ctx.lineTo(W / 2 + len, y); ctx.stroke();
    }
    ctx.fillStyle = col.deco; ctx.globalAlpha = k;
    for (const s of [-1, 1]) { ctx.beginPath(); const x = W / 2 + s * (len + 8); ctx.moveTo(x, cy - 6); ctx.lineTo(x + s * 8, cy); ctx.lineTo(x, cy + 6); ctx.closePath(); ctx.fill(); }
  } else if (st.deco === 'tape') {   // 警戒膠帶：上下兩條斜紋向反方向捲動、偶爾閃爍
    const th = Math.max(16, size * 0.2), stripe = th * 1.2, off = (t * 140) % (stripe * 2);
    const flick = cutHash(fIdx, 21) < 0.08 ? 0.45 : 1;
    [[cy - size * 0.95, 1], [L.sub ? L.subY + L.subSize * 1.1 : cy + size * 0.8, -1]].forEach(([y, dir]) => {
      const w = W * k, x0 = dir > 0 ? 0 : W - w;
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y, w, th); ctx.clip();
      ctx.globalAlpha = 0.9 * flick; ctx.fillStyle = '#1a0606'; ctx.fillRect(x0, y, w, th);
      ctx.fillStyle = col.deco;
      for (let x = -stripe * 2 + dir * off; x < W + stripe * 2; x += stripe * 2) { ctx.beginPath(); ctx.moveTo(x, y + th); ctx.lineTo(x + stripe, y + th); ctx.lineTo(x + stripe + th, y); ctx.lineTo(x + th, y); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    });
  } else if (st.deco === 'frame') {   // 角框
    const fw = (L.total / 2 + size * 0.7) * (0.6 + 0.4 * k), fh = size * 0.8 * (0.6 + 0.4 * k), c = size * 0.35;
    ctx.globalAlpha = k; ctx.strokeStyle = col.deco; ctx.lineWidth = 3; ctx.shadowColor = col.glow; ctx.shadowBlur = 8;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = W / 2 + sx * fw, y = cy + sy * fh; ctx.beginPath(); ctx.moveTo(x - sx * c, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * c); ctx.stroke(); }
    if (Math.floor(t * 2.5) % 2 === 0) { ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.arc(W / 2 - fw + c * 0.9, cy - fh + c * 0.9, 6, 0, Math.PI * 2); ctx.fill(); }   // 錄影燈
  }
  ctx.restore();
}

// ───── 輸出：spec → APNG Blob ─────
async function cutEncode(spec, onProgress) {
  const L = cutLayout(spec), cv = document.createElement('canvas'); cv.width = L.W; cv.height = L.H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const n = Math.max(1, Math.ceil(L.dur * L.fps)), wr = new ApngWriter(L.W, L.H, L.fps, spec.loop ? 0 : 1);
  let stored = 0;
  for (let f = 0; f <= n; f++) {   // 最後一格＝退場完的透明畫面（播一次就停在空白）
    cutDraw(ctx, L, f / L.fps);
    if (await wr.addFrame(ctx.getImageData(0, 0, L.W, L.H).data)) stored++;
    if (onProgress) onProgress((f + 1) / (n + 1));
  }
  const blob = wr.finish();
  return { blob, frames: n + 1, stored, dur: L.dur, w: L.W, h: L.H };
}

// ───── 遊戲裡播放 ─────
const CUT = { cache: new Map(), busy: new Map(), el: null, timer: 0, raf: 0, url: null };
const cutKey = (s) => JSON.stringify([s.main, s.sub || '', s.style, s.fac || 0]);
function cutOn() { return SETTINGS.cutin !== false; }
// 背景先編好（同一個 key 只編一次）；回傳 Promise<Blob|null>
function cutPrepare(spec) {
  const key = cutKey(spec);
  if (CUT.cache.has(key)) return Promise.resolve(CUT.cache.get(key).blob);
  if (!cutCanEncode()) return Promise.resolve(null);
  if (!CUT.busy.has(key)) CUT.busy.set(key, cutEncode(spec).then((r) => {
    CUT.busy.delete(key);
    CUT.cache.set(key, { blob: r.blob, dur: r.dur });
    while (CUT.cache.size > 12) CUT.cache.delete(CUT.cache.keys().next().value);
    return r.blob;
  }).catch(() => { CUT.busy.delete(key); return null; }));
  return CUT.busy.get(key);
}
function cutStop() {
  clearTimeout(CUT.timer); cancelAnimationFrame(CUT.raf); CUT.raf = 0;
  if (CUT.el) CUT.el.innerHTML = '';
  if (CUT.url) { URL.revokeObjectURL(CUT.url); CUT.url = null; }
}
// 播一段切入，回傳長度（毫秒；關掉時 0）
function cutPlay(spec) {
  if (!cutOn() || !spec.main) return 0;
  if (!CUT.el) { CUT.el = document.createElement('div'); CUT.el.id = 'cutin'; document.body.appendChild(CUT.el); }
  cutStop();
  const key = cutKey(spec), hit = CUT.cache.get(key), L = cutLayout(spec);
  if (hit) {   // 已經編好：用 <img> 播 APNG（每次給新的 blob 網址，瀏覽器才會從第一格播，不會沿用已經播完的動畫）
    const img = new Image(); img.alt = spec.main; img.src = CUT.url = URL.createObjectURL(hit.blob);
    CUT.el.appendChild(img);
  } else {   // 還沒編好：canvas 即時畫同一套動畫，並在背景編好留著
    const cv = document.createElement('canvas'); cv.width = L.W; cv.height = L.H; CUT.el.appendChild(cv);
    const ctx = cv.getContext('2d'), t0 = performance.now();
    const step = () => { const t = (performance.now() - t0) / 1000; cutDraw(ctx, L, Math.min(t, L.dur)); if (t < L.dur) CUT.raf = requestAnimationFrame(step); };
    step();
    cutPrepare(spec);
  }
  const ms = Math.round(L.dur * 1000);
  CUT.timer = setTimeout(cutStop, ms + 50);
  return ms;
}
// 遊戲用的幾種切入
const playerFac = () => SIDE_FAC[GAME.playerSide || 0] || 0;
function cutSpecStart(sc) { return { main: '開戰', sub: sc && sc.name ? sc.name : '', style: 'start', fac: playerFac() }; }
function cutSpecResult(kind, why) {
  const main = { win: '勝利', lose: '敗北', draw: '平手' }[kind];
  return main ? { main, sub: why || '', style: kind, fac: playerFac() } : null;
}
function cutSpecReplay(sc) { return { main: '戰鬥回放', sub: sc && sc.name ? sc.name : '', style: 'replay', fac: playerFac() }; }

// ───── 過場動畫工坊：自己打字、預覽、下載 APNG ─────
const CS = { el: null, spec: { main: '戰鬥開始', sub: '第一艦隊　出擊', style: 'start', fac: 0, fps: 20, loop: false }, url: null, info: '', prevT: 0, raf: 0 };
function openCutStudio() {
  if (!CS.el) {
    CS.el = document.createElement('div'); CS.el.id = 'cutstudio'; document.body.appendChild(CS.el);
    CS.el.addEventListener('click', (e) => { if (e.target === CS.el) closeCutStudio(); });
  }
  CS.el.hidden = false; CS.spec.fac = playerFac();
  renderCutStudio();
}
function closeCutStudio() { if (!CS.el) return; cancelAnimationFrame(CS.raf); CS.el.hidden = true; }
function renderCutStudio() {
  const s = CS.spec, esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  CS.el.innerHTML = `<div class="set-card cs-card"><div class="g-head" style="margin-bottom:10px"><h2>過場動畫工坊</h2><span class="crumb">文字切入 → APNG（移植自 apng_gen）</span><span class="g-sp"></span><button class="g-btn" id="cs-close">完成</button></div>
    <div class="cs-prev"><canvas id="cs-cv" width="${CUT_W}" height="${CUT_H}"></canvas></div>
    <div class="set-row"><span>主文字</span><input class="g-sel cs-in" id="cs-main" maxlength="12" value="${esc(s.main)}"></div>
    <div class="set-row"><span>副文字</span><input class="g-sel cs-in" id="cs-sub" maxlength="30" value="${esc(s.sub)}"></div>
    <div class="set-row"><span>模板</span><span class="g-row">${Object.entries(CUT_STYLES).map(([k, v]) => `<button class="g-btn sm ${s.style === k ? 'pri' : ''}" data-cst="${k}">${v.name}</button>`).join('')}</span></div>
    <div class="set-row"><span>陣營配色</span><span class="g-row">${[0, 1].map((f) => `<button class="g-btn sm ${s.fac === f ? 'pri' : ''}" data-csf="${f}">${FACTION[f].name}</button>`).join('')}</span></div>
    <div class="set-row"><span>FPS／循環</span><span class="g-row"><select class="g-sel" id="cs-fps">${[12, 15, 20, 24, 30].map((v) => `<option ${s.fps === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label class="g-row"><input type="checkbox" id="cs-loop" ${s.loop ? 'checked' : ''}> 無限循環</label></span></div>
    <div class="g-row" style="margin-top:12px"><button class="g-btn sm" id="cs-play">▶ 重播預覽</button><span class="g-dim cs-info">${CS.info}</span><span class="g-sp"></span>
      ${cutCanEncode() ? `<button class="g-btn pri" id="cs-enc">輸出 APNG</button>${CS.url ? `<a class="g-btn" id="cs-dl" href="${CS.url}" download="${esc(s.main || 'cutin')}.png">下載</a>` : ''}` : '<span class="g-dim">這個瀏覽器不支援 CompressionStream，無法輸出</span>'}</div></div>`;
  const q = (x) => CS.el.querySelector(x);
  q('#cs-close').onclick = closeCutStudio;
  const edit = (fn) => { fn(); if (CS.url) { URL.revokeObjectURL(CS.url); CS.url = null; CS.info = ''; } renderCutStudio(); };
  q('#cs-main').onchange = (e) => edit(() => (s.main = e.target.value.trim()));
  q('#cs-sub').onchange = (e) => edit(() => (s.sub = e.target.value.trim()));
  q('#cs-fps').onchange = (e) => edit(() => (s.fps = +e.target.value));
  q('#cs-loop').onchange = (e) => edit(() => (s.loop = e.target.checked));
  CS.el.querySelectorAll('[data-cst]').forEach((b) => (b.onclick = () => edit(() => (s.style = b.dataset.cst))));
  CS.el.querySelectorAll('[data-csf]').forEach((b) => (b.onclick = () => edit(() => (s.fac = +b.dataset.csf))));
  q('#cs-play').onclick = cutStudioPreview;
  if (q('#cs-enc')) q('#cs-enc').onclick = async () => {
    const btn = q('#cs-enc'); btn.disabled = true;
    const r = await cutEncode(s, (p) => { btn.textContent = `編碼中 ${Math.round(p * 100)}%`; });
    if (CS.url) URL.revokeObjectURL(CS.url);
    CS.url = URL.createObjectURL(r.blob);
    CS.info = `${r.w}×${r.h}　${r.dur.toFixed(2)} 秒　${r.frames} 格（實際存 ${r.stored} 張）　${(r.blob.size / 1024).toFixed(0)} KB${r.blob.size > 5 * 1024 * 1024 ? '（超過 5MB：降低 FPS、或換成動作較少的模板可以變小）' : ''}`;
    renderCutStudio();
    const img = new Image(); img.src = CS.url; img.className = 'cs-out';   // 直接用輸出的 APNG 取代預覽畫面
    cancelAnimationFrame(CS.raf); q('.cs-prev').replaceChildren(img);
  };
  cutStudioPreview();
}
function cutStudioPreview() {
  cancelAnimationFrame(CS.raf);
  const cv = CS.el.querySelector('#cs-cv'); if (!cv) { renderCutStudio(); return; }
  const L = cutLayout(CS.spec), ctx = cv.getContext('2d'), t0 = performance.now();
  const step = () => { if (CS.el.hidden) return; const t = (performance.now() - t0) / 1000; cutDraw(ctx, L, CS.spec.loop ? t % L.dur : Math.min(t, L.dur)); if (CS.spec.loop || t < L.dur) CS.raf = requestAnimationFrame(step); };
  step();
}
