// ═══════════════════════ 艦長生涯：大廳（停泊）2026-11-18 ═══════════════════════
// 在星系中巡航時，平常是「停泊」：小隊停在星系裡、鏡頭慢慢繞著船轉，畫面上是大廳的介面（這週要做什麼）。
// 按 cap_dock（預設 H）或「巡航」切到親自開船；再按一次回到停泊。設計稿：dev/ui-mockups/captain_lobby.html。
// 顏色：青＝行動、綠＝你的小隊與船、紅＝警報、黃＝提醒徽章、金＝軍階。
const CCL = { on: false, dock: true, el: null, raf: 0, sel: 0, shot: 0, shotT: 0, yaw: 0, prio: 0, prioT: 0, sayT: 0, sayI: 0, hideUi: false };

const CCL_CSS = `
body.ccl-on #battlehud, body.ccl-on #labels, body.ccl-on #caphud{visibility:hidden}
#ccl{position:fixed;inset:0;z-index:6;overflow:hidden;color:#eef3ff;font-family:'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif;user-select:none}
#ccl *{box-sizing:border-box;margin:0;padding:0}
#ccl button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:left}
#ccl .st{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:0 0}
#ccl .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 45% 50%,transparent 50%,rgba(2,3,10,.62) 100%),linear-gradient(90deg,rgba(2,4,12,.35),transparent 30%,transparent 62%,rgba(2,4,12,.45))}
#ccl.flash .vig{animation:cclflash .32s}
@keyframes cclflash{0%{background-color:rgba(120,220,255,.25)}100%{background-color:transparent}}
#ccl .ui{position:absolute;inset:0;transition:opacity .35s}
#ccl.noui .ui{opacity:0;pointer-events:none}
#ccl .en{font-family:Rajdhani,Bahnschrift,'Segoe UI',sans-serif}
#ccl .enter{opacity:0;translate:var(--dx,0) var(--dy,0)}
#ccl.ready .enter{opacity:1;translate:0 0;transition:opacity .55s ease var(--d,0s),translate .65s cubic-bezier(.2,.8,.2,1) var(--d,0s)}
#ccl .corner{position:absolute;width:70px;height:70px;border:0 solid rgba(90,200,255,.55)}
#ccl .c1{left:10px;top:10px;border-left-width:2px;border-top-width:2px}#ccl .c2{right:10px;top:10px;border-right-width:2px;border-top-width:2px}
#ccl .c3{left:10px;bottom:10px;border-left-width:2px;border-bottom-width:2px}#ccl .c4{right:10px;bottom:10px;border-right-width:2px;border-bottom-width:2px}
#ccl .status{position:absolute;left:50%;top:14px;translate:-50% 0;height:34px;padding:0 40px;display:flex;align-items:center;gap:14px;white-space:nowrap;background:linear-gradient(90deg,transparent,rgba(8,12,26,.88) 10%,rgba(8,12,26,.88) 90%,transparent);font:600 13px Rajdhani,Bahnschrift,sans-serif;letter-spacing:.2em;color:#cfe0ff;clip-path:polygon(3% 0,97% 0,100% 100%,0 100%)}
#ccl.ready .status.enter{translate:-50% 0}
#ccl .status .live{color:#3fdf8f}
#ccl .status .live::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#3fdf8f;margin-right:8px;box-shadow:0 0 8px #3fdf8f;animation:cclblink 1.6s infinite}
#ccl .status .zh{font:500 14px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.08em;color:#dfe8fa}
#ccl .status .sep{color:#8fa3c7}
@keyframes cclblink{50%{opacity:.25}}
#ccl .rank{position:absolute;left:34px;top:34px;width:500px;height:128px;background:linear-gradient(100deg,rgba(14,22,44,.86),rgba(12,16,36,.3) 85%,transparent);clip-path:polygon(0 0,100% 8%,100% 100%,0 100%)}
#ccl .ring{position:absolute;left:12px;top:12px;width:104px;height:104px}
#ccl .ring svg.r{position:absolute;inset:0;transform:rotate(-90deg)}
#ccl .ring .ins{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
#ccl .ring .ins small{font:700 11px Rajdhani,sans-serif;letter-spacing:.14em;color:#8fa3c7;margin-top:2px}
#ccl .rk-id{position:absolute;left:136px;top:22px;font:700 12px Rajdhani,sans-serif;letter-spacing:.14em;color:#3cc8ff;white-space:nowrap}
#ccl .rk-id span{color:#9fb6d8;font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif}
#ccl .rk-name{position:absolute;left:134px;top:40px;font:900 30px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.1em;white-space:nowrap;text-shadow:0 2px 8px rgba(0,0,0,.6)}
#ccl .rk-lab{position:absolute;left:136px;top:84px;width:340px;display:flex;justify-content:space-between;font:600 12px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#8fa3c7;white-space:nowrap}
#ccl .rk-lab b{color:#3cc8ff;font-family:Rajdhani,sans-serif}
#ccl .seg{display:flex;gap:2px}
#ccl .seg i{width:6px;height:9px;background:rgba(120,150,190,.3)}
#ccl .seg i.on{background:var(--sc,#3cc8ff);box-shadow:0 0 6px var(--sc,#3cc8ff)}
#ccl .rk-bar{position:absolute;left:136px;top:104px}
#ccl .hexmenu{position:absolute;left:34px;top:196px}
#ccl .hexitem{position:absolute;display:flex;align-items:center;gap:22px;white-space:nowrap;transition:transform .2s}
#ccl .hexitem:hover{transform:translateX(6px)}
#ccl .hex{position:relative;flex:none;width:92px;height:100px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:linear-gradient(160deg,rgba(80,200,255,.75),rgba(40,90,170,.35))}
#ccl .hex::before{content:"";position:absolute;inset:2px;clip-path:inherit;background:linear-gradient(160deg,#18244a,#0b1124 70%)}
#ccl .hex svg{position:absolute;left:50%;top:50%;width:34px;height:34px;transform:translate(-50%,-50%);stroke:#e8f2ff;fill:none;stroke-width:1.8}
#ccl .hexitem:hover .hex{background:linear-gradient(160deg,#7fe0ff,#1f8fff)}
#ccl .nb{position:absolute;min-width:24px;height:24px;padding:0 6px;border-radius:12px;background:#f3e94b;color:#14130a;font:700 15px/24px Rajdhani,sans-serif;text-align:center;box-shadow:0 0 10px rgba(243,233,75,.6)}
#ccl .hexitem .nb{left:66px;top:2px}
#ccl .hexlabel{border-left:1px solid rgba(150,190,240,.3);padding-left:14px}
#ccl .hexlabel b{display:block;font:700 20px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.1em}
#ccl .hexlabel small{display:block;font:700 11px Rajdhani,sans-serif;letter-spacing:.18em;color:#8fa3c7}
#ccl .anchor{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
#ccl .tag{position:absolute;right:66px;top:-150px;font:700 22px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.16em;white-space:nowrap;text-align:right;text-shadow:0 2px 8px rgba(0,0,0,.7)}
#ccl .tag small{display:flex;justify-content:flex-end;gap:8px;align-items:center;font:700 12px Rajdhani,sans-serif;letter-spacing:.12em;color:#3fdf8f;margin-top:2px}
#ccl .hpm{display:inline-block;width:90px;height:5px;background:rgba(255,255,255,.15)}#ccl .hpm i{display:block;height:100%}
#ccl .leader{position:absolute;left:-80px;top:-110px;overflow:visible}
#ccl .dia{position:absolute;left:-12px;top:-12px;width:24px;height:24px;border:2px solid #3fdf8f;transform:rotate(45deg);box-shadow:0 0 10px rgba(63,223,143,.6)}
#ccl .dia::after{content:"";position:absolute;inset:5px;background:#3fdf8f}
#ccl .bub{position:absolute;right:84px;top:-92px;padding:12px 22px;background:#f2f4fa;color:#141826;white-space:nowrap;font:500 19px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.05em;clip-path:polygon(0 0,100% 0,100% 100%,6% 100%,0 72%);transition:opacity .3s,transform .3s}
#ccl .bub .who{display:block;font:700 11px Rajdhani,sans-serif;letter-spacing:.18em;color:#4a5a80;margin-bottom:2px}
#ccl .bub.off{opacity:0;transform:translateY(6px)}
#ccl .right{position:absolute;right:0;top:0;width:820px;height:760px;perspective:1500px}
#ccl .tilt{position:absolute;inset:0;transform-origin:100% 50%;transform:translateX(-36px) rotateY(-10deg) rotateZ(-1deg)}
#ccl .res{position:absolute;top:96px;left:96px;display:flex;gap:16px}
#ccl .ri{position:relative;display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;white-space:nowrap;background:linear-gradient(90deg,rgba(8,12,28,.92),rgba(14,22,46,.82));clip-path:polygon(4% 0,100% 0,96% 100%,0 100%)}
#ccl .ri::after{content:"";position:absolute;left:0;right:6px;bottom:0;height:2px;background:var(--c)}
#ccl .ri svg{width:22px;height:22px;flex:none;stroke:var(--c);fill:none;stroke-width:1.8}
#ccl .ri .k{font:500 12px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#8fa3c7}
#ccl .ri b{font:700 22px Rajdhani,Bahnschrift,sans-serif;letter-spacing:.04em}
#ccl .ib{position:absolute;top:40px;width:56px;height:52px;background:rgba(10,16,34,.86);border:1px solid rgba(120,170,230,.25);display:flex;align-items:center;justify-content:center}
#ccl .ib:hover{border-color:#3cc8ff}
#ccl .ib svg{width:26px;height:26px;stroke:#e8f2ff;fill:none;stroke-width:1.7}
#ccl .ib .nb{right:-10px;top:-10px;transform:scale(.8)}
#ccl .prio{position:absolute;left:258px;top:186px;width:528px;height:116px;cursor:pointer;clip-path:polygon(0 12%,100% 0,100% 100%,0 100%);transition:filter .2s}
#ccl .prio:hover{filter:brightness(1.15)}
#ccl .prio.alert{background:linear-gradient(100deg,#d8263f 0%,#a01f4f 50%,#4a1f5a 85%,rgba(40,30,80,.4) 100%)}
#ccl .prio.promo{background:linear-gradient(100deg,#e8a91c 0%,#c2741a 40%,#7a3f5e 78%,rgba(50,40,90,.45) 100%)}
#ccl .prio.mis{background:linear-gradient(100deg,#2f6fd6 0%,#4a4bc8 45%,#3a2f8a 80%,rgba(30,30,80,.4) 100%)}
#ccl .prio.calm{background:linear-gradient(100deg,#1f6f5a 0%,#1e4f6a 50%,rgba(20,40,70,.5) 100%)}
#ccl .prio .t{position:absolute;left:24px;top:20px;background:#fff;color:#151515;font:700 13px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.14em;padding:1px 8px}
#ccl .prio.alert .t{background:#f3e94b}
#ccl .prio h2{position:absolute;left:22px;top:42px;font:900 28px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.06em;white-space:nowrap;text-shadow:0 2px 0 rgba(0,0,0,.25)}
#ccl .prio p{position:absolute;left:24px;top:82px;font:500 14px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:rgba(255,240,245,.92);white-space:nowrap}
#ccl .prio .left{position:absolute;right:60px;top:22px;font:700 15px 'Noto Sans TC','Microsoft JhengHei',sans-serif;background:rgba(0,0,0,.3);padding:1px 10px}
#ccl .prio .dots{position:absolute;right:58px;bottom:14px;display:flex;gap:6px}
#ccl .prio .dots i{width:8px;height:8px;background:rgba(255,255,255,.35);transform:rotate(45deg)}#ccl .prio .dots i.on{background:#fff}
#ccl .main{position:absolute;left:170px;top:306px;width:616px;height:200px;overflow:hidden;background:repeating-linear-gradient(-60deg,rgba(255,255,255,.07) 0 2px,transparent 2px 22px),linear-gradient(100deg,#29b6ff,#2f86ff 60%,#3a6cf0);clip-path:polygon(0 22%,100% 0,100% 72%,95% 100%,0 100%);transition:filter .2s;color:#0b1430}
#ccl .main:hover{filter:brightness(1.12)}
#ccl .main::after{content:"";position:absolute;top:-20%;bottom:-20%;width:120px;left:-200px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-20deg);animation:cclshine 4.5s 1.4s infinite}
@keyframes cclshine{0%{left:-200px}22%,100%{left:760px}}
#ccl .main .ico{position:absolute;left:30px;top:46px;width:128px;height:128px}
#ccl .main .ico .r1{position:absolute;inset:0;animation:cclspin 14s linear infinite}
#ccl .main .ico .r2{position:absolute;inset:14px}
@keyframes cclspin{to{transform:rotate(360deg)}}
#ccl .main .op{position:absolute;left:188px;top:46px;font:700 13px Rajdhani,sans-serif;letter-spacing:.18em;color:#0d2050}
#ccl .main h1{position:absolute;left:184px;top:66px;font:900 58px/1 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.1em;white-space:nowrap}
#ccl .main .sub{position:absolute;left:190px;top:144px;font:700 16px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#0d2050;white-space:nowrap}
#ccl .main .sub em{font-style:normal;background:#0b1430;color:#7fe0ff;padding:0 8px;margin:0 4px}
#ccl .main .key{position:absolute;right:52px;top:92px;min-width:46px;height:46px;padding:0 6px;border:2px solid #0b1430;font:700 22px/42px Rajdhani,sans-serif;text-align:center}
#ccl .chev{position:absolute;right:46px;bottom:26px;display:flex}
#ccl .chev i{width:14px;height:22px;background:#0d2050;clip-path:polygon(0 0,50% 0,100% 50%,50% 100%,0 100%,50% 50%);margin-left:-3px;animation:cclchev 1.2s infinite}
#ccl .chev i:nth-child(2){animation-delay:.15s}#ccl .chev i:nth-child(3){animation-delay:.3s}
@keyframes cclchev{0%,100%{opacity:.35}40%{opacity:1}}
#ccl .tiles{position:absolute;left:186px;top:520px;display:flex;gap:10px}
#ccl .tile{position:relative;flex:none;width:148px;height:176px;background:linear-gradient(180deg,rgba(18,28,58,.92),rgba(8,14,32,.8));border-top:3px solid #3cc8ff;clip-path:polygon(9% 0,100% 0,91% 100%,0 100%);transition:transform .2s,background .2s}
#ccl .tile:hover{transform:translateY(-6px);background:linear-gradient(180deg,rgba(30,60,110,.95),rgba(10,14,32,.82))}
#ccl .tile svg{position:absolute;left:30px;top:18px;width:32px;height:32px;stroke:#3cc8ff;fill:none;stroke-width:1.8}
#ccl .tile .jp{position:absolute;right:30px;top:16px;writing-mode:vertical-rl;font:700 24px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.14em}
#ccl .tile .tn{position:absolute;left:24px;bottom:20px;writing-mode:vertical-rl;transform:rotate(180deg);font:700 10px Rajdhani,sans-serif;letter-spacing:.22em;color:#8fa3c7}
#ccl .tile .no{position:absolute;right:20px;bottom:6px;font:700 34px Rajdhani,sans-serif;color:transparent;-webkit-text-stroke:1px rgba(90,200,255,.45)}
#ccl .tile .note{position:absolute;left:16px;right:14px;bottom:52px;font:500 12px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#aab7cf;line-height:1.3;white-space:pre-line}
#ccl .tile .bd{position:absolute;left:76px;top:14px;width:15px;height:15px;background:#f3e94b;transform:rotate(45deg);box-shadow:0 0 10px rgba(243,233,75,.7)}
#ccl .tile.dis{opacity:.55;border-top-color:#4a5a78}#ccl .tile.dis svg{stroke:#6a7a98}
#ccl .tile.shop{border-top-color:#ffc24a}#ccl .tile.shop svg{stroke:#ffc24a}
#ccl .tiles.five .tile{width:116px}#ccl .tiles.five .tile .jp{right:22px;font-size:21px}#ccl .tiles.five .tile svg{left:24px}#ccl .tiles.five .tile .bd{left:50px;top:12px}
#ccl .endw{position:absolute;right:66px;top:766px;width:440px;height:82px;display:flex;align-items:center;gap:18px;padding:0 24px 0 30px;overflow:hidden;background:repeating-linear-gradient(-60deg,rgba(255,255,255,.035) 0 2px,transparent 2px 16px),linear-gradient(100deg,rgba(14,22,44,.95),rgba(24,38,72,.95));border-top:2px solid #3cc8ff;clip-path:polygon(7% 0,100% 0,100% 100%,0 100%);transition:filter .2s}
#ccl .endw:hover{filter:brightness(1.25)}
#ccl .endw .wk{display:flex;align-items:baseline;gap:6px;padding-right:18px;border-right:1px solid rgba(150,190,240,.2);white-space:nowrap}
#ccl .endw .wk b{font:700 34px/1 Rajdhani,sans-serif;color:#8fa3c7}#ccl .endw .wk b.n{color:#3cc8ff}
#ccl .endw .wk i{font-style:normal;font:700 20px Rajdhani,sans-serif;color:#3cc8ff;animation:cclchev 1.2s infinite}
#ccl .endw .tx b{display:block;font:900 25px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.12em;white-space:nowrap}
#ccl .endw .tx small{display:block;font:700 11px Rajdhani,sans-serif;letter-spacing:.24em;color:#8fa3c7}
#ccl .endw .warn{margin-left:auto;padding:4px 10px;background:#ff4d5e;font:700 16px Rajdhani,sans-serif;white-space:nowrap;box-shadow:0 0 14px rgba(255,77,94,.5)}
#ccl .plate{position:absolute;left:34px;top:796px}
#ccl .plate .sq{font:700 14px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.14em;color:#3fdf8f;margin-left:22px;white-space:nowrap}
#ccl .plate .sq span{font-family:Rajdhani,sans-serif;color:#9fe8c0}
#ccl .plate h3{font:900 48px/1.08 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.1em;border-left:5px solid #3fdf8f;padding-left:18px;margin-top:2px;white-space:nowrap;text-shadow:0 3px 10px rgba(0,0,0,.6)}
#ccl .plate h3 small{font:500 18px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#8fa3c7;margin-left:12px;letter-spacing:.06em}
#ccl .plate .xp{display:flex;align-items:center;gap:10px;margin-top:8px;font:700 14px Rajdhani,sans-serif;letter-spacing:.12em;white-space:nowrap}
#ccl .plate .xp em{font-style:normal;color:#3fdf8f}
#ccl .ships{position:absolute;left:38px;top:928px;display:flex;gap:10px;transform:rotate(-4deg);transform-origin:0 100%}
#ccl .ship{display:flex;flex-direction:column;justify-content:center;height:46px;padding:0 22px 0 26px;min-width:150px;background:rgba(10,16,36,.88);clip-path:polygon(7% 0,100% 0,93% 100%,0 100%);white-space:nowrap}
#ccl .ship:hover{background:rgba(30,50,90,.92)}
#ccl .ship .t{font:500 15px 'Noto Sans TC','Microsoft JhengHei',sans-serif}
#ccl .ship .t i{font:700 12px Rajdhani,sans-serif;font-style:normal;color:#3cc8ff;margin-right:8px}
#ccl .ship .bars{display:flex;gap:3px;margin-top:4px}
#ccl .ship .bars span{height:4px;background:rgba(255,255,255,.15);flex:1}#ccl .ship .bars span i{display:block;height:100%}
#ccl .ship.on{background:#3fdf8f;color:#062014}#ccl .ship.on .t i{color:#062014}#ccl .ship.on .bars span{background:rgba(0,0,0,.25)}
#ccl .camread{position:absolute;left:50%;translate:-50% 0;top:982px;display:flex;gap:28px;font:600 13px Rajdhani,sans-serif;letter-spacing:.18em;color:#c9d6f0;white-space:nowrap}
#ccl.ready .camread.enter{translate:-50% 0}
#ccl .camread b{color:#3cc8ff;font-weight:600}
#ccl .tools{position:absolute;right:62px;top:900px;display:flex;gap:14px;transform:perspective(600px) rotateY(-14deg)}
#ccl .tools .ib{position:static;width:auto;min-width:56px;height:54px;padding:0 16px;gap:10px;font:700 15px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.1em}
#ccl .tools kbd{font:700 12px Rajdhani,sans-serif;border:1px solid #8fa3c7;padding:0 5px;color:#8fa3c7}
#ccl .news{position:absolute;left:60px;right:80px;top:1006px;height:54px;display:flex;align-items:center;border-top:1px solid rgba(90,200,255,.32);border-bottom:1px solid rgba(90,200,255,.32);background:linear-gradient(90deg,rgba(6,10,22,.6),rgba(6,10,22,.88))}
#ccl .news .label{margin-left:86px;padding:3px 18px;background:#3cc8ff;color:#06122a;font:700 15px 'Noto Sans TC','Microsoft JhengHei',sans-serif;letter-spacing:.3em;clip-path:polygon(10% 0,100% 0,90% 100%,0 100%);white-space:nowrap}
#ccl .ticker{position:relative;flex:1;height:100%;overflow:hidden;margin:0 24px;-webkit-mask:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
#ccl .ticker .track{position:absolute;top:50%;transform:translateY(-50%);white-space:nowrap;font:500 18px 'Noto Sans TC','Microsoft JhengHei',sans-serif;animation:ccltick 60s linear infinite}
#ccl .ticker .track span{margin-right:40px}#ccl .ticker .track span::after{content:"◆";margin-left:40px;font-size:13px;color:#fff}
@keyframes ccltick{from{transform:translate(0,-50%)}to{transform:translate(-50%,-50%)}}
#ccl .wkc{font:600 30px Rajdhani,sans-serif;color:#3cc8ff;margin-right:60px;white-space:nowrap}
#ccl .wkc small{font:500 15px 'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#8fa3c7;margin:0 4px}
`;

const CCL_ICON = {
  mis: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  fac: '<path d="M5 3v18M5 4h11l-2 4 2 4H5"/>',
  log: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.5M12 17v.5"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M8.5 9.5c0-1.5 1.5-2.2 3.5-2.2s3.5.8 3.5 2.2-1.5 2-3.5 2.4-3.5 1-3.5 2.5 1.5 2.3 3.5 2.3 3.5-.8 3.5-2.3"/>',
  rp: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/>',
  merit: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  mail: '<rect x="3" y="6" width="18" height="13"/><path d="M3 7l9 6 9-6"/>',
  gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  sq: '<path d="M3 15l9-9 9 9M6 19l6-6 6 6"/>',
  yard: '<path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6"/>',
  planet: '<circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-20 12 12)"/>',
  shop: '<path d="M4 8h16l-1.5 12h-13z"/><path d="M8.5 8V6a3.5 3.5 0 017 0v2"/>',
  fly: '<path d="M3 12l16-7-5 16-3-6z"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const CCL_RANK_ICON = [
  '<path d="M8 26l15-9 15 9" stroke="#e8f2ff" stroke-width="4" fill="none"/>',
  '<path d="M8 22l15-9 15 9M8 32l15-9 15 9" stroke="#e8f2ff" stroke-width="4" fill="none"/>',
  '<path d="M8 18l15-9 15 9M8 27l15-9 15 9M8 36l15-9 15 9" stroke="#e8f2ff" stroke-width="3.6" fill="none"/>',
  '<path d="M23 2l3 7 7 .6-5.4 4.6 1.7 7L23 17.6 16.7 21.2l1.7-7L13 9.6 20 9z" fill="#f3e94b"/><path d="M8 28l15-8 15 8M8 37l15-8 15 8" stroke="#e8f2ff" stroke-width="3.6" fill="none"/>',
];
const cclSeg = (n, on, col) => `<div class="seg" style="--sc:${col || '#3cc8ff'}">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>`;
// 這一級的經驗進度（CAP_XP.lv＝每一級的門檻；滿級＝滿格）
const cclXpFrac = (c) => { const L = CAP_XP.lv, v = Math.max(1, c.lv || 1); return v >= L.length ? 1 : Math.max(0, Math.min(1, ((c.xp || 0) - L[v - 1]) / (L[v] - L[v - 1]))); };
const cclHpCol = (v) => v > 0.6 ? '#3fdf8f' : v > 0.3 ? '#f3e94b' : '#ff4d5e';

// ───── 從存檔整理出大廳要的資料 ─────
// 駐守、敵軍預定開進的小隊：勝率與旗艦的存活率（和星圖小隊面板的 ccThreat 同一套算法）
function cclThreats(S) {
  const out = [];
  for (const Q of S.sq.filter((q) => q.pl && q.ships.length && q.to == null && !q.task)) {
    const A = ccThreatA(S, Q, Q.sys); if (!A.length) continue;
    const s = S.sys[Q.sys], D = [Q, ...S.sq.filter((q) => q !== Q && q.fac === S.fac && q.ships.length && !q.task && (q.to != null ? q.to : q.sys) === Q.sys)].slice(0, CC_RULE.maxSq);
    const O = ccOdds(S, A.slice(0, CC_RULE.maxSq), D, s.owner === S.fac ? ccDefsAlive(s) : [], 1), sv = (O.surv[1] && O.surv[1][0]) || [];
    out.push({ q: Q, s, win: 1 - O.win, surv: sv.length ? Math.min(...sv) : null, n: A.reduce((a, q) => a + q.ships.length, 0) });
  }
  return out;
}
function cclPrio(S) {
  const L = [];
  for (const T of cclThreats(S)) L.push({ k: 'alert', tag: '⚠ 下週敵軍來襲', title: `${T.q.name}・駐守 ${T.s.name}`, sub: `敵軍 ${T.n} 艘・駐守勝率 ${Math.round(T.win * 100)}%${T.surv != null ? `・最低存活率 ${Math.round(T.surv * 100)}%` : ''}・點這裡下令`, left: '下週', go: () => { CC.cur = T.q.id; CC.sel = T.s.id; cclToMap(); } });
  const open = S.missions.filter((M) => M.state === 'open').sort((a, b) => (b.exam ? 1 : 0) - (a.exam ? 1 : 0) || a.due - b.due);
  for (const M of open.slice(0, 2)) {
    const t = S.sys[M.sys];
    L.push({ k: M.exam ? 'promo' : 'mis', tag: M.exam ? '升遷考核' : '任務', title: `${ccMisName(M)} ${t.name}`, sub: M.exam ? `完成就升任${M.exam}` : `報酬：資金 ${M.reward.money}・戰功 ${M.reward.merit}`, left: `剩 ${M.due - S.turn} 週`, go: () => { cclToMap(); ccBrief(M, true); } });
  }
  if (!L.length) L.push({ k: 'calm', tag: '狀況', title: '這週沒有急事', sub: '可以整備、研發，或打開星圖找下一個目標', left: '', go: () => cclToMap() });
  return L;
}
function cclLines(S, P) {
  const L = [], T = cclThreats(S);
  if (T.length) L.push(`${T[0].q.name}下週會被攻擊，要撤還是守？`);
  P.ships.forEach((c, i) => { if (c.hp < 0.5) L.push(`${i + 1} 號艦的船體只剩 ${Math.round(c.hp * 100)}%。`); });
  const M = S.missions.filter((x) => x.state === 'open').sort((a, b) => a.due - b.due)[0];
  if (M && M.due - S.turn <= 2) L.push(`「${ccMisName(M)}」只剩 ${M.due - S.turn} 週了。`);
  if (!ccT(S).cur) L.push('研發閒著，可以開始下一項。');
  if (P.ships.some((c) => CAP_HULLS[c.key].msl && c.msl < 0.5)) L.push('飛彈不多了，找補給站補一下。');
  if (!L.length) L.push(`${S.sys[P.sys].name}一切正常。`, '下一步要去哪裡？');
  return L;
}

// ───── 畫面 ─────
function cclRender() {
  const S = CC.S, P = S && ccPl(S); if (!S || !P || !CCL.el) return;
  const s = S.sys[P.sys], rk = ccRankOf(S), next = CC_RANKS[(S.pl.rank || 0) + 1], own = S.sq.filter((q) => q.pl && q.ships.length);
  const mer = S.pl.merit, frac = next ? Math.min(1, mer / next.merit) : 1, nMis = S.missions.filter((M) => M.state === 'open').length;
  const threats = cclThreats(S), moving = own.filter((q) => q.to != null).length, T = ccT(S);
  const yardOk = s.owner === S.fac && s.yard, shopOk = !!s.shop, rel = ccFacCol(S, s.owner);
  if (CCL.sel >= P.ships.length) CCL.sel = 0;
  const F = P.ships[CCL.sel], Hn = (c) => CAP_HULLS[c.key].name;
  const logs = S.log.slice(-10).reverse().map((x) => `<span><b style="color:${x.c === 'ok' ? '#3fdf8f' : x.c === 'bad' ? '#ff8a8a' : x.c === 'ev' ? '#c9a7ff' : '#8fa3c7'}">【第 ${x.turn} 週】</b>${smuEsc(String(x.t).replace(/<[^>]+>/g, ''))}</span>`).join('');
  const prio = cclPrio(S); if (CCL.prio >= prio.length) CCL.prio = 0; const Pr = prio[CCL.prio];
  CCL.el.innerHTML = `<div class="st"><div class="vig"></div><div class="ui">
    <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
    <div class="status enter" style="--dy:-20px"><span class="live">停泊中</span><span>WEEK ${S.turn}</span><span class="sep">／</span><span class="zh">${smuEsc(s.name)}</span><span class="sep">／</span><span class="zh">${CAP_SPACE[s.scene || 'belt'].name}</span><span class="sep">／</span><span class="zh" style="color:${rel}">${SM_FAC[s.owner].name}</span></div>
    <div class="rank enter" style="--dx:-40px;--d:.05s">
      <div class="ring"><svg class="r" viewBox="0 0 104 104"><circle cx="52" cy="52" r="46" stroke="rgba(120,150,190,.25)" stroke-width="5" fill="none"/><circle cx="52" cy="52" r="46" stroke="#3cc8ff" stroke-width="5" fill="none" stroke-dasharray="289" stroke-dashoffset="${289 * (1 - frac)}" style="filter:drop-shadow(0 0 4px #3cc8ff)"/></svg>
        <div class="ins"><svg viewBox="0 0 46 40" width="46" height="40">${CCL_RANK_ICON[Math.min(3, S.pl.rank || 0)]}</svg><small>RANK</small></div></div>
      <div class="rk-id">CAPTAIN <span>／ ${CC_ROLES[S.role].name}・${CC_DIFF[S.diff].name}</span></div>
      <div class="rk-name">${rk.name}</div>
      <div class="rk-lab"><span>戰功 <b>${fmtN(Math.round(mer))}</b>${next ? ` / ${fmtN(next.merit)}` : ''}</span><span>${next ? `→ ${next.name}考核` : '最高軍階'}</span></div>
      <div class="rk-bar">${cclSeg(44, Math.round(44 * frac))}</div></div>
    <nav class="hexmenu">
      ${[['mis', '任務', 'MISSIONS', 0, 0, nMis], ['fac', '勢力', 'FACTIONS', 66, 94], ['log', '紀錄', 'LOG', 0, 188], ['help', '說明', 'GUIDE', 66, 282]].map(([k, n, en, x, y, b], i) =>
        `<button class="hexitem enter" data-ccl="${k}" style="left:${x}px;top:${y}px;--dx:-40px;--d:${.15 + i * .07}s"><div class="hex"><svg viewBox="0 0 24 24">${CCL_ICON[k]}</svg></div>${b ? `<span class="nb">${b}</span>` : ''}<div class="hexlabel"><b>${n}</b><small>${en}</small></div></button>`).join('')}
    </nav>
    <div class="right"><div class="tilt">
      <div class="res enter" style="--dy:-20px;--d:.1s">
        <button class="ri" data-ccl="map" style="--c:#f3e94b"><svg viewBox="0 0 24 24">${CCL_ICON.money}</svg><span class="k">資金</span><b>${fmtN(Math.round(S.pl.money))}</b></button>
        <button class="ri" data-ccl="tech" style="--c:#3cc8ff"><svg viewBox="0 0 24 24">${CCL_ICON.rp}</svg><span class="k">研究點</span><b>${fmtN(Math.round(S.pl.rp || 0))}</b></button>
        <div class="ri" style="--c:#3fdf8f"><svg viewBox="0 0 24 24">${CCL_ICON.merit}</svg><span class="k">戰功</span><b>${fmtN(Math.round(mer))}</b></div></div>
      <button class="ib enter" data-ccl="report" style="left:654px;--dy:-20px;--d:.15s" title="上週的戰報"><svg viewBox="0 0 24 24">${CCL_ICON.mail}</svg></button>
      <button class="ib enter" data-ccl="gear" style="left:722px;--dy:-20px;--d:.18s" title="設定"><svg viewBox="0 0 24 24">${CCL_ICON.gear}</svg></button>
      <div class="prio enter ${Pr.k}" data-ccl="prio" style="--dx:60px;--d:.3s"><span class="t">${Pr.tag}</span>${Pr.left ? `<span class="left">${Pr.left}</span>` : ''}<h2>${smuEsc(Pr.title)}</h2><p>${smuEsc(Pr.sub)}</p>${prio.length > 1 ? `<div class="dots">${prio.map((_, i) => `<i class="${i === CCL.prio ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>
      <button class="main enter" data-ccl="map" style="--dx:80px;--d:.4s">
        <div class="ico"><svg class="r1" viewBox="0 0 128 128"><circle cx="64" cy="64" r="60" stroke="#0b1430" stroke-width="3" stroke-dasharray="4 6" fill="none"/></svg>
          <svg class="r2" viewBox="0 0 100 100" fill="#0b1430" stroke="#0b1430" stroke-width="3"><path d="M22 70L46 30L78 46L60 78Z" fill="none"/><circle cx="22" cy="70" r="7"/><circle cx="46" cy="30" r="7"/><circle cx="78" cy="46" r="7"/><circle cx="60" cy="78" r="9" fill="#7fe0ff"/></svg></div>
        <span class="op">STAR MAP ・ ORDERS</span><h1>星圖・下令</h1>
        <span class="sub">${own.length} 個小隊${moving ? `・<em>${moving} 隊</em>移動中` : '・都在原地'}</span>
        <span class="key">${keyText('cap_map')}</span><div class="chev"><i></i><i></i><i></i></div></button>
      <div class="tiles ${shopOk ? 'five' : ''}">
        <button class="tile enter" data-ccl="sq" style="--dy:30px;--d:.5s"><svg viewBox="0 0 24 24">${CCL_ICON.sq}</svg><span class="jp">小隊</span><span class="tn">SQUADS</span><span class="no">01</span></button>
        <button class="tile enter ${yardOk ? '' : 'dis'}" data-ccl="yard" style="--dy:30px;--d:.56s"><svg viewBox="0 0 24 24">${CCL_ICON.yard}</svg><span class="jp">船塢</span>${yardOk ? '' : '<span class="note">這裡沒有\n你的船塢</span>'}<span class="tn">SHIPYARD</span><span class="no">02</span></button>
        <button class="tile enter" data-ccl="tech" style="--dy:30px;--d:.62s"><svg viewBox="0 0 24 24">${CCL_ICON.rp}</svg>${T.cur ? '' : '<i class="bd"></i>'}<span class="jp">研發</span><span class="tn">RESEARCH</span><span class="no">03</span></button>
        <button class="tile enter" data-ccl="planet" style="--dy:30px;--d:.68s"><svg viewBox="0 0 24 24">${CCL_ICON.planet}</svg><span class="jp">星球</span><span class="tn">PLANET</span><span class="no">04</span></button>
        ${shopOk ? `<button class="tile shop enter" data-ccl="shop" style="--dy:30px;--d:.74s"><svg viewBox="0 0 24 24">${CCL_ICON.shop}</svg><span class="jp">${CC_SHOP[s.shop].name}</span><span class="tn">SHOP</span><span class="no">05</span></button>` : ''}
      </div></div></div>
    <button class="endw enter" data-ccl="end" style="--dx:40px;--d:.65s"><div class="wk"><b>W${S.turn}</b><i>▸</i><b class="n">W${S.turn + 1}</b></div><div class="tx"><b>結束這一週</b><small>END WEEK</small></div>${threats.length ? `<span class="warn">⚠ ${threats.length}</span>` : ''}</button>
    <div class="plate enter" style="--dx:-40px;--d:.45s"><div class="sq">★ ${smuEsc(P.name)} <span>／ ${P.ships.length} SHIPS</span></div>
      <h3>${CCL.sel + 1} 號艦<small>${Hn(F)}${ccMkTag(F).replace(/<[^>]+>/g, '')}</small></h3>
      <div class="xp">SHIP <em>Lv.${F.lv || 1}</em>${cclSeg(22, Math.round(22 * cclXpFrac(F)), '#3fdf8f')}</div></div>
    <div class="ships enter" style="--dx:-40px;--d:.55s">${P.ships.map((c, i) => `<button class="ship ${i === CCL.sel ? 'on' : ''}" data-ship="${i}"><span class="t"><i>${i + 1}</i>${Hn(c)}</span><span class="bars"><span><i style="width:${c.hp * 100}%;background:${i === CCL.sel ? '#062014' : cclHpCol(c.hp)}"></i></span><span><i style="width:${c.sh * 100}%;background:${i === CCL.sel ? '#0b3a24' : '#5aa8ff'}"></i></span></span></button>`).join('')}</div>
    <div class="camread enter" style="--dy:10px;--d:.7s"><span>CAM <b id="ccl-cam">WIDE</b></span><span>${keyText('cap_dock')} <b>巡航</b></span><span>1–${P.ships.length} <b>看船</b></span></div>
    <div class="tools enter" style="--dx:30px;--d:.6s"><button class="ib" data-ccl="fly" title="親自開船"><svg viewBox="0 0 24 24">${CCL_ICON.fly}</svg>巡航<kbd>${keyText('cap_dock')}</kbd></button><button class="ib" data-ccl="hide" title="隱藏介面"><svg viewBox="0 0 24 24">${CCL_ICON.eye}</svg></button></div>
    <div class="news enter" style="--dy:20px;--d:.75s"><span class="label">情報</span><div class="ticker"><div class="track">${logs}${logs}</div></div><span class="wkc"><small>第</small>${S.turn}<small>週</small></span></div>
  </div>
  <div class="anchor" id="ccl-anchor"><div class="dia"></div><svg class="leader" width="80" height="110"><path d="M80 110 L20 30 L14 30" stroke="rgba(63,223,143,.75)" stroke-width="1.5" fill="none"/></svg>
    <div class="tag">${CCL.sel + 1} 號艦・${Hn(F)}<small>HULL ${Math.round(F.hp * 100)}% <span class="hpm"><i style="width:${F.hp * 100}%;background:${cclHpCol(F.hp)}"></i></span></small></div>
    <div class="bub off" id="ccl-bub"><span class="who">ADJUTANT</span><span id="ccl-say"></span></div></div></div>`;
  cclFit();
  CCL.el.querySelectorAll('[data-ccl]').forEach((b) => b.addEventListener('click', () => cclAct(b.dataset.ccl, b)));
  CCL.el.querySelectorAll('[data-ship]').forEach((b) => b.addEventListener('click', () => cclPick(+b.dataset.ship)));
}
function cclFit() {
  const st = CCL.el && CCL.el.querySelector('.st'); if (!st) return;
  CCL.k = Math.min(innerWidth / 1920, innerHeight / 1080); st.style.transform = `scale(${CCL.k}) translate(-50%,-50%)`;
}
// 打開星圖（暫停巡航的場景、收起大廳），之後的視窗都疊在星圖上
function cclToMap() { if (!CC.over) ccMapOpen(); }
function cclAct(k) {
  const S = CC.S, P = ccPl(S), s = S.sys[P.sys];
  if (k === 'map') return cclToMap();
  if (k === 'end') { cclToMap(); return ccEndWeek(); }
  if (k === 'prio') { const L = cclPrio(S); return (L[CCL.prio] || L[0]).go(); }
  if (k === 'mis') { cclToMap(); return ccdOpen('mis'); }
  if (k === 'fac' || k === 'help') { CC.leg = k === 'help' ? true : CC.leg; return cclToMap(); }
  if (k === 'log') { cclToMap(); return ccdOpen('log', { mode: 'all' }); }
  if (k === 'report') { cclToMap(); return ccdOpen('log', { mode: 'week' }); }
  if (k === 'gear') return openSettings();
  if (k === 'sq') { CC.cur = P.id; cclToMap(); return ccSquadsView(); }
  if (k === 'yard') { if (!(s.owner === S.fac && s.yard)) return toast('這個星系沒有你的勢力的維修船塢', 'warn'); cclToMap(); return ccYardView(s); }
  if (k === 'tech') { cclToMap(); return ccTechView(); }
  if (k === 'planet') { cclToMap(); return cpView(s); }
  if (k === 'shop') { if (!s.shop) return; cclToMap(); return ccShopView(s); }
  if (k === 'fly') return cclCruise();
  if (k === 'hide') { CCL.el.classList.add('noui'); CCL.hideUi = true; }
}
function cclPick(i) {
  const P = ccPl(CC.S); if (!P || !P.ships[i]) return;
  CCL.sel = i; CCL.shot = 1; CCL.shotT = performance.now(); cclRender(); CCL.el.classList.add('ready'); cclFlash();
}
function cclFlash() { if (!CCL.el) return; CCL.el.classList.remove('flash'); void CCL.el.offsetWidth; CCL.el.classList.add('flash'); }

// ───── 停泊／巡航 ─────
function cclShow() {
  if (!ccIdleOn() || !CC.S || !ccPl(CC.S)) return;
  CCL.on = true; CCL.dock = true; document.body.classList.add('ccl-on');
  if (document.pointerLockElement) document.exitPointerLock();
  CAP.thr = 0; CAP.fire.fill(false); CAP.keys.clear();
  if (CAP.el) CAP.el.hidden = true;
  if (!CCL.el) {
    if (!gEl('ccl-css')) { const st = document.createElement('style'); st.id = 'ccl-css'; st.textContent = CCL_CSS; document.head.appendChild(st); }
    CCL.el = document.createElement('div'); CCL.el.id = 'ccl'; document.body.appendChild(CCL.el);
    CCL.el.addEventListener('click', () => { if (CCL.hideUi) { CCL.hideUi = false; CCL.el.classList.remove('noui'); } }, true);
    addEventListener('resize', cclFit);
  }
  CCL.el.hidden = false; CCL.el.classList.remove('ready', 'noui'); CCL.hideUi = false;
  CCL.shot = 0; CCL.shotT = performance.now(); CCL.prioT = CCL.shotT; CCL.sayT = CCL.shotT + 1800;
  cclRender();
  requestAnimationFrame(() => setTimeout(() => CCL.el && CCL.el.classList.add('ready'), 120));
  if (!CCL.raf) CCL.raf = requestAnimationFrame(cclLoop);
}
// 收起大廳（keepDock：等一下會回來，例如打開星圖）
function cclHide(keepDock) {
  if (!keepDock) CCL.dock = false;
  CCL.on = false; CAP_FX.cam = null; document.body.classList.remove('ccl-on');
  if (CCL.el) CCL.el.hidden = true;
  if (CAP.el && ccIdleOn() && !keepDock) CAP.el.hidden = false;
}
function cclRemove() {
  CCL.on = false; CAP_FX.cam = null; document.body.classList.remove('ccl-on');
  if (CCL.el) { CCL.el.remove(); CCL.el = null; removeEventListener('resize', cclFit); }
  if (CCL.raf) { cancelAnimationFrame(CCL.raf); CCL.raf = 0; }
}
function cclCruise() {
  cclHide(false);
  CAP.thr = 0.5; capFeed(`巡航：親自開船・按 ${keyText('cap_dock')} 回到停泊`, 'hint');
  capLock();
}
// 巡航時的按鍵（captain.js 的 capKey 先問這裡）：回傳 true＝吃掉這個鍵
function cclKey(e, is) {
  if (!ccIdleOn() || CC.over) return false;
  const k = e.code;
  if (CCL.on) {
    if (is('cap_dock')) { cclCruise(); return true; }
    if (is('cap_map')) { cclToMap(); return true; }
    const d = /^Digit([1-5])$/.exec(k); if (d) { cclPick(+d[1] - 1); return true; }
    if (k === 'Escape' && CCL.hideUi) { CCL.hideUi = false; CCL.el.classList.remove('noui'); return true; }
    return true;   // 停泊時其他鍵都不開船
  }
  if (is('cap_dock')) { cclShow(); return true; }
  return false;
}

// 鏡頭：遠景與單艦輪流（8 秒），慢慢繞；名牌跟著選中的船
const CCL_SHOTS = [{ name: 'WIDE', d: 7.5, el: 0.22, sx: 0.32 }, { name: 'SHIP', d: 3.2, el: 0.1, sx: 0.36 }, { name: 'WIDE', d: 9, el: 0.32, sx: 0.3 }, { name: 'SHIP', d: 2.6, el: 0.06, sx: 0.38 }];
const _cclP = new THREE.Vector3();
function cclLoop(t) {
  CCL.raf = 0;
  if (!CCL.el) return;
  if (!ccIdleOn()) { cclRemove(); return; }
  CCL.raf = requestAnimationFrame(cclLoop);
  if (!CCL.on) return;
  const now = performance.now(), dt = Math.min(0.1, (now - (CCL.lt || now)) / 1000); CCL.lt = now;
  if (now - CCL.shotT > 8000) { CCL.shot = (CCL.shot + 1) % CCL_SHOTS.length; CCL.shotT = now; cclFlash(); }
  if (now - CCL.prioT > 6000) { CCL.prioT = now; CCL.prio++; const S = CC.S; if (S && CCL.el.querySelector('.prio')) { const L = cclPrio(S); CCL.prio %= L.length; if (L.length > 1) { cclRender(); CCL.el.classList.add('ready'); } } }
  if (now > CCL.sayT) cclSay(now);
  CCL.yaw += dt * 0.035;
  const V = CCL_SHOTS[CCL.shot], own = CAP.own, k = Math.min(CCL.sel, own.length - 1), sh = own[k];
  if (!sh) return;
  const wide = V.name === 'WIDE';
  CAP_FX.cam = { k: sh.k != null ? sh.k : k, yaw: Math.PI * 0.5 + Math.sin(CCL.yaw) * 0.55, el: V.el, d: wide ? V.d * (own.length > 1 ? 1.25 : 1) : V.d, sx: V.sx };
  const lab = gEl('ccl-cam'); if (lab) lab.textContent = wide ? `${V.name}-0${CCL.shot + 1}` : `SHIP-0${k + 1}`;
  // 名牌：船在畫面上的位置 → 大廳的 1920×1080 座標
  const an = gEl('ccl-anchor'); if (!an) return;
  shipWorldCPU(sh.i, _cclP);
  const p = capScr(_cclP.x, _cclP.y + sh.L * 0.2, _cclP.z);
  if (!p) { an.style.opacity = 0; return; }
  const r = canvas.getBoundingClientRect(), sc = CCL.k || 1, ox = (innerWidth - 1920 * sc) / 2, oy = (innerHeight - 1080 * sc) / 2;
  const x = (r.left + p[0] * r.width / VW - ox) / sc, y = (r.top + p[1] * r.height / VH - oy) / sc;
  an.style.opacity = 1; an.style.transform = `translate(${Math.max(620, Math.min(1180, x))}px,${Math.max(330, Math.min(820, y))}px)`;
}
function cclSay(now) {
  const S = CC.S, P = S && ccPl(S), b = gEl('ccl-bub'), say = gEl('ccl-say'); if (!P || !b || !say) { CCL.sayT = now + 9000; return; }
  const L = cclLines(S, P), txt = L[CCL.sayI++ % L.length];
  CCL.sayT = now + 9500; b.classList.remove('off'); say.textContent = '';
  let i = 0; const iv = setInterval(() => { if (!say.isConnected) return clearInterval(iv); say.textContent = txt.slice(0, ++i); if (i >= txt.length) { clearInterval(iv); setTimeout(() => b.isConnected && b.classList.add('off'), 3400); } }, 70);
}
