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

const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP huggingface.co 127.0.0.2, MAP cdn-lfs.huggingface.co 127.0.0.2, MAP cdn-lfs-us-1.hf.co 127.0.0.2, MAP cas-bridge.xethub.hf.co 127.0.0.2'] });

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

/* ---- documents: SinghoModule flows must sync across signed-in devices ----
   create on A, appear on B live; edit on B, refresh on A; delete on A,
   stay deleted on B (tombstone). */
const AM = await ctxA.newPage();
await AM.goto('http://127.0.0.1:4173/module.html', { waitUntil: 'load' });
await AM.waitForTimeout(1500);
const flowId = await AM.evaluate(() => {
  const M = globalThis.__MOD;
  const id = M.newDoc();
  const t2 = M.add('text', 40, 40);
  M.cfg(t2.id, { text: 'created on A' });
  const o = M.add('io', 420, 40);
  M.wire(t2.id, o.id);
  const ti = document.getElementById('modTitle');
  ti.value = 'Cloud flow';
  ti.dispatchEvent(new Event('input'));
  return id;
});
const pushed = await AM.waitForFunction(() => {
  try {
    const d = JSON.parse(localStorage.getItem('singhoah:docs') || '{}');
    const f = Object.values(d).find((x) => x.title === 'Cloud flow');
    return !!(f && f.data && f.data.nodes && f.data.nodes.length === 2);
  } catch { return false; }
}, null, { timeout: 10000 }).then(() => true).catch(() => false);
console.log('A created the flow locally + saved:', pushed ? 'PASS' : 'FAIL');
/* the push rides the same 2.5 s poll as the wallet */
const cloudDocs = await AM.waitForFunction(async () => {
  try {
    const r = await fetch('http://127.0.0.1:4199/doc/tester');
    const j = await r.json();
    const docs = j.data && j.data.docs;
    return !!(docs && Object.values(docs).some((x) => x.title === 'Cloud flow'));
  } catch { return false; }
}, null, { timeout: 15000, polling: 1000 }).then(() => true).catch(() => false);
console.log('A pushed the flow to cloud:', cloudDocs ? 'PASS' : 'FAIL');

const BM = await ctxB.newPage();
await BM.goto('http://127.0.0.1:4173/module.html', { waitUntil: 'load' });
const bSaw = await BM.waitForFunction(() => {
  try {
    const d = JSON.parse(localStorage.getItem('singhoah:docs') || '{}');
    return Object.values(d).some((x) => x.title === 'Cloud flow');
  } catch { return false; }
}, null, { timeout: 15000 }).then(() => true).catch(() => false);
console.log('B adopted the flow (sign-in sync):', bSaw ? 'PASS' : 'FAIL');

/* B edits the flow; A must refresh its open copy. Wait for B's sign-in sync
   to finish first (lastSent is captured once at startup — an edit landing
   inside that window would be considered already-pushed). */
await BM.waitForTimeout(3500);
await BM.evaluate((id) => {
  globalThis.__MOD.openDoc(id);
  const M = globalThis.__MOD;
  const t2 = M.nodes().find((n) => n.type === 'text');
  M.cfg(t2.id, { text: 'edited on B' });
  M.run();
}, flowId);
const aSawEdit = await AM.waitForFunction(() => {
  const M = globalThis.__MOD;
  const t2 = M.nodes().find((n) => n.type === 'text');
  return !!(t2 && t2.cfg.text === 'edited on B');
}, null, { timeout: 20000 }).then(() => true).catch(() => false);
console.log('A pulled B edit live (open flow refreshed):', aSawEdit ? 'PASS' : 'FAIL');

/* A deletes the flow; B must lose it and never resurrect it */
await AM.evaluate((id) => { globalThis.__MOD.home(); }, flowId);
await AM.waitForTimeout(300);
await AM.evaluate((id) => {
  /* the files home's own delete path: confirm twice */
  const card = [...document.querySelectorAll('.fl-card')].find((c) => c.textContent.includes('Cloud flow'));
  if (!card) throw new Error('no card');
  const del = card.querySelector('.fl-del');
  del.click();
  del.click();
}, flowId);
const bLost = await BM.waitForFunction(() => {
  try {
    const d = JSON.parse(localStorage.getItem('singhoah:docs') || '{}');
    return !Object.values(d).some((x) => x.title === 'Cloud flow');
  } catch { return false; }
}, null, { timeout: 20000 }).then(() => true).catch(() => false);
console.log('B lost the deleted flow (tombstone, no resurrection):', bLost ? 'PASS' : 'FAIL');

await browser.close();
