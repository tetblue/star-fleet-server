// 冒煙測試（參考 rubicon-protocol 的 npm test）：起測試伺服器 → headless 瀏覽器實際打開遊戲，確認主要畫面與流程不會壞掉。
// 用法（在 dev 資料夾，先 npm run build）：npm test　　選項：--only=名稱,名稱　--gpu=0（軟體算繪）　--log（印出伺服器訊息）
// 每一項失敗不會中斷後面的項目；有任何一項失敗時結束碼是 1。截圖在 dev/test-results/smoke/。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, openGame, connect } from './harness.mjs';

const only = arg('only') ? String(arg('only')).split(',') : null;
const OUT = path.join(ROOT, 'dev', 'test-results', 'smoke');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const firstStory = (fs.readFileSync(path.join(ROOT, 'dev', 'src', 'story.js'), 'utf8').match(/STORY_STAGES = \[[\s\S]*?id: '([^']+)'/) || [])[1];

const t00 = Date.now();
console.log('啟動測試伺服器（第一次要算遠景網格，會久一點）…');
const srv = await startServer({ port: +arg('port', 8096), log: !!arg('log') });
const b = await launchBrowser({ gpu: arg('gpu', '1') !== '0', width: 1600, height: 900, port: 9340 });
const session = await register(srv.url, 'smoke');
const results = [];
const errMark = () => b.errors.length;
const newErrors = (from) => b.errors.slice(from);

// 每一項：fn 回傳說明文字；丟出例外或頁面出現新的錯誤就算失敗
const TESTS = [
  ['server', '伺服器載入所有模型', async () => {
    const man = await (await fetch(srv.url + '/api/models')).json(), keys = Object.keys(man.models || {});
    const bad = srv.out.join('').split('\n').filter((l) => l.includes('✗'));
    if (bad.length) throw new Error('伺服器有模型處理失敗：\n' + bad.join('\n'));
    if (keys.length < 10) throw new Error(`只有 ${keys.length} 個模型`);
    return `${keys.length} 個模型`;
  }],
  ['boot', '遊戲啟動、模型載入、主選單', async () => {
    await openGame(b, srv.url, session);
    const err = await b.ev('__demo.MODEL_LOAD.err');
    if (err.length) throw new Error('模型載入失敗：' + err.join('；'));
    await b.until(`!!document.querySelector('.g-menu')`, 30000, '主選單');
    await sleep(800); await b.shot(path.join(OUT, '01-menu.png'));
    return `${await b.ev('Object.keys(__demo.MODEL_SRC).length')} 個 3D 模型`;
  }],
  ['sandbox2d', '測試場 2D：開戰、模擬 30 秒', async () => {
    const r = await b.ev(`(() => { const D = __demo; D.GAME.phase = 'sandbox'; D.opts.perSide = 1500; D.newBattle(4242); D.setRenderMode('2d', false); D.setPaused(true);
      D.step(30 * 60); D.frame(performance.now()); return { hash: D.stateHash() }; })()`);
    await sleep(500); await b.shot(path.join(OUT, '02-sandbox-2d.png'));
    return `戰局指紋 ${r.hash}`;
  }],
  ['determinism', '同一個種子跑兩次結果一樣（回放靠這個）', async () => {
    const run = `(() => { const D = __demo; D.opts.perSide = 1000; D.newBattle(777); D.step(45 * 60); return D.stateHash(); })()`;
    const h1 = await b.ev(run), h2 = await b.ev(run);
    if (h1 !== h2) throw new Error(`兩次的戰局指紋不同：${h1} ≠ ${h2}`);
    return `指紋 ${h1}`;
  }],
  ['sandbox3d', '測試場 3D：模型、武器、畫面', async () => {
    await b.ev(`(() => { const D = __demo; D.opts.perSide = 1500; D.newBattle(4242); D.setRenderMode('3d', false); D.setPaused(false); D.goPreset('near'); return true; })()`);
    await sleep(3500);
    const r = await b.ev(`({ mode: __demo.mode(), meshes: __demo.R3.list.length, calls: +document.getElementById('h-calls').textContent, lod: __demo.R3.lodStats.slice(0, 4) })`);
    if (!r.mode) throw new Error('沒有切到 3D');
    if (!r.meshes || !r.calls) throw new Error('3D 畫面沒有畫任何東西：' + JSON.stringify(r));
    await b.shot(path.join(OUT, '03-sandbox-3d.png'));
    await b.ev(`(() => { __demo.setRenderMode('2d', false); __demo.setPaused(true); return true; })()`);
    return `${r.meshes} 組模型網格、${r.calls} draw calls`;
  }],
  ['story', `劇情第一關自動代打（${firstStory}）`, async () => {
    if (!firstStory) throw new Error('在 story.js 找不到第一關');
    const r = await b.ev(`__demo.autoStory(${JSON.stringify(firstStory)})`);
    if (!r || r.kind === 'none') throw new Error('沒有分出勝負：' + JSON.stringify(r));
    return `${r.name}：${r.kind}（${r.why}），${r.t} 秒，我方剩 ${r.me}%、敵方剩 ${r.foe}%`;
  }],
  ['settings', '設定：遊戲分頁、貼圖繪製清單', async () => {
    await b.ev(`(() => { __demo.GAME.phase = 'menu'; document.getElementById('set-btn').click(); return true; })()`);
    await b.until(`!!document.querySelector('#settings [data-tab]')`, 10000, '設定視窗');
    await b.ev(`[...document.querySelectorAll('#settings [data-tab]')].find((x) => x.textContent === '遊戲').click(), true`);
    await b.until(`!!document.getElementById('set-paint') && !!document.getElementById('set-mtool')`, 10000, '遊戲分頁的貼圖繪製、模型工坊');
    await b.ev(`document.getElementById('set-paint').click(), true`);
    await b.until(`document.querySelectorAll('#paintlink [data-plp]').length > 10`, 15000, '貼圖繪製的模型清單');
    const n = await b.ev(`document.querySelectorAll('#paintlink [data-plp]').length`);
    await b.shot(path.join(OUT, '04-paint-list.png'));
    await b.ev(`document.getElementById('pl-close').click(), true`);
    return `清單 ${n} 個模型`;
  }],
];
// 獨立分頁的工具：模型工坊、貼圖繪製
async function pageTest(url, ready, shotName) {
  const t = await (await fetch(`http://127.0.0.1:${b.port}/json/new?about:blank`, { method: 'PUT' })).json(), targetId = t.id;
  const p = await connect(t.webSocketDebuggerUrl);
  try {
    await p.ev(`localStorage.setItem('fleet.session', ${JSON.stringify(JSON.stringify(session))}); true`).catch(() => {});
    await p.send('Page.navigate', { url });
    await p.until(ready, 60000, url);
    await sleep(800); await p.shot(path.join(OUT, shotName));
    if (p.errors.length) throw new Error('頁面錯誤：\n' + p.errors.join('\n'));
  } finally { p.ws.close(); await fetch(`http://127.0.0.1:${b.port}/json/close/${targetId}`).catch(() => {}); }
}
TESTS.push(
  ['modeltool', '模型工坊：開啟模型、規格檢查', async () => {
    await pageTest(srv.url + '/modeltool/index.html#e1', `window.__mt && __mt.meshes().length > 0 && document.getElementById('checks').children.length > 2`, '05-modeltool.png');
    return '帝國戰艦開啟、規格檢查有結果';
  }],
  ['paint', '貼圖繪製頁面', async () => {
    await pageTest(srv.url + '/paint/index.html', `!!window.__rp`, '06-paint.png');
    return '頁面載入';
  }],
);

for (const [id, name, fn] of TESTS) {
  if (only && !only.includes(id)) continue;
  const t0 = Date.now(), e0 = errMark();
  let ok = true, msg = '';
  try { msg = await fn(); const ne = newErrors(e0); if (ne.length) { ok = false; msg = '頁面錯誤：\n    ' + ne.join('\n    '); } }
  catch (e) { ok = false; msg = e.message; await b.shot(path.join(OUT, `fail-${id}.png`)).catch(() => {}); }
  results.push({ id, name, ok, msg, ms: Date.now() - t0 });
  console.log(`${ok ? '✓' : '✗'} ${name}　${((Date.now() - t0) / 1000).toFixed(1)}s　${msg}`);
}
b.close(); srv.stop();
const fail = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - fail.length}／${results.length} 通過（${((Date.now() - t00) / 1000).toFixed(0)} 秒）　截圖：${path.relative(process.cwd(), OUT)}`);
process.exit(fail.length ? 1 : 0);
