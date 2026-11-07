// 艦隊戰的長度：同一場觀摩戰鬥（隨機布局，和飛行員出擊同樣的規模），記下
//   舊規則（任一方剩不到 10%＝潰走）會在幾秒結束、新規則（打到一方全滅）在幾秒結束。
// 用法（在 dev 資料夾，web/ 要先有建置）：node tools/battlelen.mjs --runs=12 --tabs=5 --sizes=0,1,2
import { arg, sleep, startServer, register, launchBrowser, connect, openGame } from './harness.mjs';

const RUNS = +arg('runs', 12), TABS = +arg('tabs', 5), SIZES = String(arg('sizes', '0,1,2')).split(',').map(Number), maxMin = +arg('maxmin', 25);
const srv = await startServer({ port: +arg('port', 8108) });
const b = await launchBrowser({ gpu: arg('gpu', '1') !== '0', width: 1280, height: 720, port: +arg('cdp', 9358) });
const tabs = [b], out = [];
const jobs = SIZES.flatMap((size) => Array.from({ length: RUNS }, (_, r) => ({ size, seed: 7001 + r * 17 + size * 1000 })));
try {
  while (tabs.length < TABS) { const t = await (await fetch(`http://127.0.0.1:${b.port}/json/new?about:blank`, { method: 'PUT' })).json(); tabs.push(await connect(t.webSocketDebuggerUrl)); }
  const session = await register(srv.url, 'len');
  let next = 0; const t0 = Date.now();
  async function worker(t) {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        await openGame(t, srv.url, session, '');
        await t.ev(`(() => { const D = __demo;
          STORE.setItem('fleet.watch2', JSON.stringify({ size: ${job.size}, terr: 3, seed: ${job.seed}, s: [{ lv: -1, tac: 'rand', arch: -1, n: -1 }, { lv: -1, tac: 'rand', arch: -1, n: -1 }] }));
          D.watchGo(false); D.simStart(); D.setPaused(true); D.GAME.reportShown = true; window.__rout = null; return true; })()`);
        let res = null, ticks = 0;
        while (!res && ticks < maxMin * 3600) {
          res = await t.ev(`(() => { const D = __demo, G = D.GAME;
            for (let k = 0; k < 5 && !G.result; k++) { D.step(60);
              if (window.__rout == null) for (let s = 0; s < 2; s++) if (D.sideAlive(s) / Math.max(1, G.init[s]) < 0.1) { window.__rout = D.U(); break; } }
            return G.result ? JSON.stringify({ end: D.U(), rout: window.__rout, why: G.result.why }) : G.phase !== 'battle' ? JSON.stringify({ phase: G.phase }) : null; })()`);
          ticks += 300;
        }
        out.push({ ...job, ...(res ? JSON.parse(res) : { end: null }) });
        if (out.length % 5 === 0) console.log(`${out.length}／${jobs.length} 場　${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
      } catch (e) { console.log(`失敗：${e.message.split('\n')[0]}`); await sleep(1000); }
    }
  }
  await Promise.all(tabs.map(worker));
  const NAME = ['小型（標準 300 秒）', '中型（標準 420 秒）', '大型（標準 540 秒）'];
  const q = (a, p) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : '—'; };
  for (const size of SIZES) {
    const o = out.filter((x) => x.size === size);
    console.log(`\n${NAME[size]}：${o.length} 場`);
    console.log(`  舊規則（潰走）結束：最短 ${q(o.map((x) => x.rout), 0)} 秒、中位 ${q(o.map((x) => x.rout), 0.5)} 秒、最長 ${q(o.map((x) => x.rout), 0.99)} 秒`);
    console.log(`  新規則（全滅）結束：最短 ${q(o.map((x) => x.end), 0)} 秒、中位 ${q(o.map((x) => x.end), 0.5)} 秒、最長 ${q(o.map((x) => x.end), 0.99)} 秒`);
    console.log(`  多出來的時間：中位 ${q(o.map((x) => (x.end != null && x.rout != null ? x.end - x.rout : null)), 0.5)} 秒；沒打完（超過 ${maxMin} 分）${o.filter((x) => x.end == null).length} 場`);
  }
} finally { b.close(); srv.stop(); }
