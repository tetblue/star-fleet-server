// ═══════════════════ 艦長生涯：大廳的勢力、說明、資金面板（2026-11-21）═══════════════════
// 使用者：大廳的按鈕不要跳到星圖。這三個以前只是打開星圖（勢力資訊只在星圖頂端一行、說明＝星圖圖例、資金沒有頁面），
// 現在各有一個右側的面板（ccmSheet），從大廳打開時疊在大廳上（caplobby.js 的 cclHost）。
const CCF_CSS = `
.ccm-sheet .ccf-row{display:grid;grid-template-columns:150px 1fr;gap:6px 14px;align-items:center;padding:10px 12px;margin:6px 0;background:rgba(12,20,42,.55);border-left:3px solid var(--c)}
.ccm-sheet .ccf-nm{font-size:16px;font-weight:700;color:#fff;display:flex;flex-direction:column;gap:2px}
.ccm-sheet .ccf-nm small{font-size:12px;font-weight:400;color:var(--c)}
.ccm-sheet .ccf-bars{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--dim)}
.ccm-sheet .ccf-bar{display:grid;grid-template-columns:64px 1fr 36px;gap:8px;align-items:center}
.ccm-sheet .ccf-bar>i{height:8px;background:rgba(255,255,255,.08);position:relative;overflow:hidden}
.ccm-sheet .ccf-bar>i>b{position:absolute;inset:0 auto 0 0;background:var(--bc)}
.ccm-sheet .ccf-bar>span{text-align:right;color:#fff;font-family:'Rajdhani',monospace}
.ccm-sheet .ccf-sys{display:flex;flex-wrap:wrap;gap:2px}
.ccm-sheet .ccf-sys i{width:9px;height:9px;background:var(--c);opacity:.85}
.ccm-sheet .ccf-g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
.ccm-sheet .ccf-g>div{padding:9px 12px;background:rgba(12,20,42,.55);border-left:2px solid var(--c,var(--cyan));font-size:13px;line-height:1.55;color:var(--dim)}
.ccm-sheet .ccf-g>div b{display:block;color:#fff;font-size:14px;margin-bottom:2px}
.ccm-sheet .ccf-leg>div{font-size:13px;color:var(--dim);line-height:1.6;display:flex;gap:6px;align-items:baseline}
.ccm-sheet .ccf-leg>div>i{width:10px;height:10px;flex:none}
.ccm-sheet .ccf-flow{display:flex;height:26px;margin:10px 0 4px;gap:2px}
.ccm-sheet .ccf-flow>i{background:var(--c);min-width:3px;position:relative}
.ccm-sheet .ccf-flow>i>span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#06101e;font-weight:700;white-space:nowrap;overflow:hidden}
.ccm-sheet .ccf-kv{display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;font-size:13px;align-items:center;margin:6px 0}
.ccm-sheet .ccf-kv>i{width:10px;height:10px;background:var(--c)}
.ccm-sheet .ccf-kv>b{text-align:right;font-family:'Rajdhani',monospace;font-size:15px}
.ccm-sheet .ccf-big{display:flex;align-items:baseline;gap:10px;margin:4px 0 2px}
.ccm-sheet .ccf-big b{font-size:34px;color:#ffc24a;font-family:'Rajdhani',monospace}
.ccm-sheet .ccf-log{font-size:12px;color:var(--dim);line-height:1.7;max-height:180px;overflow:auto}
`;
function ccfCss() { ccvCss(); if (!gEl('ccf-css')) { const st = document.createElement('style'); st.id = 'ccf-css'; st.textContent = CCF_CSS; document.head.appendChild(st); } }
const ccfBar = (k, v, c, tip) => `<div class="ccf-bar" title="${tip}"><span style="text-align:left;color:var(--dim);font-family:inherit">${k}</span><i><b style="width:${Math.round(v)}%;--bc:${c}"></b></i><span>${Math.round(v)}</span></div>`;

// ───── 勢力：各勢力跟你的關係、聲望、好感、已知的星系 ─────
function ccFacView() {
  ccfCss();
  const S = CC.S, fame = S.fame || [50, 50, 50, 50];
  const rows = [S.fac, ...[SM_A, SM_E, SM_P, SM_N].filter((f) => f !== S.fac)].map((f) => {
    const col = ccFacCol(S, f), n = S.sys.filter((s) => ccSee(S, s).owner === f).length, rel = ccFacRelName(S, f);
    const bars = [
      f === SM_N ? '' : ccfBar('聲望', fame[f], '#ffd36a', '佔領、交戰、特戰的成敗會改變；影響地面投降的評分'),
      ccfBar('對你好感', ccFavOf(S, f), col, f === SM_N ? '中立好感度：影響商會貿易所的價格、能不能在中立星系蓋建築' : '影響這個勢力商店的價格；任務失敗會下降'),
    ].join('');
    return `<div class="ccf-row" style="--c:${col}"><div class="ccf-nm">${SM_FAC[f].name}<small>${rel}・已知 ${n} 個星系</small></div>
      <div class="ccf-bars">${bars}<div class="ccf-sys" title="已知擁有的星系（看不到的星系照最後的情報）">${'<i></i>'.repeat(n)}</div></div></div>`;
  }).join('');
  ccmSheet(`<h3>勢力<span class="en">FACTIONS ・ ${SM_FAC[S.fac].name}</span></h3>${rows}
    <div class="ccs-note">顏色＝跟你的關係：藍＝你的陣營、紅＝敵對、黃＝中立／停戰。聲望影響地面投降；好感影響商店價格。</div>
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`, 'narrow', 'var(--cyan)');
  gEl('cc-close').onclick = smuCloseModal;
}

// ───── 說明：玩法重點＋星圖圖例 ─────
const CCF_HELP = [
  ['一週一回合', '在星圖下令（移動、派任務、建設），按「結束這一週」才推進。整備、研發、巡航都不耗時間。', 'var(--cyan)'],
  ['親自指揮的小隊', '每週可以親自打一場；其他戰鬥照雙方實力計算。', 'var(--own)'],
  ['任務與戰功', '任務給資金、戰功。戰功夠了會有升遷考核，升階解鎖更多小隊與船型。', 'var(--gold)'],
  ['佔領星系', '先打下軌道防禦，再圍城或地面突襲讓地面投降。', '#ff8a8a'],
  ['維修／補給', '在自己勢力的船塢最便宜；不在船塢就現地維修，貴 1.5 倍。', '#7fd4ff'],
  ['研發與商店', '研究點數用在研發樹；商店可以買藍圖、研究資料、經驗。', 'var(--violet)'],
];
function ccHelpView() {
  ccfCss();
  const S = CC.S;
  const tips = CCF_HELP.map(([t, d, c]) => `<div style="--c:${c}"><b>${t}</b>${d}</div>`).join('');
  ccmSheet(`<h3>說明<span class="en">GUIDE</span></h3><div class="ccf-g">${tips}</div>
    <h4 style="margin:14px 0 6px;color:#fff;font-size:14px">星圖圖例</h4><div class="ccf-leg">${ccLegendItems(S)}</div>
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`, '', 'var(--cyan)');
  gEl('cc-close').onclick = smuCloseModal;
}
// 星圖的圖例（星圖左下角的「圖例」也用這份）
function ccLegendItems(S) {
  return `${['own', 'ally', 'enemy', 'neutral'].map((k) => `<div><i style="background:${SMU_REL[k].col}"></i>${k === 'own' ? '你的小隊（★＋光圈＝親自指揮，白框＝選中）' : SMU_REL[k].name}</div>`).join('')}<div>箭頭＝一個小隊：越大船越多（1～5 艘）；停在星系下方，閃爍且在航道上＝這週要移動</div><div class="g-dim">星系的顏色＝擁有者跟你的關係：藍＝你的陣營、紅＝敵對、黃＝中立／停戰</div><div>! ＝ 你的小隊下週會被進攻</div><div>◆ 軌道防禦・⚓ 維修船塢・✚ 補給站・$ 商店（貿易站、黑市、商會貿易所）・白圈＝首都</div>${cpNzShow(S) ? '<div><span style="color:#ffd23f">◇</span> 星際商會的據點・<span style="color:#ffd23f">◆</span> 有商船隊（中立好感度 ' + CP_RULE.nzMap + ' 以上才標）</div>' : ''}<div>虛線圈：圍城中・⚔ 這週會交戰</div><div>箭頭：看得到的預定動向（你的小隊周圍、偵察過的星系）</div><div>藍色虛線大圈：偵察中・亂＝指揮中斷</div><div class="g-dim">點星系看詳情；點相鄰的星系下令移動</div>`;
}

// ───── 資金：每週的收入、支出（照上一週的結算）、最近的進出 ─────
function ccMoneyView() {
  ccfCss();
  const S = CC.S, I = S.pl.inc || {}, sal = CC_RULE.salary;
  const L = [
    { k: '薪餉', v: sal, c: '#3fdf8f', tip: '每週固定' },
    { k: '分紅', v: I.div || 0, c: '#ffc24a', tip: '你投資過的工業區、港口（Lv2 以上）分到的星系收入' },
    { k: '商行', v: I.pv || 0, c: '#ffd36a', tip: '你自己的商行收入（已扣稅）' },
    { k: '建築維護', v: -(I.up || 0) || 0, c: '#ff6a6a', tip: '你自己的建築每週的維護費' },
  ];
  const inc = L.filter((x) => x.v > 0), tot = inc.reduce((a, x) => a + x.v, 0) + (I.up || 0) || 1, net = L.reduce((a, x) => a + x.v, 0);
  const flow = L.filter((x) => x.v).map((x) => `<i style="--c:${x.c};flex:${Math.abs(x.v) / tot}" title="${x.k} ${x.v > 0 ? '+' : ''}${x.v}"><span>${x.k}</span></i>`).join('');
  const kv = L.map((x) => `<i style="--c:${x.c}"></i><span title="${x.tip}">${x.k}<small class="g-dim" style="margin-left:6px">${x.tip}</small></span><b style="color:${x.v < 0 ? '#ff8a8a' : x.v ? '#fff' : 'var(--mute)'}">${x.v > 0 ? '+' : ''}${fmtN(x.v)}</b>`).join('');
  const open = S.missions.filter((M) => M.state === 'open'), mis = open.reduce((a, M) => a + M.reward.money, 0);
  const log = S.log.filter((x) => x.turn >= S.turn - 2 && /資金/.test(String(x.t))).slice(-12).reverse().map((x) => `<div>【第 ${x.turn} 週】${smuEsc(String(x.t).replace(/<[^>]+>/g, ''))}</div>`).join('');
  ccmSheet(`<h3>資金<span class="en">FUNDS</span></h3>
    <div class="ccf-big"><b>${fmtN(Math.round(S.pl.money))}</b><span class="g-dim">每週淨收入 <b style="font-size:16px;color:${net < 0 ? '#ff8a8a' : '#3fdf8f'}">${net >= 0 ? '+' : ''}${fmtN(net)}</b></span></div>
    <div class="ccf-flow">${flow}</div><div class="ccf-kv">${kv}</div>
    <div class="ccs-note" style="border-left-color:var(--gold)">其他收入：進行中的任務報酬共 <b style="color:var(--gold)">${fmtN(mis)}</b>（${open.length} 個）・佔領星系 +300・商店、船塢、維修、建設要花錢。</div>
    ${log ? `<h4 style="margin:12px 0 4px;color:#fff;font-size:14px">最近的進出</h4><div class="ccf-log">${log}</div>` : ''}
    <div class="sm-btns"><button class="g-btn primary" id="cc-close">關閉</button></div>`, 'narrow', 'var(--gold)');
  gEl('cc-close').onclick = smuCloseModal;
}
Object.assign(window.__cap || (window.__cap = {}), { ccFacView, ccHelpView, ccMoneyView });
