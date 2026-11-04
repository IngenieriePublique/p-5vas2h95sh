/* Portfolio en trois volets, sur une seule page.
   Accueil : les volets sont trois calques d'un SIG, empilés en vue éclatée.
   Choisir un volet : la pile se remet à plat, le calque choisi devient la table
   sur laquelle les réalisations sont posées. Aucun chargement de page.
   Les animations sont jouées même si Windows a désactivé les effets d'animation.

   Le contenu (textes, images, documents) est dans content.json.
   La page d'édition (atelier) charge ce même script avec window.PF_EDIT = true. */

const PF = window.PF = window.PF || {};
const EDIT = !!window.PF_EDIT;
PF.blobs = PF.blobs || {};                       // fichiers ajoutés dans l'atelier, pas encore en ligne
/* Le contenu est lu directement dans le dépôt GitHub (raw.githubusercontent.com) : une
   publication de l'atelier apparaît en une à deux minutes, sans attendre que GitHub Pages
   ait remis le site en ligne. Les fichiers pas encore en ligne sont lus au même endroit. */
const REPO = (() => {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i); if (!m) return null;
  const seg = location.pathname.split('/').filter(Boolean);
  return { owner: m[1], repo: seg.length && !/\.html?$/i.test(seg[0]) ? seg[0] : location.hostname };
})();
const RAW = REPO && `https://raw.githubusercontent.com/${REPO.owner}/${REPO.repo}/main/`;
const LATE = new Set();                          // fichiers publiés mais pas encore servis par Pages
const U = p => (p && PF.blobs[p]) || (p && LATE.has(p) ? RAW + p.split('/').map(encodeURIComponent).join('/') : p) || '';
const filesOf = c => {
  const s = new Set();
  (c.volets || []).forEach(v => { if (v.calque) s.add(v.calque); (v.items || []).forEach(it => [it.src, it.hd, ...(it.pages || [])].forEach(p => p && s.add(p))); });
  return s;
};
const getJSON = (url, opt) => fetch(url, opt).then(r => (r.ok ? r.json() : null)).catch(() => null);
const DOC_RATIO = 864 / 1248;

const $ = (s, r = document) => r.querySelector(s);
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// un clic dans un texte en cours d'édition ne déclenche pas la navigation
const inEdit = e => EDIT && e.target.closest && e.target.closest('[data-bind], .ed-ui');
const bind = path => `data-bind="${path}"`;
const num = (x, d = 0) => (typeof x === 'number' && isFinite(x) ? x : d);

(async function boot() {
  // version servie par Pages (peut avoir quelques minutes de retard) et version du dépôt
  const deployed = getJSON('content.json', { cache: 'no-cache' });
  const fresh = PF.loadContent ? PF.loadContent().catch(() => null)
    : RAW ? getJSON(`${RAW}content.json?t=${Math.floor(Date.now() / 30000)}`, { cache: 'no-cache' }) : null;
  const [L, F] = await Promise.all([deployed, fresh]);
  const C = F || L;
  if (!C) {
    document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:auto 0 40%;text-align:center;color:#828282">Contenu indisponible.</p>');
    return;
  }
  if (RAW && L && F) { const on = filesOf(L); filesOf(F).forEach(p => { if (!on.has(p)) LATE.add(p); }); }
  PF.C = C;
  start(C);
})();

/* boîtes de texte libres, attachées au fond de la page (unités : % de l'écran) */
function notesHTML(list, base) {
  return (list || []).map((n, i) => `<div class="note" data-note="${base}.${i}" style="left:${num(n.x, 40)}vw;top:${num(n.y, 40)}vh;width:${num(n.w, 20)}vw;--fs:${num(n.fs, 16)};font-weight:${num(n.wt, 300)}">` +
    `<div class="nt" ${bind(`${base}.${i}.text`)}>${esc(n.text)}</div></div>`).join('');
}

function start(C) {
  const VOLETS = C.volets;

  /* ---------- accueil : textes ---------- */
  const who = $('.who');
  who.innerHTML = `<p class="kicker" ${bind('home.kicker')}>${esc(C.home.kicker)}</p>` +
    `<p class="name" ${bind('home.name')}>${esc(C.home.name)}</p>` +
    `<p class="role" ${bind('home.role')}>${esc(C.home.role)}</p>`;
  const contact = $('.contact a');
  if (C.home.linkedin) contact.href = C.home.linkedin;
  const hnotes = $('#hnotes');
  const renderHomeNotes = () => { hnotes.innerHTML = notesHTML(C.home.notes, 'home.notes'); };
  renderHomeNotes();

  /* ---------- accueil : la pile de calques ---------- */
  const scene = $('#scene'), tilt = $('.tilt'), legend = $('#legend'), leaders = $('#leaders'), volet = $('#volet');
  const layers = VOLETS.map((v, k) => {
    const el = document.createElement('div');
    el.className = 'layer pre';
    el.dataset.k = k;
    el.style.setProperty('--z', VOLETS.length - 1 - k);   // premier volet = calque du dessus
    el.innerHTML = `<div class="paint"><img src="${esc(U(v.calque))}" alt="" draggable="false" decoding="async"></div><i class="tint"></i>` +
      '<i class="cn" style="left:0;top:0"></i><i class="cn" style="right:0;top:0"></i><i class="cn" style="right:0;bottom:0"></i><i class="cn" style="left:0;bottom:0"></i>';
    scene.appendChild(el);
    return el;
  });
  const rows = VOLETS.map((v, k) => {
    const b = document.createElement('div');
    b.className = 'row'; b.dataset.k = k; b.tabIndex = 0; b.setAttribute('role', 'button');
    b.innerHTML = `<span class="t" ${bind(`volets.${k}.name`)}>${esc(v.name)}</span><span class="c" ${bind(`volets.${k}.count`)}>${esc(v.count)}</span>`;
    legend.appendChild(b);
    return b;
  });
  leaders.innerHTML = VOLETS.map(() => '<g><line/><circle r="3.5"/></g>').join('');
  const leadEls = [...leaders.children];

  let hover = null, mode = 'home', selK = null;
  function setHover(k) {
    if (mode !== 'home') return;
    hover = k;
    const zk = k === null ? -1 : VOLETS.length - 1 - k;
    layers.forEach((el, j) => {
      const zj = VOLETS.length - 1 - j;
      // vue éclatée : le calque survolé monte un peu, ceux du dessus s'écartent
      el.style.setProperty('--lift', k === null ? '0vh' : j === k ? '5vh' : zj > zk ? '26vh' : '0vh');
      el.classList.toggle('hi', j === k);
      el.classList.toggle('dim', k !== null && j !== k);
    });
    rows.forEach((r, j) => { r.classList.toggle('hi', j === k); r.classList.toggle('dim', k !== null && j !== k); });
    leadEls.forEach((g, j) => g.classList.toggle('hi', j === k));
    wakeHome(1100);   // le temps que les calques finissent de monter
  }
  rows.forEach((r, k) => {
    r.addEventListener('pointerenter', () => setHover(k));
    r.addEventListener('focus', () => setHover(k));
    r.addEventListener('click', e => { if (!inEdit(e)) openVolet(k); });
    r.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === r) { e.preventDefault(); openVolet(k); } });
  });
  legend.addEventListener('pointerleave', () => setHover(null));
  legend.addEventListener('focusout', () => setHover(null));
  // zones de survol immobiles, à la position de repos de chaque calque : le calque
  // peut monter sans quitter le curseur (sinon il redescend, remonte… et vibre)
  const hits = layers.map(el => {
    const h = document.createElement('div');
    h.className = 'lhit'; h.style.setProperty('--z', el.style.getPropertyValue('--z'));
    scene.appendChild(h);
    return h;
  });
  hits.forEach((el, k) => {
    el.addEventListener('pointerenter', () => setHover(k));
    el.addEventListener('pointerleave', () => setHover(null));
    el.addEventListener('click', () => openVolet(k));
  });

  // entrée : les calques se posent l'un après l'autre, du socle vers le dessus
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.classList.add('ready');
    wakeHome(2200);
    layers.forEach((el, k) => setTimeout(() => el.classList.remove('pre'), 120 + (VOLETS.length - 1 - k) * 170));
    const h = location.hash.slice(1), k = VOLETS.findIndex(v => v.id === h);
    if (k >= 0) setTimeout(() => openVolet(k, true), 900);
  }));

  // légère inclinaison selon la souris + lignes de rappel légende → calques.
  // La boucle ne tourne que lorsque quelque chose bouge, puis s'endort.
  let mx = .5, my = .5, tx = 0, ty = 0, hraf = 0, awakeUntil = 0;
  const narrow = () => innerWidth < 760;
  const rowT = rows.map(r => r.querySelector('.t')), corners = layers.map(el => [...el.querySelectorAll('.cn')]);
  let bestCn = null;   // coin le plus à gauche de chaque calque (ne change pas avec la légère inclinaison)
  function wakeHome(ms = 1200) {
    awakeUntil = Math.max(awakeUntil, performance.now() + ms);
    if (!hraf) hraf = requestAnimationFrame(frame);
  }
  addEventListener('pointermove', e => {
    mx = e.clientX / innerWidth; my = e.clientY / innerHeight;
    if (mode === 'home' && finePointer) wakeHome(1500);
  }, { passive: true });
  addEventListener('resize', () => { bestCn = null; wakeHome(300); });
  function frame() {
    hraf = 0;
    const on = mode === 'home' && finePointer && !PF.freeze, gx = on ? (mx - .5) * 5 : 0, gy = on ? (my - .5) * -4 : 0;
    tx += (gx - tx) * .06; ty += (gy - ty) * .06;
    tilt.style.transform = Math.abs(tx) + Math.abs(ty) > .001 ? `rotateY(${tx.toFixed(3)}deg) rotateX(${ty.toFixed(3)}deg)` : '';
    if ((mode === 'home' || mode === 'closing') && !narrow()) {
      if (!bestCn) bestCn = corners.map(cs => { let bi = 0, bx = Infinity; cs.forEach((c, i) => { const x = c.getBoundingClientRect().left; if (x < bx) { bx = x; bi = i; } }); return cs[bi]; });
      rows.forEach((r, k) => {
        const rr = rowT[k].getBoundingClientRect(), b = bestCn[k].getBoundingClientRect();
        const x1 = rr.right + 18, y1 = rr.top + rr.height / 2;
        const [ln, ci] = leadEls[k].children;
        ln.setAttribute('x1', x1); ln.setAttribute('y1', y1); ln.setAttribute('x2', b.left); ln.setAttribute('y2', b.top);
        ci.setAttribute('cx', b.left); ci.setAttribute('cy', b.top);
      });
    }
    if (performance.now() < awakeUntil || Math.abs(gx - tx) + Math.abs(gy - ty) > .003) hraf = requestAnimationFrame(frame);
  }

  // charge les grandes images pendant qu'on regarde l'accueil
  const preload = [];
  setTimeout(() => VOLETS.forEach(v => v.items.forEach(it => {
    const u = it.type === 'doc' ? (it.pages || [])[0] : it.src;
    if (u) { const im = new Image(); im.src = U(u); preload.push(im); }
  })), 600);

  /* ---------- ouverture / fermeture d'un volet ---------- */
  let VS = null; // état du volet ouvert

  function openVolet(k, fromHash) {
    if (mode !== 'home') return;
    setHover(null);
    mode = 'opening'; selK = k;
    wakeHome(900);   // l'inclinaison revient à plat
    const zk = VOLETS.length - 1 - k;
    layers.forEach((el, j) => {
      const zj = VOLETS.length - 1 - j;
      el.classList.add(j === k ? 'sel' : zj > zk ? 'up' : 'down');
    });
    scene.classList.add('flat');
    document.body.classList.add('in-volet');
    if (!fromHash) history.pushState({ v: VOLETS[k].id }, '', '#' + VOLETS[k].id);
    buildVolet(k);
    setTimeout(() => { volet.classList.add('show'); volet.setAttribute('aria-hidden', 'false'); mode = 'volet'; }, 820);
  }

  function closeVolet(fromPop) {
    if (mode !== 'volet') return;
    mode = 'closing';
    volet.classList.remove('show');
    volet.setAttribute('aria-hidden', 'true');
    if (!fromPop && location.hash) history.pushState({}, '', location.pathname + location.search);
    setTimeout(() => {
      scene.classList.remove('flat');
      layers.forEach(el => el.classList.remove('sel', 'up', 'down'));
      document.body.classList.remove('in-volet');
      destroyVolet();
      wakeHome(1300);
      setTimeout(() => { mode = 'home'; selK = null; wakeHome(600); }, 900);
    }, 380);
  }

  addEventListener('popstate', () => {
    const k = VOLETS.findIndex(v => v.id === location.hash.slice(1));
    if (k >= 0 && mode === 'home') openVolet(k, true);
    else if (k < 0) closeVolet(true);
  });

  /* ---------- le volet : carrousel souple ---------- */
  const ICON = {
    prev: '<svg viewBox="0 0 28 56" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M26 2 2 28l24 26"/></svg>',
    next: '<svg viewBox="0 0 28 56" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m2 2 24 26L2 54"/></svg>',
    back: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M17 10H3m6-6-6 6 6 6"/></svg>',
    restart: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M5.5 2v4h4"/></svg>',
  };

  // une diapositive par réalisation ; volet vide : un emplacement « en préparation » ;
  // dans l'atelier, une dernière diapositive (+) pour ajouter un élément
  function slideList(v) {
    const list = v.items.map((it, i) => ({ it, i, kind: it.type || v.kind }));
    if (!list.length) list.push({ kind: 'empty' });
    if (EDIT) list.push({ kind: 'add' });
    return list;
  }

  function slideHTML(v, k, s, j) {
    const it = s.it, p = `volets.${k}.items.${s.i}`, t = (it && it.txt) || {};
    let txt = '', obj = '';
    if (s.kind === 'empty') {
      txt = `<h2 ${bind(`volets.${k}.emptyTitle`)}>${esc(v.emptyTitle)}</h2><p class="sub" ${bind(`volets.${k}.emptySub`)}>${esc(v.emptySub)}</p>`;
      obj = `<div class="blank" ${bind(`volets.${k}.emptyText`)}>${esc(v.emptyText)}</div>`;
    } else if (s.kind === 'add') {
      obj = '<div class="blank addcard ed-ui"><span class="plus">+</span><span>Ajouter un élément</span><small>Déposez une image ou un PDF ici, ou cliquez</small></div>';
    } else {
      txt = `<h2 ${bind(p + '.title')}>${esc(it.title)}</h2><p class="sub" ${bind(p + '.sub')}>${esc(it.sub)}</p>` +
        ((it.tags || []).length ? `<ul>${it.tags.map((g, n) => `<li ${bind(`${p}.tags.${n}`)}>${esc(g)}</li>`).join('')}</ul>` : '');
      obj = s.kind === 'map'
        ? `<figure class="mapfig"><img src="${esc(U(it.src))}" alt="${esc(it.title)}" draggable="false" decoding="async"></figure>`
        : '<div class="bookhost"></div>';
    }
    const style = `left:${j * 100}%;--ex:${num(t.dx)}vw;--ey:${num(t.dy)}vh;--fk:${num(t.fk, 1)}`;
    return `<article class="slide ${s.kind}" data-j="${j}"${it ? ` data-i="${s.i}"` : ''} style="${style}">
        <div class="txt"><div class="txtin">${txt}</div></div>
        <div class="obj"><div class="objin">${obj}</div></div>
        ${it ? notesHTML(it.notes, p + '.notes') : ''}
      </article>`;
  }

  function buildVolet(k, at = 0) {
    const v = VOLETS[k], list = slideList(v), n = list.length;
    volet.dataset.kind = v.kind;
    volet.innerHTML = `
      <header class="vbar">
        <div class="back" role="button" tabindex="0">${ICON.back}<span ${bind('labels.back')}>${esc(C.labels.back)}</span></div>
        <p class="vname" ${bind(`volets.${k}.name`)}>${esc(v.name)}</p>
        <p class="count"><span class="cur">1</span> / ${Math.max(1, v.items.length)}</p>
      </header>
      <div class="track">${list.map((s, j) => slideHTML(v, k, s, j)).join('')}</div>
      <button class="nav prev" type="button" aria-label="Réalisation précédente">${ICON.prev}</button>
      <button class="nav next" type="button" aria-label="Réalisation suivante">${ICON.next}</button>
      <button class="restart" type="button" aria-label="Revenir au début">${ICON.restart}</button>`;

    const slides = [...volet.querySelectorAll('.slide')];
    const books = slides.map((sl, j) => {
      const host = $('.bookhost', sl), it = list[j].it;
      if (!host || !it) return null;
      const pages = (it.pages || []).map(U);
      return Flipbook(host, { pages, ratio: it.ratio || DOC_RATIO, keys: false, onChange: ({ index }) => sl.classList.toggle('open', index > 0) });
    });
    at = Math.max(0, Math.min(n - 1, at));
    VS = { k, v, n, list, slides, books, pos: at, target: at, index: at, raf: 0, wheelDir: 0, snapT: 0,
      track: $('.track', volet), txts: slides.map(s => $('.txt', s)), objs: slides.map(s => $('.obj', s)) };

    const back = $('.back', volet);
    back.onclick = e => { if (!inEdit(e)) closeVolet(); };
    back.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === back) { e.preventDefault(); closeVolet(); } };
    $('.prev', volet).onclick = () => go(VS.index - 1);
    $('.next', volet).onclick = () => go(VS.index + 1);
    $('.restart', volet).onclick = () => go(0);
    layout();
    render(true);
    setIndex(at);

    // cartes : au survol la planche se soulève et s'incline vers la souris (plus si elle bouge vite)
    slides.forEach((s, j) => {
      const fig = $('.mapfig', s); if (!fig) return;
      let u = .5, w = .5, pu = .5, pw = .5, on = 0, con = 0, rx = 0, ry = 0, raf = 0;
      const tiltFig = () => {
        con += (on - con) * .1;
        const vx = u - pu, vy = w - pw; pu += (u - pu) * .12; pw += (w - pw) * .12;
        ry += (((u - .5) * 7 + vx * 30) * on - ry) * .08;
        rx += ((-(w - .5) * 6 - vy * 30) * on - rx) * .08;
        fig.style.transform = `perspective(1400px) translateY(${(-6 * con).toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${(1 + .012 * con).toFixed(4)})`;
        const busy = Math.abs(on - con) + Math.abs(rx) * (1 - on) + Math.abs(ry) * (1 - on) + Math.abs(u - pu) + Math.abs(w - pw) > .002 || on;
        raf = busy ? requestAnimationFrame(tiltFig) : 0;
        if (!busy) fig.style.transform = '';
      };
      const wake = () => { if (!raf) raf = requestAnimationFrame(tiltFig); };
      fig.addEventListener('pointermove', e => {
        const r = fig.getBoundingClientRect();
        u = (e.clientX - r.left) / r.width; w = (e.clientY - r.top) / r.height;
        on = 1; wake();
      });
      fig.addEventListener('pointerleave', () => { on = 0; wake(); });
      fig.addEventListener('click', e => { if (VS && !inEdit(e)) openZoom(fig, list[j].it, e); });
    });
    document.dispatchEvent(new CustomEvent('pf:volet', { detail: { k } }));
  }

  /* ---------- carte en grand : cadrage piloté par la souris, molette pour zoomer ---------- */
  let Z = null;
  function openZoom(fig, it, e) {
    if (Z) return;
    const el = document.createElement('div');
    el.className = 'mapzoom';
    el.innerHTML = `<img src="${esc(U(it.src))}" alt="${esc(it.title)}" draggable="false">`;
    document.body.appendChild(el);
    const img = $('img', el), W = innerWidth, H = innerHeight;
    // la carte tient tout entière dans l'écran, avec un fin bord tout autour
    const m = Math.max(16, Math.min(W, H) * .03), k = Math.min(H - 2 * m, (W - 2 * m) / it.ratio) * 1.1;
    if (it.hd) { const hd = new Image(); hd.onload = () => { if (img.isConnected) img.src = U(it.hd); }; hd.src = U(it.hd); }
    const ih = k, iw = k * it.ratio;
    // zoom molette : jusqu'à la pleine définition de l'image HD
    const ZMAX = Math.min(3.5, Math.max(1.6, it.hdh ? it.hdh / ih * 1.15 : 2));
    img.style.width = iw + 'px'; img.style.height = ih + 'px';
    let mxz = e.clientX, myz = e.clientY, rx = 0, ry = 0, zs = 1, zt = 1;
    // centre visé : la souris désigne la partie de la carte à montrer ; le point sous
    // le curseur reste le même quel que soit le zoom (le zoom se fait vers le curseur)
    const aim = () => {
      const sx = Math.max(W * .09, iw * zs - W + 2 * m), sy = Math.max(H * .09, ih * zs - H + 2 * m);
      return [W / 2 + (.5 - mxz / W) * sx, H / 2 + (.5 - myz / H) * sy];
    };
    let [tx, ty] = aim(), [cx, cy] = [tx, ty];
    const fr = fig.getBoundingClientRect(), s0 = fr.width / iw;
    fig.style.visibility = 'hidden';
    img.style.transform = `translate3d(${fr.left}px, ${fr.top}px, 0) scale(${s0})`;
    img.getBoundingClientRect();
    el.classList.add('on');
    img.style.transition = 'transform 760ms cubic-bezier(.72,0,.18,1)';
    img.style.transform = `translate3d(${tx - iw / 2}px, ${ty - ih / 2}px, 0) scale(1)`;
    Z = { el, img, fig, fr, iw, live: false, raf: 0 };
    const kickZ = () => { if (Z && Z.live && !Z.raf) Z.raf = requestAnimationFrame(loop); };
    const move = ev => { mxz = ev.clientX; myz = ev.clientY; kickZ(); };
    addEventListener('pointermove', move);
    el.addEventListener('wheel', ev => {
      ev.preventDefault();
      const d = ev.deltaY * (ev.deltaMode === 1 ? 40 : ev.deltaMode === 2 ? 400 : 1);
      zt = Math.min(ZMAX, Math.max(1, zt * Math.exp(-d * .0018)));
      mxz = ev.clientX; myz = ev.clientY; kickZ();
    }, { passive: false });
    const loop = () => {
      if (!Z || !Z.live) return;
      Z.raf = 0;
      zs += (zt - zs) * .2;                       // réactif, sans à-coup
      if (Math.abs(zt - zs) < .0005) zs = zt;
      [tx, ty] = aim();
      const f = zs === zt ? .09 : .3;             // pendant le zoom, le cadrage suit de près
      cx += (tx - cx) * f; cy += (ty - cy) * f;
      // la carte s'incline vers le côté visé (moins quand on est très près), un peu plus si la souris bouge vite
      const vx = (tx - cx) / W, vy = (ty - cy) / H, damp = 1 / Math.sqrt(zs);
      const gry = ((mxz / W - .5) * 7 - vx * 40) * damp, grx = (-(myz / H - .5) * 6 + vy * 40) * damp;
      ry += (gry - ry) * .08; rx += (grx - rx) * .08;
      img.style.transform = `translate3d(${(cx - iw / 2).toFixed(2)}px, ${(cy - ih / 2).toFixed(2)}px, 0) translate(${iw / 2}px, ${ih / 2}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${zs.toFixed(4)}) translate(${-iw / 2}px, ${-ih / 2}px)`;
      const rest = zs === zt && Math.abs(tx - cx) + Math.abs(ty - cy) < .05 && Math.abs(gry - ry) + Math.abs(grx - rx) < .01;
      if (!rest) Z.raf = requestAnimationFrame(loop);
    };
    setTimeout(() => {
      if (!Z) return;
      img.style.transition = 'none';
      Z.live = true; loop();
    }, 770);
    el.addEventListener('click', closeZoom);
    Z.off = () => removeEventListener('pointermove', move);
  }
  function closeZoom() {
    if (!Z) return;
    const { el, img, fig, iw, off } = Z;
    Z.live = false; cancelAnimationFrame(Z.raf); off();
    const fr = fig.getBoundingClientRect();
    img.style.transition = 'transform 620ms cubic-bezier(.72,0,.18,1)';
    img.style.transform = `translate3d(${fr.left}px, ${fr.top}px, 0) scale(${fr.width / iw})`;
    el.classList.remove('on');
    Z = null;
    setTimeout(() => { fig.style.visibility = ''; el.remove(); }, 640);
  }

  function destroyVolet() {
    if (!VS) return;
    cancelAnimationFrame(VS.raf);
    VS.books.forEach(b => b && b.destroy());
    VS = null;
    volet.innerHTML = '';
  }

  // tailles : la carte tient dans 46 % × 58 % de l'écran, le cahier fait 80 % de la hauteur
  function layout() {
    if (!VS) return;
    const W = innerWidth, H = innerHeight, small = W < 760;
    // empreinte du texte : entre la flèche « précédent » et l'objet, jamais dessus
    const gx = Math.min(104, Math.max(20, W * .052));
    const textL = gx + 20 + Math.min(28, Math.max(18, W * .015)) + W * .012, gap = W * .038;
    const TMIN = Math.min(240, W * .17), TMAX = W * .21;
    VS.slides.forEach((s, j) => {
      const S = VS.list[j], it = S.it;
      let ow, oh;
      if (S.kind !== 'doc') {
        const r = S.kind === 'map' ? it.ratio || 1.414 : 1.414;
        // la carte cède de la largeur si le texte n'a plus sa place
        const mw = small ? W * .9 : Math.min(W * .44, W - 2 * (textL + TMIN + gap)), mh = H * (small ? .42 : .56);
        ow = mw; oh = ow / r; if (oh > mh) { oh = mh; ow = oh * r; }
        ow = Math.round(ow); oh = Math.round(oh);
        const fig = $('.mapfig, .blank', s); fig.style.width = ow + 'px'; fig.style.height = oh + 'px';
      } else {
        const ratio = it.ratio || DOC_RATIO;
        oh = Math.round(H * (small ? .52 : .8)); ow = Math.round(oh * ratio);
        if (ow * 2 > W * .94) { ow = Math.floor(W * .47); oh = Math.round(ow / ratio); }
        const host = $('.bookhost', s); host.style.width = ow * 2 + 'px'; host.style.height = oh + 'px';
      }
      s.style.setProperty('--ow', ow + 'px'); s.style.setProperty('--oh', oh + 'px');
      const obj = $('.obj', s), objW = S.kind === 'doc' ? ow * 2 : ow;
      obj.style.left = Math.round(W / 2 - objW / 2) + 'px'; obj.style.top = Math.round(H * (small ? .4 : .5) - oh / 2) + 'px';
      obj.style.translate = '0 0';
      const tw = it && it.txt && it.txt.w ? it.txt.w * W / 100 : Math.max(160, Math.min(TMAX, W / 2 - ow / 2 - gap - textL));
      s.style.setProperty('--tw', tw + 'px');
    });
    render(true);
  }
  addEventListener('resize', layout);

  function setIndex(i) {
    VS.index = i;
    const real = VS.v.items.length;
    $('.cur', volet).textContent = i < Math.max(1, real) ? i + 1 : '+';
    volet.classList.toggle('at-start', i === 0);
    volet.classList.toggle('at-end', i === VS.n - 1);
    VS.slides.forEach((s, j) => s.classList.toggle('cur', j === i));
  }

  function go(i) {
    if (!VS) return;
    VS.target = Math.max(0, Math.min(VS.n - 1, i));
    kick();
  }
  function kick() { if (VS && !VS.raf) VS.raf = requestAnimationFrame(step); }

  // défilement souple : la position rattrape la cible ; la vitesse incline les objets
  function step() {
    const S = VS; if (!S) return;
    S.raf = 0;
    const prev = S.pos;
    S.pos += (S.target - S.pos) * .085;
    // un cahier ouvert est « laissé ouvert » dès qu'on part ailleurs (sans attendre que le
    // carrousel s'immobilise) ; dès qu'on repart vers lui, il se referme page par page sous nos yeux
    const tg = Math.round(S.target);
    S.books.forEach((b, j) => { if (b && j !== tg && b.index > 0) b.leftOpen = true; });
    const back = S.books[tg];
    if (back && back.leftOpen) { back.leftOpen = false; if (back.index > 0) back.close(); }
    const vel = S.pos - prev;
    const settled = Math.abs(S.target - S.pos) < .0004;
    if (settled) S.pos = S.target;
    render(settled, vel);
    const near = Math.round(S.pos);
    if (near !== S.index && near >= 0 && near < S.n) setIndex(near);
    if (!settled) S.raf = requestAnimationFrame(step);
  }

  function render(rest, vel = 0) {
    const S = VS, W = innerWidth;
    S.track.style.transform = `translate3d(${(-S.pos * W).toFixed(2)}px,0,0)`;
    const sw = Math.max(-14, Math.min(14, vel * -260)), sc = 1 - Math.min(.06, Math.abs(vel) * 1.1);
    S.slides.forEach((s, i) => {
      const off = i - S.pos, txt = S.txts[i], obj = S.objs[i];
      // le texte glisse moins vite que l'objet : léger effet de profondeur
      txt.style.setProperty('--px', (rest ? 0 : off * W * -.22).toFixed(1) + 'px');
      txt.style.setProperty('--vis', Math.max(0, 1 - Math.abs(off) * 1.6).toFixed(3));
      obj.style.transform = rest || Math.abs(off) > 1.2 ? '' : `perspective(1600px) rotateY(${sw.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
    });
  }

  /* molette / pavé tactile : on fait glisser la piste, puis elle se cale */
  volet.addEventListener('wheel', e => {
    if (!VS || mode !== 'volet') return;
    e.preventDefault();
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 40;
    if (!d) return;
    VS.wheelDir = Math.sign(d);
    VS.target = Math.max(-.2, Math.min(VS.n - .8, VS.target + d / 700));
    clearTimeout(VS.snapT);
    VS.snapT = setTimeout(() => {
      if (!VS) return;
      const t = VS.target;
      go(VS.wheelDir > 0 ? Math.ceil(t - .15) : Math.floor(t + .15));
    }, 160);
    kick();
  }, { passive: false });

  /* clavier : flèches = pages du cahier puis réalisation suivante ; Échap = retour */
  addEventListener('keydown', e => {
    if (mode !== 'volet' || !VS) return;
    if (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    if (Z) { if (e.key === 'Escape') closeZoom(); return; }
    const b = VS.books[VS.index];
    if (e.key === 'Escape') closeVolet();
    else if (e.key === 'ArrowRight') { if (b && b.index < b.leaves) b.next(700); else go(VS.index + 1); }
    else if (e.key === 'ArrowLeft') { if (b && b.index > 0) b.prev(700); else go(VS.index - 1); }
  });

  /* ---------- accès pour l'atelier ---------- */
  Object.defineProperties(PF, {
    mode: { get: () => mode, configurable: true },
    k: { get: () => selK, configurable: true },
    VS: { get: () => VS, configurable: true },
  });
  Object.assign(PF, {
    U, wake: wakeHome, renderHomeNotes, layout, go,
    // reconstruit le volet ouvert (après un ajout, un changement d'ordre, d'image…)
    rebuildVolet(at) {
      if (!VS) return;
      const k = VS.k, i = at == null ? VS.index : at;
      destroyVolet(); buildVolet(k, i);
    },
    setCalque(k) { const img = $('.paint img', layers[k]); if (img) img.src = U(VOLETS[k].calque); },
    openVolet, closeVolet,
  });
  document.dispatchEvent(new CustomEvent('pf:home'));
}
