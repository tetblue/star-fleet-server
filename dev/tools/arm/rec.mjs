// 錄示範動作：先起 server.mjs，再跑 node tools/arm/rec.mjs [秒數] → out/arm_demo.mp4（或 .webm）
import { launchBrowser } from '../harness.mjs';
const sec = +(process.argv[2] || 29.2);
const b = await launchBrowser({ width: 1280, height: 720, port: 9348 });
try {
  await b.send('Page.navigate', { url: 'http://127.0.0.1:8087/' });
  await b.until('window.__arm && window.__arm.ready', 30000, '頁面載入');
  await b.ev(`for (const id of ['ui', 'hud', 'tip']) document.getElementById(id).style.display = 'none'; true`);
  console.log('blender', await b.ev('!!__arm.BL'), 'file', await b.ev(`__arm.record(${sec})`));
  if (b.errors.length) console.log('ERRORS', b.errors);
} finally { b.close(); }
