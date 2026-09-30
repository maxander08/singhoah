import { chromium } from 'playwright';
const B = await chromium.launch();
const P = await (await B.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await P.goto('http://localhost:4173/wallet.html');
await P.evaluate(() => localStorage.setItem('singhoah:wallet', JSON.stringify({ cur: 'JPY', tx: [{ type: 'in', amt: 9875 }] })));
await P.goto('http://localhost:4173/wallet.html');
await P.click('#walTabC');
await P.waitForSelector('.cash-coin');
console.log(await P.evaluate(() => ({
  notes: [...document.querySelectorAll('.cash-note')].map((n) => n.title),
  coins: [...document.querySelectorAll('.cash-coin')].map((n) => n.title),
  holedArt5: !!document.getElementById('cc-JPY-c-5'),
  holedArt50: !!document.getElementById('cc-JPY-c-50'),
})));
await B.close();
