// 星海生涯：真打的強攻（近地戰）測試：把玩家艦隊放到一個被圍的星系軌道上 → 強攻（觀戰或親自指揮）→ 快轉 → 回到星圖
// 用法（在 dev 資料夾，web/ 要先有建置）：node tools/starmap-assault.mjs --how=watch
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, openGame } from './harness.mjs';

const HOW = arg('how', 'watch'), out = path.join(ROOT, 'dev', 'test-results', 'starmap');
const srv = await startServer({ port: +arg('port', 8111) });
const b = await launchBrowser({ gpu: true, width: 1600, height: 900, port: +arg('cdp', 9361) });
try {
  const session = await register(srv.url, 'smas');
  await openGame(b, srv.url, session, '');
  await b.ev(`window.addEventListener('error', (e) => (window.__smErr = (window.__smErr || []).concat(String(e.message))))`);
  const setup = await b.ev(`(() => { STORE.removeItem('fleet.career1'); STORE.setItem('fleet.career.meta', JSON.stringify({ runs: 0, unlock: ['cap', 'cmd', 'army', 'gov', 'head'], best: [] })); document.getElementById('m-single').click(); document.querySelector('[data-spm="career"]').click(); { const r = document.querySelector('input[name="sm-start"][value="cmd"]'); if (r) r.click(); } document.getElementById('sm-go').click();
    const S = __sm.SMU.S, tg = S.sys.find((s) => s.owner === 2), fl = __sm.smPlFleets(S);
    for (const f of S.fleets) if (f.sys === tg.id) f.comp = f.comp.map(() => 0);   // 軌道上的敵艦已經清掉
    for (const f of fl) f.sys = tg.id;
    tg.sg = { f: 0, t: 1 }; __sm.SMU.sys = tg.id; __sm.smuRender(); window.confirm = () => true;
    return tg.name + '：守軍 ' + Math.round(tg.gar) + '、防衛建築 ' + tg.def; })()`);
  console.log('目標：', setup);
  await b.ev(`document.getElementById('${HOW === 'cmd' ? 'sm-as-cmd' : 'sm-as-watch'}').click()`); await sleep(2000);
  console.log('戰鬥中：', await b.ev(`JSON.stringify({ phase: __demo.GAME.phase, ground: !!__demo.GRD(), tur: __demo.GRD() && __demo.GRD().live, fleets: __demo.fleets().map((f) => f.side + ':' + f.name) })`));
  await b.shot(path.join(out, `assault-${HOW}-battle.png`));
  for (let k = 0; k < 160; k++) {
    const st = await b.ev(`(() => { const D = __demo; if (D.GAME.phase === 'battle' && !D.GAME.result) D.step(600); return D.GAME.result ? 'done' : D.GAME.phase; })()`);
    if (k % 10 === 0) console.log('  ', await b.ev(`'砲台 ' + (__demo.GRD() ? __demo.GRD().live : '-') + '、' + __demo.fleets().map((f) => f.name + ' ' + f.sqs.reduce((a, q) => a + Math.max(0, q.alive), 0)).join('、')`));
    if (st === 'done') break;
  }
  console.log('結果：', await b.ev(`JSON.stringify(__demo.GAME.result && { kind: __demo.GAME.result.kind, why: __demo.GAME.result.why })`));
  for (let k = 0; k < 40 && !(await b.ev(`!!document.getElementById('sm-close')`)); k++) await sleep(250);
  await b.shot(path.join(out, `assault-${HOW}-report.png`));
  console.log('回到星圖：', await b.ev(`(() => { const S = __sm.SMU.S, s = S.sys[__sm.SMU.sys]; return s.name + ' 屬於 ' + ['聯盟','帝國','海盜','中立'][s.owner] + '・' + __sm.smPlFleets(S).map((f) => f.name + ' ' + __sm.smShips(f.comp)).join('、'); })()`));
  console.log('錯誤：', await b.ev(`JSON.stringify(window.__smErr || [])`));
} finally { b.close(); srv.stop(); }
