/* Atelier : la même page que le site, mais tout y est modifiable.
   Les modifications sont publiées en un seul « commit » dans le dépôt GitHub du site,
   avec une clé d'accès personnelle (jeton GitHub) gardée dans ce navigateur seulement.
   Sans cette clé, personne ne peut rien enregistrer : la page n'est qu'une vitrine. */
window.PF_EDIT = true;
(function () {
  const PF = window.PF = window.PF || {};
  PF.blobs = PF.blobs || {};

  /* ---------- dépôt ---------- */
  const CFG = (() => {
    const h = location.hostname, m = h.match(/^([^.]+)\.github\.io$/i);
    const seg = location.pathname.split('/').filter(Boolean);
    const owner = m ? m[1] : 'IngenieriePublique';
    const repo = m ? (seg.length > 1 ? seg[0] : h) : 'portfolio';
    return { owner, repo, branch: 'main' };
  })();
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
  };
  let TOKEN = store.get('pf_token');

  async function gh(path, opt = {}) {
    const r = await fetch(`https://api.github.com/repos/${CFG.owner}/${CFG.repo}${path}`, {
      ...opt, cache: 'no-store',
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(opt.headers || {}) },
    });
    if (!r.ok) { const t = await r.text(); const e = new Error(`GitHub ${r.status} : ${t.slice(0, 200)}`); e.status = r.status; throw e; }
    return opt.raw ? r.text() : r.json();
  }

  /* ---------- contenu ---------- */
  let C = null, savedJSON = '', initialPaths = new Set();
  const pending = new Map();   // chemin → Blob, à envoyer à la publication
  const clone = o => JSON.parse(JSON.stringify(o));
  // tous les fichiers du dépôt utilisés par le contenu (pour supprimer ceux qui ne servent plus)
  function refs(c) {
    const s = new Set();
    c.volets.forEach(v => {
      if (v.calque) s.add(v.calque);
      v.items.forEach(it => { [it.src, it.hd, ...(it.pages || [])].forEach(p => p && s.add(p)); });
    });
    return s;
  }
  PF.loadContent = async () => {
    let c = null;
    if (TOKEN) {
      try { c = JSON.parse(await gh(`/contents/content.json?ref=${CFG.branch}`, { raw: true, headers: { Accept: 'application/vnd.github.raw+json' } })); }
      catch (e) { toast('Lecture depuis GitHub impossible, version du site utilisée. ' + e.message, 6000); }
    }
    if (!c) c = await (await fetch('content.json', { cache: 'no-store' })).json();
    c.labels = c.labels || { back: 'Volets' };
    c.home.notes = c.home.notes || [];
    c.volets.forEach(v => v.items.forEach(it => { it.tags = it.tags || []; it.notes = it.notes || []; }));
    C = c; savedJSON = JSON.stringify(c); initialPaths = refs(c);
    return c;
  };
  const isDirty = () => pending.size > 0 || JSON.stringify(C) !== savedJSON;
  function changed() { ui.save.classList.toggle('dirty', isDirty()); ui.state.textContent = isDirty() ? 'Modifications non publiées' : 'À jour'; }
  addEventListener('beforeunload', e => { if (C && isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  const getP = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), C);
  const setP = (path, val) => { const ks = path.split('.'), last = ks.pop(); const o = ks.reduce((a, k) => a[k], C); o[last] = val; };
  const parentOf = path => { const ks = path.split('.'); const i = +ks.pop(); return { arr: getP(ks.join('.')), i, path: ks.join('.') }; };

  /* ---------- interface ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const ui = {};
  function buildUI() {
    const bar = h(`<div class="ed-ui ed-bar">
      <span class="ed-brand">Atelier</span>
      <button type="button" data-a="note" title="Créer une boîte de texte : cliquez ensuite à l'endroit voulu">+ Texte</button>
      <button type="button" data-a="order" title="Ordre des éléments de chaque volet">Ordre</button>
      <button type="button" data-a="key" title="Clé d'accès GitHub">Clé</button>
      <a href="./" target="_blank" rel="noopener" title="Ouvrir le site visiteur">Site ↗</a>
      <span class="ed-state">À jour</span>
      <button type="button" data-a="save" class="ed-save">Publier</button>
    </div>`);
    document.body.appendChild(bar);
    ui.bar = bar; ui.save = $('.ed-save', bar); ui.state = $('.ed-state', bar);
    bar.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      ({ note: startPlaceNote, order: toggleOrder, key: askToken, save: publish })[a.dataset.a]();
    });
    ui.toast = h('<div class="ed-ui ed-toast"></div>'); document.body.appendChild(ui.toast);
    ui.file = h('<input type="file" hidden>'); document.body.appendChild(ui.file);
    ui.panel = h('<aside class="ed-ui ed-panel"><header><b>Ordre des éléments</b><button type="button" class="ed-x" aria-label="Fermer">×</button></header><div class="ed-lists"></div><p class="ed-hint">Glissez les éléments pour les réordonner.</p></aside>');
    document.body.appendChild(ui.panel);
    $('.ed-x', ui.panel).onclick = toggleOrder;
  }
  let toastT = 0;
  function toast(msg, ms = 3200) {
    if (!ui.toast) return;
    ui.toast.textContent = msg; ui.toast.classList.add('on');
    clearTimeout(toastT); if (ms) toastT = setTimeout(() => ui.toast.classList.remove('on'), ms);
  }
  function modal(html) {
    const m = h(`<div class="ed-ui ed-modal"><div class="ed-card">${html}</div></div>`);
    document.body.appendChild(m);
    return m;
  }
  function pickFile(accept) {
    return new Promise(res => {
      ui.file.value = ''; ui.file.accept = accept;
      ui.file.onchange = () => res(ui.file.files[0] || null);
      ui.file.click();
    });
  }

  /* ---------- clé d'accès ---------- */
  function askToken() {
    return new Promise(res => {
      const m = modal(`<h3>Clé d'accès GitHub</h3>
        <p>Pour publier, l'atelier a besoin d'une clé (jeton) qui l'autorise à écrire dans le dépôt
        <b>${CFG.owner}/${CFG.repo}</b>. Elle reste dans ce navigateur, sur cet ordinateur.</p>
        <ol><li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Créer un jeton « fine-grained »</a></li>
        <li>Repository access : <i>Only select repositories</i> → <b>${CFG.repo}</b></li>
        <li>Permissions → Repository → <b>Contents : Read and write</b></li>
        <li>Generate token, puis collez-le ici.</li></ol>
        <input type="password" placeholder="github_pat_…" autocomplete="off" value="">
        <div class="ed-row"><button type="button" class="ed-ghost" data-r="forget">Oublier la clé</button><span></span>
        <button type="button" class="ed-ghost" data-r="cancel">Annuler</button><button type="button" data-r="ok">Enregistrer</button></div>`);
      const inp = $('input', m);
      inp.focus();
      m.addEventListener('click', async e => {
        const r = e.target.closest('[data-r]'); if (!r) return;
        if (r.dataset.r === 'forget') { TOKEN = null; store.set('pf_token', null); toast('Clé oubliée sur ce navigateur.'); m.remove(); return res(false); }
        if (r.dataset.r === 'cancel') { m.remove(); return res(false); }
        const v = inp.value.trim(); if (!v) return;
        TOKEN = v;
        try {
          const repo = await gh('');
          if (!repo.permissions || !repo.permissions.push) throw new Error('cette clé ne peut pas écrire dans le dépôt');
          store.set('pf_token', v); m.remove(); toast('Clé enregistrée.'); res(true);
        } catch (err) { TOKEN = store.get('pf_token'); alert('Clé refusée : ' + err.message); }
      });
    });
  }

  /* ---------- publication : un seul commit avec le contenu et les fichiers ---------- */
  const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  let publishing = false;
  async function publish() {
    if (publishing) return;
    if (!isDirty()) return toast('Rien à publier.');
    if (!TOKEN && !(await askToken())) return;
    publishing = true; ui.save.disabled = true;
    try {
      const json = JSON.stringify(C, null, 1);
      const files = [...pending.entries(), ['content.json', new Blob([json], { type: 'application/json' })]];
      const now = refs(C), gone = [...initialPaths].filter(p => !now.has(p) && p.startsWith('assets/'));
      const ref = await gh(`/git/ref/heads/${CFG.branch}`);
      const head = await gh(`/git/commits/${ref.object.sha}`);
      const tree = [];
      let done = 0;
      // envoi des fichiers, quatre à la fois
      const queue = files.slice();
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (queue.length) {
          const [path, blob] = queue.shift();
          const b = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await b64(blob), encoding: 'base64' }) });
          tree.push({ path, mode: '100644', type: 'blob', sha: b.sha });
          toast(`Publication… ${++done} / ${files.length} fichiers`, 0);
        }
      }));
      gone.forEach(path => tree.push({ path, mode: '100644', type: 'blob', sha: null }));
      let t;
      try { t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) }); }
      catch (e) {   // un fichier à supprimer n'existait déjà plus : on publie sans les suppressions
        t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: tree.filter(x => x.sha) }) });
      }
      const cm = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Mise à jour depuis l’atelier', tree: t.sha, parents: [ref.object.sha] }) });
      await gh(`/git/refs/heads/${CFG.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: cm.sha }) });
      pending.clear(); savedJSON = JSON.stringify(C); initialPaths = now;
      changed();
      toast('Publié. Le site visiteur sera à jour d’ici une à deux minutes.', 6000);
    } catch (e) {
      if (e.status === 401 || e.status === 403) { toast('Clé refusée par GitHub.', 5000); TOKEN = null; store.set('pf_token', null); }
      else toast('Échec de la publication : ' + e.message, 8000);
    } finally { publishing = false; ui.save.disabled = false; }
  }

  /* ---------- fichiers : images et PDF ---------- */
  const stamp = () => Date.now().toString(36);
  const slug = s => (s || 'element').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'element';
  function addFile(path, blob) { pending.set(path, blob); PF.blobs[path] = URL.createObjectURL(blob); }
  const toJpeg = (cv, q) => new Promise(res => cv.toBlob(res, 'image/jpeg', q));
  function drawTo(src, sw, sh, max) {
    const k = Math.min(1, max / Math.max(sw, sh)), cv = document.createElement('canvas');
    cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
    x.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }
  async function loadImage(file) {
    const url = URL.createObjectURL(file), im = new Image();
    im.src = url; await im.decode();
    return im;
  }
  // une image → version écran (2000 px) + version détaillée pour le zoom (4000 px)
  async function processImage(file, name) {
    const im = await loadImage(file), w = im.naturalWidth, hh = im.naturalHeight;
    const base = `assets/cartes/${slug(name)}-${stamp()}`;
    const cv1 = drawTo(im, w, hh, 2000), cv2 = drawTo(im, w, hh, 4000);
    addFile(base + '.jpg', await toJpeg(cv1, .86));
    addFile(base + '_hd.jpg', await toJpeg(cv2, .85));
    return { type: 'map', src: base + '.jpg', hd: base + '_hd.jpg', hdh: cv2.height, ratio: w / hh };
  }
  // un PDF → une image par page, pour le cahier à feuilleter (découpage automatique)
  async function processPdf(file, name) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('lecteur PDF non chargé');
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const m = modal('<h3>Découpage du PDF</h3><p class="ed-prog">Lecture…</p><div class="ed-bar2"><i></i></div>');
    try {
      const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
      const dir = `assets/docs/${slug(name)}-${stamp()}`, pages = [];
      let ratio = 864 / 1248;
      for (let p = 1; p <= pdf.numPages; p++) {
        $('.ed-prog', m).textContent = `Page ${p} / ${pdf.numPages}`;
        $('.ed-bar2 i', m).style.width = (p / pdf.numPages * 100) + '%';
        const page = await pdf.getPage(p), vp0 = page.getViewport({ scale: 1 });
        if (p === 1) ratio = vp0.width / vp0.height;
        const vp = page.getViewport({ scale: 1500 / vp0.height });
        const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: x, viewport: vp }).promise;
        const path = `${dir}/p${String(p).padStart(2, '0')}.jpg`;
        addFile(path, await toJpeg(cv, .82));
        pages.push(path);
        page.cleanup();
      }
      return { type: 'doc', pages, ratio };
    } finally { m.remove(); }
  }
  const isPdf = f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  const isImg = f => f && /^image\//.test(f.type);
  async function mediaFrom(file, name) {
    if (isPdf(file)) return processPdf(file, name);
    if (isImg(file)) return processImage(file, name);
    throw new Error('déposez une image (JPG, PNG…) ou un PDF');
  }

  /* ---------- volets : nombre d'éléments, ajout, remplacement ---------- */
  function syncCount(k) {
    const v = C.volets[k], n = v.items.length, el = document.querySelector(`.row [data-bind="volets.${k}.count"]`);
    let c = v.count || '';
    if (/^\d+/.test(c)) {
      c = c.replace(/^\d+(\s+)(\S+)/, (_, sp, w) => `${n}${sp}${n > 1 ? (/[sx]$/.test(w) ? w : w + 's') : w.replace(/s$/, '')}`);
      if (!/^\d+\s/.test(c)) c = c.replace(/^\d+/, n);
    } else if (n > 0 && /pr[ée]paration/i.test(c)) c = `${n} ${v.kind === 'map' ? 'carte' : 'document'}${n > 1 ? 's' : ''}`;
    v.count = c; if (el) el.textContent = c;
  }
  async function addItem(file) {
    const k = PF.k; if (k == null) return;
    const v = C.volets[k];
    try {
      const media = await mediaFrom(file, file.name.replace(/\.[^.]+$/, ''));
      v.items.push({ ...media, title: 'Titre de l’élément', sub: 'Contexte - Mois Année', tags: ['Mot-clé'], notes: [] });
      syncCount(k); changed();
      PF.rebuildVolet(v.items.length - 1);
      toast('Élément ajouté : cliquez sur les textes pour les modifier.');
      setTimeout(() => focusBind(`volets.${k}.items.${v.items.length - 1}.title`, true), 60);
    } catch (e) { toast('Ajout impossible : ' + e.message, 6000); }
  }
  async function replaceMedia(i, file) {
    const k = PF.k, it = C.volets[k].items[i];
    try {
      const media = await mediaFrom(file, it.title);
      ['src', 'hd', 'hdh', 'pages'].forEach(f => delete it[f]);
      Object.assign(it, media);
      changed(); PF.rebuildVolet(i);
      toast(media.type === 'doc' ? `PDF remplacé (${media.pages.length} pages).` : 'Image remplacée.');
    } catch (e) { toast('Remplacement impossible : ' + e.message, 6000); }
  }
  async function replaceCalque(k, file) {
    if (!isImg(file)) return toast('Déposez une image (PNG transparent conseillé).');
    const ext = (file.name.match(/\.(png|jpe?g|svg|webp)$/i) || [, 'png'])[1].toLowerCase();
    const path = `assets/calques/calque-${C.volets[k].id}-${stamp()}.${ext}`;
    addFile(path, file);
    C.volets[k].calque = path; PF.setCalque(k); changed();
    toast('Motif du calque remplacé.');
  }

  /* ---------- textes ---------- */
  const clean = el => el.innerText.replace(/ /g, ' ').replace(/\n$/, '');
  function editable(root = document) {
    root.querySelectorAll('[data-bind]').forEach(el => {
      if (el.isContentEditable) return;
      el.contentEditable = 'plaintext-only';
      if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
      el.spellcheck = true;
    });
  }
  function focusBind(path, selectAll) {
    const el = document.querySelector(`[data-bind="${path}"]`); if (!el) return;
    el.focus();
    if (selectAll) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  }
  document.addEventListener('input', e => {
    const el = e.target.closest && e.target.closest('[data-bind]'); if (!el || !C) return;
    const path = el.dataset.bind, val = clean(el);
    setP(path, val);
    document.querySelectorAll(`[data-bind="${path}"]`).forEach(o => { if (o !== el) o.textContent = val; });
    if (PF.wake) PF.wake(400);
    changed();
  });
  document.addEventListener('keydown', e => {
    const el = e.target.closest && e.target.closest('[data-bind]'); if (!el) return;
    e.stopPropagation();
    if (e.key === 'Escape') { el.blur(); return; }
    // mots-clés : Entrée crée le suivant
    if (e.key === 'Enter' && /\.tags\.\d+$/.test(el.dataset.bind)) {
      e.preventDefault();
      const { arr, i, path } = parentOf(el.dataset.bind);
      arr.splice(i + 1, 0, ''); changed();
      PF.rebuildVolet(); focusBind(`${path}.${i + 1}`);
    }
  }, true);
  // un mot-clé ou une boîte de texte vidé disparaît
  document.addEventListener('focusout', e => {
    const el = e.target.closest && e.target.closest('[data-bind]'); if (!el || !C) return;
    const b = el.dataset.bind;
    if (/\.tags\.\d+$/.test(b) && !clean(el).trim()) {
      setTimeout(() => {
        const { arr, i } = parentOf(b);
        if (arr && arr[i] !== undefined && !String(arr[i]).trim()) { arr.splice(i, 1); changed(); if (PF.VS) PF.rebuildVolet(); }
      }, 0);
    }
  });

  /* ---------- poignées : déplacer, élargir, grossir ---------- */
  function drag(e, onMove, onEnd) {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY;
    const mv = ev => onMove(ev.clientX - x0, ev.clientY - y0, ev);
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); document.body.classList.remove('ed-dragging'); onEnd && onEnd(); changed(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    document.body.classList.add('ed-dragging');
  }
  const r2 = x => Math.round(x * 100) / 100;

  // le bloc de texte à côté d'une carte ou d'un document
  function decorateTxt(slide, i) {
    const k = PF.k, it = C.volets[k].items[i], txt = $('.txt', slide);
    if (!txt || $('.ed-tools', txt)) return;
    const tools = h(`<div class="ed-ui ed-tools ed-txttools">
      <button type="button" data-t="move" title="Déplacer">✥</button>
      <button type="button" data-t="smaller" title="Texte plus petit">A−</button>
      <button type="button" data-t="bigger" title="Texte plus grand">A+</button>
      <button type="button" data-t="tag" title="Ajouter un mot-clé">+ mot-clé</button>
      <button type="button" data-t="reset" title="Remettre la position et la taille d'origine">↺</button></div>`);
    txt.appendChild(tools);
    const grip = h('<i class="ed-ui ed-grip ed-grip-l" title="Largeur"></i>'); txt.appendChild(grip);
    const T = () => (it.txt = it.txt || {});
    const apply = () => {
      const t = it.txt || {};
      slide.style.setProperty('--ex', (t.dx || 0) + 'vw'); slide.style.setProperty('--ey', (t.dy || 0) + 'vh'); slide.style.setProperty('--fk', t.fk || 1);
    };
    tools.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      if (b.dataset.t === 'move') {
        const dx0 = T().dx || 0, dy0 = T().dy || 0;
        drag(e, (dx, dy) => { T().dx = r2(dx0 + dx / innerWidth * 100); T().dy = r2(dy0 + dy / innerHeight * 100); apply(); });
      }
    });
    tools.addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      const t = b.dataset.t;
      if (t === 'smaller' || t === 'bigger') { T().fk = r2(Math.max(.5, Math.min(2.5, (T().fk || 1) * (t === 'bigger' ? 1.1 : 1 / 1.1)))); apply(); changed(); }
      if (t === 'reset') { delete it.txt; apply(); changed(); PF.layout(); }
      if (t === 'tag') { it.tags.push('Mot-clé'); changed(); PF.rebuildVolet(); focusBind(`volets.${k}.items.${i}.tags.${it.tags.length - 1}`, true); }
    });
    // le texte est aligné à droite : on l'élargit en tirant son bord gauche
    grip.addEventListener('pointerdown', e => {
      const w0 = txt.getBoundingClientRect().width;
      drag(e, dx => { T().w = r2(Math.max(8, (w0 - dx) / innerWidth * 100)); slide.style.setProperty('--tw', T().w * innerWidth / 100 + 'px'); });
    });
  }

  // boîtes de texte libres
  function decorateNote(note) {
    if ($('.ed-tools', note)) return;
    const path = note.dataset.note, n = () => getP(path);
    const tools = h(`<div class="ed-ui ed-tools ed-notetools">
      <button type="button" data-t="move" title="Déplacer">✥</button>
      <button type="button" data-t="smaller" title="Plus petit">A−</button>
      <button type="button" data-t="bigger" title="Plus grand">A+</button>
      <button type="button" data-t="bold" title="Gras / normal"><b>G</b></button>
      <button type="button" data-t="del" title="Supprimer cette boîte">🗑</button></div>`);
    note.appendChild(tools);
    const grip = h('<i class="ed-ui ed-grip ed-grip-r" title="Largeur"></i>'); note.appendChild(grip);
    tools.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-t]'); if (!b || b.dataset.t !== 'move') return;
      const x0 = n().x, y0 = n().y;
      drag(e, (dx, dy) => { n().x = r2(x0 + dx / innerWidth * 100); n().y = r2(y0 + dy / innerHeight * 100); note.style.left = n().x + 'vw'; note.style.top = n().y + 'vh'; });
    });
    tools.addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      const t = b.dataset.t;
      if (t === 'smaller' || t === 'bigger') { n().fs = Math.max(8, Math.min(120, Math.round((n().fs || 16) * (t === 'bigger' ? 1.12 : 1 / 1.12)))); note.style.setProperty('--fs', n().fs); changed(); }
      if (t === 'bold') { n().wt = (n().wt || 300) >= 600 ? 300 : 600; note.style.fontWeight = n().wt; changed(); }
      if (t === 'del') {
        const { arr, i } = parentOf(path); arr.splice(i, 1); changed();
        if (path.startsWith('home.')) { PF.renderHomeNotes(); decorateHome(); } else PF.rebuildVolet();
      }
    });
    grip.addEventListener('pointerdown', e => {
      const w0 = n().w || 20;
      drag(e, dx => { n().w = r2(Math.max(4, w0 + dx / innerWidth * 100)); note.style.width = n().w + 'vw'; });
    });
  }

  // « + Texte » : on clique ensuite là où la boîte doit apparaître
  function startPlaceNote() {
    if (PF.mode === 'volet') {
      const S = PF.VS, s = S && S.list[S.index];
      if (!s || !s.it) return toast('Ajoutez d’abord un élément sur cette page.');
    } else if (PF.mode !== 'home') return;
    document.body.classList.add('ed-placing');
    toast('Cliquez à l’endroit où placer la boîte de texte (Échap pour annuler).', 0);
    const cancel = () => { document.body.classList.remove('ed-placing'); removeEventListener('pointerdown', place, true); removeEventListener('keydown', esc, true); toast('', 1); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } };
    const place = e => {
      if (e.target.closest('.ed-bar')) return;
      e.preventDefault(); e.stopPropagation(); cancel();
      const note = { text: 'Votre texte', x: r2(e.clientX / innerWidth * 100), y: r2(e.clientY / innerHeight * 100), w: 18, fs: 16, wt: 300 };
      let path;
      if (PF.mode === 'volet') {
        const S = PF.VS, it = S.list[S.index].it, i = S.list[S.index].i;
        it.notes.push(note); path = `volets.${PF.k}.items.${i}.notes.${it.notes.length - 1}`;
        PF.rebuildVolet();
      } else {
        C.home.notes.push(note); path = `home.notes.${C.home.notes.length - 1}`;
        PF.renderHomeNotes(); decorateHome();
      }
      changed();
      setTimeout(() => focusBind(path + '.text', true), 30);
    };
    addEventListener('pointerdown', place, true); addEventListener('keydown', esc, true);
  }

  /* ---------- glisser-déposer de fichiers ---------- */
  function dropZone(el, onFile) {
    el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('ed-over'); } });
    el.addEventListener('dragleave', () => el.classList.remove('ed-over'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('ed-over'); const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  }
  // un fichier lâché à côté de la cible ne doit pas ouvrir le PDF dans l'onglet
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => e.preventDefault());

  /* ---------- décoration des pages ---------- */
  function decorateHome() {
    editable();
    document.querySelectorAll('#hnotes .note').forEach(decorateNote);
    document.querySelectorAll('.row').forEach((row, k) => {
      if ($('.ed-tools', row)) return;
      const t = h(`<div class="ed-ui ed-tools ed-rowtools">
        <button type="button" data-t="open" title="Ouvrir ce volet">Ouvrir →</button>
        <button type="button" data-t="calque" title="Changer l'image du calque (ou déposez-la ici)">Motif du calque</button></div>`);
      row.appendChild(t);
      t.addEventListener('click', async e => {
        e.stopPropagation();
        const b = e.target.closest('[data-t]'); if (!b) return;
        if (b.dataset.t === 'open') PF.openVolet(k);
        else { const f = await pickFile('image/*'); if (f) replaceCalque(k, f); }
      });
      dropZone(row, f => replaceCalque(k, f));
    });
    const c = $('.contact');
    if (c && !$('.ed-tools', c)) {
      const t = h('<div class="ed-ui ed-tools ed-linktools"><button type="button" title="Adresse du profil LinkedIn">Lien LinkedIn</button></div>');
      c.appendChild(t);
      t.onclick = () => {
        const v = prompt('Adresse du profil LinkedIn :', C.home.linkedin || '');
        if (v != null) { C.home.linkedin = v.trim(); $('.contact a').href = C.home.linkedin; changed(); }
      };
    }
  }
  function decorateVolet() {
    editable($('#volet'));
    const S = PF.VS; if (!S) return;
    S.slides.forEach((sl, j) => {
      const s = S.list[j];
      sl.querySelectorAll('.note').forEach(decorateNote);
      if (s.kind === 'add') {
        const card = $('.addcard', sl);
        card.onclick = async () => { const f = await pickFile('image/*,application/pdf,.pdf'); if (f) addItem(f); };
        dropZone(card, addItem);
        return;
      }
      if (s.kind === 'empty') { dropZone($('.blank', sl), addItem); return; }
      decorateTxt(sl, s.i);
      const objin = $('.objin', sl);
      const isDoc = s.kind === 'doc';
      const btn = h(`<div class="ed-ui ed-tools ed-mediatools"><button type="button">${isDoc ? 'Remplacer le PDF' : 'Remplacer l’image'}</button><span>ou déposez un fichier sur ${isDoc ? 'le document' : 'la carte'}</span></div>`);
      objin.appendChild(btn);
      btn.querySelector('button').onclick = async () => { const f = await pickFile('image/*,application/pdf,.pdf'); if (f) replaceMedia(s.i, f); };
      dropZone(objin, f => replaceMedia(s.i, f));
    });
    if (ui.panel.classList.contains('on')) renderOrder();
  }
  document.addEventListener('pf:home', () => { buildUI(); decorateHome(); changed(); });
  document.addEventListener('pf:volet', decorateVolet);

  /* ---------- ordre des éléments ---------- */
  function toggleOrder() { ui.panel.classList.toggle('on'); if (ui.panel.classList.contains('on')) renderOrder(); }
  function renderOrder() {
    const box = $('.ed-lists', ui.panel);
    box.innerHTML = C.volets.map((v, k) => `<section data-k="${k}"><h4>${v.name.replace(/[<&]/g, '')}</h4><ol>${v.items.map((it, i) =>
      `<li draggable="true" data-i="${i}"><span class="ed-h">⋮⋮</span><span class="ed-tt">${(it.title || 'Sans titre').replace(/[<&]/g, '')}</span><small>${it.type === 'doc' ? 'PDF' : 'image'}</small>` +
      `<button type="button" data-o="up" title="Monter">↑</button><button type="button" data-o="down" title="Descendre">↓</button><button type="button" data-o="del" title="Supprimer">🗑</button></li>`).join('') ||
      '<li class="ed-none">Aucun élément</li>'}</ol></section>`).join('');
    let from = null;
    box.querySelectorAll('li[draggable]').forEach(li => {
      const k = +li.closest('section').dataset.k, i = +li.dataset.i;
      li.addEventListener('dragstart', e => { from = { k, i }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); li.classList.add('ed-drag'); });
      li.addEventListener('dragend', () => li.classList.remove('ed-drag'));
      li.addEventListener('dragover', e => { if (from && from.k === k) { e.preventDefault(); e.stopPropagation(); li.classList.add('ed-tgt'); } });
      li.addEventListener('dragleave', () => li.classList.remove('ed-tgt'));
      li.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); li.classList.remove('ed-tgt'); if (from && from.k === k) move(k, from.i, i); from = null; });
      li.addEventListener('click', e => {
        const b = e.target.closest('[data-o]'); if (!b) return;
        if (b.dataset.o === 'up') move(k, i, i - 1);
        if (b.dataset.o === 'down') move(k, i, i + 1);
        if (b.dataset.o === 'del' && confirm(`Supprimer « ${C.volets[k].items[i].title} » ?\n(les fichiers seront retirés du site à la prochaine publication)`)) {
          C.volets[k].items.splice(i, 1); syncCount(k); changed(); after(k, Math.max(0, i - 1));
        }
      });
    });
  }
  function move(k, a, b) {
    const arr = C.volets[k].items;
    if (b < 0 || b >= arr.length || a === b) return;
    const [x] = arr.splice(a, 1); arr.splice(b, 0, x);
    changed(); after(k, b);
  }
  function after(k, at) { renderOrder(); if (PF.VS && PF.k === k) PF.rebuildVolet(at); }
})();
