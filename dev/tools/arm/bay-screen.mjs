// 戰艦庫的正常畫面（艦長 → 戰艦庫）截圖：五個船塢各停一艘，總覽、近看托架、管制塔、單艦視角 → dev/shots/bayscr_*.png
import path from 'node:path';
import { startServer, register, launchBrowser, openGame, sleep, ROOT } from '../harness.mjs';
const out = path.join(ROOT, 'dev', 'shots');
const sv = await startServer({ port: 8086 }), b = await launchBrowser({ width: 1600, height: 900, port: 9349 });
try {
  await openGame(b, sv.url, await register(sv.url, 'bayscr'));
  await b.ev(`window.__cap.showCapBay(); true`);
  await b.until(`!!document.querySelector('.cb-screen')`, 15000, '戰艦庫畫面');
  const hulls = ['assault', 'gunship', 'support', 'ew', 'stealth'];
  for (let k = 0; k < 5; k++) {
    await b.ev(`document.querySelector('[data-cs="${k}"]').click(); true`); await sleep(150);
    await b.ev(`document.querySelector('[data-ch="${hulls[k]}"]').click(); true`); await sleep(150);
  }
  await sleep(6000);
  const orb = async (name, sel, base, pitch, dist) => {
    await b.ev(`document.querySelector('[data-cs="${sel}"]').click(); true`); await sleep(200);
    await b.ev(`(() => { const O = window.__cap.CB.orb; O.base = O.yaw = ${base}; O.pitch = ${pitch}; O.dist = ${dist}; O.user = performance.now() / 1000 + 1e6; return true; })()`);
    await sleep(2600); await b.shot(path.join(out, `bayscr_${name}.png`));
    console.log(name, await b.ev(`(() => { const i = window.__cap.CB.r.info.render; return JSON.stringify({ tris: i.triangles, calls: i.calls }); })()`));
  };
  await orb('over', 2, -0.55, 0.5, 100);
  await orb('design', 2, 0.62, 0.62, 78);
  await orb('front', 1, 0.0, 0.2, 60);
  await orb('tower', 3, 0.95, 0.32, 58);
  await orb('wide', 2, -0.3, 0.3, 215);
  // 單艦視角
  await b.ev(`document.querySelector('[data-cs="1"]').click(); true`); await sleep(200);
  await b.ev(`document.getElementById('cb-view').click(); true`); await sleep(200);
  for (const [name, base, h, d] of [['focus_low', 0.8, 0.75, 3.5], ['focus_side', 1.57, 3, 12], ['focus_high', -2.3, 17, 14]]) {
    await b.ev(`(() => { const F = window.__cap.CB.fo; F.base = ${base}; F.h = ${h}; F.d = ${d}; F.user = performance.now() / 1000 + 1e6; return true; })()`);
    await sleep(2600); await b.shot(path.join(out, `bayscr_${name}.png`));
  }
  if (b.errors.length) console.log('ERRORS', b.errors.slice(0, 5));
} finally { b.close(); sv.stop(); }
