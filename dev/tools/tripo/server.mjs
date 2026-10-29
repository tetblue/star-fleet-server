// TRIPO 模型轉換工具：node server.mjs → 瀏覽器開 http://localhost:8097/conv.html，執行 convert(JOBS.TURRET) 等；輸出在 out/。
// view.html 可預覽分件與掛點（fit.js：surf/side 貼合表面、mark 標出掛點）。分件規則寫在 conv.html 的 TURRET／VLS。
// 轉換工具用的本機伺服器：/three/* → three 套件，/in/* → TRIPO 原檔，/out/* POST → 存檔
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const THREE_DIR = 'F:/projects/star/server/dev/node_modules/three', IN = 'F:/projects/star/TRIPO', OUT = path.join(here, 'out');
const MIME = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json' };
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = null;
  if (req.method === 'POST' && u.startsWith('/out/')) {
    const name = path.basename(u); const parts = []; req.on('data', (c) => parts.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(OUT, name), Buffer.concat(parts)); res.end('ok'); }); return;
  }
  if (u.startsWith('/three/')) f = path.join(THREE_DIR, u.slice(7));
  else if (u.startsWith('/in/')) f = path.join(IN, u.slice(4));
  else if (u.startsWith('/out/')) f = path.join(OUT, path.basename(u));
  else f = path.join(here, u === '/' ? 'conv.html' : u.slice(1));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(f).pipe(res);
}).listen(8097, '127.0.0.1', () => console.log('conv on 8097'));
