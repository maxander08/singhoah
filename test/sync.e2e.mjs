/* Two-"device" end-to-end test of the cloud sync protocol.
   Firebase SDK modules are stubbed (route-intercepted) against a tiny
   in-memory store (test/fbstore.mjs on :4199), so two separate browser
   contexts behave like two signed-in devices. */
import { chromium } from 'playwright';

const FAKE_APP = `export function initializeApp(cfg){ return { cfg }; }`;
const FAKE_AUTH = `
export function getAuth(app){ return { app }; }
export function onAuthStateChanged(auth, cb){ setTimeout(() => cb({ uid: 'tester', displayName: 'Tester', email: 'tester@example.com', photoURL: '' }), 30); return () => {}; }
export class GoogleAuthProvider {}
export function signInWithPopup(){ return Promise.reject(new Error('stub')); }`;
const FAKE_FS = `
const BASE = 'http://127.0.0.1:4199';
export function getFirestore(app){ return {}; }
export function doc(db, col, id){ return { col, id }; }
export async function getDoc(ref){
  const r = await fetch(BASE + '/doc/' + encodeURIComponent(ref.id));
  const j = await r.json();
  return { exists: () => j.exists, data: () => j.data };
}
export async function setDoc(ref, obj, opts){
  await fetch(BASE + '/doc/' + encodeURIComponent(ref.id), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: obj, merge: !!(opts && opts.merge) }),
  });
}`;

const stub = (ctx) => ctx.route('https://www.gstatic.com/firebasejs/10.12.2/**', (route) => {
  const u = route.request().url();
  const body = u.endsWith('firebase-app.js') ? FAKE_APP : u.endsWith('firebase-auth.js') ? FAKE_AUTH : FAKE_FS;
  route.fulfill({ status: 200, contentType: 'text/javascript', body });
});

const wallet5000 = JSON.stringify({ cur: 'USD', tx: [{ id: 'a1', type: 'in', amt: 5000, ts: Date.now(), note: 'Income' }] });

const browser = await chromium.launch();

/* ---- device A: has a 5000 income locally, signed in ---- */
const ctxA = await browser.newContext();
await stub(ctxA);
await ctxA.addInitScript((w) => {
  localStorage.setItem('singhoah:authseen', '1');
  localStorage.setItem('singhoah:visited', '1');
  localStorage.setItem('singhoah:wallet', w);
}, wallet5000);
const A = await ctxA.newPage();
await A.goto('http://127.0.0.1:4173/wallet.html', { waitUntil: 'load' });
await A.waitForTimeout(4000);

const store = await fetch('http://127.0.0.1:4199/doc/tester').then((r) => r.json());
console.log('A pushed to cloud:', store.exists && store.data.wallet && store.data.wallet.tx.length === 1 ? 'PASS' : 'FAIL', JSON.stringify(store.data && store.data.wallet));

/* ---- device B: fresh browser, signed in, must adopt the 5000 ---- */
const ctxB = await browser.newContext();
await stub(ctxB);
await ctxB.addInitScript(() => {
  localStorage.setItem('singhoah:authseen', '1');
  localStorage.setItem('singhoah:visited', '1');
});
const B = await ctxB.newPage();
await B.goto('http://127.0.0.1:4173/wallet.html', { waitUntil: 'load' });
await B.waitForFunction(() => (document.getElementById('walBal') || {}).textContent === '$5,000', null, { timeout: 15000 })
  .then(() => console.log('B adopted cloud ledger: PASS'))
  .catch(() => console.log('B adopted cloud ledger: FAIL', ));

/* B must NOT have clobbered the cloud with its (former) empty ledger */
const store2 = await fetch('http://127.0.0.1:4199/doc/tester').then((r) => r.json());
console.log('B did not clobber cloud:', store2.data.wallet.tx.length === 1 ? 'PASS' : 'FAIL');

/* ---- device B adds +250; device A must pick it up live ---- */
await B.click('#walTypeIn');
await B.fill('#walAmt', '250');
await B.click('#walAddBtn');
await A.waitForFunction(() => (document.getElementById('walBal') || {}).textContent === '$5,250', null, { timeout: 15000 })
  .then(() => console.log('A pulled B new entry live: PASS'))
  .catch(() => console.log('A pulled B new entry live: FAIL'));
console.log('A balance now:', await A.textContent('#walBal'), '| B balance now:', await B.textContent('#walBal'));

await browser.close();
