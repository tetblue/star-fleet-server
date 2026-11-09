// 艦長生涯：小隊對小隊的戰鬥模擬（不開瀏覽器，替代版）
// 遊戲裡還沒有「雙方都是特製戰艦」的小隊戰，所以先用這個模擬器照 captain.js 的船艦數值打，
// 用來決定勝率與存活率公式要考慮哪些因素。等真的小隊戰做好，再用實際戰鬥重新校正。
//
// 照遊戲搬過來的規則：
//   船艦數值 CAP_HULLS、難度 CAP_DIFF（直接讀 captain.js）
//   主砲：射界 arc、砲塔轉速 trav、對準才開火、彈速 spd（目標在飛行時間內移開＝打不中）
//   砲塔：命中＝acc × √目標大小 × (1 − 0.25 × 距離／射程)
//   點防禦：優先打飛彈，命中＝acc × 0.55 × (1 − 0.4 × 距離／far)；每顆飛彈最多被瞄準 3 次
//   飛彈：鎖定 lockT 秒、每 2.5 秒一發；速度 (85～120) × 0.3；命中＝0.9 × √大小 × (1 − 0.2 × 速度／25)
//         護盾還在：護盾吃 0.6 倍、船體吃 0.3 倍；護盾沒了：船體吃 1 倍
//   護盾：最後一次被打 5 秒後回充，每秒 5%；被打光要等 15 秒
//   技能：推進過載（速度 ×1.35、轉向 ×1.6）、護盾超載（船體 < 50% 且剛被打：護盾充滿、8 秒傷害減半）、維修光束（AI 版）
//   支援艦的護航機：攔截飛彈（命中 0.5，間隔 0.3～0.55 秒）
// 簡化：平面上打（不算高度）、沒有地形與障礙、護航機不會被打下（母艦沉了才消失）、船不會撤退。
// AI：每個小隊集火同一個目標（離小隊中心最近的敵艦），保持在主砲射程 7 成的距離，船頭對準目標（同僚艦的「集火」）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const capSrc = fs.readFileSync(path.join(here, '..', 'src', 'captain.js'), 'utf8');
function grab(name) {
  const a = capSrc.indexOf(`const ${name} = `); if (a < 0) throw new Error(name);
  let i = capSrc.indexOf('=', a) + 1; while (capSrc[i] === ' ') i++;
  const open = capSrc[i], close = open === '{' ? '}' : ']'; let d = 0, j = i;
  for (; j < capSrc.length; j++) { const c = capSrc[j]; if (c === "'" || c === '`' || c === '"') { const q = c; j++; while (capSrc[j] !== q) { if (capSrc[j] === '\\') j++; j++; } continue; } if (c === open) d++; else if (c === close && --d === 0) break; }
  return new Function(`return ${capSrc.slice(i, j + 1)}`)();
}
export const HULLS = grab('CAP_HULLS'), DIFF = grab('CAP_DIFF');
export const HULL_KEYS = Object.keys(HULLS);
const SIZE = [1.15, 1.1, 1.0, 0.85, 0.75, 1.05];   // data.js HIT_RULE.size（look＝借用外觀的艦種）
const SH = { delay: 5, rate: 0.05, broken: 15 }, MSL = { shield: 0.6, blast: 0.3 };
const DEG = Math.PI / 180, TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 一場戰鬥。sides＝[{ squads: [[{ key, hp, sh, msl }], …], diff }, …]（hp／sh／msl＝剩下的比例，0～1）
// 回傳 { win: 勝方索引或 -1（時間到）, t: 秒數, ships: [{ side, sq, key, alive, hp }] }
export function battle(sides, seed, o = {}) {
  const R = rng(seed), dt = o.dt || 0.1, T = o.time || 420, ships = [], mis = [];
  sides.forEach((S, si) => {
    const dm = DIFF[S.diff ?? 1] || DIFF[1], n = S.squads.length;
    S.squads.forEach((sq, qi) => sq.forEach((c, k) => {
      const H = HULLS[c.key], cx = (si ? 1 : -1) * 450, cz = (qi - (n - 1) / 2) * 220 + (k - (sq.length - 1) / 2) * 40;
      ships.push({ side: si, sq: si * 10 + qi, key: c.key, H, x: cx + (R() - 0.5) * 30, z: cz, vx: 0, vz: 0, yaw: si ? -Math.PI / 2 : Math.PI / 2, yr: 0,
        hpMax: H.hp * dm.hp, hp: H.hp * dm.hp * (c.hp ?? 1), shMax: H.sh * dm.hp, sh: H.sh * dm.hp * (c.sh ?? 1), shT: -99, dm: dm.dmg, size: SIZE[H.look],
        mainCd: R() * H.main.cd, gY: 0, tcd: Array.from({ length: H.tur.n }, () => R() * H.tur.cd), pcd: Array.from({ length: H.pd.n }, () => R() * H.pd.cd),
        msl: Math.round((H.msl ? H.msl.n : 0) * (c.msl ?? 1)), mslCd: 0, aiMslT: R() * 2, lockT: 0, skillCd: R() * 5, burstT: -9, shieldT: -9, repE: 1, repEmpty: false,
        esc: H.ftr || 0, ecd: Array.from({ length: H.ftr || 0 }, () => R() * 0.5), dead: false, hitT: -99, hp0: c.hp ?? 1 });
    }));
  });
  const alive = (s) => !s.dead, foes = (s) => ships.filter((o) => alive(o) && o.side !== s.side);
  const focus = new Map();
  const hurt = (s, dmg, t, kind) => {   // kind: 'gun'／'msl'
    if (s.dead) return;
    if (s.shieldT > t) dmg *= 0.5;
    const sh0 = s.sh;
    if (kind === 'msl') { if (s.sh > 0.5) { s.sh = Math.max(0, s.sh - dmg * MSL.shield); s.hp -= dmg * MSL.blast; } else s.hp -= dmg; }
    else { const a = Math.min(s.sh, dmg); s.sh -= a; s.hp -= dmg - a; }
    s.shT = sh0 > 0.5 && s.sh <= 0.5 ? t + SH.broken - SH.delay : t; s.hitT = t;
    if (s.hp <= 0) { s.dead = true; s.hp = 0; }
  };
  let t = 0, win = -1;
  for (; t < T; t += dt) {
    // 集火目標：每秒重挑（離小隊中心最近的敵艦）
    if (Math.abs(t % 1) < dt * 0.5 || !focus.size) {
      const sqs = new Map(); for (const s of ships) if (alive(s)) { const a = sqs.get(s.sq) || []; a.push(s); sqs.set(s.sq, a); }
      for (const [q, L] of sqs) {
        const cx = L.reduce((a, s) => a + s.x, 0) / L.length, cz = L.reduce((a, s) => a + s.z, 0) / L.length, cur = focus.get(q);
        if (cur && alive(cur)) continue;
        let best = null, bd = 1e9; for (const e of foes(L[0])) { const d = Math.hypot(e.x - cx, e.z - cz); if (d < bd) { bd = d; best = e; } }
        focus.set(q, best);
      }
    }
    for (const s of ships) {
      if (!alive(s)) continue;
      const H = s.H, tg = focus.get(s.sq); s.mainCd -= dt; s.mslCd -= dt; s.skillCd -= dt;
      // 移動（同 capWing 的集火）
      const burst = s.burstT > t, km = burst ? 1.35 : 1;
      let gx = s.x, gz = s.z, face = s.yaw;
      if (tg && alive(tg)) {
        const hx = s.x - tg.x, hz = s.z - tg.z, hd = Math.hypot(hx, hz) || 1, Rr = Math.min(H.main.range * 0.7, Math.max(40, hd));
        gx = tg.x + hx / hd * Rr; gz = tg.z + hz / hd * Rr; face = Math.atan2(tg.x - s.x, tg.z - s.z);
        if (H.skill.key === 'burst' && hd > 200 && s.skillCd <= 0) { s.skillCd = H.skill.cd; s.burstT = t + H.skill.dur; }
      }
      const rate = H.turn * DEG * (burst ? 1.6 : 1), want = Math.max(-rate, Math.min(rate, wrap(face - s.yaw) * 2.5));
      s.yr += Math.max(-rate * 2.5 * dt, Math.min(rate * 2.5 * dt, want - s.yr)); s.yaw = wrap(s.yaw + s.yr * dt);
      const Fx = Math.sin(s.yaw), Fz = Math.cos(s.yaw), dx = gx - s.x, dz = gz - s.z, ahead = dx * Fx + dz * Fz, lat = dx * -Fz + dz * Fx;
      const thr = Math.max(-0.3, Math.min(1, ahead * 0.5 / H.cruise)), boost = ahead * 0.5 > H.cruise * 1.2 && ahead > 30;
      const st = Math.max(-1, Math.min(1, lat * 0.4 / H.strafe));
      const fwd = thr * (boost ? H.max : H.cruise) * km, sv = st * H.strafe * km;
      const tx = Fx * fwd + -Fz * sv, tz = Fz * fwd + Fx * sv;
      let ax = tx - s.vx, az = tz - s.vz; const al = Math.hypot(ax, az), am = H.acc * (boost ? 1.4 : 1) * (burst ? 1.6 : 1) * dt;
      if (al > am) { ax *= am / al; az *= am / al; } s.vx += ax; s.vz += az; s.x += s.vx * dt; s.z += s.vz * dt;
      // 護盾回充
      if (t - s.shT >= SH.delay) s.sh = Math.min(s.shMax, s.sh + s.shMax * SH.rate * dt);
      // 技能：護盾超載、維修
      if (H.skill.key === 'shield' && s.skillCd <= 0 && s.hp < s.hpMax * 0.5 && t - s.hitT < 2) { s.skillCd = H.skill.cd; s.shieldT = t + H.skill.dur; s.sh = s.shMax; s.shT = -99; }
      if (H.repair) {
        const Rp = H.repair; let best = null, br = 0.7;
        for (const o2 of ships) if (alive(o2) && o2.side === s.side) { const r = o2.hp / o2.hpMax; if (r < br && Math.hypot(o2.x - s.x, o2.z - s.z) < Rp.range) { br = r; best = o2; } }
        if (!best || s.repE <= 0 || s.repEmpty) { s.repE = Math.min(1, s.repE + dt / Rp.recharge); if (s.repE > 0.5) s.repEmpty = false; }
        else { const amt = Rp.hps * (best === s ? 0.4 : 1) * dt; best.hp = Math.min(best.hpMax, best.hp + amt); best.sh = Math.min(best.shMax, best.sh + amt * 0.6); s.repE -= dt / Rp.dur; if (s.repE <= 0) { s.repE = 0; s.repEmpty = true; } }
      }
      if (!tg || !alive(tg)) continue;
      const d = Math.hypot(tg.x - s.x, tg.z - s.z);
      // 主砲
      const M = H.main, arc = M.arc * DEG, wy0 = wrap(Math.atan2(tg.x - s.x, tg.z - s.z) - s.yaw), ok = Math.abs(wy0) <= arc, wy = Math.max(-arc, Math.min(arc, wy0));
      s.gY += Math.max(-M.trav * DEG * dt, Math.min(M.trav * DEG * dt, wy - s.gY));
      if (ok && Math.abs(wy - s.gY) < 0.02 && d < M.range && s.mainCd <= 0) {
        s.mainCd = M.cd;
        const tf = d / M.spd, ux = (tg.x - s.x) / d, uz = (tg.z - s.z) / d, vperp = Math.abs(tg.vx * uz - tg.vz * ux);
        const off = vperp * tf + Math.abs(R() - 0.5) * 0.008 * d;
        if (off < 5 * tg.size) hurt(tg, M.dmg * s.dm, t, 'gun');
      }
      // 砲塔：先打集火目標，不在射程就打最近的
      const Tu = H.tur;
      for (let m = 0; m < Tu.n; m++) {
        s.tcd[m] -= dt; if (s.tcd[m] > 0) continue;
        let e = d <= Tu.range ? tg : null;
        if (!e) { let bd = Tu.range; for (const f of foes(s)) { const dd = Math.hypot(f.x - s.x, f.z - s.z); if (dd < bd) { bd = dd; e = f; } } }
        if (!e) { s.tcd[m] = 0.4 + R() * 0.3; continue; }
        s.tcd[m] = Tu.cd * (0.85 + R() * 0.3);
        const dd = Math.hypot(e.x - s.x, e.z - s.z);
        if (R() < Tu.acc * Math.sqrt(e.size) * (1 - 0.25 * dd / Tu.range)) hurt(e, Tu.dmg * s.dm, t, 'gun');
      }
      // 飛彈
      const Ms = H.msl;
      if (Ms) {
        if (d <= Ms.range) s.lockT = Math.min(Ms.lockT * 1.5, s.lockT + dt); else s.lockT = Math.max(0, s.lockT - dt * 2);
        if (s.msl > 0 && s.mslCd <= 0 && t > s.aiMslT && s.lockT >= Ms.lockT) {
          s.msl--; s.mslCd = Ms.cd; s.aiMslT = t + 2.5;
          mis.push({ side: s.side, tg, x: s.x, z: s.z, spd: (85 + R() * 35) * 0.3, dmg: Ms.dmg * s.dm, shots: 0, dead: false });
        }
      }
    }
    // 點防禦、護航機：攔飛彈
    for (const s of ships) {
      if (!alive(s)) continue;
      const P = s.H.pd;
      for (let k = 0; k < P.n; k++) {
        s.pcd[k] -= dt; if (s.pcd[k] > 0) continue;
        let bm = null, dm = P.far; for (const m of mis) { if (m.dead || m.side === s.side || m.shots >= 3) continue; const d = Math.hypot(m.x - s.x, m.z - s.z); if (d < dm) { dm = d; bm = m; } }
        if (!bm) { s.pcd[k] = 0.25; continue; }
        s.pcd[k] = P.cd * (0.8 + R() * 0.4); bm.shots++;
        if (R() < P.acc * 0.55 * (1 - 0.4 * dm / P.far)) bm.dead = true;
      }
      for (let k = 0; k < s.esc; k++) {
        s.ecd[k] -= dt; if (s.ecd[k] > 0) continue;
        let bm = null, dm = 200; for (const m of mis) { if (m.dead || m.side === s.side || m.shots >= 3) continue; const d = Math.hypot(m.x - s.x, m.z - s.z); if (d < dm) { dm = d; bm = m; } }
        if (!bm) { s.ecd[k] = 0.3; continue; }
        s.ecd[k] = 0.3 + R() * 0.25; bm.shots++;
        if (R() < 0.5) bm.dead = true;
      }
    }
    // 飛彈飛行、命中
    for (const m of mis) {
      if (m.dead) continue;
      if (m.tg.dead) { m.dead = true; continue; }
      const dx = m.tg.x - m.x, dz = m.tg.z - m.z, d = Math.hypot(dx, dz), step = m.spd * dt;
      if (d <= step) {
        m.dead = true; const v = Math.hypot(m.tg.vx, m.tg.vz);
        if (R() < 0.9 * Math.sqrt(m.tg.size) * (1 - 0.2 * Math.min(1, v / 25))) hurt(m.tg, m.dmg, t, 'msl');
      } else { m.x += dx / d * step; m.z += dz / d * step; }
    }
    if (mis.length > 200) for (let k = mis.length - 1; k >= 0; k--) if (mis[k].dead) mis.splice(k, 1);
    const left = new Set(ships.filter(alive).map((s) => s.side));
    if (left.size <= 1) { win = left.size ? [...left][0] : -1; break; }
  }
  return { win, t: Math.round(t), ships: ships.map((s) => ({ side: s.side, sq: s.sq, key: s.key, alive: !s.dead, hp: s.hp / s.hpMax })) };
}
