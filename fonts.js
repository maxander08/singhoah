/* ============================================================
   SinghoFonts — the typeface previewer as its own app.
   Chinese S/T typefaces, previewed live. A CJK face is many
   megabytes, so nothing downloads until it is opened; a face
   lights up by itself the moment its file lands in webfonts/
   (upload it to the repository — no code change needed), and
   until then the badge stays honestly "file pending". Never a
   fake preview.
   ============================================================ */
const LIB = globalThis.__SING_LIB;
const { t, langOf, makeLangPicker } = LIB;

const $ = (id) => document.getElementById(id);

/* ---------------- the catalog ----------------
   mode: pending — the file has not arrived yet; probed for at
                   boot, so dropping it into webfonts/ is enough */
const SAMPLES = {
  numbers: '0123456789 ±×÷ ≈ ≠ ° ½ ¼ ¾ — … “” ‘’ ,.;:!?()',
  lantingS: '永和九年，岁在癸丑，暮春之初，会于会稽山阴之兰亭。此地有崇山峻岭，茂林修竹，又有清流激湍，映带左右。',
  lantingT: '永和九年，歲在癸丑，暮春之初，會於會稽山陰之蘭亭。此地有崇山峻嶺，茂林修竹，又有清流激湍，映帶左右。',
};

const CATALOG = [
  { id: 'hybudai', name: 'HYBuDaiXiong W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYBuDaiXiongW.woff2' },
  { id: 'hyfengbo', name: 'HYFengBoMiLi W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYFengBoMiLiW.woff2' },
  { id: 'hyhalloween', name: 'HYHalloween W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYHalloweenW.woff2' },
  { id: 'hyhanbing', name: 'HYHanBingQu W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYHanBingQuW.woff2' },
  { id: 'hymitang', name: 'HYMiTangTi W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYMiTangTiW.woff2' },
  { id: 'hyxiaosenlin', name: 'HYXiaoSenLin W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYXiaoSenLinW.woff2' },
  { id: 'hyyongzilong', name: 'HYYongziBianSeLong W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYYongziBianSeLongW.woff2' },
  { id: 'hyyongzhiri', name: 'HYYongZiZhiRiSheng W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYYongZiZhiRiShengW.woff2' },
  { id: 'hyzhuzimaxi', name: 'HYZhuZiMaXiTuan W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiMaXiTuanW.woff2' },
  { id: 'hyzhuzimofa', name: 'HYZhuZiMoFaBang W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiMoFaBangW.woff2' },
  { id: 'hyzhuziqingtong', name: 'HYZhuZiQingTongTi W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiQingTongTiW.woff2' },
  { id: 'hyzhuziwangcai', name: 'HYZhuZiWangCai W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiWangCaiW.woff2' },
  { id: 'hyzhuziwanju', name: 'HYZhuZiWanJuPaiDui W', mode: 'pending', sub: 'HanYi · Chinese S/T', file: 'webfonts/HYZhuZiWanJuPaiDuiW.woff2' },
];

const WEIGHTS = [
  ['400', () => t(lang, 'fpRegular')],
  ['700', () => t(lang, 'fpBold')],
];

/* ---------------- state ---------------- */
let lang = 'en';
let cur = null;          /* the catalog entry on screen */
let curWeight = '400';
let size = 32;
const loaded = new Set(); /* face keys already in document.fonts */

/* ---------------- on-demand loading ---------------- */
async function loadFace(family, url) {
  const key = `${family}|${url}`;
  if (loaded.has(key)) return true;
  try {
    const f = new FontFace(family, `url(${url})`);
    await f.load();
    document.fonts.add(f);
    loaded.add(key);
    return true;
  } catch { return false; }
}

/* one file, one face — bold synthesizes, as with any system face */
async function ensureFace(e) {
  if (!e.found) return false;
  if (e.state === 'loaded') return true;
  const ok = await loadFace(e.name, e.found);
  if (ok) e.state = 'loaded';
  else e.found = null; /* the file is there but will not load — back to honest pending */
  return ok;
}

/* ---------------- rendering ---------------- */
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stackOf = (e) => `"${e.name}", sans-serif`;
const showing = (e) => e.state === 'loaded';

const badgeKey = (e) => (e.state === 'loaded' ? 'fpReady' : e.found ? 'fpFound' : 'fpPending');
const badgeCls = (e) => (e.state === 'loaded' ? 'ok' : e.found ? 'found' : 'pend');

function renderGrid() {
  const g = $('fpGrid');
  g.innerHTML = '';
  for (const e of CATALOG) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'fp-card';
    card.dataset.id = e.id;
    const pend = !showing(e);
    card.innerHTML =
      `<span class="fp-glyph${pend ? ' pend' : ''}" style="font-family:${esc(stackOf(e))}">${pend ? '' : '永'}</span>` +
      `<span class="fp-cname">${esc(e.name)}</span>` +
      `<span class="fp-csub">${esc(e.sub)}</span>` +
      `<span class="fp-badge ${badgeCls(e)}">${esc(t(lang, badgeKey(e)))}</span>`;
    card.addEventListener('click', () => openFont(e.id));
    g.appendChild(card);
  }
}

function presetList() {
  return [['lantingS', 'fpLantingS'], ['lantingT', 'fpLantingT'], ['numbers', 'fpNumbers']];
}

let preset = 'lantingS';

async function openFont(id) {
  const e = CATALOG.find((x) => x.id === id);
  if (!e) return;
  cur = e;
  curWeight = '400';
  preset = 'lantingS';
  try { localStorage.setItem('singhoah:font', e.id); } catch { /* ignore */ }
  renderDetail();
  $('fpHome').hidden = true;
  $('fpDetail').hidden = false;
  /* the app surface scrolls, not the page — open every font from the top */
  const sc = document.querySelector('.fp-app');
  if (sc) sc.scrollTop = 0;
  window.scrollTo(0, 0);
  /* a CJK file is many megabytes: the page is up first, the real
     letterforms swap in the moment the face arrives */
  await ensureFace(e);
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
  /* weights: 400 real, 700 synthesized by the browser */
  const wbox = $('fpWeights');
  wbox.innerHTML = '';
  for (const w of WEIGHTS) {
    const b2 = document.createElement('button');
    b2.type = 'button';
    b2.className = 'btn fp-chip' + (curWeight === w[0] ? ' on' : '');
    b2.setAttribute('aria-pressed', String(curWeight === w[0]));
    b2.textContent = w[1]();
    b2.addEventListener('click', () => {
      curWeight = w[0];
      renderDetail();
    });
    wbox.appendChild(b2);
  }
  /* sample presets */
  const pbox = $('fpPresets');
  pbox.innerHTML = '';
  for (const [k, key] of presetList()) {
    const b3 = document.createElement('button');
    b3.type = 'button';
    b3.className = 'btn fp-chip' + (preset === k ? ' on' : '');
    b3.setAttribute('aria-pressed', String(preset === k));
    b3.textContent = t(lang, key);
    b3.addEventListener('click', () => {
      preset = k;
      $('fpPreview').textContent = SAMPLES[k];
      $('fpPreview').lang = k === 'lantingS' ? 'zh-Hans' : k === 'lantingT' ? 'zh-Hant' : 'en';
      renderDetail();
    });
    pbox.appendChild(b3);
  }
  /* the honest truth: the file has not arrived yet */
  const pb = $('fpPendingBox');
  if (!showing(e)) {
    pb.hidden = false;
    pb.textContent = t(lang, 'fpPendingMsg');
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
  pv.style.fontWeight = curWeight;
  pv.classList.toggle('fallback', !showing(e));
  /* the smaller rows: every script the face covers, at a reading size */
  const rows = [['lantingS', 'zh-Hans'], ['lantingT', 'zh-Hant'], ['numbers', 'en']];
  $('fpRows').innerHTML = '';
  for (const [k, lg] of rows) {
    const d = document.createElement('div');
    d.className = 'fp-row';
    d.style.fontFamily = showing(e) ? stackOf(e) : 'var(--font-sans)';
    d.style.fontWeight = curWeight;
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

/* a face lights up the moment its file lands in webfonts/ — probe each
   expected name (any common format); what is there gets a Ready badge
   and loads on open, what is not stays honestly pending */
(async () => {
  await Promise.all(CATALOG.map(async (e) => {
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
