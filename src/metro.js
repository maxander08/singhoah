/* ============================================================
   SinghoMetro — tap a station, tap another, get the fare.
   Taipei Metro (distance bands published by TRTC) and the
   Taoyuan Airport MRT (published station-pair table).
   Interactive SVG map: coloured lines, bilingual labels
   (English over the original script), pan / zoom / pinch.
   ============================================================ */
import { METRO } from './metrodata.js';
import { MAJ, MIN, WATF, WATS, BASEMAP } from './metrobase.js';
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
function vGeom() {
  const v = view[sys];
  const rect = els.metroSvg.getBoundingClientRect();
  /* the viewBox follows the container's aspect so portrait phones use the
     whole screen instead of a letterboxed strip */
  const aspect = Math.max(0.6, Math.min(2.6, rect.height / Math.max(1, rect.width)));
  const w = VB.w / v.k, h = w * aspect;
  const s = Math.min(rect.width / w, rect.height / h) || 1; /* meet scale */
  return { v, w, h, rect, s, ox: (rect.width - w * s) / 2, oy: (rect.height - h * s) / 2 };
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

/* ---- street-level basemap (roads / rivers / water, © OpenStreetMap) ---- */
function baseD(sysId, arr, close) {
  const P = PROJ[sysId];
  let d = '';
  for (const a of arr) {
    let la = a[0] / 1e4, lo = a[1] / 1e4;
    let inside = false, seg = '';
    const put = () => {
      const ex = (lo - P.lo0) * P.cf * P.sc, ey = (P.la1 - la) * 110.57 * P.sc;
      const x = PORTRAIT ? P.ox + ey : P.ox + ex;
      const y = PORTRAIT ? P.oy + ex : P.oy + ey;
      if (x > -200 && x < 1200 && y > -200 && y < 1000) inside = true;
      seg += (seg ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    };
    put();
    for (let i = 2; i < a.length; i += 2) { la += a[i] / 1e4; lo += a[i + 1] / 1e4; put(); }
    if (inside) d += seg + (close ? 'Z' : '');
  }
  return d;
}
const BASED = {};
for (const sysId of SYSS) {
  const bm = (typeof BASEMAP === 'object' && BASEMAP && BASEMAP[sysId]) || null;
  BASED[sysId] = {
    watf: baseD(sysId, bm ? bm.watf : WATF, true), wats: baseD(sysId, bm ? bm.wats : WATS, false),
    maj: baseD(sysId, bm ? bm.maj : MAJ, false), min: baseD(sysId, bm ? bm.min : MIN, false),
  };
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
let bWF, bWS, bRM, bRm, baseSys = null;
function initBase() {
  bWF = document.createElementNS(NS, 'path'); bWF.setAttribute('class', 'b-water-f');
  bWS = document.createElementNS(NS, 'path'); bWS.setAttribute('class', 'b-water-s');
  els.metroBaseWater.append(bWF, bWS);
  bRM = document.createElementNS(NS, 'path'); bRM.setAttribute('class', 'b-road-maj');
  bRm = document.createElementNS(NS, 'path'); bRm.setAttribute('class', 'b-road-min');
  els.metroBaseRoads.append(bRM, bRm);
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

/* ---------------- drawing ---------------- */

function draw() {
  const v = view[sys];
  const g = vGeom();
  els.metroSvg.setAttribute('viewBox', `${v.cx - g.w / 2} ${v.cy - g.h / 2} ${g.w} ${g.h}`);
  const upx = 1 / g.s;

  /* street basemap */
  if (baseSys !== sys) {
    baseSys = sys;
    bWF.setAttribute('d', BASED[sys].watf || 'M0 0');
    bWS.setAttribute('d', BASED[sys].wats || 'M0 0');
    bRM.setAttribute('d', BASED[sys].maj || 'M0 0');
    bRm.setAttribute('d', BASED[sys].min || 'M0 0');
  }
  bWS.setAttribute('stroke-width', (1.2 * upx).toFixed(2));
  bRM.setAttribute('stroke-width', (1.5 * upx).toFixed(2));
  bRm.style.display = v.k >= 2 ? '' : 'none';
  bRm.setAttribute('stroke-width', (0.9 * upx).toFixed(2));

  /* lines — real track curves where OSM has them */
  els.metroLines.textContent = '';
  for (const [s, lid, color, refs] of METRO.lines) {
    if (s !== sys) continue;
    const p = document.createElementNS(NS, 'path');
    const tk = TRKD[sys][lid];
    p.setAttribute('d', tk ? tk.d : refs.map((r, i) => `${i ? 'L' : 'M'}${ST[r].x.toFixed(1)} ${ST[r].y.toFixed(1)}`).join(''));
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', (3.2 * upx).toFixed(2));
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('class', 'metro-line');
    els.metroLines.appendChild(p);
  }

  /* route highlight */
  els.metroRoute.textContent = '';
  const r = from && to ? route(from, to) : null;
  if (r) {
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
      p.setAttribute('stroke-width', (6 * upx).toFixed(2));
      p.setAttribute('opacity', '0.45');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
      els.metroRoute.appendChild(p);
    }
  }

  /* stations */
  els.metroStations.textContent = '';
  for (const s of Object.values(ST)) {
    if (s.sys !== sys) continue;
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', s.x); c.setAttribute('cy', s.y);
    c.setAttribute('r', ((s.xf ? 4.2 : 3) * upx).toFixed(2));
    c.setAttribute('class', `metro-st${s.id === from ? ' from' : s.id === to ? ' to' : ''}`);
    c.dataset.st = s.id;
    els.metroStations.appendChild(c);
  }

  /* labels: English over the original script, collision-culled */
  els.metroLabels.textContent = '';
  const base = 11 * upx;
  const cands = Object.values(ST).filter((s) => s.sys === sys)
    .sort((a, b) => (b.xf - a.xf) || a.id.localeCompare(b.id));
  const placed = [];
  for (const s of cands) {
    if (placed.length >= 80) break;
    const wEst = Math.max(s.en.length, s.zh.length) * base * 0.62 + base;
    const hEst = base * 2.6;
    /* keep the whole label inside the 0..1000 frame (edge stations) */
    const lx = Math.min(VB.w - wEst / 2 - 4, Math.max(wEst / 2 + 4, s.x));
    const rx = lx - wEst / 2, ry = s.y + base * 0.5;
    let hit = false;
    for (const q of placed) if (rx < q.x + q.w && rx + wEst > q.x && ry < q.y + q.h && ry + hEst > q.y) { hit = true; break; }
    if (hit) continue;
    placed.push({ x: rx, y: ry, w: wEst, h: hEst });
    const tx = document.createElementNS(NS, 'text');
    tx.setAttribute('x', lx); tx.setAttribute('y', s.y);
    tx.setAttribute('text-anchor', 'middle');
    tx.setAttribute('class', 'metro-label');
    tx.style.fontSize = `${base.toFixed(2)}px`;
    const t1 = document.createElementNS(NS, 'tspan');
    t1.setAttribute('x', lx); t1.setAttribute('dy', (base * 1.5).toFixed(2));
    t1.textContent = s.en;
    const t2 = document.createElementNS(NS, 'tspan');
    t2.setAttribute('x', lx); t2.setAttribute('dy', (base * 0.95).toFixed(2));
    t2.setAttribute('class', 'metro-label-zh');
    t2.textContent = s.zh;
    tx.append(t1, t2);
    els.metroLabels.appendChild(tx);
  }
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
  draw();
}

/* zoom so the current system's stations fill the frame */
function fitContent() {
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

let drag = null, moved = 0;
els.metroSvg.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  moved = 0;
  els.metroSvg.setPointerCapture(e.pointerId);
});
els.metroSvg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  moved += Math.abs(dx) + Math.abs(dy);
  drag = { x: e.clientX, y: e.clientY };
  if (moved < 4) return;
  const { v, s } = vGeom();
  setView(v.cx - dx / s, v.cy - dy / s, v.k);
});
els.metroSvg.addEventListener('pointerup', (e) => {
  drag = null;
  if (moved > 6) return;
  /* a tap: nearest station within 16px */
  const { v, w, h, rect, s, ox, oy } = vGeom();
  const px = (e.clientX - rect.left - ox) / s + (v.cx - w / 2);
  const py = (e.clientY - rect.top - oy) / s + (v.cy - h / 2);
  let best = null, bd = 16 / s;
  for (const s of Object.values(ST)) {
    if (s.sys !== sys) continue;
    const d = Math.hypot(s.x - px, s.y - py);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) return;
  if (!from || (from && to)) { from = best.id; to = null; }
  else if (best.id !== from) to = best.id;
  renderBar(); draw();
});
els.metroSvg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const v = view[sys];
  setView(v.cx, v.cy, v.k * (e.deltaY < 0 ? 1.25 : 0.8));
}, { passive: false });
els.metroIn.addEventListener('click', () => { const v = view[sys]; setView(v.cx, v.cy, v.k * 1.4); });
els.metroOut.addEventListener('click', () => { const v = view[sys]; setView(v.cx, v.cy, v.k / 1.4); });
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
applyLang(lang, false);
fitContent();

globalThis.__METRO = { route, fare, ST, get sys() { return sys; } };
