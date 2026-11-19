// 戰艦庫的擺設截圖：借整修庫的鏡頭（CR.over，相對整修庫中線；戰艦庫第 5 座在 −76）看隔壁的戰艦庫 → dev/shots/bay_*.png
// 順便記一幀畫了多少三角面、幾次繪製（看機械臂換成重型機械臂之後的負擔）
import path from 'node:path';
import { startServer, register, launchBrowser, openGame, sleep, ROOT } from '../harness.mjs';
const out = path.join(ROOT, 'dev', 'shots');
const sv = await startServer({ port: 8086 }), b = await launchBrowser({ width: 1600, height: 900, port: 9349 });
try {
  await openGame(b, sv.url, await register(sv.url, 'bay'));
  const ship = `{ c: { key: 'ew', mod: {}, mk: {} }, hp: 0.25 }`;
  await b.ev(`(() => { window.__cap.crRepair([${Array(8).fill(ship).join(',')}], 0, () => {}); return true; })()`);
  await b.until('window.__cap.CR.arms.length === 4 && window.__cap.CR.arms.every((A) => A.R.ok)', 30000, '載入');
  await sleep(2500);
  const cams = { front: [-76, 26, 62, -76, 5, -6], left: [-70, 12, 8, -96, 4, -12], right: [-82, 12, 8, -56, 4, -8], outside: [-30, 30, 40, -44, 8, -10], refit: [0, 26, 44, 0, 7, -14] };
  for (const [name, c] of Object.entries(cams)) {
    await b.ev(`window.__cap.CR.over = ${JSON.stringify(c)}; true`); await sleep(1300); await b.shot(path.join(out, `bay_${name}.png`));
    console.log(name, await b.ev(`(() => { const C = window.__cap, r = C.CB ? C.CB.r : null; const i = (r || window.__cap.cbRenderer()).info.render; return JSON.stringify({ tris: i.triangles, calls: i.calls }); })()`).catch((e) => 'info? ' + e.message.slice(0, 80)));
  }
  if (b.errors.length) console.log('ERRORS', b.errors.slice(0, 5));
} finally { b.close(); sv.stop(); }
