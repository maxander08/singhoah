/* SMate — the Singho assistant. A floating chat that understands commands
   typed in any of the ten Singho languages and drives the page through its
   real controls (the same code paths a click uses). Fully offline. */
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
  const wrap = document.createElement('div');
  wrap.className = 'smate-wrap';
  wrap.innerHTML = `
    <div class="smate-pop" id="smatePop" hidden role="dialog" aria-label="SMate">
      <div class="smate-head"><strong>SMate</strong>
        <button type="button" class="btn smate-x" id="smateX" aria-label="×">×</button></div>
      <div class="smate-msgs" id="smateMsgs"></div>
      <form class="smate-inrow" id="smateForm">
        <input id="smateIn" type="text" autocomplete="off" aria-label="SMate">
        <button type="submit" class="btn smate-send" id="smateSend" aria-label="➤">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11.5 21 3l-8.5 18-2.4-7.1L3 11.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        </button>
      </form>
    </div>
    <button type="button" class="btn smate-btn" id="smateBtn" aria-haspopup="dialog" aria-expanded="false">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
      <span>SMate</span>
    </button>`;
  document.body.appendChild(wrap);
  const pop = $('smatePop'), msgs = $('smateMsgs'), input = $('smateIn'), btn = $('smateBtn');

  function chrome() {
    btn.title = t(curLang, 'smateTip');
    btn.setAttribute('aria-label', t(curLang, 'smateTip'));
    $('smateSend').title = t(curLang, 'smateSend');
    $('smateSend').setAttribute('aria-label', t(curLang, 'smateSend'));
    $('smateX').title = t(curLang, 'clear');
    input.placeholder = t(curLang, 'smatePh');
    input.setAttribute('aria-label', t(curLang, 'smateTip'));
  }
  chrome();
  document.addEventListener('singhoah:lang', () => {
    try { curLang = localStorage.getItem('singhoah:lang') || curLang; } catch { /* ignore */ }
    chrome();
  });

  function say(text, me = false) {
    const p = document.createElement('p');
    p.className = me ? 'smate-me' : 'smate-it';
    p.textContent = text;
    msgs.appendChild(p);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function toggle(open) {
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!msgs.children.length) say(t(curLang, 'smateHi'));
      input.focus();
    }
  }
  btn.addEventListener('click', () => toggle(pop.hidden));
  $('smateX').addEventListener('click', () => toggle(false));

  /* ---------------- the interpreter ---------------- */

  /* every word the app itself shows, grouped per intent, across all langs */
  const words = (keys) => {
    const set = new Set();
    for (const L of LANGS) for (const k of keys) {
      const v = (STRINGS[L.id] || {})[k];
      if (v) set.add(v.toLowerCase());
    }
    return [...set];
  };
  const KW = {
    timer: [...words(['timer']), 'timer', 'temporizador'],
    stopwatch: words(['stopwatch']),
    start: [...words(['start']), 'go'],
    pause: words(['pause']),
    resume: words(['resume']),
    reset: [...words(['reset']), '↺'],
    minutes: [...words(['minutes']), 'min', 'mins', '分'],
    analog: words(['analog']),
    digital: words(['digital']),
    single: words(['single']),
    side: [...words(['side']), 'side', '並排', 'lado', 'côte'],
    quad: [...words(['quad']), '2x2', '2 × 2', 'quad'],
    map: words(['map']),
    resync: [...words(['resync']), 'sync'],
    full: words(['full']),
    night: [...words(['night']), 'dark'],
    light: [...words(['light']), 'day'],
    lang: [...words(['language']), 'language', 'lang'],
    tz: [...words(['tzTitle', 'homeCity']), 'zone', 'timezone', 'tz', '時區'],
    wallet: words(['wallet']),
    clock: [...words(['lpClock']), 'clock'],
    settings: words(['settings']),
    scribe: [...words(['lpScribe']), 'scribe'],
    launch: words(['launchpad']),
    expense: words(['walExpense']),
    income: words(['walIncome']),
    balance: words(['walBalance']),
    days: words(['walDays']),
    reports: words(['walReports']),
    currency: [...words(['currency']), 'currency'],
    add: [...words(['walAdd']), 'add', 'add'],
    help: ['help', '？', '?', '幫助', '説明', 'ayuda', 'aide', 'مساعدة', 'সাহায্য', 'помощь', 'ajuda', 'مدد'],
  };
  const OPEN_VERBS = ['open', 'go to', 'goto', 'show', 'open', '打开', '開啟', '開', '去', 'खोलें',
    'abrir', 'ir a', 'ouvrir', 'aller à', 'افتح', 'اذهب إلى', 'খুলুন', 'открыть', 'открой', 'перейти',
    'abrir', 'ir para', 'کھولیں', 'open'];
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
  const has = (text, list) => list.some((w) => text.includes(w));
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
    const t2 = text.toLowerCase();
    const m = t2.match(/\b([a-z]{3})\b/);
    if (m && CURRENCIES.some((c) => c.code === m[1].toUpperCase())) return m[1].toUpperCase();
    for (const c of CURRENCIES) {
      if (t2.includes(c.code.toLowerCase())) return c.code;
      if (t2.includes(` ${c.code.toLowerCase()}`)) return c.code;
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
      if (has(w, KW.pause) || has(w, KW.reset)) {
        if (!cells.length) return null;
        cells.forEach((c) => toggleCell(c, false));
        return t(curLang, 'done');
      }
      if (has(w, KW.start) || has(w, KW.resume)) {
        if (!cells.length) { click($('timerStart')); const c = document.querySelector('.cell.timer'); if (c) c.dataset.smateRun = '1'; }
        else cells.forEach((c) => toggleCell(c, true));
        return t(curLang, 'done');
      }
      return null;
    },
    stopwatch(w) {
      if (has(w, KW.reset)) {
        const r = document.querySelector('.cell.stop .cap-reset');
        if (r) { r.click(); return t(curLang, 'done'); }
        return null;
      }
      if (has(w, KW.pause) || has(w, KW.start) || has(w, KW.resume)) {
        let cell = document.querySelector('.cell.stop');
        if (!cell) { click($('btnStop')); cell = document.querySelector('.cell.stop'); if (cell) cell.dataset.smateRun = '1'; }
        if (!cell) return null;
        toggleCell(cell, has(w, KW.start) || has(w, KW.resume));
        return t(curLang, 'done');
      }
      if (!document.querySelector('.cell.stop')) { click($('btnStop')); const c = document.querySelector('.cell.stop'); if (c) c.dataset.smateRun = '1'; }
      return t(curLang, 'done');
    },
    nav(where) {
      const map = { wallet: 'wallet.html', clock: 'index.html', settings: 'settings.html', scribe: 'scribe.html', launch: 'launch.html' };
      const target = map[where];
      if (!target) return null;
      if (target === `${page}.html` || (page === 'clock' && where === 'clock')) return t(curLang, 'done');
      setTimeout(() => { location.href = target; }, 350);
      return `→ ${where === 'wallet' ? t(curLang, 'wallet') : where === 'settings' ? t(curLang, 'settings') : where === 'scribe' ? t(curLang, 'lpScribe') : where === 'launch' ? t(curLang, 'launchpad') : t(curLang, 'lpClock')}`;
    },
    walletAdd(text, type) {
      const amt = num(text);
      if (amt == null) return null;
      if (page !== 'wallet') { act.nav('wallet'); return t(curLang, 'wallet'); }
      click(type === 'in' ? $('walTypeIn') : $('walTypeOut'));
      $('walAmt').value = String(amt);
      const note = text.replace(/[\d.,]+/g, '').trim();
      if ($('walNote')) $('walNote').value = note.slice(0, 40);
      $('walAddBtn').click();
      return `${t(curLang, 'done')} · ${$('walBal').textContent}`;
    },
    walletCur(code) {
      if (page !== 'wallet') return null;
      click($('walCurBtn'));
      const s = $('curSearch');
      s.value = code;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      const row = document.querySelector('#curList .cur-row:not([hidden])');
      if (row) { row.click(); return `${t(curLang, 'done')} · ${code}`; }
      return null;
    },
    scribeCtl(w) {
      if (has(w, KW.start)) return click($('scrMic')) ? t(curLang, 'done') : null;
      if (has(w, KW.pause) || has(w, KW.reset)) return click($('scrMic')) ? t(curLang, 'done') : null;
      return null;
    },
  };

  function helpText() {
    const bits = [t(curLang, 'timer'), t(curLang, 'stopwatch'), t(curLang, 'tzTitle'),
      t(curLang, 'language'), t(curLang, 'analog') + '/' + t(curLang, 'digital'),
      t(curLang, 'winTitle'), t(curLang, 'map'), t(curLang, 'resync'), t(curLang, 'full'),
      t(curLang, 'wallet'), t(curLang, 'lpScribe'), t(curLang, 'settings')];
    return `SMate · ${bits.join(' · ')}`;
  }

  function run(raw) {
    const text = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    /* 1 help */
    if (has(text, KW.help)) return helpText();
    /* 2 language */
    const lg = findLang(text);
    if (lg && (has(text, KW.lang) || (LANG_NAMES[lg] || []).some((n) => text.includes(n.toLowerCase())) || text.includes(LANGS.find((l) => l.id === lg).name.toLowerCase()))) {
      return setLang(lg) ? `${t(curLang, 'language')}: ${langOf(lg).name}` : null;
    }
    /* 3 timer with number */
    if (has(text, KW.timer) && num(text) != null) return act.timerSet(num(text));
    /* 4 timer control */
    if (has(text, KW.timer) && (has(text, KW.start) || has(text, KW.pause) || has(text, KW.resume) || has(text, KW.reset))) return act.timerCtl(text);
    if (has(text, KW.timer) && page === 'clock') return act.timerCtl(text + ' start');
    /* 5 stopwatch */
    if (has(text, KW.stopwatch)) return act.stopwatch(text);
    /* 6 display mode */
    if (has(text, KW.analog) || has(text, KW.digital)) {
      const b = $('btnMode');
      if (b) { const wantAnalog = has(text, KW.analog); const isAnalog = b.getAttribute('aria-pressed') === 'true'; if (wantAnalog !== isAnalog) b.click(); return t(curLang, 'done'); }
      return null;
    }
    /* 7 layout */
    if (has(text, KW.quad)) return click(document.querySelector('.lay-btn[data-layout="4"]')) ? t(curLang, 'done') : null;
    if (has(text, KW.side)) return click(document.querySelector('.lay-btn[data-layout="2"]')) ? t(curLang, 'done') : null;
    if (has(text, KW.single)) return click(document.querySelector('.lay-btn[data-layout="1"]')) ? t(curLang, 'done') : null;
    /* 8 resync / full / map / night */
    if (has(text, KW.resync)) return click($('btnSync')) ? t(curLang, 'done') : null;
    if (has(text, KW.full)) return click($('btnFull')) ? t(curLang, 'done') : null;
    if (has(text, KW.map)) return click($('btnMap')) ? t(curLang, 'done') : null;
    if (has(text, KW.night) || has(text, KW.light)) {
      const b = $('btnNight');
      if (b) {
        const dark = document.documentElement.classList.contains('dark');
        const wantDark = has(text, KW.night);
        if (wantDark !== dark) b.click();
        return t(curLang, 'done');
      }
      return null;
    }
    /* 9 wallet intents (on wallet) / wallet add anywhere */
    if (has(text, KW.income) && num(text) != null) return act.walletAdd(text, 'in');
    if (has(text, KW.expense) && num(text) != null) return act.walletAdd(text, 'out');
    if (page === 'wallet') {
      if (has(text, KW.balance)) return $('walBal').textContent;
      if (has(text, KW.reports)) return click($('walTabR')) ? t(curLang, 'done') : null;
      if (has(text, KW.days)) return click($('walTabD')) ? t(curLang, 'done') : null;
      const cur = findCurrency(text);
      if (cur && (has(text, KW.currency) || /\b[a-z]{3}\b/.test(text))) return act.walletCur(cur);
    }
    /* 10 time zone */
    const z = findZone(text);
    if (z && (has(text, KW.tz) || has(text, OPEN_VERBS) || text.split(' ').length <= 3)) {
      return setTz(z) ? `${t(curLang, 'tzTitle')}: ${cityOf(z)}` : null;
    }
    /* 11 scribe controls */
    if (page === 'scribe' && (has(text, KW.start) || has(text, KW.pause))) return act.scribeCtl(text);
    /* 12 navigation */
    for (const [where, keys] of [['wallet', KW.wallet], ['settings', KW.settings], ['scribe', KW.scribe], ['launch', KW.launch], ['clock', KW.clock]]) {
      if (has(text, keys)) return act.nav(where);
    }
    return null;
  }

  $('smateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    say(raw, true);
    input.value = '';
    const out = run(raw);
    say(out || t(curLang, 'smateUnknown'));
  });
})();
