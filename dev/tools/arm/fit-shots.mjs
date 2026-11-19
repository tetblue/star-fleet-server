// 艦長生涯的改裝畫面（整修庫）截圖：node tools/arm/fit-shots.mjs → dev/shots/fit_*.png
// 改裝視窗用一個空的 .cr-side 代替；第一張用遊戲自己的鏡頭，其餘用 CR.over 的固定鏡頭（相對機庫中線）
import path from 'node:path';
import { startServer, register, launchBrowser, openGame, sleep, ROOT } from '../harness.mjs';
const out = path.join(ROOT, 'dev', 'shots'), hull = process.argv[2] || 'gunship';
const sv = await startServer({ port: 8086 }), b = await launchBrowser({ width: 1600, height: 900, port: 9349 });
try {
  await openGame(b, sv.url, await register(sv.url, 'fit'));
  await b.ev(`(() => { const d = document.createElement('div'); d.className = 'cr-side'; d.style.display = 'none'; document.body.appendChild(d); const C = window.__cap;
    C.crShow({ c: { key: '${hull}', mod: {}, mk: {} }, D: { mod: {}, mk: {} }, fac: 0 }); return true; })()`);
  await b.until('window.__cap.CR.arms.length === 4 && window.__cap.CR.arms.every((A) => A.R.ok) && !!window.__cap.CR.crane.userData.N', 30000, '載入');
  await sleep(5000); await b.shot(path.join(out, 'fit_game.png'));
  const cams = { front: [0, 20, 74, 0, 12, -10], design: [58, 62, 86, 0, 8, -10], cradle: [16, 5, 8, 0, 3, -12], tower: [70, 30, 60, 36, 10, 6], inside: [-20, 14, 16, 6, 8, -30] };
  for (const [name, c] of Object.entries(cams)) { await b.ev(`window.__cap.CR.over = ${JSON.stringify(c)}; true`); await sleep(1400); await b.shot(path.join(out, `fit_${name}.png`)); }
  if (b.errors.length) console.log('ERRORS', b.errors.slice(0, 5));
} finally { b.close(); sv.stop(); }
