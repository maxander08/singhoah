/* SMate — the Singho assistant. A floating chat that understands commands
   typed in any of the fifteen Singho languages and drives the page through its
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
    timeQ: ['what time', 'time in', 'current time', 'how late', '幾點', '几点', 'क्या बजा', 'कितने बजे', 'qué hora', 'hora en', 'quelle heure', 'heure à', 'كم الساعة', 'কটা বাজে', 'который час', 'сколько времени', 'время в', 'que horas', 'hora em', 'کتنا بجہ', 'che ore', 'ora a', 'jam berapa', 'pukul berapa', '몇 시', '지금 몇', '何時', 'いま何時', 'pukul berapa'],
    remind: ['remind', 'reminder', '提醒', 'याद दिला', 'recuérdame', 'recuerdame', 'rappelle', 'ذكرني', 'মনে করিয়ে', 'напомни', 'lembre', 'یاد دہانی', 'ricordami', 'ingatkan', '알림', '리마인드', '知らせ', 'erinner mich', 'erinnere', 'przypomnij', 'mind mig om', 'minn meg på', 'påminn mig', 'muistuta', 'podseti me', 'herinner me', 'υπενθύμισέ'],
    clearChat: [...words(['clearChat']), 'clear chat', 'clear conversation', '清除對話'],
    remove: ['remove', 'delete', 'get rid', '刪除', '删除', 'हटा', 'borra', 'elimina', 'supprime', 'احذف', 'মোছ', 'удали', 'remova', 'exclua', 'ہٹا', 'مٹا', 'rimuovi', 'hapus', '삭제', '削除', 'padam', 'entferne', 'lösche', 'usuń', 'fjern', 'slet', 'slett', 'ta bort', 'radera', 'poista', 'ukloni', 'obriši', 'verwijder', 'διάγραψε', 'αφαίρεσε'],
    restart: ['restart', 'start over', 'begin again', '重新開始', 'फिर से शुरू', 'reinicia', 'recommence', 'আবার শুরু', 'перезапусти', 'reinicie', 'دوبارہ شروع', 'riavvia', 'mulai ulang', '다시 시작', '最初から', 'mula semula', 'starte neu', 'uruchom ponownie', 'genstart', 'start på nytt', 'starta om', 'käynnistä uudelleen', 'pokreni ponovo', 'restartuj', 'herstart', 'ξεκίνα ξανά'],
    undo: ['undo', 'पूर्ववत', 'deshaz', 'annule', 'تراجع', 'আনডু', 'отмени', 'desfaça', 'annulla', 'urungkan', '실행 취소', '元に戻す', 'buat asal', 'rückgängig', 'cofnij', 'fortryd', 'angre', 'ångra', 'kumoa', 'opozovi', 'ongedaan', 'αναίρεσε'],
    redo: ['redo', 'पुनः करें', 'rehaz', 'rétablis', 'ریڈو', 'রিডু', 'верни', 'refaça', 'ripeti', 'ulangi', '다시 실행', 'やり直す', 'buat semula', 'wiederhole', 'ponów', 'gentag', 'gjør om', 'gör om', 'tee uudelleen', 'ponovi', 'opnieuw', 'επανάλαβε'],
    print: ['print', '列印', '打印', 'छापें', 'imprime', 'اطبع', 'প্রিন্ট', 'печатай', 'imprima', 'پرنٹ', 'stampa', 'cetak', '인쇄', '印刷', 'cetak', 'drucke', 'drukuj', 'udskriv', 'skriv ut', 'tulosta', 'štampaj', 'druk af', 'print', 'εκτύπωσε'],
    copy: ['copy', '複製', 'कॉपी', 'copie', 'انسخ', 'কপি', 'копируй', 'کاپی', 'copia', 'salin', '복사', 'コピー', 'salin', 'kopiere', 'kopiuj', 'kopiér', 'kopier', 'kopiera', 'kopioi', 'kopiraj', 'kopieer', 'αντίγραψε'],
    download: ['download', '下載', 'डाउनलोड', 'télécharge', 'تحميل', 'ডাউনলোড', 'скачай', 'baixe', 'ڈاؤن لوڈ', 'scarica', 'unduh', '다운로드', 'ダウンロード', 'muat turun', 'lade herunter', 'pobierz', 'last ned', 'ladda ner', 'lataa', 'preuzmi', 'download', 'κατέβασε'],
    stamps: ['timestamp', 'stamps', '時間戳'],
    theme: ['theme', '主題', 'थीम', 'tema', 'thème', 'সময', 'থিম', 'теما', 'تھیم', 'tema', '테마', 'テーマ', 'thema', 'design', 'motyw', 'temat', 'teema', 'θέμα'],
    clearDoc: ['clear', 'wipe'],
    map: words(['map']),
    metro: ['metro', 'métro', 'subway', 'mrt', 'underground', 'u-bahn', '捷運', '捷運', '地铁', '地鐵', 'метро', 'مترو', 'میٹرو', 'মেট্রো', 'मेट्रो', '지하철', '地下鉄', 'รถไฟฟ้า', 'tàu điện'],
    sysTaipei: ['taipei', 'trtc', '台北', '臺北', '타이베이', 'ไทเป', 'ताइपे', 'تايبيه', 'تایپه', 'тайбэй', 'তাইপে'],
    sysKaohsiung: ['kaohsiung', 'krtc', '高雄', '가오슝', '카오슝'],
    sysTaichung: ['taichung', '台中', '臺中', '타이중', 'ไถจง'],
    sysTaoyuan: ['taoyuan', '桃園', '桃園', '桃园', '机场捷运', '機場捷運', '机场捷运', 'airport mrt', 'airport line', '타오위안', 'เถาหยวน'],
    zoomIn: ['zoom in', 'zoom closer', '放大', '放大', '拡大', 'acercar', 'más cerca', 'zoom avant', 'приблизь', 'укрупни', 'تكبير', 'ज़ूम इन', 'जूम इन', 'inzoomen', 'vergrößern', 'powiększ', 'ingrandisci', '확대', 'besarkan', 'μεγέθυνση'],
    zoomOut: ['zoom out', '縮小', '縮小', '縮小', 'alejar', 'dézoom', 'отдали', 'уменьши', 'تصغير', 'ज़ूम आउट', 'छोटा', 'uitzoomen', 'verkleinern', 'pomniejsz', 'rimpicciolisci', '축소', 'perkecil', 'σμίκρυνση'],
    zoomReset: ['reset zoom', 'zoom reset', 'show all', 'overview', 'fit', '全部顯示', '顯示全部', '全圖', '全图', '重設縮放', '重置缩放', 'restablecer', 'réinitialiser', 'сброс масштаба', 'сбросить масштаб', 'रीसेट ज़ूम', 'zoom zurücksetzen', 'alle anzeigen', '전체 보기', '全体表示', 'tampilkan semua'],
    fareW: ['fare', '票價', '票价', '요금', '운임', '運賃', 'tarifa', 'tarif', 'tariffa', 'prix', 'preis', 'цена', 'тариф', 'سعر', 'قیمت', 'कीमत', 'দাম', 'harga', 'how much', 'cuánto', 'cuanto', 'combien', 'сколько', 'كم', 'कितना', 'কত', 'berapa', '얼마', 'いくら', '多少'],
    resync: [...words(['resync']), 'sync'],
    full: words(['full']),
    night: [...words(['night']), 'dark'],
    light: [...words(['light']), 'day'],
    lang: [...words(['language']), 'language', 'lang'],
    tz: [...words(['tzTitle', 'homeCity']), 'zone', 'timezone', 'tz', '時區'],
    wallet: [...words(['wallet']), 'singhowallet'],
    clock: [...words(['lpClock']), 'clock', 'singhoclock'],
    settings: [...words(['settings']), 'singhosettings'],
    scribe: [...words(['lpScribe']), 'scribe', 'singhoscribe'],
    launch: words(['launchpad']),
    expense: words(['walExpense']),
    income: words(['walIncome']),
    balance: words(['walBalance']),
    days: words(['walDays']),
    reports: words(['walReports']),
    currency: [...words(['currency']), 'currency'],
    add: [...words(['walAdd']), 'add', 'add'],
    help: ['help', '幫助', '説明', 'ayuda', 'aide', 'مساعدة', 'সাহায্য', 'помощь', 'ajuda', 'مدد'],
    swap: [...words(['mSwap']), 'swap', 'interchange', '交換', ' intercambiar', 'échanger', 'tauschen', 'wissel', '스왑', '스왑', 'สลับ', 'hoán đổi'],
    mclear: [...words(['mClear']), 'clear fare', 'clear selection'],
    card: ['card', 'ic card', 'easycard', 'ipay', '票卡', '卡片', '悠遊卡', '一卡通', 'بطاقة', 'карта', 'cartão', 'tarjeta', 'carte', 'कार्ड', 'কার্ড', 'کارت', '카드', 'カード', 'บัตร', 'karte', 'karta', 'kaart', 'kort', 'κάρτα'],
    find: [...words(['scribeFind']), 'find', 'search', '尋找', '検索', 'buscar', 'rechercher', 'suchen', 'zoeken', '찾기', 'بحث', 'खोज', 'поиск', 'procurar', 'cari'],
    welcome: ['welcome', '歡迎', 'bienvenue', 'bienvenido', 'willkommen', 'welkom', 'benvenuto', 'ようこそ', '환영', 'مرحبا', 'स्वागत', 'স্বাগত', 'خوش آمدید', 'добро пожаловать', 'bem-vindo', 'καλώς ήρθατε', 'velkommen', 'välkommen', 'tervetuloa', 'dobrodošli', 'witaj'],
    resetData: ['reset data', 'factory reset', 'wipe data', '清除資料', '重置資料', 'borrar datos', 'réinitialiser les données', 'сбросить данные', 'reset de fábrica', 'dados de fábrica', 'dati di fabbrica', 'Daten zurücksetzen', 'gegevens wissen', '데이터 초기화', 'データをリセット'],
    entry: ['entry', 'entries', 'transaction', 'record', '項目', '記錄', '기록', 'registro', 'entrée', 'запись', 'eintrag', 'registro', 'entri', 'καταχώρηση', 'prone'],
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
  /* latin keywords match on word boundaries — "karta" (map in several
     languages) must never fire inside "Jakarta"; scripts without word
     spaces (CJK etc.) keep substring matching, where partial matches are
     how those languages work */
  const LATINISH = /^[a-z0-9\u00C0-\u024F\u1E00-\u1EFF'\u2019 -]+$/;
  const KW_RX = new Map();
  const has = (text, list) => list.some((rawW) => {
    const w = String(rawW).trim().toLowerCase();
    if (!w) return false;
    if (!LATINISH.test(w)) return text.includes(w);
    let rx = KW_RX.get(w);
    if (!rx) {
      rx = new RegExp('(?:^|[^\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^\\p{L}\\p{N}])', 'u');
      KW_RX.set(w, rx);
    }
    return rx.test(text);
  });
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
      const map = { wallet: 'wallet.html', clock: 'index.html', settings: 'settings.html', scribe: 'scribe.html', launch: 'launch.html', metro: 'metro.html' };
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
      t(curLang, 'mFare'),
      t(curLang, 'wallet'), t(curLang, 'lpScribe'), t(curLang, 'settings')];
    if (page === 'metro') bits.push(t(curLang, 'mTRTC'), t(curLang, 'mKS'), t(curLang, 'mTC'), t(curLang, 'mTY'), t(curLang, 'mFare'), t(curLang, 'mSwap'), t(curLang, 'mClear'), t(curLang, 'mCard'));
    if (page === 'launch') bits.push(t(curLang, 'lpWelcomeT'));
    return `SMate · ${bits.join(' · ')}`;
  }

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
    if (a.sys !== b.sys) return `${t(curLang, 'mFare')}: ${nm(a.id)} → ${nm(b.id)} · ${t(curLang, 'fareXsys')}`;
    const r = F.route(a.id, b.id);
    if (!r) return null;
    const f = F.fare(a.sys, a.id, b.id, r);
    if (f == null) return null;
    return `${t(curLang, 'mFare')}: ${nm(a.id)} → ${nm(b.id)} · NT$${f} · ${r.stops + 1} ${t(curLang, 'mStations')} · ${r.transfers} ${t(curLang, 'mTransfers')}`;
  }

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
  const findStations = (tl, sysNow) => {
    const hits = [];
    for (const s of stAlias()) {
      if (s.sys !== sysNow) continue;
      const i = Math.min(tl.includes(s.en) ? tl.indexOf(s.en) : 1e9, s.zh && tl.includes(s.zh) ? tl.indexOf(s.zh) : 1e9);
      if (i < 1e9 && !hits.some((h) => h.i === i)) hits.push({ i, id: s.id });
    }
    hits.sort((a, b) => a.i - b.i);
    return hits.map((h) => h.id);
  };

  /* every detectable intent runs, in one pass — compound sentences work */
  function run(raw) {
    const text = LIB.brandFix(raw).toLowerCase();
    if (/^(?:hey |hi |hello |ok |okay )?smate[!?.]*$/.test(text)) return helpText();
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

    /* metro (SinghoMetro page): switch system, zoom, look up fares —
       works in every tab and at every zoom level, in any language */
    if (page === 'metro' && globalThis.__METRO) {
      const M = globalThis.__METRO;
      const tl = text.toLowerCase();
      const wantSys = has(tl, KW.sysTaipei) ? 'TRTC'
        : has(tl, KW.sysKaohsiung) ? 'KS'
        : has(tl, KW.sysTaichung) ? 'TC'
        : has(tl, KW.sysTaoyuan) ? 'TY' : null;
      if (wantSys && M.setSys(wantSys)) note(`${t(curLang, 'done')}: ${t(curLang, 'm' + wantSys)}`);
      if (has(tl, KW.swap)) { click($('mSwap')); note(t(curLang, 'done')); }
      if (has(tl, KW.mclear) && !has(tl, ['chat', 'conversation', '對話', '对话'])) { click($('mClear')); note(t(curLang, 'done')); }
      if (has(tl, KW.card)) {
        click($('mCard'));
        const n = num(text);
        if (n != null) { const b = $('mCardBal'); if (b) { b.value = String(n); b.dispatchEvent(new Event('change', { bubbles: true })); } }
        note(t(curLang, 'done'));
      }
      if (has(tl, KW.zoomIn)) { M.zoomBy(1.7); note(t(curLang, 'done')); }
      else if (has(tl, KW.zoomOut)) { M.zoomBy(1 / 1.7); note(t(curLang, 'done')); }
      else if (has(tl, KW.zoomReset)) { M.resetView(); note(t(curLang, 'done')); }
      const hits = findStations(tl, M.sys);
      if (hits.length >= 2) {
        M.pick(hits[0]); M.pick(hits[1]);
        const r = M.route(hits[0], hits[1]);
        if (r) {
          const f = M.fare(M.sys, hits[0], hits[1], r);
          const nm = (id) => `${M.ST[id].en} ${M.ST[id].zh}`;
          note(`${t(curLang, 'mFare')}: ${nm(hits[0])} → ${nm(hits[1])} · NT$${f} · ${r.stops + 1} ${t(curLang, 'mStations')} · ${r.transfers} ${t(curLang, 'mTransfers')}`);
        }
      } else if (hits.length === 1) M.pick(hits[0]);
    } else if (page !== 'metro' && has(text.toLowerCase(), KW.metro) && has(text.toLowerCase(), OPEN_VERBS)) note(act.nav('metro'));

        /* window shape + zones, in the order spoken */
    const lay = layoutIntent(text);
    const zones = findAllZones(text);
    /* on the metro page city names belong to station/fare talk — only an
       explicit timezone/clock phrase may leave for the clock window */
    const zoneGate = page === 'metro'
      ? (has(text, KW.tz) || has(text, KW.clock))
      : (has(text, KW.tz) || has(text, OPEN_VERBS) || zones.length > 1 || text.split(' ').length <= 3);
    /* a fare/station question is station talk, not window talk — let the
       fare engine answer instead of reshaping the clock window */
    const fareIntent = has(text, KW.fareW) || has(text, ['station', '站']);
    if (!fareIntent && !has(text, KW.remove) && (lay != null || (zones.length && zoneGate))) {
      if (page === 'clock') {
        LIB.smateWindow(zoneGate ? zones : [], lay);
        const bits = [];
        if (lay != null) bits.push(lay === 16 ? t(curLang, 'grid16') : lay === 4 ? t(curLang, 'quad') : lay === 2 ? t(curLang, 'side') : t(curLang, 'single'));
        if (zoneGate && zones.length) bits.push(zones.map((z) => cityOf(z)).join(', '));
        note(`${t(curLang, 'winTitle')}: ${bits.join(' · ')}`);
      } else if (page === 'settings' && zones.length) {
        note(setTz(zones[0]) ? `${t(curLang, 'tzTitle')}: ${cityOf(zones[0])}` : null);
      } else {
        try { localStorage.setItem('singhoah:pendingWin', JSON.stringify({ z: zones, l: lay })); } catch { /* ignore */ }
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
      clearChatNow();
      return t(curLang, 'done');
    }
        /* pane surgery: delete / restart timers & stopwatches, remove zones */
    const wantTimer = has(text, KW.timer);
    const wantStop = has(text, KW.stopwatch);
    if (page === 'clock' && has(text, KW.remove) && (wantTimer || wantStop)) {
      note(LIB.smateRemove(wantTimer ? 'timer' : 'stop') ? t(curLang, 'done') : null);
    } else if (page === 'clock' && has(text, KW.restart) && (wantTimer || wantStop)) {
      note(LIB.smateRestart(wantTimer ? 'timer' : 'stop') ? t(curLang, 'done') : null);
    } else if (page === 'clock' && has(text, KW.remove)) {
      const z = findAllZones(text)[0];
      if (z) note(LIB.smateRemove(z) ? t(curLang, 'done') : null);
    }
    /* the Scribe toolbar, by voice or text */
    if (page === 'scribe') {
      if (has(text, KW.undo)) note(click($('scrUndo')) ? t(curLang, 'done') : null);
      if (has(text, KW.redo)) note(click($('scrRedo')) ? t(curLang, 'done') : null);
      if (has(text, KW.copy)) note(click($('scrCopy')) ? t(curLang, 'done') : null);
      if (has(text, KW.download)) note(click($('scrDl')) ? t(curLang, 'done') : null);
      if (has(text, KW.print)) note(click($('scrPrint')) ? t(curLang, 'done') : null);
      if (has(text, KW.stamps)) note(click($('scrStamps')) ? t(curLang, 'done') : null);
      if (has(text, KW.find)) note(click($('scrFind')) ? t(curLang, 'done') : null);
      if (!has(text, KW.clearAll) && !has(text, KW.clearChat) && has(text, KW.clearDoc)) {
        const oc = window.confirm; window.confirm = () => true;
        note(click($('scrClear')) ? t(curLang, 'done') : null);
        window.confirm = oc;
      }
    }
    /* print anywhere else, theme, IP locator */
    if (has(text, KW.print) && page !== 'scribe') { window.print(); note(t(curLang, 'done')); }
    if (has(text, KW.theme)) {
      if (page === 'settings') note(click($('btnTheme')) ? t(curLang, 'done') : null);
      else note(act.nav('settings'));
    }
    if (page === 'clock' && /\bip\b/.test(text)) note(click($('btnIp')) ? t(curLang, 'done') : null);
    if (page === 'settings' && has(text, KW.resetData)) {
      const oc = window.confirm; window.confirm = () => true;
      note(click($('btnReset')) ? t(curLang, 'done') : null);
      window.confirm = oc;
    }
    if (has(text, KW.welcome)) {
      if (page === 'launch') { document.dispatchEvent(new CustomEvent('singhoah:lpWelcome')); note(t(curLang, 'done')); }
      else note(act.nav('launch'));
    }
        /* timer */
    if (has(text, KW.timer) && num(text) != null) note(act.timerSet(num(text)));
    else if (!has(text, KW.remove) && !has(text, KW.restart) && has(text, KW.timer) && (has(text, KW.start) || has(text, KW.pause) || has(text, KW.resume) || has(text, KW.reset))) note(act.timerCtl(text));
    else if (!has(text, KW.remove) && !has(text, KW.restart) && has(text, KW.timer) && page === 'clock') note(act.timerCtl(text + ' start'));
    /* stopwatch */
    if (!has(text, KW.remove) && !has(text, KW.restart) && has(text, KW.stopwatch)) note(act.stopwatch(text));
    /* display mode */
    if (has(text, KW.analog) || has(text, KW.digital)) {
      const b = $('btnMode');
      if (b) { const wantAnalog = has(text, KW.analog); const isAnalog = b.getAttribute('aria-pressed') === 'true'; if (wantAnalog !== isAnalog) b.click(); note(t(curLang, 'done')); }
    }
    /* resync / full / map / theme */
    if (has(text, KW.resync)) note(click($('btnSync')) ? t(curLang, 'done') : null);
    if (has(text, KW.full)) note(click($('btnFull')) ? t(curLang, 'done') : null);
    if (has(text, KW.map)) {
      note(click($('btnMap')) ? t(curLang, 'done') : null);
      LIB.mapGoCity(text);
    }
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
      if (has(text, KW.remove) && (has(text, KW.entry) || has(text, KW.expense) || has(text, KW.income))) {
        const xs = document.querySelectorAll('.wal-x');
        if (xs.length) { xs[xs.length - 1].click(); note(t(curLang, 'done')); }
      }
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
      let out = null;
      try { out = run(raw); } catch { out = null; }
      if (!out && (has(raw.toLowerCase(), KW.fareW) || has(raw.toLowerCase(), ['station', '站']))) {
        try { out = await fareAnywhere(raw); } catch { /* offline interpreter stays the fallback */ }
      }
      if (!out && aiPref !== 'off') {
        if (aiState === 'on' && aiEngine) {
          setStatusText('AI …');
          try {
            const r = await Promise.race([
              askAI(raw + walletDigest(raw)),
              new Promise((_, rej) => setTimeout(() => rej(new Error('smate-ai-slow')), AI_TIMEOUT)),
            ]);
            if (/^\s*CMD:/i.test(r)) { try { out = run(r.replace(/^\s*CMD:/i, '').trim()); } catch { out = null; } }
            else if (r) out = r;
          } catch { /* the offline brain stays the fallback */ }
        } else {
          let can = !!globalThis.__SMATE_AI_ENGINE;
          if (!can && navigator.gpu) { try { can = !!(await navigator.gpu.requestAdapter()); } catch { can = false; } }
          if (!can) {
            out = t(curLang, 'aiNoGpu');
          } else if (aiState === 'err') {
            /* the model failed to load (blocked CDN, download error, …):
               never tease with "waking up" again — the offline brain answers
               and the AI chip shows its error state until the user retries */
            out = null;
          } else {
            aiInit();            /* first fuzzy message wakes the model */
            out = t(curLang, 'aiLoad');
          }
        }
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

  /* --------- on-device AI (WebLLM): fuzzy commands + light questions -------
     Free, serverless, private: a small open model runs in the browser on
     WebGPU, cached in IndexedDB after the first download. The deterministic
     interpreter always gets first crack; the model only sees what it misses,
     and either translates it into a canonical command or answers outright. */
  const aiBtn = $('smateAI');
  let aiEngine = null, aiState = 'off'; /* off | loading | on | err */
  /* on-demand: the offline interpreter answers instantly for every command;
     the model wakes only when the AI chip is tapped. Once enabled it is
     cached in the browser, so from the second visit on it is ready at once. */
  let aiPref = 'off';
  try { if (localStorage.getItem('singhoah:smateAI') === 'on') aiPref = 'on'; } catch { /* ignore */ }
  const AI_TIMEOUT = Number(globalThis.__SMATE_AI_TIMEOUT || 20000);
  const AI_MODELS = ['Qwen2.5-0.5B-Instruct-q4f16_1', 'SmolLM2-360M-Instruct-q4f16_1', 'Qwen2.5-0.5B-Instruct-q4f32_1'];
  const aiUI = () => {
    aiBtn.setAttribute('aria-pressed', String(aiPref === 'on'));
    aiBtn.classList.toggle('loading', aiState === 'loading');
    aiBtn.classList.toggle('err', aiState === 'err');
  };
  aiUI();                        /* default-ON chip reflects the pref immediately */

  async function aiInit() {
    if (aiState === 'loading') return;
    aiState = 'loading';
    aiUI();
    try {
      if (globalThis.__SMATE_AI_ENGINE) {
        aiEngine = globalThis.__SMATE_AI_ENGINE; /* test/extension hook */
      } else {
        const mod = await import('https://esm.run/@mlc-ai/web-llm');
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
      }
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
      aiPref = 'off'; aiState = 'off'; aiEngine = null;
      try { localStorage.removeItem('singhoah:smateAI'); } catch { /* ignore */ }
      aiUI(); setStatus('smateOnline');
    } else {
      aiPref = 'on'; /* on demand: start right away, usable as soon as loaded */
      try { localStorage.setItem('singhoah:smateAI', 'on'); } catch { /* ignore */ }
      aiUI(); aiInit();
    }
  });

  const MONEY = /spend|spent|expense|income|balance|transaction|saving|gasto|gast|ingreso|dépense|dépens|revenu|solde|ख़र्च|आय|بकाيا|خرچ|آمدنی|ব্যয়|আয়|трат|доход|расход|despesa|receita|saldo|اخراجی|آمدنی/;
  function walletDigest(raw) {
    if (!MONEY.test(raw)) return '';
    try {
      const d = JSON.parse(localStorage.getItem('singhoah:wallet') || 'null');
      if (!d || !Array.isArray(d.tx)) return '';
      const rows = d.tx.slice(-15).map((x) => `${x.date} ${x.type === 'in' ? '+' : '-'}${x.amt} ${x.note || ''}`);
      return ` [WALLET ${d.cur || ''} balance ${LIB.walBalance(d.tx)}; recent rows: ${rows.join(' | ')}]`;
    } catch { return ''; }
  }
  const AI_SYS = [
    'You are SMate, the AI that fully drives a world-clock web app.',
    'If the user wants the app to DO something, reply exactly: CMD: <command>',
    'using this grammar (combine freely with commas):',
    'timer <n> | timer pause|resume|reset | stopwatch | stopwatch pause|resume|reset |',
    'zone <City>[, <City>...] [in single|side by side|2 by 2|4 by 4 window] |',
    'single | side by side | 2 by 2 | 4 by 4 | analog | digital | night shift | light mode |',
    're-sync | full screen | map | language <name> | open wallet|settings|scribe|launchpad|clock |',
    'open SinghoClock|SinghoWallet|SinghoScribe|SinghoSettings | add <n> income|expense | currency <CODE> | clear all | delete timer|stopwatch | restart timer|stopwatch | remove <City> | undo | redo | copy | download | print | timestamps | theme | ip | map <City> | days | reports | clear chat | remind <n> | swap | clear fare | card | card balance <n> | delete last entry | find | welcome | reset data | help.',
    'If a [WALLET ...] block is attached, answer money questions from it exactly (sum the rows yourself).',
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
