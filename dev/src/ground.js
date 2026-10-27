// ═══════════════════════ 近地作戰：靠近行星地表的戰場（都市、海港、軍事基地、軌道電梯、群山） ═══════════════════════
// battleSetup.ground = { scene, seed, def }：scene＝GROUND_SCENES 的 key；def＝防守方（地面砲台屬於哪一邊，-1＝沒有砲台）
// 比例：戰列艦約 1 公里長（5.6 單位）→ 1 單位 ≈ 200 公尺。艦隊平面（y＝0）離地約 10 公里（GROUND_Y＝-50）
// 只在近地戰場生效，太空戰場完全不變（GRD＝null）：
//   最低飛行高度：船不能低於地面（或山坡）上方約 1 公里；一般的大樓、街道比戰艦小，只是地表的細節，被砲擊、落彈打到會被炸毀
//   巨型結構（都市的生態巨塔、海港的發射塔與星艦船塢、基地的防禦砲塔、軌道電梯的纜繩）與山是實體障礙：擋移動、擋射線、擋偵測
//   大氣：越接近地面空氣越濃（指數遞減），光束的命中率與威力越低（飛彈、艦載機不受影響）
//   重力：有航母、戰列艦的部隊在低空移動變慢、爬升更慢
//   地面防空砲台：屬於防守方，自動射擊射程內的敵艦；戰艦會順手（或沒別的可打時）攻擊它，可以擊毀
// 地形由 scene＋seed 決定（同一個設定一定生成一樣的戰場，回放才會一致）；建築被炸毀只是畫面，不影響戰鬥結果

const GROUND_KM = 0.2;          // 1 單位＝0.2 公里
const GROUND_Y = -50;           // 地面高度（艦隊平面 y＝0 在地面上方 50 單位≈10 公里）
const GROUND_HS = 45;           // 大氣的標高（單位）：每升高 45 單位（9 公里），空氣密度降為 1/e
const GROUND_EXT = 1600, GROUND_N = 256, GROUND_CELL = GROUND_EXT * 2 / GROUND_N;   // 地形高度格：±1600、256×256 格（每格 12.5）
// atmoHit／atmoDmg：貼地時光束命中率／威力的最大降幅；grav：重艦貼地時的最大減速；climb：重艦爬升速度的最大降幅
// fly：最低飛行高度（離地面、山坡）；minAlt：部隊中心離地面至少多高；slope：船沿山坡爬升的坡度
const GROUND_RULE = { atmoHit: 0.35, atmoDmg: 0.25, grav: 0.35, climb: 0.5, fly: 5, minAlt: 10, slope: 1.1 };
// 地面砲台：hp 耐久（沒有護盾）、range 射程、cd 開火間隔、dmg 單發傷害、acc 命中率（再乘目標大小、大氣）
// pick：戰艦的主／副砲有多少機率改打射程內的砲台；hitBy：戰艦打砲台的命中率
const TURRET_RULE = { hp: 300, range: 480, cd: 2.4, dmg: 10, acc: 0.75, pick: 0.2, hitBy: 0.8 };
const PIL_MAX = 16;   // 柱狀障礙（巨型結構）最多幾個（著色器的陣列大小）

// 場景：atmo 大氣倍率、grav 重力倍率；pal＝畫面配色（顏色是線性值）
const GROUND_SCENES = {
  city: { name: '都市', en: 'CITY', atmo: 1, grav: 1,
    desc: '陰天的超大都會，灰色的城區綿延上百公里，低空飄著霧與雲。一般大樓比戰艦還小，只是地表的紋理（會被流彈炸毀）；幾座十幾公里高的生態巨塔才是障礙。防空砲台散布在市區裡。',
    pal: { zen: [0.22, 0.26, 0.31], hor: [0.4, 0.43, 0.47], fogC: [0.24, 0.26, 0.29], gnd: [0.15, 0.16, 0.17], sun: [-0.35, 0.7, -0.6], sunCol: [0.3, 0.31, 0.33], lSun: [0.26, 0.27, 0.29], amb: [0.19, 0.2, 0.23],
      fog: 0.00036, stars: 0, cloud: 0.85, cloudCol: [0.42, 0.44, 0.47], win: [0.8, 0.85, 0.9], winK: 0.03, plane: 0, haze: 0.25, fires: 14, low: [[-41, 0.64, 0.3], [-31, 0.68, 0.3], [-19, 0.72, 0.26]] } },
  harbor: { name: '海港', en: 'HARBOR', atmo: 1, grav: 1,
    desc: '黃昏的軍港。左側是港區與城市，右側是開闊的海面；兩座發射塔、星艦船塢的龍門架與外海的巨型防波堤是障礙。海岸與港區有岸防砲台。',
    pal: { zen: [0.05, 0.07, 0.16], hor: [0.62, 0.3, 0.17], fogC: [0.2, 0.12, 0.1], gnd: [0.05, 0.05, 0.07], sun: [0.75, 0.05, -0.66], sunCol: [1.0, 0.5, 0.22], lSun: [0.75, 0.45, 0.3], amb: [0.13, 0.12, 0.16],
      fog: 0.00032, stars: 0.0, cloud: 0.55, cloudCol: [0.55, 0.26, 0.2], win: [1.0, 0.78, 0.45], winK: 0.25, plane: 1, haze: 0.3, fires: 5, low: [[-38, 0.6, 0.25], [-26, 0.62, 0.35]], sea: [0.02, 0.045, 0.07] } },
  base: { name: '軍事基地', en: 'MILITARY BASE', atmo: 1, grav: 1,
    desc: '陰天的要塞基地群：好幾座機場與營區散布在平原上，地形開闊；三座行星防禦砲塔與護盾產生器是障礙。防空砲台最多。',
    pal: { zen: [0.2, 0.25, 0.32], hor: [0.4, 0.43, 0.47], fogC: [0.2, 0.215, 0.235], gnd: [0.1, 0.11, 0.1], sun: [-0.3, 0.8, -0.5], sunCol: [0.35, 0.36, 0.38], lSun: [0.42, 0.42, 0.44], amb: [0.2, 0.21, 0.23],
      fog: 0.0004, stars: 0.0, cloud: 0.8, cloudCol: [0.32, 0.34, 0.37], win: [0.9, 0.85, 0.6], winK: 0.1, plane: 2, haze: 0.3, fires: 6, low: [[-36, 0.6, 0.25], [-24, 0.56, 0.4]] } },
  elevator: { name: '軌道電梯', en: 'SPACE ELEVATOR', atmo: 0.5, grav: 0.7,
    desc: '高原上的軌道電梯基座。一條纜繩從地面直通太空（擋路、擋射線，只能繞過），二十多公里高處有中繼平台；海拔高、空氣稀薄，大氣影響減半、重力較低。砲台守在基座與平台上。',
    pal: { zen: [0.004, 0.006, 0.02], hor: [0.12, 0.2, 0.42], fogC: [0.05, 0.08, 0.16], gnd: [0.07, 0.05, 0.04], sun: [-0.5, 0.45, -0.4], sunCol: [0.9, 0.85, 0.75], lSun: [0.6, 0.57, 0.52], amb: [0.08, 0.09, 0.13],
      fog: 0.0002, stars: 0.9, cloud: 0.15, cloudCol: [0.3, 0.35, 0.5], win: [0.7, 0.9, 1.0], winK: 0.35, plane: 3, fires: 3 } },
  mountain: { name: '群山', en: 'MOUNTAINS', atmo: 1, grav: 1,
    desc: '黎明的山區，山谷裡有小鎮。可能是地球般的山脈（最高約 9 公里，要貼低飛行才會被擋），也可能是低重力行星上的異星巨山（數十公里高，穿過艦隊平面）。山頂有要塞砲台。',
    pal: { zen: [0.06, 0.1, 0.2], hor: [0.55, 0.36, 0.34], fogC: [0.24, 0.18, 0.2], gnd: [0.05, 0.05, 0.06], sun: [0.8, 0.12, 0.25], sunCol: [1.0, 0.62, 0.42], lSun: [0.8, 0.58, 0.45], amb: [0.13, 0.14, 0.19],
      fog: 0.0003, stars: 0.1, cloud: 0.45, cloudCol: [0.5, 0.36, 0.38], win: [1, 0.8, 0.5], winK: 0.3, plane: 4, haze: 0.35, fires: 2, low: [[-22, 0.6, 0.35]] } },
};
const GROUND_KEYS = Object.keys(GROUND_SCENES);
// 隨機戰役、無限戰場的「戰場」選項
const GROUND_ENV = [{ name: '太空', g: null }, ...GROUND_KEYS.map((k) => ({ name: GROUND_SCENES[k].name, g: k })), { name: '近地隨機', g: 'rand' }];
function groundPick(g, R) { return g === 'rand' ? GROUND_KEYS[Math.floor(R() * GROUND_KEYS.length)] : g; }
const gKm = (u) => Math.round(u * GROUND_KM * 10) / 10;

// 簡報用：近地規則說明
function groundRulesHtml(g) {
  const S = GROUND_SCENES[g.scene], a = S.atmo, gv = S.grav, pct = (v) => Math.round(v * 100), D = groundData(g), turN = (g.def === 0 ? D.spotsP : g.def === 1 ? D.spotsN : []).length;
  const r0 = groundRho(0) * a, rf = groundRho(GROUND_Y + GROUND_RULE.fly) * a;
  return `<div><b>近地作戰・${D.title}</b>：<span class="g-dim">${S.desc}</span></div>
    <div><b>高度</b>：<span class="g-dim">艦隊平面離地約 ${gKm(-GROUND_Y)} 公里；最低飛行高度是離地（或山坡）${gKm(GROUND_RULE.fly)} 公里。一般建築比戰艦小，不擋路，但會被流彈炸毀。</span></div>
    <div><b>障礙</b>：<span class="g-dim">${D.obst}</span></div>
    <div><b>大氣</b>：<span class="g-dim">越接近地面，光束的命中率與威力越低（艦隊平面 −${pct(GROUND_RULE.atmoHit * r0)}%／−${pct(GROUND_RULE.atmoDmg * r0)}%，貼地 −${pct(GROUND_RULE.atmoHit * rf)}%／−${pct(GROUND_RULE.atmoDmg * rf)}%）；飛彈、艦載機不受影響。</span></div>
    <div><b>重力</b>：<span class="g-dim">有航母、戰列艦的部隊在低空移動變慢（艦隊平面 −${pct(GROUND_RULE.grav * gv * groundRho(0))}%，貼地 −${pct(GROUND_RULE.grav * gv * groundRho(GROUND_Y + GROUND_RULE.fly))}%），爬升也更慢。</span></div>
    ${g.def >= 0 && turN ? `<div><b>防空砲台</b>：<span class="g-dim">${g.def === GAME.playerSide ? '我方' : '敵方'}有 ${turN} 座地面砲台（射程 ${gKm(TURRET_RULE.range)} 公里，耐久 ${TURRET_RULE.hp}）。戰艦會順手攻擊射程內的敵方砲台。</span></div>` : ''}`;
}
// 簡報的「戰場環境」說明：近地戰場或太空地形
function envBriefHtml(sc) {
  if (sc.ground && GROUND_SCENES[sc.ground.scene]) return groundRulesHtml(sc.ground);
  return sc.terrain.length ? [...new Set(sc.terrain.map((t) => t.type))].map((k) => `<div><b>${TERRAIN_TYPES[k].name}</b>：<span class="g-dim">${TERRAIN_TYPES[k].desc}</span></div>`).join('') : '<span class="g-dim">開闊宙域，沒有地形影響。</span>';
}

// ───── 目前戰場 ─────
let GRD = null;     // 近地資料（太空＝null）：H 地形高度、C 最低飛行高度（含坡）、pil 柱狀障礙、rocks 球形障礙、tur 砲台
let SOLID = false;  // 有沒有實體障礙（小行星或近地）：射線、偵測要不要檢查遮蔽
const GRD_CACHE = { key: '', tex: null }, GRD_DATA = new Map();
function groundSpec() { const g = battleSetup && battleSetup.ground; return g && GROUND_SCENES[g.scene] ? g : null; }
function groundData(g) {   // 生成過的地形（保留最近幾個）
  const key = `${g.scene}:${g.seed >>> 0}`;
  let D = GRD_DATA.get(key);
  if (!D) { D = groundGen(g.scene, g.seed >>> 0); GRD_DATA.set(key, D); if (GRD_DATA.size > 4) GRD_DATA.delete(GRD_DATA.keys().next().value); }
  return D;
}
function setGround() {
  const g = groundSpec();
  if (!g) { GRD = null; U.uGrd.value.w = 0; U.uPilN.value = 0; groundSync(); return; }
  const key = `${g.scene}:${g.seed >>> 0}`, D = groundData(g);
  if (GRD_CACHE.key !== key) {
    GRD_CACHE.key = key;
    if (GRD_CACHE.tex) GRD_CACHE.tex.dispose();
    const t = new THREE.DataTexture(D.C, GROUND_N, GROUND_N, THREE.RedFormat, THREE.FloatType);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; GRD_CACHE.tex = t;
  }
  const def = g.def == null ? 1 : g.def, S = GROUND_SCENES[g.scene];
  const spots = def === 0 ? D.spotsP : def === 1 ? D.spotsN : [];
  GRD = { ...D, key, def, S, atmo: S.atmo, grav: S.grav, H: D.H.slice(), pil: D.pil.slice(), rocks: D.rocks.slice(), ms: D.ms.map((m) => ({ ...m, hpNow: m.hp, dead: false, deadT: -1 })),
    tur: spots.map((p, k) => ({ k, x: p.x, y: p.y, z: p.z, side: def, hp: TURRET_RULE.hp, cd: 1 + k * 0.37, aim: def === 1 ? 0 : Math.PI, deadT: -1 })), live: spots.length, gts: null };
  if (g.pilot) GRD.gts = groundTargetsInit(D, def);   // 駕駛模式：地面目標
  U.uGrdTex.value = GRD_CACHE.tex; U.uGrd.value.set(GROUND_EXT, GROUND_CELL, GROUND_N, 1);
  U.uPilN.value = Math.min(PIL_MAX, D.pil.length); D.pil.slice(0, PIL_MAX).forEach((p, k) => U.uPil.value[k].set(p.x, p.z, p.r, p.top));
  groundSync();
}
function gIdx(x, z) {
  let ix = Math.floor((x + GROUND_EXT) / GROUND_CELL), iz = Math.floor((z + GROUND_EXT) / GROUND_CELL);
  if (ix < 0) ix = 0; else if (ix >= GROUND_N) ix = GROUND_N - 1; if (iz < 0) iz = 0; else if (iz >= GROUND_N) iz = GROUND_N - 1;
  return iz * GROUND_N + ix;
}
function terrainHAt(x, z) { return GRD ? GRD.H[gIdx(x, z)] : -1e9; }
// 船被柱狀障礙推開、被最低飛行高度往上推（同著色器 shipWorld 的順序：柱子 → 地面）
function groundPush(out) {
  for (const p of GRD.pil) {
    const dx = out.x - p.x, dz = out.z - p.z, d2 = dx * dx + dz * dz, R = p.r + 1.5;
    if (d2 < R * R && out.y < p.top) { const d = Math.sqrt(d2) || 0.001; out.x = p.x + dx / d * R; out.z = p.z + dz / d * R; }
  }
  const h = GRD.C[gIdx(out.x, out.z)];
  if (out.y < h) out.y = h;
}
// 線段 A→B 被地形、柱狀障礙擋住的位置（0～1），沒擋住＝-1（一般建築不擋）
function groundBlock(ax, ay, az, bx, by, bz) {
  let best = 2;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const p of GRD.pil) {
    const fx = ax - p.x, fz = az - p.z, a = dx * dx + dz * dz; if (a < 1e-6) continue;
    const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - p.r * p.r, disc = b * b - 4 * a * c; if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t > 0.001 && t < 1 && t < best && ay + dy * t < p.top) best = t;
  }
  const top = GRD.maxY;
  if (!(ay > top && by > top)) {
    let t0 = 0, t1 = 1;
    if (Math.abs(dy) > 1e-6) { const tc = (top - ay) / dy; if (ay > top) t0 = Math.max(t0, tc); else if (by > top) t1 = Math.min(t1, tc); }
    t1 = Math.min(t1, best);
    if (t1 > t0) {
      const L = Math.hypot(dx, dz) * (t1 - t0), n = Math.max(2, Math.ceil(L / (GROUND_CELL * 0.7))), H = GRD.H;
      for (let k = 0; k < n; k++) {
        const t = t0 + (t1 - t0) * (k + 0.5) / n; if (t < 0.002 || t > 0.995) continue;
        if (ay + dy * t < H[gIdx(ax + dx * t, az + dz * t)]) { best = t; break; }
      }
    }
  }
  return best <= 1 ? best : -1;
}
// 大氣濃度：地面＝1，每升高 GROUND_HS 降為 1/e
function groundRho(y) { return Math.exp(-Math.max(0, y - GROUND_Y) / GROUND_HS); }
function groundHitMul(ay, by) { return 1 - GROUND_RULE.atmoHit * GRD.atmo * (groundRho(ay) + groundRho(by)) / 2; }
function groundDmgMul(ay, by) { return 1 - GROUND_RULE.atmoDmg * GRD.atmo * (groundRho(ay) + groundRho(by)) / 2; }
function groupHeavy(g) { for (const q of g.sqs) if (q.alive > 0 && (q.typeAlive[0] > 0 || q.typeAlive[1] > 0)) return true; return false; }
function gravMul(g) { return groupHeavy(g) ? 1 - GROUND_RULE.grav * GRD.grav * groundRho(g.ay || 0) : 1; }
function gravClimb(g) { return groupHeavy(g) ? 1 - GROUND_RULE.climb * GRD.grav * groundRho(g.ay || 0) : 1; }

// ───── 地面砲台 ─────
const _tq = new THREE.Vector3(), TUR_MZ = 2.5;   // 砲口高度
function turretStep(dt) {
  const t = U.uTime.value, R = TURRET_RULE;
  for (const tu of GRD.tur) {
    if (tu.hp <= 0) continue;
    tu.cd -= dt; if (tu.cd > 0) continue;
    const my = tu.y + TUR_MZ;
    let best = null, bd = 1e18;
    for (const q of squadrons) {
      if (q.side === tu.side || q.bg || q.alive <= 0 || q.hidden) continue;
      const d = (q.x - tu.x) ** 2 + ((q.y || 0) - my) ** 2 + (q.z - tu.z) ** 2, rr = R.range + Math.max(q.W || 0, q.D || 0) / 2;
      if (d < rr * rr && d < bd) { bd = d; best = q; }
    }
    if (!best) { tu.cd = 0.5; continue; }
    let target = -1;
    for (let k = 0; k < 4 && target < 0; k++) {
      const c = best.list[(rnd() * best.list.length) | 0]; if (!ships.alive[c]) continue;
      shipWorldCPU(c, _tq);
      if (Math.hypot(_tq.x - tu.x, _tq.y - my, _tq.z - tu.z) <= R.range && rockBlock(tu.x, my, tu.z, _tq.x, _tq.y, _tq.z) < 0) target = c;
    }
    if (target < 0) { tu.cd = 0.6; continue; }
    tu.cd = R.cd * (0.85 + rnd() * 0.3);
    tu.aim = Math.atan2(_tq.x - tu.x, _tq.z - tu.z);
    const p = R.acc * Math.sqrt(HIT_RULE.size[ships.type[target]]) * groundHitMul(my, _tq.y), hit = rnd() < p, fxs = GUN_FX.sec;
    if (!hit) { const off = TYPE_W[ships.type[target]] * (1 + rnd() * 1.5) * (rnd() < 0.5 ? -1 : 1); _tq.x += off; _tq.y += (rnd() - 0.3) * 30; _tq.z -= off * 0.5; }
    const L = Math.hypot(_tq.x - tu.x, _tq.y - my, _tq.z - tu.z), dur = L / (fxs.spd + rnd() * 120);
    spawnBeam(tu.x, my, tu.z, _tq.x, _tq.y, _tq.z, t, dur, tu.side, fxs.inten * 0.9, Math.min(fxs.len, 60 / L), SIDE_FAC[tu.side]);
    if (!hit) continue;
    const tq = squadrons[ships.sq[target]], asp = hitAspect(target, tu.x, tu.z, _tq.x, _tq.z, my, _tq.y);
    pending.push({ nd: R.dmg, gk: 'sec', dr: L / R.range, t: t + dur, target, side: tu.side, ff: false, dirIdx: dirIndexOf(_tq.x - tu.x, _tq.z - tu.z), asp, fm: 1, dmg: R.dmg, hm: hitMul(asp, null, tq), fx: rnd() < 0.35, x: _tq.x, y: _tq.y, z: _tq.z });
  }
}
// 戰艦要打的砲台：射程、射角內，看得到的最近一座（_a＝開火的船的位置）
function turretFor(side, attacker, gun, far) {
  let best = null, bd = far;
  for (const tu of GRD.tur) {
    if (tu.hp <= 0 || tu.side === side) continue;
    const dx = tu.x - _a.x, dy = tu.y + 1.5 - _a.y, dz = tu.z - _a.z, d = Math.hypot(dx, dy, dz);
    if (d >= bd || !inArc(attacker, gun, dx, dy, dz, d)) continue;
    if (rockBlock(_a.x, _a.y, _a.z, tu.x, tu.y + 1.5, tu.z) >= 0) continue;
    best = tu; bd = d;
  }
  return best;
}
function fireTurret(attacker, gk, gun, sq, tu, delay, dmgMul) {
  _b.set(tu.x, tu.y + 1.5, tu.z);
  const dist = Math.max(1, _a.distanceTo(_b)), fm = beamFalloff(dist, gun), am = fleetMods(sq.fleet), fxs = GUN_FX[gk];
  const hit = rnd() < TURRET_RULE.hitBy * groundHitMul(_a.y, _b.y);
  if (hit) { _b.x += (rnd() - 0.5) * 2; _b.y += rnd(); _b.z += (rnd() - 0.5) * 2; }
  else { _b.x += (rnd() - 0.5) * 16; _b.z += (rnd() - 0.5) * 16; _b.y = terrainHAt(_b.x, _b.z) + 0.3; }   // 沒打中：落在旁邊的地面（炸毀附近的建築）
  const L = _a.distanceTo(_b), dur = L / (fxs.spd + rnd() * 120), t0 = U.uTime.value + delay;
  spawnBeam(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, t0, dur, sq.side, fxs.inten * (0.4 + 0.6 * fm), Math.min(fxs.len, 60 / L), sqFac(sq));
  const gs = gunStats[sq.side][gk]; gs[0]++; if (hit) gs[1]++;
  beamLastT[sq.side] = U.uTime.value;
  pending.push(hit ? { kind: 'tu', k: tu.k, t: t0 + dur, side: sq.side, dmg: gun.dmg * dmgMul * fm * am.dmg * groundDmgMul(_a.y, _b.y), x: _b.x, y: _b.y, z: _b.z }
    : { kind: 'sp', t: t0 + dur, side: sq.side, x: _b.x, y: _b.y, z: _b.z });
  return true;
}
function turretHit(e) {
  const tu = GRD && GRD.tur[e.k]; if (!tu || tu.hp <= 0) return;
  tu.hp -= e.dmg;
  if (rnd() < 0.3) spawnFx(e.x, e.y, e.z, e.side, 1.6, 22);
  if (tu.hp > 0) return;
  tu.hp = 0; tu.deadT = U.uTime.value; GRD.live--;
  for (let k = 0; k < 3; k++) spawnFx(tu.x + (rnd() - 0.5) * 4, tu.y + 1 + rnd() * 3, tu.z + (rnd() - 0.5) * 4, tu.side, 4 + rnd() * 2, 22);
  groundScar(tu.x, tu.y, tu.z, 5);
  if (typeof toast === 'function' && GAME.phase === 'battle' && !GAME.replaying) toast(tu.side === GAME.playerSide ? '我方一座防空砲台被摧毀' : '摧毀一座敵方防空砲台', tu.side === GAME.playerSide ? 'bad' : '');
}

// ═════ 地形生成 ═════
function gHash(ix, iz, s) { let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function gNoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = gHash(ix, iz, s), b = gHash(ix + 1, iz, s), c = gHash(ix, iz + 1, s), d = gHash(ix + 1, iz + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function gFbm(x, z, s, oct = 5) { let v = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { v += a * gNoise(x, z, s + k * 17); n += a; x = x * 2.03 + 1.7; z = z * 2.03 + 9.2; a *= 0.5; } return v / n; }
function gRidge(x, z, s, oct = 5) { let v = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { const r = 1 - Math.abs(gNoise(x, z, s + k * 31) * 2 - 1); v += a * r * r; n += a; x = x * 2.1 + 3.1; z = z * 2.1 - 2.3; a *= 0.5; } return v / n; }
const gSmooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 部署區附近（雙方）：0＝遠、1＝在部署區裡（山要壓低、巨型結構避開）
function gZoneMask(x, z) {
  const inX = 1 - gSmooth(650, 800, Math.abs(x));
  const zp = gSmooth(DEPLOY_ZONE.z0 - 160, DEPLOY_ZONE.z0 - 20, z) * (1 - gSmooth(DEPLOY_ZONE.z1 + 40, DEPLOY_ZONE.z1 + 200, z));
  const zn = gSmooth(-ENEMY_ZONE.z1 - 160, -ENEMY_ZONE.z1 - 20, -z) * (1 - gSmooth(-ENEMY_ZONE.z0 + 40, -ENEMY_ZONE.z0 + 200, -z));
  return inX * Math.max(zp, zn);
}
// 合併幾何的方塊：{ x, z, w, d, h, y0, col, top, win, coll: true＝算碰撞（寫進高度格） }
function gRaster(H, b) {
  const top = b.y0 + b.h;
  let ix0 = Math.ceil((b.x - b.w / 2 + GROUND_EXT) / GROUND_CELL - 0.5), ix1 = Math.floor((b.x + b.w / 2 + GROUND_EXT) / GROUND_CELL - 0.5);
  let iz0 = Math.ceil((b.z - b.d / 2 + GROUND_EXT) / GROUND_CELL - 0.5), iz1 = Math.floor((b.z + b.d / 2 + GROUND_EXT) / GROUND_CELL - 0.5);
  if (ix0 > ix1) ix0 = ix1 = Math.floor((b.x + GROUND_EXT) / GROUND_CELL);
  if (iz0 > iz1) iz0 = iz1 = Math.floor((b.z + GROUND_EXT) / GROUND_CELL);
  for (let iz = Math.max(0, iz0); iz <= Math.min(GROUND_N - 1, iz1); iz++) for (let ix = Math.max(0, ix0); ix <= Math.min(GROUND_N - 1, ix1); ix++) { const i = iz * GROUND_N + ix; if (H[i] < top) H[i] = top; }
}
// 最低飛行高度：每一格＝max(附近格子的高度 − 坡度 × 距離) ＋ fly（兩趟掃描的倒角距離轉換），船沿山坡平順地爬升
function gRamp(H) {
  const N = GROUND_N, C = Float32Array.from(H), d = GROUND_CELL * GROUND_RULE.slope, dd = d * Math.SQRT2;
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const i = iz * N + ix; let v = C[i];
    if (ix > 0) v = Math.max(v, C[i - 1] - d);
    if (iz > 0) { v = Math.max(v, C[i - N] - d); if (ix > 0) v = Math.max(v, C[i - N - 1] - dd); if (ix < N - 1) v = Math.max(v, C[i - N + 1] - dd); }
    C[i] = v;
  }
  for (let iz = N - 1; iz >= 0; iz--) for (let ix = N - 1; ix >= 0; ix--) {
    const i = iz * N + ix; let v = C[i];
    if (ix < N - 1) v = Math.max(v, C[i + 1] - d);
    if (iz < N - 1) { v = Math.max(v, C[i + N] - d); if (ix < N - 1) v = Math.max(v, C[i + N + 1] - dd); if (ix > 0) v = Math.max(v, C[i + N - 1] - dd); }
    C[i] = v;
  }
  for (let i = 0; i < C.length; i++) C[i] += GROUND_RULE.fly;
  return C;
}
// 砲台位置：從候選點挑 n 個、彼此相距至少 gap；不夠的話從備用名單補
function gSpots(R, cands, n, gap, spare = []) {
  const out = [];
  for (const L of [cands, spare]) {
    const c = L.slice(); for (let k = c.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [c[k], c[j]] = [c[j], c[k]]; }
    for (const p of c) { if (out.length >= n) break; if (out.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > gap)) out.push(p); }
  }
  return out;
}
// 地面上隨機的砲台候選點（兩邊各一份）
function gGroundSpots(R, n, f = () => true) {
  const N = [], P = [];
  for (let k = 0; k < 400; k++) { const x = (R() - 0.5) * 1300, z = 120 + R() * 660; if (f(x, -z)) N.push({ x, y: GROUND_Y, z: -z }); if (f(x, z)) P.push({ x, y: GROUND_Y, z }); }
  return [gSpots(R, N, n, 160), gSpots(R, P, n, 160)];
}
const gCol = (r, g, b, R, j = 0.12) => { const k = 1 - j + R() * j * 2; return [r * k, g * k, b * k]; };
// 一般建築（畫面用、可被炸毀）：每一棟 10 個數字 x, z, w, d, h, y0, r, g, b, 窗戶種子
function gAdd(B, x, z, w, d, h, y0, col, win = 0) { B.a.push(x, z, w, d, h, y0, col[0], col[1], col[2], win); B.n++; }

function groundGen(scene, seed) {
  const R = mulberry32((seed ^ 0x6a09e667) >>> 0 || 1), H = new Float32Array(GROUND_N * GROUND_N).fill(GROUND_Y);
  const D = { scene, seed, boxes: [], cyl: [], domes: [], pil: [], rocks: [], ms: [], spotsN: [], spotsP: [], hf: null, far: 0, extra: {}, bld: { a: [], n: 0 }, title: GROUND_SCENES[scene].name, obst: '' };
  GROUND_GEN[scene](D, R, H);
  D.H0 = H.slice();   // 壓入碰撞箱之前的高度（巨型結構被摧毀時還原用）
  for (const b of D.boxes) if (b.coll) gRaster(H, b);
  groundTargetGen(D, H);   // 駕駛模式的地面目標（ground_pilot.js）
  D.H = H; D.C = gRamp(H);
  let m = GROUND_Y; for (let i = 0; i < H.length; i++) if (H[i] > m) m = H[i];
  D.maxY = m;
  // 砲台周圍清出空地
  const sp = [...D.spotsN, ...D.spotsP], A = D.bld.a;
  for (let i = 0; i < D.bld.n; i++) {
    const x = A[i * 10], z = A[i * 10 + 1];
    for (const p of sp) if (Math.abs(x - p.x) < 4 && Math.abs(z - p.z) < 4) { A[i * 10 + 4] = 0; break; }
    for (const c of D.clear || []) if (Math.abs(x - c.x) < c.r + A[i * 10 + 2] / 2 && Math.abs(z - c.z) < c.r + A[i * 10 + 3] / 2) { A[i * 10 + 4] = 0; break; }   // 地面目標的位置清空
  }
  D.bldArr = Float32Array.from(A); D.bld.a = null;
  return D;
}
// 巨型高塔：分段收窄的圓柱＋尖塔；碰撞＝一根柱子
function gTower(D, x, z, r, h, col, win = 0, y0 = GROUND_Y, msDef = null) {
  let y = y0;
  const ms = gMs(D, msDef || { name: '巨型高塔', hp: 1400 }, x, z, r, y0 + h);
  for (const [k, f] of [[1, 0.45], [0.72, 0.3], [0.48, 0.17], [0.16, 0.08]]) { D.cyl.push({ x, z, r: r * k, h: h * f, y0: y, col, win: k > 0.2 ? win : 0, ms }); y += h * f; }
  D.cyl.push({ x, z, r: 0.25, h: 0.5, y0: y, col, beacon: 1, ms });
  D.pil.push({ x, z, r, top: y0 + h, ms });
}
// 巨型結構（可以被摧毀）：名稱、耐久、中心、半徑、頂端高度；組成的零件（圓柱、方塊、穹頂、柱子、球形障礙）帶 ms＝編號
function gMs(D, o, x, z, r, top) { const id = D.ms.length; D.ms.push({ id, name: o.name, hp: o.hp, x, z, r, top }); return id; }
const GROUND_GEN = {
  // 都市：街區（5.5 單位≈1 公里一格），幾個市中心越高（最高約 1 公里）；4～5 座生態巨塔
  city(D, R, H) {
    const P = 4.6, B = D.bld, s = (R() * 1e6) | 0, cores = [];
    for (let k = 0; k < 200 && cores.length < 8; k++) { const x = (R() - 0.5) * 1300, z = (R() - 0.5) * 1300; if (cores.every((c) => Math.hypot(c[0] - x, c[1] - z) > 170)) cores.push([x, z, 45 + R() * 70]); }   // 高樓群（市中心、副都心）
    const tone = (k = 1) => { const t = (0.08 + R() * 0.12) * k; return [t, t * 1.02, t * 1.08]; };
    for (let gx = -150; gx <= 150; gx++) for (let gz = -150; gz <= 150; gz++) {
      // 街區沿著彎曲的道路排（座標被雜訊扭曲），城區邊緣逐漸稀疏
      const bx = gx * P, bz = gz * P, wx = bx + (gNoise(bx / 160, bz / 160, s) - 0.5) * 60, wz = bz + (gNoise(bx / 160, bz / 160, s + 7) - 0.5) * 60, rr = Math.hypot(wx, wz);
      if (rr > 540 && R() > 1 - (rr - 540) / 180) continue;
      if (gNoise(wx / 70, wz / 70, s + 3) > 0.84 || R() < 0.04) continue;   // 公園、河岸、廣場
      let core = 0; for (const [ax, az, cr] of cores) core = Math.max(core, 1 - Math.hypot(wx - ax, wz - az) / cr);
      const n = core > 0 ? 6 + Math.floor(R() * 5 * core) : 2 + Math.floor(R() * 2.4);
      for (let k = 0; k < n; k++) {
        const tall = core > 0 && R() < 0.4 + core * 0.55, big = !tall && R() < 0.15;
        const w = tall ? 0.4 + R() * 0.7 : big ? 1.2 + R() * 1.2 : 0.4 + R() * 1, d = tall ? 0.4 + R() * 0.7 : big ? 1 + R() * 1.2 : 0.4 + R() * 1;
        const ox = (R() - 0.5) * (P - w - 0.5), oz = (R() - 0.5) * (P - d - 0.5);
        const h = tall ? 0.9 + core * core * (1.5 + R() * 5) + R() * 0.8 : big ? 0.1 + R() * 0.2 : 0.1 + R() * 0.3 + (R() < 0.1 ? R() * 0.7 : 0);   // 高樓 200 公尺～1.5 公里、一般 20～80 公尺
        gAdd(B, wx + ox, wz + oz, w, d, h, GROUND_Y, tone(tall ? 0.85 : 1), tall ? 1 + R() * 50 : 0);
      }
    }
    for (const [ax, az, cr] of cores) for (let k = 0; k < 2 + Math.floor(R() * 3); k++) {   // 各高樓群中心的地標（約 2 公里）
      const a = R() * TAU, r = R() * cr * 0.25, w = 0.9 + R() * 0.6;
      gAdd(B, ax + Math.cos(a) * r, az + Math.sin(a) * r, w, w, 8 + R() * 3, GROUND_Y, tone(0.8), 1 + R() * 50);
    }
    // 生態巨塔（十幾公里高）：避開部署區、彼此相距 220 以上
    const pts = []; for (let k = 0; k < 200 && pts.length < 5; k++) { const x = (R() - 0.5) * 1100, z = (R() - 0.5) * 760; if (gZoneMask(x, z) < 0.05 && pts.every((p) => Math.hypot(p[0] - x, p[1] - z) > 220)) pts.push([x, z]); }
    for (const [x, z] of pts) gTower(D, x, z, 6 + R() * 2, 62 + R() * 22, [0.14, 0.16, 0.2], 3 + R() * 40, GROUND_Y, { name: '生態巨塔', hp: 1600 });
    [D.spotsN, D.spotsP] = gGroundSpots(R, 5);
    D.obst = `${pts.length} 座生態巨塔（約 ${gKm(62)}～${gKm(84)} 公里高，穿過艦隊平面）。`;
    D.far = 0;
  },
  // 海港：海岸線左邊是陸地；港區（貨櫃、倉庫）、城市、碼頭與船；巨型結構：兩座發射塔、三座星艦船塢、外海的巨型防波堤
  harbor(D, R, H) {
    const cf = [45, 260, 20, 97, 1.3], coast = (z) => -110 + cf[0] * Math.sin(z / cf[1]) + cf[2] * Math.sin(z / cf[3] + cf[4]), B = D.bld;
    D.extra.coastF = cf;
    for (let x = -1300; x < 0; x += 4.2) for (let z = -1300; z < 1300; z += 4.2) {
      const cx = coast(z); if (x > cx - 2) continue;
      const dc = cx - x, jx = x + (R() - 0.5) * 2, jz = z + (R() - 0.5) * 2;
      if (dc < 40) { if (R() < 0.6) for (let k = 0; k < 3; k++) gAdd(B, jx + k * 0.7 - 0.7, jz, 0.5, 1.4, 0.15 * (1 + Math.floor(R() * 3)), GROUND_Y + 0.2, gCol(...[[0.35, 0.08, 0.05], [0.05, 0.14, 0.32], [0.3, 0.24, 0.05], [0.07, 0.24, 0.12], [0.25, 0.25, 0.27]][Math.floor(R() * 5)], R)); }   // 貨櫃堆場
      else if (dc < 160) { if (R() < 0.6) gAdd(B, jx, jz, 2.2 + R() * 1.2, 1.4 + R(), 0.3 + R() * 0.3, GROUND_Y + 0.2, gCol(0.2, 0.19, 0.17, R)); }   // 倉庫
      else if (R() < 0.8 * (1 - gSmooth(800, 1300, -x))) { const t = 0.08 + R() * 0.06, down = gSmooth(160, 500, dc) * (1 - gSmooth(600, 1000, dc)); gAdd(B, jx, jz, 1.2 + R(), 1.2 + R(), 0.25 + R() * 0.6 + down * R() * 2.5, GROUND_Y + 0.2, [t, t * 1.05, t * 1.2], 1 + R() * 50); }   // 城市
    }
    // 碼頭與港內的船（海船約 300～400 公尺＝1.5～2 單位）
    for (let z = -1300; z <= 1300; z += 18 + R() * 14) {
      const cx = coast(z), L = 8 + R() * 10;
      D.boxes.push({ x: cx + L / 2 - 1, z, w: L, d: 1.2, h: 0.4, y0: GROUND_Y, col: [0.15, 0.14, 0.13] });
      if (R() < 0.7) gAdd(B, cx + 2 + R() * (L - 4), z + (R() < 0.5 ? -1.3 : 1.3), 1.6 + R() * 0.6, 0.35, 0.35, GROUND_Y - 0.1, gCol(0.14, 0.06, 0.05, R));
    }
    for (let k = 0; k < 60; k++) gAdd(B, coast(0) + 60 + R() * 900, (R() - 0.5) * 2600, 1.4 + R() * 0.8, 0.3, 0.3, GROUND_Y - 0.1, gCol(0.16, 0.16, 0.17, R));   // 海上的船
    // 星艦船塢：海上的巨型乾塢（約 5 公里長），四角是龍門塔
    for (const z of [-480, 40, 520].map((v) => v + (R() - 0.5) * 120)) {
      const x = coast(z) + 34, ms = gMs(D, { name: '星艦船塢', hp: 1000 }, x, z, 13, GROUND_Y + 26);
      D.boxes.push({ x, z: z - 7, w: 26, d: 2, h: 3, y0: GROUND_Y, col: [0.22, 0.22, 0.24], ms });
      D.boxes.push({ x, z: z + 7, w: 26, d: 2, h: 3, y0: GROUND_Y, col: [0.22, 0.22, 0.24], ms });
      D.boxes.push({ x: x + 13, z, w: 2, d: 16, h: 3, y0: GROUND_Y, col: [0.22, 0.22, 0.24], ms });
      D.boxes.push({ x: x - 3, z, w: 18, d: 4.5, h: 2.4, y0: GROUND_Y + 0.4, col: [0.25, 0.27, 0.3], win: 7, ms });   // 船塢裡的星艦
      for (const ox of [-9, 9]) { D.cyl.push({ x: x + ox, z: z - 9, r: 1.6, h: 24, y0: GROUND_Y, col: [0.5, 0.3, 0.1], ms }); D.cyl.push({ x: x + ox, z: z + 9, r: 1.6, h: 24, y0: GROUND_Y, col: [0.5, 0.3, 0.1], ms }); D.boxes.push({ x: x + ox, z, w: 2.4, d: 20, h: 2, y0: GROUND_Y + 24, col: [0.55, 0.32, 0.1], ms }); }
      D.pil.push({ x, z, r: 13, top: GROUND_Y + 26, ms });
    }
    // 兩座發射塔（約 14 公里高）
    for (const z of [-200 + (R() - 0.5) * 100, 300 + (R() - 0.5) * 100]) gTower(D, coast(z) - 70, z, 5.5, 68 + R() * 10, [0.3, 0.3, 0.33], 11, GROUND_Y, { name: '發射塔', hp: 1400 });
    // 外海的巨型防波堤（約 2 公里高，中間有缺口）
    const bx = 330 + R() * 120;
    const walls = [[-1400, -150], [10, 1400]].map(([z0, z1]) => { const ms = gMs(D, { name: '巨型防波堤', hp: 1200 }, bx, (z0 + z1) / 2, 4, GROUND_Y + 10); D.boxes.push({ x: bx, z: (z0 + z1) / 2, w: 8, d: z1 - z0, h: 10, y0: GROUND_Y, col: [0.2, 0.19, 0.18], coll: true, ms }); return ms; });
    D.cyl.push({ x: bx, z: -160, r: 1.5, h: 9, y0: GROUND_Y + 10, col: [0.55, 0.52, 0.5], beacon: 2, ms: walls[0] });
    [D.spotsN, D.spotsP] = gGroundSpots(R, 5, (x, z) => x < coast(z) - 10 && x > coast(z) - 300);
    if (D.spotsN.length < 5) D.spotsN.push({ x: bx, y: GROUND_Y + 10, z: -500 });
    if (D.spotsP.length < 5) D.spotsP.push({ x: bx, y: GROUND_Y + 10, z: 500 });
    D.obst = `兩座發射塔（約 ${gKm(70)} 公里高，穿過艦隊平面）；三座星艦船塢的龍門架（約 ${gKm(26)} 公里高）與外海的巨型防波堤（約 2 公里高），只擋低空飛行。`;
    D.far = 1;
  },
  // 軍事基地：平原上散布好幾座機場與營區；三座行星防禦砲塔、一座護盾產生器
  base(D, R, H) {
    const B = D.bld, sites = [];
    for (let k = 0; k < 600 && sites.length < 16; k++) { const x = (R() - 0.5) * 2000, z = (R() - 0.5) * 2000; if (sites.every((s) => Math.hypot(s[0] - x, s[1] - z) > 240)) sites.push([x, z]); }
    D.extra.sites = sites;
    for (const [sx, sz] of sites) {
      const a = R() < 0.5 ? 0 : 1;   // 跑道方向（a＝1：沿 x）
      D.boxes.push({ x: sx, z: sz, w: 84 + R() * 20, d: 84 + R() * 20, h: 0.02, y0: GROUND_Y, col: gCol(0.2, 0.2, 0.19, R, 0.06) });   // 基地的鋪面
      for (const o of [-6, 6]) D.boxes.push({ x: sx + (a ? 0 : o), z: sz + (a ? o : 0), w: a ? 30 : 1.2, d: a ? 1.2 : 30, h: 0.08, y0: GROUND_Y, col: [0.06, 0.06, 0.065] });   // 跑道（約 6 公里）
      for (let k = 0; k < 320; k++) {   // 機庫、營舍、油槽、雷達
        const x = sx + (R() - 0.5) * 80, z = sz + (R() - 0.5) * 80; if (Math.abs(a ? z - sz : x - sx) < 8) continue;
        const r = R();
        if (r < 0.3) gAdd(B, x, z, 1 + R() * 0.6, 0.7, 0.25, GROUND_Y, gCol(0.15, 0.16, 0.13, R));
        else if (r < 0.75) gAdd(B, x, z, 0.8 + R() * 0.8, 0.35, 0.12 + R() * 0.15, GROUND_Y, gCol(0.18, 0.17, 0.14, R), 6);
        else if (r < 0.95) gAdd(B, x, z, 0.4, 0.4, 0.2, GROUND_Y, [0.45, 0.45, 0.42]);
        else gAdd(B, x, z, 0.3, 0.3, 1 + R() * 2, GROUND_Y, [0.35, 0.33, 0.3]);
      }
      D.domes.push({ x: sx + 14, z: sz - 14, r: 0.8, y0: GROUND_Y, col: [0.62, 0.62, 0.6] });
    }
    // 行星防禦砲塔（約 12 公里高）：巨大的塔身＋砲管
    const pts = []; for (let k = 0; k < 200 && pts.length < 3; k++) { const x = (R() - 0.5) * 1000, z = (R() - 0.5) * 600; if (gZoneMask(x, z) < 0.05 && pts.every((p) => Math.hypot(p[0] - x, p[1] - z) > 300)) pts.push([x, z]); }
    for (const [x, z] of pts) {
      const ms = gMs(D, { name: '行星防禦砲塔', hp: 1600 }, x, z, 7, GROUND_Y + 58);
      D.cyl.push({ x, z, r: 7, h: 6, y0: GROUND_Y, col: [0.2, 0.2, 0.2], ms });
      D.cyl.push({ x, z, r: 4.5, h: 46, y0: GROUND_Y + 6, col: [0.34, 0.35, 0.33], win: 5, ms });
      D.domes.push({ x, z, r: 6, y0: GROUND_Y + 52, col: [0.3, 0.31, 0.3], ms });
      D.boxes.push({ x, z: z + (z > 0 ? -10 : 10), w: 1.6, d: 20, h: 1.6, y0: GROUND_Y + 55, col: [0.18, 0.18, 0.18], ms });
      D.pil.push({ x, z, r: 7, top: GROUND_Y + 58, ms });
    }
    // 護盾產生器：半球（約 4 公里高）
    const gx = (R() - 0.5) * 400, gz = (R() - 0.5) * 200;
    const gms = gMs(D, { name: '護盾產生器', hp: 1800 }, gx, gz, 20, GROUND_Y + 20);
    D.domes.push({ x: gx, z: gz, r: 20, y0: GROUND_Y, col: [0.3, 0.4, 0.5], ms: gms }); D.rocks.push({ x: gx, y: GROUND_Y, z: gz, r: 20, ms: gms });
    D.cyl.push({ x: gx, z: gz, r: 0.6, h: 6, y0: GROUND_Y + 20, col: [0.5, 0.6, 0.7], beacon: 2, ms: gms });
    const near = sites.map(([x, z]) => ({ x: x + (R() - 0.5) * 40, y: GROUND_Y, z: z + (R() - 0.5) * 40 })).filter((p) => Math.abs(p.x) < 750 && Math.abs(p.z) > 100 && Math.abs(p.z) < 820);
    const [gn, gp] = gGroundSpots(R, 8);
    D.spotsN = gSpots(R, near.filter((p) => p.z < 0), 8, 140, gn); D.spotsP = gSpots(R, near.filter((p) => p.z > 0), 8, 140, gp);
    D.obst = `三座行星防禦砲塔（約 ${gKm(58)} 公里高，穿過艦隊平面）與護盾產生器的穹頂（約 ${gKm(20)} 公里高）。`;
    D.far = 2;
  },
  // 軌道電梯：基座（約 6 公里見方），纜繩直通太空；中繼平台在約 34 公里高（球形障礙）；周圍是工業設施
  elevator(D, R, H) {
    const X = 0, Z = -120, C = [0.16, 0.16, 0.18], B = D.bld, PY = 120, ms = gMs(D, { name: '軌道電梯', hp: 2500 }, X, Z, 16, PY + 8);
    D.boxes.push({ x: X, z: Z, w: 32, d: 32, h: 3, y0: GROUND_Y, col: C, win: 7, top: [0.13, 0.13, 0.15], coll: true, ms });
    D.boxes.push({ x: X, z: Z, w: 20, d: 20, h: 5, y0: GROUND_Y + 3, col: [0.2, 0.21, 0.24], win: 9, top: [0.15, 0.15, 0.17], coll: true, ms });
    D.boxes.push({ x: X, z: Z, w: 9, d: 9, h: 6, y0: GROUND_Y + 8, col: [0.24, 0.25, 0.28], win: 11, top: [0.18, 0.18, 0.2], coll: true, ms });
    D.pil.push({ x: X, z: Z, r: 4, top: 6000, ms });
    D.extra.tether = { x: X, z: Z, y0: GROUND_Y + 14, plat: PY, ms };
    D.rocks.push({ x: X, y: PY, z: Z, r: 16, ms });
    for (let k = 0; k < 1400; k++) {   // 工業設施、倉庫、宿舍
      const a = R() * TAU, r = 22 + Math.pow(R(), 1.6) * 700, x = X + Math.cos(a) * r, z = Z + Math.sin(a) * r;
      gAdd(B, x, z, 0.6 + R() * 1.6, 0.5 + R() * 1.2, 0.2 + R() * 0.8, GROUND_Y, gCol(0.15, 0.14, 0.13, R), R() < 0.5 ? 1 + R() * 40 : 0);
    }
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; D.cyl.push({ x: X + Math.cos(a) * 24, z: Z + Math.sin(a) * 24, r: 1, h: 10, y0: GROUND_Y, col: [0.35, 0.36, 0.4], beacon: k % 2 ? 0 : 1, ms }); }
    const cN = [], cP = [];
    for (const [dx, dz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) (dz < 0 ? cN : cP).push({ x: X + dx, y: GROUND_Y + 3, z: Z + dz });
    cN.push({ x: X - 15, y: PY + 2, z: Z - 12 }); cP.push({ x: X + 15, y: PY + 2, z: Z + 12 });   // 平台上（在球形障礙外面）
    const [gn, gp] = gGroundSpots(R, 6, (x, z) => Math.hypot(x - X, z - Z) < 500);
    D.spotsN = gSpots(R, cN, 6, 10, gn); D.spotsP = gSpots(R, cP, 6, 10, gp);
    D.obst = `電梯纜繩（直通太空，只能繞過）、基座（約 ${gKm(14)} 公里高）與約 ${gKm(PY - GROUND_Y)} 公里高的中繼平台。`;
    D.far = 3;
  },
  // 群山：地球級山脈（最高約 9 公里）或異星巨山（數十公里）；山谷裡有小鎮
  mountain(D, R, H) {
    const alien = R() < 0.5, A = alien ? 200 : 40, s = (R() * 1e6) | 0, vx = R() * 400 - 200;
    const peaks = alien ? [[-360 + R() * 80, -120 + R() * 140, 170 + R() * 50], [330 + R() * 80, 60 + R() * 140, 160 + R() * 60], [R() * 200 - 100, -420 + R() * 80, 120]] : [[-300 + R() * 200, -100 + R() * 200, 12], [200 + R() * 200, R() * 300 - 150, 10]];
    const cap = alien ? 20 : 12, pw = alien ? 150 : 110;
    const fn = (x, z) => {
      let h = Math.pow(gRidge(x / 760, z / 760, s), 1.5) * A * 0.75 + gFbm(x / 260, z / 260, s + 99, 4) * A * 0.25;
      const v = Math.abs(x - vx - 220 * Math.sin(z / 380));
      h *= 0.2 + 0.8 * gSmooth(40, 300, v);   // 山谷
      for (const [px, pz, a] of peaks) h += a * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (2 * pw * pw));
      const m = gZoneMask(x, z); h = h * (1 - m) + Math.min(h, cap) * m;
      return h;
    };
    const N1 = GROUND_N + 1, hf = new Float32Array(N1 * N1);
    for (let iz = 0; iz <= GROUND_N; iz++) for (let ix = 0; ix <= GROUND_N; ix++) hf[iz * N1 + ix] = fn(-GROUND_EXT + ix * GROUND_CELL, -GROUND_EXT + iz * GROUND_CELL);
    for (let iz = 0; iz < GROUND_N; iz++) for (let ix = 0; ix < GROUND_N; ix++) { const i = iz * N1 + ix; H[iz * GROUND_N + ix] = GROUND_Y + Math.max(hf[i], hf[i + 1], hf[i + N1], hf[i + N1 + 1]); }
    D.hf = hf; D.extra = { alien, A, snow: alien ? 110 : 26 };
    // 山谷裡的小鎮
    const B = D.bld;
    for (let t = 0; t < 40; t++) {
      const tx = (R() - 0.5) * 2400, tz = (R() - 0.5) * 2400; if (fn(tx, tz) > A * 0.25) continue;
      for (let k = 0; k < 40; k++) { const x = tx + (R() - 0.5) * 14, z = tz + (R() - 0.5) * 14; gAdd(B, x, z, 0.3 + R() * 0.5, 0.3 + R() * 0.5, 0.1 + R() * 0.25, GROUND_Y + fn(x, z) - 0.05, gCol(0.2, 0.17, 0.14, R), 1 + R() * 40); }
    }
    // 砲台：山頂、山脊（附近 ±2 格裡最高）；不夠就用任何地方
    const cand = [], spare = [];
    for (let iz = 3; iz < GROUND_N - 3; iz += 2) for (let ix = 3; ix < GROUND_N - 3; ix += 2) {
      const x = -GROUND_EXT + (ix + 0.5) * GROUND_CELL, z = -GROUND_EXT + (iz + 0.5) * GROUND_CELL, h = H[iz * GROUND_N + ix] - GROUND_Y;
      if (Math.abs(x) > 700 || Math.abs(z) < 100 || Math.abs(z) > 800) continue;
      let top = true; for (let a = -2; a <= 2 && top; a++) for (let b = -2; b <= 2; b++) if (H[(iz + a) * GROUND_N + ix + b] > H[iz * GROUND_N + ix] + 0.01) { top = false; break; }
      (top && h > A * 0.2 ? cand : spare).push({ x, y: H[iz * GROUND_N + ix], z });
    }
    D.spotsN = gSpots(R, cand.filter((p) => p.z < 0), 4, 200, spare.filter((p) => p.z < 0)); D.spotsP = gSpots(R, cand.filter((p) => p.z > 0), 4, 200, spare.filter((p) => p.z > 0));
    let mx = 0; for (let i = 0; i < hf.length; i++) mx = Math.max(mx, hf[i]);
    D.title = alien ? '群山（異星巨山）' : '群山（地球級山脈）';
    D.obst = alien ? `山峰最高約 ${gKm(mx)} 公里，好幾座主峰穿過艦隊平面；山是實體障礙，可以繞到山後面躲避射擊。` : `山峰最高約 ${gKm(mx)} 公里，比艦隊平面低；要降到低空才會被山擋住、拿山當掩護。`;
    D.far = 4;
  },
};

// ═════ 畫面 ═════
const GV = { key: '', group: null, sky: null, mats: [], tur: [], climb: [], defKey: '', bld: null, scars: null };
const GFOG_NEAR = { value: 0 };   // 霧從鏡頭前多遠開始算（＝鏡頭到注視點的距離，2D 遠景鏡頭才不會整片灰）
const GROUND_VS = /* glsl */`
  attribute vec3 color; attribute float aWin;
  varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vWin;
  void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vC = color; vWin = aWin; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FOG_GLSL = /* glsl */`
  uniform vec3 uFogCol; uniform float uFogD; uniform float uFogNear; uniform vec3 uSun; uniform vec3 uLSun; uniform vec3 uAmb;
  float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
  uniform float uHaze;
  vec3 fogMix(vec3 col, vec3 w){
    float d = max(0., distance(w, cameraPosition) - uFogNear), f = 1. - exp(-d * uFogD);
    float hz = exp(-max(0., w.y - float(${GROUND_Y})) / 7.) * uHaze * (1. - exp(-(d + 40.) * uFogD * 5.)) * (.75 + .5 * gn(w.xz / 90.));   // 貼地的霧
    return mix(col, uFogCol, clamp(f + hz * (1. - f), 0., 1.)); }`;
function gUni(P, extra = {}) {
  return { uFogCol: { value: new THREE.Vector3(...(P.fogC || P.hor)) }, uFogD: { value: P.fog }, uFogNear: GFOG_NEAR, uSun: { value: new THREE.Vector3(...P.sun).normalize() }, uLSun: { value: new THREE.Vector3(...P.lSun) },
    uAmb: { value: new THREE.Vector3(...P.amb) }, uHaze: { value: P.haze != null ? P.haze : 0.25 }, uTime: U.uTime, ...extra };
}
// 巨型結構、碼頭等合併幾何用的材質（窗戶：依世界座標畫細格子，一部分亮燈）
function groundMat(P) {
  const m = new THREE.ShaderMaterial({
    uniforms: gUni(P, { uWinCol: { value: new THREE.Vector3(...P.win) }, uWinK: { value: P.winK }, uDim: { value: 1 } }),
    vertexShader: GROUND_VS, side: THREE.DoubleSide,
    fragmentShader: GROUND_FOG_GLSL + /* glsl */`
      uniform vec3 uWinCol; uniform float uWinK; uniform float uDim;
      varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vWin;
      void main(){
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        float dif = max(dot(N, uSun), 0.);
        vec3 col = vC * (uAmb + uLSun * dif) * uDim;
        if (vWin > 0.5 && abs(N.y) < 0.3) {
          vec2 g = vec2((abs(N.x) > 0.5 ? vW.z : vW.x) / 0.8, vW.y / 0.6), id = floor(g), f = fract(g);
          float win = step(.2, f.x) * step(f.x, .8) * step(.3, f.y) * step(f.y, .75);
          float lit = step(1. - uWinK, gh(id + floor(vWin) * 7.31));
          col += uWinCol * win * lit * (.25 + .35 * gh(id + 3.1)) * uDim;
        }
        gl_FragColor = vec4(fogMix(col, vW), 1.);
      }`,
  });
  GV.mats.push(m);
  return m;
}
// 一般建築（實例化的方塊）：被炸毀時往下塌、燒一陣子、變成瓦礫
function groundBldMesh(P, D) {
  const n = D.bldArr.length / 10; if (!n) return null;
  const base = new THREE.BoxGeometry(1, 1, 1); base.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('normal', base.attributes.normal);
  const A = D.bldArr, iA = new Float32Array(n * 4), iB = new Float32Array(n * 4), iC = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 10;
    iA[i * 4] = A[o]; iA[i * 4 + 1] = A[o + 1]; iA[i * 4 + 2] = A[o + 2]; iA[i * 4 + 3] = A[o + 3];
    iB[i * 4] = A[o + 4]; iB[i * 4 + 1] = A[o + 6]; iB[i * 4 + 2] = A[o + 7]; iB[i * 4 + 3] = A[o + 8];
    iC[i * 4] = A[o + 9]; iC[i * 4 + 1] = -1; iC[i * 4 + 2] = A[o + 5];
  }
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4)); g.setAttribute('iB', new THREE.InstancedBufferAttribute(iB, 4));
  const ic = new THREE.InstancedBufferAttribute(iC, 4); ic.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iC', ic);
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    uniforms: gUni(P, { uWinCol: { value: new THREE.Vector3(...P.win) }, uWinK: { value: P.winK } }),
    vertexShader: /* glsl */`
      attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; uniform float uTime;
      varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vWin; varying float vBurn; varying float vTop;
      void main(){
        float h = iB.x, dt = iC.y >= 0. ? uTime - iC.y : -1.;
        vBurn = 0.;
        if (dt >= 0.) { h *= mix(1., .12, clamp(dt * 1.2, 0., 1.)); vBurn = clamp(1. - (dt - 1.) / 25., 0., 1.); }
        if (iB.x <= 0.) { gl_Position = vec4(2., 2., 2., 1.); return; }
        vec3 w = vec3(iA.x + position.x * iA.z, iC.z + position.y * max(h, .02), iA.y + position.z * iA.w);
        vW = w; vN = normal; vC = dt >= 0. ? iB.yzw * .35 : iB.yzw; vWin = dt >= 0. ? 0. : iC.x; vTop = position.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
      }`,
    fragmentShader: GROUND_FOG_GLSL + /* glsl */`
      uniform vec3 uWinCol; uniform float uWinK; uniform float uTime;
      varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vWin; varying float vBurn; varying float vTop;
      void main(){
        vec3 N = normalize(vN), col = vC * (uAmb + uLSun * max(dot(N, uSun), 0.));
        col *= N.y > .5 ? .8 + .45 * gh(floor(vW.xz * 1.7)) : mix(.5, 1., vTop);   // 屋頂深淺不一、牆腳較暗
        if (vWin > 0.5) {   // 夜晚的燈：側面一層一層亮，屋頂暗
          float lit = step(1. - uWinK, gh(vec2(floor(vWin), floor(vW.y / .12))));
          col += uWinCol * (abs(N.y) < .5 ? lit * (.12 + .16 * gh(vec2(vWin, 3.))) : .02);
        }
        if (vBurn > 0.) col += vec3(1., .42, .12) * vBurn * (.6 + .4 * sin(uTime * 9. + vW.x * 3. + vW.z * 2.)) * (1. - vTop * .5);   // 燃燒中
        gl_FragColor = vec4(fogMix(col, vW), 1.);
      }`,
  });
  GV.mats.push(m);
  let top = GROUND_Y; for (let i = 0; i < n; i++) top = Math.max(top, iC[i * 4 + 2] + iB[i * 4]); GV.bldTop = top;
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
  // 空間索引（炸毀時找附近的建築）：每 10 單位一格
  const idx = new Map();
  for (let i = 0; i < n; i++) { const k = Math.floor(iA[i * 4] / 10) * 4099 + Math.floor(iA[i * 4 + 1] / 10); let a = idx.get(k); if (!a) idx.set(k, (a = [])); a.push(i); }
  GV.bld = { mesh, iA, iB, ic, idx, dirty: [] };
  return mesh;
}
// 地面的彈坑、焦痕（平貼地面的圓，最多 SCAR_MAX 個，舊的被新的取代）
const SCAR_MAX = 2000;
function groundScarMesh(P) {
  const q = new THREE.PlaneGeometry(2, 2); q.rotateX(-Math.PI / 2);
  const g = new THREE.InstancedBufferGeometry(); g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  const s = new THREE.InstancedBufferAttribute(new Float32Array(SCAR_MAX * 4), 4); s.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iS', s);
  const y = new THREE.InstancedBufferAttribute(new Float32Array(SCAR_MAX), 1); y.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iY', y);
  g.instanceCount = SCAR_MAX;
  const m = new THREE.ShaderMaterial({
    uniforms: gUni(P), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    vertexShader: `attribute vec4 iS; attribute float iY; uniform float uTime; varying vec2 vUv; varying float vAge; varying vec3 vW;
      void main(){ vUv = uv; vAge = iS.z > 0. ? uTime - iS.w : -1.; vec3 w = vec3(iS.x + position.x * iS.z, iY + .3, iS.y + position.z * iS.z); vW = w; gl_Position = iS.z > 0. ? projectionMatrix * viewMatrix * vec4(w, 1.) : vec4(2., 2., 2., 1.); }`,
    fragmentShader: GROUND_FOG_GLSL + /* glsl */`uniform float uTime; varying vec2 vUv; varying float vAge; varying vec3 vW;
      void main(){ float d = length(vUv - .5) * 2.; if (d > 1. || vAge < 0.) discard;
        float n = gn(vW.xz * 1.7) * .35; float a = smoothstep(1., .55 - n, d) * .85;
        vec3 col = vec3(.02, .018, .016) + vec3(1., .35, .08) * smoothstep(.75, .95, d + n * .5) * clamp(1. - vAge / 20., 0., 1.) * (.5 + .5 * sin(uTime * 7. + vW.x * 5.));
        gl_FragColor = vec4(fogMix(col, vW), a); }`,
  });
  GV.mats.push(m);
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1;
  GV.scars = { mesh, s, y, head: 0, dirty: false };
  return mesh;
}
// 炸毀地面上 (x, z) 半徑 r 內的建築、留下焦痕（只是畫面；由命中結算呼叫，回放也會重現）
function groundScar(x, y, z, r = 2) {
  if (!GRD || GV.key !== GRD.key) return;
  const gy = terrainHAt(x, z), low = y <= gy + 4;   // 焦痕只畫在地面附近
  const B = GV.bld, t = U.uTime.value;
  if (B && y <= GV.bldTop + r) {
    for (let a = Math.floor((x - r) / 10); a <= Math.floor((x + r) / 10); a++) for (let b = Math.floor((z - r) / 10); b <= Math.floor((z + r) / 10); b++) {
      const L = B.idx.get(a * 4099 + b); if (!L) continue;
      for (const i of L) {
        if (B.ic.array[i * 4 + 1] >= 0 || B.iB[i * 4] <= 0) continue;
        const y0 = B.ic.array[i * 4 + 2]; if (y > y0 + B.iB[i * 4] + r || y < y0 - r) continue;   // 爆炸不在這棟建築的高度範圍內
        const dx = Math.max(0, Math.abs(B.iA[i * 4] - x) - B.iA[i * 4 + 2] / 2), dz = Math.max(0, Math.abs(B.iA[i * 4 + 1] - z) - B.iA[i * 4 + 3] / 2);
        if (dx * dx + dz * dz <= r * r) { B.ic.array[i * 4 + 1] = t; B.dirty.push(i); }
      }
    }
  }
  const S = GV.scars;
  if (S && low) { const k = S.head; S.head = (S.head + 1) % SCAR_MAX; S.s.array[k * 4] = x; S.s.array[k * 4 + 1] = z; S.s.array[k * 4 + 2] = r * 1.2; S.s.array[k * 4 + 3] = t; S.y.array[k] = gy; S.dirty = true; }
}
// 直接炸毀某一棟建築（武器打到它）；回傳有沒有炸掉
function groundBldKill(i) {
  const B = GV.bld; if (!B || !GRD || GV.key !== GRD.key || B.ic.array[i * 4 + 1] >= 0 || B.iB[i * 4] <= 0) return false;
  B.ic.array[i * 4 + 1] = U.uTime.value; B.dirty.push(i); return true;
}
// (x, z) 半徑 r 內、高度範圍跟 [y0, y1] 重疊、還沒倒的建築：f(編號, 頂端高度)
function groundBldEach(x, z, r, y0, y1, f) {
  const B = GV.bld; if (!B || !GRD || GV.key !== GRD.key || y0 > GV.bldTop) return;
  for (let a = Math.floor((x - r - 3) / 10); a <= Math.floor((x + r + 3) / 10); a++) for (let b = Math.floor((z - r - 3) / 10); b <= Math.floor((z + r + 3) / 10); b++) {
    const L = B.idx.get(a * 4099 + b); if (!L) continue;
    for (const i of L) {
      if (B.ic.array[i * 4 + 1] >= 0 || B.iB[i * 4] <= 0) continue;
      const by = B.ic.array[i * 4 + 2], top = by + B.iB[i * 4]; if (top < y0 || by > y1) continue;
      const dx = Math.max(0, Math.abs(B.iA[i * 4] - x) - B.iA[i * 4 + 2] / 2), dz = Math.max(0, Math.abs(B.iA[i * 4 + 1] - z) - B.iA[i * 4 + 3] / 2);
      if (dx * dx + dz * dz <= r * r) f(i, top);
    }
  }
}
// ═════ 巨型結構：耐久、被摧毀（倒塌、移除碰撞與遮蔽） ═════
// 射線最先碰到的巨型結構（柱子＝直立圓柱、碰撞箱＝方塊、球形障礙＝球）：{ s, id }，沒有＝null
function groundMsRay(ox, oy, oz, D, maxS) {
  if (!GRD || !GRD.ms || !GRD.ms.length) return null;
  let best = maxS, id = -1;
  for (const p of GRD.pil) {
    if (p.ms == null) continue;
    const fx = ox - p.x, fz = oz - p.z, a = D[0] * D[0] + D[2] * D[2]; if (a < 1e-9) continue;
    const b = 2 * (fx * D[0] + fz * D[2]), c = fx * fx + fz * fz - p.r * p.r, disc = b * b - 4 * a * c; if (disc < 0) continue;
    const s = (-b - Math.sqrt(disc)) / (2 * a); if (s <= 0 || s >= best) continue;
    const y = oy + D[1] * s; if (y < GROUND_Y - 1 || y > p.top) continue;
    best = s; id = p.ms;
  }
  for (const b of GRD.boxes) {
    if (!b.coll || b.ms == null || GRD.ms[b.ms].dead) continue;
    let t0 = 0, t1 = best;
    for (const [o, d, lo, hi] of [[ox, D[0], b.x - b.w / 2, b.x + b.w / 2], [oy, D[1], b.y0, b.y0 + b.h], [oz, D[2], b.z - b.d / 2, b.z + b.d / 2]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 1; t1 = 0; } continue; }
      let a1 = (lo - o) / d, a2 = (hi - o) / d; if (a1 > a2) [a1, a2] = [a2, a1];
      t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
    }
    if (t0 <= t1 && t0 > 0 && t0 < best) { best = t0; id = b.ms; }
  }
  for (const r of GRD.rocks) {
    if (r.ms == null) continue;
    const qx = ox - r.x, qy = oy - r.y, qz = oz - r.z, b = qx * D[0] + qy * D[1] + qz * D[2], c = qx * qx + qy * qy + qz * qz - r.r * r.r, disc = b * b - c; if (disc < 0) continue;
    const s = -b - Math.sqrt(disc); if (s > 0 && s < best) { best = s; id = r.ms; }
  }
  return id >= 0 ? { s: best, id } : null;
}
// 巨型結構上離 (x, y, z) 最近的一點（飛彈、鎖定用）
function groundMsPoint(id, x, y, z, out) {
  let bd = 1e18;
  const put = (px, py, pz) => { const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; out.set(px, py, pz); } };
  for (const p of GRD.pil) if (p.ms === id) { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; put(p.x + dx / d * p.r, Math.max(GROUND_Y + 1, Math.min(Math.min(p.top, GROUND_Y + 80) - 1, y)), p.z + dz / d * p.r); }
  for (const b of GRD.boxes) if (b.coll && b.ms === id) put(Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, x)), Math.max(b.y0, Math.min(b.y0 + b.h, y)), Math.max(b.z - b.d / 2, Math.min(b.z + b.d / 2, z)));
  for (const r of GRD.rocks) if (r.ms === id) { const dx = x - r.x, dy = y - r.y, dz = z - r.z, d = Math.hypot(dx, dy, dz) || 1; put(r.x + dx / d * r.r, r.y + dy / d * r.r, r.z + dz / d * r.r); }
  if (bd > 1e17) { const M = GRD.ms[id]; out.set(M.x, Math.min(M.top, y), M.z); }
  return out;
}
// 打中巨型結構（processHits 的 'ms'）
function groundMsHit(e) {
  const M = GRD && GRD.ms && GRD.ms[e.id]; if (!M || M.dead) return;
  M.hpNow -= e.dmg;
  if (Math.random() < 0.5) spawnFx(e.x, e.y, e.z, e.side, 2 + Math.random() * 1.5, 22);
  const kill = M.hpNow <= 0;
  if (kill) groundMsKill(M, e.side);
  if (typeof CAP !== 'undefined' && CAP.on) capCreditMs(M, e.dmg, kill);
}
function groundMsKill(M, side) {
  const t = U.uTime.value;
  M.dead = true; M.hpNow = 0; M.deadT = t;
  // 碰撞、遮蔽：柱子、球形障礙拿掉，碰撞箱壓入的高度還原
  GRD.pil = GRD.pil.filter((p) => p.ms !== M.id);
  U.uPilN.value = Math.min(PIL_MAX, GRD.pil.length); GRD.pil.slice(0, PIL_MAX).forEach((p, k) => U.uPil.value[k].set(p.x, p.z, p.r, p.top));
  GRD.rocks = GRD.rocks.filter((r) => r.ms !== M.id); ROCKS = ROCKS.filter((r) => r.ms == null || r.ms !== M.id);
  U.uRockN.value = ROCKS.length; ROCKS.forEach((r, k) => U.uRock.value[k].set(r.x, r.y, r.z, r.r)); SOLID = ROCKS.length > 0 || !!GRD;
  const dead = GRD.boxes.filter((b) => b.coll && b.ms === M.id);
  if (dead.length) {
    for (const b of dead) gRasterCells(b, (i) => (GRD.H[i] = GRD.H0[i]));
    for (const b of GRD.boxes) if (b.coll && !(b.ms != null && GRD.ms[b.ms].dead)) gRaster(GRD.H, b);
  }
  // 畫面：沿著高度一連串爆炸、濃煙、周圍的建築被壓垮
  const h = Math.min(M.top - GROUND_Y, 70);
  for (let k = 0; k < 14; k++) spawnFx(M.x + (Math.random() - 0.5) * M.r * 1.6, GROUND_Y + h * Math.random(), M.z + (Math.random() - 0.5) * M.r * 1.6, side, 5 + Math.random() * 6, 16 + Math.random() * 8);
  groundPlume(M.x, M.z, t, 200, Math.max(10, M.r * 1.4), 2);
  groundScar(M.x, GROUND_Y, M.z, M.r * 1.8);
  if (GV.beacons) { const a = GV.beacons.pts.geometry.attributes.position; GV.beacons.list.forEach((b, k) => { if (b.ms === M.id) a.setY(k, -1e4); }); a.needsUpdate = true; }
}
// 照碰撞箱的範圍走過每一格（同 gRaster）
function gRasterCells(b, f) {
  let ix0 = Math.ceil((b.x - b.w / 2 + GROUND_EXT) / GROUND_CELL - 0.5), ix1 = Math.floor((b.x + b.w / 2 + GROUND_EXT) / GROUND_CELL - 0.5);
  let iz0 = Math.ceil((b.z - b.d / 2 + GROUND_EXT) / GROUND_CELL - 0.5), iz1 = Math.floor((b.z + b.d / 2 + GROUND_EXT) / GROUND_CELL - 0.5);
  if (ix0 > ix1) ix0 = ix1 = Math.floor((b.x + GROUND_EXT) / GROUND_CELL);
  if (iz0 > iz1) iz0 = iz1 = Math.floor((b.z + GROUND_EXT) / GROUND_CELL);
  for (let iz = Math.max(0, iz0); iz <= Math.min(GROUND_N - 1, iz1); iz++) for (let ix = Math.max(0, ix0); ix <= Math.min(GROUND_N - 1, ix1); ix++) f(iz * GROUND_N + ix);
}
// 每幀：倒塌（往下沉、慢慢傾斜，約 10 秒後消失）
function groundMsFrame(t) {
  if (!GRD || !GRD.ms || !GV.ms) return;
  for (const M of GRD.ms) {
    const g = GV.ms[M.id]; if (!g || !M.dead) continue;
    const k = Math.min(1, (t - M.deadT) / 10), e = k * k * (3 - 2 * k);
    g.visible = k < 1; g.position.y = GROUND_Y - e * Math.min(M.top - GROUND_Y, 90) * 0.95; g.rotation.z = e * 0.12 * (M.id % 2 ? 1 : -1); g.rotation.x = e * 0.08;
    if (k < 1 && Math.random() < 0.15) spawnFx(M.x + (Math.random() - 0.5) * M.r * 2, GROUND_Y + Math.random() * 6, M.z + (Math.random() - 0.5) * M.r * 2, 1, 4, 18);
  }
  for (const c of GV.climb) if (c.ms != null && GRD.ms[c.ms] && GRD.ms[c.ms].dead) c.m.visible = false;
}
// 新的一場：建築復原、焦痕清掉
function groundRestore() {
  const B = GV.bld; if (B) { for (let i = 1; i < B.ic.array.length; i += 4) B.ic.array[i] = -1; B.ic.clearUpdateRanges(); B.ic.needsUpdate = true; B.dirty.length = 0; }
  const S = GV.scars; if (S) { S.s.array.fill(0); S.s.clearUpdateRanges(); S.s.needsUpdate = true; S.head = 0; }
  for (const [id, g] of (GV.ms || []).entries()) if (g && GRD && GRD.ms[id]) { g.visible = true; g.position.set(GRD.ms[id].x, GROUND_Y, GRD.ms[id].z); g.rotation.set(0, 0, 0); }
  for (const c of GV.climb) c.m.visible = true;
  if (GV.beacons) { const a = GV.beacons.pts.geometry.attributes.position; GV.beacons.list.forEach((b, k) => a.setY(k, b.y)); a.needsUpdate = true; }
  groundFxReset();
}
// ═════ 戰火：煙柱、流彈落地、墜落的殘骸（只是畫面，不影響戰鬥；用 Math.random，回放時細節可能不同） ═════
const SMOKE_MAX = 8000, STRAY_P = 0.12, WRECK_P = 0.35, PLUME_MAX = 90, WIND = [0.9, 0.35];
function groundSmokeMesh(P) {
  const q = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry(); g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  const mk = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_MAX * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const iP = mk(), iQ = mk(), iR = mk(); g.setAttribute('iP', iP); g.setAttribute('iQ', iQ); g.setAttribute('iR', iR); g.instanceCount = SMOKE_MAX;
  const m = new THREE.ShaderMaterial({
    uniforms: gUni(P), transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec4 iP; attribute vec4 iQ; attribute vec4 iR; uniform float uTime;
      varying vec2 vUv; varying float vA; varying float vU; varying vec3 vW; varying float vS; varying float vSeed;
      void main(){
        float age = uTime - iP.w, life = iQ.x;
        if (life <= 0. || age < 0. || age > life) { gl_Position = vec4(2., 2., 2., 1.); return; }
        float u = age / life; vU = u; vS = iR.z; vSeed = iR.w; vUv = uv;
        vec3 c = iP.xyz + vec3(iR.x * age, iQ.w * age * (1. - .35 * u), iR.y * age);
        float sz = mix(iQ.y, iQ.z, sqrt(u));
        vec3 rt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 w = c + (rt * position.x + up * position.y) * sz; vW = w;
        vA = smoothstep(0., .05, u) * pow(1. - u, .75);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
      }`,
    fragmentShader: GROUND_FOG_GLSL + /* glsl */`
      varying vec2 vUv; varying float vA; varying float vU; varying vec3 vW; varying float vS; varying float vSeed;
      void main(){
        float d = length(vUv - .5) * 2., n = gn(vUv * 3. + vSeed * 13.) * .6 + gn(vUv * 7. - vSeed * 5.) * .4;
        float a = smoothstep(1., .15, d + (n - .5) * .7) * vA;
        if (a < .01) discard;
        vec3 col;
        if (vS > 1.5) { col = vec3(1., .42, .1) * 2.4 * (1. - vU); a *= .85; }   // 火光
        else { col = mix(vec3(.1, .095, .09), vec3(.62, .63, .65), clamp(vU * 2.2 + n * .3, 0., 1.)) * (uAmb * 1.4 + uLSun * .9) * vS; a *= .8; }
        gl_FragColor = vec4(fogMix(col, vW), a);
      }`,
  });
  GV.mats.push(m);
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3;
  GV.smoke = { mesh, iP, iQ, iR, head: 0, dirty: false };
  return mesh;
}
// 一顆煙（或火光）粒子：誕生時間 t、壽命、起始／最後大小、上升速度、水平飄移、亮度（＞1.5＝火光）
function smokePuff(x, y, z, t, life, s0, s1, rise, dx, dz, shade) {
  const S = GV.smoke; if (!S) return;
  const k = S.head; S.head = (S.head + 1) % SMOKE_MAX;
  S.iP.array[k * 4] = x; S.iP.array[k * 4 + 1] = y; S.iP.array[k * 4 + 2] = z; S.iP.array[k * 4 + 3] = t;
  S.iQ.array[k * 4] = life; S.iQ.array[k * 4 + 1] = s0; S.iQ.array[k * 4 + 2] = s1; S.iQ.array[k * 4 + 3] = rise;
  S.iR.array[k * 4] = dx; S.iR.array[k * 4 + 1] = dz; S.iR.array[k * 4 + 2] = shade; S.iR.array[k * 4 + 3] = Math.random() * 10;
  S.dirty = true;
}
// 煙柱：從 t0 起持續 dur 秒（rate 顆／秒、size＝擴散後的寬度）
function groundPlume(x, z, t0, dur, size = 14, rate = 1.6) {
  if (!GV.plumes) return;
  if (GV.plumes.length >= PLUME_MAX) GV.plumes.shift();
  GV.plumes.push({ x, z, y: terrainHAt(x, z) + 0.3, t0, t1: t0 + dur, size, rate: rate * 1.8, acc: Math.random() });
}
function plumePuff(p, t) {
  const j = () => Math.random() - 0.5;
  smokePuff(p.x + j() * p.size * 0.15, p.y, p.z + j() * p.size * 0.15, t, 26 + Math.random() * 10, p.size * 0.3, p.size * (1.1 + Math.random() * 0.6), 2.4 + Math.random() * 1, WIND[0] + j() * 0.6, WIND[1] + j() * 0.6, 0.7 + Math.random() * 0.5);
  if (Math.random() < 0.35) smokePuff(p.x + j() * p.size * 0.12, p.y, p.z + j() * p.size * 0.12, t, 1.2 + Math.random(), p.size * 0.08, p.size * 0.14, 1.5, 0, 0, 2);   // 底下的火光
}
// 打偏的光束、飛彈：有一部分在幾秒後掉進地面（炸毀建築、留下焦痕，偶爾起火）
function groundStray(x, y, z, t, big = false) {
  if (!GV.strays || Math.random() > (big ? 0.35 : STRAY_P)) return;
  GV.strays.push({ x: x + (Math.random() - 0.5) * 24, z: z + (Math.random() - 0.5) * 24, t: t + 1 + Math.random() * 2.5, r: (big ? 1.6 : 0.7) + Math.random() * (big ? 1.4 : 1) });
}
// 被擊沉的船：一部分拖著黑煙墜落，撞進地面（炸出一片廢墟、起火冒煙）
function groundWreck(x, y, z, type, side) {
  if (!GV.wrecks || Math.random() > WRECK_P || GV.wrecks.length > 140) return;
  const t = U.uTime.value, vx = (Math.random() - 0.5) * 4, vz = (Math.random() - 0.5) * 4, T = 4 + Math.max(0, y - GROUND_Y) / 12 + Math.random() * 2;
  GV.wrecks.push({ x, y, z, vx, vz, t0: t, T, gy: terrainHAt(x + vx * T, z + vz * T), sz: TYPE_W[type] || 4, side, acc: 0 });
}
function groundFxReset() {
  GV.strays = []; GV.wrecks = []; GV.plumes = []; GV.fxT = U.uTime.value;
  const S = GV.smoke; if (S) { S.iQ.array.fill(0); S.iQ.needsUpdate = true; S.iP.needsUpdate = true; S.iR.needsUpdate = true; S.head = 0; S.dirty = false; }
  if (!GRD) return;
  // 開戰前就在燒的地方（城裡已經打過仗）：煙柱與周圍的廢墟
  const n = GRD.S.pal.fires || 0, R = mulberry32((GRD.seed ^ 0x5bd1e995) >>> 0 || 1);
  for (let k = 0; k < n; k++) {
    const x = (R() - 0.5) * 1300, z = (R() - 0.5) * 1100;
    groundScar(x, terrainHAt(x, z), z, 2 + R() * 3);
    groundPlume(x, z, -40, 1e6, 10 + R() * 10, 1.2 + R());
  }
  for (const p of GV.plumes) for (let tt = Math.max(p.t0, -36); tt < 0; tt += 1 / p.rate) plumePuff(p, tt);   // 先補上已經升起的煙
}
// 每幀：依戰場時間推進流彈、殘骸、煙柱（暫停時不動）
function groundFxStep() {
  const S = GV.smoke; if (!S || !GV.plumes) return;
  const t = U.uTime.value; let dt = t - GV.fxT; GV.fxT = t;
  if (dt < 0) dt = 0; else if (dt > 2) dt = 2;
  for (let k = GV.strays.length - 1; k >= 0; k--) {
    const s = GV.strays[k]; if (s.t > t) continue;
    GV.strays.splice(k, 1);
    const gy = terrainHAt(s.x, s.z);
    spawnFx(s.x, gy + 0.5, s.z, Math.random() < 0.5 ? 0 : 1, 1.4 + s.r, 22);
    groundScar(s.x, gy, s.z, s.r);
    for (let i = 0; i < 3; i++) smokePuff(s.x, gy + 0.3, s.z, t, 8 + Math.random() * 6, 0.8, 4 + s.r * 2, 1.2, WIND[0] * 0.6, WIND[1] * 0.6, 0.9);
    if (Math.random() < 0.12) groundPlume(s.x, s.z, t, 30 + Math.random() * 60, 6 + s.r * 3, 0.8);
  }
  for (let k = GV.wrecks.length - 1; k >= 0; k--) {
    const w = GV.wrecks[k], u = (t - w.t0) / w.T;
    if (u >= 1) {   // 墜地
      GV.wrecks.splice(k, 1);
      const x = w.x + w.vx * w.T, z = w.z + w.vz * w.T;
      spawnFx(x, w.gy + 1, z, w.side, 3 + w.sz * 0.8, 22);
      groundScar(x, w.gy, z, 1.2 + w.sz * 0.45);
      if (Math.random() < 0.4) groundPlume(x, z, t, 40 + Math.random() * 80, 8 + w.sz * 1.5, 1.2);
      continue;
    }
    w.acc += dt * 7;
    while (w.acc >= 1) {   // 墜落途中拖著黑煙（加上火光）
      w.acc -= 1;
      const uu = Math.max(0, u - Math.random() * dt / w.T), tx = w.x + w.vx * uu * w.T, ty = w.y + (w.gy - w.y) * uu * uu, tz = w.z + w.vz * uu * w.T;
      smokePuff(tx, ty, tz, t, 10 + Math.random() * 6, w.sz * 0.25, w.sz * 1.4, 0.4, WIND[0] * 0.5, WIND[1] * 0.5, 0.6);
      if (Math.random() < 0.5) smokePuff(tx, ty, tz, t, 0.6, w.sz * 0.2, w.sz * 0.35, 0, 0, 0, 2);
    }
  }
  for (const p of GV.plumes) {
    if (t < p.t0 || t > p.t1) continue;
    p.acc += dt * p.rate;
    while (p.acc >= 1) { p.acc -= 1; plumePuff(p, t - Math.random() * dt); }
  }
  if (GV.plumes.length > 20) GV.plumes = GV.plumes.filter((p) => p.t1 > t);
  if (S.dirty) { S.iP.needsUpdate = S.iQ.needsUpdate = S.iR.needsUpdate = true; S.dirty = false; }
}

// 方塊、圓柱、圓頂 → 一個合併的幾何
function gbNew() { return { p: [], n: [], c: [], w: [] }; }
function gbTri(G, a, b, c, n, col, win) { for (const v of [a, b, c]) { G.p.push(v[0], v[1], v[2]); G.n.push(n[0], n[1], n[2]); G.c.push(col[0], col[1], col[2]); G.w.push(win); } }
function gbQuad(G, a, b, c, d, n, col, win) { gbTri(G, a, b, c, n, col, win); gbTri(G, a, c, d, n, col, win); }
function gbBox(G, b) {
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, y0 = b.y0, y1 = b.y0 + b.h, c = b.col, t = b.top || b.col, w = b.win || 0;
  gbQuad(G, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], t, 0);
  gbQuad(G, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c, w);
  gbQuad(G, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c, w);
  gbQuad(G, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c, w);
  gbQuad(G, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c, w);
}
function gbCyl(G, x, y0, z, r, h, col, seg = 12, cap = true, win = 0) {
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * TAU, a1 = (k + 1) / seg * TAU, am = (a0 + a1) / 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    gbQuad(G, [x + c0 * r, y0, z + s0 * r], [x + c1 * r, y0, z + s1 * r], [x + c1 * r, y0 + h, z + s1 * r], [x + c0 * r, y0 + h, z + s0 * r], [Math.cos(am), 0, Math.sin(am)], col, win);
    if (cap) gbTri(G, [x, y0 + h, z], [x + c1 * r, y0 + h, z + s1 * r], [x + c0 * r, y0 + h, z + s0 * r], [0, 1, 0], col, 0);
  }
}
function gbDome(G, x, y0, z, r, col, seg = 14, rings = 5) {
  for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) {
    const p0 = i / rings * Math.PI / 2, p1 = (i + 1) / rings * Math.PI / 2, a0 = k / seg * TAU, a1 = (k + 1) / seg * TAU;
    const v = (p, a) => [x + Math.cos(p) * Math.cos(a) * r, y0 + Math.sin(p) * r, z + Math.cos(p) * Math.sin(a) * r];
    const pm = (p0 + p1) / 2, amid = (a0 + a1) / 2;
    gbQuad(G, v(p0, a0), v(p0, a1), v(p1, a1), v(p1, a0), [Math.cos(pm) * Math.cos(amid), Math.sin(pm), Math.cos(pm) * Math.sin(amid)], col, 0);
  }
}
function gbMesh(G, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(G.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(G.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(G.c, 3)); g.setAttribute('aWin', new THREE.Float32BufferAttribute(G.w, 1));
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}
// 天空：依視線方向的漸層＋太陽光暈＋雲帶（夜晚、高空有星星）
function groundSky(P) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uZen: { value: new THREE.Vector3(...P.zen) }, uHor: { value: new THREE.Vector3(...P.hor) }, uGnd: { value: new THREE.Vector3(...P.gnd) }, uSun: { value: new THREE.Vector3(...P.sun).normalize() },
      uSunCol: { value: new THREE.Vector3(...P.sunCol) }, uStars: { value: P.stars }, uCloud: { value: P.cloud }, uCloudCol: { value: new THREE.Vector3(...P.cloudCol) }, uTime: U.uTime },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZen, uHor, uGnd, uSun, uSunCol, uCloudCol; uniform float uStars, uCloud, uTime; varying vec3 vDir;
      float h31(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 1.7; a *= .5; } return v; }
      float stars(vec3 d, float sc, float prob){ vec3 g = d * sc, id = floor(g), f = fract(g) - .5; float h = h31(id); if (h > prob) return 0.;
        vec3 o = vec3(h31(id + 3.1), h31(id + 7.7), h31(id + 1.3)) - .5; return smoothstep(.12, 0., length(f - o * .6)) * (.4 + .6 * h31(id + 9.1)); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uHor, uZen, pow(clamp(h, 0., 1.), .45));
        if (h < 0.) col = mix(uHor, uGnd, clamp(-h * 5., 0., 1.));
        float sd = max(dot(d, uSun), 0.);
        col += uSunCol * (pow(sd, 900.) * 2.5 + pow(sd, 16.) * .3 + pow(sd, 4.) * .08 * (1. - clamp(h * 2., 0., 1.)));
        col += vec3(.85, .9, 1.) * (stars(d, 260., .04) * .8 + stars(d, 90., .025)) * uStars * smoothstep(.02, .35, h);
        if (h > 0.) {
          vec2 uv = d.xz / (h + .08) * .9 + vec2(uTime * .004, 0.);
          float c = smoothstep(.45, .8, fbm(uv)) * uCloud * smoothstep(0., .08, h) * (1. - smoothstep(.35, .9, h));
          col = mix(col, uCloudCol + uSunCol * pow(sd, 6.) * .25, c);
        }
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(4800, 48, 24), m); s.frustumCulled = false; s.renderOrder = -20;
  return s;
}
// 地平面：都市（城區外圍也是一片燈海）、港區混凝土（海岸線以外透出海面）、基地草地、高原沙地、山腳
function groundFloorMesh(P, kind, y, coastF = null) {
  const cf = coastF || [0, 1, 0, 1, 0];
  const m = new THREE.ShaderMaterial({
    uniforms: gUni(P, { uKind: { value: kind }, uWin: { value: new THREE.Vector3(...P.win) }, uCoastOn: { value: coastF ? 1 : 0 }, uCoast: { value: new THREE.Vector4(cf[0], cf[1], cf[2], cf[3]) }, uCoastP: { value: cf[4] } }),
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GROUND_FOG_GLSL + /* glsl */`
      uniform float uKind; uniform vec3 uWin; uniform float uCoastOn; uniform vec4 uCoast; uniform float uCoastP; varying vec3 vW;
      void main(){
        vec2 p = vW.xz; float n = gn(p / 40.) * .6 + gn(p / 9.) * .4, fw = length(fwidth(p));
        if (uCoastOn > .5 && p.x > -110. + uCoast.x * sin(p.y / uCoast.y) + uCoast.z * sin(p.y / uCoast.w + uCoastP)) discard;   // 海港：海岸線以外露出海面
        vec3 light = uAmb + uLSun * max(uSun.y, 0.);
        vec3 col;
        if (uKind < .5) {   // 都市：灰色的屋頂紋理＋彎曲的道路網，遠處（城區外）也是市郊
          vec2 w = p + vec2(gn(p / 160.) - .5, gn(p / 160. + 7.3) - .5) * 60.;
          vec2 q = abs(fract(w / 4.6 + .5) - .5) * 4.6, big = abs(fract(w / 32. + .5) - .5) * 32.;
          float road = max(1. - smoothstep(.12, .3, min(q.x, q.y)) * (1. - step(min(big.x, big.y), .6)), 0.);
          road = mix(road, .18, smoothstep(.3, 1.2, fw));
          float roof = gn(w / 1.3) * .55 + gn(w / .45) * .45 * (1. - smoothstep(.15, .6, fw)) + .22 * smoothstep(.15, .6, fw);
          float sub = 1. - smoothstep(700., 2200., length(p)) * .5, park = smoothstep(.8, .86, gn(w / 70. + 3.));
          col = mix(vec3(.07, .075, .08), vec3(.2, .205, .215), roof) * (.8 + .35 * gn(p / 55.)) * sub;
          col = mix(col, vec3(.1, .105, .11), road * .7);
          col = mix(col, vec3(.08, .095, .075), park * .7);
          col *= light * 1.5;
        } else if (uKind < 1.5) col = mix(vec3(.13, .125, .12), vec3(.1, .1, .1), n) * light * 1.6;
        else if (uKind < 2.5) col = mix(vec3(.07, .095, .05), vec3(.11, .12, .075), n * .7 + gn(p / 300.) * .3) * light * 1.8;   // 基地：平原（田地、草原）
        else if (uKind < 3.5) col = mix(vec3(.2, .14, .09), vec3(.26, .19, .12), gn(p / 120.) * .7 + n * .3) * light * 1.5;
        else col = mix(vec3(.05, .06, .04), vec3(.08, .08, .06), n) * light * 1.6;
        gl_FragColor = vec4(fogMix(col, vW), 1.);
      }`,
  });
  GV.mats.push(m);
  const g = new THREE.PlaneGeometry(20000, 20000, 1, 1); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
}
function groundSea(P, y) {
  const m = new THREE.ShaderMaterial({
    uniforms: gUni(P, { uSea: { value: new THREE.Vector3(...P.sea) }, uSunCol: { value: new THREE.Vector3(...P.sunCol) } }),
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GROUND_FOG_GLSL + /* glsl */`
      uniform vec3 uSea, uSunCol; uniform float uTime; varying vec3 vW;
      void main(){
        vec2 p = vW.xz; float t = uTime;
        float w = gn(p / 6. + vec2(t * .08, t * .03)) * .6 + gn(p / 2.2 - vec2(t * .12, -t * .1)) * .4;
        vec3 N = normalize(vec3((w - .5) * .4, 1., (gn(p / 3.5 + t * .06) - .5) * .4));
        vec3 V = normalize(cameraPosition - vW), Rf = reflect(-V, N);
        float fr = pow(1. - max(dot(N, V), 0.), 4.);
        vec3 col = uSea * (.7 + .5 * w) + uFogCol * (.1 + .7 * fr);
        col += uSunCol * pow(max(dot(Rf, uSun), 0.), 120.) * 1.2;
        gl_FragColor = vec4(fogMix(col, vW), 1.);
      }`,
  });
  GV.mats.push(m);
  const g = new THREE.PlaneGeometry(20000, 20000, 1, 1); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
}
// 低空的雲、霧（半透明的雲層，慢慢飄動）：low＝[[離地高度（相對 GROUND_Y 的 y 偏移，負值＝離艦隊平面多遠）, 覆蓋門檻, 不透明度], ...]
function groundClouds(P, y, cover, op, k) {
  const m = new THREE.ShaderMaterial({
    uniforms: gUni(P, { uCov: { value: cover }, uOp: { value: op }, uCol: { value: new THREE.Vector3(...P.cloudCol) }, uK: { value: k } }), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GROUND_FOG_GLSL + /* glsl */`
      uniform float uCov, uOp, uK, uTime; uniform vec3 uCol; varying vec3 vW;
      void main(){
        vec2 p = vW.xz / 140. + vec2(uTime * .006, uTime * .002) + uK * 17.;
        float f = gn(p) * .5 + gn(p * 2.1 + 3.) * .25 + gn(p * 4.3 + 9.) * .15 + gn(p * 9. + 1.) * .1;
        float a = smoothstep(uCov, uCov + .22, f) * uOp * (1. - smoothstep(2500., 5000., length(vW.xz)));
        if (a < .005) discard;
        vec3 col = uCol * (uAmb * 1.1 + uLSun * (.35 + .3 * f));
        gl_FragColor = vec4(fogMix(col, vW), a);
      }`,
  });
  GV.mats.push(m);
  const g = new THREE.PlaneGeometry(12000, 12000, 1, 1); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; return mesh;
}
// 遠方的山（地平線）
function groundFar(P, kind, seed, ex) {
  const amp = kind === 4 ? (ex.alien ? 500 : 60) : [0, 25, 30, 70][kind], col0 = [[0, 0, 0], [0.09, 0.09, 0.08], [0.09, 0.11, 0.07], [0.22, 0.15, 0.1], [0.08, 0.08, 0.07]][kind];
  const S = 9000, n = 140, g = new THREE.PlaneGeometry(S * 2, S * 2, n, n); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.max(Math.abs(x), Math.abs(z));
    let h = Math.pow(gRidge(x / 1600, z / 1600, seed + 7), 1.4) * amp * gSmooth(1700, 3600, r) + gFbm(x / 500, z / 500, seed + 3, 3) * amp * 0.2 * gSmooth(1700, 2600, r);
    if (r < 1650) h = -5;
    pos.setY(i, GROUND_Y + h);
    const snow = kind === 4 ? gSmooth(amp * 0.55, amp * 0.8, h) : 0, k = 0.8 + 0.4 * gNoise(x / 300, z / 300, seed);
    cols[i * 3] = (col0[0] * (1 - snow) + 0.4 * snow) * k; cols[i * 3 + 1] = (col0[1] * (1 - snow) + 0.42 * snow) * k; cols[i * 3 + 2] = (col0[2] * (1 - snow) + 0.48 * snow) * k;
  }
  g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.setAttribute('aWin', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  const m = new THREE.Mesh(g, groundMat(P)); m.frustumCulled = false; return m;
}
// 群山：高度格的網格（顏色依高度與坡度：草、岩、雪）
function groundHfMesh(P, D) {
  const N1 = GROUND_N + 1, g = new THREE.PlaneGeometry(GROUND_EXT * 2, GROUND_EXT * 2, GROUND_N, GROUND_N); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ix = Math.round((pos.getX(i) + GROUND_EXT) / GROUND_CELL), iz = Math.round((pos.getZ(i) + GROUND_EXT) / GROUND_CELL);
    pos.setY(i, GROUND_Y + D.hf[iz * N1 + ix]);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal, cols = new Float32Array(pos.count * 3), sn = D.extra.snow;
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) - GROUND_Y, sl = 1 - nrm.getY(i), k = 0.85 + 0.3 * gNoise(pos.getX(i) / 40, pos.getZ(i) / 40, 5);
    let c = h < sn * 0.3 ? [0.06, 0.09, 0.045] : [0.11, 0.1, 0.085];
    if (sl > 0.35) c = [0.13, 0.12, 0.11];
    const snow = gSmooth(sn * 0.8, sn * 1.05, h) * (1 - gSmooth(0.45, 0.7, sl));
    cols[i * 3] = (c[0] * (1 - snow) + 0.42 * snow) * k; cols[i * 3 + 1] = (c[1] * (1 - snow) + 0.44 * snow) * k; cols[i * 3 + 2] = (c[2] * (1 - snow) + 0.5 * snow) * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.setAttribute('aWin', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  const m = new THREE.Mesh(g, groundMat(P)); m.frustumCulled = false; return m;
}
// 警示燈（巨型結構頂端的紅燈、燈塔）：閃爍的光點
function groundBeacons(list) {
  if (!list.length) return null;
  const pos = new Float32Array(list.length * 3), ph = new Float32Array(list.length), kind = new Float32Array(list.length);
  list.forEach((b, k) => { pos.set([b.x, b.y, b.z], k * 3); ph[k] = (k * 0.618) % 1; kind[k] = b.kind; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uRes: U.uRes }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aPh; attribute float aKind; uniform float uTime; uniform vec2 uRes; varying float vA; varying float vK;
      void main(){ vec4 c = projectionMatrix * viewMatrix * vec4(position, 1.); gl_Position = c; vK = aKind;
        vA = aKind > 1.5 ? .6 + .4 * sin(uTime * 2. + aPh * 6.28) : step(.55, fract(uTime * .5 + aPh));
        gl_PointSize = clamp(projectionMatrix[1][1] * .5 * uRes.y / c.w * (aKind > 1.5 ? 4. : 2.), 2., 14.); }`,
    fragmentShader: `varying float vA; varying float vK; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d) * vA; gl_FragColor = vec4((vK > 1.5 ? vec3(1., .9, .6) : vec3(1., .12, .06)) * a * 1.6, a); }` });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}
// 建立／更新整個近地場景的畫面（同一個地形只建一次；砲台依防守方重建；每一場開始時建築復原）
function groundSync() {
  if (!GRD) { if (GV.group) GV.group.visible = false; return; }
  if (!GV.group) { GV.group = new THREE.Group(); scene.add(GV.group); }   // 不設 renderOrder：天空（-20）要先畫
  GV.group.visible = true;
  if (GV.key !== GRD.key) {
    for (const o of GV.group.children.slice()) { GV.group.remove(o); o.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); }
    for (const m of GV.mats) m.dispose(); GV.mats = []; GV.tur = []; GV.climb = []; GV.defKey = ''; GV.tMat = GV.wMat = null; GV.bld = GV.scars = GV.smoke = null;
    if (GV.sky) { scene.remove(GV.sky); GV.sky.material.dispose(); GV.sky.geometry.dispose(); }
    GV.key = GRD.key;
    const P = GRD.S.pal, D = GRD, mat = groundMat(P), G = gbNew(), beacons = [], MG = new Map();
    const gOf = (o) => { if (o.ms == null) return G; let g = MG.get(o.ms); if (!g) MG.set(o.ms, (g = gbNew())); return g; };
    GV.sky = groundSky(P); scene.add(GV.sky);
    if (D.scene === 'harbor') { GV.group.add(groundSea(P, GROUND_Y - 0.05)); GV.group.add(groundFloorMesh(P, 1, GROUND_Y + 0.15, D.extra.coastF)); }
    else GV.group.add(groundFloorMesh(P, P.plane, GROUND_Y - (D.hf ? 1 : 0)));
    if (D.far) GV.group.add(groundFar(P, D.far, D.seed, D.extra));
    if (D.hf) GV.group.add(groundHfMesh(P, D));
    for (const b of D.boxes) gbBox(gOf(b), b);
    for (const c of D.cyl) { gbCyl(gOf(c), c.x, c.y0, c.z, c.r, c.h, c.col, c.r > 2 ? 20 : 8, true, c.win || 0); if (c.beacon) beacons.push({ x: c.x, y: c.y0 + c.h + 0.3, z: c.z, kind: c.beacon, ms: c.ms }); }
    for (const d of D.domes) gbDome(gOf(d), d.x, d.y0, d.z, d.r, d.col, d.r > 5 ? 24 : 10, d.r > 5 ? 8 : 4);
    const T = D.extra.tether;
    if (T) {   // 軌道電梯：纜繩、外層環、中繼平台、上下的車廂
      const TG = gOf(T);
      gbCyl(TG, T.x, T.y0, T.z, 1.2, 5800, [0.55, 0.57, 0.62], 10, false);
      for (let y = T.y0 + 15; y < 2400; y += 40) gbCyl(TG, T.x, y, T.z, 2.4, 1, [0.35, 0.36, 0.4], 12);
      gbCyl(TG, T.x, T.plat - 2, T.z, 20, 3, [0.24, 0.25, 0.3], 32, true, 13);
      gbCyl(TG, T.x, T.plat - 8, T.z, 8, 14, [0.3, 0.31, 0.36], 16, true, 17);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; gbBox(TG, { x: T.x + Math.cos(a) * 13, z: T.z + Math.sin(a) * 13, w: 2, d: 2, h: 5, y0: T.plat + 1, col: [0.3, 0.3, 0.34] }); }
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; beacons.push({ x: T.x + Math.cos(a) * 20, y: T.plat + 1.5, z: T.z + Math.sin(a) * 20, kind: k % 2 ? 1 : 2, ms: T.ms }); }
      for (let k = 0; k < 3; k++) {
        const cg = gbNew(); gbBox(cg, { x: 0, z: 0, w: 3.6, d: 3.6, h: 5, y0: -2.5, col: [0.4, 0.42, 0.48], win: 19 + k }); const cm = gbMesh(cg, mat);
        cm.position.set(T.x, 0, T.z); GV.group.add(cm); GV.climb.push({ m: cm, ph: k / 3, T, ms: T.ms });
      }
    }
    GV.group.add(gbMesh(G, mat));
    GV.ms = [];   // 巨型結構：以底部中心為支點的群組（倒塌時往下沉、傾斜）
    for (const [id, g] of MG) { const M = D.ms[id], grp = new THREE.Group(), m = gbMesh(g, mat); grp.position.set(M.x, GROUND_Y, M.z); m.position.set(-M.x, -GROUND_Y, -M.z); grp.add(m); GV.group.add(grp); GV.ms[id] = grp; }
    const bm = groundBldMesh(P, D); if (bm) GV.group.add(bm);
    GV.group.add(groundScarMesh(P));
    GV.group.add(groundSmokeMesh(P));   // 戰火的煙
    const bc = groundBeacons(beacons); if (bc) GV.group.add(bc);
    GV.beacons = bc ? { pts: bc, list: beacons } : null;
    (P.low || []).forEach(([y, cov, op], k) => GV.group.add(groundClouds(P, y, cov, op, k)));   // 低空的雲、霧
  }
  groundRestore();
  groundTargetsSync();   // 駕駛模式的地面目標
  // 砲台（依防守方的顏色）：約 500 公尺的防空陣地
  const dk = `${GRD.key}:${GRD.def}:${SIDE_FAC.join(',')}`;
  if (GV.defKey !== dk) {
    for (const t of GV.tur) { GV.group.remove(t.base); GV.group.remove(t.head); t.base.geometry.dispose(); t.head.geometry.dispose(); }
    GV.tur = []; GV.defKey = dk;
    if (!GV.tMat) { GV.tMat = groundMat(GRD.S.pal); GV.wMat = groundMat(GRD.S.pal); GV.wMat.uniforms.uDim.value = 0.25; }
    for (const tu of GRD.tur) {
      const sc = new THREE.Color(FACTION[SIDE_FAC[tu.side]].ui), sc3 = [sc.r * 1.4, sc.g * 1.4, sc.b * 1.4];
      const bg = gbNew(); gbCyl(bg, 0, 0, 0, 2.6, 1.2, [0.22, 0.22, 0.24], 12); gbCyl(bg, 0, 1.2, 0, 2.7, 0.35, sc3, 12);
      const hg = gbNew(); gbDome(hg, 0, 0, 0, 1.6, [0.3, 0.31, 0.34], 12, 4); gbBox(hg, { x: -0.5, z: 2, w: 0.35, d: 3.4, h: 0.35, y0: 0.7, col: [0.18, 0.18, 0.2] }); gbBox(hg, { x: 0.5, z: 2, w: 0.35, d: 3.4, h: 0.35, y0: 0.7, col: [0.18, 0.18, 0.2] });
      gbCyl(hg, 0, 1.4, 0, 0.45, 0.35, sc3, 8);
      const base = gbMesh(bg, GV.tMat), head = gbMesh(hg, GV.tMat);
      base.position.set(tu.x, tu.y, tu.z); head.position.set(tu.x, tu.y + 1.55, tu.z);
      GV.group.add(base, head); GV.tur.push({ base, head, tu });
    }
  }
}
// 每幀：天空跟著鏡頭、霧的起點、砲台轉向與毀損、建築被炸毀的更新、電梯車廂
function groundFrame() {
  if (GV.sky) GV.sky.visible = !!GRD;
  if (!GRD || !GV.group) return;
  GV.sky.position.copy(camera.position);
  GFOG_NEAR.value = camera.position.distanceTo(view.target) * 0.85;
  for (const o of GV.tur) {
    const tu = GRD.tur[o.tu.k] || o.tu, dead = tu.hp <= 0;
    o.head.visible = o.base.visible = !dead;   // 被摧毀：只留下彈坑
    if (!dead) { let d = tu.aim - o.head.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); o.head.rotation.y += d * 0.15; }
  }
  const B = GV.bld;
  if (B && B.dirty.length) {
    B.dirty.sort((a, b) => a - b);
    let s = B.dirty[0], e = s;
    for (let k = 1; k < B.dirty.length; k++) { const i = B.dirty[k]; if (i <= e + 1) { e = Math.max(e, i); continue; } B.ic.addUpdateRange(s * 4, (e - s + 1) * 4); s = e = i; }
    B.ic.addUpdateRange(s * 4, (e - s + 1) * 4);
    B.ic.needsUpdate = true; B.dirty.length = 0;
  }
  if (GV.scars && GV.scars.dirty) { GV.scars.s.needsUpdate = true; GV.scars.y.needsUpdate = true; GV.scars.dirty = false; }
  const t = U.uTime.value;
  for (const c of GV.climb) { const u = (Math.sin((t * 0.02 + c.ph) * TAU) + 1) / 2; c.m.position.y = c.T.y0 + 10 + u * 1200; }
  groundFxStep();
  groundTargetsFrame();
  groundMsFrame(t);
}
// 簡報的小地圖底圖：地形、建築密度、海、巨型結構（PNG data URL，同一個地形只畫一次）
const GROUND_IMG = {};
function groundMinimapImg(g) {
  const key = `${g.scene}:${g.seed >>> 0}`; if (GROUND_IMG[key]) return GROUND_IMG[key];
  const D = groundData(g), W = 120, Hh = 120, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const cx = cv.getContext('2d'), im = cx.createImageData(W, Hh), H = D.H, dens = new Float32Array(W * Hh);
  const px = (x) => (x - MAP_BOUNDS.x0) / (MAP_BOUNDS.x1 - MAP_BOUNDS.x0) * W, pz = (z) => (z - MAP_BOUNDS.z0) / (MAP_BOUNDS.z1 - MAP_BOUNDS.z0) * Hh;
  const BA = D.bldArr;
  for (let i = 0; i < BA.length; i += 10) { const a = Math.floor(px(BA[i])), b = Math.floor(pz(BA[i + 1])); if (a >= 0 && b >= 0 && a < W && b < Hh) dens[b * W + a]++; }
  const cf = D.extra.coastF;
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const x = MAP_BOUNDS.x0 + (i + 0.5) / W * (MAP_BOUNDS.x1 - MAP_BOUNDS.x0), z = MAP_BOUNDS.z0 + (j + 0.5) / Hh * (MAP_BOUNDS.z1 - MAP_BOUNDS.z0);
    const h = H[gIdx(x, z)] - GROUND_Y, k = Math.min(1, h / 100), dn = Math.min(1, dens[j * W + i] / 30);
    let c = h > -GROUND_Y ? [230, 120, 90] : [40 + k * 170 + dn * 90, 52 + k * 160 + dn * 70, 70 + k * 150 + dn * 30];
    if (cf && x > -110 + cf[0] * Math.sin(z / cf[1]) + cf[2] * Math.sin(z / cf[3] + cf[4]) && h < 1) c = [18, 40, 70];
    const o = (j * W + i) * 4; im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = 255;
  }
  cx.putImageData(im, 0, 0);
  for (const p of D.pil) { cx.fillStyle = p.top > 0 ? '#e6785a' : '#c0b090'; cx.beginPath(); cx.arc(px(p.x), pz(p.z), Math.max(1.5, p.r / (MAP_BOUNDS.x1 - MAP_BOUNDS.x0) * W), 0, TAU); cx.fill(); }
  return (GROUND_IMG[key] = { url: cv.toDataURL(), D });
}
// 簡報小地圖的近地圖層（SVG 片段）：底圖＋防守方的砲台
function groundMinimapSVG(g, W, Hh, mx, mz) {
  if (!g || !GROUND_SCENES[g.scene]) return '';
  const I = groundMinimapImg(g), def = g.def == null ? 1 : g.def, spots = def === 0 ? I.D.spotsP : def === 1 ? I.D.spotsN : [];
  let s = `<image href="${I.url}" x="0" y="0" width="${W}" height="${Hh}" preserveAspectRatio="none" opacity=".6"/>`;
  const c = def === GAME.playerSide ? '#f2b35a' : '#ff6a5a';
  for (const p of spots) s += `<path d="M${mx(p.x)} ${mz(p.z) - 5}l4.5 8h-9z" fill="${c}" stroke="#000" stroke-opacity=".5"/>`;
  return s;
}
