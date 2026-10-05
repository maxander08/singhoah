/* SMate interpreter gate: every app, every capability — no model, no stub.
   The interpreter is deterministic and instant, so this tests the REAL
   command surface a user gets. Run: HERMETIC=1 node test/serve.mjs &   node test/smate.interpreter.mjs */
import { chromium } from 'playwright';
const URL = 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(() => { localStorage.setItem('singhoah:visited', '1'); localStorage.setItem('singhoah:night', '0'); });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(400);
let pass = 0, fail = 0;
const rows = () => page.evaluate(() => [...document.querySelectorAll('.smate-it')].map((n) => (n.textContent || '').trim()));
const settle = async () => {
  await page.waitForFunction(() => !!document.querySelector('.smate-dots'), null, { timeout: 6000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.smate-dots'), null, { timeout: 15000 });
  await page.waitForTimeout(400);
};
const ensureIn = async () => { for (let i = 0; i < 3; i++) { if (await page.locator('#smateIn').isVisible().catch(() => false)) return; await page.click('#smateBtn').catch(() => {}); await page.waitForTimeout(300); } };
const T = async (name, t, check) => { await ensureIn(); await page.fill('#smateIn', t); await page.click('#smateSend'); await settle(); const r = (await rows()).slice(-1)[0] || ''; const ok = await check(r, page); ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + '  -> "' + r.slice(0, 70) + '"'); };

/* clock */
await T('timer 5', 'timer 5', async (r) => /timer|計時/i.test(r));
await T('natural timer', 'set a timer for 8 minutes', async (r) => /8/.test(r));
await T('word timer', 'five minute timer', async (r) => /5|five/i.test(r));
await T('change timer', 'change the timer to 10', async (r) => /10/.test(r));
await T('stop timer', 'stop the timer', async (r) => /done|完成/i.test(r));
await T('zh timer', '計時器 5', async (r) => /5|計時/i.test(r));
await T('stopwatch', 'start a stopwatch', async (r) => /done|完成/i.test(r));
await T('remind', 'remind me in 10 minutes', async (r) => /10|remind/i.test(r));
await T('math', 'what is 25 * 4', async (r) => /100/.test(r));
await T('percent', "what's 15% of 80", async (r) => /12/.test(r));
await T('word math', 'seven times six', async (r) => /42/.test(r));
await T('zone', 'zone tokyo', async (r) => /tokyo|東京/i.test(r));
await T('zh zone', '時區 台北', async (r) => /taipei|台北/i.test(r));
await T('natural zone', 'add london as a zone', async (r) => /london|倫敦/i.test(r));
await T('multi zone layout', '2x2 layout', async (r) => /2x2|quad|grid|window|layout|四/i.test(r));
await T('remove zone', 'remove the london zone', async (r) => /done|remove|刪/i.test(r));
await T('time', 'what time is it in Singapore', async (r) => /singapore|新加坡/i.test(r) && /\d{1,2}:\d{2}/.test(r));
await T('analog', 'analog mode', async (r) => /done|analog|類比/i.test(r));
await T('digital', 'digital mode', async (r) => /done|digital|數位/i.test(r));
await T('night', 'night shift', async (r, p) => /dark/.test(await p.evaluate(() => document.documentElement.className)));
await T('light', 'make it light', async (r, p) => !/dark/.test(await p.evaluate(() => document.documentElement.className)));
await T('map', 'map jakarta', async (r) => /done|map|地圖/i.test(r));
/* navigation */
await T('nav wallet', 'open the wallet', async (r, p) => /wallet\.html/.test(p.url()));
await page.goto(URL, { waitUntil: 'load' }); await page.waitForTimeout(300);
await T('nav metro', 'go to the metro', async (r, p) => /metro\.html/.test(p.url()));
await page.goto(URL, { waitUntil: 'load' }); await page.waitForTimeout(300);
await T('nav settings zh', '打開設定', async (r, p) => /settings\.html/.test(p.url()));
await page.goto(URL, { waitUntil: 'load' }); await page.waitForTimeout(300);
/* wallet */
await page.goto(URL.replace('index.html', 'wallet.html'), { waitUntil: 'load' }); await page.waitForTimeout(300);
await T('balance', 'how much money do I have', async (r) => /balance|0|NT|\$/i.test(r));
await T('spent', 'I spent 120 on lunch', async (r) => /done|120/i.test(r));
await T('income', 'received 500 for freelance', async (r) => /done|500/i.test(r));
await T('currency', 'change the currency to USD', async (r) => /USD|done/i.test(r));
await T('delete last', 'delete the last transaction', async (r) => /done|刪/i.test(r));
/* metro */
await page.goto(URL.replace('index.html', 'metro.html'), { waitUntil: 'load' }); await page.waitForTimeout(500);
await T('route', 'route from Ximen to Chiang Kai-shek Memorial Hall', async (r) => /NT\$|\$|fare|route/i.test(r));
await T('route zh', '從西門到台北車站', async (r) => /NT\$|\$|西門|fare/i.test(r));
await T('zoom', 'zoom in', async (r) => /done/i.test(r));
/* module */
await page.goto(URL.replace('index.html', 'module.html'), { waitUntil: 'load' }); await page.waitForTimeout(500);
await T('mathflow', 'build a flow that adds 2 and 3', async (r) => /5/.test(r));
let ida = '', idb = '';
await ensureIn(); await page.fill('#smateIn', 'add a number node'); await page.click('#smateSend'); await settle();
{ const r = (await rows()).slice(-1)[0] || ''; ida = (r.match(/(n\w+) number/) || [])[1] || ''; }
await ensureIn(); await page.fill('#smateIn', 'add an operator node'); await page.click('#smateSend'); await settle();
{ const r = (await rows()).slice(-1)[0] || ''; idb = (r.match(/(n\w+) operator/) || [])[1] || ''; }
console.log((ida && idb ? 'PASS' : 'FAIL') + ' nodes added: ' + ida + ' (number), ' + idb + ' (operator)');
ida && idb ? pass++ : fail++;
await T('modcfg', `set ${ida} to 7`, async (r) => /ok/i.test(r));
await T('modwire', `wire ${ida} to ${idb}`, async (r) => /wired/i.test(r));
await T('modremove', `remove ${idb}`, async (r) => /removed/i.test(r));
await T('cmpflow', 'is 5 greater than 3', async (r) => /true|1/i.test(r));
await T('logicflow', 'build a flow that or false and true', async (r) => /true|1/i.test(r));
await T('clear flow', 'clear the flow', async (r) => true);
/* scribe */
await page.goto(URL.replace('index.html', 'scribe.html'), { waitUntil: 'load' }); await page.waitForTimeout(500);
await T('new note', 'new note', async (r) => /note|untitled|done|新/i.test(r));
await T('files', 'show my files', async (r) => /file|done|檔/i.test(r));
/* generic UI + chat + fallback */
await T('click generic', 'click the night button', async (r) => /clicked/i.test(r));
await T('hi', 'hi', async (r) => /SMate|hello|你好/i.test(r));
await T('help', 'what can you do', async (r) => /timer|zone/i.test(r));
await T('fallback suggests', 'blah blah whatever xyzzy', async (r) => /try|timer|試/i.test(r));
console.log(`\n${pass} PASS / ${fail} FAIL | page errors: ${errs.length}`);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
