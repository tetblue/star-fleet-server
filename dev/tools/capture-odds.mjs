// 星海生涯：「佔領」任務發下來的時候，玩家手上的兵力打不打得贏目標星系的敵方艦隊（不開瀏覽器）
// 每次發出佔領任務，用星圖的勝率公式 smWinP 算：玩家能指揮的所有艦隊（補滿到編成）一起打
//   ① 目標星系現在的敵方艦隊　② 再加上相鄰星系的敵方艦隊（可能趕來增援）　③ 任務期間目標星系出現過的最強敵軍
// 地面防禦不算（假設已經被癱瘓），只看艦隊戰。
// 用法（在 dev 資料夾）：node tools/capture-odds.mjs --runs=300 --turns=150 --diff=1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), src = path.join(here, '..', 'src');
const arg = (n, d) => { const a = process.argv.find((s) => s.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const data = fs.readFileSync(path.join(src, 'data.js'), 'utf8'), s0 = data.indexOf('const SHIP_TYPES = ['), s1 = data.indexOf('\n];', s0);
const probe = `
function probeForce(S) {   // 玩家能指揮的艦隊（不含特戰小隊），補滿到編成
  const fs = S.fleets.filter((f) => f.pl && !f.cap && smShips(f.comp) > 0);
  let c = new Array(SHIP_TYPES.length).fill(0); for (const f of fs) c = smAdd(c, f.init || f.comp);
  return { fs, c };
}
function probeEnemy(S, fac, ids) { const fs = ids.flatMap((i) => smEnemyAt(S, fac, i)); let c = new Array(SHIP_TYPES.length).fill(0); for (const f of fs) c = smAdd(c, f.comp); return { fs, c }; }
function probeP(S, P, E) {
  if (!smShips(E.c)) return 1; if (!smShips(P.c)) return 0;
  return smWinP(P.c, E.c, smLv(P.fs), smLv(E.fs), S.pl.fac, E.fs[0].fac, smTac(P.fs), smTac(E.fs));
}
return { smNewGame, smAutoTurn, smShips, smVal, smRep, SM_MIL, probeForce, probeEnemy, probeP };`;
const code = data.slice(s0, s1 + 3) + '\nconst STORE = { getItem: () => null, setItem: () => {} };\n' +
  ['starmap.js', 'starmap_career.js', 'starmap_world.js'].map((f) => fs.readFileSync(path.join(src, f), 'utf8')).join('\n') + probe;
const M = new Function(code)();
const RUNS = +arg('runs', 300), TURNS = +arg('turns', 150), DIFF = +arg('diff', 1), START = arg('start', 'cap'), EARLY = +arg('early', 60);

const rows = [];
for (let r = 0; r < RUNS; r++) {
  const S = M.smNewGame({ seed: 5000 + r, diff: DIFF, start: START });
  const track = new Map();   // 任務 id → 紀錄
  for (let t = 0; t < TURNS; t++) {
    M.smAutoTurn(S);
    for (const m of S.pl.missions) {
      if (m.type !== 'capture') continue;
      let R = track.get(m.id);
      if (!R && (m.state === 'open' || m.state === 'offer')) {
        const P = M.probeForce(S), E0 = M.probeEnemy(S, S.pl.fac, [m.sys]), E1 = M.probeEnemy(S, S.pl.fac, [m.sys, ...S.adj[m.sys]]);
        R = { run: r, turn: S.turn, mil: S.pl.mil, kind: m.kind, exam: !!m.exam, loan: !!(m.support && m.support.got), nFleet: P.fs.length,
          pShips: M.smShips(P.c), eShips: M.smShips(E0.c), eAdj: M.smShips(E1.c), p0: M.probeP(S, P, E0), p1: M.probeP(S, P, E1), pMin: M.probeP(S, P, E0), gar: Math.round(S.sys[m.sys].gar), def: S.sys[m.sys].def, state: m.state };
        track.set(m.id, R); rows.push(R);
      }
      if (R && (m.state === 'open' || m.state === 'offer')) {   // 任務期間：目標星系最強的時候
        const P = M.probeForce(S), E = M.probeEnemy(S, S.pl.fac, [m.sys]);
        R.pMin = Math.min(R.pMin, M.probeP(S, P, E)); R.eMax = Math.max(R.eMax || 0, M.smShips(E.c));
      }
      if (R) R.state = m.state;
    }
  }
}
const rep = M.smRep(), pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '—');
const show = (name, L) => {
  const n = L.length; if (!n) { console.log(`${name}：0 個`); return; }
  const c = (f) => L.filter(f).length;
  const med = (k) => { const v = L.map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(n / 2)]; };
  console.log(`\n${name}：${n} 個任務（${(n / RUNS).toFixed(2)} 個／局）`);
  console.log(`  發令當下：目標星系有敵方艦隊 ${pct(c((x) => x.eShips > 0), n)}；玩家兵力中位 ${Math.round(med('pShips') * rep)} 艘、敵方中位 ${Math.round(med('eShips') * rep)} 艘（有敵艦時 ${Math.round((L.filter((x) => x.eShips).map((x) => x.eShips).sort((a, b) => a - b)[Math.floor(c((x) => x.eShips > 0) / 2)] || 0) * rep)} 艘）`);
  console.log(`  ① 只打目標星系現有艦隊：勝率 <5% ${pct(c((x) => x.p0 < 0.05), n)}、<20% ${pct(c((x) => x.p0 < 0.2), n)}、≥50% ${pct(c((x) => x.p0 >= 0.5), n)}、>85% ${pct(c((x) => x.p0 > 0.85), n)}（沒有敵艦隊 ${pct(c((x) => !x.eShips), n)}）`);
  console.log(`  ② 加上相鄰星系的敵艦：勝率 <5% ${pct(c((x) => x.p1 < 0.05), n)}、<20% ${pct(c((x) => x.p1 < 0.2), n)}`);
  console.log(`  ③ 任務期間最糟的時候：勝率 <5% ${pct(c((x) => x.pMin < 0.05), n)}、<20% ${pct(c((x) => x.pMin < 0.2), n)}`);
  console.log(`  有支援艦隊 ${pct(c((x) => x.loan), n)}；結果：完成 ${pct(c((x) => x.state === 'done'), n)}、失敗 ${pct(c((x) => x.state === 'fail'), n)}`);
  const bad = L.filter((x) => x.p0 < 0.05);
  if (bad.length) console.log(`  勝率 <5% 的任務：玩家中位 ${Math.round(bad.map((x) => x.pShips).sort((a, b) => a - b)[Math.floor(bad.length / 2)] * rep)} 艘 vs 敵方中位 ${Math.round(bad.map((x) => x.eShips).sort((a, b) => a - b)[Math.floor(bad.length / 2)] * rep)} 艘；有支援艦隊 ${pct(bad.filter((x) => x.loan).length, bad.length)}；考核 ${pct(bad.filter((x) => x.exam).length, bad.length)}`);
};
console.log(`${RUNS} 局 × ${TURNS} 週（難度 ${DIFF}，開局 ${START}）；勝率＝星圖公式 smWinP，玩家所有艦隊補滿一起打，不算地面防禦`);
show('全部佔領任務', rows);
const perGame = (f) => new Set(rows.filter(f).map((x) => x.run)).size;
console.log(`
每局：前期（第 ${EARLY} 週以前）至少收到一個佔領任務 ${pct(perGame((x) => x.turn <= EARLY), RUNS)}；至少一個勝率 <5% ${pct(perGame((x) => x.turn <= EARLY && x.p0 < 0.05), RUNS)}；至少一個 <20% ${pct(perGame((x) => x.turn <= EARLY && x.p0 < 0.2), RUNS)}`);
console.log(`前期第一個佔領任務：勝率 <5% ${pct(rows.filter((x, i) => x.turn <= EARLY && rows.findIndex((y) => y.run === x.run) === i && x.p0 < 0.05).length, perGame((x) => x.turn <= EARLY))}（第一個任務多半在第 ${(() => { const v = [...new Set(rows.map((x) => x.run))].map((r) => rows.find((x) => x.run === r).turn).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; })()} 週）`);
show(`前期（第 ${EARLY} 週以前）`, rows.filter((x) => x.turn <= EARLY));
for (let k = 1; k <= 3; k++) show(`職位：${M.SM_MIL[k]}`, rows.filter((x) => x.mil === k));
show('上級命令', rows.filter((x) => x.kind === 'order' && !x.exam));
show('升遷考核', rows.filter((x) => x.exam));
show('派系委託', rows.filter((x) => x.kind === 'request'));
