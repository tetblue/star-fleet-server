// 整修庫的天車有沒有真的在動：播一次換主砲的動畫，每 100 ms 記一次吊車位置與吊鉤下放量，放得最低時截一張 → dev/shots/refit_crane_low.png
import path from 'node:path';
import { startServer, register, launchBrowser, openGame, sleep, ROOT } from '../harness.mjs';
const sv = await startServer({ port: 8086 }), b = await launchBrowser({ width: 1600, height: 900, port: 9349 });
try {
  await openGame(b, sv.url, await register(sv.url, 'arm'));
  await b.ev(`(() => { const d = document.createElement('div'); d.className = 'cr-side'; d.style.display = 'none'; document.body.appendChild(d); const C = window.__cap, c = { key: 'ew', mod: {}, mk: {} };
    C.crShow({ c, D: { mod: {}, mk: {} }, fac: 0 }); window.__fit = () => C.crShow({ c, D: { mod: { main: 'heavy' }, mk: {} }, fac: 0, last: 'main' }); return true; })()`);
  await b.until('window.__cap.CR.arms.every((A) => A.R.ok && (!A.mobile || A.L)) && !!window.__cap.CR.crane.userData.N', 30000, '載入');
  await sleep(500);
  await b.ev('window.__fit(); true');
  let best = { hook: -1 }, lo = 1e9, hi = -1e9, shot = false;
  for (let i = 0; i < 34; i++) {
    await sleep(100);
    const a = JSON.parse(await b.ev('JSON.stringify({ ...window.__cap.CR.crane.userData.N.ang, kind: window.__cap.CR.A && window.__cap.CR.A.kind })'));
    lo = Math.min(lo, a.trolley); hi = Math.max(hi, a.trolley);
    if (a.hook > best.hook) best = { ...a, t: i * 0.1 };
    if (!shot && a.hook > 8) { shot = true; await b.shot(path.join(ROOT, 'dev', 'shots', 'refit_crane_low.png')); }
  }
  // 右牆邊的備用零件（推進器艙、砲塔、飛彈架）
  await b.ev('window.__cap.CR.over = [7, 9, -27.5, 25, 1.2, -27.5]; true'); await sleep(900); await b.shot(path.join(ROOT, 'dev', 'shots', 'refit_spares.png'));
  // 裝飛彈艙：天車吊一箱飛彈下來
  await b.ev(`(() => { const C = window.__cap, c = { key: 'ew', mod: {}, mk: {} }; C.CR.over = [-20, 20, 10, 0, 12, -14]; C.crShow({ c, D: { mod: { main: 'heavy', msl: 'x' }, mk: {} }, fac: 0, last: 'msl' }); return true; })()`);
  let seen = 0; for (let i = 0; i < 30; i++) { await sleep(100); if (await b.ev('window.__cap.CR.crane.userData.crate.visible')) { seen++; if (seen === 4) await b.shot(path.join(ROOT, 'dev', 'shots', 'refit_crate.png')); } } console.log('飛彈箱出現的格數', seen);
  console.log('飛彈箱', await b.ev(`JSON.stringify({ kind: window.__cap.CR.A && window.__cap.CR.A.kind, visible: window.__cap.CR.crane.userData.crate.visible, children: window.__cap.CR.crane.userData.crate.children.length })`));
  console.log('天車', JSON.stringify({ 吊鉤最多放下: +best.hook.toFixed(2), 那時的動畫: best.kind, 秒: best.t, 吊車位置範圍: [+lo.toFixed(2), +hi.toFixed(2)], 截圖: shot }));
  if (b.errors.length) console.log('ERRORS', b.errors.slice(0, 5));
} finally { b.close(); sv.stop(); }
