// ═══════════════════════ 艦長：太空戰場 ═══════════════════════
// 沒有地面：GRD＝null，敵方設施放在 CAP.G.gts（和地面單位同一套：受擊、偵測、開火、儀表）。
// 場景：小行星帶（巨大小行星擋雷達與射線、小行星區減速但雷達難發現你）、黑洞邊緣（重力井會把船吸過去）。
// 戰區邊界：外圍是高能粒子帶（看得到的光牆），靠近會警告，進去船體持續受損；黑洞的事件視界附近同樣。
// 任務：攔截（擊沉橫越戰區的運輸船隊）、突破封鎖（穿過巡邏線到另一側的躍遷點），另外斬首、全滅也能在太空打。
const CAP_SPACE = {
  belt: { name: '小行星帶', en: 'ASTEROID BELT', desc: '巨大的小行星可以擋住雷達與射線；小行星區裡速度變慢，但敵方雷達很難發現你。外圍是高能粒子帶。' },
  hole: { name: '黑洞邊緣', en: 'EVENT HORIZON', desc: '戰區一側是黑洞：靠近會被重力井拉過去，越過事件視界附近船體會被撕裂。殘骸與小行星比較少，不好躲。' },
  deep: { name: '深空・恆星', en: 'DEEP SPACE', desc: '開闊的深空，掩護很少；戰區一側是恆星：太靠近會被高溫灼傷。外圍是高能粒子帶。' },
  orbit: { name: '行星軌道', en: 'PLANET ORBIT', desc: '戰區一側是行星：重力把船往下拉，進入大氣層會摩擦燃燒；行星本身擋得住射線。外圍是高能粒子帶。' },
  nebula: { name: '星雲', en: 'NEBULA', desc: '到處是星雲：躲在裡面敵方雷達很難發現你。戰區外圍是離子風暴。' },
  station: { name: '太空站周邊', en: 'STATION', desc: '巨大的太空站與殘骸區：太空站和殘骸擋得住射線，殘骸區裡雷達難發現你。外圍是高能粒子帶。' },
};
// 場景的危險天體（sp.hole，kind 分種類）：r＝核心（黑洞事件視界、恆星本體、行星本體）、pull＝重力範圍、acc＝最大拉力、hurt＝開始受損的距離
function capWell(key, R) {
  const sd = R() < 0.5 ? -1 : 1, z = -150 + R() * 300;
  if (key === 'hole') return { kind: 'hole', x: sd * 1080, y: 0, z, ...CAP_EDGE.hole };
  if (key === 'deep') return { kind: 'star', x: sd * 1180, y: 0, z, r: 80, pull: 0, acc: 0, hurt: 340 };
  if (key === 'orbit') return { kind: 'planet', x: sd * 1560, y: -120, z, r: 470, pull: 860, acc: 4, hurt: 560 };
  return null;
}
// 每個場景的地形數量：巨大岩塊、小行星區、星雲
const CAP_SCENE_T = { belt: [8, 4, 0.5, 0], hole: [4, 2, 0.5, 0], deep: [2, 1, 0.3, 0], orbit: [3, 2, 0, 0], nebula: [4, 1, 0, 5], station: [3, 3, 0.3, 0] };
const CAP_SPACE_KEYS = Object.keys(CAP_SPACE);
// R＝戰區水平半徑、Ry＝上下半徑（橢球）；warn＝開始警告的比例；dmg＝在粒子帶裡每秒受到最大耐久的幾成（越深越痛）；hard＝最多能進去多深
// hole：r 事件視界、pull 重力範圍、acc 最大拉力（每秒把船拖過去幾單位）、hurt 開始受損的距離
const CAP_EDGE = { R: 1350, Ry: 420, warn: 0.92, dmg: [0.03, 0.12], hard: 1.1, hole: { r: 110, pull: 650, acc: 10, hurt: 300 } };
Object.assign(CAP_UNIT, {
  plat: { kind: 'site', sub: 'plat', name: '防禦平台', hp: 520, r: 2.6, hh: 0, sensor: 260, sh: 0, radar: true, intel: true, merit: 80, space: true,
    msl: { range: 280, n: 3, cd: 18, dmg: 30 }, gun: { range: 150, cd: 0.6, dmg: 2, acc: 0.45, ship: 2.2 } },
  buoy: { kind: 'bldg', sub: 'buoy', name: '偵測浮標', hp: 80, r: 1, hh: 0, sensor: 380, sh: 0, radar: true, merit: 25, space: true, seeR: 260 },
  relay: { kind: 'bldg', sub: 'relay', name: '通訊中繼站', hp: 240, r: 1.8, hh: 0, sensor: 0, intel: true, merit: 50, space: true, comm: true },
  mine: { kind: 'mine', sub: 'mine', name: '水雷', hp: 25, r: 0.9, hh: 0, sensor: 0, merit: 5, space: true, seeR: 85, mine: { r: 12, blast: 22, dmg: 70 } },
  hangar: { kind: 'bldg', sub: 'hangar', name: '艦載機平台', hp: 480, r: 3, hh: 0, sensor: 170, sh: 0, radar: true, intel: true, merit: 80, space: true, air: true },
});
CAP_UNIT.comm.comm = true; CAP_UNIT.airbase.air = true;
Object.assign(CAP_MIS, {
  intercept: { name: '攔截', at: 's', text: (M) => `擊沉運輸船隊的 ${M.goal} 艘運輸艦（共 ${M.n} 艘；逃出戰區 ${M.n - M.goal + 1} 艘就失敗）` },
  run: { name: '突破封鎖', at: 's', text: () => '穿過封鎖線，抵達另一側的躍遷點（綠色標記）。不一定要開火，被發現的話巡邏艦會圍過來' },
});
CAP_MIS.sabotage.at = 'g'; CAP_MIS.decap.at = 'gs'; CAP_MIS.wipe.at = 'gs';

// ───── 戰場生成 ─────
function capLayoutSpace(p, key, misType) {
  const seed = p.seed, R = mulberry32(campHash(seed, 47)), li = p.diff, Df = CAP_DIFF[li];
  const pick = (a) => a[Math.floor(R() * a.length)];
  const N = (a) => Math.max(0, Math.round(a[li] * (0.85 + R() * 0.3)));
  const hole = capWell(key, R), TT = CAP_SCENE_T[key] || CAP_SCENE_T.belt;
  const terrain = [], used = [];
  const inZone = (x, z, m = 120) => Math.hypot(x, z) < CAP_EDGE.R - m && (!hole || Math.hypot(x - hole.x, z - hole.z) > Math.max(hole.pull * 0.7, hole.hurt * 1.1));
  const free = (x, z, gap) => inZone(x, z) && terrain.every((t) => t.type !== 'rock' || Math.hypot(t.x - x, t.z - z) > t.r + 25) && used.every((u) => Math.hypot(u.x - x, u.z - z) > Math.max(gap, u.ex || 0));
  const spot = (gen, gap) => { for (let k = 0; k < 300; k++) { const c = gen(); if (free(c.x, c.z, gap)) { used.push({ x: c.x, z: c.z }); return c; } } return null; };
  const area = (z0, z1, w = 1700) => () => ({ x: (R() - 0.5) * w, z: z0 + R() * (z1 - z0) });
  const near = (c, r0, r1) => () => { const a = R() * TAU, r = r0 + R() * (r1 - r0); return { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r }; };
  const alt = (k = 1) => Math.round((R() - 0.5) * 160 * k);
  // 出發點（攔截：撤離點；突破封鎖：入口）
  const S = { x: (R() - 0.5) * 500, z: 980 };
  used.push({ x: S.x, z: S.z, ex: 360 });
  // 地形：太空站（實體，換成太空站模型）、巨大小行星（實體，最多 8 顆）、小行星區（太空站周邊＝殘骸區）、星雲
  if (key === 'station') { const c = { x: (R() - 0.5) * 500, z: -250 + R() * 300 }; terrain.push({ type: 'rock', x: Math.round(c.x), y: 0, z: Math.round(c.z), r: 110, st: 1 }); }
  const nRock = TT[0];
  for (let k = 0; k < nRock; k++) {
    const r = key === 'belt' ? 45 + R() * 45 : 30 + R() * 30;
    for (let n = 0; n < 60; n++) {
      const x = (R() - 0.5) * 1900, z = -950 + R() * 1700;
      if (!inZone(x, z, r + 80) || Math.hypot(x - S.x, z - S.z) < 330 || terrain.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r + 70)) continue;
      terrain.push({ type: 'rock', x: Math.round(x), y: alt(0.6), z: Math.round(z), r: Math.round(r) }); break;
    }
  }
  const rocks = terrain.filter((t) => t.type === 'rock');
  for (let k = 0, n = TT[1]; k < n; k++) { const c = rocks[k] ||{ x: (R() - 0.5) * 1400, y: 0, z: (R() - 0.5) * 1400 }; terrain.push({ type: 'asteroid', x: c.x + Math.round((R() - 0.5) * 80), y: c.y || 0, z: c.z + Math.round((R() - 0.5) * 80), r: Math.round(170 + R() * 110) }); }
  if (R() < TT[2]) { const c = area(-700, 300, 1300)(); terrain.push({ type: 'nebula', x: Math.round(c.x), y: 0, z: Math.round(c.z), r: Math.round(200 + R() * 80) }); }
  for (let k = 0; k < TT[3]; k++) { for (let n = 0; n < 40; n++) { const x = (R() - 0.5) * 2000, z = -1000 + R() * 1900; if (!inZone(x, z, 100) || terrain.some((t) => t.type === 'nebula' && Math.hypot(t.x - x, t.z - z) < t.r + 120)) continue; terrain.push({ type: 'nebula', x: Math.round(x), y: alt(0.4), z: Math.round(z), r: Math.round(170 + R() * 130) }); break; } }
  // 敵方據點（通訊中繼站在這裡）
  const B = spot(area(-850, -450, 1200), 100) || { x: 0, z: -650 };
  const units = [];
  const add = (type, pt, extra = {}) => { if (pt) units.push({ type, x: Math.round(pt.x * 10) / 10, y: pt.y != null ? pt.y : alt(0.5), z: Math.round(pt.z * 10) / 10, hd: R() * TAU, ...extra }); return pt; };
  if (misType === 'capture') return capLayoutCapture(p, key, { R, li, S, B, terrain, units, add, spot, near, area, alt, hole });   // 佔領戰（capsquad.js）
  add('relay', spot(near(B, 60, 180), 60));
  add('hangar', spot(near(B, 120, 300), 120), { air: 0 });
  // 偵測浮標：散在中間；防禦平台：據點附近、路線上
  for (let k = 0, n = N([3, 4, 5, 6, 7]); k < n; k++) add('buoy', spot(area(-500, 450), 200));
  for (let k = 0, n = N([1, 1, 2, 2, 3]); k < n; k++) add('plat', spot(k % 2 ? near(B, 150, 380) : area(-600, 250, 1300), 220));
  // 艦隊
  const cmdr = { base: null, name: '', title: '', trait: 'shield', level: 1, mode: 'lv', tal: {}, skills: [] };
  const fleet = (o) => ({ cmdr, noCmdr: true, hangar: HANGAR_DEFAULT.slice(), formation: 'line', orderly: false, layers: 1, ai: null, reserve: false, at: 1e9, cap: true, ...o });
  const comp1 = (t, n = 1) => { const c = new Array(SHIP_TYPES.length).fill(0); c[t] = n; return c; };
  const fleets = [], hulls = p.slots.filter(Boolean), nShips = hulls.length;
  hulls.forEach((k2, k) => {
    const H = CAP_HULLS[k2], off = k - (hulls.length - 1) / 2;
    fleets.push(fleet({ side: 0, name: `${'一二三四五'[k]}號艦・${H.name}`, capRole: 'player', comp: comp1(H.look), x: S.x + off * 16, z: S.z + Math.abs(off) * 8, y: 0, h: Math.PI }));
  });
  const shipT = () => (li >= 2 && R() < 0.3 ? 2 : R() < 0.5 ? 3 : 4);
  const mis = { type: misType, li, goal: 1, names: '' };
  let ext = { x: S.x, z: S.z };
  // 巡邏艦：總數不超過我方（高難度最多多一艘）
  let nEn = Math.min(nShips + (li >= 3 ? 1 : 0), Math.max(li >= 1 ? 1 : 0, Math.round(nShips * (0.3 + 0.15 * li) + R() * 0.8)));
  if (misType === 'intercept') {
    // 運輸船隊：從戰區一側橫越到另一側；護航跟著船隊
    const dir0 = R() < 0.5 ? 1 : -1, nC = [2, 2, 3, 3, 4][li], dir = hole ? Math.sign(hole.x) : dir0, z0 = -250 + R() * 300, y0 = alt(0.4);
    let wp = [-0.55, -0.15, 0.25, 0.62, 1.2].map((f) => [Math.round(dir * f * 1150), Math.round(z0 + (R() - 0.5) * 360)]);
    // 有危險天體：船隊從另一側出發，在危險區前轉向，從戰區上方（遠端）離開
    if (hole) { const lim = Math.min(800, Math.abs(hole.x) - hole.hurt - 80); wp = wp.map(([x, z], k) => (k === wp.length - 1 ? [Math.round(dir * Math.min(lim, 600)), -1180] : [Math.round(Math.sign(x) * Math.min(Math.abs(x), lim)), z])); }
    const x0 = -dir * 1150;
    fleets.push(fleet({ side: 1, name: '運輸船隊', capRole: 'convoy', comp: comp1(5, nC), x: x0, z: z0, y: y0, h: Math.atan2(dir, 0), wp, formation: 'column' }));
    const ce = new Array(SHIP_TYPES.length).fill(0); for (let k = 0, n = Math.max(1, Math.min(3, Math.ceil(nEn * 0.6))); k < n; k++) ce[shipT()]++;
    fleets.push(fleet({ side: 1, name: '船隊護航', capRole: 'escort', comp: ce, x: x0 - dir * 40, z: z0 + 40, y: y0 + 8, h: Math.atan2(dir, 0) }));
    nEn = Math.max(0, nEn - Math.ceil(nEn * 0.6));
    mis.n = nC; mis.goal = li === 0 ? nC - 1 : nC;
  } else if (misType === 'run') {
    // 突破封鎖：躍遷點在對面；中間是巡邏線、浮標、水雷區
    const E = { x: Math.round((R() - 0.5) * 700), z: -1020 };
    used.push({ x: E.x, z: E.z, ex: 220 });
    ext = E;
    for (let k = 0, n = N([1, 2, 2, 3, 3]); k < n; k++) {   // 水雷區：在小行星之間的縫
      const c = spot(area(-450, 150, 1500), 260); if (!c) continue;
      for (let m = 0, nm = N([5, 6, 8, 10, 12]); m < nm; m++) { const a = R() * TAU, r = R() * 110; add('mine', { x: c.x + Math.sin(a) * r, y: alt(0.25), z: c.z + Math.cos(a) * r }); }
    }
    for (let k = 0, n = Math.max(2, Math.min(3, nEn + 1)); k < n; k++) {   // 巡邏線：沿 x 來回
      const z = -150 - k * 260 + (R() - 0.5) * 80, c = new Array(SHIP_TYPES.length).fill(0); c[shipT()]++; if (li >= 2 && R() < 0.5) c[shipT()]++;
      const lim = hole ? Math.min(1000, Math.abs(hole.x) - hole.hurt - 60) : 1000;
      const wp = [[-800, z], [800, z + (R() - 0.5) * 120]].map(([x, zz]) => [Math.round(x * (0.7 + R() * 0.3)), Math.round(zz)]).map(([x, zz]) => [hole && Math.sign(x) === Math.sign(hole.x) ? Math.sign(x) * Math.min(Math.abs(x), lim) : x, zz]);
      fleets.push(fleet({ side: 1, name: `封鎖線 ${k + 1}`, capRole: 'patrol', comp: c, x: wp[0][0] + R() * 400, z, y: alt(0.6), h: Math.PI / 2, wp }));
    }
    nEn = 0;
  } else if (misType === 'decap') {
    const c = comp1(li >= 3 ? 1 : 2); if (li >= 2 && nEn > 1) { c[4]++; nEn--; }
    fleets.push(fleet({ side: 1, name: '敵方指揮艦', capRole: 'flag', comp: c, x: B.x, z: B.z - 60, y: 10, h: 0 }));
    nEn--;
  }
  const r2 = capMisLayout2(misType, p, { R, li, S, B, fleets, fleet, comp1, shipT, mis, add, spot, near, area, alt, used, nEn, N, units, nShips });   // 護送、救援、摧毀設施、偵察（capmissions.js）
  if (r2) { nEn = r2.nEn; if (r2.ext) ext = r2.ext; }
  for (let k = 0; nEn > 0 && k < 2; k++) {
    const n = k === 1 ? nEn : Math.max(1, Math.ceil(nEn / 2)), c = new Array(SHIP_TYPES.length).fill(0);
    for (let m = 0; m < n; m++) c[shipT()]++;
    nEn -= n;
    const pt = area(-650, 200, 1400)(), wp = [0, 1, 2].map(() => area(-750, 250, 1500)()).map((q) => [Math.round(q.x), Math.round(q.z)]);
    fleets.push(fleet({ side: 1, name: `巡邏隊 ${k + 1}`, capRole: 'patrol', comp: c, x: pt.x, z: pt.z, y: alt(0.6), h: R() * TAU, wp }));
  }
  // 增援（戰區外待命，警報時才出動）
  const nWave = [1, 1, 2, 2, 3][li];
  for (let k = 0; k < nWave; k++) {
    const c = new Array(SHIP_TYPES.length).fill(0); c[R() < 0.5 ? 3 : 4]++; if (li >= 2) c[shipT()]++;
    fleets.push(fleet({ side: 1, name: `增援 ${k + 1}`, capRole: 'reinf', comp: c, x: (R() - 0.5) * 1100, z: -1500, y: 0, h: 0, reserve: true }));
  }
  units.filter((u) => CAP_UNIT[u.type].air).forEach((u, k) => { u.air = k; fleets.push(fleet({ side: 1, name: '艦載機平台', capRole: 'airbase', comp: comp1(0), x: u.x, z: u.z, y: u.y + 6, h: 0 })); });
  const space = { key, R: CAP_EDGE.R, Ry: CAP_EDGE.Ry, hole, edge: key === 'nebula' ? 'ion' : 'part' };
  const m = { name: '', fac: p.fac === 1 ? 1 : 0, victory: false, ctl: -1, timeLimit: CAP_RULE.time, seed: campHash(seed, 13) % 100000, fleets, terrain, sides: [{ lv: 0 }, { lv: li }],
    captain: { li, hulls, mis, units, S: { x: S.x, z: S.z }, B: { x: B.x, z: B.z }, ext, waves: nWave, ftr: [4, 6, 8, 10, 12][li], scene: null, space } };
  m.name = `${CAP_MIS[misType].name}・${CAP_SPACE[key].name}・${CAP_DIFF[li].name}`;
  return m;
}

// ───── 執行期 ─────
function capSpaceBegin(C) {
  CAP.sp = C.space || null;
  CAP.G = GRD || { space: true, gts: [], pil: [], ms: [] };
  CAP.noWarp = C.mis.type === 'run';
  if (C.ext) CAP.ext = { x: C.ext.x, z: C.ext.z };
  CAP.edgeT = 0; CAP.ally = [];
}
function capSpaceEnd() {
  const V = CAP.spV; if (!V) return;
  for (const o of V.hidden || []) o.visible = true;
  for (const m of Object.values(V.mats || {})) m.dispose();
  scene.remove(V.group); V.group.traverse((o) => { if (o.userData.shared) return; if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });   // shared＝太空站模型（共用快取，不能釋放）
  CAP.spV = null; CAP.sp = null;
}
// 船在戰區的哪裡：e＝橢球距離（1＝邊界）
const capEdgeE = (x, y, z) => Math.sqrt((x * x + z * z) / (CAP_EDGE.R * CAP_EDGE.R) + (y * y) / (CAP_EDGE.Ry * CAP_EDGE.Ry));
// 每 tick（capFly 之後）：粒子帶、黑洞的拉力與傷害
function capSpaceStep(dt, t) {
  const sp = CAP.sp; if (!sp) return;
  const tick = (CAP.edgeT += dt) >= 0.5; if (tick) CAP.edgeT = 0;
  for (const s of CAP.ships) {
    if (s.dead) continue;
    const e = capEdgeE(s.x, s.y, s.z);
    s.edge = e; s.holeD = 1e9;
    let hurt = 0;
    if (e > 1) {
      const k = Math.min(1, (e - 1) / (CAP_EDGE.hard - 1));
      hurt += CAP_EDGE.dmg[0] + (CAP_EDGE.dmg[1] - CAP_EDGE.dmg[0]) * k;
      if (e > CAP_EDGE.hard) { const f = CAP_EDGE.hard / e; s.x *= f; s.y *= f; s.z *= f; const vr = (s.vx * s.x + s.vy * s.y + s.vz * s.z) / Math.hypot(s.x, s.y, s.z); if (vr > 0) { const n = Math.hypot(s.x, s.y, s.z); s.vx -= s.x / n * vr; s.vy -= s.y / n * vr; s.vz -= s.z / n * vr; } }
    }
    const h = sp.hole;
    if (h) {
      const dx = h.x - s.x, dy = h.y - s.y, dz = h.z - s.z, d = Math.hypot(dx, dy, dz) || 1; s.holeD = d;
      if (d < h.pull) { const a = h.acc * (1 - d / h.pull) ** 2 * dt; s.x += dx / d * a; s.y += dy / d * a; s.z += dz / d * a; }   // 直接拖動位置：自動抵消漂移抵消不了，要全速才逃得開
      if (d < h.hurt) hurt += (h.kind === 'planet' ? 0.03 : 0.04) + (h.kind === 'planet' ? 0.3 : 0.5) * (1 - Math.max(0, d - h.r) / (h.hurt - h.r)) ** 2;
      if (d < h.r) {
        if (h.kind === 'planet') { const f = h.r / d; s.x = h.x - dx * f; s.y = h.y - dy * f; s.z = h.z - dz * f; const vr = -(s.vx * dx + s.vy * dy + s.vz * dz) / d; if (vr < 0) { s.vx -= -dx / d * vr; s.vy -= -dy / d * vr; s.vz -= -dz / d * vr; } hurt += 0.4; }   // 撞上行星表面：推回大氣層
        else hurt += 1;
      }
    }
    if (hurt > 0 && tick && capLive()) {
      const dmg = hurt * 0.5 * (ships.shMax[s.i] + maxHp(s.i));
      pending.push({ t, target: s.i, side: 1 - s.side, asp: 0, dmg, hm: 1, fx: false, dirIdx: 0, x: s.x, y: s.y, z: s.z, crash: true });
      if (s.k === CAP.cur && t - (s.edgeFeedT || -9) > 4) { s.edgeFeedT = t; capFeed(h && s.holeD < h.hurt ? CAP_WELL_TX[h.kind].feed : CAP_EDGE_TX[CAP.sp.edge || 'part'].feed, 'bad'); }
    }
  }
  // 水雷：我方的船靠近就爆炸
  for (const g of CAP.G.gts) {
    if (g.cu !== 'mine' || gtDead(g)) continue;
    const T = CAP_UNIT.mine.mine;
    let hit = false; for (const s of CAP.own) if (!s.dead && Math.hypot(s.x - g.x, s.y - g.y, s.z - g.z) < T.r + s.L * 0.4) { hit = true; break; }
    if (!hit) continue;
    g.hp = 0; g.deadT = t; spawnFx(g.x, g.y, g.z, g.side, 4, 22);
    for (const s of CAP.own) { if (s.dead) continue; const d = Math.hypot(s.x - g.x, s.y - g.y, s.z - g.z); if (d < T.blast) pending.push({ t, target: s.i, side: g.side, asp: 0, dmg: T.dmg * CAP.Df.dmg * (1 - 0.6 * d / T.blast), hm: 1, fx: true, dirIdx: 0, x: g.x, y: g.y, z: g.z, sx: g.x, sz: g.z }); }
    s0Feed('觸雷！');
  }
  function s0Feed(m) { if (t - (CAP.mineFeedT || -9) > 2) { CAP.mineFeedT = t; capFeed(m, 'bad'); } }
}
// 運輸船隊：沿航線走，走到最後一點就離開戰區（算逃脫）；護航：跟著船隊，發現小隊才去追
function capConvoyAI(P, t) {
  const g = P.g, al = P.f.sqs.filter((q) => q.alive > 0); if (!al.length) return;
  const C = centerOf(al);
  if (P.role === 'convoy') {
    const w = P.wp[Math.min(P.wi, P.wp.length - 1)];
    if (Math.hypot(w.x - C.x, w.z - C.z) < 50) P.wi++;
    if (P.wi >= P.wp.length) { capConvoyEscape(P); return; }
    const w2 = P.wp[P.wi];
    if (P.dest && P.dest.x === w2.x && P.dest.z === w2.z && t - P.destT < 15) return;
    P.dest = { x: w2.x, z: w2.z }; P.destT = t;
    moveGroup(g, w2.x, w2.z, Math.atan2(w2.x - C.x, w2.z - C.z), { y: g.ay });
    return;
  }
  // 護航
  const V = CAP.pat.find((q) => q.role === 'convoy');
  let best = null, bd = 420;
  for (const s of CAP.own) { if (s.dead || t >= s.knownT) continue; const d = Math.hypot(s.x - C.x, s.z - C.z); if (d < bd) { bd = d; best = s; } }
  let dest;
  if (best) { g.target = best.q; const hx = C.x - best.x, hz = C.z - best.z, hd = Math.hypot(hx, hz) || 1; dest = { x: best.x + hx / hd * 110, z: best.z + hz / hd * 110, y: best.y + 8 }; }
  else {
    g.target = null;
    const vs = V && V.f.sqs.filter((q) => q.alive > 0); if (!vs || !vs.length) return;
    const VC = centerOf(vs), vg = V.g; dest = { x: VC.x + Math.sin((vg.to || 0) + 1.2) * 45, z: VC.z + Math.cos((vg.to || 0) + 1.2) * 45, y: (vg.ay || 0) + 8 };
  }
  if (P.dest && Math.hypot(P.dest.x - dest.x, P.dest.z - dest.z) < 25 && t - P.destT < 4) return;
  P.dest = dest; P.destT = t;
  moveGroup(g, dest.x, dest.z, Math.atan2(dest.x - C.x, dest.z - C.z), { y: dest.y });
}
function capConvoyEscape(P) {
  let n = 0;
  for (const q of P.f.sqs) for (const i of q.list) { if (!ships.alive[i]) continue; ships.alive[i] = 0; q.alive--; q.typeAlive[ships.type[i]]--; n++; }
  for (const q of P.f.sqs) { q.bg = true; q.hidden = true; if (q.label) q.label.style.display = 'none'; }
  P.g.inactive = true; P.on = false;
  if (n && CAP.mis) { CAP.mis.esc = (CAP.mis.esc || 0) + n; capFeed(`${n} 艘運輸艦逃出戰區！`, 'bad'); toast(`${n} 艘運輸艦逃出戰區`, 'bad'); }
}
// 任務進度（capMisTick 呼叫）
function capSpaceMisTick(M) {
  if (M.type === 'intercept') {
    const V = CAP.pat.find((q) => q.role === 'convoy');
    const alive = V ? V.f.sqs.reduce((a, q) => a + q.alive, 0) : 0;
    M.prog = Math.max(0, M.n - alive - (M.esc || 0));
    if ((M.esc || 0) > M.n - M.goal && !M.done) capFinish(false, '運輸船隊逃脫');
  }
}

// ───── 畫面：設施模型、邊界光牆、黑洞 ─────
const CAP_EDGE_VS = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const CAP_EDGE_FS = /* glsl */`
uniform float uT; uniform vec3 uP; uniform vec3 uCol; varying vec3 vW; varying vec3 vN;
void main() {
  float d = distance(vW, uP);
  float near = clamp(1.0 - d / 450.0, 0.0, 1.0);
  float band = pow(0.5 + 0.5 * sin(vW.y * 0.09 + uT * 1.6 + sin(vW.x * 0.012 + vW.z * 0.008 + uT * 0.3) * 3.0), 3.0);
  float grain = fract(sin(dot(floor(vW.xz * 0.12) + floor(uT * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
  float a = 0.025 + near * near * (0.06 + 0.3 * band) + step(0.99, grain) * near * 0.5;
  gl_FragColor = vec4(uCol * (0.5 + band), a);
}`;
const CAP_DISK_FS = /* glsl */`
uniform float uT; varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
  if (r > 1.0 || r < 0.32) discard;
  float sw = 0.5 + 0.5 * sin(a * 3.0 - uT * 1.2 + r * 18.0);
  float k = smoothstep(1.0, 0.45, r) * smoothstep(0.32, 0.42, r);
  vec3 c = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.92, 0.7), smoothstep(0.8, 0.35, r));
  gl_FragColor = vec4(c * (0.55 + 0.6 * sw), k * (0.5 + 0.4 * sw));
}`;
function capSpaceBuild() {
  const sp = CAP.sp; if (!sp) return;
  const group = new THREE.Group(); scene.add(group);
  const V = CAP.spV = { group, meshes: [], mats: {} };
  // 邊界光牆
  const em = new THREE.ShaderMaterial({ vertexShader: CAP_EDGE_VS, fragmentShader: CAP_EDGE_FS, uniforms: { uT: { value: 0 }, uP: { value: new THREE.Vector3() }, uCol: { value: sp.edge === 'ion' ? new THREE.Color(0.3, 0.85, 1.0) : new THREE.Color(0.55, 0.45, 1.0) } },
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending });
  const wall = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), em); wall.scale.set(CAP_EDGE.R, CAP_EDGE.Ry, CAP_EDGE.R); wall.renderOrder = 5; group.add(wall);
  V.edge = em;
  // 地形：指揮官視角用的範圍球殼、外框線藏起來（近看像玻璃泡）；小行星區改放真的小石塊
  V.hidden = [];
  fieldGroup.traverse((o) => { if (o === fieldGroup) return; const shell = o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry' && o.material.transparent; if ((shell || o.isLine) && o.visible) { o.visible = false; V.hidden.push(o); } });
  const fields = terrainList().filter((t) => t.type === 'asteroid');
  if (fields.length) {
    const n = fields.reduce((a, t) => a + Math.round(t.r * 0.45), 0), geo = new THREE.IcosahedronGeometry(1, 1), P = geo.getAttribute('position');
    for (let i = 0; i < P.count; i++) { const k = 0.75 + 0.5 * Math.abs(Math.sin(P.getX(i) * 5.1 + P.getY(i) * 3.7 + P.getZ(i) * 4.3)); P.setXYZ(i, P.getX(i) * k, P.getY(i) * k * 0.8, P.getZ(i) * k); }
    geo.computeVertexNormals();
    const junk = sp.key === 'station', im = new THREE.InstancedMesh(junk ? new THREE.BoxGeometry(1.4, 0.5, 1) : geo, new THREE.MeshStandardMaterial({ color: junk ? 0x6a717e : 0x7d7062, roughness: junk ? 0.55 : 0.95, metalness: junk ? 0.6 : 0.05, flatShading: true }), n), Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Sc = new THREE.Vector3(), Ps = new THREE.Vector3();
    let k = 0;
    for (const t of fields) {
      const R = mulberry32(Math.round(t.x * 3 + t.z * 11) >>> 0);
      for (let m = 0, nm = Math.round(t.r * 0.45); m < nm; m++) {
        let a, b, c; do { a = R() * 2 - 1; b = R() * 2 - 1; c = R() * 2 - 1; } while (a * a + b * b + c * c > 1);
        const s = 0.6 + R() ** 3 * 6;
        Ps.set(t.x + a * t.r, (t.y || 0) + b * t.r * 0.6, t.z + c * t.r); E.set(R() * 6, R() * 6, R() * 6); Q.setFromEuler(E); Sc.set(s, s * (0.6 + R() * 0.5), s);
        im.setMatrixAt(k++, Mx.compose(Ps, Q, Sc));
      }
    }
    im.instanceMatrix.needsUpdate = true; group.add(im);
  }
  capSceneBuild(group, V, sp);   // 恆星、行星、星雲、太空站（capmissions.js）
  // 黑洞：黑球＋吸積盤＋外圈的光暈
  if (sp.hole && sp.hole.kind === 'hole') {
    const h = sp.hole, hg = new THREE.Group(); hg.position.set(h.x, h.y, h.z); group.add(hg);
    hg.add(new THREE.Mesh(new THREE.SphereGeometry(h.r * 0.75, 48, 24), new THREE.MeshBasicMaterial({ color: 0x000000 })));
    const dm = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: CAP_DISK_FS,
      uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const disk = new THREE.Mesh(new THREE.PlaneGeometry(h.r * 7, h.r * 7), dm); disk.rotation.x = -Math.PI / 2 + 0.25; hg.add(disk);
    const hm = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uT; varying vec2 vUv; void main(){ float r = length(vUv * 2.0 - 1.0); float k = exp(-pow((r - 0.42) / 0.035, 2.0)) + 0.35 * exp(-pow((r - 0.5) / 0.12, 2.0)); gl_FragColor = vec4(vec3(1.0, 0.8, 0.55) * k, k); }',
      uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(h.r * 4.2, h.r * 4.2), hm); hg.add(halo);   // 光子環：永遠面向鏡頭，圍著黑洞的輪廓
    V.disk = dm; V.halo = halo;
    for (const [r, c, o] of [[h.pull, 0xff9a3c, 0.35], [h.hurt, 0xff4020, 0.7]]) {   // 重力範圍（虛線感的淡環）、開始受損的範圍
      const P = []; for (let k = 0; k <= 128; k++) { const a = k / 128 * TAU; P.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
      hg.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false })));
    }
  }
  // 設施
  const ec = new THREE.Color(FACTION[SIDE_FAC[1 - CAP.side]].ui);
  const M = (c, e = 0) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.5, emissive: e ? ec : 0x000000, emissiveIntensity: e }); return m; };
  const hull = M(0x5a6070), dark = M(0x2c3038), glow = M(0x222222, 1.4), red = new THREE.MeshStandardMaterial({ color: 0x441010, emissive: 0xff3020, emissiveIntensity: 1.5 });
  V.mats = { hull, dark, glow, red };
  for (const g of CAP.G.gts) {
    const o = new THREE.Group(); o.position.set(g.x, g.y, g.z); o.rotation.y = g.hd || 0;
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; o.add(m); return m; };
    if (g.cu === 'plat') {
      add(new THREE.CylinderGeometry(2.4, 2.8, 0.9, 6), hull); add(new THREE.CylinderGeometry(1.2, 1.4, 1.4, 8), dark, 0, 0.9);
      add(new THREE.TorusGeometry(3.3, 0.18, 6, 24), glow, 0, 0, 0, Math.PI / 2);
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; add(new THREE.BoxGeometry(0.35, 0.35, 2.2), dark, Math.sin(a) * 1.6, 0.9, Math.cos(a) * 1.6).rotation.y = a; }
      add(new THREE.CylinderGeometry(0.6, 0.9, 1.6, 6), dark, 0, -1.1);
    } else if (g.cu === 'buoy') {
      add(new THREE.SphereGeometry(0.6, 12, 8), hull); add(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), dark, 0, 1.2); add(new THREE.SphereGeometry(0.16, 8, 6), red, 0, 2.35);
      add(new THREE.BoxGeometry(2.2, 0.05, 0.6), dark, 0, 0);
    } else if (g.cu === 'relay') {
      add(new THREE.CylinderGeometry(0.25, 0.35, 5.5, 8), hull); add(new THREE.ConeGeometry(1.4, 0.7, 16, 1, true), dark, 0, 2.6, 0, Math.PI);
      for (const y of [-1.5, 0.2]) add(new THREE.BoxGeometry(3.6, 0.08, 1.1), glow, 0, y);
      add(new THREE.SphereGeometry(0.2, 8, 6), red, 0, 3.1);
    } else if (g.cu === 'mine') {
      add(new THREE.IcosahedronGeometry(0.55, 0), dark);
      for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const c = add(new THREE.ConeGeometry(0.12, 0.5, 5), dark, x * 0.65, y * 0.65, z * 0.65); c.lookAt(o.position.x + x * 9, o.position.y + y * 9, o.position.z + z * 9); c.rotateX(Math.PI / 2); }
      add(new THREE.SphereGeometry(0.18, 8, 6), red);
    } else if (g.cu === 'hangar') {
      add(new THREE.BoxGeometry(6, 0.8, 3.6), hull); add(new THREE.BoxGeometry(5.2, 0.12, 2.6), glow, 0, 0.46);
      add(new THREE.BoxGeometry(1.2, 2.2, 1.2), dark, -2.2, 1.4); add(new THREE.CylinderGeometry(0.8, 0.8, 2.4, 8), dark, 2, -0.9, 0, 0, Math.PI / 2);
    } else if (g.cu === 'orb') {   // 軌道防禦站：中央塔＋環＋輻條＋砲塔
      add(new THREE.CylinderGeometry(1.6, 2.2, 6, 10), hull); add(new THREE.SphereGeometry(1.8, 14, 10), dark, 0, 3.4); add(new THREE.ConeGeometry(1.4, 2.6, 10), dark, 0, -4.2, 0, Math.PI);
      add(new THREE.TorusGeometry(6.2, 0.55, 8, 40), hull, 0, 0, 0, Math.PI / 2); add(new THREE.TorusGeometry(6.2, 0.2, 6, 40), glow, 0, 0.6, 0, Math.PI / 2);
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; add(new THREE.BoxGeometry(0.4, 0.4, 6), dark, Math.sin(a) * 3.2, 0, Math.cos(a) * 3.2).rotation.y = a; add(new THREE.BoxGeometry(1, 0.8, 1.6), dark, Math.sin(a + 0.4) * 6.2, 0.9, Math.cos(a + 0.4) * 6.2).rotation.y = a; }
      add(new THREE.SphereGeometry(0.25, 8, 6), red, 0, 4.9);
    } else if (!capUnitGeo(g, add, V.mats)) add(new THREE.BoxGeometry(g.r, g.r, g.r), hull);
    group.add(o); V.meshes[g.id] = o;
    capStationModel(o, g);   // 換成專案的太空站模型（capstate.js）
  }
}
function capSpaceFrame() {
  const V = CAP.spV; if (!V) return;
  const t = U.uTime.value, s = capCur();
  V.edge.uniforms.uT.value = t; if (s) V.edge.uniforms.uP.value.set(s.x, s.y, s.z);
  if (V.disk) V.disk.uniforms.uT.value = t;
  if (V.halo) V.halo.quaternion.copy(camera.quaternion);
  capSceneFrame(V, t);
  for (const g of CAP.G.gts) {
    let o = V.meshes[g.id];
    if (!o) continue;
    o.visible = !gtDead(g) && (g.cu !== 'mine' || CAP.seeG[g.id] === 1);
    if (g.cu === 'plat' || g.cu === 'buoy' || g.cu === 'orb') o.rotation.y = (g.hd || 0) + t * (g.cu === 'buoy' ? 0.4 : 0.08);
  }
}
// 新增的設施（增援等）補模型：目前太空沒有中途新增的設施
// 儀表：粒子帶、黑洞的警告（capHud 呼叫）
// 船附近的危險（粒子帶、黑洞）：dir＝危險的方向（單位向量）、d＝離危險區還有多遠（進去了＝0）、in＝已經在受損
const CAP_DANGER = { edge: { name: '高能粒子帶', col: '#b48cff' }, ion: { name: '離子風暴', col: '#5fd8ff' }, hole: { name: '黑洞重力井', col: '#ff9a3c' }, star: { name: '恆星高溫區', col: '#ffd040' }, planet: { name: '大氣層', col: '#6fb0ff' } };
const CAP_EDGE_TX = { part: { feed: '高能粒子帶：船體受損，快離開！' }, ion: { feed: '離子風暴：船體受損，快離開！' } };
const CAP_WELL_TX = {
  hole: { feed: '黑洞的潮汐力正在撕裂船體！', in: '黑洞的潮汐力正在撕裂船體：往綠色箭頭全速脫離！', pull: (km) => `被黑洞的重力拉住（${km} km 後開始受損）：往綠色箭頭推進`, near: (km) => `前方是黑洞重力井（${km} km）`, near2: (km) => `距黑洞危險區 ${km} km`, label: '黑洞' },
  star: { feed: '恆星的高溫正在灼燒船體！', in: '恆星的高溫正在灼燒船體：往綠色箭頭離開！', pull: (km) => `接近恆星（${km} km 後開始受損）`, near: (km) => `前方是恆星高溫區（${km} km）`, near2: (km) => `距恆星高溫區 ${km} km`, label: '恆星' },
  planet: { feed: '進入大氣層：船體摩擦燃燒！', in: '大氣層摩擦燃燒：往綠色箭頭爬升脫離！', pull: (km) => `行星的重力把船往下拉（${km} km 後進入大氣層）：往綠色箭頭推進`, near: (km) => `前方是行星大氣層（${km} km）`, near2: (km) => `距大氣層 ${km} km`, label: '行星' },
};
function capDangers(s) {
  const out = [], e = s.edge || 0, h = CAP.sp && CAP.sp.hole;
  if (e > 0.72) {
    const nx = s.x / CAP_EDGE.R ** 2, ny = s.y / CAP_EDGE.Ry ** 2, nz = s.z / CAP_EDGE.R ** 2, nl = Math.hypot(nx, ny, nz) || 1, ny1 = ny / nl;
    out.push({ k: CAP.sp.edge === 'ion' ? 'ion' : 'edge', dir: [nx / nl, ny1, nz / nl], d: e >= 1 ? 0 : Math.hypot(s.x, s.y, s.z) * (1 / e - 1), in: e > 1, side: ny1 > 0.7 ? '上方' : ny1 < -0.7 ? '下方' : '' });
  }
  if (h && s.holeD < Math.max(h.pull, h.hurt) * 1.15) out.push({ k: h.kind || 'hole', dir: [(h.x - s.x) / s.holeD, (h.y - s.y) / s.holeD, (h.z - s.z) / s.holeD], d: Math.max(0, s.holeD - h.hurt), in: s.holeD < h.hurt, pull: s.holeD < h.pull, side: '' });
  return out;
}
const _cdv = new THREE.Vector3();
// 船的儀表：最近的危險（種類＋距離）
function capNearDanger(s) {
  const e = s.edge || 0, de = e >= 1 ? 0 : Math.hypot(s.x, s.y, s.z) * (1 / Math.max(0.01, e) - 1), h = CAP.sp && CAP.sp.hole, dh = h ? Math.max(0, s.holeD - h.hurt) : 1e9;
  return dh < de ? CAP_WELL_TX[h.kind || 'hole'].near2((dh * GROUND_KM).toFixed(1)) : `距${CAP.sp.edge === 'ion' ? '離子風暴' : '粒子帶'} ${(de * GROUND_KM).toFixed(1)} km`;
}
// 儀表：危險的種類、方向（畫面上的箭頭指向危險、綠色箭頭＝脫離方向）、距離；在危險區裡＝畫面邊緣閃爍
function capSpaceHud(g, s, cx, cy, m, red, amb) {
  if (!CAP.sp) return false;
  const W = innerWidth, H = innerHeight, now = performance.now(), L = capDangers(s);
  L.forEach((D, n) => {
    const T = CAP_DANGER[D.k], km = (D.d * GROUND_KM).toFixed(1), y0 = cy - m * (0.24 - n * 0.05);
    // 畫面上的方向：把危險方向投影到畫面，從畫面中央往外指
    const arrow = (dx, dy, dz, col, label, R0) => {
      _cdv.set(s.x + dx * 80, s.y + dy * 80, s.z + dz * 80).project(camera);
      let ax = _cdv.x, ay = -_cdv.y; if (_cdv.z > 1) { ax = -ax; ay = -ay; }
      const l = Math.hypot(ax, ay) || 1, ux = ax / l, uy = ay / l, px = cx + ux * R0, py = cy + uy * R0, a = Math.atan2(uy, ux);
      g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(16, 0); g.lineTo(-8, -11); g.lineTo(-3, 0); g.lineTo(-8, 11); g.closePath(); g.fill(); g.restore();
      plFont(g, 12, true); g.textAlign = 'center'; g.fillStyle = col; g.fillText(label, px - ux * 30, py - uy * 30 + (uy > 0.5 ? -14 : 14)); g.textAlign = 'left';
    };
    const R0 = m * 0.17;
    arrow(D.dir[0], D.dir[1], D.dir[2], T.col, `${T.name}${D.side ? `（${D.side}）` : ''} ${D.in ? '受損中' : km + ' km'}`, R0);
    if (D.in || D.pull || D.d < 120) arrow(-D.dir[0], -D.dir[1], -D.dir[2], '#8fe39a', '脫離方向', R0);
    const W = CAP_WELL_TX[D.k], EN = T.name;
    const msg = W ? (D.in ? W.in : D.pull ? W.pull(km) : W.near(km))
      : D.in ? `${D.side ? D.side + '的' : ''}${EN}：船體受損，往綠色箭頭離開！` : `接近戰區邊界：${D.side ? D.side + '的' : ''}${EN}（${km} km）`;
    pilotText(g, cx, y0, msg, D.in ? red : D.pull || D.d < 80 ? amb : T.col, D.in ? 16 : 14);
    if (D.in) {   // 畫面邊緣閃爍（顏色＝危險的種類）
      const a = 0.25 + 0.2 * Math.sin(now / 160);
      g.save(); g.strokeStyle = T.col; g.globalAlpha = a; g.lineWidth = 22; g.strokeRect(0, 0, W, H); g.restore();
    }
  });
  return true;
}
// 雷達：戰區邊界（粒子帶）與黑洞的範圍（capRadar 呼叫；已經裁成圓形）
function capSpaceRadar(g, s, cx, cy, k, fw) {
  if (!CAP.sp) return;
  const pr = (x, z) => { const dx = x - s.x, dz = z - s.z; return [cx + (-dx * fw[1] + dz * fw[0]) * k, cy - (dx * fw[0] + dz * fw[1]) * k]; };
  const ring = (x, z, r, col, lw, dash) => { const c = pr(x, z); g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash || []); g.beginPath(); g.arc(c[0], c[1], r * k, 0, TAU); g.stroke(); g.setLineDash([]); g.lineWidth = 1.5; };
  const yk = Math.max(0, 1 - (s.y / CAP_EDGE.Ry) ** 2), Rh = CAP_EDGE.R * Math.sqrt(yk);   // 這個高度的橫切面
  const c0 = pr(0, 0);
  const ion = CAP.sp.edge === 'ion', ec = ion ? '95,216,255' : '190,150,255';
  g.fillStyle = ion ? 'rgba(95,216,255,.16)' : 'rgba(180,140,255,.18)'; g.beginPath(); g.arc(c0[0], c0[1], Rh * k + 400, 0, TAU); g.arc(c0[0], c0[1], Rh * k, 0, TAU, true); g.fill();   // 邊界外塗色
  ring(0, 0, Rh, `rgba(${ec},.95)`, 2); ring(0, 0, Rh * CAP_EDGE.warn, `rgba(${ec},.35)`, 1, [4, 4]);
  const h = CAP.sp.hole;
  if (h) {
    const kd = h.kind || 'hole', col = kd === 'planet' ? ['111,176,255', '#2a4f8a', '#9fc8ff'] : kd === 'star' ? ['255,208,64', '#fff0b0', '#ffe080'] : ['255,154,60', '#000', '#ffb070'];
    if (h.pull) ring(h.x, h.z, h.pull, `rgba(${col[0]},.6)`, 1, [5, 4]);
    ring(h.x, h.z, h.hurt, kd === 'hole' ? 'rgba(255,90,60,.9)' : `rgba(${col[0]},.95)`, 2);
    const c = pr(h.x, h.z); g.fillStyle = col[1]; g.beginPath(); g.arc(c[0], c[1], Math.max(3, (kd === 'hole' ? h.r : h.r) * k), 0, TAU); g.fill();
    plFont(g, 10, true); g.fillStyle = col[2]; g.textAlign = 'center'; g.fillText(CAP_WELL_TX[kd].label, c[0], c[1] - h.hurt * k - 4); g.textAlign = 'left';
  }
}
