// ═══════════════════════ 艦長生涯：星圖的外觀（2026-11-18，照 dev/ui-mockups/starmap.html）═══════════════════════
// 版面：左上標題、右上資源／關係／工具、左下小隊面板、右下結束這一週＋圖例，星系卡片浮在星系旁邊。
// 只換外觀：命令、按鈕 id、資料都還是 capcareer_ui.js 的（ccRender／ccDock／ccCard／ccDraw）。
// 樣式全部掛在 .ccm 底下（星海生涯共用的 SMU_CSS 不受影響）；生涯的對話框（sm-modal）也一起換成同一套外框。
const CCM_CSS = `
.ccm{--cyan:#3cc8ff;--own:#3fdf8f;--ally:#5aa8ff;--red:#ff4d5e;--yellow:#f3e94b;--gold:#ffc24a;--violet:#a97bff;--line:rgba(90,200,255,.32);--line2:rgba(150,190,240,.18);--text:#eef3ff;--dim:#8fa3c7;--mute:#5d6f92;
  --jp:'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif;--en:Rajdhani,Bahnschrift,'Segoe UI',sans-serif;font-family:var(--jp);color:var(--text);background:#03050b;user-select:none}
.ccm .sm-map{position:absolute;inset:0}
.ccm button{font-family:inherit}
.ccm .ccm-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 55%,transparent 55%,rgba(2,3,10,.72) 100%),linear-gradient(180deg,rgba(3,5,12,.8),transparent 190px)}
.ccm .ccm-cn{position:absolute;width:56px;height:56px;border:0 solid rgba(90,200,255,.5);pointer-events:none}
.ccm .cn1{left:8px;top:8px;border-left-width:2px;border-top-width:2px}.ccm .cn2{right:8px;top:8px;border-right-width:2px;border-top-width:2px}
.ccm .cn3{left:8px;bottom:8px;border-left-width:2px;border-bottom-width:2px}.ccm .cn4{right:8px;bottom:8px;border-right-width:2px;border-bottom-width:2px}
.ccm .ccm-z{position:absolute;zoom:var(--k,1)}
.ccm .en{font-family:var(--en)}
/* 標題 */
.ccm-head{left:30px;top:24px;display:flex;align-items:center;gap:20px}
.ccm-back{position:relative;width:66px;height:74px;flex:none;cursor:pointer;border:0;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:linear-gradient(160deg,rgba(80,200,255,.75),rgba(40,90,170,.35))}
.ccm-back::before{content:"";position:absolute;inset:2px;clip-path:inherit;background:linear-gradient(160deg,#18244a,#0b1124 70%)}
.ccm-back svg{position:absolute;left:50%;top:50%;width:28px;height:28px;transform:translate(-50%,-50%);stroke:#e8f2ff;fill:none;stroke-width:2}
.ccm-back:hover{background:linear-gradient(160deg,#7fe0ff,#1f8fff)}
.ccm-head .ent{display:block;font:700 12px var(--en);letter-spacing:.3em;color:var(--cyan)}
.ccm-head h1{margin:0;font:900 40px/1.1 var(--jp);letter-spacing:.14em;white-space:nowrap;text-shadow:0 3px 12px rgba(0,0,0,.6)}
.ccm-head .crumb{display:block;font:500 14px var(--jp);color:var(--dim);letter-spacing:.06em;margin-top:2px;white-space:nowrap}
.ccm-head .crumb b{color:var(--text)}
/* 資源 */
.ccm-res{right:40px;top:28px;display:flex;gap:12px}
.ccm-ri{position:relative;display:flex;align-items:center;gap:9px;height:44px;padding:0 18px 0 16px;white-space:nowrap;background:linear-gradient(90deg,rgba(8,12,28,.92),rgba(14,22,46,.82));clip-path:polygon(5% 0,100% 0,95% 100%,0 100%)}
.ccm-ri::after{content:"";position:absolute;left:0;right:6px;bottom:0;height:2px;background:var(--c)}
.ccm-ri svg{width:21px;height:21px;flex:none;stroke:var(--c);fill:none;stroke-width:1.8}
.ccm-ri .k{font:500 12px var(--jp);color:var(--dim)}
.ccm-ri b{font:700 22px var(--en);letter-spacing:.04em}
/* 關係 */
.ccm-rel{right:40px;top:84px;display:flex;gap:12px;align-items:center;font:500 13px var(--jp);color:var(--dim);white-space:nowrap}
.ccm-rel .it{display:flex;align-items:center;gap:6px}
.ccm-rel .pie{width:20px;height:20px;border-radius:50%;background:conic-gradient(var(--c) calc(var(--v)*1%),rgba(255,255,255,.12) 0);border:1px solid var(--c)}
.ccm-rel .dot{width:10px;height:10px;border-radius:50%;background:var(--c)}
.ccm-rel b{font:700 16px var(--en);color:var(--text)}
.ccm-rel .sep{width:1px;height:16px;background:var(--line2)}
/* 工具列 */
.ccm-tools{right:40px;top:120px;display:flex;gap:8px}
.ccm-tb{position:relative;display:flex;align-items:center;gap:8px;height:38px;padding:0 16px;cursor:pointer;color:var(--text);background:rgba(10,16,36,.86);border:1px solid rgba(120,170,230,.25);font:700 15px var(--jp);letter-spacing:.08em;white-space:nowrap;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.ccm-tb:hover{border-color:var(--cyan);background:rgba(30,50,90,.92)}
.ccm-tb svg{width:18px;height:18px;stroke:var(--cyan);fill:none;stroke-width:1.8}
.ccm-tb .mono{font:700 16px var(--en);color:var(--cyan)}
.ccm-tb kbd{font:700 11px var(--en);border:1px solid var(--dim);padding:0 5px;color:var(--dim)}
.ccm-tb .nb{display:inline-block;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--yellow);color:#14130a;font:700 13px/20px var(--en);text-align:center;box-shadow:0 0 8px rgba(243,233,75,.6)}
.ccm-tb .busy{color:var(--violet);font:700 12px var(--jp)}
.ccm-tb.q{color:var(--dim)}.ccm-tb.q svg{stroke:var(--dim)}
/* 結束這一週 */
.ccm-end{right:30px;bottom:30px;width:400px;height:76px;display:flex;align-items:center;gap:16px;padding:0 26px 0 36px;cursor:pointer;color:var(--text);text-align:left;
  background:linear-gradient(100deg,rgba(14,22,44,.94),rgba(20,32,62,.94));border:1px solid rgba(160,200,255,.4);clip-path:polygon(6% 0,100% 0,100% 100%,0 100%);transition:background .2s}
.ccm-end:hover{background:linear-gradient(100deg,rgba(30,50,90,.95),rgba(40,70,120,.95));border-color:var(--cyan)}
.ccm-end b{display:block;font:900 24px var(--jp);letter-spacing:.12em;white-space:nowrap}
.ccm-end small{display:block;font:700 11px var(--en);letter-spacing:.24em;color:var(--dim)}
.ccm-end .w{margin-left:auto;padding:4px 10px;background:var(--red);font:700 16px var(--en);white-space:nowrap}
.ccm-end .arrow{margin-left:auto;font:700 26px var(--en);color:var(--cyan)}.ccm-end .w + .arrow{margin-left:0}
.ccm-end:disabled{opacity:.45;cursor:not-allowed}
/* 圖例 */
.ccm-leg{right:30px;bottom:120px;width:400px;max-height:calc((100vh - 330px) / var(--k,1));overflow:auto;padding:10px 18px;background:rgba(8,12,26,.84);border:1px solid var(--line2);font:500 13px/1.65 var(--jp);color:#cfdaf0;cursor:pointer;scrollbar-width:thin}
.ccm-leg h5{margin:0;font:700 12px var(--en);letter-spacing:.24em;color:var(--dim)}
.ccm-leg i{display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:-1px;border-radius:50%}
.ccm-leg .g-dim{color:var(--mute)}
/* 小隊面板（左下）*/
.ccm .sm-dock{left:30px;right:auto;bottom:30px;display:block;zoom:var(--k,1)}
.ccm .cc-dock{position:relative;width:560px;max-height:calc((100vh - 230px) / var(--k,1));overflow:auto;scrollbar-width:thin;padding:0 22px 14px;border:1px solid var(--line2);border-radius:0;
  background:linear-gradient(165deg,rgba(14,22,44,.92),rgba(10,16,32,.86));clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px))}
.ccm .cc-dock::before{content:"";position:absolute;left:0;top:0;width:120px;height:3px;background:var(--own)}
.ccm .cc-dock .dh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:12px;font:900 18px var(--jp);color:var(--own);letter-spacing:.06em;white-space:nowrap}
.ccm .cc-dock .dh small{font:500 13px var(--jp);color:var(--dim);letter-spacing:0}
.ccm .cc-dock .df{margin-top:10px;font:500 12px/1.6 var(--jp);color:var(--mute)}
.ccm .cc-tabs{display:flex;flex-wrap:wrap;gap:2px;margin:0 -8px 0;border-bottom:1px solid var(--line2)}
.ccm .cc-tab{position:relative;background:none;border:0;border-radius:0;padding:12px 14px 9px;font:700 14px var(--jp);letter-spacing:.06em;color:var(--dim);cursor:pointer}
.ccm .cc-tab:hover{color:var(--text)}
.ccm .cc-tab.on{color:var(--text);background:none}.ccm .cc-tab.on::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:3px;background:var(--own)}
.ccm .cc-ship{grid-template-columns:170px 1fr;gap:4px 12px;margin:6px 0;font:700 14px var(--jp)}
.ccm .cc-ship b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ccm .cc-ship > div{display:grid;gap:2px}
.ccm .cc-bar{height:4px;background:rgba(255,255,255,.12);border-radius:0}
.ccm .cc-shipnm{text-decoration:none;border-bottom:1px dotted rgba(63,223,143,.55)}
.ccm .cc-shipnm:hover{color:var(--own)}
.ccm .cc-lv{border-radius:0;font-family:var(--en);font-size:11px}
.ccm .g-btn{height:34px;min-height:0;padding:0 18px;border-radius:0;font:700 14px var(--jp);letter-spacing:.08em;color:var(--text);background:rgba(18,28,58,.92);border:1px solid rgba(140,190,240,.35);clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.ccm .g-btn:hover:not(:disabled){background:rgba(36,60,110,.95);border-color:var(--cyan)}
.ccm .g-btn:disabled{opacity:.4}
.ccm .g-dim{color:var(--dim)}
.ccm .cc-thr{margin:8px 0;padding:8px 12px;background:rgba(80,20,40,.45);border:0;border-left:3px solid var(--red);border-radius:0;font:500 13px/1.6 var(--jp)}
.ccm .cc-thr > b:first-child{color:#ff8a96}
/* 星系卡片 */
.ccm .sm-card{width:440px;padding:0;border:1px solid var(--line2);border-radius:0;box-shadow:0 10px 40px rgba(0,0,0,.6);scrollbar-width:thin;scrollbar-color:rgba(90,200,255,.35) transparent;
  background:linear-gradient(165deg,rgba(14,22,44,.97),rgba(9,14,30,.96));clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px))}
.ccm .sm-card::before{content:"";position:sticky;display:block;top:0;left:0;width:120px;height:3px;background:var(--pc,var(--cyan));z-index:1}
.ccm .sm-card .ccm-ch{display:flex;align-items:baseline;gap:12px;padding:14px 22px 10px;border-bottom:1px solid var(--line2)}
.ccm .sm-card .ccm-ch h3{margin:0;font:900 24px var(--jp);letter-spacing:.12em;white-space:nowrap}
.ccm .sm-card .ccm-ch h3 i{display:inline-block;width:13px;height:13px;border-radius:50%;margin-right:10px;vertical-align:2px;background:var(--pc)}
.ccm .sm-card .ccm-ch .en{font:700 11px var(--en);letter-spacing:.26em;color:var(--dim)}
.ccm .sm-card .ccm-cb{padding:10px 22px 18px}
.ccm .sm-x{right:14px;top:12px;width:30px;height:30px;font:700 20px var(--en);color:var(--dim);z-index:2}.ccm .sm-x:hover{color:var(--red)}
.ccm .sm-kv{gap:5px 16px;font:500 14px/1.5 var(--jp)}.ccm .sm-kv dt{color:var(--dim);white-space:nowrap}
.ccm .sm-card h4{margin:14px 0 4px;font:700 12px var(--jp);letter-spacing:.14em;color:var(--dim)}
.ccm .cc-oddsbox{margin:12px 0 4px;padding:10px 14px;background:rgba(80,20,40,.35);border-left:3px solid var(--red)}
.ccm .cc-oddsbox h4{margin:0 0 2px;font:700 15px var(--jp);letter-spacing:.04em;color:#ffb0b8}
.ccm .cc-oddsbox .cc-odds{font:900 34px/1.1 var(--en)}
.ccm .cc-sq{margin:4px 0;padding:6px 10px;border:0;border-left:3px solid var(--c,#7d8794);border-radius:0;background:rgba(12,20,42,.7)}
.ccm .cc-sq.pl{border-color:var(--own)}.ccm .cc-sq[data-sq]:hover{background:rgba(28,44,84,.85)}
.ccm .cc-sq.cur{outline:1px solid var(--own)}
.ccm .cc-for{margin:12px 0 4px;font:500 12px var(--jp);color:var(--dim)}.ccm .cc-for b{color:var(--own)}
/* 命令按鈕（smuActs）：一列一個 */
.ccm .sm-acts{grid-template-columns:1fr;gap:6px;margin-top:8px}
.ccm .sm-pc{display:block;border:0;border-left:3px solid var(--line);border-radius:0;padding:9px 14px;background:rgba(14,24,50,.9);transition:background .15s}
.ccm .sm-pc:hover:not(:disabled){background:rgba(30,60,110,.95);border-color:var(--cyan)}
.ccm .sm-pc b{display:block;font:700 15px var(--jp);letter-spacing:.06em;padding:0}
.ccm .sm-pc .d,.ccm .sm-pc .k,.ccm .sm-pc .w{display:block;margin-top:2px;font:500 12px/1.5 var(--jp)}
.ccm .sm-pc.go{border-left-color:var(--cyan)}.ccm .sm-pc.go b{color:#9fe4ff}
.ccm .sm-pc:disabled{opacity:.45}
@media (max-width:760px){.ccm .sm-card{width:auto}}
/* 生涯的對話框：同一套外框（內容之後再一個個換） */
#g-screen:has(.ccm) .sm-modal{background:rgba(2,4,12,.66);backdrop-filter:blur(2px)}
#g-screen:has(.ccm) .sm-box{position:relative;border-radius:0;border:1px solid rgba(90,200,255,.32);padding:26px 32px;color:#eef3ff;font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;
  background:linear-gradient(160deg,#111b36,#0a1024);clip-path:polygon(0 0,calc(100% - 26px) 0,100% 26px,100% 100%,26px 100%,0 calc(100% - 26px));scrollbar-width:thin;scrollbar-color:rgba(90,200,255,.35) transparent}
#g-screen:has(.ccm) .sm-box::before{content:"";position:absolute;left:0;top:0;width:140px;height:3px;background:#3cc8ff}
#g-screen:has(.ccm) .sm-box h3{font:900 24px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.1em;margin-bottom:12px}
#g-screen:has(.ccm) .sm-box h4{letter-spacing:.1em;color:#8fa3c7}
#g-screen:has(.ccm) .sm-box .g-btn{border-radius:0;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);padding:6px 20px;font-weight:700;letter-spacing:.08em}
#g-screen:has(.ccm) .sm-box .g-btn.primary{background:linear-gradient(100deg,#29b6ff,#2f86ff);color:#06122a;border-color:transparent}
#g-screen:has(.ccm) .sm-box .sm-pc{border-radius:0;background:rgba(14,24,50,.9);border:1px solid rgba(150,190,240,.18);border-left:3px solid rgba(90,200,255,.32)}
#g-screen:has(.ccm) .sm-box .sm-pc:hover:not(:disabled){background:rgba(30,60,110,.95);border-left-color:#3cc8ff}
#g-screen:has(.ccm) .sm-box .sm-pc.go{border-left-color:#3cc8ff}#g-screen:has(.ccm) .sm-box .sm-pc.go b{color:#9fe4ff}
#g-screen:has(.ccm) .sm-box .cc-sq{border-radius:0;border:0;border-left:3px solid #5d6f92;background:rgba(12,20,42,.7)}
/* 結束這一週前的警告：有小隊下週會被進攻 */
#g-screen:has(.ccm) .sm-box.ccm-warn{width:min(760px,94vw);border-color:rgba(255,77,94,.45);background:linear-gradient(165deg,rgba(40,12,24,.96),rgba(10,12,28,.96))}
#g-screen:has(.ccm) .sm-box.ccm-warn::before{background:#ff4d5e;width:180px}
.ccm-warn .wh{display:flex;align-items:baseline;gap:14px;margin-bottom:6px}
.ccm-warn .wh h3{margin:0!important;color:#ff8a96}
.ccm-warn .wh .en{font:700 12px Rajdhani,Bahnschrift,sans-serif;letter-spacing:.3em;color:#ff4d5e}
.ccm-warn .wp{color:#8fa3c7;font-size:14px;margin:0 0 14px}
.ccm-warn .wr{display:grid;grid-template-columns:1fr 120px;gap:4px 18px;align-items:center;padding:12px 16px;background:rgba(12,20,42,.75);border-left:3px solid #ff4d5e}
.ccm-warn .wr + .wr{margin-top:8px}
.ccm-warn .wr .n{font:900 18px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.06em}.ccm-warn .wr .n.me{color:#3fdf8f}
.ccm-warn .wr .n small{font:500 13px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#8fa3c7;margin-left:8px;letter-spacing:0}
.ccm-warn .wr .d{grid-column:1;font-size:13px;color:#c9d6ee;line-height:1.55}.ccm-warn .wr .d b{color:#ff8a96}
.ccm-warn .wr .o{grid-column:2;grid-row:1/span 2;text-align:right}
.ccm-warn .wr .o b{display:block;font:700 34px/1 Rajdhani,Bahnschrift,sans-serif}.ccm-warn .wr .o small{font-size:11px;color:#8fa3c7}
.ccm-warn .sm-acts{margin-top:16px}
`;
// 結束這一週前的警告（ccEndWeek）：每個會被進攻的小隊一列＝敵軍、勝率、最危險的船
function ccmWarnHtml(S, W) {
  const P = ccPl(S);
  const rows = W.map((q) => {
    const T = ccThreatD(S, q); if (!T) return '';
    let lo = -1; T.sv.forEach((v, k) => { if (lo < 0 || v < T.sv[lo]) lo = k; });
    const nf = T.A.reduce((a, x) => a + x.ships.length, 0), defs = T.s.owner === S.fac ? ccDefsAlive(T.s).length : 0;
    return `<div class="wr"><div class="n${q === P ? ' me' : ''}">${q === P ? '★ ' : ''}${smuEsc(q.name)}<small>駐守 ${T.s.name}</small></div>
      <div class="o"><b style="color:${ccOddCol(T.w)}">${Math.round(T.w * 100)}%</b><small>駐守的勝率</small></div>
      <div class="d">敵軍 <b>${T.A.map((x) => smuEsc(x.name)).join('、')}（${nf} 艘）</b>${T.D.length > 1 ? `・一起駐守 ${T.D.slice(1).map((x) => smuEsc(x.name)).join('、')}` : ''}${defs ? `・軌道防禦 ${defs} 座` : ''}
        ${lo >= 0 ? `<br>最危險：${CAP_HULLS[q.ships[lo].key].name} 存活率 <b style="color:${ccOddCol(T.sv[lo])}">${Math.round(T.sv[lo] * 100)}%</b>` : ''}</div></div>`;
  }).join('');
  return `<div class="wh"><h3>⚠ 下週敵軍來襲</h3><span class="en">INCOMING ・ WEEK ${S.turn + 1}</span></div>
    <p class="wp">這些小隊留在原地駐守，敵軍預定開進。結束這一週就會開戰，開戰後不能取消；要避開就回去移動小隊。</p>${rows}
    ${smuActs([{ id: 'cc-endgo', cls: 'go', name: '照樣結束這一週', desc: '這些小隊駐守迎戰' }, { id: 'cc-endback', name: '回去下令', desc: '打開星圖重新下命令（移動、進攻）' }], 200)}`;
}
const CCM_ICON = { back: '<path d="M15 5l-7 7 7 7"/>', quit: '<path d="M14 4h6v16h-6M4 12h11M9 7l-5 5 5 5"/>' };
// 介面縮放：以 1920×1080 為準，小視窗等比縮小（卡片不縮，它照星系的螢幕位置擺）
const ccmK = () => Math.max(0.55, Math.min(1, innerWidth / 1920, innerHeight / 1080));
function ccmFit() { const w = document.querySelector('.ccm'); if (w) w.style.setProperty('--k', ccmK()); }
// 星圖可用的範圍（避開標題、工具列）
// 底部留給小隊面板與結束這一週（面板量實際的高度，最多佔到 40%）
function ccmArea(W, H) {
  const k = ccmK(), top = 168 * k, d = gEl('cc-dock'), dh = d ? d.getBoundingClientRect().height : 0;
  const bot = Math.min(H * 0.4, Math.max(110 * k, dh) + 40 * k);
  return { x: 40, y: top, w: W - 80, h: H - top - bot };
}
// 下週會被進攻、還留在原地的你的小隊（結束這一週的 ⚠）
const ccmWarnN = (S) => S.fin ? 0 : S.sq.filter((q) => q.pl && q.ships.length && q.to == null && !q.task && ccThreatA(S, q, q.sys).length).length;
// 背景：星空（依大小快取）
let ccmBgC = null;
function ccmBg(g, W, H) {
  if (!ccmBgC || ccmBgC.width !== W || ccmBgC.height !== H) {
    const c = ccmBgC = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const gr = x.createRadialGradient(W * 0.55, H * 0.5, 0, W * 0.55, H * 0.5, Math.max(W, H) * 0.75); gr.addColorStop(0, '#0b1430'); gr.addColorStop(0.6, '#060a1a'); gr.addColorStop(1, '#03050b'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    let r = 7; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    for (const [cx, cy, rad, col] of [[0.25, 0.35, 0.35, '60,90,200'], [0.78, 0.62, 0.3, '150,60,170'], [0.55, 0.2, 0.22, '40,140,190']]) { const n = x.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, W * rad); n.addColorStop(0, `rgba(${col},.10)`); n.addColorStop(1, `rgba(${col},0)`); x.fillStyle = n; x.fillRect(0, 0, W, H); }
    for (let i = 0; i < (W * H) / 2600; i++) { const a = rnd(); x.fillStyle = `rgba(${200 + a * 55 | 0},${210 + a * 40 | 0},255,${0.15 + rnd() * 0.55})`; const s = rnd() < 0.06 ? 1.6 : 0.9; x.fillRect(rnd() * W, rnd() * H, s, s); }
  }
  g.drawImage(ccmBgC, 0, 0, W, H);
}
const CCM_FONT = (w, px) => `${w} ${px}px "Noto Sans TC","Microsoft JhengHei",sans-serif`;
