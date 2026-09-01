import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/mapdata.js';
import { pathToFileURL } from 'node:url';

// flags.js is a classic script: importing it plants globalThis.__SINGHOAH_FLAGS
await import(pathToFileURL(new URL('../flags.js', import.meta.url).pathname).href);
const app = await import(pathToFileURL(new URL('../app.js', import.meta.url).pathname).href);
const {
  pad, toSegments, formatClock, toDigits, DIGIT_KIND,
  formatDateLong, formatTimeShort, zoneInfo,
  NTP_SOURCES, sampleNtp, pickNtpResult, syncStatus, ClockCore,
  CLOCK_EMS, CLOCK_GLYPHS, MONO_ADVANCE, LETTER_SPACE_EM, fitFontSize, isCoarse,
  allTimeZones, zoneCountry, flagSrc, ccFlag, GLOBE_SVG, LANGS, t,
  parseLayout, layoutShape, zoneWindowUrl, handAngles,
  timerSegments, anglesFromSegments, stopwatchElapsed,
  walBalance, walByDay, walMonthStats, walWeekSeries,
} = app;

const at = (iso) => new Date(iso);

test('pad pads and never truncates', () => {
  assert.equal(pad(7), '07');
  assert.equal(pad(7, 3), '007');
  assert.equal(pad(42, 3), '042');
  assert.equal(pad(1234, 2), '34');
});

test('formatClock renders HH:MM:SS:mmm', () => {
  assert.equal(formatClock(at('2026-08-25T14:05:09.007')), '14:05:09:007');
  assert.equal(formatClock(at('2026-01-01T00:00:00.000')), '00:00:00:000');
  assert.equal(formatClock(at('2026-12-31T23:59:59.999')), '23:59:59:999');
});

test('toSegments breaks the time into parts', () => {
  assert.deepEqual(toSegments(at('2026-08-25T09:08:07.654')), { hh: '09', mm: '08', ss: '07', ms: '654' });
});

test('the clock is 11 character slots: 8 digits + 3 colons', () => {
  const d = toDigits(at('2026-08-25T14:05:09.007'));
  assert.deepEqual(d, ['1', '4', ':', '0', '5', ':', '0', '9', ':', '0', '0', '7']);
  assert.deepEqual(DIGIT_KIND, ['digit', 'digit', 'sep', 'digit', 'digit', 'sep', 'digit', 'digit', 'sep', 'ms', 'ms', 'ms']);
});

test('header date + short time are rendered above the clock', () => {
  const d = at('2026-08-25T14:05:09.007');
  assert.match(formatDateLong(d, { timeZone: 'UTC' }), /^Tuesday,? 25 August 2026$/);
  assert.equal(formatTimeShort(d, { timeZone: 'UTC' }), '14:05');
  const z = zoneInfo(d);
  assert.match(z.utc, /^UTC[+−]\d{2}:\d{2}$/);
  assert.equal(typeof z.tz, 'string');
});

test('toSegments and formatClock honour a time zone', () => {
  const d = at('2026-08-25T14:05:09.007Z');
  assert.deepEqual(toSegments(d, 'UTC'), { hh: '14', mm: '05', ss: '09', ms: '007' });
  assert.deepEqual(toSegments(d, 'Asia/Jakarta'), { hh: '21', mm: '05', ss: '09', ms: '007' });
  assert.equal(formatClock(d, 'America/New_York'), '10:05:09:007'); // August = EDT, UTC−4
  // the local fast path is unchanged when no zone is given
  assert.equal(toSegments(d).ms, '007');
});

test('zoneInfo reports any selected zone', () => {
  const d = at('2026-08-25T14:05:09.007Z');
  const j = zoneInfo(d, 'Asia/Jakarta');
  assert.equal(j.tz, 'Asia/Jakarta');
  assert.equal(j.utc, 'UTC+07:00');
  assert.ok(j.abbr.length > 0, `abbr: ${j.abbr}`);
  const n = zoneInfo(d, 'America/New_York');
  assert.equal(n.utc, 'UTC−04:00');
  const u = zoneInfo(d, 'UTC');
  assert.equal(u.utc, 'UTC+00:00');
});

test('allTimeZones lists the whole IANA database', () => {
  const zones = allTimeZones();
  assert.ok(zones.length >= 400, `only ${zones.length} zones`);
  for (const z of ['UTC', 'Asia/Jakarta', 'America/New_York', 'Pacific/Kiritimati', 'Europe/Prague']) {
    assert.ok(zones.includes(z), z);
  }
});

test('zoneCountry and flagSrc give every zone a flag — no globes', () => {
  assert.equal(zoneCountry('Asia/Jakarta'), 'ID');
  assert.equal(zoneCountry('Europe/Prague'), 'CZ');
  assert.equal(zoneCountry('America/New_York'), 'US');
  // legacy aliases and UTC are mapped too
  assert.equal(zoneCountry('Africa/Accra'), 'GH');
  assert.equal(zoneCountry('Europe/Oslo'), 'NO');
  assert.equal(zoneCountry('Asia/Calcutta'), 'IN');
  assert.equal(zoneCountry('UTC'), 'UN');
  for (const z of ['UTC', ...allTimeZones()]) {
    assert.ok(flagSrc(z).startsWith('data:image/svg+xml;base64'), `${z} has an SVG flag`);
  }
  // the globe only remains for zones that do not exist at all
  assert.equal(flagSrc('Mars/Olympus_Mons'), GLOBE_SVG);
});

test('t() translates all ten languages and syncStatus follows along', () => {
  assert.equal(LANGS.length, 10);
  assert.ok(LANGS.some((l) => l.id === 'zh-Hant' && l.flag === 'TW'), 'Traditional Chinese included');
  assert.equal(t('en', 'night'), 'Night Shift');
  assert.equal(t('zh-Hant', 'date'), '日期');
  assert.equal(t('zh-Hant', 'night'), '夜間模式');
  assert.equal(t('ar', 'time'), 'الوقت');
  assert.equal(t('ur', 'resync'), 'دوبارہ سنک');
  assert.equal(t('nope', 'window'), 'Window', 'unknown languages fall back to English');
  assert.equal(t('fr', 'drift', { mag: '+32 ms', res: '' }), 'dérive de l’appareil +32 ms — corrigée');
  const r = { ok: true, source: 'timeapi.io', offset: 12, resolution: 'millisecond', rtt: 90, at: 1 };
  assert.equal(syncStatus(r, { lang: 'es' }).label, 'Sincronizado · timeapi.io');
  assert.match(syncStatus(r, { lang: 'zh-Hant' }).detail, /已校正/);
  assert.equal(syncStatus(r).label, 'Synced · timeapi.io', 'default stays English');
});

test('every language has a flag in the embedded set', () => {
  for (const L of LANGS) {
    assert.ok(ccFlag(L.flag).startsWith('data:image/svg+xml;base64'), `${L.id} -> ${L.flag}`);
  }
});

test('world map data is detailed and covers the catalogue', () => {
  const M = globalThis.__SINGHOAH_MAP;
  const n = Object.keys(M.cc).length;
  assert.ok(n >= 230, `${n} countries`);
  assert.ok(M.cc.US.startsWith('M') && M.cc.JP && M.cc.AU && M.cc.RU);
  assert.ok(M.grat.startsWith('M') && M.w === 960 && M.h === 500);
});

test('stopwatchElapsed accumulates while running, freezes when paused', () => {
  const st = { startedAt: 1000, accum: 500, running: true };
  assert.equal(stopwatchElapsed(st, 3000), 2500);
  st.running = false;
  assert.equal(stopwatchElapsed(st, 99999), 500);
});

test('timerSegments formats countdowns and clamps', () => {
  assert.deepEqual(timerSegments(90000), { hh: '00', mm: '01', ss: '30', ms: '000' });
  assert.deepEqual(timerSegments(-5), { hh: '00', mm: '00', ss: '00', ms: '000' });
  assert.deepEqual(timerSegments(359999999), { hh: '99', mm: '59', ss: '59', ms: '999' });
  assert.equal(anglesFromSegments({ hh: '03', mm: '00', ss: '00', ms: '000' }).hour, 90);
});

test('handAngles maps a moment to dial degrees', () => {
  const a = handAngles(new Date(2026, 0, 1, 3, 0, 0, 0));
  assert.deepEqual(a, { hour: 90, minute: 0, second: 0, milli: 0 });
  const b = handAngles(new Date(2026, 0, 1, 6, 30, 15, 500));
  assert.ok(Math.abs(b.hour - 195.12916666666666) < 1e-9, b.hour);
  assert.ok(Math.abs(b.minute - 181.55) < 1e-9, b.minute);
  assert.ok(Math.abs(b.second - 93) < 1e-9, b.second);
  assert.ok(Math.abs(b.milli - 180) < 1e-9, b.milli);
});

test('parseLayout and zoneWindowUrl build the window formats', () => {
  assert.equal(parseLayout('2'), 2);
  assert.equal(parseLayout('1x2'), 2);
  assert.equal(parseLayout('2x2'), 4);
  assert.equal(parseLayout('4'), 4);
  assert.equal(parseLayout(null), 1);
  assert.deepEqual(layoutShape(4), { rows: 2, cols: 2, id: '2x2' });
  const q = new URL(zoneWindowUrl('Asia/Tokyo', 4, 'http://x/'));
  assert.equal(q.searchParams.get('layout'), '2x2');
  assert.equal(q.searchParams.get('zen'), '1');
  assert.equal(q.searchParams.get('zones'), 'Asia/Tokyo,,,');
  const s = new URL(zoneWindowUrl('UTC', 1, 'http://x/'));
  assert.equal(s.searchParams.get('tz'), 'UTC');
  assert.ok(!s.searchParams.has('layout'));
});

test('ClockCore shows the system clock and applies a measured drift offset', () => {
  let t = Date.parse('2026-08-25T10:00:00.000Z');
  const queued = [];
  const seen = [];
  const core = new ClockCore({
    now: () => t,
    schedule: (fn) => { queued.push(fn); },
    onTick: (d) => { seen.push(d.toISOString()); },
  });

  assert.equal(core.running, true);
  assert.equal(formatClock(core.now()), '10:00:00:000');
  assert.equal(seen.length, 1, 'first frame renders immediately');

  t += 250;
  queued.shift()();
  assert.equal(formatClock(core.now()), '10:00:00:250');
  assert.equal(seen.length, 2);

  // the device clock is 137 ms slow -> the display is nudged forward
  core.setOffset(137);
  assert.equal(core.offset, 137);
  assert.equal(formatClock(core.now()), '10:00:00:387');

  // frames queued while stopped must not keep rendering
  const before = seen.length;
  core.stop();
  queued.shift()();
  assert.equal(seen.length, before);
  assert.equal(core.running, false);
});

test('pickNtpResult keeps fast samples, drops slow ones, takes the median', () => {
  const samples = [
    { ok: true, source: 'timeapi.io', rtt: 120, offset: 40, at: 1000 },
    { ok: true, source: 'timeapi.io', rtt: 90, offset: 34, at: 1100 },
    { ok: true, source: 'worldtimeapi.org', rtt: 2000, offset: 900, at: 1200 },
    { ok: false, source: 'worldclockapi.com', rtt: 0, error: 'boom' },
  ];
  const r = pickNtpResult(samples);
  assert.equal(r.offset, 37);          // median of 40 and 34
  assert.equal(r.rtt, 90);             // fastest of the kept samples
  assert.equal(r.source, 'timeapi.io');
  assert.equal(r.samples, 2);
  assert.equal(r.spread, 6);
  assert.equal(pickNtpResult([]), null);
  assert.equal(pickNtpResult(samples.filter((s) => s.rtt > 900)), null);
});

test('sampleNtp applies the symmetric latency correction (offset = server + rtt/2 − recv)', async () => {
  const source = NTP_SOURCES[0];
  const res = await sampleNtp(source, {
    now: (() => { let i = 0; const t = [10_000, 10_200]; return () => t[i++]; })(),
    fetch: async () => ({
      ok: true,
      json: async () => ({ dateTime: '1970-01-01T00:00:11.000' }),
    }),
  });
  // server clock is 11.000s, we received at 10.200s, rtt 200ms -> +900ms drift
  assert.equal(res.ok, true);
  assert.equal(res.offset, 900);
  assert.equal(res.rtt, 200);
  assert.equal(res.source, 'timeapi.io');
});

test('sampleNtp reports failures instead of throwing', async () => {
  const bad = await sampleNtp(NTP_SOURCES[0], { fetch: async () => { throw new Error('network'); } });
  assert.equal(bad.ok, false);
  const http = await sampleNtp(NTP_SOURCES[0], { fetch: async () => ({ ok: false, status: 503 }) });
  assert.equal(http.ok, false);
  assert.match(http.error, /503/);
});

test('the clock is 6.96 em wide and fitFontSize respects width, height and cap', () => {
  assert.equal(CLOCK_EMS, 6.96);
  // the literal has to agree with the glyph metrics it claims to describe
  assert.ok(Math.abs(CLOCK_EMS - CLOCK_GLYPHS * (MONO_ADVANCE - LETTER_SPACE_EM)) < 1e-9);
  // 392 px wide box -> 392 / 7.2 = 54.4 px, not limited by height
  assert.equal(fitFontSize(392, 700, { padX: 0 }), 56.32);
  // 60 px of height -> 60 / 0.84 = 71.4 px, which is the binding limit
  assert.equal(fitFontSize(3000, 60, { padX: 0, padY: 0 }), 71.42);
  // never above the cap, never below 12 px
  assert.equal(fitFontSize(10000, 10000, { padX: 0, max: 340 }), 340);
  assert.equal(fitFontSize(10, 10, { padX: 0 }), 12);
  // at the chosen size the rendered string must fit the box
  const size = fitFontSize(420, 300, { padX: 24 });
  assert.ok(size * CLOCK_EMS <= 420 - 24, `${size} * 7.2 = ${size * CLOCK_EMS}`);
});

test('coarse (Date-header) sources are only trusted when nothing finer answers', () => {
  const precise = { ok: true, source: 'timeapi.io', rtt: 200, offset: 40, at: 1, coarse: false };
  const coarse = { ok: true, source: 'jsdelivr Date header', rtt: 60, offset: -380, at: 2, coarse: true };

  const both = pickNtpResult([coarse, precise]);
  assert.equal(both.offset, 40, 'the precise source wins even though it is slower');
  assert.equal(both.resolution, 'millisecond');
  assert.equal(both.source, 'timeapi.io');

  const fallback = pickNtpResult([coarse]);
  assert.equal(fallback.offset, -380);
  assert.equal(fallback.resolution, 'second');

  assert.equal(isCoarse(NTP_SOURCES.find((s) => s.name === 'jsdelivr Date header')), true);
  assert.equal(isCoarse(NTP_SOURCES.find((s) => s.name === 'timeapi.io')), false);
  assert.match(syncStatus(fallback).detail, /second resolution/);
});

test('a Date-header source parses the time out of the response headers', async () => {
  const source = NTP_SOURCES.find((s) => s.name === 'jsdelivr Date header');
  const res = await sampleNtp(source, {
    now: (() => { let i = 0; const t = [10_000, 10_060]; return () => t[i++]; })(),
    // a 404 body is fine — only the Date header matters
    fetch: async () => ({
      ok: false,
      status: 404,
      headers: { get: (k) => (k === 'date' ? 'Thu, 01 Jan 1970 00:00:11 GMT' : null) },
    }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.coarse, true);
  // 11.000s + 500 ms truncation + 30 ms half-rtt − 10.060s = +1470 ms
  assert.equal(res.offset, 1470);
});

test('syncStatus reports the three states', () => {
  assert.equal(syncStatus(null).level, 'off');
  assert.equal(syncStatus({ ok: true, source: 'timeapi.io', offset: 12 }).level, 'ok');
  assert.equal(syncStatus({ ok: true, source: 'timeapi.io', offset: -400 }).level, 'warn');
  assert.match(syncStatus({ ok: true, source: 'timeapi.io', offset: -400 }).detail, /−400 ms/);
});

test('wallet balance is income minus spending', () => {
  const tx = [
    { id: 'a', type: 'in', amt: 100, date: '2026-09-01' },
    { id: 'b', type: 'out', amt: 30.5, date: '2026-09-01' },
    { id: 'c', type: 'out', amt: 9.5, date: '2026-08-31' },
  ];
  assert.equal(walBalance(tx), 60);
  assert.equal(walBalance([]), 0);
});

test('wallet groups spending and income per day', () => {
  const tx = [
    { id: 'a', type: 'in', amt: 100, date: '2026-09-01' },
    { id: 'b', type: 'out', amt: 30.5, date: '2026-09-01' },
    { id: 'c', type: 'out', amt: 9.5, date: '2026-09-01' },
    { id: 'd', type: 'out', amt: 4, date: '2026-08-31' },
  ];
  const m = walByDay(tx);
  assert.equal(m.get('2026-09-01').spent, 40);
  assert.equal(m.get('2026-09-01').income, 100);
  assert.equal(m.get('2026-09-01').items.length, 3);
  assert.equal(m.get('2026-08-31').spent, 4);
  assert.equal(m.get('2026-08-31').income, 0);
});

test('month stats: spent, income, daily average, largest expense', () => {
  const tx = [
    { id: 'a', type: 'in', amt: 500, date: '2026-09-01' },
    { id: 'b', type: 'out', amt: 30, note: 'Dinner', date: '2026-09-01' },
    { id: 'c', type: 'out', amt: 10, date: '2026-09-02' },
    { id: 'd', type: 'out', amt: 99, date: '2026-08-15' }, // previous month: ignored
  ];
  const st = walMonthStats(tx, '2026-09-02');
  assert.equal(st.spent, 40);
  assert.equal(st.income, 500);
  assert.equal(st.avg, 20); // 40 over 2 elapsed days
  assert.equal(st.top.amt, 30);
});

test('week series returns 7 days ending at today', () => {
  const s7 = walWeekSeries([{ type: 'out', amt: 5, date: '2026-09-01' }], '2026-09-03');
  assert.equal(s7.length, 7);
  assert.equal(s7[6].date, '2026-09-03');
  assert.equal(s7[4].date, '2026-09-01');
  assert.equal(s7[4].spent, 5);
  assert.equal(s7[5].spent, 0);
  assert.equal(walWeekSeries([], '2026-01-01')[6].spent, 0);
});
