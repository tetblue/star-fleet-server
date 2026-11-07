// 多場戰鬥同時計算：開 K 個分頁（各自一個渲染行程＝可以用到不同 CPU 核心），每頁各打一場 AI 對 AI，
// 量 K 場一起打完要多久，和一場一場打比較。評估星圖「回合結束一次模擬剩下的戰鬥」能不能平行。
// 用法（在 dev 資料夾，web/ 要先有建置）：
//   node tools/battlepar.mjs                    預設：中型、同時 1／2／4／6／8 場
//   node tools/battlepar.mjs --size=0 --ks=1,2,4,8 --mult=1 --tag=名稱
// 結果寫到 dev/test-results/battlepar-<tag>.json。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, connect, openGame } from './harness.mjs';

const size = +arg('size', 1), mult = +arg('mult', 1), maxMin = +arg('maxmin', 20);
const ks = String(arg('ks', '1,2,4,6,8')).split(',').map(Number).filter((n) => n > 0);
const tag = arg('tag', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));
const SIZE_NAME = ['小型', '中型', '大型'];

const srv = await startServer({ port: +arg('port', 8097) });
const b = await launchBrowser({ gpu: arg('gpu', '1') !== '0', width: 1280, height: 720, port: 9343 });
const tabs = [b];
const rows = [];
// 多開分頁：DevTools 的 /json/new 會開新的瀏覽情境，各自一個渲染行程
async function addTab() {
  const r = await fetch(`http://127.0.0.1:${b.port}/json/new?about:blank`, { method: 'PUT' });
  const t = await r.json();
  const c = await connect(t.webSocketDebuggerUrl);
  tabs.push(c);
}
// 一個分頁打一場：布置後暫停，每次推進 5 秒遊戲時間，直到分出勝負
async function fight(t, seed) {
  await t.ev(`(() => { const D = __demo;
    STORE.setItem('fleet.watch2', JSON.stringify({ size: ${size}, terr: 0, seed: ${seed}, s: [{ lv: -1, tac: 'rand', arch: -1, n: -1 }, { lv: -1, tac: 'rand', arch: -1, n: -1 }] }));
    D.watchGo(false);
    if (${mult} !== 1) { for (const f of D.SIM.m.fleets) f.comp = f.comp.map((n) => Math.round(n * ${mult})); D.simStart(); }
    D.setPaused(true); return true; })()`);
  const ships = await t.ev('[__demo.sideAlive(0), __demo.sideAlive(1)]');
  const t0 = Date.now(); let busy = 0, ticks = 0, res = null;
  while (!res && ticks < maxMin * 3600) {
    const o = await t.ev(`(() => { const D = __demo, t0 = performance.now(); D.step(300); const G = D.GAME;
      return { ms: performance.now() - t0, res: G.result ? (G.result.kind || 'end') : G.phase !== 'battle' ? 'phase:' + G.phase : null }; })()`);
    busy += o.ms; ticks += 300; res = o.res;
  }
  return { seed, ships, simSec: ticks / 60, busySec: busy / 1000, wallSec: (Date.now() - t0) / 1000, res: res || '逾時' };
}
try {
  const session = await register(srv.url, 'bpar');
  const maxK = Math.max(...ks);
  while (tabs.length < maxK) await addTab();
  for (const k of ks) {
    // 每輪都重新載入（避免上一場的戰報畫面干擾），載入不計時
    await Promise.all(tabs.slice(0, k).map((t) => openGame(t, srv.url, session, '')));
    await sleep(500);
    const seeds = Array.from({ length: k }, (_, i) => 9001 + i * 7 + size * 101);
    const t0 = Date.now();
    const res = await Promise.all(tabs.slice(0, k).map((t, i) => fight(t, seeds[i])));
    const wall = (Date.now() - t0) / 1000;
    const sumSim = res.reduce((a, r) => a + r.simSec, 0), sumBusy = res.reduce((a, r) => a + r.busySec, 0);
    const row = { k, wallSec: wall, perBattleSec: wall / k, sumBusySec: sumBusy, throughput: sumSim / wall, battles: res };
    rows.push(row);
    console.log(`同時 ${String(k).padStart(2)} 場　全部打完 ${wall.toFixed(1).padStart(6)} 秒　平均每場 ${(wall / k).toFixed(1).padStart(5)} 秒　` +
      `單場最慢 ${Math.max(...res.map((r) => r.wallSec)).toFixed(1).padStart(5)} 秒　總遊戲時間/真實 ${row.throughput.toFixed(1)}×　` +
      `艦數 ${res.map((r) => r.ships[0] + r.ships[1]).join('/')}　${res.map((r) => r.res).join(',')}`);
  }
  const errs = tabs.flatMap((t) => t.errors);
  if (errs.length) console.log('\n頁面錯誤：\n' + errs.slice(0, 10).join('\n'));
  const outDir = path.join(ROOT, 'dev', 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `battlepar-${tag}.json`);
  fs.writeFileSync(file, JSON.stringify({ tag, date: new Date().toISOString(), size: SIZE_NAME[size], mult, rows, errors: errs }, null, 2));
  console.log('\n結果：' + path.relative(process.cwd(), file));
} finally {
  b.close(); srv.stop();
}
