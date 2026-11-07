// 戰力公式校正用的資料：大量打真實的 AI 對 AI 戰鬥（觀摩的全隨機布局：難度、打法、艦隊類型、數量隨機），
// 一方的兵力再隨機乘 0.45～2.2 倍，記下開戰時雙方的編成、指揮官、打法，以及結束時各艦種存活數與勝負。
// 多個分頁同時打（各自一個渲染行程）。每場一行寫進 dev/test-results/battlecal-<tag>.jsonl（可以中途停，已打的保留）。
// 用法（在 dev 資料夾，web/ 要先有建置）：
//   node tools/battlecal.mjs --n=600 --tabs=5 --big=0.2 --tag=名稱
//   之後用 node tools/powerfit.mjs --tag=名稱 擬合公式、看準確度
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, connect, openGame } from './harness.mjs';

const N = +arg('n', 600), TABS = +arg('tabs', 5), BIG = +arg('big', 0.2), maxMin = +arg('maxmin', 20), seed0 = +arg('seed', 1);
const tag = arg('tag', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));
const outDir = path.join(ROOT, 'dev', 'test-results');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `battlecal-${tag}.jsonl`);
const done = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).i) : [];
const todo = Array.from({ length: N }, (_, i) => i).filter((i) => !done.includes(i));
// 簡單的可重現亂數（決定規模與兵力倍率）
const hash = (i, k) => { let x = (i * 2654435761 + k * 40503 + seed0 * 97) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822507) >>> 0; x ^= x >>> 13; x = Math.imul(x, 3266489909) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

const srv = await startServer({ port: +arg('port', 8101) });
const b = await launchBrowser({ gpu: arg('gpu', '1') !== '0', width: 1280, height: 720, port: 9349 });
const tabs = [b];
try {
  while (tabs.length < TABS) {
    const t = await (await fetch(`http://127.0.0.1:${b.port}/json/new?about:blank`, { method: 'PUT' })).json();
    tabs.push(await connect(t.webSocketDebuggerUrl));
  }
  const session = await register(srv.url, 'bcal');
  let next = 0, nDone = 0; const t0 = Date.now();
  async function worker(t) {
    while (next < todo.length) {
      const i = todo[next++];
      const size = hash(i, 1) < BIG ? 1 : 0, scale = Math.exp((hash(i, 2) * 2 - 1) * 0.8), seed = 50000 + i * 31 + seed0 * 7919;
      try {
        await openGame(t, srv.url, session, '');
        const setup = JSON.parse(await t.ev(`(() => { const D = __demo;
          STORE.setItem('fleet.watch2', JSON.stringify({ size: ${size}, terr: 0, seed: ${seed}, s: [{ lv: -1, tac: 'rand', arch: -1, n: -1 }, { lv: -1, tac: 'rand', arch: -1, n: -1 }] }));
          D.watchGo(false);
          for (const f of D.SIM.m.fleets) if (f.side === 1) f.comp = f.comp.map((n) => Math.round(n * ${scale}));
          D.simStart(); D.setPaused(true);
          const typeAlive = (s) => { const a = [0, 0, 0, 0, 0, 0]; for (const f of D.fleets()) if (f.side === s && !f.reserve) for (const q of f.sqs) q.typeAlive.forEach((n, k) => (a[k] += Math.max(0, n))); return a; };
          return JSON.stringify({ sides: D.SIM.m.ais || D.SIM.m.sides, fac: D.SIM.m.fac || 0, fleets: D.SIM.m.fleets.map((f) => ({ side: f.side, supply: !!f.supply, comp: f.comp, formation: f.formation, cmdr: { level: f.cmdr.level, trait: f.cmdr.trait, skills: f.cmdr.skills }, ai: f.ai })),
            start: [typeAlive(0), typeAlive(1)], player: D.GAME.playerSide });
        })()`));
        let ticks = 0, wall = 0, res = null;
        while (!res && ticks < maxMin * 3600) {
          const o = await t.ev(`(() => { const D = __demo, t0 = performance.now(); D.step(300); const G = D.GAME;
            return { ms: performance.now() - t0, res: G.result ? { kind: G.result.kind, why: G.result.why || '' } : G.phase !== 'battle' ? { kind: 'phase', why: G.phase } : null }; })()`);
          ticks += 300; wall += o.ms; res = o.res;
        }
        const end = JSON.parse(await t.ev(`JSON.stringify([0, 1].map((s) => { const a = [0, 0, 0, 0, 0, 0]; for (const f of __demo.fleets()) if (f.side === s && !f.reserve) for (const q of f.sqs) q.typeAlive.forEach((n, k) => (a[k] += Math.max(0, n))); return a; }))`));
        const winner = res && res.kind === 'win' ? setup.player : res && res.kind === 'lose' ? 1 - setup.player : -1;
        fs.appendFileSync(file, JSON.stringify({ i, size, scale, seed, ...setup, end, res, winner, simSec: ticks / 60, wallSec: wall / 1000 }) + '\n');
        nDone++;
        if (nDone % 20 === 0) console.log(`${nDone}／${todo.length} 場　${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
      } catch (e) { console.log(`第 ${i} 場失敗：${e.message.split('\n')[0]}`); await sleep(1000); }
    }
  }
  await Promise.all(tabs.map(worker));
  console.log(`完成 ${nDone} 場，${((Date.now() - t0) / 60000).toFixed(1)} 分鐘　→ ${path.relative(process.cwd(), file)}`);
} finally {
  b.close(); srv.stop();
}
