// 星圖模擬器的批次比較（不開網頁）：讀 index.html 的模擬程式，用不同規則跑很多局，比較結果。
// 用法（在 dev 資料夾）：node tools/starmap-sim/batch.mjs --runs=100 --turns=300 --set=siege|wx|raid|all
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const a = process.argv.find((s) => s.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const code = html.slice(html.indexOf('<script>') + 8, html.indexOf('/* ───────── 綁定'));
const SIM = new Function(code + '\nreturn { newGame, autoPick, doTurn, DIFF, counts, owned, X, A, E, P };')();
const RUNS = +arg('runs', 100), TURNS = +arg('turns', 300), SET = arg('set', 'all');

const SETS = {
  siege: [
    ['舊規則（一仗佔領）', { flow: false }],
    ['圍城 3：沒有增援護航', { support: false, wx: 'none' }],
    ['圍城 3：有增援護航', { support: true, wx: 'none' }],
    ['圍城 5：有增援護航', { siegeT: 5, support: true, wx: 'none' }],
  ],
  wx: [
    ['沒有天氣', { wx: 'none' }],
    ['只有太陽風暴', { wx: 'solar' }],
    ['只有離子星雲', { wx: 'ion' }],
    ['只有重力潮汐', { wx: 'grav' }],
    ['三種都有', { wx: 'all' }],
  ],
  raid: [
    ['不能突襲', { raid: false }],
    ['可突襲（無匿蹤科技）', { raid: true, stealth: false }],
    ['可突襲（有匿蹤科技）', { raid: true, stealth: true }],
  ],
};
const STRATS = [['warlord', '自立高手', 1.5], ['loyal', '忠誠軍人', 1]];
const med = (a) => { if (!a.length) return '—'; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (n, d) => (d ? `${Math.round(n / d * 100)}%` : '—');
const RC = { siege: '我方控制軌道', noFleet: '沒有艦隊駐守', storm: '太陽風暴', stealth: '匿蹤躍遷科技' };

for (const setK of SET === 'all' ? Object.keys(SETS) : [SET]) for (const [sk, sname, skill] of STRATS) {
  console.log(`\n■ ${setK}｜策略：${sname}（技巧 ×${skill}），每種 ${RUNS} 局 × ${TURNS} 週，普通難度`);
  console.log('規則                      易手/百週  圍城投降  被解圍/局  增援/局  玩家方佔領/局  玩家方失守：兵力不足｜兵力夠沒派來  ' + (sk === 'warlord' ? '達10星系  自立統一  終結' : '方面軍司令  聯盟統一'));
  const raidRows = [];
  for (const [cname, rules] of SETS[setK]) {
    const a = { cap: 0, capSiege: 0, relief: 0, plCap: 0, sgSup: 0 }, why = [0, 0], rc = {}; let ten = 0, uni = 0, dead = 0, mil3 = 0, aUni = 0;
    for (let r = 0; r < RUNS; r++) {
      const S = SIM.newGame({ id: 'cap', seed: 1000 + r, diff: { ...SIM.DIFF.normal }, pace: 1, skill, rules });
      S.log = null;
      for (let t = 0; t < TURNS && S.pl.status !== '終結'; t++) SIM.doTurn(S, SIM.autoPick(S, sk));
      for (const k of Object.keys(a)) a[k] += S.st[k] || 0;
      if (S.st.why) { why[0] += S.st.why.pl[0]; why[1] += S.st.why.pl[1]; }
      for (const [k, v] of Object.entries(S.st.rc || {})) { rc[k] = rc[k] || [0, 0, 0]; v.forEach((x, i) => (rc[k][i] += x)); }
      if (S.firsts['獨立領主(10星系)'] != null) ten++;
      if (S.firsts['方面軍司令'] != null) mil3++;
      if (S.ms.includes('自立統一星系')) uni++;
      if (S.ms.some((m) => m.startsWith('聯盟統一'))) aUni++;
      if (S.pl.status === '終結') dead++;
    }
    const lost = why[0] + why[1];
    console.log(`${cname.padEnd(14, '　')}  ${(a.cap / RUNS / TURNS * 100).toFixed(1).padStart(8)}  ${pct(a.capSiege, a.cap).padStart(8)}  ${(a.relief / RUNS).toFixed(1).padStart(8)}  ${(a.sgSup / RUNS).toFixed(1).padStart(6)}  ${(a.plCap / RUNS).toFixed(1).padStart(12)}  ` +
      `${lost ? `${pct(why[0], lost)}｜${pct(why[1], lost)}（${(lost / RUNS).toFixed(1)} 個/局）` : '—'}`.padEnd(30) +
      (sk === 'warlord' ? `${pct(ten, RUNS).padStart(8)}  ${pct(uni, RUNS).padStart(8)}  ${pct(dead, RUNS).padStart(4)}` : `${pct(mil3, RUNS).padStart(10)}  ${pct(aUni, RUNS).padStart(8)}`));
    if (Object.keys(rc).length) raidRows.push([cname, rc]);
  }
  for (const [cname, rc] of raidRows) {
    const tot = Object.values(rc).reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
    console.log(`  突襲（${cname}）：每局 ${(tot[0] / RUNS).toFixed(1)} 次，潛入成功 ${pct(tot[1], tot[0])}，任務成功（潛入後）${pct(tot[2], tot[1])}，整體 ${pct(tot[2], tot[0])}　｜ ` +
      Object.entries(rc).map(([k, v]) => `${RC[k] || k}：${v[0]} 次、潛入 ${pct(v[1], v[0])}、任務 ${pct(v[2], v[1])}`).join('；'));
  }
}
