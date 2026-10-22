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
Object.assign(window.__demo, { step: (n = 1) => { for (let k = 0; k < n && !GAME.result; k++) stepSim(); pushSquadronUniforms(); gameFrame(0.2); }, issue, setSelection, squadrons: () => squadrons, ships: () => ships, jammed, seenSq, playerFogged, FOW: () => FOW, FT: () => FT, rockBlock, rocks: () => ROCKS, wStats, ftrStats, ammoRatio, supplyStock });
document.getElementById('tb-attack').onclick = armAttack;
document.getElementById('tb-queue').onclick = () => { queueToggle = !queueToggle; document.getElementById('tb-queue').classList.toggle('on', queueToggle); };
document.getElementById('set-btn').onclick = () => openSettings();
applyUISettings();
Object.assign(window.__demo, { cStats, C_SRC, rocks: () => ROCKS, shipWorld3(i) { shipWorldCPU(i, _a); return [_a.x, _a.y, _a.z]; }, fleetMods, U: () => U.uTime.value, gunStats: () => gunStats, pending: () => pending, wInfo: () => ({ dmg: wDmg.map((a) => a.map(Math.round)), w: wStats.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v)]))), air: [aliveF[0].length, aliveF[1].length], alive: [sideAlive(0), sideAlive(1)] }), SETTINGS, openSettings, closeSettings, keyOf, BR, enterBridge, exitBridge, ships: () => ships, bridgeLook, bridgeConsoleK, camera: () => camera });
Object.assign(window.__demo, { CUT, CUT_STYLES, cutPlay, cutPrepare, cutEncode, cutLayout, cutDraw, openCutStudio });
Object.assign(window.__demo, { MOUNTS: () => MOUNTS, mountsOf, openWeaponEditor, closeWeaponEditor, WE, WA, buildWeaponAtlas, shipMat, getModel, MODEL_SRC, MODEL_LOAD, STORE: () => STORE, showRecords, showCampaign, showCampBriefing, campLoad, campStage, campEnemy, showTavern, storyUnlock, roster: () => ROSTER, fleets: () => fleets, skills: () => SKILLS, sideFac: () => SIDE_FAC, COMMANDERS });
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
Object.assign(window.__demo, { frame, setPaused(v) { paused = v; }, pilotLayout, PILOT_MIS, shipPos(i) { const o = {}; bridgePose(i, o); return o; }, getModel, hullKey, pilotHullMesh, pilotHullCollide, pilotCredit, pilotMisTick, pilotHurt, PL, showPilot, pilotGo, pilotPickTarget, pilotLoad, pilotSave, fP: () => fP, PILOT_WEAPONS });   // 王牌飛行員（除錯）
