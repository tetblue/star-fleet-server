// 星海生涯的模型測試（不開瀏覽器）：讀 src/starmap.js，用自動策略跑很多局，檢查不出錯、看局勢變化。
// 用法（在 dev 資料夾）：node tools/starmap-run.mjs --runs=50 --turns=300 --diff=1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), src = path.join(here, '..', 'src');
const arg = (n, d) => { const a = process.argv.find((s) => s.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const data = fs.readFileSync(path.join(src, 'data.js'), 'utf8'), s0 = data.indexOf('const SHIP_TYPES = ['), s1 = data.indexOf('\n];', s0);
const code = data.slice(s0, s1 + 3) + '\nconst STORE = { getItem: () => null, setItem: () => {} };\n' + fs.readFileSync(path.join(src, 'starmap.js'), 'utf8') +
  '\nreturn { smNewGame, smAutoTurn, smCounts, smShips, smVal, smOwned, smPlFleets, SM_FAC, SM_A, SM_E, SM_P, SM_N };';
const M = new Function(code)();
const RUNS = +arg('runs', 50), TURNS = +arg('turns', 300), DIFF = +arg('diff', 1);

const agg = { err: 0, cap: [0, 0, 0, 0], battles: 0, plBattles: 0, churn: 0, unify: [0, 0], dead: [0, 0, 0], ships: [], sys: [], fleets: [], waves: 0, maxWaves: 0, retreats: 0, truce: 0, ms: [] };
const t0 = Date.now();
for (let r = 0; r < RUNS; r++) {
  const S = M.smNewGame({ seed: 1000 + r, diff: DIFF });
  let prev = S.sys.map((s) => s.owner), uni = null;
  try {
    for (let t = 0; t < TURNS; t++) {
      M.smAutoTurn(S);
      const own = S.sys.map((s) => s.owner); agg.churn += own.filter((o, i) => o !== prev[i]).length; prev = own;
      for (const rep of S.reports.filter((x) => x.turn === S.turn - 1)) for (const F of rep.fights) { agg.waves += F.waves.length; agg.maxWaves = Math.max(agg.maxWaves, F.waves.length); agg.retreats += F.retreated[0].length + F.retreated[1].length; }
      const c = M.smCounts(S);
      if (uni == null && (c[M.SM_A] >= S.sys.length * 0.8 || c[M.SM_E] >= S.sys.length * 0.8)) uni = { f: c[M.SM_A] > c[M.SM_E] ? 0 : 1, t: S.turn };
      if (S.turn % 50 === 1) { const k = (S.turn - 1) / 50; agg.sys[k] = agg.sys[k] || [0, 0, 0, 0]; c.forEach((v, i) => (agg.sys[k][i] += v));
        agg.ships[k] = agg.ships[k] || [0, 0, 0]; [0, 1, 2].forEach((f) => (agg.ships[k][f] += S.fleets.filter((o) => o.fac === f).reduce((a, o) => a + M.smShips(o.comp), 0))); }
    }
  } catch (e) { agg.err++; console.log(`第 ${r} 局第 ${S.turn} 週出錯：${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
  for (let f = 0; f < 4; f++) agg.cap[f] += S.st.cap[f];
  agg.battles += S.st.battles; agg.plBattles += S.st.plBattles;
  if (uni) { agg.unify[uni.f]++; agg.ms.push(uni.t); }
  const c = M.smCounts(S); [0, 1, 2].forEach((f) => { if (!c[f]) agg.dead[f]++; });
  agg.truce += S.log.filter((l) => l.t.includes('停戰協定')).length;
}
const per = (v) => (v / RUNS).toFixed(1);
console.log(`\n${RUNS} 局 × ${TURNS} 週（難度 ${DIFF}），${((Date.now() - t0) / 1000).toFixed(1)} 秒，出錯 ${agg.err} 局`);
console.log(`每局：戰鬥 ${per(agg.battles)} 場（玩家參與 ${per(agg.plBattles)}）、易手 ${per(agg.churn)} 次（每百週 ${(agg.churn / RUNS / TURNS * 100).toFixed(1)}）、停戰 ${per(agg.truce)} 次`);
console.log(`佔領次數／局：聯盟 ${per(agg.cap[0])}、帝國 ${per(agg.cap[1])}、海盜 ${per(agg.cap[2])}`);
console.log(`戰鬥：平均 ${(agg.waves / Math.max(1, agg.battles)).toFixed(2)} 波、最多 ${agg.maxWaves} 波；撤退 ${per(agg.retreats)} 支／局`);
console.log(`統一（佔 80% 星系）：聯盟 ${agg.unify[0]} 局、帝國 ${agg.unify[1]} 局${agg.ms.length ? `，中位第 ${agg.ms.sort((a, b) => a - b)[Math.floor(agg.ms.length / 2)]} 週` : ''}；滅亡：聯盟 ${agg.dead[0]}、帝國 ${agg.dead[1]}、海盜 ${agg.dead[2]} 局`);
console.log('星系數（聯盟／帝國／海盜／中立）與艦數（聯盟／帝國／海盜），每 50 週的平均：');
agg.sys.forEach((c, k) => console.log(`  第 ${k * 50 + 1} 週：${c.map((v) => (v / RUNS).toFixed(1)).join('／')}　艦數 ${agg.ships[k].map((v) => Math.round(v / RUNS)).join('／')}`));
