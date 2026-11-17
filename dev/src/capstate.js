// ═══════════════════════ 艦長：躍遷撤退與接續戰鬥 ═══════════════════════
// 躍遷撤退不算任務失敗：戰場的狀況（擊沉的船、摧毀的設施、剩下的耐久與飛彈、警報）存起來，修好船之後可以接續。
// 任務失敗＝任務時限用完（每次出擊的戰鬥時間累計）或自己的小隊全滅。
// 敵方在玩家離開的期間會不會整修，看星系裡的設施：維修船塢（yard）修船體與防禦設施、補給站（depot）補飛彈；被炸掉就不會修。
// 隨機任務的選單只保留一場撤退中的戰鬥（p.resume）；生涯模式會改成每個星系一份。
Object.assign(CAP_UNIT, {
  yard: { kind: 'bldg', sub: 'yard', name: '維修船塢', hp: 700, r: 4, hh: 0, sensor: 0, intel: true, merit: 120, space: true, yard: true },
  depot: { kind: 'bldg', sub: 'depot', name: '補給站', hp: 500, r: 3.2, hh: 0, sensor: 0, intel: true, merit: 90, space: true, depot: true },
});
// 玩家離開一次，敵方整修多少：船塢＝船體、防禦設施修好缺少的 60%；補給站＝飛彈補滿；護盾一律充滿
const CAP_REPAIR = { yard: 0.6 };

// ───── 撤退：先處理任務的特例，再存下戰況 ─────
function capRetreat() {
  const M = CAP.mis;
  if (M && M.type === 'intercept') {   // 攔截：離開的期間運輸船隊照樣開走
    const V = CAP.pat.find((q) => q.role === 'convoy'); if (V && V.on) capConvoyEscape(V);
    capSpaceMisTick(M); if (GAME.result) return;
  }
  if (CAP.cfg.resumeP) { const S = capSnapshot(), p = capLoad(); p.resume = S; capSave(p); }   // 星海生涯、AI 對 AI 測試：不存
  capFinish(false, '躍遷撤退', { retreat: true });
}
function capSnapshot() {
  const C = CAP.cfg, M = CAP.mis, r3 = (v) => Math.round(v * 1000) / 1000;
  const fl = fleets.map((f) => (f.side === CAP.side ? null : f.sqs.flatMap((q) => q.list.map((i) => (ships.alive[i] ? r3(Math.max(0.01, ships.hp[i] / maxHp(i))) : 0)))));
  return {
    v: 1, p: C.resumeP, name: SIM.m.name, mis: M.type, tUsed: Math.round(CAP.tUsed0 + U.uTime.value), n: (C.resume ? C.resume.n : 0) + 1,
    alarmed: !!CAP.stats.alarmed, waves: CAP.waves, esc: M.esc || 0,
    units: C.units.map((u, k) => { const g = CAP.G.gts[k]; return !g || gtDead(g) ? 0 : r3(g.hp / g.max); }),
    fleets: fl, msl: CAP.foes.map((s) => (s.H.msl ? r3(s.mslN / s.H.msl.n) : 0)),
    reinf: CAP.pat.filter((P) => P.role === 'reinf').map((P) => !!P.on),
    left: { ships: CAP.foes.filter((s) => !s.dead).length + CAP.pat.reduce((a, P) => a + (P.on && P.role !== 'airbase' ? P.f.sqs.reduce((b, q) => b + q.alive, 0) : 0), 0),
      defs: CAP.G.gts.filter((g) => g.def && !gtDead(g)).length, yard: CAP.G.gts.some((g) => CAP_UNIT[g.cu].yard && !gtDead(g)), depot: CAP.G.gts.some((g) => CAP_UNIT[g.cu].depot && !gtDead(g)) },
  };
}
// ───── 接續：照存下的戰況調整剛生成好的戰場（capBegin 的最後呼叫） ─────
function capResumeApply(C) {
  const R = C.resume; if (!R) return;
  const yard = R.left.yard, depot = R.left.depot, fix = (v) => (yard ? v + (1 - v) * CAP_REPAIR.yard : v);
  // 敵方艦艇（一般戰艦、運輸艦、特製戰艦）：擊沉的拿掉，其他照剩下的耐久（＋船塢整修）
  for (const f of fleets) {
    const L = R.fleets[f.id]; if (!L) continue;
    let k = 0;
    for (const q of f.sqs) for (const i of q.list) {
      const v = L[k++]; if (v == null) continue;
      if (v <= 0) { if (ships.alive[i]) { ships.alive[i] = 0; q.alive--; q.typeAlive[ships.type[i]]--; } continue; }
      ships.hp[i] = maxHp(i) * fix(v); ships.sh[i] = ships.shMax[i];
    }
  }
  CAP.foes.forEach((s, k) => { if (!ships.alive[s.i]) { s.dead = true; return; } if (s.H.msl && R.msl[k] != null) s.mslN = depot ? s.H.msl.n : Math.round(s.H.msl.n * R.msl[k]); });
  // 設施
  CAP.G.gts.forEach((g, k) => { const v = R.units[k]; if (v == null) return; if (v <= 0) { g.hp = 0; g.deadT = 0; } else g.hp = Math.round(g.max * (g.def ? fix(v) : v)); });
  // 已經出動的增援：再出動一次（從戰區外趕來）
  CAP.pat.filter((P) => P.role === 'reinf').forEach((P, k) => { if (R.reinf[k] && P.f.sqs.some((q) => q.alive > 0)) capWaveOn(P); });
  CAP.waves = R.waves;
  if (R.alarmed) { CAP.alarm = true; CAP.alarmT = 0; CAP.stats.alarmed = true; CAP.nextWave = CAP_RULE.waveFirst; }
  if (CAP.mis) CAP.mis.esc = R.esc || 0;
  const msg = [yard ? `維修船塢修好了敵方受損的船與防禦（缺少的 ${Math.round(CAP_REPAIR.yard * 100)}%）` : '敵方沒有維修船塢：船體的損傷還在', depot ? '補給站補滿了敵方的飛彈' : ''].filter(Boolean).join('；');
  toast(`接續第 ${R.n + 1} 次出擊・任務時限剩 ${_fmtT(Math.max(0, CAP.tLim))}・${msg}`, 'pilot');
  capFeed(msg, yard ? 'bad' : 'ok');
}
// 選單：撤退中的戰鬥
function capResumeCard(p) {
  const R = p.resume; if (!R) return '';
  const L = R.left;
  return `<div class="g-card" style="margin-top:12px;border-color:#ffd36a"><h3>撤退中的戰鬥 <span class="g-dim" style="font-weight:400">${escH(R.name)}・已出擊 ${R.n} 次</span></h3>
    <div>任務時限剩 <b>${_fmtT(Math.max(0, CAP_RULE.time - R.tUsed))}</b>・敵方剩 ${L.ships} 艘${L.defs ? `、軌道防禦 ${L.defs} 座` : ''}・${L.yard ? '<span style="color:#ff9a5a">維修船塢還在（敵方會整修）</span>' : '沒有維修船塢'}・${L.depot ? '補給站還在（飛彈會補滿）' : '沒有補給站'}</div>
    <div class="g-dim" style="margin-top:4px">你的船已經修好、飛彈補滿（隨機任務）。出擊新任務會放棄這場戰鬥。</div>
    <div class="g-row" style="margin-top:8px"><button class="g-btn" id="cp-drop">放棄這場戰鬥</button><span class="g-sp"></span><button class="g-btn pri" id="cp-resume">接續戰鬥 →</button></div></div>`;
}
function capResumeBind(p, keep) {
  const a = gEl('cp-resume'), b = gEl('cp-drop'); if (!a) return;
  a.onclick = () => capGo(true);
  b.onclick = () => { p.resume = null; keep(); };
}

// ───── 太空設施的模型：專案裡的太空站（models/<陣營>/太空站），載入前先顯示幾何造型 ─────
// [大小 0～2（小、中、大）, 模型長度＝單位半徑的幾倍]
// 你的建築、你強化過的建築：頂上一顆綠色的識別燈（capplanet.js）
let CAP_BEACON = null;
function capMarkBeacon(o, g, k = 1.5) {
  if (!g.mark) return;
  if (!CAP_BEACON) CAP_BEACON = { geo: new THREE.SphereGeometry(1, 10, 8), mat: new THREE.MeshBasicMaterial({ color: 0x3fdf8f }) };
  const b = new THREE.Mesh(CAP_BEACON.geo, CAP_BEACON.mat); b.userData.shared = true; b.userData.beacon = true; b.scale.setScalar(Math.max(0.5, g.r * 0.22)); b.position.y = g.r * k * 0.55 + 1; o.add(b);
}
const CAP_STATION = { orb: [2, 4], plat: [0, 2.6], hangar: [1, 2.8], relay: [0, 2.4], yard: [1, 3], depot: [0, 2.8] };
function capStationModel(o, g) {
  const S = CAP_STATION[g.cu]; if (!S) return;
  const key = FAC_KEY[SIDE_FAC[g.side]] + 's' + S[0];
  ensureModels([key]).then(() => {
    if (!CAP.spV || !o.parent) return;
    const M = getModel(key) || getModel('es' + S[0]); if (!M) return;
    for (const c of o.children.slice()) { o.remove(c); if (c.geometry) c.geometry.dispose(); }   // 幾何造型的材質是整個戰場共用的（V.mats），capSpaceEnd 再釋放
    const m = new THREE.Mesh(M.lods[0], M.mat); m.userData.shared = true; m.scale.setScalar(g.r * S[1]); o.add(m);
    capMarkBeacon(o, g, S[1]);
  });
}
