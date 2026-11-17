// 艦長生涯的模型測試（不開瀏覽器）：讀 src 裡生涯用到的檔案，用自動代打跑很多局（每週結束、計算的戰鬥），
// 檢查不出錯，並統計勢力的收入、建設、星系易主、玩家的錢。
// 用法（在 dev 資料夾）：node tools/capcareer-run.mjs --runs=20 --turns=50 --diff=1 [--role=emp] [--auto]
//   --auto：玩家也自動投資（強化勢力建築、蓋自己的建築）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), src = path.join(here, '..', 'src');
const arg = (n, d) => { const a = process.argv.find((s) => s.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : process.argv.includes(`--${n}`) ? true : d; };
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');
// 從大檔案只取某幾個頂層宣告（到下一個頂層宣告為止）
function pick(file, names) {
  const L = read(file).split('\n'), out = [];
  for (const n of names) {
    const i = L.findIndex((l) => new RegExp(`^(const|let|function) ${n}\\b`).test(l)); if (i < 0) throw new Error(`${file} 找不到 ${n}`);
    let j = i + 1; while (j < L.length && !/^(const|let|function|class|var) /.test(L[j])) j++;
    out.push(L.slice(i, j).join('\n'));
  }
  return out.join('\n');
}
// 沒有載入的全域（畫面、音效…）：回傳不做事的替身
const stub = new Proxy(function () { return stub; }, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : stub), apply: () => stub });
const scope = new Proxy({}, { has: (t, k) => !(k in globalThis) && k !== 'arguments', get: (t, k) => (k === Symbol.unscopables ? undefined : stub) });
const files = ['capsquad.js', 'capstate.js', 'caphulls.js', 'starmap.js', 'starmap_career.js', 'capcareer.js'].concat(fs.existsSync(path.join(src, 'capplanet.js')) ? ['capplanet.js'] : []);
const code = 'with (P) {\n' + pick('data.js', ['SHIP_TYPES']) + '\nconst STORE = { getItem: () => null, setItem: () => {} };\nconst smuEsc = (s) => String(s);\n' +
  pick('captain.js', ['CAP_HULLS', 'CAP_DIFF']) + '\nconst GROUND_KEYS = [];\nconst CAP_SPACE_KEYS = [];\n' +
  files.map(read).join('\n') + '\nreturn { ccNewGame, ccWeekA, ccWeekB, ccFightCalc, ccPl, ccOwn, SM_FAC, SM_A, SM_E, SM_P, SM_N, ccRepair, ccResupply, ' +
  (files.includes('capplanet.js') ? 'CP: typeof CP_API !== "undefined" ? CP_API : null' : 'CP: null') + ' };\n}';
const M = new Function('P', code)(scope);

const RUNS = +arg('runs', 20), TURNS = +arg('turns', 50), DIFF = +arg('diff', 1), ROLE = arg('role', 'emp'), AUTO = !!arg('auto');
const agg = { n: [], err: 0, sys: Array.from({ length: Math.ceil(TURNS / 10) + 1 }, () => [0, 0, 0, 0]), inc: [], money: [], pl: [], sq: [], churn: 0, fin: 0, bld: {}, yards: [], tier: [], prosp: [], riot: 0, take: 0, raze: 0 };
const t0 = Date.now();
for (let r = 0; r < RUNS; r++) {
  const S = M.ccNewGame({ seed: 2000 + r, diff: DIFF, role: ROLE, noMeta: true });
  let prev = S.sys.map((s) => s.owner);
  try {
    for (let t = 0; t < TURNS && !S.fin; t++) {
      if (AUTO && M.CP) M.CP.auto(S);
      const P = M.ccPl(S); if (P) { M.ccRepair(S, P); M.ccResupply(S, P); }
      M.ccWeekA(S);
      if (S.pendB) { const B = S.pendB, s = S.sys[B.sys], q = (ids) => ids.map((id) => S.sq.find((x) => x.id === id)).filter(Boolean); M.ccFightCalc(S, s, { A: q(B.A), D: q(B.D), defs: s.defs.filter((d) => d.hp > 0), owner: B.owner }); }
      M.ccWeekB(S);
      const own = S.sys.map((s) => s.owner); agg.churn += own.filter((o, i) => o !== prev[i]).length; prev = own;
      if (S.turn % 10 === 1) { const k = (S.turn - 1) / 10; agg.n[k] = (agg.n[k] || 0) + 1; for (const s of S.sys) agg.sys[k][s.owner]++;
        (agg.money[k] = agg.money[k] || [0, 0, 0]); [0, 1, 2].forEach((f) => (agg.money[k][f] += S.money[f]));
        (agg.pl[k] = agg.pl[k] || 0); agg.pl[k] += S.pl.money;
        (agg.sq[k] = agg.sq[k] || [0, 0, 0]); [0, 1, 2].forEach((f) => (agg.sq[k][f] += S.sq.filter((q) => q.fac === f && q.ships.length).reduce((a, q) => a + q.ships.length, 0)));
        (agg.yards[k] = agg.yards[k] || 0); agg.yards[k] += S.sys.filter((s) => s.yard).length;
        (agg.tier[k] = agg.tier[k] || 0); agg.tier[k] += S.sys.reduce((a, s) => a + s.tier, 0) / S.sys.length;
        (agg.prosp[k] = agg.prosp[k] || 0); agg.prosp[k] += S.sys.reduce((a, s) => a + s.prosp, 0) / S.sys.length;
        if (S.inc) { (agg.inc[k] = agg.inc[k] || [0, 0, 0]); [0, 1, 2].forEach((f) => (agg.inc[k][f] += S.inc[f] || 0)); } }
    }
  } catch (e) { agg.err++; console.log(`第 ${r} 局第 ${S.turn} 週出錯：${e.stack.split('\n').slice(0, 4).join(' | ')}`); }
  if (S.fin) agg.fin++;
  for (const s of S.sys) for (const b of s.bd || []) agg.bld[b.k] = (agg.bld[b.k] || 0) + 1;
  for (const l of S.log) if (l.t.includes('原本是中立')) { const k = l.t.match(/：(.*?)，歸/)[1]; agg.nc = agg.nc || {}; agg.nc[k] = (agg.nc[k] || 0) + 1; }
  agg.riot += S.log.filter((l) => l.t.includes('暴動')).length; agg.take += S.log.filter((l) => l.t.includes('接管')).length; agg.raze += S.log.filter((l) => l.t.includes('破壞了')).length;
}
const per = (v) => (v / RUNS).toFixed(1), fac = ['聯盟', '帝國', '海盜', '中立'];
console.log(`${RUNS} 局 × ${TURNS} 週（難度 ${DIFF}、${ROLE}${AUTO ? '、玩家自動投資' : ''}），${((Date.now() - t0) / 1000).toFixed(1)} 秒；出錯 ${agg.err}、生涯結束 ${agg.fin}、易主 ${per(agg.churn)}／局`);
agg.sys.forEach((v, k) => { if (!agg.money[k]) return; const per = (x) => (x / agg.n[k]).toFixed(1); console.log(`(${agg.n[k]} 局) ` + `第 ${k * 10 + 1} 週：星系 ${v.map((x, f) => `${fac[f]} ${per(x)}`).join('・')}｜勢力資金 ${agg.money[k].map((x) => per(x)).join('／')}｜船 ${agg.sq[k].map((x) => per(x)).join('／')}｜玩家資金 ${per(agg.pl[k])}｜船塢 ${per(agg.yards[k])}｜平均等級 ${(agg.tier[k] / agg.n[k]).toFixed(2)}・繁榮 ${(agg.prosp[k] / agg.n[k]).toFixed(1)}${agg.inc[k] ? `｜收入 ${agg.inc[k].map((x) => per(x)).join('／')}` : ''}`); });
if (Object.keys(agg.bld).length) console.log('最後的建築（每局）：' + Object.entries(agg.bld).map(([k, v]) => `${k} ${per(v)}`).join('・'));
if (agg.nc) console.log('中立被佔領的原因：', JSON.stringify(agg.nc));
console.log(`暴動 ${per(agg.riot)}・接管 ${per(agg.take)}・玩家破壞 ${per(agg.raze)}（每局的紀錄數）`);
