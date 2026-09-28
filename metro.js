/* ============================================================
   SinghoMetro — tap a station, tap another, get the fare.
   Taipei Metro (distance bands published by TRTC) and the
   Taoyuan Airport MRT (published station-pair table).
   Interactive SVG map: coloured lines, bilingual labels
   (English over the original script), pan / zoom / pinch.
   ============================================================ */
import { METRO } from './metrodata.js';

const LIB = globalThis.__SING_LIB;
const { LANGS, t, langOf, ccFlag, langTitleOf, makeLangPicker, clampPop } = LIB;

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

let lang = 'en';
try { lang = localStorage.getItem('singhoah:lang') || 'en'; } catch { /* ignore */ }
if (!LANGS.some((l) => l.id === lang)) lang = 'en';

/* ---------------- geometry ---------------- */

const RAD = Math.PI / 180;
function hav(a, b) {
  const dLa = (b[0] - a[0]) * RAD, dLo = (b[1] - a[1]) * RAD;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

/* stations: id -> {id,en,zh,lat,lon,sys,x,y,xf:boolean} */
const ST = {};
for (const [id, en, zh, lat, lon, sys] of METRO.st) ST[id] = { id, en, zh, lat, lon, sys, x: 0, y: 0, xf: false };
for (const [a, b] of METRO.xf) { if (ST[a]) ST[a].xf = true; if (ST[b]) ST[b].xf = true; }

/* per-system projection into a 1000 x 800 frame */
const VB = { w: 1000, h: 800 };
/* screen <-> map conversion, correct for preserveAspectRatio letterboxing */
function vGeomFor(k) {
  const rect = els.metroSvg.getBoundingClientRect();
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
  const key = (sysId === 'KS' || sysId === 'TC') ? sysId : 'TRTC';
  return MB_CACHE[key] || null;
}
/* Basemap data lives in per-system modules (mb_trtc.js / mb_ks.js / mb_tc.js)
   fetched only when that system is first shown — the page itself stays light. */
const MB_CACHE = {}, MB_LOAD = {};
function loadBase(sysId) {
  const key = (sysId === 'KS' || sysId === 'TC') ? sysId : 'TRTC';
  if (MB_CACHE[key]) return Promise.resolve(MB_CACHE[key]);
  if (!MB_LOAD[key]) {
    MB_LOAD[key] = import('./mb_' + key.toLowerCase() + '.js')
      .then((m) => { MB_CACHE[key] = m.default || m; return MB_CACHE[key]; })
      .catch(() => { MB_LOAD[key] = null; return null; });
  }
  return MB_LOAD[key];
}
function decodeArr(sysId, cls, a) {
  const P = PROJ[sysId];
  let la = a[0] / 1e4, lo = a[1] / 1e4;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, seg = '';
  const put = () => {
    const ex = (lo - P.lo0) * P.cf * P.sc, ey = (P.la1 - la) * 110.57 * P.sc;
    const x = PORTRAIT ? P.ox + ey : P.ox + ex;
    const y = PORTRAIT ? P.oy + ex : P.oy + ey;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    seg += (seg ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  };
  put();
  for (let i = 2; i < a.length; i += 2) { la += a[i] / 1e4; lo += a[i + 1] / 1e4; put(); }
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
    for (let i = 0; i < TN * TN; i++) t.push({ d: '', b: null, el: null, vis: null, dirty: false });
    return t;
  };
  const B = BASE[sysId] = {
    src: baseArrays(sysId), qi: { maj: 0, min: 0, watf: 0, wats: 0 }, done: false,
    tiles: { maj: mk(), min: mk(), watf: mk(), wats: mk() },
    big: { maj: '', min: '', watf: '', wats: '' },
    bigEl: { maj: null, min: null, watf: null, wats: null }, bigDirty: {},
  };
  if (B.src) pumpBase(sysId);
  else loadBase(sysId).then(() => { B.src = baseArrays(sysId); if (B.src) pumpBase(sysId); });
  return B;
}
const BHOST = { watf: () => bWF, wats: () => bWS, maj: () => bRM, min: () => bRm };
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
  /* flush dirty tiles to the DOM (once per tile) */
  for (const cls of ['maj', 'watf', 'wats', 'min']) {
    for (const t of B.tiles[cls]) {
      if (!t.dirty) continue;
      t.dirty = false;
      if (!t.el) {
        t.el = document.createElementNS(NS, 'path');
        t.el.setAttribute('class', 'b-tile');
        t.el.setAttribute('vector-effect', 'non-scaling-stroke');
        BHOST[cls]().appendChild(t.el);
      }
      t.el.setAttribute('d', t.d);
    }
    if (B.bigDirty[cls]) {
      B.bigDirty[cls] = false;
      if (!B.bigEl[cls]) {
        B.bigEl[cls] = document.createElementNS(NS, 'path');
        B.bigEl[cls].setAttribute('class', 'b-tile');
        B.bigEl[cls].setAttribute('vector-effect', 'non-scaling-stroke');
        BHOST[cls]().appendChild(B.bigEl[cls]);
      }
      B.bigEl[cls].setAttribute('d', B.big[cls]);
    }
  }
  if (sys === sysId) updateBasePaths();
  if (!B.done) setTimeout(() => pumpBase(sysId), 16);
}
/* per-frame cost: 64 bbox tests + a few display toggles. That's it. */
function updateBasePaths() {
  const B = BASE[sys];
  if (!B) return;
  const v = view[sys], g = vGeom();
  const m = (interacting ? 1.6 : 0.35) * g.w;
  const vx0 = v.cx - g.w / 2 - m, vx1 = v.cx + g.w / 2 + m;
  const vy0 = v.cy - g.h / 2 - m, vy1 = v.cy + g.h / 2 + m;
  bRm.style.display = v.k >= 2 ? '' : 'none'; /* street grid at close zoom only */
  for (const cls of ['watf', 'wats', 'maj', 'min']) {
    for (const t of B.tiles[cls]) {
      if (!t.el) continue;
      const b = t.b;
      const on = b[0] <= vx1 && b[2] >= vx0 && b[1] <= vy1 && b[3] >= vy0;
      if (t.vis !== on) { t.vis = on; t.el.style.display = on ? '' : 'none'; }
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

/* graph edges: [a, b, km, lineId] — transfers are zero-km links */
const EDGES = [];
const ADJ = {};
function link(a, b, km, line) {
  EDGES.push([a, b, km, line]);
  (ADJ[a] ||= []).push([b, km, line]);
  (ADJ[b] ||= []).push([a, km, line]);
}
for (const [sys, lid, , refs] of METRO.lines) for (let i = 0; i + 1 < refs.length; i++) link(refs[i], refs[i + 1], hav([ST[refs[i]].lat, ST[refs[i]].lon], [ST[refs[i + 1]].lat, ST[refs[i + 1]].lon]), lid);
for (const [a, b] of METRO.xf) if (ST[a] && ST[b]) link(a, b, 0, 'XF');

/* shortest path: km + a 2 km penalty per transfer, Dijkstra */
function route(a, b) {
  if (a === b) return null;
  const PEN = 2.0;
  const dist = { [a]: 0 }, prev = {}, done = new Set();
  const q = [[0, a, 'START']];
  while (q.length) {
    q.sort((u, v) => u[0] - v[0]);
    const [d, n, via] = q.shift();
    if (done.has(n)) continue;
    done.add(n); prev[n] = via;
    if (n === b) break;
    for (const [m, km, line] of (ADJ[n] || [])) {
      const c = d + km + (line === 'XF' ? PEN : 0);
      if (c < (dist[m] ?? Infinity)) { dist[m] = c; q.push([c, m, n]); }
    }
  }
  if (!(b in prev) && b !== a) return null;
  const path = [b];
  let n = b;
  while (n !== a) { n = prev[n]; path.unshift(n); if (path.length > 200) break; }
  /* compress into ridden segments + transfers */
  let km = 0, stops = -1, transfers = 0;
  const segs = [];
  let cur = null;
  const FAM = { Oz: 'O', Ol: 'O', Rb: 'R', Gb: 'G' }; /* branch ids ride as one family */
  const lineOf = (x, y) => {
    for (const [m, k, line] of (ADJ[x] || [])) if (m === y && line !== 'XF') return FAM[line] || line;
    return null;
  };
  for (let i = 0; i + 1 < path.length; i++) {
    const la = lineOf(path[i], path[i + 1]);
    stops++;
    if (la) { km += hav([ST[path[i]].lat, ST[path[i]].lon], [ST[path[i + 1]].lat, ST[path[i + 1]].lon]); }
    if (!cur || cur.line !== la) {
      if (cur) { segs.push(cur); if (la) transfers++; }
      cur = la ? { line: la, from: path[i], to: path[i + 1] } : null;
    } else cur.to = path[i + 1];
  }
  if (cur) segs.push(cur);
  return { path, km, stops, transfers: Math.max(0, transfers), segs };
}

/* ---------------- fares ---------------- */

function fare(sys, a, b, r) {
  const fc = (METRO.fares || {})[sys] || {};
  if (fc.tyf) {
    const [x, y] = a < b ? [b, a] : [a, b];
    const f = (fc.tyf[x] || {})[y];
    return f ?? null;
  }
  if (fc.bands) {
    const d = r.km * 1.08; /* straight-line hops -> running distance */
    for (const [lim, f] of fc.bands) if (d <= lim) return f;
    return fc.bands[fc.bands.length - 1][1];
  }
  /* fallback: legacy top-level tables */
  if (sys === 'TY') {
    const [x, y] = a < b ? [b, a] : [a, b];
    const f = (METRO.tyf[x] || {})[y];
    return f ?? null;
  }
  const d = r.km * 1.08; /* straight-line hops -> running distance */
  for (const [lim, f] of METRO.bands) if (d <= lim) return f;
  return 65;
}

/* ---------------- chrome (language + theme) ---------------- */

const els = {};
for (const id of ['langBtn', 'langFlag', 'langLabel', 'langPop', 'langList', 'btnNight', 'nightText',
  'btnLaunch', 'btnClock', 'clockText', 'btnSettings', 'settingsText', 'metroSys', 'metroSvg', 'metroLines', 'metroStations', 'metroLabels', 'metroRoute',
  'metroIn', 'metroOut', 'metroFit', 'mFromName', 'mToName', 'mFareBox', 'mFareVal', 'mFareMeta', 'mHint', 'mSwap', 'mClear',
  'metroBaseWater', 'metroBaseRoads', 'mCard', 'mCardText', 'mCardPop', 'mCardMsg', 'mCardId', 'mCardBalLbl', 'mCardBal', 'mCardNote']) els[id] = $(id);
let bWF, bWS, bRM, bRm;
function initBase() {
  const g = (cls) => { const e = document.createElementNS(NS, 'g'); e.setAttribute('class', cls); return e; };
  bWF = g('b-water-f'); bWS = g('b-water-s');
  els.metroBaseWater.append(bWF, bWS);
  bRM = g('b-road-maj'); bRm = g('b-road-min');
  els.metroBaseRoads.append(bRM, bRm);
  /* screen-constant hairlines: stroke-width inherits to every tile path;
     vector-effect is not inherited, so tiles set it at creation */
  for (const [p, w] of [[bWS, 1.2], [bRM, 1.5], [bRm, 0.9]]) {
    p.setAttribute('stroke-width', String(w));
  }
}

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
    const g0 = vGeomFor(base.k);
    const x00 = base.cx - g0.w / 2, y00 = base.cy - g0.h / 2;
    const x01 = v.cx - g.w / 2, y01 = v.cy - g.h / 2;
    const a = g0.s / g.s;
    const tx = x01 + (g0.ox - x00 * g0.s - g.ox) / g.s;
    const ty = y01 + (g0.oy - y00 * g0.s - g.oy) / g.s;
    worldG.style.transform = `matrix(${a.toFixed(5)},0,0,${a.toFixed(5)},${tx.toFixed(2)},${ty.toFixed(2)})`;
    return;
  }
  worldG.style.transform = '';
  els.metroSvg.setAttribute('viewBox', `${v.cx - g.w / 2} ${v.cy - g.h / 2} ${g.w} ${g.h}`);
  els.metroSvg.style.setProperty('--upx', (1 / g.s).toFixed(5));
  /* street basemap: streamed into static tiles, culled by display toggles */
  ensureTracks(sys);
  ensureBase(sys);
  updateBasePaths();
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
  for (const el of [els.metroBaseWater, els.metroBaseRoads, els.metroLines, els.metroStations, els.metroLabels, els.metroRoute]) worldG.appendChild(el);
  els.metroSvg.appendChild(worldG);
}
/* Google-Maps-style gesture compositing, round two: while a gesture is
   live one CSS transform on #metroWorld moves the painted layer (pure GPU
   compositing, zero re-raster). The settle frame re-bakes for sharpness —
   and unlike the old engine that re-bake is now trivial (one viewBox +
   tile visibility toggles), so the handoff is invisible. */
let base = null;
function markInteract() {
  if (!interacting) {
    const v = view[sys];
    base = { cx: v.cx, cy: v.cy, k: v.k, sys };
    worldG.style.willChange = 'transform';
    updateBasePaths(); /* re-cull wide so gesture edges never run empty */
  }
  interacting = true;
  clearTimeout(interT);
  interT = setTimeout(() => {
    interacting = false;
    base = null;
    worldG.style.willChange = '';
    draw(); /* sharp re-bake — cheap now */
    pumpBase(sys);
  }, 200);
}
addEventListener('resize', () => { interacting = false; requestDraw(); });

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
fitContent();

globalThis.__METRO = {
  route, fare, ST,
  get sys() { return sys; },
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
