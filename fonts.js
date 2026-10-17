/* ============================================================
   SinghoFonts — the typeface previewer as its own app.
   Latin and Chinese S/T typefaces, previewed live: files load
   on demand (a CJK face is many megabytes — nothing downloads
   until you open it), system faces reference what the device
   already has, and honest badges say which is which. When the
   device lacks a system face, its open-source twin is loaded in
   its place and badged as a stand-in — never a silent fake.
   A Chinese face lights up by itself the moment its file lands
   in webfonts/ — upload it to the repository and it just works.
   ============================================================ */
const LIB = globalThis.__SING_LIB;
const { t, langOf, makeLangPicker } = LIB;

const $ = (id) => document.getElementById(id);

/* ---------------- the catalog ----------------
   kind: latin | cjk
   mode: file   — webfonts/* loaded on demand via FontFace
         system — the device's own copy, referenced by stack;
                  twin = the open-source look-alike that stands in
                  (badged as such) when the device lacks the real face
         pending — the file has not arrived yet; probed for at boot,
                   so dropping it into webfonts/ is enough */
const SAMPLES = {
  pangram: 'The quick brown fox jumps over the lazy dog.',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789 ±×÷ ≈ ≠ ° ½ ¼ ¾ — … “” ‘’ ,.;:!?()',
  lantingS: '永和九年，岁在癸丑，暮春之初，会于会稽山阴之兰亭。此地有崇山峻岭，茂林修竹，又有清流激湍，映带左右。',
  lantingT: '永和九年，歲在癸丑，暮春之初，會於會稽山陰之蘭亭。此地有崇山峻嶺，茂林修竹，又有清流激湍，映帶左右。',
};

const CATALOG = [
  { id: 'academico', name: 'Academico', kind: 'latin', mode: 'file', sub: 'Steinberg · SIL OFL',
    faces: { '400': 'webfonts/Academico-Regular.otf', '700': 'webfonts/Academico-Bold.otf', '400i': 'webfonts/Academico-Italic.otf', '700i': 'webfonts/Academico-BoldItalic.otf' } },
  { id: 'cschoolbook', name: 'Century Schoolbook', kind: 'latin', mode: 'system', sub: 'Monotype · system',
    stack: '"Century Schoolbook", "Century Schoolbook L", "TeX Gyre Schola", Georgia, serif',
    twin: { name: 'TeX Gyre Schola', faces: { '400': 'webfonts/texgyreschola-regular.otf', '700': 'webfonts/texgyreschola-bold.otf' } } },
  { id: 'arial', name: 'Arial', kind: 'latin', mode: 'system', sub: 'Monotype · system',
    stack: 'Arial, Arimo, sans-serif',
    twin: { name: 'Arimo', faces: { '400': 'webfonts/arimo.woff2', '700': 'webfonts/arimo.woff2' } } },
  { id: 'helvetica', name: 'Helvetica', kind: 'latin', mode: 'system', sub: 'Linotype · system',
    stack: 'Helvetica, "Helvetica Neue", Arimo, Arial, sans-serif',
    twin: { name: 'Arimo', faces: { '400': 'webfonts/arimo.woff2', '700': 'webfonts/arimo.woff2' } } },
  { id: 'calibri', name: 'Calibri', kind: 'latin', mode: 'system', sub: 'Microsoft · system',
    stack: 'Calibri, Carlito, "Segoe UI", sans-serif',
    twin: { name: 'Carlito', faces: { '400': 'webfonts/carlito-400.woff2', '700': 'webfonts/carlito-700.woff2' } } },
  { id: 'inter', name: 'Inter', kind: 'latin', mode: 'file', sub: 'Rasmus Andersson · SIL OFL',
    faces: { '400': 'webfonts/inter.woff2', '700': 'webfonts/inter.woff2' } },

  { id: 'hybudai', name: 'HYBuDaiXiong W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYBuDaiXiongW.woff2' },
  { id: 'hyfengbo', name: 'HYFengBoMiLi W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYFengBoMiLiW.woff2' },
  { id: 'hyhalloween', name: 'HYHalloween W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYHalloweenW.woff2' },
  { id: 'hyhanbing', name: 'HYHanBingQu W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYHanBingQuW.woff2' },
  { id: 'hymitang', name: 'HYMiTangTi W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYMiTangTiW.woff2' },
  { id: 'hyxiaosenlin', name: 'HYXiaoSenLin W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYXiaoSenLinW.woff2' },
  { id: 'hyyongzilong', name: 'HYYongziBianSeLong W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYYongziBianSeLongW.woff2' },
  { id: 'hyyongzhiri', name: 'HYYongZiZhiRiSheng W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYYongZiZhiRiShengW.woff2' },
  { id: 'hyzhuzimaxi', name: 'HYZhuZiMaXiTuan W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiMaXiTuanW.woff2' },
  { id: 'hyzhuzimofa', name: 'HYZhuZiMoFaBang W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiMoFaBangW.woff2' },
  { id: 'hyzhuziqingtong', name: 'HYZhuZiQingTongTi W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiQingTongTiW.woff2' },
  { id: 'hyzhuziwangcai', name: 'HYZhuZiWangCai W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiWangCaiW.woff2' },
  { id: 'hyzhuziwanju', name: 'HYZhuZiWanJuPaiDui W', kind: 'cjk', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiWanJuPaiDuiW.woff2' },
];

const WEIGHTS = [
  ['400', () => t(lang, 'fpRegular')],
  ['700', () => t(lang, 'fpBold')],
  ['400i', () => t(lang, 'fpItalic')],
  ['700i', () => t(lang, 'fpBoldItalic')],
];

/* ---------------- state ---------------- */
let lang = 'en';
let filter = 'all';
let cur = null;          /* the catalog entry on screen */
let curWeight = '400';
let size = 32;
const loaded = new Set(); /* face keys already in document.fonts */

/* ---------------- on-demand loading ---------------- */
/* Does this device really have the family? fonts.check() alone cannot be
   trusted: under fontconfig it answers yes to any name at all. So the
   family must also measurably change a rendered string against both
   generic baselines — the same matching path the preview itself uses. */
const canvasHas = (() => {
  const c = document.createElement('canvas').getContext('2d');
  return (name) => {
    const probe = 'mmmmwwwwiiii0000lll';
    const w = (f) => { c.font = f; return c.measureText(probe).width; };
    try {
      const d1 = Math.abs(w(`72px "${name}", serif`) - w('72px serif'));
      const d2 = Math.abs(w(`72px "${name}", sans-serif`) - w('72px sans-serif'));
      return d1 > 0.5 || d2 > 0.5;
    } catch { return true; }
  };
})();
const deviceHas = (name) => {
  try { return document.fonts.check(`16px "${name}"`) && canvasHas(name); } catch { return true; }
};

async function loadFace(family, url, weight, style) {
  const key = `${family}|${url}|${weight}${style}`;
  if (loaded.has(key)) return true;
  try {
    const f = new FontFace(family, `url(${url})`, { weight, style });
    await f.load();
    document.fonts.add(f);
    loaded.add(key);
    return true;
  } catch { return false; }
}

/* a system entry whose real face is missing on this device */
const isStandin = (e) => e.mode === 'system' && !!e.twin && e.local === false;

async function ensureFace(e, wkey) {
  if (e.mode === 'file') {
    const url = e.faces && e.faces[wkey];
    if (!url) return false;
    return loadFace(e.name, url, wkey.startsWith('400') ? '400' : '700', wkey.endsWith('i') ? 'italic' : 'normal');
  }
  if (e.mode === 'system') {
    if (!isStandin(e)) return true; /* the device's own copy is referenced, not downloaded */
    const url = e.twin.faces && e.twin.faces[wkey];
    if (!url) return false;
    return loadFace(e.twin.name, url, wkey.startsWith('400') ? '400' : '700', wkey.endsWith('i') ? 'italic' : 'normal');
  }
  /* pending: one file, one face — bold and italic synthesize, as with any system face */
  if (!e.found) return false;
  if (e.state === 'loaded') return true;
  const ok = await loadFace(e.name, e.found, '400', 'normal');
  if (ok) e.state = 'loaded';
  else e.found = null; /* the file is there but will not load — back to honest pending */
  return ok;
}

/* ---------------- rendering ---------------- */
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stackOf = (e) => (e.mode === 'system' ? e.stack : `"${e.name}", sans-serif`);
const showing = (e) => e.mode !== 'pending' || e.state === 'loaded';

const badgeKey = (e) => {
  if (e.mode === 'system') return isStandin(e) ? 'fpStandIn' : 'fpSystem';
  if (e.mode === 'pending') return e.state === 'loaded' ? 'fpReady' : e.found ? 'fpFound' : 'fpPending';
  return 'fpReady';
};
const badgeCls = (e) => {
  if (e.mode === 'system') return isStandin(e) ? 'sub' : 'sys';
  if (e.mode === 'pending') return e.state === 'loaded' ? 'ok' : e.found ? 'found' : 'pend';
  return 'ok';
};

function renderChips() {
  const chips = [['all', 'fpAll'], ['latin', 'fpLatin'], ['cjk', 'fpChinese']];
  $('fpChips').innerHTML = '';
  for (const [k, key] of chips) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn fp-chip' + (filter === k ? ' on' : '');
    b.setAttribute('aria-pressed', String(filter === k));
    b.textContent = t(lang, key);
    b.addEventListener('click', () => { filter = k; renderGrid(); renderChips(); });
    $('fpChips').appendChild(b);
  }
}

function renderGrid() {
  const g = $('fpGrid');
  g.innerHTML = '';
  for (const e of CATALOG) {
    if (filter !== 'all' && e.kind !== filter) continue;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'fp-card';
    card.dataset.id = e.id;
    const glyph = e.kind === 'cjk' ? '永' : 'Aa';
    const pend = e.mode === 'pending' && e.state !== 'loaded';
    const preview = pend ? '' : glyph;
    const sub = isStandin(e) ? `${e.sub} · ${e.twin.name}` : e.sub;
    card.innerHTML =
      `<span class="fp-glyph${pend ? ' pend' : ''}" style="font-family:${esc(stackOf(e))}">${preview}</span>` +
      `<span class="fp-cname">${esc(e.name)}</span>` +
      `<span class="fp-csub">${esc(sub)}</span>` +
      `<span class="fp-badge ${badgeCls(e)}">${esc(t(lang, badgeKey(e)))}</span>`;
    card.addEventListener('click', () => openFont(e.id));
    g.appendChild(card);
  }
}

function presetList(e) {
  return e.kind === 'cjk'
    ? [['lantingS', 'fpLantingS'], ['lantingT', 'fpLantingT'], ['numbers', 'fpNumbers']]
    : [['pangram', 'fpPangram'], ['alphabet', 'fpAlphabet'], ['numbers', 'fpNumbers'], ['lantingS', 'fpLantingS'], ['lantingT', 'fpLantingT']];
}

let preset = 'pangram';

async function openFont(id) {
  const e = CATALOG.find((x) => x.id === id);
  if (!e) return;
  cur = e;
  curWeight = '400';
  preset = e.kind === 'cjk' ? 'lantingS' : 'pangram';
  try { localStorage.setItem('singhoah:font', e.id); } catch { /* ignore */ }
  renderDetail();
  $('fpHome').hidden = true;
  $('fpDetail').hidden = false;
  window.scrollTo(0, 0);
  /* a CJK file is many megabytes: the page is up first, the real
     letterforms swap in the moment the face arrives */
  await ensureFace(e, '400');
  if (cur === e) renderDetail();
}

function renderDetail() {
  const e = cur;
  if (!e) return;
  $('fpName').textContent = e.name;
  $('fpName').style.fontFamily = showing(e) ? stackOf(e) : '';
  $('fpSub').textContent = e.sub;
  const b = $('fpBadge');
  b.textContent = t(lang, badgeKey(e));
  b.className = 'fp-badge ' + badgeCls(e);
  /* size stepper */
  $('fpSizeLabel').textContent = t(lang, 'fpSize');
  $('fpSizeVal').textContent = String(size);
  /* weights: file fonts list their real faces; system fonts get 400/700 (the browser synthesizes) */
  const ws = e.mode === 'file' ? Object.keys(e.faces) : ['400', '700'];
  const wbox = $('fpWeights');
  wbox.innerHTML = '';
  for (const w of ws) {
    const meta = WEIGHTS.find((x) => x[0] === w);
    if (!meta) continue;
    const b2 = document.createElement('button');
    b2.type = 'button';
    b2.className = 'btn fp-chip' + (curWeight === w ? ' on' : '');
    b2.setAttribute('aria-pressed', String(curWeight === w));
    b2.textContent = meta[1]();
    b2.addEventListener('click', async () => {
      curWeight = w;
      await ensureFace(e, w);
      renderDetail();
    });
    wbox.appendChild(b2);
  }
  /* sample presets */
  const pbox = $('fpPresets');
  pbox.innerHTML = '';
  for (const [k, key] of presetList(e)) {
    const b3 = document.createElement('button');
    b3.type = 'button';
    b3.className = 'btn fp-chip' + (preset === k ? ' on' : '');
    b3.setAttribute('aria-pressed', String(preset === k));
    b3.textContent = t(lang, key);
    b3.addEventListener('click', () => {
      preset = k;
      $('fpPreview').textContent = SAMPLES[k];
      $('fpPreview').lang = k.startsWith('lanting') ? (k === 'lantingS' ? 'zh-Hans' : 'zh-Hant') : 'en';
      renderDetail();
    });
    pbox.appendChild(b3);
  }
  /* the honest truth: a missing file, or a missing system face */
  const pb = $('fpPendingBox');
  if (e.mode === 'pending' && e.state !== 'loaded') {
    pb.hidden = false;
    pb.className = 'fp-pending';
    pb.textContent = t(lang, 'fpPendingMsg');
  } else if (isStandin(e)) {
    pb.hidden = false;
    pb.className = 'fp-pending sub';
    pb.textContent = t(lang, 'fpStandInMsg').replace('{name}', e.name).replace('{sub}', e.twin.name);
  } else {
    pb.hidden = true;
  }
  /* the preview itself: editable, in the font, at the chosen size and weight */
  const pv = $('fpPreview');
  if (!pv.textContent.trim() || pv.dataset.preset !== e.id + preset) {
    pv.textContent = SAMPLES[preset];
    pv.dataset.preset = e.id + preset;
  }
  pv.lang = preset === 'lantingS' ? 'zh-Hans' : preset === 'lantingT' ? 'zh-Hant' : 'en';
  pv.style.fontFamily = showing(e) ? stackOf(e) : 'var(--font-sans)';
  pv.style.fontSize = `${size}px`;
  pv.style.fontWeight = curWeight.startsWith('400') ? '400' : '700';
  pv.style.fontStyle = curWeight.endsWith('i') ? 'italic' : 'normal';
  pv.classList.toggle('fallback', !showing(e));
  /* the smaller rows: every script the face covers, at a reading size */
  const rows = e.kind === 'cjk'
    ? [['lantingS', 'zh-Hans'], ['lantingT', 'zh-Hant'], ['numbers', 'en']]
    : [['pangram', 'en'], ['lantingS', 'zh-Hans'], ['lantingT', 'zh-Hant']];
  $('fpRows').innerHTML = '';
  for (const [k, lg] of rows) {
    const d = document.createElement('div');
    d.className = 'fp-row';
    d.style.fontFamily = showing(e) ? stackOf(e) : 'var(--font-sans)';
    d.style.fontWeight = curWeight.startsWith('400') ? '400' : '700';
    d.lang = lg;
    d.textContent = SAMPLES[k];
    $('fpRows').appendChild(d);
  }
}

/* ---------------- chrome ---------------- */

function applyLang(id, persist = true) {
  lang = id;
  const L = langOf(id);
  document.documentElement.lang = L.html || 'en';
  document.documentElement.dir = L.dir;
  const flag = $('langFlag');
  if (flag && LIB.ccFlag) flag.src = LIB.ccFlag(L.cc || 'tw', L.id);
  $('langLabel').textContent = L.id.toUpperCase();
  $('clockText').textContent = t(lang, 'lpClock');
  $('btnClock').title = t(lang, 'lpClock');
  if ($('settingsText')) $('settingsText').textContent = t(lang, 'settings');
  if ($('btnSettings')) $('btnSettings').title = t(lang, 'settings');
  $('btnLaunch').title = t(lang, 'launchpad');
  $('nightText').textContent = t(lang, document.documentElement.classList.contains('dark') ? 'light' : 'night');
  $('fpBackText').textContent = t(lang, 'fpBack');
  renderChips();
  renderGrid();
  if (cur) renderDetail();
  if (persist) { try { localStorage.setItem('singhoah:lang', lang); } catch { /* ignore */ } }
}

function updateThemeBtn() {
  const dark = document.documentElement.classList.contains('dark');
  $('nightText').textContent = t(lang, dark ? 'light' : 'night');
  $('btnNight').setAttribute('aria-pressed', String(dark));
}

/* ---------------- boot ---------------- */

try { lang = langOf(localStorage.getItem('singhoah:lang') || 'en').id; } catch { lang = 'en'; }
try { const s = parseInt(localStorage.getItem('singhoah:fontsize') || '', 10); if (s >= 12 && s <= 96) size = s; } catch { /* ignore */ }

/* which system faces does this device actually have? (synchronous —
   the first paint already knows) — the ones missing get their open
   twin loaded so every card renders in real letterforms */
for (const e of CATALOG) {
  if (e.mode === 'system' && e.twin) {
    try { e.local = deviceHas(e.name); } catch { e.local = true; }
    if (!e.local) ensureFace(e, '400');
  }
}

makeLangPicker($('langBtn'), $('langPop'), $('langList'), (id) => applyLang(id), '.langwrap');
$('btnNight').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  const dark = document.documentElement.classList.contains('dark');
  try { localStorage.setItem('singhoah:night', dark ? '1' : '0'); } catch { /* ignore */ }
  updateThemeBtn();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') {
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    $('btnNight').click();
  }
});
$('fpBack').addEventListener('click', () => {
  $('fpDetail').hidden = true;
  $('fpHome').hidden = false;
  cur = null;
  renderGrid();
});
const stepSize = (d) => {
  size = Math.max(12, Math.min(96, size + d));
  try { localStorage.setItem('singhoah:fontsize', String(size)); } catch { /* ignore */ }
  renderDetail();
};
$('fpSUp').addEventListener('click', () => stepSize(4));
$('fpSDown').addEventListener('click', () => stepSize(-4));

applyLang(lang, false);
updateThemeBtn();

/* a Chinese face lights up the moment its file lands in webfonts/ —
   probe each expected name (any common format); what is there gets a
   Ready badge and loads on open, what is not stays honestly pending */
(async () => {
  await Promise.all(CATALOG.filter((e) => e.mode === 'pending').map(async (e) => {
    const base = e.file.replace(/\.[^.]+$/, '');
    for (const ext of ['woff2', 'woff', 'ttf', 'otf']) {
      try {
        const r = await fetch(`${base}.${ext}`, { method: 'HEAD' });
        if (r.ok) { e.found = `${base}.${ext}`; break; }
      } catch { /* offline — stays pending */ }
    }
  }));
  renderGrid();
  if (cur) renderDetail();
})();
