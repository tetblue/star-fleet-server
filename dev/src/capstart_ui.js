// ═══════════════════════ 艦長生涯：開新局、生涯結束（2026-11-18）═══════════════════════
// 開新局：整頁的大廳風格（斜放的卡片：陣營／開局身分／難度，右下角大按鈕開始）。
// 生涯結束：星圖右側的斜放面板（capsheet_ui.js 的 ccmSheet），紅色；數字列＋最後幾件大事＋這一局解鎖了什麼。
const CCN_CSS = `
#ccn{position:fixed;inset:0;z-index:6;overflow:hidden;color:#eef3ff;font-family:'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif;user-select:none;
  background:radial-gradient(ellipse at 70% 40%,rgba(40,70,140,.35),transparent 60%),radial-gradient(ellipse at 15% 85%,rgba(var(--fc),.22),transparent 55%),linear-gradient(160deg,#070b1a,#03050d);transition:background .4s}
#ccn *{box-sizing:border-box;margin:0;padding:0}
#ccn button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:left}
#ccn .en{font-family:Rajdhani,Bahnschrift,'Segoe UI',sans-serif}
#ccn .stars{position:absolute;inset:0;opacity:.55;background-image:radial-gradient(1px 1px at 12% 22%,#fff,transparent),radial-gradient(1px 1px at 33% 71%,#cfe,transparent),radial-gradient(1.5px 1.5px at 58% 14%,#fff,transparent),radial-gradient(1px 1px at 81% 63%,#dff,transparent),radial-gradient(1px 1px at 91% 28%,#fff,transparent),radial-gradient(1.5px 1.5px at 7% 58%,#bdf,transparent),radial-gradient(1px 1px at 46% 46%,#fff,transparent),radial-gradient(1px 1px at 68% 88%,#fff,transparent);background-size:420px 380px}
#ccn .st{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:0 0;perspective:1800px}
#ccn .corner{position:absolute;width:70px;height:70px;border:0 solid rgba(90,200,255,.55)}
#ccn .c1{left:10px;top:10px;border-left-width:2px;border-top-width:2px}#ccn .c2{right:10px;top:10px;border-right-width:2px;border-top-width:2px}
#ccn .c3{left:10px;bottom:10px;border-left-width:2px;border-bottom-width:2px}#ccn .c4{right:10px;bottom:10px;border-right-width:2px;border-bottom-width:2px}
#ccn .back{position:absolute;left:40px;top:40px;width:62px;height:62px;display:grid;place-items:center;border:2px solid rgba(90,200,255,.55);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:rgba(10,18,40,.8)}
#ccn .back:hover{background:rgba(40,90,160,.8)}
#ccn .ttl{position:absolute;left:126px;top:30px}
#ccn .ttl small{font:700 14px Rajdhani,sans-serif;letter-spacing:.4em;color:#3cc8ff}
#ccn .ttl h1{font:900 54px/1.1 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.12em;text-shadow:0 4px 18px rgba(0,0,0,.7)}
#ccn .ttl p{font-size:15px;color:#9fb6d8;margin-top:4px}
#ccn .intro{position:absolute;left:60px;top:190px;width:520px;padding:22px 26px;background:linear-gradient(100deg,rgba(14,22,44,.88),rgba(12,16,36,.55));border-left:3px solid #3cc8ff;transform:rotateY(10deg);transform-origin:0 50%;font-size:16px;line-height:1.85;color:#cfd8ec}
#ccn .intro b{color:#ff8a7a}
#ccn .intro .meta{margin-top:16px;padding-top:14px;border-top:1px solid rgba(150,190,240,.18);display:flex;gap:28px}
#ccn .intro .meta span{display:block;font-size:12px;color:#8fa3c7;letter-spacing:.1em}
#ccn .intro .meta b{font:700 30px/1.1 Rajdhani,sans-serif;color:#fff}
#ccn .intro .meta b.zh{font:900 22px/1.5 'Noto Sans TC',sans-serif;color:#ffc24a}
#ccn .intro .hint{margin-top:14px;font-size:13px;color:#8fa3c7;line-height:1.7}
#ccn .col{position:absolute;left:660px;width:1200px;transform:rotateY(-6deg) rotateZ(-.4deg);transform-origin:100% 50%}
#ccn .sec{display:flex;align-items:baseline;gap:14px;margin-bottom:12px}
#ccn .sec .no{font:700 34px/1 Rajdhani,sans-serif;color:#3cc8ff}
#ccn .sec b{font:900 22px 'Noto Sans TC',sans-serif;letter-spacing:.14em}
#ccn .sec .en{font-size:13px;letter-spacing:.3em;color:#8fa3c7}
#ccn .sec::after{content:"";flex:1;height:1px;background:rgba(150,190,240,.2)}
#ccn .row{display:flex;gap:14px}
#ccn .card{position:relative;flex:1;padding:16px 22px 16px 26px;background:linear-gradient(165deg,rgba(18,28,58,.9),rgba(8,13,30,.86));border:1px solid rgba(150,190,240,.16);clip-path:polygon(14px 0,100% 0,calc(100% - 14px) 100%,0 100%);transition:transform .2s,background .2s}
#ccn .card::before{content:"";position:absolute;left:0;top:0;right:0;height:3px;background:var(--cc,#3cc8ff);opacity:.35}
#ccn .card:hover:not(.off){transform:translateY(-4px);background:linear-gradient(165deg,rgba(30,48,92,.95),rgba(12,20,44,.9))}
#ccn .card.on{background:linear-gradient(165deg,rgba(40,70,130,.95),rgba(14,26,58,.92));border-color:var(--cc,#3cc8ff)}
#ccn .card.on::before{opacity:1;height:4px}
#ccn .card.on::after{content:"✓";position:absolute;right:26px;top:12px;font:900 20px sans-serif;color:var(--cc,#3cc8ff)}
#ccn .card.off{opacity:.42;cursor:not-allowed}
#ccn .card h3{font:900 22px 'Noto Sans TC',sans-serif;letter-spacing:.08em;color:#fff}
#ccn .card .d{font-size:14px;color:#aebbd4;line-height:1.6;margin-top:6px}
#ccn .card .i{font-size:13px;color:var(--cc,#3cc8ff);margin-top:8px;font-weight:700}
#ccn .card .lk{font-size:13px;color:#ffb35a;margin-top:8px}
#ccn .card.big{padding:24px 30px 22px 34px}
#ccn .card.big h3{font-size:30px}
#ccn .card.big .fac{font:700 14px Rajdhani,sans-serif;letter-spacing:.3em;color:var(--cc)}
#ccn .go{position:absolute;right:60px;bottom:56px;width:520px;height:118px;display:flex;align-items:center;padding:0 40px 0 46px;background:linear-gradient(100deg,#2f86ff,#3cc8ff);clip-path:polygon(26px 0,100% 0,calc(100% - 26px) 100%,0 100%);box-shadow:0 0 40px rgba(60,200,255,.35);transition:filter .2s}
#ccn .go:hover{filter:brightness(1.15)}
#ccn .go b{display:block;font:900 38px 'Noto Sans TC',sans-serif;letter-spacing:.14em;color:#04122a}
#ccn .go small{display:block;font:700 15px Rajdhani,sans-serif;letter-spacing:.3em;color:#0b2b58}
#ccn .go .ar{margin-left:auto;font:900 46px sans-serif;color:#04122a}
#ccn .pick{position:absolute;right:60px;bottom:190px;width:520px;text-align:right;font-size:15px;color:#9fb6d8}
#ccn .pick b{color:#fff}
#ccn .enter{opacity:0;translate:var(--dx,0) var(--dy,0)}
#ccn.ready .enter{opacity:1;translate:0 0;transition:opacity .5s ease var(--d,0s),translate .6s cubic-bezier(.2,.8,.2,1) var(--d,0s)}
`;
const ccnHex = (c) => { const n = parseInt(c.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
function ccNewDialog() {
  const meta = ccMetaLoad(), sel = { role: 'emp', start: 0, diff: 1 };
  const draw = () => {
    const R = CC_ROLES[sel.role], fc = SM_FAC[R.fac].col;
    const card = (k, v, on, off, cc, inner, big) => `<button type="button" class="card${big ? ' big' : ''}${on ? ' on' : ''}${off ? ' off' : ''}" data-${k}="${v}" style="--cc:${cc}">${inner}</button>`;
    const roles = Object.entries(CC_ROLES).map(([k, X]) => card('role', k, sel.role === k, false, SM_FAC[X.fac].col,
      `<span class="fac">${X.fac === SM_E ? 'EMPIRE' : 'ALLIANCE'}</span><h3>${X.name}</h3><div class="d">${X.desc}</div><div class="i">開局：${X.hulls.map((h) => CAP_HULLS[h].name).join('＋')}・${X.techName}</div>`, true)).join('');
    const starts = CC_STARTS.map((X, i) => { const on = meta.best >= X.need; return card('start', i, sel.start === i, !on, '#ffc24a', `<h3>${on ? '' : '🔒 '}${X.name}</h3><div class="d">${X.desc}</div>${on ? '' : `<div class="lk">解鎖：在任何一局升到${CC_RANKS[X.need].name}</div>`}`); }).join('');
    const diffs = CC_DIFF.map((D, i) => { const on = !D.need || meta.best >= D.need; return card('diff', i, sel.diff === i, !on, ['#3fdf8f', '#3cc8ff', '#ff8a4a', '#ff4d5e', '#a97bff'][i] || '#3cc8ff', `<h3>${on ? '' : '🔒 '}${D.name}</h3><div class="d">${D.desc}</div>${on ? '' : `<div class="lk">解鎖：在任何一局升到${CC_RANKS[D.need].name}</div>`}`); }).join('');
    const box = gEl('ccn');
    box.style.setProperty('--fc', ccnHex(fc));
    box.querySelector('.col.c-role .row').innerHTML = roles;
    box.querySelector('.col.c-start .row').innerHTML = starts;
    box.querySelector('.col.c-diff .row').innerHTML = diffs;
    box.querySelector('.pick').innerHTML = `<b style="color:${fc}">${R.name}</b>・${CC_STARTS[sel.start].name}・${CC_DIFF[sel.diff].name}`;
    box.querySelectorAll('[data-role]').forEach((b) => (b.onclick = () => { sel.role = b.dataset.role; draw(); }));
    box.querySelectorAll('[data-start]:not(.off)').forEach((b) => (b.onclick = () => { sel.start = +b.dataset.start; draw(); }));
    box.querySelectorAll('[data-diff]:not(.off)').forEach((b) => (b.onclick = () => { sel.diff = +b.dataset.diff; draw(); }));
  };
  overlay(`<style>${CCN_CSS}</style><div id="ccn"><div class="stars"></div><div class="st">
    <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
    <button type="button" class="back enter" id="cc-back" title="回到艦長" style="--dx:-30px"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#cfe" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg></button>
    <div class="ttl enter" style="--dx:-30px;--d:.05s"><small>CAPTAIN CAREER ・ NEW RUN</small><h1>艦長生涯</h1><p>開新局：選陣營、開局身分與難度</p></div>
    <div class="intro enter" style="--dx:-40px;--d:.12s">回合制的星圖，每一回合是一週。所有勢力的兵力都是戰艦小隊，沒有艦隊戰：小隊戰的結果決定星系的所有權。你的小隊碰上敵人時，由你親自操艦；其他的戰鬥用公式計算，下令前都看得到勝率與存活率。損傷會留到下一場，要回有維修船塢的星系花錢修理。<br><b>你的小隊全滅，生涯就結束。</b>
      <div class="meta"><div><span>這是第</span><b>${meta.runs + 1}</b> <span style="display:inline">局</span></div><div><span>歷來最高軍階</span><b class="zh">${CC_RANKS[meta.best].name}</b></div></div>
      <div class="hint">升遷：戰功到了上級會發「升遷考核」（佔領任務），完成就升任，能帶的小隊、能造的船型、任務都會變多。升到更高的軍階會解鎖新的開局身分與難度。</div></div>
    <div class="col c-role enter" style="top:150px;--dy:30px;--d:.18s"><div class="sec"><span class="no">01</span><b>陣營</b><span class="en">FACTION</span></div><div class="row"></div></div>
    <div class="col c-start enter" style="top:430px;--dy:30px;--d:.26s"><div class="sec"><span class="no">02</span><b>開局身分</b><span class="en">START</span></div><div class="row"></div></div>
    <div class="col c-diff enter" style="top:640px;--dy:30px;--d:.34s"><div class="sec"><span class="no">03</span><b>難度</b><span class="en">DIFFICULTY</span></div><div class="row"></div></div>
    <div class="pick enter" style="--d:.4s"></div>
    <button type="button" class="go enter" id="cc-go" style="--dx:40px;--d:.45s"><span><b>開始生涯</b><small>LAUNCH CAREER</small></span><span class="ar">→</span></button>
  </div></div>`);
  const fit = () => { const st = document.querySelector('#ccn .st'); if (!st) return removeEventListener('resize', fit); const k = Math.min(innerWidth / 1920, innerHeight / 1080); st.style.transform = `scale(${k}) translate(-50%,-50%)`; };
  fit(); addEventListener('resize', fit);
  draw();
  requestAnimationFrame(() => requestAnimationFrame(() => gEl('ccn') && gEl('ccn').classList.add('ready')));
  gEl('cc-back').onclick = () => { GAME.spMode = 'captain'; showSingle(); };
  gEl('cc-go').onclick = () => { const S = ccNewGame({ seed: (Math.random() * 1e9) >>> 0, role: sel.role, diff: sel.diff, start: sel.start }); ccSave(S); CC = { S, sel: -1, raf: 0, view: null }; ccRender(); ccTurnStart(S, false); };
}
// 生涯結束：右側的斜放面板（紅）
function ccEndView() {
  const S = CC.S, meta = ccMetaLoad(), own = S.sys.filter((s) => s.owner === S.fac).length;
  const big = S.log.filter((x) => x.c === 'ok' || x.c === 'bad' || x.c === 'ev').slice(-6).reverse();
  const unl = S.log.filter((x) => /周目解鎖/.test(x.t));
  ccmSheet(`<h3>艦長生涯結束<span class="en">CAREER OVER ・ WEEK ${S.fin.turn}</span></h3>
    <div class="ccs-warn">${smuEsc(S.fin.why)}（第 ${S.fin.turn} 週）</div>
    <div class="ccs-stat"><div><span>最終軍階</span><b style="font:900 20px/1.6 'Noto Sans TC',sans-serif;color:var(--gold)">${ccRankOf(S).name}</b></div><div><span>戰功</span><b>${Math.round(S.pl.merit)}</b></div><div><span>擊沉</span><b>${S.pl.kills}<small>艘</small></b></div><div><span>親自佔領</span><b>${S.pl.caps}<small>系</small></b></div><div><span>撐了</span><b>${S.fin.turn}<small>週</small></b></div></div>
    <dl class="sm-kv"><dt>陣營</dt><dd>${CC_ROLES[S.role].name}・${CC_DIFF[S.diff] ? CC_DIFF[S.diff].name : ''}・${SM_FAC[S.fac].name}最後擁有 ${own} 個星系</dd><dt>周目</dt><dd>第 ${meta.runs || 1} 局・歷來最高軍階 ${CC_RANKS[meta.best].name}</dd>${unl.length ? `<dt>解鎖</dt><dd style="color:var(--own)">${unl.map((x) => smuEsc(x.t.replace(/^周目解鎖：/, ''))).join('、')}</dd>` : ''}</dl>
    <h4>最後的大事</h4>${big.length ? big.map((x) => `<div class="ccs-row" style="grid-template-columns:70px 1fr;cursor:default;border-left:3px solid ${x.c === 'bad' ? 'var(--red)' : x.c === 'ok' ? 'var(--own)' : 'var(--violet)'}"><span class="v" style="text-align:left">W${x.turn}</span><span>${smuEsc(x.t)}</span></div>`).join('') : '<div class="g-dim">沒有紀錄。</div>'}
    <div class="ccs-note">存檔已經結束；可以留在星圖上看最後的局勢，或開新局（這一局的紀錄會清掉，周目與解鎖保留）。</div>
    <div class="sm-btns"><button class="g-btn" id="cc-close">看星圖</button><button class="g-btn primary" id="cc-new">開新局</button></div>`, '', 'var(--red)');
  gEl('cc-close').onclick = smuCloseModal;
  gEl('cc-new').onclick = () => { smuCloseModal(); STORE.removeItem(CC_STORE); ccNewDialog(); };
}
Object.assign(window.__cap || (window.__cap = {}), { ccNewDialog, ccEndView });
