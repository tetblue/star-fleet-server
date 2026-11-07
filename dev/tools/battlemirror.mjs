// 鏡像對戰測試：雙方完全相同（編成、指揮官、AI、陣型，位置以原點旋轉 180° 對稱），跑 N 場看邊 0 的勝率。
// 公平的話應該接近 50%。再用 --swap 把雙方的起始位置對調、--fac 換陣營、--ref 改成左右鏡射的擺法，分辨偏差是來自「邊」、位置、陣營還是左右手。
// 2026-11-07 查到的偏差（修正前邊 0 只贏 10～15%）：佈陣亂數是固定種子、依艦隊順序抽 → 每場都是同一組佈陣差異；
//   觀摩布局的 m.sides 被當成多方勢力（變成 4 方）；左右鏡射的擺法本身對兩邊不公平（陣型有左右手）。
// 用法（在 dev 資料夾，web/ 要先有建置）：
//   node tools/battlemirror.mjs --runs=20 --tabs=5                 帝國（邊 0）vs 聯盟（邊 1）
//   node tools/battlemirror.mjs --fac=1                            陣營對調：聯盟（邊 0）vs 帝國（邊 1）
//   node tools/battlemirror.mjs --swap                             位置對調：邊 0 在北（z<0）、邊 1 在南
//   node tools/battlemirror.mjs --ref                              鏡射擺法（雙方同一個 x，像觀摩模式）：邊 0 的第 1 艦隊在右翼、邊 1 的在左翼
//   --fleets=6 --field=3：每方 6 支、場上最多 3 支，其餘待命補位（同 battleretreat 的設定）
//   --mix=0.04,0.16,0.28,0.28,0.24（各艦種比例）--skills=focus（逗號分隔，none＝不帶技能）
//   其他：--fleets=2 --ships=300（每方艦隊數、每支艦數）--lv=3（AI 等級）--tac=push --maxmin=10
import { arg, sleep, startServer, register, launchBrowser, connect, openGame } from './harness.mjs';

const RUNS = +arg('runs', 20), TABS = +arg('tabs', 5), F = +arg('fleets', 3), S = +arg('ships', 300), maxMin = +arg('maxmin', 12);
const K = +arg('field', 0) || F, FAC = +arg('fac', 0), SWAP = !!arg('swap', false), REF = !!arg('ref', false), LV = +arg('lv', 3), TAC = arg('tac', 'push');
const MIX = String(arg('mix', '0.04,0.16,0.28,0.28,0.24')).split(',').map(Number), SKILLS = arg('skills', 'focus') === 'none' ? [] : String(arg('skills', 'focus')).split(',');
const comp = MIX.map((x) => Math.round(S * x));

const srv = await startServer({ port: +arg('port', 8107) });
const b = await launchBrowser({ gpu: arg('gpu', '1') !== '0', width: 1280, height: 720, port: +arg('cdp', 9357) });
const tabs = [b], out = [];
const jobs = Array.from({ length: RUNS }, (_, r) => ({ r, seed: 5001 + r * 13 }));
try {
  while (tabs.length < TABS) { const t = await (await fetch(`http://127.0.0.1:${b.port}/json/new?about:blank`, { method: 'PUT' })).json(); tabs.push(await connect(t.webSocketDebuggerUrl)); }
  const session = await register(srv.url, 'mirror');
  let next = 0; const t0 = Date.now();
  async function worker(t) {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        await openGame(t, srv.url, session, '');
        const fleets = [];
        for (let s = 0; s < 2; s++) for (let k = 0; k < F; k++) {
          const south = SWAP ? s === 1 : s === 0;   // 南方（z>0）面向北
          const col = k % K - (K - 1) / 2;
          fleets.push({ side: s, name: `第${k + 1}艦隊`, cmdr: { base: null, name: '指揮官', title: '', trait: 'dmg', level: 5, mode: 'lv', tal: {}, skills: SKILLS },
            comp: comp.slice(), hangar: [2, 2, 1, 1], formation: 'line', orderly: false, layers: 1,
            x: Math.round((south || REF ? col : -col) * 380), z: south ? 360 : -360, y: 0, h: south ? Math.PI : 0,   // 以原點旋轉 180° 對稱
            ai: { tactic: TAC, level: LV }, reserve: k >= K, at: 1e9 });
        }
        await t.ev(`(() => { const D = __demo;
          STORE.setItem('fleet.watch2', JSON.stringify({ size: 0, terr: 0, seed: ${job.seed}, s: [{ lv: 2, tac: '${TAC}', arch: 0, n: 1 }, { lv: 2, tac: '${TAC}', arch: 0, n: 1 }] }));
          D.watchGo(false); D.SIM.m.fleets = ${JSON.stringify(fleets)}; D.SIM.m.seed = ${job.seed}; D.SIM.m.fac = ${FAC}; D.SIM.m.terrain = [];
          D.SIM.m.ais = [{ lv: ${LV}, tac: '${TAC}' }, { lv: ${LV}, tac: '${TAC}' }];
          D.simStart(); D.setPaused(true); D.GAME.reportShown = true;
          // 待命艦隊補位：場上少於 K 支就叫下一支進場（雙方同一刻處理）
          const alive = (f) => f.sqs.reduce((a, q) => a + Math.max(0, q.alive), 0);
          window.__mt = () => { const t = D.U(); for (let s = 0; s < 2; s++) {
            const mine = D.fleets().filter((f) => f.side === s && !f.supply);
            const wait = mine.filter((f) => f.reserve && f.activateAt != null && f.activateAt > t + 1);
            for (let k = mine.filter((f) => !f.reserve && alive(f) > 0).length; k < ${K} && wait.length; k++) wait.shift().activateAt = t; } };
          return true; })()`);
        const info = await t.ev(`JSON.stringify({ fac: __demo.sideFac(), init: __demo.GAME.init })`);
        let ticks = 0, res = null;
        while (!res && ticks < maxMin * 3600) {
          res = await t.ev(`(() => { const D = __demo; for (let k = 0; k < 5 && !D.GAME.result; k++) { D.step(60); window.__mt(); }
            const G = D.GAME; return G.result ? G.result.kind + '：' + (G.result.why || '') : G.phase !== 'battle' ? 'phase:' + G.phase : null; })()`);
          ticks += 300;
        }
        const r = JSON.parse(await t.ev(`JSON.stringify({ a0: __demo.sideAlive(0), a1: __demo.sideAlive(1), init: __demo.GAME.init, player: __demo.GAME.playerSide })`));
        const kind = res ? res.split('：')[0] : null;
        const winner = kind === 'win' ? r.player : kind === 'lose' ? 1 - r.player : -1;
        out.push({ ...job, res, winner, simSec: ticks / 60, ...r, info });
        if (out.length === 1) console.log('陣營／初始兵力：', info);
        if (out.length % 5 === 0) console.log(`${out.length}／${jobs.length} 場　${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
      } catch (e) { console.log(`第 ${job.r} 場失敗：${e.message.split('\n')[0]}`); await sleep(1000); }
    }
  }
  await Promise.all(tabs.map(worker));
  const g = out.filter((o) => o.winner >= 0), w0 = g.filter((o) => o.winner === 0).length;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  console.log(`\n每方 ${F} 支×${S} 艘（場上 ${K} 支），AI ${TAC} 等級 ${LV}，陣營 ${FAC ? '聯盟（邊 0）vs 帝國（邊 1）' : '帝國（邊 0）vs 聯盟（邊 1）'}，邊 0 在${SWAP ? '北' : '南'}${REF ? '，鏡射擺法' : ''}`);
  console.log(`有結果 ${g.length}／${out.length} 場　邊 0 勝 ${w0}（${(w0 / Math.max(1, g.length) * 100).toFixed(0)}%）　剩餘兵力比例 邊0 ${(avg(g.map((o) => o.a0 / o.init[0])) * 100).toFixed(0)}%　邊1 ${(avg(g.map((o) => o.a1 / o.init[1])) * 100).toFixed(0)}%　平均 ${(avg(g.map((o) => o.simSec)) / 60).toFixed(1)} 分`);
  console.log('結果：', [...new Set(out.map((o) => o.res))].join('｜'));
} finally {
  b.close(); srv.stop();
}
