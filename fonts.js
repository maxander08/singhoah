/* ============================================================
   SinghoFonts — the typeface previewer as its own app.
   Latin and Chinese S/T typefaces, previewed live: files load
   on demand (a CJK face is many megabytes — nothing downloads
   until you open it), system faces reference what the device
   already has, and honest badges say which is which.
   ============================================================ */
const LIB = globalThis.__SING_LIB;
const { t, langOf, makeLangPicker } = LIB;

const $ = (id) => document.getElementById(id);

/* ---------------- the catalog ----------------
   kind: latin | cjk
   mode: file   — webfonts/* loaded on demand via FontFace
         system — the device's own copy, referenced by stack
         pending — the file has not arrived yet; honest badge */
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
    stack: '"Century Schoolbook", "Century Schoolbook L", C059, Georgia, serif' },
  { id: 'arial', name: 'Arial', kind: 'latin', mode: 'system', sub: 'Monotype · system',
    stack: 'Arial, Helvetica, sans-serif' },
  { id: 'helvetica', name: 'Helvetica', kind: 'latin', mode: 'system', sub: 'Linotype · system',
    stack: 'Helvetica, "Helvetica Neue", Arial, sans-serif' },
  { id: 'calibri', name: 'Calibri', kind: 'latin', mode: 'system', sub: 'Microsoft · system',
    stack: 'Calibri, Carlito, "Segoe UI", sans-serif' },
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
async function ensureFace(entry, wkey) {
  if (entry.mode !== 'file') return true;
  const key = entry.id + '/' + wkey;
  if (loaded.has(key)) return true;
  const url = entry.faces && entry.faces[wkey];
  if (!url) return false;
  const desc = { weight: wkey.startsWith('400') ? '400' : '700', style: wkey.endsWith('i') ? 'italic' : 'normal' };
  const f = new FontFace(entry.name, `url(${url})`, desc);
  try {
    await f.load();
    document.fonts.add(f);
    loaded.add(key);
    return true;
  } catch { return false; }
}

/* ---------------- rendering ---------------- */
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stackOf = (e) => (e.mode === 'system' ? e.stack : `"${e.name}", sans-serif`);

const badgeKey = (e) => (e.mode === 'system' ? 'fpSystem' : e.mode === 'pending' ? 'fpPending' : 'fpReady');
const badgeCls = (e) => (e.mode === 'system' ? 'sys' : e.mode === 'pending' ? 'pend' : 'ok');

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
    const preview = e.mode === 'pending' ? '' : glyph;
    card.innerHTML =
      `<span class="fp-glyph${e.mode === 'pending' ? ' pend' : ''}" style="font-family:${esc(stackOf(e))}">${preview}</span>` +
      `<span class="fp-cname">${esc(e.name)}</span>` +
      `<span class="fp-csub">${esc(e.sub)}</span>` +
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
  if (e.mode === 'file') await ensureFace(e, '400');
  try { localStorage.setItem('singhoah:font', e.id); } catch { /* ignore */ }
  renderDetail();
  $('fpHome').hidden = true;
  $('fpDetail').hidden = false;
  window.scrollTo(0, 0);
}

function renderDetail() {
  const e = cur;
  if (!e) return;
  $('fpName').textContent = e.name;
  $('fpName').style.fontFamily = e.mode === 'pending' ? '' : stackOf(e);
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
      if (e.mode === 'file') await ensureFace(e, w);
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
  /* the pending truth */
  const pb = $('fpPendingBox');
  if (e.mode === 'pending') {
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
  pv.style.fontFamily = e.mode === 'pending' ? 'var(--font-sans)' : stackOf(e);
  pv.style.fontSize = `${size}px`;
  pv.style.fontWeight = curWeight.startsWith('400') ? '400' : '700';
  pv.style.fontStyle = curWeight.endsWith('i') ? 'italic' : 'normal';
  pv.classList.toggle('fallback', e.mode === 'pending');
  /* the smaller rows: every script the face covers, at a reading size */
  const rows = e.kind === 'cjk'
    ? [['lantingS', 'zh-Hans'], ['lantingT', 'zh-Hant'], ['numbers', 'en']]
    : [['pangram', 'en'], ['lantingS', 'zh-Hans'], ['lantingT', 'zh-Hant']];
  $('fpRows').innerHTML = '';
  for (const [k, lg] of rows) {
    const d = document.createElement('div');
    d.className = 'fp-row';
    d.style.fontFamily = e.mode === 'pending' ? 'var(--font-sans)' : stackOf(e);
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
