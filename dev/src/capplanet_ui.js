// ═══════════════════════ 艦長生涯：星球的畫面（capplanet.js） ═══════════════════════
// 星系卡片的「星球：建設、投資」→ cpView：星球的狀況、收入的每一項、勢力的建築（強化、破壞）、你的建築（蓋、拆、破壞）
function cpSum(S, s) {   // 星系卡片上的一行
  if (!s.bd) return '';
  return `人口 ${s.pop}／${cpPopCap(s)}・繁榮 ${s.prosp}${s.riot ? '・<b style="color:#ff7a6b">暴動</b>' : ''}${s.mob ? '・戰時動員' : ''}`;
}
function cpMineSum(S, s) {   // 你在這裡的投資
  const a = [];
  const up = (s.bd || []).filter((b) => b.inv), pv = s.pv || [];
  if (up.length) a.push(`強化 ${up.map((b) => `${CP_B[b.k].name} Lv${b.lv}`).join('、')}`);
  if (pv.length) a.push(`你的 ${pv.map((p) => CP_PV[p.k].name).join('、')}`);
  if ((s.pq || []).length) a.push(`建設中 ${CP_PV[s.pq[0].k].name}`);
  if ([...(s.bd || []), ...pv].some((b) => b.tk)) a.push('<b style="color:#ffb35a">接管中</b>');
  return a.join('・');
}
const cpTkTx = (S, b) => `<span style="color:#ffb35a">接管中：${SM_FAC[b.tk.f].name}再 ${b.tk.left} 週接管${b.raze ? '・<b>這週結束時破壞</b>' : ''}</span>`;
// ───── 星球的圖像化（使用者 2026-11-21：像研發一樣的表現方式，數據用圖表讓玩家快速理解）─────
// 狀況＝四張小圖（人口條、繁榮量表、收入的分段長條、地面防禦格子）；建築＝每格一個圖示（空格虛線），點了浮出說明與按鈕
const CP_ICO = {
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>', ind: '<path d="M3 20V10l5 3V10l5 3V6h3l1 14z"/><path d="M17 6V3"/>',
  port: '<path d="M3 17h18l-2 4H5z"/><path d="M7 17V9h6v8M10 9V5h4"/>', gar: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
  aa: '<path d="M5 20h14M8 20l2-6h4l2 6M12 14l5-9M14 9l3 1"/>', lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/>',
  intel: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', yard: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
  depot: '<rect x="4" y="8" width="16" height="12"/><path d="M4 8l3-4h10l3 4M12 12v5M9.5 14.5h5"/>', orb: '<circle cx="12" cy="12" r="5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  plat: '<path d="M4 15h16l-3 4H7zM12 15V8M8 8h8"/>', hangar: '<path d="M3 19h18M5 19V11a7 7 0 0114 0v8"/><path d="M9 15l3-2 3 2"/>',
  plab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><circle cx="12" cy="16" r="1.5"/>', shop: '<path d="M4 8h16l-1.5 12h-13z"/><path d="M8.5 8V6a3.5 3.5 0 017 0v2"/>',
  crew: '<circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6M14 14c3 0 6 2 6 5"/>', safe: '<rect x="4" y="5" width="16" height="15"/><circle cx="12" cy="12" r="3"/><path d="M12 9v1M15 12h-1"/>',
  pdock: '<path d="M3 8h18M3 16h18M6 5v6M10 5v6M6 13v6M10 13v6M14 6.5l4 1.5-4 1.5z"/>', store: '<rect x="4" y="9" width="16" height="11"/><path d="M4 9l8-5 8 5M9 20v-6h6v6"/>',
  listen: '<path d="M12 20v-8M8 20h8"/><path d="M8 8a5.5 5.5 0 018 0M5 5a10 10 0 0114 0"/><circle cx="12" cy="11" r="1.5"/>',
};
const cpIco = (k) => `<svg viewBox="0 0 24 24">${CP_ICO[k] || '<circle cx="12" cy="12" r="6"/>'}</svg>`;
const CPV_CSS = `
.ccm-sheet .cpv-ch{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:4px 0 8px}
.ccm-sheet .cpv-ch > div{padding:9px 12px 10px;background:rgba(12,20,42,.75);border-top:2px solid var(--c,var(--cyan))}
.ccm-sheet .cpv-ch .h{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--dim)}
.ccm-sheet .cpv-ch .h b{font:700 22px var(--en);color:#fff}.ccm-sheet .cpv-ch .h b small{font-size:13px;color:var(--dim);margin-left:2px}
.cpv-bar{position:relative;height:12px;margin-top:7px;background:rgba(255,255,255,.08);display:flex;overflow:visible}
.cpv-bar > i{display:block;height:100%}
.cpv-bar > u{position:absolute;top:-4px;bottom:-4px;width:2px;background:#fff;opacity:.75}
.cpv-bar > u::after{content:attr(data-l);position:absolute;top:16px;left:-30px;width:60px;text-align:center;font:500 10px var(--jp);color:var(--dim);white-space:nowrap}
.cpv-leg{display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:16px;font-size:11.5px;color:var(--dim)}.cpv-leg i{display:inline-block;width:8px;height:8px;margin-right:4px;background:var(--c)}
.cpv-pips{display:flex;gap:4px;margin-top:8px}.cpv-pips i{flex:1;height:12px;background:rgba(255,255,255,.1);transform:skewX(-14deg)}.cpv-pips i.on{background:var(--c)}.cpv-pips i.lost{background:none;border:1px dashed #ff6a5a}
.cpv-area{position:relative;margin:4px 0 6px}
.cpv-grid{display:flex;flex-wrap:wrap;gap:8px}
.cpv-t{position:relative;width:70px;height:78px;padding:0;cursor:pointer;color:#fff;background:var(--c,#5d6f92);clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);transition:transform .12s;border:0}
.cpv-t > div{position:absolute;inset:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:rgb(10,16,34);clip-path:inherit}
.cpv-t svg{width:28px;height:28px;fill:none;stroke:var(--c);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.cpv-t span{font:700 11.5px var(--jp);white-space:nowrap;max-width:64px;overflow:hidden;text-overflow:ellipsis}
.cpv-t .ccv-pips i{width:10px;height:6px}
.cpv-t:hover{transform:scale(1.06)}.cpv-t.sel{background:#fff;transform:scale(1.08)}
.cpv-t.empty{background:none;border:1px dashed rgba(150,190,240,.3);cursor:default;clip-path:none}.cpv-t.empty > div{background:none}.cpv-t.empty span{color:var(--mute);font-weight:500}
.cpv-t.tk{animation:cpvTk 1s ease-in-out infinite}@keyframes cpvTk{50%{background:#ffb35a}}
.cpv-t.q > div{background:rgba(52,30,96,.95)}.cpv-t.mine > div{background:rgba(20,60,44,.95)}
.cpv-t.new{opacity:.85}.cpv-t.new:disabled{opacity:.35;cursor:pointer}
.cpv-t b.tag{position:absolute;right:4px;top:3px;font:700 9.5px var(--jp);color:var(--c);z-index:1}
.cpv-det{position:absolute;z-index:3;width:300px;box-sizing:border-box;padding:12px 14px;background:rgba(8,14,32,.97);border:1px solid var(--line2);border-top:3px solid var(--c);box-shadow:0 10px 30px rgba(0,0,0,.6);display:flex;flex-direction:column;gap:7px;animation:ccvIn .16s ease-out}
.cpv-det .hd{display:flex;gap:10px;align-items:center}.cpv-det .hd svg{width:32px;height:32px;fill:none;stroke:var(--c);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.cpv-det h5{margin:0;font:900 17px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#fff}.cpv-det .lab{font:700 12.5px var(--jp);color:var(--c)}
.cpv-det .d{font-size:13px;color:#cfd8e3;line-height:1.55}
.cpv-det .lv{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:12.5px;color:var(--dim)}.cpv-det .lv b{color:#fff;font-weight:700}
.cpv-det .x{position:absolute;right:8px;top:6px;border:0;background:none;color:var(--dim);font-size:16px;cursor:pointer}
.cpv-det .acts{display:flex;flex-wrap:wrap;gap:6px}
`;
function cpvCss() { ccvCss(); if (!gEl('cpv-css')) { const st = document.createElement('style'); st.id = 'cpv-css'; st.textContent = CPV_CSS; document.head.appendChild(st); } }
// 狀況的四張圖
function cpvCharts(S, s, R) {
  const cap = cpPopCap(s), up = Math.round(SM_TIER_CAP[s.tier] * 0.7), [r0, r1] = CP_RULE.riot, pc = s.prosp < r0 ? 'var(--red)' : s.prosp < 40 ? '#ffb35a' : 'var(--own)';
  const pct = (v, m) => Math.max(0, Math.min(100, (v / (m || 1)) * 100));
  const pop = `<div style="--c:var(--cyan)" title="人口上限：等級 ${SM_TIER_CAP[s.tier]}＋住宅區"><div class="h"><span>人口</span><b>${s.pop}<small>／${cap}</small></b></div>
    <div class="cpv-bar"><i style="width:${pct(s.pop, cap)}%;background:var(--cyan)"></i>${s.tier < 4 ? `<u style="left:${pct(up, cap)}%" data-l="升級 ${up}"></u>` : ''}</div></div>`;
  const pros = `<div style="--c:${pc}" title="繁榮低於 ${r0} 暴動，回到 ${r1} 才平息"><div class="h"><span>繁榮（民心）${s.riot ? '・<b style="font-size:13px;color:var(--red)">暴動中</b>' : ''}</span><b style="color:${pc}">${s.prosp}</b></div>
    <div class="cpv-bar" style="background:linear-gradient(90deg,rgba(255,77,94,.35) ${r0}%,rgba(255,179,90,.25) ${r0}% 40%,rgba(63,223,143,.2) 40%)"><i style="width:${s.prosp}%;background:${pc}"></i><u style="left:${r0}%" data-l="暴動 ${r0}"></u></div></div>`;
  const tot = Math.max(1, R.g), segs = [['基本', R.base, '#3cc8ff'], ...R.b.map(([b, v]) => [CP_B[b.k].name, v, b.k === 'ind' ? '#ffc24a' : '#a97bff'])];
  const inc = `<div style="--c:var(--gold)"><div class="h"><span>勢力的收入／週</span><b>${Math.round(R.g - R.up)}</b></div>
    <div class="cpv-bar">${segs.map(([n, v, c]) => `<i title="${n} +${Math.round(v)}" style="width:${pct(v, tot + R.up)}%;background:${c}"></i>`).join('')}<i title="維護 −${R.up}" style="width:${pct(R.up, tot + R.up)}%;background:repeating-linear-gradient(135deg,#ff4d5e 0 4px,transparent 4px 7px)"></i></div>
    <div class="cpv-leg">${segs.map(([n, v, c]) => `<span style="--c:${c}"><i></i>${n} +${Math.round(v)}</span>`).join('')}<span style="--c:#ff4d5e"><i></i>維護 −${R.up}</span>${s.sg ? '<span style="color:var(--red)">圍城中＝0</span>' : ''}</div></div>`;
  const dn = Math.max(s.def0, s.def), def = `<div style="--c:#5aa8ff" title="基礎 ${s.gd0}${s.bd.filter((b) => cpAct(b) && CP_B[b.k].gd).map((b) => `＋${CP_B[b.k].name} ${b.lv}`).join('')}${s.mob ? '＋戰時動員 1' : ''}${s.riot ? '−暴動 1' : ''}"><div class="h"><span>地面防禦</span><b>${s.def}<small>／${s.def0}</small></b></div>
    <div class="cpv-pips">${Array.from({ length: dn }, (_, i) => `<i class="${i < s.def ? 'on' : i < s.def0 ? 'lost' : ''}"></i>`).join('')}</div></div>`;
  return `<div class="cpv-ch">${pop}${pros}${inc}${def}</div>`;
}
// 一格建築
function cpvTile(key, k, nm, cls, c, lv, tag) {
  return `<button type="button" class="cpv-t ${cls}" data-pt="${key}" style="--c:${c}"><div>${cpIco(k)}<span>${nm}</span>${lv != null ? ccvPips(3, lv, c) : ''}</div>${tag ? `<b class="tag">${tag}</b>` : ''}</button>`;
}
// 點了格子：浮出說明（照研發樹的作法放在格子旁邊）
function cpvPlace() {
  const d = document.querySelector('.cpv-det'); if (!d) return;
  const area = d.parentElement, t = area.querySelector('.cpv-t.sel'); if (!t) return;
  const x = t.offsetLeft, y = t.offsetTop, W = area.clientWidth, dw = d.offsetWidth;
  d.style.left = (x + t.offsetWidth + 12 + dw <= W ? x + t.offsetWidth + 12 : Math.max(0, x - 12 - dw)) + 'px'; d.style.top = Math.max(-10, y - 10) + 'px';
  d.scrollIntoView({ block: 'nearest' });
}
function cpView(s) {
  cpvCss();
  const S = CC.S, V = ccSee(S, s), live = V.live, mine = s.owner === S.fac, nz = cpNzRule(S, s), neu = s.owner === SM_N || nz;
  const R = cpInc(S, s), K = cpRazeK(S), btn = (attr, tx, why, pri) => `<button class="g-btn${pri && !why ? ' primary' : ''}" ${attr} ${why ? `disabled title="${smuEsc(why)}"` : ''}>${why && pri ? smuEsc(why) : tx}</button>`;
  if (CC.psel && CC.psel.sys !== s.id) CC.psel = null;
  const sel = CC.psel ? CC.psel.k : null, fc = live ? ccFacCol(S, s.owner) : 'var(--mute)';
  // 狀況：四張圖＋幾行文字
  const head = live ? `${cpvCharts(S, s, R)}<dl class="sm-kv"><dt>擁有者</dt><dd>${SM_FAC[s.owner].name}・${SM_TIER[s.tier]}${s.tier < 4 ? `（人口到 ${Math.round(SM_TIER_CAP[s.tier] * 0.7)} 可以升級）` : ''}</dd>
      ${s.mob ? `<dt>政策</dt><dd>戰時動員（前線）：地面防禦 +1、收入 ×${CP_RULE.mob.inc}、繁榮目標 −${CP_RULE.mob.prosp}</dd>` : ''}
      ${cpNzRow(S, s, V)}${neu ? `<dt>中立好感度</dt><dd>${Math.round(ccFavOf(S, SM_N))}（${cpNeuTier(S)[3]}）：${nz ? '這裡有商會辦事處，照中立規則；' : ''}中立星系（含辦事處）你總共能蓋 ${cpPvCap(S, true)} 座、每個星系 ${cpNeuTier(S)[2]} 座</dd>` : ''}</dl>`
    : `<p class="g-dim">${V.age == null ? '沒有情報。' : `${V.age} 週前的情報；建築要看得到這個星系才知道。`}</p>`;
  // 說明（點了格子才有）
  const det = (key) => {
    if (sel !== key) return '';
    const [kd, id] = key.split(':');
    if (kd === 'b') {
      const b = s.bd.find((x) => x.id === +id); if (!b) return '';
      const B = CP_B[b.k], why = cpUpWhy(S, s, b), q = s.bq.find((o) => o.bid === b.id), st = b.tk ? '接管中' : q ? `強化到 Lv${q.lv}・剩 ${q.left} 週` : b.inv ? '你出資強化' : `${SM_FAC[s.owner].name}的建築`;
      const acts = b.tk ? (b.inv ? btn(`data-raze="${b.id}"`, b.raze ? '取消破壞' : `破壞（拿回 ${Math.round(b.inv * K)}）`, '') : '') : mine && b.lv < 3 && !q ? btn(`data-up="${b.id}"`, `強化到 Lv${b.lv + 1}（${cpUpCost(b)} 資金・${CP_RULE.upW[b.lv + 1]} 週）`, why, true) : '';
      return `<div class="cpv-det" style="--c:${b.inv ? 'var(--own)' : fc}"><button type="button" class="x" data-pt="${key}">✕</button><div class="hd">${cpIco(b.k)}<div><h5>${B.name} Lv${b.lv}</h5><div class="lab">${st}</div></div></div>
        <div class="d">${B.desc}</div>${b.tk ? `<div class="d">${cpTkTx(S, b)}</div>` : ''}
        <div class="lv"><span>Lv</span>${ccvPips(3, b.lv, b.inv ? 'var(--own)' : fc, q ? q.lv : 0)}<span>強化：勢力</span><b>${B.fac}</b><span>強化：你</span><b>${B.perk}</b></div>
        ${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
    }
    if (kd === 'p') {
      const p = (s.pv || []).find((x) => x.id === +id); if (!p) return '';
      const P = CP_PV[p.k], st = p.tk ? '接管中' : p.off ? '停止運作（中立好感度不夠）' : '運作中';
      const act = p.tk ? btn(`data-praze="${p.id}"`, p.raze ? '取消破壞' : `破壞（拿回 ${Math.round(p.cost * K)}）`, '') : btn(`data-pdel="${p.id}"`, `拆除（退 ${Math.round(p.cost * 0.25)}）`, '');
      return `<div class="cpv-det" style="--c:var(--own)"><button type="button" class="x" data-pt="${key}">✕</button><div class="hd">${cpIco(p.k)}<div><h5>${P.name}</h5><div class="lab">你的建築・${st}</div></div></div>
        <div class="d">${P.desc}</div>${p.tk ? `<div class="d">${cpTkTx(S, p)}</div>` : ''}<div class="lv"><span>${P.at === 'g' ? '地表' : '軌道'}</span><b>每週維護 ${P.up}</b></div><div class="acts">${act}</div></div>`;
    }
    if (kd === 'n') {
      const P = CP_PV[id], why = cpPvWhy(S, s, id);
      return `<div class="cpv-det" style="--c:${why ? 'var(--mute)' : 'var(--cyan)'}"><button type="button" class="x" data-pt="${key}">✕</button><div class="hd">${cpIco(id)}<div><h5>蓋${P.name}</h5><div class="lab">${why ? '還不能蓋' : '可以蓋'}</div></div></div>
        <div class="d">${P.desc}</div><div class="lv"><span>${P.at === 'g' ? '地表' : '軌道'}</span><b>${P.cost} 資金・${P.w} 週・每週維護 ${P.up}</b></div>
        <div class="acts">${btn(`data-pb="${id}"`, `蓋${P.name}（${P.cost} 資金）`, why, true)}</div></div>`;
    }
    return '';
  };
  const area = (title, keys, tiles) => `<h4 style="margin:12px 0 6px">${title}</h4><div class="cpv-area"><div class="cpv-grid">${tiles}</div>${keys.map(det).join('')}</div>`;
  // 勢力的建築：每格一個圖示，空格虛線
  const fac = live ? ['g', 'o'].map((at) => {
    const L = s.bd.filter((b) => CP_B[b.k].at === at), n = at === 'g' ? CP_SLOTS_G[s.tier] : cpSlotsO(s);
    const tiles = L.map((b) => { const q = s.bq.find((o) => o.bid === b.id), c = b.inv ? 'var(--own)' : fc;
      return cpvTile(`b:${b.id}`, b.k, CP_B[b.k].name, `${sel === `b:${b.id}` ? 'sel ' : ''}${b.tk ? 'tk ' : ''}${q ? 'q ' : ''}${b.inv ? 'mine' : ''}`, c, b.lv, q ? `→Lv${q.lv}` : b.tk ? '接管' : b.inv ? '出資' : ''); }).join('')
      + Array.from({ length: Math.max(0, n - L.length) }, () => `<div class="cpv-t empty"><div><span>空地</span></div></div>`).join('');
    return area(`${at === 'g' ? '地表' : '軌道'}（${L.length}／${n} 格）`, L.map((b) => `b:${b.id}`), tiles);
  }).join('') : '';
  const bq = live && s.bq.length ? `<div class="g-dim" style="font-size:12px;margin-top:4px">建設佇列（${SM_FAC[s.owner].name}）：${s.bq.map((o, i) => `${i ? `${i + 1}.` : '施工中'} ${o.bid ? `強化${cpName(o.k)}到 Lv${o.lv}${o.pay ? '（你出資）' : ''}` : cpName(o.k)}・剩 ${o.left} 週${i === 0 && s.sg ? '（圍城中暫停）' : ''}`).join('　')}</div>` : '';
  // 你的建築＋可以蓋的
  const canPv = mine || neu;
  const pvTiles = (s.pv || []).map((p) => cpvTile(`p:${p.id}`, p.k, CP_PV[p.k].name, `mine ${sel === `p:${p.id}` ? 'sel ' : ''}${p.tk ? 'tk' : ''}`, 'var(--own)', null, p.tk ? '接管' : p.off ? '停用' : '')).join('')
    + (s.pq || []).map((o) => `<div class="cpv-t q" style="--c:var(--violet)"><div>${cpIco(o.k)}<span>${CP_PV[o.k].name}</span></div><b class="tag">剩${o.left}週</b></div>`).join('');
  const nb = canPv ? CP_PV_ORDER.filter((k) => !(CP_PV[k].neu && !neu)) : [];
  const newTiles = nb.map((k) => { const why = cpPvWhy(S, s, k); return cpvTile(`n:${k}`, k, CP_PV[k].name, `new ${sel === `n:${k}` ? 'sel ' : ''}`, why ? 'var(--mute)' : 'var(--cyan)', null, why ? '' : `${CP_PV[k].cost}`); }).join('');
  const cap = `己方星系 ${cpPvCount(S, false)}／${cpPvCap(S, false)} 座（${ccRankOf(S).name}，據點的不算）・中立星系 ${cpPvCount(S, true)}／${cpPvCap(S, true)} 座（中立好感度 ${Math.round(ccFavOf(S, SM_N))}：${cpNeuTier(S)[3]}）`;
  const inc = S.pl.inc ? `<div class="g-dim" style="font-size:12px">上週你的收入：薪餉 ${S.pl.inc.sal}・分紅 ${S.pl.inc.div}・你的建築 ${S.pl.inc.pv}（已繳稅 ${S.pl.inc.tax}）・維護 −${S.pl.inc.up}${S.pl.inc.rp ? `・研究點數 +${S.pl.inc.rp}` : ''}</div>` : '';
  const pvSec = canPv || (s.pv || []).length ? `${area('你的建築', (s.pv || []).map((p) => `p:${p.id}`), pvTiles || '<div class="g-dim">還沒有。</div>')}<div class="g-dim" style="font-size:12px">${cap}</div>${nb.length ? area('可以蓋的（點了看條件）', nb.map((k) => `n:${k}`), newTiles) : ''}` : '';
  ccmSheet(`<h3>${s.name} 的星球<span class="en">PLANET ・ ${live ? SM_FAC[s.owner].name : 'NO INTEL'}</span></h3>
    ${s.riot && live ? '<div class="ccs-warn">暴動中：收入歸零、地面防禦 −1</div>' : ''}
    ${head}${inc}${fac}${bq}${pvSec}
    <div class="ccs-note">基礎建設是${neu ? '中立勢力' : '勢力的上級'}的事；你可以出錢強化你的陣營的建築（好處一半給勢力、一半給你），或在你的區塊蓋自己的建築。星系失守時建築先「接管中」，接管完成前你可以破壞，拿回出的錢的 ${Math.round(K * 100)}%（研發「焦土協定」提高）；接管完成前奪回＝原樣還你。</div>
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`, '', fc);
  const keep = () => { const b = document.querySelector('.ccm-sheet'), y = b ? b.scrollTop : 0; cpView(s); const b2 = document.querySelector('.ccm-sheet'); if (b2) b2.scrollTop = y; cpvPlace(); };
  const re = (err) => { if (err) { toast(err, 'warn'); return; } ccSave(S); ccRender(); keep(); };
  gEl('cc-close').onclick = () => { CC.psel = null; smuCloseModal(); ccRender(); };
  document.querySelectorAll('.ccm-sheet [data-pt]').forEach((b) => (b.onclick = () => { const k = b.dataset.pt; CC.psel = CC.psel && CC.psel.k === k ? null : { sys: s.id, k }; keep(); }));
  document.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => re(cpUp(S, s, s.bd.find((x) => x.id === +b.dataset.up)))));
  document.querySelectorAll('[data-raze]').forEach((b) => (b.onclick = () => { const x = s.bd.find((y) => y.id === +b.dataset.raze); re(cpRaze(S, s, x.id, false, x.raze)); }));
  document.querySelectorAll('[data-praze]').forEach((b) => (b.onclick = () => { const x = s.pv.find((y) => y.id === +b.dataset.praze); re(cpRaze(S, s, x.id, true, x.raze)); }));
  document.querySelectorAll('[data-pdel]').forEach((b) => (b.onclick = () => { CC.psel = null; re(cpPvDemolish(S, s, +b.dataset.pdel)); }));
  document.querySelectorAll('[data-pb]').forEach((b) => (b.onclick = () => { CC.psel = null; re(cpPvBuild(S, s, b.dataset.pb)); }));
  cpvPlace();
}
Object.assign(window.__cap || (window.__cap = {}), { cpView, cpUp, cpPvBuild, cpRaze, cpWeek, CP_B, CP_PV, CP_RULE });
// 太空場景（巡航、迎擊戰）要放的：你在這裡的軌道建築（私人船台＝船塢、倉庫＝補給站、監聽站＝浮標），強化過的船塢、補給站標綠燈
const CP_PV_CU = { pdock: 'yard', store: 'depot', listen: 'buoy' };   // 監聽站用浮標（中繼站會被當成通訊塔）
function cpScene(S, s, here) {
  if (!here || !s.bd) return {};
  const mine = s.owner === S.fac;
  return { pv: (s.pv || []).filter((p) => cpAct(p) && CP_PV_CU[p.k]).map((p) => ({ cu: CP_PV_CU[p.k] })),
    markYard: mine && s.bd.some((b) => b.k === 'yard' && b.inv && cpAct(b)), markDepot: mine && s.bd.some((b) => b.k === 'depot' && b.inv && cpAct(b)) };
}

// 星圖：星際商會的標記（中立的亮黃色）：◇＝有據點、◆＝有商船隊（同時有就畫實心）
function cpNzIco(g, x, y, nu, nz) {
  g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
  g.strokeStyle = '#ffd23f'; g.lineWidth = 1.6; g.fillStyle = nu ? '#ffd23f' : 'rgba(255,210,63,0.12)';
  g.fillRect(-4, -4, 8, 8); g.strokeRect(-4, -4, 8, 8); g.restore();
  if (nu > 1) { g.fillStyle = '#ffd23f'; g.font = 'bold 10px sans-serif'; g.textAlign = 'right'; g.fillText(String(nu), x - 7, y + 4); g.textAlign = 'center'; }
}
// 星系卡片的一列：商會的據點、商船隊（中立好感度 30 以上，而且看得到這個星系或好感度 50 以上）
function cpNzRow(S, s, V) {
  const nu = cpNuAt(S, s.id);
  if ((!s.nz && !nu.length) || !cpNzOk(S) || (!V.live && !cpNzShow(S))) return '';
  const b = s.nz ? s.nz.b.map((k) => CP_NZ[k].name) : [];
  return `<dt>星際商會</dt><dd style="color:#ffd23f">${[...b, ...nu.map((u) => u.name)].join('、')}${V.live && cpNzRule(S, s) ? '<div class="g-dim" style="font-size:11px">辦事處：可以照中立規則蓋你的建築</div>' : ''}${V.live && cpNzDock(S, s) ? '<div class="g-dim" style="font-size:11px">維修站：可以修理、補飛彈（×' + CP_RULE.dockK + '）</div>' : ''}</dd>`;
}
