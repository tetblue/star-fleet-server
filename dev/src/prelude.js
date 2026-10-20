// ═══ 啟動前：登入伺服器、取得存檔、提供 STORE（取代 localStorage，寫入會自動同步到伺服器）═══
(() => {
  'use strict';
  const Q = new URLSearchParams(location.search), SK = 'fleet.session';
  const $ = (id) => document.getElementById(id), body = $('boot-body');
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let token = null, me = null, DATA = {}, frozen = false;
  try { const s = JSON.parse(localStorage.getItem(SK) || 'null'); if (s) { token = s.token; me = s.name; } } catch (e) { /* 沒有記住的登入 */ }
  const hdr = () => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) });
  async function call(method, url, b) {
    const r = await fetch(url, { method, headers: hdr(), body: b === undefined ? undefined : JSON.stringify(b) });
    let j = null; try { j = await r.json(); } catch (e) { /* 不是 JSON */ }
    if (!r.ok) { const e = new Error((j && j.error) || '伺服器回應 ' + r.status); e.status = r.status; if (r.status === 401 && started) relogin(); throw e; }
    return j;
  }
  let started = false;
  async function logout() { try { await flush(); await call('POST', 'api/logout', {}); } catch (e) { /* 照樣登出 */ } frozen = true; try { localStorage.removeItem(SK); } catch (e) { /* 無法清除 */ } location.href = location.pathname; }
  function relogin() { if (frozen) return; frozen = true; try { localStorage.removeItem(SK); } catch (e) { /* 無法清除 */ } alertBox('登入已失效（可能伺服器重設過），請重新登入。', () => location.reload()); }
  window.API = { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u), name: () => me, logout, headers: hdr };

  // ── 存檔同步 ──
  const S = { rev: 0, dirty: false, busy: false, timer: 0, state: 'ok' };
  function setState(s) { if (S.state === s) return; S.state = s; const b = $('save-badge'); if (b) b.hidden = s !== 'error'; dispatchEvent(new CustomEvent('savesync', { detail: s })); }
  function schedule(ms = 1200) { S.dirty = true; if (S.state !== 'error') setState('pending'); clearTimeout(S.timer); S.timer = setTimeout(flush, ms); }
  async function flush(keepalive) {
    if (frozen || !S.dirty || S.busy) return;
    S.busy = true; S.dirty = false; if (!keepalive) setState('saving');
    const payload = JSON.stringify({ rev: S.rev, data: DATA });
    try {
      const r = await fetch('api/save', { method: 'PUT', headers: hdr(), body: payload, keepalive: !!keepalive && payload.length < 60000 });
      if (r.status === 401) { relogin(); throw new Error('401'); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      S.rev = (await r.json()).rev; setState(S.dirty ? 'pending' : 'ok');
    } catch (e) { S.dirty = true; setState('error'); clearTimeout(S.timer); S.timer = setTimeout(flush, 5000); }
    S.busy = false;
    if (S.dirty && S.state !== 'error') schedule(400);
  }
  addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });
  const own = (k) => Object.prototype.hasOwnProperty.call(DATA, k);
  window.STORE = {
    getItem: (k) => (own(k) ? DATA[k] : null),
    setItem: (k, v) => { v = String(v); if (DATA[k] === v) return; DATA[k] = v; schedule(); },
    removeItem: (k) => { if (own(k)) { delete DATA[k]; schedule(); } },
    sync: async () => { S.dirty = S.dirty || false; clearTimeout(S.timer); await flush(); },
    state: () => S.state, freeze: () => { frozen = true; },
    dump: () => ({ ...DATA }),   // 整份存檔的複本（存檔欄位、匯出用）
  };

  // ── 啟動畫面 ──
  window.BOOT = {
    status(text, f) { body.innerHTML = `<p class="boot-st">${esc(text)}</p><div class="boot-bar"><i style="width:${Math.round((f || 0) * 100)}%"></i></div>`; },
    warn(html) { return new Promise((res) => { body.innerHTML = `<p class="boot-warn">${html}</p><button class="g-btn pri" id="boot-go">繼續</button>`; $('boot-go').onclick = res; }); },
    done() { $('boot').hidden = true; },
  };
  function alertBox(msg, then) { const b = $('boot'); b.hidden = false; body.innerHTML = `<p class="boot-warn">${esc(msg)}</p><button class="g-btn pri" id="boot-go">確定</button>`; $('boot-go').onclick = then; }

  async function enter(t, name) {
    token = t; me = name;
    try { localStorage.setItem(SK, JSON.stringify({ token, name })); } catch (e) { /* 這次有效 */ }
    BOOT.status('讀取存檔…', 0);
    const sv = await call('GET', 'api/save');
    DATA = sv.data || {}; S.rev = sv.rev | 0;
    if (Q.has('fresh')) { DATA = {}; schedule(10); }   // 測試用：從空白存檔開始
    started = true;
    const sc = document.createElement('script'); sc.src = 'game.js?v=' + (window.__BUILD || '');
    sc.onerror = () => alertBox('遊戲程式載入失敗，請重新整理。', () => location.reload());
    document.body.appendChild(sc);
  }
  async function tryLogin(name, pw) { const r = await call('POST', 'api/login', { name, password: pw }); await enter(r.token, r.name); }
  async function register(name, pw) { const r = await call('POST', 'api/register', { name, password: pw }); await enter(r.token, r.name); }

  async function loginScreen(msg) {
    token = null;
    let players = [], info = {};
    try { [players, info] = await Promise.all([call('GET', 'api/players'), call('GET', 'api/info')]); }
    catch (e) { body.innerHTML = `<p class="boot-warn">連不到伺服器：${esc(e.message)}</p><button class="g-btn" onclick="location.reload()">重試</button>`; return; }
    body.innerHTML = `${msg ? `<p class="boot-warn">${esc(msg)}</p>` : ''}
      <div class="boot-sec"><h3>選擇玩家</h3><div class="boot-players">${players.length ? players.map((p) => `<button class="g-btn" data-p="${esc(p.name)}" data-pw="${p.hasPassword ? 1 : 0}">${esc(p.name)}${p.hasPassword ? ' 🔒' : ''}</button>`).join('') : '<span class="g-dim">還沒有玩家，先建立一個。</span>'}</div>
        <div class="boot-pw" id="boot-pw" hidden><span id="boot-who"></span><input class="g-in" type="password" id="boot-pwi" placeholder="密碼"><button class="g-btn pri" id="boot-in">登入</button></div></div>
      ${info.allowRegister !== false ? `<div class="boot-sec"><h3>新玩家</h3><div class="boot-new"><input class="g-in" id="boot-nn" maxlength="24" placeholder="名稱"><input class="g-in" type="password" id="boot-np" placeholder="密碼（可留空）"><button class="g-btn" id="boot-reg">建立並進入</button></div></div>` : ''}
      <p class="boot-err" id="boot-err"></p>`;
    const err = (e) => { $('boot-err').textContent = e.message || e; };
    let pick = null;
    body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
      pick = b.dataset.p;
      if (b.dataset.pw === '1') { $('boot-pw').hidden = false; $('boot-who').textContent = pick; $('boot-pwi').value = ''; $('boot-pwi').focus(); }
      else tryLogin(pick, '').catch(err);
    }));
    if ($('boot-in')) { $('boot-in').onclick = () => tryLogin(pick, $('boot-pwi').value).catch(err); $('boot-pwi').onkeydown = (e) => { if (e.key === 'Enter') $('boot-in').click(); }; }
    if ($('boot-reg')) { $('boot-reg').onclick = () => register($('boot-nn').value, $('boot-np').value).catch(err); $('boot-np').onkeydown = (e) => { if (e.key === 'Enter') $('boot-reg').click(); }; }
  }

  (async () => {
    const qp = Q.get('player');   // 測試用：?player=名稱（沒密碼的玩家，沒有就建立）
    if (qp) { try { await tryLogin(qp, ''); } catch (e) { if (e.status === 404) await register(qp, '').catch((x) => loginScreen(x.message)); else loginScreen(e.message); } return; }
    if (token) {
      try { await enter(token, me); return; } catch (e) { if (e.status !== 401) { loginScreen('連不到伺服器：' + e.message); return; } }
    }
    loginScreen();
  })();
})();
