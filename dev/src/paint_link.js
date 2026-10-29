// ═════ 貼圖繪製（移植自 rubicon-protocol 的 rubicon_paint，網頁在 web/paint/）═════
// 這裡列出伺服器模型資料夾的模型；「繪製」開繪圖視窗（paint/index.html#lib），以 postMessage 傳 GLB：
//   繪圖視窗送 rp-ready（同名視窗已經開著時不會重新載入，所以這邊會一直送 rp-ping 問到它回答）
//   → 這邊送 rp-open { slot: 模型鍵, set, setName, slotName, name, buf }
//   →「存回遊戲」時繪圖視窗送 rp-save { id, slot, buf } → 這邊 PUT api/models/<鍵>/glb → 回 rp-saved { id, ok, msg }
// 伺服器把原檔備份到 models/_原始/ 再覆蓋，重算遠景網格；「還原原始」放回原檔。遊戲重新整理後才會用到新貼圖。
const PNT = { el: null, win: null, man: null, canEdit: null, pending: null, ping: 0, msg: '', busy: false };
const PNT_KIND = { hull: '船體', weapon: '武器', fighter: '艦載機', station: '太空站' };
const plEsc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function openPaintLink() {
  if (!PNT.el) {
    PNT.el = document.createElement('div'); PNT.el.id = 'paintlink'; document.body.appendChild(PNT.el);
    PNT.el.addEventListener('click', (e) => { if (e.target === PNT.el) closePaintLink(); });
  }
  PNT.el.hidden = false; PNT.msg = '讀取模型清單…'; renderPaintLink();
  await plRefresh();
}
function closePaintLink() { if (PNT.el) PNT.el.hidden = true; }
async function plRefresh() {
  try {
    const [man, ce] = await Promise.all([fetch('api/models', { cache: 'no-cache' }).then((r) => r.json()), API.get('api/models/can-edit').catch(() => ({ ok: false }))]);
    PNT.man = man.models || {}; PNT.canEdit = ce;
    PNT.msg = ce.ok ? '' : (ce.mode === 'off' ? '伺服器設定不允許存回模型（config.json 的 modelEdit）。仍然可以畫，用繪圖視窗的「匯出 GLB」存成檔案。' : '只有在伺服器那台電腦上玩才能存回模型（config.json 的 modelEdit 改成 "all" 就能從別台存）。仍然可以畫，用「匯出 GLB」存成檔案。');
  } catch (e) { PNT.msg = '讀不到模型清單：' + e.message; }
  renderPaintLink();
}
function renderPaintLink() {
  if (!PNT.el || PNT.el.hidden) return;
  const man = PNT.man || {}, order = Object.keys(PNT_KIND), rank = (k) => { const i = order.indexOf(man[k].kind); return i < 0 ? 9 : i; };
  const groups = STYLES.map(([p, n]) => [n, Object.keys(man).filter((k) => k[0] === p).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1))]).filter((g) => g[1].length);
  const row = (k) => { const m = man[k]; return `<div class="pl-row"><span class="pl-name">${plEsc(m.name || k)}${m.painted ? '<span class="pl-tag">已改</span>' : ''}<br><small class="g-dim">${k}・${PNT_KIND[m.kind] || m.kind}・${plEsc(m.file)}</small></span>
    <span class="g-row">${m.painted && PNT.canEdit && PNT.canEdit.ok ? `<button class="g-btn sm" data-plr="${k}">還原原始</button>` : ''}<button class="g-btn sm pri" data-plp="${k}">繪製</button></span></div>`; };
  PNT.el.innerHTML = `<div class="set-card pl-card"><div class="g-head" style="margin-bottom:10px"><h2>貼圖繪製</h2><span class="crumb">直接在 3D 模型上畫貼圖（移植自 Rubicon Paint）</span><span class="g-sp"></span><button class="g-btn" id="pl-close">完成</button></div>
    <p class="g-dim pl-note">選一個模型開啟繪圖視窗：筆刷、圖層、貼圖片、AO 烘焙，畫好按視窗上方的「存回遊戲」。存回後重新整理遊戲（其他玩家也是）才會看到新貼圖；2D 像素畫面用的是預先算好的圖，不會變。</p>
    ${PNT.msg ? `<p class="pl-msg">${plEsc(PNT.msg)}</p>` : ''}
    ${groups.map(([n, keys]) => `<div class="set-h">${n}</div>${keys.map(row).join('')}`).join('')}</div>`;
  const q = (s) => PNT.el.querySelector(s);
  q('#pl-close').onclick = closePaintLink;
  PNT.el.querySelectorAll('[data-plp]').forEach((b) => (b.onclick = () => plOpen(b.dataset.plp)));
  PNT.el.querySelectorAll('[data-plr]').forEach((b) => (b.onclick = () => plRestore(b.dataset.plr)));
}
async function plOpen(key) {
  const m = PNT.man && PNT.man[key]; if (!m) return;
  // 先開視窗（要在點擊當下開，否則會被擋），再下載 GLB
  if (!PNT.win || PNT.win.closed) PNT.win = window.open('paint/index.html#lib', 'star-paint');
  if (!PNT.win) { PNT.msg = '瀏覽器擋下了彈出視窗：請允許這個網站開新視窗後再按一次。'; renderPaintLink(); return; }
  PNT.win.focus();
  PNT.msg = `下載「${m.name}」…`; renderPaintLink();
  try {
    const r = await fetch(m.glb, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    PNT.pending = { t: 'rp-open', slot: key, set: 'server', setName: '伺服器模型', slotName: m.name || key, name: m.file.split(/[\\/]/).pop(), buf: await r.arrayBuffer() };
  } catch (e) { PNT.msg = '下載失敗：' + e.message; renderPaintLink(); return; }
  PNT.msg = `已在繪圖視窗開啟「${m.name}」。`; renderPaintLink();
  clearInterval(PNT.ping); let n = 0;
  PNT.ping = setInterval(() => { if (!PNT.pending || !PNT.win || PNT.win.closed || ++n > 60) { clearInterval(PNT.ping); return; } PNT.win.postMessage({ t: 'rp-ping' }, '*'); }, 300);
  PNT.win.postMessage({ t: 'rp-ping' }, '*');
}
async function plRestore(key) {
  const m = PNT.man[key]; if (!m || PNT.busy) return;
  if (!confirm(`把「${m.name}」換回原本的 GLB？畫過的貼圖會不見（繪圖視窗裡的圖層還留著）。`)) return;
  PNT.busy = true;
  try { await API.post(`api/models/${key}/restore`); PNT.msg = `已還原「${m.name}」。重新整理遊戲後套用。`; } catch (e) { PNT.msg = '還原失敗：' + e.message; }
  PNT.busy = false; await plRefresh();
}
async function plSave(d) {
  const reply = (ok, msg) => { if (PNT.win && !PNT.win.closed) PNT.win.postMessage({ t: 'rp-saved', id: d.id, ok, msg }, '*'); };
  if (!PNT.man || !PNT.man[d.slot] || !(d.buf instanceof ArrayBuffer)) return reply(false, '遊戲裡沒有這個模型');
  try {
    const r = await fetch(`api/models/${d.slot}/glb`, { method: 'PUT', headers: { ...API.headers(), 'Content-Type': 'model/gltf-binary' }, body: d.buf });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return reply(false, j.error || 'HTTP ' + r.status);
    PNT.man[d.slot] = j.model || PNT.man[d.slot];
    PNT.msg = `已存回「${PNT.man[d.slot].name}」。重新整理遊戲後套用。`; renderPaintLink();
    reply(true);
  } catch (e) { reply(false, e.message); }
}
addEventListener('message', (e) => {
  const d = e.data;
  if (!PNT.win || e.source !== PNT.win || !d || typeof d.t !== 'string') return;
  if (d.t === 'rp-ready' && PNT.pending) { const p = PNT.pending; PNT.pending = null; clearInterval(PNT.ping); PNT.win.postMessage(p, '*', [p.buf]); }
  else if (d.t === 'rp-save') plSave(d);
});
