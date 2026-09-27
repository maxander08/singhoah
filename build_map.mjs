/* Generates src/mapdata.js: a high-detail (Natural Earth 10m, public domain)
   world map as per-country SVG path data, a 15° graticule, and a settlement
   layer (cities, towns and villages) with names in every app language plus
   each settlement's native script.
   Run: node build_map.mjs  (needs /tmp/countries-10m.json from world-atlas@2
   and /tmp/ne_pop/ne_10m_populated_places.{shp,dbf} from naturalearthdata.com) */
import fs from 'node:fs';
import { geoNaturalEarth1, geoPath, geoArea } from 'd3-geo';
import * as topojson from 'topojson-client';
import { all as isoAll } from 'iso-3166-1';
import * as shapefile from 'shapefile';

const topo = JSON.parse(fs.readFileSync('/tmp/countries-10m.json', 'utf8'));
const feats = topojson.feature(topo, topo.objects.countries).features;

const num2cc = new Map();
for (const e of isoAll()) {
  if (e.numeric) num2cc.set(String(Number(e.numeric)), e.alpha2);
}
// Natural Earth pseudo-ids we still want clickable
const NAME_CC = {
  Kosovo: 'RS',        // served by Europe/Belgrade
  'N. Cyprus': 'CY',
  Somaliland: 'SO',
};

/* cc -> zones, in the same order build_flags.py uses (population-ish first) */
const ccZones = new Map();
const addZone = (cc, z) => {
  if (!cc || !z) return;
  if (!ccZones.has(cc)) ccZones.set(cc, []);
  const l = ccZones.get(cc);
  if (!l.includes(z)) l.push(z);
};
for (const line of fs.readFileSync('zone1970.tab', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [ccs, , zone] = line.split('\t');
  for (const cc of ccs.split(',')) addZone(cc, zone);
}
for (const line of fs.readFileSync('zone.tab', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [cc, , zone] = line.split('\t');
  addZone(cc, zone);
}
const links = [];
for (const line of fs.readFileSync('backward', 'utf8').split('\n')) {
  const m = line.match(/^Link\s+(\S+) (\S+)/);
  if (m) links.push([m[2], m[1]]); // alias -> target
}
for (const [alias, target] of links) {
  for (const [cc, zs] of ccZones) if (zs.includes(target)) addZone(cc, alias);
}

const W = 960, H = 500;
const proj = geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
const pathGen = geoPath(proj);

/* tenth-pixel quantisation: at the map's 16x max zoom a step is still well
   under a screen pixel, so borders stay smooth all the way in */
const q = (d) => d.replace(/-?\d+\.?\d*/g, (s) => {
  const v = Math.round(parseFloat(s) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
});

/* world-atlas 10m ships a few reversed outer rings (the Maldives among
   them); projected naively they draw the complement of the whole sphere
   and swallow the map. Re-wind any outer ring that covers more than half
   the globe — no real country comes close. */
function fixWinding(geom) {
  if (!geom) return geom;
  const half = 2 * Math.PI;
  const poly = (rings) => rings.map((ring, i) => {
    if (i === 0 && geoArea({ type: 'Polygon', coordinates: [ring] }) > half) {
      return ring.slice().reverse();
    }
    return ring;
  });
  if (geom.type === 'Polygon') return { ...geom, coordinates: poly(geom.coordinates) };
  if (geom.type === 'MultiPolygon') return { ...geom, coordinates: geom.coordinates.map(poly) };
  if (geom.type === 'GeometryCollection') return { ...geom, geometries: geom.geometries.map((g) => fixWinding(g)) };
  return geom;
}

const cc = {};
let skipped = 0;
for (const f of feats) {
  const a2 = num2cc.get(String(Number(f.id))) || NAME_CC[f.properties?.name];
  if (!a2) { skipped++; continue; }
  const d = pathGen(fixWinding(f.geometry));
  if (!d) continue;
  cc[a2] = cc[a2] ? cc[a2] + d : d;
}
for (const k of Object.keys(cc)) {
  let d = q(cc[k]);
  /* collapse runs of duplicate points left by quantised micro-islands */
  let prev = '';
  d = d.replace(/[ML](-?\d+\.?\d*),(-?\d+\.?\d*)/g, (m, x, y) => {
    const key = `${x},${y}`;
    if (key === prev) return '';
    prev = key;
    return m;
  });
  cc[k] = d;
}

/* 15° meridians — the ideal timezone boundaries — as one hairline path */
const mer = [];
for (let lon = -180; lon <= 180; lon += 15) {
  const pts = [];
  for (let lat = -85; lat <= 85; lat += 5) {
    const p = proj([lon, lat]);
    if (p) pts.push(p);
  }
  mer.push(pts.map((p, i) => `${i ? 'L' : 'M'}${q(String(p[0]))},${q(String(p[1]))}`).join(''));
}
const grat = mer.join('');

/* ---------- settlements: cities, towns and villages (Google-style layer) ----
   Row = [x, y, name_en, popK, native?, translations?, capital?]; trailing
   empties are dropped. translations carry only names that differ from the
   English one, keyed by app language. */
const NATIVE_COL = {
  TW: 'NAME_ZHT', HK: 'NAME_ZHT', MO: 'NAME_ZHT', CN: 'NAME_ZH', SG: 'NAME_ZH',
  JP: 'NAME_JA', KR: 'NAME_KO', RU: 'NAME_RU', BY: 'NAME_RU', KZ: 'NAME_RU',
  KG: 'NAME_RU', UA: 'NAME_UK', GR: 'NAME_EL', CY: 'NAME_EL', IL: 'NAME_HE',
  IR: 'NAME_FA', AF: 'NAME_FA', TJ: 'NAME_FA',
  IN: 'NAME_HI', NP: 'NAME_HI', BD: 'NAME_BN', PK: 'NAME_UR',
  SA: 'NAME_AR', AE: 'NAME_AR', QA: 'NAME_AR', KW: 'NAME_AR', BH: 'NAME_AR',
  OM: 'NAME_AR', YE: 'NAME_AR', JO: 'NAME_AR', LB: 'NAME_AR', SY: 'NAME_AR',
  IQ: 'NAME_AR', EG: 'NAME_AR', LY: 'NAME_AR', TN: 'NAME_AR', DZ: 'NAME_AR',
  MA: 'NAME_AR', MR: 'NAME_AR', PS: 'NAME_AR', SD: 'NAME_AR', SO: 'NAME_AR',
  DJ: 'NAME_AR', KM: 'NAME_AR', EH: 'NAME_AR',
};
const TR_COLS = {
  zht: 'NAME_ZHT', hi: 'NAME_HI', es: 'NAME_ES', fr: 'NAME_FR', ar: 'NAME_AR',
  bn: 'NAME_BN', ru: 'NAME_RU', pt: 'NAME_PT', ur: 'NAME_UR',
};
const clean = (v) => (typeof v === 'string' ? v.trim() : '') || '';

const src = await shapefile.open(
  '/tmp/ne_pop/ne_10m_populated_places.shp',
  '/tmp/ne_pop/ne_10m_populated_places.dbf',
  { encoding: 'utf-8' },
);
const cities = [];
const seen = new Set();
let citySkipped = 0;
while (true) {
  const r = await src.read();
  if (r.done) break;
  const p = r.value.properties;
  const name = clean(p.NAME_EN) || clean(p.NAME);
  if (!name || p.ADM0NAME === 'Antarctica') { citySkipped++; continue; }
  const pt = proj([p.LONGITUDE, p.LATITUDE]);
  if (!pt) { citySkipped++; continue; }
  const x = Math.round(pt[0] * 10) / 10, y = Math.round(pt[1] * 10) / 10;
  const key = `${name}|${Math.round(x)}|${Math.round(y)}`;
  if (seen.has(key)) { citySkipped++; continue; }
  seen.add(key);
  const popK = Math.max(1, Math.round((p.POP_MAX || 0) / 1000));
  const a2 = clean(p.ISO_A2) || clean(p.ADM0_A3);
  let native = NATIVE_COL[a2] ? clean(p[NATIVE_COL[a2]]) : '';
  if (native === name) native = '';
  const t = {};
  let any = false;
  for (const [k, col] of Object.entries(TR_COLS)) {
    const v = clean(p[col]);
    if (v && v !== name && v !== native) { t[k] = v; any = true; }
  }
  const row = [x, y, name, popK];
  if (native) row.push(native); else if (any || p.ADM0CAP) row.push(null);
  if (any) row.push(t); else if (p.ADM0CAP) row.push(null);
  if (p.ADM0CAP) row.push(1);
  cities.push(row);
}

const out = `/* generated by build_map.mjs — Natural Earth 10m (public domain) */
globalThis.__SINGHOAH_MAP = ${JSON.stringify({ v: 10, w: W, h: H, grat, cc, cities })};
`;
fs.writeFileSync('src/mapdata.js', out);
console.log(`mapdata.js ${(out.length / 1024).toFixed(0)} KB · ${Object.keys(cc).length} countries · ${cities.length} settlements · skipped ${skipped}/${citySkipped}`);
