// ═══════════════════════ 聲音：音效引擎（移植自 rubicon-protocol 的 src/audio，MIT） ═══════════════════════
// 樣本：dev/sfx（CC0／CC-BY，出處見 dev/sfx/CREDITS.txt）→ 建置時打包成 web/assets/sfx.js（window.__SFX＝{鍵: base64 mp3}），
//   第一次點擊或按鍵時建立 AudioContext，再用 <script> 載入解碼。合成音（~ 開頭：低頻重擊、雷射、EMP、推進器）在程式裡算。
// 模擬裡只記「事件」（sndEv：種類、位置、遊戲時間）：同一幀、同種類、畫面上同一區塊、同一刻的事件直接合併成一群（只記數量），
//   每一幀 sndFrame 把到時間的群依優先度播最多 SND_GROUPS 群；同時最多 SND_VOICES 個聲音，滿了搶走優先度最低的。
// 不用遊戲的 rnd()、不改任何遊戲狀態：回放、多人、模擬的結果不受影響。
// 混音：sfx（戰場）→ world（音效音量）→ duck（大爆炸時壓低）→ master → 壓縮 → 限幅；ui（介面）、amb（環境）各自進 master。

const SND_VOICES = 40;   // 同時發聲上限
const SND_KEY_MAX = 4;   // 同一個樣本同時最多幾個
const SND_GROUPS = 12;   // 一幀最多播幾群事件
const SND_STALE = 0.6;   // 事件過了這麼多秒（遊戲時間）還沒播＝丟掉（快轉、跳轉回放）
const SND_PHASES = ['battle', 'replay', 'sandbox'];   // 這些畫面才有戰場的聲音（主選單後面的背景戰鬥不出聲）

// 音效自己的亂數（音高、音量的變化、輪流選檔）：不碰遊戲的亂數
let sndSeed = 0x5f3759df;
function sndRnd() { sndSeed ^= sndSeed << 13; sndSeed ^= sndSeed >>> 17; sndSeed ^= sndSeed << 5; return (sndSeed >>> 0) / 4294967296; }
const sndClamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ───── 合成音（純函式：取樣率、亂數 → Float32Array） ─────
function sndSvf() {   // 狀態變數濾波器（帶通／低通／高通，頻率可以每個取樣改）
  let lp = 0, bp = 0;
  return (x, f, q, sr) => { const k = 2 * Math.sin(Math.PI * Math.min(f, sr * 0.45) / sr), hp = x - lp - q * bp; bp += k * hp; lp += k * bp; return { lp, bp, hp }; };
}
const sndEnv = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
// 低頻重擊：正弦往下滑（f0 → f1）＋開頭一點雜訊
function synThump(sr, rnd, f0, f1, dur) {
  const n = Math.floor(sr * dur), y = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = f1 + (f0 - f1) * Math.exp(-t / dur * 5); ph += 2 * Math.PI * f / sr;
    y[i] = (Math.sin(ph) * 0.9 + Math.sin(ph * 2) * 0.12) * sndEnv(t, 0.004, dur * 0.32) + (t < 0.006 ? (rnd() * 2 - 1) * (1 - t / 0.006) * 0.35 : 0);
  }
  return y;
}
// 雷射的「啾」：鋸齒波快速往下掃＋短雜訊
function synZap(sr, rnd, f0, f1, dur) {
  const n = Math.floor(sr * dur), y = new Float32Array(n), F = sndSvf(); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = f1 + (f0 - f1) * Math.exp(-t / dur * 4); ph = (ph + f / sr) % 1;
    const s = (ph * 2 - 1) * 0.7 + Math.sin(ph * Math.PI * 2) * 0.3 + (t < 0.01 ? (rnd() * 2 - 1) * 0.5 : 0);
    y[i] = F(s, f * 4, 0.6, sr).lp * sndEnv(t, 0.002, dur * 0.4);
  }
  return y;
}
// EMP：低頻嗡聲＋電弧的雜訊爆裂
function synEmp(sr, rnd, dur) {
  const n = Math.floor(sr * dur), y = new Float32Array(n), F = sndSvf(); let ph = 0, crack = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr; ph += 2 * Math.PI * (62 - 20 * t / dur) / sr;
    if (rnd() < 0.0018) crack = 1; crack *= 0.9965;
    y[i] = ((Math.sin(ph) + 0.5 * Math.sin(ph * 2) + 0.25 * Math.sin(ph * 3)) * 0.5 + F(rnd() * 2 - 1, 2600, 0.3, sr).bp * crack * 1.5) * sndEnv(t, 0.03, dur * 0.45);
  }
  return y;
}
// 推進器的吸氣（加速前）：高通雜訊往上掃
function synQbPre(sr, rnd) {
  const dur = 0.09, n = Math.floor(sr * dur), y = new Float32Array(n), F = sndSvf(); let ph = 0;
  for (let i = 0; i < n; i++) { const u = i / n; ph += 2 * Math.PI * (180 + 700 * u * u) / sr; y[i] = (F(rnd() * 2 - 1, 1200 + 5000 * u, 0.5, sr).hp * 0.7 + Math.sin(ph) * 0.25) * u * u; }
  return y;
}
// 推進器的收尾：低通雜訊，濾波往下掃
function synJetTail(sr, rnd, dur) {
  const n = Math.floor(sr * dur), y = new Float32Array(n), F = sndSvf();
  for (let i = 0; i < n; i++) { const u = i / n; y[i] = F(rnd() * 2 - 1, 3500 * (1 - u) + 250, 0.6, sr).lp * Math.pow(1 - u, 1.6) * 1.8; }
  return y;
}
// 推進器的高頻層（可循環）：帶通雜訊慢慢起伏，頭尾交叉淡化
function synJetLoop(sr, rnd, dur) {
  const n = Math.floor(sr * dur), y = new Float32Array(n), F = sndSvf(), G = sndSvf();
  for (let i = 0; i < n; i++) { const t = i / sr, f = 2600 + 700 * Math.sin(2 * Math.PI * t / dur) + 300 * Math.sin(2 * Math.PI * 3 * t / dur); y[i] = F(rnd() * 2 - 1, f, 0.5, sr).bp + G(rnd() * 2 - 1, 700, 0.8, sr).lp * 0.5; }
  const m = Math.floor(sr * 0.08);
  for (let i = 0; i < m; i++) y[n - m + i] = y[n - m + i] * (1 - i / m) + y[i] * (i / m);
  return y.subarray(m);
}
// 重音（開戰、結算）：低音鈍擊＋鋸齒和弦經過下降的低通
function synSting(sr, rnd, dur, root) {
  const n = Math.floor(sr * dur), y = new Float32Array(n), F = sndSvf(), fr = [root, root * 1.5, root * 2, root * 2.52, root * 3], ph = fr.map(() => rnd());
  for (let i = 0; i < n; i++) {
    const t = i / sr; let s = 0;
    for (let k = 0; k < fr.length; k++) { ph[k] = (ph[k] + fr[k] * (1 + 0.003 * Math.sin(t * 5 + k)) / sr) % 1; s += (ph[k] * 2 - 1) / (1 + k * 0.4); }
    y[i] = (F(s * 0.4, 300 + 4200 * Math.exp(-t / dur * 4), 0.5, sr).lp + Math.sin(2 * Math.PI * root * 0.5 * t) * Math.exp(-t / 0.25) * 0.8) * sndEnv(t, 0.008, dur * 0.4);
  }
  return y;
}
const SND_SYNTH = {
  '~thA': (sr, r) => synThump(sr, r, 72, 40, 0.22),   // 副砲、小爆炸
  '~thB': (sr, r) => synThump(sr, r, 58, 32, 0.38),   // 主砲、中爆炸
  '~thC': (sr, r) => synThump(sr, r, 48, 24, 0.7),    // 大爆炸、旗艦
  '~zapA': (sr, r) => synZap(sr, r, 1600, 260, 0.16),
  '~zapB': (sr, r) => synZap(sr, r, 900, 140, 0.28),
  '~zapC': (sr, r) => synZap(sr, r, 2400, 600, 0.09),
  '~emp': (sr, r) => synEmp(sr, r, 0.9),
  '~qbPre': (sr, r) => synQbPre(sr, r),
  '~jetTail': (sr, r) => synJetTail(sr, r, 0.5),
  '~jetLoop': (sr, r) => synJetLoop(sr, r, 2.2),
  '~sting': (sr, r) => synSting(sr, r, 1.3, 98),
  '~stingL': (sr, r) => synSting(sr, r, 2.6, 73.4),
};

// ───── 武器的聲音配方：每一層＝[樣本清單（輪流）, 音量, 音高] ─────
//   near 近距離  far 遠距離（交叉淡化）  body／low 自己的（艦長的船、駕駛的機）才疊的厚度與低頻
//   fb 分層素材還沒載入時的備用  tail 反射的送出量  gap 同一配方的最短間隔（秒）  max 同一樣本同時上限
const SND_GUN = {
  main: { near: [['beam1', 'beam3'], 0.8, 0.8], far: [['lzA1', 'lzA2'], 0.5, 0.62], body: [['~zapB'], 0.45, 0.9], low: [['~thB'], 0.55, 1], tail: 0.45, fb: [['laserBig', 'laserBig2'], 0.75, 0.9] },
  sec: { near: [['lzA1', 'lzA2', 'lzA3'], 0.6, 1], far: [['lzB1', 'lzB2'], 0.42, 0.8], body: [['~zapA'], 0.35, 1], low: [['~thA'], 0.35, 1.3], tail: 0.3, fb: [['laser', 'laser2'], 0.65, 1] },
  aa: { near: [['zap1', 'zap2', 'rLaser'], 0.4, 1.25], far: [['lzB1', 'lzB2'], 0.28, 1.2], body: [['~zapC'], 0.3, 1], tail: 0.15, gap: 0.05, max: 4, fb: [['laser2'], 0.4, 1.5] },
  msl: { near: [['rocket'], 0.55, 1.3], far: [['rocket'], 0.35, 1.1], body: [['missile'], 0.45, 1.15], low: [['~thA'], 0.35, 0.8], tail: 0.3, gap: 0.06, fb: [['missile'], 0.6, 1.2] },
  // 王牌飛行員：自己的機
  p_pulse: { near: [['zap1', 'zap2', 'lzB1'], 0.42, 1.35], body: [['~zapC'], 0.35, 1.2], gap: 0.07, max: 3, fb: [['laser2'], 0.45, 1.4] },
  p_heavy: { near: [['beam2', 'beam1'], 0.7, 1.0], body: [['~zapB'], 0.45, 1.1], low: [['~thB'], 0.5, 1.1], fb: [['laserBig'], 0.7, 1] },
  p_rocket: { near: [['rocket'], 0.5, 1.5], body: [['cannon3'], 0.25, 1.4], low: [['~thA'], 0.3, 1], gap: 0.1, fb: [['missile'], 0.5, 1.4] },
  p_msl: { near: [['missile'], 0.6, 1.2], body: [['rocket'], 0.4, 1.4], low: [['~thA'], 0.3, 0.9], fb: [['missile'], 0.6, 1.2] },
  p_torp: { near: [['rocket'], 0.7, 0.85], body: [['~zapB'], 0.3, 0.6], low: [['~thB'], 0.6, 0.8], fb: [['missile'], 0.7, 0.8] },
};
const SND_TYPE_RATE = [0.86, 0.86, 0.95, 1.05, 1.12, 1];   // 艦種的音高：大船低沉（航母 戰列 巡洋 驅逐 護衛 補給）
const SND_KILL_W = [3, 3, 2, 1.2, 1, 1.5];   // 擊沉的份量（決定爆炸大小）
const SND_CREDITS = [   // 設定裡的「音效授權」（CC-BY 需要署名）
  'Michel Baradari（apollo-music.de）「2 High Quality Explosions」— CC-BY 3.0',
  'Blender Foundation「Big Explosion」（Elephants Dream）— CC-BY 3.0',
  'dklon「Big Explosion」— CC-BY 3.0',
  'JC Sounds「Sci-Fi Pack Vol 1」— CC-BY 4.0',
  'CC0：Black Lodge Games、rubberduck、Kenney、Still North Media、qubodup 等（OpenGameArt）',
  '音效引擎與素材整理：RUBICON PROTOCOL（MIT）',
];

const SND = {
  ctx: null, ok: true, live: false, buf: {}, pack: false, packLoading: false,
  lastT: {}, voices: [], rr: {}, loops: {}, ev: new Map(), btnT: 0,
  stat: { frames: 0, due: 0, played: 0, maxVoices: 0, ev: {} },   // 除錯用的統計（window.__snd）
  // 第一次點擊／按鍵時建立（瀏覽器要求使用者操作之後才能出聲）
  init() {
    if (this.ctx || !this.ok) return;
    try {
      const c = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const lim = c.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12; lim.connect(c.destination);
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(lim);
      this.master = c.createGain(); this.master.connect(comp);
      this.duckG = c.createGain(); this.duckG.connect(this.master);
      this.world = c.createGain(); this.world.connect(this.duckG);
      this.sfx = c.createGain(); this.sfx.connect(this.world);
      this.amb = c.createGain(); this.amb.gain.value = 0; this.amb.connect(this.world);
      this.uiBus = c.createGain(); this.uiBus.connect(this.master);
      this.buildTail();
      this.setVol();
      const rnd = sndRnd;
      for (const k in SND_SYNTH) {
        const y = SND_SYNTH[k](c.sampleRate, rnd); let p = 0;
        for (let i = 0; i < y.length; i++) p = Math.max(p, Math.abs(y[i]));
        if (p > 0) for (let i = 0; i < y.length; i++) y[i] *= 0.9 / p;
        const b = c.createBuffer(1, y.length, c.sampleRate); b.getChannelData(0).set(y); this.buf[k] = b;
      }
      this.loadPack();
    } catch (e) { this.ok = false; this.ctx = null; }
  },
  // 音量（SETTINGS.audio：on 開關、m 主音量、s 戰場、u 介面，0～1）
  setVol() {
    if (!this.ctx) return;
    const A = sndOpts(), t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(A.on ? 0.8 * A.m : 0, t, 0.03);
    this.world.gain.setTargetAtTime(A.s, t, 0.03);
    this.uiBus.gain.setTargetAtTime(A.u, t, 0.03);
  },
  b64(s) { const bin = atob(s), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr.buffer; },
  loadPack() {
    if (this.packLoading) return;
    this.packLoading = true;
    const go = () => {
      const P = window.__SFX; if (!P) return;
      const keys = Object.keys(P); let n = 0;
      const done = () => { if (++n === keys.length) { this.pack = true; try { delete window.__SFX; } catch (e) { window.__SFX = null; } } };
      for (const k of keys) this.ctx.decodeAudioData(this.b64(P[k]), (b) => { this.buf[k] = b; done(); }, done);
    };
    if (window.__SFX) return go();
    const s = document.createElement('script');
    s.src = (window.__ASSETS && window.__ASSETS.sfx) || 'assets/sfx.js';
    s.onload = go; s.onerror = () => {};
    document.head.appendChild(s);
  },
  // 太空裡沒有回音：只留一點很淡的反射，讓大的聲音有尾巴（兩條有回授的延遲線，左右分開）
  buildTail() {
    const c = this.ctx;
    this.tailIn = c.createGain(); this.tailOut = c.createGain(); this.tailOut.gain.value = 0.18; this.tailOut.connect(this.world);
    [[-0.7, 0.15], [0.7, 0.31]].forEach(([pan, dl]) => {
      const d = c.createDelay(1), lp = c.createBiquadFilter(), hp = c.createBiquadFilter(), fb = c.createGain();
      d.delayTime.value = dl; lp.type = 'lowpass'; lp.frequency.value = 1500; hp.type = 'highpass'; hp.frequency.value = 160; fb.gain.value = 0.15;
      this.tailIn.connect(d); d.connect(lp); lp.connect(hp); hp.connect(fb); fb.connect(d);
      let out = hp; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; hp.connect(p); out = p; }
      out.connect(this.tailOut);
    });
  },
  // 大爆炸時把其他聲音暫時壓低（amt＝壓掉的比例）
  duck(amt, dur = 0.35) {
    if (!this.ctx) return;
    const g = this.duckG.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1 - amt, t + 0.03); g.setTargetAtTime(1, t + dur, dur * 0.6);
  },
  // ---- 發聲上限：滿了搶走優先度最低的（12 ms 淡出）；同一個樣本最多 max 個（搶最舊的） ----
  voiceKill(v, t) { try { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + 0.012); v.s.stop(t + 0.02); } catch (e) { /* 已經停了 */ } v.dead = true; },
  voiceAdmit(k, pr, max, t) {
    const V = (this.voices = this.voices.filter((v) => !v.dead && v.end > t));
    let same = 0, oldest = null;
    for (const v of V) if (v.k === k) { same++; if (!oldest || v.t0 < oldest.t0) oldest = v; }
    if (same >= max && oldest) this.voiceKill(oldest, t);
    if (V.length - (same >= max ? 1 : 0) < SND_VOICES) return true;
    let low = null;
    for (const v of V) if (!v.dead && (!low || v.pr < low.pr)) low = v;
    if (!low || low.pr > pr) return false;
    this.voiceKill(low, t); return true;
  },
  // 播一個樣本。sp＝位置（sndSpace 的結果：g 音量、pan 左右、f 低通；null＝不分位置）；bus 'ui'＝介面
  // o：{ pr 優先度權重, hp 高通 Hz, send 反射送出量, vr 音量隨機（dB）, max 同樣本上限 }
  play(k, vol = 1, rate = 1, detune = 0.06, minGap = 0.03, sp = null, delay = 0, o = null, bus = null) {
    if (!this.ctx) return;
    const b = this.buf[k]; if (!b) return;
    const c = this.ctx, t = c.currentTime, gk = k + (sp ? '@' : '');
    if (t - (this.lastT[gk] ?? -9) < minGap) return;
    const rate1 = rate * (1 + (sndRnd() * 2 - 1) * detune);
    const vr = o && o.vr != null ? o.vr : 1.5, vol1 = vol * Math.pow(10, (sndRnd() * 2 - 1) * vr / 20) * (sp ? sp.g : 1);
    if (vol1 < 0.004) return;
    if (c.state === 'suspended') c.resume();
    const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate1;
    const g = c.createGain(); g.gain.value = vol1;
    if (bus === 'ui') { this.lastT[gk] = t; s.connect(g); g.connect(this.uiBus); s.start(t + delay); return; }
    const pr = vol1 * ((o && o.pr) || (sp ? 1 : 3));
    if (!this.voiceAdmit(k, pr, (o && o.max) || SND_KEY_MAX, t)) return;
    this.lastT[gk] = t;
    let head = s;
    if (o && o.hp) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = o.hp; s.connect(h); head = h; }
    head.connect(g);
    let out = g;
    if (sp) {
      if (c.createStereoPanner && sp.pan) { const p = c.createStereoPanner(); p.pan.value = sp.pan; out.connect(p); out = p; }
      if (sp.f < 17000) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = sp.f; out.connect(lp); out = lp; }
    }
    out.connect(this.sfx);
    if (o && o.send > 0) { const sg = c.createGain(); sg.gain.value = o.send; out.connect(sg); sg.connect(this.tailIn); }
    const v = { s, g, k, pr, t0: t, end: t + delay + b.duration / Math.max(0.1, rate1) + 0.05 };
    this.voices.push(v);
    s.onended = () => { v.dead = true; try { out.disconnect(); } catch (e) { /* 已經斷了 */ } };
    s.start(t + delay);
  },
  // 從清單裡輪流挑（不連續兩次同一個）；只挑已經載入的
  pickKey(list) {
    const ok = list.filter((k) => this.buf[k]);
    if (!ok.length) return null;
    if (ok.length === 1) return ok[0];
    const id = list.join(','); let i = Math.floor(sndRnd() * ok.length);
    if (ok[i] === this.rr[id]) i = (i + 1) % ok.length;
    return (this.rr[id] = ok[i]);
  },
  pickPlay(list, vol, rate, sp, detune = 0.06, minGap = 0.03, delay = 0, o = null) { const k = this.pickKey(list); if (k) this.play(k, vol, rate, detune, minGap, sp, delay, o); },
  layer(L, vk, rk, sp, o, delay = 0, detune = 0.05, gap = 0.012) {
    if (!L || vk <= 0.003) return false;
    const k = this.pickKey(L[0]); if (!k) return false;
    this.play(k, L[1] * vk, L[2] * rk, detune, gap, sp, delay, o);
    return true;
  },
  tone(f0, f1, dur, vol, type = 'square', delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.4, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.uiBus); o.start(t); o.stop(t + dur + 0.02);
  },
  // ---- 循環音（推進器、光矛、環境）：每幀呼叫，音量平滑；target≈0 一陣子就停掉 ----
  loopSet(name, key, target, rate = 1, bus = null) {
    if (!this.ctx) return;
    let L = this.loops[name]; const b = this.buf[key];
    if (L && L.key !== key) { try { L.s.stop(); } catch (e) { /* 已經停了 */ } delete this.loops[name]; L = null; }
    if (!L) {
      if (!b || target <= 0.01) return;
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = b; s.loop = true; s.loopStart = Math.min(0.05, b.duration * 0.1); s.loopEnd = b.duration - Math.min(0.05, b.duration * 0.1);
      s.playbackRate.value = rate; g.gain.value = 0; s.connect(g); g.connect(bus === 'amb' ? this.amb : this.sfx);
      s.start(this.ctx.currentTime, s.loopStart + sndRnd() * b.duration * 0.5);
      L = this.loops[name] = { s, g, v: 0, key };
    }
    const t = this.ctx.currentTime;
    L.v += (target - L.v) * 0.15;
    L.g.gain.setTargetAtTime(L.v, t, 0.05); L.s.playbackRate.setTargetAtTime(rate, t, 0.1);
    if (target <= 0.01 && L.v < 0.02) { try { L.s.stop(t + 0.1); } catch (e) { /* 已經停了 */ } delete this.loops[name]; }
  },
  stopLoops() { for (const k in this.loops) { try { this.loops[k].s.stop(); } catch (e) { /* 已經停了 */ } } this.loops = {}; },

  // ───── 高階：武器、爆炸、命中 ─────
  // R＝配方；sp＝位置（null＝自己的）；n＝這一群有幾發；rk＝音高倍率
  shot(R, sp, n, rk = 1) {
    const own = !sp, u = sp ? sp.u : 0, vk = (own ? 1.1 : 0.9) * sndCount(n), gap = R.gap || 0.025;
    const o = { pr: own ? 3 : 1, hp: own ? 0 : 90, send: (R.tail || 0.3) * (own ? 0.5 : 0.8 + u * 0.6), max: R.max || SND_KEY_MAX };
    let ok = false;
    if (u < 1 || !R.far) ok = this.layer(R.near, vk * (R.far ? 1 - u : 1), rk, sp, o, 0, 0.05, gap);
    if (u > 0 && R.far) ok = this.layer(R.far, vk * (0.35 + 0.65 * u), rk, sp, o, 0, 0.05, gap) || ok;
    if (!ok) this.layer(R.fb, vk * (own ? 1 : 0.9), rk, sp, o, 0, 0.06, gap);
    if (own) { this.layer(R.body, 1, rk, null, o, 0.004, 0.05, gap); this.layer(R.low, 1, 1, null, { pr: 3, max: 3 }, 0, 0.03, gap); }
    else if (u < 0.5 && R.body) this.layer(R.body, vk * 0.35 * (1 - u * 2), rk, sp, o, 0.004, 0.05, gap);
    if (n >= 4) this.layer(R.far || R.near, vk * 0.35, rk * 0.97, sp, o, 0.03 + sndRnd() * 0.07, 0.06, 0);   // 一整排同時開火：補一層稍晚的，聽起來是一陣齊射
  },
  // 爆炸：'small' 小船、'big' 大船、'huge' 旗艦（大的近距離時壓低其他聲音）
  explode(size, sp, n = 1) {
    const u = sp ? sp.u : 0, far = u > 0.5, cn = sndCount(n);
    if (size === 'huge') {
      this.play('explodeBig', 1.0 * cn, 0.8, 0.05, 0.03, sp, 0, { pr: 2.5, send: 0.9 });
      this.play('exHuge', 0.9, 0.85, 0.05, 0.05, sp, 0, { pr: 2.5, send: 0.6 });
      this.play('boom1', 1.0, 0.8, 0.05, 0.03, sp);
      this.play('~thC', 1.0, 0.8, 0.03, 0.05, sp, 0, { pr: 2.5 });
      this.play('debris', 0.8, 0.8, 0.05, 0.03, sp, 0.08);
      this.pickPlay(['clatter1', 'clatter2'], 0.5, 0.7, sp, 0.06, 0.03, 0.2);
      this.debrisRain(sp, 4, 0.35);
      if (!sp || sp.g > 0.5) this.duck(0.5, 0.7);
    } else if (size === 'big') {
      if (!far) this.pickPlay(['crunch1', 'crunch2', 'crunch3'], 0.7, 0.9, sp);
      this.play('explodeBig', 1.0 * cn, 0.95, 0.05, 0.03, sp, 0, { pr: 2, send: 0.7 });
      this.play('exA', far ? 0.5 : 0.8, 0.9, 0.06, 0.04, sp, 0, { send: 0.5 });
      this.play('boom2', 0.8, 1.0, 0.06, 0.05, sp);
      if (!far) this.play('~thC', 0.8, 1, 0.04, 0.05, sp, 0, { pr: 2 });
      this.play('distant', 0.5, 1.0, 0.05, 0.03, sp, 0.06, { send: 0.5 });
      this.debrisRain(sp, 2, 0.25);
      if (!sp || sp.g > 0.8) this.duck(0.3, 0.35);
    } else {
      this.pickPlay(['explode', 'explode2', 'explode3'], 0.8 * cn, 1.05, sp);
      this.play('exMini', far ? 0.25 : 0.45, 1.15, 0.08, 0.04, sp, 0, { send: 0.45 });
      if (!far) { this.pickPlay(['crunch1', 'crunch2', 'crunch3'], 0.35, 1.3, sp, 0.1, 0.05); this.play('~thB', 0.45, 1.2, 0.05, 0.05, sp, 0, { max: 3 }); }
    }
  },
  // 爆炸之後打在船殼上的碎片（0.3～0.9 秒後，只有近的才聽得到）
  debrisRain(sp, n, vol) {
    if (sp && sp.u > 0.3) return;
    for (let i = 0; i < n; i++) {
      const k = this.pickKey(['mHit1', 'mHit3', 'mHit5', 'impMetal', 'impStone']);
      if (k) this.play(k, vol * (0.6 + sndRnd() * 0.5), 0.6 + sndRnd() * 0.4, 0.1, 0.01, sp && { ...sp, pan: sndClamp(sp.pan + (sndRnd() - 0.5) * 0.5, -1, 1) }, 0.3 + sndRnd() * 0.6, { max: 6, pr: 0.4 });
    }
  },
  hull(sp, n, heavy) {
    const cn = sndCount(n);
    this.pickPlay(['hit', 'hit2', 'hit3'], 0.45 * cn, heavy ? 0.8 : 1.0, sp);
    this.pickPlay(['armor1', 'armor2', 'armor3'], 0.4, heavy ? 0.7 : 0.85, sp, 0.1, 0.04);
    if (!sp || sp.u < 0.4) { const k = this.pickKey(heavy ? ['mHvy1', 'mHvy2', 'mHvy3'] : ['mHit1', 'mHit2', 'mHit3', 'mHit4']); if (k) this.play(k, 0.3, 0.75, 0.1, 0.03, sp, 0, { max: 5 }); }
  },
  shield(sp, n, heavy) {
    this.pickPlay(['plate1', 'plate2'], (heavy ? 0.7 : 0.45) * sndCount(n), heavy ? 0.7 : 1.0, sp, 0.08, 0.04);
    const k = this.pickKey(['eHi2', 'eHi3', 'dome1']); if (k) this.play(k, heavy ? 0.32 : 0.2, 1.3, 0.08, 0.06, sp);
  },
  // ---- 介面 ----
  ui(kind) {
    if (!this.ctx) return;
    if ((!kind || kind === 'cmd') && this.ctx.currentTime - this.btnT < 0.08) return;   // 按鈕下的命令：按鈕聲已經響過
    this.btnT = this.ctx.currentTime;
    if (kind === 'back') this.play('uiBack', 0.7, 1.0, 0.02, 0.03, null, 0, null, 'ui');
    else if (kind === 'ok') this.play('uiOk', 0.5, 1.0, 0.02, 0.05, null, 0, null, 'ui');
    else if (kind === 'err') this.play('uiErr', 0.6, 1.0, 0.02, 0.05, null, 0, null, 'ui');
    else if (kind === 'tog') this.play('uiTog', 0.6, 1.0, 0.04, 0.03, null, 0, null, 'ui');
    else if (kind === 'cmd') this.play('uiSel', 0.5, 1.1, 0.04, 0.06, null, 0, null, 'ui');
    else this.play('uiClick', 0.7, 1.0, 0.04, 0.03, null, 0, null, 'ui');
  },
};

// 數量 → 音量倍率（一群越多發越大聲，但不會線性疊上去）
function sndCount(n) { return Math.min(2, 1 + 0.4 * Math.log2(Math.max(1, n))); }
function sndOpts() { const A = SETTINGS.audio || {}; return { on: A.on !== false, m: A.m ?? 0.8, s: A.s ?? 1, u: A.u ?? 0.7 }; }
// 聽者：一般＝鏡頭看的那一點（拉得越遠、聽的範圍越大但整體小聲一點）；駕駛、艦長、艦橋＝鏡頭本身
// 回傳 { g 音量, pan 左右（-1～1）, f 低通 Hz, u 遠近（0 近～1 遠） }；太遠＝null
const _sndP = new THREE.Vector3();
function sndRef() {
  if ((PL.on && !PL.spec) || CAP.on || BR.on) return { close: true, ref: PL.on && !PL.spec ? 45 : CAP.on ? 70 : 140, zoom: 1 };
  return { close: false, ref: view.height * 0.55, zoom: sndClamp(Math.pow(420 / view.height, 0.35), 0.55, 1.15) };
}
function sndDist(x, y, z, R) {
  if (R.close) { const c = camera.position; return Math.hypot(x - c.x, y - c.y, z - c.z); }
  return Math.hypot(x - view.target.x, (y - view.target.y) * 0.5, z - view.target.z);
}
function sndSpace(x, y, z, R) {
  const ref = R.ref, d = sndDist(x, y, z, R), g = ref / (ref + 1.25 * Math.max(0, d - ref));
  if (g < 0.03) return null;
  _sndP.set(x, y, z).project(camera);
  let pan = sndClamp(_sndP.x, -1.3, 1.3) / 1.3 * 0.85; if (_sndP.z > 1) pan = -pan;   // 在鏡頭後面：左右相反
  return { g: g * R.zoom, pan, f: sndClamp(18000 * Math.pow(g, 0.8), 1400, 18000), u: sndClamp((d - ref) / (ref * 2), 0, 1) };
}

// ───── 事件：模擬裡呼叫（便宜：只做合併） ─────
// k：f 開火（a＝砲種、b＝艦種）、hs 護盾命中、hh 船體命中（a：1＝主砲、2＝玩家打的）、mh 飛彈命中、mx 飛彈自爆、ix 攔截、
//    fd 艦載機被擊落、rk 打到岩石、gx 打到地面、k 擊沉（a＝份量，旗艦 ≥10）、fl 艦載機出擊
// own＝自己的（艦長的船、駕駛的機）：不分位置、完整的層
let _sndR = null, _sndC = 100;
function sndEv(k, x, y, z, t, a = 0, b = 0, own = false) {
  if (!SND.live) return;
  const R = _sndR;
  let key, d = 0;
  if (own) key = k + '|' + a + '|o|' + Math.floor(t * 8);
  else {
    d = sndDist(x, y, z, R);
    if (d > R.ref * 9) return;   // 太遠：聽不到
    key = k + '|' + (k === 'k' ? '' : a) + '|' + Math.floor(x / _sndC) + ',' + Math.floor(z / _sndC) + '|' + Math.floor(t * 8);
  }
  const E = SND.ev, g = E.get(key);
  if (g) {
    g.n++;
    if (k === 'k') g.a = Math.max(g.a, a);
    if (b < g.b) g.b = b;
    if (d < g.d) { g.x = x; g.y = y; g.z = z; g.d = d; }
    if (t < g.t) g.t = t;
    return;
  }
  if (E.size > 3000) return;
  E.set(key, { k, a, b, x, y, z, t, d, n: 1, own });
}
// 3D 砲塔的開火紀錄（main.js 的 rigFire）＝每一門砲開火：位置用分艦隊的中心（不必再算船的位置）
function sndFire(i, gk, t0) {
  if (!SND.live) return;
  const q = squadrons[ships.sq[i]]; if (!q || q.bg) return;
  sndEv('f', q.x, q.y || 0, q.z, t0, gk, ships.type[i], CAP.on && !!CAP.byI && CAP.byI[i] >= 0);
}
function sndKill(i, x, y, z, t, flag) { sndEv('k', x, y, z, t, (SND_KILL_W[ships.type[i]] || 1) + (flag ? 10 : 0)); }
// 駕駛自己的武器（pilot.js）：W.id → 配方
function sndPilotShot(id) { if (!SND.live) return; const R = SND_GUN['p_' + id]; if (R) SND.shot(R, null, 1); }
// 駕駛被打中：護盾＝鏗、機體＝悶響；dead＝被擊墜
function sndPilotHurt(hull, dead) {
  if (!SND.live) return;
  if (dead) { SND.explode('big', null); SND.duck(0.6, 1.0); return; }
  if (hull) { SND.pickPlay(['hit', 'hit2', 'hit3'], 0.55, 0.9, null); SND.play('thud1', 0.4, 0.8, 0.08, 0.08); const k = SND.pickKey(['mHvy1', 'mHvy2', 'mHvy3']); if (k) SND.play(k, 0.35, 0.75, 0.08, 0.07); }
  else { SND.pickPlay(['plate1', 'plate2'], 0.55, 1.1, null, 0.08, 0.05); SND.play('shield', 0.4, 1.2, 0.05, 0.06); }
}
// 事件提示：start 開戰、win／lose／draw 結算、skill 技能、test 試聽
function sndCue(kind) {
  if (!SND.ctx) return;
  const P = (k, v, r, dl = 0) => SND.play(k, v, r, 0.02, 0.1, null, dl, null, 'ui');
  if (kind === 'start') { P('alarmBig', 0.4, 0.8); P('~sting', 0.55, 1, 0.1); P('~thC', 0.5, 0.8, 0.1); }
  else if (kind === 'win') { SND.tone(523, 523, 0.25, 0.3, 'triangle'); SND.tone(659, 659, 0.3, 0.3, 'triangle', 0.12); SND.tone(784, 784, 0.5, 0.3, 'triangle', 0.24); P('~sting', 0.5, 1.2, 0.05); }
  else if (kind === 'lose') { P('~stingL', 0.6, 0.85); P('~thC', 0.5, 0.7); }
  else if (kind === 'draw') { P('~sting', 0.45, 0.9); }
  else if (kind === 'skill') { P('charge', 0.45, 1.1); P('phUp', 0.35, 0.9, 0.05); }
  else if (kind === 'test') { SND.shot(SND_GUN.main, null, 1); setTimeout(() => SND.explode('big', null), 450); }
}

// ───── 每一幀（main.js 的 frame）：播到時間的事件群、循環音 ─────
let _sndAmbT = 0;
function sndFrame(dt) {
  const C = SND.ctx;
  SND.live = !!C && C.state === 'running' && sndOpts().on && SND_PHASES.includes(GAME.phase) && !document.hidden;
  if (!SND.live) { if (SND.ev.size) SND.ev.clear(); if (C && Object.keys(SND.loops).length) SND.stopLoops(); return; }
  _sndR = sndRef(); _sndC = Math.max(40, _sndR.ref * 0.6);   // 合併的區塊大小：跟著聽的範圍
  const now = U.uTime.value, due = [];
  for (const [key, g] of SND.ev) {
    if (g.t > now) continue;
    SND.ev.delete(key);
    if (now - g.t > SND_STALE) continue;
    const sp = g.own ? null : sndSpace(g.x, g.y, g.z, _sndR);
    if (!g.own && !sp) continue;
    g.sp = sp; g.pr = (SND_PRI[g.k] || 1) * (sp ? sp.g : 2) * sndCount(g.n);
    due.push(g);
  }
  if (due.length > SND_GROUPS) due.sort((a, b) => b.pr - a.pr);
  for (let i = 0; i < due.length && i < SND_GROUPS; i++) sndPlayGroup(due[i]);
  const S = SND.stat; S.frames++; S.due += due.length; S.played += Math.min(due.length, SND_GROUPS); S.maxVoices = Math.max(S.maxVoices, SND.voices.length);
  for (const g of due) S.ev[g.k] = (S.ev[g.k] || 0) + g.n;
  // 環境：低沉的艦內嗡聲（作戰中），駕駛時換成推進器
  const pil = PL.on && !PL.spec && !PL.dead && GAME.phase === 'battle';
  _sndAmbT += dt;
  SND.loopSet('amb1', 'ambHum', 0.22, 1, 'amb'); SND.loopSet('amb2', 'ambLow', 0.16, 1, 'amb');
  if (SND.amb.gain.value < 0.99) SND.amb.gain.setTargetAtTime(1, C.currentTime, 0.8);
  const Fr = PL.frame, sr = pil && Fr ? sndClamp(Math.abs(PL.speed) / (Fr.max || 1), 0, 1.2) : 0;
  SND.loopSet('thr', 'thrustLoop', pil ? 0.12 + 0.3 * sr + (PL.boosting ? 0.15 : 0) : 0, 0.8 + 0.4 * sr);
  SND.loopSet('jet', '~jetLoop', pil && PL.boosting ? 0.25 : 0, 1.1);
  if (pil && PL.boosting && !SND.boostOn) { SND.play('~qbPre', 0.4, 1, 0.08, 0.2); SND.play('boostUp', 0.6, 1.1, 0.08, 0.2, null, 0.04); SND.play('thrBurst', 0.45, 1.1, 0.08, 0.2, null, 0.04); }
  if (pil && !PL.boosting && SND.boostOn) SND.play('~jetTail', 0.3, 1, 0.08, 0.2);
  SND.boostOn = pil && PL.boosting;
  const lance = pil && PL.beam && now - PL.beam.t < 0.15;
  SND.loopSet('lance', 'eLow2', lance ? 0.45 : 0, 1.15);
}
const SND_PRI = { k: 4, mh: 1.6, f: 1, hh: 1.1, hs: 0.9, mx: 0.8, ix: 0.7, fd: 0.8, rk: 0.5, gx: 0.8, fl: 0.6 };
function sndPlayGroup(g) {
  const sp = g.sp, n = g.n;
  switch (g.k) {
    case 'f': { const R = SND_GUN[g.a] || SND_GUN.sec; SND.shot(R, sp, n, SND_TYPE_RATE[g.b] || 1); break; }
    case 'hs': SND.shield(sp, n, g.a === 1); break;
    case 'hh': SND.hull(sp, n, g.a === 1); if (g.a === 2) SND.play('uiTick', 0.22, 1.25, 0.04, 0.045, null, 0, null, 'ui'); break;   // 玩家打中：命中確認
    case 'mh': SND.explode('small', sp, n); SND.hull(sp, 1, true); break;
    case 'mx': SND.pickPlay(['explode', 'explode2', 'explode3'], 0.5 * sndCount(n), 1.2, sp); break;
    case 'gx': SND.explode('small', sp, n); break;
    case 'ix': SND.play('exMini', 0.4 * sndCount(n), 1.4, 0.08, 0.04, sp); SND.pickPlay(['zap1', 'zap2'], 0.2, 1.3, sp); break;
    case 'fd': SND.pickPlay(['explode2', 'explode3'], 0.45 * sndCount(n), 1.45, sp); SND.play('exMini', 0.3, 1.5, 0.08, 0.05, sp); break;
    case 'rk': SND.pickPlay(['rock1', 'rock2'], 0.45 * sndCount(n), 1.0, sp, 0.1, 0.04); SND.play('impStone', 0.3, 0.8, 0.1, 0.05, sp); break;
    case 'fl': SND.play('thrBurst', 0.35 * sndCount(n), 1.2, 0.08, 0.1, sp); SND.play('boostUp', 0.25, 1.4, 0.08, 0.1, sp, 0.05); break;
    case 'k': SND.explode(g.a >= 10 ? 'huge' : g.a >= 3 || n >= 3 ? 'big' : 'small', sp, n); break;
  }
}

window.__snd = { SND, SND_GUN, sndCue, sndEv, sndPlayGroup, sndPilotShot, sndPilotHurt };   // 除錯、測試用
// ───── 啟動：第一次點擊／按鍵建立 AudioContext；按鈕、勾選的介面音 ─────
function sndGesture() { if (!SND.ctx) SND.init(); else if (SND.ctx.state === 'suspended') SND.ctx.resume(); }
addEventListener('pointerdown', sndGesture, true);
addEventListener('keydown', sndGesture, true);
addEventListener('click', (e) => {
  const el = e.target && e.target.closest && e.target.closest('button, .g-btn, input[type=checkbox], select');
  if (!el || el.disabled) return;
  SND.ui(el.type === 'checkbox' ? 'tog' : /返回|關閉|取消|完成/.test(el.textContent || '') ? 'back' : '');
}, true);
