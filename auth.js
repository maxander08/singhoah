/* Optional "Sign in with Google" via Firebase Auth + Firestore.
   Silent unless firebase-config.js holds real keys. The Firebase
   SDK is fetched lazily — only when the visitor clicks Sign in, or
   returns having been signed in before — so pages stay fast and
   offline visitors never see an error.

   Signed in, the visitor's wallet + preferences (language, theme,
   clock city, launchpad zone) live in Cloud Firestore under
   users/<uid>: they are downloaded on sign-in and every local
   change is written back (last write wins). Without a reachable
   Firestore the portal falls back to per-account snapshots in this
   browser's localStorage. */

const G_SVG = '<svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19.2 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>';

(() => {
  const wrap = document.getElementById('authWrap');
  if (!wrap) return;
  const CFG = globalThis.SINGHOAH_FIREBASE;
  if (!CFG || /PASTE|YOUR_/.test(`${CFG.apiKey}|${CFG.projectId}|${CFG.appId}`)) return;

  const PREF_KEYS = ['singhoah:lang', 'singhoah:night', 'singhoah:tz', 'singhoah:lptz', 'singhoah:wallet'];
  const profileKey = (uid) => 'singhoah:profile:' + uid;
  const readPrefs = () => {
    const o = {};
    for (const k of PREF_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) o[k] = v;
    }
    return o;
  };
  const tOf = () => {
    const lib = globalThis.__SING_LIB;
    let lang = 'en';
    try { lang = localStorage.getItem('singhoah:lang') || 'en'; } catch { /* ignore */ }
    return (k) => (lib ? lib.t(lib.langOf(lang).id, k) : k);
  };

  let user = null;
  let fb = null;               /* { G, auth, app } once the SDK is loaded */
  let attached = false;

  function loadFB() {
    if (fb) return Promise.resolve(fb);
    return Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    ]).then(([appM, authM]) => {
      const app = appM.initializeApp(CFG);
      fb = { G: authM, auth: authM.getAuth(app), app };
      return fb;
    });
  }

  /* ---------- cloud sync (Firestore, users/<uid>) ---------- */

  const collect = () => {
    const o = { updated: Date.now() };
    try {
      const w = JSON.parse(localStorage.getItem('singhoah:wallet') || 'null');
      if (w && typeof w === 'object') o.wallet = w;
    } catch { /* ignore */ }
    for (const k of ['lang', 'night', 'tz', 'lptz']) {
      const v = localStorage.getItem('singhoah:' + k);
      if (v !== null) o[k] = v;
    }
    return o;
  };
  const sig = (o) => JSON.stringify({ ...o, updated: 0 });

  let pollTimer = 0, lastSent = '', pollRef = null, pollF = null;
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; } }
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(() => {
      if (!user || !pollRef || !pollF) return;
      const o = collect();
      const s = sig(o);
      if (s === lastSent) return;
      lastSent = s;
      pollF.setDoc(pollRef, o, { merge: true }).catch(() => { /* offline: next tick retries */ });
    }, 2500);
  }

  /* Returns true when the cloud handled this sign-in (adopted or
     pushed the ledger); false when Firestore is unreachable, so the
     caller falls back to the per-account local snapshot. */
  async function cloudSyncStart(u) {
    const { app } = await loadFB();
    let F;
    try { F = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'); } catch { return false; }
    let ref, snap;
    try {
      const db = F.getFirestore(app);
      ref = F.doc(db, 'users', u.uid);
      snap = await F.getDoc(ref);
    } catch { return false; }        /* rules / network / not created */
    pollRef = ref; pollF = F;
    if (snap.exists()) {
      let restored = false;
      try { restored = sessionStorage.getItem('singhoah:cloudrestored') === '1'; } catch { /* ignore */ }
      if (!restored) {
        const d = snap.data() || {};
        if (d.wallet && typeof d.wallet === 'object') {
          try { localStorage.setItem('singhoah:wallet', JSON.stringify(d.wallet)); } catch { /* ignore */ }
        }
        for (const k of ['lang', 'night', 'tz', 'lptz']) {
          if (typeof d[k] === 'string') { try { localStorage.setItem('singhoah:' + k, d[k]); } catch { /* ignore */ } }
        }
        try { sessionStorage.setItem('singhoah:cloudrestored', '1'); } catch { /* ignore */ }
        lastSent = '';
        location.reload();           /* every app picks up the cloud state */
        return true;
      }
    } else {
      try {
        const o = collect();
        await F.setDoc(ref, o);
        lastSent = sig(o);
      } catch { return false; }
    }
    startPoll();
    return true;
  }

  /* ---------- per-account local snapshot (fallback) ---------- */

  function localFallback(u) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(profileKey(u.uid)) || 'null'); } catch { /* ignore */ }
    let restored = false;
    try { restored = sessionStorage.getItem('singhoah:authrestored') === '1'; } catch { /* ignore */ }
    if (saved && typeof saved === 'object' && !restored) {
      for (const k of PREF_KEYS) if (typeof saved[k] === 'string') localStorage.setItem(k, saved[k]);
      try { sessionStorage.setItem('singhoah:authrestored', '1'); } catch { /* ignore */ }
      location.reload();
      return;
    }
    if (!saved) {
      try { localStorage.setItem(profileKey(u.uid), JSON.stringify(readPrefs())); } catch { /* ignore */ }
    }
  }

  /* ---------- UI ---------- */

  function render() {
    const t = tOf();
    wrap.textContent = '';
    if (!user) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'signinBtn';
      b.className = 'btn auth-btn';
      b.title = 'Google';
      b.innerHTML = `${G_SVG}<span></span>`;
      b.querySelector('span').textContent = t('signin');
      b.addEventListener('click', () => {
        loadFB()
          .then(({ G, auth }) =>
            G.signInWithPopup(auth, new G.GoogleAuthProvider()).then((c) => { attach(); return c; }))
          .catch(() => { /* dismissed / offline: stay signed out */ });
      });
      wrap.appendChild(b);
      return;
    }
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'btn auth-chip';
    chip.setAttribute('aria-haspopup', 'dialog');
    const ava = document.createElement('img');
    ava.className = 'auth-ava';
    ava.alt = '';
    ava.width = 20; ava.height = 20;
    ava.src = user.photoURL || '';
    if (!user.photoURL) ava.remove();
    const nm = document.createElement('span');
    nm.textContent = (user.displayName || user.email || '·').split(' ')[0];
    chip.append(ava, nm);

    const pop = document.createElement('div');
    pop.className = 'tz-pop auth-pop';
    pop.hidden = true;
    const head = document.createElement('div');
    head.className = 'auth-head';
    if (user.photoURL) {
      const big = document.createElement('img');
      big.className = 'auth-ava';
      big.width = 28; big.height = 28; big.alt = '';
      big.src = user.photoURL;
      head.appendChild(big);
    }
    const tx = document.createElement('div');
    const st = document.createElement('strong');
    st.textContent = user.displayName || '';
    const em = document.createElement('p');
    em.className = 'auth-mail';
    em.textContent = user.email || '';
    tx.append(st, em);
    head.appendChild(tx);
    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'btn auth-out';
    out.textContent = t('signout');
    out.addEventListener('click', () => {
      try { sessionStorage.removeItem('singhoah:authrestored'); } catch { /* ignore */ }
      try { sessionStorage.removeItem('singhoah:cloudrestored'); } catch { /* ignore */ }
      try { localStorage.removeItem('singhoah:authseen'); } catch { /* ignore */ }
      stopPoll();
      if (fb) fb.G.signOut(fb.auth);
      user = null;
      render();
    });
    pop.append(head, out);
    wrap.append(chip, pop);
    chip.addEventListener('click', () => { pop.hidden = !pop.hidden; });
  }

  document.addEventListener('pointerdown', (e) => {
    const pop = wrap.querySelector('.auth-pop');
    if (pop && !pop.hidden && !wrap.contains(e.target)) pop.hidden = true;
  });
  document.addEventListener('singhoah:lang', render);

  function attach() {
    if (attached) return;
    attached = true;
    loadFB().then(({ G, auth }) => {
      G.onAuthStateChanged(auth, (u) => {
        const was = user;
        user = u;
        if (u) {
          try { localStorage.setItem('singhoah:authseen', '1'); } catch { /* ignore */ }
        }
        if (!u) {
          stopPoll();
          try { sessionStorage.removeItem('singhoah:cloudrestored'); } catch { /* ignore */ }
        }
        if (u && !was) {
          render();
          cloudSyncStart(u).then((handled) => {
            if (!handled) localFallback(u);
          }).catch(() => { localFallback(u); });
          return;
        }
        render();
      });
      addEventListener('beforeunload', () => {
        if (user) {
          try { localStorage.setItem(profileKey(user.uid), JSON.stringify(readPrefs())); } catch { /* ignore */ }
          if (pollRef && pollF) {
            const o = collect();
            if (sig(o) !== lastSent) pollF.setDoc(pollRef, o, { merge: true }).catch(() => { /* ignore */ });
          }
        }
      });
    }).catch(() => { /* offline / blocked CDN: button stays, no session */ });
  }

  render();                                   /* Sign-in button, zero network */
  let seen = false;
  try { seen = localStorage.getItem('singhoah:authseen') === '1'; } catch { /* ignore */ }
  if (seen) attach();                         /* restore a previous session */
})();
