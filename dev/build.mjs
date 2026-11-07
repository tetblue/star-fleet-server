// 產生內網伺服器用的網頁，直接輸出到 ../web（伺服器會優先用 web/ 資料夾，不必重新打包 exe）
// 用法：在 dev 資料夾執行 npm install（第一次），之後 npm run build
// 與原本的 build.py 相同：依序串接模組 → esbuild 打包壓縮成 game.js；template.html 內嵌 prelude.js → index.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src'), web = path.join(root, '..', 'web');
const parts = ['audio.js', 'particles.js', 'cinecam.js', 'main.js', 'data.js', 'ground.js', 'terrain.js', 'debris.js', 'collapse.js', 'mounts_default.js', 'weapons.js', 'game.js', 'campaign.js', 'story.js', 'story_war.js', 'tavern.js', 'dock.js', 'sim.js', 'building.js', 'tutorial.js', 'watch.js', 'multi.js', 'cutin.js', 'overlay.js', 'tac.js', 'bridge.js', 'pilot.js', 'ground_pilot.js', 'captain.js', 'starmap.js', 'starmap_ui.js', 'hangar.js', 'hud.js', 'settings.js', 'paint_link.js', 'boot.js'];
fs.writeFileSync(path.join(src, '_entry.js'), parts.map((f) => fs.readFileSync(path.join(src, f), 'utf8')).join('\n'), 'utf8');
fs.mkdirSync(path.join(web, 'assets'), { recursive: true });
// 音效、配樂（audio.js）：dev/sfx、dev/bgm 的 mp3 → web/assets/sfx.js、bgm.js（window.__SFX／__BGM＝{鍵: base64}），
// 遊戲啟動時用 <script> 下載；授權寫在檔頭
for (const [folder, out, glob] of [['sfx', 'sfx.js', '__SFX'], ['bgm', 'bgm.js', '__BGM']]) {
  const dir = path.join(root, folder), files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort();
  const credits = fs.readFileSync(path.join(dir, 'CREDITS.txt'), 'utf8').replaceAll('*/', '* /');
  const body = files.map((f) => `${JSON.stringify(f.slice(0, -4))}:"${fs.readFileSync(path.join(dir, f)).toString('base64')}"`).join(',\n');
  fs.writeFileSync(path.join(web, 'assets', out), `/*\n${credits}*/\nwindow.${glob}={\n${body}};\n`, 'utf8');
}
await esbuild.build({ entryPoints: [path.join(src, '_entry.js')], bundle: true, minify: true, format: 'iife', outfile: path.join(web, 'game.js'), logLevel: 'warning' });
const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
const build = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
const pre = fs.readFileSync(path.join(src, 'prelude.js'), 'utf8').replaceAll('</script', '<\\/script');
const tpl = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
fs.writeFileSync(path.join(web, 'index.html'), tpl.replaceAll('__BUILD__', build).replace('__PRELUDE__', () => pre), 'utf8');
// 貼圖繪製（Rubicon Paint）：一般 <script> 的靜態網頁，自帶 three.js r128，原樣複製到 web/paint/
fs.rmSync(path.join(web, 'paint'), { recursive: true, force: true });
for (const d of ['index.html', 'css', 'js', 'lib', 'LICENSE']) fs.cpSync(path.join(root, 'paint', d), path.join(web, 'paint', d), { recursive: true });
// 模型工坊（修正 GLB：朝向、原點、合併、減面、刪面）：ES modules 打包成 web/modeltool/tool.js
fs.rmSync(path.join(web, 'modeltool'), { recursive: true, force: true });
await esbuild.build({ entryPoints: [path.join(root, 'modeltool', 'main.js')], bundle: true, minify: true, format: 'iife', outfile: path.join(web, 'modeltool', 'tool.js'), logLevel: 'warning' });
fs.copyFileSync(path.join(root, 'modeltool', 'index.html'), path.join(web, 'modeltool', 'index.html'));
console.log('web', build, '→', web);
