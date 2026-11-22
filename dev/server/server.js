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
const { loadModels, parseGLB } = require('./models.js');
const createMulti = require('./multi.js');

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
  // 貼圖繪製存回模型：'local'＝只有在伺服器這台電腦上玩的人可以存（預設）、'all'＝所有登入的玩家、'off'＝不能存
  modelEdit: 'local',
  // 戰艦組裝「發佈」要用的 Blender（blender.exe 的路徑）；空的話自動找 C:/Program Files/Blender Foundation、F:/tools/Blender 等
  blender: '',
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
const MULTI = createMulti({ log: (...a) => log(...a) });
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

// ───── 存檔欄位 ─────
const SLOTS = 3;
const PREF_KEYS = ['fleet.settings', 'fleet.render', 'fleet.svaxis'];   // 按鍵、畫面等介面偏好：不跟著存檔欄位走
function slotFile(id, i) { return path.join(pdir(id), 'slots', `slot${i}.json`); }

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
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('檔案太大')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}
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
  if (p === '/api/models/can-edit' && m === 'GET') return json(res, 200, { ok: canEditModels(req), mode: CFG.modelEdit });
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
  // 存檔欄位（每位玩家 3 個）：把整份進度另存一份，之後可以讀回來；也用來放匯入的存檔
  if (p === '/api/slots' && m === 'GET') {
    return json(res, 200, Array.from({ length: SLOTS }, (_, i) => { const s = readJSON(slotFile(me.id, i), null); return s ? { slot: i, name: s.name, summary: s.summary, time: s.time, keys: Object.keys(s.data || {}).length } : null; }));
  }
  const sm = p.match(/^\/api\/slots\/(\d+)(\/load)?$/);
  if (sm) {
    const i = +sm[1]; if (i >= SLOTS) return json(res, 404, { error: '沒有這個存檔欄位' });
    const f = slotFile(me.id, i);
    if (sm[2]) {   // 讀取欄位：目前的進度先備份，再換成欄位裡的（介面偏好保留目前的）
      if (m !== 'POST') return json(res, 405, { error: '方法不對' });
      const s = readJSON(f, null); if (!s) return json(res, 404, { error: '這個欄位是空的' });
      backupSave(me.id, 'before-load');
      const cur = readJSON(saveFile(me.id), { rev: 0, data: {} }), data = { ...s.data };
      for (const k of PREF_KEYS) { if (cur.data && k in cur.data) data[k] = cur.data[k]; else delete data[k]; }
      writeAtomic(saveFile(me.id), JSON.stringify({ rev: cur.rev + 1, updated: Date.now(), data }));
      log(`讀取存檔欄位：${me.name} ← ${i + 1}（${s.name}）`);
      return json(res, 200, { ok: true });
    }
    if (m === 'GET') { const s = readJSON(f, null); return s ? json(res, 200, s) : json(res, 404, { error: '這個欄位是空的' }); }
    if (m === 'PUT') {
      const b = await readBody(req), bad = () => json(res, 400, { error: '存檔格式錯誤' });
      if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return bad();
      for (const k in b.data) if (typeof b.data[k] !== 'string' || !/^fleet\.[\w.-]+$/.test(k)) return bad();
      const data = { ...b.data }; for (const k of PREF_KEYS) delete data[k];
      const name = String(b.name || '').trim().slice(0, 40) || `存檔 ${i + 1}`, summary = String(b.summary || '').slice(0, 200);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      writeAtomic(f, JSON.stringify({ name, summary, time: Date.now(), data }));
      log(`存檔欄位：${me.name} → ${i + 1}（${name}）`);
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') { try { fs.unlinkSync(f); } catch (e) { /* 本來就空 */ } return json(res, 200, { ok: true }); }
  }
  // 貼圖繪製：把畫好的 GLB 存回模型資料夾（原檔第一次被蓋掉前先備份到 models/_原始/），之後可以還原
  const mm = p.match(/^\/api\/models\/(\w+)\/(glb|restore)$/);
  if (mm) {
    const key = mm[1], m0 = MODELS[key];
    if (!m0) return json(res, 404, { error: '沒有這個模型' });
    if (!canEditModels(req)) return json(res, 403, { error: CFG.modelEdit === 'off' ? '伺服器設定不允許修改模型（config.json 的 modelEdit）' : '只有在伺服器那台電腦上才能存回模型（config.json 的 modelEdit 改成 "all" 就能從別台電腦存）' });
    const file = path.resolve(MODELS_DIR, m0.file), orig = origFile(m0.file);
    if (mm[2] === 'glb' && m === 'PUT') {
      const buf = await readRaw(req, 256 * 1048576);
      if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return json(res, 400, { error: '不是 GLB 檔' });
      try { parseGLB(buf); } catch (e) { return json(res, 400, { error: 'GLB 讀不出來：' + e.message }); }
      if (!fs.existsSync(orig)) { fs.mkdirSync(path.dirname(orig), { recursive: true }); fs.copyFileSync(file, orig); }
      writeAtomic(file, buf);
      await refreshModels();
      if (!MODELS[key]) {   // 遊戲用不了（例如找不到網格）：放回原本的檔案
        writeAtomic(file, fs.readFileSync(orig)); await refreshModels();
        return json(res, 400, { error: '這個 GLB 遊戲用不了，已放回原本的檔案（伺服器視窗有原因）' });
      }
      log(`貼圖繪製：${me.name} 存回 ${key}（${m0.file}，${(buf.length / 1048576).toFixed(1)} MB）`);
      return json(res, 200, { ok: true, model: modelEntry(key) });
    }
    if (mm[2] === 'restore' && m === 'POST') {
      if (!fs.existsSync(orig)) return json(res, 404, { error: '這個模型沒有改過' });
      writeAtomic(file, fs.readFileSync(orig)); fs.unlinkSync(orig);
      await refreshModels();
      log(`貼圖繪製：${me.name} 還原 ${key}（${m0.file}）`);
      return json(res, 200, { ok: true, model: modelEntry(key) });
    }
    return json(res, 405, { error: '方法不對' });
  }
  // 戰艦組裝編輯器：素材庫是 models/戰艦組裝/library.json（靜態，/models/ 直接給）；組好的設計存在同資料夾的 designs.json
  // 艦種（艦長模式的槽位制度）：models/戰艦組裝/hulls.json＝{ version, hulls: { 艦種: { name, slots: [Lv1～5 的 [主砲,副砲,防空,艦載機,輔助]], lv: [Lv1～5 的設計 id], stats… } } }
  if (p === '/api/shipyard' && m === 'GET') {
    const dir = path.join(MODELS_DIR, '戰艦組裝');
    const d = readJSON(path.join(dir, 'designs.json'), null) || { version: 1, designs: {} };
    const h = readJSON(path.join(dir, 'hulls.json'), null) || { version: 1, hulls: {} };
    return json(res, 200, { ...d, hulls: h.hulls || {}, canEdit: canEditModels(req) });
  }
  if (p === '/api/shipyard' && m === 'PUT') {
    if (!canEditModels(req)) return json(res, 403, { error: CFG.modelEdit === 'off' ? '伺服器設定不允許修改（config.json 的 modelEdit）' : '只有在伺服器那台電腦上才能存' });
    const b = await readBody(req, 16 * 1048576);
    const ok = (o) => o && typeof o === 'object' && !Array.isArray(o);
    if (b.designs == null && b.hulls == null) return json(res, 400, { error: '沒有要存的資料' });
    if ((b.designs != null && !ok(b.designs)) || (b.hulls != null && !ok(b.hulls))) return json(res, 400, { error: '資料格式錯誤' });
    const dir = path.join(MODELS_DIR, '戰艦組裝');
    fs.mkdirSync(dir, { recursive: true });
    for (const [k, data] of [['designs', b.designs], ['hulls', b.hulls]]) {
      if (data == null) continue;
      const f = path.join(dir, k + '.json');
      if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
      writeAtomic(f, JSON.stringify({ version: 1, [k]: data }, null, 1));
      log(`戰艦組裝：${me.name} 存了 ${Object.keys(data).length} 個${k === 'hulls' ? '艦種' : '設計'}`);
    }
    return json(res, 200, { ok: true });
  }
  // 發佈：編輯器把某艦種某一級的設計匯出成 GLB 傳上來 → Blender 烘成遊戲模型（tools/shipyard/bake.py，幾分鐘，背景跑、編輯器輪詢）
  if (p === '/api/shipyard/publish' && m === 'GET') {
    const j = PUB.jobs.get(url.searchParams.get('job') || '');
    return j ? json(res, 200, { state: j.state, msg: j.msg, result: j.result, err: j.err }) : json(res, 404, { error: '沒有這個工作' });
  }
  if (p === '/api/shipyard/publish' && m === 'POST') {
    if (!canEditModels(req)) return json(res, 403, { error: '只有在伺服器那台電腦上才能發佈' });
    const hull = url.searchParams.get('hull') || '', lv = +url.searchParams.get('lv');
    const H = (readJSON(path.join(MODELS_DIR, '戰艦組裝', 'hulls.json'), {}).hulls || {})[hull];
    if (!/^\w+$/.test(hull) || !H || H.old) return json(res, 400, { error: '沒有這個艦種（舊艦種不用發佈）' });
    if (!(lv >= 0 && lv < 5)) return json(res, 400, { error: '等級不對' });
    const did = (H.lv || [])[lv], D = did && (readJSON(path.join(MODELS_DIR, '戰艦組裝', 'designs.json'), {}).designs || {})[did];
    if (!D) return json(res, 400, { error: `Lv${lv + 1} 還沒有指定設計（或設計沒存）` });
    const blender = findBlender();
    if (!blender) return json(res, 400, { error: '找不到 Blender：在 config.json 加上 "blender": "Blender 的 blender.exe 路徑"' });
    const buf = await readRaw(req, 400 * 1048576);
    if (buf.length < 20 || buf.toString('latin1', 0, 4) !== 'glTF') return json(res, 400, { error: '不是 GLB 檔' });
    const id = Date.now().toString(36), job = { state: 'wait', msg: '排隊中', hull, lv, did, design: D, buf, who: me.name };
    PUB.jobs.set(id, job);
    PUB.chain = PUB.chain.catch(() => {}).then(() => runPublish(job, blender));
    return json(res, 200, { ok: true, job: id });
  }
  // 建築編輯器：建築種類（GLB 對位、碰撞、耐久）與自訂近地地圖都存在 models/建築/buildings.json；GLB 也放在 models/建築/
  if (p === '/api/buildings' && m === 'GET') {
    const d = readJSON(bldFile(), null) || { version: 1, types: {}, maps: {} };
    let files = [];
    try { files = fs.readdirSync(BLD_DIR).filter((x) => /\.glb$/i.test(x)).map((x) => { const st = fs.statSync(path.join(BLD_DIR, x)); return { file: x, bytes: st.size, mtime: Math.round(st.mtimeMs) }; }); } catch (e) { /* 資料夾還沒建 */ }
    return json(res, 200, { ...d, files, canEdit: canEditModels(req) });
  }
  if (p.startsWith('/api/buildings') && !canEditModels(req)) return json(res, 403, { error: CFG.modelEdit === 'off' ? '伺服器設定不允許修改建築（config.json 的 modelEdit）' : '只有在伺服器那台電腦上才能存建築（config.json 的 modelEdit 改成 "all" 就能從別台電腦存）' });
  if (p === '/api/buildings' && m === 'PUT') {
    const b = await readBody(req, 8 * 1048576);
    const obj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    if (!obj(b.types) || !obj(b.maps)) return json(res, 400, { error: '建築資料格式錯誤' });
    fs.mkdirSync(BLD_DIR, { recursive: true });
    if (fs.existsSync(bldFile())) fs.copyFileSync(bldFile(), bldFile() + '.bak');   // 上一版留一份
    writeAtomic(bldFile(), JSON.stringify({ version: 1, types: b.types, maps: b.maps }, null, 1));
    log(`建築編輯器：${me.name} 存了 ${Object.keys(b.types).length} 種建築、${Object.keys(b.maps).length} 張地圖`);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/buildings/glb' && m === 'PUT') {
    const name = String(url.searchParams.get('name') || '').normalize('NFC').trim();
    if (!/^[^\\/:*?"<>|\u0000-\u001f]{1,80}\.glb$/i.test(name) || name.startsWith('.')) return json(res, 400, { error: '檔名不對（要 .glb，不能有 \\ / : * ? " < > |）' });
    const buf = await readRaw(req, 256 * 1048576);
    if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return json(res, 400, { error: '不是 GLB 檔' });
    try { parseGLB(buf); } catch (e) { return json(res, 400, { error: 'GLB 讀不出來：' + e.message }); }
    fs.mkdirSync(BLD_DIR, { recursive: true });
    writeAtomic(path.join(BLD_DIR, name), buf);
    log(`建築編輯器：${me.name} 匯入 ${name}（${(buf.length / 1048576).toFixed(1)} MB）`);
    return json(res, 200, { ok: true, file: name, bytes: buf.length, mtime: Math.round(fs.statSync(path.join(BLD_DIR, name)).mtimeMs) });
  }
  // 多人戰鬥：串流收訊息、POST 送動作
  if (p === '/api/mp/stream' && m === 'GET') return MULTI.stream(req, res, me);
  if (p === '/api/mp/act' && m === 'POST') { const r = MULTI.act(me, await readBody(req, 1048576)); return json(res, r.error ? 400 : 200, r); }
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

// ───── 模型清單 ─────
const origFile = (rel) => path.join(MODELS_DIR, '_原始', rel);
let BLD_DIR = '';
const bldFile = () => path.join(BLD_DIR, 'buildings.json');
function modelEntry(k) {
  const v = MODELS[k];
  return { ...v, glb: '/models/' + v.file.split(/[\\/]/).map(encodeURIComponent).join('/') + '?v=' + v.mtime, lod: `/lod/${k}.bin?v=${v.mtime}-${v.lodBytes}`, painted: fs.existsSync(origFile(v.file)) };
}
let refreshing = Promise.resolve();
function refreshModels() {   // 重讀模型資料夾（沒改的模型用快取，很快）；同時只跑一個
  return (refreshing = refreshing.catch(() => {}).then(async () => {
    MODELS = await loadModels(MODELS_DIR, CACHE_DIR, (s) => log(s));
    const list = {}; for (const k in MODELS) list[k] = modelEntry(k);
    MODEL_JSON = JSON.stringify({ models: list });
  }));
}
// ───── 戰艦組裝的發佈（Blender 烘焙）─────
// 產出：models/戰艦組裝/遊戲/艦種_lvN.glb、models.json 的 sy_艦種_N（kind hull、船首 +x）、hulls.json 該艦種的 pub[等級]＝{ model, design, at, tris, slots }
// slots：設計裡的槽位標記（槽位 id → 位置 p、轉向 r 度、射界 arc），座標和設計一樣（公尺、+x 船首），遊戲第 4 步照這個掛裝備
let BAKE_PY = null; try { BAKE_PY = require('../tools/shipyard/bake.py'); } catch (e) { /* 直接用 node 跑的時候讀檔 */ }
const PUB = { jobs: new Map(), chain: Promise.resolve() };
function findBlender() {
  const c = [CFG.blender, process.env.BLENDER].filter(Boolean);
  for (const root of ['C:/Program Files/Blender Foundation', 'F:/tools/Blender', 'D:/tools/Blender', 'C:/tools/Blender']) {
    try { for (const d of fs.readdirSync(root).sort().reverse()) c.push(path.join(root, d, 'blender.exe')); } catch (e) { /* 沒這個資料夾 */ }
  }
  return c.find((f) => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } }) || null;
}
function bakeScript() {
  const f = path.join(__dirname, '..', 'tools', 'shipyard', 'bake.py');
  if (fs.existsSync(f)) return f;
  if (!BAKE_PY) throw new Error('找不到烘焙腳本 bake.py');
  const out = path.join(CACHE_DIR, 'shipyard', 'bake.py'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, BAKE_PY); return out;
}
function runPublish(job, blender) {
  return new Promise((resolve) => {
    const dir = path.join(CACHE_DIR, 'shipyard'), base = `${job.hull}_lv${job.lv + 1}`;
    fs.mkdirSync(dir, { recursive: true });
    const inp = path.join(dir, base + '_in.glb'), out = path.join(dir, base + '.glb');
    fs.writeFileSync(inp, job.buf); job.buf = null;
    const fail = (e) => { job.state = 'err'; job.err = e; log(`戰艦組裝發佈失敗：${base}：${e}`); resolve(); };
    let script; try { script = bakeScript(); } catch (e) { return fail(e.message); }
    job.state = 'run'; job.msg = '啟動 Blender'; const t0 = Date.now();
    log(`戰艦組裝：${job.who} 發佈 ${base}（Blender 烘焙）`);
    const cp = require('child_process').spawn(blender, ['--background', '--factory-startup', '--python', script, '--', inp, out], { windowsHide: true });
    let tail = '', result = null;
    const onLine = (s) => {
      tail = (tail + s).slice(-4000);
      for (const ln of s.split(/\r?\n/)) {
        const st = ln.match(/^STEP (.*)$/); if (st) job.msg = st[1];
        const r = ln.match(/^RESULT (.*)$/); if (r) try { result = JSON.parse(r[1]); } catch (e) { /* 不完整 */ }
      }
    };
    cp.stdout.setEncoding('utf8'); cp.stderr.setEncoding('utf8');
    cp.stdout.on('data', onLine); cp.stderr.on('data', onLine);
    cp.on('error', (e) => fail('Blender 啟動失敗：' + e.message));
    cp.on('close', async (code) => {
      if (job.state === 'err') return;
      if (code !== 0 || !result || !fs.existsSync(out)) return fail(`Blender 結束碼 ${code}\n${tail.split(/\r?\n/).filter((l) => /Error|錯誤|Traceback|line \d/.test(l)).slice(-6).join('\n') || tail.slice(-600)}`);
      try {
        job.msg = '登錄模型';
        const gdir = path.join(MODELS_DIR, '戰艦組裝', '遊戲'); fs.mkdirSync(gdir, { recursive: true });
        fs.copyFileSync(out, path.join(gdir, base + '.glb'));
        const key = `sy_${job.hull}_${job.lv + 1}`, mf = path.join(MODELS_DIR, 'models.json'), man = JSON.parse(fs.readFileSync(mf, 'utf8'));
        const H0 = (readJSON(path.join(MODELS_DIR, '戰艦組裝', 'hulls.json'), {}).hulls || {})[job.hull] || {};
        man.models[key] = { file: `戰艦組裝/遊戲/${base}.glb`, kind: 'hull', forward: '+x', name: `${H0.name || job.hull} Lv${job.lv + 1}（戰艦組裝）` };
        writeAtomic(mf, JSON.stringify(man, null, 2));
        const slots = {};
        for (const pc of job.design.pieces || []) if (pc.k === 'slot') slots[pc.kind + pc.n] = { p: pc.p, r: pc.r || [0, 0, 0], arc: pc.arc || 0 };
        const hf = path.join(MODELS_DIR, '戰艦組裝', 'hulls.json'), hj = readJSON(hf, { version: 1, hulls: {} }), H = hj.hulls[job.hull];
        if (H) {
          H.pub = (H.pub || [null, null, null, null, null]).slice(0, 5); while (H.pub.length < 5) H.pub.push(null);
          H.pub[job.lv] = { model: key, design: job.did, at: Date.now(), tris: result.tris, size: result.size, slots };
          fs.copyFileSync(hf, hf + '.bak'); writeAtomic(hf, JSON.stringify(hj, null, 1));
        }
        await refreshModels();
        job.result = { ...result, key, sec: Math.round((Date.now() - t0) / 1000), pub: H && H.pub[job.lv] };
        job.state = 'done'; job.msg = '完成';
        log(`戰艦組裝：${base} 發佈完成（${result.tris0} → ${result.tris} 面，${Math.round(result.bytes / 1024)} KB，${job.result.sec} 秒）`);
        // 輸入的 GLB 留在快取（data/cache/shipyard/艦種_lvN_in.glb，下次發佈覆蓋）：可以直接拿來重跑 bake.py 查問題
        resolve();
      } catch (e) { fail(e.message); }
    });
  });
}
function canEditModels(req) {
  if (CFG.modelEdit === 'all') return true;
  if (CFG.modelEdit === 'off') return false;
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
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
  MODELS_DIR = path.resolve(BASE, CFG.modelsDir); WEB_DIR = path.resolve(BASE, CFG.webDir); BLD_DIR = path.join(MODELS_DIR, '建築');
  for (const d of [DATA, PLAYERS_DIR, BACKUP_DIR, CACHE_DIR]) fs.mkdirSync(d, { recursive: true });
  loadSessions();
  log(`讀取模型資料夾：${MODELS_DIR}`);
  const t0 = Date.now();
  await refreshModels();
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
