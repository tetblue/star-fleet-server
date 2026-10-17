// ═══════════════ 星海艦隊戰 內網伺服器 ═══════════════
// 啟動：直接執行 exe（或開發時 node server.js --base <資料夾>）
// 資料夾結構（與 exe 同層）：
//   config.json   設定（第一次啟動自動產生）
//   models/       模型資料夾（models.json ＋ GLB 原檔）
//   web/          （可選）放了就優先用這裡的網頁檔，方便更新；沒有就用 exe 內建的
//   data/         玩家帳號、存檔、戰績、備份、模型快取（自動產生）
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { loadModels } = require('./models.js');

const VERSION = '1.0.0';
let sea = null; try { sea = require('node:sea'); if (!sea.isSea()) sea = null; } catch (e) { sea = null; }
const argBase = (() => { const i = process.argv.indexOf('--base'); return i > 0 ? process.argv[i + 1] : null; })();
const BASE = path.resolve(argBase || (sea ? path.dirname(process.execPath) : process.cwd()));

const DEFAULT_CONFIG = {
  port: 8080, host: '0.0.0.0', openBrowser: true,
  modelsDir: 'models', dataDir: 'data', webDir: 'web',
  allowRegister: true,
  backup: { minIntervalMinutes: 10, keepRecent: 50, keepDays: 60 },
  maxRecordsPerPlayer: 500,
};
const ts = () => new Date().toLocaleString('zh-TW', { hour12: false });
const log = (...a) => console.log(`[${ts()}]`, ...a);

function waitAndExit(code) {   // 雙擊 exe 啟動時，出錯不要一閃就關掉
  if (!sea || !process.stdin.isTTY) process.exit(code);
  console.log('\n按 Enter 關閉視窗…');
  process.stdin.resume(); process.stdin.once('data', () => process.exit(code));
}
function loadConfig() {
  const f = path.join(BASE, 'config.json');
  let c = {};
  if (fs.existsSync(f)) { try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`config.json 格式錯誤：${e.message}`); } }
  const cfg = { ...DEFAULT_CONFIG, ...c, backup: { ...DEFAULT_CONFIG.backup, ...(c.backup || {}) } };
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}

// ───── 檔案工具 ─────
function writeAtomic(file, data) { const tmp = file + '.tmp' + process.pid; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); }
function readJSON(file, d) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return d; } }
const stamp = (t = new Date()) => t.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

// ───── 玩家與登入 ─────
let CFG, DATA, PLAYERS_DIR, BACKUP_DIR, CACHE_DIR, MODELS_DIR, WEB_DIR, MODELS = {}, MODEL_JSON = '{}';
const sessions = new Map();   // token → { id, exp }
function sessFile() { return path.join(DATA, 'sessions.json'); }
function saveSessions() { const o = {}; for (const [k, v] of sessions) o[k] = v; writeAtomic(sessFile(), JSON.stringify(o)); }
function loadSessions() { const o = readJSON(sessFile(), {}); const now = Date.now(); for (const k in o) if (o[k].exp > now) sessions.set(k, o[k]); }
const normName = (n) => String(n || '').trim().normalize('NFC');
const playerId = (n) => crypto.createHash('sha1').update(normName(n).toLowerCase()).digest('hex').slice(0, 12);
function pdir(id) { return path.join(PLAYERS_DIR, id); }
function profile(id) { return readJSON(path.join(pdir(id), 'profile.json'), null); }
function hashPw(pw, salt) { return crypto.scryptSync(String(pw || ''), salt, 32).toString('hex'); }
function listPlayers() {
  if (!fs.existsSync(PLAYERS_DIR)) return [];
  return fs.readdirSync(PLAYERS_DIR).map((id) => profile(id)).filter(Boolean)
    .map((p) => ({ name: p.name, hasPassword: !!p.hasPassword, last: p.last || p.created })).sort((a, b) => (b.last || 0) - (a.last || 0));
}
function newToken(id) { const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, { id, exp: Date.now() + 30 * 86400e3 }); saveSessions(); return t; }
function authed(req) {
  const h = req.headers.authorization || '', t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = sessions.get(t); if (!s || s.exp < Date.now()) return null;
  const p = profile(s.id); return p ? { ...p, token: t } : null;
}

// ───── 存檔與備份 ─────
function saveFile(id) { return path.join(pdir(id), 'save.json'); }
function backupSave(id, force) {
  const f = saveFile(id); if (!fs.existsSync(f)) return null;
  const dir = path.join(BACKUP_DIR, id); fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir).filter((x) => x.startsWith('save-')).sort();
  const lastT = files.length ? fs.statSync(path.join(dir, files[files.length - 1])).mtimeMs : 0;
  if (!force && Date.now() - lastT < CFG.backup.minIntervalMinutes * 60e3) return null;
  const name = `save-${stamp()}${force ? '-' + force : ''}.json`;
  fs.copyFileSync(f, path.join(dir, name));
  pruneBackups(dir);
  return name;
}
function pruneBackups(dir) {   // 保留最近 N 份；更舊的每天留一份，超過天數就刪
  const files = fs.readdirSync(dir).filter((x) => x.startsWith('save-')).sort().reverse();
  const keepDay = new Set(), cutoff = Date.now() - CFG.backup.keepDays * 86400e3;
  files.forEach((x, i) => {
    if (i < CFG.backup.keepRecent) return;
    const full = path.join(dir, x), t = fs.statSync(full).mtimeMs, day = x.slice(5, 13);
    if (t < cutoff || keepDay.has(day)) fs.unlinkSync(full); else keepDay.add(day);
  });
}

// ───── 戰績紀錄 ─────
function recDir(id) { return path.join(pdir(id), 'records'); }
function listRecords(id) {
  const d = recDir(id); if (!fs.existsSync(d)) return [];
  const idx = readJSON(path.join(d, 'index.json'), null);
  if (idx) return idx;
  const all = fs.readdirSync(d).filter((x) => x.endsWith('.json') && x !== 'index.json').map((x) => readJSON(path.join(d, x), null)).filter(Boolean).map((r) => r.summary).sort((a, b) => b.time - a.time);
  writeAtomic(path.join(d, 'index.json'), JSON.stringify(all)); return all;
}

// ───── HTTP ─────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra }); res.end(body);
}
const json = (res, code, o) => send(res, code, JSON.stringify(o));
function readBody(req, limit = 20 * 1048576) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('資料太大')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(n ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { reject(new Error('JSON 格式錯誤')); } });
    req.on('error', reject);
  });
}
function sendFile(req, res, file, cacheable) {
  let st; try { st = fs.statSync(file); } catch (e) { return send(res, 404, 'not found', 'text/plain'); }
  if (!st.isFile()) return send(res, 404, 'not found', 'text/plain');
  const etag = `"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`;
  const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', ETag: etag, 'Cache-Control': cacheable ? 'no-cache' : 'no-store', 'Content-Length': st.size };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
  res.writeHead(200, headers); fs.createReadStream(file).pipe(res);
}
// 網頁：web/ 資料夾優先，其次 exe 內建
const EMBED = {};
function embedded(name) {
  if (name in EMBED) return EMBED[name];
  let b = null;
  if (sea) { try { b = Buffer.from(sea.getAsset('web/' + name)); } catch (e) { b = null; } }
  else { const f = path.join(__dirname, '..', 'dist', 'web', name); if (fs.existsSync(f)) b = fs.readFileSync(f); }
  return (EMBED[name] = b);
}
function serveWeb(req, res, rel) {
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  if (rel.includes('..')) return send(res, 400, 'bad path', 'text/plain');
  const f = path.join(WEB_DIR, rel);
  if (fs.existsSync(f)) return sendFile(req, res, f, true);
  const b = embedded(rel); if (!b) return send(res, 404, 'not found', 'text/plain');
  const etag = `"${VERSION}-${b.length.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
  send(res, 200, b, MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream', { ETag: etag, 'Cache-Control': 'no-cache' });
}

async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  if (p === '/api/info') return json(res, 200, { name: '星海艦隊戰', version: VERSION, allowRegister: CFG.allowRegister, players: listPlayers().length });
  if (p === '/api/players' && m === 'GET') return json(res, 200, listPlayers());
  if (p === '/api/models' && m === 'GET') return send(res, 200, MODEL_JSON);
  if ((p === '/api/register' || p === '/api/login') && m === 'POST') {
    const b = await readBody(req, 65536), name = normName(b.name);
    if (!name || name.length > 24 || /[\u0000-\u001f<>"\\/]/.test(name)) return json(res, 400, { error: '名稱要 1～24 個字，不能有 < > " / \\ 等符號' });
    const id = playerId(name), dir = pdir(id);
    if (p === '/api/register') {
      if (!CFG.allowRegister) return json(res, 403, { error: '伺服器目前不開放新玩家' });
      if (fs.existsSync(path.join(dir, 'profile.json'))) return json(res, 409, { error: '這個名字已經有人用了' });
      fs.mkdirSync(path.join(dir, 'records'), { recursive: true });
      const salt = crypto.randomBytes(12).toString('hex');
      writeAtomic(path.join(dir, 'profile.json'), JSON.stringify({ id, name, salt, hash: hashPw(b.password, salt), hasPassword: !!b.password, created: Date.now(), last: Date.now() }));
      writeAtomic(saveFile(id), JSON.stringify({ rev: 0, updated: Date.now(), data: {} }));
      log(`新玩家：${name}`);
      return json(res, 200, { token: newToken(id), name });
    }
    const pr = profile(id);
    if (!pr) return json(res, 404, { error: '找不到這位玩家' });
    if (pr.hash !== hashPw(b.password, pr.salt)) return json(res, 401, { error: '密碼不對' });
    pr.last = Date.now(); writeAtomic(path.join(dir, 'profile.json'), JSON.stringify(pr));
    log(`登入：${pr.name}（${req.socket.remoteAddress}）`);
    return json(res, 200, { token: newToken(id), name: pr.name });
  }
  const me = authed(req);
  if (!me) return json(res, 401, { error: '請重新登入' });
  if (p === '/api/logout' && m === 'POST') { sessions.delete(me.token); saveSessions(); return json(res, 200, { ok: true }); }
  if (p === '/api/me') return json(res, 200, { name: me.name, hasPassword: me.hasPassword });
  if (p === '/api/password' && m === 'POST') {
    const b = await readBody(req, 65536);
    if (me.hash !== hashPw(b.old, me.salt)) return json(res, 401, { error: '舊密碼不對' });
    const salt = crypto.randomBytes(12).toString('hex'), pr = profile(me.id);
    Object.assign(pr, { salt, hash: hashPw(b.password, salt), hasPassword: !!b.password });
    writeAtomic(path.join(pdir(me.id), 'profile.json'), JSON.stringify(pr));
    return json(res, 200, { ok: true });
  }
  if (p === '/api/save' && m === 'GET') return json(res, 200, readJSON(saveFile(me.id), { rev: 0, data: {} }));
  if (p === '/api/save' && m === 'PUT') {
    const b = await readBody(req);
    if (!b.data || typeof b.data !== 'object') return json(res, 400, { error: '存檔格式錯誤' });
    for (const k in b.data) if (typeof b.data[k] !== 'string') return json(res, 400, { error: '存檔格式錯誤' });
    const cur = readJSON(saveFile(me.id), { rev: 0, data: {} });
    let note = null;
    if ((b.rev | 0) < cur.rev) note = backupSave(me.id, 'conflict');   // 另一台電腦先存過：舊的先備份，再以這次為準
    else note = backupSave(me.id, false);
    const rev = cur.rev + 1;
    writeAtomic(saveFile(me.id), JSON.stringify({ rev, updated: Date.now(), data: b.data }));
    if (note) log(`備份存檔：${me.name} → ${note}`);
    return json(res, 200, { rev });
  }
  if (p === '/api/backups' && m === 'GET') {
    const dir = path.join(BACKUP_DIR, me.id);
    return json(res, 200, fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.startsWith('save-')).sort().reverse().map((x) => ({ name: x, time: fs.statSync(path.join(dir, x)).mtimeMs })) : []);
  }
  if (p === '/api/backups/restore' && m === 'POST') {
    const b = await readBody(req, 65536), name = String(b.name || '');
    const f = path.join(BACKUP_DIR, me.id, name);
    if (!/^save-[\w-]+\.json$/.test(name) || !fs.existsSync(f)) return json(res, 404, { error: '找不到這份備份' });
    const old = readJSON(f, null); if (!old) return json(res, 400, { error: '備份檔壞了' });
    backupSave(me.id, 'before-restore');
    const cur = readJSON(saveFile(me.id), { rev: 0 });
    writeAtomic(saveFile(me.id), JSON.stringify({ rev: cur.rev + 1, updated: Date.now(), data: old.data || {} }));
    log(`還原存檔：${me.name} ← ${name}`);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/records' && m === 'GET') return json(res, 200, listRecords(me.id));
  if (p === '/api/records' && m === 'POST') {
    const b = await readBody(req);
    if (!b.summary || !b.replay) return json(res, 400, { error: '紀錄格式錯誤' });
    const id = stamp() + '-' + crypto.randomBytes(3).toString('hex');
    const summary = { ...b.summary, id, time: Date.now() };
    const d = recDir(me.id); fs.mkdirSync(d, { recursive: true });
    writeAtomic(path.join(d, id + '.json'), JSON.stringify({ summary, replay: b.replay }));
    let idx = listRecords(me.id).filter((r) => r.id !== id); idx.unshift(summary);
    while (idx.length > CFG.maxRecordsPerPlayer) { const old = idx.pop(); try { fs.unlinkSync(path.join(d, old.id + '.json')); } catch (e) { /* 已經不在 */ } }
    writeAtomic(path.join(d, 'index.json'), JSON.stringify(idx));
    log(`戰績：${me.name}　${summary.scName || ''}　${summary.kind || ''}`);
    return json(res, 200, { id });
  }
  const rm = p.match(/^\/api\/records\/([\w-]+)$/);
  if (rm) {
    const f = path.join(recDir(me.id), rm[1] + '.json');
    if (!fs.existsSync(f)) return json(res, 404, { error: '找不到這筆紀錄' });
    if (m === 'GET') return send(res, 200, fs.readFileSync(f));
    if (m === 'DELETE') {
      fs.unlinkSync(f); const idx = listRecords(me.id).filter((r) => r.id !== rm[1]);
      writeAtomic(path.join(recDir(me.id), 'index.json'), JSON.stringify(idx)); return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { error: '沒有這個功能' });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  let p; try { p = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, 'bad url', 'text/plain'); }
  try {
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p.startsWith('/models/')) {   // 原始 GLB：原檔直接給
      const f = path.resolve(MODELS_DIR, p.slice(8));
      if (!f.startsWith(path.resolve(MODELS_DIR) + path.sep)) return send(res, 400, 'bad path', 'text/plain');
      return sendFile(req, res, f, true);
    }
    const lm = p.match(/^\/lod\/(\w+)\.bin$/);
    if (lm && MODELS[lm[1]]) return sendFile(req, res, path.join(CACHE_DIR, lm[1] + '.bin'), true);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
    return serveWeb(req, res, p.slice(1));
  } catch (e) {
    log('錯誤', req.method, p, e.message);
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
}

function lanAddrs() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, ip: a.address });
  return out;
}

async function main() {
  console.log(`星海艦隊戰 內網伺服器 v${VERSION}`);
  console.log(`資料夾：${BASE}\n`);
  CFG = loadConfig();
  DATA = path.resolve(BASE, CFG.dataDir); PLAYERS_DIR = path.join(DATA, 'players'); BACKUP_DIR = path.join(DATA, 'backups'); CACHE_DIR = path.join(DATA, 'cache');
  MODELS_DIR = path.resolve(BASE, CFG.modelsDir); WEB_DIR = path.resolve(BASE, CFG.webDir);
  for (const d of [DATA, PLAYERS_DIR, BACKUP_DIR, CACHE_DIR]) fs.mkdirSync(d, { recursive: true });
  loadSessions();
  log(`讀取模型資料夾：${MODELS_DIR}`);
  const t0 = Date.now();
  MODELS = await loadModels(MODELS_DIR, CACHE_DIR, (s) => log(s));
  const list = {};
  for (const [k, v] of Object.entries(MODELS)) list[k] = { ...v, glb: '/models/' + v.file.split(/[\\/]/).map(encodeURIComponent).join('/') + '?v=' + v.mtime, lod: `/lod/${k}.bin?v=${v.mtime}-${v.lodBytes}` };
  MODEL_JSON = JSON.stringify({ models: list });
  const mb = Object.values(MODELS).reduce((a, m) => a + m.bytes, 0) / 1048576;
  log(`模型就緒：${Object.keys(MODELS).length} 個，原檔共 ${mb.toFixed(1)} MB（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  const srv = http.createServer(handle);
  srv.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`\n✗ 連接埠 ${CFG.port} 已被占用（伺服器可能已經開著）。可以改 config.json 的 port。`);
    else console.error('\n✗ 無法啟動：', e.message);
    waitAndExit(1);
  });
  srv.listen(CFG.port, CFG.host, () => {
    console.log('\n──────────────────────────────────────────');
    console.log(' 伺服器已啟動。玩家用瀏覽器開以下網址：');
    console.log(`   本機：http://localhost:${CFG.port}/`);
    for (const a of lanAddrs()) console.log(`   內網：http://${a.ip}:${CFG.port}/　（${a.name}）`);
    console.log(' 關閉這個視窗＝關閉伺服器。');
    console.log('──────────────────────────────────────────\n');
    if (CFG.openBrowser && process.platform === 'win32' && !process.argv.includes('--no-browser')) require('child_process').exec(`start "" "http://localhost:${CFG.port}/"`);
  });
}
process.on('uncaughtException', (e) => { console.error('✗ 未預期的錯誤：', e && e.stack || e); });
main().catch((e) => { console.error('\n✗ 啟動失敗：', e.message); waitAndExit(1); });
