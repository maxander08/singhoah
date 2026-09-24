/* visual/geometry probe for the wide-desktop + scrollable-mobile wallet layout */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:4173/';
const browser = await chromium.launch();

async function seed(page) {
  await page.evaluate(() => {
    localStorage.setItem('singhoah:wallet', JSON.stringify({ cur: 'USD', tx: [
      { id: 't1', type: 'in', amt: 5000, date: '2026-09-24', note: 'Salary', ts: 1 },
      { id: 't2', type: 'out', amt: 320, date: '2026-09-24', note: 'Groceries', ts: 2 },
      { id: 't3', type: 'out', amt: 180, date: '2026-09-23', note: 'Metro card', ts: 3 },
    ] }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
}

/* ---- desktop 1568x900 (same as the user's screenshot) ---- */
const d = await browser.newContext({ viewport: { width: 1568, height: 900 } });
const dp = await d.newPage();
await dp.goto(URL + 'wallet.html', { waitUntil: 'load' });
await seed(dp);
const dg = await dp.evaluate(() => {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  const panel = r('.wal-panel'), head = r('.wal-head'), form = r('.wal-form'), main = r('.wal-main');
  return {
    vw: innerWidth,
    panelW: Math.round(panel.width),
    headFull: Math.abs(head.width - panel.width) < 4,
    formLeftOfMain: form.right <= main.left + 2,
    belowHead: form.top >= head.bottom - 2 && main.top >= head.bottom - 2,
    bodyOverflow: getComputedStyle(document.body).overflowY,
    appOY: getComputedStyle(document.querySelector('.wallet-app')).overflowY,
    pageScrolls: document.documentElement.scrollHeight > innerHeight + 1,
    balFont: getComputedStyle(document.getElementById('walBal')).fontSize,
  };
});
console.log('DESKTOP', JSON.stringify(dg));
await dp.screenshot({ path: 'shot-wallet-wide.png' });

/* reports view too */
await dp.click('#walTabR');
await dp.waitForTimeout(200);
await dp.screenshot({ path: 'shot-wallet-wide-reports.png' });
await d.close();

/* ---- phone 390x844 ---- */
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mp = await m.newPage();
await mp.goto(URL + 'wallet.html', { waitUntil: 'load' });
await seed(mp);
const mg = await mp.evaluate(() => {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  const form = r('.wal-form'), main = r('.wal-main');
  return {
    noHScroll: document.documentElement.scrollWidth <= innerWidth + 1,
    stacked: form.bottom <= main.top + 2,
    pageScrolls: document.documentElement.scrollHeight > innerHeight + 1,
    bodyOY: getComputedStyle(document.body).overflowY,
  };
});
console.log('MOBILE', JSON.stringify(mg));
/* scroll to the bottom to prove scrollability, then shoot */
await mp.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await mp.waitForTimeout(200);
const atBottom = await mp.evaluate(() => Math.abs(innerHeight + scrollY - document.documentElement.scrollHeight) < 4);
console.log('MOBILE scrolledToBottom', atBottom);
await mp.screenshot({ path: 'shot-wallet-mobile-wide.png' });
await m.close();

await browser.close();
