// 產生內網伺服器用的網頁，直接輸出到 ../web（伺服器會優先用 web/ 資料夾，不必重新打包 exe）
// 用法：在 dev 資料夾執行 npm install（第一次），之後 npm run build
// 與原本的 build.py 相同：依序串接模組 → esbuild 打包壓縮成 game.js；template.html 內嵌 prelude.js → index.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src'), web = path.join(root, '..', 'web');
const parts = ['main.js', 'data.js', 'mounts_default.js', 'weapons.js', 'game.js', 'campaign.js', 'tavern.js', 'sim.js', 'tutorial.js', 'watch.js', 'multi.js', 'cutin.js', 'overlay.js', 'tac.js', 'bridge.js', 'settings.js', 'boot.js'];
fs.writeFileSync(path.join(src, '_entry.js'), parts.map((f) => fs.readFileSync(path.join(src, f), 'utf8')).join('\n'), 'utf8');
fs.mkdirSync(path.join(web, 'assets'), { recursive: true });
await esbuild.build({ entryPoints: [path.join(src, '_entry.js')], bundle: true, minify: true, format: 'iife', outfile: path.join(web, 'game.js'), logLevel: 'warning' });
const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
const build = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
const pre = fs.readFileSync(path.join(src, 'prelude.js'), 'utf8').replaceAll('</script', '<\\/script');
const tpl = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
fs.writeFileSync(path.join(web, 'index.html'), tpl.replaceAll('__BUILD__', build).replace('__PRELUDE__', () => pre), 'utf8');
console.log('web', build, '→', web);
