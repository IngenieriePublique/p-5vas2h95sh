/* Cahier à pages tournantes, feuilles souples.
   - Chaque feuille est découpée en bandes verticales chaînées en 3D : elle peut
     s'arquer. Quand elle se lève, son bord libre traîne derrière (résistance de
     l'air) puis se remet à plat en se posant.
   - Chaque feuille s'anime indépendamment : on peut en tourner plusieurs d'affilée.
   Flipbook(root, { pages: [urls], ratio, onChange(state) })                      */
function Flipbook(root, opts) {
  const pages = opts.pages, n = pages.length, ratio = opts.ratio || 540 / 780;
  const L = Math.ceil(n / 2);   // nombre de feuilles
  const N = 12;                 // bandes par feuille
  const DUR = 900;              // durée d'une page tournée au clic (ms)

  root.classList.add('fb');
  root.innerHTML = `
    <div class="fb-shift">
      <div class="fb-book">
        <i class="fb-sh l"></i><i class="fb-sh r"></i>
        <i class="fb-edge l"></i><i class="fb-edge r"></i>
        <i class="fb-hit l"></i><i class="fb-hit r"></i>
      </div>
    </div>`;
  const shiftEl = root.querySelector('.fb-shift'), book = root.querySelector('.fb-book');
  const shL = book.querySelector('.fb-sh.l'), shR = book.querySelector('.fb-sh.r');
  const edgeL = book.querySelector('.fb-edge.l'), edgeR = book.querySelector('.fb-edge.r');
  // zones cliquables : seulement là où il y a une page, le vide laisse passer le clic
  const hitL = book.querySelector('.fb-hit.l'), hitR = book.querySelector('.fb-hit.r');

  // ombre de pli (côté reliure) découpée avec l'image, pour qu'elle suive la courbure
  // page droite : pli serré qui plonge dans la reliure, léger galbe vers le bord
  const GUT_F = 'linear-gradient(90deg, rgba(0,0,0,.34) 0, rgba(0,0,0,.17) 1.4%, rgba(0,0,0,.08) 4.5%, rgba(0,0,0,.03) 12%, transparent 26%, transparent 90%, rgba(0,0,0,.035) 100%)';
  // page gauche : la feuille s'arque, l'ombre remonte largement depuis la reliure
  const GUT_B = 'linear-gradient(270deg, rgba(0,0,0,.36) 0, rgba(0,0,0,.20) 2%, rgba(0,0,0,.11) 8%, rgba(0,0,0,.06) 20%, rgba(0,0,0,.025) 38%, transparent 58%, transparent 92%, rgba(0,0,0,.03) 100%)';
  // le verso est retourné : décalé de 2px pour que l'image tombe pile sur la reliure
  const bg = (url, gut, slot, off = 0) =>
    `background-image:${gut}${url ? `, url("${url}")` : ''};background-position:calc(var(--sw) * ${-slot} + ${off}px) 0;`;

  const leaves = [];
  for (let i = 0; i < L; i++) {
    const front = pages[2 * i], back = pages[2 * i + 1];
    const leaf = document.createElement('div');
    leaf.className = 'fb-leaf';
    let html = '';
    for (let k = N - 1; k >= 0; k--) {
      // on construit de l'extérieur vers la reliure : chaque bande contient la suivante
      html = `<div class="fb-strip${k === 0 ? ' first' : ''}${k === N - 1 ? ' last' : ''}">` +
        `<i class="fb-f" style='${bg(front, GUT_F, k)}'><b></b></i>` +
        `<i class="fb-b" style='${bg(back, GUT_B, N - 1 - k, k === N - 1 ? 0 : 2)}'><b></b></i>` +
        html + '</div>';
    }
    // au repos : une seule face pleine page, nette (les bandes ne servent qu'au mouvement)
    html += `<i class="fb-flat f" style='background-image:${GUT_F}${front ? `, url("${front}")` : ''}'></i>` +
      `<i class="fb-flat b" style='background-image:${GUT_B}${back ? `, url("${back}")` : ''}'></i>`;
    leaf.innerHTML = html;
    book.appendChild(leaf);
    const cast = document.createElement('i'); cast.className = 'fb-cast'; book.appendChild(cast);
    const strips = [...leaf.querySelectorAll('.fb-strip')];
    leaves.push({
      el: leaf, strips, cast,
      fShade: strips.map(s => s.querySelector(':scope > .fb-f > b')),
      bShade: strips.map(s => s.querySelector(':scope > .fb-b > b')),
      fFace: strips.map(s => s.querySelector(':scope > .fb-f')),
      bFace: strips.map(s => s.querySelector(':scope > .fb-b')),
      fVis: [], bVis: [],
      p: 0, from: 0, to: 0, t0: 0, dur: DUR, v: 0, dir: 1, active: false, last: 0,
    });
  }
  // précharge les pages pour que les tournes rapides ne laissent pas de blanc
  pages.forEach(u => { const im = new Image(); im.src = u; });

  let cur = 0, w = 0, h = 0, raf = 0, drag = null;
  // répartition de la courbure : nulle à la reliure, maximale vers le bord libre
  const W = Array.from({ length: N }, (_, k) => k);
  const Wsum = W.reduce((a, b) => a + b, 0);

  function size() {
    const RW = root.clientWidth, RH = root.clientHeight;
    h = RH; w = Math.round(h * ratio);
    if (w * 2 > RW) { w = Math.floor(RW / 2); h = Math.round(w / ratio); }
    shiftEl.style.margin = `${Math.round((RH - h) / 2)}px 0 0 ${Math.round((RW - 2 * w) / 2)}px`;
    book.style.width = w * 2 + 'px';
    book.style.height = h + 'px';
    book.style.setProperty('--pw', w + 'px');
    book.style.setProperty('--ph', h + 'px');
    book.style.setProperty('--sw', w / N + 'px');
    leaves.forEach(paintLeaf);
    paintBook();
  }

  const shiftFor = f => (f < 1 ? -(w / 2) * (1 - f) : f > L - 1 ? (w / 2) * (f - (L - 1)) : 0);

  function paintLeaf(lf, i) {
    const p = lf.p, s = Math.sin(Math.PI * p);
    const moving = p > .0005 && p < .9995;
    const rest = moving ? '' : p < .5 ? 'f' : 'b';
    if (lf.rest !== rest) { lf.rest = rest; lf.el.classList.toggle('rest-f', rest === 'f'); lf.el.classList.toggle('rest-b', rest === 'b'); }
    lf.el.style.zIndex = (moving ? 500 : 0) + (p < .5 ? L - i + 1 : i + 1);
    // la feuille traîne : courbure opposée au mouvement, proportionnelle à la vitesse
    const speed = Math.min(1, Math.abs(lf.v) / 2.6);
    const T = moving ? lf.dir * (14 + 46 * speed) * s : 0; // degrés, cumulés jusqu'au bord
    // angle absolu au début de chaque bande (A[N] = bord libre)
    // en se posant, le bord libre file un peu devant puis se rabat (inertie du papier)
    const q = lf.dir > 0 ? p : 1 - p;
    const O = moving && q > .5 ? -lf.dir * 16 * (lf.active ? 1 : .4) * Math.sin(Math.PI * (q - .5) * 2) * Math.min(1, speed + .35) : 0;
    const A = new Array(N + 1);
    A[0] = -180 * p;
    for (let k = 1; k <= N; k++) {
      const j = Math.min(k, N - 1);
      A[k] = A[k - 1] + T * W[j] / Wsum + (j >= N - 4 ? O / 4 : 0);
    }
    const rad = Math.PI / 180;
    // même ombrage recto et verso : si la carte graphique laisse deviner la face
    // cachée aux jointures des bandes, elle a la même teinte (pas de lignes noires)
    const sh = a => (.4 * (1 - Math.abs(Math.cos(a * rad)))).toFixed(3);
    lf.strips.forEach((st, k) => {
      st.style.transform = `rotateY(${k === 0 ? A[0] : A[k] - A[k - 1]}deg)`;
      // la face nettement tournée vers l'arrière est retirée du rendu
      const mid = (A[k] + A[k + 1]) / 2, fv = mid > -125, bv = mid < -55;
      if (lf.fVis[k] !== fv) { lf.fVis[k] = fv; lf.fFace[k].style.visibility = fv ? '' : 'hidden'; }
      if (lf.bVis[k] !== bv) { lf.bVis[k] = bv; lf.bFace[k].style.visibility = bv ? '' : 'hidden'; }
      // lumière : dégradé continu d'une bande à l'autre, pas de facettes visibles
      if (moving) {
        const a0 = sh(A[k]), a1 = sh(A[k + 1]);
        lf.fShade[k].style.background = `linear-gradient(90deg, rgba(22,24,26,${a0}), rgba(22,24,26,${a1}))`;
        lf.bShade[k].style.background = `linear-gradient(270deg, rgba(22,24,26,${a0}), rgba(22,24,26,${a1}))`;
        lf.fShade[k].style.opacity = 1; lf.bShade[k].style.opacity = 1;
      } else { lf.fShade[k].style.opacity = 0; lf.bShade[k].style.opacity = 0; }
    });
    // ombre projetée sur la page dessous, au droit du bord libre
    // position réelle du bord libre (feuille courbée), projetée sur la table
    let proj = 0;
    for (let k = 0; k < N; k++) proj += (w / N) * Math.cos(A[k] * rad);
    lf.proj = proj;
    // la feuille en l'air décolle un peu
    lf.el.style.transform = moving ? `translateZ(${(s * 9).toFixed(2)}px)` : '';
    if (moving) {
      // plus la feuille est haute, plus son ombre est large et diffuse
      const cw = w * (.26 + .14 * s);
      lf.cast.style.opacity = (s * .42).toFixed(3);
      lf.cast.style.width = cw + 'px';
      lf.cast.style.transform = proj >= 0
        ? `translateX(${w + proj}px)`
        : `translateX(${w + proj - cw}px) scaleX(-1)`;
    } else lf.cast.style.opacity = 0;
  }

  function paintBook() {
    const f = leaves.reduce((a, l) => a + l.p, 0);
    const sx = shiftFor(f);
    shiftEl.style.transform = `translateX(${leaves.some(l => l.rest === '') ? sx : Math.round(sx)}px)`;
    const left = leaves.filter(l => l.p > .5).length, right = L - left;
    edgeL.style.width = (left ? 1 + left * .5 : 0) + 'px';
    edgeR.style.width = (right ? 1 + right * .5 : 0) + 'px';
    // ombre au sol d'une moitié : pleine si une feuille y est posée, sinon elle
    // suit seulement l'emprise de la feuille en vol (pas de « page fantôme »)
    hitL.classList.toggle('off', !leaves.some(l => l.p > .5));
    hitR.classList.toggle('off', !leaves.some(l => l.p < .5));
    const restL = leaves.some(l => l.p >= .9995), restR = leaves.some(l => l.p <= .0005);
    let fL = 0, fR = 0;
    leaves.forEach(l => { fL = Math.max(fL, -l.proj / w); fR = Math.max(fR, l.proj / w); });
    fL = Math.min(1, fL); fR = Math.min(1, fR);
    shL.style.opacity = restL ? 1 : (fL * fL * .8).toFixed(3);
    shL.style.transform = restL ? '' : `scaleX(${fL.toFixed(4)})`;
    shR.style.opacity = restR ? 1 : (fR * fR * .8).toFixed(3);
    shR.style.transform = restR ? '' : `scaleX(${fR.toFixed(4)})`;
    book.style.setProperty('--spine', left && right ? 1 : 0);
  }

  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function tick() {
    const now = performance.now();
    let any = false;
    leaves.forEach((lf, i) => {
      if (!lf.active) return;
      const t = Math.min(1, (now - lf.t0) / lf.dur);
      const np = lf.from + (lf.to - lf.from) * ease(t);
      const dt = Math.max(1, now - lf.last) / 1000;
      lf.v = (np - lf.p) / dt; lf.last = now;
      if (Math.abs(lf.v) > .01) lf.dir = Math.sign(lf.v);
      lf.p = np;
      if (t >= 1) { lf.active = false; lf.v = 0; lf.p = lf.to; }
      else any = true;
      paintLeaf(lf, i);
    });
    paintBook();
    raf = any ? requestAnimationFrame(tick) : 0;
    // la tourne est finie : si la souris est restée sur un bord, le coin suivant se soulève sans attendre qu'elle bouge
    if (!any && lastPtr && !drag) hoverEar(lastPtr);
  }
  function animate(i, to, dur = DUR) {
    const lf = leaves[i];
    lf.from = lf.p; lf.to = to; lf.t0 = performance.now(); lf.last = lf.t0;
    lf.dur = Math.max(140, dur * Math.abs(to - lf.p));
    lf.active = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  const report = () => opts.onChange && opts.onChange({ index: cur, leaves: L, n });
  function next(dur) { if (cur >= L) return; dropCurl(); animate(cur, 1, dur); cur++; report(); }
  function prev(dur) { if (cur <= 0) return; dropCurl(); cur--; animate(cur, 0, dur); report(); }

  /* ---------- geste : la feuille suit le pointeur ---------- */
  book.addEventListener('pointerdown', e => {
    if (drag) return; // un seul pointeur
    const r = book.getBoundingClientRect(), side = e.clientX - r.left > r.width / 2 ? 'r' : 'l';
    if ((side === 'r' && cur >= L) || (side === 'l' && cur <= 0)) return;
    drag = { id: e.pointerId, x0: e.clientX, t0: performance.now(), side, moved: false, i: side === 'r' ? cur : cur - 1, lx: e.clientX, lt: performance.now(), vx: 0 };
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
  });
  book.addEventListener('pointermove', e => {
    hoverEar(e);
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) > 5) {
      drag.moved = true; dropCurl();
      const lf = leaves[drag.i]; lf.active = false;
      drag.p0 = lf.p;
    }
    if (!drag.moved) return;
    const now = performance.now(), lf = leaves[drag.i];
    const span = w * 1.7;
    const np = Math.max(0, Math.min(1, drag.p0 + -dx / span));
    const dt = Math.max(1, now - lf.last) / 1000;
    lf.v = lf.v * .6 + ((np - lf.p) / dt) * .4; lf.last = now;
    if (Math.abs(lf.v) > .02) lf.dir = Math.sign(lf.v);
    lf.p = np;
    drag.vx = (e.clientX - drag.lx) / Math.max(1, now - drag.lt); drag.lx = e.clientX; drag.lt = now;
    paintLeaf(lf, drag.i); paintBook();
  });
  // la vitesse retombe si le doigt s'immobilise : la feuille se détend
  const relax = setInterval(() => {
    if (!drag || !drag.moved) return;
    const lf = leaves[drag.i];
    if (performance.now() - lf.last > 60) { lf.v *= .7; paintLeaf(lf, drag.i); }
  }, 60);
  const release = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moved) { d.side === 'r' ? next() : prev(); return; }
    const lf = leaves[d.i];
    const flick = Math.abs(d.vx) > .45 ? (d.vx < 0 ? 1 : 0) : null;
    const to = flick !== null ? flick : lf.p > .5 ? 1 : 0;
    if (d.side === 'r' && to === 1) cur = d.i + 1;
    if (d.side === 'l' && to === 0) cur = d.i;
    animate(d.i, to, 700);
    report();
  };
  book.addEventListener('pointerup', release);
  book.addEventListener('pointercancel', release);

  /* ---------- au survol d'un bord : on attrape la page par le bas ----------
     Le coin inférieur se soulève le long d'un pli en diagonale (le bas tourne
     plus que le haut), puis la page reste suspendue au tout début de sa tourne.
     Le pli est fait de quelques bandes parallèles, articulées l'une sur l'autre. */
  // degrés au total ; bandes fines dont la courbure croît vers le coin (pli arrondi, pas de facettes)
  const CURL = 72, NB = 14, SPLIT = (() => { const a = Array.from({ length: NB }, (_, k) => (k + 1) ** 1.4), t = a.reduce((x, y) => x + y, 0); return a.map(x => x / t); })();
  const curl = document.createElement('div'); curl.className = 'fb-curl';
  curl.innerHTML = '<div class="fb-cwrap"><i class="fb-cs"></i></div><i class="fb-cbase"><b></b></i>' +
    '<i class="fb-cf"><s><b></b></s></i><i class="fb-cb"><s><b></b></s></i>'.repeat(NB);
  book.appendChild(curl);
  const cBase = curl.querySelector('.fb-cbase'), cShadow = curl.querySelector('.fb-cs');
  // chaque bande = un ruban parallèle au pli (deux faces sœurs : recto, revers) ;
  // l'image de la page y est replacée en sens inverse, les rotations s'enchaînent en JS
  const fF = curl.querySelectorAll('.fb-cf'), fB = curl.querySelectorAll('.fb-cb');
  const bands = SPLIT.map((_, k) => ({ f: fF[k], b: fB[k], fi: fF[k].firstChild, bi: fB[k].firstChild,
    fs: fF[k].firstChild.firstChild, bs: fB[k].firstChild.firstChild, o: [0, 0], place: '' }));
  let peek = null, craf = 0, lastPtr = null;

  // découpe d'un polygone par un demi-plan (Sutherland-Hodgman)
  const cut = (poly, f) => {
    const out = [];
    poly.forEach((A, k) => {
      const B = poly[(k + 1) % poly.length], fa = f(A), fb = f(B);
      if (fa >= 0) out.push(A);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
    });
    return out;
  };
  const css = (poly, mirror) => `polygon(${poly.map(([x, y]) => `${(mirror ? w - x : x).toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;

  function buildCurl(side, i) {
    // repère de la page posée : x = 0 à gauche (reliure pour la page de droite)
    const R = side === 'r';
    const P2 = [R ? w * .66 : w * .34, h], P1 = [R ? w * .97 : w * .03, 0];       // le pli, du bas vers le haut
    let dx = P1[0] - P2[0], dy = P1[1] - P2[1]; const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    let nx = -dy, ny = dx;                                                      // normale vers le coin attrapé
    const C = [R ? w : 0, h];
    if ((C[0] - P2[0]) * nx + (C[1] - P2[1]) * ny < 0) { nx = -nx; ny = -ny; }
    const sd = X => (X[0] - P2[0]) * nx + (X[1] - P2[1]) * ny, S = sd(C);
    const rect = [[0, 0], [w, 0], [w, h], [0, h]];
    const zone = (lo, hi) => { let q = rect; if (lo != null) q = cut(q, X => sd(X) - lo); if (hi != null) q = cut(q, X => hi - sd(X)); return q; };
    // les deux faces du papier : ce qu'on voit, et son revers
    const front = R ? pages[2 * i] : pages[2 * i + 1], back = R ? pages[2 * i + 1] : pages[2 * i];
    const img = (u, g) => `${g}${u ? `, url("${u}")` : ''}`;
    const fImg = img(front, R ? GUT_F : GUT_B), bImg = img(back, R ? GUT_B : GUT_F);
    curl.style.left = R ? '50%' : '0';
    cBase.style.backgroundImage = fImg;
    cBase.style.clipPath = css(zone(null, .6));
    const hinge = SPLIT.map((_, k) => S * .96 * k / NB);
    // sens de rotation : le coin vient vers le lecteur
    const sgn = Math.sign(dx * ny - dy * nx) || 1;
    const ang = Math.atan2(ny, nx), Lh = h * 1.3, deg = a => `${(a * 180 / Math.PI).toFixed(3)}deg`;
    bands.forEach((bd, k) => {
      const lo = hinge[k], bw = (k < NB - 1 ? hinge[k + 1] : S + 4) - lo + 1.5;
      const ox = P2[0] + nx * lo, oy = P2[1] + ny * lo;
      bd.o = [ox, oy];
      // ruban : x le long de la normale, y le long du pli
      bd.place = `translate(${ox.toFixed(1)}px,${oy.toFixed(1)}px) rotate(${deg(ang)}) translateY(${-Lh}px)`;
      const inv = `translateY(${Lh}px) rotate(${deg(-ang)}) translate(${(-ox).toFixed(1)}px,${(-oy).toFixed(1)}px)`;
      [bd.f, bd.b].forEach(el => { el.style.width = bw + 'px'; el.style.height = 2 * Lh + 'px'; });
      bd.fi.style.backgroundImage = fImg; bd.fi.style.transform = inv;
      // revers : ruban retourné sur lui-même, image en miroir (le verso se lit à l'envers du recto)
      bd.bi.style.backgroundImage = bImg;
      bd.bi.style.transform = `translateX(${bw}px) scaleX(-1) ${inv} translateX(${w}px) scaleX(-1)`;
      bd.bw = bw;
    });
    // ombre portée sur la page dévoilée, collée au pli
    cShadow.style.width = w * .32 + 'px'; cShadow.style.height = h * 2.4 + 'px';
    cShadow.style.transform = `translate(${P2[0]}px, ${P2[1]}px) rotate(${Math.atan2(ny, nx)}rad) translateY(${-h * 1.2}px)`;
    return { side, i, axis: [dx, dy], sgn, th: 0, from: 0, to: 0, t0: 0, dur: 1 };
  }

  function paintCurl() {
    const c = peek, [ax, ay] = c.axis;
    let acc = 0, chain = '';
    bands.forEach((bd, k) => {
      const t = c.th * SPLIT[k] * c.sgn; acc += c.th * SPLIT[k];
      const [ox, oy] = bd.o;
      chain += `translate(${ox.toFixed(1)}px,${oy.toFixed(1)}px) rotate3d(${ax.toFixed(4)},${ay.toFixed(4)},0,${t.toFixed(2)}deg) translate(${(-ox).toFixed(1)}px,${(-oy).toFixed(1)}px) `;
      bd.f.style.transform = chain + bd.place;
      bd.b.style.transform = chain + bd.place + ` translateX(${bd.bw}px) rotateY(180deg)`;
      const a = acc * Math.PI / 180;
      bd.fs.style.opacity = (.5 * (1 - Math.cos(a))).toFixed(3);    // le recto s'assombrit en se dressant
      bd.bs.style.opacity = (.2 * (1 + Math.cos(a))).toFixed(3);    // le revers s'éclaire en se rabattant
    });
    cShadow.style.opacity = (Math.min(1, c.th / CURL) * .38).toFixed(3);
  }
  const easeOut = t => 1 - Math.pow(1 - t, 3), easeInOut = t => t * t * (3 - 2 * t);
  function curlTick() {
    craf = 0; const c = peek; if (!c) return;
    const t = Math.min(1, (performance.now() - c.t0) / c.dur);
    c.th = c.from + (c.to - c.from) * (c.to > c.from ? easeOut(t) : easeInOut(t));
    paintCurl();
    if (t < 1) craf = requestAnimationFrame(curlTick);
    else if (c.to === 0) endCurl();
  }
  function curlTo(to, dur) {
    const c = peek; c.from = c.th; c.to = to; c.t0 = performance.now();
    c.dur = dur * Math.max(.25, Math.abs(to - c.th) / CURL);
    if (!craf) craf = requestAnimationFrame(curlTick);
  }
  function endCurl() {
    if (!peek) return;
    cancelAnimationFrame(craf); craf = 0;
    leaves[peek.i].el.style.visibility = '';
    curl.classList.remove('on', 'drop'); peek = null;
  }
  // la page se met à tourner pour de bon : la vraie feuille reprend la main, le coin se rabat vite
  function dropCurl() {
    if (!peek) return;
    leaves[peek.i].el.style.visibility = '';
    curl.classList.add('drop');
    curlTo(0, 260);
  }
  function setEar(side) {
    const dropping = curl.classList.contains('drop');
    const i = side === 'r' ? cur : side === 'l' ? cur - 1 : -1;
    if (peek && !dropping && peek.i === i && peek.side === side) { if (peek.to !== CURL) curlTo(CURL, 700); return; }
    if (!side) { if (peek && !dropping && peek.to !== 0) curlTo(0, 520); return; }
    endCurl();
    peek = buildCurl(side, i);
    curl.classList.add('on');
    leaves[i].el.style.visibility = 'hidden';
    paintCurl(); curlTo(CURL, 700);
  }
  function hoverEar(e) {
    lastPtr = { clientX: e.clientX, clientY: e.clientY };
    if (drag || !matchMedia('(hover: hover)').matches) return;
    if (leaves.some(l => l.active)) return;   // pendant une tourne : on attend qu'elle se pose
    const r = book.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    // couvertures (fermé au début ou à la fin) : toute la page déclenche le coin ; sinon le bord seulement
    const side = cur < L && (x > .8 || (cur === 0 && x > .5)) ? 'r'
      : cur > 0 && (x < .2 || (cur === L && x < .5)) ? 'l' : null;
    setEar(side);
  }
  [hitL, hitR].forEach(h => h.addEventListener('pointerleave', e => {
    const r = book.getBoundingClientRect();
    const out = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (out) lastPtr = null;
    if (!drag) setEar(null);
  }));

  const onKey = e => {
    if (!root.isConnected) return removeEventListener('keydown', onKey);
    if (e.key === 'ArrowRight') next(700);
    if (e.key === 'ArrowLeft') prev(700);
  };
  if (opts.keys !== false) addEventListener('keydown', onKey);
  const ro = new ResizeObserver(size); ro.observe(root);
  size(); report();

  return {
    next, prev,
    get index() { return cur; }, leaves: L,
    // revient à la couverture (feuilles refermées une à une, de la dernière à la première)
    close() { for (let i = cur - 1, d = 0; i >= 0; i--, d++) setTimeout(() => animate(i, 0, 560), d * 95); cur = 0; report(); },
    destroy() { ro.disconnect(); clearInterval(relax); cancelAnimationFrame(craf); removeEventListener('keydown', onKey); cancelAnimationFrame(raf); },
    coverRect() { const r = book.getBoundingClientRect(); return { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height }; },
  };
}
