/* ============================================================
   SinghoMetro fare engine — shared by the metro page and by
   SMate on every other page. Pure data + math: stations from
   metrodata.js, Dijkstra over the line graph, published fare
   tables (TRTC distance bands, TY pair table, KS/TC bands).
   ============================================================ */
import { METRO } from './metrodata.js';

/* stations: id -> {id,en,zh,lat,lon,sys,x,y,xf:boolean} */
export const ST = {};
for (const [id, en, zh, lat, lon, sys] of METRO.st) ST[id] = { id, en, zh, lat, lon, sys, x: 0, y: 0, xf: false };
for (const [a, b] of METRO.xf) { if (ST[a]) ST[a].xf = true; if (ST[b]) ST[b].xf = true; }

const RAD = Math.PI / 180;
export function hav(a, b) {
  const dLa = (b[0] - a[0]) * RAD, dLo = (b[1] - a[1]) * RAD;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
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
export function route(a, b) {
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

export function fare(sys, a, b, r) {
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
export { METRO };
