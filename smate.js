/* SMate — the Singho assistant: a fully AI, assistive companion that drives
   every Singho app the way a person would — clicking buttons, typing into
   fields, picking options, navigating pages — through a set of tools. The
   on-device model is the only brain: it sees the live page context and
   decides what to do. It loads the moment the site opens. */
(() => {
  const LIB = globalThis.__SING_LIB;
  if (!LIB || document.getElementById('smateBtn')) return;
  const { LANGS, STRINGS, t, langOf, allTimeZones, cityOf, CURRENCIES } = LIB;
  const $ = (id) => document.getElementById(id);
  const page = document.body.dataset.app || 'clock';

  let curLang = 'en';
  try { curLang = localStorage.getItem('singhoah:lang') || 'en'; } catch { /* ignore */ }
  if (!LANGS.some((l) => l.id === curLang)) curLang = 'en';

  /* ---------------- chrome ---------------- */
  /* the launcher sits in the topbar, right next to the account chip;
     the panel anchors below it like every other dropdown */
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn smate-btn';
  btn.id = 'smateBtn';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
    <span>SMate</span>`;
  const pop = document.createElement('div');
  pop.className = 'smate-pop';
  pop.id = 'smatePop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'SMate');
  pop.innerHTML = `
      <div class="smate-head">
        <div class="smate-id"><strong>SMate</strong><span class="smate-status" id="smateStatus"></span></div>
        <button type="button" class="btn smate-ai" id="smateAI" aria-pressed="false">AI</button>
        <button type="button" class="btn smate-ai smate-speak" id="smateSpeak" aria-pressed="false">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M16.5 9a4.2 4.2 0 0 1 0 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>
        <button type="button" class="btn smate-ai smate-clear" id="smateClear">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="btn smate-x" id="smateX" aria-label="×">×</button></div>
      <div class="smate-msgs" id="smateMsgs"></div>
      <form class="smate-inrow" id="smateForm">
        <input id="smateIn" type="text" autocomplete="off" aria-label="SMate">
        <button type="button" class="btn smate-mic" id="smateMic" aria-pressed="false">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M6 12a6 6 0 0 0 12 0M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <button type="submit" class="btn smate-send" id="smateSend" aria-label="➤">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11.5 21 3l-8.5 18-2.4-7.1L3 11.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        </button>
      </form>`;
  const anchor = $('authWrap');
  (anchor ? anchor.parentElement : document.body).insertBefore(btn, anchor || null);
  document.body.appendChild(pop);
  const msgs = $('smateMsgs'), input = $('smateIn');

  function place() {
    const r = btn.getBoundingClientRect();
    pop.style.height = 'auto';
    if (innerWidth <= 560) {
      /* bottom sheet on phones: full width, thumb-reachable input */
      pop.style.width = `${innerWidth - 16}px`;
      pop.style.left = '8px';
      pop.style.top = 'auto';
      pop.style.bottom = '8px';
      pop.style.maxHeight = `${Math.min(520, innerHeight - 16)}px`;
    } else {
      const w = Math.min(360, innerWidth - 16);
      const top = Math.min(r.bottom + 6, innerHeight - 96);
      pop.style.width = `${w}px`;
      pop.style.top = `${top}px`;
      pop.style.bottom = 'auto';
      pop.style.maxHeight = `${Math.min(480, innerHeight - top - 10)}px`;
      pop.style.left = `${Math.min(Math.max(8, r.right - w), innerWidth - w - 8)}px`;
    }
  }
  addEventListener('resize', place);
  addEventListener('scroll', place, true);

  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  const setStatus = (key) => { const s = $('smateStatus'); if (s) s.textContent = t(curLang, key); };
  const setStatusText = (txt) => { const s = $('smateStatus'); if (s) s.textContent = txt; };
  function chrome() {
    btn.title = t(curLang, 'smateTip');
    btn.setAttribute('aria-label', t(curLang, 'smateTip'));
    $('smateSend').title = t(curLang, 'smateSend');
    $('smateSend').setAttribute('aria-label', t(curLang, 'smateSend'));
    $('smateX').title = t(curLang, 'clear');
    input.placeholder = t(curLang, 'smatePh');
    input.setAttribute('aria-label', t(curLang, 'smateTip'));
    const mic = $('smateMic');
    mic.title = t(curLang, 'smateVoice');
    mic.setAttribute('aria-label', t(curLang, 'smateVoice'));
    if (!SR) mic.style.display = 'none';
    const sp = $('smateSpeak');
    sp.title = t(curLang, 'voiceTip');
    sp.setAttribute('aria-label', t(curLang, 'voiceTip'));
    if (!('speechSynthesis' in window)) sp.style.display = 'none';
    const cl = $('smateClear');
    cl.title = t(curLang, 'clearChat');
    cl.setAttribute('aria-label', t(curLang, 'clearChat'));
    const ai = $('smateAI');
    ai.title = t(curLang, 'aiTip');
    ai.setAttribute('aria-label', t(curLang, 'aiTip'));
    if (!mic.getAttribute('aria-pressed') || mic.getAttribute('aria-pressed') === 'false') setStatus('smateOnline');
  }
  chrome();
  document.addEventListener('singhoah:lang', () => {
    try { curLang = localStorage.getItem('singhoah:lang') || curLang; } catch { /* ignore */ }
    chrome();
  });

  /* -------- assistant memory + voice output -------- */
  let LOG = [];
  try { LOG = JSON.parse(localStorage.getItem('singhoah:smateLog') || '[]'); } catch { LOG = []; }
  if (!Array.isArray(LOG)) LOG = [];
  const saveLog = () => { try { localStorage.setItem('singhoah:smateLog', JSON.stringify(LOG.slice(-60))); } catch { /* ignore */ } };
  let voicePref = 'off';
  try { voicePref = localStorage.getItem('singhoah:smateSpeak') || 'off'; } catch { /* ignore */ }
  const speakOut = (text) => {
    if (!('speechSynthesis' in window) || voicePref !== 'on') return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = langOf(curLang).locale;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  };
  const reminders = [];
  let flashT = null;
  const flashTitle = () => {
    const old = document.title;
    document.title = `⏰ ${old}`;
    clearTimeout(flashT);
    flashT = setTimeout(() => { document.title = old; }, 5000);
  };
  setInterval(() => {
    const now = Date.now();
    for (let i = reminders.length - 1; i >= 0; i -= 1) {
      if (reminders[i].at <= now) {
        reminders.splice(i, 1);
        say(`⏰ ${t(curLang, 'remindNow')}`);
        flashTitle();
      }
    }
  }, 1000);

  function say(text, me = false) {
    const p = document.createElement('p');
    p.className = me ? 'smate-me' : 'smate-it';
    p.textContent = text;
    msgs.appendChild(p);
    msgs.scrollTop = msgs.scrollHeight;
    LOG.push({ me, text });
    saveLog();
    if (!me) speakOut(text);
  }
  /* a safe little calculator: digits and + - * / % ( ) only */
  const safeMath = (src) => {
    let i = 0;
    const peek = () => src[i];
    const expr = () => {
      let v = term();
      while (peek() === '+' || peek() === '-') { const o = src[i++]; const r = term(); v = o === '+' ? v + r : v - r; }
      return v;
    };
    const term = () => {
      let v = fact();
      while (peek() === '*' || peek() === '/' || peek() === '%') { const o = src[i++]; const r = fact(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; }
      return v;
    };
    const fact = () => {
      while (peek() === ' ') i += 1;
      let neg = false;
      if (peek() === '-') { neg = true; i += 1; }
      let v;
      if (peek() === '(') { i += 1; v = expr(); if (peek() === ')') i += 1; else return NaN; }
      else {
        const m = src.slice(i).match(/^\d+(?:\.\d+)?/);
        if (!m) return NaN;
        v = parseFloat(m[0]); i += m[0].length;
      }
      while (peek() === ' ') i += 1;
      return neg ? -v : v;
    };
    const v = expr();
    return i === src.length && Number.isFinite(v) ? v : null;
  };


  /* ---------------- Action Blocks: a live mini-UI for every action ----------
     A "do something" request answers with a small live card in the chat that
     mirrors REAL app state — timers count down, clocks tick, fares draw a
     mini route map. The same action always happens in the main window too
     (navigating, or pending-* handoffs across pages). Questions stay plain
     text; only requests get blocks. */
  let ABQ = [];
  const AB_LIVE = [];
  const abPush = (spec) => ABQ.push(spec);
  const abDrain = () => { const q = ABQ; ABQ = []; return q; };
  function abNode(spec) {
    const el = document.createElement('div');
    el.className = 'smate-block'; el.dataset.ab = spec.k; el.dataset.spec = JSON.stringify(spec);
    const head = document.createElement('p'); head.className = 'ab-head';
    const dot = document.createElement('i'); dot.className = 'ab-dot';
    const ti = document.createElement('strong'); ti.textContent = spec.t || '';
    head.append(dot, ti);
    const body = document.createElement('div'); body.className = 'ab-body';
    el.append(head, body);
    abFill(el);
    AB_LIVE.push(el);
    abObserve(el);
    return el;
  }
  /* ---- true-mini stages: the REAL component, built by the clock app's own
     builders and scaled down — a timer block IS a timer cell, a window block
     IS the clock grid, a fare block IS the metro page ---- */
  function abFit(el) {
    const m = el.__mini;
    if (!m) return;
    const avail = (el.clientWidth || 0) - 2;
    if (avail < 40) return; /* popup hidden — next tick retries */
    if (el.__grid) {
      const rows = (getComputedStyle(el.__grid).gridTemplateRows || '').trim().split(/\s+/).length || 1;
      const want = rows * 300;
      if ((m.h || 0) !== want) { m.h = want; m.stage.style.height = `${want}px`; }
    }
    const s = Math.min(1, avail / m.w);
    m.stage.style.transform = `scale(${s})`;
    const h = m.stage.offsetHeight;
    if (h) m.wrap.style.height = Math.round(h * s) + 'px';
    (el.__cells || []).forEach((c) => { try { LIB.fitCell(c.cell); } catch { /* cell gone */ } });
  }
  let abCellIdx = 0;
  const abCell = () => LIB.buildCell(1000 + (abCellIdx++)); /* high index: never a real window cell */
  function abZoneStage(zones, modeCls) {
    const n = zones.length;
    const cells = [];
    let grid = null;
    const rootCls = document.documentElement.classList;
    const chrome = (rootCls.contains('multi') ? 'multi ' : '') + (rootCls.contains('zen') ? 'zen ' : '');
    const st = document.createElement('div');
    st.className = 'ab-stage ' + chrome + (modeCls ? ' ' + modeCls : '');
    if (n === 1) {
      st.style.cssText += 'width:420px;height:300px;';
      const c = abCell();
      st.appendChild(c.el);
      cells.push({ cell: c, z: zones[0] });
    } else {
      st.style.cssText += `width:640px;height:${n <= 2 ? 300 : 560}px;`;
      grid = document.createElement('div');
      grid.className = 'grid';
      grid.dataset.layout = n === 2 ? '2' : (n <= 4 ? '2x2' : '4x4');
      zones.slice(0, n <= 2 ? 2 : (n <= 4 ? 4 : 16)).forEach((z) => {
        const c = abCell();
        grid.appendChild(c.el);
        cells.push({ cell: c, z });
      });
      st.appendChild(grid);
    }
    return { st, cells, grid: n > 1 ? grid : null };
  }
  function abMount(el, stage, w) {
    const wrap = document.createElement('div');
    wrap.className = 'ab-mini';
    wrap.appendChild(stage);
    el.querySelector('.ab-body').appendChild(wrap);
    el.__mini = { wrap, stage, w };
  }
  function abFill(el) {
    const spec = JSON.parse(el.dataset.spec);
    const body = el.querySelector('.ab-body');
    body.textContent = '';
    el.__mini = null; el.__cells = null; el.__svgClone = null;

    if (spec.k === 'timer' || spec.k === 'stop' || spec.k === 'remind') {
      const { st, cells } = abZoneStage(['(mini)']);
      cells.forEach((c) => c.cell.el.classList.add(spec.k === 'stop' ? 'stop' : 'timer'));
      el.__cells = cells.map((c) => ({ cell: c.cell, z: null }));
      abMount(el, st, 420);
      if (spec.k === 'remind' && spec.note) {
        const p = document.createElement('p'); p.className = 'ab-sub'; p.textContent = spec.note; body.appendChild(p);
      }
    } else if (spec.k === 'clocks') {
      const zones = (spec.z || []).filter(Boolean);
      if (zones.length) {
        const { st, cells, grid } = abZoneStage(zones);
        el.__grid = grid;
        el.__cells = cells;
        abMount(el, st, zones.length === 1 ? 420 : 640);
        if (zones.length > 4) {
          const m = document.createElement('p'); m.className = 'ab-sub'; m.textContent = `+${zones.length - 4}`; body.appendChild(m);
        }
      }
    } else if (spec.k === 'mode') {
      let z = 'Asia/Taipei';
      try { z = localStorage.getItem('singhoah:tz') || z; } catch { /* private mode */ }
      const { st, cells } = abZoneStage([z], spec.an ? 'ab-analog' : 'ab-digital');
      el.__cells = cells;
      abMount(el, st, 420);
    } else if (spec.k === 'wallet') {
      /* real Wallet ledger markup — same classes, same fmtMoney/walDateLabel math */
      const locale = langOf(curLang).locale;
      let wal = {};
      try { wal = JSON.parse(localStorage.getItem('singhoah:wallet') || '{}'); } catch { /* no ledger yet */ }
      const cur = wal.cur || 'USD';
      const money = (v, plus) => {
        const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Math.abs(v));
        return `${v > 0 && plus ? '+' : v < 0 ? '\u2212' : ''}${LIB.curSymbol(cur, locale)}${n}`;
      };
      const amtV = Math.abs(spec.amt || 0) * (spec.inn ? 1 : -1);
      const amtTxt = money(amtV, true);
      const day = document.createElement('div'); day.className = 'wal-day';
      const dh = document.createElement('div'); dh.className = 'wal-day-h';
      const d1 = document.createElement('span');
      try { d1.textContent = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()); } catch { d1.textContent = new Date().toLocaleDateString(locale); }
      const d2 = document.createElement('span');
      d2.textContent = spec.inn ? amtTxt : `${t(curLang, 'walSpent')} ${money(Math.abs(amtV), false)}`;
      dh.append(d1, d2);
      const item = document.createElement('div'); item.className = 'wal-item';
      const note = document.createElement('span'); note.className = 'wal-note';
      note.textContent = spec.note || t(curLang, spec.inn ? 'walIncome' : 'walExpense');
      const amt = document.createElement('span'); amt.className = `wal-amt ${spec.inn ? 'in' : 'out'}`; amt.textContent = amtTxt;
      item.append(note, amt);
      day.append(dh, item);
      const total = (wal.tx || []).reduce((a, x) => a + (x.type === 'in' ? x.amt : -x.amt), 0);
      const day2 = document.createElement('div'); day2.className = 'wal-day';
      const dh2 = document.createElement('div'); dh2.className = 'wal-day-h';
      const b1 = document.createElement('span'); b1.textContent = t(curLang, 'walBalance');
      const b2 = document.createElement('span'); b2.className = 'wal-amt'; b2.textContent = money(total, false);
      dh2.append(b1, b2);
      day2.appendChild(dh2);
      body.append(day, day2);
    } else if (spec.k === 'cash') {
      /* the wallet's Cash tab itself, embedded in mini mode — real notes and
         coins popping out of the wallet, straight from the live ledger */
      const f = document.createElement('iframe');
      f.className = 'ab-frame ab-stage';
      f.tabIndex = -1;
      f.setAttribute('loading', 'lazy');
      f.src = 'wallet.html?mini=1#tab=cash';
      f.style.width = '420px';
      f.style.height = '480px';
      abMount(el, f, 420);
      if (spec.row) { const row = document.createElement('p'); row.className = 'ab-sub'; row.textContent = spec.row; body.appendChild(row); }
    } else if (spec.k === 'fare') {
      /* the metro page itself, embedded in mini mode — real map, real fare bar */
      const f = document.createElement('iframe');
      f.className = 'ab-frame ab-stage';
      f.tabIndex = -1;
      f.setAttribute('loading', 'lazy');
      f.src = `metro.html?mini=1#a=${encodeURIComponent(spec.a || '')}&b=${encodeURIComponent(spec.b || '')}`;
      /* same viewport shape as opening SinghoMetro: on the metro page read
         the live map rect; elsewhere estimate the chrome the real page has */
      let ar = 0.5;
      const mw = document.querySelector('.metro-mapwrap');
      if (mw) {
        const r = mw.getBoundingClientRect();
        if (r.width > 80 && r.height > 80) ar = r.height / r.width;
      } else {
        ar = Math.max(0.45, Math.min(1.35, (window.innerHeight - 170) / Math.max(320, window.innerWidth)));
      }
      f.style.width = '640px';
      f.style.height = `${Math.round(640 * ar)}px`;
      abMount(el, f, 640);
      if (spec.row) { const row = document.createElement('p'); row.className = 'ab-sub'; row.textContent = spec.row; body.appendChild(row); }
    } else if (spec.k === 'mapnav') {
      const mw = document.getElementById('mapWrap');
      const ms = document.getElementById('mapSvg');
      if (mw && !mw.hidden && ms) {
        /* the live world map, cloned — viewBox kept in sync every tick */
        const clone = ms.cloneNode(true);
        clone.style.cssText = 'width:640px;height:400px;display:block;pointer-events:none;';
        const st = document.createElement('div');
        st.className = 'ab-stage';
        st.style.cssText += 'width:640px;height:400px;';
        st.appendChild(clone);
        abMount(el, st, 640);
        el.__svgClone = clone;
      } else {
        const row = document.createElement('p'); row.className = 'ab-city';
        const img = document.createElement('img'); img.alt = ''; img.width = 20; img.height = 15;
        row.append(img, document.createElement('b'), document.createElement('span'));
        body.appendChild(row);
      }
    } else {
      const sub = document.createElement('p'); sub.className = 'ab-sub'; sub.textContent = spec.b || ''; body.appendChild(sub);
    }
    abTick1(el, LIB.coreNow(), LIB.coreNow().getTime());
    abFit(el);
  }
  function abTick1(el, now, ts) {
    const spec = JSON.parse(el.dataset.spec);
    const dot = el.querySelector('.ab-dot');
    const cells = el.__cells || [];

    if (spec.k === 'timer' || spec.k === 'remind') {
      const e = spec.k === 'timer' ? spec.e : spec.at;
      let tm = null;
      if (spec.k === 'timer') {
        const v = LIB.timersView().find((x) => Math.abs(x.e - e) < 2000);
        if (v) tm = { duration: v.d, endsAt: v.e, remaining: v.on ? v.e - ts : v.r, running: v.on };
      }
      if (!tm) {
        const left = Math.max(0, e - ts);
        tm = { duration: spec.d || left || 1000, endsAt: e, remaining: left, running: left > 0 };
      }
      cells.forEach((c) => { try { LIB.updTimerCell(c.cell, tm, now); } catch { /* cell gone */ } });
      el.classList.toggle('ab-done', e - ts <= 0);
      if (dot) dot.classList.toggle('live', e - ts > 0);
      return;
    }
    if (spec.k === 'stop') {
      const v = LIB.stopsView().find((x) => spec.s == null || Math.abs(x.s - spec.s) < 2000);
      const st = v ? { startedAt: v.s, accum: v.a, running: v.on } : { startedAt: spec.s || ts, accum: 0, running: true };
      cells.forEach((c) => { try { LIB.updStopCell(c.cell, st, now); } catch { /* cell gone */ } });
      if (dot) dot.classList.toggle('live', !!v && v.on);
      return;
    }
    if (spec.k === 'clocks' || spec.k === 'mode') {
      const locale = langOf(curLang).locale;
      cells.forEach((c) => { try { LIB.updZoneCell(c.cell, c.z, now, locale); } catch { /* zone gone */ } });
      if (dot) dot.classList.add('live');
      return;
    }
    if (spec.k === 'mapnav') {
      if (el.__svgClone) {
        const ms = document.getElementById('mapSvg');
        if (ms) el.__svgClone.setAttribute('viewBox', ms.getAttribute('viewBox') || '');
      } else {
        const img = el.querySelector('img'); const b = el.querySelector('b'); const sp = el.querySelector('span');
        if (spec.z) {
          try { if (img) img.src = LIB.flagSrc(LIB.zoneCountry(spec.z)); } catch { /* ignore */ }
          if (b) b.textContent = cityOf(spec.z);
          if (sp) {
            try { sp.textContent = new Intl.DateTimeFormat(langOf(curLang).locale, { hour: '2-digit', minute: '2-digit', timeZone: spec.z }).format(now); } catch { /* bad zone */ }
          }
        } else if (b) b.textContent = spec.c || '';
      }
      if (dot) dot.classList.add('live');
    }
  }
  /* Same cadence as the main window: ClockCore ticks on requestAnimationFrame,
     so the minis do too — ms digits and dial hands move in lockstep with the
     real cells. Phones only pay for blocks actually on screen (IO gate), and
     nothing ticks while the tab or the popup is hidden. */
  let AB_STARTED = false;
  let AB_FRAME = 0;
  const AB_SEEN = new Set();
  let AB_IO = null;
  function abObserve(el) {
    if (!AB_IO) {
      AB_IO = new IntersectionObserver((ents) => {
        for (const e of ents) { if (e.isIntersecting) AB_SEEN.add(e.target); else AB_SEEN.delete(e.target); }
      }, { root: msgs, threshold: 0 });
    }
    AB_IO.observe(el);
    AB_SEEN.add(el);
  }
  function abDrive(now) {
    if (document.hidden || pop.hidden) return;
    const ts = now.getTime();
    AB_FRAME++;
    const house = AB_FRAME % 30 === 0; /* ~2 Hz: fit/measure work stays cheap */
    for (let i = AB_LIVE.length - 1; i >= 0; i--) {
      const el = AB_LIVE[i];
      if (!el.isConnected) { AB_LIVE.splice(i, 1); if (AB_IO) AB_IO.unobserve(el); AB_SEEN.delete(el); continue; }
      if (!AB_SEEN.has(el)) continue;
      try {
        abTick1(el, now, ts);
        if (house) abFit(el);
      } catch { /* block mid-teardown */ }
    }
  }
  function abStart() {
    if (AB_STARTED) return;
    AB_STARTED = true;
    if (LIB.onFrame && window.__clock) {
      /* clock page: ride the app's own render frame — same date as the main
         cells, so mini digits are byte-identical to the window's */
      LIB.onFrame((date) => abDrive(date));
    } else {
      /* other pages: own rAF loop at the same cadence */
      const loop = () => { requestAnimationFrame(loop); abDrive(LIB.coreNow()); };
      requestAnimationFrame(loop);
    }
    window.addEventListener('resize', () => {
      AB_LIVE.forEach((el) => { try { abFit(el); } catch { /* block removed */ } });
    });
  }
  function sayBlock(spec) { const el = abNode(spec); msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight; LOG.push({ block: spec }); saveLog(); abStart(); }

  function toggle(open) {
    if (open) place();
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (!open && 'speechSynthesis' in window) speechSynthesis.cancel();
    if (open) {
      if (!msgs.children.length) say(t(curLang, 'smateHi'));
      if (!msgs.querySelector('.smate-chip')) addChips();
      input.focus();
    }
  }
  const CHIPS = () => [`${t(curLang, 'timer')} 5`, t(curLang, 'night'), `${t(curLang, 'tzTitle')} Taipei`];
  function addChips() {
    const wrap = document.createElement('div');
    wrap.className = 'smate-chips';
    for (const c of CHIPS()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn smate-chip';
      b.textContent = c;
      b.addEventListener('click', () => { wrap.remove(); handle(c); });
      wrap.appendChild(b);
    }
    msgs.appendChild(wrap);
  }
  function clearChatNow() {
    msgs.textContent = '';
    LOG.length = 0;
    saveLog();
    say(t(curLang, 'smateHi'));
    addChips();
  }
  btn.addEventListener('click', () => toggle(pop.hidden));
  $('smateX').addEventListener('click', () => toggle(false));
  /* conversation continues across pages and reloads */
  for (const m of LOG) {
    if (m.block) { msgs.appendChild(abNode(m.block)); abStart(); continue; }
    const p = document.createElement('p');
    p.className = m.me ? 'smate-me' : 'smate-it';
    p.textContent = m.text;
    msgs.appendChild(p);
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); toggle(pop.hidden); }
    else if (e.key === 'Escape' && !pop.hidden) toggle(false);
  });
  $('smateSpeak').addEventListener('click', () => {
    voicePref = voicePref === 'on' ? 'off' : 'on';
    try { localStorage.setItem('singhoah:smateSpeak', voicePref); } catch { /* ignore */ }
    $('smateSpeak').setAttribute('aria-pressed', String(voicePref === 'on'));
    if (voicePref !== 'on' && 'speechSynthesis' in window) speechSynthesis.cancel();
  });
  $('smateSpeak').setAttribute('aria-pressed', String(voicePref === 'on'));
  $('smateClear').addEventListener('click', clearChatNow);

  /* ---------------- the interpreter ---------------- */

  /* every word the app itself shows, grouped per intent, across all langs */
  const LANG_NAMES = {
    en: ['english', 'inglés', 'anglais'], 'zh-Hant': ['chinese', 'traditionnel', '繁體', '繁中', '中文', 'chino', 'chinois'],
    hi: ['hindi', 'hindí', 'hin', 'हिन्दी'], es: ['spanish', 'espagnol', 'español'],
    fr: ['french', 'francés', 'français'], ar: ['arabic', 'arabe', 'árabe', 'العربية'],
    bn: ['bengali', 'bangla', 'bengalí', 'বাংলা'], ru: ['russian', 'ruso', 'russe', 'русский'],
    pt: ['portuguese', 'portugués', 'portugais', 'português'], ur: ['urdu', 'ourdou', 'اردو'],
  };
  const DIGITS = [
    [/[\u0660-\u0669]/g, (c) => c.charCodeAt(0) - 0x0660],
    [/[\u06F0-\u06F9]/g, (c) => c.charCodeAt(0) - 0x06F0],
    [/[\u0966-\u096F]/g, (c) => c.charCodeAt(0) - 0x0966],
    [/[\u09E6-\u09EF]/g, (c) => c.charCodeAt(0) - 0x09E6],
    [/[\uFF10-\uFF19]/g, (c) => c.charCodeAt(0) - 0xFF10],
  ];
  const latinDigits = (s) => {
    for (const [re, fn] of DIGITS) s = s.replace(re, (c) => String(fn(c)));
    return s;
  };
  /* latin keywords match on word boundaries — "karta" (map in several
     languages) must never fire inside "Jakarta"; scripts without word
     spaces (CJK etc.) keep substring matching, where partial matches are
     how those languages work */
  const num = (text) => {
    const m = latinDigits(text).match(/(\d+(?:[.,]\d+)?)/);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  };
  const click = (el) => { if (el) { el.click(); return true; } return false; };
  const zoneList = () => { try { return allTimeZones(); } catch { return []; } };
  const findZone = (text) => {
    const t2 = text.toLowerCase();
    for (const z of zoneList()) {
      const c = cityOf(z).toLowerCase();
      if (c && c.length > 2 && t2.includes(c)) return z;
    }
    for (const z of zoneList()) if (t2.includes(z.toLowerCase())) return z;
    return null;
  };
  const findLang = (text) => {
    const t2 = text.toLowerCase();
    for (const L of LANGS) {
      if (t2.includes(L.id.toLowerCase()) && L.id !== 'en') return L.id;
      if ((LANG_NAMES[L.id] || []).some((n) => t2.includes(n.toLowerCase()))) return L.id;
      if (t2.includes(L.name.toLowerCase())) return L.id;
    }
    if (/\benglish\b|\ben\b/.test(t2)) return 'en';
    return null;
  };
  const findCurrency = (text) => {
    /* CURRENCIES rows are [code, countryCc] pairs (app.js) — never assume
       object shape, and never throw on plain words like "cash" */
    const codeOf = (c) => (c && (c.code || c[0])) || '';
    const t2 = text.toLowerCase();
    const m = t2.match(/\b([a-z]{3})\b/);
    if (m && CURRENCIES.some((c) => codeOf(c) === m[1].toUpperCase())) return m[1].toUpperCase();
    for (const c of CURRENCIES) {
      const code = codeOf(c).toLowerCase();
      if (code && (t2.includes(code) || t2.includes(` ${code}`))) return codeOf(c);
    }
    return null;
  };

  /* -------- action drivers (DOM-level, page by page) -------- */
  const setTz = (z) => {
    if (!z) return false;
    if (page === 'settings') {
      const s = $('citySearch');
      if (s) {
        s.value = cityOf(z);
        s.dispatchEvent(new Event('input', { bubbles: true }));
        const row = document.querySelector('#cityList .tz-row:not([hidden])');
        if (row) { row.click(); return true; }
      }
      return false;
    }
    const s = $('tzSearch');
    if (!s) return false;
    $('tzPop').hidden = false;
    s.value = cityOf(z);
    s.dispatchEvent(new Event('input', { bubbles: true }));
    const row = document.querySelector('#tzPop .tz-list .tz-row:not([hidden])');
    if (row) { row.click(); $('tzPop').hidden = true; return true; }
    return false;
  };
  const setLang = (id) => {
    const row = document.querySelector(`#langList .tz-row[data-lang="${id}"]`);
    return click(row);
  };
  /* timer/stopwatch panes are grid cells tagged .timer / .stop; their cap
     click toggles running, .cap-reset resets */
  const toggleCell = (cell, wantRun) => {
    const isRun = cell.dataset.smateRun !== '0';
    if (isRun !== wantRun) { cell.querySelector('.cell-cap').click(); cell.dataset.smateRun = wantRun ? '1' : '0'; }
  };
  const act = {
    timerSet(n) {
      const mi = $('timerMin'); if (!mi) return null;
      mi.value = String(n);
      $('timerStart').click();
      const c = document.querySelector('.cell.timer');
      if (c) c.dataset.smateRun = '1';
      return `${t(curLang, 'timer')}: ${n} ${t(curLang, 'minutes')}`;
    },
    timerCtl(w) {
      const cells = [...document.querySelectorAll('.cell.timer')];
      if (w === 'pause' || w === 'reset') {
        if (!cells.length) return null;
        cells.forEach((c) => toggleCell(c, false));
        return t(curLang, 'done');
      }
      if (w === 'start' || w === 'resume') {
        if (!cells.length) { click($('timerStart')); const c = document.querySelector('.cell.timer'); if (c) c.dataset.smateRun = '1'; }
        else cells.forEach((c) => toggleCell(c, true));
        return t(curLang, 'done');
      }
      return null;
    },
    stopwatch(w) {
      if (w === 'reset') {
        const r = document.querySelector('.cell.stop .cap-reset');
        if (r) { r.click(); return t(curLang, 'done'); }
        return null;
      }
      if (w === 'pause' || w === 'start' || w === 'resume') {
        let cell = document.querySelector('.cell.stop');
        if (!cell) { click($('btnStop')); cell = document.querySelector('.cell.stop'); if (cell) cell.dataset.smateRun = '1'; }
        if (!cell) return null;
        toggleCell(cell, w === 'start' || w === 'resume');
        return t(curLang, 'done');
      }
      if (!document.querySelector('.cell.stop')) { click($('btnStop')); const c = document.querySelector('.cell.stop'); if (c) c.dataset.smateRun = '1'; }
      return t(curLang, 'done');
    },
    nav(where) {
      const map = { wallet: 'wallet.html', clock: 'index.html', settings: 'settings.html', scribe: 'scribe.html', launch: 'launch.html', metro: 'metro.html', module: 'module.html' };
      const target = map[where];
      if (!target) return null;
      if (target === `${page}.html` || (page === 'clock' && where === 'clock')) return t(curLang, 'done');
      setTimeout(() => { location.href = target; }, 350);
      return `→ ${where === 'wallet' ? t(curLang, 'wallet') : where === 'settings' ? t(curLang, 'settings') : where === 'scribe' ? t(curLang, 'lpScribe') : where === 'launch' ? t(curLang, 'launchpad') : where === 'metro' ? t(curLang, 'lpMetro') : where === 'module' ? t(curLang, 'lpModule') : t(curLang, 'lpClock')}`;
    },
    walletAdd(type, amt, note) {
      if (amt == null || isNaN(amt)) return null;
      if (page !== 'wallet') { act.nav('wallet'); return t(curLang, 'wallet'); }
      click(type === 'in' ? $('walTypeIn') : $('walTypeOut'));
      $('walAmt').value = String(amt);
      if ($('walNote')) $('walNote').value = String(note || '').slice(0, 40);
      $('walAddBtn').click();
      return `${t(curLang, 'done')} · ${$('walBal').textContent}`;
    },
  };

  /* localized city names so zones can be spoken in any of the fifteen languages */
  const CITY_ALIASES = {
    'Asia/Taipei': ['台北', 'ताइपे', 'taipéi', 'تايبيه', 'তাইপেই', 'тайбэй', 'taipé', 'تائپے'],
    'Asia/Jakarta': ['雅加達', 'जकार्ता', 'yakarta', 'جاكرتا', 'জাকার্তা', 'джакарта', 'jacarta', 'جکارتہ'],
    'Asia/Singapore': ['新加坡', 'सिंगापुर', 'singapur', 'سنغافورة', 'সিঙ্গাপুর', 'сингапур', 'singapura', 'سنگاپور'],
    'Asia/Tokyo': ['東京', 'टोक्यो', 'tokio', 'طوكيو', 'টোকিও', 'токио', 'tóquio', 'ٹوکیو'],
    'Europe/London': ['倫敦', '伦敦', 'लंदन', 'londres', 'لندن', 'লন্ডন', 'лондон'],
    'America/New_York': ['紐約', '纽约', 'न्यू यॉर्क', 'nueva york', 'نيويورك', 'নিউ ইয়র্ক', 'нью-йорк', 'nova york', 'نیو یارک'],
    'Europe/Paris': ['巴黎', 'पेरिस', 'parís', 'باريس', 'প্যারিস', 'париж', 'پیرس'],
    'Asia/Bangkok': ['曼谷', 'बैंकॉक', 'بانكوك', 'ব্যাংকক', 'бангкок', 'bangcoc', 'بینکاک'],
    'Asia/Seoul': ['首爾', '首尔', 'सियोल', 'seúl', 'séoul', 'سيول', 'সিউল', 'сеул', 'seul', 'سیؤل'],
    'Asia/Shanghai': ['上海', 'शंघाई', 'shanghái', 'شنغهاي', 'সাংহাই', 'шанхай', 'xangai', 'شنگھائی'],
    'Asia/Hong_Kong': ['香港', 'हांग कांग', 'هونغ كونغ', 'হংকং', 'гонконг', 'ہانگ کانگ'],
    'Asia/Kuala_Lumpur': ['吉隆坡', 'कुआलालंपुर', 'كوالالمبور', 'কুয়ালালামপুর', 'куала-лумпур', 'کوالالمپور'],
    'Asia/Kolkata': ['德里', 'दिल्ली', 'delhi', 'دلهي', 'দিল্লি', 'дели', 'deli', 'دہلی'],
    'Asia/Dubai': ['杜拜', 'दुबई', 'dubái', 'dubaï', 'دبي', 'দুবাই', 'дубай', 'دبئی'],
    'Australia/Sydney': ['雪梨', 'सिडनी', 'sídney', 'سيدني', 'সিডনি', 'сидней', 'سڈنی'],
    'America/Los_Angeles': ['洛杉磯', '洛杉矶', 'लॉस एंजिल्स', 'los ángeles', 'لوس أنجلوس', 'লস অ্যাঞ্জেলেস', 'лос-анджелес', 'لاس اینجلس'],
  };
  const findAllZones = (t2) => {
    const found = [];
    const push = (idx, z) => { if (!found.some((f) => f.z === z)) found.push({ idx, z }); };
    for (const [z, names] of Object.entries(CITY_ALIASES)) {
      for (const n of names) { const i = t2.indexOf(n); if (i >= 0) { push(i, z); break; } }
    }
    for (const z of zoneList()) {
      const c = cityOf(z).toLowerCase();
      if (c && c.length > 2) { const i = t2.indexOf(c); if (i >= 0) push(i, z); }
    }
    found.sort((a, b) => a.idx - b.idx);
    return found.map((f) => f.z);
  };
  /* fare questions work on EVERY page: the engine is a small static
     module (stations + graph + published fare tables), imported on
     demand the first time a fare question arrives off the metro page */
  let FAREMOD = null;
  const fareMod = () => FAREMOD || (FAREMOD = import('./metrofare.js').catch(() => null));
  const findStationAny = (F, tl) => {
    const list = Object.values(F.ST).map((st) => ({ id: st.id, sys: st.sys, en: st.en.toLowerCase(), zh: st.zh || '', len: Math.max(st.en.length, (st.zh || '').length) }));
    list.sort((a, b) => b.len - a.len);
    const hits = [];
    for (const st of list) {
      const iE = st.en && tl.includes(st.en) ? tl.indexOf(st.en) : 1e9;
      const iZ = st.zh && tl.includes(st.zh) ? tl.indexOf(st.zh) : 1e9;
      const i = Math.min(iE, iZ);
      if (i >= 1e9) continue;
      const len = i === iE ? st.en.length : st.zh.length;
      if (hits.some((h) => i < h.i + h.len && h.i < i + len)) continue; /* longest name wins */
      hits.push({ i, len, id: st.id, sys: st.sys });
    }
    hits.sort((a, b) => a.i - b.i);
    return hits;
  };
  async function fareAnywhere(rawText) {
    const F = await fareMod();
    if (!F) return null;
    const hits = findStationAny(F, rawText.toLowerCase());
    if (hits.length < 2) return null;
    const [a, b] = hits;
    const nm = (id) => `${F.ST[id].en} ${F.ST[id].zh}`;
    if (a.sys !== b.sys) {
      return { text: `${t(curLang, 'mFare')}: ${nm(a.id)} → ${nm(b.id)} · ${t(curLang, 'fareXsys')}`, spec: { k: 'fare', sys: a.sys, a: a.id, b: b.id, path: [], row: t(curLang, 'fareXsys'), t: t(curLang, 'mFare') } };
    }
    const r = F.route(a.id, b.id);
    if (!r) return null;
    const f = F.fare(a.sys, a.id, b.id, r);
    if (f == null) return null;
    const row = `NT$${f} · ${r.stops + 1} ${t(curLang, 'mStations')} · ${r.transfers} ${t(curLang, 'mTransfers')}`;
    return { text: `${t(curLang, 'mFare')}: ${nm(a.id)} → ${nm(b.id)} · ${row}`, spec: { k: 'fare', sys: a.sys, a: a.id, b: b.id, path: r.path, row, t: t(curLang, 'mFare') } };
  }

  /* station aliases for fare lookups (longest names first so
     "Taipei Main Station" wins over "Taipei"); built lazily because
     smate.js loads before metro.js has exposed __METRO */
  let ST_ALIAS = null;
  const stAlias = () => {
    if (!ST_ALIAS) {
      ST_ALIAS = [];
      for (const s of Object.values(globalThis.__METRO.ST)) {
        ST_ALIAS.push({ id: s.id, sys: s.sys, en: s.en.toLowerCase(), zh: s.zh, len: Math.max(s.en.length, s.zh.length) });
      }
      ST_ALIAS.sort((a, b) => b.len - a.len);
    }
    return ST_ALIAS;
  };
  const matchSt = (name, sysNow) => {
    const n2 = latinDigits(String(name || '')).toLowerCase().trim();
    if (!n2) return null;
    for (const st of stAlias()) {
      if (st.sys !== sysNow) continue;
      if ((st.en && n2.includes(st.en)) || (st.zh && name.includes(st.zh))) return st.id;
    }
    /* a shorter spoken name may still mean the station: "Taipei Main" ->
       Taipei Main Station (long names first, so the best match wins) */
    if (n2.length >= 5) {
      for (const st of stAlias()) {
        if (st.sys !== sysNow) continue;
        if ((st.en && st.en.includes(n2)) || (st.zh && st.zh.includes(n2))) return st.id;
      }
    }
    return null;
  };

  /* ---------- the AI's hands: a tool for everything a person can do ----------
     Generic tools operate the live page (click, fill, pick, read, press,
     goto) exactly like a user at the browser; purpose-built tools drive the
     apps' tested code paths. The model picks tools from the live page
     context; every result feeds back so it can continue multi-step work. */
  let ELMAP = new Map();
  const tick = () => new Promise((r) => setTimeout(r, 60));
  const elOf = (a) => ELMAP.get(String((a && a.ref) || '')) || (a && a.id ? document.getElementById(String(a.id)) : null) || (a && a.sel ? document.querySelector(String(a.sel)) : null);
  const doneT = () => t(curLang, 'done');
  const NAV = (say) => ({ nav: true, say });

  function inventory() {
    ELMAP = new Map();
    const out = [];
    const els = document.querySelectorAll('button, input, select, textarea, a[href], [contenteditable="true"], [role="button"], [role="tab"], [role="switch"]');
    for (const el of els) {
      if (out.length >= 36) break;
      if (el.id === 'smateBtn' || el.closest('#smatePop')) continue;
      if (el.type === 'file' || el.disabled || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const ref = 'e' + (ELMAP.size + 1);
      ELMAP.set(ref, el);
      const name = (el.getAttribute('aria-label') || el.title || el.placeholder || (el.labels && el.labels[0] && el.labels[0].textContent) || el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26);
      let d = `${ref} ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${name ? ' "' + name + '"' : ''}`;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.type === 'checkbox' || el.type === 'radio') d += el.checked ? ' [on]' : ' [off]';
        else if (el.value) d += ` =${String(el.value).slice(0, 32)}`;
      } else if (el.tagName === 'SELECT') {
        d += ` {${[...el.options].slice(0, 8).map((o) => o.textContent.trim()).join('|')}}`;
      }
      if (el.getAttribute('aria-pressed') === 'true') d += ' [on]';
      out.push(d);
    }
    return out.join('\n');
  }

  const matchCity = (name) => {
    const n2 = latinDigits(String(name || '')).toLowerCase().trim();
    if (!n2) return null;
    for (const [z, names] of Object.entries(CITY_ALIASES)) {
      for (const x of names) { if (n2.includes(x) || x.includes(n2)) return z; }
    }
    for (const z of zoneList()) { const c = cityOf(z).toLowerCase(); if (c && c.length > 2 && (n2.includes(c) || c.includes(n2))) return z; }
    return findZone(name);
  };
  const LAYMAP = { single: 1, side: 2, '2x2': 4, quad: 4, '4x4': 16, grid: 16 };
  const OPID = { 'add': 'add', '+': 'add', 'plus': 'add', 'sub': 'sub', '-': 'sub', 'minus': 'sub', 'mul': 'mul', '*': 'mul', 'x': 'mul', '×': 'mul', 'div': 'div', '/': 'div', 'mod': 'mod', '%': 'mod', 'pow': 'pow', '^': 'pow' };
  const CMPID = { 'gt': 'gt', '>': 'gt', 'greater': 'gt', 'lt': 'lt', '<': 'lt', 'less': 'lt', 'gte': 'gte', '>=': 'gte', '≥': 'gte', 'lte': 'lte', '<=': 'lte', '≤': 'lte', 'eq': 'eq', '=': 'eq', '==': 'eq', 'equal': 'eq', 'neq': 'neq', '!=': 'neq', '≠': 'neq' };
  const GATEID = { 'not': 'not', '~': 'not', '¬': 'not', 'or': 'or', '+': 'or', 'and': 'and', '*': 'and', 'nor': 'nor', '↓': 'nor', 'nand': 'nand', '↑': 'nand', 'xor': 'xor', '⊕': 'xor', 'xnor': 'xnor', '≡': 'xnor' };
  const boolArg = (v) => (v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1') ? 'true' : 'false';
  /* models pass numbers as words: "5 minutes" -> 5, "3min" -> 3 */
  const numArg = (v) => {
    if (v == null || v === '') return NaN;
    const n = Number(v);
    if (!isNaN(n)) return n;
    const m = String(v).match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  };
  function modEditorOpen() {
    if (!document.getElementById('modEditor').hidden) return;
    const M = globalThis.__MOD;
    const id = M.latest && M.latest();
    if (id) M.openDoc(id); else M.newDoc();
  }

  /* switch the wallet currency through the wallet's own picker UI */
  const walCur = (code) => {
    const b = $('walCurBtn');
    if (!b) return null;
    b.click();                                    /* opens the currency tab */
    const row = document.querySelector(`.cur-row[data-code="${code}"]`);
    if (!row) { b.click(); return null; }         /* nothing matched — close */
    row.click();                                  /* picks it and returns */
    return code;
  };
  const TOOLS = {
    async click(a) { const el = elOf(a); if (!el) return 'no such element'; el.click(); await tick(); return 'clicked'; },
    async fill(a) { const el = elOf(a); if (!el) return 'no such element'; const v = String(a.value ?? ''); el.focus(); if (el.isContentEditable) { el.innerText = v; el.dispatchEvent(new Event('input', { bubbles: true })); } else { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } await tick(); return 'set'; },
    async pick(a) { const el = elOf(a); if (!el) return 'no such element'; const want = String(a.option ?? a.value ?? ''); if (el.tagName === 'SELECT') { const o = [...el.options].find((x) => x.value === want) || [...el.options].find((x) => x.textContent.trim().toLowerCase() === want.toLowerCase()) || [...el.options].find((x) => x.textContent.trim().toLowerCase().includes(want.toLowerCase())); if (!o) return 'no such option'; el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); await tick(); return 'picked ' + o.textContent.trim(); } if (el.type === 'checkbox' || el.type === 'radio') { el.checked = want === 'true' || want === 'on' || want === 'check' || a.option === true; el.dispatchEvent(new Event('change', { bubbles: true })); await tick(); return el.checked ? 'checked' : 'unchecked'; } el.value = want; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); await tick(); return 'set'; },
    async read(a) { const el = elOf(a); if (!el) return 'no such element'; const v = (el.value != null && el.value !== '') ? el.value : (el.innerText || el.textContent); return String(v).trim().slice(0, 400) || '(empty)'; },
    async press(a) { const el = elOf(a) || document.activeElement || document.body; const k = String(a.key || 'Enter'); const ev = (type) => new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(ev('keydown')); el.dispatchEvent(ev('keyup')); await tick(); return 'pressed ' + k; },
    async goto(a) { const r = act.nav(String(a.app || 'clock')); return (r && String(r).startsWith('→')) ? NAV(r) : (r || 'no such app'); },

    async timer(a) {
      const n = numArg(a.minutes);
      if (!n || n <= 0) return 'minutes required';
      if (page === 'clock') {
        const r = act.timerSet(n);
        const tv = LIB.timersView(); const q = tv[tv.length - 1];
        abPush({ k: 'timer', e: q ? q.e : Date.now() + n * 60000, d: n * 60000, t: `${t(curLang, 'timer')} · ${n} ${t(curLang, 'minutes')}` });
        return r;
      }
      try { localStorage.setItem('singhoah:pendingTimer', JSON.stringify({ m: n })); } catch { /* ignore */ }
      abPush({ k: 'timer', e: Date.now() + n * 60000 + 1500, d: n * 60000, t: `${t(curLang, 'timer')} · ${n} ${t(curLang, 'minutes')}` });
      return NAV(act.nav('clock'));
    },
    async timerctl(a) {
      const w = String(a.action || '');
      const r = act.timerCtl(w);
      if (r) { const tv = LIB.timersView(); const q = tv[tv.length - 1]; if (q) abPush({ k: 'timer', e: q.e, d: q.d, t: t(curLang, 'timer') }); }
      return r || 'no timer running';
    },
    async stopwatch(a) {
      const r = act.stopwatch(String(a.action || 'new'));
      if (r) { const sv = LIB.stopsView(); const q = sv[sv.length - 1]; abPush({ k: 'stop', s: q ? q.s : null, t: t(curLang, 'stopwatch') }); }
      return r || 'no stopwatch';
    },
    async zones(a) {
      const cities = Array.isArray(a.cities) ? a.cities : (a.city ? [a.city] : []);
      const zs = [...new Set(cities.map((c) => matchCity(c)).filter(Boolean))];
      const lay = a.layout ? (LAYMAP[String(a.layout).toLowerCase()] || null) : null;
      if (!zs.length && lay == null) return 'name at least one city';
      if (page === 'clock') {
        abPush({ k: 'clocks', z: zs, t: t(curLang, 'winTitle') });
        LIB.smateWindow(zs, lay);
        const bits = [];
        if (lay != null) bits.push(lay === 16 ? t(curLang, 'grid16') : lay === 4 ? t(curLang, 'quad') : lay === 2 ? t(curLang, 'side') : t(curLang, 'single'));
        if (zs.length) bits.push(zs.map((z) => cityOf(z)).join(', '));
        return `${t(curLang, 'winTitle')}: ${bits.join(' · ')}`;
      }
      if (page === 'settings' && zs.length) { const r = setTz(zs[0]); abPush({ k: 'clocks', z: [zs[0]], t: t(curLang, 'tzTitle') }); return r || 'failed'; }
      try { localStorage.setItem('singhoah:pendingWin', JSON.stringify({ z: zs, l: lay })); } catch { /* ignore */ }
      abPush({ k: 'clocks', z: zs, t: t(curLang, 'winTitle') });
      return NAV(act.nav('clock'));
    },
    async removezone(a) { if (page !== 'clock') return 'clock page only'; const z = matchCity(String(a.city || '')); if (!z) return 'no such city'; const r = LIB.smateRemove(z) ? doneT() : null; if (r) abPush({ k: 'done', t: `${t(curLang, 'remove')} · ${cityOf(z)}` }); return r || 'not found'; },
    async removewin(a) { if (page !== 'clock') return 'clock page only'; const w = String(a.what) === 'stopwatch' ? 'stop' : 'timer'; const r = LIB.smateRemove(w) ? doneT() : null; if (r) abPush({ k: 'done', t: `${t(curLang, 'remove')} · ${t(curLang, w === 'timer' ? 'timer' : 'stopwatch')}` }); return r || 'none'; },
    async restartwin(a) { if (page !== 'clock') return 'clock page only'; const w = String(a.what) === 'stopwatch' ? 'stop' : 'timer'; const r = LIB.smateRestart(w) ? doneT() : null; if (r) abPush({ k: 'done', t: `${t(curLang, 'restart')} · ${t(curLang, w === 'timer' ? 'timer' : 'stopwatch')}` }); return r || 'none'; },
    async mode(a) { const wantAnalog = String(a.mode) === 'analog'; const b = $('btnMode'); if (b) { const isAnalog = b.getAttribute('aria-pressed') === 'true'; if (wantAnalog !== isAnalog) b.click(); } else { try { localStorage.setItem('singhoah:pendingMode', wantAnalog ? 'analog' : 'digital'); } catch { /* ignore */ } } abPush({ k: 'mode', an: wantAnalog, t: t(curLang, wantAnalog ? 'analog' : 'digital') }); return doneT(); },
    async theme(a) { const wantDark = String(a.mode) === 'night' || String(a.mode) === 'dark'; if (page === 'settings') { click($('btnTheme')); return doneT(); } const b = $('btnNight'); if (!b) return 'no theme control here'; const dark = document.documentElement.classList.contains('dark'); if (wantDark !== dark) b.click(); abPush({ k: 'done', t: t(curLang, wantDark ? 'night' : 'light') }); return doneT(); },
    async resync() { const r = click($('btnSync')) ? doneT() : null; if (r) abPush({ k: 'done', t: t(curLang, 'resync') }); return r || 'not here'; },
    async fullscreen() { const r = click($('btnFull')) ? doneT() : null; if (r) abPush({ k: 'done', t: t(curLang, 'full') }); return r || 'not here'; },
    async showmap(a) { const zm = a.city ? findZone(String(a.city)) : null; const spec = { k: 'mapnav', z: zm || null, c: zm ? cityOf(zm) : String(a.city || '').slice(0, 24), t: t(curLang, 'map') }; if (page === 'clock') { click($('btnMap')); LIB.mapGoCity(String(a.city || '')); abPush(spec); return doneT(); } try { localStorage.setItem('singhoah:pendingMap', JSON.stringify({ c: a.city || '' })); } catch { /* ignore */ } abPush(spec); return NAV(act.nav('clock')); },
    async ip() { if (page !== 'clock') return 'clock page only'; return click($('btnIp')) ? doneT() : 'not found'; },
    async lang(a) { const lg = findLang(String(a.name || '')); if (!lg) return 'unknown language'; const r = setLang(lg); if (r) abPush({ k: 'done', t: t(curLang, 'language'), b: langOf(lg).name }); return r || 'failed'; },
    async time(a) {
      const z = a.city ? (matchCity(String(a.city)) || findZone(String(a.city))) : null;
      const tf = new Intl.DateTimeFormat(langOf(curLang).locale, { hour: '2-digit', minute: '2-digit', timeZone: z || undefined });
      if (z) return t(curLang, 'timeIn').replace('{t}', tf.format(new Date())).replace('{c}', cityOf(z));
      return tf.format(new Date());
    },
    async remind(a) { const m = numArg(a.minutes); if (!m || m <= 0 || isNaN(m)) return 'minutes required'; reminders.push({ at: Date.now() + m * 60000 }); const txt = t(curLang, 'remindSet').replace('{n}', String(m)); abPush({ k: 'remind', at: Date.now() + m * 60000, t: txt }); return txt; },
    async calc(a) { const v = safeMath(String(a.expr || '')); return v == null ? 'cannot compute that' : String(Math.round(v * 10000) / 10000); },
    async clearchat() { clearChatNow(); return doneT(); },
    async clearclock() { if (page === 'clock') { LIB.clearWindow(); abPush({ k: 'done', t: t(curLang, 'clearAll') }); return doneT(); } try { localStorage.setItem('singhoah:pendingClear', '1'); } catch { /* ignore */ } return NAV(act.nav('clock')); },
    async settz(a) { if (page !== 'settings') return 'settings page only'; const z = matchCity(String(a.city || '')) || findZone(String(a.city || '')); if (!z) return 'unknown city'; const r = setTz(z); if (r) abPush({ k: 'clocks', z: [z], t: t(curLang, 'tzTitle') }); return r || 'failed'; },

    async walletadd(a) {
      const type = String(a.type) === 'income' ? 'in' : 'out';
      const amt = numArg(a.amount);
      if (!amt || isNaN(amt)) return 'amount required';
      const note = String(a.note || '').slice(0, 40);
      const ttl = t(curLang, type === 'in' ? 'walIncome' : 'walExpense');
      if (page === 'wallet') {
        click(type === 'in' ? $('walTypeIn') : $('walTypeOut'));
        $('walAmt').value = String(amt);
        if ($('walNote')) $('walNote').value = note;
        $('walAddBtn').click();
        const bal = $('walBal') ? $('walBal').textContent : '';
        abPush({ k: 'wallet', inn: type === 'in', amt, bal: `${t(curLang, 'walBalance')} · ${bal}`, t: ttl });
        return `${doneT()} · ${bal}`;
      }
      const r = LIB.walPush(type, amt, note);
      const bal = `${LIB.curSymbol(r.cur)}${r.bal.toLocaleString(langOf(curLang).locale, { minimumFractionDigits: 2 })}`;
      abPush({ k: 'wallet', inn: type === 'in', amt, bal: `${t(curLang, 'walBalance')} · ${bal}`, t: ttl });
      return `${doneT()} · ${bal}`;
    },
    async walletbalance() {
      if (page === 'wallet') return `${t(curLang, 'walBalance')}: ${$('walBal') ? $('walBal').textContent : ''}`;
      let seed = null;
      try { seed = JSON.parse(localStorage.getItem('singhoah:wallet') || 'null'); } catch { /* ignore */ }
      const tx = (seed && Array.isArray(seed.tx)) ? seed.tx : [];
      const bal = LIB.walBalance(tx);
      const cur = (seed && seed.cur) || 'USD';
      return `${t(curLang, 'walBalance')}: ${LIB.curSymbol(cur)}${bal.toLocaleString(langOf(curLang).locale, { minimumFractionDigits: 2 })}`;
    },
    async walletcurrency(a) { const c = findCurrency(String(a.code || '')); if (!c) return 'unknown currency'; if (page !== 'wallet') return 'wallet page only'; return walCur(c) || 'failed'; },
    async wallettab(a) { const m = { reports: 'walTabR', days: 'walTabD', cash: 'walTabC' }; const id = m[String(a.tab || '')]; if (!id || page !== 'wallet') return 'wallet page only'; click($(id)); if (id === 'walTabC') abPush({ k: 'cash', row: `${t(curLang, 'walBalance')} · ${$('walBal') ? $('walBal').textContent : ''}` }); return doneT(); },
    async walletdeletelast() { if (page !== 'wallet') return 'wallet page only'; const xs = document.querySelectorAll('.wal-x'); if (!xs.length) return 'no entries'; xs[xs.length - 1].click(); return doneT(); },
    async cash(a) {
      if (a && a.currency) { const c = findCurrency(String(a.currency)); if (c && page === 'wallet') walCur(c); }
      if (page === 'wallet') { click($('walTabC')); abPush({ k: 'cash', row: `${t(curLang, 'walBalance')} · ${$('walBal') ? $('walBal').textContent : ''}` }); return doneT(); }
      abPush({ k: 'cash' });
      setTimeout(() => { location.href = 'wallet.html#tab=cash'; }, 700);
      return NAV(`→ ${t(curLang, 'wallet')} · ${t(curLang, 'walCash')}`);
    },

    async metrosys(a) { if (page !== 'metro' || !globalThis.__METRO) return 'metro page only'; const M = globalThis.__METRO; const sy = String(a.sys || '').toUpperCase(); if (!M.setSys(sy)) return 'unknown system'; return `${doneT()}: ${t(curLang, 'm' + sy)}`; },
    async metrozoom(a) { if (page !== 'metro' || !globalThis.__METRO) return 'metro page only'; const M = globalThis.__METRO; if (a.dir === 'reset') { M.resetView(); return doneT(); } M.zoomBy(a.dir === 'out' ? 1 / 1.7 : 1.7); abPush({ k: 'done', t: t(curLang, 'done'), b: a.dir === 'out' ? '÷1.7' : '×1.7' }); return doneT(); },
    async metroswap() { if (page !== 'metro') return 'metro page only'; click($('mSwap')); abPush({ k: 'done', t: t(curLang, 'mSwap') }); return doneT(); },
    async metroclear() { if (page !== 'metro') return 'metro page only'; click($('mClear')); return doneT(); },
    async metrocard(a) { if (page !== 'metro') return 'metro page only'; click($('mCard')); const has = a.balance != null && String(a.balance) !== ''; if (has) { const b = $('mCardBal'); if (b) { b.value = String(a.balance); b.dispatchEvent(new Event('change', { bubbles: true })); } } abPush({ k: 'done', t: `${t(curLang, 'mCard')}${has ? ` · ${a.balance}` : ''}`, b: has ? `${t(curLang, 'walBalance')} · ${a.balance}` : '' }); return doneT(); },
    async route(a) {
      if (page !== 'metro' || !globalThis.__METRO) return 'metro page only';
      const M = globalThis.__METRO;
      const from = matchSt(String(a.from || ''), M.sys), to = matchSt(String(a.to || ''), M.sys);
      if (!from || !to) return 'station not found';
      M.pick(from); M.pick(to);
      const r = M.route(from, to);
      if (!r) return 'no route';
      const f = M.fare(M.sys, from, to, r);
      const nm = (id) => `${M.ST[id].en} ${M.ST[id].zh}`;
      const row = `NT$${f} · ${r.stops + 1} ${t(curLang, 'mStations')} · ${r.transfers} ${t(curLang, 'mTransfers')}`;
      abPush({ k: 'fare', sys: M.sys, a: from, b: to, path: r.path, row, t: t(curLang, 'mFare') });
      return `${t(curLang, 'mFare')}: ${nm(from)} → ${nm(to)} · ${row}`;
    },
    async fare(a) {
      const F = await fareMod();
      if (F) {
        const byName = (nm) => {
          const n2 = latinDigits(String(nm || '')).toLowerCase().trim();
          if (!n2) return null;
          const sts = Object.values(F.ST).map((st) => ({ id: st.id, sys: st.sys, en: st.en.toLowerCase(), zh: st.zh || '', len: Math.max(st.en.length, (st.zh || '').length) })).sort((x, y) => y.len - x.len);
          for (const st of sts) { if ((st.en && n2.includes(st.en)) || (st.zh && nm.includes(st.zh))) return st; }
          if (n2.length >= 5) for (const st of sts) { if ((st.en && st.en.includes(n2)) || (st.zh && st.zh.includes(n2))) return st; }
          return null;
        };
        const A = byName(a.from), B2 = byName(a.to);
        if (A && B2) {
          const nm = (st) => `${F.ST[st.id].en} ${F.ST[st.id].zh}`;
          if (A.sys !== B2.sys) {
            const spec = { k: 'fare', sys: A.sys, a: A.id, b: B2.id, path: [], row: t(curLang, 'fareXsys'), t: t(curLang, 'mFare') };
            abPush(spec);
            return `${t(curLang, 'mFare')}: ${nm(A)} → ${nm(B2)} · ${t(curLang, 'fareXsys')}`;
          }
          const r = F.route(A.id, B2.id);
          if (r) {
            const f = F.fare(A.sys, A.id, B2.id, r);
            if (f != null) {
              const row = `NT$${f} · ${r.stops + 1} ${t(curLang, 'mStations')} · ${r.transfers} ${t(curLang, 'mTransfers')}`;
              abPush({ k: 'fare', sys: A.sys, a: A.id, b: B2.id, path: r.path, row, t: t(curLang, 'mFare') });
              return `${t(curLang, 'mFare')}: ${nm(A)} → ${nm(B2)} · ${row}`;
            }
          }
        }
      }
      const fr = await fareAnywhere(`${a.from} to ${a.to}`);
      if (!fr) return 'stations not found';
      abPush(fr.spec);
      return fr.text;
    },

    async scribefiles() { if (!globalThis.__SCRIBE) return 'scribe page only'; globalThis.__SCRIBE.showHome(); abPush({ k: 'done', t: t(curLang, 'flFiles') }); return t(curLang, 'flFiles'); },
    async scribenew() { if (!globalThis.__SCRIBE) return 'scribe page only'; const id = globalThis.__SCRIBE.docs.docsCreate('note', '', {}); globalThis.__SCRIBE.openDoc(id); abPush({ k: 'done', t: `${t(curLang, 'flNew')} · ${t(curLang, 'flUntitledNote')}` }); return doneT(); },

    async modadd(a) { const M = globalThis.__MOD; if (!M) return 'module page only'; modEditorOpen(); const n = M.add(String(a.type || 'number'), a.x != null ? Number(a.x) : undefined, a.y != null ? Number(a.y) : undefined); if (a.cfg && typeof a.cfg === 'object') M.cfg(n.id, a.cfg); return `${n.id} ${n.type} at ${Math.round(n.x)},${Math.round(n.y)}`; },
    async modcfg(a) { const M = globalThis.__MOD; if (!M) return 'module page only'; let id = String(a.id || ''); if (!M.nodes().some((n) => n.id === id) && a.find != null) { const f = M.nodes().find((n) => n.cfg && String(n.cfg.value != null ? n.cfg.value : n.cfg.text) === String(a.find)); if (f) id = f.id; } if (!M.nodes().some((n) => n.id === id)) return 'no such node'; let patch = (a.patch && typeof a.patch === 'object') ? { ...a.patch } : { ...a }; delete patch.id; delete patch.x; delete patch.y; M.cfg(id, patch); return 'ok'; },
    async modwire(a) { const M = globalThis.__MOD; if (!M) return 'module page only'; return M.wire(String(a.from || ''), String(a.to || ''), String(a.port || 'a')) ? 'wired' : 'cannot wire these'; },
    async modremove(a) { const M = globalThis.__MOD; if (!M) return 'module page only'; if (!M.nodes().some((n) => n.id === String(a.id || ''))) return 'no such node'; M.removeNode(String(a.id)); return 'removed'; },
    async modrun() { const M = globalThis.__MOD; if (!M) return 'module page only'; modEditorOpen(); const r = await M.run(); return (r && r.length) ? r.join(' · ').slice(0, 200) : '(no output)'; },
    async modclear() { const M = globalThis.__MOD; if (!M) return 'module page only'; modEditorOpen(); const oc = window.confirm; window.confirm = () => true; const r = M.clear(); window.confirm = oc; if (r) abPush({ k: 'done', t: t(curLang, 'mClearCv') }); return r ? doneT() : 'already empty'; },
    async modnew() { const M = globalThis.__MOD; if (!M) return 'module page only'; M.newDoc(); abPush({ k: 'done', t: `${t(curLang, 'flNew')} · ${t(curLang, 'lpModule')}` }); return doneT(); },
    async modfiles() { const M = globalThis.__MOD; if (!M) return 'module page only'; M.home(); abPush({ k: 'done', t: t(curLang, 'flFiles') }); return t(curLang, 'flFiles'); },
    async mathflow(a) {
      const M = globalThis.__MOD; if (!M) return 'module page only';
      const oid = OPID[String(a.op || '').toLowerCase()] || 'add';
      const A = String(a.a ?? ''), B = String(a.b ?? '');
      const na = M.add('number'); const nb = M.add('number', na.x, na.y + 260);
      const op = M.add('operator', na.x + 320, na.y + 130); const io = M.add('io', na.x + 600, na.y + 130);
      M.cfg(na.id, { numtype: 'dec', value: A }); M.cfg(nb.id, { numtype: 'dec', value: B }); M.cfg(op.id, { op: oid });
      M.wire(na.id, op.id, 'a'); M.wire(nb.id, op.id, 'b'); M.wire(op.id, io.id);
      const r = await M.run();
      const out = (r && r.length) ? r.join(' · ') : '';
      sayBlock({ k: 'done', t: `${t(curLang, 'lpModule')} · ${t(curLang, 'mOperator')}`, b: out.slice(0, 140) || t(curLang, 'mResult') });
      return out || '(no output)';
    },
    async cmpflow(a) {
      const M = globalThis.__MOD; if (!M) return 'module page only';
      const cid = CMPID[String(a.cmp || '').toLowerCase()] || 'gt';
      const A = String(a.a ?? ''), B = String(a.b ?? '');
      const na = M.add('number'); const nb = M.add('number', na.x, na.y + 260);
      const cp = M.add('comparator', na.x + 320, na.y + 130); const io = M.add('io', na.x + 600, na.y + 130);
      M.cfg(na.id, { numtype: 'dec', value: A }); M.cfg(nb.id, { numtype: 'dec', value: B }); M.cfg(cp.id, { cmp: cid });
      M.wire(na.id, cp.id, 'a'); M.wire(nb.id, cp.id, 'b'); M.wire(cp.id, io.id);
      const r = await M.run();
      const out = (r && r.length) ? r.join(' · ') : '';
      sayBlock({ k: 'done', t: `${t(curLang, 'lpModule')} · ${t(curLang, 'mComparator')}`, b: out.slice(0, 140) || t(curLang, 'mResult') });
      return out || '(no output)';
    },
    async logicflow(a) {
      const M = globalThis.__MOD; if (!M) return 'module page only';
      const gid = GATEID[String(a.gate || '').toLowerCase()] || 'or';
      const A = boolArg(a.a), B = boolArg(a.b);
      const ba = M.add('boolean'); M.cfg(ba.id, { val: A });
      let bb = null;
      if (gid !== 'not') { bb = M.add('boolean', ba.x, ba.y + 260); M.cfg(bb.id, { val: B }); }
      const dy = gid === 'not' ? 0 : 130;
      const lg = M.add('logic', ba.x + 320, ba.y + dy); M.cfg(lg.id, { gate: gid });
      const io = M.add('io', ba.x + 600, ba.y + dy);
      M.wire(ba.id, lg.id, 'a');
      if (gid !== 'not') M.wire(bb.id, lg.id, 'b');
      M.wire(lg.id, io.id);
      const r = await M.run();
      const out = (r && r.length) ? r.join(' · ') : '';
      sayBlock({ k: 'done', t: `${t(curLang, 'lpModule')} · ${t(curLang, 'mLogic')}`, b: out.slice(0, 140) || t(curLang, 'mResult') });
      return out || '(no output)';
    },

    async welcome() { if (page === 'launch') { document.dispatchEvent(new CustomEvent('singhoah:lpWelcome')); abPush({ k: 'done', t: t(curLang, 'lpWelcomeT') }); return doneT(); } return NAV(act.nav('launch')); },
    async printpage() { window.print(); abPush({ k: 'done', t: t(curLang, 'print') }); return doneT(); },
    async resetdata() { if (page !== 'settings') return 'settings page only'; const oc = window.confirm; window.confirm = () => true; const r = click($('btnReset')) ? doneT() : null; window.confirm = oc; return r || 'not found'; },
  };

  /* the model sees the live page: which app, which controls (with refs and
     #ids), the wallet ledger, the flow on the canvas — enough context to act
     like an assistant who is looking at the screen */
  function agentSys() {
    if (aiCpu) {
      /* the CPU model is tiny: a compact, example-first prompt it can follow */
      const bits = [
        'You are SMate, the assistant inside the Singhoah web app. You drive the app for the user.',
        'ALWAYS reply with exactly ONE JSON object, nothing else: a tool call like {"tool":"timer","args":{"minutes":5}} (you then see its RESULT), or a real answer like {"say":"Timer set for 5 minutes."}.',
        'Tools: timer(minutes) calc(expr) goto(app:clock|wallet|scribe|metro|module|settings|launch) theme(night|light) zones(cities,layout) remind(minutes) time(city) walletbalance',
        '"set a timer for 5 minutes" -> {"tool":"timer","args":{"minutes":5}}',
        '"what is 25 * 4" -> {"tool":"calc","args":{"expr":"25 * 4"}}',
        '"open the wallet" -> {"tool":"goto","args":{"app":"wallet"}}',
        '"night shift please" -> {"tool":"theme","args":{"mode":"night"}}',
        `PAGE: ${page} LANGUAGE: ${langOf(curLang).name}`,
      ];
      try {
        const d = JSON.parse(localStorage.getItem('singhoah:wallet') || 'null');
        if (page === 'wallet' && d && Array.isArray(d.tx)) bits.push(`WALLET ${d.cur || ''} balance ${LIB.walBalance(d.tx)}`);
      } catch { /* ignore */ }
      return bits.join('\n');
    }
    const bits = [
      'You are SMate, the assistive AI living inside the Singhoah web app. You operate every app for the user like a person at the browser: clicking buttons, typing into fields, picking options, navigating pages, running flows. Never refuse an in-app request — use your tools. Small talk and general questions: just answer.',
      'Reply with exactly ONE JSON object, no markdown: a tool call like {"tool":"timer","args":{"minutes":5}} to act (you then see its RESULT and continue), or a real answer in the user language like {"say":"Timer set for 5 minutes."} to finish or to answer.',
      'Tools: click(ref) fill(ref,value) pick(ref,option) read(ref) press(key) goto(app:clock|wallet|scribe|metro|module|settings|launch) timer(minutes) timerctl(pause|resume|reset) stopwatch(start|pause|resume|reset|new) zones(cities[],layout:single|side|2x2|4x4) removezone(city) removewin(timer|stopwatch) restartwin(timer|stopwatch) mode(analog|digital) theme(night|light) resync fullscreen showmap(city) ip lang(name) time(city) remind(minutes) calc(expr) clearchat clearclock settz(city) walletadd(type:income|expense,amount,note) walletbalance walletcurrency(code) wallettab(reports|days|cash) walletdeletelast cash(currency?) metrosys(TRTC|KS|TC|TY) metrozoom(in|out|reset) metroswap metroclear metrocard(balance) route(from,to) fare(from,to) scribefiles scribenew modadd(type,x?,y?,cfg?) modcfg(id,patch) modwire(from,to,port:a|b) modremove(id) modrun modclear modnew modfiles mathflow(a,op,b) cmpflow(a,cmp,b) logicflow(gate,a,b?) welcome printpage resetdata',
      'Examples: "set a timer for 5 minutes" -> {"tool":"timer","args":{"minutes":5}} | "open the wallet" -> {"tool":"goto","args":{"app":"wallet"}} | "what is 25 * 4" -> {"tool":"calc","args":{"expr":"25 * 4"}} | "night shift please" -> {"tool":"theme","args":{"mode":"night"}}',
      'Elements can be addressed by their ref (e.g. e7) or by #id from the CONTROLS list. "change X to Y" always means act: change the timer to 10 -> timer(10); change the title to Demo -> fill(ref,"Demo"); change 5 to 7 on the flow -> modcfg. Prefer purpose-built tools over raw clicks. After the actions, finish with a short {"say"}.',
      `PAGE: ${page} LANGUAGE: ${langOf(curLang).name} NOW: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    ];
    try {
      const d = JSON.parse(localStorage.getItem('singhoah:wallet') || 'null');
      if (page === 'wallet' || (d && Array.isArray(d.tx) && d.tx.length)) {
        const rows = d.tx.slice(-8).map((x) => `${x.date} ${x.type === 'in' ? '+' : '-'}${x.amt} ${x.note || ''}`);
        bits.push(`WALLET ${d.cur || ''} balance ${LIB.walBalance(d.tx)}; recent rows: ${rows.join(' | ')}`);
      }
    } catch { /* ignore */ }
    if (page === 'module' && globalThis.__MOD) {
      try {
        const M = globalThis.__MOD;
        const ns = M.nodes();
        const desc = ns.slice(0, 12).map((n) => {
          const c = n.cfg || {};
          const v = c.value != null ? '=' + c.value : c.op ? c.op : c.cmp ? c.cmp : c.gate ? c.gate : c.val ? '=' + c.val : c.numtype ? c.numtype : '';
          return `${n.id} ${n.type}${v ? ' ' + v : ''}`;
        }).join('; ');
        bits.push(`FLOW "${$('modTitle') ? $('modTitle').value : ''}": ${ns.length} nodes${desc ? ' — ' + desc : ''}, ${M.wires().length} wires`);
      } catch { /* ignore */ }
    }
    if (page === 'metro' && globalThis.__METRO) bits.push(`METRO system: ${globalThis.__METRO.sys}`);
    bits.push('CONTROLS:\n' + inventory());
    return bits.join('\n');
  }

  /* one JSON object out of a model reply — even if wrapped in prose */
  function extractJson(str) {
    if (!str) return null;
    const i = str.indexOf('{');
    if (i < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let k = i; k < str.length; k++) {
      const c = str[k];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) { try { return JSON.parse(str.slice(i, k + 1)); } catch { return null; } } }
    }
    return null;
  }

  /* the agent loop: ask the model, run its tool, show it the result, repeat —
     until it says the answer. Navigation ends the turn (the page leaves) */
  async function agent(raw) {
    setStatusText('AI …');
    const hist = [];
    let scolded = false;
    let lastRaw = '';
    const seed = aiCpu ? CPU_FEWSHOT : [];   /* the tiny brain needs to see the pattern */
    for (let round = 0; round < 6; round++) {
      let r = '';
      try {
        r = await Promise.race([
          askEngine([{ role: 'system', content: agentSys() }, ...seed, { role: 'user', content: raw }, ...hist]),
          new Promise((_, rej) => setTimeout(() => rej(new Error('smate-ai-slow')), AI_TIMEOUT)),
        ]);
      } catch { return null; }
      lastRaw = String(r || '');
      let j = extractJson(r);
      /* the tiny CPU model swaps arg keys between tools: goto with {expr}
         means calc, timer with {app} means goto — repair by the args given.
         Larger models get it right; leave their calls untouched */
      const TOOL_ARG_KEYS = { timer: 'minutes', remind: 'minutes', calc: 'expr', goto: 'app', theme: 'mode', zones: 'cities' };
      if (aiCpu && j && j.tool && TOOL_ARG_KEYS[j.tool] && j.args && typeof j.args === 'object' && !Array.isArray(j.args)) {
        const want = TOOL_ARG_KEYS[j.tool];
        if (j.args[want] == null || j.args[want] === '') {
          for (const [tn, key] of Object.entries(TOOL_ARG_KEYS)) {
            if (key !== want && j.args[key] != null && j.args[key] !== '') { j = { tool: tn, args: j.args }; break; }
          }
        }
      }
      /* a model saying {"tool":"wallet"} means "open the wallet" — app names
         are destinations, so read them as goto */
      if (j && j.tool && !TOOLS[j.tool]) {
        const tn = String(j.tool).trim().toLowerCase();
        if (['clock', 'wallet', 'scribe', 'metro', 'module', 'settings', 'launch'].includes(tn)) j = { tool: 'goto', args: { app: tn } };
      }
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        if (j.say != null) {
          /* a leading <...> tag is a parroted prompt placeholder ("<text>"),
             never a real answer — strip it; if nothing real remains, treat
             the reply as invalid and let the nudge/fallback paths handle it */
          const s = String(j.say).trim().replace(/^<[^>]*>\s*/, '').trim();
          if (s && s.toLowerCase() !== String(raw || '').trim().toLowerCase()) return s;
        }
        const fn = j.tool && TOOLS[j.tool];
        if (fn) {
          hist.push({ role: 'assistant', content: JSON.stringify({ tool: j.tool, args: j.args || {} }) });
          let res;
          try { res = await fn(j.args || {}); } catch { res = 'error'; }
          if (res && typeof res === 'object' && res.nav) return res.say;
          hist.push({ role: 'user', content: 'RESULT: ' + String(res).slice(0, 220) });
          while (hist.length > 6) hist.splice(0, 2);
          continue;
        }
      }
      if (scolded || round >= 5) {
        const p2 = (lastRaw || '').trim();
        if (aiCpu && p2 && p2.length <= 240 && !p2.includes('{')) return p2;
        return null;
      }
      scolded = true;
      hist.push({ role: 'assistant', content: String(r).slice(0, 160) },
        { role: 'user', content: 'Invalid reply. Valid tools: ' + (aiCpu ? 'timer calc goto theme zones remind time walletbalance' : 'the tools in the list') + '. Reply with ONE JSON object only: a tool call, or your real answer in "say".' });
    }
    const p3 = (lastRaw || '').trim();
    if (aiCpu && p3 && p3.length <= 240 && !p3.includes('{')) return p3;
    return null;
  }

  /* one silent recovery attempt before admitting the engine is down: the
     failure may have been a blip — a dropped download, a flaky moment. If
     the network recovered the user simply gets a working assistant; if not,
     the honest message. No reload, no toggling, no questions */
  const recover = async (raw) => {
    aiInit();
    const t0 = Date.now();
    while (aiState === 'loading' && Date.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 250));
    if (aiPref === 'off') return t(curLang, 'smateAIOff');
    if (aiState === 'on' && aiEngine) return await agent(raw);
    if (aiState === 'err') return t(curLang, 'aiNoGpu');
    return t(curLang, 'smateAIWait');
  };

  /* WhatsApp-style flow: my line -> typing dots + status -> answer */
  function handle(raw) {
    if (!raw) return;
    const cw = msgs.querySelector('.smate-chips');
    if (cw) cw.remove();
    say(raw, true);
    input.value = '';
    setStatus('smateTyping');
    const dots = document.createElement('p');
    dots.className = 'smate-it smate-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(dots);
    msgs.scrollTop = msgs.scrollHeight;
    const wait = 420 + Math.min(700, raw.length * 18);
    setTimeout(async () => {
      let out = null;
      try {
        if (aiPref === 'off') {
          out = t(curLang, 'smateAIOff');
        } else if (aiState === 'on' && aiEngine) {
          out = await agent(LIB.brandFix ? LIB.brandFix(raw) : raw);
        } else if (aiState === 'err') {
          out = await recover(raw);
        } else {
          /* the arrival preload is already on its way — GPU or CPU, every
             browser gets an engine. Join the wait; answer honestly if it
             never arrives */
          aiInit();
          const t0 = Date.now();
          while (aiState === 'loading' && Date.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 250));   /* a first model download is big — hold the question */
          if (aiPref === 'off') out = t(curLang, 'smateAIOff');
          else if (aiState === 'on' && aiEngine) out = await agent(raw);
          else if (aiState === 'err') out = await recover(raw);
          else out = t(curLang, 'smateAIWait');
        }
      } catch { out = null; }
      if (dots.isConnected) dots.remove();
      say(out || t(curLang, 'smateUnknown'));
      for (const sp of abDrain()) sayBlock(sp);
      setStatus('smateOnline');
    }, wait);
  }

  $('smateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    handle(input.value.trim());
  });

  /* voice mode — one tap, speaks in the app's current language */
  const mic = $('smateMic');
  let vrec = null, vlistening = false, vfinal = '';
  mic.addEventListener('click', () => {
    if (!SR) { setStatus('smateUnavailable'); return; }
    if (vlistening && vrec) { vrec.stop(); return; }
    try {
      vrec = new SR();
    } catch { setStatus('smateUnavailable'); return; }
    vfinal = '';
    vrec.lang = langOf(curLang).locale;
    vrec.interimResults = true;
    vrec.continuous = false;
    vrec.onstart = () => {
      vlistening = true;
      mic.setAttribute('aria-pressed', 'true');
      setStatus('scribeListening');
      /* you talked to it — it talks back */
      if (voicePref !== 'on' && 'speechSynthesis' in window) {
        voicePref = 'on';
        $('smateSpeak').setAttribute('aria-pressed', 'true');
      }
    };
    vrec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) vfinal += r[0].transcript;
        else interim += r[0].transcript;
      }
      input.value = LIB.brandFix(vfinal + interim, true);
    };
    vrec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setStatus('smateUnavailable'); };
    vrec.onend = () => {
      vlistening = false;
      mic.setAttribute('aria-pressed', 'false');
      setStatus('smateOnline');
      const text = (vfinal || input.value).trim();
      if (text) { input.value = ''; handle(text); }
    };
    try { vrec.start(); } catch { setStatus('smateUnavailable'); }
  });

  /* --------- the brain: an on-device model (WebLLM) that loads the moment
     the site opens — no tap, no gate, no "waking up" message. It is the only
     brain: every request goes to the model, which sees the live page context
     and answers through tools. Turning the chip off pauses the assistant
     until it is turned back on. --------- */  const aiBtn = $('smateAI');
  let aiEngine = null, aiState = 'off'; /* off | loading | on | err */
  /* the browser's module map caches a FAILED import: a plain retry of the
     same URL fails instantly without ever touching the network, so a blip
     at arrival would be unrecoverable until reload. Retry attempts append
     a fresh query string — the module map sees a new URL and re-fetches.
     The first load stays un-busted so normal browser caching applies */
  let aiLoadTry = 0;
  const esmUrl = (pkg) => 'https://esm.run/' + pkg + (aiLoadTry > 1 ? '?retry=' + aiLoadTry : '');
  let aiCpu = false;   /* the WASM engine: small model, slim prompt */
  /* few-shot dialogue for the tiny CPU brain: it follows what it sees */
  const CPU_FEWSHOT = [
    { role: 'user', content: 'open the metro' },
    { role: 'assistant', content: '{"tool":"goto","args":{"app":"metro"}}' },
    { role: 'user', content: 'RESULT: going to metro' },
    { role: 'assistant', content: '{"say":"Opening the metro."}' },
    { role: 'user', content: 'what is 12 * 3' },
    { role: 'assistant', content: '{"tool":"calc","args":{"expr":"12 * 3"}}' },
    { role: 'user', content: 'RESULT: 36' },
    { role: 'assistant', content: '{"say":"36"}' },
    { role: 'user', content: 'what time is it in tokyo' },
    { role: 'assistant', content: '{"tool":"time","args":{"city":"Tokyo"}}' },
    { role: 'user', content: 'RESULT: It is 09:30 in Tokyo.' },
    { role: 'assistant', content: '{"say":"It is 09:30 in Tokyo."}' },
    { role: 'user', content: 'timer 8' },
    { role: 'assistant', content: '{"tool":"timer","args":{"minutes":8}}' },
    { role: 'user', content: 'RESULT: Timer · 8 minutes' },
    { role: 'assistant', content: '{"say":"Timer set for 8 minutes."}' },
    { role: 'user', content: 'set a timer for 3 minutes' },
    { role: 'assistant', content: '{"tool":"timer","args":{"minutes":3}}' },
    { role: 'user', content: 'RESULT: Timer · 3 minutes' },
    { role: 'assistant', content: '{"say":"Timer set for 3 minutes."}' },
  ];


  /* arrive-and-ready: the model starts loading the moment the site opens,
     so the first fuzzy message already meets a warm brain. Until it is up,
     the instant offline interpreter answers — nobody is ever told the AI
     is "waking up". Turning the chip off goes back to interpreter-only
     and stays off across visits. */
  let aiPref = 'on';
  try { if (localStorage.getItem('singhoah:smateAI') === 'off') aiPref = 'off'; } catch { /* ignore */ }
  const AI_TIMEOUT = Number(globalThis.__SMATE_AI_TIMEOUT || 30000);
  const AI_MODELS = ['Qwen2.5-0.5B-Instruct-q4f16_1', 'SmolLM2-360M-Instruct-q4f16_1', 'Qwen2.5-0.5B-Instruct-q4f32_1'];
  /* no WebGPU? the same agent loop runs on the CPU through Transformers.js
     (WASM, int8). The model is deliberately tiny: a 135M brain fits even a
     2GB machine, where a 360M+ one would take the whole tab down */
  const WASM_MODELS = ['HuggingFaceTB/SmolLM2-135M-Instruct'];
  const aiUI = () => {
    aiBtn.setAttribute('aria-pressed', String(aiPref === 'on'));
    aiBtn.classList.toggle('loading', aiState === 'loading');
    aiBtn.classList.toggle('err', aiState === 'err');
  };
  aiUI();                        /* default-ON chip reflects the pref immediately */
  /* the preload: the model starts loading at page arrival — no tap, no
     "Loading" gate. WebGPU machines get web-llm; every other browser gets
     the CPU engine. Either way the assistant works */
  if (aiPref === 'on') aiInit();

  /* the CPU engine: Transformers.js, WASM backend, int8 quantized. It speaks
     the same chat.completions protocol as web-llm, so the agent loop never
     knows the difference. Runs when there is no WebGPU — and as the fallback
     when a WebGPU machine's own load fails */
  async function loadCpuEngine() {
    const tmod = await import(esmUrl('@huggingface/transformers@3'));
    try { tmod.env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1; } catch { /* older builds: default */ }
    aiCpu = true;
    const prog = (p) => {
      const st = $('smateStatus');
      if (st && aiState === 'loading' && p && p.status === 'progress') st.textContent = `AI ${Math.round((p.progress || 0) * 100)}%`;
    };
    let lastErr = null;
    for (const id of WASM_MODELS) {
      try {
        const pipe = await tmod.pipeline('text-generation', id, { dtype: 'q8', device: 'wasm', progress_callback: prog });
        return { chat: { completions: { async create({ messages, max_tokens }) {
          const out = await pipe(messages, { max_new_tokens: Math.min(max_tokens ?? 220, 90), do_sample: false, return_full_text: false });
          const g = out && out[0] && out[0].generated_text;
          const text = typeof g === 'string' ? g
            : Array.isArray(g) ? ((g[g.length - 1] || {}).content || '')
            : (g && g.content) || '';
          try { (globalThis.__SMATE_CPU_RAW = globalThis.__SMATE_CPU_RAW || []).push(String(text).slice(0, 200)); } catch { /* diagnostics hook */ }
          return { choices: [{ message: { content: text } }] };
        } } } };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('no model');
  }

  async function aiInit() {
    if (aiState === 'loading') return;
    aiLoadTry++;
    aiState = 'loading';
    aiCpu = false;   /* a retry may take a different branch than the last attempt */
    aiUI();
    try {
      if (globalThis.__SMATE_AI_ENGINE) {
        aiEngine = globalThis.__SMATE_AI_ENGINE; /* test/extension hook */
      } else {
        let gpu = false;
        try { gpu = !!navigator.gpu && !!(await navigator.gpu.requestAdapter()); } catch { gpu = false; }
        if (gpu) {
          try {
            const mod = await import(esmUrl('@mlc-ai/web-llm'));
            const create = mod.CreateWebLLMEngine || mod.CreateMLCEngine;
            if (!create) throw new Error('web-llm has no engine factory');
            let lastErr = null;
            for (const id of AI_MODELS) {
              try {
                aiEngine = await create(id, {
                  initProgressCallback: (r) => {
                    const st = $('smateStatus');
                    if (st && aiState === 'loading') st.textContent = `AI ${Math.round((r.progress || 0) * 100)}%`;
                  },
                });
                lastErr = null;
                break;
              } catch (e) { lastErr = e; }
            }
            if (!aiEngine) throw lastErr || new Error('no model');
          } catch {
            /* the WebGPU load failed — a dropped download, an out-of-memory
               GPU, a CDN hiccup. The machine can still run the CPU engine:
               fall back instead of declaring the assistant dead */
            aiEngine = null;
          }
        }
        /* no WebGPU — or the WebGPU load just failed. The CPU engine runs
           everywhere; only when it fails too is the assistant truly down */
        if (!aiEngine) aiEngine = await loadCpuEngine();
      }
      if (aiPref !== 'on') { aiEngine = null; aiState = 'off'; aiUI(); return; }   /* turned away mid-load: discard */
      aiState = 'on';
    } catch {
      aiState = 'err';
      aiEngine = null;
    }
    aiUI();
    setStatus('smateOnline');
  }
  aiBtn.addEventListener('click', () => {
    if (aiPref === 'on') {
      aiPref = 'off'; aiState = 'off'; aiEngine = null; aiCpu = false;
      try { localStorage.setItem('singhoah:smateAI', 'off'); } catch { /* ignore */ }
      aiUI(); setStatus('smateOnline');
    } else {
      aiPref = 'on';  /* back to arrive-and-ready: the model loads again now */
      try { localStorage.removeItem('singhoah:smateAI'); } catch { /* ignore */ }
      aiUI(); aiInit();
    }
  });

  /* the wallet ledger rides along in the system prompt when it exists */
  async function askEngine(messages) {
    if (aiEngine.chat && aiEngine.chat.completions) {
      const r = await aiEngine.chat.completions.create({ messages, max_tokens: 220, temperature: 0.1 });
      return String((r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '').trim();
    }
    return String(await aiEngine.chat(messages.map((m) => `${m.role}: ${m.content}`).join('\n---\n'))).trim();
  }
})();
