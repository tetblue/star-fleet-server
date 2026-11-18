// ═══════════════════════ 艦長生涯：交戰畫面（2026-11-18，照 dev/ui-mockups/engage.html）═══════════════════════
// 開戰前的評估：左＝我方、右＝敵方、中＝勝率與組成。只看不撤（2026-11-11 的規則不變：要撤退就在上一週移動）。
// 2026-11-18 改成戰場左側的斜放儀表板（cceTab／cceOpen，檔案最後）；全螢幕的 ccEngage 目前沒有地方呼叫，先留著（照 engage.html 做好的版面）。
const CCE_CSS = `
.cce{position:absolute;inset:0;overflow:hidden}
.cce canvas.bg{position:absolute;inset:0;width:100%;height:100%}
.cce .tint{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 40%,rgba(255,40,70,.16),transparent 60%),radial-gradient(ellipse at 50% 55%,transparent 50%,rgba(2,3,10,.8) 100%)}
.cce .stage{position:absolute;width:1920px;height:1080px;zoom:var(--k,1)}
.cce .en{font-family:var(--en)}
.cce .ent{animation:cceIn .5s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--d,0s) + var(--d0,0s))}
@keyframes cceIn{from{opacity:0;transform:translate(var(--dx,0),var(--dy,0))}}
.cce .hd{position:absolute;left:40px;top:30px}
.cce .hd .t{font:700 13px var(--en);letter-spacing:.32em;color:var(--red)}
.cce .hd h1{margin:2px 0 0;font:900 46px/1.1 var(--jp);letter-spacing:.14em;white-space:nowrap;text-shadow:0 3px 14px rgba(0,0,0,.6)}
.cce .hd .crumb{font:500 15px var(--jp);color:var(--dim);margin-top:4px;letter-spacing:.06em}.cce .hd .crumb b{color:var(--text)}
.cce .lead{position:absolute;left:50%;top:150px;translate:-50% 0;width:1100px;text-align:center;font:500 19px var(--jp);color:#dfe8fa;line-height:1.6}
.cce .lead b{color:#ff8a96}.cce .lead em{font-style:normal;color:var(--own);font-weight:700}
.cce .pn{position:absolute;top:236px;width:540px;height:600px;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(18,28,58,.92),rgba(8,13,30,.9));border:1px solid var(--line2);
  clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px))}
.cce .pn::before{content:"";position:absolute;left:0;top:0;width:120px;height:3px;background:var(--pc)}
.cce .mine{left:34px;--pc:var(--own);transform:perspective(1600px) rotateY(7deg);transform-origin:0 50%}
.cce .foe{right:34px;--pc:var(--red);border-color:rgba(255,77,94,.28);transform:perspective(1600px) rotateY(-7deg);transform-origin:100% 50%}
.cce .ph{display:flex;align-items:baseline;gap:12px;padding:20px 26px 10px;border-bottom:1px solid var(--line2);flex:none}
.cce .ph h2{margin:0;font:900 22px var(--jp);letter-spacing:.12em}
.cce .ph .en{font:700 11px var(--en);letter-spacing:.26em;color:var(--dim)}
.cce .ph .r{margin-left:auto;font:500 13px var(--jp);color:var(--dim);white-space:nowrap}
.cce .pb{padding:14px 26px 18px;overflow:auto;flex:1;scrollbar-width:thin;scrollbar-color:rgba(90,200,255,.35) transparent}
.cce .sqt{display:flex;align-items:center;gap:10px;margin:6px 0 10px;font:900 19px var(--jp);letter-spacing:.06em}
.cce .sqt small{font:500 13px var(--jp);color:var(--dim);letter-spacing:.04em}
.cce .sqt .ai{margin-left:auto;font:700 11px var(--en);letter-spacing:.2em;color:var(--ally);border:1px solid var(--ally);padding:0 6px}
.cce .ship{display:grid;grid-template-columns:150px 1fr 74px;gap:4px 14px;align-items:center;padding:9px 14px;background:rgba(12,20,42,.7);border-left:3px solid var(--sc,var(--own))}
.cce .ship + .ship{margin-top:6px}
.cce .foe .ship{--sc:var(--red);grid-template-columns:150px 1fr 54px}
.cce .ship .nm{font:700 17px var(--jp);white-space:nowrap}
.cce .ship .nm small{display:block;font:600 11px var(--en);letter-spacing:.16em;color:var(--dim)}
.cce .bars{display:grid;gap:4px}
.cce .bar{height:5px;background:rgba(255,255,255,.12);position:relative}.cce .bar i{position:absolute;left:0;top:0;bottom:0;background:var(--bc)}
.cce .sv{text-align:right}.cce .sv b{display:block;font:700 26px/1 var(--en)}.cce .sv small{font:500 11px var(--jp);color:var(--dim)}
.cce .mk{font:700 15px var(--en);color:var(--gold);text-align:right}
.cce .defs{margin-top:16px;padding-top:12px;border-top:1px solid var(--line2)}
.cce .lab{font:700 11px var(--en);letter-spacing:.2em;color:var(--dim)}
.cce .def{display:flex;align-items:center;gap:12px;font:500 15px var(--jp);margin-top:6px}
.cce .def .bar{flex:1}.cce .def b{font:700 15px var(--en);width:44px;text-align:right}
.cce .sub{margin-top:14px;font:500 13px var(--jp);color:var(--dim);line-height:1.5}.cce .sub b{color:var(--cyan)}
.cce .ctr{position:absolute;left:600px;top:236px;width:720px;height:580px}
.cce .ring{position:absolute;left:50%;top:0;translate:-50% 0;width:300px;height:300px}
.cce .ring svg{position:absolute;inset:0;transform:rotate(-90deg)}
.cce .ring .in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.cce .ring .odds{font:700 96px/1 var(--en)}.cce .ring .odds small{font-size:40px}
.cce .ring .vd{font:700 16px var(--jp);letter-spacing:.2em;margin-top:6px}
.cce .ring .ticks{position:absolute;inset:-14px;border-radius:50%;background:repeating-conic-gradient(rgba(150,200,255,.35) 0 .6deg,transparent .6deg 6deg);
  -webkit-mask:radial-gradient(circle,transparent 63%,#000 64%,#000 68%,transparent 69%);mask:radial-gradient(circle,transparent 63%,#000 64%,#000 68%,transparent 69%);animation:cceRot 40s linear infinite}
@keyframes cceRot{to{transform:rotate(360deg)}}
.cce .fx{position:absolute;left:40px;right:40px;top:330px}
.cce .fx .ttl{display:flex;justify-content:space-between;margin-bottom:8px;font:700 13px var(--jp);letter-spacing:.2em}
.cce .tug{display:grid;grid-template-columns:120px 1fr 120px;align-items:center;gap:12px;margin-top:10px}
.cce .tug .k{grid-column:2;grid-row:1;text-align:center;color:#dfe8fa;font:500 14px var(--jp);position:relative;z-index:1;text-shadow:0 0 4px #000}
.cce .tug .a{text-align:right;font:700 18px var(--en);color:var(--own)}.cce .tug .b{font:700 18px var(--en);color:#ff8a96}
.cce .tug .tr{grid-column:2;grid-row:1;height:22px;display:flex;background:rgba(255,255,255,.06);clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.cce .tug .tr i{display:block;height:100%}
.cce .tug .tr i:first-child{background:linear-gradient(90deg,rgba(63,223,143,.25),rgba(63,223,143,.7))}.cce .tug .tr i:last-child{background:linear-gradient(90deg,rgba(255,77,94,.7),rgba(255,77,94,.25))}
.cce .note{margin-top:16px;text-align:center;font:500 13px var(--jp);color:var(--mute);line-height:1.6}
.cce .go{position:absolute;left:600px;top:860px;width:720px;height:160px;border:0;padding:0;cursor:pointer;overflow:hidden;color:#fff;text-align:left;
  background:repeating-linear-gradient(-60deg,rgba(255,255,255,.07) 0 2px,transparent 2px 22px),linear-gradient(100deg,#ff5a6a,#d8263f 60%,#a01f4f);clip-path:polygon(22px 0,100% 0,100% calc(100% - 22px),calc(100% - 22px) 100%,0 100%,0 22px)}
.cce .go.calc{background:repeating-linear-gradient(-60deg,rgba(255,255,255,.07) 0 2px,transparent 2px 22px),linear-gradient(100deg,#29b6ff,#2f86ff 60%,#3a6cf0)}
.cce .go:hover{filter:brightness(1.12)}.cce .go:active{transform:scale(.985)}
.cce .go::after{content:"";position:absolute;top:-20%;bottom:-20%;width:110px;left:-200px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:cceShine 4.5s 2s infinite}
@keyframes cceShine{0%{left:-200px}30%,100%{left:120%}}
.cce .go .op{position:absolute;left:36px;top:26px;font:700 13px var(--en);letter-spacing:.24em;color:#ffe0e4}
.cce .go h3{position:absolute;left:32px;top:42px;margin:0;font:900 54px/1 var(--jp);letter-spacing:.14em;white-space:nowrap}
.cce .go .s{position:absolute;left:36px;bottom:20px;font:700 15px var(--jp);color:#ffe0e4;white-space:nowrap}
.cce .go.calc .op,.cce .go.calc .s{color:#0d2050}
.cce .go .kb{position:absolute;right:36px;top:26px;font:700 13px var(--en);letter-spacing:.14em;border:1px solid currentColor;padding:1px 8px;color:#ffe0e4}
.cce .go.calc .kb{color:#0d2050}
.cce .go .chev{position:absolute;right:40px;bottom:24px;display:flex}
.cce .go .chev i{width:14px;height:22px;background:#fff;clip-path:polygon(0 0,50% 0,100% 50%,50% 100%,0 100%,50% 50%);margin-left:-3px;animation:cceChev 1.2s infinite}
.cce .go.calc .chev i{background:#0d2050}
.cce .go .chev i:nth-child(2){animation-delay:.15s}.cce .go .chev i:nth-child(3){animation-delay:.3s}
@keyframes cceChev{0%,100%{opacity:.35}40%{opacity:1}}
.cce .info{position:absolute;top:880px;width:540px;font:500 14px var(--jp);color:var(--dim);line-height:1.65}
.cce .info.l{left:34px}.cce .info.r{right:34px;text-align:right}.cce .info b{color:var(--text)}.cce .info .w{color:#ff8a96}
/* 紅色警報（一開始的 1.3 秒） */
.cce .alert{position:absolute;left:0;right:0;top:50%;translate:0 -50%;height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(160,10,30,.85) 18%,rgba(160,10,30,.85) 82%,transparent);border-top:2px solid rgba(255,90,110,.8);border-bottom:2px solid rgba(255,90,110,.8);
  animation:cceAlert 1.5s ease-in both}
.cce .alert b{font:900 52px var(--jp);letter-spacing:.3em;color:#fff;text-shadow:0 0 18px rgba(255,60,80,.9)}
.cce .alert small{font:700 15px var(--en);letter-spacing:.5em;color:#ffd0d6;margin-top:4px}
@keyframes cceAlert{0%{opacity:0;transform:scaleY(.1)}10%{opacity:1;transform:none}22%{opacity:.55}30%{opacity:1}42%{opacity:.6}50%,78%{opacity:1}100%{opacity:0;transform:scaleY(1.4)}}
.cce .flash{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 160px 40px rgba(255,30,60,.55);animation:cceFlash 1.5s ease-out both}
@keyframes cceFlash{0%,30%,60%{opacity:1}15%,45%{opacity:.3}100%{opacity:0}}
`;
const cceBar = (v, c) => `<div class="bar" style="--bc:${c}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div>`;
const cceOddCol = (w) => w >= 0.6 ? 'var(--own)' : w >= 0.4 ? 'var(--yellow)' : 'var(--red)';
const cceDefNm = (t) => (CP_B[t] && CP_B[t].name) || '軌道防禦';
const cceFmt = (v) => v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1);
// 交戰畫面：S.pendB＝這場戰鬥；calc＝這週已經打過，用公式計算；go＝按下按鈕之後（進戰場或計算）
// 這場戰鬥的雙方與勝率（交戰畫面、戰場側邊的評估面板共用）
function cceData(S) {
  const B = S.pendB, s = S.sys[B.sys], P = ccPl(S), plA = B.att;
  const A = B.A.map(ccSqById), D = B.D.map(ccSqById);
  const mine = (plA ? A : D).filter((q) => q && q.ships.length), foe = (plA ? D : A).filter((q) => q && q.ships.length);
  mine.sort((a, b) => (b === P) - (a === P));
  const foeDefs = plA && B.owner === s.owner ? ccDefsAlive(s) : [], ownDefs = !plA && s.owner === S.fac ? ccDefsAlive(s) : [];
  // 勝率：進攻＝我方在前；迎擊＝我方的軌道防禦算在我方（ccOdds 的防禦在第二方，所以倒過來算）
  const O = plA ? ccOdds(S, mine, foe, foeDefs, 0) : ccOdds(S, foe, mine, ownDefs, 1);
  const win = plA ? O.win : 1 - O.win, sv = (plA ? O.surv[0] : O.surv[1]) || [];
  const fem = O.fem ? (plA ? O.fem : [O.fem[1], O.fem[0]]) : null;
  const from = [...new Set(foe.map((q) => S.sys[q.prev != null ? q.prev : q.sys]).filter((o) => o && o.id !== s.id).map((o) => o.name))];
  return { B, s, P, plA, mine, foe, foeDefs, ownDefs, win, sv, fem, from };
}
const cceNS = (L) => L.reduce((a, q) => a + q.ships.length, 0);
const cceMk = (c) => CAP_MK_NAME[Math.max(1, ...Object.values(c.mk || {}))];
function ccEngage(S, calc, go, view) {
  const { s, P, plA, mine, foe, foeDefs, ownDefs, win, sv, fem, from } = cceData(S), nS = cceNS;
  const col = cceOddCol(win), C = 2 * Math.PI * 130;
  const shipMk = (c) => { const m = Math.max(1, ...Object.values(c.mk || {})); return CAP_MK_NAME[m]; };
  const mineHtml = mine.map((q, qi) => { const ai = q !== P;
    return `<div class="sqt" style="color:${ai ? 'var(--ally)' : 'var(--own)'}">${ai ? '' : '★ '}${smuEsc(q.name)}<small>${ai ? `${q.ships.length} 艘` : '親自指揮'}</small>${ai ? '<span class="ai">AI</span>' : ''}</div>
      ${q.ships.map((c, k) => { const v = (sv[qi] || [])[k];
        return `<div class="ship"${ai ? ' style="--sc:var(--ally)"' : ''}><div class="nm">${CAP_HULLS[c.key].name}<small>Lv${c.lv || 1}・${shipMk(c)}</small></div>
          <div class="bars">${cceBar(c.hp, c.hp < 0.35 ? 'var(--red)' : 'var(--own)')}${cceBar(c.sh, 'var(--ally)')}${CAP_HULLS[c.key].msl ? cceBar(c.msl, 'var(--yellow)') : ''}</div>
          <div class="sv"><b style="color:${cceOddCol(v || 0)}">${v == null ? '—' : Math.round(v * 100) + '%'}</b><small>存活率</small></div></div>`; }).join('')}`; }).join('');
  const defsHtml = (L, c) => L.length ? `<div class="defs"><div class="lab">軌道防禦 ／ ORBITAL DEFENCE・${L.length} 座</div>
    ${L.map((d) => `<div class="def"><span style="width:110px">${cceDefNm(d.type)}</span>${cceBar(d.hp, c)}<b>${Math.round(d.hp * 100)}%</b></div>`).join('')}</div>` : '';
  const foeHtml = foe.map((q) => `<div class="sqt" style="color:#ff8a96">${smuEsc(q.name)}<small>${q.ships.length} 艘</small></div>
      ${q.ships.map((c) => `<div class="ship"><div class="nm">${CAP_HULLS[c.key].name}<small>${smuEsc(SM_FAC[q.fac] ? SM_FAC[q.fac].name : '')}</small></div>
        <div class="bars">${cceBar(c.hp, 'var(--red)')}${cceBar(c.sh, 'var(--ally)')}</div><div class="mk">${shipMk(c)}</div></div>`).join('')}`).join('') || '<div class="sub">沒有敵方小隊，只剩軌道防禦：摧毀全部就取得軌道。</div>';
  const parts = fem ? [['火力', fem[0].F, fem[1].F], ['耐久', fem[0].E, fem[1].E], ['飛彈', fem[0].M, fem[1].M]] : [];
  const tug = parts.map(([k, a, b]) => { const r = a + b > 0 ? a / (a + b) : 0.5;
    return `<div class="tug"><span class="a">${cceFmt(a)}</span><div class="tr"><i style="width:${r * 100}%"></i><i style="width:${(1 - r) * 100}%"></i></div><span class="k">${k}</span><span class="b">${cceFmt(b)}</span></div>`; }).join('');
  const title = plA ? `進攻：${s.name}` : `敵軍來襲：${s.name}`;
  const lead = plA ? `你的小隊開進 <b>${s.name}</b>（${s.owner >= 0 && SM_FAC[s.owner] ? SM_FAC[s.owner].name : '無主'}）。我方 <em>${mine.length} 隊 ${nS(mine)} 艘</em>，敵方 <b>${foe.length} 隊 ${nS(foe)} 艘</b>${foeDefs.length ? `、軌道防禦 ${foeDefs.length} 座` : ''}。`
    : `<b>${foe.map((q) => smuEsc(q.name)).join('、')}</b>${from.length ? ` 從 ${from.join('、')} ` : ' '}躍遷進攻你所在的 ${s.name}。我方 <em>${mine.length} 隊 ${nS(mine)} 艘</em>${ownDefs.length ? `＋軌道防禦 ${ownDefs.length} 座` : ''}，敵方 <b>${foe.length} 隊 ${nS(foe)} 艘</b>。`;
  const k0 = cceK();
  overlay(`<style>${SMU_CSS}${CC_CSS}${CCM_CSS}${CCE_CSS}</style><div class="sm-wrap ccm cce" id="cc-eng" style="--k:${k0}"><canvas class="bg" id="cce-bg"></canvas><div class="tint"></div>
    <div class="stage" id="cce-st" style="--d0:${view ? '0s' : '1.15s'}">
      <div class="hd ent" style="--dx:-30px"><div class="t">${plA ? 'ASSAULT' : 'INCOMING'} ・ BATTLE ASSESSMENT</div><h1>${title}</h1>
        <div class="crumb"><b>第 ${S.turn} 週</b>・${plA ? '佔領戰' : '迎擊戰'}・${s.name}${view ? '・開戰前的評估（戰鬥已暫停）' : ''}</div></div>
      <div class="lead ent" style="--dy:-10px;--d:.05s">${lead}</div>
      <section class="pn mine ent" style="--dx:-40px;--d:.1s"><div class="ph"><h2>我方</h2><span class="en">YOUR FORCES</span><span class="r"><span style="color:var(--own)">船體</span>・<span style="color:var(--ally)">護盾</span>・<span style="color:var(--yellow)">飛彈</span></span></div>
        <div class="pb">${mineHtml}${defsHtml(ownDefs, 'var(--own)')}${mine.length > 1 ? `<div class="sub">AI 小隊戰鬥中按 <b>${keyText('cap_squad')}</b> 可以切換過去指揮。</div>` : ''}</div></section>
      <section class="pn foe ent" style="--dx:40px;--d:.15s"><div class="ph"><h2>敵方</h2><span class="en">HOSTILE</span><span class="r">${foe.length} 隊・${nS(foe)} 艘</span></div>
        <div class="pb">${foeHtml}${defsHtml(foeDefs, 'var(--red)')}</div></section>
      <div class="ctr ent" style="--dy:20px;--d:.2s">
        <div class="ring"><div class="ticks"></div>
          <svg viewBox="0 0 300 300"><circle cx="150" cy="150" r="130" stroke="rgba(255,255,255,.1)" stroke-width="14" fill="none"/>
            <circle id="cce-arc" cx="150" cy="150" r="130" stroke="${col}" stroke-width="14" fill="none" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 0 8px ${col})"/></svg>
          <div class="in"><span class="lab">評估勝率 ／ WIN ODDS</span><span class="odds" id="cce-n" style="color:${col}">0<small>%</small></span>
            <span class="vd" style="color:${col}">${win >= 0.6 ? '有利' : win >= 0.4 ? '勢均力敵' : '不利'}</span></div></div>
        <div class="fx"><div class="ttl"><span style="color:var(--own)">我方</span><span style="color:var(--dim)">勝率的組成</span><span style="color:#ff8a96">敵方</span></div>${tug}
          <div class="note">公式不含親自操艦的技術與地形。打輸的一方撤到相鄰的己方星系，沒有就投降。</div></div>
      </div>
      <div class="info l ent" style="--dx:-30px;--d:.3s">${view ? `這是開戰時的評估。戰鬥中的即時勝率在畫面上方的狀態框。<br>脫離交戰後可以躍遷撤退（不算失敗，戰況保留）。` : calc ? '這週已經親自打過一場：這場<b>用公式計算</b>，結果照上面的勝率擲出來。' : `進入戰場親自操艦。${plA ? '' : `敵軍 <b class="w">${CC_INB_T} 秒</b>後躍遷抵達，先占好位置。`}<br>戰鬥中脫離交戰後可以躍遷撤退（不算失敗，戰況保留）。`}</div>
      <div class="info r ent" style="--dx:30px;--d:.3s">這場不能取消：${plA ? '進攻是你上一週下的命令' : '要避開就要在上一週先移動'}。<br><span style="color:var(--mute)">（之後的戰鬥，結束這一週前留意星圖上的 ⚠）</span></div>
      <button type="button" class="go ent${calc || view ? ' calc' : ''}" id="cce-go" style="--dy:30px;--d:.25s"><span class="op">${view ? 'BACK TO BATTLE' : calc ? 'AUTO RESOLVE' : 'TAKE COMMAND'}</span><span class="kb">ENTER</span>
        <h3>${view ? '回到戰場' : calc ? '迎戰（計算）' : plA ? '開始進攻' : '開始迎擊'}</h3><span class="s">${view ? '關掉評估，戰鬥繼續' : calc ? '這週已經打過一場：用公式計算' : '進入戰場親自指揮'}</span><div class="chev"><i></i><i></i><i></i></div></button>
    </div>
    ${view ? '' : `<div class="flash"></div><div class="alert"><b>${plA ? '進攻開始' : '⚠ 敵軍躍遷訊號'}</b><small>${plA ? 'ASSAULT' : 'INCOMING WARP'} ・ ${s.name}</small></div>`}</div>`);
  window.removeEventListener('resize', ccResize);
  const fit = () => { const el = gEl('cc-eng'); if (!el) return; const k = cceK(), st = gEl('cce-st'); el.style.setProperty('--k', k); st.style.left = ((innerWidth - 1920 * k) / 2 / k) + 'px'; st.style.top = ((innerHeight - 1080 * k) / 2 / k) + 'px';
    const cv = gEl('cce-bg'); if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; ccmBg(cv.getContext('2d'), innerWidth, innerHeight); } };
  fit(); window.addEventListener('resize', fit);
  const dl = view ? 150 : 1250;
  setTimeout(() => { const a = gEl('cce-arc'); if (a) a.style.strokeDashoffset = C * (1 - win); }, dl);
  const t0 = performance.now() + dl;
  (function step(n) { const el = gEl('cce-n'); if (!el) return; const k = Math.max(0, Math.min(1, (n - t0) / 1200)), e = 1 - Math.pow(1 - k, 3); el.innerHTML = `${Math.round(win * 100 * e)}<small>%</small>`; if (k < 1) requestAnimationFrame(step); })(performance.now());
  let done = false;
  const fire = () => { if (done) return; done = true; window.removeEventListener('resize', fit); document.removeEventListener('keydown', key, true); go(); };
  const key = (e) => { if (!gEl('cc-eng')) { document.removeEventListener('keydown', key, true); return; } if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); fire(); } };
  document.addEventListener('keydown', key, true);
  gEl('cce-go').onclick = fire;
}
const cceK = () => Math.min(innerWidth / 1920, innerHeight / 1080);

// 戰場左側的「交戰評估」按鈕＋側邊面板（2026-11-18 使用者決定：不強制顯示、不佔滿畫面）
// 按鈕在左邊中間；按下從左側滑出一塊斜放的儀表板（和停泊大廳右側的面板同一種傾斜），戰鬥不暫停；再按一次或 ✕ 收起。
// 勝率圓環、雙方每艘船（船體、護盾、飛彈、擊沉）、軌道防禦都是戰場上的即時狀態（cceLive，每 0.5 秒）；組成的拔河條是開戰時的。
// 掛在 body，戰鬥結束（ccBattleDone）、回到生涯（ccShow）收掉，選單畫面（#game）蓋上時藏起來。
const CCE_TAB_CSS = `#cce-tab{position:fixed;left:0;top:44%;z-index:7;pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 9px 14px 7px;border:1px solid rgba(255,90,110,.6);border-left:0;cursor:pointer;
  background:linear-gradient(90deg,rgba(120,10,28,.88),rgba(50,8,20,.82));color:#fff;clip-path:polygon(0 0,100% 10px,100% calc(100% - 10px),0 100%);font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif}
#cce-tab:hover,#cce-tab.on{background:linear-gradient(90deg,#d8263f,#7a1430)}
#cce-tab b{writing-mode:vertical-rl;font-size:15px;font-weight:900;letter-spacing:.3em}
#cce-tab small{writing-mode:vertical-rl;font:700 10px Rajdhani,Bahnschrift,sans-serif;letter-spacing:.24em;color:#ffb0ba}
#cce-tab i{font-style:normal;font:700 13px Rajdhani,Bahnschrift,sans-serif;color:#ff8a96}
body.ccl-on #cce-tab,body:has(#game:not([hidden])) #cce-tab,body.ccl-on #cce-side,body:has(#game:not([hidden])) #cce-side{display:none}
#cce-side{--own:#3fdf8f;--ally:#5aa8ff;--red:#ff4d5e;--yellow:#f3e94b;--gold:#ffc24a;--cyan:#3cc8ff;--dim:#8fa3c7;--line2:rgba(150,190,240,.18);--jp:'Noto Sans TC','Microsoft JhengHei',sans-serif;--en:Rajdhani,Bahnschrift,'Segoe UI',sans-serif;
  position:fixed;left:44px;top:96px;width:450px;z-index:6;zoom:var(--k,1);perspective:1400px;pointer-events:none;font-family:var(--jp);color:#eef3ff;user-select:none}
#cce-side .tilt{position:relative;pointer-events:auto;transform-origin:0 50%;transform:translateX(18px) rotateY(11deg) rotateZ(1deg);animation:cceSide .45s cubic-bezier(.2,.8,.2,1) both;
  background:linear-gradient(165deg,rgba(18,28,58,.84),rgba(8,13,30,.78));border:1px solid var(--line2);border-left:3px solid var(--red);backdrop-filter:blur(3px);
  clip-path:polygon(0 0,calc(100% - 20px) 0,100% 20px,100% 100%,20px 100%,0 calc(100% - 20px));max-height:calc(100vh / var(--k,1) - 300px);display:flex;flex-direction:column}
@keyframes cceSide{from{opacity:0;transform:translateX(-110%) rotateY(11deg) rotateZ(1deg)}}
#cce-side .tilt::before{content:"";position:absolute;left:0;top:0;width:110px;height:3px;background:var(--red)}
#cce-side .hd{display:flex;align-items:baseline;gap:10px;padding:16px 20px 10px;border-bottom:1px solid var(--line2);flex:none}
#cce-side .hd h3{margin:0;font:900 20px var(--jp);letter-spacing:.12em;white-space:nowrap}
#cce-side .hd .en{font:700 10px var(--en);letter-spacing:.26em;color:#ff8a96;white-space:nowrap}
#cce-side .hd .x{margin-left:auto;border:0;background:none;color:var(--dim);font:700 18px var(--en);cursor:pointer;padding:0 2px}#cce-side .hd .x:hover{color:#fff}
#cce-side .bd{padding:12px 20px 16px;overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(90,200,255,.35) transparent}
#cce-side .top{display:flex;align-items:center;gap:18px}
#cce-side .ring{position:relative;width:118px;height:118px;flex:none}
#cce-side .ring svg{position:absolute;inset:0;transform:rotate(-90deg)}#cce-side .ring circle{transition:stroke-dashoffset .8s ease,stroke .4s}
#cce-side .ring .in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
#cce-side .ring .n{font:700 40px/1 var(--en)}#cce-side .ring .n small{font-size:18px}
#cce-side .ring .l{font:700 9px var(--en);letter-spacing:.2em;color:var(--dim)}
#cce-side .vs{flex:1;font-size:13px;color:var(--dim);line-height:1.7}
#cce-side .vs .r{display:flex;justify-content:space-between;align-items:baseline}#cce-side .vs b{font:700 20px var(--en)}
#cce-side .vs .vd{font:900 15px var(--jp);letter-spacing:.2em}
#cce-side .lab{font:700 10px var(--en);letter-spacing:.22em;color:var(--dim);margin:12px 0 6px;display:flex;justify-content:space-between}
#cce-side .tug{display:grid;grid-template-columns:44px 1fr 44px;gap:8px;align-items:center;margin-top:5px;font:700 13px var(--en)}
#cce-side .tug .a{text-align:right;color:var(--own)}#cce-side .tug .b{color:#ff8a96}
#cce-side .tug .tr{position:relative;height:15px;display:flex;background:rgba(255,255,255,.06);clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}
#cce-side .tug .tr i{display:block;height:100%}#cce-side .tug .tr i:first-child{background:rgba(63,223,143,.6)}#cce-side .tug .tr i:nth-child(2){background:rgba(255,77,94,.6)}
#cce-side .tug .tr span{position:absolute;inset:0;text-align:center;font:500 11px/15px var(--jp);color:#fff;text-shadow:0 0 3px #000}
#cce-side .sh{display:grid;grid-template-columns:76px 1fr 46px;gap:8px;align-items:center;padding:4px 8px;background:rgba(12,20,42,.6);border-left:2px solid var(--sc,var(--own));margin-top:3px;font-size:13px}
#cce-side .sh .nm{white-space:nowrap;font-weight:700}#cce-side .sh .v{text-align:right;font:700 14px var(--en)}
#cce-side .sh.f{--sc:var(--red)}#cce-side .sh.ai{--sc:var(--ally)}#cce-side .sh.dead{opacity:.45;--sc:#5d6f92}#cce-side .sh.dead .nm{text-decoration:line-through}
#cce-side .bars{display:grid;gap:2px}#cce-side .bar{height:4px;background:rgba(255,255,255,.12);position:relative}#cce-side .bar i{position:absolute;left:0;top:0;bottom:0;background:var(--bc)}
#cce-side .sq{font:700 12px var(--jp);margin:8px 0 2px;color:var(--dim)}
#cce-side .ft{margin-top:10px;font-size:11px;color:#5d6f92;line-height:1.5}`;
function cceTab(S) {
  cceTabOff(); if (!S.pendB) return;
  if (!gEl('cce-tab-css')) { const st = document.createElement('style'); st.id = 'cce-tab-css'; st.textContent = CCE_TAB_CSS; document.head.appendChild(st); }
  const b = document.createElement('button'); b.type = 'button'; b.id = 'cce-tab'; b.title = '交戰評估：雙方兵力與勝率（戰鬥不會暫停）';
  b.innerHTML = '<i>⚠</i><b>交戰評估</b><small>ASSESSMENT</small>';
  b.onclick = () => (gEl('cce-side') ? cceSideOff() : cceOpen(S));
  document.body.appendChild(b);
}
function cceTabOff() { const b = gEl('cce-tab'); if (b) b.remove(); cceSideOff(); }
function cceSideOff() { const p = gEl('cce-side'); if (p) { clearInterval(+p.dataset.iv); p.remove(); } const b = gEl('cce-tab'); if (b) b.classList.remove('on'); }
// 戰場上的即時狀態：每艘船的船體、護盾、飛彈（擊沉的也列出來），雙方軌道防禦，即時勝率與我方每艘船的存活率（capOdds）
// s.sq＝這艘船在第幾個小隊（ccLaunch 的 duel.a／duel.b 順序＝我方：親自指揮的在前；敵方：照 pendB）
function cceLive() {
  if (!CAP.on || !CAP.own || !CAP.foes) return null;
  const rows = (L) => L.map((s) => ({ s, key: s.key, sq: s.sq || 0, dead: !!s.dead, inb: !!s.inb, hp: s.dead ? 0 : ships.hp[s.i] / maxHp(s.i), sh: s.dead || !ships.shMax[s.i] ? 0 : ships.sh[s.i] / ships.shMax[s.i], msl: !s.dead && s.H.msl ? s.mslN / s.H.msl.n : 0 }));
  const own = rows(CAP.own), foe = rows(CAP.foes), inb = !!(CAP.mis && CAP.mis.inb && !CAP.mis.inb.done);
  const dl = (mine) => CAP.G.gts.filter((g) => g.def && (g.side === CAP.side) === mine).map((g) => ({ type: g.cu, hp: gtDead(g) ? 0 : g.hp / g.max }));
  const defsA = dl(true), defsB = dl(false);
  const grp = (R) => { const m = new Map(); for (const r of R) if (!r.dead) { if (!m.has(r.sq)) m.set(r.sq, []); m.get(r.sq).push(r); } return [...m.values()]; };
  const ga = grp(own), gb = grp(foe), alive = (D) => D.filter((d) => d.hp > 0);
  let O = null;
  if (!inb && ga.length && (gb.length || alive(defsB).length)) {
    const sd = (G, diff, defs) => ({ squads: G.map((q) => q.map((r) => ({ key: r.key, H: r.s.H, hp: r.hp, sh: r.sh, msl: r.msl }))), diff, defs: alive(defs) });
    O = capOdds([sd(ga, 1, defsA), sd(gb, CAP.li, defsB)]);
    ga.forEach((q, qi) => q.forEach((r, k) => { r.sv = O.surv[0][qi][k]; }));
  }
  return { own, foe, inb, O, defsA, defsB };
}
function cceOpen(S) {
  if (!S.pendB || GAME.result) return;
  cceSideOff();
  const { P, plA, mine, foe, foeDefs, ownDefs, win, sv, fem } = cceData(S), C = 2 * Math.PI * 50;
  const row = (c, cls, v, dead) => `<div class="sh ${cls}${dead ? ' dead' : ''}"><span class="nm">${CAP_HULLS[c.key].name}</span><div class="bars">${cceBar(c.hp, cls === 'f' || c.hp < 0.35 ? 'var(--red)' : 'var(--own)')}${cceBar(c.sh, 'var(--ally)')}${CAP_HULLS[c.key].msl && cls !== 'f' ? cceBar(c.msl, 'var(--yellow)') : ''}</div><span class="v">${v}</span></div>`;
  const pc = (v) => `<span style="color:${cceOddCol(v || 0)}">${v == null ? '—' : Math.round(v * 100) + '%'}</span>`;
  const sqHead = (q, i, f) => f ? `<div class="sq" style="color:#ff8a96">${q ? smuEsc(q.name) : `敵方第 ${i + 1} 隊`}</div>`
    : `<div class="sq" style="color:${i === 0 ? 'var(--own)' : 'var(--ally)'}">${i === 0 ? '★ ' : ''}${q ? smuEsc(q.name) : `第 ${i + 1} 隊`}${i === 0 ? '' : '（AI）'}</div>`;
  const defRow = (L, f) => L.length ? `<div class="sq" style="color:${f ? '#ff8a96' : 'var(--own)'}">${f ? '敵方' : '我方'}軌道防禦 ${L.filter((d) => d.hp > 0).length}／${L.length} 座</div>`
    + L.map((d) => `<div class="sh ${f ? 'f' : ''}${d.hp > 0 ? '' : ' dead'}"><span class="nm">${cceDefNm(d.type)}</span><div class="bars">${cceBar(d.hp, f ? 'var(--red)' : 'var(--own)')}</div><span class="v">${d.hp > 0 ? Math.round(d.hp * 100) + '%' : '摧毀'}</span></div>`).join('') : '';
  // 我方、敵方的清單：戰場上有資料就用即時的，不然用開戰時的
  const lists = (L) => {
    if (!L) return [mine.map((q, qi) => sqHead(q, qi) + q.ships.map((c, k) => row(c, qi ? 'ai' : '', pc((sv[qi] || [])[k]))).join('')).join('') + defRow(ownDefs, false),
      foe.map((q, qi) => sqHead(q, qi, true) + q.ships.map((c) => row(c, 'f', `<span style="color:var(--gold)">${cceMk(c)}</span>`)).join('')).join('') + defRow(foeDefs, true)];
    const by = (R) => { const m = new Map(); for (const r of R) { if (!m.has(r.sq)) m.set(r.sq, []); m.get(r.sq).push(r); } return [...m.entries()].sort((a, b) => a[0] - b[0]); };
    const a = by(L.own).map(([i, R]) => sqHead(mine[i], i) + R.map((r) => row(r, i ? 'ai' : '', r.dead ? '<span style="color:var(--red)">擊沉</span>' : pc(r.sv), r.dead)).join('')).join('') + defRow(L.defsA, false);
    const b = by(L.foe).map(([i, R]) => sqHead(foe[i], i, true) + R.map((r) => row(r, 'f', r.dead ? '<span style="color:var(--dim)">擊沉</span>' : r.inb ? '<span style="color:#ff8a96">躍遷中</span>' : `<span style="color:var(--gold)">${cceMk({ mk: r.s.H && r.s.H.mk })}</span>`, r.dead)).join('')).join('') + defRow(L.defsB, true);
    return [a, b];
  };
  const tug = (fem ? [['火力', fem[0].F, fem[1].F], ['耐久', fem[0].E, fem[1].E], ['飛彈', fem[0].M, fem[1].M]] : []).map(([k, a, b]) => { const r = a + b > 0 ? a / (a + b) : 0.5;
    return `<div class="tug"><span class="a">${cceFmt(a)}</span><div class="tr"><i style="width:${r * 100}%"></i><i style="width:${(1 - r) * 100}%"></i><span>${k}</span></div><span class="b">${cceFmt(b)}</span></div>`; }).join('');
  const p = document.createElement('div'); p.id = 'cce-side'; p.style.setProperty('--k', ccmK());
  p.innerHTML = `<div class="tilt"><div class="hd"><h3>交戰評估</h3><span class="en">${plA ? 'ASSAULT' : 'INCOMING'} ・ ${S.sys[S.pendB.sys].name}</span><button type="button" class="x" title="收起">✕</button></div>
    <div class="bd"><div class="top"><div class="ring"><svg viewBox="0 0 118 118"><circle cx="59" cy="59" r="50" stroke="rgba(255,255,255,.1)" stroke-width="9" fill="none"/>
        <circle id="cce-sarc" cx="59" cy="59" r="50" stroke-width="9" fill="none" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
        <div class="in"><span class="l">WIN ODDS</span><span class="n" id="cce-sn">—</span></div></div>
      <div class="vs"><div class="vd" id="cce-svd"></div><div class="r">我方<b style="color:var(--own)" id="cce-sa"></b></div><div class="r">敵方<b style="color:#ff8a96" id="cce-sb"></b></div>
        <div id="cce-snow"></div></div></div>
      <div class="lab"><span style="color:var(--own)">我方</span><span>開戰時的組成</span><span style="color:#ff8a96">敵方</span></div>${tug}
      <div class="lab"><span>我方・存活率</span><span id="cce-st1"></span></div><div id="cce-lm"></div>
      <div class="lab"><span>敵方・裝備</span></div><div id="cce-lf"></div>
      <div class="ft">戰鬥沒有暫停。勝率、船的狀態每 0.5 秒更新；脫離交戰後可以躍遷撤退。</div></div></div>`;
  document.body.appendChild(p);
  p.querySelector('.x').onclick = cceSideOff;
  const tb = gEl('cce-tab'); if (tb) tb.classList.add('on');
  const upd = () => {
    const arc = gEl('cce-sarc'); if (!arc) return;
    let L = null; try { L = cceLive(); } catch (e) { L = null; }
    const O = L && L.O, w = O ? O.win : win, col = cceOddCol(w);
    arc.style.stroke = col; arc.style.strokeDashoffset = C * (1 - w);
    const n = gEl('cce-sn'); n.innerHTML = `${Math.round(w * 100)}<small>%</small>`; n.style.color = col;
    const vd = gEl('cce-svd'); vd.textContent = (O ? '目前' : '開戰時') + '・' + (w >= 0.6 ? '有利' : w >= 0.4 ? '勢均力敵' : '不利'); vd.style.color = col;
    gEl('cce-snow').textContent = O ? `開戰時 ${Math.round(win * 100)}%` : L && L.inb ? '敵軍還沒躍遷抵達' : '';
    const cnt = (R, D) => `${R.filter((r) => !r.dead).length}／${R.length} 艘${D.length ? `＋${D.filter((d) => d.hp > 0).length} 座` : ''}`;
    gEl('cce-sa').textContent = L ? cnt(L.own, L.defsA) : `${cceNS(mine)} 艘${ownDefs.length ? `＋${ownDefs.length} 座` : ''}`;
    gEl('cce-sb').textContent = L ? cnt(L.foe, L.defsB) : `${cceNS(foe)} 艘${foeDefs.length ? `＋${foeDefs.length} 座` : ''}`;
    gEl('cce-st1').textContent = O ? '即時' : '開戰時';
    const [a, b] = lists(L); gEl('cce-lm').innerHTML = a; gEl('cce-lf').innerHTML = b;
  };
  upd(); p.dataset.iv = setInterval(upd, 500);
}
