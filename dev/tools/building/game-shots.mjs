// 新舊建築模型在遊戲裡的截圖：開沙盒、載入範本地圖，先用舊模型拍一輪，再把種類的檔名換成「重製_*.glb」拍一輪 → dev/shots/bld_舊|新_*.png
// 只在這一頁的記憶體裡換檔名，不寫回 buildings.json。  node tools/building/game-shots.mjs
import path from 'node:path';
import { ROOT, sleep, startServer, register, launchBrowser, openGame } from '../harness.mjs';
const OUT = path.join(ROOT, 'dev', 'shots');
const SWAP = { '人類帝國風_01巨塔_設計圖.glb': '重製_帝國巨塔.glb', '人類聯盟風_01巨塔_設計圖.glb': '重製_聯盟巨塔.glb', '人類聯盟風_03星艦船塢_無船_設計圖.glb': '重製_星艦船塢.glb',
  '人類聯盟風_05行星防禦砲_設計圖.glb': '重製_行星防禦砲.glb', '人類聯盟風_10通訊塔_設計圖.glb': '重製_通訊塔.glb', '人類聯盟風_重裝方舟堡壘.glb': '重製_重裝方舟堡壘.glb',
  '城市_直線道路.glb': '重製_直線道路.glb', '城市_轉角道路.glb': '重製_轉角道路.glb', '城市_十字路口.glb': '重製_十字路口.glb', '城市_橋樑.glb': '重製_天橋.glb' };
// [地圖, 名稱, 鏡頭目標 x, z, 高度, 方位, 俯仰]
const SHOTS = [['m_all_city', 'city_all', 0, 0, 330, 0.6, 0.5], ['m_all_city', 'city_road', 35, 60, 70, 0.5, 0.45], ['m_all_city', 'city_cross', -35, -35, 45, 0.9, 0.5], ['m_all_city', 'city_corner', 105, 105, 45, 2.4, 0.5],
  ['m_emp_capital', 'emp_tower', -40, -140, 150, 0.6, 0.3], ['m_all_harbor', 'harbor', -150, -200, 520, 0.6, 0.45]];
const srv = await startServer({ port: 8093 });
const b = await launchBrowser({ gpu: true, width: 1600, height: 900, port: 9351 });
try {
  await openGame(b, srv.url, await register(srv.url, 'bld'), '?sandbox');
  await b.ev(`(() => { for (const e of document.querySelectorAll('.g-menu, #hud, .hud, #sand-panel')) e.style.display = 'none'; return true; })()`);
  for (const tag of ['舊', '新']) {
    if (tag === '新') console.log('swap', await b.ev(`(() => { const S = ${JSON.stringify(SWAP)}, T = __bld.BLD.data.types, have = new Set(__bld.BLD.files.map((f) => f.file)); let n = 0, miss = [];
      for (const k in T) { const f = S[T[k].file]; if (f) { if (have.has(f)) { T[k].file = f; n++; } else miss.push(f); } } return JSON.stringify({ n, miss }); })()`));
    let cur = '';
    for (const [map, name, x, z, h, yaw, pitch] of SHOTS) {
      if (map !== cur) {
        cur = map;
        const info = await b.ev(`(async () => { const D = __demo; D.GAME.phase = 'sandbox'; D.opts.perSide = 20; const MM = __bld.BLD.data.maps[${JSON.stringify(map)}];
          D.newBattle(3, __cl.setup({ scene: MM.scene, seed: MM.seed >>> 0, def: -1, cmap: __bld.bldSnapshot(MM) })); D.setRenderMode('3d', false); D.setPaused(true);
          await new Promise((r) => setTimeout(r, 7000)); return __bld.grd().ms.length; })()`);
        console.log(tag, map, 'ms', info);
      }
      await b.ev(`(() => { const D = __demo, v = D.view; v.target.x = ${x}; v.target.z = ${z}; v.target.y = -40; v.height = ${h}; if ('yaw' in v) v.yaw = ${yaw}; if ('pitch' in v) v.pitch = ${pitch}; D.updateCamera(); return true; })()`);
      await sleep(1200);
      await b.shot(path.join(OUT, `bld_${tag}_${name}.png`));
    }
  }
  console.log('errors', b.errors.slice(0, 8));
} finally { b.close(); srv.stop(); }
