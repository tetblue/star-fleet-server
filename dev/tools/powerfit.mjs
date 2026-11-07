// 戰力公式擬合：讀 battlecal.mjs 打出來的真實戰鬥，擬合「戰力比 → 勝率」與勝方損失，報告準確度。
// 戰力從艦種的數值算（新艦種、改造、升級改了數值就自動跟著變）：
//   攻擊 a＝主砲＋副砲每秒傷害×命中 ＋ wA×防空每秒傷害 ＋ wM×飛彈總傷害 ＋ wF×艦載機數
//   耐久 d＝船體 ＋ wS×護盾 ＋ wR×維修量（每秒）×100
//   一方的戰力差 x＝γ·ln(A0/A1) ＋ δ·ln(D0/D1) ＋ λ·(難度差) ＋ 打法修正差 ＋ b；勝率＝1/(1+e^−x)
// 用法：node tools/powerfit.mjs --tag=cal1
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg } from './harness.mjs';

const tag = arg('tag', 'cal1');
const rows = fs.readFileSync(path.join(ROOT, 'dev', 'test-results', `battlecal-${tag}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  .filter((r) => r.winner === 0 || r.winner === 1);
// 艦種數值直接從原始碼讀
const src = fs.readFileSync(path.join(ROOT, 'dev', 'src', 'data.js'), 'utf8');
const s0 = src.indexOf('const SHIP_TYPES = ['), s1 = src.indexOf('\n];', s0);
const TYPES = new Function('return ' + src.slice(s0 + 'const SHIP_TYPES = '.length, s1 + 2))();
const TACS = ['push', 'kite', 'flank', 'breakthrough'];
const sum = (a) => a.reduce((x, y) => x + y, 0);
const gunDps = (g) => (g ? g.dmg / g.cd * g.acc : 0);
const feat = TYPES.map((t) => ({ gun: gunDps(t.guns.main) + gunDps(t.guns.sec), aa: gunDps(t.guns.aa), mis: t.missile ? t.missile.dmg * t.missile.n : 0, ftr: t.fighters ? t.fighters.n : 0,
  hp: t.hp, sh: t.sh, rep: t.repair ? t.repair.n * t.repair.amount / t.repair.cd : 0, cost: t.cost }));
const shipA = (f, w) => f.gun + w.wA * f.aa + w.wM * f.mis + w.wF * f.ftr;
const shipD = (f, w) => f.hp + w.wS * f.sh + w.wR * f.rep * 100;
const sideSum = (n, fn) => n.reduce((s, k, t) => s + k * fn(feat[t]), 0);

// ───── 邏輯斯迴歸（牛頓法，小 L2） ─────
function solve(A, bv) { const n = bv.length, M = A.map((r, i) => [...r, bv[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-9; for (let r = 0; r < n; r++) if (r !== c) { const k = M[r][c] / d; for (let k2 = c; k2 <= n; k2++) M[r][k2] -= k * M[c][k2]; } }
  return M.map((r, i) => r[n] / (r[i] || 1e-9)); }
function logit(X, y, l2 = 0.01) {
  const k = X[0].length; let w = Array(k).fill(0);
  for (let it = 0; it < 30; it++) {
    const g = Array(k).fill(0), H = Array.from({ length: k }, () => Array(k).fill(0));
    X.forEach((x, i) => { const p = 1 / (1 + Math.exp(-x.reduce((s, v, j) => s + v * w[j], 0))), e = p - y[i], v = p * (1 - p);
      for (let a = 0; a < k; a++) { g[a] += e * x[a]; for (let b2 = 0; b2 < k; b2++) H[a][b2] += v * x[a] * x[b2]; } });
    for (let a = 0; a < k; a++) { g[a] += l2 * w[a]; H[a][a] += l2; }
    const step = solve(H, g); w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  return w;
}
const pred = (x, w) => 1 / (1 + Math.exp(-x.reduce((s, v, j) => s + v * w[j], 0)));
function evalModel(X, y, folds = 5) {   // 交叉驗證：沒看過的戰鬥上的準確率與 log loss
  let hit = 0, ll = 0; const P = Array(y.length);
  for (let f = 0; f < folds; f++) {
    const tr = X.map((_, i) => i).filter((i) => i % folds !== f), te = X.map((_, i) => i).filter((i) => i % folds === f);
    const w = logit(tr.map((i) => X[i]), tr.map((i) => y[i]));
    for (const i of te) { const p = Math.min(1 - 1e-6, Math.max(1e-6, pred(X[i], w))); P[i] = p; hit += (p > 0.5) === (y[i] === 1); ll -= y[i] ? Math.log(p) : Math.log(1 - p); }
  }
  return { acc: hit / y.length, ll: ll / y.length, P };
}
// 特徵：[ln A 比, ln D 比, 難度差, 打法差×3, 常數]
function features(r, w, opt) {
  const n = r.start, A = n.map((c) => sideSum(c, (f) => shipA(f, w))), D = n.map((c) => sideSum(c, (f) => shipD(f, w)));
  const x = [Math.log(A[0] / A[1]), Math.log(D[0] / D[1])];
  if (opt.cmd) { x.push(r.sides[0].lv - r.sides[1].lv); for (let k = 1; k < TACS.length; k++) x.push((r.sides[0].tac === TACS[k]) - (r.sides[1].tac === TACS[k])); }
  x.push(1);
  return x;
}
const y = rows.map((r) => (r.winner === 0 ? 1 : 0));
console.log(`戰鬥 ${rows.length} 場（小型 ${rows.filter((r) => r.size === 0).length}、中型 ${rows.filter((r) => r.size === 1).length}）\n`);

// 基準 1：只看造價（現在的 cost）
const Xc = rows.map((r) => [Math.log(sideSum(r.start[0], (f) => f.cost) / sideSum(r.start[1], (f) => f.cost)), 1]);
const ec = evalModel(Xc, y);
// 基準 2：只看艦數
const Xn = rows.map((r) => [Math.log(sum(r.start[0]) / sum(r.start[1])), 1]);
const en = evalModel(Xn, y);
// 搜尋艦種數值的權重
let best = null;
for (const wA of [0, 0.5, 1, 2]) for (const wM of [0, 0.005, 0.01, 0.02, 0.04]) for (const wF of [0, 0.5, 1, 2, 4]) for (const wS of [0.5, 1, 1.5]) for (const wR of [0, 1, 3]) {
  const w = { wA, wM, wF, wS, wR }, X = rows.map((r) => features(r, w, { cmd: true })), e = evalModel(X, y);
  if (!best || e.ll < best.e.ll) best = { w, e, X };
}
const Xs = rows.map((r) => features(r, best.w, { cmd: false })), es = evalModel(Xs, y);
const coef = logit(best.X, y);
const pct = (v) => (v * 100).toFixed(1) + '%';
console.log('預測勝負的準確率（5 折交叉驗證：用沒參與擬合的戰鬥來測）');
console.log(`  只看艦數                     ${pct(en.acc)}　log loss ${en.ll.toFixed(3)}`);
console.log(`  只看造價（cost）             ${pct(ec.acc)}　log loss ${ec.ll.toFixed(3)}`);
console.log(`  艦種數值                     ${pct(es.acc)}　log loss ${es.ll.toFixed(3)}`);
console.log(`  艦種數值＋難度＋打法         ${pct(best.e.acc)}　log loss ${best.e.ll.toFixed(3)}`);
console.log(`\n權重 ${JSON.stringify(best.w)}`);
console.log(`係數　攻擊 γ=${coef[0].toFixed(2)}　耐久 δ=${coef[1].toFixed(2)}　難度每級 λ=${coef[2].toFixed(2)}　打法（相對推進）${TACS.slice(1).map((t, k) => `${t} ${coef[3 + k].toFixed(2)}`).join('、')}　常數 ${coef[6].toFixed(2)}`);
console.log('\n各艦種的換算（攻擊、耐久、戰力值＝√(攻擊×耐久)，以護衛艦＝1；對照現在的造價）');
const v = feat.map((f) => Math.sqrt(shipA(f, best.w) * shipD(f, best.w))), v4 = v[4];
TYPES.forEach((t, i) => console.log(`  ${t.name.padEnd(4, '　')} 攻擊 ${shipA(feat[i], best.w).toFixed(2).padStart(6)}　耐久 ${shipD(feat[i], best.w).toFixed(0).padStart(4)}　戰力值 ${(v[i] / v4).toFixed(2).padStart(5)}　造價 ${t.cost}`));
// 校準：預測勝率分組 vs 實際
console.log('\n預測勝率分組 → 實際勝率（同一批交叉驗證的預測）');
const bins = [[0, 0.1], [0.1, 0.3], [0.3, 0.5], [0.5, 0.7], [0.7, 0.9], [0.9, 1.01]];
for (const [lo, hi] of bins) { const ix = best.e.P.map((p, i) => [p, i]).filter(([p]) => p >= lo && p < hi); if (!ix.length) continue;
  console.log(`  預測 ${Math.round(lo * 100)}～${Math.min(100, Math.round(hi * 100))}%　${String(ix.length).padStart(4)} 場　實際 ${pct(sum(ix.map(([, i]) => y[i])) / ix.length)}　平均預測 ${pct(sum(ix.map(([p]) => p)) / ix.length)}`); }
// 損失：勝方損失比例 vs 預測的優勢
console.log('\n勝方損失（艦數比例）vs 預測勝率');
const L = rows.map((r, i) => { const w = r.winner, p = w === 0 ? best.e.P[i] : 1 - best.e.P[i]; return { p, lw: 1 - sum(r.end[w]) / sum(r.start[w]), ll: 1 - sum(r.end[1 - w]) / sum(r.start[1 - w]) }; });
for (const [lo, hi] of [[0, 0.5], [0.5, 0.7], [0.7, 0.9], [0.9, 0.99], [0.99, 1.01]]) { const g = L.filter((o) => o.p >= lo && o.p < hi); if (!g.length) continue;
  const m = sum(g.map((o) => o.lw)) / g.length, sd = Math.sqrt(sum(g.map((o) => (o.lw - m) ** 2)) / g.length);
  console.log(`  勝方預測勝率 ${Math.round(lo * 100)}～${Math.min(100, Math.round(hi * 100))}%　${String(g.length).padStart(4)} 場　勝方損失 平均 ${pct(m)}（±${pct(sd)}）　敗方損失 平均 ${pct(sum(g.map((o) => o.ll)) / g.length)}`); }
// 爆冷門：預測勝率 ≥ 80% 卻輸的
const up = best.e.P.filter((p, i) => (p >= 0.8 && y[i] === 0) || (p <= 0.2 && y[i] === 1)).length, conf = best.e.P.filter((p) => p >= 0.8 || p <= 0.2).length;
console.log(`\n預測有 80% 以上把握的 ${conf} 場裡，爆冷門 ${up} 場（${pct(up / Math.max(1, conf))}）`);
fs.writeFileSync(path.join(ROOT, 'dev', 'test-results', `powerfit-${tag}.json`), JSON.stringify({ n: rows.length, weights: best.w, coef, acc: { count: en.acc, cost: ec.acc, stats: es.acc, full: best.e.acc } }, null, 2));
