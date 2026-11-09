// 星海生涯：真打的戰鬥（觀戰／親自指揮）測試：派兩支艦隊打海盜 → 選觀戰或親自指揮 → 快轉戰鬥 → 回到星圖，檢查結果寫回
// 用法（在 dev 資料夾，web/ 要先有建置）：node tools/starmap-live.mjs --how=watch|cmd [--quit]
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, openGame } from './harness.mjs';

const HOW = arg('how', 'watch'), out = path.join(ROOT, 'dev', 'test-results', 'starmap');
const srv = await startServer({ port: +arg('port', 8110) });
const b = await launchBrowser({ gpu: true, width: 1600, height: 900, port: +arg('cdp', 9360) });
try {
  const session = await register(srv.url, 'smlive');
  await openGame(b, srv.url, session, '');
  await b.ev(`window.addEventListener('error', (e) => (window.__smErr = (window.__smErr || []).concat(String(e.message))))`);
  // 開一局，把玩家艦隊直接放到一個海盜星系旁邊，然後下令進攻
  if (arg('wave', 0)) await b.ev(`__sm.SM_RULE.wave = [${+arg('wave', 0)}, ${+arg('wave', 0)}, ${+arg('wave', 0)}]`);
  const setup = await b.ev(`(() => { STORE.removeItem('fleet.career1'); STORE.setItem('fleet.career.meta', JSON.stringify({ runs: 0, unlock: ['cap', 'cmd', 'army', 'gov', 'head'], best: [] })); document.getElementById('m-single').click(); document.querySelector('[data-spm="career"]').click(); { const r = document.querySelector('#sm-start [data-v="cmd"]'); if (r) r.click(); } document.getElementById('sm-go').click();
    const S = __sm.SMU.S, tg = S.sys.find((s) => s.owner === 2 && S.adj[s.id].length), from = S.adj[tg.id][0], fl = __sm.smPlFleets(S);
    for (const f of fl) f.sys = from;
    for (const f of S.fleets) if (f.sys === tg.id) f.path = null;   // AI 在週初就下好命令了：讓目標的守軍留下來
    for (const f of fl) document.querySelector('[data-sel="' + f.id + '"]').click();
    __sm.smuOpen('sys', tg.id); document.getElementById('sm-move').click(); { const ok = document.getElementById('sm-ask-ok'); if (ok) ok.click(); }
    const en = S.fleets.filter((f) => f.sys === tg.id).map((f) => f.name + ' ' + __sm.smShips(f.comp)).join('、');
    return tg.name + '（敵：' + en + '）'; })()`);
  console.log('目標：', setup);
  await b.ev(`document.getElementById('sm-end').click()`); await sleep(300); for (let w = 0; w < 40 && await b.ev(`!!__sm.SMU.anim`); w++) await sleep(150);   // 等移動動畫播完
  const has = await b.ev(`!!document.getElementById('sm-fight')`);
  if (!has) throw new Error('沒有出現戰鬥選項');
  await b.ev(HOW === 'cmd' ? `document.querySelector('#sm-how0 [data-v="cmd"]').click()` : `document.querySelector('#sm-how0 [data-v="watch"]').click()`);
  await b.ev(`document.getElementById('sm-fight').click()`); await sleep(1500);
  console.log('戰鬥中：', await b.ev(`JSON.stringify({ phase: __demo.GAME.phase, watch: __demo.GAME.watch, fleets: __demo.fleets().map((f) => f.side + ':' + f.name + (f.reserve ? '(待命)' : '')) })`));
  await b.shot(path.join(out, `live-${HOW}-battle.png`));
  if (arg('quit', false)) { await b.ev(`__demo.step(600)`); await b.ev(`(() => { const q = document.getElementById('bh-quit'); q.click(); q.click(); return true; })()`); }
  for (let k = 0; k < 120; k++) {
    const st = await b.ev(`(() => { const D = __demo; if (D.GAME.phase === 'battle' && !D.GAME.result) D.step(600); return D.GAME.result ? 'done' : D.GAME.phase; })()`);
    if (k % 2 === 0 && arg('wave', 0)) console.log('  場上：', await b.ev(`__demo.fleets().map((f) => f.side + ':' + f.name + (f.reserve ? (f.activateAt == null ? '(離場)' : '(待命)') : '') + ' ' + f.sqs.reduce((a, q) => a + Math.max(0, q.alive), 0)).join('、')`));
    if (st === 'done') break;
  }
  console.log('結果：', await b.ev(`JSON.stringify(__demo.GAME.result && { kind: __demo.GAME.result.kind, why: __demo.GAME.result.why })`));
  for (let k = 0; k < 40 && !(await b.ev(`!!document.getElementById('sm-close')`)); k++) await sleep(250);
  await b.shot(path.join(out, `live-${HOW}-report.png`));
  console.log('回到星圖：', await b.ev(`(() => { const S = __sm.SMU.S; return '第 ' + S.turn + ' 週・' + __sm.smPlFleets(S).map((f) => f.name + ' ' + __sm.smShips(f.comp) + '艘@' + S.sys[f.sys].name).join('、') + '｜戰報：' + S.reports.slice(-2).map((r) => r.name + ' ' + r.fights.map((F) => (F.real || 'calc') + ' win=' + F.win + ' 損失 ' + F.lost.map(__sm.smShips).join('/')).join(';')).join('｜'); })()`));
  console.log('錯誤：', await b.ev(`JSON.stringify(window.__smErr || [])`));
} finally { b.close(); srv.stop(); }
