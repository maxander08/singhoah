/* throwaway: attribute the pan-frame cost between scene layers */
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 850 } });
await ctx.addInitScript(() => localStorage.setItem('singhoah:visited', '1'));
const p = await ctx.newPage();
await p.goto('http://localhost:4173/metro.html', { waitUntil: 'load' });
await p.waitForFunction(() => {
  if (!window.__w) window.__w = { n: -1, s: 0 };
  const n = globalThis.__METRO.baseStats().painted;
  window.__w.s = (n === window.__w.n && n > 10) ? window.__w.s + 1 : 0;
  window.__w.n = n; return window.__w.s >= 4;
}, null, { timeout: 120000, polling: 500 });
await p.waitForTimeout(400);
await p.evaluate(() => {
  globalThis.__METRO.zoomBy(3);
  window.__f = []; const l = (t) => { window.__f.push(t); requestAnimationFrame(l); }; requestAnimationFrame(l);
});
await p.waitForTimeout(400);

const pan = async (label, prep) => {
  await p.evaluate(prep);
  await p.evaluate(() => { window.__mark = window.__f.length; });
  await p.evaluate(async () => {
    const svg = document.getElementById('metroSvg');
    const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true, pointerType: 'mouse' }));
    ev('pointerdown', 700, 450);
    for (let i = 1; i <= 80; i++) { ev('pointermove', 700 - i * 3, 450 - i); await new Promise((r) => setTimeout(r, 16)); }
    ev('pointerup', 460, 370);
  });
  const r = await p.evaluate(() => {
    const f = window.__f.slice(window.__mark); const d = [];
    for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
    d.sort((a, b2) => a - b2);
    return { frames: d.length, median: d.length ? +d[d.length >> 1].toFixed(1) : 0, worst: d.length ? +d[d.length - 1].toFixed(1) : 0 };
  });
  await p.evaluate(() => {
    document.getElementById('metroBaseRoads').style.display = '';
    document.getElementById('metroBaseWater').style.display = '';
    document.getElementById('metroLines').style.display = '';
    document.getElementById('metroStations').style.display = '';
    document.getElementById('metroLabels').style.display = '';
    for (const e of document.querySelectorAll('.b-tile')) e.removeAttribute('data-nove');
    document.getElementById('metroSvg').style.shapeRendering = '';
  });
  await p.waitForTimeout(500);
  console.log(label.padEnd(38), JSON.stringify(r));
};

await pan('baseline (everything on)', () => {});
await pan('streets+water HIDDEN', () => {
  document.getElementById('metroBaseRoads').style.display = 'none';
  document.getElementById('metroBaseWater').style.display = 'none';
});
await pan('vector-effect REMOVED from tiles', () => {
  for (const e of document.querySelectorAll('.b-tile')) e.removeAttribute('vector-effect');
});
await pan('shape-rendering=optimizeSpeed', () => {
  document.getElementById('metroSvg').style.shapeRendering = 'optimizeSpeed';
});
await pan('ONLY streets+water (lines/stations off)', () => {
  document.getElementById('metroLines').style.display = 'none';
  document.getElementById('metroStations').style.display = 'none';
  document.getElementById('metroLabels').style.display = 'none';
});
await b.close();
