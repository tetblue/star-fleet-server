// 星海生涯畫面的冒煙測試：開新局 → 下令移動 → 結束回合幾次 → 截圖；檢查沒有錯誤訊息
// 用法（在 dev 資料夾，web/ 要先有建置）：node tools/starmap-ui.mjs --turns=6
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, openGame } from './harness.mjs';

const TURNS = +arg('turns', 6), out = path.join(ROOT, 'dev', 'test-results', 'starmap');
const srv = await startServer({ port: +arg('port', 8109) });
const b = await launchBrowser({ gpu: true, width: 1600, height: 900, port: +arg('cdp', 9359) });
const errs = [];
try {
  const session = await register(srv.url, 'smui');
  await openGame(b, srv.url, session, '');
  await b.ev(`window.addEventListener('error', (e) => (window.__smErr = (window.__smErr || []).concat(String(e.message))))`);
  await b.ev(`(() => { STORE.removeItem('fleet.career1'); document.getElementById('m-single').click(); document.querySelector('[data-spm="career"]').click(); return true; })()`);
  await sleep(300); await b.shot(path.join(out, '0-new.png'));
  await b.ev(`document.getElementById('sm-go').click()`); await sleep(400);
  await b.shot(path.join(out, '1-map.png'));
  for (let t = 0; t < TURNS; t++) {
    // 選第一支艦隊，派往相鄰的非己方星系（沒有就隨便一個相鄰星系）
    const r = t > 0 && arg('stay', false) ? '待命' : await b.ev(`(() => { const M = __sm.SMU, S = M.S, fl = __sm.smPlFleets(S), f = fl[0]; if (!f) return 'no fleet';
      const want = ${arg('stay', false) ? 2 : -1}, near = S.sys.filter((s) => s.owner === want).map((s) => ({ s, p: S.adj })).map((o) => o.s)
        .map((s) => ({ s, h: (() => { const q = [[f.sys, 0]], seen = new Set([f.sys]); while (q.length) { const [i, d] = q.shift(); if (i === s.id) return d; for (const j of S.adj[i]) if (!seen.has(j)) { seen.add(j); q.push([j, d + 1]); } } return 99; })() })).filter((o) => o.h <= 3).sort((a, b) => a.h - b.h);
      const nb = S.adj[f.sys].map((j) => S.sys[j]), tg = near.length ? near[0].s : nb.find((s) => s.owner !== 0) || nb[0];
      for (const x of (want >= 0 ? fl : [f])) document.querySelector('[data-sel="' + x.id + '"]').click();
      const cv = document.getElementById('sm-cv'), rc = cv.getBoundingClientRect(), [x, y] = __sm.smuXY(tg);
      cv.dispatchEvent(new MouseEvent('click', { clientX: rc.left + x, clientY: rc.top + y, bubbles: true }));
      window.confirm = () => true;
      const mv = document.getElementById('sm-move'); if (mv) mv.click();
      return f.name + ' → ' + tg.name + (f.path ? '' : '（沒有下令）'); })()`);
    if (t === 0) await b.shot(path.join(out, '2-order.png'));
    await b.ev(`document.getElementById('sm-end').click()`); await sleep(300);
    const fight = await b.ev(`!!document.getElementById('sm-fight')`);
    if (fight) { await b.shot(path.join(out, `3-choice-${t}.png`)); await b.ev(`document.getElementById('sm-fight').click()`); await sleep(300); }
    const rep = await b.ev(`!!document.getElementById('sm-close')`);
    if (rep) { await b.shot(path.join(out, `4-report-${t}.png`)); await b.ev(`document.getElementById('sm-close').click()`); }
    const st = await b.ev(`(() => { const S = __sm.SMU.S; return '第 ' + S.turn + ' 週・資金 ' + Math.round(S.pl.money) + '・我方 ' + __sm.smPlFleets(S).map((f) => f.name + ' ' + __sm.smShips(f.comp) + '艘@' + S.sys[f.sys].name).join('、'); })()`);
    console.log(`回合 ${t + 1}：${r}；${fight ? '有我方戰鬥；' : ''}${rep ? '有戰報；' : ''}${st}`);
  }
  await b.shot(path.join(out, '5-end.png'));
  const e = await b.ev(`JSON.stringify(window.__smErr || [])`); errs.push(...JSON.parse(e));
  console.log(errs.length ? `錯誤：${errs.join(' | ')}` : '沒有錯誤');
} finally { b.close(); srv.stop(); }
