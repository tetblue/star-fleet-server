// ═══════════════════════ 運鏡：關鍵影格的鏡頭（參考 rubicon-protocol 的 game/cine.js 的 cineCamera，MIT） ═══════════════════════
// 鍵：{ t 秒, x, z 看的點, h 視野高度, yaw, pitch }；位置用 Catmull-Rom 曲線（平順通過每個鍵）、高度用對數內插、角度取最短轉法。
// 整段再套一次緩入緩出。只改戰場鏡頭（view），不碰模擬；播放期間暫停戰鬥，任何按鍵或點擊略過。
// 目前用在：開戰運鏡（cineIntroStart，設定「開戰運鏡」）。之後的劇情過場也可以用 cinePlay(keys, onEnd)。
const CINE = { on: false, pend: null, keys: null, T: 0, dur: 0, wasPaused: false, onEnd: null };

function cineEase(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
const cineCR = (p0, p1, p2, p3, u) => { const u2 = u * u, u3 = u2 * u; return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); };
// 在時間 T 的鏡頭（view 的欄位）
function cineEval(K, T) {
  const n = K.length;
  if (T <= K[0].t) return K[0];
  if (T >= K[n - 1].t) return K[n - 1];
  let i = 0; while (i < n - 2 && T > K[i + 1].t) i++;
  const a = K[Math.max(0, i - 1)], b = K[i], c = K[i + 1], d = K[Math.min(n - 1, i + 2)], u = (T - b.t) / (c.t - b.t);
  const ang = (p, q) => p + wrapAngle(q - p);   // 角度：取最短的轉法
  const yb = b.yaw, yc = ang(yb, c.yaw), ya = ang(yb, a.yaw), yd = ang(yc, d.yaw);
  return {
    x: cineCR(a.x, b.x, c.x, d.x, u), z: cineCR(a.z, b.z, c.z, d.z, u),
    h: Math.exp(cineCR(Math.log(a.h), Math.log(b.h), Math.log(c.h), Math.log(d.h), u)),
    yaw: cineCR(ya, yb, yc, yd, u), pitch: cineCR(a.pitch, b.pitch, c.pitch, d.pitch, u),
  };
}
function cineApply(v) {
  view.target.x = v.x; view.target.z = v.z; view.height = Math.max(view.minH, Math.min(view.maxH, v.h));
  view.yaw = v.yaw; view.pitch = Math.max(0.12, Math.min(1.45, v.pitch));
  updateCamera();
}
// 播一段運鏡：keys 的 t 從 0 開始；播完（或略過）回到最後一個鍵，呼叫 onEnd
function cinePlay(keys, onEnd) {
  CINE.on = true; CINE.keys = keys; CINE.T = 0; CINE.dur = keys[keys.length - 1].t; CINE.onEnd = onEnd || null;
  CINE.wasPaused = paused; paused = true; updateTimeUI();
  camAnim = null;
}
function cineStop() {
  if (!CINE.on) return;
  const K = CINE.keys;
  CINE.on = false; cineApply(K[K.length - 1]);
  paused = CINE.wasPaused; updateTimeUI();
  const f = CINE.onEnd; CINE.onEnd = null; if (f) f();
}

// ───── 開戰運鏡：從敵軍掃過整個戰場、經過我軍，回到指揮的視角 ─────
// 開戰時先排定（cineIntroStart），下一幀才開始：那時候切 3D 的鏡頭動畫、駕駛／艦長／艦橋都已經設定好
function cineIntroStart() {
  if (SETTINGS.introCam === false || NET.on || GAME.replaying || GAME.watch) return;
  if (typeof TUT !== 'undefined' && TUT.L) return;   // 教學關卡不播
  CINE.pend = { t: 0 };
}
function cineIntroBuild() {
  if (PL.on || CAP.on || BR.on || GAME.phase !== 'battle') return null;
  const ps = GAME.playerSide, c = [{ x: 0, z: 0, n: 0 }, { x: 0, z: 0, n: 0 }];
  for (const q of squadrons) { if (q.alive <= 0 || q.bg || q.hidden) continue; const C = c[q.side === ps ? 0 : 1]; C.x += q.x * q.alive; C.z += q.z * q.alive; C.n += q.alive; }
  if (!c[0].n || !c[1].n) return null;
  for (const C of c) { C.x /= C.n; C.z /= C.n; }
  // 終點＝現在的指揮視角（切 3D 的鏡頭動畫還在跑就用它的終點）
  const E = camAnim ? { ...camAnim.to } : { x: view.target.x, z: view.target.z, h: view.height, yaw: view.yaw, pitch: view.pitch };
  camAnim = null;
  const me = c[0], cl = (v, a, b) => Math.max(a, Math.min(b, v));
  // 戰爭迷霧：不能把鏡頭帶到敵軍那裡（會洩漏位置）——改從地圖中央開始，只掃過我軍
  let en = c[1];
  if (typeof fowView === 'function' && fowView()) {
    const B = MAP_BOUNDS, mx = (B.x0 + B.x1) / 2, mz = (B.z0 + B.z1) / 2;
    en = { x: mx + (mx - me.x) * 0.3, z: mz + (mz - me.z) * 0.3 };   // 地圖中央再往前一點（我軍看出去的方向）
  }
  const D = Math.hypot(en.x - me.x, en.z - me.z), mid = { x: (me.x + en.x) / 2, z: (me.z + en.z) / 2 }, p3 = mode3D;
  return [
    { t: 0, x: en.x, z: en.z, h: cl(D * 0.45, 240, 900), yaw: E.yaw + (p3 ? 0.8 : 0), pitch: p3 ? 0.26 : E.pitch },   // 敵軍：低角度
    { t: 2.1, x: mid.x, z: mid.z, h: cl(D * 0.95, 420, 1700), yaw: E.yaw + (p3 ? 0.35 : 0), pitch: p3 ? 0.62 : E.pitch },   // 拉高：整個戰場
    { t: 3.9, x: me.x, z: me.z, h: cl(D * 0.42, 220, 800), yaw: E.yaw - (p3 ? 0.25 : 0), pitch: p3 ? 0.3 : E.pitch },   // 我軍
    { t: 5.2, x: E.x, z: E.z, h: E.h, yaw: E.yaw, pitch: E.pitch },   // 回到指揮視角
  ];
}
// 每一幀（main.js 的 frame，用真實時間）
function cineFrame(dt) {
  if (CINE.pend) {
    if ((CINE.pend.t += dt) < 0.05) return;
    CINE.pend = null;
    const K = cineIntroBuild();
    if (K) cinePlay(K);
  }
  if (!CINE.on) return;
  if (GAME.phase !== 'battle' && GAME.phase !== 'sandbox') { CINE.on = false; return; }   // 離開了戰鬥：不還原
  CINE.T += Math.min(dt, 0.05);
  if (CINE.T >= CINE.dur) { cineStop(); return; }
  cineApply(cineEval(CINE.keys, cineEase(CINE.T / CINE.dur) * CINE.dur));
}
// 播放中：任何按鍵、點擊＝略過（這一下不傳給遊戲）
for (const ev of ['keydown', 'pointerdown', 'wheel']) addEventListener(ev, (e) => {
  if (!CINE.on) return;
  e.stopImmediatePropagation(); if (ev !== 'wheel') e.preventDefault();
  cineStop();
}, { capture: true, passive: false });
