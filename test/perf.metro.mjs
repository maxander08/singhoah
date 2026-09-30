/* Metro interaction profiler: measures real frame cadence during synthetic
   pan / zoom gestures, plus scene weight. Run: node test/perf.metro.mjs */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:4173/metro.html';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 850 } });
await ctx.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL, { waitUntil: 'load' });

/* wait for the TRTC basemap bake to settle (painted count stable 2 s) */
await p.waitForFunction(() => {
  if (!window.__w) window.__w = { n: -1, stable: 0 };
  const n = globalThis.__METRO.baseStats().painted;
  window.__w.stable = (n === window.__w.n && n > 10) ? window.__w.stable + 1 : 0;
  window.__w.n = n;
  return window.__w.stable >= 4;
}, null, { timeout: 120000, polling: 500 });
await p.waitForTimeout(600);

const stats = await p.evaluate(() => ({
  bake: globalThis.__METRO.baseStats(),
  canvasPx: (() => { const c = document.getElementById('metroBaseCanvas'); return c.width + 'x' + c.height; })(),
  stations: document.querySelectorAll('#metroStations circle').length,
}));
console.log('scene:', JSON.stringify(stats));

await p.evaluate(() => {
  window.__f = [];
  window.__lt = [];
  new PerformanceObserver((l) => window.__lt.push(...l.getEntries().map((e) => Math.round(e.duration)))).observe({ entryTypes: ['longtask'] });
  const l = (t) => { window.__f.push(t); requestAnimationFrame(l); };
  requestAnimationFrame(l);
});

const sample = async (label, fn) => {
  await p.evaluate(() => { window.__mark = window.__f.length; window.__ltMark = window.__lt.length; });
  await fn();
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const f = window.__f.slice(window.__mark);
    const d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
    d.sort((a, b2) => a - b2);
    const q = (x) => d.length ? +d[Math.min(d.length - 1, Math.floor(d.length * x))].toFixed(1) : 0;
    return {
      frames: d.length, median: q(0.5), p95: q(0.95), worst: d.length ? +d[d.length - 1].toFixed(1) : 0,
      over33: d.filter((x) => x > 33).length, over50: d.filter((x) => x > 50).length,
      longtasks: window.__lt.slice(window.__ltMark).length,
    };
  });
  console.log(label.padEnd(34), JSON.stringify(r));
  return r;
};

/* zoom in first so panning is live */
await p.evaluate(() => globalThis.__METRO.zoomBy(3));
await p.waitForTimeout(500);

/* 1) drag pan: 100 moves over ~1.6 s */
await sample('PAN (100 moves / 1.6s)', async () => {
  await p.evaluate(async () => {
    const svg = document.getElementById('metroSvg');
    const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true, pointerType: 'mouse' }));
    ev('pointerdown', 700, 450);
    for (let i = 1; i <= 100; i++) {
      ev('pointermove', 700 - i * 3, 450 - i * 1.5);
      await new Promise((r) => setTimeout(r, 16));
    }
    ev('pointerup', 400, 300);
  });
});
await p.waitForTimeout(700);

/* 2) wheel zoom: 24 notches in, 50 ms apart */
await sample('WHEEL ZOOM (24 notches)', async () => {
  await p.evaluate(async () => {
    const svg = document.getElementById('metroSvg');
    for (let i = 0; i < 24; i++) {
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: i < 12 ? -100 : 100, clientX: 640, clientY: 420, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 50));
    }
  });
});
await p.waitForTimeout(700);

/* 3) pinch (2-pointer) zoom: 60 moves */
await sample('PINCH ZOOM (60 moves)', async () => {
  await p.evaluate(async () => {
    const svg = document.getElementById('metroSvg');
    const ev = (t, id, x, y) => svg.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' }));
    ev('pointerdown', 1, 540, 420); ev('pointerdown', 2, 740, 420);
    for (let i = 1; i <= 60; i++) {
      ev('pointermove', 1, 540 - i, 420); ev('pointermove', 2, 740 + i, 420);
      await new Promise((r) => setTimeout(r, 16));
    }
    ev('pointerup', 1, 480, 420); ev('pointerup', 2, 800, 420);
  });
});

console.log('pageerrors:', errs.length);
await b.close();
