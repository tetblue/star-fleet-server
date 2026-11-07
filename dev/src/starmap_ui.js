// ───── 星海生涯：星圖畫面（資料模型在 starmap.js）─────
// 左邊是星圖（點星系選取），右邊是我的艦隊、選取的星系、日誌；上方是週數、資金與「結束回合」。
// 結束回合：所有艦隊移動 → 列出有我方艦隊的戰鬥，選擇介入方式（親自指揮／交給艦隊指揮官）→ 計算 → 戰報 → 下一週
let SMU = { S: null, sel: new Set(), sys: -1, view: null };
const SMU_CSS = `
.sm-wrap{position:fixed;inset:0;display:flex;flex-direction:column;background:#070b12;color:#dfe6ef;font-size:13px;z-index:5}
.sm-top{display:flex;align-items:center;gap:14px;padding:8px 14px;border-bottom:1px solid #1d2838;background:#0b111b;flex-wrap:wrap}
.sm-top h2{margin:0;font-size:17px;letter-spacing:1px}.sm-top .g-sp{flex:1}
.sm-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:10px;background:#121b29;font-size:12px}
.sm-chip i{width:9px;height:9px;border-radius:50%;display:inline-block}
.sm-body{flex:1;display:flex;min-height:0}
.sm-map{flex:1;position:relative;min-width:0}.sm-map canvas{position:absolute;inset:0;width:100%;height:100%;cursor:pointer}
.sm-side{width:360px;max-width:42vw;overflow-y:auto;border-left:1px solid #1d2838;background:#0a0f18;padding:10px 12px}
.sm-sec{margin:4px 0 14px}.sm-sec h3{font-size:13px;margin:0 0 6px;color:#9fb3cc;font-weight:600;letter-spacing:1px}
.sm-fl{display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px;align-items:center;padding:6px 8px;border:1px solid #1d2838;border-radius:6px;margin-bottom:6px;background:#0d1522}
.sm-fl.on{border-color:#3fbf7f;background:#0f1d18}.sm-fl .nm{font-weight:600}.sm-fl .sub{grid-column:2/4;color:#8b9bb0;font-size:12px}
.sm-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:0}.sm-kv dt{color:#8b9bb0}.sm-kv dd{margin:0}
.sm-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.sm-warn{color:#ffb35a;font-size:12px;margin-top:6px}.sm-bad{color:#ff6a5a}.sm-good{color:#5fd39a}.sm-ev{color:#c9a7ff}
.sm-log{font-size:12px;line-height:1.55;color:#aab7c8}.sm-log div{border-bottom:1px solid #121b29;padding:2px 0}
.sm-modal{position:fixed;inset:0;background:rgba(3,6,10,.78);display:flex;align-items:center;justify-content:center;z-index:9}
.sm-box{background:#0b111b;border:1px solid #2a3a52;border-radius:8px;max-width:760px;width:calc(100% - 32px);max-height:86vh;overflow-y:auto;padding:16px 18px}
.sm-box h3{margin:0 0 10px}.sm-bt{border:1px solid #1d2838;border-radius:6px;padding:8px 10px;margin-bottom:10px}
.sm-opt{display:flex;flex-wrap:wrap;gap:12px;margin-top:6px}.sm-opt label{display:flex;align-items:center;gap:5px}.sm-opt label.off{opacity:.45}
table.sm-t{border-collapse:collapse;width:100%;font-size:12px;margin-top:6px}table.sm-t td,table.sm-t th{border-bottom:1px solid #1a2433;padding:3px 6px;text-align:right}table.sm-t th:first-child,table.sm-t td:first-child{text-align:left}
@media (max-width:760px){.sm-body{flex-direction:column}.sm-side{width:auto;max-width:none;height:45vh;border-left:0;border-top:1px solid #1d2838}}
`;
const smuEsc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const smuShip = (n) => smuN(n * smRep());   // 艦數：星圖存的是圖示數，顯示時和戰場一樣乘上每個圖示代表的艘數
const smuN = (n) => (typeof fmtN === 'function' ? fmtN(Math.round(n)) : String(Math.round(n)));

// 進入星海生涯：有存檔就接著玩，沒有就開新局
function showStarmap() {
  setPhase('menu'); GAME.replaying = false;
  const S = smLoad();
  if (!S || S.v !== 1) return smuNewDialog();
  if (S.live) { S.live = null; smTurnEnd(S); smSave(S); }   // 真打到一半離開了：剩下的戰鬥用計算的，接著結束這一週
  SMU = { S, sel: new Set(), sys: -1, view: null };
  smuRender();
}
function smuNewDialog() {
  overlay(`<style>${SMU_CSS}</style><div class="g-wrap sp-wrap"><div class="g-head"><h2>星海生涯</h2><span class="crumb">開新局</span><span class="g-sp"></span><button class="g-btn" id="sm-back">← 返回</button></div>
    <p class="g-dim">你是聯盟的艦隊指揮官，帶著兩支分艦隊從前線出發。每一回合是一週：下令移動艦隊，結束回合後所有勢力同時行動，碰上敵軍就開戰。</p>
    <div class="sm-opt" style="margin:14px 0"><span class="g-dim">難度</span>${['簡單', '普通', '困難', '殘酷'].map((n, i) => `<label><input type="radio" name="sm-diff" value="${i}" ${i === 1 ? 'checked' : ''}> ${n}</label>`).join('')}</div>
    <button class="g-btn primary" id="sm-go">開始</button></div>`);
  gEl('sm-back').onclick = () => { GAME.spMode = null; showSingle(); };
  gEl('sm-go').onclick = () => {
    const d = +(document.querySelector('input[name="sm-diff"]:checked') || { value: 1 }).value;
    const S = smNewGame({ seed: (Math.random() * 1e9) >>> 0, diff: d });
    smSave(S); SMU = { S, sel: new Set(), sys: -1, view: null }; smuRender();
  };
}
function smuRender() {
  const S = SMU.S, c = smCounts(S);
  overlay(`<style>${SMU_CSS}</style><div class="sm-wrap">
    <div class="sm-top"><h2>星海生涯</h2><span class="sm-chip">第 ${S.turn} 週</span><span class="sm-chip">資金 ${smuN(S.pl.money)}</span>
      ${[SM_A, SM_E, SM_P, SM_N].map((f) => `<span class="sm-chip"><i style="background:${SM_FAC[f].col}"></i>${SM_FAC[f].name} ${c[f]}</span>`).join('')}
      <span class="sm-chip">${smAtWar(S, SM_A, SM_E) ? '聯盟與帝國交戰中' : '聯盟與帝國停戰中'}</span>
      <span class="g-sp"></span><button class="g-btn" id="sm-rep">戰報</button><button class="g-btn primary" id="sm-end">結束回合</button><button class="g-btn" id="sm-quit">離開</button></div>
    <div class="sm-body"><div class="sm-map" id="sm-map"><canvas id="sm-cv"></canvas></div><div class="sm-side" id="sm-side"></div></div></div>`);
  gEl('sm-quit').onclick = () => { smSave(S); window.removeEventListener('resize', smuDraw); GAME.spMode = null; showSingle(); };
  gEl('sm-end').onclick = smuEndTurn;
  gEl('sm-rep').onclick = () => smuReports(S.reports.slice(-12).reverse(), '最近的戰報');
  const cv = gEl('sm-cv');
  cv.onclick = (e) => { const r = cv.getBoundingClientRect(), id = smuHit(e.clientX - r.left, e.clientY - r.top); if (id >= 0) { SMU.sys = id; smuSide(); smuDraw(); } };
  window.removeEventListener('resize', smuDraw); window.addEventListener('resize', smuDraw);
  smuSide(); smuDraw();
}
// 星圖座標（0～100 × 0～60）→ 畫面
function smuXY(s) { const V = SMU.view; return [V.ox + s.x * V.k, V.oy + s.y * V.k]; }
function smuHit(x, y) { const S = SMU.S; let best = -1, bd = 22; for (const s of S.sys) { const [px, py] = smuXY(s), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = s.id; } } return best; }
function smuDraw() {
  const cv = gEl('sm-cv'); if (!cv || !SMU.S) return;
  const S = SMU.S, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.min((W - 40) / 100, (H - 50) / 60); SMU.view = { k, ox: (W - 100 * k) / 2, oy: (H - 60 * k) / 2 };
  g.fillStyle = '#070b12'; g.fillRect(0, 0, W, H);
  // 勢力範圍（淡色光暈）
  for (const s of S.sys) { if (s.owner === SM_N) continue; const [x, y] = smuXY(s), r = k * 9, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, SM_FAC[s.owner].col + '33'); gr.addColorStop(1, SM_FAC[s.owner].col + '00'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  // 航道
  g.lineWidth = 1.2; g.strokeStyle = '#2a3a52';
  for (const [a, b] of S.edges) { const [x1, y1] = smuXY(S.sys[a]), [x2, y2] = smuXY(S.sys[b]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  // 我方艦隊的移動命令
  for (const f of smPlFleets(S)) if (f.path) {
    g.strokeStyle = f.lock ? '#ffb35a' : '#3fbf7f'; g.lineWidth = 2.2; g.setLineDash([6, 5]); g.beginPath();
    f.path.forEach((i, n) => { const [x, y] = smuXY(S.sys[i]); if (n) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
  }
  // 星系
  for (const s of S.sys) {
    const [x, y] = smuXY(s), r = 5 + s.tier * 1.6;
    if (s.id === SMU.sys) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r + 6, 0, 7); g.stroke(); }
    if (s.sg) { g.strokeStyle = SM_FAC[s.sg.f].col; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, r + 3, 0, 7); g.stroke(); g.setLineDash([]); }
    g.fillStyle = SM_FAC[s.owner].col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (s.cap) { g.strokeStyle = '#ffe28a'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 1.5, 0, 7); g.stroke(); }
    g.fillStyle = '#cfd8e3'; g.font = '12px sans-serif'; g.textAlign = 'center'; g.fillText(s.name + (s.mega.dock || s.cap ? ' ⚓' : ''), x, y - r - 5);
    // 停在這裡的艦隊：各勢力一個標籤（艦數），我方的用綠框
    const fs = smFleetsAt(S, s.id), facs = [...new Set(fs.map((f) => f.fac))];
    facs.forEach((fac, n) => {
      const L = fs.filter((f) => f.fac === fac), ships = L.reduce((a, f) => a + smShips(f.comp), 0), pl = L.some((f) => f.pl);
      const tx = `${L.length}隊 ${smuShip(ships)}`, w = g.measureText(tx).width + 10, by = y + r + 6 + n * 16;
      g.fillStyle = SM_FAC[fac].col + 'cc'; g.fillRect(x - w / 2, by, w, 14); if (pl) { g.strokeStyle = '#3fbf7f'; g.lineWidth = 2; g.strokeRect(x - w / 2, by, w, 14); }
      g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText(tx, x, by + 11);
    });
    if (S.pend && S.pend.some((b) => b.sys === s.id && !b.done)) { g.font = '16px sans-serif'; g.fillText('⚔', x + r + 9, y + 5); }
  }
}
function smuSide() {
  const S = SMU.S, el = gEl('sm-side'); if (!el) return;
  const fls = smPlFleets(S);
  let h = `<div class="sm-sec"><h3>我的艦隊</h3>${fls.map((f) => {
    const s = S.sys[f.sys], ord = f.path ? `→ ${S.sys[f.path[f.path.length - 1]].name}${f.lock ? '（會開戰，已鎖定）' : ''}` : '待命';
    const rs = smCanResupply(S, f) ? smResupplyCost(S, f) : null;
    return `<div class="sm-fl ${SMU.sel.has(f.id) ? 'on' : ''}"><input type="checkbox" data-sel="${f.id}" ${SMU.sel.has(f.id) ? 'checked' : ''}>
      <span class="nm">${smuEsc(f.name)}</span><span>${smuShip(smShips(f.comp))} 艘</span>
      <span class="sub">在 ${smuEsc(s.name)}・${ord}${f.path && !f.lock ? ` <a href="#" data-cancel="${f.id}">取消</a>` : ''}</span>
      <span class="sub">撤退門檻 <select data-rt="${f.id}">${[0, 10, 20, 30, 40, 50].map((v) => `<option value="${v}" ${Math.round(f.retreat * 100) === v ? 'selected' : ''}>${v ? v + '%' : '不撤退'}</option>`).join('')}</select>
      ${rs && rs.cost > 0 ? `<button class="g-btn" data-rs="${f.id}">補充 ${smuShip(smShips(rs.miss))} 艘（${smuN(rs.cost)}）</button>` : ''}</span></div>`;
  }).join('')}<div class="g-dim">勾選艦隊，再點星圖上的星系下令移動。門檻越高，保住越多船，但越容易輸。</div></div>`;
  if (SMU.sys >= 0) h += smuSysPanel(S.sys[SMU.sys]);
  h += `<div class="sm-sec"><h3>日誌</h3><div class="sm-log">${S.log.slice(-14).reverse().map((l) => `<div class="sm-${l.c}">第 ${l.turn} 週・${smuEsc(l.t)}</div>`).join('')}</div></div>`;
  el.innerHTML = h;
  el.querySelectorAll('[data-sel]').forEach((b) => (b.onchange = () => { const id = +b.dataset.sel; if (b.checked) SMU.sel.add(id); else SMU.sel.delete(id); smuSide(); }));
  el.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); smCancel(S, S.fleets.find((f) => f.id === +b.dataset.cancel)); smuRefresh(); }));
  el.querySelectorAll('[data-rt]').forEach((b) => (b.onchange = () => { S.fleets.find((f) => f.id === +b.dataset.rt).retreat = +b.value / 100; smSave(S); }));
  el.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = () => { const n = smResupply(S, S.fleets.find((f) => f.id === +b.dataset.rs)); if (n) toast(`補充了 ${smuShip(n)} 艘`); smuRefresh(); }));
  const mv = gEl('sm-move'); if (mv) mv.onclick = smuMove;
  const ac = gEl('sm-as-cmd'); if (ac) ac.onclick = () => smuAssault('cmd');
  const aw = gEl('sm-as-watch'); if (aw) aw.onclick = () => smuAssault('watch');
  const as = gEl('sm-assault'); if (as) as.onclick = () => { const s = S.sys[SMU.sys]; s.assault = s.assault === S.turn ? -1 : S.turn; smuRefresh(); };
}
function smuSysPanel(s) {
  const S = SMU.S, fs = smFleetsAt(S, s.id), facs = [...new Set(fs.map((f) => f.fac))];
  let h = `<div class="sm-sec"><h3>${smuEsc(s.name)}${s.cap ? '（首都）' : ''}</h3><dl class="sm-kv">
    <dt>所屬</dt><dd style="color:${SM_FAC[s.owner].col}">${SM_FAC[s.owner].name}</dd>
    <dt>都市</dt><dd>${SM_TIER[s.tier]}・人口 ${s.pop}・繁榮 ${s.prosp}</dd>
    <dt>地面防禦</dt><dd>守軍 ${smuN(s.gar)}・防衛建築 ${s.def}${s.mega.shield ? '・行星護盾' : ''}</dd>
    <dt>巨型建築</dt><dd>${Object.keys(s.mega).map((k) => SM_MEGA[k]).join('、') || '無'}</dd>
    <dt>戰鬥空間</dt><dd>${SM_SIZE[s.size]}（每波每方最多 ${smuShip(SM_RULE.wave[s.size])} 艘）</dd>
    ${s.sg ? `<dt>軌道</dt><dd style="color:${SM_FAC[s.sg.f].col}">${SM_FAC[s.sg.f].name}控制中，圍城第 ${s.sg.t}／${SM_RULE.siegeT} 週</dd>` : ''}
    <dt>艦隊</dt><dd>${facs.length ? facs.map((fac) => { const L = fs.filter((f) => f.fac === fac); return `<span style="color:${SM_FAC[fac].col}">${SM_FAC[fac].name} ${L.length} 支・${smuShip(L.reduce((a, f) => a + smShips(f.comp), 0))} 艘</span>`; }).join('<br>') : '無'}</dd></dl>`;
  // 下令：勾選的艦隊移動到這裡
  const sel = smPlFleets(SMU.S).filter((f) => SMU.sel.has(f.id) && f.sys !== s.id);
  if (sel.length) {
    const P = sel.map((f) => ({ f, P: smPlanMove(S, f, s.id) })), bad = P.filter((o) => !o.P.ok), ok = P.filter((o) => o.P.ok);
    const cost = ok.reduce((a, o) => a + o.P.cost, 0), fight = ok.some((o) => o.P.fight), mid = ok.some((o) => o.P.mid.length);
    h += `<div class="sm-btns"><button class="g-btn primary" id="sm-move" ${ok.length ? '' : 'disabled'}>派 ${ok.length} 支艦隊到這裡（${cost ? `費用 ${smuN(cost)}` : '免費'}）</button></div>`;
    if (bad.length) h += `<div class="sm-warn">${bad.map((o) => `${smuEsc(o.f.name)}：${o.P.why}`).join('<br>')}</div>`;
    if (fight) h += '<div class="sm-warn">這道命令會引發戰鬥：下令後無法撤銷。</div>';
    if (mid) h += '<div class="sm-warn">途中經過有敵方艦隊的星系，可能被攔下來先打一仗。</div>';
  }
  // 強攻：我方艦隊控制這裡的軌道
  if (s.sg && s.sg.f === S.pl.fac && fs.some((f) => f.pl)) {
    h += s.assaulted === S.turn ? '<div class="g-dim">這一週已經強攻過了。</div>' : `<div class="g-dim" style="margin-top:8px">強攻地面：快，但建築受損、繁榮下降。不強攻的話，控制軌道 ${SM_RULE.siegeT} 週後星球投降。</div>
      <div class="sm-btns"><button class="g-btn" id="sm-as-cmd">強攻：親自指揮</button><button class="g-btn ${s.assault === S.turn ? 'primary' : ''}" id="sm-assault">${s.assault === S.turn ? '已交給艦隊指揮官：本週結束時強攻（再按取消）' : '強攻：交給艦隊指揮官'}</button>${S.pl.skipWatch ? '' : '<button class="g-btn" id="sm-as-watch">強攻：觀戰</button>'}</div>`;
  }
  return h + '</div>';
}
function smuMove() {
  const S = SMU.S, s = S.sys[SMU.sys], sel = smPlFleets(S).filter((f) => SMU.sel.has(f.id) && f.sys !== s.id);
  const plans = sel.map((f) => ({ f, P: smPlanMove(S, f, s.id) })).filter((o) => o.P.ok);
  if (plans.some((o) => o.P.fight || o.P.mid.length) && !confirm('這道命令會引發戰鬥，下令後無法撤銷。確定要下令嗎？')) return;
  const msg = [];
  for (const o of plans) { const r = smOrder(S, o.f, s.id); if (!r.ok) msg.push(`${o.f.name}：${r.why}`); }
  if (msg.length) toast(msg.join('；'), 'bad');
  SMU.sel.clear(); smuRefresh();
}
function smuRefresh() { smSave(SMU.S); smuSide(); smuDraw(); const top = document.querySelector('.sm-top .sm-chip:nth-of-type(2)'); if (top) top.textContent = `資金 ${smuN(SMU.S.pl.money)}`; }

// 結束回合：移動 → 我方的戰鬥先選介入方式 → 計算 → 戰報
function smuEndTurn() {
  const S = SMU.S;
  smTurnMove(S);
  const mine = S.pend.filter((b) => b.pl);
  smuDraw();
  if (!mine.length) return smuFinishTurn([]);
  const fsAt = (sid, pred) => smFleetsAt(S, sid).filter(pred);
  smuModal(`<h3>第 ${S.turn} 週・我方艦隊的戰鬥</h3><p class="g-dim">選擇每一場戰鬥要怎麼打。結果在選擇之後才會揭曉。</p>
    ${mine.map((b, i) => {
      const s = S.sys[b.sys], my = fsAt(b.sys, (f) => f.fac === S.pl.fac), en = fsAt(b.sys, (f) => smAtWar(S, S.pl.fac, f.fac));
      return `<div class="sm-bt"><b>${smuEsc(s.name)}</b>　<span class="g-dim">戰鬥空間${SM_SIZE[s.size]}（每波每方最多 ${smuShip(SM_RULE.wave[s.size])} 艘）</span>
        <div>我方：${my.map((f) => `${smuEsc(f.name)} ${smuShip(smShips(f.comp))} 艘`).join('、')}</div>
        <div>敵方：${[...new Set(en.map((f) => f.fac))].map((fac) => `<span style="color:${SM_FAC[fac].col}">${SM_FAC[fac].name} ${en.filter((f) => f.fac === fac).length} 支・${smuShip(en.filter((f) => f.fac === fac).reduce((a, f) => a + smShips(f.comp), 0))} 艘</span>`).join('、')}</div>
        <div class="sm-opt"><label><input type="radio" name="sm-how${i}" value="cmd"> 親自指揮</label>
          <label><input type="radio" name="sm-how${i}" value="ai" checked> 交給艦隊指揮官</label>
          ${S.pl.skipWatch ? '' : `<label><input type="checkbox" id="sm-watch${i}"> 觀戰（AI 指揮雙方，真的打一場）</label>`}</div></div>`;
    }).join('')}
    <div class="sm-opt"><label><input type="checkbox" id="sm-skipw" ${S.pl.skipWatch ? 'checked' : ''}> 一律跳過觀戰（交給艦隊指揮官時不再詢問）</label></div>
    <div class="sm-btns"><button class="g-btn primary" id="sm-fight">開戰</button></div>`);
  gEl('sm-fight').onclick = () => {
    S.pl.skipWatch = gEl('sm-skipw').checked;
    const reps = [], live = [];
    mine.forEach((b, i) => {
      const how = (document.querySelector(`input[name="sm-how${i}"]:checked`) || { value: 'ai' }).value, w = gEl(`sm-watch${i}`);
      if (how === 'cmd' || (w && w.checked)) live.push({ sys: b.sys, how: how === 'cmd' ? 'cmd' : 'watch' });
      else { reps.push(smResolve(S, b.sys, 'ai')); b.done = true; }
    });
    smuCloseModal();
    if (!live.length) return smuFinishTurn(reps);
    S.live = { q: live, reps: reps.map((r) => S.reports.indexOf(r)) }; smSave(S);   // 真打的戰鬥：一場一場進戰場
    smuNextLive();
  };
}
// ───── 真打的戰鬥（親自指揮、觀戰）─────
let SMB = null;   // 進行中的戰鬥：{ sys, fa, fb, how, cap, th: 各艦隊的撤退門檻, gone: 已躍遷的艦隊, jump: 充能完成的時間 }
function smuNextLive() {
  const S = SMU.S, L = S.live;
  while (L && L.q.length) {
    const b = L.q.shift(), en = smEnemyAt(S, S.pl.fac, b.sys);
    if (!en.length || !smFleetsAt(S, b.sys).some((f) => f.fac === S.pl.fac)) continue;   // 敵人已經不在了
    const fb = [...new Set(en.map((f) => f.fac))].sort((x, y) => smFacValAt(S, b.sys, y) - smFacValAt(S, b.sys, x))[0];
    const m = smuLayout(S, b.sys, S.pl.fac, fb, b.how);
    smSave(S);
    simEndMid(); overlay(null); SIM.m = m; SIM.sel = null;
    camAnim = null; view.target.x = 0; view.target.z = 0; view.height = 1500; view.yaw = 0; view.pitch = ELEV; updateCamera();
    SMB = { sys: b.sys, fa: S.pl.fac, fb, how: b.how, cap: SM_RULE.wave[S.sys[b.sys].size], th: m.fleets.map((f) => f.th || 0), gone: new Set(), jump: {}, saved: {} };
    simStart();
    return;
  }
  // 都打完了
  const reps = (L ? L.reps : []).map((i) => S.reports[i]).filter(Boolean);
  S.live = null; SMB = null;
  setPhase('menu'); smuRender();
  smuFinishTurn(reps);
}
// ───── 強攻：近地戰（地面砲台＋少數守備艦），砲台也算敵人，全部打掉才算攻下 ─────
function smuAssault(how) {
  const S = SMU.S, s = S.sys[SMU.sys];
  if (!confirm(`強攻 ${s.name}：打下來就佔領，建築會受損、繁榮下降。現在就開打？`)) return;
  const fs = smFleetsAt(S, s.id).filter((f) => f.fac === S.pl.fac).sort((a, b) => (b.pl ? 1 : 0) - (a.pl ? 1 : 0)).slice(0, 6);
  const keys = GROUND_KEYS.filter((k) => k !== 'city'), scene = s.tier >= 2 || !keys.length ? 'city' : keys[s.id % keys.length];
  const seed = (S.turn * 7919 + s.id * 104729 + S.r) % 100000, cap = SM_RULE.wave[s.size];
  const m = { name: `強攻 ${s.name}（第 ${S.turn} 週）`, fac: SM_FAC[S.pl.fac].game === 0 ? 0 : 1, victory: true, ctl: how === 'cmd' ? 0 : -1, watch: how === 'watch', seed, fleets: [], terrain: [], ais: [],
    ground: { scene, seed: seed + 1, def: 1 }, names: [SM_FAC[S.pl.fac].name + '軍', SM_FAC[s.owner].name + '守軍'], career: { sys: s.id, fa: S.pl.fac, fb: s.owner, how, map: [], assault: true } };
  let n = 0;
  fs.forEach((f, i) => {
    const on = n < cap || !i; n += smShips(f.comp);
    m.fleets.push({ side: 0, name: f.name, cmdr: { base: null, name: f.cmdr.name, title: '', trait: 'dmg', level: f.cmdr.lv, mode: 'lv', tal: {}, skills: ['focus', 'charge'] }, comp: f.comp.slice(), hangar: HANGAR_DEFAULT.slice(),
      formation: 'line', orderly: false, layers: 1, x: Math.round((i - (fs.length - 1) / 2) * 380), z: on ? 420 : 900, y: 0, h: Math.PI, ai: { tactic: 'push', level: f.cmdr.lv }, reserve: !on, at: 1e9, th: f.retreat || 0 });
    m.career.map.push(f.id);
  });
  // 守備艦：守方不會為了少數船對自己的星球開火，所以只有少量戰艦（依守軍多寡）
  const dn = Math.max(20, Math.min(160, Math.round(s.gar / 4))), dc = [0, 0, Math.round(dn * 0.2), Math.round(dn * 0.4), dn - Math.round(dn * 0.2) - Math.round(dn * 0.4), 0];
  m.fleets.push({ side: 1, name: `${s.name}守備艦隊`, cmdr: { base: null, name: '守備司令', title: '', trait: 'shield', level: 2, mode: 'lv', tal: {}, skills: ['wall'] }, comp: dc, hangar: HANGAR_DEFAULT.slice(),
    formation: 'line', orderly: false, layers: 1, x: 0, z: -300, y: 0, h: 0, ...(SM_FAC[s.owner].game >= 2 ? { fac: SM_FAC[s.owner].game } : {}), ai: { tactic: 'push', level: 2 }, reserve: false, at: 1e9 });
  m.career.map.push(null);
  m.ais = [{ lv: 1, tac: 'push' }, { lv: 1, tac: 'push' }];
  s.assault = -1; smSave(S);
  simEndMid(); overlay(null); SIM.m = m; SIM.sel = null;
  camAnim = null; view.target.x = 0; view.target.z = 0; view.height = 1500; view.yaw = 0; view.pitch = ELEV; updateCamera();
  SMB = { sys: s.id, fa: S.pl.fac, fb: s.owner, how, cap, th: m.fleets.map((f) => f.th || 0), gone: new Set(), jump: {}, saved: {}, assault: true, defN: smShips(dc) };
  simStart();
  SMB.turTot = GRD ? GRD.tur.length : 0;
}
function smuAssaultDone() {
  const S = SMU.S, B = SMB, m = SIM.m, R = GAME.result || { kind: 'end' };
  const fleetsRes = m.career.map.map((id, i) => {
    if (id == null) return null;
    const f = fleets.find((o) => o.id === i), orig = m.fleets[i].comp, comp = orig.map(() => 0);
    if (B.saved[i]) B.saved[i].forEach((x, k) => { if (k < comp.length) comp[k] = x; });
    else if (f) for (const q of f.sqs) for (let k = 0; k < comp.length; k++) comp[k] += Math.max(0, q.typeAlive[k] || 0);
    return { id, comp: comp.map((x, k) => Math.min(orig[k], x)), gone: B.gone.has(i) };
  }).filter(Boolean);
  const di = m.career.map.indexOf(null), df = fleets.find((o) => o.id === di), defLeft = df ? df.sqs.reduce((a, q) => a + Math.max(0, q.alive), 0) : 0;
  const win = R.kind === 'win', turLeft = GRD ? GRD.live : 0;
  const rep = smApplyAssault(S, B.sys, { fleets: fleetsRes, win, turLeft: win ? 0 : turLeft, turTot: B.turTot || 0, defLost: Math.max(0, B.defN - defLeft) }, B.how);
  SMB = null; smSave(S);
  setPhase('menu'); smuRender(); smuReports([rep], `強攻 ${rep.name}`);
}
// 星圖的艦隊 → 戰場布局：我方在南、敵方在北；每一方先上場到每波上限，其餘在場外待命，場上空出來就補上
function smuLayout(S, sid, fa, fb, how) {
  const s = S.sys[sid], cap = SM_RULE.wave[s.size], seed = (S.turn * 7919 + sid * 104729 + S.r) % 100000;
  const m = { name: `${s.name}（第 ${S.turn} 週）`, fac: SM_FAC[fa].game === 0 ? 0 : 1, victory: true, ctl: how === 'cmd' ? 0 : -1, watch: how === 'watch', seed, fleets: [], terrain: [], ais: [],
    names: [SM_FAC[fa].name + '軍', SM_FAC[fb].name + '軍'], career: { sys: sid, fa, fb, how, map: [] } };
  for (const [side, fac] of [[0, fa], [1, fb]]) {
    const L = smFleetsAt(S, sid).filter((f) => f.fac === fac).sort((a, b) => (b.pl ? 1 : 0) - (a.pl ? 1 : 0) || smVal(b.comp) - smVal(a.comp)).slice(0, 8);   // 引擎每場最多 40 個分隊：每方最多 8 支
    const lv = Math.round(smLv(L)) || 1;
    m.ais.push({ lv: Math.max(0, Math.min(4, lv - 1)), tac: L[0] ? L[0].cmdr.tac : 'push' });
    let n = 0, k = 0;
    const field = L.filter((f) => { const on = n < cap || !k; if (on) { n += smShips(f.comp); k++; } return on; });
    L.forEach((f, i) => {
      const on = field.includes(f), col = on ? field.indexOf(f) - (field.length - 1) / 2 : 0, south = side === 0;
      const tac = f.cmdr.tac || 'push';
      m.fleets.push({ side, name: f.name, cmdr: { base: null, name: f.cmdr.name, title: '', trait: tac === 'kite' ? 'speed' : tac === 'push' ? 'shield' : 'dmg', level: f.cmdr.lv, mode: 'lv', tal: {}, skills: ['focus', 'charge'] },
        comp: f.comp.slice(), hangar: HANGAR_DEFAULT.slice(), formation: tac === 'breakthrough' ? 'spindle' : 'line', orderly: false, layers: 1,
        x: Math.round((south ? col : -col) * 380), z: south ? (on ? 360 : 900) : (on ? -360 : -900), y: 0, h: south ? Math.PI : 0,
        ...(SM_FAC[fac].game >= 2 ? { fac: SM_FAC[fac].game } : {}),
        ai: { tactic: tac, level: f.cmdr.lv }, reserve: !on, at: 1e9, th: f.retreat || 0 });
      m.career.map.push(f.id);
    });
  }
  return m;
}
// 每個模擬步：躍遷撤退（剩下的比例低於門檻 → 充能 10 秒後離場）、場上空出來就讓待命的艦隊進場
function smbTick(t) {
  const B = SMB; if (!B) return;
  const alive = (f) => f.sqs.reduce((a, q) => a + Math.max(0, q.alive), 0);
  for (let s = 0; s < 2; s++) {
    const mine = fleets.filter((f) => f.side === s && !f.supply && f.id < B.th.length);
    for (const f of mine) {
      if (f.reserve || B.gone.has(f.id)) continue;
      const n = alive(f), th = B.th[f.id] || 0;
      if (B.jump[f.id] == null && n > 0 && th > 0 && n / Math.max(1, f.initial) < th) { B.jump[f.id] = t + 10; if (s === GAME.playerSide || GAME.watch) toast(`${f.name} 開始躍遷充能（10 秒後撤離戰場）`); }
      if (B.jump[f.id] != null && t >= B.jump[f.id] && n > 0) {
        B.saved[f.id] = f.sqs.reduce((c, q) => c.map((x, k) => x + Math.max(0, q.typeAlive[k] || 0)), new Array(NT).fill(0));   // 躍遷當下的艦數（離場的分隊之後會被清掉）
        B.gone.add(f.id); f.reserve = true; f.activateAt = null; GAME.init[s] = Math.max(1, GAME.init[s] - f.initial);
        for (const q of f.sqs) { q.bg = true; q.hidden = true; if (q.group) q.group.inactive = true; }
      }
    }
    let n = mine.filter((f) => !f.reserve && !B.gone.has(f.id)).reduce((a, f) => a + alive(f), 0);
    const wait = mine.filter((f) => f.reserve && !B.gone.has(f.id) && f.activateAt != null && f.activateAt > t + 1);
    while (wait.length && (n < B.cap * 0.5 || n === 0)) { const f = wait.shift(); f.activateAt = t; n += f.initial; if (s === GAME.playerSide || GAME.watch) toast(`${f.name} 進入戰場`); }
  }
}
// 戰鬥結束：各艦隊剩下的艦數寫回星圖；還有敵人的話，剩下的用計算的
function smuBattleDone() {
  const S = SMU.S, B = SMB, m = SIM.m, R = GAME.result || { kind: 'end' };
  if (!S || !B) { setPhase('menu'); showStarmap(); return; }
  if (B.assault) return smuAssaultDone();
  const quit = R.kind === 'end' && B.how === 'cmd';   // 親自指揮時按了撤退：我方全部躍遷離開
  const res = { fleets: m.career.map.map((id, i) => {
    const f = fleets.find((o) => o.id === i), orig = m.fleets[i].comp, comp = orig.map(() => 0);
    if (B.saved[i]) B.saved[i].forEach((x, k) => { if (k < comp.length) comp[k] = x; });
    else if (f) for (const q of f.sqs) for (let k = 0; k < comp.length; k++) comp[k] += Math.max(0, q.typeAlive[k] || 0);
    return { id, comp: comp.map((x, k) => Math.min(orig[k], x)), gone: B.gone.has(i) || (quit && m.fleets[i].side === 0) };
  }) };
  const rep = smApplyReal(S, B.sys, B.fa, B.fb, res, B.how);
  S.live.reps.push(S.reports.indexOf(rep));
  if (smBattles(S).some((x) => x.sys === B.sys)) { const r2 = smResolve(S, B.sys, 'ai'); S.live.reps.push(S.reports.indexOf(r2)); }   // 還有交戰的（例如第三方）：用計算的
  const b = (S.pend || []).find((x) => x.sys === B.sys); if (b) b.done = true;
  SMB = null; smSave(S);
  smuNextLive();
}
function smuFinishTurn(mineReps) {
  const S = SMU.S, n0 = S.reports.length;
  smTurnEnd(S);
  // 自己陣營星系的戰鬥也列進戰報
  const rest = S.reports.slice(n0).filter((r) => S.sys[r.sys].owner === S.pl.fac || r.fights.some((F) => F.a === S.pl.fac || F.b === S.pl.fac));
  smSave(S); SMU.sel.clear(); smuRender();
  const all = [...mineReps, ...rest];
  if (all.length) smuReports(all, `第 ${S.turn - 1} 週的戰報`);
}
function smuReports(reps, title) {
  const S = SMU.S, nm = (fac) => `<span style="color:${SM_FAC[fac].col}">${SM_FAC[fac].name}</span>`;
  const comp = (c) => c.map((n, t) => (n ? `${smShipV()[t].name} ${smuShip(n)}` : '')).filter(Boolean).join('、') || '—';
  smuModal(`<h3>${title}</h3>${reps.length ? '' : '<p class="g-dim">還沒有戰報。</p>'}${reps.map((r) => r.fights.map((F) => {
    const res = F.win < 0 ? '雙方都離開了戰場' : `${nm(F.win ? F.b : F.a)} 獲勝`;
    return `<div class="sm-bt"><b>第 ${r.turn} 週・${smuEsc(r.name)}</b>：${nm(F.a)} 對 ${nm(F.b)}，${res}${F.assault ? `（強攻・地面砲台 ${F.tur ? F.tur[0] - F.tur[1] : 0}／${F.tur ? F.tur[0] : 0} 座被摧毀）` : ''}${F.real === 'cmd' ? '（親自指揮）' : F.real === 'watch' ? '（觀戰）' : F.pl ? '（我方參戰）' : ''}
      <table class="sm-t"><tr><th></th><th>${SM_FAC[F.a].name}</th><th>${SM_FAC[F.b].name}</th></tr>
      <tr><td>開戰</td><td>${smuShip(smShips(F.start[0]))}</td><td>${smuShip(smShips(F.start[1]))}</td></tr>
      ${F.waves.map((W, i) => `<tr><td>${W.real ? '實戰（開戰時' : `第 ${i + 1} 波（場上`} ${smuShip(W.n[0])}／${smuShip(W.n[1])}）${W.retreat[0].length + W.retreat[1].length ? `<br><span class="g-dim">撤退：${[...W.retreat[0], ...W.retreat[1]].map(smuEsc).join('、')}</span>` : ''}</td><td>−${smuShip(W.lost[0])}${W.win === 0 ? ' ✓' : ''}</td><td>−${smuShip(W.lost[1])}${W.win === 1 ? ' ✓' : ''}</td></tr>`).join('')}
      <tr><td>剩下</td><td>${smuShip(smShips(F.end[0]))}</td><td>${smuShip(smShips(F.end[1]))}</td></tr></table>
      <div class="g-dim" style="margin-top:4px">${SM_FAC[F.a].name}損失：${comp(F.lost[0])}<br>${SM_FAC[F.b].name}損失：${comp(F.lost[1])}
      ${F.win >= 0 ? `<br>戰場回收 ${smuN(F.salvage || 0)} 資金・修回 ${smuShip(F.repaired || 0)} 艘` : ''}</div></div>`;
  }).join('')).join('')}<div class="sm-btns"><button class="g-btn primary" id="sm-close">關閉</button></div>`);
  gEl('sm-close').onclick = smuCloseModal;
}
function smuModal(html) { smuCloseModal(); const d = document.createElement('div'); d.className = 'sm-modal'; d.id = 'sm-modal'; d.innerHTML = `<div class="sm-box">${html}</div>`; gEl('g-screen').appendChild(d); }
function smuCloseModal() { const d = gEl('sm-modal'); if (d) d.remove(); }
function smSummary() { const S = smLoad(); return S && S.v === 1 ? `第 ${S.turn} 週・資金 ${smuN(S.pl.money)}・艦隊 ${smPlFleets(S).length} 支` : '還沒開始'; }
// 測試用（tools/starmap-ui.mjs）：打包後的函式不是全域的，從這裡取
window.__sm = { get SMU() { return SMU; }, SM_RULE, get SMB() { return SMB; }, showStarmap, smuXY, smuEndTurn, smuRender, smNewGame, smSave, smTurnMove, smAutoTurn, smPlFleets, smShips };
