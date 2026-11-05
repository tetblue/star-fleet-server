// 機甲武裝編輯器：選單位、點選武器、拖曳調整位置／轉向，改大小、仰角、換武器模型，存回 units.js
// 武器資料 { k, at: [x, z]（貼合車體，自動找表面高度）或 [x, y, z]（指定高度）, s 大小, yaw 轉向（度，0 朝前）, pitch 仰角（度） }
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as B from '/build.js';
import { UNITS } from '/units.js';

const FAC = ['帝國', '聯盟', '傭兵', '機械改造人類', '機械智慧族', '蟲族感染人類', '蟲族'];
const CH = { qd: '四足', tk: '履帶' }, SIZE = ['標準', '重型', '巨型'];
const RB = ['bw_emp_l', 'bw_emp_s', 'bw_gat', 'bw_gr', 'bw_lc', 'bw_ms', 'bw_ms8', 'bw_pm', 'bw_sh'];   // rubicon 背部武器
const $ = (id) => document.getElementById(id), r2 = (v) => Math.round(v * 100) / 100, D2R = Math.PI / 180;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// ───── 場景 ─────
const view = $('view');
const R = new THREE.WebGLRenderer({ antialias: true }); R.outputColorSpace = THREE.SRGBColorSpace; view.appendChild(R.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a2e36);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(20, 40, 30); scene.add(sun);
const fill = new THREE.DirectionalLight(0xd8dde6, 0.6); fill.position.set(-30, 10, -20); scene.add(fill);
const grid = new THREE.GridHelper(40, 40, 0x5a6478, 0x394050); scene.add(grid);
// 前方標示：+z 是車頭
const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.02, 9), 3, 0x6fd06f, 0.8, 0.5); scene.add(arrow);
const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 500); cam.position.set(18, 14, 22);
const orbit = new OrbitControls(cam, R.domElement); orbit.target.set(0, 4, 0); orbit.enableDamping = true;
const tc = new TransformControls(cam, R.domElement); tc.setSize(0.85); scene.add(tc);
const selBox = new THREE.BoxHelper(undefined, 0xffd060); selBox.visible = false; scene.add(selBox);
function resize() { const w = view.clientWidth, h = view.clientHeight; R.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(view); resize();
(function loop() { requestAnimationFrame(loop); orbit.update(); if (selBox.visible) selBox.update(); R.render(scene, cam); })();

// ───── 狀態 ─────
const data = structuredClone(UNITS);
let cur = 0, root = null, sel = -1, dirty = false, token = 0;
const undo = [];
const U = () => data[cur];
const status = (t) => ($('status').textContent = t);
function setDirty(v) { dirty = v; $('dirty').textContent = v ? '● 未存檔' : ''; }
function pushUndo() { undo.push({ cur, u: JSON.stringify(U()) }); if (undo.length > 200) undo.shift(); setDirty(true); }
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

await B.init();
const MODELS = B.weaponList();
const WKEYS = Object.keys(MODELS).filter((k) => /^[a-z]w\d+$/.test(k));
const wName = (k) => (k.startsWith('rb:') ? 'rubicon ' + k.slice(3) : (MODELS[k]?.name || k).replace(/^\S+\s/, ''));
const fallbackY = () => (U().ch === 'qd' ? 5.8 : 3.4);

// ───── 顯示單位 ─────
async function show(i, keepSel = false) {
  cur = i; const my = ++token; const u = U();
  status(`組裝 ${u.name}…`);
  const o = B.gameLook(await B.build(u));
  if (my !== token) return;   // 已經切到別的單位
  if (root) scene.remove(root);
  root = o; scene.add(root);
  if (!keepSel) { sel = -1; frame(); }
  attach(); renderList(); renderSide();
  status(`${u.id}・${u.name}・${CH[u.ch]}・武器 ${u.w.length} 個`);
}
function frame() {
  const bb = new THREE.Box3().setFromObject(root), c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(new THREE.Vector3()).length();
  orbit.target.copy(c); cam.position.copy(c).add(new THREE.Vector3(0.75, 0.5, 0.9).normalize().multiplyScalar(r * 1.25));
}
// 只重建一個武器（快）；武器數量變了就全部重掛
async function remount(i) {
  const u = U(); await B.mountWeapon(root, u, i); B.gameLook(root.getObjectByName(`wpn_${i}`));
  if (sel === i) attach();
}
async function remountAll() {
  root.children.filter((o) => /^wpn_\d+$/.test(o.name)).forEach((o) => o.removeFromParent());
  for (let i = 0; i < U().w.length; i++) await remount(i);
  attach();
}
function node(i) { return root?.getObjectByName(`wpn_${i}`); }
function attach() {
  const n = sel >= 0 ? node(sel) : null;
  if (!n) { tc.detach(); selBox.visible = false; return; }
  tc.attach(n); selBox.setFromObject(n); selBox.visible = true;
  const W = U().w[sel], auto = W.at.length === 2;
  if (tc.mode === 'translate') { tc.showX = tc.showZ = true; tc.showY = !auto; }
  else { tc.showX = tc.showZ = false; tc.showY = true; }
}
function select(i) { sel = i; attach(); renderSide(); }

// ───── 拖曳 ─────
tc.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; if (e.value) pushUndo(); else renderSide(); });
tc.addEventListener('objectChange', () => {
  const n = tc.object, W = U().w[sel]; if (!n || !W) return;
  if (tc.mode === 'translate') {
    const x = r2(n.position.x), z = r2(n.position.z);
    if (W.at.length === 2) { W.at = [x, z]; n.position.y = (B.surfaceAt(root, x, z) ?? fallbackY()) - 0.15; }   // 貼合車體：高度跟著表面走
    else W.at = [x, r2(n.position.y + 0.15), z];
  } else { let d = Math.round(n.rotation.y / D2R); d = ((d + 180) % 360 + 360) % 360 - 180; W.yaw = d; }
  updateFields();
});
// 點選武器（沒拖曳才算點選）
let down = null; const rc = new THREE.Raycaster(), mp = new THREE.Vector2();
R.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
R.domElement.addEventListener('pointerup', (e) => {
  if (!down || e.button !== 0 || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || tc.dragging) return;
  if (tc.axis) return;   // 點在操作軸上
  const b = R.domElement.getBoundingClientRect(); mp.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
  rc.setFromCamera(mp, cam);
  for (const h of rc.intersectObject(root, true)) {
    let o = h.object; while (o && o.userData.wi === undefined) o = o.parent;
    if (o) return select(o.userData.wi);
  }
  select(-1);
});

// ───── 左邊：單位清單 ─────
function renderList() {
  let h = '<div class="btns" style="padding:0 8px"><button id="u-dup">複製單位</button><button id="u-del" class="warn">刪除</button></div>', last = -1;
  data.forEach((u, i) => {
    if (u.fac !== last) { h += `<div class="fac">${FAC[u.fac]}</div>`; last = u.fac; }
    h += `<div class="u${i === cur ? ' sel' : ''}" data-i="${i}">${esc(u.name)}<span class="ch">${CH[u.ch]}${u.size ? '・' + SIZE[u.size] : ''}</span></div>`;
  });
  $('list').innerHTML = h;
  $('list').querySelectorAll('.u').forEach((d) => (d.onclick = () => show(+d.dataset.i)));
  $('u-dup').onclick = () => {
    const c = structuredClone(U()); let n = 2; while (data.some((u) => u.id === `${c.id}_${n}`)) n++;
    c.id = `${c.id}_${n}`; c.name += ' 改'; data.splice(cur + 1, 0, c); setDirty(true); show(cur + 1);
  };
  $('u-del').onclick = () => { if (data.length > 1 && confirm(`刪除「${U().name}」？（存檔前都還能重新整理放棄）`)) { data.splice(cur, 1); setDirty(true); show(Math.min(cur, data.length - 1)); } };
}

// ───── 右邊：單位與武器屬性 ─────
function opts(list, v) { return list.map(([k, t]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join(''); }
function weaponOptions(v) {
  let h = '';
  FAC.forEach((f, fi) => {
    const pre = 'eamcrib'[fi] + 'w', ks = WKEYS.filter((k) => k.startsWith(pre) && /^\D+\d+$/.test(k) && k.slice(0, 2) === pre);
    h += `<optgroup label="${f}">${opts(ks.map((k) => [k, `${wName(k)}（${k}）`]), v)}</optgroup>`;
  });
  h += `<optgroup label="rubicon 背部武器">${opts(RB.map((k) => ['rb:' + k, `rubicon ${k}`]), v)}</optgroup>`;
  return h;
}
function renderSide() {
  const u = U(); let h = '<h3>單位</h3>';
  h += `<div class="row"><label>代號</label><input type="text" id="f-id" value="${esc(u.id)}"></div>`;
  h += `<div class="row"><label>名稱</label><input type="text" id="f-name" value="${esc(u.name)}"></div>`;
  h += `<div class="row"><label>定位</label><input type="text" id="f-role" value="${esc(u.role)}"></div>`;
  h += `<div class="row"><label>陣營</label><select id="f-fac">${opts(FAC.map((f, i) => [String(i), f]), String(u.fac))}</select></div>`;
  h += `<div class="row"><label>下半身</label><select id="f-ch">${opts(Object.entries(CH), u.ch)}</select>
        <label style="width:auto">大小</label><select id="f-size">${opts(SIZE.map((s, i) => [String(i), s]), String(u.size))}</select></div>`;
  h += '<h3>武器</h3>';
  u.w.forEach((W, i) => { h += `<div class="w${i === sel ? ' sel' : ''}" data-i="${i}"><span class="n">${i + 1}. ${esc(wName(W.k))}</span><span class="k">${esc(W.k)}</span></div>`; });
  h += `<div class="btns"><button id="w-add">新增</button><button id="w-dup" ${sel < 0 ? 'disabled' : ''}>複製</button><button id="w-mir" ${sel < 0 ? 'disabled' : ''}>鏡像</button><button id="w-del" class="warn" ${sel < 0 ? 'disabled' : ''}>刪除</button></div>`;
  if (sel >= 0) {
    const W = u.w[sel], auto = W.at.length === 2;
    h += `<h3>武器 ${sel + 1}</h3>`;
    h += `<div class="row"><label>模型</label><select id="f-k" style="flex:1;min-width:0">${weaponOptions(W.k)}</select></div>`;
    h += `<div class="row"><label>位置</label>X<input type="number" step="0.1" id="f-x">Z<input type="number" step="0.1" id="f-z"></div>`;
    h += `<div class="row"><label>高度</label><input type="number" step="0.1" id="f-y"><label style="width:auto"><input type="checkbox" id="f-auto" ${auto ? 'checked' : ''}> 貼合車體</label></div>`;
    h += `<div class="row"><label>大小</label><input type="range" min="1" max="16" step="0.1" id="f-sr" style="flex:1"><input type="number" step="0.1" id="f-s"></div>`;
    h += `<div class="row"><label>轉向</label><input type="range" min="-180" max="180" step="1" id="f-yawr" style="flex:1"><input type="number" step="5" id="f-yaw"></div>`;
    h += `<div class="row"><label>仰角</label><input type="range" min="-60" max="80" step="1" id="f-pitr" style="flex:1"><input type="number" step="1" id="f-pit"></div>`;
  }
  $('side').innerHTML = h;
  updateFields();
  // 單位欄位
  const unitField = (id, fn, full) => ($(id).onchange = async (e) => { pushUndo(); fn(e.target.value); if (full) await show(cur, true); else { renderList(); } });
  unitField('f-id', (v) => (u.id = v.trim() || u.id));
  unitField('f-name', (v) => (u.name = v));
  unitField('f-role', (v) => (u.role = v));
  unitField('f-fac', (v) => (u.fac = +v), true);
  unitField('f-ch', (v) => (u.ch = v), true);
  unitField('f-size', (v) => (u.size = +v));
  $('side').querySelectorAll('.w').forEach((d) => (d.onclick = () => select(+d.dataset.i)));
  $('w-add').onclick = async () => {
    pushUndo(); u.w.push({ k: WKEYS.find((k) => k[0] === 'eamcrib'[u.fac]) || 'ew0', at: [0, 0], s: 4 });
    sel = u.w.length - 1; await remount(sel); renderSide();
  };
  if (sel < 0) return;
  $('w-dup').onclick = () => dupWeapon(false);
  $('w-mir').onclick = () => dupWeapon(true);
  $('w-del').onclick = delWeapon;
  const W = u.w[sel];
  const num = (id, fn) => ($(id).onchange = async (e) => { const v = parseFloat(e.target.value); if (!isFinite(v)) return; pushUndo(); fn(v); await remount(sel); updateFields(); });
  const slide = (id, fn) => { $(id).oninput = (e) => { fn(+e.target.value); live(); }; $(id).onpointerdown = () => pushUndo(); $(id).onchange = async () => { await remount(sel); updateFields(); }; };
  num('f-x', (v) => { W.at[0] = r2(v); });
  num('f-z', (v) => { W.at[W.at.length - 1] = r2(v); });
  num('f-y', (v) => { W.at = [W.at[0], r2(v), W.at[W.at.length - 1]]; });
  num('f-s', (v) => { W.s = r2(Math.max(0.2, v)); });
  num('f-yaw', (v) => { W.yaw = Math.round(v); });
  num('f-pit', (v) => { W.pitch = Math.round(v); });
  slide('f-sr', (v) => { W.s = r2(v); });
  slide('f-yawr', (v) => { W.yaw = v; });
  slide('f-pitr', (v) => { W.pitch = v; });
  $('f-auto').onchange = async (e) => {
    pushUndo(); const n = node(sel);
    W.at = e.target.checked ? [W.at[0], W.at[W.at.length - 1]] : [W.at[0], r2(n.position.y + 0.15), W.at[1]];
    await remount(sel); updateFields();
  };
  $('f-k').onchange = async (e) => { pushUndo(); W.k = e.target.value; await remount(sel); renderSide(); };
}
// 拉滑桿時直接改節點（放開才重建）
function live() {
  const n = node(sel), W = U().w[sel]; if (!n) return;
  n.rotation.y = (W.yaw || 0) * D2R;
  const p = n.getObjectByName(`wpn_${sel}_pitch`); if (p) p.rotation.x = -(W.pitch || 0) * D2R;
  const norm = p?.children[0]; if (norm) { norm.userData.s0 ??= { s: norm.scale.x, w: W.s }; norm.scale.setScalar(norm.userData.s0.s * W.s / norm.userData.s0.w); }
  updateFields(true);
}
function updateFields(fromSlider) {
  if (sel < 0 || !$('f-x')) return;
  const W = U().w[sel], n = node(sel), set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
  set('f-x', W.at[0]); set('f-z', W.at[W.at.length - 1]);
  set('f-y', W.at.length === 3 ? W.at[1] : r2((n?.position.y ?? 0) + 0.15)); $('f-y').disabled = W.at.length === 2;
  set('f-s', W.s); set('f-yaw', W.yaw || 0); set('f-pit', W.pitch || 0);
  if (!fromSlider) { set('f-sr', W.s); set('f-yawr', W.yaw || 0); set('f-pitr', W.pitch || 0); }
  status(`武器 ${sel + 1}：${wName(W.k)}（${W.k}）　位置 ${W.at.join(', ')}　大小 ${W.s}　轉向 ${W.yaw || 0}°　仰角 ${W.pitch || 0}°`);
}
async function dupWeapon(mirror) {
  if (sel < 0) return; pushUndo();
  const u = U(), c = structuredClone(u.w[sel]);
  if (mirror) { c.at[0] = r2(-c.at[0]); if (c.yaw) c.yaw = -c.yaw; }   // 左右對稱
  else c.at[0] = r2(c.at[0] + 1);
  u.w.splice(sel + 1, 0, c); sel++; await remountAll(); renderSide();
}
async function delWeapon() {
  if (sel < 0) return; pushUndo();
  U().w.splice(sel, 1); sel = Math.min(sel, U().w.length - 1); await remountAll(); renderSide();
}
function setMode(m) { tc.setMode(m); $('m-move').classList.toggle('on', m === 'translate'); $('m-rot').classList.toggle('on', m === 'rotate'); attach(); }
$('m-move').onclick = () => setMode('translate');
$('m-rot').onclick = () => setMode('rotate');

// ───── 復原、存檔、匯出 ─────
async function doUndo() {
  const s = undo.pop(); if (!s) return status('沒有可以復原的動作');
  data[s.cur] = JSON.parse(s.u); if (sel >= data[s.cur].w.length) sel = data[s.cur].w.length - 1;
  await show(s.cur, true);
}
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
function wText(W) {
  let t = `{ k: ${q(W.k)}, at: [${W.at.map(r2).join(', ')}], s: ${r2(W.s)}`;
  if (W.yaw) t += `, yaw: ${Math.round(W.yaw)}`; if (W.pitch) t += `, pitch: ${Math.round(W.pitch)}`;
  return t + ' }';
}
function unitsText() {
  let t = 'export const UNITS = [\n', last = -1;
  for (const u of data) {
    if (u.fac !== last) { t += `  // ───── ${FAC[u.fac]} ─────\n`; last = u.fac; }
    t += `  { id: ${q(u.id)}, fac: ${u.fac}, ch: ${q(u.ch)}, size: ${u.size}, name: ${q(u.name)}, role: ${q(u.role)}, w: [`;
    const ws = u.w.map(wText), lines = [];
    for (let i = 0; i < ws.length; i += 3) lines.push('    ' + ws.slice(i, i + 3).join(', '));
    t += (lines.length ? '\n' + lines.join(',\n') : '') + '] },\n';
  }
  return t + '];\n';
}
async function save() {
  const ids = data.map((u) => u.id), dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) return status(`代號重複：${dup}，沒有存檔`);
  const src = await (await fetch('/units.js', { cache: 'no-store' })).text(), at = src.indexOf('export const UNITS = [');
  if (at < 0) return status('units.js 格式不對，沒有存檔');
  const r = await fetch('/save/units.js', { method: 'POST', body: src.slice(0, at) + unitsText() });
  if (r.ok) { setDirty(false); status(`已存檔 units.js（${data.length} 個單位，舊檔備份在 out/units_backup/）`); } else status('存檔失敗');
}
async function exportGlb() {
  const u = U(); status(`匯出 ${u.id}.glb…`);
  const o = await B.build(u);   // 匯出原本的材質（遊戲載入時自己換材質）
  o.traverse((m) => { if (m.isMesh && m.material.map) m.material.map.userData.mimeType = 'image/jpeg'; });
  const buf = await new GLTFExporter().parseAsync(o, { binary: true, maxTextureSize: 1024 });
  await fetch(`/out/glb/${u.id}.glb`, { method: 'POST', body: buf });
  await fetch('/out/glb/units.json', { method: 'POST', body: JSON.stringify(data, null, 1) });
  status(`已匯出 out/glb/${u.id}.glb（${(buf.byteLength / 1048576).toFixed(1)} MB）`);
}
$('b-undo').onclick = doUndo;
$('b-save').onclick = save;
$('b-glb').onclick = exportGlb;
$('b-anim').onclick = async () => { if (dirty) await save(); window.open(`/anim.html#${U().id}`, '_blank'); };

// ───── 鍵盤 ─────
addEventListener('keydown', async (e) => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); return save(); }
  if ((e.ctrlKey || e.metaKey) && k === 'z' && !typing) { e.preventDefault(); return doUndo(); }
  if (typing) return;
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); return dupWeapon(false); }
  if (k === 'w') return setMode('translate');
  if (k === 'e') return setMode('rotate');
  if (k === 'm') return dupWeapon(true);
  if (k === 'delete' || k === 'backspace') return delWeapon();
  if (k === 'escape') return select(-1);
  if (k === 'f') return frame();
  if (sel < 0) return;
  const W = U().w[sel], st = e.shiftKey ? 0.5 : 0.1;
  const mv = { arrowleft: [st, 0], arrowright: [-st, 0], arrowup: [0, st], arrowdown: [0, -st] }[k];
  if (mv) {   // 方向鍵：左右＝X、上下＝Z（車頭 +z）
    e.preventDefault(); pushUndo(); W.at[0] = r2(W.at[0] + mv[0]); W.at[W.at.length - 1] = r2(W.at[W.at.length - 1] + mv[1]);
    await remount(sel); updateFields(); return;
  }
  if (k === 'pageup' || k === 'pagedown') {
    e.preventDefault(); pushUndo(); const n = node(sel), y = W.at.length === 3 ? W.at[1] : n.position.y + 0.15;
    W.at = [W.at[0], r2(y + (k === 'pageup' ? st : -st)), W.at[W.at.length - 1]]; await remount(sel); renderSide(); return;
  }
  if (k === '[' || k === ']') { pushUndo(); W.s = r2(Math.max(0.2, W.s + (k === ']' ? st : -st) * 2)); await remount(sel); updateFields(); }
});

const h = location.hash.slice(1), hi = data.findIndex((u) => u.id === h);
await show(Math.max(0, hi));
window.__ed = { data, show, select, save, unitsText, get sel() { return sel; }, get root() { return root; }, tc };
