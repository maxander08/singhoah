/* ============================================================
   SinghoMetro — tap a station, tap another, get the fare.
   Taipei Metro (distance bands published by TRTC) and the
   Taoyuan Airport MRT (published station-pair table).
   Interactive SVG map: coloured lines, bilingual labels
   (English over the original script), pan / zoom / pinch.
   ============================================================ */
import { METRO } from './metrodata.js';
import { ST, hav, route, fare } from './metrofare.js';

const LIB = globalThis.__SING_LIB;
const { LANGS, t, langOf, ccFlag, langTitleOf, makeLangPicker, clampPop } = LIB;

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

let lang = 'en';
try { lang = localStorage.getItem('singhoah:lang') || 'en'; } catch { /* ignore */ }
if (!LANGS.some((l) => l.id === lang)) lang = 'en';

/* ---------------- geometry ---------------- */

const RAD = Math.PI / 180;



/* per-system projection into a 1000 x 800 frame */
const VB = { w: 1000, h: 800 };
/* screen <-> map conversion, correct for preserveAspectRatio letterboxing */
let svgRect = null;
function measureSvg() { svgRect = els.metroSvg.getBoundingClientRect(); }
function vGeomFor(k) {
  if (!svgRect) measureSvg();
  const rect = svgRect;
  /* the viewBox follows the container's aspect so portrait phones use the
     whole screen instead of a letterboxed strip */
  const aspect = Math.max(0.6, Math.min(2.6, rect.height / Math.max(1, rect.width)));
  const w = VB.w / k, h = w * aspect;
  const s = Math.min(rect.width / w, rect.height / h) || 1; /* meet scale */
  return { w, h, rect, s, ox: (rect.width - w * s) / 2, oy: (rect.height - h * s) / 2 };
}
function vGeom() { return { v: view[sys], ...vGeomFor(view[sys].k) }; }
/* world coordinate under a screen point (Google-Maps anchoring primitive) */
function worldAt(sx, sy, g, v) {
  return [(v.cx - g.w / 2) + (sx - g.rect.left - g.ox) / g.s,
          (v.cy - g.h / 2) + (sy - g.rect.top - g.oy) / g.s];
}
/* zoom to nk keeping world point (X,Y) glued to screen point (sx,sy) */
function zoomAnchor(X, Y, sx, sy, nk) {
  const v = view[sys];
  v.k = Math.min(16, Math.max(0.7, nk));
  const g = vGeomFor(v.k);
  v.cx = Math.min(VB.w, Math.max(0, X - (sx - g.rect.left - g.ox) / g.s + g.w / 2));
  v.cy = Math.min(VB.h, Math.max(0, Y - (sy - g.rect.top - g.oy) / g.s + g.h / 2));
  requestDraw();
}
/* portrait phones get the map rotated 90° so the lines' long axis runs
   down the screen instead of across a thin strip */
const PORTRAIT = (() => { try { return innerHeight > innerWidth; } catch { return false; } })();
const PROJ = {};
const SYSS = ['TRTC', 'TY', 'KS', 'TC']; /* order = tab order */
for (const sys of SYSS) {
  const pts = Object.values(ST).filter((s) => s.sys === sys);
  const lons = pts.map((p) => p.lon), lats = pts.map((p) => p.lat);
  const lo0 = Math.min(...lons), lo1 = Math.max(...lons), la0 = Math.min(...lats), la1 = Math.max(...lats);
  const cf = 111.32 * Math.cos(((la0 + la1) / 2) * RAD);
  const kmx = (lo1 - lo0) * cf;
  const kmy = (la1 - la0) * 110.57;
  const fw = PORTRAIT ? kmy : kmx, fh = PORTRAIT ? kmx : kmy; /* frame axes */
  const sc = Math.min((VB.w - 160) / Math.max(1e-6, fw), (VB.h - 160) / Math.max(1e-6, fh));
  const ox = (VB.w - fw * sc) / 2, oy = (VB.h - fh * sc) / 2;
  PROJ[sys] = { lo0, la1, cf, sc, ox, oy };
  for (const p of pts) {
    const ex = (p.lon - lo0) * cf * sc;
    const ey = (la1 - p.lat) * 110.57 * sc;
    if (PORTRAIT) { p.x = ox + ey; p.y = oy + ex; } else { p.x = ox + ex; p.y = oy + ey; }
  }
}

/* ---- street-level basemap (roads / rivers / water, © OpenStreetMap) ----
   Google-Maps-style streaming: nothing is decoded at boot. A system's
   geometry is decoded in ~6 ms time-sliced chunks (like tile fetches), and
   only the pieces whose bbox intersects the viewport (plus a margin) are
   attached to the DOM — re-culled whenever a gesture settles. Zoomed in,
   the paint tree holds a fraction of the city instead of all of it. */
function baseArrays(sysId) {
  return MB_CACHE[baseKey(sysId)] || null;
}
/* Basemap data lives in per-system modules (mb_trtc.js / mb_ks.js / mb_tc.js)
   fetched only when that system is first shown — the page itself stays light. */
const MB_CACHE = {}, MB_LOAD = {}, MB_VER = {};
const baseKey = (sysId) => (sysId === 'KS' || sysId === 'TC') ? sysId : 'TRTC';
function loadBase(sysId) {
  const key = baseKey(sysId);
  if (MB_CACHE[key]) return Promise.resolve(MB_CACHE[key]);
  if (!MB_LOAD[key]) {
    MB_LOAD[key] = import('./mb_' + key.toLowerCase() + '.js')
      .then((m) => { MB_VER[key] = m.__V || '0'; MB_CACHE[key] = m.default || m; return MB_CACHE[key]; })
      .catch(() => { MB_LOAD[key] = null; return null; });
  }
  return MB_LOAD[key];
}
/* quality dial: vectors stay crisp at any zoom, so we spend the perf budget
   on point density instead — drop vertices closer than EPS (~6px at max
   zoom, sub-pixel at overview) while decoding */
const EPS = 0.3;
function decodeArr(sysId, cls, a) {
  const P = PROJ[sysId];
  let la = a[0] / 1e4, lo = a[1] / 1e4;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, seg = '';
  let kx = 1e9, ky = 1e9;
  const put = (force) => {
    const ex = (lo - P.lo0) * P.cf * P.sc, ey = (P.la1 - la) * 110.57 * P.sc;
    const x = PORTRAIT ? P.ox + ey : P.ox + ex;
    const y = PORTRAIT ? P.oy + ex : P.oy + ey;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (!force && !seg) { seg = 'M' + x.toFixed(1) + ' ' + y.toFixed(1); kx = x; ky = y; return; }
    if (!force && Math.hypot(x - kx, y - ky) < EPS) return;
    seg += (seg ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    kx = x; ky = y;
  };
  put(false);
  for (let i = 2; i < a.length; i += 2) { la += a[i] / 1e4; lo += a[i + 1] / 1e4; put(i >= a.length - 2); }
  return { d: seg + (cls === 'watf' ? 'Z' : ''), b: [x0, y0, x1, y1] };
}
/* Basemap geometry streams in and is sliced ONCE into a 4×4 bucket of
   tiles per class (Google-Maps-style pre-slicing). Every tile is a single
   static <path>; a frame costs a few dozen bbox tests that toggle tile
   display — no string rebuilding, no walking tens of thousands of pieces,
   no half-megabyte allocations mid-gesture. */
const BASE = {};
const TN = 4; /* tiles per axis */
function ensureBase(sysId) {
  if (BASE[sysId]) return BASE[sysId];
  const mk = () => {
    const t = [];
    for (let i = 0; i < TN * TN; i++) t.push({ d: '', b: null, p2d: null, dirty: false });
    return t;
  };
  const B = BASE[sysId] = {
    src: baseArrays(sysId), qi: { maj: 0, min: 0, watf: 0, wats: 0 }, done: false, fromCache: false,
    tiles: { maj: mk(), min: mk(), watf: mk(), wats: mk() },
    big: { maj: '', min: '', watf: '', wats: '' },
    bigP2d: { maj: null, min: null, watf: null, wats: null }, bigDirty: {},
  };
  const start = (src) => {
    B.src = src;
    if (!src) return;
    B.key = sysId + ':' + (MB_VER[baseKey(sysId)] || '0') + (PORTRAIT ? 'p' : 'l');
    idbGet(B.key).then((hit) => {
      if (!hit || B.done || BASE[sysId] !== B) { if (!B.done) pumpBase(sysId); return; }
      for (const cls of ['maj', 'watf', 'wats', 'min']) {
        B.tiles[cls] = hit.t[cls].map((t) => ({ d: t.d, b: t.b, p2d: null, dirty: true }));
        B.big[cls] = hit.big[cls] || '';
        if (B.big[cls]) B.bigDirty[cls] = true;
      }
      B.done = true; B.fromCache = true;
      invalidateBase(sysId);
      if (sys === sysId) requestDraw();
    });
  };
  if (B.src) start(B.src);
  else loadBase(sysId).then(() => start(baseArrays(sysId)));
  return B;
}
function saveBase(sysId) {
  const B = BASE[sysId];
  if (!B || !B.key || B.saved) return;
  B.saved = true;
  const t = {};
  for (const cls of ['maj', 'watf', 'wats', 'min']) t[cls] = B.tiles[cls].map((q) => ({ d: q.d, b: q.b }));
  idbSet(B.key, { t, big: { ...B.big } });
}
/* ---- IndexedDB cache: revisits skip the decode and paint instantly ----
   First visit decodes the delta-encoded streets in 6 ms slices; the finished
   tile buckets are then stored per system+data-version+orientation, so the
   next visit hydrates straight from disk — no decode CPU, no lag. */
let IDB_DB;
const idb = () => new Promise((res) => {
  if (IDB_DB) return res(IDB_DB);
  try {
    const rq = indexedDB.open('singhoah-metro', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('base');
    rq.onsuccess = () => { IDB_DB = rq.result; res(IDB_DB); };
    rq.onerror = () => res(null);
  } catch { res(null); }
});
const idbGet = (k) => idb().then((db) => (db ? new Promise((res) => {
  try { const rq = db.transaction('base').objectStore('base').get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch { res(null); }
}) : null));
const idbSet = (k, v) => idb().then((db) => { if (db) { try { db.transaction('base', 'readwrite').objectStore('base').put(v, k); } catch { /* ignore */ } } });
function pumpBase(sysId) {
  const B = BASE[sysId];
  if (!B || B.done || !B.src) return;
  /* never decode mid-gesture: the frame budget belongs to painting */
  if (interacting) { setTimeout(() => pumpBase(sysId), 16); return; }
  const t0 = performance.now();
  const cw = VB.w / TN, ch = VB.h / TN;
  while (performance.now() - t0 < 6) { /* ~6 ms budget per slice */
    let progressed = false;
    for (const cls of ['maj', 'watf', 'wats', 'min']) {
      if (B.qi[cls] < B.src[cls].length) {
        const o = decodeArr(sysId, cls, B.src[cls][B.qi[cls]++]);
        progressed = true;
        const [x0, y0, x1, y1] = o.b;
        const c0 = Math.max(0, Math.min(TN - 1, Math.floor(x0 / cw))), c1 = Math.max(0, Math.min(TN - 1, Math.floor(x1 / cw)));
        const r0 = Math.max(0, Math.min(TN - 1, Math.floor(y0 / ch))), r1 = Math.max(0, Math.min(TN - 1, Math.floor(y1 / ch)));
        const span = (c1 - c0 + 1) * (r1 - r0 + 1);
        if (span > 6) { B.big[cls] += o.d; B.bigDirty[cls] = true; continue; } /* long trunk: always-visible bucket */
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const t = B.tiles[cls][r * TN + c];
          t.d += o.d; t.dirty = true;
          t.b = t.b ? [Math.min(t.b[0], x0), Math.min(t.b[1], y0), Math.max(t.b[2], x1), Math.max(t.b[3], y1)] : [x0, y0, x1, y1];
        }
        if (performance.now() - t0 > 6) break;
      }
    }
    if (!progressed) { B.done = true; break; }
  }
  invalidateBase(sysId);
  if (sys === sysId && !interacting) requestDraw();
  if (!B.done) setTimeout(() => pumpBase(sysId), 16);
  else saveBase(sysId);
}
function invalidateBase(sysId) {
  const B = BASE[sysId];
  for (const cls of ['maj', 'watf', 'wats', 'min']) {
    for (const t of B.tiles[cls]) if (t.dirty) { t.dirty = false; t.p2d = null; }
    if (B.bigDirty[cls]) { B.bigDirty[cls] = false; B.bigP2d[cls] = null; }
  }
}
/* per-frame cost: 64 bbox tests + a few display toggles. That's it. */
/* ---- canvas bake of the street basemap ----
   The heavy geometry (megabytes of roads/rivers) lives in a single
   pre-baked <canvas> layer instead of thousands of live SVG nodes:
   a gesture frame touches ZERO geometry — the baked bitmap is stretched
   by the compositor (like Google Maps' tile layer) and the layer is
   re-baked once, sharply, when the gesture settles. */
let bCtx = null;
const BCLASS_PX = { wats: 1.2, maj: 1.5, min: 0.9 }; /* screen-px stroke widths */
let bPaint = { sys: null, painted: 0, charsMaj: 0, charsWat: 0, charsMin: 0, minVisible: false };
function paintBase(margin) {
  const cv = els.metroBaseCanvas, B = BASE[sys];
  const v = view[sys], g = vGeomFor(v.k);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.max(1, Math.round(g.rect.width * dpr)), H = Math.max(1, Math.round(g.rect.height * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const x0 = v.cx - g.w / 2, y0 = v.cy - g.h / 2;
  bCtx.setTransform(1, 0, 0, 1, 0, 0);
  bCtx.clearRect(0, 0, W, H);
  const st = bPaint = { sys, painted: 0, charsMaj: 0, charsWat: 0, charsMin: 0, minVisible: false };
  if (!B || !g.s) return;
  bCtx.setTransform(dpr * g.s, 0, 0, dpr * g.s, dpr * (g.ox - x0 * g.s), dpr * (g.oy - y0 * g.s));
  const m = (margin === undefined ? 0.25 : margin) * g.w;
  const vx0 = x0 - m, vx1 = x0 + g.w + m, vy0 = y0 - m, vy1 = y0 + g.h + m;
  const cs = getComputedStyle(document.documentElement);
  const col = {
    watf: cs.getPropertyValue('--bwater').trim() || '#c9dbe7',
    wats: cs.getPropertyValue('--bwater').trim() || '#c9dbe7',
    maj: cs.getPropertyValue('--broadM').trim() || 'rgba(29,29,27,.22)',
    min: cs.getPropertyValue('--broadm').trim() || 'rgba(29,29,27,.13)',
  };
  for (const cls of ['watf', 'wats', 'maj', 'min']) {
    if (cls === 'min' && v.k < 2.5) continue; /* street grid at close zoom only */
    if (cls === 'watf') bCtx.fillStyle = col.watf;
    else {
      bCtx.strokeStyle = col[cls];
      bCtx.lineWidth = BCLASS_PX[cls] / g.s; /* world units => constant screen px */
      bCtx.lineCap = 'round'; bCtx.lineJoin = 'round';
    }
    const paint = (p2d, dLen) => {
      if (cls === 'watf') bCtx.fill(p2d); else bCtx.stroke(p2d);
      st.painted++;
      if (cls === 'maj') st.charsMaj += dLen;
      else if (cls === 'watf' || cls === 'wats') st.charsWat += dLen;
      else { st.charsMin += dLen; st.minVisible = true; }
    };
    if (B.big[cls]) {
      if (!B.bigP2d[cls]) B.bigP2d[cls] = new Path2D(B.big[cls]);
      paint(B.bigP2d[cls], B.big[cls].length);
    }
    for (const t of B.tiles[cls]) {
      if (!t.d) continue;
      const b = t.b;
      if (!(b[0] <= vx1 && b[2] >= vx0 && b[1] <= vy1 && b[3] >= vy0)) continue;
      if (!t.p2d) t.p2d = new Path2D(t.d);
      paint(t.p2d, t.d.length);
    }
  }
}

/* ---- real curved track geometry per line, projected per system ---- */
const LIDSYS = {};
for (const [s, lid] of METRO.lines) LIDSYS[lid] = s;
const FAMINV = { O: ['O', 'Oz', 'Ol'], R: ['R', 'Rb'], G: ['G', 'Gb'] };
const TRKD = {};
const TRK_LOAD = {};
function decodeTracks(sysId, TRACKS) {
  const out = {};
  const P = PROJ[sysId];
  const proj = (la, lo) => {
    const ex = (lo - P.lo0) * P.cf * P.sc, ey = (P.la1 - la) * 110.57 * P.sc;
    return PORTRAIT ? [P.ox + ey, P.oy + ex] : [P.ox + ex, P.oy + ey];
  };
  for (const [lid, tk] of Object.entries(TRACKS)) {
    if (LIDSYS[lid] !== sysId) continue;
    let la = tk.p[0] / 1e5, lo = tk.p[1] / 1e5;
    const pts = [proj(la, lo)];
    for (let i = 2; i < tk.p.length; i += 2) { la += tk.p[i] / 1e5; lo += tk.p[i + 1] / 1e5; pts.push(proj(la, lo)); }
    out[lid] = {
      pts,
      st: tk.st,
      d: pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(''),
    };
  }
  return out;
}
/* Track geometry lives in per-system files in the repo (mt_trtc.js, mt_ty.js,
   mt_ks.js, mt_tc.js), fetched only when that system is first shown — like the
   street basemaps. Lines fall back to straight chords until the file lands,
   then the scene is rebuilt with the real curved geometry. */
function ensureTracks(sysId) {
  if (!TRKD[sysId]) TRKD[sysId] = {};
  if (!TRK_LOAD[sysId]) {
    TRK_LOAD[sysId] = import('./mt_' + sysId.toLowerCase() + '.js')
      .then((m) => {
        Object.assign(TRKD[sysId], decodeTracks(sysId, m.default || m));
        delete SCENE[sysId];      /* rebuild paths with real geometry */
        if (sys === sysId) { renderBar(); requestDraw(); }
      })
      .catch(() => { TRK_LOAD[sysId] = null; });
  }
  return TRKD[sysId];
}





/* ---------------- chrome (language + theme) ---------------- */

const els = {};
for (const id of ['langBtn', 'langFlag', 'langLabel', 'langPop', 'langList', 'btnNight', 'nightText',
  'btnLaunch', 'btnClock', 'clockText', 'btnSettings', 'settingsText', 'metroSys', 'metroSvg', 'metroLines', 'metroStations', 'metroLabels', 'metroRoute',
  'metroIn', 'metroOut', 'metroFit', 'mFromName', 'mToName', 'mFareBox', 'mFareVal', 'mFareMeta', 'mHint', 'mSwap', 'mClear',
  'metroBaseCanvas', 'mCard', 'mCardText', 'mCardPop', 'mCardMsg', 'mCardId', 'mCardBalLbl', 'mCardBal', 'mCardNote']) els[id] = $(id);
function initBase() { bCtx = els.metroBaseCanvas.getContext('2d'); }

function applyLang(id, persist = true) {
  lang = langOf(id).id;
  const L = langOf(lang);
  document.documentElement.lang = L.locale;
  document.documentElement.dir = L.dir;
  els.langFlag.src = ccFlag(L.flag);
  els.langLabel.textContent = lang === 'zh-Hant' ? '繁中' : lang.toUpperCase();
  els.langBtn.title = langTitleOf(lang);
  els.langList.setAttribute('aria-label', t(lang, 'language'));
  els.btnNight.title = t(lang, 'nightTitle');
  els.clockText.textContent = t(lang, 'lpClock');
  els.btnClock.title = t(lang, 'lpClock');
  els.btnLaunch.title = t(lang, 'launchpad');
  els.settingsText.textContent = t(lang, 'settings');
  els.btnSettings.title = t(lang, 'settings');
  els.mSwap.textContent = t(lang, 'mSwap');
  els.mClear.textContent = t(lang, 'mClear');
  els.mHint.textContent = t(lang, 'mHint');
  els.mCardText.textContent = t(lang, 'mCard');
  els.mCard.title = t(lang, 'mCard');
  els.mCardBalLbl.textContent = t(lang, 'mCardBal');
  els.mCardNote.textContent = t(lang, 'mCardNote');
  renderCard();
  buildSysTabs();
  updateThemeBtn();
  renderBar();
  draw();
  if (persist) { try { localStorage.setItem('singhoah:lang', lang); } catch { /* ignore */ } }
  document.dispatchEvent(new CustomEvent('singhoah:lang'));
}
function updateThemeBtn() {
  const dark = document.documentElement.classList.contains('dark');
  els.nightText.textContent = t(lang, dark ? 'light' : 'night');
  els.btnNight.setAttribute('aria-pressed', String(dark));
}

/* ---------------- system tabs + view ---------------- */

let sys = 'TRTC';
try { const s = localStorage.getItem('singhoah:metroSys'); if (SYSS.includes(s)) sys = s; } catch { /* ignore */ }
const view = {};
for (const s of SYSS) view[s] = { cx: 500, cy: 400, k: 1 };
let from = null, to = null;

function buildSysTabs() {
  els.metroSys.textContent = '';
  for (const id of SYSS) {
    const key = 'm' + id;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn metro-sysbtn';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(id === sys));
    b.textContent = t(lang, key);
    b.addEventListener('click', () => {
      sys = id; from = to = null;
      try { localStorage.setItem('singhoah:metroSys', id); } catch { /* ignore */ }
      buildSysTabs(); renderBar(); fitContent();
    });
    els.metroSys.appendChild(b);
  }
}

/* ---------------- drawing: layered scene, Google-Maps style ----------------
   Heavy vector content (basemap + line paths) is built ONCE per system and
   afterwards only painted through the viewBox — a pan writes exactly one
   attribute per frame. All world-layer strokes carry vector-effect
   non-scaling-stroke so their width stays constant in screen pixels at any
   zoom. Stations + labels live in per-station groups that are counter-scaled
   by 1/zoom, so dots and type keep a constant screen size like map markers;
   their transforms are rewritten only when the zoom level actually changes.
   Interaction events are coalesced into one redraw per animation frame. */

const SCENE = {};
function buildScene(sysId) {
  if (SCENE[sysId]) return SCENE[sysId];
  const gLines = document.createElementNS(NS, 'g');
  for (const [s, lid, color, refs] of METRO.lines) {
    if (s !== sysId) continue;
    const p = document.createElementNS(NS, 'path');
    const tk = TRKD[sysId][lid];
    p.setAttribute('d', tk ? tk.d : refs.map((r, i) => `${i ? 'L' : 'M'}${ST[r].x.toFixed(1)} ${ST[r].y.toFixed(1)}`).join(''));
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', '3.2');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('class', 'metro-line');
    gLines.appendChild(p);
  }
  const groups = [], byId = {};
  const base = 11; /* label px at screen scale */
  const cands = Object.values(ST).filter((s) => s.sys === sysId)
    .sort((a, b) => (b.xf - a.xf) || a.id.localeCompare(b.id));
  for (const s of cands) {
    const g = document.createElementNS(NS, 'g');
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', s.xf ? '4.2' : '3');
    c.setAttribute('class', 'metro-st');
    c.dataset.st = s.id;
    g.appendChild(c);
    /* bilingual label, built for EVERY station; whether it is shown is
       decided in screen space per zoom level by cullLabels(), so zooming
       in always reveals more names instead of a fixed overview subset */
    const tx = document.createElementNS(NS, 'text');
    tx.setAttribute('x', '0'); tx.setAttribute('y', '0');
    tx.setAttribute('text-anchor', 'middle');
    tx.setAttribute('class', 'metro-label');
    tx.style.fontSize = `${base}px`;
    const t1 = document.createElementNS(NS, 'tspan');
    t1.setAttribute('x', '0'); t1.setAttribute('dy', (base * 1.5).toFixed(2));
    t1.textContent = s.en;
    const t2 = document.createElementNS(NS, 'tspan');
    t2.setAttribute('x', '0'); t2.setAttribute('dy', (base * 0.95).toFixed(2));
    t2.setAttribute('class', 'metro-label-zh');
    t2.textContent = s.zh;
    tx.append(t1, t2);
    g.appendChild(tx);
    s._lw = Math.max(s.en.length, s.zh.length) * base * 0.62 + base;
    s._lh = base * 2.6;
    s._lvis = undefined; /* fresh <text> node: cull must write its first state */
    groups.push([g, s, tx]);
    byId[s.id] = c;
  }
  els.metroLines.textContent = '';
  els.metroStations.textContent = '';
  els.metroLabels.textContent = '';
  els.metroLines.appendChild(gLines);
  /* groups carry a STATIC translate; the 1/zoom counter-scale is one CSS
     variable (--upx) on the svg root, like the world map's marker scaling —
     a zoom frame costs one style write, not 130 attribute rewrites */
  for (const [g, s] of groups) {
    g.setAttribute('transform', `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`);
    els.metroStations.appendChild(g);
  }
  SCENE[sysId] = { groups, byId, sel: null };
  return SCENE[sysId];
}

function updateRoute() {
  els.metroRoute.textContent = '';
  const r = from && to ? route(from, to) : null;
  if (!r) return;
  for (const seg of r.segs) {
    const line = METRO.lines.find((l) => l[1] === seg.line);
    const p = document.createElementNS(NS, 'path');
    const cands = FAMINV[seg.line] || [seg.line];
    const tk = cands.map((l) => TRKD[sys][l]).find((t) => t && t.st[seg.from] != null && t.st[seg.to] != null);
    if (tk) {
      const a = tk.st[seg.from], b = tk.st[seg.to];
      const slice = a <= b ? tk.pts.slice(a, b + 1) : tk.pts.slice(b, a + 1).reverse();
      p.setAttribute('d', slice.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(''));
    } else {
      p.setAttribute('d', `M${ST[seg.from].x} ${ST[seg.from].y}L${ST[seg.to].x} ${ST[seg.to].y}`);
    }
    p.setAttribute('stroke', line ? line[2] : '#000dff');
    p.setAttribute('stroke-width', '6');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    p.setAttribute('opacity', '0.45');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-linecap', 'round');
    els.metroRoute.appendChild(p);
  }
}

/* Zoom-dependent label culling: labels are constant-screen-px markers, so
   visibility is recomputed in screen space on every frame — transfers
   win first, then remaining stations, and zooming in progressively reveals
   the names that were too dense to show at the overview zoom. */
function cullLabels(sc, v, g) {
  const vx0 = v.cx - g.w / 2, vy0 = v.cy - g.h / 2;
  const placed = [];
  let shown = 0;
  for (const [, s, tx] of sc.groups) {
    const sx = (s.x - vx0) * g.s + g.ox, sy = (s.y - vy0) * g.s + g.oy;
    let on = shown < 160 && sx > -30 && sx < g.rect.width + 30 && sy > -30 && sy < g.rect.height + 30;
    if (on) {
      const rx = sx - s._lw / 2, ry = sy - 2;
      for (const q of placed) if (rx < q.x + q.w && rx + s._lw > q.x && ry < q.y + q.h && ry + s._lh > q.y) { on = false; break; }
      if (on) { placed.push({ x: rx, y: ry, w: s._lw, h: s._lh }); shown++; }
    }
    if (s._lvis !== on) { s._lvis = on; tx.style.display = on ? '' : 'none'; }
  }
}

function draw() {
  const v = view[sys];
  const g = vGeom();

  /* mid-gesture: stretch the painted layer on the compositor; the sharp
     direct-apply below runs on the settle frame and on every idle frame */
  if (interacting && base && base.sys === sys) {
    /* The painted layer is still the base-view bake; one CSS transform on
       #metroWorld must reproduce the current view exactly. Screen space of
       the bake: (a*c + t - x00)*g0.s + ox0. We want (c - x01)*g.s + ox for
       every world point c, which solves in two lines: */
    const g0 = vGeomFor(base.k);
    const x00 = base.cx - g0.w / 2, y00 = base.cy - g0.h / 2;
    const x01 = v.cx - g.w / 2, y01 = v.cy - g.h / 2;
    const a = g.s / g0.s;
    const tx = x00 + (g.ox - g0.ox - x01 * g.s) / g0.s;
    const ty = y00 + (g.oy - g0.oy - y01 * g.s) / g0.s;
    worldG.style.transform = `matrix(${a.toFixed(5)},0,0,${a.toFixed(5)},${tx.toFixed(2)},${ty.toFixed(2)})`;
    /* the canvas layer stretches by the same ratio — in screen pixels */
    const ctx_ = (g.ox - x01 * g.s) - a * (g0.ox - x00 * g0.s);
    const cty_ = (g.oy - y01 * g.s) - a * (g0.oy - y00 * g0.s);
    els.metroBaseCanvas.style.transform = `matrix(${a.toFixed(5)},0,0,${a.toFixed(5)},${ctx_.toFixed(2)},${cty_.toFixed(2)})`;
    /* very long pan: view outran the pre-baked margin — re-bake on the fly */
    if (Math.abs(v.cx - base.cx) > 0.9 * g.w || Math.abs(v.cy - base.cy) > 0.9 * g.h) gestureRebake();
    return;
  }
  worldG.style.transform = '';
  els.metroBaseCanvas.style.transform = '';
  els.metroSvg.setAttribute('viewBox', `${v.cx - g.w / 2} ${v.cy - g.h / 2} ${g.w} ${g.h}`);
  els.metroSvg.style.setProperty('--upx', (1 / g.s).toFixed(5));
  /* street basemap: streamed into static tiles, culled by display toggles */
  ensureTracks(sys);
  ensureBase(sys);
  paintBase();
  const sc = buildScene(sys);
  cullLabels(sc, v, g);
  /* selection highlight + route overlay only when the pair changed */
  const sc2 = SCENE[sys];
  const selKey = from && to ? `${from}|${to}` : '';
  if (sc2 && sc2.sel !== selKey) {
    sc2.sel = selKey;
    for (const [id, c] of Object.entries(sc2.byId)) {
      c.setAttribute('class', `metro-st${id === from ? ' from' : id === to ? ' to' : ''}`);
    }
    updateRoute();
  }
}

/* gesture lifecycle: live-transform while interacting, re-bake on settle */
let interacting = false, interT = 0, worldG = null;
function initWorld() {
  worldG = document.createElementNS(NS, 'g');
  worldG.id = 'metroWorld';
  for (const el of [els.metroLines, els.metroStations, els.metroLabels, els.metroRoute]) worldG.appendChild(el);
  els.metroSvg.appendChild(worldG);
}
/* Google-Maps-style gesture compositing, round two: while a gesture is
   live one CSS transform on #metroWorld moves the painted layer (pure GPU
   compositing, zero re-raster). The settle frame re-bakes for sharpness —
   and unlike the old engine that re-bake is now trivial (one viewBox +
   tile visibility toggles), so the handoff is invisible. */
let base = null;
/* mid-gesture re-bake when a pan outruns the pre-baked margin: cheap now
   (one canvas bake + one viewBox write over a light SVG), so long drags
   never run off the edge of the painted layer */
function gestureRebake() {
  const v = view[sys], g = vGeomFor(v.k);
  els.metroSvg.setAttribute('viewBox', `${v.cx - g.w / 2} ${v.cy - g.h / 2} ${g.w} ${g.h}`);
  els.metroSvg.style.setProperty('--upx', (1 / g.s).toFixed(5));
  base = { cx: v.cx, cy: v.cy, k: v.k, sys };
  worldG.style.transform = '';
  els.metroBaseCanvas.style.transform = '';
  paintBase(1.2);
  cullLabels(buildScene(sys), v, g);
}
function markInteract() {
  if (!interacting) {
    const v = view[sys];
    measureSvg();
    base = { cx: v.cx, cy: v.cy, k: v.k, sys };
    worldG.style.willChange = 'transform';
    els.metroBaseCanvas.style.willChange = 'transform';
    paintBase(1.2); /* pre-bake wide so gesture edges never run empty */
  }
  interacting = true;
  clearTimeout(interT);
  interT = setTimeout(() => {
    interacting = false;
    base = null;
    worldG.style.willChange = '';
    els.metroBaseCanvas.style.willChange = '';
    draw(); /* sharp re-bake — cheap now */
    pumpBase(sys);
  }, 200);
}
addEventListener('resize', () => { interacting = false; svgRect = null; requestDraw(); });

/* coalesce event-driven redraws into one per animation frame */
let rafId = 0;
function requestDraw() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => { rafId = 0; draw(); });
}
/* ---------------- fare bar ---------------- */

function renderBar() {
  const name = (id) => (id ? `${ST[id].en} ${ST[id].zh}` : '—');
  els.mFromName.textContent = name(from);
  els.mToName.textContent = name(to);
  const r = from && to && from !== to ? route(from, to) : null;
  if (r) {
    const f = fare(sys, from, to, r);
    els.mFareBox.hidden = false;
    els.mFareVal.textContent = `NT$${f}`;
    const parts = [`${r.stops + 1} ${t(lang, 'mStations')}`];
    if (r.transfers) parts.push(`${r.transfers} ${t(lang, 'mTransfers')}`);
    parts.push(`${Math.max(1, Math.round(r.km / 0.52) + r.transfers * 4)} ${t(lang, 'mMin')}`);
    els.mFareMeta.textContent = parts.join(' · ');
    els.mHint.textContent = '';
  } else {
    els.mFareBox.hidden = true;
    els.mHint.textContent = t(lang, 'mHint');
  }
}

/* ---------------- interaction: pan / zoom / pick ---------------- */

function setView(nx, ny, nk) {
  const v = view[sys];
  v.k = Math.min(16, Math.max(0.7, nk));
  v.cx = Math.min(VB.w, Math.max(0, nx));
  v.cy = Math.min(VB.h, Math.max(0, ny));
  requestDraw();
}

/* zoom so the current system's stations fill the frame */
function fitContent() {
  interacting = false;
  const rect = els.metroSvg.getBoundingClientRect();
  const aspect = Math.max(0.6, Math.min(2.6, rect.height / Math.max(1, rect.width)));
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const s of Object.values(ST)) {
    if (s.sys !== sys) continue;
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
  }
  const pad = 70;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const v = view[sys];
  v.k = Math.min(12, Math.max(0.7, Math.min(VB.w / (maxX - minX), (VB.w * aspect) / (maxY - minY))));
  v.cx = (minX + maxX) / 2;
  v.cy = (minY + maxY) / 2;
  draw();
}

/* ---- gestures, identical to the SinghoClock world map: drag, pinch,
       anchored wheel, double-click zoom, +/−/⌂ buttons — no fling ---- */
let drag = null, moved = 0;
const pointers = new Map();

els.metroSvg.addEventListener('pointerdown', (e) => {
  markInteract();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { els.metroSvg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
  if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY }; moved = 0; pinched = false; }
  else drag = null;
});
let pinched = false;
els.metroSvg.addEventListener('pointermove', (e) => {
  const pt = pointers.get(e.pointerId);
  if (!pt) return;
  markInteract(); /* keep the gesture live: settle 200ms after the LAST event,
                     never mid-drag on long drags */
  if (pointers.size === 2) {
    /* pinch: scale about the live midpoint, like Google Maps */
    const [a, b] = [...pointers.values()];
    const oldMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const oldD = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    pt.x = e.clientX; pt.y = e.clientY;
    const [c, d] = [...pointers.values()];
    const mid = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
    const nd = Math.hypot(c.x - d.x, c.y - d.y) || 1;
    pinched = true;
    const v = view[sys];
    const [X, Y] = worldAt(oldMid.x, oldMid.y, vGeom(), v);
    zoomAnchor(X, Y, mid.x, mid.y, v.k * (nd / oldD));
    return;
  }
  pt.x = e.clientX; pt.y = e.clientY;
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.clientX; drag.y = e.clientY;
  if (moved < 4) return;
  const { v, s } = vGeom();
  if (v.k <= 1) return; /* like the world map: pan only while zoomed in */
  setView(v.cx - dx / s, v.cy - dy / s, v.k);
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size) return;
  drag = null;
  /* like the world map: the map stops the instant you let go — no glide */
  if (pinched || moved > 6) { pinched = false; markInteract(); return; }
  interacting = false;
  /* a tap: nearest station within 16px */
  const { v, w, h, rect, s, ox, oy } = vGeom();
  const px = (e.clientX - rect.left - ox) / s + (v.cx - w / 2);
  const py = (e.clientY - rect.top - oy) / s + (v.cy - h / 2);
  let best = null, bd = 16 / s;
  for (const s of Object.values(ST)) {
    if (s.sys !== sys) continue;
    const d2 = Math.hypot(s.x - px, s.y - py);
    if (d2 < bd) { bd = d2; best = s; }
  }
  if (!best) return;
  if (!from || (from && to)) { from = best.id; to = null; }
  else if (best.id !== from) to = best.id;
  renderBar(); draw();
}
els.metroSvg.addEventListener('pointerup', endPointer);
els.metroSvg.addEventListener('pointercancel', endPointer);
els.metroSvg.addEventListener('wheel', (e) => {
  e.preventDefault();
  markInteract();
  const v = view[sys];
  const [X, Y] = worldAt(e.clientX, e.clientY, vGeom(), v);
  /* world-map wheel step: ×1.6 per notch, anchored under the cursor */
  zoomAnchor(X, Y, e.clientX, e.clientY, v.k * (e.deltaY < 0 ? 1.6 : 0.625));
}, { passive: false });
els.metroSvg.addEventListener('dblclick', (e) => {
  e.preventDefault();
  markInteract();
  const v = view[sys];
  const [X, Y] = worldAt(e.clientX, e.clientY, vGeom(), v);
  /* same instant ×1.6 step the SinghoClock world map uses */
  zoomAnchor(X, Y, e.clientX, e.clientY, v.k * 1.6);
});
els.metroIn.addEventListener('click', () => { const v = view[sys]; setView(v.cx, v.cy, v.k * 1.5); });
els.metroOut.addEventListener('click', () => { const v = view[sys]; setView(v.cx, v.cy, v.k / 1.5); });
els.metroFit.addEventListener('click', () => fitContent());
els.mSwap.addEventListener('click', () => { [from, to] = [to, from]; renderBar(); draw(); });
els.mClear.addEventListener('click', () => { from = to = null; renderBar(); draw(); });

/* ---------------- IC card: scan where NFC exists, honest everywhere else ---------------- */
let cardUid = null;
const cardStore = () => { try { return JSON.parse(localStorage.getItem('singhoah:cardbal') || '{}'); } catch { return {}; } };
function renderCard() {
  const st = cardStore();
  if (cardUid) {
    els.mCardMsg.textContent = t(lang, 'mCardSeen');
    els.mCardId.hidden = false;
    els.mCardId.textContent = cardUid;
    els.mCardBal.value = st[cardUid] ?? '';
  } else {
    els.mCardMsg.textContent = t(lang, 'mCardNone');
    els.mCardId.hidden = true;
    els.mCardBal.value = st.manual ?? '';
  }
}
async function scanCard() {
  if (cardUid || !globalThis.NDEFReader) return;
  els.mCardMsg.textContent = t(lang, 'mCardTap');
  try {
    const r = new globalThis.NDEFReader();
    const got = new Promise((res) => {
      const to = setTimeout(() => res(null), 8000);
      r.addEventListener('reading', (e) => { clearTimeout(to); res(e.serialNumber || ''); });
      r.addEventListener('error', () => { clearTimeout(to); res(null); });
    });
    await r.scan();
    const id = await got;
    if (id) { cardUid = id; renderCard(); }
    else els.mCardMsg.textContent = t(lang, 'mCardNone');
  } catch { els.mCardMsg.textContent = t(lang, 'mCardNone'); }
}
els.mCard.addEventListener('click', () => {
  const open = els.mCardPop.hidden;
  els.mCardPop.hidden = !open;
  els.mCard.setAttribute('aria-expanded', String(open));
  if (open) { renderCard(); clampPop(els.mCardPop); scanCard(); }
});
document.addEventListener('pointerdown', (e) => {
  if (!els.mCardPop.hidden && !els.mCardPop.contains(e.target) && !els.mCard.contains(e.target)) {
    els.mCardPop.hidden = true;
    els.mCard.setAttribute('aria-expanded', 'false');
  }
});
els.mCardBal.addEventListener('change', () => {
  const st = cardStore();
  const k = cardUid || 'manual';
  if (els.mCardBal.value === '') delete st[k]; else st[k] = els.mCardBal.value;
  try { localStorage.setItem('singhoah:cardbal', JSON.stringify(st)); } catch { /* ignore */ }
  renderCard();
});

/* ---------------- boot ---------------- */

makeLangPicker(els.langBtn, els.langPop, els.langList, (id) => applyLang(id), '.langwrap');
els.btnNight.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('singhoah:night', document.documentElement.classList.contains('dark') ? '1' : '0'); } catch { /* ignore */ }
  updateThemeBtn();
  draw();
});
initBase();
initWorld();
applyLang(lang, false);
measureSvg();
fitContent();


globalThis.__METRO = {
  route, fare, ST,
  get sys() { return sys; },
  /* test hook: current logical view + the gesture's bake snapshot */
  get dbg() { return { v: { ...view[sys] }, base: base ? { ...base } : null }; },
  get baseCached() { return Object.values(BASE).some((b) => b.fromCache); },
  /* test hook: what the last canvas bake actually painted */
  baseStats() { return { ...bPaint }; },
  setSys(id) {
    if (!SYSS.includes(id) || id === sys) return id === sys;
    sys = id; from = to = null;
    try { localStorage.setItem('singhoah:metroSys', id); } catch { /* ignore */ }
    buildSysTabs(); renderBar(); fitContent();
    return true;
  },
  /* same selection path a real tap takes */
  pick(id) {
    const s = ST[id];
    if (!s || s.sys !== sys) return false;
    if (!from || (from && to)) { from = id; to = null; }
    else if (id !== from) to = id;
    renderBar(); requestDraw();
    return true;
  },
  zoomBy(f) { const v = view[sys]; markInteract(); setView(v.cx, v.cy, v.k * f); requestDraw(); return view[sys].k; },
  resetView() { fitContent(); return true; },
};

/* frame the chosen route instead of the whole network, so the mini
   actually shows the trip you're taking (same math as fitContent) */
function fitRoute(a, b) {
  const r = a && b && a !== b ? route(a, b) : null;
  const ids = r && r.path && r.path.length ? r.path : (a && b ? [a, b] : []);
  if (!ids.length) return false;
  const rect = els.metroSvg.getBoundingClientRect();
  const aspect = Math.max(0.6, Math.min(2.6, rect.height / Math.max(1, rect.width)));
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const id of ids) {
    const s = ST[id];
    if (!s) continue;
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
  }
  if (!(minX <= maxX)) return false;
  const pad = 80;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const v = view[sys];
  v.k = Math.min(3, Math.max(0.9, Math.min(VB.w / (maxX - minX), (VB.w * aspect) / (maxY - minY))));
  v.cx = (minX + maxX) / 2;
  v.cy = (minY + maxY) / 2;
  draw();
  return true;
}

/* SMate Action Block mode: the page itself, embedded as a true mini —
   chrome hidden, fare pair pre-selected from the URL hash */
if (new URLSearchParams(location.search).get('mini')) {
  document.body.classList.add('smmini');
  svgRect = null;   /* chrome just vanished — the cached rect is stale */
  measureSvg();
  const q = new URLSearchParams(location.hash.slice(1));
  const a = q.get('a'), b = q.get('b');
  if (a && ST[a]) {
    if (ST[a].sys !== sys) __METRO.setSys(ST[a].sys);
    __METRO.pick(a);
    if (b && ST[b]) __METRO.pick(b);
    fitRoute(a, b);
  }
}
