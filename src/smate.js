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
    async calc(a) {
      let e = String(a.expr || '');
      e = e.replace(/(\d),(?=\d{3}\b)/g, '$1');                                    /* 1,200 -> 1200 */
      e = e.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/gi, '$2*$1/100');   /* 15% of 80 -> 12 (same precedence, no parens) */
      e = e.replace(/[^0-9+\-*/%.()\s]/g, '');                                   /* stray words the model let in */
      const v = safeMath(e);
      return v == null ? 'cannot compute that' : String(Math.round(v * 10000) / 10000);
    },
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

  /* ---------- the interpreter: SMate understands words directly ----------
     No model, no download, no wait. Language in, tool calls out — a
     deterministic grammar over everything the suite can do, plus generic
     click / fill / pick / read so ANY visible control can be driven by
     name, exactly like a person at the browser. Unknown phrasings get an
     honest answer with a suggestion — never a guess, never a long wait. */
  const NUMWORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const ZHDIG = { '零': 0, '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  const zhNum = (s) => {
    if (/^\d+$/.test(s)) return Number(s);
    if (!/^[\u96f6\u4e00\u4e8c\u5169\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+$/.test(s)) return null;
    if (s === '十') return 10;
    const m = s.match(/^([\u96f6\u4e00\u4e8c\u5169\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])?\u5341([\u96f6\u4e00\u4e8c\u5169\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])?$/);
    if (m) return (m[1] ? ZHDIG[m[1]] : 1) * 10 + (m[2] ? ZHDIG[m[2]] : 0);
    return s.split('').reduce((a, c) => a * 10 + ZHDIG[c], 0);
  };
  const numOrWord = (s) => {
    s = String(s == null ? '' : s).trim().toLowerCase();
    if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
    if (NUMWORDS[s] != null) return NUMWORDS[s];
    const m = s.match(/^([a-z]+)-([a-z]+)$/);
    if (m && NUMWORDS[m[1]] != null && NUMWORDS[m[2]] != null) return NUMWORDS[m[1]] + NUMWORDS[m[2]];
    const z = zhNum(s);
    return z != null ? z : null;
  };
  const APPS = {
    clock: ['clock', 'singhoclock', 'singho clock', 'watch', 'clock page', 'the clock', '\u6642\u9418', '\u65f6\u949f', 'the watch'],
    wallet: ['wallet', 'the wallet', 'singhowallet', 'singho wallet', 'money app', 'finance', '\u9322\u5305', '\u94b1\u5305', '\u8a18\u5e33', '\u8bb0\u8d26'],
    scribe: ['scribe', 'singhoscribe', 'singho scribe', 'notes', 'note app', 'the notes', '\u7b46\u8a18', '\u7b14\u8bb0', '\u8a18\u4e8b', '\u8bb0\u4e8b'],
    metro: ['metro', 'subway', 'mrt', 'transit', '\u5730\u9435', '\u5730\u94c1', '\u6377\u904b', '\u6377\u8fd0'],
    module: ['module', 'modules', 'module studio', 'the module studio', 'logic', 'the flow', 'flow canvas', 'singhomodule', '\u6a21\u7d44', '\u6a21\u5757', '\u908f\u8f2f', '\u903b\u8f91'],
    settings: ['settings', 'singhosettings', 'singho settings', 'preferences', 'the settings', '\u8a2d\u5b9a', '\u8bbe\u7f6e', '\u504f\u597d'],
    launch: ['launch', 'launchpad', 'home', 'start page', '\u9996\u9801', '\u9996\u9875', '\u555f\u52d5\u9801', '\u542f\u52a8\u9875'],
  };
  const findApp = (q) => {
    q = ' ' + q.trim().toLowerCase() + ' ';
    for (const [app, names] of Object.entries(APPS)) for (const n of names) if (q.includes(' ' + n + ' ')) return app;
    return null;
  };
  /* any city mentioned in the text (multilingual aliases) */
  const cityIn = (s) => (findAllZones(String(s).toLowerCase()) || [])[0] || null;

  /* resolve a visible control by how a human would call it */
  const elByName = (nm) => {
    try {
      inventory();
      nm = String(nm).trim().toLowerCase().replace(/^(the|a|an)\s+/, '');
      if (!nm) return null;
      const name = (el) => String(el.getAttribute('aria-label') || el.title || el.placeholder || (el.labels && el.labels[0] && el.labels[0].textContent) || el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
      let hits = [];
      for (const [r, el] of ELMAP) if (name(el) === nm) hits.push({ ref: r, el });
      if (!hits.length) for (const [r, el] of ELMAP) { const n = name(el); if (n && n.length > 1 && (n.includes(nm) || nm.includes(n))) hits.push({ ref: r, el }); }
      if (!hits.length) {
        /* token overlap: how a human names a control ("the night button") */
        const toks = nm.split(/\s+/).filter((w) => w.length > 2);
        if (toks.length) {
          let best = null, bestN = 0;
          for (const [r, el] of ELMAP) {
            const n = name(el);
            if (!n) continue;
            const nt = new Set(n.split(/\s+/));
            let n2 = 0; for (const w of toks) if (nt.has(w)) n2 += 1;
            if (n2 > bestN) { bestN = n2; best = { ref: r, el }; }
          }
          if (best && bestN >= Math.max(1, Math.ceil(toks.length / 2))) hits.push(best);
        }
      }
      if (!hits.length) for (const [r, el] of ELMAP) if (el.id && el.id.toLowerCase().includes(nm.replace(/\s+/g, ''))) hits.push({ ref: r, el });
      return hits[0] || null;
    } catch { return null; }
  };

  const MATH_OPS = { plus: '+', add: '+', '+': '+', minus: '-', subtract: '-', '-': '-', times: '*', multiplied: '*', 'x': '*', '*': '*', divided: '/', divide: '/', over: '/', '/': '/' };
  const CMPS = { greater: '>', '>': '>', more: '>', less: '<', '<': '<', fewer: '<', equal: '=', equals: '=', '=': '=', '==': '=', same: '=' };

  /* the grammar: ordered, most specific first. Each matcher returns calls. */
  const INTENTS = [
    /* ---- timer ---- */
    { re: /^(?:set\s+)?(?:a\s+)?timer\s*(?:for\s+)?([\d.\u4e00-\u9fff\w-]+)?\s*(?:minutes?|mins?|min|\u5206\u9418|\u5206\u949f)?$/i, f: (m) => { const n = numOrWord(m[1]); return n ? [{ tool: 'timer', args: { minutes: n } }] : null; } },
    { re: /^(?:set|start|make|create)\s+(?:a\s+)?(?:countdown\s+)?timer\s+(?:for\s+)?([\d.\u4e00-\u9fff\w-]+)/i, f: (m) => { const n = numOrWord(m[1]); return n ? [{ tool: 'timer', args: { minutes: n } }] : null; } },
    { re: /^([\d.\u4e00-\u9fff\w-]+)\s*(?:minute|min)\s+timer$/i, f: (m) => { const n = numOrWord(m[1]); return n ? [{ tool: 'timer', args: { minutes: n } }] : null; } },
    { re: /^(?:\u5012\u6578|\u8ba1\u65f6\u5668|\u8a08\u6642\u5668)\s*([\d\u4e00-\u9fff]+)\s*(?:\u5206\u9418|\u5206\u949f|\u5206)?$/, f: (m) => { const n = numOrWord(m[1]); return n ? [{ tool: 'timer', args: { minutes: n } }] : null; } },
    { re: /^(?:change|set)\s+(?:the\s+)?timer\s+(?:to|for)\s+([\d.\u4e00-\u9fff\w-]+)/i, f: (m) => { const n = numOrWord(m[1]); return n ? [{ tool: 'timer', args: { minutes: n } }] : null; } },
    { re: /^(?:stop|pause|hold)\s+(?:the\s+)?timer$/i, f: () => [{ tool: 'timerctl', args: { action: 'pause' } }] },
    { re: /^(?:resume|continue|restart)\s+(?:the\s+)?timer$/i, f: () => [{ tool: 'timerctl', args: { action: 'resume' } }] },
    { re: /^(?:reset|cancel|clear)\s+(?:the\s+)?timer$/i, f: () => [{ tool: 'timerctl', args: { action: 'reset' } }] },
    /* ---- stopwatch ---- */
    { re: /^(?:start|new)\s+(?:a\s+)?stopwatch$/i, f: () => [{ tool: 'stopwatch', args: { action: 'new' } }] },
    { re: /^(?:stop|pause)\s+(?:the\s+)?stopwatch$/i, f: () => [{ tool: 'stopwatch', args: { action: 'pause' } }] },
    { re: /^(?:resume|continue)\s+(?:the\s+)?stopwatch$/i, f: () => [{ tool: 'stopwatch', args: { action: 'resume' } }] },
    { re: /^(?:reset|clear)\s+(?:the\s+)?stopwatch$/i, f: () => [{ tool: 'stopwatch', args: { action: 'reset' } }] },
    { re: /^(?:\u79d2\u9336|\u79d2\u8868|\u78c1\u94c1)\s*(?:\u958b\u59cb|\u5f00\u59cb)?$/, f: () => [{ tool: 'stopwatch', args: { action: 'new' } }] },
    /* ---- reminders ---- */
    { re: /^(?:remind me|ping me|reminder)\s+(?:in\s+|after\s+)?([\d.\u4e00-\u9fff\w-]+)\s*(?:minutes?|mins?|min|\u5206\u9418|\u5206\u949f)?$/i, f: (m) => { const n = numOrWord(m[1]); return n ? [{ tool: 'remind', args: { minutes: n } }] : null; } },
    { re: /^(?:\u63d0\u9192\u6211)\s*([\d\u4e00-\u9fff]+)\s*(?:\u5206\u9418|\u5206\u949f|\u5206)?$/, f: (m) => { const n = numOrWord(m[1]); return n ? [{ tool: 'remind', args: { minutes: n } }] : null; } },
    /* ---- zones & clock window ---- */
    { re: /^(?:remove|delete|hide)\s+(?:the\s+)?([\s\S]+?)\s+(?:zone|clock|city)$/i, f: (m) => { const z = cityIn(m[1]); return z ? [{ tool: 'removezone', args: { city: z } }] : null; } },
    { re: /^(?:remove|delete|hide)\s+(?!n\w+\s*$)(?:the\s+)?([A-Za-z\u00c0-\u024f\u4e00-\u9fff][\s\S]*?)\s*$/, f: (m) => { const z = cityIn(m[1]); return z ? [{ tool: 'removezone', args: { city: z } }] : null; } },
    { re: /^(?:add\s+)?(?:the\s+)?(?:city\s+)?(?:of\s+)?([\s\S]+?)\s+(?:as\s+a\s+)?(?:zone|clock|city)$/i, f: (m, q) => /^(remove|delete|hide)/i.test(q) ? null : (() => { const z = cityIn(m[1]); return z ? [{ tool: 'zones', args: { cities: [z] } }] : null; })() },
    { re: /^(?:zone|city|clock)\s+(?:to\s+)?([\s\S]+)$/i, f: (m) => { const z = cityIn(m[1]); if (!z) return null; const single = /single\s+window/i.test(m[1]); return [{ tool: 'zones', args: { cities: [z], ...(single ? { layout: 'single' } : {}) } }]; } },
    /* "time zone window of Jakarta and Taipei, side by side" / "zones A, B, C in 2 by 2" / Spanish form */
    { re: /^(?:set\s+)?(?:time\s*zones?\s+)?(?:window\s+of\s+|zones?\s+to\s+|time\s*zones?\s+to\s+|zones?\s+|zona\s+horaria(?:\s+de)?\s+|zona\s+)([\s\S]+)$/i, f: (m) => {
      const txt = m[1];
      const lay = /side\s*by\s*side|lado\s*a\s*lado|\u4e26\u6392|\u4e26\u5217/i.test(txt) ? 'side'
        : /4\s*(?:x|by)\s*4/i.test(txt) ? '4x4'
        : /2\s*(?:x|by)\s*2|quad/i.test(txt) ? '2x2' : null;
      const zs = findAllZones(txt.toLowerCase());
      if (!zs.length && !lay) return null;
      return [{ tool: 'zones', args: { ...(zs.length ? { cities: zs } : {}), ...(lay ? { layout: lay } : {}) } }];
    } },
    { re: /^\u8996\u7a97\s*(2x2|4x4|\u4e26\u6392)?\s*\uff0c?\s*(?:.*\u6642\u5340\u8a2d\u70ba|.*\u65f6\u533a\u8bbe\u4e3a)\s*(.+)$/, f: (m) => {
      const lay = /4x4/.test(m[1] || '') ? '4x4' : /\u4e26\u6392/.test(m[1] || '') ? 'side' : '2x2';
      const zs = findAllZones(m[2].toLowerCase());
      return zs.length ? [{ tool: 'zones', args: { cities: zs, layout: lay } }] : null;
    } },
    { re: /^(?:add|show|put|include)\s+(.+?)\s+(?:and|,)\s+(.+?)\s+(?:as\s+)?(?:zones|clocks|cities)$/i, f: (m) => { const zs = findAllZones((m[1] + ' ' + m[2]).toLowerCase()); return zs.length ? [{ tool: 'zones', args: { cities: zs } }] : null; } },
    { re: /^(?:\u52a0|\u65b0\u589e|\u52a0\u5165)\s*(.+?)\s*(?:\u6642\u5340|\u57ce\u5e02|\u65f6\u533a)?$/, f: (m, q) => /^(\u79fb\u9664|\u522a\u9664)/.test(q) ? null : (() => { const z = cityIn(m[1]); return z ? [{ tool: 'zones', args: { cities: [z] } }] : null; })() },
    { re: /^(?:\u6642\u5340|\u65f6\u533a|\u57ce\u5e02)\s*(.+)$/, f: (m) => {
      const lay = /\u4e26\u6392|\u4e26\u5217/.test(m[1]) ? 'side' : /2x2|\u56db\u5bab/.test(m[1]) ? '2x2' : null;
      const zs = findAllZones(m[1].toLowerCase());
      return zs.length ? [{ tool: 'zones', args: { cities: zs, ...(lay ? { layout: lay } : {}) } }] : null;
    } },
    { re: /^(?:remove|delete|hide)\s+(?:the\s+)?([\s\S]+?)\s+(?:zone|clock|city)$/i, f: (m) => { const z = cityIn(m[1]); return z ? [{ tool: 'removezone', args: { city: z } }] : null; } },
    { re: /^(?:single|side by side|side-by-side|side|2x2|2 by 2|quad|four|4x4|4 by 4|grid|sixteen)\s*(?:layout|view|grid)?$/i, f: (m) => { const s = m[0].toLowerCase(); const lay = /single/.test(s) ? 'single' : /side/.test(s) ? 'side' : /quad|four|2x2|2 by 2/.test(s) ? '2x2' : '4x4'; return [{ tool: 'zones', args: { layout: lay } }]; } },
    { re: /^(?:remove|delete)\s+(?:the\s+)?(timer|stopwatch)$/i, f: (m) => [{ tool: 'removewin', args: { what: /stop/.test(m[1]) ? 'stopwatch' : 'timer' } }] },
    { re: /^restart\s+(?:the\s+)?(timer|stopwatch)$/i, f: (m) => [{ tool: 'restartwin', args: { what: /stop/.test(m[1]) ? 'stopwatch' : 'timer' } }] },
    /* ---- mode & theme ---- */
    { re: /^(?:analog|analogue|pointer)\s*(?:mode|clock)?$/i, f: () => [{ tool: 'mode', args: { mode: 'analog' } }] },
    { re: /^(?:digital|numbers?)\s*(?:mode|clock)?$/i, f: () => [{ tool: 'mode', args: { mode: 'digital' } }] },
    { re: /^(?:\u6307\u91dd|\u6307\u9488)\s*(?:\u6a21\u5f0f)?$/, f: () => [{ tool: 'mode', args: { mode: 'analog' } }] },
    { re: /^(?:\u6578\u5b57|\u6570\u5b57)\s*(?:\u6a21\u5f0f)?$/, f: () => [{ tool: 'mode', args: { mode: 'digital' } }] },
    { re: /^(?:night|dark)\s*(?:mode|shift|theme)?$/i, f: () => [{ tool: 'theme', args: { mode: 'night' } }] },
    { re: /^(?:light|day)\s*(?:mode|theme)?$/i, f: () => [{ tool: 'theme', args: { mode: 'light' } }] },
    { re: /^make\s+it\s+(dark|light|night)$/i, f: (m) => [{ tool: 'theme', args: { mode: /light/.test(m[1]) ? 'light' : 'night' } }] },
    { re: /too\s+bright|too\s+much\s+light|\u592a\u4eae/i, f: () => [{ tool: 'theme', args: { mode: 'night' } }] },
    { re: /^theme$/i, f: () => (page === 'settings' ? [{ tool: 'theme', args: { mode: 'flip' } }] : null) },
    { re: /too\s+dark|can'?t\s+see\s|\u592a\u6697/i, f: () => [{ tool: 'theme', args: { mode: 'light' } }] },
    { re: /^(?:\u6df1\u8272|\u9ed1\u8272|\u591c\u9593|\u6697\u8272)\s*(?:\u6a21\u5f0f|\u4e3b\u984c)?$/, f: () => [{ tool: 'theme', args: { mode: 'night' } }] },
    { re: /^(?:\u6dfa\u8272|\u767d\u8272|\u767d\u5929|\u4eae\u8272)\s*(?:\u6a21\u5f0f|\u4e3b\u984c)?$/, f: () => [{ tool: 'theme', args: { mode: 'light' } }] },
    /* ---- navigation ---- */
    { re: /^(?:open|go to|goto|show|show me|take me to|visit|switch to|nav(?:igate)? to)\s+(?:the\s+|my\s+)?(.+)$/i, f: (m) => { const app = findApp(m[1]); return app ? [{ tool: 'goto', args: { app } }] : null; } },
    { re: /^(?:\u6253\u958b|\u53bb|\u524d\u5f80|\u5230)\s*(?:\u6211\u7684)?\s*(.+)$/, f: (m) => { const app = findApp(m[1]); return app ? [{ tool: 'goto', args: { app } }] : null; } },
    { re: /^(?:back\s+to|return\s+to)\s+(?:the\s+)?(.+)$/i, f: (m) => { const app = findApp(m[1]); return app ? [{ tool: 'goto', args: { app } }] : null; } },
    /* ---- language / timezone ---- */
    { re: /^(?:speak|switch|change|set)\s+(?:the\s+)?(?:language|lang)\s+to\s+(.+)$/i, f: (m) => [{ tool: 'lang', args: { name: m[1] } }] },
    { re: /^(\u4e2d\u6587|\u82f1\u6587|\u65e5\u672c\u8a9e|\u65e5\u8bed)$/, f: (m) => [{ tool: 'lang', args: { name: m[1] } }] },
    { re: /^(?:set|change)\s+(?:my\s+)?(?:timezone|time zone|tz)\s+to\s+(.+)$/i, f: (m) => { const z = cityIn(m[1]) || matchCity(m[1].trim()); return z ? [{ tool: 'settz', args: { city: z } }] : null; } },
    { re: /^(?:\u6642\u5340|\u65f6\u533a)\s*(?:\u8a2d\u70ba|\u8bbe\u4e3a|\u6539\u6210)\s*(.+)$/, f: (m) => { const z = cityIn(m[1]) || matchCity(m[1].trim()); return z ? [{ tool: 'settz', args: { city: z } }] : null; } },
    /* ---- time questions ---- */
    { re: /^(?:what(?:'s| is)\s+the\s+time|what time is it|time(?: please)?|now)\s*(?:in\s+(.+)|at\s+(.+))?$/i, f: (m) => { const c = m[1] || m[2]; const z = c ? (cityIn(c) || matchCity(c.trim())) : null; return [{ tool: 'time', args: z ? { city: z } : {} }]; } },
    { re: /^(?:what time is it|time)\s+in\s+(.+)$/i, f: (m) => { const z = cityIn(m[1]) || matchCity(m[1].trim()); return [{ tool: 'time', args: z ? { city: z } : {} }]; } },
    { re: /^(?:.+?)\s*(?:\u73fe\u5728)?\s*(?:\u5e7e\u9ede|\u51e0\u70b9\u4e86)\s*(?:\u55ce|\uff1f|\?)?$/, f: (m) => { const z = cityIn(m[0]); return [{ tool: 'time', args: z ? { city: z } : {} }]; } },
    { re: /^(.+)\s+(?:\u5e7e\u9ede|\u65f6\u95f4)$/, f: (m) => { const z = cityIn(m[1]); return [{ tool: 'time', args: z ? { city: z } : {} }]; } },
    /* ---- map ---- */
    { re: /^(?:show|find|locate|where is)\s+(.+?)\s+(?:on\s+(?:the\s+)?map|on a map)$/i, f: (m) => [{ tool: 'showmap', args: { city: m[1] } }] },
    { re: /^map\s+(?:of\s+)?(.+)$/i, f: (m) => [{ tool: 'showmap', args: { city: m[1] } }] },
    { re: /^(.+)\s*(?:\u5728\u54ea\u88e1|\u5728\u54ea\u91cc|\u5730\u5716)$/, f: (m) => [{ tool: 'showmap', args: { city: m[1].replace(/\u5730\u5716$/, '') } }] },
    /* ---- wallet questions (before calc: "What is my balance?" is not math) ---- */
    { re: /^(?:what(?:'s| is| are)?\s+)?(?:my\s+)?balance(?:\s+please)?\??$/i, f: () => [{ tool: 'walletbalance', args: {} }] },
    { re: /^how\s+much\s+have\s+i\s+spent\??$/i, f: () => {
      try {
        const d = JSON.parse(localStorage.getItem('singhoah:wallet') || 'null');
        if (d && Array.isArray(d.tx)) {
          const spent = d.tx.filter((x) => x.type === 'out').reduce((a, x) => a + Number(x.amt || 0), 0);
          const cur = d.cur || '';
          return { calls: [], say: zhUI() ? `\u9019\u500b\u6708\u4f60\u5df2\u7d93\u82b1\u4e86 ${cur}${spent}\u3002` : `You have spent ${cur}${spent} so far.` };
        }
      } catch { /* no ledger yet */ }
      return { calls: [{ tool: 'walletbalance', args: {} }] };
    } },
    /* ---- calculator ----
       questions about fares, routes, balances or times are NOT arithmetic */
    { re: /^(?:what(?:'s| is| are)|what does|calculate|calc|compute|how much is|evaluate|solve)\s+(.+?)\s*(?:\?|=)?$/i, f: (m) => {
      if (/\b(fare|route|balance|ticket)\b/i.test(m[1]) || /\bfrom\b.+\bto\b/i.test(m[1])) return null;
      return [{ tool: 'calc', args: { expr: m[1] } }];
    } },
    { re: /^(multiply|divide|add|subtract)\s+([\d.]+)\s+(?:by|and|from|to|into)\s+([\d.]+)$/i, f: (m) => {
      const op = { multiply: '*', divide: '/', add: '+', subtract: '-' }[m[1].toLowerCase()];
      if (!op) return null;
      /* on the module canvas, arithmetic phrasing builds the real flow */
      if (page === 'module' && globalThis.__MOD) return [{ tool: 'mathflow', args: { a: Number(m[2]), op, b: Number(m[3]) } }];
      return [{ tool: 'calc', args: { expr: `${m[2]} ${op} ${m[3]}` } }];
    } },
    { re: /^([\d\s+\-*/%.(),]+)$/, f: (m) => [{ tool: 'calc', args: { expr: m[1] } }] },
    { re: /^([\d.\u4e00-\u9fff\w-]+)\s+([\d.\u4e00-\u9fff\w-]+)?\s*(plus|minus|times|multiplied\s+by|divided\s+by|over|x)\s+([\d.\u4e00-\u9fff\w-]+)$/i, f: (m) => { const a = numOrWord(m[1]), b = numOrWord(m[4]); const op = MATH_OPS[m[3].replace(/\s+/g, ' ').trim().toLowerCase()] || MATH_OPS[m[3].toLowerCase()]; return (a != null && b != null && op) ? [{ tool: 'calc', args: { expr: `${a} ${op} ${b}` } }] : null; } },
    { re: /^(?:\u8a08\u7b97|\u8ba1\u7b97)\s*(.+)$/, f: (m) => [{ tool: 'calc', args: { expr: m[1] } }] },
    /* ---- wallet ---- */
    { re: /^(?:how much money(?: do i have| have i)?|my balance|balance(?: please)?|wallet balance)$/i, f: () => [{ tool: 'walletbalance', args: {} }] },
    { re: /^(?:i\s+)?(?:received|earned|got|made|income|deposit(?:ed)?)\s+(\d+(?:\.\d+)?)\s*(?:dollars?|nt\$?|usd)?\s*(?:for|from)?\s*(.*)$/i, f: (m) => [{ tool: 'walletadd', args: { type: 'income', amount: Number(m[1]), note: (m[2] || '').trim() } }] },
    { re: /^(?:i\s+)?(?:spent|paid|bought|expense|withdraw(?:n)?)\s+(\d+(?:\.\d+)?)\s*(?:dollars?|nt\$?|usd)?\s*(?:on|for)?\s*(.*)$/i, f: (m) => [{ tool: 'walletadd', args: { type: 'expense', amount: Number(m[1]), note: (m[2] || '').trim() } }] },
    { re: /^(?:add|record|log)\s+(?:an?\s+)?(income|expense|expense)\s+of\s+(\d+(?:\.\d+)?)\s*(?:for|on)\s+(.*)$/i, f: (m) => [{ tool: 'walletadd', args: { type: m[1] === 'income' ? 'income' : 'expense', amount: Number(m[2]), note: (m[3] || '').trim() } }] },
    { re: /^(?:add|record|log)\s+(?:an?\s+)?(income|expense)\s+(\d+(?:\.\d+)?)\s*(.*)$/i, f: (m) => [{ tool: 'walletadd', args: { type: m[1], amount: Number(m[2]), note: (m[3] || '').trim() } }] },
    { re: /^(?:add|record|log)\s+(\d+(?:\.\d+)?)\s+(?:as\s+)?(?:an?\s+)?(income|expense)\s*(?:for|on)?\s*(.*)$/i, f: (m) => [{ tool: 'walletadd', args: { type: m[2] === 'income' ? 'income' : 'expense', amount: Number(m[1]), note: (m[3] || '').trim() } }] },
    { re: /^cash(?:\s+(?:in|as)\s+([a-z]{3}))?$/i, f: (m) => [{ tool: 'cash', args: m[1] ? { currency: m[1].toUpperCase() } : {} }] },
    { re: /^(?:change|switch|set)\s+(?:the\s+)?currency\s+to\s+([a-z]{3})$/i, f: (m) => [{ tool: 'walletcurrency', args: { code: m[1].toUpperCase() } }] },
    { re: /^(?:show|open)\s+(?:the\s+)?(reports?|days?|daily|cash)\s*(?:tab|view)?$/i, f: (m) => { const s = m[1].toLowerCase(); return [{ tool: 'wallettab', args: { tab: /report/.test(s) ? 'reports' : /cash/.test(s) ? 'cash' : 'days' } }]; } },
    { re: /^(?:delete|remove|undo)\s+(?:the\s+)?last\s+(?:transaction|entry|row|expense|income)$/i, f: () => [{ tool: 'walletdeletelast', args: {} }] },
    { re: /^cash\s+(?:drawer\s+)?(?:count\s+)?(\d+(?:\.\d+)?)$/i, f: (m) => [{ tool: 'cash', args: { balance: Number(m[1]) } }] },
    { re: /^(?:\u8a18\u5e33|\u8bb0\u8d26|\u6536\u652f)\s*(?:\u5165\u5e33|\u5165\u8d26|\u6536\u5165)\s*([\d\u4e00-\u9fff]+)\s*(.*)$/, f: (m) => { const n = numOrWord(m[1]); return n != null ? [{ tool: 'walletadd', args: { type: 'income', amount: n, note: m[2] } }] : null; } },
    { re: /^(?:\u8a18\u5e33|\u8bb0\u8d26|\u6536\u652f)\s*(?:\u51fa\u5e33|\u51fa\u8d26|\u652f\u51fa|\u82b1\u8cbb)\s*([\d\u4e00-\u9fff]+)\s*(.*)$/, f: (m) => { const n = numOrWord(m[1]); return n != null ? [{ tool: 'walletadd', args: { type: 'expense', amount: n, note: m[2] } }] : null; } },
    /* ---- metro ---- */
    { re: /^(?:what(?:'s| is)?\s+)?(?:the\s+)?fare\s+from\s+(.+?)\s+to\s+(.+)$/i, f: (m) => [{ tool: 'fare', args: { from: m[1], to: m[2] } }] },
    { re: /^(?:fare|price|ticket|how much)(?:\s+is)?(?:\s+the)?(?:\s+fare)?\s+from\s+(.+?)\s+to\s+(.+)$/i, f: (m) => [{ tool: 'fare', args: { from: m[1], to: m[2] } }] },
    { re: /^(?:route|directions?|how do i get|plan)\s*(?:a\s+route\s*)?from\s+(.+?)\s+to\s+(.+)$/i, f: (m) => [{ tool: 'route', args: { from: m[1], to: m[2] } }] },
    { re: /^from\s+(.+?)\s+to\s+(.+)$/, f: (m) => { const zh = /[\u4e00-\u9fff]/.test(m[1]) || /[\u4e00-\u9fff]/.test(m[2]); return (page === 'metro' || zh || /route|fare|\u6377\u904b|\u6377\u8fd0|\u5730\u9435|\u5730\u94c1/.test(m[0])) ? [{ tool: 'route', args: { from: m[1], to: m[2] } }] : null; } },
    { re: /^(?:\u5f9e|\u4ece)\s*(.+?)\s*(?:\u5230|\u53bb)\s*(.+?)\s*(?:\u8981)?\s*(?:\u591a\u5c11\u9322?|\u591a\u5c11\u94b1?|\u7968\u50f9\u591a\u5c11?|\u7968\u4ef7\u591a\u5c11?|\u7968\u50f9|\u7968\u4ef7)$/, f: (m) => [{ tool: (page === 'metro' ? 'route' : 'fare'), args: { from: m[1], to: m[2] } }] },
    { re: /^(?:\u5f9e|\u4ece)\s*(.+?)\s*(?:\u5230|\u53bb|\u5230)\s*(.+?)(?:\u600e\u9ebc\u8d70|\u600e\u4e48\u8d70|\u8981\u591a\u4e45|\u8981\u591a\u4e45|\u591a\u5c11\u9322|\u591a\u5c11\u94b1)?$/, f: (m) => [{ tool: 'route', args: { from: m[1], to: m[2] } }] },
{ re: /^(.+?)\s*\u5230\s*(.+?)\s*(?:\u7684)?\s*(?:\u7968\u50f9|\u7968\u4ef7|\u8981\u591a\u5c11\u9322|\u591a\u5c11\u9322)\s*(?:\u591a\u5c11)?\s*[\uff1f?]?$\s*/, f: (m) => [{ tool: (page === 'metro' ? 'route' : 'fare'), args: { from: m[1], to: m[2] } }] },
    { re: /^(?:show|switch|use)\s+(?:the\s+)?(?:taipei|trtc|kaohsiung|ks|taichung|tc|taoyuan|ty)\s*(?:metro|system|mrt)?$/i, f: (m) => { const s = m[0].toLowerCase(); const sys = /kaohsiung|ks/.test(s) ? 'KS' : /taichung|tc/.test(s) ? 'TC' : /taoyuan|ty/.test(s) ? 'TY' : 'TRTC'; return [{ tool: 'metrosys', args: { sys } }]; } },
    { re: /^(?:\u53f0\u5317|\u53f0\u4e2d|\u53f0\u5357|\u9ad8\u96c4|\u6843\u5712)\s*(?:\u6377\u904b|\u6377\u8fd0)$/, f: (m) => { const sys = /\u53f0\u4e2d/.test(m[0]) ? 'TC' : /\u9ad8\u96c4/.test(m[0]) ? 'KS' : /\u6843\u5712/.test(m[0]) ? 'TY' : 'TRTC'; return [{ tool: 'metrosys', args: { sys } }]; } },
    { re: /^zoom\s+(in|out|reset)$/i, f: (m) => [{ tool: 'metrozoom', args: { dir: m[1].toLowerCase() } }] },
    { re: /^(?:swap|reverse)(?:\s+(?:the\s+)?(?:route|direction|stations?))?$/i, f: () => (page === 'metro' ? [{ tool: 'metroswap', args: {} }] : null) },
    { re: /^(?:clear|empty)\s+(?:the\s+)?(?:everything|all|document|doc|note)$/i, f: () => [{ tool: (page === 'scribe' ? 'click' : page === 'module' ? 'modclear' : 'clearclock'), args: page === 'scribe' ? { id: 'scrClear' } : {} }] },
    { re: /^(?:clear|empty)$/i, f: () => (page === 'scribe' ? [{ tool: 'click', args: { id: 'scrClear' } }] : null) },
    { re: /^undo$/i, f: () => (page === 'scribe' ? [{ tool: 'click', args: { id: 'scrUndo' } }] : null) },
    { re: /^redo$/i, f: () => (page === 'scribe' ? [{ tool: 'click', args: { id: 'scrRedo' } }] : null) },
    { re: /^\u5168\u90e8\u6e05\u9664$|^\u6e05\u9664\u5168\u90e8$|^\u6e05\u9664$/, f: () => [{ tool: (page === 'module' ? 'modclear' : 'clearclock'), args: {} }] },
    { re: /^clear\s+(?:the\s+)?route$/i, f: () => [{ tool: 'metroclear', args: {} }] },
    { re: /^(?:metro\s+)?card\s+(?:balance\s*)?(\d+(?:\.\d+)?)$/i, f: (m) => [{ tool: 'metrocard', args: { balance: m[1] } }] },
    /* ---- scribe ---- */
    { re: /^(?:new|create|start)\s+(?:a\s+)?(?:note|document|doc|file|writing)$/i, f: () => [{ tool: 'scribenew', args: {} }] },
    { re: /^(?:show|list|open)\s+(?:my\s+)?(?:files|notes|documents|docs)$/i, f: () => [{ tool: 'scribefiles', args: {} }] },
    { re: /^(?:\u65b0\u589e|\u5efa\u7acb)\s*(?:\u7b46\u8a18|\u7b14\u8bb0|\u6587\u4ef6|\u6587\u7ae0)$/, f: () => [{ tool: 'scribenew', args: {} }] },
    { re: /^(?:\u6211\u7684)?\s*(?:\u6a94\u6848|\u6587\u4ef6|\u7b46\u8a18)$/, f: () => [{ tool: 'scribefiles', args: {} }] },
    /* ---- module / flows ---- */
    { re: /^(?:add|create|new)\s+(?:an?\s+)?(number|text|boolean|operator|comparator|io|code)\s*(?:node|block|box)?$/i, f: (m) => [{ tool: 'modadd', args: { type: m[1].toLowerCase() } }] },
    { re: /^add\s+a\s+number\s+(\d+)(?:\s+base\s+(\d+))?$/i, f: (m) => {
      const cfg = { numtype: 'int', base: 10, value: m[1] };
      if (m[2]) { cfg.base = Number(m[2]); cfg.value = Number(m[1]).toString(Number(m[2])); }
      return [{ tool: 'modadd', args: { type: 'number', cfg } }];
    } },
    { re: /^(?:add|create)\s+(?:an?\s+)?(number|text|boolean)\s*(?:node|block)?\s+(?:with\s+(?:value|text)\s+)?(.+)$/i, f: (m) => { const v = m[2].replace(/^["']|["']$/g, ''); const cfg = m[1].toLowerCase() === 'number' ? { value: numOrWord(v) ?? v } : m[1].toLowerCase() === 'boolean' ? { val: /^(true|on|1|yes)$/i.test(v) } : { text: v }; return [{ tool: 'modadd', args: { type: m[1].toLowerCase(), cfg } }]; } },
    { re: /^(?:set|change)\s+(n\w+)\s+to\s+(.+)$/i, f: (m) => [{ tool: 'modcfg', args: { id: m[1], patch: { value: numOrWord(m[2]) ?? m[2].replace(/^["']|["']$/g, '') } } }] },
    { re: /^wire\s+(n\w+)\s+to\s+(n\w+)(?:\s+port\s+([ab]))?$/i, f: (m) => [{ tool: 'modwire', args: { from: m[1], to: m[2], port: (m[3] || 'a').toLowerCase() } }] },
    { re: /^(?:remove|delete)\s+(n\w+)$/i, f: (m) => [{ tool: 'modremove', args: { id: m[1] } }] },
    { re: /^(?:run|execute|start)\s+(?:the\s+)?flow$/i, f: () => [{ tool: 'modrun', args: {} }] },
    { re: /^run$/i, f: () => (page === 'module' ? [{ tool: 'modrun', args: {} }] : null) },
    { re: /^(?:clear|empty)\s+(?:the\s+)?(?:flow|canvas)$/i, f: () => [{ tool: 'modclear', args: {} }] },
    { re: /^(?:new|blank)\s+(?:flow|module)$/i, f: () => [{ tool: 'modnew', args: {} }] },
    { re: /^(?:show|list|open)\s+(?:my\s+)?(?:flows?|module files)$/i, f: () => [{ tool: 'modfiles', args: {} }] },
    { re: /^(?:build|make|create)\s+(?:a\s+)?flow\s+(?:that\s+)?(?:adds?|plus|subtracts?|minus|multiplies?|times|divides?)\s+([\d.\u4e00-\u9fff\w-]+)\s+(?:and|by)\s+([\d.\u4e00-\u9fff\w-]+)/i, f: (m) => { const a = numOrWord(m[1]), b = numOrWord(m[2]); const op = /subtract|minus/i.test(m[0]) ? '-' : /multipl|times/i.test(m[0]) ? '*' : /divid/i.test(m[0]) ? '/' : '+'; return (a != null && b != null) ? [{ tool: 'mathflow', args: { a, op, b } }] : null; } },
    { re: /^(?:build|make|create)\s+(?:a\s+)?flow\s+(?:that\s+)?(?:checks?|compares?|is)\s+([\d.\u4e00-\u9fff\w-]+)\s+(greater|less|equal(?:s)?)\s+(?:than\s+|to\s+)?([\d.\u4e00-\u9fff\w-]+)/i, f: (m) => { const a = numOrWord(m[1]), b = numOrWord(m[4]); const cmp = CMPS[m[2].toLowerCase()]; return (a != null && b != null && cmp) ? [{ tool: 'cmpflow', args: { a, cmp, b } }] : null; } },
    { re: /^(?:is|are)\s+([\d.\u4e00-\u9fff\w-]+)\s+(greater|less|equal(?:s)?|more|fewer|same(?:\s+as)?)\s*(?:than\s+|to\s+|as\s+)?([\d.\u4e00-\u9fff\w-]+)/i, f: (m) => { const a = numOrWord(m[1]), b = numOrWord(m[3]); const cmp = CMPS[m[2].toLowerCase().split(' ')[0]]; return (a != null && b != null && cmp) ? [{ tool: 'cmpflow', args: { a, cmp, b } }] : null; } },
    { re: /^(?:build|make|create)\s+(?:a\s+)?(?:logic\s+)?flow\s+(?:that\s+)?(?:does\s+)?(?:an?\s+)?(and|or|not|xor|nand|nor)\s+(?:of\s+)?(true|false|on|off|1|0)?\s*(?:and|with)?\s*(true|false|on|off|1|0)?$/i, f: (m) => { const gate = m[1].toLowerCase(); const bv = (x) => x == null ? null : /^(true|on|1)$/i.test(x); return [{ tool: 'logicflow', args: { gate, a: bv(m[2]) ?? true, b: bv(m[3]) ?? true } }]; } },
    { re: /^add\s+(?:a|an)\s+logic\s+(and|or|not|xor|nand|nor)$/i, f: (m) => [{ tool: 'logicflow', args: { gate: m[1].toLowerCase(), a: true, b: true } }] },
    { re: /^(true|false|on|off)\s+(and|or|xor)\s+(true|false|on|off)$/i, f: (m) => [{ tool: 'logicflow', args: { gate: m[2].toLowerCase(), a: /^(true|on)$/i.test(m[1]), b: /^(true|on)$/i.test(m[3]) } }] },
    { re: /^add\s+an?\s+operator\s+([^\s]+)$/i, f: (m) => { const oid = OPID[m[1].toLowerCase()]; return oid ? [{ tool: 'modadd', args: { type: 'operator', cfg: { op: oid } } }] : null; } },
    { re: /^add\s+an?\s+comparator\s*(>=|<=|==|!=|>|<|=|\u2265|\u2264|\u2260)?\s*$/i, f: (m) => { const cid2 = CMPID[(m[1] || '>').toLowerCase()]; return cid2 ? [{ tool: 'modadd', args: { type: 'comparator', cfg: { cmp: cid2 } } }] : null; } },
    { re: /^compare\s+(-?[\d.]+)\s+(?:and|to|with)\s+(-?[\d.]+)(?:\s*,?\s*which\s+is\s+(?:greater\s+or\s+equal|less\s+or\s+equal|greater|less|equal))?\s*$/i, f: (m, q2) => {
      let cmp = '=';
      if (/greater\s+or\s+equal/i.test(q2)) cmp = '>='; else if (/less\s+or\s+equal/i.test(q2)) cmp = '<=';
      else if (/greater/i.test(q2) && !/or\s+equal/i.test(q2)) cmp = '>';
      else if (/\bless\b/i.test(q2) && !/or\s+equal/i.test(q2)) cmp = '<';
      return [{ tool: 'cmpflow', args: { a: m[1], b: m[2], cmp } }];
    } },

    /* ---- generic device / app actions ---- */
    { re: /^(?:go\s+)?fullscreen$/i, f: () => [{ tool: 'fullscreen', args: {} }] },
    { re: /^resync$/i, f: () => [{ tool: 'resync', args: {} }] },
    { re: /^(?:welcome|show welcome)$/i, f: () => [{ tool: 'welcome', args: {} }] },
    { re: /^(?:print|print this page)$/i, f: () => [{ tool: 'printpage', args: {} }] },
    { re: /^(?:reset|wipe|clear)\s+(?:my\s+)?(?:data|everything)$/i, f: () => [{ tool: 'resetdata', args: {} }] },
    { re: /^(?:what|which)\s+(?:is\s+)?my\s+ip\b.*$/i, f: () => [{ tool: 'ip', args: {} }] },
    { re: /^clear\s+(?:the\s+)?chat(?:history)?$/i, f: () => [{ tool: 'clearchat', args: {} }] },
    { re: /^(?:clear|reset)\s+(?:the\s+)?clock(?:\s+window)?$/i, f: () => [{ tool: 'clearclock', args: {} }] },
    /* ---- generic UI actions: any visible control by name ---- */
    { re: /^(?:click|press|tap|hit|toggle)\s+(?:the\s+|a\s+)?(.+)$/i, f: (m) => { const el = elByName(m[1]); return el ? [{ tool: 'click', args: { ref: el.ref } }] : null; } },
    { re: /^(?:\u9ede|\u70b9|\u6309)\s*(?:\u4e00\u4e0b)?\s*(.+)$/, f: (m) => { const el = elByName(m[1]); return el ? [{ tool: 'click', args: { ref: el.ref } }] : null; } },
    { re: /^(?:type|write|enter|fill|set|input)\s+(?:the\s+)?(.+?)\s+(?:to|as|with|=|:)\s+(.+)$/i, f: (m) => { const el = elByName(m[1]); return el ? [{ tool: 'fill', args: { ref: el.ref, value: m[2].replace(/^["']|["']$/g, '') } }] : null; } },
    { re: /^(?:type|write)\s+(.+?)\s+(?:into|in|in the|into the)\s+(?:the\s+)?(.+)$/i, f: (m) => { const el = elByName(m[2]); return el ? [{ tool: 'fill', args: { ref: el.ref, value: m[1].replace(/^["']|["']$/g, '') } }] : null; } },
    { re: /^(?:\u8f38\u5165|\u8f93\u5165)\s*(.+?)\s*(?:\u5230|\u9032\u5165)?\s*(.+)$/, f: (m) => { const el = elByName(m[2]); return el ? [{ tool: 'fill', args: { ref: el.ref, value: m[1] } }] : null; } },
    { re: /^(?:pick|choose|select)\s+(.+?)\s+(?:in|from|on)\s+(?:the\s+)?(.+)$/i, f: (m) => { const el = elByName(m[2]); return el ? [{ tool: 'pick', args: { ref: el.ref, option: m[1] } }] : null; } },
    { re: /^(?:pick|choose|select)\s+(.+)$/i, f: (m) => { const el = elByName(m[1]); return el ? [{ tool: 'pick', args: { ref: el.ref } }] : null; } },
    { re: /^(?:read|what does|what's on|check)\s+(?:the\s+)?(.+?)(?:\s+say)?\s*(?:\?|field|box|value)?$/i, f: (m) => { const el = elByName(m[1]); return el ? [{ tool: 'read', args: { ref: el.ref } }] : null; } },
    { re: /^press\s+(enter|tab|escape|esc|space|delete|backspace|arrow(?:\s+up|down|left|right)?)$/i, f: (m) => [{ tool: 'press', args: { key: m[1] } }] },
    /* ---- the crown jewel: "change X to Y" resolves by context ---- */
    { re: /^(?:change|make|set)\s+(?:the\s+)?(.+?)\s+(?:to|into)\s+(.+)$/i, f: (m, raw) => {
      const tgt = m[1].toLowerCase();
      const val = m[2].replace(/^["']|["']$/g, '');
      if (/timer|countdown/.test(tgt)) { const n = numOrWord(val); return n ? [{ tool: 'timer', args: { minutes: n } }] : null; }
      if (/title|name/.test(tgt)) {
        if (page === 'module' && $('modTitle')) return [{ tool: 'fill', args: { id: 'modTitle', value: val } }];
        const el = elByName('title') || elByName('name');
        return el ? [{ tool: 'fill', args: { ref: el.ref, value: val } }] : null;
      }
      if (/^\d+(\.\d+)?$/.test(val)) {
        /* a number target on the module canvas: find the node holding this value */
        if (page === 'module' && globalThis.__MOD) {
          const M = globalThis.__MOD;
          const num = numOrWord(tgt);
          if (num != null) {
            const f2 = M.nodes().find((n) => n.cfg && String(n.cfg.value) === String(num));
            if (f2) return [{ tool: 'modcfg', args: { id: f2.id, patch: { value: String(numOrWord(val)) } } }, { tool: 'modrun', args: {} }];
          }
          const el = elByName(tgt);
          if (el) return [{ tool: 'fill', args: { ref: el.ref, value: val } }];
        }
      }
      const el = elByName(tgt);
      return el ? [{ tool: 'fill', args: { ref: el.ref, value: val } }] : null;
    } },
  ];

  /* small talk + capability card, in the app's language where we have it */
  const zhUI = () => /^zh/i.test(langOf(curLang).locale);
  const CHAT = {
    hi: () => zhUI() ? '\u4f60\u597d\uff01\u6211\u662f SMate\uff0c\u968f\u6642\u5e6b\u4f60\u64cd\u4f5c\u9019\u500b\u7db2\u7ad9\u3002' : 'Hello! I am SMate — I can run anything on this site for you.',
    hello: () => CHAT.hi(),
    hey: () => CHAT.hi(),
    thanks: () => zhUI() ? '\u4e0d\u5ba2\u6c23\uff01' : 'You are welcome!',
    'thank you': () => CHAT.thanks(),
    bye: () => zhUI() ? '\u518d\u898b\uff01' : 'See you!',
    'why is the sky blue': () => 'The sky looks blue because air scatters short blue wavelengths of sunlight far more than red \u2014 Rayleigh scattering.',
    'hey smate': () => 'I can drive the whole Singhoah app for you \u2014 timers, windows, the wallet, metro fares, module flows, Scribe notes and settings.',
    'smate': () => CHAT['hey smate'](),
  };
  const SUGGEST_POOL = ['timer 5', 'stop the timer', 'start a stopwatch', 'remind me in 10 minutes', 'what time is it in Singapore', 'zone tokyo', '2x2 layout', 'remove the london zone', 'night shift', 'make it light', 'analog mode', 'map jakarta', 'open the wallet', 'how much money do I have', 'I spent 120 on lunch', 'currency USD', 'show the cash tab', 'delete the last transaction', 'fare from Taipei Main Station to Ximen', 'route from Ximen to Chiang Kai-shek Memorial Hall', 'zoom in', 'new note', 'show my files', 'add a number node', 'wire n1 to n2', 'set n1 to 7', 'run the flow', 'clear the flow', 'what is 25 * 4', "what's 15% of 80", 'change the timer to 10', 'change the title to Demo', 'set the language to Japanese', 'set my timezone to Tokyo', 'fullscreen', 'print', 'clear the chat'];

  /* the interpreter: text -> tool calls (or a spoken answer). Deterministic,
     instant, and honest about what it does not understand */
  function interpret(raw) {
    let q = String(raw || '').trim().replace(/\u3000/g, ' ');
    q = q.replace(/[?!.\uff1f\uff01\u3002]+$/g, '').trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    /* chat + capability card first (exact small talk) */
    const chat = CHAT[lower];
    if (chat) return { calls: [], say: chat() };
    if (/^(?:what can you do|help|commands|\u5e6b\u52a9|\u5e2e\u52a9|\u4f60\u6703\u4ec0\u9ebc|\u4f60\u4f1a\u4ec0\u4e48)/i.test(q)) {
      return { calls: [], say: (zhUI() ? '\u6211\u80fd\u66ff\u4f60\u64cd\u4f5c\u6574\u500b\u7db2\u7ad9\uff1a' : 'I can run the whole site for you: ') + SUGGEST_POOL.slice(0, 12).join(' \u00b7 ') };
    }
    for (const it of INTENTS) {
      const m = q.match(it.re);
      if (m) {
        const out = it.f(m, q);
        if (out) {
          const calls = Array.isArray(out) ? out : (out.calls || []);
          if (calls.length || out.say != null) return { calls, say: Array.isArray(out) ? undefined : out.say };
        }
      }
    }
    /* multi-step: "then" / "and then" / "and" — only when the whole phrase
       matches nothing, and only when EVERY half is a real intent */
    const splits = [/\s+and\s+then\s+/i, /\s+then\s+/i, /\s+and\s+/i, /\s*,\s*/];
    for (const sp of splits) {
      const parts = q.split(sp).filter(Boolean).map((p) => p.replace(/^and\s+/i, '').trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const ivs = parts.map((p) => interpret(p));
      if (ivs.every((iv) => iv && iv.calls && iv.calls.length)) {
        const calls = [];
        for (const iv of ivs) { calls.push(...iv.calls); }
        return { calls };
      }
    }
    return interpretFallback(q);
  }
  try { globalThis.__SMATE_INTERPRET = interpret; } catch { /* diagnostics hook */ }
  function interpretFallback(q) {
    /* honest refusal + the closest commands we know, by word overlap */
    const toks = new Set(q.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    const scored = SUGGEST_POOL.map((s) => {
      const st = new Set(s.toLowerCase().split(/\s+/));
      let n = 0; for (const w of toks) if (st.has(w)) n += 1;
      return { s, n };
    }).sort((a, b) => b.n - a.n).slice(0, 3).filter((x) => x.n > 0);
    const loc = langOf(curLang).locale;
    const head = zhUI() ? '\u9019\u500b\u6211\u9084\u807d\u4e0d\u61c2\u3002\u4f60\u53ef\u4ee5\u8a66\u8a66\uff1a' : /^en/i.test(loc) ? "I didn't catch that. Try:" : t(curLang, 'smateUnknown') + ' ';
    const sug = (scored.length ? scored.map((x) => x.s) : ['timer 5', 'open the wallet', 'what time is it in Singapore']).join(' \u00b7 ');
    return { calls: [], say: `${head} ${sug}` };
  }

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
        /* the interpreter is instant: parse, act, answer — in this tick */
        /* case-preserving brand fixes: user capitalisation must survive into fill values */
        const fixed = LIB.brandFix ? LIB.brandFix(raw, true) : raw;
        const iv = interpret(fixed);
        if (iv) {
          let last = '';
          for (const c of iv.calls) {
            let r;
            try { r = await TOOLS[c.tool](c.args || {}); } catch { r = 'error'; }
            if (r && typeof r === 'object' && r.nav) { last = r.say; break; }   /* navigation ends the turn */
            if (typeof r === 'string' && r) last = r;
          }
          out = (iv.say != null && iv.say !== '') ? iv.say : (last || null);
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
  /* the chip: the interpreter is always on — no load, no state machine,
     no model. It reads as what it is: SMate, ready */
  {
    const aiBtn = $('smateAI');
    if (aiBtn) {
      aiBtn.setAttribute('aria-pressed', 'true');
      aiBtn.classList.remove('loading', 'err');
      aiBtn.textContent = 'SMate';
      aiBtn.addEventListener('click', () => { if (!pop.classList.contains('open')) { pop.classList.add('open'); } input.focus(); });
    }
  }

})();