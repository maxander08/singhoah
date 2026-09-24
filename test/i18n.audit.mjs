/* i18n audit: for every language × every page, flag UI chrome that is still
   English (hardcoded or fallback). Proper nouns (cities, currency codes,
   language names, brands) are exempt. */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:4173/';
const PAGES = ['index.html', 'wallet.html', 'launch.html', 'settings.html', 'scribe.html'];
const browser = await chromium.launch();

/* pull STRINGS/LANGS straight from the served module so the audit tests
   exactly what ships */
const probe = await browser.newContext();
const pp = await probe.newPage();
await pp.goto(URL + 'index.html', { waitUntil: 'load' });
const LIB = await pp.evaluate(() => import('./app.js').then((m) => ({
  keys: Object.keys(m.STRINGS),
  tables: m.STRINGS,
  langs: m.LANGS.map((l) => l.id),
})));
await probe.close();

/* ---- 0. key completeness across languages ---- */
let fails = 0;
const enKeys = Object.keys(LIB.tables.en);
for (const id of LIB.langs) {
  const missing = enKeys.filter((k) => !(k in LIB.tables[id]));
  const extra = Object.keys(LIB.tables[id]).filter((k) => !(k in LIB.tables.en));
  if (missing.length || extra.length) {
    fails++;
    console.log(`KEYS ${id}: missing=${missing.join(',') || '-'} extra=${extra.join(',') || '-'}`);
  }
}

/* en values whose translation differs per language (fallback detectors) */
const enValKeys = {};
for (const [k, v] of Object.entries(LIB.tables.en)) (enValKeys[v] ||= []).push(k);

const LATIN = new Set(['en', 'es', 'fr', 'pt']);
const ALLOW = /Singhoah|SinghoWallet|SinghoLaunch|SinghoSettings|SinghoScribe|Google|Language|Scribe\b|IP|MAC|UTC|BTC|ETH|[A-Z]{2,4}/g;

for (const id of LIB.langs) {
  if (id === 'en') continue;
  const langVals = new Set(Object.values(LIB.tables[id]).map((v) => v.trim()));
  const fallbackSet = new Set();
  for (const [v, ks] of Object.entries(enValKeys)) {
    if (v.trim().length < 4) continue;
    /* a string that is itself a legitimate translation in this language
       (e.g. pt date = 'Data' == en data = 'Data') is not a fallback */
    if (langVals.has(v.trim())) continue;
    if (ks.some((k) => LIB.tables[id][k] !== undefined && LIB.tables[id][k] !== v)) fallbackSet.add(v.trim());
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(([lang]) => {
    localStorage.setItem('singhoah:lang', lang);
    localStorage.setItem('singhoah:visited', '1');
  }, [id]);
  for (const page of PAGES) {
    const p = await ctx.newPage();
    await p.goto(URL + page, { waitUntil: 'load' });
    await p.waitForTimeout(450);
    const found = await p.evaluate(() => {
      const SKIP = '.tz-list, .cur-row, #walDaysBox, #scrDoc, .lp-clock, .lp-clock-zone, .wordmark, .wordmark-zh, .flag, select, .wal-note, .map-tip, #lpZone, .tz-city, .tz-off, .tz-group, #tzLabel, #ipLoc';
      const out = [];
      const vis = (el) => !!(el.offsetParent || el.getClientRects().length);
      const push = (s, src) => { const v = (s || '').trim(); if (v) out.push([v, src]); };
      document.querySelectorAll('button, a, label, h1, h2, p, span, strong, input, select').forEach((el) => {
        if (el.closest(SKIP)) return;
        if (!vis(el)) return;
        if (!el.children.length) push(el.textContent, el.id || el.className);
        for (const a of ['title', 'aria-label', 'placeholder']) push(el.getAttribute(a), `${el.id || el.tagName}.${a}`);
      });
      return out;
    });
    for (const [s, src] of found) {
      let bad = null;
      if (fallbackSet.has(s)) bad = 'en-fallback';
      else if (!LATIN.has(id)) {
        const stripped = s.replace(ALLOW, '');
        if (/[A-Za-z]{3,}/.test(stripped)) bad = 'latin-leak';
      }
      if (bad) { fails++; console.log(`LEAK [${id}] ${page} ${bad} @${src}: "${s}"`); }
    }
    await p.close();
  }
  await ctx.close();
}

await browser.close();
console.log(fails === 0 ? 'i18n audit: no untranslated chrome in any of the 10 languages' : `i18n audit: ${fails} problem(s)`);
process.exit(fails === 0 ? 0 : 1);
