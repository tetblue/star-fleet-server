// ═══════════════ 多人戰鬥：大廳、房間、鎖步同步 ═══════════════
// 戰鬥的模擬在每個瀏覽器各自跑（同一個種子＋同一串命令＝同樣的結果），伺服器只當「時鐘」：
//   每一回合（TURN_TICKS 個模擬 tick）把這段時間收到的命令廣播給房間裡的每個人，命令在該回合開頭的 tick 生效。
//   瀏覽器收到第 n 回合，才可以把模擬推進到 (n+1)×TURN_TICKS 之前；回合照房主選的速度發出。
// 連線：GET /api/mp/stream（一行一個 JSON 的串流）收訊息；POST /api/mp/act 送動作。
// 中途加入（觀戰、斷線重連）：送出開局資料＋到目前為止的全部命令，瀏覽器自己快轉追上。
'use strict';
const crypto = require('crypto');

const SIM_HZ = 60, TURN_TICKS = 4;
const SPEEDS = [0.5, 1, 2, 4];
const SIZES = 3, TERRS = 4, OPS = 3;
const WAIT_DROP_MS = 20e3;      // 等待中的房間：玩家斷線這麼久就離開座位
const BATTLE_DROP_MS = 60e3;    // 戰鬥中：玩家斷線這麼久就判定投降
const START_DELAY_MS = 1500;    // 開局：給瀏覽器建立戰場的時間

module.exports = function createMulti({ log }) {
  const conns = new Map();   // 玩家 id → { id, name, res, room, lost }
  const rooms = new Map();   // 房間 id → room
  let roomSeq = 0;

  // ───── 傳送 ─────
  function push(c, msg) { if (c && c.res) { try { c.res.write(JSON.stringify(msg) + '\n'); } catch (e) { /* 連線已斷 */ } } }
  function toRoom(r, msg) { const s = JSON.stringify(msg) + '\n'; for (const id of members(r)) { const c = conns.get(id); if (c && c.res) { try { c.res.write(s); } catch (e) { /* 連線已斷 */ } } } }
  function members(r) { return [...r.seats.filter(Boolean).map((s) => s.id), ...r.specs]; }
  function roomInfo(r) {
    return { id: r.id, name: r.name, host: r.host, state: r.state, opts: r.opts,
      seats: r.seats.map((s) => s && { id: s.id, name: s.name, faction: s.faction, ready: s.ready, online: !!(conns.get(s.id) || {}).res }),
      specs: [...r.specs].map((id) => (conns.get(id) || {}).name || '?'), result: r.result || null };
  }
  function lobbyList() { return [...rooms.values()].map((r) => ({ id: r.id, name: r.name, state: r.state, opts: r.opts, players: r.seats.map((s) => s && s.name), specs: r.specs.size })); }
  function sendLobby() { const msg = { t: 'lobby', rooms: lobbyList() }; for (const c of conns.values()) if (!c.room) push(c, msg); }
  function sendRoom(r) { toRoom(r, { t: 'room', room: roomInfo(r) }); sendLobby(); }

  // ───── 房間 ─────
  function seatOf(r, id) { return r.seats.findIndex((s) => s && s.id === id); }
  function leaveRoom(c, quiet) {
    const r = c.room && rooms.get(c.room); c.room = null;
    if (!r) return;
    const k = seatOf(r, c.id);
    if (k >= 0) {
      if (r.state === 'battle') { surrender(r, k, '離開了戰鬥'); r.seats[k].left = true; }
      else r.seats[k] = null;
    }
    r.specs.delete(c.id);
    if (!quiet) push(c, { t: 'left' });
    if (r.seats.every((s) => !s || s.left) && (r.state !== 'battle' || !r.specs.size)) { closeRoom(r); return; }
    if (r.host === c.id) { const h = r.seats.find((s) => s && !s.left); if (h) r.host = h.id; }
    if (r.state !== 'battle') for (const s of r.seats) if (s) s.ready = false;   // 有人離開：大家重新準備
    sendRoom(r);
  }
  function closeRoom(r) {
    stopClock(r); rooms.delete(r.id);
    for (const id of members(r)) { const c = conns.get(id); if (c && c.room === r.id) { c.room = null; push(c, { t: 'left', why: '房間已關閉' }); } }
    sendLobby();
  }
  function validOpts(o, cur) {
    const n = (v, max, d) => (Number.isInteger(v) && v >= 0 && v < max ? v : d);
    return { size: n(o.size, SIZES, cur.size), terr: n(o.terr, TERRS, cur.terr), op: n(o.op, OPS, cur.op), speed: n(o.speed, SPEEDS.length, cur.speed), map: (o.map >>> 0) || cur.map };
  }
  const newMap = () => (crypto.randomBytes(4).readUInt32LE(0) % 1e9) || 1;

  // ───── 戰鬥：伺服器時鐘 ─────
  function startBattle(r) {
    r.state = 'battle'; r.cmds = []; r.pending = []; r.turn = -1; r.hashes = new Map(); r.desync = false; r.result = null; r.ends = [null, null];
    r.start = { seed: crypto.randomBytes(4).readUInt32LE(0) % 1e9, opts: r.opts, speed: SPEEDS[r.opts.speed], K: TURN_TICKS,
      rules: r.seats[0].rules, names: r.seats.map((s) => s.name), factions: r.seats.map((s) => s.faction), sides: r.seats.map((s) => s.lo) };
    for (const s of r.seats) { s.ready = false; s.left = false; s.lostAt = 0; }
    r.t0 = Date.now() + START_DELAY_MS;
    toRoom(r, { t: 'start', start: r.start, cmds: [], turn: -1 });
    r.clock = setInterval(() => tick(r), 10);
    log(`多人戰鬥開始：${r.name}（${r.start.names.join(' vs ')}）`);
    sendRoom(r);
  }
  function stopClock(r) { if (r.clock) clearInterval(r.clock); r.clock = null; }
  function tick(r) {
    const now = Date.now();
    // 斷線太久的玩家：投降
    r.seats.forEach((s, k) => { if (s && !s.left && s.lostAt && now - s.lostAt > BATTLE_DROP_MS && !r.result) { s.lostAt = 0; surrender(r, k, '斷線'); } });
    if (now < r.t0) return;
    const due = Math.floor((now - r.t0) / 1000 * r.start.speed * SIM_HZ / TURN_TICKS);
    let n = 0;
    while (r.turn < due && n++ < 50) {
      r.turn++;
      const c = r.pending; r.pending = [];
      for (const x of c) { x.tick = r.turn * TURN_TICKS; r.cmds.push(x); }
      toRoom(r, c.length ? { t: 'turn', n: r.turn, c } : { t: 'turn', n: r.turn });
      // 勝負已定：再多送一點回合讓大家跑到結束的那一刻，然後停
      if (r.endTick != null && r.turn * TURN_TICKS > r.endTick + TURN_TICKS * 8) { stopClock(r); finish(r); return; }
    }
  }
  function surrender(r, side, why) {
    if (r.state !== 'battle' || r.endTick != null) return;
    r.pending.push({ type: 'surrender', side, why });
    toRoom(r, { t: 'note', msg: `${r.seats[side].name} ${why}` });
  }
  function finish(r) {
    r.state = 'wait'; r.endTick = null;   // 回到等待：上一場的結果留著給房間畫面看
    for (const s of r.seats) if (s) s.ready = false;
    r.seats = r.seats.map((s) => (s && s.left ? null : s));
    log(`多人戰鬥結束：${r.name}　${r.result ? r.result.kind + ' ' + r.result.why : ''}`);
    if (r.seats.every((s) => !s) && !r.specs.size) closeRoom(r); else sendRoom(r);
  }

  // ───── 連線 ─────
  function stream(req, res, me) {
    const old = conns.get(me.id);
    if (old && old.res) { push(old, { t: 'kicked', why: '你在別的地方連上了多人戰鬥' }); try { old.res.end(); } catch (e) { /* 已斷 */ } }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    req.socket.setNoDelay(true); req.socket.setKeepAlive(true);
    const c = old || { id: me.id, name: me.name, room: null };
    c.res = res; c.name = me.name; conns.set(me.id, c);
    push(c, { t: 'hello', me: { id: me.id, name: me.name } });
    const r = c.room && rooms.get(c.room);
    if (r) {   // 重新連上：回到原本的房間
      const k = seatOf(r, c.id); if (k >= 0) r.seats[k].lostAt = 0;
      push(c, { t: 'room', room: roomInfo(r) });
      if (r.state === 'battle') push(c, { t: 'start', start: r.start, cmds: r.cmds, turn: r.turn });
      sendRoom(r);
    } else { c.room = null; push(c, { t: 'lobby', rooms: lobbyList() }); }
    const hb = setInterval(() => push(c, { t: 'ping' }), 15e3);
    res.on('close', () => {
      clearInterval(hb);
      if (c.res !== res) return;   // 已被新的連線取代
      c.res = null;
      const rr = c.room && rooms.get(c.room);
      if (!rr) { conns.delete(c.id); return; }
      const k = seatOf(rr, c.id);
      if (k < 0) { leaveRoom(c, true); conns.delete(c.id); return; }   // 觀戰者斷線就離開
      if (rr.state === 'battle') { rr.seats[k].lostAt = Date.now(); toRoom(rr, { t: 'note', msg: `${c.name} 斷線了，${BATTLE_DROP_MS / 1000} 秒內沒回來就判定投降` }); sendRoom(rr); return; }
      setTimeout(() => { if (!c.res && c.room === rr.id) { leaveRoom(c, true); conns.delete(c.id); } }, WAIT_DROP_MS);
      sendRoom(rr);
    });
  }

  function act(me, b) {
    const c = conns.get(me.id);
    if (!c || !c.res) return { error: '還沒連上多人戰鬥' };
    const r = c.room && rooms.get(c.room), k = r ? seatOf(r, c.id) : -1;
    switch (b.op) {
      case 'create': {
        if (r) leaveRoom(c, true);
        const id = (++roomSeq).toString(36) + crypto.randomBytes(2).toString('hex');
        const name = String(b.name || `${me.name} 的房間`).slice(0, 30);
        const nr = { id, name, host: me.id, state: 'wait', opts: validOpts(b.opts || {}, { size: 1, terr: 3, op: 0, speed: 1, map: newMap() }), seats: [null, null], specs: new Set() };
        nr.seats[0] = { id: me.id, name: me.name, faction: 0, ready: false };
        rooms.set(id, nr); c.room = id;
        log(`多人房間：${me.name} 開了「${name}」`);
        sendRoom(nr); return { ok: true, room: id };
      }
      case 'join': {
        const nr = rooms.get(String(b.room));
        if (!nr) return { error: '房間已經不在了' };
        if (r && r !== nr) leaveRoom(c, true);
        c.room = nr.id;
        const free = nr.seats.findIndex((s) => !s);
        if (!b.spec && seatOf(nr, me.id) < 0 && free >= 0 && nr.state !== 'battle') { nr.seats[free] = { id: me.id, name: me.name, faction: 1 - ((nr.seats[1 - free] || {}).faction || 0), ready: false }; nr.specs.delete(me.id); }
        else if (seatOf(nr, me.id) < 0) nr.specs.add(me.id);
        sendRoom(nr);
        if (nr.state === 'battle') push(c, { t: 'start', start: nr.start, cmds: nr.cmds, turn: nr.turn });
        return { ok: true };
      }
      case 'leave': if (r) leaveRoom(c); else push(c, { t: 'lobby', rooms: lobbyList() }); return { ok: true };
      case 'lobby': push(c, { t: 'lobby', rooms: lobbyList() }); return { ok: true };
    }
    if (!r) return { error: '你不在房間裡' };
    switch (b.op) {
      case 'opts':
        if (r.host !== me.id || r.state === 'battle') return { error: '只有房主能改設定' };
        r.opts = validOpts(b.opts || {}, r.opts); if (b.reroll) r.opts.map = newMap();
        for (const s of r.seats) if (s) s.ready = false;
        sendRoom(r); return { ok: true };
      case 'sit': {   // 觀戰者坐上空位／玩家改去觀戰
        if (r.state === 'battle') return { error: '戰鬥中不能換位置' };
        if (b.spec) { if (k >= 0) { r.seats[k] = null; r.specs.add(me.id); if (r.host === me.id) { const h = r.seats.find(Boolean); if (h) r.host = h.id; } } }
        else if (k < 0) { const free = r.seats.findIndex((s) => !s); if (free < 0) return { error: '沒有空位' }; r.seats[free] = { id: me.id, name: me.name, faction: 0, ready: false }; r.specs.delete(me.id); }
        for (const s of r.seats) if (s) s.ready = false;
        sendRoom(r); return { ok: true };
      }
      case 'seat': {   // 陣營、準備（帶著部署好的艦隊）
        if (k < 0 || r.state === 'battle') return { error: '現在不能準備' };
        const s = r.seats[k];
        if (b.faction === 0 || b.faction === 1) s.faction = b.faction;
        if (b.ready) {
          if (!Array.isArray(b.lo) || !b.lo.length || b.lo.length > 16 || JSON.stringify(b.lo).length > 200000) return { error: '艦隊資料不對' };
          if (b.optsKey !== JSON.stringify(r.opts)) return { error: '房間設定剛改過，請重新編成' };
          s.lo = b.lo; s.rules = b.rules || {}; s.ready = true; s.faction = b.faction === 1 ? 1 : 0;
        } else s.ready = false;
        if (r.seats.every((x) => x && x.ready)) startBattle(r); else sendRoom(r);
        return { ok: true };
      }
      case 'cmd': {
        if (r.state !== 'battle' || k < 0 || r.endTick != null) return { ok: false };
        const list = Array.isArray(b.c) ? b.c : [b.c];
        for (const x of list.slice(0, 20)) {
          if (!x || typeof x.type !== 'string' || /^(surrender|rule|simctl|jam)$/.test(x.type)) continue;   // 這些只能由伺服器或模擬自己發出
          const s = JSON.stringify(x); if (s.length > 20000) continue;
          const cmd = JSON.parse(s); cmd.side = k; delete cmd.tick;
          r.pending.push(cmd);
        }
        return { ok: true };
      }
      case 'surrender': if (k >= 0) surrender(r, k, '投降了'); return { ok: true };
      case 'hash': {   // 戰局指紋：雙方同一個 tick 的指紋不一樣＝不同步
        if (r.state !== 'battle' || k < 0 || r.desync) return { ok: true };
        const t = b.tick | 0, h = String(b.h || ''), e = r.hashes.get(t) || [null, null];
        e[k] = h; r.hashes.set(t, e);
        if (e[0] && e[1]) {
          r.hashes.delete(t);
          if (e[0] !== e[1]) { r.desync = true; log(`多人戰鬥不同步：${r.name} tick ${t}`); toRoom(r, { t: 'desync', tick: t }); }
        }
        if (r.hashes.size > 50) r.hashes.delete(r.hashes.keys().next().value);
        return { ok: true };
      }
      case 'end': {   // 模擬算出勝負（雙方會得到一樣的結果）
        if (r.state !== 'battle' || k < 0) return { ok: true };
        const res = b.res || {};
        r.ends[k] = res;
        if (r.endTick == null) { r.endTick = res.tick | 0; r.result = { kind: res.kind, why: String(res.why || '').slice(0, 60), tick: res.tick, ratio: res.ratio, names: r.start.names }; }
        return { ok: true };
      }
      case 'chat': {
        const msg = String(b.msg || '').trim().slice(0, 200); if (!msg) return { ok: true };
        toRoom(r, { t: 'chat', from: me.name, msg }); return { ok: true };
      }
    }
    return { error: '沒有這個動作' };
  }

  return { stream, act, rooms: () => rooms.size };
};
