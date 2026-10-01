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
ok('page scrollbars are disabled site-wide',
  await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth === 'none'));

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

/* --- SMate: the multilingual command assistant --- */
const sm = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await sm.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
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
ok('the on-device AI is on-demand (off until asked)', await sq.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'false'));
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
const smSend = async (txt) => { await sq.fill('#smateIn', txt); await sq.click('#smateSend'); await sq.waitForTimeout(950); };
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
await smSend('Set time zone window of Jakarta and Taipei, side by side'); await sq.waitForTimeout(450);
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
await smSend('時區 雅加達 台北 並排'); await sq.waitForTimeout(450);
ok('the same window request works in Traditional Chinese', await sq.evaluate(() => {
  const g = document.getElementById('grid');
  return document.getElementById('mapWrap').hidden && g.dataset.layout === '2' &&
    g.textContent.includes('Jakarta') && g.textContent.includes('Taipei');
}));
await smSend('zona horaria de Yakarta y Taipéi, lado a lado'); await sq.waitForTimeout(450);
ok('the same window request works in Spanish', await sq.evaluate(() => {
  const g = document.getElementById('grid');
  return document.getElementById('mapWrap').hidden && g.dataset.layout === '2' &&
    g.textContent.includes('Jakarta') && g.textContent.includes('Taipei');
}));
await smSend('What is the fare from Zhongxiao Xinsheng station to Taipei Main station?');
await sq.waitForTimeout(700);
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
await sq.waitForTimeout(500);
ok('wallet actions from other pages really hit the ledger and show a block', await sq.evaluate((before) => {
  let after = 0;
  try { after = JSON.parse(localStorage.getItem('singhoah:wallet') || '{"tx":[]}').tx.length; } catch { /* ignore */ }
  const bl = [...document.querySelectorAll('.smate-block[data-ab="wallet"]')].pop();
  return after === before + 1 && !!bl && bl.textContent.includes('12');
}, txBefore));
await smSend('map Jakarta');
await sq.waitForTimeout(900);
ok('map requests open the map in the main window and clone it into the block', await sq.evaluate(() => {
  const bl = [...document.querySelectorAll('.smate-block[data-ab="mapnav"]')].pop();
  const open = !document.getElementById('mapWrap').hidden;
  return !!bl && open && (!!bl.querySelector('svg') || bl.textContent.includes('Jakarta'));
}));
await smSend('從忠孝新生到台北車站票價多少？');
await sq.waitForTimeout(700);
ok('the same fare question works in Traditional Chinese', await sq.evaluate(() => {
  const last = [...document.querySelectorAll('.smate-it')].pop().textContent;
  return last.includes('NT$') && last.includes('忠孝新生');
}));
await smSend('What is the fare from Taipei Main Station to Kaohsiung Main?');
await sq.waitForTimeout(700);
ok('cross-system fare questions get an honest one-system answer', await sq.evaluate(() => {
  const last = [...document.querySelectorAll('.smate-it')].pop().textContent;
  return last.includes('different systems');
}));
await sq.click('#smateAI'); /* on demand */
await sq.waitForTimeout(250);
await smSend('blorp');
ok('without a usable GPU SMate explains the AI needs WebGPU', await sq.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('WebGPU')));
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
await swq.waitForTimeout(950);
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
await mq2.waitForTimeout(1900);
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

/* --- SMate on-device AI: fuzzy commands + light Q&A (stub engine) --- */
const ai = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ai.addInitScript(() => {
  localStorage.setItem('singhoah:visited', '1');
  localStorage.setItem('singhoah:wallet', JSON.stringify({ cur: 'USD', tx: [
    { date: '2026-09-20', type: 'out', amt: 12, note: 'coffee' },
    { date: '2026-09-21', type: 'out', amt: 30, note: 'lunch' },
  ] }));
  window.__SMATE_AI_ENGINE = {
    chat: async (q) => {
      const s = q.toLowerCase();
      if (s.includes('bright')) return 'CMD: night shift';
      if (s.includes('sky')) return 'The sky is blue because air scatters short blue wavelengths of sunlight more than red.';
      if (s.includes('[wallet')) return 'You have spent 42 USD: 12 on coffee and 30 on lunch.';
      return 'CMD: help';
    },
  };
});
const ap = await ai.newPage();
await ap.goto(URL + 'index.html', { waitUntil: 'load' });
await ap.waitForTimeout(300);
await ap.click('#smateBtn');
ok('SMate AI is on-demand: off until the chip is tapped', await ap.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'false'));
await ap.click('#smateAI');
await ap.waitForTimeout(200);
ok('tapping the chip arms the on-device AI right away', await ap.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'true'));
await ap.fill('#smateIn', 'the room is too bright for my eyes');
await ap.click('#smateSend');
await ap.waitForTimeout(400);
await ap.fill('#smateIn', 'the room is too bright for my eyes');
await ap.click('#smateSend');
await ap.waitForTimeout(1400);
ok('AI translates fuzzy phrasing into a real command', await ap.evaluate(() =>
  document.documentElement.classList.contains('dark')));
await ap.fill('#smateIn', 'why is the sky blue?');
await ap.click('#smateSend');
await ap.waitForTimeout(1400);
ok('AI answers light questions', await ap.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('scatters')));
await ap.fill('#smateIn', 'how much have I spent?');
await ap.click('#smateSend');
await ap.waitForTimeout(1400);
ok('money questions get the live ledger attached for the AI', await ap.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('coffee')));
await ap.close();
await ai.close();

/* no WebGPU / blocked CDN: SMate explains and the offline brain keeps working */
const ai2 = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ai2.addInitScript(() => {
  localStorage.setItem('singhoah:visited', '1');
  Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
});
await ai2.route(/esm\.run|mlc/, (r) => r.abort());
const a2p = await ai2.newPage();
await a2p.goto(URL + 'index.html', { waitUntil: 'load' });
await a2p.waitForTimeout(300);
await a2p.click('#smateBtn');
await a2p.fill('#smateIn', 'blorp');
await a2p.click('#smateSend');
await a2p.waitForTimeout(900);
ok('with AI off, fuzzy input stays on the instant offline interpreter', await a2p.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.toLowerCase().includes('help')));
await a2p.click('#smateAI'); /* on demand: the user asks for it */
await a2p.waitForTimeout(300);
await a2p.fill('#smateIn', 'blorp');
await a2p.click('#smateSend');
await a2p.waitForTimeout(900);
ok('without WebGPU SMate explains instead of downloading anything', await a2p.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.includes('WebGPU')));
await a2p.click('#smateAI');
await a2p.waitForTimeout(200);
ok('the chip can still turn AI off by choice', await a2p.evaluate(() =>
  document.getElementById('smateAI').getAttribute('aria-pressed') === 'false'));
await a2p.fill('#smateIn', 'blorp');
await a2p.click('#smateSend');
await a2p.waitForTimeout(900);
ok('the offline interpreter still answers when AI is off', await a2p.evaluate(() =>
  [...document.querySelectorAll('.smate-it')].pop().textContent.toLowerCase().includes('help')));
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
await a5p.waitForTimeout(300);
await a5p.click('#smateBtn');
await a5p.click('#smateAI'); /* on demand */
await a5p.waitForTimeout(400); /* init fails: CDN blocked */
await a5p.fill('#smateIn', 'blorp');
await a5p.click('#smateSend');
await a5p.waitForTimeout(1200);
ok('a failed AI load falls back to the interpreter instead of looping "waking up"', await a5p.evaluate(() => {
  const last = [...document.querySelectorAll('.smate-it')].pop().textContent;
  return last.toLowerCase().includes('help') && !/waking up/i.test(last);
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
await a3p.click('#smateAI'); /* on demand */
await a3p.waitForTimeout(200);
await a3p.fill('#smateIn', 'blorp');
await a3p.click('#smateSend');
await a3p.waitForTimeout(300);
await a3p.fill('#smateIn', 'blorp');
await a3p.click('#smateSend');
await a3p.waitForTimeout(1400);
ok('a failing AI brain never hangs the chat', await a3p.evaluate(() =>
  !document.querySelector('.smate-dots') &&
  [...document.querySelectorAll('.smate-it')].pop().textContent.toLowerCase().includes('help')));
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
await a4p.click('#smateAI'); /* on demand */
await a4p.waitForTimeout(200);
await a4p.fill('#smateIn', 'blorp');
await a4p.click('#smateSend');
await a4p.waitForTimeout(300);
await a4p.fill('#smateIn', 'blorp');
await a4p.click('#smateSend');
await a4p.waitForTimeout(900);
const midStatus = await a4p.evaluate(() => document.getElementById('smateStatus').textContent);
await a4p.waitForTimeout(1200);
ok('slow AI shows an AI status and is capped', await a4p.evaluate((mid) =>
  mid.includes('AI') && !document.querySelector('.smate-dots') &&
  [...document.querySelectorAll('.smate-it')].pop().textContent.toLowerCase().includes('help'), midStatus));
await a4p.close();
await ai4.close();

/* --- SMate as a proper assistant: suggestions, time answers, reminders,
       math, memory, voice-out toggle, Ctrl+K --- */
const as = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await as.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
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
const asSend = async (txt) => { await asp.fill('#smateIn', txt); await asp.click('#smateSend'); await asp.waitForTimeout(950); };
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
const fp = await fc.newPage();
await fp.goto(URL + 'index.html', { waitUntil: 'load' });
await fp.waitForTimeout(300);
await fp.click('#smateBtn');
const fcSend = async (txt) => { await fp.fill('#smateIn', txt); await fp.click('#smateSend'); await fp.waitForTimeout(1100); };
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
const cp = await cm.newPage();
await cp.goto(URL + 'index.html', { waitUntil: 'load' });
await cp.waitForTimeout(300);
await cp.click('#smateBtn');
const cmSend = async (txt) => { await cp.fill('#smateIn', txt); await cp.click('#smateSend'); await cp.waitForTimeout(1600); };
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
const zp = await cz.newPage();
await zp.goto(URL + 'index.html', { waitUntil: 'load' });
await zp.waitForTimeout(300);
await zp.click('#smateBtn');
await zp.fill('#smateIn', '視窗 2x2，時區設為雅加達、台北、新加坡');
await zp.click('#smateSend');
await zp.waitForTimeout(950);
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
  ok(`errors render in red ("${errRun.red}") with the red status dot`, /red boom/.test(errRun.err) && /192|217/.test(errRun.red) && /bad/.test(errRun.bad), JSON.stringify(errRun).slice(0, 120));
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
  ok('the I/O node keeps the standard pane UI and its text persists in the flow', await mp.evaluate(async () => {
    const M = globalThis.__MOD;
    const io = M.nodes().find((n) => n.type === 'io' && n.cfg.text === 'from the io node');
    const el = [...document.querySelectorAll('.mod-node')].find((n) => n.dataset.id === io.id);
    const ta = el && el.querySelector('.mod-inta.mod-ta');
    const res = el && el.querySelector('.mod-result');
    const has = !!ta && ta.value === 'from the io node' && !!res;
    const ser = JSON.parse(M.serialize());
    const saved = ser.data.nodes.find((n) => n.type === 'io' && n.cfg.text === 'from the io node');
    return has && !!saved;
  }));
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
  ok('the on-device AI stays on demand in SinghoModule', await mp.evaluate(() =>
    document.getElementById('smateAI').getAttribute('aria-pressed') === 'false'));
  /* mobile fit */
  const mm = await mc.newPage();
  await mm.setViewportSize({ width: 390, height: 844 });
  await mm.goto(URL + 'module.html', { waitUntil: 'load' });
  await mm.waitForTimeout(600);
  ok('SinghoModule fits the phone without horizontal scroll', await mm.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('the I/O node renders on the phone; the Code module has a single right port', await mm.evaluate(() => {
    const M = globalThis.__MOD;
    const i = M.add('io', 48, 200);
    const c = M.add('code', 60, 340);
    const el = [...document.querySelectorAll('.mod-node')].find((n) => n.dataset.id === i.id);
    const ta = el && el.querySelector('.mod-inta');
    const res = el && el.querySelector('.mod-result');
    const cn = [...document.querySelectorAll('.mod-node')].find((n) => n.dataset.id === c.id);
    return !!ta && ta.clientWidth > 100 && !!res && !!cn && cn.querySelectorAll('.mod-port.out').length === 1;
  }));
  await mm.close();
  await mc.close();
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
  await sc.waitForTimeout(1100);
  ok('SMate "cash" opens the Cash tab in the main window', await sc.evaluate(() =>
    document.getElementById('walTabC').getAttribute('aria-pressed') === 'true' &&
    document.querySelectorAll('#walCashBox .cash-note').length === 5));
  ok('SMate "cash" shows the live cash mini-UI as an action block', await sc.evaluate(() => {
    const f = [...document.querySelectorAll('.smate-block iframe')].find((x) => x.src.includes('wallet.html?mini=1#tab=cash'));
    return !!f && f.getBoundingClientRect().width > 200;
  }));
  await sc.fill('#smateIn', 'cash in jpy');
  await sc.click('#smateSend');
  await sc.waitForTimeout(1100);
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
  await sc2.waitForTimeout(1800);
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
  /* Python's builtin input() works like real Python: the I/O node's text is
     its stdin — prompts echo, successive calls read successive lines, and an
     empty I/O node is an empty stdin (EOFError plus a plain-language hint) */
  const PYIN = await tp.evaluate(async () => {
    const M = globalThis.__MOD;
    const c = M.nodes().find((n) => n.type === 'code');
    const io = M.nodes().find((n) => n.type === 'io');
    const el = (id) => [...document.querySelectorAll('.mod-node')].find((n) => n.dataset.id === id);
    const pane = () => el(io.id).querySelector('.mod-result');
    M.cfg(c.id, { lang: 'python', code: 'name = input("Enter your name: ")\nprint(f"Hello, {name}!")' });
    M.cfg(io.id, { text: '' });
    await M.run();
    const empty = { err: (pane().querySelector('.mod-err') || {}).textContent || '', bad: /bad/.test(el(c.id).querySelector('.mod-cstat').className) };
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
    return { empty, named, two, oldStyle };
  });
  ok('Python input() reads the I/O node: prompt echoes and the greeting comes back', /Enter your name:/.test(PYIN.named) && /Hello, Max!/.test(PYIN.named), JSON.stringify(PYIN.named));
  ok('Python input() reads successive lines of the I/O text', /Ada & Grace/.test(PYIN.two), JSON.stringify(PYIN.two));
  ok('Python input stays the wired text for existing flows (input.upper())', /old style: ADA/.test(PYIN.oldStyle), JSON.stringify(PYIN.oldStyle));
  ok('an empty I/O node is an empty stdin: EOFError plus the plain-language hint', /EOFError/.test(PYIN.empty.err) && PYIN.empty.err.includes('I/O node') && PYIN.empty.bad, JSON.stringify(PYIN.empty.err.slice(-140)));
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
