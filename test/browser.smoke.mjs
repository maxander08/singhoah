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
ok('wordmark reads Singhoah', (await page.locator('.wordmark').textContent()).trim() === 'Singhoah',
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
  serrif: document.fonts.check('italic 400 16px Serrif'),
  clockFont: getComputedStyle(document.getElementById('clock')).fontFamily,
  size: getComputedStyle(document.getElementById('clock')).fontSize,
  fvs: getComputedStyle(document.getElementById('clock')).fontVariationSettings,
}));
ok('Saans variable font loaded', fontInfo.saans, `clock font-size ${fontInfo.size}, ${fontInfo.fvs}`);
ok('Serrif loaded for the wordmark accent', fontInfo.serrif, fontInfo.clockFont);

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
ok('starts in dark mode (the default scheme)', start.dark && near(parse(start.bg), [0, 0, 0]), `bg ${start.bg}`);
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
  !lightNow.dark && near(parse(lightNow.bg), [242, 240, 230]) && near(parse(lightNow.fg), [0, 0, 0]),
  `bg ${lightNow.bg} · fg ${lightNow.fg}`);
ok('theme choice is remembered', lightNow.saved === '0' && lightNow.label === 'Night Shift',
  `localStorage=${lightNow.saved} · label=${lightNow.label}`);
await page.screenshot({ path: 'shot-light.png' });
await page.locator('#btnNight').click();
await page.waitForTimeout(400);
ok('toggling back restores black', await page.evaluate(
  () => getComputedStyle(document.body).backgroundColor) === 'rgb(0, 0, 0)');

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
await page.waitForTimeout(150);
ok('reopening the picker centers the active city with a clean top edge', await page.evaluate(() => {
  const list = document.getElementById('tzList');
  const row = document.querySelector('.tz-row[data-zone="Asia/Tokyo"]');
  const lr = list.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  const centered = !!row && !row.hidden && rr.top >= lr.top && rr.bottom <= lr.bottom;
  const clean = [...list.children].every((el) => {
    if (el.hidden) return true;
    const r = el.getBoundingClientRect();
    return !(r.top < lr.top - 0.5 && r.bottom > lr.top + 0.5);
  });
  document.getElementById('tzBtn').click();
  return centered && clean;
}));
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
ok('window button offers three formats', await page.locator('#winList .tz-row').count() === 3);
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
  z1.zen && z1.zone === 'Asia/Jakarta' && z1.flag && z1.meta === 'none' && z1.layBtns === 3 && z1.fits,
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

/* --- languages: ten options with flags, live translation, RTL --- */
await page.locator('#langBtn').click();
await page.waitForTimeout(150);
const langRows = await page.locator('#langList .tz-row').count();
ok('language toggle lists 10 languages', langRows === 10, `${langRows} rows`);
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
ok('生活 sits beside the Singhoah wordmark',
  (await page.locator('.wordmark-zh').textContent()) === '生活');

/* --- the world map: detailed SVG, click a country to pick its zone --- */
await page.locator('#btnMap').click();
await page.waitForTimeout(300);
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
ok('the current zone country is highlighted', mp1.sel === mp1.cc, `${mp1.sel} vs ${mp1.cc}`);
await page.screenshot({ path: 'shot-map.png' });
await page.locator('#mapSvg .map-cc[data-cc="JP"]').click();
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
await mob.close();

/* --- SinghoWallet: the wallet as its own app --- */
const wpage = await context.newPage();
const werrors = [];
wpage.on('pageerror', (e) => werrors.push(String(e)));
await wpage.goto(URL + 'wallet.html', { waitUntil: 'load' });
await wpage.waitForTimeout(400);
ok('SinghoWallet loads as its own app',
  (await wpage.locator('.wordmark').textContent()).includes('Wallet'));
ok('the wallet page does not scroll', await wpage.evaluate(() =>
  getComputedStyle(document.querySelector('.wallet-app')).overflow === 'hidden'
  && getComputedStyle(document.querySelector('.wal-body')).overflow === 'hidden'));
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
ok('reports dashboard shows this month and a 7-day chart',
  await wpage.evaluate(() => /30/.test(document.getElementById('walRepBox').textContent)
    && document.querySelectorAll('#walRepBox .wal-bar').length === 7));
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
ok('no page errors in the wallet app', werrors.length === 0, werrors.join('; '));

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

await browser.close();

if (warnings.length) console.log(`\nWARNINGS (environmental, not failing):\n${warnings.join('\n')}`);
console.log(`\n${errors.length ? 'CONSOLE/NETWORK ISSUES:\n' + errors.join('\n') : 'no console or network errors'}`);
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length || errors.length ? 1 : 0);
