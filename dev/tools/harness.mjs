// 自動測試與效能基準共用：起一台測試用伺服器、開 headless Chrome（或 Edge）、用 DevTools Protocol 操作頁面。
// 測試伺服器的資料夾在 dev/tools/.testbase（不進 git）：玩家資料、遠景網格快取都在這裡，模型直接讀專案的 models/（唯讀，
// modelEdit 設成 off，測試不會改到模型），網頁讀專案的 web/（先 npm run build）。
// 參考 rubicon-protocol 的 scripts/smoke-test.js 與 rts-bench.js 的做法（headless、預設用顯示卡算繪）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const arg = (name, def) => { const a = process.argv.find((s) => s.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : process.argv.includes(`--${name}`) ? true : def; };

// ───── 測試伺服器 ─────
export async function startServer({ port = 8095, log = false } = {}) {
  const base = path.join(here, '.testbase');
  fs.mkdirSync(base, { recursive: true });
  const cfg = { port, host: '127.0.0.1', openBrowser: false, modelsDir: path.join(ROOT, 'models'), dataDir: 'data', webDir: path.join(ROOT, 'web'), allowRegister: true, modelEdit: 'off' };
  fs.writeFileSync(path.join(base, 'config.json'), JSON.stringify(cfg, null, 2));
  if (!fs.existsSync(path.join(ROOT, 'web', 'game.js'))) throw new Error('找不到 web/game.js：先在 dev 執行 npm run build');
  const out = [];
  const proc = spawn(process.execPath, [path.join(ROOT, 'dev', 'server', 'server.js'), '--base', base, '--no-browser'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const take = (b) => { const s = b.toString(); out.push(s); if (log) process.stdout.write(s); };
  proc.stdout.on('data', take); proc.stderr.on('data', take);
  const url = `http://127.0.0.1:${port}`;
  // 第一次要算所有模型的遠景網格，可能要一兩分鐘；之後用快取
  for (let i = 0; ; i++) {
    if (proc.exitCode != null) throw new Error('伺服器沒有啟動：\n' + out.join(''));
    try { const r = await fetch(url + '/api/models'); if (r.ok) break; } catch (e) { /* 還沒好 */ }
    if (i > 600) throw new Error('伺服器 5 分鐘內沒有回應');
    await sleep(500);
  }
  return { url, proc, out, stop: () => proc.kill() };
}
// 測試帳號（只存在 .testbase 的資料裡）
export async function register(url, prefix = 'test') {
  const name = prefix + (Date.now() % 1e6);
  const r = await fetch(url + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: '' }) });
  const j = await r.json(); if (!r.ok) throw new Error('建立測試帳號失敗：' + (j.error || r.status));
  return { token: j.token, name: j.name };
}

// ───── 瀏覽器 ─────
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
export async function launchBrowser({ gpu = true, width = 1600, height = 900, port = 9339 } = {}) {
  const exe = process.env.CHROME || BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('找不到 Chrome 或 Edge（可以用環境變數 CHROME 指定路徑）');
  const prof = fs.mkdtempSync(path.join(here, '.testbase', 'prof-'));
  const args = ['--headless=new', `--remote-debugging-port=${port}`, '--disable-popup-blocking', `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--user-data-dir=${prof}`];   // 不鎖 60 FPS，效能基準才量得出差距
  // 預設用顯示卡算繪（Windows 走 ANGLE D3D11）；--gpu=0 改用 SwiftShader 軟體算繪（慢很多，但不需要顯示卡）
  args.push(...(gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']));
  const proc = spawn(exe, [...args, 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 80 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(250); } }
  if (!targets) throw new Error('瀏覽器沒有啟動');
  const page = targets.find((t) => t.type === 'page');
  const c = await connect(page.webSocketDebuggerUrl);
  return { ...c, exe, proc, port, close: () => { try { proc.kill(); } catch (e) { /* 已結束 */ } setTimeout(() => fs.rmSync(prof, { recursive: true, force: true }), 1500); } };
}
// 連到一個分頁：send(DevTools 指令)、ev(在頁面跑 JS，回傳值)、errors（頁面的錯誤與例外）
export function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const wait = new Map(), errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (d.method === 'Runtime.exceptionThrown') errors.push('例外：' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text || 'eval error');
    return r.result?.result?.value;
  };
  const until = async (expr, ms = 60000, what = expr) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(250); } throw new Error('逾時：' + what); };
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); };
  return new Promise((res, rej) => { ws.onerror = rej; ws.onopen = async () => { await send('Runtime.enable'); await send('Page.enable'); res({ send, ev, until, shot, errors, ws }); }; });
}
// 登入並打開遊戲（query 例如 '?sandbox'），等到模型載入完成（window.__ready）
export async function openGame(b, url, session, query = '') {
  await b.send('Page.navigate', { url: url + '/' });
  await sleep(800);
  await b.ev(`localStorage.setItem('fleet.session', ${JSON.stringify(JSON.stringify(session))}); true`);
  await b.send('Page.navigate', { url: url + '/' + query });
  await b.until('window.__ready === true', 240000, '遊戲載入（window.__ready）');
}
