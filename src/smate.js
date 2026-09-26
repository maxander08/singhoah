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
  btn.addEventListener('click', () => toggle(pop.hidden));
  $('smateX').addEventListener('click', () => toggle(false));
  /* conversation continues across pages and reloads */
  for (const m of LOG) {
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
    grid16: [...words(['grid16']), '4x4', '4×4'],
    clearAll: [...words(['clearAll']), 'clear all', 'clear-all', 'reset window', '全部清除'],
    timeQ: ['what time', 'time in', 'current time', 'how late', '幾點', '几点', 'क्या बजा', 'कितने बजे', 'qué hora', 'hora en', 'quelle heure', 'heure à', 'كم الساعة', 'কটা বাজে', 'который час', 'сколько времени', 'время в', 'que horas', 'hora em', 'کتنا بجہ'],
    remind: ['remind', 'reminder', '提醒', 'याद दिला', 'recuérdame', 'recuerdame', 'rappelle', 'ذكرني', 'মনে করিয়ে', 'напомни', 'lembre', 'یاد دہانی'],
    clearChat: [...words(['clearChat']), 'clear chat', 'clear conversation', '清除對話'],
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
    help: ['help', '幫助', '説明', 'ayuda', 'aide', 'مساعدة', 'সাহায্য', 'помощь', 'ajuda', 'مدد'],
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
      t(curLang, 'winTitle'), t(curLang, 'clearAll'), t(curLang, 'map'), t(curLang, 'resync'), t(curLang, 'full'),
      t(curLang, 'wallet'), t(curLang, 'lpScribe'), t(curLang, 'settings')];
    return `SMate · ${bits.join(' · ')}`;
  }

  /* localized city names so zones can be spoken in any of the ten languages */
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
  const BYW = [' by ', ' × ', '乘', ' por ', ' par ', ' на ', ' في ', ' গুণ ', ' ضرب ', ' गुणा ', ' per '];
  const layoutIntent = (text) => {
    if (has(text, KW.grid16)) return 16;
    let s2 = ` ${latinDigits(text)} `;
    for (const w of BYW) s2 = s2.split(w).join(' x ');
    const m = s2.match(/(\d+)\s*x\s*(\d+)/);
    if (m) { const p = Number(m[1]) * Number(m[2]); return p <= 1 ? 1 : p <= 2 ? 2 : p <= 4 ? 4 : 16; }
    if (has(text, KW.quad)) return 4;
    if (has(text, KW.side)) return 2;
    if (has(text, KW.single)) return 1;
    return null;
  };

  /* every detectable intent runs, in one pass — compound sentences work */
  function run(raw) {
    const text = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (has(text, KW.help) || text === '?' || text === '؟' || text === '？') return helpText();
    const outs = [];
    const note = (v) => { if (v) outs.push(v); };

    /* language switch */
    const lg = findLang(text);
    if (lg && (has(text, KW.lang) || (LANG_NAMES[lg] || []).some((n) => text.includes(n.toLowerCase())) || text.includes(LANGS.find((l) => l.id === lg).name.toLowerCase()))) {
      note(setLang(lg) ? `${t(curLang, 'language')}: ${langOf(lg).name}` : null);
    }

    /* clear all: reset the clock window (from any page) */
    if (has(text, KW.clearAll)) {
      if (page === 'clock') { LIB.clearWindow(); note(t(curLang, 'done')); }
      else {
        try { localStorage.setItem('singhoah:pendingClear', '1'); } catch { /* ignore */ }
        note(act.nav('clock'));
      }
      return outs.length ? outs.join(' · ') : null;
    }

        /* window shape + zones, in the order spoken */
    const lay = layoutIntent(text);
    const zones = findAllZones(text);
    const zoneGate = has(text, KW.tz) || has(text, OPEN_VERBS) || zones.length > 1 || text.split(' ').length <= 3;
    if (lay != null || (zones.length && zoneGate)) {
      if (page === 'clock') {
        LIB.smateWindow(zoneGate ? zones : [], lay);
        const bits = [];
        if (lay != null) bits.push(lay === 16 ? t(curLang, 'grid16') : lay === 4 ? t(curLang, 'quad') : lay === 2 ? t(curLang, 'side') : t(curLang, 'single'));
        if (zoneGate && zones.length) bits.push(zones.map((z) => cityOf(z)).join(', '));
        note(`${t(curLang, 'winTitle')}: ${bits.join(' · ')}`);
      } else if (page === 'settings' && zones.length) {
        note(setTz(zones[0]) ? `${t(curLang, 'tzTitle')}: ${cityOf(zones[0])}` : null);
      } else {
        note(act.nav('clock'));
      }
    }

    /* assistant: what time is it in <City>? */
    if (has(text, KW.timeQ)) {
      const zq = findAllZones(text)[0];
      if (zq) {
        const tf = new Intl.DateTimeFormat(langOf(curLang).locale, { hour: '2-digit', minute: '2-digit', timeZone: zq });
        return t(curLang, 'timeIn').replace('{t}', tf.format(new Date())).replace('{c}', cityOf(zq));
      }
    }
    /* assistant: reminders */
    if (has(text, KW.remind) && num(text) != null) {
      const m = num(text);
      reminders.push({ at: Date.now() + m * 60000 });
      return t(curLang, 'remindSet').replace('{n}', String(m));
    }
    /* assistant: quick math (only when nothing else is meant) */
    if (lay == null && !zones.length) {
      const ms = latinDigits(text).replace(/×/g, '*').replace(/÷/g, '/').trim();
      if (/^[\d\s+\-*/().%]+$/.test(ms) && /\d/.test(ms) && /[+\-*/%]/.test(ms)) {
        const v = safeMath(ms);
        if (v != null) return String(Math.round(v * 10000) / 10000);
      }
    }
    /* assistant: clear the conversation */
    if (has(text, KW.clearChat)) {
      msgs.textContent = '';
      LOG.length = 0;
      saveLog();
      say(t(curLang, 'smateHi'));
      addChips();
      return t(curLang, 'done');
    }
        /* timer */
    if (has(text, KW.timer) && num(text) != null) note(act.timerSet(num(text)));
    else if (has(text, KW.timer) && (has(text, KW.start) || has(text, KW.pause) || has(text, KW.resume) || has(text, KW.reset))) note(act.timerCtl(text));
    else if (has(text, KW.timer) && page === 'clock') note(act.timerCtl(text + ' start'));
    /* stopwatch */
    if (has(text, KW.stopwatch)) note(act.stopwatch(text));
    /* display mode */
    if (has(text, KW.analog) || has(text, KW.digital)) {
      const b = $('btnMode');
      if (b) { const wantAnalog = has(text, KW.analog); const isAnalog = b.getAttribute('aria-pressed') === 'true'; if (wantAnalog !== isAnalog) b.click(); note(t(curLang, 'done')); }
    }
    /* resync / full / map / theme */
    if (has(text, KW.resync)) note(click($('btnSync')) ? t(curLang, 'done') : null);
    if (has(text, KW.full)) note(click($('btnFull')) ? t(curLang, 'done') : null);
    if (has(text, KW.map)) note(click($('btnMap')) ? t(curLang, 'done') : null);
    if (has(text, KW.night) || has(text, KW.light)) {
      const b = $('btnNight');
      if (b) { const dark = document.documentElement.classList.contains('dark'); const wantDark = has(text, KW.night); if (wantDark !== dark) b.click(); note(t(curLang, 'done')); }
    }
    /* wallet — the balance answers on every page, straight from the ledger */
    if (has(text, KW.income) && num(text) != null) note(act.walletAdd(text, 'in'));
    if (has(text, KW.expense) && num(text) != null) note(act.walletAdd(text, 'out'));
    if (has(text, KW.balance)) {
      if (page === 'wallet') {
        note($('walBal').textContent);
      } else {
        let seed = null;
        try { seed = JSON.parse(localStorage.getItem('singhoah:wallet') || 'null'); } catch { /* ignore */ }
        const tx = (seed && Array.isArray(seed.tx)) ? seed.tx : [];
        const bal = LIB.walBalance(tx);
        const cur = (seed && seed.cur) || 'USD';
        const sym = LIB.curSymbol(cur);
        note(`${t(curLang, 'walBalance')}: ${sym}${bal.toLocaleString(langOf(curLang).locale, { minimumFractionDigits: 2 })}`);
      }
    }
    if (page === 'wallet') {
      if (has(text, KW.reports)) note(click($('walTabR')) ? t(curLang, 'done') : null);
      if (has(text, KW.days)) note(click($('walTabD')) ? t(curLang, 'done') : null);
      const cur = findCurrency(text);
      if (cur && (has(text, KW.currency) || /\b[a-z]{3}\b/.test(text))) note(act.walletCur(cur));
    }
    /* scribe */
    if (page === 'scribe' && (has(text, KW.start) || has(text, KW.pause))) note(act.scribeCtl(text));
    /* navigation last — it leaves the page */
    for (const [where, keys] of [['wallet', KW.wallet], ['settings', KW.settings], ['scribe', KW.scribe], ['launch', KW.launch], ['clock', KW.clock]]) {
      if (has(text, keys)) { note(act.nav(where)); break; }
    }
    return outs.length ? outs.join(' · ') : null;
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
      let out = run(raw);
      if (!out && aiState === 'on' && aiEngine) {
        try {
          const r = await askAI(raw);
          if (/^\s*CMD:/i.test(r)) out = run(r.replace(/^\s*CMD:/i, '').trim());
          else if (r) out = r;
        } catch { /* the offline brain stays the fallback */ }
      }
      if (dots.isConnected) dots.remove();
      say(out || t(curLang, 'smateUnknown'));
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
      input.value = vfinal + interim;
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

  /* --------- on-device AI (WebLLM): fuzzy commands + light questions -------
     Free, serverless, private: a small open model runs in the browser on
     WebGPU, cached in IndexedDB after the first download. The deterministic
     interpreter always gets first crack; the model only sees what it misses,
     and either translates it into a canonical command or answers outright. */
  const aiBtn = $('smateAI');
  let aiEngine = null, aiState = 'off'; /* off | loading | on | err */
  const AI_MODELS = ['Qwen2.5-0.5B-Instruct-q4f16_1', 'SmolLM2-360M-Instruct-q4f16_1', 'Qwen2.5-0.5B-Instruct-q4f32_1'];
  const aiUI = () => {
    aiBtn.setAttribute('aria-pressed', String(aiState === 'on'));
    aiBtn.classList.toggle('loading', aiState === 'loading');
    aiBtn.classList.toggle('err', aiState === 'err');
  };
  async function aiInit() {
    if (aiState === 'loading') return;
    aiState = 'loading';
    aiUI();
    try {
      if (globalThis.__SMATE_AI_ENGINE) {
        aiEngine = globalThis.__SMATE_AI_ENGINE; /* test/extension hook */
      } else {
        const mod = await import('https://esm.run/@mlc-ai/web-llm');
        let lastErr = null;
        for (const id of AI_MODELS) {
          try {
            aiEngine = await mod.CreateMLCEngine(id, {
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
      }
      aiState = 'on';
      try { localStorage.setItem('singhoah:smateAI', '1'); } catch { /* ignore */ }
    } catch {
      aiState = 'err';
      aiEngine = null;
      try { localStorage.removeItem('singhoah:smateAI'); } catch { /* ignore */ }
    }
    aiUI();
    setStatus('smateOnline');
  }
  aiBtn.addEventListener('click', () => { if (aiState === 'on') { aiState = 'off'; aiEngine = null; aiUI(); try { localStorage.removeItem('singhoah:smateAI'); } catch { /* ignore */ } setStatus('smateOnline'); } else aiInit(); });
  try { if (localStorage.getItem('singhoah:smateAI') === '1') aiInit(); } catch { /* ignore */ }

  const AI_SYS = [
    'You are SMate, the assistant inside a world-clock web app.',
    'If the user wants the app to DO something, reply exactly: CMD: <command>',
    'using this grammar (combine freely with commas):',
    'timer <n> | timer pause|resume|reset | stopwatch | stopwatch pause|resume|reset |',
    'zone <City>[, <City>...] [in single|side by side|2 by 2|4 by 4 window] |',
    'single | side by side | 2 by 2 | 4 by 4 | analog | digital | night shift | light mode |',
    're-sync | full screen | map | language <name> | open wallet|settings|scribe|launchpad|clock |',
    'add <n> income|expense | currency <CODE> | clear all | help.',
    'Otherwise answer the user briefly and kindly, in the language they used.',
  ].join(' ');
  async function askAI(raw) {
    if (typeof aiEngine.chat === 'function' && !aiEngine.chat.completions) return String(await aiEngine.chat(raw));
    const r = await aiEngine.chat.completions.create({
      messages: [{ role: 'system', content: AI_SYS }, { role: 'user', content: raw }],
      max_tokens: 180,
      temperature: 0.2,
    });
    return String(r.choices[0].message.content || '').trim();
  }
})();
