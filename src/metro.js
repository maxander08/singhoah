/* ============================================================
   SinghoMetro — tap a station, tap another, get the fare.
   Taipei Metro (distance bands published by TRTC) and the
   Taoyuan Airport MRT (published station-pair table).
   Interactive SVG map: coloured lines, bilingual labels
   (English over the original script), pan / zoom / pinch.
   ============================================================ */
import { METRO } from './metrodata.js';
import { TRACKS } from './metrotracks.js';

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
  v.k = Math.min(12, Math.max(0.7, nk));
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
const BASE = {};
function ensureBase(sysId) {
  if (BASE[sysId]) return BASE[sysId];
  const B = BASE[sysId] = { src: baseArrays(sysId), dec: { maj: [], min: [], watf: [], wats: [] }, qi: { maj: 0, min: 0, watf: 0, wats: 0 }, done: false };
  if (B.src) pumpBase(sysId);
  else loadBase(sysId).then(() => { B.src = baseArrays(sysId); if (B.src) pumpBase(sysId); });
  return B;
}
function pumpBase(sysId) {
  const B = BASE[sysId];
  if (!B || B.done || !B.src) return;
  const t0 = performance.now();
  while (performance.now() - t0 < 6) { /* ~6 ms budget per slice */
    let progressed = false;
    for (const cls of ['maj', 'watf', 'wats', 'min']) {
      if (B.qi[cls] < B.src[cls].length) {
        B.dec[cls].push(decodeArr(sysId, cls, B.src[cls][B.qi[cls]++]));
        progressed = true;
        if (performance.now() - t0 > 6) break;
      }
    }
    if (!progressed) { B.done = true; break; }
  }
  if (sys === sysId) updateBasePaths();
  if (!B.done) setTimeout(() => pumpBase(sysId), 16);
}
/* attach only viewport-visible decoded pieces (margin covers gestures) */
function updateBasePaths() {
  const B = BASE[sys];
  if (!B) return;
  const v = view[sys], g = vGeom();
  const m = 0.35 * g.w;
  const vx0 = v.cx - g.w / 2 - m, vx1 = v.cx + g.w / 2 + m;
  const vy0 = v.cy - g.h / 2 - m, vy1 = v.cy + g.h / 2 + m;
  const pick = (cls) => {
    let d = '';
    for (const o of B.dec[cls]) {
      const b = o.b;
      if (b[0] <= vx1 && b[2] >= vx0 && b[1] <= vy1 && b[3] >= vy0) d += o.d;
    }
    return d || 'M0 0';
  };
  bWF.setAttribute('d', pick('watf'));
  bWS.setAttribute('d', pick('wats'));
  bRM.setAttribute('d', pick('maj'));
  bRm.setAttribute('d', pick('min'));
}

/* ---- real curved track geometry per line, projected per system ---- */
const LIDSYS = {};
for (const [s, lid] of METRO.lines) LIDSYS[lid] = s;
const FAMINV = { O: ['O', 'Oz', 'Ol'], R: ['R', 'Rb'], G: ['G', 'Gb'] };
const TRKD = {};
for (const sysId of SYSS) {
  TRKD[sysId] = {};
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
    TRKD[sysId][lid] = {
      pts,
      st: tk.st,
      d: pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(''),
    };
  }
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
  bWF = document.createElementNS(NS, 'path'); bWF.setAttribute('class', 'b-water-f');
  bWS = document.createElementNS(NS, 'path'); bWS.setAttribute('class', 'b-water-s');
  els.metroBaseWater.append(bWF, bWS);
  bRM = document.createElementNS(NS, 'path'); bRM.setAttribute('class', 'b-road-maj');
  bRm = document.createElementNS(NS, 'path'); bRm.setAttribute('class', 'b-road-min');
  els.metroBaseRoads.append(bRM, bRm);
  /* screen-constant hairlines: widths are in screen px, the geometry scales */
  for (const [p, w] of [[bWS, 1.2], [bRM, 1.5], [bRm, 0.9]]) {
    p.setAttribute('vector-effect', 'non-scaling-stroke');
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
  for (const [g] of groups) els.metroStations.appendChild(g);
  SCENE[sysId] = { groups, byId, upx: null, sel: null };
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
   visibility is recomputed in screen space on every baked frame — transfers
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
    tx.style.display = on ? '' : 'none';
  }
}

function draw() {
  const v = view[sys];
  const g = vGeom();

  /* Google-Maps-style gesture compositing: while a gesture is live we never
     touch the geometry — one CSS transform on #metroWorld moves the already
     painted vector buffer (compositor work only). When the gesture settles
     we re-bake the viewBox for a razor-sharp frame. */
  if (interacting && baked && baked.sys === sys) {
    const g0 = vGeomFor(baked.k);
    const x00 = baked.cx - g0.w / 2, y00 = baked.cy - g0.h / 2;
    const x01 = v.cx - g.w / 2, y01 = v.cy - g.h / 2;
    const a = g0.s / g.s;
    const tx = x01 + (g0.ox - x00 * g0.s - g.ox) / g.s;
    const ty = y01 + (g0.oy - y00 * g0.s - g.oy) / g.s;
    worldG.style.transform = `matrix(${a.toFixed(5)},0,0,${a.toFixed(5)},${tx.toFixed(2)},${ty.toFixed(2)})`;
  } else {
    baked = { cx: v.cx, cy: v.cy, k: v.k, sys };
    worldG.style.transform = '';
    els.metroSvg.setAttribute('viewBox', `${v.cx - g.w / 2} ${v.cy - g.h / 2} ${g.w} ${g.h}`);
    const upx = 1 / g.s;
    /* street basemap: stream + cull to the viewport */
    ensureBase(sys);
    updateBasePaths();
    bRm.style.display = v.k >= 2 ? '' : 'none';
    const sc = buildScene(sys);
    /* counter-scale markers/labels only when the zoom actually changed */
    if (sc.upx !== upx) {
      sc.upx = upx;
      for (const [grp, s] of sc.groups) {
        grp.setAttribute('transform', `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) scale(${upx.toFixed(4)})`);
      }
    }
    cullLabels(sc, v, g);
  }
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
let interacting = false, baked = null, settleT = 0, worldG = null;
function initWorld() {
  worldG = document.createElementNS(NS, 'g');
  worldG.id = 'metroWorld';
  for (const el of [els.metroBaseWater, els.metroBaseRoads, els.metroLines, els.metroStations, els.metroLabels, els.metroRoute]) worldG.appendChild(el);
  els.metroSvg.appendChild(worldG);
  worldG.style.willChange = 'transform';
}
function beginGesture() { interacting = true; clearTimeout(settleT); }
function pokeSettle(ms = 140) {
  clearTimeout(settleT);
  settleT = setTimeout(() => { interacting = false; draw(); }, ms);
}
addEventListener('resize', () => { interacting = false; clearTimeout(settleT); requestDraw(); });

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
  v.k = Math.min(12, Math.max(0.7, nk));
  v.cx = Math.min(VB.w, Math.max(0, nx));
  v.cy = Math.min(VB.h, Math.max(0, ny));
  requestDraw();
}

/* zoom so the current system's stations fill the frame */
function fitContent() {
  cancelFling();
  interacting = false;
  clearTimeout(settleT);
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

/* ---- Google-Maps-style gestures: drag w/ fling, anchored wheel & pinch ---- */
let drag = null, moved = 0;
const pointers = new Map();
let flingRaf = 0;
function cancelFling() { if (flingRaf) { cancelAnimationFrame(flingRaf); flingRaf = 0; } }

els.metroSvg.addEventListener('pointerdown', (e) => {
  cancelFling();
  beginGesture();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { els.metroSvg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
  if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY, t: performance.now(), vx: 0, vy: 0 }; moved = 0; pinched = false; }
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
  const now = performance.now();
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  moved += Math.abs(dx) + Math.abs(dy);
  const dts = Math.max(1, now - drag.t);
  drag.vx = 0.8 * drag.vx + 0.2 * (dx / dts);
  drag.vy = 0.8 * drag.vy + 0.2 * (dy / dts);
  drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
  if (moved < 4) return;
  const { v, s } = vGeom();
  setView(v.cx - dx / s, v.cy - dy / s, v.k);
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size) return;
  const d = drag; drag = null;
  if (d && moved > 6) {
    /* fling: momentum with exponential decay, cancelled by any new gesture */
    let vx = d.vx, vy = d.vy;
    if (Math.hypot(vx, vy) > 0.05) {
      let last = performance.now();
      const step = (now) => {
        const dt = Math.min(48, now - last); last = now;
        const { v, s } = vGeom();
        setView(v.cx - vx * dt / s, v.cy - vy * dt / s, v.k);
        const dec = Math.pow(0.94, dt / 16.7);
        vx *= dec; vy *= dec;
        flingRaf = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
        if (!flingRaf) pokeSettle(60);
      };
      flingRaf = requestAnimationFrame(step);
      return;
    }
  }
  if (pinched || moved > 6) { pinched = false; pokeSettle(80); return; }
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
  cancelFling();
  beginGesture();
  const v = view[sys];
  const [X, Y] = worldAt(e.clientX, e.clientY, vGeom(), v);
  zoomAnchor(X, Y, e.clientX, e.clientY, v.k * (e.deltaY < 0 ? 1.25 : 0.8));
  pokeSettle(160);
}, { passive: false });
els.metroSvg.addEventListener('dblclick', (e) => {
  e.preventDefault();
  cancelFling();
  beginGesture();
  const v = view[sys];
  const [X, Y] = worldAt(e.clientX, e.clientY, vGeom(), v);
  const k0 = v.k, k1 = Math.min(12, k0 * 2), t0 = performance.now();
  const step = (now) => {
    const u = Math.min(1, (now - t0) / 220);
    const ease = 1 - (1 - u) * (1 - u);
    zoomAnchor(X, Y, e.clientX, e.clientY, k0 + (k1 - k0) * ease);
    if (u < 1) requestAnimationFrame(step);
    else pokeSettle(60);
  };
  requestAnimationFrame(step);
});
els.metroIn.addEventListener('click', () => { interacting = false; clearTimeout(settleT); const v = view[sys]; setView(v.cx, v.cy, v.k * 1.4); });
els.metroOut.addEventListener('click', () => { interacting = false; clearTimeout(settleT); const v = view[sys]; setView(v.cx, v.cy, v.k / 1.4); });
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
  zoomBy(f) { const v = view[sys]; beginGesture(); setView(v.cx, v.cy, v.k * f); requestDraw(); pokeSettle(80); return view[sys].k; },
  resetView() { fitContent(); return true; },
};
