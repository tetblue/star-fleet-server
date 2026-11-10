// 艦長生涯：小隊戰的勝率與存活率公式（用 capsquad-sim.mjs 的模擬結果擬合）
// 用法（在 dev 資料夾）：node tools/capsquad-fit.mjs --n=8000 --seed=1
// 實戰資料（遊戲裡 AI 對 AI 的佔領戰，__cap.capDuel）：--real=實戰.txt（一行一場的精簡格式，見 readReal）
// 只驗證現有的公式、不重新擬合：再加 --params=公式.json（{ win, surv }）
// 有軌道防禦的戰鬥（defs）：先用沒有防禦的戰鬥擬合主要參數，再單獨擬合每種防禦設施的火力、耐久（def）
// 產生隨機戰鬥（每方 1～2 個小隊、每隊 1～5 艘、受損狀態、飛彈存量、敵方難度），
// 七成拿來擬合、三成拿來驗證：預測勝負的準確度、預測勝率和實際勝率是否相符（分組比較）、存活率是否相符。
import fs from 'node:fs';
import { battle, HULLS, HULL_KEYS, DIFF, rng } from './capsquad-sim.mjs';

const arg = (n, d) => { const a = process.argv.find((s) => s.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const N = +arg('n', 8000), SEED = +arg('seed', 1), TIME = +arg('time', 900);
const R = rng(SEED);
const pick = (L) => L[Math.floor(R() * L.length)];

// ───── 產生戰鬥 ─────
function mkShip() {
  const key = pick(HULL_KEYS), full = R() < 0.45;
  return { key, hp: full ? 1 : 0.2 + R() * 0.8, sh: full ? 1 : R(), msl: full ? 1 : R() };
}
// near＝讓這一方的總船數接近 near（勢均力敵的戰鬥，才量得出細微的因素）
function mkSide(diff, near) {
  const nq = R() < 0.5 ? 1 : 2, squads = [];
  const tot = near ? Math.max(nq, Math.min(nq * 5, near + Math.floor(R() * 3) - 1)) : 0;
  for (let q = 0; q < nq; q++) { const n = near ? Math.max(1, Math.min(5, Math.round(tot / nq) + (q && tot % nq ? -1 : 0))) : 1 + Math.floor(R() * 5); squads.push(Array.from({ length: n }, mkShip)); }
  return { squads, diff };
}
const CACHE = arg('cache', ''), REAL = arg('real', '');
let rows = [];
const t0 = Date.now();
// 精簡格式：勝方,秒數;我方;敵方　一方＝難度:小隊/小隊[:防禦設施,…]　小隊＝船.船…　船＝艦種字母-船體%-護盾%-飛彈%-存活(1/0)
// 例：0,84;1:a-100-100-100-1.g-60-20-50-0;2:s-100-100-100-0:orb,plat
function readReal(file) {
  const K = { a: 'assault', g: 'gunship', s: 'support' };
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [head, ...sd] = line.split(';'), [win, t] = head.split(',').map(Number), ships = [];
    const sides = sd.map((x, si) => {
      const [diff, sq, defs] = x.split(':');
      const squads = sq.split('/').map((q, qi) => q.split('.').map((c) => { const [k, hp, sh, msl, al] = c.split('-'); ships.push({ side: si, sq: si * 10 + qi, key: K[k], alive: al === '1' }); return { key: K[k], hp: hp / 100, sh: sh / 100, msl: msl / 100 }; }));
      return { squads, diff: +diff, ...(defs ? { defs: defs.split(',') } : {}) };
    });
    return { sides, r: { win, t, ships } };
  });
}
if (REAL) rows = readReal(REAL);
else if (CACHE && fs.existsSync(CACHE)) rows = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
else for (let b = 0; b < N; b++) {
  const A = mkSide(1), bal = R() < 0.5, sides = [A, mkSide(R() < 0.6 ? 1 : Math.floor(R() * 5), bal ? A.squads.flat().length : 0)];
  const r = battle(sides, SEED * 100003 + b, { time: TIME });
  rows.push({ sides, r });
}
if (CACHE && !fs.existsSync(CACHE)) fs.writeFileSync(CACHE, JSON.stringify(rows));
console.log(`${rows.length} 場模擬，${((Date.now() - t0) / 1000).toFixed(0)} 秒；時間到還沒分出勝負：${(rows.filter((x) => x.r.win < 0).length / rows.length * 100).toFixed(1)}%`);

// ───── 公式 ─────
// 每艘船：火力 F＝難度傷害 ×（艦種基本火力 f + 飛彈部分 g × 飛彈剩下的比例）；耐久 E＝難度耐久 ×（船體 + α × 護盾）
// 飛彈：開戰的齊射，先扣掉敵方的耐久：敵方 ΣE −＝ λ × Σ(剩下的飛彈數 × 每發傷害 × 難度傷害) ÷ 100（最多扣到剩 1 成）
// 一方的戰力：ln S = ln ΣF + γ × ln ΣE − δ ×（小隊數 − 1）
// 勝率：P = 1 /（1 + e^(−k × (ln S_我 − ln S_敵))）
const P0 = { f: { assault: 1, gunship: 1, support: 1 }, alpha: 0.6, gamma: 1, delta: 0.1, k: 1, lambda: 0.2 };
const flat = (p) => [p.f.gunship, p.f.support, p.alpha, p.gamma, p.delta, p.k, p.lambda];
const unflat = (v) => ({ f: { assault: 1, gunship: v[0], support: v[1] }, alpha: v[2], gamma: v[3], delta: v[4], k: v[5], lambda: v[6] });
const WIN_MIN = [0.01, 0.01, 0, 0.01, -1, 0.01, 0];
function shipFE(p, c, diff) {
  const H = HULLS[c.key], D = DIFF[diff];
  return { F: D.dmg * p.f[c.key], E: D.hp * (H.hp * c.hp + p.alpha * H.sh * c.sh) / 100, M: H.msl ? D.dmg * H.msl.n * c.msl * H.msl.dmg / 100 : 0 };
}
// 防禦設施：每座 F＝難度傷害 × def[種類].F、E＝難度耐久 × def[種類].E（和船同一個單位）
const DEF_KEYS = ['orb', 'plat'];
function sideFEM(p, S) {
  let F = 0, E = 0, M = 0; for (const q of S.squads) for (const c of q) { const x = shipFE(p, c, S.diff); F += x.F; E += x.E; M += x.M; }
  if (S.defs && p.def) { const D = DIFF[S.diff]; for (const d of S.defs) { F += D.dmg * p.def[d].F; E += D.hp * p.def[d].E; } }
  return { F, E, M };
}
function sideS(p, S, foe) {
  const a = sideFEM(p, S), b = sideFEM(p, foe), E = Math.max(a.E * 0.1, a.E - p.lambda * b.M);
  return Math.log(Math.max(1e-6, a.F)) + p.gamma * Math.log(Math.max(1e-6, E)) - p.delta * (S.squads.length - 1);
}
const sig = (z) => 1 / (1 + Math.exp(-z));
const pWin = (p, sides) => sig(p.k * (sideS(p, sides[0], sides[1]) - sideS(p, sides[1], sides[0])));

const hasDef = (x) => x.sides.some((S) => S.defs && S.defs.length);
const all = rows.filter((x) => x.r.win >= 0), decided = all.filter((x) => !hasDef(x)), decDef = all.filter(hasDef);
const PARAMS = arg('params', ''), FIXED = PARAMS ? JSON.parse(fs.readFileSync(PARAMS, 'utf8')) : null;
const cut = FIXED ? 0 : Math.floor(decided.length * 0.7), train = decided.slice(0, cut), test = decided.slice(cut);
function loss(v, L) {
  const p = unflat(v); let s = 0;
  for (const x of L) { const q = Math.min(1 - 1e-9, Math.max(1e-9, pWin(p, x.sides))); s -= x.r.win === 0 ? Math.log(q) : Math.log(1 - q); }
  return s / L.length;
}
// 擬合：數值梯度 + Adam
function fit(v, f, steps = 600, lr = 0.03, lo = null) {
  const m = v.map(() => 0), w = v.map(() => 0);
  for (let it = 1; it <= steps; it++) {
    const base = f(v), g = v.map((_, i) => { const u = v.slice(); u[i] += 1e-4; return (f(u) - base) / 1e-4; });
    for (let i = 0; i < v.length; i++) { m[i] = 0.9 * m[i] + 0.1 * g[i]; w[i] = 0.999 * w[i] + 0.001 * g[i] * g[i]; v[i] -= lr * (m[i] / (1 - 0.9 ** it)) / (Math.sqrt(w[i] / (1 - 0.999 ** it)) + 1e-8); }
    if (lo) for (let i = 0; i < v.length; i++) if (lo[i] != null) v[i] = Math.max(lo[i], v[i]);
  }
  return v;
}
const v = FIXED ? flat(FIXED.win) : fit(flat(P0), (u) => loss(u, train), 1500, 0.03, WIN_MIN);
const P = unflat(v);
// 防禦設施的參數（主要參數固定）
const dflat = (d) => DEF_KEYS.flatMap((k) => [d[k].F, d[k].E]), dun = (u) => Object.fromEntries(DEF_KEYS.map((k, i) => [k, { F: u[i * 2], E: u[i * 2 + 1] }]));
const dcut = FIXED ? 0 : Math.floor(decDef.length * 0.7), dTrain = decDef.slice(0, dcut), dTest = decDef.slice(dcut);
if (FIXED && FIXED.win.def) P.def = FIXED.win.def;
else if (decDef.length) { const u0 = fit([1, 5, 0.5, 2], (u) => { P.def = dun(u); let s = 0; for (const x of dTrain) { const q = Math.min(1 - 1e-9, Math.max(1e-9, pWin(P, x.sides))); s -= x.r.win === 0 ? Math.log(q) : Math.log(1 - q); } return s / dTrain.length; }, 600, 0.05, [0, 0, 0, 0]); P.def = dun(u0); }
const acc = (L) => L.filter((x) => (pWin(P, x.sides) >= 0.5) === (x.r.win === 0)).length / L.length;
console.log('\n勝率公式的參數：');
console.log(`  艦種基本火力 f：突擊艦 1（基準）、重砲艦 ${P.f.gunship.toFixed(2)}、支援艦 ${P.f.support.toFixed(2)}`);
console.log(`  護盾的耐久價值 α＝${P.alpha.toFixed(2)}（1 點護盾約等於 ${P.alpha.toFixed(2)} 點船體）`);
console.log(`  飛彈齊射 λ＝${P.lambda.toFixed(2)}（敵方剩下的飛彈總傷害，有 ${Math.round(P.lambda * 100)}% 會先扣掉我方耐久）`);
console.log(`  耐久的指數 γ＝${P.gamma.toFixed(2)}、分成兩個小隊的懲罰 δ＝${P.delta.toFixed(2)}、斜率 k＝${P.k.toFixed(2)}`);
console.log(`\n驗證（${test.length} 場${FIXED ? '，用現有的公式' : '沒用來擬合的戰鬥'}）：預測勝負準確 ${(acc(test) * 100).toFixed(1)}%${FIXED ? '' : `（擬合用的 ${(acc(train) * 100).toFixed(1)}%）`}；log loss ${loss(v, test).toFixed(3)}`);
console.log('  預測勝率 → 實際勝率（場數）');
for (let b = 0; b < 10; b++) {
  const L = test.filter((x) => { const q = pWin(P, x.sides); return q >= b / 10 && q < (b + 1) / 10 + (b === 9 ? 1e-9 : 0); });
  if (L.length) console.log(`  ${b * 10}～${b * 10 + 10}%：${(L.filter((x) => x.r.win === 0).length / L.length * 100).toFixed(0)}%（${L.length}）`);
}
// 分類看準不準：同一方兩隊、雙方都是一隊、敵方難度不同
const grp = (name, f) => { const L = test.filter(f); if (L.length < 30) return; const pm = L.reduce((a, x) => a + pWin(P, x.sides), 0) / L.length, am = L.filter((x) => x.r.win === 0).length / L.length; console.log(`  ${name}：${L.length} 場，平均預測 ${(pm * 100).toFixed(0)}%、實際 ${(am * 100).toFixed(0)}%、準確 ${(acc(L) * 100).toFixed(0)}%`); };
console.log('\n分類檢查：');
grp('一隊 對 一隊', (x) => x.sides[0].squads.length === 1 && x.sides[1].squads.length === 1);
grp('兩隊 對 一隊', (x) => x.sides[0].squads.length === 2 && x.sides[1].squads.length === 1);
grp('一隊 對 兩隊', (x) => x.sides[0].squads.length === 1 && x.sides[1].squads.length === 2);
grp('兩隊 對 兩隊', (x) => x.sides[0].squads.length === 2 && x.sides[1].squads.length === 2);
for (let d = 0; d < 5; d++) grp(`敵方難度 ${DIFF[d].name}`, (x) => x.sides[1].diff === d);
grp('我方全部滿血', (x) => x.sides[0].squads.flat().every((c) => c.hp === 1));
grp('我方有受損的船', (x) => x.sides[0].squads.flat().some((c) => c.hp < 1));

if (decDef.length) {
  const L = dTest.length ? dTest : decDef, pm = L.reduce((a, x) => a + pWin(P, x.sides), 0) / L.length, am = L.filter((x) => x.r.win === 0).length / L.length;
  console.log();
  for (const k of DEF_KEYS) console.log();
  console.log();
}
if (decDef.length) {
  const L = dTest.length ? dTest : decDef, pm = L.reduce((a, x) => a + pWin(P, x.sides), 0) / L.length, am = L.filter((x) => x.r.win === 0).length / L.length;
  console.log(`\n軌道防禦（${decDef.length} 場有防禦的戰鬥，驗證 ${L.length} 場）：每座的火力、耐久（和船同單位：突擊艦火力 1、耐久＝船體 ÷ 100）`);
  for (const k of DEF_KEYS) console.log(`  ${k === 'orb' ? '軌道防禦站' : '防禦平台'}：火力 ${P.def[k].F.toFixed(2)}、耐久 ${P.def[k].E.toFixed(2)}`);
  console.log(`  預測勝負準確 ${(acc(L) * 100).toFixed(1)}%；平均預測 ${(pm * 100).toFixed(0)}%、實際 ${(am * 100).toFixed(0)}%`);
}
// ───── 每艘船的存活率 ─────
// z = b[艦種] + c1 × logit(我方勝率) + c2 × ln(這艘船剩下的耐久比例) + c3 × ln(我方船數 ÷ 敵方船數)
function shipRows(L) {
  const out = [];
  for (const x of L) {
    const pw = [pWin(P, x.sides), 1 - pWin(P, x.sides)];
    let k = 0;
    x.sides.forEach((S, si) => {
      const nOwn = S.squads.flat().length, nFoe = x.sides[1 - si].squads.flat().length;
      S.squads.flat().forEach((c) => {
        const H = HULLS[c.key], fr = (H.hp * c.hp + P.alpha * H.sh * c.sh) / (H.hp + P.alpha * H.sh);
        out.push({ key: c.key, lp: Math.log(pw[si] / (1 - pw[si])), fr: Math.log(Math.max(0.05, fr)), rel: Math.log(nOwn / nFoe), y: x.r.ships[k].alive ? 1 : 0 }); k++;
      });
    });
  }
  return out;
}
const STr = shipRows(train), STe = shipRows(test);
const sz = (u, r) => u[HULL_KEYS.indexOf(r.key)] + u[3] * Math.max(-8, Math.min(8, r.lp)) + u[4] * r.fr + u[5] * r.rel;
const sloss = (u, L) => { let s = 0; for (const r of L) { const q = Math.min(1 - 1e-9, Math.max(1e-9, sig(sz(u, r)))); s -= r.y ? Math.log(q) : Math.log(1 - q); } return s / L.length; };
const u = FIXED ? [FIXED.surv.b.assault, FIXED.surv.b.gunship, FIXED.surv.b.support, FIXED.surv.c1, FIXED.surv.c2, FIXED.surv.c3] : fit([0, 0, 0, 1, 1, 0], (w) => sloss(w, STr), 800, 0.05);
console.log('\n存活率公式的參數：');
console.log(`  艦種基準：突擊艦 ${u[0].toFixed(2)}、重砲艦 ${u[1].toFixed(2)}、支援艦 ${u[2].toFixed(2)}`);
console.log(`  我方勝率的影響 c1＝${u[3].toFixed(2)}、自己剩下的耐久 c2＝${u[4].toFixed(2)}、船數比 c3＝${u[5].toFixed(2)}`);
console.log(`  驗證：預測存活率 → 實際存活率（${STe.length} 艘船次）`);
for (let b = 0; b < 10; b++) {
  const L = STe.filter((r) => { const q = sig(sz(u, r)); return q >= b / 10 && q < (b + 1) / 10 + (b === 9 ? 1e-9 : 0); });
  if (L.length) console.log(`  ${b * 10}～${b * 10 + 10}%：${(L.filter((r) => r.y).length / L.length * 100).toFixed(0)}%（${L.length}）`);
}
const won = STe.filter((r) => r.lp > 0), lost = STe.filter((r) => r.lp <= 0);
console.log(`  勝方預測為我方時，平均存活 ${(won.filter((r) => r.y).length / won.length * 100).toFixed(0)}%；預測為敵方時 ${(lost.filter((r) => r.y).length / lost.length * 100).toFixed(0)}%`);

console.log('\nJSON：' + JSON.stringify({ win: P, surv: { b: { assault: u[0], gunship: u[1], support: u[2] }, c1: u[3], c2: u[4], c3: u[5] } }, (k, x) => (typeof x === 'number' ? +x.toFixed(4) : x)));
