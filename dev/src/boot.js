// ═══════════════════════ 啟動 ═══════════════════════
newBattle(12345);
resize();
goPreset('mid');
requestAnimationFrame(frame);
setCmdSide(0, false);
selectionChanged();
document.querySelectorAll('#seg-render button').forEach((b) => b.classList.toggle('on', b.dataset.r === '2d'));
updateTimeUI();
window.__demo = { view, updateCamera, volley, turn, opts, goPreset, changeFormation, missileSalvo, launchFighters, groups: () => groups, aliveF,
  setRenderMode, orbitBy, mode: () => mode3D, R3, squadrons: () => squadrons, dbg: () => ({ ts, touches: [...touches.keys()], camAnim, paused }), setLongPress(ms) { LONG_PRESS = ms; }, setSelection, cmdLine, cmdMoveTo, planMove, distSample(n) { const out = []; for (let k = 0; k < n; k++) { const i = (Math.random() * shipCount) | 0; const q = squadrons[ships.sq[i]]; if (!ships.alive[i] || q.bg) continue; const tg = focusTarget(q); if (tg < 0) continue; shipWorldCPU(i, _a); shipWorldCPU(tg, _b); out.push(_a.distanceTo(_b)); } return out.sort((a, b) => a - b); }, dmgStats, hitAspect, beamFalloff, beamPow, G: () => groups, shipWorld(i) { shipWorldCPU(i, _a); return [_a.x, _a.z]; }, beginAim, confirmAim, aim: () => aim, cmdFormation, cmdAttack, setJam, formGroup, groundAt, screenOf, selected, step(sec) { const n = Math.round(sec * SIM_HZ); for (let k = 0; k < n; k++) stepSim(); }, newBattle, replayBattle, stateHash, setPaused(b) { paused = b; updateTimeUI(); }, cmdLog, simTick: () => simTick, issue, setView(x, z, h) { camAnim = null; view.target.x = x; view.target.z = z; view.height = h; updateCamera(); } };
document.getElementById('sand-exit').onclick = () => showMenu();
Object.assign(window.__demo, { GAME, TAC, SV, svH, svV, groupNodes, SIM, showSim, simStart, simSwitch, simSetup, simEditMid, simGo, simReset, opLevel, setOpLevel, applyOp, OP_LEVELS, ffStats, ffHold, rayStats, deflStats, facStats, maxHp, fleets: () => fleets, showMenu, showSingle, showRandom, showCampaign, showBriefing, showWatch, watchGo, showLoadout, startDeploy, startBattle, showReport, startReplay, SCENARIOS, sideAlive, TUT, TUT_LESSONS, tutStart, showTraining, showManual });
// 除錯：命令、干擾、補給、地形與統計
Object.assign(window.__demo, { PL, step: (n = 1) => { for (let k = 0; k < n && !GAME.result; k++) stepSim(); pushSquadronUniforms(); gameFrame(0.2); }, issue, setSelection, squadrons: () => squadrons, ships: () => ships, jammed, seenSq, playerFogged, FOW: () => FOW, FT: () => FT, rockBlock, rocks: () => ROCKS, wStats, ftrStats, ammoRatio, supplyStock });
document.getElementById('tb-attack').onclick = armAttack;
document.getElementById('tb-queue').onclick = () => { queueToggle = !queueToggle; document.getElementById('tb-queue').classList.toggle('on', queueToggle); };
document.getElementById('set-btn').onclick = () => openSettings();
applyUISettings();
Object.assign(window.__demo, { cStats, C_SRC, rocks: () => ROCKS, shipWorld3(i) { shipWorldCPU(i, _a); return [_a.x, _a.y, _a.z]; }, fleetMods, U: () => U.uTime.value, gunStats: () => gunStats, pending: () => pending, wInfo: () => ({ dmg: wDmg.map((a) => a.map(Math.round)), w: wStats.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v)]))), air: [aliveF[0].length, aliveF[1].length], alive: [sideAlive(0), sideAlive(1)] }), SETTINGS, openSettings, closeSettings, keyOf, BR, enterBridge, exitBridge, ships: () => ships, bridgeLook, bridgeConsoleK, camera: () => camera });
Object.assign(window.__demo, { CUT, CUT_STYLES, cutPlay, cutPrepare, cutEncode, cutLayout, cutDraw, openCutStudio });
Object.assign(window.__demo, { MOUNTS: () => MOUNTS, mountsOf, openWeaponEditor, closeWeaponEditor, WE, WA, buildWeaponAtlas, shipMat, getModel, MODEL_SRC, MODEL_LOAD, STORE: () => STORE, showRecords, showCampaign, showCampBriefing, campLoad, campStage, campEnemy, showTavern, storyUnlock, showStory, storyBriefing, storyScenario, storyLoad, STORY_STAGES, STORY_WAR, roster: () => ROSTER, fleets: () => fleets, skills: () => SKILLS, sideFac: () => SIDE_FAC, COMMANDERS });
// 載入伺服器模型資料夾裡的模型（啟動畫面顯示進度），完成後才進選單
(async () => {
  const B = window.BOOT;
  B && B.status('載入模型…', 0);
  try {
    await loadAllModels((f, n, total) => B && B.status(`載入模型 ${n}／${total}`, f));
  } catch (e) { MODEL_LOAD.err.push(e.message); }
  if (MODEL_LOAD.err.length && B) await B.warn('有模型沒有載入成功（3D 畫面會缺這些船或武器）：<br>' + MODEL_LOAD.err.join('<br>'));
  scheduleWeaponAtlas();
  let m = '2d'; try { m = STORE.getItem('fleet.render') || '2d'; } catch (e) { /* 預設 2D */ }
  if (m === '3d' && MODEL_SRC.e0) setRenderMode('3d', false);
  if (/sandbox/.test(location.search)) setPhase('sandbox'); else showMenu();
  B && B.done();
  window.__ready = true;
})();
Object.assign(window.__demo, { frame, setPaused(v) { paused = v; }, pilotLayout, PILOT_MIS, shipPos(i) { const o = {}; bridgePose(i, o); return o; }, getModel, hullKey, pilotHullMesh, pilotHullCollide, pilotCredit, pilotMisTick, pilotHurt, PL, showPilot, pilotGo, pilotPickTarget, pilotLoad, pilotSave, fP: () => fP, PILOT_WEAPONS, pilotEcmHides, pilotEcmLeft });   // 王牌飛行員（除錯）
// 測試用：劇情關卡自動代打（玩家那一邊也交給 AI）。不畫畫面，直接跑模擬到分出勝負
// o：diff 難度序號（預設普通）、lv 玩家指揮官等級（預設＝建議等級）、ai 玩家 AI 難度 1～5（預設 3）、tactic 玩家 AI 打法（預設照關卡目標挑）
//    like：玩家的特性加成改成跟敵方一樣照等級算（對照組，大約是「天賦有點」的強度）
// 玩家指揮官預設不點天賦（只有固定 +8% 的特性加成、固有技能），也不帶增援、傭兵支援
async function autoStory(id, o = {}) {
  const di = o.diff != null ? o.diff : 1; GAME.storyDiffForce = di;
  const toast0 = toast, paused0 = paused, said = []; toast = (m, c) => { if (o.log && (c === 'story' || c === 'bad')) said.push(`${Math.round(U.uTime.value)}s ${m}`); }; paused = true;   // o.log：記下戰鬥中的台詞與警告
  try {
    const s = STORY_BY[id]; storyEnsureCast(s.cast);
    const sc = storyScenario(id), lo = storyLoadout(sc), rec = storyRec(id);
    if (o.formation) lo.fleets.forEach((f) => { f.formation = o.formation; });   // 起始陣型（預設橫陣）
    GAME.sc = sc; GAME.loadout = lo; GAME.playerSide = 0; GAME.attempt = 1;
    const G = sc.goal && sc.goal.type, tac = o.tactic || (G === 'survive' || G === 'escort' ? 'kite' : 'push'), lv = o.lv != null ? o.lv : rec;
    const setup = makeSetup(sc, lo, 1); setup.op = 0;
    setup.fleets = setup.fleets.filter((f) => f.mercOf == null && f.reinfOf == null);
    for (const f of setup.fleets) if (f.side === 0 && !f.ally && f.commander && f.commander.id) {
      const c = COMMANDERS.find((x) => x.id === f.commander.id);
      f.commander.level = lv; if (o.like) delete f.commander.tal; else f.commander.tal = {}; f.commander.skills = c.skills.slice();
      f.ai = { tactic: tac, level: o.ai || 3 };
    }
    GAME.watch = true; GAME.replaying = false; GAME.result = null; GAME.lineK = 0; GAME.dlineK = 0; GAME.log = []; GAME.simCtl = null; GAME.phase = 'battle';
    newBattle(sc.seed + 1, setup); setRule('fire', true); setRule('advance', false);
    GAME.init = [sideAlive(0), sideAlive(1)];
    const cap = (sc.timeLimit + 30) * SIM_HZ, t0 = performance.now();
    while (!GAME.result && simTick < cap) { for (let k = 0; k < 600 && !GAME.result; k++) stepSim(); await new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = r; ch.port2.postMessage(0); }); }   // 不用 setTimeout：背景分頁會被降速
    const R = GAME.result || { kind: 'none', why: '沒有分出勝負', t: U.uTime.value, ratio: [sideAlive(0) / GAME.init[0], sideAlive(1) / GAME.init[1]] };
    const vip = fleets.find((f) => f.vip), vipLeft = vip ? vip.sqs.reduce((a, x) => a + x.alive, 0) / vip.initial : null;
    return { id, name: s.name, line: s.line, diff: STORY_DIFF[di].name, lv, ai: o.ai || 3, like: !!o.like, formation: o.formation || 'line', tac, goal: G || 'kill', kind: R.kind, why: R.why, t: Math.round(R.t), limit: sc.timeLimit,
      me: Math.round(R.ratio[0] * 100), foe: Math.round(R.ratio[1] * 100), vip: vipLeft != null ? Math.round(vipLeft * 100) : null, init: GAME.init.slice(), defT: (fleets.find((f) => f.defSched) || {}).defT, ...(o.log ? { said } : {}), wall: Math.round((performance.now() - t0) / 1000) };
  } finally {
    toast = toast0; paused = paused0; GAME.watch = false; GAME.phase = 'menu'; GAME.storyDiffForce = null;
  }
}
Object.assign(window.__demo, { autoStory, queueMode });
