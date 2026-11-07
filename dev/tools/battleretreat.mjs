// 躍遷撤退門檻測試：雙方各 F 支艦隊（每支 S 艘），戰場上每方同時最多 K 支，其餘在場外待命。
// 邊 0 的每支艦隊各自計算：剩餘艦數 / 開戰時艦數 < 門檻 → 開始充能，charge 秒後躍遷離場（充能中照常被打）；
// 空出的位置由下一支待命艦隊補上。邊 1 不撤退（打到全滅或潰逃）。其他條件雙方完全相同。
// 量：邊 0 的勝率、撤退成功率（充能完成時還有船的比例）、撤退保住的艦數、雙方損失。
// 用法（在 dev 資料夾，web/ 要先有建置）：
//   node tools/battleretreat.mjs --th=0,20,35,50,65 --runs=20 --charge=10 --tabs=5 --tag=名稱
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, connect, openGame } from './harness.mjs';

const TH = String(arg('th', '0,20,35,50,65')).split(',').map(Number);
const RUNS = +arg('runs', 20), CHARGE = +arg('charge', 10), TABS = +arg('tabs', 5), F = +arg('fleets', 6), S = +arg('ships', 600), K = +arg('field', 3), maxMin = +arg('maxmin', 15);
const OPP = +arg('opp', 0), RS = +arg('side', 0);   // RS：哪一邊用撤退門檻（另一邊用 OPP）   // 邊 1 的撤退門檻（預設 0＝不撤退）
const tag = arg('tag', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));
const MIX = [0.04, 0.16, 0.28, 0.28, 0.24];   // 均衡型
const comp = MIX.map((x) => Math.round(S * x));

const srv = await startServer({ port: +arg('port', 8103) });
const b = await launchBrowser({ gpu: arg('gpu', '1') !== '0', width: 1280, height: 720, port: 9351 });
const tabs = [b];
const jobs = []; for (const th of TH) for (let r = 0; r < RUNS; r++) jobs.push({ th, r, seed: 3001 + r * 17 });
const out = [];
try {
  while (tabs.length < TABS) { const t = await (await fetch(`http://127.0.0.1:${b.port}/json/new?about:blank`, { method: 'PUT' })).json(); tabs.push(await connect(t.webSocketDebuggerUrl)); }
  const session = await register(srv.url, 'bret');
  let next = 0; const t0 = Date.now();
  async function worker(t) {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        await openGame(t, srv.url, session, '');
        const fleets = [];
        for (let s = 0; s < 2; s++) for (let k = 0; k < F; k++) {
          const col = k % K - (K - 1) / 2;
          fleets.push({ side: s, name: `第${k + 1}艦隊`, cmdr: { base: null, name: '指揮官', title: '', trait: 'dmg', level: 5, mode: 'lv', tal: {}, skills: ['focus'] },
            comp: comp.slice(), hangar: [2, 2, 1, 1], formation: 'line', orderly: false, layers: 1, x: Math.round(col * 380), z: s ? -360 : 360, y: 0, h: s ? 0 : Math.PI,
            ai: { tactic: 'push', level: 3 }, reserve: k >= K, at: 1e9 });
        }
        await t.ev(`(() => { const D = __demo;
          STORE.setItem('fleet.watch2', JSON.stringify({ size: 0, terr: 0, seed: ${job.seed}, s: [{ lv: 2, tac: 'push', arch: 0, n: 1 }, { lv: 2, tac: 'push', arch: 0, n: 1 }] }));
          D.watchGo(false); D.SIM.m.fleets = ${JSON.stringify(fleets)}; D.SIM.m.seed = ${job.seed}; D.SIM.m.sides = [{ lv: 2, tac: 'push' }, { lv: 2, tac: 'push' }];
          D.simStart(); D.setPaused(true); D.GAME.reportShown = true;
          // 撤退與補位的規則（每秒檢查一次）
          const TH = ${RS} ? [${OPP / 100}, ${job.th / 100}] : [${job.th / 100}, ${OPP / 100}], CH = ${CHARGE}, K = ${K};
          const st = window.__rt = { jumps: [[], []], gone: new Set() };
          const alive = (f) => f.sqs.reduce((a, q) => a + Math.max(0, q.alive), 0);
          st.tick = () => {
            const t = D.U(), G = D.GAME;
            for (let s = 0; s < 2; s++) {
              const mine = D.fleets().filter((f) => f.side === s && !f.supply);
              for (const f of mine) {
                if (f.reserve || st.gone.has(f)) continue;
                const n = alive(f);
                if (f._jumpAt == null && n > 0 && TH[s] > 0 && n / f.initial < TH[s]) { f._jumpAt = t + CH; f._n0 = n; }
                if (f._jumpAt != null && t >= f._jumpAt) {   // 躍遷離場
                  st.jumps[s].push({ n0: f._n0, n1: n, init: f.initial });
                  st.gone.add(f); f.reserve = true; f.activateAt = null; G.init[s] = Math.max(1, G.init[s] - f.initial);
                  for (const q of f.sqs) { q.bg = true; q.hidden = true; if (q.group) q.group.inactive = true; }
                } else if (f._jumpAt != null && n <= 0) { st.jumps[s].push({ n0: f._n0, n1: 0, init: f.initial }); st.gone.add(f); }
              }
              const active = mine.filter((f) => !f.reserve && !st.gone.has(f) && alive(f) > 0).length;
              const wait = mine.filter((f) => f.reserve && !st.gone.has(f) && f.activateAt != null && f.activateAt > t + 1);
              for (let k = active; k < K && wait.length; k++) wait.shift().activateAt = t;   // 補位：下一支待命艦隊進場
            }
          };
          return true; })()`);
        let ticks = 0, res = null;
        while (!res && ticks < maxMin * 3600) {
          res = await t.ev(`(() => { const D = __demo; for (let k = 0; k < 5 && !D.GAME.result; k++) { D.step(60); window.__rt.tick(); }
            const G = D.GAME; return G.result ? G.result.kind + '：' + (G.result.why || '') : G.phase !== 'battle' ? 'phase:' + G.phase : null; })()`);
          ticks += 300;
        }
        const r = JSON.parse(await t.ev(`(() => { const D = __demo, st = window.__rt, alive = (f) => f.sqs.reduce((a, q) => a + Math.max(0, q.alive), 0);
          const side = (s) => { const mine = D.fleets().filter((f) => f.side === s && !f.supply);
            const used = mine.filter((f) => !f.reserve || st.gone.has(f));   // 有上場過的
            const left = mine.filter((f) => !f.reserve && !st.gone.has(f)).reduce((a, f) => a + alive(f), 0);
            const unused = mine.filter((f) => f.reserve && !st.gone.has(f)).reduce((a, f) => a + f.initial, 0);
            return { left, unused, saved: st.jumps[s].reduce((a, j) => a + j.n1, 0), jumps: st.jumps[s], used: used.length }; };
          return JSON.stringify({ s0: side(0), s1: side(1), player: D.GAME.playerSide }); })()`));
        const kind = res ? res.split('：')[0] : null;
        const winner = kind === 'win' ? r.player : kind === 'lose' ? 1 - r.player : -1;
        out.push({ ...job, res, winner, simSec: ticks / 60, ...r });
        if (out.length % 10 === 0) console.log(`${out.length}／${jobs.length} 場　${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
      } catch (e) { console.log(`門檻 ${job.th}% 第 ${job.r} 場失敗：${e.message.split('\n')[0]}`); await sleep(1000); }
    }
  }
  await Promise.all(tabs.map(worker));
  // 彙整
  const total = F * (S + 1);   // 每支多一艘旗艦
  console.log(`\n每方 ${F} 支×${S} 艘（場上最多 ${K} 支），充能 ${CHARGE} 秒，撤退的是邊 ${RS}（下表的「邊0」＝撤退的那一邊），另一邊撤退門檻 ${OPP}%\n`);
  console.log('撤退門檻　場數　邊0勝率　平均躍遷次數　撤退成功率　撤退時剩餘→躍遷後保住　邊0總損失　邊1總損失　平均時長');
  for (const th of TH) {
    const g = out.filter((o) => o.th === th && o.winner >= 0).map((o) => (RS ? { ...o, s0: o.s1, s1: o.s0, winner: 1 - o.winner } : o)); if (!g.length) continue;
    const J = g.flatMap((o) => o.s0.jumps), ok = J.filter((j) => j.n1 > 0);
    const lost0 = g.map((o) => total - o.s0.left - o.s0.unused - o.s0.saved), lost1 = g.map((o) => total - o.s1.left - o.s1.unused - o.s1.saved);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    console.log(`${String(th).padStart(5)}%　${String(g.length).padStart(4)}　${(avg(g.map((o) => (o.winner === 0 ? 1 : 0))) * 100).toFixed(0).padStart(6)}%　${(J.length / g.length).toFixed(1).padStart(10)}　` +
      `${J.length ? (ok.length / J.length * 100).toFixed(0).padStart(8) + '%' : '       —'}　${J.length ? `${avg(J.map((j) => j.n0)).toFixed(0)}→${avg(J.map((j) => j.n1)).toFixed(0)} 艘（共保住 ${avg(g.map((o) => o.s0.saved)).toFixed(0)}）` : '—'}　` +
      `${avg(lost0).toFixed(0).padStart(6)}　${avg(lost1).toFixed(0).padStart(6)}　${(avg(g.map((o) => o.simSec)) / 60).toFixed(1)} 分`);
  }
  const outDir = path.join(ROOT, 'dev', 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `battleretreat-${tag}.json`), JSON.stringify({ tag, F, S, K, CHARGE, OPP, rows: out }, null, 2));
} finally {
  b.close(); srv.stop();
}
