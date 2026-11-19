// 截圖與自動檢查：先起 server.mjs（8087），再跑 node tools/arm/shots.mjs → out/shot_*.png、check.json、arm.glb、verify_glb.json
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep } from '../harness.mjs';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const b = await launchBrowser({ width: 1600, height: 900, port: 9347 });
try {
  await b.send('Page.navigate', { url: 'http://127.0.0.1:8087/' });
  await b.until('window.__arm && window.__arm.ready', 30000, '頁面載入');
  const shot = async (name, t, cam) => { await b.ev(`__arm.setT(${t}); ${cam ? `__arm.cam(${JSON.stringify(cam[0])}, ${JSON.stringify(cam[1])});` : ''} true`); await sleep(400); await b.shot(path.join(out, `shot_${name}.png`)); };
  console.log('BLENDER GLB', await b.ev('!!__arm.BL'));
  await shot('home', 0);
  await b.ev('__arm.setVer(false); true'); await shot('home_code', 0); await b.ev('__arm.setVer(true); true');
  await shot('grab', 4.15, [[9.5, 4.5, -1.5], [3.2, 1.6, -4.6]]);
  await shot('carry', 7.0, [[13, 7.5, 9], [2, 3.2, 0]]);
  await shot('place', 9.85, [[9.5, 4.6, 1.0], [2.6, 1.6, 4.6]]);
  await shot('elbow', 7.0, [[1.5, 8.2, 6.5], [1.2, 6.2, 0]]);
  const check = await b.ev('__arm.doCheck()'); await sleep(200); await b.shot(path.join(out, 'shot_check.png'));
  const ver = await b.ev('__arm.doExport()');
  console.log('CHECK pass', check.pass, JSON.stringify({ sweeps: check.sweeps.map((s) => s.clashing), act: check.actuators, demo: check.demo, grid: check.grid, ik: check.ik }));
  console.log('GLB', JSON.stringify(ver)); console.log('BLENDER VERIFY', JSON.stringify(check.blender));
  if (b.errors.length) console.log('ERRORS', b.errors);
} finally { b.close(); }
