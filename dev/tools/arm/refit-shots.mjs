// 整修庫裡的重型機械臂截圖：node tools/arm/refit-shots.mjs（先 npm run build）→ dev/shots/refit_arm_*.png
// 用維修動畫（四台機械臂沿著船焊）；CR.over＝固定鏡頭（相對機庫中線）
import path from 'node:path';
import { startServer, register, launchBrowser, openGame, sleep, ROOT } from '../harness.mjs';
const out = path.join(ROOT, 'dev', 'shots');
const sv = await startServer({ port: 8086 }), b = await launchBrowser({ width: 1600, height: 900, port: 9349 });
try {
  await openGame(b, sv.url, await register(sv.url, 'arm'));
  // 先看改裝動畫（換主砲：天車開過來、吊鉤放下去）；改裝視窗用一個空的 .cr-side 代替
  await b.ev(`(() => { const d = document.createElement('div'); d.className = 'cr-side'; d.style.display = 'none'; document.body.appendChild(d); const C = window.__cap, c = { key: 'ew', mod: {}, mk: {} };
    C.crShow({ c, D: { mod: {}, mk: {} }, fac: 0 }); window.__fit = () => C.crShow({ c, D: { mod: { main: 'heavy' }, mk: {} }, fac: 0, last: 'main' }); return true; })()`);
  await b.until('window.__cap.CR.arms.length === 4 && window.__cap.CR.arms.every((A) => A.R.ok) && !!window.__cap.CR.crane.userData.N', 30000, '機械臂與天車載入');
  await b.ev('window.__cap.CR.over = [0, 24, 40, 0, 14, -14]; window.__fit(); true');
  for (const [i, ms] of [900, 700, 700].entries()) { await sleep(ms); await b.shot(path.join(out, `refit_crane_${i}.png`)); }
  console.log('crane', await b.ev(`JSON.stringify({ ang: window.__cap.CR.crane.userData.N.ang, lifts: window.__cap.CR.arms.filter((A) => A.mobile).map((A) => A.L ? +A.L.ang.lift.toFixed(2) : null) })`));
  await b.ev(`document.querySelector('.cr-side').remove(); true`); await sleep(300);
  const ship = (key) => `{ c: { key: '${key}', mod: {}, mk: {} }, hp: 0.25 }`;
  await b.ev(`(() => { const C = window.__cap; C.crRepair([${['ew', 'ew', 'ew', 'ew', 'ew', 'ew'].map(ship).join(',')}], 0, () => { window.__repDone = 1; }); return true; })()`);
  await b.until('window.__cap.CR.arms.length === 4 && window.__cap.CR.arms.every((A) => A.R.ok)', 30000, '機械臂載入');
  console.log('rig', await b.ev(`JSON.stringify(window.__cap.CR.arms.map((A) => ({ side: A.side, mobile: !!A.mobile, heavy: !!A.R.ca, tcp: A.R.ca ? window.__cap.crRigTip(A.R).toArray().map((v) => +v.toFixed(1)) : null })))`));
  const cams = { back: [0, 27, -16, 0, 3, -46], leftwall: [2, 11, -30, -28, 5, -30], rightwall: [-2, 9, -4, 27, 3, 6], wide: [0, 26, 44, 0, 7, -14], left: [-27, 15, 6, -12, 8, -12], right: [27, 17, 8, 14, 9, -14], close: [-24, 11, -2, -15, 8.5, -10] };
  for (const [name, c] of Object.entries(cams)) { await b.ev(`window.__cap.CR.over = ${JSON.stringify(c)}; true`); await sleep(1400); await b.shot(path.join(out, `refit_arm_${name}.png`)); }
  console.log('reach', await b.ev(`JSON.stringify(window.__cap.CR.arms.map((A) => A.aim ? +window.__cap.crRigTip(A.R).distanceTo(A.aim).toFixed(2) : null))`));
  if (b.errors.length) console.log('ERRORS', b.errors.slice(0, 5));
} finally { b.close(); sv.stop(); }
