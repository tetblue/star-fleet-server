// 機甲組裝工具：node server.mjs → 瀏覽器開 http://localhost:8098/
// /three/* → three 套件，/parts/* → rubicon 機甲零件（四足、履帶、背部武器），/models/* → 遊戲的模型資料夾（艦砲武器），/out/* POST → 存檔
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const THREE_DIR = path.join(here, '../../node_modules/three'), MODELS = path.join(here, '../../../models'), OUT = path.join(here, 'out');
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (req.method === 'POST' && u.startsWith('/out/')) {
    const rel = u.slice(5).replace(/\.\./g, ''); const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true });
    const parts = []; req.on('data', (c) => parts.push(c));
    req.on('end', () => { fs.writeFileSync(f, Buffer.concat(parts)); res.end('ok'); }); return;
  }
  let f;
  if (u.startsWith('/three/')) f = path.join(THREE_DIR, u.slice(7));
  else if (u.startsWith('/models/')) f = path.join(MODELS, u.slice(8));
  else if (u.startsWith('/out/')) f = path.join(OUT, u.slice(5));
  else f = path.join(here, u === '/' ? 'mech.html' : u.slice(1));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(f).pipe(res);
}).listen(8098, '127.0.0.1', () => console.log('mech tool on 8098'));
