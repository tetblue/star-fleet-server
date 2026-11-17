/* 艦長模式 UI demo — shared helpers. Load after the page markup:
   <div id="stage"><canvas id="bg"></canvas><div class="ui">…</div></div>
   <script src="cap-ui.js"></script> then page script calls capBg({...}) etc. */
(function () {
  const stage = document.getElementById('stage');
  function fit() { const s = Math.min(innerWidth / 1920, innerHeight / 1080); stage.style.transform = `scale(${s}) translate(-50%,-50%)`; }
  addEventListener('resize', fit); fit();

  // RGB-split filter used by .glitch, corner frame, demo link
  document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute"><filter id="rgb">
    <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/><feOffset in="r" dx="-8" result="r2"/>
    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" result="gb"/><feOffset in="gb" dx="8" result="gb2"/>
    <feBlend in="r2" in2="gb2" mode="screen"/></filter></svg>`);
  if (!stage.dataset.noframe) stage.insertAdjacentHTML('beforeend', '<div class="corner c-tl"></div><div class="corner c-tr"></div><div class="corner c-bl"></div><div class="corner c-br"></div>');
  if (!/index\.html?$/.test(location.pathname)) stage.insertAdjacentHTML('beforeend', '<a id="demohome" href="index.html">◀ DEMO INDEX</a>');
  // toast + modal containers
  stage.insertAdjacentHTML('beforeend', '<div class="modal" id="modal"><div class="mbox" id="mbox"></div></div><div class="toast" id="toast"></div>');

  const $ = (id) => document.getElementById(id);
  let toastT;
  const CAP = window.CAP = {
    $,
    fmt: (n) => Math.round(n).toLocaleString('en-US'),
    /** segmented bar html: n cells, on filled, colour var */
    seg(n, on, col) { return `<div class="segbar" style="--sc:${col || 'var(--cyan)'}">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>`; },
    bar(v, col, cls = '') { return `<div class="bar ${cls}" style="--bc:${col || 'var(--own)'}"><i style="width:${Math.max(0, Math.min(1, v)) * 100}%"></i></div>`; },
    hpCol: (v) => v > .6 ? 'var(--own)' : v > .3 ? 'var(--yellow)' : 'var(--red)',
    toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); },
    modal(html) { $('mbox').innerHTML = html; $('modal').classList.add('on'); },
    close() { $('modal').classList.remove('on'); },
    glitch(ms = 300) { stage.classList.add('glitch'); setTimeout(() => stage.classList.remove('glitch'), ms); },
    /** typewriter into el */
    type(el, txt, ms = 80, done) { el.textContent = ''; let i = 0; const iv = setInterval(() => { el.textContent = txt.slice(0, ++i); if (i >= txt.length) { clearInterval(iv); done && done(); } }, ms); },
    /** standard page header */
    head({ title, en, crumb = '', back = '返回' }) {
      return `<div class="phead enter" style="--dx:-30px"><button class="back" data-act="${back}" title="${back}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="ptitle"><span class="en">${en}</span><h1>${title}</h1>${crumb ? `<span class="crumb">${crumb}</span>` : ''}</div></div>`;
    },
    /** resource bar: [[label, value, colour, iconKey], …] */
    res(list) {
      return `<div class="resbar enter" style="--dy:-20px;--d:.05s">${list.map(([k, v, c, ic]) => `<div class="res-item" style="--c:${c}"><svg viewBox="0 0 24 24">${CAP.icon[ic] || ''}</svg><span class="k">${k}</span><b>${v}</b></div>`).join('')}</div>`;
    },
    icon: {
      money: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M8.5 9.5c0-1.5 1.5-2.2 3.5-2.2s3.5.8 3.5 2.2-1.5 2-3.5 2.4-3.5 1-3.5 2.5 1.5 2.3 3.5 2.3 3.5-.8 3.5-2.3"/>',
      rp: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/>',
      merit: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
      week: '<rect x="4" y="5" width="16" height="15"/><path d="M4 10h16M9 3v4M15 3v4"/>',
      ship: '<path d="M3 15l9-9 9 9M6 19l6-6 6 6"/>',
      yard: '<path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6"/>',
      planet: '<circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-20 12 12)"/>',
      shop: '<path d="M4 8h16l-1.5 12h-13z"/><path d="M8.5 8V6a3.5 3.5 0 017 0v2"/>',
      map: '<path d="M5 17L9 7l7 4-4 8z"/><circle cx="5" cy="17" r="2"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="11" r="2"/><circle cx="12" cy="19" r="2"/>',
      mission: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
      log: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h4"/>',
      flag: '<path d="M5 3v18M5 4h11l-2 4 2 4H5"/>',
      gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
      wrench: '<path d="M14.5 6.5a4 4 0 00-5.4 5.1L4 16.7 7.3 20l5.1-5.1a4 4 0 005.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
      target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
      warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
      play: '<path d="M7 4l13 8-13 8z"/>',
    },
  };

  // hull data (from captain.js / caphulls.js / capcareer.js CC_RULE) + side silhouettes for cards
  CAP.HULLS = {
    assault: { name: '突擊艦', en: 'ASSAULT', hp: 300, sh: 160, price: 500, weeks: 1, pts: '2,30 10,22 40,20 48,10 62,10 66,20 112,24 132,31 112,38 12,40' },
    gunship: { name: '重砲艦', en: 'GUNSHIP', hp: 620, sh: 320, price: 900, weeks: 3, pts: '2,26 8,16 30,16 36,4 54,4 58,16 100,18 120,24 136,30 120,38 96,42 10,44' },
    support: { name: '支援艦', en: 'SUPPORT', hp: 420, sh: 260, price: 700, weeks: 2, pts: '2,24 14,16 52,14 58,6 72,6 76,14 110,18 128,28 110,36 60,42 14,40' },
    ew:      { name: '電戰艦', en: 'EW', hp: 380, sh: 240, price: 800, weeks: 2, pts: '2,26 12,20 50,18 56,10 70,10 74,18 112,22 132,29 112,36 14,40', dish: true },
    stealth: { name: '匿蹤艦', en: 'STEALTH', hp: 240, sh: 120, price: 850, weeks: 2, pts: '2,30 30,24 80,22 136,30 80,36 30,36' },
  };
  CAP.hullSvg = (k, col = 'var(--cyan)', w = 140) => { const H = CAP.HULLS[k];
    return `<svg viewBox="0 0 140 50" width="${w}" style="overflow:visible"><polygon points="${H.pts}" fill="rgba(60,90,150,.35)" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>${H.dish ? `<path d="M64 10V2M58 2h12" stroke="${col}" stroke-width="1.6"/>` : ''}<rect x="0" y="27" width="5" height="6" fill="${col}" opacity=".9"/></svg>`; };

  // painted side-view ship (same look as the lobby): CAP.shipImg(type, width) → <img>. Bow to the right.
  const SHAPES = {
    gunship: { h:.34, pts:[[1,.56],[.86,.4],[.7,.3],[.56,.28],[.5,.06],[.36,.04],[.31,.24],[.12,.22],[.04,.12],[0,.14],[0,.88],[.06,.94],[.2,.86],[.62,.84],[.84,.74]], tower:[.36,.04,.14,.24], guns:[[.62,.26,.1],[.74,.32,.08]], fins:[] },
    assault: { h:.3, pts:[[1,.6],[.78,.42],[.6,.36],[.48,.18],[.36,.18],[.3,.32],[.08,.3],[0,.36],[0,.8],[.1,.86],[.66,.8],[.86,.7]], tower:[.36,.18,.12,.16], guns:[[.66,.36,.08]], fins:[[.14,.84,.2,.22]] },
    support: { h:.34, pts:[[1,.58],[.84,.42],[.62,.36],[.58,.16],[.42,.14],[.38,.34],[.16,.3],[.02,.36],[0,.78],[.12,.92],[.5,.96],[.74,.84],[.9,.72]], tower:[.42,.14,.16,.2], guns:[[.7,.38,.06]], fins:[[.3,.94,.2,.14]] },
    ew:      { h:.36, pts:[[1,.58],[.82,.46],[.62,.4],[.54,.26],[.4,.26],[.34,.38],[.1,.36],[0,.42],[0,.82],[.1,.9],[.7,.84],[.88,.72]], tower:[.4,.26,.14,.14], guns:[], fins:[[.2,.38,.16,-.3],[.5,.84,.14,.2]], dish:[.47,.12] },
    stealth: { h:.22, pts:[[1,.55],[.7,.3],[.4,.2],[.12,.26],[0,.4],[0,.7],[.12,.84],[.4,.9],[.7,.8]], tower:[.42,.2,.1,.12], guns:[], fins:[[.08,.3,.22,-.5]] },
  };
  const shipCache = {};
  function paintShip(type, len) {
    const S = SHAPES[type] || SHAPES.assault, h = len * S.h, pad = Math.round(len * .1), c0 = document.createElement('canvas');
    c0.width = len + pad * 2; c0.height = Math.round(h + pad * 2); const c = c0.getContext('2d'); c.translate(pad, pad);
    const P = (p) => [p[0] * len, p[1] * h];
    const path = () => { c.beginPath(); S.pts.forEach((p, i) => { const [x, y] = P(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    c.fillStyle = '#1a2036';
    for (const [x, y, w, d] of S.fins) { c.beginPath(); c.moveTo(x * len, y * h); c.lineTo((x + w) * len, y * h); c.lineTo((x + w * .3) * len, (y + d) * h); c.closePath(); c.fill(); }
    if (S.dish) { const [x, y] = P(S.dish); c.strokeStyle = '#8fa0c8'; c.lineWidth = len / 200; c.beginPath(); c.moveTo(x, y + h * .14); c.lineTo(x, y); c.stroke(); c.beginPath(); c.ellipse(x, y, len * .05, h * .06, -.3, 0, 7); c.fillStyle = '#2a3354'; c.fill(); c.stroke(); }
    const base = c.createLinearGradient(0, 0, 0, h); base.addColorStop(0, '#5d6b92'); base.addColorStop(.35, '#323c5c'); base.addColorStop(.75, '#1a2038'); base.addColorStop(1, '#0c0f1e');
    path(); c.fillStyle = base; c.fill(); c.save(); path(); c.clip();
    let seed = len + type.length * 77; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let k = 0; k < 46; k++) { c.fillStyle = `rgba(${rnd() < .5 ? '170,190,240' : '10,14,30'},${.06 + rnd() * .1})`; c.fillRect(rnd() * len, h * (.2 + rnd() * .6), len * (.03 + rnd() * .09), h * (.05 + rnd() * .12)); }
    c.strokeStyle = 'rgba(150,175,230,.18)'; c.lineWidth = Math.max(1, len / 600);
    for (let k = 1; k < 9; k++) { const x = len * (.08 + k * .09); c.beginPath(); c.moveTo(x, 0); c.lineTo(x - h * .08, h); c.stroke(); }
    const top = c.createLinearGradient(0, 0, 0, h * .5); top.addColorStop(0, 'rgba(120,220,255,.55)'); top.addColorStop(1, 'rgba(120,220,255,0)'); c.fillStyle = top; c.fillRect(0, 0, len, h * .5);
    const bot = c.createLinearGradient(0, h * .7, 0, h); bot.addColorStop(0, 'rgba(255,80,170,0)'); bot.addColorStop(1, 'rgba(255,80,170,.4)'); c.fillStyle = bot; c.fillRect(0, h * .7, len, h * .3);
    const st = c.createLinearGradient(0, 0, len * .12, 0); st.addColorStop(0, 'rgba(0,0,0,.45)'); st.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = st; c.fillRect(0, 0, len * .12, h);
    c.restore();
    path(); c.strokeStyle = 'rgba(160,215,255,.45)'; c.lineWidth = Math.max(1.2, len / 450); c.stroke();
    const [tx, ty, tw, th] = S.tower; c.fillStyle = 'rgba(255,236,190,.95)';
    for (let k = 0; k < 6; k++) c.fillRect((tx + .02 + k * tw / 7) * len, (ty + th * .35) * h, len * .012, h * .03);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 22; k++) if (rnd() < .55) { c.fillStyle = rnd() < .8 ? 'rgba(255,230,180,.85)' : 'rgba(130,220,255,.9)'; c.fillRect(len * (.14 + k * .032), h * (.5 + r * .1), len * .008, h * .022); }
    for (const [x, y, w] of S.guns) { c.fillStyle = '#3a4568'; c.beginPath(); c.ellipse(x * len, y * h, w * len * .4, h * .06, 0, Math.PI, 0); c.fill(); c.strokeStyle = '#7f90bb'; c.lineWidth = len / 200; c.beginPath(); c.moveTo(x * len, y * h - h * .03); c.lineTo((x + w) * len, y * h - h * .05); c.stroke(); }
    c.fillStyle = '#3fdf8f'; c.shadowColor = '#3fdf8f'; c.shadowBlur = len / 80; c.fillRect(len * .58, h * .7, len * .22, h * .025); c.shadowBlur = 0;
    c.fillStyle = '#0a0e1c'; c.fillRect(-len * .02, h * .3, len * .03, h * .5);
    c.fillStyle = 'rgba(150,230,255,.95)'; c.fillRect(-len * .02, h * .36, len * .012, h * .14); c.fillRect(-len * .02, h * .58, len * .012, h * .14);
    return c0.toDataURL();
  }
  CAP.shipImg = (type, w = 600) => { const key = type + ':' + w; shipCache[key] = shipCache[key] || paintShip(type, w);
    return `<img class="shipimg" src="${shipCache[key]}" width="${Math.round(w * 1.2)}" alt="" style="display:block;filter:drop-shadow(0 18px 30px rgba(0,0,0,.5))">`; };

  // generic: any [data-act] shows a toast (demo)
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) CAP.toast(`開啟「${b.dataset.act}」（示意）`); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') CAP.close(); });
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') CAP.close(); });

  /** Background. mode: 'space' (nebula + planet), 'deep' (darker, for data-heavy screens), 'hangar' (bay interior), 'red' (alert) */
  CAP.bg = function ({ mode = 'deep', seed = 7, planet = true, drift = 1 } = {}) {
    const cv = $('bg'); cv.width = 1920; cv.height = 1080; const g = cv.getContext('2d');
    const WW = 2300, HH = 1300, L = document.createElement('canvas'); L.width = WW; L.height = HH; const c = L.getContext('2d');
    let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    if (mode === 'hangar') {
      const gr = c.createLinearGradient(0, 0, 0, HH); gr.addColorStop(0, '#0d1424'); gr.addColorStop(.6, '#141c30'); gr.addColorStop(1, '#070a14'); c.fillStyle = gr; c.fillRect(0, 0, WW, HH);
      // bay walls: perspective ribs + light strips
      c.strokeStyle = 'rgba(120,150,200,.12)'; c.lineWidth = 2;
      for (let i = 0; i < 26; i++) { const x = i * 95; c.beginPath(); c.moveTo(x, 0); c.lineTo(WW / 2 + (x - WW / 2) * .35, HH * .62); c.stroke(); }
      for (let j = 0; j < 9; j++) { const y = HH * .62 * (1 - Math.pow(.78, j + 1)); c.beginPath(); c.moveTo(0, y); c.lineTo(WW, y); c.stroke(); }
      c.fillStyle = 'rgba(120,220,255,.5)'; for (let i = 0; i < 14; i++) c.fillRect(120 + i * 150, HH * .62 - 8, 70, 3);
      const fl = c.createLinearGradient(0, HH * .62, 0, HH); fl.addColorStop(0, '#1b2440'); fl.addColorStop(1, '#05070f'); c.fillStyle = fl; c.fillRect(0, HH * .62, WW, HH);
      c.strokeStyle = 'rgba(243,233,75,.25)'; c.setLineDash([40, 30]); c.lineWidth = 4; c.beginPath(); c.moveTo(0, HH * .8); c.lineTo(WW, HH * .8); c.stroke(); c.setLineDash([]);
      const lg = c.createRadialGradient(WW / 2, HH * .3, 0, WW / 2, HH * .3, 900); lg.addColorStop(0, 'rgba(90,180,255,.18)'); lg.addColorStop(1, 'rgba(90,180,255,0)'); c.fillStyle = lg; c.fillRect(0, 0, WW, HH);
    } else {
      c.fillStyle = mode === 'red' ? '#0c0408' : '#04060f'; c.fillRect(0, 0, WW, HH);
      const blobs = mode === 'red' ? [[700, 400, 900, '170,30,60', .5], [1600, 800, 900, '90,20,90', .4]]
        : mode === 'space' ? [[600, 400, 800, '70,40,140', .55], [1500, 600, 1000, '20,90,160', .45], [1000, 1100, 700, '140,40,120', .35], [1900, 300, 600, '40,140,170', .3]]
          : [[500, 300, 900, '40,30,110', .4], [1700, 800, 1000, '15,60,120', .38], [1100, 1200, 700, '90,30,100', .22]];
      for (const [x, y, r, col, a] of blobs) { const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); c.fillStyle = gr; c.fillRect(0, 0, WW, HH); }
      for (let i = 0; i < 1800; i++) { const k = rnd(); c.fillStyle = `rgba(${200 + rnd() * 55 | 0},${210 + rnd() * 45 | 0},255,${.15 + k * .7})`; const z = k > .97 ? 2.4 : 1.2; c.fillRect(rnd() * WW, rnd() * HH, z, z); }
      if (planet && mode !== 'red') {
        const px = 1950, py = 1250, pr = 560, pg = c.createRadialGradient(px - 240, py - 280, 60, px, py, pr);
        pg.addColorStop(0, '#5a7ec8'); pg.addColorStop(.5, '#2a3d78'); pg.addColorStop(1, '#0a1028'); c.fillStyle = pg; c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
        c.strokeStyle = 'rgba(120,200,255,.5)'; c.lineWidth = 10; c.filter = 'blur(6px)'; c.beginPath(); c.arc(px, py, pr, Math.PI * 1.05, Math.PI * 1.75); c.stroke(); c.filter = 'none';
      }
    }
    // grid overlay for data screens
    if (mode === 'deep' || mode === 'red') { c.strokeStyle = mode === 'red' ? 'rgba(255,80,100,.05)' : 'rgba(90,200,255,.045)'; c.lineWidth = 1; for (let x = 0; x < WW; x += 80) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, HH); c.stroke(); } for (let y = 0; y < HH; y += 80) { c.beginPath(); c.moveTo(0, y); c.lineTo(WW, y); c.stroke(); } }
    const dust = Array.from({ length: 36 }, () => ({ x: rnd() * 1920, y: rnd() * 1080, r: 2 + rnd() * 10, a: .04 + rnd() * .12, v: .1 + rnd() * .3 }));
    (function frame(t) {
      const ox = -(WW - 1920) / 2 + Math.sin(t / 9000) * 60 * drift, oy = -(HH - 1080) / 2 + Math.cos(t / 11000) * 30 * drift;
      g.drawImage(L, ox, oy);
      for (const d of dust) { d.x -= d.v * drift; if (d.x < -20) d.x = 1940; g.fillStyle = `rgba(170,210,255,${d.a})`; g.beginPath(); g.arc(d.x, d.y, d.r, 0, 7); g.fill(); }
      requestAnimationFrame(frame);
    })(0);
  };

  CAP.ready = () => requestAnimationFrame(() => setTimeout(() => stage.classList.add('ready'), 200));
  /** call at the end of a page's render(): first call plays the entrance, later redraws show instantly */
  CAP.rerendered = () => { if (CAP._r) stage.classList.add('ready'); else { CAP._r = 1; CAP.ready(); } };
})();
