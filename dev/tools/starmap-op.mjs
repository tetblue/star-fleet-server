// 星海生涯：艦長任務測試：艦長開局 → 把特戰小隊移到任務目標 → 執行任務（艦長模式）→ 時間到或中止 → 回到星圖
// 用法（在 dev 資料夾，web/ 要先有建置）：node tools/starmap-op.mjs
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, openGame } from './harness.mjs';

const out = path.join(ROOT, 'dev', 'test-results', 'starmap');
const srv = await startServer({ port: +arg('port', 8112) });
const b = await launchBrowser({ gpu: true, width: 1600, height: 900, port: +arg('cdp', 9362) });
try {
  const session = await register(srv.url, 'smop');
  await openGame(b, srv.url, session, '');
  await b.ev(`window.addEventListener('error', (e) => (window.__smErr = (window.__smErr || []).concat(String(e.message))))`);
  await b.ev(`(() => { STORE.removeItem('fleet.career1'); document.getElementById('m-single').click(); document.querySelector('[data-spm="career"]').click(); document.getElementById('sm-go').click(); return true; })()`);
  await sleep(300); await b.shot(path.join(out, 'op-0-start.png'));
  // 等到有特戰任務（每週 50% 機率發命令）
  let mis = null;
  for (let t = 0; t < 12 && !mis; t++) {
    mis = await b.ev(`(() => { const S = __sm.SMU.S, M = S.pl.missions.find((x) => x.type === 'op' && x.state === 'open'); return M ? JSON.stringify({ id: M.id, sys: M.sys, op: M.op }) : null; })()`);
    if (!mis) { await b.ev(`document.getElementById('sm-end').click()`); await sleep(200); await b.ev(`(() => { const c = document.getElementById('sm-close') || document.getElementById('sm-fight'); if (c) c.click(); const c2 = document.getElementById('sm-close'); if (c2) c2.click(); return true; })()`); }
  }
  if (!mis) throw new Error('12 週內沒有收到特戰任務');
  const M = JSON.parse(mis);
  console.log('任務：', M, await b.ev(`(() => { const S = __sm.SMU.S; return S.pl.missions.map((x) => x.type + '@' + (x.sys != null ? S.sys[x.sys].name : '') + ' ' + x.state).join('、'); })()`));
  await b.ev(`(() => { const S = __sm.SMU.S, q = S.fleets.find((f) => f.pl && f.cap); q.sys = ${M.sys}; __sm.SMU.sys = ${M.sys}; __sm.smuRender(); return true; })()`);
  await b.shot(path.join(out, 'op-1-ready.png'));
  const btn = await b.ev(`!!document.querySelector('[data-op="${M.id}"]')`);
  console.log('執行按鈕：', btn);
  await b.ev(`document.querySelector('[data-op="${M.id}"]').click()`); await sleep(2500);
  console.log('戰鬥中：', await b.ev(`JSON.stringify({ phase: __demo.GAME.phase, captain: !!__demo.GAME.captain, name: __demo.SIM.m.name })`));
  await b.shot(path.join(out, 'op-2-battle.png'));
  await b.ev(`(() => { const q = document.getElementById('bh-quit'); if (q) { q.click(); q.click(); } return true; })()`);
  for (let k = 0; k < 60; k++) { const st = await b.ev(`(() => { const D = __demo; if (D.GAME.phase === 'battle' && !D.GAME.result) D.step(600); return D.GAME.result ? 'done' : D.GAME.phase; })()`); if (st === 'done') break; }
  for (let k = 0; k < 40 && (await b.ev(`__demo.GAME.phase`)) === 'battle'; k++) await sleep(250);
  console.log('結果：', await b.ev(`JSON.stringify(__demo.GAME.result && { kind: __demo.GAME.result.kind, why: __demo.GAME.result.why, capOk: __demo.GAME.result.capOk })`));
  await sleep(500); await b.shot(path.join(out, 'op-3-back.png'));
  console.log('回到星圖：', await b.ev(`(() => { const S = __sm.SMU.S; return '第 ' + S.turn + ' 週・' + S.log.slice(-3).map((l) => l.t).join('｜'); })()`));
  console.log('錯誤：', await b.ev(`JSON.stringify(window.__smErr || [])`));
} finally { b.close(); srv.stop(); }
