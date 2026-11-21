// ═══════════════════════ 艦長生涯：小隊／船塢／改裝／研發的面板（2026-11-18）═══════════════════════
// 照使用者的方向（不佔滿畫面、和停泊大廳一樣斜放）：這些畫面原本是置中的對話框，改成星圖右側的斜放面板，
// 背景不變暗、星圖照常看得到（面板打開時星圖往左縮）。改裝（cr-side）背景是整修庫，同一套面板放在右邊。
// 用法：ccmSheet(html, cls) 取代 smuModal；關閉、重畫照舊用 smuCloseModal（對話框的佇列、按鈕都不變）。
// 內容的樣式（區塊標題、船的列、分段按鈕、表格、數值）全部掛在 .ccm-sheet 底下。
const CCS_CSS = `
#g-screen:has(.ccm) .sm-modal:has(.ccm-sheet){background:transparent;backdrop-filter:none;pointer-events:none;justify-content:flex-end;align-items:flex-start;perspective:1600px}
#g-screen:has(.ccm) .sm-box.ccm-sheet{pointer-events:auto;zoom:var(--k,1);width:760px;max-width:none;margin:150px 30px 0 0;max-height:calc(100vh / var(--k,1) - 350px);padding:24px 30px 22px;
  transform-origin:100% 50%;transform:translateX(-24px) rotateY(-7deg) rotateZ(-.4deg);background:linear-gradient(165deg,rgba(18,28,58,.94),rgba(8,13,30,.92));border-right:3px solid var(--sc,#3cc8ff);
  animation:ccsIn .4s cubic-bezier(.2,.8,.2,1) both;backdrop-filter:blur(3px)}
#g-screen:has(.ccm) .sm-box.ccm-sheet.still{animation:none}
#g-screen:has(.ccm) .sm-box.ccm-sheet.cr-side{width:700px;max-height:calc(100vh / var(--k,1) - 120px);margin-top:60px;background:linear-gradient(165deg,rgba(18,28,58,.9),rgba(8,13,30,.86))}
@keyframes ccsIn{from{opacity:0;transform:translateX(50%) rotateY(-7deg) rotateZ(-.4deg)}}
#g-screen:has(.ccm) .sm-box.ccm-sheet::before{background:var(--sc,#3cc8ff);width:150px}
.ccm-sheet{--own:#3fdf8f;--ally:#5aa8ff;--red:#ff4d5e;--yellow:#f3e94b;--gold:#ffc24a;--cyan:#3cc8ff;--violet:#a97bff;--dim:#8fa3c7;--mute:#5d6f92;--line:rgba(90,200,255,.32);--line2:rgba(150,190,240,.18);
  --en:Rajdhani,Bahnschrift,'Segoe UI',sans-serif;font-size:15px}
.ccm-sheet h3{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;font-size:26px!important;margin:0 0 10px!important}
.ccm-sheet h3 .en{font:700 12px var(--en);letter-spacing:.3em;color:var(--sc,var(--cyan))}
.ccm-sheet h3 .cc-lv{font-size:13px!important}
.ccm-sheet h4{display:flex;align-items:center;gap:10px;margin:18px 0 8px!important;font:900 15px 'Noto Sans TC','Microsoft JhengHei',sans-serif!important;letter-spacing:.14em;color:#dfe8fa!important}
.ccm-sheet h4::after{content:"";flex:1;height:1px;background:var(--line2)}
.ccm-sheet .g-dim{color:var(--dim)}
.ccm-sheet .ccs-note{font-size:13px;color:var(--dim);line-height:1.6;padding:8px 12px;background:rgba(12,20,42,.55);border-left:2px solid var(--mute);margin:4px 0 6px}
/* 船的列、小隊 */
.ccm-sheet .cc-ship{padding:7px 12px;margin:4px 0;background:rgba(12,20,42,.72);border-left:3px solid var(--own);gap:4px 12px}
.ccm-sheet .cc-ship b{font-size:14px}
.ccm-sheet .cc-sq{padding:10px 12px;margin:8px 0;background:rgba(10,16,34,.6);border:0;border-left:3px solid var(--own);border-radius:0}
.ccm-sheet .cc-sq > b{font-size:16px}
.ccm-sheet .cc-sq .cc-ship{background:rgba(18,28,54,.8);border-left-width:2px}
.ccm-sheet .cc-bar{height:5px;border-radius:0;background:rgba(255,255,255,.1)}
.ccm-sheet .cc-xp{height:7px;border-radius:0;background:rgba(255,255,255,.1)}
.ccm-sheet .cc-lv{border-radius:0}
/* 分段按鈕、行動 */
.ccm-sheet .sm-seg{border:0;border-radius:0;gap:4px;overflow:visible}
.ccm-sheet .sm-seg button{border:1px solid var(--line2);background:rgba(14,22,46,.85);color:#cfd8e3;padding:5px 12px;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}
.ccm-sheet .sm-seg button:last-child{border-right:1px solid var(--line2)}
.ccm-sheet .sm-seg button:hover:not(:disabled){background:rgba(30,60,110,.95)}
.ccm-sheet .sm-seg button.on{background:linear-gradient(100deg,rgba(60,200,255,.45),rgba(47,134,255,.35));color:#fff;border-color:var(--cyan)}
.ccm-sheet .sm-pc{border-radius:0}
.ccm-sheet .g-btn{font-size:13px}
.ccm-sheet .sm-btns{margin-top:16px;padding-top:12px;border-top:1px solid var(--line2);justify-content:flex-end}
/* 表格、數值 */
.ccm-sheet .cc-mods{border-collapse:separate;border-spacing:0 4px;font-size:14px}
.ccm-sheet .cc-mods td{border:0;background:rgba(12,20,42,.7);padding:7px 10px}
.ccm-sheet .cc-mods td:first-child{border-left:3px solid var(--cyan);color:var(--dim);font-weight:700}
.ccm-sheet .cc-fit tr.chg td:first-child{border-left-color:var(--violet)}
.ccm-sheet .sm-kv{gap:6px 16px;font-size:14px;padding:10px 14px;background:rgba(12,20,42,.55)}
.ccm-sheet .sm-kv dt{color:var(--dim);font-weight:700}
.ccm-sheet .cc-cmp{gap:5px 14px;font-size:14px;padding:10px 14px;background:rgba(12,20,42,.55)}
.ccm-sheet .cc-yq button{font-size:12px}
.ccm-sheet [style*="font-size:12px"]{font-size:13.5px!important}.ccm-sheet [style*="font-size:11px"]{font-size:12.5px!important}
.ccm-sheet .sm-seg button{font-size:13.5px}.ccm-sheet .cc-yq{font-size:14px}.ccm-sheet .cc-yq .g-dim{font-size:13px}
/* 研發 */
.ccm-sheet .ccs-cur{display:flex;align-items:center;gap:14px;padding:12px 14px;background:rgba(40,24,80,.45);border-left:3px solid var(--violet);margin:6px 0}
.ccm-sheet .ccs-cur .cc-bar{flex:1}
.ccm-sheet .ccs-big{font:700 30px/1 var(--en);color:var(--violet)}
/* 數字列（商店、星球）、警告、貨品 */
.ccm-sheet .ccs-stat{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:4px;margin:4px 0 10px}
.ccm-sheet .ccs-stat > div{padding:8px 12px;background:rgba(12,20,42,.75);border-top:2px solid var(--sc,var(--cyan));clip-path:polygon(0 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.ccm-sheet .ccs-stat span{display:block;font-size:12px;color:var(--dim);letter-spacing:.08em}
.ccm-sheet .ccs-stat b{font:700 26px/1.15 var(--en);color:#fff}
.ccm-sheet .ccs-stat small{font-size:14px;color:var(--dim);margin-left:2px}
.ccm-sheet .ccs-warn{padding:8px 12px;margin:6px 0;background:rgba(120,20,30,.45);border-left:3px solid var(--red);color:#ffb0a8;font-weight:700}
.ccm-sheet .ccs-item{border-left-color:var(--sc,var(--gold))}
.ccm-sheet .ccs-item.got{opacity:.55}
#g-screen:has(.ccm) .sm-box.ccm-sheet.narrow{width:520px}   /* 商店：緊湊 */
.ccm-sheet .shop-t{width:96px;height:96px}.ccm-sheet .shop-t .ccs-ico{width:42px;height:42px;border:0;background:none}.ccm-sheet .shop-t span{max-width:88px;font-size:12px}
.ccm-sheet .shop-t.got{opacity:.45}.ccm-sheet .cpv-t b.tag.pr{right:6px;top:4px;font:700 13px var(--en);color:var(--gold)}
.ccm-sheet .cpv-det .hd .ccs-ico{width:40px;height:40px}
.ccm-sheet .ccs-ico{position:relative;display:grid;place-items:center;width:46px;height:46px;background:rgba(10,16,34,.9);border:1px solid var(--c);clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}
.ccm-sheet .ccs-ico svg{width:28px;height:28px;fill:none;stroke:var(--c);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.ccm-sheet .ccs-ico svg.m{position:absolute;right:2px;bottom:2px;width:18px;height:18px;stroke:#fff;stroke-width:1.6;background:rgba(10,16,34,.95);border-radius:2px}
.ccm-sheet .ccs-item{align-items:center}
.ccm-sheet .ccs-tag{display:inline-block;padding:0 6px;font-size:11px;font-weight:700;color:#1a1200;background:var(--gold);transform:skewX(-12deg)}
.ccm-sheet .cc-yq .cc-lv{font-size:12px}
/* 小隊總覽 */
.ccm-sheet .ccs-sq{padding:12px 14px;margin:10px 0;background:rgba(10,16,34,.65);border-left:3px solid var(--c,var(--own))}
.ccm-sheet .ccs-sq .h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.ccm-sheet .ccs-sq .h b{font:900 18px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:var(--c,var(--own))}
.ccm-sheet .ccs-sq .h span{font-size:13px;color:var(--dim)}
.ccm-sheet .ccs-sq .h .act{margin-left:auto;display:flex;gap:6px}
.ccm-sheet .ccs-row{display:grid;grid-template-columns:150px 1fr 70px;gap:12px;align-items:center;padding:6px 10px;margin-top:4px;background:rgba(18,28,54,.8);cursor:pointer}
.ccm-sheet .ccs-row:hover{background:rgba(30,50,90,.9)}
.ccm-sheet .ccs-row .n{font-weight:700;white-space:nowrap}
.ccm-sheet .ccs-row .v{text-align:right;font:700 14px var(--en);color:var(--dim)}
`;
let ccsLast = 0;
// 斜放面板：sc＝頂條、右邊條的顏色
function ccmSheet(html, cls, sc) {
  if (CC.drw && typeof ccdClose === 'function') ccdClose();   // 右側同一個位置：任務／紀錄面板先收起
  const now = performance.now(), still = now - ccsLast < 4000 && !!document.querySelector('.sm-box.ccm-sheet'); ccsLast = now;
  const d = smuModal(html, `ccm-sheet ${cls || ''}${still ? ' still' : ''}`);
  const b = d.querySelector('.sm-box'); b.style.setProperty('--k', ccmK()); if (sc) b.style.setProperty('--sc', sc);
  if (!b.classList.contains('cr-side') && typeof ccdRefit === 'function') { ccdRefit(); setTimeout(() => { if (d.isConnected) ccdRefit(); }, 450); }   // 星圖往左縮、星系卡片讓開（滑進來的動畫結束再排一次）
  return d;
}
// 小隊總覽（停泊大廳的「小隊」）：你的每個小隊、在哪裡、預定動向、每艘船；點船看資料
function ccSquadsView() {
  const S = CC.S, L = ccOwn(S);
  const row = (q, c, k) => `<div class="ccs-row" data-ship="${q.id}:${k}" title="看這艘船的等級與模組"><span class="n">${ccShipNm(c)}</span>${ccShipBars(c)}<span class="v">船體 ${Math.round(c.hp * 100)}%</span></div>`;
  ccmSheet(`<h3>小隊<span class="en">SQUADS ・ ${L.length}／${ccSlots(S)}</span></h3>
    <div class="ccs-note">指揮權 ${ccOwnCount(S)}／${ccSlots(S)} 隊・每隊最多 ${CC_RULE.maxShips} 艘。點船看等級、模組與改裝；同一個星系的小隊之間可以換船、分隊。</div>
    ${L.map((q) => { const s = S.sys[q.sys], me = q.id === S.pl.sq, n = L.filter((o) => o.sys === q.sys).length;
      return `<div class="ccs-sq" style="--c:${me ? 'var(--own)' : 'var(--ally)'}"><div class="h"><b>${me ? '★ ' : ''}${smuEsc(q.name)}</b><span>${q.ships.length} 艘・在 ${smuEsc(s.name)}${q.task ? '・派出執行任務' : q.to != null ? `・預定 → ${smuEsc(S.sys[q.to].name)}` : ''}${me ? '・親自指揮' : ''}</span>
        <span class="act"><button type="button" class="g-btn" data-see="${q.id}">在星圖上看</button>${n > 1 || ccOwnCount(S) < ccSlots(S) ? `<button type="button" class="g-btn" data-swap="${q.id}">換船／分隊</button>` : ''}</span></div>
        ${q.ships.map((c, k) => row(q, c, k)).join('')}${ccThreat(S, q)}</div>`; }).join('')}
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`, '', 'var(--own)');
  gEl('cc-close').onclick = smuCloseModal;
  document.querySelectorAll('.ccm-sheet [data-ship]').forEach((b) => (b.onclick = () => { const [qi, k] = b.dataset.ship.split(':').map(Number); ccShipView(ccSqById(qi), k); }));
  document.querySelectorAll('.ccm-sheet [data-see]').forEach((b) => (b.onclick = () => { const q = ccSqById(+b.dataset.see); smuCloseModal(); CC.cur = q.id; CC.sel = q.sys; ccCard(); }));
  document.querySelectorAll('.ccm-sheet [data-swap]').forEach((b) => (b.onclick = () => ccSwapView(ccSqById(+b.dataset.swap))));
}
Object.assign(window.__cap || (window.__cap = {}), { ccSquadsView, ccShipView, ccSwapView });
