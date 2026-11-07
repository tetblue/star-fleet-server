// 車輪戰耗時：雙方各有一大池兵力，戰場上每方最多 wave 艘（每 fleet 艘一支艦隊）。
// 打一場 → 存活的留在場上、再從池子補滿到 wave 艘 → 再打，直到一方的總兵力打光（低於 end 比例）。
// 戰鬥引擎每場最多 40 個分隊（MAX_SQ），所以波次用「連續的多場戰鬥」近似；存活的船以滿血進下一場（簡化）。
// 用法（在 dev 資料夾，web/ 要先有建置）：
//   node tools/battlewave.mjs                                  預設：50000 對 50000、每波 5000、每艦隊 500
//   node tools/battlewave.mjs --atk=50000 --def=15000 --wave=5000 --fleet=500 --tag=名稱
// 結果寫到 dev/test-results/battlewave-<tag>.json。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, startServer, register, launchBrowser, openGame } from './harness.mjs';

const pool0 = [+arg('atk', 50000), +arg('def', 50000)];
const WAVE = +arg('wave', 5000), FLEET = +arg('fleet', 500), END = +arg('end', 0.03), maxWaves = +arg('maxwaves', 40), maxMin = +arg('maxmin', 20);
const tag = arg('tag', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));
const NT = 5;   // 航母、戰列艦、巡洋艦、驅逐艦、護衛艦
const sum = (a) => a.reduce((x, y) => x + y, 0);
// 按比例取 n 艘（整數，總數剛好 n）
function take(mix, n) {
  const tot = sum(mix); if (tot <= 0 || n <= 0) return Array(NT).fill(0);
  const out = mix.map((m) => Math.floor(m * n / tot)); let r = n - sum(out);
  const frac = mix.map((m, i) => [m * n / tot - out[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; r > 0 && k < frac.length; k++) if (mix[frac[k][1]] - out[frac[k][1]] > 0) { out[frac[k][1]]++; r--; }
  return out;
}

const srv = await startServer({ port: +arg('port', 8099) });
const b = await launchBrowser({ gpu: arg('gpu', '1') !== '0', width: 1280, height: 720, port: 9347 });
const waves = [];
try {
  const session = await register(srv.url, 'bwave');
  // 雙方的池子：用觀摩模式（種子固定）產生的艦隊編成比例
  await openGame(b, srv.url, session, '');
  const tpl = JSON.parse(await b.ev(`(() => { const D = __demo;
    STORE.setItem('fleet.watch2', JSON.stringify({ size: 1, terr: 0, seed: 9001, s: [{ lv: 3, tac: 'rand', arch: -1, n: -1 }, { lv: 3, tac: 'rand', arch: -1, n: -1 }] }));
    D.watchGo(false); D.setPaused(true); return JSON.stringify(D.SIM.m.fleets); })()`));
  // 雙方用同一個艦種比例（兩邊的平均），比較公平；指揮官、打法仍沿用各自的範本
  const mix = Array(NT).fill(0); for (const f of tpl) f.comp.forEach((n, t) => { if (t < NT) mix[t] += n; });
  const pool = [0, 1].map((s) => take(mix, pool0[s]));
  const field = [Array(NT).fill(0), Array(NT).fill(0)];   // 上一波存活、留在戰場的
  const lost = [0, 0];
  let wallTot = 0, simTot = 0;
  for (let w = 1; w <= maxWaves; w++) {
    // 補滿到 WAVE：從池子按比例取
    for (let s = 0; s < 2; s++) {
      const need = Math.min(WAVE - sum(field[s]), sum(pool[s]));
      const add = take(pool[s], need);
      add.forEach((n, t) => { field[s][t] += n; pool[s][t] -= n; });
    }
    const n = field.map(sum);
    if (n[0] < pool0[0] * END || n[1] < pool0[1] * END) break;
    // 拆成每支 FLEET 艘的艦隊，排成橫列（一排 5 支），雙方面對面
    const fleets = [];
    for (let s = 0; s < 2; s++) {
      const K = Math.ceil(n[s] / FLEET), base = tpl.filter((f) => f.side === s);
      let rest = field[s].slice();
      for (let k = 0; k < K; k++) {
        const c = take(rest, Math.min(FLEET, sum(rest))); rest = rest.map((x, t) => x - c[t]);
        const row = Math.floor(k / 5), col = k % 5 - 2;
        fleets.push({ ...base[k % base.length], name: `第${k + 1}艦隊`, comp: c, x: col * 380, z: (s === 0 ? 1 : -1) * (360 + row * 260), reserve: false });
      }
    }
    const seed = 7001 + w * 13;
    await openGame(b, srv.url, session, '');   // 每波重新載入（上一場的戰報畫面會干擾）
    await b.ev(`(() => { const D = __demo;
      STORE.setItem('fleet.watch2', JSON.stringify({ size: 1, terr: 0, seed: ${seed}, s: [{ lv: 3, tac: 'rand', arch: -1, n: -1 }, { lv: 3, tac: 'rand', arch: -1, n: -1 }] }));
      D.watchGo(false);
      D.SIM.m.fleets = ${JSON.stringify(fleets)}; D.SIM.m.seed = ${seed};
      D.simStart(); D.setPaused(true); return true; })()`);
    const start = await b.ev('[__demo.sideAlive(0), __demo.sideAlive(1)]');
    let busy = 0, ticks = 0, res = null;
    while (!res && ticks < maxMin * 3600) {
      const o = await b.ev(`(() => { const D = __demo, t0 = performance.now(); D.step(300); const G = D.GAME;
        return { ms: performance.now() - t0, res: G.result ? (G.result.kind || 'end') + '：' + (G.result.why || '') : G.phase !== 'battle' ? 'phase:' + G.phase : null }; })()`);
      busy += o.ms; ticks += 300; res = o.res;
    }
    // 存活的（各艦種）留到下一波；敗方撤退的也算存活
    const surv = JSON.parse(await b.ev(`JSON.stringify([0, 1].map((s) => { const a = [0, 0, 0, 0, 0];
      for (const f of __demo.fleets()) if (f.side === s && !f.reserve) for (const q of f.sqs) for (let t = 0; t < 5; t++) a[t] += Math.max(0, (q.typeAlive && q.typeAlive[t]) || 0);
      return a; }))`));
    for (let s = 0; s < 2; s++) { surv[s] = surv[s].map((x, t) => Math.min(x, field[s][t])); lost[s] += n[s] - sum(surv[s]); field[s] = surv[s]; }
    wallTot += busy / 1000; simTot += ticks / 60;
    const row = { wave: w, start: n, ships: start, simSec: ticks / 60, wallSec: busy / 1000, res: res || '逾時', after: field.map(sum), pool: pool.map(sum) };
    waves.push(row);
    console.log(`第 ${String(w).padStart(2)} 波　上場 ${n[0]} vs ${n[1]}　遊戲時間 ${(row.simSec / 60).toFixed(1)} 分　背景耗時 ${row.wallSec.toFixed(1)} 秒　${row.res}　` +
      `戰後場上 ${row.after.join(' vs ')}　池子剩 ${row.pool.join(' vs ')}　累計 ${(simTot / 60).toFixed(1)} 分／${wallTot.toFixed(0)} 秒`);
    if (!res) break;
  }
  const tot = [0, 1].map((s) => sum(field[s]) + sum(pool[s]));
  const out = { tag, date: new Date().toISOString(), atk: pool0[0], def: pool0[1], wave: WAVE, fleet: FLEET, waves, simMin: simTot / 60, wallSec: wallTot, remain: tot, lost, errors: b.errors.length };
  console.log(`\n總計 ${waves.length} 波　遊戲時間 ${(simTot / 60).toFixed(1)} 分　背景耗時 ${wallTot.toFixed(0)} 秒（${(wallTot / 60).toFixed(1)} 分）　剩餘 ${tot.join(' vs ')}　損失 ${lost.join(' vs ')}`);
  const outDir = path.join(ROOT, 'dev', 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `battlewave-${tag}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log('結果：' + path.relative(process.cwd(), file));
} finally {
  b.close(); srv.stop();
}
