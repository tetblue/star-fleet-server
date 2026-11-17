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
function cpView(s) {
  const S = CC.S, V = ccSee(S, s), live = V.live, mine = s.owner === S.fac, nz = cpNzRule(S, s), neu = s.owner === SM_N || nz;
  const R = cpInc(S, s), K = cpRazeK(S), btn = (attr, tx, why) => `<button class="g-btn" ${attr} ${why ? `disabled title="${smuEsc(why)}"` : ''}>${tx}</button>`;
  // 狀況
  const head = live ? `<dl class="sm-kv"><dt>擁有者</dt><dd>${SM_FAC[s.owner].name}・${SM_TIER[s.tier]}${s.tier < 4 ? `（人口到 ${Math.round(SM_TIER_CAP[s.tier] * 0.7)} 可以升級）` : ''}</dd>
      <dt>人口</dt><dd>${s.pop}／${cpPopCap(s)}</dd>
      <dt>繁榮（民心）</dt><dd>${ccBar(s.prosp / 100, s.prosp < CP_RULE.riot[0] ? '#ff6a5a' : s.prosp < 40 ? '#ffb35a' : '#5fd39a')}${s.prosp}${s.riot ? `・<b style="color:#ff7a6b">暴動中</b>（收入歸零、地面防禦 −1，回到 ${CP_RULE.riot[1]} 才平息）` : `・低於 ${CP_RULE.riot[0]} 會暴動`}</dd>
      <dt>地面防禦</dt><dd>${s.def}／${s.def0}（基礎 ${s.gd0}${s.bd.filter((b) => cpAct(b) && CP_B[b.k].gd).map((b) => `＋${CP_B[b.k].name} ${b.lv}`).join('')}${s.mob ? '＋戰時動員 1' : ''}${s.riot ? '−暴動 1' : ''}）</dd>
      ${s.mob ? `<dt>政策</dt><dd>戰時動員（前線）：地面防禦 +1、收入 ×${CP_RULE.mob.inc}、繁榮目標 −${CP_RULE.mob.prosp}</dd>` : ''}
      <dt>勢力的收入</dt><dd>每週 <b>${Math.round(R.g - R.up)}</b><br><span class="g-dim">人口×（0.4＋繁榮/100）×${CP_RULE.incK}＝${Math.round(R.base)}${R.b.map(([b, v]) => `・${CP_B[b.k].name} +${Math.round(v)}`).join('')}・維護 −${R.up}${s.sg ? '・圍城中＝0' : ''}${ccCut(S, s) ? '・補給切斷 ×0.5' : ''}</span></dd>
      ${cpNzRow(S, s, V)}${neu ? `<dt>中立好感度</dt><dd>${Math.round(ccFavOf(S, SM_N))}（${cpNeuTier(S)[3]}）：${nz ? '這裡有商會辦事處，照中立規則；' : ''}中立星系（含辦事處）你總共能蓋 ${cpPvCap(S, true)} 座、每個星系 ${cpNeuTier(S)[2]} 座</dd>` : ''}</dl>`
    : `<p class="g-dim">${V.age == null ? '沒有情報。' : `${V.age} 週前的情報；建築要看得到這個星系才知道。`}</p>`;
  // 勢力的建築
  const fac = live ? ['g', 'o'].map((at) => {
    const L = s.bd.filter((b) => CP_B[b.k].at === at), n = at === 'g' ? CP_SLOTS_G[s.tier] : cpSlotsO(s);
    return `<h4 style="margin:10px 0 4px">${at === 'g' ? '地表' : '軌道'}（${L.length}／${n} 格）</h4>` + (L.length ? L.map((b) => {
      const B = CP_B[b.k], why = cpUpWhy(S, s, b), q = s.bq.find((o) => o.bid === b.id);
      const st = b.tk ? cpTkTx(S, b) : q ? `<span style="color:#c9a7ff">強化到 Lv${q.lv}：剩 ${q.left} 週</span>` : '';
      const act = b.tk ? (b.inv ? btn(`data-raze="${b.id}"`, b.raze ? '取消破壞' : `破壞（拿回 ${Math.round(b.inv * K)}）`, '') : '')
        : mine && b.lv < 3 && !q ? btn(`data-up="${b.id}"`, `強化到 Lv${b.lv + 1}（${cpUpCost(b)} 資金・${CP_RULE.upW[b.lv + 1]} 週）`, why) : '';
      return `<div class="cc-ship cc-yq" style="grid-template-columns:1fr auto"><span><b>${B.name}</b> <span class="cc-lv${b.lv > 1 ? ' up' : ''}">Lv${b.lv}</span>${b.inv ? ' <span style="color:#3fdf8f">你出資</span>' : ''} ${st}<br><span class="g-dim">${B.desc}${b.lv < 3 && mine ? `・強化：勢力 ${B.fac}；你 ${B.perk}` : b.lv >= 2 && b.inv ? `・你得到：${B.perk}` : ''}</span></span>${act}</div>`;
    }).join('') : '<div class="g-dim">沒有。</div>');
  }).join('') : '';
  const bq = live && s.bq.length ? `<h4 style="margin:10px 0 4px">建設佇列（${SM_FAC[s.owner].name}）</h4>${s.bq.map((o, i) => `<div class="g-dim">${i ? `${i + 1}.` : '施工中'} ${o.bid ? `強化${cpName(o.k)}到 Lv${o.lv}${o.pay ? '（你出資）' : ''}` : cpName(o.k)}・剩 ${o.left} 週${i === 0 && s.sg ? '（圍城中暫停）' : ''}</div>`).join('')}` : '';
  // 你的建築
  const canPv = mine || neu;
  const pvRows = (s.pv || []).map((p) => {
    const P = CP_PV[p.k], st = p.tk ? cpTkTx(S, p) : p.off ? '<span style="color:#ffb35a">停止運作（中立好感度不夠）</span>' : '';
    const act = p.tk ? btn(`data-praze="${p.id}"`, p.raze ? '取消破壞' : `破壞（拿回 ${Math.round(p.cost * K)}）`, '') : btn(`data-pdel="${p.id}"`, `拆除（退 ${Math.round(p.cost * 0.25)}）`, '');
    return `<div class="cc-ship cc-yq" style="grid-template-columns:1fr auto"><span><b>${P.name}</b> <span class="g-dim">${P.at === 'g' ? '地表' : '軌道'}</span> ${st}<br><span class="g-dim">${P.desc}・每週維護 ${P.up}</span></span>${act}</div>`;
  }).join('') + (s.pq || []).map((o) => `<div class="g-dim">建設中：${CP_PV[o.k].name}・剩 ${o.left} 週</div>`).join('');
  const build = canPv ? smuActs(CP_PV_ORDER.filter((k) => !(CP_PV[k].neu && !neu)).map((k) => { const P = CP_PV[k], why = cpPvWhy(S, s, k); return { id: 'cp-b-' + k, name: `蓋${P.name}（${P.at === 'g' ? '地表' : '軌道'}）`, desc: why || `${P.cost} 資金・${P.w} 週・每週維護 ${P.up}・${P.desc}`, off: !!why }; }), 150) : '';
  const cap = `己方星系 ${cpPvCount(S, false)}／${cpPvCap(S, false)} 座（${ccRankOf(S).name}，據點的不算）・中立星系 ${cpPvCount(S, true)}／${cpPvCap(S, true)} 座（中立好感度 ${Math.round(ccFavOf(S, SM_N))}：${cpNeuTier(S)[3]}）`;
  const inc = S.pl.inc ? `<div class="g-dim" style="font-size:12px">上週你的收入：薪餉 ${S.pl.inc.sal}・分紅 ${S.pl.inc.div}・你的建築 ${S.pl.inc.pv}（已繳稅 ${S.pl.inc.tax}）・維護 −${S.pl.inc.up}${S.pl.inc.rp ? `・研究點數 +${S.pl.inc.rp}` : ''}</div>` : '';
  smuModal(`<h3>${s.name} 的星球</h3>
    <div class="g-dim" style="font-size:12px">基礎建設是${neu ? '中立勢力' : '勢力的上級'}的事；你可以出錢強化你的陣營的建築（好處一半給勢力、一半給你），或在你的區塊蓋自己的建築。星系失守時建築先「接管中」，接管完成前你可以破壞，拿回出的錢的 ${Math.round(K * 100)}%（研發「焦土協定」提高）；接管完成前奪回＝原樣還你。資金 ${S.pl.money}</div>
    ${inc}${head}${fac}${bq}
    ${canPv || (s.pv || []).length ? `<h4 style="margin:12px 0 4px">你的建築</h4><div class="g-dim" style="font-size:12px">${cap}</div>${pvRows || '<div class="g-dim">還沒有。</div>'}${build}` : ''}
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`);
  const re = (err) => { if (err) { toast(err, 'warn'); return; } ccSave(S); ccRender(); cpView(s); };
  gEl('cc-close').onclick = () => { smuCloseModal(); ccRender(); };
  document.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => re(cpUp(S, s, s.bd.find((x) => x.id === +b.dataset.up)))));
  document.querySelectorAll('[data-raze]').forEach((b) => (b.onclick = () => { const x = s.bd.find((y) => y.id === +b.dataset.raze); re(cpRaze(S, s, x.id, false, x.raze)); }));
  document.querySelectorAll('[data-praze]').forEach((b) => (b.onclick = () => { const x = s.pv.find((y) => y.id === +b.dataset.praze); re(cpRaze(S, s, x.id, true, x.raze)); }));
  document.querySelectorAll('[data-pdel]').forEach((b) => (b.onclick = () => re(cpPvDemolish(S, s, +b.dataset.pdel))));
  for (const k of CP_PV_ORDER) { const b = gEl('cp-b-' + k); if (b) b.onclick = () => re(cpPvBuild(S, s, k)); }
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
