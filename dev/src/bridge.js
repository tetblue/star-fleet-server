// ═══════════════════════ 指揮官視角（旗艦艦橋） ═══════════════════════
// 鏡頭放在目前指揮艦隊的旗艦艦橋上，看艦首前方。滑鼠左右移動＝轉頭（游標越靠邊轉越多）：
//   往左看會滑出「戰況」視窗，往右看會滑出「各艦隊旗艦」子畫面（其他艦隊旗艦看到的畫面，點一下切過去）。
//   往下看＝戰術台（就是戰術面板）。艦橋上只能透過戰術台下令：戰場畫面上的點擊、命令快捷鍵都不作用。
// 純畫面功能：不影響模擬，也不進命令紀錄。只有 3D 模型能從艦橋看（2D 貼圖只有 30° 俯角）。
const BR_FOV = 55;                 // 垂直視角
const BR_FWD = -0.16;              // 平視時的俯角（往下一點：看得到自己艦首的主砲、副砲與前方戰場）
const BR_CON = -1.05;              // 低頭看戰術台
const BR_PMAX = 0.55, BR_PMIN = -1.15;
const BR_UP = 0.34, BR_BACK = 0.36; // 鏡頭在艦上的位置（艦長的倍數）：艦橋，略高略後
const BR_PANEL_YAW = { stat: -1.2, pip: 1.2 };   // 方位儀上標示懸浮視窗的方位（相對艦首，左負右正）
const BR_MOUSE_MAX = 1.75, BR_MOUSE_DEAD = 0.12;   // 游標在最邊緣＝轉 100°；中央 12% 不轉
const BR_WIN_OPEN = 0.75, BR_WIN_CLOSE = 0.35;      // 轉頭超過約 43° 滑出視窗，回到 20° 內收回
// 艦橋上被擋下的命令（要低頭看戰術台才能用）
const BR_CMD_KEYS = new Set(['move', 'stop', 'orderly', 'attack', 'volley', 'missile', 'turn', 'area', 'scan']);
function bridgeBlocksKey(id) { return BR.on && bridgeConsoleK() < 0.9 && (id.startsWith('form_') || id.startsWith('skill_') || BR_CMD_KEYS.has(id)); }
Object.assign(BR, { on: false, el: null, fleet: null, fleetId: -1, ship: -1, shipFleet: null, shipH: null, pose: {},
  yaw: 0, pitch: BR_FWD, tYaw: 0, tPitch: BR_FWD, mYaw: 0, kYaw: 0, open: { stat: false, pip: false }, tp: null, closing: false, prev: null, lastIn: 0, acc: 1, pips: {}, pipRR: 0, fallback: {}, sig: '', pipSig: '' });
const _brV = new THREE.Vector3(), _brT = new THREE.Vector3();

function bridgeClampPitch(p) { return Math.max(BR_PMIN, Math.min(BR_PMAX, p)); }
function bridgeConsoleH() { return innerHeight; }   // 戰術台：低頭後占滿整個畫面
function bridgeConsoleK() { const x = Math.max(0, Math.min(1, (-BR.pitch - 0.42) / (0.98 - 0.42))); return x * x * (3 - 2 * x); }
function bridgeFleets() { return fleets.filter((f) => f.side === GAME.playerSide && !f.reserve && fleetAlive(f).length); }

// 艦隊的旗艦；被擊沉時司令部移到存活的最大艦（戰列 → 巡洋 → 航母 → 驅逐 → 護衛）
function bridgeShip(f) {
  const fs = f.sqs.find((q) => q.flagship >= 0);
  if (fs && ships.alive[fs.flagship]) return fs.flagship;
  const c = BR.fallback[f.id]; if (c != null && ships.alive[c] && ships.sq[c] != null && squadrons[ships.sq[c]].fleet === f) return c;
  const pref = [1, 2, 0, 3, 4, 5]; let best = -1, br = 9;
  for (const q of fleetAlive(f)) for (const i of q.list) { if (!ships.alive[i]) continue; const r = pref.indexOf(ships.type[i]); if (r < br) { br = r; best = i; } }
  BR.fallback[f.id] = best; return best;
}
function bridgePose(i, out) {
  const sq = squadrons[ships.sq[i]], t = U.uTime.value, seed = shipGeo.getAttribute('aInfo').array[i * 4 + 3];
  shipWorldCPU(i, _brV);
  // 與 3D 模型相同的微幅漂浮，鏡頭才會黏在艦上
  out.x = _brV.x + Math.sin(t * 0.31 + seed * 17) * 0.25; out.y = _brV.y + Math.sin(t * 0.6 + seed * 40) * 0.35; out.z = _brV.z + Math.cos(t * 0.27 + seed * 23) * 0.25;
  out.h = ships.snOn[i] ? ships.snH[i] : visHeading(sq, t, ships.lag[i]);
  out.p = ships.snOn[i] ? 0 : (sq.p || 0);   // 3D：艦橋跟著陣型俯仰
  out.L = shipGeo.getAttribute('aScale').array[i] * TYPE_LEN3;
  out.hk = hullKey(i);
  return out;
}
// 艦橋在船體模型上的位置（船長的倍數，船頭＋z、上＋y）：沿中線往下打射線找上層建築，取最高那一段的最前緣、略高於屋頂
const BR_SPOT = {};
function bridgeSpot(hk) {
  if (BR_SPOT[hk]) return BR_SPOT[hk];
  const M = typeof getModel === 'function' ? getModel(hk) : null;
  if (!M) return { z: -BR_BACK, y: BR_UP };
  const mesh = new THREE.Mesh(M.lods[0]), rc = new THREE.Raycaster(), hs = [], dn = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
  for (let z = -0.45; z <= 0.2001; z += 0.01) {
    let h = -9;
    for (const x of [-0.015, 0, 0.015]) { o.set(x, 3, z); rc.set(o, dn); const hit = rc.intersectObject(mesh)[0]; if (hit) h = Math.max(h, hit.point.y); }
    if (h > -9) hs.push([z, h]);
  }
  if (!hs.length) return (BR_SPOT[hk] = { z: -BR_BACK, y: BR_UP });
  const sorted = hs.map((a) => a[1]).sort((a, b) => a - b), top = sorted[Math.floor(sorted.length * 0.9)], base = sorted[Math.floor(sorted.length * 0.3)];
  const tower = hs.filter(([, h]) => h >= base + (top - base) * 0.75);
  const front = tower.reduce((m, a) => (a[0] > m[0] ? a : m), tower[0]);
  return (BR_SPOT[hk] = { z: front[0] + 0.006, y: front[1] + 0.014 });
}
function placeBridgeCam(cam, P, h, yaw, pitch) {
  // 鏡頭在艦橋上（跟著船的航向與俯仰）；視線方向用平滑過的航向 h
  const S = bridgeSpot(P.hk || 'e1'), ph = P.h != null ? P.h : h, pp = P.p || 0, cp0 = Math.cos(pp), sp0 = Math.sin(pp);
  const Fx = Math.sin(ph) * cp0, Fy = sp0, Fz = Math.cos(ph) * cp0, Ux = -Math.sin(ph) * sp0, Uy = cp0, Uz = -Math.cos(ph) * sp0;
  cam.position.set(P.x + (Fx * S.z + Ux * S.y) * P.L, P.y + (Fy * S.z + Uy * S.y) * P.L, P.z + (Fz * S.z + Uz * S.y) * P.L);
  pitch += P.p || 0;
  const a = h - yaw, cp = Math.cos(pitch);   // yaw 正＝往畫面右邊轉（艦艇的 h 增加是往左轉）
  _brT.set(cam.position.x + Math.sin(a) * cp, cam.position.y + Math.sin(pitch), cam.position.z + Math.cos(a) * cp);
  cam.up.set(0, 1, 0); cam.lookAt(_brT);
}
function bridgeCamera(recompute = true) {
  if (BR.ship < 0 || !ships.alive[BR.ship]) { if (!BR.fleet) return; BR.ship = bridgeShip(BR.fleet); if (BR.ship < 0) return; }
  if (recompute || BR.pose.L == null) bridgePose(BR.ship, BR.pose);
  if (BR.shipH == null) BR.shipH = BR.pose.h;
  camera = camPersp;
  camPersp.aspect = VW / VH; camPersp.fov = BR_FOV; camPersp.near = 0.05; camPersp.far = 7000;
  placeBridgeCam(camPersp, BR.pose, BR.shipH, BR.yaw, BR.pitch);
  camPersp.updateProjectionMatrix();
  CAM_DIR.set(-Math.sin(BR.shipH - BR.yaw) * Math.cos(BR.pitch), -Math.sin(BR.pitch), -Math.cos(BR.shipH - BR.yaw) * Math.cos(BR.pitch));
  renderPass.camera = camera;
  // 其他地方（箭頭大小、背景）用到 view：給個合理的值
  view.target.set(BR.pose.x + Math.sin(BR.shipH) * 200, 0, BR.pose.z + Math.cos(BR.shipH) * 200); view.height = 160;
}

// ── 進入／離開／切換 ──
function toggleBridge() {
  if (PL.on) return;   // 駕駛中沒有艦橋
  if (BR.on) { if (opNow() === 2) { toast('擬真難度：作戰中只能使用指揮官模式'); return; } exitBridge(); }   // 擬真：不能離開艦橋
  else enterBridge();
}
function enterBridge(f) {
  if (!(GAME.phase === 'battle' || GAME.phase === 'replay') || GAME.result) { toast('指揮官視角只能在作戰中使用'); return false; }
  const list = bridgeFleets(); if (!list.length) return false;
  if (!f) { const sf = [...selected].map((q) => q.fleet).filter(Boolean); f = sf.length && sf.every((x) => x === sf[0]) && list.includes(sf[0]) ? sf[0] : list[0]; }
  const wasTac = TAC.open && !BR.on;
  if (!BR.on) BR.prev = { mode3D, x: view.target.x, z: view.target.z, h: view.height, yaw: view.yaw, pitch: view.pitch };
  if (wasTac) closeTac();               // 下方的戰術面板 → 改成艦橋的戰術台
  cancelDrag(); closeRadial(); if (aim) cancelAim();   // 進艦橋前的拖曳、輪盤一律作廢
  BR.on = true;
  if (!mode3D) setRenderMode('3d', false);   // 艦橋只能用 3D 模型（不改變玩家存的 2D／3D 偏好）
  camAnim = null;
  buildBridge(); BR.el.hidden = false; document.body.classList.add('bridge-on');
  BR.tYaw = BR.yaw = BR.mYaw = BR.kYaw = 0; BR.tPitch = BR.pitch = wasTac ? BR_CON : BR_FWD;
  bridgeSwitch(f, true);
  resize();
  return true;
}
function bridgeSwitch(f, quiet) {
  BR.fleet = f; BR.fleetId = f.id; BR.ship = bridgeShip(f); BR.shipFleet = f; BR.shipH = null; BR.pose = {};
  BR.sig = ''; BR.pipSig = ''; BR.acc = 1;
  if (BR.el) { const fl = BR.el.querySelector('.br-flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on'); }
  if (!quiet) toast(`切換到 ${f.name} 旗艦艦橋`);
}
function exitBridge() {
  if (!BR.on) return;
  if (TAC.open) { BR.closing = true; closeTac(); BR.closing = false; }
  BR.on = false; if (BR.el) BR.el.hidden = true;
  document.body.classList.remove('bridge-on', 'br-console', 'tac-console');
  const p = BR.prev || { mode3D, x: 0, z: 0, h: 560, yaw: view.yaw, pitch: view.pitch };
  view.target.set(p.x, 0, p.z); view.height = p.h; view.yaw = p.yaw; view.pitch = p.pitch;
  if (!p.mode3D && mode3D) setRenderMode('2d', !!p.persist);
  updateCamera(); resize();
}

// ── 轉頭 ──
function bridgeTouched() { BR.lastIn = performance.now(); }
function bridgeLookPx(dx, dy) { const rpp = BR_FOV * Math.PI / 180 / VH; BR.kYaw += dx * rpp; BR.tPitch = bridgeClampPitch(BR.tPitch - dy * rpp); bridgeTouched(); }
function bridgeWheel(d) {   // d > 0：往下捲＝低頭
  bridgeTouched();
  if (d > 0) BR.tPitch = BR.tPitch < -0.45 ? BR_CON : Math.max(BR_CON, BR.tPitch - d * 1.6);
  else BR.tPitch = BR.tPitch <= -0.45 ? -0.3 : bridgeClampPitch(BR.tPitch - d * 1.6);
  if (d > 0 && BR.tPitch < -0.5) BR.tPitch = BR_CON;     // 低到一半就直接看向戰術台
}
function bridgeKeys(dt) {
  const ys = 1.7 * dt, ps = 1.2 * dt; let k = false;
  if (keyHeld('cam_left') || keyHeld('cam_yaw_l')) { BR.kYaw -= ys; k = true; }
  if (keyHeld('cam_right') || keyHeld('cam_yaw_r')) { BR.kYaw += ys; k = true; }
  if (keyHeld('cam_up') || keyHeld('cam_pitch_up')) { BR.tPitch = bridgeClampPitch(BR.tPitch + ps); k = true; }
  if (keyHeld('cam_down') || keyHeld('cam_pitch_dn')) { BR.tPitch = bridgeClampPitch(BR.tPitch - ps); k = true; }
  if (k) bridgeTouched();
}
function bridgeLook(yaw, pitch) { if (yaw != null) BR.kYaw = wrapAngle(yaw - BR.mYaw); if (pitch != null) BR.tPitch = pitch; bridgeTouched(); }
function bridgeToggleConsole() { bridgeLook(null, BR.tPitch < -0.45 ? BR_FWD : BR_CON); }
// 滑鼠：游標的水平位置＝轉頭角度（中央不轉，越靠邊轉越多）。看著戰術台時不轉（游標要拿來操作）
function bridgeMouseX(x) {
  if (bridgeConsoleK() > 0.01) return;
  const c = (x - VW / 2) / (VW / 2), u = Math.max(0, Math.min(1, (Math.abs(c) - BR_MOUSE_DEAD) / (1 - BR_MOUSE_DEAD)));
  BR.mYaw = Math.sign(c) * BR_MOUSE_MAX * Math.pow(u, 1.15);
}
// 戰場畫面上的指標：只用來轉頭（觸控＝拖曳轉頭），不下令
function bridgePointer(type, e) {
  if (e.pointerType === 'touch') {
    if (type === 'down') BR.tp = { id: e.pointerId, x: e.clientX, y: e.clientY };
    else if (type === 'move' && BR.tp && BR.tp.id === e.pointerId) { bridgeLookPx(-(e.clientX - BR.tp.x), -(e.clientY - BR.tp.y)); BR.tp.x = e.clientX; BR.tp.y = e.clientY; }
    else if (type === 'up') BR.tp = null;
    return;
  }
  if (type === 'move') bridgeMouseX(e.clientX);
  else if (type === 'down' && bridgeConsoleK() < 0.5 && (e.button === 0 || e.button === 2)) bridgeNoCmd();
}
// 滑鼠移到畫面最下緣＝低頭看戰術台；看著戰術台時移到最上緣＝抬頭（Tab、滾輪照舊可用）
addEventListener('pointermove', (e) => {
  if (!BR.on || e.pointerType === 'touch' || settingsOpen()) return;
  const H = innerHeight, k = bridgeConsoleK();
  if (k < 0.5 && BR.tPitch > -0.45 && e.clientY >= H - Math.max(14, H * 0.035)) bridgeLook(null, BR_CON);
  else if (k > 0.9 && e.clientY <= Math.max(14, H * 0.03)) bridgeLook(null, BR_FWD);
});
let _brNoCmdT = 0;
function bridgeNoCmd() { const n = performance.now(); if (n - _brNoCmdT < 2500) return; _brNoCmdT = n; toast(`艦橋上要低頭看戰術台才能下令（滑鼠移到畫面最下方／滾輪往下／${keyText('tactical')}）`, 'hint'); }

// ── 每幀 ──
function bridgeFrame(dt) {
  if (!BR.on) return;
  if (!(GAME.phase === 'battle' || GAME.phase === 'replay')) { exitBridge(); return; }
  if (!fleets.includes(BR.fleet)) { BR.fleet = fleets.find((f) => f.id === BR.fleetId) || null; BR.ship = -1; BR.fallback = {}; BR.pips = {}; }
  if (!BR.fleet || !fleetAlive(BR.fleet).length) {
    const nf = bridgeFleets()[0];
    if (!nf) { exitBridge(); return; }
    if (BR.fleet) toast(`${BR.fleet.name}已全滅，指揮權移至 ${nf.name}`, 'bad');
    bridgeSwitch(nf, true);
  }
  const i = bridgeShip(BR.fleet);
  if (i !== BR.ship) {
    if (BR.ship >= 0 && BR.shipFleet === BR.fleet && !ships.alive[BR.ship]) toast(`旗艦被擊沉！司令部移至${SHIP_TYPES[ships.type[i]].name}`, 'bad');
    BR.ship = i; BR.shipFleet = BR.fleet;
  }
  bridgePose(i, BR.pose);
  BR.shipH = BR.shipH == null ? BR.pose.h : BR.shipH + wrapAngle(BR.pose.h - BR.shipH) * Math.min(1, dt * 4);
  // 停在低頭一半的位置太久：自動看向戰術台或抬回來
  if (performance.now() - BR.lastIn > 350 && BR.tPitch < -0.45 && BR.tPitch > BR_CON + 0.01) BR.tPitch = BR.tPitch < -0.7 ? BR_CON : -0.32;
  const a = Math.min(1, dt * 9);
  BR.kYaw = wrapAngle(BR.kYaw); BR.tYaw = BR.mYaw + BR.kYaw;
  BR.yaw = wrapAngle(BR.yaw + wrapAngle(BR.tYaw - BR.yaw) * a); BR.pitch += (BR.tPitch - BR.pitch) * a;
  bridgeCamera(false);
  bridgeConsole();
  bridgeHud(dt);
}
function bridgeConsole() {
  const k = bridgeConsoleK();
  if (k > 0.01 && !TAC.open) openTac();
  if (k <= 0.01 && TAC.open) { BR.closing = true; closeTac(); BR.closing = false; }
  if (TAC.open && TAC.el) {
    TAC.el.style.transform = k >= 0.995 ? 'none' : `perspective(1400px) translateY(${((1 - k) * 75).toFixed(2)}%) rotateX(${((1 - k) * 38).toFixed(2)}deg)`;
    TAC.el.style.opacity = Math.min(1, k * 1.6).toFixed(3);
    TAC.el.classList.toggle('br-live', k > 0.9);   // 看到底才能操作（傾斜中點擊位置不準）
  }
  document.body.classList.toggle('br-console', k > 0.5);
}

// ── 艦橋介面：方位儀、懸浮視窗、操作列 ──
function buildBridge() {
  if (BR.el) return;
  const el = document.createElement('div'); el.id = 'bridge'; el.hidden = true;
  el.innerHTML = `<div class="br-vig"></div><div class="br-glass"></div><div class="br-flash"></div>
    <div class="br-rig" id="br-rig">
      <svg class="br-frame" id="br-frame" aria-hidden="true"></svg>
      <div class="br-canopy">
        <div class="br-force me"><span>我軍</span><b id="br-p0"></b><div class="br-bar me"><i id="br-b0"></i></div></div>
        <div class="br-title" id="br-title"></div>
        <div class="br-force en"><div class="br-bar en"><i id="br-b1"></i></div><b id="br-p1"></b><span>敵軍</span></div>
      </div>
      <div class="br-notch"><div class="br-compass" id="br-compass"><div class="br-ticks"></div><div class="br-marks"></div><div class="br-cur"></div></div></div>
      <div class="br-dash" id="br-dash">
        <div class="br-dp br-dl" id="br-dl"></div>
        <div class="br-dc" id="br-dc"></div>
        <div class="br-dp br-dr"><div class="br-clock"><b id="br-time"></b><span id="br-tl">剩餘時間</span></div>
          <div class="br-ctl"><button class="br-key" data-act="pause" id="br-pause"></button><button class="br-key" data-act="speed" id="br-speed"></button><button class="br-key" data-act="set" title="設定">設定</button>
            <button class="br-key" data-act="exit" id="br-exit"></button><button class="br-key warn" data-act="quit" id="br-quit"></button></div></div>
        <button class="br-tab" data-act="con" id="br-tab"><span id="br-tabt"></span><small id="br-tabk"></small></button>
      </div>
    </div>
    <div class="br-win" id="br-stat"><div class="br-wh"><b>戰況</b><span class="g-sp"></span><button class="br-pin" data-pin="stat" title="固定在畫面上">📌</button></div><div class="br-wb" id="br-stat-b"></div></div>
    <div class="br-win" id="br-pip"><div class="br-wh"><b>各艦隊旗艦</b><span class="br-sub">點一下切換艦橋</span><span class="g-sp"></span><button class="br-pin" data-pin="pip" title="固定在畫面上">📌</button></div><div class="br-wb" id="br-pip-b"></div></div>
    <div class="br-hint" id="br-hint"></div>`;
  document.body.appendChild(el);
  BR.el = el; BR.wStat = el.querySelector('#br-stat'); BR.wPip = el.querySelector('#br-pip');
  BR.ticks = el.querySelector('.br-ticks'); BR.marks = el.querySelector('.br-marks'); BR.rig = el.querySelector('#br-rig'); BR.frameWH = '';
  // 方位刻度：每 15°
  for (let d = -165; d <= 180; d += 15) {
    const t = document.createElement('i'); t.dataset.a = d;
    t.className = d % 45 ? 'm' : 'M';
    t.textContent = d === 0 ? '艦首' : d === 180 ? '艦尾' : d === -90 ? '左舷' : d === 90 ? '右舷' : d % 45 ? '' : Math.abs(d) + '';
    BR.ticks.appendChild(t);
  }
  // 按鈕：用 pointerdown，內容每 0.25 秒更新也點得到
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-act],[data-pin],[data-pf]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.act) {
      const A = b.dataset.act;
      if (A === 'con') bridgeToggleConsole();
      else if (A === 'exit') exitBridge();
      else if (A === 'pause') togglePause();
      else if (A === 'speed') setSpeed((speedIdx + 1) % SPEEDS.length);
      else if (A === 'set') openSettings();
      else if (A === 'quit') { const q = gEl('bh-quit'); if (q && q.onclick) q.onclick(); }
    } else if (b.dataset.pin) { SETTINGS.brPins[b.dataset.pin] = !SETTINGS.brPins[b.dataset.pin]; saveSettings(); }
    else if (b.dataset.pf) { const f = fleets[+b.dataset.pf]; if (f && fleetAlive(f).length) bridgeSwitch(f); }
  });
  el.addEventListener('wheel', (e) => { if (e.target.closest('.br-wb')) return; e.preventDefault(); bridgeWheel(Math.sign(e.deltaY) * 0.12); }, { passive: false });
}
// 艦橋框架（參考圖：天花板與燈條、大片觀景窗的窗框、前方的戰術桌、兩側的乘員席）
// 窗框、燈條固定在艦上：轉頭時會掃過畫面（照視角投影）；天花板、戰術桌邊緣固定在畫面上
const BR_POSTS = [-2.6, -1.9, -1.2, -0.5, 0.5, 1.2, 1.9, 2.6];   // 窗柱的方位（相對艦首，右正）
const BR_LAMPS = [-1.55, -0.85, -0.25, 0.25, 0.85, 1.55];                     // 天花板燈的方位
function bridgeFrameSVG() {
  const W = VW, H = VH, narrow = W < 760, cx = W / 2;
  const ceil = Math.round(Math.max(44, Math.min(84, H * 0.095))), nw = Math.min(560, Math.max(300, W * 0.42)), nd = 46, sl = 26;
  const dh = Math.round((narrow ? 96 : 116) * (SETTINGS.uiScale || 1.2)), tw = narrow ? 150 : 190, st = Math.min(150, W * 0.12);
  BR.notchW = nw; BR.frameWH = W + 'x' + H + 'x' + SETTINGS.uiScale;BR.ceil = ceil; BR.dh = dh; BR.lastDyn = '';
  const el = BR.el; el.style.setProperty('--pw', (narrow ? 12 : 26) + 'px'); el.style.setProperty('--dh', dh + 'px'); el.style.setProperty('--nw', nw + 'px'); el.style.setProperty('--ceil', ceil + 'px');
  const X = 60, Y = 260, P = (pts) => pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  // 天花板：中央凹進去放方位儀；下緣有一排通風格柵
  const ceilP = [[-X, -Y], [W + X, -Y], [W + X, ceil], [cx + nw / 2 + sl, ceil], [cx + nw / 2, ceil + nd], [cx - nw / 2, ceil + nd], [cx - nw / 2 - sl, ceil], [-X, ceil]];
  const ceilRim = [[-X, ceil], [cx - nw / 2 - sl, ceil], [cx - nw / 2, ceil + nd], [cx + nw / 2, ceil + nd], [cx + nw / 2 + sl, ceil], [W + X, ceil]];
  let ribs = ''; for (let x = 0; x < W; x += 46) if (Math.abs(x - cx) > nw / 2 + sl + 10) ribs += `<line x1="${x}" y1="${ceil * 0.35}" x2="${x + 18}" y2="${ceil - 3}" class="rib"/>`;
  // 戰術桌：前緣是一條橘色光帶；中央凸起的把手＝低頭看戰術台；兩端是乘員席（小螢幕亮著）
  const ty = H - dh;
  const table = [[-X, ty + 18], [st, ty + 18], [st + 26, ty], [cx - tw / 2 - 24, ty], [cx - tw / 2, ty - 8], [cx + tw / 2, ty - 8], [cx + tw / 2 + 24, ty], [W - st - 26, ty], [W - st, ty + 18], [W + X, ty + 18], [W + X, H + Y], [-X, H + Y]];
  const glow = [[st + 26, ty], [cx - tw / 2 - 24, ty], [cx - tw / 2, ty - 8], [cx + tw / 2, ty - 8], [cx + tw / 2 + 24, ty], [W - st - 26, ty]];
  const stn = (x0, s) => { const x1 = x0 + s * st; return `<polygon points="${P([[x0, H + Y], [x0, ty - 6], [x0 + s * st * 0.82, ty - 22], [x1, ty + 18], [x1, H + Y]])}" class="stn"/>
      <polygon points="${P([[x0 + s * 14, ty - 2], [x0 + s * st * 0.38, ty - 12], [x0 + s * st * 0.38, ty + 8], [x0 + s * 14, ty + 14]])}" class="scr b"/>
      <polygon points="${P([[x0 + s * st * 0.44, ty - 13], [x0 + s * st * 0.76, ty - 20], [x0 + s * st * 0.76, ty + 2], [x0 + s * st * 0.44, ty + 7]])}" class="scr o"/>`; };
  gEl('br-frame').innerHTML = `<defs>
      <linearGradient id="brCeil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080f"/><stop offset=".7" stop-color="#0d1626"/><stop offset="1" stop-color="#16233a"/></linearGradient>
      <linearGradient id="brTable" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2438"/><stop offset=".12" stop-color="#0c1322"/><stop offset="1" stop-color="#04070d"/></linearGradient>
      <linearGradient id="brPost" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#060a12"/><stop offset=".5" stop-color="#1a2539"/><stop offset="1" stop-color="#070b14"/></linearGradient>
      <filter id="brBloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>
    <g id="br-dyn"></g>
    <polygon points="${P(ceilP)}" fill="url(#brCeil)"/>${ribs}
    <polyline points="${P(ceilRim)}" class="rim"/><polyline points="${P(ceilRim.map(([x, y]) => [x, y - 4]))}" class="rim2"/>
    <g id="br-lamps"></g>
    <polygon points="${P(table)}" fill="url(#brTable)"/>
    <polyline points="${P(glow)}" class="tglow" filter="url(#brBloom)"/><polyline points="${P(glow)}" class="tedge"/>
    ${stn(-1, 1)}${stn(W + 1, -1)}`;
  gEl('br-frame').setAttribute('viewBox', `0 0 ${W} ${H}`); gEl('br-frame').setAttribute('width', W); gEl('br-frame').setAttribute('height', H);
}
// 每幀：窗柱、橫樑、天花板燈依目前視角投影（轉頭時掃過畫面）
function bridgeFrameDyn() {
  const W = VW, H = VH, key = BR.yaw.toFixed(4) + '|' + BR.frameWH; if (key === BR.lastDyn) return; BR.lastDyn = key;
  const f = (H / 2) / Math.tan(BR_FOV * Math.PI / 360), xOf = (r) => W / 2 + f * Math.tan(r);
  const top = BR.ceil - 2, bot = H - BR.dh + 4, tr = BR.ceil + Math.round((H - BR.ceil - BR.dh) * 0.2);
  let h = '';
  // 橫樑（上排小窗與下方大窗的分界）：只畫在窗柱之間（窗柱以外是側窗，一樣有）
  h += `<rect x="-60" y="${tr - 5}" width="${W + 120}" height="9" class="beam"/><line x1="-60" y1="${tr - 5}" x2="${W + 60}" y2="${tr - 5}" class="rim2"/>`;
  for (const pa of BR_POSTS) {
    const r = wrapAngle(pa - BR.yaw); if (Math.abs(r) > 1.25) continue;
    const x = xOf(r), c = Math.cos(r), wt = 16 + 10 * c, wb = 24 + 16 * c, lean = Math.sin(r) * 18;   // 越靠邊越斜、越窄
    if (x + wb < -40 || x - wb > W + 40) continue;
    h += `<polygon points="${(x - wt / 2 + lean).toFixed(1)},${top} ${(x + wt / 2 + lean).toFixed(1)},${top} ${(x + wb / 2).toFixed(1)},${bot} ${(x - wb / 2).toFixed(1)},${bot}" fill="url(#brPost)"/>
      <line x1="${(x + (r < 0 ? wt : -wt) / 2 + lean).toFixed(1)}" y1="${top}" x2="${(x + (r < 0 ? wb : -wb) / 2).toFixed(1)}" y2="${bot}" class="rim"/>`;
  }
  gEl('br-dyn').innerHTML = h;
  let l = '';
  for (const la of BR_LAMPS) {
    const r = wrapAngle(la - BR.yaw); if (Math.abs(r) > 1.2) continue;
    const x = xOf(r), w = 46 * Math.cos(r), red = Math.abs(la) > 1;   // 外側紅燈、內側藍燈（參考圖）
    l += `<rect x="${(x - w / 2).toFixed(1)}" y="${(BR.ceil * 0.42).toFixed(1)}" width="${w.toFixed(1)}" height="7" rx="1" class="lamp ${red ? 'r' : 'b'}" filter="url(#brBloom)"/><rect x="${(x - w / 2).toFixed(1)}" y="${(BR.ceil * 0.42).toFixed(1)}" width="${w.toFixed(1)}" height="7" rx="1" class="lamp ${red ? 'r' : 'b'}"/>`;
  }
  gEl('br-lamps').innerHTML = l;
}
const _brTW = (t) => { let w = 14; for (const ch of t) w += ch.charCodeAt(0) > 255 ? 11 : 6.2; return w; };   // 標記文字的大約寬度
const _brMin = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function bridgeBearing(x, z) {   // 相對艦首的方位（右正）與距離
  const c = camPersp.position; return [wrapAngle(BR.shipH - Math.atan2(x - c.x, z - c.z)), Math.hypot(x - c.x, z - c.z)];   // 右正，與轉頭方向一致
}
function bridgeHud(dt) {
  const el = BR.el; if (!el) return;
  const k = bridgeConsoleK();
  // 懸浮視窗：往左看滑出「戰況」、往右看滑出「各艦隊旗艦」（游標剛好在那一側，可以直接點）；📌＝一直顯示
  // 游標停在視窗上時不轉頭，所以視窗不會跑掉
  for (const key of ['stat', 'pip']) {
    const w = key === 'stat' ? BR.wStat : BR.wPip, pinned = !!SETTINGS.brPins[key], s = key === 'stat' ? -1 : 1, y = BR.tYaw * s;
    if (y > BR_WIN_OPEN) BR.open[key] = true; else if (y < BR_WIN_CLOSE) BR.open[key] = false;
    w.classList.toggle('open', k < 0.6 && (pinned || BR.open[key]));
  }
  // 艦橋框架：視窗尺寸變了就重畫；轉頭／低頭時整個框架稍微反向移動（頭在動、艦橋不動）
  if (BR.frameWH !== VW + 'x' + VH + 'x' + SETTINGS.uiScale) bridgeFrameSVG();
  bridgeFrameDyn();
  const px = -Math.max(-1, Math.min(1, BR.yaw)) * 16, py = Math.min(40, (BR.pitch - BR_FWD) * 170);
  BR.rig.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
  BR.rig.style.setProperty('--dash-op', Math.max(0, 1 - k * 2.2).toFixed(3));
  // 方位儀（在上方框架的凹口裡）
  const cw = BR.notchW - 36, span = 1.25, pxA = (cw / 2) / span;
  const cmp = el.querySelector('#br-compass'); cmp.style.width = cw + 'px'; cmp.hidden = !uiOn('compass');
  for (const t of BR.ticks.children) {
    const rel = wrapAngle(+t.dataset.a * Math.PI / 180 - BR.yaw);
    if (Math.abs(rel) > span) { t.style.display = 'none'; continue; }
    t.style.display = ''; t.style.transform = `translateX(${(cw / 2 + rel * pxA).toFixed(1)}px)`;
  }
  BR.acc += dt;
  if (BR.acc >= 0.25) { BR.acc = 0; bridgeHudSlow(cw, span, pxA); }
}
function bridgeHudSlow(cw, span, pxA) {
  const el = BR.el, t = U.uTime.value, fl = BR.fleet;
  const proxy = BR.ship >= 0 && BR.fleet.sqs.every((q) => q.flagship !== BR.ship);
  gEl('br-title').textContent = `${fl.name}旗艦艦橋${proxy ? '（代理旗艦）' : ''}`;
  gEl('br-tabt').textContent = bridgeConsoleK() > 0.5 ? '▲ 抬頭' : '▼ 戰術台';
  gEl('br-tabk').textContent = keyText('tactical');
  gEl('br-exit').textContent = `離開艦橋 ${keyText('bridge')}`;
  gEl('br-pause').textContent = paused ? '▶ 繼續' : '❚❚ 暫停'; gEl('br-pause').classList.toggle('lit', paused);
  gEl('br-speed').textContent = cmdSlowOn ? `×${effSpeed()} 下令中` : '×' + SPEEDS[speedIdx];
  gEl('br-quit').textContent = GAME.replaying ? '結束回放' : '撤退';
  gEl('br-time').textContent = timeLeftText(t); gEl('br-tl').textContent = GAME.replaying ? '回放中' : paused ? '暫停中' : battleSetup.timeLimit >= SIM_INF ? '模擬室' : '剩餘時間';
  gEl('br-hint').textContent = bridgeConsoleK() > 0.5 ? '' : `滑鼠左右移動＝轉頭（左：戰況　右：各艦隊旗艦）　下令：滑鼠移到最下方／滾輪往下／${keyText('tactical')} 低頭看戰術台`;
  BR.el.querySelectorAll('.br-pin').forEach((b) => b.classList.toggle('on', !!SETTINGS.brPins[b.dataset.pin]));
  // 方位儀標記：各艦隊、懸浮視窗
  const marks = [];
  for (const f2 of fleets) {
    if (f2.reserve) continue;
    let fogE = f2.side !== GAME.playerSide && pFiltered();   // 雷達受干擾：敵方方位停在最後已知位置、不顯示距離；戰爭迷霧：只標看得到的（其他＝最後已知）
    let al = fogE ? f2.sqs.map((q) => pSeen(q)).filter((q) => q && !q.bg && q.alive > 0) : fleetAlive(f2); if (!al.length) continue;
    if (fogE && fowView() && al.some((q) => !q.stale)) { al = al.filter((q) => !q.stale); fogE = false; }
    const C = centerOf(al), [a, d] = bridgeBearing(C.x, C.z);
    marks.push({ a, cls: f2.side === GAME.playerSide ? (f2 === fl ? 'me' : 'al') : 'en', txt: f2 === fl ? '' : fogE ? `${f2.name} ？` : `${f2.name} ${Math.round(d)}` });
  }
  // 戰爭迷霧：被敵方掃描到的方向（不知道距離）
  if (fowView()) for (const p of FOW.pings[GAME.playerSide]) {
    const f2 = fleets.find((o) => o.id === p.fleet), al = f2 ? fleetAlive(f2) : []; if (!al.length) continue;
    const C = centerOf(al), [a] = bridgeBearing(C.x + Math.sin(p.a) * 2000, C.z + Math.cos(p.a) * 2000);
    marks.push({ a, cls: 'en', txt: '⚠ 掃描訊號' });
  }
  marks.push({ a: BR_PANEL_YAW.stat, cls: 'pn', txt: '▣ 戰況' }, { a: BR_PANEL_YAW.pip, cls: 'pn', txt: '▣ 各艦隊旗艦' });
  // 太靠近的標記錯開成兩排；超出範圍的貼在兩端（加箭頭）
  const ms = [];
  for (const m of marks) {
    if (m.cls === 'me') continue;
    let rel = wrapAngle(m.a - BR.yaw), edge = '';
    if (rel > span * 0.86) { rel = span * 0.86; edge = '▶'; } else if (rel < -span * 0.86) { rel = -span * 0.86; edge = '◀'; }
    ms.push({ ...m, x: cw / 2 + rel * pxA, edge, w: _brTW(m.txt) });
  }
  // 貼在同一端的合併成一個
  for (const e of ['◀', '▶']) { const g = ms.filter((m) => m.edge === e); if (g.length > 1) { const t = g.map((m) => m.txt).join('・'); for (const m of g.slice(1)) ms.splice(ms.indexOf(m), 1); Object.assign(g[0], { txt: t, cls: g.some((m) => m.cls === 'en') ? 'en' : g[0].cls, w: _brTW(t), x: e === '◀' ? Math.max(g[0].x, _brTW(t) / 2 + 4) : Math.min(g[0].x, cw - _brTW(t) / 2 - 4) }); } }
  // 依重要性放：敵軍 → 友軍 → 視窗位置；兩排都放不下就不顯示（不重疊）
  const pri = { en: 0, al: 1, pn: 2 }; ms.sort((p, q) => pri[p.cls] - pri[q.cls] || Math.abs(p.x - cw / 2) - Math.abs(q.x - cw / 2));
  const rows = [[], []]; let mh = '';
  for (const m of ms) {
    const a0 = m.x - m.w / 2 - 3, a1 = m.x + m.w / 2 + 3;
    const r = rows.findIndex((row) => row.every(([b0, b1]) => a1 < b0 || a0 > b1)); if (r < 0) continue;
    rows[r].push([a0, a1]);
    mh += `<span class="mk ${m.cls} ${r ? 'r1' : ''}" style="left:${m.x.toFixed(1)}px">${m.edge === '◀' ? '◀ ' : ''}${m.txt}${m.edge === '▶' ? ' ▶' : ''}</span>`;
  }
  BR.marks.innerHTML = mh;
  // 戰況視窗
  const a0 = sideAlive(GAME.playerSide), a1 = sideAlive(1 - GAME.playerSide), p0 = a0 / Math.max(1, GAME.init[GAME.playerSide]), p1 = a1 / Math.max(1, GAME.init[1 - GAME.playerSide]);
  const fog = playerFogged(), fv = fowView();   // 雷達受干擾：敵方兵力、狀態、距離不明；戰爭迷霧：敵方兵力是估計值、看不到的艦隊位置不明
  const p1e = fv ? fowEstAlive(1 - GAME.playerSide) / Math.max(1, GAME.init[1 - GAME.playerSide]) : p1;
  const al = fleetAlive(fl), n = sumA(al.map((q) => q.alive)), g = al[0] && al[0].group, st = fleetStatus(fl);
  const fs = fl.sqs.find((q) => q.flagship >= 0), isOrig = fs && BR.ship === fs.flagship;
  const fhp = BR.ship >= 0 ? ships.hp[BR.ship] / (SHIP_TYPES[ships.type[BR.ship]].hp * (isOrig ? 3 : 1)) : 0;
  const tg = g && g.target && g.target.alive > 0 ? `${g.target.fleet ? g.target.fleet.name + ' ' : ''}${g.target.name}` : '自動選擇';
  const bar = (v, c) => `<div class="br-bar ${c}"><i style="width:${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%"></i></div>`;
  const row = (f2) => { if (fog && f2.side !== GAME.playerSide) return `<div class="br-fr"><span class="g-ec">${f2.name}</span><span class="g-dim">？？？ 雷達受干擾</span></div>`;
    if (fv && f2.side !== GAME.playerSide) {
      const vs = f2.sqs.map((q) => pSeen(q, Infinity)).filter((q) => q && !q.bg && q.alive > 0), live = vs.filter((q) => !q.stale);
      if (!live.length) return `<div class="br-fr"><span class="g-ec">${f2.name}</span><span class="g-dim">${vs.length ? `最後已知・${Math.round(t - Math.max(...vs.map((q) => q.t || 0)))} 秒前` : '位置不明'}</span></div>`;
      const C = centerOf(live), d = bridgeBearing(C.x, C.z)[1];
      return `<div class="br-fr"><span class="g-ec">${f2.name}</span><span class="g-dim">看得到 ${ships5(sumA(live.map((q) => q.alive)))} 艘</span><span class="tac-st fight">偵測中</span><span class="g-sp"></span><span class="g-dim">距 ${Math.round(d)}</span></div>`;
    }
    const a2 = fleetAlive(f2), n2 = sumA(a2.map((q) => q.alive)), s2 = fleetStatus(f2), C = a2.length ? centerOf(a2) : null, d = C ? bridgeBearing(C.x, C.z)[1] : 0;
    return `<div class="br-fr"><span class="${f2.side === GAME.playerSide ? 'g-pc' : 'g-ec'}">${f2.name}</span><span class="g-dim">${Math.round(n2 / f2.initial * 100)}%</span><span class="tac-st ${s2[1]}">${s2[0]}</span><span class="g-sp"></span><span class="g-dim">${C && f2 !== fl ? '距 ' + Math.round(d) : ''}</span></div>`; };
  const skills = Object.keys(fl.skills).map((id) => { const s = fl.skills[id], cd = Math.max(0, s.ready - t);
    const txt = t < s.until ? `生效 ${Math.ceil(s.until - t)}s` : s.left <= 0 ? '用完' : cd > 0 ? `${Math.ceil(cd)}s` : `×${s.left}`;
    return `<span class="br-skc ${t < s.until ? 'on' : cd > 0 || s.left <= 0 ? 'off' : ''}" title="${SKILLS[id].desc}">${SKILLS[id].name} <small>${txt}</small></span>`; }).join('');   // 只顯示；施放要在戰術台
  const others = fleets.filter((f2) => !f2.reserve && f2 !== fl && fleetAlive(f2).length);
  const log = (GAME.log || []).slice(-5).reverse().map((L) => `<div class="br-log ${L.cls}"><span class="g-dim">${_brMin(L.t)}</span> ${L.msg}</div>`).join('');
  gEl('br-stat-b').innerHTML = `<div class="g-row"><span class="g-dim">${battleSetup.timeLimit >= SIM_INF ? '' : '剩餘'}</span><b>${timeLeftText(t)}</b><span class="g-sp"></span><span class="g-dim">${paused ? '暫停中' : '×' + SPEEDS[speedIdx]}</span></div>
    <div class="br-fr"><span class="g-pc">我軍 ${Math.round(p0 * 100)}%</span><span class="g-sp"></span><span class="g-ec">敵軍 ${fog ? '？？？' : (fv ? '估計 ' : '') + Math.round(p1e * 100) + '%'}</span></div>
    <div class="br-vs">${bar(p0, 'me')}${fog ? '' : bar(p1e, 'en')}</div>
    ${fv ? `<div class="br-fr g-dim">自動掃描 ${FOW.auto[GAME.playerSide] ? (fowScanLeft(GAME.playerSide) > 0 ? `冷卻 ${Math.ceil(fowScanLeft(GAME.playerSide))} 秒` : '待命') : '關'}・區域掃描 ${fowHasCarrier(fl) ? (fowReconLeft(fl) > 0 ? `冷卻 ${Math.ceil(fowReconLeft(fl))} 秒` : `可用（戰術台 ${keyText('scan')}）`) : '本艦隊沒有航母'}${jammed(GAME.playerSide) ? '・通訊受干擾，不能共享情報' : ''}</div>` : ''}
    <div class="br-h">本艦隊・${fl.name}</div>
    <div class="br-fr"><span>旗艦 ${SHIP_TYPES[ships.type[BR.ship]] ? SHIP_TYPES[ships.type[BR.ship]].name : ''}${isOrig ? '' : '（代理）'}</span><span class="g-sp"></span><span class="g-dim">耐久 ${Math.round(fhp * 100)}%</span></div>${bar(fhp, fhp < 0.35 ? 'bad' : 'me')}
    <div class="br-fr"><span>兵力 ${ships5(n)} 艘（${Math.round(n / fl.initial * 100)}%）</span><span class="g-sp"></span><span>${g ? FORMATIONS[g.formation].name : ''}</span><span class="tac-st ${st[1]}">${st[0]}</span></div>
    <div class="br-fr g-dim">攻擊目標：${tg}</div>
    ${skills ? `<div class="br-sk">${skills}</div>` : ''}
    ${others.length ? `<div class="br-h">各艦隊</div>${others.map(row).join('')}` : ''}
    ${log ? `<div class="br-h">通訊紀錄</div>${log}` : ''}`;
  // 頂棚：雙方兵力
  gEl('br-p0').textContent = Math.round(p0 * 100) + '%'; gEl('br-b0').style.width = (p0 * 100).toFixed(1) + '%';
  gEl('br-p1').textContent = fog ? '？？？' : (fv ? '≈' : '') + Math.round(p1e * 100) + '%'; if (!fog) gEl('br-b1').style.width = (p1e * 100).toFixed(1) + '%';
  // 控制台左：本艦隊
  const meter = (lb, v, txt, c) => `<div class="br-meter ${c || ''}"><span>${lb}</span><div class="br-bar"><i style="width:${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%"></i></div><b>${Math.round(v * 100)}%</b><em>${txt}</em></div>`;
  gEl('br-dl').innerHTML = `<div class="br-dlh"><b>${fl.name}</b><span>${fl.commander ? fl.commander.name + ' ' + (fl.commander.title || '') + ' Lv ' + fl.commander.level : ''}</span></div>
    ${meter('兵力', n / fl.initial, ships5(n) + ' 艘')}${meter('旗艦', fhp, (SHIP_TYPES[ships.type[BR.ship]] || {}).name + (isOrig ? '' : '（代理）'), fhp < 0.35 ? 'bad' : '')}
    <div class="br-cells"><span><i>陣型</i>${g ? FORMATIONS[g.formation].name + (g.orderly ? '（整齊）' : '') : '-'}</span><span><i>狀態</i><em class="tac-st ${st[1]}">${st[0]}</em></span><span><i>目標</i>${tg}</span></div>`;
  // 控制台中：航向、目前命令、隊列
  const hdg = Math.round((((180 - BR.shipH * 180 / Math.PI) % 360) + 360) % 360), look = Math.round(BR.yaw * 180 / Math.PI);
  const cur = g && g.cur ? (g.cur.type === 'form' ? '變陣中' : '移動中') : g && g.plan ? '移動中' : '待命', qn = g && g.queue ? g.queue.length : 0;
  gEl('br-dc').innerHTML = `<div class="br-hdg"><span>航向</span><b>${String(hdg).padStart(3, '0')}°</b></div>
    <div class="br-ord"><span class="${cur === '待命' ? '' : 'go'}">${cur === '待命' ? '待命' : '▶ ' + cur}</span>${qn ? `<span>隊列 ${qn}</span>` : ''}<span class="dim">視線 ${look > 0 ? '右' : look < 0 ? '左' : ''}${Math.abs(look)}°</span></div>`;
  // 各艦隊旗艦子畫面
  const mates = bridgeFleets().filter((f2) => f2 !== fl);
  const sig = mates.map((f2) => f2.id).join(',');
  const pb = gEl('br-pip-b');
  if (BR.pipSig !== sig || !pb.firstChild) {
    BR.pipSig = sig;
    pb.innerHTML = mates.length ? mates.map((f2) => `<div class="br-pipc" data-pf="${f2.id}"><div class="br-pipv"></div><div class="br-pipcap"></div></div>`).join('')
      : '<div class="g-dim" style="padding:10px 4px">目前沒有其他友軍艦隊。</div>';
  }
  pb.querySelectorAll('.br-pipc').forEach((c) => {
    const f2 = fleets[+c.dataset.pf], a2 = fleetAlive(f2), n2 = sumA(a2.map((q) => q.alive)), s2 = fleetStatus(f2);
    const h = `<b class="g-pc">${f2.name}</b> <span class="g-dim">${f2.commander ? f2.commander.name : ''}</span><span class="g-sp"></span><span>${Math.round(n2 / f2.initial * 100)}%</span> <span class="tac-st ${s2[1]}">${s2[0]}</span>`;
    const cap = c.querySelector('.br-pipcap'); if (cap.dataset.h !== h) { cap.dataset.h = h; cap.innerHTML = h; }
  });
}

// ── 子畫面：其他艦隊旗艦看到的畫面 ──
// 每幀只重畫一個（輪流），畫進各自的貼圖；每幀把所有貼圖貼到視窗的位置
const BLIT = (() => {
  const s = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }));
  mesh.frustumCulled = false; s.add(mesh); return { s, cam, mesh };
})();
function bridgePips() {
  if (!BR.on || !R3.ready || !BR.wPip || !BR.wPip.classList.contains('open') || bridgeConsoleK() > 0.6) return;
  const cr = canvas.getBoundingClientRect(), slots = [];
  for (const v of BR.wPip.querySelectorAll('.br-pipv')) {
    const r = v.getBoundingClientRect(), f = fleets[+v.parentElement.dataset.pf];
    if (!f || !fleetAlive(f).length || r.width < 16 || r.height < 9) continue;
    const x = r.left - cr.left, y = r.top - cr.top;
    if (x + r.width < 0 || y + r.height < 0 || x > VW || y > VH) continue;
    slots.push({ f, x, y, w: r.width, h: r.height });
  }
  if (!slots.length) return;
  renderPip(slots[BR.pipRR++ % slots.length]);
  renderer.autoClear = false; renderer.setScissorTest(true);
  for (const s of slots) {
    const P = BR.pips[s.f.id]; if (!P || !P.rt) continue;
    const yb = VH - (s.y + s.h);
    renderer.setViewport(s.x, yb, s.w, s.h); renderer.setScissor(s.x, yb, s.w, s.h);
    if (BLIT.mesh.material.map !== P.rt.texture) { const first = !BLIT.mesh.material.map; BLIT.mesh.material.map = P.rt.texture; if (first) BLIT.mesh.material.needsUpdate = true; }
    renderer.render(BLIT.s, BLIT.cam);
  }
  renderer.setScissorTest(false); renderer.setViewport(0, 0, VW, VH); renderer.autoClear = true;
}
function renderPip(s) {
  const P = BR.pips[s.f.id] || (BR.pips[s.f.id] = { cam: new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 7000), rt: null, h: null, pose: {} });
  const pr = renderer.getPixelRatio(), w = Math.max(16, Math.min(640, Math.round(s.w * pr))), h = Math.max(9, Math.min(360, Math.round(s.h * pr)));
  if (!P.rt || P.rt.width !== w || P.rt.height !== h) { if (P.rt) P.rt.dispose(); P.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 2 }); }
  const i = bridgeShip(s.f); if (i < 0) return;
  bridgePose(i, P.pose);
  P.h = P.h == null ? P.pose.h : P.h + wrapAngle(P.pose.h - P.h) * 0.35;
  P.cam.aspect = s.w / s.h; P.cam.fov = 50; P.cam.updateProjectionMatrix();
  placeBridgeCam(P.cam, P.pose, P.h, 0, BR_FWD);
  update3D(P.cam, s.h);
  const sky = R3.sky; if (sky) sky.position.copy(P.cam.position);
  renderer.setRenderTarget(P.rt); renderer.clear(); renderer.render(scene, P.cam); renderer.setRenderTarget(null);
  if (sky) sky.position.copy(camera.position);
}

// 看著戰術台時，在地圖或上方工具列往上捲＝抬頭
addEventListener('wheel', (e) => { if (BR.on && TAC.open && e.deltaY < 0 && e.target.closest && e.target.closest('#tac-map, .tac-top')) bridgeWheel(-0.12); }, { passive: true });
