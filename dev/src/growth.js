// ───── 艦長與飛行員的成長（不是數值，而是經歷）─────
// 艦長：每艘特製戰艦有三名有名有姓的軍官，會記得出過的任務；戰艦沉了，船員可能陣亡（刻在紀念牆上），由新人補上；
//       受重創回來的戰艦留下戰痕。飛行員：呼號、稱號、擊墜標記、個人紀錄與最近的出擊。
// 存在 STORE 的 fleet.growth（和艦長、飛行員各自的存檔分開）。
const GR_STORE = 'fleet.growth';
const GR_ROLES = ['副艦長', '砲術長', '輪機長'];
const GR_FAMILY = ['林', '陳', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭', '洪', '曾', '邱', '廖', '賴', '周'];
const GR_GIVEN = ['子安', '承恩', '冠廷', '雅婷', '思妤', '柏翰', '宜蓁', '彥廷', '詠晴', '宗翰', '佳穎', '俊宏', '欣怡', '家豪', '品妍', '志明', '靜宜', '育誠', '韋辰', '心悅'];
const GR_TITLES = {
  ace1: { name: '單場王牌', desc: '一次出擊擊墜 5 架以上', ok: (G, s) => s.kf >= 5 },
  ace: { name: '王牌', desc: '累計擊墜 25 架', ok: (G, s, p) => p.kf >= 25 },
  legend: { name: '傳奇王牌', desc: '累計擊墜 100 架', ok: (G, s, p) => p.kf >= 100 },
  hunter: { name: '獵艦者', desc: '累計擊沉 10 艘', ok: (G, s, p) => p.ks >= 10 },
  carrier: { name: '航母殺手', desc: '完成擊沉航母任務', ok: (G, s, p, M, ok) => ok && M && M.type === 'carrier' },
  phoenix: { name: '不死鳥', desc: '連續 10 次出擊沒有被擊墜', ok: (G) => G.pilot.streak >= 10 },
  guardian: { name: '守護者', desc: '護衛的航母耐久保持在 50% 以上完成護衛', ok: (G, s, p, M, ok) => ok && M && M.type === 'escort' && M.minHp >= 0.5 },
  veteran: { name: '老兵', desc: '出擊 50 次', ok: (G, s, p) => p.sorties >= 50 },
};
function grLoad() { try { const G = JSON.parse(STORE.getItem(GR_STORE) || 'null'); if (G) return G; } catch (e) { /* 新的 */ } return { seed: (Math.random() * 1e9) >>> 0, ship: {}, fallen: [], pilot: null, missions: 0 }; }
function grSave(G) { try { STORE.setItem(GR_STORE, JSON.stringify(G)); } catch (e) { /* 只在本次 */ } }
function grRnd(G) { G.seed = (Math.imul(G.seed ^ (G.seed >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return G.seed / 4294967296; }
function grName(G) { return GR_FAMILY[Math.floor(grRnd(G) * GR_FAMILY.length)] + GR_GIVEN[Math.floor(grRnd(G) * GR_GIVEN.length)]; }
// 第 slot 格戰艦的資料（沒有就新建）：{ key, sorties, scars: [{ n: 第幾次任務, where }], crew: [{ name, role, sorties, mem: [] }] }
function grShip(G, slot, key) {
  let S = G.ship[slot];
  if (!S || S.key !== key) { S = G.ship[slot] = { key, sorties: 0, scars: [], built: G.missions, crew: GR_ROLES.map((role) => ({ name: grName(G), role, sorties: 0, since: G.missions, mem: [] })) }; }
  return S;
}
const grMem = (c, t) => { c.mem.push(t); if (c.mem.length > 6) c.mem.splice(1, 1); };   // 留第一筆（初次出擊）和最近的
// 艦長任務結束（艦長模式的報告、星海生涯的任務都會呼叫）
// 結束時各艦的狀態（報告畫面一開就會清掉 CAP.ships，所以先記下來）
function grCapSnap() { return (CAP && (CAP.own || CAP.ships) || []).filter((s) => !s.sq).map((s) => ({ key: s.key, dead: !!s.dead, hp: s.dead ? 0 : Math.max(0, ships.hp[s.i]) / s.H.hp })); }
function grAfterCaptain(ok, misName, sceneName, alarmed, snap) {
  snap = snap || grCapSnap(); if (!snap.length) return;
  const G = grLoad(), p = capLoad(), slots = p.slots.map((k, i) => [k, i]).filter(([k]) => k); G.missions++;
  const where = `${sceneName ? sceneName + '的' : ''}${misName || '任務'}`, n = G.missions;
  snap.forEach((s, k) => {
    const slot = slots[k] ? slots[k][1] : k, SH = grShip(G, slot, s.key), hp = s.hp;
    SH.sorties++;
    if (s.dead) {   // 沉沒：每名船員一半機率陣亡，其他人逃生；戰艦重建，戰痕跟著舊船體走了
      for (const c of SH.crew) {
        if (grRnd(G) < 0.5) { G.fallen.push({ name: c.name, role: c.role, ship: CAP_HULLS[s.key] ? CAP_HULLS[s.key].name : s.key, where, n, sorties: c.sorties + 1 }); c.dead = true; }
        else { c.sorties++; grMem(c, `第 ${n} 次任務：${where}，座艦沉沒，搭救生艇逃生`); }
      }
      SH.crew = SH.crew.map((c) => (c.dead ? { name: grName(G), role: c.role, sorties: 0, since: n, mem: [`第 ${n} 次任務後補上 ${c.role} 的空缺（前任 ${c.name} 陣亡）`] } : c));
      SH.scars = []; SH.built = n;
    } else {
      for (const c of SH.crew) {
        c.sorties++;
        if (c.sorties === 1) grMem(c, `第 ${n} 次任務：${where}，初次出擊`);
        else if (hp < 0.4) grMem(c, `第 ${n} 次任務：${where}，座艦重創還是撐了回來`);
        else if (ok && !alarmed) grMem(c, `第 ${n} 次任務：${where}，沒驚動任何人就完成了`);
        else if (c.sorties % 10 === 0) grMem(c, `第 ${n} 次任務：${where}，第 ${c.sorties} 次出擊`);
      }
      if (hp < 0.4) SH.scars.push({ n, where, hp: Math.round(hp * 100) });
    }
  });
  grSave(G);
}
// 飛行員出擊結束（pilot.js 的報告）：S＝這次的戰績、p＝存檔（已加上這次）、M＝任務
function grAfterPilot(S, p, M, ok) {
  const G = grLoad(); if (!G.pilot) G.pilot = { callsign: '', titles: [], best: { kf: 0, ks: 0, dmg: 0 }, streak: 0, bestStreak: 0, hist: [] };
  const P = G.pilot;
  P.streak = S.deaths ? 0 : P.streak + 1; P.bestStreak = Math.max(P.bestStreak, P.streak);
  P.best.kf = Math.max(P.best.kf, S.kf); P.best.ks = Math.max(P.best.ks, S.ks); P.best.dmg = Math.max(P.best.dmg, Math.round(S.dmg || 0));
  const got = [];
  for (const [k, T] of Object.entries(GR_TITLES)) if (!P.titles.some((t) => t.k === k) && T.ok(G, S, p, M, ok)) { P.titles.push({ k, n: p.sorties }); got.push(T.name); }
  P.hist.unshift({ n: p.sorties, mis: M ? PILOT_MIS[M.type].name : '', ok, kf: S.kf, ks: S.ks, deaths: S.deaths });
  if (P.hist.length > 12) P.hist.length = 12;
  grSave(G);
  if (got.length && typeof toast === 'function') toast(`獲得稱號：${got.join('、')}`, 'pilot');
  return got;
}
// 擊墜標記：每架一個短槓，每 5 架合成一顆星
function grMarks(kf) { const st = Math.floor(kf / 5), r = kf % 5; return '★'.repeat(Math.min(st, 40)) + (st > 40 ? `×${st}` : '') + '｜'.repeat(r); }

// ───── 畫面 ─────
function showCrew(back) {
  const G = grLoad(), p = capLoad();
  const cards = p.slots.map((k, i) => [k, i]).filter(([k]) => k).map(([k, i]) => {
    const S = G.ship[i] && G.ship[i].key === k ? G.ship[i] : null, H = CAP_HULLS[k];
    return `<div class="g-card"><h3>${H ? H.name : k}<span class="g-dim">　第 ${i + 1} 格・出擊 ${S ? S.sorties : 0} 次</span></h3>
      <div class="g-dim">戰痕：${S && S.scars.length ? S.scars.map((c) => `第 ${c.n} 次任務・${escH(c.where)}（剩 ${c.hp}%）`).join('；') : '沒有'}</div>
      ${(S ? S.crew : GR_ROLES.map((role) => ({ name: '（尚未編入）', role, sorties: 0, mem: [] }))).map((c) => `<div style="margin-top:8px"><b>${escH(c.role)}・${escH(c.name)}</b> <span class="g-dim">出擊 ${c.sorties} 次</span>
        ${c.mem.length ? `<ul class="g-dim" style="margin:4px 0 0 18px;padding:0">${c.mem.map((m) => `<li>${escH(m)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>`;
  }).join('');
  overlay(`<div class="g-wrap" style="max-width:900px"><div class="g-head"><h2>船員</h2><span class="crumb">艦長・小隊的船員與戰艦</span><span class="g-sp"></span><button class="g-btn" id="gr-back">← 返回</button></div>
    <p class="g-dim">每艘特製戰艦有三名軍官，會記得一起出過的任務。戰艦沉沒時，船員可能陣亡；受重創回來的戰艦會留下戰痕。完成 ${G.missions} 次任務。</p>
    <div class="intel-grid">${cards || '<div class="g-card">小隊還沒有戰艦。</div>'}</div>
    <div class="g-card" style="margin-top:12px"><h3>紀念牆</h3>${G.fallen.length ? G.fallen.slice().reverse().map((f) => `<div>${escH(f.role)} ${escH(f.name)}　<span class="g-dim">${escH(f.ship)}・第 ${f.n} 次任務・${escH(f.where)}・出擊 ${f.sorties} 次</span></div>`).join('') : '<div class="g-dim">還沒有人陣亡。</div>'}</div></div>`);
  gEl('gr-back').onclick = back || (() => showSingle());
}
function showPilotLog(back) {
  const G = grLoad(), p = pilotLoad(), P = G.pilot || { callsign: '', titles: [], best: { kf: 0, ks: 0, dmg: 0 }, streak: 0, bestStreak: 0, hist: [] };
  overlay(`<div class="g-wrap" style="max-width:860px"><div class="g-head"><h2>飛行紀錄</h2><span class="crumb">王牌飛行員・呼號、稱號與戰績</span><span class="g-sp"></span><button class="g-btn" id="gr-back">← 返回</button></div>
    <div class="g-card"><h3>呼號</h3><input id="gr-call" maxlength="12" value="${escH(P.callsign || '')}" placeholder="例如：夜鷹" style="font-size:16px;padding:4px 8px"> <button class="g-btn" id="gr-save">儲存</button>
      <div class="g-dim" style="margin-top:6px">稱號：${P.titles.length ? P.titles.map((t) => `<b>${GR_TITLES[t.k].name}</b>（第 ${t.n} 次出擊）`).join('、') : '還沒有'}</div></div>
    <div class="g-card" style="margin-top:12px"><h3>擊墜標記</h3><div style="font-size:18px;letter-spacing:2px;color:#ffd36a;word-break:break-all">${grMarks(p.kf) || '—'}</div>
      <div class="g-dim">擊墜 ${p.kf} 架・擊沉 ${p.ks} 艘・出擊 ${p.sorties} 次・任務成功 ${p.wins} 次・被擊墜 ${p.deaths} 次</div></div>
    <div class="intel-grid" style="margin-top:12px"><div class="g-card"><h3>個人紀錄</h3><dl class="kv"><dt>單場最多擊墜</dt><dd>${P.best.kf} 架</dd><dt>單場最多擊沉</dt><dd>${P.best.ks} 艘</dd><dt>單場最高傷害</dt><dd>${fmtN(P.best.dmg)}</dd><dt>最長連續不被擊墜</dt><dd>${P.bestStreak} 次出擊（目前 ${P.streak}）</dd></dl></div>
      <div class="g-card"><h3>還沒拿到的稱號</h3>${Object.entries(GR_TITLES).filter(([k]) => !P.titles.some((t) => t.k === k)).map(([, T]) => `<div><b>${T.name}</b>　<span class="g-dim">${T.desc}</span></div>`).join('') || '<div class="g-dim">全部拿到了</div>'}</div></div>
    <div class="g-card" style="margin-top:12px"><h3>最近的出擊</h3>${P.hist.length ? P.hist.map((h) => `<div>第 ${h.n} 次・${escH(h.mis)}　${h.ok ? '<span class="g-emp">成功</span>' : '<span class="g-dim">失敗</span>'}　<span class="g-dim">擊墜 ${h.kf}・擊沉 ${h.ks}・被擊墜 ${h.deaths}</span></div>`).join('') : '<div class="g-dim">還沒有出擊紀錄。</div>'}</div></div>`);
  gEl('gr-back').onclick = back || (() => showSingle());
  gEl('gr-save').onclick = () => { const G2 = grLoad(); if (!G2.pilot) G2.pilot = P; G2.pilot.callsign = gEl('gr-call').value.trim(); grSave(G2); toast('呼號已儲存'); };
}
const grCallsign = () => { const G = grLoad(); return (G.pilot && G.pilot.callsign) || ''; };
window.__gr = { grAfterPilot, grAfterCaptain, showCrew, showPilotLog, grLoad };   // 測試用（tools/growth-test.mjs）
