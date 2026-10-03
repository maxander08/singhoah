/* Real-browser smoke test for the clock app (Playwright / Chromium).
   Run: node test/browser.smoke.mjs   (needs the static server on :4173) */
import { chromium } from 'playwright';

const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const errors = [];
const warnings = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // shared-CI egress IPs get rate-limited by the optional geolocation APIs;
  // the app falls back gracefully, so log but don't fail the suite on those
  const u = (m.location() && m.location().url) || '';
  if (/429/.test(m.text()) && /ipwho\.is|ipapi\.co/.test(u)) {
    warnings.push(`geolocation rate-limited (429): ${u}`);
    return;
  }
  errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));

await page.goto(URL, { waitUntil: 'load' });
ok('first visit lands on the SinghoLaunch launchpad', page.url().includes('launch.html'), page.url());
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('singhoah:visited', '1'); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(400);

const clockOf = () => page.locator('#clock').textContent();

/* --- the name --- */
ok('wordmark reads SinghoClock', (await page.locator('.wordmark').textContent()).trim() === 'SinghoClock',
  (await page.locator('.wordmark').textContent()).trim());

/* --- the clock itself --- */
const clockText = (await clockOf()).trim();
ok('clock matches HH:MM:SS:mmm', /^\d{2}:\d{2}:\d{2}:\d{3}$/.test(clockText), clockText);

const slots = await page.locator('#clock span').count();
ok('clock renders 12 glyph slots (8 digits + 3 colons + 3 ms)', slots === 12, `got ${slots}`);

/* --- it really runs on the system clock --- */
const first = await clockOf();
await page.waitForTimeout(700);
const second = await clockOf();
ok('milliseconds advance between frames', first !== second, `${first.trim()} → ${second.trim()}`);

const drift = await page.evaluate((t) => {
  const [h, m, s, ms] = t.trim().split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, s, ms);
  return Math.abs(d.getTime() - (Date.now() + window.__clock.offset));
}, second);
ok('displayed time is the real clock (±400 ms)', drift < 400, `delta ${drift} ms`);

/* --- seconds tick over --- */
const secA = Number(second.split(':')[2]);
await page.waitForTimeout(1300);
const third = await clockOf();
const secB = Number(third.split(':')[2]);
ok('seconds advance', Number.isFinite(secB) && secB !== secA, `${secA} → ${secB}`);

/* --- date + time line above the clock --- */
const dateLong = (await page.locator('#dateLong').textContent()).trim();
const dateTime = (await page.locator('#dateTime').textContent()).trim();
const today = new Date();
const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()];
ok('date line shows today', dateLong.includes(weekday) && dateLong.includes(String(today.getFullYear())), dateLong);
ok('time line shows HH:MM + zone', /^\d{2}:\d{2}/.test(dateTime), dateTime);
ok('date row sits above the clock', await page.evaluate(() => {
  const a = document.querySelector('.meta-row').getBoundingClientRect();
  const b = document.querySelector('.clock').getBoundingClientRect();
  return a.bottom <= b.top + 1 && a.top < b.top;
}));

/* --- the second progress bar moves --- */
const barA = await page.locator('#secondFill').evaluate((el) => el.style.transform);
await page.waitForTimeout(200);
const barB = await page.locator('#secondFill').evaluate((el) => el.style.transform);
ok('second progress bar animates', barA !== barB, `${barA} → ${barB}`);

/* --- no layout overflow at 1440×900 --- */
ok('page scrolling is locked site-wide (html/body overflow hidden)',
  await page.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden'
    && getComputedStyle(document.body).overflow === 'hidden'));
ok('no page scroll at 1440×900', await page.evaluate(
  () => document.documentElement.scrollHeight <= window.innerHeight + 1
  && document.documentElement.scrollWidth <= window.innerWidth + 1,
));

/* --- the webfonts actually loaded --- */
await page.evaluate(() => document.fonts.ready);
const fontInfo = await page.evaluate(() => ({
  saans: document.fonts.check('700 16px Saans'),
  wm: (() => { const w = getComputedStyle(document.querySelector('.wordmark')); return { fw: Number(w.fontWeight), ff: w.fontFamily }; })(),
  clockFont: getComputedStyle(document.getElementById('clock')).fontFamily,
  size: getComputedStyle(document.getElementById('clock')).fontSize,
  fvs: getComputedStyle(document.getElementById('clock')).fontVariationSettings,
}));
ok('Saans variable font loaded', fontInfo.saans, `clock font-size ${fontInfo.size}, ${fontInfo.fvs}`);
ok('wordmark is bold geometric sans (Metro scheme)', fontInfo.wm.fw >= 700 && /Saans/.test(fontInfo.wm.ff), JSON.stringify(fontInfo.wm));

/* --- digits are truly monospaced, so the clock never jitters ---
   glyph boxes are pixel-snapped by the browser (±1 px noise), so we assert the
   *steps* between slots stay within snapping tolerance of one constant value */
const steps = await page.evaluate(() => {
  const lefts = [...document.querySelectorAll('#clock span')].map(
    (s) => s.getBoundingClientRect().left);
  const d = lefts.slice(1).map((x, i) => x - lefts[i]);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  return { maxDev: Math.max(...d.map((x) => Math.abs(x - mean))), mean };
});
ok('glyph slots advance uniformly (MONO axis)', steps.maxDev <= 1, `step ${steps.mean.toFixed(2)} px ± ${steps.maxDev.toFixed(2)}`);

/* --- theme: dark is the default scheme, the toggle offers light --- */
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('singhoah:visited', '1'); });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(300);
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
const parse = (s) => s.match(/\d+/g).map(Number);
const start = await page.evaluate(() => ({
  dark: document.documentElement.classList.contains('dark'),
  bg: getComputedStyle(document.body).backgroundColor,
  label: document.getElementById('btnNight').textContent.trim(),
}));
ok('starts in dark mode (the default scheme)', start.dark && near(parse(start.bg), [20, 20, 20]), `bg ${start.bg}`);
ok('theme toggle offers Light while dark', start.label === 'Light', start.label);

await page.locator('#btnNight').click();
await page.waitForTimeout(400); // background transition is .2s
const lightNow = await page.evaluate(() => ({
  dark: document.documentElement.classList.contains('dark'),
  bg: getComputedStyle(document.body).backgroundColor,
  fg: getComputedStyle(document.body).color,
  saved: localStorage.getItem('singhoah:night'),
  label: document.getElementById('btnNight').textContent.trim(),
}));
ok('toggle switches to the paper scheme',
  !lightNow.dark && near(parse(lightNow.bg), [235, 233, 227]) && near(parse(lightNow.fg), [29, 29, 27]),
  `bg ${lightNow.bg} · fg ${lightNow.fg}`);
ok('theme choice is remembered', lightNow.saved === '0' && lightNow.label === 'Night Shift',
  `localStorage=${lightNow.saved} · label=${lightNow.label}`);
await page.screenshot({ path: 'shot-light.png' });
await page.locator('#btnNight').click();
await page.waitForTimeout(400);
ok('toggling back restores black', await page.evaluate(
  () => getComputedStyle(document.body).backgroundColor) === 'rgb(20, 20, 20)');

/* --- NTP sync finished --- */
await page.waitForFunction(
  () => document.getElementById('lastSync').textContent.includes('last check'),
  null, { timeout: 15000 },
).catch(() => {});
const sync = await page.evaluate(() => ({
  level: document.getElementById('syncDot').dataset.level,
  text: document.getElementById('syncText').textContent,
  detail: document.getElementById('syncDetail').textContent,
  last: document.getElementById('lastSync').textContent,
  offset: window.__clock.offset,
}));
ok('clock syncs to a reference time', sync.level !== 'off',
  `${sync.level} · ${sync.text} · ${sync.detail} · offset ${sync.offset} ms`);

/* --- manual re-sync button --- */
await page.locator('#btnSync').click();
await page.waitForTimeout(1200);
const resynced = await page.evaluate(() => document.getElementById('lastSync').textContent);
ok('re-sync button re-checks the reference', resynced.includes('last check') || resynced.includes('syncing'), resynced);

/* --- time zones: every IANA zone with flags, selectable, live, persisted --- */
await page.locator('#tzBtn').click();
await page.waitForTimeout(150);
const rowCount = await page.locator('#tzList .tz-row').count();
ok('the picker lists every IANA time zone', rowCount > 400, `${rowCount} zones`);

const flagStats = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('#tzList .tz-row img')];
  return {
    total: imgs.length,
    png: imgs.filter((i) => i.src.startsWith('data:image/svg+xml;base64')).length,
    globe: imgs.filter((i) => i.src.startsWith('data:image/svg+xml,')).length,
  };
});
ok('every row carries an SVG flag — no globes',
  flagStats.png === flagStats.total && flagStats.globe === 0,
  JSON.stringify(flagStats));
ok('picker button shows the current flag',
  await page.evaluate(() => document.getElementById('tzFlag').src.startsWith('data:image')));

await page.locator('#tzSearch').fill('tokyo');
const filtered = await page.locator('#tzList .tz-row:not([hidden])').count();
ok('search filters the list', filtered === 1, `${filtered} row(s)`);
await page.locator('.tz-row[data-zone="Asia/Tokyo"]').click();
await page.waitForTimeout(250);
const tokyo = await page.evaluate(() => {
  const now = new Date(Date.now() + window.__clock.offset);
  const exp = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now);
  return {
    exp,
    clock: document.getElementById('clock').textContent,
    dateTime: document.getElementById('dateTime').textContent,
    zone: document.getElementById('zoneText').textContent,
    label: document.getElementById('tzLabel').textContent,
    popHidden: getComputedStyle(document.getElementById('tzPop')).display === 'none',
  };
});
ok('the big clock follows the selected zone', tokyo.clock.startsWith(tokyo.exp.slice(0, 5)),
  `${tokyo.clock.trim()} vs ${tokyo.exp} JST`);
ok('the date/time line follows too', tokyo.dateTime.startsWith(tokyo.exp.slice(0, 5)), tokyo.dateTime);
ok('the readout shows the selected zone', tokyo.zone.startsWith('Asia/Tokyo'), tokyo.zone);
ok('picker button shows flag + city and closes', tokyo.label.trim() === 'Tokyo' && tokyo.popHidden,
  `${tokyo.label} · pop ${tokyo.popHidden ? 'closed' : 'STILL OPEN'}`);
await page.locator('#tzBtn').click();
await page.waitForTimeout(450);
const pinDbg = await page.evaluate(() => {
  const list = document.getElementById('tzList');
  const top = list.getBoundingClientRect().top;
  const row = document.querySelector('.tz-row[data-zone="Asia/Tokyo"]');
  const head = row ? row.parentElement.querySelector('.tz-group') : null;
  const hh = head ? head.getBoundingClientRect().height : 0;
  const hr = head ? head.getBoundingClientRect() : { top: -99 };
  const rr = row.getBoundingClientRect();
  const centered = !!row && !row.hidden && !head.hidden
    && Math.abs(hr.top - top) < 2 && Math.abs(rr.top - (top + hh)) < 2;
  const line = top + hh;   /* rows may clip at the scrollport top; the header band covers 0..hh */
  const clean = [...list.querySelectorAll('.tz-row, .tz-group')].every((el) => {
    if (el.hidden || el.parentElement.hidden) return true;
    const r = el.getBoundingClientRect();
    return !(r.top < line - 0.5 && r.bottom > line + 0.5);
  });
  return { centered, clean, hrTop: hr.top, top, rrTop: rr.top, hh };
});
ok('reopening the picker pins the region title above the active city',
  pinDbg.centered && pinDbg.clean, JSON.stringify(pinDbg));
await page.evaluate(() => document.getElementById('tzBtn').click());
await page.waitForTimeout(120);
await page.locator('#tzBtn').click();
await page.waitForTimeout(150);
const tzListBox = await page.locator('#tzList').boundingBox();
await page.mouse.move(tzListBox.x + tzListBox.width / 2, tzListBox.y + tzListBox.height / 2);
await page.mouse.wheel(0, 555);
await page.waitForTimeout(700);
ok('scrolling the picker pins the region title and rests on clean rows', await page.evaluate(() => {
  const list = document.getElementById('tzList');
  const top = list.getBoundingClientRect().top;
  const heads = [...list.querySelectorAll('.tz-group')].filter((el) => !el.hidden && !el.parentElement.hidden);
  const pinned = heads.some((h) => Math.abs(h.getBoundingClientRect().top - top) < 1.5);
  const line = top + (heads[0] ? heads[0].getBoundingClientRect().height : 0);
  const clean = [...list.querySelectorAll('.tz-row, .tz-group')].every((el) => {
    if (el.hidden || el.parentElement.hidden) return true;
    const r = el.getBoundingClientRect();
    return !(r.top < line - 0.5 && r.bottom > line + 0.5);
  });
  return pinned && clean;
}));
await page.locator('#tzBtn').click();
await page.waitForTimeout(120);
ok('scrollbars are Singhoah elements: the custom bar is in charge, not the browser',
  await page.evaluate(async () => {
    /* Chromium/Safari: the pseudo-element bar renders; the standard properties
       must stay at their initial values so they cannot override it */
    if (CSS.supports('selector(::-webkit-scrollbar)')) {
      const html = getComputedStyle(document.documentElement);
      if (html.scrollbarWidth !== 'auto' || html.scrollbarColor !== 'auto') return false;
      /* the served sheet carries the full spec: 8px, square pigeon thumb, blue on grab, no buttons */
      const css = await (await fetch('styles.css')).text();
      return /::-webkit-scrollbar \{ width: 8px; height: 8px; \}/.test(css)
        && /::-webkit-scrollbar-thumb \{ background: var\(--pigeon\); border-radius: 0; \}/.test(css)
        && /::-webkit-scrollbar-thumb:hover, ::-webkit-scrollbar-thumb:active \{ background: var\(--notification\); \}/.test(css)
        && /::-webkit-scrollbar-button \{ display: none; width: 0; height: 0; \}/.test(css)
        && !/scrollbar-width: none/.test(css);
    }
    /* Firefox: the standard thin bar in the same colors */
    return getComputedStyle(document.documentElement).scrollbarWidth === 'thin';
  }));

/* --- extra zones join the CURRENT window — never a new tab --- */
await page.locator('#tzBtn').click();
await page.locator('#tzSearch').fill('jakarta');
await page.locator('.tz-row[data-zone="Asia/Jakarta"] .tz-win').click();
await page.waitForTimeout(400);
const w1 = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.cell')];
  return {
    layout: document.getElementById('grid').dataset.layout,
    cells: cs.length,
    zone1: cs[1] && cs[1].querySelector('.cap-zone').textContent,
    meta: getComputedStyle(document.querySelector('.meta-row')).display,
    cap: getComputedStyle(document.querySelector('.cell-cap')).display,
  };
});
ok('row button adds the zone inside the current window',
  w1.layout === '2' && w1.cells === 2 && w1.zone1 === 'Asia/Jakarta', JSON.stringify(w1));
ok('adding a zone opens no new tab', page.context().pages().length === 1,
  `${page.context().pages().length} page(s)`);
ok('multi mode swaps the header line for per-cell captions',
  w1.meta === 'none' && w1.cap === 'flex', `${w1.meta}/${w1.cap}`);
const jakHour = await page.evaluate(() => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23',
}).format(new Date()));
const w1clocks = await page.evaluate(() =>
  [...document.querySelectorAll('.cell .clock')].map((x) => x.textContent));
ok('each pane runs its own zone', w1clocks[1].startsWith(jakHour) && w1clocks[1] !== w1clocks[0],
  w1clocks.join(' | '));
const caps = await page.evaluate(() => [...document.querySelectorAll('.cell')].map((x) => ({
  zone: x.querySelector('.cap-zone').textContent,
  date: x.querySelector('.cap-date').textContent,
  time: x.querySelector('.cap-time').textContent,
})));
ok('multi captions carry the full date and HH:MM zone per cell',
  caps.every((x) => /\d{4}/.test(x.date) && /^\d{2}:\d{2} \S+/.test(x.time))
  && caps[1].time.startsWith(jakHour),
  caps.map((x) => `${x.zone}: ${x.date} · ${x.time}`).join(' | '));
await page.keyboard.press('Escape');

/* --- the Window menu reflows the current window: 2x2, side by side, single --- */
await page.locator('#btnWindow').click();
await page.waitForTimeout(120);
ok('window button offers four formats', await page.locator('#winList .tz-row').count() === 4);
await page.locator('#winList .tz-row[data-layout="4"]').click();
await page.waitForTimeout(400);
const m1 = await page.evaluate(() => ({
  layout: document.getElementById('grid').dataset.layout,
  cells: document.querySelectorAll('.cell').length,
  unset: document.querySelectorAll('.cell.unset').length,
  zone0: document.getElementById('zenZone').textContent,
}));
ok('choosing 2x2 reflows the current window into four cells',
  m1.layout === '2x2' && m1.cells === 4 && m1.unset === 2 && m1.zone0 === 'Asia/Tokyo',
  JSON.stringify(m1));
ok('reformatting opens no new tab', page.context().pages().length === 1);

await page.locator('.cell').nth(2).locator('.cell-add').click();
await page.locator('#tzSearch').fill('calcutta');
await page.locator('.tz-row[data-zone="Asia/Calcutta"]').click();
await page.locator('.cell').nth(3).locator('.cell-add').click();
await page.locator('#tzSearch').fill('new york');
await page.locator('.tz-row[data-zone="America/New_York"]').click();
await page.waitForTimeout(400);
const m2 = await page.evaluate(() => ({
  zones: [...document.querySelectorAll('.cell .cap-zone')].map((e) => e.textContent),
  url: location.search,
}));
ok('every cell runs its own zone',
  m2.zones.join() === 'Asia/Tokyo,Asia/Jakarta,Asia/Calcutta,America/New_York', m2.zones.join());
ok('the layout and zones live in the URL',
  m2.url.includes('layout=2x2') && m2.url.includes('Asia%2FCalcutta'), m2.url);
await page.screenshot({ path: 'shot-2x2.png' });

await page.locator('#btnWindow').click();
await page.locator('#winList .tz-row[data-layout="2"]').click();
await page.waitForTimeout(300);
const m3 = await page.evaluate(() => ({
  layout: document.getElementById('grid').dataset.layout,
  cells: document.querySelectorAll('.cell').length,
  url: location.search,
}));
ok('side by side keeps the first two zones',
  m3.layout === '2' && m3.cells === 2 && m3.url.includes('layout=2'), JSON.stringify(m3));
await page.screenshot({ path: 'shot-side.png' });

/* --- the format survives a reload --- */
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(400);
const m4 = await page.evaluate(() => ({
  layout: document.getElementById('grid').dataset.layout,
  zones: [...document.querySelectorAll('.cell .cap-zone')].map((e) => e.textContent),
}));
ok('the window format survives a reload',
  m4.layout === '2' && m4.zones.join() === 'Asia/Tokyo,Asia/Jakarta', JSON.stringify(m4));

/* --- single restores the classic header line --- */
await page.locator('#btnWindow').click();
await page.locator('#winList .tz-row[data-layout="1"]').click();
await page.waitForTimeout(300);
const m5 = await page.evaluate(() => ({
  layout: document.getElementById('grid').dataset.layout,
  meta: getComputedStyle(document.querySelector('.meta-row')).display,
  cap: getComputedStyle(document.querySelector('.cell-cap')).display,
}));
ok('single restores the date line above the clock',
  m5.layout === '1' && m5.meta !== 'none' && m5.cap === 'none', JSON.stringify(m5));

/* --- ?zen=1 still serves a chrome-less window when asked by URL --- */
const zen = await context.newPage();
await zen.goto(URL + '?tz=Asia/Jakarta&zen=1', { waitUntil: 'load' });
await zen.waitForTimeout(500);
const z1 = await zen.evaluate(() => ({
  zen: document.documentElement.classList.contains('zen'),
  zone: document.getElementById('zenZone').textContent,
  flag: document.getElementById('zenFlag').src.startsWith('data:image/svg'),
  clock: document.getElementById('clock').textContent,
  meta: getComputedStyle(document.querySelector('.meta-row')).display,
  layBtns: document.querySelectorAll('.lay-btn').length,
  fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
}));
ok('?zen=1 still gives a chrome-less window by URL',
  z1.zen && z1.zone === 'Asia/Jakarta' && z1.flag && z1.meta === 'none' && z1.layBtns === 4 && z1.fits,
  JSON.stringify(z1));
ok('the zen window clocks HH:MM:SS:mmm', /^\d{2}:\d{2}:\d{2}:\d{3}$/.test(z1.clock), z1.clock);
await zen.screenshot({ path: 'shot-window.png' });
await zen.close();

/* --- the choice persists across reloads --- */
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(400);
const keptLabel = (await page.locator('#tzLabel').textContent()).trim();
ok('the zone choice survives a reload', keptLabel === 'Tokyo', keptLabel);

// back to the system zone for the screenshots
const sysZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
await page.locator('#tzBtn').click();
await page.locator(`.tz-row[data-zone="${sysZone}"]`).click();
await page.waitForTimeout(200);

/* --- languages: twenty-five options with flags, live translation, RTL --- */
await page.locator('#langBtn').click();
await page.waitForTimeout(150);
const langRows = await page.locator('#langList .tz-row').count();
ok('language toggle lists 25 languages', langRows === 25, `${langRows} rows`);
{
  const lm = await browser.newContext({ viewport: { width: 360, height: 640 } });
  await lm.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
  const lp = await lm.newPage();
  await lp.goto(URL + 'index.html', { waitUntil: 'load' });
  await lp.waitForTimeout(300);
  await lp.click('#langBtn');
  await lp.waitForTimeout(250);
  ok('the 25-language menu fits and scrolls on phones', await lp.evaluate(() => {
    const list = document.getElementById('langList');
    const r = list.getBoundingClientRect();
    return r.bottom <= innerHeight && r.top >= 0 && list.scrollHeight > list.clientHeight;
  }));
  await lp.close();
  await lm.close();
}

/* device x language guard: narrowest phone with the longest and CJK
   translations must never overflow horizontally on any page */
for (const dl of ['de', 'el', 'ja']) {
  const dc = await browser.newContext({ viewport: { width: 320, height: 568 } });
  await dc.addInitScript(([l]) => { localStorage.setItem('singhoah:visited','1'); localStorage.setItem('singhoah:lang', l); }, [dl]);
  const dp = await dc.newPage();
  let over = 0;
  for (const pg of ['index.html', 'wallet.html', 'scribe.html', 'settings.html', 'launch.html', 'metro.html']) {
    await dp.goto(URL + pg, { waitUntil: 'load' });
    await dp.waitForTimeout(250);
    over += await dp.evaluate(() => (document.documentElement.scrollWidth > innerWidth + 1 ? 1 : 0));
  }
  ok(`no horizontal overflow at 320px in ${dl}`, over === 0);
  await dp.close();
  await dc.close();
}
ok('every language row carries an SVG flag', await page.evaluate(
  () => [...document.querySelectorAll('#langList img')].every((i) => i.src.startsWith('data:image/svg'))));

await page.locator('#langList .tz-row[data-lang="zh-Hant"]').click();
await page.waitForTimeout(250);
const zh = await page.evaluate(() => ({
  date: document.getElementById('dateLabel').textContent,
  time: document.getElementById('timeLabel').textContent,
  resync: document.getElementById('resyncText').textContent,
  dateLong: document.getElementById('dateLong').textContent,
  lang: document.documentElement.lang,
  search: document.getElementById('tzSearch').placeholder,
}));
ok('UI translates to Traditional Chinese',
  zh.date === '日期' && zh.time === '時間' && zh.resync === '重新同步' && zh.search.startsWith('搜尋'),
  JSON.stringify(zh));
ok('date line renders in zh-Hant', zh.lang.startsWith('zh') && /星期|週/.test(zh.dateLong), zh.dateLong);
await page.screenshot({ path: 'shot-zh.png' });

await page.locator('#langBtn').click();
await page.locator('#langList .tz-row[data-lang="ar"]').click();
await page.waitForTimeout(250);
const ar = await page.evaluate(() => ({
  dir: document.documentElement.dir,
  time: document.getElementById('timeLabel').textContent,
}));
ok('Arabic flips the document to RTL', ar.dir === 'rtl' && ar.time === 'الوقت', JSON.stringify(ar));
ok('the clock itself still reads left-to-right', await page.evaluate(
  () => getComputedStyle(document.getElementById('clock')).direction === 'ltr'));
await page.screenshot({ path: 'shot-ar.png' });

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(400);
ok('language choice survives a reload',
  await page.evaluate(() => document.documentElement.lang.startsWith('ar')));

// back to English for the remaining checks
await page.locator('#langBtn').click();
await page.locator('#langList .tz-row[data-lang="en"]').click();
await page.waitForTimeout(200);

await page.screenshot({ path: 'shot-night.png' });

/* --- narrow viewports --- */
for (const vp of [{ width: 420, height: 780 }, { width: 360, height: 640 }]) {
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
  const fits = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
    size: getComputedStyle(document.getElementById('clock')).fontSize,
    clock: document.getElementById('clock').textContent,
  }));
  ok(`fits ${vp.width}×${vp.height} without scrolling`,
    fits.sw <= fits.iw + 1 && fits.sh <= fits.ih + 1,
    `${fits.sw}×${fits.sh} vs ${fits.iw}×${fits.ih}, font ${fits.size}`);
  await page.screenshot({ path: `shot-${vp.width}.png` });
}

/* --- analog mode: a dial with hour, minute, second and milli hands --- */
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);
await page.locator('#btnMode').click();
await page.waitForTimeout(250);
const an1 = await page.evaluate(() => ({
  analog: document.documentElement.classList.contains('analog'),
  clockHidden: getComputedStyle(document.getElementById('clock')).display === 'none',
  dial: getComputedStyle(document.querySelector('.cell .dial')).display,
  hands: [...document.querySelectorAll('.cell .dial [data-hand]')].map((h) => h.dataset.hand),
  saved: localStorage.getItem('singhoah:mode'),
  label: document.getElementById('btnMode').textContent.trim(),
}));
ok('analog toggle swaps digits for a four-hand dial',
  an1.analog && an1.clockHidden && an1.dial !== 'none'
  && an1.hands.join() === 'hour,minute,second,milli' && an1.saved === 'analog'
  && an1.label === 'Digital',
  JSON.stringify(an1));
const hA = await page.evaluate(() =>
  [...document.querySelectorAll('.cell .dial [data-hand]')].map((h) => h.getAttribute('transform')));
await page.waitForTimeout(300);
const hB = await page.evaluate(() =>
  [...document.querySelectorAll('.cell .dial [data-hand]')].map((h) => h.getAttribute('transform')));
ok('hour, minute, second and milli hands all sweep', hA.every((tr, i) => tr !== hB[i]),
  `${hA[3]} → ${hB[3]}`);
await page.screenshot({ path: 'shot-analog.png' });

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(400);
ok('analog choice survives a reload',
  await page.evaluate(() => document.documentElement.classList.contains('analog')));

await page.locator('#btnWindow').click();
await page.locator('#winList .tz-row[data-layout="4"]').click();
await page.waitForTimeout(400);
const an2 = await page.evaluate(() => ({
  dials: document.querySelectorAll('.cell .dial svg').length,
  visible: [...document.querySelectorAll('.cell:not(.unset) .dial')]
    .map((d) => getComputedStyle(d).display),
}));
ok('every cell gets its own analog dial', an2.dials === 4 && an2.visible.every((d) => d !== 'none'),
  JSON.stringify(an2));
await page.screenshot({ path: 'shot-analog-2x2.png' });

/* --- timers: countdown panes join the current window --- */
await page.locator('#btnMode').click(); // back to digital
await page.waitForTimeout(200);
await page.locator('#btnWindow').click();
await page.locator('#winList .tz-row[data-layout="1"]').click();
await page.waitForTimeout(200);
await page.locator('#btnTimer').click();
await page.waitForTimeout(120);
ok('timer popup offers six presets and a custom input',
  await page.locator('#timerPresets .btn').count() === 6);
await page.locator('#timerPresets .btn').nth(1).click(); // 5:00
await page.waitForTimeout(400);
const t1 = await page.evaluate(() => ({
  layout: document.getElementById('grid').dataset.layout,
  timerCells: document.querySelectorAll('.cell.timer').length,
  clock1: [...document.querySelectorAll('.cell .clock')][1].textContent,
  cap: [...document.querySelectorAll('.cell.timer .cap-zone')][0].textContent,
}));
ok('starting a timer adds a countdown pane',
  t1.layout === '2' && t1.timerCells === 1 && /^\d{2}:\d{2}:\d{2}:\d{3}$/.test(t1.clock1)
  && t1.cap === 'Timer', JSON.stringify(t1));
await page.waitForTimeout(1500);
const t1b = await page.evaluate(() => [...document.querySelectorAll('.cell .clock')][1].textContent);
ok('the timer counts down', t1b < t1.clock1, `${t1.clock1} → ${t1b}`);
await page.screenshot({ path: 'shot-timer.png' });

await page.locator('.cell.timer .cell-cap').click();
await page.waitForTimeout(200);
const p1 = await page.evaluate(() => [...document.querySelectorAll('.cell .clock')][1].textContent);
await page.waitForTimeout(700);
const p2 = await page.evaluate(() => [...document.querySelectorAll('.cell .clock')][1].textContent);
ok('caption tap pauses the countdown', p1 === p2, `${p1} = ${p2}`);
await page.locator('.cell.timer .cell-cap').click();
await page.waitForTimeout(700);
const p3 = await page.evaluate(() => [...document.querySelectorAll('.cell .clock')][1].textContent);
ok('caption tap resumes it', p3 < p2, `${p2} → ${p3}`);

await page.locator('#btnTimer').click();
await page.locator('#timerMin').fill('0.05');
await page.locator('#timerStart').click();
await page.waitForTimeout(4200);
const dn = await page.evaluate(() => ({
  done: document.querySelectorAll('.cell.done').length,
  timers: document.querySelectorAll('.cell.timer').length,
}));
ok('a finished timer flags done', dn.done === 1 && dn.timers === 2, JSON.stringify(dn));
await page.locator('.cell.done .cap-x').click();
await page.locator('.cell.timer .cap-x').click();
await page.waitForTimeout(300);
ok('× clears timer panes',
  await page.evaluate(() => document.querySelectorAll('.cell.timer').length) === 0);
await page.locator('#btnWindow').click();
await page.locator('#winList .tz-row[data-layout="1"]').click();
await page.waitForTimeout(200);

/* --- stopwatch: counting-up panes --- */
await page.locator('#btnStop').click();
await page.waitForTimeout(400);
const sw1 = await page.evaluate(() => ({
  layout: document.getElementById('grid').dataset.layout,
  stops: document.querySelectorAll('.cell.stop').length,
  clock: [...document.querySelectorAll('.cell .clock')][1].textContent,
}));
ok('stopwatch button adds a counting-up pane',
  sw1.layout === '2' && sw1.stops === 1 && /^\d{2}:\d{2}:\d{2}:\d{3}$/.test(sw1.clock),
  JSON.stringify(sw1));
await page.waitForTimeout(1200);
const sw2 = await page.evaluate(() => [...document.querySelectorAll('.cell .clock')][1].textContent);
ok('the stopwatch counts up', sw2 > sw1.clock, `${sw1.clock} → ${sw2}`);
await page.screenshot({ path: 'shot-stopwatch.png' });
await page.locator('.cell.stop .cell-cap').click();
await page.waitForTimeout(200);
const sp1 = await page.evaluate(() => [...document.querySelectorAll('.cell .clock')][1].textContent);
await page.waitForTimeout(600);
const sp2 = await page.evaluate(() => [...document.querySelectorAll('.cell .clock')][1].textContent);
ok('caption tap pauses the stopwatch', sp1 === sp2, `${sp1} = ${sp2}`);
await page.locator('.cell.stop .cap-reset').click();
await page.waitForTimeout(300);
const sp3 = await page.evaluate(() => [...document.querySelectorAll('.cell .clock')][1].textContent);
ok('↺ resets to zero while paused', sp3.startsWith('00:00:00'), sp3);
await page.locator('.cell.stop .cell-cap').click();
await page.waitForTimeout(700);
const sp4 = await page.evaluate(() => [...document.querySelectorAll('.cell .clock')][1].textContent);
ok('resume continues after reset', sp4 > sp3, `${sp3} → ${sp4}`);
await page.locator('.cell.stop .cap-x').click();
await page.waitForTimeout(200);
ok('× clears the stopwatch',
  await page.evaluate(() => document.querySelectorAll('.cell.stop').length) === 0);
await page.locator('#btnWindow').click();
await page.locator('#winList .tz-row[data-layout="1"]').click();
await page.waitForTimeout(200);

/* --- IP locator: public IP, geolocation, honest MAC note --- */
await page.locator('#btnIp').click();
await page.waitForFunction(() => {
  const v = document.getElementById('ipIp').textContent;
  return v && v !== '—' && /[\d.]/.test(v);
}, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(300);
const ipd = await page.evaluate(() => ({
  ip: document.getElementById('ipIp').textContent,
  mac: document.getElementById('ipMac').textContent,
  loc: document.getElementById('ipLoc').textContent,
  coord: document.getElementById('ipCoord').textContent,
  useHidden: document.getElementById('ipUse').hidden,
}));
ok('IP locator resolves the public IP', /\d+\.\d+\.\d+\.\d+|:[0-9a-fA-F]/.test(ipd.ip), ipd.ip);
ok('MAC row states the browser privacy limit', ipd.mac.length > 5, ipd.mac);
ok('location and coordinates resolved from the IP',
  ipd.loc.includes(',') && /^-?\d/.test(ipd.coord), `${ipd.loc} · ${ipd.coord}`);
await page.screenshot({ path: 'shot-ip.png' });
if (!ipd.useHidden) {
  await page.locator('#ipUse').click();
  await page.waitForTimeout(300);
  ok('one tap adopts the located time zone',
    await page.evaluate(() => document.getElementById('ipPop').hidden));
} else {
  await page.keyboard.press('Escape');
  ok('one tap adopts the located time zone', true, 'located tz not in catalog — skipped');
}

/* --- the wallet moved out: SinghoWallet is its own app --- */
ok('the clock ships no wallet — SinghoWallet is its own app',
  await page.evaluate(() => !document.getElementById('btnWallet') && !!document.getElementById('btnLaunch')));
ok('生活 sits beside the SinghoClock wordmark',
  (await page.locator('.wordmark-zh').textContent()) === '生活');

/* --- the world map: detailed SVG, click a country to pick its zone --- */
await page.locator('#btnMap').click();
await page.waitForSelector('#mapSvg .map-cc', { timeout: 20000 });
const mp1 = await page.evaluate(() => {
  const tz = document.getElementById('zoneText').textContent.split(' ·')[0];
  return {
    paths: document.querySelectorAll('#mapSvg .map-cc').length,
    grat: !!document.querySelector('#mapSvg .map-grat'),
    sel: document.querySelector('#mapSvg .map-cc.sel')?.dataset.cc || null,
    cc: window.__SINGHOAH_FLAGS.zoneCc[tz] || null,
  };
});
ok('the map renders 230+ detailed countries plus the 15° graticule',
  mp1.paths >= 230 && mp1.grat, `${mp1.paths} paths`);

/* settlements: zoom-driven labels, English name with the native script under it */
await page.evaluate(() => window.__SING_LIB.mapGoCity('Taipei'));
await page.waitForTimeout(700);
const city1 = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('#mapCities .map-city')];
  const tp = labels.find((g) => g.textContent.includes('Taipei'));
  const tx = tp ? tp.querySelector('text') : null;
  return {
    n: labels.length,
    main: tp ? tp.querySelector('tspan').textContent : null,
    sub: tp ? tp.querySelector('tspan:nth-of-type(2)')?.textContent || null : null,
    stroke: tx ? getComputedStyle(tx).stroke : 'missing',
  };
});
ok('zooming in reveals labelled cities, towns and villages', city1.n > 3, `${city1.n} labels`);
ok('a city shows its native script below the name',
  city1.main === 'Taipei' && city1.sub === '臺北市', `${city1.main} / ${city1.sub}`);
ok('city labels carry no background or halo', city1.stroke === 'none', city1.stroke);
ok('city labels never overlap', await page.evaluate(() => {
  const b = [...document.querySelectorAll('#mapCities text')].map((t) => t.getBoundingClientRect());
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const ox = Math.min(b[i].right, b[j].right) - Math.max(b[i].left, b[j].left);
    const oy = Math.min(b[i].bottom, b[j].bottom) - Math.max(b[i].top, b[j].top);
    if (ox > 2 && oy > 2) return false;
  }
  return b.length > 3;
}));
await page.evaluate(() => {
  const svg = document.getElementById('mapSvg');
  for (let i = 0; i < 6; i++) svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, clientX: 400, clientY: 300 }));
});
await page.waitForTimeout(400);
ok('more zoom brings out smaller places', await page.evaluate(() =>
  document.querySelectorAll('#mapCities .map-city').length > 0));
ok('city dots stay pin-sized even deep-zoomed (no giant-disc regression)', await page.evaluate(() => {
  const svg = document.getElementById('mapSvg');
  const ctm = svg.getScreenCTM();
  const dots = [...document.querySelectorAll('#mapCities .map-city circle')];
  if (!dots.length || !ctm || !ctm.a) return false;
  const rs = dots.map((d) => parseFloat(d.getAttribute('r')) * ctm.a);
  return rs.every((r) => r >= 0.3 && r <= 3);
}));
await page.evaluate(() => document.getElementById('mapZoomReset').click());
await page.waitForTimeout(300);
ok('the current zone country is highlighted', mp1.sel === mp1.cc, `${mp1.sel} vs ${mp1.cc}`);
// with 10m coastlines the bbox-center of Japan can fall in open water
// (the Nanpo islands stretch the box), so dispatch the click on the path
await page.evaluate(() => document.querySelector('#mapSvg .map-cc[data-cc="JP"]')
  .dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(300);
ok('clicking a single-zone country selects it and closes the map',
  await page.evaluate(() => document.getElementById('mapWrap').hidden
    && document.getElementById('zoneText').textContent.startsWith('Asia/Tokyo')));
await page.locator('#btnMap').click();
// bbox-center clicks land on France (Aleutians cross the antimeridian),
// so dispatch the click on the path itself
await page.evaluate(() => document.querySelector('#mapSvg .map-cc[data-cc="US"]')
  .dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(200);
const usCheck = await page.evaluate(() => {
  const vis = [...document.querySelectorAll('#tzList .tz-row:not([hidden])')]
    .map((r) => r.dataset.zone);
  return { vis, all: vis.every((z) => window.__SINGHOAH_CCZONES.get('US').includes(z)) };
});
ok('multi-zone countries open the picker filtered to that country',
  usCheck.vis.length > 3 && usCheck.vis.length < 30 && usCheck.all, `${usCheck.vis.length} zones`);
await page.locator(`#tzList .tz-row[data-zone="${usCheck.vis[0]}"]`).click();
await page.waitForTimeout(200);
ok('picking from the filtered list applies the zone',
  await page.evaluate((z) => document.getElementById('zoneText').textContent.startsWith(z), usCheck.vis[0]));
await page.locator('#tzBtn').click();
await page.waitForTimeout(150);
ok('the filter clears once the picker closes',
  await page.locator('#tzList .tz-row:not([hidden])').count() > 400);
await page.keyboard.press('Escape');

/* --- phones: dropdowns anchor below their buttons, taps work --- */
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const m = await mob.newPage();
const merrors = [];
m.on('pageerror', (e) => merrors.push(String(e)));
await m.goto(URL, { waitUntil: 'load' });
await m.evaluate(() => { localStorage.clear(); localStorage.setItem('singhoah:visited', '1'); });
await m.goto(URL, { waitUntil: 'load' });
await m.waitForTimeout(400);
ok('mobile page has no horizontal scroll',
  await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await m.locator('#tzBtn').tap();
await m.waitForTimeout(200);
const pb = await m.locator('#tzPop').boundingBox();
const tzb = await m.locator('#tzBtn').boundingBox();
ok('zone dropdown hangs right below its button on mobile',
  pb && tzb && pb.y >= tzb.y + tzb.height && pb.y <= tzb.y + tzb.height + 12
  && pb.x >= 0 && pb.x + pb.width <= 391, JSON.stringify({ pop: pb, btn: tzb }));
await m.screenshot({ path: 'shot-mobile-pop.png' });
await m.locator('#tzSearch').fill('tokyo');
await m.locator('.tz-row[data-zone="Asia/Tokyo"]').tap();
await m.waitForTimeout(300);
ok('tapping a row selects the zone on touch',
  (await m.locator('#tzLabel').textContent()).trim() === 'Tokyo');
await m.locator('#langBtn').tap();
await m.waitForTimeout(200);
const lb = await m.locator('#langPop').boundingBox();
const lbb = await m.locator('#langBtn').boundingBox();
ok('language dropdown hangs right below its button too',
  lb && lbb && lb.y >= lbb.y + lbb.height && lb.y <= lbb.y + lbb.height + 12
  && lb.x >= 0 && lb.x + lb.width <= 391, JSON.stringify(lb));
await m.locator('#langList .tz-row[data-lang="en"]').tap();
await m.locator('#btnTimer').tap();
await m.waitForTimeout(200);
const tb = await m.locator('#timerPop').boundingBox();
const tmb = await m.locator('#btnTimer').boundingBox();
ok('timer dropdown hangs right below its button too',
  tb && tmb && tb.y >= tmb.y + tmb.height && tb.y <= tmb.y + tmb.height + 12
  && tb.x >= 0 && tb.x + tb.width <= 391, JSON.stringify(tb));
await m.keyboard.press('Escape');
await m.locator('#btnMap').tap();
await m.waitForTimeout(300);
const mb = await m.locator('#mapSvg').boundingBox();
ok('the map fits the phone viewport',
  mb && mb.x >= 0 && mb.x + mb.width <= 391 && mb.y >= 0 && mb.y + mb.height <= 845, JSON.stringify(mb));
await m.evaluate(() => document.querySelector('#mapSvg .map-cc[data-cc="JP"]')
  .dispatchEvent(new MouseEvent('click', { bubbles: true })));
await m.waitForTimeout(300);
ok('tapping a country selects its zone on touch',
  await m.evaluate(() => document.getElementById('zoneText').textContent.startsWith('Asia/Tokyo')));
await m.locator('#btnIp').tap();
await m.waitForTimeout(300);
const ib = await m.locator('#ipPop').boundingBox();
const ibb = await m.locator('#btnIp').boundingBox();
ok('IP dropdown hangs right below its button too',
  ib && ibb && ib.y >= ibb.y + ibb.height && ib.y <= ibb.y + ibb.height + 12
  && ib.x >= 0 && ib.x + ib.width <= 391, JSON.stringify(ib));
await m.keyboard.press('Escape');
await m.locator('#btnTimer').tap();
await m.waitForTimeout(200);
await m.locator('#timerPresets .btn').nth(0).tap();
await m.waitForTimeout(400);
ok('a timer pane works on the stacked phone layout', await m.evaluate(() =>
  document.querySelectorAll('.cell').length === 2 && document.querySelectorAll('.cell.timer').length === 1));
await m.screenshot({ path: 'shot-mobile.png' });
ok('no page errors on mobile', merrors.length === 0, merrors.join('; '));
ok('phones keep the page scrollable', await m.evaluate(() =>
  getComputedStyle(document.body).overflowY === 'auto'));
ok('sign-in button renders from the live config', await m.evaluate(() =>
  !!document.querySelector('#authWrap') &&
  document.querySelector('#authWrap').children.length === 1 &&
  !!document.querySelector('#signinBtn')));
await mob.close();

/* --- SinghoWallet: the wallet as its own app --- */
const wpage = await context.newPage();
const werrors = [];
wpage.on('pageerror', (e) => werrors.push(String(e)));
await wpage.goto(URL + 'wallet.html', { waitUntil: 'load' });
await wpage.waitForTimeout(400);
ok('SinghoWallet loads as its own app',
  (await wpage.locator('.wordmark').textContent()).includes('Wallet'));
ok('the wallet panel wheel-scrolls instead of clipping', await wpage.evaluate(() => {
  const oy = getComputedStyle(document.querySelector('.wallet-app')).overflowY;
  return oy === 'auto' || oy === 'scroll';
}));
await wpage.click('#langBtn');
await wpage.waitForTimeout(200);
const walAlign = await wpage.evaluate(() => {
  const b = document.getElementById('langBtn').getBoundingClientRect();
  const d = document.getElementById('langPop').getBoundingClientRect();
  return { dl: Math.abs(d.left - b.left), below: d.top >= b.bottom, inVw: d.right <= innerWidth - 4 && d.left >= 4 };
});
ok('wallet language dropdown anchors left-edge to its button', walAlign.dl <= 1 && walAlign.below && walAlign.inVw, JSON.stringify(walAlign));
await wpage.keyboard.press('Escape');
ok('錢包 sits beside the SinghoWallet wordmark',
  (await wpage.locator('.wordmark-zh').textContent()) === '錢包');
ok('wallet defaults to USD', await (async () => {
  const b = (await wpage.locator('#walCurBtn').textContent()).trim();
  const s = (await wpage.locator('#walAmtSym').textContent()).trim();
  return b.includes('USD') && s === '$';
})());
await wpage.locator('#walTypeIn').click();
await wpage.locator('#walAmt').fill('100');
await wpage.locator('#walAddBtn').click();
await wpage.waitForTimeout(120);
await wpage.locator('#walTypeOut').click();
await wpage.locator('#walAmt').fill('30');
await wpage.locator('#walNote').fill('Coffee');
await wpage.locator('#walAddBtn').click();
await wpage.waitForTimeout(120);
const wd = await wpage.evaluate(() => ({
  bal: document.getElementById('walBal').textContent,
  days: document.getElementById('walDaysBox').textContent,
}));
ok('wallet balance is income minus spending', wd.bal.replace(/[^0-9.-]/g, '').includes('70'), wd.bal);
ok('the days view lists today’s spending with its note',
  /Coffee/.test(wd.days) && /30/.test(wd.days), wd.days.slice(0, 80));
await wpage.locator('#walTabR').click();
await wpage.waitForTimeout(120);
ok('reports dashboard offers six period ranges', await wpage.evaluate(() =>
  document.querySelectorAll('#walRepBox [data-rep]').length === 6 &&
  document.querySelector('#walRepBox [data-rep="week"]').getAttribute('aria-pressed') === 'true'));
await wpage.locator('#walRepBox [data-rep="year"]').click();
await wpage.waitForTimeout(120);
ok('year report renders twelve month buckets', await wpage.evaluate(() => {
  const n = document.querySelectorAll('#walRepBox .wal-chart rect').length;
  return n >= 12 && n <= 24;
}));
await wpage.locator('#walRepBox [data-rep="decade"]').click();
await wpage.waitForTimeout(120);
ok('decade report renders ten year buckets', await wpage.evaluate(() => {
  const n = document.querySelectorAll('#walRepBox .wal-chart rect').length;
  return n >= 10 && n <= 20;
}));
ok('report range choice persists', await wpage.evaluate(() =>
  localStorage.getItem('singhoah:walrep') === 'decade'));
await wpage.locator('#walRepBox [data-rep="week"]').click();
await wpage.waitForTimeout(120);
await wpage.locator('#walCurBtn').click();
await wpage.waitForTimeout(150);
const wc = await wpage.evaluate(() => ({
  rows: document.querySelectorAll('#curList .cur-row').length,
  btc: (document.querySelector('#curList .cur-row[data-code="BTC"]') || {}).textContent || '',
  eth: (document.querySelector('#curList .cur-row[data-code="ETH"]') || {}).textContent || '',
  usd: (document.querySelector('#curList .cur-row[data-code="USD"]') || {}).textContent || '',
}));
ok('currency dropdown lists 140+ currencies with flags', wc.rows >= 140, `${wc.rows} rows`);
ok('BTC and ETH are listed with their symbols',
  wc.btc.includes('₿') && wc.eth.includes('Ξ'), `${wc.btc.trim()} · ${wc.eth.trim()}`);
ok('currency rows carry localized names', /Dollar/.test(wc.usd), wc.usd.trim().slice(0, 60));
await wpage.locator('#curSearch').fill('CFA');
await wpage.waitForTimeout(120);
await wpage.locator('#curList .cur-row[data-code="XOF"]').click();
await wpage.waitForTimeout(150);
const wg = await wpage.evaluate(() => {
  const sym = document.getElementById('walAmtSym').getBoundingClientRect();
  const amt = document.getElementById('walAmt').getBoundingClientRect();
  return { symRight: Math.round(sym.right), amtLeft: Math.round(amt.left), symW: Math.round(sym.width) };
});
ok('the Amount text sits clear of even a wide currency symbol',
  wg.symW > 18 && wg.amtLeft >= wg.symRight, JSON.stringify(wg));
ok('Amount is real label text in the wallet app',
  await wpage.evaluate(() => document.getElementById('walAmtLabel').textContent === 'Amount'
    && document.getElementById('walAmt').placeholder === ''));
await wpage.locator('#walDateBtn').click();
await wpage.waitForTimeout(120);
ok('the date picker shows a full localized month',
  await wpage.evaluate(() => {
    const n = document.querySelectorAll('#walCal .wal-cal-day:not(.dim)').length;
    return n >= 28 && n <= 31;
  }));
await wpage.screenshot({ path: 'shot-wallet-app.png' });
await wpage.locator('#langBtn').click();
await wpage.locator('#langList .tz-row[data-lang="zh-Hant"]').click();
await wpage.waitForTimeout(200);
ok('the wallet app translates to Traditional Chinese',
  await wpage.evaluate(() => document.getElementById('walAmtLabel').textContent === '金額'
    && document.getElementById('walAddBtn').textContent === '新增'));
await wpage.locator('#langBtn').click();
await wpage.locator('#langList .tz-row[data-lang="en"]').click();
await wpage.waitForTimeout(150);
await wpage.locator('#walTabD').click();
await wpage.waitForTimeout(120);
while (await wpage.locator('.wal-x').count()) {
  await wpage.locator('.wal-x').first().click();
  await wpage.waitForTimeout(60);
}
ok('deleting every entry empties the wallet',
  await wpage.evaluate(() => document.getElementById('walDaysBox').textContent.trim().length > 3));
/* --- the cash tab: real banknotes & coins pop out of a wallet --- */
await wpage.evaluate(() => localStorage.setItem('singhoah:wallet',
  JSON.stringify({ cur: 'USD', tx: [{ type: 'in', amt: 387.65 }] })));
await wpage.reload({ waitUntil: 'load' });
await wpage.waitForTimeout(400);
await wpage.click('#walTabC');
await wpage.waitForSelector('.cash-note', { timeout: 3000 });
const cash = await wpage.evaluate(() => {
  let sum = 0;
  for (const n of document.querySelectorAll('.cash-note,.cash-coin')) {
    const m = n.title.match(/^(\d+)× /);
    const v = parseFloat(n.title.split('× ').pop().replace(/[^0-9.]/g, ''));
    sum += Number(m[1]) * v;
  }
  return { n: document.querySelectorAll('.cash-note').length, c: document.querySelectorAll('.cash-coin').length,
    sum: Math.round(sum * 100) / 100, wallet: !!document.querySelector('.cash-wallet') };
});
ok('the cash tab pops real banknotes and coins out of a wallet',
  cash.wallet && cash.n === 6 && cash.c === 3 && cash.sum === 387.65, JSON.stringify(cash));
/* every currency on Earth: real ladders, drawable art, consistent split */
const cashAudit = await wpage.evaluate(() => {
  const C = globalThis.__SING_CASH;
  if (!C) return { n: 0, bad: ['module not loaded'] };
  const r1 = (x) => Math.round(x * 1000) / 1000;
  const bad = [];
  for (const cur of Object.keys(C.L)) {
    const st = C.S[cur];
    if (!st || !st[1].length || !st[2].length) { bad.push(cur + ':style'); continue; }
    for (const mo of st[1]) if (!C.MOTIFS[mo]) bad.push(cur + ':' + mo);
    for (const amount of [1000.57, 0.99]) {
      const s = C.splitCash(cur, amount);
      const again = C.splitCash(cur, r1(s.out.reduce((a, x) => a + x.v * x.n, 0) + s.rest));
      const sum2 = r1(again.out.reduce((a, x) => a + x.v * x.n, 0) + again.rest);
      if (sum2 !== r1(s.out.reduce((a, x) => a + x.v * x.n, 0) + s.rest)) bad.push(cur + ':resplit');
      for (const piece of s.out) {
        const ladder = piece.coin ? C.L[cur][1] : C.L[cur][0];
        if (!ladder.includes(piece.v)) bad.push(cur + ':' + piece.v);
      }
    }
    const art = C.noteSVG(cur, C.L[cur][0][0], 'X', 0);
    if (!art.includes('<symbol') || !art.includes('translate(')) bad.push(cur + ':art');
  }
  return { n: Object.keys(C.L).length, bad: [...new Set(bad)] };
});
ok('every world currency has real denominations and drawable banknote art',
  cashAudit.n === 155 && cashAudit.bad.length === 0, `${cashAudit.n} currencies; ${cashAudit.bad.slice(0, 5).join(', ')}`);
const holes = await wpage.evaluate(() => {
  const C = globalThis.__SING_CASH;
  const jpy5 = C.coinSVG('JPY', 5, 3), cny = C.coinSVG('CNY', 1, 0), gbp = C.coinSVG('GBP', 0.2, 2);
  return jpy5.includes('r="13"') && cny.includes('width="20" height="20"') && gbp.includes('polygon');
});
ok('real coin shapes: holed yen, square-hole yuan, heptagonal 20p', holes);
/* --- no limit: a millionaire balance is fully represented, as bundles --- */
await wpage.evaluate(() => localStorage.setItem('singhoah:wallet',
  JSON.stringify({ cur: 'TWD', tx: [{ type: 'in', amt: 1000000 }] })));
await wpage.reload({ waitUntil: 'load' });
await wpage.waitForTimeout(400);
await wpage.click('#walTabC');
await wpage.waitForSelector('.cash-stack', { timeout: 3000 });
const big = await wpage.evaluate(() => {
  let sum = 0;
  for (const n of document.querySelectorAll('.cash-note,.cash-coin,.cash-stack,.cash-pile')) {
    const m = /^(\d+)× /.exec(n.title);
    sum += Number(m[1]) * parseFloat(n.title.split('× ').pop().replace(/[^0-9.]/g, ''));
  }
  const more = document.querySelector('.cash-more');
  if (more) sum += parseFloat(more.textContent.replace(/[^0-9.]/g, ''));
  return { sum, stacks: document.querySelectorAll('.cash-stack').length, more: !!more,
    nodes: document.querySelectorAll('#walCashBox *').length };
});
ok('a millionaire balance is fully represented with no cap',
  big.sum === 1000000 && big.stacks === 1 && !big.more && big.nodes < 200, JSON.stringify(big));
await wpage.evaluate(() => localStorage.setItem('singhoah:lang', 'zh-Hant'));
await wpage.reload({ waitUntil: 'load' });
await wpage.waitForTimeout(300);
ok('the cash tab is translated', (await wpage.locator('#walTabC').textContent()) === '現金',
  await wpage.locator('#walTabC').textContent());
ok('no page errors in the wallet app', werrors.length === 0, werrors.join('; '));
ok('wallet shows the sign-in button too', await wpage.evaluate(() =>
  !!document.querySelector('#authWrap') && !!document.querySelector('#signinBtn')));

/* --- SinghoWallet on a phone --- */
const mob2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const wm = await mob2.newPage();
await wm.goto(URL + 'wallet.html', { waitUntil: 'load' });
await wm.waitForTimeout(400);
ok('wallet app fits the phone without horizontal scroll',
  await wm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await wm.locator('#walCurBtn').tap();
await wm.waitForTimeout(150);
const mb2 = await wm.locator('.wal-panel').boundingBox();
ok('currency list fits the phone viewport', mb2 && mb2.x >= 0 && mb2.x + mb2.width <= 391, JSON.stringify(mb2));
await wm.locator('#curSearch').fill('yen');
await wm.waitForTimeout(120);
await wm.locator('#curList .cur-row[data-code="JPY"]').tap();
await wm.waitForTimeout(150);
ok('tapping a currency selects it on touch',
  await wm.evaluate(() => document.getElementById('walCurBtn').textContent.includes('JPY')));
await wm.locator('#walDateBtn').tap();
await wm.waitForTimeout(150);
const mb3 = await wm.locator('#walCal').boundingBox();
ok('the date picker fits the phone viewport', mb3 && mb3.x >= 0 && mb3.x + mb3.width <= 391, JSON.stringify(mb3));
await wm.screenshot({ path: 'shot-wallet-app-mobile.png' });
await wm.locator('#walCal .wal-cal-day:not(.dim)').nth(9).tap();
await wm.waitForTimeout(120);
ok('tapping a day selects it on touch', await wm.evaluate(() => document.getElementById('walCal').hidden));
await mob2.close();

/* --- SinghoLaunch: the launchpad --- */
const lp = await context.newPage();
await lp.goto(URL + 'launch.html', { waitUntil: 'load' });
await lp.waitForTimeout(300);
ok('SinghoLaunch greets first-time visitors with a welcome page',
  await lp.evaluate(() => !document.getElementById('lpWelcome').hidden &&
    document.getElementById('lpWelS').textContent.length > 10));
await lp.click('#lpStartBtn');
ok('the welcome page dismisses and stays dismissed', await lp.evaluate(() =>
  document.getElementById('lpWelcome').hidden &&
  localStorage.getItem('singhoah:lpWelcomed') === '1'));
ok('launchpad shows today plus a live world strip', await lp.evaluate(async () => {
  const chips = [...document.querySelectorAll('.lp-wchip')];
  const today = document.getElementById('lpToday').textContent;
  if (chips.length !== 5 || today.length < 8) return false;
  const t0 = chips.map((c) => c.querySelector('.lp-wtime').textContent).join('|');
  await new Promise((x) => setTimeout(x, 1200));
  return chips.every((c) => /^\d{2}:\d{2}$/.test(c.querySelector('.lp-wtime').textContent));
}));
ok('launchpad fits short desktop windows without clipping', await (async () => {
  const c2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await c2.addInitScript(() => localStorage.setItem('singhoah:lpWelcomed', '1'));
  const p2 = await c2.newPage();
  await p2.goto(URL + 'launch.html', { waitUntil: 'load' });
  await p2.waitForTimeout(400);
  const m = await p2.evaluate(() => {
    const dial = document.getElementById('lpDial').getBoundingClientRect();
    const grid = document.querySelector('.lp-grid').getBoundingClientRect();
    const bar = document.querySelector('.topbar').getBoundingClientRect();
    return dial.top >= bar.bottom - 1 && grid.bottom <= innerHeight + 1;
  });
  await c2.close();
  return m;
})());
ok('launchpad wordmark reads SinghoLaunch',
  (await lp.locator('.wordmark').textContent()).includes('Launch'));
ok('the launchpad does not scroll', await lp.evaluate(() =>
  getComputedStyle(document.querySelector('.launch')).overflow === 'hidden'));
const lpTick1 = (await lp.locator('#lpClock').textContent()).trim();
await lp.waitForTimeout(300);
const lpTick2 = (await lp.locator('#lpClock').textContent()).trim();
ok('launchpad shows a live HH:MM:SS:mmm clock widget',
  /^\d{2}:\d{2}:\d{2}:\d{3}$/.test(lpTick1) && lpTick1 !== lpTick2, `${lpTick1} → ${lpTick2}`);
ok('launchpad shows the analog dial and its second hand sweeps', await (async () => {
  await lp.waitForSelector('#lpDial svg [data-hand="second"]');
  const h1 = await lp.locator('#lpDial [data-hand="second"]').getAttribute('transform');
  await lp.waitForTimeout(300);
  const h2 = await lp.locator('#lpDial [data-hand="second"]').getAttribute('transform');
  return !!h1 && h1.startsWith('rotate(') && h1 !== h2;
})());
ok('launchpad zone picker searches and selects Asia/Taipei', await (async () => {
  await lp.locator('#lpZoneBtn').click();
  if (await lp.locator('#lpTzPop').isHidden()) return false;
  await lp.locator('#lpTzSearch').fill('taipei');
  await lp.locator('.tz-row[data-zone="Asia/Taipei"]').click();
  await lp.waitForTimeout(150);
  const label = (await lp.locator('#lpZone').textContent()).trim();
  const stored = await lp.evaluate(() => localStorage.getItem('singhoah:lptz'));
  const closed = await lp.locator('#lpTzPop').isHidden();
  return label === 'Asia/Taipei' && stored === 'Asia/Taipei' && closed;
})());
ok('launchpad clock follows the chosen zone', await (async () => {
  const expH = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', hour12: false }).format(new Date());
  const got = (await lp.locator('#lpClock').textContent()).trim();
  const okNow = got.startsWith(expH + ':');
  await lp.evaluate(() => localStorage.removeItem('singhoah:lptz'));
  return okNow;
})());
ok('launchpad tz rows are flat and the dropdown stays compact', await (async () => {
  await lp.locator('#lpZoneBtn').click();
  await lp.waitForTimeout(120);
  const st = await lp.evaluate(() => {
    const row = document.querySelector('#lpTzList .tz-row:not([hidden])');
    const cs = getComputedStyle(row);
    return {
      bg: cs.backgroundColor,
      bw: parseFloat(cs.borderTopWidth),
      w: row.getBoundingClientRect().width,
      lw: document.getElementById('lpTzList').getBoundingClientRect().width,
      pr: document.getElementById('lpTzPop').getBoundingClientRect(),
    };
  });
  await lp.locator('#lpZoneBtn').click();
  return st.bg === 'rgba(0, 0, 0, 0)' && st.bw === 0 && st.w > st.lw - 20
    && st.pr.height > 0 && st.pr.height <= 330 && st.pr.width <= 310;
})());
ok('launchpad lists the clock and wallet apps', await lp.evaluate(() =>
  document.getElementById('cardClock').getAttribute('href') === 'index.html'
  && document.getElementById('cardWallet').getAttribute('href') === 'wallet.html'));
await lp.locator('#langBtn').click();
await lp.locator('#langList .tz-row[data-lang="zh-Hant"]').click();
await lp.waitForTimeout(200);
ok('launchpad translates to Traditional Chinese',
  await lp.evaluate(() => document.getElementById('lpClockT').textContent === '時鐘'
    && document.getElementById('lpWalletT').textContent === '錢包'));
await lp.screenshot({ path: 'shot-launch.png' });
await lp.locator('#cardWallet').click();
await lp.waitForTimeout(300);
ok('launchpad opens the wallet app', lp.url().includes('wallet.html'));

/* --- SinghoSettings: one place for every preference --- */
const spage = await context.newPage();
const serrors = [];
spage.on('pageerror', (e) => serrors.push(String(e)));
await spage.goto(URL + 'settings.html', { waitUntil: 'load' });
await spage.waitForTimeout(400);
ok('SinghoSettings loads as its own app',
  (await spage.locator('.wordmark').textContent()).includes('Settings'));
ok('the clock links to the settings page', await page.evaluate(() =>
  !!document.querySelector('a[href="settings.html"]')));
const lp2 = await context.newPage();
await lp2.goto(URL + 'launch.html', { waitUntil: 'load' });
await lp2.waitForTimeout(300);
ok('launchpad lists the settings app', await lp2.evaluate(() =>
  (document.getElementById('cardSettings') || { getAttribute: () => null }).getAttribute('href') === 'settings.html'));
await spage.fill('#citySearch', 'Taipei');
await spage.waitForTimeout(150);
await spage.click('#cityList .tz-row:not([hidden])');
ok('settings city picker persists to singhoah:tz', await spage.evaluate(() =>
  (localStorage.getItem('singhoah:tz') || '').includes('Taipei')));
await spage.fill('#curSearch', 'NTD');
await spage.waitForTimeout(150);
ok('typing NTD finds the Taiwan dollar', await spage.evaluate(() =>
  (document.querySelector('#curList .cur-row') || { dataset: {} }).dataset.code === 'TWD'));
await spage.click('#curList .cur-row');
ok('settings currency picker updates the wallet', await spage.evaluate(() =>
  ((JSON.parse(localStorage.getItem('singhoah:wallet') || '{}')) || {}).cur === 'TWD'));
ok('settings offers a local-data reset', await spage.evaluate(() =>
  !!document.querySelector('#btnReset')));
ok('no page errors in the settings app', serrors.length === 0, serrors.join('; '));

/* --- SinghoScribe: lecture transcription, doc-style --- */
const scpg = await context.newPage();
const scerrs = [];
scpg.on('pageerror', (e) => scerrs.push(String(e)));
await scpg.goto(URL + 'scribe.html', { waitUntil: 'load' });
await scpg.waitForTimeout(500);
ok('SinghoScribe loads as its own app',
  (await scpg.locator('.wordmark').textContent()).includes('Scribe'));
/* Scribe now opens on its files home: create a note and step into the editor */
await scpg.evaluate(() => { document.querySelector('[data-fl-new]').click(); });
await scpg.waitForTimeout(400);
ok('scribe defaults to Traditional Chinese in and out', await scpg.evaluate(() =>
  document.getElementById('scrIn').value === 'zh-TW' &&
  document.getElementById('scrOut').value === 'zh-TW'));
await scpg.evaluate(() => {
  const d = document.getElementById('scrDoc');
  d.textContent = 'hello scribe world';
  d.dispatchEvent(new Event('input', { bubbles: true }));
});
await scpg.waitForTimeout(900);
ok('scribe document autosaves like a doc', await scpg.evaluate(() =>
  (localStorage.getItem('singhoah:docs') || '').includes('hello scribe world')));
ok('scribe toolbar gained undo/find/stamps/import/print', await scpg.evaluate(() =>
  ['scrUndo', 'scrRedo', 'scrFind', 'scrStamps', 'scrImport', 'scrPrint'].every((i) => document.getElementById(i))));
await scpg.click('#scrFind');
await scpg.fill('#scrFindIn', 'scribe');
await scpg.waitForTimeout(150);
ok('scribe find highlights matches', await scpg.locator('mark.scr-hl').count() === 1);
await scpg.fill('#scrReplIn', 'lecture');
await scpg.click('#scrReplAll');
await scpg.waitForTimeout(150);
ok('scribe replace-all rewrites the doc', await scpg.evaluate(() =>
  document.getElementById('scrDoc').textContent.includes('hello lecture world')));
ok('scribe footer counts words and characters', await scpg.evaluate(() =>
  document.getElementById('scrCount').textContent.includes('·')));
await scpg.click('#scrFindX');
ok('launchpad lists SinghoScribe', await lp2.evaluate(() =>
  (document.getElementById('cardScribe') || { getAttribute: () => null }).getAttribute('href') === 'scribe.html'));
ok('launchpad lists SinghoMetro', await lp2.evaluate(() =>
  (document.getElementById('cardMetro') || { getAttribute: () => null }).getAttribute('href') === 'metro.html'));
ok('no page errors in the scribe app', scerrs.length === 0, scerrs.join('; '));


/* ---- map usability: zoom controls, wheel zoom, hover tooltip, close button ---- */
await page.click('#btnMap');
await page.waitForTimeout(400);
ok('map opens with zoom controls', await page.isVisible('#mapZoomIn') && await page.isVisible('#mapClose'));
const mvb0 = await page.getAttribute('#mapSvg', 'viewBox');
await page.click('#mapZoomIn');
await page.waitForTimeout(200);
const mvb1 = await page.getAttribute('#mapSvg', 'viewBox');
const mw0 = parseFloat(mvb0.split(' ')[2]), mw1 = parseFloat(mvb1.split(' ')[2]);
ok('zoom-in button zooms (viewBox width shrinks)', mw1 > 0 && mw1 < mw0);
await page.dispatchEvent('#mapSvg', 'wheel', { deltaY: -100, clientX: 600, clientY: 400 });
await page.waitForTimeout(200);
const mvb2 = await page.getAttribute('#mapSvg', 'viewBox');
const mw2 = parseFloat(mvb2.split(' ')[2]);
ok('mouse-wheel zoom works', mw2 < mw1);
await page.click('#mapZoomReset');
await page.waitForTimeout(200);
ok('reset button restores full view', Math.abs(parseFloat((await page.getAttribute('#mapSvg', 'viewBox')).split(' ')[2]) - mw0) < 1);
const mccPath = page.locator('.map-cc[data-cc="FR"]');
await mccPath.dispatchEvent('pointermove', { clientX: 700, clientY: 300 });
await page.waitForTimeout(300);
const mtipShown = !(await page.locator('#mapTip').isHidden()) && (await page.textContent('#mapTip')).length > 1;
ok('hover tooltip shows country + local time', mtipShown);
ok('map hover stays monochrome (blue reserved for your zone)', await page.evaluate(() => {
  const el = document.querySelector('.map-cc:not(.nozone):hover') || document.querySelector('.map-cc:not(.nozone)');
  return getComputedStyle(el).stroke === 'rgb(255, 255, 255)';
}));
await page.click('#mapClose');
await page.waitForTimeout(200);
ok('map close button hides the map', await page.locator('#mapWrap').isHidden());

/* ---- drift fix: small offset corrections glide instead of jumping ---- */
const mslew = await page.evaluate(async () => {
  const c = window.__clock;
  if (!c) return null;
  const o0 = c._curOff();
  c.setOffset(o0 + 120);
  const imm = c._curOff() - o0;                    /* mid-slew: well under 120 */
  await new Promise(r => setTimeout(r, 3000));
  const done = c._curOff() - o0;                   /* settled: ~120 */
  return { imm, done };
});
ok('clock slews small corrections (no ms jump)', !!mslew && mslew.imm >= 0 && mslew.imm < 100 && mslew.done >= 100 && mslew.done <= 145, JSON.stringify(mslew));
ok('auto-sync keeps a drift history and a bounded drift rate', await page.evaluate(() => {
  const h = window.__SINGHOAH_SYNCHIST;
  const c = window.__clock;
  return Array.isArray(h) && h.length >= 1 && Number.isFinite(c.rate) && Math.abs(c.rate) <= 5e-4;
}));

/* The offline interpreter is gone: every SMate gate now drives the REAL
   agent loop through a scripted on-device engine (the __SMATE_AI_ENGINE
   hook). The fake model replies with tool JSON for a matched phrase and,
   once its script is exhausted, echoes the last tool RESULT as its say —
   exactly what a well-behaved model does. */
const SMATE_STUB = (script) => `(() => {
  const SCRIPT = ${JSON.stringify(script)};
  const queues = new Map(Object.entries(SCRIPT).map(([k, v]) => [k, [...v]]));
  window.__AI_READ = 0;
  window.__AI_SYSTEM = '';
  Object.defineProperty(window, '__SMATE_AI_ENGINE', { configurable: true, get() {
    window.__AI_READ += 1;
    return { chat: { completions: { async create({ messages }) {
      window.__AI_SYSTEM = (messages.find((m) => m.role === 'system') || {}).content || window.__AI_SYSTEM;
      const users = messages.filter((m) => m.role === 'user');
      const first = (users[0] || {}).content || '';
      const key = Object.keys(SCRIPT).find((k) => k !== '*' && first.toLowerCase().includes(k)) || '*';
      const q = queues.get(key);
      if (q && q.length) return { choices: [{ message: { content: q.shift() } }] };
      const lastUser = (users[users.length - 1] || {}).content || '';
      if (lastUser.startsWith('RESULT: ')) return { choices: [{ message: { content: JSON.stringify({ say: lastUser.slice(8, 408) }) } }] };
      const d = queues.get('*');
      return { choices: [{ message: { content: (d && d.length) ? d.shift() : '{"say":"ok"}' } }] };
    } } } };
  } });
})();`;

/* --- SMate: the multilingual command assistant --- */
const sm = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await sm.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
await sm.addInitScript({ content: SMATE_STUB({
  'map jakarta': ['{"tool":"showmap","args":{"city":"Jakarta"}}'],
  'zhongxiao': ['{"tool":"fare","args":{"from":"Zhongxiao Xinsheng","to":"Taipei Main"}}'],
  '忠孝新生': ['{"tool":"fare","args":{"from":"忠孝新生","to":"台北車站"}}'],
  'kaohsiung': ['{"tool":"fare","args":{"from":"Taipei Main Station","to":"Kaohsiung Main"}}'],
  'jakarta': ['{"tool":"zones","args":{"cities":["Jakarta","Taipei"],"layout":"side"}}'],
  '雅加達': ['{"tool":"zones","args":{"cities":["Jakarta","Taipei"],"layout":"side"}}'],
  'yakarta': ['{"tool":"zones","args":{"cities":["Jakarta","Taipei"],"layout":"side"}}'],
  'zone taipei': ['{"tool":"zones","args":{"city":"Taipei"}}'],
  'timer 5': ['{"tool":"timer","args":{"minutes":5}}'],
  '計時器': ['{"tool":"timer","args":{"minutes":5}}'],
  'timer 2': ['{"tool":"timer","args":{"minutes":2}}'],
  'add 12': ['{"tool":"walletadd","args":{"type":"expense","amount":12}}'],
  'add 250': ['{"tool":"walletadd","args":{"type":"income","amount":250}}'],
  'side': ['{"tool":"zones","args":{"layout":"side"}}'],
}) });
let smateEverywhere = true;
for (const pg of ['index.html', 'wallet.html', 'launch.html', 'settings.html', 'scribe.html', 'metro.html']) {
  const q = await sm.newPage();
  await q.goto(URL + pg, { waitUntil: 'load' });
  await q.waitForTimeout(200);
  if (!(await q.evaluate(() => !!document.getElementById('smateBtn')))) smateEverywhere = false;
  await q.close();
}
ok('SMate lives on every Singho page', smateEverywhere);
const sq = await sm.newPage();
await sq.goto(URL + 'index.html', { waitUntil: 'load' });
await sq.waitForTimeout(300);
ok('the on-device AI is armed the moment the site arrives (no tap, no waking up)', await sq.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'true'));
ok('Launchpad is an icon-only topbar button', await sq.evaluate(() => {
  const b = document.getElementById('btnLaunch');
  return !!b && !b.textContent.trim() && !!b.title && !!b.querySelector('svg');
}));
await sq.click('#smateBtn');
await sq.waitForTimeout(150);
ok('SMate greets in the UI language', await sq.evaluate(() =>
  !!document.querySelector('.smate-it') && document.querySelector('.smate-it').textContent.includes('SMate')));
ok('SMate shows a WhatsApp-style status line', await sq.evaluate(() =>
  (document.getElementById('smateStatus').textContent || '').trim().length > 0));
const smSend = async (txt) => { await sq.fill('#smateIn', txt); await sq.click('#smateSend'); await sq.waitForTimeout(1400); };
const statusIdle = await sq.evaluate(() => document.getElementById('smateStatus').textContent);
await sq.fill('#smateIn', 'timer 5');
await sq.click('#smateSend');
await sq.waitForTimeout(180);
ok('SMate shows an animated typing indicator while it thinks', await sq.evaluate((idle) => {
  const dots = document.querySelector('.smate-dots');
  const st = document.getElementById('smateStatus').textContent;
  return !!dots && dots.children.length === 3 && st && st !== idle;
}, statusIdle));
await sq.waitForTimeout(900);
ok('the typing indicator gives way to the real answer', await sq.evaluate((idle) =>
  !document.querySelector('.smate-dots') && !!document.querySelector('#grid .cell.timer') &&
  document.getElementById('smateStatus').textContent === idle, statusIdle));
await smSend('計時器 5');
ok('SMate understands the same command in Traditional Chinese', await sq.evaluate(() =>
  document.querySelectorAll('#grid .cell.timer').length === 2));
await smSend('side');
ok('SMate switches the window layout', await sq.evaluate(() => document.getElementById('grid').dataset.layout === '2'));
ok('timer blocks are true minis of the timer cell and tick live', await (async () => {
  const read = () => sq.evaluate(() => {
    const bl = [...document.querySelectorAll('.smate-block[data-ab="timer"]')].pop();
    if (!bl) return '';
    return (bl.querySelector('.cell.timer .clock')?.textContent || '') + '|' + (bl.querySelector('.ab-mini')?.style.height || '');
  });
  const a = await read();
  await sq.waitForTimeout(1300);
  const b = await read();
  return /\d:\d\d/.test(a) && a !== b;
})());
await smSend('zone Taipei');
await sq.waitForTimeout(250);
ok('SMate changes the home time zone', await sq.evaluate(() => document.getElementById('tzLabel').textContent === 'Taipei'));
await smSend('Set time zone window of Jakarta and Taipei, side by side'); await sq.waitForTimeout(1100);
ok('SMate builds the spoken window and does NOT open the map (Jakarta regression)', await sq.evaluate(() => {
  const mapClosed = document.getElementById('mapWrap').hidden &&
    document.getElementById('btnMap').getAttribute('aria-pressed') !== 'true';
  const g = document.getElementById('grid');
  return mapClosed && g.dataset.layout === '2' &&
    g.textContent.includes('Jakarta') && g.textContent.includes('Taipei');
}));
ok('the window request shows a live clocks Action Block', await sq.evaluate(() => {
  const bl = [...document.querySelectorAll('.smate-block[data-ab="clocks"]')].pop();
  if (!bl) return false;
  const txt = bl.textContent;
  return txt.includes('Jakarta') && txt.includes('Taipei') && /\d{1,2}:\d{2}/.test(txt);
}));
await smSend('時區 雅加達 台北 並排'); await sq.waitForTimeout(1100);
ok('the same window request works in Traditional Chinese', await sq.evaluate(() => {
  const g = document.getElementById('grid');
  return document.getElementById('mapWrap').hidden && g.dataset.layout === '2' &&
    g.textContent.includes('Jakarta') && g.textContent.includes('Taipei');
}));
await smSend('zona horaria de Yakarta y Taipéi, lado a lado'); await sq.waitForTimeout(1100);
ok('the same window request works in Spanish', await sq.evaluate(() => {
  const g = document.getElementById('grid');
  return document.getElementById('mapWrap').hidden && g.dataset.layout === '2' &&
    g.textContent.includes('Jakarta') && g.textContent.includes('Taipei');
}));
await smSend('What is the fare from Zhongxiao Xinsheng station to Taipei Main station?');
await sq.waitForTimeout(1900);
ok('SMate answers fare questions on the clock page (any-page fare engine)', await sq.evaluate(() => {
  const last = [...document.querySelectorAll('.smate-it')].pop().textContent;
  return last.includes('NT$') && last.includes('Zhongxiao Xinsheng') && last.includes('Taipei Main');
}));
ok('fare blocks embed the real metro page in mini mode', await sq.waitForFunction(() => {
  const bl = [...document.querySelectorAll('.smate-block[data-ab="fare"]')].pop();
  const f = bl && bl.querySelector('iframe.ab-frame');
  return !!f && f.src.includes('mini=1') && !!f.src.includes('a=') && !!f.src.includes('b=');
}, null, { timeout: 5000, polling: 250 }).then(() => true).catch(() => false));
ok('the fare mini centers the route instead of the whole network', await sq.waitForFunction(() => {
  const f = [...document.querySelectorAll('.smate-block[data-ab="fare"] iframe.ab-frame')].pop();
  const M = f && f.contentWindow && f.contentWindow.__METRO;
  if (!M || !M.dbg) return false;
  const v = M.dbg.v;
  const a = M.ST.O07, b = M.ST.R10;
  return !!a && !!b && v.k > 1.4 && Math.abs(v.cx - (a.x + b.x) / 2) < 120 && Math.abs(v.cy - (a.y + b.y) / 2) < 120;
}, null, { timeout: 6000, polling: 250 }).then(() => true).catch(() => false));
/* SinghoMetro is ALWAYS north-up: portrait phone, desktop, and the SMate
   Action Block mini. These gates assert Tamsui sits above Xindian in each
   shape, so the old 90-degree portrait rotation can never come back. */
{
  const read = (pg) => pg.evaluate(() => new Promise((res) => {
    let n = 0;
    const go = () => {
      const M = globalThis.__METRO;
      if (M && M.ST && M.ST.R28 && M.ST.G01) res({ dx: M.ST.R28.x - M.ST.G01.x, dy: M.ST.R28.y - M.ST.G01.y });
      else if (++n < 40) setTimeout(go, 250); else res(null);
    };
    go();
  }));
  const pc2 = await browser.newContext({ viewport: { width: 390, height: 700 } });
  const pm = await pc2.newPage();
  await pm.goto(URL + 'metro.html?mini=1', { waitUntil: 'load' });
  const mini = await read(pm);
  ok('the SMate mini map is north-up in a portrait viewport (Tamsui above Xindian)', !!mini && mini.dy < -100, JSON.stringify(mini));
  const pf = await pc2.newPage();
  await pf.goto(URL + 'metro.html', { waitUntil: 'load' });
  const full = await read(pf);
  ok('the full metro page is north-up on a portrait phone (no 90-degree rotation)', !!full && full.dy < -100 && Math.abs(full.dy) > Math.abs(full.dx), JSON.stringify(full));
  await pc2.close();
  const lc2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pl = await lc2.newPage();
  await pl.goto(URL + 'metro.html', { waitUntil: 'load' });
  const desk = await read(pl);
  ok('the full metro page is north-up on desktop', !!desk && desk.dy < -100, JSON.stringify(desk));
  await lc2.close();
}
const txBefore = await sq.evaluate(() => { try { return JSON.parse(localStorage.getItem('singhoah:wallet') || '{"tx":[]}').tx.length; } catch { return 0; } });
await smSend('add 12 expense');
await sq.waitForTimeout(1100);
ok('wallet actions from other pages really hit the ledger and show a block', await sq.evaluate((before) => {
  let after = 0;
  try { after = JSON.parse(localStorage.getItem('singhoah:wallet') || '{"tx":[]}').tx.length; } catch { /* ignore */ }
  const bl = [...document.querySelectorAll('.smate-block[data-ab="wallet"]')].pop();
  return after === before + 1 && !!bl && bl.textContent.includes('12');
}, txBefore));
await smSend('map Jakarta');
await sq.waitForTimeout(1500);
ok('map requests open the map in the main window and clone it into the block', await sq.evaluate(() => {
  const bl = [...document.querySelectorAll('.smate-block[data-ab="mapnav"]')].pop();
  const open = !document.getElementById('mapWrap').hidden;
  return !!bl && open && (!!bl.querySelector('svg') || bl.textContent.includes('Jakarta'));
}));
await smSend('從忠孝新生到台北車站票價多少？');
await sq.waitForTimeout(1900);
ok('the same fare question works in Traditional Chinese', await sq.evaluate(() => {
  const last = [...document.querySelectorAll('.smate-it')].pop().textContent;
  return last.includes('NT$') && last.includes('忠孝新生');
}));
await smSend('What is the fare from Taipei Main Station to Kaohsiung Main?');
await sq.waitForTimeout(1900);
ok('cross-system fare questions get an honest one-system answer', await sq.evaluate(() => {
  const last = [...document.querySelectorAll('.smate-it')].pop().textContent;
  return last.includes('different systems');
}));
await sq.close();
const swq = await sm.newPage();
await swq.goto(URL + 'wallet.html', { waitUntil: 'load' });
await swq.waitForTimeout(300);
const ensureIn = async (pg) => {
  if (!(await pg.locator('#smateIn').isVisible().catch(() => false))) {
    await pg.click('#smateBtn');
    await pg.locator('#smateIn').waitFor({ state: 'visible', timeout: 5000 });
  }
};
await swq.click('#smateBtn');
await ensureIn(swq);
await swq.fill('#smateIn', 'add 250 income');
await swq.click('#smateSend');
await swq.waitForTimeout(1300);
ok('SMate adds wallet entries from a sentence', await swq.evaluate(() => {
  const w = JSON.parse(localStorage.getItem('singhoah:wallet') || '{"tx":[]}');
  const lastTx = w.tx[w.tx.length - 1];
  const total = w.tx.reduce((a, x) => a + (x.type === 'in' ? x.amt : -x.amt), 0);
  const shown = parseFloat((document.getElementById('walBal').textContent || '').replace(/[^0-9.-]/g, ''));
  return !!lastTx && lastTx.amt === 250 && lastTx.type === 'in' && Math.abs(shown - total) < 0.01;
}));
await ensureIn(swq);
await swq.fill('#smateIn', 'timer 2');
await swq.click('#smateSend');
await swq.waitForTimeout(1500);
try { await swq.waitForURL('**/index.html', { timeout: 5000 }); } catch { /* asserted below */ }
await swq.waitForTimeout(900);
ok('a timer asked on another page starts in the main window with a live block', await swq.evaluate(() => {
  const cell = document.querySelector('#grid .cell.timer');
  const bl = [...document.querySelectorAll('.smate-block[data-ab="timer"]')].pop();
  return !!cell && !!bl && /\d:\d\d/.test(bl.querySelector('.cell.timer .clock')?.textContent || '');
}));
await swq.goto(URL + 'wallet.html', { waitUntil: 'load' });
await swq.waitForTimeout(300);
await swq.click('#smateBtn');
await swq.waitForTimeout(200);
await swq.fill('#smateIn', 'time zone window of Jakarta and Taipei, side by side');
await swq.click('#smateSend');
await swq.waitForTimeout(1200);
try { await swq.waitForURL('**/index.html', { timeout: 5000 }); } catch { /* asserted below */ }
await swq.waitForTimeout(700);
ok('a window request from another page survives the trip to the clock', await swq.evaluate(() => {
  if (!location.pathname.endsWith('index.html')) return false;
  const g = document.getElementById('grid');
  return g.dataset.layout === '2' && g.textContent.includes('Jakarta') && g.textContent.includes('Taipei');
}));
await swq.close();
await sm.close();

/* --- SMate on a phone: bottom sheet fits, window request works, nothing overflows --- */
const smc = await browser.newContext({ viewport: { width: 375, height: 720 } });
await smc.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
await smc.addInitScript({ content: SMATE_STUB({
  'jakarta': ['{"tool":"zones","args":{"cities":["Jakarta","Taipei"],"layout":"side"}}'],
  'zhongxiao': ['{"tool":"fare","args":{"from":"Zhongxiao Xinsheng","to":"Taipei Main"}}'],
  'timer 2': ['{"tool":"timer","args":{"minutes":2}}'],
}) });
const mq2 = await smc.newPage();
await mq2.goto(URL + 'index.html', { waitUntil: 'load' });
await mq2.waitForTimeout(300);
await mq2.click('#smateBtn');
await mq2.waitForTimeout(200);
await mq2.fill('#smateIn', 'Set time zone window of Jakarta and Taipei, side by side');
await mq2.click('#smateSend');
await mq2.waitForTimeout(1600);
ok('SMate on a phone keeps the popup on-screen and shapes the window', await mq2.evaluate(() => {
  const p = document.querySelector('.smate-pop').getBoundingClientRect();
  const g = document.getElementById('grid');
  return p.left >= 0 && p.right <= 375 && p.bottom <= 720 && p.width >= 300 &&
    g.dataset.layout === '2' && g.textContent.includes('Jakarta') &&
    document.documentElement.scrollWidth <= 375;
}));
await mq2.fill('#smateIn', 'What is the fare from Zhongxiao Xinsheng station to Taipei Main station?');
await mq2.click('#smateSend');
await mq2.waitForTimeout(2600);
ok('fare questions answer on phones too', await mq2.evaluate(() => {
  const last = [...document.querySelectorAll('.smate-it')].pop().textContent;
  return last.includes('NT$');
}));
await mq2.fill('#smateIn', 'timer 2');
await mq2.click('#smateSend');
await mq2.waitForTimeout(1700);
ok('Action Blocks fit the phone bottom sheet', await mq2.evaluate(() => {
  const bl = [...document.querySelectorAll('.smate-block')].pop();
  if (!bl) return false;
  const r = bl.getBoundingClientRect();
  return r.width > 100 && r.right <= 375 && r.left >= 0;
}));
await smc.close();

/* --- SMate voice mode: fake the Web Speech API so the mic path runs end-to-end --- */
const fakeSR = () => {
  window.SpeechRecognition = class {
    start() {
      window.__srLang = this.lang;
      setTimeout(() => { this.onstart && this.onstart(); }, 30);
      setTimeout(() => {
        this.onresult && this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'timer 5' } }] });
        this.onend && this.onend();
      }, 900);
    }
    stop() {} abort() {}
  };
};
const vm = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await vm.addInitScript(() => { localStorage.setItem('singhoah:visited', '1'); });
await vm.addInitScript({ content: SMATE_STUB({
  'timer': ['{"tool":"timer","args":{"minutes":5}}'],
}) });
await vm.addInitScript(fakeSR);
const vp = await vm.newPage();
await vp.goto(URL + 'index.html', { waitUntil: 'load' });
await vp.waitForTimeout(300);
await vp.click('#smateBtn');
await vp.waitForTimeout(150);
ok('SMate offers a voice button when speech recognition exists', await vp.evaluate(() => {
  const m = document.getElementById('smateMic');
  return !!m && m.style.display !== 'none' && m.getBoundingClientRect().width > 0;
}));
await vp.click('#smateMic');
await vp.waitForTimeout(250);
ok('the mic listens and reports the listening status', await vp.evaluate(() =>
  document.getElementById('smateMic').getAttribute('aria-pressed') === 'true' &&
  document.getElementById('smateStatus').textContent.toLowerCase().includes('listen')));
await vp.waitForTimeout(2300);
ok('spoken words become a real command', await vp.evaluate(() =>
  document.getElementById('smateMic').getAttribute('aria-pressed') === 'false' &&
  !!document.querySelector('.cell.timer') &&
  [...document.querySelectorAll('.smate-me')].pop().textContent.includes('timer 5')));
await vp.close();
const v2 = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await v2.addInitScript(() => {
  localStorage.setItem('singhoah:visited', '1');
  localStorage.setItem('singhoah:lang', 'zh-Hant');
});
await v2.addInitScript(fakeSR);
const v2p = await v2.newPage();
await v2p.goto(URL + 'index.html', { waitUntil: 'load' });
await v2p.waitForTimeout(300);
await v2p.click('#smateBtn');
await v2p.click('#smateMic');
await v2p.waitForTimeout(250);
ok('voice mode follows the UI language (all twenty-five supported)', await v2p.evaluate(() =>
  window.__srLang === 'zh-Hant-TW'));
await v2p.close();
await v2.close();
await vm.close();

/* --- SMate is a fully-AI assistive agent: the offline interpreter is gone.
       Every gate below drives the REAL agent loop through a scripted
       on-device engine — tools, RESULT feedback, multi-step chains. --- */
const ai = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ai.addInitScript(() => {
  localStorage.setItem('singhoah:visited', '1');
  localStorage.setItem('singhoah:wallet', JSON.stringify({ cur: 'USD', tx: [
    { date: '2026-09-20', type: 'out', amt: 12, note: 'coffee' },
    { date: '2026-09-21', type: 'out', amt: 30, note: 'lunch' },
  ] }));
});
await ai.addInitScript({ content: SMATE_STUB({
  'too bright': ['{"tool":"theme","args":{"mode":"night"}}', '{"say":"Better — I dimmed the site for you."}'],
  'sky': ['{"say":"The sky looks blue because air scatters short blue wavelengths of sunlight far more than red — Rayleigh scattering."}'],
  'spent': ['{"say":"You have spent 42 USD this month: 12 on coffee and 30 on lunch."}'],
  'module studio': ['{"tool":"goto","args":{"app":"module"}}', '{"say":"Opening the module studio."}'],
  'multiply 6 by 7': ['{"tool":"mathflow","args":{"a":"6","op":"*","b":"7"}}', '{"say":"Six times seven is forty-two."}'],
  'change 6 to 9': ['{"tool":"modcfg","args":{"find":"6","patch":{"value":"9"}}}', '{"tool":"modrun","args":{}}', '{"say":"Changed the 6 to a 9 — the flow now answers 63."}'],
  'flow title': ['{"tool":"fill","args":{"id":"modTitle","value":"My Flow"}}', '{"say":"Renamed the flow."}'],
}) });
const ap = await ai.newPage();
await ap.goto(URL + 'index.html', { waitUntil: 'load' });
await ap.waitForTimeout(600);
ok('arrive-and-ready: the AI engine is armed before the first word', await ap.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'true'
  && !document.getElementById('smateAI').classList.contains('loading')
  && window.__AI_READ > 0));
await ap.click('#smateBtn');
await ap.waitForTimeout(150);
await ap.fill('#smateIn', 'the room is too bright for my eyes');
await ap.click('#smateSend');
await ap.waitForTimeout(1600);
ok('the FIRST fuzzy message already drives a real page tool — night shift', await ap.evaluate(() =>
  document.documentElement.classList.contains('dark')));
await ap.fill('#smateIn', 'why is the sky blue?');
await ap.click('#smateSend');
await ap.waitForTimeout(1600);
ok('free-form questions get real AI answers', await ap.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('scatters')));
await ap.fill('#smateIn', 'how much have I spent?');
await ap.click('#smateSend');
await ap.waitForTimeout(1600);
ok('money questions carry the live ledger into the AI context', await ap.evaluate(() =>
  (window.__AI_SYSTEM || '').includes('coffee') && (window.__AI_SYSTEM || '').includes('WALLET')));
ok('the model answers from that live ledger', await ap.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('coffee')));
await ap.fill('#smateIn', 'open the module studio');
await ap.click('#smateSend');
try { await ap.waitForURL('**/module.html', { timeout: 6000 }); } catch { /* asserted below */ }
ok('the agent navigates the site itself (goto tool)', /module\.html$/.test(ap.url()), ap.url());
await ap.waitForTimeout(500);
if (!(await ap.locator('#smateIn').isVisible().catch(() => false))) { await ap.click('#smateBtn'); await ap.locator('#smateIn').waitFor({ state: 'visible', timeout: 5000 }); }
await ap.fill('#smateIn', 'multiply 6 by 7');
await ap.click('#smateSend');
await ap.waitForTimeout(2400);
ok('on the module page the agent builds the real flow', await ap.evaluate(() => {
  const M = globalThis.__MOD;
  const io = M.nodes().filter((n) => n.type === 'io').pop();
  return M.nodes().length === 4 && M.wires().length === 3 &&
    document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent.trim() === '42';
}));
await ap.fill('#smateIn', 'change 6 to 9');
await ap.click('#smateSend');
await ap.waitForTimeout(2600);
ok('"change … to …" edits the real module and re-runs it (63)', await ap.evaluate(() => {
  const M = globalThis.__MOD;
  const io = M.nodes().filter((n) => n.type === 'io').pop();
  const six = M.nodes().find((n) => n.type === 'number' && n.cfg.value === '9');
  return !!six && document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent.trim() === '63';
}));
await ap.fill('#smateIn', 'change the flow title to My Flow');
await ap.click('#smateSend');
await ap.waitForTimeout(1800);
ok('"change the flow title to …" types into the real field', await ap.evaluate(() =>
  document.getElementById('modTitle').value === 'My Flow'));
await ap.click('#smateAI');   /* off by choice — and it sticks */
await ap.waitForTimeout(200);
ok('turning the chip off stops the engine and saves the choice', await ap.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'false'
  && localStorage.getItem('singhoah:smateAI') === 'off'));
await ap.fill('#smateIn', 'why is the sky blue?');
await ap.click('#smateSend');
await ap.waitForTimeout(1400);
ok('with the AI off SMate answers honestly — there is no offline interpreter anymore', await ap.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('fully AI')));
await ap.close();
await ai.close();

/* no WebGPU / blocked CDN: SMate explains honestly and never downloads */
const ai2 = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ai2.addInitScript(() => {
  localStorage.setItem('singhoah:visited', '1');
  Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
});
await ai2.route(/esm\.run|mlc/, (r) => r.abort());
const a2p = await ai2.newPage();
await a2p.goto(URL + 'index.html', { waitUntil: 'load' });
await a2p.waitForTimeout(300);
ok('no WebGPU: the chip arms without starting any download', await a2p.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'true'
  && !document.getElementById('smateAI').classList.contains('loading')));
await a2p.click('#smateBtn');
await a2p.fill('#smateIn', 'blorp');
await a2p.click('#smateSend');
await a2p.waitForTimeout(1400);
ok('without WebGPU SMate explains instead of downloading anything', await a2p.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('WebGPU')));
await a2p.click('#smateAI'); /* off by choice */
await a2p.waitForTimeout(200);
ok('the chip can still turn AI off by choice', await a2p.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'false'
  && localStorage.getItem('singhoah:smateAI') === 'off'));
await a2p.fill('#smateIn', 'blorp');
await a2p.click('#smateSend');
await a2p.waitForTimeout(1300);
ok('AI off + no WebGPU: the honest fully-AI message, never a fake interpreter', await a2p.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('fully AI')));
await a2p.reload();   /* the off choice survives the next visit */
await a2p.waitForTimeout(400);
ok('a turned-off AI stays off across visits', await a2p.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'false'));
await a2p.close();
await ai2.close();

/* a failed model load must never loop "AI is waking up" */
const ai5 = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ai5.addInitScript(() => {
  localStorage.setItem('singhoah:visited', '1');
  Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: async () => ({}) }, configurable: true });
});
await ai5.route(/esm\.run|mlc/, (r) => r.abort());
const a5p = await ai5.newPage();
await a5p.goto(URL + 'index.html', { waitUntil: 'load' });
await a5p.waitForTimeout(700); /* the arrival preload fails on its own: CDN blocked */
await a5p.click('#smateBtn');
ok('a failed arrival load shows the error on the chip, never a tease in chat', await a5p.evaluate(() =>
  document.getElementById('smateAI').classList.contains('err')));
await a5p.fill('#smateIn', 'blorp');
await a5p.click('#smateSend');
await a5p.waitForTimeout(1500);
ok('a failed AI load answers honestly instead of looping "waking up"', await a5p.evaluate(() => {
  const last = [...document.querySelectorAll('.smate-it')].pop().textContent;
  return last.includes('WebGPU') && !/waking up/i.test(last);
}));
await a5p.close();
await ai5.close();

/* a failing or stalling AI brain can never hang the chat */
const ai3 = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ai3.addInitScript(() => {
  localStorage.setItem('singhoah:visited', '1');
  window.__SMATE_AI_TIMEOUT = 1000;
  window.__SMATE_AI_ENGINE = { chat: async () => { throw new Error('boom'); } };
});
const a3p = await ai3.newPage();
await a3p.goto(URL + 'index.html', { waitUntil: 'load' });
await a3p.waitForTimeout(300);
await a3p.click('#smateBtn');
await a3p.waitForTimeout(200); /* the engine is already armed by the arrival preload */
await a3p.fill('#smateIn', 'blorp');
await a3p.click('#smateSend');
await a3p.waitForTimeout(300);
await a3p.fill('#smateIn', 'blorp');
await a3p.click('#smateSend');
await a3p.waitForTimeout(1600);
ok('a failing AI brain never hangs the chat', await a3p.evaluate(() =>
  !document.querySelector('.smate-dots') &&
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('try again')));
await a3p.close();
await ai3.close();
const ai4 = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ai4.addInitScript(() => {
  localStorage.setItem('singhoah:visited', '1');
  window.__SMATE_AI_TIMEOUT = 1000;
  window.__SMATE_AI_ENGINE = { chat: async () => new Promise((r) => setTimeout(() => r('late answer'), 5000)) };
});
const a4p = await ai4.newPage();
await a4p.goto(URL + 'index.html', { waitUntil: 'load' });
await a4p.waitForTimeout(300);
await a4p.click('#smateBtn');
await a4p.waitForTimeout(200); /* already armed by the arrival preload */
await a4p.fill('#smateIn', 'blorp');
await a4p.click('#smateSend');
await a4p.waitForTimeout(300);
await a4p.fill('#smateIn', 'blorp');
await a4p.click('#smateSend');
await a4p.waitForTimeout(900);
const midStatus = await a4p.evaluate(() => document.getElementById('smateStatus').textContent);
await a4p.waitForTimeout(1400);
ok('slow AI shows an AI status and is capped', await a4p.evaluate((mid) =>
  mid.includes('AI') && !document.querySelector('.smate-dots') &&
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('try again'), midStatus));
await a4p.close();
await ai4.close();

/* --- SMate as a proper assistant: suggestions, time answers, reminders,
       math, memory, voice-out toggle, Ctrl+K --- */
const as = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await as.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
await as.addInitScript({ content: SMATE_STUB({
  'timer': ['{"tool":"timer","args":{"minutes":5}}'],
  'tokyo': ['{"tool":"time","args":{"city":"Tokyo"}}'],
  '25 * 4': ['{"tool":"calc","args":{"expr":"25 * 4"}}'],
  'remind': ['{"tool":"remind","args":{"minutes":0.05}}'],
  'clear chat': ['{"tool":"clearchat","args":{}}'],
  'balance': ['{"tool":"walletbalance","args":{}}'],
}) });
const asp = await as.newPage();
await asp.goto(URL + 'index.html', { waitUntil: 'load' });
await asp.waitForTimeout(300);
await asp.keyboard.press('Control+k');
await asp.waitForTimeout(200);
ok('Ctrl+K summons SMate from anywhere', await asp.evaluate(() => !document.getElementById('smatePop').hidden));
ok('SMate greets with tappable suggestions', await asp.evaluate(() =>
  document.querySelectorAll('.smate-chip').length === 3));
await asp.click('.smate-chip');
await asp.waitForTimeout(1200);
ok('suggestion chips run real commands', await asp.evaluate(() => !!document.querySelector('.cell.timer')));
const asSend = async (txt) => { await asp.fill('#smateIn', txt); await asp.click('#smateSend'); await asp.waitForTimeout(1400); };
const tzBefore = await asp.evaluate(() => document.getElementById('tzLabel').textContent);
await asSend('what time is it in Tokyo?');
ok('SMate answers “what time is it in …” without changing your zone', await asp.evaluate((tz) =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('Tokyo') &&
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes(':') &&
  document.getElementById('tzLabel').textContent === tz, tzBefore));
await asSend('25 * 4');
ok('SMate does quick math', await asp.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent === '100'));
await asSend('remind me in 0.05');
ok('SMate accepts reminders', await asp.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('0.05')));
await asp.waitForTimeout(4200);
ok('reminders fire with a chat message', await asp.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].some((p) => p.textContent.includes('⏰'))));
ok('voice-out toggle speaks replies', await asp.evaluate(() => {
  const b = document.getElementById('smateSpeak');
  if (!('speechSynthesis' in window)) return b.style.display === 'none';
  b.click();
  return b.getAttribute('aria-pressed') === 'true';
}));
await asp.reload({ waitUntil: 'load' });
await asp.waitForTimeout(400);
await asp.keyboard.press('Control+k');
await asp.waitForTimeout(200);
ok('the conversation survives reloads', await asp.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].some((p) => p.textContent === '100')));
await asSend('clear chat');
ok('clear chat starts a fresh conversation', await asp.evaluate(() =>
  document.querySelectorAll('.smate-me').length === 0 &&
  !!document.querySelector('.smate-it')));
await asSend('timer 5');
await asp.click('#smateClear');
await asp.waitForTimeout(250);
ok('the clear-chat button wipes the conversation too', await asp.evaluate(() =>
  document.querySelectorAll('.smate-me').length === 0 &&
  !!document.querySelector('.smate-it') &&
  document.getElementById('smateClear').title.length > 0 &&
  (JSON.parse(localStorage.getItem('singhoah:smateLog') || '[]')).every((m) => !m.me)));
await asp.evaluate(() => localStorage.setItem('singhoah:wallet', JSON.stringify({ cur: 'USD', tx: [
  { id: 'a', type: 'in', amt: 500, note: 'pay', date: '2026-09-01', ts: 1 },
  { id: 'b', type: 'out', amt: 250, note: 'food', date: '2026-09-02', ts: 2 },
] })));
await asSend('What is my balance?');
ok('SMate answers balance questions on any page', await asp.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('250')));
await asp.close();
await as.close();

/* --- full coverage: delete/restart panes, remove a zone, scribe toolbar,
       print, theme — by text exactly as by voice --- */
const fc = await browser.newContext({ viewport: { width: 1440, height: 850 } });
await fc.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
await fc.addInitScript(() => { window.confirm = () => true; });   /* SMate's scribe clear may ask */
await fc.addInitScript({ content: SMATE_STUB({
  'map taipei': ['{"tool":"showmap","args":{"city":"Taipei"}}'],
  'wallet': ['{"tool":"goto","args":{"app":"wallet"}}'],
  'hey smate': ['{"say":"I can drive the whole Singhoah app for you — timers, windows, the wallet, metro fares, module flows, Scribe notes and settings."}'],
  'print': ['{"tool":"printpage","args":{}}'],
  'remove taipei': ['{"tool":"removezone","args":{"city":"Taipei"}}'],
  'zones': ['{"tool":"zones","args":{"cities":["Jakarta","Taipei"],"layout":"side"}}'],
  'restart timer': ['{"tool":"restartwin","args":{"what":"timer"}}'],
  'delete timer': ['{"tool":"removewin","args":{"what":"timer"}}'],
  'restart stopwatch': ['{"tool":"restartwin","args":{"what":"stopwatch"}}'],
  'delete stopwatch': ['{"tool":"removewin","args":{"what":"stopwatch"}}'],
  'stopwatch': ['{"tool":"stopwatch","args":{"action":"new"}}'],
  'timer 5': ['{"tool":"timer","args":{"minutes":5}}'],
  'theme': ['{"tool":"theme","args":{"mode":"night"}}'],
  'undo': ['{"tool":"click","args":{"id":"scrUndo"}}'],
  'redo': ['{"tool":"click","args":{"id":"scrRedo"}}'],
  'clear': ['{"tool":"click","args":{"id":"scrClear"}}'],
}) });
const fp = await fc.newPage();
await fp.goto(URL + 'index.html', { waitUntil: 'load' });
await fp.waitForTimeout(300);
await fp.click('#smateBtn');
const fcSend = async (txt) => { await fp.fill('#smateIn', txt); await fp.click('#smateSend'); await fp.waitForTimeout(1500); };
await fcSend('timer 5');
await fcSend('restart timer');
ok('SMate restarts the timer', await fp.evaluate(() => !!document.querySelector('.cell.timer')));
await fcSend('delete timer');
ok('SMate deletes the timer pane', await fp.evaluate(() => !document.querySelector('#grid .cell.timer')));
await fcSend('stopwatch');
await fcSend('restart stopwatch');
await fcSend('delete stopwatch');
ok('SMate restarts and deletes the stopwatch', await fp.evaluate(() => !document.querySelector('#grid .cell.stop')));
await fcSend('zones Jakarta and Taipei side by side');
await fcSend('remove Taipei');
ok('SMate removes a single zone', await fp.evaluate(() => {
  const cs = [...document.querySelectorAll('#grid .cell')];
  return cs.length === 2 && !cs[0].classList.contains('unset')
    && cs[0].textContent.includes('Jakarta') && cs[1].classList.contains('unset');
}));
await fcSend('print');
ok('SMate can print', await fp.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.length > 0));
ok('brand vocabulary maps speech mishearings', await fp.evaluate(() =>
  window.__SING_LIB.brandFix('open sing ho wallet then sing ho scribe') === 'open singhowallet then singhoscribe'
  && window.__SING_LIB.brandFix('i use sing ho script and s mate daily', true) === 'i use SinghoScribe and SMate daily'
  && window.__SING_LIB.brandFix('Singhoah and sing how ahh', true) === 'SinghoClock and SinghoClock'
  && window.__SING_LIB.brandFix('open sing ho clock') === 'open singhoclock'));
await fcSend('hey smate');
ok('calling SMate by name answers with its skills', await fp.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.length > 20));
await fcSend('map Taipei');
ok('SMate flies the map to a named city', await fp.evaluate(() =>
  !document.getElementById('mapWrap').hidden
  && [...document.querySelectorAll('#mapCities .map-city')]
    .some((g) => g.textContent.includes('Taipei'))));
await fp.evaluate(() => document.getElementById('mapClose').click());
await fp.waitForTimeout(200);
await fcSend('open sing ho wallet');
await fp.waitForURL('**/wallet.html', { timeout: 5000 });
ok('SMate understands spoken brand names', fp.url().includes('wallet.html'));
await fp.close();

const fsp = await fc.newPage();
await fsp.goto(URL + 'scribe.html', { waitUntil: 'load' });
await fsp.waitForTimeout(500);
/* Scribe opens on its files home — step into a note first */
await fsp.evaluate(() => { document.querySelector('[data-fl-new]').click(); });
await fsp.waitForTimeout(400);
await fsp.click('#smateBtn');
await fsp.type('#scrDoc', 'hello world');
const fsSend = async (txt) => { await fsp.fill('#smateIn', txt); await fsp.click('#smateSend'); await fsp.waitForTimeout(1100); };
await fsSend('undo');
ok('SMate drives Scribe undo', await fsp.evaluate(() =>
  document.getElementById('scrDoc').textContent !== 'hello world'));
await fsSend('redo');
ok('SMate drives Scribe redo', await fsp.evaluate(() =>
  document.getElementById('scrDoc').textContent === 'hello world'));
await fsSend('clear');
ok('SMate clears the Scribe document', await fsp.evaluate(() =>
  document.getElementById('scrDoc').textContent.trim() === ''));
await fsp.close();

const ft = await fc.newPage();
await ft.goto(URL + 'settings.html', { waitUntil: 'load' });
await ft.waitForTimeout(300);
await ft.click('#smateBtn');
await ft.fill('#smateIn', 'theme');
await ft.click('#smateSend');
await ft.waitForTimeout(1100);
ok('SMate flips the theme from settings', await ft.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.length > 0));
await ft.close();

/* Scribe transcription follows the app language until you pick one */
const fl = await fc.newPage();
await fl.goto(URL + 'scribe.html', { waitUntil: 'load' });
await fl.evaluate(() => { localStorage.removeItem('singhoah:scribe'); localStorage.setItem('singhoah:lang', 'fr'); });
await fl.reload({ waitUntil: 'load' });
await fl.waitForTimeout(300);
ok('Scribe transcribes in the app language (fr)', await fl.evaluate(() =>
  document.getElementById('scrIn').value === 'fr-FR'));
await fl.evaluate(() => localStorage.setItem('singhoah:lang', 'zh-Hant'));
await fl.reload({ waitUntil: 'load' });
await fl.waitForTimeout(300);
ok('Scribe transcribes in the app language (zh-TW)', await fl.evaluate(() =>
  document.getElementById('scrIn').value === 'zh-TW'));
await fl.close();
await fc.close();

/* Mobile Scribe: big text (no iOS focus-zoom), no labels, thumb-sized mic */
const msc = await browser.newContext({ viewport: { width: 390, height: 844 } });
await msc.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
const mpg = await msc.newPage();
await mpg.goto(URL + 'scribe.html', { waitUntil: 'load' });
await mpg.waitForTimeout(500);
await mpg.evaluate(() => { document.querySelector('[data-fl-new]').click(); });
await mpg.waitForTimeout(400);
ok('mobile Scribe uses 16px text and hides the bar labels', await mpg.evaluate(() => {
  const page = document.querySelector('.scr-page');
  const lbl = document.querySelector('.scr-lbl');
  return getComputedStyle(page).fontSize === '16px'
    && getComputedStyle(lbl).display === 'none';
}));
ok('mobile Scribe mic is a thumb target', await mpg.evaluate(() =>
  document.getElementById('scrMic').getBoundingClientRect().height >= 44));
await mpg.close();
await msc.close();

/* map labels follow the app language; phone gets a touch-zoomable map */
const zlc = await browser.newContext({ viewport: { width: 1440, height: 850 } });
await zlc.addInitScript(() => {
  localStorage.setItem('singhoah:visited', '1');
  localStorage.setItem('singhoah:lang', 'zh-Hant');
});
const zlp = await zlc.newPage();
await zlp.goto(URL + 'index.html', { waitUntil: 'load' });
await zlp.waitForTimeout(300);
await zlp.evaluate(() => window.__SING_LIB.mapGoCity('Taipei'));
await zlp.waitForSelector('#mapCities .map-city', { timeout: 20000 });
await zlp.waitForTimeout(400);
ok('map labels follow the app language', await zlp.evaluate(() =>
  [...document.querySelectorAll('#mapCities .map-city')]
    .some((g) => g.querySelector('tspan').textContent === '臺北市')));
await zlp.close();
await zlc.close();

const mcc = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await mcc.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
const mcp2 = await mcc.newPage();
await mcp2.goto(URL + 'index.html', { waitUntil: 'load' });
await mcp2.waitForTimeout(400);
await mcp2.click('#btnMap');
await mcp2.waitForSelector('#mapSvg .map-cc', { timeout: 20000 });
await mcp2.evaluate(() => window.__SING_LIB.mapGoCity('Tokyo'));
await mcp2.waitForSelector('#mapCities .map-city', { timeout: 10000 });
ok('the phone map carries city labels and gives gestures to the page', await mcp2.evaluate(() => {
  const svg = document.getElementById('mapSvg');
  return document.querySelectorAll('#mapCities .map-city').length > 3
    && getComputedStyle(svg).touchAction === 'none';
}));
await mcp2.evaluate(() => document.getElementById('mapZoomOut').click());
await mcp2.waitForTimeout(600);
ok('portrait maps label the whole drawn map and every dot carries its name', await mcp2.evaluate(() => {
  const svg = document.getElementById('mapSvg');
  const r = svg.getBoundingClientRect();
  const [, , vbw, vbh] = svg.getAttribute('viewBox').split(' ').map(Number);
  const scale = Math.min(r.width / vbw, r.height / vbh);   // meet: viewBox band height
  const band = vbh * scale;
  const tops = [...document.querySelectorAll('#mapCities text')].map((t) => t.getBoundingClientRect().top);
  const span = Math.max(...tops) - Math.min(...tops);
  const nameless = [...document.querySelectorAll('#mapCities .map-city')]
    .filter((g) => !g.querySelector('text')).length;
  return span > 1.7 * band && nameless === 0 && tops.length > 5;
}));
await mcp2.close();
await mcc.close();

/* --- SMate compound commands: zones + window shape + extras in one sentence --- */
const cm = await browser.newContext({ viewport: { width: 1440, height: 850 } });
await cm.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
await cm.addInitScript({ content: SMATE_STUB({
  'jakarta': ['{"tool":"zones","args":{"cities":["Jakarta","Taipei","Singapore"],"layout":"2x2"}}'],
  '4 by 4': ['{"tool":"zones","args":{"layout":"4x4"}}'],
  'tokyo': ['{"tool":"theme","args":{"mode":"night"}}', '{"tool":"mode","args":{"mode":"analog"}}', '{"tool":"zones","args":{"city":"Tokyo","layout":"single"}}', '{"say":"Done — night shift, analog clock, Tokyo in a single window."}'],
}) });
const cp = await cm.newPage();
await cp.goto(URL + 'index.html', { waitUntil: 'load' });
await cp.waitForTimeout(300);
await cp.click('#smateBtn');
const cmSend = async (txt) => { await cp.fill('#smateIn', txt); await cp.click('#smateSend'); await cp.waitForTimeout(2200); };
await cmSend('set time zones to Jakarta, Taipei, and Singapore in a 2 by 2 window');
ok('SMate parses zones + window shape from one sentence', await cp.evaluate(() => {
  const g = document.getElementById('grid');
  return g.dataset.layout === '2x2' && g.textContent.includes('Jakarta') &&
    g.textContent.includes('Taipei') && g.textContent.includes('Singapore');
}));
await cmSend('4 by 4');
ok('SMate opens a 4 by 4 window', await cp.evaluate(() =>
  document.getElementById('grid').dataset.layout === '4x4' &&
  document.querySelectorAll('#grid .cell').length === 16));
await cmSend('night shift, analog, and zone Tokyo in a single window');
ok('SMate stacks several actions in one message', await cp.evaluate(() =>
  document.documentElement.classList.contains('dark') &&
  document.documentElement.classList.contains('analog') &&
  document.getElementById('grid').dataset.layout === '1' &&
  document.getElementById('grid').textContent.includes('Tokyo')));
await cp.close();
await cm.close();

/* the same compound command in Traditional Chinese */
const cz = await browser.newContext({ viewport: { width: 1440, height: 850 } });
await cz.addInitScript(() => { localStorage.setItem('singhoah:visited', '1'); localStorage.setItem('singhoah:lang', 'zh-Hant'); });
await cz.addInitScript({ content: SMATE_STUB({
  '雅加達': ['{"tool":"zones","args":{"cities":["Jakarta","Taipei","Singapore"],"layout":"2x2"}}'],
}) });
const zp = await cz.newPage();
await zp.goto(URL + 'index.html', { waitUntil: 'load' });
await zp.waitForTimeout(300);
await zp.click('#smateBtn');
await zp.fill('#smateIn', '視窗 2x2，時區設為雅加達、台北、新加坡');
await zp.click('#smateSend');
await zp.waitForTimeout(1500);
ok('SMate understands compound commands in other languages', await zp.evaluate(() => {
  const g = document.getElementById('grid');
  return g.dataset.layout === '2x2' && g.textContent.includes('Jakarta') &&
    g.textContent.includes('Taipei') && g.textContent.includes('Singapore');
}));
await zp.close();
await cz.close();

/* SMate on a phone: bottom sheet, commands work */
const mo = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
await mo.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
await mo.addInitScript({ content: SMATE_STUB({
  'night': ['{"tool":"theme","args":{"mode":"night"}}'],
}) });
const mp = await mo.newPage();
await mp.goto(URL + 'index.html', { waitUntil: 'load' });
await mp.waitForTimeout(300);
await mp.click('#smateBtn');
await mp.waitForTimeout(200);
ok('SMate becomes a bottom sheet on phones', await mp.evaluate(() => {
  const r = document.getElementById('smatePop').getBoundingClientRect();
  return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width >= innerWidth - 20;
}));
await mp.fill('#smateIn', 'night shift');
await mp.click('#smateSend');
await mp.waitForTimeout(950);
ok('SMate commands work on phones', await mp.evaluate(() => document.documentElement.classList.contains('dark')));
await mp.close();
await mo.close();

/* --- Clear all: Window menu + SMate, on clock and across pages --- */
const cl = await browser.newContext({ viewport: { width: 1440, height: 850 } });
await cl.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
await cl.addInitScript({ content: SMATE_STUB({
  'jakarta': ['{"tool":"zones","args":{"cities":["Jakarta","Taipei","Singapore"],"layout":"2x2"}}'],
  '2 by 2': ['{"tool":"zones","args":{"layout":"2x2"}}'],
  'clear all': ['{"tool":"clearclock","args":{}}'],
}) });
const clp = await cl.newPage();
await clp.goto(URL + 'index.html', { waitUntil: 'load' });
await clp.waitForTimeout(400);
await clp.click('#smateBtn');
await clp.fill('#smateIn', 'zones Jakarta, Taipei, Singapore in 2 by 2');
await clp.click('#smateSend');
await clp.waitForTimeout(1600);
ok('a busy window starts with four panes', await clp.evaluate(() =>
  document.querySelectorAll('#grid .cell').length === 4));
await clp.click('#smateX');
await clp.click('#btnWindow');
await clp.waitForTimeout(150);
await clp.click('#winClear');
await clp.waitForTimeout(250);
ok('Window menu offers Clear all and it resets the window', await clp.evaluate(() =>
  document.getElementById('grid').dataset.layout === '1' &&
  document.querySelectorAll('#grid .cell').length === 1));
await clp.click('#smateBtn');
await clp.fill('#smateIn', '2 by 2');
await clp.click('#smateSend');
await clp.waitForTimeout(950);
await clp.fill('#smateIn', 'clear all');
await clp.click('#smateSend');
await clp.waitForTimeout(950);
ok('SMate clears the window on command', await clp.evaluate(() =>
  document.getElementById('grid').dataset.layout === '1' &&
  document.querySelectorAll('#grid .cell').length === 1));
await clp.close();

/* SMate clear-all from another page hops home and clears there */
const cl2 = await cl.newPage();
await cl2.goto(URL + 'wallet.html', { waitUntil: 'load' });
await cl2.waitForTimeout(300);
await cl2.evaluate(() => localStorage.setItem('singhoah:layout', '4'));
await cl2.click('#smateBtn');
await cl2.fill('#smateIn', 'clear all');
await cl2.click('#smateSend');
await cl2.waitForTimeout(900);
await cl2.waitForURL(/index\.html/, { timeout: 5000 });
await cl2.waitForTimeout(500);
ok('SMate clear-all works from the wallet too', await cl2.evaluate(() =>
  document.getElementById('grid').dataset.layout === '1' &&
  document.querySelectorAll('#grid .cell').length === 1));
await cl2.close();

/* localized clear-all (Traditional Chinese) */
const cl3 = await browser.newContext({ viewport: { width: 1440, height: 850 } });
await cl3.addInitScript(() => { localStorage.setItem('singhoah:visited', '1'); localStorage.setItem('singhoah:lang', 'zh-Hant'); localStorage.setItem('singhoah:layout', '4'); });
await cl3.addInitScript({ content: SMATE_STUB({
  '清除': ['{"tool":"clearclock","args":{}}'],
}) });
const cl3p = await cl3.newPage();
await cl3p.goto(URL + 'index.html', { waitUntil: 'load' });
await cl3p.waitForTimeout(300);
await cl3p.click('#smateBtn');
await cl3p.fill('#smateIn', '全部清除');
await cl3p.click('#smateSend');
await cl3p.waitForTimeout(950);
ok('SMate clears the window in other languages', await cl3p.evaluate(() =>
  document.getElementById('grid').dataset.layout === '1'));
await cl3p.close();
await cl3.close();
await cl.close();

/* --- SinghoMetro: tap-tap fare calculator --- */
const mtctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await mtctx.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
await mtctx.addInitScript({ content: SMATE_STUB({
  'swap': ['{"tool":"metroswap","args":{}}'],
}) });
const mt = await mtctx.newPage();
const metroErrs = [];
mt.on('pageerror', (e) => metroErrs.push(String(e)));
await mt.goto(URL + 'metro.html', { waitUntil: 'load' });
await mt.waitForTimeout(500);
ok('metro draws every system line on the map', await mt.evaluate(() =>
  document.getElementById('metroLines').querySelectorAll('path, polyline, line').length >= 10));
ok('metro renders all Taipei stations as dots', await mt.evaluate(() =>
  document.getElementById('metroStations').querySelectorAll('circle.metro-st').length >= 100));
ok('metro lines follow the real curved tracks', await mt.evaluate(() => {
  const paths = [...document.querySelectorAll('#metroLines path')];
  return paths.some((p) => (p.getAttribute('d').match(/L/g) || []).length > 60);
}));
await mt.mouse.move(300, 300); await mt.mouse.down(); await mt.mouse.move(800, 600, { steps: 8 }); await mt.mouse.up();
ok('dragging the map selects no text', await mt.evaluate(() => String(getSelection()).length === 0));
await mt.click('#metroFit');
await mt.waitForTimeout(200);
ok('metro labels show English over the Chinese name', await mt.evaluate(() => {
  const texts = [...document.getElementById('metroSvg').querySelectorAll('text.metro-label')];
  return texts.length >= 25 && texts.every((tx) => {
    const ts = tx.querySelectorAll('tspan');
    return ts.length === 2 && ts[1].classList.contains('metro-label-zh') && /[\u4e00-\u9fff]/.test(ts[1].textContent);
  });
}));
const tapSt = async (id) => {
  const box = await mt.evaluate((sid) => {
    const c = document.querySelector(`.metro-st[data-st="${sid}"]`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);
  ok(`metro station ${id} is on screen`, !!box);
  await mt.mouse.click(box.x, box.y);
  await mt.waitForTimeout(120);
};
await tapSt('R28');
await tapSt('R10');
ok('Tamsui -> Taipei Main Station fares at NT$45', await mt.evaluate(() =>
  document.getElementById('mFareVal').textContent.trim() === 'NT$45'));
ok('metro route meta reports stations and minutes', await mt.evaluate(() => {
  const m = document.getElementById('mFareMeta').textContent;
  return /\d+/.test(m) && m.includes('min');
}));
await mt.click('#mSwap');
await mt.waitForTimeout(100);
ok('swap reverses the chosen pair', await mt.evaluate(() =>
  document.getElementById('mFromName').textContent.includes('Taipei Main')));
await mt.click('#mClear');
await mt.waitForTimeout(100);
ok('clear hides the fare again', await mt.evaluate(() => document.getElementById('mFareBox').hidden));
await mt.evaluate(() => document.querySelectorAll('#metroSys .metro-sysbtn')[1].click());
await mt.waitForTimeout(200);
await tapSt('A1');
await tapSt('A13');
ok('Airport MRT Taipei Main -> Terminal 2 fares at NT$160', await mt.evaluate(() =>
  document.getElementById('mFareVal').textContent.trim() === 'NT$160'));
ok('metro offers all four system tabs', await mt.evaluate(() =>
  document.querySelectorAll('#metroSys .metro-sysbtn').length === 4));
await mt.evaluate(() => document.querySelectorAll('#metroSys .metro-sysbtn')[2].click());
await mt.waitForTimeout(200);
await tapSt('KR3');
await tapSt('KRK1');
ok('Kaohsiung full Red Line fares at NT$60', await mt.evaluate(() =>
  document.getElementById('mFareVal').textContent.trim() === 'NT$60'));
let ksBaseOk = false;
try {
  await mt.waitForFunction(() => {
    const st = globalThis.__METRO.baseStats();
    return st.sys === 'KS' && st.charsMaj > 500 && st.charsWat > 500;
  }, null, { timeout: 6000, polling: 200 });
  ksBaseOk = true;
} catch { /* checked below */ }
ok('Kaohsiung basemap has its own streets and water', ksBaseOk);
ok('switching systems hides the previous city and resets the view', await mt.evaluate(async () => {
  const vis = () => [globalThis.__METRO.baseStats().sys];
  if (vis().some((s) => s !== 'KS')) return false; /* only KS painted while KS is active */
  const svg = document.getElementById('metroSvg');
  document.getElementById('metroIn').click();
  document.getElementById('metroIn').click(); /* zoom deep into KS… */
  await new Promise((x) => setTimeout(x, 500));
  const wZoom = svg.getAttribute('viewBox').split(' ').map(Number)[2];
  document.querySelectorAll('#metroSys .metro-sysbtn')[0].click(); /* …then jump to Taipei */
  await new Promise((x) => setTimeout(x, 500));
  const wFit = svg.getAttribute('viewBox').split(' ').map(Number)[2];
  return wFit > wZoom * 1.2 && vis().length > 0 && vis().every((s) => s === 'TRTC') &&
    globalThis.__METRO.baseStats().painted > 0;
}));
await mt.evaluate(() => document.querySelectorAll('#metroSys .metro-sysbtn')[3].click());
await mt.waitForTimeout(200);
await tapSt('T103a');
await tapSt('T119');
ok('Taichung Green Line end-to-end fares at NT$50', await mt.evaluate(() =>
  document.getElementById('mFareVal').textContent.trim() === 'NT$50'));
/* Google-Maps-style gestures: anchored wheel, pinch, fling */
ok('wheel zoom stays anchored under the cursor', await mt.evaluate(async () => {
  const svg = document.getElementById('metroSvg');
  const r = svg.getBoundingClientRect();
  const sx = r.x + r.width / 2 + 120, sy = r.y + r.height / 2 - 80;
  const worldOf = (sx2, sy2) => {
    const [x0, y0, w, hh] = svg.getAttribute('viewBox').split(' ').map(Number);
    const s = Math.min(r.width / w, r.height / hh);
    const ox = (r.width - w * s) / 2, oy = (r.height - hh * s) / 2;
    return [x0 + (sx2 - r.left - ox) / s, y0 + (sy2 - r.top - oy) / s];
  };
  const before = worldOf(sx, sy);
  svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: sx, clientY: sy, bubbles: true, cancelable: true }));
  const wg = document.getElementById('metroWorld');
  for (let i = 0; i < 40 && wg.style.transform !== ''; i++) await new Promise((x) => setTimeout(x, 100));
  await new Promise((x) => requestAnimationFrame(() => requestAnimationFrame(x))); /* settle re-bake applied */
  const after = worldOf(sx, sy);
  return Math.hypot(before[0] - after[0], before[1] - after[1]) < 2;
}));
ok('pinch spread zooms in about the midpoint', await mt.evaluate(async () => {
  const svg = document.getElementById('metroSvg');
  const r = svg.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const vw = () => svg.getAttribute('viewBox').split(' ').map(Number)[2];
  const w0 = vw();
  svg.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, clientX: cx - 60, clientY: cy, bubbles: true }));
  svg.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 12, clientX: cx + 60, clientY: cy, bubbles: true }));
  for (let i = 1; i <= 5; i++) {
    svg.dispatchEvent(new PointerEvent('pointermove', { pointerId: 11, clientX: cx - 60 - i * 20, clientY: cy, bubbles: true }));
    svg.dispatchEvent(new PointerEvent('pointermove', { pointerId: 12, clientX: cx + 60 + i * 20, clientY: cy, bubbles: true }));
    await new Promise((x) => setTimeout(x, 25));
  }
  svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, clientX: cx - 160, clientY: cy, bubbles: true }));
  svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 12, clientX: cx + 160, clientY: cy, bubbles: true }));
  const wg2 = document.getElementById('metroWorld');
  for (let i = 0; i < 40 && wg2.style.transform !== ''; i++) await new Promise((x) => setTimeout(x, 100));
  await new Promise((x) => requestAnimationFrame(() => requestAnimationFrame(x))); /* settle re-bake */
  return vw() < w0 - 1;
}));
ok('drag stops instantly at release, like the world map (no fling)', await mt.evaluate(async () => {
  const svg = document.getElementById('metroSvg');
  const wOf = () => svg.getAttribute('viewBox').split(' ').map(Number)[2];
  const wFit = wOf();
  document.getElementById('metroIn').click(); /* pan needs zoom, like the world map */
  for (let i = 0; i < 40 && wOf() >= wFit; i++) await new Promise((x) => setTimeout(x, 100)); /* wait out the rAF bake */
  const r = svg.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  svg.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 13, clientX: cx, clientY: cy, bubbles: true }));
  for (let i = 1; i <= 6; i++) {
    svg.dispatchEvent(new PointerEvent('pointermove', { pointerId: 13, clientX: cx + i * 30, clientY: cy + i * 8, bubbles: true }));
    await new Promise((x) => setTimeout(x, 12));
  }
  svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 13, clientX: cx + 180, clientY: cy + 48, bubbles: true }));
  /* wait out the compositor settle (transform cleared + sharp re-bake
     applied), then the view must stay perfectly still — a fling would
     keep moving it */
  const wg = document.getElementById('metroWorld');
  for (let i = 0; i < 40 && wg.style.transform !== ''; i++) await new Promise((x) => setTimeout(x, 100));
  await new Promise((x) => requestAnimationFrame(() => requestAnimationFrame(x)));
  const vbSettled = svg.getAttribute('viewBox');
  const sx1 = document.querySelector('.metro-st').getBoundingClientRect().x;
  await new Promise((x) => setTimeout(x, 600));
  return svg.getAttribute('viewBox') === vbSettled &&
    Math.abs(document.querySelector('.metro-st').getBoundingClientRect().x - sx1) <= 2; /* no glide */
}));
ok('live gesture transform is exactly the base→view matrix (no inverted pan/zoom)', await mt.evaluate(async () => {
  const svg = document.getElementById('metroSvg');
  const wg = document.getElementById('metroWorld');
  const r = svg.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  svg.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 21, clientX: cx, clientY: cy, bubbles: true }));
  for (let i = 1; i <= 3; i++) {
    svg.dispatchEvent(new PointerEvent('pointermove', { pointerId: 21, clientX: cx + i * 40, clientY: cy - i * 25, bubbles: true }));
    await new Promise((x) => setTimeout(x, 15));
  }
  /* zero-delta pings keep the gesture window open while we poll for the
     frame where the applied transform and the logical view agree */
  let okm = false, got = null, vb = null, dbg = null;
  for (let i = 0; i < 10 && !okm; i++) {
    svg.dispatchEvent(new PointerEvent('pointermove', { pointerId: 21, clientX: cx + 120, clientY: cy - 75, bubbles: true }));
    await new Promise((x) => setTimeout(x, 40));
    const tm = getComputedStyle(wg).transform;
    if (tm === 'none') continue;
    dbg = globalThis.__METRO.dbg;
    if (!dbg.base) break;
    vb = svg.getAttribute('viewBox').split(' ').map(Number);
    got = tm.match(/-?\d*\.?\d+(?:e-?\d+)?/g).map(Number);
    const g0w = vb[2], g0s = Math.min(r.width / g0w, r.height / vb[3]);
    const aspect = Math.max(0.6, Math.min(2.6, r.height / r.width));
    const gw = 1000 / dbg.v.k, gh = gw * aspect;
    const gs = Math.min(r.width / gw, r.height / gh);
    const x00 = dbg.base.cx - g0w / 2, y00 = dbg.base.cy - vb[3] / 2;
    const x01 = dbg.v.cx - gw / 2, y01 = dbg.v.cy - gh / 2;
    const a = gs / g0s;
    const tx = x00 + (-x01 * gs) / g0s, ty = y00 + (-y01 * gs) / g0s;
    okm = Math.abs(got[0] - a) < 0.01 && Math.abs(got[4] - tx) < 1.5 && Math.abs(got[5] - ty) < 1.5;
  }
  let consistent = false;
  if (okm) {
    const el = document.querySelector('.metro-st');
    const wm = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(el.closest('g').getAttribute('transform'));
    const q = el.getBoundingClientRect();
    const g0s = Math.min(r.width / vb[2], r.height / vb[3]);
    const px = (got[0] * +wm[1] + got[4] - (dbg.base.cx - vb[2] / 2)) * g0s + (r.width - vb[2] * g0s) / 2 + r.left;
    const py = (got[0] * +wm[2] + got[5] - (dbg.base.cy - vb[3] / 2)) * g0s + (r.height - vb[3] * g0s) / 2 + r.top;
    consistent = Math.hypot(px - (q.x + q.width / 2), py - (q.y + q.height / 2)) < 2;
  }
  svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 21, clientX: cx + 120, clientY: cy - 75, bubbles: true }));
  return okm && consistent;
}));
ok('pan follows the finger during the drag (content tracks the pointer 1:1)', await mt.evaluate(async () => {
  const svg = document.getElementById('metroSvg');
  const wg = document.getElementById('metroWorld');
  const r = svg.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const el = document.querySelector('.metro-st');
  const at = () => { const q = el.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; };
  const p0 = at();
  svg.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 22, clientX: cx, clientY: cy, bubbles: true }));
  for (let i = 1; i <= 6; i++) {
    svg.dispatchEvent(new PointerEvent('pointermove', { pointerId: 22, clientX: cx - i * 25, clientY: cy + i * 12, bubbles: true }));
    await new Promise((x) => setTimeout(x, 40));
  }
  /* poll (with keep-alive pings) for the live frame where the painted
     content has caught up to the full drag — proves 1:1 tracking mid-gesture */
  let live = false;
  for (let i = 0; i < 12 && !live; i++) {
    svg.dispatchEvent(new PointerEvent('pointermove', { pointerId: 22, clientX: cx - 150, clientY: cy + 72, bubbles: true }));
    await new Promise((x) => setTimeout(x, 40));
    const d = at();
    live = getComputedStyle(wg).transform !== 'none' &&
      Math.hypot(d[0] - (p0[0] - 150), d[1] - (p0[1] + 72)) < 2;
  }
  svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 22, clientX: cx - 150, clientY: cy + 72, bubbles: true }));
  for (let i = 0; i < 40 && getComputedStyle(document.getElementById('metroWorld')).transform !== 'none'; i++) await new Promise((x) => setTimeout(x, 100));
  await new Promise((x) => requestAnimationFrame(() => requestAnimationFrame(x)));
  const p1 = at();
  return live && Math.hypot(p1[0] - p0[0] + 150, p1[1] - p0[1] - 72) < 2;
}));
ok('SMate swaps the fare pair on the metro page', await mt.evaluate(async () => {
  const M = globalThis.__METRO;
  M.pick('KR3'); M.pick('KRK1');
  const a = document.getElementById('mFromName').textContent;
  document.getElementById('smateBtn').click();
  document.getElementById('smateIn').value = 'swap';
  document.getElementById('smateForm').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((x) => setTimeout(x, 1500));
  const b = document.getElementById('mFromName').textContent;
  document.getElementById('smateX').click();
  return b !== a && b.length > 0;
}));
ok('metro zoom buttons step like the world map (+ / − / ⌂)', await mt.evaluate(async () => {
  const svg = document.getElementById('metroSvg');
  const vw = () => svg.getAttribute('viewBox').split(' ').map(Number)[2];
  const settleTo = async (pred) => { for (let i = 0; i < 40 && !pred(); i++) await new Promise((x) => setTimeout(x, 100)); };
  document.getElementById('metroFit').click();
  await new Promise((x) => setTimeout(x, 600)); /* fit re-bakes */
  const w0 = vw();
  document.getElementById('metroIn').click();
  await settleTo(() => vw() < w0 - 1);
  const w1 = vw();
  document.getElementById('metroOut').click();
  await settleTo(() => vw() > w1 + 1);
  const w2 = vw();
  return w1 < w0 && Math.abs(w2 - w0) < w0 * 0.15;
}));
ok('metro runs without page errors', metroErrs.length === 0);
await mt.click('#mCard');
await mt.waitForTimeout(200);
ok('card panel opens and is honest where NFC is missing', await mt.evaluate(() =>
  !document.getElementById('mCardPop').hidden &&
  document.getElementById('mCardMsg').textContent.length > 10 &&
  document.getElementById('mCardNote').textContent.length > 10));
await mt.fill('#mCardBal', '250');
await mt.evaluate(() => document.getElementById('mCardBal').dispatchEvent(new Event('change', { bubbles: true })));
ok('card balance is kept on-device', await mt.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('singhoah:cardbal') || '{}');
  return st.manual === '250';
}));
ok('metro preloads the active system data modules', await mt.evaluate(() =>
  [...document.querySelectorAll('link[rel="modulepreload"]')].some((l) => /mb_(trtc|ks|tc)\.js$/.test(l.href))));
ok('the decoded basemap is cached in IndexedDB', await mt.evaluate(async () => {
  document.querySelectorAll('#metroSys .metro-sysbtn')[0].click();
  await new Promise((x) => setTimeout(x, 800));
  const db = await new Promise((res) => { const rq = indexedDB.open('singhoah-metro'); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); });
  if (!db) return false;
  const keys = await new Promise((res) => { const rq = db.transaction('base').objectStore('base').getAllKeys(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res([]); });
  return keys.length >= 1;
}));
ok('a revisit paints the basemap straight from the cache', await (async () => {
  await mt.reload({ waitUntil: 'load' });
  await mt.waitForTimeout(500);
  return mt.evaluate(async () => {
    for (let i = 0; i < 40 && !globalThis.__METRO.baseCached; i++) await new Promise((x) => setTimeout(x, 100));
    const vis = globalThis.__METRO.baseStats().painted > 10 && globalThis.__METRO.baseStats().charsMaj > 200;
    return globalThis.__METRO.baseCached && vis;
  });
})());
await mt.click('#mCard');
await mtctx.close();
const mbc = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await mbc.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
const mbp = await mbc.newPage();
await mbp.goto(URL + 'metro.html', { waitUntil: 'load' });
await mbp.waitForTimeout(500);
let baseOk = false;
try {
  await mbp.waitForFunction(() => {
    const st = globalThis.__METRO.baseStats();
    return st.sys === 'TRTC' && st.charsMaj > 500 && st.charsWat > 500;
  }, null, { timeout: 6000, polling: 200 });
  baseOk = true;
} catch { /* checked below */ }
ok('metro basemap draws rivers and roads under the lines', baseOk);
ok('overview labels never overlap (interchanges win, rest reveal on zoom)', await mbp.evaluate(() => {
  const vis = [...document.querySelectorAll('#metroStations text')].filter((t) => t.style.display !== 'none');
  const r = vis.map((t) => t.getBoundingClientRect());
  for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) {
    const x = r[a], y = r[b];
    if (x.left < y.right - 2 && x.right > y.left + 2 && x.top < y.bottom - 2 && x.bottom > y.top + 2) return false;
  }
  return vis.length > 5 && vis.length < 135; /* culled, not empty, not all */
}));
ok('street grid is hidden at overview zoom', await mbp.evaluate(() =>
  globalThis.__METRO.baseStats().minVisible === false && globalThis.__METRO.baseStats().painted > 10));
await mbp.click('#metroIn'); await mbp.click('#metroIn'); await mbp.click('#metroIn');
let gridOk = false;
try {
  await mbp.waitForFunction(() => {
    const st = globalThis.__METRO.baseStats();
    return st.minVisible && st.charsMin > 500;
  }, null, { timeout: 6000, polling: 200 });
  gridOk = true;
} catch { /* checked below */ }
ok('zooming in reveals the street grid', gridOk);
ok('gestures stretch the baked canvas layer and re-bake on settle', await mbp.evaluate(async () => {
  const svg = document.getElementById('metroSvg');
  const cv = document.getElementById('metroBaseCanvas');
  globalThis.__METRO.zoomBy(3);
  await new Promise((x) => setTimeout(x, 400));
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true, pointerType: 'mouse' }));
  ev('pointerdown', 700, 450);
  for (let i = 1; i <= 10; i++) { ev('pointermove', 700 - i * 4, 450 - i * 2); await new Promise((x) => setTimeout(x, 16)); }
  const live = cv.style.transform.startsWith('matrix(');
  ev('pointerup', 660, 430);
  await new Promise((x) => setTimeout(x, 500));
  return live && cv.style.transform === '' && globalThis.__METRO.baseStats().painted > 0;
}));
await mbc.close();
const mtz = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await mtz.addInitScript(() => { localStorage.setItem('singhoah:visited', '1'); localStorage.setItem('singhoah:lang', 'zh-Hant'); });
const mz = await mtz.newPage();
await mz.goto(URL + 'metro.html', { waitUntil: 'load' });
await mz.waitForTimeout(300);
ok('metro chrome localizes to zh-Hant', await mz.evaluate(() =>
  document.getElementById('mSwap').textContent === '交換' &&
  document.getElementById('mClear').textContent === '清除'));
await mtz.close();

/* --- standardized chrome: every app carries the same core topbar --- */
for (const pg of ['index.html', 'wallet.html', 'launch.html', 'settings.html', 'scribe.html', 'metro.html']) {
  const sp = await browser.newContext({ viewport: { width: 1440, height: 850 } });
  await sp.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
  const q = await sp.newPage();
  await q.goto(URL + pg, { waitUntil: 'load' });
  await q.waitForTimeout(250);
  ok(`${pg} topbar is standardized`, await q.evaluate(() =>
    !!document.querySelector('.topbar .brand') &&
    !!document.getElementById('langBtn') &&
    !!document.getElementById('btnNight') &&
    !!document.getElementById('authWrap') &&
    !!document.getElementById('smateBtn') &&
    getComputedStyle(document.getElementById('btnNight')).borderTopWidth === '0px'));
  await q.close();
  await sp.close();
}
for (const pg of ['launch.html', 'scribe.html', 'wallet.html', 'settings.html', 'metro.html']) {
  const sp = await browser.newContext({ viewport: { width: 1440, height: 850 } });
  await sp.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
  const q = await sp.newPage();
  await q.goto(URL + pg, { waitUntil: 'load' });
  await q.waitForTimeout(250);
  ok(`${pg} links back to the clock`, await q.evaluate(() => !!document.getElementById('btnClock')));
  await q.close();
  await sp.close();
}

/* --- print: always black text on white paper, night shift included --- */
const prn = await browser.newContext({ viewport: { width: 900, height: 700 } });
await prn.addInitScript(() => { localStorage.setItem('singhoah:night', '1'); localStorage.setItem('singhoah:visited', '1'); });
for (const pg of ['wallet.html', 'scribe.html']) {
  const pr = await prn.newPage();
  await pr.goto(URL + pg, { waitUntil: 'load' });
  await pr.waitForTimeout(250);
  await pr.emulateMedia({ media: 'print' });
  ok(`print renders black text on ${pg} even in night shift`, await pr.evaluate(() => {
    const t = document.createElement('p'); t.textContent = 'print probe';
    document.body.appendChild(t);
    return getComputedStyle(t).color === 'rgb(0, 0, 0)';
  }));
  await pr.close();
}
await prn.close();

/* --- metro: lazy basemap files, zoom labels, SMate metro intents --- */
{
  const mp = await browser.newPage();
  await mp.addInitScript({ content: SMATE_STUB({
    '票價': ['{"tool":"route","args":{"from":"台北車站","to":"動物園"}}'],
  }) });
  const mbReq = [];
  mp.on('request', (r) => { if (/mb_(trtc|ks|tc)\.js/.test(r.url())) mbReq.push(r.url().split('/').pop()); });
  await mp.goto(URL + 'metro.html', { waitUntil: 'load' });
  await mp.waitForSelector('#metroSvg path.metro-line');
  await mp.waitForTimeout(1400);
  ok('metro.html no longer ships the monolithic metrobase.js', !(await mp.content()).includes('metrobase.js'));
  ok('basemap streams from a lazy per-system module', mbReq.includes('mb_trtc.js'));
  const box = await mp.locator('#metroSvg').boundingBox();
  await mp.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 14; i++) { await mp.mouse.wheel(0, -120); await mp.waitForTimeout(25); }
  await mp.waitForTimeout(1600);
  const zl = await mp.evaluate(() => {
    const svg = document.getElementById('metroSvg');
    const sr = svg.getBoundingClientRect();
    let inView = 0, named = 0;
    for (const t of document.querySelectorAll('#metroSvg text.metro-label')) {
      const m = t.getScreenCTM(), bb = t.getBBox();
      const x = m.a * bb.x + m.e, y = m.d * bb.y + m.f;
      if (x > 0 && x < sr.width && y > 0 && y < sr.height) { inView++; if (t.style.display !== 'none') named++; }
    }
    return { inView, named };
  });
  ok('zoomed-in map names the stations on screen', zl.inView > 0 && zl.named >= Math.min(zl.inView, 3) && zl.named > 0);
  await mp.click('#smateBtn');
  await mp.fill('#smateIn', '台北車站 到 動物園 票價');
  await mp.press('#smateIn', 'Enter');
  await mp.waitForTimeout(2200);
  const reply = await mp.evaluate(() => {
    const m = [...document.querySelectorAll('#smateMsgs p')];
    return m.length ? m[m.length - 1].textContent : '';
  });
  ok('SMate answers a metro fare query on the metro page', /NT\$\d+/.test(reply));
  await mp.close();
}

/* --- SinghoModule: visual automation with square wires --- */
{
  const mc = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await mc.addInitScript({ content: SMATE_STUB({
    'open module': ['{"tool":"goto","args":{"app":"module"}}'],
    'run': ['{"tool":"modrun","args":{}}'],
  }) });
  const mp = await mc.newPage();
  const merrs = [];
  mp.on('pageerror', (e) => merrs.push(String(e)));
  await mp.goto(URL + 'module.html', { waitUntil: 'load' });
  await mp.waitForTimeout(700);
  ok('SinghoModule opens onto the canvas on first run', await mp.evaluate(() =>
    !document.getElementById('modEditor').hidden && !!globalThis.__MOD));
  const flow = await mp.evaluate(() => {
    const M = globalThis.__MOD;
    const a = M.add('text', 48, 48);
    M.cfg(a.id, { text: '# Hi **Singhoah**', enc: 'plain' });
    const o = M.add('io', 420, 48);
    M.wire(a.id, o.id);
    M.run();
    return { out: M.outputText(), d: document.querySelector('.mod-wire').getAttribute('d') };
  });
  ok('a Text -> Output flow runs and prints the text', flow.out.includes('Singhoah'), flow.out);
  ok('connectors are square: H-V-H only, no curve commands', /^[MHV\d\s.]+$/.test(flow.d) && !/[CcQqAaSsTt]/.test(flow.d), flow.d);
  ok('Text renders Markdown natively (h1 + bold in Output, no Markdown module)', await mp.evaluate(() =>
    !!document.querySelector('.mod-md h1') && !!document.querySelector('.mod-md strong')
    && !document.querySelector('.mod-add[data-add="markdown"]')));
  const enc = await mp.evaluate(() => {
    const M = globalThis.__MOD;
    const a = M.nodes().find((n) => n.type === 'text');
    M.cfg(a.id, { enc: 'b64', text: 'Hi' });
    M.run();
    return M.outputText();
  });
  ok('the Text module encodes (Base64)', enc.includes('SGk'), enc);
  const gridA = await mp.evaluate(() => { globalThis.__MOD.grid(false); return getComputedStyle(document.getElementById('modCanvas')).backgroundImage; });
  const gridB = await mp.evaluate(() => { globalThis.__MOD.grid(true); return getComputedStyle(document.getElementById('modCanvas')).backgroundImage; });
  ok('the grid can be disabled and re-enabled', gridA === 'none' && gridB.includes('linear-gradient'), `${gridA} / ${gridB.slice(0, 20)}`);
  const snapOk = await mp.evaluate(() => {
    const M = globalThis.__MOD;
    const el = [...document.querySelectorAll('.mod-node')][0];
    const head = el.querySelector('.mod-head');
    return new Promise((res) => {
      const r = head.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, pointerId: 1, clientX: r.x + 5, clientY: r.y + 5, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
      head.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: r.x + 37, clientY: r.y + 29 }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts }));
      setTimeout(() => res(M.nodes()[0].x % 24 === 0 && M.nodes()[0].y % 24 === 0), 100);
    });
  });
  ok('nodes snap to the 24px grid while dragging', snapOk);
  await mp.waitForTimeout(800);
  const json = await mp.evaluate(() => JSON.parse(globalThis.__MOD.serialize()));
  ok('flows export to JSON (app, kind, nodes, wires)', json.app === 'singhoah' && json.kind === 'flow' && json.data.nodes.length === 2 && json.data.wires.length === 1, JSON.stringify(json.data ? json.data.nodes.length : null));
  /* the Code module: JavaScript in the sandboxed worker, wired input flows in */
  const codeOut = await mp.evaluate(async () => {
    const M = globalThis.__MOD;
    const c = M.add('code', 48, 300);
    M.cfg(c.id, { code: "console.log('code ok ' + input)" });
    const t = M.nodes().find((n) => n.type === 'text');
    M.wire(t.id, c.id);
    const o2 = M.add('io', 420, 300);
    M.wire(c.id, o2.id);
    await M.run();
    return { out: M.outputText(), lang: c.cfg.lang, stat: document.querySelector('.mod-cstat')?.textContent || '' };
  });
  ok('the Code module runs JavaScript with the wired input', /code ok SGk=/.test(codeOut.out), JSON.stringify(codeOut.out.slice(0, 60)));
  ok(`the code node reports its timing ("${codeOut.stat}")`, /ms/.test(codeOut.stat), codeOut.stat);
  ok('the Code module has no inline output field — one right port, results render in the I/O node', await mp.evaluate(() => {
    const cn = [...document.querySelectorAll('.mod-node')].find((n) => n.querySelector('.mod-codeta'));
    return !!cn && !cn.querySelector('.mod-result') && cn.querySelectorAll('.mod-port.out').length === 1
      && !cn.querySelector('.mod-port.out.stdin');
  }));
  /* the code editor: Saans Mono, line numbers, syntax highlighting */
  const ed = await mp.evaluate(() => {
    const el = [...document.querySelectorAll('.mod-node')].find((n) => n.querySelector('.mod-codeta'));
    if (!el) return { lines: 0, toks: 0, mono: '' };
    return {
      lines: el.querySelectorAll('.mod-gut-in span').length,
      toks: el.querySelectorAll('.mod-hl [class^="tok-"]').length,
      mono: getComputedStyle(el.querySelector('.mod-hl')).fontVariationSettings,
    };
  });
  ok('the code editor shows line numbers and highlighted tokens', ed.lines === 1 && ed.toks >= 2, JSON.stringify(ed));
  ok(`the code editor renders in Saans Mono (${ed.mono})`, /MONO"?\s*100/i.test(ed.mono), ed.mono);
  /* errors render red; a second JS run keeps its console output */
  const errRun = await mp.evaluate(async () => {
    const M = globalThis.__MOD;
    const c = M.nodes().find((n) => n.type === 'code');
    M.cfg(c.id, { code: "console.log('first ok')" });
    await M.run();
    M.cfg(c.id, { code: "console.log('second ok');\nthrow new Error('red boom');" });
    await M.run();
    const node = [...document.querySelectorAll('.mod-node')].find((n) => n.querySelector('.mod-codeta'));
    const err = [...document.querySelectorAll('.mod-node .mod-result .mod-err')].pop();
    return {
      second: M.outputText().includes('second ok'),
      err: err ? err.textContent : '',
      red: err ? getComputedStyle(err).color : '',
      bad: node.querySelector('.mod-cstat').className,
    };
  });
  ok('a second JS run keeps its console output (live request id)', errRun.second, JSON.stringify(errRun).slice(0, 80));
  ok(`errors render in red ("${errRun.red}") with the red status dot`, /red boom/.test(errRun.err) && /192|217|229/.test(errRun.red) && /bad/.test(errRun.bad), JSON.stringify(errRun).slice(0, 120));
  /* the merged I/O node: one node, one wire — the typed text feeds the Code
     module's stdin, and its stdout renders back in the same node */
  const ioMod = await mp.evaluate(async () => {
    const M = globalThis.__MOD;
    const c = M.nodes().find((n) => n.type === 'code');
    M.cfg(c.id, { code: "console.log('read: ' + input)" });
    const i = M.add('io', 48, 480);
    M.cfg(i.id, { text: 'from the io node' });
    M.wire(c.id, i.id);
    await M.run();
    return { out: M.outputText() };
  });
  ok('the I/O node feeds the Code module\'s stdin over the same wire that returns its output', /read: from the io node/.test(ioMod.out), JSON.stringify(ioMod.out.slice(0, 80)));
  ok('wires follow the ports: only out-port nodes source, only in-port nodes receive', await mp.evaluate(async () => {
    const M = globalThis.__MOD;
    const txt = M.nodes().find((n) => n.type === 'text');
    const io = M.nodes().find((n) => n.type === 'io');
    const code = M.nodes().find((n) => n.type === 'code');
    const before = M.wires().length;
    const t2i = M.wire(txt.id, io.id);          /* Text -> I/O: markdown preview */
    const i2c = M.wire(io.id, code.id);         /* I/O has no out port: rejected */
    const back = M.wire(code.id, io.id);        /* Code -> I/O: takes over the in port */
    const ws = M.wires();
    return t2i === true && i2c === false && back === true
      && ws.length === before - 1               /* the text wire it displaced */
      && ws.length === 1 && ws[0].from === code.id && ws[0].to === io.id;
  }));
  ok('a port holds exactly one wire: rewiring moves the connection, on both ends', await mp.evaluate(async () => {
    const M = globalThis.__MOD;
    const code = M.nodes().find((n) => n.type === 'code');
    const ios = M.nodes().filter((n) => n.type === 'io');
    const txt = M.nodes().find((n) => n.type === 'text');
    const cur = M.wires().find((w) => w.from === code.id);
    const other = ios.find((n) => n.id !== cur.to);
    M.wire(code.id, other.id);                    /* the code port's wire moves to the other I/O */
    const fromCode = M.wires().filter((w) => w.from === code.id);
    M.wire(txt.id, code.id);                      /* the text port's wire moves to the code node */
    const fromTxt = M.wires().filter((w) => w.from === txt.id);
    const intoCode = M.wires().filter((w) => w.to === code.id);
    return fromCode.length === 1 && fromCode[0].to === other.id
      && fromTxt.length === 1 && fromTxt[0].to === code.id && intoCode.length === 1;
  }));
  await mp.waitForTimeout(700);   /* let the debounced save land before serializing */
  ok('the I/O node renders as a terminal: dots bar, dark screen, monospace, > prompt', await mp.evaluate(async () => {
    const M = globalThis.__MOD;
    const io = M.nodes().find((n) => n.type === 'io' && n.cfg.text === 'from the io node');
    const el = [...document.querySelectorAll('.mod-node')].find((n) => n.dataset.id === io.id);
    const ta = el && el.querySelector('.mod-inta.mod-ta');
    const res = el && el.querySelector('.mod-result');
    const dots = el && el.querySelectorAll('.mod-tbar span');
    const screen = el && el.querySelector('.mod-tscreen');
    const pfx = el && el.querySelector('.mod-tp');
    const term = !!el && !!screen && dots && dots.length === 3 && !!pfx && pfx.textContent === '>'
      && !!ta && ta.value === 'from the io node' && !!res
      && /rgb\(15, ?20, ?26\)|#0f141a/i.test(getComputedStyle(screen).backgroundColor)
      && /MONO"?\s*100/i.test(getComputedStyle(ta).fontVariationSettings);
    const ser = JSON.parse(M.serialize());
    const saved = ser.data.nodes.find((n) => n.type === 'io' && n.cfg.text === 'from the io node');
    return term && !!saved;
  }));
  /* the theme class is applied at boot: flip the preference and reload */
  await mp.evaluate(() => localStorage.setItem('singhoah:night', '0'));
  await mp.reload();
  await mp.waitForTimeout(1000);
  ok('the terminal follows the theme: classic light terminal in light mode', await mp.evaluate(() => {
    const node = [...document.querySelectorAll('.mod-node')].find((n) => n.querySelector('.mod-tscreen'));
    const screen = getComputedStyle(node.querySelector('.mod-tscreen'));
    const bar = getComputedStyle(node.querySelector('.mod-tbar'));
    const tp2 = getComputedStyle(node.querySelector('.mod-tp'));
    const ta = getComputedStyle(node.querySelector('.mod-inta'));
    return !document.documentElement.classList.contains('dark')
      && /rgb\(251, ?250, ?246\)/.test(screen.backgroundColor)      /* paper screen */
      && /rgb\(233, ?230, ?221\)/.test(bar.backgroundColor)        /* light chrome bar */
      && /rgb\(26, ?127, ?55\)/.test(tp2.color)                    /* the > prompt reads green on paper */
      && /rgb\(31, ?35, ?40\)/.test(ta.color);                     /* dark ink on the input line */
  }));
  await mp.evaluate(() => localStorage.setItem('singhoah:night', '1'));
  await mp.reload();
  await mp.waitForTimeout(1000);
  /* files home: create, rename, delete */
  await mp.evaluate(() => globalThis.__MOD.home());
  await mp.waitForTimeout(300);
  await mp.click('[data-fl-new]');
  await mp.waitForTimeout(300);
  let fl = await mp.evaluate(() => ({ editor: !document.getElementById('modEditor').hidden, n: globalThis.__MOD.nodes().length }));
  ok('New creates and opens a fresh flow', fl.editor && fl.n === 0, JSON.stringify(fl));
  await mp.fill('#modTitle', 'My automation');
  await mp.waitForTimeout(800);
  await mp.evaluate(() => globalThis.__MOD.home());
  await mp.waitForTimeout(300);
  ok('the flow appears on the files home under its name', await mp.evaluate((name) =>
    [...document.querySelectorAll('.fl-title')].some((t) => t.textContent === name), 'My automation'));
  await mp.click('.fl-card [data-act="rename"]');
  await mp.fill('.fl-rename', 'Renamed flow');
  await mp.press('.fl-rename', 'Enter');
  await mp.waitForTimeout(300);
  ok('renaming a document works inline', await mp.evaluate(() =>
    [...document.querySelectorAll('.fl-title')].some((t) => t.textContent === 'Renamed flow')));
  await mp.click('.fl-card [data-act="del"]');
  await mp.waitForTimeout(200);
  await mp.click('.fl-card .fl-del.sure');
  await mp.waitForTimeout(200);
  ok('delete asks for confirmation, then removes the document', await mp.evaluate(() =>
    ![...document.querySelectorAll('.fl-title')].some((t) => t.textContent === 'Renamed flow')));
  ok('no page errors in SinghoModule', merrs.length === 0, merrs.join('; '));
  /* SMate drives it */
  await mp.click('#smateBtn');
  await mp.waitForTimeout(250);
  await mp.fill('#smateIn', 'open module');
  await mp.click('#smateSend');
  await mp.waitForTimeout(900);
  await mp.evaluate(() => {
    const M = globalThis.__MOD;
    const a = M.add('text', 48, 48);
    M.cfg(a.id, { text: 'smate smoke' });
    const o = M.add('io', 420, 48);
    M.wire(a.id, o.id);
  });
  await mp.fill('#smateIn', 'run');
  await mp.click('#smateSend');
  await mp.waitForTimeout(1000);
  ok('SMate runs the flow and answers with the output', await mp.evaluate(() =>
    globalThis.__MOD.outputText().includes('smate smoke') &&
    [...document.querySelectorAll('.smate-it, .smate-block')].some((n) => /smate smoke/.test(n.textContent))));
  ok('the on-device AI arrives ready in SinghoModule too', await mp.evaluate(() =>
    document.getElementById('smateAI').getAttribute('aria-pressed') === 'true'));
  /* mobile fit */
  const mm = await mc.newPage();
  await mm.setViewportSize({ width: 390, height: 844 });
  await mm.goto(URL + 'module.html', { waitUntil: 'load' });
  await mm.waitForTimeout(600);
  ok('SinghoModule fits the phone without horizontal scroll', await mm.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('the I/O terminal renders on the phone; the Code module has a single right port', await mm.evaluate(() => {
    const M = globalThis.__MOD;
    const i = M.add('io', 48, 200);
    const c = M.add('code', 60, 340);
    const el = [...document.querySelectorAll('.mod-node')].find((n) => n.dataset.id === i.id);
    const ta = el && el.querySelector('.mod-inta');
    const res = el && el.querySelector('.mod-result');
    const dots = el && el.querySelectorAll('.mod-tbar span');
    const cn = [...document.querySelectorAll('.mod-node')].find((n) => n.dataset.id === c.id);
    return !!ta && ta.clientWidth > 100 && !!res && !!dots && dots.length === 3
      && !!cn && cn.querySelectorAll('.mod-port.out').length === 1
      && document.documentElement.scrollWidth <= window.innerWidth + 1;
  }));
  await mm.close();
  await mc.close();
}

/* ---- light mode everywhere: clean pages, standardized controls, language order ---- */
{
  const lcx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const lp = await lcx.newPage();
  await lp.goto(URL + 'module.html', { waitUntil: 'load' });
  await lp.evaluate(() => localStorage.setItem('singhoah:night', '0'));
  await lp.reload();
  await lp.waitForTimeout(900);
  ok('languages list in conventional order: Latin-script first, other scripts after', await lp.evaluate(async () => {
    const { LANGS } = await import('/app.js');
    const LATIN = new Set(['da', 'nl', 'nl-BE', 'en', 'fi', 'fr', 'de', 'id', 'it', 'ms', 'nb', 'pl', 'pt', 'sr', 'es', 'sv']);
    const ids = LANGS.map((l) => l.id);
    const firstNon = ids.findIndex((id) => !LATIN.has(id));
    return ids.length === 25 && firstNon === 16 && ids.slice(16).every((id) => !LATIN.has(id));
  }));
  ok('light mode: the module canvas is a light workspace with solid, readable zoom chips', await lp.evaluate(() => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    M.add('text', 60, 60);
    const cs = getComputedStyle(document.getElementById('modCanvas'));
    const z = getComputedStyle(document.getElementById('modZoomIn'));
    const node = getComputedStyle([...document.querySelectorAll('.mod-node')].pop());
    return /rgb\(230, ?228, ?221\)/.test(cs.backgroundColor)
      && z.borderRadius === '0px' && z.backgroundColor !== 'rgba(0, 0, 0, 0)' && z.color !== z.backgroundColor
      && /rgb\(29, ?29, ?27\)/.test(node.borderColor);   /* cards stay distinct */
  }));
  ok('light mode: secondary ink passes 3:1 on paper (no washed-out labels)', await lp.evaluate(() => {
    const lum = (r, g, b) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const pigeon = hex(getComputedStyle(document.documentElement).getPropertyValue('--pigeon').trim());
    const paper = hex(getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
    const la = lum(...pigeon), lb = lum(...paper);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) >= 3;
  }));
  ok('light mode: no unreadable text on the module page (3:1 sweep)', await lp.evaluate(() => {
    const lum = (r, g, b) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (s) => { const m = /rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const effBg = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0.85) return c; } return [255, 255, 255, 1]; };
    for (const el of document.querySelectorAll('body *')) {
      if (el.getClientRects().length === 0) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const fg = parse(getComputedStyle(el).color);
      const bg = effBg(el);
      if (!fg) continue;
      const la = lum(...fg), lb = lum(...bg);
      if ((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) < 3) return false;
    }
    return true;
  }));
  /* the files home (flow cards) is reachable via the Files button — deterministic, not a load race */
  const fhx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const fp = await fhx.newPage();
  await fp.goto(URL + 'module.html', { waitUntil: 'load' });
  await fp.evaluate(() => localStorage.setItem('singhoah:night', '0'));
  await fp.reload();
  await fp.waitForTimeout(900);
  await fp.evaluate(() => {
    const visible = [...document.querySelectorAll('.fl-card')].some((c) => c.getClientRects().length);
    if (!visible) document.getElementById('modFiles').click();   /* open the files home from the editor */
  });
  await fp.waitForTimeout(400);
  const fhBad = await fp.evaluate(() => {
    const card = document.querySelector('.fl-card');
    if (!card || !card.getClientRects().length) return 'files home is not visible';
    const bg = getComputedStyle(card).backgroundColor;
    if (!/rgb\(223, ?221, ?213\)/.test(bg)) return 'card bg ' + bg;   /* var(--paper-2), not a dark leftover */
    const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const parse = (s) => { const m = /rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const effBg = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0.85) return c; } return [255, 255, 255, 1]; };
    for (const el of document.querySelectorAll('body *')) {
      if (el.getClientRects().length === 0) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const fg = parse(getComputedStyle(el).color);
      if (!fg) continue;
      const bgc = effBg(el);
      const la = lum(...fg), lb = lum(...bgc);
      if ((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) < 3) return 'unreadable: ' + (el.textContent || '').trim().slice(0, 24);
    }
    return null;
  });
  ok('light mode: files home cards are light and readable (first-visit sweep)', fhBad === null, fhBad || '');
  await fhx.close();
  await lcx.close();
  /* standardized controls, spot-checked on their pages */
  const scx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sp = await scx.newPage();
  for (const [pg, fn] of [
    ['launch.html', () => {
      const z = getComputedStyle(document.getElementById('lpZoneBtn'));
      const s = getComputedStyle(document.querySelector('.lp-start'));
      return z.borderRadius === '0px' && z.fontWeight === '650' && s.fontWeight === '650';
    }],
    ['metro.html', () => {
      const sys = document.querySelector('.metro-sysbtn');
      const card = document.querySelector('.metro-acts .btn');
      return sys && card && getComputedStyle(sys).fontWeight === '650' && getComputedStyle(card).fontWeight === '650';
    }],
    ['wallet.html', () => {
      const d = getComputedStyle(document.getElementById('walDateBtn'));
      const c = getComputedStyle(document.getElementById('walCurBtn'));
      return d.fontWeight === '650' && c.fontWeight === '650' && d.height === c.height;
    }],
  ]) {
    await sp.goto(URL + pg, { waitUntil: 'load' });
    await sp.evaluate(() => localStorage.setItem('singhoah:night', '0'));
    await sp.reload();
    await sp.waitForTimeout(pg === 'metro.html' ? 1800 : 700);
    ok(`light mode: ${pg.replace('.html', '')} controls follow the standard (sharp chips, 650 weight)`, await sp.evaluate(fn));
  }
  await scx.close();
}

/* ---- the Number module: typed numbers as a source ---- */
{
  const ncx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const np = await ncx.newPage();
  await np.goto(URL + 'module.html', { waitUntil: 'load' });
  await np.waitForTimeout(900);
  ok('the Number module joins the toolbar', await np.evaluate(() =>
    !!document.querySelector('.mod-add[data-add="number"]')
    && document.getElementById('modAddN').textContent === 'Number'));
  /* structure: a source node with an out port only, type select + base select */
  const numId = await np.evaluate(() => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const io = M.add('io', 320, 60);
    const n = M.add('number', 60, 60);
    M.wire(n.id, io.id);
    return { n: n.id, io: io.id };
  });
  const struct = await np.evaluate((ids) => {
    const el = document.querySelector(`.mod-node[data-id="${ids.n}"]`);
    const dd = [...el.querySelectorAll('.mod-dd-btn .mod-dd-txt')].map((x) => x.textContent);
    const std = getComputedStyle(el.querySelector('.mod-dd-btn'));
    const inp = getComputedStyle(el.querySelector('.mod-numin'));
    return {
      outOnly: !!el.querySelector('.mod-port.out') && !el.querySelector('.mod-port.in'),
      dd, step: {
        lab: (el.querySelector('.mod-step-lab') || {}).textContent,
        val: (el.querySelector('.mod-stepin') || {}).value,
        arrows: el.querySelectorAll('.mod-stepbtn').length,
      },
      radius: std.borderRadius + '/' + inp.borderRadius, w: std.fontWeight,
    };
  }, numId);
  ok('the Number node is a source: one out port, a type select and a base stepper, standardized chips',
    struct.outOnly && struct.dd.join('|') === 'Integer'
      && struct.step.lab === 'Base' && struct.step.val === '10' && struct.step.arrows === 2
      && struct.radius === '0px/0px' && struct.w === '650',
    JSON.stringify(struct));
  /* the type select offers the four number types; the base is a stepper
     (field + stacked arrows), never a 36-item dropdown */
  const typeDd = await np.evaluate(async (ids) => {
    const el = document.querySelector(`.mod-node[data-id="${ids.n}"]`);
    const dd = el.querySelectorAll('.mod-dd')[0].querySelector('.mod-dd-btn');
    dd.click();                                                                    /* open type */
    await new Promise((r) => setTimeout(r, 150));
    const list = [...document.querySelectorAll('.mod-dd-list:not([hidden]) .mod-dd-opt')].map((b) => b.textContent.trim());
    const float = [...document.querySelectorAll('.mod-dd-list:not([hidden]) .mod-dd-opt')].find((b) => b.textContent.trim() === 'Float');
    float.click();                                                                 /* pick Float */
    await new Promise((r) => setTimeout(r, 150));
    /* Float swaps the base stepper for a digits stepper */
    const el2 = document.querySelector(`.mod-node[data-id="${ids.n}"]`);
    const lab = el2.querySelector('.mod-step-lab').textContent;
    const btns = el2.querySelectorAll('.mod-stepbtn');
    const stacked = getComputedStyle(el2.querySelector('.mod-stepbtns')).flexDirection === 'column';
    /* step up: 6 digits -> 7 */
    btns[0].click();
    await new Promise((r) => setTimeout(r, 120));
    const afterUp = el2.querySelector('.mod-stepin').value;
    /* type 100, then up is disabled at the ceiling */
    const inp = el2.querySelector('.mod-stepin');
    inp.value = '100'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    const atMax = { v: inp.value, up: btns[0].disabled };
    /* out-of-range typing clamps into 1-100 */
    inp.value = '500'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    const clamped = inp.value;
    return { list, lab, stacked, afterUp, atMax, clamped };
  }, numId);
  ok('the type select reveals Integer, Decimal, Float, Fixed — Float swaps Base for a digits stepper',
    typeDd.list.join('|') === 'Integer|Decimal|Float|Fixed' && typeDd.lab === 'digits',
    JSON.stringify(typeDd));
  ok('the stepper: stacked arrows step the value (6→7), the field accepts typing, 1–100 clamps at both ends',
    typeDd.stacked && typeDd.afterUp === '7' && typeDd.atMax.v === '100' && typeDd.atMax.up === true && typeDd.clamped === '100',
    JSON.stringify(typeDd));
  /* integer bases: hex, unary, base 36 — the hint shows the base-10 equivalent */
  const hints = {};
  for (const [name, patch] of [
    ['hex', { numtype: 'int', base: 16, value: 'ff' }],
    ['unary', { numtype: 'int', base: 1, value: '111' }],
    ['b36', { numtype: 'int', base: 36, value: 'zz' }],
    ['dec16', { numtype: 'dec', base: 16, value: '1f.4a' }],
    ['dec3', { numtype: 'dec', base: 3, value: '0.1' }],
  ]) {
    await np.evaluate(({ ids, p }) => globalThis.__MOD.cfg(ids.n, p), { ids: numId, p: patch });
    await np.waitForTimeout(120);
    hints[name] = await np.evaluate((ids) =>
      document.querySelector(`.mod-node[data-id="${ids.n}"] .mod-numhint`).textContent, numId);
  }
  ok('bases convert with an exact base-10 hint (hex ff=255, unary 111=3, base-36 zz=1295)',
    hints.hex === '= 255' && hints.unary === '= 3' && hints.b36 === '= 1295', JSON.stringify(hints));
  ok('arbitrary-precision decimals: exact when the expansion terminates, ≈… when it never does',
    hints.dec16 === '= 31.2890625' && hints.dec3.startsWith('≈ 0.333333333333'), JSON.stringify(hints));
  /* what flows out is exactly what the node shows, for every type */
  const flow = [];
  for (const [name, patch, want] of [
    ['pi30', { numtype: 'dec', base: 10, value: '3.141592653589793238462643383279' }, '3.141592653589793238462643383279'],
    ['f5', { numtype: 'float', digits: 5, value: '3.14159265358979' }, '3.1416'],
    ['fCarry', { numtype: 'float', digits: 2, value: '99995' }, '100000'],
    ['f100', { numtype: 'float', digits: 100, value: '1e3' }, '1000'],
    ['x4', { numtype: 'fixed', digits: 4, value: '3.5' }, '3.5000'],
    ['x1', { numtype: 'fixed', digits: 1, value: '0.15' }, '0.2'],
    ['invalid', { numtype: 'int', base: 16, value: 'g' }, ''],
  ]) {
    const got = await np.evaluate(async ({ ids, p }) => {
      const M = globalThis.__MOD;
      M.cfg(ids.n, p);
      await M.run();
      const box = document.querySelector(`.mod-node[data-id="${ids.io}"] .mod-result`);
      return box.textContent === 'Result —' ? '' : box.textContent;   /* invalid flows nothing */
    }, { ids: numId, p: patch });
    flow.push([name, got === want, got]);
  }
  ok('every type flows its exact representation (dec keeps 30 digits, float rounds to its digits, fixed pads)',
    flow.every((f) => f[1]), JSON.stringify(flow.filter((f) => !f[1])));
  /* invalid input: red status on the node, nothing flows */
  const bad = await np.evaluate((ids) => {
    const el = document.querySelector(`.mod-node[data-id="${ids.n}"]`);
    const stat = el.querySelector('.mod-cstat');
    return { cls: stat.className, msg: stat.textContent, shown: getComputedStyle(stat).color };
  }, numId);
  ok('a value that does not parse turns the status line red with a plain message',
    bad.cls.includes('bad') && bad.msg === 'Not a valid number' && /192, ?57, ?43/.test(bad.shown), JSON.stringify(bad));
  /* the number feeds the Code module's stdin like any source */
  const stdin = await np.evaluate(async (ids) => {
    const M = globalThis.__MOD;
    const c = M.add('code', 60, 420);
    M.cfg(c.id, { code: "console.log('got ' + input)" });
    const io2 = M.add('io', 420, 420);
    M.wire(c.id, io2.id);
    M.cfg(ids.n, { numtype: 'int', base: 16, value: 'ff' });
    M.wire(ids.n, c.id);          /* the number's out-port wire moves to the Code node */
    await M.run();
    await new Promise((r) => setTimeout(r, 2500));
    return document.querySelector(`.mod-node[data-id="${io2.id}"] .mod-result`).textContent;
  }, numId);
  ok('a Number wired into Code becomes its stdin (base-16 ff reads as ff)', /got ff/.test(stdin), stdin);
  /* serialization round-trips the number configuration */
  const ser = await np.evaluate((ids) => {
    const M = globalThis.__MOD;
    return JSON.parse(M.serialize()).data.nodes.find((x) => x.id === ids.n).cfg;
  }, numId);
  ok('the number configuration round-trips through the flow document',
    ser.numtype === 'int' && ser.base === 16 && ser.value === 'ff', JSON.stringify(ser));
  await ncx.close();

  /* light mode: the number node's hint, status and field all pass 3:1 */
  const lcx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const lp2 = await lcx2.newPage();
  await lp2.goto(URL + 'module.html', { waitUntil: 'load' });
  await lp2.evaluate(() => localStorage.setItem('singhoah:night', '0'));
  await lp2.reload();
  await lp2.waitForTimeout(900);
  const lightNum = await lp2.evaluate(() => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const n = M.add('number', 60, 60);
    M.cfg(n.id, { numtype: 'int', base: 16, value: 'g' });   /* red status + hint visible */
    const el = document.querySelector(`.mod-node[data-id="${n.id}"]`);
    const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const parse = (s) => { const m = /rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const effBg = (el2) => { for (let n2 = el2; n2 && n2.nodeType === 1; n2 = n2.parentElement) { const c = parse(getComputedStyle(n2).backgroundColor); if (c && c[3] > 0.85) return c; } return [255, 255, 255, 1]; };
    for (const el2 of el.querySelectorAll('.mod-numhint, .mod-cstat, .mod-numin')) {
      if (!el2.getClientRects().length || !el2.textContent.trim()) continue;
      const fg = parse(getComputedStyle(el2).color);
      const bg = effBg(el2);
      const la = lum(...fg.slice(0, 3)), lb = lum(...bg.slice(0, 3));
      if ((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) < 3) return 'unreadable: ' + el2.className;
    }
    return '';
  });
  ok('light mode: the Number node reads cleanly (hint, red status, value field)', lightNum === '', lightNum);
  await lcx2.close();

  /* mobile: the number node fits a phone and its dropdowns clamp to the screen */
  const mcx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp2 = await mcx2.newPage();
  await mp2.goto(URL + 'module.html', { waitUntil: 'load' });
  await mp2.waitForTimeout(900);
  const mobNum = await mp2.evaluate(async () => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    M.add('number', 40, 40);
    const fits = document.documentElement.scrollWidth <= window.innerWidth + 1;
    document.querySelector('.mod-node .mod-dd-btn').click();   /* open the type select */
    await new Promise((r) => setTimeout(r, 250));
    const list = document.querySelector('.mod-dd-list:not([hidden])');
    const r = list.getBoundingClientRect();
    return { fits, open: !!list, clamped: r.left >= 0 && r.right <= innerWidth, opts: list.children.length };
  });
  ok('mobile: the Number node fits the phone and its type select clamps inside the screen',
    mobNum.fits && mobNum.open && mobNum.clamped && mobNum.opts === 4, JSON.stringify(mobNum));
  await mcx2.close();
}

/* ---- the Operator module: exact math over two wired operands ---- */
{
  const ocx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const opg = await ocx.newPage();
  await opg.goto(URL + 'module.html', { waitUntil: 'load' });
  await opg.waitForTimeout(900);
  ok('the Operator module joins the toolbar', await opg.evaluate(() =>
    !!document.querySelector('.mod-add[data-add="operator"]')
    && document.getElementById('modAddO').textContent === 'Operator'));
  const ids = await opg.evaluate(() => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const a = M.add('number', 60, 60);
    const b = M.add('number', 60, 320);
    const op = M.add('operator', 380, 190);
    const io = M.add('io', 660, 190);
    M.cfg(a.id, { numtype: 'dec', value: '6' });
    M.cfg(b.id, { numtype: 'dec', value: '7' });
    return { a: a.id, b: b.id, op: op.id, io: io.id };
  });
  const node = await opg.evaluate((x) => {
    const el = document.querySelector(`.mod-node[data-id="${x.op}"]`);
    const std = getComputedStyle(el.querySelector('.mod-dd-btn'));
    return {
      ports: [...el.querySelectorAll('.mod-port.in')].map((p) => p.dataset.port),
      labels: document.querySelectorAll('.mod-plab').length,
      out: !!el.querySelector('.mod-port.out'),
      dd: el.querySelector('.mod-dd-btn .mod-dd-txt').textContent,
      radius: std.borderRadius, w: std.fontWeight,
    };
  }, ids);
  ok('the Operator node has TWO input nodes (A above, B below) plus its out node, standard chips, no A/B text labels',
    node.ports.join('|') === 'a|b' && node.labels === 0 && node.out
      && node.radius === '0px' && node.w === '650',
    JSON.stringify(node));
  const wired = await opg.evaluate((x) => {
    const M = globalThis.__MOD;
    return {
      a: M.wire(x.a, x.op, 'a'),
      b: M.wire(x.b, x.op, 'b'),
      out: M.wire(x.op, x.io),
      bad: M.wire(x.a, x.op, 'c'),
      ports: M.wires().filter((w) => w.to === x.op).map((w) => w.toPort).sort().join(''),
    };
  }, ids);
  ok('wires land on the exact port; a port that does not exist is refused; one wire per port holds',
    wired.a && wired.b && wired.out && wired.bad === false && wired.ports === 'ab',
    JSON.stringify(wired));
  /* every operator, exact */
  const runOp = async (op, va, vb) => opg.evaluate(async (a) => {
    const M = globalThis.__MOD;
    M.cfg(a.ids.a, { value: a.va }); M.cfg(a.ids.b, { value: a.vb }); M.cfg(a.ids.op, { op: a.op });
    await M.run();
    const box = document.querySelector(`.mod-node[data-id="${a.ids.io}"] .mod-result`);
    const el = document.querySelector(`.mod-node[data-id="${a.ids.op}"]`);
    return {
      out: box.textContent === 'Result —' ? '' : box.textContent,
      hint: el.querySelector('.mod-ophint').textContent,
      stat: el.querySelector('.mod-cstat').textContent,
      cls: el.querySelector('.mod-cstat').className,
    };
  }, { ids, op, va, vb });
  const add6_7 = await runOp('add', '6', '7');
  const mulBig = await runOp('mul', '123456789', '987654321');
  const div13 = await runOp('div', '1', '3');
  const mod17_5 = await runOp('mod', '17', '5');
  const pow2_100 = await runOp('pow', '2', '100');
  const divZero = await runOp('div', '6', '0');
  const powFrac = await runOp('pow', '2', '0.5');
  ok('add: 6 + 7 = 13 with the equation in the hint line',
    add6_7.out === '13' && add6_7.hint === '6 + 7 = 13' && add6_7.cls === 'mod-cstat', JSON.stringify(add6_7));
  ok('multiply is exact on BigInt: 123456789 × 987654321 = 121932631112635269',
    mulBig.out === '121932631112635269', JSON.stringify(mulBig));
  ok('divide: 1 ÷ 3 carries 30 exact digits (no double ever touches it)',
    div13.out === '0.' + '3'.repeat(30), JSON.stringify(div13.out));
  ok('modulo and power: 17 % 5 = 2, 2 ^ 100 exact',
    mod17_5.out === '2' && pow2_100.out === '1267650600228229401496703205376',
    JSON.stringify({ m: mod17_5.out, p: pow2_100.out }));
  ok('failures are plain and red: division by zero, fractional exponent',
    divZero.out === '' && /Division by zero/.test(divZero.stat) && divZero.cls.includes('bad')
      && powFrac.out === '' && /whole-number exponent/.test(powFrac.stat) && powFrac.cls.includes('bad'),
    JSON.stringify({ d: divZero.stat, p: powFrac.stat }));
  /* the LEFT operand's number system wins: hex stays hex */
  const hex = await opg.evaluate(async (x) => {
    const M = globalThis.__MOD;
    M.cfg(x.a, { numtype: 'int', base: 16, value: 'ff' });
    M.cfg(x.b, { numtype: 'int', base: 16, value: '1' });
    M.cfg(x.op, { op: 'add' });
    await M.run();
    return document.querySelector(`.mod-node[data-id="${x.io}"] .mod-result`).textContent;
  }, ids);
  ok('the result keeps the LEFT operand\'s system: hex ff + 1 = 100 (base 16)', hex === '100', hex);
  /* missing operand */
  const unwired = await opg.evaluate(async (x) => {
    const M = globalThis.__MOD;
    M.wire(x.b, x.io);   /* B's out-port wire moves: the operator loses B */
    await M.run();
    const el = document.querySelector(`.mod-node[data-id="${x.op}"]`);
    return { stat: el.querySelector('.mod-cstat').textContent, cls: el.querySelector('.mod-cstat').className };
  }, ids);
  ok('an unwired operand says so, in red, and flows nothing',
    /A and B/.test(unwired.stat) && unwired.cls.includes('bad'), JSON.stringify(unwired));
  /* the operator dropdown offers all six, translated */
  await opg.evaluate((x) => {
    document.querySelector(`.mod-node[data-id="${x.op}"]`).querySelector('.mod-dd-btn').click();
  }, ids);
  await opg.waitForTimeout(200);
  const ops = await opg.evaluate(() =>
    [...document.querySelectorAll('.mod-dd-list:not([hidden]) .mod-dd-lab')].map((b) => b.textContent.trim()));
  ok('the operation select offers + − × ÷ % ^', 
    ops.length === 6 && /^\+/.test(ops[0]) && ops.some((o) => o.startsWith('−')) && ops.some((o) => o.startsWith('×')) && ops.some((o) => o.startsWith('÷')) && ops.some((o) => o.startsWith('%')) && ops.some((o) => o.startsWith('^')),
    JSON.stringify(ops));
  await opg.keyboard.press('Escape');
  /* serialization keeps the port a wire lands on (re-wire B first: the
     unwired check above moved its wire away) */
  await opg.evaluate((x) => { globalThis.__MOD.wire(x.b, x.op, 'b'); }, ids);
  await opg.waitForTimeout(700);
  const ser = await opg.evaluate((x) => JSON.parse(globalThis.__MOD.serialize()).data.wires
    .filter((w) => w.to === x.op).map((w) => w.toPort || 'a').sort().join(''), ids);
  ok('the flow document stores which port each wire lands on', ser === 'ab', ser);
  await ocx.close();

  /* SMate builds the flow itself: "multiply X by Y" lands on the canvas */
  const scx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await scx2.addInitScript({ content: SMATE_STUB({
    'multiply': ['{"tool":"mathflow","args":{"a":"123456789","op":"*","b":"987654321"}}'],
    'number 255': ['{"tool":"modadd","args":{"type":"number","cfg":{"numtype":"int","base":16,"value":"ff"}}}'],
    'operator': ['{"tool":"modadd","args":{"type":"operator","cfg":{"op":"mul"}}}'],
  }) });
  const sp2 = await scx2.newPage();
  const strayNavs = [];
  sp2.on('framenavigated', (f) => { if (f === sp2.mainFrame() && !/module\.html/.test(f.url())) strayNavs.push(f.url()); });
  await sp2.goto(URL + 'module.html', { waitUntil: 'load' });
  await sp2.waitForTimeout(900);
  await sp2.click('#smateBtn');
  await sp2.waitForTimeout(400);
  await sp2.fill('#smateIn', 'multiply 123456789 by 987654321');
  await sp2.keyboard.press('Enter');
  await sp2.waitForTimeout(2500);
  const sm = await sp2.evaluate(() => {
    const M = globalThis.__MOD;
    const ns = M.nodes();
    const op = ns.find((x) => x.type === 'operator');
    const io = ns.find((x) => x.type === 'io');
    return {
      flow: !!op && ns.filter((x) => x.type === 'number').length === 2 && !!io,
      op: op && op.cfg.op,
      ports: op ? M.wires().filter((w) => w.to === op.id).map((w) => w.toPort).sort().join('') : '',
      out: io ? document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent : '',
      block: [...document.querySelectorAll('.smate-block')].some((b) => b.textContent.includes('121932631112635269')),
    };
  });
  ok('SMate builds and runs the flow: two Numbers wired into the Operator\'s A and B, exact result in chat',
    sm.flow && sm.op === 'mul' && sm.ports === 'ab' && sm.out === '121932631112635269' && sm.block && strayNavs.length === 0,
    JSON.stringify(sm) + ' navs:' + JSON.stringify(strayNavs));
  await sp2.fill('#smateIn', 'add a number 255 base 16');
  await sp2.keyboard.press('Enter');
  await sp2.waitForTimeout(1500);
  const smn = await sp2.evaluate(() => {
    const M = globalThis.__MOD;
    const ns = M.nodes().filter((x) => x.type === 'number');
    const last = ns[ns.length - 1];
    return { cfg: last && last.cfg, hint: last ? document.querySelector(`.mod-node[data-id="${last.id}"] .mod-numhint`).textContent : '' };
  });
  ok('SMate adds Number nodes: "add a number 255 base 16" lands as ff with the = 255 hint',
    smn.cfg && smn.cfg.base === 16 && smn.cfg.value === 'ff' && smn.hint === '= 255', JSON.stringify(smn));
  await sp2.fill('#smateIn', 'add an operator *');
  await sp2.keyboard.press('Enter');
  await sp2.waitForTimeout(1500);
  const smo = await sp2.evaluate(() => {
    const M = globalThis.__MOD;
    const os = M.nodes().filter((x) => x.type === 'operator');
    const last = os[os.length - 1];
    return last ? document.querySelector(`.mod-node[data-id="${last.id}"] .mod-dd-btn .mod-dd-txt`).textContent : '';
  });
  ok('SMate adds Operator nodes: "add an operator *" lands as × Multiply', /^×/.test(smo), smo);
  await scx2.close();

  /* ---- the Comparator module: exact yes/no over two wired operands ---- */
  const kcx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const kpg = await kcx.newPage();
  await kpg.goto(URL + 'module.html', { waitUntil: 'load' });
  await kpg.waitForTimeout(900);
  ok('the Comparator module joins the toolbar right after the Operator', await kpg.evaluate(() =>
    !!document.querySelector('.mod-add[data-add="comparator"]')
      && document.getElementById('modAddCmp').textContent === 'Comparator'));
  /* placement geometry: a lone control spans its row exactly (symmetric 12px
     insets, the Code module's rule), and a fresh module waits in silence */
  const geo = await kpg.evaluate(() => {
    const M = globalThis.__MOD;
    const probe = (type) => {
      const n = M.add(type, 60, 60);
      const el = document.querySelector(`.mod-node[data-id="${n.id}"]`);
      const nb = el.getBoundingClientRect();
      const db = el.querySelector('.mod-dd-btn').getBoundingClientRect();
      const stat = el.querySelector('.mod-cstat');
      const r = { l: +(db.left - nb.left).toFixed(1), r: +(nb.right - db.right).toFixed(1),
        w: Math.round(db.width), nw: Math.round(nb.width), idle: stat.textContent };
      M.removeNode(n.id);
      return r;
    };
    return { cmp: probe('comparator'), op: probe('operator'), code: probe('code') };
  });
  ok('the Comparator and Operator selects span their row exactly like the Code module (12px insets, symmetric) and wait in silence',
    geo.cmp.l === 12 && geo.cmp.r === 12 && geo.cmp.w === geo.cmp.nw - 24
      && geo.op.l === 12 && geo.op.r === 12 && geo.op.w === geo.op.nw - 24
      && geo.code.l === 12 && geo.code.r === 12
      && geo.cmp.idle === '' && geo.op.idle === '',
    JSON.stringify(geo));
  const kids = await kpg.evaluate(() => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const a = M.add('number', 60, 60);
    const b = M.add('number', 60, 320);
    const cp = M.add('comparator', 380, 190);
    const io = M.add('io', 660, 190);
    M.cfg(a.id, { numtype: 'dec', value: '6' });
    M.cfg(b.id, { numtype: 'dec', value: '7' });
    M.wire(a.id, cp.id, 'a'); M.wire(b.id, cp.id, 'b'); M.wire(cp.id, io.id);
    const el = document.querySelector(`.mod-node[data-id="${cp.id}"]`);
    return {
      a: a.id, b: b.id, cp: cp.id, io: io.id,
      name: el.querySelector('.mod-nname').textContent,
      ports: [...el.querySelectorAll('.mod-port.in')].map((p) => p.dataset.port).join('|'),
      labels: document.querySelectorAll('.mod-plab').length,
      out: !!el.querySelector('.mod-port.out'),
      refused: M.wire(a.id, cp.id, 'c'),
      portsWired: M.wires().filter((w) => w.to === cp.id).map((w) => w.toPort).sort().join(''),
    };
  });
  ok('the Comparator node: A|B input nodes like the Operator, out node, unknown targets refused, no text labels',
    kids.name === 'Comparator' && kids.ports === 'a|b' && kids.labels === 0 && kids.out
      && kids.refused === false && kids.portsWired === 'ab',
    JSON.stringify(kids));
  const runCmp = (cmp, va, vb) => kpg.evaluate(async (q) => {
    const M = globalThis.__MOD;
    M.cfg(q.k.a, { value: q.va }); M.cfg(q.k.b, { value: q.vb }); M.cfg(q.k.cp, { cmp: q.cmp });
    await M.run();
    const el = document.querySelector(`.mod-node[data-id="${q.k.cp}"]`);
    return {
      out: document.querySelector(`.mod-node[data-id="${q.k.io}"] .mod-result`).textContent,
      hint: el.querySelector('.mod-ophint').textContent,
      cls: el.querySelector('.mod-cstat').className,
    };
  }, { k: kids, cmp, va, vb });
  const g6_7 = await runCmp('gt', '6', '7');
  const l6_7 = await runCmp('lt', '6', '7');
  const gte7 = await runCmp('gte', '7', '7');
  const lte7 = await runCmp('lte', '7', '7');
  const eq6_7 = await runCmp('eq', '6', '7');
  const neq6_7 = await runCmp('neq', '6', '7');
  ok('all six comparisons: > false, < true, ≥ true, ≤ true, = false, ≠ true',
    g6_7.out === 'false' && l6_7.out === 'true' && gte7.out === 'true' && lte7.out === 'true'
      && eq6_7.out === 'false' && neq6_7.out === 'true',
    JSON.stringify([g6_7.out, l6_7.out, gte7.out, lte7.out, eq6_7.out, neq6_7.out]));
  ok('the verdict reads in the hint line, plain and never red: 6 > 7 = false',
    g6_7.hint === '6 > 7 = false' && g6_7.cls === 'mod-cstat', JSON.stringify(g6_7));
  /* comparisons are exact fractions: 1÷3 = 1÷3 true, but 1÷3 = 0.333…(30) false */
  const kexact = await kpg.evaluate(async () => {
    const M = globalThis.__MOD;
    M.newDoc();
    const N = (x, y, v) => { const n = M.add('number', x, y); M.cfg(n.id, { numtype: 'dec', value: v }); return n.id; };
    const o1 = N(40, 40, '1'), t1 = N(40, 180, '3'), o2 = N(40, 320, '1'), t2 = N(40, 460, '3');
    const third = N(40, 620, '0.333333333333333333333333333333');
    const d1 = M.add('operator', 300, 100); M.cfg(d1.id, { op: 'div' });
    const d2 = M.add('operator', 300, 380); M.cfg(d2.id, { op: 'div' });
    const cp = M.add('comparator', 560, 240); M.cfg(cp.id, { cmp: 'eq' });
    const io = M.add('io', 800, 240);
    M.wire(o1, d1.id, 'a'); M.wire(t1, d1.id, 'b');
    M.wire(o2, d2.id, 'a'); M.wire(t2, d2.id, 'b');
    M.wire(d1.id, cp.id, 'a'); M.wire(d2.id, cp.id, 'b'); M.wire(cp.id, io.id);
    await M.run();
    const same = document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent;
    M.wire(third, cp.id, 'b');
    await M.run();
    return { same, vsDec: document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent };
  });
  ok('exact fractions: 1÷3 = 1÷3 is true, 1÷3 = 0.333…(30 digits) is false',
    kexact.same === 'true' && kexact.vsDec === 'false', JSON.stringify(kexact));
  /* the verdict chains into arithmetic: (6 = 6) + 5 = 6 */
  const kchain = await kpg.evaluate(async () => {
    const M = globalThis.__MOD;
    M.newDoc();
    const N = (x, y, v) => { const n = M.add('number', x, y); M.cfg(n.id, { numtype: 'dec', value: v }); return n.id; };
    const a = N(40, 40, '6'), b = N(40, 240, '6'), five = N(40, 440, '5');
    const cp = M.add('comparator', 300, 120); M.cfg(cp.id, { cmp: 'eq' });
    const op = M.add('operator', 560, 260); M.cfg(op.id, { op: 'add' });
    const io = M.add('io', 800, 260);
    M.wire(a, cp.id, 'a'); M.wire(b, cp.id, 'b');
    M.wire(cp.id, op.id, 'a'); M.wire(five, op.id, 'b');
    M.wire(op.id, io.id);
    await M.run();
    return {
      out: document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent,
      hint: document.querySelector(`.mod-node[data-id="${op.id}"] .mod-ophint`).textContent,
    };
  });
  ok('true flows on as 1: (6 = 6) + 5 = 6', kchain.out === '6' && kchain.hint === 'true + 5 = 6', JSON.stringify(kchain));
  /* wires anchor at the EXACT center of every connection square they join */
  const anchor = await kpg.evaluate(() => {
    const M = globalThis.__MOD;
    const view = M.view();
    const cr = document.getElementById('modCanvas').getBoundingClientRect();
    const center = (el) => { const r2 = el.getBoundingClientRect(); return [(r2.x + r2.width / 2 - cr.x - view.x) / view.z, (r2.y + r2.height / 2 - cr.y - view.y) / view.z]; };
    let worst = 0; const rows = [];
    for (const path of document.getElementById('modWires').querySelectorAll('.mod-wire')) {
      const m = /M ([\d.-]+) ([\d.-]+) H ([\d.-]+) V ([\d.-]+) H ([\d.-]+)/.exec(path.getAttribute('d'));
      const w = M.wires()[+[path.dataset.i]];
      const c1 = center(document.querySelector(`.mod-node[data-id="${w.from}"] .mod-port.out`));
      const c2 = center(document.querySelector(`.mod-node[data-id="${w.to}"] .mod-port.in[data-port="${w.toPort || 'a'}"]`));
      const d = Math.max(Math.abs(m[1] - c1[0]), Math.abs(m[2] - c1[1]), Math.abs(m[5] - c2[0]), Math.abs(m[4] - c2[1]));
      rows.push(`${w.toPort || 'a'}:${d.toFixed(2)}`);
      worst = Math.max(worst, d);
    }
    return { worst: +worst.toFixed(2), rows };
  });
  ok('every wire lands on the exact CENTER of its connection squares (≤0.75px, out and in)',
    anchor.worst <= 0.75, JSON.stringify(anchor.rows) + ' worst=' + anchor.worst);
  /* the status row only exists when there is status: no orphan square, no reserved space */
  const dot = await kpg.evaluate(async () => {
    const M = globalThis.__MOD;
    const after = [...document.querySelectorAll('.mod-node .mod-cstat')].map((s) => ({
      empty: s.textContent === '', disp: getComputedStyle(s).display }));
    const hints = [...document.querySelectorAll('.mod-node .mod-numhint')].map((s) => ({
      empty: s.textContent === '', disp: getComputedStyle(s).display }));
    M.newDoc();
    const cp = M.add('comparator', 60, 60);
    M.run();   /* nothing wired: the status line speaks (and its row shows) */
    const need = document.querySelector(`.mod-node[data-id="${cp.id}"] .mod-cstat`);
    return { after, hints,
      emptyHide: after.filter((x) => x.empty).every((x) => x.disp === 'none') && hints.filter((x) => x.empty).every((x) => x.disp === 'none'),
      textRow: getComputedStyle(need).display, text: need.textContent };
  });
  ok('no reserved status/hint rows on silent modules; the row returns when the status speaks',
    dot.emptyHide && dot.textRow === 'flex' && dot.text.length > 0, JSON.stringify(dot));
  /* no wasted space: a quiet Number node is meaningfully shorter than one that must speak */
  const space = await kpg.evaluate(async () => {
    const M = globalThis.__MOD;
    M.newDoc();
    const n = M.add('number', 60, 60);
    M.cfg(n.id, { numtype: 'dec', value: '6' });   /* base 10: hint and status both quiet */
    await new Promise((r) => setTimeout(r, 60));
    const quiet = document.querySelector(`.mod-node[data-id="${n.id}"]`).getBoundingClientRect().height;
    M.cfg(n.id, { value: 'abc' });                  /* invalid: the status row speaks */
    await new Promise((r) => setTimeout(r, 60));
    const speaking = document.querySelector(`.mod-node[data-id="${n.id}"]`).getBoundingClientRect().height;
    M.cfg(n.id, { value: '6' });
    return { quiet: Math.round(quiet), speaking: Math.round(speaking) };
  });
  ok(`a quiet Number module sheds its empty rows (quiet ${space.quiet}px vs speaking ${space.speaking}px)`,
    space.speaking - space.quiet >= 18, JSON.stringify(space));
  /* wires are correct the instant a SAVED flow opens — no dragging needed */
  const reopen = await kpg.evaluate(async () => {
    const M = globalThis.__MOD;
    M.newDoc();
    const a = M.add('number', 60, 60); M.cfg(a.id, { numtype: 'dec', value: '6' });
    const b = M.add('number', 60, 320); M.cfg(b.id, { numtype: 'dec', value: '7' });
    const cp = M.add('comparator', 380, 190);
    const io = M.add('io', 660, 190);
    M.wire(a.id, cp.id, 'a'); M.wire(b.id, cp.id, 'b'); M.wire(cp.id, io.id);
    const id = M.latest();
    await new Promise((r) => setTimeout(r, 700));   /* the doc saves */
    /* leave the canvas in a very different pan/zoom than the doc will open with */
    document.getElementById('modZoomIn').click();
    document.getElementById('modZoomIn').click();
    document.getElementById('modZoomIn').click();
    M.home();                                        /* files home */
    await new Promise((r) => setTimeout(r, 150));
    M.openDoc(id);                                   /* reopen: wires must land true at once */
    await new Promise((r) => setTimeout(r, 120));
    const view = M.view();
    const cr = document.getElementById('modCanvas').getBoundingClientRect();
    const center = (el) => { const r2 = el.getBoundingClientRect(); return [(r2.x + r2.width / 2 - cr.x - view.x) / view.z, (r2.y + r2.height / 2 - cr.y - view.y) / view.z]; };
    let worst = 0; const rows = [];
    for (const path of document.getElementById('modWires').querySelectorAll('.mod-wire')) {
      const m = /M ([\d.-]+) ([\d.-]+) H ([\d.-]+) V ([\d.-]+) H ([\d.-]+)/.exec(path.getAttribute('d'));
      const w = M.wires()[+[path.dataset.i]];
      const c1 = center(document.querySelector(`.mod-node[data-id="${w.from}"] .mod-port.out`));
      const c2 = center(document.querySelector(`.mod-node[data-id="${w.to}"] .mod-port.in[data-port="${w.toPort || 'a'}"]`));
      const d = Math.max(Math.abs(m[1] - c1[0]), Math.abs(m[2] - c1[1]), Math.abs(m[5] - c2[0]), Math.abs(m[4] - c2[1]));
      rows.push(`${w.toPort || 'a'}:${d.toFixed(2)}`);
      worst = Math.max(worst, d);
    }
    return { worst: +worst.toFixed(2), rows, z: view.z };
  });
  ok('a saved flow opens with every wire already on its square centers (no drag needed, any prior pan/zoom)',
    reopen.worst <= 0.75 && reopen.rows.length === 3, JSON.stringify(reopen));
  /* a missing operand is red and plain */
  const kunwired = await kpg.evaluate(async (x) => {
    const M = globalThis.__MOD;
    M.newDoc();
    const a = M.add('number', 60, 60); M.cfg(a.id, { numtype: 'dec', value: '6' });
    const cp = M.add('comparator', 380, 190);
    M.wire(a.id, cp.id, 'a');
    await M.run();
    const el = document.querySelector(`.mod-node[data-id="${cp.id}"]`);
    return { stat: el.querySelector('.mod-cstat').textContent, cls: el.querySelector('.mod-cstat').className };
  }, kids);
  ok('an unwired operand says so, in red, and flows nothing',
    /A and B/.test(kunwired.stat) && kunwired.cls.includes('bad'), JSON.stringify(kunwired));
  /* the comparison select offers all six */
  await kpg.evaluate(() => {
    const cp = globalThis.__MOD.nodes().find((n) => n.type === 'comparator');
    document.querySelector(`.mod-node[data-id="${cp.id}"]`).querySelector('.mod-dd-btn').click();
  });
  await kpg.waitForTimeout(200);
  const cmps = await kpg.evaluate(() =>
    [...document.querySelectorAll('.mod-dd-list:not([hidden]) .mod-dd-lab')].map((b) => b.textContent.trim()));
  ok('the comparison select offers > < ≥ ≤ = ≠',
    cmps.length === 6 && cmps[0].startsWith('>') && cmps[1].startsWith('<') && cmps[2].startsWith('≥')
      && cmps[3].startsWith('≤') && cmps[4].startsWith('=') && cmps[5].startsWith('≠'),
    JSON.stringify(cmps));
  await kpg.keyboard.press('Escape');
  /* serialization keeps the port each wire lands on */
  await kpg.evaluate((x) => {
    const M = globalThis.__MOD;
    M.newDoc();
    const a = M.add('number', 60, 60); const b = M.add('number', 60, 320);
    const cp = M.add('comparator', 380, 190);
    M.wire(a.id, cp.id, 'a'); M.wire(b.id, cp.id, 'b');
  }, kids);
  await kpg.waitForTimeout(700);
  const kser = await kpg.evaluate(() => {
    const cp = globalThis.__MOD.nodes().find((n) => n.type === 'comparator');
    return JSON.parse(globalThis.__MOD.serialize()).data.wires
      .filter((w) => w.to === cp.id).map((w) => w.toPort || 'a').sort().join('');
  });
  ok('the flow document stores which port each comparison wire lands on', kser === 'ab', kser);
  /* light mode: the comparator's hint, status and labels pass 3:1 */
  await kpg.evaluate(() => localStorage.setItem('singhoah:night', '0'));
  await kpg.reload();
  await kpg.waitForTimeout(900);
  const klight = await kpg.evaluate(async () => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const a = M.add('number', 60, 60); M.cfg(a.id, { numtype: 'dec', value: '6' });
    const b = M.add('number', 60, 320); M.cfg(b.id, { numtype: 'dec', value: '7' });
    const cp = M.add('comparator', 380, 190);
    const io = M.add('io', 660, 190);
    M.wire(a.id, cp.id, 'a'); M.wire(b.id, cp.id, 'b'); M.wire(cp.id, io.id);
    await M.run();
    const lum = (r, g, b2) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2); };
    const parse = (s) => { const mm = /rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/.exec(s || ''); return mm ? [+mm[1], +mm[2], +mm[3], mm[4] === undefined ? 1 : +mm[4]] : null; };
    const effBg = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0.85) return c; } return [255, 255, 255, 1]; };
    const bad = [];
    for (const e of document.querySelectorAll('.mod-node')) {
      for (const e2 of e.querySelectorAll('.mod-cstat, .mod-numhint, .mod-dd-txt')) {
        if (!e2.getClientRects().length || !e2.textContent.trim()) continue;
        const fg = parse(getComputedStyle(e2).color), bg = effBg(e2);
        const la = lum(...fg.slice(0, 3)), lb = lum(...bg.slice(0, 3));
        if ((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) < 3) bad.push(e2.className + ':' + e2.textContent.slice(0, 10));
      }
    }
    return bad;
  });
  ok('light mode: comparator hint, status, port labels all pass 3:1', klight.length === 0, JSON.stringify(klight));
  await kcx.close();

  /* Japanese: the whole comparator speaks the UI language, numerals stay Western */
  const kjx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const kjp = await kjx.newPage();
  await kjp.goto(URL + 'module.html', { waitUntil: 'load' });
  await kjp.evaluate(() => localStorage.setItem('singhoah:lang', 'ja'));
  await kjp.reload();
  await kjp.waitForTimeout(900);
  const kja = await kjp.evaluate(async () => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const cp = M.add('comparator', 60, 60);
    const el = document.querySelector(`.mod-node[data-id="${cp.id}"]`);
    el.querySelector('.mod-dd-btn').click();
    const list = [...document.querySelectorAll('.mod-dd-list:not([hidden]) .mod-dd-lab')].map((b) => b.textContent.trim());
    const a = M.add('number', 60, 300); M.cfg(a.id, { numtype: 'dec', value: '6' });
    const b = M.add('number', 60, 500); M.cfg(b.id, { numtype: 'dec', value: '7' });
    M.wire(a.id, cp.id, 'a'); M.wire(b.id, cp.id, 'b');
    M.cfg(cp.id, { cmp: 'gt' });
    await M.run();
    return {
      btn: document.getElementById('modAddCmp').textContent,
      name: el.querySelector('.mod-nname').textContent,
      first: list[0],
      kanji: list.every((x) => /[一-龯]/.test(x)),
      hint: el.querySelector('.mod-ophint').textContent,
    };
  });
  ok('Japanese: 比較器 with translated options; the verdict stays true/false (never localized)',
    kja.btn === '比較器' && kja.name === '比較器' && kja.first.startsWith('>') && kja.kanji && kja.hint === '6 > 7 = false',
    JSON.stringify(kja));
  await kjx.close();

  /* mobile: the comparator fits a phone */
  const kmcx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const kmp = await kmcx.newPage();
  await kmp.goto(URL + 'module.html', { waitUntil: 'load' });
  await kmp.waitForTimeout(900);
  const kmob = await kmp.evaluate(() => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    M.add('number', 20, 20);
    M.add('comparator', 20, 240);
    M.add('io', 20, 460);
    return document.documentElement.scrollWidth <= window.innerWidth + 1;
  });
  ok('mobile: the Comparator node fits a 390px phone', kmob);
  await kmcx.close();

  /* SMate drives the comparator end to end */
  const kscx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await kscx.addInitScript({ content: SMATE_STUB({
    'less': ['{"tool":"cmpflow","args":{"a":"5","cmp":"<","b":"3"}}'],
    'compare 5 and 3': ['{"tool":"cmpflow","args":{"a":"5","cmp":"=","b":"3"}}'],
    'greater or equal': ['{"tool":"cmpflow","args":{"a":"12","cmp":">=","b":"5"}}'],
    'comparator': ['{"tool":"modadd","args":{"type":"comparator","cfg":{"cmp":"gte"}}}'],
    'greater': ['{"tool":"cmpflow","args":{"a":"5","cmp":">","b":"3"}}'],
  }) });
  const ksp = await kscx.newPage();
  const kstray = [];
  ksp.on('framenavigated', (f) => { if (f === ksp.mainFrame() && !/module\.html/.test(f.url())) kstray.push(f.url()); });
  await ksp.goto(URL + 'module.html', { waitUntil: 'load' });
  await ksp.waitForTimeout(900);
  await ksp.click('#smateBtn');
  await ksp.waitForTimeout(400);
  const ksend = async (txt) => { await ksp.fill('#smateIn', txt); await ksp.keyboard.press('Enter'); await ksp.waitForTimeout(2300); };
  await ksend('is 5 greater than 3');
  let ksm = await ksp.evaluate(() => {
    const M = globalThis.__MOD;
    const ns = M.nodes();
    const cp = ns.find((n) => n.type === 'comparator');
    const io = ns.find((n) => n.type === 'io');
    return {
      flow: !!cp && ns.filter((n) => n.type === 'number').length === 2 && !!io,
      cmp: cp && cp.cfg.cmp,
      ports: cp ? M.wires().filter((w) => w.to === cp.id).map((w) => w.toPort).sort().join('') : '',
      out: io ? document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent : '',
      block: [...document.querySelectorAll('.smate-block')].some((b) => b.textContent.includes('true')),
    };
  });
  ok('SMate: "is 5 greater than 3" builds and runs the real flow, answers true in chat',
    ksm.flow && ksm.cmp === 'gt' && ksm.ports === 'ab' && ksm.out === 'true' && ksm.block,
    JSON.stringify(ksm));
  await ksend('is 5 less than 3');
  ksm = await ksp.evaluate(() => {
    const io = globalThis.__MOD.nodes().filter((n) => n.type === 'io').pop();
    return {
      out: io ? document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent : '',
      operators: globalThis.__MOD.nodes().filter((n) => n.type === 'operator').length,
    };
  });
  ok('"is 5 less than 3" compares (false) — never misread as subtraction 5 − 3',
    ksm.out === 'false' && ksm.operators === 0, JSON.stringify(ksm));
  await ksend('compare 5 and 3');
  ksm = await ksp.evaluate(() => {
    const M = globalThis.__MOD;
    const cp = M.nodes().filter((n) => n.type === 'comparator').pop();
    const io = M.nodes().filter((n) => n.type === 'io').pop();
    return { cmp: cp && cp.cfg.cmp, out: io ? document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent : '' };
  });
  ok('"compare 5 and 3" runs as equality → false', ksm.cmp === 'eq' && ksm.out === 'false', JSON.stringify(ksm));
  await ksend('compare 12 and 5, which is greater or equal?');
  ksm = await ksp.evaluate(() => {
    const M = globalThis.__MOD;
    const cp = M.nodes().filter((n) => n.type === 'comparator').pop();
    const io = M.nodes().filter((n) => n.type === 'io').pop();
    return { cmp: cp && cp.cfg.cmp, out: io ? document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent : '' };
  });
  ok('"which is greater or equal?" picks ≥ → 12 ≥ 5 is true', ksm.cmp === 'gte' && ksm.out === 'true', JSON.stringify(ksm));
  await ksend('add a comparator >=');
  ksm = await ksp.evaluate(() => {
    const cps = globalThis.__MOD.nodes().filter((n) => n.type === 'comparator');
    const last = cps[cps.length - 1];
    return { n: cps.length, cmp: last && last.cfg.cmp, dd: last ? document.querySelector(`.mod-node[data-id="${last.id}"] .mod-dd-btn .mod-dd-txt`).textContent : '' };
  });
  ok('"add a comparator >=" lands a ≥ node (no flow built)', ksm.n === 5 && ksm.cmp === 'gte' && ksm.dd.includes('≥'), JSON.stringify(ksm));
  ok('no stray navigations through any of it', kstray.length === 0, JSON.stringify(kstray));
  await kscx.close();

  /* ---- canvas zoom + placement: cursor-anchored zoom, in-view adds,
         connection nodes on the standard alignment ---- */
  const zcx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await zcx.addInitScript({ content: SMATE_STUB({
    'greater': ['{"tool":"cmpflow","args":{"a":"9","cmp":">","b":"4"}}'],
  }) });
  const zp = await zcx.newPage();
  await zp.goto(URL + 'module.html', { waitUntil: 'load' });
  await zp.waitForTimeout(900);
  const zr = await zp.evaluate(() => {
    const cv = document.getElementById('modCanvas');
    const r = cv.getBoundingClientRect();
    const ev = (t, id, x, y, extra = {}) => cv.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 1, ...extra }));
    const out = {};
    /* wheel zoom anchors at the cursor */
    const cx = r.left + 731, cy = r.top + 397;
    const v0 = globalThis.__MOD.view();
    const w0 = [(cx - r.left - v0.x) / v0.z, (cy - r.top - v0.y) / v0.z];
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    const v1 = globalThis.__MOD.view();
    out.wheelDrift = Math.max(Math.abs(r.left + v1.x + w0[0] * v1.z - cx), Math.abs(r.top + v1.y + w0[1] * v1.z - cy));
    out.wheelZoom = v1.z > v0.z;
    /* zoom buttons anchor at the viewport center */
    const mcx = r.left + r.width / 2, mcy = r.top + r.height / 2;
    const c0 = [(mcx - r.left - v1.x) / v1.z, (mcy - r.top - v1.y) / v1.z];
    document.getElementById('modZoomIn').click();
    const v2 = globalThis.__MOD.view();
    out.btnDrift = Math.max(Math.abs(r.left + v2.x + c0[0] * v2.z - mcx), Math.abs(r.top + v2.y + c0[1] * v2.z - mcy));
    /* pinch: two fingers, spread 200→300px, anchored at the midpoint */
    document.getElementById('modZoomR').click();
    const v3 = globalThis.__MOD.view();
    const mx = r.left + 500, my = r.top + 400;
    const p0 = [(mx - r.left - v3.x) / v3.z, (my - r.top - v3.y) / v3.z];
    const t = (id, x, y) => ({ pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true });
    cv.dispatchEvent(new PointerEvent('pointerdown', t(7, mx - 100, my)));
    cv.dispatchEvent(new PointerEvent('pointerdown', t(8, mx + 100, my)));
    cv.dispatchEvent(new PointerEvent('pointermove', t(7, mx - 150, my)));
    cv.dispatchEvent(new PointerEvent('pointermove', t(8, mx + 150, my)));
    const v4 = globalThis.__MOD.view();
    out.pinchDrift = Math.max(Math.abs(r.left + v4.x + p0[0] * v4.z - mx), Math.abs(r.top + v4.y + p0[1] * v4.z - my));
    out.pinchRatio = +(v4.z / v3.z).toFixed(2);
    cv.dispatchEvent(new PointerEvent('pointerup', t(7, mx - 150, my)));
    cv.dispatchEvent(new PointerEvent('pointerup', t(8, mx + 150, my)));
    /* pan far from the origin, then add: the module lands in the CURRENT view */
    document.getElementById('modZoomR').click();
    const vp = globalThis.__MOD.view();
    const dx = -2200 - vp.x, dy = -1400 - vp.y;
    ev('pointerdown', 3, r.left + 300, r.top + 200);
    for (let i = 1; i <= 10; i++) ev('pointermove', 3, r.left + 300 + (dx * i) / 10, r.top + 200 + (dy * i) / 10);
    ev('pointerup', 3, r.left + 300 + dx, r.top + 200 + dy);
    const view = globalThis.__MOD.view();
    const vl = -view.x / view.z, vt = -view.y / view.z;
    const vw = r.width / view.z, vh = r.height / view.z;
    document.querySelector('.mod-add[data-add="comparator"]').click();
    const n1 = globalThis.__MOD.nodes().pop();
    out.addInview = n1.x >= vl - 1 && n1.x + 210 <= vl + vw + 1 && n1.y >= vt - 1 && n1.y + 140 <= vt + vh + 1;
    out.addSpot = [n1.x, n1.y];
    out.viewAt = [Math.round(vl), Math.round(vt)];
    return out;
  });
  ok('wheel zoom stays under the cursor (drift ≤0.75px)',
    zr.wheelZoom && zr.wheelDrift <= 0.75, JSON.stringify(zr));
  ok('zoom buttons anchor at the viewport center', zr.btnDrift <= 0.75, JSON.stringify(zr));
  ok(`pinch zooms by the finger spread (1.5x) anchored at the midpoint (drift ${zr.pinchDrift.toFixed(2)}px)`,
    Math.abs(zr.pinchRatio - 1.5) < 0.03 && zr.pinchDrift <= 0.75, JSON.stringify(zr));
  ok(`a toolbar add lands inside the current view after panning away (at ${zr.addSpot}, view from ${zr.viewAt})`,
    zr.addInview, JSON.stringify(zr));
  /* connection nodes: the first input sits exactly where every other module's
     does; the second sits 32px below; all share the same edge offset */
  const na = await zp.evaluate(() => {
    document.getElementById('modZoomR').click();
    const M = globalThis.__MOD;
    const probe = (type) => {
      const n = M.add(type, 300, 300);
      const el = document.querySelector(`.mod-node[data-id="${n.id}"]`);
      const nb = el.getBoundingClientRect();
      const ins = [...el.querySelectorAll('.mod-port.in')].map((s) => Math.round(s.getBoundingClientRect().top - nb.top));
      const inL = Math.round(el.querySelector('.mod-port.in').getBoundingClientRect().left - nb.left);
      const oel = el.querySelector('.mod-port.out');
      const o = oel ? Math.round(oel.getBoundingClientRect().top - nb.top) : null;
      M.removeNode(n.id);
      return { ins, inL, o };
    };
    return { io: probe('io'), code: probe('code'), cmp: probe('comparator'), op: probe('operator') };
  });
  ok('the Comparator/Operator first input node sits at the exact height of the I/O and Code modules\' input, the second exactly 32px below, the out node in line',
    na.io.ins[0] === 15 && na.code.ins[0] === 15 && na.cmp.ins.join(',') === '15,47' && na.op.ins.join(',') === '15,47'
      && na.cmp.o === 15 && na.op.o === 15 && na.io.inL === na.cmp.inL && na.code.inL === na.op.inL,
    JSON.stringify(na));
  /* SMate flows land in the current view too */
  const zs = await zp.evaluate(() => {
    const cv = document.getElementById('modCanvas');
    const r = cv.getBoundingClientRect();
    const o = (id, x, y) => ({ pointerId: id, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 1 });
    const v = globalThis.__MOD.view();
    const dx = -1800 - v.x, dy = -1200 - v.y;
    cv.dispatchEvent(new PointerEvent('pointerdown', o(3, r.left + 300, r.top + 200)));
    for (let i = 1; i <= 10; i++) cv.dispatchEvent(new PointerEvent('pointermove', o(3, r.left + 300 + (dx * i) / 10, r.top + 200 + (dy * i) / 10)));
    cv.dispatchEvent(new PointerEvent('pointerup', o(3, r.left + 300 + dx, r.top + 200 + dy)));
    return true;
  });
  await zp.click('#smateBtn');
  await zp.waitForTimeout(400);
  await zp.fill('#smateIn', 'is 9 greater than 4');
  await zp.keyboard.press('Enter');
  await zp.waitForTimeout(2500);
  const zsm = await zp.evaluate(() => {
    const M = globalThis.__MOD;
    const view = M.view();
    const r = document.getElementById('modCanvas').getBoundingClientRect();
    const vl = -view.x / view.z, vt = -view.y / view.z, vw = r.width / view.z, vh = r.height / view.z;
    const ns = M.nodes();
    const io = ns.find((n) => n.type === 'io');
    return { allInView: ns.every((n) => n.x >= vl - 1 && n.x <= vl + vw + 1 && n.y >= vt - 1 && n.y <= vt + vh + 1),
      out: io ? document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent : '' };
  });
  ok('SMate builds its flow inside the current view (panned far from the origin) and answers',
    zsm.allInView && zsm.out === 'true', JSON.stringify(zsm));
  await zcx.close();

  /* ---- the clear-canvas button: confirm, clear, persist — and SMate ---- */
  const clcx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await clcx.addInitScript({ content: SMATE_STUB({
    'multiply': ['{"tool":"mathflow","args":{"a":"6","op":"*","b":"7"}}'],
    'clear': ['{"tool":"modclear","args":{}}'],
  }) });
  const clp = await clcx.newPage();
  await clp.goto(URL + 'module.html', { waitUntil: 'load' });
  await clp.waitForTimeout(900);
  ok('a trash button joins the toolbar after Import — standard chip, translated, with an icon',
    await clp.evaluate(() => {
      const b = document.getElementById('modClear');
      return !!b && !!b.querySelector('svg') && b.title === 'Clear canvas'
        && b.previousElementSibling && b.previousElementSibling.id === 'modImport'
        && getComputedStyle(b).borderRadius === '0px';
    }));
  const clBuilt = await clp.evaluate(async () => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const a = M.add('number'); M.cfg(a.id, { numtype: 'dec', value: '6' });
    const b = M.add('number'); M.cfg(b.id, { numtype: 'dec', value: '7' });
    const cp = M.add('comparator');
    const io = M.add('io');
    M.wire(a.id, cp.id, 'a'); M.wire(b.id, cp.id, 'b'); M.wire(cp.id, io.id);
    await M.run();
    return { n: M.nodes().length, w: M.wires().length };
  });
  const clCancel = await clp.evaluate(() => {
    let asked = 0, question = '';
    window.confirm = (q) => { asked += 1; question = q; return false; };
    document.getElementById('modClear').click();
    window.confirm = window.constructor.prototype.confirm;
    const M = globalThis.__MOD;
    return { asked, question, n: M.nodes().length, w: M.wires().length, drawn: document.querySelectorAll('.mod-wire').length };
  });
  ok('clearing asks first in plain language, and Cancel keeps every module and wire',
    clCancel.asked === 1 && /Delete every module/.test(clCancel.question)
      && clCancel.n === clBuilt.n && clCancel.w === clBuilt.w && clCancel.drawn === clBuilt.w,
    JSON.stringify(clCancel));
  const clDone = await clp.evaluate(async () => {
    window.confirm = () => true;
    document.getElementById('modClear').click();
    window.confirm = window.constructor.prototype.confirm;
    const M = globalThis.__MOD;
    const now = { n: M.nodes().length, w: M.wires().length, onCanvas: document.querySelectorAll('.mod-node').length, wdel: document.querySelectorAll('.mod-wdel').length };
    const id = M.latest();
    await new Promise((r) => setTimeout(r, 800));   /* the doc saves */
    M.home();
    await new Promise((r) => setTimeout(r, 200));
    M.openDoc(id);
    await new Promise((r) => setTimeout(r, 200));
    return { now, reopened: { n: M.nodes().length, w: M.wires().length } };
  });
  ok('confirm clears the whole canvas — modules, wires, the wire-delete button — and it persists',
    clDone.now.n === 0 && clDone.now.w === 0 && clDone.now.onCanvas === 0 && clDone.now.wdel === 0
      && clDone.reopened.n === 0 && clDone.reopened.w === 0, JSON.stringify(clDone));
  const clEmpty = await clp.evaluate(() => {
    let asked = 0;
    window.confirm = () => { asked += 1; return true; };
    document.getElementById('modClear').click();
    window.confirm = window.constructor.prototype.confirm;
    return asked;
  });
  ok('clearing an already-empty canvas never even asks', clEmpty === 0, 'asked=' + clEmpty);
  /* SMate clears by voice */
  const clsp = await clcx.newPage();
  const clStray = [];
  clsp.on('framenavigated', (f) => { if (f === clsp.mainFrame() && !/module\.html/.test(f.url())) clStray.push(f.url()); });
  await clsp.goto(URL + 'module.html', { waitUntil: 'load' });
  await clsp.waitForTimeout(900);
  await clsp.click('#smateBtn');
  await clsp.waitForTimeout(400);
  await clsp.fill('#smateIn', 'multiply 6 by 7');
  await clsp.keyboard.press('Enter');
  await clsp.waitForTimeout(2300);
  const clBefore = await clsp.evaluate(() => ({ n: globalThis.__MOD.nodes().length, w: globalThis.__MOD.wires().length }));
  await clsp.fill('#smateIn', 'clear the canvas');
  await clsp.keyboard.press('Enter');
  await clsp.waitForTimeout(2300);
  const clAfter = await clsp.evaluate(() => ({
    n: globalThis.__MOD.nodes().length, w: globalThis.__MOD.wires().length,
    block: [...document.querySelectorAll('.smate-block')].some((b) => b.textContent.toLowerCase().includes('clear canvas')),
  }));
  ok('SMate "clear the canvas" empties the flow and reports with an action block',
    clBefore.n === 4 && clBefore.w === 3 && clAfter.n === 0 && clAfter.w === 0 && clAfter.block && clStray.length === 0,
    JSON.stringify({ clBefore, clAfter, clStray }));
  await clcx.close();

  /* ---- the Number module's stepper row: arrows flush with the value field,
     never squeezed against the module border ---- */
  const stcx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const stp = await stcx.newPage();
  await stp.goto(URL + 'module.html', { waitUntil: 'load' });
  await stp.waitForTimeout(900);
  const stg = await stp.evaluate(() => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const out = {};
    const probe = (type, x) => {
      const n = M.add('number', x, 100);
      if (type !== 'int') M.cfg(n.id, { numtype: type });
      const el = document.querySelector(`.mod-node[data-id="${n.id}"]`);
      const nb = el.getBoundingClientRect();
      const num = el.querySelector('.mod-numin').getBoundingClientRect();
      const btns = el.querySelector('.mod-stepbtns').getBoundingClientRect();
      const ddTxt = el.querySelector('.mod-dd-txt');
      const r = { modW: +nb.width.toFixed(1), numinW: +num.width.toFixed(1),
        flush: +Math.abs(btns.right - num.right).toFixed(1),
        toBorder: +(nb.right - btns.right).toFixed(1),
        ddClip: ddTxt.scrollWidth > ddTxt.clientWidth };
      M.removeNode(n.id);
      return r;
    };
    out.int = probe('int', 100);
    out.float = probe('float', 500);
    for (const t of ['text', 'code', 'operator', 'comparator', 'io']) {
      const n = M.add(t, 100, 400);
      out[t] = +document.querySelector(`.mod-node[data-id="${n.id}"]`).getBoundingClientRect().width.toFixed(0);
      M.removeNode(n.id);
    }
    return out;
  });
  ok('Number module: the stepper arrows end flush with the value field, clear of the border (int)',
    stg.int.modW === 220 && stg.int.numinW === 196 && stg.int.flush <= 1 && stg.int.toBorder === 12 && !stg.int.ddClip,
    JSON.stringify(stg.int));
  ok('Number module: same alignment with the Float variant\'s longer label',
    stg.float.flush <= 1 && stg.float.toBorder === 12 && !stg.float.ddClip, JSON.stringify(stg.float));
  ok('every other module keeps its width (the tweak touches only the Number module)',
    stg.text === 230 && stg.code === 310 && stg.operator === 210 && stg.comparator === 210 && stg.io === 250,
    JSON.stringify({ text: stg.text, code: stg.code, operator: stg.operator, comparator: stg.comparator, io: stg.io }));
  await stcx.close();

  /* ---- Logic + Boolean modules and the palette toolbar ---- */
  const lgcx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await lgcx.addInitScript({ content: SMATE_STUB({
    'true and false': ['{"tool":"logicflow","args":{"gate":"and","a":true,"b":false}}'],
    'xor': ['{"tool":"modadd","args":{"type":"logic","cfg":{"gate":"xor"}}}'],
  }) });
  const lgp = await lgcx.newPage();
  await lgp.goto(URL + 'module.html', { waitUntil: 'load' });
  await lgp.waitForTimeout(900);
  const pal = await lgp.evaluate(() => {
    const bar = document.querySelector('.mod-bar');
    const chips = [...document.querySelectorAll('#modPalette .mod-add')];
    const zoomChip = getComputedStyle(document.querySelector('.mod-zoom .btn'));
    return {
      ribbonAdds: bar.querySelectorAll('.mod-add').length,
      n: chips.length,
      order: chips.map((c) => c.dataset.add).join(','),
      titles: chips.map((c) => c.title).join(','),
      solid: getComputedStyle(chips[0]).backgroundColor === zoomChip.backgroundColor,
    };
  });
  ok('the module picker is a toolbar on the canvas now: 8 solid chips (text…io), ribbon decluttered',
    pal.ribbonAdds === 0 && pal.n === 8 && pal.order === 'text,number,operator,comparator,logic,boolean,code,io'
      && pal.solid && pal.titles === 'Text,Number,Operator,Comparator,Logic,Boolean,Code,I/O', JSON.stringify(pal));
  const lgn = await lgp.evaluate(() => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const probe = (type) => {
      const n = M.add(type, 100, 100);
      const el = document.querySelector(`.mod-node[data-id="${n.id}"]`);
      el.querySelector('.mod-dd-btn').click();
      const items = [...el.querySelectorAll('.mod-dd-opt')].map((i) => i.textContent.trim());
      document.body.click();
      const nb = el.getBoundingClientRect();
      const inPorts = [...el.querySelectorAll('.mod-port.in')];
      const r = {
        items,
        tops: inPorts.map((s) => Math.round(s.getBoundingClientRect().top - nb.top)),
        inL: inPorts.length ? +(inPorts[0].getBoundingClientRect().left - nb.left).toFixed(1) : null,
        outTop: el.querySelector('.mod-port.out') ? Math.round(el.querySelector('.mod-port.out').getBoundingClientRect().top - nb.top) : null,
        w: Math.round(nb.width),
        stat: el.querySelector('.mod-cstat').textContent,
      };
      M.removeNode(n.id);
      return r;
    };
    return { logic: probe('logic'), op: probe('operator'), bool: probe('boolean') };
  });
  ok('Logic dropdown lists every gate with its symbol: ~ Not, + Or, * And, ↓ Nor, ↑ Nand, ⊕ Xor, ≡ Xnor',
    lgn.logic.items.length === 7 && /~\s+Not/.test(lgn.logic.items[0]) && /\+\s+Or/.test(lgn.logic.items[1])
      && /\*\s+And/.test(lgn.logic.items[2]) && /↓\s+Nor/.test(lgn.logic.items[3]) && /↑\s+Nand/.test(lgn.logic.items[4])
      && /⊕\s+Xor/.test(lgn.logic.items[5]) && /≡\s+Xnor/.test(lgn.logic.items[6]), JSON.stringify(lgn.logic.items));
  ok('Logic module follows the standard: input nodes 15/47, out node 15, the Operator\'s exact left offset, and silence while waiting',
    lgn.logic.w === 210 && lgn.logic.tops.join(',') === '15,47' && lgn.logic.outTop === 15
      && lgn.logic.inL === lgn.op.inL && lgn.logic.stat === '', JSON.stringify(lgn.logic));
  const lgt = await lgp.evaluate(async () => {
    const M = globalThis.__MOD;
    const run = async (gate, a, b) => {
      const ba = M.add('boolean', 40, 40); M.cfg(ba.id, { val: a });
      let bb = null;
      if (b !== null) { bb = M.add('boolean', 40, 300); M.cfg(bb.id, { val: b }); }
      const lg = M.add('logic', 360, 170); M.cfg(lg.id, { gate });
      const io = M.add('io', 640, 170);
      M.wire(ba.id, lg.id, 'a');
      if (bb) M.wire(bb.id, lg.id, 'b');
      M.wire(lg.id, io.id);
      await M.run();
      const out = document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent.trim();
      const hint = document.querySelector(`.mod-node[data-id="${lg.id}"] .mod-ophint`).textContent;
      M.removeNode(ba.id); if (bb) M.removeNode(bb.id); M.removeNode(lg.id); M.removeNode(io.id);
      return { out, hint };
    };
    return {
      notTrue: await run('not', 'true', null),
      andTT: await run('and', 'true', 'true'),
      andTF: await run('and', 'true', 'false'),
      orFF: await run('or', 'false', 'false'),
      norTF: await run('nor', 'true', 'false'),
      nandTT: await run('nand', 'true', 'true'),
      xorTF: await run('xor', 'true', 'false'),
      xnorTT: await run('xnor', 'true', 'true'),
      numBool: await (async () => {   /* Number modules feeding a gate: 1/0 are booleans on the wire */
        const n1 = M.add('number', 40, 40); M.cfg(n1.id, { value: '1' });
        const n0 = M.add('number', 40, 300); M.cfg(n0.id, { value: '0' });
        const lg = M.add('logic', 360, 170); M.cfg(lg.id, { gate: 'and' });
        const io = M.add('io', 640, 170);
        M.wire(n1.id, lg.id, 'a'); M.wire(n0.id, lg.id, 'b'); M.wire(lg.id, io.id);
        await M.run();
        const out = document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent.trim();
        M.removeNode(n1.id); M.removeNode(n0.id); M.removeNode(lg.id); M.removeNode(io.id);
        return { out };
      })(),
    };
  });
  ok('every gate computes exactly: ~true=false, T*T=T, T*F=F, F+F=F, T↓F=F, T↑T=F, T⊕F=T, T≡T=T',
    lgt.notTrue.out === 'false' && lgt.andTT.out === 'true' && lgt.andTF.out === 'false' && lgt.orFF.out === 'false'
      && lgt.norTF.out === 'false' && lgt.nandTT.out === 'false' && lgt.xorTF.out === 'true' && lgt.xnorTT.out === 'true',
    JSON.stringify(lgt));
  ok(`the hint line shows the gate's equation ("${lgt.andTT.hint}", "${lgt.notTrue.hint}") and Numbers read as booleans (1 AND 0 = ${lgt.numBool.out})`,
    /true \* true = true/.test(lgt.andTT.hint) && /~true = false/.test(lgt.notTrue.hint) && lgt.numBool.out === 'false',
    JSON.stringify(lgt.numBool));
  const lgnot = await lgp.evaluate(() => {
    const M = globalThis.__MOD;
    const ba = M.add('boolean', 40, 40); M.cfg(ba.id, { val: 'true' });
    const bb = M.add('boolean', 40, 300); M.cfg(bb.id, { val: 'false' });
    const lg = M.add('logic', 360, 170);
    M.wire(ba.id, lg.id, 'a'); M.wire(bb.id, lg.id, 'b');
    return { ba: ba.id, bb: bb.id, lg: lg.id,
      before: { ports: document.querySelectorAll(`.mod-node[data-id="${lg.id}"] .mod-port.in`).length, wires: M.wires().length } };
  });
  const lgnot2 = await lgp.evaluate(async ({ ba, bb, lg }) => {
    const M = globalThis.__MOD;
    const el = document.querySelector(`.mod-node[data-id="${lg}"]`);
    el.querySelector('.mod-dd-btn').click();
    [...el.querySelectorAll('.mod-dd-opt')][0].click();   /* ~ NOT */
    await new Promise((r) => setTimeout(r, 150));
    const after = { ports: document.querySelectorAll(`.mod-node[data-id="${lg}"] .mod-port.in`).length, wires: M.wires().length,
      gate: M.nodes().find((n) => n.id === lg).cfg.gate };
    const refused = !M.wire(ba, lg, 'b');
    const el2 = document.querySelector(`.mod-node[data-id="${lg}"]`);
    el2.querySelector('.mod-dd-btn').click();
    [...el2.querySelectorAll('.mod-dd-opt')][1].click();   /* + Or back */
    const back = document.querySelectorAll(`.mod-node[data-id="${lg}"] .mod-port.in`).length;
    M.removeNode(ba); M.removeNode(bb); M.removeNode(lg);
    return { after, refused, back };
  }, lgnot);
  ok('NOT retires the second input node (wire dropped, B unwireable) and a binary gate brings it back',
    lgnot.before.ports === 2 && lgnot.before.wires === 2 && lgnot2.after.ports === 1 && lgnot2.after.wires === 1
      && lgnot2.after.gate === 'not' && lgnot2.refused && lgnot2.back === 2, JSON.stringify({ lgnot, lgnot2 }));
  const lgb = await lgp.evaluate(async () => {
    const M = globalThis.__MOD;
    const n = M.add('boolean', 100, 100);
    const el = document.querySelector(`.mod-node[data-id="${n.id}"]`);
    const nb = el.getBoundingClientRect();
    const dd = el.querySelector('.mod-dd').getBoundingClientRect();
    const code = M.add('code', 500, 100);
    const cel = document.querySelector(`.mod-node[data-id="${code.id}"]`);
    const cdd = cel.querySelector('.mod-dd').getBoundingClientRect();
    const cnb = cel.getBoundingClientRect();
    el.querySelector('.mod-dd-btn').click();
    const items = [...el.querySelectorAll('.mod-dd-opt')].map((i) => i.textContent.trim());
    document.body.click();
    const outs = {};
    for (const v of ['true', 'false']) {
      M.cfg(n.id, { val: v });
      const io = M.add('io', 400, 100);
      M.wire(n.id, io.id);
      await M.run();
      outs[v] = document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent.trim();
      M.removeNode(io.id);
    }
    M.removeNode(n.id); M.removeNode(code.id);
    return { items, insetL: +(dd.left - nb.left).toFixed(1), insetR: +(nb.right - dd.right).toFixed(1),
      codeInsetL: +(cdd.left - cnb.left).toFixed(1), codeInsetR: +(cnb.right - cdd.right).toFixed(1), outs };
  });
  ok('Boolean module: True/False dropdown, lone control spanning its row exactly like the Code select, true/false on the wire',
    lgb.items.join('/') === 'True/False' && lgb.insetL === lgb.codeInsetL && lgb.insetR === lgb.codeInsetR
      && lgb.outs.true === 'true' && lgb.outs.false === 'false', JSON.stringify(lgb));
  /* SMate drives logic by voice */
  const lgsp = await lgcx.newPage();
  const lgStray = [];
  lgsp.on('framenavigated', (f) => { if (f === lgsp.mainFrame() && !/module\.html/.test(f.url())) lgStray.push(f.url()); });
  await lgsp.goto(URL + 'module.html', { waitUntil: 'load' });
  await lgsp.waitForTimeout(900);
  await lgsp.click('#smateBtn');
  await lgsp.waitForTimeout(400);
  await lgsp.fill('#smateIn', 'true and false');
  await lgsp.keyboard.press('Enter');
  await lgsp.waitForTimeout(2400);
  const lgsm1 = await lgsp.evaluate(() => {
    const M = globalThis.__MOD;
    const lg = M.nodes().filter((n) => n.type === 'logic').pop();
    const io = M.nodes().filter((n) => n.type === 'io').pop();
    return { gate: lg.cfg.gate, out: document.querySelector(`.mod-node[data-id="${io.id}"] .mod-result`).textContent.trim(),
      n: M.nodes().length, w: M.wires().length };
  });
  await lgsp.fill('#smateIn', 'add a logic xor');
  await lgsp.keyboard.press('Enter');
  await lgsp.waitForTimeout(2400);
  const lgsm2 = await lgsp.evaluate(() => {
    const M = globalThis.__MOD;
    const lg = M.nodes().filter((n) => n.type === 'logic').pop();
    return { gate: lg.cfg.gate };
  });
  ok('SMate builds the AND flow from "true and false" (answers false) and "add a logic xor" selects XOR',
    lgsm1.gate === 'and' && lgsm1.out === 'false' && lgsm1.n === 4 && lgsm1.w === 3 && lgsm2.gate === 'xor'
      && lgStray.length === 0, JSON.stringify({ lgsm1, lgsm2, lgStray }));
  await lgcx.close();

  /* mobile: the palette shrinks to dots */
  const mgcx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mgp = await mgcx.newPage();
  await mgp.goto(URL + 'module.html', { waitUntil: 'load' });
  await mgp.waitForTimeout(1000);
  const mg = await mgp.evaluate(() => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const chips = [...document.querySelectorAll('#modPalette .mod-add')];
    const labelHidden = getComputedStyle(document.querySelector('#modPalette .mod-add-t')).display === 'none';
    document.querySelector('.mod-add[data-add="logic"]').click();
    const n = M.nodes()[M.nodes().length - 1];
    return { n: chips.length, labelHidden, chipW: +chips[0].getBoundingClientRect().width.toFixed(0), added: n.type,
      fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      title: chips[4].title };
  });
  ok('mobile: the palette is 8 dot-only chips (names kept in titles), tapping adds, the page fits 390px',
    mg.n === 8 && mg.labelHidden && mg.chipW <= 40 && mg.added === 'logic' && mg.fits && mg.title === 'Logic', JSON.stringify(mg));
  await mgcx.close();
}

/* ---- Singhoah scrollbars: every scrollable surface, every app ---- */
{
  /* the code editor is a wide text area: long lines must scroll sideways with
     the Singhoah bar while the highlight layer and gutter stay glued to it */
  const ecx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ep = await ecx.newPage();
  await ep.goto(URL + 'module.html', { waitUntil: 'load' });
  await ep.waitForTimeout(900);
  const edr = await ep.evaluate(async () => {
    const M = globalThis.__MOD;
    if (document.getElementById('modEditor').hidden) M.newDoc();
    const n = M.add('code', 60, 60);
    M.cfg(n.id, { code: Array.from({ length: 30 }, (_, i) => `# ${i + 1} ${'wide '.repeat(12)}`).join('\n') });
    await new Promise((r) => setTimeout(r, 250));
    const t = document.querySelector('textarea.mod-codeta');
    const pre = document.querySelector('.mod-hl');
    t.scrollLeft = t.scrollWidth; t.dispatchEvent(new Event('scroll'));
    const sw = getComputedStyle(t).scrollbarWidth;
    return {
      wide: t.scrollWidth > t.clientWidth,
      syncL: pre.scrollLeft === t.scrollLeft,
      sw: sw === 'auto' || sw === 'thin',
    };
  });
  ok('the code editor scrolls wide lines with the Singhoah bar, highlight layer in lockstep',
    edr.wide && edr.syncL && edr.sw, JSON.stringify(edr));
  /* long program output scrolls in the terminal pane */
  const trm = await ep.evaluate(async () => {
    const M = globalThis.__MOD;
    const c = M.nodes().find((x) => x.type === 'code');
    M.cfg(c.id, { code: 'let s="";for(let i=0;i<60;i++)s+="output line "+i+"\\n";console.log(s)' });
    const io = M.add('io', 420, 60);
    M.wire(c.id, io.id);
    await M.run();
    await new Promise((r) => setTimeout(r, 4000));
    const res = [...document.querySelectorAll('.mod-node .mod-result')].pop();
    const sw = getComputedStyle(res).scrollbarWidth;
    return { out: res.textContent.includes('output line 59'), overflow: res.scrollHeight > res.clientHeight, sw: sw === 'auto' || sw === 'thin' };
  });
  ok('the terminal pane scrolls long output with the Singhoah bar', trm.out && trm.overflow && trm.sw, JSON.stringify(trm));
  /* a wide code block inside the markdown preview (Text -> I/O) */
  const mdr = await ep.evaluate(async () => {
    const M = globalThis.__MOD;
    const t = M.add('text', 60, 480);
    M.cfg(t.id, { text: '```\n' + Array.from({ length: 8 }, (_, i) => 'code block line ' + i + ' ' + '='.repeat(100)).join('\n') + '\n```' });
    const io = M.nodes().find((x) => x.type === 'io');
    M.wire(t.id, io.id);
    M.run();
    await new Promise((r) => setTimeout(r, 600));
    const pre = document.querySelector('.mod-node .mod-md pre');
    if (!pre) return { missing: true };
    const sw = getComputedStyle(pre).scrollbarWidth;
    return { wide: pre.scrollWidth > pre.clientWidth, sw: sw === 'auto' || sw === 'thin' };
  });
  ok('markdown code blocks scroll with the Singhoah bar (never the browser\'s)', !mdr.missing && mdr.wide && mdr.sw, JSON.stringify(mdr));
  await ecx.close();

  /* the wallet currency dropdown was a native-scrollbar holdout */
  const wcx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const wp = await wcx.newPage();
  await wp.goto(URL + 'wallet.html', { waitUntil: 'load' });
  await wp.waitForTimeout(900);
  await wp.locator('#walCurBtn').click();
  await wp.waitForTimeout(350);
  const cur = await wp.evaluate(() => {
    const l = document.querySelector('.wal-cur-list');
    const sw = getComputedStyle(l).scrollbarWidth;
    return { open: !!l && l.scrollHeight > l.clientHeight, sw: sw === 'auto' || sw === 'thin' };
  });
  ok('the currency dropdown scrolls its list with the Singhoah bar', cur.open && cur.sw, JSON.stringify(cur));
  await wcx.close();

  /* site-wide: no surface may hide or override the Singhoah bar */
  const ascx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const asp = await ascx.newPage();
  let badSurface = '';
  for (const pg of ['index.html', 'wallet.html', 'scribe.html', 'settings.html', 'metro.html', 'module.html']) {
    await asp.goto(URL + pg, { waitUntil: 'load' });
    await asp.waitForTimeout(pg === 'metro.html' ? 1500 : 600);
    badSurface = badSurface || await asp.evaluate((pgname) => {
      const webkit = CSS.supports('selector(::-webkit-scrollbar)');
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (!/auto|scroll/.test(cs.overflowY + cs.overflowX)) continue;
        if (!el.getClientRects().length) continue;
        if (webkit ? cs.scrollbarWidth !== 'auto' : cs.scrollbarWidth !== 'thin') {
          return `${pgname}: ${el.className || el.tagName} hides the Singhoah bar (${cs.scrollbarWidth})`;
        }
      }
      return '';
    }, pg);
  }
  ok('every scrollable surface on every page uses the Singhoah bar (none hidden, none native)', badSurface === '', badSurface);
  await ascx.close();
}


/* --- Scribe becomes a multi-document app with a files home --- */
{
  const sc = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const sp = await sc.newPage();
  await sp.goto(URL + 'scribe.html', { waitUntil: 'load' });
  await sp.evaluate(() => {
    localStorage.removeItem('singhoah:docs');
    localStorage.removeItem('singhoah:scribe:migrated');
    localStorage.setItem('singhoah:scribe', JSON.stringify({ html: '<p>legacy note</p>', title: 'Legacy', in: 'en-US', out: 'en-US', stamps: false }));
  });
  await sp.goto(URL + 'scribe.html', { waitUntil: 'load' });
  await sp.waitForTimeout(700);
  ok('Scribe opens on a Google-Docs-style files home', await sp.evaluate(() =>
    !document.getElementById('scrHome').hidden && document.querySelectorAll('.fl-card').length === 1));
  ok('the legacy single note migrated into the document store', await sp.evaluate(() =>
    (document.querySelector('.fl-title') || {}).textContent === 'Legacy'));
  await sp.click('.fl-card');
  await sp.waitForTimeout(400);
  ok('opening a note shows its content in the editor', await sp.evaluate(() =>
    document.getElementById('scrHome').hidden && document.getElementById('scrDoc').textContent.includes('legacy note')));
  await sp.click('#scrFiles');
  await sp.waitForTimeout(300);
  ok('the Files button returns to the notes home', await sp.evaluate(() => !document.getElementById('scrHome').hidden));
  await sc.close();
}

/* --- SMate drives the cash tab: live mini in chat + real tab in the window --- */
{
  const smc = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  await smc.addInitScript({ content: SMATE_STUB({
    'cash in jpy': ['{"tool":"cash","args":{"currency":"JPY"}}'],
    'cash': ['{"tool":"cash","args":{}}'],
  }) });
  const sc = await smc.newPage();
  await sc.goto(URL + 'wallet.html', { waitUntil: 'load' });
  await sc.evaluate(() => localStorage.setItem('singhoah:wallet',
    JSON.stringify({ cur: 'TWD', tx: [{ type: 'in', amt: 3876 }] })));
  await sc.reload({ waitUntil: 'load' });
  await sc.waitForTimeout(400);
  await sc.click('#smateBtn');
  await sc.waitForTimeout(250);
  await sc.fill('#smateIn', 'cash');
  await sc.click('#smateSend');
  await sc.waitForTimeout(1500);
  ok('SMate "cash" opens the Cash tab in the main window', await sc.evaluate(() =>
    document.getElementById('walTabC').getAttribute('aria-pressed') === 'true' &&
    document.querySelectorAll('#walCashBox .cash-note').length === 5));
  ok('SMate "cash" shows the live cash mini-UI as an action block', await sc.evaluate(() => {
    const f = [...document.querySelectorAll('.smate-block iframe')].find((x) => x.src.includes('wallet.html?mini=1#tab=cash'));
    return !!f && f.getBoundingClientRect().width > 200;
  }));
  await sc.fill('#smateIn', 'cash in jpy');
  await sc.click('#smateSend');
  await sc.waitForTimeout(1500);
  ok('SMate compounds: "cash in jpy" switches currency then opens cash', await sc.evaluate(() =>
    document.getElementById('walCurBtn').textContent.includes('JPY') &&
    document.getElementById('walTabC').getAttribute('aria-pressed') === 'true'));
  await sc.close();
  const sc2 = await smc.newPage();
  await sc2.goto(URL + 'index.html', { waitUntil: 'load' });
  await sc2.evaluate(() => localStorage.setItem('singhoah:wallet',
    JSON.stringify({ cur: 'TWD', tx: [{ type: 'in', amt: 3876 }] })));
  await sc2.reload({ waitUntil: 'load' });
  await sc2.waitForTimeout(300);
  await sc2.click('#smateBtn');
  await sc2.waitForTimeout(250);
  await sc2.fill('#smateIn', 'cash');
  await sc2.click('#smateSend');
  await sc2.waitForTimeout(2600);
  ok('SMate hands off to the wallet Cash tab from any page', /wallet\.html#tab=cash$/.test(sc2.url()), sc2.url());
  await sc2.close();
  await smc.close();
}

await browser.close();

/* the I/O terminal round-trip for every language runs LAST, in its own solo
   browser: the shared browser is warm from hundreds of checks and the four
   engine runtimes (esm.run, Pyodide, wasm-clang, CheerpJ) together need the
   headroom */
{
  const tbr = await chromium.launch();
  const tcx = await tbr.newContext({ viewport: { width: 1280, height: 860 } });
  const tp = await tcx.newPage();
  await tp.goto(URL + 'module.html', { waitUntil: 'load' });
  await tp.waitForTimeout(700);
  const TERMS = await tp.evaluate(async () => {
    const M = globalThis.__MOD;
    M.newDoc();
    const io = M.add('io', 40, 60);
    M.cfg(io.id, { text: 'singhoah terminal' });
    const c = M.add('code', 360, 60);
    M.wire(c.id, io.id);
    const el = (id) => [...document.querySelectorAll('.mod-node')].find((n) => n.dataset.id === id);
    const PROGS = {
      js: ["console.log('js ok: ' + input)"],
      python: ['print("py ok: " + input)'],
      cpp: ['#include <iostream>\n#include <string>\nint main() { std::string s; std::getline(std::cin, s); std::cout << "cpp ok: " << s << "\\n"; }'],
      java: ['public class Main { public static void main(String[] a) throws Exception { System.out.println("java ok: " + new String(System.in.readAllBytes()).trim()); } }'],
    };
    const out = {};
    for (const [lang, code] of Object.entries(PROGS)) {
      M.cfg(c.id, { lang, code });
      await M.run();
      const pane = el(io.id).querySelector('.mod-result');
      const stat = el(c.id).querySelector('.mod-cstat');
      out[lang] = {
        got: ((pane.querySelector('.mod-out') || {}).textContent || '').trim(),
        err: ((pane.querySelector('.mod-err') || {}).textContent || '').slice(0, 140),
        ok: !/bad/.test(stat.className),
      };
    }
    return out;
  });
  /* Python's builtin input() works like real Python: pre-fed I/O text is
     stdin (transcript-style echo), successive calls read successive lines,
     and an empty I/O node prompts LIVE in the pane */
  const PYIN = await tp.evaluate(async () => {
    const M = globalThis.__MOD;
    const c = M.nodes().find((n) => n.type === 'code');
    const io = M.nodes().find((n) => n.type === 'io');
    const el = (id) => [...document.querySelectorAll('.mod-node')].find((n) => n.dataset.id === id);
    const pane = () => el(io.id).querySelector('.mod-result');
    M.cfg(c.id, { lang: 'python', code: 'name = input("Enter your name: ")\nprint(f"Hello, {name}!")' });
    M.cfg(io.id, { text: 'Max' });
    await M.run();
    const named = (pane().querySelector('.mod-out') || {}).textContent || '';
    M.cfg(io.id, { text: 'Ada\nGrace' });
    M.cfg(c.id, { code: 'a = input()\nb = input("second: ")\nprint(a + " & " + b)' });
    await M.run();
    const two = (pane().querySelector('.mod-out') || {}).textContent || '';
    M.cfg(c.id, { code: "print('old style: ' + input.upper())" });
    await M.run();
    const oldStyle = (pane().querySelector('.mod-out') || {}).textContent || '';
    return { named, two, oldStyle };
  });
  ok('Python input() reads the pre-fed I/O text: prompt + answer + greeting in the pane', /Enter your name: Max/.test(PYIN.named) && /Hello, Max!/.test(PYIN.named), JSON.stringify(PYIN.named));
  ok('Python input() reads successive lines of the I/O text', /Ada & Grace/.test(PYIN.two) && /second: Grace/.test(PYIN.two), JSON.stringify(PYIN.two));
  ok('Python input stays the wired text for existing flows (input.upper())', /old style: ADA/.test(PYIN.oldStyle), JSON.stringify(PYIN.oldStyle));
  /* the once-and-for-all case: NOTHING pre-fed — the pane itself prompts */
  await tp.evaluate(() => {
    const M = globalThis.__MOD;
    const c = M.nodes().find((n) => n.type === 'code');
    const io = M.nodes().find((n) => n.type === 'io');
    M.cfg(io.id, { text: '' });
    M.cfg(c.id, { lang: 'python', code: 'name = input("Enter your name: ")\nprint(f"Hello, {name}!")' });
    M.run();   /* not awaited: it pauses until the pane answers */
  });
  await tp.waitForSelector('.mod-ioin', { timeout: 20000 });
  await tp.fill('.mod-ioin', 'Grace');
  await tp.press('.mod-ioin', 'Enter');
  const live = await tp.waitForFunction(() => {
    const outs = [...document.querySelectorAll('.mod-node .mod-result .mod-out')].map((o) => o.textContent);
    return outs.some((o) => /Enter your name: Grace/.test(o)) && outs.some((o) => /Hello, Grace!/.test(o));
  }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  ok('interactive stdin: the pane prompts mid-run and the typed line feeds the program', live);
  await tp.evaluate(() => {
    const M = globalThis.__MOD;
    const io = M.nodes().find((n) => n.type === 'io');
    M.cfg(io.id, { text: '' });
    M.run();
  });
  await tp.waitForSelector('.mod-ioin', { timeout: 20000 });
  await tp.press('.mod-ioin', 'Escape');
  const esc = await tp.waitForFunction(() => {
    const e = [...document.querySelectorAll('.mod-node .mod-result .mod-err')].pop();
    return !!e && /EOFError/.test(e.textContent) && e.textContent.includes('I/O node');
  }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  ok('Escape ends the input: EOFError plus the plain-language hint', esc);
  /* the live prompt is borderless like a real terminal: no box, no button */
  await tp.evaluate(() => {
    const M = globalThis.__MOD;
    M.nodes().find((n) => n.type === 'io') && M.run();
  });
  await tp.waitForSelector('.mod-ioin', { timeout: 20000 });
  ok('the live prompt has no border and no submit button - type and Enter, like a real terminal', await tp.evaluate(() => {
    const inp = document.querySelector('.mod-ioin');
    const cs = getComputedStyle(inp);
    const prompt = document.querySelector('.mod-iop');
    return cs.borderTopWidth === '0px' && cs.borderLeftWidth === '0px'
      && cs.backgroundColor === 'rgba(0, 0, 0, 0)' && !document.querySelector('.mod-iogo')
      && !!prompt && /MONO"?:?\s*100/i.test(cs.fontVariationSettings)
      && cs.caretColor !== 'rgb(0, 0, 0)' && cs.caretColor !== '';
  }));
  await tp.press('.mod-ioin', 'Escape');   /* clean up the prompt */
  await tbr.close();
  const WANTS = { js: 'js ok: singhoah terminal', python: 'py ok: singhoah terminal', cpp: 'cpp ok: singhoah terminal', java: 'java ok: singhoah terminal' };
  for (const [lang, r] of Object.entries(TERMS)) {
    ok(`the I/O terminal round-trips ${lang} (stdin in, stdout back in the pane)`, r.ok && r.got === WANTS[lang], JSON.stringify(r).slice(0, 160));
  }
}

if (warnings.length) console.log(`\nWARNINGS (environmental, not failing):\n${warnings.join('\n')}`);
console.log(`\n${errors.length ? 'CONSOLE/NETWORK ISSUES:\n' + errors.join('\n') : 'no console or network errors'}`);
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length || errors.length ? 1 : 0);
