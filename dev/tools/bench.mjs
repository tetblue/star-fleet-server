// 大艦隊效能基準（參考 rubicon-protocol 的 scripts/rts-bench.js）：headless 瀏覽器（預設用顯示卡）開測試場，
// 兩軍各 N 艘互打，量 FPS、1% low、GPU 每幀、draw calls、三角面。用法（在 dev 資料夾，先 npm run build）：
//   npm run bench                                     預設：3D、各 1000／3000／6000 艘、中景與近景
//   npm run bench -- --counts=500,3000 --mode=2d --cams=far,mid,near --sec=8 --tag=名稱 --gpu=0
// 結果印成表格，並寫到 dev/test-results/bench-<tag>.json（改效能前後各跑一次，比較兩個檔）。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, openGame } from './harness.mjs';

const counts = String(arg('counts', '1000,3000,6000')).split(',').map(Number).filter((n) => n > 0);
const cams = String(arg('cams', 'mid,near')).split(',');
const mode = arg('mode', '3d') === '2d' ? '2d' : '3d';
const sec = +arg('sec', 6), warm = +arg('warm', 3), gpu = arg('gpu', '1') !== '0';
const tag = arg('tag', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));
const W = +arg('width', 1920), H = +arg('height', 1080);

const srv = await startServer({ port: +arg('port', 8095) });
const b = await launchBrowser({ gpu, width: W, height: H });
const rows = [];
try {
  const session = await register(srv.url, 'bench');
  await openGame(b, srv.url, session, '?sandbox');
  const renderer = await b.ev(`(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })()`);
  console.log(`算繪器：${renderer}　畫面 ${W}×${H}　${mode.toUpperCase()}　每項暖機 ${warm} 秒、量 ${sec} 秒`);
  for (const n of counts) {
    for (const cam of cams) {
      // 換兵力：每次重開一場（同一個種子），切到要量的畫面與鏡頭
      await b.ev(`(() => { const D = __demo; D.opts.perSide = ${n}; D.newBattle(12345); D.setRenderMode('${mode}', false); D.setPaused(false); D.goPreset('${cam}'); return true; })()`);
      await sleep(warm * 1000);
      const r = await b.ev(`new Promise((done) => {
        const ft = []; let last = performance.now(); const t0 = last;
        (function tick(now) { ft.push(now - last); last = now; if (now - t0 < ${sec * 1000}) requestAnimationFrame(tick); else finish(); })(last);
        function finish() {
          ft.shift(); const s = ft.slice().sort((a, b) => a - b), avg = ft.reduce((a, b) => a + b, 0) / ft.length;
          const p99 = s[Math.min(s.length - 1, Math.floor(s.length * 0.99))];
          const t = (id) => (document.getElementById(id) || {}).textContent || '';
          done({ fps: 1000 / avg, low1: 1000 / p99, frames: ft.length, calls: +t('h-calls') || 0, tris: t('h-tris'), gpu: t('h-gpu'), ships: t('h-spr'), alive: [t('h-a0'), t('h-a1')] });
        }
      })`);
      const row = { perSide: n, cam, mode, ...r };
      rows.push(row);
      console.log(`各 ${String(n).padStart(5)} 艘　${cam.padEnd(4)}　${r.fps.toFixed(1).padStart(6)} FPS　1% low ${r.low1.toFixed(1).padStart(6)}　GPU ${r.gpu.padStart(9)}　draw calls ${String(r.calls).padStart(4)}　三角面 ${r.tris}`);
    }
  }
  if (b.errors.length) console.log('\n頁面錯誤：\n' + b.errors.slice(0, 10).join('\n'));
  const outDir = path.join(ROOT, 'dev', 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `bench-${tag}.json`);
  fs.writeFileSync(file, JSON.stringify({ tag, date: new Date().toISOString(), renderer, width: W, height: H, gpu, sec, rows, errors: b.errors }, null, 2));
  console.log('\n結果：' + path.relative(process.cwd(), file));
} finally {
  b.close(); srv.stop();
}
