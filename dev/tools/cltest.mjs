// 倒塌方式的截圖（除錯用）：node tools/cltest.mjs --scene=city --list  或  --scene=city --id=0 --mode=pancake
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, sleep, startServer, register, launchBrowser, openGame } from './harness.mjs';
const OUT = path.join(ROOT, 'dev', 'test-results', 'collapse'); fs.mkdirSync(OUT, { recursive: true });
const srv = await startServer({ port: 8094 });
const b = await launchBrowser({ gpu: true, width: +arg('w', 1280), height: +arg('h', 760), port: 9344 });
try {
  await openGame(b, srv.url, await register(srv.url, 'cl'), '?sandbox');
  await b.ev(`(() => { for (const e of document.querySelectorAll('.g-menu, #hud, .hud, #sand-panel')) e.style.display = 'none'; return true; })()`);
  const cases = JSON.parse(arg('cases', '[]'));
  for (const [scene, id, mode, seed = 3, ang = 0.6, dist = 1] of cases) {
    const info = await b.ev(`(async () => { const D = __demo; D.GAME.phase = 'sandbox'; D.opts.perSide = 60;
      const sc = ${JSON.stringify(scene)}, MM = sc.startsWith('map:') ? __bld.BLD.data.maps[sc.slice(4)] : null; D.newBattle(${seed}, __cl.setup(MM ? { scene: MM.scene, seed: MM.seed >>> 0, def: -1, cmap: __bld.bldSnapshot(MM) } : { scene: sc, seed: ${seed}, def: -1 })); D.setRenderMode('3d', false); D.setPaused(false);
      await new Promise((r) => setTimeout(r, MM ? 6000 : 2500));
      const G = __bld.grd(); return G.ms.map((m) => ({ id: m.id, name: m.name, x: Math.round(m.x), z: Math.round(m.z), r: m.r, top: Math.round(m.top) })); })()`);
    if (id < 0) { console.log(scene, JSON.stringify(info)); continue; }
    const M = info[id];
    const h = M.top + 50, d = Math.max(60, (h) * 1.5) * dist;
    // 鏡頭：從斜上方看
    await b.ev(`(() => { const D = __demo, v = D.view; v.target.x = ${M.x}; v.target.z = ${M.z}; v.target.y = ${-50 + h * 0.3}; v.height = ${d}; if ('yaw' in v) v.yaw = ${ang}; if ('pitch' in v) v.pitch = 0.32; D.updateCamera(); return Object.keys(v); })()`).then((k) => console.log('view keys', k));
    await sleep(800);
    const r = await b.ev(`JSON.stringify(__cl.kill(${id}, ${JSON.stringify(mode)}, ${M.x} - 30, ${M.z} - 10, ${-50 + M.top * 0.6}))`);
    console.log(scene, M.name, mode, r);
    const t0 = Date.now();
    for (const s of JSON.parse(arg('at', '[0.3,1.5,3,5,8,13]'))) {
      const w = s * 1000 - (Date.now() - t0); if (w > 0) await sleep(w);
      await b.shot(path.join(OUT, `${scene.replace(':', '_')}-${id}-${mode}-${String(s).replace('.', '_')}.png`));
    }
  }
  console.log('errors', b.errors.slice(0, 5));
} finally { b.close(); srv.stop(); }
