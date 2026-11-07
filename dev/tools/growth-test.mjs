// 艦長船員與飛行員紀錄的冒煙測試：模擬幾次任務與出擊，打開「船員」「飛行紀錄」畫面截圖
// 用法（在 dev 資料夾，web/ 要先有建置）：node tools/growth-test.mjs
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, openGame } from './harness.mjs';
const out = path.join(ROOT, 'dev', 'test-results', 'growth');
const srv = await startServer({ port: +arg('port', 8113) });
const b = await launchBrowser({ gpu: true, width: 1400, height: 900, port: +arg('cdp', 9363) });
try {
  const session = await register(srv.url, 'grow');
  await openGame(b, srv.url, session, '');
  await b.ev(`window.addEventListener('error', (e) => (window.__grErr = (window.__grErr || []).concat(String(e.message))))`);
  // 艦長：模擬 6 次任務（第 3 次有一艘沉沒、第 5 次重創）
  await b.ev(`(() => { STORE.removeItem('fleet.growth'); const G = __gr;
    for (let n = 1; n <= 6; n++) { const snap = [{ key: 'assault', dead: n === 3, hp: n === 3 ? 0 : n === 5 ? 0.3 : 0.8 }, { key: 'assault', dead: false, hp: 0.9 }];
      G.grAfterCaptain(n !== 4, ['破壞', '斬首', '全滅'][n % 3], ['都市', '群山', '荒漠'][n % 3], n % 2 === 0, snap); }
    // 飛行員：8 次出擊
    for (let n = 1; n <= 8; n++) G.grAfterPilot({ kf: n === 2 ? 6 : 2, ks: n % 3 === 0 ? 2 : 0, dmg: 300 + n * 40, deaths: n === 5 ? 1 : 0 }, { kf: 3 * n + 4, ks: n, sorties: n, wins: n - 1, deaths: 1 }, { type: n === 7 ? 'carrier' : 'kills' }, n !== 6);
    return true; })()`);
  console.log('船員：', await b.ev(`JSON.stringify((() => { const G = __gr.grLoad(); return { missions: G.missions, fallen: G.fallen.map((f) => f.role + f.name), ships: Object.values(G.ship).map((s) => ({ key: s.key, sorties: s.sorties, scars: s.scars.length, crew: s.crew.map((c) => c.name + ':' + c.mem.length) })) }; })())`));
  console.log('飛行員：', await b.ev(`JSON.stringify((() => { const P = __gr.grLoad().pilot; return { titles: P.titles.map((t) => t.k), best: P.best, streak: P.streak, hist: P.hist.length }; })())`));
  await b.ev(`(() => { document.getElementById('m-single').click(); document.querySelector('[data-spm="captain"]').click(); return !!document.getElementById('sp-crew'); })()`);
  await sleep(200); await b.shot(path.join(out, 'captain-hub.png'));
  await b.ev(`document.getElementById('sp-crew').click()`); await sleep(200); await b.shot(path.join(out, 'crew.png'));
  await b.ev(`(() => { document.getElementById('gr-back').click(); document.getElementById('sp-back').click(); document.querySelector('[data-spm="pilot"]').click(); document.getElementById('sp-plog').click(); return true; })()`);
  await sleep(200); await b.shot(path.join(out, 'pilot-log.png'));
  console.log('錯誤：', await b.ev(`JSON.stringify(window.__grErr || [])`));
} finally { b.close(); srv.stop(); }
