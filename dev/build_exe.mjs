// 在 Windows 打包 StarFleetServer.exe（Node SEA）：網頁（內嵌）＋ server.js → 單一 exe
// 用法：在 dev 資料夾執行 npm install（第一次），之後 npm run build:exe
// 與 build_server.py（Linux＋Wine）流程相同，改用本機的 node.exe 當底：
//   1. npm run build 產生 ../web
//   2. esbuild 把 server/server.js 打包成 dist/server/server.cjs
//   3. 產生 SEA blob（網頁檔當成 asset）
//   4. 複製 node.exe → rcedit 設定圖示與版本資訊 → postject 注入 blob
//   5. 輸出 dist/StarFleetServer.exe，並嘗試複製到專案根目錄（伺服器開著時會跳過）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { rcedit } from 'rcedit';

if (process.platform !== 'win32') { console.error('✗ 這個腳本只能在 Windows 執行（Linux 請用 build_server.py）。'); process.exit(1); }
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) { console.error(`✗ 需要 Node.js 22 以上（目前 ${process.version}）。exe 會用這個 node.exe 當底。`); process.exit(1); }

const root = path.dirname(fileURLToPath(import.meta.url));
const top = path.join(root, '..');
const web = path.join(top, 'web');
const out = path.join(root, 'dist', 'server');
fs.mkdirSync(out, { recursive: true });
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });

// 1. 網頁
run(process.execPath, [path.join(root, 'build.mjs')]);

// 2. 伺服器
const cjs = path.join(out, 'server.cjs');
await esbuild.build({ entryPoints: [path.join(root, 'server', 'server.js')], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: cjs, logLevel: 'warning' });

// 3. SEA blob：web/ 的檔案，加上 2D 素材（build.mjs 不產生，從 web_backup/assets 補上；web/assets 有同名檔時以 web/ 為準）
const assets = {};
const walk = (dir, base) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, base); else assets['web/' + path.relative(base, f).split(path.sep).join('/')] = f; } };
const extra = path.join(root, 'web_backup', 'assets');
if (fs.existsSync(extra)) for (const n of fs.readdirSync(extra)) assets['web/assets/' + n] = path.join(extra, n);
walk(web, web);
const blob = path.join(out, 'sea.blob');
const seaCfg = path.join(out, 'sea.json');
fs.writeFileSync(seaCfg, JSON.stringify({ main: cjs, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, assets }, null, 2), 'utf8');
run(process.execPath, ['--experimental-sea-config', seaCfg]);
console.log('內嵌網頁檔：', Object.keys(assets).join('、'));

// 4. exe
const exe = path.join(root, 'dist', 'StarFleetServer.exe');
fs.copyFileSync(process.execPath, exe);
const icon = path.join(root, 'tools', 'icon.ico');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
await rcedit(exe, {
  ...(fs.existsSync(icon) ? { icon } : {}),
  'version-string': { ProductName: 'Star Fleet Tactics Server', FileDescription: 'Star Fleet Tactics LAN Server', CompanyName: '', LegalCopyright: '', OriginalFilename: 'StarFleetServer.exe', InternalFilename: 'StarFleetServer' },
  'file-version': version, 'product-version': version,
});
if (!fs.existsSync(icon)) console.log('（沒有 dev/tools/icon.ico，使用 Node 預設圖示）');
run(process.execPath, [path.join(root, 'node_modules', 'postject', 'dist', 'cli.js'), exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', '--overwrite']);
const mb = (fs.statSync(exe).size / 1048576).toFixed(1);
console.log(`\n✓ ${exe}（${mb} MB，Node ${process.version}）`);

// 5. 複製到專案根目錄
const dest = path.join(top, 'StarFleetServer.exe');
try { fs.copyFileSync(exe, dest); console.log(`✓ 已更新 ${dest}`); }
catch (e) {
  if (e.code === 'EBUSY' || e.code === 'EPERM') console.log(`! 伺服器正在執行，沒有覆蓋 ${dest}。關掉伺服器後，手動把 dist\\StarFleetServer.exe 複製過去。`);
  else throw e;
}
