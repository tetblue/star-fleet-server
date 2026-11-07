// 背景戰鬥耗時：AI 對 AI 打一場（觀摩模式的布局），畫面暫停，直接推進模擬到分出勝負，量真實耗時。
// 用來評估星圖戰役「每場戰鬥都真的打」在背景結算要等多久。用法（在 dev 資料夾，web/ 要先有建置）：
//   node tools/battletime.mjs                         預設：小／中／大型各 3 場，兵力倍率 1、3
//   node tools/battletime.mjs --sizes=0,2 --runs=5 --mults=1,2,4 --tag=名稱 --gpu=0
// 結果印成表格，並寫到 dev/test-results/battletime-<tag>.json。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, startServer, register, launchBrowser, openGame } from './harness.mjs';

const sizes = String(arg('sizes', '0,1,2')).split(',').map(Number);
const mults = String(arg('mults', '1,3')).split(',').map(Number).filter((n) => n > 0);
const runs = +arg('runs', 3), maxMin = +arg('maxmin', 20), gpu = arg('gpu', '1') !== '0';
const tag = arg('tag', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));
const SIZE_NAME = ['小型', '中型', '大型'];

const srv = await startServer({ port: +arg('port', 8096) });
const b = await launchBrowser({ gpu, width: 1280, height: 720, port: 9341 });
const rows = [];
try {
  const session = await register(srv.url, 'btime');
  for (const size of sizes) for (const mult of mults) for (let r = 0; r < runs; r++) {
    const seed = 9001 + r * 7 + size * 101;
    await openGame(b, srv.url, session, '');   // 每場重新載入：上一場的戰報畫面會干擾新開的戰鬥
    // 布置：觀摩的全隨機設定、固定種子、無地形；兵力倍率另外放大每支艦隊的編成
    const info = await b.ev(`(() => {
      const D = __demo;
      STORE.setItem('fleet.watch2', JSON.stringify({ size: ${size}, terr: 0, seed: ${seed}, s: [{ lv: -1, tac: 'rand', arch: -1, n: -1 }, { lv: -1, tac: 'rand', arch: -1, n: -1 }] }));
      D.watchGo(false);
      if (${mult} !== 1) { for (const f of D.SIM.m.fleets) f.comp = f.comp.map((n) => Math.round(n * ${mult})); D.simStart(); }
      D.setPaused(true);
      return { name: D.SIM.m.name, ships: [D.sideAlive(0), D.sideAlive(1)] };
    })()`);
    // 推進：每次呼叫跑 5 秒遊戲時間，累計真實耗時（只算模擬，不算繪）
    let wall = 0, ticks = 0, res = null, alive = null;
    const limit = maxMin * 60 * 60;
    while (!res && ticks < limit) {
      const o = await b.ev(`(() => { const D = __demo, t0 = performance.now(); D.step(300); const G = D.GAME;
        const a = [D.sideAlive(0), D.sideAlive(1)];
        const res = G.result ? (G.result.kind || 'end') + '：' + (G.result.why || '') : G.phase !== 'battle' ? '結束（' + G.phase + '）：' + (a[0] > a[1] ? '聯盟方存活' : '帝國方存活') : null;
        return { ms: performance.now() - t0, res, alive: a }; })()`);
      wall += o.ms; ticks += 300; res = o.res; alive = o.alive;
    }
    if (!res) console.log('  逾時診斷：' + JSON.stringify(await b.ev(`(() => { const D = __demo, G = D.GAME, bs = D.battleSetup();
      return { phase: G.phase, noVictory: !!(bs && bs.noVictory), untimed: !!(bs && bs.untimed), init: G.init, op: G.op,
        fleets: D.fleets().map((f) => ({ side: f.side, name: f.name, reserve: !!f.reserve, supply: !!f.supply, ally: !!f.ally, defectAt: f.defectAt, alive: f.sqs ? f.sqs.reduce((a, q) => a + Math.max(0, q.alive || 0), 0) : '?' })) }; })()`)));
    const simSec = ticks / 60, row = { size: SIZE_NAME[size], mult, seed, name: info.name, ships: info.ships, simSec, wallSec: wall / 1000, speedup: simSec / (wall / 1000), result: res || '逾時', alive };
    rows.push(row);
    console.log(`${row.size} ×${mult}　艦數 ${String(info.ships[0]).padStart(5)} vs ${String(info.ships[1]).padEnd(5)}　遊戲時間 ${(simSec / 60).toFixed(1).padStart(5)} 分　真實耗時 ${row.wallSec.toFixed(1).padStart(6)} 秒　加速 ${row.speedup.toFixed(1).padStart(5)}×　${row.result}　剩 ${alive.join(' vs ')}`);
  }
  if (b.errors.length) console.log('\n頁面錯誤：\n' + b.errors.slice(0, 10).join('\n'));
  const outDir = path.join(ROOT, 'dev', 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `battletime-${tag}.json`);
  fs.writeFileSync(file, JSON.stringify({ tag, date: new Date().toISOString(), gpu, rows, errors: b.errors }, null, 2));
  console.log('\n結果：' + path.relative(process.cwd(), file));
} finally {
  b.close(); srv.stop();
}
